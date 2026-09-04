const assert = require('node:assert/strict');
const test = require('node:test');
const { aggregateInputs, buildPulseLedgerFixture } = require('../fixtures/r24-wp802-pulse-formulas-fixtures.js');

test('WP802 reuses a certified prefix checkpoint after the WP801 ledger advances', async () => {
  const { createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const { createPulseFormulaCheckpoint, recomputePulseFormulas } = await import('../../src/core/pulse-formulas-v1.mjs');
  const { directory, ledger, snapshot: prefix } = await buildPulseLedgerFixture(aggregateInputs.slice(0, 2));
  const checkpoint = createPulseFormulaCheckpoint(prefix);
  await ledger.appendReceipt({
    idempotencyKey: 'wp802-3',
    expectedSequence: 2,
    receipt: createPulseAggregateReceipt(aggregateInputs[2]),
  });
  const advanced = await ledger.snapshot();
  const assisted = recomputePulseFormulas(advanced, { checkpoint });
  assert.deepEqual(assisted, recomputePulseFormulas(advanced));
  assert.equal(assisted.throughSequence, 3);

  const { openPulseLedger } = await import('../../src/core/pulse-ledger-v1.mjs');
  const reopened = await openPulseLedger(directory);
  assert.deepEqual(recomputePulseFormulas(await reopened.snapshot(), { checkpoint }), assisted);
});

test('WP802 checkpoint cannot be replayed against a different immutable ledger prefix', async () => {
  const { aggregateInputs: wp801Inputs } = require('../fixtures/r24-wp801-pulse-ledger-fixtures.js');
  const { snapshot: left } = await buildPulseLedgerFixture(aggregateInputs.slice(0, 2));
  const { snapshot: right } = await buildPulseLedgerFixture(wp801Inputs);
  const { createPulseFormulaCheckpoint, recomputePulseFormulas } = await import('../../src/core/pulse-formulas-v1.mjs');
  const checkpoint = createPulseFormulaCheckpoint(left);
  assert.throws(() => recomputePulseFormulas(right, { checkpoint }), /E_WP802_CHECKPOINT_STALE/u);
});
