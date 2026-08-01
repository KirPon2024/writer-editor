const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'RTK_TEST_GRAPH_CATALOG_V1.json');
const PACKAGE_PATH = path.join(REPO_ROOT, 'package.json');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'rtk-required.yml');
const RUNNER_PATH = path.join(REPO_ROOT, 'scripts', 'run-rtk-tests.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listRtkContracts() {
  return fs.readdirSync(path.join(REPO_ROOT, 'test', 'contracts'))
    .filter((name) => /^rtk-.*\.contract\.test\.js$/u.test(name))
    .sort();
}

test('C4 RTK catalog deterministically covers every maintained rtk contract', () => {
  const catalog = readJson(CATALOG_PATH);
  const actual = listRtkContracts();
  assert.equal(catalog.schemaVersion, 'yalken.rtk.test-graph-catalog.v1');
  assert.equal(catalog.status, 'ACTIVE_REQUIRED_LOCAL_PROMOTION_AND_CI');
  assert.deepEqual([...catalog.contractBasenames].sort(), actual);
  assert.equal(catalog.currentTruthBinding.wordAcceptanceRevoked, true);
  assert.equal(catalog.currentTruthBinding.wordSaturated, false);
  assert.equal(catalog.currentTruthBinding.googleStage, 'REPORT_ONLY_BLOCKED_BY_WORD_SAFETY_REMEDIATION');
});

test('C4 test:rtk command and promotion wiring are local deterministic gates', () => {
  const pkg = readJson(PACKAGE_PATH);
  assert.equal(pkg.scripts['test:rtk'], 'node scripts/run-rtk-tests.mjs');
  assert.match(pkg.scripts['promotion:check'], /npm run -s test:rtk/u);

  const dryRun = spawnSync(process.execPath, [RUNNER_PATH, '--dry-run'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(dryRun.status, 0, `${dryRun.stdout}\n${dryRun.stderr}`);
  const plan = JSON.parse(dryRun.stdout);
  assert.equal(plan.command, 'node scripts/run-rtk-tests.mjs');
  assert.equal(plan.missing.length, 0);
  assert.equal(plan.extra.length, 0);
});

test('C4 required CI runs the deterministic RTK graph without product network', () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(workflow, /name: rtk-required/u);
  assert.match(workflow, /npm run -s test:rtk/u);
  assert.doesNotMatch(workflow, /password|secret|google|drive|network/iu);
});
