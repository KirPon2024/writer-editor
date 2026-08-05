#!/usr/bin/env node
/**
 * rtk-word-c5v2-terminal-orchestrator.mjs
 *
 * Fail-closed single-chain orchestration engine for the Word C5V2 terminal
 * campaign: POSITIVE (5 cumulative rounds) -> NEGATIVE (40 probes) ->
 * AGGREGATE (reuse-binding terminal aggregate), with a strict stage protocol,
 * independently validated stage results, hash-linked chain journal and seals.
 *
 * Primary invariants: EXPLICIT_IDENTITY_ONLY, FAILURE_CANNOT_BECOME_SUCCESS,
 * OLD_GREEN_CANNOT_SATISFY_NEW_STAGE, CHILD_EXIT_IS_NOT_STAGE_PROOF,
 * NO_OWNED_PROCESS_SURVIVES_FAILED_STAGE,
 * AGGREGATE_CANNOT_START_BEFORE_POSITIVE_AND_NEGATIVE_SEALS,
 * LOCK_RELEASE_REQUIRES_OWNER_TOKEN, FINALLY_ALWAYS_EXECUTES,
 * CERTIFICATION_GATES_CANNOT_BE_SKIPPED, UNKNOWN_STATE_IS_QUARANTINED.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ORCH_SCHEMA = 'yalken.rtk.word.c5v2.terminal-orchestrator.v2';
export const STAGE_RESULT_SCHEMA = 'yalken.rtk.word.c5v2.orchestrated-stage-result.v1';
export const STAGE_SEAL_SCHEMA = 'yalken.rtk.word.c5v2.orchestrated-stage-seal.v1';
export const HEARTBEAT_SCHEMA = 'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1';
export const CHAIN_IDS = Object.freeze(['W06', 'REP1', 'REP2', 'REP3']);
export const STAGES = Object.freeze(['POSITIVE', 'NEGATIVE', 'AGGREGATE']);
const SECURE_VOLUME_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';
const IDENTITY_RE = /^[A-Za-z0-9._-]{1,64}$/u;

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..', '..');

function nowIso() {
  return new Date().toISOString();
}

function sha256Bytes(bytes) {
  return 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(String(value), 'utf8'));
}

function digestOf(value) {
  return sha256Text(stableJson(value));
}

function randomToken() {
  return crypto.randomBytes(16).toString('hex');
}

function writeAtomicVerified(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, 'utf8');
  const fd = fs.openSync(tempPath, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
  const reopened = fs.readFileSync(filePath, 'utf8');
  if (reopened !== content) throw new Error(`ORCH_ATOMIC_PUBLISH_VERIFY_FAILED:${filePath}`);
  return { path: filePath, sha256: sha256Bytes(Buffer.from(content, 'utf8')), bytes: content.length };
}

function writeJsonAtomicVerified(filePath, value) {
  return writeAtomicVerified(filePath, JSON.stringify(value, null, 2) + '\n');
}

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
}

function gitValue(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) {
    return { ok: false, code: `ORCH_GIT_FAILED:${args.join(' ')}:${String(result.stderr || '').slice(0, 160)}` };
  }
  return { ok: true, value: String(result.stdout || '').trim() };
}

// ---------------------------------------------------------------------------
// Strict CLI
// ---------------------------------------------------------------------------

export function parseOrchestratorArgs(argv = []) {
  const spec = new Map([
    ['--expected-sha', { key: 'expectedSha', value: true }],
    ['--expected-word-version', { key: 'expectedWordVersion', value: true }],
    ['--expected-word-build', { key: 'expectedWordBuild', value: true }],
    ['--artifact-root', { key: 'artifactRoot', value: true }],
    ['--campaign-id', { key: 'campaignId', value: true }],
    ['--chain-id', { key: 'chainId', value: true }],
    ['--resume', { key: 'resume', value: false }],
    ['--stage-timeout-ms', { key: 'stageTimeoutMs', value: true }],
    ['--progress-timeout-ms', { key: 'progressTimeoutMs', value: true }],
    ['--kill-grace-ms', { key: 'killGraceMs', value: true }],
  ]);
  const options = {
    expectedSha: '',
    expectedWordVersion: '',
    expectedWordBuild: '',
    artifactRoot: '',
    campaignId: '',
    chainId: '',
    resume: false,
    stageTimeoutMs: 6 * 60 * 60 * 1000,
    progressTimeoutMs: 30 * 60 * 1000,
    killGraceMs: 5000,
  };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const entry = spec.get(arg);
    if (!entry) throw new Error(`ORCH_UNKNOWN_ARG:${arg}`);
    if (seen.has(arg)) throw new Error(`ORCH_DUPLICATE_ARG:${arg}`);
    seen.add(arg);
    if (!entry.value) {
      options[entry.key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || String(value).startsWith('--')) throw new Error(`ORCH_ARG_VALUE_MISSING:${arg}`);
    index += 1;
    options[entry.key] = value;
  }
  for (const [flag, entry] of spec.entries()) {
    if (['--stage-timeout-ms', '--progress-timeout-ms', '--kill-grace-ms', '--resume'].includes(flag)) continue;
    if (!options[entry.key]) throw new Error(`ORCH_ARG_REQUIRED:${flag}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(options.expectedSha)) throw new Error(`ORCH_ARG_INVALID:--expected-sha:${options.expectedSha}`);
  if (!/^\d+\.\d+\.\d+$/u.test(options.expectedWordVersion)) throw new Error(`ORCH_ARG_INVALID:--expected-word-version:${options.expectedWordVersion}`);
  if (!/^\d+\.\d+\.\d+$/u.test(options.expectedWordBuild)) throw new Error(`ORCH_ARG_INVALID:--expected-word-build:${options.expectedWordBuild}`);
  if (!CHAIN_IDS.includes(options.chainId)) throw new Error(`ORCH_CHAIN_ID_INVALID:${options.chainId}`);
  if (!IDENTITY_RE.test(options.campaignId)) throw new Error(`ORCH_CAMPAIGN_ID_INVALID:${options.campaignId}`);
  for (const key of ['stageTimeoutMs', 'progressTimeoutMs', 'killGraceMs']) {
    const parsed = Number(options[key]);
    if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 24 * 60 * 60 * 1000) {
      throw new Error(`ORCH_ARG_INVALID:--${key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}:${options[key]}`);
    }
    options[key] = parsed;
  }
  const artifactRoot = path.resolve(options.artifactRoot);
  if (!path.isAbsolute(artifactRoot)) throw new Error('ORCH_ARG_INVALID:--artifact-root:not-absolute');
  options.artifactRoot = artifactRoot;
  options.campaignRoot = path.join(artifactRoot, options.campaignId);
  return options;
}

// ---------------------------------------------------------------------------
// Path authority
// ---------------------------------------------------------------------------

export function assertOrchestratorPathAuthority({ artifactRoot, campaignRoot, mustBeAbsent }) {
  // Canonicalize first: on macOS /var is a symlink to /private/var. All
  // comparisons happen in realpath space.
  const canonicalRoot = fs.existsSync(artifactRoot) ? fs.realpathSync(artifactRoot) : path.resolve(artifactRoot);
  const rawCampaign = path.resolve(campaignRoot);
  if (!path.isAbsolute(canonicalRoot) || !path.isAbsolute(rawCampaign)) {
    return { ok: false, code: 'ORCH_PATH_NOT_ABSOLUTE' };
  }
  let cursor = rawCampaign;
  const missingSegments = [];
  while (!fs.existsSync(cursor) && cursor !== canonicalRoot && cursor !== path.parse(cursor).root) {
    missingSegments.push(path.basename(cursor));
    cursor = path.dirname(cursor);
  }
  let canonicalCampaign = rawCampaign;
  if (fs.existsSync(cursor)) {
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) return { ok: false, code: `ORCH_PATH_SYMLINK_COMPONENT:${cursor}` };
    const realCursor = fs.realpathSync(cursor);
    canonicalCampaign = missingSegments.length > 0
      ? path.join(realCursor, ...missingSegments.reverse())
      : realCursor;
  }
  const relative = path.relative(canonicalRoot, canonicalCampaign);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return { ok: false, code: `ORCH_PATH_ESCAPE:${canonicalCampaign}` };
  }
  if (mustBeAbsent && fs.existsSync(canonicalCampaign)) {
    return { ok: false, code: `ORCH_CAMPAIGN_ROOT_COLLISION:${canonicalCampaign}` };
  }
  return { ok: true, code: 'ORCH_PATH_AUTHORITY_VERIFIED', canonicalCampaignRoot: canonicalCampaign };
}

// ---------------------------------------------------------------------------
// Preflight (re-run before every stage and before chain seal)
// ---------------------------------------------------------------------------

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function extractXmlPlistStringValue(plistText, key) {
  const pattern = new RegExp(`<key>\\s*${escapeRegExp(key)}\\s*<\\/key>\\s*<string>([^<]+)<\\/string>`, 'u');
  return (String(plistText || '').match(pattern) || [])[1] || '';
}

function readWordPlistVersionAndBuild(wordPlistPath) {
  try {
    return {
      wordVersion: String(execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', wordPlistPath], { encoding: 'utf8', timeout: 15000 })).trim(),
      wordBuild: String(execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleVersion', 'raw', '-o', '-', wordPlistPath], { encoding: 'utf8', timeout: 15000 })).trim(),
      error: '',
    };
  } catch (error) {
    if (fs.existsSync(wordPlistPath)) {
      try {
        const plistText = fs.readFileSync(wordPlistPath, 'utf8');
        return {
          wordVersion: extractXmlPlistStringValue(plistText, 'CFBundleShortVersionString').trim(),
          wordBuild: extractXmlPlistStringValue(plistText, 'CFBundleVersion').trim(),
          error: '',
        };
      } catch {
        // Fall through to the original fail-closed unavailable error.
      }
    }
    return {
      wordVersion: '',
      wordBuild: '',
      error: String(error && error.message ? error.message : error).slice(0, 120),
    };
  }
}

export function runOrchestratorPreflight({ options, scope, repoRoot = REPO_ROOT, wordPlistPath = '/Applications/Microsoft Word.app/Contents/Info.plist' }) {
  const failures = [];
  const head = gitValue(repoRoot, ['rev-parse', 'HEAD']);
  if (!head.ok) failures.push(head.code);
  else if (head.value !== options.expectedSha) failures.push(`ORCH_EXPECTED_SHA_MISMATCH:${options.expectedSha}:${head.value}`);
  const origin = gitValue(repoRoot, ['rev-parse', 'origin/main']);
  if (!origin.ok) failures.push(origin.code);
  else if (origin.value !== options.expectedSha) failures.push(`ORCH_EXPECTED_ORIGIN_MAIN_MISMATCH:${options.expectedSha}:${origin.value}`);
  const dirty = gitValue(repoRoot, ['status', '--porcelain']);
  if (!dirty.ok) failures.push(dirty.code);
  else if (dirty.value) failures.push(`ORCH_CLEAN_TREE_VIOLATION:${dirty.value.split('\n')[0].slice(0, 120)}`);
  let wordVersion = '';
  let wordBuild = '';
  const plist = readWordPlistVersionAndBuild(wordPlistPath);
  wordVersion = plist.wordVersion;
  wordBuild = plist.wordBuild;
  if (plist.error) failures.push(`ORCH_WORD_PLIST_UNAVAILABLE:${plist.error}`);
  if (wordVersion && wordVersion !== options.expectedWordVersion) failures.push(`ORCH_WORD_VERSION_MISMATCH:${options.expectedWordVersion}:${wordVersion}`);
  if (wordBuild && wordBuild !== options.expectedWordBuild) failures.push(`ORCH_WORD_BUILD_MISMATCH:${options.expectedWordBuild}:${wordBuild}`);
  if (!wordVersion) failures.push('ORCH_WORD_VERSION_UNAVAILABLE');
  if (!wordBuild) failures.push('ORCH_WORD_BUILD_UNAVAILABLE');
  let volumeInfo = '';
  try {
    volumeInfo = execFileSync('diskutil', ['info', '-plist', options.artifactRoot], { encoding: 'utf8', timeout: 20000 });
  } catch (error) {
    failures.push(`ORCH_SECURE_VOLUME_UNAVAILABLE:${options.artifactRoot}`);
  }
  if (volumeInfo) {
    const uuid = (volumeInfo.match(/<key>VolumeUUID<\/key>\s*<string>([^<]+)</u) || [])[1] || '';
    const fileVault = /<key>FileVault<\/key>\s*<true\/>/u.test(volumeInfo);
    const apfs = /APFS/u.test(volumeInfo);
    if (uuid !== SECURE_VOLUME_UUID) failures.push(`ORCH_SECURE_VOLUME_UUID_MISMATCH:${SECURE_VOLUME_UUID}:${uuid}`);
    if (!fileVault) failures.push('ORCH_SECURE_VOLUME_NOT_ENCRYPTED');
    if (!apfs) failures.push('ORCH_SECURE_VOLUME_NOT_APFS');
    try {
      fs.accessSync(options.artifactRoot, fs.constants.W_OK);
    } catch {
      failures.push('ORCH_SECURE_VOLUME_NOT_WRITABLE');
    }
    const df = spawnSync('df', ['-k', options.artifactRoot], { encoding: 'utf8' });
    const availKb = Number((String(df.stdout || '').trim().split('\n').pop() || '').split(/\s+/u)[3] || 0);
    if (!Number.isFinite(availKb) || availKb < 10 * 1024 * 1024) failures.push(`ORCH_SECURE_VOLUME_LOW_SPACE:${availKb}`);
  }
  const scriptHashes = {
    orchestrator: sha256File(THIS_FILE),
    physicalCanary: sha256File(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs')),
  };
  return {
    ok: failures.length === 0,
    code: failures.length === 0 ? 'ORCH_PREFLIGHT_GREEN' : `ORCH_PREFLIGHT_FAILED:${failures.join('|')}`,
    scope,
    failures,
    checkedAtUtc: nowIso(),
    scriptHashes,
  };
}

// ---------------------------------------------------------------------------
// Token lock (atomic mkdir, no auto stale break, token release)
// ---------------------------------------------------------------------------

export function acquireOrchestratorLock({ lockRoot, campaignId, chainId, expectedSha }) {
  const lockDir = path.join(lockRoot, 'c5v2-word-campaign.lock');
  try {
    fs.mkdirSync(lockRoot, { recursive: true });
    fs.mkdirSync(lockDir);
  } catch (error) {
    if (fs.existsSync(lockDir)) {
      let owner = null;
      try { owner = JSON.parse(fs.readFileSync(path.join(lockDir, 'owner.json'), 'utf8')); } catch { owner = null; }
      if (!owner) return { ok: false, code: `ORCH_LOCK_AMBIGUOUS:${lockDir}` };
      const ownerPid = Number(owner.pid || 0);
      let alive = false;
      if (ownerPid > 0) {
        try { process.kill(ownerPid, 0); alive = true; } catch { alive = false; }
      }
      if (alive) return { ok: false, code: `ORCH_LOCK_HELD:${ownerPid}:${owner.campaignId || 'unknown'}` };
      return { ok: false, code: `ORCH_STALE_LOCK_REQUIRES_EXPLICIT_CLEANUP:${lockDir}:${owner.campaignId || 'unknown'}` };
    }
    return { ok: false, code: `ORCH_LOCK_ACQUIRE_FAILED:${String(error && error.message ? error.message : error).slice(0, 120)}` };
  }
  const ownershipToken = randomToken();
  const owner = {
    schemaVersion: ORCH_SCHEMA,
    pid: process.pid,
    processStartIdentity: `${process.pid}:${nowIso()}`,
    campaignId,
    chainId,
    ownershipToken,
    expectedSha,
    acquiredAtUtc: nowIso(),
  };
  writeJsonAtomicVerified(path.join(lockDir, 'owner.json'), owner);
  return { ok: true, code: 'ORCH_LOCK_ACQUIRED', lockDir, ownershipToken, owner };
}

export function releaseOrchestratorLock({ lockDir, ownershipToken, campaignId, quarantined = false, quarantineReason = '' }) {
  const ownerPath = path.join(lockDir, 'owner.json');
  if (!fs.existsSync(ownerPath)) return { ok: false, code: 'ORCH_LOCK_RELEASE_OWNER_MISSING' };
  let owner = null;
  try { owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8')); } catch { owner = null; }
  if (!owner) return { ok: false, code: 'ORCH_LOCK_RELEASE_OWNER_UNREADABLE' };
  if (owner.ownershipToken !== ownershipToken || owner.campaignId !== campaignId || owner.pid !== process.pid) {
    return { ok: false, code: 'ORCH_LOCK_RELEASE_TOKEN_MISMATCH' };
  }
  if (quarantined) {
    writeJsonAtomicVerified(path.join(lockDir, 'QUARANTINED.json'), {
      schemaVersion: ORCH_SCHEMA,
      reason: quarantineReason,
      campaignId,
      markedAtUtc: nowIso(),
    });
    return { ok: true, code: 'ORCH_LOCK_KEPT_QUARANTINED', released: false };
  }
  fs.rmSync(lockDir, { recursive: true, force: true });
  return { ok: true, code: 'ORCH_LOCK_RELEASED', released: true };
}

// ---------------------------------------------------------------------------
// Owned stage process with process-group watchdog
// ---------------------------------------------------------------------------

function listOwnedDescendants(rootPid) {
  const childPids = (parentPid) => {
    const result = spawnSync('pgrep', ['-P', String(parentPid)], { encoding: 'utf8' });
    if (result.status === 0) {
      return String(result.stdout || '').trim().split('\n').filter(Boolean).map(Number);
    }
    const ps = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' });
    if (ps.status !== 0) return [];
    return String(ps.stdout || '').split('\n').map((line) => {
      const [pidText, ppidText] = line.trim().split(/\s+/u);
      return { pid: Number(pidText), ppid: Number(ppidText) };
    }).filter((row) => row.ppid === parentPid && Number.isSafeInteger(row.pid)).map((row) => row.pid);
  };
  const direct = childPids(rootPid);
  const all = new Set(direct);
  const queue = [...direct];
  while (queue.length > 0) {
    const parent = queue.shift();
    const children = childPids(parent);
    for (const child of children) {
      if (!all.has(child)) {
        all.add(child);
        queue.push(child);
      }
    }
  }
  return [...all].filter((pid) => Number.isSafeInteger(pid) && pid > 0);
}

function listProcessGroupMembers(pgid) {
  const result = spawnSync('ps', ['-axo', 'pid=,pgid='], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout || '').split('\n').map((line) => {
    const [pidText, pgidText] = line.trim().split(/\s+/u);
    return { pid: Number(pidText), pgid: Number(pgidText) };
  }).filter((row) => row.pgid === pgid && Number.isSafeInteger(row.pid) && row.pid > 0).map((row) => row.pid);
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function runOwnedStageProcess({
  stage,
  command,
  args,
  cwd,
  env = {},
  logDir,
  heartbeatPath,
  campaignId,
  chainId,
  stageTimeoutMs,
  progressTimeoutMs,
  killGraceMs,
  control = null,
}) {
  fs.mkdirSync(logDir, { recursive: true });
  const stdoutPath = path.join(logDir, `${stage.toLowerCase()}.stdout.log`);
  const stderrPath = path.join(logDir, `${stage.toLowerCase()}.stderr.log`);
  const stdoutFd = fs.openSync(stdoutPath, 'a');
  const stderrFd = fs.openSync(stderrPath, 'a');
  const startedAt = Date.now();
  const startedAtUtc = nowIso();
  const capturedOwnedPids = new Set();
  const result = await new Promise((resolve) => {
    let settled = false;
    let watchdogState = 'RUNNING';
    let abortCode = '';
    let abortStartedAt = 0;
    let killSentAt = 0;
    let lastProgressAt = Date.now();
    let lastHeartbeatSequence = 0;
    let heartbeatOffset = 0;
    let watchdogTimer = null;
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const pgid = child.pid;
    if (control) control.currentPgid = pgid;
    const captureOwned = () => {
      if (child.pid) capturedOwnedPids.add(child.pid);
      for (const pid of listOwnedDescendants(child.pid)) capturedOwnedPids.add(pid);
      for (const pid of listProcessGroupMembers(pgid)) capturedOwnedPids.add(pid);
    };
    const signalOwned = (signal) => {
      captureOwned();
      const groupMembers = new Set(listProcessGroupMembers(pgid));
      try { process.kill(-pgid, signal); } catch { /* noop */ }
      if (signal === 'SIGTERM') return;
      for (const pid of capturedOwnedPids) {
        if (groupMembers.has(pid)) continue;
        try { process.kill(pid, signal); } catch { /* noop */ }
      }
    };
    const abortOwnedProcessGroup = (code) => {
      if (abortCode) return;
      abortCode = code;
      abortStartedAt = Date.now();
      watchdogState = 'TERM_SENT';
      signalOwned('SIGTERM');
    };
    if (control) {
      control.abortCurrentStage = (code) => abortOwnedProcessGroup(code);
    }
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      if (watchdogTimer) clearInterval(watchdogTimer);
      try { fs.closeSync(stdoutFd); } catch { /* noop */ }
      try { fs.closeSync(stderrFd); } catch { /* noop */ }
      if (control && control.currentPgid === pgid) control.currentPgid = null;
      if (control && control.abortCurrentStage) delete control.abortCurrentStage;
      resolve({
        stage,
        pid: child.pid,
        pgid,
        startedAtUtc,
        finishedAtUtc: nowIso(),
        durationMs: Date.now() - startedAt,
        stdoutPath,
        stderrPath,
        ...outcome,
      });
    };
    const readHeartbeat = () => {
      if (!heartbeatPath || !fs.existsSync(heartbeatPath)) return;
      const stat = fs.statSync(heartbeatPath);
      if (stat.size <= heartbeatOffset) return;
      const fd = fs.openSync(heartbeatPath, 'r');
      let buffer;
      try {
        buffer = Buffer.alloc(stat.size - heartbeatOffset);
        fs.readSync(fd, buffer, 0, buffer.length, heartbeatOffset);
      } finally {
        fs.closeSync(fd);
      }
      heartbeatOffset = stat.size;
      const lines = buffer.toString('utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        let event = null;
        try { event = JSON.parse(line); } catch { event = null; }
        if (!event || event.schemaVersion !== HEARTBEAT_SCHEMA) continue;
        if (event.campaignId !== campaignId || event.chainId !== chainId || event.stage !== stage) {
          abortOwnedProcessGroup(`ORCH_HEARTBEAT_IDENTITY_MISMATCH:${line.slice(0, 160)}`);
          return;
        }
        const sequence = Number(event.sequence);
        if (!Number.isSafeInteger(sequence) || sequence <= lastHeartbeatSequence) {
          abortOwnedProcessGroup(`ORCH_HEARTBEAT_SEQUENCE_NON_MONOTONIC:${lastHeartbeatSequence}:${sequence}`);
          return;
        }
        lastHeartbeatSequence = sequence;
        lastProgressAt = Date.now();
      }
    };
    watchdogTimer = setInterval(() => {
      captureOwned();
      readHeartbeat();
      if (settled) return;
      const now = Date.now();
      if (watchdogState === 'RUNNING') {
        if (now - startedAt > stageTimeoutMs) {
          abortOwnedProcessGroup(`ORCH_STAGE_TIMEOUT:${stage}:${stageTimeoutMs}`);
          return;
        }
        if (now - lastProgressAt > progressTimeoutMs) {
          abortOwnedProcessGroup(`ORCH_PROGRESS_TIMEOUT:${stage}:${progressTimeoutMs}`);
          return;
        }
      } else if (watchdogState === 'TERM_SENT') {
        if (now - abortStartedAt > killGraceMs) {
          watchdogState = 'KILL_SENT';
          killSentAt = now;
          signalOwned('SIGKILL');
        }
      } else if (watchdogState === 'KILL_SENT') {
        const stillAlive = [...capturedOwnedPids].filter(processAlive);
        if (stillAlive.length > 0 && now - killSentAt > killGraceMs) {
          finish({
            ok: false,
            code: `ORCH_OWNED_PROCESSES_UNKILLABLE:${stillAlive.join(',')}`,
            exitCode: null,
            signal: 'SIGKILL',
            quarantined: true,
            survivingDescendants: stillAlive.filter((pid) => pid !== child.pid),
            survivingOwnedPids: stillAlive,
          });
        }
      }
    }, 250);
    child.stdout.on('data', (chunk) => { fs.writeSync(stdoutFd, chunk); });
    child.stderr.on('data', (chunk) => { fs.writeSync(stderrFd, chunk); });
    child.on('error', (error) => {
      captureOwned();
      finish({ ok: false, code: `ORCH_CHILD_SPAWN_ERROR:${String(error && error.message ? error.message : error).slice(0, 160)}`, exitCode: null, signal: null });
    });
    child.on('exit', (exitCode, signal) => {
      captureOwned();
      if (abortCode) {
        finish({ ok: false, code: abortCode, exitCode, signal });
        return;
      }
      if (exitCode === 0 && signal === null) {
        finish({ ok: true, code: 'ORCH_STAGE_CHILD_EXIT_ZERO', exitCode, signal });
        return;
      }
      finish({ ok: false, code: `ORCH_CHILD_EXIT_NONZERO:${exitCode}:${signal || 'none'}`, exitCode, signal });
    });
  });
  // Completion requires zero owned descendants, otherwise QUARANTINED.
  // PIDs are captured while the stage root is alive: after the root dies,
  // escapees are re-parented to launchd and invisible to parent-only scans.
  const waitForOwnedExit = async () => {
    const deadline = Date.now() + killGraceMs;
    while (Date.now() < deadline) {
      const alive = [...capturedOwnedPids].filter(processAlive);
      if (alive.length === 0) return [];
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return [...capturedOwnedPids].filter(processAlive);
  };
  let survivors = await waitForOwnedExit();
  if (survivors.length > 0) {
    for (const pid of survivors) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* noop */ }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(killGraceMs, 500)));
    survivors = [...capturedOwnedPids].filter(processAlive);
  }
  if (survivors.length > 0) {
    for (const pid of survivors) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* noop */ }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(killGraceMs, 500)));
    survivors = [...capturedOwnedPids].filter(processAlive);
  }
  const survivingDescendants = survivors.filter((pid) => pid !== result.pid);
  result.survivingDescendants = survivingDescendants;
  result.survivingOwnedPids = survivors;
  if (survivors.length > 0) {
    result.ok = false;
    result.code = `ORCH_OWNED_PROCESSES_SURVIVED:${survivors.join(',')}`;
    result.quarantined = true;
  } else if (result.ok === true && capturedOwnedPids.size > 1) {
    result.ok = false;
    result.code = `ORCH_OWNED_DESCENDANTS_TERMINATED_AFTER_CHILD_EXIT:${[...capturedOwnedPids].filter((pid) => pid !== result.pid).join(',')}`;
    result.quarantined = true;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Stage result validation (independent parent-side verifier)
// ---------------------------------------------------------------------------

export function validateStageResult({ stage, resultPath, campaignId, chainId, expectedSha, expectedWordVersion, expectedWordBuild, stageStartedAtMs, requiredOutputKeys = [] }) {
  const failures = [];
  if (!fs.existsSync(resultPath)) return { ok: false, code: `ORCH_STAGE_RESULT_MISSING:${resultPath}` };
  const stat = fs.lstatSync(resultPath);
  if (stat.isSymbolicLink() || !stat.isFile()) return { ok: false, code: `ORCH_STAGE_RESULT_NOT_REGULAR_FILE:${resultPath}` };
  let result = null;
  try { result = JSON.parse(fs.readFileSync(resultPath, 'utf8')); } catch (error) {
    return { ok: false, code: `ORCH_STAGE_RESULT_MALFORMED:${String(error && error.message ? error.message : error).slice(0, 120)}` };
  }
  if (result.schemaVersion !== STAGE_RESULT_SCHEMA) failures.push(`ORCH_STAGE_RESULT_SCHEMA:${result.schemaVersion}`);
  if (result.stage !== stage) failures.push(`ORCH_STAGE_RESULT_STAGE_MISMATCH:${stage}:${result.stage}`);
  if (result.campaignId !== campaignId) failures.push(`ORCH_STAGE_RESULT_CAMPAIGN_MISMATCH:${campaignId}:${result.campaignId}`);
  if (result.chainId !== chainId) failures.push(`ORCH_STAGE_RESULT_CHAIN_MISMATCH:${chainId}:${result.chainId}`);
  if (result.headSha !== expectedSha) failures.push(`ORCH_STAGE_RESULT_SHA_MISMATCH:${expectedSha}:${result.headSha}`);
  if (result.originMainSha && result.originMainSha !== expectedSha) failures.push(`ORCH_STAGE_RESULT_ORIGIN_MISMATCH:${expectedSha}:${result.originMainSha}`);
  if (result.wordVersion !== expectedWordVersion) failures.push(`ORCH_STAGE_RESULT_WORD_VERSION_MISMATCH:${expectedWordVersion}:${result.wordVersion}`);
  if (result.wordBuild !== expectedWordBuild) failures.push(`ORCH_STAGE_RESULT_WORD_BUILD_MISMATCH:${expectedWordBuild}:${result.wordBuild}`);
  const finishedAtMs = Date.parse(result.finishedAtUtc || '');
  if (!Number.isFinite(finishedAtMs)) failures.push('ORCH_STAGE_RESULT_FINISHED_INVALID');
  else if (finishedAtMs < stageStartedAtMs) failures.push(`ORCH_STAGE_RESULT_STALE:${result.finishedAtUtc}`);
  const claimed = result.artifacts && typeof result.artifacts === 'object' ? result.artifacts : {};
  for (const key of requiredOutputKeys) {
    if (!claimed[key] || typeof claimed[key].path !== 'string' || typeof claimed[key].sha256 !== 'string') {
      failures.push(`ORCH_STAGE_RESULT_ARTIFACT_DECL_MISSING:${key}`);
    }
  }
  for (const [key, artifact] of Object.entries(claimed)) {
    if (!artifact || typeof artifact.path !== 'string') continue;
    if (!fs.existsSync(artifact.path)) {
      failures.push(`ORCH_STAGE_RESULT_ARTIFACT_MISSING:${key}:${artifact.path}`);
      continue;
    }
    const actual = sha256File(artifact.path);
    if (actual !== artifact.sha256) failures.push(`ORCH_STAGE_RESULT_HASH_MISMATCH:${key}:${artifact.sha256}:${actual}`);
    if (Number.isSafeInteger(artifact.size) && artifact.size !== fs.statSync(artifact.path).size) {
      failures.push(`ORCH_STAGE_RESULT_SIZE_MISMATCH:${key}`);
    }
  }
  if (failures.length > 0) return { ok: false, code: `ORCH_STAGE_RESULT_INVALID:${failures.join('|')}`, failures };
  return { ok: true, code: 'ORCH_STAGE_RESULT_VERIFIED', result };
}

// ---------------------------------------------------------------------------
// Chain journal and seals
// ---------------------------------------------------------------------------

export function createChainJournal({ campaignRoot, campaignId, chainId, expectedSha }) {
  const journalPath = path.join(campaignRoot, 'ORCHESTRATOR', 'chain-journal.jsonl');
  const state = { journalPath, previousDigest: 'sha256:genesis', sequence: 0 };
  return {
    journalPath,
    append(transition, detail = {}) {
      state.sequence += 1;
      const body = {
        schemaVersion: ORCH_SCHEMA,
        sequence: state.sequence,
        transition,
        campaignId,
        chainId,
        expectedSha,
        atUtc: nowIso(),
        previousDigest: state.previousDigest,
        detail,
      };
      const digest = digestOf(body);
      const record = { ...body, digest };
      appendJsonl(state.journalPath, record);
      state.previousDigest = digest;
      return record;
    },
    get previousDigest() { return state.previousDigest; },
    get sequence() { return state.sequence; },
  };
}

export function publishStageSeal({ campaignRoot, stage, stageResultPath, stageResultSha256, preflight, previousSealDigest }) {
  const seal = {
    schemaVersion: STAGE_SEAL_SCHEMA,
    stage,
    stageResultPath,
    stageResultSha256,
    preflightScriptHashes: preflight.scriptHashes,
    preflightCode: preflight.code,
    previousSealDigest,
    sealedAtUtc: nowIso(),
  };
  const sealDigest = digestOf(seal);
  const publication = writeJsonAtomicVerified(
    path.join(campaignRoot, 'ORCHESTRATOR', `${stage.toLowerCase()}-stage-seal.json`),
    { ...seal, sealDigest },
  );
  return { seal: { ...seal, sealDigest }, sealDigest, sealPath: publication.path };
}

// ---------------------------------------------------------------------------
// Canary stage command construction
// ---------------------------------------------------------------------------

export function buildOrchestratedStageCommand({ stage, campaignRoot, campaignId, chainId, options, inputs = {} }) {
  const runner = options.runnerPath || path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs');
  const stageRoot = path.join(campaignRoot, stage === 'POSITIVE' ? 'MAIN' : stage === 'NEGATIVE' ? 'NEGATIVE' : 'ORCHESTRATOR');
  const args = [
    runner,
    '--orchestrated-stage', stage,
    '--run-dir', stageRoot,
    '--stage-result-path', path.join(campaignRoot, 'ORCHESTRATOR', `${stage.toLowerCase()}-stage-result.json`),
    '--heartbeat-path', path.join(campaignRoot, 'ORCHESTRATOR', `${stage.toLowerCase()}-heartbeat.jsonl`),
    '--campaign-id', campaignId,
    '--chain-id', chainId,
    '--expected-sha', options.expectedSha,
    '--expected-word-version', options.expectedWordVersion,
    '--expected-word-build', options.expectedWordBuild,
  ];
  if (stage === 'POSITIVE') {
    args.push('--scene-count', '21', '--round-count', '5', '--run-prefix', campaignId, '--artifact-root', campaignRoot);
  } else if (stage === 'NEGATIVE') {
    args.push('--negative-campaign-ledger', inputs.ledgerPath || '');
    args.push('--negative-probe-start', '1', '--negative-probe-count', '40');
    args.push('--artifact-root', stageRoot);
  } else if (stage === 'AGGREGATE') {
    args.push('--resume-run-dir', inputs.mainRunDir || '');
    args.push('--negative-aggregate-evidence', inputs.negativeEvidencePath || '');
    args.push('--scene-count', '21', '--round-count', '5', '--run-prefix', campaignId, '--artifact-root', inputs.mainRunDir ? path.dirname(inputs.mainRunDir) : stageRoot);
  }
  return { command: process.execPath, args, stageRoot };
}

// ---------------------------------------------------------------------------
// Single-chain controller
// ---------------------------------------------------------------------------

export async function runSingleChainOrchestrator({
  options,
  stageExecutor = null,
  preflightHook = null,
}) {
  const bypassForTests = process.env.ORCH_TEST_PREFLIGHT_BYPASS === '1';
  const control = { stopping: false, currentPgid: null };
  const journal = { current: null };
  const outcome = {
    schemaVersion: ORCH_SCHEMA,
    ok: false,
    campaignId: options.campaignId,
    chainId: options.chainId,
    state: 'CREATED',
    stageSeals: [],
    chainSeal: null,
    failure: null,
    finishedAtUtc: '',
  };
  const failureDir = path.join(options.campaignRoot, 'FAILURE');
  const recordFailure = (stage, code, extra = {}) => {
    const marker = {
      schemaVersion: ORCH_SCHEMA,
      stage,
      code,
      campaignId: options.campaignId,
      chainId: options.chainId,
      atUtc: nowIso(),
      ...extra,
    };
    const markerPath = path.join(failureDir, 'failure-markers.jsonl');
    fs.mkdirSync(failureDir, { recursive: true });
    fs.appendFileSync(markerPath, JSON.stringify(marker) + '\n', 'utf8');
    outcome.failure = marker;
    outcome.state = code.startsWith('ORCH_OWNED_DESCENDANTS_SURVIVED') || code.startsWith('ORCH_UNKNOWN') ? 'QUARANTINED' : 'FAILED';
    if (journal.current) journal.current.append(outcome.state, { stage, code });
    return marker;
  };
  const preflight = (scope) => {
    if (preflightHook) return preflightHook(scope);
    if (bypassForTests) return { ok: true, code: 'ORCH_PREFLIGHT_BYPASSED_TEST_ONLY', scope, failures: [], checkedAtUtc: nowIso(), scriptHashes: {} };
    return runOrchestratorPreflight({ options, scope });
  };
  // CREATED -> PREFLIGHT_GREEN
  const initialPreflight = preflight('CHAIN_START');
  if (initialPreflight.ok !== true) {
    recordFailure('PREFLIGHT', initialPreflight.code);
    outcome.finishedAtUtc = nowIso();
    return outcome;
  }
  const pathAuthority = assertOrchestratorPathAuthority({
    artifactRoot: options.artifactRoot,
    campaignRoot: options.campaignRoot,
    mustBeAbsent: !options.resume,
  });
  if (pathAuthority.ok !== true) {
    recordFailure('PREFLIGHT', pathAuthority.code);
    outcome.finishedAtUtc = nowIso();
    return outcome;
  }
  for (const subdir of ['MAIN', 'NEGATIVE', 'ORCHESTRATOR', 'FAILURE']) {
    fs.mkdirSync(path.join(options.campaignRoot, subdir), { recursive: true });
  }
  journal.current = createChainJournal({
    campaignRoot: options.campaignRoot,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
  });
  journal.current.append('PREFLIGHT_GREEN', { scriptHashes: initialPreflight.scriptHashes });
  outcome.state = 'PREFLIGHT_GREEN';
  const lock = acquireOrchestratorLock({
    lockRoot: path.join(options.artifactRoot, '.orchestrator-locks'),
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
  });
  if (lock.ok !== true) {
    recordFailure('LOCK', lock.code);
    outcome.finishedAtUtc = nowIso();
    return outcome;
  }
  journal.current.append('LOCKED', { lockDir: lock.lockDir });
  outcome.state = 'LOCKED';
  let lockReleased = false;
  const releaseLock = (quarantined, reason) => {
    if (lockReleased) return;
    const released = releaseOrchestratorLock({
      lockDir: lock.lockDir,
      ownershipToken: lock.ownershipToken,
      campaignId: options.campaignId,
      quarantined,
      quarantineReason: reason,
    });
    lockReleased = released.released === true;
    outcome.lockOutcome = released.code;
  };
  const onSignal = (signalName) => {
    control.stopping = true;
    if (control.abortCurrentStage) {
      control.abortCurrentStage(`ORCH_SIGNAL_${signalName}_STOPPING`);
    } else if (control.currentPgid) {
      try { process.kill(-control.currentPgid, 'SIGTERM'); } catch { /* noop */ }
    }
    recordFailure('SIGNAL', `ORCH_SIGNAL_${signalName}_STOPPING`);
  };
  const stopping = () => control.stopping === true;
  let sigintHandler;
  let sigtermHandler;
  try {
    sigintHandler = () => onSignal('SIGINT');
    sigtermHandler = () => onSignal('SIGTERM');
    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);
    const stageInputs = {};
    let previousSealDigest = 'sha256:genesis';
    for (const stage of STAGES) {
      if (stopping()) break;
      outcome.state = `${stage}_RUNNING`;
      journal.current.append(`${stage}_RUNNING`, {});
      const stagePreflight = preflight(`BEFORE_${stage}`);
      if (stagePreflight.ok !== true) {
        recordFailure(stage, stagePreflight.code);
        break;
      }
      const stageStartedAtMs = Date.now();
      const command = buildOrchestratedStageCommand({
        stage,
        campaignRoot: options.campaignRoot,
        campaignId: options.campaignId,
        chainId: options.chainId,
        options,
        inputs: stageInputs,
      });
      const heartbeatPath = path.join(options.campaignRoot, 'ORCHESTRATOR', `${stage.toLowerCase()}-heartbeat.jsonl`);
      const executor = stageExecutor || runOwnedStageProcess;
      const processResult = await executor({
        stage,
        command: command.command,
        args: command.args,
        cwd: REPO_ROOT,
        logDir: path.join(options.campaignRoot, 'ORCHESTRATOR'),
        heartbeatPath,
        campaignId: options.campaignId,
        chainId: options.chainId,
        stageTimeoutMs: options.stageTimeoutMs,
        progressTimeoutMs: options.progressTimeoutMs,
        killGraceMs: options.killGraceMs,
        control,
      });
      if (processResult.ok !== true) {
        recordFailure(stage, processResult.code, {
          childPid: processResult.pid,
          pgid: processResult.pgid,
          exitCode: processResult.exitCode ?? null,
          signal: processResult.signal ?? null,
          survivingDescendants: processResult.survivingDescendants || [],
        });
        if (processResult.quarantined) {
          releaseLock(true, processResult.code);
          outcome.finishedAtUtc = nowIso();
          return outcome;
        }
        break;
      }
      const resultPath = path.join(options.campaignRoot, 'ORCHESTRATOR', `${stage.toLowerCase()}-stage-result.json`);
      const validation = validateStageResult({
        stage,
        resultPath,
        campaignId: options.campaignId,
        chainId: options.chainId,
        expectedSha: options.expectedSha,
        expectedWordVersion: options.expectedWordVersion,
        expectedWordBuild: options.expectedWordBuild,
        stageStartedAtMs,
        requiredOutputKeys: stage === 'POSITIVE'
          ? ['ledger', 'roundGates']
          : stage === 'NEGATIVE'
            ? ['evidence']
            : ['terminalAggregate'],
      });
      if (validation.ok !== true) {
        recordFailure(stage, validation.code);
        break;
      }
      const stageResult = validation.result;
      const resultSha256 = sha256File(resultPath);
      const seal = publishStageSeal({
        campaignRoot: options.campaignRoot,
        stage,
        stageResultPath: resultPath,
        stageResultSha256: resultSha256,
        preflight: stagePreflight,
        previousSealDigest,
      });
      previousSealDigest = seal.sealDigest;
      outcome.stageSeals.push({ stage, sealDigest: seal.sealDigest, sealPath: seal.sealPath });
      journal.current.append(`${stage}_SEALED`, { sealDigest: seal.sealDigest });
      outcome.state = `${stage}_SEALED`;
      if (stage === 'POSITIVE') {
        stageInputs.ledgerPath = stageResult.stageData?.ledgerPath || '';
        stageInputs.mainRunDir = stageResult.stageData?.mainRunDir || command.stageRoot;
        stageInputs.positiveSealDigest = seal.sealDigest;
      } else if (stage === 'NEGATIVE') {
        stageInputs.negativeEvidencePath = stageResult.stageData?.evidencePath || '';
        stageInputs.negativeSealDigest = seal.sealDigest;
      }
    }
    if (outcome.failure) {
      releaseLock(false, '');
      outcome.finishedAtUtc = nowIso();
      return outcome;
    }
    if (stopping()) {
      releaseLock(false, '');
      outcome.finishedAtUtc = nowIso();
      return outcome;
    }
    if (bypassForTests) {
      journal.current.append('BYPASSED_NO_CHAIN_SEAL', { reason: 'ORCH_TEST_PREFLIGHT_BYPASS' });
      outcome.state = 'BYPASSED_NO_CHAIN_SEAL';
      outcome.ok = true;
      outcome.bypassMarker = 'ORCH_TEST_PREFLIGHT_BYPASS_NO_CHAIN_SEAL';
      releaseLock(false, '');
      outcome.finishedAtUtc = nowIso();
      return outcome;
    }
    // CHAIN_SEAL after final preflight recheck.
    const finalPreflight = preflight('BEFORE_CHAIN_SEAL');
    if (finalPreflight.ok !== true) {
      recordFailure('CHAIN_SEAL', finalPreflight.code);
      releaseLock(false, '');
      outcome.finishedAtUtc = nowIso();
      return outcome;
    }
    const chainSealBody = {
      schemaVersion: ORCH_SCHEMA,
      kind: 'CHAIN_SEAL',
      campaignId: options.campaignId,
      chainId: options.chainId,
      expectedSha: options.expectedSha,
      wordVersion: options.expectedWordVersion,
      wordBuild: options.expectedWordBuild,
      scriptHashes: finalPreflight.scriptHashes,
      stageSeals: outcome.stageSeals.map((entry) => ({ stage: entry.stage, sealDigest: entry.sealDigest })),
      journalTipDigest: journal.current.previousDigest,
      sealedAtUtc: nowIso(),
    };
    const chainSealDigest = digestOf(chainSealBody);
    writeJsonAtomicVerified(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-seal.json'), { ...chainSealBody, chainSealDigest });
    journal.current.append('CHAIN_SEALED', { chainSealDigest });
    outcome.chainSeal = { ...chainSealBody, chainSealDigest };
    outcome.state = 'CHAIN_SEALED';
    outcome.ok = true;
    releaseLock(false, '');
    outcome.finishedAtUtc = nowIso();
    return outcome;
  } finally {
    if (sigintHandler) process.removeListener('SIGINT', sigintHandler);
    if (sigtermHandler) process.removeListener('SIGTERM', sigtermHandler);
    if (!lockReleased && outcome.state !== 'QUARANTINED') {
      releaseLock(false, '');
    }
  }
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main() {
  const options = parseOrchestratorArgs(process.argv.slice(2));
  if (process.env.ORCH_CANARY_RUNNER_PATH) options.runnerPath = process.env.ORCH_CANARY_RUNNER_PATH;
  const outcome = await runSingleChainOrchestrator({ options });
  process.stdout.write(JSON.stringify(outcome, null, 2) + '\n');
  process.exitCode = outcome.ok === true ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(THIS_FILE)) {
  main().catch((error) => {
    process.stderr.write(`ORCH_FATAL:${String(error && error.message ? error.message : error)}\n`);
    process.exitCode = 1;
  });
}
