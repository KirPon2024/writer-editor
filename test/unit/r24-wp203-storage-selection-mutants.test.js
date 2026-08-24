'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src', 'core', 'storage-selection-v1.cjs');
const decision = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'OPS', 'R24', 'OWNER_GATE_DECISIONS', 'STORAGE_AUTHORITY_ADR_R2_STORAGE_BAKEOFF_V1.json'), 'utf8'));
const HEAD = 'd'.repeat(40);

const MUTANTS = [
  { id: 'owner-approval-bypass', find: "  if (decision.decision !== 'APPROVED') throw new StorageSelectionError('E_STORAGE_SELECTION_OWNER_GATE', String(decision.decision));", replace: "  if (false) throw new StorageSelectionError('E_STORAGE_SELECTION_OWNER_GATE', String(decision.decision));" },
  { id: 'authority-expansion-bypass', find: "  if (scope.dependencyAdoption !== false\n    || scope.liveStoragePathChange !== false\n    || scope.userDataMigration !== false\n    || scope.destructiveStorageAction !== false) {", replace: "  if (false) {" },
  { id: 'correctness-filter-bypass', find: "  const correct = evaluations.filter((row) => row.correctnessPassed);", replace: "  const correct = evaluations.filter((row) => row.admitted);" },
  { id: 'pareto-dominance-bypass', find: "  return noWorse && strictlyBetter;", replace: "  return false;" },
  { id: 'receipt-digest-bypass', find: "  if (sha256Canonical(body) !== selectionDigest) {", replace: "  if (false) {" },
];

const dossier = () => ({
  schemaVersion: 'yalken.storageBakeoff.v1', headSha: HEAD, selection: 'DEFERRED_TO_WP-203', candidates: [
    { candidateId: 'atomic-file', admitted: true, filterCode: '', crashInjected: true, recoveredRevision: 8, tornStateDetected: false, recoveryReadable: true, readBack: 'rev:8', bytesWritten: 40 },
    { candidateId: 'append-ledger', admitted: true, filterCode: '', crashInjected: true, recoveredRevision: 5, tornStateDetected: true, recoveryReadable: true, readBack: 'rev:5', bytesWritten: 640 },
    { candidateId: 'hybrid', admitted: true, filterCode: '', crashInjected: true, recoveredRevision: 8, tornStateDetected: false, recoveryReadable: true, readBack: 'rev:8', bytesWritten: 180 },
    { candidateId: 'sqlite', admitted: false, filterCode: 'E_CANDIDATE_DEPENDENCY' },
  ],
});

function killOracle(module) {
  const pending = structuredClone(decision);
  pending.decision = 'PENDING';
  assert.throws(() => module.selectStorageRecoveryPlan({ dossier: dossier(), ownerDecision: pending, selectionHeadSha: HEAD }));

  const widened = structuredClone(decision);
  widened.authorizedScope.liveStoragePathChange = true;
  assert.throws(() => module.selectStorageRecoveryPlan({ dossier: dossier(), ownerDecision: widened, selectionHeadSha: HEAD }));

  const broken = dossier();
  broken.candidates[0].readBack = 'rev:7';
  const filtered = module.selectStorageRecoveryPlan({ dossier: broken, ownerDecision: decision, selectionHeadSha: HEAD });
  assert.equal(filtered.selectedPrimaryStorage.candidateId, 'hybrid');

  const selection = module.selectStorageRecoveryPlan({ dossier: dossier(), ownerDecision: decision, selectionHeadSha: HEAD });
  assert.deepEqual(selection.bakeoff.paretoFrontierIds, ['atomic-file']);
  const tampered = structuredClone(selection);
  tampered.bakeoff.dossierDigest = 'f'.repeat(64);
  assert.throws(() => module.verifyStorageSelection(tampered));
}

test('WP203 storage selection: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    assert.equal(source.split(mutant.find).length - 1, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp203-mutant-'));
    for (const basename of ['save-coordinator-v1.cjs', 'storage-bakeoff-v1.cjs', 'recovery-ledger-v1.cjs']) {
      fs.copyFileSync(path.join(ROOT, 'src', 'core', basename), path.join(dir, basename));
    }
    const target = path.join(dir, 'storage-selection-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    try { killOracle(require(target)); } catch { killed = true; }
    results.push({ id: mutant.id, killed });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((row) => !row.killed);
  console.log(`R24_WP203_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((row) => row.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true);
  assert.deepEqual(survived, []);
});
