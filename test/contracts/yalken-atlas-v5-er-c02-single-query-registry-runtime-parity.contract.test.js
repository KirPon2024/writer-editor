const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY_PATH = path.join(ROOT, 'src', 'shared', 'workspaceQueryRegistry.cjs');
const MAIN_PATH = path.join(ROOT, 'src', 'main.js');
const PRELOAD_PATH = path.join(ROOT, 'src', 'preload.js');
const EDITOR_PATH = path.join(ROOT, 'src', 'renderer', 'editor.js');
const HTML_PATH = path.join(ROOT, 'src', 'renderer', 'index.html');

const {
  WORKSPACE_QUERY_IDS,
  WORKSPACE_QUERY_ID_LIST,
  ATLAS_WORKSPACE_QUERY_IDS,
  ATLAS_WORKSPACE_QUERY_SURFACES,
  isWorkspaceQueryIdAllowed,
} = require(REGISTRY_PATH);

const ATLAS_SURFACE_CONTRACTS = Object.freeze([
  Object.freeze({
    surface: 'overview',
    registryKey: 'ATLAS_OVERVIEW',
    constName: 'ATLAS_OVERVIEW_QUERY_ID',
    handlerName: 'handleWorkspaceAtlasOverviewQuery',
    refreshName: 'refreshAtlasOverview',
    htmlProvider: 'data-atlas-overview-provider="query.atlasOverview"',
  }),
  Object.freeze({
    surface: 'entity',
    registryKey: 'ATLAS_ENTITY_DOSSIER',
    constName: 'ATLAS_ENTITY_DOSSIER_QUERY_ID',
    handlerName: 'handleWorkspaceAtlasEntityDossierQuery',
    refreshName: 'refreshAtlasEntityDossier',
    htmlProvider: 'data-atlas-entity-dossier-provider="query.atlasEntityDossier"',
  }),
  Object.freeze({
    surface: 'relation',
    registryKey: 'ATLAS_RELATION_DOSSIER',
    constName: 'ATLAS_RELATION_DOSSIER_QUERY_ID',
    handlerName: 'handleWorkspaceAtlasRelationDossierQuery',
    refreshName: 'refreshAtlasRelationDossier',
    htmlProvider: 'data-atlas-relation-dossier-provider="query.atlasRelationDossier"',
  }),
  Object.freeze({
    surface: 'matrices',
    registryKey: 'ATLAS_MATRICES',
    constName: 'ATLAS_MATRICES_QUERY_ID',
    handlerName: 'handleWorkspaceAtlasMatricesQuery',
    refreshName: 'refreshAtlasMatrices',
    htmlProvider: 'data-atlas-matrices-provider="query.atlasMatrices"',
  }),
  Object.freeze({
    surface: 'heatmap',
    registryKey: 'ATLAS_HEATMAP',
    constName: 'ATLAS_HEATMAP_QUERY_ID',
    handlerName: 'handleWorkspaceAtlasHeatmapQuery',
    refreshName: 'refreshAtlasHeatmap',
    htmlProvider: 'data-atlas-heatmap-provider="query.atlasHeatmap"',
  }),
  Object.freeze({
    surface: 'temporal',
    registryKey: 'ATLAS_TEMPORAL_LAYOUT',
    constName: 'ATLAS_TEMPORAL_LAYOUT_QUERY_ID',
    handlerName: 'handleWorkspaceAtlasTemporalLayoutQuery',
    refreshName: 'refreshAtlasTemporalLayout',
    htmlProvider: 'data-atlas-temporal-layout-provider="query.atlasTemporalLayout"',
  }),
  Object.freeze({
    surface: 'continuity',
    registryKey: 'ATLAS_CONTINUITY_LEDGER_SURFACE',
    constName: 'ATLAS_CONTINUITY_LEDGER_SURFACE_QUERY_ID',
    handlerName: 'handleWorkspaceAtlasContinuityLedgerSurfaceQuery',
    refreshName: 'refreshAtlasContinuityLedgerSurface',
    htmlProvider: 'data-atlas-continuity-ledger-provider="query.atlasContinuityLedgerSurface"',
  }),
  Object.freeze({
    surface: 'reports',
    registryKey: 'ATLAS_REPORTS_SAVED_QUERIES',
    constName: 'ATLAS_REPORTS_SAVED_QUERIES_QUERY_ID',
    handlerName: 'handleWorkspaceAtlasReportsSavedQueriesQuery',
    refreshName: 'refreshAtlasReportsSavedQueries',
    htmlProvider: 'data-atlas-reports-provider="query.atlasReportsSavedQueries"',
  }),
  Object.freeze({
    surface: 'diagnostics',
    registryKey: 'ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE',
    constName: 'ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_QUERY_ID',
    handlerName: 'handleWorkspaceAtlasDiagnosticsStageAcceptanceQuery',
    refreshName: 'refreshAtlasDiagnosticsStageAcceptance',
    htmlProvider: 'data-atlas-diagnostics-provider="query.atlasDiagnosticsStageAcceptance"',
  }),
  Object.freeze({
    surface: 'currentScene',
    registryKey: 'ATLAS_CURRENT_SCENE',
    constName: 'ATLAS_CURRENT_SCENE_QUERY_ID',
    handlerName: 'handleWorkspaceAtlasCurrentSceneQuery',
    refreshName: 'refreshAtlasCurrentScene',
    htmlProvider: 'data-atlas-current-scene-provider="query.atlasCurrentScene"',
  }),
]);

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('ER C02: shared workspace query registry is the single Atlas query source', () => {
  const expectedAtlasIds = ATLAS_SURFACE_CONTRACTS.map((contract) => WORKSPACE_QUERY_IDS[contract.registryKey]);

  assert.equal(new Set(WORKSPACE_QUERY_ID_LIST).size, WORKSPACE_QUERY_ID_LIST.length);
  assert.deepEqual(ATLAS_WORKSPACE_QUERY_IDS, expectedAtlasIds);
  assert.deepEqual(
    Object.fromEntries(ATLAS_SURFACE_CONTRACTS.map((contract) => [contract.surface, WORKSPACE_QUERY_IDS[contract.registryKey]])),
    ATLAS_WORKSPACE_QUERY_SURFACES,
  );
  for (const id of expectedAtlasIds) {
    assert.equal(isWorkspaceQueryIdAllowed(id), true, `${id} must be allowed by registry`);
  }
  assert.equal(isWorkspaceQueryIdAllowed('query.atlasUnknownFutureSurface'), false);
  assert.equal(isWorkspaceQueryIdAllowed('__proto__'), false);
});

test('ER C02: main, preload and renderer consume the same registry projection', () => {
  const mainSource = readText(MAIN_PATH);
  const preloadSource = readText(PRELOAD_PATH);
  const editorSource = readText(EDITOR_PATH);

  assert.match(mainSource, /require\('\.\/shared\/workspaceQueryRegistry\.cjs'\)/u);
  assert.match(preloadSource, /require\('\.\/shared\/workspaceQueryRegistry\.cjs'\)/u);
  assert.match(editorSource, /from '\.\.\/shared\/workspaceQueryRegistry\.cjs'/u);

  assert.match(mainSource, /const WORKSPACE_QUERY_BRIDGE_ALLOWED_QUERY_IDS = new Set\(WORKSPACE_QUERY_ID_LIST\);/u);
  assert.match(editorSource, /if \(!WORKSPACE_QUERY_ID_SET\.has\(queryId\)\) \{\s*return null;\s*\}/u);
  assert.doesNotMatch(editorSource, /queryId !== ATLAS_[A-Z_]+_QUERY_ID/u);
  assert.doesNotMatch(editorSource, /queryId !== 'query\.[^']+'/u);

  assert.match(preloadSource, /queryId: WORKSPACE_QUERY_IDS\.PROJECT_TREE/u);
  assert.match(preloadSource, /queryId: WORKSPACE_QUERY_IDS\.PROJECT_LIBRARY/u);
  assert.match(editorSource, /const PROJECT_TREE_QUERY_ID = WORKSPACE_QUERY_IDS\.PROJECT_TREE;/u);
  assert.match(editorSource, /const COLLAB_SCOPE_LOCAL_QUERY_ID = WORKSPACE_QUERY_IDS\.COLLAB_SCOPE_LOCAL;/u);
});

test('ER C02: all ten Atlas surfaces have main handlers and renderer bridge reachability', () => {
  const mainSource = readText(MAIN_PATH);
  const editorSource = readText(EDITOR_PATH);
  const htmlSource = readText(HTML_PATH);

  for (const contract of ATLAS_SURFACE_CONTRACTS) {
    assert.match(
      mainSource,
      new RegExp(`const ${contract.constName} = WORKSPACE_QUERY_IDS\\.${contract.registryKey}`, 'u'),
      `${contract.constName} must bind to registry in main`,
    );
    assert.match(
      mainSource,
      new RegExp(`\\[${contract.constName},\\s*${contract.handlerName}\\]`, 'u'),
      `${contract.constName} must be reachable in main handler map`,
    );
    assert.match(
      editorSource,
      new RegExp(`const ${contract.constName} = WORKSPACE_QUERY_IDS\\.${contract.registryKey}`, 'u'),
      `${contract.constName} must bind to registry in renderer`,
    );
    assert.match(
      editorSource,
      new RegExp(`function ${contract.refreshName}|async function ${contract.refreshName}`, 'u'),
      `${contract.refreshName} must exist`,
    );
    assert.match(
      editorSource,
      new RegExp(`invokeWorkspaceQueryBridge\\(${contract.constName}`, 'u'),
      `${contract.constName} must be fetched through workspace query bridge`,
    );
    assert.ok(htmlSource.includes(contract.htmlProvider), `${contract.surface} provider must stay declared in host HTML`);
  }
});

test('ER C02: unknown queries fail closed and stale Atlas unavailable gates cannot return false negatives', () => {
  const mainSource = readText(MAIN_PATH);
  const editorSource = readText(EDITOR_PATH);

  assert.match(mainSource, /return \{ ok: false, error: 'QUERY_ID_NOT_ALLOWED' \};/u);
  assert.match(mainSource, /return \{ ok: false, error: 'QUERY_HANDLER_UNAVAILABLE' \};/u);
  assert.doesNotMatch(editorSource, /ATLAS_MATRICES_QUERY_ID[\s\S]{0,600}return null/u);
  assert.doesNotMatch(editorSource, /ATLAS_HEATMAP_QUERY_ID[\s\S]{0,600}return null/u);
  assert.doesNotMatch(editorSource, /ATLAS_TEMPORAL_LAYOUT_QUERY_ID[\s\S]{0,600}return null/u);
  assert.doesNotMatch(editorSource, /ATLAS_CONTINUITY_LEDGER_SURFACE_QUERY_ID[\s\S]{0,600}return null/u);
  assert.doesNotMatch(editorSource, /ATLAS_REPORTS_SAVED_QUERIES_QUERY_ID[\s\S]{0,600}return null/u);
  assert.doesNotMatch(editorSource, /ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_QUERY_ID[\s\S]{0,600}return null/u);
});
