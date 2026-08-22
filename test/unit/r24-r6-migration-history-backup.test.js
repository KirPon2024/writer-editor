'use strict';

// R2.4 R6 migration/history/checkpoint protocol: normal and adversarial
// Product Core behavior without renderer, IPC or legacy backup-manager truth.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  R6_SCHEMA_VERSION,
  CHECKPOINT_DIRNAME,
  MigrationHistoryError,
  migrateProjectFile,
  restoreCheckpoint,
  replayMigrationHistory,
} = require('../../src/core/migration-history-backup-gc-v1.cjs');

const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r6-')));
const projectFile = (dir) => path.join(dir, 'project.json');
const storeDir = (dir) => path.join(dir, '.r6');

function writeProject(filePath, project) {
  fs.writeFileSync(filePath, `${JSON.stringify(project, null, 2)}\n`);
}

function migrations() {
  return [
    {
      id: 'v1-to-v2',
      fromVersion: 'v1',
      toVersion: 'v2',
      apply: (project) => ({ ...project, schemaVersion: 'v2', scenes: project.scenes || [] }),
    },
    {
      id: 'v2-to-v3',
      fromVersion: 'v2',
      toVersion: 'v3',
      apply: (project) => ({ ...project, schemaVersion: 'v3', historyEnabled: true }),
    },
  ];
}

test('forward migration creates a verified checkpoint and replayable history', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  const original = { schemaVersion: 'v1', projectId: 'project-1', title: 'Draft' };
  writeProject(target, original);
  const originalText = fs.readFileSync(target, 'utf8');

  const result = await migrateProjectFile({
    projectPath: target,
    storeDir: storeDir(dir),
    targetVersion: 'v3',
    migrations: migrations(),
    now: '2026-08-22T11:00:00.000Z',
  });

  assert.equal(result.success, true);
  assert.equal(result.noop, false);
  assert.deepEqual(result.migrationIds, ['v1-to-v2', 'v2-to-v3']);
  assert.equal(result.checkpoint.sourceVersion, 'v1');
  assert.equal(result.history.kind, 'migration.applied');

  const migrated = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.equal(migrated.projectId, 'project-1');
  assert.equal(migrated.schemaVersion, 'v3');
  assert.equal(migrated.historyEnabled, true);

  const replay = await replayMigrationHistory(storeDir(dir));
  assert.equal(replay.schemaVersion, R6_SCHEMA_VERSION);
  assert.equal(replay.historyCount, 1);
  assert.equal(replay.checkpoints.length, 1);
  assert.equal(fs.readFileSync(path.join(storeDir(dir), CHECKPOINT_DIRNAME, `${result.checkpoint.checkpointId}.json`), 'utf8'), originalText);
});

test('restore only accepts digest-bound checkpoint content for the same project path', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  writeProject(target, { schemaVersion: 'v1', projectId: 'project-restore', title: 'Original' });
  const originalText = fs.readFileSync(target, 'utf8');
  const migration = await migrateProjectFile({
    projectPath: target,
    storeDir: storeDir(dir),
    targetVersion: 'v3',
    migrations: migrations(),
  });

  const restored = await restoreCheckpoint({
    projectPath: target,
    storeDir: storeDir(dir),
    checkpointId: migration.checkpoint.checkpointId,
  });
  assert.equal(restored.success, true);
  assert.equal(fs.readFileSync(target, 'utf8'), originalText);

  fs.writeFileSync(
    path.join(storeDir(dir), CHECKPOINT_DIRNAME, `${migration.checkpoint.checkpointId}.json`),
    '{"schemaVersion":"v1","projectId":"project-restore","tampered":true}\n',
  );
  await assert.rejects(
    restoreCheckpoint({ projectPath: target, storeDir: storeDir(dir), checkpointId: migration.checkpoint.checkpointId }),
    (error) => error instanceof MigrationHistoryError && error.code === 'E_R6_CHECKPOINT_DIGEST_MISMATCH',
  );
});

test('missing migration step and project identity drift fail closed without project mutation', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  writeProject(target, { schemaVersion: 'v1', projectId: 'project-2', title: 'Draft' });
  const before = fs.readFileSync(target, 'utf8');

  await assert.rejects(
    migrateProjectFile({
      projectPath: target,
      storeDir: storeDir(dir),
      targetVersion: 'v3',
      migrations: [migrations()[0]],
    }),
    (error) => error.code === 'E_R6_MIGRATION_STEP_MISSING',
  );
  assert.equal(fs.readFileSync(target, 'utf8'), before);

  await assert.rejects(
    migrateProjectFile({
      projectPath: target,
      storeDir: storeDir(dir),
      targetVersion: 'v2',
      migrations: [{
        id: 'bad-identity',
        fromVersion: 'v1',
        toVersion: 'v2',
        apply: (project) => ({ ...project, projectId: 'other-project', schemaVersion: 'v2' }),
      }],
    }),
    (error) => error.code === 'E_R6_MIGRATION_PROJECT_ID_CHANGED',
  );
  assert.equal(fs.readFileSync(target, 'utf8'), before);
});

test('current target version is an idempotent no-op and creates no checkpoint', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  writeProject(target, { schemaVersion: 'v3', projectId: 'project-noop', title: 'Done' });

  const result = await migrateProjectFile({
    projectPath: target,
    storeDir: storeDir(dir),
    targetVersion: 'v3',
    migrations: migrations(),
  });

  assert.equal(result.noop, true);
  const replay = await replayMigrationHistory(storeDir(dir));
  assert.equal(replay.historyCount, 0);
  assert.equal(replay.checkpoints.length, 0);
});
