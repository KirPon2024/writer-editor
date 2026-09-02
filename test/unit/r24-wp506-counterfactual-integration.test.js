'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { fixture, semantic } = require('./r24-wp506-counterfactual.test.js');

test('WP-506 differential rebuild oracle is byte-deterministic for equivalent immutable inputs', async () => {
  const f = await fixture();
  const branchA = f.module.createAtlasCounterfactualBranch(f.input);
  const branchB = f.module.createAtlasCounterfactualBranch(structuredClone(f.input));
  const proposalA = f.module.proposeAtlasCounterfactualImpact(f.input);
  const proposalB = f.module.proposeAtlasCounterfactualImpact(structuredClone(f.input));
  assert.deepEqual(branchB, branchA);
  assert.deepEqual(proposalB, proposalA);
  assert.equal(branchA.branchDigest, proposalA.branchDigest);
});

test('WP-506 impact aggregation preserves exact Unicode and set denominators', async () => {
  const f = await fixture();
  const evidenceId = f.entry.evidenceIds[0];
  const after = semantic(f.entry, { body: 'Анна остаётся в 東京 — Café.', entityIds: ['entity-anna', 'entity-tokyo'], sceneIds: ['scene-retcon'], tags: ['alternative', 'canon'] });
  const input = { ...f.input, operations: [{ after, entryId: f.entry.entryId, kind: 'REPLACE', operationId: 'retcon:001', rationale: 'Проверить альтернативу Café.', sourceEvidenceIds: [evidenceId] }] };
  const proposal = f.module.proposeAtlasCounterfactualImpact(input);
  assert.equal(proposal.changes[0].rationale, 'Проверить альтернативу Café.');
  assert.deepEqual(proposal.impact.entityIds, ['entity-anna', 'entity-tokyo'].filter((id) => !f.entry.entityIds.includes(id)).concat(f.entry.entityIds.filter((id) => !['entity-anna', 'entity-tokyo'].includes(id))).sort());
  assert.equal(proposal.denominator.entities, proposal.impact.entityIds.length);
  assert.equal(proposal.denominator.scenes, proposal.impact.sceneIds.length);
  assert.equal(proposal.denominator.evidence, proposal.impact.evidenceIds.length);
  assert.ok(proposal.impact.dimensions.includes('BODY'));
});

test('WP-506 large operation corpus stays bounded and preserves complete branch arithmetic', async () => {
  const f = await fixture();
  const count = 2_000;
  const evidenceId = f.entry.evidenceIds[0];
  const operations = Array.from({ length: count }, (_, index) => {
    const id = String(index).padStart(4, '0');
    return { after: semantic(f.entry, { body: `Alternative ${id}`, label: `Branch ${id}` }), entryId: `counterfactual:${id}`, kind: 'ADD', operationId: `retcon:${id}`, rationale: `Explore branch ${id}.`, sourceEvidenceIds: [evidenceId] };
  });
  const started = performance.now();
  const branch = f.module.createAtlasCounterfactualBranch({ ...f.input, operations });
  const proposal = f.module.proposeAtlasCounterfactualImpact({ ...f.input, operations });
  const elapsed = performance.now() - started;
  assert.equal(branch.denominator.operations, count);
  assert.equal(branch.denominator.added, count);
  assert.equal(branch.denominator.branchEntries, f.registerProjection.entries.length + count);
  assert.equal(proposal.denominator.changes, count);
  assert.ok(elapsed < 20_000, `WP506 large corpus exceeded budget: ${elapsed}ms`);
});

test('WP-506 exposes no product apply persistence renderer network AI or effect authority', async () => {
  const f = await fixture();
  for (const value of [f.branch.authority, f.proposal.authority]) {
    assert.deepEqual(value, { stateClass: 'DERIVED_STATE', productMutation: false, persistence: false, rendererWiring: false, externalEffects: false, network: false, externalAi: false, applyAuthority: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' });
  }
  assert.equal(f.module.ATLAS_COUNTERFACTUAL_FEATURE_INTEGRATION_MANIFEST_V1.writePath, 'PURE_RETURN_VALUE_ONLY');
  assert.equal(f.module.ATLAS_COUNTERFACTUAL_FEATURE_INTEGRATION_MANIFEST_V1.persistenceClass, 'NOT_PERSISTED_BY_THIS_MODULE');
});
