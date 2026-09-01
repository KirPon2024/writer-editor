'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src/core/atlas-foundation-claim-v1.mjs');
const HEAD = '4'.repeat(40);
const TREE = '5'.repeat(40);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const digest = (value) => `sha256:${crypto.createHash('sha256').update(
  typeof value === 'string' ? value : canonical(value),
  'utf8',
).digest('hex')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

const MUTANTS = Object.freeze([
  {
    id: 'origin-main-mismatch-admitted',
    find: "  if (identity.originMainSha !== identity.headSha) fail('E_ATLAS_FOUNDATION_ORIGIN_MISMATCH');",
    replace: "  if (false) fail('E_ATLAS_FOUNDATION_ORIGIN_MISMATCH');",
  },
  {
    id: 'writer-receipt-digest-tamper-admitted',
    find: "  if (suppliedDigest !== digestCanonical(receipt)) fail('E_ATLAS_FOUNDATION_WRITER_RECEIPT_DIGEST_MISMATCH');",
    replace: "  if (false) fail('E_ATLAS_FOUNDATION_WRITER_RECEIPT_DIGEST_MISMATCH');",
  },
  {
    id: 'stale-writer-identity-admitted',
    find: '  ) fail(\'E_ATLAS_FOUNDATION_WRITER_IDENTITY_STALE\');',
    replace: '  ) { /* mutant admits stale Writer identity */ }',
  },
  {
    id: 'foundation-denominator-shrink-admitted',
    find: "  if (value.length !== REQUIRED_FOUNDATION_NODE_IDS.length) fail('E_ATLAS_FOUNDATION_PROOF_DENOMINATOR');",
    replace: "  if (false) fail('E_ATLAS_FOUNDATION_PROOF_DENOMINATOR');",
  },
  {
    id: 'duplicate-foundation-node-admitted',
    find: "  if (new Set(proofs.map((proof) => proof.nodeId)).size !== proofs.length) fail('E_ATLAS_FOUNDATION_DUPLICATE_NODE');",
    replace: "  if (false) fail('E_ATLAS_FOUNDATION_DUPLICATE_NODE');",
  },
  {
    id: 'foundation-proof-digest-tamper-admitted',
    find: "  if (proof.proofDigest !== rebuilt.proofDigest) fail('E_ATLAS_FOUNDATION_PROOF_DIGEST_MISMATCH', proof.nodeId);",
    replace: "  if (false) fail('E_ATLAS_FOUNDATION_PROOF_DIGEST_MISMATCH', proof.nodeId);",
  },
  {
    id: 'stale-foundation-proof-admitted',
    find: "    fail('E_ATLAS_FOUNDATION_PROOF_IDENTITY_STALE', proof.nodeId);",
    replace: "    if (false) fail('E_ATLAS_FOUNDATION_PROOF_IDENTITY_STALE', proof.nodeId);",
  },
  {
    id: 'global-program-pass-admitted',
    find: '  if (value.programVerdict !== PROGRAM_VERDICT || value.globalScalarPass !== false) {',
    replace: '  if (false) {',
  },
  {
    id: 'product-mutation-authority-leaked',
    find: '      productMutation: false,',
    replace: '      productMutation: true,',
  },
]);

function writerReceipt() {
  return {
    ok: true,
    schemaVersion: 'yalken.r24.v0.writer-claim-compiler.receipt.v1',
    verdict: 'PASS',
    code: 'R24_V0_PROFILE_VERDICT_COMPILED',
    generatedAt: '2026-09-01T00:00:00.000Z',
    exactIdentity: { headSha: HEAD, originMainSha: HEAD, treeSha: TREE, dirty: false },
    selectedProfiles: ['SHARED_ASSURANCE', 'WRITER_CORE'],
    profileVerdict: {
      profileId: 'WRITER_CORE',
      verdict: 'WRITER_CORE_EVIDENCE_BOUND_BY_R24_EXACT_HEAD_PREFIX',
      claimCeiling: 'PROFILE_VERDICT_ONLY',
      requiredEvidenceClass: 'INDEPENDENT_EXACT_HEAD',
      requiredStageCount: 2,
      closedStageCount: 2,
      requiredStageIds: ['F0_WRITER_REFINEMENT_CONFORMANCE', 'T1_ANCHOR_LINEAGE'],
      gateEvidenceDigest: '6'.repeat(64),
    },
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    globalScalarPassForbidden: true,
    optionalProfilesExcluded: ['ATLAS_MAPS_DERIVED', 'WORD_ROUNDTRIP', 'PACKAGED_RELEASE_SECURITY'],
    nonClaims: ['NO_PROGRAM_DONE', 'NO_GLOBAL_SCALAR_PASS', 'NO_ATLAS_PROFILE_VERDICT'],
    workflow: { v0Script: 'test:r24-v0', v0WorkflowIndex: 2, supportingScriptsBeforeV0: ['test:r24-f0'] },
  };
}

function request(overrides = {}) {
  return {
    profileId: 'ATLAS_FOUNDATION',
    claimCeiling: 'NODE_AND_SELECTED_PROFILE_ONLY',
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    globalScalarPass: false,
    includeWriterV0: true,
    promoteProfiles: [],
    ...overrides,
  };
}

function proofInput(module, nodeId, index = 0) {
  return {
    schemaVersion: module.ATLAS_FOUNDATION_PROOF_SCHEMA_VERSION,
    nodeId,
    state: 'DONE',
    verdict: 'PASS',
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    evaluationSha: HEAD,
    evaluationTreeSha: TREE,
    terminalReceiptDigest: digest(`terminal-${nodeId}-${index}`),
    claimBindingDigest: digest(`binding-${nodeId}-${index}`),
    supportingEvidence: [{
      evidenceId: `evidence-${nodeId}-${index}`,
      evidenceClass: 'INDEPENDENT_EXACT_HEAD',
      evidenceDigest: digest(`evidence-${nodeId}-${index}`),
    }],
  };
}

function validInput(module) {
  const writerV0Receipt = writerReceipt();
  return {
    exactIdentity: { headSha: HEAD, originMainSha: HEAD, treeSha: TREE, dirty: false },
    writerV0Receipt,
    writerV0ReceiptDigest: digest(writerV0Receipt),
    foundationProofs: module.REQUIRED_FOUNDATION_NODE_IDS.map(
      (nodeId, index) => module.createAtlasFoundationProof(proofInput(module, nodeId, index)),
    ),
    claimRequest: request(),
  };
}

async function assertWp404Oracle(module) {
  const input = validInput(module);
  const receipt = module.compileAtlasFoundationClaim(input);
  assert.equal(receipt.authority.productMutation, false);
  assert.equal(receipt.foundation.requiredNodeCount, 4);
  assert.equal(receipt.foundation.closedNodeCount, 4);
  assert.equal(module.verifyAtlasFoundationClaim(receipt), receipt);

  assert.throws(() => module.compileAtlasFoundationClaim({
    ...input,
    exactIdentity: { ...input.exactIdentity, originMainSha: '7'.repeat(40) },
  }), (error) => error.code === 'E_ATLAS_FOUNDATION_ORIGIN_MISMATCH');
  assert.throws(() => module.compileAtlasFoundationClaim({
    ...input,
    writerV0ReceiptDigest: digest('forged-writer'),
  }));
  const staleWriter = clone(input.writerV0Receipt);
  staleWriter.exactIdentity.treeSha = '8'.repeat(40);
  assert.throws(() => module.compileAtlasFoundationClaim({
    ...input,
    writerV0Receipt: staleWriter,
    writerV0ReceiptDigest: digest(staleWriter),
  }));
  assert.throws(() => module.compileAtlasFoundationClaim({
    ...input,
    foundationProofs: input.foundationProofs.slice(1),
  }), (error) => error.code === 'E_ATLAS_FOUNDATION_PROOF_DENOMINATOR');
  const duplicate = [...input.foundationProofs];
  duplicate[3] = module.createAtlasFoundationProof(proofInput(module, module.REQUIRED_FOUNDATION_NODE_IDS[0], 99));
  assert.throws(
    () => module.compileAtlasFoundationClaim({ ...input, foundationProofs: duplicate }),
    (error) => error.code === 'E_ATLAS_FOUNDATION_DUPLICATE_NODE',
  );
  const tampered = clone(input.foundationProofs);
  tampered[0].claimBindingDigest = digest('forged-binding');
  assert.throws(() => module.compileAtlasFoundationClaim({ ...input, foundationProofs: tampered }));
  const stale = clone(input.foundationProofs);
  stale[0] = module.createAtlasFoundationProof({
    ...proofInput(module, module.REQUIRED_FOUNDATION_NODE_IDS[0]),
    evaluationSha: '9'.repeat(40),
  });
  assert.throws(() => module.compileAtlasFoundationClaim({ ...input, foundationProofs: stale }));
  assert.throws(() => module.compileAtlasFoundationClaim({
    ...input,
    claimRequest: request({ programVerdict: 'PASS', globalScalarPass: true }),
  }));
}

async function loadMutant(source, mutant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp404-mutant-'));
  const coreDir = path.join(dir, 'core');
  fs.mkdirSync(coreDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/core/browser-safe-hash.mjs'), path.join(coreDir, 'browser-safe-hash.mjs'));
  const target = path.join(coreDir, 'atlas-foundation-claim-v1.mjs');
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  const module = await import(`${pathToFileURL(target).href}?mutant=${encodeURIComponent(mutant.id)}`);
  return { dir, module };
}

test('WP-404 implementation mutants: every identity, denominator, digest, overclaim and authority mutant is killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const original = await import(pathToFileURL(MODULE_PATH).href);
  await assertWp404Oracle(original);
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const loaded = await loadMutant(source, mutant);
    let killed = false;
    let detail = 'survived';
    try {
      await assertWp404Oracle(loaded.module);
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    } finally {
      fs.rmSync(loaded.dir, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed, detail });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_WP404_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length, 9);
  assert.deepEqual(survived, []);
});
