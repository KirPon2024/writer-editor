import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasObservationAggregate } from './deriveAtlasObservationAggregate.mjs';
import {
  ATLAS_ABSENCE_INTERVAL_SCHEMA_VERSION,
  ATLAS_COOCCURRENCE_SCHEMA_VERSION,
  ATLAS_TEMPORAL_CONTINUITY_SCHEMA_VERSION,
  ATLAS_TEMPORAL_ENTITY_APPEARANCE_SCHEMA_VERSION,
  ATLAS_TEMPORAL_PARITY_PROOF_SCHEMA_VERSION,
  sortAtlasAbsenceIntervals,
  sortAtlasCooccurrences,
  sortAtlasEntityAppearances,
  sortAtlasTemporalSceneRefs,
} from './atlasTemporalTypes.mjs';

const VIEW_ID = 'derived.atlas.temporalContinuity.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function plainString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function sceneOrderFromProject(project) {
  const scenes = isPlainObject(project?.scenes) ? project.scenes : {};
  return Object.keys(scenes)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }))
    .map((sceneId, sceneOrdinal) => ({
      sceneId,
      sceneOrdinal,
      sceneTitle: plainString(scenes[sceneId]?.title) || sceneId,
    }));
}

function sceneOrdinalLookup(sceneOrder) {
  const bySceneId = new Map();
  for (const scene of sceneOrder) bySceneId.set(scene.sceneId, scene);
  return bySceneId;
}

function activeObservations(aggregate) {
  return (Array.isArray(aggregate?.observations) ? aggregate.observations : [])
    .filter((observation) => observation && observation.suppressionState !== 'SUPPRESSED');
}

function buildObservationScenePackets({ aggregate, sceneOrder }) {
  const byScene = new Map(sceneOrder.map((scene) => [scene.sceneId, {
    ...scene,
    observations: [],
  }]));
  for (const observation of activeObservations(aggregate)) {
    if (!byScene.has(observation.sceneId)) continue;
    byScene.get(observation.sceneId).observations.push(observation);
  }
  return sceneOrder.map((scene) => {
    const packet = byScene.get(scene.sceneId);
    return {
      sceneId: scene.sceneId,
      sceneOrdinal: scene.sceneOrdinal,
      sceneTitle: scene.sceneTitle,
      observations: [...packet.observations].sort((a, b) => {
        const entity = plainString(a.entityId).localeCompare(plainString(b.entityId), 'en', { sensitivity: 'variant' });
        if (entity !== 0) return entity;
        const start = Number(a.startOffset) - Number(b.startOffset);
        if (start !== 0) return start;
        return plainString(a.observationId).localeCompare(plainString(b.observationId), 'en', { sensitivity: 'variant' });
      }),
    };
  });
}

function observationRef(observation, scene) {
  return {
    sceneId: scene.sceneId,
    sceneOrdinal: scene.sceneOrdinal,
    observationId: plainString(observation.observationId),
    evidenceAnchorId: plainString(observation.evidenceAnchorId),
    startOffset: Number(observation.startOffset),
    endOffset: Number(observation.endOffset),
    matchedText: plainString(observation.matchedText),
  };
}

function buildEntityAppearances({ aggregate, scenePackets }) {
  const entityMeta = new Map((Array.isArray(aggregate.entities) ? aggregate.entities : [])
    .map((entity) => [entity.entityId, entity]));
  const byEntity = new Map();
  for (const packet of scenePackets) {
    for (const observation of packet.observations) {
      if (!byEntity.has(observation.entityId)) byEntity.set(observation.entityId, []);
      byEntity.get(observation.entityId).push(observationRef(observation, packet));
    }
  }

  return sortAtlasEntityAppearances([...byEntity.entries()].map(([entityId, refs]) => {
    const sceneRefs = sortAtlasTemporalSceneRefs(refs);
    const first = sceneRefs[0] || null;
    const last = sceneRefs[sceneRefs.length - 1] || null;
    const meta = entityMeta.get(entityId) || {};
    return {
      schemaVersion: ATLAS_TEMPORAL_ENTITY_APPEARANCE_SCHEMA_VERSION,
      entityId,
      name: plainString(meta.name) || entityId,
      entityKind: plainString(meta.entityKind) || 'entity',
      appearanceCount: sceneRefs.length,
      sceneCount: uniqueSorted(sceneRefs.map((ref) => ref.sceneId)).length,
      firstAppearance: first,
      lastAppearance: last,
      appearances: sceneRefs,
    };
  }));
}

function buildCooccurrences({ scenePackets }) {
  const pairs = new Map();
  for (const packet of scenePackets) {
    const entityIds = uniqueSorted(packet.observations.map((observation) => observation.entityId));
    for (let i = 0; i < entityIds.length; i += 1) {
      for (let j = i + 1; j < entityIds.length; j += 1) {
        const leftEntityId = entityIds[i];
        const rightEntityId = entityIds[j];
        const pairId = `atlas-cooccurrence:${hashCanonicalValue({ leftEntityId, rightEntityId })}`;
        if (!pairs.has(pairId)) {
          pairs.set(pairId, {
            schemaVersion: ATLAS_COOCCURRENCE_SCHEMA_VERSION,
            pairId,
            leftEntityId,
            rightEntityId,
            sceneRefs: [],
            evidenceAnchorIds: [],
          });
        }
        const item = pairs.get(pairId);
        const evidenceAnchorIds = uniqueSorted(packet.observations
          .filter((observation) => observation.entityId === leftEntityId || observation.entityId === rightEntityId)
          .map((observation) => observation.evidenceAnchorId));
        item.sceneRefs.push({
          sceneId: packet.sceneId,
          sceneOrdinal: packet.sceneOrdinal,
          evidenceAnchorIds,
        });
        item.evidenceAnchorIds.push(...evidenceAnchorIds);
      }
    }
  }
  return sortAtlasCooccurrences([...pairs.values()].map((item) => ({
    ...item,
    sceneRefs: sortAtlasTemporalSceneRefs(item.sceneRefs),
    sceneIds: uniqueSorted(item.sceneRefs.map((ref) => ref.sceneId)),
    sceneCount: uniqueSorted(item.sceneRefs.map((ref) => ref.sceneId)).length,
    occurrenceCount: item.sceneRefs.length,
    evidenceAnchorIds: uniqueSorted(item.evidenceAnchorIds),
  })));
}

function buildAbsenceIntervals({ entityAppearances, sceneOrder }) {
  const sceneByOrdinal = new Map(sceneOrder.map((scene) => [scene.sceneOrdinal, scene]));
  const intervals = [];
  for (const entity of entityAppearances) {
    const presentOrdinals = new Set(entity.appearances.map((ref) => ref.sceneOrdinal));
    const firstOrdinal = entity.firstAppearance ? entity.firstAppearance.sceneOrdinal : -1;
    const lastOrdinal = entity.lastAppearance ? entity.lastAppearance.sceneOrdinal : -1;
    if (firstOrdinal < 0 || lastOrdinal < 0 || lastOrdinal <= firstOrdinal) continue;

    let runStart = -1;
    let runEnd = -1;
    for (let ordinal = firstOrdinal + 1; ordinal < lastOrdinal; ordinal += 1) {
      if (presentOrdinals.has(ordinal)) {
        if (runStart >= 0) {
          intervals.push(buildInterval(entity.entityId, runStart, runEnd, sceneByOrdinal));
          runStart = -1;
          runEnd = -1;
        }
        continue;
      }
      if (runStart < 0) runStart = ordinal;
      runEnd = ordinal;
    }
    if (runStart >= 0) intervals.push(buildInterval(entity.entityId, runStart, runEnd, sceneByOrdinal));
  }
  return sortAtlasAbsenceIntervals(intervals);
}

function buildInterval(entityId, startOrdinal, endOrdinal, sceneByOrdinal) {
  const sceneRefs = [];
  for (let ordinal = startOrdinal; ordinal <= endOrdinal; ordinal += 1) {
    const scene = sceneByOrdinal.get(ordinal);
    if (scene) sceneRefs.push(scene);
  }
  return {
    schemaVersion: ATLAS_ABSENCE_INTERVAL_SCHEMA_VERSION,
    intervalId: `atlas-absence:${hashCanonicalValue({ entityId, startOrdinal, endOrdinal })}`,
    entityId,
    startSceneOrdinal: startOrdinal,
    endSceneOrdinal: endOrdinal,
    length: sceneRefs.length,
    sceneRefs: sortAtlasTemporalSceneRefs(sceneRefs),
  };
}

function buildTemporalModelFromPackets({ aggregate, sceneOrder, scenePackets, invalidationKey }) {
  const entityAppearances = buildEntityAppearances({ aggregate, scenePackets });
  const cooccurrences = buildCooccurrences({ scenePackets });
  const absenceIntervals = buildAbsenceIntervals({ entityAppearances, sceneOrder });
  const temporalHash = hashCanonicalValue({
    projectId: aggregate.projectId,
    sceneOrder,
    entityAppearances,
    cooccurrences,
    absenceIntervals,
    aggregateHash: aggregate.summary?.aggregateHash || '',
  });

  return {
    schemaVersion: ATLAS_TEMPORAL_CONTINUITY_SCHEMA_VERSION,
    state: entityAppearances.length > 0 ? 'ready' : 'empty',
    projectId: aggregate.projectId,
    authority: {
      sourceOfTruth: 'derived.atlas.observationAggregate.v1',
      readModelOnly: true,
      commandAuthority: 'none',
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
    },
    summary: {
      sceneCount: sceneOrder.length,
      activeObservationCount: activeObservations(aggregate).length,
      entityCount: entityAppearances.length,
      cooccurrencePairCount: cooccurrences.length,
      absenceIntervalCount: absenceIntervals.length,
      aggregateHash: aggregate.summary?.aggregateHash || '',
      temporalHash,
      invalidationKey,
    },
    sceneOrder,
    entityAppearances,
    cooccurrences,
    absenceIntervals,
  };
}

export function buildAtlasTemporalContinuityFromObservationAggregate({ aggregate, sceneOrder, invalidationKey = '' } = {}) {
  const normalizedSceneOrder = sortAtlasTemporalSceneRefs(sceneOrder);
  const scenePackets = buildObservationScenePackets({ aggregate, sceneOrder: normalizedSceneOrder });
  return buildTemporalModelFromPackets({
    aggregate,
    sceneOrder: normalizedSceneOrder,
    scenePackets,
    invalidationKey,
  });
}

export function buildAtlasTemporalContinuityIncrementally({ aggregate, sceneOrder, invalidationKey = '' } = {}) {
  const normalizedSceneOrder = sortAtlasTemporalSceneRefs(sceneOrder);
  const scenePackets = [];
  for (const packet of buildObservationScenePackets({ aggregate, sceneOrder: normalizedSceneOrder })) {
    scenePackets.push(packet);
  }
  return buildTemporalModelFromPackets({
    aggregate,
    sceneOrder: normalizedSceneOrder,
    scenePackets,
    invalidationKey,
  });
}

export function buildAtlasTemporalContinuityParityProof({ aggregate, sceneOrder, invalidationKey = '' } = {}) {
  const full = buildAtlasTemporalContinuityFromObservationAggregate({ aggregate, sceneOrder, invalidationKey });
  const incremental = buildAtlasTemporalContinuityIncrementally({ aggregate, sceneOrder, invalidationKey });
  return {
    schemaVersion: ATLAS_TEMPORAL_PARITY_PROOF_SCHEMA_VERSION,
    fullHash: full.summary.temporalHash,
    incrementalHash: incremental.summary.temporalHash,
    matches: full.summary.temporalHash === incremental.summary.temporalHash,
    sceneCount: full.summary.sceneCount,
    activeObservationCount: full.summary.activeObservationCount,
  };
}

function isAtlasTemporalCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.temporalContinuity'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.temporalContinuity'] === false) return false;
  if (capabilities.atlasTemporalContinuity === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.temporalContinuity === false) return false;
  return true;
}

export function deriveAtlasTemporalContinuity(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const languageCode = normalizeString(input?.params?.languageCode);
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
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isAtlasTemporalCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_TEMPORAL_CONTINUITY_DISABLED',
          { capabilityId: 'atlas.temporalContinuity' },
        );
      }
      const project = getProject(coreState, params.projectId);
      if (!project) {
        throw createDerivedError(
          'E_ATLAS_PROJECT_NOT_FOUND',
          VIEW_ID,
          'PROJECT_NOT_FOUND',
          { projectId: params.projectId },
        );
      }
      const aggregateResult = deriveAtlasObservationAggregate({
        coreState,
        params: { projectId: params.projectId, languageCode: params.languageCode },
        capabilitySnapshot,
      });
      if (!aggregateResult.ok) {
        throw createDerivedError(
          aggregateResult.error?.code || 'E_ATLAS_OBSERVATION_AGGREGATE_UNAVAILABLE',
          VIEW_ID,
          aggregateResult.error?.reason || 'ATLAS_OBSERVATION_AGGREGATE_UNAVAILABLE',
          aggregateResult.error?.details || {},
        );
      }
      const sceneOrder = sceneOrderFromProject(project);
      const model = buildAtlasTemporalContinuityFromObservationAggregate({
        aggregate: aggregateResult.value,
        sceneOrder,
        invalidationKey: meta.invalidationKey,
      });
      const parityProof = buildAtlasTemporalContinuityParityProof({
        aggregate: aggregateResult.value,
        sceneOrder,
        invalidationKey: meta.invalidationKey,
      });
      return {
        ...model,
        parityProof,
      };
    },
  });
}

export { VIEW_ID as ATLAS_TEMPORAL_CONTINUITY_VIEW_ID };
