const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

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

async function loadEvaluator() {
  const fileUrl = pathToFileURL(path.resolve('scripts/ops/freeze-ready-evaluator.mjs')).href;
  return import(fileUrl);
}

test('freeze-ready evaluator: one required token at 0 makes freezeReady=false', async () => {
  const { evaluateFreezeReadyFromRollups } = await loadEvaluator();
  const rollups = {
    CRITICAL_CLAIM_MATRIX_OK: 1,
    CORE_SOT_EXECUTABLE_OK: 1,
    COMMAND_SURFACE_ENFORCED_OK: 1,
    CAPABILITY_ENFORCED_OK: 0,
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

  const state = evaluateFreezeReadyFromRollups(rollups);
  assert.equal(state.freezeReady, false);
  assert.equal(state.FREEZE_READY_OK, 0);
  assert.deepEqual(state.missingTokens, ['CAPABILITY_ENFORCED_OK']);
});

test('freeze-ready evaluator: all required constraints produce freezeReady=true', async () => {
  const { evaluateFreezeReadyFromRollups } = await loadEvaluator();
  const rollups = {
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

  const state = evaluateFreezeReadyFromRollups(rollups);
  assert.equal(state.freezeReady, true);
  assert.equal(state.FREEZE_READY_OK, 1);
  assert.deepEqual(state.missingTokens, []);
  assert.equal(state.driftCount, 0);
  assert.equal(state.debtTTLValid, true);
});

test('freeze-ready evaluator: missingTokens output is deterministic and lexicographically sorted', async () => {
  const { evaluateFreezeReadyFromRollups } = await loadEvaluator();
  const state = evaluateFreezeReadyFromRollups({
    CRITICAL_CLAIM_MATRIX_OK: 1,
    CORE_SOT_EXECUTABLE_OK: 0,
    COMMAND_SURFACE_ENFORCED_OK: 0,
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
  });
  assert.deepEqual(state.missingTokens, [
    'COMMAND_SURFACE_ENFORCED_OK',
    'CORE_SOT_EXECUTABLE_OK',
  ]);
});

test('freeze-ready state script does not depend on stdout parsing and does not import doctor', () => {
  const text = fs.readFileSync('scripts/ops/freeze-ready-state.mjs', 'utf8');
  assert.equal(text.includes('spawnSync'), false);
  assert.equal(text.includes('scripts/doctor.mjs'), false);
  assert.equal(text.includes('extract-truth-table'), false);
  assert.equal(text.includes('stdout'), false);
});

test('freeze-ready state json is deterministic shape and authoritative token is emitted across chain', () => {
  const stateA = spawnSync(process.execPath, ['scripts/ops/freeze-ready-state.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  assert.equal(stateA.status, 0, `freeze-ready-state failed:\n${stateA.stdout}\n${stateA.stderr}`);
  const payloadA = JSON.parse(String(stateA.stdout || '{}'));
  assert.deepEqual(Object.keys(payloadA), [
    'freezeReady',
    'missingTokens',
    'driftCount',
    'debtTTLValid',
    'FREEZE_READY_OK',
  ]);

  const stateB = spawnSync(process.execPath, ['scripts/ops/freeze-ready-state.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  assert.equal(stateB.status, 0, `second freeze-ready-state failed:\n${stateB.stdout}\n${stateB.stderr}`);
  const payloadB = JSON.parse(String(stateB.stdout || '{}'));
  assert.deepEqual(payloadA, payloadB);

  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthDoc = JSON.parse(String(truth.stdout || '{}'));
  assert.equal(truthDoc.FREEZE_READY_OK, 1);

  const summary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  assert.ok(summary.status === 0 || summary.status === 1, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryTokens = parseTokens(summary.stdout);
  assert.equal(summaryTokens.get('OPS_SUMMARY_FREEZE_READY_OK'), '1');

  const doctor = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  assert.ok(doctor.status === 0 || doctor.status === 1, `doctor failed:\n${doctor.stdout}\n${doctor.stderr}`);
  const doctorTokens = parseTokens(doctor.stdout);
  assert.equal(doctorTokens.get('FREEZE_READY_OK'), '1');
});
