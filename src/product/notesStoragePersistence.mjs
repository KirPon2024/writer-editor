import fs from 'node:fs/promises';
import path from 'node:path';

import { sha256Hex } from '../core/browser-safe-hash.mjs';
import {
  NOTES_RECOVERY_DIRNAME,
  NOTES_STORAGE_FILENAME,
  buildEmptyNotesDocument,
  computeNotesHash,
  normalizeNotesDocument,
} from '../core/notesStorage.mjs';

export * from '../core/notesStorage.mjs';

export function getNotesStoragePath(projectRoot) {
  if (typeof projectRoot !== 'string' || !projectRoot.trim()) {
    throw new Error('NOTES_PROJECT_ROOT_REQUIRED');
  }
  return path.join(projectRoot, NOTES_STORAGE_FILENAME);
}

function safeBasename(filePath) {
  return path.basename(String(filePath || 'notes'));
}

export async function createNotesRecoverySnapshot({
  projectRoot,
  notesPath,
  sourceText,
  now = () => new Date().toISOString(),
} = {}) {
  const text = typeof sourceText === 'string' ? sourceText : '';
  const recoveryRoot = path.join(projectRoot, 'backups', NOTES_RECOVERY_DIRNAME);
  const timestamp = String(now()).replace(/[^0-9A-Za-z._-]/gu, '-');
  const snapshotName = `${safeBasename(notesPath)}.${timestamp}.recovery.json`;
  const snapshotPath = path.join(recoveryRoot, snapshotName);
  await fs.mkdir(recoveryRoot, { recursive: true });
  await fs.writeFile(snapshotPath, text, 'utf8');
  const recoveredText = await fs.readFile(snapshotPath, 'utf8');
  return {
    snapshotCreated: true,
    snapshotReadable: recoveredText === text,
    snapshotHashMatchesInput: sha256Hex(recoveredText) === sha256Hex(text),
    sourceHash: sha256Hex(text),
    recoveryAction: 'OPEN_SNAPSHOT_OR_ABORT',
  };
}

export async function readNotesStorage({ projectRoot, projectId, readFile = fs.readFile, now } = {}) {
  const notesPath = getNotesStoragePath(projectRoot);
  try {
    const raw = await readFile(notesPath, 'utf8');
    const parsed = JSON.parse(raw);
    const normalized = normalizeNotesDocument(parsed, { projectId, now });
    return {
      ok: true,
      state: normalized.changed ? 'needs_migration' : 'ready',
      notesPath,
      document: normalized.value,
      hash: normalized.hash,
      sourceText: raw,
      sourceExists: true,
      parseError: null,
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const empty = buildEmptyNotesDocument(projectId, { now });
      return {
        ok: true,
        state: 'missing',
        notesPath,
        document: empty,
        hash: computeNotesHash(empty),
        sourceText: '',
        sourceExists: false,
        parseError: null,
      };
    }
    return {
      ok: false,
      state: 'corrupt',
      notesPath,
      document: null,
      hash: '',
      sourceText: '',
      sourceExists: true,
      parseError: error && typeof error.message === 'string' ? error.message : 'NOTES_READ_FAILED',
    };
  }
}

export async function migrateNotesStorage({
  projectRoot,
  projectId,
  readFile = fs.readFile,
  writeFileAtomic,
  now,
} = {}) {
  if (typeof writeFileAtomic !== 'function') {
    throw new Error('NOTES_ATOMIC_WRITER_REQUIRED');
  }
  const current = await readNotesStorage({ projectRoot, projectId, readFile, now });
  if (current.ok && current.state === 'ready') {
    return {
      ok: true,
      migrated: false,
      state: 'ready',
      receipt: {
        schemaVersion: 'notes-storage-migration-receipt.v1',
        migrated: false,
        noteCount: current.document.notes.length,
        hash: current.hash,
        recovery: null,
      },
      document: current.document,
    };
  }
  const notesPath = getNotesStoragePath(projectRoot);
  let sourceText = current.sourceText || '';
  if (!current.ok && current.sourceExists) {
    try {
      sourceText = await readFile(notesPath, 'utf8');
    } catch {}
  }
  const recovery = sourceText
    ? await createNotesRecoverySnapshot({ projectRoot, notesPath, sourceText, now })
    : null;
  const document = current.ok ? current.document : buildEmptyNotesDocument(projectId, { now });
  const content = `${JSON.stringify(document, null, 2)}\n`;
  const writeResult = await writeFileAtomic(notesPath, content);
  if (!writeResult || writeResult.success !== true) {
    return {
      ok: false,
      code: 'E_NOTES_STORAGE_WRITE_FAILED',
      reason: 'NOTES_STORAGE_WRITE_FAILED',
      recovery,
    };
  }
  return {
    ok: true,
    migrated: true,
    state: current.state,
    receipt: {
      schemaVersion: 'notes-storage-migration-receipt.v1',
      migrated: true,
      noteCount: document.notes.length,
      hash: computeNotesHash(document),
      recovery,
    },
    document,
  };
}
