'use strict';

// R2.4 A0 Atlas tests: the compiler accepts only exact-head, profile-scoped
// incremental/full equivalence proof and rejects stale, overbroad, or unbound
// workflow evidence.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'atlas-incremental-equivalence-a0.mjs');
const DAG_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const CONTRACTS_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'SCIENTIFIC_CONTRACTS.json');
const HEAD = 'a'.repeat(40);
const ORIGIN = 'b'.repeat(40);
const TREE = 'c'.repeat(40);

let proofMemo = null;

async function compiler() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function packageFixture() {
  return {
    scripts: {
      'test:r24-v0': 'node --test test/unit/r24-v0-writer-claim-compiler.test.js test/unit/r24-v0-writer-claim-mutants.test.js',
      'test:r24-a0': 'node --test test/unit/r24-a0-atlas-incremental-equivalence.test.js test/unit/r24-a0-atlas-physics.test.js test/unit/r24-a0-atlas-mutants.test.js',
    },
  };
}

function workflowFixture(scripts = ['test:r24-v0', 'test:r24-a0']) {
  return scripts.map((script, index) => [
    `      - name: Gate ${index}`,
    `        run: npm run -s ${script}`,
  ].join('\n')).join('\n');
}

async function validProof(c) {
  if (!proofMemo) proofMemo = c.runAtlasA0Proof({ deadlineMs: 2500 });
  return clone(proofMemo);
}

async function validInput(c, overrides = {}) {
  return {
    program: overrides.program || loadJson(DAG_PATH),
    scientificContracts: overrides.scientificContracts || loadJson(CONTRACTS_PATH),
    repoState: overrides.repoState || {
      headSha: HEAD,
      originMainSha: ORIGIN,
      treeSha: TREE,
      dirty: false,
    },
    packageJson: overrides.packageJson || packageFixture(),
    workflowText: overrides.workflowText || workflowFixture(),
    expectedHeadSha: overrides.expectedHeadSha || HEAD,
    expectedOriginMainSha: overrides.expectedOriginMainSha === undefined ? ORIGIN : overrides.expectedOriginMainSha,
    proof: overrides.proof || await validProof(c),
    claimRequest: overrides.claimRequest,
    now: '2026-08-22T14:00:00.000Z',
  };
}

test('A0 compiles an Atlas-profile exact-head incremental/full equivalence receipt', async () => {
  const c = await compiler();
  const result = c.compileAtlasA0Evidence(await validInput(c));

  assert.equal(result.ok, true);
  assert.equal(result.code, 'R24_A0_ATLAS_INCREMENTAL_EQUIVALENCE_COMPILED');
  assert.equal(result.stageId, 'A0_ATLAS_INCREMENTAL_EQUIVALENCE');
  assert.equal(result.profileId, 'ATLAS_MAPS_DERIVED');
  assert.equal(result.claimCeiling, 'ATLAS_SUPPORTED_SCALE_PROFILE_ONLY');
  assert.equal(result.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.deepEqual(result.evidence.classes, ['E1_MODEL', 'E2_CONTRACT', 'E3_INTEGRATION', 'E4_FAULT_INJECTION', 'E5_PHYSICAL']);
  assert.match(result.evidence.proofHash, /^[0-9a-f]{64}$/u);
  assert.match(result.receiptHash, /^[0-9a-f]{64}$/u);
  assert.equal(result.schedulerLaw.queue.bounded, true);
  assert.equal(result.nonClaims.includes('NO_PROGRAM_DONE'), true);
  assert.equal(result.nonClaims.includes('NO_WRITER_CORE_PROMOTION'), true);

  console.log(`R24_A0_COMPILER_RECEIPT=${JSON.stringify({
    verdict: result.verdict,
    proofHash: result.evidence.proofHash,
    largeGraph: result.evidence.largeGraph,
  })}`);
});

test('A0 rejects stale exact identity and dirty worktree evidence', async () => {
  const c = await compiler();
  const staleHead = c.compileAtlasA0Evidence(await validInput(c, {
    repoState: { headSha: 'd'.repeat(40), originMainSha: ORIGIN, treeSha: TREE, dirty: false },
  }));
  assert.equal(staleHead.ok, false);
  assert.equal(staleHead.code, 'E_R24_A0_EXACT_HEAD_MISMATCH');

  const dirty = c.compileAtlasA0Evidence(await validInput(c, {
    repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: true },
  }));
  assert.equal(dirty.ok, false);
  assert.equal(dirty.code, 'E_R24_A0_WORKTREE_DIRTY');
});

test('A0 rejects missing package/workflow binding and incorrect V0 order', async () => {
  const c = await compiler();
  const missingPackage = c.compileAtlasA0Evidence(await validInput(c, {
    packageJson: { scripts: { 'test:r24-v0': 'node --test v0' } },
  }));
  assert.equal(missingPackage.ok, false);
  assert.equal(missingPackage.code, 'E_R24_A0_PACKAGE_SCRIPT_MISSING');

  const missingWorkflow = c.compileAtlasA0Evidence(await validInput(c, {
    workflowText: workflowFixture(['test:r24-v0']),
  }));
  assert.equal(missingWorkflow.ok, false);
  assert.equal(missingWorkflow.code, 'E_R24_A0_WORKFLOW_STEP_MISSING');
  assert.equal(missingWorkflow.detail, 'test:r24-a0');

  const badOrder = c.compileAtlasA0Evidence(await validInput(c, {
    workflowText: workflowFixture(['test:r24-a0', 'test:r24-v0']),
  }));
  assert.equal(badOrder.ok, false);
  assert.equal(badOrder.code, 'E_R24_A0_WORKFLOW_ORDER');
});

test('A0 rejects program contract drift and missing scientific Atlas claim binding', async () => {
  const c = await compiler();
  const program = loadJson(DAG_PATH);
  const a0 = program.stages.find((stage) => stage.stageId === 'A0_ATLAS_INCREMENTAL_EQUIVALENCE');
  a0.requiredEvidence = a0.requiredEvidence.filter((item) => item !== 'E5_PHYSICAL');
  const missingEvidence = c.compileAtlasA0Evidence(await validInput(c, { program }));
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.code, 'E_R24_A0_REQUIRED_EVIDENCE_MISSING');

  const contracts = loadJson(CONTRACTS_PATH);
  contracts.claims = contracts.claims.filter((claim) => claim.claimId !== 'CLM_ATLAS_DERIVED_SAFETY');
  const missingClaim = c.compileAtlasA0Evidence(await validInput(c, { scientificContracts: contracts }));
  assert.equal(missingClaim.ok, false);
  assert.equal(missingClaim.code, 'E_R24_A0_ATLAS_CLAIM_CONTRACT_MISSING');
});

test('A0 rejects optional-profile imports, overclaims, and global PASS requests', async () => {
  const c = await compiler();
  const profileImport = c.compileAtlasA0Evidence(await validInput(c, {
    claimRequest: { profiles: ['ATLAS_MAPS_DERIVED', 'WRITER_CORE'] },
  }));
  assert.equal(profileImport.ok, false);
  assert.equal(profileImport.code, 'E_R24_A0_PROFILE_IMPORT_FORBIDDEN');

  const overclaim = c.compileAtlasA0Evidence(await validInput(c, {
    claimRequest: { claimCeiling: 'UNIVERSAL_ATLAS_SCALE' },
  }));
  assert.equal(overclaim.ok, false);
  assert.equal(overclaim.code, 'E_R24_A0_OVERCLAIM');

  const globalPass = c.compileAtlasA0Evidence(await validInput(c, {
    claimRequest: { programVerdict: 'PASS' },
  }));
  assert.equal(globalPass.ok, false);
  assert.equal(globalPass.code, 'E_R24_A0_PROGRAM_SCALAR_PASS_FORBIDDEN');
});

test('A0 rejects proof divergence, stale acceptance, and unbounded resource evidence', async () => {
  const c = await compiler();
  const divergence = await validProof(c);
  divergence.observations.normal.equivalent = false;
  const divergenceResult = c.compileAtlasA0Evidence(await validInput(c, { proof: divergence }));
  assert.equal(divergenceResult.ok, false);
  assert.equal(divergenceResult.code, 'E_R24_A0_INCREMENTAL_FULL_DIVERGENCE');

  const stale = await validProof(c);
  stale.faults.staleSource.accepted = true;
  const staleResult = c.compileAtlasA0Evidence(await validInput(c, { proof: stale }));
  assert.equal(staleResult.ok, false);
  assert.equal(staleResult.code, 'E_R24_A0_STALE_SOURCE_ADMITTED');

  const resource = await validProof(c);
  resource.resource.withinBudget = false;
  const resourceResult = c.compileAtlasA0Evidence(await validInput(c, { proof: resource }));
  assert.equal(resourceResult.ok, false);
  assert.equal(resourceResult.code, 'E_R24_A0_RESOURCE_BUDGET_UNPROVEN');
});
