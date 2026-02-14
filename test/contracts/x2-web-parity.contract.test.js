const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const SCRIPT_PATH = path.join(process.cwd(), 'scripts/ops/x2-web-parity-state.mjs');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    modulePromise = import(pathToFileURL(SCRIPT_PATH).href);
  }
  return modulePromise;
}

function makeMetricsDoc(overrides = {}) {
  return {
    schemaVersion: 'v3.12',
    stageEvidence: {
      X2: {
        metricsRef: 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json',
        x2WebRuntimeParityRef: 'scripts/ops/x2-web-parity-state.mjs --json',
        x2WebRuntimeParityHarnessRef: 'scripts/ops/x2-web-parity-harness.mjs --json',
        proofHook: 'node scripts/ops/x2-web-parity-state.mjs --json',
        sourceBinding: 'ops_script+contract_test',
        metricSourceBinding: 'harness-report',
        failSignalCode: 'E_X2_WEB_PARITY_CONTRACT_INVALID',
        positiveContractRef: 'test/contracts/x2-web-parity.contract.test.js#positive-path',
        negativeContractRef: 'test/contracts/x2-web-parity.contract.test.js#negative-path',
        proofHookClosureSha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        requiredP95Metrics: ['openP95Ms', 'saveP95Ms', 'reopenP95Ms', 'exportP95Ms'],
        flakyRatePctThreshold: 0,
        ...overrides,
      },
    },
  };
}

function makeRolloutDoc(activeStageId = 'X2') {
  return {
    schemaVersion: 'v3.12',
    activeStageId,
  };
}

function makeReport(overrides = {}) {
  return {
    X2_WEB_RUNTIME_PARITY_OK: 1,
    reportVersion: 'x2-web-runtime-parity.v1',
    platform: 'linux',
    passPct: 100,
    flakyRatePct: 0,
    openP95Ms: 1.1,
    saveP95Ms: 1.2,
    reopenP95Ms: 1.3,
    exportP95Ms: 1.4,
    ...overrides,
  };
}

test('x2 web parity state: positive path is green when contract is fully satisfied', async () => {
  const { evaluateX2WebParityState } = await loadModule();
  const state = await evaluateX2WebParityState({
    metricsDoc: makeMetricsDoc(),
    rolloutDoc: makeRolloutDoc('X2'),
    reportDoc: makeReport(),
  });

  assert.equal(state.X2_WEB_PARITY_STATE_OK, 1);
  assert.equal(state.X2_WEB_PARITY_PASS_PCT, 100);
  assert.equal(state.activeStageId, 'X2');
  assert.equal(state.failSignalCode, '');
  assert.deepEqual(state.errors, []);
});

test('x2 web parity state: negative path fails on broken component (stage mismatch)', async () => {
  const { evaluateX2WebParityState } = await loadModule();
  const state = await evaluateX2WebParityState({
    metricsDoc: makeMetricsDoc(),
    rolloutDoc: makeRolloutDoc('X1'),
    reportDoc: makeReport(),
  });

  assert.equal(state.X2_WEB_PARITY_STATE_OK, 0);
  assert.equal(state.failSignalCode, 'E_X2_WEB_PARITY_CONTRACT_INVALID');
  assert.ok(state.errors.some((entry) => entry.code === 'E_X2_WEB_PARITY_STAGE_NOT_ACTIVE'));
});

test('x2 web parity state CLI exits non-zero on invalid report payload', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'x2-web-parity-exit-'));
  const metricsPath = path.join(tempRoot, 'metrics.json');
  const rolloutPath = path.join(tempRoot, 'rollout.json');
  const reportPath = path.join(tempRoot, 'report.json');

  fs.writeFileSync(metricsPath, `${JSON.stringify(makeMetricsDoc())}\n`, 'utf8');
  fs.writeFileSync(rolloutPath, `${JSON.stringify(makeRolloutDoc('X2'))}\n`, 'utf8');
  fs.writeFileSync(reportPath, `${JSON.stringify(makeReport({ passPct: 95, X2_WEB_RUNTIME_PARITY_OK: 0 }))}\n`, 'utf8');

  const run = spawnSync(process.execPath, [
    SCRIPT_PATH,
    '--json',
    '--metrics-path',
    metricsPath,
    '--rollout-path',
    rolloutPath,
    '--report-path',
    reportPath,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  fs.rmSync(tempRoot, { recursive: true, force: true });

  assert.notEqual(run.status, 0, `expected non-zero exit:\n${run.stdout}\n${run.stderr}`);
  const payload = JSON.parse(String(run.stdout || '{}'));
  assert.equal(payload.X2_WEB_PARITY_STATE_OK, 0);
  assert.equal(payload.failSignalCode, 'E_X2_WEB_PARITY_CONTRACT_INVALID');
});
