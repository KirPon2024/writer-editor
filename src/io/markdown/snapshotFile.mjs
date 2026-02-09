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

export async function createRecoverySnapshot(targetPathRaw, options = {}) {
  const targetPath = normalizeSnapshotPath(targetPathRaw);
  const maxSnapshots = normalizeMaxSnapshots(options.maxSnapshots);
  const nowFn = typeof options.now === 'function' ? options.now : Date.now;

  const directory = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const snapshotPrefix = `.${baseName}.bak.`;

  try {
    await fs.access(targetPath);
  } catch {
    return {
      ok: 1,
      snapshotCreated: false,
      snapshotPath: '',
      purgedSnapshots: [],
      maxSnapshots,
    };
  }

  const stamp = formatTimestamp(Number(nowFn()));
  const snapshotPath = path.join(directory, `${snapshotPrefix}${stamp}`);

  try {
    await fs.copyFile(targetPath, snapshotPath);

    const entries = await fs.readdir(directory, { withFileTypes: true });
    const matching = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(snapshotPrefix))
      .map((entry) => path.join(directory, entry.name))
      .sort((a, b) => b.localeCompare(a));

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
    };
  } catch (error) {
    throw asMarkdownIoError(error, 'E_IO_SNAPSHOT_FAIL', 'snapshot_failed', {
      targetPath,
      snapshotPath,
      maxSnapshots,
    });
  }
}
