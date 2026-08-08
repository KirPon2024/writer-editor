import { stableJson } from './reviewTransportCore.mjs';

export const RTK_WORD_V4_MINIMAL_SEMANTIC_KERNEL_SCHEMA =
  'yalken.rtk.word-v4.minimal-semantic-kernel.v1';
export const RTK_WORD_V4_MINIMAL_SEMANTIC_KERNEL_PROFILE =
  'word-v4-minimal-semantic-kernel-e04';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function list(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function resolveCryptoPort(port = {}) {
  if (typeof port.sha256Json === 'function' && typeof port.sha256Text === 'function') {
    return { ok: true, port };
  }
  return { ok: false, port: null };
}

function reviewIrFrom(input = {}) {
  if (isPlainObject(input.reviewIr)) return input.reviewIr;
  if (isPlainObject(input.analysis?.reviewIr)) return input.analysis.reviewIr;
  if (isPlainObject(input.parserResult?.reviewIr)) return input.parserResult.reviewIr;
  return {};
}

function authorityFrom(input = {}) {
  const authority = isPlainObject(input.exactAuthority) ? input.exactAuthority : {};
  return {
    yrtk2Verified: input.yrtk2Verification?.ok === true,
    coreManifestDigest: rawString(input.yrtk2Verification?.coreManifestDigest),
    validSignedLocator: authority.validSignedLocator === true,
    sceneRevisionUnchanged: authority.sceneRevisionUnchanged === true,
    rawSha256Unchanged: authority.rawSha256Unchanged === true,
    uniqueTarget: authority.uniqueTarget === true,
    nonOverlapping: authority.nonOverlapping === true,
    allRelevantXmlSemanticsAccounted: authority.allRelevantXmlSemanticsAccounted === true,
  };
}

function classifyTextRevision(revision, index, cryptoPort) {
  const operation = rawString(revision.operation);
  const supported = ['insert', 'delete'].includes(operation);
  return {
    lane: 'text',
    kind: 'TextRevision',
    operation,
    nativeRevisionId: rawString(revision.nativeRevisionId),
    semanticId: cryptoPort.sha256Text(stableJson({
      lane: 'text',
      operation,
      nativeRevisionId: revision.nativeRevisionId,
      replacementGroupId: revision.replacementGroupId,
      textDigest: revision.textDigest,
      index,
    })),
    semanticSupport: supported ? 'SUPPORTED_TEXT_REVISION' : 'UNSUPPORTED_TEXT_REVISION',
    exactEligibleSemantic: supported,
    canWriteManuscript: false,
  };
}

function classifyReplacementGroups(textSemantics) {
  const grouped = new Map();
  for (const item of textSemantics) {
    const groupId = rawString(item.replacementGroupId);
    if (!groupId) continue;
    const group = grouped.get(groupId) || [];
    group.push(item);
    grouped.set(groupId, group);
  }
  return [...grouped.entries()].map(([groupId, items]) => {
    const operations = items.map((item) => item.operation).sort().join('+');
    return {
      lane: 'text',
      kind: 'ReplacementGroup',
      replacementGroupId: groupId,
      operationShape: operations,
      semanticSupport: operations === 'delete+insert' ? 'SUPPORTED_REPLACEMENT_PAIR' : 'UNSUPPORTED_REPLACEMENT_GROUP',
      exactEligibleSemantic: operations === 'delete+insert',
      canWriteManuscript: false,
    };
  });
}

function classifyComments(reviewIr) {
  return list(reviewIr.commentThreads).map((thread, index) => ({
    lane: 'comments',
    kind: 'CommentThread',
    commentId: rawString(thread.commentId),
    threadId: rawString(thread.threadId),
    status: rawString(thread.status) || 'UNKNOWN',
    semanticSupport: thread.status === 'UNSUPPORTED_BLOCKED' ? 'UNSUPPORTED_COMMENT_THREAD' : 'COMMENT_SHADOW_SUPPORTED',
    shadowAnalysisAllowed: thread.status !== 'UNSUPPORTED_BLOCKED',
    reviewSessionMutationAllowed: false,
    orderingIndex: index,
  }));
}

function manualLane(items, lane, support) {
  return list(items).map((item, index) => ({
    lane,
    kind: rawString(item.kind || item.formatKind || item.propertyKind || item.structureKind || 'unknown'),
    semanticSupport: support,
    semanticId: rawString(item.nativeRevisionId || item.changeId || `${lane}-${index}`),
    exactEligibleSemantic: false,
    canWriteManuscript: false,
  }));
}

function collectReasons({ reviewIr, authority, parserResult }) {
  const reasons = [];
  if (parserResult && parserResult.ok === false) {
    reasons.push(reason('RTK_V4_KERNEL_PACKAGE_REJECT', 'parserResult.ok', 'Parser rejected the package before semantic certification.'));
  }
  if (!authority.yrtk2Verified) {
    reasons.push(reason('RTK_V4_KERNEL_YRTK2_REQUIRED', 'yrtk2Verification', 'Verified YRTK2 is required before exact semantic certification.'));
  }
  if (!authority.validSignedLocator) {
    reasons.push(reason('RTK_V4_KERNEL_SIGNED_LOCATOR_REQUIRED', 'exactAuthority.validSignedLocator', 'Signed locator authority is required.'));
  }
  if (!authority.sceneRevisionUnchanged) {
    reasons.push(reason('RTK_V4_KERNEL_STALE_SCENE_REVISION', 'exactAuthority.sceneRevisionUnchanged', 'Scene revision guard is stale.'));
  }
  if (!authority.rawSha256Unchanged) {
    reasons.push(reason('RTK_V4_KERNEL_STALE_RAW_TEXT', 'exactAuthority.rawSha256Unchanged', 'Raw text guard is stale.'));
  }
  if (!authority.uniqueTarget || !authority.nonOverlapping) {
    reasons.push(reason('RTK_V4_KERNEL_AMBIGUOUS_OR_OVERLAPPING_TEXT', 'exactAuthority.uniqueTarget', 'Target must be unique and non-overlapping.'));
  }
  if (!authority.allRelevantXmlSemanticsAccounted) {
    reasons.push(reason('RTK_V4_KERNEL_XML_SEMANTICS_NOT_ACCOUNTED', 'exactAuthority.allRelevantXmlSemanticsAccounted', 'All relevant XML semantics must be accounted.'));
  }
  if (list(reviewIr.moveRevisions).length > 0) {
    reasons.push(reason('RTK_V4_KERNEL_MOVE_REVISION_BLOCKED', 'reviewIr.moveRevisions', 'Move revisions are not exact in E04.'));
  }
  if (list(reviewIr.structureChanges).length > 0) {
    reasons.push(reason('RTK_V4_KERNEL_STRUCTURE_MANUAL', 'reviewIr.structureChanges', 'Structural changes require later typed structural contour.'));
  }
  if (list(reviewIr.opaqueUnsupported).length > 0) {
    reasons.push(reason('RTK_V4_KERNEL_OPAQUE_UNSUPPORTED', 'reviewIr.opaqueUnsupported', 'Unknown or unsupported OOXML cannot be silently ignored.'));
  }
  return reasons;
}

function summarize(semantics) {
  const summary = {
    supportedTextRevisions: 0,
    supportedReplacementPairs: 0,
    commentShadowThreads: 0,
    manualProperties: semantics.properties.length,
    manualFormatting: semantics.formatting.length,
    blockedMoves: semantics.moves.length,
    manualStructure: semantics.structure.length,
    opaqueUnsupported: semantics.opaqueUnsupported.length,
  };
  for (const item of semantics.text) {
    if (item.semanticSupport === 'SUPPORTED_TEXT_REVISION') summary.supportedTextRevisions += 1;
  }
  for (const item of semantics.replacementGroups) {
    if (item.semanticSupport === 'SUPPORTED_REPLACEMENT_PAIR') summary.supportedReplacementPairs += 1;
  }
  for (const item of semantics.comments) {
    if (item.semanticSupport === 'COMMENT_SHADOW_SUPPORTED') summary.commentShadowThreads += 1;
  }
  return summary;
}

export function evaluateWordV4MinimalSemanticKernel(input = {}, ports = {}) {
  const cryptoState = resolveCryptoPort(ports.cryptoPort);
  if (!cryptoState.ok) {
    return {
      ok: false,
      schemaVersion: RTK_WORD_V4_MINIMAL_SEMANTIC_KERNEL_SCHEMA,
      profileId: RTK_WORD_V4_MINIMAL_SEMANTIC_KERNEL_PROFILE,
      status: 'blocked',
      code: 'RTK_V4_KERNEL_CRYPTO_PORT_REQUIRED',
      canApply: false,
      canWriteManuscript: false,
      reasons: [reason('RTK_V4_KERNEL_CRYPTO_PORT_REQUIRED', 'cryptoPort', 'Minimal Word Semantic Kernel requires CryptoPort.')],
    };
  }
  const cryptoPort = cryptoState.port;
  const reviewIr = reviewIrFrom(input);
  const authority = authorityFrom(input);
  const text = list(reviewIr.textRevisions).map((revision, index) => ({
    ...classifyTextRevision(revision, index, cryptoPort),
    replacementGroupId: rawString(revision.replacementGroupId),
  }));
  const semantics = {
    text,
    replacementGroups: classifyReplacementGroups(text),
    comments: classifyComments(reviewIr),
    moves: manualLane(reviewIr.moveRevisions, 'moves', 'BLOCKED_MOVE_REVISION'),
    properties: manualLane(reviewIr.propertyRevisions, 'properties', 'MANUAL_PROPERTY_REVISION'),
    formatting: manualLane(reviewIr.formattingDeltas, 'formatting', 'MANUAL_FORMATTING_DELTA'),
    structure: manualLane(reviewIr.structureChanges, 'structure', 'MANUAL_STRUCTURE_CHANGE'),
    opaqueUnsupported: manualLane(reviewIr.opaqueUnsupported, 'opaqueUnsupported', 'OPAQUE_UNSUPPORTED_DIAGNOSTIC'),
  };
  const reasons = collectReasons({
    reviewIr,
    authority,
    parserResult: input.parserResult,
  });
  // The E04 kernel is analysis-only. The returned status string
  // (semantic-kernel-ready / semantic-kernel-manual-or-blocked) is an analysis
  // classification of the reviewed text semantics, not apply authority. The
  // kernel deliberately does not restate caller-provided authority booleans as
  // a write-ready flag; it only declares analysisOnly so downstream consumers
  // can prove the kernel result came from the analysis plane.
  return {
    ok: true,
    schemaVersion: RTK_WORD_V4_MINIMAL_SEMANTIC_KERNEL_SCHEMA,
    profileId: RTK_WORD_V4_MINIMAL_SEMANTIC_KERNEL_PROFILE,
    status: reasons.length === 0 ? 'semantic-kernel-ready' : 'semantic-kernel-manual-or-blocked',
    code: reasons.length === 0 ? 'RTK_V4_KERNEL_READY' : reasons[0].code,
    // The E04 kernel is analysis-only. It never restates caller-provided
    // authority booleans as a write-ready exactSemanticReady flag; the returned
    // status string is an analysis classification, not apply authority. This
    // prevents a caller from fabricating write authority by passing booleans.
    analysisOnly: true,
    canApply: false,
    canWriteManuscript: false,
    reasons,
    semantics,
    summary: summarize(semantics),
    conservation: {
      commentsIndependentFromText: true,
      unknownOoxmlNeverSilentlyDropped: true,
      parserDoesNotWrite: true,
      kernelDoesNotWrite: true,
    },
  };
}
