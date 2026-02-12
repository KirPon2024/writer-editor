const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const REQUIRED_BASELINE = {
  CRITICAL_CLAIM_MATRIX_OK: 1,
  CORE_SOT_EXECUTABLE_OK: 1,
  COMMAND_SURFACE_ENFORCED_OK: 1,
  CAPABILITY_ENFORCED_OK: 1,
  RECOVERY_IO_OK: 1,
  PERF_BASELINE_OK: 1,
  GOVERNANCE_STRICT_OK: 1,
  XPLAT_CONTRACT_OK: 1,
  HEAD_STRICT_OK: 1,
  TOKEN_DECLARATION_VALID_OK: 1,
  SCR_SHARED_CODE_RATIO_OK: 1,
  DRIFT_UNRESOLVED_P0_COUNT: 0,
  DEBT_TTL_VALID_OK: 1,
};

let evaluatorModulePromise = null;

function loadEvaluatorModule() {
  if (!evaluatorModulePromise) {
    const href = pathToFileURL(path.join(process.cwd(), 'scripts/ops/freeze-mode-evaluator.mjs')).href;
    evaluatorModulePromise = import(href);
  }
  return evaluatorModulePromise;
}

function parseTokens(stdout) {
  const map = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const normalized = line.startsWith('DOCTOR_TOKEN ')
      ? line.slice('DOCTOR_TOKEN '.length).trim()
      : line;
    const idx = normalized.indexOf('=');
    if (idx <= 0) continue;
    map.set(normalized.slice(0, idx), normalized.slice(idx + 1));
  }
  return map;
}

test('freeze mode strict: FREEZE_MODE!=1 passes regardless of baseline token values', async () => {
  const { evaluateFreezeModeFromRollups } = await loadEvaluatorModule();
  const state = evaluateFreezeModeFromRollups({
    ...REQUIRED_BASELINE,
    CORE_SOT_EXECUTABLE_OK: 0,
    CAPABILITY_ENFORCED_OK: 0,
    DEBT_TTL_VALID_OK: 0,
    DRIFT_UNRESOLVED_P0_COUNT: 7,
  }, { freezeModeEnabled: false });

  assert.equal(state.freezeMode, false);
  assert.equal(state.ok, true);
  assert.equal(state.FREEZE_MODE_STRICT_OK, 1);
  assert.deepEqual(state.missingTokens, []);
  assert.deepEqual(state.violations, []);
});

test('freeze mode strict: FREEZE_MODE=1 fails when any required baseline token is not 1', async () => {
  const { evaluateFreezeModeFromRollups } = await loadEvaluatorModule();
  const state = evaluateFreezeModeFromRollups({
    ...REQUIRED_BASELINE,
    CORE_SOT_EXECUTABLE_OK: 0,
  }, { freezeModeEnabled: true });

  assert.equal(state.freezeMode, true);
  assert.equal(state.ok, false);
  assert.equal(state.FREEZE_MODE_STRICT_OK, 0);
  assert.equal(state.missingTokens.includes('CORE_SOT_EXECUTABLE_OK'), true);
});

test('freeze mode strict: FREEZE_MODE=1 passes when baseline is fully green', async () => {
  const { evaluateFreezeModeFromRollups } = await loadEvaluatorModule();
  const state = evaluateFreezeModeFromRollups(REQUIRED_BASELINE, { freezeModeEnabled: true });

  assert.equal(state.freezeMode, true);
  assert.equal(state.ok, true);
  assert.equal(state.FREEZE_MODE_STRICT_OK, 1);
  assert.deepEqual(state.missingTokens, []);
  assert.deepEqual(state.violations, []);
});

test('freeze mode strict: missingTokens list is deterministic and lexicographically sorted', async () => {
  const { evaluateFreezeModeFromRollups } = await loadEvaluatorModule();
  const state = evaluateFreezeModeFromRollups({
    ...REQUIRED_BASELINE,
    TOKEN_DECLARATION_VALID_OK: 0,
    CAPABILITY_ENFORCED_OK: 0,
    ADAPTERS_ENFORCED_OK: 0,
  }, { freezeModeEnabled: true });

  assert.equal(state.ok, false);
  assert.deepEqual(state.missingTokens, [
    'CAPABILITY_ENFORCED_OK',
    'TOKEN_DECLARATION_VALID_OK',
  ]);
});

test('freeze mode strict state script does not parse stdout and does not import doctor', () => {
  const filePath = path.join(process.cwd(), 'scripts/ops/freeze-mode-state.mjs');
  const text = fs.readFileSync(filePath, 'utf8');
  assert.equal(/spawnSync\s*\(/u.test(text), false);
  assert.equal(text.includes('scripts/doctor.mjs'), false);
  assert.equal(text.includes('extract-truth-table.mjs'), false);
});

test('freeze mode strict token is visible in truth-table, ops-summary and doctor', () => {
  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthTable = JSON.parse(String(truth.stdout || '{}'));
  assert.equal(truthTable.FREEZE_MODE_STRICT_OK, 1);

  const summary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.ok(summary.status === 0 || summary.status === 1, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryTokens = parseTokens(summary.stdout);
  assert.equal(summaryTokens.get('OPS_SUMMARY_FREEZE_MODE_STRICT_OK'), '1');

  const doctor = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.ok(doctor.status === 0 || doctor.status === 1, `doctor failed:\n${doctor.stdout}\n${doctor.stderr}`);
  const doctorTokens = parseTokens(doctor.stdout);
  assert.equal(doctorTokens.get('FREEZE_MODE_STRICT_OK'), '1');
});
