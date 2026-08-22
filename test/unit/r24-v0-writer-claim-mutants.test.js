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
const DAG_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const HEAD = '1'.repeat(40);
const ORIGIN = '2'.repeat(40);
const TREE = '3'.repeat(40);

const MUTANTS = Object.freeze([
  {
    id: 'optional-profile-evidence-admitted',
    find: "  if (optionalEvidence.length > 0) return fail('E_R24_V0_OPTIONAL_PROFILE_IMPORTED', optionalEvidence.map((row) => row.stageId).join(','));",
    replace: "  if (false) return fail('E_R24_V0_OPTIONAL_PROFILE_IMPORTED', optionalEvidence.map((row) => row.stageId).join(','));",
    oracle: async (c) => {
      const input = validInput(c);
      input.gateEvidence = c.buildGateEvidenceFromWorkflowPrefix({
        program: input.program,
        workflowText: input.workflowText,
        repoState: input.repoState,
        expectedHeadSha: HEAD,
      });
      input.gateEvidence.push({
        stageId: 'A0_ATLAS_INCREMENTAL_EQUIVALENCE',
        status: 'SUCCESS',
        headSha: HEAD,
        evidenceClass: 'E6_INDEPENDENT_EXACT_HEAD',
        source: 'V0_COMPILER_CONTRACT_FIXTURE',
      });
      const result = c.compileWriterVerdict(input);
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_V0_OPTIONAL_PROFILE_IMPORTED');
    },
  },
  {
    id: 'gate-head-mismatch-admitted',
    find: "    if (row.headSha !== expectedHeadSha) return fail('E_R24_V0_GATE_HEAD_MISMATCH', `${stageId}:${row.headSha} != ${expectedHeadSha}`);",
    replace: "    if (false) return fail('E_R24_V0_GATE_HEAD_MISMATCH', `${stageId}:${row.headSha} != ${expectedHeadSha}`);",
    oracle: async (c) => {
      const input = validInput(c);
      input.gateEvidence = c.buildGateEvidenceFromWorkflowPrefix({
        program: input.program,
        workflowText: input.workflowText,
        repoState: input.repoState,
        expectedHeadSha: HEAD,
      });
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
      input.gateEvidence = c.buildGateEvidenceFromWorkflowPrefix({
        program: input.program,
        workflowText: input.workflowText,
        repoState: input.repoState,
        expectedHeadSha: HEAD,
      }).filter((row) => row.stageId !== 'F0_WRITER_REFINEMENT_CONFORMANCE');
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
  return {
    program: loadDag(),
    repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: false },
    packageJson: packageFixture(c),
    workflowText: workflowFixture(c),
    expectedHeadSha: HEAD,
    expectedOriginMainSha: ORIGIN,
    claimRequest: overrides.claimRequest,
    gateEvidence: overrides.gateEvidence,
    workflowText: overrides.workflowText || workflowFixture(c),
  };
}

function materializeMutant(mutant) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-v0-mutant-')));
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const occurrences = source.split(mutant.find).length - 1;
  assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
  fs.copyFileSync(CANONICAL_JSON_PATH, path.join(dir, 'canonical-json.mjs'));
  const modulePath = path.join(dir, 'writer-claim-compiler-v0.mjs');
  fs.writeFileSync(modulePath, source.replace(mutant.find, mutant.replace));
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
