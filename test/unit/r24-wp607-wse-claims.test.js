const assert = require('node:assert/strict');
const test = require('node:test');
const { makeWp607Input } = require('../fixtures/r24-wp607-wse-claims-fixtures.js');

test('WP607 emits four deterministic status-first claim views', async () => {
  const { assertWseClaimsCurrent, buildWseClaims } = await import('../../src/core/wse-claims-v1.mjs');
  const value = buildWseClaims(makeWp607Input());
  assert.deepEqual(value.viewOrder, ['userJobs', 'noBloat', 'corpus', 'hardLimits']);
  assert.equal(value.denominator.modules, 4);
  assert.equal(value.denominator.views, 4);
  assert.equal(value.denominator.claimRows, 16);
  for (const viewId of value.viewOrder) {
    assert.equal(value.views[viewId].denominator, 4);
    assert.equal(value.views[viewId].rows.length, 4);
    assert.equal(value.views[viewId].failCount, 0);
  }
  assert.equal(value.views.userJobs.rows[0].status, 'PASS');
  assert.equal(value.views.noBloat.rows[0].reason, 'BOUNDED_READ_ONLY_MODULE_CONTRACT');
  assert.equal(value.views.hardLimits.rows[0].status, 'PASS');
  assert.equal(value.authority.productMutation, false);
  assert.equal(value.privacy.sourceContentIncluded, false);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(buildWseClaims(makeWp607Input()).projectionDigest, value.projectionDigest);
  assert.equal(assertWseClaimsCurrent(value, makeWp607Input().currentIdentity), true);
});

test('WP607 abstains on empty or degraded corpus without false PASS', async () => {
  const { buildWseClaims } = await import('../../src/core/wse-claims-v1.mjs');
  const input = makeWp607Input();
  input.modules[0] = { ...input.modules[0], state: 'empty', inputCount: 0, visibleCount: 0 };
  input.modules[1] = { ...input.modules[1], state: 'degraded' };
  const value = buildWseClaims(input);
  assert.equal(value.state, 'degraded');
  assert.equal(value.views.corpus.rows[0].status, 'ABSTAIN');
  assert.equal(value.views.corpus.rows[0].reason, 'EMPTY_CORPUS');
  assert.equal(value.views.corpus.rows[1].status, 'ABSTAIN');
  assert.equal(value.views.corpus.rows[1].reason, 'CORPUS_NOT_FULLY_CURRENT');
  assert.equal(value.views.corpus.passCount, 2);
  assert.equal(value.views.corpus.abstainCount, 2);
});

test('WP607 sorts modules canonically and bounds each visible view', async () => {
  const { buildWseClaims } = await import('../../src/core/wse-claims-v1.mjs');
  const input = makeWp607Input({ rowLimit: 2 });
  input.modules.reverse();
  const value = buildWseClaims(input);
  assert.deepEqual(value.views.userJobs.rows.map((row) => row.moduleId), ['stateEvidence', 'threadsExplanation']);
  assert.equal(value.views.userJobs.denominator, 4);
  assert.equal(value.views.userJobs.visibleCount, 2);
  assert.equal(value.views.userJobs.omittedCount, 2);
});
