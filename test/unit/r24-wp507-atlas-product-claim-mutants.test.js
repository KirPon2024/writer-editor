'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fixtures = require('./r24-wp507-atlas-product-claim.test.js');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-product-claim-v1.mjs');

const MUTANTS = Object.freeze([
  { id: 'origin-mismatch-admitted', find: "  if (identity.originMainSha !== identity.headSha) fail('E_ATLAS_PRODUCT_ORIGIN_MISMATCH');", replace: "  if (false) fail('E_ATLAS_PRODUCT_ORIGIN_MISMATCH');" },
  { id: 'node-denominator-shrunk', find: "  'WP-506_COUNTERFACTUAL',", replace: "  // mutant drops WP506 from the required denominator" },
  { id: 'assurance-denominator-shrunk', find: "  'SECURITY',", replace: "  // mutant drops SECURITY from the required denominator" },
  { id: 'node-proof-tamper-admitted', find: "  if (value.proofDigest !== rebuilt.proofDigest) fail('E_ATLAS_PRODUCT_NODE_PROOF_DIGEST_MISMATCH', String(value.nodeId));", replace: "  if (false) fail('E_ATLAS_PRODUCT_NODE_PROOF_DIGEST_MISMATCH', String(value.nodeId));" },
  { id: 'assurance-skip-admitted', find: "  if (required === 0 || passed !== required || skipped !== 0 || todos !== 0) {", replace: "  if (false) {" },
  { id: 'stale-node-admitted', find: "      fail('E_ATLAS_PRODUCT_NODE_PROOF_IDENTITY_STALE', proof.nodeId);", replace: "      if (false) fail('E_ATLAS_PRODUCT_NODE_PROOF_IDENTITY_STALE', proof.nodeId);" },
  { id: 'export-ir-cross-binding-admitted', find: "  if (exportIr.nodeProofSetDigest !== nodeProofSetDigest || exportIr.assuranceProofSetDigest !== assuranceProofSetDigest) {", replace: "  if (false) {" },
  { id: 'gate-denial-admitted', find: "  if (input.decision !== 'APPROVED') fail('E_ATLAS_PRODUCT_GATE_NOT_APPROVED');", replace: "  if (false) fail('E_ATLAS_PRODUCT_GATE_NOT_APPROVED');" },
  { id: 'product-mutation-authority-leaked', find: '      productMutation: false,', replace: '      productMutation: true,' },
  { id: 'public-release-authority-leaked', find: '      publicRelease: false,', replace: '      publicRelease: true,' },
]);

async function assertOracle(module) {
  const base = fixtures.validInput(module);
  const receipt = module.compileAtlasProductClaim(base);
  assert.equal(receipt.profileVerdict.closedNodeCount, 8);
  assert.equal(receipt.profileVerdict.closedAssuranceCount, 4);
  assert.equal(receipt.authority.productMutation, false);
  assert.equal(receipt.authority.publicRelease, false);
  assert.throws(() => module.compileAtlasProductClaim({ ...base, exactIdentity: { ...base.exactIdentity, originMainSha: 'c'.repeat(40) } }));
  assert.throws(() => module.compileAtlasProductClaim({ ...base, nodeProofs: base.nodeProofs.slice(1) }));
  assert.throws(() => module.compileAtlasProductClaim({ ...base, assuranceProofs: base.assuranceProofs.slice(1) }));
  const tampered = fixtures.clone(base.nodeProofs);
  tampered[0].claimBindingDigest = module.digestAtlasProductValue('tampered');
  const normalizedTampered = fixtures.clone(tampered);
  const normalizedTamperedFirst = fixtures.clone(normalizedTampered[0]);
  delete normalizedTamperedFirst.proofDigest;
  normalizedTampered[0] = module.createAtlasProductNodeProof(normalizedTamperedFirst);
  const tamperedExportRaw = fixtures.clone(base.exportIr);
  delete tamperedExportRaw.manifestDigest;
  tamperedExportRaw.nodeProofSetDigest = module.digestAtlasProductValue(normalizedTampered);
  assert.throws(() => module.compileAtlasProductClaim({
    ...base,
    nodeProofs: tampered,
    exportIr: module.createAtlasProductExportIr(tamperedExportRaw),
  }));
  const skipped = fixtures.clone(base.assuranceProofs);
  const rawAssurance = fixtures.clone(skipped[0]);
  delete rawAssurance.proofDigest;
  rawAssurance.skipped = 1;
  rawAssurance.passed -= 1;
  assert.throws(() => module.createAtlasProductAssuranceProof(rawAssurance));
  const stale = fixtures.clone(base.nodeProofs);
  const rawNode = fixtures.clone(stale[0]);
  delete rawNode.proofDigest;
  rawNode.evaluationSha = 'd'.repeat(40);
  stale[0] = module.createAtlasProductNodeProof(rawNode);
  const staleExportRaw = fixtures.clone(base.exportIr);
  delete staleExportRaw.manifestDigest;
  staleExportRaw.nodeProofSetDigest = module.digestAtlasProductValue(stale);
  assert.throws(() => module.compileAtlasProductClaim({
    ...base,
    nodeProofs: stale,
    exportIr: module.createAtlasProductExportIr(staleExportRaw),
  }));
  const wrongExportRaw = fixtures.clone(base.exportIr);
  delete wrongExportRaw.manifestDigest;
  wrongExportRaw.nodeProofSetDigest = module.digestAtlasProductValue('wrong');
  assert.throws(() => module.compileAtlasProductClaim({ ...base, exportIr: module.createAtlasProductExportIr(wrongExportRaw) }));
  assert.throws(() => fixtures.gateDecision(module, { decision: 'DENIED' }));
}

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp507-mutant-'));
  const coreDir = path.join(dir, 'core');
  fs.mkdirSync(coreDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/core/browser-safe-hash.mjs'), path.join(coreDir, 'browser-safe-hash.mjs'));
  const target = path.join(coreDir, 'atlas-product-claim-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return { dir, module: await import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`) };
}

test('WP-507 implementation mutants: identity, denominator, digest, assurance, gate, ExportIR and authority mutants are killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const original = await import(pathToFileURL(MODULE_PATH).href);
  await assertOracle(original);
  const results = [];
  for (const mutant of MUTANTS) {
    assert.equal(source.split(mutant.find).length - 1, 1, `mutant anchor must be unique: ${mutant.id}`);
    const loaded = await loadMutant(source, mutant);
    let killed = false;
    try {
      await assertOracle(loaded.module);
    } catch (error) {
      killed = true;
    } finally {
      fs.rmSync(loaded.dir, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_WP507_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((row) => row.id) })}`);
  assert.equal(results.length, 10);
  assert.deepEqual(survived, []);
});
