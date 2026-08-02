export const ATLAS_DESIGN_OS_SLOT_CATALOG_SCHEMA_VERSION = 'yalken.designOs.atlasSlotCatalog.v1';

export const ATLAS_DESIGN_OS_SLOT_CATALOG_V1 = Object.freeze([
  ['currentScene', 'surface.atlas.currentScene', 'query.atlasCurrentScene', 'rightRail.context.atlas', 'rightRail'],
  ['journey', 'surface.atlas.journey', 'query.atlasCurrentScene', 'rightRail.context.atlas.journey', 'rightRail'],
  ['manualMap', 'surface.manualMap.workbench', 'query.manualMapWorkbench', 'workspace.plan.manualMapWorkbench', 'planWorkspace'],
  ['projection', 'surface.atlas.projectionInspector', 'query.projectionInspector', 'rightRail.context.atlas.projectionInspector', 'rightRail'],
  ['overview', 'surface.atlas.overview', 'query.atlasOverview', 'rightRail.context.atlas.overview', 'rightRail'],
  ['entity', 'surface.atlas.entityDossier', 'query.atlasEntityDossier', 'rightRail.context.atlas.entityDossier', 'rightRail'],
  ['relation', 'surface.atlas.relationDossier', 'query.atlasRelationDossier', 'rightRail.context.atlas.relationDossier', 'rightRail'],
  ['matrices', 'surface.atlas.matrices', 'query.atlasMatrices', 'rightRail.context.atlas.matrices', 'rightRail'],
  ['reports', 'surface.atlas.reportsSavedQueries', 'query.atlasReportsSavedQueries', 'rightRail.context.atlas.reportsSavedQueries', 'rightRail'],
  ['diagnostics', 'surface.atlas.diagnosticsStageAcceptance', 'query.atlasDiagnosticsStageAcceptance', 'rightRail.context.atlas.diagnosticsStageAcceptance', 'rightRail'],
  ['heatmap', 'surface.atlas.heatmap', 'query.atlasHeatmap', 'rightRail.context.atlas.heatmap', 'rightRail'],
  ['temporal', 'surface.atlas.temporalLayout', 'query.atlasTemporalLayout', 'rightRail.context.atlas.temporalLayout', 'rightRail'],
  ['continuity', 'surface.atlas.continuityLedger', 'query.atlasContinuityLedgerSurface', 'rightRail.context.atlas.continuityLedger', 'rightRail'],
].map(([surfaceKey, surfaceId, providerId, slotId, hostKind]) => Object.freeze({
  schemaVersion: ATLAS_DESIGN_OS_SLOT_CATALOG_SCHEMA_VERSION,
  surfaceKey,
  surfaceId,
  providerId,
  slotId,
  hostKind,
})));
