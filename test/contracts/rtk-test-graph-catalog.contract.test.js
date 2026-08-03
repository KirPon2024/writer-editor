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

test('C4 RTK runner rejects hidden skip todo incomplete and zero-test TAP false greens', async () => {
  const runner = await import(RUNNER_PATH);
  const valid = [
    'TAP version 13',
    '# Subtest: mandatory a',
    'ok 1 - mandatory a',
    '# Subtest: mandatory b',
    'ok 2 - mandatory b',
    '1..2',
    '# tests 2',
    '# pass 2',
    '# fail 0',
    '# cancelled 0',
    '# skipped 0',
    '# todo 0',
  ].join('\n');
  assert.equal(runner.evaluateMandatoryTapOutput(valid, '', { expectedFileCount: 2 }).ok, true);

  const hiddenSkip = valid
    .replace('ok 2 - mandatory b', 'ok 2 - mandatory b # SKIP hidden')
    .replace('# skipped 0', '# skipped 1');
  assert.equal(runner.evaluateMandatoryTapOutput(hiddenSkip, '', { expectedFileCount: 2 }).failures.includes('RTK_TAP_SKIPPED_COUNT_NONZERO:1'), true);
  assert.equal(runner.evaluateMandatoryTapOutput(hiddenSkip, '', { expectedFileCount: 2 }).failures.some((failure) => failure.startsWith('RTK_TAP_SKIP_DIRECTIVE:2:mandatory b')), true);

  const hiddenTodo = valid
    .replace('ok 2 - mandatory b', 'ok 2 - mandatory b # TODO hidden')
    .replace('# todo 0', '# todo 1');
  assert.equal(runner.evaluateMandatoryTapOutput(hiddenTodo, '', { expectedFileCount: 2 }).failures.includes('RTK_TAP_TODO_COUNT_NONZERO:1'), true);

  const incomplete = valid.replace('# tests 2\n', '');
  assert.equal(runner.evaluateMandatoryTapOutput(incomplete, '', { expectedFileCount: 2 }).failures.includes('RTK_TAP_SUMMARY_TESTS_MISSING'), true);

  const zero = [
    'TAP version 13',
    '1..0',
    '# tests 0',
    '# pass 0',
    '# fail 0',
    '# cancelled 0',
    '# skipped 0',
    '# todo 0',
  ].join('\n');
  assert.equal(runner.evaluateMandatoryTapOutput(zero, '', { expectedFileCount: 1 }).failures.includes('RTK_TAP_ZERO_TESTS'), true);

  const mismatch = valid.replace('# tests 2', '# tests 3');
  assert.equal(runner.evaluateMandatoryTapOutput(mismatch, '', { expectedFileCount: 2 }).failures.includes('RTK_TAP_TEST_RECORD_COUNT_MISMATCH:2:3'), true);
});
