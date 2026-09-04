const assert = require('node:assert/strict');
const test = require('node:test');

test('WP606 existing Continuity query publishes four series views without a new runtime store', async () => {
  const { createInitialCoreState } = await import('../../src/core/runtime.mjs');
  const { deriveAtlasContinuityLedgerSurface } = await import('../../src/derived/atlas/deriveAtlasContinuityLedgerSurface.mjs');
  const { normalizeWseSeriesMultiLayerPresentation } = await import('../../src/renderer/atlasWseSeriesMultiLayerPresentationModel.mjs');
  const state = createInitialCoreState();
  state.data.projects.project = { projectId: 'project', title: 'Project', scenes: {}, sceneOrder: [], atlas: { entities: {}, continuityFactLedgers: {}, seriesIdentityLinks: {} } };
  const result = deriveAtlasContinuityLedgerSurface({ coreState: state, params: { projectId: 'project', rowLimit: 16 }, capabilitySnapshot: {} });
  assert.equal(result.ok, true);
  const projection = result.value.wseSeriesMultiLayer;
  assert.equal(projection.seriesId, 'series:project');
  assert.equal(projection.views.seriesCanon.totalCount, 1);
  assert.equal(projection.views.multiLayerAtlas.totalCount, 5);
  assert.equal(projection.privacy.metadataOnly, true);
  assert.equal(result.value.summary.surfaceHash.length, 64);
  for (const viewId of projection.viewOrder) {
    const presentation = normalizeWseSeriesMultiLayerPresentation(projection, viewId);
    assert.equal(presentation.tabs.length, 4);
    assert.equal(presentation.viewId, viewId);
    assert.equal(presentation.readOnly, true);
    assert.equal(presentation.privacy.metadataOnly, true);
  }
});

test('WP606 presentation rejects an unknown selected tab and keeps visible denominator honest', async () => {
  const { normalizeWseSeriesMultiLayerPresentation } = await import('../../src/renderer/atlasWseSeriesMultiLayerPresentationModel.mjs');
  const value = normalizeWseSeriesMultiLayerPresentation({ views: { seriesCanon: { rows: [{ id: 'one' }], visibleCount: 99, totalCount: 4, omittedCount: 3 } } }, 'writeProject');
  assert.equal(value.viewId, 'seriesCanon');
  assert.equal(value.view.visibleCount, 1);
  assert.equal(value.view.totalCount, 4);
  assert.equal(value.view.omittedCount, 3);
});
