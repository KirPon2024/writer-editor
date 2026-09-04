const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { aggregateInputs } = require('../fixtures/r24-wp801-pulse-ledger-fixtures.js');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wp801-integration-'));

test('WP801 reopens the durable ledger and serializes competing handles with CAS', async () => {
  const { createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const { openPulseLedger } = await import('../../src/core/pulse-ledger-v1.mjs');
  const dir = temp();
  const left = await openPulseLedger(dir);
  const right = await openPulseLedger(dir);
  const receipt = createPulseAggregateReceipt(aggregateInputs[0]);
  const outcomes = await Promise.allSettled([
    left.appendReceipt({ idempotencyKey: 'left', expectedSequence: 0, receipt }),
    right.appendReceipt({ idempotencyKey: 'right', expectedSequence: 0, receipt }),
  ]);
  assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
  assert.match(outcomes.find((item) => item.status === 'rejected').reason.message, /E_WP801_CAS_MISMATCH/u);
  const reopened = await openPulseLedger(dir);
  assert.equal((await reopened.snapshot()).sequence, 1);
});

for (const failAt of [1, 2, 3, 4, 5]) {
  test(`WP801 recovers an acknowledged-write loss at durable phase ${failAt}`, async () => {
    const { durableSaveTransaction } = require('../../src/core/save-coordinator-v1.cjs');
    const { createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
    const { openPulseLedger } = await import('../../src/core/pulse-ledger-v1.mjs');
    const dir = temp();
    let calls = 0;
    const failAfterWrite = async (operation) => {
      const result = await durableSaveTransaction(operation);
      calls += 1;
      if (calls === failAt) throw Object.assign(new Error(`injected-${failAt}`), { code: 'E_INJECTED_ACK_LOSS' });
      return result;
    };
    const ledger = await openPulseLedger(dir, { saveTransaction: failAfterWrite });
    await assert.rejects(
      ledger.appendReceipt({ idempotencyKey: `recover-${failAt}`, expectedSequence: 0, receipt: createPulseAggregateReceipt(aggregateInputs[0]) }),
      (error) => error.code === 'E_INJECTED_ACK_LOSS',
    );
    const recovered = await openPulseLedger(dir);
    const snapshot = await recovered.snapshot();
    assert.equal(snapshot.sequence, 1);
    assert.equal((await recovered.appendReceipt({ idempotencyKey: `recover-${failAt}`, expectedSequence: 0, receipt: createPulseAggregateReceipt(aggregateInputs[0]) })).status, 'IDEMPOTENT_REPLAY');
  });
}

test('WP801 repairs only an invalid torn final tail', async () => {
  const { createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const { openPulseLedger } = await import('../../src/core/pulse-ledger-v1.mjs');
  const dir = temp();
  const ledger = await openPulseLedger(dir);
  await ledger.appendReceipt({ idempotencyKey: 'torn-tail', expectedSequence: 0, receipt: createPulseAggregateReceipt(aggregateInputs[0]) });
  fs.appendFileSync(ledger.paths.outbox, '{\"schemaVersion\":');
  const reopened = await openPulseLedger(dir);
  assert.equal((await reopened.snapshot()).sequence, 1);
  assert.equal(fs.readFileSync(ledger.paths.outbox, 'utf8').endsWith('\n'), true);
});
