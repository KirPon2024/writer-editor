'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BLACK_BOX_RUNTIME_PROVIDER_AUDIT_BINDING_V1_ENV = Object.freeze({
  providerRoot: 'YALKEN_BLACK_BOX_MANUAL_CORE_PROVIDER_ROOT_V1',
  auditRecipientJson: 'YALKEN_BLACK_BOX_MANUAL_CORE_AUDIT_RECIPIENT_JSON_V1',
  auditIdentityJson: 'YALKEN_BLACK_BOX_MANUAL_CORE_AUDIT_IDENTITY_JSON_V1',
});

const DEFAULT_PROVIDER_EXPECTED = Object.freeze({
  allowedRoot: '/Volumes/T7-Secure/storage/yalken/toolchains/age-v1.3.1-darwin-arm64',
  artifactSha256: 'sha256:01120ea2cbf0463d4c6bd767f99f3271bbed1cdc8a9aa718a76ba1fe4f01998b',
  proofSha256: 'sha256:e53545de98acd8fb17aca18ab4940e46edd032418df352b7387be4bc5379a0ac',
  sigsumKeyDigest: 'sha256:ca60c0504ac65cc43ef180a34579ce6ed8f909b9136afef0ca42c88280f42cdc',
  ageSha256: 'sha256:0e3ea0b1bed2b30aa2dc46eef4e1723864d626c80f37319c20d9b73ca045f56f',
  ageInspectSha256: 'sha256:84695985ec630eaa88343b27b99d0478bb7fbfb27bbc0e43abd81a897ee7535f',
});

const EMPTY_BINDING = Object.freeze({
  providerPin: null,
  auditRecipient: null,
  auditIdentity: null,
  ageProvider: null,
});

const PROVIDER_PIN_SCHEMA = 'yalken.blackBoxStrictCapsuleRecover.providerPin.v1';
const RECIPIENT_SCHEMA = 'yalken.blackBoxStrictCapsuleRecover.recipient.v1';
const IDENTITY_SCHEMA = 'yalken.blackBoxStrictCapsuleRecover.identity.v1';
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const RECIPIENT_KEYS = Object.freeze(['fingerprint', 'publicKey', 'schemaVersion', 'type']);
const IDENTITY_KEYS = Object.freeze(['fingerprint', 'schemaVersion', 'secretKeyBase64', 'type']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sortedKeys(value) {
  return isPlainObject(value) ? Object.keys(value).sort() : [];
}

function sameKeys(value, keys) {
  const actual = sortedKeys(value);
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if ((isPlainObject(nested) || Array.isArray(nested)) && !Object.isFrozen(nested)) deepFreeze(nested);
  }
  return value;
}

function sha256Bytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')}`;
}

function sha256File(filePath, fsImpl = fs) {
  return sha256Bytes(fsImpl.readFileSync(filePath));
}

function readTrim(filePath, fsImpl = fs) {
  return String(fsImpl.readFileSync(filePath, 'utf8')).trim();
}

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function isInsidePath(parentPath, childPath, pathModule = path) {
  const parent = pathModule.resolve(parentPath);
  const child = pathModule.resolve(childPath);
  const relative = pathModule.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !pathModule.isAbsolute(relative));
}

function parseJsonEnv(env, key) {
  const raw = typeof env?.[key] === 'string' ? env[key].trim() : '';
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function decodeBase64(value) {
  if (typeof value !== 'string' || value.trim() !== value || !value) return null;
  try {
    const bytes = Buffer.from(value, 'base64');
    if (bytes.byteLength === 0 || bytes.byteLength > 4096) return null;
    return bytes;
  } catch {
    return null;
  }
}

function validRecipient(value) {
  return isPlainObject(value)
    && sameKeys(value, RECIPIENT_KEYS)
    && value.schemaVersion === RECIPIENT_SCHEMA
    && value.type === 'AGE_X25519_RECIPIENT'
    && typeof value.publicKey === 'string'
    && value.publicKey.startsWith('age1')
    && !/[\u0000-\u001F]/u.test(value.publicKey)
    && validDigest(value.fingerprint);
}

function validIdentity(value) {
  return isPlainObject(value)
    && sameKeys(value, IDENTITY_KEYS)
    && value.schemaVersion === IDENTITY_SCHEMA
    && value.type === 'AGE_X25519_IDENTITY'
    && validDigest(value.fingerprint)
    && decodeBase64(value.secretKeyBase64) !== null;
}

function buildBlackBoxRuntimeProviderPinV1(options = {}) {
  const env = options.env || process.env;
  const fsImpl = options.fsImpl || fs;
  const pathModule = options.pathModule || path;
  const expected = { ...DEFAULT_PROVIDER_EXPECTED, ...(options.expectedProvider || {}) };
  const rawRoot = typeof env[BLACK_BOX_RUNTIME_PROVIDER_AUDIT_BINDING_V1_ENV.providerRoot] === 'string'
    ? env[BLACK_BOX_RUNTIME_PROVIDER_AUDIT_BINDING_V1_ENV.providerRoot].trim()
    : '';
  if (!rawRoot) return null;

  try {
    const providerRoot = pathModule.resolve(rawRoot);
    const allowedRoot = pathModule.resolve(expected.allowedRoot || '');
    if (providerRoot !== allowedRoot) return null;

    const downloadsRoot = pathModule.join(providerRoot, 'downloads');
    const provenanceRoot = pathModule.join(providerRoot, 'provenance');
    const providerBinDir = pathModule.resolve(readTrim(pathModule.join(provenanceRoot, 'provider-bin-dir.txt'), fsImpl));
    if (!isInsidePath(providerRoot, providerBinDir, pathModule)) return null;

    const agePath = pathModule.join(providerBinDir, 'age');
    const ageInspectPath = pathModule.join(providerBinDir, 'age-inspect');
    if (!isInsidePath(providerRoot, agePath, pathModule) || !isInsidePath(providerRoot, ageInspectPath, pathModule)) return null;

    const artifactSha256 = sha256File(pathModule.join(downloadsRoot, 'age-v1.3.1-darwin-arm64.tar.gz'), fsImpl);
    const proofSha256 = sha256File(pathModule.join(downloadsRoot, 'age-v1.3.1-darwin-arm64.tar.gz.proof'), fsImpl);
    const sigsumKeyDigest = sha256File(pathModule.join(provenanceRoot, 'age-sigsum-key.pub'), fsImpl);
    const ageSha256 = sha256File(agePath, fsImpl);
    const ageInspectSha256 = sha256File(ageInspectPath, fsImpl);

    if (
      artifactSha256 !== expected.artifactSha256
      || proofSha256 !== expected.proofSha256
      || sigsumKeyDigest !== expected.sigsumKeyDigest
      || ageSha256 !== expected.ageSha256
      || ageInspectSha256 !== expected.ageInspectSha256
    ) {
      return null;
    }

    return deepFreeze({
      schemaVersion: PROVIDER_PIN_SCHEMA,
      kind: 'OFFICIAL_AGE_CLI',
      providerId: 'filosottile-age-v1.3.1-darwin-arm64',
      version: 'v1.3.1',
      platform: 'darwin-arm64',
      releaseUrl: 'https://github.com/FiloSottile/age/releases/tag/v1.3.1',
      artifactUrl: 'https://github.com/FiloSottile/age/releases/download/v1.3.1/age-v1.3.1-darwin-arm64.tar.gz',
      artifactSha256,
      proofSha256,
      sigsum: {
        verified: true,
        policy: 'sigsum-generic-2025-1',
        keyDigest: sigsumKeyDigest,
      },
      executables: {
        agePath,
        ageSha256,
        ageInspectPath,
        ageInspectSha256,
      },
    });
  } catch {
    return null;
  }
}

function buildBlackBoxRuntimeAuditBindingV1(options = {}) {
  const env = options.env || process.env;
  const auditRecipient = parseJsonEnv(env, BLACK_BOX_RUNTIME_PROVIDER_AUDIT_BINDING_V1_ENV.auditRecipientJson);
  const auditIdentity = parseJsonEnv(env, BLACK_BOX_RUNTIME_PROVIDER_AUDIT_BINDING_V1_ENV.auditIdentityJson);
  if (!validRecipient(auditRecipient) || !validIdentity(auditIdentity)) return null;
  if (auditIdentity.fingerprint !== auditRecipient.fingerprint) return null;
  return deepFreeze({ auditRecipient, auditIdentity });
}

async function createBlackBoxRuntimeProviderAuditBindingV1(options = {}) {
  const providerPin = buildBlackBoxRuntimeProviderPinV1(options);
  const audit = buildBlackBoxRuntimeAuditBindingV1(options);
  const strictCapsuleRecoverModule = options.strictCapsuleRecoverModule;
  if (!providerPin || !audit || typeof strictCapsuleRecoverModule?.createBlackBoxP0cAgeCliProviderV1 !== 'function') {
    return EMPTY_BINDING;
  }

  try {
    const ageProvider = strictCapsuleRecoverModule.createBlackBoxP0cAgeCliProviderV1(providerPin, {
      tempRoot: options.tempRoot,
    });
    if (!ageProvider) return EMPTY_BINDING;
    return deepFreeze({
      providerPin,
      auditRecipient: audit.auditRecipient,
      auditIdentity: audit.auditIdentity,
      ageProvider,
    });
  } catch {
    return EMPTY_BINDING;
  }
}

module.exports = {
  BLACK_BOX_RUNTIME_PROVIDER_AUDIT_BINDING_V1_ENV,
  DEFAULT_PROVIDER_EXPECTED,
  buildBlackBoxRuntimeAuditBindingV1,
  buildBlackBoxRuntimeProviderPinV1,
  createBlackBoxRuntimeProviderAuditBindingV1,
};
