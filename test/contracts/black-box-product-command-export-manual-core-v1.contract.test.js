const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxProductCommandExportManualCoreV1.mjs');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'black-box-product-command-export-manual-core-v1-model.mjs');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const RUNTIME_BINDING_PATH = path.join(REPO_ROOT, 'src', 'main', 'blackBoxRuntimeProviderAuditBindingV1.cjs');
const RUNTIME_SOURCE_BINDING_PATH = path.join(REPO_ROOT, 'src', 'main', 'blackBoxRuntimeSourceRevisionBindingV1.cjs');
const RUNTIME_TARGET_BINDING_PATH = path.join(REPO_ROOT, 'src', 'main', 'blackBoxRuntimeCreateOnlyTargetBindingV1.cjs');
const COMMAND_ID = 'cmd.project.blackBox.exportManualCoreCapsuleKitV1';
const CAPABILITY_ID = 'cap.blackBox.manualCoreCapsule.export';

function moduleUrl(filePath) {
  return pathToFileURL(filePath).href;
}

async function loadProductModule() {
  return import(moduleUrl(MODULE_PATH));
}

async function loadModelModule() {
  return import(moduleUrl(MODEL_PATH));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function digest(char) {
  return `sha256:${char.repeat(64)}`;
}

function sha256Bytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')}`;
}

function makeRuntimeSourceProjectFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-runtime-source-revision-'));
  fs.mkdirSync(path.join(root, 'scenes'), { recursive: true });
  const manifest = {
    schemaVersion: 'yalken.syntheticProjectManifest.v1',
    projectId: 'project-runtime-source',
    rootId: 'root-runtime-source',
    sceneOrder: ['scene-001', 'scene-002'],
    scenes: {
      'scene-001': { title: 'Opening', bindingKey: 'file:scenes/scene-001.txt' },
      'scene-002': { title: 'Turn', bindingKey: 'file:scenes/scene-002.txt' },
    },
    notesOrder: ['project-notes'],
    notes: {
      'project-notes': { title: 'Notes', bindingKey: 'file:notes.craftsman.json' },
    },
    historyOrder: [],
  };
  fs.writeFileSync(path.join(root, 'project.craftsman.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(root, 'scenes', 'scene-001.txt'), 'Opening line.\nSecond line.', 'utf8');
  fs.writeFileSync(path.join(root, 'scenes', 'scene-002.txt'), 'A later scene.', 'utf8');
  fs.writeFileSync(path.join(root, 'notes.craftsman.json'), '{"notes":[{"body":"Keep the signal."}]}', 'utf8');
  return {
    root,
    manifest,
    projectTree: {
      projectId: manifest.projectId,
      roots: [{ rootId: manifest.rootId }],
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function makeRuntimeProviderFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-runtime-provider-binding-'));
  const downloads = path.join(root, 'downloads');
  const provenance = path.join(root, 'provenance');
  const binDir = path.join(root, 'bin-pinned-test');
  fs.mkdirSync(downloads, { recursive: true });
  fs.mkdirSync(provenance, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  const artifactBytes = Buffer.from('synthetic-official-age-artifact');
  const proofBytes = Buffer.from('synthetic-sigsum-proof');
  const sigsumKeyBytes = Buffer.from('synthetic-sigsum-key');
  const ageBytes = Buffer.from('#!/bin/sh\nprintf v1.3.1\\n');
  const ageInspectBytes = Buffer.from('#!/bin/sh\nprintf v1.3.1\\n');
  const agePath = path.join(binDir, 'age');
  const ageInspectPath = path.join(binDir, 'age-inspect');

  fs.writeFileSync(path.join(downloads, 'age-v1.3.1-darwin-arm64.tar.gz'), artifactBytes);
  fs.writeFileSync(path.join(downloads, 'age-v1.3.1-darwin-arm64.tar.gz.proof'), proofBytes);
  fs.writeFileSync(path.join(provenance, 'age-sigsum-key.pub'), sigsumKeyBytes);
  fs.writeFileSync(path.join(provenance, 'provider-bin-dir.txt'), `${binDir}\n`);
  fs.writeFileSync(agePath, ageBytes, { mode: 0o755 });
  fs.writeFileSync(ageInspectPath, ageInspectBytes, { mode: 0o755 });

  return {
    root,
    binDir,
    expectedProvider: {
      allowedRoot: root,
      artifactSha256: sha256Bytes(artifactBytes),
      proofSha256: sha256Bytes(proofBytes),
      sigsumKeyDigest: sha256Bytes(sigsumKeyBytes),
      ageSha256: sha256Bytes(ageBytes),
      ageInspectSha256: sha256Bytes(ageInspectBytes),
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function recipient(overrides = {}) {
  return {
    schemaVersion: 'yalken.blackBoxStrictCapsuleRecover.recipient.v1',
    type: 'AGE_X25519_RECIPIENT',
    publicKey: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsynthetic',
    fingerprint: digest('1'),
    ...overrides,
  };
}

function validPayload(overrides = {}) {
  return {
    schemaVersion: 'yalken.blackBoxProductCommandExportManualCore.request.v1',
    requestId: 'black-box-command-export-request-001',
    recipient: recipient(),
    ...overrides,
  };
}

function auditRecipient(overrides = {}) {
  return recipient({
    publicKey: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqaudit',
    fingerprint: digest('a'),
    ...overrides,
  });
}

function providerPin() {
  return {
    schemaVersion: 'yalken.blackBoxStrictCapsuleRecover.providerPin.v1',
    kind: 'OFFICIAL_AGE_CLI',
    providerId: 'filosottile-age-v1.3.1-darwin-arm64',
    version: 'v1.3.1',
    platform: 'darwin-arm64',
    releaseUrl: 'https://github.com/FiloSottile/age/releases/tag/v1.3.1',
    artifactUrl: 'https://github.com/FiloSottile/age/releases/download/v1.3.1/age-v1.3.1-darwin-arm64.tar.gz',
    artifactSha256: digest('2'),
    proofSha256: digest('3'),
    sigsum: {
      verified: true,
      policy: 'sigsum-generic-2025-1',
      keyDigest: digest('4'),
    },
    executables: {
      agePath: '/trusted/task-local/age',
      ageSha256: digest('5'),
      ageInspectPath: '/trusted/task-local/age-inspect',
      ageInspectSha256: digest('6'),
    },
  };
}

function expectedSourceIdentity(overrides = {}) {
  return {
    projectId: 'project-black-box-command',
    rootId: 'root-black-box-command',
    documentId: 'manuscript/core',
    canonicalRevision: 'canon-black-box-command-0001',
    workingRevision: 'work-black-box-command-0001',
    generation: 'gen-black-box-command-0001',
    ...overrides,
  };
}

function trustedSourceSnapshot(overrides = {}) {
  const expected = expectedSourceIdentity();
  return {
    ok: true,
    decision: 'ALLOW',
    code: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_READY',
    sourceSetDigest: digest('7'),
    accounting: { totalItems: 3, includedItems: 3, omittedItems: 0 },
    sourceSnapshot: {
      schemaVersion: 'yalken.blackBoxCoreSourceAdapter.sourceSnapshot.v1',
      authority: {
        decision: 'ALLOW',
        mayWrite: false,
        queryId: 'query.blackBoxProductCommandExportManualCore.readSourceSnapshot.v1',
      },
      expected: {
        ...expected,
        sourceDigest: digest('8'),
      },
      current: {
        ...expected,
        sourceDigest: digest('8'),
        dirtyState: 'CLEAN',
      },
      core: {
        schemaVersion: 'yalken.blackBoxCoreSourceAdapter.coreSnapshot.v1',
        manifest: { sourceTextDigest: digest('9'), byteLength: 11, sourceText: '{}' },
        scenes: [],
        notes: [],
        history: [],
      },
    },
    ...overrides,
  };
}

function manualKitPass(overrides = {}) {
  return {
    schemaVersion: 'yalken.blackBoxManualCoreCapsuleKit.result.v1',
    ok: true,
    decision: 'PASS',
    code: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_CREATED',
    recoveryKit: {
      schemaVersion: 'yalken.blackBoxManualCoreCapsuleKit.recoveryKit.v1',
      sourceSetDigest: digest('7'),
      providerPinDigest: digest('a'),
      recipientFingerprint: digest('1'),
      auditRecipientFingerprint: digest('a'),
      corePayloadSha256: digest('b'),
      capsuleManifestDigest: digest('c'),
      capsuleCiphertextSha256: digest('d'),
      publishedArtifactSha256: digest('e'),
      publishedTarget: {
        schemaVersion: 'yalken.blackBoxDarwinDurablePublisher.target.v1',
        platform: 'darwin',
        directoryPath: '/private/synthetic-output',
        fileName: 'manual-core.yalken-capsule',
      },
      importMode: 'IMPORT_AS_NEW_PROJECT_ONLY',
      liveProjectOverwrite: false,
      quarantineRequired: true,
      ownerKeyOutsideBuilder: true,
    },
    receipt: {
      schemaVersion: 'yalken.blackBoxManualCoreCapsuleKit.receipt.v1',
      code: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_CREATED',
      sourceSetDigest: digest('7'),
      providerPinDigest: digest('a'),
      recipientFingerprint: digest('1'),
      auditRecipientFingerprint: digest('a'),
      publishedArtifactSha256: digest('e'),
      claims: {
        wholeCoreSourceAccounted: 'PASS',
        createOnlyDurablePublication: 'PASS',
        importAsNewProjectOnly: 'PASS',
        liveProjectOverwrite: 'DENIED',
        noPlaintextOrKeyMaterialInReceipt: 'PASS',
      },
    },
    ...overrides,
  };
}

function makePorts(overrides = {}) {
  const calls = {
    featureFlags: 0,
    expectedSource: 0,
    trustedSnapshot: [],
    providerPin: 0,
    auditIdentity: 0,
    auditRecipient: 0,
    target: [],
    manualKit: [],
  };
  return {
    calls,
    ports: {
      getFeatureFlags: async () => {
        calls.featureFlags += 1;
        return {
          'yalken.blackBox.coreSourceAdapter.p0aV1': true,
          'yalken.blackBox.darwinDurablePublisher.p0bV1': true,
          'yalken.blackBox.strictCapsuleRecover.p0cV1': true,
          'yalken.blackBox.manualCoreCapsuleKit.v1': true,
        };
      },
      getExpectedSourceIdentity: async () => {
        calls.expectedSource += 1;
        return expectedSourceIdentity();
      },
      getProjectRoot: async () => '/synthetic/project/root',
      buildTrustedSourceSnapshot: async (request, options) => {
        calls.trustedSnapshot.push({ request: cloneJson(request), optionsKeys: Object.keys(options || {}).sort() });
        return trustedSourceSnapshot();
      },
      observeRevision: async () => trustedSourceSnapshot().sourceSnapshot.current,
      getProviderPin: async () => {
        calls.providerPin += 1;
        return providerPin();
      },
      getAuditRecipient: async () => {
        calls.auditRecipient += 1;
        return auditRecipient();
      },
      getAuditIdentity: async () => {
        calls.auditIdentity += 1;
        return {
          schemaVersion: 'yalken.blackBoxStrictCapsuleRecover.identity.v1',
          type: 'AGE_X25519_IDENTITY',
          secretKeyBase64: Buffer.from('synthetic-audit-identity').toString('base64'),
          fingerprint: digest('a'),
        };
      },
      getAgeProvider: async () => ({ synthetic: true }),
      selectCreateOnlyTarget: async (context) => {
        calls.target.push(cloneJson(context));
        return {
          schemaVersion: 'yalken.blackBoxDarwinDurablePublisher.target.v1',
          platform: 'darwin',
          directoryPath: '/private/synthetic-output',
          fileName: 'manual-core.yalken-capsule',
        };
      },
      buildManualCoreCapsuleKit: async (request, options) => {
        calls.manualKit.push({ request: cloneJson(request), optionsKeys: Object.keys(options || {}).sort() });
        return manualKitPass();
      },
      ...overrides,
    },
  };
}

function assertPublicResultSanitized(result) {
  const text = JSON.stringify(result);
  for (const forbidden of [
    'secretKeyBase64',
    'AGE-SECRET-KEY',
    'bytesBase64',
    'sourceText',
    'BLACK_BOX_CORE_GENOME_V1',
    '/private/synthetic-output',
    'directoryPath',
    'projectRoot',
  ]) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
}

test('F3 Black Box product command v1 exports a closed command contract and manifest', async () => {
  const productCommand = await loadProductModule();
  const manifest = productCommand.BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_INTEGRATION_MANIFEST;

  assert.equal(productCommand.BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_COMMAND_ID, COMMAND_ID);
  assert.equal(productCommand.BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CAPABILITY_ID, CAPABILITY_ID);
  assert.deepEqual(Object.keys(productCommand.BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_SCHEMAS).sort(), [
    'featureFlag',
    'integrationManifest',
    'request',
    'result',
  ]);
  assert.equal(
    manifest.featureId,
    'yalken.blackBox.productCommand.exportManualCoreCapsule',
  );
  assert.deepEqual(manifest.commandIds, [COMMAND_ID]);
  assert.equal(manifest.manifestStandard, 'FEATURE_INTEGRATION_MANIFEST_V1');
  assert.equal(manifest.currentReality.runtimeWired, true);
  assert.equal(manifest.currentReality.fullBlackBoxProductV1, false);
  assert.equal(manifest.currentReality.googleDocsEvidenceInherited, false);
  assert.deepEqual(manifest.stateClasses, [
    'PROJECT_STATE',
    'AUTHORING_WORKING_STATE',
    'DERIVED_STATE',
    'SHELL_STATE',
    'TRANSIENT_STATE',
  ]);
  assert.equal(manifest.stateClassPolicy.PROJECT_STATE.owner, 'Product Core');
  assert.equal(manifest.stateClassPolicy.PROJECT_STATE.mutation, 'NONE_READ_ONLY_SOURCE_PLUS_EXTERNAL_CREATE_ONLY_ARTIFACT');
  assert.equal(manifest.stateClassPolicy.AUTHORING_WORKING_STATE.noLossDuty, 'PROTECTED_NOT_CLASSIFIED_AS_TRANSIENT');
  assert.equal(manifest.stateClassPolicy.AUTHORING_WORKING_STATE.mutation, 'DENIED');
  assert.equal(manifest.stateClassPolicy.DERIVED_STATE.rebuildable, true);
  assert.equal(manifest.stateClassPolicy.SHELL_STATE.projectTruthAuthority, false);
  assert.equal(manifest.stateClassPolicy.TRANSIENT_STATE.persistedAsTruth, false);
  assert.equal(manifest.revisionPolicy.sourceSnapshot, 'TRUSTED_PRODUCT_CORE_QUERY_RECOMPUTES_PROJECT_ROOT_DOCUMENT_CANONICAL_WORKING_GENERATION_AND_DIGEST');
  assert.equal(manifest.revisionPolicy.dirtyPolicy, 'CLEAN_ONLY_DIRTY_OR_AUTOSAVE_DENY');
  assert.equal(manifest.writePath.canonicalProjectMutation, 'NONE');
  assert.equal(manifest.writePath.externalEffect, 'CREATE_ONLY_CAPSULE_ARTIFACT_THROUGH_TRUSTED_TARGET_PORT');
  assert.equal(manifest.persistenceClass, 'NO_PROJECT_DATA_MIGRATION_EXTERNAL_CREATE_ONLY_ARTIFACT');
  assert.equal(manifest.migrations.required, false);
  assert.equal(manifest.rollback.mode, 'REVERT_ONLY_NO_CANONICAL_PROJECT_DATA_ROLLBACK');
  assert.deepEqual(manifest.platformAvailability.node.capability, 'AVAILABLE_WHEN_FLAG_PROVIDER_AUDIT_SOURCE_AND_TARGET_PORTS_PASS');
  assert.deepEqual(manifest.platformAvailability.web.capability, 'DENIED_NO_PLATFORM_ADAPTER');
  assert.deepEqual(manifest.platformAvailability.googleDocs.capability, 'NOT_INHERITED_SEPARATE_PROFILE');
  assert.equal(manifest.surfaceManifests.length, 3);
  assert.deepEqual(manifest.surfaceManifests.map((surface) => surface.surfaceId).sort(), [
    'surface.commandPalette.blackBoxManualCoreCapsule.v1',
    'surface.exportModal.blackBoxManualCoreCapsule.v1',
    'surface.menu.fileExport.blackBoxManualCoreCapsule.v1',
  ]);
  assert.equal(manifest.surfaceManifests.every((surface) => surface.commandRepresentations.includes(COMMAND_ID)), true);
  assert.equal(manifest.negativeBypassChecks.includes('TARGET_ARCHITECTURE_MUST_NOT_BE_REPORTED_AS_CURRENT_READY'), true);
  assert.equal(manifest.negativeBypassChecks.includes('GOOGLE_DOCS_OR_WORD_EVIDENCE_MUST_NOT_TRANSFER_TO_BLACK_BOX_PRODUCT_V1'), true);
});

test('F3 Black Box product command v1 is admitted through the existing command registry and capability docs', async () => {
  await loadProductModule();
  const productRegistry = require(path.join(REPO_ROOT, 'src', 'shared', 'productCommandRegistry.cjs'));
  const commandSurface = require(path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js'));
  const catalog = await import(moduleUrl(path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'command-catalog.v1.mjs')));
  const capabilityPolicy = await import(moduleUrl(path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'capabilityPolicy.mjs')));

  const record = productRegistry.getProductCommandRecord(COMMAND_ID);
  assert.equal(record.id, COMMAND_ID);
  assert.equal(record.domain, 'blackBox');
  assert.equal(record.capabilityId, CAPABILITY_ID);
  assert.equal(record.commandAuthority, 'CommandKernel');
  assert.equal(record.runtimeBacked, true);
  assert.equal(productRegistry.PRODUCT_COMMAND_DOMAIN_STATUS.blackBox.status, 'runtime-backed-create-only-capsule');
  assert.deepEqual(productRegistry.PRODUCT_COMMAND_DOMAIN_STATUS.blackBox.commandIds, [COMMAND_ID]);
  assert.equal(catalog.getCommandCatalogById(COMMAND_ID).id, COMMAND_ID);
  assert.equal(capabilityPolicy.CAPABILITY_BINDING[COMMAND_ID], CAPABILITY_ID);
  assert.equal(capabilityPolicy.CAPABILITY_MATRIX.node[CAPABILITY_ID], true);
  assert.equal(capabilityPolicy.CAPABILITY_MATRIX.web[CAPABILITY_ID], false);
  assert.equal(commandSurface.ALLOWED_COMMAND_IDS.includes(COMMAND_ID), true);
});

test('F3 Black Box product command v1 main runtime bridge keeps complete trusted port inventory while default-off', () => {
  const mainSource = require('node:fs').readFileSync(MAIN_PATH, 'utf8');
  const start = mainSource.indexOf('async function dispatchBlackBoxProductCommandBridge');
  const end = mainSource.indexOf('async function dispatchProductCommandBridge', start + 1);
  assert.ok(start > 0 && end > start, 'black box main runtime bridge must be source-isolated');
  const bridgeSource = mainSource.slice(start, end);

  assert.match(bridgeSource, /YALKEN_ENABLE_BLACK_BOX_MANUAL_CORE_CAPSULE_COMMAND_V1\s*===\s*'1'/u);
  for (const portName of [
    'getFeatureFlags',
    'getExpectedSourceIdentity',
    'getProjectRoot',
    'observeRevision',
    'getProviderPin',
    'getAuditRecipient',
    'getAuditIdentity',
    'getAgeProvider',
    'selectCreateOnlyTarget',
  ]) {
    assert.match(bridgeSource, new RegExp(`\\b${portName}\\s*:`, 'u'), `missing trusted runtime port ${portName}`);
  }
  assert.match(mainSource, /blackBoxRuntimeProviderAuditBindingV1\.cjs/u);
  assert.match(mainSource, /blackBoxRuntimeSourceRevisionBindingV1\.cjs/u);
  assert.match(mainSource, /blackBoxRuntimeCreateOnlyTargetBindingV1\.cjs/u);
  assert.match(bridgeSource, /getRuntimeProviderAuditBinding/u);
  assert.match(bridgeSource, /getRuntimeSourceRevisionBinding/u);
  assert.match(bridgeSource, /getRuntimeCreateOnlyTargetBinding/u);
  assert.match(bridgeSource, /getProviderPin:\s*async\s*\(\)\s*=>\s*\(await\s+getRuntimeProviderAuditBinding\(\)\)\.providerPin/u);
  assert.match(bridgeSource, /getAuditRecipient:\s*async\s*\(\)\s*=>\s*\(await\s+getRuntimeProviderAuditBinding\(\)\)\.auditRecipient/u);
  assert.match(bridgeSource, /getAuditIdentity:\s*async\s*\(\)\s*=>\s*\(await\s+getRuntimeProviderAuditBinding\(\)\)\.auditIdentity/u);
  assert.match(bridgeSource, /getAgeProvider:\s*async\s*\(\)\s*=>\s*\(await\s+getRuntimeProviderAuditBinding\(\)\)\.ageProvider/u);
  assert.match(bridgeSource, /selectCreateOnlyTarget:\s*async\s*\(context\)\s*=>\s*\(await\s+getRuntimeCreateOnlyTargetBinding\(\)\)\.selectCreateOnlyTarget\(context\)/u);
  assert.doesNotMatch(bridgeSource, /black-box-product-command-runtime-provider-not-configured/u);
  assert.doesNotMatch(bridgeSource, /dirtyState:\s*'UNKNOWN'/u);
  assert.doesNotMatch(bridgeSource, /getProviderPin:\s*async\s*\(\)\s*=>\s*null/u);
  assert.doesNotMatch(bridgeSource, /getAuditRecipient:\s*async\s*\(\)\s*=>\s*null/u);
  assert.doesNotMatch(bridgeSource, /getAuditIdentity:\s*async\s*\(\)\s*=>\s*null/u);
  assert.doesNotMatch(bridgeSource, /getAgeProvider:\s*async\s*\(\)\s*=>\s*null/u);
  assert.doesNotMatch(bridgeSource, /BLACK_BOX_PRODUCT_COMMAND_TARGET_PORT_NOT_CONFIGURED/u);
  assert.doesNotMatch(bridgeSource, /secretKeyBase64\s*:/u);
  assert.doesNotMatch(bridgeSource, /dialog\.showSaveDialog/u);
  assert.doesNotMatch(bridgeSource, /writeFileAtomic/u);
});

test('F3 Black Box runtime source revision binding v1 computes exact clean source observations and rejects drift', () => {
  const sourceBinding = require(RUNTIME_SOURCE_BINDING_PATH);
  const fixture = makeRuntimeSourceProjectFixture();
  try {
    const clean = sourceBinding.createBlackBoxRuntimeSourceRevisionBindingV1({
      projectRoot: fixture.root,
      projectTree: fixture.projectTree,
      isDirty: false,
      autoSaveInProgress: false,
    });
    assert.equal(clean.ok, true);
    assert.equal(clean.expected.projectId, fixture.manifest.projectId);
    assert.equal(clean.expected.rootId, fixture.manifest.rootId);
    assert.equal(clean.expected.documentId, 'black-box-core');
    assert.match(clean.expected.canonicalRevision, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(clean.expected.canonicalRevision, clean.expected.workingRevision);
    assert.equal(clean.expected.canonicalRevision, clean.expected.generation);

    const before = clean.observeRevision({ phase: 'before', expected: clean.expected });
    assert.equal(before.authority.decision, 'ALLOW');
    assert.equal(before.authority.mayWrite, false);
    assert.equal(before.dirtyState, 'CLEAN');
    assert.equal(before.canonicalRevision, clean.expected.canonicalRevision);

    fs.writeFileSync(path.join(fixture.root, 'scenes', 'scene-002.txt'), 'A changed later scene.', 'utf8');
    const after = clean.observeRevision({ phase: 'after', expected: clean.expected });
    assert.equal(after.dirtyState, 'CLEAN');
    assert.notEqual(after.canonicalRevision, clean.expected.canonicalRevision);
  } finally {
    fixture.cleanup();
  }
});

test('F3 Black Box runtime source revision binding v1 denies dirty, missing manifest and path traversal source', () => {
  const sourceBinding = require(RUNTIME_SOURCE_BINDING_PATH);
  const dirtyFixture = makeRuntimeSourceProjectFixture();
  try {
    const dirty = sourceBinding.createBlackBoxRuntimeSourceRevisionBindingV1({
      projectRoot: dirtyFixture.root,
      projectTree: dirtyFixture.projectTree,
      isDirty: true,
      autoSaveInProgress: false,
    });
    assert.equal(dirty.ok, false);
    assert.equal(dirty.observeRevision({ phase: 'before', expected: dirty.expected }).dirtyState, 'DIRTY');
  } finally {
    dirtyFixture.cleanup();
  }

  const missingManifest = makeRuntimeSourceProjectFixture();
  try {
    fs.rmSync(path.join(missingManifest.root, 'project.craftsman.json'));
    const missing = sourceBinding.createBlackBoxRuntimeSourceRevisionBindingV1({
      projectRoot: missingManifest.root,
      projectTree: missingManifest.projectTree,
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.observeRevision({ phase: 'before', expected: missing.expected }).authority.decision, 'UNKNOWN');
    assert.equal(missing.observeRevision({ phase: 'before', expected: missing.expected }).dirtyState, 'UNKNOWN');
  } finally {
    missingManifest.cleanup();
  }

  const traversal = makeRuntimeSourceProjectFixture();
  try {
    const manifest = {
      ...traversal.manifest,
      scenes: {
        ...traversal.manifest.scenes,
        'scene-001': { title: 'Traversal', bindingKey: 'file:../outside.txt' },
      },
    };
    fs.writeFileSync(path.join(traversal.root, 'project.craftsman.json'), JSON.stringify(manifest, null, 2), 'utf8');
    const unsafe = sourceBinding.createBlackBoxRuntimeSourceRevisionBindingV1({
      projectRoot: traversal.root,
      projectTree: traversal.projectTree,
    });
    assert.equal(unsafe.ok, false);
    assert.equal(unsafe.observeRevision({ phase: 'before', expected: unsafe.expected }).authority.decision, 'UNKNOWN');
  } finally {
    traversal.cleanup();
  }
});

test('F3 Black Box runtime create-only target binding v1 enforces explicit safe target policy', () => {
  assert.ok(fs.existsSync(RUNTIME_TARGET_BINDING_PATH), 'runtime create-only target binding helper must exist');
  const targetBinding = require(RUNTIME_TARGET_BINDING_PATH);
  assert.equal(typeof targetBinding.createBlackBoxRuntimeCreateOnlyTargetBindingV1, 'function');

  const envKeys = targetBinding.BLACK_BOX_RUNTIME_CREATE_ONLY_TARGET_BINDING_V1_ENV;
  assert.deepEqual(Object.keys(envKeys).sort(), ['allowedRoot', 'targetDir']);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-runtime-target-binding-'));
  const allowedRoot = path.join(fixtureRoot, 'allowed');
  const targetDir = path.join(allowedRoot, 'exports');
  const projectRoot = path.join(fixtureRoot, 'project');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });

  const makeBinding = (envOverrides = {}, options = {}) => targetBinding.createBlackBoxRuntimeCreateOnlyTargetBindingV1({
    env: {
      [envKeys.allowedRoot]: allowedRoot,
      [envKeys.targetDir]: targetDir,
      ...envOverrides,
    },
    projectRoot,
    platform: 'darwin',
    ...options,
  });
  const context = (requestId) => ({
    commandId: COMMAND_ID,
    requestId,
    defaultFileName: 'manual-core.yalken-capsule',
    sourceSetDigest: digest('7'),
    recipientFingerprint: digest('1'),
  });

  try {
    const valid = makeBinding().selectCreateOnlyTarget(context('runtime-target-request-001'));
    assert.equal(valid.schemaVersion, 'yalken.blackBoxDarwinDurablePublisher.target.v1');
    assert.equal(valid.platform, 'darwin');
    assert.equal(valid.directoryPath, fs.realpathSync(targetDir));
    assert.match(valid.fileName, /^manual-core-runtime-target-request-001-[a-f0-9]{12}\.yalken-capsule$/u);
    assert.equal(valid.fileName.includes('/'), false);
    assert.equal(valid.fileName.includes('\\'), false);

    const missing = makeBinding({ [envKeys.targetDir]: '' }).selectCreateOnlyTarget(context('missing-target'));
    assert.equal(missing.ok, false);
    assert.equal(missing.code, 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_TARGET_PORT_NOT_CONFIGURED');

    const outside = makeBinding({ [envKeys.targetDir]: os.tmpdir() }).selectCreateOnlyTarget(context('outside-root'));
    assert.equal(outside.ok, false);
    assert.equal(outside.code, 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_TARGET_REJECTED');

    const projectChild = path.join(projectRoot, 'exports');
    fs.mkdirSync(projectChild, { recursive: true });
    const insideProject = makeBinding({
      [envKeys.allowedRoot]: projectRoot,
      [envKeys.targetDir]: projectChild,
    }).selectCreateOnlyTarget(context('inside-project'));
    assert.equal(insideProject.ok, false);
    assert.equal(insideProject.code, 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_TARGET_REJECTED');

    const symlinkDir = path.join(allowedRoot, 'linked-exports');
    try {
      fs.symlinkSync(targetDir, symlinkDir, 'dir');
      const symlink = makeBinding({ [envKeys.targetDir]: symlinkDir }).selectCreateOnlyTarget(context('symlink-target'));
      assert.equal(symlink.ok, false);
      assert.equal(symlink.code, 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_TARGET_REJECTED');
    } catch (error) {
      if (error?.code !== 'EPERM' && error?.code !== 'EEXIST') throw error;
    }

    const collision = makeBinding().selectCreateOnlyTarget(context('runtime-target-request-001'));
    fs.writeFileSync(path.join(targetDir, collision.fileName), 'existing');
    const existing = makeBinding().selectCreateOnlyTarget(context('runtime-target-request-001'));
    assert.equal(existing.ok, false);
    assert.equal(existing.code, 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_TARGET_REJECTED');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('F3 Black Box runtime provider/audit binding v1 builds exact trusted ports from explicit synthetic config', async () => {
  const runtimeBinding = require(RUNTIME_BINDING_PATH);
  const fixture = makeRuntimeProviderFixture();
  const ageProvider = { syntheticAgeProvider: true };
  const providerCalls = [];
  try {
    const result = await runtimeBinding.createBlackBoxRuntimeProviderAuditBindingV1({
      env: {
        YALKEN_BLACK_BOX_MANUAL_CORE_PROVIDER_ROOT_V1: fixture.root,
        YALKEN_BLACK_BOX_MANUAL_CORE_AUDIT_RECIPIENT_JSON_V1: JSON.stringify(auditRecipient()),
        YALKEN_BLACK_BOX_MANUAL_CORE_AUDIT_IDENTITY_JSON_V1: JSON.stringify({
          schemaVersion: 'yalken.blackBoxStrictCapsuleRecover.identity.v1',
          type: 'AGE_X25519_IDENTITY',
          secretKeyBase64: Buffer.from('synthetic-audit-identity').toString('base64'),
          fingerprint: digest('a'),
        }),
      },
      expectedProvider: fixture.expectedProvider,
      strictCapsuleRecoverModule: {
        createBlackBoxP0cAgeCliProviderV1(providerPin, options) {
          providerCalls.push({ providerPin, options });
          return ageProvider;
        },
      },
      tempRoot: fixture.root,
    });

    assert.equal(result.providerPin.schemaVersion, 'yalken.blackBoxStrictCapsuleRecover.providerPin.v1');
    assert.equal(result.providerPin.kind, 'OFFICIAL_AGE_CLI');
    assert.equal(result.providerPin.version, 'v1.3.1');
    assert.equal(result.providerPin.platform, 'darwin-arm64');
    assert.equal(result.providerPin.artifactSha256, fixture.expectedProvider.artifactSha256);
    assert.equal(result.providerPin.proofSha256, fixture.expectedProvider.proofSha256);
    assert.equal(result.providerPin.sigsum.verified, true);
    assert.equal(result.providerPin.sigsum.keyDigest, fixture.expectedProvider.sigsumKeyDigest);
    assert.equal(result.providerPin.executables.agePath, path.join(fixture.binDir, 'age'));
    assert.equal(result.providerPin.executables.ageSha256, fixture.expectedProvider.ageSha256);
    assert.equal(result.providerPin.executables.ageInspectPath, path.join(fixture.binDir, 'age-inspect'));
    assert.equal(result.providerPin.executables.ageInspectSha256, fixture.expectedProvider.ageInspectSha256);
    assert.equal(result.auditRecipient.fingerprint, digest('a'));
    assert.equal(result.auditIdentity.fingerprint, result.auditRecipient.fingerprint);
    assert.equal(result.ageProvider, ageProvider);
    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0].options.tempRoot, fixture.root);
    assert.equal(JSON.stringify(result.providerPin).includes('secretKeyBase64'), false);
  } finally {
    fixture.cleanup();
  }
});

test('F3 Black Box runtime provider/audit binding v1 fails closed on missing, mismatched or forged config', async () => {
  const runtimeBinding = require(RUNTIME_BINDING_PATH);
  assert.equal(runtimeBinding.buildBlackBoxRuntimeProviderPinV1({ env: {} }), null);
  assert.equal(runtimeBinding.buildBlackBoxRuntimeAuditBindingV1({ env: {} }), null);

  const fixture = makeRuntimeProviderFixture();
  try {
    const env = {
      YALKEN_BLACK_BOX_MANUAL_CORE_PROVIDER_ROOT_V1: fixture.root,
      YALKEN_BLACK_BOX_MANUAL_CORE_AUDIT_RECIPIENT_JSON_V1: JSON.stringify(auditRecipient()),
      YALKEN_BLACK_BOX_MANUAL_CORE_AUDIT_IDENTITY_JSON_V1: JSON.stringify({
        schemaVersion: 'yalken.blackBoxStrictCapsuleRecover.identity.v1',
        type: 'AGE_X25519_IDENTITY',
        secretKeyBase64: Buffer.from('synthetic-audit-identity').toString('base64'),
        fingerprint: digest('b'),
      }),
    };
    assert.equal(runtimeBinding.buildBlackBoxRuntimeProviderPinV1({
      env,
      expectedProvider: {
        ...fixture.expectedProvider,
        artifactSha256: digest('f'),
      },
    }), null);
    assert.equal(runtimeBinding.buildBlackBoxRuntimeAuditBindingV1({ env }), null);
    assert.deepEqual(await runtimeBinding.createBlackBoxRuntimeProviderAuditBindingV1({
      env,
      expectedProvider: fixture.expectedProvider,
      strictCapsuleRecoverModule: {
        createBlackBoxP0cAgeCliProviderV1() {
          throw new Error('must not create provider for forged audit config');
        },
      },
    }), {
      providerPin: null,
      auditRecipient: null,
      auditIdentity: null,
      ageProvider: null,
    });
  } finally {
    fixture.cleanup();
  }
});

test('F3 Black Box product command v1 executes via trusted ports and returns only sanitized capsule metadata', async () => {
  const productCommand = await loadProductModule();
  const { calls, ports } = makePorts();

  const result = await productCommand.executeBlackBoxProductCommandExportManualCoreV1(validPayload(), { ports });

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'PASS');
  assert.equal(result.commandId, COMMAND_ID);
  assert.equal(result.claims.commandKernelWiring, 'PASS');
  assert.equal(result.claims.productRuntimeWiring, 'PASS');
  assert.equal(result.claims.productUiWiring, 'NOT_CLAIMED');
  assert.equal(result.claims.liveProjectOverwrite, 'DENIED');
  assert.equal(result.claims.disasterReady, 'NOT_CLAIMED');
  assert.equal(result.artifact.fileName, 'manual-core.yalken-capsule');
  assert.equal(result.artifact.sha256, digest('e'));
  assert.equal(result.recovery.importMode, 'IMPORT_AS_NEW_PROJECT_ONLY');
  assert.equal(result.recovery.ownerKeyOutsideBuilder, true);
  assertPublicResultSanitized(result);

  assert.equal(calls.featureFlags, 1);
  assert.equal(calls.expectedSource, 1);
  assert.equal(calls.providerPin, 1);
  assert.equal(calls.auditRecipient, 1);
  assert.equal(calls.auditIdentity, 1);
  assert.equal(calls.target.length, 1);
  assert.equal(calls.manualKit.length, 1);
  assert.equal(calls.trustedSnapshot.length, 1);
  assert.equal(calls.trustedSnapshot[0].request.expected.projectId, 'project-black-box-command');
  assert.equal(calls.trustedSnapshot[0].request.featureFlags['yalken.blackBox.coreSourceAdapter.p0aV1'], true);
  assert.equal(calls.manualKit[0].request.providerPin.providerId, 'filosottile-age-v1.3.1-darwin-arm64');
  assert.equal(calls.manualKit[0].request.recipient.fingerprint, digest('1'));
  assert.equal(calls.manualKit[0].request.auditRecipient.fingerprint, digest('a'));
  assert.equal(calls.manualKit[0].request.auditIdentity.fingerprint, digest('a'));
  assert.notEqual(calls.manualKit[0].request.auditRecipient.fingerprint, calls.manualKit[0].request.recipient.fingerprint);
  assert.equal(calls.manualKit[0].request.target.fileName, 'manual-core.yalken-capsule');
});

test('F3 Black Box product command v1 rejects caller-carried proof, provider, target and feature flags', async () => {
  const productCommand = await loadProductModule();
  const forged = {
    sourceSnapshot: trustedSourceSnapshot().sourceSnapshot,
    providerPin: providerPin(),
    target: { directoryPath: '/tmp/forged', fileName: 'forged.yalken-capsule' },
    featureFlags: { 'yalken.blackBox.manualCoreCapsuleKit.v1': true },
    auditIdentity: { secretKeyBase64: 'forged' },
    auditRecipient: auditRecipient(),
  };

  for (const [field, value] of Object.entries(forged)) {
    const { ports, calls } = makePorts();
    const result = await productCommand.executeBlackBoxProductCommandExportManualCoreV1(
      validPayload({ [field]: value }),
      { ports },
    );
    assert.equal(result.ok, false, field);
    assert.equal(result.decision, 'DENY', field);
    assert.equal(result.code, 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_KEYSET_INVALID', field);
    assert.equal(calls.target.length, 0, field);
    assert.equal(calls.manualKit.length, 0, field);
    assertPublicResultSanitized(result);
  }
});

test('F3 Black Box product command v1 fails closed before target selection on source/provider/capability failures', async () => {
  const productCommand = await loadProductModule();
  const cases = [
    {
      name: 'feature-disabled',
      overrides: {
        getFeatureFlags: async () => ({ 'yalken.blackBox.manualCoreCapsuleKit.v1': false }),
      },
      code: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_FEATURE_DISABLED',
    },
    {
      name: 'trusted-source-deny',
      overrides: {
        buildTrustedSourceSnapshot: async () => ({
          ok: false,
          decision: 'DENY',
          code: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_REVISION_STALE',
          reasons: [{ code: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_REVISION_STALE', field: 'after.generation' }],
        }),
      },
      code: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_SOURCE_REJECTED',
    },
    {
      name: 'provider-missing',
      overrides: {
        getProviderPin: async () => null,
      },
      code: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_PROVIDER_PIN_REQUIRED',
    },
    {
      name: 'audit-recipient-port-missing',
      overrides: {
        getAuditRecipient: undefined,
      },
      code: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_AUDIT_RECIPIENT_REQUIRED',
    },
    {
      name: 'audit-recipient-equals-owner',
      overrides: {
        getAuditRecipient: async () => recipient(),
      },
      code: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_AUDIT_RECIPIENT_REQUIRED',
    },
    {
      name: 'audit-identity-mismatch',
      overrides: {
        getAuditIdentity: async () => ({
          schemaVersion: 'yalken.blackBoxStrictCapsuleRecover.identity.v1',
          type: 'AGE_X25519_IDENTITY',
          secretKeyBase64: Buffer.from('synthetic-wrong-audit-identity').toString('base64'),
          fingerprint: digest('b'),
        }),
      },
      code: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_AUDIT_IDENTITY_REQUIRED',
    },
    {
      name: 'target-collision',
      overrides: {
        selectCreateOnlyTarget: async () => ({
          ok: false,
          code: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_TARGET_EXISTS',
          reason: 'TARGET_EXISTS',
        }),
      },
      code: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_TARGET_REJECTED',
    },
    {
      name: 'manual-kit-deny',
      overrides: {
        buildManualCoreCapsuleKit: async () => ({
          ok: false,
          decision: 'DENY',
          code: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_UNKNOWN_OR_ABSTAIN',
          reasons: [{ code: 'YALKEN_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_UNKNOWN_OR_ABSTAIN', field: 'sourceSnapshot.authority.decision' }],
        }),
      },
      code: 'YALKEN_BLACK_BOX_PRODUCT_COMMAND_EXPORT_KIT_REJECTED',
    },
  ];

  for (const item of cases) {
    const { ports, calls } = makePorts(item.overrides);
    const result = await productCommand.executeBlackBoxProductCommandExportManualCoreV1(validPayload(), { ports });
    assert.equal(result.ok, false, item.name);
    assert.equal(result.decision, 'DENY', item.name);
    assert.equal(result.code, item.code, item.name);
    if (!['target-collision', 'manual-kit-deny'].includes(item.name)) {
      assert.equal(calls.target.length, 0, item.name);
    }
    if (item.name !== 'manual-kit-deny') {
      assert.equal(calls.manualKit.length, 0, item.name);
    }
    assertPublicResultSanitized(result);
  }
});

test('F3 Black Box product command v1 model/oracle rejects UNKNOWN and all semantic mutants', async () => {
  const model = await loadModelModule();
  const result = model.evaluateBlackBoxProductCommandExportManualCoreV1Model();

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.finiteCases, 58);
  assert.equal(result.hostileCases, 35);
  assert.equal(result.semanticMutants, 31);
  assert.equal(result.survivors, 0);
  assert.deepEqual(result.survivorNames, []);
  assert.equal(result.skips, 0);
});
