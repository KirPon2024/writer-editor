'use strict';

// R2.4 V0 mutation proof: core compiler guards are inverted in isolated
// module copies. The oracle must kill every optional-profile, exact-head,
// dependency, workflow-order and overclaim mutant.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'writer-claim-compiler-v0.mjs');
const CANONICAL_JSON_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'canonical-json.mjs');
const OBSERVED_EVIDENCE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'observed-evidence-v2.mjs');
const DAG_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const HEAD = '1'.repeat(40);
const ORIGIN = '2'.repeat(40);
const TREE = '3'.repeat(40);
const DIGEST = 'f'.repeat(64);

const MUTANTS = Object.freeze([
  {
    id: 'optional-profile-evidence-admitted',
    find: "  if (optionalEvidence.length > 0) return fail('E_R24_V0_OPTIONAL_PROFILE_IMPORTED', optionalEvidence.map((row) => row.stageId).join(','));",
    replace: "  if (false) return fail('E_R24_V0_OPTIONAL_PROFILE_IMPORTED', optionalEvidence.map((row) => row.stageId).join(','));",
    oracle: async (c) => {
      const input = validInput(c);
      input.gateEvidence = [...observedWriterEvidence(c, input.program), observedRow(c, input.program, 'A0_ATLAS_INCREMENTAL_EQUIVALENCE')];
      const result = c.compileWriterVerdict(input);
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V0_OPTIONAL_PROFILE_IMPORTED');
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
      const result = c.compileWriterVerdict(input);
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V0_GATE_HEAD_MISMATCH');
    },
  },
  {
    id: 'global-pass-admitted',
    find: "  if (claimRequest.programVerdict === 'PASS' || claimRequest.globalScalarPass === true) {",
    replace: "  if (false) {",
    oracle: async (c) => {
      const result = c.compileWriterVerdict(validInput(c, { claimRequest: { programVerdict: 'PASS' } }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V0_PROGRAM_SCALAR_PASS_FORBIDDEN');
    },
  },
  {
    id: 'v0-workflow-step-missing-admitted',
    find: "  if (v0Index < 0) return fail('E_R24_V0_WORKFLOW_STEP_MISSING', v0Script);",
    replace: "  if (false) return fail('E_R24_V0_WORKFLOW_STEP_MISSING', v0Script);",
    oracle: async (c) => {
      const result = c.compileWriterVerdict(validInput(c, {
        workflowText: workflowFixture(c, (scripts) => scripts.filter((script) => script !== 'test:r24-v0')),
      }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V0_WORKFLOW_STEP_MISSING');
    },
  },
  {
    id: 'missing-stage-evidence-admitted',
    find: "    if (!evidenceByStage.has(stageId)) return fail('E_R24_V0_GATE_EVIDENCE_MISSING', stageId);",
    replace: "    if (false) return fail('E_R24_V0_GATE_EVIDENCE_MISSING', stageId);",
    oracle: async (c) => {
      const input = validInput(c);
      input.gateEvidence = input.gateEvidence.filter((row) => row.stageId !== 'F0_WRITER_REFINEMENT_CONFORMANCE');
      const result = c.compileWriterVerdict(input);
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V0_GATE_EVIDENCE_MISSING');
    },
  },
]);

async function importModule(modulePath) {
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}-${Math.random()}`);
}

function loadDag() {
  return JSON.parse(fs.readFileSync(DAG_PATH, 'utf8'));
}

function packageFixture(c) {
  const scripts = {};
  for (const script of Object.values(c.STAGE_SCRIPT_BY_ID)) scripts[script] = `node --test ${script}`;
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
  return mutateScripts(scripts).map((script) => `        run: npm run -s ${script}`).join('\n');
}

function validInput(c, overrides = {}) {
  const program = loadDag();
  return {
    program,
    repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: false },
    packageJson: packageFixture(c),
    expectedHeadSha: HEAD,
    expectedOriginMainSha: ORIGIN,
    claimRequest: overrides.claimRequest,
    gateEvidence: Object.hasOwn(overrides, 'gateEvidence') ? overrides.gateEvidence : observedWriterEvidence(c, program),
    workflowText: overrides.workflowText || workflowFixture(c),
  };
}

function observedRow(c, program, stageId, overrides = {}) {
  const stage = program.stages.find((row) => row.stageId === stageId);
  assert.ok(stage, `stage fixture missing: ${stageId}`);
  const script = c.STAGE_SCRIPT_BY_ID[stageId] || `test:r24-${String(stageId).split('_')[0].toLowerCase()}`;
  return {
    stageId,
    status: 'SUCCESS',
    headSha: HEAD,
    treeSha: TREE,
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    source: 'V0_COMPILER_CONTRACT_FIXTURE',
    candidate: { stageId, script, profile: stage.profile },
    run: { id: `run-${stageId}`, attempt: 1, headSha: HEAD, conclusion: 'success' },
    job: { id: `job-${stageId}`, name: script, conclusion: 'success' },
    step: { name: script, conclusion: 'success' },
    artifact: { name: `${stageId}.json`, digest: DIGEST },
    tool: { name: c.V0_STAGE_ID, digest: DIGEST },
    schema: { name: 'EvidenceStampV2', digest: DIGEST },
    fixture: { name: 'r24-v0-writer-claim-mutants', digest: DIGEST },
    counts: { passed: 1, failed: 0, skipped: 0, denominator: 1, exitCode: 0 },
    ...overrides,
  };
}

function observedWriterEvidence(c, program = loadDag()) {
  return c.expectedWriterStageIds(program).map((stageId) => observedRow(c, program, stageId));
}

function materializeMutant(mutant) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-v0-mutant-')));
  const sourcePath = mutant.target === 'observed' ? OBSERVED_EVIDENCE_PATH : MODULE_PATH;
  const source = fs.readFileSync(sourcePath, 'utf8');
  const occurrences = source.split(mutant.find).length - 1;
  assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
  fs.copyFileSync(CANONICAL_JSON_PATH, path.join(dir, 'canonical-json.mjs'));
  fs.copyFileSync(OBSERVED_EVIDENCE_PATH, path.join(dir, 'observed-evidence-v2.mjs'));
  const modulePath = path.join(dir, 'writer-claim-compiler-v0.mjs');
  fs.copyFileSync(MODULE_PATH, modulePath);
  const mutantPath = mutant.target === 'observed' ? path.join(dir, 'observed-evidence-v2.mjs') : modulePath;
  fs.writeFileSync(mutantPath, source.replace(mutant.find, mutant.replace));
  return { dir, modulePath };
}

test('V0 Writer claim compiler mutants are executed and killed', async () => {
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
  console.log(`R24_V0_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
