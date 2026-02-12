const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const EXPECTED_REQUIRED_TOKENS = [
  'ADAPTERS_ENFORCED_OK',
  'CAPABILITY_ENFORCED_OK',
  'COMMAND_SURFACE_ENFORCED_OK',
  'CORE_SOT_EXECUTABLE_OK',
  'CRITICAL_CLAIM_MATRIX_OK',
  'FREEZE_MODE_STRICT_OK',
  'GOVERNANCE_STRICT_OK',
  'HEAD_STRICT_OK',
  'PERF_BASELINE_OK',
  'RECOVERY_IO_OK',
  'RELEASE_ARTIFACT_SOURCES_OK',
  'TOKEN_DECLARATION_VALID_OK',
  'XPLAT_CONTRACT_MACOS_SIGNING_READY_OK',
].slice().sort();

let evaluatorModulePromise = null;

function loadEvaluatorModule() {
  if (!evaluatorModulePromise) {
    const href = pathToFileURL(path.join(process.cwd(), 'scripts/ops/freeze-ready-evaluator.mjs')).href;
    evaluatorModulePromise = import(href);
  }
  return evaluatorModulePromise;
}

function runFreezeReadyState(env = {}) {
  const result = spawnSync(process.execPath, ['scripts/ops/freeze-ready-state.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
  assert.equal(result.status, 0, `freeze-ready-state failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(String(result.stdout || '{}'));
}

test('freeze-ready state: emits deterministic JSON shape with stable sorted arrays', () => {
  const payload = runFreezeReadyState();
  assert.equal(typeof payload.ok, 'boolean');
  assert.ok(payload.freezeMode === 0 || payload.freezeMode === 1);
  assert.ok(Array.isArray(payload.missingTokens));
  assert.ok(Array.isArray(payload.failures));
  assert.ok(Array.isArray(payload.requiredTokens));

  const missingSorted = [...payload.missingTokens].sort();
  const failuresSorted = [...payload.failures].sort();
  const requiredSorted = [...payload.requiredTokens].sort();
  assert.deepEqual(payload.missingTokens, missingSorted);
  assert.deepEqual(payload.failures, failuresSorted);
  assert.deepEqual(payload.requiredTokens, requiredSorted);

  assert.equal(new Set(payload.missingTokens).size, payload.missingTokens.length);
  assert.equal(new Set(payload.failures).size, payload.failures.length);
  assert.match(String(payload.fileSha256 || ''), /^[0-9a-f]{64}$/u);
});

test('freeze-ready state: requiredTokens baseline is fixed and sorted', () => {
  const payload = runFreezeReadyState();
  assert.deepEqual(payload.requiredTokens, EXPECTED_REQUIRED_TOKENS);
});

test('freeze-ready state: repeated run returns identical JSON', () => {
  const runA = runFreezeReadyState({ FREEZE_MODE: '1' });
  const runB = runFreezeReadyState({ FREEZE_MODE: '1' });
  assert.deepEqual(runA, runB);
});

test('freeze-ready evaluator: FREEZE_MODE=1 cannot be ok=true when HEAD_STRICT_OK=0', async () => {
  const { evaluateFreezeReady } = await loadEvaluatorModule();
  const payload = evaluateFreezeReady({
    freezeMode: 1,
    rollupsJson: {
      ADAPTERS_ENFORCED_OK: 1,
      CAPABILITY_ENFORCED_OK: 1,
      COMMAND_SURFACE_ENFORCED_OK: 1,
      CORE_SOT_EXECUTABLE_OK: 1,
      CRITICAL_CLAIM_MATRIX_OK: 1,
      FREEZE_MODE_STRICT_OK: 1,
      GOVERNANCE_STRICT_OK: 1,
      HEAD_STRICT_OK: 0,
      PERF_BASELINE_OK: 1,
      RECOVERY_IO_OK: 1,
      RELEASE_ARTIFACT_SOURCES_OK: 1,
      TOKEN_DECLARATION_VALID_OK: 1,
      XPLAT_CONTRACT_MACOS_SIGNING_READY_OK: 1,
    },
    truthTableJson: {},
  });
  assert.equal(payload.ok, false);
  assert.ok(payload.missingTokens.includes('HEAD_STRICT_OK'));
});

test('freeze-ready evaluator: FREEZE_MODE=1 cannot be ok=true when FREEZE_MODE_STRICT_OK=0', async () => {
  const { evaluateFreezeReady } = await loadEvaluatorModule();
  const payload = evaluateFreezeReady({
    freezeMode: 1,
    rollupsJson: {
      ADAPTERS_ENFORCED_OK: 1,
      CAPABILITY_ENFORCED_OK: 1,
      COMMAND_SURFACE_ENFORCED_OK: 1,
      CORE_SOT_EXECUTABLE_OK: 1,
      CRITICAL_CLAIM_MATRIX_OK: 1,
      FREEZE_MODE_STRICT_OK: 0,
      GOVERNANCE_STRICT_OK: 1,
      HEAD_STRICT_OK: 1,
      PERF_BASELINE_OK: 1,
      RECOVERY_IO_OK: 1,
      RELEASE_ARTIFACT_SOURCES_OK: 1,
      TOKEN_DECLARATION_VALID_OK: 1,
      XPLAT_CONTRACT_MACOS_SIGNING_READY_OK: 1,
    },
    truthTableJson: {},
  });
  assert.equal(payload.ok, false);
  assert.ok(payload.missingTokens.includes('FREEZE_MODE_STRICT_OK'));
});

test('freeze-ready evaluator is pure (no spawn/fs/network usage)', () => {
  const evaluatorPath = path.join(process.cwd(), 'scripts/ops/freeze-ready-evaluator.mjs');
  const text = fs.readFileSync(evaluatorPath, 'utf8');
  assert.equal(/spawnSync\s*\(/u.test(text), false);
  assert.equal(/from\s+['"]node:fs['"]/u.test(text), false);
  assert.equal(/from\s+['"]node:net['"]/u.test(text), false);
  assert.equal(/from\s+['"]node:https?['"]/u.test(text), false);
});

test('freeze-ready state does not use doctor as source and does not parse doctor stdout', () => {
  const statePath = path.join(process.cwd(), 'scripts/ops/freeze-ready-state.mjs');
  const text = fs.readFileSync(statePath, 'utf8');
  assert.equal(text.includes('scripts/doctor.mjs'), false);
  assert.equal(text.includes('DOCTOR_TOKEN'), false);
});
