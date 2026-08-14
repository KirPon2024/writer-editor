'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxImportAsNewRecoveryPlanV1.mjs');
const P0C_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxStrictCapsuleRecoverV1.mjs');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'black-box-import-as-new-recovery-plan-v1-model.mjs');

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

async function loadP0c() {
  return import(pathToFileURL(P0C_PATH).href);
}

async function loadModel() {
  return import(pathToFileURL(MODEL_PATH).href);
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

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function toBase64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function makeProviderPin(p0c) {
  return Object.freeze({
    schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.providerPin,
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
}

function makeProvider(providerPin, recipients, overrides = {}) {
  const calls = { probe: 0, encrypt: 0, decrypt: 0, inspect: 0 };
  const recipientList = Array.isArray(recipients) ? recipients : [recipients];
  return {
    calls,
    probe: async () => {
      calls.probe += 1;
      return {
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
        ...(overrides.observation || {}),
      };
    },
    encrypt: async ({ plaintextBytes, recipient, recipients: suppliedRecipients }) => {
      calls.encrypt += 1;
      if (overrides.encrypt) return overrides.encrypt({ plaintextBytes, recipient, recipients: suppliedRecipients });
      const body = Buffer.concat([Buffer.from('AGE-FAKE-X25519:'), Buffer.from(plaintextBytes)]);
      const tag = crypto.createHash('sha256').update(body).digest('hex');
      return { ok: true, ciphertextBytes: Buffer.concat([body, Buffer.from(`:${tag}`)]) };
    },
    decrypt: async ({ ciphertextBytes, identity }) => {
      calls.decrypt += 1;
      if (overrides.decrypt) return overrides.decrypt({ ciphertextBytes, identity });
      if (!recipientList.some((item) => item.fingerprint === identity.fingerprint)) return { ok: false, code: 'FAKE_NO_MATCH' };
      const text = Buffer.from(ciphertextBytes).toString('utf8');
      if (!text.startsWith('AGE-FAKE-X25519:')) return { ok: false, code: 'FAKE_HEADER_TAMPERED' };
      const split = text.lastIndexOf(':');
      const body = Buffer.from(text.slice(0, split), 'utf8');
      const tag = text.slice(split + 1);
      const expected = crypto.createHash('sha256').update(body).digest('hex');
      if (tag !== expected) return { ok: false, code: 'FAKE_TAG_TAMPERED' };
      return { ok: true, plaintextBytes: Buffer.from(text.slice('AGE-FAKE-X25519:'.length, split), 'utf8') };
    },
    inspect: async () => {
      calls.inspect += 1;
      return {
        ok: true,
        standardAgeVersion: 'age-encryption.org/v1',
        recipientTypes: ['X25519'],
        usesPostQuantum: false,
        ...(overrides.inspect || {}),
      };
    },
  };
}

function makeFixture(module, p0c) {
  const sourceBinding = Object.freeze({
    schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.sourceBinding,
    projectId: 'project-blackbox-import',
    rootId: 'root-blackbox-import',
    documentId: 'manuscript/core',
    canonicalRevision: 'canon-0013',
    workingRevision: 'work-0013',
    generation: 'gen-0013',
    sourceSetDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  const providerPin = makeProviderPin(p0c);
  const recipient = Object.freeze({
    schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recipient,
    type: 'AGE_X25519_RECIPIENT',
    publicKey: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpp3l9',
    fingerprint: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
  });
  const identity = Object.freeze({
    schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.identity,
    type: 'AGE_X25519_IDENTITY',
    secretKeyBase64: toBase64('AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQVXH5Q'),
    fingerprint: recipient.fingerprint,
  });
  const auditRecipient = Object.freeze({
    schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recipient,
    type: 'AGE_X25519_RECIPIENT',
    publicKey: 'age1auditqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv24tsp',
    fingerprint: 'sha256:5555555555555555555555555555555555555555555555555555555555555555',
  });
  const auditIdentity = Object.freeze({
    schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.identity,
    type: 'AGE_X25519_IDENTITY',
    secretKeyBase64: toBase64('AGE-SECRET-KEY-1AUDITQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQVGX9A'),
    fingerprint: auditRecipient.fingerprint,
  });
  const corePayload = Object.freeze({
    schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.corePayload,
    type: 'BLACK_BOX_CORE_GENOME_V1',
    byteLength: Buffer.byteLength('{"sourceText":"synthetic manuscript recovery preview","ordinal":1}', 'utf8'),
    bytesBase64: toBase64('{"sourceText":"synthetic manuscript recovery preview","ordinal":1}'),
    sha256: sha256Buffer(Buffer.from('{"sourceText":"synthetic manuscript recovery preview","ordinal":1}', 'utf8')),
    sourceSetDigest: sourceBinding.sourceSetDigest,
  });
  const current = Object.freeze({
    projectId: sourceBinding.projectId,
    rootId: sourceBinding.rootId,
    documentId: sourceBinding.documentId,
    canonicalRevision: sourceBinding.canonicalRevision,
    workingRevision: sourceBinding.workingRevision,
    generation: sourceBinding.generation,
    sourceDigest: sourceBinding.sourceSetDigest,
    dirtyState: 'CLEAN',
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
  const wrapperExpectations = Object.freeze({
    importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
    liveProjectOverwrite: false,
    quarantineRequired: true,
    requireNoPlaintextInReceipt: true,
    requireProviderExact: true,
    requireP0cRecoverExecution: true,
  });
  function makeFence(binding = sourceBinding) {
    return {
      authority: {
        commandId: 'read-source-snapshot-black-box-import-plan',
        decision: 'ALLOW',
        mayWrite: false,
      },
      current,
      expected: {
        projectId: binding.projectId,
        rootId: binding.rootId,
        documentId: binding.documentId,
        canonicalRevision: binding.canonicalRevision,
        workingRevision: binding.workingRevision,
        sourceDigest: binding.sourceSetDigest,
      },
      fence: p0c.createBlackBoxP0cSourceFenceTokenV1(binding),
    };
  }
  async function buildCapsule(overrides = {}) {
    const provider = makeProvider(providerPin, [recipient, auditRecipient], overrides.providerOverrides || {});
    const built = await p0c.buildBlackBoxStrictCapsuleV1({
      schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.buildRequest,
      featureFlags: { [p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
      providerPin,
      sourceBinding: overrides.sourceBinding || sourceBinding,
      sourceFence: makeFence(overrides.sourceBinding || sourceBinding),
      auditIdentity,
      auditRecipient,
      recipient,
      corePayload,
      expectations,
    }, { ageProvider: provider });
    assert.equal(built.ok, true);
    return built.capsule;
  }
  function makeRequest(capsule, overrides = {}) {
    return {
      schemaVersion: module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS.request,
      featureFlags: {
        [module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_FEATURE_FLAG]: true,
        [p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true,
        ...(overrides.featureFlags || {}),
      },
      providerPin,
      expectedSourceBinding: sourceBinding,
      capsule,
      identity,
      expectations: wrapperExpectations,
      ...(overrides.extraRequestFields || {}),
      ...(overrides.requestOverrides || {}),
    };
  }
  return {
    buildCapsule,
    corePayload,
    current,
    expectations,
    identity,
    makeRequest,
    p0c,
    providerPin,
    recipient,
    sourceBinding,
    wrapperExpectations,
  };
}

function assertDenied(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'DENY');
  assert.notEqual(result.decision, 'PASS');
  assert.ok(
    result.reasons.some((reason) => reason.code === code),
    `expected ${code} in ${JSON.stringify(result.reasons)}`,
  );
}

test('F3 import-as-new recovery plan v1 exports a closed default-off read-only seam', async () => {
  const module = await loadModule();
  assert.equal(module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_FEATURE_FLAG, 'yalken.blackBox.importAsNewRecoveryPlan.v1');
  assert.deepEqual(sortedKeys(module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS), [
    'featureFlag',
    'plan',
    'receipt',
    'request',
    'result',
  ]);
  assert.deepEqual(sortedKeys(module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES), [
    'FEATURE_DISABLED',
    'FIELD_INVALID',
    'KEYSET_INVALID',
    'P0C_RECOVER_REJECTED',
    'PLAINTEXT_OR_KEY_LEAK',
    'PLAN_READY',
    'POLICY_REJECTED',
    'UPSTREAM_NOT_PASS',
  ]);
  assert.deepEqual(module.resolveBlackBoxImportAsNewRecoveryPlanFeatureFlag({}), {
    schemaVersion: module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS.featureFlag,
    flag: module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_FEATURE_FLAG,
    enabled: false,
    canWriteManuscript: false,
    canOverwriteLiveProject: false,
    canRecoverProject: false,
    canPreviewQuarantine: false,
    commandKernelWired: false,
    productUiWired: false,
  });
});

test('F3 import-as-new recovery plan v1 executes P0C recover internally and returns only sanitized quarantine preview', async () => {
  const [module, p0c] = await Promise.all([loadModule(), loadP0c()]);
  const fixture = makeFixture(module, p0c);
  const capsule = await fixture.buildCapsule();
  const recoverProvider = makeProvider(fixture.providerPin, fixture.recipient);

  const result = await module.prepareBlackBoxImportAsNewRecoveryPlanV1(
    fixture.makeRequest(capsule),
    { ageProvider: recoverProvider },
  );

  assert.equal(recoverProvider.calls.decrypt, 1);
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'PASS');
  assert.equal(result.code, module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.PLAN_READY);
  assert.equal(result.recoveryPlan.schemaVersion, module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_SCHEMAS.plan);
  assert.equal(result.recoveryPlan.importMode, 'IMPORT_AS_NEW_PROJECT_ONLY');
  assert.equal(result.recoveryPlan.liveProjectOverwrite, false);
  assert.equal(result.recoveryPlan.quarantine.status, 'QUARANTINED_PREVIEW_READY');
  assert.equal(result.recoveryPlan.quarantine.writeLiveProject, false);
  assert.equal(result.recoveryPlan.sourceBinding.projectId, fixture.sourceBinding.projectId);
  assert.equal(result.recoveryPlan.providerPinDigest, p0c.createBlackBoxP0cProviderPinDigestV1(fixture.providerPin));
  assert.equal(result.recoveryPlan.capsuleManifestDigest, capsule.manifest.manifestDigest);
  assert.equal(result.recoveryPlan.capsuleCiphertextSha256, capsule.ciphertext.sha256);
  assert.equal(result.receipt.claims.p0cRecoverExecuted, 'PASS');
  assert.equal(result.receipt.claims.importAsNewProjectOnly, 'PASS');
  assert.equal(result.receipt.claims.quarantinePreviewOnly, 'PASS');
  assert.equal(result.receipt.claims.liveProjectOverwrite, 'DENIED');
  assert.equal(result.receipt.claims.productRuntimeWiring, 'NOT_CLAIMED');
  assert.equal(result.receipt.claims.commandKernelWiring, 'NOT_CLAIMED');
  assert.equal(result.receipt.claims.productUiWiring, 'NOT_CLAIMED');
  assert.doesNotMatch(JSON.stringify(result), /synthetic manuscript|sourceText|AGE-SECRET-KEY|bytesBase64|BLACK_BOX_CORE_GENOME_V1/iu);
});

test('F3 import-as-new recovery plan v1 fails closed when disabled or caller carries proof/results', async () => {
  const [module, p0c] = await Promise.all([loadModule(), loadP0c()]);
  const fixture = makeFixture(module, p0c);
  const capsule = await fixture.buildCapsule();
  const provider = makeProvider(fixture.providerPin, fixture.recipient);

  const disabled = await module.prepareBlackBoxImportAsNewRecoveryPlanV1(fixture.makeRequest(capsule, {
    featureFlags: { [module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_FEATURE_FLAG]: false },
  }), { ageProvider: provider });
  assertDenied(disabled, module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.FEATURE_DISABLED);
  assert.equal(provider.calls.decrypt, 0);

  for (const extraRequestFields of [
    { recoverPlan: { ok: true, decision: 'PASS' } },
    { p0cRecoverResult: { ok: true, decision: 'PASS' } },
    { receipt: { claims: { importAsNewProjectOnly: 'PASS' } } },
  ]) {
    const forgedProvider = makeProvider(fixture.providerPin, fixture.recipient);
    const forged = await module.prepareBlackBoxImportAsNewRecoveryPlanV1(
      fixture.makeRequest(capsule, { extraRequestFields }),
      { ageProvider: forgedProvider },
    );
    assertDenied(forged, module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.KEYSET_INVALID);
    assert.equal(forgedProvider.calls.decrypt, 0);
  }
});

test('F3 import-as-new recovery plan v1 rejects wrong identity, provider mismatch, tamper, truncation, transplant and replay', async () => {
  const [module, p0c] = await Promise.all([loadModule(), loadP0c()]);
  const fixture = makeFixture(module, p0c);
  const capsule = await fixture.buildCapsule();

  const wrongIdentity = await module.prepareBlackBoxImportAsNewRecoveryPlanV1(fixture.makeRequest(capsule, {
    requestOverrides: {
      identity: { ...fixture.identity, fingerprint: 'sha256:3333333333333333333333333333333333333333333333333333333333333333' },
    },
  }), { ageProvider: makeProvider(fixture.providerPin, fixture.recipient) });
  assertDenied(wrongIdentity, module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.P0C_RECOVER_REJECTED);

  const providerMismatch = await module.prepareBlackBoxImportAsNewRecoveryPlanV1(
    fixture.makeRequest(capsule),
    { ageProvider: makeProvider(fixture.providerPin, fixture.recipient, { observation: { version: 'v9.9.9' } }) },
  );
  assertDenied(providerMismatch, module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.P0C_RECOVER_REJECTED);

  const ciphertextText = Buffer.from(capsule.ciphertext.bytesBase64, 'base64').toString('utf8');
  for (const badText of [
    ciphertextText.replace('AGE-FAKE-X25519', 'AGE-FAKE-SCRYPT'),
    ciphertextText.replace('BLACK_BOX_CORE_GENOME_V1', 'BLACK_BOX_CORE_GENOME_V2'),
    ciphertextText.slice(0, -4),
  ]) {
    const tampered = {
      ...capsule,
      ciphertext: {
        ...capsule.ciphertext,
        bytesBase64: Buffer.from(badText, 'utf8').toString('base64'),
        byteLength: Buffer.byteLength(badText, 'utf8'),
        sha256: sha256Buffer(Buffer.from(badText, 'utf8')),
      },
    };
    const result = await module.prepareBlackBoxImportAsNewRecoveryPlanV1(
      fixture.makeRequest(tampered),
      { ageProvider: makeProvider(fixture.providerPin, fixture.recipient) },
    );
    assertDenied(result, module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.P0C_RECOVER_REJECTED);
  }

  const transplanted = {
    ...capsule,
    sourceBinding: { ...capsule.sourceBinding, projectId: 'project-other' },
  };
  const transplant = await module.prepareBlackBoxImportAsNewRecoveryPlanV1(
    fixture.makeRequest(transplanted),
    { ageProvider: makeProvider(fixture.providerPin, fixture.recipient) },
  );
  assertDenied(transplant, module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.P0C_RECOVER_REJECTED);

  const replay = await module.prepareBlackBoxImportAsNewRecoveryPlanV1(fixture.makeRequest(capsule, {
    requestOverrides: {
      expectedSourceBinding: { ...fixture.sourceBinding, canonicalRevision: 'canon-replayed' },
    },
  }), { ageProvider: makeProvider(fixture.providerPin, fixture.recipient) });
  assertDenied(replay, module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.P0C_RECOVER_REJECTED);
});

test('F3 import-as-new recovery plan v1 rejects unsafe policy and UNKNOWN/ABSTAIN/CONFLICTING upstream results', async () => {
  const [module, p0c] = await Promise.all([loadModule(), loadP0c()]);
  const fixture = makeFixture(module, p0c);
  const capsule = await fixture.buildCapsule();

  const overwrite = await module.prepareBlackBoxImportAsNewRecoveryPlanV1(fixture.makeRequest(capsule, {
    requestOverrides: {
      expectations: { ...fixture.wrapperExpectations, liveProjectOverwrite: true },
    },
  }), { ageProvider: makeProvider(fixture.providerPin, fixture.recipient) });
  assertDenied(overwrite, module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.POLICY_REJECTED);

  const p0cSuccess = await p0c.recoverBlackBoxStrictCapsuleV1({
    schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recoverRequest,
    featureFlags: { [p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
    providerPin: fixture.providerPin,
    expectedSourceBinding: fixture.sourceBinding,
    capsule,
    identity: fixture.identity,
    expectations: fixture.expectations,
  }, { ageProvider: makeProvider(fixture.providerPin, fixture.recipient) });
  assert.equal(p0cSuccess.ok, true);

  for (const upstreamDecision of ['UNKNOWN', 'ABSTAIN', 'CONFLICTING']) {
    const result = await module.prepareBlackBoxImportAsNewRecoveryPlanV1(
      fixture.makeRequest(capsule),
      {
        ageProvider: makeProvider(fixture.providerPin, fixture.recipient),
        recoverStrictCapsule: async () => ({ ...p0cSuccess, ok: false, decision: upstreamDecision }),
      },
    );
    assertDenied(result, module.BLACK_BOX_IMPORT_AS_NEW_RECOVERY_PLAN_V1_CODES.UPSTREAM_NOT_PASS);
  }
});

test('F3 import-as-new recovery plan v1 model/oracle has hostile coverage and zero surviving semantic mutants', async () => {
  const { runBlackBoxImportAsNewRecoveryPlanV1Model } = await loadModel();
  const result = runBlackBoxImportAsNewRecoveryPlanV1Model();
  assert.equal(result.ok, true);
  assert.equal(result.summary.finiteCases, 36);
  assert.equal(result.summary.hostileCases, 14);
  assert.equal(result.summary.semanticMutants, 10);
  assert.equal(result.summary.mutationSurvivors, 0);
  assert.deepEqual(result.failures, []);
});
