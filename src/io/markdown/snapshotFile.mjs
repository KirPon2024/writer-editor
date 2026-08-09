import fs from 'node:fs/promises';
import path from 'node:path';
import { asMarkdownIoError, createMarkdownIoError } from './ioErrors.mjs';

function normalizeSnapshotPath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw createMarkdownIoError('E_IO_INVALID_PATH', 'invalid_snapshot_target_path');
  }
  return path.resolve(filePath.trim());
}

function normalizeMaxSnapshots(value) {
  if (Number.isInteger(value) && value >= 1 && value <= 20) return value;
  return 3;
}

function formatTimestamp(ms) {
  return String(ms).padStart(13, '0');
}

function buildSnapshotPrefix(targetPath) {
  const baseName = path.basename(targetPath);
  return `.${baseName}.bak.`;
}

function parseSnapshotStamp(entryName, snapshotPrefix) {
  if (typeof entryName !== 'string' || !entryName.startsWith(snapshotPrefix)) {
    return null;
  }
  const stamp = entryName.slice(snapshotPrefix.length);
  if (!/^\d{13}$/u.test(stamp)) {
    return null;
  }
  return Number(stamp);
}

export async function listRecoverySnapshots(targetPathRaw) {
  const targetPath = normalizeSnapshotPath(targetPathRaw);
  const directory = path.dirname(targetPath);
  const snapshotPrefix = buildSnapshotPrefix(targetPath);

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .map((entry) => {
        if (!entry.isFile()) return null;
        const stamp = parseSnapshotStamp(entry.name, snapshotPrefix);
        if (!Number.isFinite(stamp)) return null;
        return {
          stamp,
          fullPath: path.join(directory, entry.name),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.stamp - a.stamp)
      .map((entry) => entry.fullPath);
  } catch (error) {
    throw asMarkdownIoError(error, 'E_IO_SNAPSHOT_FAIL', 'snapshot_list_failed', {
      targetPath,
      directory,
    });
  }
}

// Fsync a file handle and swallow platform-incompatible errors so the snapshot
// path remains durable on POSIX while degrading cleanly on Windows.
async function fsyncFileHandle(filePath) {
  let handle = null;
  try {
    handle = await fs.open(filePath, 'r');
    await handle.sync();
    return true;
  } catch (error) {
    const unsupportedOnWindows = process.platform === 'win32'
      && ['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes(error?.code);
    if (!unsupportedOnWindows) throw error;
    return false;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function fsyncParentDirectory(directory) {
  let handle = null;
  try {
    handle = await fs.open(directory, 'r');
    await handle.sync();
    return true;
  } catch (error) {
    const unsupportedOnWindows = process.platform === 'win32'
      && ['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes(error?.code);
    if (!unsupportedOnWindows) throw error;
    return false;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

export async function createRecoverySnapshot(targetPathRaw, options = {}) {
  const targetPath = normalizeSnapshotPath(targetPathRaw);
  const maxSnapshots = normalizeMaxSnapshots(options.maxSnapshots);
  const nowFn = typeof options.now === 'function' ? options.now : Date.now;
  const afterSyncHook = typeof options.afterSync === 'function' ? options.afterSync : null;

  const directory = path.dirname(targetPath);
  const snapshotPrefix = buildSnapshotPrefix(targetPath);

  try {
    await fs.access(targetPath);
  } catch {
    return {
      ok: 1,
      snapshotCreated: false,
      snapshotPath: '',
      purgedSnapshots: [],
      maxSnapshots,
      synced: false,
    };
  }

  const stampValue = Number(nowFn());
  if (!Number.isFinite(stampValue) || stampValue < 0) {
    throw createMarkdownIoError('E_IO_SNAPSHOT_FAIL', 'snapshot_invalid_timestamp', {
      targetPath,
      timestamp: stampValue,
    });
  }
  const stamp = formatTimestamp(Math.trunc(stampValue));
  const snapshotPath = path.join(directory, `${snapshotPrefix}${stamp}`);

  try {
    await fs.copyFile(targetPath, snapshotPath);

    // Durable snapshot: fsync the copied snapshot file AND its parent directory
    // so the backup bytes survive a crash that follows the copy. Without this
    // fsync the snapshot is only in the page cache and recovery is not proven.
    let snapshotSynced = false;
    try {
      snapshotSynced = await fsyncFileHandle(snapshotPath);
      await fsyncParentDirectory(directory);
    } catch (error) {
      throw asMarkdownIoError(error, 'E_IO_SNAPSHOT_FAIL', 'snapshot_sync_failed', {
        targetPath,
        snapshotPath,
      });
    }
    if (snapshotSynced && afterSyncHook) {
      try {
        await afterSyncHook({ snapshotPath, directory });
      } catch {}
    }

    const matching = await listRecoverySnapshots(targetPath);

    const purgedSnapshots = [];
    if (matching.length > maxSnapshots) {
      for (const stale of matching.slice(maxSnapshots)) {
        await fs.unlink(stale).catch(() => {});
        purgedSnapshots.push(stale);
      }
    }

    return {
      ok: 1,
      snapshotCreated: true,
      snapshotPath,
      purgedSnapshots,
      maxSnapshots,
      synced: snapshotSynced,
    };
  } catch (error) {
    throw asMarkdownIoError(error, 'E_IO_SNAPSHOT_FAIL', 'snapshot_failed', {
      targetPath,
      snapshotPath,
      maxSnapshots,
    });
  }
}
