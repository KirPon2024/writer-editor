const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/x1-desktop-parity-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

function makeMetricsDoc(overrides = {}) {
  return {
    schemaVersion: 'v3.12',
    stageEvidence: {
      X1: {
        metricsRef: 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json',
        x1RuntimeParityRef: 'scripts/ops/x1-desktop-parity-state.mjs --json',
        parityPassRatePct: 100,
        runtimeParityPassPct: 100,
        flakyRatePct: 0,
        maxDocSizeMb: 16,
        ...overrides,
      },
    },
  };
}

function makeHarnessReport(overrides = {}) {
  return {
    X1_DESKTOP_PARITY_RUNTIME_OK: 1,
    passPct: 100,
    runtimeParityPassPct: 100,
    flakyRatePct: 0,
    maxDocSizeMbVerified: 2,
    durationMs: 120,
    platform: 'linux',
    fails: 0,
    ...overrides,
  };
}

test('x1 desktop parity state passes with behavioral harness report at 100%', async () => {
  const { evaluateX1DesktopParityState } = await loadModule();
  const state = await evaluateX1DesktopParityState({
    metricsDoc: makeMetricsDoc(),
    harnessRunner: () => makeHarnessReport(),
  });

  assert.equal(state.X1_DESKTOP_PARITY_STATE_OK, 1);
  assert.equal(state.X1_DESKTOP_PARITY_PASS_PCT, 100);
  assert.equal(state.X1_DESKTOP_PARITY_PLATFORM, 'linux');
  assert.equal(state.failSignalCode, '');
  assert.equal(state.failSignal, null);
  assert.deepEqual(state.errors, []);
});

test('x1 desktop parity state fails when harness passPct is below 100', async () => {
  const { evaluateX1DesktopParityState } = await loadModule();
  const state = await evaluateX1DesktopParityState({
    metricsDoc: makeMetricsDoc(),
    harnessRunner: () => makeHarnessReport({ passPct: 90, runtimeParityPassPct: 90, fails: 1 }),
  });

  assert.equal(state.X1_DESKTOP_PARITY_STATE_OK, 0);
  assert.equal(state.failSignalCode, 'E_X1_DESKTOP_PARITY_RUNTIME_INVALID');
  assert.ok(state.errors.some((entry) => entry.code === 'E_X1_PARITY_PASS_PCT_NOT_FULL'));
});

test('x1 desktop parity state fails schema when required harness field is missing', async () => {
  const { evaluateX1DesktopParityState } = await loadModule();
  const state = await evaluateX1DesktopParityState({
    metricsDoc: makeMetricsDoc(),
    harnessRunner: () => {
      const report = makeHarnessReport();
      delete report.maxDocSizeMbVerified;
      return report;
    },
  });

  assert.equal(state.X1_DESKTOP_PARITY_STATE_OK, 0);
  assert.ok(state.errors.some((entry) => entry.code === 'E_X1_PARITY_REPORT_FIELD_REQUIRED'));
});

test('x1 desktop parity state fails on unsupported platform', async () => {
  const { evaluateX1DesktopParityState } = await loadModule();
  const state = await evaluateX1DesktopParityState({
    metricsDoc: makeMetricsDoc(),
    harnessRunner: () => makeHarnessReport({ platform: 'solaris' }),
  });

  assert.equal(state.X1_DESKTOP_PARITY_STATE_OK, 0);
  assert.ok(state.errors.some((entry) => entry.code === 'E_X1_PARITY_PLATFORM_UNSUPPORTED'));
});

test('x1 desktop parity state never false-greens when harness report is absent', async () => {
  const { evaluateX1DesktopParityState } = await loadModule();
  const state = await evaluateX1DesktopParityState({
    metricsDoc: makeMetricsDoc(),
    harnessRunner: () => null,
  });

  assert.equal(state.X1_DESKTOP_PARITY_STATE_OK, 0);
  assert.ok(state.errors.some((entry) => entry.code === 'E_X1_PARITY_HARNESS_INVALID'));
});
