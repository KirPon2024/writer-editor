const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxProductCommandExportManualCoreV1.mjs');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'black-box-product-command-export-manual-core-v1-model.mjs');
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
      getAuditIdentity: async () => {
        calls.auditIdentity += 1;
        return {
          schemaVersion: 'yalken.blackBoxStrictCapsuleRecover.identity.v1',
          type: 'AGE_X25519_IDENTITY',
          secretKeyBase64: Buffer.from('synthetic-audit-identity').toString('base64'),
          fingerprint: digest('1'),
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

  assert.equal(productCommand.BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_COMMAND_ID, COMMAND_ID);
  assert.equal(productCommand.BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_CAPABILITY_ID, CAPABILITY_ID);
  assert.deepEqual(Object.keys(productCommand.BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_SCHEMAS).sort(), [
    'featureFlag',
    'integrationManifest',
    'request',
    'result',
  ]);
  assert.equal(
    productCommand.BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_INTEGRATION_MANIFEST.featureId,
    'yalken.blackBox.productCommand.exportManualCoreCapsule',
  );
  assert.deepEqual(
    productCommand.BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_INTEGRATION_MANIFEST.commandIds,
    [COMMAND_ID],
  );
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
  assert.equal(calls.auditIdentity, 1);
  assert.equal(calls.target.length, 1);
  assert.equal(calls.manualKit.length, 1);
  assert.equal(calls.trustedSnapshot.length, 1);
  assert.equal(calls.trustedSnapshot[0].request.expected.projectId, 'project-black-box-command');
  assert.equal(calls.trustedSnapshot[0].request.featureFlags['yalken.blackBox.coreSourceAdapter.p0aV1'], true);
  assert.equal(calls.manualKit[0].request.providerPin.providerId, 'filosottile-age-v1.3.1-darwin-arm64');
  assert.equal(calls.manualKit[0].request.recipient.fingerprint, digest('1'));
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
    if (item.name !== 'target-collision' && item.name !== 'manual-kit-deny') {
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
  assert.equal(result.finiteCases, 36);
  assert.equal(result.hostileCases, 18);
  assert.equal(result.semanticMutants, 12);
  assert.equal(result.survivors, 0);
  assert.deepEqual(result.survivorNames, []);
  assert.equal(result.skips, 0);
});
