import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { atomicWriteFile } from './atomicWriteFile.mjs';
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
  const maxBytes = normalizeLimit(options.maxInputBytes);
  const expectedSha256 = normalizeExpectedSha256(options.expectedSha256);
  const resolvedPath = resolveSourcePath(sourcePath);

  try {
    const stat = await fs.stat(resolvedPath);
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

function createSnapshotMismatchError(sourcePath, snapshotPath, primaryError, snapshotError) {
  return createMarkdownIoError('E_IO_SNAPSHOT_MISMATCH', 'snapshot_mismatch', {
    sourcePath,
    snapshotPath,
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

    const snapshotPath = snapshots[0];
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
      const normalizedSnapshotError = toMarkdownIoError(snapshotError, 'E_IO_READ_FAIL', 'read_markdown_failed', {
        sourcePath: snapshotPath,
      });
      throw createSnapshotMismatchError(resolvedPath, snapshotPath, ioError, normalizedSnapshotError);
    }
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

export {
  atomicWriteFile,
  appendReliabilityLog,
  buildReliabilityLogRecord,
  computeSha256Bytes,
  createRecoverySnapshot,
  createMarkdownIoError,
  listRecoverySnapshots,
  normalizeSafetyMode,
};
