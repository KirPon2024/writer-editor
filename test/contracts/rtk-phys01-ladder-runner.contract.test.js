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

// P26: the audit plan binds exactly the five wave receipt refs of this profile.
test('PHYS01-P26-audit-plan-binding', async () => {
  const module = await loadModule();
  const plan = module.buildAuditPlan();
  assert.deepEqual(plan.requiredRungs, ['WAVE_10', 'WAVE_40', 'WAVE_100', 'WAVE_300', 'WAVE_300_REPEAT']);
  for (const ref of plan.receiptRefs) {
    assert.ok(ref.includes('16_111_3'), `audit receipt ref must be build-bound: ${ref}`);
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
