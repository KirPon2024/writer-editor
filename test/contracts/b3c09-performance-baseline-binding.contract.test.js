const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'b3c09-performance-baseline-binding-state.mjs');
const STATUS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'B3C09_PERFORMANCE_BASELINE_BINDING_STATUS_V1.json');

let modulePromise = null;
let defaultStatePromise = null;

function loadModule() {
  if (!modulePromise) modulePromise = import(pathToFileURL(MODULE_PATH).href);
  return modulePromise;
}

function loadDefaultState() {
  if (!defaultStatePromise) {
    defaultStatePromise = loadModule().then(({ evaluateB3C09PerformanceBaselineBindingState }) => (
      evaluateB3C09PerformanceBaselineBindingState({ repoRoot: REPO_ROOT })
    ));
  }
  return defaultStatePromise;
}

function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}

test('b3c09 performance baseline: state artifact equals executable state', async () => {
  const { TOKEN_NAME, PERF_TOKEN_NAME, PROVISIONAL_TOKEN_NAME } = await loadModule();
  const state = await loadDefaultState();
  const committedState = readJson(STATUS_PATH);

  assert.equal(committedState.artifactId, state.artifactId);
  assert.equal(committedState.contourId, state.contourId);
  assert.equal(committedState.status, state.status);
  assert.equal(committedState[TOKEN_NAME], state[TOKEN_NAME]);
  assert.equal(committedState[PERF_TOKEN_NAME], state[PERF_TOKEN_NAME]);
  assert.equal(committedState[PROVISIONAL_TOKEN_NAME], state[PROVISIONAL_TOKEN_NAME]);
  assert.deepEqual(committedState.unsupportedRows, state.unsupportedRows);
  assert.deepEqual(committedState.thresholds, state.thresholds);
  assert.deepEqual(committedState.scope, state.scope);
  assert.equal(committedState.proof.provisionalGapRecorded, state.proof.provisionalGapRecorded);
  assert.equal(committedState.proof.fullPerfBaselineGreen, state.proof.fullPerfBaselineGreen);
  assert.equal(committedState.runtime.changedBasenamesHash, state.runtime.changedBasenamesHash);
  assert.equal(state.ok, true, JSON.stringify(state, null, 2));
  assert.equal(state.status, 'PROVISIONAL_GAP');
  assert.equal(state[TOKEN_NAME], 1);
  assert.equal(state[PERF_TOKEN_NAME], 0);
  assert.equal(state[PROVISIONAL_TOKEN_NAME], 1);
  assert.deepEqual(state.failRows, []);
  assert.equal(state.repo.repoRootBinding, 'WORKTREE_INDEPENDENT');
  assert.equal(state.runtime.commandResults.status, 'DECLARED_FOR_EXTERNAL_RUNNER');
  assert.equal(state.runtime.commandResults.selfExecuted, false);
  assert.equal(state.runtime.commandResults.allPassed, null);
});

test('b3c09 performance baseline: CLI status remains worktree independent outside repo cwd', () => {
  const result = spawnSync(process.execPath, [MODULE_PATH, '--json'], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);

  const state = JSON.parse(result.stdout);
  assert.equal(state.ok, true, JSON.stringify(state, null, 2));
  assert.equal(state.status, 'PROVISIONAL_GAP');
  assert.equal(state.B3C09_PERFORMANCE_BASELINE_BINDING_OK, 1);
  assert.equal(state.PERF_BASELINE_OK, 0);
  assert.equal(state.B3C09_PROVISIONAL_PERF_GAP, 1);
  assert.deepEqual(state.failRows, []);
  assert.equal(state.repo.repoRootBinding, 'WORKTREE_INDEPENDENT');
});

test('b3c09 performance baseline: binds B3C02 through B3C08 input statuses', async () => {
  const state = await loadDefaultState();

  assert.equal(state.proof.inputStatusesBound, true);
  assert.equal(state.proof.existingPerfStateReused, true);
  assert.equal(state.proof.existingPerfLiteReused, true);
  assert.equal(state.measurements.perfState.PERF_BASELINE_OK, 1);
  assert.equal(state.measurements.perfLite.status, 'PASS');
});

test('b3c09 performance baseline: records exact unsupported rows instead of false PERF_BASELINE_OK', async () => {
  const state = await loadDefaultState();
  const unsupportedIds = state.unsupportedRows.map((row) => row.id).sort();

  assert.deepEqual(unsupportedIds, ['EXPORT_DOCX_P95_MS', 'SCENE_SWITCH_P95_MS']);
  assert.equal(state.proof.provisionalGapRecorded, true);
  assert.equal(state.proof.fullPerfBaselineGreen, false);
  assert.equal(state.PERF_BASELINE_OK, 0);
});

test('b3c09 performance baseline: measured tier zero rows stay below declared thresholds', async () => {
  const state = await loadDefaultState();
  const measuredRows = state.p95Rows.filter((row) => row.supported === true);

  assert.ok(measuredRows.length >= 4);
  for (const row of measuredRows) {
    assert.equal(row.passed, true, `${row.id} must pass threshold`);
    assert.equal(Number.isFinite(Number(row.value)), true);
    assert.ok(Number(row.value) <= Number(row.threshold), `${row.id} ${row.value} > ${row.threshold}`);
  }
  assert.equal(state.hotPathRows[0].passed, true);
});

test('b3c09 performance baseline: threshold breach is blocking fail', async () => {
  const { evaluateB3C09PerformanceBaselineBindingState } = await loadModule();
  const state = await evaluateB3C09PerformanceBaselineBindingState({
    repoRoot: REPO_ROOT,
    perfLite: {
      status: 'PASS',
      metrics: {
        openP95Ms: 1001,
        typeBurstP95Ms: 1,
        saveP95Ms: 1,
      },
    },
    perfState: {
      PERF_BASELINE_OK: 1,
      HOTPATH_POLICY_OK: 1,
    },
    memoryPeakMb: 1,
  });

  assert.equal(state.ok, false);
  assert.equal(state.status, 'FAIL');
  assert.equal(state.failRows.includes('OPEN_P95_MS_THRESHOLD_CHECK'), true);
  assert.equal(state.failSignal, 'E_B3C09_PERFORMANCE_BASELINE_NOT_OK');
});

test('b3c09 performance baseline: hot path policy failure is blocking fail', async () => {
  const { evaluateB3C09PerformanceBaselineBindingState } = await loadModule();
  const state = await evaluateB3C09PerformanceBaselineBindingState({
    repoRoot: REPO_ROOT,
    perfLite: {
      status: 'PASS',
      metrics: {
        openP95Ms: 1,
        typeBurstP95Ms: 1,
        saveP95Ms: 1,
      },
    },
    perfState: {
      PERF_BASELINE_OK: 1,
      HOTPATH_POLICY_OK: 0,
    },
    memoryPeakMb: 1,
  });

  assert.equal(state.ok, false);
  assert.equal(state.status, 'FAIL');
  assert.equal(state.failRows.includes('HOT_PATH_SOURCE_SCAN_NOT_OK'), true);
});

test('b3c09 performance baseline: scope flags reject release and layer drift', async () => {
  const state = await loadDefaultState();

  assert.equal(state.scope.performanceBaselineBindingOnly, true);
  assert.equal(state.scope.proofHelperOnly, true);
  assert.equal(state.scope.productRuntimeRewritten, false);
  assert.equal(state.scope.exportPipelineRewritten, false);
  assert.equal(state.scope.storageFormatChanged, false);
  assert.equal(state.scope.uiTouched, false);
  assert.equal(state.scope.releaseClaim, false);
  assert.equal(state.scope.scaleClaim, false);
  assert.equal(state.scope.capabilityTierReportWritten, false);
  assert.equal(state.scope.releaseDossierClaim, false);
  assert.equal(state.scope.attestationClaim, false);
  assert.equal(state.scope.newDependency, false);
});
