'use strict';

// R2.4 R2 storage bakeoff law: hard filters before benchmarks, typed
// eliminations, deterministic selection-free dossier.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  STORAGE_BAKEOFF_SCHEMA_VERSION,
  StorageBakeoffError,
  CANDIDATE_REGISTRY,
  applyHardSafetyFilters,
  runCandidateBenchmark,
  compileDossier,
} = require(path.join(__dirname, '..', '..', 'src', 'core', 'storage-bakeoff-v1.cjs'));

const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r2-')));

test('candidate registry is exactly the four mandated candidates, frozen', () => {
  assert.deepEqual(Object.keys(CANDIDATE_REGISTRY).sort(), ['append-ledger', 'atomic-file', 'hybrid', 'sqlite']);
  assert.equal(Object.isFrozen(CANDIDATE_REGISTRY), true);
  for (const candidate of Object.values(CANDIDATE_REGISTRY)) {
    assert.equal(Object.isFrozen(candidate), true);
  }
});

test('hard safety filters: sqlite is eliminated by the dependency law before any benchmark', () => {
  const verdict = applyHardSafetyFilters(CANDIDATE_REGISTRY.sqlite);
  assert.equal(verdict.admitted, false);
  assert.equal(verdict.code, 'E_CANDIDATE_DEPENDENCY');
  assert.equal(verdict.candidateId, 'sqlite');
  for (const id of ['atomic-file', 'append-ledger', 'hybrid']) {
    assert.equal(applyHardSafetyFilters(CANDIDATE_REGISTRY[id]).admitted, true, id);
  }
});

test('hard safety filters: network, destructive and model-less candidates are typed eliminations', () => {
  const base = { id: 'x', requiresDependency: false, requiresNetwork: false, destructiveMigration: false, model: () => {} };
  assert.equal(applyHardSafetyFilters({ ...base, requiresNetwork: true }).code, 'E_CANDIDATE_NETWORK');
  assert.equal(applyHardSafetyFilters({ ...base, destructiveMigration: true }).code, 'E_CANDIDATE_DESTRUCTIVE');
  assert.equal(applyHardSafetyFilters({ ...base, model: null }).code, 'E_CANDIDATE_NO_MODEL');
  assert.throws(() => applyHardSafetyFilters(null), (e) => e instanceof StorageBakeoffError && e.code === 'E_CANDIDATE_SHAPE');
});

test('eliminated candidates never reach the benchmark', async () => {
  const result = await runCandidateBenchmark(CANDIDATE_REGISTRY.sqlite, sandbox());
  assert.equal(result.admitted, false);
  assert.equal(result.filterCode, 'E_CANDIDATE_DEPENDENCY');
  assert.equal('bytesWritten' in result, false, 'no benchmark evidence for an eliminated candidate');
});

test('dossier is deterministic, canonical and selection-free', async () => {
  const dirA = sandbox();
  const dirB = sandbox();
  const resultsA = [];
  const resultsB = [];
  for (const candidate of Object.values(CANDIDATE_REGISTRY)) {
    resultsA.push(await runCandidateBenchmark(candidate, dirA));
  }
  for (const candidate of Object.values(CANDIDATE_REGISTRY)) {
    resultsB.push(await runCandidateBenchmark(candidate, dirB));
  }
  const dossierA = JSON.stringify(compileDossier(resultsA, 'head-a'));
  const dossierB = JSON.stringify(compileDossier(resultsB, 'head-a'));
  assert.equal(dossierA, dossierB, 'the dossier is byte-deterministic across runs');
  const dossier = compileDossier(resultsA, 'head-a');
  assert.equal(dossier.schemaVersion, STORAGE_BAKEOFF_SCHEMA_VERSION);
  assert.equal(dossier.selection, 'DEFERRED_TO_WP-203', 'the bakeoff never selects');
  assert.equal(dossier.candidates.length, 4);
  assert.throws(() => compileDossier([], 'head-a'), (e) => e.code === 'E_DOSSIER_EMPTY');
});

test('admitted candidates complete the identical operation sequence with crash evidence', async () => {
  for (const id of ['atomic-file', 'append-ledger', 'hybrid']) {
    const result = await runCandidateBenchmark(CANDIDATE_REGISTRY[id], sandbox());
    assert.equal(result.admitted, true, id);
    assert.equal(result.crashInjected, true, id);
    assert.equal(result.recoveredRevision >= 5, true, `${id}: recovered at least to the last pre-crash commit, got ${result.recoveredRevision}`);
    assert.equal(result.recoveryReadable, true, id);
  }
});
