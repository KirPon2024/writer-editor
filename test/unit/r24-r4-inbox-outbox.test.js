'use strict';

// R2.4 R4 inbox/outbox law: idempotent intent admission, typed conflicts,
// effect lifecycle, crash-tail repair, corruption refusal and deterministic
// replay.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  INBOX_OUTBOX_SCHEMA_VERSION,
  INBOX_BASENAME,
  OUTBOX_BASENAME,
  InboxOutboxError,
  openTransactionalInboxOutbox,
} = require(path.join(__dirname, '..', '..', 'src', 'core', 'transactional-inbox-outbox-v1.cjs'));
const { durableSaveTransaction } = require(path.join(__dirname, '..', '..', 'src', 'core', 'save-coordinator-v1.cjs'));

const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r4-')));

test('intent admission is idempotent: direct duplicate typed, conflicting key typed', async () => {
  const box = await openTransactionalInboxOutbox(sandbox());
  const admitted = await box.admitIntent({ intentId: 'i-1', kind: 'project.commit', payload: { a: 1, b: 2 } });
  assert.equal(admitted.status, 'ADMITTED');
  await assert.rejects(
    box.admitIntent({ intentId: 'i-1', kind: 'project.commit', payload: { b: 2, a: 1 } }),
    (e) => e instanceof InboxOutboxError && e.code === 'E_INTENT_DUPLICATE',
    'canonical payload identity makes key order irrelevant for same meaning',
  );
  await assert.rejects(
    box.admitIntent({ intentId: 'i-1', kind: 'project.commit', payload: { a: 2, b: 2 } }),
    (e) => e.code === 'E_INTENT_CONFLICT',
    'the same key carrying a different payload is a conflict, never a silent overwrite',
  );
  await assert.rejects(box.admitIntent({ intentId: ' ', kind: 'x' }), (e) => e.code === 'E_INTENT_ID_REQUIRED');
  await assert.rejects(box.admitIntent({ intentId: 'i-2', kind: ' ' }), (e) => e.code === 'E_INTENT_KIND_REQUIRED');
});

test('ensureIntentAdmitted is idempotent for same meaning and refuses conflicts', async () => {
  const box = await openTransactionalInboxOutbox(sandbox());
  await box.admitIntent({
    intentId: 'i-canonical',
    kind: 'project.commit',
    payload: { left: { a: 1, b: 2 }, z: [2, 1] },
  });
  const ensured = await box.ensureIntentAdmitted({
    intentId: 'i-canonical',
    kind: 'project.commit',
    payload: { z: [2, 1], left: { b: 2, a: 1 } },
  });
  assert.equal(ensured.status, 'ADMITTED');
  await assert.rejects(
    box.ensureIntentAdmitted({
      intentId: 'i-canonical',
      kind: 'project.commit',
      payload: { z: [2, 1], left: { b: 3, a: 1 } },
    }),
    (e) => e.code === 'E_INTENT_CONFLICT',
  );
  await assert.rejects(
    box.ensureIntentAdmitted({ intentId: 'i-bad', kind: 'project.commit', payload: { bad: Number.NaN } }),
    (e) => e.code === 'E_JSON_PAYLOAD_INVALID',
    'non-json payloads never enter the durable log',
  );
  const cyclic = { ok: true };
  cyclic.self = cyclic;
  await assert.rejects(
    box.ensureIntentAdmitted({ intentId: 'i-cycle', kind: 'project.commit', payload: cyclic }),
    (e) => e.code === 'E_JSON_PAYLOAD_INVALID',
    'cyclic payloads are typed refusals, not stack failures',
  );
});

test('execution is recorded exactly once and replay never re-executes', async () => {
  const box = await openTransactionalInboxOutbox(sandbox());
  await box.admitIntent({ intentId: 'i-1', kind: 'project.commit' });
  assert.equal(box.isExecuted('i-1'), false);
  await box.markExecuted('i-1', { revision: 1 });
  assert.equal(box.isExecuted('i-1'), true);
  await assert.rejects(box.markExecuted('i-1', { revision: 2 }), (e) => e.code === 'E_INTENT_ALREADY_EXECUTED');
  await assert.rejects(box.markExecuted('ghost', {}), (e) => e.code === 'E_INTENT_UNKNOWN');
});

test('effect lifecycle: staging requires execution, publish is once, pending recovery is exact', async () => {
  const dir = sandbox();
  const box = await openTransactionalInboxOutbox(dir);
  await assert.rejects(
    box.stageEffect({ intentId: 'i-0', effectId: 'e-0', kind: 'fs.write' }),
    (e) => e.code === 'E_INTENT_NOT_EXECUTED',
    'an effect for an unexecuted intent never stages',
  );
  await box.admitIntent({ intentId: 'i-1', kind: 'project.commit' });
  await assert.rejects(
    box.stageEffect({ intentId: 'i-1', effectId: 'e-9', kind: 'fs.write' }),
    (e) => e.code === 'E_INTENT_NOT_EXECUTED',
    'admitted-but-unexecuted is still not executable authority',
  );
  await box.markExecuted('i-1', { revision: 1 });
  await assert.rejects(box.stageEffect({ intentId: 'i-1', effectId: 'e-bad', kind: ' ' }), (e) => e.code === 'E_EFFECT_KIND_REQUIRED');
  await box.stageEffect({ intentId: 'i-1', effectId: 'e-1', kind: 'fs.write' });
  await box.stageEffect({ intentId: 'i-1', effectId: 'e-2', kind: 'fs.write' });
  assert.deepEqual(box.pendingEffects().map((e) => e.effectId), ['e-1', 'e-2']);
  await assert.rejects(box.stageEffect({ intentId: 'i-1', effectId: 'e-1', kind: 'fs.write' }), (e) => e.code === 'E_EFFECT_ALREADY_STAGED');
  await box.markEffectPublished('e-1');
  assert.deepEqual(box.pendingEffects().map((e) => e.effectId), ['e-2'], 'only the unpublished effect remains pending');
  await assert.rejects(box.markEffectPublished('e-1'), (e) => e.code === 'E_EFFECT_ALREADY_PUBLISHED', 'no double publication');

  const reopened = await openTransactionalInboxOutbox(dir);
  assert.deepEqual(reopened.pendingEffects().map((e) => e.effectId), ['e-2'], 'the pending set survives reopen exactly');
  assert.equal(reopened.isExecuted('i-1'), true);
});

test('replay is deterministic and carries schema identity', async () => {
  const dir = sandbox();
  const box = await openTransactionalInboxOutbox(dir);
  await box.admitIntent({ intentId: 'i-1', kind: 'project.commit' });
  await box.markExecuted('i-1', { revision: 1 });
  await box.stageEffect({ intentId: 'i-1', effectId: 'e-1', kind: 'fs.write' });
  const first = box.replay();
  const reopened = await openTransactionalInboxOutbox(dir);
  const second = reopened.replay();
  assert.equal(first.schemaVersion, INBOX_OUTBOX_SCHEMA_VERSION);
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)), 'replay after reopen is identical');
  assert.equal(first.inboxDigest, second.inboxDigest);
  assert.equal(first.outboxDigest, second.outboxDigest);
  assert.deepEqual(first.intents, [{ intentId: 'i-1', kind: 'project.commit', status: 'EXECUTED' }]);
  assert.deepEqual(first.effects, [{ effectId: 'e-1', intentId: 'i-1', status: 'PENDING' }]);
});

test('torn log tails are durable truncation points, never admitted or pending truth', async () => {
  const dir = sandbox();
  const box = await openTransactionalInboxOutbox(dir);
  await box.admitIntent({ intentId: 'i-1', kind: 'project.commit' });
  fs.appendFileSync(box.inboxPath, '{"intentId":"i-2","kind":"pro');
  const reopened = await openTransactionalInboxOutbox(dir);
  assert.equal(reopened.isAdmitted('i-1'), true);
  assert.equal(reopened.isAdmitted('i-2'), false, 'the torn intent was never admitted');
  assert.equal(fs.readFileSync(reopened.inboxPath, 'utf8').includes('i-2'), false, 'the torn inbox tail was removed durably');

  await reopened.markExecuted('i-1', { revision: 1 });
  await reopened.stageEffect({ intentId: 'i-1', effectId: 'e-1', kind: 'fs.write' });
  fs.appendFileSync(reopened.outboxPath, '{"effectId":"e-2","status":"PEN');
  const repaired = await openTransactionalInboxOutbox(dir);
  assert.deepEqual(repaired.pendingEffects().map((effect) => effect.effectId), ['e-1']);
  assert.equal(fs.readFileSync(repaired.outboxPath, 'utf8').includes('e-2'), false, 'the torn outbox tail was removed durably');
});

test('valid-looking corrupt records are refused, not silently normalized', async () => {
  const dir = sandbox();
  fs.writeFileSync(path.join(dir, INBOX_BASENAME), `${JSON.stringify({
    schemaVersion: INBOX_OUTBOX_SCHEMA_VERSION,
    intentId: 'i-1',
    kind: 'project.commit',
    payloadHash: '0'.repeat(64),
    status: 'MAYBE',
    outcome: null,
  })}\n`);
  await assert.rejects(openTransactionalInboxOutbox(dir), (e) => e.code === 'E_INBOX_LOG_CORRUPT');

  const outboxDir = sandbox();
  const box = await openTransactionalInboxOutbox(outboxDir);
  await box.admitIntent({ intentId: 'i-1', kind: 'project.commit' });
  await box.markExecuted('i-1', { revision: 1 });
  fs.writeFileSync(path.join(outboxDir, OUTBOX_BASENAME), `${JSON.stringify({
    schemaVersion: INBOX_OUTBOX_SCHEMA_VERSION,
    intentId: 'i-1',
    effectId: 'e-1',
    kind: 'fs.write',
    detail: null,
    status: 'MAYBE',
  })}\n`);
  await assert.rejects(openTransactionalInboxOutbox(outboxDir), (e) => e.code === 'E_OUTBOX_LOG_CORRUPT');
});

function faultableSaveTransaction() {
  let failureMode = null;
  return {
    failNext(mode) {
      failureMode = mode;
    },
    async saveTransaction(input) {
      if (failureMode === 'BEFORE_PUBLISH') {
        failureMode = null;
        const error = new Error('injected pre-publish failure');
        error.code = 'E_INJECTED_BEFORE_PUBLISH';
        throw error;
      }
      const receipt = await durableSaveTransaction(input);
      if (failureMode === 'AFTER_PUBLISH') {
        failureMode = null;
        const error = new Error('injected post-publish failure');
        error.code = 'E_INJECTED_AFTER_PUBLISH';
        throw error;
      }
      return receipt;
    },
  };
}

async function assertMemoryMatchesDisk(dir, box) {
  const reopened = await openTransactionalInboxOutbox(dir);
  assert.deepEqual(
    JSON.parse(JSON.stringify(box.replay())),
    JSON.parse(JSON.stringify(reopened.replay())),
    'the live object and durable replay must agree after a failed call',
  );
}

test('pre-publish persistence failures leave every live transition at durable pre-call state', async () => {
  const dir = sandbox();
  const fault = faultableSaveTransaction();
  const box = await openTransactionalInboxOutbox(dir, { saveTransaction: fault.saveTransaction });

  fault.failNext('BEFORE_PUBLISH');
  await assert.rejects(
    box.admitIntent({ intentId: 'i-1', kind: 'project.commit' }),
    (error) => error.code === 'E_INJECTED_BEFORE_PUBLISH',
  );
  assert.equal(box.isAdmitted('i-1'), false);
  await assertMemoryMatchesDisk(dir, box);

  await box.admitIntent({ intentId: 'i-1', kind: 'project.commit' });
  fault.failNext('BEFORE_PUBLISH');
  await assert.rejects(box.markExecuted('i-1', { revision: 1 }), (error) => error.code === 'E_INJECTED_BEFORE_PUBLISH');
  assert.equal(box.isExecuted('i-1'), false);
  await assertMemoryMatchesDisk(dir, box);

  await box.markExecuted('i-1', { revision: 1 });
  fault.failNext('BEFORE_PUBLISH');
  await assert.rejects(
    box.stageEffect({ intentId: 'i-1', effectId: 'e-1', kind: 'fs.write' }),
    (error) => error.code === 'E_INJECTED_BEFORE_PUBLISH',
  );
  assert.deepEqual(box.pendingEffects(), []);
  await assertMemoryMatchesDisk(dir, box);

  await box.stageEffect({ intentId: 'i-1', effectId: 'e-1', kind: 'fs.write' });
  fault.failNext('BEFORE_PUBLISH');
  await assert.rejects(box.markEffectPublished('e-1'), (error) => error.code === 'E_INJECTED_BEFORE_PUBLISH');
  assert.deepEqual(box.pendingEffects().map((effect) => effect.effectId), ['e-1']);
  await assertMemoryMatchesDisk(dir, box);
});

test('post-publish failures reconcile every live transition to exact durable state', async () => {
  const dir = sandbox();
  const fault = faultableSaveTransaction();
  const box = await openTransactionalInboxOutbox(dir, { saveTransaction: fault.saveTransaction });

  fault.failNext('AFTER_PUBLISH');
  await assert.rejects(
    box.admitIntent({ intentId: 'i-1', kind: 'project.commit' }),
    (error) => error.code === 'E_INJECTED_AFTER_PUBLISH',
  );
  assert.equal(box.isAdmitted('i-1'), true);
  await assertMemoryMatchesDisk(dir, box);

  fault.failNext('AFTER_PUBLISH');
  await assert.rejects(box.markExecuted('i-1', { revision: 1 }), (error) => error.code === 'E_INJECTED_AFTER_PUBLISH');
  assert.equal(box.isExecuted('i-1'), true);
  await assertMemoryMatchesDisk(dir, box);

  fault.failNext('AFTER_PUBLISH');
  await assert.rejects(
    box.stageEffect({ intentId: 'i-1', effectId: 'e-1', kind: 'fs.write' }),
    (error) => error.code === 'E_INJECTED_AFTER_PUBLISH',
  );
  assert.deepEqual(box.pendingEffects().map((effect) => effect.effectId), ['e-1']);
  await assertMemoryMatchesDisk(dir, box);

  fault.failNext('AFTER_PUBLISH');
  await assert.rejects(box.markEffectPublished('e-1'), (error) => error.code === 'E_INJECTED_AFTER_PUBLISH');
  assert.deepEqual(box.pendingEffects(), []);
  await assertMemoryMatchesDisk(dir, box);
});

test('same-process handles serialize mutations without lost durable records', async () => {
  const dir = sandbox();
  let saveCall = 0;
  const saveTransaction = async (input) => {
    saveCall += 1;
    if (saveCall === 1) await new Promise((resolve) => setTimeout(resolve, 50));
    return durableSaveTransaction(input);
  };
  const first = await openTransactionalInboxOutbox(dir, { saveTransaction });
  const second = await openTransactionalInboxOutbox(dir, { saveTransaction });
  await Promise.all([
    first.admitIntent({ intentId: 'i-1', kind: 'project.commit' }),
    second.admitIntent({ intentId: 'i-2', kind: 'project.commit' }),
  ]);
  const reopened = await openTransactionalInboxOutbox(dir);
  assert.equal(reopened.isAdmitted('i-1'), true);
  assert.equal(reopened.isAdmitted('i-2'), true);
  assert.deepEqual(reopened.replay().intents.map((intent) => intent.intentId), ['i-1', 'i-2']);
});

test('returned outcome and effect detail are deep immutable snapshots', async () => {
  const dir = sandbox();
  const box = await openTransactionalInboxOutbox(dir);
  await box.admitIntent({ intentId: 'i-immutable', kind: 'project.commit' });
  const executed = await box.markExecuted('i-immutable', { nested: { revision: 1 } });
  assert.throws(() => {
    executed.outcome.nested.revision = 9;
  }, TypeError);
  const staged = await box.stageEffect({
    intentId: 'i-immutable',
    effectId: 'e-immutable',
    kind: 'fs.write',
    detail: { nested: { pathClass: 'project-relative' } },
  });
  assert.throws(() => {
    staged.detail.nested.pathClass = 'external';
  }, TypeError);
  const reopened = await openTransactionalInboxOutbox(dir);
  assert.equal(reopened.isExecuted('i-immutable'), true);
  assert.deepEqual(reopened.pendingEffects()[0].detail, { nested: { pathClass: 'project-relative' } });
});

test('Unicode intent and JSON payload identity round-trip without normalization loss', async () => {
  const dir = sandbox();
  const box = await openTransactionalInboxOutbox(dir);
  const intentId = '\u0441\u0446\u0435\u043d\u0430-e\u0301-\u6587';
  await box.admitIntent({
    intentId,
    kind: 'project.commit.\u6587',
    payload: {
      title: 'Cafe\u0301',
      author: '\u041a\u0438\u0440\u0438\u043b\u043b',
      marks: ['\u2713', '\u6587'],
    },
  });
  const reopened = await openTransactionalInboxOutbox(dir);
  assert.equal(reopened.isAdmitted(intentId), true);
  await assert.rejects(
    reopened.admitIntent({
      intentId,
      kind: 'project.commit.\u6587',
      payload: {
        title: 'Caf\u00e9',
        author: '\u041a\u0438\u0440\u0438\u043b\u043b',
        marks: ['\u2713', '\u6587'],
      },
    }),
    (error) => error.code === 'E_INTENT_CONFLICT',
    'distinct Unicode code-point sequences are never silently normalized into one command meaning',
  );
});
