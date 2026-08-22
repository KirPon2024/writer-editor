'use strict';

// R2.4 R6 physical evidence: corrupt sources quarantine, write failures do
// not ACK mutation, checkpoint retention is bounded, and history replay is
// strict about torn versus corrupt records.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  HISTORY_BASENAME,
  CHECKPOINT_DIRNAME,
  QUARANTINE_DIRNAME,
  MigrationHistoryError,
  migrateProjectFile,
  garbageCollectCheckpoints,
  replayMigrationHistory,
} = require('../../src/core/migration-history-backup-gc-v1.cjs');

const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r6p-')));
const projectFile = (dir) => path.join(dir, 'project.json');
const storeDir = (dir) => path.join(dir, '.r6');

function writeProject(filePath, version, title = 'Draft') {
  fs.writeFileSync(filePath, `${JSON.stringify({ schemaVersion: version, projectId: 'project-physics', title }, null, 2)}\n`);
}

function linearMigrations(maxVersion) {
  return Array.from({ length: maxVersion - 1 }, (_, index) => {
    const from = `v${index + 1}`;
    const to = `v${index + 2}`;
    return {
      id: `${from}-to-${to}`,
      fromVersion: from,
      toVersion: to,
      apply: (project) => ({ ...project, schemaVersion: to, migrationTrail: [...(project.migrationTrail || []), to] }),
    };
  });
}

test('corrupt project source is quarantined without mutating the source file', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  fs.writeFileSync(target, '{"schemaVersion":"v1","projectId":');
  const before = fs.readFileSync(target, 'utf8');

  const result = await migrateProjectFile({
    projectPath: target,
    storeDir: storeDir(dir),
    targetVersion: 'v2',
    migrations: linearMigrations(2),
    now: '2026-08-22T11:10:00.000Z',
  });

  assert.equal(result.success, false);
  assert.equal(result.quarantined, true);
  assert.equal(result.error.code, 'E_R6_PROJECT_JSON_INVALID');
  assert.equal(fs.readFileSync(target, 'utf8'), before);
  assert.equal(
    fs.readFileSync(path.join(storeDir(dir), QUARANTINE_DIRNAME, `${result.quarantine.quarantineId}.json`), 'utf8'),
    before,
  );
  const replay = await replayMigrationHistory(storeDir(dir));
  assert.equal(replay.quarantines.length, 1);
  assert.equal(replay.lastRecord.kind, 'quarantine.created');
});

test('project write failure leaves original project content and no migration history ACK', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  writeProject(target, 'v1');
  const before = fs.readFileSync(target, 'utf8');
  const failingAdapter = {
    ...fsp,
    async open() {
      throw new Error('simulated temp write denial');
    },
  };

  await assert.rejects(
    migrateProjectFile({
      projectPath: target,
      storeDir: storeDir(dir),
      targetVersion: 'v2',
      migrations: linearMigrations(2),
      fsAdapter: failingAdapter,
    }),
    (error) => error.code === 'E_SAVE_TEMP_WRITE',
  );
  assert.equal(fs.readFileSync(target, 'utf8'), before);
  const replay = await replayMigrationHistory(storeDir(dir));
  assert.equal(replay.historyCount, 0);
  assert.equal(replay.checkpoints.length, 1, 'pre-mutation checkpoint remains available for recovery');
});

test('retention garbage collection keeps only the newest checkpoint files', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  writeProject(target, 'v1');
  const migrations = linearMigrations(6);

  for (let version = 2; version <= 5; version += 1) {
    await migrateProjectFile({
      projectPath: target,
      storeDir: storeDir(dir),
      targetVersion: `v${version}`,
      migrations,
    });
  }
  let replay = await replayMigrationHistory(storeDir(dir));
  assert.equal(replay.checkpoints.length, 4);

  const gc = await garbageCollectCheckpoints({ storeDir: storeDir(dir), retainLast: 2 });
  assert.equal(gc.retained, 2);
  assert.equal(gc.deleted.length, 2);
  replay = await replayMigrationHistory(storeDir(dir));
  assert.equal(replay.checkpoints.length, 2);
  const files = fs.readdirSync(path.join(storeDir(dir), CHECKPOINT_DIRNAME)).filter((name) => name.endsWith('.json'));
  assert.deepEqual(
    files.sort(),
    replay.checkpoints.map((checkpoint) => `${checkpoint.checkpointId}.json`).sort(),
  );
});

test('history replay truncates a torn tail but rejects committed corrupt records', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  writeProject(target, 'v1');
  await migrateProjectFile({
    projectPath: target,
    storeDir: storeDir(dir),
    targetVersion: 'v2',
    migrations: linearMigrations(2),
  });
  const historyPath = path.join(storeDir(dir), HISTORY_BASENAME);

  fs.appendFileSync(historyPath, '{"schemaVersion":"yalken.migrationHistoryBackupGc.v1"');
  const replay = await replayMigrationHistory(storeDir(dir));
  assert.equal(replay.tornTailTruncated, true);
  assert.equal(fs.readFileSync(historyPath, 'utf8').endsWith('{"schemaVersion":"yalken.migrationHistoryBackupGc.v1"'), false);

  fs.appendFileSync(historyPath, '{"schemaVersion":"yalken.migrationHistoryBackupGc.v1","seq":2}\n');
  await assert.rejects(
    replayMigrationHistory(storeDir(dir)),
    (error) => error instanceof MigrationHistoryError && error.code.startsWith('E_R6_HISTORY_'),
  );
});
