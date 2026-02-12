const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PROFILE_PATH = path.join(
  process.cwd(),
  'docs/OPERATIONS/STATUS/SAFE_AUTOMERGE_OPS_ONLY_PROFILE.json',
);

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/guards/check-safe-automerge-eligibility.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

function evaluateWithFiles(evaluateSafeAutomergeEligibility, changedFiles, extra = {}) {
  return evaluateSafeAutomergeEligibility({
    apiUnavailable: false,
    prNotFound: false,
    base: 'main',
    headSha: 'abc123',
    expectedHeadSha: 'abc123',
    rollup: 'SUCCESS',
    changedFiles,
    mergeMethod: 'merge',
    admin: false,
    squash: false,
    rebase: false,
    ...extra,
  });
}

test('ops-only profile SoT has required schema and lock values', () => {
  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.mergeMethod, 'merge_only');
  assert.equal(profile.requiredRollup, 'SUCCESS');
  assert.equal(profile.baseBranch, 'main');
  assert.deepEqual(profile.denyPathGlobs, ['src/**', '.github/**']);
  assert.deepEqual(profile.allowedPathGlobs, [
    'docs/OPS/**',
    'scripts/ops/**',
    'scripts/doctor.mjs',
    'test/contracts/**',
    'docs/OPERATIONS/**',
    'scripts/guards/**',
  ]);
});

test('eligibility passes for SoT allowlist paths only', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateWithFiles(
    evaluateSafeAutomergeEligibility,
    [
      'docs/OPS/CLAIMS/CRITICAL_CLAIM_MATRIX.json',
      'scripts/ops/check-merge-readiness.mjs',
      'scripts/doctor.mjs',
      'test/contracts/safe-automerge-ops-only-profile.contract.test.js',
      'docs/OPERATIONS/STATUS/CODEX_DELIVERY_TEMPLATE_v1.0.md',
      'scripts/guards/check-safe-automerge-eligibility.mjs',
    ],
  );
  assert.equal(state.ok, true);
  assert.equal(state.details.opsOnlyOk, true);
  assert.deepEqual(state.failures, []);
});

test('eligibility fails for src path', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateWithFiles(evaluateSafeAutomergeEligibility, ['src/main.js']);
  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_DIFF_NOT_OPS_ONLY'));
});

test('eligibility fails for .github path', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateWithFiles(evaluateSafeAutomergeEligibility, ['.github/workflows/ci.yml']);
  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_DIFF_NOT_OPS_ONLY'));
});

test('eligibility fails for unexpected path', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateWithFiles(evaluateSafeAutomergeEligibility, ['README.md']);
  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_DIFF_NOT_OPS_ONLY'));
});

test('eligibility reads profile SoT from file path (drift guard)', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-automerge-profile-'));
  const tempProfilePath = path.join(tempDir, 'SAFE_AUTOMERGE_OPS_ONLY_PROFILE.json');
  fs.writeFileSync(tempProfilePath, JSON.stringify({
    schemaVersion: 1,
    allowedPathGlobs: ['docs/OPERATIONS/**'],
    denyPathGlobs: ['src/**', '.github/**'],
    mergeMethod: 'merge_only',
    requiredRollup: 'SUCCESS',
    baseBranch: 'main',
  }, null, 2));

  const state = evaluateWithFiles(
    evaluateSafeAutomergeEligibility,
    ['scripts/ops/check-merge-readiness.mjs'],
    { profilePath: tempProfilePath },
  );
  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_DIFF_NOT_OPS_ONLY'));
  assert.deepEqual(state.details.opsOnlyOutsideAllowlist, ['scripts/ops/check-merge-readiness.mjs']);
});
