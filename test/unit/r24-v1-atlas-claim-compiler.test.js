'use strict';

// R2.4 V1 Atlas claim compiler tests: exact-head A0 evidence is accepted for
// the Atlas profile only; Writer promotion, stale evidence, optional profile
// imports, contract drift, and workflow drift fail closed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const DAG_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const CONTRACTS_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'SCIENTIFIC_CONTRACTS.json');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'rtk-required.yml');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'atlas-claim-compiler-v1.mjs');
const HEAD = 'a'.repeat(40);
const ORIGIN = 'b'.repeat(40);
const TREE = 'c'.repeat(40);
const DIGEST = 'f'.repeat(64);

async function compiler() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function loadDag() {
  return JSON.parse(fs.readFileSync(DAG_PATH, 'utf8'));
}

function loadContracts() {
  return JSON.parse(fs.readFileSync(CONTRACTS_PATH, 'utf8'));
}

function loadPackage() {
  return JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
}

function loadWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

function packageFixture(c, mutateScripts = (scripts) => scripts) {
  const scripts = {};
  for (const script of Object.values(c.STAGE_SCRIPT_BY_ID)) scripts[script] = `node --test ${script}`;
  return { scripts: mutateScripts(scripts) };
}

function workflowFixture(mutateScripts = (scripts) => scripts) {
  const scripts = [
    'test:r24-e0',
    'test:r24-q0',
    'test:r24-p0',
    'test:r24-s0',
    'test:r24-p1',
    'test:r24-s1',
    'test:r24-k0',
    'test:r24-r0',
    'test:r24-p2',
    'test:r24-r1',
    'test:r24-p3',
    'test:r24-t0',
    'test:r24-sec0',
    'test:r24-ent0',
    'test:r24-k1',
    'test:r24-t1',
    'test:r24-wp100',
    'test:r24-wp101',
    'test:r24-wp102',
    'test:r24-wp103',
    'test:r24-wp104',
    'test:r24-r2',
    'test:r24-r3',
    'test:r24-r4',
    'test:r24-r5',
    'test:r24-r6',
    'test:r24-f0',
    'test:r24-v0',
    'test:r24-a0',
    'test:r24-v1',
  ];
  return mutateScripts(scripts).map((script, index) => [
    `      - name: Gate ${index}`,
    `        run: npm run -s ${script}`,
  ].join('\n')).join('\n');
}

function observedRow(c, program, stageId, overrides = {}) {
  const stage = program.stages.find((row) => row.stageId === stageId);
  const script = c.STAGE_SCRIPT_BY_ID[stageId];
  return {
    stageId,
    status: 'SUCCESS',
    headSha: HEAD,
    treeSha: TREE,
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    source: 'V1_COMPILER_CONTRACT_FIXTURE',
    workflowIndex: 1,
    script,
    candidate: { stageId, script, profileId: stage?.profile || null },
    run: { id: `run-${stageId}`, headSha: HEAD, conclusion: 'success' },
    job: { id: `job-${stageId}`, name: `job ${stageId}`, conclusion: 'success' },
    step: { name: `step ${stageId}`, number: 1, conclusion: 'success' },
    counts: { denominator: 1, passed: 1, failed: 0, skipped: 0, exitCode: 0 },
    artifact: { digest: DIGEST },
    tool: { digest: DIGEST },
    schema: { digest: DIGEST },
    fixture: { digest: DIGEST },
    ...overrides,
  };
}

function observedAtlasEvidence(c, program = loadDag()) {
  return [observedRow(c, program, 'A0_ATLAS_INCREMENTAL_EQUIVALENCE')];
}

function validInput(c, overrides = {}) {
  const repoState = overrides.repoState || {
    headSha: HEAD,
    originMainSha: ORIGIN,
    treeSha: TREE,
    dirty: false,
  };
  return {
    program: overrides.program || loadDag(),
    scientificContracts: overrides.scientificContracts || loadContracts(),
    repoState,
    packageJson: overrides.packageJson || packageFixture(c),
    workflowText: overrides.workflowText || workflowFixture(),
    expectedHeadSha: overrides.expectedHeadSha || HEAD,
    expectedOriginMainSha: overrides.expectedOriginMainSha === undefined ? ORIGIN : overrides.expectedOriginMainSha,
    gateEvidence: overrides.omitGateEvidence === true
      ? undefined
      : (Object.prototype.hasOwnProperty.call(overrides, 'gateEvidence') ? overrides.gateEvidence : observedAtlasEvidence(c, overrides.program || loadDag())),
    claimRequest: overrides.claimRequest,
    selectedProfiles: overrides.selectedProfiles,
    now: '2026-08-22T13:30:00.000Z',
  };
}

test('V1 compiles an Atlas-profile verdict from exact-head A0 evidence only', async () => {
  const c = await compiler();
  const result = c.compileAtlasVerdict(validInput(c));

  assert.equal(result.ok, true);
  assert.equal(result.code, 'R24_V1_ATLAS_PROFILE_VERDICT_COMPILED');
  assert.equal(result.profileVerdict.profileId, 'ATLAS_MAPS_DERIVED');
  assert.equal(result.profileVerdict.claimCeiling, 'PROFILE_VERDICT_ONLY');
  assert.equal(result.profileVerdict.verdict, 'ATLAS_MAPS_DERIVED_EVIDENCE_BOUND_BY_R24_EXACT_HEAD_A0_PREFIX');
  assert.equal(result.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.globalScalarPassForbidden, true);
  assert.deepEqual(result.selectedProfiles, ['SHARED_ASSURANCE', 'WRITER_CORE', 'ATLAS_MAPS_DERIVED']);
  assert.deepEqual(result.profileVerdict.requiredStageIds, ['A0_ATLAS_INCREMENTAL_EQUIVALENCE']);
  assert.equal(result.profileVerdict.requiredStageCount, 1);
  assert.equal(result.profileVerdict.closedStageCount, 1);
  assert.equal(result.dependencyProfilesObserved.includes('WRITER_CORE'), true);
  assert.equal(result.nonClaimedProfiles.includes('WRITER_CORE'), true);
  assert.equal(result.optionalProfilesExcluded.includes('PACKAGED_RELEASE_SECURITY'), true);
  assert.equal(result.nonClaims.includes('NO_PROGRAM_DONE'), true);
  assert.equal(result.nonClaims.includes('NO_WRITER_CORE_PROMOTION'), true);
  assert.equal(result.sourceClaimContract.cannotPromote.includes('UNIVERSAL_SCALE'), true);
  assert.equal(result.workflow.v0WorkflowIndex < result.workflow.a0WorkflowIndex, true);
  assert.equal(result.workflow.a0WorkflowIndex < result.workflow.v1WorkflowIndex, true);

  console.log(`R24_V1_COMPILER_RECEIPT=${JSON.stringify({
    verdict: result.verdict,
    profile: result.profileVerdict.profileId,
    requiredStageCount: result.profileVerdict.requiredStageCount,
    nonClaims: result.nonClaims.length,
  })}`);
});

test('V1 binds the current package script and required workflow order', async () => {
  const c = await compiler();
  const result = c.compileAtlasVerdict(validInput(c, {
    packageJson: loadPackage(),
    workflowText: loadWorkflow(),
  }));

  assert.equal(result.ok, true);
  assert.equal(result.workflow.v1Script, 'test:r24-v1');
  assert.equal(result.workflow.a0WorkflowIndex < result.workflow.v1WorkflowIndex, true);
  assert.deepEqual(result.profileVerdict.requiredStageIds, ['A0_ATLAS_INCREMENTAL_EQUIVALENCE']);
});

test('V1 rejects stale head, dirty state, and stale A0 gate evidence', async () => {
  const c = await compiler();
  const staleRepo = c.compileAtlasVerdict(validInput(c, {
    repoState: { headSha: 'd'.repeat(40), originMainSha: ORIGIN, treeSha: TREE, dirty: false },
  }));
  assert.equal(staleRepo.ok, false);
  assert.equal(staleRepo.code, 'E_R24_V1_EXACT_HEAD_MISMATCH');

  const dirtyRepo = c.compileAtlasVerdict(validInput(c, {
    repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: true },
  }));
  assert.equal(dirtyRepo.ok, false);
  assert.equal(dirtyRepo.code, 'E_R24_V1_WORKTREE_DIRTY');

  const evidence = observedAtlasEvidence(c);
  evidence[0] = { ...evidence[0], headSha: 'e'.repeat(40) };
  const staleEvidence = c.compileAtlasVerdict(validInput(c, { gateEvidence: evidence }));
  assert.equal(staleEvidence.ok, false);
  assert.equal(staleEvidence.code, 'E_R24_V1_GATE_HEAD_MISMATCH');
});

test('V1 rejects Writer promotion, profile imports, overclaims, and global scalar pass requests', async () => {
  const c = await compiler();
  const writerClaim = c.compileAtlasVerdict(validInput(c, {
    claimRequest: { profiles: ['ATLAS_MAPS_DERIVED', 'WRITER_CORE'] },
  }));
  assert.equal(writerClaim.ok, false);
  assert.equal(writerClaim.code, 'E_R24_V1_PROFILE_IMPORT_FORBIDDEN');

  const writerVerdict = c.compileAtlasVerdict(validInput(c, {
    claimRequest: { includeWriterCoreVerdict: true },
  }));
  assert.equal(writerVerdict.ok, false);
  assert.equal(writerVerdict.code, 'E_R24_V1_WRITER_PROMOTION_FORBIDDEN');

  const releaseClaim = c.compileAtlasVerdict(validInput(c, {
    claimRequest: { claimCeiling: 'SUPPORTED_RELEASE_TARGETS_ONLY' },
  }));
  assert.equal(releaseClaim.ok, false);
  assert.equal(releaseClaim.code, 'E_R24_V1_OVERCLAIM');

  const globalPass = c.compileAtlasVerdict(validInput(c, {
    claimRequest: { programVerdict: 'PASS' },
  }));
  assert.equal(globalPass.ok, false);
  assert.equal(globalPass.code, 'E_R24_V1_PROGRAM_SCALAR_PASS_FORBIDDEN');
});

test('V1 rejects scientific contract drift and selected profile drift', async () => {
  const c = await compiler();
  const missingClaim = loadContracts();
  missingClaim.claims = missingClaim.claims.filter((claim) => claim.claimId !== 'CLM_ATLAS_DERIVED_SAFETY');
  const noClaim = c.compileAtlasVerdict(validInput(c, { scientificContracts: missingClaim }));
  assert.equal(noClaim.ok, false);
  assert.equal(noClaim.code, 'E_R24_V1_ATLAS_CLAIM_CONTRACT_MISSING');

  const missingPromotionGuard = loadContracts();
  missingPromotionGuard.claims = missingPromotionGuard.claims.map((claim) => (
    claim.claimId === 'CLM_ATLAS_DERIVED_SAFETY'
      ? { ...claim, cannotPromote: claim.cannotPromote.filter((profile) => profile !== 'WRITER_CORE') }
      : claim
  ));
  const promotion = c.compileAtlasVerdict(validInput(c, { scientificContracts: missingPromotionGuard }));
  assert.equal(promotion.ok, false);
  assert.equal(promotion.code, 'E_R24_V1_CANNOT_PROMOTE_MISSING');

  const profileDrift = c.compileAtlasVerdict(validInput(c, {
    selectedProfiles: ['SHARED_ASSURANCE', 'ATLAS_MAPS_DERIVED'],
  }));
  assert.equal(profileDrift.ok, false);
  assert.equal(profileDrift.code, 'E_R24_V1_SELECTED_PROFILE_SET');
});

test('V1 rejects workflow and package drift around V0, A0, V1, and A0 dependencies', async () => {
  const c = await compiler();
  const missingPackageScript = c.compileAtlasVerdict(validInput(c, {
    packageJson: packageFixture(c, (scripts) => {
      const copy = { ...scripts };
      delete copy['test:r24-v1'];
      return copy;
    }),
  }));
  assert.equal(missingPackageScript.ok, false);
  assert.equal(missingPackageScript.code, 'E_R24_V1_PACKAGE_SCRIPT_MISSING');

  const missingDependencyPackageScript = c.compileAtlasVerdict(validInput(c, {
    packageJson: packageFixture(c, (scripts) => {
      const copy = { ...scripts };
      delete copy['test:r24-r1'];
      return copy;
    }),
  }));
  assert.equal(missingDependencyPackageScript.ok, false);
  assert.equal(missingDependencyPackageScript.code, 'E_R24_V1_PACKAGE_SCRIPT_MISSING');
  assert.equal(missingDependencyPackageScript.detail, 'test:r24-r1');

  const earlyV1Workflow = workflowFixture((scripts) => {
    const withoutV1 = scripts.filter((script) => script !== 'test:r24-v1');
    return [...withoutV1.slice(0, withoutV1.indexOf('test:r24-a0')), 'test:r24-v1', ...withoutV1.slice(withoutV1.indexOf('test:r24-a0'))];
  });
  const badOrder = c.compileAtlasVerdict(validInput(c, { workflowText: earlyV1Workflow }));
  assert.equal(badOrder.ok, false);
  assert.equal(badOrder.code, 'E_R24_V1_WORKFLOW_A0_BEFORE_V1_REQUIRED');

  const missingR1 = c.compileAtlasVerdict(validInput(c, {
    workflowText: workflowFixture((scripts) => scripts.filter((script) => script !== 'test:r24-r1')),
  }));
  assert.equal(missingR1.ok, false);
  assert.equal(missingR1.code, 'E_R24_V1_WORKFLOW_DEPENDENCY_STEP_MISSING');

  const missingEvidence = c.compileAtlasVerdict(validInput(c, { gateEvidence: [] }));
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.code, 'E_R24_V1_GATE_EVIDENCE_MISSING');
});

test('V1 rejects non-Atlas and unrequired Atlas gate evidence imports', async () => {
  const c = await compiler();
  const program = loadDag();
  const writerEvidence = observedAtlasEvidence(c, program);
  writerEvidence.push(observedRow(c, program, 'T1_ANCHOR_LINEAGE'));
  const writerImport = c.compileAtlasVerdict(validInput(c, { gateEvidence: writerEvidence }));
  assert.equal(writerImport.ok, false);
  assert.equal(writerImport.code, 'E_R24_V1_PROFILE_IMPORT_FORBIDDEN');

  const a1Evidence = observedAtlasEvidence(c, program);
  a1Evidence.push(observedRow(c, program, 'A1_OPTIONAL_RELATION_VOCABULARY'));
  const atlasImport = c.compileAtlasVerdict(validInput(c, { gateEvidence: a1Evidence }));
  assert.equal(atlasImport.ok, false);
  assert.equal(atlasImport.code, 'E_R24_V1_UNREQUIRED_ATLAS_STAGE_IMPORTED');
});

test('V1 rejects failed, source-forged, and non-active-class A0 gate evidence', async () => {
  const c = await compiler();
  const failed = [observedRow(c, loadDag(), 'A0_ATLAS_INCREMENTAL_EQUIVALENCE', { status: 'FAIL' })];
  const failedEvidence = c.compileAtlasVerdict(validInput(c, { gateEvidence: failed }));
  assert.equal(failedEvidence.ok, false);
  assert.equal(failedEvidence.code, 'E_R24_V1_GATE_NOT_SUCCESS');

  const forged = [{ ...failed[0], status: 'SUCCESS', source: 'UNTRUSTED_FIXTURE' }];
  const forgedEvidence = c.compileAtlasVerdict(validInput(c, { gateEvidence: forged }));
  assert.equal(forgedEvidence.ok, false);
  assert.equal(forgedEvidence.code, 'E_R24_V1_GATE_EVIDENCE_SOURCE');

  const nonActiveClass = [{ ...failed[0], status: 'SUCCESS', evidenceClass: 'PHYSICAL' }];
  const missingActiveClass = c.compileAtlasVerdict(validInput(c, { gateEvidence: nonActiveClass }));
  assert.equal(missingActiveClass.ok, false);
  assert.equal(missingActiveClass.code, 'E_R24_V1_GATE_EVIDENCE_CLASS_MISSING');
});

test('V1 rejects topology-only, omitted, legacy-class, cancelled, wrong-tree, and digest-mismatched evidence', async () => {
  const c = await compiler();
  const topologyOnly = c.compileAtlasVerdict(validInput(c, {
    gateEvidence: c.buildGateEvidenceFromWorkflowPrefix({
      program: loadDag(),
      workflowText: workflowFixture(),
      repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: false },
      expectedHeadSha: HEAD,
    }),
  }));
  assert.equal(topologyOnly.ok, false);
  assert.equal(topologyOnly.code, 'E_R24_V1_GATE_TOPOLOGY_ONLY_EVIDENCE');

  const omitted = c.compileAtlasVerdict(validInput(c, { omitGateEvidence: true }));
  assert.equal(omitted.ok, false);
  assert.equal(omitted.code, 'E_R24_V1_GATE_OBSERVED_EVIDENCE_REQUIRED');

  const legacy = observedAtlasEvidence(c);
  legacy[0] = { ...legacy[0], evidenceClass: 'E6_INDEPENDENT_EXACT_HEAD' };
  const legacyResult = c.compileAtlasVerdict(validInput(c, { gateEvidence: legacy }));
  assert.equal(legacyResult.ok, false);
  assert.equal(legacyResult.code, 'E_R24_V1_GATE_LEGACY_EVIDENCE_CLASS_FORBIDDEN');

  const cancelled = observedAtlasEvidence(c);
  cancelled[0] = { ...cancelled[0], run: { ...cancelled[0].run, conclusion: 'cancelled' } };
  const cancelledResult = c.compileAtlasVerdict(validInput(c, { gateEvidence: cancelled }));
  assert.equal(cancelledResult.ok, false);
  assert.equal(cancelledResult.code, 'E_R24_V1_GATE_NOT_SUCCESS');

  const wrongTree = observedAtlasEvidence(c);
  wrongTree[0] = { ...wrongTree[0], treeSha: '0'.repeat(40) };
  const wrongTreeResult = c.compileAtlasVerdict(validInput(c, { gateEvidence: wrongTree }));
  assert.equal(wrongTreeResult.ok, false);
  assert.equal(wrongTreeResult.code, 'E_R24_V1_GATE_TREE_MISMATCH');

  const digestMismatch = observedAtlasEvidence(c);
  digestMismatch[0] = { ...digestMismatch[0], schema: { digest: DIGEST, expectedDigest: '0'.repeat(64) } };
  const digestResult = c.compileAtlasVerdict(validInput(c, { gateEvidence: digestMismatch }));
  assert.equal(digestResult.ok, false);
  assert.equal(digestResult.code, 'E_R24_V1_GATE_DIGEST_MISMATCH');
});
