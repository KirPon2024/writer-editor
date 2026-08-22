'use strict';

// R2.4 W0 Word physical recertification tests: the stale zsh Accessibility
// blocker is reclassified to caller-bound probe routing only when Hammerspoon
// Accessibility is owner-enabled, while C1 route PASS and product apply
// authority remain denied.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'word-physical-recertification-w0.mjs');
const CANARY_PATH = path.join(ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs');
const DAG_PATH = path.join(ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const RECEIPT_PATH = path.join(ROOT, 'docs', 'OPS', 'RTK', 'YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1.json');
const MATRIX_PATH = path.join(ROOT, 'docs', 'OPS', 'RTK', 'YALKEN_INTEROP_CHAIN_MATRIX_V1.json');
const W0_RECEIPT_PATH = path.join(ROOT, 'docs', 'OPS', 'RTK', 'YALKEN_R24_W0_WORD_PHYSICAL_RECERTIFICATION_RECEIPT_V1.json');
const HEAD = 'a'.repeat(40);
const ORIGIN = 'b'.repeat(40);

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

async function loadCanary() {
  return import(pathToFileURL(CANARY_PATH).href);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function input(overrides = {}) {
  return {
    programDag: overrides.programDag || loadJson(DAG_PATH),
    c1Receipt: overrides.c1Receipt || loadJson(RECEIPT_PATH),
    chainMatrix: overrides.chainMatrix || loadJson(MATRIX_PATH),
    physicalReceipt: overrides.physicalReceipt || loadJson(W0_RECEIPT_PATH),
    repoState: overrides.repoState || { headSha: HEAD, originMainSha: ORIGIN, treeSha: 'c'.repeat(40), dirty: false },
    expectedHeadSha: overrides.expectedHeadSha || HEAD,
    expectedOriginMainSha: overrides.expectedOriginMainSha === undefined ? ORIGIN : overrides.expectedOriginMainSha,
    claimRequest: overrides.claimRequest,
  };
}

test('W0 compiles Word profile NOT_READY from Hammerspoon caller-route reclassification only', async () => {
  const w0 = await loadModule();
  const result = w0.evaluateWordPhysicalRecertification(input());

  assert.equal(result.ok, true);
  assert.equal(result.code, 'R24_W0_WORD_PHYSICAL_RECERTIFICATION_COMPILED');
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.stageId, 'W0_WORD_PHYSICAL_RECERTIFICATION');
  assert.equal(result.profileVerdict.profileId, 'WORD_ROUNDTRIP');
  assert.equal(result.profileVerdict.currentVerdict, 'NOT_READY');
  assert.equal(result.profileVerdict.claimCeiling, 'WORD_TESTED_DENOMINATOR_ONLY');
  assert.equal(result.profileVerdict.routePassClaim, false);
  assert.equal(result.profileVerdict.productApplyAuthority, false);
  assert.equal(result.profileVerdict.wordTerminalPass, false);
  assert.equal(result.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.hammerspoonRoute.accessibilityState, true);
  assert.equal(result.hammerspoonRoute.physicalReceiptId, 'YALKEN_R24_W0_WORD_PHYSICAL_RECERTIFICATION_RECEIPT_V1');
  assert.equal(result.hammerspoonRoute.legacyUiElementsAuthority, 'ADVISORY_ONLY_CALLER_SPECIFIC');
  assert.equal(result.hammerspoonRoute.zshSystemEventsUiElementsEnabled, false);
  assert.equal(result.hammerspoonRoute.wordProcessNotRunningPermissionDenial, false);
  assert.deepEqual(result.c1Route.activeBlockers, [
    'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_BLOCKER',
    'C1_WORD_ROUND01_APPLY_LIFECYCLE_REUSE_GATE_BLOCKER',
    'C1_WORD_ROUND01_EXACT_LEDGER_BINDING_REPAIR_MERGED_NOT_ROUTE_PASS',
  ]);
  assert.equal(result.nonClaims.includes('NO_SAFE_APPLY_EXPANSION'), true);
  assert.equal(result.nonClaims.includes('NO_USER_WORD_DOCUMENT_ACCESS'), true);
  assert.equal(result.physicalReceipt.status, 'BOUND');
  assert.equal(result.physicalReceipt.runner, 'hammerspoon');
  assert.equal(result.physicalReceipt.directAxCapabilityProven, true);

  console.log(`R24_W0_COMPILER_RECEIPT=${JSON.stringify({
    verdict: result.verdict,
    profile: result.profileVerdict.profileId,
    currentVerdict: result.profileVerdict.currentVerdict,
    hammerspoon: result.hammerspoonRoute.accessibilityState,
    route: result.c1Route.routeVerdict,
  })}`);
});

test('W0 rejects physical receipt drift and user-document laundering', async () => {
  const w0 = await loadModule();
  const runnerDrift = loadJson(W0_RECEIPT_PATH);
  runnerDrift.physicalRunner.runner = 'osascript';
  const badRunner = w0.evaluateWordPhysicalRecertification(input({ physicalReceipt: runnerDrift }));
  assert.equal(badRunner.ok, false);
  assert.equal(badRunner.code, 'E_R24_W0_PHYSICAL_RECEIPT_RUNNER');

  const userDocs = loadJson(W0_RECEIPT_PATH);
  userDocs.disposableArtifact.userDocumentsTouched = true;
  const userDocResult = w0.evaluateWordPhysicalRecertification(input({ physicalReceipt: userDocs }));
  assert.equal(userDocResult.ok, false);
  assert.equal(userDocResult.code, 'E_R24_W0_PHYSICAL_RECEIPT_USER_DOC_BOUNDARY');

  const overclaim = loadJson(W0_RECEIPT_PATH);
  overclaim.result.safeApplyExpansion = true;
  const overclaimResult = w0.evaluateWordPhysicalRecertification(input({ physicalReceipt: overclaim }));
  assert.equal(overclaimResult.ok, false);
  assert.equal(overclaimResult.code, 'E_R24_W0_PHYSICAL_RECEIPT_OVERCLAIM');
});

test('W0 rejects stale or dirty exact-head evidence', async () => {
  const w0 = await loadModule();
  const stale = w0.evaluateWordPhysicalRecertification(input({
    repoState: { headSha: 'd'.repeat(40), originMainSha: ORIGIN, treeSha: 'c'.repeat(40), dirty: false },
  }));
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'E_R24_W0_EXACT_HEAD_MISMATCH');

  const dirty = w0.evaluateWordPhysicalRecertification(input({
    repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: 'c'.repeat(40), dirty: true },
  }));
  assert.equal(dirty.ok, false);
  assert.equal(dirty.code, 'E_R24_W0_WORKTREE_DIRTY');
});

test('W0 rejects legacy permission blocker laundering and missing Hammerspoon authority', async () => {
  const w0 = await loadModule();
  const receipt = loadJson(RECEIPT_PATH);
  const old = receipt.failureClassification.find((row) => row.id === 'C1_WORD_MACOS_ACCESSIBILITY_PERMISSION_REQUIRED_CURRENT_BLOCKER');
  old.disposition = 'ACTIVE_RUNTIME_PRECONDITION_BLOCKER_NOT_ROUTE_PASS';
  const activeOld = w0.evaluateWordPhysicalRecertification(input({ c1Receipt: receipt }));
  assert.equal(activeOld.ok, false);
  assert.equal(activeOld.code, 'E_R24_W0_LEGACY_PERMISSION_BLOCKER_NOT_RECLASSIFIED');

  const noHammerspoon = loadJson(RECEIPT_PATH);
  noHammerspoon.physicalEvidence.postExactLedgerRepairRebind.currentRuntimePrecondition.hammerspoonAccessibilityState = false;
  const disabled = w0.evaluateWordPhysicalRecertification(input({ c1Receipt: noHammerspoon }));
  assert.equal(disabled.ok, false);
  assert.equal(disabled.code, 'E_R24_W0_PRECONDITION_HAMMERSPOON_ACCESSIBILITY_STATE');

  const badAuthority = loadJson(RECEIPT_PATH);
  badAuthority.physicalEvidence.postExactLedgerRepairRebind.currentRuntimePrecondition.legacyUiElementsAuthority = 'AUTHORITATIVE';
  const authority = w0.evaluateWordPhysicalRecertification(input({ c1Receipt: badAuthority }));
  assert.equal(authority.ok, false);
  assert.equal(authority.code, 'E_R24_W0_PRECONDITION_LEGACY_UI_ELEMENTS_AUTHORITY');
});

test('W0 rejects route pass, apply authority, replay overclaim, user docs, and stale matrix blockers', async () => {
  const w0 = await loadModule();
  const routePass = loadJson(RECEIPT_PATH);
  routePass.route.routeVerdict = 'PASS';
  assert.equal(w0.evaluateWordPhysicalRecertification(input({ c1Receipt: routePass })).code, 'E_R24_W0_C1_ROUTE_PASS_FORBIDDEN');

  const apply = loadJson(RECEIPT_PATH);
  apply.physicalEvidence.postExactLedgerRepairRebind.productApplyAuthority = true;
  assert.equal(w0.evaluateWordPhysicalRecertification(input({ c1Receipt: apply })).code, 'E_R24_W0_REBIND_OVERCLAIM');

  const replay = loadJson(RECEIPT_PATH);
  replay.physicalEvidence.postExactLedgerRepairRebind.executedFreshPhysicalReplayAfterRepair = true;
  assert.equal(w0.evaluateWordPhysicalRecertification(input({ c1Receipt: replay })).code, 'E_R24_W0_REBIND_OVERCLAIM');

  const userDocs = loadJson(RECEIPT_PATH);
  userDocs.authority.userDocumentsRead = 1;
  assert.equal(w0.evaluateWordPhysicalRecertification(input({ c1Receipt: userDocs })).code, 'E_R24_W0_USER_DOCUMENT_AUTHORITY');

  const matrix = loadJson(MATRIX_PATH);
  matrix.routeDenominator.find((row) => row.routeId === 'C1').blockerEvidenceRefs.push('C1_WORD_MACOS_ACCESSIBILITY_PERMISSION_REQUIRED_CURRENT_BLOCKER');
  assert.equal(w0.evaluateWordPhysicalRecertification(input({ chainMatrix: matrix })).code, 'E_R24_W0_MATRIX_LEGACY_PERMISSION_BLOCKER_STILL_ACTIVE');
});

test('W0 rejects external overclaim requests', async () => {
  const w0 = await loadModule();
  for (const [field, code] of [
    ['programPass', 'E_R24_W0_PROGRAM_PASS_FORBIDDEN'],
    ['wordTerminalPass', 'E_R24_W0_WORD_TERMINAL_PASS_FORBIDDEN'],
    ['routePass', 'E_R24_W0_ROUTE_PASS_FORBIDDEN'],
    ['productApplyAuthority', 'E_R24_W0_PRODUCT_APPLY_AUTHORITY_FORBIDDEN'],
    ['safeApplyExpansion', 'E_R24_W0_SAFE_APPLY_EXPANSION_FORBIDDEN'],
    ['userDocumentsAllowed', 'E_R24_W0_USER_DOCUMENTS_FORBIDDEN'],
    ['googleDocsTransfer', 'E_R24_W0_GOOGLE_TRANSFER_FORBIDDEN'],
    ['releaseReady', 'E_R24_W0_RELEASE_READY_FORBIDDEN'],
  ]) {
    const result = w0.evaluateWordPhysicalRecertification(input({ claimRequest: { [field]: true } }));
    assert.equal(result.ok, false, field);
    assert.equal(result.code, code, field);
  }
});

test('W0 Hammerspoon preflight runner keeps zsh UI-elements scalar advisory-only', async () => {
  const canary = await loadCanary();
  const appleScript = canary.buildMacosAccessibilityPreflightScript('/tmp/w0-disposable.docx');
  const lua = canary.buildHammerspoonAccessibilityPreflightCommand(appleScript);
  assert.match(lua, /hs\.osascript\.applescript/u);
  assert.match(lua, /HAMMERSPOON_APPLESCRIPT_FAILED/u);

  const calls = [];
  const result = canary.runMacosAccessibilityPreflight({
    runner: 'hammerspoon',
    expectedFrontDocumentFullName: '/tmp/w0-disposable.docx',
    hammerspoonPath: '/opt/homebrew/bin/hs',
    execFileSyncImpl(command, args) {
      calls.push({ command, args });
      if (String(args.join('\n')).includes('hs.accessibilityState')) return 'true\n';
      return [
        'LEGACY_UI_ELEMENTS_ENABLED=false',
        'WORD_PROCESS_EXISTS=true',
        'WORD_FRONTMOST=true',
        'WORD_WINDOW_COUNT=1',
        'AX_QUERY_SUCCEEDED=true',
        'AX_MENU_BAR_ITEM_COUNT=10',
        'AX_WINDOW_SUBTREE_ITEM_COUNT=4',
        'DIRECT_AX_CAPABILITY_PROVEN=true',
        'AX_ERROR_NUMBER=0',
        'AX_ERROR_MESSAGE=',
        'FRONT_DOCUMENT_FULL_NAME=/tmp/w0-disposable.docx',
        'EXPECTED_FRONT_DOCUMENT_FULL_NAME=/tmp/w0-disposable.docx',
      ].join('\n');
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, '/opt/homebrew/bin/hs');
  assert.equal(calls[1].command, '/opt/homebrew/bin/hs');
  assert.equal(result.ok, true);
  assert.equal(result.code, 'MACOS_ACCESSIBILITY_PREFLIGHT_READY');
  assert.equal(result.diagnostics.runner, 'hammerspoon');
  assert.equal(result.diagnostics.hammerspoonAccessibilityState, true);
  assert.equal(result.diagnostics.legacyUiElementsEnabled, false);
  assert.equal(result.diagnostics.legacyUiElementsAuthority, 'ADVISORY_ONLY_CALLER_SPECIFIC');
  assert.equal(result.diagnostics.directAxCapabilityProven, true);
});
