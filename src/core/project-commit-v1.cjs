// R2.4 P3_TRANSACTIONAL_PROJECT_COMMIT — transactional text+manifest commit.
// Scene and manifest publish as one phase-bound transaction with a marker
// commit point; a crash before the marker reconciles deterministically and a
// partial publication can never be ACKed. Fence revisions are monotonic.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const { durableSaveTransaction } = require('./save-coordinator-v1.cjs');

class ProjectCommitError extends Error {
  constructor(code, phase, detail = '') {
    super(detail ? `${code}@${phase}: ${detail}` : `${code}@${phase}`);
    this.code = code;
    this.phase = phase;
  }
}

const COMMIT_PHASES = Object.freeze({
  ADMIT: 'ADMIT',
  PREPARE: 'PREPARE',
  MANIFEST_PERSIST: 'MANIFEST_PERSIST',
  SCENE_PUBLISH: 'SCENE_PUBLISH',
  MARKER: 'MARKER',
  ACK: 'ACK',
});

const MARKER_SCHEMA_VERSION = 'yalken.project-commit.marker.v1';
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

const markerPathFor = (scenePath) => `${scenePath}.commit.json`;

function readMarkerSync(markerPath) {
  if (!fs.existsSync(markerPath)) return null;
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    return marker && marker.schemaVersion === MARKER_SCHEMA_VERSION ? marker : null;
  } catch {
    return null;
  }
}

// Recovery classification. The marker is the commit point: absent marker with
// a prepared scene temp is resumable; present marker with digest agreement is
// committed; present marker with any disagreement is typed corruption.
function classifyProjectCommitState(scenePath) {
  const markerPath = markerPathFor(scenePath);
  const marker = readMarkerSync(markerPath);
  const sceneExists = fs.existsSync(scenePath);
  const tempResidue = fs.existsSync(path.dirname(scenePath))
    ? fs.readdirSync(path.dirname(scenePath)).filter((name) => name.startsWith(`${path.basename(scenePath)}.p3-`) && name.endsWith('.tmp'))
    : [];
  if (marker) {
    if (!sceneExists) return { classification: 'PARTIAL_CORRUPTION_DETECTED', marker, reason: 'SCENE_MISSING_WITH_MARKER' };
    const sceneDigest = sha256hex(fs.readFileSync(scenePath));
    if (sceneDigest !== marker.sceneDigest) return { classification: 'PARTIAL_CORRUPTION_DETECTED', marker, reason: 'SCENE_DIGEST_MISMATCH' };
    return { classification: 'NEW_COMMITTED', marker };
  }
  if (tempResidue.length > 0) return { classification: 'RESUMABLE_PREPARED', tempResidue };
  return { classification: sceneExists ? 'OLD_COMMITTED' : 'ROLLBACK_REQUIRED' };
}

async function commitProjectTextAndManifest({
  scenePath,
  sceneContent,
  revision,
  persistManifest,
  rollbackManifest,
  fsAdapter = fsp,
}) {
  if (typeof scenePath !== 'string' || scenePath.length === 0) {
    throw new ProjectCommitError('E_COMMIT_TARGET_REQUIRED', COMMIT_PHASES.ADMIT);
  }
  if (!Number.isInteger(revision) || revision < 0) {
    throw new ProjectCommitError('E_COMMIT_REVISION_INVALID', COMMIT_PHASES.ADMIT, String(revision));
  }
  if (typeof sceneContent !== 'string') throw new ProjectCommitError('E_COMMIT_CONTENT_SHAPE', COMMIT_PHASES.ADMIT);
  if (typeof persistManifest !== 'function') throw new ProjectCommitError('E_COMMIT_MANIFEST_FN_REQUIRED', COMMIT_PHASES.ADMIT);

  const markerPath = markerPathFor(scenePath);
  const priorMarker = readMarkerSync(markerPath);
  if (priorMarker && Number.isInteger(priorMarker.revision) && priorMarker.revision >= revision) {
    throw new ProjectCommitError('E_COMMIT_FENCE_REGRESSION', COMMIT_PHASES.ADMIT, `marker=${priorMarker.revision} presented=${revision}`);
  }

  const sceneDigest = sha256hex(sceneContent);
  const tempPath = path.join(
    path.dirname(scenePath),
    `${path.basename(scenePath)}.p3-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`,
  );

  // PREPARE: scene temp written, fsynced and readback-proven before anything
  // else moves.
  let handle;
  try {
    handle = await fsAdapter.open(tempPath, 'w');
    await handle.writeFile(sceneContent);
    await handle.sync();
    await handle.close();
    handle = null;
    const prepared = await fsAdapter.readFile(tempPath);
    if (sha256hex(prepared) !== sceneDigest) {
      throw new ProjectCommitError('E_COMMIT_PREPARE_MISMATCH', COMMIT_PHASES.PREPARE);
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await safeUnlink(tempPath);
    if (error instanceof ProjectCommitError) throw error;
    throw new ProjectCommitError('E_COMMIT_PREPARE', COMMIT_PHASES.PREPARE, error.message);
  }

  // MANIFEST_PERSIST: the manifest commits first through the caller's own
  // authority. Any later failure rolls the manifest back when a rollback is
  // provided, and the marker is never written — no partial ACK.
  let manifestOutcome;
  try {
    manifestOutcome = await persistManifest();
  } catch (error) {
    await safeUnlink(tempPath);
    throw new ProjectCommitError('E_COMMIT_MANIFEST_PERSIST', COMMIT_PHASES.MANIFEST_PERSIST, error.message);
  }
  const manifestPersisted = Boolean(manifestOutcome && manifestOutcome.persisted === true);

  // SCENE_PUBLISH: atomic rename + parent fsync + exact readback.
  try {
    await fsAdapter.rename(tempPath, scenePath);
    await fsyncDirectory(path.dirname(scenePath));
    const readback = await fsAdapter.readFile(scenePath);
    if (sha256hex(readback) !== sceneDigest) {
      throw new ProjectCommitError('E_COMMIT_SCENE_MISMATCH', COMMIT_PHASES.SCENE_PUBLISH);
    }
  } catch (error) {
    let rolledBack = false;
    if (manifestPersisted && typeof rollbackManifest === 'function') {
      try {
        await rollbackManifest();
        rolledBack = true;
      } catch {
        rolledBack = false;
      }
    }
    await safeUnlink(tempPath);
    const code = error instanceof ProjectCommitError ? error.code : 'E_COMMIT_SCENE_PUBLISH';
    const typed = new ProjectCommitError(code, COMMIT_PHASES.SCENE_PUBLISH, error.message);
    typed.rolledBack = rolledBack;
    throw typed;
  }

  // MARKER: the commit point, written through the durable coordinator.
  const marker = {
    schemaVersion: MARKER_SCHEMA_VERSION,
    revision,
    sceneDigest,
    manifestPersisted,
  };
  try {
    await durableSaveTransaction({ filePath: markerPath, content: `${JSON.stringify(marker, null, 2)}\n`, revision, fsAdapter });
  } catch (error) {
    throw new ProjectCommitError('E_COMMIT_MARKER', COMMIT_PHASES.MARKER, error.message);
  }

  return Object.freeze({
    success: true,
    phases: Object.freeze([
      COMMIT_PHASES.ADMIT,
      COMMIT_PHASES.PREPARE,
      COMMIT_PHASES.MANIFEST_PERSIST,
      COMMIT_PHASES.SCENE_PUBLISH,
      COMMIT_PHASES.MARKER,
      COMMIT_PHASES.ACK,
    ]),
    revision,
    sceneDigest,
    manifestPersisted,
    priorMarkerRevision: priorMarker && Number.isInteger(priorMarker.revision) ? priorMarker.revision : null,
  });
}

async function fsyncDirectory(dir) {
  const handle = await fsp.open(dir, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function safeUnlink(target) {
  try {
    await fsp.unlink(target);
  } catch {}
}

module.exports = Object.freeze({
  COMMIT_PHASES,
  MARKER_SCHEMA_VERSION,
  ProjectCommitError,
  classifyProjectCommitState,
  commitProjectTextAndManifest,
  markerPathFor,
});
