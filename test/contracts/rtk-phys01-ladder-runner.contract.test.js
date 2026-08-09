'use strict';

/*
 * PHYS-01 — build-bound physical ladder runner for word-mac-16.111.3-26080215.
 *
 * RED-FIRST: the module scripts/ops/rtk-word-phys-ladder-16-111-3.mjs does not
 * exist on CURRENT, so every scenario fails at the dynamic import. The runner
 * drives Word physically ONLY under --run-physical after fail-closed gates;
 * every scenario below is hermetic (injected ports, no Word, no T7, no
 * network) and pins the gate law and the receipt law.
 *
 * Gates (order load-bearing): RUNG_UNKNOWN -> SHA_MISMATCH -> DIRTY_WORKTREE ->
 * WORD_VERSION_MISMATCH -> WORD_BUILD_MISMATCH -> ARTIFACT_ROOT_INVALID ->
 * WORD_SESSION_NOT_CLEAN.
 *
 * Receipt law: a rung receipt seals only when every case passes
 * open-edit-save-close-reopen with readback proof; a failed case makes the
 * receipt unsealable (PHYS_CASE_FAILURES_PRESENT), and receipt schema/tamper
 * violations are typed (PHYS_RECEIPT_INVALID).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-phys-ladder-16-111-3.mjs');

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

const SHA = 'a'.repeat(40);

function greenPorts(overrides = {}) {
  return {
    gitHead: () => SHA,
    gitOriginMain: () => SHA,
    gitDirty: () => false,
    probeWordPlist: () => ({ version: '16.111.3', build: '16.111.26080215' }),
    verifyArtifactRoot: () => ({ ok: true }),
    countOpenWordDocuments: () => 0,
    ...overrides,
  };
}

function baseGateInput(portOverrides = {}) {
  return {
    rung: 'CARRIER_SURVIVAL_SMOKE',
    expectedSha: SHA,
    expectedWordVersion: '16.111.3',
    expectedWordBuild: '16.111.26080215',
    artifactRoot: '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/phys-16-111-3',
    ports: greenPorts(portOverrides),
  };
}

function passCase(id) {
  return {
    caseId: id,
    wordStatus: 'PASS',
    openEditSaveCloseReopen: 'PASS',
    readbackContainsSentinel: true,
    readbackContainsInsertion: true,
    wordRevisionCount: 1,
    sourceDocxSha256: `sha256:${'1'.repeat(64)}`,
    returnedDocxSha256: `sha256:${'2'.repeat(64)}`,
  };
}

// P01: all gates green in report mode -> ok, zero physical side effects.
test('PHYS01-P01-gates-green-report-mode', async () => {
  const module = await loadModule();
  const result = module.evaluatePhysGates(baseGateInput());
  assert.equal(result.ok, true, `green gates must pass: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.code, 'RTK_PHYS_GATES_OK');
});

// P02: unknown rung is the first refusal.
test('PHYS01-P02-unknown-rung-blocked', async () => {
  const module = await loadModule();
  const result = module.evaluatePhysGates(baseGateInput({ }));
  const overridden = { ...baseGateInput(), rung: 'WAVE_300' };
  const r = module.evaluatePhysGates(overridden);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'RTK_PHYS_RUNG_UNKNOWN');
  assert.ok(result.ok === true);
});

// P03: sha mismatch (HEAD or origin/main drift) refuses before anything else.
test('PHYS01-P03-sha-mismatch-blocked', async () => {
  const module = await loadModule();
  const headDrift = module.evaluatePhysGates(baseGateInput({ gitHead: () => 'b'.repeat(40) }));
  assert.equal(headDrift.ok, false);
  assert.equal(headDrift.code, 'RTK_PHYS_SHA_MISMATCH');
  const originDrift = module.evaluatePhysGates(baseGateInput({ gitOriginMain: () => 'c'.repeat(40) }));
  assert.equal(originDrift.ok, false);
  assert.equal(originDrift.code, 'RTK_PHYS_SHA_MISMATCH');
});

// P04: dirty worktree refuses.
test('PHYS01-P04-dirty-worktree-blocked', async () => {
  const module = await loadModule();
  const result = module.evaluatePhysGates(baseGateInput({ gitDirty: () => true }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RTK_PHYS_DIRTY_WORKTREE');
});

// P05: Word version/build probe mismatch refuses (the 16.111.2 -> 16.111.3 law).
test('PHYS01-P05-word-build-mismatch-blocked', async () => {
  const module = await loadModule();
  const version = module.evaluatePhysGates(baseGateInput({ probeWordPlist: () => ({ version: '16.111.2', build: '16.111.26080215' }) }));
  assert.equal(version.ok, false);
  assert.equal(version.code, 'RTK_PHYS_WORD_VERSION_MISMATCH');
  const build = module.evaluatePhysGates(baseGateInput({ probeWordPlist: () => ({ version: '16.111.3', build: '16.111.26072617' }) }));
  assert.equal(build.ok, false);
  assert.equal(build.code, 'RTK_PHYS_WORD_BUILD_MISMATCH');
});

// P06: artifact root outside the verified T7 contract refuses.
test('PHYS01-P06-artifact-root-invalid-blocked', async () => {
  const module = await loadModule();
  const result = module.evaluatePhysGates(baseGateInput({ verifyArtifactRoot: () => ({ ok: false, code: 'C5V2_ARTIFACT_ROOT_T7_UUID_MISMATCH' }) }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RTK_PHYS_ARTIFACT_ROOT_INVALID');
});

// P07: an open Word document (extraneous session) refuses physical execution.
test('PHYS01-P07-word-session-not-clean-blocked', async () => {
  const module = await loadModule();
  const result = module.evaluatePhysGates(baseGateInput({ countOpenWordDocuments: () => 2 }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RTK_PHYS_WORD_SESSION_NOT_CLEAN');
});

// P08: receipt seals only when every case passed with readback proof.
test('PHYS01-P08-receipt-seal-law', async () => {
  const module = await loadModule();
  const cases = Array.from({ length: 12 }, (_, i) => passCase(`case-${i + 1}`));
  const sealed = module.evaluateSmokeCases(cases);
  assert.equal(sealed.ok, true, `all-pass cases must seal: ${JSON.stringify(sealed.reasons)}`);
  assert.equal(sealed.sealed, true);

  const withFail = cases.map((c, i) => (i === 7 ? { ...c, openEditSaveCloseReopen: 'FAIL', wordStatus: 'FAIL' } : c));
  const broken = module.evaluateSmokeCases(withFail);
  assert.equal(broken.ok, false);
  assert.equal(broken.code, 'RTK_PHYS_CASE_FAILURES_PRESENT');
  assert.equal(broken.sealed, false);

  const noReadback = cases.map((c, i) => (i === 3 ? { ...c, readbackContainsInsertion: false } : c));
  const drift = module.evaluateSmokeCases(noReadback);
  assert.equal(drift.ok, false, 'a case without insertion readback must not seal');
  assert.equal(drift.code, 'RTK_PHYS_CASE_FAILURES_PRESENT');
});

// P09: receipt schema + integrity validation.
test('PHYS01-P09-receipt-validation', async () => {
  const module = await loadModule();
  const cases = Array.from({ length: 12 }, (_, i) => passCase(`case-${i + 1}`));
  const receipt = module.buildSmokeReceipt({
    rung: 'CARRIER_SURVIVAL_SMOKE',
    headSha: SHA,
    originMainSha: SHA,
    wordProfile: { versionByBundle: '16.111.3', buildByBundle: '16.111.26080215', macosVersion: '26.5.2', macosBuild: '25F84', locale: 'ru_FI' },
    cases,
    artifactRoot: '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/phys-16-111-3',
  });
  const valid = module.validateSmokeReceipt(receipt);
  assert.equal(valid.ok, true, `honest receipt must validate: ${JSON.stringify(valid.reasons)}`);
  assert.equal(receipt.profileId, 'word-mac-16.111.3-26080215');
  assert.equal(receipt.rung, 'CARRIER_SURVIVAL_SMOKE');
  assert.equal(receipt.counters.passed, 12);
  assert.equal(receipt.counters.total, 12);

  const tampered = JSON.parse(JSON.stringify(receipt));
  tampered.counters.passed = 11;
  const invalid = module.validateSmokeReceipt(tampered);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, 'RTK_PHYS_RECEIPT_INVALID');

  const wrongProfile = JSON.parse(JSON.stringify(receipt));
  wrongProfile.profileId = 'word-mac-16.111.2-d1';
  const invalidProfile = module.validateSmokeReceipt(wrongProfile);
  assert.equal(invalidProfile.ok, false, 'a receipt naming the superseded profile must be invalid');
  assert.equal(invalidProfile.code, 'RTK_PHYS_RECEIPT_INVALID');
});

// P10: the runner refuses to write a receipt for a rung whose cases did not
// all pass (no silent seal path exists).
test('PHYS01-P10-no-seal-on-failure', async () => {
  const module = await loadModule();
  const cases = Array.from({ length: 12 }, (_, i) => passCase(`case-${i + 1}`));
  cases[5] = { ...cases[5], wordStatus: 'FAIL', openEditSaveCloseReopen: 'FAIL' };
  assert.throws(() => module.buildSmokeReceipt({
    rung: 'CARRIER_SURVIVAL_SMOKE',
    headSha: SHA,
    originMainSha: SHA,
    wordProfile: { versionByBundle: '16.111.3', buildByBundle: '16.111.26080215' },
    cases,
    artifactRoot: '/Volumes/T7-Secure/x',
  }), /RTK_PHYS_CASE_FAILURES_PRESENT/u, 'buildSmokeReceipt must refuse to seal a failed run');
});
