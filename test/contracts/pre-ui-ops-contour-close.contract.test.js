const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    modulePromise = import(pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/pre-ui-ops-contour-close-state.mjs'),
    ).href);
  }
  return modulePromise;
}

const MATCHED_SHA = '8b1068d88a23f1ae1c09712234974a69e27d99d4';
const OTHER_SHA = '9b1068d88a23f1ae1c09712234974a69e27d99d4';

function createBaseRecord() {
  return {
    schemaVersion: 'v1',
    closedAtUtc: '2026-02-17T03:32:44Z',
    closedBy: 'ticket:TZ_CLOSE_PRE_UI_OPS_CONTOUR_v1',
    headSha: MATCHED_SHA,
    originMainSha: MATCHED_SHA,
    prs: ['#182', '#183'],
    evidence: {
      strictDoctorOk: 1,
      strictOpsSummaryOk: 1,
      truthTableHasTokensOk: 1,
    },
    requiredTokens: [
      'WAVE_INPUT_HASH_PRESENT',
      'WAVE_TTL_VALID',
      'WAVE_RESULT_STALE==0',
      'STAGE_ACTIVATION_OK',
      'WAVE_FRESHNESS_OK',
      'COMMAND_SURFACE_SINGLE_ENTRY_OK',
      'COMMAND_SURFACE_BYPASS_NEGATIVE_TESTS_OK',
      'PATH_BOUNDARY_GUARD_OK',
      'DEPENDENCY_REMEDIATION_POLICY_OK',
      'HEAD_STRICT_OK',
      'REMOTE_BINDING_OK',
      'GOVERNANCE_STRICT_OK',
      'DRIFT_UNRESOLVED_P0_COUNT==0',
    ],
    notes: 'Contract fixture',
  };
}

function createBaseTokenValues() {
  return {
    WAVE_INPUT_HASH_PRESENT: 1,
    WAVE_TTL_VALID: 1,
    WAVE_RESULT_STALE: 0,
    STAGE_ACTIVATION_OK: 1,
    WAVE_FRESHNESS_OK: 1,
    COMMAND_SURFACE_SINGLE_ENTRY_OK: 1,
    COMMAND_SURFACE_BYPASS_NEGATIVE_TESTS_OK: 1,
    PATH_BOUNDARY_GUARD_OK: 1,
    DEPENDENCY_REMEDIATION_POLICY_OK: 1,
    HEAD_STRICT_OK: 1,
    REMOTE_BINDING_OK: 1,
    GOVERNANCE_STRICT_OK: 1,
    DRIFT_UNRESOLVED_P0_COUNT: 0,
  };
}

test('pre-ui ops contour close: positive', async () => {
  const { evaluatePreUiOpsContourCloseState } = await loadModule();
  const state = evaluatePreUiOpsContourCloseState({
    recordExists: true,
    recordDoc: createBaseRecord(),
    currentHeadSha: MATCHED_SHA,
    currentOriginMainSha: MATCHED_SHA,
    worktreePorcelain: '',
    tokenValues: createBaseTokenValues(),
  });

  assert.equal(state.PRE_UI_OPS_CONTOUR_RECORD_VALID_OK, 1);
  assert.equal(state.PRE_UI_OPS_CONTOUR_CLOSED_OK, 1);
  assert.equal(state.failSignal, '');
  assert.equal(state.ok, true);
});

// scenario id: missing-record-negative
test('pre-ui ops contour close: missing record -> E_PRE_UI_CONTOUR_RECORD_MISSING', async () => {
  const { evaluatePreUiOpsContourCloseState } = await loadModule();
  const state = evaluatePreUiOpsContourCloseState({
    recordExists: false,
    currentHeadSha: MATCHED_SHA,
    currentOriginMainSha: MATCHED_SHA,
    worktreePorcelain: '',
    tokenValues: createBaseTokenValues(),
  });

  assert.equal(state.PRE_UI_OPS_CONTOUR_RECORD_VALID_OK, 0);
  assert.equal(state.PRE_UI_OPS_CONTOUR_CLOSED_OK, 0);
  assert.equal(state.failSignal, 'E_PRE_UI_CONTOUR_RECORD_MISSING');
});

// scenario id: invalid-shape-negative
test('pre-ui ops contour close: invalid shape -> E_PRE_UI_CONTOUR_RECORD_INVALID', async () => {
  const { evaluatePreUiOpsContourCloseState } = await loadModule();
  const record = createBaseRecord();
  delete record.requiredTokens;
  const state = evaluatePreUiOpsContourCloseState({
    recordExists: true,
    recordDoc: record,
    currentHeadSha: MATCHED_SHA,
    currentOriginMainSha: MATCHED_SHA,
    worktreePorcelain: '',
    tokenValues: createBaseTokenValues(),
  });

  assert.equal(state.PRE_UI_OPS_CONTOUR_RECORD_VALID_OK, 0);
  assert.equal(state.PRE_UI_OPS_CONTOUR_CLOSED_OK, 0);
  assert.equal(state.failSignal, 'E_PRE_UI_CONTOUR_RECORD_INVALID');
});

// scenario id: head-origin-mismatch-negative
test('pre-ui ops contour close: head mismatch -> E_PRE_UI_CONTOUR_HEAD_ORIGIN_MISMATCH', async () => {
  const { evaluatePreUiOpsContourCloseState } = await loadModule();
  const state = evaluatePreUiOpsContourCloseState({
    recordExists: true,
    recordDoc: createBaseRecord(),
    currentHeadSha: MATCHED_SHA,
    currentOriginMainSha: OTHER_SHA,
    worktreePorcelain: '',
    tokenValues: createBaseTokenValues(),
  });

  assert.equal(state.PRE_UI_OPS_CONTOUR_RECORD_VALID_OK, 1);
  assert.equal(state.PRE_UI_OPS_CONTOUR_CLOSED_OK, 0);
  assert.equal(state.failSignal, 'E_PRE_UI_CONTOUR_HEAD_ORIGIN_MISMATCH');
});

// scenario id: dirty-worktree-negative
test('pre-ui ops contour close: dirty worktree -> E_PRE_UI_CONTOUR_DIRTY_WORKTREE', async () => {
  const { evaluatePreUiOpsContourCloseState } = await loadModule();
  const state = evaluatePreUiOpsContourCloseState({
    recordExists: true,
    recordDoc: createBaseRecord(),
    currentHeadSha: MATCHED_SHA,
    currentOriginMainSha: MATCHED_SHA,
    worktreePorcelain: ' M scripts/ops/freeze-rollups-state.mjs\n',
    tokenValues: createBaseTokenValues(),
  });

  assert.equal(state.PRE_UI_OPS_CONTOUR_RECORD_VALID_OK, 1);
  assert.equal(state.PRE_UI_OPS_CONTOUR_CLOSED_OK, 0);
  assert.equal(state.failSignal, 'E_PRE_UI_CONTOUR_DIRTY_WORKTREE');
});

// scenario id: required-token-missing-negative
test('pre-ui ops contour close: missing required token -> E_PRE_UI_CONTOUR_REQUIRED_TOKENS_MISSING', async () => {
  const { evaluatePreUiOpsContourCloseState } = await loadModule();
  const tokenValues = createBaseTokenValues();
  delete tokenValues.REMOTE_BINDING_OK;
  const state = evaluatePreUiOpsContourCloseState({
    recordExists: true,
    recordDoc: createBaseRecord(),
    currentHeadSha: MATCHED_SHA,
    currentOriginMainSha: MATCHED_SHA,
    worktreePorcelain: '',
    tokenValues,
  });

  assert.equal(state.PRE_UI_OPS_CONTOUR_RECORD_VALID_OK, 1);
  assert.equal(state.PRE_UI_OPS_CONTOUR_CLOSED_OK, 0);
  assert.equal(state.failSignal, 'E_PRE_UI_CONTOUR_REQUIRED_TOKENS_MISSING');
});

// scenario id: required-token-fail-negative
test('pre-ui ops contour close: failed required token -> E_PRE_UI_CONTOUR_REQUIRED_TOKENS_FAIL', async () => {
  const { evaluatePreUiOpsContourCloseState } = await loadModule();
  const tokenValues = createBaseTokenValues();
  tokenValues.PATH_BOUNDARY_GUARD_OK = 0;
  const state = evaluatePreUiOpsContourCloseState({
    recordExists: true,
    recordDoc: createBaseRecord(),
    currentHeadSha: MATCHED_SHA,
    currentOriginMainSha: MATCHED_SHA,
    worktreePorcelain: '',
    tokenValues,
  });

  assert.equal(state.PRE_UI_OPS_CONTOUR_RECORD_VALID_OK, 1);
  assert.equal(state.PRE_UI_OPS_CONTOUR_CLOSED_OK, 0);
  assert.equal(state.failSignal, 'E_PRE_UI_CONTOUR_REQUIRED_TOKENS_FAIL');
});

test('pre-ui ops contour close: deterministic output for identical input', async () => {
  const { evaluatePreUiOpsContourCloseState } = await loadModule();
  const input = {
    recordExists: true,
    recordDoc: createBaseRecord(),
    currentHeadSha: MATCHED_SHA,
    currentOriginMainSha: MATCHED_SHA,
    worktreePorcelain: '',
    tokenValues: createBaseTokenValues(),
  };
  const runA = evaluatePreUiOpsContourCloseState(input);
  const runB = evaluatePreUiOpsContourCloseState(input);
  assert.deepEqual(runA, runB);
});
