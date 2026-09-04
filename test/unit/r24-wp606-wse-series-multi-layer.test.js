const assert = require('node:assert/strict');
const test = require('node:test');
const { makeWp606Input, sha } = require('../fixtures/r24-wp606-wse-series-multi-layer-fixtures.js');

test('WP606 composes four deterministic metadata-only series views', async () => {
  const { buildWseSeriesMultiLayer } = await import('../../src/core/wse-series-multi-layer-v1.mjs');
  const value = buildWseSeriesMultiLayer(makeWp606Input());
  assert.deepEqual(value.viewOrder, ['seriesCanon', 'multiLayerAtlas', 'evidenceCapsule', 'agentContextPacket']);
  assert.equal(value.views.seriesCanon.totalCount, 3);
  assert.equal(value.views.multiLayerAtlas.totalCount, 5);
  assert.equal(value.views.evidenceCapsule.totalCount, 2);
  assert.equal(value.views.agentContextPacket.totalCount, 5);
  assert.equal(value.denominator.authorConfirmedIdentityLinks, 1);
  assert.equal(value.evidenceCapsule.recordDenominator, 5);
  assert.equal(value.evidenceCapsule.artifactPublished, false);
  assert.equal(value.agentContextPacket.instructionAuthority, false);
  assert.deepEqual(value.privacy, {
    metadataOnly: true,
    sourceContentIncluded: false,
    privateOwnerDataIncluded: false,
    pathsIncluded: false,
    secretsIncluded: false,
    networkUsed: false,
  });
  assert.equal(value.authority.productMutation, false);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(value.projectionDigest, buildWseSeriesMultiLayer(makeWp606Input()).projectionDigest);
});

test('WP606 preserves unknown layer state instead of inferring evidence', async () => {
  const { buildWseSeriesMultiLayer } = await import('../../src/core/wse-series-multi-layer-v1.mjs');
  const input = makeWp606Input();
  input.layers[0] = { ...input.layers[0], state: 'unknown', projectionDigest: '' };
  const value = buildWseSeriesMultiLayer(input);
  assert.equal(value.state, 'degraded');
  assert.equal(value.views.multiLayerAtlas.rows[0].state, 'unknown');
  assert.equal(value.views.multiLayerAtlas.rows[0].reason, 'UNKNOWN_LAYER_PROJECTION');
  assert.equal(value.views.evidenceCapsule.rows.find((row) => row.label === 'ATLAS').state, 'ready');
});

test('WP606 bounds visible rows and is insensitive to input order', async () => {
  const { buildWseSeriesMultiLayer } = await import('../../src/core/wse-series-multi-layer-v1.mjs');
  const input = makeWp606Input({ rowLimit: 1 });
  const first = buildWseSeriesMultiLayer(input);
  const reordered = makeWp606Input({
    rowLimit: 1,
    layers: [...input.layers].reverse(),
    seriesManifest: { ...input.seriesManifest, bookRefs: [...input.seriesManifest.bookRefs].reverse() },
  });
  const second = buildWseSeriesMultiLayer(reordered);
  assert.equal(first.views.seriesCanon.visibleCount, 1);
  assert.equal(first.views.seriesCanon.omittedCount, 2);
  assert.equal(first.views.multiLayerAtlas.visibleCount, 1);
  assert.equal(first.projectionDigest, second.projectionDigest);
  assert.notEqual(first.agentContextPacket.layerDigestSetSha256, sha('not-the-packet'));
});
