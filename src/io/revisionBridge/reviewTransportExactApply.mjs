import crypto from 'node:crypto';

import { applyExactTextBatchMinSafeWrite } from './exactTextMinSafeWrite.mjs';
import { reconcilePendingExactTextApplyJournals } from './exactTextApplyJournal.mjs';
import {
  buildRtkExactApplyCommandEnvelope,
  buildRtkExactApplyOutcomeRecord,
  buildRtkExactApplyRecoveryResolution,
  validateRtkExactApplyCommandEnvelope,
} from './reviewTransportApplyCore.mjs';
import {
  findRtkExactApplyOutcome,
  writeRtkExactApplyOutcomeRecord,
  writeRtkExactApplyRecoveryResolution,
} from './reviewTransportApplyStore.mjs';
import { stableJson } from './reviewTransportCore.mjs';

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

export function createNodeRtkCryptoPort() {
  return {
    sha256Text(value) {
      return crypto.createHash('sha256').update(Buffer.from(rawString(value), 'utf8')).digest('hex');
    },
    sha256Json(value) {
      return `sha256:${this.sha256Text(stableJson(value))}`;
    },
  };
}

function block(reason, details = {}) {
  return {
    ok: false,
    type: 'yalken.rtk.exactApply',
    status: 'blocked',
    code: reason.code,
    reason: reason.code,
    reasons: [reason],
    applied: false,
    writerCalled: false,
    ...details,
  };
}

function writerBlock(writerResult, details = {}) {
  const reasons = Array.isArray(writerResult?.reasons) ? cloneJsonSafe(writerResult.reasons) : [];
  return {
    ok: false,
    type: 'yalken.rtk.exactApply',
    status: normalizeString(writerResult?.status) || 'blocked',
    code: normalizeString(writerResult?.reason) || 'RTK_WRITE_PRECONDITION_FAILED',
    reason: normalizeString(writerResult?.reason) || 'RTK_WRITE_PRECONDITION_FAILED',
    reasons,
    applied: false,
    writerCalled: true,
    writerResult: cloneJsonSafe(writerResult || {}),
    ...details,
  };
}

function applied(writerResult, outcomeRecord, details = {}) {
  return {
    ok: true,
    type: 'yalken.rtk.exactApply',
    status: 'applied',
    code: 'RTK_EXACT_APPLICABLE',
    reason: 'RTK_EXACT_APPLICABLE',
    reasons: [],
    applied: true,
    writerCalled: true,
    writerResult: cloneJsonSafe(writerResult),
    outcomeRecord: cloneJsonSafe(outcomeRecord),
    ...details,
  };
}

function replay(match, details = {}) {
  return {
    ok: true,
    type: 'yalken.rtk.exactApply',
    status: 'replay',
    code: 'RTK_ALREADY_APPLIED',
    reason: 'RTK_ALREADY_APPLIED',
    reasons: [],
    applied: false,
    writerCalled: false,
    outcomeRecord: cloneJsonSafe(match),
    ...details,
  };
}

function operationIdFromEnvelope(envelope) {
  const hex = normalizeString(envelope?.requestKey).replace(/^sha256:/u, '');
  return `op_${hex.slice(0, 48)}`;
}

function hasTextCandidates(envelope) {
  return Number(envelope?.textLane?.semanticChangeCount) > 0;
}

async function reconcileBeforeApply(projectRoot, envelope, cryptoPort, options = {}) {
  const reconciliation = await reconcilePendingExactTextApplyJournals(projectRoot, {
    now: options.now,
  });
  if (reconciliation.ok && reconciliation.userRelevant.length === 0) {
    return null;
  }
  const record = buildRtkExactApplyRecoveryResolution(envelope, reconciliation, { cryptoPort });
  await writeRtkExactApplyRecoveryResolution(projectRoot, record);
  return block({
    code: 'RTK_BLOCKED_RECONCILING',
    field: 'exactTextApplyJournal',
    message: 'Pending exact writer journal reconciliation must be resolved before apply.',
  }, {
    reconciliation,
    recoveryResolution: record,
  });
}

export function buildReviewTransportExactApplyEnvelope(input = {}, options = {}) {
  const cryptoPort = options.cryptoPort || createNodeRtkCryptoPort();
  return buildRtkExactApplyCommandEnvelope(input, { cryptoPort });
}

export async function applyReviewTransportExactApply(input = {}, options = {}) {
  const cryptoPort = options.cryptoPort || createNodeRtkCryptoPort();
  const envelopeInput = isPlainObject(input.envelopeInput) ? input.envelopeInput : input;
  const built = buildRtkExactApplyCommandEnvelope(envelopeInput, { cryptoPort });
  if (!built.ok) return block(built.reasons[0], { reasons: built.reasons });
  const providedEnvelope = isPlainObject(input.envelope) ? input.envelope : built.envelope;
  const validated = validateRtkExactApplyCommandEnvelope(envelopeInput, providedEnvelope, { cryptoPort });
  if (!validated.ok) return block(validated.reasons[0], { reasons: validated.reasons });
  const envelope = validated.envelope;
  const writerInput = isPlainObject(envelopeInput.writerInput) ? envelopeInput.writerInput : {};
  const projectRoot = normalizeString(writerInput.projectRoot || input.projectRoot);

  if (!hasTextCandidates(envelope)) {
    return block({
      code: 'RTK_COMMENT_UNSUPPORTED',
      field: 'textLane.semanticChangeCount',
      message: 'Comment-only return evidence cannot authorize manuscript text mutation.',
    }, { envelope });
  }

  const preflightReplay = await findRtkExactApplyOutcome(projectRoot, envelope);
  if (preflightReplay.requestMatch) {
    return replay(preflightReplay.requestMatch, { replayKind: 'request', envelope });
  }
  if (preflightReplay.sameRoundEffectMatch) {
    return replay(preflightReplay.sameRoundEffectMatch, { replayKind: 'same_round_effect', envelope });
  }

  const reconciliationBlock = await reconcileBeforeApply(projectRoot, envelope, cryptoPort, options);
  if (reconciliationBlock) return { ...reconciliationBlock, envelope };

  const revalidated = validateRtkExactApplyCommandEnvelope(envelopeInput, envelope, { cryptoPort });
  if (!revalidated.ok) return block(revalidated.reasons[0], { reasons: revalidated.reasons, envelope });

  const postRecheckReplay = await findRtkExactApplyOutcome(projectRoot, envelope);
  if (postRecheckReplay.requestMatch) {
    return replay(postRecheckReplay.requestMatch, { replayKind: 'request_post_recheck', envelope });
  }
  if (postRecheckReplay.sameRoundEffectMatch) {
    return replay(postRecheckReplay.sameRoundEffectMatch, { replayKind: 'same_round_effect_post_recheck', envelope });
  }

  const exactWriter = typeof options.exactWriter === 'function'
    ? options.exactWriter
    : applyExactTextBatchMinSafeWrite;
  const writerResult = await exactWriter(writerInput, {
    ...(isPlainObject(options.exactWriterOptions) ? options.exactWriterOptions : {}),
    operationId: operationIdFromEnvelope(envelope),
  });

  if (writerResult?.status === 'applied' && writerResult?.applied === true) {
    const outcomeRecord = buildRtkExactApplyOutcomeRecord(envelope, writerResult, { cryptoPort });
    await writeRtkExactApplyOutcomeRecord(projectRoot, outcomeRecord);
    return applied(writerResult, outcomeRecord, { envelope });
  }

  if (writerResult?.status === 'ambiguous' || writerResult?.reconciliation) {
    const recoveryResolution = buildRtkExactApplyRecoveryResolution(envelope, writerResult.reconciliation || writerResult, {
      cryptoPort,
    });
    await writeRtkExactApplyRecoveryResolution(projectRoot, recoveryResolution);
    return writerBlock(writerResult, {
      envelope,
      recoveryResolution,
    });
  }

  return writerBlock(writerResult, { envelope });
}

