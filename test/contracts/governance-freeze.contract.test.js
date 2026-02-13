const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = path.join(process.cwd(), 'scripts/ops/governance-freeze-state.mjs');

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
}

function createTempRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-freeze-'));
  runGit(repoRoot, ['init']);
  runGit(repoRoot, ['checkout', '-b', 'main']);
  runGit(repoRoot, ['config', 'user.name', 'contract-test']);
  runGit(repoRoot, ['config', 'user.email', 'contract-test@example.com']);

  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# tmp\n', 'utf8');
  runGit(repoRoot, ['add', 'README.md']);
  runGit(repoRoot, ['commit', '-m', 'init']);
  runGit(repoRoot, ['checkout', '-b', 'feature/test']);
  return repoRoot;
}

function addGovernanceChange(repoRoot) {
  const target = path.join(repoRoot, 'docs/OPS/PROTOCOL/TEMP.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'temp governance change\n', 'utf8');
  runGit(repoRoot, ['add', 'docs/OPS/PROTOCOL/TEMP.md']);
  runGit(repoRoot, ['commit', '-m', 'governance-change']);
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

test('governance freeze: no freeze keeps normal behavior', () => {
  const repoRoot = createTempRepo();
  addGovernanceChange(repoRoot);

  const { result, payload } = runState(repoRoot);
  fs.rmSync(repoRoot, { recursive: true, force: true });

  assert.equal(result.status, 0, `expected pass without freeze:\n${result.stdout}\n${result.stderr}`);
  assert.equal(payload.tokens.GOVERNANCE_FREEZE_OK, 1);
  assert.equal(payload.freeze_active, false);
});

test('governance freeze: freeze active with no governance changes passes', () => {
  const repoRoot = createTempRepo();

  const { result, payload } = runState(repoRoot, { FREEZE_PROFILE: 'governance' });
  fs.rmSync(repoRoot, { recursive: true, force: true });

  assert.equal(result.status, 0, `expected freeze pass on clean repo:\n${result.stdout}\n${result.stderr}`);
  assert.equal(payload.tokens.GOVERNANCE_FREEZE_OK, 1);
  assert.equal(payload.freeze_active, true);
  assert.deepEqual(payload.changed_files, []);
});

test('governance freeze: freeze active with governance change fails and is deterministic', () => {
  const repoRoot = createTempRepo();
  addGovernanceChange(repoRoot);

  const first = runState(repoRoot, { FREEZE_PROFILE: 'governance' });
  const second = runState(repoRoot, { FREEZE_PROFILE: 'governance' });
  fs.rmSync(repoRoot, { recursive: true, force: true });

  assert.notEqual(first.result.status, 0, 'expected fail when freeze is active and governance changed');
  assert.notEqual(second.result.status, 0, 'expected deterministic fail when freeze is active and governance changed');
  assert.equal(first.payload.tokens.GOVERNANCE_FREEZE_OK, 0);
  assert.equal(second.payload.tokens.GOVERNANCE_FREEZE_OK, 0);
  assert.equal(first.payload.freeze_active, true);
  assert.equal(first.payload.failReason, 'GOVERNANCE_FREEZE_VIOLATION');
  assert.deepEqual(first.payload.changed_files, ['docs/OPS/PROTOCOL/TEMP.md']);
  assert.deepEqual(first.payload.changed_files, second.payload.changed_files);
});

test('governance freeze: freeze overrides approval flag', () => {
  const repoRoot = createTempRepo();
  addGovernanceChange(repoRoot);

  const { result, payload } = runState(repoRoot, {
    FREEZE_PROFILE: 'governance',
    GOVERNANCE_CHANGE_APPROVED: '1',
  });
  fs.rmSync(repoRoot, { recursive: true, force: true });

  assert.notEqual(result.status, 0, 'expected freeze to block even with approval flag');
  assert.equal(payload.tokens.GOVERNANCE_FREEZE_OK, 0);
  assert.equal(payload.freeze_active, true);
  assert.equal(payload.failReason, 'GOVERNANCE_FREEZE_VIOLATION');
  assert.deepEqual(payload.changed_files, ['docs/OPS/PROTOCOL/TEMP.md']);
});
