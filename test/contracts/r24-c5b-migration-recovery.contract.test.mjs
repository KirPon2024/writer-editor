import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  RECOVERY_CAPABILITY_ID,
  RECOVERY_DIRNAME,
  RECOVERY_MANIFEST_BASENAME,
  MigrationHistoryError,
  migrateProjectFile,
  restoreCheckpoint,
} = require('../../src/core/migration-history-backup-gc-v1.cjs');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-c5b-')));
const projectPath = (root) => path.join(root, 'project.json');
const storePath = (root) => path.join(root, '.r6');

function writeProject(root, version = 'v1', title = 'Before') {
  fs.writeFileSync(projectPath(root), `${JSON.stringify({ schemaVersion: version, projectId: 'c5b-project', title }, null, 2)}\n`);
}

function migrations() {
  return [{
    id: 'v1-to-v2',
    fromVersion: 'v1',
    toVersion: 'v2',
    apply: (project) => ({ ...project, schemaVersion: 'v2', title: 'Intended' }),
  }];
}

function postPublishFsyncFailureAdapter() {
  return {
    ...fsp,
    async syncDirectory() {
      const error = new Error('synthetic parent fsync failure after rename');
      error.code = 'E_SYNTHETIC_PARENT_FSYNC';
      throw error;
    },
  };
}

function historyWriteFailureAdapter() {
  return {
    ...fsp,
    async open(filePath, flags) {
      if (path.basename(filePath).startsWith('migration-history.v1.jsonl.p2-')) {
        const error = new Error('synthetic history ACK failure');
        error.code = 'E_SYNTHETIC_HISTORY_ACK';
        throw error;
      }
      return fsp.open(filePath, flags);
    },
  };
}

function secondProjectWriteFailureAdapter() {
  let projectTempOpenCount = 0;
  return {
    ...fsp,
    async open(filePath, flags) {
      if (path.basename(filePath).startsWith('project.json.p2-')) {
        projectTempOpenCount += 1;
        if (projectTempOpenCount === 2) {
          const error = new Error('synthetic rollback temp write failure');
          error.code = 'E_SYNTHETIC_ROLLBACK_WRITE';
          throw error;
        }
      }
      return fsp.open(filePath, flags);
    },
  };
}

function assertPublicEvidencePathless(error, root) {
  assert.ok(error instanceof MigrationHistoryError);
  assert.ok(error.publicEvidence);
  assert.equal(error.message.includes(root), false);
  assert.equal(error.message.includes('/'), false);
  assert.equal(error.message.includes('\\'), false);
  const encoded = JSON.stringify(error.publicEvidence);
  assert.equal(encoded.includes(root), false);
  assert.equal(encoded.includes('/'), false);
  assert.equal(encoded.includes('\\'), false);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(/path|basename|directory|filename/i.test(key), false, `public path field forbidden: ${key}`);
      visit(child);
    }
  };
  visit(error.publicEvidence);
}

function assertRecoveryPacket(root, error, expectedRoles) {
  assert.equal(error.publicEvidence.capabilityId, RECOVERY_CAPABILITY_ID);
  assert.equal(error.publicEvidence.recoveryAvailable, true);
  assert.equal(error.publicEvidence.blockedState, 'BLOCKED_MANUAL_RECOVERY_REQUIRED');
  assert.deepEqual(error.publicEvidence.versionRoles, expectedRoles);
  assert.match(error.publicEvidence.recoveryId, /^r6-recovery-[1-9][0-9]*-[0-9a-f]{12}$/u);
  assert.match(error.publicEvidence.manifestDigest, /^[0-9a-f]{64}$/u);

  const recoveryRoot = path.join(storePath(root), RECOVERY_DIRNAME);
  const packetNames = fs.readdirSync(recoveryRoot);
  assert.deepEqual(packetNames, [error.publicEvidence.recoveryId]);
  const packetRoot = path.join(recoveryRoot, error.publicEvidence.recoveryId);
  const manifestBytes = fs.readFileSync(path.join(packetRoot, RECOVERY_MANIFEST_BASENAME));
  assert.equal(sha256(manifestBytes), error.publicEvidence.manifestDigest);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.schemaVersion, 'YALKEN_R24_C5B_LOCAL_RECOVERY_MANIFEST_V1');
  assert.equal(manifest.status, 'LOCAL_RECOVERY_READY');
  assert.equal(manifest.capabilityId, RECOVERY_CAPABILITY_ID);
  assert.equal(manifest.fallbackStoreUsed, false);
  assert.equal(manifest.repairAuthorityRequired, true);
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.role), expectedRoles);
  for (const artifact of manifest.artifacts) {
    assert.equal(path.basename(artifact.basename), artifact.basename);
    const bytes = fs.readFileSync(path.join(packetRoot, artifact.basename));
    assert.equal(bytes.length, artifact.sizeBytes);
    assert.equal(sha256(bytes), artifact.sha256);
  }
  return manifest;
}

test('C5B migration post-rename failure returns a pathless blocked state backed by verified local bytes', async () => {
  const root = sandbox();
  writeProject(root);
  const before = fs.readFileSync(projectPath(root));
  let failure;
  try {
    await migrateProjectFile({
      projectPath: projectPath(root),
      storeDir: storePath(root),
      targetVersion: 'v2',
      migrations: migrations(),
      fsAdapter: postPublishFsyncFailureAdapter(),
      now: '2026-08-28T05:40:00.000Z',
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.code, 'E_R6_PROJECT_PUBLISH_BLOCKED_RECOVERY_REQUIRED');
  assert.equal(failure.blockedState, 'BLOCKED_MANUAL_RECOVERY_REQUIRED');
  assertPublicEvidencePathless(failure, root);
  const manifest = assertRecoveryPacket(root, failure, ['BEFORE', 'INTENDED', 'OBSERVED']);
  assert.equal(manifest.operationKind, 'MIGRATION_PUBLISH');
  assert.equal(manifest.causeCode, 'E_SAVE_PARENT_FSYNC');
  assert.equal(manifest.observedTargetState, 'INTENDED_BYTES_OBSERVED');
  assert.deepEqual(fs.readFileSync(path.join(storePath(root), RECOVERY_DIRNAME, failure.recovery.recoveryId, 'before.bytes')), before);
  assert.equal(JSON.parse(fs.readFileSync(projectPath(root), 'utf8')).schemaVersion, 'v2');
});

test('C5B restore post-rename failure preserves pre-restore, intended and observed roles without a returned path', async () => {
  const root = sandbox();
  writeProject(root);
  const migration = await migrateProjectFile({
    projectPath: projectPath(root),
    storeDir: storePath(root),
    targetVersion: 'v2',
    migrations: migrations(),
  });
  const beforeRestore = fs.readFileSync(projectPath(root));
  let failure;
  try {
    await restoreCheckpoint({
      projectPath: projectPath(root),
      storeDir: storePath(root),
      checkpointId: migration.checkpoint.checkpointId,
      fsAdapter: postPublishFsyncFailureAdapter(),
      now: '2026-08-28T05:41:00.000Z',
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.code, 'E_R6_PROJECT_PUBLISH_BLOCKED_RECOVERY_REQUIRED');
  assertPublicEvidencePathless(failure, root);
  const manifest = assertRecoveryPacket(root, failure, ['BEFORE', 'INTENDED', 'OBSERVED']);
  assert.equal(manifest.operationKind, 'RESTORE_PUBLISH');
  const packetRoot = path.join(storePath(root), RECOVERY_DIRNAME, failure.recovery.recoveryId);
  assert.deepEqual(fs.readFileSync(path.join(packetRoot, 'before.bytes')), beforeRestore);
  assert.equal(JSON.parse(fs.readFileSync(projectPath(root), 'utf8')).schemaVersion, 'v1');
});

test('C5B history ACK plus rollback failure is typed blocked only after a durable pathless recovery manifest exists', async () => {
  const root = sandbox();
  writeProject(root);
  let failure;
  try {
    await migrateProjectFile({
      projectPath: projectPath(root),
      storeDir: storePath(root),
      targetVersion: 'v2',
      migrations: migrations(),
      fsAdapter: secondProjectWriteFailureAdapter(),
      historyFsAdapter: historyWriteFailureAdapter(),
      now: '2026-08-28T05:42:00.000Z',
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.code, 'E_R6_HISTORY_ACK_FAILED_RECOVERY_BLOCKED');
  assertPublicEvidencePathless(failure, root);
  const manifest = assertRecoveryPacket(root, failure, ['BEFORE', 'INTENDED', 'OBSERVED']);
  assert.equal(manifest.operationKind, 'MIGRATION_HISTORY_ACK_ROLLBACK');
  assert.equal(JSON.parse(fs.readFileSync(projectPath(root), 'utf8')).schemaVersion, 'v2');
});

test('C5B never falls back when the exact recovery root is unsafe', async () => {
  const root = sandbox();
  writeProject(root);
  fs.mkdirSync(storePath(root), { recursive: true });
  const outside = path.join(root, 'old-recovery-directory');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(storePath(root), RECOVERY_DIRNAME));
  let failure;
  try {
    await migrateProjectFile({
      projectPath: projectPath(root),
      storeDir: storePath(root),
      targetVersion: 'v2',
      migrations: migrations(),
      fsAdapter: postPublishFsyncFailureAdapter(),
      now: '2026-08-28T05:43:00.000Z',
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.code, 'E_R6_PROJECT_PUBLISH_BLOCKED_RECOVERY_UNAVAILABLE');
  assert.equal(failure.publicEvidence.recoveryAvailable, false);
  assert.equal(failure.publicEvidence.blockedState, 'BLOCKED_NO_RECOVERY_PROOF');
  assertPublicEvidencePathless(failure, root);
  assert.deepEqual(fs.readdirSync(outside), []);
});
