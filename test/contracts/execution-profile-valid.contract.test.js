const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/validate-execution-profile.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

function readExampleProfile() {
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'docs/OPS/EXECUTION/EXECUTION_PROFILE.example.json'),
    'utf8',
  );
  return JSON.parse(raw);
}

test('execution profile validation: default profile is valid', async () => {
  const { evaluateExecutionProfileValidationState } = await loadModule();
  const state = evaluateExecutionProfileValidationState();

  assert.equal(state.ok, true);
  assert.equal(state.EXECUTION_PROFILE_VALID_OK, 1);
  assert.deepEqual(state.failures, []);
  assert.match(String(state.configHash || ''), /^[0-9a-f]{64}$/u);
});

test('execution profile validation: contradiction is rejected', async () => {
  const { evaluateExecutionProfileValidationState } = await loadModule();
  const profile = readExampleProfile();
  profile.requireScrSharedRatio = true;

  const state = evaluateExecutionProfileValidationState({ profileDoc: profile });
  assert.equal(state.ok, false);
  assert.equal(state.EXECUTION_PROFILE_VALID_OK, 0);
  assert.ok(state.failures.includes('E_EXECUTION_PROFILE_CONTRADICTION'));
});

test('execution profile validation: invalid token shape is rejected', async () => {
  const { evaluateExecutionProfileValidationState } = await loadModule();
  const profile = readExampleProfile();
  profile.requiredSets.release = [...profile.requiredSets.release, 'bad-token'];

  const state = evaluateExecutionProfileValidationState({ profileDoc: profile });
  assert.equal(state.ok, false);
  assert.equal(state.EXECUTION_PROFILE_VALID_OK, 0);
  assert.ok(state.failures.includes('E_EXECUTION_PROFILE_INVALID'));
});
