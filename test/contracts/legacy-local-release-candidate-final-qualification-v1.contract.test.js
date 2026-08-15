const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'ops',
  'legacy-local-release-candidate-final-qualification-v1.mjs',
);
const RECEIPT_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'STATUS',
  'LEGACY_LOCAL_RELEASE_CANDIDATE_FINAL_QUALIFICATION_V1_RECEIPT.json',
);

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    modulePromise = import(pathToFileURL(SCRIPT_PATH).href);
  }
  return modulePromise;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runVerifier(args = ['--check']) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

test('legacy local release candidate final qualification verifier passes on exact receipt', async () => {
  assert.equal(fs.existsSync(SCRIPT_PATH), true, 'missing final qualification verifier');
  assert.equal(fs.existsSync(RECEIPT_PATH), true, 'missing final qualification receipt');

  const result = runVerifier(['--check', '--json']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.verdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(payload.localReleaseCandidate, 'LOCAL_SOFTWARE_RC_QUALIFIED_PENDING_EXTERNAL_PHYSICAL_GATES');
  assert.equal(payload.fullReleaseReady, false);
  assert.deepEqual(payload.errors, []);
});

test('receipt separates S0/F1, Word 16.112, Google local/E2E, F3 local/physical, and overall verdicts', async () => {
  const { validateLegacyLocalReleaseCandidateReceipt } = await loadModule();
  const receipt = readJson(RECEIPT_PATH);
  const result = validateLegacyLocalReleaseCandidateReceipt(receipt, { repoRoot: REPO_ROOT });
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));

  assert.equal(receipt.featureVerdicts.S0.verdict, 'READY');
  assert.equal(receipt.featureVerdicts.F1_MULTILINGUAL.verdict, 'READY');
  assert.equal(receipt.featureVerdicts.F2_WORD_16_112.verdict, 'READY');
  assert.equal(receipt.featureVerdicts.GOOGLE_DOCS_LOCAL_COMPATIBILITY.verdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(receipt.featureVerdicts.GOOGLE_DOCS_REAL_ACCOUNT_E2E.verdict, 'WAIT_AUTHORITY');
  assert.equal(receipt.featureVerdicts.F3_LOCAL_SOFTWARE.verdict, 'LOCAL_SOFTWARE_READY_FOR_PHYSICAL_GATES');
  assert.equal(receipt.featureVerdicts.F3_PHYSICAL_OWNER_OFF_HOST.verdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(receipt.overallLegacyProgramVerdict, 'NEEDS_MORE_EVIDENCE');

  assert.equal(receipt.denominators.googleDocsLocalContours.completed, 7);
  assert.equal(receipt.denominators.googleDocsLocalContours.required, 7);
  assert.equal(receipt.denominators.googleDocsRealAccountE2E.completed, 0);
  assert.equal(receipt.denominators.googleDocsRealAccountE2E.required, 1);
  assert.equal(receipt.denominators.f3PhysicalOwnerOffHostGates.completed, 0);
  assert.equal(receipt.denominators.f3PhysicalOwnerOffHostGates.required, 5);
  assert.equal(receipt.denominators.unknownAbstainPassAdmissions, 0);
  assert.equal(receipt.denominators.userDocumentsUsed, 0);
  assert.equal(receipt.releaseClaims.fullReleaseReady, false);
  assert.equal(receipt.releaseClaims.platformSaturationClaimed, false);
  assert.equal(receipt.releaseClaims.googleDocsSupportClaimed, false);
});

test('hostile overclaims and evidence laundering are rejected fail-closed', async () => {
  const { validateLegacyLocalReleaseCandidateReceipt } = await loadModule();
  const baseline = readJson(RECEIPT_PATH);

  const cases = [
    {
      name: 'overall READY laundering',
      mutate(doc) {
        doc.overallLegacyProgramVerdict = 'READY';
      },
      error: 'OVERALL_READY_FORBIDDEN_WITH_OPEN_BLOCKERS',
    },
    {
      name: 'full release READY laundering',
      mutate(doc) {
        doc.releaseClaims.fullReleaseReady = true;
      },
      error: 'FULL_RELEASE_READY_FORBIDDEN',
    },
    {
      name: 'Google real account E2E laundering',
      mutate(doc) {
        doc.featureVerdicts.GOOGLE_DOCS_REAL_ACCOUNT_E2E.verdict = 'READY';
        doc.denominators.googleDocsRealAccountE2E.completed = 1;
      },
      error: 'GOOGLE_REAL_ACCOUNT_E2E_MUST_REMAIN_WAIT_AUTHORITY',
    },
    {
      name: 'Word evidence transferred to Google',
      mutate(doc) {
        doc.releaseClaims.wordEvidenceTransferredToGoogleDocs = true;
      },
      error: 'WORD_EVIDENCE_TRANSFER_FORBIDDEN',
    },
    {
      name: 'F3 physical gates laundered as complete',
      mutate(doc) {
        doc.featureVerdicts.F3_PHYSICAL_OWNER_OFF_HOST.verdict = 'READY';
        doc.denominators.f3PhysicalOwnerOffHostGates.completed = 5;
      },
      error: 'F3_PHYSICAL_GATES_MUST_REMAIN_NEEDS_MORE_EVIDENCE',
    },
    {
      name: 'UNKNOWN/ABSTAIN promoted into PASS',
      mutate(doc) {
        doc.denominators.unknownAbstainPassAdmissions = 1;
      },
      error: 'UNKNOWN_ABSTAIN_PASS_ADMISSION_FORBIDDEN',
    },
    {
      name: 'user document touch hidden inside final receipt',
      mutate(doc) {
        doc.denominators.userDocumentsUsed = 1;
      },
      error: 'USER_DOCUMENTS_FORBIDDEN',
    },
    {
      name: 'provider mismatch promoted as Word 16.112',
      mutate(doc) {
        doc.providerBindings.word.version = '16.111.3';
      },
      error: 'WORD_16_112_PROVIDER_BINDING_INVALID',
    },
  ];

  for (const hostileCase of cases) {
    const mutated = clone(baseline);
    hostileCase.mutate(mutated);
    const result = validateLegacyLocalReleaseCandidateReceipt(mutated, { repoRoot: REPO_ROOT });
    assert.equal(result.ok, false, hostileCase.name);
    assert.ok(
      result.errors.some((entry) => entry.code === hostileCase.error),
      `${hostileCase.name} expected ${hostileCase.error}, got ${JSON.stringify(result.errors, null, 2)}`,
    );
  }
});

test('receipt binds live traceability, Google final, and F3 evidence by exact hashes', async () => {
  const { validateLegacyLocalReleaseCandidateReceipt, sha256File } = await loadModule();
  const receipt = readJson(RECEIPT_PATH);
  const result = validateLegacyLocalReleaseCandidateReceipt(receipt, { repoRoot: REPO_ROOT });
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));

  for (const binding of receipt.sourceBindings) {
    const absPath = path.join(REPO_ROOT, binding.path);
    assert.equal(fs.existsSync(absPath), true, `missing binding path: ${binding.path}`);
    assert.equal(binding.sha256, `sha256:${sha256File(absPath)}`);
  }

  assert.ok(receipt.sourceBindings.some((binding) => binding.id === 'FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2_LEDGER'));
  assert.ok(receipt.sourceBindings.some((binding) => binding.id === 'GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1'));
  assert.ok(receipt.sourceBindings.some((binding) => binding.id === 'F3_BLACK_BOX_MANUAL_CORE_CAPSULE_KIT_V1'));
});
