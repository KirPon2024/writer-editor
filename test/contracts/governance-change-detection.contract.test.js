const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = path.join(process.cwd(), 'scripts/ops/governance-change-detection.mjs');
const APPROVALS_PATH = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';

function runGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
}

function setupTempRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-change-detection-'));
  runGit(repoRoot, ['init']);
  runGit(repoRoot, ['checkout', '-b', 'main']);
  runGit(repoRoot, ['config', 'user.name', 'contract-test']);
  runGit(repoRoot, ['config', 'user.email', 'contract-test@example.com']);

  const readmePath = path.join(repoRoot, 'README.md');
  fs.writeFileSync(readmePath, '# tmp\n', 'utf8');
  runGit(repoRoot, ['add', 'README.md']);
  runGit(repoRoot, ['commit', '-m', 'init']);

  runGit(repoRoot, ['checkout', '-b', 'feature/test']);
  return repoRoot;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeApprovalRegistry(repoRoot, approvals) {
  const registryPath = path.join(repoRoot, APPROVALS_PATH);
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const payload = {
    version: 'v1.0',
    approvals,
  };
  fs.writeFileSync(registryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function runState(repoRoot, env = {}) {
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--json', '--repo-root', repoRoot, '--base-ref', 'main'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...env,
      },
    },
  );

  let payload = null;
  assert.doesNotThrow(() => {
    payload = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON output:\n${result.stdout}\n${result.stderr}`);

  return { result, payload };
}

test('governance change detection: no governance changes passes', () => {
  const repoRoot = setupTempRepo();

  const appFile = path.join(repoRoot, 'src', 'app.txt');
  fs.mkdirSync(path.dirname(appFile), { recursive: true });
  fs.writeFileSync(appFile, 'runtime-only\n', 'utf8');
  runGit(repoRoot, ['add', 'src/app.txt']);
  runGit(repoRoot, ['commit', '-m', 'runtime-change']);

  const { result, payload } = runState(repoRoot);
  fs.rmSync(repoRoot, { recursive: true, force: true });

  assert.equal(result.status, 0, `expected pass:\n${result.stdout}\n${result.stderr}`);
  assert.equal(payload.tokens.GOVERNANCE_CHANGE_OK, 1);
  assert.deepEqual(payload.changed_governance_files, []);
});

test('governance change detection: governance change without approval fails', () => {
  const repoRoot = setupTempRepo();

  const protocolFile = path.join(repoRoot, 'docs/OPS/PROTOCOL/TEST.md');
  fs.mkdirSync(path.dirname(protocolFile), { recursive: true });
  fs.writeFileSync(protocolFile, 'governance update\n', 'utf8');
  runGit(repoRoot, ['add', 'docs/OPS/PROTOCOL/TEST.md']);
  runGit(repoRoot, ['commit', '-m', 'governance-change']);

  const { result, payload } = runState(repoRoot);
  fs.rmSync(repoRoot, { recursive: true, force: true });

  assert.notEqual(result.status, 0, 'expected fail when approval is missing');
  assert.equal(payload.tokens.GOVERNANCE_CHANGE_OK, 0);
  assert.equal(payload.failReason, 'GOVERNANCE_CHANGE_APPROVAL_REQUIRED');
  assert.deepEqual(payload.changed_governance_files, ['docs/OPS/PROTOCOL/TEST.md']);
});

test('governance change detection: governance change with artifact approval passes and is deterministic', () => {
  const repoRoot = setupTempRepo();

  const enforcementTest = path.join(repoRoot, 'test/contracts/ops-enforcement.contract.test.js');
  fs.mkdirSync(path.dirname(enforcementTest), { recursive: true });
  fs.writeFileSync(enforcementTest, 'placeholder\n', 'utf8');
  runGit(repoRoot, ['add', 'test/contracts/ops-enforcement.contract.test.js']);
  runGit(repoRoot, ['commit', '-m', 'ops-test-change']);

  writeApprovalRegistry(repoRoot, [
    {
      filePath: 'test/contracts/ops-enforcement.contract.test.js',
      sha256: sha256File(enforcementTest),
      approvedBy: 'contract-test',
      approvedAtUtc: '2026-02-13T00:00:00.000Z',
      rationale: 'artifact approval fixture',
    },
  ]);

  const first = runState(repoRoot);
  const second = runState(repoRoot);
  fs.rmSync(repoRoot, { recursive: true, force: true });

  assert.equal(first.result.status, 0, `expected approved pass:\n${first.result.stdout}\n${first.result.stderr}`);
  assert.equal(second.result.status, 0, `expected deterministic approved pass:\n${second.result.stdout}\n${second.result.stderr}`);
  assert.equal(first.payload.tokens.GOVERNANCE_CHANGE_OK, 1);
  assert.equal(second.payload.tokens.GOVERNANCE_CHANGE_OK, 1);
  assert.deepEqual(first.payload.changed_governance_files, [
    'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json',
    'test/contracts/ops-enforcement.contract.test.js',
  ]);
  assert.deepEqual(first.payload.changed_governance_files, second.payload.changed_governance_files);
});

test('governance change detection: env override remains supported', () => {
  const repoRoot = setupTempRepo();

  const opsScript = path.join(repoRoot, 'scripts/ops/custom-state.mjs');
  fs.mkdirSync(path.dirname(opsScript), { recursive: true });
  fs.writeFileSync(opsScript, 'export const v = 1;\n', 'utf8');
  runGit(repoRoot, ['add', 'scripts/ops/custom-state.mjs']);
  runGit(repoRoot, ['commit', '-m', 'ops-script-change']);

  const { result, payload } = runState(repoRoot, { GOVERNANCE_CHANGE_APPROVED: '1' });
  fs.rmSync(repoRoot, { recursive: true, force: true });

  assert.equal(result.status, 0, `expected env-approved pass:\n${result.stdout}\n${result.stderr}`);
  assert.equal(payload.tokens.GOVERNANCE_CHANGE_OK, 1);
  assert.equal(payload.governance_change_approved_env, 1);
  assert.deepEqual(payload.changed_governance_files, ['scripts/ops/custom-state.mjs']);
});
