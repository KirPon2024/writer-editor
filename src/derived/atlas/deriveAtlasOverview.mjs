import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasObservationAggregate } from './deriveAtlasObservationAggregate.mjs';
import { deriveAtlasTemporalContinuity } from './deriveAtlasTemporalContinuity.mjs';
import { deriveAtlasLocalGraph } from './deriveAtlasLocalGraph.mjs';
import {
  ATLAS_OVERVIEW_SCHEMA_VERSION,
  ATLAS_OVERVIEW_SURFACE_MANIFEST_VERSION,
  sortAtlasOverviewEntities,
  sortAtlasOverviewRelations,
  sortAtlasOverviewSceneCoverage,
} from './atlasOverviewTypes.mjs';

const VIEW_ID = 'derived.atlas.overview.v1';
const PROVIDER_ID = 'query.atlasOverview';
const SURFACE_ID = 'surface.atlas.overview';
const RIGHT_RAIL_SLOT_ID = 'rightRail.context.atlas.overview';
const DEFAULT_LIMIT = 5;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function plainString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return DEFAULT_LIMIT;
  return Math.min(number, 20);
}

function isAtlasOverviewCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.overview'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.overview'] === false) return false;
  if (capabilities.atlasOverview === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.overview === false) return false;
  return true;
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_OVERVIEW_SURFACE_MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    host: 'rightRail',
    slotId: RIGHT_RAIL_SLOT_ID,
    contributionKind: 'readOnlyProjection',
    allowedStateClasses: ['PROJECT_STATE', 'DERIVED_STATE', 'TRANSIENT_STATE'],
    commandAuthority: 'none',
    productMutation: false,
    storageAuthority: false,
    fallback: {
      empty: 'ATLAS_OVERVIEW_EMPTY',
      unavailable: 'ATLAS_OVERVIEW_UNAVAILABLE',
    },
  };
}

function unavailable(projectId, reason, error = null) {
  return {
    schemaVersion: ATLAS_OVERVIEW_SCHEMA_VERSION,
    state: 'unavailable',
    unavailableReason: reason,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: emptySummary(),
    progressiveDisclosure: buildProgressiveDisclosure({ state: 'unavailable' }),
    topEntities: [],
    topRelations: [],
    sceneCoverage: [],
    graphPreview: emptyGraphPreview(),
    degradedCapabilities: reason ? [{ code: reason, detail: reason }] : [],
    evidence: buildEvidence({ overviewHash: '', sourceHashes: {} }),
    ...(error ? { error } : {}),
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: [
      'derived.atlas.observationAggregate.v1',
      'derived.atlas.temporalContinuity.v1',
      'derived.atlas.localGraph.v1',
    ],
    readModelOnly: true,
    commandAuthority: 'none',
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    heavySurface: false,
  };
}

function emptySummary() {
  return {
    sceneCount: 0,
    entityCount: 0,
    observationCount: 0,
    activeObservationCount: 0,
    evidenceAnchorCount: 0,
    cooccurrencePairCount: 0,
    absenceIntervalCount: 0,
    graphNodeCount: 0,
    graphEdgeCount: 0,
    graphClusterCount: 0,
    omittedGraphNodeCount: 0,
    omittedGraphEdgeCount: 0,
    evidenceHealth: 'empty',
    overviewHash: '',
    invalidationKey: '',
  };
}

function emptyGraphPreview() {
  return {
    state: 'empty',
    nodeCount: 0,
    edgeCount: 0,
    clusterCount: 0,
    omittedNodeCount: 0,
    omittedEdgeCount: 0,
    clusters: [],
  };
}

function buildProgressiveDisclosure({ state }) {
  return {
    schemaVersion: 'derived.atlas.overview.progressiveDisclosure.v1',
    entry: {
      label: 'Atlas',
      state,
      opensHeavySurface: false,
      commandId: '',
    },
    bands: [
      {
        bandId: 'atlas-overview-health',
        label: 'Health',
        slotId: RIGHT_RAIL_SLOT_ID,
        startsExpanded: true,
        commandId: '',
      },
      {
        bandId: 'atlas-overview-entities',
        label: 'Entities',
        slotId: RIGHT_RAIL_SLOT_ID,
        startsExpanded: false,
        commandId: '',
      },
      {
        bandId: 'atlas-overview-relations',
        label: 'Relations',
        slotId: RIGHT_RAIL_SLOT_ID,
        startsExpanded: false,
        commandId: '',
      },
      {
        bandId: 'atlas-overview-graph',
        label: 'Graph',
        slotId: RIGHT_RAIL_SLOT_ID,
        startsExpanded: false,
        commandId: '',
      },
    ],
  };
}

function buildEvidence({ overviewHash, sourceHashes }) {
  return {
    schemaVersion: 'derived.atlas.overview.evidence.v1',
    sourceHashes,
    overviewHash,
    designAdvisory: {
      applied: true,
      source: 'design-receipts',
      runtimeMetadataIncluded: false,
      readinessToken: false,
    },
  };
}

function entityNameLookup(temporal) {
  return new Map((Array.isArray(temporal?.entityAppearances) ? temporal.entityAppearances : [])
    .map((entity) => [plainString(entity.entityId), plainString(entity.name) || plainString(entity.entityId)]));
}

function buildTopEntities(temporal, limit) {
  return sortAtlasOverviewEntities((Array.isArray(temporal?.entityAppearances) ? temporal.entityAppearances : [])
    .map((entity) => ({
      entityId: plainString(entity.entityId),
      name: plainString(entity.name) || plainString(entity.entityId),
      entityKind: plainString(entity.entityKind) || 'entity',
      appearanceCount: Number(entity.appearanceCount || 0),
      sceneCount: Number(entity.sceneCount || 0),
      firstSceneId: plainString(entity.firstAppearance?.sceneId),
      lastSceneId: plainString(entity.lastAppearance?.sceneId),
    })))
    .slice(0, limit);
}

function buildTopRelations(temporal, limit) {
  const names = entityNameLookup(temporal);
  return sortAtlasOverviewRelations((Array.isArray(temporal?.cooccurrences) ? temporal.cooccurrences : [])
    .map((relation) => ({
      pairId: plainString(relation.pairId),
      leftEntityId: plainString(relation.leftEntityId),
      rightEntityId: plainString(relation.rightEntityId),
      leftName: names.get(plainString(relation.leftEntityId)) || plainString(relation.leftEntityId),
      rightName: names.get(plainString(relation.rightEntityId)) || plainString(relation.rightEntityId),
      sceneCount: Number(relation.sceneCount || 0),
      occurrenceCount: Number(relation.occurrenceCount || 0),
      sceneIds: Array.isArray(relation.sceneIds) ? relation.sceneIds.filter((value) => typeof value === 'string') : [],
    })))
    .slice(0, limit);
}

function buildSceneCoverage(temporal, aggregate, limit) {
  const byScene = new Map();
  for (const observation of (Array.isArray(aggregate?.observations) ? aggregate.observations : [])) {
    const sceneId = plainString(observation.sceneId);
    if (!sceneId) continue;
    if (!byScene.has(sceneId)) byScene.set(sceneId, { observationCount: 0, entityIds: new Set(), evidenceAnchorIds: new Set() });
    const item = byScene.get(sceneId);
    item.observationCount += 1;
    if (plainString(observation.entityId)) item.entityIds.add(plainString(observation.entityId));
    if (plainString(observation.evidenceAnchorId)) item.evidenceAnchorIds.add(plainString(observation.evidenceAnchorId));
  }
  return sortAtlasOverviewSceneCoverage((Array.isArray(temporal?.sceneOrder) ? temporal.sceneOrder : [])
    .map((scene) => {
      const packet = byScene.get(plainString(scene.sceneId)) || { observationCount: 0, entityIds: new Set(), evidenceAnchorIds: new Set() };
      return {
        sceneId: plainString(scene.sceneId),
        sceneOrdinal: Number(scene.sceneOrdinal || 0),
        sceneTitle: plainString(scene.sceneTitle) || plainString(scene.sceneId),
        observationCount: packet.observationCount,
        entityCount: packet.entityIds.size,
        evidenceAnchorCount: packet.evidenceAnchorIds.size,
      };
    }))
    .slice(0, limit);
}

function buildGraphPreview(localGraph, limit) {
  const clusters = (Array.isArray(localGraph?.clusters) ? localGraph.clusters : [])
    .slice(0, limit)
    .map((cluster) => ({
      clusterId: plainString(cluster.clusterId),
      ordinal: Number(cluster.ordinal || 0),
      clusterKind: plainString(cluster.clusterKind),
      nodeCount: Number(cluster.nodeCount || 0),
      edgeCount: Number(cluster.edgeCount || 0),
    }));
  return {
    state: plainString(localGraph?.state) || 'empty',
    nodeCount: Number(localGraph?.summary?.nodeCount || 0),
    edgeCount: Number(localGraph?.summary?.edgeCount || 0),
    clusterCount: Number(localGraph?.summary?.clusterCount || 0),
    omittedNodeCount: Number(localGraph?.summary?.omittedNodeCount || 0),
    omittedEdgeCount: Number(localGraph?.summary?.omittedEdgeCount || 0),
    clusters,
  };
}

function buildDegradedCapabilities({ aggregate, temporal, localGraph }) {
  const degraded = [];
  if (aggregate?.summary?.everyObservationHasEvidence !== true && Number(aggregate?.summary?.observationCount || 0) > 0) {
    degraded.push({ code: 'ATLAS_EVIDENCE_INCOMPLETE', detail: 'Observation evidence is incomplete' });
  }
  if (plainString(temporal?.state) === 'empty') {
    degraded.push({ code: 'ATLAS_TEMPORAL_EMPTY', detail: 'Temporal continuity has no active appearances' });
  }
  if (Number(localGraph?.summary?.omittedNodeCount || 0) > 0 || Number(localGraph?.summary?.omittedEdgeCount || 0) > 0) {
    degraded.push({ code: 'ATLAS_GRAPH_CLIPPED', detail: 'Local graph preview is clipped by the overview budget' });
  }
  return degraded;
}

function buildOverview({ aggregate, temporal, localGraph, projectId, limit, invalidationKey }) {
  const topEntities = buildTopEntities(temporal, limit);
  const topRelations = buildTopRelations(temporal, limit);
  const sceneCoverage = buildSceneCoverage(temporal, aggregate, limit);
  const graphPreview = buildGraphPreview(localGraph, limit);
  const degradedCapabilities = buildDegradedCapabilities({ aggregate, temporal, localGraph });
  const overviewHash = hashCanonicalValue({
    projectId,
    aggregateHash: aggregate.summary?.aggregateHash || '',
    temporalHash: temporal.summary?.temporalHash || '',
    graphHash: localGraph.summary?.graphHash || '',
    topEntities,
    topRelations,
    sceneCoverage,
    graphPreview,
    degradedCapabilities,
  });
  const evidenceHealth = Number(aggregate.summary?.observationCount || 0) < 1
    ? 'empty'
    : (degradedCapabilities.length > 0 ? 'degraded' : 'ready');

  return {
    schemaVersion: ATLAS_OVERVIEW_SCHEMA_VERSION,
    state: Number(aggregate.summary?.observationCount || 0) > 0 ? 'ready' : 'empty',
    unavailableReason: '',
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      sceneCount: Number(temporal.summary?.sceneCount || 0),
      entityCount: Number(aggregate.summary?.entityCount || 0),
      observationCount: Number(aggregate.summary?.observationCount || 0),
      activeObservationCount: Number(aggregate.summary?.activeObservationCount || 0),
      evidenceAnchorCount: Number(aggregate.summary?.evidenceAnchorCount || 0),
      cooccurrencePairCount: Number(temporal.summary?.cooccurrencePairCount || 0),
      absenceIntervalCount: Number(temporal.summary?.absenceIntervalCount || 0),
      graphNodeCount: Number(localGraph.summary?.nodeCount || 0),
      graphEdgeCount: Number(localGraph.summary?.edgeCount || 0),
      graphClusterCount: Number(localGraph.summary?.clusterCount || 0),
      omittedGraphNodeCount: Number(localGraph.summary?.omittedNodeCount || 0),
      omittedGraphEdgeCount: Number(localGraph.summary?.omittedEdgeCount || 0),
      evidenceHealth,
      overviewHash,
      invalidationKey,
    },
    progressiveDisclosure: buildProgressiveDisclosure({ state: evidenceHealth }),
    topEntities,
    topRelations,
    sceneCoverage,
    graphPreview,
    degradedCapabilities,
    evidence: buildEvidence({
      overviewHash,
      sourceHashes: {
        aggregateHash: aggregate.summary?.aggregateHash || '',
        temporalHash: temporal.summary?.temporalHash || '',
        graphHash: localGraph.summary?.graphHash || '',
      },
    }),
  };
}

export function deriveAtlasOverview(input = {}) {
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
    params: {
      ...input.params,
      projectId,
      languageCode,
      limit,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isAtlasOverviewCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_OVERVIEW_DISABLED',
          { capabilityId: 'atlas.overview' },
        );
      }
      const aggregate = deriveAtlasObservationAggregate({
        coreState,
        params: { projectId: params.projectId, languageCode: params.languageCode },
        capabilitySnapshot,
      });
      if (!aggregate.ok) {
        return unavailable(params.projectId, aggregate.error?.reason || 'ATLAS_OBSERVATION_AGGREGATE_UNAVAILABLE', aggregate.error || null);
      }
      const temporal = deriveAtlasTemporalContinuity({
        coreState,
        params: { projectId: params.projectId, languageCode: params.languageCode },
        capabilitySnapshot,
      });
      if (!temporal.ok) {
        return unavailable(params.projectId, temporal.error?.reason || 'ATLAS_TEMPORAL_CONTINUITY_UNAVAILABLE', temporal.error || null);
      }
      const localGraph = deriveAtlasLocalGraph({
        coreState,
        params: {
          projectId: params.projectId,
          languageCode: params.languageCode,
          limits: { maxNodes: 96, maxEdges: 192 },
        },
        capabilitySnapshot,
      });
      if (!localGraph.ok) {
        return unavailable(params.projectId, localGraph.error?.reason || 'ATLAS_LOCAL_GRAPH_UNAVAILABLE', localGraph.error || null);
      }
      return buildOverview({
        aggregate: aggregate.value,
        temporal: temporal.value,
        localGraph: localGraph.value,
        projectId: params.projectId,
        limit: params.limit,
        invalidationKey: meta.invalidationKey,
      });
    },
  });
}

export { VIEW_ID as ATLAS_OVERVIEW_VIEW_ID };
