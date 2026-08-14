import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  createSourceFenceTokenV1,
  evaluateSourceFenceV1,
  SOURCE_FENCE_V1_SCHEMAS,
} from './sourceFenceV1.mjs';

export const BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG = 'yalken.blackBox.strictCapsuleRecover.p0cV1';

export const BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS = Object.freeze({
  buildRequest: 'yalken.blackBoxStrictCapsuleRecover.buildRequest.v1',
  capsule: 'yalken.blackBoxStrictCapsuleRecover.capsule.v1',
  ciphertext: 'yalken.blackBoxStrictCapsuleRecover.ciphertext.v1',
  corePayload: 'yalken.blackBoxStrictCapsuleRecover.corePayload.v1',
  ephemeralCorePayload: 'yalken.blackBoxStrictCapsuleRecover.ephemeralCorePayload.v1',
  featureFlag: 'yalken.blackBoxStrictCapsuleRecover.featureFlag.v1',
  identity: 'yalken.blackBoxStrictCapsuleRecover.identity.v1',
  manifest: 'yalken.blackBoxStrictCapsuleRecover.manifest.v1',
  plaintext: 'yalken.blackBoxStrictCapsuleRecover.plaintext.v1',
  providerPin: 'yalken.blackBoxStrictCapsuleRecover.providerPin.v1',
  receipt: 'yalken.blackBoxStrictCapsuleRecover.receipt.v1',
  recipient: 'yalken.blackBoxStrictCapsuleRecover.recipient.v1',
  recoverPlan: 'yalken.blackBoxStrictCapsuleRecover.recoverPlan.v1',
  recoverRequest: 'yalken.blackBoxStrictCapsuleRecover.recoverRequest.v1',
  result: 'yalken.blackBoxStrictCapsuleRecover.result.v1',
  sourceBinding: 'yalken.blackBoxStrictCapsuleRecover.sourceBinding.v1',
});

export const BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES = Object.freeze({
  CAPSULE_BUILT: 'YALKEN_BLACK_BOX_P0C_CAPSULE_BUILT',
  CAPSULE_MANIFEST_MISMATCH: 'YALKEN_BLACK_BOX_P0C_CAPSULE_MANIFEST_MISMATCH',
  EPHEMERAL_SINK_REJECTED: 'YALKEN_BLACK_BOX_P0C_EPHEMERAL_SINK_REJECTED',
  FEATURE_DISABLED: 'YALKEN_BLACK_BOX_P0C_FEATURE_DISABLED',
  FIELD_INVALID: 'YALKEN_BLACK_BOX_P0C_FIELD_INVALID',
  KEYSET_INVALID: 'YALKEN_BLACK_BOX_P0C_KEYSET_INVALID',
  PROVIDER_DECRYPT_FAILED: 'YALKEN_BLACK_BOX_P0C_PROVIDER_DECRYPT_FAILED',
  PROVIDER_ENCRYPT_FAILED: 'YALKEN_BLACK_BOX_P0C_PROVIDER_ENCRYPT_FAILED',
  PROVIDER_INSPECT_FAILED: 'YALKEN_BLACK_BOX_P0C_PROVIDER_INSPECT_FAILED',
  PROVIDER_MISSING: 'YALKEN_BLACK_BOX_P0C_PROVIDER_MISSING',
  PROVIDER_PIN_MISMATCH: 'YALKEN_BLACK_BOX_P0C_PROVIDER_PIN_MISMATCH',
  PROVIDER_ROUNDTRIP_FAILED: 'YALKEN_BLACK_BOX_P0C_PROVIDER_ROUNDTRIP_FAILED',
  RECOVER_PREVIEW_READY: 'YALKEN_BLACK_BOX_P0C_RECOVER_PREVIEW_READY',
  SOURCE_BINDING_MISMATCH: 'YALKEN_BLACK_BOX_P0C_SOURCE_BINDING_MISMATCH',
  SOURCE_FENCE_REJECTED: 'YALKEN_BLACK_BOX_P0C_SOURCE_FENCE_REJECTED',
});

const BUILD_REQUEST_KEYS = Object.freeze([
  'auditIdentity',
  'corePayload',
  'expectations',
  'featureFlags',
  'providerPin',
  'recipient',
  'schemaVersion',
  'sourceBinding',
  'sourceFence',
]);
const RECOVER_REQUEST_KEYS = Object.freeze([
  'capsule',
  'expectations',
  'expectedSourceBinding',
  'featureFlags',
  'identity',
  'providerPin',
  'schemaVersion',
]);
const PROVIDER_PIN_KEYS = Object.freeze([
  'artifactSha256',
  'artifactUrl',
  'executables',
  'kind',
  'platform',
  'proofSha256',
  'providerId',
  'releaseUrl',
  'schemaVersion',
  'sigsum',
  'version',
]);
const PROVIDER_EXECUTABLE_KEYS = Object.freeze(['ageInspectPath', 'ageInspectSha256', 'agePath', 'ageSha256']);
const PROVIDER_SIGSUM_KEYS = Object.freeze(['keyDigest', 'policy', 'verified']);
const SOURCE_BINDING_KEYS = Object.freeze([
  'canonicalRevision',
  'documentId',
  'generation',
  'projectId',
  'rootId',
  'schemaVersion',
  'sourceSetDigest',
  'workingRevision',
]);
const RECIPIENT_KEYS = Object.freeze(['fingerprint', 'publicKey', 'schemaVersion', 'type']);
const IDENTITY_KEYS = Object.freeze(['fingerprint', 'schemaVersion', 'secretKeyBase64', 'type']);
const CORE_PAYLOAD_KEYS = Object.freeze(['byteLength', 'bytesBase64', 'schemaVersion', 'sha256', 'sourceSetDigest', 'type']);
const EXPECTATION_KEYS = Object.freeze([
  'importMode',
  'liveProjectOverwrite',
  'ownerKeyOutsideBuilder',
  'quarantineRequired',
  'requireCiphertextBoundManifest',
  'requireNoPlaintextInReceipt',
  'requireProviderExact',
  'requireStandardAgeV1',
  'requireX25519Recipient',
]);
const SOURCE_FENCE_KEYS = Object.freeze(['authority', 'current', 'expected', 'fence']);
const CAPSULE_KEYS = Object.freeze(['ciphertext', 'manifest', 'provider', 'recipient', 'schemaVersion', 'sourceBinding', 'type']);
const CAPSULE_PROVIDER_KEYS = Object.freeze([
  'artifactSha256',
  'proofSha256',
  'providerId',
  'providerPinDigest',
  'sigsumVerified',
  'version',
]);
const MANIFEST_KEYS = Object.freeze([
  'ciphertextSha256',
  'corePayloadSha256',
  'importMode',
  'manifestDigest',
  'plaintextSha256',
  'providerPinDigest',
  'recipientFingerprint',
  'schemaVersion',
  'sourceBindingDigest',
]);
const CIPHERTEXT_KEYS = Object.freeze(['byteLength', 'bytesBase64', 'encoding', 'schemaVersion', 'sha256']);
const PLAINTEXT_KEYS = Object.freeze(['corePayload', 'recovery', 'schemaVersion', 'sourceBinding', 'type']);
const PLAINTEXT_RECOVERY_KEYS = Object.freeze(['importMode', 'liveProjectOverwrite', 'ownerKeyOutsideBuilder', 'quarantineRequired']);

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const VERSION = 'v1.3.1';
const STANDARD_AGE_V1 = 'age-encryption.org/v1';
const X25519 = 'X25519';
const CAPSULE_TYPE = 'BLACK_BOX_STRICT_AGE_X25519_CAPSULE_V1';
const CORE_PAYLOAD_TYPE = 'BLACK_BOX_CORE_GENOME_V1';
const RECIPIENT_TYPE = 'AGE_X25519_RECIPIENT';
const IDENTITY_TYPE = 'AGE_X25519_IDENTITY';
const IMPORT_AS_NEW = 'IMPORT_AS_NEW_PROJECT_ONLY';
const MAX_CORE_BYTES = 1024 * 1024;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if ((isPlainObject(nested) || Array.isArray(nested)) && !Object.isFrozen(nested)) deepFreeze(nested);
  }
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(bytes) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')}`;
}

function sha256Stable(value) {
  return sha256Buffer(Buffer.from(stableJson(value), 'utf8'));
}

function sortedKeys(value) {
  return isPlainObject(value) ? Object.keys(value).sort() : [];
}

function sameKeys(value, keys) {
  const actual = sortedKeys(value);
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function reason(code, field, expected, actual) {
  const out = { code, field };
  if (expected !== undefined) out.expected = expected;
  if (actual !== undefined) out.actual = actual;
  return Object.freeze(out);
}

function addKeysetReason(reasons, field, actual, expected) {
  reasons.push(reason(
    BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.KEYSET_INVALID,
    field,
    expected,
    sortedKeys(actual),
  ));
}

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function normalizeIdentifier(value, { allowSlash = false } = {}) {
  if (typeof value !== 'string') return '';
  if (!value || value.trim() !== value || /[\u0000-\u001F\\]/u.test(value)) return '';
  if (!allowSlash && value.includes('/')) return '';
  if (allowSlash) {
    if (value.startsWith('/')) return '';
    const segments = value.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return '';
  }
  return value;
}

function normalizeRevision(value) {
  if (typeof value !== 'string') return '';
  if (!value || value.trim() !== value || /[\u0000-\u001F]/u.test(value)) return '';
  return value;
}

function decodeBase64(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) return null;
  return bytes;
}

function deny(code, reasons = [reason(code, 'request')], details = {}) {
  return deepFreeze({
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.result,
    ok: false,
    decision: 'DENY',
    code,
    reasons,
    ...details,
  });
}

function pass(code, payload) {
  return deepFreeze({
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.result,
    ok: true,
    decision: 'PASS',
    code,
    ...payload,
  });
}

function validateProviderPin(reasons, providerPin) {
  if (!isPlainObject(providerPin)) {
    addKeysetReason(reasons, 'providerPin', providerPin, PROVIDER_PIN_KEYS);
    return;
  }
  if (!sameKeys(providerPin, PROVIDER_PIN_KEYS)) addKeysetReason(reasons, 'providerPin', providerPin, PROVIDER_PIN_KEYS);
  if (providerPin.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.providerPin) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'providerPin.schemaVersion'));
  if (providerPin.kind !== 'OFFICIAL_AGE_CLI') reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'providerPin.kind'));
  if (!normalizeIdentifier(providerPin.providerId)) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'providerPin.providerId'));
  if (providerPin.version !== VERSION) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'providerPin.version'));
  if (providerPin.platform !== 'darwin-arm64') reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'providerPin.platform'));
  for (const key of ['releaseUrl', 'artifactUrl']) {
    if (typeof providerPin[key] !== 'string' || !providerPin[key].startsWith('https://github.com/FiloSottile/age/')) {
      reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `providerPin.${key}`));
    }
  }
  if (!validDigest(providerPin.artifactSha256)) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'providerPin.artifactSha256'));
  if (!validDigest(providerPin.proofSha256)) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'providerPin.proofSha256'));

  if (!isPlainObject(providerPin.sigsum)) {
    addKeysetReason(reasons, 'providerPin.sigsum', providerPin.sigsum, PROVIDER_SIGSUM_KEYS);
  } else {
    if (!sameKeys(providerPin.sigsum, PROVIDER_SIGSUM_KEYS)) addKeysetReason(reasons, 'providerPin.sigsum', providerPin.sigsum, PROVIDER_SIGSUM_KEYS);
    if (providerPin.sigsum.verified !== true) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'providerPin.sigsum.verified'));
    if (providerPin.sigsum.policy !== 'sigsum-generic-2025-1') reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'providerPin.sigsum.policy'));
    if (!validDigest(providerPin.sigsum.keyDigest)) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'providerPin.sigsum.keyDigest'));
  }

  if (!isPlainObject(providerPin.executables)) {
    addKeysetReason(reasons, 'providerPin.executables', providerPin.executables, PROVIDER_EXECUTABLE_KEYS);
  } else {
    if (!sameKeys(providerPin.executables, PROVIDER_EXECUTABLE_KEYS)) addKeysetReason(reasons, 'providerPin.executables', providerPin.executables, PROVIDER_EXECUTABLE_KEYS);
    for (const key of ['agePath', 'ageInspectPath']) {
      if (typeof providerPin.executables[key] !== 'string' || !path.isAbsolute(providerPin.executables[key])) {
        reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `providerPin.executables.${key}`));
      }
    }
    for (const key of ['ageSha256', 'ageInspectSha256']) {
      if (!validDigest(providerPin.executables[key])) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `providerPin.executables.${key}`));
    }
  }
}

function validateSourceBinding(reasons, field, sourceBinding) {
  if (!isPlainObject(sourceBinding)) {
    addKeysetReason(reasons, field, sourceBinding, SOURCE_BINDING_KEYS);
    return;
  }
  if (!sameKeys(sourceBinding, SOURCE_BINDING_KEYS)) addKeysetReason(reasons, field, sourceBinding, SOURCE_BINDING_KEYS);
  if (sourceBinding.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.sourceBinding) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `${field}.schemaVersion`));
  for (const key of ['projectId', 'rootId']) {
    if (!normalizeIdentifier(sourceBinding[key])) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `${field}.${key}`));
  }
  if (!normalizeIdentifier(sourceBinding.documentId, { allowSlash: true })) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `${field}.documentId`));
  for (const key of ['canonicalRevision', 'workingRevision', 'generation']) {
    if (!normalizeRevision(sourceBinding[key])) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `${field}.${key}`));
  }
  if (!validDigest(sourceBinding.sourceSetDigest)) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `${field}.sourceSetDigest`));
}

function validateRecipient(reasons, recipient) {
  if (!isPlainObject(recipient)) {
    addKeysetReason(reasons, 'recipient', recipient, RECIPIENT_KEYS);
    return;
  }
  if (!sameKeys(recipient, RECIPIENT_KEYS)) addKeysetReason(reasons, 'recipient', recipient, RECIPIENT_KEYS);
  if (recipient.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recipient) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'recipient.schemaVersion'));
  if (recipient.type !== RECIPIENT_TYPE) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'recipient.type'));
  if (typeof recipient.publicKey !== 'string' || !recipient.publicKey.startsWith('age1') || /[\u0000-\u001F]/u.test(recipient.publicKey)) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'recipient.publicKey'));
  if (!validDigest(recipient.fingerprint)) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'recipient.fingerprint'));
}

function validateIdentity(reasons, field, identity) {
  if (!isPlainObject(identity)) {
    addKeysetReason(reasons, field, identity, IDENTITY_KEYS);
    return null;
  }
  if (!sameKeys(identity, IDENTITY_KEYS)) addKeysetReason(reasons, field, identity, IDENTITY_KEYS);
  if (identity.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.identity) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `${field}.schemaVersion`));
  if (identity.type !== IDENTITY_TYPE) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `${field}.type`));
  if (!validDigest(identity.fingerprint)) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `${field}.fingerprint`));
  const bytes = decodeBase64(identity.secretKeyBase64);
  if (!bytes || bytes.byteLength > 4096) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `${field}.secretKeyBase64`));
  return bytes;
}

function validateCorePayload(reasons, corePayload, sourceBinding) {
  if (!isPlainObject(corePayload)) {
    addKeysetReason(reasons, 'corePayload', corePayload, CORE_PAYLOAD_KEYS);
    return null;
  }
  if (!sameKeys(corePayload, CORE_PAYLOAD_KEYS)) addKeysetReason(reasons, 'corePayload', corePayload, CORE_PAYLOAD_KEYS);
  if (corePayload.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.corePayload) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'corePayload.schemaVersion'));
  if (corePayload.type !== CORE_PAYLOAD_TYPE) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'corePayload.type'));
  if (corePayload.sourceSetDigest !== sourceBinding?.sourceSetDigest) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_BINDING_MISMATCH, 'corePayload.sourceSetDigest'));
  const bytes = decodeBase64(corePayload.bytesBase64);
  if (!bytes || !Number.isSafeInteger(corePayload.byteLength) || corePayload.byteLength <= 0 || corePayload.byteLength > MAX_CORE_BYTES || bytes.byteLength !== corePayload.byteLength) {
    reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'corePayload.bytesBase64'));
    return null;
  }
  const digest = sha256Buffer(bytes);
  if (corePayload.sha256 !== digest) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'corePayload.sha256', digest, corePayload.sha256));
  return bytes;
}

function validateExpectations(reasons, expectations) {
  if (!isPlainObject(expectations)) {
    addKeysetReason(reasons, 'expectations', expectations, EXPECTATION_KEYS);
    return;
  }
  if (!sameKeys(expectations, EXPECTATION_KEYS)) addKeysetReason(reasons, 'expectations', expectations, EXPECTATION_KEYS);
  const expected = {
    importMode: IMPORT_AS_NEW,
    liveProjectOverwrite: false,
    ownerKeyOutsideBuilder: true,
    quarantineRequired: true,
    requireCiphertextBoundManifest: true,
    requireNoPlaintextInReceipt: true,
    requireProviderExact: true,
    requireStandardAgeV1: true,
    requireX25519Recipient: true,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (expectations?.[key] !== value) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `expectations.${key}`, value, expectations?.[key]));
  }
}

function validateSourceFenceEnvelope(reasons, sourceFence) {
  if (!isPlainObject(sourceFence)) {
    addKeysetReason(reasons, 'sourceFence', sourceFence, SOURCE_FENCE_KEYS);
    return;
  }
  if (!sameKeys(sourceFence, SOURCE_FENCE_KEYS)) addKeysetReason(reasons, 'sourceFence', sourceFence, SOURCE_FENCE_KEYS);
}

function sourceForFence(sourceBinding) {
  return {
    projectId: sourceBinding.projectId,
    rootId: sourceBinding.rootId,
    documentId: sourceBinding.documentId,
    canonicalRevision: sourceBinding.canonicalRevision,
    workingRevision: sourceBinding.workingRevision,
    sourceDigest: sourceBinding.sourceSetDigest,
  };
}

function currentForFence(current = {}) {
  return {
    projectId: current.projectId,
    rootId: current.rootId,
    documentId: current.documentId,
    canonicalRevision: current.canonicalRevision,
    workingRevision: current.workingRevision,
    sourceDigest: current.sourceDigest,
    dirtyState: current.dirtyState,
  };
}

function evaluateP0cFence(sourceBinding, sourceFence) {
  if (!isPlainObject(sourceFence)) {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_FENCE_REJECTED);
  }
  const expected = sourceForFence(sourceBinding);
  if (!isPlainObject(sourceFence.current) || sourceFence.current.generation !== sourceBinding.generation) {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_BINDING_MISMATCH, [
      reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_BINDING_MISMATCH, 'sourceFence.current.generation', sourceBinding.generation, sourceFence.current?.generation),
    ]);
  }
  const result = evaluateSourceFenceV1({
    schemaVersion: SOURCE_FENCE_V1_SCHEMAS.request,
    purpose: 'READ_SOURCE_SNAPSHOT',
    dirtyPolicy: 'REQUIRE_CLEAN',
    expected,
    current: currentForFence(sourceFence.current),
    fence: sourceFence.fence,
    authority: sourceFence.authority,
  });
  if (!result.ok) {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_FENCE_REJECTED, [
      reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_FENCE_REJECTED, 'sourceFence', 'ALLOW', result.code),
    ]);
  }
  return null;
}

function validateFeatureFlag(reasons, featureFlags) {
  if (!isPlainObject(featureFlags) || featureFlags[BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG] !== true) {
    reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FEATURE_DISABLED, 'featureFlags'));
  }
}

function primaryCode(reasons) {
  const priority = [
    BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.KEYSET_INVALID,
    BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FEATURE_DISABLED,
    BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_BINDING_MISMATCH,
    BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID,
  ];
  for (const code of priority) {
    if (reasons.some((item) => item.code === code)) return code;
  }
  return reasons[0]?.code || BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID;
}

function validateBuildRequest(request) {
  const reasons = [];
  if (!isPlainObject(request)) {
    return { ok: false, code: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.KEYSET_INVALID, reasons: [reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.KEYSET_INVALID, 'request')] };
  }
  if (!sameKeys(request, BUILD_REQUEST_KEYS)) addKeysetReason(reasons, 'request', request, BUILD_REQUEST_KEYS);
  if (request.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.buildRequest) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'schemaVersion'));
  validateFeatureFlag(reasons, request.featureFlags);
  validateProviderPin(reasons, request.providerPin);
  validateSourceBinding(reasons, 'sourceBinding', request.sourceBinding);
  validateSourceFenceEnvelope(reasons, request.sourceFence);
  validateRecipient(reasons, request.recipient);
  const auditIdentityBytes = validateIdentity(reasons, 'auditIdentity', request.auditIdentity);
  const coreBytes = validateCorePayload(reasons, request.corePayload, request.sourceBinding);
  validateExpectations(reasons, request.expectations);
  if (isPlainObject(request.auditIdentity) && isPlainObject(request.recipient) && request.auditIdentity.fingerprint !== request.recipient.fingerprint) {
    reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'auditIdentity.fingerprint', request.recipient.fingerprint, request.auditIdentity.fingerprint));
  }
  if (reasons.length > 0) return { ok: false, code: primaryCode(reasons), reasons };
  const fenceDeny = evaluateP0cFence(request.sourceBinding, request.sourceFence);
  if (fenceDeny) return { ok: false, code: fenceDeny.code, reasons: fenceDeny.reasons };
  return { ok: true, coreBytes, auditIdentityBytes };
}

function validateRecoverRequest(request) {
  const reasons = [];
  if (!isPlainObject(request)) {
    return { ok: false, code: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.KEYSET_INVALID, reasons: [reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.KEYSET_INVALID, 'request')] };
  }
  if (!sameKeys(request, RECOVER_REQUEST_KEYS)) addKeysetReason(reasons, 'request', request, RECOVER_REQUEST_KEYS);
  if (request.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recoverRequest) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'schemaVersion'));
  validateFeatureFlag(reasons, request.featureFlags);
  validateProviderPin(reasons, request.providerPin);
  validateSourceBinding(reasons, 'expectedSourceBinding', request.expectedSourceBinding);
  validateIdentity(reasons, 'identity', request.identity);
  validateExpectations(reasons, request.expectations);
  const capsuleValidation = validateCapsule(request.capsule);
  if (!capsuleValidation.ok) reasons.push(...capsuleValidation.reasons);
  if (reasons.length > 0) return { ok: false, code: primaryCode(reasons), reasons };
  if (sha256Stable(request.expectedSourceBinding) !== sha256Stable(request.capsule.sourceBinding)) {
    return { ok: false, code: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_BINDING_MISMATCH, reasons: [reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_BINDING_MISMATCH, 'expectedSourceBinding')] };
  }
  return { ok: true, capsule: capsuleValidation.capsule };
}

function manifestDigestInput(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    providerPinDigest: manifest.providerPinDigest,
    sourceBindingDigest: manifest.sourceBindingDigest,
    recipientFingerprint: manifest.recipientFingerprint,
    corePayloadSha256: manifest.corePayloadSha256,
    plaintextSha256: manifest.plaintextSha256,
    ciphertextSha256: manifest.ciphertextSha256,
    importMode: manifest.importMode,
  };
}

function buildManifest({ providerPinDigest, sourceBindingDigest, recipientFingerprint, corePayloadSha256, plaintextSha256, ciphertextSha256 }) {
  const manifest = {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.manifest,
    providerPinDigest,
    sourceBindingDigest,
    recipientFingerprint,
    corePayloadSha256,
    plaintextSha256,
    ciphertextSha256,
    importMode: IMPORT_AS_NEW,
    manifestDigest: '',
  };
  manifest.manifestDigest = sha256Stable(manifestDigestInput(manifest));
  return manifest;
}

function validateCapsule(capsule) {
  const reasons = [];
  if (!isPlainObject(capsule)) {
    return { ok: false, reasons: [reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.KEYSET_INVALID, 'capsule')] };
  }
  if (!sameKeys(capsule, CAPSULE_KEYS)) addKeysetReason(reasons, 'capsule', capsule, CAPSULE_KEYS);
  if (capsule.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.capsule) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'capsule.schemaVersion'));
  if (capsule.type !== CAPSULE_TYPE) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'capsule.type'));
  validateSourceBinding(reasons, 'capsule.sourceBinding', capsule.sourceBinding);
  validateRecipient(reasons, capsule.recipient);
  if (!isPlainObject(capsule.provider)) addKeysetReason(reasons, 'capsule.provider', capsule.provider, CAPSULE_PROVIDER_KEYS);
  else {
    if (!sameKeys(capsule.provider, CAPSULE_PROVIDER_KEYS)) addKeysetReason(reasons, 'capsule.provider', capsule.provider, CAPSULE_PROVIDER_KEYS);
    for (const key of ['artifactSha256', 'proofSha256', 'providerPinDigest']) if (!validDigest(capsule.provider[key])) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `capsule.provider.${key}`));
    if (!normalizeIdentifier(capsule.provider.providerId)) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'capsule.provider.providerId'));
    if (capsule.provider.version !== VERSION) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'capsule.provider.version'));
    if (capsule.provider.sigsumVerified !== true) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'capsule.provider.sigsumVerified'));
  }
  if (!isPlainObject(capsule.manifest)) addKeysetReason(reasons, 'capsule.manifest', capsule.manifest, MANIFEST_KEYS);
  else {
    if (!sameKeys(capsule.manifest, MANIFEST_KEYS)) addKeysetReason(reasons, 'capsule.manifest', capsule.manifest, MANIFEST_KEYS);
    if (capsule.manifest.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.manifest) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'capsule.manifest.schemaVersion'));
    for (const key of ['providerPinDigest', 'sourceBindingDigest', 'recipientFingerprint', 'corePayloadSha256', 'plaintextSha256', 'ciphertextSha256', 'manifestDigest']) {
      if (!validDigest(capsule.manifest[key])) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, `capsule.manifest.${key}`));
    }
    if (capsule.manifest.importMode !== IMPORT_AS_NEW) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'capsule.manifest.importMode'));
  }
  const ciphertext = validateCiphertext(reasons, capsule.ciphertext);
  if (reasons.length > 0) return { ok: false, reasons };

  const expectedSourceBindingDigest = sha256Stable(capsule.sourceBinding);
  const expectedProviderDigest = capsule.provider.providerPinDigest;
  if (capsule.manifest.sourceBindingDigest !== expectedSourceBindingDigest
    || capsule.manifest.providerPinDigest !== expectedProviderDigest
    || capsule.manifest.recipientFingerprint !== capsule.recipient.fingerprint
    || capsule.manifest.ciphertextSha256 !== capsule.ciphertext.sha256
    || capsule.manifest.manifestDigest !== sha256Stable(manifestDigestInput(capsule.manifest))) {
    return { ok: false, reasons: [reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_MANIFEST_MISMATCH, 'capsule.manifest')] };
  }
  return { ok: true, capsule, ciphertext };
}

function validateCiphertext(reasons, ciphertext) {
  if (!isPlainObject(ciphertext)) {
    addKeysetReason(reasons, 'capsule.ciphertext', ciphertext, CIPHERTEXT_KEYS);
    return null;
  }
  if (!sameKeys(ciphertext, CIPHERTEXT_KEYS)) addKeysetReason(reasons, 'capsule.ciphertext', ciphertext, CIPHERTEXT_KEYS);
  if (ciphertext.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.ciphertext) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'capsule.ciphertext.schemaVersion'));
  if (ciphertext.encoding !== 'base64') reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'capsule.ciphertext.encoding'));
  const bytes = decodeBase64(ciphertext.bytesBase64);
  if (!bytes || !Number.isSafeInteger(ciphertext.byteLength) || ciphertext.byteLength <= 0 || bytes.byteLength !== ciphertext.byteLength) {
    reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'capsule.ciphertext.bytesBase64'));
    return null;
  }
  const digest = sha256Buffer(bytes);
  if (ciphertext.sha256 !== digest) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID, 'capsule.ciphertext.sha256', digest, ciphertext.sha256));
  return bytes;
}

function parsePlaintext(bytes) {
  try {
    const value = JSON.parse(Buffer.from(bytes).toString('utf8'));
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

function validatePlaintextPayload(plaintext, capsule) {
  const reasons = [];
  if (!isPlainObject(plaintext)) return { ok: false, code: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_ROUNDTRIP_FAILED, reasons: [reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_ROUNDTRIP_FAILED, 'plaintext')] };
  if (!sameKeys(plaintext, PLAINTEXT_KEYS)) addKeysetReason(reasons, 'plaintext', plaintext, PLAINTEXT_KEYS);
  if (plaintext.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.plaintext) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_MANIFEST_MISMATCH, 'plaintext.schemaVersion'));
  if (plaintext.type !== 'BLACK_BOX_STRICT_CAPSULE_PLAINTEXT_V1') reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_MANIFEST_MISMATCH, 'plaintext.type'));
  if (sha256Stable(plaintext.sourceBinding) !== sha256Stable(capsule.sourceBinding)) reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_MANIFEST_MISMATCH, 'plaintext.sourceBinding'));
  const coreReasons = [];
  const coreBytes = validateCorePayload(coreReasons, plaintext.corePayload, capsule.sourceBinding);
  if (coreReasons.length > 0 || sha256Buffer(coreBytes || Buffer.alloc(0)) !== capsule.manifest.corePayloadSha256) {
    reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_MANIFEST_MISMATCH, 'plaintext.corePayload'));
  }
  if (!isPlainObject(plaintext.recovery)) addKeysetReason(reasons, 'plaintext.recovery', plaintext.recovery, PLAINTEXT_RECOVERY_KEYS);
  else {
    if (!sameKeys(plaintext.recovery, PLAINTEXT_RECOVERY_KEYS)) addKeysetReason(reasons, 'plaintext.recovery', plaintext.recovery, PLAINTEXT_RECOVERY_KEYS);
    if (plaintext.recovery.importMode !== IMPORT_AS_NEW
      || plaintext.recovery.liveProjectOverwrite !== false
      || plaintext.recovery.ownerKeyOutsideBuilder !== true
      || plaintext.recovery.quarantineRequired !== true) {
      reasons.push(reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_MANIFEST_MISMATCH, 'plaintext.recovery'));
    }
  }
  if (reasons.length > 0) return { ok: false, code: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_MANIFEST_MISMATCH, reasons };
  return { ok: true, coreBytes };
}

function validateInspectResult(result) {
  if (!isPlainObject(result) || result.ok !== true) {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_INSPECT_FAILED);
  }
  if (result.standardAgeVersion !== STANDARD_AGE_V1
    || result.usesPostQuantum !== false
    || !Array.isArray(result.recipientTypes)
    || !result.recipientTypes.includes(X25519)) {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_PIN_MISMATCH, [
      reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_PIN_MISMATCH, 'provider.inspect'),
    ]);
  }
  return null;
}

async function deliverRecoveredCorePayloadToSink({
  sink,
  plaintext,
  plaintextValidation,
  request,
  providerPinDigest,
}) {
  if (typeof sink !== 'function') return { ok: true, delivered: false };
  const corePayload = plaintext.corePayload;
  const coreBytes = Buffer.from(plaintextValidation.coreBytes);
  const payload = {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.ephemeralCorePayload,
    corePayload: deepFreeze(JSON.parse(JSON.stringify(corePayload))),
    coreBytes,
    sourceBinding: deepFreeze(JSON.parse(JSON.stringify(request.capsule.sourceBinding))),
    providerPinDigest,
    sourceBindingDigest: request.capsule.manifest.sourceBindingDigest,
    capsuleManifestDigest: request.capsule.manifest.manifestDigest,
    capsuleCiphertextSha256: request.capsule.manifest.ciphertextSha256,
    plaintextSha256: request.capsule.manifest.plaintextSha256,
    recipientFingerprint: request.capsule.recipient.fingerprint,
  };
  Object.freeze(payload);
  let result;
  try {
    result = await sink(payload);
  } catch {
    return {
      ok: false,
      code: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.EPHEMERAL_SINK_REJECTED,
      reasons: [reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.EPHEMERAL_SINK_REJECTED, 'recoveredCorePayloadSink')],
    };
  }
  if (!isPlainObject(result) || result.ok !== true) {
    return {
      ok: false,
      code: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.EPHEMERAL_SINK_REJECTED,
      reasons: [reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.EPHEMERAL_SINK_REJECTED, 'recoveredCorePayloadSink')],
    };
  }
  if (typeof result.corePayloadSha256 === 'string' && result.corePayloadSha256 !== corePayload.sha256) {
    return {
      ok: false,
      code: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.EPHEMERAL_SINK_REJECTED,
      reasons: [reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.EPHEMERAL_SINK_REJECTED, 'recoveredCorePayloadSink.corePayloadSha256')],
    };
  }
  const sinkId = normalizeIdentifier(result.sinkId) || 'ephemeral-core-payload-sink';
  return {
    ok: true,
    delivered: true,
    ephemeralSink: {
      delivered: true,
      sinkId,
      corePayloadSha256: corePayload.sha256,
    },
  };
}

function providerAvailable(ageProvider) {
  return isPlainObject(ageProvider)
    && typeof ageProvider.probe === 'function'
    && typeof ageProvider.encrypt === 'function'
    && typeof ageProvider.decrypt === 'function'
    && typeof ageProvider.inspect === 'function';
}

async function probeProvider(providerPin, ageProvider) {
  if (!providerAvailable(ageProvider)) return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_MISSING);
  let observation;
  try {
    observation = await ageProvider.probe(providerPin);
  } catch {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_MISSING);
  }
  const pinDigest = createBlackBoxP0cProviderPinDigestV1(providerPin);
  const mismatch = !isPlainObject(observation)
    || observation.ok !== true
    || observation.kind !== providerPin.kind
    || observation.providerId !== providerPin.providerId
    || observation.version !== providerPin.version
    || observation.platform !== providerPin.platform
    || observation.artifactSha256 !== providerPin.artifactSha256
    || observation.proofSha256 !== providerPin.proofSha256
    || observation.sigsumVerified !== true
    || observation.agePath !== providerPin.executables.agePath
    || observation.ageSha256 !== providerPin.executables.ageSha256
    || observation.ageInspectPath !== providerPin.executables.ageInspectPath
    || observation.ageInspectSha256 !== providerPin.executables.ageInspectSha256
    || observation.standardAgeVersion !== STANDARD_AGE_V1
    || observation.usesPostQuantum !== false
    || !Array.isArray(observation.recipientTypes)
    || !observation.recipientTypes.includes(X25519);
  if (mismatch) {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_PIN_MISMATCH, [
      reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_PIN_MISMATCH, 'providerPinDigest', pinDigest),
    ]);
  }
  return { ok: true, observation, providerPinDigest: pinDigest };
}

export function createBlackBoxP0cProviderPinDigestV1(providerPin) {
  return sha256Stable(providerPin);
}

export function createBlackBoxP0cSourceFenceTokenV1(sourceBinding) {
  return createSourceFenceTokenV1({
    purpose: 'READ_SOURCE_SNAPSHOT',
    ...sourceForFence(sourceBinding),
  });
}

function buildPlaintext(sourceBinding, corePayload) {
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.plaintext,
    type: 'BLACK_BOX_STRICT_CAPSULE_PLAINTEXT_V1',
    sourceBinding,
    corePayload,
    recovery: {
      importMode: IMPORT_AS_NEW,
      liveProjectOverwrite: false,
      ownerKeyOutsideBuilder: true,
      quarantineRequired: true,
    },
  };
}

function buildReceipt({ code, providerPinDigest, sourceBinding, recipient, manifest, claims }) {
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.receipt,
    code,
    providerPinDigest,
    sourceBindingDigest: sha256Stable(sourceBinding),
    recipientFingerprint: recipient.fingerprint,
    manifestDigest: manifest.manifestDigest,
    ciphertextSha256: manifest.ciphertextSha256,
    plaintextSha256: manifest.plaintextSha256,
    corePayloadSha256: manifest.corePayloadSha256,
    claims,
    limitations: {
      disasterReady: 'NOT_CLAIMED',
      exactByteDonorReplication: 'NOT_CLAIMED',
      ownerKeyRecoveryDrill: 'NOT_CLAIMED',
      physicalPowerLossProof: 'NOT_CLAIMED',
      productRuntimeWiring: 'NOT_CLAIMED',
    },
  };
}

export async function buildBlackBoxStrictCapsuleV1(request, options = {}) {
  const validation = validateBuildRequest(request);
  if (!validation.ok) return deny(validation.code, validation.reasons);
  const provider = await probeProvider(request.providerPin, options.ageProvider);
  if (!provider.ok) return provider;

  const plaintext = buildPlaintext(request.sourceBinding, request.corePayload);
  const plaintextBytes = Buffer.from(stableJson(plaintext), 'utf8');
  const plaintextSha256 = sha256Buffer(plaintextBytes);
  let encrypted;
  try {
    encrypted = await options.ageProvider.encrypt({ plaintextBytes, recipient: request.recipient, providerPin: request.providerPin });
  } catch {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_ENCRYPT_FAILED);
  }
  if (!isPlainObject(encrypted) || encrypted.ok !== true || !Buffer.isBuffer(encrypted.ciphertextBytes)) {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_ENCRYPT_FAILED);
  }
  const inspect = validateInspectResult(await options.ageProvider.inspect({ ciphertextBytes: encrypted.ciphertextBytes, providerPin: request.providerPin }));
  if (inspect) return inspect;
  const decrypted = await options.ageProvider.decrypt({ ciphertextBytes: encrypted.ciphertextBytes, identity: request.auditIdentity, providerPin: request.providerPin });
  if (!isPlainObject(decrypted) || decrypted.ok !== true || !Buffer.isBuffer(decrypted.plaintextBytes) || sha256Buffer(decrypted.plaintextBytes) !== plaintextSha256) {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_ROUNDTRIP_FAILED);
  }
  const parsed = parsePlaintext(decrypted.plaintextBytes);
  const parsedValidation = validatePlaintextPayload(parsed, {
    sourceBinding: request.sourceBinding,
    manifest: {
      corePayloadSha256: request.corePayload.sha256,
    },
  });
  if (!parsedValidation.ok) return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_ROUNDTRIP_FAILED, parsedValidation.reasons);

  const ciphertextSha256 = sha256Buffer(encrypted.ciphertextBytes);
  const sourceBindingDigest = sha256Stable(request.sourceBinding);
  const manifest = buildManifest({
    providerPinDigest: provider.providerPinDigest,
    sourceBindingDigest,
    recipientFingerprint: request.recipient.fingerprint,
    corePayloadSha256: request.corePayload.sha256,
    plaintextSha256,
    ciphertextSha256,
  });
  const capsule = {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.capsule,
    type: CAPSULE_TYPE,
    provider: {
      providerId: request.providerPin.providerId,
      version: request.providerPin.version,
      artifactSha256: request.providerPin.artifactSha256,
      proofSha256: request.providerPin.proofSha256,
      sigsumVerified: true,
      providerPinDigest: provider.providerPinDigest,
    },
    sourceBinding: request.sourceBinding,
    recipient: request.recipient,
    manifest,
    ciphertext: {
      schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.ciphertext,
      encoding: 'base64',
      bytesBase64: encrypted.ciphertextBytes.toString('base64'),
      byteLength: encrypted.ciphertextBytes.byteLength,
      sha256: ciphertextSha256,
    },
  };
  const receipt = buildReceipt({
    code: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_BUILT,
    providerPinDigest: provider.providerPinDigest,
    sourceBinding: request.sourceBinding,
    recipient: request.recipient,
    manifest,
    claims: {
      standardAgeV1: 'PASS',
      x25519Recipient: 'PASS',
      ciphertextBoundManifest: 'PASS',
      importAsNewProjectOnly: 'PASS',
      noPlaintextOrKeyMaterialInReceipt: 'PASS',
      ownerKeyRecoveryDrill: 'NOT_CLAIMED',
    },
  });
  return pass(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_BUILT, { capsule, receipt });
}

export async function recoverBlackBoxStrictCapsuleV1(request, options = {}) {
  const validation = validateRecoverRequest(request);
  if (!validation.ok) return deny(validation.code, validation.reasons);
  const provider = await probeProvider(request.providerPin, options.ageProvider);
  if (!provider.ok) return provider;
  if (validation.capsule.provider.providerPinDigest !== provider.providerPinDigest) {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_PIN_MISMATCH, [
      reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_PIN_MISMATCH, 'capsule.provider.providerPinDigest', provider.providerPinDigest, validation.capsule.provider.providerPinDigest),
    ]);
  }

  const ciphertextBytes = decodeBase64(request.capsule.ciphertext.bytesBase64);
  const inspect = validateInspectResult(await options.ageProvider.inspect({ ciphertextBytes, providerPin: request.providerPin }));
  if (inspect) return inspect;
  let decrypted;
  try {
    decrypted = await options.ageProvider.decrypt({ ciphertextBytes, identity: request.identity, providerPin: request.providerPin });
  } catch {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_DECRYPT_FAILED);
  }
  if (!isPlainObject(decrypted) || decrypted.ok !== true || !Buffer.isBuffer(decrypted.plaintextBytes)) {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_DECRYPT_FAILED);
  }
  if (sha256Buffer(decrypted.plaintextBytes) !== request.capsule.manifest.plaintextSha256) {
    return deny(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_MANIFEST_MISMATCH, [
      reason(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_MANIFEST_MISMATCH, 'plaintextSha256'),
    ]);
  }
  const plaintext = parsePlaintext(decrypted.plaintextBytes);
  const plaintextValidation = validatePlaintextPayload(plaintext, request.capsule);
  if (!plaintextValidation.ok) return deny(plaintextValidation.code, plaintextValidation.reasons);
  const sinkDelivery = await deliverRecoveredCorePayloadToSink({
    sink: options.recoveredCorePayloadSink,
    plaintext,
    plaintextValidation,
    request,
    providerPinDigest: provider.providerPinDigest,
  });
  if (!sinkDelivery.ok) return deny(sinkDelivery.code, sinkDelivery.reasons);
  const recoverPlan = {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recoverPlan,
    importMode: IMPORT_AS_NEW,
    liveProjectOverwrite: false,
    sourceBinding: request.capsule.sourceBinding,
    quarantine: {
      status: 'QUARANTINED_PREVIEW_READY',
      writeLiveProject: false,
      requireOwnerConfirmBeforeImport: true,
    },
    preview: {
      sourceBindingDigest: request.capsule.manifest.sourceBindingDigest,
      corePayloadSha256: request.capsule.manifest.corePayloadSha256,
      plaintextSha256: request.capsule.manifest.plaintextSha256,
      ciphertextSha256: request.capsule.manifest.ciphertextSha256,
    },
  };
  const receipt = buildReceipt({
    code: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.RECOVER_PREVIEW_READY,
    providerPinDigest: provider.providerPinDigest,
    sourceBinding: request.capsule.sourceBinding,
    recipient: request.capsule.recipient,
    manifest: request.capsule.manifest,
    claims: {
      standardAgeV1: 'PASS',
      x25519Recipient: 'PASS',
      ciphertextBoundManifest: 'PASS',
      importAsNewProjectOnly: 'PASS',
      quarantinePreviewOnly: 'PASS',
      noPlaintextOrKeyMaterialInReceipt: 'PASS',
      liveProjectOverwrite: 'DENIED',
      ownerKeyRecoveryDrill: 'NOT_CLAIMED',
    },
  });
  return pass(BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.RECOVER_PREVIEW_READY, {
    recoverPlan,
    receipt,
    ...(sinkDelivery.delivered ? { ephemeralSink: sinkDelivery.ephemeralSink } : {}),
  });
}

async function sha256File(fullPath) {
  return sha256Buffer(await fs.readFile(fullPath));
}

function runCli(command, args, input, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ status: -1, stdout: Buffer.concat(stdout), stderr: Buffer.from(String(error.message)) });
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function parseAgeInspectOutput(text) {
  const source = String(text || '');
  return {
    ok: source.includes('is an age file, version "age-encryption.org/v1"'),
    standardAgeVersion: source.includes('version "age-encryption.org/v1"') ? STANDARD_AGE_V1 : '',
    recipientTypes: source.includes('"X25519"') ? [X25519] : [],
    usesPostQuantum: source.includes('does NOT use post-quantum encryption') ? false : source.includes('uses post-quantum encryption'),
  };
}

export function createBlackBoxP0cAgeCliProviderV1(providerPin, options = {}) {
  const tempRoot = options.tempRoot || os.tmpdir();
  return {
    async probe() {
      const ageSha256 = await sha256File(providerPin.executables.agePath);
      const ageInspectSha256 = await sha256File(providerPin.executables.ageInspectPath);
      const versionResult = await runCli(providerPin.executables.agePath, ['--version']);
      const inspectVersionResult = await runCli(providerPin.executables.ageInspectPath, ['--version']);
      const version = versionResult.stdout.toString('utf8').trim();
      const inspectVersion = inspectVersionResult.stdout.toString('utf8').trim();
      return {
        ok: versionResult.status === 0 && inspectVersionResult.status === 0,
        kind: providerPin.kind,
        providerId: providerPin.providerId,
        version,
        platform: providerPin.platform,
        artifactSha256: providerPin.artifactSha256,
        proofSha256: providerPin.proofSha256,
        sigsumVerified: providerPin.sigsum.verified,
        agePath: providerPin.executables.agePath,
        ageSha256,
        ageInspectPath: providerPin.executables.ageInspectPath,
        ageInspectSha256,
        standardAgeVersion: inspectVersion === VERSION ? STANDARD_AGE_V1 : '',
        recipientTypes: [X25519],
        usesPostQuantum: false,
      };
    },
    async encrypt({ plaintextBytes, recipient }) {
      const result = await runCli(providerPin.executables.agePath, ['-r', recipient.publicKey], plaintextBytes);
      return result.status === 0
        ? { ok: true, ciphertextBytes: result.stdout }
        : { ok: false, code: 'AGE_ENCRYPT_FAILED' };
    },
    async decrypt({ ciphertextBytes, identity }) {
      const tempDir = await fs.mkdtemp(path.join(tempRoot, 'yalken-p0c-age-'));
      const identityPath = path.join(tempDir, 'identity.txt');
      try {
        const identityBytes = decodeBase64(identity.secretKeyBase64);
        await fs.writeFile(identityPath, identityBytes, { mode: 0o600 });
        const result = await runCli(providerPin.executables.agePath, ['--decrypt', '-i', identityPath], ciphertextBytes);
        return result.status === 0
          ? { ok: true, plaintextBytes: result.stdout }
          : { ok: false, code: 'AGE_DECRYPT_FAILED' };
      } finally {
        await fs.unlink(identityPath).catch(() => {});
        await fs.rmdir(tempDir).catch(() => {});
      }
    },
    async inspect({ ciphertextBytes }) {
      const tempDir = await fs.mkdtemp(path.join(tempRoot, 'yalken-p0c-age-inspect-'));
      const capsulePath = path.join(tempDir, 'capsule.age');
      try {
        await fs.writeFile(capsulePath, ciphertextBytes, { mode: 0o600 });
        const result = await runCli(providerPin.executables.ageInspectPath, [capsulePath]);
        if (result.status !== 0) return { ok: false, code: 'AGE_INSPECT_FAILED' };
        return parseAgeInspectOutput(result.stdout.toString('utf8'));
      } finally {
        await fs.unlink(capsulePath).catch(() => {});
        await fs.rmdir(tempDir).catch(() => {});
      }
    },
  };
}
