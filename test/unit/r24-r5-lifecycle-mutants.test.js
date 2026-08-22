'use strict';

// R2.4 R5 implementation mutation suite for lifecycle/external conflict law.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'lifecycle-conflict-v1.cjs');

const MUTANTS = [
  {
    id: 'unknown-event-allowed',
    find: "  if (!EVENT_SET.has(event)) throw new LifecycleConflictError('E_LIFECYCLE_EVENT_UNKNOWN', String(eventKind));",
    replace: "  if (false) throw new LifecycleConflictError('E_LIFECYCLE_EVENT_UNKNOWN', String(eventKind));",
  },
  {
    id: 'at-risk-ignored',
    find: "  if (saveAck && saveAck.kind === SAVE_ACK_KINDS.AT_RISK) {",
    replace: "  if (false && saveAck && saveAck.kind === SAVE_ACK_KINDS.AT_RISK) {",
  },
  {
    id: 'pending-effects-ignored',
    find: '  if (effects.length > 0) {',
    replace: '  if (false && effects.length > 0) {',
  },
  {
    id: 'divergence-ignored',
    find: '  if (diverged) {',
    replace: '  if (false && diverged) {',
  },
  {
    id: 'dirty-ignored',
    find: '  if (dirty) {',
    replace: '  if (false && dirty) {',
  },
];

function killOracle(module) {
  const {
    LIFECYCLE_EVENTS,
    LIFECYCLE_REASONS,
    RECOVERY_ACTIONS,
    evaluateLifecycleBarrier,
  } = module;

  assert.throws(
    () => evaluateLifecycleBarrier({ eventKind: 'BAD_EVENT', latestEditGeneration: 0, ackedGeneration: 0 }),
    (e) => e.code === 'E_LIFECYCLE_EVENT_UNKNOWN',
  );

  const atRisk = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.QUIT,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    saveAck: { kind: 'AT_RISK' },
  });
  assert.equal(atRisk.reason, LIFECYCLE_REASONS.AT_RISK_WRITE_FAILURE);
  assert.deepEqual(atRisk.recoveryActions, [RECOVERY_ACTIONS.KEEP_OPEN, RECOVERY_ACTIONS.SAVE_BEFORE_CLOSE]);

  const pending = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    pendingEffects: [{ intentId: 'intent-1', effectId: 'effect-1', status: 'PENDING' }],
  });
  assert.equal(pending.reason, LIFECYCLE_REASONS.PENDING_EFFECT_REPLAY_REQUIRED);

  const diverged = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    committedDigest: 'a'.repeat(64),
    observedDiskDigest: 'b'.repeat(64),
  });
  assert.equal(diverged.reason, LIFECYCLE_REASONS.EXTERNAL_DIVERGENCE_DETECTED);
  assert.deepEqual(diverged.recoveryActions, [
    RECOVERY_ACTIONS.FORK_RECOVERY_COPY,
    RECOVERY_ACTIONS.COMPARE_EXTERNAL_EDIT,
    RECOVERY_ACTIONS.KEEP_AUTHORING_DRAFT,
  ]);

  const dirty = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.SUSPEND,
    latestEditGeneration: 2,
    ackedGeneration: 1,
  });
  assert.equal(dirty.reason, LIFECYCLE_REASONS.UNSAVED_AUTHORING_WORK);
  assert.equal(dirty.allowed, false);
}

test('R5 lifecycle conflict: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r5-mutant-'));
    for (const basename of ['lifecycle-conflict-v1.cjs', 'dirty-admission-v1.cjs', 'autosave-generation-v1.cjs', 'revision-algebra-v1.cjs']) {
      const src = path.join(__dirname, '..', '..', 'src', 'core', basename);
      const content = basename === 'lifecycle-conflict-v1.cjs'
        ? source.replace(mutant.find, mutant.replace)
        : fs.readFileSync(src);
      fs.writeFileSync(path.join(dir, basename), content);
    }
    let killed = false;
    let detail = '';
    try {
      killOracle(require(path.join(dir, 'lifecycle-conflict-v1.cjs')));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_R5_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
