import crypto from 'node:crypto';
import { types } from 'node:util';
import {
  createInterchangeIrEnvelope,
  parseInterchangeIrEnvelope,
} from './interchange-ir-v1.mjs';

export const EVIDENCE_CAPSULE_EXPORT_SCHEMA_VERSION = 'yalken.interchange.evidence-capsule.v1';
export const EVIDENCE_CAPSULE_PROFILES = Object.freeze(['ATLAS', 'PULSE', 'WSE']);
export const EVIDENCE_CAPSULE_EXPORT_LIMITS = Object.freeze({
  maxAnchorIdsPerRecord: 128,
  maxIdentifierBytes: 256,
  maxRecords: 4_096,
});

const INPUT_KEYS = Object.freeze([
  'capsuleId',
  'currentIdentity',
  'expectedIdentity',
  'records',
  'requestedProfiles',
]);
const IDENTITY_KEYS = Object.freeze(['entityId', 'generation', 'projectId', 'sourceRevision']);
const RECORD_KEYS = Object.freeze([
  'anchorIds',
  'evidenceDigest',
  'evidenceId',
  'evidenceKind',
  'generation',
  'profileId',
  'projectId',
  'sourceRevision',
  'status',
]);
const PAYLOAD_KEYS = Object.freeze(['capsuleId', 'counts', 'policy', 'profiles', 'records', 'schemaVersion']);
const COUNT_KEYS = Object.freeze([
  'availableProfileDenominator',
  'profileDenominator',
  'recordDenominator',
  'unavailableProfileDenominator',
]);
const POLICY_KEYS = Object.freeze([
  'commandAuthority',
  'contentMode',
  'pathAuthority',
  'productMutationAuthority',
  'providerAuthority',
  'secretMaterialIncluded',
  'sourceContentIncluded',
]);
const PROFILE_KEYS = Object.freeze(['evidenceDigestSetSha256', 'profileId', 'recordDenominator', 'status']);
const PROFILE_SET = new Set(EVIDENCE_CAPSULE_PROFILES);
const STATUS_SET = new Set(['CURRENT', 'UNKNOWN']);
const IDENTIFIER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._:@+-]{0,254}[A-Za-z0-9])?$/u;
const SECRET_TOKEN_RE = /(?:^|[._:@+-])(?:api[-_]?key|auth|bearer|credential|password|private[-_]?key|secret|token)(?:$|[._:@+-])/iu;
const HEX_64_RE = /^[0-9a-f]{64}$/u;

function fail(code, detail = '') {
  return Object.freeze({
    ok: false,
    status: 'REJECTED',
    error: Object.freeze({ code, detail }),
    artifactPublished: false,
    commandAuthority: false,
    pathAuthority: false,
    productMutationAuthority: false,
    providerAuthority: false,
  });
}

function reject(code, detail = '') {
  const error = new Error(code);
  error.detail = detail;
  throw error;
}

function attempt(operation) {
  try {
    return operation();
  } catch (error) {
    if (typeof error?.message === 'string' && /^E_CAPSULE_[A-Z0-9_]+$/u.test(error.message)) {
      return fail(error.message, error.detail || '');
    }
    throw error;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function digest(value) {
  return sha256(Buffer.from(canonical(value), 'utf8'));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function exactObject(value, keys, code) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) reject(code);
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== 'string')
      || canonical([...actual].sort()) !== canonical([...keys].sort())) reject(code);
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) reject('E_CAPSULE_ACCESSOR');
  }
}

function exactArray(value, maxLength, code) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > maxLength || Reflect.ownKeys(value).length !== value.length + 1) reject(code);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) reject('E_CAPSULE_ACCESSOR');
  }
}

function identifier(value, field) {
  if (typeof value !== 'string' || value !== value.normalize('NFC')
      || Buffer.byteLength(value, 'utf8') > EVIDENCE_CAPSULE_EXPORT_LIMITS.maxIdentifierBytes
      || !IDENTIFIER_RE.test(value)) reject('E_CAPSULE_IDENTIFIER', field);
  if (SECRET_TOKEN_RE.test(value)) reject('E_CAPSULE_SECRET_LIKE_IDENTIFIER', field);
  return value;
}

function identity(value) {
  exactObject(value, IDENTITY_KEYS, 'E_CAPSULE_IDENTITY_SHAPE');
  const normalized = {
    entityId: identifier(value.entityId, 'entityId'),
    generation: value.generation,
    projectId: identifier(value.projectId, 'projectId'),
    sourceRevision: identifier(value.sourceRevision, 'sourceRevision'),
  };
  if (!Number.isSafeInteger(normalized.generation) || normalized.generation < 0) {
    reject('E_CAPSULE_IDENTITY_GENERATION');
  }
  return normalized;
}

function identityMatches(left, right) {
  return canonical(left) === canonical(right);
}

function profileList(value) {
  exactArray(value, EVIDENCE_CAPSULE_PROFILES.length, 'E_CAPSULE_PROFILE_LIST');
  if (value.length === 0) reject('E_CAPSULE_PROFILE_LIST');
  const profiles = value.map((profileId) => {
    if (!PROFILE_SET.has(profileId)) reject('E_CAPSULE_PROFILE_ID');
    return profileId;
  });
  if (new Set(profiles).size !== profiles.length) reject('E_CAPSULE_PROFILE_DUPLICATE');
  return profiles.sort();
}

function anchorList(value) {
  exactArray(value, EVIDENCE_CAPSULE_EXPORT_LIMITS.maxAnchorIdsPerRecord, 'E_CAPSULE_ANCHOR_LIST');
  const anchors = value.map((anchorId) => identifier(anchorId, 'anchorId'));
  if (new Set(anchors).size !== anchors.length) reject('E_CAPSULE_ANCHOR_DUPLICATE');
  return anchors.sort();
}

function recordList(value, boundIdentity, requestedProfiles) {
  exactArray(value, EVIDENCE_CAPSULE_EXPORT_LIMITS.maxRecords, 'E_CAPSULE_RECORD_LIST');
  const requested = new Set(requestedProfiles);
  const seen = new Set();
  const records = value.map((record) => {
    exactObject(record, RECORD_KEYS, 'E_CAPSULE_RECORD_SHAPE');
    if (!requested.has(record.profileId)) reject('E_CAPSULE_RECORD_PROFILE');
    if (!STATUS_SET.has(record.status)) reject('E_CAPSULE_RECORD_STATUS');
    if (!HEX_64_RE.test(record.evidenceDigest)) reject('E_CAPSULE_EVIDENCE_DIGEST');
    const normalized = {
      anchorIds: anchorList(record.anchorIds),
      evidenceDigest: record.evidenceDigest,
      evidenceId: identifier(record.evidenceId, 'evidenceId'),
      evidenceKind: identifier(record.evidenceKind, 'evidenceKind'),
      generation: record.generation,
      profileId: record.profileId,
      projectId: identifier(record.projectId, 'projectId'),
      sourceRevision: identifier(record.sourceRevision, 'sourceRevision'),
      status: record.status,
    };
    if (!Number.isSafeInteger(normalized.generation) || normalized.generation < 0) {
      reject('E_CAPSULE_RECORD_GENERATION');
    }
    if (normalized.projectId !== boundIdentity.projectId
        || normalized.sourceRevision !== boundIdentity.sourceRevision
        || normalized.generation !== boundIdentity.generation) reject('E_CAPSULE_STALE_RECORD');
    const key = `${normalized.profileId}:${normalized.evidenceId}`;
    if (seen.has(key)) reject('E_CAPSULE_RECORD_DUPLICATE');
    seen.add(key);
    return normalized;
  });
  return records.sort((left, right) => {
    const leftKey = `${left.profileId}:${left.evidenceId}`;
    const rightKey = `${right.profileId}:${right.evidenceId}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function buildPayload({ capsuleId, identity: boundIdentity, records, requestedProfiles }) {
  const normalizedRecords = recordList(records, boundIdentity, requestedProfiles);
  const profiles = requestedProfiles.map((profileId) => {
    const matches = normalizedRecords.filter((record) => record.profileId === profileId);
    return {
      evidenceDigestSetSha256: digest(matches.map((record) => record.evidenceDigest)),
      profileId,
      recordDenominator: matches.length,
      status: matches.length === 0 ? 'UNAVAILABLE' : 'AVAILABLE',
    };
  });
  const available = profiles.filter((profile) => profile.status === 'AVAILABLE').length;
  return {
    capsuleId: identifier(capsuleId, 'capsuleId'),
    counts: {
      availableProfileDenominator: available,
      profileDenominator: profiles.length,
      recordDenominator: normalizedRecords.length,
      unavailableProfileDenominator: profiles.length - available,
    },
    policy: {
      commandAuthority: false,
      contentMode: 'METADATA_ONLY_DIGESTS_AND_ANCHORS',
      pathAuthority: false,
      productMutationAuthority: false,
      providerAuthority: false,
      secretMaterialIncluded: false,
      sourceContentIncluded: false,
    },
    profiles,
    records: normalizedRecords,
    schemaVersion: EVIDENCE_CAPSULE_EXPORT_SCHEMA_VERSION,
  };
}

function validatePayload(payload, boundIdentity) {
  exactObject(payload, PAYLOAD_KEYS, 'E_CAPSULE_PAYLOAD_SHAPE');
  if (payload.schemaVersion !== EVIDENCE_CAPSULE_EXPORT_SCHEMA_VERSION) reject('E_CAPSULE_SCHEMA');
  exactObject(payload.counts, COUNT_KEYS, 'E_CAPSULE_COUNTS_SHAPE');
  exactObject(payload.policy, POLICY_KEYS, 'E_CAPSULE_POLICY_SHAPE');
  if (payload.policy.contentMode !== 'METADATA_ONLY_DIGESTS_AND_ANCHORS'
      || payload.policy.commandAuthority !== false
      || payload.policy.pathAuthority !== false
      || payload.policy.productMutationAuthority !== false
      || payload.policy.providerAuthority !== false
      || payload.policy.secretMaterialIncluded !== false
      || payload.policy.sourceContentIncluded !== false) reject('E_CAPSULE_POLICY');
  exactArray(payload.profiles, EVIDENCE_CAPSULE_PROFILES.length, 'E_CAPSULE_PROFILE_LIST');
  const requestedProfiles = payload.profiles.map((profile) => {
    exactObject(profile, PROFILE_KEYS, 'E_CAPSULE_PROFILE_SHAPE');
    return profile.profileId;
  });
  const rebuilt = buildPayload({
    capsuleId: payload.capsuleId,
    identity: boundIdentity,
    records: payload.records,
    requestedProfiles: profileList(requestedProfiles),
  });
  if (canonical(payload) !== canonical(rebuilt)) reject('E_CAPSULE_ACCOUNTING_MISMATCH');
  return rebuilt;
}

export function createEvidenceCapsuleExport(input = {}) {
  return attempt(() => {
    exactObject(input, INPUT_KEYS, 'E_CAPSULE_INPUT_SHAPE');
    const currentIdentity = identity(input.currentIdentity);
    const expectedIdentity = identity(input.expectedIdentity);
    if (!identityMatches(currentIdentity, expectedIdentity)) reject('E_CAPSULE_STALE_IDENTITY');
    const requestedProfiles = profileList(input.requestedProfiles);
    const payload = buildPayload({
      capsuleId: input.capsuleId,
      identity: currentIdentity,
      records: input.records,
      requestedProfiles,
    });
    const created = createInterchangeIrEnvelope({ familyId: 'EVIDENCE', identity: currentIdentity, payload });
    if (!created.ok) reject('E_CAPSULE_IR_ENVELOPE');
    return deepFreeze({
      ok: true,
      status: 'READY_FOR_CALLER_OWNED_LOCAL_ARTIFACT_EFFECT',
      artifactPublished: false,
      byteLength: created.byteLength,
      bytes: Buffer.from(created.bytes),
      commandAuthority: false,
      envelope: created.value,
      pathAuthority: false,
      productMutationAuthority: false,
      providerAuthority: false,
      sha256: created.sha256,
    });
  });
}

export function parseEvidenceCapsuleExport(input = {}) {
  return attempt(() => {
    exactObject(input, ['bytes', 'expectedIdentity'], 'E_CAPSULE_PARSE_INPUT_SHAPE');
    if (types.isProxy(input.bytes)
        || !(Buffer.isBuffer(input.bytes) || input.bytes instanceof Uint8Array || typeof input.bytes === 'string')) {
      reject('E_CAPSULE_PARSE_BYTES');
    }
    const expectedIdentity = identity(input.expectedIdentity);
    const parsed = parseInterchangeIrEnvelope(input.bytes);
    if (!parsed.ok || parsed.value.body.familyId !== 'EVIDENCE') reject('E_CAPSULE_IR_ENVELOPE');
    if (!identityMatches(parsed.value.body.identity, expectedIdentity)) reject('E_CAPSULE_STALE_IDENTITY');
    const payload = validatePayload(parsed.value.body.payload, expectedIdentity);
    return deepFreeze({
      ok: true,
      status: 'VERIFIED_READ_ONLY_EVIDENCE_CAPSULE',
      artifactPublished: false,
      byteLength: parsed.byteLength,
      commandAuthority: false,
      envelope: parsed.value,
      pathAuthority: false,
      payload,
      productMutationAuthority: false,
      providerAuthority: false,
      sha256: parsed.sha256,
    });
  });
}
