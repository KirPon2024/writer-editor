import { hashCanonicalValue } from './browser-safe-hash.mjs';
import {
  PULSE_LEDGER_DEFAULT_MAX_ENTRIES,
  PULSE_LEDGER_ENTRY_SCHEMA_VERSION,
  PULSE_LEDGER_ZERO_DIGEST,
} from './pulse-ledger-v1.mjs';
import {
  PULSE_METRIC_ALLOWLIST,
  verifyPulseAggregateReceipt,
} from './pulse-policy-codec-v1.mjs';

export const PULSE_FORMULAS_STAGE_ID = 'WP-802_PULSE_FORMULAS';
export const PULSE_FORMULA_VERSION = 'PULSE_FORMULAS_V1';
export const PULSE_FORMULA_CHECKPOINT_SCHEMA_VERSION = 'yalken.r24.pulseFormulaCheckpoint.v1';
export const PULSE_FORMULA_PROJECTION_SCHEMA_VERSION = 'yalken.r24.pulseFormulaProjection.v1';

const LEDGER_SNAPSHOT_SCHEMA_VERSION = 'yalken.r24.pulseLedgerSnapshot.v1';
const HEX_DIGEST = /^[0-9a-f]{64}$/u;
const MERKLE_EMPTY_DOMAIN = 'YALKEN_R24_WP802_PULSE_MERKLE_EMPTY_V1';
const MERKLE_LEAF_DOMAIN = 'YALKEN_R24_WP802_PULSE_MERKLE_LEAF_V1';
const MERKLE_PARENT_DOMAIN = 'YALKEN_R24_WP802_PULSE_MERKLE_PARENT_V1';
const WORDS_PER_HOUR_MILLI_SCALE = 3_600_000n;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export class PulseFormulaError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
  }
}

const fail = (code, detail = '') => { throw new PulseFormulaError(code, detail); };
const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};
const cloneFrozen = (value) => deepFreeze(JSON.parse(JSON.stringify(value)));

function assertOwnData(value, label = 'input', seen = new Set()) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (typeof value !== 'object' || seen.has(value)) fail('E_WP802_INPUT_NOT_PLAIN_DATA', label);
  seen.add(value);
  if (!Array.isArray(value) && !isPlainObject(value)) fail('E_WP802_INPUT_NOT_PLAIN_DATA', label);
  if (Object.getOwnPropertySymbols(value).length > 0) fail('E_WP802_INPUT_SYMBOL', label);
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) fail('E_WP802_INPUT_ACCESSOR', `${label}.${key}`);
    assertOwnData(descriptor.value, `${label}.${key}`, seen);
  }
  seen.delete(value);
}

function exactKeys(value, expected, code, label) {
  if (!isPlainObject(value)) fail(code, `${label}:object`);
  const wanted = [...expected].sort();
  const enumerable = Object.keys(value).sort();
  const owned = Object.getOwnPropertyNames(value).sort();
  if (enumerable.length !== wanted.length || enumerable.some((key, index) => key !== wanted[index])) fail(code, `${label}:fields`);
  if (owned.length !== wanted.length || owned.some((key, index) => key !== wanted[index])) fail(code, `${label}:descriptors`);
}

function allowedOptionKeys(options, allowed) {
  assertOwnData(options, 'options');
  if (!isPlainObject(options)) fail('E_WP802_OPTIONS');
  for (const key of Object.keys(options)) if (!allowed.includes(key)) fail('E_WP802_OPTIONS', key);
}

function digest(value, code, label = '') {
  if (typeof value !== 'string' || !HEX_DIGEST.test(value)) fail(code, label);
  return value;
}

function ordinal(value, code, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail(code);
  return value;
}

function safeAdd(left, right) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail('E_WP802_FORMULA_OVERFLOW');
  return result;
}

function safeSubtract(left, right) {
  const result = left - right;
  if (!Number.isSafeInteger(result)) fail('E_WP802_FORMULA_OVERFLOW');
  return result;
}

function wordsPerHourMilli(wordsAdded, activeSeconds) {
  if (activeSeconds === 0) return 0;
  const result = (BigInt(wordsAdded) * WORDS_PER_HOUR_MILLI_SCALE) / BigInt(activeSeconds);
  if (result > MAX_SAFE_BIGINT) fail('E_WP802_FORMULA_OVERFLOW');
  return Number(result);
}

export const PULSE_FORMULA_DEFINITIONS = deepFreeze([
  ...PULSE_METRIC_ALLOWLIST.map((metricId) => ({ formulaId: metricId, kind: 'SUM', sourceMetricIds: [metricId] })),
  { formulaId: 'NET_WORDS_COUNT', kind: 'SUBTRACT', sourceMetricIds: ['WORDS_ADDED_COUNT', 'WORDS_DELETED_COUNT'] },
  { formulaId: 'WORDS_ADDED_PER_ACTIVE_HOUR_MILLI', kind: 'RATE_MILLI', sourceMetricIds: ['WORDS_ADDED_COUNT', 'ACTIVE_WRITING_SECONDS'] },
]);

export const PULSE_FORMULA_SET_DIGEST = hashCanonicalValue({
  formulaVersion: PULSE_FORMULA_VERSION,
  definitions: PULSE_FORMULA_DEFINITIONS,
});

export const PULSE_FORMULA_EMPTY_MERKLE_ROOT = hashCanonicalValue({ domain: MERKLE_EMPTY_DOMAIN });

function formulaVersion(value) {
  if (value !== PULSE_FORMULA_VERSION) fail('E_WP802_FORMULA_VERSION');
  return value;
}

function ledgerEntryPayload(entry) {
  return {
    schemaVersion: entry.schemaVersion,
    sequence: entry.sequence,
    previousEntryDigest: entry.previousEntryDigest,
    transactionDigest: entry.transactionDigest,
    receiptDigest: entry.receiptDigest,
    receipt: entry.receipt,
  };
}

function validateSnapshot(snapshot) {
  assertOwnData(snapshot, 'snapshot');
  exactKeys(snapshot, ['entries', 'headDigest', 'schemaVersion', 'sequence'], 'E_WP802_LEDGER_SNAPSHOT', 'snapshot');
  if (snapshot.schemaVersion !== LEDGER_SNAPSHOT_SCHEMA_VERSION) fail('E_WP802_LEDGER_SNAPSHOT', 'schema');
  ordinal(snapshot.sequence, 'E_WP802_LEDGER_SEQUENCE', PULSE_LEDGER_DEFAULT_MAX_ENTRIES);
  digest(snapshot.headDigest, 'E_WP802_LEDGER_HEAD');
  if (!Array.isArray(snapshot.entries) || snapshot.entries.length !== snapshot.sequence) fail('E_WP802_LEDGER_SEQUENCE', 'denominator');
  let previousEntryDigest = PULSE_LEDGER_ZERO_DIGEST;
  const entries = snapshot.entries.map((entry, index) => {
    exactKeys(entry, ['entryDigest', 'previousEntryDigest', 'receipt', 'receiptDigest', 'schemaVersion', 'sequence', 'transactionDigest'], 'E_WP802_LEDGER_ENTRY', `entries[${index}]`);
    if (entry.schemaVersion !== PULSE_LEDGER_ENTRY_SCHEMA_VERSION || entry.sequence !== index + 1) fail('E_WP802_LEDGER_ENTRY', 'sequence');
    if (digest(entry.previousEntryDigest, 'E_WP802_LEDGER_ENTRY') !== previousEntryDigest) fail('E_WP802_LEDGER_CHAIN');
    digest(entry.transactionDigest, 'E_WP802_LEDGER_ENTRY');
    digest(entry.receiptDigest, 'E_WP802_LEDGER_ENTRY');
    digest(entry.entryDigest, 'E_WP802_LEDGER_ENTRY');
    let receipt;
    try { receipt = verifyPulseAggregateReceipt(entry.receipt); } catch (error) {
      fail('E_WP802_LEDGER_RECEIPT', error?.code || 'invalid');
    }
    if (receipt.payloadDigest !== entry.receiptDigest) fail('E_WP802_LEDGER_RECEIPT_DIGEST');
    if (hashCanonicalValue(ledgerEntryPayload({ ...entry, receipt })) !== entry.entryDigest) fail('E_WP802_LEDGER_ENTRY_DIGEST');
    previousEntryDigest = entry.entryDigest;
    return { ...entry, receipt };
  });
  const expectedHead = entries.at(-1)?.entryDigest ?? PULSE_LEDGER_ZERO_DIGEST;
  if (snapshot.headDigest !== expectedHead) fail('E_WP802_LEDGER_HEAD');
  return entries;
}

function merkleRoot(entries, throughSequence) {
  if (throughSequence === 0) return PULSE_FORMULA_EMPTY_MERKLE_ROOT;
  let level = entries.slice(0, throughSequence).map((entry) => hashCanonicalValue({
    domain: MERKLE_LEAF_DOMAIN,
    sequence: entry.sequence,
    entryDigest: entry.entryDigest,
  }));
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(hashCanonicalValue({ domain: MERKLE_PARENT_DOMAIN, left, right }));
    }
    level = next;
  }
  return level[0];
}

function emptyTotals() {
  return Object.fromEntries(PULSE_METRIC_ALLOWLIST.map((metricId) => [metricId, 0]));
}

function accumulateEntries(entries, start, end, initial = emptyTotals()) {
  const totals = { ...initial };
  for (let index = start; index < end; index += 1) {
    for (const aggregate of entries[index].receipt.aggregates) {
      totals[aggregate.metricId] = safeAdd(totals[aggregate.metricId], aggregate.value);
    }
  }
  return totals;
}

function valuesFromTotals(totals) {
  return [
    ...PULSE_METRIC_ALLOWLIST.map((formulaId) => ({ formulaId, value: totals[formulaId] })),
    { formulaId: 'NET_WORDS_COUNT', value: safeSubtract(totals.WORDS_ADDED_COUNT, totals.WORDS_DELETED_COUNT) },
    { formulaId: 'WORDS_ADDED_PER_ACTIVE_HOUR_MILLI', value: wordsPerHourMilli(totals.WORDS_ADDED_COUNT, totals.ACTIVE_WRITING_SECONDS) },
  ];
}

function checkpointPayload(checkpoint) {
  return {
    schemaVersion: checkpoint.schemaVersion,
    formulaVersion: checkpoint.formulaVersion,
    formulaSetDigest: checkpoint.formulaSetDigest,
    throughSequence: checkpoint.throughSequence,
    ledgerHeadDigest: checkpoint.ledgerHeadDigest,
    merkleRoot: checkpoint.merkleRoot,
    values: checkpoint.values,
  };
}

function projectionPayload(projection) {
  return {
    schemaVersion: projection.schemaVersion,
    formulaVersion: projection.formulaVersion,
    formulaSetDigest: projection.formulaSetDigest,
    throughSequence: projection.throughSequence,
    ledgerHeadDigest: projection.ledgerHeadDigest,
    merkleRoot: projection.merkleRoot,
    values: projection.values,
  };
}

function validateFormulaValues(values, code) {
  if (!Array.isArray(values) || values.length !== PULSE_FORMULA_DEFINITIONS.length) fail(code, 'denominator');
  return values.map((row, index) => {
    exactKeys(row, ['formulaId', 'value'], code, `values[${index}]`);
    if (row.formulaId !== PULSE_FORMULA_DEFINITIONS[index].formulaId || !Number.isSafeInteger(row.value)) fail(code, `values[${index}]`);
    if (PULSE_METRIC_ALLOWLIST.includes(row.formulaId) && row.value < 0) fail(code, `values[${index}]`);
    if (row.formulaId === 'WORDS_ADDED_PER_ACTIVE_HOUR_MILLI' && row.value < 0) fail(code, `values[${index}]`);
    return { formulaId: row.formulaId, value: row.value };
  });
}

function totalsFromValues(values) {
  return Object.fromEntries(values.slice(0, PULSE_METRIC_ALLOWLIST.length).map(({ formulaId, value }) => [formulaId, value]));
}

function verifyCheckpoint(checkpoint, entries) {
  assertOwnData(checkpoint, 'checkpoint');
  exactKeys(checkpoint, ['checkpointDigest', 'formulaSetDigest', 'formulaVersion', 'ledgerHeadDigest', 'merkleRoot', 'schemaVersion', 'throughSequence', 'values'], 'E_WP802_CHECKPOINT', 'checkpoint');
  if (checkpoint.schemaVersion !== PULSE_FORMULA_CHECKPOINT_SCHEMA_VERSION) fail('E_WP802_CHECKPOINT', 'schema');
  formulaVersion(checkpoint.formulaVersion);
  if (checkpoint.formulaSetDigest !== PULSE_FORMULA_SET_DIGEST) fail('E_WP802_FORMULA_SET');
  ordinal(checkpoint.throughSequence, 'E_WP802_CHECKPOINT_SEQUENCE', entries.length);
  digest(checkpoint.ledgerHeadDigest, 'E_WP802_CHECKPOINT');
  digest(checkpoint.merkleRoot, 'E_WP802_CHECKPOINT');
  digest(checkpoint.checkpointDigest, 'E_WP802_CHECKPOINT');
  const values = validateFormulaValues(checkpoint.values, 'E_WP802_CHECKPOINT_VALUES');
  if (hashCanonicalValue(checkpointPayload({ ...checkpoint, values })) !== checkpoint.checkpointDigest) fail('E_WP802_CHECKPOINT_DIGEST');
  const expectedHead = entries[checkpoint.throughSequence - 1]?.entryDigest ?? PULSE_LEDGER_ZERO_DIGEST;
  if (checkpoint.ledgerHeadDigest !== expectedHead) fail('E_WP802_CHECKPOINT_STALE', 'head');
  if (checkpoint.merkleRoot !== merkleRoot(entries, checkpoint.throughSequence)) fail('E_WP802_CHECKPOINT_STALE', 'merkle');
  const expectedValues = valuesFromTotals(accumulateEntries(entries, 0, checkpoint.throughSequence));
  if (hashCanonicalValue(values) !== hashCanonicalValue(expectedValues)) fail('E_WP802_CHECKPOINT_STALE', 'values');
  return { throughSequence: checkpoint.throughSequence, totals: totalsFromValues(values) };
}

export function computePulseLedgerMerkleRoot(snapshot, options = {}) {
  allowedOptionKeys(options, ['throughSequence']);
  const entries = validateSnapshot(snapshot);
  const throughSequence = options.throughSequence === undefined
    ? entries.length
    : ordinal(options.throughSequence, 'E_WP802_MERKLE_SEQUENCE', entries.length);
  return merkleRoot(entries, throughSequence);
}

export function createPulseFormulaCheckpoint(snapshot, options = {}) {
  allowedOptionKeys(options, ['formulaVersion', 'throughSequence']);
  const entries = validateSnapshot(snapshot);
  const version = formulaVersion(options.formulaVersion ?? PULSE_FORMULA_VERSION);
  const throughSequence = options.throughSequence === undefined
    ? entries.length
    : ordinal(options.throughSequence, 'E_WP802_CHECKPOINT_SEQUENCE', entries.length);
  const checkpoint = {
    schemaVersion: PULSE_FORMULA_CHECKPOINT_SCHEMA_VERSION,
    formulaVersion: version,
    formulaSetDigest: PULSE_FORMULA_SET_DIGEST,
    throughSequence,
    ledgerHeadDigest: entries[throughSequence - 1]?.entryDigest ?? PULSE_LEDGER_ZERO_DIGEST,
    merkleRoot: merkleRoot(entries, throughSequence),
    values: valuesFromTotals(accumulateEntries(entries, 0, throughSequence)),
  };
  return cloneFrozen({ ...checkpoint, checkpointDigest: hashCanonicalValue(checkpoint) });
}

export function recomputePulseFormulas(snapshot, options = {}) {
  allowedOptionKeys(options, ['checkpoint', 'formulaVersion']);
  const entries = validateSnapshot(snapshot);
  const version = formulaVersion(options.formulaVersion ?? PULSE_FORMULA_VERSION);
  let start = 0;
  let totals = emptyTotals();
  if (options.checkpoint !== undefined && options.checkpoint !== null) {
    const verified = verifyCheckpoint(options.checkpoint, entries);
    if (options.checkpoint.formulaVersion !== version) fail('E_WP802_FORMULA_VERSION');
    start = verified.throughSequence;
    totals = verified.totals;
  }
  totals = accumulateEntries(entries, start, entries.length, totals);
  const projection = {
    schemaVersion: PULSE_FORMULA_PROJECTION_SCHEMA_VERSION,
    formulaVersion: version,
    formulaSetDigest: PULSE_FORMULA_SET_DIGEST,
    throughSequence: entries.length,
    ledgerHeadDigest: entries.at(-1)?.entryDigest ?? PULSE_LEDGER_ZERO_DIGEST,
    merkleRoot: merkleRoot(entries, entries.length),
    values: valuesFromTotals(totals),
  };
  return cloneFrozen({ ...projection, projectionDigest: hashCanonicalValue(projectionPayload(projection)) });
}
