'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE = path.join(ROOT, 'scripts', 'ops', 'r24', 'word-claim-compiler-v2.mjs');
const read = relative => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const HEAD = '1'.repeat(40), ORIGIN = '2'.repeat(40), TREE = '3'.repeat(40), DIGEST = 'f'.repeat(64);

async function compiler() { return import(`${pathToFileURL(MODULE).href}?v=${Date.now()}-${Math.random()}`); }
function program() { return read('docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/PROGRAM_DAG.json'); }
function contracts() { return read('docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/SCIENTIFIC_CONTRACTS.json'); }
function c8bContract() { return read('docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_CONTRACT_V1.json'); }
function c8bEvidence() { return read('docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_EVIDENCE_V1.json'); }
function c9State() { return read('docs/OPS/R24/CORRECTIVE/C9_EFFECTIVE_STATE_V1.json'); }
function packageFixture(c) {
  const scripts = {};
  for (const script of Object.values(c.STAGE_SCRIPT_BY_ID)) scripts[script] = `node --test ${script}`;
  return { scripts };
}
function workflowFixture(mutate = value => value) {
  return mutate(['test:r24-v0', 'test:r24-p2', 'test:r24-t1', 'test:r24-w0', 'test:r24-v2'])
    .map(script => `      - name: ${script}\n        run: ${script === 'test:r24-v2' ? 'node --test test/unit/r24-v2-word-claim-compiler.test.js test/unit/r24-v2-word-claim-mutants.test.js' : `npm run -s ${script}`}`).join('\n');
}
function gateRow(c, inputProgram = program(), overrides = {}) {
  const stage = inputProgram.stages.find(row => row.stageId === c.W0_STAGE_ID);
  return {
    stageId: c.W0_STAGE_ID,
    status: 'SUCCESS',
    headSha: HEAD,
    treeSha: TREE,
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    source: 'V2_COMPILER_CONTRACT_FIXTURE',
    candidate: { stageId: c.W0_STAGE_ID, script: c.STAGE_SCRIPT_BY_ID[c.W0_STAGE_ID], profile: stage.profile },
    run: { id: 'run-v2-w0', attempt: 1, headSha: HEAD, conclusion: 'success' },
    job: { id: 'job-v2-w0', name: c.STAGE_SCRIPT_BY_ID[c.W0_STAGE_ID], conclusion: 'success' },
    step: { name: c.STAGE_SCRIPT_BY_ID[c.W0_STAGE_ID], conclusion: 'success' },
    artifact: { name: 'w0-observed.json', digest: DIGEST },
    tool: { name: c.V2_STAGE_ID, digest: DIGEST },
    schema: { name: 'EvidenceStampV2', digest: DIGEST },
    fixture: { name: 'r24-v2-word-claim-compiler', digest: DIGEST },
    counts: { passed: 1, failed: 0, skipped: 0, denominator: 1, exitCode: 0 },
    profileVerdictCandidate: 'BLOCKED',
    stageClosureKind: 'TYPED_WORD_PROFILE_BLOCKED_CLASSIFICATION',
    c8bContractDigest: c.C8B_CONTRACT_DIGEST,
    c8bEvidenceDigest: c.C8B_EVIDENCE_DIGEST,
    c8bExternalTerminalDigest: c.C8B_EXTERNAL_TERMINAL_DIGEST,
    routePassClaim: false,
    productApplyAuthority: false,
    safeApplyExpansion: false,
    wordTerminalPass: false,
    programPass: false,
    userDocumentsTouched: false,
    userDocumentsAllowed: false,
    googleDocsTransfer: false,
    releaseReady: false,
    productionReleaseReady: false,
    runtimeNetworkActivated: false,
    ...overrides,
  };
}
function valid(c, overrides = {}) {
  const inputProgram = overrides.program || program();
  return {
    program: inputProgram,
    scientificContracts: overrides.scientificContracts || contracts(),
    c8bContract: overrides.c8bContract || c8bContract(),
    c8bEvidence: overrides.c8bEvidence || c8bEvidence(),
    c9EffectiveState: overrides.c9EffectiveState || c9State(),
    sourceDigests: overrides.sourceDigests || { c8bContract: c.C8B_CONTRACT_DIGEST, c8bEvidence: c.C8B_EVIDENCE_DIGEST },
    repoState: overrides.repoState || { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: false },
    packageJson: overrides.packageJson || packageFixture(c),
    workflowText: overrides.workflowText || workflowFixture(),
    gateEvidence: Object.hasOwn(overrides, 'gateEvidence') ? overrides.gateEvidence : [gateRow(c, inputProgram)],
    expectedHeadSha: overrides.expectedHeadSha || HEAD,
    expectedOriginMainSha: overrides.expectedOriginMainSha === undefined ? ORIGIN : overrides.expectedOriginMainSha,
    selectedProfiles: overrides.selectedProfiles,
    claimRequest: overrides.claimRequest,
    now: '2026-09-06T04:00:00.000Z',
  };
}

test('V2 compiles only a BLOCKED Word profile verdict from certified C8B/C9 W0 evidence', async () => {
  const c = await compiler(), result = c.compileWordVerdict(valid(c));
  assert.equal(result.ok, true);
  assert.equal(result.code, 'R24_V2_WORD_PROFILE_VERDICT_COMPILED');
  assert.equal(result.profileVerdict.currentVerdict, 'BLOCKED');
  assert.equal(result.profileVerdict.verdict, 'WORD_ROUNDTRIP_BLOCKED_EVIDENCE_BOUND_BY_R24_EXACT_HEAD_W0_PREFIX');
  assert.deepEqual(result.profileVerdict.requiredStageIds, ['W0_WORD_PHYSICAL_RECERTIFICATION']);
  assert.equal(result.profileVerdict.requiredStageCount, 1);
  assert.equal(result.profileVerdict.closedStageCount, 1);
  assert.equal(result.physicalEvidence.w0CertifiedDone, true);
  assert.equal(result.physicalEvidence.boundedRootCommentOperations, 4);
  assert.equal(result.physicalEvidence.wordProductTerminalPass, false);
  assert.equal(result.wordRoundtripProfile.productApplyAuthority, false);
  assert.equal(result.wordRoundtripProfile.safeApplyExpansion, false);
  assert.equal(result.wordRoundtripProfile.userDocumentsTouched, false);
  assert.equal(result.wordRoundtripProfile.googleDocsTransfer, false);
  assert.equal(result.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.programDone, false);
  assert.equal(result.globalScalarPassForbidden, true);
  assert.ok(result.nonClaims.includes('NO_PRODUCT_APPLY_AUTHORITY'));
  assert.ok(result.sourceClaimContract.cannotPromote.includes('SAFE_APPLY_WIDENING'));
  assert.ok(result.workflow.w0WorkflowIndex < result.workflow.v2WorkflowIndex);
});

test('V2 binds the repository package and workflow after W0', async () => {
  const c = await compiler();
  const result = c.compileWordVerdict(valid(c, {
    packageJson: read('package.json'),
    workflowText: fs.readFileSync(path.join(ROOT, '.github/workflows/rtk-required.yml'), 'utf8'),
  }));
  assert.equal(result.ok, true);
  assert.ok(result.workflow.v0WorkflowIndex < result.workflow.v2WorkflowIndex);
  assert.ok(result.workflow.w0WorkflowIndex < result.workflow.v2WorkflowIndex);
});

test('V2 rejects absent, stale, dirty, skipped and zero-denominator exact-head evidence', async () => {
  const c = await compiler();
  assert.equal(c.compileWordVerdict(valid(c, { gateEvidence: [] })).code, 'E_R24_V2_GATE_EVIDENCE_DENOMINATOR');
  assert.equal(c.compileWordVerdict(valid(c, { repoState: { headSha: '4'.repeat(40), originMainSha: ORIGIN, treeSha: TREE, dirty: false } })).code, 'E_R24_V2_EXACT_HEAD_MISMATCH');
  assert.equal(c.compileWordVerdict(valid(c, { repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: true } })).code, 'E_R24_V2_WORKTREE_DIRTY');
  assert.equal(c.compileWordVerdict(valid(c, { gateEvidence: [gateRow(c, program(), { headSha: '4'.repeat(40) })] })).code, 'E_R24_V2_GATE_HEAD_MISMATCH');
  assert.equal(c.compileWordVerdict(valid(c, { gateEvidence: [gateRow(c, program(), { counts: { passed: 0, failed: 0, skipped: 1, denominator: 1, exitCode: 0 } })] })).ok, false);
  assert.equal(c.compileWordVerdict(valid(c, { gateEvidence: [gateRow(c, program(), { counts: { passed: 0, failed: 0, skipped: 0, denominator: 0, exitCode: 0 } })] })).ok, false);
});

test('V2 rejects every route, apply, document, provider, release and program promotion request', async () => {
  const c = await compiler();
  for (const field of ['routePassClaim', 'productApplyAuthority', 'safeApplyExpansion', 'wordTerminalPass', 'programPass', 'userDocumentsTouched', 'userDocumentsAllowed', 'googleDocsTransfer', 'releaseReady', 'productionReleaseReady', 'runtimeNetworkActivated']) {
    const result = c.compileWordVerdict(valid(c, { claimRequest: { [field]: true } }));
    assert.equal(result.ok, false, field);
    assert.equal(result.code, 'E_R24_V2_AUTHORITY_PROMOTION_FORBIDDEN', field);
  }
  assert.equal(c.compileWordVerdict(valid(c, { claimRequest: { programVerdict: 'PASS' } })).code, 'E_R24_V2_PROGRAM_SCALAR_PASS_FORBIDDEN');
  assert.equal(c.compileWordVerdict(valid(c, { claimRequest: { profiles: ['WORD_ROUNDTRIP', 'WRITER_CORE'] } })).code, 'E_R24_V2_PROFILE_IMPORT_FORBIDDEN');
});

test('V2 rejects scientific, program-vector, C8B and C9 binding drift', async () => {
  const c = await compiler();
  const changedContracts = contracts();
  changedContracts.claims.find(row => row.claimId === c.WORD_CLAIM_ID).currentVerdict = 'PASS';
  assert.equal(c.compileWordVerdict(valid(c, { scientificContracts: changedContracts })).code, 'E_R24_V2_WORD_CONTRACT_BLOCKED_REQUIRED');
  const changedProgram = program();
  changedProgram.verdictAggregation.currentVector.WORD_ROUNDTRIP = 'PASS';
  assert.equal(c.compileWordVerdict(valid(c, { program: changedProgram })).code, 'E_R24_V2_VERDICT_AGGREGATION');
  assert.equal(c.compileWordVerdict(valid(c, { sourceDigests: { c8bContract: '0'.repeat(64), c8bEvidence: c.C8B_EVIDENCE_DIGEST } })).code, 'E_R24_V2_C8B_SOURCE_DIGEST');
  const changedC9 = c9State();
  changedC9.appendOnlyCorrections.find(row => row.nodeId === c.W0_STAGE_ID).to = 'BLOCKED_TYPED';
  assert.equal(c.compileWordVerdict(valid(c, { c9EffectiveState: changedC9 })).code, 'E_R24_V2_C9_W0_CORRECTION_BINDING');
  const changedEvidence = c8bEvidence();
  changedEvidence.observations.safety.userDocumentsTouched = true;
  assert.equal(c.compileWordVerdict(valid(c, { c8bEvidence: changedEvidence })).code, 'E_R24_V2_C8B_EVIDENCE_BOUNDARY');
});

test('V2 rejects workflow inversion and evidence-side authority promotion', async () => {
  const c = await compiler();
  const inverted = workflowFixture(scripts => ['test:r24-v2', ...scripts.filter(item => item !== 'test:r24-v2')]);
  assert.equal(c.compileWordVerdict(valid(c, { workflowText: inverted })).code, 'E_R24_V2_WORKFLOW_ORDER');
  assert.equal(c.compileWordVerdict(valid(c, { gateEvidence: [gateRow(c, program(), { productApplyAuthority: true })] })).code, 'E_R24_V2_GATE_AUTHORITY_PROMOTION_FORBIDDEN');
  assert.equal(c.compileWordVerdict(valid(c, { gateEvidence: [gateRow(c, program(), { profileVerdictCandidate: 'PASS' })] })).code, 'E_R24_V2_W0_BLOCKED_CLASSIFICATION_REQUIRED');
});
