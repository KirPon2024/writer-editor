const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PACKAGE_PATH = path.join(process.cwd(), 'package.json');
const BASELINE_PATH = path.join(process.cwd(), 'docs/OPS/PERF/PERF_LITE_BASELINE.json');
const REQUIRED_SET_PATH = path.join(process.cwd(), 'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json');
const RUN_TESTS_PATH = path.join(process.cwd(), 'scripts/run-tests.js');
const PERF_BASELINE_SCRIPT = path.join(process.cwd(), 'scripts/perf/perf-baseline.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenTokenValues(input, out = []) {
  if (Array.isArray(input)) {
    input.forEach((item) => flattenTokenValues(item, out));
    return out;
  }
  if (!input || typeof input !== 'object') {
    return out;
  }
  for (const value of Object.values(input)) {
    if (typeof value === 'string') out.push(value);
    else flattenTokenValues(value, out);
  }
  return out;
}

function runPerfBaseline(mode, extraArgs = []) {
  return spawnSync(process.execPath, [PERF_BASELINE_SCRIPT, mode, '--json', ...extraArgs], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

test('perf baseline contract: snapshot schema and scripts are present', () => {
  const pkg = readJson(PACKAGE_PATH);
  assert.equal(typeof pkg.scripts['perf:baseline:update'], 'string');
  assert.equal(typeof pkg.scripts['perf:baseline:check'], 'string');
  assert.equal(fs.existsSync(PERF_BASELINE_SCRIPT), true);
  assert.equal(fs.existsSync(BASELINE_PATH), true);

  const baseline = readJson(BASELINE_PATH);
  assert.equal(typeof baseline.fixture, 'string');
  assert.equal(typeof baseline.updatedAt, 'string');
  assert.equal(typeof baseline.machine, 'object');
  assert.equal(typeof baseline.metrics, 'object');
  assert.equal(typeof baseline.tolerances, 'object');

  for (const metric of ['openP95Ms', 'typeBurstP95Ms', 'saveP95Ms', 'reopenP95Ms', 'longTaskCount']) {
    assert.ok(Number.isFinite(Number(baseline.metrics[metric])), `metric must be numeric: ${metric}`);
  }
  for (const tolerance of ['openP95MsPct', 'typeBurstP95MsPct', 'saveP95MsPct', 'reopenP95MsPct', 'longTaskCountAbs']) {
    assert.ok(Number.isFinite(Number(baseline.tolerances[tolerance])), `tolerance must be numeric: ${tolerance}`);
  }
});

test('perf baseline contract: baseline and delta guard are not wired into release required-set or dev fast lane', () => {
  const requiredSet = readJson(REQUIRED_SET_PATH);
  const tokens = flattenTokenValues(requiredSet).map((token) => String(token || '').trim());
  for (const forbidden of ['PERF_LITE_OK', 'PERF_LITE_BASELINE_OK', 'PERF_LITE_DELTA_GUARD_OK']) {
    assert.equal(tokens.includes(forbidden), false, `forbidden token in required set: ${forbidden}`);
  }

  const pkg = readJson(PACKAGE_PATH);
  const fastScript = String(pkg.scripts['dev:fast'] || '');
  const testScript = String(pkg.scripts.test || '');
  const runTestsSource = fs.readFileSync(RUN_TESTS_PATH, 'utf8');
  assert.equal(fastScript.includes('perf:baseline'), false);
  assert.equal(testScript.includes('perf:baseline'), false);
  assert.equal(runTestsSource.includes("'perf:baseline:check'"), true);
  assert.equal(runTestsSource.includes('--mode=${checkMode}'), true);
  assert.equal(runTestsSource.includes("const checkMode = isPromotionMode ? 'promotion' : 'release';"), true);
});

test('perf baseline contract: delta guard passes with aligned sample and promotion mode blocks degraded sample', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-baseline-delta-'));
  const baselinePath = path.join(tmpDir, 'PERF_LITE_BASELINE.json');
  const currentGoodPath = path.join(tmpDir, 'current-good.json');
  const currentBadPath = path.join(tmpDir, 'current-bad.json');

  const baselineDoc = {
    fixture: 'test/fixtures/perf/long-scene.txt',
    updatedAt: '2026-02-17',
    machine: { os: 'test', cpu: 'test', node: 'v20' },
    metrics: {
      openP95Ms: 40,
      typeBurstP95Ms: 30,
      saveP95Ms: 25,
      reopenP95Ms: 35,
      longTaskCount: 1,
    },
    tolerances: {
      openP95MsPct: 35,
      typeBurstP95MsPct: 35,
      saveP95MsPct: 35,
      reopenP95MsPct: 35,
      longTaskCountAbs: 5,
    },
  };

  const currentGood = {
    fixturePath: baselineDoc.fixture,
    metrics: {
      openP95Ms: 48,
      typeBurstP95Ms: 35,
      saveP95Ms: 31,
      reopenP95Ms: 42,
      longTaskCount: 4,
    },
  };

  const currentBad = {
    fixturePath: baselineDoc.fixture,
    metrics: {
      openP95Ms: 90,
      typeBurstP95Ms: 75,
      saveP95Ms: 70,
      reopenP95Ms: 95,
      longTaskCount: 20,
    },
  };

  fs.writeFileSync(baselinePath, `${JSON.stringify(baselineDoc, null, 2)}\n`);
  fs.writeFileSync(currentGoodPath, `${JSON.stringify(currentGood, null, 2)}\n`);
  fs.writeFileSync(currentBadPath, `${JSON.stringify(currentBad, null, 2)}\n`);

  const good = runPerfBaseline('check', ['--baseline', baselinePath, '--perf-json', currentGoodPath]);
  assert.equal(good.status, 0, `expected check pass:\n${good.stdout}\n${good.stderr}`);
  const goodPayload = JSON.parse(good.stdout);
  assert.equal(goodPayload.status, 'PASS');

  const bad = runPerfBaseline('check', ['--mode', 'promotion', '--baseline', baselinePath, '--perf-json', currentBadPath]);
  assert.notEqual(bad.status, 0, 'expected check fail for degraded metrics');
  const badPayload = JSON.parse(bad.stdout);
  assert.equal(badPayload.status, 'FAIL');
  assert.ok(Array.isArray(badPayload.failures));
  assert.ok(badPayload.failures.length > 0);
});
