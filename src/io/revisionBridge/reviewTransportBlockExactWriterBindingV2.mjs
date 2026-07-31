import { evaluateReviewTransportBlockExactAuthorityV2 } from './reviewTransportBlockExactAuthorityV2.mjs';
import { buildLocalReviewTransportBlockRangeAuthorityV2 } from './reviewTransportBlockRangeAuthorityV2.mjs';
import {
  applyReviewTransportIrV2ExactText,
  buildReviewTransportExactApplyAdmissionV2,
} from './reviewTransportExactApplyAdapterV2.mjs';

export const RTK_REVIEW_TRANSPORT_BLOCK_EXACT_WRITER_BINDING_V2_SCHEMA =
  'yalken.rtk.review-transport-block-exact-writer-binding.v2';
export const RTK_REVIEW_TRANSPORT_BLOCK_EXACT_WRITER_BINDING_V2_PROFILE =
  'bounded-block-exact-writer-binding-v2-c04';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function list(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function blockResult(reasons, details = {}) {
  const normalized = Array.isArray(reasons) ? reasons : [reasons];
  return {
    ok: false,
    schemaVersion: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_WRITER_BINDING_V2_SCHEMA,
    profileId: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_WRITER_BINDING_V2_PROFILE,
    status: 'blocked',
    code: normalized[0]?.code || 'RTK_WRITE_PRECONDITION_FAILED',
    reason: normalized[0]?.code || 'RTK_WRITE_PRECONDITION_FAILED',
    reasons: normalized,
    canApply: false,
    canWriteManuscript: false,
    writerCalled: false,
    writerBindingDigest: '',
    textCandidateBindings: [],
    writerInput: null,
    admissionInput: null,
    admission: null,
    ...details,
  };
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
      'C04 writer binding requires CryptoPort.',
    )],
  };
}

function reviewIrFrom(input) {
  if (isPlainObject(input.reviewIr)) return input.reviewIr;
  if (isPlainObject(input.analysis?.reviewIr)) return input.analysis.reviewIr;
  return {};
}

function revisionMap(reviewIr) {
  const map = new Map();
  for (const revision of list(reviewIr.textRevisions)) {
    const id = normalizeString(revision.nativeRevisionId);
    if (id) map.set(id, revision);
  }
  return map;
}

function commandSurfaceReasons(input) {
  const callerRole = normalizeString(input.callerRole);
  const authority = isPlainObject(input.commandAuthority) ? input.commandAuthority : {};
  if (
    callerRole !== 'main'
    || normalizeString(authority.issuer) !== 'main'
    || normalizeString(authority.intent) !== 'rtk.exactApply'
    || !normalizeString(authority.commandId)
  ) {
    return [reason(
      'RTK_COMMAND_AUTHORITY_BLOCKED',
      'commandAuthority',
      'C04 block-exact writer binding requires main-owned command authority.',
    )];
  }
  return [];
}

function writerContextFrom(input) {
  if (isPlainObject(input.writerContext)) return input.writerContext;
  if (isPlainObject(input.projectWriterContext)) return input.projectWriterContext;
  return {};
}

function writerInputBaseFrom(input, writerContext) {
  if (isPlainObject(input.writerInput)) return input.writerInput;
  if (isPlainObject(writerContext.writerInput)) return writerContext.writerInput;
  return {};
}

function sourceRevisionEvidence(anchor, revisions, cryptoPort) {
  const sourceIds = Array.isArray(anchor.sourceRevisionIds)
    ? anchor.sourceRevisionIds.map(normalizeString).filter(Boolean)
    : [];
  const source = sourceIds.map((id) => revisions.get(id)).filter(isPlainObject);
  if (anchor.kind === 'replacement-pair') {
    const deleted = source.find((item) => item.operation === 'delete');
    const inserted = source.find((item) => item.operation === 'insert');
    if (source.length !== 2 || !deleted || !inserted) {
      return {
        ok: false,
        reason: reason(
          'RTK_WRITE_PRECONDITION_FAILED',
          `exactTextAnchors.${normalizeString(anchor.candidateId)}`,
          'Replacement writer binding requires one delete and one insert source revision.',
        ),
      };
    }
    return {
      ok: true,
      expectedText: rawString(deleted.text),
      replacementText: rawString(inserted.text),
      sourceRevisionIds: sourceIds,
      evidenceDigest: cryptoPort.sha256Json({
        kind: 'replacement-pair',
        sourceRevisionIds: sourceIds,
        deletedText: rawString(deleted.text),
        insertedText: rawString(inserted.text),
      }),
    };
  }
  if (anchor.kind === 'delete') {
    const deleted = source.length === 1 ? source[0] : null;
    if (!deleted || deleted.operation !== 'delete') {
      return {
        ok: false,
        reason: reason(
          'RTK_WRITE_PRECONDITION_FAILED',
          `exactTextAnchors.${normalizeString(anchor.candidateId)}`,
          'Delete writer binding requires one delete source revision.',
        ),
      };
    }
    return {
      ok: true,
      expectedText: rawString(deleted.text),
      replacementText: '',
      sourceRevisionIds: sourceIds,
      evidenceDigest: cryptoPort.sha256Json({
        kind: 'delete',
        sourceRevisionIds: sourceIds,
        deletedText: rawString(deleted.text),
      }),
    };
  }
  return {
    ok: false,
    reason: reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      `exactTextAnchors.${normalizeString(anchor.candidateId) || 'unknown'}`,
      'C04 writer binding only admits delete and replacement-pair anchors.',
      { anchorKind: normalizeString(anchor.kind) },
    ),
  };
}

function validateAnchorDigest(anchor, evidence, cryptoPort) {
  const expectedDigest = cryptoPort.sha256Json({
    schemaVersion: 'yalken.rtk.review-transport-block-exact-authority.v2',
    expectedText: evidence.expectedText,
  });
  const observedDigest = normalizeString(anchor.expectedTextDigest);
  if (observedDigest !== expectedDigest) {
    return reason(
      'RTK_COMMAND_ENVELOPE_TAMPERED',
      `exactTextAnchors.${normalizeString(anchor.candidateId)}.expectedTextDigest`,
      'C04 writer binding anchor text digest does not match ReviewIR source text.',
      { expectedDigest, observedDigest },
    );
  }
  return null;
}

function buildTextChangesFromAnchors({ blockAuthority, reviewIr, input, cryptoPort }) {
  const reasons = [];
  const revisions = revisionMap(reviewIr);
  const anchors = list(blockAuthority.exactTextAnchors);
  const textChanges = [];
  const bindings = [];
  const trustedBlockRangeDigests = [];
  const seenCandidates = new Set();
  const sceneIds = new Set();
  const writerContext = writerContextFrom(input);
  const base = writerInputBaseFrom(input, writerContext);
  const projectSnapshot = isPlainObject(writerContext.projectSnapshot)
    ? writerContext.projectSnapshot
    : (isPlainObject(base.projectSnapshot) ? base.projectSnapshot : {});
  const localBaseline = isPlainObject(input.localBaseline)
    ? input.localBaseline
    : (isPlainObject(input.baseline) ? input.baseline : {});

  if (anchors.length === 0) {
    reasons.push(reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'exactTextAnchors',
      'C04 writer binding requires C03 exact text anchors.',
    ));
  }

  for (const anchor of anchors) {
    const candidateId = normalizeString(anchor.candidateId);
    const sceneId = normalizeString(anchor.sceneId || blockAuthority.targetSceneId);
    if (!candidateId || seenCandidates.has(candidateId)) {
      reasons.push(reason(
        'RTK_BLOCKED_DUPLICATE_TOKEN',
        `exactTextAnchors.${candidateId || 'missing'}`,
        'C04 writer binding requires unique full candidate ids.',
      ));
      continue;
    }
    seenCandidates.add(candidateId);
    if (!sceneId) {
      reasons.push(reason(
        'RTK_WRITE_PRECONDITION_FAILED',
        `exactTextAnchors.${candidateId}.sceneId`,
        'C04 writer binding requires an explicit target scene id.',
      ));
      continue;
    }
    sceneIds.add(sceneId);
    const evidence = sourceRevisionEvidence(anchor, revisions, cryptoPort);
    if (!evidence.ok) {
      reasons.push(evidence.reason);
      continue;
    }
    const digestReason = validateAnchorDigest(anchor, evidence, cryptoPort);
    if (digestReason) {
      reasons.push(digestReason);
      continue;
    }
    const blockId = normalizeString(anchor.blockId || blockAuthority.targetBlockId);
    const match = {
      kind: 'exact',
      quote: evidence.expectedText,
      blockId,
      blockLocalStart: Number.isInteger(anchor.start) ? anchor.start : null,
      blockLocalEnd: Number.isInteger(anchor.end) ? anchor.end : null,
    };
    const blockRangeAuthority = buildLocalReviewTransportBlockRangeAuthorityV2({
      sceneId,
      blockId,
      expectedText: evidence.expectedText,
      blockLocalStart: match.blockLocalStart,
      blockLocalEnd: match.blockLocalEnd,
      projectSnapshot,
      localBaseline,
    }, { cryptoPort });
    if (blockRangeAuthority.ok) {
      match.blockRange = blockRangeAuthority.authority;
      trustedBlockRangeDigests.push(normalizeString(blockRangeAuthority.authority.rangeDigest));
    }
    textChanges.push({
      changeId: candidateId,
      targetScope: { type: 'scene', id: sceneId },
      match,
      replacementText: evidence.replacementText,
      sourceRevisionIds: evidence.sourceRevisionIds,
      bindingDigest: evidence.evidenceDigest,
      authorityCandidateId: candidateId,
    });
    bindings.push({ candidateId, changeId: candidateId });
  }

  if (sceneIds.size > 1) {
    reasons.push(reason(
      'RTK_BLOCKED_STRUCTURAL',
      'exactTextAnchors.sceneId',
      'C04 writer binding is single-scene only until range writer support is proven.',
      { sceneIds: [...sceneIds].sort() },
    ));
  }

  return { textChanges, bindings, reasons, trustedBlockRangeDigests };
}

function buildWriterInput({ input, textChanges }) {
  const writerContext = writerContextFrom(input);
  const base = writerInputBaseFrom(input, writerContext);
  const projectSnapshot = cloneJsonSafe(
    writerContext.projectSnapshot || base.projectSnapshot || {},
  );
  const revisionSessionBase = cloneJsonSafe(
    writerContext.revisionSession || base.revisionSession || {},
  );
  const reviewGraph = isPlainObject(revisionSessionBase.reviewGraph)
    ? cloneJsonSafe(revisionSessionBase.reviewGraph)
    : {};
  const revisionSession = {
    ...revisionSessionBase,
    reviewGraph: {
      ...reviewGraph,
      textChanges: cloneJsonSafe(textChanges),
    },
  };
  return {
    ...cloneJsonSafe(base),
    projectRoot: normalizeString(writerContext.projectRoot || base.projectRoot),
    scenePath: normalizeString(writerContext.scenePath || base.scenePath),
    scenePathBySceneId: cloneJsonSafe(writerContext.scenePathBySceneId || base.scenePathBySceneId || {}),
    projectSnapshot,
    revisionSession,
    reviewItems: cloneJsonSafe(textChanges),
    textChanges: cloneJsonSafe(textChanges),
  };
}

function writerInputReasons(writerInput) {
  const reasons = [];
  if (!normalizeString(writerInput.projectRoot)) {
    reasons.push(reason('RTK_WRITE_PRECONDITION_FAILED', 'writerInput.projectRoot', 'Project root is required.'));
  }
  if (!normalizeString(writerInput.scenePath)) {
    reasons.push(reason('RTK_WRITE_PRECONDITION_FAILED', 'writerInput.scenePath', 'Scene path is required.'));
  }
  if (!isPlainObject(writerInput.projectSnapshot) || !normalizeString(writerInput.projectSnapshot.projectId)) {
    reasons.push(reason('RTK_WRITE_PRECONDITION_FAILED', 'writerInput.projectSnapshot', 'Project snapshot is required.'));
  }
  if (!isPlainObject(writerInput.revisionSession) || !normalizeString(writerInput.revisionSession.sessionId)) {
    reasons.push(reason('RTK_WRITE_PRECONDITION_FAILED', 'writerInput.revisionSession', 'Revision session is required.'));
  }
  if (list(writerInput.reviewItems).length === 0) {
    reasons.push(reason('RTK_WRITE_PRECONDITION_FAILED', 'writerInput.reviewItems', 'Writer review items are required.'));
  }
  return reasons;
}

function computeBlockAuthority(input, cryptoPort) {
  const computed = evaluateReviewTransportBlockExactAuthorityV2(input, { cryptoPort });
  const provided = isPlainObject(input.blockExactAuthority)
    ? input.blockExactAuthority
    : (isPlainObject(input.blockAuthority) ? input.blockAuthority : null);
  if (!provided) return { computed, reasons: [] };
  const observedDigest = normalizeString(provided.authorityDigest);
  const expectedDigest = normalizeString(computed.authorityDigest);
  if (!observedDigest || !expectedDigest || observedDigest !== expectedDigest) {
    return {
      computed,
      reasons: [reason(
        'RTK_COMMAND_ENVELOPE_TAMPERED',
        'blockExactAuthority.authorityDigest',
        'Provided C03 block authority digest does not match current ReviewIR, carrier, and baseline.',
        { expectedDigest, observedDigest },
      )],
    };
  }
  return { computed, reasons: [] };
}

export function buildReviewTransportBlockExactWriterBindingV2(input = {}, options = {}) {
  const cryptoState = resolveCryptoPort(options.cryptoPort);
  if (!cryptoState.ok) return blockResult(cryptoState.reasons);
  const cryptoPort = cryptoState.port;
  const surfaceReasons = commandSurfaceReasons(input);
  if (surfaceReasons.length > 0) return blockResult(surfaceReasons);

  const reviewIr = reviewIrFrom(input);
  const blockAuthorityState = computeBlockAuthority(input, cryptoPort);
  const blockAuthority = blockAuthorityState.computed;
  const reasons = [...blockAuthorityState.reasons];
  if (blockAuthority.ok !== true || blockAuthority.status !== 'exact-authority-ready') {
    reasons.push(...list(blockAuthority.reasons));
    reasons.push(reason(
      blockAuthority.code || 'RTK_WRITE_PRECONDITION_FAILED',
      'blockExactAuthority',
      'C04 writer binding requires C03 exact-authority-ready status.',
    ));
  }
  if (blockAuthority.canApply !== false || blockAuthority.canWriteManuscript !== false) {
    reasons.push(reason(
      'RTK_COMMAND_ENVELOPE_TAMPERED',
      'blockExactAuthority.canApply',
      'C03 block authority must remain analysis-only and cannot self-authorize writes.',
    ));
  }
  if (blockAuthority.falseExactGuards?.parserWriteAuthority !== false
    || blockAuthority.falseExactGuards?.blockAuthorityWriteAuthority !== false) {
    reasons.push(reason(
      'RTK_COMMAND_ENVELOPE_TAMPERED',
      'blockExactAuthority.falseExactGuards',
      'C04 requires C03 parser and block-authority writer guards to remain false.',
    ));
  }

  const builtChanges = buildTextChangesFromAnchors({
    blockAuthority,
    reviewIr,
    input,
    cryptoPort,
  });
  reasons.push(...builtChanges.reasons);
  const writerInput = buildWriterInput({ input, textChanges: builtChanges.textChanges });
  reasons.push(...writerInputReasons(writerInput));

  if (reasons.length > 0) {
    return blockResult(reasons, {
      blockAuthority: cloneJsonSafe(blockAuthority || {}),
      writerInput,
      textCandidateBindings: builtChanges.bindings,
    });
  }

  const envelopeBase = isPlainObject(input.envelopeInput) ? cloneJsonSafe(input.envelopeInput) : cloneJsonSafe(input);
  const admissionInput = {
    ...envelopeBase,
    callerRole: 'main',
    commandAuthority: cloneJsonSafe(input.commandAuthority),
    reviewIr: cloneJsonSafe(reviewIr),
    exactAuthority: cloneJsonSafe(blockAuthority.exactAuthority),
    textCandidateBindings: cloneJsonSafe(builtChanges.bindings),
    trustedBlockRangeDigests: cloneJsonSafe(builtChanges.trustedBlockRangeDigests),
    writerInput,
  };
  const admission = buildReviewTransportExactApplyAdmissionV2(admissionInput, { cryptoPort });
  if (!admission.ok) {
    return blockResult(admission.reasons, {
      blockAuthority: cloneJsonSafe(blockAuthority),
      textCandidateBindings: builtChanges.bindings,
      writerInput,
      admissionInput,
      admission,
    });
  }

  const writerBindingUnsigned = {
    schemaVersion: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_WRITER_BINDING_V2_SCHEMA,
    profileId: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_WRITER_BINDING_V2_PROFILE,
    authorityDigest: normalizeString(blockAuthority.authorityDigest),
    admissionDigest: normalizeString(admission.admissionDigest),
    textCandidateBindings: builtChanges.bindings,
    textChanges: builtChanges.textChanges.map((item) => ({
      changeId: item.changeId,
      targetScope: item.targetScope,
      match: item.match,
      replacementText: item.replacementText,
      sourceRevisionIds: item.sourceRevisionIds,
      authorityCandidateId: item.authorityCandidateId,
    })),
    writerAuthority: 'main-command-kernel-only',
    duplicateSceneTextLimitation: 'existing-exact-writer-still-requires-unique-scene-quote',
    blockRangeWriterAuthority: builtChanges.trustedBlockRangeDigests.length > 0
      ? 'locally-bound-c05-ready'
      : 'unavailable',
  };

  return {
    ok: true,
    ...writerBindingUnsigned,
    status: 'ready',
    code: 'RTK_COMMAND_ENVELOPE_BOUND',
    reason: 'RTK_COMMAND_ENVELOPE_BOUND',
    reasons: [],
    canApply: true,
    canWriteManuscript: true,
    writerCalled: false,
    writerBindingDigest: cryptoPort.sha256Json(writerBindingUnsigned),
    blockAuthority: cloneJsonSafe(blockAuthority),
    writerInput,
    admissionInput,
    admission,
    trustedBlockRangeDigests: cloneJsonSafe(builtChanges.trustedBlockRangeDigests),
    falseExactGuards: {
      globalTextSearchAuthority: false,
      fuzzyMatchAuthority: false,
      parserWriteAuthority: false,
      rendererWriteAuthority: false,
      blockAuthoritySelfWriteAuthority: false,
    },
  };
}

export async function applyReviewTransportBlockExactWriterBindingV2(input = {}, options = {}) {
  const binding = buildReviewTransportBlockExactWriterBindingV2(input, options);
  if (!binding.ok) {
    return {
      ...binding,
      type: 'yalken.rtk.reviewTransportBlockExactWriterBindingV2',
      applied: false,
    };
  }
  const exactWriterOptions = {
    ...(isPlainObject(options.exactWriterOptions) ? options.exactWriterOptions : {}),
    trustedBlockRangeDigests: cloneJsonSafe(binding.trustedBlockRangeDigests || []),
  };
  const result = await applyReviewTransportIrV2ExactText(binding.admissionInput, {
    ...options,
    exactWriterOptions,
  });
  return {
    ...result,
    type: 'yalken.rtk.reviewTransportBlockExactWriterBindingV2',
    schemaVersion: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_WRITER_BINDING_V2_SCHEMA,
    profileId: RTK_REVIEW_TRANSPORT_BLOCK_EXACT_WRITER_BINDING_V2_PROFILE,
    writerBindingDigest: binding.writerBindingDigest,
    admissionDigest: binding.admission.admissionDigest,
    classificationDigest: binding.admission.classificationDigest,
    blockAuthorityDigest: normalizeString(binding.blockAuthority.authorityDigest),
    textCandidateBindings: cloneJsonSafe(binding.textCandidateBindings),
    falseExactGuards: cloneJsonSafe(binding.falseExactGuards),
  };
}
