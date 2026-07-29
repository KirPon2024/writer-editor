import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { writeMarkdownWithTransactionRecovery } from '../markdown/index.mjs';
import {
  prepareExactTextApplyJournal,
  reconcileExactTextApplyJournal,
  recordExactTextApplyJournalApplied,
  recordExactTextApplyJournalReceipt,
  recordExactTextApplyJournalSnapshot,
} from './exactTextApplyJournal.mjs';
import { buildExactTextApplyPlanNoDiskPreview } from './index.mjs';

export const REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_SCHEMA =
  'revision-bridge.exact-text-min-safe-write.v1';
export const REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_RECEIPT_SCHEMA =
  'revision-bridge.exact-text-min-safe-write.receipt.v1';
export const REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_SCHEMA =
  'revision-bridge.exact-text-batch-min-safe-write.v1';
export const REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_RECEIPT_SCHEMA =
  'revision-bridge.exact-text-batch-min-safe-write.receipt.v1';

const READY_CODE = 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_APPLIED';
const BATCH_READY_CODE = 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_APPLIED';
const BLOCKED_CODE = 'E_REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_BLOCKED';
const FAILED_CODE = 'E_REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_FAILED';
const RECEIPT_INVALID_CODE = 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_RECEIPT_INVALID';
const RECOVERY_INVALID_CODE = 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_RECOVERY_INVALID';
const AMBIGUOUS_CODE = 'E_REVISION_BRIDGE_EXACT_TEXT_APPLY_OUTCOME_AMBIGUOUS';
const APPLIED_RECEIPT_MISSING_CODE = 'REVISION_BRIDGE_EXACT_TEXT_APPLY_APPLIED_RECEIPT_MISSING';
const RECONCILIATION_CONFLICT_CODE = 'REVISION_BRIDGE_EXACT_TEXT_APPLY_RECONCILIATION_CONFLICT';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function resolveNowMs(nowFn = Date.now) {
  const stamp = Number(typeof nowFn === 'function' ? nowFn() : Date.now());
  if (Number.isFinite(stamp) && stamp >= 0) return Math.trunc(stamp);
  return Date.now();
}

function toIsoStringFromNow(nowFn = Date.now) {
  return new Date(resolveNowMs(nowFn)).toISOString();
}

function resolvePath(value) {
  const raw = rawString(value);
  return raw ? path.resolve(raw) : '';
}

function isPathInside(rootPath, candidatePath) {
  const root = resolvePath(rootPath);
  const candidate = resolvePath(candidatePath);
  if (!root || !candidate) return false;
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function buildReason(code, field, message, details = {}) {
  return {
    code,
    field,
    message,
    ...details,
  };
}

function block(reason, details = {}) {
  const reasons = [reason];
  return {
    ok: false,
    type: 'revisionBridge.exactTextMinSafeWrite',
    status: 'blocked',
    code: BLOCKED_CODE,
    reason: reason.code,
    reasons,
    receipt: null,
    applied: false,
    ...details,
  };
}

function fail(reason, details = {}) {
  return {
    ok: false,
    type: 'revisionBridge.exactTextMinSafeWrite',
    status: 'failed',
    code: FAILED_CODE,
    reason: reason.code,
    reasons: [reason],
    receipt: null,
    applied: false,
    ...details,
  };
}

function ambiguous(reason, reconciliation, details = {}) {
  return {
    ok: false,
    type: 'revisionBridge.exactTextMinSafeWrite',
    status: 'ambiguous',
    code: AMBIGUOUS_CODE,
    reason: reconciliation?.outcome === 'applied_receipt_missing'
      ? APPLIED_RECEIPT_MISSING_CODE
      : RECONCILIATION_CONFLICT_CODE,
    reasons: [reason],
    receipt: null,
    applied: false,
    reconciliation: cloneJsonSafe(reconciliation),
    ...details,
  };
}

async function reconcileJournalAfterFailure(projectRoot, journalRef, options = {}) {
  const operationId = rawString(journalRef?.entry?.operationId);
  if (!operationId) return null;
  try {
    return await reconcileExactTextApplyJournal(projectRoot, operationId, { now: options.now });
  } catch {
    return null;
  }
}

function mapFailureWithReconciliation(reason, reconciliation, details = {}) {
  if (
    reconciliation?.outcome === 'applied_receipt_missing'
    || reconciliation?.outcome === 'conflict'
  ) {
    return ambiguous(reason, reconciliation, details);
  }
  return fail(reason, {
    ...(reconciliation ? { reconciliation: cloneJsonSafe(reconciliation) } : {}),
    ...details,
  });
}

function buildBatchAppliedResult(receipt, operations, details = {}) {
  return {
    ok: true,
    type: 'revisionBridge.exactTextBatchMinSafeWrite',
    status: 'applied',
    code: BATCH_READY_CODE,
    reason: BATCH_READY_CODE,
    reasons: [],
    applied: true,
    receipt: cloneJsonSafe(receipt),
    operations: cloneJsonSafe(operations),
    changes: operations.map((operation) => ({
      changeId: operation.changeId,
      status: 'applied',
      reason: BATCH_READY_CODE,
    })),
    ...details,
  };
}

function buildSingleAppliedResult(receipt, details = {}) {
  return {
    ok: true,
    type: 'revisionBridge.exactTextMinSafeWrite',
    status: 'applied',
    code: READY_CODE,
    reason: READY_CODE,
    reasons: [],
    applied: true,
    receipt: cloneJsonSafe(receipt),
    ...details,
  };
}

function extractProvidedPlan(input) {
  const candidate = input.contour03Plan || input.planPreview || input.plan;
  if (!isPlainObject(candidate)) return null;
  if (isPlainObject(candidate.plan)) return candidate.plan;
  return candidate;
}

function extractSingleOp(plan) {
  return Array.isArray(plan?.applyOps) && plan.applyOps.length === 1 ? plan.applyOps[0] : null;
}

function comparablePlan(plan) {
  const op = extractSingleOp(plan);
  return {
    schemaVersion: rawString(plan?.schemaVersion),
    projectId: rawString(plan?.projectId),
    sessionId: rawString(plan?.sessionId),
    baselineHash: rawString(plan?.baselineHash),
    sceneId: rawString(plan?.sceneId),
    op: op ? {
      kind: rawString(op.kind),
      sceneId: rawString(op.sceneId),
      changeId: rawString(op.changeId),
      from: op.from,
      to: op.to,
      expectedText: rawString(op.expectedText),
      replacementText: rawString(op.replacementText),
    } : null,
  };
}

function plansMatchOnSafetyFields(providedPlan, rebuiltPlan) {
  return stableJson(comparablePlan(providedPlan)) === stableJson(comparablePlan(rebuiltPlan));
}

function findSceneText(projectSnapshot, sceneId) {
  if (!isPlainObject(projectSnapshot)) return '';
  if (Array.isArray(projectSnapshot.scenes)) {
    const scene = projectSnapshot.scenes.find((item, index) => {
      if (!isPlainObject(item)) return false;
      return normalizeString(item.sceneId || item.id) === sceneId || (!sceneId && index === 0);
    });
    return rawString(scene?.text);
  }
  if (isPlainObject(projectSnapshot.scenes)) {
    const scene = projectSnapshot.scenes[sceneId];
    if (typeof scene === 'string') return scene;
    return rawString(scene?.text);
  }
  if (isPlainObject(projectSnapshot.scene)) return rawString(projectSnapshot.scene.text);
  return rawString(projectSnapshot.text);
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor <= text.length) {
    const found = text.indexOf(needle, cursor);
    if (found === -1) break;
    count += 1;
    cursor = found + 1;
  }
  return count;
}

function buildInputHash(input, plan) {
  return sha256Text(stableJson({
    projectSnapshot: input.projectSnapshot || null,
    revisionSession: input.revisionSession || null,
    reviewItem: input.reviewItem || null,
    scenePath: input.scenePath || '',
    plan: comparablePlan(plan),
  }));
}

function buildSnapshotEvidence(writeResult, capturedRecoveryEvidence = null) {
  return {
    snapshotCreated: Boolean(writeResult?.snapshotCreated || capturedRecoveryEvidence?.snapshotCreated),
    snapshotPath: rawString(writeResult?.snapshotPath || capturedRecoveryEvidence?.snapshotPath),
    snapshotReadable: Boolean(capturedRecoveryEvidence?.snapshotReadable),
    snapshotHashMatchesInput: Boolean(capturedRecoveryEvidence?.snapshotHashMatchesInput),
    purgedSnapshots: Array.isArray(writeResult?.purgedSnapshots) ? writeResult.purgedSnapshots : [],
    recoveryAction: 'OPEN_SNAPSHOT_OR_ABORT',
  };
}

function buildBackupId(snapshotPath) {
  const match = path.basename(rawString(snapshotPath)).match(/\.bak\.(\d{13})$/u);
  return match ? match[1] : '';
}

function isIsoUtcTimestamp(value) {
  if (!normalizeString(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return new Date(parsed).toISOString() === value;
}

async function buildTruthfulRecoveryEvidence(writeResult, capturedRecoveryEvidence, expectedText) {
  const evidence = buildSnapshotEvidence(writeResult, capturedRecoveryEvidence);
  if (!evidence.snapshotCreated || !evidence.snapshotPath) return evidence;

  try {
    const snapshotText = await fs.readFile(evidence.snapshotPath, 'utf8');
    evidence.snapshotReadable = true;
    evidence.snapshotHashMatchesInput = sha256Text(snapshotText) === sha256Text(expectedText);
  } catch {
    evidence.snapshotReadable = false;
    evidence.snapshotHashMatchesInput = false;
  }

  capturedRecoveryEvidence.snapshotReadable = evidence.snapshotReadable;
  capturedRecoveryEvidence.snapshotHashMatchesInput = evidence.snapshotHashMatchesInput;
  return evidence;
}

async function validateReceipt(receipt, expected = {}) {
  const failures = [];
  if (!isPlainObject(receipt)) failures.push('receipt must be an object');
  if (receipt?.schemaVersion !== REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_RECEIPT_SCHEMA) {
    failures.push('receipt schemaVersion is invalid');
  }
  if (receipt?.reason !== READY_CODE) failures.push('receipt reason is invalid');
  if (receipt?.operationId !== expected.operationId) failures.push('receipt operationId does not match journal');
  if (!normalizeString(receipt?.transactionId)) failures.push('receipt transactionId is required');
  if (receipt?.bytesWritten !== expected.bytesWritten) failures.push('receipt bytesWritten does not match output');
  if (receipt?.bytesWritten !== expected.actualBytesWritten) {
    failures.push('receipt bytesWritten does not match target bytes');
  }
  if (receipt?.inputHash !== expected.inputHash) failures.push('receipt inputHash does not match input');
  if (receipt?.outputHash !== expected.outputHash) failures.push('receipt outputHash does not match output');
  if (receipt?.outputHash !== expected.actualOutputHash) {
    failures.push('receipt outputHash does not match target text');
  }
  if (expected.actualText !== expected.nextText) failures.push('target text does not match receipt output');
  if (receipt?.projectId !== expected.projectId) failures.push('receipt projectId does not match plan');
  if (receipt?.sessionId !== expected.sessionId) failures.push('receipt sessionId does not match plan');
  if (receipt?.sceneId !== expected.sceneId) failures.push('receipt sceneId does not match op');
  if (receipt?.changeId !== expected.changeId) failures.push('receipt changeId does not match op');
  if (receipt?.baselineHashBefore !== expected.baselineHashBefore) {
    failures.push('receipt baselineHashBefore does not match plan');
  }
  if (receipt?.operationKind !== expected.operationKind) failures.push('receipt operationKind is invalid');
  if (receipt?.writeStatus !== expected.writeStatus) failures.push('receipt writeStatus is invalid');
  if (!isIsoUtcTimestamp(receipt?.writtenAt)) failures.push('receipt writtenAt is invalid');
  if (receipt?.writtenAt !== expected.writtenAt) {
    failures.push('receipt writtenAt does not match write timestamp');
  }
  if (receipt?.backupId !== expected.backupId) {
    failures.push('receipt backupId does not match recovery snapshot');
  }
  if (!isPlainObject(receipt?.recovery)) {
    failures.push('receipt recovery is required');
  } else {
    if (stableJson(receipt.recovery) !== stableJson(expected.recovery)) {
      failures.push('receipt recovery does not match verified recovery evidence');
    }
    if (receipt.recovery.snapshotCreated !== true) failures.push('receipt recovery snapshot is required');
    if (!normalizeString(receipt.recovery.snapshotPath)) failures.push('receipt recovery snapshotPath is required');
    if (receipt.backupId !== buildBackupId(receipt.recovery.snapshotPath)) {
      failures.push('receipt backupId does not match recovery snapshot path');
    }
    if (receipt.recovery.recoveryAction !== 'OPEN_SNAPSHOT_OR_ABORT') {
      failures.push('receipt recoveryAction is invalid');
    }
    if (receipt.recovery.snapshotReadable !== true) failures.push('receipt recovery snapshot is not readable');
    if (receipt.recovery.snapshotHashMatchesInput !== true) {
      failures.push('receipt recovery snapshot does not match input');
    }
    if (normalizeString(receipt.recovery.snapshotPath)) {
      try {
        const snapshotText = await fs.readFile(receipt.recovery.snapshotPath, 'utf8');
        if (sha256Text(snapshotText) !== expected.recoveryInputHash) {
          failures.push('receipt recovery snapshot does not match input');
        }
      } catch {
        failures.push('receipt recovery snapshot is not readable');
      }
    }
  }
  return failures;
}

function extractBatchReviewItems(input) {
  if (Array.isArray(input.reviewItems)) return input.reviewItems.filter((item) => isPlainObject(item));
  if (Array.isArray(input.textChanges)) return input.textChanges.filter((item) => isPlainObject(item));
  return [];
}

function buildBatchInputHash(input, operations) {
  return sha256Text(stableJson({
    projectSnapshot: input.projectSnapshot || null,
    revisionSession: input.revisionSession || null,
    reviewItems: extractBatchReviewItems(input),
    scenePath: input.scenePath || '',
    operations,
  }));
}

function normalizeBatchTextChange(item) {
  return isPlainObject(item?.textChange) ? item.textChange : item;
}

function hasOverlappingRange(left, right) {
  return left.from < right.to && right.from < left.to;
}

function isClosedRevisionSession(status) {
  return ['closed', 'archived', 'completed', 'resolved'].includes(normalizeString(status));
}

export async function applyExactTextBatchMinSafeWrite(input = {}, options = {}) {
  if (!isPlainObject(input)) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_INPUT_INVALID',
      'input',
      'input must be an object',
    ));
  }

  const scenePath = rawString(input.scenePath);
  if (!scenePath) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_SCENE_PATH_REQUIRED',
      'scenePath',
      'scenePath is required',
    ));
  }

  const projectRoot = rawString(input.projectRoot);
  if (!projectRoot) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_PROJECT_ROOT_REQUIRED',
      'projectRoot',
      'projectRoot is required for scene path binding',
    ));
  }

  if (!isPathInside(projectRoot, scenePath)) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_SCENE_PATH_OUTSIDE_PROJECT',
      'scenePath',
      'scenePath must be inside projectRoot',
    ));
  }

  const reviewItems = extractBatchReviewItems(input).map((item) => normalizeBatchTextChange(item));
  if (reviewItems.length === 0) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_REVIEW_ITEMS_REQUIRED',
      'reviewItems',
      'batch reviewItems are required',
    ));
  }

  const projectId = rawString(input.projectSnapshot?.projectId || input.revisionSession?.projectId);
  const sessionProjectId = rawString(input.revisionSession?.projectId);
  const snapshotProjectId = rawString(input.projectSnapshot?.projectId);
  if (snapshotProjectId && sessionProjectId && snapshotProjectId !== sessionProjectId) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_PROJECT_MISMATCH',
      'projectId',
      'projectSnapshot.projectId differs from revisionSession.projectId',
      {
        expectedProjectId: sessionProjectId,
        observedProjectId: snapshotProjectId,
      },
    ));
  }

  const baselineHash = rawString(input.projectSnapshot?.baselineHash || input.revisionSession?.baselineHash);
  const sessionBaselineHash = rawString(input.revisionSession?.baselineHash);
  const snapshotBaselineHash = rawString(input.projectSnapshot?.baselineHash);
  if (snapshotBaselineHash && sessionBaselineHash && snapshotBaselineHash !== sessionBaselineHash) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_STALE_BASELINE',
      'baselineHash',
      'projectSnapshot.baselineHash differs from revisionSession.baselineHash',
      {
        expectedBaselineHash: sessionBaselineHash,
        observedBaselineHash: snapshotBaselineHash,
      },
    ));
  }

  if (isClosedRevisionSession(input.revisionSession?.status)) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_SESSION_CLOSED',
      'revisionSession.status',
      'closed revision session cannot produce batch apply ops',
      {
        sessionStatus: normalizeString(input.revisionSession?.status),
      },
    ));
  }

  if (Array.isArray(input.revisionSession?.reviewGraph?.structuralChanges)
    && input.revisionSession.reviewGraph.structuralChanges.length > 0) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_STRUCTURAL_CHANGE',
      'reviewGraph.structuralChanges',
      'structural changes are manual-only for exact text batch apply',
    ));
  }

  const sceneIds = [...new Set(reviewItems
    .map((item) => normalizeString(item?.targetScope?.id))
    .filter(Boolean))];
  const targetScopeTypes = [...new Set(reviewItems
    .map((item) => normalizeString(item?.targetScope?.type))
    .filter(Boolean))];
  if (sceneIds.length !== 1 || targetScopeTypes.length !== 1 || targetScopeTypes[0] !== 'scene') {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_SINGLE_SCENE_REQUIRED',
      'reviewItems.targetScope',
      'batch exact apply is limited to one scene file',
      {
        sceneIds,
        targetScopeTypes,
      },
    ));
  }

  const changeIds = reviewItems.map((item) => normalizeString(item?.changeId));
  const duplicateChangeId = changeIds.find((changeId, index) => (
    changeId && changeIds.indexOf(changeId) !== index
  ));
  if (duplicateChangeId) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_DUPLICATE_CHANGE_ID',
      'reviewItems.changeId',
      'batch text changes must have unique changeIds',
      {
        changeId: duplicateChangeId,
      },
    ));
  }

  const sceneId = sceneIds[0];
  const scenePathBySceneId = isPlainObject(input.scenePathBySceneId) ? input.scenePathBySceneId : {};
  const boundScenePath = resolvePath(scenePathBySceneId[sceneId]);
  if (!boundScenePath || boundScenePath !== resolvePath(scenePath)) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_SCENE_PATH_BINDING_MISMATCH',
      'scenePathBySceneId',
      'scenePath must match the canonical scene path binding for the target scene',
    ));
  }

  const sceneText = findSceneText(input.projectSnapshot, sceneId);
  let currentText = '';
  try {
    currentText = await fs.readFile(scenePath, 'utf8');
  } catch (error) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_READ_FAILED',
      'scenePath',
      'current scene file could not be read',
      {
        errorCode: rawString(error?.code),
      },
    ));
  }

  if (currentText !== sceneText) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_CURRENT_DRIFT',
      'scenePath',
      'current scene file differs from projectSnapshot scene text',
      {
        currentHash: sha256Text(currentText),
        snapshotHash: sha256Text(sceneText),
      },
    ));
  }

  const operations = [];
  for (const item of reviewItems) {
    const changeId = normalizeString(item?.changeId);
    const matchKind = normalizeString(item?.match?.kind);
    const expectedText = rawString(item?.match?.quote);
    const replacementTextProvided = Object.prototype.hasOwnProperty.call(item || {}, 'replacementText')
      && typeof item.replacementText === 'string';
    const replacementText = rawString(item?.replacementText);

    if (!changeId) {
      return block(buildReason(
        'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_CHANGE_ID_REQUIRED',
        'reviewItems.changeId',
        'each batch text change requires a changeId',
      ));
    }
    if (matchKind !== 'exact') {
      return block(buildReason(
        'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_EXACT_MATCH_REQUIRED',
        'reviewItems.match.kind',
        'each batch text change must use exact match',
        { changeId },
      ));
    }
    if (!expectedText) {
      return block(buildReason(
        'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_EXPECTED_TEXT_REQUIRED',
        'reviewItems.match.quote',
        'each batch text change requires exact quote text',
        { changeId },
      ));
    }
    if (!replacementTextProvided) {
      return block(buildReason(
        'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_REPLACEMENT_REQUIRED',
        'reviewItems.replacementText',
        'each batch text change requires replacementText',
        { changeId },
      ));
    }

    const occurrenceCount = countOccurrences(currentText, expectedText);
    if (occurrenceCount === 0) {
      return block(buildReason(
        'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_CURRENT_NO_MATCH',
        'reviewItems.match.quote',
        'expectedText is not present in current batch text',
        { changeId },
      ));
    }
    if (occurrenceCount > 1) {
      return block(buildReason(
        'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_CURRENT_DUPLICATE_MATCH',
        'reviewItems.match.quote',
        'expectedText occurs multiple times in current batch text',
        {
          changeId,
          matchCount: occurrenceCount,
        },
      ));
    }

    const from = currentText.indexOf(expectedText);
    const to = from + expectedText.length;
    const operation = {
      kind: 'replaceExactText',
      sceneId,
      changeId,
      from,
      to,
      expectedText,
      replacementText,
    };
    const overlappingOperation = operations.find((existing) => hasOverlappingRange(existing, operation));
    if (overlappingOperation) {
      return block(buildReason(
        'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_OVERLAPPING_RANGE',
        'reviewItems.match.quote',
        'batch exact apply ranges must be disjoint on the immutable baseline',
        {
          changeId,
          overlappingChangeId: overlappingOperation.changeId,
          range: { from, to },
          overlappingRange: { from: overlappingOperation.from, to: overlappingOperation.to },
        },
      ));
    }
    operations.push(operation);
  }

  let nextText = currentText;
  const operationsRightToLeft = operations.slice().sort((left, right) => (
    right.from - left.from
    || String(right.changeId).localeCompare(String(left.changeId))
  ));
  for (const operation of operationsRightToLeft) {
    nextText = `${nextText.slice(0, operation.from)}${operation.replacementText}${nextText.slice(operation.to)}`;
  }

  if (nextText === currentText) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_NO_OP',
      'reviewItems.replacementText',
      'batch replacement must change the scene text',
    ));
  }

  const inputHash = buildBatchInputHash(input, operations);
  const outputHash = sha256Text(nextText);
  const writtenAt = toIsoStringFromNow(options.now);
  const capturedRecoveryEvidence = {};
  const userAfterStage = typeof options.afterStage === 'function' ? options.afterStage : null;
  const userBeforeWrite = typeof options.beforeWrite === 'function' ? options.beforeWrite : null;
  const userAfterRenameBeforeReceipt = typeof options.afterRenameBeforeReceipt === 'function'
    ? options.afterRenameBeforeReceipt
    : null;
  let journalRef = null;
  let transactionId = '';

  try {
    journalRef = await prepareExactTextApplyJournal({
      projectRoot,
      scenePath,
      beforeHash: sha256Text(currentText),
      afterHash: outputHash,
      inputHash,
      operationKind: 'replaceExactTextBatch',
      projectId,
      sessionId: rawString(input.revisionSession?.sessionId),
      sceneId,
      changeIds: operations.map((operation) => operation.changeId),
    }, {
      now: options.now,
      operationId: options.operationId,
    });

    const writeResult = await writeMarkdownWithTransactionRecovery(scenePath, nextText, {
      safetyMode: options.safetyMode,
      maxSnapshots: options.maxSnapshots,
      now: options.now,
      beforeRename: options.beforeRename,
      afterTempWrite: options.afterTempWrite,
      afterRename: async () => {
        await recordExactTextApplyJournalApplied(projectRoot, journalRef.entry.operationId, {
          transactionId,
        }, { now: options.now });
        if (userAfterRenameBeforeReceipt) {
          await userAfterRenameBeforeReceipt({
            scenePath,
            nextText,
            recovery: buildSnapshotEvidence(null, capturedRecoveryEvidence),
          });
        }
      },
      afterStage: async (event) => {
        if (event?.stage === 'INTENT_CREATED') {
          transactionId = rawString(event.transactionId);
        }
        if (event?.stage === 'SNAPSHOT_CREATED') {
          capturedRecoveryEvidence.snapshotCreated = Boolean(event.snapshotCreated);
          capturedRecoveryEvidence.snapshotPath = rawString(event.snapshotPath);
          transactionId = rawString(event.transactionId) || transactionId;
          await recordExactTextApplyJournalSnapshot(projectRoot, journalRef.entry.operationId, {
            snapshotPath: event.snapshotPath,
            transactionId,
          }, { now: options.now });
        }
        if (event?.stage === 'SNAPSHOT_CREATED' && userBeforeWrite) {
          await userBeforeWrite(event);
        }
        if (userAfterStage) await userAfterStage(event);
      },
    });

    if (typeof options.beforeReceipt === 'function') {
      await options.beforeReceipt({
        scenePath,
        nextText,
        recovery: buildSnapshotEvidence(writeResult, capturedRecoveryEvidence),
      });
    }

    const recovery = await buildTruthfulRecoveryEvidence(writeResult, capturedRecoveryEvidence, currentText);
    const backupId = buildBackupId(recovery.snapshotPath);
    const actualText = await fs.readFile(scenePath, 'utf8');
    if (actualText !== nextText || recovery.snapshotReadable !== true || recovery.snapshotHashMatchesInput !== true) {
      const failureReason = buildReason(
        actualText !== nextText ? RECEIPT_INVALID_CODE : RECOVERY_INVALID_CODE,
        'receipt',
        'batch receipt validation failed after write',
        {
          recovery,
        },
      );
      const reconciliation = await reconcileJournalAfterFailure(projectRoot, journalRef, options);
      return mapFailureWithReconciliation(failureReason, reconciliation);
    }

    const receipt = {
      schemaVersion: REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_RECEIPT_SCHEMA,
      operationId: journalRef.entry.operationId,
      projectId,
      sessionId: rawString(input.revisionSession?.sessionId),
      sceneId,
      changeIds: operations.map((operation) => operation.changeId),
      baselineHashBefore: baselineHash,
      operationKind: 'replaceExactTextBatch',
      writeStatus: 'applied',
      backupId,
      writtenAt,
      inputHash,
      outputHash,
      bytesWritten: writeResult.bytesWritten,
      transactionId: rawString(writeResult.transactionId),
      recovery,
      reason: BATCH_READY_CODE,
    };
    await recordExactTextApplyJournalReceipt(projectRoot, journalRef.entry.operationId, receipt, {
      now: options.now,
    });
    if (typeof options.afterReceiptWritten === 'function') {
      await options.afterReceiptWritten(cloneJsonSafe(receipt));
    }
    const reconciliation = await reconcileExactTextApplyJournal(
      projectRoot,
      journalRef.entry.operationId,
      { now: options.now },
    );
    if (reconciliation.outcome !== 'applied_receipt_present') {
      throw new Error('exact text batch receipt reconciliation did not confirm apply');
    }
    return buildBatchAppliedResult(receipt, operations, { reconciliation });
  } catch (error) {
    const failureReason = buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_WRITE_FAILED',
      'scenePath',
      'transactional markdown batch write failed',
      {
        errorCode: rawString(error?.code),
        errorReason: rawString(error?.reason),
        recovery: await buildTruthfulRecoveryEvidence(null, capturedRecoveryEvidence, currentText),
      },
    );
    const reconciliation = await reconcileJournalAfterFailure(projectRoot, journalRef, options);
    if (reconciliation?.outcome === 'applied_receipt_present' && isPlainObject(reconciliation.receipt)) {
      return buildBatchAppliedResult(reconciliation.receipt, operations, {
        reconciledAfterReceiptWrite: true,
        reconciliation,
      });
    }
    return mapFailureWithReconciliation(failureReason, reconciliation);
  }
}

export async function applyExactTextMinSafeWrite(input = {}, options = {}) {
  if (!isPlainObject(input)) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_INPUT_INVALID',
      'input',
      'input must be an object',
    ));
  }

  const scenePath = rawString(input.scenePath);
  if (!scenePath) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_SCENE_PATH_REQUIRED',
      'scenePath',
      'scenePath is required',
    ));
  }

  const projectRoot = rawString(input.projectRoot);
  if (!projectRoot) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_PROJECT_ROOT_REQUIRED',
      'projectRoot',
      'projectRoot is required for scene path binding',
    ));
  }

  if (!isPathInside(projectRoot, scenePath)) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_SCENE_PATH_OUTSIDE_PROJECT',
      'scenePath',
      'scenePath must be inside projectRoot',
    ));
  }

  const providedPlan = extractProvidedPlan(input);
  if (!providedPlan) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_PLAN_REQUIRED',
      'contour03Plan|planPreview',
      'provided C03 plan is required',
    ));
  }

  const rebuiltPreview = buildExactTextApplyPlanNoDiskPreview({
    projectSnapshot: input.projectSnapshot,
    revisionSession: input.revisionSession,
    reviewItem: input.reviewItem,
  });

  if (rebuiltPreview.status !== 'ready' || !rebuiltPreview.plan) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_PLAN_NOT_READY',
      'rebuiltPlan',
      'rebuilt C03 plan is not ready',
      {
        rebuiltCode: rawString(rebuiltPreview.code),
        rebuiltReason: rawString(rebuiltPreview.reason),
        rebuiltReasons: Array.isArray(rebuiltPreview.reasons) ? cloneJsonSafe(rebuiltPreview.reasons) : [],
      },
    ));
  }

  if (providedPlan.canApply !== false || providedPlan.noDisk !== true || providedPlan.safeWriteCandidate !== false) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_PLAN_NOT_READY',
      'providedPlan',
      'provided plan is not a C03 no-disk preview plan',
    ));
  }

  if (!plansMatchOnSafetyFields(providedPlan, rebuiltPreview.plan)) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_PLAN_MISMATCH',
      'providedPlan',
      'provided C03 plan does not match rebuilt C03 plan safety fields',
    ));
  }

  const op = extractSingleOp(providedPlan);
  if (!op || op.kind !== 'replaceExactText') {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_PLAN_NOT_READY',
      'providedPlan.applyOps',
      'provided plan must contain one replaceExactText op',
    ));
  }

  const scenePathBySceneId = isPlainObject(input.scenePathBySceneId) ? input.scenePathBySceneId : {};
  const boundScenePath = resolvePath(scenePathBySceneId[rawString(op.sceneId)]);
  if (!boundScenePath || boundScenePath !== resolvePath(scenePath)) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_SCENE_PATH_BINDING_MISMATCH',
      'scenePathBySceneId',
      'scenePath must match the canonical scene path binding for the target scene',
    ));
  }

  const expectedText = rawString(op.expectedText);
  const replacementText = rawString(op.replacementText);
  const sceneText = findSceneText(input.projectSnapshot, rawString(op.sceneId));
  let currentText = '';

  try {
    currentText = await fs.readFile(scenePath, 'utf8');
  } catch (error) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_READ_FAILED',
      'scenePath',
      'current scene file could not be read',
      {
        errorCode: rawString(error?.code),
      },
    ));
  }

  if (currentText !== sceneText) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_CURRENT_DRIFT',
      'scenePath',
      'current scene file differs from projectSnapshot scene text',
      {
        currentHash: sha256Text(currentText),
        snapshotHash: sha256Text(sceneText),
      },
    ));
  }

  const occurrenceCount = countOccurrences(currentText, expectedText);
  if (occurrenceCount === 0) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_CURRENT_NO_MATCH',
      'expectedText',
      'expectedText is not present in current scene file',
    ));
  }
  if (occurrenceCount > 1) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_CURRENT_DUPLICATE_MATCH',
      'expectedText',
      'expectedText occurs multiple times in current scene file',
      {
        matchCount: occurrenceCount,
      },
    ));
  }

  const from = Number.isSafeInteger(op.from) ? op.from : -1;
  const to = Number.isSafeInteger(op.to) ? op.to : -1;
  if (from < 0 || to < from || currentText.slice(from, to) !== expectedText) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_CURRENT_OFFSET_MISMATCH',
      'providedPlan.applyOps.0',
      'current scene text does not match the exact C03 op offset',
      {
        from,
        to,
      },
    ));
  }
  const nextText = `${currentText.slice(0, from)}${replacementText}${currentText.slice(to)}`;
  if (nextText === currentText) {
    return block(buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_NO_OP',
      'replacementText',
      'replacement must change the scene text',
    ));
  }
  const inputHash = buildInputHash(input, providedPlan);
  const outputHash = sha256Text(nextText);
  const writtenAt = toIsoStringFromNow(options.now);
  const capturedRecoveryEvidence = {};
  const userAfterStage = typeof options.afterStage === 'function' ? options.afterStage : null;
  const userBeforeWrite = typeof options.beforeWrite === 'function' ? options.beforeWrite : null;
  const userAfterRenameBeforeReceipt = typeof options.afterRenameBeforeReceipt === 'function'
    ? options.afterRenameBeforeReceipt
    : null;
  let journalRef = null;
  let transactionId = '';

  try {
    journalRef = await prepareExactTextApplyJournal({
      projectRoot,
      scenePath,
      beforeHash: sha256Text(currentText),
      afterHash: outputHash,
      inputHash,
      operationKind: 'replaceExactText',
      projectId: rawString(providedPlan.projectId),
      sessionId: rawString(providedPlan.sessionId),
      sceneId: rawString(op.sceneId),
      changeIds: [rawString(op.changeId)],
    }, {
      now: options.now,
      operationId: options.operationId,
    });

    const writeResult = await writeMarkdownWithTransactionRecovery(scenePath, nextText, {
      safetyMode: options.safetyMode,
      maxSnapshots: options.maxSnapshots,
      now: options.now,
      beforeRename: options.beforeRename,
      afterTempWrite: options.afterTempWrite,
      afterRename: async () => {
        await recordExactTextApplyJournalApplied(projectRoot, journalRef.entry.operationId, {
          transactionId,
        }, { now: options.now });
        if (userAfterRenameBeforeReceipt) {
          await userAfterRenameBeforeReceipt({
            scenePath,
            nextText,
            recovery: buildSnapshotEvidence(null, capturedRecoveryEvidence),
          });
        }
      },
      afterStage: async (event) => {
        if (event?.stage === 'INTENT_CREATED') {
          transactionId = rawString(event.transactionId);
        }
        if (event?.stage === 'SNAPSHOT_CREATED') {
          capturedRecoveryEvidence.snapshotCreated = Boolean(event.snapshotCreated);
          capturedRecoveryEvidence.snapshotPath = rawString(event.snapshotPath);
          transactionId = rawString(event.transactionId) || transactionId;
          await recordExactTextApplyJournalSnapshot(projectRoot, journalRef.entry.operationId, {
            snapshotPath: event.snapshotPath,
            transactionId,
          }, { now: options.now });
        }
        if (event?.stage === 'SNAPSHOT_CREATED' && userBeforeWrite) {
          await userBeforeWrite(event);
        }
        if (userAfterStage) await userAfterStage(event);
      },
    });

    if (typeof options.beforeReceipt === 'function') {
      await options.beforeReceipt({
        scenePath,
        nextText,
        recovery: buildSnapshotEvidence(writeResult, capturedRecoveryEvidence),
      });
    }

    const recovery = await buildTruthfulRecoveryEvidence(writeResult, capturedRecoveryEvidence, currentText);
    const backupId = buildBackupId(recovery.snapshotPath);
    const receipt = {
      schemaVersion: REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_RECEIPT_SCHEMA,
      operationId: journalRef.entry.operationId,
      projectId: rawString(providedPlan.projectId),
      sessionId: rawString(providedPlan.sessionId),
      sceneId: rawString(op.sceneId),
      changeId: rawString(op.changeId),
      baselineHashBefore: rawString(providedPlan.baselineHash),
      operationKind: 'replaceExactText',
      writeStatus: 'applied',
      backupId,
      writtenAt,
      inputHash,
      outputHash,
      bytesWritten: writeResult.bytesWritten,
      transactionId: rawString(writeResult.transactionId),
      recovery,
      reason: READY_CODE,
    };
    const finalReceipt = typeof options.afterReceipt === 'function'
      ? await options.afterReceipt(cloneJsonSafe(receipt))
      : receipt;
    const actualText = await fs.readFile(scenePath, 'utf8');
    const receiptFailures = await validateReceipt(finalReceipt, {
      bytesWritten: Buffer.byteLength(nextText, 'utf8'),
      actualBytesWritten: Buffer.byteLength(actualText, 'utf8'),
      inputHash,
      recoveryInputHash: sha256Text(currentText),
      outputHash,
      actualOutputHash: sha256Text(actualText),
      actualText,
      nextText,
      recovery,
      projectId: rawString(providedPlan.projectId),
      sessionId: rawString(providedPlan.sessionId),
      sceneId: rawString(op.sceneId),
      changeId: rawString(op.changeId),
      baselineHashBefore: rawString(providedPlan.baselineHash),
      operationKind: 'replaceExactText',
      writeStatus: 'applied',
      operationId: journalRef.entry.operationId,
      backupId,
      writtenAt,
    });
    if (receiptFailures.length > 0) {
      const failureReason = buildReason(
        receiptFailures.some((failure) => failure.includes('recovery'))
          ? RECOVERY_INVALID_CODE
          : RECEIPT_INVALID_CODE,
        'receipt',
        'receipt validation failed after write',
        {
          receiptFailures,
          recovery,
        },
      );
      const reconciliation = await reconcileJournalAfterFailure(projectRoot, journalRef, options);
      return mapFailureWithReconciliation(failureReason, reconciliation);
    }

    await recordExactTextApplyJournalReceipt(projectRoot, journalRef.entry.operationId, finalReceipt, {
      now: options.now,
    });
    if (typeof options.afterReceiptWritten === 'function') {
      await options.afterReceiptWritten(cloneJsonSafe(finalReceipt));
    }
    const reconciliation = await reconcileExactTextApplyJournal(
      projectRoot,
      journalRef.entry.operationId,
      { now: options.now },
    );
    if (reconciliation.outcome !== 'applied_receipt_present') {
      throw new Error('exact text receipt reconciliation did not confirm apply');
    }
    return buildSingleAppliedResult(finalReceipt, { reconciliation });
  } catch (error) {
    const failureReason = buildReason(
      'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_WRITE_FAILED',
      'scenePath',
      'transactional markdown write failed',
      {
        errorCode: rawString(error?.code),
        errorReason: rawString(error?.reason),
        recovery: await buildTruthfulRecoveryEvidence(null, capturedRecoveryEvidence, currentText),
      },
    );
    const reconciliation = await reconcileJournalAfterFailure(projectRoot, journalRef, options);
    if (reconciliation?.outcome === 'applied_receipt_present' && isPlainObject(reconciliation.receipt)) {
      return buildSingleAppliedResult(reconciliation.receipt, {
        reconciledAfterReceiptWrite: true,
        reconciliation,
      });
    }
    return mapFailureWithReconciliation(failureReason, reconciliation);
  }
}
