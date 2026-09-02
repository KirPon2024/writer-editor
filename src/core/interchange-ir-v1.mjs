import crypto from 'node:crypto';

export const INTERCHANGE_IR_ENVELOPE_SCHEMA_VERSION = 'yalken.interchange.ir-envelope.v1';

export const INTERCHANGE_IR_FAMILIES = Object.freeze({
  DOCUMENT: 'yalken.interchange.document-ir.v1',
  EVIDENCE: 'yalken.interchange.evidence-ir.v1',
  PROJECT: 'yalken.interchange.project-ir.v1',
  REVIEW: 'yalken.interchange.review-ir.v1',
});

export const INTERCHANGE_CAPABILITY_OPERATIONS = Object.freeze([
  'EXPORT_LOCAL',
  'IMPORT_CREATE',
  'PARSE',
  'PHYSICAL_ARTIFACT',
  'PROVIDER_SYNC',
  'REVIEW_APPLY',
  'ROUND_TRIP',
  'SERIALIZE',
]);

export const INTERCHANGE_CAPABILITY_LEVELS = Object.freeze([
  'DENIED',
  'UNSUPPORTED',
  'READ_ONLY',
  'LOSSY_WRITE',
  'FULL',
]);

export const INTERCHANGE_FIDELITY_DIMENSIONS = Object.freeze([
  'COMMENTS',
  'CONTENT',
  'EMBEDDED_ASSETS',
  'LAYOUT',
  'REVISIONS',
  'STRUCTURE',
  'STYLES',
  'UNKNOWN_FIELDS',
]);

export const INTERCHANGE_FIDELITY_LEVELS = Object.freeze([
  'NONE',
  'LOSSY',
  'BOUNDED',
  'EXACT',
]);

export const INTERCHANGE_IR_LIMITS = Object.freeze({
  maxBytes: 1_048_576,
  maxDepth: 32,
  maxNodes: 10_000,
  maxStringBytes: 262_144,
});

const FAMILY_IDS = Object.freeze(Object.keys(INTERCHANGE_IR_FAMILIES).sort());
const FAMILY_VERSIONS = new Set(Object.values(INTERCHANGE_IR_FAMILIES));
const CAPABILITY_RANK = new Map(INTERCHANGE_CAPABILITY_LEVELS.map((level, rank) => [level, rank]));
const FIDELITY_RANK = new Map(INTERCHANGE_FIDELITY_LEVELS.map((level, rank) => [level, rank]));
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ENVELOPE_KEYS = Object.freeze(['body', 'bodySha256', 'schemaVersion']);
const BODY_KEYS = Object.freeze(['familyId', 'familySchemaVersion', 'identity', 'payload']);
const IDENTITY_KEYS = Object.freeze(['entityId', 'generation', 'projectId', 'sourceRevision']);

function typedFailure(code, detail = '') {
  return Object.freeze({ ok: false, error: Object.freeze({ code, detail }) });
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.every((key) => typeof key === 'string')
    && JSON.stringify(actual.sort()) === JSON.stringify([...expected].sort());
}

function isCanonicalString(value) {
  return typeof value === 'string'
    && value === value.normalize('NFC')
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validateIdentity(identity) {
  if (!exactKeys(identity, IDENTITY_KEYS)) return typedFailure('E_INTERCHANGE_IDENTITY_SHAPE');
  for (const field of ['entityId', 'projectId', 'sourceRevision']) {
    const value = identity[field];
    if (!isCanonicalString(value) || value.length === 0 || Buffer.byteLength(value, 'utf8') > 256) {
      return typedFailure('E_INTERCHANGE_IDENTITY_FIELD', field);
    }
  }
  if (!Number.isSafeInteger(identity.generation) || identity.generation < 0) {
    return typedFailure('E_INTERCHANGE_IDENTITY_GENERATION');
  }
  return { ok: true };
}

function cloneAndValidateJson(value, limits = INTERCHANGE_IR_LIMITS) {
  let nodes = 0;
  const ancestors = new Set();

  const visit = (current, depth, trail) => {
    nodes += 1;
    if (nodes > limits.maxNodes) throw new Error(`E_INTERCHANGE_NODE_BUDGET:${trail}`);
    if (depth > limits.maxDepth) throw new Error(`E_INTERCHANGE_DEPTH_BUDGET:${trail}`);
    if (current === null || typeof current === 'boolean') return current;
    if (typeof current === 'string') {
      if (current !== current.normalize('NFC')) throw new Error(`E_INTERCHANGE_STRING_NOT_NFC:${trail}`);
      if (Buffer.byteLength(current, 'utf8') > limits.maxStringBytes) throw new Error(`E_INTERCHANGE_STRING_BUDGET:${trail}`);
      return current;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0)) throw new Error(`E_INTERCHANGE_NUMBER_INVALID:${trail}`);
      return current;
    }
    if (typeof current !== 'object') throw new Error(`E_INTERCHANGE_JSON_TYPE:${trail}`);
    if (ancestors.has(current)) throw new Error(`E_INTERCHANGE_CYCLE:${trail}`);
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        if (Object.getPrototypeOf(current) !== Array.prototype) throw new Error(`E_INTERCHANGE_ARRAY_PROTOTYPE:${trail}`);
        const keys = Reflect.ownKeys(current);
        const expected = Array.from({ length: current.length }, (_, index) => String(index));
        expected.push('length');
        if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error(`E_INTERCHANGE_SPARSE_OR_EXTENDED_ARRAY:${trail}`);
        const output = [];
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
            throw new Error(`E_INTERCHANGE_ARRAY_ACCESSOR:${trail}.${index}`);
          }
          output.push(visit(descriptor.value, depth + 1, `${trail}.${index}`));
        }
        return output;
      }
      if (Object.getPrototypeOf(current) !== Object.prototype) throw new Error(`E_INTERCHANGE_OBJECT_PROTOTYPE:${trail}`);
      const keys = Reflect.ownKeys(current);
      if (keys.some((key) => typeof key !== 'string')) throw new Error(`E_INTERCHANGE_SYMBOL_KEY:${trail}`);
      const output = {};
      for (const key of keys.sort()) {
        if (!isCanonicalString(key)) throw new Error(`E_INTERCHANGE_KEY_INVALID:${trail}.${key}`);
        if (UNSAFE_KEYS.has(key)) throw new Error(`E_INTERCHANGE_UNSAFE_KEY:${trail}.${key}`);
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          throw new Error(`E_INTERCHANGE_ACCESSOR_OR_HIDDEN_KEY:${trail}.${key}`);
        }
        output[key] = visit(descriptor.value, depth + 1, `${trail}.${key}`);
      }
      return output;
    } finally {
      ancestors.delete(current);
    }
  };

  try {
    return { ok: true, value: visit(value, 0, '$'), nodeCount: nodes };
  } catch (error) {
    const [code, ...parts] = String(error?.message || 'E_INTERCHANGE_JSON_INVALID').split(':');
    return typedFailure(code, parts.join(':'));
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateBody(body) {
  if (!exactKeys(body, BODY_KEYS)) return typedFailure('E_INTERCHANGE_BODY_SHAPE');
  if (!FAMILY_IDS.includes(body.familyId)) return typedFailure('E_INTERCHANGE_FAMILY_ID');
  if (body.familySchemaVersion !== INTERCHANGE_IR_FAMILIES[body.familyId]
      || !FAMILY_VERSIONS.has(body.familySchemaVersion)) {
    return typedFailure('E_INTERCHANGE_FAMILY_VERSION');
  }
  const identity = validateIdentity(body.identity);
  if (!identity.ok) return identity;
  const payload = cloneAndValidateJson(body.payload);
  if (!payload.ok) return payload;
  return {
    ok: true,
    value: {
      familyId: body.familyId,
      familySchemaVersion: body.familySchemaVersion,
      identity: {
        entityId: body.identity.entityId,
        generation: body.identity.generation,
        projectId: body.identity.projectId,
        sourceRevision: body.identity.sourceRevision,
      },
      payload: payload.value,
    },
    payloadNodeCount: payload.nodeCount,
  };
}

export function createInterchangeIrEnvelope(input = {}) {
  if (!exactKeys(input, ['familyId', 'identity', 'payload'])) return typedFailure('E_INTERCHANGE_CREATE_SHAPE');
  const bodyResult = validateBody({
    familyId: input.familyId,
    familySchemaVersion: INTERCHANGE_IR_FAMILIES[input.familyId],
    identity: input.identity,
    payload: input.payload,
  });
  if (!bodyResult.ok) return bodyResult;
  const body = bodyResult.value;
  const bodySha256 = sha256(canonicalBytes(body));
  const envelope = {
    body,
    bodySha256,
    schemaVersion: INTERCHANGE_IR_ENVELOPE_SCHEMA_VERSION,
  };
  const bytes = canonicalBytes(envelope);
  if (bytes.length > INTERCHANGE_IR_LIMITS.maxBytes) return typedFailure('E_INTERCHANGE_BYTE_BUDGET');
  return {
    ok: true,
    value: deepFreeze(envelope),
    bytes,
    sha256: sha256(bytes),
    byteLength: bytes.length,
    payloadNodeCount: bodyResult.payloadNodeCount,
  };
}

export function validateInterchangeIrEnvelope(envelope = {}) {
  if (!exactKeys(envelope, ENVELOPE_KEYS)) return typedFailure('E_INTERCHANGE_ENVELOPE_SHAPE');
  if (envelope.schemaVersion !== INTERCHANGE_IR_ENVELOPE_SCHEMA_VERSION) {
    return typedFailure('E_INTERCHANGE_ENVELOPE_VERSION');
  }
  if (typeof envelope.bodySha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(envelope.bodySha256)) {
    return typedFailure('E_INTERCHANGE_BODY_DIGEST_SHAPE');
  }
  const body = validateBody(envelope.body);
  if (!body.ok) return body;
  const expected = sha256(canonicalBytes(body.value));
  if (envelope.bodySha256 !== expected) return typedFailure('E_INTERCHANGE_BODY_DIGEST_MISMATCH');
  const value = deepFreeze({
    body: body.value,
    bodySha256: envelope.bodySha256,
    schemaVersion: envelope.schemaVersion,
  });
  const bytes = canonicalBytes(value);
  if (bytes.length > INTERCHANGE_IR_LIMITS.maxBytes) return typedFailure('E_INTERCHANGE_BYTE_BUDGET');
  return {
    ok: true,
    value,
    bytes,
    sha256: sha256(bytes),
    byteLength: bytes.length,
    payloadNodeCount: body.payloadNodeCount,
  };
}

export function serializeInterchangeIrEnvelope(envelope = {}) {
  return validateInterchangeIrEnvelope(envelope);
}

export function parseInterchangeIrEnvelope(input) {
  if (!(Buffer.isBuffer(input) || input instanceof Uint8Array || typeof input === 'string')) {
    return typedFailure('E_INTERCHANGE_PARSE_INPUT');
  }
  const bytes = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(input);
  if (bytes.length === 0 || bytes.length > INTERCHANGE_IR_LIMITS.maxBytes) {
    return typedFailure('E_INTERCHANGE_BYTE_BUDGET');
  }
  const decoded = bytes.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(bytes)) return typedFailure('E_INTERCHANGE_UTF8_INVALID');
  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return typedFailure('E_INTERCHANGE_JSON_PARSE');
  }
  const verified = validateInterchangeIrEnvelope(parsed);
  if (!verified.ok) return verified;
  if (!verified.bytes.equals(bytes)) return typedFailure('E_INTERCHANGE_NON_CANONICAL_BYTES');
  return verified;
}

function validateCompleteLatticeRows(rows, rowIdKey, levels, denominator, label) {
  if (!Array.isArray(rows) || rows.length === 0) return typedFailure(`E_INTERCHANGE_${label}_ROWS`);
  const ids = new Set();
  const normalized = [];
  for (const row of rows) {
    if (!exactKeys(row, [rowIdKey, 'values'])) return typedFailure(`E_INTERCHANGE_${label}_ROW_SHAPE`);
    if (!isCanonicalString(row[rowIdKey]) || row[rowIdKey].length === 0 || ids.has(row[rowIdKey])) {
      return typedFailure(`E_INTERCHANGE_${label}_ROW_ID`);
    }
    ids.add(row[rowIdKey]);
    if (!exactKeys(row.values, denominator)) return typedFailure(`E_INTERCHANGE_${label}_DENOMINATOR`, row[rowIdKey]);
    const values = {};
    for (const key of denominator) {
      if (!levels.has(row.values[key])) return typedFailure(`E_INTERCHANGE_${label}_LEVEL`, `${row[rowIdKey]}:${key}`);
      values[key] = row.values[key];
    }
    normalized.push({ [rowIdKey]: row[rowIdKey], values });
  }
  normalized.sort((left, right) => left[rowIdKey].localeCompare(right[rowIdKey], 'en'));
  return { ok: true, rows: normalized };
}

export function composeInterchangeCapabilities(profiles, requiredOperations = INTERCHANGE_CAPABILITY_OPERATIONS) {
  if (!Array.isArray(requiredOperations) || requiredOperations.length === 0
      || new Set(requiredOperations).size !== requiredOperations.length
      || requiredOperations.some((operation) => !INTERCHANGE_CAPABILITY_OPERATIONS.includes(operation))) {
    return typedFailure('E_INTERCHANGE_CAPABILITY_REQUIRED_OPERATIONS');
  }
  const rows = validateCompleteLatticeRows(
    profiles,
    'profileId',
    CAPABILITY_RANK,
    INTERCHANGE_CAPABILITY_OPERATIONS,
    'CAPABILITY',
  );
  if (!rows.ok) return rows;
  const required = [...requiredOperations].sort();
  const witnesses = [];
  let weakestRank = INTERCHANGE_CAPABILITY_LEVELS.length - 1;
  for (const row of rows.rows) {
    for (const operation of required) {
      const level = row.values[operation];
      const rank = CAPABILITY_RANK.get(level);
      if (rank < weakestRank) {
        weakestRank = rank;
        witnesses.length = 0;
      }
      if (rank === weakestRank) witnesses.push({ operation, profileId: row.profileId, level });
    }
  }
  witnesses.sort((left, right) => `${left.profileId}:${left.operation}`.localeCompare(`${right.profileId}:${right.operation}`, 'en'));
  return deepFreeze({
    ok: true,
    level: INTERCHANGE_CAPABILITY_LEVELS[weakestRank],
    requiredOperations: required,
    profileCount: rows.rows.length,
    evaluatedCellCount: rows.rows.length * required.length,
    witnesses,
  });
}

export function composeInterchangeFidelity(reports) {
  const rows = validateCompleteLatticeRows(
    reports,
    'reportId',
    FIDELITY_RANK,
    INTERCHANGE_FIDELITY_DIMENSIONS,
    'FIDELITY',
  );
  if (!rows.ok) return rows;
  const dimensions = {};
  let overallRank = INTERCHANGE_FIDELITY_LEVELS.length - 1;
  for (const dimension of INTERCHANGE_FIDELITY_DIMENSIONS) {
    let dimensionRank = INTERCHANGE_FIDELITY_LEVELS.length - 1;
    for (const row of rows.rows) dimensionRank = Math.min(dimensionRank, FIDELITY_RANK.get(row.values[dimension]));
    dimensions[dimension] = INTERCHANGE_FIDELITY_LEVELS[dimensionRank];
    overallRank = Math.min(overallRank, dimensionRank);
  }
  const overallLevel = INTERCHANGE_FIDELITY_LEVELS[overallRank];
  const witnesses = [];
  for (const row of rows.rows) {
    for (const dimension of INTERCHANGE_FIDELITY_DIMENSIONS) {
      if (FIDELITY_RANK.get(row.values[dimension]) === overallRank) {
        witnesses.push({ dimension, level: overallLevel, reportId: row.reportId });
      }
    }
  }
  witnesses.sort((left, right) => `${left.reportId}:${left.dimension}`.localeCompare(`${right.reportId}:${right.dimension}`, 'en'));
  return deepFreeze({
    ok: true,
    level: overallLevel,
    dimensions,
    reportCount: rows.rows.length,
    evaluatedCellCount: rows.rows.length * INTERCHANGE_FIDELITY_DIMENSIONS.length,
    witnesses,
  });
}
