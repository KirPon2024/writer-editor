import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_CONTINUITY_FACT_LEDGERS_SCHEMA_VERSION,
  ATLAS_CONTINUITY_FACT_LEDGERS_SURFACE_MANIFEST_VERSION,
  ATLAS_CONTINUITY_FACT_SCHEMA_VERSION,
  ATLAS_CONTINUITY_LEDGER_KINDS,
  createEmptyAtlasContinuityFactLedgerRows,
  sortAtlasContinuityFacts,
} from './atlasContinuityFactLedgerTypes.mjs';

const VIEW_ID = 'derived.atlas.continuityFactLedgers.v1';
const PROVIDER_ID = 'query.atlasContinuityFactLedgers';
const SURFACE_ID = 'surface.atlas.continuityFactLedgers';
const RIGHT_RAIL_SLOT_ID = 'rightRail.context.atlas.continuityFactLedgers';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function isAtlasContinuityFactLedgersCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.continuityFactLedgers'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.continuityFactLedgers'] === false) return false;
  if (capabilities.atlasContinuityFactLedgers === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.continuityFactLedgers === false) return false;
  return true;
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_CONTINUITY_FACT_LEDGERS_SURFACE_MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    host: 'rightRail',
    slotId: RIGHT_RAIL_SLOT_ID,
    contributionKind: 'readOnlyProjectionWithCommandBoundary',
    allowedStateClasses: ['PROJECT_STATE', 'DERIVED_STATE'],
    commandAuthority: 'CommandKernel',
    commandIds: ['atlas.continuityFact.record'],
    productMutation: false,
    storageAuthority: false,
    fallback: {
      empty: 'ATLAS_CONTINUITY_FACT_LEDGERS_EMPTY',
      degraded: 'ATLAS_CONTINUITY_FACT_LEDGERS_DEGRADED',
      unavailable: 'ATLAS_CONTINUITY_FACT_LEDGERS_UNAVAILABLE',
    },
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: ['atlas.author.v1.continuityFactLedgers', 'project.scenes', 'atlas.author.v1.entities'],
    readModelOnly: true,
    commandAuthority: 'CommandKernel',
    commandIds: ['atlas.continuityFact.record'],
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    cloudSync: false,
    accountSync: false,
    automaticFindingSynthesis: false,
    hiddenMutation: false,
  };
}

function normalizeEvidenceAnchor(anchor) {
  const source = isPlainObject(anchor) ? anchor : {};
  return {
    schemaVersion: normalizeString(source.schemaVersion) || 'atlas.evidenceAnchor.v1',
    anchorId: normalizeString(source.anchorId),
    projectId: normalizeString(source.projectId),
    sceneId: normalizeString(source.sceneId),
    entityId: normalizeString(source.entityId),
    startOffset: Number.isSafeInteger(Number(source.startOffset)) ? Number(source.startOffset) : 0,
    endOffset: Number.isSafeInteger(Number(source.endOffset)) ? Number(source.endOffset) : 0,
    quote: typeof source.quote === 'string' ? source.quote : '',
    quoteHash: normalizeString(source.quoteHash),
    sceneTextHash: normalizeString(source.sceneTextHash),
  };
}

function normalizeFact(fact, project) {
  const source = isPlainObject(fact) ? fact : {};
  const sceneId = normalizeString(source.sceneId);
  const evidenceAnchor = normalizeEvidenceAnchor(source.evidenceAnchor);
  const sceneText = typeof project?.scenes?.[sceneId]?.text === 'string' ? project.scenes[sceneId].text : '';
  const currentQuote = sceneText.slice(evidenceAnchor.startOffset, evidenceAnchor.endOffset);
  const currentQuoteHash = hashCanonicalValue(currentQuote);
  const currentSceneTextHash = hashCanonicalValue(sceneText);
  const sceneExists = isPlainObject(project?.scenes?.[sceneId]);
  const subjectEntityId = normalizeString(source.subjectEntityId);
  const subjectExists = isPlainObject(project?.atlas?.entities?.[subjectEntityId]);
  const evidenceCurrent = sceneExists
    && currentSceneTextHash === evidenceAnchor.sceneTextHash
    && currentQuoteHash === evidenceAnchor.quoteHash
    && currentQuote === evidenceAnchor.quote;
  return {
    schemaVersion: ATLAS_CONTINUITY_FACT_SCHEMA_VERSION,
    id: normalizeString(source.id),
    projectId: normalizeString(source.projectId),
    ledgerKind: normalizeString(source.ledgerKind),
    sceneId,
    subjectEntityId,
    relatedEntityIds: Array.isArray(source.relatedEntityIds) ? [...source.relatedEntityIds].map(normalizeString).filter(Boolean).sort() : [],
    factLabel: normalizeString(source.factLabel),
    factValue: normalizeString(source.factValue),
    promiseState: normalizeString(source.promiseState),
    evidenceAnchor,
    evidenceState: evidenceCurrent ? 'current' : 'staleOrMissing',
    sceneState: sceneExists ? 'current' : 'missing',
    subjectState: subjectExists ? 'current' : 'missing',
    note: normalizeString(source.note),
    source: normalizeString(source.source) || 'author',
    sourceHash: normalizeString(source.sourceHash) || hashCanonicalValue(source),
    createdByCommandSeq: Number.isSafeInteger(Number(source.createdByCommandSeq)) ? Number(source.createdByCommandSeq) : 0,
    updatedByCommandSeq: Number.isSafeInteger(Number(source.updatedByCommandSeq)) ? Number(source.updatedByCommandSeq) : 0,
  };
}

function emptyState(projectId, reason = '') {
  return {
    schemaVersion: ATLAS_CONTINUITY_FACT_LEDGERS_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    unavailableReason: reason,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      factCount: 0,
      locationCount: 0,
      knowledgeCount: 0,
      objectCount: 0,
      promiseCount: 0,
      degradedFactCount: 0,
      ledgerHash: '',
      invalidationKey: '',
    },
    factLedgers: createEmptyAtlasContinuityFactLedgerRows(),
    facts: [],
    degradedStates: [],
    evidence: buildEvidence({ ledgerHash: '' }),
  };
}

function buildEvidence({ ledgerHash = '' } = {}) {
  return {
    schemaVersion: 'derived.atlas.continuityFactLedgers.evidence.v1',
    ledgerHash,
    guarantees: {
      localOnly: true,
      authorCommandBoundary: 'atlas.continuityFact.record',
      evidenceAnchorValidatedAtWrite: true,
      findingSynthesis: false,
      externalOntologyService: false,
    },
  };
}

function buildLedgersState({ project, projectId, invalidationKey }) {
  const ledgers = isPlainObject(project.atlas?.continuityFactLedgers) ? project.atlas.continuityFactLedgers : {};
  const factLedgers = createEmptyAtlasContinuityFactLedgerRows();
  for (const ledgerKind of ATLAS_CONTINUITY_LEDGER_KINDS) {
    const ledger = isPlainObject(ledgers[ledgerKind]) ? ledgers[ledgerKind] : {};
    factLedgers[ledgerKind] = sortAtlasContinuityFacts(Object.values(ledger).map((fact) => normalizeFact(fact, project)));
  }
  const facts = sortAtlasContinuityFacts(ATLAS_CONTINUITY_LEDGER_KINDS.flatMap((ledgerKind) => factLedgers[ledgerKind]));
  const degradedStates = facts
    .filter((fact) => fact.evidenceState !== 'current' || fact.sceneState !== 'current' || fact.subjectState !== 'current')
    .map((fact) => ({
      factId: fact.id,
      ledgerKind: fact.ledgerKind,
      sceneId: fact.sceneId,
      code: fact.sceneState !== 'current'
        ? 'CONTINUITY_FACT_SCENE_MISSING'
        : fact.subjectState !== 'current'
          ? 'CONTINUITY_FACT_SUBJECT_MISSING'
          : 'CONTINUITY_FACT_EVIDENCE_STALE',
      reason: 'Continuity fact needs author review before it can be used for findings.',
    }));
  const ledgerHash = hashCanonicalValue(facts);
  return {
    schemaVersion: ATLAS_CONTINUITY_FACT_LEDGERS_SCHEMA_VERSION,
    state: facts.length === 0 ? 'empty' : degradedStates.length > 0 ? 'degraded' : 'ready',
    unavailableReason: '',
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      factCount: facts.length,
      locationCount: factLedgers.location.length,
      knowledgeCount: factLedgers.knowledge.length,
      objectCount: factLedgers.object.length,
      promiseCount: factLedgers.promise.length,
      degradedFactCount: degradedStates.length,
      ledgerHash,
      invalidationKey,
    },
    factLedgers,
    facts,
    degradedStates,
    evidence: buildEvidence({ ledgerHash }),
  };
}

export function deriveAtlasContinuityFactLedgers(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
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
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isAtlasContinuityFactLedgersCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_CONTINUITY_FACT_LEDGERS_DISABLED',
          { capabilityId: 'atlas.continuityFactLedgers' },
        );
      }
      const project = getProject(coreState, params.projectId);
      if (!project) {
        throw createDerivedError('E_ATLAS_PROJECT_NOT_FOUND', VIEW_ID, 'PROJECT_NOT_FOUND', { projectId: params.projectId });
      }
      const ledgers = isPlainObject(project.atlas?.continuityFactLedgers) ? project.atlas.continuityFactLedgers : {};
      const factCount = ATLAS_CONTINUITY_LEDGER_KINDS.reduce((sum, ledgerKind) => (
        sum + (isPlainObject(ledgers[ledgerKind]) ? Object.keys(ledgers[ledgerKind]).length : 0)
      ), 0);
      if (factCount === 0) {
        return {
          ...emptyState(params.projectId),
          summary: {
            ...emptyState(params.projectId).summary,
            invalidationKey: meta.invalidationKey,
          },
        };
      }
      return buildLedgersState({
        project,
        projectId: params.projectId,
        invalidationKey: meta.invalidationKey,
      });
    },
  });
}

export { VIEW_ID as ATLAS_CONTINUITY_FACT_LEDGERS_VIEW_ID };
