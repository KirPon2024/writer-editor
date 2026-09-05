import fs from 'node:fs';
import path from 'node:path';
import saveCoordinator from './save-coordinator-v1.cjs';
import { canonicalSerialize, hashCanonicalValue } from './browser-safe-hash.mjs';
import { openPulseLedger, PULSE_LEDGER_DEFAULT_MAX_ENTRIES, PULSE_LEDGER_ZERO_DIGEST } from './pulse-ledger-v1.mjs';
import { PULSE_AGGREGATE_VALUE_MAX, PULSE_METRIC_ALLOWLIST } from './pulse-policy-codec-v1.mjs';

const { durableSaveTransaction } = saveCoordinator;

export const PULSE_PRIVACY_STAGE_ID = 'WP-804_PULSE_PRIVACY';
export const PULSE_PRIVACY_COMMAND_SCHEMA = 'yalken.r24.pulsePrivacyCommand.v1';
export const PULSE_PRIVACY_STATE_SCHEMA = 'yalken.r24.pulsePrivacyState.v1';
export const PULSE_CORRECTION_ENTRY_SCHEMA = 'yalken.r24.pulseCorrectionEntry.v1';
export const PULSE_PRIVACY_EXPLANATION_SCHEMA = 'yalken.r24.pulsePrivacyExplanation.v1';
export const PULSE_PRIVACY_EXPORT_SCHEMA = 'yalken.r24.pulsePrivacyExport.v1';
export const PULSE_PRIVACY_MAX_FILE_BYTES = 8 * 1024 * 1024;

export const PULSE_PRIVACY_POLICY_V1 = deepFreeze({
  dataScope: 'LOCAL_AGGREGATES_ONLY',
  defaultCollectionStatus: 'OPTED_OUT',
  optIn: 'EXPLICIT_USER_COMMAND_REQUIRED',
  optOut: 'SERIALIZED_BEFORE_LATER_COLLECTION',
  retention: 'UNTIL_EXPLICIT_USER_DELETION',
  maximumRetainedEntries: PULSE_LEDGER_DEFAULT_MAX_ENTRIES,
  automaticCleanup: 'DENIED',
  corrections: 'SEPARATE_APPEND_ONLY_HASH_CHAIN',
  export: 'EXPLICIT_USER_COMMAND_AND_PRODUCT_PORT_ONLY',
  deletion: 'EXPLICIT_USER_COMMAND_AND_FIXED_BASENAME_PRODUCT_PORT_ONLY',
  content: 'DENIED',
  identity: 'DENIED',
  requestPathAuthority: 'DENIED',
  network: 'DENIED',
  telemetry: 'DENIED',
});

const PRIVACY_BASENAME = 'pulse-privacy-state.v1.json';
const CORRECTIONS_BASENAME = 'pulse-corrections.v1.jsonl';
const DELETION_BASENAMES = Object.freeze([
  'pulse-corrections.v1.jsonl',
  'pulse-ledger-intents.v1.jsonl',
  'pulse-ledger-outbox.v1.jsonl',
  'pulse-ledger.v1.jsonl',
  'pulse-privacy-state.v1.json',
]);
const COMMAND_BASE_KEYS = Object.freeze(['schemaVersion', 'type', 'requestId', 'expectedPrivacyRevision']);
const CORRECTION_KEYS = Object.freeze([...COMMAND_BASE_KEYS, 'expectedCorrectionSequence', 'expectedCorrectionHeadDigest',
  'targetLedgerSequence', 'targetEntryDigest', 'metricId', 'correctedValue']);
const EFFECT_KEYS = Object.freeze([...COMMAND_BASE_KEYS, 'expectedLedgerSequence', 'expectedLedgerHeadDigest',
  'expectedCorrectionSequence', 'expectedCorrectionHeadDigest']);
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const ALLOWED_METRICS = new Set(PULSE_METRIC_ALLOWLIST);
const OPERATION_TAILS = new Map();

export class PulsePrivacyError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
  }
}

const fail = (code, detail = '') => { throw new PulsePrivacyError(code, detail); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
const cloneFrozen = value => deepFreeze(JSON.parse(JSON.stringify(value)));

function assertPlainData(value, depth = 0, budget = { remaining: 300_000 }, seen = new Set()) {
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > 24) fail('E_WP804_INPUT_BUDGET');
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && !plain(value))) fail('E_WP804_INPUT_NOT_PLAIN_DATA');
  if (Object.getOwnPropertySymbols(value).length > 0) fail('E_WP804_INPUT_SYMBOL');
  const names = Object.getOwnPropertyNames(value);
  if (Array.isArray(value) && (value.length > PULSE_LEDGER_DEFAULT_MAX_ENTRIES || names.length !== value.length + 1
    || names.some(key => key !== 'length' && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)))) fail('E_WP804_ARRAY_BOUND');
  seen.add(value);
  for (const key of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) fail('E_WP804_INPUT_ACCESSOR');
    if (!descriptor.enumerable && key !== 'length') fail('E_WP804_INPUT_HIDDEN_FIELD');
    assertPlainData(descriptor.value, depth + 1, budget, seen);
  }
  seen.delete(value);
}

function exactKeys(value, wanted, code) {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...wanted].sort())) fail(code);
}
function ordinal(value, code, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail(code);
  return value;
}
function digest(value, code) {
  if (typeof value !== 'string' || !HEX64.test(value)) fail(code);
  return value;
}
function requestDigest(requestId) {
  if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) fail('E_WP804_REQUEST_ID');
  return hashCanonicalValue({ requestId });
}

function statePayload(state) {
  return {
    schemaVersion: state.schemaVersion,
    revision: state.revision,
    collectionStatus: state.collectionStatus,
    lastCommandDigest: state.lastCommandDigest,
    policy: state.policy,
  };
}
function defaultState() {
  const payload = {
    schemaVersion: PULSE_PRIVACY_STATE_SCHEMA,
    revision: 0,
    collectionStatus: 'OPTED_OUT',
    lastCommandDigest: PULSE_LEDGER_ZERO_DIGEST,
    policy: PULSE_PRIVACY_POLICY_V1,
  };
  return cloneFrozen({ ...payload, stateDigest: hashCanonicalValue(payload) });
}
function validateState(state) {
  assertPlainData(state);
  exactKeys(state, ['schemaVersion', 'revision', 'collectionStatus', 'lastCommandDigest', 'policy', 'stateDigest'], 'E_WP804_STATE_SCHEMA');
  if (state.schemaVersion !== PULSE_PRIVACY_STATE_SCHEMA) fail('E_WP804_STATE_SCHEMA');
  ordinal(state.revision, 'E_WP804_STATE_REVISION');
  if (!['OPTED_IN', 'OPTED_OUT'].includes(state.collectionStatus)) fail('E_WP804_STATE_STATUS');
  digest(state.lastCommandDigest, 'E_WP804_STATE_COMMAND_DIGEST');
  if (canonicalSerialize(state.policy) !== canonicalSerialize(PULSE_PRIVACY_POLICY_V1)) fail('E_WP804_STATE_POLICY');
  digest(state.stateDigest, 'E_WP804_STATE_DIGEST');
  if (hashCanonicalValue(statePayload(state)) !== state.stateDigest) fail('E_WP804_STATE_TAMPER');
  return cloneFrozen(state);
}
function nextState(current, collectionStatus, commandDigest) {
  const payload = {
    schemaVersion: PULSE_PRIVACY_STATE_SCHEMA,
    revision: current.revision + 1,
    collectionStatus,
    lastCommandDigest: commandDigest,
    policy: PULSE_PRIVACY_POLICY_V1,
  };
  ordinal(payload.revision, 'E_WP804_STATE_REVISION');
  return cloneFrozen({ ...payload, stateDigest: hashCanonicalValue(payload) });
}

function correctionPayload(entry) {
  return {
    schemaVersion: entry.schemaVersion,
    sequence: entry.sequence,
    previousEntryDigest: entry.previousEntryDigest,
    requestDigest: entry.requestDigest,
    targetLedgerSequence: entry.targetLedgerSequence,
    targetEntryDigest: entry.targetEntryDigest,
    metricId: entry.metricId,
    correctedValue: entry.correctedValue,
  };
}
function validateCorrections(entries) {
  if (!Array.isArray(entries) || entries.length > PULSE_LEDGER_DEFAULT_MAX_ENTRIES) fail('E_WP804_CORRECTION_CAPACITY');
  let previous = PULSE_LEDGER_ZERO_DIGEST;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    exactKeys(entry, ['schemaVersion', 'sequence', 'previousEntryDigest', 'requestDigest', 'targetLedgerSequence',
      'targetEntryDigest', 'metricId', 'correctedValue', 'entryDigest'], 'E_WP804_CORRECTION_SCHEMA');
    if (entry.schemaVersion !== PULSE_CORRECTION_ENTRY_SCHEMA || entry.sequence !== index + 1) fail('E_WP804_CORRECTION_SEQUENCE');
    if (digest(entry.previousEntryDigest, 'E_WP804_CORRECTION_CHAIN') !== previous) fail('E_WP804_CORRECTION_CHAIN');
    digest(entry.requestDigest, 'E_WP804_CORRECTION_REQUEST');
    ordinal(entry.targetLedgerSequence, 'E_WP804_CORRECTION_TARGET', PULSE_LEDGER_DEFAULT_MAX_ENTRIES);
    if (entry.targetLedgerSequence < 1) fail('E_WP804_CORRECTION_TARGET');
    digest(entry.targetEntryDigest, 'E_WP804_CORRECTION_TARGET');
    if (!ALLOWED_METRICS.has(entry.metricId)) fail('E_WP804_CORRECTION_METRIC');
    ordinal(entry.correctedValue, 'E_WP804_CORRECTION_VALUE', PULSE_AGGREGATE_VALUE_MAX);
    digest(entry.entryDigest, 'E_WP804_CORRECTION_DIGEST');
    if (hashCanonicalValue(correctionPayload(entry)) !== entry.entryDigest) fail('E_WP804_CORRECTION_TAMPER');
    previous = entry.entryDigest;
  }
  return entries;
}
function correctionsSnapshot(entries) {
  return cloneFrozen({
    sequence: entries.length,
    headDigest: entries.at(-1)?.entryDigest ?? PULSE_LEDGER_ZERO_DIGEST,
    entries,
  });
}

function assertCorrectionsBindLedger(entries, ledger) {
  for (const correction of entries) {
    const target = ledger.entries[correction.targetLedgerSequence - 1];
    if (!target || target.entryDigest !== correction.targetEntryDigest) fail('E_WP804_CORRECTION_TARGET_STALE');
    if (!target.receipt.aggregates.some(aggregate => aggregate.metricId === correction.metricId)) {
      fail('E_WP804_CORRECTION_METRIC_NOT_RECORDED');
    }
  }
}

function validateCommand(command, type) {
  assertPlainData(command);
  const wanted = type === 'CORRECT' ? CORRECTION_KEYS : type === 'EXPORT' || type === 'DELETE' ? EFFECT_KEYS : COMMAND_BASE_KEYS;
  exactKeys(command, wanted, 'E_WP804_COMMAND_SCHEMA');
  if (command.schemaVersion !== PULSE_PRIVACY_COMMAND_SCHEMA || command.type !== type) fail('E_WP804_COMMAND_TYPE');
  const normalized = {
    ...command,
    expectedPrivacyRevision: ordinal(command.expectedPrivacyRevision, 'E_WP804_EXPECTED_PRIVACY_REVISION'),
    requestDigest: requestDigest(command.requestId),
  };
  delete normalized.requestId;
  if (type === 'CORRECT') {
    normalized.expectedCorrectionSequence = ordinal(command.expectedCorrectionSequence, 'E_WP804_EXPECTED_CORRECTION_SEQUENCE', PULSE_LEDGER_DEFAULT_MAX_ENTRIES);
    normalized.expectedCorrectionHeadDigest = digest(command.expectedCorrectionHeadDigest, 'E_WP804_EXPECTED_CORRECTION_HEAD');
    normalized.targetLedgerSequence = ordinal(command.targetLedgerSequence, 'E_WP804_CORRECTION_TARGET', PULSE_LEDGER_DEFAULT_MAX_ENTRIES);
    if (normalized.targetLedgerSequence < 1) fail('E_WP804_CORRECTION_TARGET');
    normalized.targetEntryDigest = digest(command.targetEntryDigest, 'E_WP804_CORRECTION_TARGET');
    if (!ALLOWED_METRICS.has(command.metricId)) fail('E_WP804_CORRECTION_METRIC');
    normalized.correctedValue = ordinal(command.correctedValue, 'E_WP804_CORRECTION_VALUE', PULSE_AGGREGATE_VALUE_MAX);
  }
  if (type === 'EXPORT' || type === 'DELETE') {
    normalized.expectedLedgerSequence = ordinal(command.expectedLedgerSequence, 'E_WP804_EXPECTED_LEDGER_SEQUENCE', PULSE_LEDGER_DEFAULT_MAX_ENTRIES);
    normalized.expectedLedgerHeadDigest = digest(command.expectedLedgerHeadDigest, 'E_WP804_EXPECTED_LEDGER_HEAD');
    normalized.expectedCorrectionSequence = ordinal(command.expectedCorrectionSequence, 'E_WP804_EXPECTED_CORRECTION_SEQUENCE', PULSE_LEDGER_DEFAULT_MAX_ENTRIES);
    normalized.expectedCorrectionHeadDigest = digest(command.expectedCorrectionHeadDigest, 'E_WP804_EXPECTED_CORRECTION_HEAD');
  }
  return normalized;
}

function assertRegularFile(filePath, code) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code);
}
function decodeUtf8(bytes, code) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(code); }
}
function readState(filePath) {
  if (!fs.existsSync(filePath)) return defaultState();
  assertRegularFile(filePath, 'E_WP804_STATE_FILE');
  const bytes = fs.readFileSync(filePath);
  if (bytes.length === 0 || bytes.length > PULSE_PRIVACY_MAX_FILE_BYTES) fail('E_WP804_STATE_BYTES');
  const text = decodeUtf8(bytes, 'E_WP804_STATE_UTF8');
  if (!text.endsWith('\n') || text.endsWith('\n\n')) fail('E_WP804_STATE_CANONICAL');
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('E_WP804_STATE_JSON'); }
  const verified = validateState(parsed);
  if (`${canonicalSerialize(verified)}\n` !== text) fail('E_WP804_STATE_CANONICAL');
  return verified;
}
function readCorrections(filePath) {
  if (!fs.existsSync(filePath)) return [];
  assertRegularFile(filePath, 'E_WP804_CORRECTION_FILE');
  const bytes = fs.readFileSync(filePath);
  if (bytes.length > PULSE_PRIVACY_MAX_FILE_BYTES) fail('E_WP804_CORRECTION_BYTES');
  if (bytes.length === 0) return [];
  const text = decodeUtf8(bytes, 'E_WP804_CORRECTION_UTF8');
  if (!text.endsWith('\n') || text.endsWith('\n\n')) fail('E_WP804_CORRECTION_CANONICAL');
  const entries = text.slice(0, -1).split('\n').map(line => {
    let parsed;
    try { parsed = JSON.parse(line); } catch { fail('E_WP804_CORRECTION_JSON'); }
    if (canonicalSerialize(parsed) !== line) fail('E_WP804_CORRECTION_CANONICAL');
    return parsed;
  });
  return validateCorrections(entries);
}
const encodeState = state => `${canonicalSerialize(validateState(state))}\n`;
const encodeCorrections = entries => entries.length === 0 ? '' : `${validateCorrections(entries).map(canonicalSerialize).join('\n')}\n`;

function assertPrivacyRevision(command, state) {
  if (command.expectedPrivacyRevision !== state.revision) fail('E_WP804_PRIVACY_REVISION_STALE');
}
function assertCorrectionIdentity(command, snapshot) {
  if (command.expectedCorrectionSequence !== snapshot.sequence || command.expectedCorrectionHeadDigest !== snapshot.headDigest) fail('E_WP804_CORRECTION_IDENTITY_STALE');
}
function assertLedgerIdentity(command, snapshot) {
  if (command.expectedLedgerSequence !== snapshot.sequence || command.expectedLedgerHeadDigest !== snapshot.headDigest) fail('E_WP804_LEDGER_IDENTITY_STALE');
}
function fixedPaths(directory) {
  return {
    state: path.join(directory, PRIVACY_BASENAME),
    corrections: path.join(directory, CORRECTIONS_BASENAME),
  };
}

export function readPulsePrivacyStateSnapshot(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) fail('E_WP804_DIRECTORY_REQUIRED');
  if (!fs.existsSync(directory)) return cloneFrozen(defaultState());
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('E_WP806_PRIVACY_DIRECTORY');
  const directoryKey = fs.realpathSync(directory);
  return cloneFrozen(readState(fixedPaths(directoryKey).state));
}
function validatePortResult(result, expected, code) {
  assertPlainData(result);
  exactKeys(result, Object.keys(expected), code);
  for (const [key, value] of Object.entries(expected)) if (canonicalSerialize(result[key]) !== canonicalSerialize(value)) fail(code, key);
  return cloneFrozen(result);
}

function applyCorrections(ledger, corrections) {
  const latest = new Map();
  for (const correction of corrections.entries) latest.set(`${correction.targetLedgerSequence}:${correction.metricId}`, correction);
  return ledger.entries.map(entry => {
    const effectiveAggregates = entry.receipt.aggregates.map(aggregate => {
      const correction = latest.get(`${entry.sequence}:${aggregate.metricId}`);
      return {
        metricId: aggregate.metricId,
        originalValue: aggregate.value,
        effectiveValue: correction?.correctedValue ?? aggregate.value,
        correctionSequence: correction?.sequence ?? null,
      };
    });
    return {
      ledgerSequence: entry.sequence,
      entryDigest: entry.entryDigest,
      receiptDigest: entry.receiptDigest,
      sourceRevisionOrdinal: entry.receipt.sourceRevisionOrdinal,
      generation: entry.receipt.generation,
      effectiveAggregates,
    };
  });
}

export async function openPulsePrivacyController(directory, {
  saveTransaction = durableSaveTransaction,
  openLedger = openPulseLedger,
  exportPort = undefined,
  deletePort = undefined,
} = {}) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) fail('E_WP804_DIRECTORY_REQUIRED');
  if (typeof saveTransaction !== 'function' || typeof openLedger !== 'function') fail('E_WP804_PRODUCT_PORT_REQUIRED');
  if (exportPort !== undefined && typeof exportPort !== 'function') fail('E_WP804_EXPORT_PORT_REQUIRED');
  if (deletePort !== undefined && typeof deletePort !== 'function') fail('E_WP804_DELETE_PORT_REQUIRED');
  fs.mkdirSync(directory, { recursive: true });
  const directoryKey = fs.realpathSync(directory);
  const files = fixedPaths(directoryKey);

  const load = async () => {
    const ledgerApi = await openLedger(directoryKey, { saveTransaction, maxEntries: PULSE_LEDGER_DEFAULT_MAX_ENTRIES });
    const ledger = await ledgerApi.snapshot();
    const state = readState(files.state);
    const correctionEntries = readCorrections(files.corrections);
    assertCorrectionsBindLedger(correctionEntries, ledger);
    const corrections = correctionsSnapshot(correctionEntries);
    return { state, correctionEntries, corrections, ledgerApi, ledger };
  };
  const persistState = state => saveTransaction({ filePath: files.state, content: encodeState(state), revision: state.revision });
  const persistCorrections = entries => saveTransaction({ filePath: files.corrections, content: encodeCorrections(entries), revision: entries.length });
  const enqueue = operation => {
    const predecessor = OPERATION_TAILS.get(directoryKey) ?? Promise.resolve();
    const result = predecessor.then(operation);
    const settled = result.catch(() => {});
    OPERATION_TAILS.set(directoryKey, settled);
    settled.finally(() => { if (OPERATION_TAILS.get(directoryKey) === settled) OPERATION_TAILS.delete(directoryKey); });
    return result;
  };

  const explainValue = ({ state, corrections, ledger }) => {
    const payload = {
      schemaVersion: PULSE_PRIVACY_EXPLANATION_SCHEMA,
      policy: PULSE_PRIVACY_POLICY_V1,
      privacyState: state,
      identity: {
        ledgerSequence: ledger.sequence,
        ledgerHeadDigest: ledger.headDigest,
        correctionSequence: corrections.sequence,
        correctionHeadDigest: corrections.headDigest,
        privacyRevision: state.revision,
        privacyStateDigest: state.stateDigest,
      },
      history: applyCorrections(ledger, corrections),
    };
    return cloneFrozen({ ...payload, explanationDigest: hashCanonicalValue(payload) });
  };

  return Object.freeze({
    async explain() {
      return enqueue(async () => explainValue(await load()));
    },
    async optIn(commandInput) {
      const command = validateCommand(commandInput, 'OPT_IN');
      return enqueue(async () => {
        const current = await load();
        assertPrivacyRevision(command, current.state);
        const state = nextState(current.state, 'OPTED_IN', command.requestDigest);
        await persistState(state);
        return cloneFrozen({ status: 'OPTED_IN', privacyState: state });
      });
    },
    async optOut(commandInput) {
      const command = validateCommand(commandInput, 'OPT_OUT');
      return enqueue(async () => {
        const current = await load();
        assertPrivacyRevision(command, current.state);
        const state = nextState(current.state, 'OPTED_OUT', command.requestDigest);
        await persistState(state);
        return cloneFrozen({ status: 'OPTED_OUT', privacyState: state });
      });
    },
    async appendReceipt(requestInput) {
      assertPlainData(requestInput);
      exactKeys(requestInput, ['expectedPrivacyRevision', 'idempotencyKey', 'expectedSequence', 'receipt'], 'E_WP804_APPEND_SCHEMA');
      const { expectedPrivacyRevision, idempotencyKey, expectedSequence, receipt } = requestInput;
      ordinal(expectedPrivacyRevision, 'E_WP804_EXPECTED_PRIVACY_REVISION');
      return enqueue(async () => {
        const current = await load();
        if (current.state.revision !== expectedPrivacyRevision) fail('E_WP804_PRIVACY_REVISION_STALE');
        if (current.state.collectionStatus !== 'OPTED_IN') fail('E_WP804_COLLECTION_OPT_IN_REQUIRED');
        if (current.ledger.sequence >= PULSE_LEDGER_DEFAULT_MAX_ENTRIES) fail('E_WP804_RETENTION_CAPACITY_NO_AUTOCLEANUP');
        return current.ledgerApi.appendReceipt({ idempotencyKey, expectedSequence, receipt });
      });
    },
    async appendCorrection(commandInput) {
      const command = validateCommand(commandInput, 'CORRECT');
      return enqueue(async () => {
        const current = await load();
        assertPrivacyRevision(command, current.state);
        assertCorrectionIdentity(command, current.corrections);
        if (current.corrections.sequence >= PULSE_LEDGER_DEFAULT_MAX_ENTRIES) fail('E_WP804_CORRECTION_CAPACITY_NO_AUTOCLEANUP');
        const target = current.ledger.entries[command.targetLedgerSequence - 1];
        if (!target || target.entryDigest !== command.targetEntryDigest) fail('E_WP804_CORRECTION_TARGET_STALE');
        if (!target.receipt.aggregates.some(aggregate => aggregate.metricId === command.metricId)) fail('E_WP804_CORRECTION_METRIC_NOT_RECORDED');
        const payload = {
          schemaVersion: PULSE_CORRECTION_ENTRY_SCHEMA,
          sequence: current.corrections.sequence + 1,
          previousEntryDigest: current.corrections.headDigest,
          requestDigest: command.requestDigest,
          targetLedgerSequence: command.targetLedgerSequence,
          targetEntryDigest: command.targetEntryDigest,
          metricId: command.metricId,
          correctedValue: command.correctedValue,
        };
        const entry = cloneFrozen({ ...payload, entryDigest: hashCanonicalValue(payload) });
        await persistCorrections([...current.correctionEntries, entry]);
        return cloneFrozen({ status: 'CORRECTION_APPENDED', entry, correctionSnapshot: correctionsSnapshot([...current.correctionEntries, entry]) });
      });
    },
    async exportOnUserRequest(commandInput) {
      const command = validateCommand(commandInput, 'EXPORT');
      if (typeof exportPort !== 'function') fail('E_WP804_EXPORT_PORT_REQUIRED');
      return enqueue(async () => {
        const current = await load();
        assertPrivacyRevision(command, current.state);
        assertLedgerIdentity(command, current.ledger);
        assertCorrectionIdentity(command, current.corrections);
        const explanation = explainValue(current);
        const payload = {
          schemaVersion: PULSE_PRIVACY_EXPORT_SCHEMA,
          policy: PULSE_PRIVACY_POLICY_V1,
          identity: explanation.identity,
          history: explanation.history,
        };
        const serialized = `${canonicalSerialize(payload)}\n`;
        if (Buffer.byteLength(serialized, 'utf8') > PULSE_PRIVACY_MAX_FILE_BYTES) fail('E_WP804_EXPORT_BYTE_BUDGET');
        const payloadDigest = hashCanonicalValue(payload);
        const expected = { status: 'EXPORTED', requestDigest: command.requestDigest, payloadDigest };
        const result = await exportPort(cloneFrozen({ ...expected, serialized }));
        validatePortResult(result, expected, 'E_WP804_EXPORT_PORT_RESULT');
        return cloneFrozen(expected);
      });
    },
    async deleteOnUserRequest(commandInput) {
      const command = validateCommand(commandInput, 'DELETE');
      if (typeof deletePort !== 'function') fail('E_WP804_DELETE_PORT_REQUIRED');
      return enqueue(async () => {
        const current = await load();
        assertPrivacyRevision(command, current.state);
        assertLedgerIdentity(command, current.ledger);
        assertCorrectionIdentity(command, current.corrections);
        const optedOut = nextState(current.state, 'OPTED_OUT', command.requestDigest);
        await persistState(optedOut);
        const expected = {
          status: 'DELETED',
          requestDigest: command.requestDigest,
          deletedBasenames: [...DELETION_BASENAMES],
        };
        const result = await deletePort(cloneFrozen({
          schemaVersion: 'yalken.r24.pulseDeleteEffect.v1',
          directory: directoryKey,
          requestDigest: command.requestDigest,
          basenames: [...DELETION_BASENAMES],
        }));
        validatePortResult(result, expected, 'E_WP804_DELETE_PORT_RESULT');
        return cloneFrozen(expected);
      });
    },
  });
}
