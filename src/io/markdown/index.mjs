import fs from 'node:fs/promises';
import { atomicWriteFile } from './atomicWriteFile.mjs';
import { createRecoverySnapshot } from './snapshotFile.mjs';
import { asMarkdownIoError, createMarkdownIoError } from './ioErrors.mjs';

function normalizeMarkdownInput(input) {
  if (typeof input === 'string') return input;
  throw createMarkdownIoError('E_IO_INVALID_CONTENT', 'invalid_markdown_content');
}

function normalizeLimit(value) {
  if (Number.isInteger(value) && value > 0) return value;
  return 1024 * 1024;
}

export async function writeMarkdownWithRecovery(targetPath, markdown, options = {}) {
  const text = normalizeMarkdownInput(markdown);
  const snapshot = await createRecoverySnapshot(targetPath, {
    maxSnapshots: options.maxSnapshots,
    now: options.now,
  });
  const writeResult = await atomicWriteFile(targetPath, text, {
    beforeRename: options.beforeRename,
  });

  return {
    outPath: writeResult.targetPath,
    bytesWritten: writeResult.bytesWritten,
    snapshotCreated: snapshot.snapshotCreated,
    snapshotPath: snapshot.snapshotPath,
    purgedSnapshots: snapshot.purgedSnapshots,
  };
}

export async function readMarkdownWithLimits(sourcePath, options = {}) {
  if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
    throw createMarkdownIoError('E_IO_INVALID_PATH', 'invalid_source_path');
  }
  const maxBytes = normalizeLimit(options.maxInputBytes);
  const resolvedPath = sourcePath.trim();

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

    return {
      text: buffer.toString('utf8'),
      byteLen: buffer.byteLength,
      path: resolvedPath,
    };
  } catch (error) {
    throw asMarkdownIoError(error, 'E_IO_READ_FAIL', 'read_markdown_failed', {
      sourcePath: resolvedPath,
    });
  }
}

export {
  atomicWriteFile,
  createRecoverySnapshot,
  createMarkdownIoError,
};
