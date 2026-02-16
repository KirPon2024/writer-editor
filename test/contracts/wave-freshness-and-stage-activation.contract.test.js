const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let resolverModulePromise = null;
let hashModulePromise = null;
let cacheModulePromise = null;

function loadResolverModule() {
  if (!resolverModulePromise) {
    resolverModulePromise = import(pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/resolve-active-stage.mjs'),
    ).href);
  }
  return resolverModulePromise;
}

function loadHashModule() {
  if (!hashModulePromise) {
    hashModulePromise = import(pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/compute-wave-input-hash.mjs'),
    ).href);
  }
  return hashModulePromise;
}

function loadCacheModule() {
  if (!cacheModulePromise) {
    cacheModulePromise = import(pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/wave-cache.mjs'),
    ).href);
  }
  return cacheModulePromise;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// ttl-stale-reuse
test('wave freshness and stage activation: stale cache reuse returns E_WAVE_RESULT_STALE', async () => {
  const { evaluateWaveCacheState } = await loadCacheModule();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-cache-stale-'));
  try {
    const cachePath = path.join(tmpDir, 'wave-cache.json');
    const hash = 'a'.repeat(64);

    const store = evaluateWaveCacheState({
      mode: 'store',
      cachePath,
      waveInputHash: hash,
      ttlClass: 'deterministicLocal',
      ttlSec: 1,
      nowUtc: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(store.ok, true);

    const check = evaluateWaveCacheState({
      mode: 'check',
      cachePath,
      waveInputHash: hash,
      ttlClass: 'deterministicLocal',
      reuseRequested: true,
      nowUtc: '2026-01-01T00:00:10.000Z',
    });

    assert.equal(check.ok, false);
    assert.equal(check.WAVE_RESULT_STALE, 1);
    assert.equal(check.WAVE_TTL_VALID, 0);
    assert.equal(check.WAVE_FRESHNESS_OK, 0);
    assert.equal(check.failSignal, 'E_WAVE_RESULT_STALE');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// promotion-without-record
test('wave freshness and stage activation: promotion mode without record fails with E_STAGE_PROMOTION_INVALID', async () => {
  const { evaluateResolveActiveStageState } = await loadResolverModule();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-promo-invalid-'));
  try {
    const missingRecordPath = path.join(tmpDir, 'missing-record.json');

    const state = evaluateResolveActiveStageState({
      profile: 'pr',
      gateTier: 'promotion',
      promotionMode: true,
      scopeFlags: ['XPLAT_STAGE_X3_ENABLED'],
      recordPath: missingRecordPath,
    });

    assert.equal(state.STAGE_ACTIVATION_OK, 0);
    assert.equal(state.failSignals.includes('E_STAGE_PROMOTION_INVALID'), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// stage-metrics-missing-promotion
test('wave freshness and stage activation: promotion record without required metrics reports E_STAGE_METRICS_MISSING', async () => {
  const { evaluateResolveActiveStageState } = await loadResolverModule();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-metrics-missing-'));
  try {
    const recordPath = path.join(tmpDir, 'record.json');
    writeJson(recordPath, {
      schemaVersion: 'v3.12',
      isActive: true,
      promotionId: 'PROMO_X2_TO_X3_TEST',
      fromStageId: 'X2',
      toStageId: 'X3',
      approvedBy: 'ops',
      approvedAtUtc: '2026-02-16T00:00:00.000Z',
      evidence: {},
    });

    const state = evaluateResolveActiveStageState({
      profile: 'pr',
      gateTier: 'promotion',
      promotionMode: true,
      scopeFlags: ['XPLAT_STAGE_X3_ENABLED'],
      recordPath,
    });

    assert.equal(state.STAGE_ACTIVATION_OK, 0);
    assert.equal(state.failSignals.includes('E_STAGE_PROMOTION_INVALID'), true);
    assert.equal(state.failSignals.includes('E_STAGE_METRICS_MISSING'), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// unknown-scopeflag
test('wave freshness and stage activation: unknown scope flag fails with E_SCOPEFLAG_UNKNOWN', async () => {
  const { evaluateResolveActiveStageState } = await loadResolverModule();

  const state = evaluateResolveActiveStageState({
    profile: 'pr',
    gateTier: 'core',
    scopeFlags: ['UNKNOWN_SCOPE_FLAG_FOR_TEST'],
  });

  assert.equal(state.STAGE_ACTIVATION_OK, 0);
  assert.equal(state.failSignals.includes('E_SCOPEFLAG_UNKNOWN'), true);
});

// determinism
test('wave freshness and stage activation: deterministic hash for unchanged inputs', async () => {
  const { evaluateComputeWaveInputHashState } = await loadHashModule();

  const run1 = evaluateComputeWaveInputHashState({
    profile: 'pr',
    gateTier: 'core',
    scopeFlags: ['XPLAT_STAGE_X3_ENABLED'],
  });
  const run2 = evaluateComputeWaveInputHashState({
    profile: 'pr',
    gateTier: 'core',
    scopeFlags: ['XPLAT_STAGE_X3_ENABLED'],
  });

  assert.equal(run1.ok, true);
  assert.equal(run2.ok, true);
  assert.equal(run1.WAVE_INPUT_HASH_PRESENT, 1);
  assert.equal(run2.WAVE_INPUT_HASH_PRESENT, 1);
  assert.equal(run1.WAVE_INPUT_HASH, run2.WAVE_INPUT_HASH);
});

// sensitivity
test('wave freshness and stage activation: hash changes when relevant SSOT changes by one byte', async () => {
  const { evaluateComputeWaveInputHashState } = await loadHashModule();

  const tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-wave-hash-sensitive-'));
  try {
    const baselinePlanPath = path.join(process.cwd(), 'docs/OPS/STATUS/XPLAT_ROLLOUT_PLAN_v3_12.json');
    const tmpPlanPath = path.join(tmpDir, 'XPLAT_ROLLOUT_PLAN_v3_12.json');
    const tmpPlanPathRel = path.relative(process.cwd(), tmpPlanPath).replaceAll('\\', '/');
    const baselineText = fs.readFileSync(baselinePlanPath, 'utf8');
    fs.writeFileSync(tmpPlanPath, baselineText, 'utf8');

    const baseline = evaluateComputeWaveInputHashState({
      profile: 'pr',
      gateTier: 'core',
      scopeFlags: ['XPLAT_STAGE_X3_ENABLED'],
      extraSsotPath: tmpPlanPathRel,
    });
    assert.equal(baseline.ok, true);

    const changedText = baselineText.replace('"X3"', '"X2"');
    fs.writeFileSync(tmpPlanPath, changedText, 'utf8');

    const changed = evaluateComputeWaveInputHashState({
      profile: 'pr',
      gateTier: 'core',
      scopeFlags: ['XPLAT_STAGE_X3_ENABLED'],
      extraSsotPath: tmpPlanPathRel,
    });
    assert.equal(changed.ok, true);
    assert.notEqual(changed.WAVE_INPUT_HASH, baseline.WAVE_INPUT_HASH);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// stage-gated-non-blocking
test('wave freshness and stage activation: inactive stage-gated sets are excluded when active stage is X0', async () => {
  const { evaluateResolveActiveStageState } = await loadResolverModule();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-non-blocking-'));
  try {
    const planPath = path.join(tmpDir, 'plan.json');
    writeJson(planPath, {
      schemaVersion: 'v3.12',
      stages: ['X0', 'X1', 'X2', 'X3', 'X4'],
      activeStageId: 'X0',
      stageDefinitions: [
        {
          stageId: 'X0',
          requiredScopeFlag: null,
          stageGatedSsot: [],
        },
        {
          stageId: 'X1',
          requiredScopeFlag: 'XPLAT_STAGE_X1_ENABLED',
          stageGatedSsot: ['docs/OPS/STATUS/XPLAT_PARITY_BASELINE_v3_12.json'],
        },
      ],
      stageToScopeFlag: {
        X1: 'XPLAT_STAGE_X1_ENABLED',
      },
      promotionModeAllowed: true,
    });

    const state = evaluateResolveActiveStageState({
      profile: 'pr',
      gateTier: 'core',
      planPath,
      scopeFlags: [],
    });

    assert.equal(state.STAGE_ACTIVATION_OK, 1);
    assert.equal(state.STAGE_ACTIVE, 1);
    assert.equal(state.ACTIVE_STAGE_ID, 'X0');
    assert.equal(state.RELEVANT_STAGE_GATED_SSOT_COUNT, 0);
    assert.deepEqual(state.relevantStageGatedSsot, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
