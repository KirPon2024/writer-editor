const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = 'scripts/ops/proofhook-integrity-state.mjs';
const TOKEN_NAME = 'PROOFHOOK_INTEGRITY_OK';
const FAIL_CODE = 'E_PROOFHOOK_TAMPER_DETECTED';
const FIXTURE_DIR = path.join(process.cwd(), 'test/fixtures/proofhook-integrity');
const FIXTURE_LOCK_PATH = path.join(FIXTURE_DIR, 'PROOFHOOK_INTEGRITY_LOCK.json');

function runScript(args = []) {
  return spawnSync(process.execPath, [SCRIPT_PATH, '--json', ...args], {
    encoding: 'utf8',
  });
}

function parseJsonStdout(result) {
  let payload = null;
  assert.doesNotThrow(() => {
    payload = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON output:\n${result.stdout}\n${result.stderr}`);
  return payload;
}

test('proofhook integrity: PASS on fixture lock baseline', () => {
  const result = runScript(['--root', FIXTURE_DIR, '--lock-path', FIXTURE_LOCK_PATH]);
  assert.equal(result.status, 0, `proofhook state failed:\n${result.stdout}\n${result.stderr}`);
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens[TOKEN_NAME], 1);
  assert.equal(payload.failSignal, undefined);
  assert.match(String(payload.closureSha256 || ''), /^[0-9a-f]{64}$/u);
  assert.match(String(payload.lockManifestSha256 || ''), /^[0-9a-f]{64}$/u);
});

test('proofhook integrity: FAIL and emits failSignal when lock-covered file is tampered', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofhook-integrity-'));
  fs.cpSync(FIXTURE_DIR, tempDir, { recursive: true });
  const lockPath = path.join(tempDir, 'PROOFHOOK_INTEGRITY_LOCK.json');
  const tamperedPath = path.join(tempDir, 'beta.txt');

  fs.appendFileSync(tamperedPath, 'tampered\n', 'utf8');

  const result = runScript(['--root', tempDir, '--lock-path', lockPath]);
  fs.rmSync(tempDir, { recursive: true, force: true });

  assert.notEqual(result.status, 0, 'expected non-zero status for tampered file');
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens[TOKEN_NAME], 0);
  assert.equal(payload.failSignal.code, FAIL_CODE);
  assert.equal(payload.failSignal.details.path, 'beta.txt');
  assert.match(String(payload.failSignal.details.expected || ''), /^[0-9a-f]{64}$/u);
  assert.match(String(payload.failSignal.details.actual || ''), /^[0-9a-f]{64}$/u);
  assert.notEqual(payload.failSignal.details.expected, payload.failSignal.details.actual);
});
