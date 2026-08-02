'use strict';

const {
  validateFullManuscriptAuthorityReturn,
} = require('./fullManuscriptDocxReviewPacketSource');

const FULL_MANUSCRIPT_TRACKED_REPLACEMENT_APPLY_COMMAND_ID =
  'cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements';
const SINGLE_SCENE_TRACKED_REPLACEMENT_COMMAND_ID =
  'cmd.rtk.review.applyNonOverlapTrackedReplacements';
const ROOT_COMMENT_RETURN_COMMAND_ID = 'cmd.rtk.review.applyRootCommentReturn';

function isPlainObjectValue(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function makeBlocked(code, details = {}) {
  return {
    ok: false,
    code,
    details: isPlainObjectValue(details) ? details : {},
  };
}

function classifyFullManuscriptOperation(operation) {
  const family = normalizeString(operation?.family);
  if (family === 'root_comment') {
    return { supported: true, typedOutcome: 'SAFE_ROOT_COMMENT_APPLY' };
  }
  if (family !== 'tracked_text_edit') {
    return {
      supported: false,
      typedOutcome: ['root_comment', 'reply', 'comment_state'].includes(family)
        ? 'MANUAL_COMMENT_LIFECYCLE_PENDING_PRODUCT_APPLY_LANE'
        : ['formatting', 'structural'].includes(family)
          ? 'MANUAL_OR_BLOCKED_PENDING_THREE_PHYSICAL_REPRODUCTIONS'
          : 'REJECT_UNCLASSIFIED_OPERATION_FAMILY',
    };
  }
  const intentKind = normalizeString(operation?.semanticIntent?.kind);
  if (intentKind !== 'replace') {
    return {
      supported: false,
      typedOutcome: `MANUAL_TRACKED_${intentKind.toUpperCase() || 'UNKNOWN'}_PENDING_PRODUCT_LANE`,
    };
  }
  return { supported: true, typedOutcome: 'SAFE_APPLY' };
}

function buildRootCommentCommand({ projectId, projectRoot, operation, sceneId, scenePath, baselineText }) {
  return {
    commandId: ROOT_COMMENT_RETURN_COMMAND_ID,
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.nonTextReturn',
      commandId: ROOT_COMMENT_RETURN_COMMAND_ID,
    },
    projectId,
    projectRoot,
    operationId: normalizeString(operation.id),
    sceneId,
    scenePath,
    sceneText: baselineText,
    threadId: normalizeString(operation.semanticIntent?.threadId),
    commentId: normalizeString(operation.semanticIntent?.commentId),
    body: typeof operation.semanticIntent?.commentText === 'string' ? operation.semanticIntent.commentText : '',
    selectedText: typeof operation.anchor?.selectedText === 'string' ? operation.anchor.selectedText : '',
    anchor: { sceneId },
  };
}

function buildSceneCommand({ projectId, roundId, exportId, sceneId, scenePath, baselineText, operations, projectRoot }) {
  const reviewItems = operations.map((operation) => ({
    changeId: operation.id,
    targetScope: { type: 'scene', id: sceneId },
    replacementText: normalizeString(operation.semanticIntent?.replacementText),
    match: {
      quote: normalizeString(operation.anchor?.selectedText),
    },
  }));
  return {
    sceneId,
    input: {
      commandId: SINGLE_SCENE_TRACKED_REPLACEMENT_COMMAND_ID,
      callerRole: 'main',
      commandAuthority: {
        issuer: 'main',
        intent: 'rtk.exactApply',
        commandId: SINGLE_SCENE_TRACKED_REPLACEMENT_COMMAND_ID,
      },
      projectId,
      roundId,
      requestId: `request:${roundId}:${sceneId}`,
      exportIdentity: exportId,
      returnLifecycleState: 'RETURN_ANALYZED',
      exactAuthority: {
        validSignedLocator: true,
        sceneRevisionUnchanged: true,
        rawSha256Unchanged: true,
        uniqueTarget: true,
        nonOverlapping: true,
        allRelevantXmlSemanticsAccounted: true,
        ambiguousDuplicate: false,
        crossScene: false,
        structuralTopologyChanged: false,
      },
      writerInput: {
        projectRoot,
        scenePath,
        scenePathBySceneId: { [sceneId]: scenePath },
        projectSnapshot: {
          projectId,
          scenes: [{ sceneId, text: baselineText }],
        },
        reviewItems,
      },
      writerContext: {
        projectRoot,
        scenePath,
        scenePathBySceneId: { [sceneId]: scenePath },
        projectSnapshot: {
          projectId,
          scenes: [{ sceneId, text: baselineText }],
        },
      },
      previewConfirmed: true,
    },
  };
}

function buildFullManuscriptReviewReturnApplyPlan(input = {}) {
  const localAuthorityCapsule = isPlainObjectValue(input.localAuthorityCapsule) ? input.localAuthorityCapsule : {};
  const returnedAuthority = isPlainObjectValue(input.returnedAuthority) ? input.returnedAuthority : {};
  const validation = validateFullManuscriptAuthorityReturn(returnedAuthority, localAuthorityCapsule);
  if (!validation.ok) {
    return makeBlocked(validation.code || 'FULL_MANUSCRIPT_RETURN_AUTHORITY_INVALID');
  }
  const expected = localAuthorityCapsule.expectedAuthority || {};
  const orderedSceneIds = list(expected.orderedSceneIds);
  if (orderedSceneIds.length === 0) {
    return makeBlocked('FULL_MANUSCRIPT_LOCAL_AUTHORITY_SCENES_REQUIRED');
  }
  const scenePathBySceneId = isPlainObjectValue(localAuthorityCapsule.scenePathBySceneId)
    ? localAuthorityCapsule.scenePathBySceneId
    : {};
  const baselineFinalTextBySceneId = isPlainObjectValue(localAuthorityCapsule.baselineFinalTextBySceneId)
    ? localAuthorityCapsule.baselineFinalTextBySceneId
    : {};
  const missingScenes = orderedSceneIds.filter((sceneId) => (
    !normalizeString(scenePathBySceneId[sceneId])
    || typeof baselineFinalTextBySceneId[sceneId] !== 'string'
  ));
  if (missingScenes.length > 0) {
    return makeBlocked('FULL_MANUSCRIPT_LOCAL_AUTHORITY_SCENE_MISSING', { missingScenes });
  }
  const operations = list(input.operations);
  const supportedBySceneId = new Map();
  const rootCommentCommands = [];
  const typedOperations = [];
  for (const operation of operations) {
    const classification = classifyFullManuscriptOperation(operation);
    if (!classification.supported) {
      typedOperations.push({
        operationId: normalizeString(operation?.id),
        family: normalizeString(operation?.family),
        typedOutcome: classification.typedOutcome,
      });
      continue;
    }
    const sceneId = normalizeString(operation.sceneId || operation.anchor?.sceneId);
    if (!orderedSceneIds.includes(sceneId)) {
      return makeBlocked('FULL_MANUSCRIPT_OPERATION_WRONG_SCENE', {
        operationId: normalizeString(operation.id),
        sceneId,
      });
    }
    if (!supportedBySceneId.has(sceneId)) supportedBySceneId.set(sceneId, []);
    if (normalizeString(operation.family) === 'root_comment') {
      rootCommentCommands.push(buildRootCommentCommand({
        projectId: normalizeString(input.projectId || returnedAuthority.projectId || localAuthorityCapsule.projectId),
        projectRoot: normalizeString(localAuthorityCapsule.projectRoot),
        operation,
        sceneId,
        scenePath: scenePathBySceneId[sceneId],
        baselineText: baselineFinalTextBySceneId[sceneId],
      }));
    } else {
      supportedBySceneId.get(sceneId).push(operation);
    }
  }
  const sceneCommands = [];
  for (const sceneId of orderedSceneIds) {
    const sceneOperations = supportedBySceneId.get(sceneId) || [];
    if (sceneOperations.length === 0) continue;
    sceneCommands.push(buildSceneCommand({
      projectId: normalizeString(input.projectId || returnedAuthority.projectId || localAuthorityCapsule.projectId),
      roundId: returnedAuthority.roundId,
      exportId: returnedAuthority.exportId,
      sceneId,
      scenePath: scenePathBySceneId[sceneId],
      baselineText: baselineFinalTextBySceneId[sceneId],
      operations: sceneOperations,
      projectRoot: normalizeString(localAuthorityCapsule.projectRoot),
    }));
  }
  return {
    ok: true,
    schemaVersion: 'yalken.rtk.word.full-manuscript-docx-return-apply-plan.v1',
    commandId: FULL_MANUSCRIPT_TRACKED_REPLACEMENT_APPLY_COMMAND_ID,
    projectId: normalizeString(input.projectId || returnedAuthority.projectId || localAuthorityCapsule.projectId),
    roundId: returnedAuthority.roundId,
    requestId: normalizeString(input.requestId) || `request:${returnedAuthority.roundId}:full-manuscript`,
    previewConfirmed: true,
    sceneCommands,
    rootCommentCommands,
    typedOperations,
    atomicity: {
      route: 'existing-multi-scene-command-kernel-rollback',
      allScenesValidatedBeforeWrite: true,
      partialCanonicalWriteForbidden: true,
    },
  };
}

module.exports = {
  FULL_MANUSCRIPT_TRACKED_REPLACEMENT_APPLY_COMMAND_ID,
  buildFullManuscriptReviewReturnApplyPlan,
  classifyFullManuscriptOperation,
};
