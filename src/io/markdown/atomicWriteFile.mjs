import fs from 'node:fs/promises';
import path from 'node:path';
import { asMarkdownIoError, createMarkdownIoError } from './ioErrors.mjs';

function normalizeTargetPath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw createMarkdownIoError('E_IO_INVALID_PATH', 'invalid_target_path');
  }
  return path.resolve(filePath.trim());
}

function normalizeContent(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string') return Buffer.from(input, 'utf8');
  throw createMarkdownIoError('E_IO_INVALID_CONTENT', 'invalid_content_payload');
}

function normalizeSafetyMode(input) {
  return input === 'compat' ? 'compat' : 'strict';
}

export async function atomicWriteFile(targetPathRaw, contentRaw, options = {}) {
  const targetPath = normalizeTargetPath(targetPathRaw);
  const content = normalizeContent(contentRaw);
  const safetyMode = normalizeSafetyMode(options.safetyMode);
  const directory = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const suffix = `${process.pid}.${Date.now()}`;
  const tempPath = path.join(directory, `.${baseName}.tmp.${suffix}`);

  let handle = null;
  try {
    await fs.mkdir(directory, { recursive: true });
    handle = await fs.open(tempPath, 'w');
    await handle.writeFile(content);
    if (safetyMode === 'strict') {
      await handle.sync();
    }
    await handle.close();
    handle = null;

    if (typeof options.beforeRename === 'function') {
      await options.beforeRename({ targetPath, tempPath });
    }

    await fs.rename(tempPath, targetPath);
    return {
      ok: 1,
      targetPath,
      tempPath,
      bytesWritten: content.byteLength,
      safetyMode,
    };
  } catch (error) {
    throw asMarkdownIoError(error, 'E_IO_ATOMIC_WRITE_FAIL', 'atomic_write_failed', {
      targetPath,
      tempPath,
      safetyMode,
    });
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await fs.unlink(tempPath).catch(() => {});
  }
}
