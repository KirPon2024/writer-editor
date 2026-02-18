const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PERF_BASELINE_SCRIPT = path.join(process.cwd(), 'scripts/perf/perf-baseline.mjs');
const FAILSIGNAL_REGISTRY_PATH = path.join(process.cwd(), 'docs/OPS/FAILSIGNALS/FAILSIGNAL_REGISTRY.json');
const TOKEN_CATALOG_PATH = path.join(process.cwd(), 'docs/OPS/TOKENS/TOKEN_CATALOG.json');
const REQUIRED_SET_PATH = path.join(process.cwd(), 'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runPerfBaselineCheck(mode, baselinePath, perfJsonPath) {
  return spawnSync(
    process.execPath,
    [PERF_BASELINE_SCRIPT, 'check', '--mode', mode, '--baseline', baselinePath, '--perf-json', perfJsonPath, '--json'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
}

function flattenStrings(input, out = []) {
  if (Array.isArray(input)) {
    input.forEach((item) => flattenStrings(item, out));
    return out;
  }
  if (!input || typeof input !== 'object') {
    if (typeof input === 'string') out.push(input);
    return out;
  }
  Object.values(input).forEach((value) => flattenStrings(value, out));
  return out;
}

test('perf ci promotion mode: release mode regression breach is advisory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-ci-release-'));
  const baselinePath = path.join(tmpDir, 'baseline.json');
  const perfPath = path.join(tmpDir, 'perf-breach.json');

  fs.writeFileSync(baselinePath, `${JSON.stringify({
    fixture: 'test/fixtures/perf/long-scene.txt',
    updatedAt: '2026-02-17',
    machine: { os: 'test-os', cpu: 'test-cpu', node: 'v20' },
    metrics: {
      openP95Ms: 100,
      typeBurstP95Ms: 100,
      saveP95Ms: 100,
      reopenP95Ms: 100,
      longTaskCount: 0,
    },
    tolerances: {
      openP95MsPct: 1,
      typeBurstP95MsPct: 1,
      saveP95MsPct: 1,
      reopenP95MsPct: 1,
      longTaskCountAbs: 0,
    },
  }, null, 2)}\n`);

  fs.writeFileSync(perfPath, `${JSON.stringify({
    fixturePath: 'test/fixtures/perf/long-scene.txt',
    metrics: {
      openP95Ms: 200,
      typeBurstP95Ms: 200,
      saveP95Ms: 200,
      reopenP95Ms: 200,
      longTaskCount: 10,
    },
  }, null, 2)}\n`);

  const result = runPerfBaselineCheck('release', baselinePath, perfPath);
  assert.equal(result.status, 0, `expected advisory release pass:\n${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(String(result.stdout || '{}'));
  assert.equal(payload.checkMode, 'release');
  assert.equal(payload.status, 'WARN');
  assert.ok(Array.isArray(payload.failures));
  assert.ok(payload.failures.length > 0);
});

test('perf ci promotion mode: promotion mode regression breach blocks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-ci-promotion-'));
  const baselinePath = path.join(tmpDir, 'baseline.json');
  const perfPath = path.join(tmpDir, 'perf-breach.json');

  fs.writeFileSync(baselinePath, `${JSON.stringify({
    fixture: 'test/fixtures/perf/long-scene.txt',
    updatedAt: '2026-02-17',
    machine: { os: 'test-os', cpu: 'test-cpu', node: 'v20' },
    metrics: {
      openP95Ms: 100,
      typeBurstP95Ms: 100,
      saveP95Ms: 100,
      reopenP95Ms: 100,
      longTaskCount: 0,
    },
    tolerances: {
      openP95MsPct: 1,
      typeBurstP95MsPct: 1,
      saveP95MsPct: 1,
      reopenP95MsPct: 1,
      longTaskCountAbs: 0,
    },
  }, null, 2)}\n`);

  fs.writeFileSync(perfPath, `${JSON.stringify({
    fixturePath: 'test/fixtures/perf/long-scene.txt',
    metrics: {
      openP95Ms: 200,
      typeBurstP95Ms: 200,
      saveP95Ms: 200,
      reopenP95Ms: 200,
      longTaskCount: 10,
    },
  }, null, 2)}\n`);

  const result = runPerfBaselineCheck('promotion', baselinePath, perfPath);
  assert.notEqual(result.status, 0, 'expected promotion blocking failure');
  const payload = JSON.parse(String(result.stdout || '{}'));
  assert.equal(payload.checkMode, 'promotion');
  assert.equal(payload.status, 'FAIL');
  assert.ok(Array.isArray(payload.failures));
  assert.ok(payload.failures.length > 0);
});

test('perf ci promotion mode: failsignal and token are registered without required-set expansion', () => {
  const failSignals = readJson(FAILSIGNAL_REGISTRY_PATH);
  const tokens = readJson(TOKEN_CATALOG_PATH);
  const requiredSet = readJson(REQUIRED_SET_PATH);

  const perfFailSignal = (failSignals.failSignals || []).find((item) => item && item.code === 'E_PERF_BASELINE_REGRESSION');
  assert.ok(perfFailSignal, 'missing E_PERF_BASELINE_REGRESSION in failsignal registry');

  const perfToken = (tokens.tokens || []).find((item) => item && item.tokenId === 'PERF_BASELINE_WITHIN_DELTA_OK');
  assert.ok(perfToken, 'missing PERF_BASELINE_WITHIN_DELTA_OK in token catalog');
  assert.equal(perfToken.failSignalCode, 'E_PERF_BASELINE_REGRESSION');

  const flattenedRequiredSet = flattenStrings(requiredSet).map((value) => String(value || '').trim());
  assert.equal(flattenedRequiredSet.includes('PERF_BASELINE_WITHIN_DELTA_OK'), false);
});
