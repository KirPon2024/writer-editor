const assert = require('node:assert/strict');
const test = require('node:test');

test('WP607 existing Continuity query publishes current claims for all four WSE modules', async () => {
  const { createInitialCoreState } = await import('../../src/core/runtime.mjs');
  const { deriveAtlasContinuityLedgerSurface } = await import('../../src/derived/atlas/deriveAtlasContinuityLedgerSurface.mjs');
  const { assertWseClaimsCurrent } = await import('../../src/core/wse-claims-v1.mjs');
  const { normalizeWseClaimsPresentation } = await import('../../src/renderer/atlasWseClaimsPresentationModel.mjs');
  const state = createInitialCoreState();
  state.data.projects.project = { projectId: 'project', title: 'Project', scenes: {}, sceneOrder: [], atlas: { entities: {}, continuityFactLedgers: {}, seriesIdentityLinks: {} } };
  const result = deriveAtlasContinuityLedgerSurface({ coreState: state, params: { projectId: 'project', rowLimit: 16 }, capabilitySnapshot: {} });
  assert.equal(result.ok, true);
  const projection = result.value.wseClaims;
  assert.equal(projection.denominator.modules, 4);
  assert.equal(projection.denominator.claimRows, 16);
  assert.equal(projection.views.noBloat.passCount, 4);
  assert.equal(projection.views.hardLimits.passCount, 4);
  assert.equal(projection.views.corpus.passCount, 0);
  assert.equal(projection.views.corpus.abstainCount, 4);
  assert.equal(result.value.summary.surfaceHash.length, 64);
  assert.equal(assertWseClaimsCurrent(projection, {
    projectId: 'project',
    sourceRevision: result.value.summary.invalidationKey,
    generation: 0,
  }), true);
  for (const viewId of projection.viewOrder) {
    const presentation = normalizeWseClaimsPresentation(projection, viewId);
    assert.equal(presentation.tabs.length, 4);
    assert.equal(presentation.viewId, viewId);
    assert.equal(presentation.readOnly, true);
    assert.equal(presentation.view.denominator, 4);
  }
});

test('WP607 presentation rejects an unknown tab and derives visible denominator from actual rows', async () => {
  const { normalizeWseClaimsPresentation } = await import('../../src/renderer/atlasWseClaimsPresentationModel.mjs');
  const value = normalizeWseClaimsPresentation({
    views: { userJobs: { rows: [{ moduleId: 'stateEvidence', status: 'PASS' }], visibleCount: 99, denominator: 4, omittedCount: 3 } },
    authority: { readOnly: true },
  }, 'applyClaims');
  assert.equal(value.viewId, 'userJobs');
  assert.equal(value.view.visibleCount, 1);
  assert.equal(value.view.denominator, 4);
  assert.equal(value.view.omittedCount, 3);
  assert.equal(value.readOnly, true);
});
