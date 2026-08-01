import { stableJson } from './reviewTransportCore.mjs';

export const RTK_REVIEW_TRANSPORT_CLASSIFIER_V2_SCHEMA =
  'yalken.rtk.review-transport-classifier.v2';
export const RTK_REVIEW_TRANSPORT_CLASSIFIER_V2_PROFILE =
  'bounded-review-ir-classifier-v2-b04';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function resolveCryptoPort(port) {
  if (typeof port?.sha256Json === 'function' && typeof port?.sha256Text === 'function') {
    return { ok: true, port };
  }
  return { ok: false, port: null };
}

function list(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function writerBlockingItems(value) {
  return list(value).filter((item) => rawString(item.writerAuthorityImpact) !== 'inventory-only');
}

function reviewIrFrom(input) {
  if (isPlainObject(input.reviewIr)) return input.reviewIr;
  if (isPlainObject(input.analysis?.reviewIr)) return input.analysis.reviewIr;
  return {};
}

function authorityFrom(input) {
  const authority = isPlainObject(input.exactAuthority) ? input.exactAuthority : {};
  return {
    validSignedLocator: authority.validSignedLocator === true,
    sceneRevisionUnchanged: authority.sceneRevisionUnchanged === true,
    rawSha256Unchanged: authority.rawSha256Unchanged === true,
    uniqueTarget: authority.uniqueTarget === true,
    nonOverlapping: authority.nonOverlapping === true,
    allRelevantXmlSemanticsAccounted: authority.allRelevantXmlSemanticsAccounted === true,
    ambiguousDuplicate: authority.ambiguousDuplicate === true,
    crossScene: authority.crossScene === true,
    structuralTopologyChanged: authority.structuralTopologyChanged === true,
  };
}

function exactAuthorityReasons(authority, path) {
  const reasons = [];
  if (!authority.validSignedLocator) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', `${path}.locator`, 'Signed scene/block locator is missing or invalid.'));
  }
  if (!authority.sceneRevisionUnchanged) {
    reasons.push(reason('RTK_BLOCKED_STALE_REVISION', `${path}.sceneRevision`, 'Scene revision guard is stale.'));
  }
  if (!authority.rawSha256Unchanged) {
    reasons.push(reason('RTK_BLOCKED_STALE_BYTES', `${path}.rawSha256`, 'Raw text guard is stale.'));
  }
  if (!authority.uniqueTarget || authority.ambiguousDuplicate) {
    reasons.push(reason('RTK_BLOCKED_AMBIGUOUS_TEXT', `${path}.target`, 'Text locator target is not unique.'));
  }
  if (!authority.nonOverlapping) {
    reasons.push(reason('RTK_BLOCKED_TOKEN_CONTRADICTION', `${path}.overlap`, 'Text revisions overlap or contradict.'));
  }
  if (!authority.allRelevantXmlSemanticsAccounted) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', `${path}.semantics`, 'Relevant OOXML semantics are not fully accounted.'));
  }
  if (authority.crossScene || authority.structuralTopologyChanged) {
    reasons.push(reason('RTK_BLOCKED_STRUCTURAL', `${path}.structure`, 'Structural or cross-scene topology prevents exact text authority.'));
  }
  return reasons;
}

function canBeExactText(textRevision, authority, reviewIr) {
  const supportedOperation = ['insert', 'delete'].includes(rawString(textRevision.operation));
  if (!supportedOperation) return false;
  if (list(reviewIr.moveRevisions).length > 0 || writerBlockingItems(reviewIr.structureChanges).length > 0) return false;
  if (writerBlockingItems(reviewIr.opaqueUnsupported).length > 0) return false;
  return exactAuthorityReasons(authority, 'textRevisions').length === 0;
}

function classifyTextRevisions(reviewIr, authority, cryptoPort) {
  const items = [];
  const reasons = [];
  const grouped = new Map();
  for (const revision of list(reviewIr.textRevisions)) {
    const groupId = rawString(revision.replacementGroupId);
    if (groupId) {
      const group = grouped.get(groupId) || [];
      group.push(revision);
      grouped.set(groupId, group);
    }
  }
  for (const [groupId, group] of grouped.entries()) {
    const operations = group.map((item) => rawString(item.operation)).sort();
    if (operations.join('+') === 'delete+insert') {
      const blockedReasons = exactAuthorityReasons(authority, `replacementPairs.${groupId}`);
      const exact = blockedReasons.length === 0
        && list(reviewIr.moveRevisions).length === 0
        && writerBlockingItems(reviewIr.structureChanges).length === 0
        && writerBlockingItems(reviewIr.opaqueUnsupported).length === 0;
      reasons.push(...blockedReasons);
      items.push({
        lane: 'text',
        kind: 'replacement-pair',
        candidateId: cryptoPort.sha256Text(stableJson({ groupId, operations })),
        replacementGroupId: groupId,
        sourceRevisionIds: group.map((item) => rawString(item.nativeRevisionId)).filter(Boolean),
        disposition: exact ? 'EXACT_AUTOMATIC_CANDIDATE' : 'MANUAL_REVIEW',
        reasonCode: exact ? 'RTK_EXACT_APPLICABLE' : (blockedReasons[0]?.code || 'RTK_MANUAL_DEGRADED_LOCATOR'),
        canApply: false,
      });
    }
  }
  for (const revision of list(reviewIr.textRevisions)) {
    if (rawString(revision.replacementGroupId)) continue;
    const exact = canBeExactText(revision, authority, reviewIr);
    const blockedReasons = exact ? [] : exactAuthorityReasons(authority, `textRevisions.${rawString(revision.nativeRevisionId) || 'unknown'}`);
    reasons.push(...blockedReasons);
    items.push({
      lane: 'text',
      kind: rawString(revision.operation) || 'text-revision',
      candidateId: cryptoPort.sha256Text(stableJson({
        operation: revision.operation,
        id: revision.nativeRevisionId,
        textDigest: revision.textDigest,
      })),
      sourceRevisionIds: [rawString(revision.nativeRevisionId)].filter(Boolean),
      disposition: exact ? 'EXACT_AUTOMATIC_CANDIDATE' : 'MANUAL_REVIEW',
      reasonCode: exact ? 'RTK_EXACT_APPLICABLE' : (blockedReasons[0]?.code || 'RTK_MANUAL_DEGRADED_LOCATOR'),
      canApply: false,
    });
  }
  return { items, reasons };
}

function classifyBlockedLane(items, lane, reasonCode) {
  return list(items).map((item, index) => ({
    lane,
    kind: rawString(item.kind || item.structureKind || item.propertyKind || 'unknown'),
    candidateId: rawString(item.nativeRevisionId || item.changeId || `${lane}-${index}`),
    disposition: 'BLOCKED',
    reasonCode,
    canApply: false,
  }));
}

function classifyManualLane(items, lane, reasonCode) {
  return list(items).map((item, index) => ({
    lane,
    kind: rawString(item.kind || item.formatKind || item.propertyKind || 'unknown'),
    candidateId: rawString(item.nativeRevisionId || `${lane}-${index}`),
    disposition: 'MANUAL_REVIEW',
    reasonCode,
    canApply: false,
  }));
}

function classifyOpaqueUnsupported(items) {
  return list(items).map((item, index) => {
    const inventoryOnly = rawString(item.writerAuthorityImpact) === 'inventory-only';
    return {
      lane: 'opaque-unsupported',
      kind: rawString(item.kind || item.elementName || 'unknown'),
      candidateId: rawString(item.nativeRevisionId || item.changeId || item.partName || `opaque-unsupported-${index}`),
      disposition: inventoryOnly ? 'DIAGNOSTIC_ONLY' : 'BLOCKED',
      reasonCode: inventoryOnly ? 'RTK_DIAGNOSTIC_ONLY' : 'RTK_COMMENT_UNSUPPORTED',
      canApply: false,
    };
  });
}

function classifyComments(reviewIr) {
  return list(reviewIr.commentThreads).map((thread) => ({
    lane: 'comments',
    kind: 'comment-thread',
    candidateId: rawString(thread.threadId || thread.commentId),
    commentId: rawString(thread.commentId),
    disposition: thread.status === 'UNSUPPORTED_BLOCKED' ? 'BLOCKED' : 'COMMENTS_ONLY',
    reasonCode: thread.status === 'UNSUPPORTED_BLOCKED'
      ? 'RTK_COMMENT_UNSUPPORTED'
      : (thread.status === 'RESOLVED' ? 'RTK_COMMENT_RESOLVED' : (thread.status === 'ORPHAN' ? 'RTK_COMMENT_ORPHAN' : 'RTK_COMMENT_ANCHORED')),
    canApply: false,
  }));
}

function summarize(classifications) {
  const all = Object.values(classifications).flat();
  const summary = {
    exactAutomaticCandidates: 0,
    manualReview: 0,
    blocked: 0,
    commentsOnly: 0,
  };
  for (const item of all) {
    if (item.disposition === 'EXACT_AUTOMATIC_CANDIDATE') summary.exactAutomaticCandidates += 1;
    if (item.disposition === 'MANUAL_REVIEW') summary.manualReview += 1;
    if (item.disposition === 'BLOCKED') summary.blocked += 1;
    if (item.disposition === 'COMMENTS_ONLY') summary.commentsOnly += 1;
  }
  return summary;
}

export function classifyReviewTransportIrV2(input = {}, ports = {}) {
  const cryptoState = resolveCryptoPort(ports.cryptoPort);
  if (!cryptoState.ok) {
    const reasons = [reason('RTK_HOSTILE_PACKAGE_BLOCKED', 'cryptoPort', 'CryptoPort is required for classification digests.')];
    return {
      ok: false,
      schemaVersion: RTK_REVIEW_TRANSPORT_CLASSIFIER_V2_SCHEMA,
      status: 'blocked',
      code: 'RTK_HOSTILE_PACKAGE_BLOCKED',
      canApply: false,
      canWriteManuscript: false,
      reasons,
      classifications: {},
    };
  }
  const cryptoPort = cryptoState.port;
  const reviewIr = reviewIrFrom(input);
  const authority = authorityFrom(input);
  const text = classifyTextRevisions(reviewIr, authority, cryptoPort);
  const classifications = {
    text: text.items,
    moves: classifyBlockedLane(reviewIr.moveRevisions, 'move-revisions', 'RTK_BLOCKED_MOVE_REVISION'),
    properties: classifyManualLane(reviewIr.propertyRevisions, 'property-revisions', 'RTK_BLOCKED_STRUCTURAL'),
    structure: classifyBlockedLane(reviewIr.structureChanges, 'structure', 'RTK_BLOCKED_STRUCTURAL'),
    formatting: classifyManualLane(reviewIr.formattingDeltas, 'formatting', 'RTK_MANUAL_DEGRADED_LOCATOR'),
    comments: classifyComments(reviewIr),
    opaqueUnsupported: classifyOpaqueUnsupported(reviewIr.opaqueUnsupported),
  };
  const reasons = [
    reason('RTK_NO_WRITE_ANALYSIS_READY', 'classification', 'ReviewIRV2 classification is immutable analysis without writer authority.'),
    ...text.reasons,
  ];
  if (classifications.moves.length > 0) {
    reasons.push(reason('RTK_BLOCKED_MOVE_REVISION', 'moveRevisions', 'Move revisions are never EXACT in B04.'));
  }
  if (classifications.structure.some((item) => item.disposition === 'BLOCKED')) {
    reasons.push(reason('RTK_BLOCKED_STRUCTURAL', 'structureChanges', 'Structure changes are blocked from automatic apply.'));
  }
  if (classifications.opaqueUnsupported.some((item) => item.disposition === 'BLOCKED')) {
    reasons.push(reason('RTK_COMMENT_UNSUPPORTED', 'opaqueUnsupported', 'Unknown or unsupported OOXML semantics prevent broad support claims.'));
  }
  const summary = summarize(classifications);
  const candidateDisposition = {
    textLane: summary.exactAutomaticCandidates > 0 && summary.manualReview === 0 && summary.blocked === 0
      ? 'RTK_EXACT_APPLICABLE'
      : (summary.blocked > 0 ? 'RTK_BLOCKED_STRUCTURAL' : 'RTK_MANUAL_DEGRADED_LOCATOR'),
    commentLane: classifications.comments.length > 0
      ? (classifications.comments.some((item) => item.disposition === 'BLOCKED') ? 'RTK_COMMENT_UNSUPPORTED' : 'RTK_COMMENT_ANCHORED')
      : 'RTK_COMMENT_UNSUPPORTED',
    priority: 'TEXT_BEFORE_COMMENT',
  };
  const digestPayload = {
    schemaVersion: RTK_REVIEW_TRANSPORT_CLASSIFIER_V2_SCHEMA,
    profile: RTK_REVIEW_TRANSPORT_CLASSIFIER_V2_PROFILE,
    candidateDisposition,
    classifications,
    falseExactGuards: {
      globalTextSearchAuthority: false,
      fuzzyMatchAuthority: false,
      moveRevisionExactAuthority: false,
      parserWriteAuthority: false,
      classifierWriteAuthority: false,
    },
  };
  return {
    ok: true,
    schemaVersion: RTK_REVIEW_TRANSPORT_CLASSIFIER_V2_SCHEMA,
    status: 'classified',
    code: 'RTK_NO_WRITE_ANALYSIS_READY',
    profileId: RTK_REVIEW_TRANSPORT_CLASSIFIER_V2_PROFILE,
    canApply: false,
    canWriteManuscript: false,
    candidateDisposition,
    summary,
    classifications,
    classificationDigest: cryptoPort.sha256Json(digestPayload),
    falseExactGuards: digestPayload.falseExactGuards,
    reasons,
  };
}
