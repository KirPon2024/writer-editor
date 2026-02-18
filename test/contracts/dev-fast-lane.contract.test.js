const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PACKAGE_JSON_PATH = path.join(process.cwd(), 'package.json');
const RUN_TESTS_PATH = path.join(process.cwd(), 'scripts/run-tests.js');
const CURRENT_WAVE_GUARD_PATH = path.join(process.cwd(), 'scripts/guards/ops-current-wave-stop.mjs');

const EXPECTED_FAST_TESTS = Object.freeze([
  'test/contracts/menu-config-backcompat.contract.test.js',
  'test/contracts/codex-no-repo-prompts.contract.test.js',
  'test/contracts/command-surface-bus-only.contract.test.js',
  'test/contracts/transition-exit-failsignal-token-wiring.contract.test.js',
]);

const FORBIDDEN_FAST_SEGMENTS = Object.freeze([
  'scripts/ops/run-wave.mjs',
  'scripts/guards/ops-current-wave-stop.mjs',
  'ops:current-wave',
  'ops_synth_negative.test.js',
  'OPS_SYNTH_OVERRIDE_',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runFastLaneDryRun() {
  return spawnSync(process.execPath, ['scripts/run-tests.js', 'fast', '--dry-run'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DEV_FAST_LANE: '1',
    },
  });
}

test('dev fast lane: npm script exists and does not call heavy entrypoints', () => {
  const pkg = readJson(PACKAGE_JSON_PATH);
  assert.ok(pkg && pkg.scripts && typeof pkg.scripts === 'object', 'scripts block must exist');
  assert.equal(typeof pkg.scripts['dev:fast'], 'string', 'dev:fast script must exist');

  const cmd = String(pkg.scripts['dev:fast']);
  assert.ok(cmd.includes("scripts/run-tests.js', 'fast"), 'dev:fast must call run-tests.js fast mode');
  for (const forbidden of FORBIDDEN_FAST_SEGMENTS) {
    assert.equal(cmd.includes(forbidden), false, `dev:fast must not reference ${forbidden}`);
  }
});

test('dev fast lane: dry-run plan enforces doctor once and targeted contracts only', () => {
  const result = runFastLaneDryRun();
  assert.equal(result.status, 0, `fast dry-run must succeed:\n${result.stdout}\n${result.stderr}`);

  let plan = null;
  assert.doesNotThrow(() => {
    plan = JSON.parse(String(result.stdout || '{}'));
  }, `dry-run output must be JSON:\n${result.stdout}\n${result.stderr}`);

  assert.equal(plan.mode, 'fast');
  assert.equal(plan.doctorRunCount, 1);
  assert.equal(Array.isArray(plan.testFiles), true);
  assert.deepEqual(plan.testFiles, EXPECTED_FAST_TESTS);
  assert.equal(Array.isArray(plan.forbiddenHits), true);
  assert.equal(plan.forbiddenHits.length, 0);

  const doctorCommand = String(plan.doctorCommand || '');
  assert.ok(doctorCommand.includes('scripts/doctor.mjs --strict'), 'doctor must run in strict mode');

  const testCommand = String(plan.testCommand || '');
  for (const filePath of EXPECTED_FAST_TESTS) {
    assert.ok(testCommand.includes(filePath), `fast test command must include ${filePath}`);
  }
  for (const forbidden of FORBIDDEN_FAST_SEGMENTS) {
    assert.equal(testCommand.includes(forbidden), false, `fast plan must not include ${forbidden}`);
  }
});

test('dev fast lane: run-tests fast implementation keeps heavy synth helper isolated from fast branch', () => {
  const source = fs.readFileSync(RUN_TESTS_PATH, 'utf8');
  assert.ok(source.includes("modeArg === 'fast'"), 'run-tests fast branch must exist');
  assert.ok(source.includes('runFastLane(rootDir, dryRun)'), 'fast branch must execute dedicated fast lane runner');
  assert.ok(source.includes('runOpsSynthNegativeTests(rootDir)'), 'heavy synth helper must still exist for non-fast lanes');
});

test('dev fast lane: ops current-wave guard respects DEV_FAST_LANE and exits without heavy checks', () => {
  const result = spawnSync(process.execPath, [CURRENT_WAVE_GUARD_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DEV_FAST_LANE: '1',
    },
  });

  assert.equal(result.status, 0, `guard must pass in dev fast lane:\n${result.stdout}\n${result.stderr}`);
  const stdout = String(result.stdout || '');
  assert.ok(stdout.includes('CURRENT_WAVE_STOP_CONDITION_OK=1'));
  assert.ok(stdout.includes('CURRENT_WAVE_STOP_CONDITION_FAIL_REASON=DEV_FAST_LANE_BYPASS'));
  assert.ok(stdout.includes('CURRENT_WAVE_STOP_CONDITION_GUARD_OK=1'));
});
