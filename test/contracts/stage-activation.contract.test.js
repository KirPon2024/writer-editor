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
      path.join(process.cwd(), 'scripts/ops/stage-activation-state.mjs'),
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

function makeSchema() {
  return {
    schemaVersion: 'v3.12',
    requiredMetricsByStage: {
      X1: ['parityPassRatePct', 'flakyRatePct', 'maxDocSizeMb'],
      X2: ['parityPassRatePct', 'flakyRatePct', 'maxDocSizeMb', 'openP95Ms', 'saveP95Ms', 'reopenP95Ms', 'exportP95Ms'],
      X3: ['parityPassRatePct', 'flakyRatePct', 'maxDocSizeMb', 'resumeRecoverySmokePass'],
      X4: ['contractPassRatePct', 'flakyRatePct', 'replayProtectionPass'],
    },
    constraints: {
      stageOrder: ['X0', 'X1', 'X2', 'X3', 'X4'],
    },
  };
}

function makeMetrics() {
  return {
    schemaVersion: 'v3.12',
    metrics: {
      parityPassRatePct: { type: 'percent', minimum: 0, maximum: 100 },
      flakyRatePct: { type: 'percent', minimum: 0, maximum: 100 },
      maxDocSizeMb: { type: 'number', minimum: 0 },
      openP95Ms: { type: 'number', minimum: 0 },
      saveP95Ms: { type: 'number', minimum: 0 },
      reopenP95Ms: { type: 'number', minimum: 0 },
      exportP95Ms: { type: 'number', minimum: 0 },
      resumeRecoverySmokePass: { type: 'boolean' },
      contractPassRatePct: { type: 'percent', minimum: 0, maximum: 100 },
      replayProtectionPass: { type: 'boolean' },
    },
  };
}

function makeRecordTemplate(overrides = {}) {
  return {
    schemaVersion: 'v3.12',
    isActive: false,
    promotionId: 'TEMPLATE',
    fromStageId: 'X0',
    toStageId: 'X0',
    approvedBy: 'TBD',
    approvedAtUtc: '1970-01-01T00:00:00Z',
    evidence: {},
    ...overrides,
  };
}

function makePlan(overrides = {}) {
  return {
    schemaVersion: 'v3.12',
    activeStageId: 'X0',
    stageToScopeFlag: {},
    promotionModeAllowed: false,
    ...overrides,
  };
}

test('stage activation: X0 with inactive promotion template is valid', async () => {
  const { evaluateStageActivationState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-activation-'));
  try {
    const planPath = path.join(tmpDir, 'plan.json');
    const scopePath = path.join(tmpDir, 'scope.json');
    const schemaPath = path.join(tmpDir, 'schema.json');
    const metricsPath = path.join(tmpDir, 'metrics.json');
    const recordPath = path.join(tmpDir, 'record.json');

    writeJson(planPath, makePlan());
    writeJson(scopePath, makeScopeRegistry());
    writeJson(schemaPath, makeSchema());
    writeJson(metricsPath, makeMetrics());
    writeJson(recordPath, makeRecordTemplate());

    const state = evaluateStageActivationState({
      planPath,
      scopeflagsPath: scopePath,
      schemaPath,
      metricsPath,
      recordPath,
    });
    assert.equal(state.STAGE_ACTIVATION_STATE_OK, 1);
    assert.equal(state.activeStageId, 'X0');
    assert.equal(state.promotionMode, 0);
    assert.deepEqual(state.errors, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('stage activation: active promotion with invalid record fails', async () => {
  const { evaluateStageActivationState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-activation-'));
  try {
    const planPath = path.join(tmpDir, 'plan.json');
    const scopePath = path.join(tmpDir, 'scope.json');
    const schemaPath = path.join(tmpDir, 'schema.json');
    const metricsPath = path.join(tmpDir, 'metrics.json');
    const recordPath = path.join(tmpDir, 'record.json');

    writeJson(planPath, makePlan({
      activeStageId: 'X1',
      stageToScopeFlag: { X1: 'XPLAT_STAGE_X1_ENABLED' },
      promotionModeAllowed: true,
    }));
    writeJson(scopePath, makeScopeRegistry());
    writeJson(schemaPath, makeSchema());
    writeJson(metricsPath, makeMetrics());
    writeJson(recordPath, makeRecordTemplate({
      isActive: true,
      promotionId: 'PROMO-INVALID',
      fromStageId: 'X0',
      toStageId: 'X1',
      approvedBy: 'ops',
      approvedAtUtc: '2026-02-13T00:00:00Z',
      evidence: {},
    }));

    const state = evaluateStageActivationState({
      planPath,
      scopeflagsPath: scopePath,
      schemaPath,
      metricsPath,
      recordPath,
    });
    assert.equal(state.STAGE_ACTIVATION_STATE_OK, 0);
    assert.ok(state.errors.some((entry) => entry.code === 'E_STAGE_PROMOTION_RECORD_INVALID'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('stage activation: promotion mode active while disabled in plan fails', async () => {
  const { evaluateStageActivationState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-activation-'));
  try {
    const planPath = path.join(tmpDir, 'plan.json');
    const scopePath = path.join(tmpDir, 'scope.json');
    const schemaPath = path.join(tmpDir, 'schema.json');
    const metricsPath = path.join(tmpDir, 'metrics.json');
    const recordPath = path.join(tmpDir, 'record.json');

    writeJson(planPath, makePlan({
      activeStageId: 'X1',
      stageToScopeFlag: { X1: 'XPLAT_STAGE_X1_ENABLED' },
      promotionModeAllowed: false,
    }));
    writeJson(scopePath, makeScopeRegistry());
    writeJson(schemaPath, makeSchema());
    writeJson(metricsPath, makeMetrics());
    writeJson(recordPath, makeRecordTemplate({
      isActive: true,
      promotionId: 'PROMO-VALID-BUT-NOT-ALLOWED',
      fromStageId: 'X0',
      toStageId: 'X1',
      approvedBy: 'ops',
      approvedAtUtc: '2026-02-13T00:00:00Z',
      evidence: {
        parityPassRatePct: 99.9,
        flakyRatePct: 0.1,
        maxDocSizeMb: 4,
      },
    }));

    const state = evaluateStageActivationState({
      planPath,
      scopeflagsPath: scopePath,
      schemaPath,
      metricsPath,
      recordPath,
    });
    assert.equal(state.STAGE_ACTIVATION_STATE_OK, 0);
    assert.ok(state.errors.some((entry) => entry.code === 'E_STAGE_PROMOTION_MODE_NOT_ALLOWED'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
