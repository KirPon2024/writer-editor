const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = 'scripts/ops/failsignal-registry-state.mjs';
const DEFAULT_REGISTRY_PATH = path.join(process.cwd(), 'docs/OPS/FAILSIGNALS/FAILSIGNAL_REGISTRY.json');

function runState(args = []) {
  return spawnSync(process.execPath, [SCRIPT_PATH, '--json', ...args], {
    encoding: 'utf8',
  });
}

function parseJsonOutput(result) {
  let parsed = null;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON output:\n${result.stdout}\n${result.stderr}`);
  return parsed;
}

function withMutatedRegistry(mutator, run) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsignal-registry-'));
  const tmpRegistryPath = path.join(tmpDir, 'FAILSIGNAL_REGISTRY.json');
  try {
    const base = JSON.parse(fs.readFileSync(DEFAULT_REGISTRY_PATH, 'utf8'));
    const next = mutator(JSON.parse(JSON.stringify(base)));
    fs.writeFileSync(tmpRegistryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    run(tmpRegistryPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('failsignal registry: valid registry emits FAILSIGNAL_REGISTRY_VALID_OK=1', () => {
  const result = runState();
  assert.equal(result.status, 0, `expected success:\n${result.stdout}\n${result.stderr}`);
  const payload = parseJsonOutput(result);
  assert.equal(payload.FAILSIGNAL_REGISTRY_VALID_OK, 1);
  assert.equal(payload.ok, true);
  assert.equal(payload.failSignalCode, '');
  assert.equal(payload.failSignal, null);
  assert.ok(payload.failSignalCount >= 1);
});

test('failsignal registry: duplicate code fails with E_FAILSIGNAL_DUPLICATE', () => {
  withMutatedRegistry((doc) => {
    doc.failSignals.push({ ...doc.failSignals[0] });
    return doc;
  }, (registryPath) => {
    const result = runState(['--registry-path', registryPath]);
    assert.notEqual(result.status, 0, 'expected non-zero status for duplicate code');
    const payload = parseJsonOutput(result);
    assert.equal(payload.FAILSIGNAL_REGISTRY_VALID_OK, 0);
    assert.equal(payload.failSignalCode, 'E_FAILSIGNAL_DUPLICATE');
    assert.equal(payload.failSignal.code, 'E_FAILSIGNAL_DUPLICATE');
  });
});

test('failsignal registry: blocking signal without negative test ref fails deterministically', () => {
  withMutatedRegistry((doc) => {
    const row = doc.failSignals.find((item) => item && item.blocking === true);
    assert.ok(row, 'expected at least one blocking fail signal in fixture');
    delete row.negativeTestRef;
    return doc;
  }, (registryPath) => {
    const result = runState(['--registry-path', registryPath]);
    assert.notEqual(result.status, 0, 'expected non-zero status for missing negativeTestRef');
    const payload = parseJsonOutput(result);
    assert.equal(payload.FAILSIGNAL_REGISTRY_VALID_OK, 0);
    assert.equal(payload.failSignalCode, 'E_FAILSIGNAL_NEGATIVE_TEST_MISSING');
    assert.equal(payload.failSignal.code, 'E_FAILSIGNAL_NEGATIVE_TEST_MISSING');
  });
});

test('failsignal registry: precedence must remain integer and non-negative', () => {
  withMutatedRegistry((doc) => {
    doc.failSignals[0].precedence = 'invalid';
    return doc;
  }, (registryPath) => {
    const result = runState(['--registry-path', registryPath]);
    assert.notEqual(result.status, 0, 'expected non-zero status for invalid precedence');
    const payload = parseJsonOutput(result);
    assert.equal(payload.FAILSIGNAL_REGISTRY_VALID_OK, 0);
    assert.equal(payload.failSignalCode, 'E_FAILSIGNAL_PRECEDENCE_INVALID');
    assert.equal(payload.failSignal.code, 'E_FAILSIGNAL_PRECEDENCE_INVALID');
  });
});
