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
      path.join(process.cwd(), 'scripts/ops/stage-promotion-record-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

test('stage promotion record: inactive template is valid', async () => {
  const { evaluateStagePromotionRecordState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-promotion-record-'));
  try {
    const schemaPath = path.join(tmpDir, 'schema.json');
    const metricsPath = path.join(tmpDir, 'metrics.json');
    const recordPath = path.join(tmpDir, 'record.json');

    writeJson(schemaPath, makeSchema());
    writeJson(metricsPath, makeMetrics());
    writeJson(recordPath, {
      schemaVersion: 'v3.12',
      isActive: false,
      promotionId: 'TEMPLATE',
      fromStageId: 'X0',
      toStageId: 'X0',
      approvedBy: 'TBD',
      approvedAtUtc: '1970-01-01T00:00:00Z',
      evidence: {},
    });

    const state = evaluateStagePromotionRecordState({ schemaPath, metricsPath, recordPath });
    assert.equal(state.STAGE_PROMOTION_RECORD_VALID_OK, 1);
    assert.equal(state.isActive, false);
    assert.deepEqual(state.errors, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('stage promotion record: active promotion without required metrics fails', async () => {
  const { evaluateStagePromotionRecordState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-promotion-record-'));
  try {
    const schemaPath = path.join(tmpDir, 'schema.json');
    const metricsPath = path.join(tmpDir, 'metrics.json');
    const recordPath = path.join(tmpDir, 'record.json');

    writeJson(schemaPath, makeSchema());
    writeJson(metricsPath, makeMetrics());
    writeJson(recordPath, {
      schemaVersion: 'v3.12',
      isActive: true,
      promotionId: 'PROMO-001',
      fromStageId: 'X0',
      toStageId: 'X1',
      approvedBy: 'ops',
      approvedAtUtc: '2026-02-13T00:00:00Z',
      evidence: {},
    });

    const state = evaluateStagePromotionRecordState({ schemaPath, metricsPath, recordPath });
    assert.equal(state.STAGE_PROMOTION_RECORD_VALID_OK, 0);
    assert.ok(state.errors.some((entry) => entry.code === 'E_PROMOTION_REQUIRED_METRIC_MISSING'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('stage promotion record: out-of-range metric values fail deterministically', async () => {
  const { evaluateStagePromotionRecordState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-promotion-record-'));
  try {
    const schemaPath = path.join(tmpDir, 'schema.json');
    const metricsPath = path.join(tmpDir, 'metrics.json');
    const recordPath = path.join(tmpDir, 'record.json');

    writeJson(schemaPath, makeSchema());
    writeJson(metricsPath, makeMetrics());
    writeJson(recordPath, {
      schemaVersion: 'v3.12',
      isActive: true,
      promotionId: 'PROMO-002',
      fromStageId: 'X0',
      toStageId: 'X1',
      approvedBy: 'ops',
      approvedAtUtc: '2026-02-13T00:00:00Z',
      evidence: {
        parityPassRatePct: 101,
        flakyRatePct: -1,
        maxDocSizeMb: -5,
      },
    });

    const state = evaluateStagePromotionRecordState({ schemaPath, metricsPath, recordPath });
    assert.equal(state.STAGE_PROMOTION_RECORD_VALID_OK, 0);
    assert.ok(state.errors.some((entry) => entry.code === 'E_PROMOTION_METRIC_OUT_OF_RANGE'));
    assert.ok(state.errors.some((entry) => entry.code === 'E_PROMOTION_METRIC_NEGATIVE'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
