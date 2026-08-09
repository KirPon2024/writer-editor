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

// Resolve the requested file mode for an exclusive durable write. The canonical
// mode is 0o600 (owner read/write only). Any caller-provided mode must be a safe
// integer in the POSIX octal range; otherwise the canonical 0o600 is used.
function normalizeExclusiveMode(value) {
  if (Number.isSafeInteger(value) && value >= 0 && value <= 0o777) return value;
  return 0o600;
}

// Durable primitives for the exact-text transaction apply path. These mirror the
// fsync + parent-sync + exclusive-open patterns proven by the stage-10 main
// persistence adapter, but are bounded to the markdown IO module so the exact
// apply contour reuses one durable primitive set instead of inventing its own.

async function syncParentDirectory(directory, options = {}) {
  let directoryHandle = null;
  try {
    directoryHandle = await fs.open(directory, 'r');
    await directoryHandle.sync();
    if (typeof options.afterDirectorySync === 'function') {
      await options.afterDirectorySync({ directory });
    }
  } catch (error) {
    const unsupportedOnWindows = process.platform === 'win32'
      && ['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes(error?.code);
    if (!unsupportedOnWindows) throw error;
  } finally {
    if (directoryHandle) await directoryHandle.close().catch(() => {});
  }
}

// writeExclusiveDurable: open the target with O_WRONLY|O_CREAT|O_EXCL and the
// requested mode (0600 by default), write the full payload, fsync the file, then
// fsync the parent directory, and finally perform an EXACT readback verify. A
// success:false result is never returned for a write that did not durably land:
// any readback mismatch or fsync failure surfaces as a typed error instead.
export async function writeExclusiveDurable(targetPathRaw, contentRaw, options = {}) {
  const targetPath = normalizeTargetPath(targetPathRaw);
  const content = normalizeContent(contentRaw);
  const mode = normalizeExclusiveMode(options.mode);
  const directory = path.dirname(targetPath);
  let handle = null;
  await fs.mkdir(directory, { recursive: true });
  try {
    try {
      handle = await fs.open(targetPath, 'wx', mode);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        // An existing target is an exclusive-create conflict. We never overwrite
        // an existing file through this primitive; callers reconcile explicitly.
        throw asMarkdownIoError(error, 'E_IO_EXCLUSIVE_WRITE_EXISTS', 'exclusive_write_exists', {
          targetPath,
          mode,
        });
      }
      throw error;
    }
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    // Parent directory sync so the new dirent is durable alongside the data.
    await syncParentDirectory(directory);
    // EXACT readback verify: a write that lands with different bytes is never a
    // success. This is the bounded readback oracle for the durable apply path.
    const readBack = await fs.readFile(targetPath);
    if (readBack.byteLength !== content.byteLength || !readBack.equals(content)) {
      throw createMarkdownIoError('E_IO_EXCLUSIVE_WRITE_READBACK_MISMATCH', 'exclusive_write_readback_mismatch', {
        targetPath,
        expectedBytes: content.byteLength,
        observedBytes: readBack.byteLength,
      });
    }
    return {
      ok: 1,
      targetPath,
      bytesWritten: content.byteLength,
      mode,
      synced: true,
      readbackVerified: true,
    };
  } catch (error) {
    throw asMarkdownIoError(error, 'E_IO_EXCLUSIVE_WRITE_FAIL', 'exclusive_write_failed', {
      targetPath,
      mode,
    });
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

// linkExclusiveDurable: create an exclusive hard link from sourcePath to
// targetPath, then fsync the link and its parent directory so the backup dirent
// is durable. An EEXIST conflict surfaces as a typed error (callers reconcile).
export async function linkExclusiveDurable(sourcePathRaw, targetPathRaw, options = {}) {
  const sourcePath = normalizeTargetPath(sourcePathRaw);
  const targetPath = normalizeTargetPath(targetPathRaw);
  try {
    await fs.link(sourcePath, targetPath);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw asMarkdownIoError(error, 'E_IO_EXCLUSIVE_LINK_EXISTS', 'exclusive_link_exists', {
        sourcePath,
        targetPath,
      });
    }
    throw error;
  }
  // fsync the newly created hard link and its parent directory.
  let linkHandle = null;
  try {
    linkHandle = await fs.open(targetPath, 'r');
    await linkHandle.sync();
  } catch (error) {
    const unsupportedOnWindows = process.platform === 'win32'
      && ['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes(error?.code);
    if (!unsupportedOnWindows) throw error;
  } finally {
    if (linkHandle) await linkHandle.close().catch(() => {});
  }
  await syncParentDirectory(path.dirname(targetPath));
  return {
    ok: 1,
    sourcePath,
    targetPath,
    synced: true,
  };
}

// unlinkDurable: unlink a path and then fsync the parent directory so the
// deletion is durable (not just the inode free). Missing files are a no-op.
export async function unlinkDurable(targetPathRaw, options = {}) {
  const targetPath = normalizeTargetPath(targetPathRaw);
  const directory = path.dirname(targetPath);
  await fs.unlink(targetPath).catch((error) => {
    if (error && error.code !== 'ENOENT') throw error;
  });
  await syncParentDirectory(directory, options);
  return { ok: 1, targetPath, directory, synced: true };
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
    if (typeof options.afterTempWrite === 'function') {
      await options.afterTempWrite({ targetPath, tempPath, bytesWritten: content.byteLength });
    }
    if (safetyMode === 'strict') {
      await handle.sync();
    }
    await handle.close();
    handle = null;

    if (typeof options.beforeRename === 'function') {
      await options.beforeRename({ targetPath, tempPath });
    }

    await fs.rename(tempPath, targetPath);
    if (safetyMode === 'strict') {
      await syncParentDirectory(directory, options);
    }
    if (typeof options.afterRename === 'function') {
      await options.afterRename({ targetPath, tempPath, bytesWritten: content.byteLength });
    }
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

// Attach the durable primitives to the atomicWriteFile function so callers that
// resolve `atomicWriteFile` as the named export can also reach
// `writeExclusiveDurable` / `linkExclusiveDurable` / `unlinkDurable` through the
// same handle. These are the same functions exported as module-level named
// exports above; this keeps one canonical implementation.
atomicWriteFile.writeExclusiveDurable = writeExclusiveDurable;
atomicWriteFile.linkExclusiveDurable = linkExclusiveDurable;
atomicWriteFile.unlinkDurable = unlinkDurable;
