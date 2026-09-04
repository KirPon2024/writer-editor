import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { computePulseLedgerMerkleRoot, PULSE_FORMULA_VERSION, PULSE_FORMULA_SET_DIGEST } from './pulse-formulas-v1.mjs';
import { PULSE_LEDGER_DEFAULT_MAX_ENTRIES } from './pulse-ledger-v1.mjs';

export const PULSE_HISTORY_VERSION = 'PULSE_DESCRIPTIVE_HISTORY_V1';
export const PULSE_HISTORY_SCHEMA = 'yalken.r24.pulseDescriptiveHistory.v1';
export const PULSE_HISTORY_DECLARATIONS_SCHEMA = 'yalken.r24.pulseHistoryDeclarations.v1';
export const PULSE_MANUAL_PHASES = Object.freeze(['RESEARCH', 'PLANNING', 'DRAFTING', 'REVISING', 'EDITING']);
const IDENTITY_KEYS = ['ledgerSequence', 'ledgerHeadDigest', 'declarationRevisionOrdinal', 'generation'];
const COUNT_FIELDS = ['added', 'deleted', 'net', 'touched', 'sessions', 'sceneEdits', 'declaredTasks'];
const MAX_COUNT = 1_000_000_000;

export class PulseHistoryError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new PulseHistoryError(code); };
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function data(value, depth = 0, budget = { left: 300_000 }, seen = new Set()) {
  if (--budget.left < 0 || depth > 24) fail('E_WP803_INPUT_BUDGET');
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && !plain(value))) fail('E_WP803_INPUT_DATA');
  if (Object.getOwnPropertySymbols(value).length) fail('E_WP803_INPUT_SYMBOL');
  const names = Object.getOwnPropertyNames(value);
  if (Array.isArray(value) && (value.length > PULSE_LEDGER_DEFAULT_MAX_ENTRIES || names.length !== value.length + 1
    || names.some(key => key !== 'length' && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)))) fail('E_WP803_ARRAY_BOUND');
  seen.add(value);
  for (const key of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor.get || descriptor.set) fail('E_WP803_INPUT_ACCESSOR');
    if (!descriptor.enumerable && key !== 'length') fail('E_WP803_INPUT_HIDDEN_FIELD');
    data(descriptor.value, depth + 1, budget, seen);
  }
  seen.delete(value);
}

function keys(value, wanted, code) {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...wanted].sort())) fail(code);
}
function ordinal(value, code, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail(code);
}
function digest(value, code) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) fail(code);
}
function identity(value) {
  keys(value, IDENTITY_KEYS, 'E_WP803_IDENTITY');
  ordinal(value.ledgerSequence, 'E_WP803_IDENTITY', PULSE_LEDGER_DEFAULT_MAX_ENTRIES);
  digest(value.ledgerHeadDigest, 'E_WP803_IDENTITY');
  ordinal(value.declarationRevisionOrdinal, 'E_WP803_IDENTITY');
  ordinal(value.generation, 'E_WP803_IDENTITY');
  return Object.fromEntries(IDENTITY_KEYS.map(key => [key, value[key]]));
}
function sameIdentity(left, right) {
  return IDENTITY_KEYS.every(key => left[key] === right[key]);
}
function add(left, right) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail('E_WP803_COUNT_OVERFLOW');
  return result;
}
function metric(value, origin) {
  return { status: value === null ? 'NOT_RECORDED' : 'RECORDED', value, origin: value === null ? null : origin };
}
function combine(left, right, operation) {
  if (left.value === null || right.value === null) return metric(null, null);
  return metric(operation(left.value, right.value), 'DERIVED_FROM_RECORDED_ADD_DELETE');
}

function declarations(snapshot, ledger, expected) {
  keys(snapshot, ['schemaVersion', 'ledgerSequence', 'ledgerHeadDigest', 'revisionOrdinal', 'generation', 'entries'], 'E_WP803_DECLARATION_SCHEMA');
  if (snapshot.schemaVersion !== PULSE_HISTORY_DECLARATIONS_SCHEMA) fail('E_WP803_DECLARATION_SCHEMA');
  const source = identity({ ledgerSequence: snapshot.ledgerSequence, ledgerHeadDigest: snapshot.ledgerHeadDigest,
    declarationRevisionOrdinal: snapshot.revisionOrdinal, generation: snapshot.generation });
  if (!sameIdentity(source, expected) || snapshot.ledgerSequence !== ledger.sequence || snapshot.ledgerHeadDigest !== ledger.headDigest) fail('E_WP803_DECLARATION_STALE');
  if (!Array.isArray(snapshot.entries) || snapshot.entries.length > ledger.sequence) fail('E_WP803_DECLARATION_BOUND');
  const rows = new Map();
  let previous = 0;
  for (const row of snapshot.entries) {
    keys(row, ['sequence', 'entryDigest', 'declaredTaskCount', 'manualPhase'], 'E_WP803_DECLARATION_ROW');
    ordinal(row.sequence, 'E_WP803_DECLARATION_SEQUENCE', ledger.sequence);
    if (row.sequence <= previous) fail('E_WP803_DECLARATION_SEQUENCE');
    digest(row.entryDigest, 'E_WP803_DECLARATION_ENTRY');
    if (row.entryDigest !== ledger.entries[row.sequence - 1].entryDigest) fail('E_WP803_DECLARATION_ENTRY');
    if (row.declaredTaskCount !== null) ordinal(row.declaredTaskCount, 'E_WP803_DECLARED_TASK_COUNT', MAX_COUNT);
    if (row.manualPhase !== null && !PULSE_MANUAL_PHASES.includes(row.manualPhase)) fail('E_WP803_MANUAL_PHASE');
    rows.set(row.sequence, row);
    previous = row.sequence;
  }
  return rows;
}

function summarize(rows, field) {
  let recordedRows = 0;
  let observedSubtotal = 0;
  for (const row of rows) {
    if (row[field].value === null) continue;
    recordedRows += 1;
    observedSubtotal = add(observedSubtotal, row[field].value);
  }
  const complete = recordedRows === rows.length;
  return { status: complete ? 'COMPLETE' : recordedRows === 0 ? 'NOT_RECORDED' : 'PARTIAL',
    value: complete ? observedSubtotal : null, observedSubtotal, recordedRows, totalRows: rows.length };
}

export function buildPulseDescriptiveHistory(input) {
  data(input);
  keys(input, ['ledgerSnapshot', 'declarationSnapshot', 'currentIdentity'], 'E_WP803_INPUT_FIELDS');
  const expected = identity(input.currentIdentity);
  const ledger = input.ledgerSnapshot;
  // WP802 revalidates every receipt, sequence and digest in the WP801 chain.
  const merkleRoot = computePulseLedgerMerkleRoot(ledger);
  if (expected.ledgerSequence !== ledger.sequence || expected.ledgerHeadDigest !== ledger.headDigest) fail('E_WP803_LEDGER_STALE');
  const declared = declarations(input.declarationSnapshot, ledger, expected);
  const rows = ledger.entries.map(entry => {
    const values = new Map(entry.receipt.aggregates.map(row => [row.metricId, row.value]));
    const observed = id => metric(values.has(id) ? values.get(id) : null, 'LEDGER_AGGREGATE');
    const added = observed('WORDS_ADDED_COUNT');
    const deleted = observed('WORDS_DELETED_COUNT');
    const declaration = declared.get(entry.sequence);
    return {
      sequence: entry.sequence, entryDigest: entry.entryDigest, receiptDigest: entry.receiptDigest,
      sourceRevisionOrdinal: entry.receipt.sourceRevisionOrdinal, generation: entry.receipt.generation,
      added, deleted,
      net: combine(added, deleted, (left, right) => add(left, -right)),
      // Counts word operations, not unique word positions or semantic effort.
      touched: combine(added, deleted, add),
      sessions: observed('SESSIONS_COMPLETED_COUNT'), sceneEdits: observed('SCENES_EDITED_COUNT'),
      declaredTasks: metric(declaration?.declaredTaskCount ?? null, 'EXPLICIT_LOCAL_DECLARATION'),
      manualPhase: metric(declaration?.manualPhase ?? null, 'EXPLICIT_LOCAL_DECLARATION'),
    };
  });
  const projection = {
    schemaVersion: PULSE_HISTORY_SCHEMA, historyVersion: PULSE_HISTORY_VERSION, identity: expected,
    formulaVersion: PULSE_FORMULA_VERSION, formulaSetDigest: PULSE_FORMULA_SET_DIGEST, merkleRoot,
    declarationDigest: hashCanonicalValue(input.declarationSnapshot),
    rows, summary: Object.fromEntries(COUNT_FIELDS.map(field => [field, summarize(rows, field)])),
  };
  return freeze({ ...projection, projectionDigest: hashCanonicalValue(projection) });
}

export function assertPulseDescriptiveHistoryCurrent(projection, currentIdentity) {
  data(projection); data(currentIdentity);
  keys(projection, ['schemaVersion', 'historyVersion', 'identity', 'formulaVersion', 'formulaSetDigest', 'merkleRoot', 'declarationDigest', 'rows', 'summary', 'projectionDigest'], 'E_WP803_PROJECTION_SCHEMA');
  if (projection.schemaVersion !== PULSE_HISTORY_SCHEMA || projection.historyVersion !== PULSE_HISTORY_VERSION) fail('E_WP803_PROJECTION_SCHEMA');
  const expected = identity(currentIdentity);
  const actual = identity(projection.identity);
  if (!sameIdentity(actual, expected)) fail('E_WP803_PROJECTION_STALE');
  const { projectionDigest, ...payload } = projection;
  digest(projectionDigest, 'E_WP803_PROJECTION_DIGEST');
  if (hashCanonicalValue(payload) !== projectionDigest) fail('E_WP803_PROJECTION_TAMPER');
  return freeze(JSON.parse(JSON.stringify(projection)));
}
