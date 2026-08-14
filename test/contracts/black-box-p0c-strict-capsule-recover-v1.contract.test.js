'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxStrictCapsuleRecoverV1.mjs');

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

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

function sha256Stable(value) {
  return sha256Buffer(Buffer.from(stableJson(value), 'utf8'));
}

function toBase64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function makeFixture(module) {
  const sourceBinding = Object.freeze({
    schemaVersion: module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.sourceBinding,
    projectId: 'proj_blackbox_p0c',
    rootId: 'root-blackbox',
    documentId: 'manuscript/core',
    canonicalRevision: 'canon-0007',
    workingRevision: 'work-0007',
    generation: 'gen-0007',
    sourceSetDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
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
    schemaVersion: module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.providerPin,
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
      keyDigest: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    },
    executables: {
      agePath: '/Volumes/T7-Secure/storage/yalken/toolchains/age-v1.3.1-darwin-arm64/bin-pinned-20260814T004900Z/age',
      ageSha256: 'sha256:0e3ea0b1bed2b30aa2dc46eef4e1723864d626c80f37319c20d9b73ca045f56f',
      ageInspectPath: '/Volumes/T7-Secure/storage/yalken/toolchains/age-v1.3.1-darwin-arm64/bin-pinned-20260814T004900Z/age-inspect',
      ageInspectSha256: 'sha256:84695985ec630eaa88343b27b99d0478bb7fbfb27bbc0e43abd81a897ee7535f',
    },
  });
  const recipient = Object.freeze({
    schemaVersion: module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recipient,
    type: 'AGE_X25519_RECIPIENT',
    publicKey: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpp3l9',
    fingerprint: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
  });
  const identity = Object.freeze({
    schemaVersion: module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.identity,
    type: 'AGE_X25519_IDENTITY',
    secretKeyBase64: toBase64('AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQVXH5Q'),
    fingerprint: recipient.fingerprint,
  });
  const corePayload = Object.freeze({
    schemaVersion: module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.corePayload,
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
    const fence = module.createBlackBoxP0cSourceFenceTokenV1(binding);
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
      fence,
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
      encrypt: async ({ plaintextBytes }) => {
        if (overrides.encrypt) return overrides.encrypt({ plaintextBytes });
        const body = Buffer.concat([Buffer.from('AGE-FAKE-X25519:'), Buffer.from(plaintextBytes)]);
        const tag = crypto.createHash('sha256').update(body).digest('hex');
        return { ok: true, ciphertextBytes: Buffer.concat([body, Buffer.from(`:${tag}`)]) };
      },
      decrypt: async ({ ciphertextBytes, identity: suppliedIdentity }) => {
        if (overrides.decrypt) return overrides.decrypt({ ciphertextBytes, identity: suppliedIdentity });
        if (suppliedIdentity.fingerprint !== recipient.fingerprint) {
          return { ok: false, code: 'FAKE_NO_MATCH' };
        }
        const text = Buffer.from(ciphertextBytes).toString('utf8');
        if (!text.startsWith('AGE-FAKE-X25519:')) return { ok: false, code: 'FAKE_HEADER_TAMPERED' };
        const split = text.lastIndexOf(':');
        const body = Buffer.from(text.slice(0, split), 'utf8');
        const tag = text.slice(split + 1);
        const expected = crypto.createHash('sha256').update(body).digest('hex');
        if (tag !== expected) return { ok: false, code: 'FAKE_TAG_TAMPERED' };
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
    return {
      schemaVersion: module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.buildRequest,
      featureFlags: { [module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
      providerPin,
      sourceBinding: binding,
      sourceFence: makeFence(binding, overrides.currentSourceBinding || currentSourceBinding, overrides.authority),
      auditIdentity: identity,
      recipient,
      corePayload,
      expectations: overrides.expectations || expectations,
      ...(overrides.extraRequestFields || {}),
    };
  }

  function makeRecoverRequest(capsule, overrides = {}) {
    return {
      schemaVersion: module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recoverRequest,
      featureFlags: { [module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
      providerPin,
      expectedSourceBinding: sourceBinding,
      capsule,
      identity,
      expectations,
      ...overrides,
    };
  }

  return {
    corePayload,
    currentSourceBinding,
    expectations,
    identity,
    makeBuildRequest,
    makeFence,
    makeProvider,
    makeRecoverRequest,
    providerPin,
    recipient,
    sourceBinding,
  };
}

test('builds and recovers one ciphertext-bound synthetic age X25519 capsule without leaking plaintext or secret material', async () => {
  const module = await loadModule();
  const fixture = makeFixture(module);
  const built = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest(), { ageProvider: fixture.makeProvider() });
  assert.equal(built.ok, true);
  assert.equal(built.decision, 'PASS');
  assert.equal(built.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_BUILT);
  assert.equal(built.receipt.claims.standardAgeV1, 'PASS');
  assert.equal(built.receipt.claims.x25519Recipient, 'PASS');
  assert.equal(built.receipt.claims.ciphertextBoundManifest, 'PASS');
  assert.equal(built.receipt.claims.noPlaintextOrKeyMaterialInReceipt, 'PASS');
  assert.equal(built.capsule.manifest.manifestDigest, sha256Stable({
    schemaVersion: built.capsule.manifest.schemaVersion,
    providerPinDigest: built.capsule.manifest.providerPinDigest,
    sourceBindingDigest: built.capsule.manifest.sourceBindingDigest,
    recipientFingerprint: built.capsule.manifest.recipientFingerprint,
    corePayloadSha256: built.capsule.manifest.corePayloadSha256,
    plaintextSha256: built.capsule.manifest.plaintextSha256,
    ciphertextSha256: built.capsule.manifest.ciphertextSha256,
    importMode: built.capsule.manifest.importMode,
  }));
  assert.doesNotMatch(JSON.stringify(built.receipt), /"synthetic"|AGE-SECRET-KEY|bytesBase64|BLACK_BOX_CORE_GENOME_V1/iu);

  const recovered = await module.recoverBlackBoxStrictCapsuleV1(fixture.makeRecoverRequest(built.capsule), { ageProvider: fixture.makeProvider() });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.decision, 'PASS');
  assert.equal(recovered.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.RECOVER_PREVIEW_READY);
  assert.equal(recovered.recoverPlan.importMode, 'IMPORT_AS_NEW_PROJECT_ONLY');
  assert.equal(recovered.recoverPlan.liveProjectOverwrite, false);
  assert.equal(recovered.recoverPlan.quarantine.status, 'QUARANTINED_PREVIEW_READY');
  assert.equal(recovered.recoverPlan.sourceBinding.sourceSetDigest, fixture.sourceBinding.sourceSetDigest);
  assert.doesNotMatch(JSON.stringify(recovered.receipt), /AGE-SECRET-KEY|bytesBase64|"synthetic"|BLACK_BOX_CORE_GENOME_V1/iu);
});

test('delivers verified recovered CORE bytes only to an ephemeral sink and never to result or receipt', async () => {
  const module = await loadModule();
  const fixture = makeFixture(module);
  const built = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest(), { ageProvider: fixture.makeProvider() });
  assert.equal(built.ok, true);

  const deliveries = [];
  const recovered = await module.recoverBlackBoxStrictCapsuleV1(fixture.makeRecoverRequest(built.capsule), {
    ageProvider: fixture.makeProvider(),
    recoveredCorePayloadSink: async (payload) => {
      deliveries.push(payload);
      assert.equal(payload.schemaVersion, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.ephemeralCorePayload);
      assert.equal(payload.corePayload.schemaVersion, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.corePayload);
      assert.equal(payload.corePayload.sha256, fixture.corePayload.sha256);
      assert.equal(payload.corePayload.sourceSetDigest, fixture.sourceBinding.sourceSetDigest);
      assert.equal(Buffer.isBuffer(payload.coreBytes), true);
      assert.equal(payload.coreBytes.toString('utf8'), '{"synthetic":"core","ordinal":1}');
      assert.equal(payload.sourceBinding.projectId, fixture.sourceBinding.projectId);
      assert.equal(payload.capsuleManifestDigest, built.capsule.manifest.manifestDigest);
      return {
        ok: true,
        sinkId: 'synthetic-import-as-new-writer',
        corePayloadSha256: payload.corePayload.sha256,
      };
    },
  });

  assert.equal(recovered.ok, true);
  assert.equal(recovered.decision, 'PASS');
  assert.equal(deliveries.length, 1);
  assert.deepEqual(recovered.ephemeralSink, {
    delivered: true,
    sinkId: 'synthetic-import-as-new-writer',
    corePayloadSha256: fixture.corePayload.sha256,
  });
  assert.doesNotMatch(JSON.stringify(recovered), /AGE-SECRET-KEY|bytesBase64|"synthetic"|BLACK_BOX_CORE_GENOME_V1/iu);
  assert.doesNotMatch(JSON.stringify(recovered.receipt), /AGE-SECRET-KEY|bytesBase64|"synthetic"|BLACK_BOX_CORE_GENOME_V1/iu);
});

test('fails closed when ephemeral recovered CORE sink throws or rejects', async () => {
  const module = await loadModule();
  const fixture = makeFixture(module);
  const built = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest(), { ageProvider: fixture.makeProvider() });
  assert.equal(built.ok, true);

  const rejected = await module.recoverBlackBoxStrictCapsuleV1(fixture.makeRecoverRequest(built.capsule), {
    ageProvider: fixture.makeProvider(),
    recoveredCorePayloadSink: async () => ({
      ok: false,
      code: 'SYNTHETIC_WRITER_DENIED',
    }),
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.decision, 'DENY');
  assert.equal(rejected.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.EPHEMERAL_SINK_REJECTED);
  assert.doesNotMatch(JSON.stringify(rejected), /AGE-SECRET-KEY|bytesBase64|"synthetic"|BLACK_BOX_CORE_GENOME_V1/iu);

  const thrown = await module.recoverBlackBoxStrictCapsuleV1(fixture.makeRecoverRequest(built.capsule), {
    ageProvider: fixture.makeProvider(),
    recoveredCorePayloadSink: async () => {
      throw new Error('sink exploded with forbidden internal detail');
    },
  });
  assert.equal(thrown.ok, false);
  assert.equal(thrown.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.EPHEMERAL_SINK_REJECTED);
  assert.doesNotMatch(JSON.stringify(thrown), /forbidden internal detail|AGE-SECRET-KEY|bytesBase64|"synthetic"|BLACK_BOX_CORE_GENOME_V1/iu);
});

test('fails closed when disabled, provider missing, wrong provider version/digest, or unverified provenance is supplied', async () => {
  const module = await loadModule();
  const fixture = makeFixture(module);
  const disabled = await module.buildBlackBoxStrictCapsuleV1({
    ...fixture.makeBuildRequest(),
    featureFlags: {},
  }, { ageProvider: fixture.makeProvider() });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FEATURE_DISABLED);

  const missing = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest(), {});
  assert.equal(missing.ok, false);
  assert.equal(missing.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_MISSING);

  for (const [field, value] of [
    ['version', 'v9.9.9'],
    ['ageSha256', 'sha256:9999999999999999999999999999999999999999999999999999999999999999'],
    ['sigsumVerified', false],
  ]) {
    const provider = field === 'ageSha256'
      ? fixture.makeProvider({ observation: { ageSha256: value } })
      : fixture.makeProvider({ observation: { [field]: value } });
    const result = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest(), { ageProvider: provider });
    assert.equal(result.ok, false, field);
    assert.equal(result.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_PIN_MISMATCH, field);
  }
});

test('rejects stale source revision, stale generation, dirty state, forged authority, and UNKNOWN/ABSTAIN propagation', async () => {
  const module = await loadModule();
  const fixture = makeFixture(module);
  const staleRevision = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest({
    currentSourceBinding: { ...fixture.currentSourceBinding, canonicalRevision: 'canon-stale' },
  }), { ageProvider: fixture.makeProvider() });
  assert.equal(staleRevision.ok, false);
  assert.equal(staleRevision.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_FENCE_REJECTED);

  const staleGeneration = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest({
    sourceFence: fixture.makeFence(fixture.sourceBinding),
    sourceBinding: { ...fixture.sourceBinding, generation: 'gen-stale' },
  }), { ageProvider: fixture.makeProvider() });
  assert.equal(staleGeneration.ok, false);
  assert.equal(staleGeneration.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_BINDING_MISMATCH);

  for (const authority of [
    { commandId: 'read-source-snapshot-black-box-p0c', decision: 'ALLOW', mayWrite: true },
    { commandId: 'read-source-snapshot-black-box-p0c', decision: 'UNKNOWN', mayWrite: false },
    { commandId: 'read-source-snapshot-black-box-p0c', decision: 'ABSTAIN', mayWrite: false },
  ]) {
    const result = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest({ authority }), { ageProvider: fixture.makeProvider() });
    assert.equal(result.ok, false, authority.decision);
    assert.equal(result.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_FENCE_REJECTED, authority.decision);
    assert.notEqual(result.decision, 'PASS');
  }

  const dirty = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest({
    currentSourceBinding: { ...fixture.currentSourceBinding, dirtyState: 'DIRTY' },
  }), { ageProvider: fixture.makeProvider() });
  assert.equal(dirty.ok, false);
  assert.equal(dirty.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_FENCE_REJECTED);
});

test('rejects transplant/replay by binding project/root/document/source digest and provider pin into the manifest', async () => {
  const module = await loadModule();
  const fixture = makeFixture(module);
  const built = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest(), { ageProvider: fixture.makeProvider() });
  assert.equal(built.ok, true);

  const transplanted = {
    ...built.capsule,
    sourceBinding: { ...built.capsule.sourceBinding, projectId: 'proj_other' },
  };
  const result = await module.recoverBlackBoxStrictCapsuleV1(fixture.makeRecoverRequest(transplanted), { ageProvider: fixture.makeProvider() });
  assert.equal(result.ok, false);
  assert.equal(result.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.CAPSULE_MANIFEST_MISMATCH);

  const replayed = await module.recoverBlackBoxStrictCapsuleV1(fixture.makeRecoverRequest(built.capsule, {
    expectedSourceBinding: { ...fixture.sourceBinding, canonicalRevision: 'canon-replayed' },
  }), { ageProvider: fixture.makeProvider() });
  assert.equal(replayed.ok, false);
  assert.equal(replayed.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.SOURCE_BINDING_MISMATCH);
});

test('rejects tampered header/body/tag, truncation, and corrupt provider output instead of returning PASS', async () => {
  const module = await loadModule();
  const fixture = makeFixture(module);
  const built = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest(), { ageProvider: fixture.makeProvider() });
  assert.equal(built.ok, true);
  const capsuleText = Buffer.from(built.capsule.ciphertext.bytesBase64, 'base64').toString('utf8');

  for (const tamperedText of [
    capsuleText.replace('AGE-FAKE-X25519', 'AGE-FAKE-SCRYPT'),
    capsuleText.replace('BLACK_BOX_CORE_GENOME_V1', 'BLACK_BOX_CORE_GENOME_V2'),
    capsuleText.slice(0, -4),
  ]) {
    const tampered = {
      ...built.capsule,
      ciphertext: {
        ...built.capsule.ciphertext,
        bytesBase64: Buffer.from(tamperedText, 'utf8').toString('base64'),
        byteLength: Buffer.byteLength(tamperedText, 'utf8'),
        sha256: sha256Buffer(Buffer.from(tamperedText, 'utf8')),
      },
    };
    const result = await module.recoverBlackBoxStrictCapsuleV1(fixture.makeRecoverRequest(tampered), { ageProvider: fixture.makeProvider() });
    assert.equal(result.ok, false, tamperedText);
    assert.notEqual(result.decision, 'PASS');
  }

  const corrupt = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest(), {
    ageProvider: fixture.makeProvider({ encrypt: async () => ({ ok: true, ciphertextBytes: Buffer.from('not-json-after-decrypt') }) }),
  });
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_ROUNDTRIP_FAILED);
});

test('rejects wrong identity key during recover and keeps recovery import-as-new only', async () => {
  const module = await loadModule();
  const fixture = makeFixture(module);
  const built = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest(), { ageProvider: fixture.makeProvider() });
  assert.equal(built.ok, true);
  const wrong = await module.recoverBlackBoxStrictCapsuleV1(fixture.makeRecoverRequest(built.capsule, {
    identity: { ...fixture.identity, fingerprint: 'sha256:3333333333333333333333333333333333333333333333333333333333333333' },
  }), { ageProvider: fixture.makeProvider() });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.PROVIDER_DECRYPT_FAILED);

  const overwrite = await module.recoverBlackBoxStrictCapsuleV1(fixture.makeRecoverRequest(built.capsule, {
    expectations: { ...fixture.expectations, liveProjectOverwrite: true },
  }), { ageProvider: fixture.makeProvider() });
  assert.equal(overwrite.ok, false);
  assert.equal(overwrite.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.FIELD_INVALID);
});

test('uses closed request/capsule keysets and exact provider pin digest', async () => {
  const module = await loadModule();
  const fixture = makeFixture(module);
  const pinDigest = module.createBlackBoxP0cProviderPinDigestV1(fixture.providerPin);
  assert.match(pinDigest, /^sha256:[a-f0-9]{64}$/u);

  const unknownRequestKey = await module.buildBlackBoxStrictCapsuleV1({
    ...fixture.makeBuildRequest({ extraRequestFields: { surprise: true } }),
  }, { ageProvider: fixture.makeProvider() });
  assert.equal(unknownRequestKey.ok, false);
  assert.equal(unknownRequestKey.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.KEYSET_INVALID);

  const built = await module.buildBlackBoxStrictCapsuleV1(fixture.makeBuildRequest(), { ageProvider: fixture.makeProvider() });
  assert.equal(built.ok, true);
  const unknownCapsuleKey = await module.recoverBlackBoxStrictCapsuleV1(fixture.makeRecoverRequest({
    ...built.capsule,
    plaintext: 'forbidden',
  }), { ageProvider: fixture.makeProvider() });
  assert.equal(unknownCapsuleKey.ok, false);
  assert.equal(unknownCapsuleKey.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.KEYSET_INVALID);

  const callerCarriedCore = await module.recoverBlackBoxStrictCapsuleV1(fixture.makeRecoverRequest(built.capsule, {
    corePayload: fixture.corePayload,
  }), { ageProvider: fixture.makeProvider() });
  assert.equal(callerCarriedCore.ok, false);
  assert.equal(callerCarriedCore.code, module.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_CODES.KEYSET_INVALID);
});
