const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = 'scripts/ops/ops-governance-baseline-state.mjs';
const BASELINE_PATH = path.join(process.cwd(), 'docs/OPS/BASELINE/OPS_GOVERNANCE_BASELINE_v1.0.json');
const GOVERNED_FILES = [
  'docs/OPS/CLAIMS/CRITICAL_CLAIM_MATRIX.json',
  'docs/OPS/DOCTOR/INVARIANTS.md',
  'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json',
  'docs/OPS/TOKENS/TOKEN_CATALOG_LOCK.json',
  'docs/OPS/TOKENS/TOKEN_DECLARATION.json',
];

function runState(args = []) {
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

function copyGovernedFilesToTempRoot(tmpRoot) {
  for (const relPath of GOVERNED_FILES) {
    const source = path.join(process.cwd(), relPath);
    const destination = path.join(tmpRoot, relPath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

test('ops governance baseline: repository baseline is valid', () => {
  const result = runState();
  assert.equal(result.status, 0, `expected baseline pass:\n${result.stdout}\n${result.stderr}`);
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens.OPS_GOVERNANCE_BASELINE_OK, 1);
  assert.match(String(payload.expected_global || ''), /^[0-9a-f]{64}$/u);
  assert.equal(payload.expected_global, payload.actual_global);
  assert.deepEqual(payload.mismatch_files, []);
});

test('ops governance baseline: deterministic hash across runs', () => {
  const first = parseJsonStdout(runState());
  const second = parseJsonStdout(runState());
  assert.equal(first.tokens.OPS_GOVERNANCE_BASELINE_OK, 1);
  assert.equal(second.tokens.OPS_GOVERNANCE_BASELINE_OK, 1);
  assert.equal(first.expected_global, second.expected_global);
  assert.equal(first.actual_global, second.actual_global);
});

test('ops governance baseline: mismatch fails and regeneration restores pass', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-governance-baseline-'));
  const tmpBaselinePath = path.join(tmpRoot, 'docs/OPS/BASELINE/OPS_GOVERNANCE_BASELINE_v1.0.json');

  copyGovernedFilesToTempRoot(tmpRoot);

  const writeInitial = runState(['--write-baseline', '--root', tmpRoot, '--baseline-path', tmpBaselinePath]);
  assert.equal(writeInitial.status, 0, `expected initial baseline write pass:\n${writeInitial.stdout}\n${writeInitial.stderr}`);

  const driftPath = path.join(tmpRoot, 'docs/OPS/DOCTOR/INVARIANTS.md');
  fs.appendFileSync(driftPath, '\n# drift-fixture\n', 'utf8');

  const failResult = runState(['--root', tmpRoot, '--baseline-path', tmpBaselinePath]);
  assert.notEqual(failResult.status, 0, 'expected baseline mismatch after drift');
  const failPayload = parseJsonStdout(failResult);
  assert.equal(failPayload.tokens.OPS_GOVERNANCE_BASELINE_OK, 0);
  assert.equal(failPayload.mismatch_files.includes('docs/OPS/DOCTOR/INVARIANTS.md'), true);
  assert.notEqual(failPayload.expected_global, failPayload.actual_global);

  const rewrite = runState(['--write-baseline', '--root', tmpRoot, '--baseline-path', tmpBaselinePath]);
  assert.equal(rewrite.status, 0, `expected baseline rewrite pass:\n${rewrite.stdout}\n${rewrite.stderr}`);

  const passAfterRewrite = runState(['--root', tmpRoot, '--baseline-path', tmpBaselinePath]);
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  assert.equal(passAfterRewrite.status, 0, `expected pass after rewrite:\n${passAfterRewrite.stdout}\n${passAfterRewrite.stderr}`);
  const passPayload = parseJsonStdout(passAfterRewrite);
  assert.equal(passPayload.tokens.OPS_GOVERNANCE_BASELINE_OK, 1);
  assert.equal(passPayload.expected_global, passPayload.actual_global);
  assert.deepEqual(passPayload.mismatch_files, []);
});
