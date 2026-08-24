'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const decision = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'OPS', 'R24', 'OWNER_GATE_DECISIONS', 'STORAGE_AUTHORITY_ADR_R2_STORAGE_BAKEOFF_V1.json'), 'utf8'));
const { CANDIDATE_REGISTRY, runCandidateBenchmark, compileDossier } = require(path.join(ROOT, 'src', 'core', 'storage-bakeoff-v1.cjs'));
const { parseLedgerText, LEDGER_BASENAME } = require(path.join(ROOT, 'src', 'core', 'recovery-ledger-v1.cjs'));
const { selectStorageRecoveryPlan, openSelectedRecoveryLedger } = require(path.join(ROOT, 'src', 'core', 'storage-selection-v1.cjs'));

const sandbox = (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
const HEAD = 'c'.repeat(40);

async function realSelection() {
  const dir = sandbox('r24-wp203-bakeoff-');
  const results = [];
  for (const candidate of Object.values(CANDIDATE_REGISTRY)) {
    results.push(await runCandidateBenchmark(candidate, dir));
  }
  return selectStorageRecoveryPlan({ dossier: compileDossier(results, HEAD), ownerDecision: decision, selectionHeadSha: HEAD });
}

test('real filesystem bakeoff selects the existing atomic commit truth without touching a live path', async () => {
  const selection = await realSelection();
  assert.equal(selection.selectedPrimaryStorage.candidateId, 'atomic-file');
  assert.deepEqual(selection.bakeoff.paretoFrontierIds, ['atomic-file']);
  assert.equal(selection.authority.liveStoragePathChange, false);
  assert.equal(selection.authority.userDataMigration, false);
  assert.equal(selection.authority.destructiveStorageAction, false);
  assert.equal(selection.authority.dependencyAdoption, false);
});

test('the selected bounded ledger reopens, detects a torn tail, and continues its digest chain', async () => {
  const selection = await realSelection();
  const dir = sandbox('r24-wp203-ledger-');
  const first = await openSelectedRecoveryLedger(selection, dir, { maxEntries: 8 });
  const entry = await first.append({ kind: 'scene.commit', subject: 'scene-a.txt', revision: 1 });
  fs.appendFileSync(path.join(dir, LEDGER_BASENAME), '{"seq":2,"kind":"scene.commit"');

  const reopened = await openSelectedRecoveryLedger(selection, dir, { maxEntries: 8 });
  assert.equal(reopened.tornTailTruncated, true);
  assert.equal(reopened.headDigest(), entry.digest);
  const continued = await reopened.append({ kind: 'scene.commit', subject: 'scene-a.txt', revision: 2 });
  assert.equal(continued.seq, 2);
  assert.equal(continued.prevDigest, entry.digest);
  assert.equal(parseLedgerText(fs.readFileSync(path.join(dir, LEDGER_BASENAME), 'utf8')).tornTail, false);
});

test('a tampered selection cannot open even a disposable ledger', async () => {
  const selection = structuredClone(await realSelection());
  selection.authority.liveStoragePathChange = true;
  await assert.rejects(openSelectedRecoveryLedger(selection, sandbox('r24-wp203-refuse-')), (e) => e.code === 'E_STORAGE_SELECTION_RECEIPT_DIGEST');
});
