import fs from 'node:fs';
import path from 'node:path';
import saveCoordinator from './save-coordinator-v1.cjs';
import { canonicalSerialize, hashCanonicalValue } from './browser-safe-hash.mjs';
import { verifyPulseAggregateReceipt } from './pulse-policy-codec-v1.mjs';

const { durableSaveTransaction } = saveCoordinator;

export const PULSE_LEDGER_STAGE_ID = 'WP-801_PULSE_LEDGER';
export const PULSE_LEDGER_ENTRY_SCHEMA_VERSION = 'yalken.r24.pulseLedgerEntry.v1';
export const PULSE_LEDGER_INTENT_SCHEMA_VERSION = 'yalken.r24.pulseLedgerIntentEvent.v1';
export const PULSE_LEDGER_OUTBOX_SCHEMA_VERSION = 'yalken.r24.pulseLedgerOutboxEvent.v1';
export const PULSE_LEDGER_DEFAULT_MAX_ENTRIES = 4096;
export const PULSE_LEDGER_MAX_FILE_BYTES = 16 * 1024 * 1024;
export const PULSE_LEDGER_ZERO_DIGEST = '0'.repeat(64);

const LEDGER_BASENAME = 'pulse-ledger.v1.jsonl';
const INTENT_BASENAME = 'pulse-ledger-intents.v1.jsonl';
const OUTBOX_BASENAME = 'pulse-ledger-outbox.v1.jsonl';
const MUTATION_TAILS = new Map();
const HEX_DIGEST = /^[0-9a-f]{64}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u;

export class PulseLedgerError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
  }
}

const fail = (code, detail = '') => { throw new PulseLedgerError(code, detail); };
const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const exactKeys = (value, expected, code) => {
  if (!isPlainObject(value)) fail(code, 'object');
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code, 'fields');
};
const ordinal = (value, code) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
};
const digest = (value, code) => {
  if (typeof value !== 'string' || !HEX_DIGEST.test(value)) fail(code);
  return value;
};
const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};
const cloneFrozen = (value) => deepFreeze(JSON.parse(JSON.stringify(value)));
const serializeJsonl = (records) => records.length === 0 ? '' : `${records.map(canonicalSerialize).join('\n')}\n`;

function normalizeTransactionDigest(idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_KEY.test(idempotencyKey)) fail('E_WP801_IDEMPOTENCY_KEY');
  return hashCanonicalValue({ idempotencyKey });
}

function entryPayload(entry) {
  return {
    schemaVersion: entry.schemaVersion,
    sequence: entry.sequence,
    previousEntryDigest: entry.previousEntryDigest,
    transactionDigest: entry.transactionDigest,
    receiptDigest: entry.receiptDigest,
    receipt: entry.receipt,
  };
}

function createLedgerEntry({ sequence, previousEntryDigest, transactionDigest, receipt }) {
  const verified = verifyPulseAggregateReceipt(receipt);
  const entry = {
    schemaVersion: PULSE_LEDGER_ENTRY_SCHEMA_VERSION,
    sequence,
    previousEntryDigest,
    transactionDigest,
    receiptDigest: verified.payloadDigest,
    receipt: verified,
  };
  return { ...entry, entryDigest: hashCanonicalValue(entry) };
}

function validateLedger(records, maxEntries) {
  if (records.length > maxEntries) fail('E_WP801_LEDGER_CAPACITY');
  const transactions = new Set();
  let previous = PULSE_LEDGER_ZERO_DIGEST;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    exactKeys(record, ['entryDigest', 'previousEntryDigest', 'receipt', 'receiptDigest', 'schemaVersion', 'sequence', 'transactionDigest'], 'E_WP801_LEDGER_CORRUPT');
    if (record.schemaVersion !== PULSE_LEDGER_ENTRY_SCHEMA_VERSION || record.sequence !== index + 1) fail('E_WP801_LEDGER_CORRUPT', 'sequence');
    if (digest(record.previousEntryDigest, 'E_WP801_LEDGER_CORRUPT') !== previous) fail('E_WP801_LEDGER_CHAIN');
    digest(record.transactionDigest, 'E_WP801_LEDGER_CORRUPT');
    if (transactions.has(record.transactionDigest)) fail('E_WP801_LEDGER_DUPLICATE_TRANSACTION');
    transactions.add(record.transactionDigest);
    const receipt = verifyPulseAggregateReceipt(record.receipt);
    if (record.receiptDigest !== receipt.payloadDigest) fail('E_WP801_LEDGER_RECEIPT_DIGEST');
    digest(record.entryDigest, 'E_WP801_LEDGER_CORRUPT');
    if (hashCanonicalValue(entryPayload(record)) !== record.entryDigest) fail('E_WP801_LEDGER_ENTRY_DIGEST');
    previous = record.entryDigest;
  }
}

function validateIntentEvents(records) {
  const state = new Map();
  for (const record of records) {
    exactKeys(record, ['committedSequence', 'entryDigest', 'expectedSequence', 'phase', 'receipt', 'receiptDigest', 'schemaVersion', 'transactionDigest'], 'E_WP801_INTENT_LOG_CORRUPT');
    if (record.schemaVersion !== PULSE_LEDGER_INTENT_SCHEMA_VERSION) fail('E_WP801_INTENT_LOG_CORRUPT', 'schema');
    digest(record.transactionDigest, 'E_WP801_INTENT_LOG_CORRUPT');
    digest(record.receiptDigest, 'E_WP801_INTENT_LOG_CORRUPT');
    digest(record.entryDigest, 'E_WP801_INTENT_LOG_CORRUPT');
    ordinal(record.expectedSequence, 'E_WP801_INTENT_LOG_CORRUPT');
    if (verifyPulseAggregateReceipt(record.receipt).payloadDigest !== record.receiptDigest) fail('E_WP801_INTENT_LOG_DIVERGENCE', 'receipt');
    const prior = state.get(record.transactionDigest);
    if (record.phase === 'ADMITTED') {
      if (prior || record.committedSequence !== null) fail('E_WP801_INTENT_LOG_CORRUPT', 'admission-order');
      state.set(record.transactionDigest, { admission: record, commit: null });
    } else if (record.phase === 'COMMITTED') {
      if (!prior || prior.commit || record.committedSequence !== record.expectedSequence + 1) fail('E_WP801_INTENT_LOG_CORRUPT', 'commit-order');
      for (const key of ['receiptDigest', 'entryDigest', 'expectedSequence']) if (record[key] !== prior.admission[key]) fail('E_WP801_INTENT_LOG_DIVERGENCE', key);
      prior.commit = record;
    } else fail('E_WP801_INTENT_LOG_CORRUPT', 'phase');
  }
  return state;
}

function validateOutboxEvents(records) {
  const state = new Map();
  for (const record of records) {
    exactKeys(record, ['entryDigest', 'phase', 'schemaVersion', 'transactionDigest'], 'E_WP801_OUTBOX_LOG_CORRUPT');
    if (record.schemaVersion !== PULSE_LEDGER_OUTBOX_SCHEMA_VERSION) fail('E_WP801_OUTBOX_LOG_CORRUPT', 'schema');
    digest(record.transactionDigest, 'E_WP801_OUTBOX_LOG_CORRUPT');
    digest(record.entryDigest, 'E_WP801_OUTBOX_LOG_CORRUPT');
    const prior = state.get(record.transactionDigest);
    if (record.phase === 'PENDING') {
      if (prior) fail('E_WP801_OUTBOX_LOG_CORRUPT', 'pending-order');
      state.set(record.transactionDigest, { pending: record, applied: null });
    } else if (record.phase === 'APPLIED') {
      if (!prior || prior.applied || prior.pending.entryDigest !== record.entryDigest) fail('E_WP801_OUTBOX_LOG_DIVERGENCE');
      prior.applied = record;
    } else fail('E_WP801_OUTBOX_LOG_CORRUPT', 'phase');
  }
  return state;
}

async function readJsonl(filePath, code, saveTransaction) {
  if (!fs.existsSync(filePath)) return [];
  const bytes = fs.readFileSync(filePath);
  if (bytes.length > PULSE_LEDGER_MAX_FILE_BYTES) fail(code, 'byte-budget');
  if (bytes.length === 0) return [];
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(code, 'utf8'); }
  const lines = text.split('\n');
  const records = [];
  let repaired = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === '') {
      if (index === lines.length - 1) continue;
      fail(code, 'empty-line');
    }
    let parsed;
    try { parsed = JSON.parse(line); } catch {
      if (index === lines.length - 1) { repaired = true; break; }
      fail(code, 'invalid-json');
    }
    if (canonicalSerialize(parsed) !== line) fail(code, 'noncanonical');
    records.push(parsed);
  }
  if (!text.endsWith('\n') && !repaired) fail(code, 'missing-final-lf');
  if (repaired) await saveTransaction({ filePath, content: serializeJsonl(records), revision: records.length });
  return records;
}

async function persist(filePath, records, saveTransaction) {
  const content = serializeJsonl(records);
  if (Buffer.byteLength(content, 'utf8') > PULSE_LEDGER_MAX_FILE_BYTES) fail('E_WP801_FILE_CAPACITY');
  await saveTransaction({ filePath, content, revision: records.length });
}

export async function openPulseLedger(directory, {
  saveTransaction = durableSaveTransaction,
  maxEntries = PULSE_LEDGER_DEFAULT_MAX_ENTRIES,
} = {}) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) fail('E_WP801_DIRECTORY_REQUIRED');
  if (typeof saveTransaction !== 'function') fail('E_WP801_SAVE_TRANSACTION_REQUIRED');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > PULSE_LEDGER_DEFAULT_MAX_ENTRIES) fail('E_WP801_MAX_ENTRIES');
  fs.mkdirSync(directory, { recursive: true });
  const directoryKey = fs.realpathSync(directory);
  const paths = Object.freeze({
    ledger: path.join(directoryKey, LEDGER_BASENAME),
    intents: path.join(directoryKey, INTENT_BASENAME),
    outbox: path.join(directoryKey, OUTBOX_BASENAME),
  });
  const state = { ledger: [], intents: [], outbox: [] };

  const refresh = async () => {
    const [ledger, intents, outbox] = await Promise.all([
      readJsonl(paths.ledger, 'E_WP801_LEDGER_CORRUPT', saveTransaction),
      readJsonl(paths.intents, 'E_WP801_INTENT_LOG_CORRUPT', saveTransaction),
      readJsonl(paths.outbox, 'E_WP801_OUTBOX_LOG_CORRUPT', saveTransaction),
    ]);
    validateLedger(ledger, maxEntries);
    const intentState = validateIntentEvents(intents);
    const outboxState = validateOutboxEvents(outbox);
    for (const entry of ledger) {
      const intent = intentState.get(entry.transactionDigest);
      if (!intent || intent.admission.entryDigest !== entry.entryDigest) fail('E_WP801_LEDGER_ORPHAN_ENTRY');
    }
    for (const [transactionDigest, outbox] of outboxState) {
      const intent = intentState.get(transactionDigest);
      if (!intent || intent.admission.entryDigest !== outbox.pending.entryDigest) fail('E_WP801_OUTBOX_ORPHAN');
    }
    for (const [transactionDigest, intent] of intentState) {
      const entry = ledger.find((item) => item.transactionDigest === transactionDigest);
      if (intent.commit && (!entry || entry.entryDigest !== intent.commit.entryDigest)) fail('E_WP801_COMMIT_WITHOUT_LEDGER');
      const effect = outboxState.get(transactionDigest);
      if (effect?.applied && (!intent.commit || !entry)) fail('E_WP801_APPLIED_WITHOUT_COMMIT');
    }
    state.ledger = ledger;
    state.intents = intents;
    state.outbox = outbox;
    return { intentState, outboxState };
  };

  const persistChannel = async (channel, next) => {
    try {
      await persist(paths[channel], next, saveTransaction);
      state[channel] = next;
    } catch (error) {
      try { await refresh(); } catch (reconcileError) {
        const wrapped = new PulseLedgerError('E_WP801_DURABLE_RECONCILIATION_FAILED', `${channel}:${reconcileError.code || reconcileError.message}`);
        wrapped.cause = reconcileError;
        wrapped.writeError = error;
        throw wrapped;
      }
      throw error;
    }
  };

  const appendIntentCommit = async (admission) => {
    const event = { ...admission, phase: 'COMMITTED', committedSequence: admission.expectedSequence + 1 };
    await persistChannel('intents', [...state.intents, event]);
  };
  const appendOutbox = async (admission, phase) => {
    const event = {
      schemaVersion: PULSE_LEDGER_OUTBOX_SCHEMA_VERSION,
      transactionDigest: admission.transactionDigest,
      entryDigest: admission.entryDigest,
      phase,
    };
    await persistChannel('outbox', [...state.outbox, event]);
  };

  const recover = async () => {
    let { intentState, outboxState } = await refresh();
    for (const [transactionDigest, intent] of intentState) {
      const admission = intent.admission;
      let entry = state.ledger.find((item) => item.transactionDigest === transactionDigest);
      let effect = outboxState.get(transactionDigest);
      if (!effect) {
        await appendOutbox(admission, 'PENDING');
        ({ intentState, outboxState } = await refresh());
        effect = outboxState.get(transactionDigest);
      }
      if (!entry) {
        if (state.ledger.length !== admission.expectedSequence) fail('E_WP801_RECOVERY_CAS_DIVERGENCE', transactionDigest);
        const previousEntryDigest = state.ledger.at(-1)?.entryDigest ?? PULSE_LEDGER_ZERO_DIGEST;
        const candidate = createLedgerEntry({ sequence: admission.expectedSequence + 1, previousEntryDigest, transactionDigest, receipt: admission.receipt });
        if (candidate.entryDigest !== admission.entryDigest || candidate.receiptDigest !== admission.receiptDigest) fail('E_WP801_RECOVERY_ENTRY_DIVERGENCE');
        await persistChannel('ledger', [...state.ledger, candidate]);
        entry = candidate;
      }
      if (!intent.commit) {
        await appendIntentCommit(admission);
        ({ intentState, outboxState } = await refresh());
      }
      effect = outboxState.get(transactionDigest);
      if (!effect?.applied) {
        await appendOutbox(admission, 'APPLIED');
        ({ intentState, outboxState } = await refresh());
      }
      if (entry.entryDigest !== admission.entryDigest) fail('E_WP801_RECOVERY_ENTRY_DIVERGENCE');
    }
  };

  const enqueue = (operation) => {
    const predecessor = MUTATION_TAILS.get(directoryKey) ?? Promise.resolve();
    const result = predecessor.then(async () => {
      await recover();
      return operation();
    });
    const settled = result.catch(() => {});
    MUTATION_TAILS.set(directoryKey, settled);
    settled.finally(() => { if (MUTATION_TAILS.get(directoryKey) === settled) MUTATION_TAILS.delete(directoryKey); });
    return result;
  };

  const snapshotValue = () => cloneFrozen({
    schemaVersion: 'yalken.r24.pulseLedgerSnapshot.v1',
    sequence: state.ledger.length,
    headDigest: state.ledger.at(-1)?.entryDigest ?? PULSE_LEDGER_ZERO_DIGEST,
    entries: state.ledger,
  });

  await enqueue(async () => snapshotValue());
  return Object.freeze({
    paths,
    maxEntries,
    async appendReceipt({ idempotencyKey, expectedSequence, receipt }) {
      return enqueue(async () => {
        const transactionDigest = normalizeTransactionDigest(idempotencyKey);
        const verified = verifyPulseAggregateReceipt(receipt);
        ordinal(expectedSequence, 'E_WP801_EXPECTED_SEQUENCE');
        const intents = validateIntentEvents(state.intents);
        const existing = intents.get(transactionDigest);
        if (existing) {
          if (existing.admission.receiptDigest !== verified.payloadDigest) fail('E_WP801_IDEMPOTENCY_CONFLICT');
          const entry = state.ledger.find((item) => item.transactionDigest === transactionDigest);
          if (!entry) fail('E_WP801_IDEMPOTENCY_PENDING');
          return cloneFrozen({ status: 'IDEMPOTENT_REPLAY', entry, snapshot: snapshotValue() });
        }
        if (state.ledger.length >= maxEntries) fail('E_WP801_LEDGER_CAPACITY');
        if (expectedSequence !== state.ledger.length) fail('E_WP801_CAS_MISMATCH', `${expectedSequence}:${state.ledger.length}`);
        const entry = createLedgerEntry({
          sequence: expectedSequence + 1,
          previousEntryDigest: state.ledger.at(-1)?.entryDigest ?? PULSE_LEDGER_ZERO_DIGEST,
          transactionDigest,
          receipt: verified,
        });
        const admission = {
          schemaVersion: PULSE_LEDGER_INTENT_SCHEMA_VERSION,
          transactionDigest,
          receiptDigest: verified.payloadDigest,
          expectedSequence,
          entryDigest: entry.entryDigest,
          phase: 'ADMITTED',
          committedSequence: null,
          receipt: verified,
        };
        await persistChannel('intents', [...state.intents, admission]);
        await appendOutbox(admission, 'PENDING');
        await persistChannel('ledger', [...state.ledger, entry]);
        await appendIntentCommit(admission);
        await appendOutbox(admission, 'APPLIED');
        return cloneFrozen({ status: 'APPENDED', entry, snapshot: snapshotValue() });
      });
    },
    async snapshot() { return enqueue(async () => snapshotValue()); },
  });
}
