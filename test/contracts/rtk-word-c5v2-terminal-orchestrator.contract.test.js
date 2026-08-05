const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ORCH_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-terminal-orchestrator.mjs');
const CANARY_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs');

async function loadOrchestrator() {
  return import(ORCH_PATH);
}

async function loadCanary() {
  return import(CANARY_PATH);
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sha256File(filePath) {
  return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

function validOptions(overrides = {}) {
  const artifactRoot = tmpDir('c5v2-orch-opt-');
  return {
    expectedSha: 'a'.repeat(40),
    expectedWordVersion: '16.111.2',
    expectedWordBuild: '16.111.26072617',
    artifactRoot,
    campaignId: 'test-campaign-001',
    chainId: 'W06',
    resume: false,
    stageTimeoutMs: 5000,
    progressTimeoutMs: 1500,
    killGraceMs: 700,
    campaignRoot: path.join(artifactRoot, 'test-campaign-001'),
    ...overrides,
  };
}

const BASE_ARGS = [
  '--expected-sha', 'a'.repeat(40),
  '--expected-word-version', '16.111.2',
  '--expected-word-build', '16.111.26072617',
  '--artifact-root', '/tmp/c5v2-orch-args',
  '--campaign-id', 'test-campaign-001',
  '--chain-id', 'W06',
];

function withArg(flag, value) {
  return BASE_ARGS.map((arg, index) => (BASE_ARGS[index - 1] === flag ? value : arg));
}

test('ORCH_TEST_1: CLI rejects missing required args with exact flag', async () => {
  const orch = await loadOrchestrator();
  assert.throws(() => orch.parseOrchestratorArgs([]), /ORCH_ARG_REQUIRED:--expected-sha/u);
  assert.throws(() => orch.parseOrchestratorArgs(BASE_ARGS.slice(0, 6)), /ORCH_ARG_REQUIRED/u);
});

test('ORCH_TEST_2: CLI rejects unknown, duplicate and value-missing args', async () => {
  const orch = await loadOrchestrator();
  assert.throws(() => orch.parseOrchestratorArgs([...BASE_ARGS, '--bogus']), /ORCH_UNKNOWN_ARG:--bogus/u);
  assert.throws(() => orch.parseOrchestratorArgs([...BASE_ARGS, '--chain-id', 'W06']), /ORCH_DUPLICATE_ARG:--chain-id/u);
  assert.throws(() => orch.parseOrchestratorArgs(BASE_ARGS.slice(0, -1)), /ORCH_ARG_VALUE_MISSING/u);
});

test('ORCH_TEST_3: CLI rejects invalid sha, build, timeout, campaign and chain identities', async () => {
  const orch = await loadOrchestrator();
  assert.throws(() => orch.parseOrchestratorArgs(withArg('--expected-sha', 'zz')), /ORCH_ARG_INVALID:--expected-sha/u);
  assert.throws(() => orch.parseOrchestratorArgs(withArg('--expected-word-build', 'x.y')), /ORCH_ARG_INVALID:--expected-word-build/u);
  assert.throws(() => orch.parseOrchestratorArgs([...BASE_ARGS, '--stage-timeout-ms', '-5']), /ORCH_ARG_INVALID:--stage-timeout-ms/u);
  assert.throws(() => orch.parseOrchestratorArgs([...BASE_ARGS, '--stage-timeout-ms', '99999999999999999999']), /ORCH_ARG_INVALID:--stage-timeout-ms/u);
  assert.throws(() => orch.parseOrchestratorArgs(withArg('--campaign-id', '../escape')), /ORCH_CAMPAIGN_ID_INVALID/u);
  assert.throws(() => orch.parseOrchestratorArgs(withArg('--campaign-id', 'has space')), /ORCH_CAMPAIGN_ID_INVALID/u);
  assert.throws(() => orch.parseOrchestratorArgs(withArg('--chain-id', 'REP9')), /ORCH_CHAIN_ID_INVALID/u);
  const parsed = orch.parseOrchestratorArgs(BASE_ARGS);
  assert.equal(parsed.chainId, 'W06');
  assert.equal(parsed.campaignRoot, path.join('/tmp/c5v2-orch-args', 'test-campaign-001'));
});

test('ORCH_TEST_4: path authority rejects escape, symlink component and collision', async () => {
  const orch = await loadOrchestrator();
  const root = tmpDir('c5v2-orch-path-');
  assert.equal(orch.assertOrchestratorPathAuthority({ artifactRoot: root, campaignRoot: path.join(root, 'camp'), mustBeAbsent: true }).ok, true);
  assert.match(orch.assertOrchestratorPathAuthority({ artifactRoot: root, campaignRoot: path.join(root, '..', 'escape'), mustBeAbsent: true }).code, /ORCH_PATH_ESCAPE/u);
  const outside = tmpDir('c5v2-orch-outside-');
  assert.match(orch.assertOrchestratorPathAuthority({ artifactRoot: root, campaignRoot: outside, mustBeAbsent: true }).code, /ORCH_PATH_ESCAPE/u);
  fs.mkdirSync(path.join(root, 'camp'), { recursive: true });
  assert.match(orch.assertOrchestratorPathAuthority({ artifactRoot: root, campaignRoot: path.join(root, 'camp'), mustBeAbsent: true }).code, /ORCH_CAMPAIGN_ROOT_COLLISION/u);
  const linkParent = path.join(root, 'link-parent');
  fs.symlinkSync(root, linkParent, 'dir');
  assert.match(orch.assertOrchestratorPathAuthority({ artifactRoot: root, campaignRoot: path.join(linkParent, 'camp2'), mustBeAbsent: true }).code, /ORCH_PATH_SYMLINK_COMPONENT/u);
});

test('ORCH_TEST_5: preflight stops on HEAD mismatch, origin mismatch and dirty tree before spawn', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-pre-');
  const head = initCleanGitRepo(dir);
  const options = validOptions({ expectedSha: head });
  spawnSync('git', ['update-ref', 'refs/remotes/origin/main', head], { cwd: dir });
  const stillBad = orch.runOrchestratorPreflight({ options: { ...options, expectedSha: 'b'.repeat(40) }, scope: 'TEST', repoRoot: dir });
  assert.equal(stillBad.ok, false);
  assert.match(stillBad.code, /ORCH_EXPECTED_SHA_MISMATCH/u);
  const originBad = orch.runOrchestratorPreflight({ options, scope: 'TEST', repoRoot: dir });
  assert.equal(originBad.ok, false);
  fs.writeFileSync(path.join(dir, 'dirty.txt'), 'x\n', 'utf8');
  const dirty = orch.runOrchestratorPreflight({ options, scope: 'TEST', repoRoot: dir });
  assert.equal(dirty.ok, false);
  assert.match(dirty.code, /ORCH_CLEAN_TREE_VIOLATION/u);
});

test('ORCH_TEST_6: preflight detects Word version and build mismatch from plist', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-word-');
  const head = initCleanGitRepo(dir);
  spawnSync('git', ['update-ref', 'refs/remotes/origin/main', head], { cwd: dir });
  const plist = `<?xml version="1.0"?><plist><dict><key>CFBundleShortVersionString</key><string>16.111.2</string><key>CFBundleVersion</key><string>16.111.26072617</string></dict></plist>`;
  const plistDir = tmpDir('c5v2-orch-plist-');
  const plistPath = path.join(plistDir, 'Info.plist');
  fs.writeFileSync(plistPath, plist, 'utf8');
  const options = validOptions({ expectedSha: head });
  const buildMismatch = orch.runOrchestratorPreflight({
    options: { ...options, expectedWordBuild: '16.999.99999999' },
    scope: 'TEST',
    repoRoot: dir,
    wordPlistPath: plistPath,
  });
  assert.equal(buildMismatch.ok, false);
  assert.match(buildMismatch.code, /ORCH_WORD_BUILD_MISMATCH/u);
  const versionMismatch = orch.runOrchestratorPreflight({
    options: { ...options, expectedWordVersion: '16.999.9' },
    scope: 'TEST',
    repoRoot: dir,
    wordPlistPath: plistPath,
  });
  assert.equal(versionMismatch.ok, false);
  assert.match(versionMismatch.code, /ORCH_WORD_VERSION_MISMATCH/u);
});

test('ORCH_TEST_7: atomic lock admits exactly one writer under concurrent acquisition', async () => {
  const orch = await loadOrchestrator();
  const root = tmpDir('c5v2-orch-lockrace-');
  const attempts = await Promise.all([
    Promise.resolve().then(() => orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-a', chainId: 'W06', expectedSha: 'a'.repeat(40) })),
    Promise.resolve().then(() => orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-b', chainId: 'W06', expectedSha: 'a'.repeat(40) })),
    Promise.resolve().then(() => orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-c', chainId: 'W06', expectedSha: 'a'.repeat(40) })),
  ]);
  const winners = attempts.filter((attempt) => attempt.ok === true);
  assert.equal(winners.length, 1);
  const losers = attempts.filter((attempt) => attempt.ok !== true);
  assert.equal(losers.length, 2);
  for (const loser of losers) assert.match(loser.code, /ORCH_LOCK_HELD|ORCH_STALE_LOCK_REQUIRES_EXPLICIT_CLEANUP|ORCH_LOCK_ACQUIRE_FAILED|ORCH_LOCK_AMBIGUOUS/u);
});

test('ORCH_TEST_8: stale lock is never broken automatically', async () => {
  const orch = await loadOrchestrator();
  const root = tmpDir('c5v2-orch-stale-');
  const first = orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-a', chainId: 'W06', expectedSha: 'a'.repeat(40) });
  assert.equal(first.ok, true);
  const ownerPath = path.join(root, 'c5v2-word-campaign.lock', 'owner.json');
  const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
  owner.pid = 99999999;
  fs.writeFileSync(ownerPath, JSON.stringify(owner), 'utf8');
  const second = orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-b', chainId: 'W06', expectedSha: 'a'.repeat(40) });
  assert.equal(second.ok, false);
  assert.match(second.code, /ORCH_STALE_LOCK_REQUIRES_EXPLICIT_CLEANUP/u);
});

test('ORCH_TEST_9: wrong ownership token cannot release the lock, right token releases', async () => {
  const orch = await loadOrchestrator();
  const root = tmpDir('c5v2-orch-token-');
  const first = orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-a', chainId: 'W06', expectedSha: 'a'.repeat(40) });
  assert.equal(first.ok, true);
  const wrong = orch.releaseOrchestratorLock({ lockDir: first.lockDir, ownershipToken: 'wrong-token', campaignId: 'camp-a' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.code, /ORCH_LOCK_RELEASE_TOKEN_MISMATCH/u);
  assert.ok(fs.existsSync(first.lockDir));
  const right = orch.releaseOrchestratorLock({ lockDir: first.lockDir, ownershipToken: first.ownershipToken, campaignId: 'camp-a' });
  assert.equal(right.ok, true);
  assert.equal(right.released, true);
  assert.ok(!fs.existsSync(first.lockDir));
});

function writeSleepChild(dir, name, body) {
  const script = path.join(dir, name);
  fs.writeFileSync(script, body, 'utf8');
  return script;
}

function readPidLog(pidLogPath) {
  if (!fs.existsSync(pidLogPath)) return [];
  return fs.readFileSync(pidLogPath, 'utf8').split(/\r?\n/u).map((line) => Number(line.trim())).filter((pid) => Number.isSafeInteger(pid) && pid > 0);
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function cleanupExactTestPids(pidLogPath) {
  const pids = [...new Set(readPidLog(pidLogPath))];
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* noop */ }
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (const pid of pids) {
    if (pidAlive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* noop */ }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  return pids.filter(pidAlive);
}

test('ORCH_TEST_10: owned stage success, non-zero exit and spawn error classification', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-owned-');
  const okChild = writeSleepChild(dir, 'ok.cjs', "process.stdout.write('hi\\n');process.exit(0);");
  const okResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [okChild], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 5000, progressTimeoutMs: 3000, killGraceMs: 500,
  });
  assert.equal(okResult.ok, true);
  assert.equal(okResult.exitCode, 0);
  const failChild = writeSleepChild(dir, 'fail.cjs', 'process.exit(9);');
  const failResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [failChild], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 5000, progressTimeoutMs: 3000, killGraceMs: 500,
  });
  assert.equal(failResult.ok, false);
  assert.match(failResult.code, /ORCH_CHILD_EXIT_NONZERO:9/u);
  const spawnResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: '/no/such/binary-exists', args: [], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 5000, progressTimeoutMs: 3000, killGraceMs: 500,
  });
  assert.equal(spawnResult.ok, false);
  assert.match(spawnResult.code, /ORCH_CHILD_SPAWN_ERROR/u);
});

test('ORCH_TEST_11: wall timeout sends TERM then escalates to uncaught KILL for the process group', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-signals-');
  const signalLog = path.join(dir, 'signals.jsonl');
  const child = writeSleepChild(dir, 'recorder.cjs', `
const fs=require('fs');
const log=${JSON.stringify(signalLog)};
process.on('SIGTERM',()=>{fs.appendFileSync(log,'TERM\\n');});
setInterval(()=>{},500);
`);
  const result = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [child], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 900, progressTimeoutMs: 60000, killGraceMs: 600,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_TIMEOUT/u);
  assert.equal(result.signal, 'SIGKILL');
  const signals = fs.existsSync(signalLog) ? fs.readFileSync(signalLog, 'utf8').trim().split('\n').filter(Boolean) : [];
  assert.deepEqual(signals, ['TERM']);
});

test('ORCH_TEST_12: silent child without heartbeat is killed with progress timeout', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-silent-');
  const child = writeSleepChild(dir, 'silent.cjs', "process.stdout.write('boot\\n');setInterval(()=>{},500);");
  const result = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [child], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 60000, progressTimeoutMs: 900, killGraceMs: 500,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_PROGRESS_TIMEOUT/u);
});

test('ORCH_TEST_13: owned grandchild inside the process group dies with the group; detached fixture cleanup is exact', async (t) => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-grand-');
  const grandPath = path.join(dir, 'grand.cjs');
  const detachedPidLog = path.join(dir, 'detached-pids.txt');
  t.after(async () => {
    await cleanupExactTestPids(detachedPidLog);
  });
  writeSleepChild(dir, 'grand.cjs', 'setInterval(()=>{},500);');
  const parent = writeSleepChild(dir, 'parent.cjs', `
const { spawn } = require('child_process');
spawn(process.execPath, [${JSON.stringify(grandPath)}], { stdio: 'ignore' });
setInterval(()=>{},500);
`);
  const result = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [parent], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 900, progressTimeoutMs: 60000, killGraceMs: 600,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_TIMEOUT/u);
  assert.deepEqual(result.survivingDescendants, []);
  const escapeeParent = writeSleepChild(dir, 'escapee.cjs', `
const fs = require('fs');
const { spawn } = require('child_process');
const g = spawn(process.execPath, [${JSON.stringify(grandPath)}], { stdio: 'ignore', detached: true });
fs.appendFileSync(${JSON.stringify(detachedPidLog)}, String(g.pid) + '\\n');
g.unref();
setInterval(()=>{},500);
`);
  const quarantine = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [escapeeParent], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 900, progressTimeoutMs: 60000, killGraceMs: 600,
  });
  assert.equal(quarantine.ok, false);
  assert.match(quarantine.code, /ORCH_STAGE_TIMEOUT/u);
  const cleanupSurvivors = await cleanupExactTestPids(detachedPidLog);
  assert.deepEqual(cleanupSurvivors, []);
  assert.deepEqual(quarantine.survivingOwnedPids, []);
});

test('ORCH_TEST_14: arbitrary stdout is not heartbeat; identity and sequence violations fail', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-hb-');
  const heartbeatPath = path.join(dir, 'hb.jsonl');
  const chatty = writeSleepChild(dir, 'chatty.cjs', "setInterval(()=>{process.stdout.write('noise\\n');},100);");
  const silentTimeout = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [chatty], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath, campaignId: 'c', chainId: 'W06', stageTimeoutMs: 60000, progressTimeoutMs: 800, killGraceMs: 400,
  });
  assert.equal(silentTimeout.ok, false);
  assert.match(silentTimeout.code, /ORCH_PROGRESS_TIMEOUT/u);
  const badIdentity = writeSleepChild(dir, 'badid.cjs', `
const fs=require('fs');
fs.appendFileSync(${JSON.stringify(heartbeatPath)}, JSON.stringify({schemaVersion:'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1',campaignId:'WRONG',chainId:'W06',stage:'POSITIVE',sequence:1,phase:'x'})+'\\n');
setInterval(()=>{},500);
`);
  const identityResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [badIdentity], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath, campaignId: 'c', chainId: 'W06', stageTimeoutMs: 60000, progressTimeoutMs: 60000, killGraceMs: 400,
  });
  assert.equal(identityResult.ok, false);
  assert.match(identityResult.code, /ORCH_HEARTBEAT_IDENTITY_MISMATCH/u);
  fs.writeFileSync(heartbeatPath, '', 'utf8');
  const badSequence = writeSleepChild(dir, 'badseq.cjs', `
const fs=require('fs');
const hb=${JSON.stringify(heartbeatPath)};
fs.appendFileSync(hb, JSON.stringify({schemaVersion:'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1',campaignId:'c',chainId:'W06',stage:'POSITIVE',sequence:5,phase:'a'})+'\\n');
fs.appendFileSync(hb, JSON.stringify({schemaVersion:'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1',campaignId:'c',chainId:'W06',stage:'POSITIVE',sequence:3,phase:'b'})+'\\n');
setInterval(()=>{},500);
`);
  const sequenceResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [badSequence], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath, campaignId: 'c', chainId: 'W06', stageTimeoutMs: 60000, progressTimeoutMs: 60000, killGraceMs: 400,
  });
  assert.equal(sequenceResult.ok, false);
  assert.match(sequenceResult.code, /ORCH_HEARTBEAT_SEQUENCE_NON_MONOTONIC/u);
});

function makeStageResultFile({ dir, stage, options, stageData = {}, artifactDefs = {}, finishedAtUtc = null }) {
  const artifacts = {};
  for (const [key, content] of Object.entries(artifactDefs)) {
    const artifactPath = path.join(dir, `${stage.toLowerCase()}-${key}.artifact`);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, content, 'utf8');
    artifacts[key] = { path: artifactPath, sha256: sha256File(artifactPath), size: fs.statSync(artifactPath).size };
  }
  const resultPath = path.join(dir, 'ORCHESTRATOR', `${stage.toLowerCase()}-stage-result.json`);
  writeJson(resultPath, {
    schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-stage-result.v1',
    stage,
    status: 'SEALED',
    campaignId: options.campaignId,
    chainId: options.chainId,
    headSha: options.expectedSha,
    originMainSha: options.expectedSha,
    wordVersion: options.expectedWordVersion,
    wordBuild: options.expectedWordBuild,
    startedAtUtc: new Date().toISOString(),
    finishedAtUtc: finishedAtUtc || new Date(Date.now() + 1000).toISOString(),
    sequence: 3,
    stageData,
    artifacts,
    counters: {},
  });
  return resultPath;
}

test('ORCH_TEST_15: stage result verifier accepts valid and rejects malformed, identity, hash, missing and stale', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  const dir = options.campaignRoot;
  fs.mkdirSync(dir, { recursive: true });
  const started = Date.now() - 1000;
  const resultPath = makeStageResultFile({ dir, stage: 'POSITIVE', options, artifactDefs: { ledger: 'ledger-bytes', roundGates: 'gates' }, stageData: { mainRunDir: dir, ledgerPath: '/x' } });
  const green = orch.validateStageResult({
    stage: 'POSITIVE', resultPath, campaignId: options.campaignId, chainId: options.chainId,
    expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: started, requiredOutputKeys: ['ledger', 'roundGates'],
  });
  assert.equal(green.ok, true);
  fs.writeFileSync(resultPath, '{broken json', 'utf8');
  assert.match(orch.validateStageResult({ stage: 'POSITIVE', resultPath, campaignId: options.campaignId, chainId: options.chainId, expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild, stageStartedAtMs: started }).code, /ORCH_STAGE_RESULT_MALFORMED/u);
  const wrongIdentity = makeStageResultFile({ dir, stage: 'POSITIVE', options, artifactDefs: { ledger: 'a' } });
  writeJson(wrongIdentity, { ...JSON.parse(fs.readFileSync(wrongIdentity, 'utf8')), campaignId: 'WRONG' });
  assert.match(orch.validateStageResult({ stage: 'POSITIVE', resultPath: wrongIdentity, campaignId: options.campaignId, chainId: options.chainId, expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild, stageStartedAtMs: started }).code, /ORCH_STAGE_RESULT_CAMPAIGN_MISMATCH/u);
  const hashPath = makeStageResultFile({ dir, stage: 'POSITIVE', options, artifactDefs: { ledger: 'real' } });
  const parsed = JSON.parse(fs.readFileSync(hashPath, 'utf8'));
  parsed.artifacts.ledger.sha256 = 'sha256:' + '0'.repeat(64);
  writeJson(hashPath, parsed);
  assert.match(orch.validateStageResult({ stage: 'POSITIVE', resultPath: hashPath, campaignId: options.campaignId, chainId: options.chainId, expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild, stageStartedAtMs: started }).code, /ORCH_STAGE_RESULT_HASH_MISMATCH/u);
  const missingPath = makeStageResultFile({ dir, stage: 'POSITIVE', options, artifactDefs: { ledger: 'gone' } });
  const missingParsed = JSON.parse(fs.readFileSync(missingPath, 'utf8'));
  fs.rmSync(missingParsed.artifacts.ledger.path);
  assert.match(orch.validateStageResult({ stage: 'POSITIVE', resultPath: missingPath, campaignId: options.campaignId, chainId: options.chainId, expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild, stageStartedAtMs: started }).code, /ORCH_STAGE_RESULT_ARTIFACT_MISSING/u);
  const stalePath = makeStageResultFile({ dir, stage: 'POSITIVE', options, artifactDefs: { ledger: 's' }, finishedAtUtc: new Date(started - 60000).toISOString() });
  assert.match(orch.validateStageResult({ stage: 'POSITIVE', resultPath: stalePath, campaignId: options.campaignId, chainId: options.chainId, expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild, stageStartedAtMs: started }).code, /ORCH_STAGE_RESULT_STALE/u);
});

function makeStubExecutor({ options, plan = {} }) {
  return async ({ stage }) => {
    if (plan[stage] && plan[stage].fail) return plan[stage].fail;
    const stageData = stage === 'POSITIVE'
      ? { mainRunDir: path.join(options.campaignRoot, 'MAIN'), ledgerPath: path.join(options.campaignRoot, 'MAIN', 'c5v2-master-ledger.json') }
      : stage === 'NEGATIVE'
        ? { evidencePath: path.join(options.campaignRoot, 'NEGATIVE', 'negative-campaign-evidence.json') }
        : { mainRunDir: path.join(options.campaignRoot, 'MAIN'), negativeEvidencePath: path.join(options.campaignRoot, 'NEGATIVE', 'negative-campaign-evidence.json') };
    const artifactDefs = stage === 'POSITIVE'
      ? { ledger: 'fake-ledger', roundGates: 'fake-gates' }
      : stage === 'NEGATIVE'
        ? { evidence: 'fake-evidence' }
        : { terminalAggregate: 'fake-aggregate' };
    const resultDir = options.campaignRoot;
    fs.mkdirSync(path.join(resultDir, 'ORCHESTRATOR'), { recursive: true });
    makeStageResultFile({ dir: resultDir, stage, options, stageData, artifactDefs });
    return { ok: true, code: 'STUB_GREEN', exitCode: 0, signal: null, survivingDescendants: [] };
  };
}

test('ORCH_TEST_16: full stubbed chain seals all stages in order, releases lock, writes journal and chain seal', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: makeStubExecutor({ options }),
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: { orchestrator: 'sha256:x' } }),
  });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failure));
  assert.equal(outcome.state, 'CHAIN_SEALED');
  assert.deepEqual(outcome.stageSeals.map((entry) => entry.stage), ['POSITIVE', 'NEGATIVE', 'AGGREGATE']);
  assert.ok(outcome.chainSeal && outcome.chainSeal.chainSealDigest.startsWith('sha256:'));
  assert.ok(fs.existsSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-seal.json')));
  assert.ok(fs.existsSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-journal.jsonl')));
  const journal = fs.readFileSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-journal.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(journal.map((entry) => entry.transition), [
    'PREFLIGHT_GREEN', 'LOCKED', 'POSITIVE_RUNNING', 'POSITIVE_SEALED',
    'NEGATIVE_RUNNING', 'NEGATIVE_SEALED', 'AGGREGATE_RUNNING', 'AGGREGATE_SEALED', 'CHAIN_SEALED',
  ]);
  for (let index = 1; index < journal.length; index += 1) {
    assert.equal(journal[index].previousDigest, journal[index - 1].digest);
  }
  const positiveSeal = JSON.parse(fs.readFileSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'positive-stage-seal.json'), 'utf8'));
  const negativeSeal = JSON.parse(fs.readFileSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'negative-stage-seal.json'), 'utf8'));
  assert.equal(negativeSeal.previousSealDigest, positiveSeal.sealDigest);
  assert.ok(!fs.existsSync(path.join(options.artifactRoot, '.orchestrator-locks', 'c5v2-word-campaign.lock')));
});

test('ORCH_TEST_17: failing POSITIVE never starts NEGATIVE and AGGREGATE; failing NEGATIVE never starts AGGREGATE', async () => {
  const orch = await loadOrchestrator();
  const optionsA = validOptions();
  let executedStagesA = 0;
  const outcomeA = await orch.runSingleChainOrchestrator({
    options: optionsA,
    stageExecutor: async ({ stage }) => {
      executedStagesA += 1;
      if (stage === 'POSITIVE') return { ok: false, code: 'ORCH_CHILD_EXIT_NONZERO:1:none', exitCode: 1, signal: null, survivingDescendants: [] };
      return { ok: true, code: 'STUB', exitCode: 0, signal: null, survivingDescendants: [] };
    },
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: {} }),
  });
  assert.equal(outcomeA.ok, false);
  assert.equal(outcomeA.state, 'FAILED');
  assert.equal(executedStagesA, 1);
  assert.ok(fs.existsSync(path.join(optionsA.campaignRoot, 'FAILURE', 'failure-markers.jsonl')));
  assert.ok(!fs.existsSync(path.join(optionsA.artifactRoot, '.orchestrator-locks', 'c5v2-word-campaign.lock')));
  const optionsB = validOptions();
  let executedStagesB = 0;
  const outcomeB = await orch.runSingleChainOrchestrator({
    options: optionsB,
    stageExecutor: async ({ stage }) => {
      executedStagesB += 1;
      if (stage === 'NEGATIVE') return { ok: false, code: 'ORCH_CHILD_EXIT_NONZERO:2:none', exitCode: 2, signal: null, survivingDescendants: [] };
      const dir = optionsB.campaignRoot;
      fs.mkdirSync(path.join(dir, 'ORCHESTRATOR'), { recursive: true });
      makeStageResultFile({ dir, stage, options: optionsB, artifactDefs: { ledger: 'l', roundGates: 'g' }, stageData: { mainRunDir: dir, ledgerPath: '/l' } });
      return { ok: true, code: 'STUB', exitCode: 0, signal: null, survivingDescendants: [] };
    },
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: {} }),
  });
  assert.equal(outcomeB.ok, false);
  assert.equal(executedStagesB, 2);
  assert.equal(outcomeB.stageSeals.length, 1);
});

test('ORCH_TEST_18: preflight failure before a stage stops the chain before any spawn for that stage', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  let spawned = 0;
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: async () => { spawned += 1; return { ok: true, code: 'STUB', exitCode: 0, signal: null, survivingDescendants: [] }; },
    preflightHook: (scope) => (scope === 'BEFORE_POSITIVE'
      ? { ok: false, code: 'ORCH_EXPECTED_SHA_MISMATCH:x:y', scriptHashes: {} }
      : { ok: true, code: 'HOOK_GREEN', scriptHashes: {} }),
  });
  assert.equal(outcome.ok, false);
  assert.equal(spawned, 0);
  assert.match(outcome.failure.code, /ORCH_EXPECTED_SHA_MISMATCH/u);
});

test('ORCH_TEST_19: quarantined stage result keeps the lock with QUARANTINED marker', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: async () => ({ ok: false, code: 'ORCH_OWNED_DESCENDANTS_SURVIVED:4242', quarantined: true, survivingDescendants: [4242], exitCode: null, signal: 'SIGKILL' }),
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: {} }),
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.state, 'QUARANTINED');
  const lockDir = path.join(options.artifactRoot, '.orchestrator-locks', 'c5v2-word-campaign.lock');
  assert.ok(fs.existsSync(lockDir));
  assert.ok(fs.existsSync(path.join(lockDir, 'QUARANTINED.json')));
});

test('ORCH_TEST_20: pre-existing campaign root is a collision STOP and stale green directory is ignored', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  fs.mkdirSync(path.join(options.campaignRoot, 'ORCHESTRATOR'), { recursive: true });
  writeJson(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-seal.json'), { fake: 'stale-green' });
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: makeStubExecutor({ options }),
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: {} }),
  });
  assert.equal(outcome.ok, false);
  assert.match(outcome.failure.code, /ORCH_CAMPAIGN_ROOT_COLLISION/u);
  assert.equal(outcome.state, 'FAILED');
});

test('ORCH_TEST_21: test-only bypass writes no chain seal but seals all stages', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  process.env.ORCH_TEST_PREFLIGHT_BYPASS = '1';
  try {
    const outcome = await orch.runSingleChainOrchestrator({
      options,
      stageExecutor: makeStubExecutor({ options }),
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.state, 'BYPASSED_NO_CHAIN_SEAL');
    assert.equal(outcome.stageSeals.length, 3);
    assert.ok(!fs.existsSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-seal.json')));
    assert.equal(outcome.bypassMarker, 'ORCH_TEST_PREFLIGHT_BYPASS_NO_CHAIN_SEAL');
  } finally {
    delete process.env.ORCH_TEST_PREFLIGHT_BYPASS;
  }
});

function writeFakeRunner(dir) {
  const runnerPath = path.join(dir, 'fake-runner.cjs');
  const script = `
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i === -1 ? '' : args[i + 1]; };
const stage = get('--orchestrated-stage');
const runDir = get('--run-dir');
const resultPath = get('--stage-result-path');
const heartbeatPath = get('--heartbeat-path');
const campaignId = get('--campaign-id');
const chainId = get('--chain-id');
const sha = (p) => 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\\n'); };
fs.appendFileSync(runDir + '.argv.json', JSON.stringify({ stage, argv: args }) + '\\n');
let sequence = 0;
const hb = (phase) => {
  sequence += 1;
  fs.mkdirSync(path.dirname(heartbeatPath), { recursive: true });
  fs.appendFileSync(heartbeatPath, JSON.stringify({
    schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1',
    campaignId, chainId, stage, sequence, phase, atUtc: new Date().toISOString(),
  }) + '\\n');
};
hb('fake-start');
fs.mkdirSync(runDir, { recursive: true });
const result = {
  schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-stage-result.v1',
  stage,
  status: 'SEALED',
  campaignId,
  chainId,
  headSha: get('--expected-sha'),
  originMainSha: get('--expected-sha'),
  wordVersion: get('--expected-word-version'),
  wordBuild: get('--expected-word-build'),
  startedAtUtc: new Date().toISOString(),
  finishedAtUtc: new Date().toISOString(),
  sequence,
  stageData: {},
  artifacts: {},
  counters: {},
};
if (stage === 'POSITIVE') {
  const ledgerPath = path.join(runDir, 'c5v2-master-ledger.json');
  writeJson(ledgerPath, { fake: 'ledger' });
  const gatesPath = path.join(runDir, 'orchestrated-round-gates-manifest.json');
  writeJson(gatesPath, { fake: 'gates' });
  result.stageData = { mainRunDir: runDir, ledgerPath };
  result.artifacts = {
    ledger: { path: ledgerPath, sha256: sha(ledgerPath), size: fs.statSync(ledgerPath).size },
    roundGates: { path: gatesPath, sha256: sha(gatesPath), size: fs.statSync(gatesPath).size },
  };
} else if (stage === 'NEGATIVE') {
  const evidencePath = path.join(runDir, 'negative-campaign-evidence.json');
  writeJson(evidencePath, { fake: 'evidence', ledger: get('--negative-campaign-ledger') });
  result.stageData = { evidencePath };
  result.artifacts = { evidence: { path: evidencePath, sha256: sha(evidencePath), size: fs.statSync(evidencePath).size } };
} else {
  const aggregatePath = path.join(get('--resume-run-dir'), 'terminal-operation-aggregate.json');
  writeJson(aggregatePath, { fake: 'aggregate', evidence: get('--negative-aggregate-evidence') });
  result.stageData = { mainRunDir: get('--resume-run-dir'), negativeEvidencePath: get('--negative-aggregate-evidence') };
  result.artifacts = { terminalAggregate: { path: aggregatePath, sha256: sha(aggregatePath), size: fs.statSync(aggregatePath).size } };
}
hb('fake-finish');
writeJson(resultPath, result);
process.exit(0);
`;
  fs.writeFileSync(runnerPath, script, 'utf8');
  return runnerPath;
}

test('ORCH_TEST_22: real orchestrator CLI drives full fake-runner chain with exact dataflow and no chain seal under bypass', async () => {
  const dir = tmpDir('c5v2-orch-cli-');
  const artifactRoot = path.join(dir, 'artifacts');
  fs.mkdirSync(artifactRoot, { recursive: true });
  const fakeRunner = writeFakeRunner(dir);
  const campaignId = 'cli-chain-test';
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim();
  const staleGreen = path.join(artifactRoot, 'stale-green-dir');
  fs.mkdirSync(staleGreen, { recursive: true });
  writeJson(path.join(staleGreen, 'terminal-operation-aggregate.json'), { ok: true, stale: true });
  const env = {
    ...process.env,
    ORCH_TEST_PREFLIGHT_BYPASS: '1',
    ORCH_CANARY_RUNNER_PATH: fakeRunner,
  };
  const run = spawnSync(process.execPath, [
    ORCH_PATH,
    '--expected-sha', head,
    '--expected-word-version', '16.111.2',
    '--expected-word-build', '16.111.26072617',
    '--artifact-root', artifactRoot,
    '--campaign-id', campaignId,
    '--chain-id', 'W06',
  ], { encoding: 'utf8', timeout: 60000, env });
  assert.equal(run.status, 0, `stdout: ${run.stdout}\nstderr: ${run.stderr}`);
  const campaignRoot = path.join(artifactRoot, campaignId);
  const outcome = JSON.parse(run.stdout);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state, 'BYPASSED_NO_CHAIN_SEAL');
  assert.equal(outcome.stageSeals.length, 3);
  assert.ok(!fs.existsSync(path.join(campaignRoot, 'ORCHESTRATOR', 'chain-seal.json')));
  const negativeArgv = JSON.parse(fs.readFileSync(path.join(campaignRoot, 'NEGATIVE.argv.json'), 'utf8').trim().split('\n').pop());
  const aggregateArgv = JSON.parse(fs.readFileSync(path.join(campaignRoot, 'ORCHESTRATOR.argv.json'), 'utf8').trim().split('\n').pop());
  const ledgerArgIndex = negativeArgv.argv.indexOf('--negative-campaign-ledger');
  assert.equal(negativeArgv.argv[ledgerArgIndex + 1], path.join(campaignRoot, 'MAIN', 'c5v2-master-ledger.json'));
  const resumeArgIndex = aggregateArgv.argv.indexOf('--resume-run-dir');
  assert.equal(aggregateArgv.argv[resumeArgIndex + 1], path.join(campaignRoot, 'MAIN'));
  const evidenceArgIndex = aggregateArgv.argv.indexOf('--negative-aggregate-evidence');
  assert.equal(aggregateArgv.argv[evidenceArgIndex + 1], path.join(campaignRoot, 'NEGATIVE', 'negative-campaign-evidence.json'));
  const journal = fs.readFileSync(path.join(campaignRoot, 'ORCHESTRATOR', 'chain-journal.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(journal.length >= 8);
  assert.ok(!fs.existsSync(path.join(artifactRoot, '.orchestrator-locks', 'c5v2-word-campaign.lock')));
  assert.equal(fs.existsSync(path.join(staleGreen, 'terminal-operation-aggregate.json')), true);
});

test('ORCH_TEST_23: real orchestrator CLI refuses pre-existing campaign root with collision exit non-zero', async () => {
  const dir = tmpDir('c5v2-orch-collision-');
  const artifactRoot = path.join(dir, 'artifacts');
  const campaignId = 'cli-collision-test';
  fs.mkdirSync(path.join(artifactRoot, campaignId), { recursive: true });
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim();
  const run = spawnSync(process.execPath, [
    ORCH_PATH,
    '--expected-sha', head,
    '--expected-word-version', '16.111.2',
    '--expected-word-build', '16.111.26072617',
    '--artifact-root', artifactRoot,
    '--campaign-id', campaignId,
    '--chain-id', 'W06',
  ], { encoding: 'utf8', timeout: 60000, env: { ...process.env, ORCH_TEST_PREFLIGHT_BYPASS: '1' } });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /ORCH_CAMPAIGN_ROOT_COLLISION/u);
});

test('CANARY_PROTOCOL_1: orchestrated args validation rejects unknown, duplicate, missing and invalid stage', async () => {
  const canary = await loadCanary();
  const base = {
    orchestratedStage: 'POSITIVE',
    explicitRunDir: '/tmp/c5v2-canary-proto/run',
    stageResultPath: '/tmp/c5v2-canary-proto/result.json',
    heartbeatPath: '/tmp/c5v2-canary-proto/hb.jsonl',
    campaignId: 'camp',
    chainId: 'W06',
    expectedSha: 'a'.repeat(40),
    expectedWordVersion: '16.111.2',
    expectedWordBuild: '16.111.26072617',
  };
  assert.equal(canary.validateC5V2OrchestratedArgs(base, ['--orchestrated-stage', 'POSITIVE']).ok, true);
  assert.match(canary.validateC5V2OrchestratedArgs(base, ['--bogus']).code, /ORCH_CANARY_UNKNOWN_ARG/u);
  assert.match(canary.validateC5V2OrchestratedArgs(base, ['--run-dir', '--run-dir']).code, /ORCH_CANARY_DUPLICATE_ARG/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, orchestratedStage: 'SIDEWAYS' }, []).code, /ORCH_CANARY_STAGE_INVALID/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, stageResultPath: '' }, []).code, /ORCH_CANARY_ARG_REQUIRED:--stage-result-path/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, chainId: 'REP9' }, []).code, /ORCH_CANARY_CHAIN_ID_INVALID/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, campaignId: '../bad' }, []).code, /ORCH_CANARY_CAMPAIGN_ID_INVALID/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, orchestratedStage: 'NEGATIVE', negativeCampaignLedgerPath: '' }, []).code, /ORCH_CANARY_ARG_REQUIRED:--negative-campaign-ledger/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, orchestratedStage: 'AGGREGATE', resumeRunDir: '', negativeAggregateEvidencePath: '' }, []).code, /ORCH_CANARY_ARG_REQUIRED/u);
  assert.equal(canary.validateC5V2OrchestratedArgs({ orchestratedStage: '' }, []).ok, true);
});

test('CANARY_PROTOCOL_2: orchestrated run identity uses exact directory without timestamp and rejects collision and escape', async () => {
  const canary = await loadCanary();
  const root = tmpDir('c5v2-canary-runid-');
  const identity = canary.resolveC5V2RunIdentity({
    artifactRoot: root,
    runPrefix: 'c5v2-test',
    explicitRunDir: path.join(root, 'exact-stage-dir'),
    diskInfoText: '',
  });
  assert.equal(identity.runId, 'exact-stage-dir');
  assert.equal(identity.runDir, path.join(fs.realpathSync(root), 'exact-stage-dir'));
  assert.equal(identity.orchestratedExplicit, true);
  assert.ok(fs.existsSync(identity.runDir));
  assert.throws(() => canary.resolveC5V2RunIdentity({
    artifactRoot: root,
    runPrefix: 'c5v2-test',
    explicitRunDir: path.join(root, 'exact-stage-dir'),
    diskInfoText: '',
  }), /ORCH_CANARY_RUN_DIR_COLLISION/u);
  assert.throws(() => canary.resolveC5V2RunIdentity({
    artifactRoot: root,
    runPrefix: 'c5v2-test',
    explicitRunDir: path.join(root, '..', 'escape-dir'),
    diskInfoText: '',
  }), /ORCH_CANARY_RUN_DIR_OUTSIDE_ARTIFACT_ROOT/u);
  const legacy = canary.resolveC5V2RunIdentity({ artifactRoot: root, runPrefix: 'c5v2-legacy', diskInfoText: '' });
  assert.notEqual(identity.runId, legacy.runId);
  assert.match(legacy.runId, /^c5v2-legacy-\d{8}T\d{6}Z$/u);
});
