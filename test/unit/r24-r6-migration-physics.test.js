'use strict';

// R2.4 R6 physical evidence: corrupt sources quarantine, write failures do
// not ACK mutation, checkpoint retention is bounded, and history replay is
// strict about torn versus corrupt records.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const {
  R6_SCHEMA_VERSION,
  HISTORY_BASENAME,
  INDEX_BASENAME,
  CHECKPOINT_DIRNAME,
  QUARANTINE_DIRNAME,
  MigrationHistoryError,
  migrateProjectFile,
  restoreCheckpoint,
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

const sha256hex = (content) => crypto.createHash('sha256').update(content).digest('hex');

function historyWriteFailureAdapter() {
  return {
    ...fsp,
    async open(filePath, flags) {
      if (path.basename(filePath).startsWith(`${HISTORY_BASENAME}.p2-`)) {
        throw new Error('simulated history temp write denial');
      }
      return fsp.open(filePath, flags);
    },
  };
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

test('forged checkpoint index identity cannot authorize GC outside checkpoint root', async () => {
  const dir = sandbox();
  const store = storeDir(dir);
  const checkpoints = path.join(store, CHECKPOINT_DIRNAME);
  fs.mkdirSync(checkpoints, { recursive: true });
  fs.mkdirSync(path.join(store, QUARANTINE_DIRNAME), { recursive: true });

  const escapedPath = path.join(dir, 'escape-target.json');
  const escapedContent = Buffer.from('synthetic disposable target\n');
  const keptContent = Buffer.from('{}\n');
  const keptId = 'r6-cp-2-aaaaaaaaaaaa';
  fs.writeFileSync(escapedPath, escapedContent);
  fs.writeFileSync(path.join(checkpoints, `${keptId}.json`), keptContent);
  fs.writeFileSync(path.join(store, INDEX_BASENAME), `${JSON.stringify({
    schemaVersion: R6_SCHEMA_VERSION,
    nextSequence: 3,
    checkpoints: [
      {
        checkpointId: '../../escape-target',
        sequence: 1,
        projectId: 'escape-project',
        projectPathDigest: '1'.repeat(64),
        sourceVersion: 'v1',
        sourceDigest: sha256hex(escapedContent),
        bytes: escapedContent.length,
        createdAt: '2026-08-24T00:00:00.000Z',
      },
      {
        checkpointId: keptId,
        sequence: 2,
        projectId: 'escape-project',
        projectPathDigest: '1'.repeat(64),
        sourceVersion: 'v2',
        sourceDigest: sha256hex(keptContent),
        bytes: keptContent.length,
        createdAt: '2026-08-24T00:00:01.000Z',
      },
    ],
    quarantines: [],
  }, null, 2)}\n`);

  await assert.rejects(
    garbageCollectCheckpoints({ storeDir: store, retainLast: 1 }),
    (error) => error instanceof MigrationHistoryError && error.code === 'E_R6_INDEX_CHECKPOINT_ID',
  );
  assert.equal(fs.readFileSync(escapedPath, 'utf8'), escapedContent.toString('utf8'));
  assert.equal(fs.existsSync(path.join(checkpoints, `${keptId}.json`)), true);
});

test('history sink shape is validated before checkpoint or project publication', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  const store = storeDir(dir);
  writeProject(target, 'v1');
  const before = fs.readFileSync(target, 'utf8');
  fs.mkdirSync(path.join(store, HISTORY_BASENAME), { recursive: true });

  await assert.rejects(
    migrateProjectFile({
      projectPath: target,
      storeDir: store,
      targetVersion: 'v2',
      migrations: linearMigrations(2),
    }),
    (error) => error instanceof MigrationHistoryError && error.code === 'E_R6_HISTORY_LOG_NOT_REGULAR',
  );
  assert.equal(fs.readFileSync(target, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(path.join(store, CHECKPOINT_DIRNAME)), []);
});

test('symlink checkpoint is rejected before restore reads or publishes it', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  writeProject(target, 'v1');
  const migration = await migrateProjectFile({
    projectPath: target,
    storeDir: storeDir(dir),
    targetVersion: 'v2',
    migrations: linearMigrations(2),
  });
  const beforeRestore = fs.readFileSync(target, 'utf8');
  const checkpoint = path.join(storeDir(dir), CHECKPOINT_DIRNAME, `${migration.checkpoint.checkpointId}.json`);
  const outside = path.join(dir, 'outside-checkpoint.json');
  fs.writeFileSync(outside, fs.readFileSync(checkpoint));
  fs.unlinkSync(checkpoint);
  fs.symlinkSync(outside, checkpoint);

  await assert.rejects(
    restoreCheckpoint({
      projectPath: target,
      storeDir: storeDir(dir),
      checkpointId: migration.checkpoint.checkpointId,
    }),
    (error) => error instanceof MigrationHistoryError && error.code === 'E_R6_CHECKPOINT_PATH_UNSAFE',
  );
  assert.equal(fs.readFileSync(target, 'utf8'), beforeRestore);
});

test('migration history ACK failure rolls project content back to exact source bytes', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  writeProject(target, 'v1');
  const before = fs.readFileSync(target, 'utf8');

  await assert.rejects(
    migrateProjectFile({
      projectPath: target,
      storeDir: storeDir(dir),
      targetVersion: 'v2',
      migrations: linearMigrations(2),
      historyFsAdapter: historyWriteFailureAdapter(),
    }),
    (error) => error instanceof MigrationHistoryError && error.code === 'E_R6_HISTORY_ACK_FAILED_ROLLED_BACK',
  );
  assert.equal(fs.readFileSync(target, 'utf8'), before);
  const replay = await replayMigrationHistory(storeDir(dir));
  assert.equal(replay.historyCount, 0);
  assert.equal(replay.checkpoints.length, 1);
});

test('restore history ACK failure rolls project content back to exact pre-restore bytes', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  writeProject(target, 'v1');
  const migration = await migrateProjectFile({
    projectPath: target,
    storeDir: storeDir(dir),
    targetVersion: 'v2',
    migrations: linearMigrations(2),
  });
  const beforeRestore = fs.readFileSync(target, 'utf8');

  await assert.rejects(
    restoreCheckpoint({
      projectPath: target,
      storeDir: storeDir(dir),
      checkpointId: migration.checkpoint.checkpointId,
      historyFsAdapter: historyWriteFailureAdapter(),
    }),
    (error) => error instanceof MigrationHistoryError && error.code === 'E_R6_HISTORY_ACK_FAILED_ROLLED_BACK',
  );
  assert.equal(fs.readFileSync(target, 'utf8'), beforeRestore);
  const replay = await replayMigrationHistory(storeDir(dir));
  assert.equal(replay.historyCount, 1);
  assert.equal(replay.lastRecord.kind, 'migration.applied');
});

test('GC history ACK failure restores every deleted checkpoint and original index', async () => {
  const dir = sandbox();
  const target = projectFile(dir);
  writeProject(target, 'v1');
  const migrations = linearMigrations(5);
  for (let version = 2; version <= 4; version += 1) {
    await migrateProjectFile({
      projectPath: target,
      storeDir: storeDir(dir),
      targetVersion: `v${version}`,
      migrations,
    });
  }
  const before = await replayMigrationHistory(storeDir(dir));

  await assert.rejects(
    garbageCollectCheckpoints({
      storeDir: storeDir(dir),
      retainLast: 1,
      historyFsAdapter: historyWriteFailureAdapter(),
    }),
    (error) => error instanceof MigrationHistoryError && error.code === 'E_R6_GC_FAILED_ROLLED_BACK',
  );
  const after = await replayMigrationHistory(storeDir(dir));
  assert.deepEqual(after.checkpoints, before.checkpoints);
  assert.equal(after.historyCount, before.historyCount);
  for (const checkpoint of before.checkpoints) {
    assert.equal(
      fs.existsSync(path.join(storeDir(dir), CHECKPOINT_DIRNAME, `${checkpoint.checkpointId}.json`)),
      true,
    );
  }
});

test('complete JSON history record without commit newline fails closed as ambiguous', async () => {
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
  const committed = fs.readFileSync(historyPath, 'utf8');
  fs.writeFileSync(historyPath, committed.slice(0, -1));

  await assert.rejects(
    replayMigrationHistory(storeDir(dir)),
    (error) => error instanceof MigrationHistoryError
      && error.code === 'E_R6_HISTORY_LOG_CORRUPT'
      && error.message.includes('unterminated-valid-record'),
  );
  assert.equal(fs.readFileSync(historyPath, 'utf8'), committed.slice(0, -1));
});
