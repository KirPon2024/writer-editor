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

// ===========================================================================
// PHYS-01B — full ladder rungs. The runner knows all nine rungs; each rung has
// a pinned kind, case count, receipt schema and a distinct build-bound receipt
// path; the saturation audit is fail-closed and can never produce SATURATED.
// ===========================================================================

function passWaveCase(rung, i) {
  return {
    caseId: `${rung.toLowerCase()}-case-${i + 1}`,
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

function sealedWaveReceipt(rung, count, overrides = {}) {
  return {
    schema: `yalken.rtk.word-mac-16-111-3.${rung.toLowerCase().replace(/_/g, '-')}-receipt.v1`,
    profileId: 'word-mac-16.111.3-26080215',
    rung,
    status: 'PHYSICAL_WAVE_PASS',
    headSha: 'a'.repeat(40),
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
    assert.ok(defs[rung].receiptRef.includes('16_111_3'), `${rung} receipt path must be build-bound`);
  }
  const refs = Object.values(defs).filter((d) => d.receiptRef).map((d) => d.receiptRef);
  assert.equal(new Set(refs).size, refs.length, 'receipt paths must be distinct (no cross-rung overwrite)');
  for (const ref of refs) {
    assert.ok(!ref.includes('WAVE40_RECEIPT') || ref.includes('16_111_3'), 'never the 16.111.2-bound receipt path');
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
  const receiptsByRung = {
    WAVE_10: sealedWaveReceipt('WAVE_10', 10),
    WAVE_40: sealedWaveReceipt('WAVE_40', 40),
    WAVE_100: sealedWaveReceipt('WAVE_100', 100),
    WAVE_300: sealedWaveReceipt('WAVE_300', 300),
    WAVE_300_REPEAT: sealedWaveReceipt('WAVE_300_REPEAT', 300),
  };
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
  const badWave = sealedWaveReceipt('WAVE_100', 100);
  badWave.counters.failed = 1;
  const receiptsByRung = {
    WAVE_10: sealedWaveReceipt('WAVE_10', 10),
    WAVE_40: sealedWaveReceipt('WAVE_40', 40),
    WAVE_100: badWave,
    WAVE_300: sealedWaveReceipt('WAVE_300', 300),
    WAVE_300_REPEAT: sealedWaveReceipt('WAVE_300_REPEAT', 300),
  };
  const result = module.evaluateSaturationAudit({ receiptsByRung });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RTK_PHYS_AUDIT_VETO_NONZERO');
});

// P20: a receipt claiming SATURATED fails the audit as a false saturation claim.
test('PHYS01-P20-audit-false-saturation', async () => {
  const module = await loadModule();
  const lying = sealedWaveReceipt('WAVE_300', 300, { status: 'SATURATED' });
  const receiptsByRung = {
    WAVE_10: sealedWaveReceipt('WAVE_10', 10),
    WAVE_40: sealedWaveReceipt('WAVE_40', 40),
    WAVE_100: sealedWaveReceipt('WAVE_100', 100),
    WAVE_300: lying,
    WAVE_300_REPEAT: sealedWaveReceipt('WAVE_300_REPEAT', 300),
  };
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
