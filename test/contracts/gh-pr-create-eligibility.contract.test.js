const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const profilePath = path.join(process.cwd(), 'docs', 'OPERATIONS', 'STATUS', 'CODEX_GH_PR_CREATE_PROFILE.json');
let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(path.join(process.cwd(), 'scripts/guards/check-gh-pr-create-eligibility.mjs')).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

test('gh pr create profile schema is present and contains required policy fields', () => {
  assert.equal(fs.existsSync(profilePath), true, 'profile file must exist');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  assert.equal(profile.policyVersion, 'v1.0');
  assert.equal(profile.hostname, 'github.com');
  assert.deepEqual(profile.allowedOps, ['pr_create_only']);
  assert.deepEqual(profile.repoAllowlist, ['KirPon2024/writer-editor']);
  assert.ok(Array.isArray(profile.denyOps));
  assert.equal(profile.denyOps.includes('pr_merge'), true);
  assert.equal(profile.denyOps.includes('pr_close'), true);
  assert.equal(profile.denyOps.includes('repo_admin'), true);
  assert.equal(typeof profile.verifiedBy, 'string');
  assert.equal(typeof profile.verifiedAt, 'string');
});

test('denyOps are enforced and missing deny operations block eligibility', async () => {
  const { evaluateGhPrCreateEligibility } = await loadModule();
  const state = evaluateGhPrCreateEligibility({
    profile: {
      policyVersion: 'v1.0',
      allowedOps: ['pr_create_only'],
      repoAllowlist: ['KirPon2024/writer-editor'],
      hostname: 'github.com',
      denyOps: ['pr_merge'],
      verifiedBy: 'TEST',
      verifiedAt: '2026-02-12T00:00:00Z',
    },
    repoProbe: {
      repo: 'KirPon2024/writer-editor',
    },
    checks: {
      auth: { ok: true, exitCode: 0 },
      rateLimit: { ok: true, exitCode: 0, http403: false, unreachable: false },
    },
  });

  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_GH_POLICY_DENY_OPS_INVALID'));
});

test('eligibility evaluation is deterministic for identical input', async () => {
  const { evaluateGhPrCreateEligibility } = await loadModule();
  const input = {
    profile: {
      policyVersion: 'v1.0',
      allowedOps: ['pr_create_only'],
      repoAllowlist: ['KirPon2024/writer-editor'],
      hostname: 'github.com',
      denyOps: ['pr_close', 'pr_merge', 'repo_admin'],
      verifiedBy: 'TEST',
      verifiedAt: '2026-02-12T00:00:00Z',
    },
    repoProbe: {
      repo: 'KirPon2024/writer-editor',
    },
    checks: {
      auth: { ok: true, exitCode: 0 },
      rateLimit: { ok: true, exitCode: 0, http403: false, unreachable: false },
    },
  };
  const first = evaluateGhPrCreateEligibility(input);
  const second = evaluateGhPrCreateEligibility(input);
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.status, 'ELIGIBLE');
});

test('failure codes are typed, sorted and include auth/network/repo blockers', async () => {
  const { evaluateGhPrCreateEligibility } = await loadModule();
  const state = evaluateGhPrCreateEligibility({
    profile: {
      policyVersion: 'v1.0',
      allowedOps: ['pr_create_only'],
      repoAllowlist: ['KirPon2024/writer-editor'],
      hostname: 'github.com',
      denyOps: ['pr_close', 'pr_merge', 'repo_admin'],
      verifiedBy: 'TEST',
      verifiedAt: '2026-02-12T00:00:00Z',
    },
    repoProbe: {
      repo: 'ElseOrg/else-repo',
    },
    checks: {
      auth: { ok: false, exitCode: 1 },
      rateLimit: { ok: false, exitCode: 1, http403: true, unreachable: false },
    },
  });

  assert.equal(state.ok, false);
  assert.deepEqual(state.failures, [...state.failures].sort());
  assert.ok(state.failures.includes('E_GH_AUTH_STATUS_INVALID'));
  assert.ok(state.failures.includes('E_GH_TOKEN_403_FORBIDDEN'));
  assert.ok(state.failures.includes('E_GH_REPO_NOT_ALLOWLISTED'));
  for (const code of state.failures) {
    assert.match(code, /^E_[A-Z0-9_]+$/u);
  }
});

test('unreachable api without 403 maps to deterministic unreachable failure code', async () => {
  const { evaluateGhPrCreateEligibility } = await loadModule();
  const state = evaluateGhPrCreateEligibility({
    profile: {
      policyVersion: 'v1.0',
      allowedOps: ['pr_create_only'],
      repoAllowlist: ['KirPon2024/writer-editor'],
      hostname: 'github.com',
      denyOps: ['pr_close', 'pr_merge', 'repo_admin'],
      verifiedBy: 'TEST',
      verifiedAt: '2026-02-12T00:00:00Z',
    },
    repoProbe: {
      repo: 'KirPon2024/writer-editor',
    },
    checks: {
      auth: { ok: true, exitCode: 0 },
      rateLimit: { ok: false, exitCode: 1, http403: false, unreachable: true },
    },
  });

  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_GH_API_UNREACHABLE'));
});
