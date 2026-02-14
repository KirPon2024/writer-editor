const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const SCRIPT_PATH = path.join(process.cwd(), 'scripts/ops/x3-readiness-gate-state.mjs');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    modulePromise = import(pathToFileURL(SCRIPT_PATH).href);
  }
  return modulePromise;
}

test('x3 readiness gate: positive path validates minimal X3 metric contract', async () => {
  const { evaluateX3ReadinessGateState } = await loadModule();

  const state = evaluateX3ReadinessGateState({
    metricsDoc: {
      schemaVersion: 'v3.12',
      stageEvidence: {
        X3: {
          metricsRef: 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json',
          x3ReadinessGateRef: 'scripts/ops/x3-readiness-gate-state.mjs --json',
          requiredMinimumMetrics: ['resumeRecoverySmokePass'],
        },
      },
      metrics: {
        resumeRecoverySmokePass: {
          type: 'boolean',
        },
      },
    },
    rolloutDoc: {
      schemaVersion: 'v3.12',
      activeStageId: 'X2',
    },
  });

  assert.equal(state.ok, true);
  assert.equal(state.X3_READINESS_GATE_OK, 1);
  assert.equal(state.failReason, '');
  assert.equal(state.activeStageId, 'X2');
  assert.equal(state.requiredMetric, 'resumeRecoverySmokePass');
  assert.deepEqual(state.errors, []);
});

test('x3 readiness gate CLI exits non-zero when required metric is missing from X3 minimums', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3-readiness-negative-'));
  const metricsPath = path.join(tmpDir, 'metrics.json');
  const rolloutPath = path.join(tmpDir, 'rollout.json');

  fs.writeFileSync(
    metricsPath,
    `${JSON.stringify({
      schemaVersion: 'v3.12',
      stageEvidence: {
        X3: {
          metricsRef: 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json',
          x3ReadinessGateRef: 'scripts/ops/x3-readiness-gate-state.mjs --json',
          requiredMinimumMetrics: ['parityPassRatePct'],
        },
      },
      metrics: {
        resumeRecoverySmokePass: {
          type: 'boolean',
        },
      },
    }, null, 2)}\n`,
    'utf8',
  );

  fs.writeFileSync(
    rolloutPath,
    `${JSON.stringify({
      schemaVersion: 'v3.12',
      activeStageId: 'X2',
    }, null, 2)}\n`,
    'utf8',
  );

  const run = spawnSync(process.execPath, [SCRIPT_PATH, '--json', '--metrics-path', metricsPath, '--rollout-path', rolloutPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.notEqual(run.status, 0, `expected non-zero exit code:\n${run.stdout}\n${run.stderr}`);
  const payload = JSON.parse(String(run.stdout || '{}'));
  assert.equal(payload.ok, false);
  assert.equal(payload.X3_READINESS_GATE_OK, 0);
  assert.notEqual(String(payload.failReason || '').trim(), '');
  assert.ok(Array.isArray(payload.errors));
  assert.ok(payload.errors.some((entry) => entry.code === 'E_X3_REQUIRED_MIN_METRIC_MISSING'));
});
