const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ORCH_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-terminal-orchestrator.mjs');

async function loadOrchestrator() {
  return import(ORCH_PATH);
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function initCleanGitRepo(dir) {
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  spawnSync('git', ['add', '.'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
}

test('orchestrator args require expected-sha, expected-word-build, artifact-root and run identity', async () => {
  const orch = await loadOrchestrator();
  assert.equal(typeof orch.parseOrchestratorArgs, 'function');
  assert.throws(() => orch.parseOrchestratorArgs([]), /ORCH_ARG_REQUIRED/u);
  assert.throws(() => orch.parseOrchestratorArgs(['--expected-sha', 'abc']), /ORCH_ARG_REQUIRED/u);
  const parsed = orch.parseOrchestratorArgs([
    '--expected-sha', 'a'.repeat(40),
    '--expected-word-build', '16.111.26072617',
    '--artifact-root', '/tmp/artifact-root',
    '--run-prefix', 'c5v2-test',
  ]);
  assert.equal(parsed.expectedSha, 'a'.repeat(40));
  assert.equal(parsed.expectedWordBuild, '16.111.26072617');
  assert.equal(parsed.artifactRoot, '/tmp/artifact-root');
  assert.equal(parsed.runPrefix, 'c5v2-test');
  assert.throws(() => orch.parseOrchestratorArgs([
    '--expected-sha', 'not-a-sha',
    '--expected-word-build', '16.111.26072617',
    '--artifact-root', '/tmp/artifact-root',
    '--run-prefix', 'c5v2-test',
  ]), /ORCH_EXPECTED_SHA_FORMAT/u);
});

test('orchestrator preflight stops on expected SHA mismatch before any spawn', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-preflight-');
  const head = initCleanGitRepo(dir);
  const okResult = orch.assertOrchestratorExpectedSha({ repoRoot: dir, expectedSha: head });
  assert.equal(okResult.ok, true);
  const badResult = orch.assertOrchestratorExpectedSha({ repoRoot: dir, expectedSha: 'b'.repeat(40) });
  assert.equal(badResult.ok, false);
  assert.match(badResult.code, /ORCH_EXPECTED_SHA_MISMATCH/u);
});

test('orchestrator preflight stops on dirty worktree', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-dirty-');
  initCleanGitRepo(dir);
  const clean = orch.assertOrchestratorCleanTree({ repoRoot: dir });
  assert.equal(clean.ok, true);
  fs.writeFileSync(path.join(dir, 'dirty.txt'), 'undeclared\n', 'utf8');
  const dirty = orch.assertOrchestratorCleanTree({ repoRoot: dir });
  assert.equal(dirty.ok, false);
  assert.match(dirty.code, /ORCH_CLEAN_TREE_VIOLATION/u);
});

test('orchestrator exclusive lock blocks a second writer and breaks stale locks with marker', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-lock-');
  const first = orch.acquireOrchestratorLock({ lockRoot: dir, campaignId: 'campaign-a' });
  assert.equal(first.ok, true);
  const second = orch.acquireOrchestratorLock({ lockRoot: dir, campaignId: 'campaign-b' });
  assert.equal(second.ok, false);
  assert.match(second.code, /ORCH_LOCK_HELD/u);
  const ownerPath = path.join(dir, first.lockDirName, 'owner.json');
  const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
  owner.pid = 99999999;
  fs.writeFileSync(ownerPath, JSON.stringify(owner), 'utf8');
  const third = orch.acquireOrchestratorLock({ lockRoot: dir, campaignId: 'campaign-c' });
  assert.equal(third.ok, true);
  assert.equal(third.brokeStaleLock, true);
  const released = orch.releaseOrchestratorLock({ lockRoot: dir, lockDirName: third.lockDirName });
  assert.equal(released.ok, true);
});

test('orchestrator stage child success returns structured ok result with artifacts', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-stage-');
  const artifact = path.join(dir, 'stage-artifact.json');
  const childScript = path.join(dir, 'child.cjs');
  fs.writeFileSync(childScript, `require('fs').writeFileSync(${JSON.stringify(artifact)}, '{"ok":true}');process.stdout.write('done\\n');process.exit(0);`, 'utf8');
  const result = await orch.runStageChild({
    stage: 'TEST_STAGE',
    command: process.execPath,
    args: [childScript],
    cwd: dir,
    logDir: path.join(dir, 'logs'),
    timeoutMs: 30000,
    activityTimeoutMs: 15000,
    expectedArtifacts: [artifact],
  });
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stage, 'TEST_STAGE');
  assert.equal(result.missingArtifacts.length, 0);
  assert.ok(result.durationMs >= 0);
});

test('orchestrator stage child non-zero exit fails fast with marker and no aggregate stage', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-failfast-');
  const childScript = path.join(dir, 'child-fail.cjs');
  fs.writeFileSync(childScript, 'process.exit(7);', 'utf8');
  const failureDir = path.join(dir, 'failures');
  const result = await orch.runStageChild({
    stage: 'MAIN',
    command: process.execPath,
    args: [childScript],
    cwd: dir,
    logDir: path.join(dir, 'logs'),
    failureDir,
    timeoutMs: 30000,
    activityTimeoutMs: 15000,
    expectedArtifacts: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 7);
  assert.match(result.code, /ORCH_CHILD_EXIT_NONZERO/u);
  const markers = fs.existsSync(failureDir) ? fs.readdirSync(failureDir).filter((name) => name.endsWith('.jsonl')) : [];
  assert.equal(markers.length, 1);
  const marker = JSON.parse(fs.readFileSync(path.join(failureDir, markers[0]), 'utf8').trim().split('\n').pop());
  assert.equal(marker.stage, 'MAIN');
  assert.equal(marker.exitCode, 7);
});

test('orchestrator stage child wall timeout is killed with exact reason', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-timeout-');
  const childScript = path.join(dir, 'child-sleep.cjs');
  fs.writeFileSync(childScript, 'setInterval(()=>{},1000);', 'utf8');
  const started = Date.now();
  const result = await orch.runStageChild({
    stage: 'MAIN',
    command: process.execPath,
    args: [childScript],
    cwd: dir,
    logDir: path.join(dir, 'logs'),
    timeoutMs: 1200,
    activityTimeoutMs: 60000,
    expectedArtifacts: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_TIMEOUT/u);
  assert.ok(Date.now() - started < 15000);
});

test('orchestrator watchdog kills silent child on activity timeout with exact reason', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-silent-');
  const childScript = path.join(dir, 'child-silent.cjs');
  fs.writeFileSync(childScript, "process.stdout.write('boot\\n');setInterval(()=>{},1000);", 'utf8');
  const result = await orch.runStageChild({
    stage: 'MAIN',
    command: process.execPath,
    args: [childScript],
    cwd: dir,
    logDir: path.join(dir, 'logs'),
    timeoutMs: 60000,
    activityTimeoutMs: 1200,
    expectedArtifacts: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_ACTIVITY_TIMEOUT/u);
});

test('orchestrator stage child missing expected artifact fails with exact artifact list', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-missing-');
  const childScript = path.join(dir, 'child-noop.cjs');
  fs.writeFileSync(childScript, 'process.exit(0);', 'utf8');
  const result = await orch.runStageChild({
    stage: 'MAIN',
    command: process.execPath,
    args: [childScript],
    cwd: dir,
    logDir: path.join(dir, 'logs'),
    timeoutMs: 30000,
    activityTimeoutMs: 15000,
    expectedArtifacts: [path.join(dir, 'never-created.json')],
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_ARTIFACT_MISSING/u);
  assert.deepEqual(result.missingArtifacts, [path.join(dir, 'never-created.json')]);
});

test('orchestrator never selects run directories by latest or glob and requires explicit resume identity', async () => {
  const orch = await loadOrchestrator();
  const parsed = orch.parseOrchestratorArgs([
    '--expected-sha', 'a'.repeat(40),
    '--expected-word-build', '16.111.26072617',
    '--artifact-root', '/tmp/artifact-root',
    '--run-prefix', 'c5v2-test',
    '--resume-run-dir', '/tmp/explicit-run-dir',
  ]);
  assert.equal(parsed.resumeRunDir, '/tmp/explicit-run-dir');
  const source = fs.readFileSync(ORCH_PATH, 'utf8');
  // FORBIDDEN_DISCOVERY: the orchestrator must never list run directories at all —
  // every run identity arrives as an explicit argument.
  assert.doesNotMatch(source, /readdirSync\(/u);
  assert.doesNotMatch(source, /globSync\(|require\('glob'\)|require\("glob"\)/u);
});

test('orchestrator stage pipeline writes structured stage results and stops before aggregate on failure', async () => {
  const orch = await loadOrchestrator();
  assert.equal(typeof orch.runTerminalChain, 'function');
  const dir = tmpDir('c5v2-orch-chain-');
  const stages = [];
  const result = await orch.runTerminalChain({
    chainId: 'chain-test',
    workRoot: dir,
    stages: [
      { stage: 'MAIN', command: process.execPath, args: ['-e', 'process.exit(0)'], expectedArtifacts: [] },
      { stage: 'NEGATIVE', command: process.execPath, args: ['-e', 'process.exit(5)'], expectedArtifacts: [] },
      { stage: 'AGGREGATE', command: process.execPath, args: ['-e', 'process.exit(0)'], expectedArtifacts: [] },
    ],
    timeoutMs: 30000,
    activityTimeoutMs: 15000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failedStage, 'NEGATIVE');
  assert.equal(result.stageResults.length, 2);
  assert.equal(result.stageResults[0].stage, 'MAIN');
  assert.equal(result.stageResults[0].ok, true);
  assert.equal(result.stageResults[1].stage, 'NEGATIVE');
  assert.equal(result.stageResults[1].ok, false);
  assert.equal(result.stageResults.some((entry) => entry.stage === 'AGGREGATE'), false);
  assert.ok(fs.existsSync(path.join(dir, 'chain-test.chain-result.json')));
});
