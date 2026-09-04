const assert = require('node:assert/strict');
const test = require('node:test');
const { buildPulseLedgerFixture, overflowInputs } = require('../fixtures/r24-wp802-pulse-formulas-fixtures.js');

const clone = (value) => JSON.parse(JSON.stringify(value));

for (const [label, mutate, code] of [
  ['snapshot sequence', (value) => { value.sequence += 1; }, 'E_WP802_LEDGER_SEQUENCE'],
  ['snapshot head', (value) => { value.headDigest = '1'.repeat(64); }, 'E_WP802_LEDGER_HEAD'],
  ['entry sequence', (value) => { value.entries[0].sequence = 2; }, 'E_WP802_LEDGER_ENTRY'],
  ['entry chain', (value) => { value.entries[1].previousEntryDigest = '2'.repeat(64); }, 'E_WP802_LEDGER_CHAIN'],
  ['entry digest', (value) => { value.entries[0].entryDigest = '3'.repeat(64); }, 'E_WP802_LEDGER_ENTRY_DIGEST'],
  ['receipt digest', (value) => { value.entries[0].receiptDigest = '4'.repeat(64); }, 'E_WP802_LEDGER_RECEIPT_DIGEST'],
  ['receipt payload', (value) => { value.entries[0].receipt.aggregates[0].value += 1; }, 'E_WP802_LEDGER_RECEIPT'],
  ['unknown field', (value) => { value.untrusted = true; }, 'E_WP802_LEDGER_SNAPSHOT'],
]) {
  test(`WP802 kills ${label} mutant`, async () => {
    const { snapshot } = await buildPulseLedgerFixture();
    const { recomputePulseFormulas } = await import('../../src/core/pulse-formulas-v1.mjs');
    const mutant = clone(snapshot);
    mutate(mutant);
    assert.throws(() => recomputePulseFormulas(mutant), new RegExp(code, 'u'));
  });
}

test('WP802 rejects accessor and symbol-bearing inputs before interpretation', async () => {
  const { snapshot } = await buildPulseLedgerFixture();
  const { recomputePulseFormulas } = await import('../../src/core/pulse-formulas-v1.mjs');
  const accessor = clone(snapshot);
  Object.defineProperty(accessor, 'sequence', { enumerable: true, get() { throw new Error('getter executed'); } });
  assert.throws(() => recomputePulseFormulas(accessor), /E_WP802_INPUT_ACCESSOR/u);
  const symbol = clone(snapshot);
  symbol[Symbol('authority')] = true;
  assert.throws(() => recomputePulseFormulas(symbol), /E_WP802_INPUT_SYMBOL/u);
});

for (const [label, mutate, code] of [
  ['formula version', (value) => { value.formulaVersion = 'PULSE_FORMULAS_V2'; }, 'E_WP802_FORMULA_VERSION'],
  ['checkpoint digest', (value) => { value.checkpointDigest = '5'.repeat(64); }, 'E_WP802_CHECKPOINT_DIGEST'],
  ['Merkle root', (value) => { value.merkleRoot = '6'.repeat(64); }, 'E_WP802_CHECKPOINT_DIGEST'],
  ['formula value', (value) => { value.values[0].value += 1; }, 'E_WP802_CHECKPOINT_DIGEST'],
  ['through sequence', (value) => { value.throughSequence += 1; }, 'E_WP802_CHECKPOINT_DIGEST'],
]) {
  test(`WP802 kills ${label} checkpoint mutant`, async () => {
    const { snapshot } = await buildPulseLedgerFixture();
    const { createPulseFormulaCheckpoint, recomputePulseFormulas } = await import('../../src/core/pulse-formulas-v1.mjs');
    const mutant = clone(createPulseFormulaCheckpoint(snapshot, { throughSequence: 2 }));
    mutate(mutant);
    assert.throws(() => recomputePulseFormulas(snapshot, { checkpoint: mutant }), new RegExp(code, 'u'));
  });
}

test('WP802 rejects a formula result outside the safe integer domain', async () => {
  const { snapshot } = await buildPulseLedgerFixture(overflowInputs);
  const { recomputePulseFormulas } = await import('../../src/core/pulse-formulas-v1.mjs');
  assert.throws(() => recomputePulseFormulas(snapshot), /E_WP802_FORMULA_OVERFLOW/u);
});
