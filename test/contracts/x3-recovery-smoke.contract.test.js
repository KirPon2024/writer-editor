const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROOFHOOK_SCRIPT_PATH = path.join(process.cwd(), 'scripts/ops/x3-recovery-smoke-proofhook.mjs');
const READINESS_SCRIPT_PATH = path.join(process.cwd(), 'scripts/ops/x3-readiness-gate-state.mjs');

test('x3 recovery smoke proofhook: positive path returns ok=true and exit code 0', () => {
  const run = spawnSync(process.execPath, [PROOFHOOK_SCRIPT_PATH, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  assert.equal(run.status, 0, `expected exit code 0:\n${run.stdout}\n${run.stderr}`);
  const payload = JSON.parse(String(run.stdout || '{}'));
  assert.equal(payload.ok, true);
  assert.equal(payload.resumeRecoverySmokePass, true);
  assert.equal(payload.failReason, '');
});

test('x3 recovery smoke proofhook: forced failure returns ok=false and exit code 1', () => {
  const run = spawnSync(process.execPath, [PROOFHOOK_SCRIPT_PATH, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      X3_RECOVERY_SMOKE_FORCE_FAIL: '1',
    },
  });

  assert.equal(run.status, 1, `expected exit code 1:\n${run.stdout}\n${run.stderr}`);
  const payload = JSON.parse(String(run.stdout || '{}'));
  assert.equal(payload.ok, false);
  assert.equal(payload.resumeRecoverySmokePass, false);
  assert.equal(payload.failReason, 'E_X3_RECOVERY_SMOKE_FAILED');
});

test('x3 recovery smoke proofhook: failSignal is propagated to X3 readiness gate', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3-recovery-smoke-gate-'));
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
          requiredMinimumMetrics: ['resumeRecoverySmokePass'],
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

  const run = spawnSync(process.execPath, [
    READINESS_SCRIPT_PATH,
    '--json',
    '--metrics-path',
    metricsPath,
    '--rollout-path',
    rolloutPath,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      X3_RECOVERY_SMOKE_FORCE_FAIL: '1',
    },
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.notEqual(run.status, 0, `expected non-zero exit code:\n${run.stdout}\n${run.stderr}`);
  const payload = JSON.parse(String(run.stdout || '{}'));
  assert.equal(payload.ok, false);
  assert.equal(payload.X3_READINESS_GATE_OK, 0);
  assert.equal(payload.failReason, 'E_X3_RECOVERY_SMOKE_FAILED');
  assert.ok(Array.isArray(payload.errors));
  assert.ok(payload.errors.some((entry) => entry.code === 'E_X3_RECOVERY_SMOKE_FAILED'));
});
