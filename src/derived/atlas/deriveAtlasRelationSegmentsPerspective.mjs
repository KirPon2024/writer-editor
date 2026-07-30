import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasObservationAggregate } from './deriveAtlasObservationAggregate.mjs';
import { deriveAtlasTemporalContinuity } from './deriveAtlasTemporalContinuity.mjs';
import { deriveAtlasSceneTemporalAnchors } from './deriveAtlasSceneTemporalAnchors.mjs';
import {
  ATLAS_RELATION_PERSPECTIVE_SCENE_SCHEMA_VERSION,
  ATLAS_RELATION_SEGMENTS_PERSPECTIVE_SCHEMA_VERSION,
  ATLAS_RELATION_SEGMENT_PARITY_PROOF_SCHEMA_VERSION,
  ATLAS_RELATION_SEGMENT_SCHEMA_VERSION,
  sortAtlasPerspectiveScenes,
  sortAtlasRelationSegments,
} from './atlasRelationSegmentTypes.mjs';

const VIEW_ID = 'derived.atlas.relationSegmentsPerspective.v1';

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
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.length > 0))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function isCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.relationSegmentsPerspective'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.relationSegmentsPerspective'] === false) return false;
  if (capabilities.atlasRelationSegmentsPerspective === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.relationSegmentsPerspective === false) return false;
  return true;
}

function buildAuthority() {
  return {
    sourceOfTruth: [
      'derived.atlas.observationAggregate.v1',
      'derived.atlas.temporalContinuity.v1',
      'derived.atlas.sceneTemporalAnchors.v1',
    ],
    readModelOnly: true,
    commandAuthority: 'none',
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    automaticRelationMutation: false,
    hiddenMutation: false,
  };
}

function emptyState(projectId, reason = '') {
  return {
    schemaVersion: ATLAS_RELATION_SEGMENTS_PERSPECTIVE_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    unavailableReason: reason,
    projectId,
    authority: buildAuthority(),
    summary: {
      relationCount: 0,
      segmentCount: 0,
      perspectiveSceneCount: 0,
      unknownTemporalSceneCount: 0,
      sourceHash: '',
      segmentHash: '',
      invalidationKey: '',
    },
    relationSegments: [],
    perspectiveScenes: [],
    parityProof: {
      schemaVersion: ATLAS_RELATION_SEGMENT_PARITY_PROOF_SCHEMA_VERSION,
      fullHash: '',
      incrementalHash: '',
      matches: true,
      segmentCount: 0,
    },
    evidence: buildEvidence({ segmentHash: '', sourceHashes: {} }),
  };
}

function buildEvidence({ segmentHash, sourceHashes }) {
  return {
    schemaVersion: 'derived.atlas.relationSegmentsPerspective.evidence.v1',
    sourceHashes,
    segmentHash,
    guarantees: {
      readOnly: true,
      evidenceBacked: true,
      unknownTimeFallback: true,
      fullIncrementalParity: true,
      noAutomaticRelationMutation: true,
    },
  };
}

function temporalAnchorByScene(sceneTemporalAnchors) {
  const rows = Array.isArray(sceneTemporalAnchors?.sceneTemporalAnchors) ? sceneTemporalAnchors.sceneTemporalAnchors : [];
  return new Map(rows.map((row) => [plainString(row.sceneId), row]));
}

function observationsByScene(aggregate) {
  const byScene = new Map();
  for (const observation of Array.isArray(aggregate?.observations) ? aggregate.observations : []) {
    if (observation.suppressionState === 'SUPPRESSED') continue;
    if (!byScene.has(observation.sceneId)) byScene.set(observation.sceneId, []);
    byScene.get(observation.sceneId).push(observation);
  }
  return byScene;
}

function buildPerspectiveScenes({ aggregate, sceneTemporalAnchors }) {
  const anchors = temporalAnchorByScene(sceneTemporalAnchors);
  const byScene = observationsByScene(aggregate);
  const sceneIds = uniqueSorted([
    ...Array.from(anchors.keys()),
    ...Array.from(byScene.keys()),
  ]);
  return sortAtlasPerspectiveScenes(sceneIds.map((sceneId) => {
    const anchor = anchors.get(sceneId) || {};
    const observations = byScene.get(sceneId) || [];
    const entityIds = uniqueSorted(observations.map((observation) => observation.entityId));
    const evidenceAnchorIds = uniqueSorted(observations.map((observation) => observation.evidenceAnchorId));
    const storyRange = isPlainObject(anchor.storyRange) ? anchor.storyRange : { rangeKind: 'unknown' };
    const narrativeRange = isPlainObject(anchor.narrativeRange) ? anchor.narrativeRange : { rangeKind: 'unknown' };
    const temporalState = storyRange.rangeKind === 'unknown' || narrativeRange.rangeKind === 'unknown' ? 'unknown' : 'anchored';
    return {
      schemaVersion: ATLAS_RELATION_PERSPECTIVE_SCENE_SCHEMA_VERSION,
      sceneId,
      sceneOrdinal: Number.isSafeInteger(Number(anchor.sceneOrdinal)) ? Number(anchor.sceneOrdinal) : 0,
      sceneTitle: normalizeString(anchor.sceneTitle) || sceneId,
      temporalState,
      storyRange,
      narrativeRange,
      entityIds,
      evidenceAnchorIds,
      observationCount: observations.length,
      perspectiveState: observations.length > 0 ? 'directEvidence' : 'noDirectEvidence',
    };
  }));
}

function relationSceneRefs(relation) {
  return [...(Array.isArray(relation?.sceneRefs) ? relation.sceneRefs : [])]
    .map((ref) => ({
      sceneId: plainString(ref.sceneId),
      sceneOrdinal: Number(ref.sceneOrdinal),
      evidenceAnchorIds: uniqueSorted(ref.evidenceAnchorIds),
    }))
    .filter((ref) => ref.sceneId && Number.isSafeInteger(ref.sceneOrdinal))
    .sort((a, b) => a.sceneOrdinal - b.sceneOrdinal || a.sceneId.localeCompare(b.sceneId, 'en', { sensitivity: 'variant' }));
}

function buildSegmentsForRelation({ relation, perspectiveByScene }) {
  const refs = relationSceneRefs(relation);
  const runs = [];
  let current = [];
  for (const ref of refs) {
    const previous = current[current.length - 1];
    if (!previous || ref.sceneOrdinal === previous.sceneOrdinal + 1) {
      current.push(ref);
      continue;
    }
    runs.push(current);
    current = [ref];
  }
  if (current.length > 0) runs.push(current);

  return runs.map((run) => {
    const first = run[0];
    const last = run[run.length - 1];
    const perspectiveScenes = sortAtlasPerspectiveScenes(run
      .map((ref) => perspectiveByScene.get(ref.sceneId))
      .filter(Boolean));
    const evidenceAnchorIds = uniqueSorted(run.flatMap((ref) => ref.evidenceAnchorIds));
    const unknownTemporalSceneIds = perspectiveScenes
      .filter((scene) => scene.temporalState === 'unknown')
      .map((scene) => scene.sceneId);
    return {
      schemaVersion: ATLAS_RELATION_SEGMENT_SCHEMA_VERSION,
      segmentId: `atlas-relation-segment:${hashCanonicalValue({
        pairId: relation.pairId,
        startSceneOrdinal: first.sceneOrdinal,
        endSceneOrdinal: last.sceneOrdinal,
      })}`,
      pairId: plainString(relation.pairId),
      leftEntityId: plainString(relation.leftEntityId),
      rightEntityId: plainString(relation.rightEntityId),
      startSceneOrdinal: first.sceneOrdinal,
      endSceneOrdinal: last.sceneOrdinal,
      sceneIds: run.map((ref) => ref.sceneId),
      evidenceAnchorIds,
      perspectiveScenes,
      unknownTemporalSceneIds,
      temporalState: unknownTemporalSceneIds.length > 0 ? 'unknownFallback' : 'anchored',
      evidenceState: evidenceAnchorIds.length > 0 ? 'evidenceBacked' : 'evidenceMissing',
    };
  });
}

function buildSegmentsFull({ temporal, perspectiveScenes }) {
  const perspectiveByScene = new Map(perspectiveScenes.map((scene) => [scene.sceneId, scene]));
  return sortAtlasRelationSegments((Array.isArray(temporal?.cooccurrences) ? temporal.cooccurrences : [])
    .flatMap((relation) => buildSegmentsForRelation({ relation, perspectiveByScene })));
}

function buildSegmentsIncremental({ temporal, perspectiveScenes }) {
  const perspectiveByScene = new Map();
  for (const scene of perspectiveScenes) perspectiveByScene.set(scene.sceneId, scene);
  const segments = [];
  for (const relation of Array.isArray(temporal?.cooccurrences) ? temporal.cooccurrences : []) {
    segments.push(...buildSegmentsForRelation({ relation, perspectiveByScene }));
  }
  return sortAtlasRelationSegments(segments);
}

function buildState({ projectId, aggregate, temporal, sceneTemporalAnchors, invalidationKey }) {
  const perspectiveScenes = buildPerspectiveScenes({ aggregate, sceneTemporalAnchors });
  const fullSegments = buildSegmentsFull({ temporal, perspectiveScenes });
  const incrementalSegments = buildSegmentsIncremental({ temporal, perspectiveScenes });
  const fullHash = hashCanonicalValue(fullSegments);
  const incrementalHash = hashCanonicalValue(incrementalSegments);
  const sourceHashes = {
    aggregateHash: plainString(aggregate?.summary?.aggregateHash),
    temporalHash: plainString(temporal?.summary?.temporalHash),
    anchorHash: plainString(sceneTemporalAnchors?.summary?.anchorHash),
  };
  const segmentHash = fullHash;
  const unknownTemporalSceneCount = perspectiveScenes.filter((scene) => scene.temporalState === 'unknown').length;
  return {
    schemaVersion: ATLAS_RELATION_SEGMENTS_PERSPECTIVE_SCHEMA_VERSION,
    state: fullSegments.length > 0 ? unknownTemporalSceneCount > 0 ? 'degraded' : 'ready' : 'empty',
    unavailableReason: '',
    projectId,
    authority: buildAuthority(),
    summary: {
      relationCount: Array.isArray(temporal?.cooccurrences) ? temporal.cooccurrences.length : 0,
      segmentCount: fullSegments.length,
      perspectiveSceneCount: perspectiveScenes.length,
      unknownTemporalSceneCount,
      sourceHash: hashCanonicalValue(sourceHashes),
      segmentHash,
      invalidationKey,
    },
    relationSegments: fullSegments,
    perspectiveScenes,
    parityProof: {
      schemaVersion: ATLAS_RELATION_SEGMENT_PARITY_PROOF_SCHEMA_VERSION,
      fullHash,
      incrementalHash,
      matches: fullHash === incrementalHash,
      segmentCount: fullSegments.length,
    },
    evidence: buildEvidence({ segmentHash, sourceHashes }),
  };
}

export function deriveAtlasRelationSegmentsPerspective(input = {}) {
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
      if (!isCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_RELATION_SEGMENTS_PERSPECTIVE_DISABLED',
          { capabilityId: 'atlas.relationSegmentsPerspective' },
        );
      }
      const project = getProject(coreState, params.projectId);
      if (!project) {
        throw createDerivedError('E_ATLAS_PROJECT_NOT_FOUND', VIEW_ID, 'PROJECT_NOT_FOUND', { projectId: params.projectId });
      }
      const aggregate = deriveAtlasObservationAggregate({ coreState, params: { projectId: params.projectId, languageCode: params.languageCode }, capabilitySnapshot });
      if (!aggregate.ok) throw createDerivedError(aggregate.error?.code, VIEW_ID, aggregate.error?.reason, aggregate.error?.details);
      const temporal = deriveAtlasTemporalContinuity({ coreState, params: { projectId: params.projectId, languageCode: params.languageCode }, capabilitySnapshot });
      if (!temporal.ok) throw createDerivedError(temporal.error?.code, VIEW_ID, temporal.error?.reason, temporal.error?.details);
      const anchors = deriveAtlasSceneTemporalAnchors({ coreState, params: { projectId: params.projectId }, capabilitySnapshot });
      if (!anchors.ok) throw createDerivedError(anchors.error?.code, VIEW_ID, anchors.error?.reason, anchors.error?.details);
      if ((Array.isArray(temporal.value?.cooccurrences) ? temporal.value.cooccurrences : []).length === 0) {
        return {
          ...emptyState(params.projectId),
          summary: {
            ...emptyState(params.projectId).summary,
            invalidationKey: meta.invalidationKey,
          },
        };
      }
      return buildState({
        projectId: params.projectId,
        aggregate: aggregate.value,
        temporal: temporal.value,
        sceneTemporalAnchors: anchors.value,
        invalidationKey: meta.invalidationKey,
      });
    },
  });
}

export { VIEW_ID as ATLAS_RELATION_SEGMENTS_PERSPECTIVE_VIEW_ID };
