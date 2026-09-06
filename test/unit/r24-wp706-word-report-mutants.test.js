'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, baseInput, read } = require('../fixtures/r24-wp706-word-report-fixtures.js');

const MODULE = path.join(ROOT, 'scripts/ops/r24/word-report-wp706.mjs');
const load = file => import(`${pathToFileURL(file).href}?v=${Date.now()}-${Math.random()}`);

const MUTANTS = [
  ["claim.currentVerdict !== 'BLOCKED'", 'false', input => { input.scientificContracts.claims.find(row => row.claimId === 'CLM_WORD_ROUNDTRIP').currentVerdict = 'PASS'; }],
  ['repoState.headSha !== expectedHeadSha', 'false', input => { input.repoState.headSha = '4'.repeat(40); }],
  ['repoState?.originMainSha !== expectedOriginMainSha', 'false', input => { input.repoState.originMainSha = '4'.repeat(40); }],
  ['sourceDigests?.[name] !== digest', 'false', input => { input.sourceDigests.c1Receipt = '0'.repeat(64); }],
  ["node?.outcome !== 'Disposable full-book report-only replay and harness qualification'", 'false', input => { input.executableProgram.nodes.find(row => row.id === 'WP-706_WORD_REPORT').outcome = 'route pass'; }],
  ["node?.ownerGate !== null", 'false', input => { input.executableProgram.nodes.find(row => row.id === 'WP-706_WORD_REPORT').ownerGate = 'FORGED'; }],
  ['stableJson(node?.dependsOn) !== stableJson(expectedDependencies)', 'false', input => { input.executableProgram.nodes.find(row => row.id === 'WP-706_WORD_REPORT').dependsOn.pop(); }],
  ["v2EffectiveState.wordProfileVerdict !== 'BLOCKED'", 'false', input => { input.v2EffectiveState.wordProfileVerdict = 'PASS'; }],
  ['const promoted = FORBIDDEN_TRUE_FIELDS.find(field => claimRequest?.[field] === true);', 'const promoted = undefined;', input => { input.claimRequest.productApplyAuthority = true; }],
  ['claimRequest?.profiles && stableJson(claimRequest.profiles) !== stableJson([PROFILE_ID])', 'false', input => { input.claimRequest.profiles = ['WORD_ROUNDTRIP', 'WRITER_CORE']; }],
];

function materialize(find, replace) {
  const source = fs.readFileSync(MODULE, 'utf8');
  assert.equal(source.split(find).length - 1, 1, `unique mutation anchor: ${find}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp706-mutant-'));
  const absoluteImport = pathToFileURL(path.join(ROOT, 'scripts/ops/rtk-interop-c1-word-fullbook-route-v1.mjs')).href;
  const target = path.join(dir, 'word-report-wp706.mjs');
  const mutated = source
    .replace("'../rtk-interop-c1-word-fullbook-route-v1.mjs'", `'${absoluteImport}'`)
    .replace(find, replace);
  fs.writeFileSync(target, mutated);
  return { dir, target };
}

test('WP706 actual source mutants are all killed by independent hostile inputs', async () => {
  const baseline = await load(MODULE);
  for (const [, , mutate] of MUTANTS) {
    const input = baseInput(baseline);
    mutate(input);
    assert.equal(baseline.compileWordReport(input).ok, false);
  }
  const results = [];
  for (const [find, replace, mutate] of MUTANTS) {
    const { dir, target } = materialize(find, replace);
    try {
      const candidate = await load(target);
      const input = baseInput(candidate);
      mutate(input);
      results.push({ imported: true, killed: candidate.compileWordReport(input).ok === true });
    } catch (error) {
      results.push({ imported: false, killed: false, error: String(error?.message || error) });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  assert.deepEqual(results, Array(MUTANTS.length).fill({ imported: true, killed: true }));
  console.log(`R24_WP706_MUTATION_RECEIPT=${JSON.stringify({ actualSourceMutations: true, killed: results.filter(row => row.killed).length, survived: results.filter(row => !row.killed).length, importFailures: results.filter(row => !row.imported).length, denominator: MUTANTS.length })}`);
});
