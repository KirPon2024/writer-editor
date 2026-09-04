'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { fixture } = require('../fixtures/r24-wp803-descriptive-history-fixtures.js');
const sourcePath = path.resolve(__dirname, '../../src/core/descriptive-history-v1.mjs');
const modulePromise = import(pathToFileURL(sourcePath).href);

test('WP803 input negatives reject stale bindings, invented phase, duplicates and authority fields', async t => {
  const { input } = await fixture(t); const { buildPulseDescriptiveHistory: build } = await modulePromise;
  const negatives = [
    [x => { x.currentIdentity.ledgerHeadDigest = 'f'.repeat(64); }, /E_WP803_LEDGER_STALE/u],
    [x => { x.currentIdentity.generation++; }, /E_WP803_DECLARATION_STALE/u],
    [x => { x.declarationSnapshot.revisionOrdinal++; }, /E_WP803_DECLARATION_STALE/u],
    [x => { x.declarationSnapshot.entries[0].entryDigest = 'f'.repeat(64); }, /E_WP803_DECLARATION_ENTRY/u],
    [x => { x.declarationSnapshot.entries[1].sequence = 1; }, /E_WP803_DECLARATION_SEQUENCE/u],
    [x => { x.declarationSnapshot.entries[0].manualPhase = 'AUTOMATIC_BEST_PHASE'; }, /E_WP803_MANUAL_PHASE/u],
    [x => { x.declarationSnapshot.entries[0].title = 'private'; }, /E_WP803_DECLARATION_ROW/u],
    [x => { x.writeProject = true; }, /E_WP803_INPUT_FIELDS/u],
    [x => { x.declarationSnapshot.entries[0].sequence = 0; }, /E_WP803_DECLARATION_SEQUENCE/u],
    [x => { x.declarationSnapshot.entries = Array(4097).fill(null); }, /E_WP803_ARRAY_BOUND/u],
    [x => { delete x.declarationSnapshot.entries[0]; }, /E_WP803_ARRAY_BOUND/u],
    [x => { x[Symbol('authority')] = 1; }, /E_WP803_INPUT_SYMBOL/u],
    [x => { Object.defineProperty(x, 'secret', { value: 1 }); }, /E_WP803_INPUT_HIDDEN_FIELD/u],
  ];
  for (const [mutate, expected] of negatives) { const bad = structuredClone(input); mutate(bad); assert.throws(() => build(bad), expected); }
  let reads = 0; const accessor = structuredClone(input); Object.defineProperty(accessor, 'secret', { enumerable: true, get() { reads++; return 'private'; } });
  assert.throws(() => build(accessor), /E_WP803_INPUT_ACCESSOR/u); assert.equal(reads, 0);
});
test('WP803 consumer rejects stale declaration revision and projection tamper', async t => {
  const { input } = await fixture(t); const { buildPulseDescriptiveHistory: build, assertPulseDescriptiveHistoryCurrent: current } = await modulePromise; const p = build(input);
  for (const field of ['ledgerSequence', 'declarationRevisionOrdinal', 'generation']) assert.throws(() => current(p, { ...input.currentIdentity, [field]: input.currentIdentity[field] + 1 }), /E_WP803_PROJECTION_STALE/u);
  const bad = structuredClone(p); bad.rows[0].added.value++; assert.throws(() => current(bad, input.currentIdentity), /E_WP803_PROJECTION_TAMPER/u);
});
const mutations = [
  ['net sign', '(left, right) => add(left, -right)', '(left, right) => add(left, right)', (m, x) => assert.equal(m.buildPulseDescriptiveHistory(x).rows[0].net.value, 15)],
  ['touched operator', 'touched: combine(added, deleted, add)', 'touched: combine(added, deleted, (a, b) => add(a, -b))', (m, x) => assert.equal(m.buildPulseDescriptiveHistory(x).rows[0].touched.value, 25)],
  ['missing becomes zero', 'values.has(id) ? values.get(id) : null', 'values.has(id) ? values.get(id) : 0', (m, x) => assert.equal(m.buildPulseDescriptiveHistory(x).rows[2].deleted.value, null)],
  ['phase inference', "declaration?.manualPhase ?? null", "declaration?.manualPhase ?? 'DRAFTING'", (m, x) => assert.equal(m.buildPulseDescriptiveHistory(x).rows[2].manualPhase.value, null)],
  ['partial total overclaim', 'value: complete ? observedSubtotal : null', 'value: observedSubtotal', (m, x) => assert.equal(m.buildPulseDescriptiveHistory(x).summary.deleted.value, null)],
  ['origin laundering', "'EXPLICIT_LOCAL_DECLARATION'", "'LEDGER_AGGREGATE'", (m, x) => assert.equal(m.buildPulseDescriptiveHistory(x).rows[0].declaredTasks.origin, 'EXPLICIT_LOCAL_DECLARATION')],
  ['entry binding bypass', "if (row.entryDigest !== ledger.entries[row.sequence - 1].entryDigest)", 'if (false)', (m, x) => { x.declarationSnapshot.entries[0].entryDigest = 'f'.repeat(64); assert.throws(() => m.buildPulseDescriptiveHistory(x), /E_WP803_DECLARATION_ENTRY/u); }],
  ['current guard bypass', 'if (!sameIdentity(actual, expected))', 'if (false)', (m, x) => { const p = m.buildPulseDescriptiveHistory(x); assert.throws(() => m.assertPulseDescriptiveHistoryCurrent(p, { ...x.currentIdentity, generation: 99 }), /E_WP803_PROJECTION_STALE/u); }],
  ['digest guard bypass', 'if (hashCanonicalValue(payload) !== projectionDigest)', 'if (false)', (m, x) => { const p = structuredClone(m.buildPulseDescriptiveHistory(x)); p.rows[0].added.value++; assert.throws(() => m.assertPulseDescriptiveHistoryCurrent(p, x.currentIdentity), /E_WP803_PROJECTION_TAMPER/u); }],
  ['freeze removed', 'Object.freeze(value);', 'void value;', (m, x) => assert.ok(Object.isFrozen(m.buildPulseDescriptiveHistory(x).rows[0].added))],
];
for (const [name, from, to, oracle] of mutations) test('WP803 kills implementation mutant: ' + name, async t => {
  const { input } = await fixture(t); const original = await modulePromise; oracle(original, structuredClone(input));
  const source = fs.readFileSync(sourcePath, 'utf8'); assert.ok(source.includes(from), 'mutation site must exist');
  const mutated = source.replace(from, to).replace(/from '(\.\/[^']+)'/gu, (_, relative) => 'from ' + JSON.stringify(pathToFileURL(path.resolve(path.dirname(sourcePath), relative)).href));
  const implementation = await import('data:text/javascript;base64,' + Buffer.from(mutated).toString('base64'));
  assert.throws(() => oracle(implementation, structuredClone(input)), assert.AssertionError, 'real source mutant must be killed by behavioral oracle');
});
