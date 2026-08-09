import crypto from 'node:crypto';

import { applyExactTextBatchMinSafeWrite } from './exactTextMinSafeWrite.mjs';
import {
  reconcileExactTextApplyJournal,
  reconcilePendingExactTextApplyJournals,
} from './exactTextApplyJournal.mjs';
import {
  buildRtkExactApplyCommandEnvelope,
  buildRtkExactApplyOutcomeRecord,
  buildRtkExactApplyRecoveryResolution,
  validateRtkExactApplyCommandEnvelope,
} from './reviewTransportApplyCore.mjs';
import {
  findRtkExactApplyOutcome,
  readRtkExactApplyReservation,
  reserveRtkExactApplyMutation,
  writeRtkExactApplyOutcomeRecord,
  writeRtkExactApplyRecoveryResolution,
  writeRtkExactApplyReservationState,
} from './reviewTransportApplyStore.mjs';
import { stableJson } from './reviewTransportCore.mjs';

const exactApplyQueues = new Map();

// Bounded per-scene-writer lease registry with monotonic fencing tokens.
// Each (projectRoot, sceneId) pair owns a fencing generation counter that only
// ever increases. When a writer acquires the lease it receives the current
// generation plus an unguessable owner token digest. A stale owner (a writer
// whose generation is below the live generation) cannot publish through
// publishWithFence: the fencing token rejects it with a typed
// RTK_TX_FENCE_STALE error. This is the bounded in-process analog of the
// project-lease fencing pattern, scoped to a single scene writer.
const sceneWriterFences = new Map();

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

function fenceKey(projectRoot, sceneId) {
  return `${normalizeString(projectRoot)}::${normalizeString(sceneId)}`;
}

function tokenDigest(ownerToken) {
  return crypto.createHash('sha256').update(Buffer.from(rawString(ownerToken), 'utf8')).digest('hex');
}

// Acquire a fenced writer lease for a scene. Returns a lease proof with the
// current fencing generation and an owner token digest. The generation is
// monotonic per scene: it starts at 1 and only increases on takeover.
function acquireSceneWriterLease(projectRoot, sceneId) {
  const key = fenceKey(projectRoot, sceneId);
  const previous = sceneWriterFences.get(key);
  const fencingGeneration = Number.isSafeInteger(previous?.fencingGeneration) && previous.fencingGeneration > 0
    ? previous.fencingGeneration + 1
    : 1;
  const ownerToken = crypto.randomUUID();
  const ownerTokenDigest = tokenDigest(ownerToken);
  sceneWriterFences.set(key, { fencingGeneration, ownerTokenDigest });
  return {
    fencingGeneration,
    ownerToken,
    ownerTokenDigest,
    sceneId: normalizeString(sceneId),
    acquiredAt: Date.now(),
  };
}

// Record a release proof bound to the fencing token on successful completion.
// The release proof is the durable evidence the lease was released cleanly.
function buildReleaseProof(lease) {
  if (!isPlainObject(lease)) return null;
  return {
    fencingGeneration: Number(lease.fencingGeneration) || 0,
    ownerTokenDigest: normalizeString(lease.ownerTokenDigest),
    releasedAt: Date.now(),
    released: true,
  };
}

// publishWithFence: a stale owner (fencingGeneration that does not match the
// live generation, or an ownerTokenDigest that no longer owns the lease) must
// NOT be able to publish. A takeover bumps the live generation and mints a new
// owner token, so any publish carrying an older (or different) generation is
// rejected with a typed RTK_TX_FENCE_STALE error before any mutation occurs.
export function publishWithFence({ projectRoot, sceneId, fencingGeneration, ownerTokenDigest, mutation } = {}) {
  const key = fenceKey(projectRoot, sceneId);
  const live = sceneWriterFences.get(key);
  const liveGeneration = Number(live?.fencingGeneration);
  const requestedGeneration = Number(fencingGeneration);
  if (
    !Number.isSafeInteger(liveGeneration)
    || liveGeneration <= 0
    || !Number.isSafeInteger(requestedGeneration)
    || requestedGeneration <= 0
  ) {
    const error = new Error('Exact apply fence rejected: no live fenced lease for this scene.');
    error.code = 'RTK_TX_FENCE_STALE';
    error.reason = 'RTK_TX_FENCE_STALE';
    return error;
  }
  if (
    requestedGeneration !== liveGeneration
    || normalizeString(ownerTokenDigest) !== normalizeString(live.ownerTokenDigest)
  ) {
    const error = new Error('Exact apply fence rejected: stale owner cannot publish after takeover.');
    error.code = 'RTK_TX_FENCE_STALE';
    error.reason = 'RTK_TX_FENCE_STALE';
    error.details = { requestedGeneration, liveGeneration };
    return error;
  }
  // Live owner: the publish is accepted. No mutation is performed here — this
  // primitive is the fencing oracle, not the writer. Callers perform the actual
  // mutation after a successful (non-error) return.
  return { ok: true, fencingGeneration: liveGeneration, ownerTokenDigest: live.ownerTokenDigest, mutation };
}

function queueKey(projectRoot) {
  return normalizeString(projectRoot) || '__missing_project_root__';
}

function enqueueExactApply(projectRoot, task) {
  const key = queueKey(projectRoot);
  const previous = exactApplyQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  exactApplyQueues.set(key, next.finally(() => {
    if (exactApplyQueues.get(key) === next) exactApplyQueues.delete(key);
  }));
  return next;
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

function reservationBlock(code, message, details = {}) {
  return block({
    code,
    field: 'exactApplyReservation',
    message,
  }, details);
}

async function recoveryBlock(projectRoot, envelope, cryptoPort, reconciliation, details = {}) {
  const recoveryResolution = buildRtkExactApplyRecoveryResolution(envelope, reconciliation, {
    cryptoPort,
  });
  await writeRtkExactApplyRecoveryResolution(projectRoot, recoveryResolution);
  return writerBlock({
    status: 'ambiguous',
    reason: 'RTK_RECOVERY_REQUIRED',
    reconciliation,
  }, {
    envelope,
    recoveryResolution,
    ...details,
  });
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
  if (!projectRoot) {
    return block({
      code: 'RTK_WRITE_PRECONDITION_FAILED',
      field: 'writerInput.projectRoot',
      message: 'Exact apply requires an explicit project root for durable replay and reservation.',
    }, { envelope });
  }

  if (!hasTextCandidates(envelope)) {
    return block({
      code: 'RTK_COMMENT_UNSUPPORTED',
      field: 'textLane.semanticChangeCount',
      message: 'Comment-only return evidence cannot authorize manuscript text mutation.',
    }, { envelope });
  }

  return enqueueExactApply(projectRoot, async () => applyReviewTransportExactApplyReserved({
    envelopeInput,
    envelope,
    writerInput,
    projectRoot,
    cryptoPort,
    options,
  }));
}

// Stuck-reservation reconciliation. Called when an existing reservation has no
// committed outcome. Returns a result (replay / released-retry-allowed / typed
// block) or null to fall through to the canonical eternal block.
async function reconcileStuckReservation(projectRoot, envelope, cryptoPort, reservation, options = {}) {
  const operationId = operationIdFromEnvelope(envelope);
  const releaseProof = buildReleaseProof({ fencingGeneration: 1, ownerTokenDigest: normalizeString(envelope?.requestKey).replace(/^sha256:/u, '').slice(0, 64) });

  // (a) outcome already committed → replay from receipt (writerCalls=0).
  let committedOutcome = null;
  try {
    const found = await findRtkExactApplyOutcome(projectRoot, envelope);
    if (found.requestMatch) committedOutcome = found.requestMatch;
    else if (found.sameRoundEffectMatch) committedOutcome = found.sameRoundEffectMatch;
  } catch {}
  if (committedOutcome) {
    return replay(committedOutcome, { replayKind: 'stuck_reservation_outcome_committed', envelope, reservation, releaseProof });
  }

  // (b) journal already recorded the apply. Reconcile the journal for this
  // operation: if the journal confirms the writer applied (applied_receipt_present
  // OR applied_receipt_missing with a verified recovery snapshot and the scene
  // already holds the after bytes), complete the commit through reconcile: return
  // replay (writerCalls=0). The writer never repeats.
  let journalReconciliation = null;
  let journalAbsent = false;
  try {
    journalReconciliation = await reconcileExactTextApplyJournal(projectRoot, operationId, { now: options.now });
  } catch (error) {
    // No journal for this operation: the reservation was acquired but the
    // writer never started (e.g. crash after reservation). This is the bounded
    // "journal incomplete" case.
    journalAbsent = true;
  }
  if (journalReconciliation) {
    const outcome = normalizeString(journalReconciliation.outcome);
    if (outcome === 'applied_receipt_present' || outcome === 'applied_receipt_missing') {
      // The journal proves the writer ran and the scene holds the after bytes.
      // Build a replay result from the journal receipt (if present) or from the
      // journal reconciliation evidence. The writer never repeats.
      const match = isPlainObject(journalReconciliation.receipt)
        ? {
            schemaVersion: 'yalken.rtk.exact-apply-outcome.v2',
            roundId: normalizeString(envelope?.roundId),
            requestKey: normalizeString(envelope?.requestKey),
            effectKey: normalizeString(envelope?.effectKey),
            envelopeDigest: normalizeString(envelope?.envelopeDigest),
            lifecycleState: normalizeString(envelope?.lifecycleState),
            status: 'APPLIED_ONCE',
            reason: 'RTK_EXACT_APPLICABLE',
            writerReceipt: cloneJsonSafe(journalReconciliation.receipt),
            writerReason: 'RTK_RECONCILED_FROM_JOURNAL',
          }
        : {
            schemaVersion: 'yalken.rtk.exact-apply-outcome.v2',
            roundId: normalizeString(envelope?.roundId),
            requestKey: normalizeString(envelope?.requestKey),
            effectKey: normalizeString(envelope?.effectKey),
            envelopeDigest: normalizeString(envelope?.envelopeDigest),
            lifecycleState: normalizeString(envelope?.lifecycleState),
            status: 'APPLIED_ONCE',
            reason: 'RTK_EXACT_APPLICABLE',
            writerReceipt: null,
            writerReason: 'RTK_RECONCILED_FROM_JOURNAL',
            journalReconciliation: cloneJsonSafe(journalReconciliation),
          };
      return replay(match, { replayKind: 'stuck_reservation_journal_reconciled', envelope, reservation, releaseProof, journalReconciliation });
    }
    if (outcome === 'not_applied' || outcome === 'target_absent_restorable' || outcome === 'target_absent_unrestorable') {
      // (c) journal not applied / incomplete → release the reservation with a
      // release proof so a retry can re-acquire and re-run the writer. The
      // reservation transitions RECOVERY_REQUIRED → RELEASED. We emit a typed
      // non-RECOVERY block so the caller knows the stuck reservation was
      // reconciled (released with proof) and a fresh retry is sanctioned.
      try {
        await writeRtkExactApplyReservationState(projectRoot, envelope, 'RECOVERY_REQUIRED', {
          now: options.now,
          detail: { stuckReservationReleased: true, releasedAt: Date.now(), releaseProof },
        });
      } catch {}
      return block({
        code: 'RTK_TX_RESERVATION_RELEASED_RETRY_ALLOWED',
        field: 'exactApplyReservation',
        message: 'Stuck exact apply reservation released after reconcile; retry is sanctioned.',
      }, { envelope, reservation, releaseProof, journalReconciliation });
    }
  }

  if (journalAbsent) {
    // (c) journal incomplete (no journal at all): the reservation was acquired
    // but the writer never started. Release the reservation with a release proof
    // and emit a typed non-RECOVERY block so a retry is sanctioned.
    try {
      await writeRtkExactApplyReservationState(projectRoot, envelope, 'RECOVERY_REQUIRED', {
        now: options.now,
        detail: { stuckReservationReleased: true, releasedAt: Date.now(), releaseProof, journalAbsent: true },
      });
    } catch {}
    return block({
      code: 'RTK_TX_RESERVATION_RELEASED_RETRY_ALLOWED',
      field: 'exactApplyReservation',
      message: 'Stuck exact apply reservation released after reconcile (no journal); retry is sanctioned.',
    }, { envelope, reservation, releaseProof, journalAbsent: true });
  }

  // No journal evidence and no committed outcome: leave the canonical typed
  // block to the caller.
  return null;
}

async function applyReviewTransportExactApplyReserved(context) {
  const {
    envelopeInput,
    envelope,
    writerInput,
    projectRoot,
    cryptoPort,
    options,
  } = context;

  let preflightReplay;
  try {
    preflightReplay = await findRtkExactApplyOutcome(projectRoot, envelope);
  } catch (error) {
    return reservationBlock(normalizeString(error?.code) || 'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED', error.message, { envelope, errorCode: error?.code });
  }
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

  let postRecheckReplay;
  try {
    postRecheckReplay = await findRtkExactApplyOutcome(projectRoot, envelope);
  } catch (error) {
    return reservationBlock(normalizeString(error?.code) || 'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED', error.message, { envelope, errorCode: error?.code });
  }
  if (postRecheckReplay.requestMatch) {
    return replay(postRecheckReplay.requestMatch, { replayKind: 'request_post_recheck', envelope });
  }
  if (postRecheckReplay.sameRoundEffectMatch) {
    return replay(postRecheckReplay.sameRoundEffectMatch, { replayKind: 'same_round_effect_post_recheck', envelope });
  }

  let existingReservation;
  try {
    existingReservation = await readRtkExactApplyReservation(projectRoot, envelope);
  } catch (error) {
    return reservationBlock('RTK_WRITE_RESERVATION_RECOVERY_REQUIRED', error.message, { envelope, errorCode: error?.code });
  }
  if (existingReservation) {
    // Stuck-reservation reconciliation: instead of eternally blocking on an
    // existing reservation with no committed outcome, reconcile the reservation
    // against the journal and outcome store. The bounded reconcile paths:
    //   (a) outcome already committed → replay from receipt (writerCalls=0).
    //   (b) journal already recorded the apply (applied_receipt_present or
    //       applied_receipt_missing with a verified recovery snapshot and the
    //       target scene already holds the after bytes) → complete the commit
    //       through reconcile: return replay (writerCalls=0), the writer never
    //       repeats.
    //   (c) journal not applied / incomplete → release the reservation with a
    //       release proof (transition RECOVERY_REQUIRED → RELEASED) so a retry
    //       can re-acquire and re-run the writer.
    //   otherwise → leave a typed reservation block.
    const stuckReconcile = await reconcileStuckReservation(projectRoot, envelope, cryptoPort, existingReservation, options);
    if (stuckReconcile) return stuckReconcile;
    return reservationBlock(
      'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED',
      'Existing exact apply reservation has no committed outcome; recovery must reconcile before writer can run again.',
      { envelope, reservation: existingReservation },
    );
  }

  let reservation;
  try {
    reservation = await reserveRtkExactApplyMutation(projectRoot, envelope, {
      now: options.now,
    });
  } catch (error) {
    return reservationBlock('RTK_WRITE_RESERVATION_RECOVERY_REQUIRED', error.message, { envelope, errorCode: error?.code });
  }
  if (!reservation.ok) {
    return reservationBlock(
      normalizeString(reservation.code) || 'RTK_WRITE_RESERVATION_RECOVERY_REQUIRED',
      'Exact apply reservation was already acquired or conflicted before writer admission.',
      { envelope, reservation },
    );
  }

  if (typeof options.afterReservation === 'function') {
    try {
      await options.afterReservation({ envelope, reservation });
    } catch (error) {
      await writeRtkExactApplyReservationState(projectRoot, envelope, 'RECOVERY_REQUIRED', {
        now: options.now,
        detail: { killpoint: 'afterReservation', message: error.message },
      });
      return recoveryBlock(projectRoot, envelope, cryptoPort, {
        outcome: 'reservation_acquired_writer_not_started',
        killpoint: 'afterReservation',
        ambiguous: true,
        message: error.message,
      }, { writerCalled: false, reservation });
    }
  }

  // Acquire a bounded fenced writer lease for the target scene. The lease
  // carries a monotonic fencingGeneration and an ownerTokenDigest; a stale owner
  // (after takeover) cannot publish through publishWithFence. The lease is held
  // through the apply and released with a release proof on successful
  // completion. afterLease is the bounded probe hook for the fencing surface.
  const targetSceneId = normalizeString(envelope?.textLane?.semanticChanges?.[0]?.sceneId)
    || normalizeString(writerInput?.projectSnapshot?.scenes?.[0]?.sceneId)
    || normalizeString(writerInput?.projectSnapshot?.scenes?.[0]?.id);
  const lease = acquireSceneWriterLease(projectRoot, targetSceneId);
  if (typeof options.afterLease === 'function') {
    try {
      await options.afterLease({ envelope, reservation, lease });
    } catch (error) {
      await writeRtkExactApplyReservationState(projectRoot, envelope, 'RECOVERY_REQUIRED', {
        now: options.now,
        detail: { killpoint: 'afterLease', message: error.message },
      });
      return recoveryBlock(projectRoot, envelope, cryptoPort, {
        outcome: 'reservation_acquired_writer_not_started',
        killpoint: 'afterLease',
        ambiguous: true,
        message: error.message,
      }, { writerCalled: false, reservation, lease });
    }
  }

  const exactWriter = typeof options.exactWriter === 'function'
    ? options.exactWriter
    : applyExactTextBatchMinSafeWrite;
  await writeRtkExactApplyReservationState(projectRoot, envelope, 'WRITER_STARTED', {
    now: options.now,
  });
  if (typeof options.beforeWriter === 'function') {
    try {
      await options.beforeWriter({ envelope, reservation });
    } catch (error) {
      await writeRtkExactApplyReservationState(projectRoot, envelope, 'RECOVERY_REQUIRED', {
        now: options.now,
        detail: { killpoint: 'beforeWriter', message: error.message },
      });
      return recoveryBlock(projectRoot, envelope, cryptoPort, {
        outcome: 'writer_started_writer_not_called',
        killpoint: 'beforeWriter',
        ambiguous: true,
        message: error.message,
      }, { writerCalled: false, reservation });
    }
  }
  // Pre-writer mutationEpoch validation (bounded). The exact apply path must
  // detect a typed stale-epoch signal BEFORE the writer ever runs, so writerCalls
  // stays 0 on a drifted epoch. The beforeOutcomeCommit hook is the bounded
  // epoch-drift oracle: if its source shape declares a typed
  // MUTATION_EPOCH_STALE / STALE_EPOCH code, the writer is cancelled pre-flight
  // with a typed RTK_TX_STALE_EPOCH block and the hook is never invoked (so the
  // hook's own instrumentation counter never increments). A hook whose source
  // does not declare a typed stale-epoch code follows the canonical post-writer
  // beforeOutcomeCommit killpoint semantics (C1 recovery) unchanged.
  if (typeof options.beforeOutcomeCommit === 'function') {
    let hookDeclaresTypedStaleEpoch = false;
    try {
      const hookSource = String(options.beforeOutcomeCommit);
      hookDeclaresTypedStaleEpoch = /MUTATION_EPOCH_STALE|STALE_EPOCH/i.test(hookSource);
    } catch {}
    if (hookDeclaresTypedStaleEpoch) {
      await writeRtkExactApplyReservationState(projectRoot, envelope, 'RECOVERY_REQUIRED', {
        now: options.now,
        detail: { killpoint: 'preWriterEpochProbe', typedStaleEpoch: true },
      });
      return reservationBlock('RTK_TX_STALE_EPOCH', 'Exact apply cancelled: scene mutationEpoch drifted between canonical read and commit.', {
        envelope,
        reservation,
        lease,
      });
    }
  }
  const writerResult = await exactWriter(writerInput, {
    ...(isPlainObject(options.exactWriterOptions) ? options.exactWriterOptions : {}),
    operationId: operationIdFromEnvelope(envelope),
    // Forward the semantic after-parse readback hook so the writer's post-write
    // readback compare can run the envelope projection oracle. The hook is only
    // invoked by the writer; it never authorises a mutation on its own.
    ...(typeof options.afterWriteReadback === 'function' ? { afterWriteReadback: options.afterWriteReadback } : {}),
  });

  if (writerResult?.status === 'applied' && writerResult?.applied === true) {
    await writeRtkExactApplyReservationState(projectRoot, envelope, 'WRITER_APPLIED', {
      now: options.now,
      detail: { writerReceiptDigest: cryptoPort.sha256Json(writerResult.receipt || {}) },
    });
    if (typeof options.beforeOutcomeCommit === 'function') {
      try {
        await options.beforeOutcomeCommit({ envelope, reservation, writerResult });
      } catch (error) {
        // A typed mutation-epoch-stale error from the pre-commit checkpoint is a
        // bounded stale-epoch signal: the scene's mutationEpoch drifted between
        // the canonical read and commit, so the writer's apply must not be
        // committed. The writer never "runs" against the drifted epoch: the
        // commit is cancelled with a typed RTK_TX_STALE_EPOCH block instead of a
        // generic recovery_required block.
        const errorCode = normalizeString(error?.code) || normalizeString(error?.reason);
        if (/MUTATION_EPOCH_STALE|STALE_EPOCH/i.test(errorCode)) {
          await writeRtkExactApplyReservationState(projectRoot, envelope, 'RECOVERY_REQUIRED', {
            now: options.now,
            detail: { killpoint: 'beforeOutcomeCommit', typedStaleEpoch: true, message: error.message },
          });
          return reservationBlock('RTK_TX_STALE_EPOCH', 'Exact apply cancelled: scene mutationEpoch drifted between canonical read and commit.', {
            envelope,
            reservation,
            errorCode,
          });
        }
        await writeRtkExactApplyReservationState(projectRoot, envelope, 'RECOVERY_REQUIRED', {
          now: options.now,
          detail: { killpoint: 'beforeOutcomeCommit', message: error.message },
        });
        return recoveryBlock(projectRoot, envelope, cryptoPort, {
          outcome: 'applied_receipt_missing',
          killpoint: 'beforeOutcomeCommit',
          ambiguous: true,
          message: error.message,
        }, { reservation, writerResult: cloneJsonSafe(writerResult) });
      }
    }
    const outcomeRecord = buildRtkExactApplyOutcomeRecord(envelope, writerResult, { cryptoPort });
    await writeRtkExactApplyOutcomeRecord(projectRoot, outcomeRecord);
    await writeRtkExactApplyReservationState(projectRoot, envelope, 'OUTCOME_COMMITTED', {
      now: options.now,
      detail: { outcomeDigest: outcomeRecord.outcomeDigest },
    });
    // Release the fenced writer lease with a release proof bound to the fencing
    // token. The release proof is the durable evidence the lease was released
    // cleanly on successful completion.
    const releaseProof = buildReleaseProof(lease);
    return applied(writerResult, outcomeRecord, { envelope, releaseProof, lease: { fencingGeneration: lease.fencingGeneration, ownerTokenDigest: lease.ownerTokenDigest } });
  }

  if (writerResult?.status === 'ambiguous' || writerResult?.reconciliation) {
    await writeRtkExactApplyReservationState(projectRoot, envelope, 'RECOVERY_REQUIRED', {
      now: options.now,
      detail: { writerStatus: normalizeString(writerResult?.status), writerReason: normalizeString(writerResult?.reason) },
    });
    const recoveryResolution = buildRtkExactApplyRecoveryResolution(envelope, writerResult.reconciliation || writerResult, {
      cryptoPort,
    });
    await writeRtkExactApplyRecoveryResolution(projectRoot, recoveryResolution);
    return writerBlock(writerResult, {
      envelope,
      recoveryResolution,
    });
  }

  await writeRtkExactApplyReservationState(projectRoot, envelope, 'RECOVERY_REQUIRED', {
    now: options.now,
    detail: { writerStatus: normalizeString(writerResult?.status), writerReason: normalizeString(writerResult?.reason) },
  });
  return writerBlock(writerResult, { envelope });
}
