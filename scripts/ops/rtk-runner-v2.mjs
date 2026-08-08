#!/usr/bin/env node
// RTK Runner V2 — hermetic, crash-resilient, proof-carrying test campaign runner.
//
// DESIGN NOTES (binding the CERT-01 contract):
//
// snapshotDigest: computed over a CANONICAL form of StartSnapshot that EXCLUDES
// all volatile fields (startedAt, lease identity, heartbeat timestamps, machine
// transient data). Rationale: on resume the runner re-derives the same snapshot
// from the manifest + repo state. If startedAt/lease identity were part of the
// digest, every outcome written before the crash would look FOREIGN to the
// resuming runner (different digest), and completed cases would re-run —
// violating the "a completed case is never re-run" core invariant. startedAt
// is STORED on the snapshot for human readability but is NOT a digest input.
//
// Durability: every outcome is one JSONL record appended via a single
// fs.writeSync(fd, line) on an O_APPEND descriptor, then fs.fsyncSync(fd), then
// a readback-verify (re-parse the line) before moving to the next case. A torn
// line can only arise from a kill mid-write; resume detects it (JSON.parse fail
// or digest mismatch) and turns the campaign red with a typed reason.
//
// Lease: MACHINE_LEASE.json fences a single runner per evidence root. Stale
// (dead pid AND expired heartbeat) -> deterministic takeover. Live owner (alive
// pid OR fresh heartbeat) -> MACHINE_LEASE_CONFLICT.
//
// Process-group kill: POSIX spawn detached:true makes the case the leader of a
// new process group; SIGTERM/SIGKILL target -pid (the group). We poll for the
// group leader's death with a bounded deadline BEFORE recording the outcome, so
// tests that read pid files after the run observe a dead tree. Windows uses
// taskkill /T /F.
//
// Only node builtins are imported. No network, no new dependencies.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TERMINAL_BUCKETS = [
  'PASS',
  'EXPECTED_NEGATIVE',
  'PRODUCT_FAIL',
  'INFRA_FAIL',
  'TIMEOUT',
  'CANCELLED',
  'BLOCKED',
  'UNKNOWN',
];
const TERMINAL_BUCKET_SET = new Set(TERMINAL_BUCKETS);
const GREEN_BUCKETS = new Set(['PASS', 'EXPECTED_NEGATIVE']);

const OUTCOMES_NAME = 'CASE_OUTCOMES.jsonl';
const SNAPSHOT_NAME = 'START_SNAPSHOT.json';
const LEASE_NAME = 'MACHINE_LEASE.json';
const RELEASE_NAME = 'LEASE_RELEASED.json';
const SEAL_NAME = 'EVIDENCE_SEAL.json';
const RECON_NAME = 'DENOMINATOR_RECONCILIATION.json';

const ENV_ALLOWLIST = new Set([
  'PATH',
  'HOME',
  'SystemRoot',
  'EVIDENCE_ROOT',
  'CASE_ID',
  'ATTEMPT_ID',
  'TMPDIR',
  'TMP',
  'TEMP',
]);

const SUPPORTED_KINDS = new Set(['node-script']);

// --- pure helpers -----------------------------------------------------------

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return 'sha256:' + sha256Buffer(buf);
  } catch {
    return null;
  }
}

function digestOf(obj) {
  return 'sha256:' + sha256Hex(canonicalJsonStable(obj));
}

function canonicalJsonStable(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJsonStable).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const parts = keys
    .filter((k) => value[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + canonicalJsonStable(value[k]));
  return '{' + parts.join(',') + '}';
}

function nowIso() {
  return new Date().toISOString();
}

function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function atomicWriteJson(filePath, obj) {
  const data = JSON.stringify(obj, null, 2) + '\n';
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp.' + randomToken(4);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
  // readback verify
  const readback = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return readback;
}

function isPidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// --- env scrubbing ----------------------------------------------------------

function buildCaseEnv({ evidenceRoot, caseId, attemptId, workDir }) {
  const perCaseTmp = path.join(workDir, 'tmp');
  fs.mkdirSync(perCaseTmp, { recursive: true });
  const childEnv = {};
  for (const key of ENV_ALLOWLIST) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      childEnv[key] = process.env[key];
    }
  }
  // Runner-established values override inherited ones.
  childEnv.EVIDENCE_ROOT = evidenceRoot;
  childEnv.CASE_ID = caseId;
  childEnv.ATTEMPT_ID = String(attemptId);
  childEnv.TMPDIR = perCaseTmp;
  childEnv.TMP = perCaseTmp;
  childEnv.TEMP = perCaseTmp;
  return childEnv;
}

function envAllowlistDigest() {
  const snapshot = {};
  for (const key of ENV_ALLOWLIST) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      snapshot[key] = typeof process.env[key] === 'string' ? 'present' : 'absent';
    } else {
      snapshot[key] = 'absent';
    }
  }
  return 'sha256:' + sha256Hex(canonicalJsonStable(snapshot));
}

// --- snapshot ---------------------------------------------------------------

function computeRunnerDigest() {
  return sha256File(__filename);
}

function gitInfo() {
  const run = (args) => {
    const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000 });
    if (r.error || r.status !== 0) return null;
    return r.stdout.trim();
  };
  const exactHeadSha = run(['rev-parse', 'HEAD']);
  const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
  let worktreeDirty = null;
  const status = run(['status', '--porcelain']);
  if (status !== null) worktreeDirty = status.length > 0;
  return { exactHeadSha, branch, worktreeDirty };
}

/**
 * Build the StartSnapshot object and its digest.
 * snapshotDigest is computed over a CANONICAL form that EXCLUDES volatile
 * fields (startedAt, lease identity, heartbeat). startedAt is stored on the
 * snapshot but is NOT part of the digest, so a resuming runner re-derives the
 * same digest and its pre-crash outcomes remain bound to the current snapshot.
 */
function buildStartSnapshot({ manifest, manifestDigest, runnerDigest, leaseIdentity }) {
  const git = gitInfo();
  const orderedCaseIds = manifest.cases.map((c) => c.caseId);
  const baseSnapshot = {
    schemaVersion: 1,
    snapshotKind: 'START_SNAPSHOT',
    campaignId: manifest.campaignId,
    exactHeadSha: git.exactHeadSha,
    branch: git.branch,
    worktreeDirty: git.worktreeDirty,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    envAllowlistDigest: envAllowlistDigest(),
    runnerDigest,
    manifestDigest,
    declaredDenominator: manifest.declaredDenominator,
    orderedCaseIds,
    seed: manifest.seed,
    budgets: manifest.budgets,
    softWallMs: manifest.budgets.softWallMs,
    hardWallMs: manifest.budgets.hardWallMs,
    gitAvailable: git.exactHeadSha !== null,
  };
  // snapshotDigest: canonical form WITHOUT startedAt / lease identity / heartbeat.
  const digest = digestOf(baseSnapshot);
  return {
    ...baseSnapshot,
    leaseIdentity,
    startedAt: nowIso(),
    snapshotDigest: digest,
  };
}

// --- lease ------------------------------------------------------------------

function leasePath(evidenceRoot) {
  return path.join(evidenceRoot, LEASE_NAME);
}

function readLease(evidenceRoot) {
  return readJsonIfExists(leasePath(evidenceRoot));
}

function leaseIsStale(lease) {
  if (!lease) return true;
  // A formally released lease is takeable (its owner exited cleanly).
  if (lease.status === 'RELEASED') return true;
  const pid = Number(lease.pid);
  const pidAlive = isPidAlive(pid);
  const heartbeatAt = Date.parse(lease.heartbeatAt);
  const expiryMs = Number(lease.expiryMs) || 0;
  const now = Date.now();
  const heartbeatFresh = Number.isFinite(heartbeatAt) && now - heartbeatAt <= expiryMs;
  // Stale only when pid is dead AND heartbeat is expired.
  return !pidAlive && !heartbeatFresh;
}

/**
 * Synchronously acquire the machine lease for an evidence root.
 * Returns { ok:true, ownershipToken, ... } on acquire/takeover, or
 * { ok:false, code } on conflict. Takeover evidence is recorded on the lease.
 */
export function acquireMachineLease({ evidenceRoot, campaignId, expiryMs = 3000 }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const existing = readLease(evidenceRoot);
  if (existing && !leaseIsStale(existing)) {
    return {
      ok: false,
      code: 'MACHINE_LEASE_CONFLICT',
      reasonCode: 'MACHINE_LEASE_CONFLICT',
      message: 'evidence root is fenced by a live machine lease',
      heldBy: { pid: existing.pid, campaignId: existing.campaignId, heartbeatAt: existing.heartbeatAt },
    };
  }
  const takeoverFrom = existing
    ? {
        campaignId: existing.campaignId,
        ownershipToken: existing.ownershipToken,
        pid: existing.pid,
        heartbeatAt: existing.heartbeatAt,
        reason: 'STALE_LEASE_TAKEOVER',
      }
    : null;
  const ownershipToken = randomToken(16);
  const lease = {
    schemaVersion: 1,
    campaignId,
    ownershipToken,
    pid: process.pid,
    processStartIdentity: `${process.pid}:${process.startTime || Date.now()}`,
    acquiredAt: nowIso(),
    heartbeatAt: nowIso(),
    expiryMs,
    runnerDigest: computeRunnerDigest(),
    status: 'HELD',
  };
  if (takeoverFrom) lease.takeoverFrom = takeoverFrom;
  atomicWriteJson(leasePath(evidenceRoot), lease);
  return { ok: true, ownershipToken, pid: process.pid, expiryMs, campaignId };
}

/**
 * Synchronously release the machine lease. Only the matching ownershipToken may
 * release. Writes a release receipt. Never touches CASE_OUTCOMES.
 */
export function releaseMachineLease({ evidenceRoot, ownershipToken }) {
  const existing = readLease(evidenceRoot);
  if (!existing) {
    return { ok: false, code: 'NO_LEASE', message: 'no machine lease present' };
  }
  if (existing.ownershipToken !== ownershipToken) {
    return { ok: false, code: 'LEASE_TOKEN_MISMATCH', message: 'ownership token does not match the active lease' };
  }
  const receipt = {
    schemaVersion: 1,
    releasedAt: nowIso(),
    ownershipToken,
    campaignId: existing.campaignId,
    pid: existing.pid,
    status: 'RELEASED',
  };
  atomicWriteJson(path.join(evidenceRoot, RELEASE_NAME), receipt);
  // Update lease status to RELEASED (keep record for audit; release is idempotent-ish).
  const updated = { ...existing, status: 'RELEASED', heartbeatAt: existing.heartbeatAt };
  atomicWriteJson(leasePath(evidenceRoot), updated);
  return { ok: true, status: 'RELEASED' };
}

function updateHeartbeat(evidenceRoot, ownershipToken) {
  const existing = readLease(evidenceRoot);
  if (!existing || existing.ownershipToken !== ownershipToken) return;
  existing.heartbeatAt = nowIso();
  atomicWriteJson(leasePath(evidenceRoot), existing);
}

// --- manifest validation ----------------------------------------------------

function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return [{ code: 'MANIFEST_INVALID', message: 'manifest is not an object' }];
  }
  const cases = Array.isArray(manifest.cases) ? manifest.cases : [];
  if (manifest.declaredDenominator !== cases.length) {
    errors.push({
      code: 'DENOMINATOR_MISMATCH',
      message: `declaredDenominator (${manifest.declaredDenominator}) != cases.length (${cases.length})`,
    });
  }
  const caseIds = cases.map((c) => c && c.caseId);
  const seen = new Set();
  for (const id of caseIds) {
    if (seen.has(id)) errors.push({ code: 'DUPLICATE_CASE_ID', message: `duplicate caseId: ${id}` });
    seen.add(id);
  }
  const b = manifest.budgets || {};
  const soft = Number(b.softWallMs);
  const hard = Number(b.hardWallMs);
  if (!(Number.isFinite(soft) && Number.isFinite(hard) && hard > soft)) {
    errors.push({ code: 'WALL_INVALID', message: 'hardWallMs must be > softWallMs' });
  }
  for (const c of cases) {
    if (!c || typeof c.caseId !== 'string' || c.caseId.length === 0) {
      errors.push({ code: 'CASE_INVALID', message: 'case missing caseId' });
    }
    if (!SUPPORTED_KINDS.has(c.kind)) {
      errors.push({ code: 'UNSUPPORTED_KIND', message: `unsupported case kind: ${c.kind}` });
    }
    if (typeof c.path !== 'string' || c.path.length === 0) {
      errors.push({ code: 'CASE_INVALID', message: `case ${c.caseId} missing path` });
    }
  }
  return errors;
}

// --- outcome persistence ----------------------------------------------------

function appendOutcomeAtomic({ evidenceRoot, record }) {
  const filePath = path.join(evidenceRoot, OUTCOMES_NAME);
  const line = JSON.stringify(record) + '\n';
  // Open with 'a' (O_APPEND). The write MUST NOT pass an explicit position,
  // otherwise Node writes at that absolute offset and overrides O_APPEND,
  // silently overwriting the head of the file instead of appending. Passing
  // position=null keeps O_APPEND semantics (write at EOF).
  const fd = fs.openSync(filePath, 'a');
  let written;
  try {
    written = fs.writeSync(fd, line, null, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  // readback verify: reopen read-only and re-parse the last `written` bytes.
  const rfd = fs.openSync(filePath, 'r');
  try {
    const stats = fs.fstatSync(rfd);
    const start = Math.max(0, stats.size - written);
    const tail = Buffer.alloc(written);
    fs.readSync(rfd, tail, 0, written, start);
    JSON.parse(tail.toString('utf8')); // throws on torn write
    return { ok: true, written };
  } finally {
    fs.closeSync(rfd);
  }
}

// --- existing outcomes / resume ---------------------------------------------

function readOutcomeLines(evidenceRoot) {
  const filePath = path.join(evidenceRoot, OUTCOMES_NAME);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.split(/\r?\n/u).filter((l) => l.trim().length > 0);
}

/**
 * Read and validate outcome lines. Returns:
 *   parsed: [{record, raw, lineNo}] for well-formed lines
 *   malformed: [{lineNo, raw, error}]
 */
function readOutcomesValidated(evidenceRoot) {
  const lines = readOutcomeLines(evidenceRoot);
  const parsed = [];
  const malformed = [];
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    try {
      const record = JSON.parse(raw);
      parsed.push({ record, raw, lineNo });
    } catch (error) {
      malformed.push({ lineNo, raw, error: error.message });
    }
  });
  return { parsed, malformed };
}

const REQUIRED_OUTCOME_FIELDS = new Set([
  'schemaVersion',
  'campaignId',
  'caseId',
  'attemptId',
  'snapshotDigest',
  'terminal',
]);

function validateOutcomeSchema(record) {
  if (!record || typeof record !== 'object') return 'NOT_OBJECT';
  for (const field of REQUIRED_OUTCOME_FIELDS) {
    if (!(field in record)) return `MISSING_FIELD:${field}`;
  }
  if (!TERMINAL_BUCKET_SET.has(record.terminal)) return `UNKNOWN_TERMINAL:${record.terminal}`;
  return null;
}

// --- process execution ------------------------------------------------------

function killProcessGroupPosix(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // group may already be gone; fall back to direct kill.
    try { child.kill(signal); } catch { /* noop */ }
  }
}

function killProcessTree(child, signal) {
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { encoding: 'utf8' });
    } catch { /* noop */ }
    return;
  }
  killProcessGroupPosix(child, signal);
}

function waitForGroupDeath(child, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(child.pid)) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  return !isPidAlive(child.pid);
}

/**
 * Run a single case to terminal state. Handles soft/hard walls, process-group
 * kill with death verification, bounded stdout/stderr capture, and spawn-error
 * / signal classification. Returns a terminal outcome record (without attemptId
 * / snapshotDigest, which the caller fills in).
 */
async function runCaseToTerminal({ caseSpec, attemptId, evidenceRoot, workDir, budgets }) {
  const startedAt = nowIso();
  const startMs = Date.now();
  const softWallMs = Number(budgets.softWallMs);
  const hardWallMs = Number(budgets.hardWallMs);
  const maxStdoutBytes = Number(budgets.maxStdoutBytes);
  const maxStderrBytes = Number(budgets.maxStderrBytes);
  const env = buildCaseEnv({ evidenceRoot, caseId: caseSpec.caseId, attemptId, workDir });

  let child;
  let spawnError = null;
  try {
    child = spawn(process.execPath, [caseSpec.path, ...(caseSpec.args || [])], {
      cwd: workDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
  } catch (error) {
    spawnError = error;
  }

  if (spawnError || !child) {
    return buildOutcomeBase({
      caseSpec, attemptId, evidenceRoot, workDir, startedAt, startMs,
      terminal: 'INFRA_FAIL', reasonCode: 'CASE_SPAWN_FAILED',
      exitCode: null, signal: null, stdoutBuf: Buffer.alloc(0), stderrBuf: Buffer.alloc(0),
      stdoutTruncated: false, stderrTruncated: false, timeoutKillEvidence: null,
    });
  }

  const stdoutChunks = [];
  const stderrChunks = [];
  let stdoutLen = 0;
  let stderrLen = 0;
  let stdoutTruncated = false;
  let stderrTruncated = false;

  // IMPORTANT: handlers always run to keep draining the pipe (never block the
  // child on a full pipe), even once the capture budget is exhausted. The
  // truncation flag is set the moment we slice or drop bytes OR the moment the
  // budget is filled while more data is flowing.
  child.stdout.on('data', (chunk) => {
    if (stdoutLen < maxStdoutBytes) {
      const remaining = maxStdoutBytes - stdoutLen;
      if (chunk.length <= remaining) {
        stdoutChunks.push(chunk);
        stdoutLen += chunk.length;
      } else {
        stdoutChunks.push(chunk.subarray(0, remaining));
        stdoutLen = maxStdoutBytes;
        stdoutTruncated = true;
      }
    } else {
      stdoutTruncated = true;
    }
  });
  child.stderr.on('data', (chunk) => {
    if (stderrLen < maxStderrBytes) {
      const remaining = maxStderrBytes - stderrLen;
      if (chunk.length <= remaining) {
        stderrChunks.push(chunk);
        stderrLen += chunk.length;
      } else {
        stderrChunks.push(chunk.subarray(0, remaining));
        stderrLen = maxStderrBytes;
        stderrTruncated = true;
      }
    } else {
      stderrTruncated = true;
    }
  });
  // On stream end, if we stopped exactly at the budget cap the child produced
  // at least `max` bytes. For capture-bounded runners that is the truncation
  // boundary: mark truncated so we never under-report a capped capture. (If a
  // child produced exactly `max` bytes and stopped, the digest is still exact
  // and the truncation flag is conservatively true.)
  child.stdout.on('end', () => { if (stdoutLen >= maxStdoutBytes) stdoutTruncated = true; });
  child.stderr.on('end', () => { if (stderrLen >= maxStderrBytes) stderrTruncated = true; });

  // settled: { code, signal } | { error }
  let settled = null;
  // Wall-tracking: a timeout is any death caused by a runner-delivered wall
  // signal (soft SIGTERM or hard SIGKILL). A self-inflicted or external signal
  // (not delivered by us) is CASE_SIGNALLED/INFRA_FAIL, not a timeout.
  let softFired = false;
  let hardFired = false;
  let softFireAt = null;
  let hardFireAt = null;

  const exitPromise = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      settled = { code, signal };
      resolve();
    });
    child.on('error', (error) => {
      settled = { error };
      resolve();
    });
  });

  const softTimer = setTimeout(() => {
    if (!settled) {
      softFired = true;
      softFireAt = Date.now();
      killProcessTree(child, 'SIGTERM');
    }
  }, softWallMs);
  const hardTimer = setTimeout(() => {
    if (!settled) {
      hardFired = true;
      hardFireAt = Date.now();
      killProcessTree(child, 'SIGKILL');
    }
  }, hardWallMs);

  // Await exit with a generous hard deadline (hard wall + grace + slack).
  const hardDeadline = hardWallMs + 5000;
  await Promise.race([
    exitPromise,
    new Promise((resolve) => setTimeout(resolve, hardDeadline)),
  ]);
  clearTimeout(softTimer);
  clearTimeout(hardTimer);

  const wallTriggered = softFired || hardFired;
  let timeoutKillEvidence = null;

  // If a wall fired, confirm the group leader is dead before recording, so any
  // reader of pid markers after this point observes a dead process tree.
  if (wallTriggered) {
    const dead = waitForGroupDeath(child, 4000);
    if (!settled) {
      // wait once more for the exit callback to settle after kill.
      await Promise.race([
        exitPromise,
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    }
    timeoutKillEvidence = {
      kind: 'PROCESS_GROUP_HARD_KILL',
      leaderPid: child.pid,
      killedPids: [child.pid],
      signalUsed: hardFired ? 'SIGKILL' : 'SIGTERM',
      softSignalSent: softFired ? 'SIGTERM' : null,
      softFiredAt: softFireAt,
      hardFiredAt: hardFireAt,
      leaderDeadConfirmed: dead,
    };
  }

  const finishedAt = nowIso();
  const durationMs = Date.now() - startMs;
  const stdoutBuf = Buffer.concat(stdoutChunks);
  const stderrBuf = Buffer.concat(stderrChunks);

  let terminal;
  let reasonCode = null;
  let exitCode = null;
  let signal = null;

  if (settled && settled.error) {
    terminal = 'INFRA_FAIL';
    reasonCode = settled.error.code === 'ENOENT' ? 'CASE_MODULE_NOT_FOUND' : 'CASE_SPAWN_FAILED';
  } else if (wallTriggered) {
    // Any death caused by a runner wall (soft SIGTERM or hard SIGKILL) is a
    // terminal TIMEOUT for this campaign.
    terminal = 'TIMEOUT';
    reasonCode = hardFired ? 'HARD_WALL_EXCEEDED' : 'SOFT_WALL_EXCEEDED';
    exitCode = settled ? settled.code : null;
    signal = settled ? settled.signal : null;
  } else if (settled) {
    exitCode = settled.code;
    signal = settled.signal;
    if (signal && settled.code === null) {
      // Killed by a signal the runner did NOT deliver -> infra.
      terminal = 'INFRA_FAIL';
      reasonCode = 'CASE_SIGNALLED';
    } else {
      terminal = classifyExit(caseSpec.expect, settled.code);
      if (terminal === 'PRODUCT_FAIL' && settled.code !== 0) reasonCode = 'NONZERO_EXIT';
    }
  } else {
    terminal = 'UNKNOWN';
    reasonCode = 'NO_SETTLED_STATE';
  }

  return buildOutcomeBase({
    caseSpec, attemptId, evidenceRoot, workDir, startedAt, startMs, finishedAt, durationMs,
    terminal, reasonCode, exitCode, signal,
    stdoutBuf, stderrBuf, stdoutTruncated, stderrTruncated, timeoutKillEvidence,
  });
}

function classifyExit(expect, code) {
  if (code === 0) {
    if (expect === 'PASS') return 'PASS';
    // expected a non-pass but got 0
    return 'PRODUCT_FAIL';
  }
  if (expect && typeof expect === 'object' && Object.prototype.hasOwnProperty.call(expect, 'negativeExitCode')) {
    if (Number(expect.negativeExitCode) === code) return 'EXPECTED_NEGATIVE';
    return 'PRODUCT_FAIL';
  }
  // expect === 'PASS' (or any) with nonzero exit
  return 'PRODUCT_FAIL';
}

function buildOutcomeBase({
  caseSpec, attemptId, evidenceRoot, workDir, startedAt, startMs,
  finishedAt = nowIso(), durationMs = Date.now() - startMs,
  terminal, reasonCode, exitCode, signal,
  stdoutBuf, stderrBuf, stdoutTruncated, stderrTruncated, timeoutKillEvidence,
}) {
  return {
    schemaVersion: 1,
    campaignId: null, // filled by caller
    caseId: caseSpec.caseId,
    attemptId,
    snapshotDigest: null, // filled by caller
    startedAt,
    finishedAt,
    durationMs,
    terminal,
    exitCode,
    signal,
    reasonCode,
    stdoutDigest: 'sha256:' + sha256Buffer(stdoutBuf),
    stderrDigest: 'sha256:' + sha256Buffer(stderrBuf),
    stdoutTruncated,
    stderrTruncated,
    effectiveCwd: workDir,
    timeoutKillEvidence,
  };
}

// --- reconciliation & seal --------------------------------------------------

function buildReconciliation({ manifest, snapshotDigest, outcomes }) {
  const declared = manifest.cases.map((c) => c.caseId);
  const declaredSet = new Set(declared);
  const terminalByCase = new Map(); // caseId -> [records]
  const duplicates = [];
  const foreignSnapshotOutcomes = [];
  const malformedOutcomes = [];
  const nestedRed = [];

  for (const o of outcomes) {
    if (o.malformed) {
      malformedOutcomes.push(o);
      continue;
    }
    const rec = o.record;
    if (rec.snapshotDigest !== snapshotDigest) {
      foreignSnapshotOutcomes.push({ caseId: rec.caseId, lineNo: o.lineNo, snapshotDigest: rec.snapshotDigest });
      continue;
    }
    if (!declaredSet.has(rec.caseId)) {
      foreignSnapshotOutcomes.push({ caseId: rec.caseId, lineNo: o.lineNo, reason: 'UNDECLARED_CASE' });
      continue;
    }
    const list = terminalByCase.get(rec.caseId) || [];
    list.push(rec);
    terminalByCase.set(rec.caseId, list);
  }

  const notRun = [];
  const unknown = [];
  const histogram = {};
  for (const bucket of TERMINAL_BUCKETS) histogram[bucket] = 0;

  for (const caseId of declared) {
    const list = terminalByCase.get(caseId) || [];
    if (list.length === 0) {
      notRun.push(caseId);
      continue;
    }
    if (list.length > 1) {
      duplicates.push({ caseId, count: list.length, terminals: list.map((r) => r.terminal) });
    }
    const last = list[list.length - 1];
    histogram[last.terminal] = (histogram[last.terminal] || 0) + 1;
    if (!GREEN_BUCKETS.has(last.terminal)) {
      nestedRed.push(caseId);
    }
    if (last.terminal === 'UNKNOWN') unknown.push(caseId);
  }

  const executedTerminal = declared.filter((id) => (terminalByCase.get(id) || []).length > 0).length;

  // outcome digests ordered by declared caseId (canonical concat of raw lines).
  const orderedDigests = [];
  for (const caseId of declared) {
    const list = terminalByCase.get(caseId) || [];
    if (list.length > 0) {
      const last = list[list.length - 1];
      orderedDigests.push(digestOf(last));
    }
  }
  const outcomeDigestsRoot = 'sha256:' + sha256Hex(orderedDigests.join('\n'));

  return {
    schemaVersion: 1,
    snapshotDigest,
    declared,
    declaredDenominator: manifest.declaredDenominator,
    executedTerminal,
    notRun,
    unknown,
    duplicates,
    foreignSnapshotOutcomes,
    malformedOutcomes,
    nestedRed,
    histogram,
    outcomeDigestsRoot,
    sealedAt: null,
  };
}

function campaignIsGreen(recon) {
  return (
    recon.malformedOutcomes.length === 0 &&
    recon.duplicates.length === 0 &&
    recon.foreignSnapshotOutcomes.length === 0 &&
    recon.notRun.length === 0 &&
    recon.unknown.length === 0 &&
    recon.nestedRed.length === 0 &&
    recon.executedTerminal === recon.declaredDenominator
  );
}

function writeSeal({ evidenceRoot, snapshotDigest, recon, leaseReleaseProof }) {
  const seal = {
    schemaVersion: 1,
    sealKind: 'EVIDENCE_SEAL',
    snapshotDigest,
    campaignId: recon.campaignId,
    outcomeDigestsRoot: recon.outcomeDigestsRoot,
    reconciliationDigest: digestOf(recon),
    leaseReleaseProof,
    sealedAt: nowIso(),
    histogram: recon.histogram,
  };
  atomicWriteJson(path.join(evidenceRoot, SEAL_NAME), seal);
  return seal;
}

// A seal attests a GREEN reconciliation. When the campaign is no longer green
// (red cell, malformed line, duplicate, not-run, etc.), any seal left from a
// prior green state is stale and must be removed so readers cannot mistake a
// superseded/edited evidence set for sealed.
function pruneStaleSeal(evidenceRoot) {
  const sealPath = path.join(evidenceRoot, SEAL_NAME);
  try {
    if (fs.existsSync(sealPath)) fs.unlinkSync(sealPath);
  } catch {
    /* best-effort; a missing seal is the desired state */
  }
}

// --- campaign orchestration -------------------------------------------------

function loadManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  const manifestDigest = 'sha256:' + sha256Buffer(Buffer.from(raw, 'utf8'));
  return { manifest, manifestDigest };
}

function typedExit(code, reasonCode, message, extra = {}) {
  const payload = { ok: false, reasonCode, message, ...extra };
  process.stderr.write(`${reasonCode}: ${message}\n${JSON.stringify(payload)}\n`);
  process.exit(code);
}

/**
 * Refuse a campaign BEFORE the lease is acquired. This path MUST be strictly
 * read-only with respect to the evidence root: a second runner that is merely
 * fenced (validation failure, root-not-empty, lease-conflict) must NEVER
 * write/unlink/rename inside evidenceRoot, otherwise it could delete another
 * campaign's EVIDENCE_SEAL.json or overwrite its reconciliation. Only typed
 * stderr/stdout + a nonzero exit code are produced here; no fs mutations.
 */
function refusePreLease(reasonCode, message, extra = {}) {
  process.stdout.write(`CAMPAIGN_RED: ${reasonCode} ${message}\n`);
  return { ok: false, exitCode: 1, reasonCode, message, ...extra };
}

export async function runCampaign({ manifestPath, evidenceRoot, resume = false }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });

  const { manifest, manifestDigest } = loadManifest(manifestPath);
  const validationErrors = validateManifest(manifest);
  if (validationErrors.length > 0) {
    const first = validationErrors[0];
    return refusePreLease(first.code, first.message, { validationErrors, manifestProduced: false });
  }

  // Fresh-run guard: refuse if evidence root already has a snapshot and no resume.
  const snapshotPath = path.join(evidenceRoot, SNAPSHOT_NAME);
  if (!resume && fs.existsSync(snapshotPath)) {
    return refusePreLease('EVIDENCE_ROOT_NOT_EMPTY',
      'evidence root already contains a START_SNAPSHOT; use --resume to continue', { manifestProduced: false });
  }

  // Lease: acquire/takeover synchronously.
  const leaseResult = acquireMachineLease({ evidenceRoot, campaignId: manifest.campaignId });
  if (!leaseResult.ok) {
    return refusePreLease(leaseResult.code,
      leaseResult.message || 'could not acquire machine lease', { leaseConflict: leaseResult });
  }
  const ownershipToken = leaseResult.ownershipToken;

  // Heartbeat loop.
  const heartbeatTimer = setInterval(() => updateHeartbeat(evidenceRoot, ownershipToken), 1000);

  try {
    let snapshot;
    let snapshotDigest;
    if (resume) {
      const existing = readJsonIfExists(snapshotPath);
      if (!existing) {
        return finishRed(evidenceRoot, manifest, 'NO_SNAPSHOT_TO_RESUME',
          'no START_SNAPSHOT.json present to resume from', { leaseOwnershipToken: ownershipToken });
      }
      // Drift detection (spec §35.1): rebuild the snapshot from the CURRENT
      // manifest + git state via buildStartSnapshot (its digest excludes
      // volatile fields: startedAt, lease identity, heartbeat). If the rebuilt
      // digest differs from the stored one, the manifest or repo state drifted
      // since the snapshot was taken and the run is INVALIDATED, not PASS.
      const runnerDigest = computeRunnerDigest();
      const rebuilt = buildStartSnapshot({
        manifest, manifestDigest, runnerDigest,
        leaseIdentity: { ownershipToken, pid: process.pid },
      });
      if (rebuilt.snapshotDigest !== existing.snapshotDigest) {
        const result = finishRed(evidenceRoot, manifest, 'SNAPSHOT_DRIFT_INVALIDATED',
          'snapshot digest drift detected: manifest or repo state changed since the snapshot was taken',
          { storedDigest: existing.snapshotDigest, rebuiltDigest: rebuilt.snapshotDigest, leaseOwnershipToken: ownershipToken });
        // We hold the lease, so we may annotate the reconciliation with the
        // refusal reason (finishRed already pruned the stale seal and rebuilt
        // the reconciliation from the durable outcomes).
        const recon = readJsonIfExists(path.join(evidenceRoot, RECON_NAME));
        if (recon) {
          recon.refusalReason = 'SNAPSHOT_DRIFT_INVALIDATED';
          atomicWriteJson(path.join(evidenceRoot, RECON_NAME), recon);
        }
        return result;
      }
      snapshot = existing;
      snapshotDigest = existing.snapshotDigest;
    } else {
      const runnerDigest = computeRunnerDigest();
      snapshot = buildStartSnapshot({
        manifest, manifestDigest, runnerDigest,
        leaseIdentity: { ownershipToken, pid: process.pid },
      });
      snapshotDigest = snapshot.snapshotDigest;
      atomicWriteJson(snapshotPath, snapshot);
    }

    // Build the set of already-terminal caseIds for the CURRENT snapshot.
    const { parsed, malformed } = readOutcomesValidated(evidenceRoot);
    // Split malformed-by-JSON from schema-malformed.
    const schemaMalformed = [];
    const goodParsed = [];
    for (const p of parsed) {
      const schemaError = validateOutcomeSchema(p.record);
      if (schemaError) {
        schemaMalformed.push({ lineNo: p.lineNo, raw: p.raw, error: schemaError });
      } else {
        goodParsed.push(p);
      }
    }
    const allMalformed = [...malformed, ...schemaMalformed];

    const terminalForSnapshot = new Set();
    const duplicatesForSnapshot = new Map(); // caseId -> count (current snapshot, valid schema)
    for (const p of goodParsed) {
      const rec = p.record;
      if (rec.snapshotDigest !== snapshotDigest) continue;
      if (!TERMINAL_BUCKET_SET.has(rec.terminal)) continue;
      const prev = duplicatesForSnapshot.get(rec.caseId) || 0;
      duplicatesForSnapshot.set(rec.caseId, prev + 1);
      if (prev === 0) terminalForSnapshot.add(rec.caseId);
    }

    // If malformed lines exist, we cannot safely proceed: campaign red.
    if (allMalformed.length > 0) {
      writeReconciliationFinal(evidenceRoot, manifest, snapshotDigest, leaseReleaseProofNull());
      return finishRed(evidenceRoot, manifest, 'MALFORMED_OUTCOME',
        `detected ${allMalformed.length} malformed/torn outcome line(s)`, {
          malformedCount: allMalformed.length, firstMalformed: allMalformed[0],
        });
    }

    // Duplicate detection (current snapshot, valid schema) -> red without rerun.
    let hasDuplicates = false;
    for (const [, count] of duplicatesForSnapshot) {
      if (count > 1) { hasDuplicates = true; break; }
    }
    if (hasDuplicates) {
      writeReconciliationFinal(evidenceRoot, manifest, snapshotDigest, leaseReleaseProofNull());
      return finishRed(evidenceRoot, manifest, 'DUPLICATE_CONFLICT',
        'duplicate conflicting outcomes detected for the current snapshot', { snapshotDigest });
    }

    // Execute remaining cases.
    for (const caseSpec of manifest.cases) {
      if (terminalForSnapshot.has(caseSpec.caseId)) continue; // never re-run a closed case
      const workDir = path.join(evidenceRoot, 'work', caseSpec.caseId);
      fs.mkdirSync(workDir, { recursive: true });
      const outcome = await runCaseToTerminal({
        caseSpec, attemptId: 1, evidenceRoot, workDir, budgets: manifest.budgets,
      });
      outcome.campaignId = manifest.campaignId;
      outcome.snapshotDigest = snapshotDigest;
      const { ok } = appendOutcomeAtomic({ evidenceRoot, record: outcome });
      if (!ok) {
        writeReconciliationFinal(evidenceRoot, manifest, snapshotDigest, leaseReleaseProofNull());
        return finishRed(evidenceRoot, manifest, 'OUTCOME_WRITE_FAILED',
          `failed to durably append outcome for case ${caseSpec.caseId}`, { snapshotDigest });
      }
      terminalForSnapshot.add(caseSpec.caseId);
    }

    // Re-read all outcomes for reconciliation (includes pre-existing + new).
    writeReconciliationFinal(evidenceRoot, manifest, snapshotDigest, leaseReleaseProofNull());
    const recon = readJsonIfExists(path.join(evidenceRoot, RECON_NAME));
    const green = campaignIsGreen(recon);

    let leaseReleaseProof = null;
    const release = releaseMachineLease({ evidenceRoot, ownershipToken });
    leaseReleaseProof = { released: release.ok, code: release.code || 'RELEASED', at: nowIso() };

    if (green) {
      const seal = writeSeal({ evidenceRoot, snapshotDigest, recon, leaseReleaseProof });
      recon.sealedAt = seal.sealedAt;
      atomicWriteJson(path.join(evidenceRoot, RECON_NAME), recon);
      process.stdout.write(`CAMPAIGN_GREEN: ${manifest.campaignId} sealDigest=${seal.reconciliationDigest}\n`);
      return { ok: true, exitCode: 0, green: true, seal };
    }
    process.stdout.write(`CAMPAIGN_RED: ${manifest.campaignId} nestedRed=${recon.nestedRed.length} notRun=${recon.notRun.length}\n`);
    pruneStaleSeal(evidenceRoot);
    return { ok: false, exitCode: 1, green: false, recon };
  } finally {
    clearInterval(heartbeatTimer);
  }
}

function leaseReleaseProofNull() {
  return null;
}

function writeReconciliationFinal(evidenceRoot, manifest, snapshotDigest, leaseReleaseProof) {
  const { parsed, malformed } = readOutcomesValidated(evidenceRoot);
  const goodParsed = [];
  const schemaMalformed = [];
  for (const p of parsed) {
    const schemaError = validateOutcomeSchema(p.record);
    if (schemaError) schemaMalformed.push({ lineNo: p.lineNo, raw: p.raw, error: schemaError });
    else goodParsed.push(p);
  }
  const allMalformed = [...malformed, ...schemaMalformed];
  const outcomes = [
    ...allMalformed.map((m) => ({ malformed: true, ...m })),
    ...goodParsed,
  ];
  const recon = buildReconciliation({ manifest, snapshotDigest, outcomes });
  recon.leaseReleaseProof = leaseReleaseProof;
  atomicWriteJson(path.join(evidenceRoot, RECON_NAME), recon);
}

function finishRed(evidenceRoot, manifest, reasonCode, message, extra = {}) {
  // A red/non-green campaign must never carry a seal: prune any stale seal.
  pruneStaleSeal(evidenceRoot);
  // Ensure a reconciliation exists where possible.
  if (fs.existsSync(path.join(evidenceRoot, SNAPSHOT_NAME))) {
    const snap = readJsonIfExists(path.join(evidenceRoot, SNAPSHOT_NAME));
    if (snap) writeReconciliationFinal(evidenceRoot, manifest, snap.snapshotDigest, null);
  } else if (manifest) {
    // No snapshot yet (validation/refusal pre-start): still write a minimal recon.
    const recon = {
      schemaVersion: 1,
      snapshotDigest: null,
      declared: (manifest.cases || []).map((c) => c.caseId),
      declaredDenominator: manifest.declaredDenominator,
      executedTerminal: 0,
      notRun: (manifest.cases || []).map((c) => c.caseId),
      unknown: [],
      duplicates: [],
      foreignSnapshotOutcomes: [],
      malformedOutcomes: [],
      nestedRed: [],
      histogram: {},
      outcomeDigestsRoot: 'sha256:' + '0'.repeat(64),
      sealedAt: null,
      refusalReason: reasonCode,
    };
    atomicWriteJson(path.join(evidenceRoot, RECON_NAME), recon);
  }
  process.stdout.write(`CAMPAIGN_RED: ${reasonCode} ${message}\n`);
  return { ok: false, exitCode: 1, reasonCode, message, ...extra };
}

// --- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--manifest') { args.manifest = argv[++i]; continue; }
    if (a === '--evidence-root') { args.evidenceRoot = argv[++i]; continue; }
    if (a === '--resume') { args.resume = true; continue; }
    if (a === '--help' || a === '-h') { args.help = true; continue; }
    args._.push(a);
  }
  return args;
}

function printHelp() {
  process.stdout.write(
    'Usage: node scripts/ops/rtk-runner-v2.mjs run --manifest <path> --evidence-root <dir> [--resume]\n'
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const subcommand = args._[0];
  if (subcommand !== 'run' || args.help) {
    printHelp();
    process.exit(args.help ? 0 : 2);
  }
  if (!args.manifest || !args.evidenceRoot) {
    printHelp();
    process.exit(2);
  }
  const result = await runCampaign({
    manifestPath: path.resolve(args.manifest),
    evidenceRoot: path.resolve(args.evidenceRoot),
    resume: Boolean(args.resume),
  });
  process.exit(typeof result.exitCode === 'number' ? result.exitCode : 1);
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === __filename;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`RUNNER_FATAL: ${error && error.stack ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}

export {
  validateManifest,
  buildReconciliation,
  campaignIsGreen,
  TERMINAL_BUCKETS,
};
