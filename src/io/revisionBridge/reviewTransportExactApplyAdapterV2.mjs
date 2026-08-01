import { classifyReviewTransportIrV2 } from './reviewTransportClassifierV2.mjs';
import {
  applyReviewTransportExactApply,
  buildReviewTransportExactApplyEnvelope,
} from './reviewTransportExactApply.mjs';
import { stableJson } from './reviewTransportCore.mjs';

export const RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADMISSION_V2_SCHEMA =
  'yalken.rtk.review-transport-exact-apply-admission.v2';
export const RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADAPTER_V2_PROFILE =
  'bounded-review-ir-exact-apply-adapter-v2-b05';

const EXACT_DISPOSITION = 'EXACT_AUTOMATIC_CANDIDATE';
const REQUIRED_COMMAND_INTENT = 'rtk.exactApply';

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

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(Object(object), key);
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function blockResult(reasons, details = {}) {
  const normalized = Array.isArray(reasons) ? reasons : [reasons];
  return {
    ok: false,
    schemaVersion: RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADMISSION_V2_SCHEMA,
    adapterProfile: RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADAPTER_V2_PROFILE,
    status: 'blocked',
    code: normalized[0]?.code || 'RTK_WRITE_PRECONDITION_FAILED',
    reason: normalized[0]?.code || 'RTK_WRITE_PRECONDITION_FAILED',
    reasons: normalized,
    canApply: false,
    canWriteManuscript: false,
    writerCalled: false,
    envelopeInput: null,
    envelope: null,
    ...details,
  };
}

function resolveCryptoPort(port) {
  if (typeof port?.sha256Text === 'function' && typeof port?.sha256Json === 'function') {
    return { ok: true, port };
  }
  return {
    ok: false,
    port: null,
    reasons: [reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'cryptoPort',
      'B05 exact apply admission requires CryptoPort.',
    )],
  };
}

function canonicalDigest(cryptoPort, value) {
  return cryptoPort.sha256Json(value);
}

function normalizeReviewItems(writerInput) {
  const items = Array.isArray(writerInput?.reviewItems)
    ? writerInput.reviewItems
    : Array.isArray(writerInput?.textChanges)
      ? writerInput.textChanges
      : [];
  return items.filter(isPlainObject).map((item) => {
    const textChange = isPlainObject(item.textChange) ? item.textChange : item;
    return {
      source: textChange,
      changeId: normalizeString(textChange.changeId),
      sceneId: normalizeString(textChange.targetScope?.id),
      targetScopeType: normalizeString(textChange.targetScope?.type),
      matchKind: normalizeString(textChange.match?.kind),
      quote: rawString(textChange.match?.quote),
      hasReplacementText: hasOwn(textChange, 'replacementText'),
      replacementText: rawString(textChange.replacementText),
    };
  });
}

function reviewIrFrom(input) {
  if (isPlainObject(input.reviewIr)) return input.reviewIr;
  if (isPlainObject(input.analysis?.reviewIr)) return input.analysis.reviewIr;
  return {};
}

function textRevisionMap(reviewIr) {
  const map = new Map();
  for (const revision of list(reviewIr.textRevisions)) {
    const id = normalizeString(revision.nativeRevisionId);
    if (id) map.set(id, revision);
  }
  return map;
}

function candidateTextEvidence(candidate, reviewIr) {
  const revisions = textRevisionMap(reviewIr);
  if (candidate.kind === 'replacement-pair') {
    const sourceIds = Array.isArray(candidate.sourceRevisionIds) ? candidate.sourceRevisionIds : [];
    const source = list(sourceIds.map((id) => revisions.get(id)));
    const deleted = source.find((item) => item.operation === 'delete');
    const inserted = source.find((item) => item.operation === 'insert');
    if (!deleted || !inserted) {
      return {
        ok: false,
        reason: reason(
          'RTK_WRITE_PRECONDITION_FAILED',
          `textCandidate.${candidate.candidateId}`,
          'Replacement candidate must bind one delete and one insert revision.',
        ),
      };
    }
    return {
      ok: true,
      operation: 'replacement-pair',
      expectedText: rawString(deleted.text),
      replacementText: rawString(inserted.text),
    };
  }
  const revision = revisions.get(normalizeString(candidate.sourceRevisionIds?.[0]));
  if (!revision) {
    return {
      ok: false,
      reason: reason(
        'RTK_WRITE_PRECONDITION_FAILED',
        `textCandidate.${candidate.candidateId}`,
        'Text candidate must bind to its source revision.',
      ),
    };
  }
  if (candidate.kind === 'delete' || revision.operation === 'delete') {
    return {
      ok: true,
      operation: 'delete',
      expectedText: rawString(revision.text),
      replacementText: '',
    };
  }
  return {
    ok: false,
    reason: reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      `textCandidate.${candidate.candidateId}`,
      'Standalone insert is not admitted by the existing exact replacement writer.',
      { operation: normalizeString(revision.operation || candidate.kind) },
    ),
  };
}

function classifyForAdmission(input, cryptoPort) {
  const computed = classifyReviewTransportIrV2(input, { cryptoPort });
  if (!isPlainObject(input.classification)) return { ok: true, classification: computed };
  if (normalizeString(input.classification.classificationDigest) !== normalizeString(computed.classificationDigest)) {
    return {
      ok: false,
      reasons: [reason(
        'RTK_COMMAND_ENVELOPE_TAMPERED',
        'classification',
        'Provided classification digest does not match current ReviewIR and authority.',
        {
          expectedDigest: computed.classificationDigest,
          observedDigest: normalizeString(input.classification.classificationDigest),
        },
      )],
      classification: computed,
    };
  }
  return { ok: true, classification: computed };
}

function nonWriterLaneSummary(classification) {
  const classifications = isPlainObject(classification?.classifications) ? classification.classifications : {};
  return {
    comments: list(classifications.comments).length,
    blockedComments: list(classifications.comments).filter((item) => item.disposition === 'BLOCKED').length,
    properties: list(classifications.properties).length,
    formatting: list(classifications.formatting).length,
    moves: list(classifications.moves).length,
    structure: list(classifications.structure).filter((item) => item.disposition === 'BLOCKED').length,
    opaqueUnsupported: list(classifications.opaqueUnsupported).length,
  };
}

function validateTextAdmission({ classification, reviewIr, writerInput, bindings }) {
  const reasons = [];
  const classifications = isPlainObject(classification?.classifications) ? classification.classifications : {};
  const textCandidates = list(classifications.text);
  const exactTextCandidates = textCandidates.filter((item) => item.disposition === EXACT_DISPOSITION);
  const writerChanges = normalizeReviewItems(writerInput);
  const writerById = new Map(writerChanges.map((item) => [item.changeId, item]));
  const bindingList = list(bindings);
  const boundCandidateIds = new Set();
  const boundChangeIds = new Set();

  if (exactTextCandidates.length === 0) {
    reasons.push(reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'classifications.text',
      'No exact text candidates are available for B05 apply admission.',
    ));
  }
  for (const candidate of textCandidates) {
    if (candidate.disposition !== EXACT_DISPOSITION) {
      reasons.push(reason(
        candidate.reasonCode || 'RTK_MANUAL_DEGRADED_LOCATOR',
        `classifications.text.${candidate.candidateId}`,
        'Every text candidate in a B05 apply batch must already be exact.',
      ));
    }
  }
  if (list(classifications.moves).length > 0) {
    reasons.push(reason('RTK_BLOCKED_MOVE_REVISION', 'classifications.moves', 'Move revisions are never admitted for automatic apply.'));
  }
  if (list(classifications.structure).some((item) => item.disposition === 'BLOCKED')) {
    reasons.push(reason('RTK_BLOCKED_STRUCTURAL', 'classifications.structure', 'Structural changes are blocked from automatic apply.'));
  }
  if (list(classifications.opaqueUnsupported).some((item) => item.disposition === 'BLOCKED')) {
    reasons.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', 'classifications.opaqueUnsupported', 'Unknown package semantics block automatic apply.'));
  }
  if (bindingList.length !== exactTextCandidates.length || writerChanges.length !== exactTextCandidates.length) {
    reasons.push(reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'textCandidateBindings',
      'B05 apply admission requires one explicit candidate binding per exact writer change.',
      {
        exactTextCandidateCount: exactTextCandidates.length,
        bindingCount: bindingList.length,
        writerChangeCount: writerChanges.length,
      },
    ));
  }

  const exactById = new Map(exactTextCandidates.map((item) => [normalizeString(item.candidateId), item]));
  for (const binding of bindingList) {
    const candidateId = normalizeString(binding.candidateId);
    const changeId = normalizeString(binding.changeId);
    const candidate = exactById.get(candidateId);
    const writerChange = writerById.get(changeId);
    if (!candidate) {
      reasons.push(reason(
        'RTK_WRITE_PRECONDITION_FAILED',
        `textCandidateBindings.${candidateId}`,
        'Binding references a non-exact or missing candidate.',
      ));
      continue;
    }
    if (!writerChange) {
      reasons.push(reason(
        'RTK_WRITE_PRECONDITION_FAILED',
        `textCandidateBindings.${candidateId}.changeId`,
        'Binding references a missing writer change.',
      ));
      continue;
    }
    if (boundCandidateIds.has(candidateId) || boundChangeIds.has(changeId)) {
      reasons.push(reason(
        'RTK_BLOCKED_DUPLICATE_TOKEN',
        `textCandidateBindings.${candidateId}`,
        'Candidate and writer change bindings must be one-to-one.',
      ));
      continue;
    }
    boundCandidateIds.add(candidateId);
    boundChangeIds.add(changeId);

    const evidence = candidateTextEvidence(candidate, reviewIr);
    if (!evidence.ok) {
      reasons.push(evidence.reason);
      continue;
    }
    if (writerChange.targetScopeType !== 'scene' || writerChange.matchKind !== 'exact') {
      reasons.push(reason(
        'RTK_WRITE_PRECONDITION_FAILED',
        `writerInput.${changeId}`,
        'Bound writer change must target an exact scene match.',
      ));
    }
    if (!writerChange.hasReplacementText) {
      reasons.push(reason(
        'RTK_WRITE_PRECONDITION_FAILED',
        `writerInput.${changeId}.replacementText`,
        'Bound writer change must carry explicit replacementText.',
      ));
    }
    if (writerChange.quote !== evidence.expectedText || writerChange.replacementText !== evidence.replacementText) {
      reasons.push(reason(
        'RTK_COMMAND_ENVELOPE_TAMPERED',
        `writerInput.${changeId}`,
        'Bound writer change text does not match ReviewIR text evidence.',
        { candidateId },
      ));
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    exactTextCandidateCount: exactTextCandidates.length,
    writerChangeCount: writerChanges.length,
    boundChangeIds: [...boundChangeIds].sort(),
  };
}

function validateCommandSurface(input) {
  const authority = isPlainObject(input.commandAuthority) ? input.commandAuthority : {};
  const callerRole = normalizeString(input.callerRole);
  if (
    callerRole !== 'main'
    || normalizeString(authority.issuer) !== 'main'
    || normalizeString(authority.intent) !== REQUIRED_COMMAND_INTENT
    || !normalizeString(authority.commandId)
  ) {
    return [reason(
      'RTK_COMMAND_AUTHORITY_BLOCKED',
      'commandAuthority',
      'B05 exact apply admission requires main-owned command authority.',
    )];
  }
  return [];
}

function commentLaneDisposition(classification) {
  const comments = list(classification?.classifications?.comments);
  if (comments.length === 0) return 'RTK_COMMENT_UNSUPPORTED';
  if (comments.some((item) => item.reasonCode === 'RTK_COMMENT_RESOLVED')) return 'RTK_COMMENT_RESOLVED';
  if (comments.some((item) => item.reasonCode === 'RTK_COMMENT_ORPHAN')) return 'RTK_COMMENT_ORPHAN';
  if (comments.some((item) => item.disposition === 'BLOCKED')) return 'RTK_COMMENT_UNSUPPORTED';
  return 'RTK_COMMENT_ANCHORED';
}

export function buildReviewTransportExactApplyAdmissionV2(input = {}, options = {}) {
  const cryptoState = resolveCryptoPort(options.cryptoPort);
  if (!cryptoState.ok) return blockResult(cryptoState.reasons);
  const cryptoPort = cryptoState.port;
  const reviewIr = reviewIrFrom(input);
  const writerInput = isPlainObject(input.writerInput) ? input.writerInput : input.envelopeInput?.writerInput;
  const commandSurfaceReasons = validateCommandSurface(input);
  if (commandSurfaceReasons.length > 0) return blockResult(commandSurfaceReasons);

  const classified = classifyForAdmission(input, cryptoPort);
  const classification = classified.classification;
  if (!classified.ok) {
    return blockResult(classified.reasons, {
      classification,
      classificationDigest: normalizeString(classification?.classificationDigest),
    });
  }
  if (classification?.ok !== true) {
    return blockResult(classification?.reasons || reason(
      'RTK_WRITE_PRECONDITION_FAILED',
      'classification',
      'ReviewIR classification must pass before apply admission.',
    ), {
      classification,
      classificationDigest: normalizeString(classification?.classificationDigest),
    });
  }

  const textAdmission = validateTextAdmission({
    classification,
    reviewIr,
    writerInput,
    bindings: input.textCandidateBindings,
  });
  if (!textAdmission.ok) {
    return blockResult(textAdmission.reasons, {
      classification,
      classificationDigest: normalizeString(classification.classificationDigest),
      manualNonWriterLanes: nonWriterLaneSummary(classification),
    });
  }

  const envelopeBase = isPlainObject(input.envelopeInput) ? cloneJsonSafe(input.envelopeInput) : cloneJsonSafe(input);
  const envelopeInput = {
    ...envelopeBase,
    callerRole: 'main',
    commandAuthority: cloneJsonSafe(input.commandAuthority),
    candidateDisposition: {
      ...cloneJsonSafe(envelopeBase.candidateDisposition || {}),
      textLane: 'RTK_EXACT_APPLICABLE',
      commentLane: commentLaneDisposition(classification),
      priority: 'TEXT_BEFORE_COMMENT',
    },
    commentLane: cloneJsonSafe(classification.classifications?.comments || []),
    writerInput: cloneJsonSafe(writerInput),
  };
  const built = buildReviewTransportExactApplyEnvelope(envelopeInput, { cryptoPort });
  if (!built.ok) {
    return blockResult(built.reasons, {
      classification,
      classificationDigest: normalizeString(classification.classificationDigest),
      manualNonWriterLanes: nonWriterLaneSummary(classification),
    });
  }

  const admissionUnsigned = {
    schemaVersion: RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADMISSION_V2_SCHEMA,
    adapterProfile: RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADAPTER_V2_PROFILE,
    classificationDigest: normalizeString(classification.classificationDigest),
    envelopeDigest: normalizeString(built.envelope.envelopeDigest),
    exactTextCandidateCount: textAdmission.exactTextCandidateCount,
    writerChangeCount: textAdmission.writerChangeCount,
    boundChangeIds: textAdmission.boundChangeIds,
    manualNonWriterLanes: nonWriterLaneSummary(classification),
    checkpointRequired: true,
    outcomeLedgerRequired: true,
    writerAuthority: 'main-command-kernel-only',
    classifierWriteAuthority: false,
    parserWriteAuthority: false,
    commentsWriteAuthority: false,
    formattingWriteAuthority: false,
  };

  return {
    ok: true,
    ...admissionUnsigned,
    status: 'ready',
    code: 'RTK_COMMAND_ENVELOPE_BOUND',
    reason: 'RTK_COMMAND_ENVELOPE_BOUND',
    reasons: [],
    canApply: true,
    canWriteManuscript: true,
    writerCalled: false,
    admissionDigest: canonicalDigest(cryptoPort, admissionUnsigned),
    classification,
    envelopeInput,
    envelope: built.envelope,
  };
}

export async function applyReviewTransportIrV2ExactText(input = {}, options = {}) {
  const admission = buildReviewTransportExactApplyAdmissionV2(input, options);
  if (!admission.ok) {
    return {
      ...admission,
      type: 'yalken.rtk.reviewTransportExactApplyAdapterV2',
      applied: false,
    };
  }
  const result = await applyReviewTransportExactApply({
    envelopeInput: admission.envelopeInput,
    envelope: admission.envelope,
  }, options);
  return {
    ...result,
    type: 'yalken.rtk.reviewTransportExactApplyAdapterV2',
    schemaVersion: RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADMISSION_V2_SCHEMA,
    adapterProfile: RTK_REVIEW_TRANSPORT_EXACT_APPLY_ADAPTER_V2_PROFILE,
    admissionDigest: admission.admissionDigest,
    classificationDigest: admission.classificationDigest,
    manualNonWriterLanes: admission.manualNonWriterLanes,
    checkpointRequired: true,
    outcomeLedgerRequired: true,
  };
}
