'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WRITER_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxImportAsNewProjectWriterV1.mjs');
const P0C_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxStrictCapsuleRecoverV1.mjs');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'black-box-import-as-new-project-writer-v1-model.mjs');

async function loadWriter() {
  return import(pathToFileURL(WRITER_PATH).href);
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
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')}`;
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function sortedKeys(value) {
  return Object.keys(value).sort();
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

function makeProvider(providerPin, recipient, overrides = {}) {
  const calls = { probe: 0, encrypt: 0, decrypt: 0, inspect: 0 };
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
    encrypt: async ({ plaintextBytes }) => {
      calls.encrypt += 1;
      const body = Buffer.concat([Buffer.from('AGE-FAKE-X25519:'), Buffer.from(plaintextBytes)]);
      const tag = crypto.createHash('sha256').update(body).digest('hex');
      return { ok: true, ciphertextBytes: Buffer.concat([body, Buffer.from(`:${tag}`)]) };
    },
    decrypt: async ({ ciphertextBytes, identity }) => {
      calls.decrypt += 1;
      if (overrides.decrypt) return overrides.decrypt({ ciphertextBytes, identity });
      if (identity.fingerprint !== recipient.fingerprint) return { ok: false, code: 'FAKE_NO_MATCH' };
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

function makeCoreGenome(sourceBinding, overrides = {}) {
  const manifestText = '{"projectId":"project-blackbox-import","projectName":"Recovered Synthetic","schemaVersion":1}';
  const sceneOne = 'Opening line.\nSecond line.';
  const sceneTwo = 'A later scene.';
  const items = overrides.items || [
    {
      kind: 'PROJECT_MANIFEST',
      documentId: 'project-manifest',
      bindingKey: 'file:project.craftsman.json',
      ordinal: 0,
      sourceText: manifestText,
      sourceTextDigest: sha256Buffer(Buffer.from(manifestText, 'utf8')),
      byteLength: Buffer.byteLength(manifestText, 'utf8'),
    },
    {
      kind: 'SCENE_DOCUMENT',
      documentId: 'scene-001',
      bindingKey: 'file:roman/Opening.txt',
      ordinal: 1,
      sourceText: sceneOne,
      sourceTextDigest: sha256Buffer(Buffer.from(sceneOne, 'utf8')),
      byteLength: Buffer.byteLength(sceneOne, 'utf8'),
    },
    {
      kind: 'SCENE_DOCUMENT',
      documentId: 'scene-002',
      bindingKey: 'file:roman/Second.txt',
      ordinal: 2,
      sourceText: sceneTwo,
      sourceTextDigest: sha256Buffer(Buffer.from(sceneTwo, 'utf8')),
      byteLength: Buffer.byteLength(sceneTwo, 'utf8'),
    },
  ];
  return {
    schemaVersion: 'yalken.blackBoxManualCoreCapsuleKit.coreGenome.v1',
    sourceBinding,
    sourceSetDigest: sourceBinding.sourceSetDigest,
    accounting: {
      projectManifest: 1,
      sceneDocuments: 2,
      notesDocuments: 0,
      historyDocuments: 0,
      totalItems: items.length,
    },
    items,
    recovery: {
      importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
      liveProjectOverwrite: false,
      ownerKeyOutsideBuilder: true,
      quarantineRequired: true,
    },
  };
}

async function makeFixture(writer, p0c, overrides = {}) {
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
  const genome = makeCoreGenome(sourceBinding, overrides.genomeOverrides || {});
  const genomeBytes = Buffer.from(stableJson(genome), 'utf8');
  const corePayload = Object.freeze({
    schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.corePayload,
    type: 'BLACK_BOX_CORE_GENOME_V1',
    byteLength: genomeBytes.byteLength,
    bytesBase64: genomeBytes.toString('base64'),
    sha256: sha256Buffer(genomeBytes),
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
  const sourceFence = {
    authority: {
      commandId: 'read-source-snapshot-black-box-import-as-new-project-writer',
      decision: 'ALLOW',
      mayWrite: false,
    },
    current,
    expected: {
      projectId: sourceBinding.projectId,
      rootId: sourceBinding.rootId,
      documentId: sourceBinding.documentId,
      canonicalRevision: sourceBinding.canonicalRevision,
      workingRevision: sourceBinding.workingRevision,
      sourceDigest: sourceBinding.sourceSetDigest,
    },
    fence: p0c.createBlackBoxP0cSourceFenceTokenV1(sourceBinding),
  };
  const buildProvider = makeProvider(providerPin, recipient);
  const built = await p0c.buildBlackBoxStrictCapsuleV1({
    schemaVersion: p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_SCHEMAS.buildRequest,
    featureFlags: { [p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true },
    providerPin,
    sourceBinding,
    sourceFence,
    auditIdentity: identity,
    recipient,
    corePayload,
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
  }, { ageProvider: buildProvider });
  assert.equal(built.ok, true);
  function makeRequest(targetParent, requestOverrides = {}) {
    return {
      schemaVersion: writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.request,
      featureFlags: {
        [writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG]: true,
        [p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true,
        ...requestOverrides.featureFlags,
      },
      recoveryRequest: {
        schemaVersion: 'yalken.blackBoxImportAsNewRecoveryPlan.request.v1',
        featureFlags: {
          'yalken.blackBox.importAsNewRecoveryPlan.v1': true,
          [p0c.BLACK_BOX_STRICT_CAPSULE_RECOVER_V1_FEATURE_FLAG]: true,
        },
        providerPin,
        expectedSourceBinding: sourceBinding,
        capsule: built.capsule,
        identity,
        expectations: {
          importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
          liveProjectOverwrite: false,
          quarantineRequired: true,
          requireNoPlaintextInReceipt: true,
          requireProviderExact: true,
          requireP0cRecoverExecution: true,
        },
      },
      target: {
        schemaVersion: writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.target,
        parentDirectoryPath: targetParent,
        projectDirectoryName: 'RecoveredSyntheticProject',
        platform: process.platform,
      },
      expectations: {
        importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
        liveProjectOverwrite: false,
        requireCreateOnly: true,
        requireNoPlaintextInReceipt: true,
        requireP0cSink: true,
        requireReadback: true,
      },
      ...requestOverrides.extraRequestFields,
      ...(requestOverrides.requestOverrides || {}),
    };
  }
  return {
    built,
    corePayload,
    genome,
    identity,
    makeProvider: (providerOverrides = {}) => makeProvider(providerPin, recipient, providerOverrides),
    makeRequest,
    providerPin,
    recipient,
    sourceBinding,
  };
}

async function withTempDir(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-f3-import-writer-'));
  try {
    return await fn(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function assertDenied(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'DENY');
  assert.notEqual(result.decision, 'PASS');
  assert.ok(
    result.reasons.some((entry) => entry.code === code),
    `expected ${code} in ${JSON.stringify(result.reasons)}`,
  );
}

test('F3 import-as-new project writer v1 exports a closed default-off create-only seam', async () => {
  const writer = await loadWriter();
  assert.equal(writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG, 'yalken.blackBox.importAsNewProjectWriter.v1');
  assert.deepEqual(sortedKeys(writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS), [
    'featureFlag',
    'receipt',
    'request',
    'result',
    'target',
  ]);
  assert.deepEqual(sortedKeys(writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES), [
    'CORE_PAYLOAD_INVALID',
    'FEATURE_DISABLED',
    'FIELD_INVALID',
    'KEYSET_INVALID',
    'PATH_REJECTED',
    'PLAINTEXT_OR_KEY_LEAK',
    'PROJECT_WRITTEN',
    'READBACK_MISMATCH',
    'SINK_PAYLOAD_MISSING',
    'TARGET_EXISTS',
    'UPSTREAM_NOT_PASS',
    'WRITE_FAILED',
  ]);
  assert.deepEqual(writer.resolveBlackBoxImportAsNewProjectWriterFeatureFlag({}), {
    schemaVersion: writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.featureFlag,
    flag: writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG,
    enabled: false,
    canWriteNewProject: false,
    canOverwriteLiveProject: false,
    commandKernelWired: false,
    productUiWired: false,
    projectLibraryRegistrationWired: false,
  });
});

test('F3 import-as-new project writer v1 writes a new disposable project only from verified P0C sink bytes', async () => {
  const [writer, p0c] = await Promise.all([loadWriter(), loadP0c()]);
  await withTempDir(async (tempDir) => {
    const fixture = await makeFixture(writer, p0c);
    const provider = fixture.makeProvider();
    const result = await writer.writeBlackBoxImportAsNewProjectV1(
      fixture.makeRequest(tempDir),
      { ageProvider: provider },
    );

    assert.equal(provider.calls.decrypt, 1);
    assert.equal(result.ok, true);
    assert.equal(result.decision, 'PASS');
    assert.equal(result.code, writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PROJECT_WRITTEN);
    assert.equal(result.project.projectDirectoryName, 'RecoveredSyntheticProject');
    assert.equal(result.project.fileCount, 4);
    assert.equal(result.receipt.claims.p0cSinkDelivered, 'PASS');
    assert.equal(result.receipt.claims.createOnlyNewProject, 'PASS');
    assert.equal(result.receipt.claims.liveProjectOverwrite, 'DENIED');
    assert.equal(result.receipt.claims.productRuntimeWiring, 'NOT_CLAIMED');
    assert.equal(result.receipt.claims.commandKernelWiring, 'NOT_CLAIMED');
    assert.equal(result.receipt.claims.productUiWiring, 'NOT_CLAIMED');
    assert.equal(result.receipt.claims.projectLibraryRegistration, 'NOT_CLAIMED');
    assert.equal(result.receipt.corePayloadSha256, fixture.corePayload.sha256);
    assert.equal(result.receipt.sourceSetDigest, fixture.sourceBinding.sourceSetDigest);

    const projectRoot = path.join(tempDir, 'RecoveredSyntheticProject');
    assert.equal(await fs.readFile(path.join(projectRoot, 'project.craftsman.json'), 'utf8'), fixture.genome.items[0].sourceText);
    assert.equal(await fs.readFile(path.join(projectRoot, 'roman', 'Opening.txt'), 'utf8'), fixture.genome.items[1].sourceText);
    assert.equal(await fs.readFile(path.join(projectRoot, 'roman', 'Second.txt'), 'utf8'), fixture.genome.items[2].sourceText);
    await fs.access(path.join(projectRoot, '.yalken-black-box-import-receipt.json'));
    assert.doesNotMatch(JSON.stringify(result), /Opening line|Second line|A later scene|AGE-SECRET-KEY|bytesBase64|BLACK_BOX_CORE_GENOME_V1|sourceText/iu);
  });
});

test('F3 import-as-new project writer v1 rejects caller-carried proof, core payload or sink result before decrypt', async () => {
  const [writer, p0c] = await Promise.all([loadWriter(), loadP0c()]);
  await withTempDir(async (tempDir) => {
    const fixture = await makeFixture(writer, p0c);
    for (const extraRequestFields of [
      { corePayload: fixture.corePayload },
      { recoveredCorePayload: { ok: true, bytesBase64: fixture.corePayload.bytesBase64 } },
      { recoveryPlan: { ok: true, decision: 'PASS' } },
      { ephemeralSink: { delivered: true, corePayloadSha256: fixture.corePayload.sha256 } },
    ]) {
      const provider = fixture.makeProvider();
      const result = await writer.writeBlackBoxImportAsNewProjectV1(
        fixture.makeRequest(tempDir, { extraRequestFields }),
        { ageProvider: provider },
      );
      assertDenied(result, writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.KEYSET_INVALID);
      assert.equal(provider.calls.decrypt, 0);
    }
  });
});

test('F3 import-as-new project writer v1 fails closed on target collision and path traversal', async () => {
  const [writer, p0c] = await Promise.all([loadWriter(), loadP0c()]);
  await withTempDir(async (tempDir) => {
    const fixture = await makeFixture(writer, p0c);
    await fs.mkdir(path.join(tempDir, 'RecoveredSyntheticProject'));
    const targetExists = await writer.writeBlackBoxImportAsNewProjectV1(
      fixture.makeRequest(tempDir),
      { ageProvider: fixture.makeProvider() },
    );
    assertDenied(targetExists, writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.TARGET_EXISTS);

    const maliciousItem = {
      kind: 'SCENE_DOCUMENT',
      documentId: 'escape',
      bindingKey: 'file:../escape.txt',
      ordinal: 1,
      sourceText: 'escape',
      sourceTextDigest: sha256Buffer(Buffer.from('escape', 'utf8')),
      byteLength: Buffer.byteLength('escape', 'utf8'),
    };
    const badFixture = await makeFixture(writer, p0c, {
      genomeOverrides: { items: [makeCoreGenome(fixture.sourceBinding).items[0], maliciousItem] },
    });
    const badPath = await writer.writeBlackBoxImportAsNewProjectV1(
      badFixture.makeRequest(tempDir, {
        requestOverrides: {
          target: {
            schemaVersion: writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.target,
            parentDirectoryPath: tempDir,
            projectDirectoryName: 'AnotherRecoveredSyntheticProject',
            platform: process.platform,
          },
        },
      }),
      { ageProvider: badFixture.makeProvider() },
    );
    assertDenied(badPath, writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED);
    await assert.rejects(() => fs.access(path.join(tempDir, 'escape.txt')));
  });
});

test('F3 import-as-new project writer v1 never aggregates UNKNOWN or missing sink into PASS', async () => {
  const [writer, p0c] = await Promise.all([loadWriter(), loadP0c()]);
  await withTempDir(async (tempDir) => {
    const fixture = await makeFixture(writer, p0c);
    const unknown = await writer.writeBlackBoxImportAsNewProjectV1(fixture.makeRequest(tempDir), {
      ageProvider: fixture.makeProvider(),
      prepareRecoveryPlan: async () => ({
        ok: false,
        decision: 'UNKNOWN',
        code: 'SYNTHETIC_UNKNOWN',
        reasons: [],
      }),
    });
    assertDenied(unknown, writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.UPSTREAM_NOT_PASS);

    const missingSink = await writer.writeBlackBoxImportAsNewProjectV1(fixture.makeRequest(tempDir), {
      ageProvider: fixture.makeProvider(),
      prepareRecoveryPlan: async () => ({
        ok: true,
        decision: 'PASS',
        code: 'SYNTHETIC_PLAN_READY',
        recoveryPlan: {
          sourceBinding: fixture.sourceBinding,
          sourceBindingDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          corePayloadSha256: fixture.corePayload.sha256,
          providerPinDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          capsuleManifestDigest: fixture.built.capsule.manifest.manifestDigest,
          capsuleCiphertextSha256: fixture.built.capsule.ciphertext.sha256,
          quarantine: { status: 'QUARANTINED_PREVIEW_READY', writeLiveProject: false },
        },
        receipt: { claims: { importAsNewProjectOnly: 'PASS' } },
      }),
    });
    assertDenied(missingSink, writer.BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.SINK_PAYLOAD_MISSING);
  });
});

test('F3 import-as-new project writer v1 model kills all semantic mutants', async () => {
  const model = await loadModel();
  const report = model.runBlackBoxImportAsNewProjectWriterV1Model();
  assert.equal(report.ok, true);
  assert.equal(report.failures.length, 0);
  assert.equal(report.summary.mutationSurvivors, 0);
  assert.equal(report.summary.hostileCases >= 14, true);
});
