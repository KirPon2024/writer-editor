'use strict';

// R2.4 V3 mutation proof: package claim compiler guards are inverted in
// isolated module copies. The oracle must kill profile-import, exact-head,
// dependency, workflow-order, release-promotion, not-ready-contract, and
// overclaim mutants.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'package-claim-compiler-v3.mjs');
const CANONICAL_JSON_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'canonical-json.mjs');
const OBSERVED_EVIDENCE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'observed-evidence-v2.mjs');
const DAG_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const CONTRACTS_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'SCIENTIFIC_CONTRACTS.json');
const HEAD = '1'.repeat(40);
const ORIGIN = '2'.repeat(40);
const TREE = '3'.repeat(40);
const DIGEST = 'f'.repeat(64);

const MUTANTS = Object.freeze([
  {
    id: 'writer-evidence-import-admitted',
    find: "      if (profile !== PACKAGE_PROFILE_ID) return fail('E_R24_V3_PROFILE_IMPORT_FORBIDDEN', row.stageId);",
    replace: "      if (false) return fail('E_R24_V3_PROFILE_IMPORT_FORBIDDEN', row.stageId);",
    oracle: async (c) => {
      const input = validInput(c);
      input.gateEvidence = [...observedPackageEvidence(c, input.program), observedRow(c, input.program, 'F0_WRITER_REFINEMENT_CONFORMANCE')];
      const result = c.compilePackageVerdict(input);
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V3_PROFILE_IMPORT_FORBIDDEN');
    },
  },
  {
    id: 'gate-head-mismatch-admitted',
    target: 'observed',
    find: "  if (row.headSha !== expectedHeadSha) return failure('GATE_HEAD_MISMATCH', `${stageId}:${String(row.headSha || '')} != ${expectedHeadSha}`);",
    replace: "  if (false) return failure('GATE_HEAD_MISMATCH', `${stageId}:${String(row.headSha || '')} != ${expectedHeadSha}`);",
    oracle: async (c) => {
      const input = validInput(c);
      input.gateEvidence[0] = { ...input.gateEvidence[0], headSha: '4'.repeat(40) };
      const result = c.compilePackageVerdict(input);
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V3_GATE_HEAD_MISMATCH');
    },
  },
  {
    id: 'global-pass-admitted',
    find: "  if (claimRequest.programVerdict === 'PASS' || claimRequest.globalScalarPass === true) {",
    replace: "  if (false) {",
    oracle: async (c) => {
      const result = c.compilePackageVerdict(validInput(c, { claimRequest: { programVerdict: 'PASS' } }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V3_PROGRAM_SCALAR_PASS_FORBIDDEN');
    },
  },
  {
    id: 'release-ready-request-admitted',
    find: "  if (claimRequest.releaseReady === true || claimRequest.productionReleaseReady === true) {",
    replace: "  if (false) {",
    oracle: async (c) => {
      const result = c.compilePackageVerdict(validInput(c, { claimRequest: { releaseReady: true } }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V3_RELEASE_READY_CLAIM_FORBIDDEN');
    },
  },
  {
    id: 'v3-workflow-step-missing-admitted',
    find: "  if (!Number.isInteger(v3Index)) return fail('E_R24_V3_WORKFLOW_STEP_MISSING', STAGE_SCRIPT_BY_ID[V3_STAGE_ID]);",
    replace: "  if (false) return fail('E_R24_V3_WORKFLOW_STEP_MISSING', STAGE_SCRIPT_BY_ID[V3_STAGE_ID]);",
    oracle: async (c) => {
      const result = c.compilePackageVerdict(validInput(c, {
        workflowText: workflowFixture((scripts) => scripts.filter((script) => script !== 'test:r24-v3')),
      }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V3_WORKFLOW_STEP_MISSING');
    },
  },
  {
    id: 'missing-pk1-evidence-admitted',
    find: "    if (!evidenceByStage.has(stageId)) return fail('E_R24_V3_GATE_EVIDENCE_MISSING', stageId);",
    replace: "    if (false) return fail('E_R24_V3_GATE_EVIDENCE_MISSING', stageId);",
    oracle: async (c) => {
      const result = c.compilePackageVerdict(validInput(c, { gateEvidence: [] }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V3_GATE_EVIDENCE_MISSING');
    },
  },
  {
    id: 'cannot-promote-unsigned-admitted',
    find: "    if (!Array.isArray(claim.cannotPromote) || !claim.cannotPromote.includes(promoted)) {",
    replace: "    if (false) {",
    oracle: async (c) => {
      const contracts = loadContracts();
      contracts.claims = contracts.claims.map((claim) => (
        claim.claimId === 'CLM_PACKAGED_RELEASE_SECURITY'
          ? { ...claim, cannotPromote: claim.cannotPromote.filter((profile) => profile !== 'UNSIGNED_ARTIFACT') }
          : claim
      ));
      const result = c.compilePackageVerdict(validInput(c, { scientificContracts: contracts }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V3_CANNOT_PROMOTE_MISSING');
    },
  },
  {
    id: 'pk1-before-v3-order-admitted',
    find: "  if (pk1Index >= v3Index) return fail('E_R24_V3_WORKFLOW_PK1_BEFORE_V3_REQUIRED', `${STAGE_SCRIPT_BY_ID[PK1_STAGE_ID]} must run before ${STAGE_SCRIPT_BY_ID[V3_STAGE_ID]}`);",
    replace: "  if (false) return fail('E_R24_V3_WORKFLOW_PK1_BEFORE_V3_REQUIRED', `${STAGE_SCRIPT_BY_ID[PK1_STAGE_ID]} must run before ${STAGE_SCRIPT_BY_ID[V3_STAGE_ID]}`);",
    oracle: async (c) => {
      const earlyV3Workflow = workflowFixture((scripts) => {
        const withoutV3 = scripts.filter((script) => script !== 'test:r24-v3');
        return [...withoutV3.slice(0, withoutV3.indexOf('test:r24-pk1')), 'test:r24-v3', ...withoutV3.slice(withoutV3.indexOf('test:r24-pk1'))];
      });
      const result = c.compilePackageVerdict(validInput(c, { workflowText: earlyV3Workflow }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V3_WORKFLOW_PK1_BEFORE_V3_REQUIRED');
    },
  },
  {
    id: 'pk1-not-ready-classification-admitted',
    find: "    if (row.profileVerdictCandidate !== 'NOT_READY') {",
    replace: "    if (false) {",
    oracle: async (c) => {
      const input = validInput(c);
      input.gateEvidence[0] = { ...input.gateEvidence[0], profileVerdictCandidate: 'PASS' };
      const result = c.compilePackageVerdict(input);
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V3_PK1_NOT_READY_CLASSIFICATION_REQUIRED');
    },
  },
]);

async function importModule(modulePath) {
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}-${Math.random()}`);
}

function loadDag() {
  return JSON.parse(fs.readFileSync(DAG_PATH, 'utf8'));
}

function loadContracts() {
  return JSON.parse(fs.readFileSync(CONTRACTS_PATH, 'utf8'));
}

function packageFixture(c) {
  const scripts = {};
  for (const script of Object.values(c.STAGE_SCRIPT_BY_ID)) scripts[script] = `node --test ${script}`;
  return { scripts };
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
  return mutateScripts(scripts).map((script) => `        run: npm run -s ${script}`).join('\n');
}

function validInput(c, overrides = {}) {
  const program = loadDag();
  return {
    program,
    scientificContracts: overrides.scientificContracts || loadContracts(),
    repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: false },
    packageJson: packageFixture(c),
    workflowText: overrides.workflowText || workflowFixture(),
    expectedHeadSha: HEAD,
    expectedOriginMainSha: ORIGIN,
    claimRequest: overrides.claimRequest,
    gateEvidence: Object.hasOwn(overrides, 'gateEvidence') ? overrides.gateEvidence : observedPackageEvidence(c, program),
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
    candidate: { stageId, script, profile: stage.profile },
    run: { id: `run-${stageId}`, attempt: 1, headSha: HEAD, conclusion: 'success' },
    job: { id: `job-${stageId}`, name: script, conclusion: 'success' },
    step: { name: script, conclusion: 'success' },
    artifact: { name: `${stageId}.json`, digest: DIGEST },
    tool: { name: c.V3_STAGE_ID, digest: DIGEST },
    schema: { name: 'EvidenceStampV2', digest: DIGEST },
    fixture: { name: 'r24-v3-package-claim-mutants', digest: DIGEST },
    counts: { passed: 1, failed: 0, skipped: 0, denominator: 1, exitCode: 0 },
    profileVerdictCandidate: 'NOT_READY',
    stageClosureKind: 'TYPED_RELEASE_SECURITY_NOT_READY_CLASSIFICATION',
    ...overrides,
  };
}

function observedPackageEvidence(c, program = loadDag()) {
  return [observedRow(c, program, 'PK1_RELEASE_SECURITY_PHYSICAL')];
}

function materializeMutant(mutant) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-v3-mutant-')));
  const sourcePath = mutant.target === 'observed' ? OBSERVED_EVIDENCE_PATH : MODULE_PATH;
  const source = fs.readFileSync(sourcePath, 'utf8');
  const occurrences = source.split(mutant.find).length - 1;
  assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
  fs.copyFileSync(CANONICAL_JSON_PATH, path.join(dir, 'canonical-json.mjs'));
  fs.copyFileSync(OBSERVED_EVIDENCE_PATH, path.join(dir, 'observed-evidence-v2.mjs'));
  const modulePath = path.join(dir, 'package-claim-compiler-v3.mjs');
  fs.copyFileSync(MODULE_PATH, modulePath);
  const mutantPath = mutant.target === 'observed' ? path.join(dir, 'observed-evidence-v2.mjs') : modulePath;
  fs.writeFileSync(mutantPath, source.replace(mutant.find, mutant.replace));
  return { dir, modulePath };
}

test('V3 package claim compiler mutants are executed and killed', async () => {
  const baseline = await importModule(MODULE_PATH);
  for (const mutant of MUTANTS) await mutant.oracle(baseline);

  const results = [];
  for (const mutant of MUTANTS) {
    const { dir, modulePath } = materializeMutant(mutant);
    let killed = false;
    let detail = '';
    try {
      await mutant.oracle(await importModule(modulePath));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed, detail });
  }

  const survived = results.filter((result) => !result.killed);
  console.log(`R24_V3_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
