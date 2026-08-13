'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxCoreSourceAdapterV1.mjs');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'black-box-p0a-source-adapter-v1-model.mjs');
const TREE_IDENTITY_PATH = path.join(REPO_ROOT, 'src', 'core', 'projectTreeIdentity.mjs');

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
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
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex')}`;
}

function sha256Stable(value) {
  return sha256Text(stableJson(value));
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function assertDenied(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'DENY');
  assert.ok(
    result.reasons.some((reason) => reason.code === code),
    `expected ${code} in ${JSON.stringify(result.reasons)}`,
  );
}

async function treeNodeId(projectId, bindingKey) {
  const { createDeterministicTreeNodeId } = await loadTreeIdentity();
  return createDeterministicTreeNodeId(projectId, bindingKey);
}

async function buildCore(module, overrides = {}) {
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
    sourceTextDigest: overrides.manifestDigest || sha256Text(manifestText),
  };
  const defaultItems = [
    {
      kind: 'SCENE_DOCUMENT',
      documentId: 'scene-001',
      bindingKey: 'file:scenes/scene-001.json',
      treeNodeId: await treeNodeId(projectId, 'file:scenes/scene-001.json'),
      ordinal: 0,
      sourceText: 'Opening line.\nSecond line.',
      sourceTextDigest: sha256Text('Opening line.\nSecond line.'),
    },
    {
      kind: 'SCENE_DOCUMENT',
      documentId: 'scene-002',
      bindingKey: 'file:scenes/scene-002.json',
      treeNodeId: await treeNodeId(projectId, 'file:scenes/scene-002.json'),
      ordinal: 1,
      sourceText: 'A later scene.',
      sourceTextDigest: sha256Text('A later scene.'),
    },
  ];
  const items = overrides.items || defaultItems;
  return {
    schemaVersion: module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.coreSnapshot,
    manifest: overrides.manifest || manifest,
    items,
    expectedCounts: overrides.expectedCounts || {
      projectManifest: 1,
      sceneDocuments: 2,
      notesDocuments: 0,
      historyDocuments: 0,
      totalItems: 3,
    },
  };
}

function expectedCoreDigest(core, binding) {
  const entryFrom = (item) => ({
    kind: item.kind,
    documentId: item.documentId,
    bindingKey: item.bindingKey,
    treeNodeId: item.treeNodeId,
    ordinal: item.ordinal,
    sourceTextDigest: item.sourceTextDigest,
    byteLength: Buffer.byteLength(item.sourceText, 'utf8'),
  });
  return sha256Stable({
    schemaVersion: 'yalken.blackBoxCoreSourceAdapter.coreDigestInput.v1',
    projectId: binding.projectId,
    rootId: binding.rootId,
    documentId: binding.documentId,
    expectedCounts: core.expectedCounts,
    entries: [
      entryFrom({ ...core.manifest, ordinal: 0 }),
      ...core.items.map(entryFrom),
    ],
  });
}

async function trustedSnapshot(module, overrides = {}) {
  const binding = {
    projectId: overrides.projectId || 'project-alpha',
    rootId: overrides.rootId || 'root-main',
    documentId: overrides.documentId || 'black-box-core',
    canonicalRevision: overrides.canonicalRevision || 'canon-r001',
    workingRevision: overrides.workingRevision || 'work-r001',
    generation: overrides.generation || 'gen-r001',
    sourceDigest: 'sha256:' + '0'.repeat(64),
    ...(overrides.binding || {}),
  };
  const core = overrides.core || await buildCore(module, {
    projectId: binding.projectId,
    rootId: binding.rootId,
    ...(overrides.coreOverrides || {}),
  });
  binding.sourceDigest = overrides.sourceDigest || expectedCoreDigest(core, binding);
  const current = {
    ...binding,
    dirtyState: overrides.dirtyState || 'CLEAN',
    ...(overrides.current || {}),
  };
  return {
    schemaVersion: module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.sourceSnapshot,
    authority: {
      decision: overrides.decision || 'ALLOW',
      mayWrite: overrides.mayWrite ?? false,
      queryId: overrides.queryId || 'query.blackBoxCoreSourceAdapter.readSourceSnapshot.v1',
    },
    expected: binding,
    current,
    core,
  };
}

async function buildRequest(overrides = {}) {
  const module = await loadModule();
  return {
    schemaVersion: module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.request,
    featureFlags: overrides.featureFlags || {
      [module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG]: true,
    },
    sourceSnapshot: overrides.sourceSnapshot || await trustedSnapshot(module, overrides),
    ...(overrides.extraRequestFields || {}),
  };
}

test('F3 P0A source adapter v1 exports closed schemas, reason codes and a default-off no-write flag', async () => {
  const module = await loadModule();
  const disabled = module.resolveBlackBoxCoreSourceAdapterFeatureFlag({});
  const enabled = module.resolveBlackBoxCoreSourceAdapterFeatureFlag({
    [module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG]: true,
  });

  assert.equal(module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG, 'yalken.blackBox.coreSourceAdapter.p0aV1');
  assert.deepEqual(sortedKeys(module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS), [
    'coreSnapshot',
    'featureFlag',
    'request',
    'sourceSet',
    'sourceSnapshot',
  ]);
  assert.deepEqual(sortedKeys(module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES), [
    'CORE_ACCOUNTING_MISMATCH',
    'CORE_ITEM_UNSUPPORTED',
    'CORE_MANIFEST_REQUIRED',
    'CORE_SOURCE_SET_READY',
    'FEATURE_DISABLED',
    'FIELD_INVALID',
    'KEYSET_INVALID',
    'SOURCE_BINDING_MISMATCH',
    'SOURCE_FENCE_REJECTED',
  ]);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.canWriteManuscript, false);
  assert.equal(disabled.canPublishCapsule, false);
  assert.equal(disabled.canRecoverProject, false);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.canWriteManuscript, false);
  assert.equal(enabled.canPublishCapsule, false);
  assert.equal(enabled.canRecoverProject, false);
});

test('F3 P0A source adapter v1 builds a source-fence-bound whole-CORE source set with exact accounting', async () => {
  const module = await loadModule();
  const request = await buildRequest();
  const result = module.buildBlackBoxCoreSourceSetV1(request);

  assert.equal(result.ok, true);
  assert.equal(result.code, module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_SOURCE_SET_READY);
  assert.equal(result.sourceBinding.projectId, 'project-alpha');
  assert.equal(result.sourceBinding.documentId, 'black-box-core');
  assert.equal(result.accounting.expected.totalItems, 3);
  assert.equal(result.accounting.observed.totalItems, 3);
  assert.equal(result.accounting.eligibleItems, 3);
  assert.equal(result.accounting.omittedItems, 0);
  assert.equal(result.accounting.unsupportedItems, 0);
  assert.equal(result.accounting.droppedItems, 0);
  assert.deepEqual(result.items.map((item) => item.kind), ['PROJECT_MANIFEST', 'SCENE_DOCUMENT', 'SCENE_DOCUMENT']);
  assert.deepEqual(result.items.map((item) => item.documentId), ['project-manifest', 'scene-001', 'scene-002']);
  assert.equal(result.items.every((item) => item.sourceTextDigest === sha256Text(item.sourceText)), true);
  assert.equal(result.items.every((item) => item.treeNodeId.startsWith('tree-node-')), true);
  assert.equal(result.canWriteManuscript, false);
  assert.equal(result.canPublishCapsule, false);
  assert.equal(result.canRecoverProject, false);
  assert.equal(typeof result.sourceSetDigest, 'string');
  assert.match(result.sourceSetDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(result, 'capsuleBytes'), false);
  assert.equal(Object.hasOwn(result, 'archivePath'), false);
  assert.equal(Object.hasOwn(result, 'ownerKey'), false);
});

test('F3 P0A source adapter v1 trusts only Product Core snapshot binding, not caller-carried proof', async () => {
  const module = await loadModule();
  const forged = await buildRequest({
    extraRequestFields: {
      sourceFenceResult: {
        schemaVersion: 'yalken.sourceFence.result.v1',
        ok: true,
        decision: 'ALLOW',
        code: 'YALKEN_SOURCE_FENCE_ALLOWED',
        reasons: [],
      },
      sourceBinding: { projectId: 'project-alpha', sourceDigest: 'sha256:' + 'a'.repeat(64) },
    },
  });
  assertDenied(module.buildBlackBoxCoreSourceSetV1(forged), module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.KEYSET_INVALID);

  const disabled = module.buildBlackBoxCoreSourceSetV1(await buildRequest({ featureFlags: {} }));
  assertDenied(disabled, module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FEATURE_DISABLED);
  assert.equal(disabled.accounting.observed.totalItems, 3);
  assert.equal(disabled.accounting.eligibleItems, 0);

  for (const decision of ['UNKNOWN', 'ABSTAIN', 'CONFLICTING']) {
    assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({ decision })), module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_FENCE_REJECTED);
  }
  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({ mayWrite: true })), module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_FENCE_REJECTED);
});

test('F3 P0A source adapter v1 rejects digest, revision, generation, transplant and dirty-state drift', async () => {
  const module = await loadModule();
  const { BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES: CODES } = module;

  const coreWithStaleTextDigest = await buildCore(module);
  coreWithStaleTextDigest.items[0].sourceTextDigest = 'sha256:' + 'b'.repeat(64);
  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({ core: coreWithStaleTextDigest })), CODES.SOURCE_BINDING_MISMATCH);

  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({
    sourceDigest: 'sha256:' + 'c'.repeat(64),
  })), CODES.SOURCE_BINDING_MISMATCH);

  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({
    current: { canonicalRevision: 'canon-r002' },
  })), CODES.SOURCE_FENCE_REJECTED);

  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({
    current: { generation: 'gen-r002' },
  })), CODES.SOURCE_BINDING_MISMATCH);

  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({
    current: { projectId: 'project-beta' },
  })), CODES.SOURCE_FENCE_REJECTED);

  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({
    dirtyState: 'DIRTY',
  })), CODES.SOURCE_FENCE_REJECTED);

  for (const dirtyState of ['UNKNOWN', 'ABSTAIN', 'CONFLICTING']) {
    assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({ dirtyState })), CODES.SOURCE_FENCE_REJECTED);
  }
});

test('F3 P0A source adapter v1 blocks missing manifest, omissions, phantom rows and unsupported CORE items', async () => {
  const module = await loadModule();
  const { BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES: CODES } = module;

  const missingManifest = await buildCore(module);
  missingManifest.manifest = null;
  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({
    core: missingManifest,
    sourceDigest: 'sha256:' + 'd'.repeat(64),
  })), CODES.CORE_MANIFEST_REQUIRED);

  const omittedScene = await buildCore(module, {
    items: (await buildCore(module)).items.slice(0, 1),
    expectedCounts: {
      projectManifest: 1,
      sceneDocuments: 2,
      notesDocuments: 0,
      historyDocuments: 0,
      totalItems: 3,
    },
  });
  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({ core: omittedScene })), CODES.CORE_ACCOUNTING_MISMATCH);

  const phantomScene = await buildCore(module);
  phantomScene.items.push({
    kind: 'SCENE_DOCUMENT',
    documentId: 'scene-999',
    bindingKey: 'file:scenes/scene-999.json',
    treeNodeId: await treeNodeId('project-alpha', 'file:scenes/scene-999.json'),
    ordinal: 2,
    sourceText: 'Phantom.',
    sourceTextDigest: sha256Text('Phantom.'),
  });
  phantomScene.expectedCounts = {
    projectManifest: 1,
    sceneDocuments: 3,
    notesDocuments: 0,
    historyDocuments: 0,
    totalItems: 4,
  };
  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({ core: phantomScene })), CODES.CORE_ACCOUNTING_MISMATCH);

  const unsupported = await buildCore(module);
  unsupported.items.push({
    kind: 'ASSET_BINARY',
    documentId: 'asset-001',
    bindingKey: 'file:assets/asset-001.bin',
    treeNodeId: await treeNodeId('project-alpha', 'file:assets/asset-001.bin'),
    ordinal: 2,
    sourceText: 'not-binary-in-this-test',
    sourceTextDigest: sha256Text('not-binary-in-this-test'),
  });
  unsupported.expectedCounts = {
    projectManifest: 1,
    sceneDocuments: 2,
    notesDocuments: 0,
    historyDocuments: 0,
    totalItems: 4,
  };
  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({ core: unsupported })), CODES.CORE_ITEM_UNSUPPORTED);

  const duplicate = await buildCore(module);
  duplicate.items = [duplicate.items[0], clone(duplicate.items[0])];
  assertDenied(module.buildBlackBoxCoreSourceSetV1(await buildRequest({ core: duplicate })), CODES.CORE_ACCOUNTING_MISMATCH);
});

test('F3 P0A source adapter v1 generated model, independent oracle and semantic mutations are deterministic', async () => {
  const module = await loadModule();
  const model = await loadModel();
  const first = model.runBlackBoxP0aSourceAdapterV1Model(module);
  const second = model.runBlackBoxP0aSourceAdapterV1Model(module);

  assert.equal(first.schemaVersion, 'yalken.blackBoxCoreSourceAdapter.modelReport.v1');
  assert.deepEqual(first, second);
  assert.equal(first.cases.total, 32);
  assert.equal(first.cases.disagreements, 0);
  assert.equal(first.hostile.total, 18);
  assert.equal(first.hostile.failures, 0);
  assert.equal(first.mutations.total, 12);
  assert.equal(first.mutations.survivors, 0);
  assert.equal(first.controls.syntheticCorePasses, true);
  assert.equal(first.controls.forgedAllowIsNotPass, true);
  assert.equal(first.controls.digestMismatchIsNotPass, true);
  assert.equal(first.controls.omissionIsNotPass, true);
  assert.equal(first.controls.unknownAuthorityIsNotPass, true);
  assert.equal(first.skips, 0);
});
