'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const ownerDecision = JSON.parse(fs.readFileSync(path.join(
  ROOT,
  'docs',
  'OPS',
  'R24',
  'OWNER_GATE_DECISIONS',
  'STORAGE_AUTHORITY_ADR_R2_STORAGE_BAKEOFF_V1.json',
), 'utf8'));
const {
  CANDIDATE_REGISTRY,
  compileDossier,
  runCandidateBenchmark,
} = require('../../src/core/storage-bakeoff-v1.cjs');
const {
  HISTORY_BASENAME,
  CHECKPOINT_DIRNAME,
  migrateProjectFile,
} = require('../../src/core/migration-history-backup-gc-v1.cjs');
const {
  OUTBOX_BASENAME,
  openTransactionalInboxOutbox,
} = require('../../src/core/transactional-inbox-outbox-v1.cjs');
const {
  LEDGER_BASENAME,
} = require('../../src/core/recovery-ledger-v1.cjs');
const {
  commitProjectTransaction,
  journalPathFor,
} = require('../../src/core/project-transaction-v1.cjs');
const {
  openSelectedRecoveryLedger,
  selectStorageRecoveryPlan,
} = require('../../src/core/storage-selection-v1.cjs');
const {
  buildCheckpointGcPlan,
  executeLifecycleRecovery,
} = require('../../src/core/lifecycle-recovery-v1.cjs');

const SUBJECT = 'project:physics/document:scene';
const HEAD = 'd'.repeat(40);
const sandbox = (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

async function realSelection() {
  const dir = sandbox('r24-wp204-physics-selection-');
  const results = [];
  for (const candidate of Object.values(CANDIDATE_REGISTRY)) {
    results.push(await runCandidateBenchmark(candidate, dir));
  }
  return selectStorageRecoveryPlan({
    dossier: compileDossier(results, HEAD),
    ownerDecision,
    selectionHeadSha: HEAD,
  });
}

function linearMigrations(maxVersion) {
  return Array.from({ length: maxVersion - 1 }, (_, index) => ({
    id: `v${index + 1}-to-v${index + 2}`,
    fromVersion: `v${index + 1}`,
    toVersion: `v${index + 2}`,
    apply: (project) => ({ ...project, schemaVersion: `v${index + 2}` }),
  }));
}

function cleanDiskObservation(generation) {
  return {
    schemaVersion: 'yalken.lifecycleDiskObservation.v1',
    subjectId: SUBJECT,
    observationGeneration: generation,
    committedDigest: 'a'.repeat(64),
    observedDiskDigest: 'a'.repeat(64),
    p3Classification: 'NEW_COMMITTED',
  };
}

test('physical crash recovery converges the transaction and preserves pending effects and checkpoints', async () => {
  const root = sandbox('r24-wp204-physics-');
  const selection = await realSelection();
  const projectRoot = path.join(root, 'project');
  const scenePath = path.join(projectRoot, 'scene.txt');
  const manifestPath = path.join(projectRoot, 'project.json');
  fs.mkdirSync(projectRoot, { recursive: true });
  const beforeScene = 'before-scene';
  const beforeManifest = '{"schemaVersion":"v1","projectId":"project-physics"}\n';
  const afterScene = 'after-scene';
  const afterManifest = '{"schemaVersion":"v1","projectId":"project-physics","title":"changed"}\n';
  fs.writeFileSync(scenePath, beforeScene);
  fs.writeFileSync(manifestPath, beforeManifest);

  const publishManifest = async ({ expectedText, nextText }) => {
    assert.equal(fs.readFileSync(manifestPath, 'utf8'), expectedText, 'manifest publication stays CAS-bound');
    fs.writeFileSync(manifestPath, nextText);
  };
  const failCommitRecord = {
    ...fsp,
    async open(targetPath, flags) {
      if (String(targetPath).includes('.wp201-commit.json.p2-')) {
        const error = new Error('simulated commit record crash');
        error.code = 'E_SIMULATED_CRASH';
        throw error;
      }
      return fsp.open(targetPath, flags);
    },
  };
  await assert.rejects(commitProjectTransaction({
    scenePath,
    sceneContent: afterScene,
    expectedSceneContent: beforeScene,
    manifestPath,
    manifestContent: afterManifest,
    expectedManifestContent: beforeManifest,
    revision: 1,
    publishManifest,
    fsAdapter: failCommitRecord,
  }));
  assert.equal(fs.existsSync(journalPathFor(manifestPath)), true, 'the crash leaves the recovery journal');
  assert.equal(fs.readFileSync(scenePath, 'utf8'), afterScene);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), afterManifest);

  const inboxOutboxDir = path.join(root, 'inbox-outbox');
  const box = await openTransactionalInboxOutbox(inboxOutboxDir);
  await box.admitIntent({ intentId: 'save-1', kind: 'project.commit', payload: { revision: 1 } });
  await box.markExecuted('save-1', { revision: 1 });
  await box.stageEffect({ intentId: 'save-1', effectId: 'publish-1', kind: 'fs.publish' });
  fs.appendFileSync(path.join(inboxOutboxDir, OUTBOX_BASENAME), '{"torn":');

  const recoveryLedgerDir = path.join(root, 'ledger');
  const ledger = await openSelectedRecoveryLedger(selection, recoveryLedgerDir, { maxEntries: 8 });
  await ledger.append({ kind: 'scene.commit', subject: 'scene.txt', revision: 1 });
  fs.appendFileSync(path.join(recoveryLedgerDir, LEDGER_BASENAME), '{"seq":2');

  const migrationProject = path.join(root, 'migration-project.json');
  const migrationStoreDir = path.join(root, 'migration-store');
  fs.writeFileSync(migrationProject, '{"schemaVersion":"v1","projectId":"migration-physics"}\n');
  const migrations = linearMigrations(4);
  for (let target = 2; target <= 4; target += 1) {
    await migrateProjectFile({
      projectPath: migrationProject,
      storeDir: migrationStoreDir,
      targetVersion: `v${target}`,
      migrations,
    });
  }
  fs.appendFileSync(path.join(migrationStoreDir, HISTORY_BASENAME), '{"torn":');
  const checkpointDir = path.join(migrationStoreDir, CHECKPOINT_DIRNAME);
  const checkpointsBefore = fs.readdirSync(checkpointDir).sort();

  const receipt = await executeLifecycleRecovery({
    subjectId: SUBJECT,
    observationGeneration: 1,
    selection,
    recoveryLedgerDir,
    inboxOutboxDir,
    migrationStoreDir,
    projectTransaction: { scenePath, manifestPath, publishManifest },
    diskObservation: cleanDiskObservation(1),
    retainCheckpoints: 1,
    recoveryLedgerOptions: { maxEntries: 8 },
  });

  assert.equal(receipt.projectTransaction.recovered, true);
  assert.equal(receipt.projectTransaction.outcome, 'UNCOMMITTED_ROLLED_BACK');
  assert.equal(fs.readFileSync(scenePath, 'utf8'), beforeScene);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), beforeManifest);
  assert.equal(fs.existsSync(journalPathFor(manifestPath)), false);
  assert.deepEqual(receipt.inboxOutbox.pendingEffectIds, ['publish-1']);
  assert.equal(receipt.inboxOutbox.automaticPublication, false);
  assert.equal(receipt.lifecycle.allowed, false);
  assert.equal(receipt.lifecycle.reason, 'PENDING_EFFECT_REPLAY_REQUIRED');
  assert.equal(receipt.recoveryLedger.tornTailTruncated, true);
  assert.equal(receipt.migration.tornTailTruncated, true);
  assert.equal(receipt.migration.checkpointCount, 3);
  assert.equal(receipt.checkpointGcPlan.wouldDeleteCheckpointIds.length, 2);
  assert.equal(receipt.checkpointGcPlan.automaticExecution, false);
  assert.deepEqual(fs.readdirSync(checkpointDir).sort(), checkpointsBefore, 'GC is planned but never executed');
  assert.equal(fs.readFileSync(path.join(inboxOutboxDir, OUTBOX_BASENAME), 'utf8').includes('{"torn":'), false);
  assert.equal(fs.readFileSync(path.join(recoveryLedgerDir, LEDGER_BASENAME), 'utf8').includes('{"seq":2'), false);
  assert.equal(fs.readFileSync(path.join(migrationStoreDir, HISTORY_BASENAME), 'utf8').includes('{"torn":'), false);
});

test('checkpoint planning remains linear for a closed 20k denominator', () => {
  const checkpoints = Array.from({ length: 20000 }, (_, index) => ({
    checkpointId: `checkpoint-${index}`,
    sequence: index + 1,
  }));
  const started = process.hrtime.bigint();
  const plan = buildCheckpointGcPlan(checkpoints, 128);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(plan.checkpointCount, 20000);
  assert.equal(plan.wouldDeleteCheckpointIds.length, 19872);
  assert.equal(plan.retainedCheckpointIds.length, 128);
  assert.ok(elapsedMs < 1000, `20k checkpoint planning took ${elapsedMs.toFixed(1)}ms`);
});
