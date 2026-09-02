'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fixture: wp505Fixture } = require('./r24-wp505-register-ask.test.js');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

function semantic(entry, overrides = {}) {
  return {
    body: entry.body,
    entityIds: [...entry.entityIds],
    evidenceIds: [...entry.evidenceIds],
    kind: entry.kind,
    label: entry.label,
    sceneIds: [...entry.sceneIds],
    tags: [...entry.tags],
    ...overrides,
  };
}
function operation(entry, overrides = {}) {
  return {
    after: semantic(entry, { body: `${entry.body} — alternative` }),
    entryId: entry.entryId,
    kind: 'REPLACE',
    operationId: 'retcon:001',
    rationale: 'Explore one evidence-bound semantic alternative.',
    sourceEvidenceIds: [entry.evidenceIds[0]],
    ...overrides,
  };
}
async function fixture() {
  const base = await wp505Fixture();
  const module = await importRepo('src/core/atlas-counterfactual-v1.mjs');
  const entry = base.registerProjection.entries.find((value) => value.evidenceIds.length > 0);
  const input = { currentIdentity: base.currentIdentity, registerInput: base.input, registerProjection: base.registerProjection, operations: [operation(entry)] };
  const branch = module.createAtlasCounterfactualBranch(input);
  const proposal = module.proposeAtlasCounterfactualImpact(input);
  return { ...base, module, entry, input, branch, proposal };
}

test('WP-506 builds an immutable disposable retcon branch and exact semantic impact proposal', async () => {
  const f = await fixture();
  assert.equal(f.module.verifyAtlasCounterfactualBranch(f.branch, f.input), f.branch);
  assert.equal(f.module.verifyAtlasCounterfactualProposal(f.proposal, f.input), f.proposal);
  assert.equal(f.module.verifyAtlasCounterfactualDigests(f.branch, f.proposal).proposal, f.proposal);
  assert.equal(f.branch.disposable, true);
  assert.equal(f.proposal.proposalOnly, true);
  assert.equal(f.proposal.canApply, false);
  assert.equal(f.branch.denominator.replaced, 1);
  assert.deepEqual(f.proposal.impact.dimensions, ['BODY']);
  assert.equal(Object.isFrozen(f.branch.entries), true);
  assert.equal(Object.isFrozen(f.proposal.changes[0]), true);
});

test('WP-506 supports bounded add replace and remove without mutating the verified baseline', async () => {
  const f = await fixture();
  const original = structuredClone(f.registerProjection);
  const removable = f.registerProjection.entries.find((value) => value.entryId !== f.entry.entryId && value.evidenceIds.length > 0);
  const evidenceId = f.entry.evidenceIds[0];
  const operations = [
    { after: semantic(f.entry, { body: `${f.entry.body} — alternative` }), entryId: f.entry.entryId, kind: 'REPLACE', operationId: 'retcon:001', rationale: 'Replace one statement.', sourceEvidenceIds: [evidenceId] },
    { after: null, entryId: removable.entryId, kind: 'REMOVE', operationId: 'retcon:002', rationale: 'Remove one statement from the disposable branch.', sourceEvidenceIds: [removable.evidenceIds[0]] },
    { after: semantic(f.entry, { body: 'Новая ветвь в 東京.', label: 'Alternative Café' }), entryId: 'counterfactual:new-1', kind: 'ADD', operationId: 'retcon:003', rationale: 'Add one branch-local statement.', sourceEvidenceIds: [evidenceId] },
  ];
  const input = { ...f.input, operations };
  const branch = f.module.createAtlasCounterfactualBranch(input);
  const proposal = f.module.proposeAtlasCounterfactualImpact(input);
  assert.deepEqual(f.registerProjection, original);
  assert.deepEqual(branch.denominator, { baselineEntries: original.entries.length, operations: 3, added: 1, replaced: 1, removed: 1, branchEntries: original.entries.length });
  assert.equal(branch.entries.some((entry) => entry.entryId === removable.entryId), false);
  assert.equal(branch.entries.some((entry) => entry.entryId === 'counterfactual:new-1'), true);
  assert.equal(proposal.denominator.changes, 3);
  assert.ok(proposal.impact.dimensions.includes('ADDITION'));
  assert.ok(proposal.impact.dimensions.includes('REMOVAL'));
});

test('WP-506 emits an explicit no-change proposal for an empty canonical operation set', async () => {
  const f = await fixture();
  const input = { ...f.input, operations: [] };
  const branch = f.module.createAtlasCounterfactualBranch(input);
  const proposal = f.module.proposeAtlasCounterfactualImpact(input);
  assert.equal(branch.denominator.operations, 0);
  assert.equal(branch.denominator.branchEntries, f.registerProjection.entries.length);
  assert.deepEqual(proposal.changes, []);
  assert.deepEqual(proposal.impact, { entityIds: [], sceneIds: [], evidenceIds: [], tags: [], dimensions: [] });
});

test('WP-506 fails closed on stale, future, missing, conflicting and non-material operations', async () => {
  const f = await fixture();
  assert.throws(() => f.module.createAtlasCounterfactualBranch({ ...f.input, currentIdentity: { ...f.currentIdentity, generation: f.currentIdentity.generation + 1 } }), (error) => error.code === 'E_ATLAS_REGISTER_STALE');
  assert.throws(() => f.module.createAtlasCounterfactualBranch({ ...f.input, operations: [operation(f.entry, { sourceEvidenceIds: ['evidence:future'] })] }), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_SOURCE_EVIDENCE_UNKNOWN');
  assert.throws(() => f.module.createAtlasCounterfactualBranch({ ...f.input, operations: [operation(f.entry), operation(f.entry, { operationId: 'retcon:002' })] }), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_TARGET_CONFLICT');
  assert.throws(() => f.module.createAtlasCounterfactualBranch({ ...f.input, operations: [operation(f.entry, { entryId: 'missing', kind: 'REMOVE', after: null })] }), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_TARGET_MISSING');
  assert.throws(() => f.module.createAtlasCounterfactualBranch({ ...f.input, operations: [operation(f.entry, { after: semantic(f.entry) })] }), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_REPLACE_NO_CHANGE');
  assert.throws(() => f.module.createAtlasCounterfactualBranch({ ...f.input, operations: [operation(f.entry, { operationId: 'retcon:002' }), operation(f.entry, { entryId: 'counterfactual:new', kind: 'ADD', operationId: 'retcon:001' })] }), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_OPERATION_ORDER');
});

test('WP-506 rejects accessors symbols sparse arrays unknown fields and tampered outputs', async () => {
  const f = await fixture();
  let invoked = false;
  const hostile = { ...f.input };
  Object.defineProperty(hostile, 'trap', { enumerable: true, get() { invoked = true; return true; } });
  assert.throws(() => f.module.createAtlasCounterfactualBranch(hostile), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_INPUT_INVALID');
  assert.equal(invoked, false);
  const symbolic = { ...f.input }; symbolic[Symbol('authority')] = true;
  assert.throws(() => f.module.createAtlasCounterfactualBranch(symbolic), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_INPUT_INVALID');
  const sparse = [operation(f.entry)]; delete sparse[0];
  assert.throws(() => f.module.createAtlasCounterfactualBranch({ ...f.input, operations: sparse }), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_OPERATIONS_INVALID');
  assert.throws(() => f.module.createAtlasCounterfactualBranch({ ...f.input, extra: true }), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_INPUT_INVALID');
  const branch = structuredClone(f.branch); branch.authority.productMutation = true;
  assert.throws(() => f.module.verifyAtlasCounterfactualBranch(branch, f.input), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_BRANCH_MISMATCH');
  const proposal = structuredClone(f.proposal); proposal.canApply = true;
  assert.throws(() => f.module.verifyAtlasCounterfactualProposal(proposal, f.input), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_PROPOSAL_MISMATCH');
});

module.exports = { fixture, operation, semantic };
