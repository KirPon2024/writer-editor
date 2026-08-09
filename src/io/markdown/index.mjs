import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { atomicWriteFile, unlinkDurable } from './atomicWriteFile.mjs';
import { createRecoverySnapshot, listRecoverySnapshots } from './snapshotFile.mjs';
import { asMarkdownIoError, createMarkdownIoError } from './ioErrors.mjs';
import { appendReliabilityLog, buildReliabilityLogRecord } from './reliabilityLog.mjs';
import pathBoundary from '../../core/io/path-boundary.js';

const RECOVERY_FALLBACK_CODES = new Set([
  'E_IO_CORRUPT_INPUT',
  'E_IO_INVALID_ENCODING',
  'E_IO_TRUNCATED_INPUT',
  'E_IO_INTEGRITY_MISMATCH',
]);

function normalizeMarkdownInput(input) {
  if (typeof input === 'string') return input;
  throw createMarkdownIoError('E_IO_INVALID_CONTENT', 'invalid_markdown_content');
}

function normalizeLimit(value) {
  if (Number.isInteger(value) && value > 0) return value;
  return 1024 * 1024;
}

function normalizeSafetyMode(input) {
  return input === 'compat' ? 'compat' : 'strict';
}

function normalizeExpectedSha256(input) {
  if (typeof input !== 'string') return '';
  const value = input.trim().toLowerCase();
  return /^[a-f0-9]{64}$/u.test(value) ? value : '';
}

function computeSha256Bytes(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function isUtf8Truncated(buffer) {
  let i = 0;
  while (i < buffer.length) {
    const byte = buffer[i];
    if ((byte & 0x80) === 0) {
      i += 1;
      continue;
    }

    let expected = 0;
    if ((byte & 0xe0) === 0xc0) expected = 2;
    else if ((byte & 0xf0) === 0xe0) expected = 3;
    else if ((byte & 0xf8) === 0xf0) expected = 4;
    else return false;

    if (i + expected > buffer.length) return true;

    for (let j = 1; j < expected; j += 1) {
      const next = buffer[i + j];
      if ((next & 0xc0) !== 0x80) return false;
    }

    i += expected;
  }

  return false;
}

function decodeUtf8Strict(buffer) {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(buffer);
  } catch {
    if (isUtf8Truncated(buffer)) {
      throw createMarkdownIoError('E_IO_TRUNCATED_INPUT', 'truncated_utf8_input', {
        byteLen: buffer.byteLength,
      });
    }
    throw createMarkdownIoError('E_IO_INVALID_ENCODING', 'invalid_utf8_encoding', {
      byteLen: buffer.byteLength,
    });
  }
}

function resolveSourcePath(sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
    throw createMarkdownIoError('E_IO_INVALID_PATH', 'invalid_source_path');
  }
  const validation = pathBoundary.validatePathBoundary(sourcePath, { mode: 'any' });
  if (!validation.ok) {
    throw createMarkdownIoError('E_PATH_BOUNDARY_VIOLATION', 'path_boundary_violation', {
      failSignal: 'E_PATH_BOUNDARY_VIOLATION',
      failReason: validation.failReason,
      sourcePath: String(sourcePath || ''),
    });
  }
  return path.resolve(validation.normalizedPath);
}

function toMarkdownIoError(error, fallbackCode, fallbackReason, details) {
  return asMarkdownIoError(error, fallbackCode, fallbackReason, details);
}

function pickErrorDetails(error) {
  if (error && error.details && typeof error.details === 'object' && !Array.isArray(error.details)) {
    return error.details;
  }
  return {};
}

function normalizeRecoverySnapshotScanLimit(value) {
  if (Number.isInteger(value) && value >= 1 && value <= 20) return value;
  return 3;
}

function buildTransactionIntentId(nowFn = Date.now) {
  const stamp = Number(nowFn());
  const safeStamp = Number.isFinite(stamp) && stamp >= 0 ? Math.trunc(stamp) : Date.now();
  return `tx_${safeStamp}_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildTransactionIntentPath(targetPath) {
  const directory = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  return path.join(directory, `.${baseName}.tx.intent.json`);
}

function buildRecoveryPackId(nowFn = Date.now) {
  const stamp = Number(nowFn());
  const safeStamp = Number.isFinite(stamp) && stamp >= 0 ? Math.trunc(stamp) : Date.now();
  return String(safeStamp).padStart(13, '0');
}

function buildRecoveryPackPath(targetPath, recoveryId, outputRoot) {
  const directory = typeof outputRoot === 'string' && outputRoot.trim().length > 0
    ? path.resolve(outputRoot.trim())
    : path.join(os.tmpdir(), 'writer-editor-recovery-packs');
  const baseName = path.basename(targetPath);
  return path.join(directory, `${recoveryId}-${baseName}.recovery`);
}

function buildRecoveryPackManifest(recoveryPackPath) {
  return path.join(recoveryPackPath, 'manifest.recovery.json');
}

function buildRecoveryPackGuide(recoveryPackPath) {
  return path.join(recoveryPackPath, 'RECOVERY.md');
}

function buildRecoveryPackContent(recoveryPackPath) {
  return path.join(recoveryPackPath, 'content.md');
}

function normalizeTransactionStageHook(input) {
  return typeof input === 'function' ? input : null;
}

async function emitTransactionStage(stageHook, stage, payload) {
  if (!stageHook) return;
  await stageHook({
    stage,
    ...payload,
  });
}

async function writeTransactionIntent(intentPath, payload, options = {}) {
  await atomicWriteFile(intentPath, `${JSON.stringify(payload, null, 2)}\n`, {
    safetyMode: options.safetyMode,
  });
}

async function readTransactionIntent(targetPath) {
  const intentPath = buildTransactionIntentPath(targetPath);
  try {
    const raw = await fs.readFile(intentPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      intentPath,
      corrupt: false,
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    return {
      transactionId: '',
      targetPath,
      state: 'CORRUPT_INTENT',
      intentPath,
      corrupt: true,
      corruptMessage: error && error.message ? String(error.message) : 'intent_parse_failed',
    };
  }
}

// Durable unlink of the transaction intent file: after unlinking the intent we
// fsync the parent directory so the deletion is durable, not just the page
// cache. Without the parent fsync a crash after unlink can leave a stale intent
// that re-triggers ambiguous recovery even though the scene write committed.
// The optional afterParentSync hook lets tests observe the parent fsync happened.
async function clearTransactionIntent(targetPath, options = {}) {
  const intentPath = buildTransactionIntentPath(targetPath);
  await fs.unlink(intentPath).catch((error) => {
    if (error && error.code !== 'ENOENT') throw error;
  });
  const directory = path.dirname(intentPath);
  let directoryHandle = null;
  let parentSynced = false;
  try {
    directoryHandle = await fs.open(directory, 'r');
    await directoryHandle.sync();
    parentSynced = true;
  } catch (error) {
    const unsupportedOnWindows = process.platform === 'win32'
      && ['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes(error?.code);
    if (!unsupportedOnWindows) throw error;
  } finally {
    if (directoryHandle) await directoryHandle.close().catch(() => {});
  }
  if (parentSynced && typeof options.afterParentSync === 'function') {
    try {
      await options.afterParentSync({ directory });
    } catch {}
  }
  return { intentPath, directory, parentSynced };
}

// No-follow regular-file guard. The exact apply read path must never follow a
// symlinked scene file: a symlink whose target lives outside the project would
// let a crafted scene mutate bytes outside the project root. lstat first; if the
// entry is a symlink, reject with a typed no-follow error before any read.
async function inspectRegularNoFollow(sourcePath) {
  let stat;
  try {
    stat = await fs.lstat(sourcePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw createMarkdownIoError('E_IO_READ_FAIL', 'read_markdown_failed', {
        sourcePath,
      });
    }
    throw error;
  }
  if (stat.isSymbolicLink()) {
    throw createMarkdownIoError('E_IO_SYMLINK_REJECTED_NO_FOLLOW', 'symlink_scene_rejected_no_follow', {
      sourcePath,
      recoveryAction: 'ABORT',
    });
  }
  if (!stat.isFile()) {
    throw createMarkdownIoError('E_IO_NOT_A_REGULAR_FILE', 'not_a_regular_file', {
      sourcePath,
    });
  }
  return stat;
}

// No-follow regular file read: lstat guards against symlinks, then the file is
// read with a size cap and an optional expected sha256. This is the bounded
// read oracle for scene reads on the exact apply path.
async function readRegularNoFollow(sourcePath, options = {}) {
  const maxBytes = normalizeLimit(options.maxInputBytes);
  const expectedSha256 = normalizeExpectedSha256(options.expectedSha256);
  const resolvedPath = resolveSourcePath(sourcePath);
  const stat = await inspectRegularNoFollow(resolvedPath);
  if (stat.size > maxBytes) {
    throw createMarkdownIoError('E_IO_INPUT_TOO_LARGE', 'input_too_large', {
      maxInputBytes: maxBytes,
      byteLen: stat.size,
    });
  }
  const buffer = await fs.readFile(resolvedPath);
  if (buffer.includes(0)) {
    throw createMarkdownIoError('E_IO_CORRUPT_INPUT', 'corrupt_input_null_byte', {
      byteLen: buffer.byteLength,
    });
  }
  if (expectedSha256) {
    const actualSha256 = computeSha256Bytes(buffer);
    if (actualSha256 !== expectedSha256) {
      throw createMarkdownIoError('E_IO_INTEGRITY_MISMATCH', 'integrity_hash_mismatch', {
        expectedSha256,
        actualSha256,
      });
    }
  }
  const text = decodeUtf8Strict(buffer);
  return {
    text,
    byteLen: buffer.byteLength,
    path: resolvedPath,
  };
}

export async function createMarkdownRecoveryPack(targetPathRaw, options = {}) {
  const targetPath = resolveSourcePath(targetPathRaw);
  const text = normalizeMarkdownInput(options.text);
  const recoveryId = typeof options.recoveryId === 'string' && options.recoveryId.trim().length > 0
    ? options.recoveryId.trim()
    : buildRecoveryPackId(options.now);
  const recoveryPackPath = buildRecoveryPackPath(targetPath, recoveryId, options.outputRoot);
  const manifestPath = buildRecoveryPackManifest(recoveryPackPath);
  const guidePath = buildRecoveryPackGuide(recoveryPackPath);
  const contentPath = buildRecoveryPackContent(recoveryPackPath);
  const textHash = computeSha256Bytes(Buffer.from(text, 'utf8'));

  await fs.mkdir(recoveryPackPath, { recursive: true });

  const manifest = {
    schemaVersion: 'markdown-recovery-pack.v1',
    recoveryId,
    createdAt: new Date(Number(options.now ? options.now() : Date.now())).toISOString(),
    targetPath,
    sourceKind: typeof options.sourceKind === 'string' && options.sourceKind.length > 0 ? options.sourceKind : 'primary',
    snapshotPath: typeof options.snapshotPath === 'string' ? options.snapshotPath : '',
    transactionId: options.transaction && typeof options.transaction.transactionId === 'string'
      ? options.transaction.transactionId
      : '',
    transactionState: options.transaction && typeof options.transaction.state === 'string'
      ? options.transaction.state
      : '',
    byteLen: Buffer.byteLength(text, 'utf8'),
    textHash,
    contentFile: 'content.md',
    recoveryAction: typeof options.recoveryAction === 'string' && options.recoveryAction.length > 0
      ? options.recoveryAction
      : (options.sourceKind === 'snapshot' ? 'OPEN_SNAPSHOT' : 'ABORT'),
  };

  const guideLines = [
    `# Recovery Pack`,
    '',
    `Recovery id: ${manifest.recoveryId}`,
    `Created: ${manifest.createdAt}`,
    `Target: ${path.basename(targetPath)}`,
    `Source kind: ${manifest.sourceKind}`,
    manifest.snapshotPath ? `Snapshot: ${manifest.snapshotPath}` : 'Snapshot: none',
    manifest.transactionId ? `Transaction: ${manifest.transactionId}` : 'Transaction: none',
    '',
    '## Restore instructions',
    '',
    '1. Review content.md as the human-readable recovery source.',
    '2. Review manifest.recovery.json for hashes and source metadata.',
    '3. Restore content.md into the target path or run the restore drill helper.',
  ];

  await atomicWriteFile(contentPath, text, { safetyMode: options.safetyMode });
  await atomicWriteFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { safetyMode: options.safetyMode });
  await atomicWriteFile(guidePath, `${guideLines.join('\n')}\n`, { safetyMode: options.safetyMode });

  return {
    ok: 1,
    recoveryPackPath,
    manifestPath,
    guidePath,
    contentPath,
    manifest,
  };
}

export async function validateMarkdownRecoveryPack(recoveryPackPathRaw) {
  const recoveryPackPath = path.resolve(String(recoveryPackPathRaw || '').trim());
  const manifestPath = buildRecoveryPackManifest(recoveryPackPath);
  const guidePath = buildRecoveryPackGuide(recoveryPackPath);
  const contentPath = buildRecoveryPackContent(recoveryPackPath);
  const failures = [];
  let manifest = null;

  try {
    await fs.access(manifestPath);
  } catch {
    failures.push('manifest.recovery.json missing');
  }

  try {
    await fs.access(guidePath);
  } catch {
    failures.push('RECOVERY.md missing');
  }

  try {
    await fs.access(contentPath);
  } catch {
    failures.push('content.md missing');
  }

  if (failures.length === 0) {
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      const content = await fs.readFile(contentPath, 'utf8');
      const guide = await fs.readFile(guidePath, 'utf8');
      if (manifest.schemaVersion !== 'markdown-recovery-pack.v1') failures.push('schemaVersion mismatch');
      if (manifest.contentFile !== 'content.md') failures.push('contentFile mismatch');
      if (computeSha256Bytes(Buffer.from(content, 'utf8')) !== manifest.textHash) failures.push('textHash mismatch');
      if (!guide.includes('Restore instructions')) failures.push('RECOVERY.md missing instructions');
    } catch (error) {
      failures.push(error && error.message ? String(error.message) : 'recovery_pack_validation_failed');
    }
  }

  return {
    ok: failures.length === 0,
    recoveryPackPath,
    manifest,
    failures,
  };
}

export async function restoreMarkdownFromRecoveryPack(recoveryPackPathRaw, restoreTargetPathRaw, options = {}) {
  const validation = await validateMarkdownRecoveryPack(recoveryPackPathRaw);
  if (!validation.ok) {
    throw createMarkdownIoError('E_IO_RECOVERY_PACK_INVALID', 'recovery_pack_invalid', {
      recoveryPackPath: validation.recoveryPackPath,
      failures: validation.failures,
    });
  }

  const restoreTargetPath = resolveSourcePath(restoreTargetPathRaw);
  const contentPath = buildRecoveryPackContent(validation.recoveryPackPath);
  const content = await fs.readFile(contentPath, 'utf8');
  const result = await atomicWriteFile(restoreTargetPath, content, {
    safetyMode: options.safetyMode,
  });

  return {
    ok: 1,
    restoreTargetPath: result.targetPath,
    textHash: computeSha256Bytes(Buffer.from(content, 'utf8')),
    bytesWritten: result.bytesWritten,
  };
}

export async function restoreMarkdownRecoveryDrill(recoveryPackPathRaw, options = {}) {
  const validation = await validateMarkdownRecoveryPack(recoveryPackPathRaw);
  if (!validation.ok) {
    throw createMarkdownIoError('E_IO_RECOVERY_PACK_INVALID', 'recovery_pack_invalid', {
      recoveryPackPath: validation.recoveryPackPath,
      failures: validation.failures,
    });
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-recovery-drill-'));
  const restoreTargetPath = path.join(tempRoot, path.basename(validation.manifest.targetPath || 'restored.md'));
  const restored = await restoreMarkdownFromRecoveryPack(validation.recoveryPackPath, restoreTargetPath, options);

  return {
    ok: restored.textHash === validation.manifest.textHash,
    recoveryPackPath: validation.recoveryPackPath,
    restoreTargetPath,
    textHash: restored.textHash,
    expectedTextHash: validation.manifest.textHash,
  };
}

export async function writeMarkdownWithTransactionRecovery(targetPath, markdown, options = {}) {
  const text = normalizeMarkdownInput(markdown);
  const resolvedPath = resolveSourcePath(targetPath);
  const safetyMode = normalizeSafetyMode(options.safetyMode);
  const stageHook = normalizeTransactionStageHook(options.afterStage);
  const transactionId = buildTransactionIntentId(options.now);
  const intentPath = buildTransactionIntentPath(resolvedPath);

  const baseIntent = {
    schemaVersion: 'markdown-transaction-intent.v1',
    transactionId,
    targetPath: resolvedPath,
    createdAt: new Date(Number(options.now ? options.now() : Date.now())).toISOString(),
    state: 'INTENT_CREATED',
    nextTextHash: computeSha256Bytes(Buffer.from(text, 'utf8')),
    snapshotCreated: false,
    snapshotPath: '',
    recoveryPackPath: '',
  };

  await writeTransactionIntent(intentPath, baseIntent, { safetyMode });
  await emitTransactionStage(stageHook, 'INTENT_CREATED', { targetPath: resolvedPath, intentPath, transactionId });

  const snapshot = await createRecoverySnapshot(resolvedPath, {
    maxSnapshots: options.maxSnapshots,
    now: options.now,
  });

  const snapshotIntent = {
    ...baseIntent,
    state: 'SNAPSHOT_CREATED',
    updatedAt: new Date(Number(options.now ? options.now() : Date.now())).toISOString(),
    snapshotCreated: snapshot.snapshotCreated,
    snapshotPath: snapshot.snapshotPath,
  };

  await writeTransactionIntent(intentPath, snapshotIntent, { safetyMode });
  await emitTransactionStage(stageHook, 'SNAPSHOT_CREATED', {
    targetPath: resolvedPath,
    intentPath,
    transactionId,
    snapshotPath: snapshot.snapshotPath,
    snapshotCreated: snapshot.snapshotCreated,
  });

  const writeResult = await atomicWriteFile(resolvedPath, text, {
    safetyMode,
    beforeRename: options.beforeRename,
    afterTempWrite: options.afterTempWrite,
    afterRename: options.afterRename,
  });

  const committedIntent = {
    ...snapshotIntent,
    state: 'WRITE_COMMITTED',
    updatedAt: new Date(Number(options.now ? options.now() : Date.now())).toISOString(),
    bytesWritten: writeResult.bytesWritten,
  };
  await writeTransactionIntent(intentPath, committedIntent, { safetyMode });
  await emitTransactionStage(stageHook, 'WRITE_COMMITTED', {
    targetPath: resolvedPath,
    intentPath,
    transactionId,
    bytesWritten: writeResult.bytesWritten,
  });

  await clearTransactionIntent(resolvedPath);

  return {
    outPath: writeResult.targetPath,
    bytesWritten: writeResult.bytesWritten,
    safetyMode: writeResult.safetyMode,
    snapshotCreated: snapshot.snapshotCreated,
    snapshotPath: snapshot.snapshotPath,
    purgedSnapshots: snapshot.purgedSnapshots,
    transactionId,
    intentPath,
  };
}

export async function writeMarkdownWithRecovery(targetPath, markdown, options = {}) {
  const text = normalizeMarkdownInput(markdown);
  const safetyMode = normalizeSafetyMode(options.safetyMode);
  const snapshot = await createRecoverySnapshot(targetPath, {
    maxSnapshots: options.maxSnapshots,
    now: options.now,
  });
  const writeResult = await atomicWriteFile(targetPath, text, {
    safetyMode,
    beforeRename: options.beforeRename,
    afterTempWrite: options.afterTempWrite,
    afterRename: options.afterRename,
  });

  return {
    outPath: writeResult.targetPath,
    bytesWritten: writeResult.bytesWritten,
    safetyMode: writeResult.safetyMode,
    snapshotCreated: snapshot.snapshotCreated,
    snapshotPath: snapshot.snapshotPath,
    purgedSnapshots: snapshot.purgedSnapshots,
  };
}

export async function readMarkdownWithLimits(sourcePath, options = {}) {
  const resolvedPath = resolveSourcePath(sourcePath);

  try {
    // No-follow guard: a symlinked scene must be rejected before any read so a
    // crafted scene can never mutate bytes outside the project root through the
    // apply read path. fs.stat would follow the symlink; lstat does not.
    const stat = await fs.lstat(resolvedPath);
    if (stat.isSymbolicLink()) {
      throw createMarkdownIoError('E_IO_SYMLINK_REJECTED_NO_FOLLOW', 'symlink_scene_rejected_no_follow', {
        sourcePath: resolvedPath,
        recoveryAction: 'ABORT',
      });
    }
    if (!stat.isFile()) {
      throw createMarkdownIoError('E_IO_NOT_A_REGULAR_FILE', 'not_a_regular_file', {
        sourcePath: resolvedPath,
      });
    }
    return await readRegularNoFollow(resolvedPath, options);
  } catch (error) {
    throw toMarkdownIoError(error, 'E_IO_READ_FAIL', 'read_markdown_failed', {
      sourcePath: resolvedPath,
    });
  }
}

function createSnapshotMissingError(sourcePath, primaryError) {
  return createMarkdownIoError('E_IO_SNAPSHOT_MISSING', 'snapshot_missing', {
    sourcePath,
    primaryCode: primaryError.code,
    primaryReason: primaryError.reason,
    recoveryAction: 'OPEN_SNAPSHOT',
  });
}

function createSnapshotMismatchError(sourcePath, attemptedSnapshotPaths, primaryError, snapshotError) {
  const normalizedAttempts = Array.isArray(attemptedSnapshotPaths)
    ? attemptedSnapshotPaths.filter((item) => typeof item === 'string' && item.length > 0)
    : [];
  const snapshotPath = normalizedAttempts[0] || '';
  return createMarkdownIoError('E_IO_SNAPSHOT_MISMATCH', 'snapshot_mismatch', {
    sourcePath,
    snapshotPath,
    attemptedSnapshotPaths: normalizedAttempts,
    primaryCode: primaryError.code,
    primaryReason: primaryError.reason,
    snapshotCode: snapshotError.code,
    snapshotReason: snapshotError.reason,
    recoveryAction: 'OPEN_SNAPSHOT',
  });
}

export async function readMarkdownWithRecovery(sourcePath, options = {}) {
  const resolvedPath = resolveSourcePath(sourcePath);

  try {
    const loaded = await readMarkdownWithLimits(resolvedPath, options);
    return {
      ...loaded,
      sourceKind: 'primary',
      recoveredFromSnapshot: false,
      snapshotPath: '',
      recoveryAction: 'ABORT',
    };
  } catch (error) {
    const ioError = toMarkdownIoError(error, 'E_IO_READ_FAIL', 'read_markdown_failed', {
      sourcePath: resolvedPath,
    });

    if (!RECOVERY_FALLBACK_CODES.has(ioError.code)) {
      throw ioError;
    }

    const snapshots = await listRecoverySnapshots(resolvedPath);
    if (snapshots.length === 0) {
      throw createSnapshotMissingError(resolvedPath, ioError);
    }

    const scanLimit = normalizeRecoverySnapshotScanLimit(options.maxRecoverySnapshots);
    const candidateSnapshots = snapshots.slice(0, scanLimit);

    let lastSnapshotError = null;
    for (const snapshotPath of candidateSnapshots) {
      try {
        const recovered = await readMarkdownWithLimits(snapshotPath, {
          maxInputBytes: options.maxInputBytes,
          expectedSha256: options.snapshotExpectedSha256,
        });
        return {
          ...recovered,
          sourceKind: 'snapshot',
          recoveredFromSnapshot: true,
          sourcePath: resolvedPath,
          snapshotPath,
          recoveryAction: 'OPEN_SNAPSHOT',
          primaryError: {
            code: ioError.code,
            reason: ioError.reason,
            details: pickErrorDetails(ioError),
          },
        };
      } catch (snapshotError) {
        lastSnapshotError = toMarkdownIoError(snapshotError, 'E_IO_READ_FAIL', 'read_markdown_failed', {
          sourcePath: snapshotPath,
        });
      }
    }

    throw createSnapshotMismatchError(
      resolvedPath,
      candidateSnapshots,
      ioError,
      lastSnapshotError || createMarkdownIoError('E_IO_READ_FAIL', 'read_markdown_failed'),
    );
  }
}

export async function replayMarkdownRecovery(sourcePath, options = {}) {
  const recovered = await readMarkdownWithRecovery(sourcePath, options);
  const textHash = computeSha256Bytes(Buffer.from(recovered.text, 'utf8'));
  return {
    ok: 1,
    sourceKind: recovered.sourceKind,
    recoveryAction: recovered.recoveryAction,
    path: recovered.path,
    sourcePath: recovered.sourcePath || recovered.path,
    snapshotPath: recovered.snapshotPath || '',
    textHash,
  };
}

export async function readMarkdownWithTransactionRecovery(sourcePath, options = {}) {
  const resolvedPath = resolveSourcePath(sourcePath);
  const pendingIntent = await readTransactionIntent(resolvedPath);

  if (!pendingIntent) {
    return readMarkdownWithRecovery(resolvedPath, options);
  }

  if (!pendingIntent.corrupt && pendingIntent.state === 'WRITE_COMMITTED') {
    const committed = await readMarkdownWithRecovery(resolvedPath, options);
    const committedHash = computeSha256Bytes(Buffer.from(committed.text, 'utf8'));
    if (!pendingIntent.nextTextHash || committedHash === pendingIntent.nextTextHash) {
      await clearTransactionIntent(resolvedPath);
      return {
        ...committed,
        recoveredFromCommittedIntent: true,
      };
    }
  }

  let recovered = null;
  try {
    recovered = await readMarkdownWithRecovery(resolvedPath, options);
  } catch {}

  let recoveryPackPath = '';
  if (pendingIntent.recoveryPackPath) {
    const validation = await validateMarkdownRecoveryPack(pendingIntent.recoveryPackPath).catch(() => ({ ok: false }));
    if (validation.ok) {
      recoveryPackPath = pendingIntent.recoveryPackPath;
    }
  }

  if (!recoveryPackPath && recovered && typeof recovered.text === 'string') {
    const pack = await createMarkdownRecoveryPack(resolvedPath, {
      text: recovered.text,
      sourceKind: recovered.sourceKind,
      snapshotPath: recovered.snapshotPath || '',
      transaction: pendingIntent,
      now: options.now,
      safetyMode: options.safetyMode,
      recoveryAction: recovered.sourceKind === 'snapshot' ? 'OPEN_SNAPSHOT' : 'ABORT',
    });
    recoveryPackPath = pack.recoveryPackPath;
    if (!pendingIntent.corrupt) {
      await writeTransactionIntent(pendingIntent.intentPath, {
        ...pendingIntent,
        recoveryPackPath,
      }, {
        safetyMode: options.safetyMode,
      });
    }
  }

  throw createMarkdownIoError('E_IO_STATE_AMBIGUOUS_AFTER_CRASH', 'ambiguous_state_after_crash', {
    targetPath: resolvedPath,
    intentPath: pendingIntent.intentPath,
    transactionId: pendingIntent.transactionId || '',
    transactionState: pendingIntent.state || '',
    corruptIntent: pendingIntent.corrupt === true,
    snapshotPath: pendingIntent.snapshotPath || '',
    recoveryAction: recovered && recovered.sourceKind === 'snapshot' ? 'OPEN_SNAPSHOT' : 'ABORT',
    recoveryActions: recovered && recovered.sourceKind === 'snapshot' ? ['OPEN_SNAPSHOT', 'ABORT'] : ['ABORT'],
    recoveryPackPath,
  });
}

export {
  atomicWriteFile,
  appendReliabilityLog,
  buildReliabilityLogRecord,
  buildRecoveryPackContent,
  buildRecoveryPackGuide,
  buildRecoveryPackManifest,
  buildTransactionIntentPath,
  clearTransactionIntent,
  computeSha256Bytes,
  createRecoverySnapshot,
  createMarkdownIoError,
  inspectRegularNoFollow,
  listRecoverySnapshots,
  normalizeSafetyMode,
  readRegularNoFollow,
  readTransactionIntent,
  unlinkDurable,
};
