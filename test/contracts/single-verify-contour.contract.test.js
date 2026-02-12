const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = 'scripts/ops/verify-contour-state.mjs';
const TOKEN_NAME = 'GOVERNANCE_SINGLE_VERIFY_CONTOUR_ENFORCED_OK';
const FAIL_CODE = 'E_DOUBLE_VERIFY_CONTOUR_DETECTED';

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

test('single verify contour state returns ok on repository baseline', () => {
  const result = runScript();
  assert.equal(result.status, 0, `verify contour state failed:\n${result.stdout}\n${result.stderr}`);
  const payload = parseJsonStdout(result);
  assert.equal(payload.ok, true);
  assert.equal(payload.token, TOKEN_NAME);
  assert.equal(payload[TOKEN_NAME], 1);
});

test('single verify contour state fails when second orchestrator entrypoint exists', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-contour-'));
  fs.writeFileSync(path.join(tempDir, 'post-merge-verify.mjs'), '// orchestrator\n', 'utf8');
  fs.writeFileSync(path.join(tempDir, 'post-merge-verify-legacy.mjs'), '// legacy\n', 'utf8');

  const result = runScript(['--ops-dir', tempDir]);
  assert.notEqual(result.status, 0, 'expected non-zero when a secondary orchestrator exists');
  const payload = parseJsonStdout(result);
  assert.equal(payload.ok, false);
  assert.equal(payload[TOKEN_NAME], 0);
  assert.equal(payload.failSignal.code, FAIL_CODE);
});
