'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fixture, operation, semantic } = require('./r24-wp506-counterfactual.test.js');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-counterfactual-v1.mjs');
const MUTANTS = Object.freeze([
  { id: 'unknown-input-admitted', find: "export function createAtlasCounterfactualBranch(input) {\n  exact(input, INPUT_KEYS, 'E_ATLAS_COUNTERFACTUAL_INPUT_INVALID');", replace: "export function createAtlasCounterfactualBranch(input) {\n  if (false) exact(input, INPUT_KEYS, 'E_ATLAS_COUNTERFACTUAL_INPUT_INVALID');" },
  { id: 'register-rebuild-skipped', find: '  verifyAtlasRegisterProjection(projection, input.registerInput);', replace: '  if (false) verifyAtlasRegisterProjection(projection, input.registerInput);' },
  { id: 'operation-bound-widened', find: "  if (values.length > ATLAS_COUNTERFACTUAL_MAX_OPERATIONS) fail('E_ATLAS_COUNTERFACTUAL_OPERATION_BOUND');", replace: "  if (values.length > 999999) fail('E_ATLAS_COUNTERFACTUAL_OPERATION_BOUND');" },
  { id: 'add-target-law-disabled', find: "    if (kind === ATLAS_COUNTERFACTUAL_OPERATION_KIND.ADD && (before || !entryId.startsWith('counterfactual:'))) fail('E_ATLAS_COUNTERFACTUAL_ADD_TARGET_INVALID');", replace: "    if (false) fail('E_ATLAS_COUNTERFACTUAL_ADD_TARGET_INVALID');" },
  { id: 'unknown-evidence-admitted', find: "    if (sourceEvidenceIds.some((id) => !evidenceUniverse.has(id))) fail('E_ATLAS_COUNTERFACTUAL_SOURCE_EVIDENCE_UNKNOWN', operationId);", replace: "    if (false) fail('E_ATLAS_COUNTERFACTUAL_SOURCE_EVIDENCE_UNKNOWN', operationId);" },
  { id: 'target-conflict-admitted', find: "  if (new Set(normalized.map((value) => value.entryId)).size !== normalized.length) fail('E_ATLAS_COUNTERFACTUAL_TARGET_CONFLICT');", replace: "  if (false) fail('E_ATLAS_COUNTERFACTUAL_TARGET_CONFLICT');" },
  { id: 'no-change-replace-admitted', find: "    if (kind === ATLAS_COUNTERFACTUAL_OPERATION_KIND.REPLACE && digest(after) === digest(semanticFromRegister(before))) fail('E_ATLAS_COUNTERFACTUAL_REPLACE_NO_CHANGE');", replace: "    if (false) fail('E_ATLAS_COUNTERFACTUAL_REPLACE_NO_CHANGE');" },
  { id: 'product-mutation-authority-leaked', find: "  return freeze({ stateClass: 'DERIVED_STATE', productMutation: false, persistence: false, rendererWiring: false, externalEffects: false, network: false, externalAi: false, applyAuthority: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' });", replace: "  return freeze({ stateClass: 'DERIVED_STATE', productMutation: true, persistence: false, rendererWiring: false, externalEffects: false, network: false, externalAi: false, applyAuthority: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' });" },
  { id: 'branch-tamper-admitted', find: "  if (hashCanonicalValue(value) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_COUNTERFACTUAL_BRANCH_MISMATCH');", replace: "  if (false) fail('E_ATLAS_COUNTERFACTUAL_BRANCH_MISMATCH');" },
  { id: 'proposal-tamper-admitted', find: "  if (hashCanonicalValue(value) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_COUNTERFACTUAL_PROPOSAL_MISMATCH');", replace: "  if (false) fail('E_ATLAS_COUNTERFACTUAL_PROPOSAL_MISMATCH');" },
]);

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp506-mutant-'));
  const core = path.join(dir, 'core');
  fs.cpSync(path.join(ROOT, 'src/core'), core, { recursive: true });
  const target = path.join(core, 'atlas-counterfactual-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return { dir, module: await import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`) };
}

async function oracle(module) {
  const f = await fixture();
  const valid = { ...f.input };
  const branch = module.createAtlasCounterfactualBranch(valid);
  const proposal = module.proposeAtlasCounterfactualImpact(valid);
  assert.equal(branch.authority.productMutation, false);
  assert.throws(() => module.createAtlasCounterfactualBranch({ ...valid, extra: true }));
  const tamperedInput = structuredClone(valid); tamperedInput.registerInput.authoredEntries[0].body = 'tampered';
  assert.throws(() => module.createAtlasCounterfactualBranch(tamperedInput));
  const oversized = Array.from({ length: 2_049 }, (_, index) => operation(f.entry, { entryId: `counterfactual:${index}`, kind: 'ADD', operationId: `retcon:${String(index).padStart(4, '0')}` }));
  assert.throws(() => module.createAtlasCounterfactualBranch({ ...valid, operations: oversized }));
  assert.throws(() => module.createAtlasCounterfactualBranch({ ...valid, operations: [operation(f.entry, { entryId: f.entry.entryId, kind: 'ADD' })] }), (error) => error.code === 'E_ATLAS_COUNTERFACTUAL_ADD_TARGET_INVALID');
  assert.throws(() => module.createAtlasCounterfactualBranch({ ...valid, operations: [operation(f.entry, { sourceEvidenceIds: ['evidence:future'] })] }));
  assert.throws(() => module.createAtlasCounterfactualBranch({ ...valid, operations: [operation(f.entry), operation(f.entry, { operationId: 'retcon:002' })] }));
  assert.throws(() => module.createAtlasCounterfactualBranch({ ...valid, operations: [operation(f.entry, { after: semantic(f.entry) })] }));
  const branchTamper = structuredClone(branch); branchTamper.authority.productMutation = true;
  assert.throws(() => module.verifyAtlasCounterfactualBranch(branchTamper, valid));
  const proposalTamper = structuredClone(proposal); proposalTamper.canApply = true;
  assert.throws(() => module.verifyAtlasCounterfactualProposal(proposalTamper, valid));
}

test('WP-506 mutants: identity bound authority conflict denominator and tamper mutants are all killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const original = await import(pathToFileURL(MODULE_PATH).href);
  await oracle(original);
  const results = [];
  for (const mutant of MUTANTS) {
    assert.equal(source.split(mutant.find).length - 1, 1, `mutant anchor must be unique: ${mutant.id}`);
    const loaded = await loadMutant(source, mutant);
    let killed = false;
    try { await oracle(loaded.module); } catch { killed = true; }
    finally { fs.rmSync(loaded.dir, { recursive: true, force: true }); }
    results.push({ id: mutant.id, killed });
  }
  const survived = results.filter((row) => !row.killed).map((row) => row.id);
  console.log(`R24_WP506_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived })}`);
  assert.equal(results.length, 10);
  assert.deepEqual(survived, []);
});
