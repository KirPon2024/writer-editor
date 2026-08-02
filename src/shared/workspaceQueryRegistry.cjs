const WORKSPACE_QUERY_IDS = Object.freeze({
  PROJECT_TREE: 'query.projectTree',
  PROJECT_LIBRARY: 'query.projectLibrary',
  SELECTED_SCENES_TXT_EXPORT_SCOPE: 'query.selectedScenesTxtExportScope',
  COLLAB_SCOPE_LOCAL: 'query.collabScopeLocal',
  REVIEW_SURFACE: 'query.reviewSurface',
  METADATA_INSPECTOR: 'query.metadataInspector',
  PROJECT_NOTES: 'query.projectNotes',
  PROJECT_SEARCH: 'query.projectSearch',
  SCENE_HISTORY: 'query.sceneHistory',
  STAGE10_PRODUCT_STATE: 'query.stage10ProductState',
  ATLAS_OVERVIEW: 'query.atlasOverview',
  ATLAS_ENTITY_DOSSIER: 'query.atlasEntityDossier',
  ATLAS_RELATION_DOSSIER: 'query.atlasRelationDossier',
  ATLAS_MATRICES: 'query.atlasMatrices',
  ATLAS_HEATMAP: 'query.atlasHeatmap',
  ATLAS_TEMPORAL_LAYOUT: 'query.atlasTemporalLayout',
  ATLAS_CONTINUITY_LEDGER_SURFACE: 'query.atlasContinuityLedgerSurface',
  ATLAS_REPORTS_SAVED_QUERIES: 'query.atlasReportsSavedQueries',
  ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE: 'query.atlasDiagnosticsStageAcceptance',
  ATLAS_CURRENT_SCENE: 'query.atlasCurrentScene',
  MANUAL_MAP_WORKBENCH: 'query.manualMapWorkbench',
  PROJECTION_INSPECTOR: 'query.projectionInspector',
});

const ATLAS_WORKSPACE_QUERY_IDS = Object.freeze([
  WORKSPACE_QUERY_IDS.ATLAS_OVERVIEW,
  WORKSPACE_QUERY_IDS.ATLAS_ENTITY_DOSSIER,
  WORKSPACE_QUERY_IDS.ATLAS_RELATION_DOSSIER,
  WORKSPACE_QUERY_IDS.ATLAS_MATRICES,
  WORKSPACE_QUERY_IDS.ATLAS_HEATMAP,
  WORKSPACE_QUERY_IDS.ATLAS_TEMPORAL_LAYOUT,
  WORKSPACE_QUERY_IDS.ATLAS_CONTINUITY_LEDGER_SURFACE,
  WORKSPACE_QUERY_IDS.ATLAS_REPORTS_SAVED_QUERIES,
  WORKSPACE_QUERY_IDS.ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE,
  WORKSPACE_QUERY_IDS.ATLAS_CURRENT_SCENE,
  WORKSPACE_QUERY_IDS.MANUAL_MAP_WORKBENCH,
  WORKSPACE_QUERY_IDS.PROJECTION_INSPECTOR,
]);

const WORKSPACE_QUERY_RECORDS = Object.freeze([
  Object.freeze({ id: WORKSPACE_QUERY_IDS.PROJECT_TREE, owner: 'main', projection: 'project-tree' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.PROJECT_LIBRARY, owner: 'main', projection: 'project-library' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.SELECTED_SCENES_TXT_EXPORT_SCOPE, owner: 'main', projection: 'selected-scenes-txt-export-scope' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.COLLAB_SCOPE_LOCAL, owner: 'main', projection: 'collab-scope-local' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.REVIEW_SURFACE, owner: 'main', projection: 'review-surface' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.METADATA_INSPECTOR, owner: 'main', projection: 'metadata-inspector' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.PROJECT_NOTES, owner: 'main', projection: 'project-notes' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.PROJECT_SEARCH, owner: 'main', projection: 'project-search' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.SCENE_HISTORY, owner: 'main', projection: 'scene-history' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.STAGE10_PRODUCT_STATE, owner: 'main', projection: 'stage10-product-state' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.ATLAS_OVERVIEW, owner: 'atlas', projection: 'overview' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.ATLAS_ENTITY_DOSSIER, owner: 'atlas', projection: 'entity' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.ATLAS_RELATION_DOSSIER, owner: 'atlas', projection: 'relation' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.ATLAS_MATRICES, owner: 'atlas', projection: 'matrices' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.ATLAS_HEATMAP, owner: 'atlas', projection: 'heatmap' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.ATLAS_TEMPORAL_LAYOUT, owner: 'atlas', projection: 'temporal' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.ATLAS_CONTINUITY_LEDGER_SURFACE, owner: 'atlas', projection: 'continuity' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.ATLAS_REPORTS_SAVED_QUERIES, owner: 'atlas', projection: 'reports' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE, owner: 'atlas', projection: 'diagnostics' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.ATLAS_CURRENT_SCENE, owner: 'atlas', projection: 'current-scene' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.MANUAL_MAP_WORKBENCH, owner: 'manualMap', projection: 'workbench' }),
  Object.freeze({ id: WORKSPACE_QUERY_IDS.PROJECTION_INSPECTOR, owner: 'projectionInspector', projection: 'plot-idea-meaning' }),
]);

const WORKSPACE_QUERY_ID_LIST = Object.freeze(WORKSPACE_QUERY_RECORDS.map((record) => record.id));
const WORKSPACE_QUERY_ID_SET = new Set(WORKSPACE_QUERY_ID_LIST);

const ATLAS_WORKSPACE_QUERY_SURFACES = Object.freeze({
  overview: WORKSPACE_QUERY_IDS.ATLAS_OVERVIEW,
  entity: WORKSPACE_QUERY_IDS.ATLAS_ENTITY_DOSSIER,
  relation: WORKSPACE_QUERY_IDS.ATLAS_RELATION_DOSSIER,
  matrices: WORKSPACE_QUERY_IDS.ATLAS_MATRICES,
  heatmap: WORKSPACE_QUERY_IDS.ATLAS_HEATMAP,
  temporal: WORKSPACE_QUERY_IDS.ATLAS_TEMPORAL_LAYOUT,
  continuity: WORKSPACE_QUERY_IDS.ATLAS_CONTINUITY_LEDGER_SURFACE,
  reports: WORKSPACE_QUERY_IDS.ATLAS_REPORTS_SAVED_QUERIES,
  diagnostics: WORKSPACE_QUERY_IDS.ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE,
  currentScene: WORKSPACE_QUERY_IDS.ATLAS_CURRENT_SCENE,
  manualMapWorkbench: WORKSPACE_QUERY_IDS.MANUAL_MAP_WORKBENCH,
  projectionInspector: WORKSPACE_QUERY_IDS.PROJECTION_INSPECTOR,
});

function isWorkspaceQueryIdAllowed(queryId) {
  return WORKSPACE_QUERY_ID_SET.has(queryId);
}

module.exports = Object.freeze({
  WORKSPACE_QUERY_IDS,
  WORKSPACE_QUERY_RECORDS,
  WORKSPACE_QUERY_ID_LIST,
  WORKSPACE_QUERY_ID_SET,
  ATLAS_WORKSPACE_QUERY_IDS,
  ATLAS_WORKSPACE_QUERY_SURFACES,
  isWorkspaceQueryIdAllowed,
});
