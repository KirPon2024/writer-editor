const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const SCRIPT_PATH = path.join(process.cwd(), 'scripts/ops/x2-readiness-gate-state.mjs');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    modulePromise = import(pathToFileURL(SCRIPT_PATH).href);
  }
  return modulePromise;
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

test('x2 readiness gate: positive path returns all components green', async () => {
  const { evaluateX2ReadinessGateState } = await loadModule();

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'x2-readiness-positive-'));
  const ubuntuRel = 'docs/OPS/EVIDENCE/X1_RUNTIME_PARITY/parity-report-ubuntu.json';
  const windowsRel = 'docs/OPS/EVIDENCE/X1_RUNTIME_PARITY/parity-report-windows.json';
  const ubuntuAbs = path.join(repoRoot, ubuntuRel);
  const windowsAbs = path.join(repoRoot, windowsRel);

  fs.mkdirSync(path.dirname(ubuntuAbs), { recursive: true });
  fs.writeFileSync(ubuntuAbs, '{"platform":"linux","passPct":100}\n', 'utf8');
  fs.writeFileSync(windowsAbs, '{"platform":"win","passPct":100}\n', 'utf8');

  const ubuntuSha = sha256(fs.readFileSync(ubuntuAbs));
  const windowsSha = sha256(fs.readFileSync(windowsAbs));

  const metricsDoc = {
    schemaVersion: 'v3.12',
    stageEvidence: {
      X1: {
        x1RuntimeParityEvidence: {
          ubuntu: {
            file: ubuntuRel,
            sha256: ubuntuSha,
          },
          windows: {
            file: windowsRel,
            sha256: windowsSha,
          },
        },
      },
    },
  };

  const baselineDoc = {
    schemaVersion: 'v3.12',
    evidenceSha256: {
      ubuntu: ubuntuSha,
      windows: windowsSha,
    },
  };

  const state = evaluateX2ReadinessGateState({
    repoRoot,
    metricsDoc,
    baselineDoc,
    requireEvidenceFiles: '1',
    governanceStateRunner: () => ({ ok: true }),
    strictDoctorRunner: () => ({ ok: true, status: 0 }),
    scopeRunner: () => ({ ok: true, status: 0, output: '' }),
  });

  fs.rmSync(repoRoot, { recursive: true, force: true });

  assert.equal(state.X2_READINESS_GATE_OK, 1);
  assert.deepEqual(state.COMPONENTS, {
    X1_RUNTIME_PARITY_FROZEN_OK: 1,
    GOVERNANCE_GREEN_OK: 1,
    STRICT_DOCTOR_GREEN_OK: 1,
    SCOPE_DRIFT_FREE_OK: 1,
  });
  assert.equal(state.failReason, '');
});

test('x2 readiness gate: negative path fails when evidence hash mismatches baseline', async () => {
  const { evaluateX2ReadinessGateState } = await loadModule();

  const metricsDoc = {
    stageEvidence: {
      X1: {
        x1RuntimeParityEvidence: {
          ubuntu: {
            file: 'docs/OPS/EVIDENCE/X1_RUNTIME_PARITY/parity-report-ubuntu.json',
            sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
          windows: {
            file: 'docs/OPS/EVIDENCE/X1_RUNTIME_PARITY/parity-report-windows.json',
            sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        },
      },
    },
  };

  const baselineDoc = {
    evidenceSha256: {
      ubuntu: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      windows: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
  };

  const state = evaluateX2ReadinessGateState({
    metricsDoc,
    baselineDoc,
    governanceStateRunner: () => ({ ok: true }),
    strictDoctorRunner: () => ({ ok: true, status: 0 }),
    scopeRunner: () => ({ ok: true, status: 0, output: '' }),
  });

  assert.equal(state.X2_READINESS_GATE_OK, 0);
  assert.equal(state.COMPONENTS.X1_RUNTIME_PARITY_FROZEN_OK, 0);
  assert.equal(state.COMPONENTS.GOVERNANCE_GREEN_OK, 1);
  assert.equal(state.COMPONENTS.STRICT_DOCTOR_GREEN_OK, 1);
  assert.equal(state.COMPONENTS.SCOPE_DRIFT_FREE_OK, 1);
  assert.ok(
    state.componentIssues.X1_RUNTIME_PARITY_FROZEN_OK.some((entry) => entry.code === 'E_X2_EVIDENCE_SHA_MISMATCH'),
  );
});

test('x2 readiness gate CLI exits non-zero when baseline payload is invalid', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'x2-readiness-exit-'));
  const baselinePath = path.join(tmpDir, 'baseline-invalid.json');
  fs.writeFileSync(baselinePath, '{"broken":true}\n', 'utf8');

  const run = spawnSync(process.execPath, [SCRIPT_PATH, '--json', '--baseline-path', baselinePath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      X2_READINESS_REPO_ROOT: process.cwd(),
      X2_READINESS_STRICT_DOCTOR_CMD: process.platform === 'win32' ? 'cmd /c exit 0' : 'true',
    },
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.notEqual(run.status, 0, `expected non-zero exit code:\n${run.stdout}\n${run.stderr}`);
  const payload = JSON.parse(String(run.stdout || '{}'));
  assert.equal(payload.X2_READINESS_GATE_OK, 0);
});
