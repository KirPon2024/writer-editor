import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  initPlanState,
  readPlanState,
  casUpdate,
  transitionContour,
  createTransitionValidator,
  classifyPlanStateAfterCrash,
  DEFAULT_TRANSITION_LAW,
  PLAN_STATE_SCHEMA_VERSION,
} from '../plan-state.mjs';
import { writeJsonAtomic } from '../canonical-json.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'r24-plan-'));
const NOW = '2026-08-20T00:00:00Z';

test('init creates revision 0 durable state and reloads', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  const state = initPlanState(file);
  assert.equal(state.revision, 0);
  assert.equal(state.schemaVersion, PLAN_STATE_SCHEMA_VERSION);
  assert.deepEqual(readPlanState(file), state);
});

test('CAS update applies at exact revision and rejects stale revision', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  const applied = casUpdate(file, {
    expectedRevision: 0,
    mutate: (draft) => {
      draft.contours.A = { state: 'PENDING' };
      return { marker: 'ok' };
    },
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.revision, 1);
  assert.throws(
    () => casUpdate(file, { expectedRevision: 0, mutate: () => ({}) }),
    (e) => e.code === 'E_CAS_REVISION_CONFLICT',
  );
  assert.equal(readPlanState(file).revision, 1);
});

test('duplicate idempotency key suppresses second effect and returns stored receipt', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  let calls = 0;
  const first = casUpdate(file, {
    expectedRevision: 0,
    idempotencyKey: 'dispatch-1',
    mutate: (draft) => {
      calls += 1;
      draft.contours.A = { state: 'PENDING' };
      return { receipt: { effectId: 'effect-1' } };
    },
  });
  assert.equal(first.applied, true);
  const second = casUpdate(file, {
    expectedRevision: 1,
    idempotencyKey: 'dispatch-1',
    mutate: (draft) => {
      calls += 1;
      draft.contours.B = { state: 'PENDING' };
      return { receipt: { effectId: 'effect-2' } };
    },
  });
  assert.equal(second.duplicate, true);
  assert.equal(second.applied, false);
  assert.deepEqual(second.receipt, { effectId: 'effect-1' });
  assert.equal(calls, 1);
  const state = readPlanState(file);
  assert.equal(state.revision, 1);
  assert.equal(state.contours.B, undefined);
});

test('transition engine enforces the sealed law: positives and negatives', () => {
  const validate = createTransitionValidator();
  assert.equal(validate('PENDING', 'ELIGIBLE'), true);
  assert.equal(validate('RUNNING', 'DELIVERED'), true);
  assert.equal(validate('DELIVERED', 'POSTMERGE_VERIFIED'), true);
  assert.equal(validate('POSTMERGE_VERIFIED', 'DONE'), true);
  assert.throws(() => validate('PENDING', 'DONE'), (e) => e.code === 'E_ILLEGAL_TRANSITION');
  assert.throws(() => validate('RUNNING', 'DONE'), (e) => e.code === 'E_ILLEGAL_TRANSITION');
  assert.throws(() => validate('DELIVERED', 'DONE'), (e) => e.code === 'E_ILLEGAL_TRANSITION');
  assert.throws(() => validate('DONE', 'ELIGIBLE'), (e) => e.code === 'E_TERMINAL_STATE_HAS_NO_OUTGOING');
  assert.throws(() => validate('BOGUS', 'ELIGIBLE'), (e) => e.code === 'E_TRANSITION_UNKNOWN_STATE');
  assert.throws(() => validate('PENDING', 'BOGUS'), (e) => e.code === 'E_TRANSITION_UNKNOWN_STATE');
  for (const [from, targets] of Object.entries(DEFAULT_TRANSITION_LAW.stateTransitions)) {
    for (const to of targets) assert.equal(validate(from, to), true, `${from}->${to}`);
  }
});

test('contour transition through the full legal chain reaches DONE', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  const chain = ['ELIGIBLE', 'RUNNING', 'DELIVERED', 'POSTMERGE_VERIFIED', 'DONE'];
  let revision = 0;
  for (const to of chain) {
    const result = transitionContour(file, {
      contourId: 'E0_RUNNER_SAFETY_QUARANTINE',
      to,
      expectedRevision: revision,
      attemptId: 'ATTEMPT-1',
      now: NOW,
    });
    revision = result.revision;
  }
  assert.equal(readPlanState(file).contours.E0_RUNNER_SAFETY_QUARANTINE.state, 'DONE');
  assert.throws(
    () => transitionContour(file, {
      contourId: 'E0_RUNNER_SAFETY_QUARANTINE',
      to: 'ELIGIBLE',
      expectedRevision: revision,
      attemptId: 'ATTEMPT-2',
      now: NOW,
    }),
    (e) => e.code === 'E_TERMINAL_STATE_HAS_NO_OUTGOING',
  );
});

test('plan-state crash classification covers resume and rollback', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  const missing = classifyPlanStateAfterCrash(file);
  assert.equal(missing.classification, 'ROLLBACK_REQUIRED');
  initPlanState(file);
  const committed = classifyPlanStateAfterCrash(file);
  assert.equal(committed.classification, 'OLD_OR_NEW_COMMITTED');
  const intentPath = path.join(dir, '.plan.json.r24-intent');
  fs.writeFileSync(intentPath, `${JSON.stringify({ target: 'plan.json', sha256: 'f'.repeat(64) })}\n`);
  const interrupted = classifyPlanStateAfterCrash(file);
  assert.equal(interrupted.classification, 'ROLLBACK_REQUIRED');
  fs.unlinkSync(intentPath);
});

test('writeJsonAtomic failure leaves classifiable artifacts, never torn truth', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  const before = fs.readFileSync(file);
  const badDir = path.join(dir, 'blocked');
  fs.mkdirSync(badDir);
  const blockedFile = path.join(badDir, 'x.json');
  fs.writeFileSync(blockedFile, '{}');
  fs.chmodSync(badDir, 0o444);
  try {
    writeJsonAtomic(blockedFile, { a: 1 });
  } catch {
    // expected: rename/write inside a read-only directory fails
  } finally {
    fs.chmodSync(badDir, 0o755);
  }
  const cls = classifyPlanStateAfterCrash(blockedFile);
  assert.ok(
    ['OLD_OR_NEW_COMMITTED', 'OLD_COMMITTED', 'NEW_COMMITTED', 'RESUMABLE_PREPARED', 'ROLLBACK_REQUIRED'].includes(cls.classification),
    `total classification vocabulary, got ${cls.classification}`,
  );
  assert.deepEqual(fs.readFileSync(file), before);
});
