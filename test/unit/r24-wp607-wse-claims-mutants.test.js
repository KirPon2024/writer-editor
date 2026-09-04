const assert = require('node:assert/strict');
const test = require('node:test');
const { makeWp607Input, moduleRow, sha } = require('../fixtures/r24-wp607-wse-claims-fixtures.js');

test('WP607 rejects stale, cross-project, private and authority-bearing inputs', async () => {
  const { buildWseClaims } = await import('../../src/core/wse-claims-v1.mjs');
  const base = makeWp607Input();
  const mutants = [
    ['stale identity', { expectedIdentity: { ...base.expectedIdentity, sourceRevision: 'revision-other' } }, /E_WP607_STALE_IDENTITY/u],
    ['stale generation', { modules: base.modules.map((row, index) => index ? row : { ...row, generation: 12 }) }, /E_WP607_STALE_MODULE/u],
    ['cross project', { modules: base.modules.map((row, index) => index ? row : { ...row, projectId: 'project-other' }) }, /E_WP607_PROJECT_IDENTITY/u],
    ['duplicate module', { modules: [moduleRow('stateEvidence'), moduleRow('stateEvidence'), moduleRow('revisionTimeObject'), moduleRow('seriesMultiLayer')] }, /E_WP607_DUPLICATE_MODULE/u],
    ['unknown module', { modules: base.modules.map((row, index) => index ? row : { ...row, moduleId: 'unknownModule' }) }, /E_WP607_MODULE_ID/u],
    ['missing module', { modules: base.modules.slice(0, 3) }, /E_WP607_MODULE_DENOMINATOR/u],
    ['private path', { modules: base.modules.map((row, index) => index ? row : { ...row, path: 'private' }) }, /E_WP607_PRIVATE_OR_AUTHORITY_FIELD/u],
    ['source content', { content: 'manuscript' }, /E_WP607_PRIVATE_OR_AUTHORITY_FIELD/u],
    ['command authority', { command: 'apply' }, /E_WP607_PRIVATE_OR_AUTHORITY_FIELD/u],
    ['invalid digest', { modules: base.modules.map((row, index) => index ? row : { ...row, projectionDigest: sha('x').slice(1) }) }, /E_WP607_PROJECTION_DIGEST/u],
    ['unknown root', { writeProject: true }, /E_WP607_UNKNOWN_OR_MISSING_FIELD/u],
  ];
  for (const [name, overrides, expected] of mutants) {
    assert.throws(() => buildWseClaims(makeWp607Input(overrides)), expected, name);
  }
  const accessor = makeWp607Input();
  Object.defineProperty(accessor, 'writeProject', { enumerable: true, get() { return true; } });
  assert.throws(() => buildWseClaims(accessor), /E_WP607_INPUT_ACCESSOR/u);
  const symbol = makeWp607Input();
  symbol[Symbol('authority')] = true;
  assert.throws(() => buildWseClaims(symbol), /E_WP607_INPUT_SYMBOL/u);
});

test('WP607 enforces input, source-view, total-visible and output budgets', async () => {
  const { buildWseClaims } = await import('../../src/core/wse-claims-v1.mjs');
  const base = makeWp607Input();
  assert.throws(() => buildWseClaims({ ...base, modules: base.modules.map((row, index) => index ? row : { ...row, inputCount: 10_001 }) }), /E_WP607_RECORD_BUDGET/u);
  assert.throws(() => buildWseClaims({ ...base, modules: base.modules.map((row, index) => index ? row : { ...row, maxViewVisibleCount: 129 }) }), /E_WP607_RECORD_BUDGET/u);
  assert.throws(() => buildWseClaims({ ...base, modules: base.modules.map((row, index) => index ? row : { ...row, visibleCount: 513 }) }), /E_WP607_RECORD_BUDGET/u);
  assert.throws(() => buildWseClaims({ ...base, rowLimit: 5 }), /E_WP607_RECORD_BUDGET/u);
});

test('WP607 detects projection tamper and stale consumption', async () => {
  const { assertWseClaimsCurrent, buildWseClaims } = await import('../../src/core/wse-claims-v1.mjs');
  const current = makeWp607Input().currentIdentity;
  const value = buildWseClaims(makeWp607Input());
  assert.throws(() => assertWseClaimsCurrent({ ...value, state: 'tampered' }, current), /E_WP607_PROJECTION_TAMPER/u);
  assert.throws(() => assertWseClaimsCurrent(value, { ...current, generation: current.generation + 1 }), /E_WP607_PROJECTION_STALE/u);
});
