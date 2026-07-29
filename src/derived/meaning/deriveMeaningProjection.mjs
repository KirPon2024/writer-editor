import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  MEANING_AUTHOR_SCHEMA_VERSION,
  MEANING_PROJECTION_SCHEMA_VERSION,
  sortMeaningItems,
} from './meaningProjectionTypes.mjs';

const VIEW_ID = MEANING_PROJECTION_SCHEMA_VERSION;
const VIEW_OP = 'derived.meaning.projection';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isMeaningProjectionCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['meaning.projection'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['meaning.projection'] === false) return false;
  if (capabilities.meaningProjection === false) return false;
  if (isPlainObject(capabilities.meaning) && capabilities.meaning.projection === false) return false;
  return true;
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function normalizeSource(source) {
  if (!isPlainObject(source)) return { kind: '' };
  const kind = normalizeString(source.kind);
  if (kind === 'idea') {
    return {
      kind,
      ideaId: normalizeString(source.ideaId),
    };
  }
  if (kind === 'sceneOriginRef') {
    const originRef = isPlainObject(source.originRef) ? source.originRef : {};
    return {
      kind,
      originRef: {
        schemaVersion: normalizeString(originRef.schemaVersion),
        kind: normalizeString(originRef.kind),
        sceneId: normalizeString(originRef.sceneId),
        startOffset: numberOrZero(originRef.startOffset),
        endOffset: numberOrZero(originRef.endOffset),
        sourceHash: normalizeString(originRef.sourceHash),
        targetId: normalizeString(originRef.targetId),
      },
    };
  }
  return { kind };
}

function normalizeMeanings(project) {
  const meaningAuthor = isPlainObject(project?.meanings) && project.meanings.schemaVersion === MEANING_AUTHOR_SCHEMA_VERSION
    ? project.meanings
    : { schemaVersion: MEANING_AUTHOR_SCHEMA_VERSION, meanings: {} };
  const meanings = isPlainObject(meaningAuthor.meanings) ? meaningAuthor.meanings : {};
  return sortMeaningItems(Object.keys(meanings).map((meaningId) => {
    const meaning = isPlainObject(meanings[meaningId]) ? meanings[meaningId] : {};
    return {
      id: normalizeString(meaning.id) || meaningId,
      title: normalizeString(meaning.title),
      interpretation: typeof meaning.interpretation === 'string' ? meaning.interpretation.trim() : '',
      source: normalizeSource(meaning.source),
      promotionKind: normalizeString(meaning.promotionKind) || 'explicitAuthorPromotion',
      createdByCommandSeq: numberOrZero(meaning.createdByCommandSeq),
      updatedByCommandSeq: numberOrZero(meaning.updatedByCommandSeq),
    };
  }));
}

function buildMeaningProjection(coreState, projectId, meta) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError(
      'E_MEANING_PROJECT_NOT_FOUND',
      VIEW_OP,
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }

  const meanings = normalizeMeanings(project);
  const promotionEvidence = meanings.map((meaning) => ({
    evidenceKind: 'explicitAuthorPromotion',
    meaningId: meaning.id,
    projectId,
    source: meaning.source,
    createdByCommandSeq: meaning.createdByCommandSeq,
    authorPromotedTruth: true,
  }));
  const summary = {
    meaningCount: meanings.length,
    promotionEvidenceCount: promotionEvidence.length,
    automaticMeaningCount: 0,
  };
  const projectionHash = hashCanonicalValue({
    meanings,
    promotionEvidence,
    summary,
  });

  return {
    schemaVersion: MEANING_PROJECTION_SCHEMA_VERSION,
    projectId,
    meanings,
    promotionEvidence,
    authority: {
      sourceOfTruth: 'project.core.meanings',
      commandAuthority: 'none',
      automaticInference: false,
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
    summary,
    meta: {
      projectionHash,
      invalidationKey: meta.invalidationKey,
    },
  };
}

export function deriveMeaningProjection(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_MEANING_PROJECT_ID_REQUIRED',
        op: VIEW_OP,
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
      if (!isMeaningProjectionCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_OP,
          'MEANING_PROJECTION_DISABLED',
          { capabilityId: 'meaning.projection' },
        );
      }
      return buildMeaningProjection(coreState, params.projectId, meta);
    },
  });
}

export { VIEW_ID as MEANING_PROJECTION_VIEW_ID };
