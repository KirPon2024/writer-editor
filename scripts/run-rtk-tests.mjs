#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'RTK_TEST_GRAPH_CATALOG_V1.json');
const CONTRACT_DIR = path.join(REPO_ROOT, 'test', 'contracts');
export const RTK_OWNED_TMPDIR_PREFIX = 'rtk-owned-tmpdir-';
export const RTK_RUNNER_DEFAULTS = Object.freeze({
  wallTimeoutMs: 30 * 60 * 1000,
  noProgressTimeoutMs: 5 * 60 * 1000,
  heartbeatIntervalMs: 15 * 1000,
  termGraceMs: 5000,
  killGraceMs: 5000,
  retainedOutputBytes: 32 * 1024 * 1024,
});
const RTK_PROCESS_PROBE_TIMEOUT_MS = 1000;
const RTK_PROCESS_PROBE_MAX_BUFFER_BYTES = 512 * 1024;

function defaultMonotonicNow() {
  return performance.now();
}

function createMonotonicReader(source = defaultMonotonicNow) {
  let initialized = false;
  let last = 0;
  return () => {
    let candidate;
    try {
      candidate = Number(source());
    } catch {
      candidate = Number.NaN;
    }
    if (!Number.isFinite(candidate)) candidate = initialized ? last : defaultMonotonicNow();
    candidate = Math.max(0, candidate);
    if (!initialized || candidate > last) last = candidate;
    initialized = true;
    return last;
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function listMaintainedRtkContracts() {
  return fs.readdirSync(CONTRACT_DIR)
    .filter((name) => /^rtk-.*\.contract\.test\.js$/u.test(name))
    .sort();
}

function diffSets(expected, actual) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return {
    missing: expected.filter((item) => !actualSet.has(item)),
    extra: actual.filter((item) => !expectedSet.has(item)),
  };
}

function buildPlan() {
  const catalog = readJson(CATALOG_PATH);
  const expected = uniqueSorted(catalog.contractBasenames || []);
  const actual = listMaintainedRtkContracts();
  const diff = diffSets(expected, actual);
  return {
    catalog,
    expected,
    actual,
    diff,
    testFiles: expected.map((name) => path.join('test', 'contracts', name)),
  };
}

function printPlan(plan) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: plan.catalog.schemaVersion,
    graphId: plan.catalog.graphId,
    contractFileCount: plan.expected.length,
    command: 'node scripts/run-rtk-tests.mjs',
    testFiles: plan.testFiles,
    missing: plan.diff.missing,
    extra: plan.diff.extra,
  }, null, 2)}\n`);
}

function realpathIfExists(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

function validateOwnedTmpRoot(rootPath, parentPath = os.tmpdir()) {
  const parentReal = fs.realpathSync(parentPath);
  const rootStat = fs.lstatSync(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`RTK_TMPDIR_ROOT_NOT_PLAIN_DIRECTORY:${rootPath}`);
  }
  const rootReal = fs.realpathSync(rootPath);
  if (path.dirname(rootReal) !== parentReal) {
    throw new Error(`RTK_TMPDIR_ROOT_NOT_DIRECT_CHILD:${rootReal}`);
  }
  if (!path.basename(rootReal).startsWith(RTK_OWNED_TMPDIR_PREFIX)) {
    throw new Error(`RTK_TMPDIR_ROOT_PREFIX_MISMATCH:${rootReal}`);
  }
  return { parentReal, rootReal };
}

export function createOwnedTmpLease({ tmpParent = os.tmpdir() } = {}) {
  const parentReal = fs.realpathSync(tmpParent);
  const entropy = `${process.pid}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const root = fs.mkdtempSync(path.join(parentReal, `${RTK_OWNED_TMPDIR_PREFIX}${entropy}-`));
  const validated = validateOwnedTmpRoot(root, parentReal);
  return {
    parent: parentReal,
    root: validated.rootReal,
  };
}

export function removeNoFollow(targetPath) {
  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      removeNoFollow(path.join(targetPath, entry.name));
    }
    fs.rmdirSync(targetPath);
    return;
  }
  fs.unlinkSync(targetPath);
}

function summarizeExistingRoot(rootPath, limit = 20) {
  const entries = [];
  const errors = [];
  let count = 0;
  let bytes = 0;
  const visit = (targetPath) => {
    let stat;
    try {
      stat = fs.lstatSync(targetPath);
    } catch (error) {
      errors.push({
        op: 'lstat',
        path: targetPath,
        code: error?.code || '',
        message: error?.message || String(error),
      });
      return;
    }
    count += 1;
    bytes += stat.size;
    if (entries.length < limit) entries.push(targetPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return;
    let children;
    try {
      children = fs.readdirSync(targetPath, { withFileTypes: true });
    } catch (error) {
      errors.push({
        op: 'readdir',
        path: targetPath,
        code: error?.code || '',
        message: error?.message || String(error),
      });
      return;
    }
    for (const entry of children) {
      visit(path.join(targetPath, entry.name));
    }
  };
  visit(rootPath);
  return { count, bytes, entries, errors };
}

export function cleanupOwnedTmpLease(lease, { removeImpl = removeNoFollow } = {}) {
  const failures = [];
  if (!lease || typeof lease.root !== 'string' || typeof lease.parent !== 'string') {
    return { ok: false, failures: ['RTK_TMPDIR_LEASE_INVALID'], residue: null };
  }
  let rootReal = null;
  try {
    rootReal = validateOwnedTmpRoot(lease.root, lease.parent).rootReal;
  } catch (error) {
    const missing = error?.code === 'ENOENT';
    if (!missing) failures.push(error.message || String(error));
  }
  if (rootReal) {
    try {
      removeImpl(rootReal);
    } catch (error) {
      failures.push(`RTK_TMPDIR_CLEANUP_REMOVE_FAILED:${error?.code || error?.message || String(error)}`);
    }
  }
  const residuePath = rootReal || realpathIfExists(lease.root) || lease.root;
  const exists = fs.existsSync(residuePath);
  const residue = exists ? summarizeExistingRoot(residuePath) : { count: 0, bytes: 0, entries: [], errors: [] };
  if (exists) failures.push(`RTK_TMPDIR_RESIDUE_REMAINS:${residuePath}`);
  for (const error of residue.errors || []) {
    failures.push(`RTK_TMPDIR_RESIDUE_SUMMARY_${error.op.toUpperCase()}_FAILED:${error.code || 'UNKNOWN'}:${error.path}`);
  }
  return {
    ok: failures.length === 0,
    failures,
    root: residuePath,
    residue,
  };
}

function parseTapSummaryNumber(lines, label) {
  const matches = lines
    .map((line) => line.match(new RegExp(`^# ${label} (\\d+)$`, 'u')))
    .filter(Boolean);
  if (matches.length === 0) return null;
  return Number.parseInt(matches.at(-1)[1], 10);
}

export function evaluateMandatoryTapOutput(stdout = '', stderr = '', { expectedFileCount = 0 } = {}) {
  const combined = `${stdout || ''}\n${stderr || ''}`;
  const lines = combined.split(/\r?\n/u);
  const failures = [];
  const statusRecords = [];
  for (const line of lines) {
    const match = line.match(/^(not ok|ok) (\d+) - (.*?)(?: # (SKIP|TODO)(?: .*)?)?$/u);
    if (!match) continue;
    statusRecords.push({
      ok: match[1] === 'ok',
      ordinal: Number.parseInt(match[2], 10),
      name: match[3],
      directive: match[4] || '',
    });
  }
  const summary = {
    tests: parseTapSummaryNumber(lines, 'tests'),
    pass: parseTapSummaryNumber(lines, 'pass'),
    fail: parseTapSummaryNumber(lines, 'fail'),
    cancelled: parseTapSummaryNumber(lines, 'cancelled'),
    skipped: parseTapSummaryNumber(lines, 'skipped'),
    todo: parseTapSummaryNumber(lines, 'todo'),
  };
  if (!lines.some((line) => line === 'TAP version 13')) failures.push('RTK_TAP_HEADER_MISSING');
  for (const [key, value] of Object.entries(summary)) {
    if (!Number.isInteger(value)) failures.push(`RTK_TAP_SUMMARY_${key.toUpperCase()}_MISSING`);
  }
  if (summary.tests === 0) failures.push('RTK_TAP_ZERO_TESTS');
  if (Number.isInteger(summary.tests) && statusRecords.length !== summary.tests) {
    failures.push(`RTK_TAP_TEST_RECORD_COUNT_MISMATCH:${statusRecords.length}:${summary.tests}`);
  }
  if (summary.fail !== 0) failures.push(`RTK_TAP_FAIL_COUNT_NONZERO:${summary.fail}`);
  if (summary.cancelled !== 0) failures.push(`RTK_TAP_CANCELLED_COUNT_NONZERO:${summary.cancelled}`);
  if (summary.skipped !== 0) failures.push(`RTK_TAP_SKIPPED_COUNT_NONZERO:${summary.skipped}`);
  if (summary.todo !== 0) failures.push(`RTK_TAP_TODO_COUNT_NONZERO:${summary.todo}`);
  for (const record of statusRecords) {
    if (!record.ok) failures.push(`RTK_TAP_NOT_OK:${record.ordinal}:${record.name}`);
    if (record.directive === 'SKIP') failures.push(`RTK_TAP_SKIP_DIRECTIVE:${record.ordinal}:${record.name}`);
    if (record.directive === 'TODO') failures.push(`RTK_TAP_TODO_DIRECTIVE:${record.ordinal}:${record.name}`);
  }
  if (expectedFileCount > 0 && statusRecords.length < expectedFileCount) {
    failures.push(`RTK_TAP_RECORDS_LESS_THAN_FILE_COUNT:${statusRecords.length}:${expectedFileCount}`);
  }
  return {
    ok: failures.length === 0,
    failures,
    summary,
    statusRecordCount: statusRecords.length,
  };
}

function boundedOutputCollector(limitBytes) {
  const chunks = [];
  let retainedBytes = 0;
  let observedBytes = 0;
  let overflow = false;
  return {
    append(chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ''), 'utf8');
      observedBytes += bytes.length;
      const available = Math.max(0, limitBytes - retainedBytes);
      if (available > 0) {
        const retained = bytes.length > available ? bytes.subarray(0, available) : bytes;
        chunks.push(Buffer.from(retained));
        retainedBytes += retained.length;
      }
      if (bytes.length > available) overflow = true;
    },
    text() {
      return Buffer.concat(chunks, retainedBytes).toString('utf8');
    },
    summary() {
      return { observedBytes, retainedBytes, limitBytes, overflow };
    },
  };
}

function defaultSignalProcessGroup(pgid, signal) {
  if (!Number.isSafeInteger(pgid) || pgid <= 0) {
    return { ok: false, code: 'RTK_PROCESS_GROUP_IDENTITY_INVALID' };
  }
  try {
    process.kill(-pgid, signal);
    return { ok: true, code: `RTK_PROCESS_GROUP_SIGNALED:${pgid}:${signal}` };
  } catch (error) {
    if (error?.code === 'ESRCH') return { ok: true, code: `RTK_PROCESS_GROUP_ALREADY_EXITED:${pgid}` };
    return { ok: false, code: `RTK_PROCESS_GROUP_SIGNAL_FAILED:${pgid}:${signal}:${error?.code || error?.message || String(error)}` };
  }
}

function parsePsIdentityLine(line) {
  const parts = String(line || '').trim().split(/\s+/u);
  if (parts.length < 8 || !/^\d+$/u.test(parts[0]) || !/^\d+$/u.test(parts[1])) return null;
  return {
    pid: Number(parts[0]),
    pgid: Number(parts[1]),
    startIdentity: parts.slice(2, 7).join(' '),
    executable: parts.slice(7).join(' '),
  };
}

export function inspectRtkProcessIdentity(pid, { spawnSyncImpl = spawnSync } = {}) {
  let result;
  try {
    result = spawnSyncImpl('ps', ['-p', String(pid), '-o', 'pid=', '-o', 'pgid=', '-o', 'lstart=', '-o', 'comm='], {
      encoding: 'utf8',
      timeout: RTK_PROCESS_PROBE_TIMEOUT_MS,
      maxBuffer: RTK_PROCESS_PROBE_MAX_BUFFER_BYTES,
    });
  } catch (error) {
    return { ok: false, status: 'INDETERMINATE', code: `RTK_PROCESS_IDENTITY_INSPECTION_THROWN:${pid}:${error?.code || error?.message || String(error)}`, identity: null };
  }
  if (result?.error) {
    return { ok: false, status: 'INDETERMINATE', code: `RTK_PROCESS_IDENTITY_INSPECTION_FAILED:${pid}:${result.error?.code || result.error?.message || 'UNKNOWN'}`, identity: null };
  }
  if (result.status === 1 && !String(result.stderr || '').trim()) {
    try {
      process.kill(pid, 0);
      return { ok: false, status: 'INDETERMINATE', code: `RTK_PROCESS_IDENTITY_HIDDEN:${pid}`, identity: null };
    } catch (error) {
      if (error?.code === 'ESRCH') return { ok: true, status: 'AVAILABLE', code: `RTK_PROCESS_IDENTITY_ABSENT:${pid}`, identity: null };
      return { ok: false, status: 'INDETERMINATE', code: `RTK_PROCESS_LIVENESS_INDETERMINATE:${pid}:${error?.code || error?.message || String(error)}`, identity: null };
    }
  }
  const identity = result.status === 0 ? parsePsIdentityLine(result.stdout) : null;
  if (!identity || identity.pid !== pid) {
    return { ok: false, status: 'INDETERMINATE', code: `RTK_PROCESS_IDENTITY_INSPECTION_FAILED:${pid}:${result.error?.code || result.status || 'MALFORMED'}`, identity: null };
  }
  return { ok: true, status: 'AVAILABLE', code: `RTK_PROCESS_IDENTITY_AVAILABLE:${pid}`, identity };
}

function sameProcessIdentity(expected, observed) {
  return Boolean(expected && observed)
    && expected.pid === observed.pid
    && expected.pgid === observed.pgid
    && expected.startIdentity === observed.startIdentity
    && expected.executable === observed.executable;
}

function sameProcessBirthIdentity(expected, observed) {
  return Boolean(expected && observed)
    && expected.pid === observed.pid
    && expected.pgid === observed.pgid
    && expected.startIdentity === observed.startIdentity;
}

export function inspectRtkProcessGroup(pgid, { spawnSyncImpl = spawnSync } = {}) {
  let result;
  try {
    result = spawnSyncImpl('ps', ['-axo', 'pid=,pgid=,lstart=,comm='], {
      encoding: 'utf8',
      timeout: RTK_PROCESS_PROBE_TIMEOUT_MS,
      maxBuffer: RTK_PROCESS_PROBE_MAX_BUFFER_BYTES,
    });
  } catch (error) {
    return { ok: false, complete: false, status: 'INDETERMINATE', code: `RTK_PROCESS_GROUP_INSPECTION_THROWN:${pgid}:${error?.code || error?.message || String(error)}`, rows: [] };
  }
  if (result.status !== 0) return { ok: false, complete: false, status: 'INDETERMINATE', code: `RTK_PROCESS_GROUP_INSPECTION_FAILED:${pgid}:${result.error?.code || result.status || 'UNKNOWN'}`, rows: [] };
  const parsed = String(result.stdout || '').split('\n').filter((line) => line.trim()).map(parsePsIdentityLine);
  if (parsed.some((row) => !row) || !parsed.some((row) => row.pid === process.pid)) {
    return { ok: false, complete: false, status: 'INDETERMINATE', code: `RTK_PROCESS_GROUP_TABLE_MALFORMED_OR_HIDDEN:${pgid}`, rows: [] };
  }
  return {
    ok: true,
    complete: true,
    status: 'AVAILABLE',
    code: `RTK_PROCESS_GROUP_INSPECTED:${pgid}`,
    rows: parsed.filter((row) => row.pgid === pgid),
  };
}

function defaultSignalPid(pid, signal) {
  try {
    process.kill(pid, signal);
    return { ok: true, code: `RTK_PROCESS_SIGNALED:${pid}:${signal}` };
  } catch (error) {
    if (error?.code === 'ESRCH') return { ok: true, code: `RTK_PROCESS_ALREADY_EXITED:${pid}` };
    return { ok: false, code: `RTK_PROCESS_SIGNAL_FAILED:${pid}:${signal}:${error?.code || error?.message || String(error)}` };
  }
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, ms)));
}

async function cleanupOwnedProcessGroup({
  pgid,
  expectedLeaderIdentity,
  knownMemberIdentities,
  inspectProcessGroup,
  readProcessIdentity,
  signalProcessGroup,
  signalPid,
  termGraceMs,
  killGraceMs,
  monotonicNow,
}) {
  const signals = [];
  const readIdentity = (pid) => {
    try {
      return readProcessIdentity(pid);
    } catch (error) {
      return { ok: false, status: 'INDETERMINATE', code: `RTK_PROCESS_IDENTITY_INSPECTION_THROWN:${pid}:${error?.code || error?.message || String(error)}`, identity: null };
    }
  };
  const inspect = () => {
    try {
      return inspectProcessGroup(pgid);
    } catch (error) {
      return {
        ok: false,
        complete: false,
        status: 'INDETERMINATE',
        code: `RTK_PROCESS_GROUP_INSPECTION_THROWN:${error?.code || error?.message || String(error)}`,
        rows: [],
      };
    }
  };
  const waitUntilAbsent = async (timeoutMs) => {
    const deadline = monotonicNow() + timeoutMs;
    while (true) {
      const observation = inspect();
      if (observation?.ok !== true || observation?.complete !== true) return observation;
      if (!Array.isArray(observation.rows)) {
        return { ok: false, complete: false, status: 'INDETERMINATE', code: 'RTK_PROCESS_GROUP_ROWS_MALFORMED', rows: [] };
      }
      if (observation.rows.length === 0) return observation;
      const observedAt = monotonicNow();
      if (observedAt >= deadline) return observation;
      await waitMs(Math.min(25, Math.max(1, deadline - observedAt)));
    }
  };
  let observation = await waitUntilAbsent(1);
  if (observation?.ok !== true || observation?.complete !== true) {
    return { ok: false, code: observation?.code || 'RTK_PROCESS_GROUP_INSPECTION_INDETERMINATE', observation, signals };
  }
  if (observation.rows.length === 0) {
    const leader = readIdentity(pgid);
    if (leader?.ok === true && leader.identity?.pgid === pgid && expectedLeaderIdentity && !sameProcessIdentity(expectedLeaderIdentity, leader.identity)) {
      return { ok: false, code: `RTK_PROCESS_GROUP_ABSENCE_CONFLICT:${pgid}`, observation, signals };
    }
    return { ok: true, code: 'RTK_PROCESS_GROUP_CLEAN', observation, signals };
  }
  const signalVerifiedOwned = (signal) => {
    const leader = readIdentity(pgid);
    if (leader?.ok === true && sameProcessIdentity(expectedLeaderIdentity, leader.identity)) {
      try {
        return signalProcessGroup(pgid, signal);
      } catch (error) {
        return { ok: false, code: `RTK_PROCESS_GROUP_SIGNAL_THROWN:${pgid}:${signal}:${error?.code || error?.message || String(error)}` };
      }
    }
    if (leader?.ok !== true || leader.identity) {
      return { ok: false, code: leader?.code || `RTK_PROCESS_GROUP_LEADER_IDENTITY_AMBIGUOUS:${pgid}` };
    }
    const current = inspect();
    if (current?.ok !== true || current?.complete !== true) return { ok: false, code: current?.code || 'RTK_PROCESS_GROUP_INSPECTION_INDETERMINATE' };
    for (const row of current.rows) {
      const expected = knownMemberIdentities.get(row.pid);
      const actual = readIdentity(row.pid);
      if (!expected || actual?.ok !== true || !sameProcessBirthIdentity(expected, actual.identity)) {
        return { ok: false, code: `RTK_PROCESS_GROUP_MEMBER_IDENTITY_AMBIGUOUS:${row.pid}` };
      }
    }
    const results = current.rows.map((row) => {
      try {
        return signalPid(row.pid, signal);
      } catch (error) {
        return { ok: false, code: `RTK_PROCESS_SIGNAL_THROWN:${row.pid}:${signal}:${error?.code || error?.message || String(error)}` };
      }
    });
    const failed = results.find((result) => result?.ok !== true);
    return failed || { ok: true, code: `RTK_PROCESS_GROUP_MEMBERS_SIGNALED:${pgid}:${signal}` };
  };
  const term = signalVerifiedOwned('SIGTERM');
  signals.push('SIGTERM');
  if (term?.ok !== true) return { ok: false, code: term?.code || 'RTK_PROCESS_GROUP_TERM_FAILED', observation, signals };
  observation = await waitUntilAbsent(termGraceMs);
  if (observation?.ok !== true || observation?.complete !== true) {
    return { ok: false, code: observation?.code || 'RTK_PROCESS_GROUP_INSPECTION_INDETERMINATE', observation, signals };
  }
  if (observation.rows.length === 0) return { ok: true, code: 'RTK_PROCESS_GROUP_CLEAN_AFTER_TERM', observation, signals };
  const kill = signalVerifiedOwned('SIGKILL');
  signals.push('SIGKILL');
  if (kill?.ok !== true) return { ok: false, code: kill?.code || 'RTK_PROCESS_GROUP_KILL_FAILED', observation, signals };
  observation = await waitUntilAbsent(killGraceMs);
  const ok = observation?.ok === true && observation?.complete === true && observation.rows.length === 0;
  return {
    ok,
    code: ok ? 'RTK_PROCESS_GROUP_CLEAN_AFTER_KILL' : (observation?.code || 'RTK_PROCESS_GROUP_SURVIVORS'),
    observation,
    signals,
  };
}

export async function runRtkTestGraph({
  plan = buildPlan(),
  spawnImpl = spawn,
  tmpParent = os.tmpdir(),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  createLease = createOwnedTmpLease,
  cleanupLease = cleanupOwnedTmpLease,
  signalProcessGroup = defaultSignalProcessGroup,
  inspectProcessGroup = inspectRtkProcessGroup,
  readProcessIdentity = inspectRtkProcessIdentity,
  signalPid = defaultSignalPid,
  monotonicNow = defaultMonotonicNow,
  wallTimeoutMs = RTK_RUNNER_DEFAULTS.wallTimeoutMs,
  noProgressTimeoutMs = RTK_RUNNER_DEFAULTS.noProgressTimeoutMs,
  heartbeatIntervalMs = RTK_RUNNER_DEFAULTS.heartbeatIntervalMs,
  termGraceMs = RTK_RUNNER_DEFAULTS.termGraceMs,
  killGraceMs = RTK_RUNNER_DEFAULTS.killGraceMs,
  retainedOutputBytes = RTK_RUNNER_DEFAULTS.retainedOutputBytes,
} = {}) {
  const lease = createLease({ tmpParent });
  const childEnv = {
    ...env,
    TMPDIR: lease.root,
    TMP: lease.root,
    TEMP: lease.root,
  };
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('NODE_TEST_')) delete childEnv[key];
  }
  const normalized = {
    wallTimeoutMs: Math.max(1, Number(wallTimeoutMs) || RTK_RUNNER_DEFAULTS.wallTimeoutMs),
    noProgressTimeoutMs: Math.max(1, Number(noProgressTimeoutMs) || RTK_RUNNER_DEFAULTS.noProgressTimeoutMs),
    heartbeatIntervalMs: Math.max(10, Number(heartbeatIntervalMs) || RTK_RUNNER_DEFAULTS.heartbeatIntervalMs),
    termGraceMs: Math.max(1, Number(termGraceMs) || RTK_RUNNER_DEFAULTS.termGraceMs),
    killGraceMs: Math.max(1, Number(killGraceMs) || RTK_RUNNER_DEFAULTS.killGraceMs),
    retainedOutputBytes: Math.max(1, Number(retainedOutputBytes) || RTK_RUNNER_DEFAULTS.retainedOutputBytes),
  };
  const stdoutCollector = boundedOutputCollector(normalized.retainedOutputBytes);
  const stderrCollector = boundedOutputCollector(normalized.retainedOutputBytes);
  const now = createMonotonicReader(monotonicNow);
  const startedAt = now();
  const invocationId = crypto.randomUUID();
  let sequence = 0;
  let lastChildProgressAt = startedAt;
  let child = null;
  let childClosed = false;
  let expectedLeaderIdentity = null;
  const knownMemberIdentities = new Map();
  let lastGroupCaptureAt = null;
  let spawnError = null;
  let streamFailure = null;
  let processInspectionFailure = null;
  const writerErrorBindings = [];
  const streamSequence = { stdout: 0, stderr: 0 };
  let exitStatus = null;
  let exitSignal = null;
  let timeout = { ok: true, code: 'RTK_GRAPH_DEADLINES_NOT_EXPIRED' };
  let deadlineTimer = null;
  let heartbeatTimer = null;
  let killTimer = null;
  let terminalTimer = null;
  let terminalUnproven = false;
  const spawnArgs = ['--test', '--test-reporter=tap', ...plan.testFiles];
  const writeEvidence = (target, chunk) => {
    try {
      return target.write(chunk);
    } catch (error) {
      streamFailure ||= error;
      return false;
    }
  };
  const captureGroup = (force = false) => {
    if (!child || !Number.isSafeInteger(child.pid)) return;
    const capturedAt = now();
    if (!force && lastGroupCaptureAt !== null && capturedAt - lastGroupCaptureAt < 50) return;
    lastGroupCaptureAt = capturedAt;
    let observation;
    try {
      observation = inspectProcessGroup(child.pid);
    } catch (error) {
      processInspectionFailure = error;
      return;
    }
    if (observation?.ok !== true || observation?.complete !== true) {
      processInspectionFailure ||= new Error(observation?.code || 'RTK_PROCESS_GROUP_INSPECTION_INDETERMINATE');
      return;
    }
    for (const row of observation.rows || []) {
      if (!row?.startIdentity || !row?.executable) continue;
      const existing = knownMemberIdentities.get(row.pid);
      if (existing && !sameProcessBirthIdentity(existing, row)) {
        processInspectionFailure ||= new Error(`RTK_PROCESS_GROUP_MEMBER_IDENTITY_CHANGED:${row.pid}`);
        continue;
      }
      knownMemberIdentities.set(row.pid, row);
    }
  };
  const emitEvent = (type, detail = {}) => {
    sequence += 1;
    return writeEvidence(stderr, `RTK_GRAPH_EVENT=${JSON.stringify({
      schemaVersion: 'yalken.rtk.graph-progress.v1',
      invocationId,
      sequence,
      type,
      elapsedMs: Math.max(0, now() - startedAt),
      ...detail,
    })}\n`);
  };
  const forward = (source, target, collector, streamName) => {
    source?.on?.('data', (chunk) => {
      lastChildProgressAt = now();
      streamSequence[streamName] += 1;
      collector.append(chunk);
      captureGroup();
      try {
        const writable = target.write(chunk);
        if (writable === false && typeof target.once === 'function' && typeof source.pause === 'function') {
          source.pause();
          target.once('drain', () => source.resume());
        }
      } catch (error) {
        streamFailure = error;
        signalForDeadline(`RTK_GRAPH_STREAM_FORWARD_FAILED:${error?.code || error?.message || String(error)}`);
      }
    });
    source?.on?.('error', (error) => {
      streamFailure = error;
      signalForDeadline(`RTK_GRAPH_CHILD_STREAM_FAILED:${error?.code || error?.message || String(error)}`);
    });
  };
  const signalVerifiedGroup = (signal) => {
    let observed = null;
    try {
      observed = child ? readProcessIdentity(child.pid) : null;
    } catch (error) {
      return { ok: false, code: `RTK_PROCESS_IDENTITY_INSPECTION_THROWN:${child?.pid || 'unknown'}:${error?.code || error?.message || String(error)}` };
    }
    if (!expectedLeaderIdentity || observed?.ok !== true || !sameProcessIdentity(expectedLeaderIdentity, observed.identity)) {
      return { ok: false, code: `RTK_PROCESS_GROUP_LEADER_IDENTITY_AMBIGUOUS:${child?.pid || 'unknown'}:${observed?.code || 'UNBOUND'}` };
    }
    try {
      return signalProcessGroup(child.pid, signal);
    } catch (error) {
      return { ok: false, code: `RTK_PROCESS_GROUP_SIGNAL_THROWN:${child.pid}:${signal}:${error?.code || error?.message || String(error)}` };
    }
  };
  const signalForDeadline = (code) => {
    if (timeout.ok !== true || !child || childClosed) return;
    timeout = { ok: false, code, elapsedMs: Math.max(0, now() - startedAt) };
    emitEvent('RTK_GRAPH_TIMEOUT', { code });
    const term = signalVerifiedGroup('SIGTERM');
    timeout.term = term;
    if (term?.ok !== true) terminalUnproven = true;
    killTimer = setTimeout(() => {
      if (exitStatus !== null || exitSignal !== null || spawnError) return;
      const killed = signalVerifiedGroup('SIGKILL');
      timeout.kill = killed;
      if (killed?.ok !== true) terminalUnproven = true;
      terminalTimer = setTimeout(() => {
        if (exitStatus === null && exitSignal === null && !spawnError) {
          terminalUnproven = true;
          try { child.stdout?.destroy?.(); } catch { /* fail closed below */ }
          try { child.stderr?.destroy?.(); } catch { /* fail closed below */ }
          child.emit?.('close', null, 'SIGKILL');
        }
      }, normalized.killGraceMs);
    }, normalized.termGraceMs);
  };
  const bindWriterErrors = (target, label) => {
    if (!target || typeof target.on !== 'function') return;
    const onError = (error) => {
      streamFailure ||= error;
      signalForDeadline(`RTK_GRAPH_${label}_WRITER_FAILED:${error?.code || error?.message || String(error)}`);
    };
    target.on('error', onError);
    writerErrorBindings.push({ target, onError });
  };
  bindWriterErrors(stdout, 'STDOUT');
  bindWriterErrors(stderr, 'STDERR');
  emitEvent('RTK_GRAPH_STARTED', {
    fileCount: plan.testFiles.length,
    childCommand: process.execPath,
    reporter: 'tap',
    deadlines: normalized,
  });
  const childCompletion = new Promise((resolve) => {
    let resolved = false;
    const finish = (status, signal) => {
      if (resolved) return;
      resolved = true;
      childClosed = true;
      exitStatus = status;
      exitSignal = signal;
      resolve();
    };
    try {
      child = spawnImpl(process.execPath, spawnArgs, {
        cwd: REPO_ROOT,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });
      child.once?.('error', (error) => {
        spawnError = error;
        if (!Number.isSafeInteger(child.pid) || child.pid <= 0) finish(null, null);
      });
      child.once?.('close', finish);
      if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) {
        queueMicrotask(() => {
          if (!childClosed && !spawnError) {
            spawnError = new Error('RTK_CHILD_PID_INVALID');
            finish(null, null);
          }
        });
        return;
      }
      forward(child.stdout, stdout, stdoutCollector, 'stdout');
      forward(child.stderr, stderr, stderrCollector, 'stderr');
    } catch (error) {
      spawnError = error;
      finish(null, null);
    }
  });
  if (child && !spawnError) {
    const identityDeadline = now() + Math.min(1000, normalized.termGraceMs);
    while (!childClosed && now() <= identityDeadline) {
      let observation;
      try {
        observation = readProcessIdentity(child.pid);
      } catch (error) {
        processInspectionFailure ||= error;
        break;
      }
      if (observation?.ok === true && observation.identity?.pgid === child.pid) {
        expectedLeaderIdentity = observation.identity;
        knownMemberIdentities.set(child.pid, observation.identity);
        break;
      }
      await waitMs(10);
    }
    captureGroup(true);
    if (!childClosed && !expectedLeaderIdentity) {
      terminalUnproven = true;
      signalForDeadline(`RTK_PROCESS_GROUP_LEADER_IDENTITY_UNBOUND:${child.pid}`);
    }
    if (!childClosed && streamFailure && timeout.ok === true) {
      signalForDeadline(`RTK_GRAPH_EVIDENCE_STREAM_FAILED:${streamFailure?.code || streamFailure?.message || String(streamFailure)}`);
    }
    if (!childClosed && processInspectionFailure && timeout.ok === true) {
      signalForDeadline(`RTK_GRAPH_PROCESS_INSPECTION_FAILED:${processInspectionFailure?.code || processInspectionFailure?.message || String(processInspectionFailure)}`);
    }
    heartbeatTimer = setInterval(() => {
      captureGroup(true);
      const heartbeatAt = now();
      emitEvent('RTK_GRAPH_PROGRESS', {
        childPid: child.pid,
        childProgressAgeMs: Math.max(0, heartbeatAt - lastChildProgressAt),
        stdoutBytes: stdoutCollector.summary().observedBytes,
        stderrBytes: stderrCollector.summary().observedBytes,
        stdoutSequence: streamSequence.stdout,
        stderrSequence: streamSequence.stderr,
      });
    }, normalized.heartbeatIntervalMs);
    deadlineTimer = setInterval(() => {
      const deadlineAt = now();
      if (deadlineAt - startedAt >= normalized.wallTimeoutMs) {
        signalForDeadline('RTK_GRAPH_WALL_TIMEOUT');
      } else if (deadlineAt - lastChildProgressAt >= normalized.noProgressTimeoutMs) {
        signalForDeadline('RTK_GRAPH_NO_PROGRESS_TIMEOUT');
      }
    }, Math.max(10, Math.min(100, normalized.heartbeatIntervalMs)));
  }
  await childCompletion;
  if (deadlineTimer) clearInterval(deadlineTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (killTimer) clearTimeout(killTimer);
  if (terminalTimer) clearTimeout(terminalTimer);
  emitEvent('RTK_GRAPH_EXITED', {
    childPid: child?.pid || null,
    status: exitStatus,
    signal: exitSignal,
    spawnError: spawnError?.code || spawnError?.message || '',
  });
  const processGroupCleanup = spawnError && (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0)
    ? { ok: true, code: 'RTK_NO_CHILD_PROCESS_SPAWN_PROVEN', signals: [] }
    : child && Number.isSafeInteger(child.pid)
    ? await cleanupOwnedProcessGroup({
        pgid: child.pid,
        expectedLeaderIdentity,
        knownMemberIdentities,
        inspectProcessGroup,
        readProcessIdentity,
        signalProcessGroup,
        signalPid,
        termGraceMs: normalized.termGraceMs,
        killGraceMs: normalized.killGraceMs,
        monotonicNow: now,
      })
    : { ok: false, code: 'RTK_PROCESS_GROUP_IDENTITY_UNAVAILABLE', signals: [] };
  const outputRetention = {
    ok: !stdoutCollector.summary().overflow && !stderrCollector.summary().overflow,
    stdout: stdoutCollector.summary(),
    stderr: stderrCollector.summary(),
  };
  const result = {
    status: exitStatus,
    signal: exitSignal,
    stdout: stdoutCollector.text(),
    stderr: stderrCollector.text(),
    error: spawnError,
  };
  let tap = {
    ok: false,
    failures: ['RTK_TAP_NOT_EVALUATED'],
    summary: {},
    statusRecordCount: 0,
  };
  let cleanup = {
    ok: false,
    failures: ['RTK_TMPDIR_CLEANUP_NOT_RUN'],
    root: lease.root,
    residue: null,
  };
  try {
    tap = evaluateMandatoryTapOutput(result.stdout || '', result.stderr || '', { expectedFileCount: plan.testFiles.length });
  } catch (error) {
    tap = {
      ok: false,
      failures: [`RTK_TAP_EVALUATION_THROWN:${error?.code || error?.message || String(error)}`],
      summary: {},
      statusRecordCount: 0,
    };
  }
  if (!tap.ok) writeEvidence(stderr, `RTK_TAP_INVENTORY_FAILED=${JSON.stringify(tap)}\n`);
  if (!outputRetention.ok) writeEvidence(stderr, `RTK_GRAPH_OUTPUT_RETENTION_EXCEEDED=${JSON.stringify(outputRetention)}\n`);
  try {
    if (processGroupCleanup.ok !== true) {
      cleanup = {
        ok: false,
        failures: [`RTK_TMPDIR_CLEANUP_WITHHELD_PROCESS_GROUP_UNPROVEN:${processGroupCleanup.code}`],
        root: lease.root,
        residue: summarizeExistingRoot(lease.root),
      };
    } else {
      try {
        cleanup = cleanupLease(lease);
      } catch (error) {
        cleanup = {
          ok: false,
          failures: [`RTK_TMPDIR_CLEANUP_THROWN:${error?.code || error?.message || String(error)}`],
          root: lease.root,
          residue: summarizeExistingRoot(lease.root),
        };
      }
    }
  } finally {
    if (!cleanup.ok) writeEvidence(stderr, `RTK_TMPDIR_CLEANUP_FAILED=${JSON.stringify(cleanup)}\n`);
  }
  if (spawnError) {
    writeEvidence(stderr, `RTK_TEST_GRAPH_SPAWN_FAILED=${JSON.stringify({
      name: spawnError.name,
      message: spawnError.message,
      code: spawnError.code,
    })}\n`);
  }
  emitEvent('RTK_GRAPH_CLEANUP', {
    processGroupCleanup: processGroupCleanup.code,
    leaseCleanupOk: cleanup.ok,
  });
  await new Promise((resolve) => setImmediate(resolve));
  for (const { target, onError } of writerErrorBindings) {
    if (typeof target.off === 'function') target.off('error', onError);
    else if (typeof target.removeListener === 'function') target.removeListener('error', onError);
  }
  const childOk = result.status === 0 && result.signal === null && !spawnError && timeout.ok;
  return {
    exitCode: childOk && tap.ok && cleanup.ok && processGroupCleanup.ok && outputRetention.ok && !terminalUnproven && !streamFailure && !processInspectionFailure ? 0 : 1,
    result,
    tap,
    cleanup,
    lease,
    timeout,
    outputRetention,
    processGroupCleanup,
    spawnArgs,
    invocationId,
    expectedLeaderIdentity,
    streamFailure,
    processInspectionFailure,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--list');
  const json = process.argv.includes('--json');
  const plan = buildPlan();
  const drifted = plan.diff.missing.length > 0 || plan.diff.extra.length > 0;

  if (dryRun || json) {
    printPlan(plan);
    if (dryRun && !drifted) return;
  }

  if (drifted) {
    process.stderr.write(`RTK_TEST_GRAPH_CATALOG_DRIFT=${JSON.stringify(plan.diff)}\n`);
    process.exitCode = 1;
    return;
  }

  const run = await runRtkTestGraph({ plan });
  process.exitCode = run.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`RTK_TEST_GRAPH_FATAL=${JSON.stringify({ name: error?.name, message: error?.message || String(error), code: error?.code })}\n`);
    process.exitCode = 1;
  });
}
