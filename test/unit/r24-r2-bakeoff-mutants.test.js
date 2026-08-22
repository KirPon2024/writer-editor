'use strict';

// R2.4 R2 implementation mutation suite for the storage bakeoff law.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'storage-bakeoff-v1.cjs');

const MUTANTS = [
  {
    id: 'dependency-filter-removed',
    find: '  if (candidate.requiresDependency) {',
    replace: '  if (false) {',
  },
  {
    id: 'network-filter-removed',
    find: '  if (candidate.requiresNetwork) {',
    replace: '  if (false) {',
  },
  {
    id: 'no-model-filter-removed',
    find: "  if (typeof candidate.model !== 'function') {",
    replace: '  if (false) {',
  },
  {
    id: 'crash-assertion-removed',
    find: "  if (!crashSeen) throw new StorageBakeoffError('E_BENCHMARK_CRASH_NOT_INJECTED', candidate.id);",
    replace: '  if (false) { throw new StorageBakeoffError(\'E_BENCHMARK_CRASH_NOT_INJECTED\', candidate.id); }',
  },
  {
    id: 'dossier-order-randomized',
    find: "  rows.sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));",
    replace: '  rows.sort((a, b) => (a.candidateId > b.candidateId ? -1 : 1));',
  },
  {
    id: 'torn-tail-silently-read',
    find: '        tornStateDetected = true;\n        truncatedTail = true;\n        break;',
    replace: '        recoveredRevision = entry && Number.isInteger(entry.revision) ? entry.revision : recoveredRevision;\n        continue;',
  },
];

async function killOracle(module) {
  const {
    CANDIDATE_REGISTRY,
    applyHardSafetyFilters,
    runCandidateBenchmark,
    compileDossier,
  } = module;

  // Filters: dependency, network and model-less candidates eliminated.
  assert.equal(applyHardSafetyFilters(CANDIDATE_REGISTRY.sqlite).code, 'E_CANDIDATE_DEPENDENCY');
  assert.equal(applyHardSafetyFilters({ id: 'n', requiresDependency: false, requiresNetwork: true, destructiveMigration: false, model: () => {} }).code, 'E_CANDIDATE_NETWORK');
  assert.equal(applyHardSafetyFilters({ id: 'm', requiresDependency: false, requiresNetwork: false, destructiveMigration: false, model: null }).code, 'E_CANDIDATE_NO_MODEL');

  // Benchmark: crash injection mandatory; recovery deterministic.
  const neverCrashes = {
    id: 'never-crashes',
    requiresDependency: false,
    requiresNetwork: false,
    destructiveMigration: false,
    model: () => ({
      async write() {},
      async recover() { return { tornStateDetected: false, recoveredRevision: 8, readable: true }; },
      async readBack() { return 'rev:8'; },
      metrics: () => ({ bytesWritten: 0 }),
    }),
  };
  await assert.rejects(
    runCandidateBenchmark(neverCrashes, fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r2m-nc-')))),
    (e) => e.code === 'E_BENCHMARK_CRASH_NOT_INJECTED',
  );
  const sandboxA = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r2m-a-')));
  const ledger = await runCandidateBenchmark(CANDIDATE_REGISTRY['append-ledger'], sandboxA);
  assert.equal(ledger.crashInjected, true);
  assert.equal(ledger.tornStateDetected, true, 'the torn tail must be detected, never silently read');
  assert.equal(ledger.recoveredRevision, 5);

  // Dossier: deterministic order and selection-free.
  const results = [];
  for (const candidate of Object.values(CANDIDATE_REGISTRY)) {
    results.push(await runCandidateBenchmark(candidate, sandboxA));
  }
  const dossier = compileDossier(results, 'h');
  const ids = dossier.candidates.map((row) => row.candidateId);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(dossier.selection, 'DEFERRED_TO_WP-203');
}

test('R2 storage bakeoff: all implementation mutants are executed and killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  await killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r2-mutant-'));
    fs.copyFileSync(
      path.join(__dirname, '..', '..', 'src', 'core', 'save-coordinator-v1.cjs'),
      path.join(dir, 'save-coordinator-v1.cjs'),
    );
    const target = path.join(dir, 'storage-bakeoff-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      await killOracle(require(target));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_R2_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
