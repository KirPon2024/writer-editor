'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'lifecycle-conflict-v1.cjs');
const MUTANTS = [
  { id: 'unknown-event-allowed', find: "  if (!EVENT_SET.has(event)) throw new LifecycleConflictError('E_LIFECYCLE_EVENT_UNKNOWN', String(eventKind));", replace: "  if (false) throw new LifecycleConflictError('E_LIFECYCLE_EVENT_UNKNOWN', String(eventKind));" },
  { id: 'missing-evidence-allowed', find: "    decision: LIFECYCLE_DECISIONS.BLOCKED,\n    reason: LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE,", replace: "    decision: LIFECYCLE_DECISIONS.ALLOW,\n    reason: LIFECYCLE_REASONS.SAFE_TO_CLOSE," },
  { id: 'save-ack-validation-removed', find: "    applySaveAck(coordinates, receipt.ack);", replace: "    void coordinates;" },
  { id: 'save-ack-latest-binding-removed', find: "    if (normalizeGeneration(receipt.ack.latestEditGeneration, 'saveAck.latestEditGeneration') !== generation) {", replace: "    if (false) {" },
  { id: 'fresh-outbox-brand-removed', find: "    if (!FRESH_OUTBOX_OBSERVATIONS.has(receipt)) throw new LifecycleConflictError('E_LIFECYCLE_OUTBOX_NOT_FRESH');", replace: "    if (false) throw new LifecycleConflictError('E_LIFECYCLE_OUTBOX_NOT_FRESH');" },
  { id: 'external-p3-recovery-ignored', find: "  const recoveryRequired = !CLEAN_P3_CLASSIFICATIONS.has(receipt.p3Classification);", replace: "  const recoveryRequired = eventKind === LIFECYCLE_EVENTS.CRASH_RECOVERY && !CLEAN_P3_CLASSIFICATIONS.has(receipt.p3Classification);" },
  { id: 'crash-fresh-outbox-removed', find: "    if (eventKind === LIFECYCLE_EVENTS.CRASH_RECOVERY) throw new LifecycleConflictError('E_LIFECYCLE_CRASH_OUTBOX_NOT_FRESH');", replace: "    if (false) throw new LifecycleConflictError('E_LIFECYCLE_CRASH_OUTBOX_NOT_FRESH');" },
  { id: 'divergence-priority-removed', find: "    if (disk.diverged) {", replace: "    if (false) {" },
  { id: 'p3-recovery-hazard-removed', find: "    if (disk.recoveryRequired) hazards.push('PROJECT_RECOVERY');", replace: "    if (false) hazards.push('PROJECT_RECOVERY');" },
  { id: 'pending-hazard-removed', find: "    if (effects.length > 0) hazards.push('PENDING_EFFECTS');", replace: "    if (false) hazards.push('PENDING_EFFECTS');" },
  { id: 'dirty-hazard-removed', find: "    if (dirty) hazards.push('UNSAVED_AUTHORING');", replace: "    if (false) hazards.push('UNSAVED_AUTHORING');" },
];

function killOracle(module) {
  const { LIFECYCLE_EVENTS, LIFECYCLE_REASONS, OUTBOX_OBSERVATION_SOURCES, createSaveReceipt, createDetachedOutboxObservation, createFreshOutboxObservation, evaluateLifecycleBarrier } = module;
  const subjectId = 'p/d';
  const digest = 'a'.repeat(64);
  const saved = { kind: 'SAVED', reason: '', savedGeneration: 1, latestEditGeneration: 1 };
  const saveReceipt = createSaveReceipt({ subjectId, observationGeneration: 1, ack: saved });
  const detached = createDetachedOutboxObservation({ subjectId, observationGeneration: 1 });
  const disk = (classification = 'NEW_COMMITTED', observed = digest) => ({
    schemaVersion: 'yalken.lifecycleDiskObservation.v1', subjectId, observationGeneration: 1,
    committedDigest: digest, observedDiskDigest: observed, p3Classification: classification,
  });
  const fresh = (pendingEffects = []) => createFreshOutboxObservation({
    subjectId,
    observationGeneration: 1,
    inboxOutbox: {
      replay: () => ({
        schemaVersion: 'yalken.transactionalInboxOutbox.v1',
        outboxDigest: 'b'.repeat(64),
        effects: pendingEffects.map(({ effectId, intentId }) => ({ effectId, intentId, status: 'PENDING' })),
      }),
      pendingEffects: () => pendingEffects,
    },
  });

  assert.throws(() => evaluateLifecycleBarrier({ eventKind: 'BAD', subjectId, latestEditGeneration: 1, ackedGeneration: 1 }), (e) => e.code === 'E_LIFECYCLE_EVENT_UNKNOWN');
  const missing = evaluateLifecycleBarrier({ eventKind: LIFECYCLE_EVENTS.QUIT, subjectId, latestEditGeneration: 1, ackedGeneration: 1 });
  assert.equal(missing.allowed, false);
  assert.equal(missing.reason, LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE);
  assert.equal(evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT, subjectId, latestEditGeneration: 1, ackedGeneration: 1,
    saveReceipt: createSaveReceipt({ subjectId, observationGeneration: 1, ack: { kind: 'UNKNOWN', latestEditGeneration: 1 } }), outboxObservation: detached,
  }).reason, LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE);
  assert.equal(evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT, subjectId, latestEditGeneration: 1, ackedGeneration: 1,
    saveReceipt: createSaveReceipt({
      subjectId,
      observationGeneration: 1,
      ack: { kind: 'SAVED', reason: '', savedGeneration: 1, latestEditGeneration: 99 },
    }),
    outboxObservation: detached,
  }).reason, LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE);
  const forgedFresh = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    subjectId,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    outboxObservation: {
      schemaVersion: 'yalken.lifecycleOutboxObservation.v1',
      subjectId,
      observationGeneration: 1,
      source: OUTBOX_OBSERVATION_SOURCES.R4_FRESH_REOPEN,
      outboxDigest: 'b'.repeat(64),
      pendingEffects: [],
    },
    diskObservation: disk(),
  });
  assert.equal(forgedFresh.reason, LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE);
  assert.equal(evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY, subjectId, latestEditGeneration: 1, ackedGeneration: 1,
    outboxObservation: detached, diskObservation: disk(),
  }).reason, LIFECYCLE_REASONS.EVIDENCE_UNAVAILABLE);
  assert.equal(evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT, subjectId, latestEditGeneration: 1, ackedGeneration: 1,
    saveReceipt, outboxObservation: fresh([{ intentId: 'i', effectId: 'e', status: 'PENDING' }]), diskObservation: disk('NEW_COMMITTED', 'c'.repeat(64)),
  }).reason, LIFECYCLE_REASONS.EXTERNAL_DIVERGENCE_DETECTED);
  assert.equal(evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY, subjectId, latestEditGeneration: 1, ackedGeneration: 1,
    outboxObservation: fresh(), diskObservation: disk('RESUMABLE_PREPARED'),
  }).reason, LIFECYCLE_REASONS.PROJECT_RECOVERY_REQUIRED);
  assert.equal(evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT, subjectId, latestEditGeneration: 1, ackedGeneration: 1,
    outboxObservation: fresh([{ intentId: 'i', effectId: 'e', status: 'PENDING' }]), diskObservation: disk(),
  }).reason, LIFECYCLE_REASONS.PENDING_EFFECT_REPLAY_REQUIRED);
  assert.equal(evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT, subjectId, latestEditGeneration: 1, ackedGeneration: 0,
    outboxObservation: detached, diskObservation: disk(),
  }).reason, LIFECYCLE_REASONS.UNSAVED_AUTHORING_WORK);
  assert.equal(evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT, subjectId, latestEditGeneration: 1, ackedGeneration: 1,
    outboxObservation: detached, diskObservation: disk('RESUMABLE_PREPARED'),
  }).reason, LIFECYCLE_REASONS.PROJECT_RECOVERY_REQUIRED);
}

test('R5 lifecycle conflict: all evidence and hazard mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    assert.equal(source.split(mutant.find).length - 1, 1, 'mutant anchor must be unique: ' + mutant.id);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r5-mutant-'));
    for (const basename of ['lifecycle-conflict-v1.cjs', 'dirty-admission-v1.cjs', 'autosave-generation-v1.cjs', 'revision-algebra-v1.cjs']) {
      const src = path.join(__dirname, '..', '..', 'src', 'core', basename);
      fs.writeFileSync(path.join(dir, basename), basename === 'lifecycle-conflict-v1.cjs' ? source.replace(mutant.find, mutant.replace) : fs.readFileSync(src));
    }
    let killed = false;
    let detail = '';
    try { killOracle(require(path.join(dir, 'lifecycle-conflict-v1.cjs'))); detail = 'survived'; }
    catch (error) { killed = true; detail = error.code || error.message; }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((result) => !result.killed);
  console.log('R24_R5_MUTATION_RECEIPT=' + JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: (results.length - survived.length) / results.length }));
  assert.deepEqual(survived, []);
});
