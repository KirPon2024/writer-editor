import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  IDEA_AUTHOR_SCHEMA_VERSION,
  IDEA_ORIGIN_REF_SCHEMA_VERSION,
  IDEA_PROJECTION_SCHEMA_VERSION,
  sortIdeaItems,
  sortIdeaOriginLinks,
} from './ideaProjectionTypes.mjs';

const VIEW_ID = IDEA_PROJECTION_SCHEMA_VERSION;
const VIEW_OP = 'derived.idea.projection';

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

function isIdeaProjectionCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['idea.projection'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['idea.projection'] === false) return false;
  if (capabilities.ideaProjection === false) return false;
  if (isPlainObject(capabilities.idea) && capabilities.idea.projection === false) return false;
  return true;
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function normalizeIdeas(project) {
  const ideaAuthor = isPlainObject(project?.ideas) && project.ideas.schemaVersion === IDEA_AUTHOR_SCHEMA_VERSION
    ? project.ideas
    : { schemaVersion: IDEA_AUTHOR_SCHEMA_VERSION, ideas: {}, originLinks: {} };
  const ideas = isPlainObject(ideaAuthor.ideas) ? ideaAuthor.ideas : {};
  return sortIdeaItems(Object.keys(ideas).map((ideaId) => {
    const idea = isPlainObject(ideas[ideaId]) ? ideas[ideaId] : {};
    return {
      id: normalizeString(idea.id) || ideaId,
      title: normalizeString(idea.title),
      summary: typeof idea.summary === 'string' ? idea.summary.trim() : '',
      originLinkIds: Array.isArray(idea.originLinkIds)
        ? idea.originLinkIds.map(normalizeString).filter(Boolean).sort()
        : [],
      createdByCommandSeq: numberOrZero(idea.createdByCommandSeq),
      updatedByCommandSeq: numberOrZero(idea.updatedByCommandSeq),
    };
  }));
}

function normalizeOriginRef(value) {
  const originRef = isPlainObject(value) ? value : {};
  return {
    schemaVersion: normalizeString(originRef.schemaVersion) || IDEA_ORIGIN_REF_SCHEMA_VERSION,
    kind: normalizeString(originRef.kind) || 'sceneTextRange',
    sceneId: normalizeString(originRef.sceneId),
    startOffset: numberOrZero(originRef.startOffset),
    endOffset: numberOrZero(originRef.endOffset),
    sourceHash: normalizeString(originRef.sourceHash),
    targetId: normalizeString(originRef.targetId),
  };
}

function normalizeOriginLinks(project) {
  const ideaAuthor = isPlainObject(project?.ideas) && project.ideas.schemaVersion === IDEA_AUTHOR_SCHEMA_VERSION
    ? project.ideas
    : { schemaVersion: IDEA_AUTHOR_SCHEMA_VERSION, ideas: {}, originLinks: {} };
  const originLinks = isPlainObject(ideaAuthor.originLinks) ? ideaAuthor.originLinks : {};
  return sortIdeaOriginLinks(Object.keys(originLinks).map((linkId) => {
    const link = isPlainObject(originLinks[linkId]) ? originLinks[linkId] : {};
    return {
      id: normalizeString(link.id) || linkId,
      ideaId: normalizeString(link.ideaId),
      originRef: normalizeOriginRef(link.originRef),
      createdByCommandSeq: numberOrZero(link.createdByCommandSeq),
    };
  }));
}

function buildIdeaProjection(coreState, projectId, meta) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError(
      'E_IDEA_PROJECT_NOT_FOUND',
      VIEW_OP,
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }

  const ideas = normalizeIdeas(project);
  const originLinks = normalizeOriginLinks(project);
  const occurrenceEvidence = originLinks.map((link) => ({
    evidenceKind: 'explicitOriginRef',
    linkId: link.id,
    ideaId: link.ideaId,
    projectId,
    originRef: link.originRef,
    createdByCommandSeq: link.createdByCommandSeq,
    authorPromotedTruth: true,
  }));
  const summary = {
    ideaCount: ideas.length,
    originLinkCount: originLinks.length,
    occurrenceEvidenceCount: occurrenceEvidence.length,
    automaticIdeaCount: 0,
  };
  const projectionHash = hashCanonicalValue({
    ideas,
    originLinks,
    occurrenceEvidence,
    summary,
  });

  return {
    schemaVersion: IDEA_PROJECTION_SCHEMA_VERSION,
    projectId,
    ideas,
    originLinks,
    occurrenceEvidence,
    authority: {
      sourceOfTruth: 'project.core.ideas',
      commandAuthority: 'none',
      automaticMining: false,
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

export function deriveIdeaProjection(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_IDEA_PROJECT_ID_REQUIRED',
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
      if (!isIdeaProjectionCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_OP,
          'IDEA_PROJECTION_DISABLED',
          { capabilityId: 'idea.projection' },
        );
      }
      return buildIdeaProjection(coreState, params.projectId, meta);
    },
  });
}

export { VIEW_ID as IDEA_PROJECTION_VIEW_ID };
