'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');
const fixtures = require('./r24-wp507-atlas-product-claim.test.js');

const ROOT = path.resolve(__dirname, '..', '..');
const importRepo = (relativePath) => import(pathToFileURL(path.join(ROOT, relativePath)).href);

test('WP-507 integration: the package cross-binds all four assurance classes and eight predecessor node proofs', async () => {
  const module = await importRepo('src/core/atlas-product-claim-v1.mjs');
  const receipt = module.compileAtlasProductClaim(fixtures.validInput(module));
  assert.deepEqual(receipt.profileVerdict.requiredNodeIds, module.REQUIRED_ATLAS_PRODUCT_NODE_IDS);
  assert.deepEqual(receipt.profileVerdict.requiredAssuranceClasses, module.REQUIRED_ATLAS_PRODUCT_ASSURANCE_CLASSES);
  assert.equal(receipt.productPackage.nodeProofSetDigest, receipt.exportIr.nodeProofSetDigest);
  assert.equal(receipt.productPackage.assuranceProofSetDigest, receipt.exportIr.assuranceProofSetDigest);
  assert.equal(receipt.productPackage.exportIrManifestDigest, receipt.exportIr.manifestDigest);
  assert.equal(receipt.ownerGateDecision.gateId, 'ATLAS_PROFILE_RELEASE_PERMIT');
  assert.equal(receipt.ownerGateDecision.scopeNodeId, 'WP-507_ATLAS_PRODUCT_CLAIM');
});

test('WP-507 differential and large-corpus oracle: 8,192 supporting rows compile deterministically within twenty seconds', async () => {
  const module = await importRepo('src/core/atlas-product-claim-v1.mjs');
  const input = fixtures.validInput(module, { supportingCount: 1_024 });
  const started = performance.now();
  const first = module.compileAtlasProductClaim(input);
  const second = module.compileAtlasProductClaim({
    ...input,
    nodeProofs: [...input.nodeProofs].reverse().map((proof) => {
      const raw = fixtures.clone(proof);
      delete raw.proofDigest;
      raw.supportingEvidence.reverse();
      return module.createAtlasProductNodeProof(raw);
    }),
    assuranceProofs: [...input.assuranceProofs].reverse(),
  });
  const elapsedMs = performance.now() - started;
  assert.deepEqual(second, first);
  assert.equal(first.profileVerdict.supportingEvidenceDenominator, 8_192);
  assert.ok(elapsedMs < 20_000, `WP507 large-corpus package exceeded bound: ${elapsedMs}ms`);
  console.log(`R24_WP507_LARGE_CORPUS_RECEIPT=${JSON.stringify({ supportingEvidence: 8192, nodeProofs: 8, assuranceProofs: 4, elapsedMs })}`);
});
