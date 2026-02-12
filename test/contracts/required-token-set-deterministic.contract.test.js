const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let generatorModulePromise = null;
let lockStateModulePromise = null;

function loadGeneratorModule() {
  if (!generatorModulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/generate-required-token-set.mjs'),
    ).href;
    generatorModulePromise = import(href);
  }
  return generatorModulePromise;
}

function loadLockStateModule() {
  if (!lockStateModulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/required-token-set-lock-state.mjs'),
    ).href;
    lockStateModulePromise = import(href);
  }
  return lockStateModulePromise;
}

function readExampleProfile() {
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'docs/OPS/EXECUTION/EXECUTION_PROFILE.example.json'),
    'utf8',
  );
  return JSON.parse(raw);
}

test('required token set generator: deterministic output and stable sorted arrays', async () => {
  const { buildRequiredTokenSetFromProfile } = await loadGeneratorModule();
  const profile = readExampleProfile();
  const runA = buildRequiredTokenSetFromProfile(profile);
  const runB = buildRequiredTokenSetFromProfile(profile);

  assert.equal(runA.ok, true);
  assert.deepEqual(runA, runB);

  const payload = runA.requiredTokenSet;
  assert.deepEqual(payload.requiredSets.active, [...payload.requiredSets.active].sort());
  assert.deepEqual(payload.freezeReady.requiredTokens, [...payload.freezeReady.requiredTokens].sort());
  assert.equal(new Set(payload.freezeReady.requiredTokens).size, payload.freezeReady.requiredTokens.length);
});

test('required token set lock state: lock file is synchronized with generator output', async () => {
  const { evaluateRequiredTokenSetLockState } = await loadLockStateModule();
  const state = evaluateRequiredTokenSetLockState();

  assert.equal(state.ok, true);
  assert.equal(state.REQUIRED_TOKEN_SET_LOCK_OK, 1);
  assert.equal(state.lockMatches, 1);
  assert.deepEqual(state.failures, []);
});
