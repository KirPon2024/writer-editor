'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { fixture, historyInput } = require('../fixtures/r24-wp803-descriptive-history-fixtures.js');
const modulePromise = import('../../src/core/descriptive-history-v1.mjs');
test('WP803 fresh-process ledger reopen reconstructs identical history and WP802 Merkle identity', async t => {
  const { directory, input } = await fixture(t); const { buildPulseDescriptiveHistory: build } = await modulePromise;
  const before = build(input);
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/core/pulse-ledger-v1.mjs')).href;
  const snapshot = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', 'const {openPulseLedger}=await import(process.argv[1]);const ledger=await openPulseLedger(process.argv[2]);process.stdout.write(JSON.stringify(await ledger.snapshot()));', moduleUrl, directory], { encoding: 'utf8', timeout: 15000 }));
  const { recomputePulseFormulas } = await import('../../src/core/pulse-formulas-v1.mjs');
  assert.deepEqual(build(historyInput(snapshot)), before); assert.equal(before.merkleRoot, recomputePulseFormulas(snapshot).merkleRoot);
});
test('WP803 old projections and declarations fail after a real ledger append', async t => {
  const { ledger, input } = await fixture(t); const { buildPulseDescriptiveHistory: build, assertPulseDescriptiveHistoryCurrent: current } = await modulePromise;
  const old = build(input); const { createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  await ledger.appendReceipt({ idempotencyKey: 'wp803-next', expectedSequence: 3, receipt: createPulseAggregateReceipt({ sourceRevisionOrdinal: 34, generation: 5, aggregates: [{ metricId: 'WORDS_ADDED_COUNT', value: 1 }] }) });
  const next = await ledger.snapshot(); const newer = historyInput(next);
  assert.throws(() => current(old, newer.currentIdentity), /E_WP803_PROJECTION_STALE/u);
  assert.throws(() => build({ ...newer, declarationSnapshot: input.declarationSnapshot }), /E_WP803_DECLARATION_STALE/u);
  assert.equal(build(newer).rows.length, 4);
});
test('WP803 rejects tampered aggregate receipts through the existing ledger validator', async t => {
  const { input } = await fixture(t); const { buildPulseDescriptiveHistory: build } = await modulePromise;
  const bad = structuredClone(input); bad.ledgerSnapshot.entries[0].receipt.aggregates[0].value += 1;
  assert.throws(() => build(bad), /E_WP802_LEDGER_RECEIPT/u);
});
