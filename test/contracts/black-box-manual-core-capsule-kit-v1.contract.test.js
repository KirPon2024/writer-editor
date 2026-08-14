'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const KIT_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxManualCoreCapsuleKitV1.mjs');
const P0A_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxCoreSourceAdapterV1.mjs');
const P0B_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxDarwinDurablePublisherV1.mjs');
const P0C_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxStrictCapsuleRecoverV1.mjs');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'black-box-manual-core-capsule-kit-v1-model.mjs');
const TREE_IDENTITY_PATH = path.join(REPO_ROOT, 'src', 'core', 'projectTreeIdentity.mjs');

async function loadKit() {
  return import(pathToFileURL(KIT_PATH).href);
}

async function loadP0a() {
  return import(pathToFileURL(P0A_PATH).href);
}

async function loadP0b() {
  return import(pathToFileURL(P0B_PATH).href);
}

async function loadP0c() {
  return import(pathToFileURL(P0C_PATH).href);
}

async function loadModel() {
  return import(pathToFileURL(MODEL_PATH).href);
}

async function loadTreeIdentity() {
  return import(pathToFileURL(TREE_IDENTITY_PATH).href);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function sha256Text(text) {
  return sha256Buffer(Buffer.from(String(text), 'utf8'));
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function toBase64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

async function treeNodeId(projectId, bindingKey) {
  const { createDeterministicTreeNodeId } = await loadTreeIdentity();
  return createDeterministicTreeNodeId(projectId, bindingKey);
}

async function buildCore(p0a, overrides = {}) {
  const projectId = overrides.projectId || 'project-alpha';
  const rootId = overrides.rootId || 'root-main';
  const manifestObject = overrides.manifestObject || {
    schemaVersion: 'yalken.syntheticProjectManifest.v1',
    projectId,
    rootId,
    sceneOrder: ['scene-001', 'scene-002'],
    scenes: {
      'scene-001': { title: 'Opening', bindingKey: 'file:scenes/scene-001.json' },
      'scene-002': { title: 'Turn', bindingKey: 'file:scenes/scene-002.json' },
    },
    notesOrder: [],
    historyOrder: [],
  };
  const manifestText = overrides.manifestText || stableJson(manifestObject);
  const manifestBindingKey = overrides.manifestBindingKey || 'file:project.json';
  const manifest = {
    kind: 'PROJECT_MANIFEST',
    documentId: 'project-manifest',
    bindingKey: manifestBindingKey,
    treeNodeId: await treeNodeId(projectId, manifestBindingKey),
    sourceText: manifestText,
    sourceTextDigest: sha256Text(manifestText),
  };
  const sceneOne = 'Opening line.\nSecond line.';
  const sceneTwo = 'A later scene.';
  return {
    schemaVersion: p0a.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.coreSnapshot,
    manifest,
    items: [
      {
        kind: 'SCENE_DOCUMENT',
        documentId: 'scene-001',
        bindingKey: 'file:scenes/scene-001.json',
        treeNodeId: await treeNodeId(projectId, 'file:scenes/scene-001.json'),
        ordinal: 0,
        sourceText: sceneOne,
        sourceTextDigest: sha256Text(sceneOne),
      },
      {
        kind: 'SCENE_DOCUMENT',
        documentId: 'scene-002',
        bindingKey: 'file:scenes/scene-002.json',
        treeNodeId: await treeNodeId(projectId, 'file:scenes/scene-002.json'),
        ordinal: 1,
        sourceText: sceneTwo,
        sourceTextDigest: sha256Text(sceneTwo),
      },
    ],
    expectedCounts: {
      projectManifest: 1,
      sceneDocuments: 2,
      notesDocuments: 0,
      historyDocuments: 0,
      totalItems: 3,
    },
  };
}

async function trustedSnapshot(p0a, overrides = {}) {
  const binding = {
    projectId: overrides.projectId || 'project-alpha',
    rootId: overrides.rootId || 'root-main',
    documentId: overrides.documentId || 'black-box-core',
    canonicalRevision: overrides.canonicalRevision || 'canon-r001',
    workingRevision: overrides.workingRevision || 'work-r001',
    generation: overrides.generation || 'gen-r001',
    sourceDigest: `sha256:${'0'.repeat(64)}`,
    ...(overrides.binding || {}),
  };
  const core = overrides.core || await buildCore(p0a, {
    projectId: binding.projectId,
    rootId: binding.rootId,
    ...(overrides.coreOverrides || {}),
  });
  binding.sourceDigest = overrides.sourceDigest || p0a.computeBlackBoxCoreSourceDigestV1(core, binding);
  return {
    schemaVersion: p0a.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.sourceSnapshot,
    authority: {
      decision: overrides.decision || 'ALLOW',
      mayWrite: overrides.mayWrite ?? false,
      queryId: overrides.queryId || 'query.blackBoxCoreSourceAdapter.readSourceSnapshot.v1',
    },
    expected: binding,
    current: {
      ...binding,
      dirtyState: overrides.dirtyState || 'CLEAN',
      ...(overrides.current || {}),
    },
    core,
  };
}

function makeProviderPin(p0c) {
  return {
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
  };
}

function makeRecipientAndIdentity(p0c) {
  const recipient = {
    schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recipient,
    type: 'AGE_X25519_RECIPIENT',
    publicKey: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpp3l9',
    fingerprint: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
  };
  return {
    recipient,
    identity: {
      schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.identity,
      type: 'AGE_X25519_IDENTITY',
      secretKeyBase64: toBase64('AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQVXH5Q'),
      fingerprint: recipient.fingerprint,
    },
    auditRecipient: {
      schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recipient,
      type: 'AGE_X25519_RECIPIENT',
      publicKey: 'age1auditqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqv24tsp',
      fingerprint: 'sha256:5555555555555555555555555555555555555555555555555555555555555555',
    },
    auditIdentity: {
      schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.identity,
      type: 'AGE_X25519_IDENTITY',
      secretKeyBase64: toBase64('AGE-SECRET-KEY-1AUDITQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQVGX9A'),
      fingerprint: 'sha256:5555555555555555555555555555555555555555555555555555555555555555',
    },
  };
}

function makeProvider(providerPin, recipients, overrides = {}) {
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
    encrypt: async ({ plaintextBytes, recipient, recipients: suppliedRecipients }) => {
      if (overrides.encrypt) return overrides.encrypt({ plaintextBytes, recipient, recipients: suppliedRecipients });
      const body = Buffer.concat([Buffer.from('AGE-FAKE-X25519:'), Buffer.from(plaintextBytes)]);
      const tag = crypto.createHash('sha256').update(body).digest('hex');
      return { ok: true, ciphertextBytes: Buffer.concat([body, Buffer.from(`:${tag}`)]) };
    },
    decrypt: async ({ ciphertextBytes, identity }) => {
      if (overrides.decrypt) return overrides.decrypt({ ciphertextBytes, identity });
      if (!recipients.some((item) => item.fingerprint === identity.fingerprint)) return { ok: false, code: 'FAKE_NO_MATCH' };
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

async function makeFixture(overrides = {}) {
  const [kit, p0a, p0b, p0c] = await Promise.all([loadKit(), loadP0a(), loadP0b(), loadP0c()]);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-manual-kit-contract-'));
  const providerPin = makeProviderPin(p0c);
  const { recipient, identity, auditRecipient, auditIdentity } = makeRecipientAndIdentity(p0c);
  const sourceSnapshot = overrides.sourceSnapshot || await trustedSnapshot(p0a, overrides.sourceOverrides || {});
  const featureFlags = {
    [kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG]: true,
    [p0a.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG]: true,
    [p0b.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_FEATURE_FLAG]: true,
    [p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true,
    ...(overrides.featureFlags || {}),
  };
  const target = overrides.target || {
    schemaVersion: p0b.BLACK_BOX_DARWIN_DURABLE_PUBLISHER_V1_SCHEMAS.target,
    platform: 'darwin',
    directoryPath: tempRoot,
    fileName: overrides.fileName || 'manual-core-kit.yalken-capsule',
  };
  const request = {
    schemaVersion: kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.request,
    featureFlags,
    sourceSnapshot,
    providerPin,
    recipient,
    auditRecipient: overrides.auditRecipient || auditRecipient,
    auditIdentity: overrides.auditIdentity || auditIdentity,
    target,
    ...(overrides.extraRequestFields || {}),
  };
  return {
    identity,
    auditIdentity,
    auditRecipient,
    kit,
    p0a,
    p0b,
    p0c,
    providerPin,
    recipient,
    request,
    sourceSnapshot,
    target,
    tempRoot,
    ageProvider: makeProvider(providerPin, [recipient, auditRecipient], overrides.providerOverrides || {}),
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

test('F3 manual CORE capsule kit v1 exports a closed default-off product-only seam', async () => {
  const kit = await loadKit();
  assert.equal(kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG, 'yalken.blackBox.manualCoreCapsuleKit.v1');
  assert.deepEqual(sortedKeys(kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS), [
    'featureFlag',
    'receipt',
    'recoveryKit',
    'request',
    'result',
  ]);
  assert.deepEqual(sortedKeys(kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES), [
    'CAPSULE_BUILD_REJECTED',
    'FEATURE_DISABLED',
    'FIELD_INVALID',
    'KEYSET_INVALID',
    'KIT_CREATED',
    'PLAINTEXT_OR_KEY_LEAK',
    'PUBLISH_REJECTED',
    'SOURCE_SET_REJECTED',
    'UNKNOWN_OR_ABSTAIN',
  ]);
  assert.deepEqual(kit.resolveBlackBoxManualCoreCapsuleKitFeatureFlag({}), {
    schemaVersion: kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.featureFlag,
    flag: kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_FEATURE_FLAG,
    enabled: false,
    canWriteManuscript: false,
    canOverwriteLiveProject: false,
    canPublishCreateOnlyCapsule: false,
    canRecoverProject: false,
    commandKernelWired: false,
    productUiWired: false,
  });
});

test('F3 manual CORE capsule kit v1 composes P0A source, P0C capsule, and P0B create-only durable publication', async () => {
  const fixture = await makeFixture();
  const result = await fixture.kit.buildBlackBoxManualCoreCapsuleKitV1(fixture.request, { ageProvider: fixture.ageProvider });
  const targetPath = path.join(fixture.tempRoot, 'manual-core-kit.yalken-capsule');
  const artifactBytes = await fs.readFile(targetPath);
  const capsule = JSON.parse(artifactBytes.toString('utf8'));

  assert.equal(result.ok, true);
  assert.equal(result.decision, 'PASS');
  assert.equal(result.code, fixture.kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.KIT_CREATED);
  assert.equal(result.recoveryKit.schemaVersion, fixture.kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_SCHEMAS.recoveryKit);
  assert.equal(result.recoveryKit.importMode, 'IMPORT_AS_NEW_PROJECT_ONLY');
  assert.equal(result.recoveryKit.liveProjectOverwrite, false);
  assert.equal(result.recoveryKit.quarantineRequired, true);
  assert.equal(result.recoveryKit.ownerKeyOutsideBuilder, true);
  assert.equal(result.recoveryKit.commandKernelWired, false);
  assert.equal(result.recoveryKit.productUiWired, false);
  assert.equal(result.recoveryKit.sourceBinding.projectId, 'project-alpha');
  assert.equal(result.recoveryKit.publishedArtifactSha256, sha256Buffer(artifactBytes));
  assert.equal(result.receipt.sourceSetDigest, result.recoveryKit.sourceSetDigest);
  assert.equal(result.receipt.publishReceipt.artifact.sha256, result.recoveryKit.publishedArtifactSha256);
  assert.equal(result.receipt.claims.disasterReady, 'NOT_CLAIMED');
  assert.equal(result.receipt.claims.liveProjectOverwrite, 'DENIED');
  assert.equal(result.receipt.claims.createOnlyDurablePublication, 'PASS');

  assert.equal(capsule.schemaVersion, fixture.p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.capsule);
  assert.equal(capsule.manifest.ciphertextSha256, capsule.ciphertext.sha256);
  assert.equal(capsule.manifest.corePayloadSha256, result.recoveryKit.corePayloadSha256);
  assert.equal(capsule.provider.providerPinDigest, result.recoveryKit.providerPinDigest);

  const recovered = await fixture.p0c.recoverBlackBoxStrictCapsuleV1({
    schemaVersion: fixture.p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.recoverRequest,
    featureFlags: { [fixture.p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
    providerPin: fixture.providerPin,
    expectedSourceBinding: capsule.sourceBinding,
    capsule,
    identity: fixture.identity,
    expectations: {
      importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
      liveProjectOverwrite: false,
      ownerKeyOutsideBuilder: true,
      quarantineRequired: true,
      requireCiphertextBoundManifest: true,
      requireNoPlaintextInReceipt: true,
      requireProviderExact: true,
      requireStandardAgeV1: true,
      requireX25519Recipient: true,
    },
  }, { ageProvider: fixture.ageProvider });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recoverPlan.liveProjectOverwrite, false);

  const serializedResult = JSON.stringify(result);
  assert.doesNotMatch(serializedResult, /Opening line|Second line|A later scene|AGE-SECRET-KEY|sourceText|bytesBase64/iu);
});

test('F3 manual CORE capsule kit v1 fails closed before publish when disabled or caller tries to carry proof/results', async () => {
  const disabled = await makeFixture({
    featureFlags: { 'yalken.blackBox.manualCoreCapsuleKit.v1': false },
  });
  const disabledResult = await disabled.kit.buildBlackBoxManualCoreCapsuleKitV1(disabled.request, { ageProvider: disabled.ageProvider });
  assertDenied(disabledResult, disabled.kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.FEATURE_DISABLED);
  assert.deepEqual(await fs.readdir(disabled.tempRoot), []);

  const forged = await makeFixture({
    extraRequestFields: {
      sourceSet: { ok: true, decision: 'ALLOW' },
      capsule: { ok: true, decision: 'PASS' },
      publishReceipt: { ok: true, decision: 'PASS' },
    },
  });
  const forgedResult = await forged.kit.buildBlackBoxManualCoreCapsuleKitV1(forged.request, { ageProvider: forged.ageProvider });
  assertDenied(forgedResult, forged.kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.KEYSET_INVALID);
  assert.deepEqual(await fs.readdir(forged.tempRoot), []);
});

test('F3 manual CORE capsule kit v1 propagates stale, dirty, UNKNOWN and ABSTAIN source authority as non-PASS', async () => {
  for (const { sourceOverrides, code } of [
    { sourceOverrides: { current: { canonicalRevision: 'canon-stale' } }, code: 'SOURCE_SET_REJECTED' },
    { sourceOverrides: { current: { generation: 'gen-stale' } }, code: 'SOURCE_SET_REJECTED' },
    { sourceOverrides: { dirtyState: 'DIRTY' }, code: 'SOURCE_SET_REJECTED' },
    { sourceOverrides: { decision: 'UNKNOWN' }, code: 'UNKNOWN_OR_ABSTAIN' },
    { sourceOverrides: { decision: 'ABSTAIN' }, code: 'UNKNOWN_OR_ABSTAIN' },
    { sourceOverrides: { decision: 'ALLOW', mayWrite: true }, code: 'SOURCE_SET_REJECTED' },
  ]) {
    const fixture = await makeFixture({ sourceOverrides });
    const result = await fixture.kit.buildBlackBoxManualCoreCapsuleKitV1(fixture.request, { ageProvider: fixture.ageProvider });
    assertDenied(result, fixture.kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES[code]);
    assert.deepEqual(await fs.readdir(fixture.tempRoot), [], JSON.stringify(sourceOverrides));
  }
});

test('F3 manual CORE capsule kit v1 rejects provider missing or exact pin mismatch before artifact publication', async () => {
  const missing = await makeFixture();
  const missingResult = await missing.kit.buildBlackBoxManualCoreCapsuleKitV1(missing.request, {});
  assertDenied(missingResult, missing.kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.CAPSULE_BUILD_REJECTED);
  assert.deepEqual(await fs.readdir(missing.tempRoot), []);

  const wrong = await makeFixture({
    providerOverrides: { observation: { version: 'v9.9.9' } },
  });
  const wrongResult = await wrong.kit.buildBlackBoxManualCoreCapsuleKitV1(wrong.request, { ageProvider: wrong.ageProvider });
  assertDenied(wrongResult, wrong.kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.CAPSULE_BUILD_REJECTED);
  assert.deepEqual(await fs.readdir(wrong.tempRoot), []);
});

test('F3 manual CORE capsule kit v1 rejects create-only publication conflicts and preserves existing bytes', async () => {
  const fixture = await makeFixture();
  const targetPath = path.join(fixture.tempRoot, 'manual-core-kit.yalken-capsule');
  await fs.writeFile(targetPath, 'pre-existing-owner-bytes', 'utf8');

  const result = await fixture.kit.buildBlackBoxManualCoreCapsuleKitV1(fixture.request, { ageProvider: fixture.ageProvider });
  assertDenied(result, fixture.kit.BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1_CODES.PUBLISH_REJECTED);
  assert.equal(await fs.readFile(targetPath, 'utf8'), 'pre-existing-owner-bytes');
});

test('F3 manual CORE capsule kit v1 binds sourceSetDigest into capsule and publisher to reject transplant/replay', async () => {
  const fixture = await makeFixture();
  const first = await fixture.kit.buildBlackBoxManualCoreCapsuleKitV1(fixture.request, { ageProvider: fixture.ageProvider });
  assert.equal(first.ok, true);
  const capsule = JSON.parse((await fs.readFile(path.join(fixture.tempRoot, 'manual-core-kit.yalken-capsule'))).toString('utf8'));
  assert.equal(capsule.sourceBinding.sourceSetDigest, first.recoveryKit.sourceSetDigest);
  assert.equal(capsule.manifest.sourceBindingDigest, first.recoveryKit.sourceBindingDigest);

  const replay = await makeFixture({
    sourceOverrides: {
      binding: { projectId: 'project-beta' },
    },
  });
  const replayResult = await replay.kit.buildBlackBoxManualCoreCapsuleKitV1(replay.request, { ageProvider: replay.ageProvider });
  assert.equal(replayResult.ok, true);
  assert.notEqual(replayResult.recoveryKit.sourceBindingDigest, first.recoveryKit.sourceBindingDigest);
  assert.notEqual(replayResult.recoveryKit.sourceSetDigest, first.recoveryKit.sourceSetDigest);
});

test('F3 manual CORE capsule kit v1 model/oracle has hostile coverage and zero surviving semantic mutants', async () => {
  const { runBlackBoxManualCoreCapsuleKitV1Model } = await loadModel();
  const result = runBlackBoxManualCoreCapsuleKitV1Model();
  assert.equal(result.ok, true);
  assert.equal(result.summary.finiteCases, 48);
  assert.equal(result.summary.hostileCases, 16);
  assert.equal(result.summary.semanticMutants, 12);
  assert.equal(result.summary.mutationSurvivors, 0);
  assert.deepEqual(result.failures, []);
});
