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

test('required token set conditions: VNEXT_TOUCHED=true enables conditional core token', async () => {
  const { buildRequiredTokenSetFromProfile } = await loadGeneratorModule();
  const profile = readExampleProfile();
  profile.profile = 'pr';
  profile.gateTier = 'core';
  profile.headStrictEnforced = false;
  profile.scopeFlags.VNEXT_TOUCHED = true;

  const state = buildRequiredTokenSetFromProfile(profile);
  assert.equal(state.ok, true);
  assert.ok(state.requiredTokenSet.requiredSets.active.includes('E2E_CRITICAL_USER_PATH_OK'));
});

test('required token set conditions: VNEXT_TOUCHED=false keeps conditional core token disabled', async () => {
  const { buildRequiredTokenSetFromProfile } = await loadGeneratorModule();
  const profile = readExampleProfile();
  profile.profile = 'pr';
  profile.gateTier = 'core';
  profile.headStrictEnforced = false;
  profile.scopeFlags.VNEXT_TOUCHED = false;

  const state = buildRequiredTokenSetFromProfile(profile);
  assert.equal(state.ok, true);
  assert.equal(state.requiredTokenSet.requiredSets.active.includes('E2E_CRITICAL_USER_PATH_OK'), false);
});

test('required token set lock state: drift is detected when lock content mismatches', async () => {
  const { evaluateRequiredTokenSetLockState } = await loadLockStateModule();
  const profile = readExampleProfile();
  const lockDoc = {
    schemaVersion: 1,
    freezeReady: {
      requiredAlways: [],
      requiredFreezeMode: [],
      requiredTokens: [],
    },
  };
  const state = evaluateRequiredTokenSetLockState({
    profileDoc: profile,
    lockDoc,
  });

  assert.equal(state.ok, false);
  assert.equal(state.REQUIRED_TOKEN_SET_LOCK_OK, 0);
  assert.ok(state.failures.includes('E_REQUIRED_TOKEN_SET_DRIFT'));
});
