import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasObservationAggregate } from './deriveAtlasObservationAggregate.mjs';
import { deriveAtlasTemporalContinuity } from './deriveAtlasTemporalContinuity.mjs';
import { deriveAtlasEvidenceReattachmentInbox } from './deriveAtlasEvidenceReattachmentInbox.mjs';
import {
  ATLAS_ENTITY_DOSSIER_SCHEMA_VERSION,
  ATLAS_ENTITY_DOSSIER_SURFACE_MANIFEST_VERSION,
  ATLAS_ENTITY_EVIDENCE_LEDGER_SCHEMA_VERSION,
  sortAtlasEntityEvidenceRows,
  sortAtlasEntityRelationRows,
} from './atlasEntityDossierTypes.mjs';

export const ATLAS_ENTITY_DOSSIER_VIEW_ID = 'derived.atlas.entityDossier.v1';

const PROVIDER_ID = 'query.atlasEntityDossier';
const SURFACE_ID = 'surface.atlas.entityDossier';
const RIGHT_RAIL_SLOT_ID = 'rightRail.context.atlas.entityDossier';
const DEFAULT_LIMIT = 8;

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

function isAtlasEntityDossierCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.entityDossier'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.entityDossier'] === false) return false;
  if (capabilities.atlasEntityDossier === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.entityDossier === false) return false;
  return true;
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_ENTITY_DOSSIER_SURFACE_MANIFEST_VERSION,
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
      empty: 'ATLAS_ENTITY_DOSSIER_EMPTY',
      unavailable: 'ATLAS_ENTITY_DOSSIER_UNAVAILABLE',
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
    commandAuthority: 'none',
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    evidenceLedgerTruth: false,
    heavySurface: false,
  };
}

function emptySummary(reason = '') {
  return {
    observationCount: 0,
    activeObservationCount: 0,
    suppressedObservationCount: 0,
    sceneCount: 0,
    aliasCount: 0,
    relationCount: 0,
    evidenceRowCount: 0,
    sourceRecordEvidenceCount: 0,
    reviewRequiredEvidenceCount: 0,
    reattachedEvidenceCount: 0,
    currentEvidenceCount: 0,
    absenceIntervalCount: 0,
    dossierHash: '',
    invalidationKey: '',
    evidenceHealth: reason ? 'unavailable' : 'empty',
  };
}

function buildEvidenceLedger(rows, reason = '') {
  const safeRows = sortAtlasEntityEvidenceRows(rows);
  return {
    schemaVersion: ATLAS_ENTITY_EVIDENCE_LEDGER_SCHEMA_VERSION,
    state: reason ? 'unavailable' : safeRows.length > 0 ? 'ready' : 'empty',
    readOnly: true,
    commandAuthority: 'none',
    rows: safeRows,
  };
}

function buildEvidence({ dossierHash, sourceHashes }) {
  return {
    schemaVersion: 'derived.atlas.entityDossier.evidence.v1',
    sourceHashes,
    dossierHash,
    designAdvisory: {
      applied: true,
      source: 'design-receipts',
      runtimeMetadataIncluded: false,
      readinessToken: false,
    },
  };
}

function unavailable(projectId, entityId, reason, error = null) {
  return {
    schemaVersion: ATLAS_ENTITY_DOSSIER_SCHEMA_VERSION,
    state: 'unavailable',
    unavailableReason: reason,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    requestedEntityId: entityId,
    selectedEntityId: '',
    entity: null,
    aliases: [],
    summary: emptySummary(reason),
    relationRows: [],
    absenceIntervals: [],
    evidenceLedger: buildEvidenceLedger([], reason),
    evidence: buildEvidence({ dossierHash: '', sourceHashes: {} }),
    ...(error ? { error } : {}),
  };
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function getEntity(project, entityId) {
  const entities = isPlainObject(project?.atlas?.entities) ? project.atlas.entities : {};
  return isPlainObject(entities[entityId]) ? entities[entityId] : {};
}

function listAliases(entity) {
  const aliases = isPlainObject(entity?.aliases) ? entity.aliases : {};
  return Object.keys(aliases)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }))
    .map((aliasId) => {
      const alias = isPlainObject(aliases[aliasId]) ? aliases[aliasId] : {};
      return {
        aliasId,
        value: plainString(alias.value),
        scope: plainString(alias.scope) || 'project',
        sceneId: plainString(alias.sceneId),
      };
    });
}

function sourceHashes({ aggregate, temporal, inbox }) {
  return {
    aggregateHash: plainString(aggregate?.summary?.aggregateHash),
    temporalHash: plainString(temporal?.summary?.temporalHash),
    inboxHash: plainString(inbox?.summary?.inboxHash),
  };
}

function chooseEntityId({ requestedEntityId, aggregate, temporal }) {
  if (requestedEntityId) {
    const existsInAggregate = (Array.isArray(aggregate?.entities) ? aggregate.entities : [])
      .some((entity) => entity.entityId === requestedEntityId);
    if (existsInAggregate) return requestedEntityId;
  }
  const firstTemporal = (Array.isArray(temporal?.entityAppearances) ? temporal.entityAppearances : [])[0];
  if (firstTemporal && plainString(firstTemporal.entityId)) return plainString(firstTemporal.entityId);
  const firstAggregate = (Array.isArray(aggregate?.entities) ? aggregate.entities : [])[0];
  return firstAggregate && plainString(firstAggregate.entityId) ? plainString(firstAggregate.entityId) : '';
}

function buildEntityPacket(project, aggregate, temporalEntity, entityId, aliases) {
  const authorEntity = getEntity(project, entityId);
  const aggregateEntity = (Array.isArray(aggregate?.entities) ? aggregate.entities : [])
    .find((entity) => entity.entityId === entityId) || {};
  return {
    entityId,
    name: plainString(authorEntity.name) || plainString(temporalEntity?.name) || plainString(aggregateEntity.name) || entityId,
    entityKind: plainString(authorEntity.entityKind) || plainString(temporalEntity?.entityKind) || plainString(aggregateEntity.entityKind) || 'entity',
    mergeState: plainString(authorEntity.mergeState),
    mergedIntoEntityId: plainString(authorEntity.mergedIntoEntityId),
    aliasCount: aliases.length,
  };
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

function evidenceStateForSourceItem(item) {
  if (!item) return 'CURRENT';
  if (item.status === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
  if (item.status === 'REATTACHED') return 'REATTACHED';
  return 'CURRENT';
}

function observationLedgerRows(observations) {
  return observations.map((observation) => {
    const anchor = normalizeAnchor(observation.evidenceAnchor);
    return {
      ledgerRowId: `atlas-ledger-observation:${plainString(observation.observationId)}`,
      rowKind: 'observation',
      sourceRecordKind: '',
      sourceRecordId: '',
      observationId: plainString(observation.observationId),
      evidenceState: observation.suppressionState === 'SUPPRESSED' ? 'SUPPRESSED' : 'CURRENT',
      sceneId: plainString(observation.sceneId),
      entityId: plainString(observation.entityId),
      quote: anchor ? anchor.quote : plainString(observation.matchedText),
      startOffset: anchor ? anchor.startOffset : Number(observation.startOffset || 0),
      endOffset: anchor ? anchor.endOffset : Number(observation.endOffset || 0),
      evidenceAnchor: anchor,
      currentEvidenceAnchor: anchor,
      candidateCount: 0,
      reattachmentId: '',
    };
  });
}

function sourceRecordLedgerRows(inbox, entityId) {
  return (Array.isArray(inbox?.items) ? inbox.items : [])
    .filter((item) => plainString(item.entityId) === entityId)
    .map((item) => {
      const stale = normalizeAnchor(item.staleEvidenceAnchor);
      const current = normalizeAnchor(item.currentEvidenceAnchor);
      const displayAnchor = current || stale;
      return {
        ledgerRowId: `atlas-ledger-source:${plainString(item.sourceRecordKind)}:${plainString(item.sourceRecordId)}`,
        rowKind: 'sourceRecord',
        sourceRecordKind: plainString(item.sourceRecordKind),
        sourceRecordId: plainString(item.sourceRecordId),
        observationId: '',
        evidenceState: evidenceStateForSourceItem(item),
        sceneId: displayAnchor ? displayAnchor.sceneId : '',
        entityId,
        quote: displayAnchor ? displayAnchor.quote : '',
        startOffset: displayAnchor ? displayAnchor.startOffset : 0,
        endOffset: displayAnchor ? displayAnchor.endOffset : 0,
        evidenceAnchor: stale,
        currentEvidenceAnchor: current,
        candidateCount: Number(item.candidateCount || 0),
        reattachmentId: plainString(item.reattachmentId),
      };
    });
}

function buildRelationRows(temporal, entityId, limit) {
  const names = new Map((Array.isArray(temporal?.entityAppearances) ? temporal.entityAppearances : [])
    .map((entity) => [plainString(entity.entityId), plainString(entity.name) || plainString(entity.entityId)]));
  return sortAtlasEntityRelationRows((Array.isArray(temporal?.cooccurrences) ? temporal.cooccurrences : [])
    .filter((relation) => relation.leftEntityId === entityId || relation.rightEntityId === entityId)
    .map((relation) => {
      const otherEntityId = relation.leftEntityId === entityId ? relation.rightEntityId : relation.leftEntityId;
      return {
        pairId: plainString(relation.pairId),
        otherEntityId: plainString(otherEntityId),
        otherName: names.get(plainString(otherEntityId)) || plainString(otherEntityId),
        sceneCount: Number(relation.sceneCount || 0),
        occurrenceCount: Number(relation.occurrenceCount || 0),
        sceneIds: Array.isArray(relation.sceneIds) ? relation.sceneIds.filter((value) => typeof value === 'string') : [],
        evidenceAnchorIds: Array.isArray(relation.evidenceAnchorIds) ? relation.evidenceAnchorIds.filter((value) => typeof value === 'string') : [],
      };
    }))
    .slice(0, limit);
}

function buildDossier({ coreState, projectId, requestedEntityId, aggregate, temporal, inbox, limit, meta }) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError('E_ATLAS_PROJECT_NOT_FOUND', ATLAS_ENTITY_DOSSIER_VIEW_ID, 'PROJECT_NOT_FOUND', { projectId });
  }
  const entityId = chooseEntityId({ requestedEntityId, aggregate, temporal });
  const sourceHashBundle = sourceHashes({ aggregate, temporal, inbox });
  if (!entityId) {
    return {
      schemaVersion: ATLAS_ENTITY_DOSSIER_SCHEMA_VERSION,
      state: 'empty',
      unavailableReason: '',
      surfaceManifest: buildSurfaceManifest(),
      authority: buildAuthority(),
      projectId,
      requestedEntityId,
      selectedEntityId: '',
      entity: null,
      aliases: [],
      summary: emptySummary(),
      relationRows: [],
      absenceIntervals: [],
      evidenceLedger: buildEvidenceLedger([]),
      evidence: buildEvidence({ dossierHash: '', sourceHashes: sourceHashBundle }),
    };
  }
  const temporalEntity = (Array.isArray(temporal?.entityAppearances) ? temporal.entityAppearances : [])
    .find((entity) => entity.entityId === entityId) || null;
  const aliases = listAliases(getEntity(project, entityId));
  const observations = (Array.isArray(aggregate?.observations) ? aggregate.observations : [])
    .filter((observation) => observation.entityId === entityId);
  const sourceRows = sourceRecordLedgerRows(inbox, entityId);
  const relationRows = buildRelationRows(temporal, entityId, limit);
  const absenceIntervals = (Array.isArray(temporal?.absenceIntervals) ? temporal.absenceIntervals : [])
    .filter((interval) => interval.entityId === entityId)
    .slice(0, limit);
  const rows = sortAtlasEntityEvidenceRows([
    ...observationLedgerRows(observations),
    ...sourceRows,
  ]).slice(0, limit);
  const dossierHash = hashCanonicalValue({
    entityId,
    aliases,
    observations,
    sourceRows,
    relationRows,
    absenceIntervals,
    sourceHashBundle,
  });
  return {
    schemaVersion: ATLAS_ENTITY_DOSSIER_SCHEMA_VERSION,
    state: observations.length > 0 || sourceRows.length > 0 ? 'ready' : 'empty',
    unavailableReason: '',
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    requestedEntityId,
    selectedEntityId: entityId,
    entity: buildEntityPacket(project, aggregate, temporalEntity, entityId, aliases),
    aliases,
    summary: {
      observationCount: observations.length,
      activeObservationCount: observations.filter((observation) => observation.suppressionState !== 'SUPPRESSED').length,
      suppressedObservationCount: observations.filter((observation) => observation.suppressionState === 'SUPPRESSED').length,
      sceneCount: temporalEntity ? Number(temporalEntity.sceneCount || 0) : 0,
      aliasCount: aliases.length,
      relationCount: relationRows.length,
      evidenceRowCount: rows.length,
      sourceRecordEvidenceCount: sourceRows.length,
      reviewRequiredEvidenceCount: sourceRows.filter((row) => row.evidenceState === 'REVIEW_REQUIRED').length,
      reattachedEvidenceCount: sourceRows.filter((row) => row.evidenceState === 'REATTACHED').length,
      currentEvidenceCount: rows.filter((row) => row.evidenceState === 'CURRENT').length,
      absenceIntervalCount: absenceIntervals.length,
      dossierHash,
      invalidationKey: meta.invalidationKey,
      evidenceHealth: sourceRows.some((row) => row.evidenceState === 'REVIEW_REQUIRED') ? 'reviewRequired' : rows.length > 0 ? 'current' : 'empty',
    },
    relationRows,
    absenceIntervals,
    evidenceLedger: buildEvidenceLedger(rows),
    evidence: buildEvidence({ dossierHash, sourceHashes: sourceHashBundle }),
  };
}

export function deriveAtlasEntityDossier(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const requestedEntityId = normalizeString(input?.params?.entityId);
  const limit = normalizeLimit(input?.params?.limit);
  if (!projectId) {
    return {
      ok: false,
      error: { code: 'E_ATLAS_PROJECT_ID_REQUIRED', op: ATLAS_ENTITY_DOSSIER_VIEW_ID, reason: 'PROJECT_ID_REQUIRED' },
    };
  }
  if (!isAtlasEntityDossierCapabilityEnabled(input.capabilitySnapshot)) {
    return {
      ok: false,
      error: {
        code: 'E_CAPABILITY_DISABLED_FOR_COMMAND',
        op: ATLAS_ENTITY_DOSSIER_VIEW_ID,
        reason: 'ATLAS_ENTITY_DOSSIER_DISABLED',
        details: { capabilityId: 'atlas.entityDossier' },
      },
    };
  }

  return deriveView({
    viewId: ATLAS_ENTITY_DOSSIER_VIEW_ID,
    coreState: input.coreState,
    params: { ...input.params, projectId, entityId: requestedEntityId, limit },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      const aggregateResult = deriveAtlasObservationAggregate({
        coreState,
        params: { projectId: params.projectId, languageCode: params.languageCode },
        capabilitySnapshot,
      });
      if (!aggregateResult.ok) {
        return unavailable(params.projectId, params.entityId, aggregateResult.error?.reason || 'ATLAS_OBSERVATION_AGGREGATE_UNAVAILABLE', aggregateResult.error || null);
      }
      const temporalResult = deriveAtlasTemporalContinuity({
        coreState,
        params: { projectId: params.projectId },
        capabilitySnapshot,
      });
      if (!temporalResult.ok) {
        return unavailable(params.projectId, params.entityId, temporalResult.error?.reason || 'ATLAS_TEMPORAL_CONTINUITY_UNAVAILABLE', temporalResult.error || null);
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
        requestedEntityId: params.entityId,
        aggregate: aggregateResult.value,
        temporal: temporalResult.value,
        inbox,
        limit,
        meta,
      });
    },
  });
}
