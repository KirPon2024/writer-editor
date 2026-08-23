'use strict';

// R2.4 V0 Writer claim compiler tests: profile-scoped exact-head evidence is
// accepted; stale, missing, optional-profile and overbroad claims fail closed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const DAG_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'writer-claim-compiler-v0.mjs');
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

function packageFixture(c) {
  const scripts = {};
  for (const script of Object.values(c.STAGE_SCRIPT_BY_ID)) {
    scripts[script] = `node --test ${script}`;
  }
  return { scripts };
}

function workflowFixture(c, mutateScripts = (scripts) => scripts) {
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
    source: 'V0_COMPILER_CONTRACT_FIXTURE',
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

function observedWriterEvidence(c, program = loadDag()) {
  return c.expectedWriterStageIds(program).map((stageId, index) => observedRow(c, program, stageId, { workflowIndex: index }));
}

function validInput(c, overrides = {}) {
  const program = overrides.program || loadDag();
  const repoState = overrides.repoState || {
    headSha: HEAD,
    originMainSha: ORIGIN,
    treeSha: TREE,
    dirty: false,
  };
  const packageJson = overrides.packageJson || packageFixture(c);
  const workflowText = overrides.workflowText || workflowFixture(c);
  return {
    program,
    repoState,
    packageJson,
    workflowText,
    expectedHeadSha: overrides.expectedHeadSha || HEAD,
    expectedOriginMainSha: overrides.expectedOriginMainSha === undefined ? ORIGIN : overrides.expectedOriginMainSha,
    gateEvidence: overrides.omitGateEvidence === true
      ? undefined
      : (Object.prototype.hasOwnProperty.call(overrides, 'gateEvidence') ? overrides.gateEvidence : observedWriterEvidence(c, program)),
    claimRequest: overrides.claimRequest,
    selectedProfiles: overrides.selectedProfiles,
    now: '2026-08-22T12:30:00.000Z',
  };
}

test('V0 compiles a Writer-profile verdict from exact-head Writer gate evidence only', async () => {
  const c = await compiler();
  const result = c.compileWriterVerdict(validInput(c));

  assert.equal(result.ok, true);
  assert.equal(result.code, 'R24_V0_PROFILE_VERDICT_COMPILED');
  assert.equal(result.profileVerdict.profileId, 'WRITER_CORE');
  assert.equal(result.profileVerdict.claimCeiling, 'PROFILE_VERDICT_ONLY');
  assert.equal(result.profileVerdict.verdict, 'WRITER_CORE_EVIDENCE_BOUND_BY_R24_EXACT_HEAD_PREFIX');
  assert.equal(result.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.globalScalarPassForbidden, true);
  assert.deepEqual(result.optionalProfilesExcluded, ['ATLAS_MAPS_DERIVED', 'WORD_ROUNDTRIP', 'PACKAGED_RELEASE_SECURITY']);
  assert.equal(result.nonClaims.includes('NO_PROGRAM_DONE'), true);
  assert.equal(result.profileVerdict.requiredStageIds.includes('T1_ANCHOR_LINEAGE'), true);
  assert.equal(result.profileVerdict.requiredStageIds.includes('A0_ATLAS_INCREMENTAL_EQUIVALENCE'), false);
  assert.equal(result.profileVerdict.requiredStageIds.includes('PK0_PACKAGE_CONTENT_TRUST'), false);
  assert.equal(result.profileVerdict.closedStageCount, result.profileVerdict.requiredStageCount);
  assert.equal(result.profileVerdict.requiredStageCount >= 20, true);

  console.log(`R24_V0_COMPILER_RECEIPT=${JSON.stringify({
    verdict: result.verdict,
    profile: result.profileVerdict.profileId,
    requiredStageCount: result.profileVerdict.requiredStageCount,
    nonClaims: result.nonClaims.length,
  })}`);
});

test('V0 rejects missing prerequisite workflow gates before claim compilation', async () => {
  const c = await compiler();
  const workflowText = workflowFixture(c, (scripts) => scripts.filter((script) => script !== 'test:r24-f0'));
  const result = c.compileWriterVerdict(validInput(c, { workflowText }));

  assert.equal(result.ok, false);
  assert.equal(result.code, 'E_R24_V0_WORKFLOW_STEP_MISSING');
  assert.equal(result.detail, 'test:r24-f0');
});

test('V0 rejects stale head, dirty state, and stale gate evidence', async () => {
  const c = await compiler();
  const staleRepo = c.compileWriterVerdict(validInput(c, {
    repoState: { headSha: 'd'.repeat(40), originMainSha: ORIGIN, treeSha: TREE, dirty: false },
  }));
  assert.equal(staleRepo.ok, false);
  assert.equal(staleRepo.code, 'E_R24_V0_EXACT_HEAD_MISMATCH');

  const dirtyRepo = c.compileWriterVerdict(validInput(c, {
    repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: true },
  }));
  assert.equal(dirtyRepo.ok, false);
  assert.equal(dirtyRepo.code, 'E_R24_V0_WORKTREE_DIRTY');

  const evidence = observedWriterEvidence(c);
  evidence[0] = { ...evidence[0], headSha: 'e'.repeat(40) };
  const staleEvidence = c.compileWriterVerdict(validInput(c, { gateEvidence: evidence }));
  assert.equal(staleEvidence.ok, false);
  assert.equal(staleEvidence.code, 'E_R24_V0_GATE_HEAD_MISMATCH');
});

test('V0 rejects optional-profile evidence and optional claim requests', async () => {
  const c = await compiler();
  const program = loadDag();
  const evidence = observedWriterEvidence(c, program);
  evidence.push(observedRow(c, program, 'A0_ATLAS_INCREMENTAL_EQUIVALENCE'));
  const optionalEvidence = c.compileWriterVerdict(validInput(c, { gateEvidence: evidence }));
  assert.equal(optionalEvidence.ok, false);
  assert.equal(optionalEvidence.code, 'E_R24_V0_OPTIONAL_PROFILE_IMPORTED');

  const optionalClaim = c.compileWriterVerdict(validInput(c, {
    claimRequest: { profiles: ['WRITER_CORE', 'WORD_ROUNDTRIP'] },
  }));
  assert.equal(optionalClaim.ok, false);
  assert.equal(optionalClaim.code, 'E_R24_V0_OPTIONAL_PROFILE_IMPORTED');
});

test('V0 rejects overclaims and global scalar pass requests', async () => {
  const c = await compiler();
  const releaseClaim = c.compileWriterVerdict(validInput(c, {
    claimRequest: { claimCeiling: 'SUPPORTED_RELEASE_TARGETS_ONLY' },
  }));
  assert.equal(releaseClaim.ok, false);
  assert.equal(releaseClaim.code, 'E_R24_V0_OVERCLAIM');

  const globalPass = c.compileWriterVerdict(validInput(c, {
    claimRequest: { programVerdict: 'PASS' },
  }));
  assert.equal(globalPass.ok, false);
  assert.equal(globalPass.code, 'E_R24_V0_PROGRAM_SCALAR_PASS_FORBIDDEN');
});

test('V0 rejects invalid workflow order and zero evidence denominator', async () => {
  const c = await compiler();
  const earlyV0Workflow = workflowFixture(c, (scripts) => {
    const withoutV0 = scripts.filter((script) => script !== 'test:r24-v0');
    return ['test:r24-v0', ...withoutV0];
  });
  const badOrder = c.compileWriterVerdict(validInput(c, { workflowText: earlyV0Workflow }));
  assert.equal(badOrder.ok, false);
  assert.equal(badOrder.code, 'E_R24_V0_WORKFLOW_PREFIX_INVALID');

  const missingEvidence = c.compileWriterVerdict(validInput(c, { gateEvidence: [] }));
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.code, 'E_R24_V0_GATE_EVIDENCE_MISSING');
});

test('V0 rejects topology-only, omitted, legacy-class, failed, wrong-tree, and digest-mismatched evidence', async () => {
  const c = await compiler();
  const topologyOnly = c.compileWriterVerdict(validInput(c, {
    gateEvidence: c.buildGateEvidenceFromWorkflowPrefix({
      program: loadDag(),
      workflowText: workflowFixture(c),
      repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: false },
      expectedHeadSha: HEAD,
    }),
  }));
  assert.equal(topologyOnly.ok, false);
  assert.equal(topologyOnly.code, 'E_R24_V0_GATE_TOPOLOGY_ONLY_EVIDENCE');

  const omitted = c.compileWriterVerdict(validInput(c, { omitGateEvidence: true }));
  assert.equal(omitted.ok, false);
  assert.equal(omitted.code, 'E_R24_V0_GATE_OBSERVED_EVIDENCE_REQUIRED');

  const legacy = observedWriterEvidence(c);
  legacy[0] = { ...legacy[0], evidenceClass: 'E6_INDEPENDENT_EXACT_HEAD' };
  const legacyResult = c.compileWriterVerdict(validInput(c, { gateEvidence: legacy }));
  assert.equal(legacyResult.ok, false);
  assert.equal(legacyResult.code, 'E_R24_V0_GATE_LEGACY_EVIDENCE_CLASS_FORBIDDEN');

  const failed = observedWriterEvidence(c);
  failed[0] = { ...failed[0], step: { ...failed[0].step, conclusion: 'failure' } };
  const failedResult = c.compileWriterVerdict(validInput(c, { gateEvidence: failed }));
  assert.equal(failedResult.ok, false);
  assert.equal(failedResult.code, 'E_R24_V0_GATE_NOT_SUCCESS');

  const wrongTree = observedWriterEvidence(c);
  wrongTree[0] = { ...wrongTree[0], treeSha: '0'.repeat(40) };
  const wrongTreeResult = c.compileWriterVerdict(validInput(c, { gateEvidence: wrongTree }));
  assert.equal(wrongTreeResult.ok, false);
  assert.equal(wrongTreeResult.code, 'E_R24_V0_GATE_TREE_MISMATCH');

  const digestMismatch = observedWriterEvidence(c);
  digestMismatch[0] = { ...digestMismatch[0], artifact: { digest: DIGEST, expectedDigest: '0'.repeat(64) } };
  const digestResult = c.compileWriterVerdict(validInput(c, { gateEvidence: digestMismatch }));
  assert.equal(digestResult.ok, false);
  assert.equal(digestResult.code, 'E_R24_V0_GATE_DIGEST_MISMATCH');
});
