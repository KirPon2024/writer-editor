import { stableJson } from './reviewTransportCore.mjs';
import { recomputeAuthorityFromBijection } from './reviewTransportMatchProofV1.mjs';

export const RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_SCHEMA =
  'yalken.rtk.review-transport-block-exact-authority.v2';
export const RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_PROFILE =
  'bounded-block-local-exact-authority-v2-c03';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function list(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function writerBlockingItems(value) {
  return list(value).filter((item) => rawString(item.writerAuthorityImpact) !== 'inventory-only');
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return rawString(value).trim();
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function resolveCryptoPort(port) {
  if (typeof port?.sha256Text === 'function' && typeof port?.sha256Json === 'function') {
    return { ok: true, port };
  }
  return {
    ok: false,
    reasons: [reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'cryptoPort',
      'C03 block exact authority evaluation requires CryptoPort.',
    )],
  };
}

function reviewIrFrom(input) {
  if (isPlainObject(input.reviewIr)) return input.reviewIr;
  if (isPlainObject(input.analysis?.reviewIr)) return input.analysis.reviewIr;
  return {};
}

function exactAuthorityFrom(input) {
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

function authorityCarrierFrom(input) {
  if (isPlainObject(input.authorityCarrier)) return input.authorityCarrier;
  if (isPlainObject(input.analysis?.authorityCarrier)) return input.analysis.authorityCarrier;
  return {};
}

function selectedPayload(authorityCarrier) {
  const selected = isPlainObject(authorityCarrier.selectedCarrier)
    ? authorityCarrier.selectedCarrier
    : {};
  return isPlainObject(selected.payload) ? selected.payload : {};
}

function localBaselineFrom(input) {
  if (isPlainObject(input.localBaseline)) return input.localBaseline;
  if (isPlainObject(input.baseline)) return input.baseline;
  return {};
}

function baselineBlocks(localBaseline, payload) {
  const fromList = Array.isArray(localBaseline.sceneBlocks)
    ? localBaseline.sceneBlocks
    : (Array.isArray(localBaseline.blocks) ? localBaseline.blocks : []);
  const blocks = fromList.filter(isPlainObject).map((block) => ({
    blockId: normalizeString(block.blockId || block.id),
    sceneId: normalizeString(block.sceneId || localBaseline.sceneId || payload.sceneId),
    text: rawString(block.text || block.rawText || block.blockText),
  }));
  const directText = rawString(localBaseline.blockText || localBaseline.text);
  const directBlockId = normalizeString(localBaseline.blockId);
  if (directText || directBlockId) {
    blocks.push({
      blockId: directBlockId || normalizeString(payload.blockId),
      sceneId: normalizeString(localBaseline.sceneId || payload.sceneId),
      text: directText,
    });
  }
  return blocks.filter((block) => block.blockId || block.text);
}

function occurrenceRanges(haystack, needle) {
  const ranges = [];
  const source = rawString(haystack);
  const target = rawString(needle);
  if (!target) return ranges;
  let cursor = 0;
  while (cursor <= source.length) {
    const start = source.indexOf(target, cursor);
    if (start < 0) break;
    ranges.push({ start, end: start + target.length });
    cursor = start + 1;
  }
  return ranges;
}

function candidateIdForGroup(group, cryptoPort) {
  if (group.kind === 'replacement-pair') {
    return cryptoPort.sha256Text(stableJson({
      groupId: group.groupId,
      operations: ['delete', 'insert'],
    }));
  }
  const revision = group.revisions[0] || {};
  return cryptoPort.sha256Text(stableJson({
    operation: revision.operation,
    id: revision.nativeRevisionId,
    textDigest: revision.textDigest,
  }));
}

function buildRevisionGroups(reviewIr, cryptoPort) {
  const reasons = [];
  const textRevisions = list(reviewIr.textRevisions);
  const seenRevisionIds = new Set();
  for (const revision of textRevisions) {
    const id = normalizeString(revision.nativeRevisionId);
    if (!id) {
      reasons.push(reason(
        'RTK_MANUAL_DEGRADED_LOCATOR',
        'reviewIr.textRevisions.nativeRevisionId',
        'Text revisions require native revision ids before block-local exact authority can be proven.',
      ));
      continue;
    }
    if (seenRevisionIds.has(id)) {
      reasons.push(reason(
        'RTK_BLOCKED_DUPLICATE_TOKEN',
        `reviewIr.textRevisions.${id}`,
        'Duplicate native revision ids cannot be granted exact authority.',
      ));
    }
    seenRevisionIds.add(id);
  }

  const grouped = new Map();
  const standalone = [];
  for (const revision of textRevisions) {
    const groupId = normalizeString(revision.replacementGroupId);
    if (!groupId) {
      standalone.push(revision);
      continue;
    }
    const group = grouped.get(groupId) || [];
    group.push(revision);
    grouped.set(groupId, group);
  }

  const groups = [];
  for (const [groupId, revisions] of grouped.entries()) {
    const deletes = revisions.filter((item) => item.operation === 'delete');
    const inserts = revisions.filter((item) => item.operation === 'insert');
    const supported = revisions.length === 2 && deletes.length === 1 && inserts.length === 1;
    const group = {
      kind: supported ? 'replacement-pair' : 'unsupported-group',
      groupId,
      revisions,
      sourceRevisionIds: revisions.map((item) => normalizeString(item.nativeRevisionId)).filter(Boolean),
      expectedText: rawString(deletes[0]?.text),
      replacementText: rawString(inserts[0]?.text),
      supported,
    };
    group.candidateId = candidateIdForGroup(group, cryptoPort);
    groups.push(group);
    if (!supported) {
      reasons.push(reason(
        'RTK_MANUAL_DEGRADED_LOCATOR',
        `reviewIr.textRevisions.${groupId}`,
        'Replacement groups must contain exactly one delete and one insert revision.',
      ));
    }
  }

  for (const revision of standalone) {
    const supported = revision.operation === 'delete';
    const group = {
      kind: supported ? 'delete' : 'unsupported-insert',
      groupId: '',
      revisions: [revision],
      sourceRevisionIds: [normalizeString(revision.nativeRevisionId)].filter(Boolean),
      expectedText: supported ? rawString(revision.text) : '',
      replacementText: '',
      supported,
    };
    group.candidateId = candidateIdForGroup(group, cryptoPort);
    groups.push(group);
    if (!supported) {
      reasons.push(reason(
        'RTK_MANUAL_DEGRADED_LOCATOR',
        `reviewIr.textRevisions.${normalizeString(revision.nativeRevisionId) || 'insert'}`,
        'Standalone insert revisions need a separately proven insertion anchor before exact authority.',
      ));
    }
  }

  return { groups, reasons };
}

function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

function blockResult(reasons, details = {}) {
  const normalized = Array.isArray(reasons) ? reasons : [reasons];
  return {
    ok: false,
    schemaVersion: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_SCHEMA,
    profileId: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_PROFILE,
    status: 'blocked',
    code: normalized[0]?.code || 'RTK_WRITE_PRECONDITION_FAILED',
    reasons: normalized,
    canApply: false,
    canWriteManuscript: false,
    exactAuthority: {
      validSignedLocator: false,
      sceneRevisionUnchanged: false,
      rawSha256Unchanged: false,
      uniqueTarget: false,
      nonOverlapping: false,
      allRelevantXmlSemanticsAccounted: false,
      ambiguousDuplicate: false,
      crossScene: false,
      structuralTopologyChanged: false,
    },
    exactTextAnchors: [],
    summary: {
      exactEligibleTextGroups: 0,
      manualTextGroups: 0,
      blockedTextGroups: 0,
    },
    ...details,
  };
}

export function evaluateReviewTransportBlockExactAuthorityV2(input = {}, options = {}) {
  const cryptoState = resolveCryptoPort(options.cryptoPort);
  if (!cryptoState.ok) return blockResult(cryptoState.reasons);
  const cryptoPort = cryptoState.port;
  const reviewIr = reviewIrFrom(input);
  const authorityCarrier = authorityCarrierFrom(input);
  const payload = selectedPayload(authorityCarrier);
  const baseAuthority = exactAuthorityFrom(input);
  const localBaseline = localBaselineFrom(input);
  const targetBlockId = normalizeString(payload.blockId || localBaseline.blockId);
  const targetSceneId = normalizeString(payload.sceneId || localBaseline.sceneId);
  const blocks = baselineBlocks(localBaseline, payload);
  const matchingBlocks = blocks.filter((block) => block.blockId === targetBlockId);
  const reasons = [];

  if (!baseAuthority.validSignedLocator) {
    reasons.push(reason(
      'RTK_MANUAL_DEGRADED_LOCATOR',
      'exactAuthority.validSignedLocator',
      'C03 requires a C02 verified signed locator before block-local exact authority.',
    ));
  }
  if (!baseAuthority.sceneRevisionUnchanged) {
    reasons.push(reason('RTK_BLOCKED_STALE_REVISION', 'exactAuthority.sceneRevisionUnchanged', 'Scene revision guard is stale.'));
  }
  if (!baseAuthority.rawSha256Unchanged) {
    reasons.push(reason('RTK_BLOCKED_STALE_BYTES', 'exactAuthority.rawSha256Unchanged', 'Raw text guard is stale.'));
  }
  if (!targetBlockId) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'authorityCarrier.payload.blockId', 'Signed block identity is required.'));
  }
  if (matchingBlocks.length === 0) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'localBaseline.blocks', 'Local baseline must contain the signed target block.'));
  }
  if (matchingBlocks.length > 1) {
    reasons.push(reason('RTK_BLOCKED_AMBIGUOUS_TEXT', 'localBaseline.blocks', 'Duplicate target block ids are ambiguous.'));
  }
  const targetBlock = matchingBlocks.length === 1 ? matchingBlocks[0] : null;
  const crossScene = targetBlock && targetSceneId && targetBlock.sceneId && targetBlock.sceneId !== targetSceneId;
  if (crossScene) {
    reasons.push(reason('RTK_BLOCKED_STRUCTURAL', 'localBaseline.sceneId', 'Signed scene identity does not match the local target block.'));
  }

  const structuralTopologyChanged =
    list(reviewIr.moveRevisions).length > 0
    || writerBlockingItems(reviewIr.structureChanges).length > 0;
  if (structuralTopologyChanged) {
    reasons.push(reason('RTK_BLOCKED_STRUCTURAL', 'reviewIr.structure', 'Move or structural changes are outside block-local exact text authority.'));
  }
  if (writerBlockingItems(reviewIr.opaqueUnsupported).length > 0) {
    reasons.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', 'reviewIr.opaqueUnsupported', 'Unknown OOXML semantics prevent exact authority.'));
  }

  const grouped = buildRevisionGroups(reviewIr, cryptoPort);
  reasons.push(...grouped.reasons);
  const exactTextAnchors = [];
  const ranges = [];
  // MATCH-01: uniqueTarget / ambiguousDuplicate are RECOMPUTED from the local
  // baseline + revision text via the placement-aware bijection
  // (recomputeAuthorityFromBijection). The caller-supplied booleans are
  // ignored for these two fields so a caller cannot force a unique-baseline
  // replacement pair into MANUAL_REVIEW by lying
  // (reviewTransportBlockExactAuthorityV2.mjs doctrine, M3).
  const recomputed = recomputeAuthorityFromBijection({
    localBaseline,
    authorityCarrier,
    reviewIr,
  });
  let ambiguousDuplicate = matchingBlocks.length > 1 || recomputed.ambiguousDuplicate;
  let uniqueTarget = recomputed.uniqueTarget && grouped.groups.length > 0 && Boolean(targetBlock);
  let allSupportedTextGroups = grouped.groups.length > 0;

  for (const group of grouped.groups) {
    if (!group.supported) {
      allSupportedTextGroups = false;
      uniqueTarget = false;
      continue;
    }
    const occurrences = occurrenceRanges(targetBlock?.text || '', group.expectedText);
    if (occurrences.length !== 1) {
      uniqueTarget = false;
      if (occurrences.length > 1) ambiguousDuplicate = true;
      reasons.push(reason(
        occurrences.length > 1 ? 'RTK_BLOCKED_AMBIGUOUS_TEXT' : 'RTK_MANUAL_DEGRADED_LOCATOR',
        `localBaseline.blocks.${targetBlockId}`,
        'Expected revision text must occur exactly once inside the signed target block.',
        {
          candidateId: group.candidateId,
          occurrenceCount: occurrences.length,
        },
      ));
      continue;
    }
    const range = {
      ...occurrences[0],
      candidateId: group.candidateId,
      kind: group.kind,
      sourceRevisionIds: group.sourceRevisionIds,
    };
    ranges.push(range);
    exactTextAnchors.push({
      candidateId: group.candidateId,
      kind: group.kind,
      blockId: targetBlockId,
      sceneId: targetSceneId,
      start: range.start,
      end: range.end,
      expectedTextDigest: cryptoPort.sha256Json({
        schemaVersion: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_SCHEMA,
        expectedText: group.expectedText,
      }),
      sourceRevisionIds: group.sourceRevisionIds,
    });
  }

  let nonOverlapping = ranges.length === grouped.groups.length && ranges.length > 0;
  const orderedRanges = ranges.slice().sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 0; index < orderedRanges.length - 1; index += 1) {
    if (rangesOverlap(orderedRanges[index], orderedRanges[index + 1])) {
      nonOverlapping = false;
      reasons.push(reason(
        'RTK_BLOCKED_TOKEN_CONTRADICTION',
        'reviewIr.textRevisions',
        'Block-local exact revision ranges must not overlap.',
        {
          leftCandidateId: orderedRanges[index].candidateId,
          rightCandidateId: orderedRanges[index + 1].candidateId,
        },
      ));
    }
  }

  const allRelevantXmlSemanticsAccounted =
    allSupportedTextGroups
    && !structuralTopologyChanged
    && writerBlockingItems(reviewIr.opaqueUnsupported).length === 0;

  if (ambiguousDuplicate) uniqueTarget = false;
  if (!allRelevantXmlSemanticsAccounted) nonOverlapping = false;
  if (!baseAuthority.validSignedLocator || !baseAuthority.sceneRevisionUnchanged || !baseAuthority.rawSha256Unchanged) {
    uniqueTarget = false;
    nonOverlapping = false;
  }
  if (crossScene) {
    uniqueTarget = false;
    nonOverlapping = false;
  }

  const exactAuthority = {
    validSignedLocator: baseAuthority.validSignedLocator,
    sceneRevisionUnchanged: baseAuthority.sceneRevisionUnchanged,
    rawSha256Unchanged: baseAuthority.rawSha256Unchanged,
    uniqueTarget,
    nonOverlapping,
    allRelevantXmlSemanticsAccounted,
    ambiguousDuplicate,
    crossScene: Boolean(crossScene || baseAuthority.crossScene),
    structuralTopologyChanged,
  };
  const ready = exactAuthority.validSignedLocator
    && exactAuthority.sceneRevisionUnchanged
    && exactAuthority.rawSha256Unchanged
    && exactAuthority.uniqueTarget
    && exactAuthority.nonOverlapping
    && exactAuthority.allRelevantXmlSemanticsAccounted
    && !exactAuthority.ambiguousDuplicate
    && !exactAuthority.crossScene
    && !exactAuthority.structuralTopologyChanged;
  const authorityUnsigned = {
    schemaVersion: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_SCHEMA,
    profileId: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_PROFILE,
    targetSceneId,
    targetBlockId,
    exactAuthority,
    exactTextAnchors,
  };
  return {
    ok: true,
    schemaVersion: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_SCHEMA,
    profileId: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_AUTHORITY_V2_PROFILE,
    status: ready ? 'exact-authority-ready' : 'manual-or-blocked',
    code: ready ? 'RTK_EXACT_APPLICABLE' : (reasons[0]?.code || 'RTK_MANUAL_DEGRADED_LOCATOR'),
    reasons,
    canApply: false,
    canWriteManuscript: false,
    targetSceneId,
    targetBlockId,
    exactAuthority,
    exactTextAnchors,
    summary: {
      exactEligibleTextGroups: ready ? grouped.groups.length : 0,
      manualTextGroups: ready ? 0 : grouped.groups.length,
      blockedTextGroups: reasons.filter((item) => item.code && item.code.startsWith('RTK_BLOCKED')).length,
      commentThreadsPreserved: list(reviewIr.commentThreads).length,
      formattingDeltasPreserved: list(reviewIr.formattingDeltas).length,
    },
    authorityDigest: cryptoPort.sha256Json(authorityUnsigned),
    falseExactGuards: {
      globalTextSearchAuthority: false,
      fuzzyMatchAuthority: false,
      standaloneInsertExactAuthority: false,
      moveRevisionExactAuthority: false,
      parserWriteAuthority: false,
      blockAuthorityWriteAuthority: false,
    },
    baselineBlockDigest: targetBlock
      ? cryptoPort.sha256Json({
        blockId: targetBlock.blockId,
        sceneId: targetBlock.sceneId,
        text: targetBlock.text,
      })
      : '',
    authorityCarrier: cloneJsonSafe(authorityCarrier),
  };
}
