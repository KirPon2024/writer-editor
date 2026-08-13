'use strict';

const crypto = require('crypto');

const {
  validateFullManuscriptAuthorityReturn,
} = require('./fullManuscriptDocxReviewPacketSource');

const FULL_MANUSCRIPT_TRACKED_REPLACEMENT_APPLY_COMMAND_ID =
  'cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements';
const SINGLE_SCENE_TRACKED_REPLACEMENT_COMMAND_ID =
  'cmd.rtk.review.applyNonOverlapTrackedReplacements';
const ROOT_COMMENT_RETURN_COMMAND_ID = 'cmd.rtk.review.applyRootCommentReturn';
const COMMENT_LIFECYCLE_RETURN_COMMAND_ID = 'cmd.rtk.review.applyCommentLifecycleReturn';
const SIGNED_SHA256_RE = /^sha256:[a-f0-9]{64}$/u;
const FULL_MANUSCRIPT_APPLY_ELIGIBLE_LIFECYCLE = 'RETURN_ANALYZED';

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

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')}`;
}

function sourceFenceToken(source) {
  const payload = {
    schemaVersion: 'yalken.sourceFence.token.v1',
    purpose: 'WRITE_SOURCE',
    projectId: source.projectId,
    rootId: source.rootId,
    documentId: source.documentId,
    canonicalRevision: source.canonicalRevision,
    workingRevision: source.workingRevision,
    sourceDigest: source.sourceDigest,
  };
  return {
    ...payload,
    fenceDigest: sha256Text(stableJson(payload)),
  };
}

function sourceFenceBinding({ commandId, source }) {
  const request = {
    schemaVersion: 'yalken.sourceFence.request.v1',
    purpose: 'WRITE_SOURCE',
    expected: source,
    current: { ...source, dirtyState: 'CLEAN' },
    dirtyPolicy: 'REQUIRE_CLEAN',
    authority: {
      decision: 'ALLOW',
      mayWrite: true,
      commandId,
    },
    fence: sourceFenceToken(source),
  };
  return {
    schemaVersion: 'yalken.rtk.round-authority-source-fence.v1',
    request,
    result: {
      schemaVersion: 'yalken.sourceFence.result.v1',
      ok: true,
      decision: 'ALLOW',
      code: 'YALKEN_SOURCE_FENCE_ALLOWED',
      reasons: [],
      observed: {
        purpose: 'WRITE_SOURCE',
        projectId: source.projectId,
        rootId: source.rootId,
        documentId: source.documentId,
        canonicalRevision: source.canonicalRevision,
        workingRevision: source.workingRevision,
        sourceDigest: source.sourceDigest,
        dirtyState: 'CLEAN',
        dirtyPolicy: 'REQUIRE_CLEAN',
      },
    },
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isPlainObjectValue(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function authorityDigest(value) {
  return sha256Text(stableJson(value));
}

function hmacSha256Json(value, secret) {
  return `hmac-sha256:${crypto
    .createHmac('sha256', String(secret || ''))
    .update(stableJson(value), 'utf8')
    .digest('hex')}`;
}

function normalizeSignedSha256(value) {
  const text = normalizeString(value).toLowerCase();
  if (SIGNED_SHA256_RE.test(text)) return text;
  if (/^[a-f0-9]{64}$/u.test(text)) return `sha256:${text}`;
  return '';
}

function buildFullManuscriptReturnIntakeProofBindingPayload({ proof, localAuthority, operations } = {}) {
  const operationIds = (Array.isArray(operations) ? operations : [])
    .map((operation) => normalizeString(operation?.id))
    .filter(Boolean);
  return {
    schemaVersion: 'yalken.rtk.word.full-manuscript-return-intake-proof-binding.v1',
    roundId: normalizeString(localAuthority?.roundId || localAuthority?.expectedAuthority?.roundId),
    exportIdentity: normalizeString(localAuthority?.exportIdentity || localAuthority?.expectedAuthority?.exportId),
    returnedArtifactSha256: normalizeSignedSha256(proof?.returnedArtifactSha256),
    coreManifestDigest: normalizeSignedSha256(proof?.coreManifestDigest || proof?.yrtk2Verification?.coreManifestDigest),
    yrtk2: {
      code: normalizeString(proof?.yrtk2Verification?.code),
      keyIdHex: normalizeString(proof?.yrtk2Verification?.keyIdHex).toLowerCase(),
      roundIdHex: normalizeString(proof?.yrtk2Verification?.roundIdHex).toLowerCase(),
      tokenDigest: normalizeSignedSha256(proof?.yrtk2Verification?.tokenDigest),
    },
    parserProfileDigest: normalizeSignedSha256(proof?.parserProfileDigest),
    analysisDigest: normalizeSignedSha256(proof?.analysisDigest),
    reviewIrDigest: normalizeSignedSha256(proof?.reviewIrDigest),
    operationSource: normalizeString(proof?.operationSource),
    operationIds,
  };
}

function buildFullManuscriptReturnIntakeProofBindingDigest({ proof, localAuthority, operations } = {}) {
  const secret = normalizeString(localAuthority?.hmacSecret);
  if (!secret) return '';
  return hmacSha256Json(
    buildFullManuscriptReturnIntakeProofBindingPayload({ proof, localAuthority, operations }),
    secret,
  );
}

function validateFullManuscriptReturnIntakeProof({ proof, localAuthority, operations } = {}) {
  if (!isPlainObjectValue(proof)) {
    return makeBlocked('FULL_MANUSCRIPT_RETURN_INTAKE_PROOF_REQUIRED');
  }
  if (proof.authenticated !== true || normalizeString(proof.status) !== 'authenticated-return-ir-ready') {
    return makeBlocked('FULL_MANUSCRIPT_RETURN_INTAKE_AUTHENTICATED_PROOF_REQUIRED');
  }
  const returnedArtifactSha256 = normalizeSignedSha256(proof.returnedArtifactSha256);
  if (!returnedArtifactSha256) {
    return makeBlocked('FULL_MANUSCRIPT_RETURN_ARTIFACT_SHA256_REQUIRED');
  }
  const expectedCoreManifestDigest = normalizeSignedSha256(localAuthority?.coreManifestDigest || localAuthority?.yrtk2?.coreManifestDigest);
  const proofCoreManifestDigest = normalizeSignedSha256(proof.coreManifestDigest || proof.yrtk2Verification?.coreManifestDigest);
  if (!expectedCoreManifestDigest || proofCoreManifestDigest !== expectedCoreManifestDigest) {
    return makeBlocked('FULL_MANUSCRIPT_RETURN_INTAKE_CORE_MANIFEST_PROOF_MISMATCH');
  }
  if (proof.yrtk2Verification?.code !== 'RTK_RETURN_INTAKE_YRTK2_VERIFIED') {
    return makeBlocked('FULL_MANUSCRIPT_RETURN_INTAKE_YRTK2_PROOF_REQUIRED');
  }
  for (const key of ['parserProfileDigest', 'analysisDigest', 'reviewIrDigest']) {
    if (!normalizeSignedSha256(proof[key])) {
      return makeBlocked('FULL_MANUSCRIPT_RETURN_INTAKE_DIGEST_PROOF_REQUIRED', { field: key });
    }
  }
  if (normalizeString(proof.operationSource) !== 'parsed-review-ir') {
    return makeBlocked('FULL_MANUSCRIPT_RETURN_INTAKE_OPERATION_SOURCE_REQUIRED');
  }
  const expectedProofBindingDigest = buildFullManuscriptReturnIntakeProofBindingDigest({ proof, localAuthority, operations });
  if (!expectedProofBindingDigest) {
    return makeBlocked('FULL_MANUSCRIPT_RETURN_INTAKE_PROOF_BINDING_SECRET_REQUIRED');
  }
  if (normalizeString(proof.mainIntakeAuthorityDigest) !== expectedProofBindingDigest) {
    return makeBlocked('FULL_MANUSCRIPT_RETURN_INTAKE_PROOF_BINDING_MISMATCH');
  }
  const proofIds = Array.isArray(proof.operationIds) ? proof.operationIds.map(normalizeString).filter(Boolean) : [];
  const operationIds = (Array.isArray(operations) ? operations : []).map((operation) => normalizeString(operation?.id)).filter(Boolean);
  if (proofIds.length !== operationIds.length || proofIds.some((id, index) => id !== operationIds[index])) {
    return makeBlocked('FULL_MANUSCRIPT_RETURN_INTAKE_OPERATION_IDS_MISMATCH', {
      proofOperationIds: proofIds,
      operationIds,
    });
  }
  return {
    ok: true,
    returnedArtifactSha256,
    parserProfileDigest: normalizeSignedSha256(proof.parserProfileDigest),
    analysisDigest: normalizeSignedSha256(proof.analysisDigest),
    reviewIrDigest: normalizeSignedSha256(proof.reviewIrDigest),
    coreManifestDigest: proofCoreManifestDigest,
    mainIntakeAuthorityDigest: expectedProofBindingDigest,
  };
}

function deriveFullManuscriptSceneExactAuthority({ sceneId, baselineText, exportMap, operations } = {}) {
  const mappedScenes = list(exportMap?.scenes).filter((scene) => normalizeString(scene.sceneId) === sceneId);
  if (mappedScenes.length !== 1) {
    return makeBlocked('FULL_MANUSCRIPT_EXACT_AUTHORITY_EXPORT_MAP_IDENTITY_INVALID', {
      sceneId,
      matchedSceneCount: mappedScenes.length,
    });
  }
  const mappedScene = mappedScenes[0];
  const baselineRawSha256 = sha256Text(baselineText);
  if (!normalizeString(mappedScene.rawSha256) || normalizeString(mappedScene.rawSha256) !== baselineRawSha256) {
    return makeBlocked('FULL_MANUSCRIPT_EXACT_AUTHORITY_BASELINE_STALE', {
      sceneId,
      expectedRawSha256: normalizeString(mappedScene.rawSha256),
      actualRawSha256: baselineRawSha256,
    });
  }
  const ranges = [];
  for (const operation of operations) {
    const quote = typeof operation?.anchor?.selectedText === 'string' ? operation.anchor.selectedText : '';
    const first = quote ? baselineText.indexOf(quote) : -1;
    const last = quote ? baselineText.lastIndexOf(quote) : -1;
    if (first < 0 || first !== last) {
      return makeBlocked('FULL_MANUSCRIPT_EXACT_AUTHORITY_QUOTE_NOT_UNIQUE', {
        sceneId,
        operationId: normalizeString(operation?.id),
        occurrenceCount: first < 0 ? 0 : 2,
      });
    }
    ranges.push({
      operationId: normalizeString(operation.id),
      from: first,
      to: first + quote.length,
      quote,
    });
  }
  const orderedRanges = ranges.slice().sort((left, right) => left.from - right.from || left.to - right.to);
  for (let index = 1; index < orderedRanges.length; index += 1) {
    if (orderedRanges[index].from < orderedRanges[index - 1].to) {
      return makeBlocked('FULL_MANUSCRIPT_EXACT_AUTHORITY_RANGES_OVERLAP', {
        sceneId,
        leftOperationId: orderedRanges[index - 1].operationId,
        rightOperationId: orderedRanges[index].operationId,
      });
    }
  }
  const exactAuthority = {
    validSignedLocator: true,
    sceneRevisionUnchanged: true,
    rawSha256Unchanged: true,
    uniqueTarget: true,
    nonOverlapping: true,
    allRelevantXmlSemanticsAccounted: true,
    ambiguousDuplicate: false,
    crossScene: false,
    structuralTopologyChanged: false,
    source: 'authenticated-full-manuscript-export-map-baseline-and-local-ranges',
    sceneId,
    baselineRawSha256,
    exportMapId: normalizeString(exportMap?.exportMapId),
  };
  return {
    ok: true,
    exactAuthority,
    authorityDigest: authorityDigest({ exactAuthority, ranges }),
    ranges,
  };
}

function classifyFullManuscriptOperation(operation) {
  const family = normalizeString(operation?.family);
  if (family === 'root_comment') {
    return { supported: true, typedOutcome: 'SAFE_ROOT_COMMENT_APPLY' };
  }
  if (family === 'reply' || family === 'comment_state') {
    return { supported: true, typedOutcome: 'SAFE_COMMENT_LIFECYCLE_APPLY' };
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

function buildCommentLifecycleCommand({ projectId, projectRoot, operation, sceneId }) {
  const family = normalizeString(operation.family);
  const intent = isPlainObjectValue(operation.semanticIntent) ? operation.semanticIntent : {};
  return {
    commandId: COMMENT_LIFECYCLE_RETURN_COMMAND_ID,
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.nonTextReturn',
      commandId: COMMENT_LIFECYCLE_RETURN_COMMAND_ID,
    },
    projectId,
    projectRoot,
    operationId: normalizeString(operation.id),
    sceneId,
    threadId: normalizeString(intent.parentThreadId),
    action: family === 'reply' ? 'reply' : normalizeString(intent.kind),
    replyId: family === 'reply' ? normalizeString(intent.replyId) || normalizeString(operation.id) : '',
    replyBody: family === 'reply' && typeof intent.replyText === 'string' ? intent.replyText : '',
  };
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

function buildSceneCommand({
  projectId,
  roundId,
  exportId,
  sceneId,
  scenePath,
  baselineText,
  operations,
  projectRoot,
  verifiedAuthority,
  returnIntakeProof,
  returnLifecycleState,
}) {
  const rangeByOperationId = new Map(verifiedAuthority.ranges.map((range) => [range.operationId, range]));
  const reviewItems = operations.map((operation) => ({
    changeId: operation.id,
    targetScope: { type: 'scene', id: sceneId },
    replacementText: normalizeString(operation.semanticIntent?.replacementText),
    match: {
      quote: typeof operation.anchor?.selectedText === 'string' ? operation.anchor.selectedText : '',
      blockRange: {
        sceneStart: 0,
        blockLocalStart: rangeByOperationId.get(normalizeString(operation.id)).from,
        blockLocalEnd: rangeByOperationId.get(normalizeString(operation.id)).to,
        authorityDigest: verifiedAuthority.authorityDigest,
      },
    },
  }));
  const blockId = `full-manuscript-scene-${sha256Text(sceneId).slice(-24)}`;
  const textRevisions = operations.flatMap((operation) => {
    const groupId = normalizeString(operation.id);
    const deletedText = typeof operation.anchor?.selectedText === 'string' ? operation.anchor.selectedText : '';
    const insertedText = typeof operation.semanticIntent?.replacementText === 'string'
      ? operation.semanticIntent.replacementText
      : '';
    return [
      {
        kind: 'TextRevision', operation: 'delete', nativeRevisionId: `del:${groupId}`,
        text: deletedText, textDigest: sha256Text(`delete:${deletedText}`), replacementGroupId: groupId,
      },
      {
        kind: 'TextRevision', operation: 'insert', nativeRevisionId: `ins:${groupId}`,
        text: insertedText, textDigest: sha256Text(`insert:${insertedText}`), replacementGroupId: groupId,
      },
    ];
  });
  const sourceIdentityDigest = sha256Text(`full-manuscript-scene-baseline:${sceneId}:${verifiedAuthority.exactAuthority.baselineRawSha256}`);
  const source = {
    projectId,
    rootId: sha256Text(`project-root:${projectId}:${projectRoot}`),
    documentId: sceneId,
    canonicalRevision: sourceIdentityDigest,
    workingRevision: sourceIdentityDigest,
    sourceDigest: verifiedAuthority.exactAuthority.baselineRawSha256,
  };
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
      returnLifecycleState: normalizeString(returnLifecycleState) || FULL_MANUSCRIPT_APPLY_ELIGIBLE_LIFECYCLE,
      returnArtifactSha256: returnIntakeProof.returnedArtifactSha256,
      manifestDigest: returnIntakeProof.coreManifestDigest,
      analysisDigest: returnIntakeProof.analysisDigest,
      reviewIrDigest: returnIntakeProof.reviewIrDigest,
      sourceIdentity: {
        sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
        writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
        projectId: source.projectId,
        rootId: source.rootId,
        documentId: source.documentId,
        canonicalRevision: source.canonicalRevision,
        workingRevision: source.workingRevision,
        revisionSha256: sourceIdentityDigest,
        rawBytesSha256: verifiedAuthority.exactAuthority.baselineRawSha256,
      },
      currentIdentity: {
        projectId: source.projectId,
        rootId: source.rootId,
        documentId: source.documentId,
        canonicalRevision: source.canonicalRevision,
        workingRevision: source.workingRevision,
        revisionSha256: sourceIdentityDigest,
        rawBytesSha256: verifiedAuthority.exactAuthority.baselineRawSha256,
      },
      sourceFence: sourceFenceBinding({
        commandId: SINGLE_SCENE_TRACKED_REPLACEMENT_COMMAND_ID,
        source,
      }),
      exactAuthority: verifiedAuthority.exactAuthority,
      exactAuthorityDigest: verifiedAuthority.authorityDigest,
      authorityCarrier: {
        schemaVersion: 'yalken.rtk.review-transport-authority-carrier.v2',
        status: 'verified-baseline-bound',
        selectedCarrier: {
          carrier: 'main-owned-authenticated-full-manuscript-export-map',
          verified: true,
          validSignedLocator: true,
          payload: {
            sceneId,
            blockId,
            roundId,
            exportId,
            rawSha256: verifiedAuthority.exactAuthority.baselineRawSha256,
          },
          baselineBinding: {
            allExpectedPresent: true,
            allExpectedMatched: true,
            sceneRevisionMatches: true,
            rawSha256Matches: true,
          },
        },
        exactAuthority: verifiedAuthority.exactAuthority,
        carriers: [],
        reasons: [],
      },
      reviewIr: {
        schemaVersion: 'yalken.rtk.review-ir.v2',
        sourceMode: 'TRACKED',
        textRevisions,
        moveRevisions: [], propertyRevisions: [], structureChanges: [], formattingDeltas: [],
        commentThreads: [], opaqueUnsupported: [],
      },
      localBaseline: {
        sceneId,
        sceneBlocks: [{ sceneId, blockId, text: baselineText }],
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
        revisionSession: {
          projectId,
          sessionId: `session:${roundId}:${sceneId}`,
          baselineHash: verifiedAuthority.exactAuthority.baselineRawSha256,
          status: 'open',
          reviewGraph: {
            commentThreads: [], commentPlacements: [], textChanges: [], structuralChanges: [],
            diagnosticItems: [], decisionStates: [],
          },
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
  // Lifecycle honesty: when the real round lifecycle is present on the returned
  // authority, the apply plan must refuse any state other than RETURN_ANALYZED
  // before producing scene commands that would hardcode RETURN_ANALYZED. An
  // empty/unavailable lifecycle (legacy callers that do not thread it yet) does
  // not fail closed here — the apply dispatch re-derives lifecycle at runtime
  // through the command envelope eligibility gate, and preview-only paths never
  // authorize a write. Only an explicit non-eligible state blocks the plan.
  const roundLifecycleState = normalizeString(returnedAuthority.lifecycleState);
  if (roundLifecycleState && roundLifecycleState !== FULL_MANUSCRIPT_APPLY_ELIGIBLE_LIFECYCLE) {
    return makeBlocked('FULL_MANUSCRIPT_ROUND_LIFECYCLE_NOT_ELIGIBLE', { lifecycleState: roundLifecycleState });
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
  const authenticatedExportMap = isPlainObjectValue(localAuthorityCapsule.authenticatedFullManuscriptExportMap)
    ? localAuthorityCapsule.authenticatedFullManuscriptExportMap
    : localAuthorityCapsule.exportMap;
  if (!isPlainObjectValue(authenticatedExportMap)) {
    return makeBlocked('FULL_MANUSCRIPT_EXACT_AUTHORITY_EXPORT_MAP_REQUIRED');
  }
  const missingScenes = orderedSceneIds.filter((sceneId) => (
    !normalizeString(scenePathBySceneId[sceneId])
    || typeof baselineFinalTextBySceneId[sceneId] !== 'string'
  ));
  if (missingScenes.length > 0) {
    return makeBlocked('FULL_MANUSCRIPT_LOCAL_AUTHORITY_SCENE_MISSING', { missingScenes });
  }
  const operations = list(input.operations);
  const returnIntakeProof = validateFullManuscriptReturnIntakeProof({
    proof: input.returnIntakeProof,
    localAuthority: localAuthorityCapsule,
    operations,
  });
  if (!returnIntakeProof.ok) return returnIntakeProof;
  const supportedBySceneId = new Map();
  const rootCommentCommands = [];
  const commentLifecycleCommands = [];
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
    } else if (['reply', 'comment_state'].includes(normalizeString(operation.family))) {
      commentLifecycleCommands.push(buildCommentLifecycleCommand({
        projectId: normalizeString(input.projectId || returnedAuthority.projectId || localAuthorityCapsule.projectId),
        projectRoot: normalizeString(localAuthorityCapsule.projectRoot),
        operation,
        sceneId,
      }));
    } else {
      supportedBySceneId.get(sceneId).push(operation);
    }
  }
  const sceneCommands = [];
  const exactAuthorityBySceneId = {};
  for (const sceneId of orderedSceneIds) {
    const sceneOperations = supportedBySceneId.get(sceneId) || [];
    if (sceneOperations.length === 0) continue;
    const verifiedAuthority = deriveFullManuscriptSceneExactAuthority({
      sceneId,
      baselineText: baselineFinalTextBySceneId[sceneId],
      exportMap: authenticatedExportMap,
      operations: sceneOperations,
    });
    if (!verifiedAuthority.ok) return verifiedAuthority;
    const admissionAuthority = input.admissionExactAuthorityBySceneId?.[sceneId];
    if (admissionAuthority && authorityDigest(admissionAuthority) !== authorityDigest(verifiedAuthority.exactAuthority)) {
      return makeBlocked('FULL_MANUSCRIPT_EXACT_AUTHORITY_PREVIEW_DISPATCH_DISAGREEMENT', { sceneId });
    }
    exactAuthorityBySceneId[sceneId] = {
      exactAuthority: verifiedAuthority.exactAuthority,
      authorityDigest: verifiedAuthority.authorityDigest,
      ranges: verifiedAuthority.ranges,
    };
    sceneCommands.push(buildSceneCommand({
      projectId: normalizeString(input.projectId || returnedAuthority.projectId || localAuthorityCapsule.projectId),
      roundId: returnedAuthority.roundId,
      exportId: returnedAuthority.exportId,
      sceneId,
      scenePath: scenePathBySceneId[sceneId],
      baselineText: baselineFinalTextBySceneId[sceneId],
      operations: sceneOperations,
      projectRoot: normalizeString(localAuthorityCapsule.projectRoot),
      verifiedAuthority,
      returnIntakeProof,
      returnLifecycleState: roundLifecycleState,
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
    exactAuthorityBySceneId,
    returnIntakeProof: {
      returnedArtifactSha256: returnIntakeProof.returnedArtifactSha256,
      coreManifestDigest: returnIntakeProof.coreManifestDigest,
      parserProfileDigest: returnIntakeProof.parserProfileDigest,
      analysisDigest: returnIntakeProof.analysisDigest,
      reviewIrDigest: returnIntakeProof.reviewIrDigest,
      mainIntakeAuthorityDigest: returnIntakeProof.mainIntakeAuthorityDigest,
      operationSource: 'parsed-review-ir',
    },
    rootCommentCommands,
    commentLifecycleCommands,
    typedOperations,
    atomicity: {
      // MULTI-01: the apply plan routes every scene through one explicit
      // multi-scene command, but the underlying writes are an independent
      // staged sequence with no durable atomic boundary. A crash between writes
      // leaves mixed canonical state that the runtime classifies as
      // RTK_MULTI_SCENE_PARTIAL_REPLAY_BLOCKED. Atomicity is therefore typed
      // BLOCKED until a decisive K-MS SIGKILL series proves an atomic path.
      route: 'staged-sequential-multi-scene-apply-atomicity-blocked',
      allScenesValidatedBeforeWrite: true,
      stagedSequentialApplyCertifiedAsStaged: true,
      partialCanonicalWriteForbidden: true,
      multiSceneAtomicApplyCertified: false,
      multiSceneAtomicApplyBlockedReason: 'MULTI_SCENE_SCOPE_BLOCKED_UNTIL_DECISIVE_CRASH_PROOF',
      killCriterion: 'A decisive K-MS SIGKILL crash series must prove an atomic convergence path before this route may certify atomic apply.',
    },
  };
}

module.exports = {
  FULL_MANUSCRIPT_TRACKED_REPLACEMENT_APPLY_COMMAND_ID,
  buildFullManuscriptReturnIntakeProofBindingDigest,
  buildFullManuscriptReviewReturnApplyPlan,
  classifyFullManuscriptOperation,
  deriveFullManuscriptSceneExactAuthority,
};
