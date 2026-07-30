import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasOverview } from './deriveAtlasOverview.mjs';
import { deriveAtlasMatrices } from './deriveAtlasMatrices.mjs';
import { deriveAtlasHeatmap } from './deriveAtlasHeatmap.mjs';
import {
  ATLAS_LOCAL_REPORT_PACKET_SCHEMA_VERSION,
  ATLAS_REPORT_EXPORT_SAFE_SUMMARY_SCHEMA_VERSION,
  ATLAS_REPORTS_SAVED_QUERIES_SCHEMA_VERSION,
  ATLAS_REPORTS_SURFACE_MANIFEST_VERSION,
  ATLAS_SAVED_QUERY_READBACK_SCHEMA_VERSION,
  sortAtlasSavedQueryReadbacks,
} from './atlasReportsTypes.mjs';

const VIEW_ID = 'derived.atlas.reportsSavedQueries.v1';
const PROVIDER_ID = 'query.atlasReportsSavedQueries';
const SURFACE_ID = 'surface.atlas.reportsSavedQueries';
const RIGHT_RAIL_SLOT_ID = 'rightRail.context.atlas.reportsSavedQueries';
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return DEFAULT_LIMIT;
  return Math.min(number, MAX_LIMIT);
}

function isAtlasReportsCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.reportsSavedQueries'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.reportsSavedQueries'] === false) return false;
  if (capabilities.atlasReportsSavedQueries === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.reportsSavedQueries === false) return false;
  return true;
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_REPORTS_SURFACE_MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    host: 'rightRail',
    slotId: RIGHT_RAIL_SLOT_ID,
    contributionKind: 'readOnlyProjectionWithCommandBoundary',
    allowedStateClasses: ['PROJECT_STATE', 'DERIVED_STATE'],
    commandAuthority: 'CommandKernel',
    commandIds: ['atlas.savedQuery.save'],
    productMutation: false,
    storageAuthority: false,
    fallback: {
      empty: 'ATLAS_REPORTS_EMPTY',
      unavailable: 'ATLAS_REPORTS_UNAVAILABLE',
    },
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: [
      'atlas.author.v1.savedQueries',
      'derived.atlas.overview.v1',
      'derived.atlas.matrices.v1',
      'derived.atlas.heatmap.v1',
    ],
    readModelOnly: true,
    commandAuthority: 'CommandKernel',
    commandIds: ['atlas.savedQuery.save'],
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    cloudSync: false,
    accountSync: false,
    hiddenMutation: false,
  };
}

function emptyReportsState(projectId, reason = '') {
  return {
    schemaVersion: ATLAS_REPORTS_SAVED_QUERIES_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    unavailableReason: reason,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      reportCount: 0,
      savedQueryCount: 0,
      staleSavedQueryCount: 0,
      exportSafeRowCount: 0,
      reportHash: '',
      sourceHash: '',
      invalidationKey: '',
    },
    localReportPacket: emptyLocalReportPacket(),
    savedQueries: [],
    exportSafeSummary: emptyExportSafeSummary(),
    evidence: buildEvidence({ reportHash: '', sourceHash: '' }),
  };
}

function emptyLocalReportPacket() {
  return {
    schemaVersion: ATLAS_LOCAL_REPORT_PACKET_SCHEMA_VERSION,
    state: 'empty',
    sections: [],
  };
}

function emptyExportSafeSummary() {
  return {
    schemaVersion: ATLAS_REPORT_EXPORT_SAFE_SUMMARY_SCHEMA_VERSION,
    rows: [],
    pathless: true,
    containsPrivateData: false,
  };
}

function buildEvidence({ reportHash = '', sourceHash = '' } = {}) {
  return {
    schemaVersion: 'derived.atlas.reportsSavedQueries.evidence.v1',
    reportHash,
    sourceHash,
    lazyweb: {
      applied: true,
      query: 'saved reports dashboard',
      coverageStrength: 'strong',
      topSimilarity: 0.683,
      referenceCompanies: ['freshdesk', 'docusign', 'attio', 'google-analytics', 'dock', 'mixpanel', 'intercom', 'steep'],
      fullReport: 'unavailable',
      fullReportUnavailableReason: 'LAZYWEB_CREATE_OBJECTIVE_REDIRECTED_TO_DEEP_RESEARCH_FLOW',
    },
  };
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function normalizeSavedQueryFilter(input) {
  const source = isPlainObject(input) ? input : {};
  return {
    entityIds: Array.isArray(source.entityIds) ? source.entityIds.filter((value) => typeof value === 'string').sort() : [],
    sceneIds: Array.isArray(source.sceneIds) ? source.sceneIds.filter((value) => typeof value === 'string').sort() : [],
    relationPairIds: Array.isArray(source.relationPairIds) ? source.relationPairIds.filter((value) => typeof value === 'string').sort() : [],
    queryText: normalizeString(source.queryText),
  };
}

function buildLocalReportPacket({ overview, matrices, heatmap }) {
  const sections = [
    {
      id: 'atlas-overview',
      label: 'Overview',
      metrics: {
        entities: Number(overview.summary?.entityCount || 0),
        scenes: Number(overview.summary?.sceneCount || 0),
        observations: Number(overview.summary?.observationCount || 0),
        relations: Number(overview.summary?.cooccurrencePairCount || 0),
      },
    },
    {
      id: 'atlas-matrices',
      label: 'Matrices',
      metrics: {
        entitySceneCells: Number(matrices.summary?.entitySceneCellCount || 0),
        relationCells: Number(matrices.summary?.relationCellCount || 0),
        clippedCells: Number(matrices.summary?.omittedEntitySceneCellCount || 0) + Number(matrices.summary?.omittedRelationCellCount || 0),
      },
    },
    {
      id: 'atlas-heatmap',
      label: 'Heatmap',
      metrics: {
        renderedTiles: Number(heatmap.summary?.renderedTileCount || 0),
        omittedTiles: Number(heatmap.summary?.omittedTileCount || 0),
        maxObservationCount: Number(heatmap.summary?.maxObservationCount || 0),
      },
    },
  ];
  const sourceHash = hashCanonicalValue({
    overviewHash: overview.summary?.overviewHash || '',
    matrixHash: matrices.summary?.matrixHash || '',
    heatmapHash: heatmap.summary?.heatmapHash || '',
    sections,
  });
  return {
    schemaVersion: ATLAS_LOCAL_REPORT_PACKET_SCHEMA_VERSION,
    state: overview.state === 'empty' ? 'empty' : 'ready',
    sourceHash,
    sections,
  };
}

function buildSavedQueryReadbacks(project, currentSourceHash, limit) {
  const savedQueries = isPlainObject(project?.atlas?.savedQueries) ? project.atlas.savedQueries : {};
  return sortAtlasSavedQueryReadbacks(Object.values(savedQueries)
    .filter(isPlainObject)
    .map((query) => {
      const sourceHash = normalizeString(query.sourceHash);
      return {
        schemaVersion: ATLAS_SAVED_QUERY_READBACK_SCHEMA_VERSION,
        id: normalizeString(query.id),
        name: normalizeString(query.name) || normalizeString(query.id) || 'Saved query',
        reportType: normalizeString(query.reportType) || 'overview',
        filter: normalizeSavedQueryFilter(query.filter),
        sourceHash,
        currentSourceHash,
        stale: Boolean(sourceHash && currentSourceHash && sourceHash !== currentSourceHash),
        createdByCommandSeq: Number.isInteger(query.createdByCommandSeq) ? query.createdByCommandSeq : 0,
        updatedByCommandSeq: Number.isInteger(query.updatedByCommandSeq) ? query.updatedByCommandSeq : 0,
      };
    }))
    .slice(0, limit);
}

function buildExportSafeSummary(reportPacket, savedQueries) {
  const reportRows = reportPacket.sections.map((section) => ({
    kind: 'reportSection',
    id: section.id,
    label: section.label,
    summary: Object.entries(section.metrics).map(([key, value]) => `${key}:${value}`).join(', '),
  }));
  const queryRows = savedQueries.map((query) => ({
    kind: 'savedQuery',
    id: query.id,
    label: query.name,
    summary: `${query.reportType}${query.stale ? ':stale' : ':current'}`,
  }));
  return {
    schemaVersion: ATLAS_REPORT_EXPORT_SAFE_SUMMARY_SCHEMA_VERSION,
    rows: [...reportRows, ...queryRows],
    pathless: true,
    containsPrivateData: false,
  };
}

function buildReports({ project, overview, matrices, heatmap, limit, invalidationKey }) {
  const localReportPacket = buildLocalReportPacket({ overview, matrices, heatmap });
  const savedQueries = buildSavedQueryReadbacks(project, localReportPacket.sourceHash, limit);
  const exportSafeSummary = buildExportSafeSummary(localReportPacket, savedQueries);
  const reportHash = hashCanonicalValue({ localReportPacket, savedQueries, exportSafeSummary });
  return {
    schemaVersion: ATLAS_REPORTS_SAVED_QUERIES_SCHEMA_VERSION,
    state: localReportPacket.state === 'empty' && savedQueries.length < 1 ? 'empty' : 'ready',
    unavailableReason: '',
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId: project.id || '',
    summary: {
      reportCount: localReportPacket.sections.length,
      savedQueryCount: savedQueries.length,
      staleSavedQueryCount: savedQueries.filter((query) => query.stale).length,
      exportSafeRowCount: exportSafeSummary.rows.length,
      reportHash,
      sourceHash: localReportPacket.sourceHash,
      invalidationKey,
    },
    localReportPacket,
    savedQueries,
    exportSafeSummary,
    evidence: buildEvidence({ reportHash, sourceHash: localReportPacket.sourceHash }),
  };
}

export function deriveAtlasReportsSavedQueries(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const languageCode = normalizeString(input?.params?.languageCode);
  const limit = normalizeLimit(input?.params?.limit);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_PROJECT_ID_REQUIRED',
        op: VIEW_ID,
        reason: 'PROJECT_ID_REQUIRED',
      },
    };
  }
  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params: { ...input.params, projectId, languageCode, limit },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isAtlasReportsCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_REPORTS_SAVED_QUERIES_DISABLED',
          { capabilityId: 'atlas.reportsSavedQueries' },
        );
      }
      const project = getProject(coreState, params.projectId);
      if (!project) return emptyReportsState(params.projectId, 'ATLAS_PROJECT_NOT_FOUND');
      const overview = deriveAtlasOverview({
        coreState,
        params: { projectId: params.projectId, languageCode: params.languageCode, limit: 5 },
        capabilitySnapshot,
      });
      if (!overview.ok) throw createDerivedError(overview.error?.code || 'E_ATLAS_OVERVIEW_UNAVAILABLE', VIEW_ID, overview.error?.reason || 'ATLAS_OVERVIEW_UNAVAILABLE', overview.error?.details || {});
      const matrices = deriveAtlasMatrices({
        coreState,
        params: { projectId: params.projectId, languageCode: params.languageCode, rowLimit: 6, columnLimit: 6, listLimit: 12 },
        capabilitySnapshot,
      });
      if (!matrices.ok) throw createDerivedError(matrices.error?.code || 'E_ATLAS_MATRICES_UNAVAILABLE', VIEW_ID, matrices.error?.reason || 'ATLAS_MATRICES_UNAVAILABLE', matrices.error?.details || {});
      const heatmap = deriveAtlasHeatmap({
        coreState,
        params: { projectId: params.projectId, languageCode: params.languageCode, rowLimit: 6, columnLimit: 6, tileLimit: 36, listLimit: 12 },
        capabilitySnapshot,
      });
      if (!heatmap.ok) throw createDerivedError(heatmap.error?.code || 'E_ATLAS_HEATMAP_UNAVAILABLE', VIEW_ID, heatmap.error?.reason || 'ATLAS_HEATMAP_UNAVAILABLE', heatmap.error?.details || {});
      return buildReports({
        project,
        overview: overview.value,
        matrices: matrices.value,
        heatmap: heatmap.value,
        limit: params.limit,
        invalidationKey: meta.invalidationKey,
      });
    },
  });
}

export { VIEW_ID as ATLAS_REPORTS_SAVED_QUERIES_VIEW_ID };
