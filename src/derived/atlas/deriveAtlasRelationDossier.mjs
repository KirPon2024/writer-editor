import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasObservationAggregate } from './deriveAtlasObservationAggregate.mjs';
import { deriveAtlasTemporalContinuity } from './deriveAtlasTemporalContinuity.mjs';
import { deriveAtlasEvidenceReattachmentInbox } from './deriveAtlasEvidenceReattachmentInbox.mjs';
import {
  ATLAS_RELATION_CONTEXTUAL_ACTIONS_SCHEMA_VERSION,
  ATLAS_RELATION_DOSSIER_SCHEMA_VERSION,
  ATLAS_RELATION_DOSSIER_SURFACE_MANIFEST_VERSION,
  ATLAS_RELATION_EVIDENCE_PACKET_SCHEMA_VERSION,
  sortAtlasRelationAbsenceRows,
  sortAtlasRelationEvidenceRows,
  sortAtlasRelationTimelineRows,
} from './atlasRelationDossierTypes.mjs';

export const ATLAS_RELATION_DOSSIER_VIEW_ID = 'derived.atlas.relationDossier.v1';

const PROVIDER_ID = 'query.atlasRelationDossier';
const SURFACE_ID = 'surface.atlas.relationDossier';
const RIGHT_RAIL_SLOT_ID = 'rightRail.context.atlas.relationDossier';
const DEFAULT_LIMIT = 8;

const ACTION_COMMAND_IDS = Object.freeze({
  suppressObservation: 'atlas.observation.suppress',
  reassignObservation: 'atlas.observation.reassign',
  reattachEvidence: 'atlas.evidence.reattach',
});

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
  return Math.min(number, 24);
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function isAtlasRelationDossierCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.relationDossier'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.relationDossier'] === false) return false;
  if (capabilities.atlasRelationDossier === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.relationDossier === false) return false;
  return true;
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_RELATION_DOSSIER_SURFACE_MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    host: 'rightRail',
    slotId: RIGHT_RAIL_SLOT_ID,
    contributionKind: 'readOnlyProjectionWithIntentActions',
    allowedStateClasses: ['PROJECT_STATE', 'DERIVED_STATE', 'TRANSIENT_STATE'],
    commandAuthority: 'CommandKernel',
    productMutation: false,
    storageAuthority: false,
    fallback: {
      empty: 'ATLAS_RELATION_DOSSIER_EMPTY',
      unavailable: 'ATLAS_RELATION_DOSSIER_UNAVAILABLE',
    },
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: [
      'derived.atlas.observationAggregate.v1',
      'derived.atlas.temporalContinuity.v1',
      'derived.atlas.evidenceReattachmentInbox.v1',
    ],
    readModelOnly: true,
    commandAuthority: 'CommandKernel',
    actionDispatch: 'intent-only',
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    relationTruthMutation: false,
    automaticRelationCreation: false,
    heavySurface: false,
  };
}

function emptySummary(reason = '') {
  return {
    sceneCount: 0,
    occurrenceCount: 0,
    evidenceRowCount: 0,
    leftEvidenceCount: 0,
    rightEvidenceCount: 0,
    reviewRequiredEvidenceCount: 0,
    absenceIntervalCount: 0,
    actionCount: 0,
    availableActionCount: 0,
    dossierHash: '',
    invalidationKey: '',
    evidenceHealth: reason ? 'unavailable' : 'empty',
  };
}

function buildEvidence({ dossierHash, sourceHashes }) {
  return {
    schemaVersion: 'derived.atlas.relationDossier.evidence.v1',
    sourceHashes,
    dossierHash,
    designAdvisory: {
      applied: true,
      source: 'design-receipts',
      runtimeMetadataIncluded: false,
      readinessToken: false,
      externalReportAvailable: false,
    },
  };
}

function unavailable(projectId, requested, reason, error = null) {
  return {
    schemaVersion: ATLAS_RELATION_DOSSIER_SCHEMA_VERSION,
    state: 'unavailable',
    unavailableReason: reason,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    requestedPairId: requested.pairId,
    requestedLeftEntityId: requested.leftEntityId,
    requestedRightEntityId: requested.rightEntityId,
    selectedPairId: '',
    relation: null,
    summary: emptySummary(reason),
    evidencePacket: buildEvidencePacket([], [], reason),
    timelineRows: [],
    absenceContext: [],
    contextualReviewActions: buildActionPacket([], reason),
    evidence: buildEvidence({ dossierHash: '', sourceHashes: {} }),
    ...(error ? { error } : {}),
  };
}

function sourceHashes({ aggregate, temporal, inbox }) {
  return {
    aggregateHash: plainString(aggregate?.summary?.aggregateHash),
    temporalHash: plainString(temporal?.summary?.temporalHash),
    inboxHash: plainString(inbox?.summary?.inboxHash),
  };
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function entityNames(temporal) {
  return new Map((Array.isArray(temporal?.entityAppearances) ? temporal.entityAppearances : [])
    .map((entity) => [plainString(entity.entityId), plainString(entity.name) || plainString(entity.entityId)]));
}

function matchesPair(relation, requested) {
  if (!relation) return false;
  if (requested.pairId && relation.pairId === requested.pairId) return true;
  if (!requested.leftEntityId || !requested.rightEntityId) return false;
  const requestedIds = [requested.leftEntityId, requested.rightEntityId].sort();
  const relationIds = [plainString(relation.leftEntityId), plainString(relation.rightEntityId)].sort();
  return requestedIds[0] === relationIds[0] && requestedIds[1] === relationIds[1];
}

function chooseRelation({ requested, temporal }) {
  const relations = Array.isArray(temporal?.cooccurrences) ? temporal.cooccurrences : [];
  const requestedRelation = relations.find((relation) => matchesPair(relation, requested));
  if (requestedRelation) return requestedRelation;
  return relations[0] || null;
}

function normalizeAnchor(anchor) {
  if (!isPlainObject(anchor)) return null;
  return {
    anchorId: plainString(anchor.anchorId),
    sceneId: plainString(anchor.sceneId),
    entityId: plainString(anchor.entityId),
    startOffset: Number(anchor.startOffset || 0),
    endOffset: Number(anchor.endOffset || 0),
    quote: plainString(anchor.quote),
    quoteHash: plainString(anchor.quoteHash),
    sceneTextHash: plainString(anchor.sceneTextHash),
  };
}

function observationRow(observation, side) {
  const anchor = normalizeAnchor(observation.evidenceAnchor);
  return {
    evidenceRowId: `atlas-relation-evidence:${plainString(observation.observationId)}`,
    rowKind: 'observation',
    side,
    observationId: plainString(observation.observationId),
    entityId: plainString(observation.entityId),
    sceneId: plainString(observation.sceneId),
    evidenceState: observation.suppressionState === 'SUPPRESSED' ? 'SUPPRESSED' : 'CURRENT',
    quote: anchor ? anchor.quote : plainString(observation.matchedText),
    startOffset: anchor ? anchor.startOffset : Number(observation.startOffset || 0),
    endOffset: anchor ? anchor.endOffset : Number(observation.endOffset || 0),
    evidenceAnchor: anchor,
  };
}

function buildEvidenceRows(aggregate, relation) {
  const sceneIds = new Set(Array.isArray(relation?.sceneIds) ? relation.sceneIds : []);
  const leftEntityId = plainString(relation?.leftEntityId);
  const rightEntityId = plainString(relation?.rightEntityId);
  return sortAtlasRelationEvidenceRows((Array.isArray(aggregate?.observations) ? aggregate.observations : [])
    .filter((observation) => sceneIds.has(observation.sceneId))
    .filter((observation) => observation.entityId === leftEntityId || observation.entityId === rightEntityId)
    .map((observation) => observationRow(observation, observation.entityId === leftEntityId ? 'left' : 'right')));
}

function sourceRecordRows(inbox, relation) {
  const entityIds = new Set([plainString(relation?.leftEntityId), plainString(relation?.rightEntityId)]);
  return (Array.isArray(inbox?.items) ? inbox.items : [])
    .filter((item) => entityIds.has(plainString(item.entityId)))
    .map((item) => {
      const stale = normalizeAnchor(item.staleEvidenceAnchor);
      const current = normalizeAnchor(item.currentEvidenceAnchor);
      const display = current || stale;
      return {
        evidenceRowId: `atlas-relation-source:${plainString(item.sourceRecordKind)}:${plainString(item.sourceRecordId)}`,
        rowKind: 'sourceRecord',
        side: item.entityId === relation.leftEntityId ? 'left' : 'right',
        sourceRecordKind: plainString(item.sourceRecordKind),
        sourceRecordId: plainString(item.sourceRecordId),
        entityId: plainString(item.entityId),
        sceneId: display ? display.sceneId : '',
        evidenceState: item.status === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : item.status === 'REATTACHED' ? 'REATTACHED' : 'CURRENT',
        quote: display ? display.quote : '',
        startOffset: display ? display.startOffset : 0,
        endOffset: display ? display.endOffset : 0,
        evidenceAnchor: stale,
        currentEvidenceAnchor: current,
        candidateCount: Number(item.candidateCount || 0),
      };
    });
}

function buildEvidencePacket(observationRows, sourceRows, reason = '') {
  const rows = sortAtlasRelationEvidenceRows([...observationRows, ...sourceRows]);
  return {
    schemaVersion: ATLAS_RELATION_EVIDENCE_PACKET_SCHEMA_VERSION,
    state: reason ? 'unavailable' : rows.length > 0 ? 'ready' : 'empty',
    readOnly: true,
    rows,
  };
}

function firstQuote(rows, entityId, sceneId) {
  const row = rows.find((item) => item.entityId === entityId && item.sceneId === sceneId && item.quote);
  return row ? row.quote : '';
}

function buildTimelineRows(relation, evidenceRows, limit) {
  const leftEntityId = plainString(relation.leftEntityId);
  const rightEntityId = plainString(relation.rightEntityId);
  return sortAtlasRelationTimelineRows((Array.isArray(relation.sceneRefs) ? relation.sceneRefs : [])
    .map((ref) => {
      const sceneRows = evidenceRows.filter((row) => row.sceneId === ref.sceneId && row.rowKind === 'observation');
      return {
        timelineRowId: `atlas-relation-timeline:${plainString(relation.pairId)}:${plainString(ref.sceneId)}`,
        sceneId: plainString(ref.sceneId),
        sceneOrdinal: Number(ref.sceneOrdinal || 0),
        leftObservationCount: sceneRows.filter((row) => row.entityId === leftEntityId).length,
        rightObservationCount: sceneRows.filter((row) => row.entityId === rightEntityId).length,
        leftQuote: firstQuote(sceneRows, leftEntityId, ref.sceneId),
        rightQuote: firstQuote(sceneRows, rightEntityId, ref.sceneId),
        evidenceAnchorIds: Array.isArray(ref.evidenceAnchorIds) ? ref.evidenceAnchorIds.filter((value) => typeof value === 'string') : [],
      };
    }))
    .slice(0, limit);
}

function buildAbsenceContext(temporal, relation, limit) {
  const entityIds = new Set([plainString(relation.leftEntityId), plainString(relation.rightEntityId)]);
  return sortAtlasRelationAbsenceRows((Array.isArray(temporal?.absenceIntervals) ? temporal.absenceIntervals : [])
    .filter((interval) => entityIds.has(plainString(interval.entityId)))
    .map((interval) => ({
      intervalId: plainString(interval.intervalId),
      entityId: plainString(interval.entityId),
      startSceneOrdinal: Number(interval.startSceneOrdinal || 0),
      endSceneOrdinal: Number(interval.endSceneOrdinal || 0),
      length: Number(interval.length || 0),
      sceneIds: Array.isArray(interval.sceneRefs) ? interval.sceneRefs.map((scene) => plainString(scene.sceneId)).filter(Boolean) : [],
    })))
    .slice(0, limit);
}

function buildActionIntent(action) {
  return {
    actionId: action.actionId,
    label: action.label,
    commandId: action.commandId,
    commandAuthority: 'CommandKernel',
    dispatchMode: 'intent-only',
    requiresExplicitUserIntent: true,
    availability: action.availability,
    unavailableReason: action.unavailableReason || '',
    payloadPreview: action.payloadPreview || {},
  };
}

function buildActionPacket(actions, reason = '') {
  return {
    schemaVersion: ATLAS_RELATION_CONTEXTUAL_ACTIONS_SCHEMA_VERSION,
    state: reason ? 'unavailable' : actions.length > 0 ? 'ready' : 'empty',
    commandAuthority: 'CommandKernel',
    directDispatch: false,
    actions,
  };
}

function buildContextualReviewActions({ relation, observationRows, sourceRows }) {
  const firstObservation = observationRows.find((row) => row.evidenceState === 'CURRENT') || null;
  const firstSource = sourceRows.find((row) => row.evidenceState === 'REVIEW_REQUIRED') || null;
  return buildActionPacket([
    buildActionIntent({
      actionId: 'atlas-relation-action:suppress-observation',
      label: 'Suppress evidence',
      commandId: ACTION_COMMAND_IDS.suppressObservation,
      availability: firstObservation ? 'available' : 'unavailable',
      unavailableReason: firstObservation ? '' : 'NO_CURRENT_OBSERVATION',
      payloadPreview: firstObservation ? {
        projectId: '',
        sceneId: firstObservation.sceneId,
        entityId: firstObservation.entityId,
        observationId: firstObservation.observationId,
        evidenceAnchor: firstObservation.evidenceAnchor,
        suppressionId: `atlas-relation-suppression:${hashCanonicalValue({
          sceneId: firstObservation.sceneId,
          entityId: firstObservation.entityId,
          observationId: firstObservation.observationId,
          anchorId: firstObservation.evidenceAnchor?.anchorId || '',
        })}`,
        reason: 'author-reviewed',
      } : {},
    }),
    buildActionIntent({
      actionId: 'atlas-relation-action:reassign-observation',
      label: 'Reassign evidence',
      commandId: ACTION_COMMAND_IDS.reassignObservation,
      availability: 'requiresTargetEntity',
      unavailableReason: 'TARGET_ENTITY_REQUIRED',
      payloadPreview: firstObservation ? {
        projectId: '',
        sceneId: firstObservation.sceneId,
        sourceEntityId: firstObservation.entityId,
        targetEntityId: '',
        observationId: firstObservation.observationId,
        evidenceAnchor: firstObservation.evidenceAnchor,
        reassignmentId: `atlas-relation-reassign:${hashCanonicalValue({
          sceneId: firstObservation.sceneId,
          sourceEntityId: firstObservation.entityId,
          observationId: firstObservation.observationId,
          anchorId: firstObservation.evidenceAnchor?.anchorId || '',
        })}`,
        reason: 'author-reviewed',
      } : {},
    }),
    buildActionIntent({
      actionId: 'atlas-relation-action:reattach-evidence',
      label: 'Reattach stale evidence',
      commandId: ACTION_COMMAND_IDS.reattachEvidence,
      availability: firstSource ? 'available' : 'unavailable',
      unavailableReason: firstSource ? '' : 'NO_STALE_SOURCE_RECORD',
      payloadPreview: firstSource ? {
        projectId: '',
        sourceRecordKind: firstSource.sourceRecordKind,
        sourceRecordId: firstSource.sourceRecordId,
        staleEvidenceAnchor: firstSource.evidenceAnchor,
        newEvidenceAnchor: firstSource.currentEvidenceAnchor || firstSource.evidenceAnchor,
        reattachmentId: `atlas-relation-reattach:${hashCanonicalValue({
          sourceRecordKind: firstSource.sourceRecordKind,
          sourceRecordId: firstSource.sourceRecordId,
          staleAnchorId: firstSource.evidenceAnchor?.anchorId || '',
          newAnchorId: (firstSource.currentEvidenceAnchor || firstSource.evidenceAnchor)?.anchorId || '',
        })}`,
        reason: 'author-reviewed',
      } : {},
    }),
  ]);
}

function buildRelationPacket(relation, names) {
  return {
    pairId: plainString(relation.pairId),
    leftEntityId: plainString(relation.leftEntityId),
    rightEntityId: plainString(relation.rightEntityId),
    leftName: names.get(plainString(relation.leftEntityId)) || plainString(relation.leftEntityId),
    rightName: names.get(plainString(relation.rightEntityId)) || plainString(relation.rightEntityId),
    sceneCount: Number(relation.sceneCount || 0),
    occurrenceCount: Number(relation.occurrenceCount || 0),
    sceneIds: Array.isArray(relation.sceneIds) ? relation.sceneIds.filter((value) => typeof value === 'string') : [],
    evidenceAnchorIds: Array.isArray(relation.evidenceAnchorIds) ? relation.evidenceAnchorIds.filter((value) => typeof value === 'string') : [],
  };
}

function buildDossier({ coreState, projectId, requested, aggregate, temporal, inbox, limit, meta }) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError('E_ATLAS_PROJECT_NOT_FOUND', ATLAS_RELATION_DOSSIER_VIEW_ID, 'PROJECT_NOT_FOUND', { projectId });
  }
  const relation = chooseRelation({ requested, temporal });
  const sourceHashBundle = sourceHashes({ aggregate, temporal, inbox });
  if (!relation) {
    return {
      schemaVersion: ATLAS_RELATION_DOSSIER_SCHEMA_VERSION,
      state: 'empty',
      unavailableReason: '',
      surfaceManifest: buildSurfaceManifest(),
      authority: buildAuthority(),
      projectId,
      requestedPairId: requested.pairId,
      requestedLeftEntityId: requested.leftEntityId,
      requestedRightEntityId: requested.rightEntityId,
      selectedPairId: '',
      relation: null,
      summary: emptySummary(),
      evidencePacket: buildEvidencePacket([], []),
      timelineRows: [],
      absenceContext: [],
      contextualReviewActions: buildActionPacket([]),
      evidence: buildEvidence({ dossierHash: '', sourceHashes: sourceHashBundle }),
    };
  }
  const names = entityNames(temporal);
  const relationPacket = buildRelationPacket(relation, names);
  const observationRows = buildEvidenceRows(aggregate, relation);
  const sourceRows = sourceRecordRows(inbox, relation);
  const evidencePacket = buildEvidencePacket(observationRows, sourceRows);
  const timelineRows = buildTimelineRows(relation, evidencePacket.rows, limit);
  const absenceContext = buildAbsenceContext(temporal, relation, limit);
  const contextualReviewActions = buildContextualReviewActions({ relation, observationRows, sourceRows });
  const dossierHash = hashCanonicalValue({
    relationPacket,
    evidenceRows: evidencePacket.rows,
    timelineRows,
    absenceContext,
    sourceHashBundle,
  });
  const reviewRequiredEvidenceCount = evidencePacket.rows.filter((row) => row.evidenceState === 'REVIEW_REQUIRED').length;
  const availableActionCount = contextualReviewActions.actions.filter((action) => action.availability === 'available').length;
  return {
    schemaVersion: ATLAS_RELATION_DOSSIER_SCHEMA_VERSION,
    state: evidencePacket.rows.length > 0 ? 'ready' : 'empty',
    unavailableReason: '',
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    requestedPairId: requested.pairId,
    requestedLeftEntityId: requested.leftEntityId,
    requestedRightEntityId: requested.rightEntityId,
    selectedPairId: relationPacket.pairId,
    relation: relationPacket,
    summary: {
      sceneCount: relationPacket.sceneCount,
      occurrenceCount: relationPacket.occurrenceCount,
      evidenceRowCount: evidencePacket.rows.length,
      leftEvidenceCount: evidencePacket.rows.filter((row) => row.side === 'left').length,
      rightEvidenceCount: evidencePacket.rows.filter((row) => row.side === 'right').length,
      reviewRequiredEvidenceCount,
      absenceIntervalCount: absenceContext.length,
      actionCount: contextualReviewActions.actions.length,
      availableActionCount,
      dossierHash,
      invalidationKey: meta.invalidationKey,
      evidenceHealth: reviewRequiredEvidenceCount > 0 ? 'reviewRequired' : evidencePacket.rows.length > 0 ? 'current' : 'empty',
    },
    evidencePacket,
    timelineRows,
    absenceContext,
    contextualReviewActions,
    evidence: buildEvidence({ dossierHash, sourceHashes: sourceHashBundle }),
  };
}

export function deriveAtlasRelationDossier(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const requested = {
    pairId: normalizeString(input?.params?.pairId),
    leftEntityId: normalizeString(input?.params?.leftEntityId),
    rightEntityId: normalizeString(input?.params?.rightEntityId),
  };
  const limit = normalizeLimit(input?.params?.limit);
  if (!projectId) {
    return {
      ok: false,
      error: { code: 'E_ATLAS_PROJECT_ID_REQUIRED', op: ATLAS_RELATION_DOSSIER_VIEW_ID, reason: 'PROJECT_ID_REQUIRED' },
    };
  }
  if (!isAtlasRelationDossierCapabilityEnabled(input.capabilitySnapshot)) {
    return {
      ok: false,
      error: {
        code: 'E_CAPABILITY_DISABLED_FOR_COMMAND',
        op: ATLAS_RELATION_DOSSIER_VIEW_ID,
        reason: 'ATLAS_RELATION_DOSSIER_DISABLED',
        details: { capabilityId: 'atlas.relationDossier' },
      },
    };
  }

  return deriveView({
    viewId: ATLAS_RELATION_DOSSIER_VIEW_ID,
    coreState: input.coreState,
    params: { ...input.params, projectId, ...requested, limit },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      const aggregateResult = deriveAtlasObservationAggregate({
        coreState,
        params: { projectId: params.projectId, languageCode: params.languageCode },
        capabilitySnapshot,
      });
      if (!aggregateResult.ok) {
        return unavailable(params.projectId, requested, aggregateResult.error?.reason || 'ATLAS_OBSERVATION_AGGREGATE_UNAVAILABLE', aggregateResult.error || null);
      }
      const temporalResult = deriveAtlasTemporalContinuity({
        coreState,
        params: { projectId: params.projectId },
        capabilitySnapshot,
      });
      if (!temporalResult.ok) {
        return unavailable(params.projectId, requested, temporalResult.error?.reason || 'ATLAS_TEMPORAL_CONTINUITY_UNAVAILABLE', temporalResult.error || null);
      }
      const inboxResult = deriveAtlasEvidenceReattachmentInbox({
        coreState,
        params: { projectId: params.projectId },
        capabilitySnapshot,
      });
      const inbox = inboxResult.ok ? inboxResult.value : { state: 'unavailable', items: [], summary: { inboxHash: '' } };
      return buildDossier({
        coreState,
        projectId: params.projectId,
        requested,
        aggregate: aggregateResult.value,
        temporal: temporalResult.value,
        inbox,
        limit,
        meta,
      });
    },
  });
}
