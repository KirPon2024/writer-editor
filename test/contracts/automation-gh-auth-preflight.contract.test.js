const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

let generatorModulePromise = null;

function loadGeneratorModule() {
  if (!generatorModulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/generate-required-token-set.mjs'),
    ).href;
    generatorModulePromise = import(href);
  }
  return generatorModulePromise;
}

function readExampleProfile() {
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'docs/OPS/EXECUTION/EXECUTION_PROFILE.example.json'),
    'utf8',
  );
  return JSON.parse(raw);
}

test('automation gh auth preflight: PR_MODE_CLI=true adds AUTOMATION_GH_AUTH_OK to active required set', async () => {
  const { buildRequiredTokenSetFromProfile } = await loadGeneratorModule();
  const profile = readExampleProfile();
  profile.profile = 'pr';
  profile.gateTier = 'core';
  profile.headStrictEnforced = false;
  profile.scopeFlags.PR_MODE_CLI = true;

  const state = buildRequiredTokenSetFromProfile(profile);
  assert.equal(state.ok, true);
  assert.ok(state.requiredTokenSet.requiredSets.active.includes('AUTOMATION_GH_AUTH_OK'));
});

test('automation gh auth preflight: PR_MODE_CLI=false excludes AUTOMATION_GH_AUTH_OK from active required set', async () => {
  const { buildRequiredTokenSetFromProfile } = await loadGeneratorModule();
  const profile = readExampleProfile();
  profile.profile = 'pr';
  profile.gateTier = 'core';
  profile.headStrictEnforced = false;
  profile.scopeFlags.PR_MODE_CLI = false;

  const state = buildRequiredTokenSetFromProfile(profile);
  assert.equal(state.ok, true);
  assert.equal(state.requiredTokenSet.requiredSets.active.includes('AUTOMATION_GH_AUTH_OK'), false);
});

test('automation gh auth preflight proofHook: simulation mode returns stable json success payload', () => {
  const scriptPath = path.join(process.cwd(), 'scripts/ops/automation-gh-auth-state.mjs');
  const run = spawnSync(process.execPath, [scriptPath, '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AUTOMATION_GH_AUTH_SIMULATE: '1',
      AUTOMATION_GH_AUTH_SIMULATE_OK: '1',
    },
  });

  assert.equal(run.status, 0);
  const payload = JSON.parse(String(run.stdout || '{}'));
  assert.equal(payload.ok, true);
  assert.equal(payload.tokens.AUTOMATION_GH_AUTH_OK, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'fails'), false);
});
