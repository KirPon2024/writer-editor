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
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}

main();
