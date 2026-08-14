'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxTrustedSourceSnapshotV1.mjs');
const P0A_MODULE_PATH = path.join(REPO_ROOT, 'src', 'product', 'blackBoxCoreSourceAdapterV1.mjs');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'black-box-trusted-source-snapshot-v1-model.mjs');

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

async function loadP0A() {
  return import(pathToFileURL(P0A_MODULE_PATH).href);
}

async function loadModel() {
  return import(pathToFileURL(MODEL_PATH).href);
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex')}`;
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
  assert.equal(result.sourceSnapshot, null);
}

async function createSyntheticProject(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-f3-trusted-source-'));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(root, 'scenes'), { recursive: true });
  const projectId = overrides.projectId || 'project-alpha';
  const rootId = overrides.rootId || 'root-main';
  const manifest = overrides.manifest || {
    schemaVersion: 'yalken.syntheticProjectManifest.v1',
    projectId,
    rootId,
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
  await fs.writeFile(path.join(root, 'project.craftsman.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'scenes', 'scene-001.txt'), 'Opening line.\nSecond line.', 'utf8');
  await fs.writeFile(path.join(root, 'scenes', 'scene-002.txt'), 'A later scene.', 'utf8');
  await fs.writeFile(path.join(root, 'notes.craftsman.json'), '{"notes":[{"body":"Keep the signal."}]}', 'utf8');
  return { root, manifest, projectId, rootId };
}

function binding(overrides = {}) {
  return {
    projectId: overrides.projectId || 'project-alpha',
    rootId: overrides.rootId || 'root-main',
    documentId: overrides.documentId || 'black-box-core',
    canonicalRevision: overrides.canonicalRevision || 'canon-r001',
    workingRevision: overrides.workingRevision || 'work-r001',
    generation: overrides.generation || 'gen-r001',
  };
}

function observerFor(module, baseBinding = binding(), overrides = {}) {
  const calls = [];
  const makeObservation = (phase) => ({
    schemaVersion: module.BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_SCHEMAS.revisionObservation,
    authority: {
      decision: 'ALLOW',
      mayWrite: false,
      queryId: 'query.blackBoxTrustedSourceSnapshot.read.v1',
      ...(overrides.authority || {}),
      ...(overrides[phase]?.authority || {}),
    },
    dirtyState: 'CLEAN',
    ...baseBinding,
    ...(overrides.observation || {}),
    ...(overrides[phase] || {}),
  });
  return {
    calls,
    observeRevision: async ({ phase }) => {
      calls.push(phase);
      return makeObservation(phase);
    },
  };
}

function requestFor(module, projectRoot, overrides = {}) {
  const p0aFlag = module.BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_FEATURE_FLAG;
  return {
    schemaVersion: module.BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_SCHEMAS.request,
    featureFlags: overrides.featureFlags || { [p0aFlag]: true },
    projectRoot,
    expected: overrides.expected || binding(overrides.binding || {}),
    ...(overrides.extra || {}),
  };
}

test('F3 trusted source snapshot v1 exports closed schemas and reuses the P0A default-off feature flag', async () => {
  const module = await loadModule();
  const disabled = module.resolveBlackBoxTrustedSourceSnapshotFeatureFlag({});
  const enabled = module.resolveBlackBoxTrustedSourceSnapshotFeatureFlag({
    [module.BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_FEATURE_FLAG]: true,
  });

  assert.equal(module.BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_FEATURE_FLAG, 'yalken.blackBox.coreSourceAdapter.p0aV1');
  assert.deepEqual(sortedKeys(module.BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_SCHEMAS), [
    'featureFlag',
    'request',
    'result',
    'revisionObservation',
  ]);
  assert.deepEqual(sortedKeys(module.BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES), [
    'AUTHORITY_NOT_GRANTED',
    'DIRTY_DOCUMENT_REJECTED',
    'FEATURE_DISABLED',
    'FIELD_INVALID',
    'KEYSET_INVALID',
    'P0A_REJECTED',
    'PROJECT_MANIFEST_REQUIRED',
    'PROJECT_ROOT_UNSAFE',
    'REVISION_OBSERVER_REQUIRED',
    'REVISION_STALE',
    'SOURCE_FILE_MISSING',
    'SOURCE_FILE_UNSUPPORTED',
    'SOURCE_SNAPSHOT_READY',
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

test('F3 trusted source snapshot v1 reads synthetic Product Core bytes and returns a P0A-consumable sourceSnapshot', async (t) => {
  const module = await loadModule();
  const p0a = await loadP0A();
  const project = await createSyntheticProject(t);
  const observer = observerFor(module);
  const result = await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, project.root),
    { observeRevision: observer.observeRevision },
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, module.BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.SOURCE_SNAPSHOT_READY);
  assert.deepEqual(observer.calls, ['before', 'after']);
  assert.equal(result.sourceSnapshot.authority.decision, 'ALLOW');
  assert.equal(result.sourceSnapshot.authority.mayWrite, false);
  assert.equal(result.sourceSnapshot.expected.projectId, 'project-alpha');
  assert.equal(result.sourceSnapshot.expected.rootId, 'root-main');
  assert.equal(result.sourceSnapshot.expected.documentId, 'black-box-core');
  assert.equal(result.sourceSnapshot.expected.sourceDigest, result.sourceSnapshot.current.sourceDigest);
  assert.match(result.sourceSnapshot.expected.sourceDigest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(result.sourceSnapshot.core.items.map((item) => item.kind), [
    'SCENE_DOCUMENT',
    'SCENE_DOCUMENT',
    'NOTES_DOCUMENT',
  ]);
  assert.deepEqual(result.sourceSnapshot.core.items.map((item) => item.documentId), [
    'scene-001',
    'scene-002',
    'project-notes',
  ]);
  assert.equal(result.sourceSnapshot.core.expectedCounts.projectManifest, 1);
  assert.equal(result.sourceSnapshot.core.expectedCounts.sceneDocuments, 2);
  assert.equal(result.sourceSnapshot.core.expectedCounts.notesDocuments, 1);
  assert.equal(result.sourceSnapshot.core.expectedCounts.historyDocuments, 0);
  assert.equal(result.sourceSnapshot.core.expectedCounts.totalItems, 4);
  assert.equal(result.sourceSnapshot.core.items.every((item) => item.sourceTextDigest === sha256Text(item.sourceText)), true);
  assert.equal(result.metrics.elapsedMs <= 1000, true);
  assert.equal(result.userDocumentsTouched, false);

  const sourceSet = p0a.buildBlackBoxCoreSourceSetV1({
    schemaVersion: p0a.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.request,
    featureFlags: { [p0a.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG]: true },
    sourceSnapshot: result.sourceSnapshot,
  });
  assert.equal(sourceSet.ok, true);
  assert.equal(sourceSet.accounting.eligibleItems, 4);
  assert.equal(sourceSet.accounting.droppedItems, 0);
  assert.equal(sourceSet.canWriteManuscript, false);
});

test('F3 trusted source snapshot v1 rejects caller-carried ALLOW, caller digests and disabled feature flags before trusting bytes', async (t) => {
  const module = await loadModule();
  const project = await createSyntheticProject(t);
  const observer = observerFor(module);

  assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, project.root, {
      extra: {
        sourceSnapshot: { authority: { decision: 'ALLOW', mayWrite: false } },
      },
    }),
    { observeRevision: observer.observeRevision },
  ), module.BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.KEYSET_INVALID);

  assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, project.root, {
      expected: { ...binding(), sourceDigest: `sha256:${'a'.repeat(64)}` },
    }),
    { observeRevision: observer.observeRevision },
  ), module.BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.KEYSET_INVALID);

  const disabledObserver = observerFor(module);
  const disabled = await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, project.root, { featureFlags: {} }),
    { observeRevision: disabledObserver.observeRevision },
  );
  assertDenied(disabled, module.BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FEATURE_DISABLED);
  assert.deepEqual(disabledObserver.calls, []);
});

test('F3 trusted source snapshot v1 rejects stale revision/generation, wrong identity, dirty state, UNKNOWN and ABSTAIN', async (t) => {
  const module = await loadModule();
  const project = await createSyntheticProject(t);
  const { BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES: CODES } = module;

  assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, project.root),
    { observeRevision: observerFor(module, binding(), { after: { canonicalRevision: 'canon-r002' } }).observeRevision },
  ), CODES.REVISION_STALE);

  assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, project.root),
    { observeRevision: observerFor(module, binding(), { after: { generation: 'gen-r002' } }).observeRevision },
  ), CODES.REVISION_STALE);

  assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, project.root),
    { observeRevision: observerFor(module, binding(), { observation: { projectId: 'project-beta' } }).observeRevision },
  ), CODES.REVISION_STALE);

  assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, project.root),
    { observeRevision: observerFor(module, binding(), { observation: { dirtyState: 'DIRTY' } }).observeRevision },
  ), CODES.DIRTY_DOCUMENT_REJECTED);

  for (const decision of ['UNKNOWN', 'ABSTAIN', 'CONFLICTING']) {
    assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
      requestFor(module, project.root),
      { observeRevision: observerFor(module, binding(), { authority: { decision } }).observeRevision },
    ), CODES.AUTHORITY_NOT_GRANTED);
  }

  for (const dirtyState of ['UNKNOWN', 'ABSTAIN', 'CONFLICTING']) {
    assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
      requestFor(module, project.root),
      { observeRevision: observerFor(module, binding(), { observation: { dirtyState } }).observeRevision },
    ), CODES.DIRTY_DOCUMENT_REJECTED);
  }
});

test('F3 trusted source snapshot v1 rejects transplant/replay manifests, path traversal, missing files and unsupported declared sources', async (t) => {
  const module = await loadModule();
  const { BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES: CODES } = module;

  const wrongManifest = await createSyntheticProject(t, { projectId: 'project-beta' });
  assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, wrongManifest.root),
    { observeRevision: observerFor(module).observeRevision },
  ), CODES.REVISION_STALE);

  const traversal = await createSyntheticProject(t, {
    manifest: {
      schemaVersion: 'yalken.syntheticProjectManifest.v1',
      projectId: 'project-alpha',
      rootId: 'root-main',
      sceneOrder: ['scene-001'],
      scenes: {
        'scene-001': { title: 'Bad', bindingKey: 'file:../outside.txt' },
      },
      notesOrder: [],
      historyOrder: [],
    },
  });
  assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, traversal.root),
    { observeRevision: observerFor(module).observeRevision },
  ), CODES.SOURCE_FILE_UNSUPPORTED);

  const missing = await createSyntheticProject(t, {
    manifest: {
      schemaVersion: 'yalken.syntheticProjectManifest.v1',
      projectId: 'project-alpha',
      rootId: 'root-main',
      sceneOrder: ['scene-404'],
      scenes: {
        'scene-404': { title: 'Missing', bindingKey: 'file:scenes/missing.txt' },
      },
      notesOrder: [],
      historyOrder: [],
    },
  });
  assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, missing.root),
    { observeRevision: observerFor(module).observeRevision },
  ), CODES.SOURCE_FILE_MISSING);

  const unsupported = await createSyntheticProject(t, {
    manifest: {
      schemaVersion: 'yalken.syntheticProjectManifest.v1',
      projectId: 'project-alpha',
      rootId: 'root-main',
      sceneOrder: [],
      scenes: {},
      notesOrder: [],
      historyOrder: ['history-001'],
    },
  });
  assertDenied(await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, unsupported.root),
    { observeRevision: observerFor(module).observeRevision },
  ), CODES.SOURCE_FILE_UNSUPPORTED);
});

test('F3 trusted source snapshot v1 recomputes digest from current bytes and P0A rejects semantic tamper', async (t) => {
  const module = await loadModule();
  const p0a = await loadP0A();
  const project = await createSyntheticProject(t);
  const observer = observerFor(module);
  const first = await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, project.root),
    { observeRevision: observer.observeRevision },
  );
  assert.equal(first.ok, true);

  await fs.writeFile(path.join(project.root, 'scenes', 'scene-001.txt'), 'Opening line changed.', 'utf8');
  const second = await module.buildBlackBoxTrustedSourceSnapshotV1(
    requestFor(module, project.root),
    { observeRevision: observerFor(module).observeRevision },
  );
  assert.equal(second.ok, true);
  assert.notEqual(first.sourceSnapshot.expected.sourceDigest, second.sourceSnapshot.expected.sourceDigest);

  const tampered = JSON.parse(JSON.stringify(second.sourceSnapshot));
  tampered.core.items[0].sourceTextDigest = `sha256:${'b'.repeat(64)}`;
  const p0aResult = p0a.buildBlackBoxCoreSourceSetV1({
    schemaVersion: p0a.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.request,
    featureFlags: { [p0a.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG]: true },
    sourceSnapshot: tampered,
  });
  assert.equal(p0aResult.ok, false);
  assert.equal(p0aResult.decision, 'DENY');
});

test('F3 trusted source snapshot v1 model/oracle keeps UNKNOWN, stale and mutants out of PASS', async () => {
  const model = await loadModel();
  const result = model.runBlackBoxTrustedSourceSnapshotV1Model();

  assert.equal(result.ok, true);
  assert.equal(result.finiteCases, 48);
  assert.equal(result.hostileCases, 18);
  assert.equal(result.semanticMutants, 12);
  assert.equal(result.survivors, 0);
  assert.equal(result.failures, 0);
  assert.equal(result.skips, 0);
});
