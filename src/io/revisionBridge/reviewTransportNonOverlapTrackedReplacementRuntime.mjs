import {
  applyReviewTransportBlockExactWriterBindingV2,
  buildReviewTransportBlockExactWriterBindingV2,
} from './reviewTransportBlockExactWriterBindingV2.mjs';

export const RTK_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID =
  'cmd.rtk.review.applyNonOverlapTrackedReplacements';
export const RTK_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_SCHEMA =
  'yalken.rtk.non-overlap-tracked-replacement-runtime.v1';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return rawString(value).trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function writerBlockingItems(value) {
  return list(value).filter((item) => normalizeString(item.writerAuthorityImpact) !== 'inventory-only');
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function blockResult(reasons, details = {}) {
  const normalized = Array.isArray(reasons) ? reasons : [reasons];
  return {
    ok: false,
    schemaVersion: RTK_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_SCHEMA,
    status: 'blocked',
    code: normalized[0]?.code || 'RTK_WRITE_PRECONDITION_FAILED',
    reason: normalized[0]?.code || 'RTK_WRITE_PRECONDITION_FAILED',
    reasons: normalized,
    applied: false,
    canApply: false,
    canWriteManuscript: false,
    writerCalled: false,
    automaticApplyCertified: false,
    ...details,
  };
}

function reviewIrFrom(input = {}) {
  if (isPlainObject(input.reviewIr)) return input.reviewIr;
  if (isPlainObject(input.analysis?.reviewIr)) return input.analysis.reviewIr;
  return {};
}

function groupedReplacementPairs(reviewIr) {
  const groups = new Map();
  const reasons = [];
  const revisions = list(reviewIr.textRevisions);
  for (const revision of revisions) {
    const groupId = normalizeString(revision.replacementGroupId);
    if (!groupId) {
      reasons.push(reason(
        'RTK_WRITE_PRECONDITION_FAILED',
        `textRevisions.${normalizeString(revision.nativeRevisionId) || 'unknown'}`,
        'A03-C02 admits physically proven replacement pairs only.',
      ));
      continue;
    }
    const group = groups.get(groupId) || [];
    group.push(revision);
    groups.set(groupId, group);
  }
  for (const [groupId, group] of groups.entries()) {
    const deletes = group.filter((item) => item.operation === 'delete');
    const inserts = group.filter((item) => item.operation === 'insert');
    if (group.length !== 2 || deletes.length !== 1 || inserts.length !== 1) {
      reasons.push(reason(
        'RTK_WRITE_PRECONDITION_FAILED',
        `replacementPairs.${groupId}`,
        'A03-C02 replacement group must contain exactly one delete and one insert revision.',
      ));
    }
  }
  return {
    ok: reasons.length === 0,
    reasons,
    count: groups.size,
  };
}

function validatePhysicalScope(input = {}) {
  const reviewIr = reviewIrFrom(input);
  const reasons = [];
  const authority = isPlainObject(input.exactAuthority) ? input.exactAuthority : {};
  const commandAuthority = isPlainObject(input.commandAuthority) ? input.commandAuthority : {};

  if (normalizeString(input.commandId || RTK_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID) !== RTK_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID) {
    reasons.push(reason('RTK_COMMAND_AUTHORITY_BLOCKED', 'commandId', 'Unexpected A03-C02 runtime command id.'));
  }
  if (normalizeString(input.callerRole) !== 'main'
    || normalizeString(commandAuthority.issuer) !== 'main'
    || normalizeString(commandAuthority.intent) !== 'rtk.exactApply') {
    reasons.push(reason('RTK_COMMAND_AUTHORITY_BLOCKED', 'commandAuthority', 'A03-C02 requires main-owned exact-apply command authority.'));
  }
  if (!['TRACKED', 'MIXED'].includes(normalizeString(reviewIr.sourceMode))) {
    reasons.push(reason('RTK_WRITE_PRECONDITION_FAILED', 'reviewIr.sourceMode', 'A03-C02 admits tracked or mixed returned Word revisions only.'));
  }
  if (list(reviewIr.moveRevisions).length > 0 || writerBlockingItems(reviewIr.structureChanges).length > 0) {
    reasons.push(reason('RTK_BLOCKED_STRUCTURAL', 'reviewIr.structure', 'Move and structural changes are not A03-C02 automatic apply candidates.'));
  }
  if (writerBlockingItems(reviewIr.opaqueUnsupported).length > 0) {
    reasons.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', 'reviewIr.opaqueUnsupported', 'Unknown returned DOCX semantics block automatic apply.'));
  }
  const pairs = groupedReplacementPairs(reviewIr);
  reasons.push(...pairs.reasons);
  if (pairs.count === 0) {
    reasons.push(reason('RTK_WRITE_PRECONDITION_FAILED', 'reviewIr.textRevisions', 'A03-C02 requires at least one replacement pair.'));
  }
  if (authority.validSignedLocator !== true) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'exactAuthority.validSignedLocator', 'A03-C02 requires a verified signed locator signal.'));
  }
  if (authority.sceneRevisionUnchanged !== true || authority.rawSha256Unchanged !== true) {
    reasons.push(reason('RTK_BLOCKED_STALE_REVISION', 'exactAuthority.baseline', 'Scene revision and raw hash guards must be unchanged.'));
  }
  if (authority.nonOverlapping !== true) {
    reasons.push(reason('RTK_BLOCKED_TOKEN_CONTRADICTION', 'exactAuthority.nonOverlapping', 'A03-C02 requires non-overlapping text revisions.'));
  }
  if (authority.uniqueTarget !== true || authority.ambiguousDuplicate === true) {
    reasons.push(reason('RTK_BLOCKED_AMBIGUOUS_TEXT', 'exactAuthority.uniqueTarget', 'A03-C02 requires unique scene and block mapping.'));
  }
  if (authority.allRelevantXmlSemanticsAccounted !== true) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'exactAuthority.allRelevantXmlSemanticsAccounted', 'All relevant Word revision XML semantics must be accounted before apply.'));
  }
  return { ok: reasons.length === 0, reasons };
}

function validateBinding(binding) {
  const reasons = [];
  const changes = list(binding?.writerInput?.reviewItems);
  const digests = Array.isArray(binding?.trustedBlockRangeDigests)
    ? binding.trustedBlockRangeDigests.map(normalizeString).filter(Boolean)
    : [];
  if (binding?.ok !== true || binding?.status !== 'ready') {
    reasons.push(...list(binding?.reasons));
    reasons.push(reason(
      binding?.reason || 'RTK_WRITE_PRECONDITION_FAILED',
      'blockExactWriterBinding',
      'A03-C02 requires C04 writer binding to be ready.',
    ));
  }
  if (changes.length === 0 || digests.length !== changes.length) {
    reasons.push(reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'trustedBlockRangeDigests',
      'A03-C02 requires one locally trusted C05 block-range digest per replacement.',
      { changeCount: changes.length, digestCount: digests.length },
    ));
  }
  const seenRanges = [];
  const seenChangeIds = new Set();
  for (const change of changes) {
    const changeId = normalizeString(change.changeId);
    if (!changeId || seenChangeIds.has(changeId)) {
      reasons.push(reason('RTK_BLOCKED_DUPLICATE_TOKEN', 'writerInput.reviewItems.changeId', 'A03-C02 change ids must be unique.'));
    }
    seenChangeIds.add(changeId);
    const range = isPlainObject(change.match?.blockRange) ? change.match.blockRange : null;
    if (!range) {
      reasons.push(reason('RTK_WRITE_PRECONDITION_FAILED', `writerInput.reviewItems.${changeId}`, 'A03-C02 requires C05 block-range authority on every change.'));
      continue;
    }
    const from = Number.isSafeInteger(range.sceneStart) && Number.isSafeInteger(range.blockLocalStart)
      ? range.sceneStart + range.blockLocalStart
      : null;
    const to = Number.isSafeInteger(range.sceneStart) && Number.isSafeInteger(range.blockLocalEnd)
      ? range.sceneStart + range.blockLocalEnd
      : null;
    if (from === null || to === null || to < from) {
      reasons.push(reason('RTK_WRITE_PRECONDITION_FAILED', `writerInput.reviewItems.${changeId}.blockRange`, 'A03-C02 block-range offsets must be valid safe integers.'));
      continue;
    }
    const overlap = seenRanges.find((item) => from < item.to && to > item.from);
    if (overlap) {
      reasons.push(reason('RTK_BLOCKED_TOKEN_CONTRADICTION', 'writerInput.reviewItems.blockRange', 'A03-C02 ranges must be non-overlapping.', {
        changeId,
        overlappingChangeId: overlap.changeId,
      }));
    }
    seenRanges.push({ from, to, changeId });
  }
  return { ok: reasons.length === 0, reasons };
}

function buildSummary(binding, result = {}) {
  const changes = list(binding?.writerInput?.reviewItems);
  return {
    replacementPairCount: changes.length,
    trustedBlockRangeDigestCount: Array.isArray(binding?.trustedBlockRangeDigests)
      ? binding.trustedBlockRangeDigests.length
      : 0,
    writerBindingDigest: normalizeString(binding?.writerBindingDigest),
    admissionDigest: normalizeString(binding?.admissionDigest || binding?.admission?.admissionDigest),
    envelopeDigest: normalizeString(result?.envelope?.envelopeDigest || binding?.admission?.envelope?.envelopeDigest),
    outcomeDigest: normalizeString(result?.outcomeRecord?.outcomeDigest),
  };
}

export function buildNonOverlapTrackedReplacementRuntimePreview(input = {}, options = {}) {
  const physical = validatePhysicalScope({
    ...input,
    commandId: input.commandId || RTK_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
  });
  if (!physical.ok) return blockResult(physical.reasons);
  const binding = buildReviewTransportBlockExactWriterBindingV2(input, options);
  const bindingValidation = validateBinding(binding);
  if (!bindingValidation.ok) {
    return blockResult(bindingValidation.reasons, { binding });
  }
  return {
    ok: true,
    schemaVersion: RTK_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_SCHEMA,
    status: 'preview-ready',
    code: 'RTK_A03_C02_PREVIEW_READY',
    reason: 'RTK_A03_C02_PREVIEW_READY',
    canApply: true,
    canWriteManuscript: true,
    writerCalled: false,
    automaticApplyCertified: true,
    binding,
    summary: buildSummary(binding),
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentLoss: 0,
    },
  };
}

export async function applyNonOverlapTrackedReplacementRuntime(input = {}, options = {}) {
  const preview = buildNonOverlapTrackedReplacementRuntimePreview(input, options);
  if (!preview.ok) return preview;
  if (input.previewConfirmed !== true) {
    return blockResult(reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'previewConfirmed',
      'A03-C02 requires explicit preview confirmation before apply.',
    ), { preview });
  }
  const result = await applyReviewTransportBlockExactWriterBindingV2(input, options);
  return {
    ...result,
    schemaVersion: RTK_NON_OVERLAP_TRACKED_REPLACEMENT_RUNTIME_SCHEMA,
    commandId: RTK_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
    automaticApplyCertified: result?.status === 'applied' || result?.status === 'replay',
    previewDigest: normalizeString(preview.summary.envelopeDigest || preview.summary.admissionDigest),
    runtimeSummary: buildSummary(preview.binding, result),
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentLoss: 0,
    },
  };
}

export function createRtkNonOverlapTrackedReplacementCommandHandler(options = {}) {
  return async function handleRtkNonOverlapTrackedReplacementCommand(payload = {}) {
    return applyNonOverlapTrackedReplacementRuntime({
      ...payload,
      commandId: RTK_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
      callerRole: 'main',
      commandAuthority: {
        ...(isPlainObject(payload.commandAuthority) ? payload.commandAuthority : {}),
        issuer: 'main',
        intent: 'rtk.exactApply',
        commandId: RTK_NON_OVERLAP_TRACKED_REPLACEMENT_COMMAND_ID,
      },
    }, options);
  };
}
