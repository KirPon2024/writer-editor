import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  atomicWriteFile,
  clearTransactionIntent,
  readTransactionIntent,
} from '../markdown/index.mjs';

export const REVISION_BRIDGE_EXACT_TEXT_APPLY_JOURNAL_SCHEMA =
  'revision-bridge.exact-text-apply-journal.v1';
export const REVISION_BRIDGE_EXACT_TEXT_APPLY_RECONCILIATION_SCHEMA =
  'revision-bridge.exact-text-apply-reconciliation.v1';

const JOURNAL_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-apply-journal'];
const EPOCH_DIRECTORY_SEGMENTS = ['backups', 'revision-bridge-apply-journal', 'mutation-epoch'];
const JOURNAL_MAX_BYTES = 256 * 1024;
const JOURNAL_SCAN_LIMIT = 512;
const JOURNAL_RETAIN_RECONCILED = 64;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const OPERATION_ID_PATTERN = /^op_[a-z0-9][a-z0-9_-]{0,95}$/iu;
const PENDING_STATUSES = new Set(['prepared', 'applied', 'receipt_written']);
const EPOCH_SCHEMA_VERSION = 'revision-bridge.exact-text-mutation-epoch.v1';
const EPOCH_MAX_SCENES = 4096;

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

function resolveNowMs(nowFn = Date.now) {
  const stamp = Number(typeof nowFn === 'function' ? nowFn() : Date.now());
  return Number.isFinite(stamp) && stamp >= 0 ? Math.trunc(stamp) : Date.now();
}

function toIsoString(nowFn = Date.now) {
  return new Date(resolveNowMs(nowFn)).toISOString();
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function journalError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.reason = code;
  error.details = details;
  return error;
}

function assertHash(value, field) {
  const normalized = normalizeString(value).toLowerCase();
  if (!HASH_PATTERN.test(normalized)) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_HASH_INVALID', `${field} must be a sha256 hash`, {
      field,
    });
  }
  return normalized;
}

function buildOperationId(nowFn = Date.now) {
  return `op_${resolveNowMs(nowFn)}_${crypto.randomBytes(6).toString('hex')}`;
}

function assertOperationId(value) {
  const operationId = normalizeString(value);
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    throw journalError(
      'E_REVISION_BRIDGE_APPLY_JOURNAL_OPERATION_ID_INVALID',
      'operationId is invalid',
    );
  }
  return operationId;
}

function normalizeOperationId(value, nowFn = Date.now) {
  return assertOperationId(normalizeString(value) || buildOperationId(nowFn));
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function toPortableRelativePath(rootPath, candidatePath, field) {
  const relative = path.relative(rootPath, candidatePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_PATH_OUTSIDE_PROJECT', `${field} is outside project`, {
      field,
    });
  }
  return relative.split(path.sep).join('/');
}

function normalizePortableRelativePath(value, field) {
  const normalized = normalizeString(value);
  if (
    !normalized
    || normalized.includes('\\')
    || path.posix.isAbsolute(normalized)
    || path.posix.normalize(normalized) !== normalized
    || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_RELATIVE_PATH_INVALID', `${field} is invalid`, {
      field,
    });
  }
  return normalized;
}

async function resolveProjectContext(projectRootRaw, { createJournalDirectory = false } = {}) {
  const projectRoot = path.resolve(normalizeString(projectRootRaw));
  if (!normalizeString(projectRootRaw)) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_PROJECT_ROOT_REQUIRED', 'projectRoot is required');
  }

  const rootStat = await fs.stat(projectRoot);
  if (!rootStat.isDirectory()) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_PROJECT_ROOT_INVALID', 'projectRoot is not a directory');
  }
  const projectRealRoot = await fs.realpath(projectRoot);

  let cursor = projectRoot;
  if (createJournalDirectory) {
    for (const segment of JOURNAL_DIRECTORY_SEGMENTS) {
      cursor = path.join(cursor, segment);
      try {
        const stat = await fs.lstat(cursor);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw journalError(
            'E_REVISION_BRIDGE_APPLY_JOURNAL_DIRECTORY_UNSAFE',
            'journal directory must be a real directory',
          );
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        await fs.mkdir(cursor);
      }
    }
  }

  const journalDirectory = path.join(projectRoot, ...JOURNAL_DIRECTORY_SEGMENTS);
  if (createJournalDirectory) {
    const journalRealPath = await fs.realpath(journalDirectory);
    if (!isPathInside(projectRealRoot, journalRealPath)) {
      throw journalError(
        'E_REVISION_BRIDGE_APPLY_JOURNAL_DIRECTORY_OUTSIDE_PROJECT',
        'journal directory resolves outside project',
      );
    }
  }

  return { projectRoot, projectRealRoot, journalDirectory };
}

async function resolveExistingProjectFile(context, candidateRaw, field) {
  const candidatePath = path.resolve(normalizeString(candidateRaw));
  if (!normalizeString(candidateRaw) || !isPathInside(context.projectRoot, candidatePath)) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_PATH_OUTSIDE_PROJECT', `${field} is outside project`, {
      field,
    });
  }
  const stat = await fs.lstat(candidatePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_FILE_UNSAFE', `${field} must be a real file`, {
      field,
    });
  }
  const realPath = await fs.realpath(candidatePath);
  if (!isPathInside(context.projectRealRoot, realPath)) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_PATH_OUTSIDE_PROJECT', `${field} resolves outside project`, {
      field,
    });
  }
  return candidatePath;
}

async function resolveStoredProjectFile(context, relativePathRaw, field) {
  const relativePath = normalizePortableRelativePath(relativePathRaw, field);
  const candidatePath = path.join(context.projectRoot, ...relativePath.split('/'));
  return resolveExistingProjectFile(context, candidatePath, field);
}

function journalPathFor(context, operationId) {
  return path.join(context.journalDirectory, `${assertOperationId(operationId)}.json`);
}

function validateJournalEntry(entry, expectedOperationId = '') {
  if (!isPlainObject(entry) || entry.schemaVersion !== REVISION_BRIDGE_EXACT_TEXT_APPLY_JOURNAL_SCHEMA) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_SCHEMA_INVALID', 'journal schema is invalid');
  }
  const operationId = assertOperationId(entry.operationId);
  if (expectedOperationId && operationId !== expectedOperationId) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_OPERATION_ID_MISMATCH', 'journal operationId mismatch');
  }
  if (![...PENDING_STATUSES, 'reconciled'].includes(entry.status)) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_STATUS_INVALID', 'journal status is invalid');
  }
  normalizePortableRelativePath(entry.sceneRelativePath, 'sceneRelativePath');
  assertHash(entry.beforeHash, 'beforeHash');
  assertHash(entry.afterHash, 'afterHash');
  return entry;
}

async function readJournalEntryFromContext(context, operationIdRaw) {
  const operationId = assertOperationId(operationIdRaw);
  const journalPath = journalPathFor(context, operationId);
  const stat = await fs.lstat(journalPath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > JOURNAL_MAX_BYTES) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_FILE_UNSAFE', 'journal file is unsafe');
  }
  const parsed = JSON.parse(await fs.readFile(journalPath, 'utf8'));
  return validateJournalEntry(parsed, operationId);
}

async function writeJournalEntry(context, entry) {
  const validated = validateJournalEntry(entry, entry.operationId);
  const journalPath = journalPathFor(context, validated.operationId);
  const result = await atomicWriteFile(journalPath, `${JSON.stringify(validated, null, 2)}\n`, {
    safetyMode: 'strict',
  });
  return { entry: cloneJsonSafe(validated), journalPath, bytesWritten: result.bytesWritten };
}

function appendStatus(entry, status, nowFn) {
  const at = toIsoString(nowFn);
  const history = Array.isArray(entry.history) ? entry.history : [];
  return {
    ...entry,
    status,
    updatedAt: at,
    history: [...history, { status, at }],
  };
}

async function updateJournalEntry(projectRoot, operationId, updater, options = {}) {
  const context = await resolveProjectContext(projectRoot, { createJournalDirectory: true });
  const current = await readJournalEntryFromContext(context, operationId);
  const next = await updater(cloneJsonSafe(current), context);
  return writeJournalEntry(context, next);
}

// Bounded per-scene mutationEpoch counter. The epoch is a monotonic per-scene
// integer bumped on every successful apply journal prepare for that scene. It is
// the bounded source the exact apply path uses to detect concurrent mutation
// drift between a canonical read and commit. The counter lives in a single JSON
// file per project keyed by a sha256 of the portable scene relative path, with a
// hard cap on the number of scenes tracked. The file is written atomically.

function sceneEpochKey(sceneRelativePath) {
  return crypto.createHash('sha256').update(Buffer.from(sceneRelativePath, 'utf8')).digest('hex');
}

async function ensureEpochDirectory(context) {
  let cursor = context.projectRoot;
  for (const segment of EPOCH_DIRECTORY_SEGMENTS) {
    cursor = path.join(cursor, segment);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_DIRECTORY_UNSAFE', 'epoch directory must be a real directory');
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await fs.mkdir(cursor);
    }
  }
  return cursor;
}

async function readEpochIndex(context) {
  const epochDirectory = await ensureEpochDirectory(context);
  const indexPath = path.join(epochDirectory, 'index.v1.json');
  try {
    const stat = await fs.lstat(indexPath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > JOURNAL_MAX_BYTES) {
      throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_DIRECTORY_UNSAFE', 'epoch index is unsafe');
    }
    const parsed = JSON.parse(await fs.readFile(indexPath, 'utf8'));
    if (parsed.schemaVersion !== EPOCH_SCHEMA_VERSION || !isPlainObject(parsed.scenes)) {
      return { scenes: {}, epochDirectory };
    }
    return { scenes: parsed.scenes, epochDirectory };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return { scenes: {}, epochDirectory };
  }
}

async function writeEpochIndex(context, scenes, epochDirectory) {
  const indexPath = path.join(epochDirectory, 'index.v1.json');
  const record = {
    schemaVersion: EPOCH_SCHEMA_VERSION,
    updatedAt: toIsoString(),
    sceneCount: Object.keys(scenes).length,
    scenes,
  };
  await atomicWriteFile(indexPath, `${JSON.stringify(record, null, 2)}\n`, { safetyMode: 'strict' });
}

// Read the current mutationEpoch for a scene. Returns 0 if the scene has never
// been bumped. The epoch is a bounded monotonic counter per portable scene path.
export async function readMutationEpochForScene(projectRoot, sceneRelativePath) {
  const normalized = normalizePortableRelativePath(sceneRelativePath, 'sceneRelativePath');
  const context = await resolveProjectContext(projectRoot, { createJournalDirectory: true });
  const { scenes } = await readEpochIndex(context);
  const key = sceneEpochKey(normalized);
  const value = Number(scenes[key]);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

// Bump the mutationEpoch for a scene and return the new value. The bump is
// bounded: the scene count is capped and the oldest entries are pruned. The
// caller passes the sceneRelativePath resolved at prepare time.
export async function bumpMutationEpochForScene(projectRoot, sceneRelativePath) {
  const normalized = normalizePortableRelativePath(sceneRelativePath, 'sceneRelativePath');
  const context = await resolveProjectContext(projectRoot, { createJournalDirectory: true });
  const { scenes, epochDirectory } = await readEpochIndex(context);
  const key = sceneEpochKey(normalized);
  const previous = Number(scenes[key]);
  const nextEpoch = (Number.isSafeInteger(previous) && previous > 0 ? previous : 0) + 1;
  const nextScenes = {
    ...scenes,
    [key]: { epoch: nextEpoch, sceneRelativePath: normalized, updatedAt: toIsoString() },
  };
  // Bounded prune: if the scene count exceeds the cap, drop the oldest entries.
  const entries = Object.entries(nextScenes);
  if (entries.length > EPOCH_MAX_SCENES) {
    const sorted = entries.sort((left, right) => (
      String(left[1].updatedAt || '').localeCompare(String(right[1].updatedAt || ''))
    ));
    const pruned = sorted.slice(entries.length - EPOCH_MAX_SCENES);
    const prunedScenes = {};
    for (const [k, v] of pruned) prunedScenes[k] = v;
    await writeEpochIndex(context, prunedScenes, epochDirectory);
    return nextEpoch;
  }
  await writeEpochIndex(context, nextScenes, epochDirectory);
  return nextEpoch;
}

// Build the per-operation expected slices digest. Each slice binds a changeId
// to the before/after sha256 of the exact text region the operation touches.
// This is the bounded per-operation digest the journal records so reconcile can
// prove the operation applied to the exact bytes it was authorised on.
export function buildExpectedSlices(operations = []) {
  if (!Array.isArray(operations)) return [];
  return operations.map((operation) => {
    const changeId = normalizeString(operation?.changeId);
    const beforeText = typeof operation?.expectedText === 'string' ? operation.expectedText : '';
    const afterText = typeof operation?.replacementText === 'string' ? operation.replacementText : '';
    return {
      changeId,
      beforeSliceDigest: sha256Text(beforeText),
      afterSliceDigest: sha256Text(afterText),
    };
  });
}

export async function prepareExactTextApplyJournal(input = {}, options = {}) {
  const context = await resolveProjectContext(input.projectRoot, { createJournalDirectory: true });
  const scenePath = await resolveExistingProjectFile(context, input.scenePath, 'scenePath');
  const operationId = normalizeOperationId(options.operationId, options.now);
  const beforeHash = assertHash(input.beforeHash, 'beforeHash');
  const afterHash = assertHash(input.afterHash, 'afterHash');
  if (beforeHash === afterHash) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_NO_OP', 'beforeHash and afterHash must differ');
  }
  const preparedAt = toIsoString(options.now);
  const changeIds = Array.isArray(input.changeIds)
    ? input.changeIds.map((value) => normalizeString(value)).filter(Boolean)
    : [];
  if (changeIds.length === 0) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_CHANGE_ID_REQUIRED', 'changeIds are required');
  }

  const sceneRelativePath = toPortableRelativePath(context.projectRoot, scenePath, 'scenePath');
  // Bump the bounded per-scene mutationEpoch and stamp it on the journal entry.
  // The epoch is the bounded monotonic counter the exact apply path uses to
  // detect concurrent mutation drift between a canonical read and commit.
  const mutationEpoch = await bumpMutationEpochForScene(context.projectRoot, sceneRelativePath);
  // Build per-operation expected slices digests from the optional operations
  // array. Callers that do not pass operations get an empty array; the exact
  // apply writers always pass the resolved operations so the journal records a
  // per-operation authority digest.
  const expectedSlices = buildExpectedSlices(input.operations);

  const entry = {
    schemaVersion: REVISION_BRIDGE_EXACT_TEXT_APPLY_JOURNAL_SCHEMA,
    operationId,
    status: 'prepared',
    operationKind: normalizeString(input.operationKind),
    projectId: normalizeString(input.projectId),
    sessionId: normalizeString(input.sessionId),
    sceneId: normalizeString(input.sceneId),
    changeIds: [...new Set(changeIds)],
    sceneRelativePath,
    beforeHash,
    afterHash,
    inputHash: assertHash(input.inputHash, 'inputHash'),
    mutationEpoch,
    expectedSlices,
    preparedAt,
    updatedAt: preparedAt,
    transactionId: '',
    recovery: {
      snapshotCreated: false,
      snapshotRelativePath: '',
      snapshotHash: '',
    },
    receipt: null,
    reconciliation: null,
    history: [{ status: 'prepared', at: preparedAt }],
  };
  return writeJournalEntry(context, entry);
}

export async function recordExactTextApplyJournalSnapshot(projectRoot, operationId, snapshot = {}, options = {}) {
  return updateJournalEntry(projectRoot, operationId, async (entry, context) => {
    if (entry.status !== 'prepared') {
      throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_TRANSITION_INVALID', 'snapshot requires prepared status');
    }
    const snapshotPath = await resolveExistingProjectFile(context, snapshot.snapshotPath, 'snapshotPath');
    const snapshotText = await fs.readFile(snapshotPath, 'utf8');
    const snapshotHash = sha256Text(snapshotText);
    if (snapshotHash !== entry.beforeHash) {
      throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_SNAPSHOT_MISMATCH', 'snapshot does not match beforeHash');
    }
    return {
      ...entry,
      transactionId: normalizeString(snapshot.transactionId) || entry.transactionId,
      updatedAt: toIsoString(options.now),
      recovery: {
        snapshotCreated: true,
        snapshotRelativePath: toPortableRelativePath(context.projectRoot, snapshotPath, 'snapshotPath'),
        snapshotHash,
      },
    };
  }, options);
}

export async function recordExactTextApplyJournalApplied(projectRoot, operationId, details = {}, options = {}) {
  return updateJournalEntry(projectRoot, operationId, async (entry, context) => {
    if (entry.status !== 'prepared' || entry.recovery?.snapshotHash !== entry.beforeHash) {
      throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_TRANSITION_INVALID', 'applied requires verified recovery');
    }
    const scenePath = await resolveStoredProjectFile(context, entry.sceneRelativePath, 'sceneRelativePath');
    const observedHash = sha256Text(await fs.readFile(scenePath, 'utf8'));
    if (observedHash !== entry.afterHash) {
      throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_AFTER_HASH_MISMATCH', 'target does not match afterHash');
    }
    const next = appendStatus(entry, 'applied', options.now);
    next.transactionId = normalizeString(details.transactionId) || entry.transactionId;
    return next;
  }, options);
}

export async function recordExactTextApplyJournalReceipt(projectRoot, operationId, receipt, options = {}) {
  return updateJournalEntry(projectRoot, operationId, async (entry, context) => {
    if (entry.status !== 'applied' || !isPlainObject(receipt)) {
      throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_TRANSITION_INVALID', 'receipt requires applied status');
    }
    const scenePath = await resolveStoredProjectFile(context, entry.sceneRelativePath, 'sceneRelativePath');
    const observedHash = sha256Text(await fs.readFile(scenePath, 'utf8'));
    if (
      observedHash !== entry.afterHash
      || receipt.operationId !== entry.operationId
      || receipt.outputHash !== entry.afterHash
      || receipt.writeStatus !== 'applied'
    ) {
      throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_RECEIPT_INVALID', 'receipt does not match journal');
    }
    const next = appendStatus(entry, 'receipt_written', options.now);
    next.receipt = cloneJsonSafe(receipt);
    next.transactionId = normalizeString(receipt.transactionId) || entry.transactionId;
    return next;
  }, options);
}

function publicReconciliation(entry) {
  const reconciliation = isPlainObject(entry.reconciliation) ? entry.reconciliation : {};
  return {
    schemaVersion: REVISION_BRIDGE_EXACT_TEXT_APPLY_RECONCILIATION_SCHEMA,
    operationId: entry.operationId,
    status: entry.status,
    previousStatus: normalizeString(reconciliation.previousStatus),
    outcome: normalizeString(reconciliation.outcome),
    ambiguous: reconciliation.ambiguous === true,
    projectId: entry.projectId,
    sessionId: entry.sessionId,
    sceneId: entry.sceneId,
    changeIds: Array.isArray(entry.changeIds) ? [...entry.changeIds] : [],
    sceneRelativePath: entry.sceneRelativePath,
    beforeHash: entry.beforeHash,
    afterHash: entry.afterHash,
    observedHash: normalizeString(reconciliation.observedHash),
    recoveryVerified: reconciliation.recoveryVerified === true,
    snapshotAvailable: reconciliation.snapshotAvailable === true,
    snapshotRestorable: reconciliation.snapshotRestorable === true,
    targetAbsent: reconciliation.targetAbsent === true,
    targetUnsafe: reconciliation.targetUnsafe === true,
    transactionIntentState: normalizeString(reconciliation.transactionIntentState),
    safeActions: Array.isArray(reconciliation.safeActions) ? [...reconciliation.safeActions] : [],
    reconciledAt: normalizeString(reconciliation.reconciledAt),
    receipt: reconciliation.outcome === 'applied_receipt_present' && isPlainObject(entry.receipt)
      ? cloneJsonSafe(entry.receipt)
      : null,
  };
}

export async function reconcileExactTextApplyJournal(projectRoot, operationId, options = {}) {
  const context = await resolveProjectContext(projectRoot, { createJournalDirectory: true });
  const entry = await readJournalEntryFromContext(context, operationId);
  if (entry.status === 'reconciled') return publicReconciliation(entry);

  // Resolve the scene path defensively: the target may be absent after a crash
  // (restore case) or a symlink boundary may have been introduced. We never
  // follow a symlink here; an absent or unsafe target is a typed recovery case.
  const candidateScenePath = path.join(context.projectRoot, ...normalizePortableRelativePath(entry.sceneRelativePath, 'sceneRelativePath').split('/'));
  let scenePath = candidateScenePath;
  let targetAbsent = false;
  let targetUnsafe = false;
  try {
    const stat = await fs.lstat(candidateScenePath);
    if (stat.isSymbolicLink()) {
      targetUnsafe = true;
      scenePath = null;
    } else if (!stat.isFile()) {
      targetAbsent = true;
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      targetAbsent = true;
    } else {
      throw error;
    }
  }

  let observedHash = '';
  if (!targetAbsent && !targetUnsafe && scenePath) {
    observedHash = sha256Text(await fs.readFile(scenePath, 'utf8'));
  }
  let snapshotAvailable = false;
  let snapshotRecorded = normalizeString(entry.recovery?.snapshotRelativePath) !== '';
  let recoveryVerified = false;
  let snapshotRestorable = false;
  if (normalizeString(entry.recovery?.snapshotRelativePath)) {
    try {
      const snapshotPath = await resolveStoredProjectFile(
        context,
        entry.recovery.snapshotRelativePath,
        'snapshotRelativePath',
      );
      snapshotAvailable = true;
      recoveryVerified = sha256Text(await fs.readFile(snapshotPath, 'utf8')) === entry.beforeHash;
      // A snapshot that matches beforeHash can restore an absent target.
      snapshotRestorable = recoveryVerified;
    } catch {}
  }

  const pendingIntent = scenePath ? await readTransactionIntent(scenePath).catch(() => null) : null;
  const intentConflicts = Boolean(
    pendingIntent
    && (
      pendingIntent.corrupt === true
      || (normalizeString(pendingIntent.targetPath) && path.resolve(pendingIntent.targetPath) !== scenePath)
      || (normalizeString(pendingIntent.nextTextHash) && pendingIntent.nextTextHash !== entry.afterHash)
    )
  );
  const receiptValid = entry.status === 'receipt_written'
    && isPlainObject(entry.receipt)
    && entry.receipt.operationId === entry.operationId
    && entry.receipt.outputHash === entry.afterHash
    && entry.receipt.writeStatus === 'applied';

  // Determine the bounded recovery outcome and the typed safeActions that
  // describe how a caller must reconcile. The four sanctioned recovery paths:
  //   (a) target==after + prepared/applied no receipt → roll-forward receipt
  //       (write the receipt WITHOUT a second text write).
  //   (b) target==before + prepared/applied → rollback/cleanup, NEVER applied.
  //   (c) target absent + backup==before → restore from backup.
  //   (d) foreign digest (target neither before nor after) → safe recovery
  //       fork: preserve all bytes, never overwrite.
  let outcome = 'conflict';
  let safeActions = ['RELOAD_CANONICAL'];
  const isForeign = !targetAbsent && !targetUnsafe && observedHash !== entry.beforeHash && observedHash !== entry.afterHash;
  if (targetUnsafe) {
    outcome = 'conflict';
    safeActions = ['SAFE_RECOVERY_FORK', 'RELOAD_CANONICAL'];
  } else if (targetAbsent) {
    // Target absent: a restorable backup snapshot is the cleanest path, but even
    // without a local snapshot the beforeHash is known from the journal and a
    // caller can restore from an external recovery pack or re-run the apply. The
    // typed RESTORE action is always emitted so callers know the target must be
    // restored (not overwritten); SAFE_RECOVERY_FORK is added when no local
    // snapshot proves the restore bytes.
    if (snapshotRestorable) {
      outcome = 'target_absent_restorable';
      safeActions = ['RESTORE_FROM_BACKUP', 'RESTORE', 'RELOAD_CANONICAL'];
    } else {
      outcome = 'target_absent_unrestorable';
      safeActions = ['RESTORE', 'SAFE_RECOVERY_FORK', 'RELOAD_CANONICAL'];
    }
  } else if (!intentConflicts && observedHash === entry.beforeHash) {
    outcome = 'not_applied';
    if (recoveryVerified) {
      // A verified recovery snapshot means the writer never reached the target
      // and the prepared reservation can be cleanly discarded: the canonical
      // target already holds the correct bytes, so the caller only needs to
      // reload canonical (the proven R8 crash-reconciliation path).
      safeActions = ['RELOAD_CANONICAL'];
    } else {
      // No verified recovery snapshot: the prepared journal could not prove the
      // writer never started, so emit the typed rollback/cleanup actions so a
      // caller knows the prepared reservation must be rolled back explicitly.
      safeActions = ['CLEANUP_NOT_APPLIED', 'ROLLBACK_PREPARED', 'RELOAD_CANONICAL'];
    }
  } else if (!intentConflicts && observedHash === entry.afterHash && recoveryVerified && receiptValid) {
    outcome = 'applied_receipt_present';
    safeActions = ['RELOAD_CANONICAL'];
  } else if (!intentConflicts && observedHash === entry.afterHash && recoveryVerified) {
    // Writer applied with a verified recovery snapshot but the receipt was never
    // written. The proven R8 crash-reconciliation path keeps this as a plain
    // RELOAD_CANONICAL: the verified snapshot proves the apply, the caller only
    // needs to reload canonical (the recovery snapshot is the durable proof).
    outcome = 'applied_receipt_missing';
    safeActions = ['RELOAD_CANONICAL'];
  } else if (!intentConflicts && observedHash === entry.afterHash) {
    // Target matches after. Two sub-cases:
    //   - A recovery snapshot was recorded but no longer verifies (tampered,
    //     deleted, hash mismatch): this is a conflict, the recovery proof is
    //     broken even though the bytes match the target.
    //   - No recovery snapshot was ever recorded (prepare-only journal): the
    //     writer appears to have applied without a proven receipt, so emit the
    //     typed roll-forward actions so a caller can record the receipt WITHOUT
    //     a second text write.
    if (snapshotRecorded && !recoveryVerified) {
      outcome = 'conflict';
      safeActions = ['SAFE_RECOVERY_FORK', 'RELOAD_CANONICAL'];
    } else {
      outcome = 'applied_receipt_missing';
      safeActions = ['ROLL_FORWARD_RECEIPT', 'REPLAY_FROM_RECEIPT', 'COMMIT_RECEIPT', 'RELOAD_CANONICAL'];
    }
  } else if (isForeign) {
    // Foreign bytes are never overwritten. Safe recovery fork preserves them.
    outcome = 'conflict';
    safeActions = ['SAFE_RECOVERY_FORK', 'PRESERVE_FOREIGN_BYTES', 'RELOAD_CANONICAL'];
  }

  const reconciledAt = toIsoString(options.now);
  const reconciledEntry = appendStatus(entry, 'reconciled', options.now);
  reconciledEntry.reconciliation = {
    schemaVersion: REVISION_BRIDGE_EXACT_TEXT_APPLY_RECONCILIATION_SCHEMA,
    previousStatus: entry.status,
    outcome,
    ambiguous: outcome === 'applied_receipt_missing' || outcome === 'conflict' || targetAbsent || targetUnsafe,
    observedHash,
    recoveryVerified,
    snapshotAvailable,
    snapshotRestorable,
    targetAbsent,
    targetUnsafe,
    transactionIntentState: normalizeString(pendingIntent?.state),
    safeActions,
    reconciledAt,
  };
  await writeJournalEntry(context, reconciledEntry);

  if (outcome !== 'conflict' && !targetAbsent && !targetUnsafe && pendingIntent) {
    await clearTransactionIntent(scenePath).catch(() => {});
  }
  return publicReconciliation(reconciledEntry);
}

async function listJournalOperationIds(context) {
  let entries = [];
  try {
    entries = await fs.readdir(context.journalDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -5))
    .filter((operationId) => OPERATION_ID_PATTERN.test(operationId))
    .sort()
    .reverse();
}

async function pruneReconciledJournals(context, operationIds) {
  const reconciled = [];
  for (const operationId of operationIds.slice(0, JOURNAL_SCAN_LIMIT)) {
    try {
      const entry = await readJournalEntryFromContext(context, operationId);
      if (entry.status === 'reconciled') reconciled.push(operationId);
    } catch {}
  }
  for (const operationId of reconciled.slice(JOURNAL_RETAIN_RECONCILED)) {
    await fs.unlink(journalPathFor(context, operationId)).catch(() => {});
  }
}

export async function reconcilePendingExactTextApplyJournals(projectRoot, options = {}) {
  const context = await resolveProjectContext(projectRoot, { createJournalDirectory: true });
  const operationIds = await listJournalOperationIds(context);
  const reconciliations = [];
  const errors = [];
  for (const operationId of operationIds.slice(0, JOURNAL_SCAN_LIMIT)) {
    try {
      const entry = await readJournalEntryFromContext(context, operationId);
      if (!PENDING_STATUSES.has(entry.status)) continue;
      reconciliations.push(await reconcileExactTextApplyJournal(projectRoot, operationId, options));
    } catch (error) {
      errors.push({
        operationId,
        code: normalizeString(error?.code) || 'E_REVISION_BRIDGE_APPLY_JOURNAL_RECONCILE_FAILED',
      });
    }
  }
  if (operationIds.length > JOURNAL_SCAN_LIMIT) {
    errors.push({
      operationId: '',
      code: 'E_REVISION_BRIDGE_APPLY_JOURNAL_SCAN_LIMIT_EXCEEDED',
    });
  }
  await pruneReconciledJournals(context, operationIds);
  return {
    ok: errors.length === 0,
    reconciliations,
    userRelevant: reconciliations.filter((item) => item.outcome !== 'applied_receipt_present'),
    errors,
  };
}

export async function readCanonicalSceneForExactTextApplyReconciliation(projectRoot, operationId) {
  const context = await resolveProjectContext(projectRoot, { createJournalDirectory: true });
  const entry = await readJournalEntryFromContext(context, operationId);
  if (entry.status !== 'reconciled' || !isPlainObject(entry.reconciliation)) {
    throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_NOT_RECONCILED', 'journal is not reconciled');
  }
  const scenePath = await resolveStoredProjectFile(context, entry.sceneRelativePath, 'sceneRelativePath');
  const content = await fs.readFile(scenePath, 'utf8');
  return {
    operationId: entry.operationId,
    scenePath,
    content,
    contentHash: sha256Text(content),
    reconciliation: publicReconciliation(entry),
  };
}

export async function acknowledgeExactTextApplyReconciliation(projectRoot, operationId, action, options = {}) {
  return updateJournalEntry(projectRoot, operationId, async (entry) => {
    if (entry.status !== 'reconciled' || !isPlainObject(entry.reconciliation)) {
      throw journalError('E_REVISION_BRIDGE_APPLY_JOURNAL_NOT_RECONCILED', 'journal is not reconciled');
    }
    return {
      ...entry,
      updatedAt: toIsoString(options.now),
      reconciliation: {
        ...entry.reconciliation,
        acknowledgedAction: normalizeString(action),
        acknowledgedAt: toIsoString(options.now),
      },
    };
  }, options);
}
