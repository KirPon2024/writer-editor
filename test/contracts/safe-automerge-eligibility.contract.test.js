const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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

test('eligibility blocks when base is not main', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateSafeAutomergeEligibility({
    apiUnavailable: false,
    prNotFound: false,
    base: 'release',
    headSha: 'abc123',
    expectedHeadSha: 'abc123',
    rollup: 'SUCCESS',
    changedFiles: ['scripts/guards/check-safe-automerge-eligibility.mjs'],
    mergeMethod: 'merge',
    admin: false,
    squash: false,
    rebase: false,
  });

  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_BASE_BRANCH_NOT_MAIN'));
});

test('eligibility blocks when head sha mismatches expected', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateSafeAutomergeEligibility({
    apiUnavailable: false,
    prNotFound: false,
    base: 'main',
    headSha: 'abc123',
    expectedHeadSha: 'def456',
    rollup: 'SUCCESS',
    changedFiles: ['test/contracts/safe-automerge-eligibility.contract.test.js'],
    mergeMethod: 'merge',
    admin: false,
    squash: false,
    rebase: false,
  });

  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_HEAD_SHA_MISMATCH'));
});

test('eligibility blocks when status checks are not success', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateSafeAutomergeEligibility({
    apiUnavailable: false,
    prNotFound: false,
    base: 'main',
    headSha: 'abc123',
    expectedHeadSha: 'abc123',
    rollup: 'PENDING',
    changedFiles: ['docs/OPERATIONS/STATUS/CODEX_DELIVERY_TEMPLATE_v1.0.md'],
    mergeMethod: 'merge',
    admin: false,
    squash: false,
    rebase: false,
  });

  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_STATUS_CHECKS_NOT_SUCCESS'));
});

test('eligibility blocks when non-ops file is present in PR diff', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateSafeAutomergeEligibility({
    apiUnavailable: false,
    prNotFound: false,
    base: 'main',
    headSha: 'abc123',
    expectedHeadSha: 'abc123',
    rollup: 'SUCCESS',
    changedFiles: ['src/main/index.js'],
    mergeMethod: 'merge',
    admin: false,
    squash: false,
    rebase: false,
  });

  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_DIFF_NOT_OPS_ONLY'));
  assert.equal(state.details.opsOnlyOk, false);
});

test('eligibility accepts ops-only diff paths from expanded allowlist', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateSafeAutomergeEligibility({
    apiUnavailable: false,
    prNotFound: false,
    base: 'main',
    headSha: 'abc123',
    expectedHeadSha: 'abc123',
    rollup: 'SUCCESS',
    changedFiles: [
      'docs/OPS/CLAIMS/CRITICAL_CLAIM_MATRIX.json',
      'scripts/ops/check-merge-readiness.mjs',
      'scripts/doctor.mjs',
      'test/contracts/safe-automerge-eligibility.contract.test.js',
      'docs/OPERATIONS/STATUS/CODEX_DELIVERY_TEMPLATE_v1.0.md',
      'scripts/guards/check-safe-automerge-eligibility.mjs',
    ],
    mergeMethod: 'merge',
    admin: false,
    squash: false,
    rebase: false,
  });

  assert.equal(state.ok, true);
  assert.equal(state.details.opsOnlyOk, true);
  assert.deepEqual(state.failures, []);
});

test('eligibility blocks when .github path is present in PR diff', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateSafeAutomergeEligibility({
    apiUnavailable: false,
    prNotFound: false,
    base: 'main',
    headSha: 'abc123',
    expectedHeadSha: 'abc123',
    rollup: 'SUCCESS',
    changedFiles: ['.github/workflows/ci.yml'],
    mergeMethod: 'merge',
    admin: false,
    squash: false,
    rebase: false,
  });

  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_DIFF_NOT_OPS_ONLY'));
  assert.equal(state.details.opsOnlyOk, false);
});

test('eligibility blocks when unexpected path is present in PR diff', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateSafeAutomergeEligibility({
    apiUnavailable: false,
    prNotFound: false,
    base: 'main',
    headSha: 'abc123',
    expectedHeadSha: 'abc123',
    rollup: 'SUCCESS',
    changedFiles: ['README.md'],
    mergeMethod: 'merge',
    admin: false,
    squash: false,
    rebase: false,
  });

  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_DIFF_NOT_OPS_ONLY'));
  assert.equal(state.details.opsOnlyOk, false);
});

test('eligibility failure list is deterministic and sorted', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const input = {
    apiUnavailable: false,
    prNotFound: false,
    base: 'dev',
    headSha: 'aaa',
    expectedHeadSha: 'bbb',
    rollup: 'FAILURE',
    changedFiles: ['src/main/index.js'],
    mergeMethod: 'squash',
    admin: false,
    squash: true,
    rebase: false,
  };
  const first = evaluateSafeAutomergeEligibility(input);
  const second = evaluateSafeAutomergeEligibility(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first.failures, [...first.failures].sort());
});

test('api unavailable maps to deterministic STOP-style failure code', async () => {
  const { evaluateSafeAutomergeEligibility } = await loadModule();
  const state = evaluateSafeAutomergeEligibility({
    apiUnavailable: true,
    prNotFound: false,
    base: 'main',
    headSha: 'abc123',
    expectedHeadSha: 'abc123',
    rollup: 'SUCCESS',
    changedFiles: ['scripts/guards/check-safe-automerge-eligibility.mjs'],
    mergeMethod: 'merge',
    admin: false,
    squash: false,
    rebase: false,
  });

  assert.equal(state.ok, false);
  assert.ok(state.failures.includes('E_GH_API_UNAVAILABLE'));
});
