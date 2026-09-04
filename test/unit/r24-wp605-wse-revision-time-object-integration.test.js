const assert = require('node:assert/strict');
const test = require('node:test');

test('WP605 existing Continuity query publishes honest unknown views without a new runtime store', async () => {
  const { createInitialCoreState } = await import('../../src/core/runtime.mjs');
  const { deriveAtlasContinuityLedgerSurface } = await import('../../src/derived/atlas/deriveAtlasContinuityLedgerSurface.mjs');
  const { normalizeWseRevisionTimeObjectPresentation } = await import('../../src/renderer/atlasWseRevisionTimeObjectPresentationModel.mjs');
  const state = createInitialCoreState();
  state.data.projects.project = { projectId: 'project', scenes: {}, sceneOrder: [], atlas: { entities: {}, continuityFactLedgers: {} } };
  const result = deriveAtlasContinuityLedgerSurface({ coreState: state, params: { projectId: 'project', rowLimit: 16 }, capabilitySnapshot: {} });
  assert.equal(result.ok, true);
  const projection = result.value.wseRevisionTimeObject;
  assert.equal(projection.views.semanticDiff.reason, 'UNKNOWN_NO_BASELINE');
  assert.equal(projection.views.storyClock.reason, 'UNKNOWN_TIME_SOURCE');
  assert.equal(projection.authority.persistence, false);
  for (const viewId of projection.viewOrder) {
    const presentation = normalizeWseRevisionTimeObjectPresentation(projection, viewId);
    assert.equal(presentation.tabs.length, 4);
    assert.equal(presentation.viewId, viewId);
    assert.equal(presentation.readOnly, true);
  }
});

test('WP605 presentation rejects an unknown selected tab and keeps visible denominator honest', async () => {
  const { normalizeWseRevisionTimeObjectPresentation } = await import('../../src/renderer/atlasWseRevisionTimeObjectPresentationModel.mjs');
  const value = normalizeWseRevisionTimeObjectPresentation({ views: { semanticDiff: { rows: [{ id: 'one' }], visibleCount: 99, totalCount: 4, omittedCount: 3 } } }, 'writeProject');
  assert.equal(value.viewId, 'semanticDiff');
  assert.equal(value.view.visibleCount, 1);
  assert.equal(value.view.totalCount, 4);
  assert.equal(value.view.omittedCount, 3);
});
