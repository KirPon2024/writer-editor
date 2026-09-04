const assert = require('node:assert/strict');
const test = require('node:test');
const { makeWp605Input, makeVerifiedWp605Input } = require('../fixtures/r24-wp605-wse-revision-time-object-fixtures.js');

test('WP605 projects four bounded evidence-aware revision, time and custody views', async () => {
  const { buildWseRevisionTimeObject } = await import('../../src/core/wse-revision-time-object-v1.mjs');
  const value = buildWseRevisionTimeObject(await makeVerifiedWp605Input());
  assert.deepEqual(value.viewOrder, ['semanticDiff', 'retconSimulator', 'storyClock', 'objectCustody']);
  assert.deepEqual(value.views.semanticDiff.rows.map((row) => [row.factId, row.change]), [
    ['fact-knowledge-map', 'ADDED'], ['fact-location-key', 'CHANGED'],
  ]);
  assert.deepEqual(value.views.retconSimulator.rows.map((row) => [row.factId, row.change, row.simulationState]), [
    ['fact-knowledge-map', 'REMOVED', 'SIMULATED_NOT_APPLIED'],
    ['fact-location-key', 'CHANGED', 'SIMULATED_NOT_APPLIED'],
  ]);
  assert.deepEqual(value.views.storyClock.rows.map((row) => row.id), ['cell-door', 'cell-map']);
  assert.equal(value.views.objectCustody.rows[0].status, 'VERIFIED_CHAIN');
  assert.equal(value.views.objectCustody.rows[0].currentHolderEntityId, 'character-ava');
  assert.equal(value.authority.productMutation, false);
  assert.match(value.projectionDigest, /^[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(value.views.objectCustody.rows[0].events), true);
});

test('WP605 preserves open-world unknown states when optional authoritative sources are absent', async () => {
  const { buildWseRevisionTimeObject } = await import('../../src/core/wse-revision-time-object-v1.mjs');
  const value = buildWseRevisionTimeObject(makeWp605Input({ previousSnapshot: null, retconProposal: null, timeKnowledgeInput: null, objectCustodyEvents: null }));
  assert.equal(value.views.semanticDiff.reason, 'UNKNOWN_NO_BASELINE');
  assert.equal(value.views.retconSimulator.reason, 'EMPTY_NO_RETCON_PROPOSAL');
  assert.equal(value.views.storyClock.reason, 'UNKNOWN_TIME_SOURCE');
  assert.equal(value.views.objectCustody.reason, 'UNKNOWN_CUSTODY_SOURCE');
  assert.equal(value.denominator.visibleRows, 0);
});

test('WP605 manifests keep the existing read-only Continuity seam', async () => {
  const { WSE_REVISION_TIME_OBJECT_FEATURE_INTEGRATION_MANIFEST_V1, WSE_REVISION_TIME_OBJECT_SURFACE_MANIFEST_V1 } = await import('../../src/core/wse-revision-time-object-v1.mjs');
  assert.equal(WSE_REVISION_TIME_OBJECT_FEATURE_INTEGRATION_MANIFEST_V1.mutationAuthority, false);
  assert.equal(WSE_REVISION_TIME_OBJECT_SURFACE_MANIFEST_V1.slotId, 'rightRail.context.atlas.continuityLedger');
  assert.equal(WSE_REVISION_TIME_OBJECT_SURFACE_MANIFEST_V1.views.length, 4);
  assert.equal(WSE_REVISION_TIME_OBJECT_SURFACE_MANIFEST_V1.keyboardContract.listTextParity, true);
});

test('WP605 large corpus remains bounded and reports the complete denominator', async () => {
  const { buildWseRevisionTimeObject, WSE_REVISION_TIME_OBJECT_MAX_RECORDS } = await import('../../src/core/wse-revision-time-object-v1.mjs');
  const facts = Array.from({ length: WSE_REVISION_TIME_OBJECT_MAX_RECORDS }, (_, index) => ({
    id: `fact-${String(index).padStart(5, '0')}`,
    projectId: 'project-wp605-fixture',
    ledgerKind: 'object',
    factValue: String(index),
  }));
  const value = buildWseRevisionTimeObject(makeWp605Input({
    currentFacts: facts,
    previousSnapshot: { projectId: 'project-wp605-fixture', revisionId: 'empty', facts: [] },
    retconProposal: null,
    timeKnowledgeInput: null,
    objectCustodyEvents: null,
    rowLimit: 128,
  }));
  assert.equal(value.views.semanticDiff.totalCount, WSE_REVISION_TIME_OBJECT_MAX_RECORDS);
  assert.equal(value.views.semanticDiff.visibleCount, 128);
  assert.equal(value.views.semanticDiff.omittedCount, WSE_REVISION_TIME_OBJECT_MAX_RECORDS - 128);
  assert.throws(() => buildWseRevisionTimeObject(makeWp605Input({ currentFacts: [...facts, { id: 'overflow', projectId: 'project-wp605-fixture' }] })), /E_WP605_RECORD_BUDGET/u);
});
