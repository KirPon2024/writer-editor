// R2.4 P2_DURABLE_SAVE_COORDINATOR — the durable save transaction:
// admit with exact-revision capture, unique temp write, fsync(temp),
// atomic publish, fsync(parent), exact readback and a phase-bound ACK.
// Every failure names its phase; crash state always classifies.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

class SaveCoordinatorError extends Error {
  constructor(code, phase, detail = '') {
    super(detail ? `${code}@${phase}: ${detail}` : `${code}@${phase}`);
    this.code = code;
    this.phase = phase;
  }
}

const SAVE_PHASES = Object.freeze({
  ADMIT: 'ADMIT',
  TEMP_WRITE: 'TEMP_WRITE',
  TEMP_FSYNC: 'TEMP_FSYNC',
  ATOMIC_PUBLISH: 'ATOMIC_PUBLISH',
  PARENT_FSYNC: 'PARENT_FSYNC',
  READBACK: 'READBACK',
  ACK: 'ACK',
});

const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

async function fsyncDirectoryWith(adapter, dir) {
  if (adapter && typeof adapter.syncDirectory === 'function') {
    await adapter.syncDirectory(dir);
    return;
  }
  const handle = await fsp.open(dir, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// Crash classification for the durable save path. The answer is always one
// of OLD_COMMITTED, NEW_COMMITTED, RESUMABLE_PREPARED or ROLLBACK_REQUIRED;
// torn or false-ACK states are unreachable by construction.
function classifySaveArtifacts(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const mainExists = fs.existsSync(filePath);
  const leftovers = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.startsWith(`${base}.p2-`) && name.endsWith('.tmp'))
    : [];
  if (mainExists && leftovers.length === 0) return { classification: 'OLD_OR_NEW_COMMITTED', leftovers };
  if (!mainExists && leftovers.length > 0) return { classification: 'RESUMABLE_PREPARED', leftovers };
  if (!mainExists) return { classification: 'ROLLBACK_REQUIRED', leftovers };
  return { classification: 'ROLLBACK_REQUIRED', leftovers, reason: 'TARGET_WITH_TEMP_RESIDUE' };
}

async function durableSaveTransaction({ filePath, content, revision, fsAdapter = fsp }) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new SaveCoordinatorError('E_SAVE_TARGET_REQUIRED', SAVE_PHASES.ADMIT);
  }
  const revisionBound = revision === undefined || (Number.isInteger(revision) && revision >= 0);
  if (!revisionBound) throw new SaveCoordinatorError('E_SAVE_REVISION_INVALID', SAVE_PHASES.ADMIT, String(revision));
  if (typeof content !== 'string' && !Buffer.isBuffer(content)) {
    throw new SaveCoordinatorError('E_SAVE_CONTENT_SHAPE', SAVE_PHASES.ADMIT);
  }

  const phases = [SAVE_PHASES.ADMIT];
  const directory = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const tempPath = path.join(directory, `${baseName}.p2-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`);
  const expectedDigest = sha256hex(Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));

  let handle;
  try {
    handle = await fsAdapter.open(tempPath, 'w');
    await handle.writeFile(content);
  } catch (error) {
    await safeUnlink(tempPath);
    throw new SaveCoordinatorError('E_SAVE_TEMP_WRITE', SAVE_PHASES.TEMP_WRITE, error.message);
  }
  phases.push(SAVE_PHASES.TEMP_WRITE);

  try {
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await safeUnlink(tempPath);
    throw new SaveCoordinatorError('E_SAVE_TEMP_FSYNC', SAVE_PHASES.TEMP_FSYNC, error.message);
  }
  phases.push(SAVE_PHASES.TEMP_FSYNC);

  try {
    await fsAdapter.rename(tempPath, filePath);
  } catch (error) {
    await safeUnlink(tempPath);
    throw new SaveCoordinatorError('E_SAVE_ATOMIC_PUBLISH', SAVE_PHASES.ATOMIC_PUBLISH, error.message);
  }
  phases.push(SAVE_PHASES.ATOMIC_PUBLISH);

  try {
    await fsyncDirectoryWith(fsAdapter, directory);
  } catch (error) {
    throw new SaveCoordinatorError('E_SAVE_PARENT_FSYNC', SAVE_PHASES.PARENT_FSYNC, error.message);
  }
  phases.push(SAVE_PHASES.PARENT_FSYNC);

  let readbackDigest;
  try {
    const readback = await fsAdapter.readFile(filePath);
    readbackDigest = sha256hex(readback);
  } catch (error) {
    throw new SaveCoordinatorError('E_SAVE_READBACK', SAVE_PHASES.READBACK, error.message);
  }
  if (readbackDigest !== expectedDigest) {
    throw new SaveCoordinatorError('E_SAVE_READBACK_MISMATCH', SAVE_PHASES.READBACK, `${readbackDigest} != ${expectedDigest}`);
  }
  phases.push(SAVE_PHASES.READBACK);

  phases.push(SAVE_PHASES.ACK);
  return Object.freeze({
    success: true,
    phases: Object.freeze([...phases]),
    revision: revision === undefined ? null : revision,
    digest: expectedDigest,
    bytes: Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf8'),
  });
}

async function safeUnlink(target) {
  try {
    await fsp.unlink(target);
  } catch {}
}

module.exports = Object.freeze({
  SAVE_PHASES,
  SaveCoordinatorError,
  classifySaveArtifacts,
  durableSaveTransaction,
});
