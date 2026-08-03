#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'RTK_TEST_GRAPH_CATALOG_V1.json');
const CONTRACT_DIR = path.join(REPO_ROOT, 'test', 'contracts');

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

  const result = spawnSync(process.execPath, ['--test', ...plan.testFiles], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  const tap = evaluateMandatoryTapOutput(result.stdout || '', result.stderr || '', { expectedFileCount: plan.testFiles.length });
  if (!tap.ok) {
    process.stderr.write(`RTK_TAP_INVENTORY_FAILED=${JSON.stringify(tap)}\n`);
  }
  process.exitCode = (result.status ?? 1) === 0 && tap.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
