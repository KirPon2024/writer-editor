'use strict';

// R2.4 R4 implementation mutation suite for the inbox/outbox law.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'transactional-inbox-outbox-v1.cjs');
const { durableSaveTransaction } = require(path.join(__dirname, '..', '..', 'src', 'core', 'save-coordinator-v1.cjs'));

const MUTANTS = [
  {
    id: 'payload-order-not-canonical',
    find: '    for (const key of Object.keys(value).sort()) {',
    replace: '    for (const key of Object.keys(value)) {',
  },
  {
    id: 'duplicate-admitted',
    find: "        throw new InboxOutboxError('E_INTENT_DUPLICATE', id);",
    replace: "        return Object.freeze({ ...existing, redriven: true });",
  },
  {
    id: 'direct-conflict-tolerated',
    find: "        if (existing) {\n          if (existing.payloadHash !== digest || existing.kind !== intentKind) {\n            throw new InboxOutboxError('E_INTENT_CONFLICT', id);\n          }\n          throw new InboxOutboxError('E_INTENT_DUPLICATE', id);\n        }",
    replace: "        if (existing) {\n          if (false) {\n            throw new InboxOutboxError('E_INTENT_CONFLICT', id);\n          }\n          throw new InboxOutboxError('E_INTENT_DUPLICATE', id);\n        }",
  },
  {
    id: 'ensure-conflict-tolerated',
    find: "        if (existing) {\n          if (existing.payloadHash !== digest || existing.kind !== intentKind) {\n            throw new InboxOutboxError('E_INTENT_CONFLICT', id);\n          }\n          return publicIntent(existing);\n        }",
    replace: "        if (existing) {\n          if (false) {\n            throw new InboxOutboxError('E_INTENT_CONFLICT', id);\n          }\n          return publicIntent(existing);\n        }",
  },
  {
    id: 'double-execution-allowed',
    find: "      if (record.status === 'EXECUTED') throw new InboxOutboxError('E_INTENT_ALREADY_EXECUTED', id);",
    replace: "      if (false) { throw new InboxOutboxError('E_INTENT_ALREADY_EXECUTED', id); }",
  },
  {
    id: 'double-publication-allowed',
    find: "      if (effect.status === 'PUBLISHED') throw new InboxOutboxError('E_EFFECT_ALREADY_PUBLISHED', effectKey);",
    replace: "      if (false) { throw new InboxOutboxError('E_EFFECT_ALREADY_PUBLISHED', effectKey); }",
  },
  {
    id: 'staging-without-execution',
    find: "      if (!record || record.status !== 'EXECUTED') throw new InboxOutboxError('E_INTENT_NOT_EXECUTED', id);",
    replace: "      if (!record) throw new InboxOutboxError('E_INTENT_NOT_EXECUTED', id);",
  },
  {
    id: 'same-process-handle-serialization-removed',
    find: '    const predecessor = DIRECTORY_MUTATION_TAILS.get(directoryKey) || Promise.resolve();',
    replace: '    const predecessor = Promise.resolve();',
  },
  {
    id: 'durable-failure-reconciliation-removed',
    find: '        state[channel] = await readJsonl(filePath, validateRecord, corruptCode, saveTransaction);',
    replace: '        await readJsonl(filePath, validateRecord, corruptCode, saveTransaction);',
  },
  {
    id: 'successful-publish-not-reflected-in-memory',
    find: '      state[channel] = nextRecords;',
    replace: '      void nextRecords;',
  },
  {
    id: 'public-intent-outcome-alias',
    find: '    outcome: immutableJsonValue(record.outcome),',
    replace: '    outcome: record.outcome,',
  },
  {
    id: 'public-effect-detail-alias',
    find: '    detail: immutableJsonValue(effect.detail),',
    replace: '    detail: effect.detail,',
  },
];

async function killOracle(module) {
  const { openTransactionalInboxOutbox } = module;
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r4m-')));
  const box = await openTransactionalInboxOutbox(dir);

  await box.admitIntent({ intentId: 'i-1', kind: 'project.commit', payload: { a: 1, b: 2 } });
  assert.equal(box.isAdmitted('i-1'), true);
  await assert.rejects(
    box.admitIntent({ intentId: 'i-1', kind: 'project.commit', payload: { b: 2, a: 1 } }),
    (e) => e.code === 'E_INTENT_DUPLICATE',
  );
  await assert.rejects(
    box.admitIntent({ intentId: 'i-1', kind: 'project.commit', payload: { a: 2, b: 2 } }),
    (e) => e.code === 'E_INTENT_CONFLICT',
  );

  await box.admitIntent({
    intentId: 'i-canonical',
    kind: 'project.commit',
    payload: { left: { a: 1, b: 2 }, z: [2, 1] },
  });
  await box.ensureIntentAdmitted({
    intentId: 'i-canonical',
    kind: 'project.commit',
    payload: { z: [2, 1], left: { b: 2, a: 1 } },
  });
  await assert.rejects(
    box.ensureIntentAdmitted({
      intentId: 'i-canonical',
      kind: 'project.commit',
      payload: { z: [2, 1], left: { b: 3, a: 1 } },
    }),
    (e) => e.code === 'E_INTENT_CONFLICT',
  );

  const executed = await box.markExecuted('i-1', { revision: { value: 1 } });
  assert.throws(() => { executed.outcome.revision.value = 9; }, TypeError);
  await assert.rejects(box.markExecuted('i-1', { revision: 9 }), (e) => e.code === 'E_INTENT_ALREADY_EXECUTED');

  await assert.rejects(
    box.stageEffect({ intentId: 'i-ghost', effectId: 'e-ghost', kind: 'fs.write' }),
    (e) => e.code === 'E_INTENT_NOT_EXECUTED',
  );
  const box2 = await openTransactionalInboxOutbox(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r4m-b-'))));
  await box2.admitIntent({ intentId: 'i-9', kind: 'project.commit' });
  await assert.rejects(
    box2.stageEffect({ intentId: 'i-9', effectId: 'e-9', kind: 'fs.write' }),
    (e) => e.code === 'E_INTENT_NOT_EXECUTED',
    'an admitted-but-unexecuted intent never stages an effect',
  );
  await box2.markExecuted('i-9', {});
  const staged = await box2.stageEffect({
    intentId: 'i-9',
    effectId: 'e-9',
    kind: 'fs.write',
    detail: { nested: { value: 1 } },
  });
  assert.throws(() => { staged.detail.nested.value = 9; }, TypeError);
  await box2.markEffectPublished('e-9');
  await assert.rejects(box2.markEffectPublished('e-9'), (e) => e.code === 'E_EFFECT_ALREADY_PUBLISHED');

  const faultDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r4m-fault-')));
  let failureMode = null;
  const saveTransaction = async (input) => {
    if (failureMode === 'BEFORE') {
      failureMode = null;
      const error = new Error('injected before publish');
      error.code = 'E_INJECTED_BEFORE';
      throw error;
    }
    const receipt = await durableSaveTransaction(input);
    if (failureMode === 'AFTER') {
      failureMode = null;
      const error = new Error('injected after publish');
      error.code = 'E_INJECTED_AFTER';
      throw error;
    }
    return receipt;
  };
  const faultBox = await openTransactionalInboxOutbox(faultDir, { saveTransaction });
  await faultBox.admitIntent({ intentId: 'fault-intent', kind: 'project.commit' });
  failureMode = 'BEFORE';
  await assert.rejects(faultBox.markExecuted('fault-intent', {}), (e) => e.code === 'E_INJECTED_BEFORE');
  assert.equal(faultBox.isExecuted('fault-intent'), false);
  failureMode = 'AFTER';
  await assert.rejects(faultBox.markExecuted('fault-intent', {}), (e) => e.code === 'E_INJECTED_AFTER');
  assert.equal(faultBox.isExecuted('fault-intent'), true);
  const faultReopened = await openTransactionalInboxOutbox(faultDir);
  assert.equal(faultReopened.isExecuted('fault-intent'), true);

  const concurrentDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r4m-concurrent-')));
  let saveCall = 0;
  const delayedSave = async (input) => {
    saveCall += 1;
    if (saveCall === 1) await new Promise((resolve) => setTimeout(resolve, 40));
    return durableSaveTransaction(input);
  };
  const concurrentBoxA = await openTransactionalInboxOutbox(concurrentDir, { saveTransaction: delayedSave });
  const concurrentBoxB = await openTransactionalInboxOutbox(concurrentDir, { saveTransaction: delayedSave });
  await Promise.all([
    concurrentBoxA.admitIntent({ intentId: 'parallel-a', kind: 'project.commit' }),
    concurrentBoxB.admitIntent({ intentId: 'parallel-b', kind: 'project.commit' }),
  ]);
  const concurrentReopened = await openTransactionalInboxOutbox(concurrentDir);
  assert.equal(concurrentReopened.isAdmitted('parallel-a'), true);
  assert.equal(concurrentReopened.isAdmitted('parallel-b'), true);
}

test('R4 inbox/outbox: all implementation mutants are executed and killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  await killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r4-mutant-'));
    fs.copyFileSync(
      path.join(__dirname, '..', '..', 'src', 'core', 'save-coordinator-v1.cjs'),
      path.join(dir, 'save-coordinator-v1.cjs'),
    );
    const target = path.join(dir, 'transactional-inbox-outbox-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      await killOracle(require(target));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_R4_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
