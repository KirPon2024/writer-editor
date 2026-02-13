const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

let generatorModulePromise = null;

const SCRIPT_PATH = 'scripts/ops/conditional-gates-state.mjs';
const PROFILE_PATH = path.join(process.cwd(), 'docs/OPS/EXECUTION/EXECUTION_PROFILE.example.json');

function loadGeneratorModule() {
  if (!generatorModulePromise) {
    const href = pathToFileURL(path.join(process.cwd(), 'scripts/ops/generate-required-token-set.mjs')).href;
    generatorModulePromise = import(href);
  }
  return generatorModulePromise;
}

function readProfile() {
  return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
}

function buildProfile(overrides = {}) {
  const profile = readProfile();
  if (!profile.scopeFlags || typeof profile.scopeFlags !== 'object') profile.scopeFlags = {};
  if (!profile.requiredSets || typeof profile.requiredSets !== 'object') profile.requiredSets = {};
  const release = Array.isArray(profile.requiredSets.release) ? profile.requiredSets.release : [];
  profile.requiredSets.release = [...new Set([...release, 'PERF_BASELINE_OK', 'SCR_SHARED_CODE_RATIO_OK'])];
  for (const [key, value] of Object.entries(overrides)) {
    profile.scopeFlags[key] = value;
    if (key === 'RELEASE_SCOPE_PERF') {
      profile.requirePerfBaseline = value;
    }
    if (key === 'ECONOMIC_CLAIM_SHARED_CODE') {
      profile.economicClaimDeclared = value;
      profile.requireScrSharedRatio = value;
    }
  }
  return profile;
}

function readReleaseTokens(state) {
  return Array.isArray(state && state.requiredTokenSet && state.requiredTokenSet.requiredSets
    ? state.requiredTokenSet.requiredSets.release
    : [])
    ? state.requiredTokenSet.requiredSets.release
    : [];
}

function runState(args = []) {
  return spawnSync(process.execPath, [SCRIPT_PATH, '--json', ...args], {
    encoding: 'utf8',
  });
}

function parseJsonStdout(result) {
  let parsed = null;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON:\n${result.stdout}\n${result.stderr}`);
  return parsed;
}

test('Case A: RELEASE_SCOPE_PERF=0 excludes PERF_BASELINE_OK from release set', async () => {
  const { buildRequiredTokenSetFromProfile } = await loadGeneratorModule();
  const state = buildRequiredTokenSetFromProfile(buildProfile({ RELEASE_SCOPE_PERF: false }));
  assert.equal(state.ok, true);
  assert.equal(readReleaseTokens(state).includes('PERF_BASELINE_OK'), false);
});

test('Case B: RELEASE_SCOPE_PERF=1 includes PERF_BASELINE_OK in release set', async () => {
  const { buildRequiredTokenSetFromProfile } = await loadGeneratorModule();
  const state = buildRequiredTokenSetFromProfile(buildProfile({ RELEASE_SCOPE_PERF: true }));
  assert.equal(state.ok, true);
  assert.equal(readReleaseTokens(state).includes('PERF_BASELINE_OK'), true);
});

test('Case C: ECONOMIC_CLAIM_SHARED_CODE=0 excludes SCR_SHARED_CODE_RATIO_OK from release set', async () => {
  const { buildRequiredTokenSetFromProfile } = await loadGeneratorModule();
  const state = buildRequiredTokenSetFromProfile(buildProfile({ ECONOMIC_CLAIM_SHARED_CODE: false }));
  assert.equal(state.ok, true);
  assert.equal(readReleaseTokens(state).includes('SCR_SHARED_CODE_RATIO_OK'), false);
});

test('Case D: ECONOMIC_CLAIM_SHARED_CODE=1 includes SCR_SHARED_CODE_RATIO_OK in release set', async () => {
  const { buildRequiredTokenSetFromProfile } = await loadGeneratorModule();
  const state = buildRequiredTokenSetFromProfile(buildProfile({ ECONOMIC_CLAIM_SHARED_CODE: true }));
  assert.equal(state.ok, true);
  assert.equal(readReleaseTokens(state).includes('SCR_SHARED_CODE_RATIO_OK'), true);
});

test('conditional-gates state: baseline emits CONDITIONAL_GATES_BOUND_OK=1', () => {
  const result = runState();
  assert.equal(result.status, 0, `expected success:\n${result.stdout}\n${result.stderr}`);
  const payload = parseJsonStdout(result);
  assert.equal(payload.CONDITIONAL_GATES_BOUND_OK, 1);
  assert.equal(payload.ok, true);
  assert.equal(payload.failSignalCode, '');
});

test('conditional-gates state: misapplied generator emits E_CONDITIONAL_GATE_MISAPPLIED', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conditional-gates-'));
  const mockPath = path.join(tmpDir, 'mock-generator.mjs');
  fs.writeFileSync(mockPath, [
    'export function evaluateGenerateRequiredTokenSetState() {',
    '  return {',
    '    ok: true,',
    '    failures: [],',
    '    requiredTokenSet: {',
    '      requiredSets: {',
    '        release: ["PERF_BASELINE_OK", "SCR_SHARED_CODE_RATIO_OK"]',
    '      }',
    '    }',
    '  };',
    '}',
    '',
  ].join('\n'), 'utf8');

  const result = runState(['--generator-module', mockPath]);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.notEqual(result.status, 0, 'expected non-zero status for misapplied generator');
  const payload = parseJsonStdout(result);
  assert.equal(payload.CONDITIONAL_GATES_BOUND_OK, 0);
  assert.equal(payload.failSignalCode, 'E_CONDITIONAL_GATE_MISAPPLIED');
  assert.equal(payload.failSignal.code, 'E_CONDITIONAL_GATE_MISAPPLIED');
});
