'use strict';

// R2.4 R6 implementation mutation suite for migration, checkpoint restore,
// quarantine, history integrity and bounded GC laws.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
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
  {
    id: 'index-id-sequence-not-bound',
    find: "  if (!match || Number(match[1]) !== record.sequence) {\n    throw new MigrationHistoryError(\`E_R6_INDEX_\${kind}_ID\`, String(id));\n  }",
    replace: "  if (false) {\n    throw new MigrationHistoryError(\`E_R6_INDEX_\${kind}_ID\`, String(id));\n  }",
  },
  {
    id: 'artifact-symlink-followed',
    find: "  const stat = fs.lstatSync(candidate);\n  if (stat.isSymbolicLink() || !stat.isFile()) throw new MigrationHistoryError(code, basename);\n  const canonical = fs.realpathSync(candidate);\n  if (path.dirname(canonical) !== resolvedRoot) throw new MigrationHistoryError(code, basename);",
    replace: "  return candidate;",
  },
  {
    id: 'history-nonregular-untyped',
    find: "  const stat = fs.lstatSync(historyPath);\n  if (stat.isSymbolicLink() || !stat.isFile()) {\n    throw new MigrationHistoryError('E_R6_HISTORY_LOG_NOT_REGULAR');\n  }",
    replace: "  const stat = fs.lstatSync(historyPath);",
  },
  {
    id: 'migration-history-preflight-skipped',
    find: "  const chain = buildMigrationChain(project.schemaVersion, targetVersion, migrations);\n  await preflightHistoryAppend(root);",
    replace: "  const chain = buildMigrationChain(project.schemaVersion, targetVersion, migrations);",
  },
  {
    id: 'migration-history-rollback-keeps-target',
    find: "      previousContent: rawContent,",
    replace: "      previousContent: targetContent,",
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
    R6_SCHEMA_VERSION,
    HISTORY_BASENAME,
    INDEX_BASENAME,
    CHECKPOINT_DIRNAME,
    migrateProjectFile,
    restoreCheckpoint,
    garbageCollectCheckpoints,
    replayMigrationHistory,
  } = module;

  const historyFailureAdapter = {
    ...fsp,
    async open(filePath, flags) {
      if (path.basename(filePath).startsWith(`${HISTORY_BASENAME}.p2-`)) {
        throw new Error('simulated history write failure');
      }
      return fsp.open(filePath, flags);
    },
  };

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

  const indexDir = sandbox();
  writeProject(projectFile(indexDir), 'v1');
  const indexChain = migrations(4);
  await migrateProjectFile({
    projectPath: projectFile(indexDir),
    storeDir: storeDir(indexDir),
    targetVersion: 'v2',
    migrations: indexChain,
  });
  await migrateProjectFile({
    projectPath: projectFile(indexDir),
    storeDir: storeDir(indexDir),
    targetVersion: 'v3',
    migrations: indexChain,
  });
  const indexPath = path.join(storeDir(indexDir), INDEX_BASENAME);
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  assert.equal(index.schemaVersion, R6_SCHEMA_VERSION);
  const firstCheckpoint = index.checkpoints[0];
  const mismatchedId = 'r6-cp-99-aaaaaaaaaaaa';
  fs.renameSync(
    path.join(storeDir(indexDir), CHECKPOINT_DIRNAME, `${firstCheckpoint.checkpointId}.json`),
    path.join(storeDir(indexDir), CHECKPOINT_DIRNAME, `${mismatchedId}.json`),
  );
  firstCheckpoint.checkpointId = mismatchedId;
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  await assert.rejects(
    garbageCollectCheckpoints({ storeDir: storeDir(indexDir), retainLast: 1 }),
    (error) => error.code === 'E_R6_INDEX_CHECKPOINT_ID',
  );

  const symlinkDir = sandbox();
  writeProject(projectFile(symlinkDir), 'v1');
  const symlinkMigration = await migrateProjectFile({
    projectPath: projectFile(symlinkDir),
    storeDir: storeDir(symlinkDir),
    targetVersion: 'v2',
    migrations: migrations(2),
  });
  const symlinkCheckpoint = path.join(
    storeDir(symlinkDir),
    CHECKPOINT_DIRNAME,
    `${symlinkMigration.checkpoint.checkpointId}.json`,
  );
  const outsideCheckpoint = path.join(symlinkDir, 'outside.json');
  fs.writeFileSync(outsideCheckpoint, fs.readFileSync(symlinkCheckpoint));
  fs.unlinkSync(symlinkCheckpoint);
  fs.symlinkSync(outsideCheckpoint, symlinkCheckpoint);
  await assert.rejects(
    restoreCheckpoint({
      projectPath: projectFile(symlinkDir),
      storeDir: storeDir(symlinkDir),
      checkpointId: symlinkMigration.checkpoint.checkpointId,
    }),
    (error) => error.code === 'E_R6_CHECKPOINT_PATH_UNSAFE',
  );

  const preflightDir = sandbox();
  writeProject(projectFile(preflightDir), 'v1');
  fs.mkdirSync(path.join(storeDir(preflightDir), HISTORY_BASENAME), { recursive: true });
  await assert.rejects(
    migrateProjectFile({
      projectPath: projectFile(preflightDir),
      storeDir: storeDir(preflightDir),
      targetVersion: 'v2',
      migrations: migrations(2),
    }),
    (error) => error.code === 'E_R6_HISTORY_LOG_NOT_REGULAR',
  );
  assert.deepEqual(fs.readdirSync(path.join(storeDir(preflightDir), CHECKPOINT_DIRNAME)), []);
  assert.equal(JSON.parse(fs.readFileSync(projectFile(preflightDir), 'utf8')).schemaVersion, 'v1');

  const rollbackDir = sandbox();
  writeProject(projectFile(rollbackDir), 'v1');
  const rollbackBefore = fs.readFileSync(projectFile(rollbackDir), 'utf8');
  await assert.rejects(
    migrateProjectFile({
      projectPath: projectFile(rollbackDir),
      storeDir: storeDir(rollbackDir),
      targetVersion: 'v2',
      migrations: migrations(2),
      historyFsAdapter: historyFailureAdapter,
    }),
    (error) => error.code === 'E_R6_HISTORY_ACK_FAILED_ROLLED_BACK',
  );
  assert.equal(fs.readFileSync(projectFile(rollbackDir), 'utf8'), rollbackBefore);
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
