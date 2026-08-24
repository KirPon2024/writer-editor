'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CORE = path.join(ROOT, 'src', 'core');
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
const { createSaveReceipt } = require('../../src/core/lifecycle-conflict-v1.cjs');
const { SAVE_ACK_KINDS } = require('../../src/core/dirty-admission-v1.cjs');
const { openTransactionalInboxOutbox } = require('../../src/core/transactional-inbox-outbox-v1.cjs');
const { selectStorageRecoveryPlan } = require('../../src/core/storage-selection-v1.cjs');

const MODULE_BASENAME = 'lifecycle-recovery-v1.cjs';
const DEPENDENCIES = [
  'transactional-inbox-outbox-v1.cjs',
  'lifecycle-conflict-v1.cjs',
  'dirty-admission-v1.cjs',
  'autosave-generation-v1.cjs',
  'revision-algebra-v1.cjs',
  'project-transaction-v1.cjs',
  'migration-history-backup-gc-v1.cjs',
  'storage-selection-v1.cjs',
  'storage-bakeoff-v1.cjs',
  'recovery-ledger-v1.cjs',
  'save-coordinator-v1.cjs',
];
const SUBJECT = 'project:mutant/document:d1';
const HEAD = 'e'.repeat(40);
const source = fs.readFileSync(path.join(CORE, MODULE_BASENAME), 'utf8');
const sandbox = (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

const mutants = [
  {
    id: 'M_PATH_ACCEPTS_RELATIVE',
    find: 'if (!path.isAbsolute(candidate) || path.normalize(candidate) !== candidate) {',
    replace: 'if (false) {',
  },
  {
    id: 'M_GC_DELETES_NEWEST',
    find: 'wouldDeleteCheckpointIds: ordered.slice(0, deleteCount).map((record) => record.checkpointId),',
    replace: 'wouldDeleteCheckpointIds: ordered.slice(deleteCount).map((record) => record.checkpointId),',
  },
  {
    id: 'M_GC_AUTOMATIC_EXECUTION',
    find: 'automaticExecution: false,',
    replace: 'automaticExecution: true,',
  },
  {
    id: 'M_EVENT_FORCED_TO_CRASH',
    find: 'const decision = evaluateLifecycleBarrier({\n    eventKind,',
    replace: 'const decision = evaluateLifecycleBarrier({\n    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,',
  },
  {
    id: 'M_PENDING_EFFECTS_HIDDEN',
    find: 'pendingEffectIds: inboxOutbox.pendingEffects().map((effect) => effect.effectId),',
    replace: 'pendingEffectIds: [],',
  },
  {
    id: 'M_EFFECTS_AUTO_PUBLISH',
    find: 'automaticPublication: false,',
    replace: 'automaticPublication: true,',
  },
  {
    id: 'M_LIVE_STORAGE_ATTACHMENT',
    find: 'liveStorageAttachment: false,',
    replace: 'liveStorageAttachment: true,',
  },
];

async function realSelection() {
  const dir = sandbox('r24-wp204-mutant-selection-');
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

function loadMutant(mutant) {
  assert.ok(source.includes(mutant.find), `${mutant.id} insertion point exists`);
  const dir = sandbox(`r24-wp204-${mutant.id.toLowerCase()}-`);
  fs.writeFileSync(path.join(dir, MODULE_BASENAME), source.replace(mutant.find, mutant.replace));
  for (const basename of DEPENDENCIES) {
    fs.copyFileSync(path.join(CORE, basename), path.join(dir, basename));
  }
  return require(path.join(dir, MODULE_BASENAME));
}

function makePaths(dir) {
  const projectRoot = path.join(dir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  const scenePath = path.join(projectRoot, 'scene.txt');
  const manifestPath = path.join(projectRoot, 'project.json');
  fs.writeFileSync(scenePath, 'scene');
  fs.writeFileSync(manifestPath, '{"projectId":"mutant"}\n');
  return {
    recoveryLedgerDir: path.join(dir, 'ledger'),
    inboxOutboxDir: path.join(dir, 'box'),
    migrationStoreDir: path.join(dir, 'migration'),
    projectTransaction: {
      scenePath,
      manifestPath,
      publishManifest: async () => {
        throw new Error('no journal should publish');
      },
    },
  };
}

async function killOracle(moduleUnderTest, selection) {
  const plan = moduleUnderTest.buildCheckpointGcPlan([
    { checkpointId: 'cp-3', sequence: 3 },
    { checkpointId: 'cp-1', sequence: 1 },
    { checkpointId: 'cp-2', sequence: 2 },
  ], 2);
  assert.deepEqual(plan.wouldDeleteCheckpointIds, ['cp-1']);
  assert.deepEqual(plan.retainedCheckpointIds, ['cp-2', 'cp-3']);
  assert.equal(plan.automaticExecution, false);

  const root = sandbox('r24-wp204-mutant-oracle-');
  const input = makePaths(root);
  const box = await openTransactionalInboxOutbox(input.inboxOutboxDir);
  await box.admitIntent({ intentId: 'i1', kind: 'project.commit' });
  await box.markExecuted('i1', { revision: 1 });
  await box.stageEffect({ intentId: 'i1', effectId: 'e1', kind: 'fs.publish' });
  const saveReceipt = createSaveReceipt({
    subjectId: SUBJECT,
    observationGeneration: 1,
    ack: {
      kind: SAVE_ACK_KINDS.SAVED,
      reason: '',
      savedGeneration: 1,
      latestEditGeneration: 1,
    },
  });
  const receipt = await moduleUnderTest.executeLifecycleRecovery({
    subjectId: SUBJECT,
    observationGeneration: 1,
    eventKind: 'QUIT',
    selection,
    ...input,
    saveReceipt,
  });
  assert.equal(receipt.lifecycle.eventKind, 'QUIT');
  assert.deepEqual(receipt.inboxOutbox.pendingEffectIds, ['e1']);
  assert.equal(receipt.inboxOutbox.automaticPublication, false);
  assert.equal(receipt.authority.liveStorageAttachment, false);
  await assert.rejects(moduleUnderTest.executeLifecycleRecovery({
    subjectId: SUBJECT,
    observationGeneration: 1,
    eventKind: 'QUIT',
    selection,
    ...input,
    inboxOutboxDir: 'relative/box',
    saveReceipt,
  }), (error) => error.code === 'E_LIFECYCLE_RECOVERY_INBOX_PATH');
}

test('WP204 lifecycle recovery executes and kills every named implementation mutant', async () => {
  const selection = await realSelection();
  const killed = [];
  for (const mutant of mutants) {
    const moduleUnderTest = loadMutant(mutant);
    try {
      await killOracle(moduleUnderTest, selection);
    } catch {
      killed.push(mutant.id);
    }
  }
  assert.deepEqual(killed, mutants.map((mutant) => mutant.id));
});
