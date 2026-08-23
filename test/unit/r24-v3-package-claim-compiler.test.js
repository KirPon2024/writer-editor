'use strict';

// R2.4 V3 package claim compiler tests: exact-head PK1 evidence is accepted
// for the package release-security profile only. Release-ready, physical-pass,
// optional-profile imports, stale evidence, contract drift, and workflow drift
// fail closed.

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
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'package-claim-compiler-v3.mjs');
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
    'test:r24-a1',
    'test:r24-pk0',
    'test:r24-pk1',
    'test:r24-v3',
  ];
  return mutateScripts(scripts).map((script, index) => [
    `      - name: Gate ${index}`,
    `        run: npm run -s ${script}`,
  ].join('\n')).join('\n');
}

function validInput(c, overrides = {}) {
  const repoState = overrides.repoState || {
    headSha: HEAD,
    originMainSha: ORIGIN,
    treeSha: TREE,
    dirty: false,
  };
  const program = overrides.program || loadDag();
  const gateEvidence = Object.hasOwn(overrides, 'gateEvidence')
    ? overrides.gateEvidence
    : (overrides.omitGateEvidence ? undefined : observedPackageEvidence(c, program));
  return {
    program,
    scientificContracts: overrides.scientificContracts || loadContracts(),
    repoState,
    packageJson: overrides.packageJson || packageFixture(c),
    workflowText: overrides.workflowText || workflowFixture(),
    expectedHeadSha: overrides.expectedHeadSha || HEAD,
    expectedOriginMainSha: overrides.expectedOriginMainSha === undefined ? ORIGIN : overrides.expectedOriginMainSha,
    gateEvidence,
    claimRequest: overrides.claimRequest,
    selectedProfiles: overrides.selectedProfiles,
    now: '2026-08-22T18:40:00.000Z',
  };
}

function observedRow(c, program, stageId, overrides = {}) {
  const stage = program.stages.find((row) => row.stageId === stageId);
  assert.ok(stage, `stage fixture missing: ${stageId}`);
  const script = c.STAGE_SCRIPT_BY_ID[stageId];
  assert.ok(script, `script fixture missing: ${stageId}`);
  return {
    stageId,
    status: 'SUCCESS',
    headSha: HEAD,
    treeSha: TREE,
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    source: 'V3_COMPILER_CONTRACT_FIXTURE',
    candidate: {
      stageId,
      script,
      profile: stage.profile,
    },
    run: {
      id: `run-${stageId}`,
      attempt: 1,
      headSha: HEAD,
      conclusion: 'success',
    },
    job: {
      id: `job-${stageId}`,
      name: script,
      conclusion: 'success',
    },
    step: {
      name: script,
      conclusion: 'success',
    },
    artifact: { name: `${stageId}.json`, digest: DIGEST },
    tool: { name: c.V3_STAGE_ID, digest: DIGEST },
    schema: { name: 'EvidenceStampV2', digest: DIGEST },
    fixture: { name: 'r24-v3-package-claim-compiler', digest: DIGEST },
    counts: {
      passed: 1,
      failed: 0,
      skipped: 0,
      denominator: 1,
      exitCode: 0,
    },
    profileVerdictCandidate: 'NOT_READY',
    stageClosureKind: 'TYPED_RELEASE_SECURITY_NOT_READY_CLASSIFICATION',
    ...overrides,
  };
}

function observedPackageEvidence(c, program = loadDag()) {
  return [observedRow(c, program, 'PK1_RELEASE_SECURITY_PHYSICAL')];
}

function builtEvidence(c) {
  return observedPackageEvidence(c);
}

test('V3 compiles a package-profile NOT_READY verdict from exact-head PK1 evidence only', async () => {
  const c = await compiler();
  const result = c.compilePackageVerdict(validInput(c));

  assert.equal(result.ok, true);
  assert.equal(result.code, 'R24_V3_PACKAGE_PROFILE_VERDICT_COMPILED');
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.profileVerdict.profileId, 'PACKAGED_RELEASE_SECURITY');
  assert.equal(result.profileVerdict.currentVerdict, 'NOT_READY');
  assert.equal(result.profileVerdict.profileVerdictCandidate, 'NOT_READY');
  assert.equal(result.profileVerdict.claimCeiling, 'PROFILE_VERDICT_ONLY');
  assert.equal(result.profileVerdict.verdict, 'PACKAGED_RELEASE_SECURITY_NOT_READY_EVIDENCE_BOUND_BY_R24_EXACT_HEAD_PK1_PREFIX');
  assert.deepEqual(result.profileVerdict.requiredStageIds, ['PK1_RELEASE_SECURITY_PHYSICAL']);
  assert.equal(result.profileVerdict.requiredStageCount, 1);
  assert.equal(result.profileVerdict.closedStageCount, 1);
  assert.equal(result.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.globalScalarPassForbidden, true);
  assert.deepEqual(result.selectedProfiles, ['SHARED_ASSURANCE', 'WRITER_CORE', 'PACKAGED_RELEASE_SECURITY']);
  assert.equal(result.releaseSecurityProfile.productionReleaseReady, false);
  assert.equal(result.releaseSecurityProfile.signingPassClaim, false);
  assert.equal(result.releaseSecurityProfile.currentHeadPhysicalPackagePass, false);
  assert.equal(result.nonClaimedProfiles.includes('WRITER_CORE'), true);
  assert.equal(result.nonClaimedProfiles.includes('ATLAS_MAPS_DERIVED'), true);
  assert.equal(result.optionalProfilesExcluded.includes('WORD_ROUNDTRIP'), true);
  assert.equal(result.nonClaims.includes('NO_PRODUCTION_RELEASE_READY'), true);
  assert.equal(result.nonClaims.includes('NO_CURRENT_HEAD_PHYSICAL_PACKAGE_PASS'), true);
  assert.equal(result.sourceClaimContract.cannotPromote.includes('UNSIGNED_ARTIFACT'), true);
  assert.equal(result.workflow.pk0WorkflowIndex < result.workflow.pk1WorkflowIndex, true);
  assert.equal(result.workflow.pk1WorkflowIndex < result.workflow.v3WorkflowIndex, true);

  console.log(`R24_V3_COMPILER_RECEIPT=${JSON.stringify({
    verdict: result.verdict,
    profile: result.profileVerdict.profileId,
    currentVerdict: result.profileVerdict.currentVerdict,
    requiredStageCount: result.profileVerdict.requiredStageCount,
    nonClaims: result.nonClaims.length,
  })}`);
});

test('V3 binds the current package script and required workflow order', async () => {
  const c = await compiler();
  const result = c.compilePackageVerdict(validInput(c, {
    packageJson: loadPackage(),
    workflowText: loadWorkflow(),
  }));

  assert.equal(result.ok, true);
  assert.equal(result.workflow.v3Script, 'test:r24-v3');
  assert.equal(result.workflow.pk0WorkflowIndex < result.workflow.pk1WorkflowIndex, true);
  assert.equal(result.workflow.pk1WorkflowIndex < result.workflow.v3WorkflowIndex, true);
  assert.deepEqual(result.profileVerdict.requiredStageIds, ['PK1_RELEASE_SECURITY_PHYSICAL']);
});

test('V3 rejects stale head, dirty state, and stale PK1 gate evidence', async () => {
  const c = await compiler();
  const staleRepo = c.compilePackageVerdict(validInput(c, {
    repoState: { headSha: 'd'.repeat(40), originMainSha: ORIGIN, treeSha: TREE, dirty: false },
  }));
  assert.equal(staleRepo.ok, false);
  assert.equal(staleRepo.code, 'E_R24_V3_EXACT_HEAD_MISMATCH');

  const dirtyRepo = c.compilePackageVerdict(validInput(c, {
    repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: true },
  }));
  assert.equal(dirtyRepo.ok, false);
  assert.equal(dirtyRepo.code, 'E_R24_V3_WORKTREE_DIRTY');

  const evidence = builtEvidence(c);
  evidence[0] = { ...evidence[0], headSha: 'e'.repeat(40) };
  const staleEvidence = c.compilePackageVerdict(validInput(c, { gateEvidence: evidence }));
  assert.equal(staleEvidence.ok, false);
  assert.equal(staleEvidence.code, 'E_R24_V3_GATE_HEAD_MISMATCH');
});

test('V3 rejects release-ready, signing, physical-pass, profile imports, and global pass requests', async () => {
  const c = await compiler();
  const writerClaim = c.compilePackageVerdict(validInput(c, {
    claimRequest: { profiles: ['PACKAGED_RELEASE_SECURITY', 'WRITER_CORE'] },
  }));
  assert.equal(writerClaim.ok, false);
  assert.equal(writerClaim.code, 'E_R24_V3_PROFILE_IMPORT_FORBIDDEN');

  const atlasVerdict = c.compilePackageVerdict(validInput(c, {
    claimRequest: { includeAtlasVerdict: true },
  }));
  assert.equal(atlasVerdict.ok, false);
  assert.equal(atlasVerdict.code, 'E_R24_V3_ATLAS_PROMOTION_FORBIDDEN');

  const releaseClaim = c.compilePackageVerdict(validInput(c, {
    claimRequest: { releaseReady: true },
  }));
  assert.equal(releaseClaim.ok, false);
  assert.equal(releaseClaim.code, 'E_R24_V3_RELEASE_READY_CLAIM_FORBIDDEN');

  const signingClaim = c.compilePackageVerdict(validInput(c, {
    claimRequest: { signingPass: true, notarizationPass: true },
  }));
  assert.equal(signingClaim.ok, false);
  assert.equal(signingClaim.code, 'E_R24_V3_SIGNING_NOTARIZATION_CLAIM_FORBIDDEN');

  const physicalClaim = c.compilePackageVerdict(validInput(c, {
    claimRequest: { currentHeadPhysicalPackagePass: true },
  }));
  assert.equal(physicalClaim.ok, false);
  assert.equal(physicalClaim.code, 'E_R24_V3_CURRENT_HEAD_PHYSICAL_PACKAGE_CLAIM_FORBIDDEN');

  const globalPass = c.compilePackageVerdict(validInput(c, {
    claimRequest: { programVerdict: 'PASS' },
  }));
  assert.equal(globalPass.ok, false);
  assert.equal(globalPass.code, 'E_R24_V3_PROGRAM_SCALAR_PASS_FORBIDDEN');
});

test('V3 rejects scientific contract drift, package vector drift, and selected profile drift', async () => {
  const c = await compiler();
  const missingClaim = loadContracts();
  missingClaim.claims = missingClaim.claims.filter((claim) => claim.claimId !== 'CLM_PACKAGED_RELEASE_SECURITY');
  const noClaim = c.compilePackageVerdict(validInput(c, { scientificContracts: missingClaim }));
  assert.equal(noClaim.ok, false);
  assert.equal(noClaim.code, 'E_R24_V3_PACKAGE_CLAIM_CONTRACT_MISSING');

  const passContract = loadContracts();
  passContract.claims = passContract.claims.map((claim) => (
    claim.claimId === 'CLM_PACKAGED_RELEASE_SECURITY'
      ? { ...claim, currentVerdict: 'PASS' }
      : claim
  ));
  const notReady = c.compilePackageVerdict(validInput(c, { scientificContracts: passContract }));
  assert.equal(notReady.ok, false);
  assert.equal(notReady.code, 'E_R24_V3_PACKAGE_CONTRACT_NOT_READY_REQUIRED');

  const missingPromotionGuard = loadContracts();
  missingPromotionGuard.claims = missingPromotionGuard.claims.map((claim) => (
    claim.claimId === 'CLM_PACKAGED_RELEASE_SECURITY'
      ? { ...claim, cannotPromote: claim.cannotPromote.filter((profile) => profile !== 'UNSIGNED_ARTIFACT') }
      : claim
  ));
  const promotion = c.compilePackageVerdict(validInput(c, { scientificContracts: missingPromotionGuard }));
  assert.equal(promotion.ok, false);
  assert.equal(promotion.code, 'E_R24_V3_CANNOT_PROMOTE_MISSING');

  const vectorPass = loadDag();
  vectorPass.verdictAggregation.currentVector.PACKAGED_RELEASE_SECURITY = 'PASS';
  const badVector = c.compilePackageVerdict(validInput(c, { program: vectorPass }));
  assert.equal(badVector.ok, false);
  assert.equal(badVector.code, 'E_R24_V3_PACKAGE_PROFILE_VECTOR_NOT_READY_REQUIRED');

  const profileDrift = c.compilePackageVerdict(validInput(c, {
    selectedProfiles: ['SHARED_ASSURANCE', 'PACKAGED_RELEASE_SECURITY'],
  }));
  assert.equal(profileDrift.ok, false);
  assert.equal(profileDrift.code, 'E_R24_V3_SELECTED_PROFILE_SET');
});

test('V3 rejects workflow and package drift around PK0, PK1, V3, and PK1 dependencies', async () => {
  const c = await compiler();
  const missingPackageScript = c.compilePackageVerdict(validInput(c, {
    packageJson: packageFixture(c, (scripts) => {
      const copy = { ...scripts };
      delete copy['test:r24-v3'];
      return copy;
    }),
  }));
  assert.equal(missingPackageScript.ok, false);
  assert.equal(missingPackageScript.code, 'E_R24_V3_PACKAGE_SCRIPT_MISSING');

  const missingDependencyPackageScript = c.compilePackageVerdict(validInput(c, {
    packageJson: packageFixture(c, (scripts) => {
      const copy = { ...scripts };
      delete copy['test:r24-r6'];
      return copy;
    }),
  }));
  assert.equal(missingDependencyPackageScript.ok, false);
  assert.equal(missingDependencyPackageScript.code, 'E_R24_V3_PACKAGE_SCRIPT_MISSING');
  assert.equal(missingDependencyPackageScript.detail, 'test:r24-r6');

  const earlyV3Workflow = workflowFixture((scripts) => {
    const withoutV3 = scripts.filter((script) => script !== 'test:r24-v3');
    return [...withoutV3.slice(0, withoutV3.indexOf('test:r24-pk1')), 'test:r24-v3', ...withoutV3.slice(withoutV3.indexOf('test:r24-pk1'))];
  });
  const badOrder = c.compilePackageVerdict(validInput(c, { workflowText: earlyV3Workflow }));
  assert.equal(badOrder.ok, false);
  assert.equal(badOrder.code, 'E_R24_V3_WORKFLOW_PK1_BEFORE_V3_REQUIRED');

  const missingR6 = c.compilePackageVerdict(validInput(c, {
    workflowText: workflowFixture((scripts) => scripts.filter((script) => script !== 'test:r24-r6')),
  }));
  assert.equal(missingR6.ok, false);
  assert.equal(missingR6.code, 'E_R24_V3_WORKFLOW_DEPENDENCY_STEP_MISSING');

  const missingEvidence = c.compilePackageVerdict(validInput(c, { gateEvidence: [] }));
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.code, 'E_R24_V3_GATE_EVIDENCE_MISSING');
});

test('V3 rejects non-package and unrequired package gate evidence imports', async () => {
  const c = await compiler();
  const writerEvidence = builtEvidence(c);
  writerEvidence.push(observedRow(c, loadDag(), 'F0_WRITER_REFINEMENT_CONFORMANCE'));
  const writerImport = c.compilePackageVerdict(validInput(c, { gateEvidence: writerEvidence }));
  assert.equal(writerImport.ok, false);
  assert.equal(writerImport.code, 'E_R24_V3_PROFILE_IMPORT_FORBIDDEN');

  const pk0Evidence = builtEvidence(c);
  pk0Evidence.push(observedRow(c, loadDag(), 'PK0_PACKAGE_CONTENT_TRUST'));
  const packageImport = c.compilePackageVerdict(validInput(c, { gateEvidence: pk0Evidence }));
  assert.equal(packageImport.ok, false);
  assert.equal(packageImport.code, 'E_R24_V3_UNREQUIRED_PACKAGE_STAGE_IMPORTED');
});

test('V3 rejects failed, source-forged, non-active-class, PASS-like, and release-promoting PK1 evidence', async () => {
  const c = await compiler();
  const failed = [observedRow(c, loadDag(), 'PK1_RELEASE_SECURITY_PHYSICAL', { status: 'FAIL' })];
  const failedEvidence = c.compilePackageVerdict(validInput(c, { gateEvidence: failed }));
  assert.equal(failedEvidence.ok, false);
  assert.equal(failedEvidence.code, 'E_R24_V3_GATE_NOT_SUCCESS');

  const forged = [{ ...failed[0], status: 'SUCCESS', source: 'UNTRUSTED_FIXTURE' }];
  const forgedEvidence = c.compilePackageVerdict(validInput(c, { gateEvidence: forged }));
  assert.equal(forgedEvidence.ok, false);
  assert.equal(forgedEvidence.code, 'E_R24_V3_GATE_EVIDENCE_SOURCE');

  const nonActive = [{ ...failed[0], status: 'SUCCESS', evidenceClass: 'PHYSICAL_ONLY' }];
  const missingActive = c.compilePackageVerdict(validInput(c, { gateEvidence: nonActive }));
  assert.equal(missingActive.ok, false);
  assert.equal(missingActive.code, 'E_R24_V3_GATE_EVIDENCE_CLASS_MISSING');

  const passLike = [{ ...failed[0], status: 'SUCCESS', profileVerdictCandidate: 'PASS' }];
  const passEvidence = c.compilePackageVerdict(validInput(c, { gateEvidence: passLike }));
  assert.equal(passEvidence.ok, false);
  assert.equal(passEvidence.code, 'E_R24_V3_PK1_NOT_READY_CLASSIFICATION_REQUIRED');

  const releasePromoted = [{ ...failed[0], status: 'SUCCESS', releaseReadyClaim: true }];
  const promotedEvidence = c.compilePackageVerdict(validInput(c, { gateEvidence: releasePromoted }));
  assert.equal(promotedEvidence.ok, false);
  assert.equal(promotedEvidence.code, 'E_R24_V3_RELEASE_PROMOTION_EVIDENCE_FORBIDDEN');
});

test('V3 rejects topology-only, omitted, legacy-class, cancelled, wrong-tree, and digest-mismatched evidence', async () => {
  const c = await compiler();
  const topologyOnly = c.buildGateEvidenceFromWorkflowPrefix({
    program: loadDag(),
    workflowText: workflowFixture(),
    repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: false },
    expectedHeadSha: HEAD,
  });
  const topology = c.compilePackageVerdict(validInput(c, { gateEvidence: topologyOnly }));
  assert.equal(topology.ok, false);
  assert.equal(topology.code, 'E_R24_V3_GATE_TOPOLOGY_ONLY_EVIDENCE');

  const omitted = c.compilePackageVerdict(validInput(c, { omitGateEvidence: true }));
  assert.equal(omitted.ok, false);
  assert.equal(omitted.code, 'E_R24_V3_GATE_OBSERVED_EVIDENCE_REQUIRED');

  const legacy = [observedRow(c, loadDag(), 'PK1_RELEASE_SECURITY_PHYSICAL', {
    evidenceClass: 'E6_INDEPENDENT_EXACT_HEAD',
  })];
  const legacyEvidence = c.compilePackageVerdict(validInput(c, { gateEvidence: legacy }));
  assert.equal(legacyEvidence.ok, false);
  assert.equal(legacyEvidence.code, 'E_R24_V3_GATE_LEGACY_EVIDENCE_CLASS_FORBIDDEN');

  const cancelled = [observedRow(c, loadDag(), 'PK1_RELEASE_SECURITY_PHYSICAL', {
    run: { id: 'run-cancelled', attempt: 1, headSha: HEAD, conclusion: 'cancelled' },
  })];
  const cancelledEvidence = c.compilePackageVerdict(validInput(c, { gateEvidence: cancelled }));
  assert.equal(cancelledEvidence.ok, false);
  assert.equal(cancelledEvidence.code, 'E_R24_V3_GATE_NOT_SUCCESS');

  const wrongTree = [observedRow(c, loadDag(), 'PK1_RELEASE_SECURITY_PHYSICAL', { treeSha: 'd'.repeat(40) })];
  const treeEvidence = c.compilePackageVerdict(validInput(c, { gateEvidence: wrongTree }));
  assert.equal(treeEvidence.ok, false);
  assert.equal(treeEvidence.code, 'E_R24_V3_GATE_TREE_MISMATCH');

  const digestMismatch = [observedRow(c, loadDag(), 'PK1_RELEASE_SECURITY_PHYSICAL', {
    fixture: { name: 'r24-v3-package-claim-compiler', digest: DIGEST, expectedDigest: 'e'.repeat(64) },
  })];
  const digestEvidence = c.compilePackageVerdict(validInput(c, { gateEvidence: digestMismatch }));
  assert.equal(digestEvidence.ok, false);
  assert.equal(digestEvidence.code, 'E_R24_V3_GATE_DIGEST_MISMATCH');
});
