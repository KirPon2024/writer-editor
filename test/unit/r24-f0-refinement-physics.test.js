'use strict';

// R2.4 F0 physical/adversarial refinement proof: stitch selected prerequisite
// boundaries together so rejected implementation states do not become safe
// lifecycle, effect, path or migration claims.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  ACK_OUTCOMES,
} = require('../../src/core/autosave-generation-v1.cjs');
const {
  SAVE_ACK_KINDS,
  applySaveAck,
  classifySaveAck,
  deriveDirty,
} = require('../../src/core/dirty-admission-v1.cjs');
const {
  durableSaveTransaction,
} = require('../../src/core/save-coordinator-v1.cjs');
const {
  openTransactionalInboxOutbox,
} = require('../../src/core/transactional-inbox-outbox-v1.cjs');
const {
  LIFECYCLE_EVENTS,
  LIFECYCLE_REASONS,
  createDetachedOutboxObservation,
  createFreshOutboxObservation,
  createSaveReceipt,
  evaluateLifecycleBarrier,
} = require('../../src/core/lifecycle-conflict-v1.cjs');
const {
  resolveWithinCapabilityRoots,
} = require('../../src/core/io/path-capability-v1.cjs');
const {
  CHECKPOINT_DIRNAME,
  migrateProjectFile,
  restoreCheckpoint,
} = require('../../src/core/migration-history-backup-gc-v1.cjs');

const sandbox = (prefix = 'r24-f0p-') => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
const LIFECYCLE_SUBJECT = 'project:f0/document:scene';
const cleanDiskObservation = (generation) => ({
  schemaVersion: 'yalken.lifecycleDiskObservation.v1',
  subjectId: LIFECYCLE_SUBJECT,
  observationGeneration: generation,
  committedDigest: 'a'.repeat(64),
  observedDiskDigest: 'a'.repeat(64),
  p3Classification: 'NEW_COMMITTED',
});

function linearMigrations(maxVersion) {
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

test('F0 physics: failed durable save becomes AT_RISK and blocks lifecycle close', async () => {
  const dir = sandbox();
  const target = path.join(dir, 'scene.txt');
  fs.writeFileSync(target, 'before');
  const failingAdapter = {
    ...fsp,
    async open() {
      throw new Error('simulated write denial');
    },
  };

  await assert.rejects(
    durableSaveTransaction({ filePath: target, content: 'after', revision: 2, fsAdapter: failingAdapter }),
    (error) => error.code === 'E_SAVE_TEMP_WRITE' && error.phase === 'TEMP_WRITE',
  );
  assert.equal(fs.readFileSync(target, 'utf8'), 'before');

  const ack = classifySaveAck({
    writeSucceeded: false,
    ackOutcome: ACK_OUTCOMES.CLEAR_DIRTY,
    savedGeneration: 2,
    latestEditGeneration: 2,
  });
  assert.equal(ack.kind, SAVE_ACK_KINDS.AT_RISK);
  const state = applySaveAck({ latestEditGeneration: 2, ackedGeneration: 1 }, ack);
  assert.equal(deriveDirty(state), true);
  const lifecycle = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT,
    subjectId: LIFECYCLE_SUBJECT,
    latestEditGeneration: state.latestEditGeneration,
    ackedGeneration: state.ackedGeneration,
    saveReceipt: createSaveReceipt({
      subjectId: LIFECYCLE_SUBJECT,
      observationGeneration: state.latestEditGeneration,
      ack,
    }),
    outboxObservation: createDetachedOutboxObservation({
      subjectId: LIFECYCLE_SUBJECT,
      observationGeneration: state.latestEditGeneration,
    }),
  });
  assert.equal(lifecycle.reason, LIFECYCLE_REASONS.AT_RISK_WRITE_FAILURE);
  assert.equal(lifecycle.allowed, false);
});

test('F0 physics: pending outbox effect blocks crash recovery until published', async () => {
  const dir = sandbox();
  const box = await openTransactionalInboxOutbox(dir);
  await box.admitIntent({ intentId: 'intent-1', kind: 'project.commit', payload: { revision: 1 } });
  await box.markExecuted('intent-1', { revision: 1 });
  await box.stageEffect({ intentId: 'intent-1', effectId: 'effect-1', kind: 'fs.write' });

  const blockedBox = await openTransactionalInboxOutbox(dir);
  const blocked = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    subjectId: LIFECYCLE_SUBJECT,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    outboxObservation: createFreshOutboxObservation({
      subjectId: LIFECYCLE_SUBJECT,
      observationGeneration: 1,
      inboxOutbox: blockedBox,
    }),
    diskObservation: cleanDiskObservation(1),
  });
  assert.equal(blocked.reason, LIFECYCLE_REASONS.PENDING_EFFECT_REPLAY_REQUIRED);
  assert.equal(blocked.allowed, false);

  await box.markEffectPublished('effect-1');
  const allowedBox = await openTransactionalInboxOutbox(dir);
  const allowed = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    subjectId: LIFECYCLE_SUBJECT,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    outboxObservation: createFreshOutboxObservation({
      subjectId: LIFECYCLE_SUBJECT,
      observationGeneration: 1,
      inboxOutbox: allowedBox,
    }),
    diskObservation: cleanDiskObservation(1),
  });
  assert.equal(allowed.reason, LIFECYCLE_REASONS.RECOVERY_CLEAN);
  assert.equal(allowed.allowed, true);
});

test('F0 physics: denied path capability prevents any save attempt at escaped target', async () => {
  const root = sandbox();
  const outside = sandbox();
  const escaped = path.join(outside, 'escaped.txt');
  const verdict = resolveWithinCapabilityRoots(escaped, [root]);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'E_CAP_ESCAPE');
  if (verdict.ok) {
    await durableSaveTransaction({ filePath: verdict.canonicalPath, content: 'must not happen', revision: 1 });
  }
  assert.equal(fs.existsSync(escaped), false, 'denied capability cannot create escaped target');
});

test('F0 physics: checkpoint tamper cannot restore or change migrated project bytes', async () => {
  const dir = sandbox();
  const projectPath = path.join(dir, 'project.json');
  const storeDir = path.join(dir, '.r6');
  fs.writeFileSync(projectPath, '{"schemaVersion":"v1","projectId":"project-f0","title":"Draft"}\n');
  const migrated = await migrateProjectFile({
    projectPath,
    storeDir,
    targetVersion: 'v3',
    migrations: linearMigrations(3),
  });
  const migratedBytes = fs.readFileSync(projectPath, 'utf8');
  assert.equal(JSON.parse(migratedBytes).schemaVersion, 'v3');

  fs.writeFileSync(
    path.join(storeDir, CHECKPOINT_DIRNAME, `${migrated.checkpoint.checkpointId}.json`),
    '{"schemaVersion":"v1","projectId":"project-f0","tampered":true}\n',
  );
  await assert.rejects(
    restoreCheckpoint({ projectPath, storeDir, checkpointId: migrated.checkpoint.checkpointId }),
    (error) => error.code === 'E_R6_CHECKPOINT_DIGEST_MISMATCH',
  );
  assert.equal(fs.readFileSync(projectPath, 'utf8'), migratedBytes);
});
