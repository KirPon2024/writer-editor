const assert = require('node:assert/strict');
const test = require('node:test');
const { makeWp606Input } = require('../fixtures/r24-wp606-wse-series-multi-layer-fixtures.js');

test('WP606 rejects stale, cross-project, private and authority-bearing inputs', async () => {
  const { buildWseSeriesMultiLayer } = await import('../../src/core/wse-series-multi-layer-v1.mjs');
  const mutants = [
    ['stale revision', { expectedIdentity: { ...makeWp606Input().expectedIdentity, sourceRevision: 'revision-other' } }, /E_WP606_STALE_IDENTITY/u],
    ['stale generation', { expectedIdentity: { ...makeWp606Input().expectedIdentity, generation: 10 } }, /E_WP606_STALE_IDENTITY/u],
    ['cross-project manifest', { seriesManifest: { ...makeWp606Input().seriesManifest, projectId: 'project-other' } }, /E_WP606_PROJECT_IDENTITY/u],
    ['private path', { seriesManifest: { ...makeWp606Input().seriesManifest, path: 'private-location' } }, /E_WP606_PRIVATE_FIELD/u],
    ['source content', { identityLinks: { link: { content: 'manuscript' } } }, /E_WP606_PRIVATE_FIELD/u],
    ['secret', { seriesManifest: { ...makeWp606Input().seriesManifest, secret: 'hidden' } }, /E_WP606_PRIVATE_FIELD/u],
    ['unconfirmed link', { identityLinks: { link: { ...makeWp606Input().identityLinks['link-ava'], authorConfirmed: false } } }, /E_WP606_UNCONFIRMED_IDENTITY_LINK/u],
    ['unknown authority key', { writeProject: true }, /E_WP606_UNKNOWN_OR_MISSING_FIELD/u],
  ];
  for (const [name, overrides, expected] of mutants) {
    assert.throws(() => buildWseSeriesMultiLayer(makeWp606Input(overrides)), expected, name);
  }
  const accessor = makeWp606Input();
  Object.defineProperty(accessor, 'writeProject', { enumerable: true, get() { return true; } });
  assert.throws(() => buildWseSeriesMultiLayer(accessor), /E_WP606_INPUT_ACCESSOR/u);
  const symbol = makeWp606Input();
  symbol[Symbol('authority')] = true;
  assert.throws(() => buildWseSeriesMultiLayer(symbol), /E_WP606_INPUT_SYMBOL/u);
});

test('WP606 enforces layer and record budgets before projection', async () => {
  const { buildWseSeriesMultiLayer, WSE_SERIES_MULTI_LAYER_MAX_LAYERS } = await import('../../src/core/wse-series-multi-layer-v1.mjs');
  const layer = makeWp606Input().layers[0];
  assert.throws(
    () => buildWseSeriesMultiLayer(makeWp606Input({ layers: Array.from({ length: WSE_SERIES_MULTI_LAYER_MAX_LAYERS + 1 }, (_, index) => ({ ...layer, layerId: `layer-${index}` })) })),
    /E_WP606_RECORD_BUDGET/u,
  );
  assert.throws(
    () => buildWseSeriesMultiLayer(makeWp606Input({ layers: [{ ...layer, recordCount: 10_001 }] })),
    /E_WP606_RECORD_BUDGET/u,
  );
});
