'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { clone, fixture } = require('../fixtures/r24-wp604-wse-threads-explanation-fixtures.js');

test('WP604 exposes bounded setup/payoff, dependency, Canon CI and why views from explicit evidence', async () => {
  const f = await fixture();
  const before = JSON.stringify({ facts: f.facts, causal: f.causalContext });
  const projection = f.api.buildWseThreadsExplanation(f.input);
  assert.equal(projection.schemaVersion, 'yalken.wseThreadsExplanation.v1');
  assert.deepEqual(Object.keys(projection.views), ['setupPayoffBoard', 'dependencyDag', 'canonCi', 'whyWhyNot']);
  assert.equal(projection.views.setupPayoffBoard.totalCount, 3);
  assert.equal(projection.views.setupPayoffBoard.rows.find((row) => row.value === 'return').payoffState, 'FULFILLED');
  assert.equal(projection.views.setupPayoffBoard.rows.find((row) => row.value === 'send-letter').payoffState, 'UNKNOWN_NOT_RECORDED');
  assert.equal(projection.views.dependencyDag.totalCount, 2);
  assert.equal(projection.views.dependencyDag.rows[0].sourceLayer < projection.views.dependencyDag.rows[0].targetLayer, true);
  assert.equal(projection.views.dependencyDag.textualParity, true);
  assert.equal(projection.views.canonCi.statusDenominator.review >= 1, true);
  assert.equal(projection.views.canonCi.statusDenominator.abstain >= 1, true);
  assert.equal(projection.openWorld.inference, false);
  assert.equal(projection.authority.productMutation, false);
  assert.equal(projection.authority.commandAuthority, false);
  assert.equal(Object.isFrozen(projection), true);
  assert.match(projection.projectionDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify({ facts: f.facts, causal: f.causalContext }), before);
});

test('WP604 why or why-not returns explicit direct evidence and never infers a transitive edge', async () => {
  const f = await fixture();
  const projection = f.api.buildWseThreadsExplanation(f.input);
  const identity = { projectId: projection.projectId, sourceRevision: projection.sourceRevision, generation: projection.generation, projectionDigest: projection.projectionDigest };
  const direct = f.api.explainWseWhyWhyNot({ projection, currentIdentity: identity, sourcePropositionId: 'promise-made', targetPropositionId: 'door-open' });
  assert.equal(direct.relationState, 'EXPLICIT');
  assert.equal(direct.relations[0].relation, 'CAUSES');
  assert.equal(direct.relations[0].evidence.length, 2);
  const absent = f.api.explainWseWhyWhyNot({ projection, currentIdentity: identity, sourcePropositionId: 'promise-made', targetPropositionId: 'secret-found' });
  assert.equal(absent.relationState, 'UNKNOWN');
  assert.equal(absent.unknownReason, 'NO_EXPLICIT_DIRECT_CAUSAL_EDGE');
  assert.equal(absent.inference, false);
});

test('WP604 absent causal source stays unknown even when promise facts have related entities', async () => {
  const f = await fixture();
  const projection = f.api.buildWseThreadsExplanation({ ...f.input, causalContext: null });
  assert.equal(projection.availability.causalProjection, 'UNKNOWN_NO_EXPLICIT_CAUSAL_PROJECTION');
  assert.equal(projection.views.dependencyDag.rows.length, 0);
  assert.equal(projection.views.whyWhyNot.rows[0].relationState, 'UNKNOWN');
  assert.equal(projection.views.canonCi.rows.some((row) => row.reason === 'UNKNOWN_NO_EXPLICIT_CAUSAL_PROJECTION'), true);
  assert.equal(projection.denominator.causalEdges, 0);
});

test('WP604 row budget reports complete denominators and query abstains beyond the visible bound', async () => {
  const f = await fixture();
  const full = f.api.buildWseThreadsExplanation(f.input);
  const projection = f.api.buildWseThreadsExplanation({ ...f.input, rowLimit: 1 });
  assert.equal(projection.views.dependencyDag.visibleCount, 1);
  assert.equal(projection.views.dependencyDag.totalCount, 2);
  assert.equal(projection.views.dependencyDag.omittedCount, 1);
  assert.equal(projection.denominator.complete, true);
  const identity = { projectId: projection.projectId, sourceRevision: projection.sourceRevision, generation: projection.generation, projectionDigest: projection.projectionDigest };
  const omitted = full.views.dependencyDag.rows.find((row) => row.id !== projection.views.dependencyDag.rows[0].id);
  const bounded = f.api.explainWseWhyWhyNot({ projection, currentIdentity: identity, sourcePropositionId: omitted.sourcePropositionId, targetPropositionId: omitted.targetPropositionId });
  assert.equal(bounded.relationState, 'ABSTAIN');
  assert.equal(bounded.unknownReason, 'DIRECT_EDGE_OUTSIDE_VISIBLE_BOUND_POSSIBLE');
});

test('WP604 feature and surface manifests keep the existing read-only Continuity seam', async () => {
  const f = await fixture();
  assert.equal(f.api.WSE_THREADS_EXPLANATION_FEATURE_INTEGRATION_MANIFEST_V1.schemaVersion, 'FEATURE_INTEGRATION_MANIFEST_V1');
  assert.deepEqual(f.api.WSE_THREADS_EXPLANATION_FEATURE_INTEGRATION_MANIFEST_V1.productPorts, ['query.atlasContinuityLedgerSurface']);
  assert.equal(f.api.WSE_THREADS_EXPLANATION_SURFACE_MANIFEST_V1.existingSurfaceReused, true);
  assert.equal(f.api.WSE_THREADS_EXPLANATION_SURFACE_MANIFEST_V1.slotId, 'rightRail.context.atlas.continuityLedger');
  assert.equal(f.api.WSE_THREADS_EXPLANATION_SURFACE_MANIFEST_V1.productMutation, false);
  assert.equal(f.api.WSE_THREADS_EXPLANATION_FEATURE_SPEC_V1.corpus.negativeDenominator, 13);
  assert.equal(Object.keys(f.api.WSE_THREADS_EXPLANATION_QUERY_PLANS_V1).length, 4);
  const tampered = clone(f.api.buildWseThreadsExplanation(f.input));
  tampered.authority.readOnly = false;
  assert.throws(() => f.api.assertWseThreadsExplanationCurrent(tampered, { projectId: tampered.projectId, sourceRevision: tampered.sourceRevision, generation: tampered.generation, projectionDigest: tampered.projectionDigest }), { code: 'E_WSE_THREADS_PROJECTION_TAMPER' });
});
