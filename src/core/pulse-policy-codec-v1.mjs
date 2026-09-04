import { canonicalSerialize, hashCanonicalValue } from './browser-safe-hash.mjs';

export const PULSE_POLICY_CODEC_STAGE_ID = 'WP-800_PULSE_POLICY_CODEC';
export const PULSE_AGGREGATE_RECEIPT_SCHEMA_VERSION = 'yalken.r24.pulseLocalAggregateReceipt.v1';
export const PULSE_LOCAL_AGGREGATE_POLICY_ID = 'WP800_LOCAL_AGGREGATES_CONTENT_FREE_V1';
export const PULSE_AGGREGATE_RECEIPT_MAX_BYTES = 4096;
export const PULSE_AGGREGATE_VALUE_MAX = 1_000_000_000;

export const PULSE_METRIC_ALLOWLIST = Object.freeze([
  'ACTIVE_WRITING_SECONDS',
  'SCENES_EDITED_COUNT',
  'SESSIONS_COMPLETED_COUNT',
  'WORDS_ADDED_COUNT',
  'WORDS_DELETED_COUNT',
]);

export const PULSE_PRIVACY_POLICY = deepFreeze({
  scope: 'LOCAL_AGGREGATES_ONLY',
  content: 'DENIED',
  identity: 'DENIED',
  path: 'DENIED',
  network: 'DENIED',
  export: 'DENIED',
  telemetry: 'DENIED',
});

const RECEIPT_KEYS = Object.freeze([
  'aggregates',
  'generation',
  'payloadDigest',
  'policyId',
  'privacy',
  'schemaVersion',
  'sourceRevisionOrdinal',
]);
const INPUT_KEYS = Object.freeze(['aggregates', 'generation', 'sourceRevisionOrdinal']);
const AGGREGATE_KEYS = Object.freeze(['metricId', 'value']);
const CURRENT_KEYS = Object.freeze(['generation', 'sourceRevisionOrdinal']);
const ALLOWED_METRICS = new Set(PULSE_METRIC_ALLOWLIST);

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertOwnData(value, label = 'input', seen = new Set()) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (typeof value !== 'object' || seen.has(value)) fail('E_WP800_INPUT_NOT_PLAIN_DATA', label);
  seen.add(value);
  if (!Array.isArray(value) && !isPlainObject(value)) fail('E_WP800_INPUT_NOT_PLAIN_DATA', label);
  if (Object.getOwnPropertySymbols(value).length > 0) fail('E_WP800_INPUT_SYMBOL', label);
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) fail('E_WP800_INPUT_ACCESSOR', `${label}.${key}`);
    assertOwnData(descriptor.value, `${label}.${key}`, seen);
  }
  seen.delete(value);
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail('E_WP800_OBJECT_REQUIRED', label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('E_WP800_UNKNOWN_OR_MISSING_FIELD', label);
  }
}

function boundedOrdinal(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail('E_WP800_ORDINAL', label);
  return value;
}

function normalizeAggregates(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > PULSE_METRIC_ALLOWLIST.length) {
    fail('E_WP800_AGGREGATE_DENOMINATOR');
  }
  const seen = new Set();
  const rows = value.map((row, index) => {
    exactKeys(row, AGGREGATE_KEYS, `aggregates[${index}]`);
    if (!ALLOWED_METRICS.has(row.metricId)) fail('E_WP800_METRIC_NOT_ALLOWED', String(row.metricId));
    if (seen.has(row.metricId)) fail('E_WP800_DUPLICATE_METRIC', row.metricId);
    seen.add(row.metricId);
    if (!Number.isSafeInteger(row.value) || row.value < 0 || row.value > PULSE_AGGREGATE_VALUE_MAX) {
      fail('E_WP800_AGGREGATE_VALUE', row.metricId);
    }
    return { metricId: row.metricId, value: row.value };
  });
  return rows.sort((left, right) => PULSE_METRIC_ALLOWLIST.indexOf(left.metricId) - PULSE_METRIC_ALLOWLIST.indexOf(right.metricId));
}

function receiptPayload(receipt) {
  return {
    schemaVersion: receipt.schemaVersion,
    policyId: receipt.policyId,
    sourceRevisionOrdinal: receipt.sourceRevisionOrdinal,
    generation: receipt.generation,
    aggregates: receipt.aggregates,
    privacy: receipt.privacy,
  };
}

function sameCanonical(left, right) {
  return canonicalSerialize(left) === canonicalSerialize(right);
}

export function createPulseAggregateReceipt(input) {
  assertOwnData(input);
  exactKeys(input, INPUT_KEYS, 'input');
  const receipt = {
    schemaVersion: PULSE_AGGREGATE_RECEIPT_SCHEMA_VERSION,
    policyId: PULSE_LOCAL_AGGREGATE_POLICY_ID,
    sourceRevisionOrdinal: boundedOrdinal(input.sourceRevisionOrdinal, 'sourceRevisionOrdinal'),
    generation: boundedOrdinal(input.generation, 'generation'),
    aggregates: normalizeAggregates(input.aggregates),
    privacy: { ...PULSE_PRIVACY_POLICY },
  };
  return deepFreeze({ ...receipt, payloadDigest: hashCanonicalValue(receipt) });
}

export function verifyPulseAggregateReceipt(receipt) {
  assertOwnData(receipt, 'receipt');
  exactKeys(receipt, RECEIPT_KEYS, 'receipt');
  if (receipt.schemaVersion !== PULSE_AGGREGATE_RECEIPT_SCHEMA_VERSION) fail('E_WP800_RECEIPT_SCHEMA');
  if (receipt.policyId !== PULSE_LOCAL_AGGREGATE_POLICY_ID) fail('E_WP800_POLICY_ID');
  boundedOrdinal(receipt.sourceRevisionOrdinal, 'sourceRevisionOrdinal');
  boundedOrdinal(receipt.generation, 'generation');
  exactKeys(receipt.privacy, Object.keys(PULSE_PRIVACY_POLICY), 'privacy');
  if (!sameCanonical(receipt.privacy, PULSE_PRIVACY_POLICY)) fail('E_WP800_PRIVACY_POLICY');
  const aggregates = normalizeAggregates(receipt.aggregates);
  if (!sameCanonical(aggregates, receipt.aggregates)) fail('E_WP800_METRIC_ORDER');
  if (!/^[0-9a-f]{64}$/u.test(receipt.payloadDigest)) fail('E_WP800_RECEIPT_DIGEST_SHAPE');
  if (hashCanonicalValue(receiptPayload(receipt)) !== receipt.payloadDigest) fail('E_WP800_RECEIPT_DIGEST');
  return deepFreeze(JSON.parse(JSON.stringify(receipt)));
}

export function assertPulseAggregateReceiptCurrent(receipt, current) {
  const verified = verifyPulseAggregateReceipt(receipt);
  assertOwnData(current, 'current');
  exactKeys(current, CURRENT_KEYS, 'current');
  const sourceRevisionOrdinal = boundedOrdinal(current.sourceRevisionOrdinal, 'current.sourceRevisionOrdinal');
  const generation = boundedOrdinal(current.generation, 'current.generation');
  if (verified.sourceRevisionOrdinal !== sourceRevisionOrdinal) fail('E_WP800_STALE_SOURCE_REVISION');
  if (verified.generation !== generation) fail('E_WP800_STALE_GENERATION');
  return verified;
}

export function encodePulseAggregateReceipt(receipt) {
  const verified = verifyPulseAggregateReceipt(receipt);
  const encoded = `${canonicalSerialize(verified)}\n`;
  if (new TextEncoder().encode(encoded).byteLength > PULSE_AGGREGATE_RECEIPT_MAX_BYTES) fail('E_WP800_RECEIPT_BYTE_BUDGET');
  return encoded;
}

export function decodePulseAggregateReceipt(serialized, current = undefined) {
  let bytes;
  if (typeof serialized === 'string') bytes = new TextEncoder().encode(serialized);
  else if (serialized instanceof Uint8Array) bytes = serialized;
  else fail('E_WP800_RECEIPT_BYTES');
  if (bytes.byteLength === 0 || bytes.byteLength > PULSE_AGGREGATE_RECEIPT_MAX_BYTES) fail('E_WP800_RECEIPT_BYTE_BUDGET');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail('E_WP800_RECEIPT_UTF8');
  }
  if (!text.endsWith('\n') || text.endsWith('\n\n') || text.startsWith('\ufeff')) fail('E_WP800_RECEIPT_CANONICAL_BYTES');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('E_WP800_RECEIPT_JSON');
  }
  const verified = verifyPulseAggregateReceipt(parsed);
  if (encodePulseAggregateReceipt(verified) !== text) fail('E_WP800_RECEIPT_CANONICAL_BYTES');
  return current === undefined ? verified : assertPulseAggregateReceiptCurrent(verified, current);
}
