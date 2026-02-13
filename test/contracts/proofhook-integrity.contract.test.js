const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = 'scripts/ops/proofhook-integrity-state.mjs';
const FIXTURE_DIR = path.join(process.cwd(), 'test/fixtures/proofhook-integrity');
const FIXTURE_LOCK_PATH = path.join(FIXTURE_DIR, 'PROOFHOOK_INTEGRITY_LOCK.json');

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

test('proofhook integrity: repository lock matches computed closure hash', () => {
  const result = runState();
  assert.equal(result.status, 0, `expected proofhook integrity pass:\n${result.stdout}\n${result.stderr}`);
  const payload = parseJsonOutput(result);
  assert.equal(payload.PROOFHOOK_INTEGRITY_OK, 1);
  assert.equal(payload.code, '');
  assert.equal(payload.details.closureHashComputed, payload.details.closureHashLocked);
  assert.deepEqual(payload.details.mismatches, []);
});

test('proofhook integrity: fixture lock remains deterministic across runs', () => {
  const args = ['--lock-path', FIXTURE_LOCK_PATH, '--root', FIXTURE_DIR];
  const first = runState(args);
  const second = runState(args);

  assert.equal(first.status, 0, `first run failed:\n${first.stdout}\n${first.stderr}`);
  assert.equal(second.status, 0, `second run failed:\n${second.stdout}\n${second.stderr}`);

  const firstPayload = parseJsonOutput(first);
  const secondPayload = parseJsonOutput(second);

  assert.equal(firstPayload.PROOFHOOK_INTEGRITY_OK, 1);
  assert.equal(secondPayload.PROOFHOOK_INTEGRITY_OK, 1);
  assert.equal(firstPayload.details.closureHashComputed, secondPayload.details.closureHashComputed);
  assert.equal(firstPayload.details.closureHashLocked, secondPayload.details.closureHashLocked);
});

test('proofhook integrity: tampered closure file fails with deterministic signal', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofhook-integrity-'));
  const tmpLockPath = path.join(tmpDir, 'PROOFHOOK_INTEGRITY_LOCK.json');
  const tmpAlphaPath = path.join(tmpDir, 'alpha.txt');
  const tmpBetaPath = path.join(tmpDir, 'beta.txt');

  fs.copyFileSync(path.join(FIXTURE_DIR, 'PROOFHOOK_INTEGRITY_LOCK.json'), tmpLockPath);
  fs.copyFileSync(path.join(FIXTURE_DIR, 'alpha.txt'), tmpAlphaPath);
  fs.copyFileSync(path.join(FIXTURE_DIR, 'beta.txt'), tmpBetaPath);
  fs.writeFileSync(tmpBetaPath, 'proofhook beta fixture tampered v2\n', 'utf8');

  const result = runState(['--lock-path', tmpLockPath, '--root', tmpDir]);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.notEqual(result.status, 0, 'expected non-zero status for tampered closure');
  const payload = parseJsonOutput(result);
  assert.equal(payload.PROOFHOOK_INTEGRITY_OK, 0);
  assert.equal(payload.code, 'E_PROOFHOOK_TAMPER_DETECTED');
  assert.notEqual(payload.details.closureHashComputed, payload.details.closureHashLocked);
  assert.ok(Array.isArray(payload.details.mismatches));
  assert.ok(payload.details.mismatches.some((item) => item.path === 'beta.txt'));
});
