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

test('x1 desktop parity state passes with mocked harness success', async () => {
  const { evaluateX1DesktopParityState } = await loadModule();
  const state = evaluateX1DesktopParityState({
    metricsDoc: makeMetricsDoc(),
    harnessRunner: () => ({
      X1_DESKTOP_PARITY_RUNTIME_OK: 1,
      roundtripOk: true,
      exportImportOk: true,
      normalizationOk: true,
      durationMs: 42,
      docSizeMb: 0.001,
      flakyRatePct: 0,
      runtimeParityPassPct: 100,
      failSignalCode: '',
      failSignal: null,
      errors: [],
    }),
  });

  assert.equal(state.X1_DESKTOP_PARITY_STATE_OK, 1);
  assert.equal(state.failSignalCode, '');
  assert.equal(state.failSignal, null);
  assert.equal(state.metricsEvidenceRef, 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json');
  assert.deepEqual(state.errors, []);
});

test('x1 desktop parity state fails with mocked invariant failure and emits failSignal', async () => {
  const { evaluateX1DesktopParityState } = await loadModule();
  const state = evaluateX1DesktopParityState({
    metricsDoc: makeMetricsDoc(),
    harnessRunner: () => ({
      X1_DESKTOP_PARITY_RUNTIME_OK: 0,
      roundtripOk: false,
      exportImportOk: true,
      normalizationOk: true,
      durationMs: 50,
      docSizeMb: 0.002,
      flakyRatePct: 0,
      runtimeParityPassPct: 0,
      failSignalCode: 'E_X1_DESKTOP_PARITY_RUNTIME_INVALID',
      failSignal: {
        code: 'E_X1_DESKTOP_PARITY_RUNTIME_INVALID',
      },
      errors: [{ code: 'E_X1_DESKTOP_PARITY_ROUNDTRIP_FAILED', message: 'Roundtrip failed.' }],
    }),
  });

  assert.equal(state.X1_DESKTOP_PARITY_STATE_OK, 0);
  assert.equal(state.failSignalCode, 'E_X1_DESKTOP_PARITY_RUNTIME_INVALID');
  assert.equal(state.failSignal.code, 'E_X1_DESKTOP_PARITY_RUNTIME_INVALID');
  assert.ok(state.errors.some((entry) => entry.code === 'E_X1_PARITY_HARNESS_FAILED'));
  assert.ok(state.errors.some((entry) => entry.code === 'E_X1_PARITY_ROUNDTRIP_FAILED'));
});
