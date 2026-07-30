const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildMatricesFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-matrices-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneCId = 'scene-c';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas matrices', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneAId, text: 'Anna met Mira while Sol watched.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-mira', name: 'Mira', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-sol', name: 'Sol', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-omar', name: 'Omar', entityKind: 'character' },
    },
  ]);
  assert.equal(built.ok, true);
  const state = JSON.parse(JSON.stringify(built.state));
  state.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Second',
    text: 'Anna and Omar found Mira.',
  };
  state.data.projects[projectId].scenes[sceneCId] = {
    id: sceneCId,
    title: 'Third',
    text: 'Sol warns Omar before Anna returns.',
  };
  state.data.projects[projectId].languageCode = 'en';
  return { derived, projectId, state };
}

test('E05 C04: Atlas matrices derive entity-scene and relation matrix packets with clipped list parity', async () => {
  const { derived, projectId, state } = await buildMatricesFixture();

  const result = derived.deriveAtlasMatrices({
    coreState: state,
    params: { projectId, rowLimit: 2, columnLimit: 2, listLimit: 3 },
    capabilitySnapshot: {
      platformId: 'node',
      capabilities: {
        atlasMatrices: true,
        atlasObservationAggregate: true,
        atlasTemporalContinuity: true,
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_MATRICES_SCHEMA_VERSION);
  assert.equal(result.value.surfaceManifest.schemaVersion, derived.ATLAS_MATRICES_SURFACE_MANIFEST_VERSION);
  assert.equal(result.value.surfaceManifest.providerId, 'query.atlasMatrices');
  assert.equal(result.value.surfaceManifest.slotId, 'rightRail.context.atlas.matrices');
  assert.equal(result.value.surfaceManifest.commandAuthority, 'none');
  assert.equal(result.value.authority.readModelOnly, true);
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(result.value.authority.storageMutation, false);
  assert.equal(result.value.authority.networkMutation, false);
  assert.equal(result.value.authority.heatmapColorSystem, false);
  assert.equal(result.value.entitySceneMatrix.schemaVersion, derived.ATLAS_ENTITY_SCENE_MATRIX_SCHEMA_VERSION);
  assert.equal(result.value.relationMatrix.schemaVersion, derived.ATLAS_RELATION_MATRIX_SCHEMA_VERSION);
  assert.equal(result.value.accessibilityContract.schemaVersion, derived.ATLAS_MATRIX_ACCESSIBILITY_CONTRACT_SCHEMA_VERSION);
  assert.equal(result.value.accessibilityContract.tableFirst, true);
  assert.equal(result.value.accessibilityContract.equivalentListParity, true);
  assert.deepEqual(result.value.accessibilityContract.keyboardNavigation.supportedKeys, ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

  assert.equal(result.value.entitySceneMatrix.rowAxis.totalCount, 4);
  assert.equal(result.value.entitySceneMatrix.rowAxis.visibleCount, 2);
  assert.equal(result.value.entitySceneMatrix.rowAxis.clipped, true);
  assert.equal(result.value.entitySceneMatrix.columnAxis.totalCount, 3);
  assert.equal(result.value.entitySceneMatrix.columnAxis.visibleCount, 2);
  assert.equal(result.value.entitySceneMatrix.columnAxis.clipped, true);
  assert.equal(result.value.entitySceneMatrix.rows.length, 2);
  assert.equal(result.value.entitySceneMatrix.rows[0].cells.length, 2);
  assert.ok(result.value.entitySceneMatrix.rows.some((row) => row.cells.some((cell) => cell.appearanceCount > 0 && cell.ariaLabel.includes('observations'))));

  assert.equal(result.value.relationMatrix.rowAxis.totalCount, 4);
  assert.equal(result.value.relationMatrix.rowAxis.visibleCount, 2);
  assert.equal(result.value.relationMatrix.rows.length, 2);
  assert.ok(result.value.relationMatrix.rows.some((row) => row.cells.some((cell) => cell.pairId && cell.occurrenceCount > 0)));

  assert.equal(result.value.listParity.entitySceneRows.length, 3);
  assert.ok(result.value.listParity.omittedEntitySceneRowCount > 0);
  assert.equal(result.value.listParity.relationRows.length, 3);
  assert.ok(result.value.listParity.omittedRelationRowCount > 0);
  assert.equal(result.value.largeProjectBudgetProof.rowLimit, 2);
  assert.equal(result.value.largeProjectBudgetProof.columnLimit, 2);
  assert.equal(result.value.largeProjectBudgetProof.listLimit, 3);
  assert.equal(result.value.largeProjectBudgetProof.clippingHonest, true);
  assert.match(result.value.summary.matrixHash, /^[0-9a-f]{64}$/u);
  assert.equal(result.value.evidence.lazyweb.query, 'matrix analytics dashboard');
  assert.equal(result.value.evidence.lazyweb.fullReport, 'unavailable');
});

test('E05 C04: Atlas matrices fail closed and export through derived barrels', async () => {
  const { derived, projectId, state } = await buildMatricesFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(typeof derived.deriveAtlasMatrices, 'function');
  assert.equal(typeof atlas.deriveAtlasMatrices, 'function');
  assert.equal(derived.ATLAS_MATRICES_VIEW_ID, 'derived.atlas.matrices.v1');
  assert.equal(atlas.ATLAS_MATRIX_ACCESSIBILITY_CONTRACT_SCHEMA_VERSION, 'derived.atlas.matrixAccessibilityContract.v1');

  const missingProjectId = derived.deriveAtlasMatrices({ coreState: state, params: {} });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_PROJECT_ID_REQUIRED');

  const disabled = derived.deriveAtlasMatrices({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasMatrices: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.details.capabilityId, 'atlas.matrices');

  const empty = derived.deriveAtlasMatrices({
    coreState: { version: 1, data: { projects: { [projectId]: { id: projectId, atlas: { schemaVersion: 'atlas.author.v1', entities: {} }, scenes: {} } } } },
    params: { projectId },
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.value.state, 'empty');
  assert.equal(empty.value.accessibilityContract.equivalentListParity, true);
});

test('E05 C04: Atlas matrices derived sources keep side-effect boundaries closed', () => {
  const sources = [
    'src/derived/atlas/deriveAtlasMatrices.mjs',
    'src/derived/atlas/atlasMatricesTypes.mjs',
  ].map((relativePath) => [path.basename(relativePath), fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')]);
  const forbiddenPatterns = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\bmkdir(?:Sync)?\s*\(/u,
    /\brename(?:Sync)?\s*\(/u,
    /\bunlink(?:Sync)?\s*\(/u,
    /\brm(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\bquerySelector\b/u,
    /\bdispatchEvent\b/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});

test('E05 C04: renderer and main wire matrix surface with keyboard parity and no mutation bypass', () => {
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  const editorSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');
  const cssSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');

  assert.match(mainSource, /const ATLAS_MATRICES_QUERY_ID = 'query\.atlasMatrices'/u);
  assert.match(mainSource, /loadAtlasMatricesModule/u);
  assert.match(mainSource, /handleWorkspaceAtlasMatricesQuery/u);
  assert.match(mainSource, /WORKSPACE_QUERY_BRIDGE_ALLOWED_QUERY_IDS[\s\S]*ATLAS_MATRICES_QUERY_ID/u);
  assert.doesNotMatch(mainSource, /handleWorkspaceAtlasMatricesQuery[\s\S]{0,2600}writeFileAtomic/u);

  assert.match(htmlSource, /data-atlas-matrices-host/u);
  assert.match(htmlSource, /data-atlas-matrices-provider="query\.atlasMatrices"/u);
  assert.match(editorSource, /const ATLAS_MATRICES_QUERY_ID = 'query\.atlasMatrices'/u);
  assert.match(editorSource, /refreshAtlasMatrices/u);
  assert.match(editorSource, /role', 'grid'/u);
  assert.match(editorSource, /role', 'gridcell'/u);
  assert.match(editorSource, /handleAtlasMatrixGridKeydown/u);
  assert.match(editorSource, /ArrowRight/u);
  assert.match(editorSource, /data-atlas-matrix-cell/u);
  assert.match(editorSource, /appendAtlasMatrixListRows/u);
  assert.doesNotMatch(editorSource, /ATLAS_MATRICES_QUERY_ID[\s\S]{0,1000}dispatchUiCommand/u);
  assert.doesNotMatch(editorSource, /handleAtlasMatrixGridKeydown[\s\S]{0,2600}invokePreloadUiCommandBridge/u);

  assert.match(cssSource, /\.right-rail-surface--atlas-matrices/u);
  assert.match(cssSource, /\.right-rail-atlas-matrix td:focus-visible/u);
  assert.match(cssSource, /font-variant-numeric: tabular-nums/u);
});
