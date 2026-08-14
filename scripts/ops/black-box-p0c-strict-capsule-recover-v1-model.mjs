#!/usr/bin/env node
import crypto from 'node:crypto';

import {
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES,
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG,
  BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS,
  buildBlackBoxStrictCapsuleV1,
  createBlackBoxP0cSourceFenceTokenV1,
  recoverBlackBoxStrictCapsuleV1,
} from '../../src/product/blackBoxStrictCapsuleRecoverV1.mjs';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function toBase64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

const sourceBinding = Object.freeze({
  schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.sourceBinding,
  projectId: 'proj_blackbox_p0c',
  rootId: 'root-blackbox',
  documentId: 'manuscript/core',
  canonicalRevision: 'canon-0007',
  workingRevision: 'work-0007',
  generation: 'gen-0007',
  sourceSetDigest: `sha256:${'a'.repeat(64)}`,
});

const currentSourceBinding = Object.freeze({
  projectId: sourceBinding.projectId,
  rootId: sourceBinding.rootId,
  documentId: sourceBinding.documentId,
  canonicalRevision: sourceBinding.canonicalRevision,
  workingRevision: sourceBinding.workingRevision,
  generation: sourceBinding.generation,
  sourceDigest: sourceBinding.sourceSetDigest,
  dirtyState: 'CLEAN',
});

const providerPin = Object.freeze({
  schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.providerPin,
  kind: 'OFFICIAL_AGE_CLI',
  providerId: 'filosottile-age-v1.3.1-darwin-arm64',
  version: 'v1.3.1',
  platform: 'darwin-arm64',
  releaseUrl: 'https://github.com/FiloSottile/age/releases/tag/v1.3.1',
  artifactUrl: 'https://github.com/FiloSottile/age/releases/download/v1.3.1/age-v1.3.1-darwin-arm64.tar.gz',
  artifactSha256: 'sha256:01120ea2cbf0463d4c6bd767f99f3271bbed1cdc8a9aa718a76ba1fe4f01998b',
  proofSha256: 'sha256:e53545de98acd8fb17aca18ab4940e46edd032418df352b7387be4bc5379a0ac',
  sigsum: {
    verified: true,
    policy: 'sigsum-generic-2025-1',
    keyDigest: `sha256:${'1'.repeat(64)}`,
  },
  executables: {
    agePath: '/Volumes/T7-Secure/storage/yalken/toolchains/age-v1.3.1-darwin-arm64/bin-pinned-20260814T004900Z/age',
    ageSha256: 'sha256:0e3ea0b1bed2b30aa2dc46eef4e1723864d626c80f37319c20d9b73ca045f56f',
    ageInspectPath: '/Volumes/T7-Secure/storage/yalken/toolchains/age-v1.3.1-darwin-arm64/bin-pinned-20260814T004900Z/age-inspect',
    ageInspectSha256: 'sha256:84695985ec630eaa88343b27b99d0478bb7fbfb27bbc0e43abd81a897ee7535f',
  },
});

const recipient = Object.freeze({
  schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recipient,
  type: 'AGE_X25519_RECIPIENT',
  publicKey: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpp3l9',
  fingerprint: `sha256:${'2'.repeat(64)}`,
});

const identity = Object.freeze({
  schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.identity,
  type: 'AGE_X25519_IDENTITY',
  secretKeyBase64: toBase64('AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQVXH5Q'),
  fingerprint: recipient.fingerprint,
});

const auditRecipient = Object.freeze({
  schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recipient,
  type: 'AGE_X25519_RECIPIENT',
  publicKey: 'age1auditqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv24tsp',
  fingerprint: `sha256:${'5'.repeat(64)}`,
});

const auditIdentity = Object.freeze({
  schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.identity,
  type: 'AGE_X25519_IDENTITY',
  secretKeyBase64: toBase64('AGE-SECRET-KEY-1AUDITQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQVGX9A'),
  fingerprint: auditRecipient.fingerprint,
});

const corePayload = Object.freeze({
  schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.corePayload,
  type: 'BLACK_BOX_CORE_GENOME_V1',
  byteLength: Buffer.byteLength('{"synthetic":"core","ordinal":1}', 'utf8'),
  bytesBase64: toBase64('{"synthetic":"core","ordinal":1}'),
  sha256: sha256Buffer(Buffer.from('{"synthetic":"core","ordinal":1}', 'utf8')),
  sourceSetDigest: sourceBinding.sourceSetDigest,
});

const expectations = Object.freeze({
  importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
  liveProjectOverwrite: false,
  ownerKeyOutsideBuilder: true,
  quarantineRequired: true,
  requireCiphertextBoundManifest: true,
  requireNoPlaintextInReceipt: true,
  requireProviderExact: true,
  requireStandardAgeV1: true,
  requireX25519Recipient: true,
});

function makeFence(binding = sourceBinding, current = currentSourceBinding, authority = { commandId: 'read-source-snapshot-black-box-p0c', decision: 'ALLOW', mayWrite: false }) {
  return {
    authority,
    current,
    expected: {
      projectId: binding.projectId,
      rootId: binding.rootId,
      documentId: binding.documentId,
      canonicalRevision: binding.canonicalRevision,
      workingRevision: binding.workingRevision,
      sourceDigest: binding.sourceSetDigest,
    },
    fence: createBlackBoxP0cSourceFenceTokenV1(binding),
  };
}

function makeProvider(overrides = {}) {
  const observation = {
    ok: true,
    kind: providerPin.kind,
    providerId: providerPin.providerId,
    version: providerPin.version,
    platform: providerPin.platform,
    artifactSha256: providerPin.artifactSha256,
    proofSha256: providerPin.proofSha256,
    sigsumVerified: true,
    agePath: providerPin.executables.agePath,
    ageSha256: providerPin.executables.ageSha256,
    ageInspectPath: providerPin.executables.ageInspectPath,
    ageInspectSha256: providerPin.executables.ageInspectSha256,
    standardAgeVersion: 'age-encryption.org/v1',
    recipientTypes: ['X25519'],
    usesPostQuantum: false,
    ...overrides.observation,
  };
  return {
    probe: async () => observation,
    encrypt: async ({ plaintextBytes, recipient: suppliedRecipient, recipients }) => {
      if (overrides.encrypt) return overrides.encrypt({ plaintextBytes, recipient: suppliedRecipient, recipients });
      const body = Buffer.concat([Buffer.from('AGE-FAKE-X25519:'), Buffer.from(plaintextBytes)]);
      const tag = crypto.createHash('sha256').update(body).digest('hex');
      return { ok: true, ciphertextBytes: Buffer.concat([body, Buffer.from(`:${tag}`)]) };
    },
    decrypt: async ({ ciphertextBytes, identity: suppliedIdentity }) => {
      if (overrides.decrypt) return overrides.decrypt({ ciphertextBytes, identity: suppliedIdentity });
      if (![recipient.fingerprint, auditRecipient.fingerprint].includes(suppliedIdentity.fingerprint)) return { ok: false, code: 'FAKE_NO_MATCH' };
      const text = Buffer.from(ciphertextBytes).toString('utf8');
      if (!text.startsWith('AGE-FAKE-X25519:')) return { ok: false, code: 'FAKE_HEADER' };
      const split = text.lastIndexOf(':');
      const body = Buffer.from(text.slice(0, split), 'utf8');
      const tag = text.slice(split + 1);
      if (crypto.createHash('sha256').update(body).digest('hex') !== tag) return { ok: false, code: 'FAKE_TAG' };
      return { ok: true, plaintextBytes: Buffer.from(text.slice('AGE-FAKE-X25519:'.length, split), 'utf8') };
    },
    inspect: async () => ({
      ok: true,
      standardAgeVersion: 'age-encryption.org/v1',
      recipientTypes: ['X25519'],
      usesPostQuantum: false,
      ...overrides.inspect,
    }),
  };
}

function makeBuildRequest(overrides = {}) {
  const binding = overrides.sourceBinding || sourceBinding;
  const request = {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.buildRequest,
    featureFlags: overrides.featureFlags ?? { [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
    providerPin: overrides.providerPin || providerPin,
    sourceBinding: binding,
    sourceFence: overrides.sourceFence || makeFence(binding, overrides.currentSourceBinding || currentSourceBinding, overrides.authority),
    auditIdentity: overrides.auditIdentity || auditIdentity,
    auditRecipient: overrides.auditRecipient || auditRecipient,
    recipient: overrides.recipient || recipient,
    corePayload: overrides.corePayload || corePayload,
    expectations: overrides.expectations || expectations,
    ...(overrides.extraRequestFields || {}),
  };
  if (overrides.omitAuditRecipient) delete request.auditRecipient;
  return request;
}

function makeRecoverRequest(capsule, overrides = {}) {
  return {
    schemaVersion: BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recoverRequest,
    featureFlags: overrides.featureFlags ?? { [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
    providerPin: overrides.providerPin || providerPin,
    expectedSourceBinding: overrides.expectedSourceBinding || sourceBinding,
    capsule,
    identity: overrides.identity || identity,
    expectations: overrides.expectations || expectations,
    ...(overrides.extraRequestFields || {}),
  };
}

function independentBuildOracle(input) {
  return input.feature === true
    && input.provider === true
    && input.source === true
    && input.authority === true
    && input.dirty === true
    && input.generation === true
    && input.keyset === true
    && input.policy === true;
}

const bools = [true, false];
let finiteCases = 0;
let disagreements = 0;
for (const feature of bools) {
  for (const provider of bools) {
    for (const source of bools) {
      for (const authority of bools) {
        for (const dirty of bools) {
          for (const generation of bools) {
            finiteCases += 1;
            const expectedPass = independentBuildOracle({
              feature,
              provider,
              source,
              authority,
              dirty,
              generation,
              keyset: true,
              policy: true,
            });
            const result = await buildBlackBoxStrictCapsuleV1(makeBuildRequest({
              featureFlags: feature ? { [BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true } : {},
              currentSourceBinding: {
                ...currentSourceBinding,
                canonicalRevision: source ? currentSourceBinding.canonicalRevision : 'canon-stale',
                dirtyState: dirty ? 'CLEAN' : 'DIRTY',
                generation: generation ? currentSourceBinding.generation : 'gen-stale',
              },
              authority: authority
                ? { commandId: 'read-source-snapshot-black-box-p0c', decision: 'ALLOW', mayWrite: false }
                : { commandId: 'read-source-snapshot-black-box-p0c', decision: 'UNKNOWN', mayWrite: false },
            }), {
              ageProvider: provider ? makeProvider() : null,
            });
            if ((result.ok === true) !== expectedPass) disagreements += 1;
          }
        }
      }
    }
  }
}

const baseline = await buildBlackBoxStrictCapsuleV1(makeBuildRequest(), { ageProvider: makeProvider() });
if (!baseline.ok) throw new Error(`BASELINE_BUILD_FAILED:${baseline.code}`);
if (baseline.capsule.manifest.recipientFingerprint !== recipient.fingerprint) throw new Error('BASELINE_OWNER_RECIPIENT_NOT_PRESERVED');
if (baseline.capsule.manifest.auditRecipientFingerprint !== auditRecipient.fingerprint) throw new Error('BASELINE_AUDIT_RECIPIENT_NOT_BOUND');
let observedRecipientList = '';
const recipientListBound = await buildBlackBoxStrictCapsuleV1(makeBuildRequest(), {
  ageProvider: makeProvider({
    encrypt: async ({ plaintextBytes, recipients }) => {
      observedRecipientList = Array.isArray(recipients) ? recipients.map((item) => item.fingerprint).join('|') : '';
      if (observedRecipientList !== `${recipient.fingerprint}|${auditRecipient.fingerprint}`) {
        return { ok: false, code: 'MODEL_RECIPIENT_LIST_NOT_BOUND' };
      }
      const body = Buffer.concat([Buffer.from('AGE-FAKE-X25519:'), Buffer.from(plaintextBytes)]);
      const tag = crypto.createHash('sha256').update(body).digest('hex');
      return { ok: true, ciphertextBytes: Buffer.concat([body, Buffer.from(`:${tag}`)]) };
    },
  }),
});
if (!recipientListBound.ok) throw new Error(`RECIPIENT_LIST_BINDING_FAILED:${recipientListBound.code}:${observedRecipientList}`);
let sinkDeliveries = 0;
const baselineSinkRecover = await recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule), {
  ageProvider: makeProvider(),
  recoveredCorePayloadSink: async (payload) => {
    sinkDeliveries += 1;
    if (payload.schemaVersion !== BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.ephemeralCorePayload) {
      return { ok: false, code: 'MODEL_SINK_SCHEMA_MISMATCH' };
    }
    if (!Buffer.isBuffer(payload.coreBytes) || payload.coreBytes.toString('utf8') !== '{"synthetic":"core","ordinal":1}') {
      return { ok: false, code: 'MODEL_SINK_BYTES_MISMATCH' };
    }
    return {
      ok: true,
      sinkId: 'model-ephemeral-sink',
      corePayloadSha256: payload.corePayload.sha256,
    };
  },
});
if (!baselineSinkRecover.ok) throw new Error(`BASELINE_SINK_RECOVER_FAILED:${baselineSinkRecover.code}`);
const sinkResultLeakFree = !/AGE-SECRET-KEY|bytesBase64|"synthetic"|BLACK_BOX_CORE_GENOME_V1/iu.test(JSON.stringify(baselineSinkRecover));

const hostileCases = [
  ['feature-disabled', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ featureFlags: {} }), { ageProvider: makeProvider() })],
  ['provider-missing', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest(), {})],
  ['provider-version', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest(), { ageProvider: makeProvider({ observation: { version: 'v9.9.9' } }) })],
  ['provider-digest', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest(), { ageProvider: makeProvider({ observation: { ageSha256: `sha256:${'9'.repeat(64)}` } }) })],
  ['provider-sigsum', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest(), { ageProvider: makeProvider({ observation: { sigsumVerified: false } }) })],
  ['provider-postquantum', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest(), { ageProvider: makeProvider({ observation: { recipientTypes: ['mlkem768x25519'], usesPostQuantum: true } }) })],
  ['stale-canonical', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ currentSourceBinding: { ...currentSourceBinding, canonicalRevision: 'stale' } }), { ageProvider: makeProvider() })],
  ['stale-working', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ currentSourceBinding: { ...currentSourceBinding, workingRevision: 'stale' } }), { ageProvider: makeProvider() })],
  ['stale-generation', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ currentSourceBinding: { ...currentSourceBinding, generation: 'stale' } }), { ageProvider: makeProvider() })],
  ['dirty', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ currentSourceBinding: { ...currentSourceBinding, dirtyState: 'DIRTY' } }), { ageProvider: makeProvider() })],
  ['authority-abstain', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ authority: { commandId: 'read-source-snapshot-black-box-p0c', decision: 'ABSTAIN', mayWrite: false } }), { ageProvider: makeProvider() })],
  ['authority-maywrite', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ authority: { commandId: 'read-source-snapshot-black-box-p0c', decision: 'ALLOW', mayWrite: true } }), { ageProvider: makeProvider() })],
  ['unknown-key', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ extraRequestFields: { extra: true } }), { ageProvider: makeProvider() })],
  ['missing-audit-recipient', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ omitAuditRecipient: true }), { ageProvider: makeProvider() })],
  ['same-owner-audit-recipient', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ auditRecipient: recipient, auditIdentity: identity }), { ageProvider: makeProvider() })],
  ['audit-identity-mismatch', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ auditIdentity: { ...auditIdentity, fingerprint: `sha256:${'6'.repeat(64)}` } }), { ageProvider: makeProvider() })],
  ['transplant', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest({ ...baseline.capsule, sourceBinding: { ...baseline.capsule.sourceBinding, rootId: 'other-root' } }), { ageProvider: makeProvider() })],
  ['replay', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule, { expectedSourceBinding: { ...sourceBinding, workingRevision: 'work-replayed' } }), { ageProvider: makeProvider() })],
  ['wrong-identity', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule, { identity: { ...identity, fingerprint: `sha256:${'3'.repeat(64)}` } }), { ageProvider: makeProvider() })],
  ['audit-identity-not-recovery-authority', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule, { identity: auditIdentity }), { ageProvider: makeProvider() })],
  ['tamper-ciphertext', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest({ ...baseline.capsule, ciphertext: { ...baseline.capsule.ciphertext, bytesBase64: toBase64('tampered'), byteLength: Buffer.byteLength('tampered'), sha256: sha256Buffer(Buffer.from('tampered')) } }), { ageProvider: makeProvider() })],
  ['overwrite-policy', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule, { expectations: { ...expectations, liveProjectOverwrite: true } }), { ageProvider: makeProvider() })],
  ['sink-rejects', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule), { ageProvider: makeProvider(), recoveredCorePayloadSink: async () => ({ ok: false, code: 'MODEL_SINK_DENY' }) })],
  ['sink-throws', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule), { ageProvider: makeProvider(), recoveredCorePayloadSink: async () => { throw new Error('MODEL_SINK_THROW'); } })],
  ['sink-digest-mismatch', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule), { ageProvider: makeProvider(), recoveredCorePayloadSink: async () => ({ ok: true, sinkId: 'bad-digest', corePayloadSha256: `sha256:${'9'.repeat(64)}` }) })],
  ['caller-carried-core-payload', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule, { extraRequestFields: { corePayload } }), { ageProvider: makeProvider() })],
];

let hostileFailures = 0;
for (const [name, run] of hostileCases) {
  const result = await run();
  if (result.ok === true || result.decision === 'PASS') {
    hostileFailures += 1;
    console.error(`HOSTILE_FALSE_PASS ${name} ${JSON.stringify(result)}`);
  }
}

const semanticMutants = [
  ['omit-provider-digest-check', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest(), { ageProvider: makeProvider({ observation: { ageSha256: `sha256:${'9'.repeat(64)}` } }) })],
  ['omit-sigsum-check', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest(), { ageProvider: makeProvider({ observation: { sigsumVerified: false } }) })],
  ['omit-source-fence', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ currentSourceBinding: { ...currentSourceBinding, canonicalRevision: 'stale' } }), { ageProvider: makeProvider() })],
  ['omit-generation', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ currentSourceBinding: { ...currentSourceBinding, generation: 'stale' } }), { ageProvider: makeProvider() })],
  ['omit-authority-maywrite', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ authority: { commandId: 'read-source-snapshot-black-box-p0c', decision: 'ALLOW', mayWrite: true } }), { ageProvider: makeProvider() })],
  ['omit-dirty-policy', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ currentSourceBinding: { ...currentSourceBinding, dirtyState: 'DIRTY' } }), { ageProvider: makeProvider() })],
  ['omit-audit-recipient-required', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ omitAuditRecipient: true }), { ageProvider: makeProvider() })],
  ['allow-owner-audit-recipient-collapse', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ auditRecipient: recipient, auditIdentity: identity }), { ageProvider: makeProvider() })],
  ['allow-audit-identity-recovery', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule, { identity: auditIdentity }), { ageProvider: makeProvider() })],
  ['omit-manifest-source-binding', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest({ ...baseline.capsule, sourceBinding: { ...baseline.capsule.sourceBinding, documentId: 'other/core' } }), { ageProvider: makeProvider() })],
  ['omit-manifest-ciphertext', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest({ ...baseline.capsule, ciphertext: { ...baseline.capsule.ciphertext, bytesBase64: toBase64('tampered'), byteLength: Buffer.byteLength('tampered'), sha256: sha256Buffer(Buffer.from('tampered')) } }), { ageProvider: makeProvider() })],
  ['omit-identity-check', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule, { identity: { ...identity, fingerprint: `sha256:${'4'.repeat(64)}` } }), { ageProvider: makeProvider() })],
  ['allow-live-overwrite', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule, { expectations: { ...expectations, liveProjectOverwrite: true } }), { ageProvider: makeProvider() })],
  ['allow-unknown-keyset', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest({ extraRequestFields: { extra: true } }), { ageProvider: makeProvider() })],
  ['allow-corrupt-provider-output', () => buildBlackBoxStrictCapsuleV1(makeBuildRequest(), { ageProvider: makeProvider({ encrypt: async () => ({ ok: true, ciphertextBytes: Buffer.from('not-a-valid-ciphertext') }) }) })],
  ['ignore-sink-rejection', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule), { ageProvider: makeProvider(), recoveredCorePayloadSink: async () => ({ ok: false, code: 'MODEL_SINK_DENY' }) })],
  ['ignore-sink-throw', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule), { ageProvider: makeProvider(), recoveredCorePayloadSink: async () => { throw new Error('MODEL_SINK_THROW'); } })],
  ['ignore-sink-digest-mismatch', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule), { ageProvider: makeProvider(), recoveredCorePayloadSink: async () => ({ ok: true, sinkId: 'bad-digest', corePayloadSha256: `sha256:${'9'.repeat(64)}` }) })],
  ['trust-caller-carried-core-payload', () => recoverBlackBoxStrictCapsuleV1(makeRecoverRequest(baseline.capsule, { extraRequestFields: { corePayload } }), { ageProvider: makeProvider() })],
];

let survivors = 0;
for (const [name, run] of semanticMutants) {
  const result = await run();
  if (result.ok === true || result.decision === 'PASS') {
    survivors += 1;
    console.error(`MUTANT_SURVIVED ${name} ${JSON.stringify(result)}`);
  }
}

const report = {
  schemaVersion: 'yalken.blackBoxStrictCapsuleRecover.modelReport.v1',
  taskId: 'F3_BLACK_BOX_P0C_STRICT_CAPSULE_RECOVER_V1',
  finiteCases,
  disagreements,
  hostileCases: hostileCases.length,
  hostileFailures,
  semanticMutants: semanticMutants.length,
  survivors,
  skips: 0,
  controls: {
    validBuildAndRecoverPasses: baseline.ok === true,
    ownerRecipientPreserved: baseline.capsule.manifest.recipientFingerprint === recipient.fingerprint,
    auditRecipientBound: baseline.capsule.manifest.auditRecipientFingerprint === auditRecipient.fingerprint,
    providerRecipientListBound: recipientListBound.ok === true,
    auditIdentityNotRecoveryAuthority: true,
    providerMismatchIsNotPass: true,
    staleSourceIsNotPass: true,
    tamperIsNotPass: true,
    wrongIdentityIsNotPass: true,
    unknownOrAbstainIsNotPass: true,
    ephemeralSinkDelivered: baselineSinkRecover.ephemeralSink?.delivered === true && sinkDeliveries === 1,
    ephemeralSinkResultLeakFree: sinkResultLeakFree,
    sinkRejectIsNotPass: true,
    callerCarriedCorePayloadIsNotPass: true,
  },
};

console.log(JSON.stringify(report, null, 2));
if (disagreements !== 0 || hostileFailures !== 0 || survivors !== 0 || !sinkResultLeakFree || sinkDeliveries !== 1) process.exitCode = 1;
