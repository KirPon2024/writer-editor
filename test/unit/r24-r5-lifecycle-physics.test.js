'use strict';

// R2.4 R5 physics: lifecycle barriers consume real R4 pending effects and
// physical disk digest observations without acquiring write authority.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { classifySaveAck } = require('../../src/core/dirty-admission-v1.cjs');
const { ACK_OUTCOMES } = require('../../src/core/autosave-generation-v1.cjs');
const { commitProjectTextAndManifest } = require('../../src/core/project-commit-v1.cjs');
const { openTransactionalInboxOutbox } = require('../../src/core/transactional-inbox-outbox-v1.cjs');
const {
  LIFECYCLE_EVENTS,
  LIFECYCLE_REASONS,
  RECOVERY_ACTIONS,
  evaluateLifecycleBarrier,
} = require('../../src/core/lifecycle-conflict-v1.cjs');

const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r5-')));
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const digestFile = (filePath) => sha256hex(fs.readFileSync(filePath));
const persistManifest = async () => ({ persisted: true, manifest: { v: 1 } });

test('crash recovery blocks on real pending R4 outbox effects until replay publishes them', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  const box = await openTransactionalInboxOutbox(dir);
  const committed = await commitProjectTextAndManifest({
    scenePath,
    sceneContent: 'payload-v1',
    revision: 1,
    persistManifest,
    intentInbox: box,
    intentId: 'commit-scene-1',
  });
  await box.stageEffect({ intentId: 'commit-scene-1', effectId: 'effect-sync-manifest', kind: 'fs.write', detail: { path: 'manifest' } });

  const blocked = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    pendingEffects: box.pendingEffects(),
    committedDigest: committed.sceneDigest,
    observedDiskDigest: digestFile(scenePath),
  });
  assert.equal(blocked.reason, LIFECYCLE_REASONS.PENDING_EFFECT_REPLAY_REQUIRED);
  assert.deepEqual(blocked.recoveryActions, [RECOVERY_ACTIONS.REPLAY_PENDING_EFFECTS, RECOVERY_ACTIONS.KEEP_OPEN]);

  await box.markEffectPublished('effect-sync-manifest');
  const recovered = await openTransactionalInboxOutbox(dir);
  const allowed = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    pendingEffects: recovered.pendingEffects(),
    committedDigest: committed.sceneDigest,
    observedDiskDigest: digestFile(scenePath),
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.reason, LIFECYCLE_REASONS.RECOVERY_CLEAN);
});

test('physical external edit changes disk digest and forces fork/compare recovery choices', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  fs.writeFileSync(scenePath, 'committed text');
  const committedDigest = digestFile(scenePath);
  fs.writeFileSync(scenePath, 'externally edited text');
  const observedDigest = digestFile(scenePath);

  const decision = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    latestEditGeneration: 2,
    ackedGeneration: 2,
    committedDigest,
    observedDiskDigest: observedDigest,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, LIFECYCLE_REASONS.EXTERNAL_DIVERGENCE_DETECTED);
  assert.deepEqual(decision.recoveryActions, [
    RECOVERY_ACTIONS.FORK_RECOVERY_COPY,
    RECOVERY_ACTIONS.COMPARE_EXTERNAL_EDIT,
    RECOVERY_ACTIONS.KEEP_AUTHORING_DRAFT,
  ]);
});

test('quit with dirty or at-risk P1 lifecycle state never claims safe close', () => {
  const dirty = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT,
    latestEditGeneration: 7,
    ackedGeneration: 6,
  });
  assert.equal(dirty.allowed, false);
  assert.equal(dirty.reason, LIFECYCLE_REASONS.UNSAVED_AUTHORING_WORK);

  const atRiskAck = classifySaveAck({
    writeSucceeded: false,
    ackOutcome: ACK_OUTCOMES.KEEP_DIRTY_UNBOUND,
    savedGeneration: null,
    latestEditGeneration: 7,
  });
  const atRisk = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT,
    latestEditGeneration: 7,
    ackedGeneration: 7,
    saveAck: atRiskAck,
  });
  assert.equal(atRisk.allowed, false);
  assert.equal(atRisk.reason, LIFECYCLE_REASONS.AT_RISK_WRITE_FAILURE);
});
