const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCENE_A = `tree-node-${'a'.repeat(32)}`;
const SCENE_B = `tree-node-${'b'.repeat(32)}`;
const SCENE_UNKNOWN = `tree-node-${'c'.repeat(32)}`;
const PRIVATE_SENTINEL = 'PRIVATE_MANUSCRIPT_SENTINEL_DO_NOT_DIAGNOSE';

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadBridge() {
  const modulePath = path.join(process.cwd(), 'src', 'product', 'atlasProductRevisionBridge.mjs');
  return import(pathToFileURL(modulePath).href);
}

function makeInput() {
  return {
    projectId: 'project-atlas-revision-bridge',
    revisionScope: 'WHOLE_PROJECT',
    manifestRevision: digest('manifest-v1'),
    sceneOrder: [SCENE_B, SCENE_A],
    scenesById: {
      [SCENE_A]: {
        sceneId: SCENE_A,
        title: 'Opening',
        text: 'Anna promises to return.',
        sceneRevision: digest('persisted-envelope-a-v1'),
      },
      [SCENE_B]: {
        sceneId: SCENE_B,
        title: 'Ending',
        text: 'Anna breaks the promise.',
        sceneRevision: digest('persisted-envelope-b-v1'),
      },
    },
  };
}

test('ATLAS-01 revision bridge emits a deterministic strict read contract', async () => {
  const bridge = await loadBridge();
  assert.equal(
    bridge.ATLAS_PRODUCT_REVISION_BRIDGE_SCHEMA_VERSION,
    'yalken.atlas.productRevisionBridge.v1',
  );
  assert.deepEqual(bridge.ATLAS_PRODUCT_REVISION_SCOPES, {
    CURRENT_SCENE: 'CURRENT_SCENE',
    WHOLE_PROJECT: 'WHOLE_PROJECT',
  });

  const input = makeInput();
  const first = bridge.buildAtlasProductRevisionBridge(input);
  const second = bridge.buildAtlasProductRevisionBridge(makeInput());
  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
  assert.deepEqual(Object.keys(first.value).sort(), [
    'manifestRevision',
    'projectId',
    'projectRevisionId',
    'revisionScope',
    'sceneOrder',
    'scenesById',
    'schemaVersion',
  ]);
  assert.match(first.value.projectRevisionId, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(
    first.value.projectRevisionId,
    'sha256:ce9176191e034b63192215489fb790e3c87274af3f9c2cfd765f9eb9f2e4083a',
  );
  assert.deepEqual(first.value.sceneOrder, [SCENE_B, SCENE_A]);
  assert.deepEqual(Object.keys(first.value.scenesById[SCENE_A]).sort(), [
    'sceneId',
    'sceneRevision',
    'text',
    'title',
  ]);
  assert.equal(first.value.scenesById[SCENE_A].sceneRevision, digest('persisted-envelope-a-v1'));
  assert.equal(Object.prototype.hasOwnProperty.call(first.value.scenesById[SCENE_A], 'sourceText'), false);
  assert.notEqual(first.value.scenesById, input.scenesById);
  assert.equal(Object.isFrozen(first.value), true);
  assert.equal(Object.isFrozen(first.value.sceneOrder), true);
  assert.equal(Object.isFrozen(first.value.scenesById[SCENE_A]), true);

  const emptyProjectInput = makeInput();
  emptyProjectInput.sceneOrder = [];
  emptyProjectInput.scenesById = {};
  const emptyProject = bridge.buildAtlasProductRevisionBridge(emptyProjectInput);
  assert.equal(emptyProject.ok, true);
  assert.deepEqual(emptyProject.value.sceneOrder, []);
  assert.deepEqual(emptyProject.value.scenesById, {});
  assert.match(emptyProject.value.projectRevisionId, /^sha256:[a-f0-9]{64}$/u);
});

test('ATLAS-01 revision bridge mutation matrix isolates scene identities and binds aggregate semantics', async () => {
  const bridge = await loadBridge();
  const baseline = bridge.buildAtlasProductRevisionBridge(makeInput());
  assert.equal(baseline.ok, true);

  const editedInput = makeInput();
  editedInput.scenesById[SCENE_B].text = 'Anna keeps the promise.';
  editedInput.scenesById[SCENE_B].sceneRevision = digest('persisted-envelope-b-v2');
  const edited = bridge.buildAtlasProductRevisionBridge(editedInput);
  assert.equal(edited.ok, true);
  assert.equal(
    edited.value.scenesById[SCENE_A].sceneRevision,
    baseline.value.scenesById[SCENE_A].sceneRevision,
  );
  assert.notEqual(
    edited.value.scenesById[SCENE_B].sceneRevision,
    baseline.value.scenesById[SCENE_B].sceneRevision,
  );
  assert.equal(edited.value.manifestRevision, baseline.value.manifestRevision);
  assert.notEqual(edited.value.projectRevisionId, baseline.value.projectRevisionId);

  const reorderedInput = makeInput();
  reorderedInput.sceneOrder = [SCENE_A, SCENE_B];
  const reordered = bridge.buildAtlasProductRevisionBridge(reorderedInput);
  assert.equal(reordered.ok, true);
  assert.equal(
    reordered.value.scenesById[SCENE_A].sceneRevision,
    baseline.value.scenesById[SCENE_A].sceneRevision,
  );
  assert.equal(
    reordered.value.scenesById[SCENE_B].sceneRevision,
    baseline.value.scenesById[SCENE_B].sceneRevision,
  );
  assert.notEqual(reordered.value.projectRevisionId, baseline.value.projectRevisionId);

  const manifestInput = makeInput();
  manifestInput.manifestRevision = digest('manifest-v2');
  const manifestChanged = bridge.buildAtlasProductRevisionBridge(manifestInput);
  assert.equal(manifestChanged.ok, true);
  assert.equal(
    manifestChanged.value.scenesById[SCENE_A].sceneRevision,
    baseline.value.scenesById[SCENE_A].sceneRevision,
  );
  assert.notEqual(manifestChanged.value.manifestRevision, baseline.value.manifestRevision);
  assert.notEqual(manifestChanged.value.projectRevisionId, baseline.value.projectRevisionId);

  const titleInput = makeInput();
  titleInput.scenesById[SCENE_A].title = 'A renamed opening';
  const titleChanged = bridge.buildAtlasProductRevisionBridge(titleInput);
  assert.equal(titleChanged.ok, true);
  assert.equal(
    titleChanged.value.scenesById[SCENE_A].sceneRevision,
    baseline.value.scenesById[SCENE_A].sceneRevision,
  );
  assert.notEqual(titleChanged.value.projectRevisionId, baseline.value.projectRevisionId);

  const singletonInput = makeInput();
  singletonInput.sceneOrder = [SCENE_A];
  singletonInput.scenesById = { [SCENE_A]: singletonInput.scenesById[SCENE_A] };
  const wholeSingleton = bridge.buildAtlasProductRevisionBridge(singletonInput);
  singletonInput.revisionScope = 'CURRENT_SCENE';
  const currentSingleton = bridge.buildAtlasProductRevisionBridge(singletonInput);
  assert.equal(wholeSingleton.ok, true);
  assert.equal(currentSingleton.ok, true);
  assert.notEqual(currentSingleton.value.projectRevisionId, wholeSingleton.value.projectRevisionId);
});

test('ATLAS-01 revision bridge rejects ambiguous, malformed, or content-smuggling input without disclosure', async () => {
  const bridge = await loadBridge();
  const cases = [[null, 'INPUT_OBJECT_REQUIRED']];

  const badProjectId = makeInput();
  badProjectId.projectId = ' project/invalid ';
  cases.push([badProjectId, 'PROJECT_ID_INVALID']);

  const extraTopLevel = makeInput();
  extraTopLevel.sourceText = PRIVATE_SENTINEL;
  cases.push([extraTopLevel, 'INPUT_KEYSET_INVALID']);

  const badScope = makeInput();
  badScope.revisionScope = 'ARBITRARY_SCOPE';
  cases.push([badScope, 'REVISION_SCOPE_INVALID']);

  const badManifestRevision = makeInput();
  badManifestRevision.manifestRevision = 'sha256:NOT-A-DIGEST';
  cases.push([badManifestRevision, 'MANIFEST_REVISION_INVALID']);

  const nonArrayOrder = makeInput();
  nonArrayOrder.sceneOrder = `${SCENE_A},${SCENE_B}`;
  cases.push([nonArrayOrder, 'SCENE_ORDER_ARRAY_REQUIRED']);

  const nonObjectSceneMap = makeInput();
  nonObjectSceneMap.scenesById = [];
  cases.push([nonObjectSceneMap, 'SCENES_BY_ID_OBJECT_REQUIRED']);

  const duplicateOrder = makeInput();
  duplicateOrder.sceneOrder = [SCENE_A, SCENE_A];
  cases.push([duplicateOrder, 'SCENE_ORDER_EXACT_COVERAGE_REQUIRED']);

  const missingOrder = makeInput();
  missingOrder.sceneOrder = [SCENE_A];
  cases.push([missingOrder, 'SCENE_ORDER_EXACT_COVERAGE_REQUIRED']);

  const unknownOrder = makeInput();
  unknownOrder.sceneOrder = [SCENE_A, SCENE_UNKNOWN];
  cases.push([unknownOrder, 'SCENE_ORDER_EXACT_COVERAGE_REQUIRED']);

  const malformedSceneId = makeInput();
  malformedSceneId.sceneOrder = [` ${SCENE_A}`, SCENE_B];
  cases.push([malformedSceneId, 'SCENE_ID_INVALID']);

  const malformedSceneKey = makeInput();
  malformedSceneKey.scenesById['scene-a'] = malformedSceneKey.scenesById[SCENE_A];
  delete malformedSceneKey.scenesById[SCENE_A];
  malformedSceneKey.sceneOrder = [SCENE_B, 'scene-a'];
  cases.push([malformedSceneKey, 'SCENE_ID_INVALID']);

  const nonObjectSceneRecord = makeInput();
  nonObjectSceneRecord.scenesById[SCENE_A] = PRIVATE_SENTINEL;
  cases.push([nonObjectSceneRecord, 'SCENE_RECORD_KEYSET_INVALID']);

  const recordMismatch = makeInput();
  recordMismatch.scenesById[SCENE_A].sceneId = SCENE_B;
  cases.push([recordMismatch, 'SCENE_RECORD_ID_MISMATCH']);

  const badSceneRevision = makeInput();
  badSceneRevision.scenesById[SCENE_A].sceneRevision = 'not-a-digest';
  cases.push([badSceneRevision, 'SCENE_REVISION_INVALID']);

  const contentSmuggling = makeInput();
  contentSmuggling.scenesById[SCENE_A].sourceText = PRIVATE_SENTINEL;
  cases.push([contentSmuggling, 'SCENE_RECORD_KEYSET_INVALID']);

  const invalidTitle = makeInput();
  invalidTitle.scenesById[SCENE_A].title = { private: PRIVATE_SENTINEL };
  cases.push([invalidTitle, 'SCENE_TITLE_INVALID']);

  const invalidText = makeInput();
  invalidText.scenesById[SCENE_A].text = { private: PRIVATE_SENTINEL };
  cases.push([invalidText, 'SCENE_TEXT_INVALID']);

  const tooManyCurrentScenes = makeInput();
  tooManyCurrentScenes.revisionScope = 'CURRENT_SCENE';
  cases.push([tooManyCurrentScenes, 'CURRENT_SCENE_EXACTLY_ONE_SCENE_REQUIRED']);

  const emptyCurrentScene = makeInput();
  emptyCurrentScene.revisionScope = 'CURRENT_SCENE';
  emptyCurrentScene.sceneOrder = [];
  emptyCurrentScene.scenesById = {};
  cases.push([emptyCurrentScene, 'CURRENT_SCENE_EXACTLY_ONE_SCENE_REQUIRED']);

  for (const [input, expectedReason] of cases) {
    const result = bridge.buildAtlasProductRevisionBridge(input);
    assert.equal(result.ok, false, expectedReason);
    assert.equal(result.error.code, 'E_ATLAS_PRODUCT_REVISION_BRIDGE_INVALID');
    assert.equal(result.error.reason, expectedReason);
    assert.equal(JSON.stringify(result.error).includes(PRIVATE_SENTINEL), false);
  }
});

test('ATLAS-01 revision bridge rejects accessor-backed records without invoking them', async () => {
  const bridge = await loadBridge();

  let inputGetterInvoked = false;
  const accessorInput = makeInput();
  Object.defineProperty(accessorInput, 'projectId', {
    enumerable: true,
    get() {
      inputGetterInvoked = true;
      return 'project-accessor';
    },
  });
  const inputResult = bridge.buildAtlasProductRevisionBridge(accessorInput);
  assert.equal(inputResult.ok, false);
  assert.equal(inputResult.error.reason, 'INPUT_PROPERTY_DESCRIPTOR_INVALID');
  assert.equal(inputGetterInvoked, false);

  let sceneOrderGetterInvoked = false;
  const accessorSceneOrder = makeInput();
  Object.defineProperty(accessorSceneOrder.sceneOrder, '0', {
    enumerable: true,
    get() {
      sceneOrderGetterInvoked = true;
      return SCENE_B;
    },
  });
  const sceneOrderResult = bridge.buildAtlasProductRevisionBridge(accessorSceneOrder);
  assert.equal(sceneOrderResult.ok, false);
  assert.equal(sceneOrderResult.error.reason, 'SCENE_ORDER_STRUCTURE_INVALID');
  assert.equal(sceneOrderGetterInvoked, false);

  let sceneMapGetterInvoked = false;
  const accessorSceneMap = makeInput();
  Object.defineProperty(accessorSceneMap.scenesById, SCENE_A, {
    enumerable: true,
    get() {
      sceneMapGetterInvoked = true;
      return makeInput().scenesById[SCENE_A];
    },
  });
  const sceneMapResult = bridge.buildAtlasProductRevisionBridge(accessorSceneMap);
  assert.equal(sceneMapResult.ok, false);
  assert.equal(sceneMapResult.error.reason, 'SCENES_BY_ID_PROPERTY_DESCRIPTOR_INVALID');
  assert.equal(sceneMapGetterInvoked, false);

  let sceneRecordGetterInvoked = false;
  const accessorSceneRecord = makeInput();
  Object.defineProperty(accessorSceneRecord.scenesById[SCENE_A], 'text', {
    enumerable: true,
    get() {
      sceneRecordGetterInvoked = true;
      return PRIVATE_SENTINEL;
    },
  });
  const sceneRecordResult = bridge.buildAtlasProductRevisionBridge(accessorSceneRecord);
  assert.equal(sceneRecordResult.ok, false);
  assert.equal(sceneRecordResult.error.reason, 'SCENE_RECORD_PROPERTY_DESCRIPTOR_INVALID');
  assert.equal(sceneRecordGetterInvoked, false);
  assert.equal(JSON.stringify(sceneRecordResult.error).includes(PRIVATE_SENTINEL), false);
});

test('ATLAS-01 main projection hashes persisted source bytes once and publishes validated bridge metadata', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  const bridgeSource = fs.readFileSync(
    path.join(process.cwd(), 'src', 'product', 'atlasProductRevisionBridge.mjs'),
    'utf8',
  );
  assert.match(bridgeSource, /import crypto from 'node:crypto'/u);
  assert.match(bridgeSource, /function updateCanonicalRevisionField/u);
  assert.doesNotMatch(bridgeSource, /browser-safe-hash/u);
  assert.match(source, /function loadAtlasProductRevisionBridgeModule\(\)/u);
  assert.match(source, /'product', 'atlasProductRevisionBridge\.mjs'/u);

  const treeStart = source.indexOf('async function buildProjectTreeRootsWithIdentitiesReadOnly');
  const treeEnd = source.indexOf('async function resolveProjectTreeNodeIdentity', treeStart);
  const resolverEnd = source.indexOf('function normalizeProjectRelativeSceneId', treeEnd);
  const currentStart = source.indexOf('async function buildAtlasCurrentSceneCoreState');
  const currentEnd = source.indexOf('function collectAtlasOverviewSceneNodes', currentStart);
  const projectStart = source.indexOf('async function buildProductCoreStateForCurrentProject');
  const projectEnd = source.indexOf('async function buildAtlasOverviewCoreState', projectStart);
  for (const offset of [treeStart, treeEnd, resolverEnd, currentStart, currentEnd, projectStart, projectEnd]) {
    assert.notEqual(offset, -1);
  }

  const treeImplementation = source.slice(treeStart, treeEnd);
  const resolverImplementation = source.slice(treeEnd, resolverEnd);
  const currentImplementation = source.slice(currentStart, currentEnd);
  const projectImplementation = source.slice(projectStart, projectEnd);

  assert.match(treeImplementation, /manifestRaw: manifestRecord\.raw/u);
  assert.match(resolverImplementation, /\{ manifestPath, manifest, manifestRaw \} = await ensureProjectManifest/u);
  assert.match(resolverImplementation, /manifestRaw,/u);

  assert.match(currentImplementation, /const sourceBytes = await fs\.readFile\(filePath\)/u);
  assert.match(currentImplementation, /E_ATLAS_PRODUCT_MANIFEST_REVISION_SOURCE_INVALID/u);
  assert.match(currentImplementation, /const sourceText = sourceBytes\.toString\('utf8'\)/u);
  assert.match(currentImplementation, /sceneRevision: `sha256:\$\{computeHash\(sourceBytes\)\}`/u);
  assert.match(currentImplementation, /manifestRevision: `sha256:\$\{computeHash\(resolvedNode\.manifestRaw\)\}`/u);
  assert.match(currentImplementation, /ATLAS_PRODUCT_REVISION_SCOPES\.CURRENT_SCENE/u);
  assert.match(currentImplementation, /revisionBridgeSchemaVersion: revisionBridge\.schemaVersion/u);
  assert.match(currentImplementation, /projectRevisionId: revisionBridge\.projectRevisionId/u);

  assert.match(
    projectImplementation,
    /\{\s*projectId,\s*roots,\s*manifestPath,\s*manifest,\s*manifestRaw,?\s*\}/u,
  );
  assert.match(projectImplementation, /E_ATLAS_PRODUCT_MANIFEST_REVISION_SOURCE_INVALID/u);
  assert.match(projectImplementation, /const revisionScenesById = \{\}/u);
  assert.match(projectImplementation, /sourceBytes = await fs\.readFile\(guard\.payload\.path\)/u);
  assert.match(projectImplementation, /sceneRevision: `sha256:\$\{computeHash\(sourceBytes\)\}`/u);
  assert.match(projectImplementation, /manifestRevision: `sha256:\$\{computeHash\(manifestRaw\)\}`/u);
  assert.match(projectImplementation, /ATLAS_PRODUCT_REVISION_SCOPES\.WHOLE_PROJECT/u);
  assert.match(projectImplementation, /sceneRevision: revisionScenesById\[node\.nodeId\]\.sceneRevision/u);
  assert.match(projectImplementation, /revisionScope: revisionBridge\.revisionScope/u);
  assert.match(projectImplementation, /manifestRevision: revisionBridge\.manifestRevision/u);
});
