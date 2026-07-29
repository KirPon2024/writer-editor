const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const MODULE_PATH = path.join(REPO_ROOT, 'scripts/ops/rtk-g0a-assurance.mjs');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) modulePromise = import(pathToFileURL(MODULE_PATH).href);
  return modulePromise;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadBaselineRegistry() {
  const { DEFAULT_REGISTRY_PATH } = await loadModule();
  return require(path.join(REPO_ROOT, DEFAULT_REGISTRY_PATH));
}

test('baseline-registry-passes', async () => {
  const { evaluateRtkG0AAssurance } = await loadModule();
  const result = evaluateRtkG0AAssurance({ repoRoot: REPO_ROOT });
  assert.equal(result.ok, true);
  assert.equal(result.RTK_G0A_ASSURANCE_OK, 1);
  assert.equal(result.status, 'PASS');
  assert.equal(result.failures.length, 0);
  assert.ok(result.assertionCount >= 6);
  assert.equal(result.blockingFamilyCount, 5);
});

test('script-json-baseline-passes', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/rtk-g0a-assurance.mjs', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.RTK_G0A_ASSURANCE_OK, 1);
});

test('missing-registry-fails-closed', async () => {
  const { evaluateRtkG0AAssurance } = await loadModule();
  const result = evaluateRtkG0AAssurance({
    repoRoot: REPO_ROOT,
    registryPath: 'docs/OPS/RTK/DOES_NOT_EXIST.json',
  });
  assert.equal(result.ok, false);
  assert.equal(result.RTK_G0A_ASSURANCE_OK, 0);
  assert.equal(result.failSignal, 'E_BLOCKING_TOKEN_UNBOUND');
  assert.ok(result.failures.includes('E_RTK_G0A_REGISTRY_MISSING_OR_INVALID'));
});

test('cwd-fallback-is-not-accepted', async () => {
  const { evaluateRtkG0AAssurance } = await loadModule();
  const result = evaluateRtkG0AAssurance({ repoRoot: '/tmp/not-a-yalken-repo' });
  assert.equal(result.ok, false);
  assert.equal(result.RTK_G0A_ASSURANCE_OK, 0);
  assert.equal(result.failSignal, 'E_RTK_G0A_REPO_BINDING_INVALID');
});

test('fixture-only-blocking-source-binding-is-rejected', async () => {
  const { evaluateRtkG0AAssurance } = await loadModule();
  const registry = clone(await loadBaselineRegistry());
  registry.assertions[0].sourceBindings = [{ kind: 'FIXTURE', ref: 'test/fixtures/synthetic.json' }];
  const result = evaluateRtkG0AAssurance({ repoRoot: REPO_ROOT, registryDoc: registry });
  assert.equal(result.ok, false);
  assert.equal(result.RTK_G0A_ASSURANCE_OK, 0);
  assert.ok(result.failures.includes('E_RTK_G0A_FIXTURE_ONLY_BLOCKING_BINDING'));
});

test('missing-negative-test-id-is-rejected', async () => {
  const { evaluateRtkG0AAssurance } = await loadModule();
  const registry = clone(await loadBaselineRegistry());
  registry.assertions[0].negativeTestIds = [
    'test/contracts/rtk-g0a-missing-negative.contract.test.js',
  ];
  const result = evaluateRtkG0AAssurance({ repoRoot: REPO_ROOT, registryDoc: registry });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_RTK_G0A_TEST_REF_MISSING'));
});

test('missing-producer-command-is-rejected', async () => {
  const { evaluateRtkG0AAssurance } = await loadModule();
  const registry = clone(await loadBaselineRegistry());
  registry.assertions[0].producerCommand = 'node scripts/ops/no-such-producer.mjs --json';
  const result = evaluateRtkG0AAssurance({ repoRoot: REPO_ROOT, registryDoc: registry });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_RTK_G0A_PRODUCER_MISSING'));
});

test('blocking-family-expansion-is-rejected', async () => {
  const { evaluateRtkG0AAssurance } = await loadModule();
  const registry = clone(await loadBaselineRegistry());
  registry.blockingFamilies.push('NEW_UNAPPROVED_FAMILY');
  const result = evaluateRtkG0AAssurance({ repoRoot: REPO_ROOT, registryDoc: registry });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_RTK_G0A_BLOCKING_FAMILY_EXPANSION'));
});
