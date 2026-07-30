const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildHeatmapFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-heatmap-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneCId = 'scene-c';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas heatmap', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneAId, text: 'Anna met Mira while Sol watched Anna.' },
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
    text: 'Anna and Omar found Mira with Anna.',
  };
  state.data.projects[projectId].scenes[sceneCId] = {
    id: sceneCId,
    title: 'Third',
    text: 'Sol warns Omar before Anna returns.',
  };
  state.data.projects[projectId].languageCode = 'en';
  return { derived, projectId, state };
}

test('E05 C05: Atlas heatmap derives an explicit heavy tile packet with viewport budget proof', async () => {
  const { derived, projectId, state } = await buildHeatmapFixture();

  const result = derived.deriveAtlasHeatmap({
    coreState: state,
    params: { projectId, rowLimit: 3, columnLimit: 3, tileLimit: 4, listLimit: 3 },
    capabilitySnapshot: {
      platformId: 'node',
      capabilities: {
        atlasHeatmap: true,
        atlasMatrices: true,
        atlasObservationAggregate: true,
        atlasTemporalContinuity: true,
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_HEATMAP_SCHEMA_VERSION);
  assert.equal(result.value.surfaceManifest.schemaVersion, derived.ATLAS_HEATMAP_SURFACE_MANIFEST_VERSION);
  assert.equal(result.value.surfaceManifest.providerId, 'query.atlasHeatmap');
  assert.equal(result.value.surfaceManifest.slotId, 'rightRail.context.atlas.heatmap');
  assert.equal(result.value.surfaceManifest.heavySurface, true);
  assert.equal(result.value.surfaceManifest.explicitOpenRequired, true);
  assert.equal(result.value.authority.readModelOnly, true);
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(result.value.authority.storageMutation, false);
  assert.equal(result.value.authority.networkMutation, false);
  assert.equal(result.value.authority.backgroundDaemon, false);
  assert.equal(result.value.authority.typingHotPath, false);
  assert.equal(result.value.authority.heatmapColorSystem, false);

  assert.equal(result.value.tilePacket.schemaVersion, derived.ATLAS_HEATMAP_TILE_PACKET_SCHEMA_VERSION);
  assert.equal(result.value.tilePacket.mode, 'entityScene');
  assert.ok(result.value.tilePacket.rows.length > 0);
  assert.ok(result.value.tilePacket.columns.length > 0);
  assert.ok(result.value.tilePacket.tiles.length <= 4);
  assert.equal(result.value.tilePacket.rows.length * result.value.tilePacket.columns.length <= 4, true);
  assert.ok(result.value.tilePacket.tiles.some((tile) => tile.observationCount > 0 && tile.ariaLabel.includes('heatmap intensity')));

  assert.equal(result.value.legend.schemaVersion, derived.ATLAS_HEATMAP_LEGEND_SCHEMA_VERSION);
  assert.equal(result.value.legend.colorDependency, 'none');
  assert.equal(result.value.legend.semanticPaletteChanged, false);
  assert.deepEqual(result.value.legend.bands.map((band) => band.band), ['none', 'low', 'medium', 'high', 'max']);
  assert.equal(result.value.legend.degradedVisualFallback.available, true);
  assert.ok(result.value.degradedVisualFallback.length > 0);

  assert.equal(result.value.viewportBudgetProof.schemaVersion, derived.ATLAS_HEATMAP_VIEWPORT_BUDGET_PROOF_SCHEMA_VERSION);
  assert.equal(result.value.viewportBudgetProof.tileLimit, 4);
  assert.equal(result.value.viewportBudgetProof.virtualized, true);
  assert.equal(result.value.viewportBudgetProof.renderAllCells, false);
  assert.equal(result.value.viewportBudgetProof.queryOnlyOnExplicitOpen, true);
  assert.equal(result.value.viewportBudgetProof.typingHotPathNonblocking, true);
  assert.equal(result.value.viewportBudgetProof.refreshOnTyping, false);
  assert.equal(result.value.viewportBudgetProof.noBackgroundDaemon, true);
  assert.ok(result.value.viewportBudgetProof.omittedTotalTileCount > 0);
  assert.match(result.value.summary.heatmapHash, /^[0-9a-f]{64}$/u);
  assert.match(result.value.summary.matrixHash, /^[0-9a-f]{64}$/u);
  assert.equal(result.value.evidence.lazyweb.query, 'analytics heatmap dashboard');
  assert.equal(result.value.evidence.lazyweb.coverageStrength, 'strong');
  assert.equal(result.value.evidence.designRoute.leonardo, 'not-applicable-no-semantic-heatmap-color-change');
});

test('E05 C05: Atlas heatmap fails closed and exports through derived barrels', async () => {
  const { derived, projectId, state } = await buildHeatmapFixture();
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(typeof derived.deriveAtlasHeatmap, 'function');
  assert.equal(typeof atlas.deriveAtlasHeatmap, 'function');
  assert.equal(derived.ATLAS_HEATMAP_VIEW_ID, 'derived.atlas.heatmap.v1');
  assert.equal(atlas.ATLAS_HEATMAP_INTENSITY_BANDS.includes('max'), true);
  assert.equal(derived.normalizeAtlasHeatmapBand('invalid'), 'none');

  const missingProjectId = derived.deriveAtlasHeatmap({ coreState: state, params: {} });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_PROJECT_ID_REQUIRED');

  const disabled = derived.deriveAtlasHeatmap({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasHeatmap: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.details.capabilityId, 'atlas.heatmap');

  const empty = derived.deriveAtlasHeatmap({
    coreState: { version: 1, data: { projects: { [projectId]: { id: projectId, atlas: { schemaVersion: 'atlas.author.v1', entities: {} }, scenes: {} } } } },
    params: { projectId },
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.value.state, 'empty');
  assert.equal(empty.value.surfaceManifest.explicitOpenRequired, true);
  assert.equal(empty.value.viewportBudgetProof.typingHotPathNonblocking, true);
});

test('E05 C05: Atlas heatmap derived sources keep side-effect boundaries closed', () => {
  const sources = [
    'src/derived/atlas/deriveAtlasHeatmap.mjs',
    'src/derived/atlas/atlasHeatmapTypes.mjs',
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

test('E05 C05: renderer and main wire heatmap as explicit heavy surface only', () => {
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  const editorSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'editor.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');
  const cssSource = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'styles.css'), 'utf8');

  assert.match(mainSource, /const ATLAS_HEATMAP_QUERY_ID = 'query\.atlasHeatmap'/u);
  assert.match(mainSource, /loadAtlasHeatmapModule/u);
  assert.match(mainSource, /handleWorkspaceAtlasHeatmapQuery/u);
  assert.match(mainSource, /safePayload\.explicitOpen !== true[\s\S]{0,500}ATLAS_HEATMAP_EXPLICIT_OPEN_REQUIRED/u);
  assert.match(mainSource, /WORKSPACE_QUERY_BRIDGE_ALLOWED_QUERY_IDS[\s\S]*ATLAS_HEATMAP_QUERY_ID/u);
  assert.doesNotMatch(mainSource, /handleWorkspaceAtlasHeatmapQuery[\s\S]{0,3200}writeFileAtomic/u);

  assert.match(htmlSource, /data-atlas-heatmap-shell[\s\S]{0,80}hidden/u);
  assert.match(htmlSource, /data-atlas-heatmap-host/u);
  assert.match(htmlSource, /data-atlas-heatmap-provider="query\.atlasHeatmap"/u);

  assert.match(editorSource, /const ATLAS_HEATMAP_QUERY_ID = 'query\.atlasHeatmap'/u);
  assert.match(editorSource, /dataset\.atlasHeatmapOpen = 'true'/u);
  assert.match(editorSource, /function openAtlasHeatmapSurface/u);
  assert.match(editorSource, /async function refreshAtlasHeatmap/u);
  assert.match(editorSource, /if \(atlasHeatmapExplicitOpen !== true\) return/u);
  assert.match(editorSource, /explicitOpen: atlasHeatmapExplicitOpen === true/u);
  assert.match(editorSource, /renderAtlasHeatmapState\(\);[\s\S]{0,80}refreshAtlasCurrentScene/u);
  assert.doesNotMatch(editorSource, /applyRightTab[\s\S]{0,700}refreshAtlasHeatmap/u);
  assert.doesNotMatch(editorSource, /PROJECT_APPLY_TEXT_EDIT[\s\S]{0,1200}refreshAtlasHeatmap/u);
  assert.doesNotMatch(editorSource, /ATLAS_HEATMAP_QUERY_ID[\s\S]{0,1000}dispatchUiCommand/u);

  assert.match(cssSource, /\.right-rail-surface--atlas-heatmap/u);
  assert.match(cssSource, /data-atlas-heatmap-band="max"/u);
  assert.match(cssSource, /\.right-rail-atlas-heatmap-legend/u);
});
