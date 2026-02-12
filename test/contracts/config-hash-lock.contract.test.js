const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = 'scripts/ops/config-hash-lock-state.mjs';
const TOKEN_NAME = 'CONFIG_HASH_LOCK_OK';
const FAIL_CODE = 'E_CONFIG_HASH_CONFLICT';

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

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

function computeConfigHash(entries) {
  const payload = entries.map((item) => `${item.path}\u0000${item.sha256}\n`).join('');
  return sha256Hex(payload);
}

test('config hash lock: repository baseline lock is valid', () => {
  const result = runScript();
  assert.equal(result.status, 0, `config-hash-lock-state failed:\n${result.stdout}\n${result.stderr}`);
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens[TOKEN_NAME], 1);
  assert.match(String(payload.lockedConfigHash || ''), /^[0-9a-f]{64}$/u);
  assert.equal(payload.lockedConfigHash, payload.observedConfigHash);
  assert.equal(payload.failSignal, undefined);
});

test('config hash lock: tampered input emits E_CONFIG_HASH_CONFLICT', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-hash-lock-'));
  const lockPath = path.join(tempDir, 'CONFIG_HASH_LOCK.json');
  const alphaPath = path.join(tempDir, 'alpha.json');
  const betaPath = path.join(tempDir, 'beta.json');
  fs.writeFileSync(alphaPath, '{"value":"alpha"}\n', 'utf8');
  fs.writeFileSync(betaPath, '{"value":"beta"}\n', 'utf8');

  const inputs = ['alpha.json', 'beta.json'];
  const inputHashes = {
    'alpha.json': sha256Hex(fs.readFileSync(alphaPath)),
    'beta.json': sha256Hex(fs.readFileSync(betaPath)),
  };
  const configHash = computeConfigHash(inputs.map((item) => ({ path: item, sha256: inputHashes[item] })));
  fs.writeFileSync(lockPath, `${JSON.stringify({
    version: 'config-hash-lock.v1',
    inputs,
    inputHashes,
    configHash,
  }, null, 2)}\n`, 'utf8');

  fs.appendFileSync(betaPath, '{"tampered":true}\n', 'utf8');

  const result = runScript(['--root', tempDir, '--lock-path', lockPath]);
  fs.rmSync(tempDir, { recursive: true, force: true });

  assert.notEqual(result.status, 0, 'expected non-zero status on tamper');
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens[TOKEN_NAME], 0);
  assert.equal(payload.failSignal.code, FAIL_CODE);
  assert.equal(payload.failSignal.details.path, 'beta.json');
  assert.match(String(payload.failSignal.details.expected || ''), /^[0-9a-f]{64}$/u);
  assert.match(String(payload.failSignal.details.actual || ''), /^[0-9a-f]{64}$/u);
  assert.notEqual(payload.failSignal.details.expected, payload.failSignal.details.actual);
});
