#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'RTK_TEST_GRAPH_CATALOG_V1.json');
const CONTRACT_DIR = path.join(REPO_ROOT, 'test', 'contracts');
export const RTK_OWNED_TMPDIR_PREFIX = 'rtk-owned-tmpdir-';

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

export function runRtkTestGraph({
  plan = buildPlan(),
  spawnImpl = spawnSync,
  tmpParent = os.tmpdir(),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  createLease = createOwnedTmpLease,
  cleanupLease = cleanupOwnedTmpLease,
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
  let result = {
    status: 1,
    stdout: '',
    stderr: '',
    error: null,
  };
  let thrownSpawnError = null;
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
    try {
      result = spawnImpl(process.execPath, ['--test', ...plan.testFiles], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 128 * 1024 * 1024,
        env: childEnv,
      });
    } catch (error) {
      thrownSpawnError = error;
    }
    if (result.stdout) stdout.write(result.stdout);
    if (result.stderr) stderr.write(result.stderr);
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
    if (!tap.ok) {
      stderr.write(`RTK_TAP_INVENTORY_FAILED=${JSON.stringify(tap)}\n`);
    }
  } finally {
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
    if (!cleanup.ok) {
      stderr.write(`RTK_TMPDIR_CLEANUP_FAILED=${JSON.stringify(cleanup)}\n`);
    }
  }
  const spawnError = thrownSpawnError || result.error;
  if (spawnError) {
    stderr.write(`RTK_TEST_GRAPH_SPAWN_FAILED=${JSON.stringify({
      name: spawnError.name,
      message: spawnError.message,
      code: spawnError.code,
    })}\n`);
  }
  const childOk = (result.status ?? 1) === 0 && !spawnError;
  return {
    exitCode: childOk && tap.ok && cleanup.ok ? 0 : 1,
    result,
    tap,
    cleanup,
    lease,
  };
}

function main() {
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

  const run = runRtkTestGraph({ plan });
  process.exitCode = run.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
