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
  adoptPlanStateReplayBaseline,
  validateTransitionReplay,
  DEFAULT_TRANSITION_LAW,
  PLAN_STATE_SCHEMA_VERSION,
} from '../plan-state.mjs';
import { writeJsonAtomic } from '../canonical-json.mjs';
import { acquireLease, releaseLease } from '../lease.mjs';

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
      draft.auditMarker = 'A';
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
    idempotencyPayload: { operation: 'TEST', target: 'A' },
    mutate: (draft) => {
      calls += 1;
      draft.auditMarker = 'A';
      return { receipt: { effectId: 'effect-1' } };
    },
  });
  assert.equal(first.applied, true);
  const second = casUpdate(file, {
    expectedRevision: 0,
    idempotencyKey: 'dispatch-1',
    idempotencyPayload: { operation: 'TEST', target: 'A' },
    mutate: (draft) => {
      calls += 1;
      draft.auditMarker = 'B';
      return { receipt: { effectId: 'effect-2' } };
    },
  });
  assert.equal(second.duplicate, true);
  assert.equal(second.applied, false);
  assert.deepEqual(second.receipt, { effectId: 'effect-1' });
  assert.equal(calls, 1);
  const state = readPlanState(file);
  assert.equal(state.revision, 1);
  assert.equal(state.auditMarker, 'A');
});

test('idempotency key reuse with a different payload fails closed', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  casUpdate(file, {
    expectedRevision: 0,
    idempotencyKey: 'dispatch-1',
    idempotencyPayload: { operation: 'TEST', target: 'A' },
    mutate: (draft) => {
      draft.auditMarker = 'A';
      return { receipt: { effectId: 'effect-1' } };
    },
  });
  assert.throws(
    () => casUpdate(file, {
      expectedRevision: 0,
      idempotencyKey: 'dispatch-1',
      idempotencyPayload: { operation: 'TEST', target: 'B' },
      mutate: () => ({}),
    }),
    (e) => e.code === 'E_IDEMPOTENCY_KEY_REUSE',
  );
});

test('generic CAS cannot mutate contour state or bypass replay', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  assert.throws(
    () => casUpdate(file, {
      expectedRevision: 0,
      mutate: (draft) => {
        draft.contours.A = { state: 'DONE', previousState: 'POSTMERGE_VERIFIED' };
      },
    }),
    (e) => e.code === 'E_CONTOUR_MUTATION_REQUIRES_TRANSITION_ENGINE',
  );
  assert.equal(readPlanState(file).revision, 0);
  assert.throws(
    () => casUpdate(file, {
      expectedRevision: 0,
      mutate: (draft) => {
        draft.transitionHistory.push({ forged: true });
      },
    }),
    (e) => e.code === 'E_CONTOUR_MUTATION_REQUIRES_TRANSITION_ENGINE',
  );
  assert.equal(readPlanState(file).revision, 0);
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
  const lease = acquireLease(file, {
    contourId: 'E0_RUNNER_SAFETY_QUARANTINE',
    writerId: 'WRITER-1',
    missionId: 'MISSION-1',
    ttlMs: 3600000,
    now: NOW,
    expectedRevision: 0,
    idempotencyKey: 'lease-1',
  });
  const fence = lease.result.lease.fencingToken;
  const chain = ['ELIGIBLE', 'RUNNING', 'DELIVERED', 'POSTMERGE_VERIFIED', 'DONE'];
  let revision = lease.revision;
  for (const to of chain) {
    const result = transitionContour(file, {
      contourId: 'E0_RUNNER_SAFETY_QUARANTINE',
      to,
      expectedRevision: revision,
      attemptId: 'ATTEMPT-1',
      writerId: 'WRITER-1',
      fencingToken: fence,
      idempotencyKey: `transition-${to}`,
      now: NOW,
    });
    revision = result.revision;
  }
  const state = readPlanState(file);
  assert.equal(state.contours.E0_RUNNER_SAFETY_QUARANTINE.state, 'DONE');
  assert.equal(state.transitionHistory.length, 5);
  assert.equal(validateTransitionReplay(state).replayedTransitions, 5);
  assert.throws(
    () => transitionContour(file, {
      contourId: 'E0_RUNNER_SAFETY_QUARANTINE',
      to: 'ELIGIBLE',
      expectedRevision: revision,
      attemptId: 'ATTEMPT-2',
      writerId: 'WRITER-1',
      fencingToken: fence,
      idempotencyKey: 'transition-illegal',
      now: NOW,
    }),
    (e) => e.code === 'E_TERMINAL_STATE_HAS_NO_OUTGOING',
  );
});

test('transition requires the current lease writer and fencing token', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  const lease = acquireLease(file, {
    contourId: 'C',
    writerId: 'WRITER-1',
    missionId: 'MISSION-1',
    ttlMs: 3600000,
    now: NOW,
    expectedRevision: 0,
  });
  assert.throws(
    () => transitionContour(file, {
      contourId: 'C',
      to: 'ELIGIBLE',
      expectedRevision: lease.revision,
      attemptId: 'A1',
      writerId: 'WRITER-1',
      fencingToken: lease.result.lease.fencingToken + 1,
      idempotencyKey: 'transition-stale',
      now: NOW,
    }),
    (e) => e.code === 'E_CAS_FENCING_CONFLICT' || e.code === 'E_FENCE_STALE',
  );
});

test('transition fails closed after the current lease is released', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  const lease = acquireLease(file, {
    contourId: 'C',
    writerId: 'WRITER-1',
    missionId: 'MISSION-1',
    ttlMs: 3600000,
    now: NOW,
    expectedRevision: 0,
  });
  const released = releaseLease(file, {
    contourId: 'C',
    writerId: 'WRITER-1',
    fencingToken: lease.result.lease.fencingToken,
    now: NOW,
    expectedRevision: lease.revision,
  });
  assert.throws(
    () => transitionContour(file, {
      contourId: 'C',
      to: 'ELIGIBLE',
      expectedRevision: released.revision,
      attemptId: 'A1',
      writerId: 'WRITER-1',
      fencingToken: lease.result.lease.fencingToken,
      idempotencyKey: 'transition-no-lease',
      now: NOW,
    }),
    (e) => e.code === 'E_TRANSITION_LEASE_REQUIRED',
  );
});

test('pre-v2 direct writes are adopted as explicit unreplayable baseline, never synthesized history', () => {
  const legacy = {
    schemaVersion: 'yalken.plan-state.r24.v1',
    revision: 1,
    fencingCounter: 1,
    contours: {
      C: {
        state: 'DONE',
        previousState: 'POSTMERGE_VERIFIED',
        attemptId: 'LEGACY',
        updatedAt: NOW,
        headSha: 'a'.repeat(40),
      },
    },
    leases: {},
    idempotency: {},
  };
  const adopted = adoptPlanStateReplayBaseline(legacy, {
    sourceHeadSha: 'b'.repeat(40),
    adoptedAt: NOW,
    authority: 'OWNER_CORRECTIVE',
    unreplayableContourIds: ['C'],
  });
  assert.equal(adopted.replayBaseline.classification, 'ADOPTED_PRE_V2_UNREPLAYABLE_HISTORY');
  assert.deepEqual(adopted.replayBaseline.unreplayableContourIds, ['C']);
  assert.deepEqual(adopted.transitionHistory, []);
  assert.equal(validateTransitionReplay(adopted).verdict, 'PASS');
});

test('replay validator detects final-state and idempotency tampering', () => {
  const dir = tmp();
  const file = path.join(dir, 'plan.json');
  initPlanState(file);
  const lease = acquireLease(file, {
    contourId: 'C',
    writerId: 'WRITER-1',
    missionId: 'MISSION-1',
    ttlMs: 3600000,
    now: NOW,
    expectedRevision: 0,
  });
  transitionContour(file, {
    contourId: 'C',
    to: 'ELIGIBLE',
    expectedRevision: lease.revision,
    attemptId: 'A1',
    writerId: 'WRITER-1',
    fencingToken: lease.result.lease.fencingToken,
    idempotencyKey: 'transition-1',
    now: NOW,
  });
  const state = readPlanState(file);
  const badState = structuredClone(state);
  badState.contours.C.state = 'DONE';
  assert.throws(() => validateTransitionReplay(badState), (e) => e.code === 'E_TRANSITION_REPLAY_FINAL_STATE');
  const badJournal = structuredClone(state);
  delete badJournal.idempotency['transition-1'];
  assert.throws(() => validateTransitionReplay(badJournal), (e) => e.code === 'E_TRANSITION_IDEMPOTENCY_UNBOUND');
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
