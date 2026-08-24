'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const decision = JSON.parse(fs.readFileSync(path.join(
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
  LIFECYCLE_EVENTS,
  createSaveReceipt,
} = require('../../src/core/lifecycle-conflict-v1.cjs');
const { SAVE_ACK_KINDS } = require('../../src/core/dirty-admission-v1.cjs');
const { selectStorageRecoveryPlan } = require('../../src/core/storage-selection-v1.cjs');
const {
  LIFECYCLE_RECOVERY_SCHEMA_VERSION,
  LifecycleRecoveryError,
  buildCheckpointGcPlan,
  executeLifecycleRecovery,
} = require('../../src/core/lifecycle-recovery-v1.cjs');

const SUBJECT = 'project:p1/document:d1';
const HEAD = 'c'.repeat(40);
const sandbox = (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

async function realSelection() {
  const dir = sandbox('r24-wp204-selection-');
  const results = [];
  for (const candidate of Object.values(CANDIDATE_REGISTRY)) {
    results.push(await runCandidateBenchmark(candidate, dir));
  }
  return selectStorageRecoveryPlan({
    dossier: compileDossier(results, HEAD),
    ownerDecision: decision,
    selectionHeadSha: HEAD,
  });
}

function paths(dir) {
  const projectRoot = path.join(dir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  const scenePath = path.join(projectRoot, 'scene.txt');
  const manifestPath = path.join(projectRoot, 'project.json');
  fs.writeFileSync(scenePath, 'draft');
  fs.writeFileSync(manifestPath, '{"projectId":"p1"}\n');
  return {
    recoveryLedgerDir: path.join(dir, 'ledger'),
    inboxOutboxDir: path.join(dir, 'box'),
    migrationStoreDir: path.join(dir, 'migration'),
    projectTransaction: {
      scenePath,
      manifestPath,
      publishManifest: async () => {
        throw new Error('no journal should request publication');
      },
    },
  };
}

function diskObservation(generation, observed = 'a'.repeat(64)) {
  return {
    schemaVersion: 'yalken.lifecycleDiskObservation.v1',
    subjectId: SUBJECT,
    observationGeneration: generation,
    committedDigest: 'a'.repeat(64),
    observedDiskDigest: observed,
    p3Classification: 'OLD_COMMITTED',
  };
}

test('clean crash recovery composes exact durable identities without granting live authority', async () => {
  const dir = sandbox('r24-wp204-clean-');
  const receipt = await executeLifecycleRecovery({
    subjectId: SUBJECT,
    observationGeneration: 4,
    selection: await realSelection(),
    ...paths(dir),
    diskObservation: diskObservation(4),
  });

  assert.equal(receipt.schemaVersion, LIFECYCLE_RECOVERY_SCHEMA_VERSION);
  assert.equal(receipt.lifecycle.eventKind, LIFECYCLE_EVENTS.CRASH_RECOVERY);
  assert.equal(receipt.lifecycle.allowed, true);
  assert.equal(receipt.lifecycle.reason, 'RECOVERY_CLEAN');
  assert.equal(receipt.projectTransaction.outcome, 'NO_JOURNAL');
  assert.equal(receipt.inboxOutbox.pendingEffectIds.length, 0);
  assert.equal(receipt.checkpointGcPlan.automaticExecution, false);
  assert.deepEqual(receipt.authority, {
    liveStorageAttachment: false,
    userDataMigration: false,
    automaticEffectPublication: false,
    automaticCheckpointGc: false,
  });
  assert.match(receipt.receiptDigest, /^[0-9a-f]{64}$/u);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.lifecycle.activeHazards), true);
});

test('close and external edit use the same fresh durable outbox observation', async () => {
  const selection = await realSelection();
  const closeDir = sandbox('r24-wp204-close-');
  const saveReceipt = createSaveReceipt({
    subjectId: SUBJECT,
    observationGeneration: 3,
    ack: {
      kind: SAVE_ACK_KINDS.SAVED,
      reason: '',
      savedGeneration: 3,
      latestEditGeneration: 3,
    },
  });
  const close = await executeLifecycleRecovery({
    subjectId: SUBJECT,
    observationGeneration: 3,
    eventKind: LIFECYCLE_EVENTS.QUIT,
    selection,
    ...paths(closeDir),
    saveReceipt,
  });
  assert.equal(close.lifecycle.allowed, true);
  assert.equal(close.lifecycle.reason, 'SAFE_TO_CLOSE');

  const external = await executeLifecycleRecovery({
    subjectId: SUBJECT,
    observationGeneration: 3,
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    selection,
    ...paths(sandbox('r24-wp204-external-')),
    diskObservation: diskObservation(3, 'b'.repeat(64)),
  });
  assert.equal(external.lifecycle.allowed, false);
  assert.equal(external.lifecycle.reason, 'EXTERNAL_DIVERGENCE_DETECTED');
  assert.deepEqual(external.lifecycle.recoveryActions, [
    'FORK_RECOVERY_COPY',
    'COMPARE_EXTERNAL_EDIT',
    'KEEP_AUTHORING_DRAFT',
  ]);
});

test('forged selection, unknown event, relative paths and missing manifest authority fail closed', async () => {
  const selection = structuredClone(await realSelection());
  selection.authority.liveStoragePathChange = true;
  await assert.rejects(executeLifecycleRecovery({
    subjectId: SUBJECT,
    observationGeneration: 0,
    selection,
    ...paths(sandbox('r24-wp204-forged-')),
    diskObservation: diskObservation(0),
  }), (error) => error.code === 'E_STORAGE_SELECTION_RECEIPT_DIGEST');

  const valid = await realSelection();
  const input = paths(sandbox('r24-wp204-invalid-'));
  await assert.rejects(executeLifecycleRecovery({
    subjectId: SUBJECT,
    observationGeneration: 0,
    eventKind: 'POWER_OFF',
    selection: valid,
    ...input,
  }), (error) => error instanceof LifecycleRecoveryError && error.code === 'E_LIFECYCLE_RECOVERY_EVENT');
  await assert.rejects(executeLifecycleRecovery({
    subjectId: SUBJECT,
    observationGeneration: 0,
    selection: valid,
    ...input,
    inboxOutboxDir: 'relative/box',
  }), (error) => error.code === 'E_LIFECYCLE_RECOVERY_INBOX_PATH');
  await assert.rejects(executeLifecycleRecovery({
    subjectId: SUBJECT,
    observationGeneration: 0,
    selection: valid,
    ...input,
    projectTransaction: { ...input.projectTransaction, publishManifest: null },
  }), (error) => error.code === 'E_LIFECYCLE_RECOVERY_MANIFEST_AUTHORITY_REQUIRED');
});

test('checkpoint GC planning is deterministic, non-executing and rejects ambiguous identity', () => {
  const plan = buildCheckpointGcPlan([
    { checkpointId: 'cp-3', sequence: 3 },
    { checkpointId: 'cp-1', sequence: 1 },
    { checkpointId: 'cp-2', sequence: 2 },
  ], 2);
  assert.deepEqual(plan.wouldDeleteCheckpointIds, ['cp-1']);
  assert.deepEqual(plan.retainedCheckpointIds, ['cp-2', 'cp-3']);
  assert.equal(plan.automaticExecution, false);
  assert.throws(
    () => buildCheckpointGcPlan([{ checkpointId: 'cp-1', sequence: 1 }, { checkpointId: 'cp-1', sequence: 2 }], 1),
    (error) => error.code === 'E_LIFECYCLE_RECOVERY_CHECKPOINT_DUPLICATE',
  );
  assert.throws(() => buildCheckpointGcPlan([], 0), (error) => error.code === 'E_LIFECYCLE_RECOVERY_RETAIN_BOUND');
});
