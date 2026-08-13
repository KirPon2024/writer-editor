'use strict';

/*
 * PHYS-01 — build-bound physical ladder runner for word-mac-16.112-26081010.
 *
 * RED-FIRST: the module scripts/ops/rtk-word-phys-ladder-16-111-3.mjs does not
 * exist on CURRENT, so every scenario fails at the dynamic import. The runner
 * drives Word physically ONLY under --run-physical after fail-closed gates;
 * every scenario below is hermetic (injected ports, no Word, no T7, no
 * network) and pins the gate law and the receipt law.
 *
 * Gates (order load-bearing): RUNG_UNKNOWN -> SHA_MISMATCH -> DIRTY_WORKTREE ->
 * WORD_VERSION_MISMATCH -> WORD_BUILD_MISMATCH -> BUNDLE_ID_MISMATCH ->
 * TEAM_IDENTIFIER_MISMATCH -> SIGNATURE_AUTHORITY_MISMATCH ->
 * ARTIFACT_ROOT_INVALID -> WORD_SESSION_NOT_CLEAN.
 *
 * Receipt law: a rung receipt seals only when every case passes
 * open-edit-save-close-reopen with readback proof; a failed case makes the
 * receipt unsealable (PHYS_CASE_FAILURES_PRESENT), and receipt schema/tamper
 * violations are typed (PHYS_RECEIPT_INVALID).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-phys-ladder-16-111-3.mjs');
const SEMANTIC_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_112_SEMANTIC_DIFFERENTIAL_RECEIPT.json';
const SEMANTIC_RECEIPT_PATH = path.join(REPO_ROOT, SEMANTIC_RECEIPT_REF);
const NEGATIVE_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_112_NEGATIVE_REPLAY_CRASH_RECEIPT.json';
const NEGATIVE_RECEIPT_PATH = path.join(REPO_ROOT, NEGATIVE_RECEIPT_REF);
const WAVE10_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE10_RECEIPT.json';
const WAVE10_RECEIPT_PATH = path.join(REPO_ROOT, WAVE10_RECEIPT_REF);
const WAVE40_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE40_RECEIPT.json';
const WAVE40_RECEIPT_PATH = path.join(REPO_ROOT, WAVE40_RECEIPT_REF);
const WAVE100_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE100_RECEIPT.json';
const WAVE100_RECEIPT_PATH = path.join(REPO_ROOT, WAVE100_RECEIPT_REF);
const WAVE300_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE300_RECEIPT.json';
const WAVE300_RECEIPT_PATH = path.join(REPO_ROOT, WAVE300_RECEIPT_REF);
const WAVE300_REPEAT_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_112_PHYSICAL_WAVE300_REPEAT_RECEIPT.json';
const WAVE300_REPEAT_RECEIPT_PATH = path.join(REPO_ROOT, WAVE300_REPEAT_RECEIPT_REF);
const SATURATION_LIMITATION_AUDIT_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_112_SATURATION_LIMITATION_AUDIT_RECEIPT.json';
const SATURATION_LIMITATION_AUDIT_RECEIPT_PATH = path.join(REPO_ROOT, SATURATION_LIMITATION_AUDIT_RECEIPT_REF);

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function sha256File(absPath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex')}`;
}

const SHA = 'a'.repeat(40);
const CANDIDATE_SHA = 'b'.repeat(40);

function greenPorts(overrides = {}) {
  return {
    gitHead: () => SHA,
    gitOriginMain: () => SHA,
    gitDirty: () => false,
    probeWordPlist: () => ({
      version: '16.112',
      build: '16.112.26081010',
      bundleId: 'com.microsoft.Word',
      teamIdentifier: 'UBF8T346G9',
      signatureValid: true,
      signatureAuthorities: [
        'Developer ID Application: Microsoft Corporation (UBF8T346G9)',
        'Developer ID Certification Authority',
        'Apple Root CA',
      ],
    }),
    verifyArtifactRoot: () => ({ ok: true }),
    countOpenWordDocuments: () => 0,
    ...overrides,
  };
}

function baseGateInput(portOverrides = {}) {
  return {
    rung: 'CARRIER_SURVIVAL_SMOKE',
    expectedSha: SHA,
    expectedWordVersion: '16.112',
    expectedWordBuild: '16.112.26081010',
    artifactRoot: '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/phys-16-112',
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

// P02: unknown rung is the first refusal. (PHYS-01B amendment: WAVE_300 is now
// a known rung; the unknown-rung probe uses a genuinely unknown id.)
test('PHYS01-P02-unknown-rung-blocked', async () => {
  const module = await loadModule();
  const result = module.evaluatePhysGates(baseGateInput({ }));
  const overridden = { ...baseGateInput(), rung: 'WAVE_9999_DOES_NOT_EXIST' };
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

// P05: Word version/build probe mismatch refuses (the 16.111.3 -> 16.112 law).
test('PHYS01-P05-word-build-mismatch-blocked', async () => {
  const module = await loadModule();
  const version = module.evaluatePhysGates(baseGateInput({ probeWordPlist: () => ({ version: '16.111.3', build: '16.112.26081010' }) }));
  assert.equal(version.ok, false);
  assert.equal(version.code, 'RTK_PHYS_WORD_VERSION_MISMATCH');
  const build = module.evaluatePhysGates(baseGateInput({ probeWordPlist: () => ({ version: '16.112', build: '16.111.26080215' }) }));
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
    wordProfile: { versionByBundle: '16.112', buildByBundle: '16.112.26081010', macosVersion: '26.5.2', macosBuild: '25F84', locale: 'ru_FI' },
    cases,
    artifactRoot: '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/phys-16-112',
  });
  const valid = module.validateSmokeReceipt(receipt);
  assert.equal(valid.ok, true, `honest receipt must validate: ${JSON.stringify(valid.reasons)}`);
  assert.equal(receipt.profileId, 'word-mac-16.112-26081010');
  assert.equal(receipt.rung, 'CARRIER_SURVIVAL_SMOKE');
  assert.equal(receipt.counters.passed, 12);
  assert.equal(receipt.counters.total, 12);

  const tampered = JSON.parse(JSON.stringify(receipt));
  tampered.counters.passed = 11;
  const invalid = module.validateSmokeReceipt(tampered);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, 'RTK_PHYS_RECEIPT_INVALID');

  const wrongProfile = JSON.parse(JSON.stringify(receipt));
  wrongProfile.profileId = 'word-mac-16.111.3-26080215';
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
    wordProfile: { versionByBundle: '16.112', buildByBundle: '16.112.26081010' },
    cases,
    artifactRoot: '/Volumes/T7-Secure/x',
  }), /RTK_PHYS_CASE_FAILURES_PRESENT/u, 'buildSmokeReceipt must refuse to seal a failed run');
});

// ===========================================================================
// PHYS-01B — full ladder rungs. The runner knows all nine rungs; each rung has
// a pinned kind, case count, receipt schema and a distinct build-bound receipt
// path; the saturation audit is fail-closed and can never produce SATURATED.
// ===========================================================================

function passWaveCase(rung, i) {
  return {
    caseId: `${rung.toLowerCase()}-case-${i + 1}`,
    ordinal: i + 1,
    wordStatus: 'PASS',
    openEditSaveCloseReopen: 'PASS',
    readbackContainsSentinel: true,
    readbackContainsInsertion: true,
    wordRevisionCount: 1,
    sourceDocxSha256: `sha256:${'3'.repeat(64)}`,
    returnedDocxSha256: `sha256:${(4 + i).toString(16).repeat(64).slice(0, 64)}`,
  };
}

function passSemanticCase(i) {
  return {
    ...passWaveCase('SEMANTIC_DIFFERENTIAL_SUBSET', i),
    expectedFinalTextPresent: true,
    removedTextAbsent: true,
  };
}

// DIVERSITY-01B: a full audit-ready receipt set — sealed cases, 40-hex
// headSha, diversity-proven scope and embedded manifests with recomputed
// digests binding the repeat to the first wave.
function auditReadySet(module) {
  const diverseSpecs = module.buildDiverseWaveCaseSpecs('WAVE_300');
  const manifest = module.buildCaseManifest(diverseSpecs);
  const receipts = {};
  for (const [rung, count] of [['WAVE_10', 10], ['WAVE_40', 40], ['WAVE_100', 100], ['WAVE_300', 300], ['WAVE_300_REPEAT', 300]]) {
    receipts[rung] = sealedWaveReceipt(rung, count);
    receipts[rung].headSha = 'a'.repeat(40);
  }
  // DIVERSITY-01D: small waves embed their own manifests with distinct
  // in-vocab cases (prefix slices of the diverse 300 manifest), bound to the
  // receipt cases per ordinal.
  for (const [rung, count] of [['WAVE_10', 10], ['WAVE_40', 40], ['WAVE_100', 100]]) {
    const smallSpecs = diverseSpecs.slice(0, count);
    const smallManifest = module.buildCaseManifest(smallSpecs);
    receipts[rung].caseManifest = smallManifest;
    receipts[rung].manifestDigest = smallManifest.manifestDigest;
    receipts[rung].cases = smallManifest.cases.map((c, i) => ({
      ...passWaveCase(rung, i),
      ordinal: c.ordinal,
      family: c.family,
      operationShape: c.operationShape,
      contentClass: c.contentClass,
    }));
  }
  receipts.WAVE_300.caseManifest = manifest;
  receipts.WAVE_300_REPEAT.caseManifest = JSON.parse(JSON.stringify(manifest));
  receipts.WAVE_300.manifestDigest = manifest.manifestDigest;
  receipts.WAVE_300_REPEAT.manifestDigest = manifest.manifestDigest;
  // DIVERSITY-01C: cases bind to the embedded manifest per ordinal by default.
  for (const rung of ['WAVE_300', 'WAVE_300_REPEAT']) {
    receipts[rung].cases = manifest.cases.map((c, i) => ({
      ...passWaveCase(rung, i),
      ordinal: c.ordinal,
      family: c.family,
      operationShape: c.operationShape,
      contentClass: c.contentClass,
    }));
  }
  return receipts;
}

function sealedWaveReceipt(rung, count, overrides = {}) {
  return {
    schema: `yalken.rtk.word-mac-16-112.${rung.toLowerCase().replace(/_/g, '-')}-receipt.v1`,
    profileId: 'word-mac-16.112-26081010',
    rung,
    status: 'PHYSICAL_WAVE_PASS',
    headSha: 'a'.repeat(40),
    // PHYS-10: the audit hard-gates diversity — fixtures for the audit laws
    // carry the diversity-proven scope by default so P16-P20 isolate their own
    // dimension (wave-missing / profile / veto / false-saturation).
    claimScope: 'DIVERSE_FAMILY_WAVE_PROVEN',
    // DIVERSITY-01 (owner item 7): the audit binds the repeat to the first
    // wave's manifest digest; fixtures share one digest by default.
    manifestDigest: 'a'.repeat(64),
    counters: { total: count, passed: count, failed: 0 },
    cases: Array.from({ length: count }, (_, i) => passWaveCase(rung, i)),
    ...overrides,
  };
}

// P11: all nine rungs are known to the gate evaluator.
test('PHYS01-P11-all-nine-rungs-known', async () => {
  const module = await loadModule();
  const expected = ['CARRIER_SURVIVAL_SMOKE', 'SEMANTIC_DIFFERENTIAL_SUBSET', 'NEGATIVE_REPLAY_CRASH_SUBSET', 'WAVE_10', 'WAVE_40', 'WAVE_100', 'WAVE_300', 'WAVE_300_REPEAT', 'SATURATION_LIMITATION_AUDIT'];
  assert.deepEqual([...module.PHYS_LADDER_RUNGS], expected, 'the nine ladder rungs in order');
  for (const rung of expected) {
    const r = module.evaluatePhysGates({ ...baseGateInput(), rung });
    assert.equal(r.ok, true, `rung ${rung} must be known: ${JSON.stringify(r.reasons)}`);
  }
});

// P12: rung definitions pin kind, case count and distinct receipt paths.
test('PHYS01-P12-rung-definitions-pinned', async () => {
  const module = await loadModule();
  const defs = module.RUNG_DEFINITIONS;
  const expectedCounts = {
    CARRIER_SURVIVAL_SMOKE: 12,
    SEMANTIC_DIFFERENTIAL_SUBSET: 24,
    NEGATIVE_REPLAY_CRASH_SUBSET: 8,
    WAVE_10: 10,
    WAVE_40: 40,
    WAVE_100: 100,
    WAVE_300: 300,
    WAVE_300_REPEAT: 300,
  };
  for (const [rung, count] of Object.entries(expectedCounts)) {
    assert.equal(defs[rung].caseCount, count, `${rung} case count`);
    assert.ok(defs[rung].receiptRef.includes('16_112'), `${rung} receipt path must be build-bound`);
  }
  const refs = Object.values(defs).filter((d) => d.receiptRef).map((d) => d.receiptRef);
  assert.equal(new Set(refs).size, refs.length, 'receipt paths must be distinct (no cross-rung overwrite)');
  for (const ref of refs) {
  assert.ok(!ref.includes('WAVE40_RECEIPT') || ref.includes('16_112'), 'never the 16.111.2-bound receipt path');
    assert.ok(!/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE(40|100|300)/u.test(ref), `receipt path must not collide with 16.111.2 evidence: ${ref}`);
  }
});

// P13: semantic differential cases require the exact differential proof.
test('PHYS01-P13-semantic-differential-law', async () => {
  const module = await loadModule();
  const cases = Array.from({ length: 24 }, (_, i) => passSemanticCase(i));
  const ok = module.evaluateRungCases('SEMANTIC_DIFFERENTIAL_SUBSET', cases);
  assert.equal(ok.ok, true, `all-proven semantic cases must seal: ${JSON.stringify(ok.reasons)}`);

  const drift = cases.map((c, i) => (i === 5 ? { ...c, removedTextAbsent: false } : c));
  const bad = module.evaluateRungCases('SEMANTIC_DIFFERENTIAL_SUBSET', drift);
  assert.equal(bad.ok, false, 'a case where removed text survives must fail');
  assert.equal(bad.code, 'RTK_PHYS_CASE_FAILURES_PRESENT');

  const wrongCount = module.evaluateRungCases('SEMANTIC_DIFFERENTIAL_SUBSET', cases.slice(0, 23));
  assert.equal(wrongCount.ok, false, 'a short denominator must fail');
  assert.equal(wrongCount.code, 'RTK_PHYS_CASE_COUNT_MISMATCH');
});

// P13B: the current Word 16.112 profile earns the semantic differential rung
// only through a real, build-bound receipt sealed by the physical runner. This
// is intentionally red before F2_WORD_16_112_SEMANTIC_DIFFERENTIAL_V1 executes
// the disposable synthetic physical cases.
test('PHYS01-P13B-real-16-112-semantic-differential-receipt-sealed', async () => {
  const module = await loadModule();
  assert.equal(fs.existsSync(SEMANTIC_RECEIPT_PATH), true, `${SEMANTIC_RECEIPT_REF} must exist after the semantic differential rung is physically sealed`);

  const receipt = JSON.parse(fs.readFileSync(SEMANTIC_RECEIPT_PATH, 'utf8'));
  const plan = module.buildRungPlan('SEMANTIC_DIFFERENTIAL_SUBSET');
  const validation = module.validateRungReceipt(plan, receipt);
  assert.equal(validation.ok, true, `semantic receipt must validate: ${JSON.stringify(validation.reasons)}`);

  assert.equal(receipt.schema, 'yalken.rtk.word-mac-16-112.semantic-differential-receipt.v1');
  assert.equal(receipt.profileId, 'word-mac-16.112-26081010');
  assert.equal(receipt.rung, 'SEMANTIC_DIFFERENTIAL_SUBSET');
  assert.equal(receipt.status, 'PHYSICAL_SEMANTIC_DIFFERENTIAL_PASS');
  assert.match(receipt.headSha, /^[a-f0-9]{40}$/u, 'receipt binds an exact prephysical clean head');
  assert.match(receipt.originMainSha, /^[a-f0-9]{40}$/u, 'receipt binds an exact origin/main baseline');
  assert.equal(receipt.wordProfile.versionByBundle, '16.112');
  assert.equal(receipt.wordProfile.buildByBundle, '16.112.26081010');
  assert.equal(receipt.wordProfile.bundleId, 'com.microsoft.Word');
  assert.equal(receipt.wordProfile.teamIdentifier, 'UBF8T346G9');
  assert.equal(receipt.wordProfile.signatureValid, true);
  assert.equal(receipt.counters.total, 24);
  assert.equal(receipt.counters.passed, 24);
  assert.equal(receipt.counters.failed, 0);
  assert.equal(new Set(receipt.cases.map((c) => c.caseId)).size, 24, 'case ids must be unique');
  assert.equal(receipt.cases.every((c) => c.openEditSaveCloseReopen === 'PASS' && c.expectedFinalTextPresent === true && c.removedTextAbsent === true), true,
    'every semantic case must prove final text present and removed text absent');
  assert.match(sha256File(SEMANTIC_RECEIPT_PATH), /^sha256:[a-f0-9]{64}$/u);
});

// P14: negative probes must detect every expected anomaly.
test('PHYS01-P14-negative-probe-detection-law', async () => {
  const module = await loadModule();
  const probes = [
    { probeId: 'duplicate-digest-replay', expectedDetection: true, detected: true },
    { probeId: 'tampered-package', expectedDetection: true, detected: true },
    { probeId: 'stale-head-binding', expectedDetection: true, detected: true },
    { probeId: 'crash-partial-no-seal', expectedDetection: true, detected: true },
  ];
  const ok = module.evaluateNegativeProbes(probes);
  assert.equal(ok.ok, true);
  const missed = probes.map((p, i) => (i === 2 ? { ...p, detected: false } : p));
  const bad = module.evaluateNegativeProbes(missed);
  assert.equal(bad.ok, false, 'an undetected stale-head probe must fail');
  assert.equal(bad.code, 'RTK_PHYS_NEGATIVE_PROBE_UNDETECTED');
});

// P14B: the current Word 16.112 profile earns the negative replay/crash rung
// only through a real, build-bound receipt sealed by the physical runner. This
// is intentionally red before F2_WORD_16_112_NEGATIVE_REPLAY_CRASH_V1 executes
// the disposable synthetic physical cases.
test('PHYS01-P14B-real-16-112-negative-replay-crash-receipt-sealed', async () => {
  const module = await loadModule();
  assert.equal(fs.existsSync(NEGATIVE_RECEIPT_PATH), true,
    `${NEGATIVE_RECEIPT_REF} must exist after the negative replay/crash rung is physically sealed`);

  const receipt = JSON.parse(fs.readFileSync(NEGATIVE_RECEIPT_PATH, 'utf8'));
  const plan = module.buildRungPlan('NEGATIVE_REPLAY_CRASH_SUBSET');
  const validation = module.validateRungReceipt(plan, receipt);
  assert.equal(validation.ok, true, `negative receipt must validate: ${JSON.stringify(validation.reasons)}`);

  assert.equal(receipt.schema, 'yalken.rtk.word-mac-16-112.negative-replay-crash-receipt.v1');
  assert.equal(receipt.profileId, 'word-mac-16.112-26081010');
  assert.equal(receipt.rung, 'NEGATIVE_REPLAY_CRASH_SUBSET');
  assert.equal(receipt.status, 'PHYSICAL_NEGATIVE_PROBES_PASS');
  assert.match(receipt.headSha, /^[a-f0-9]{40}$/u, 'receipt binds an exact prephysical clean head');
  assert.match(receipt.originMainSha, /^[a-f0-9]{40}$/u, 'receipt binds an exact origin/main baseline');
  assert.equal(receipt.wordProfile.versionByBundle, '16.112');
  assert.equal(receipt.wordProfile.buildByBundle, '16.112.26081010');
  assert.equal(receipt.wordProfile.bundleId, 'com.microsoft.Word');
  assert.equal(receipt.wordProfile.teamIdentifier, 'UBF8T346G9');
  assert.equal(receipt.wordProfile.signatureValid, true);
  assert.equal(receipt.counters.total, 8);
  assert.equal(receipt.counters.passed, 8);
  assert.equal(receipt.counters.failed, 0);
  assert.equal(new Set(receipt.cases.map((c) => c.caseId)).size, 8, 'case ids must be unique');
  assert.equal(new Set(receipt.cases.map((c) => c.probeId)).size, 8, 'probe ids must be unique');
  assert.equal(receipt.cases.every((c) =>
    c.openEditSaveCloseReopen === 'PASS'
    && c.detected === true
    && c.readbackContainsSentinel === true
    && c.readbackContainsInsertion === true
    && Array.isArray(c.carrierDigests)
    && c.carrierDigests.length === 2
    && c.carrierDigests.every((digest) => /^sha256:[a-f0-9]{64}$/u.test(digest))), true,
  'every negative case must prove physical carrier survival plus fired detection');
  assert.match(sha256File(NEGATIVE_RECEIPT_PATH), /^sha256:[a-f0-9]{64}$/u);
});

// P15: wave seal law with exact denominators.
test('PHYS01-P15-wave-denominator-law', async () => {
  const module = await loadModule();
  for (const [rung, count] of [['WAVE_10', 10], ['WAVE_40', 40], ['WAVE_100', 100], ['WAVE_300', 300], ['WAVE_300_REPEAT', 300]]) {
    const cases = Array.from({ length: count }, (_, i) => passWaveCase(rung, i));
    const ok = module.evaluateRungCases(rung, cases);
    assert.equal(ok.ok, true, `${rung} with ${count} passing cases must seal`);
    const short = module.evaluateRungCases(rung, cases.slice(0, count - 1));
    assert.equal(short.ok, false, `${rung} with ${count - 1} cases must not seal`);
    assert.equal(short.code, 'RTK_PHYS_CASE_COUNT_MISMATCH');
  }
});

// P16: saturation audit happy path -> COMPLETE_NOT_SATURATED (never SATURATED).
test('PHYS01-P16-audit-complete-not-saturated', async () => {
  const module = await loadModule();
  const receiptsByRung = auditReadySet(module);
  const result = module.evaluateSaturationAudit({ receiptsByRung });
  assert.equal(result.ok, true, `full sealed ladder must audit: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.status, 'COMPLETE_NOT_SATURATED');
  assert.ok(result.status !== 'SATURATED', 'the audit can never produce SATURATED');
});

// P17: a missing wave fails the audit.
test('PHYS01-P17-audit-wave-missing', async () => {
  const module = await loadModule();
  const receiptsByRung = {
    WAVE_10: sealedWaveReceipt('WAVE_10', 10),
    WAVE_40: sealedWaveReceipt('WAVE_40', 40),
    WAVE_100: sealedWaveReceipt('WAVE_100', 100),
    WAVE_300: sealedWaveReceipt('WAVE_300', 300),
  };
  const result = module.evaluateSaturationAudit({ receiptsByRung });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RTK_PHYS_AUDIT_WAVE_MISSING');
});

// P18: a cross-profile receipt fails the audit.
test('PHYS01-P18-audit-profile-mismatch', async () => {
  const module = await loadModule();
  const receiptsByRung = {
    WAVE_10: sealedWaveReceipt('WAVE_10', 10),
    WAVE_40: sealedWaveReceipt('WAVE_40', 40),
    WAVE_100: sealedWaveReceipt('WAVE_100', 100),
    WAVE_300: sealedWaveReceipt('WAVE_300', 300, { profileId: 'word-mac-16.111.2-d1' }),
    WAVE_300_REPEAT: sealedWaveReceipt('WAVE_300_REPEAT', 300),
  };
  const result = module.evaluateSaturationAudit({ receiptsByRung });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RTK_PHYS_AUDIT_PROFILE_MISMATCH');
});

// P19: a nonzero failure counter (veto) fails the audit.
test('PHYS01-P19-audit-veto-nonzero', async () => {
  const module = await loadModule();
  const receiptsByRung = auditReadySet(module);
  receiptsByRung.WAVE_100.counters.failed = 1;
  const result = module.evaluateSaturationAudit({ receiptsByRung });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RTK_PHYS_AUDIT_VETO_NONZERO');
});

// P20: a receipt claiming SATURATED fails the audit as a false saturation claim.
test('PHYS01-P20-audit-false-saturation', async () => {
  const module = await loadModule();
  const receiptsByRung = auditReadySet(module);
  receiptsByRung.WAVE_300.status = 'SATURATED';
  const result = module.evaluateSaturationAudit({ receiptsByRung });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RTK_PHYS_AUDIT_FALSE_SATURATION');
});

// ===========================================================================
// PHYS-01C — physical execution found a defect the hermetic tests could not:
// the first smoke run on Word 16.111.3 failed all 12 cases with AppleScript
// error -10006 because the generated script contained an invalid
// `set end of content of text object ...` statement. The fix uses the proven
// create-range append idiom. This scenario pins the generated-script contract
// so the invalid statement can never return.
// ===========================================================================

test('PHYS01-P21-generated-word-script-contract', async () => {
  const module = await loadModule();
  assert.equal(typeof module.buildSmokeWordScriptForTest, 'function', 'the script builder must be exposed for the contract');
  const script = module.buildSmokeWordScriptForTest('case.docx', '/tmp/case.docx', 'SENTINEL_X', ' INSERT_Y');
  assert.ok(!script.includes('set end of content of text object'), 'invalid set-end-of statement must never be generated');
  assert.ok(script.includes('create range yDoc start (yTextLen - 1) end yTextLen'), 'append must use the proven create-range idiom');
  assert.ok(script.includes('set yTextLen to count of yInitialText'), 'append must measure the already-read text variable, never the live text object (Word 16.111.3 returns 0/missing value for the live object)');
  assert.ok(script.includes('SENTINEL_X') && script.includes('INSERT_Y'), 'sentinel and insertion literals must be embedded');
});

// ===========================================================================
// PHYS-03 — per-kind executors. Until this contour every rung fell through to
// the smoke cycle. These scenarios pin the routing table, the semantic
// replacement plan, the negative probe inventory, wave case uniqueness and the
// audit plan — all hermetic.
// ===========================================================================

// P22: routing — every rung maps to its kind executor with the pinned
// denominator; a wave never routes to the smoke executor.
test('PHYS01-P22-rung-routing-table', async () => {
  const module = await loadModule();
  const expected = {
    CARRIER_SURVIVAL_SMOKE: 'append-cycle',
    SEMANTIC_DIFFERENTIAL_SUBSET: 'replacement-cycle',
    NEGATIVE_REPLAY_CRASH_SUBSET: 'probe-suite',
    WAVE_10: 'wave-cycle',
    WAVE_40: 'wave-cycle',
    WAVE_100: 'wave-cycle',
    WAVE_300: 'wave-cycle',
    WAVE_300_REPEAT: 'wave-cycle',
    SATURATION_LIMITATION_AUDIT: 'audit',
  };
  for (const [rung, executor] of Object.entries(expected)) {
    const plan = module.buildRungPlan(rung);
    assert.equal(plan.executor, executor, `${rung} executor`);
    assert.equal(plan.caseCount, module.RUNG_DEFINITIONS[rung].caseCount, `${rung} denominator`);
    assert.equal(plan.receiptRef, module.RUNG_DEFINITIONS[rung].receiptRef, `${rung} receipt path`);
  }
  assert.throws(() => module.buildRungPlan('WAVE_9999'), /RTK_PHYS_RUNG_UNKNOWN/u);
});

// P23: semantic case specs carry JS-computed replacement offsets into the
// deterministic fixture text, with a distinct replacement per case.
test('PHYS01-P23-semantic-replacement-plan', async () => {
  const module = await loadModule();
  const specs = module.buildSemanticCaseSpecs();
  assert.equal(specs.length, 24, '24 semantic cases');
  const replacements = new Set();
  for (const spec of specs) {
    assert.ok(Number.isSafeInteger(spec.replaceStart) && spec.replaceStart > 0, `${spec.id} replaceStart`);
    assert.ok(Number.isSafeInteger(spec.replaceEnd) && spec.replaceEnd > spec.replaceStart, `${spec.id} replaceEnd > replaceStart`);
    assert.ok(spec.removedText.length > 0, `${spec.id} removedText recorded`);
    // Unmasking amendment: the range must cover EXACTLY the removed text in the
    // deterministic fixture text (1-based inclusive Word range over the 0-based
    // fixture string slice).
    const fixtureText = module.buildSemanticFixtureTextForTest({ id: spec.id, title: spec.title });
    assert.equal(fixtureText.slice(spec.replaceStart - 1, spec.replaceEnd), spec.removedText,
      `${spec.id} range must cover exactly the removed text`);
    assert.ok(spec.replacementText.includes(spec.id), `${spec.id} replacement carries the case id`);
    replacements.add(spec.replacementText);
  }
  assert.equal(replacements.size, 24, 'each semantic replacement is unique');
});

// P24: the negative probe inventory is exactly the eight named probes.
test('PHYS01-P24-negative-probe-inventory', async () => {
  const module = await loadModule();
  assert.deepEqual([...module.NEGATIVE_PROBE_IDS], [
    'duplicate-digest-replay',
    'tampered-package-crc',
    'stale-head-binding',
    'crash-partial-no-seal',
    'cross-profile-receipt',
    'counter-tamper',
    'unknown-rung-receipt',
    'cross-build-evidence-join',
  ], 'exactly the eight named negative probes');
});

// P25: wave case specs carry unique insertions per case and per rung.
test('PHYS01-P25-wave-case-uniqueness', async () => {
  const module = await loadModule();
  for (const [rung, count] of [['WAVE_10', 10], ['WAVE_40', 40]]) {
    const specs = module.buildWaveCaseSpecs(rung);
    assert.equal(specs.length, count, `${rung} spec count`);
    const insertions = new Set(specs.map((s) => s.insertion));
    assert.equal(insertions.size, count, `${rung} insertions unique`);
  }
  const w10 = module.buildWaveCaseSpecs('WAVE_10');
  const w40 = module.buildWaveCaseSpecs('WAVE_40');
  const overlap = w10.filter((a) => w40.some((b) => b.insertion === a.insertion));
  assert.equal(overlap.length, 0, 'insertions never repeat across rungs');
});

test('PHYS01-P25B-wave10-is-orthogonal-family-seed-not-prefix-of-one-family', async () => {
  const module = await loadModule();
  const specs = module.buildWaveCaseSpecs('WAVE_10');
  assert.equal(specs.length, 10, 'WAVE_10 keeps the bounded 10-case denominator');
  assert.deepEqual(new Set(specs.map((s) => s.family)), new Set(module.WORD_PHYSICAL_DIVERSITY_FAMILIES),
    'WAVE_10 must exercise each executable Word-edit family exactly once');
  assert.equal(new Set(specs.map((s) => JSON.stringify({
    family: s.family,
    operationShape: s.operationShape,
    contentClass: s.contentClass,
  }))).size, 10, 'WAVE_10 must contain ten distinct normalized executable cases');
  assert.ok(new Set(specs.map((s) => s.contentClass)).size >= module.CONTENT_CLASSES.length,
    'WAVE_10 must span the closed content-class vocabulary');
  const executableManifest = module.buildExecutableDiversityManifestForTest(
    specs.map((spec) => module.buildExecutableDiversityCaseSpecForTest(spec)),
  );
  const verdict = module.evaluateExecutableDiversityManifestForTest(executableManifest);
  assert.equal(verdict.ok, true, `WAVE_10 executable seed must validate: ${JSON.stringify(verdict.reasons)}`);
});

// P26: the audit plan binds exactly the five wave receipt refs of this profile.
test('PHYS01-P26-audit-plan-binding', async () => {
  const module = await loadModule();
  const plan = module.buildAuditPlan();
  assert.deepEqual(plan.requiredRungs, ['WAVE_10', 'WAVE_40', 'WAVE_100', 'WAVE_300', 'WAVE_300_REPEAT']);
  for (const ref of plan.receiptRefs) {
    assert.ok(ref.includes('16_112'), `audit receipt ref must be build-bound: ${ref}`);
  }
  assert.equal(new Set(plan.receiptRefs).size, 5, 'five distinct wave receipts');
});

// P27: the semantic word script embeds literal offsets and the differential
// readback flags (never the live text object count).
test('PHYS01-P27-semantic-script-contract', async () => {
  const module = await loadModule();
  const spec = module.buildSemanticCaseSpecs()[0];
  const script = module.buildSemanticWordScriptForTest('case.docx', '/tmp/case.docx', spec);
  assert.ok(!script.includes('set end of content of text object'), 'invalid statement banned');
  assert.ok(!script.includes('count of content of text object of yDoc'), 'live text object count banned');
  assert.ok(script.includes(`create range yDoc start ${spec.replaceStart} end ${spec.replaceEnd}`), 'literal offsets embedded');
  assert.ok(script.includes(spec.replacementText), 'replacement literal embedded');
  assert.ok(script.includes('set yExpectedOk2 to yReadback contains') && script.includes('set yRemovedOk2 to not (yReadback contains'), 'post-reopen differential readback lines must be generated');
});

// P28 (PHYS-03 honesty amendment): the negative probe suite must use REAL
// detections — the stale-head probe exercises the validator's expected-head
// path, and the validator must reject a receipt bound to another head.
test('PHYS01-P28-validator-expected-head-binding', async () => {
  const module = await loadModule();
  const plan = module.buildRungPlan('WAVE_10');
  const cases = Array.from({ length: 10 }, (_, i) => passWaveCase('WAVE_10', i));
  const receipt = module.buildRungReceipt(plan, {
    rung: 'WAVE_10',
    headSha: 'b'.repeat(40),
    originMainSha: 'b'.repeat(40),
    wordProfile: {},
    cases,
    artifactRoot: '/x',
  });
  const okSame = module.validateRungReceipt(plan, receipt, { expectedHeadSha: 'b'.repeat(40) });
  assert.equal(okSame.ok, true, `matching head validates: ${JSON.stringify(okSame.reasons)}`);
  const stale = module.validateRungReceipt(plan, receipt, { expectedHeadSha: 'c'.repeat(40) });
  assert.equal(stale.ok, false, 'a receipt bound to another head must be rejected when an expected head is enforced');
  assert.equal(stale.code, 'RTK_PHYS_RECEIPT_INVALID');
});

// P29 (PHYS-04B): the negative probe suite is a pure evaluator over its inputs;
// every detection must be real — a replayed digest, an intact EOCD signature,
// an accepted stale head or an accepted cross-build join must each fail the
// suite.
test('PHYS01-P29-negative-probe-suite-pure-evaluator', async () => {
  const module = await loadModule();
  const good = module.evaluateNegativeProbeSuite({
    carrierDigests: [`sha256:${'a'.repeat(64)}`, `sha256:${'b'.repeat(64)}`],
    headSha: 'f'.repeat(40),
    tamperEvidence: { eocdAtBefore: 100, eocdAtAfter: -1 },
    crossBuildJoinRejected: true,
  });
  assert.equal(good.ok, true, `honest probe inputs must pass: ${JSON.stringify(good.probes && good.probes.filter((p) => !p.detected))}`);
  assert.equal(good.probes.length, 8, 'all eight probes recorded');

  const replay = module.evaluateNegativeProbeSuite({
    carrierDigests: [`sha256:${'a'.repeat(64)}`, `sha256:${'a'.repeat(64)}`],
    headSha: 'f'.repeat(40),
    tamperEvidence: { eocdAtBefore: 100, eocdAtAfter: -1 },
    crossBuildJoinRejected: true,
  });
  assert.equal(replay.ok, false, 'identical carrier digests (a replay) must fail the suite');
  assert.equal(replay.code, 'RTK_PHYS_NEGATIVE_PROBE_UNDETECTED');

  const intactEocd = module.evaluateNegativeProbeSuite({
    carrierDigests: [`sha256:${'a'.repeat(64)}`, `sha256:${'b'.repeat(64)}`],
    headSha: 'f'.repeat(40),
    tamperEvidence: { eocdAtBefore: 100, eocdAtAfter: 100 },
    crossBuildJoinRejected: true,
  });
  assert.equal(intactEocd.ok, false, 'an intact EOCD after the flip must fail the tamper probe');

  const joinAccepted = module.evaluateNegativeProbeSuite({
    carrierDigests: [`sha256:${'a'.repeat(64)}`, `sha256:${'b'.repeat(64)}`],
    headSha: 'f'.repeat(40),
    tamperEvidence: { eocdAtBefore: 100, eocdAtAfter: -1 },
    crossBuildJoinRejected: false,
  });
  assert.equal(joinAccepted.ok, false, 'an accepted cross-build join must fail the suite');
});

// P30 (PHYS-04C): the negative rung's denominator is the eight probes; a probe
// case seals only when its detection fired and the carriers passed.
test('PHYS01-P30-negative-denominator-law', async () => {
  const module = await loadModule();
  const probeCase = (id, detected, carriersOk) => ({
    caseId: `negative-probe-${id}`,
    probeId: id,
    detected,
    wordStatus: detected && carriersOk ? 'PASS' : 'FAIL',
    openEditSaveCloseReopen: carriersOk ? 'PASS' : 'FAIL',
    readbackContainsSentinel: carriersOk,
    readbackContainsInsertion: carriersOk,
    wordRevisionCount: 1,
  });
  const ids = ['duplicate-digest-replay', 'tampered-package-crc', 'stale-head-binding', 'crash-partial-no-seal', 'cross-profile-receipt', 'counter-tamper', 'unknown-rung-receipt', 'cross-build-evidence-join'];
  const full = ids.map((id) => probeCase(id, true, true));
  assert.equal(module.evaluateRungCases('NEGATIVE_REPLAY_CRASH_SUBSET', full).ok, true, 'eight detected probes with passing carriers seal');
  assert.equal(module.evaluateRungCases('NEGATIVE_REPLAY_CRASH_SUBSET', full.slice(0, 7)).code, 'RTK_PHYS_CASE_COUNT_MISMATCH', 'seven probes never seal');
  const undetected = ids.map((id, i) => probeCase(id, i !== 3, true));
  assert.equal(module.evaluateRungCases('NEGATIVE_REPLAY_CRASH_SUBSET', undetected).code, 'RTK_PHYS_CASE_FAILURES_PRESENT', 'an undetected probe never seals');
  const carrierDown = ids.map((id) => probeCase(id, true, false));
  assert.equal(module.evaluateRungCases('NEGATIVE_REPLAY_CRASH_SUBSET', carrierDown).code, 'RTK_PHYS_CASE_FAILURES_PRESENT', 'probes without the physical carrier proof never seal');
});

// ===========================================================================
// PHYS-10 — owner ruling: the completed WAVE_300_REPEAT is append-cycle
// stability repeat evidence ONLY. It is not semantic diversity, not feature
// coverage, not saturation and not terminal Word evidence. The repeat receipt
// must carry the exact claim scope; the saturation audit fail-closes on
// append-only or scope-missing wave receipts until the diverse-family waves
// exist (DIVERSITY-01).
// ===========================================================================

// P31: the repeat receipt is invalid without the exact restricted claim scope.
test('PHYS01-P31-repeat-scope-enforced', async () => {
  const module = await loadModule();
  const plan = module.buildRungPlan('WAVE_300_REPEAT');
  const cases = Array.from({ length: 300 }, (_, i) => passWaveCase('WAVE_300_REPEAT', i));
  const receipt = module.buildRungReceipt(plan, {
    rung: 'WAVE_300_REPEAT',
    headSha: 'a'.repeat(40),
    originMainSha: 'a'.repeat(40),
    wordProfile: {},
    cases,
    artifactRoot: '/x',
  });
  assert.equal(receipt.claimScope, 'APPEND_CYCLE_STABILITY_REPEAT_ONLY', 'the builder stamps the restricted scope');
  const valid = module.validateRungReceipt(plan, receipt);
  assert.equal(valid.ok, true, `scoped repeat receipt validates: ${JSON.stringify(valid.reasons)}`);

  const stripped = JSON.parse(JSON.stringify(receipt));
  delete stripped.claimScope;
  const noScope = module.validateRungReceipt(plan, stripped);
  assert.equal(noScope.ok, false, 'a repeat receipt without claimScope is invalid');
  assert.equal(noScope.code, 'RTK_PHYS_RECEIPT_INVALID');

  const widened = JSON.parse(JSON.stringify(receipt));
  widened.claimScope = 'SEMANTIC_DIVERSITY_EVIDENCE';
  const wrongScope = module.validateRungReceipt(plan, widened);
  assert.equal(wrongScope.ok, false, 'a wider scope on the repeat receipt is invalid');
  assert.equal(wrongScope.code, 'RTK_PHYS_RECEIPT_INVALID');
});

// P32: the saturation audit fail-closes on append-only or scope-missing wave
// receipts — diversity is a hard gate, not a note.
test('PHYS01-P32-audit-diversity-gate', async () => {
  const module = await loadModule();
  const makeSet = (scope) => {
    const receipts = auditReadySet(module);
    for (const rung of Object.keys(receipts)) {
      if (scope === undefined) delete receipts[rung].claimScope;
      else receipts[rung].claimScope = scope;
    }
    return receipts;
  };
  const missing = module.evaluateSaturationAudit({ receiptsByRung: makeSet(undefined) });
  assert.equal(missing.ok, false, 'scope-missing receipts must fail the audit');
  assert.equal(missing.code, 'RTK_PHYS_AUDIT_DIVERSITY_MISSING');

  const appendOnly = module.evaluateSaturationAudit({ receiptsByRung: makeSet('APPEND_CYCLE_STABILITY_ONLY') });
  assert.equal(appendOnly.ok, false, 'append-only receipts must fail the audit');
  assert.equal(appendOnly.code, 'RTK_PHYS_AUDIT_DIVERSITY_MISSING');

  const repeatScoped = module.evaluateSaturationAudit({ receiptsByRung: makeSet('APPEND_CYCLE_STABILITY_REPEAT_ONLY') });
  assert.equal(repeatScoped.ok, false, 'repeat-scoped receipts must fail the audit');

  const diverse = auditReadySet(module);
  // The repeat receipt of a diverse set repeats the first wave's manifest — the
  // audit checks the repeat binds the same manifest digest.
  const result = module.evaluateSaturationAudit({ receiptsByRung: diverse });
  assert.equal(result.ok, true, `diversity-proven receipts must audit: ${JSON.stringify(result.reasons)}`);
  assert.equal(result.status, 'COMPLETE_NOT_SATURATED');
});

// ===========================================================================
// DIVERSITY-01 — owner spec: normalized diversity oracle (case ID, path and
// sentinel stripped before comparison; duplicate normalized cases never grow
// the coverage denominator), executable Word-edit operation families with
// minimum quotas (stale/replay/tamper/crash stay in the negative-probe rung),
// and the manifest-bound repeat (one-to-one manifest replay with original
// case digest verification).
// ===========================================================================

function diverseSpec(id, family, shape, contentClass) {
  return {
    id,
    family,
    operationShape: shape,
    contentClass,
    sentinel: `SENTINEL_${id}`,
    path: `/tmp/${id}.docx`,
  };
}

// D01: the generated diverse WAVE_300 passes the oracle with the full
// denominator and every family meeting its quota.
test('PHYS01-D01-diverse-wave-passes-oracle', async () => {
  const module = await loadModule();
  const specs = module.buildDiverseWaveCaseSpecs('WAVE_300');
  assert.equal(specs.length, 300, 'exactly 300 cases');
  assert.deepEqual([...module.OPERATION_FAMILIES], [
    'replacement', 'deletion', 'insertion', 'duplicate-anchors', 'comments', 'formatting',
    'structural-boundaries', 'unicode', 'rtl', 'cjk',
  ], 'the executable Word-edit operation families are pinned literally');
  const verdict = module.evaluateDiversityOracle(specs);
  assert.equal(verdict.ok, true, `generated wave must pass the oracle: ${JSON.stringify(verdict)}`);
  assert.equal(verdict.coverageDenominator, 300, 'full coverage denominator');
  assert.equal(verdict.duplicates.length, 0, 'no duplicates');
  for (const family of module.OPERATION_FAMILIES) {
    const count = specs.filter((s) => s.family === family).length;
    assert.ok(count >= module.FAMILY_QUOTAS[family], `family ${family} meets its quota (${count} >= ${module.FAMILY_QUOTAS[family]})`);
  }
});

// D02: the owner-named bypass — 300 cases differing only by ID must collapse
// to a denominator of one and fail.
test('PHYS01-D02-id-only-uniqueness-collapses', async () => {
  const module = await loadModule();
  const idOnly = Array.from({ length: 300 }, (_, i) => diverseSpec(`case-${i}`, 'insertion', 'paragraph-end', 'plain-text'));
  const verdict = module.evaluateDiversityOracle(idOnly);
  assert.equal(verdict.ok, false, 'ID-only uniqueness must fail the oracle');
  assert.equal(verdict.code, 'RTK_PHYS_DIVERSITY_DUPLICATE_NORMALIZED');
  assert.equal(verdict.coverageDenominator, 1, 'the 300 ID-only cases are one normalized case');
  assert.equal(verdict.duplicates.length, 299, 'all but one are duplicates');
});

// D03: a family below its quota fails with the family named.
test('PHYS01-D03-quota-missing-blocked', async () => {
  const module = await loadModule();
  // Isolate the quota dimension: shrink the comments family below its quota by
  // dropping surplus comment cases; every remaining case stays in-vocabulary
  // and normalized-distinct.
  const all = module.buildDiverseWaveCaseSpecs('WAVE_300');
  const commentCases = all.filter((s) => s.family === 'comments');
  const dropCount = commentCases.length - (module.FAMILY_QUOTAS.comments - 1);
  const dropped = new Set(commentCases.slice(0, dropCount).map((s) => s.id));
  const filled = all.filter((s) => !dropped.has(s.id));
  const verdict = module.evaluateDiversityOracle(filled);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'RTK_PHYS_DIVERSITY_QUOTA_MISSING');
  assert.ok(JSON.stringify(verdict.quotaFailures).includes('comments'), 'the missing family must be named');
});

// D04: the repeat must replay the first wave's manifest one-to-one and verify
// original case digests.
test('PHYS01-D04-repeat-manifest-binding', async () => {
  const module = await loadModule();
  const firstWave = module.buildDiverseWaveCaseSpecs('WAVE_300');
  const manifest = module.buildCaseManifest(firstWave);
  assert.ok(/^[a-f0-9]{64}$/u.test(manifest.manifestDigest), 'manifest digest is a hex sha256');

  const faithful = module.buildRepeatCaseSpecs(manifest);
  const ok = module.evaluateRepeatManifestBinding({ manifest, repeatSpecs: faithful });
  assert.equal(ok.ok, true, `a faithful manifest replay must pass: ${JSON.stringify(ok.reasons)}`);

  const swapped = faithful.map((s, i) => (i === 10 ? { ...s, family: 'tamper' } : s));
  const bad = module.evaluateRepeatManifestBinding({ manifest, repeatSpecs: swapped });
  assert.equal(bad.ok, false, 'a swapped case family must fail the binding');
  assert.equal(bad.code, 'RTK_PHYS_REPEAT_MANIFEST_MISMATCH');

  const reordered = [...faithful].reverse();
  const bad2 = module.evaluateRepeatManifestBinding({ manifest, repeatSpecs: reordered });
  assert.equal(bad2.ok, false, 'a reordered manifest must fail the binding');
  assert.equal(bad2.code, 'RTK_PHYS_REPEAT_MANIFEST_MISMATCH');

  // Digest-only tamper: faithful specs but a corrupted manifest caseDigest must
  // fail (the digest is recomputed from the repeat specs and compared).
  const tamperedManifest = JSON.parse(JSON.stringify(manifest));
  tamperedManifest.cases[7].caseDigest = '0'.repeat(64);
  const bad3 = module.evaluateRepeatManifestBinding({ manifest: tamperedManifest, repeatSpecs: faithful });
  assert.equal(bad3.ok, false, 'a tampered manifest caseDigest must fail the binding');
  assert.equal(bad3.code, 'RTK_PHYS_REPEAT_MANIFEST_MISMATCH');
});

// D05: the generator's normalized forms are all distinct (no hidden duplicates
// inside a family across shapes/content classes).
test('PHYS01-D05-generator-normalized-forms-distinct', async () => {
  const module = await loadModule();
  const specs = module.buildDiverseWaveCaseSpecs('WAVE_300');
  const normalized = specs.map((s) => JSON.stringify(module.normalizeCaseForDiversity(s)));
  assert.equal(new Set(normalized).size, specs.length, 'every generated case is a distinct normalized case');
});

// D06: the oracle strips identity fields — two cases differing only in
// id/path/sentinel are duplicates regardless of those fields.
test('PHYS01-D06-oracle-strips-identity-fields', async () => {
  const module = await loadModule();
  const a = diverseSpec('case-A', 'replacement', 'tracked-replacement', 'unicode');
  const b = { ...diverseSpec('case-B', 'replacement', 'tracked-replacement', 'unicode'), path: '/other/path.docx' };
  const n1 = JSON.stringify(module.normalizeCaseForDiversity(a));
  const n2 = JSON.stringify(module.normalizeCaseForDiversity(b));
  assert.equal(n1, n2, 'identity fields never enter the normalized form');
});

// P33 (owner item 7): the audit requires the repeat to bind the first wave's
// manifest digest.
test('PHYS01-P33-audit-manifest-binding', async () => {
  const module = await loadModule();
  const makeSet = () => auditReadySet(module);
  const ok = module.evaluateSaturationAudit({ receiptsByRung: makeSet() });
  assert.equal(ok.ok, true, `manifest-bound set audits: ${JSON.stringify(ok.reasons)}`);

  const mismatched = makeSet();
  mismatched.WAVE_300_REPEAT.manifestDigest = 'b'.repeat(64);
  const bad = module.evaluateSaturationAudit({ receiptsByRung: mismatched });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'RTK_PHYS_AUDIT_MANIFEST_MISMATCH');

  const missing = makeSet();
  delete missing.WAVE_300.caseManifest;
  const bad2 = module.evaluateSaturationAudit({ receiptsByRung: missing });
  assert.equal(bad2.ok, false, 'a wave without an embedded manifest fails the binding');
  assert.equal(bad2.code, 'RTK_PHYS_AUDIT_MANIFEST_MISMATCH');
});

// ===========================================================================
// DIVERSITY-01B — independent audit repair (findings B + residuals):
// 1. evaluateRepeatManifestBinding recomputes and compares the TOP-LEVEL
//    manifestDigest (hex-64 required), not only per-case digests;
// 2. the saturation audit recomputes both wave manifests from EMBEDDED
//    manifest cases (self-authored digest strings no longer pass), requires
//    hex-64 format and runs the one-to-one binding between them;
// 3. the audit cross-checks counters.failed against cases and requires a
//    40-hex headSha per receipt;
// 4. the false-saturation filter is case-insensitive and composite-proof;
// 5. the oracle fails typed (never a raw SyntaxError) on malformed specs and
//    rejects shapes/classes outside the frozen vocabularies.
// ===========================================================================

// D07: top-level manifestDigest is recomputed and compared; a bogus or absent
// top-level digest fails even with faithful per-case digests.
test('PHYS01-D07-toplevel-manifest-digest-enforced', async () => {
  const module = await loadModule();
  const specs = module.buildDiverseWaveCaseSpecs('WAVE_300');
  const manifest = module.buildCaseManifest(specs);
  const faithful = module.buildRepeatCaseSpecs(manifest);

  const bogus = { ...manifest, manifestDigest: '0'.repeat(64) };
  const r1 = module.evaluateRepeatManifestBinding({ manifest: bogus, repeatSpecs: faithful });
  assert.equal(r1.ok, false, 'bogus top-level digest must fail');
  assert.equal(r1.code, 'RTK_PHYS_REPEAT_MANIFEST_MISMATCH');

  const absent = { ...manifest };
  delete absent.manifestDigest;
  const r2 = module.evaluateRepeatManifestBinding({ manifest: absent, repeatSpecs: faithful });
  assert.equal(r2.ok, false, 'absent top-level digest must fail');

  const malformed = { ...manifest, manifestDigest: true };
  const r3 = module.evaluateRepeatManifestBinding({ manifest: malformed, repeatSpecs: faithful });
  assert.equal(r3.ok, false, 'non-hex-64 digest must fail');

  const ok = module.evaluateRepeatManifestBinding({ manifest, repeatSpecs: faithful });
  assert.equal(ok.ok, true, `honest manifest passes: ${JSON.stringify(ok.reasons)}`);
});

// D08: the audit recomputes manifests from embedded cases — self-authored
// digest strings without real manifests no longer pass.
test('PHYS01-D08-audit-recomputes-embedded-manifests', async () => {
  const module = await loadModule();
  const specs = module.buildDiverseWaveCaseSpecs('WAVE_300');
  const manifest = module.buildCaseManifest(specs);
  const makeSet = () => auditReadySet(module);
  const ok = module.evaluateSaturationAudit({ receiptsByRung: makeSet() });
  assert.equal(ok.ok, true, `embedded manifests pass: ${JSON.stringify(ok.reasons)}`);

  const selfAuthored = makeSet();
  delete selfAuthored.WAVE_300.caseManifest;
  delete selfAuthored.WAVE_300_REPEAT.caseManifest;
  const r1 = module.evaluateSaturationAudit({ receiptsByRung: selfAuthored });
  assert.equal(r1.ok, false, 'digest strings without embedded manifests must fail');
  assert.equal(r1.code, 'RTK_PHYS_AUDIT_MANIFEST_MISMATCH');

  const different = makeSet();
  different.WAVE_300_REPEAT.caseManifest = module.buildCaseManifest(module.buildDiverseWaveCaseSpecs('WAVE_300').map((s, i) => (i === 0 ? { ...s, family: 'tamper' } : s)));
  different.WAVE_300_REPEAT.manifestDigest = different.WAVE_300_REPEAT.caseManifest.manifestDigest;
  const r2 = module.evaluateSaturationAudit({ receiptsByRung: different });
  assert.equal(r2.ok, false, 'a repeat manifest differing from the first wave must fail');
  assert.equal(r2.code, 'RTK_PHYS_AUDIT_MANIFEST_MISMATCH');
});

// D09: audit cross-checks — counters.failed must match cases, headSha must be
// 40-hex, receipt.rung must match its slot.
test('PHYS01-D09-audit-cross-checks', async () => {
  const module = await loadModule();
  const specs = module.buildDiverseWaveCaseSpecs('WAVE_300');
  const manifest = module.buildCaseManifest(specs);
  const makeSet = () => auditReadySet(module);
  const ok = module.evaluateSaturationAudit({ receiptsByRung: makeSet() });
  assert.equal(ok.ok, true, `cross-checked set passes: ${JSON.stringify(ok.reasons)}`);

  const lyingCounters = makeSet();
  lyingCounters.WAVE_40.counters.failed = 1;
  const r1 = module.evaluateSaturationAudit({ receiptsByRung: lyingCounters });
  assert.equal(r1.ok, false, 'a failed counter disagreeing with all-pass cases must fail');
  assert.equal(r1.code, 'RTK_PHYS_AUDIT_VETO_NONZERO');

  const brokenSeal = makeSet();
  brokenSeal.WAVE_40.cases[3] = { ...brokenSeal.WAVE_40.cases[3], openEditSaveCloseReopen: 'FAIL', wordStatus: 'FAIL' };
  const r1b = module.evaluateSaturationAudit({ receiptsByRung: brokenSeal });
  assert.equal(r1b.ok, false, 'a failed case breaks the seal first');
  assert.equal(r1b.code, 'RTK_PHYS_AUDIT_WAVE_MISSING');

  const badHead = makeSet();
  badHead.WAVE_100.headSha = 'not-a-sha';
  const r2 = module.evaluateSaturationAudit({ receiptsByRung: badHead });
  assert.equal(r2.ok, false, 'a non-hex headSha must fail');
});

// D10: false-saturation filter is case-insensitive and composite-proof.
test('PHYS01-D10-false-saturation-filter-hardened', async () => {
  const module = await loadModule();
  for (const status of ['saturated', 'Saturated', 'SATURATED', 'NOT_SATURATED;SATURATED', 'SATURATED_NOT']) {
    const receipts = auditReadySet(module);
    receipts.WAVE_300.status = status;
    const r = module.evaluateSaturationAudit({ receiptsByRung: receipts });
    assert.equal(r.ok, false, `status ${JSON.stringify(status)} must be refused`);
    assert.equal(r.code, 'RTK_PHYS_AUDIT_FALSE_SATURATION');
  }
});

// D11: the oracle fails typed on malformed specs and rejects out-of-vocabulary
// shapes/classes.
test('PHYS01-D11-oracle-typed-malformed-and-vocabulary', async () => {
  const module = await loadModule();
  const malformed = module.evaluateDiversityOracle([{ id: 'x', family: undefined, operationShape: undefined, contentClass: undefined }]);
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, 'RTK_PHYS_DIVERSITY_CASE_MALFORMED');

  const specs = module.buildDiverseWaveCaseSpecs('WAVE_300');
  const badVocab = specs.map((s, i) => (i === 0 ? { ...s, operationShape: 'invented-shape-not-in-vocabulary' } : s));
  const r = module.evaluateDiversityOracle(badVocab);
  assert.equal(r.ok, false, 'out-of-vocabulary shape must fail');
  assert.equal(r.code, 'RTK_PHYS_DIVERSITY_VOCABULARY_INVALID');
});

// ===========================================================================
// DIVERSITY-01C — second independent audit repairs:
// 1. the audit re-runs the diversity oracle over the embedded first-wave
//    manifest (a self-consistent garbage manifest can no longer pass);
// 2. receipt cases are bound to the embedded manifest per ordinal (family,
//    shape, class must agree);
// 3. malformed (null) manifest entries fail typed, never a raw throw.
// ===========================================================================

test('PHYS01-D12-audit-reruns-oracle-over-manifest', async () => {
  const module = await loadModule();
  const set = (() => {
    const receipts = auditReadySet(module);
    // Garbage but self-consistent manifest: 300 tamper cases, honest digests.
    const garbageSpecs = Array.from({ length: 300 }, (_, i) => ({
      id: `g-${i}`, ordinal: i + 1, family: 'tamper', operationShape: 'tamper-crc-reject', contentClass: 'plain-text',
    }));
    const garbage = module.buildCaseManifest(garbageSpecs);
    receipts.WAVE_300.caseManifest = garbage;
    receipts.WAVE_300_REPEAT.caseManifest = JSON.parse(JSON.stringify(garbage));
    receipts.WAVE_300.manifestDigest = garbage.manifestDigest;
    receipts.WAVE_300_REPEAT.manifestDigest = garbage.manifestDigest;
    // cases bound to the garbage manifest so only the oracle dimension differs.
    receipts.WAVE_300.cases = garbage.cases.map((c, i) => ({ ...passWaveCase('WAVE_300', i), ordinal: c.ordinal, family: c.family, operationShape: c.operationShape, contentClass: c.contentClass }));
    receipts.WAVE_300_REPEAT.cases = garbage.cases.map((c, i) => ({ ...passWaveCase('WAVE_300_REPEAT', i), ordinal: c.ordinal, family: c.family, operationShape: c.operationShape, contentClass: c.contentClass }));
    return receipts;
  })();
  const r = module.evaluateSaturationAudit({ receiptsByRung: set });
  assert.equal(r.ok, false, 'a quota-violating manifest must fail even with honest digests');
  assert.equal(r.code, 'RTK_PHYS_AUDIT_DIVERSITY_MISSING');
});

test('PHYS01-D13-cases-bound-to-manifest', async () => {
  const module = await loadModule();
  const receipts = auditReadySet(module);
  // Rebind the cases of WAVE_300 to its manifest (honest state).
  const manifest = receipts.WAVE_300.caseManifest;
  receipts.WAVE_300.cases = manifest.cases.map((c, i) => ({ ...passWaveCase('WAVE_300', i), ordinal: c.ordinal, family: c.family, operationShape: c.operationShape, contentClass: c.contentClass }));
  receipts.WAVE_300_REPEAT.cases = manifest.cases.map((c, i) => ({ ...passWaveCase('WAVE_300_REPEAT', i), ordinal: c.ordinal, family: c.family, operationShape: c.operationShape, contentClass: c.contentClass }));
  const ok = module.evaluateSaturationAudit({ receiptsByRung: receipts });
  assert.equal(ok.ok, true, `bound cases pass: ${JSON.stringify(ok.reasons)}`);

  const lying = JSON.parse(JSON.stringify(receipts));
  lying.WAVE_300.cases[0] = { ...lying.WAVE_300.cases[0], family: 'crash' };
  const bad = module.evaluateSaturationAudit({ receiptsByRung: lying });
  assert.equal(bad.ok, false, 'a case lying about its family against the manifest must fail');
  assert.equal(bad.code, 'RTK_PHYS_AUDIT_MANIFEST_MISMATCH');
});

test('PHYS01-D14-null-manifest-entry-typed', async () => {
  const module = await loadModule();
  const receipts = auditReadySet(module);
  const tampered = JSON.parse(JSON.stringify(receipts.WAVE_300_REPEAT.caseManifest));
  tampered.cases[5] = null;
  receipts.WAVE_300_REPEAT.caseManifest = tampered;
  const r = module.evaluateSaturationAudit({ receiptsByRung: receipts });
  assert.equal(r.ok, false, 'a null manifest entry must fail typed');
  assert.equal(r.code, 'RTK_PHYS_AUDIT_MANIFEST_MISMATCH');
});

// ===========================================================================
// DIVERSITY-01D pins: small-wave manifest law, full seal law in the audit,
// ordinal binding, typed non-array manifest entries.
// ===========================================================================

test('PHYS01-P34-small-wave-manifest-law', async () => {
  const module = await loadModule();
  const missing = auditReadySet(module);
  delete missing.WAVE_10.caseManifest;
  const r1 = module.evaluateSaturationAudit({ receiptsByRung: missing });
  assert.equal(r1.ok, false);
  assert.equal(r1.code, 'RTK_PHYS_AUDIT_MANIFEST_MISMATCH');

  const dupes = auditReadySet(module);
  // Self-consistent manifest whose cases 0 and 1 are the same normalized form
  // (honest digests over the duplicated content).
  const baseSpecs = module.buildDiverseWaveCaseSpecs('WAVE_300').slice(0, 10);
  const dupSpecs = baseSpecs.map((spec, i) => (i === 1 ? { ...spec, family: baseSpecs[0].family, operationShape: baseSpecs[0].operationShape, contentClass: baseSpecs[0].contentClass } : spec));
  const dupManifest = module.buildCaseManifest(dupSpecs);
  dupes.WAVE_10.caseManifest = dupManifest;
  dupes.WAVE_10.manifestDigest = dupManifest.manifestDigest;
  dupes.WAVE_10.cases = dupManifest.cases.map((c, i) => ({
    ...passWaveCase('WAVE_10', i),
    ordinal: c.ordinal,
    family: c.family,
    operationShape: c.operationShape,
    contentClass: c.contentClass,
  }));
  const r2 = module.evaluateSaturationAudit({ receiptsByRung: dupes });
  assert.equal(r2.ok, false, 'duplicate normalized cases in a small-wave manifest must fail');
  assert.equal(r2.code, 'RTK_PHYS_AUDIT_DIVERSITY_MISSING');
});

test('PHYS01-P35-audit-full-seal-law', async () => {
  const module = await loadModule();
  const set = auditReadySet(module);
  set.WAVE_40.cases[7] = { ...set.WAVE_40.cases[7], wordStatus: 'FAIL', readbackContainsSentinel: false };
  const r = module.evaluateSaturationAudit({ receiptsByRung: set });
  assert.equal(r.ok, false, 'a wordStatus FAIL under a passing one-field flag must fail the full seal law');
  assert.equal(r.code, 'RTK_PHYS_AUDIT_WAVE_MISSING');
});

test('PHYS01-P36-ordinal-and-counter-binding', async () => {
  const module = await loadModule();
  const badOrdinal = auditReadySet(module);
  badOrdinal.WAVE_100.cases = badOrdinal.WAVE_100.cases.map((c) => ({ ...c, ordinal: 999 }));
  const r1 = module.evaluateSaturationAudit({ receiptsByRung: badOrdinal });
  assert.equal(r1.ok, false);
  assert.equal(r1.code, 'RTK_PHYS_AUDIT_MANIFEST_MISMATCH');

  const lyingTotal = auditReadySet(module);
  lyingTotal.WAVE_10.counters = { total: 9999, passed: 9999, failed: 0 };
  const r2 = module.evaluateSaturationAudit({ receiptsByRung: lyingTotal });
  assert.equal(r2.ok, false, 'counters lying about the case list must fail');
  assert.equal(r2.code, 'RTK_PHYS_AUDIT_VETO_NONZERO');

  const nonArray = auditReadySet(module);
  nonArray.WAVE_300_REPEAT.caseManifest = { cases: 42 };
  const r3 = module.evaluateSaturationAudit({ receiptsByRung: nonArray });
  assert.equal(r3.ok, false, 'non-array manifest cases must fail typed');
  assert.equal(r3.code, 'RTK_PHYS_AUDIT_MANIFEST_MISMATCH');
});

// ===========================================================================
// DIVERSITY-02 — physical family executors: oracle-gated diversity scope
// stamp, manifest embedding in wave receipts, per-family script builders, and
// the manifest-replay repeat executor.
// ===========================================================================

// E01: a wave receipt seals with DIVERSE_FAMILY_WAVE_PROVEN only when the
// diversity oracle passes over the rung's case specs; append-only specs can
// never seal.
test('PHYS01-E01-oracle-gated-scope-stamp', async () => {
  const module = await loadModule();
  const plan = module.buildRungPlan('WAVE_10');
  const diverseSpecs = module.buildDiverseWaveCaseSpecs('WAVE_300').slice(0, 10).map((s, i) => ({ ...s, ordinal: i + 1 }));
  const cases = diverseSpecs.map((s, i) => ({
    ...passWaveCase('WAVE_10', i),
    ordinal: i + 1,
    family: s.family,
    operationShape: s.operationShape,
    contentClass: s.contentClass,
  }));
  const receipt = module.buildRungReceipt(plan, {
    rung: 'WAVE_10', headSha: 'a'.repeat(40), originMainSha: 'a'.repeat(40),
    wordProfile: {}, cases, artifactRoot: '/x', caseSpecs: diverseSpecs,
  });
  assert.equal(receipt.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN', 'diverse specs earn the diversity-proven scope');
  assert.ok(receipt.caseManifest && Array.isArray(receipt.caseManifest.cases), 'manifest embedded');
  assert.ok(/^[0-9a-f]{64}$/u.test(receipt.manifestDigest), 'manifest digest embedded');

  const appendSpecs = Array.from({ length: 10 }, (_, i) => ({ id: `a-${i}`, ordinal: i + 1, family: 'insertion', operationShape: 'paragraph-end', contentClass: 'plain-text' }));
  const appendCases = appendSpecs.map((s, i) => ({ ...passWaveCase('WAVE_10', i), ordinal: i + 1, family: s.family, operationShape: s.operationShape, contentClass: s.contentClass }));
  assert.throws(() => module.buildRungReceipt(plan, {
    rung: 'WAVE_10', headSha: 'a'.repeat(40), originMainSha: 'a'.repeat(40),
    wordProfile: {}, cases: appendCases, artifactRoot: '/x', caseSpecs: appendSpecs,
  }), /RTK_PHYS_DIVERSITY_ORACLE_REQUIRED/u, 'append-only specs must never seal a diversity wave');

  // The 300-denominator rung enforces quotas inside the receipt builder: a
  // quota-violating spec set must throw even with otherwise passing cases.
  const plan300 = module.buildRungPlan('WAVE_300');
  // Quota-isolated: comments cases move into UNUSED in-vocabulary combos of
  // over-quota families (distinctness preserved, only the comments quota
  // breaks).
  const generated = module.buildDiverseWaveCaseSpecs('WAVE_300');
  const usedKeys = new Set(generated.map((s) => `${s.family}|${s.operationShape}|${s.contentClass}`));
  const spares = [];
  for (const family of module.OPERATION_FAMILIES.filter((item) => item !== 'comments')) {
    for (const shape of module.FAMILY_SHAPES[family]) {
      for (const cls of ['plain-text', 'unicode', 'rtl', 'cjk', 'mixed', 'nbsp']) {
        if (!usedKeys.has(`${family}|${shape}|${cls}`)) spares.push({ family, operationShape: shape, contentClass: cls });
      }
    }
  }
  let spareIdx = 0;
  const quotaBroken = generated.map((s) => {
    if (s.family !== 'comments') return s;
    const spare = spares[spareIdx++];
    return { ...s, family: spare.family, operationShape: spare.operationShape, contentClass: spare.contentClass };
  });
  const cases300 = quotaBroken.map((s, i) => ({ ...passWaveCase('WAVE_300', i), ordinal: i + 1, family: s.family, operationShape: s.operationShape, contentClass: s.contentClass }));
  assert.throws(() => module.buildRungReceipt(plan300, {
    rung: 'WAVE_300', headSha: 'a'.repeat(40), originMainSha: 'a'.repeat(40),
    wordProfile: {}, cases: cases300, artifactRoot: '/x', caseSpecs: quotaBroken,
  }), /RTK_PHYS_DIVERSITY_ORACLE_REQUIRED/u, 'quota-violating specs must never seal the 300 wave');
});

// E02: every wave receipt case carries family/shape/class (manifest binding
// surface for the audit).
test('PHYS01-E02-receipt-cases-carry-family-fields', async () => {
  const module = await loadModule();
  const plan = module.buildRungPlan('WAVE_10');
  const specs = module.buildDiverseWaveCaseSpecs('WAVE_300').slice(0, 10).map((s, i) => ({ ...s, ordinal: i + 1 }));
  const cases = specs.map((s, i) => ({ ...passWaveCase('WAVE_10', i), ordinal: i + 1, family: s.family, operationShape: s.operationShape, contentClass: s.contentClass }));
  const receipt = module.buildRungReceipt(plan, { rung: 'WAVE_10', headSha: 'a'.repeat(40), originMainSha: 'a'.repeat(40), wordProfile: {}, cases, artifactRoot: '/x', caseSpecs: specs });
  for (const c of receipt.cases) {
    assert.ok(module.OPERATION_FAMILIES.includes(c.family), `case ${c.caseId} family bound`);
    assert.ok(typeof c.operationShape === 'string' && typeof c.contentClass === 'string', 'shape/class present');
  }
});

// E03: the repeat plan replays the first wave's manifest and verifies the
// binding before any physical step.
test('PHYS01-E03-repeat-plan-binds-first-wave-manifest', async () => {
  const module = await loadModule();
  const specs = module.buildDiverseWaveCaseSpecs('WAVE_300');
  const manifest = module.buildCaseManifest(specs);
  const firstWaveReceipt = { rung: 'WAVE_300', caseManifest: manifest, manifestDigest: manifest.manifestDigest };
  const plan = module.buildRepeatPlan(firstWaveReceipt);
  assert.equal(plan.specs.length, 300);
  assert.equal(plan.manifestDigest, manifest.manifestDigest, 'the repeat plan binds the first wave digest');

  const tampered = JSON.parse(JSON.stringify(firstWaveReceipt));
  tampered.caseManifest.cases[4] = { ...tampered.caseManifest.cases[4], family: 'crash' };
  assert.throws(() => module.buildRepeatPlan(tampered), /RTK_PHYS_REPEAT_MANIFEST_MISMATCH/u, 'a tampered first-wave manifest must refuse the repeat plan');

  const noManifest = { rung: 'WAVE_300' };
  assert.throws(() => module.buildRepeatPlan(noManifest), /RTK_PHYS_REPEAT_MANIFEST_MISMATCH/u, 'a first wave without a manifest refuses the repeat plan');
});

// E04: per-family script builders embed the family-specific Word operation.
test('PHYS01-E04-family-script-idioms', async () => {
  const module = await loadModule();
  const markers = {
    replacement: 'set content of (create range',
    deletion: 'set content of (create range',
    insertion: 'set content of (create range',
    'duplicate-anchors': 'set content of (create range',
    comments: 'make new Word comment',
    formatting: 'set bold of font object',
    'structural-boundaries': 'set content of (create range',
    unicode: 'set content of (create range',
    rtl: 'set content of (create range',
    cjk: 'set content of (create range',
  };
  for (const family of Object.keys(markers)) {
    const spec = module.buildDiverseWaveCaseSpecs('WAVE_300').find((s) => s.family === family);
    const script = module.buildFamilyWordScriptForTest('case.docx', '/tmp/case.docx', spec);
    assert.ok(script.includes(markers[family]), `family ${family} script must embed ${JSON.stringify(markers[family])}`);
    assert.ok(!script.includes('set end of content of text object'), `${family} must never emit the invalid statement`);
    assert.ok(!script.includes('count of content of text object of yDoc'), `${family} must never count the live text object`);
  }
  for (const family of ['stale', 'replay', 'tamper', 'crash']) {
    const plan = module.buildProbeCasePlanForTest({ family, operationShape: `${family}-shape` });
    assert.equal(plan.requiresWordEdit, false, `${family} is a runner-level probe, not a Word edit`);
    assert.ok(!module.OPERATION_FAMILIES.includes(family), `${family} is excluded from the Word physical-diversity denominator`);
  }
});

// E05: evaluateSaturationAudit(null) fails typed, never throws (round-4 hygiene).
test('PHYS01-E05-audit-null-typed', async () => {
  const module = await loadModule();
  const r = module.evaluateSaturationAudit(null);
  assert.equal(r.ok, false);
  assert.ok(typeof r.code === 'string' && r.code.startsWith('RTK_PHYS_'), 'typed failure on null input');
});

// E06: the wave-cycle plan carries the diverse specs builder (the append-only
// generator is no longer the wave source).
test('PHYS01-E06-wave-cycle-uses-diverse-specs', async () => {
  const module = await loadModule();
  const plan = module.buildRungPlan('WAVE_40');
  assert.equal(plan.executor, 'wave-cycle');
  const specs = module.buildWaveCaseSpecs('WAVE_40');
  // Small waves satisfy the quota-free oracle (distinct + vocabulary); the
  // 300-denominator wave satisfies the full oracle with quotas.
  const verdict = module.evaluateDiversityOracle(specs, { requireQuotas: false });
  assert.equal(verdict.ok, true, 'small-wave specs must be distinct in-vocabulary forms by construction');
  const full = module.evaluateDiversityOracle(module.buildWaveCaseSpecs('WAVE_300'));
  assert.equal(full.ok, true, 'the 300-wave specs must satisfy the full quota oracle by construction');
});

// P37 (DIVERSITY-02): a diversity-proven scope without an embedded manifest is
// an empty assertion and invalid; the repeat accepts either the restricted
// append scope or the diversity-proven scope.
test('PHYS01-P37-diverse-scope-requires-manifest', async () => {
  const module = await loadModule();
  const plan = module.buildRungPlan('WAVE_40');
  const specs = module.buildWaveCaseSpecs('WAVE_40');
  const cases = specs.map((s, i) => ({ ...passWaveCase('WAVE_40', i), ordinal: i + 1, family: s.family, operationShape: s.operationShape, contentClass: s.contentClass }));
  const receipt = module.buildRungReceipt(plan, { rung: 'WAVE_40', headSha: 'a'.repeat(40), originMainSha: 'a'.repeat(40), wordProfile: {}, cases, artifactRoot: '/x', caseSpecs: specs });
  assert.equal(receipt.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  const valid = module.validateRungReceipt(plan, receipt);
  assert.equal(valid.ok, true, `diverse receipt with manifest validates: ${JSON.stringify(valid.reasons)}`);

  const stripped = JSON.parse(JSON.stringify(receipt));
  delete stripped.caseManifest;
  const invalid = module.validateRungReceipt(plan, stripped);
  assert.equal(invalid.ok, false, 'diverse scope without the embedded manifest is invalid');
  assert.equal(invalid.code, 'RTK_PHYS_RECEIPT_INVALID');
});

// E07 (DIVERSITY-02 anti-drift): every family anchor must be present verbatim
// in the lab's synthetic fixture bytes (the first diverse run found a CJK
// token drift between the lab text and the runner's copy; 13/13 CJK cases
// failed anchor-missing while all other families passed).
test('PHYS01-E07-anchors-present-in-lab-fixture-bytes', async () => {
  const module = await loadModule();
  const lab = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-latest-physical-certification-lab.mjs')).href);
  const buffer = lab.buildB06SyntheticDocxBuffer({ id: 'anchor-probe', title: 'anchor probe' });
  const text = buffer.toString('utf8');
  const anchors = ['OLD_WORD', 'INSERT_HERE', 'COMMENT_TARGET', 'SCENE_BOUNDARY', 'café', 'shalom', '短文'];
  for (const anchor of anchors) {
    assert.ok(text.includes(anchor), `anchor ${JSON.stringify(anchor)} must be present in the lab fixture bytes`);
  }
  // And the runner's own fixture copy must agree on every family anchor.
  for (const family of ['replacement', 'deletion', 'insertion', 'duplicate-anchors', 'comments', 'formatting', 'structural-boundaries', 'unicode', 'rtl', 'cjk']) {
    const spec = module.buildDiverseWaveCaseSpecs('WAVE_300').find((s) => s.family === family);
    const script = module.buildFamilyWordScriptForTest('case.docx', '/tmp/case.docx', spec);
    assert.ok(script.length > 100, `${family} script builds against the runner fixture copy`);
  }
});

// ===========================================================================
// PHYS-11 — owner review finding F2_WORD_PHYSICAL_DIVERSITY_V1:
// metadata rows are not executable diversity. The harness must bind each
// advertised normalized case to fixture bytes, a physical script or typed
// adverse execution plan, and an independent oracle digest. A repeated
// executable digest under different normalized rows is a false-diversity
// blocker, even when IDs/titles/sentinels differ.
// ===========================================================================

function execDiversitySpec(id, family, operationShape, contentClass, ordinal = 1) {
  return {
    id,
    ordinal,
    family,
    operationShape,
    contentClass,
    title: `executable diversity ${id}`,
  };
}

test('PHYS01-F01-shape-and-content-class-change-executable-digests', async () => {
  const module = await loadModule();
  assert.equal(typeof module.buildExecutableDiversityCaseSpecForTest, 'function',
    'closed executable case builder must be exported for the contract');

  const base = execDiversitySpec('same-case', 'replacement', 'single-word', 'plain-text');
  const shapeChanged = { ...base, operationShape: 'multi-word' };
  const classChanged = { ...base, contentClass: 'unicode' };

  const baseExec = module.buildExecutableDiversityCaseSpecForTest(base);
  const shapeExec = module.buildExecutableDiversityCaseSpecForTest(shapeChanged);
  const classExec = module.buildExecutableDiversityCaseSpecForTest(classChanged);

  for (const record of [baseExec, shapeExec, classExec]) {
    assert.equal(record.schema, 'yalken.rtk.word.physical-diversity.executable-case.v1');
    assert.match(record.fixtureDigest, /^sha256:[0-9a-f]{64}$/u, 'fixtureDigest is bound');
    assert.match(record.executionPlanDigest, /^sha256:[0-9a-f]{64}$/u, 'executionPlanDigest is bound');
    assert.match(record.scriptDigest, /^sha256:[0-9a-f]{64}$/u, 'scriptDigest is bound');
    assert.match(record.oracleDigest, /^sha256:[0-9a-f]{64}$/u, 'oracleDigest is bound');
    assert.match(record.executionDigest, /^sha256:[0-9a-f]{64}$/u, 'executionDigest is bound');
  }

  assert.notEqual(shapeExec.fixtureDigest, baseExec.fixtureDigest, 'operationShape must change fixture bytes, not just metadata');
  assert.notEqual(shapeExec.executionPlanDigest, baseExec.executionPlanDigest, 'operationShape must change the physical plan');
  assert.notEqual(shapeExec.scriptDigest, baseExec.scriptDigest, 'operationShape must change the AppleScript');
  assert.notEqual(shapeExec.oracleDigest, baseExec.oracleDigest, 'operationShape must change the oracle');

  assert.notEqual(classExec.fixtureDigest, baseExec.fixtureDigest, 'contentClass must change fixture bytes');
  assert.notEqual(classExec.executionPlanDigest, baseExec.executionPlanDigest, 'contentClass must change the physical plan');
  assert.notEqual(classExec.scriptDigest, baseExec.scriptDigest, 'contentClass must change the AppleScript');
  assert.notEqual(classExec.oracleDigest, baseExec.oracleDigest, 'contentClass must change the oracle');
});

test('PHYS01-F02-executable-manifest-rejects-metadata-swap-and-digest-reuse', async () => {
  const module = await loadModule();
  assert.equal(typeof module.buildExecutableDiversityManifestForTest, 'function',
    'closed executable manifest builder must be exported');
  assert.equal(typeof module.evaluateExecutableDiversityManifestForTest, 'function',
    'closed executable manifest validator must be exported');

  const specs = [
    execDiversitySpec('replacement-a', 'replacement', 'single-word', 'plain-text', 1),
    execDiversitySpec('replacement-b', 'replacement', 'multi-word', 'unicode', 2),
    execDiversitySpec('deletion-a', 'deletion', 'sentence', 'rtl', 3),
    execDiversitySpec('comment-a', 'comments', 'unicode-anchor', 'mixed', 4),
    execDiversitySpec('format-a', 'formatting', 'underline-word', 'nbsp', 5),
  ];
  const executable = specs.map((spec) => module.buildExecutableDiversityCaseSpecForTest(spec));
  const manifest = module.buildExecutableDiversityManifestForTest(executable);
  const ok = module.evaluateExecutableDiversityManifestForTest(manifest);
  assert.equal(ok.ok, true, `honest executable manifest must pass: ${JSON.stringify(ok.reasons)}`);
  assert.equal(ok.coverageDenominator, executable.length);

  for (const entry of manifest.cases) {
    assert.match(entry.fixtureDigest, /^sha256:[0-9a-f]{64}$/u, 'fixtureDigest persisted in manifest');
    assert.match(entry.executionPlanDigest, /^sha256:[0-9a-f]{64}$/u, 'executionPlanDigest persisted in manifest');
    assert.match(entry.scriptDigest, /^sha256:[0-9a-f]{64}$/u, 'scriptDigest persisted in manifest');
    assert.match(entry.oracleDigest, /^sha256:[0-9a-f]{64}$/u, 'oracleDigest persisted in manifest');
    assert.match(entry.executionDigest, /^sha256:[0-9a-f]{64}$/u, 'executionDigest persisted in manifest');
  }

  const swapped = JSON.parse(JSON.stringify(manifest));
  swapped.cases[1].operationShape = swapped.cases[0].operationShape;
  const swapResult = module.evaluateExecutableDiversityManifestForTest(swapped);
  assert.equal(swapResult.ok, false, 'metadata swap must be rejected against the caseDigest');
  assert.equal(swapResult.code, 'RTK_PHYS_DIVERSITY_EXECUTABLE_MANIFEST_MISMATCH');

  const reuse = JSON.parse(JSON.stringify(manifest));
  reuse.cases[1].fixtureDigest = reuse.cases[0].fixtureDigest;
  reuse.cases[1].executionPlanDigest = reuse.cases[0].executionPlanDigest;
  reuse.cases[1].scriptDigest = reuse.cases[0].scriptDigest;
  reuse.cases[1].oracleDigest = reuse.cases[0].oracleDigest;
  reuse.cases[1].executionDigest = reuse.cases[0].executionDigest;
  reuse.cases[1].caseDigest = module.digestExecutableManifestCaseForTest(reuse.cases[1]);
  reuse.manifestDigest = module.digestExecutableManifestCasesForTest(reuse.cases);
  const reuseResult = module.evaluateExecutableDiversityManifestForTest(reuse);
  assert.equal(reuseResult.ok, false, 'same executable digest under different normalized rows must reject');
  assert.equal(reuseResult.code, 'RTK_PHYS_DIVERSITY_EXECUTION_DIGEST_REUSE');
});

test('PHYS01-F03-word-physical-diversity-vocabulary-excludes-adverse-probe-families', async () => {
  const module = await loadModule();
  assert.deepEqual([...module.WORD_PHYSICAL_DIVERSITY_FAMILIES], [
    'replacement',
    'deletion',
    'insertion',
    'duplicate-anchors',
    'comments',
    'formatting',
    'structural-boundaries',
    'unicode',
    'rtl',
    'cjk',
  ], 'Word physical diversity denominator contains only executable Word-edit families');
  for (const family of ['stale', 'replay', 'tamper', 'crash']) {
    assert.ok(!module.WORD_PHYSICAL_DIVERSITY_FAMILIES.includes(family),
      `${family} is covered by NEGATIVE_REPLAY_CRASH_SUBSET, not by the Word physical-diversity denominator`);
  }
});

test('PHYS01-F04-wave-receipt-embeds-closed-executable-manifest', async () => {
  const module = await loadModule();
  const plan = module.buildRungPlan('WAVE_10');
  const specs = module.buildWaveCaseSpecs('WAVE_10');
  const cases = specs.map((s, i) => ({
    ...passWaveCase('WAVE_10', i),
    ordinal: i + 1,
    family: s.family,
    operationShape: s.operationShape,
    contentClass: s.contentClass,
  }));
  const receipt = module.buildRungReceipt(plan, {
    rung: 'WAVE_10',
    headSha: 'a'.repeat(40),
    originMainSha: 'a'.repeat(40),
    wordProfile: {},
    cases,
    artifactRoot: '/x',
    caseSpecs: specs,
  });

  assert.equal(receipt.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.ok(receipt.executableCaseManifest, 'diverse wave receipt must embed the executable manifest');
  assert.match(receipt.executableManifestDigest, /^[0-9a-f]{64}$/u, 'executable manifest digest is recorded');
  assert.equal(module.evaluateExecutableDiversityManifestForTest(receipt.executableCaseManifest).ok, true,
    'the embedded executable manifest validates independently');
  assert.equal(module.validateRungReceipt(plan, receipt).ok, true, 'receipt with executable manifest validates');

  const stripped = JSON.parse(JSON.stringify(receipt));
  delete stripped.executableCaseManifest;
  const invalid = module.validateRungReceipt(plan, stripped);
  assert.equal(invalid.ok, false, 'diverse wave receipt without executable manifest is invalid');
  assert.equal(invalid.code, 'RTK_PHYS_RECEIPT_INVALID');
});

test('PHYS01-G01-real-16-112-wave10-receipt-validates-executable-diversity-seal', async () => {
  const module = await loadModule();
  assert.equal(fs.existsSync(WAVE10_RECEIPT_PATH), true, '16.112 WAVE_10 physical receipt must exist');
  const receipt = JSON.parse(fs.readFileSync(WAVE10_RECEIPT_PATH, 'utf8'));
  const plan = module.buildRungPlan('WAVE_10');
  assert.equal(plan.receiptRef, WAVE10_RECEIPT_REF);
  assert.equal(receipt.profileId, 'word-mac-16.112-26081010');
  assert.equal(receipt.rung, 'WAVE_10');
  assert.equal(receipt.status, 'PHYSICAL_WAVE_PASS');
  assert.equal(receipt.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.deepEqual(receipt.counters, { total: 10, passed: 10, failed: 0 });
  assert.equal(receipt.wordProfile.versionByBundle, '16.112');
  assert.equal(receipt.wordProfile.buildByBundle, '16.112.26081010');
  assert.equal(receipt.wordProfile.bundleId, 'com.microsoft.Word');
  assert.equal(receipt.wordProfile.teamIdentifier, 'UBF8T346G9');
  assert.ok(receipt.caseManifest && /^[0-9a-f]{64}$/u.test(receipt.manifestDigest),
    'diverse wave receipt must bind the normalized manifest digest');
  assert.ok(receipt.executableCaseManifest && /^[0-9a-f]{64}$/u.test(receipt.executableManifestDigest),
    'diverse wave receipt must bind executable fixture/script/oracle manifest digest');
  assert.equal(receipt.executableCaseManifest.manifestDigest, receipt.executableManifestDigest);
  assert.equal(module.evaluateDiversityOracle(receipt.cases, { requireQuotas: false }).ok, true,
    'normalized case manifest must satisfy the diversity oracle');
  assert.equal(module.evaluateExecutableDiversityManifestForTest(receipt.executableCaseManifest).ok, true,
    'executable case manifest must satisfy the harness-honesty oracle');
  const executionDigests = new Set(receipt.cases.map((entry) => entry.executionDigest));
  const fixtureDigests = new Set(receipt.cases.map((entry) => entry.fixtureDigest));
  const scriptDigests = new Set(receipt.cases.map((entry) => entry.scriptDigest));
  const oracleDigests = new Set(receipt.cases.map((entry) => entry.oracleDigest));
  const families = new Set(receipt.cases.map((entry) => entry.family));
  assert.equal(executionDigests.size, 10, 'WAVE_10 cases must not reuse execution digests');
  assert.equal(fixtureDigests.size, 10, 'WAVE_10 cases must not reuse fixture digests');
  assert.equal(scriptDigests.size, 10, 'WAVE_10 cases must not reuse script digests');
  assert.equal(oracleDigests.size, 10, 'WAVE_10 cases must not reuse oracle digests');
  assert.deepEqual(families, new Set(module.WORD_PHYSICAL_DIVERSITY_FAMILIES),
    'real WAVE_10 receipt must physically exercise all executable Word-edit families');
  const validation = module.validateRungReceipt(plan, receipt, { expectedHeadSha: receipt.headSha });
  assert.equal(validation.ok, true, `real WAVE_10 receipt must validate: ${JSON.stringify(validation.reasons)}`);
  assert.ok((receipt.nonClaims || []).some((line) => String(line).includes('No saturation')),
    'WAVE_10 receipt must explicitly deny saturation/terminal promotion');
});

test('PHYS01-G02-real-16-112-wave40-receipt-validates-executable-diversity-seal', async () => {
  const module = await loadModule();
  assert.equal(fs.existsSync(WAVE40_RECEIPT_PATH), true, '16.112 WAVE_40 physical receipt must exist');
  const receipt = JSON.parse(fs.readFileSync(WAVE40_RECEIPT_PATH, 'utf8'));
  const plan = module.buildRungPlan('WAVE_40');
  assert.equal(plan.receiptRef, WAVE40_RECEIPT_REF);
  assert.equal(receipt.profileId, 'word-mac-16.112-26081010');
  assert.equal(receipt.rung, 'WAVE_40');
  assert.equal(receipt.status, 'PHYSICAL_WAVE_PASS');
  assert.equal(receipt.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.deepEqual(receipt.counters, { total: 40, passed: 40, failed: 0 });
  assert.equal(receipt.wordProfile.versionByBundle, '16.112');
  assert.equal(receipt.wordProfile.buildByBundle, '16.112.26081010');
  assert.equal(receipt.wordProfile.bundleId, 'com.microsoft.Word');
  assert.equal(receipt.wordProfile.teamIdentifier, 'UBF8T346G9');
  assert.ok(receipt.caseManifest && /^[0-9a-f]{64}$/u.test(receipt.manifestDigest),
    'WAVE_40 receipt must bind the normalized manifest digest');
  assert.ok(receipt.executableCaseManifest && /^[0-9a-f]{64}$/u.test(receipt.executableManifestDigest),
    'WAVE_40 receipt must bind executable fixture/script/oracle manifest digest');
  assert.equal(receipt.executableCaseManifest.manifestDigest, receipt.executableManifestDigest);
  assert.equal(module.evaluateDiversityOracle(receipt.cases, { requireQuotas: false }).ok, true,
    'WAVE_40 normalized case manifest must satisfy the diversity oracle without 300-wave quotas');
  assert.equal(module.evaluateExecutableDiversityManifestForTest(receipt.executableCaseManifest).ok, true,
    'WAVE_40 executable case manifest must satisfy the harness-honesty oracle');
  const executionDigests = new Set(receipt.cases.map((entry) => entry.executionDigest));
  const fixtureDigests = new Set(receipt.cases.map((entry) => entry.fixtureDigest));
  const scriptDigests = new Set(receipt.cases.map((entry) => entry.scriptDigest));
  const oracleDigests = new Set(receipt.cases.map((entry) => entry.oracleDigest));
  const families = new Set(receipt.cases.map((entry) => entry.family));
  const normalizedRows = new Set(receipt.cases.map((entry) => JSON.stringify({
    family: entry.family,
    operationShape: entry.operationShape,
    contentClass: entry.contentClass,
  })));
  assert.equal(executionDigests.size, 40, 'WAVE_40 cases must not reuse execution digests');
  assert.equal(fixtureDigests.size, 40, 'WAVE_40 cases must not reuse fixture digests');
  assert.equal(scriptDigests.size, 40, 'WAVE_40 cases must not reuse script digests');
  assert.equal(oracleDigests.size, 40, 'WAVE_40 cases must not reuse oracle digests');
  assert.equal(normalizedRows.size, 40, 'WAVE_40 denominator is 40 distinct executable normalized rows');
  assert.deepEqual(families, new Set(module.WORD_PHYSICAL_DIVERSITY_FAMILIES),
    'real WAVE_40 receipt must physically exercise all executable Word-edit families');
  const validation = module.validateRungReceipt(plan, receipt, { expectedHeadSha: receipt.headSha });
  assert.equal(validation.ok, true, `real WAVE_40 receipt must validate: ${JSON.stringify(validation.reasons)}`);
  assert.ok((receipt.nonClaims || []).some((line) => String(line).includes('No saturation')),
    'WAVE_40 receipt must explicitly deny saturation/terminal promotion');
});

test('PHYS01-G03-real-16-112-wave100-receipt-validates-executable-diversity-seal', async () => {
  const module = await loadModule();
  assert.equal(fs.existsSync(WAVE100_RECEIPT_PATH), true, '16.112 WAVE_100 physical receipt must exist');
  const receipt = JSON.parse(fs.readFileSync(WAVE100_RECEIPT_PATH, 'utf8'));
  const plan = module.buildRungPlan('WAVE_100');
  assert.equal(plan.receiptRef, WAVE100_RECEIPT_REF);
  assert.equal(receipt.profileId, 'word-mac-16.112-26081010');
  assert.equal(receipt.rung, 'WAVE_100');
  assert.equal(receipt.status, 'PHYSICAL_WAVE_PASS');
  assert.equal(receipt.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.deepEqual(receipt.counters, { total: 100, passed: 100, failed: 0 });
  assert.equal(receipt.wordProfile.versionByBundle, '16.112');
  assert.equal(receipt.wordProfile.buildByBundle, '16.112.26081010');
  assert.equal(receipt.wordProfile.bundleId, 'com.microsoft.Word');
  assert.equal(receipt.wordProfile.teamIdentifier, 'UBF8T346G9');
  assert.ok(receipt.caseManifest && /^[0-9a-f]{64}$/u.test(receipt.manifestDigest),
    'WAVE_100 receipt must bind the normalized manifest digest');
  assert.ok(receipt.executableCaseManifest && /^[0-9a-f]{64}$/u.test(receipt.executableManifestDigest),
    'WAVE_100 receipt must bind executable fixture/script/oracle manifest digest');
  assert.equal(receipt.executableCaseManifest.manifestDigest, receipt.executableManifestDigest);
  assert.equal(module.evaluateDiversityOracle(receipt.cases, { requireQuotas: false }).ok, true,
    'WAVE_100 normalized case manifest must satisfy the diversity oracle without 300-wave quotas');
  assert.equal(module.evaluateExecutableDiversityManifestForTest(receipt.executableCaseManifest).ok, true,
    'WAVE_100 executable case manifest must satisfy the harness-honesty oracle');
  const executionDigests = new Set(receipt.cases.map((entry) => entry.executionDigest));
  const fixtureDigests = new Set(receipt.cases.map((entry) => entry.fixtureDigest));
  const scriptDigests = new Set(receipt.cases.map((entry) => entry.scriptDigest));
  const oracleDigests = new Set(receipt.cases.map((entry) => entry.oracleDigest));
  const families = new Set(receipt.cases.map((entry) => entry.family));
  const contentClasses = new Set(receipt.cases.map((entry) => entry.contentClass));
  const normalizedRows = new Set(receipt.cases.map((entry) => JSON.stringify({
    family: entry.family,
    operationShape: entry.operationShape,
    contentClass: entry.contentClass,
  })));
  assert.equal(executionDigests.size, 100, 'WAVE_100 cases must not reuse execution digests');
  assert.equal(fixtureDigests.size, 100, 'WAVE_100 cases must not reuse fixture digests');
  assert.equal(scriptDigests.size, 100, 'WAVE_100 cases must not reuse script digests');
  assert.equal(oracleDigests.size, 100, 'WAVE_100 cases must not reuse oracle digests');
  assert.equal(normalizedRows.size, 100, 'WAVE_100 denominator is 100 distinct executable normalized rows');
  assert.deepEqual(families, new Set(module.WORD_PHYSICAL_DIVERSITY_FAMILIES),
    'real WAVE_100 receipt must physically exercise all executable Word-edit families');
  assert.deepEqual(contentClasses, new Set(module.CONTENT_CLASSES),
    'real WAVE_100 receipt must physically exercise every executable content class');
  const validation = module.validateRungReceipt(plan, receipt, { expectedHeadSha: receipt.headSha });
  assert.equal(validation.ok, true, `real WAVE_100 receipt must validate: ${JSON.stringify(validation.reasons)}`);
  assert.ok((receipt.nonClaims || []).some((line) => String(line).includes('No saturation')),
    'WAVE_100 receipt must explicitly deny saturation/terminal promotion');
});

test('PHYS01-G04-real-16-112-wave300-receipt-validates-executable-diversity-seal', async () => {
  const module = await loadModule();
  assert.equal(fs.existsSync(WAVE300_RECEIPT_PATH), true, '16.112 WAVE_300 physical receipt must exist');
  const receipt = JSON.parse(fs.readFileSync(WAVE300_RECEIPT_PATH, 'utf8'));
  const plan = module.buildRungPlan('WAVE_300');
  assert.equal(plan.receiptRef, WAVE300_RECEIPT_REF);
  assert.equal(receipt.profileId, 'word-mac-16.112-26081010');
  assert.equal(receipt.rung, 'WAVE_300');
  assert.equal(receipt.status, 'PHYSICAL_WAVE_PASS');
  assert.equal(receipt.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN');
  assert.deepEqual(receipt.counters, { total: 300, passed: 300, failed: 0 });
  assert.equal(receipt.wordProfile.versionByBundle, '16.112');
  assert.equal(receipt.wordProfile.buildByBundle, '16.112.26081010');
  assert.equal(receipt.wordProfile.bundleId, 'com.microsoft.Word');
  assert.equal(receipt.wordProfile.teamIdentifier, 'UBF8T346G9');
  assert.ok(receipt.caseManifest && /^[0-9a-f]{64}$/u.test(receipt.manifestDigest),
    'WAVE_300 receipt must bind the normalized manifest digest');
  assert.ok(receipt.executableCaseManifest && /^[0-9a-f]{64}$/u.test(receipt.executableManifestDigest),
    'WAVE_300 receipt must bind executable fixture/script/oracle manifest digest');
  assert.equal(receipt.executableCaseManifest.manifestDigest, receipt.executableManifestDigest);
  assert.equal(module.evaluateDiversityOracle(receipt.cases).ok, true,
    'WAVE_300 normalized case manifest must satisfy full 300-wave diversity quotas');
  assert.equal(module.evaluateExecutableDiversityManifestForTest(receipt.executableCaseManifest).ok, true,
    'WAVE_300 executable case manifest must satisfy the harness-honesty oracle');
  const executionDigests = new Set(receipt.cases.map((entry) => entry.executionDigest));
  const fixtureDigests = new Set(receipt.cases.map((entry) => entry.fixtureDigest));
  const scriptDigests = new Set(receipt.cases.map((entry) => entry.scriptDigest));
  const oracleDigests = new Set(receipt.cases.map((entry) => entry.oracleDigest));
  const families = new Set(receipt.cases.map((entry) => entry.family));
  const contentClasses = new Set(receipt.cases.map((entry) => entry.contentClass));
  const normalizedRows = new Set(receipt.cases.map((entry) => JSON.stringify({
    family: entry.family,
    operationShape: entry.operationShape,
    contentClass: entry.contentClass,
  })));
  assert.equal(executionDigests.size, 300, 'WAVE_300 cases must not reuse execution digests');
  assert.equal(fixtureDigests.size, 300, 'WAVE_300 cases must not reuse fixture digests');
  assert.equal(scriptDigests.size, 300, 'WAVE_300 cases must not reuse script digests');
  assert.equal(oracleDigests.size, 300, 'WAVE_300 cases must not reuse oracle digests');
  assert.equal(normalizedRows.size, 300, 'WAVE_300 denominator is 300 distinct executable normalized rows');
  assert.deepEqual(families, new Set(module.WORD_PHYSICAL_DIVERSITY_FAMILIES),
    'real WAVE_300 receipt must physically exercise all executable Word-edit families');
  assert.deepEqual(contentClasses, new Set(module.CONTENT_CLASSES),
    'real WAVE_300 receipt must physically exercise every executable content class');
  const validation = module.validateRungReceipt(plan, receipt, { expectedHeadSha: receipt.headSha });
  assert.equal(validation.ok, true, `real WAVE_300 receipt must validate: ${JSON.stringify(validation.reasons)}`);
  assert.ok((receipt.nonClaims || []).some((line) => String(line).includes('No saturation')),
    'WAVE_300 receipt must explicitly deny saturation/terminal promotion');
});

// ===========================================================================
// PHYS-02 — owner-authorized provider migration to Word 16.112 build
// 16.112.26081010. This is repo-only/synthetic until the owner closes Word and
// installs the exact provider. Historical 16.111.3 receipts are not physical
// evidence for the 16.112 profile.
// ===========================================================================

test('PHYS02-01-provider-binding-migrated-to-16-112', async () => {
  const module = await loadModule();
  assert.equal(module.PHYS_PROFILE_ID, 'word-mac-16.112-26081010');
  assert.equal(module.PHYS_EXPECTED_WORD_VERSION, '16.112');
  assert.equal(module.PHYS_EXPECTED_WORD_BUILD, '16.112.26081010');
  assert.equal(module.PHYS_EXPECTED_BUNDLE_ID, 'com.microsoft.Word');
  assert.equal(module.PHYS_EXPECTED_TEAM_IDENTIFIER, 'UBF8T346G9');
  assert.ok(Object.isFrozen(module.PHYS_EXPECTED_SIGNATURE_AUTHORITIES), 'signature authority list must be exported frozen');
  assert.ok(module.PHYS_EXPECTED_SIGNATURE_AUTHORITIES.includes('Developer ID Application: Microsoft Corporation (UBF8T346G9)'));
  assert.equal(module.PHYS_PROVIDER_SOURCE_BINDING.microsoftLearnCurrentReleaseDate, '2026-08-11');
  assert.equal(module.PHYS_PROVIDER_SOURCE_BINDING.microsoftLearnCurrentVersion, '16.112');
  assert.equal(module.PHYS_PROVIDER_SOURCE_BINDING.microsoftLearnCurrentBuild, '26081010');
  assert.equal(module.PHYS_PROVIDER_SOURCE_BINDING.wordUpdatePackageSha256,
    'sha256:BAC312145A1733B904F36CF0D7DE2CF93E15AEBBC1F0D5665A72D887EB7C5997');
  assert.equal(module.SMOKE_RECEIPT_REF.includes('WORD_MAC_16_112_'), true,
    'new receipts must use 16.112 paths and never overwrite 16.111.3 evidence');
});

test('PHYS02-02-provider-identity-mismatch-fail-closed', async () => {
  const module = await loadModule();
  const wrongInstalledVersion = module.evaluatePhysGates(baseGateInput({
    probeWordPlist: () => ({
      version: '16.109.1',
      build: '16.109.26051717',
      bundleId: 'com.microsoft.Word',
      teamIdentifier: 'UBF8T346G9',
      signatureAuthorities: ['Developer ID Application: Microsoft Corporation (UBF8T346G9)'],
    }),
  }));
  assert.equal(wrongInstalledVersion.ok, false);
  assert.equal(wrongInstalledVersion.code, 'RTK_PHYS_WORD_VERSION_MISMATCH',
    'installed 16.109.1 must never satisfy the 16.112 physical gate');

  const historicalBuild = module.evaluatePhysGates(baseGateInput({
    probeWordPlist: () => ({
      version: '16.111.3',
      build: '16.111.26080215',
      bundleId: 'com.microsoft.Word',
      teamIdentifier: 'UBF8T346G9',
      signatureAuthorities: ['Developer ID Application: Microsoft Corporation (UBF8T346G9)'],
    }),
  }));
  assert.equal(historicalBuild.ok, false);
  assert.equal(historicalBuild.code, 'RTK_PHYS_WORD_VERSION_MISMATCH',
    'historical 16.111.3 physical evidence is non-transferable to 16.112');

  const wrongBundle = module.evaluatePhysGates(baseGateInput({
    probeWordPlist: () => ({
      version: '16.112',
      build: '16.112.26081010',
      bundleId: 'com.example.Word',
      teamIdentifier: 'UBF8T346G9',
      signatureAuthorities: ['Developer ID Application: Microsoft Corporation (UBF8T346G9)'],
    }),
  }));
  assert.equal(wrongBundle.ok, false);
  assert.equal(wrongBundle.code, 'RTK_PHYS_BUNDLE_ID_MISMATCH');

  const wrongTeam = module.evaluatePhysGates(baseGateInput({
    probeWordPlist: () => ({
      version: '16.112',
      build: '16.112.26081010',
      bundleId: 'com.microsoft.Word',
      teamIdentifier: 'NOT_MICROSOFT',
      signatureAuthorities: ['Developer ID Application: Microsoft Corporation (UBF8T346G9)'],
    }),
  }));
  assert.equal(wrongTeam.ok, false);
  assert.equal(wrongTeam.code, 'RTK_PHYS_TEAM_IDENTIFIER_MISMATCH');

  const wrongSignature = module.evaluatePhysGates(baseGateInput({
    probeWordPlist: () => ({
      version: '16.112',
      build: '16.112.26081010',
      bundleId: 'com.microsoft.Word',
      teamIdentifier: 'UBF8T346G9',
      signatureAuthorities: ['Developer ID Application: Example Corp (NOTMICROSOFT)'],
    }),
  }));
  assert.equal(wrongSignature.ok, false);
  assert.equal(wrongSignature.code, 'RTK_PHYS_SIGNATURE_AUTHORITY_MISMATCH');
});

test('PHYS02-03-prephysical-local-candidate-head-is-explicitly-bound', async () => {
  const module = await loadModule();
  const defaultStrict = module.evaluatePhysGates({
    ...baseGateInput({ gitHead: () => CANDIDATE_SHA, gitOriginMain: () => SHA }),
    expectedSha: CANDIDATE_SHA,
  });
  assert.equal(defaultStrict.ok, false, 'default physical evidence still requires merged HEAD == origin/main');
  assert.equal(defaultStrict.code, 'RTK_PHYS_SHA_MISMATCH');

  const allowedCandidate = module.evaluatePhysGates({
    ...baseGateInput({ gitHead: () => CANDIDATE_SHA, gitOriginMain: () => SHA }),
    expectedSha: CANDIDATE_SHA,
    expectedOriginMainSha: SHA,
    allowLocalCandidateHead: true,
  });
  assert.equal(allowedCandidate.ok, true, `explicit local candidate binding should pass: ${JSON.stringify(allowedCandidate.reasons)}`);

  const wrongBase = module.evaluatePhysGates({
    ...baseGateInput({ gitHead: () => CANDIDATE_SHA, gitOriginMain: () => 'c'.repeat(40) }),
    expectedSha: CANDIDATE_SHA,
    expectedOriginMainSha: SHA,
    allowLocalCandidateHead: true,
  });
  assert.equal(wrongBase.ok, false, 'local candidate evidence must also bind the exact origin/main base');
  assert.equal(wrongBase.code, 'RTK_PHYS_SHA_MISMATCH');
});

test('PHYS01-G05-real-16-112-wave300-repeat-receipt-validates-executable-repeat-seal', async () => {
  const module = await loadModule();
  const plan = module.buildRungPlan('WAVE_300_REPEAT');
  assert.equal(plan.receiptRef, WAVE300_REPEAT_RECEIPT_REF, 'WAVE_300_REPEAT must write the 16.112 repeat receipt path');
  assert.equal(fs.existsSync(WAVE300_REPEAT_RECEIPT_PATH), true,
    `WAVE_300_REPEAT receipt must exist before the rung can be claimed: ${WAVE300_REPEAT_RECEIPT_REF}`);

  const firstWave = JSON.parse(fs.readFileSync(WAVE300_RECEIPT_PATH, 'utf8'));
  const repeat = JSON.parse(fs.readFileSync(WAVE300_REPEAT_RECEIPT_PATH, 'utf8'));
  assert.equal(repeat.profileId, 'word-mac-16.112-26081010');
  assert.equal(repeat.rung, 'WAVE_300_REPEAT');
  assert.equal(repeat.status, 'PHYSICAL_WAVE_PASS');
  assert.equal(repeat.claimScope, 'DIVERSE_FAMILY_WAVE_PROVEN',
    'repeat proof re-executes the bound diverse-family manifest; it is still not saturation or terminal evidence');
  assert.deepEqual(repeat.counters, { total: 300, passed: 300, failed: 0 });
  assert.equal(repeat.manifestDigest, firstWave.manifestDigest,
    'repeat manifest digest must be exactly the first WAVE_300 manifest digest');
  assert.deepEqual(repeat.caseManifest, firstWave.caseManifest,
    'repeat receipt must embed the same first-wave manifest, not a self-authored digest-only claim');
  assert.ok(repeat.executableCaseManifest, 'repeat receipt must carry executable case manifest');
  assert.ok(repeat.executableManifestDigest, 'repeat receipt must carry executable manifest digest');
  const validation = module.validateRungReceipt(plan, repeat);
  assert.equal(validation.ok, true, `repeat receipt must validate: ${JSON.stringify(validation.reasons)}`);
  const binding = module.evaluateRepeatManifestBinding({
    manifest: firstWave.caseManifest,
    repeatSpecs: module.buildRepeatCaseSpecs(repeat.caseManifest),
  });
  assert.equal(binding.ok, true, `repeat manifest binding must pass: ${JSON.stringify(binding.reasons)}`);
  assert.ok((repeat.nonClaims || []).some((line) => String(line).includes('No saturation')),
    'repeat receipt must explicitly deny saturation/terminal promotion');
});

test('PHYS01-G06-real-16-112-saturation-limitation-audit-receipt-validates-complete-not-saturated', async () => {
  const module = await loadModule();
  const plan = module.buildRungPlan('SATURATION_LIMITATION_AUDIT');
  assert.equal(plan.receiptRef, SATURATION_LIMITATION_AUDIT_RECEIPT_REF,
    'SATURATION_LIMITATION_AUDIT must write the 16.112 limitation-audit receipt path');
  assert.equal(fs.existsSync(SATURATION_LIMITATION_AUDIT_RECEIPT_PATH), true,
    `SATURATION_LIMITATION_AUDIT receipt must exist before the audit can be claimed: ${SATURATION_LIMITATION_AUDIT_RECEIPT_REF}`);

  const receipt = JSON.parse(fs.readFileSync(SATURATION_LIMITATION_AUDIT_RECEIPT_PATH, 'utf8'));
  assert.equal(receipt.schema, 'yalken.rtk.word-mac-16-112.saturation-limitation-audit-receipt.v1');
  assert.equal(receipt.profileId, 'word-mac-16.112-26081010');
  assert.equal(receipt.rung, 'SATURATION_LIMITATION_AUDIT');
  assert.equal(receipt.status, 'COMPLETE_NOT_SATURATED');
  assert.match(receipt.headSha, /^[a-f0-9]{40}$/u, 'audit receipt binds an exact clean candidate head');
  assert.deepEqual(receipt.auditedReceipts, [
    WAVE10_RECEIPT_REF,
    WAVE40_RECEIPT_REF,
    WAVE100_RECEIPT_REF,
    WAVE300_RECEIPT_REF,
    WAVE300_REPEAT_RECEIPT_REF,
  ], 'audit must bind exactly the five committed wave/repeat receipts');
  assert.equal(receipt.audit.ok, true, `audit verdict must be green: ${JSON.stringify(receipt.audit.reasons)}`);
  assert.equal(receipt.audit.status, 'COMPLETE_NOT_SATURATED');
  assert.ok(receipt.audit.status !== 'SATURATED', 'the audit receipt can never promote the profile to SATURATED');
  assert.equal(JSON.stringify(receipt).includes('WORD_TERMINAL_PASS_ACHIEVED'), false,
    'limitation audit receipt must not contain a terminal PASS claim');
  assert.match(sha256File(SATURATION_LIMITATION_AUDIT_RECEIPT_PATH), /^sha256:[a-f0-9]{64}$/u);
});
