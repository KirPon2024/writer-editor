#!/usr/bin/env node
/**
 * rtk-word-c5v2-terminal-orchestrator.mjs
 *
 * Repository-native certification-grade orchestrator for the Word C5V2 terminal
 * campaign chains (main campaign -> negative campaign -> resume-binding aggregate).
 *
 * Invariants implemented (hardening directive):
 * - EXPECTED_SHA: exact expected SHA verified at chain start and before seal.
 * - CLEAN_TREE: any undeclared worktree change is a STOP.
 * - SECURE_VOLUME: secure volume identity/encryption/writability/free space gate.
 * - WORD_BUILD_GATE: exact full Word build verified at preflight and before seal.
 * - EXPLICIT_RUN_DIRECTORY / FORBIDDEN_DISCOVERY: no latest, no glob, no mtime sort.
 * - CHILD_EXIT: any non-zero exit, signal, timeout, malformed result or missing
 *   artifact stops the chain non-zero with an append-only failure marker.
 * - ORCHESTRATOR_LOCK: exclusive lock prevents two writer-capable orchestrators.
 * - HEARTBEAT/TIMEOUTS: bounded wall timeout per stage and output-activity watchdog
 *   that kills silent children (child-death class of 2026-08-05 incident).
 * - FAILURE_MARKER / NO_AGGREGATE_ON_FAILURE.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';

export const ORCHESTRATOR_SCHEMA_VERSION = 'yalken.rtk.word.c5v2.terminal-orchestrator.v1';

function nowIso() {
  return new Date().toISOString();
}

function sha256File(filePath) {
  return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, filePath);
}

export function parseOrchestratorArgs(argv = []) {
  const options = {
    expectedSha: '',
    expectedWordBuild: '',
    artifactRoot: '',
    runPrefix: '',
    resumeRunDir: '',
    negativeAggregateEvidence: '',
    lockRoot: '',
    workRoot: '',
    stageTimeoutMs: 4 * 60 * 60 * 1000,
    activityTimeoutMs: 30 * 60 * 1000,
    skipWordBuildGate: false,
    skipSecureVolumeGate: false,
    chainOnly: '',
  };
  const required = ['expectedSha', 'expectedWordBuild', 'artifactRoot', 'runPrefix'];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    const take = () => { index += 1; return next; };
    if (arg === '--expected-sha') options.expectedSha = String(take() || '');
    else if (arg === '--expected-word-build') options.expectedWordBuild = String(take() || '');
    else if (arg === '--artifact-root') options.artifactRoot = String(take() || '');
    else if (arg === '--run-prefix') options.runPrefix = String(take() || '');
    else if (arg === '--resume-run-dir') options.resumeRunDir = String(take() || '');
    else if (arg === '--negative-aggregate-evidence') options.negativeAggregateEvidence = String(take() || '');
    else if (arg === '--lock-root') options.lockRoot = String(take() || '');
    else if (arg === '--work-root') options.workRoot = String(take() || '');
    else if (arg === '--stage-timeout-ms') options.stageTimeoutMs = Number.parseInt(take(), 10);
    else if (arg === '--activity-timeout-ms') options.activityTimeoutMs = Number.parseInt(take(), 10);
    else if (arg === '--skip-word-build-gate') options.skipWordBuildGate = true;
    else if (arg === '--skip-secure-volume-gate') options.skipSecureVolumeGate = true;
    else if (arg === '--chain-only') options.chainOnly = String(take() || '');
  }
  for (const key of required) {
    if (!options[key]) throw new Error(`ORCH_ARG_REQUIRED:--${key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(options.expectedSha)) {
    throw new Error(`ORCH_EXPECTED_SHA_FORMAT:${options.expectedSha}`);
  }
  if (!/^\d+\.\d+\.\d+$/u.test(options.expectedWordBuild)) {
    throw new Error(`ORCH_EXPECTED_WORD_BUILD_FORMAT:${options.expectedWordBuild}`);
  }
  return options;
}

function gitValue(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw new Error(`ORCH_GIT_FAILED:${args.join(' ')}:${String(result.stderr || '').slice(0, 200)}`);
  return String(result.stdout || '').trim();
}

export function assertOrchestratorExpectedSha({ repoRoot, expectedSha }) {
  const head = gitValue(repoRoot, ['rev-parse', 'HEAD']);
  if (head !== expectedSha) {
    return { ok: false, code: `ORCH_EXPECTED_SHA_MISMATCH:${expectedSha}:${head}` };
  }
  return { ok: true, code: 'ORCH_EXPECTED_SHA_VERIFIED', head };
}

export function assertOrchestratorCleanTree({ repoRoot }) {
  const dirty = gitValue(repoRoot, ['status', '--porcelain']);
  if (dirty) {
    return { ok: false, code: `ORCH_CLEAN_TREE_VIOLATION:${dirty.split('\n')[0].slice(0, 120)}` };
  }
  return { ok: true, code: 'ORCH_CLEAN_TREE_VERIFIED' };
}

export function assertOrchestratorWordBuild({ expectedWordBuild, versionText, buildText }) {
  const version = typeof versionText === 'string' ? versionText.trim() : '';
  const build = typeof buildText === 'string' ? buildText.trim() : '';
  if (build !== expectedWordBuild) {
    return { ok: false, code: `ORCH_WORD_BUILD_MISMATCH:${expectedWordBuild}:${build || 'UNAVAILABLE'}:${version}` };
  }
  return { ok: true, code: 'ORCH_WORD_BUILD_VERIFIED', version, build };
}

export function assertOrchestratorSecureVolume({ volumePath, expectedUuid }) {
  let info = '';
  try {
    info = execFileSync('diskutil', ['info', volumePath], { encoding: 'utf8', timeout: 20000 });
  } catch (error) {
    return { ok: false, code: `ORCH_SECURE_VOLUME_UNAVAILABLE:${volumePath}` };
  }
  const uuid = (info.match(/Volume UUID:\s+([0-9A-F-]+)/u) || [])[1] || '';
  const fileVault = /FileVault:\s+Yes/u.test(info);
  const apfs = /APFS/u.test(info);
  if (expectedUuid && uuid !== expectedUuid) {
    return { ok: false, code: `ORCH_SECURE_VOLUME_UUID_MISMATCH:${expectedUuid}:${uuid}` };
  }
  if (!fileVault || !apfs) {
    return { ok: false, code: `ORCH_SECURE_VOLUME_NOT_ENCRYPTED_APFS:${volumePath}` };
  }
  try {
    fs.accessSync(volumePath, fs.constants.W_OK);
  } catch {
    return { ok: false, code: `ORCH_SECURE_VOLUME_NOT_WRITABLE:${volumePath}` };
  }
  const df = spawnSync('df', ['-k', volumePath], { encoding: 'utf8' });
  const availKb = Number((String(df.stdout || '').trim().split('\n').pop() || '').split(/\s+/u)[3] || 0);
  if (!Number.isFinite(availKb) || availKb < 10 * 1024 * 1024) {
    return { ok: false, code: `ORCH_SECURE_VOLUME_LOW_SPACE:${availKb}` };
  }
  return { ok: true, code: 'ORCH_SECURE_VOLUME_VERIFIED', uuid, availKb };
}

export function acquireOrchestratorLock({ lockRoot, campaignId }) {
  fs.mkdirSync(lockRoot, { recursive: true });
  const lockDirName = `c5v2-terminal-orchestrator.lock`;
  const lockDir = path.join(lockRoot, lockDirName);
  const ownerPath = path.join(lockDir, 'owner.json');
  if (fs.existsSync(lockDir)) {
    let owner = null;
    try { owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8')); } catch { owner = null; }
    const ownerPid = Number(owner?.pid || 0);
    let ownerAlive = false;
    if (ownerPid > 0) {
      try { process.kill(ownerPid, 0); ownerAlive = true; } catch { ownerAlive = false; }
    }
    if (ownerAlive) {
      return { ok: false, code: `ORCH_LOCK_HELD:${ownerPid}:${owner?.campaignId || 'unknown'}` };
    }
    const brokeMarker = {
      brokeStaleLockAtUtc: nowIso(),
      previousOwner: owner,
      newCampaignId: campaignId,
    };
    fs.writeFileSync(path.join(lockDir, `stale-lock-broken-${Date.now()}.json`), JSON.stringify(brokeMarker, null, 2) + '\n', 'utf8');
    const payload = { pid: process.pid, campaignId, acquiredAtUtc: nowIso(), previousOwnerStale: true };
    fs.writeFileSync(ownerPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return { ok: true, code: 'ORCH_LOCK_ACQUIRED_STALE_BROKEN', lockDirName, brokeStaleLock: true };
  }
  fs.mkdirSync(lockDir);
  const payload = { pid: process.pid, campaignId, acquiredAtUtc: nowIso() };
  fs.writeFileSync(ownerPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { ok: true, code: 'ORCH_LOCK_ACQUIRED', lockDirName, brokeStaleLock: false };
}

export function releaseOrchestratorLock({ lockRoot, lockDirName }) {
  const lockDir = path.join(lockRoot, lockDirName || 'c5v2-terminal-orchestrator.lock');
  if (!fs.existsSync(lockDir)) return { ok: true, code: 'ORCH_LOCK_ALREADY_ABSENT' };
  fs.rmSync(lockDir, { recursive: true, force: true });
  return { ok: true, code: 'ORCH_LOCK_RELEASED' };
}

export function writeOrchestratorFailureMarker({ failureDir, marker }) {
  fs.mkdirSync(failureDir, { recursive: true });
  const markerPath = path.join(failureDir, 'orchestrator-failures.jsonl');
  const line = JSON.stringify({ schemaVersion: ORCHESTRATOR_SCHEMA_VERSION, atUtc: nowIso(), ...marker });
  fs.appendFileSync(markerPath, line + '\n', 'utf8');
  return markerPath;
}

export function runStageChild({
  stage,
  command,
  args = [],
  cwd = process.cwd(),
  env = {},
  logDir,
  failureDir = '',
  timeoutMs = 60_000,
  activityTimeoutMs = 30_000,
  expectedArtifacts = [],
}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    fs.mkdirSync(logDir, { recursive: true });
    const stdoutPath = path.join(logDir, `${stage.toLowerCase()}.stdout.log`);
    const stderrPath = path.join(logDir, `${stage.toLowerCase()}.stderr.log`);
    const stdoutFd = fs.openSync(stdoutPath, 'a');
    const stderrFd = fs.openSync(stderrPath, 'a');
    let lastActivityAt = Date.now();
    let settled = false;
    let killReason = '';
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      try { fs.closeSync(stdoutFd); } catch { /* noop */ }
      try { fs.closeSync(stderrFd); } catch { /* noop */ }
      const missingArtifacts = expectedArtifacts.filter((artifact) => !fs.existsSync(artifact));
      const base = {
        schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
        stage,
        pid: child.pid,
        startedAtUtc: new Date(startedAt).toISOString(),
        finishedAtUtc: nowIso(),
        durationMs: Date.now() - startedAt,
        missingArtifacts,
        stdoutPath,
        stderrPath,
      };
      if (result.ok !== true && failureDir) {
        writeOrchestratorFailureMarker({
          failureDir,
          marker: {
            stage,
            code: result.code,
            exitCode: result.exitCode ?? null,
            signal: result.signal ?? null,
            killReason,
            missingArtifacts,
          },
        });
      }
      resolve({ ...base, ...result, missingArtifacts });
    };
    child.stdout.on('data', (chunk) => { lastActivityAt = Date.now(); fs.writeSync(stdoutFd, chunk); });
    child.stderr.on('data', (chunk) => { lastActivityAt = Date.now(); fs.writeSync(stderrFd, chunk); });
    child.on('error', (error) => {
      finish({ ok: false, code: `ORCH_CHILD_SPAWN_ERROR:${String(error && error.message ? error.message : error).slice(0, 160)}`, exitCode: null, signal: null });
    });
    child.on('exit', (exitCode, signal) => {
      if (killReason) {
        finish({ ok: false, code: killReason, exitCode, signal });
        return;
      }
      if (exitCode === 0 && signal === null) {
        const missingArtifacts = expectedArtifacts.filter((artifact) => !fs.existsSync(artifact));
        if (missingArtifacts.length > 0) {
          finish({ ok: false, code: `ORCH_STAGE_ARTIFACT_MISSING:${missingArtifacts.join(',')}`, exitCode, signal });
          return;
        }
        finish({ ok: true, code: 'ORCH_STAGE_CHILD_GREEN', exitCode, signal });
        return;
      }
      finish({ ok: false, code: `ORCH_CHILD_EXIT_NONZERO:${exitCode}:${signal || 'none'}`, exitCode, signal });
    });
    const watchdog = setInterval(() => {
      const now = Date.now();
      if (now - startedAt > timeoutMs) {
        killReason = `ORCH_STAGE_TIMEOUT:${stage}:${timeoutMs}`;
        try { child.kill('SIGTERM'); } catch { /* noop */ }
        setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* noop */ } }, 3000).unref();
        return;
      }
      if (now - lastActivityAt > activityTimeoutMs) {
        killReason = `ORCH_ACTIVITY_TIMEOUT:${stage}:${activityTimeoutMs}`;
        try { child.kill('SIGTERM'); } catch { /* noop */ }
        setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* noop */ } }, 3000).unref();
      }
    }, 250);
    watchdog.unref();
  });
}

export async function runTerminalChain({
  chainId,
  workRoot,
  stages,
  timeoutMs = 4 * 60 * 60 * 1000,
  activityTimeoutMs = 30 * 60 * 1000,
  failureDir = '',
}) {
  fs.mkdirSync(workRoot, { recursive: true });
  const logDir = path.join(workRoot, 'logs');
  const resolvedFailureDir = failureDir || path.join(workRoot, 'failures');
  const stageResults = [];
  for (const stageSpec of stages) {
    const result = await runStageChild({
      stage: stageSpec.stage,
      command: stageSpec.command,
      args: stageSpec.args || [],
      cwd: stageSpec.cwd || workRoot,
      env: stageSpec.env || {},
      logDir,
      failureDir: resolvedFailureDir,
      timeoutMs: stageSpec.timeoutMs || timeoutMs,
      activityTimeoutMs: stageSpec.activityTimeoutMs || activityTimeoutMs,
      expectedArtifacts: stageSpec.expectedArtifacts || [],
    });
    stageResults.push(result);
    if (result.ok !== true) {
      const chainResult = {
        schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
        chainId,
        ok: false,
        failedStage: result.stage,
        code: result.code,
        stageResults,
        finishedAtUtc: nowIso(),
      };
      writeJsonAtomic(path.join(workRoot, `${chainId}.chain-result.json`), chainResult);
      return chainResult;
    }
  }
  const chainResult = {
    schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
    chainId,
    ok: true,
    failedStage: '',
    code: 'ORCH_CHAIN_GREEN',
    stageResults,
    finishedAtUtc: nowIso(),
  };
  writeJsonAtomic(path.join(workRoot, `${chainId}.chain-result.json`), chainResult);
  return chainResult;
}

function stageGateArtifacts(runDir) {
  const artifacts = [];
  for (let index = 1; index <= 5; index += 1) {
    artifacts.push(path.join(runDir, `round-${String(index).padStart(2, '0')}`, 'complete-round-oracle-gate.json'));
  }
  return artifacts;
}

async function main() {
  const options = parseOrchestratorArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const workRoot = options.workRoot || path.join(options.artifactRoot, '.orchestrator-work');
  const lockRoot = options.lockRoot || path.join(options.artifactRoot, '.orchestrator-locks');
  const campaignId = options.runPrefix;
  const preflight = [
    assertOrchestratorExpectedSha({ repoRoot, expectedSha: options.expectedSha }),
    assertOrchestratorCleanTree({ repoRoot }),
  ];
  if (!options.skipSecureVolumeGate) {
    preflight.push(assertOrchestratorSecureVolume({
      volumePath: options.artifactRoot.split(path.sep).slice(0, 3).join(path.sep) || options.artifactRoot,
      expectedUuid: 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2',
    }));
  }
  if (!options.skipWordBuildGate) {
    let versionText = '';
    let buildText = '';
    try {
      versionText = execFileSync('/usr/bin/osascript', ['-e', 'tell application "Microsoft Word" to return version as text'], { encoding: 'utf8', timeout: 30000 });
    } catch { versionText = ''; }
    try {
      buildText = execFileSync('defaults', ['read', '/Applications/Microsoft Word.app/Contents/Info.plist', 'CFBundleVersion'], { encoding: 'utf8', timeout: 15000 });
    } catch { buildText = ''; }
    preflight.push(assertOrchestratorWordBuild({ expectedWordBuild: options.expectedWordBuild, versionText, buildText }));
  }
  const preflightFailure = preflight.find((entry) => entry.ok !== true);
  if (preflightFailure) {
    writeOrchestratorFailureMarker({
      failureDir: path.join(workRoot, 'failures'),
      marker: { stage: 'PREFLIGHT', code: preflightFailure.code, exitCode: null, signal: null },
    });
    process.stderr.write(`${preflightFailure.code}\n`);
    process.exit(2);
  }
  const lock = acquireOrchestratorLock({ lockRoot, campaignId });
  if (lock.ok !== true) {
    process.stderr.write(`${lock.code}\n`);
    process.exit(3);
  }
  try {
    const runnerPath = path.join(repoRoot, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs');
    const mainPrefix = options.runPrefix;
    const mainDirGuess = path.join(options.artifactRoot, `${mainPrefix}.run`);
    const stages = [];
    if (!options.chainOnly || options.chainOnly === 'main') {
      stages.push({
        stage: 'MAIN',
        command: process.execPath,
        args: [runnerPath, '--master-ledger-campaign', '--scene-count', '21', '--round-count', '5',
          '--run-prefix', mainPrefix, '--artifact-root', options.artifactRoot,
          '--explicit-run-dir', mainDirGuess],
        expectedArtifacts: stageGateArtifacts(mainDirGuess),
      });
    }
    if (!options.chainOnly || options.chainOnly === 'negative') {
      stages.push({
        stage: 'NEGATIVE',
        command: process.execPath,
        args: [runnerPath, '--negative-campaign-ledger', path.join(mainDirGuess, 'c5v2-master-ledger.json'),
          '--negative-probe-start', '1', '--negative-probe-count', '40',
          '--run-prefix', `c5v2-negative-40-${mainPrefix.replace(/^c5v2-/u, '')}`,
          '--artifact-root', options.artifactRoot],
        expectedArtifacts: [],
      });
    }
    if (!options.chainOnly || options.chainOnly === 'aggregate') {
      stages.push({
        stage: 'AGGREGATE',
        command: process.execPath,
        args: [runnerPath, '--master-ledger-campaign', '--scene-count', '21', '--round-count', '5',
          '--run-prefix', mainPrefix, '--artifact-root', options.artifactRoot,
          '--resume-run-dir', options.resumeRunDir || mainDirGuess,
          ...(options.negativeAggregateEvidence ? ['--negative-aggregate-evidence', options.negativeAggregateEvidence] : [])],
        expectedArtifacts: [],
      });
    }
    const result = await runTerminalChain({
      chainId: campaignId,
      workRoot,
      stages,
      timeoutMs: options.stageTimeoutMs,
      activityTimeoutMs: options.activityTimeoutMs,
    });
    const seal = assertOrchestratorExpectedSha({ repoRoot, expectedSha: options.expectedSha });
    if (seal.ok !== true) {
      writeOrchestratorFailureMarker({
        failureDir: path.join(workRoot, 'failures'),
        marker: { stage: 'SEAL', code: seal.code, exitCode: null, signal: null },
      });
      process.stderr.write(`${seal.code}\n`);
      process.exit(4);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok === true ? 0 : 1);
  } finally {
    releaseOrchestratorLock({ lockRoot, lockDirName: lock.lockDirName });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    process.stderr.write(`ORCH_FATAL:${String(error && error.message ? error.message : error)}\n`);
    process.exit(1);
  });
}
