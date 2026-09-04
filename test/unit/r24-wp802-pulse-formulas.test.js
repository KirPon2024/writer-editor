const assert = require('node:assert/strict');
const test = require('node:test');
const { buildPulseLedgerFixture } = require('../fixtures/r24-wp802-pulse-formulas-fixtures.js');

const byId = (projection) => Object.fromEntries(projection.values.map(({ formulaId, value }) => [formulaId, value]));

test('WP802 deterministically recomputes the admitted versioned formula set', async () => {
  const { snapshot } = await buildPulseLedgerFixture();
  const {
    PULSE_FORMULA_SET_DIGEST,
    PULSE_FORMULA_VERSION,
    recomputePulseFormulas,
  } = await import('../../src/core/pulse-formulas-v1.mjs');
  const projection = recomputePulseFormulas(snapshot);
  assert.equal(projection.formulaVersion, PULSE_FORMULA_VERSION);
  assert.equal(projection.formulaSetDigest, PULSE_FORMULA_SET_DIGEST);
  assert.equal(projection.throughSequence, 3);
  assert.equal(projection.ledgerHeadDigest, snapshot.headDigest);
  assert.deepEqual(byId(projection), {
    ACTIVE_WRITING_SECONDS: 300,
    SCENES_EDITED_COUNT: 2,
    SESSIONS_COMPLETED_COUNT: 1,
    WORDS_ADDED_COUNT: 300,
    WORDS_DELETED_COUNT: 13,
    NET_WORDS_COUNT: 287,
    WORDS_ADDED_PER_ACTIVE_HOUR_MILLI: 3_600_000,
  });
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.values), true);
  assert.deepEqual(recomputePulseFormulas(snapshot), projection);
});

test('WP802 checkpoint-assisted recomputation is identical to full recomputation', async () => {
  const { snapshot } = await buildPulseLedgerFixture();
  const { createPulseFormulaCheckpoint, recomputePulseFormulas } = await import('../../src/core/pulse-formulas-v1.mjs');
  const checkpoint = createPulseFormulaCheckpoint(snapshot, { throughSequence: 2 });
  assert.equal(checkpoint.throughSequence, 2);
  assert.equal(checkpoint.ledgerHeadDigest, snapshot.entries[1].entryDigest);
  assert.equal(Object.isFrozen(checkpoint.values), true);
  assert.deepEqual(recomputePulseFormulas(snapshot, { checkpoint }), recomputePulseFormulas(snapshot));
});

test('WP802 binds empty, single-leaf and odd-leaf Merkle roots deterministically', async () => {
  const { snapshot } = await buildPulseLedgerFixture();
  const {
    PULSE_FORMULA_EMPTY_MERKLE_ROOT,
    computePulseLedgerMerkleRoot,
    createPulseFormulaCheckpoint,
  } = await import('../../src/core/pulse-formulas-v1.mjs');
  assert.equal(computePulseLedgerMerkleRoot(snapshot, { throughSequence: 0 }), PULSE_FORMULA_EMPTY_MERKLE_ROOT);
  assert.equal(computePulseLedgerMerkleRoot(snapshot, { throughSequence: 1 }), createPulseFormulaCheckpoint(snapshot, { throughSequence: 1 }).merkleRoot);
  assert.equal(computePulseLedgerMerkleRoot(snapshot), createPulseFormulaCheckpoint(snapshot).merkleRoot);
  assert.notEqual(computePulseLedgerMerkleRoot(snapshot, { throughSequence: 2 }), computePulseLedgerMerkleRoot(snapshot));
});

test('WP802 emits a stable zero projection for an empty ledger', async () => {
  const { snapshot } = await buildPulseLedgerFixture([]);
  const { PULSE_FORMULA_EMPTY_MERKLE_ROOT, createPulseFormulaCheckpoint, recomputePulseFormulas } = await import('../../src/core/pulse-formulas-v1.mjs');
  const projection = recomputePulseFormulas(snapshot);
  assert.equal(projection.throughSequence, 0);
  assert.equal(projection.merkleRoot, PULSE_FORMULA_EMPTY_MERKLE_ROOT);
  assert.equal(projection.values.every(({ value }) => value === 0), true);
  assert.equal(createPulseFormulaCheckpoint(snapshot).merkleRoot, PULSE_FORMULA_EMPTY_MERKLE_ROOT);
});

test('WP802 rejects unknown versions, invalid options and out-of-range prefixes', async () => {
  const { snapshot } = await buildPulseLedgerFixture();
  const { computePulseLedgerMerkleRoot, createPulseFormulaCheckpoint, recomputePulseFormulas } = await import('../../src/core/pulse-formulas-v1.mjs');
  assert.throws(() => recomputePulseFormulas(snapshot, { formulaVersion: 'PULSE_FORMULAS_V2' }), /E_WP802_FORMULA_VERSION/u);
  assert.throws(() => createPulseFormulaCheckpoint(snapshot, { throughSequence: 4 }), /E_WP802_CHECKPOINT_SEQUENCE/u);
  assert.throws(() => computePulseLedgerMerkleRoot(snapshot, { throughSequence: -1 }), /E_WP802_MERKLE_SEQUENCE/u);
  assert.throws(() => recomputePulseFormulas(snapshot, { hidden: true }), /E_WP802_OPTIONS/u);
});
