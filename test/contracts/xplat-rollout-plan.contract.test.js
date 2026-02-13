const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/xplat-rollout-plan-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeScopeRegistry() {
  return {
    schemaVersion: 'v3.12',
    flags: [
      { flagId: 'XPLAT_STAGE_X1_ENABLED', defaultEnabled: false },
      { flagId: 'XPLAT_STAGE_X2_ENABLED', defaultEnabled: false },
      { flagId: 'XPLAT_STAGE_X3_ENABLED', defaultEnabled: false },
      { flagId: 'XPLAT_STAGE_X4_ENABLED', defaultEnabled: false },
    ],
  };
}

test('xplat rollout plan: X0 with empty stageToScopeFlag is valid', async () => {
  const { evaluateXplatRolloutPlanState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xplat-rollout-plan-'));
  try {
    const planPath = path.join(tmpDir, 'XPLAT_ROLLOUT_PLAN_v3_12.json');
    const scopePath = path.join(tmpDir, 'SCOPEFLAGS_REGISTRY_v3_12.json');
    writeJson(planPath, {
      schemaVersion: 'v3.12',
      stages: ['X0', 'X1', 'X2', 'X3', 'X4'],
      activeStageId: 'X0',
      stageToScopeFlag: {},
      promotionModeAllowed: false,
    });
    writeJson(scopePath, makeScopeRegistry());

    const state = evaluateXplatRolloutPlanState({ planPath, scopeflagsPath: scopePath });
    assert.equal(state.XPLAT_ROLLOUT_PLAN_VALID_OK, 1);
    assert.equal(state.activeStageId, 'X0');
    assert.equal(state.requiredScopeFlagForActiveStage, null);
    assert.deepEqual(state.errors, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('xplat rollout plan: unknown active stage fails deterministically', async () => {
  const { evaluateXplatRolloutPlanState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xplat-rollout-plan-'));
  try {
    const planPath = path.join(tmpDir, 'XPLAT_ROLLOUT_PLAN_v3_12.json');
    const scopePath = path.join(tmpDir, 'SCOPEFLAGS_REGISTRY_v3_12.json');
    writeJson(planPath, {
      schemaVersion: 'v3.12',
      activeStageId: 'X9',
      stageToScopeFlag: {},
      promotionModeAllowed: false,
    });
    writeJson(scopePath, makeScopeRegistry());

    const state = evaluateXplatRolloutPlanState({ planPath, scopeflagsPath: scopePath });
    assert.equal(state.XPLAT_ROLLOUT_PLAN_VALID_OK, 0);
    assert.ok(state.errors.some((entry) => entry.code === 'E_ROLLOUT_PLAN_ACTIVE_STAGE_UNKNOWN'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('xplat rollout plan: unknown scope flag mapping fails deterministically', async () => {
  const { evaluateXplatRolloutPlanState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xplat-rollout-plan-'));
  try {
    const planPath = path.join(tmpDir, 'XPLAT_ROLLOUT_PLAN_v3_12.json');
    const scopePath = path.join(tmpDir, 'SCOPEFLAGS_REGISTRY_v3_12.json');
    writeJson(planPath, {
      schemaVersion: 'v3.12',
      activeStageId: 'X1',
      stageToScopeFlag: {
        X1: 'UNKNOWN_FLAG',
      },
      promotionModeAllowed: false,
    });
    writeJson(scopePath, makeScopeRegistry());

    const state = evaluateXplatRolloutPlanState({ planPath, scopeflagsPath: scopePath });
    assert.equal(state.XPLAT_ROLLOUT_PLAN_VALID_OK, 0);
    assert.ok(state.errors.some((entry) => entry.code === 'E_ROLLOUT_PLAN_SCOPEFLAG_UNKNOWN'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
