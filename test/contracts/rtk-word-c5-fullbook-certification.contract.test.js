const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5-fullbook-certification.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFETY_REMEDIATION_V1_C5_FULLBOOK_CERTIFICATION_RECEIPT.json');
const MANIFEST_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFETY_REMEDIATION_V1_C5_FULLBOOK_MANIFEST.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadVerifier() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('C5 full-book receipt binds physical product route and stops at independent audit', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const result = verifier.evaluateWordC5FullbookCertification({ receipt, manifest });

  assert.equal(result.status, 'PASS', JSON.stringify(result.issues, null, 2));
  assert.equal(receipt.status, 'WORD_SAFETY_REMEDIATION_V1_C5_FULLBOOK_PHYSICAL_CERTIFIED_READY_FOR_AUDIT');
  assert.equal(receipt.nextStage, 'READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT');
  assert.equal(receipt.capabilityClaims.wordSaturated, false);
  assert.equal(receipt.capabilityClaims.googleDocsOpened, false);
  assert.equal(receipt.capabilityClaims.handcraftedOoxmlAuthority, false);
});

test('C5 deterministic ledger has exact required operation family counts', () => {
  const manifest = readJson(MANIFEST_PATH);

  assert.equal(manifest.corpus.sceneCount, 21);
  assert.equal(manifest.ledger.operationCount, 2000);
  assert.deepEqual(manifest.ledger.counts, {
    'tracked-replacement': 1200,
    'root-comment': 300,
    'comment-reply': 120,
    'comment-state-delete': 100,
    formatting: 180,
    structural: 60,
    probe: 40,
  });
  assert.deepEqual(manifest.ledger.expectedOutcomes, {
    EXACT: 1200,
    SAFE_APPLY: 400,
    MANUAL: 360,
    BLOCKED: 40,
  });
});

test('C5 required phases all pass with zero vetoes and real Word route evidence', () => {
  const receipt = readJson(RECEIPT_PATH);
  const phases = new Map(receipt.phases.map((phase) => [phase.phaseId, phase]));

  for (const required of [
    'clean-noop-1',
    'clean-noop-2',
    'clean-noop-3',
    'two-chapter-200-op-smoke',
    'whole-book-light-pass',
    'five-round-editorial-lifecycle-1',
    'five-round-editorial-lifecycle-2',
    'five-round-editorial-lifecycle-3',
    'five-round-editorial-lifecycle-4',
    'five-round-editorial-lifecycle-5',
    'heavy-2000-operation-ledger',
    'replay-recovery-concurrency-forks',
    'final-repetition-1',
    'final-repetition-2',
    'final-repetition-3',
  ]) {
    assert.equal(phases.has(required), true, `missing ${required}`);
    assert.equal(phases.get(required).failCases, 0, `failed ${required}`);
  }
  assert.deepEqual(Object.values(receipt.vetoMetrics).filter((value) => Number(value) !== 0), []);
  assert.equal(receipt.liveElectronUiExportSurfaceClick.ok, true);
  assert.equal(receipt.totals.productCommandHandlerOriginated, receipt.totals.physicalCaseCount);
  assert.equal(receipt.totals.physicalWordOpenEditNativeSaveReopen, receipt.totals.physicalCaseCount);
  assert.equal(receipt.totals.authenticatedIntake, receipt.totals.physicalCaseCount);
  assert.equal(receipt.totals.ledgerOperationCount, 2000);
  assert.ok(receipt.totals.physicallyExercisedOperationCount >= 2000);
});

test('C5 implementation does not open Google or product network paths', () => {
  const source = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const receipt = readJson(RECEIPT_PATH);

  assert.doesNotMatch(source, /docs\.google|openGoogle|Google Docs|googleapis|LibreOffice|ONLYOFFICE|Apple Pages|WPS/u);
  assert.equal(receipt.artifactPolicy.productNetworkRequired, false);
  assert.equal(receipt.artifactPolicy.googleProductWorkBlocked, true);
  assert.equal(receipt.vetoMetrics.productNetwork, 0);
});
