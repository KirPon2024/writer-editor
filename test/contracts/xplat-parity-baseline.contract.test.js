const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/xplat-parity-baseline-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function makeValidMetricsDoc() {
  return {
    schemaVersion: 'v3.12',
    stageEvidence: {
      X1: {
        metricsRef: 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json',
        parityPassRatePct: 100,
        flakyRatePct: 0,
        maxDocSizeMb: 16,
      },
    },
  };
}

test('xplat parity baseline state passes on repository baseline', async () => {
  const { evaluateXplatParityBaselineState } = await loadModule();
  const state = evaluateXplatParityBaselineState();
  assert.equal(state.XPLAT_PARITY_BASELINE_VALID_OK, 1);
  assert.equal(state.stageId, 'X1');
  assert.equal(state.concurrencyUnit, 'Scene');
  assert.deepEqual(state.errors, []);
});

test('xplat parity baseline structure snapshot is explicit for X1 hard parity', () => {
  const baselinePath = path.join(process.cwd(), 'docs/OPS/STATUS/XPLAT_PARITY_BASELINE_v3_12.json');
  const baseline = readJson(baselinePath);

  assert.equal(baseline.schemaVersion, 'v3.12');
  assert.equal(baseline.stageId, 'X1');
  assert.equal(baseline.concurrencyUnit, 'Scene');
  assert.equal(baseline.metricsRef, 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json');
  assert.deepEqual(baseline.hardParity, {
    schemaStable: true,
    migrationsDeterministic: true,
    recoveryRoundtripOk: true,
    normalizationInvariant: true,
    exportImportRoundtripOk: true,
  });
  assert.deepEqual(baseline.testedPlatforms, {
    win: 'subset',
    linux: 'subset',
  });
});

test('xplat parity baseline state fails deterministically on mocked hard parity violation', async () => {
  const { evaluateXplatParityBaselineState } = await loadModule();
  const brokenBaseline = {
    schemaVersion: 'v3.12',
    stageId: 'X1',
    concurrencyUnit: 'Scene',
    metricsRef: 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json',
    hardParity: {
      schemaStable: true,
      migrationsDeterministic: false,
      recoveryRoundtripOk: true,
      normalizationInvariant: true,
      exportImportRoundtripOk: true,
    },
    testedPlatforms: {
      win: 'subset',
      linux: 'subset',
    },
  };

  const state = evaluateXplatParityBaselineState({
    baselineDoc: brokenBaseline,
    metricsDoc: makeValidMetricsDoc(),
  });

  assert.equal(state.XPLAT_PARITY_BASELINE_VALID_OK, 0);
  assert.ok(
    state.errors.some(
      (entry) => entry.code === 'E_XPLAT_PARITY_BASELINE_HARD_PARITY_FALSE'
        && entry.path === 'baseline.hardParity.migrationsDeterministic',
    ),
  );
});
