'use strict';

// R2.4 A0 mutation proof: weakening the exact-head, equivalence, stale,
// queue, resource, and overclaim guards must be killed by the oracle.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'atlas-incremental-equivalence-a0.mjs');
const CANONICAL_JSON_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'canonical-json.mjs');
const DAG_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const CONTRACTS_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'SCIENTIFIC_CONTRACTS.json');
const HEAD = '6'.repeat(40);
const ORIGIN = '7'.repeat(40);
const TREE = '8'.repeat(40);

const MUTANTS = Object.freeze([
  {
    id: 'exact-head-mismatch-admitted',
    find: "  if (repoState.headSha !== expectedHeadSha) {\n    return fail('E_R24_A0_EXACT_HEAD_MISMATCH', `${repoState.headSha} != ${expectedHeadSha}`, {\n      headSha: repoState.headSha,\n      expectedHeadSha,\n    });\n  }",
    replace: "  if (false) {\n    return fail('E_R24_A0_EXACT_HEAD_MISMATCH', `${repoState.headSha} != ${expectedHeadSha}`, {\n      headSha: repoState.headSha,\n      expectedHeadSha,\n    });\n  }",
    oracle: async (c, proof) => {
      const result = c.compileAtlasA0Evidence(await validInput(c, proof, {
        repoState: { headSha: '9'.repeat(40), originMainSha: ORIGIN, treeSha: TREE, dirty: false },
      }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_A0_EXACT_HEAD_MISMATCH');
    },
  },
  {
    id: 'incremental-full-divergence-admitted',
    find: "  if (proof.observations?.normal?.equivalent !== true) {\n    return fail('E_R24_A0_INCREMENTAL_FULL_DIVERGENCE', JSON.stringify(proof.observations?.normal || null));\n  }",
    replace: "  if (false) {\n    return fail('E_R24_A0_INCREMENTAL_FULL_DIVERGENCE', JSON.stringify(proof.observations?.normal || null));\n  }",
    oracle: async (c, proof) => {
      const badProof = clone(proof);
      badProof.observations.normal.equivalent = false;
      const result = c.compileAtlasA0Evidence(await validInput(c, badProof));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_A0_INCREMENTAL_FULL_DIVERGENCE');
    },
  },
  {
    id: 'stale-source-publication-admitted',
    find: "  if (proof.faults?.staleSource?.accepted !== false || proof.faults?.staleSource?.code !== 'E_ATLAS_GLOBAL_COMPOSITE_STALE_RESULT') {\n    return fail('E_R24_A0_STALE_SOURCE_ADMITTED', JSON.stringify(proof.faults?.staleSource || null));\n  }",
    replace: "  if (false) {\n    return fail('E_R24_A0_STALE_SOURCE_ADMITTED', JSON.stringify(proof.faults?.staleSource || null));\n  }",
    oracle: async (c, proof) => {
      const badProof = clone(proof);
      badProof.faults.staleSource.accepted = true;
      const result = c.compileAtlasA0Evidence(await validInput(c, badProof));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_A0_STALE_SOURCE_ADMITTED');
    },
  },
  {
    id: 'queue-boundary-admitted',
    find: "  if (proof.scheduler?.queue?.bounded !== true || proof.scheduler?.queue?.oneJobPerProject !== true || proof.scheduler?.queue?.latestPerRetainedProject !== true) {\n    return fail('E_R24_A0_QUEUE_BOUNDARY_UNPROVEN', JSON.stringify(proof.scheduler?.queue || null));\n  }",
    replace: "  if (false) {\n    return fail('E_R24_A0_QUEUE_BOUNDARY_UNPROVEN', JSON.stringify(proof.scheduler?.queue || null));\n  }",
    oracle: async (c, proof) => {
      const badProof = clone(proof);
      badProof.scheduler.queue.bounded = false;
      const result = c.compileAtlasA0Evidence(await validInput(c, badProof));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_A0_QUEUE_BOUNDARY_UNPROVEN');
    },
  },
  {
    id: 'resource-render-all-admitted',
    find: "  if (proof.resource?.withinBudget !== true || proof.resource?.renderAllNodes !== false || proof.resource?.renderAllEdges !== false) {\n    return fail('E_R24_A0_RESOURCE_BUDGET_UNPROVEN', JSON.stringify(proof.resource || null));\n  }",
    replace: "  if (false) {\n    return fail('E_R24_A0_RESOURCE_BUDGET_UNPROVEN', JSON.stringify(proof.resource || null));\n  }",
    oracle: async (c, proof) => {
      const badProof = clone(proof);
      badProof.resource.renderAllNodes = true;
      const result = c.compileAtlasA0Evidence(await validInput(c, badProof));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_A0_RESOURCE_BUDGET_UNPROVEN');
    },
  },
  {
    id: 'atlas-overclaim-admitted',
    find: "  if (claimRequest.claimCeiling && claimRequest.claimCeiling !== A0_CLAIM_CEILING) {\n    return fail('E_R24_A0_OVERCLAIM', claimRequest.claimCeiling);\n  }",
    replace: "  if (false) {\n    return fail('E_R24_A0_OVERCLAIM', claimRequest.claimCeiling);\n  }",
    oracle: async (c, proof) => {
      const result = c.compileAtlasA0Evidence(await validInput(c, proof, {
        claimRequest: { claimCeiling: 'UNIVERSAL_ATLAS_SCALE' },
      }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'E_R24_A0_OVERCLAIM');
    },
  },
]);

async function importModule(modulePath) {
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}-${Math.random()}`);
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
      'test:r24-v0': 'node --test v0',
      'test:r24-a0': 'node --test a0',
    },
  };
}

function workflowFixture() {
  return '        run: npm run -s test:r24-v0\n        run: npm run -s test:r24-a0\n';
}

async function validInput(c, proof, overrides = {}) {
  return {
    program: loadJson(DAG_PATH),
    scientificContracts: loadJson(CONTRACTS_PATH),
    repoState: overrides.repoState || {
      headSha: HEAD,
      originMainSha: ORIGIN,
      treeSha: TREE,
      dirty: false,
    },
    packageJson: packageFixture(),
    workflowText: workflowFixture(),
    expectedHeadSha: overrides.expectedHeadSha || HEAD,
    expectedOriginMainSha: overrides.expectedOriginMainSha === undefined ? ORIGIN : overrides.expectedOriginMainSha,
    proof: clone(proof),
    claimRequest: overrides.claimRequest,
    now: '2026-08-22T14:10:00.000Z',
  };
}

function materializeMutant(mutant) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-a0-mutant-')));
  const moduleDir = path.join(root, 'scripts', 'ops', 'r24');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'src'), path.join(root, 'src'), 'dir');
  fs.copyFileSync(CANONICAL_JSON_PATH, path.join(moduleDir, 'canonical-json.mjs'));
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const occurrences = source.split(mutant.find).length - 1;
  assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
  const modulePath = path.join(moduleDir, 'atlas-incremental-equivalence-a0.mjs');
  fs.writeFileSync(modulePath, source.replace(mutant.find, mutant.replace));
  return { root, modulePath };
}

test('A0 Atlas incremental equivalence mutants are executed and killed', async () => {
  const baseline = await importModule(MODULE_PATH);
  const proof = baseline.runAtlasA0Proof({ deadlineMs: 2500 });
  for (const mutant of MUTANTS) await mutant.oracle(baseline, proof);

  const results = [];
  for (const mutant of MUTANTS) {
    const { root, modulePath } = materializeMutant(mutant);
    let killed = false;
    let detail = '';
    try {
      await mutant.oracle(await importModule(modulePath), proof);
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
    results.push({ id: mutant.id, killed, detail });
  }

  const survived = results.filter((result) => !result.killed);
  console.log(`R24_A0_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
