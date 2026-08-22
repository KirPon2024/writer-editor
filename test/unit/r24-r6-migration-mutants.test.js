'use strict';

// R2.4 R6 implementation mutation suite for migration, checkpoint restore,
// quarantine, history integrity and bounded GC laws.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'migration-history-backup-gc-v1.cjs');

const MUTANTS = [
  {
    id: 'missing-step-not-typed',
    find: "    if (!step) throw new MigrationHistoryError('E_R6_MIGRATION_STEP_MISSING', `${cursor}->${target}`);",
    replace: "    if (false) throw new MigrationHistoryError('E_R6_MIGRATION_STEP_MISSING', `${cursor}->${target}`);",
  },
  {
    id: 'project-id-change-allowed',
    find: "    if (next.projectId !== project.projectId) throw new MigrationHistoryError('E_R6_MIGRATION_PROJECT_ID_CHANGED', step.id);",
    replace: "    if (false) throw new MigrationHistoryError('E_R6_MIGRATION_PROJECT_ID_CHANGED', step.id);",
  },
  {
    id: 'checkpoint-digest-not-checked',
    find: "  if (digest !== record.sourceDigest) throw new MigrationHistoryError('E_R6_CHECKPOINT_DIGEST_MISMATCH', id);",
    replace: "  if (false) throw new MigrationHistoryError('E_R6_CHECKPOINT_DIGEST_MISMATCH', id);",
  },
  {
    id: 'gc-keeps-oldest',
    find: '  const keep = new Set(sorted.slice(-retainLast).map((record) => record.checkpointId));',
    replace: '  const keep = new Set(sorted.slice(0, retainLast).map((record) => record.checkpointId));',
  },
  {
    id: 'corrupt-json-not-quarantined',
    find: "    if (error instanceof MigrationHistoryError && error.code === 'E_R6_PROJECT_JSON_INVALID') {",
    replace: "    if (false && error instanceof MigrationHistoryError && error.code === 'E_R6_PROJECT_JSON_INVALID') {",
  },
  {
    id: 'history-digest-not-checked',
    find: "  if (historyEntryDigest(entry) !== entry.digest) throw new MigrationHistoryError('E_R6_HISTORY_DIGEST', String(entry.seq));",
    replace: "  if (false) throw new MigrationHistoryError('E_R6_HISTORY_DIGEST', String(entry.seq));",
  },
];

const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r6m-')));
const projectFile = (dir) => path.join(dir, 'project.json');
const storeDir = (dir) => path.join(dir, '.r6');

function writeProject(filePath, version, projectId = 'project-mutant') {
  fs.writeFileSync(filePath, `${JSON.stringify({ schemaVersion: version, projectId, title: 'Draft' }, null, 2)}\n`);
}

function migrations(maxVersion) {
  return Array.from({ length: maxVersion - 1 }, (_, index) => {
    const from = `v${index + 1}`;
    const to = `v${index + 2}`;
    return {
      id: `${from}-to-${to}`,
      fromVersion: from,
      toVersion: to,
      apply: (project) => ({ ...project, schemaVersion: to, trail: [...(project.trail || []), to] }),
    };
  });
}

async function killOracle(module) {
  const {
    HISTORY_BASENAME,
    CHECKPOINT_DIRNAME,
    migrateProjectFile,
    restoreCheckpoint,
    garbageCollectCheckpoints,
    replayMigrationHistory,
  } = module;

  const missingDir = sandbox();
  writeProject(projectFile(missingDir), 'v1');
  await assert.rejects(
    migrateProjectFile({
      projectPath: projectFile(missingDir),
      storeDir: storeDir(missingDir),
      targetVersion: 'v3',
      migrations: [migrations(2)[0]],
    }),
    (error) => error.code === 'E_R6_MIGRATION_STEP_MISSING',
  );

  const identityDir = sandbox();
  writeProject(projectFile(identityDir), 'v1');
  await assert.rejects(
    migrateProjectFile({
      projectPath: projectFile(identityDir),
      storeDir: storeDir(identityDir),
      targetVersion: 'v2',
      migrations: [{
        id: 'identity-mutator',
        fromVersion: 'v1',
        toVersion: 'v2',
        apply: (project) => ({ ...project, projectId: 'changed', schemaVersion: 'v2' }),
      }],
    }),
    (error) => error.code === 'E_R6_MIGRATION_PROJECT_ID_CHANGED',
  );

  const restoreDir = sandbox();
  writeProject(projectFile(restoreDir), 'v1');
  const migrated = await migrateProjectFile({
    projectPath: projectFile(restoreDir),
    storeDir: storeDir(restoreDir),
    targetVersion: 'v2',
    migrations: migrations(2),
  });
  fs.writeFileSync(
    path.join(storeDir(restoreDir), CHECKPOINT_DIRNAME, `${migrated.checkpoint.checkpointId}.json`),
    '{"schemaVersion":"v1","projectId":"project-mutant","tampered":true}\n',
  );
  await assert.rejects(
    restoreCheckpoint({
      projectPath: projectFile(restoreDir),
      storeDir: storeDir(restoreDir),
      checkpointId: migrated.checkpoint.checkpointId,
    }),
    (error) => error.code === 'E_R6_CHECKPOINT_DIGEST_MISMATCH',
  );

  const gcDir = sandbox();
  writeProject(projectFile(gcDir), 'v1');
  const fullChain = migrations(5);
  for (let version = 2; version <= 4; version += 1) {
    await migrateProjectFile({
      projectPath: projectFile(gcDir),
      storeDir: storeDir(gcDir),
      targetVersion: `v${version}`,
      migrations: fullChain,
    });
  }
  const beforeGc = await replayMigrationHistory(storeDir(gcDir));
  const newestIds = beforeGc.checkpoints.slice(-2).map((checkpoint) => checkpoint.checkpointId);
  await garbageCollectCheckpoints({ storeDir: storeDir(gcDir), retainLast: 2 });
  const afterGc = await replayMigrationHistory(storeDir(gcDir));
  assert.deepEqual(afterGc.checkpoints.map((checkpoint) => checkpoint.checkpointId), newestIds);

  const corruptDir = sandbox();
  fs.writeFileSync(projectFile(corruptDir), '{"schemaVersion":"v1","projectId":');
  const corrupt = await migrateProjectFile({
    projectPath: projectFile(corruptDir),
    storeDir: storeDir(corruptDir),
    targetVersion: 'v2',
    migrations: migrations(2),
  });
  assert.equal(corrupt.quarantined, true);

  const historyDir = sandbox();
  writeProject(projectFile(historyDir), 'v1');
  await migrateProjectFile({
    projectPath: projectFile(historyDir),
    storeDir: storeDir(historyDir),
    targetVersion: 'v2',
    migrations: migrations(2),
  });
  const historyPath = path.join(storeDir(historyDir), HISTORY_BASENAME);
  const first = JSON.parse(fs.readFileSync(historyPath, 'utf8').split('\n')[0]);
  first.targetVersion = 'tampered';
  fs.writeFileSync(historyPath, `${JSON.stringify(first)}\n`);
  await assert.rejects(
    replayMigrationHistory(storeDir(historyDir)),
    (error) => error.code === 'E_R6_HISTORY_DIGEST',
  );
}

test('R6 migration history backup GC: all implementation mutants are executed and killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  await killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r6-mutant-'));
    fs.copyFileSync(
      path.join(__dirname, '..', '..', 'src', 'core', 'save-coordinator-v1.cjs'),
      path.join(dir, 'save-coordinator-v1.cjs'),
    );
    fs.writeFileSync(path.join(dir, 'migration-history-backup-gc-v1.cjs'), source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      await killOracle(require(path.join(dir, 'migration-history-backup-gc-v1.cjs')));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_R6_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
