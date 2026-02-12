const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/guards/check-safe-automerge-ops-only.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

test('safe automerge guard passes for ops-only diff with base main, head match and success checks', async () => {
  const { evaluateSafeAutomergeOpsOnly } = await loadModule();
  const state = evaluateSafeAutomergeOpsOnly({
    changedFiles: [
      'docs/OPERATIONS/STATUS/CODEX_DELIVERY_TEMPLATE_v1.0.md',
      'scripts/guards/check-safe-automerge-ops-only.mjs',
      'test/contracts/safe-automerge-ops-only.contract.test.js',
    ],
    baseRefName: 'main',
    headRefOid: 'abc123',
    expectedHeadSha: 'abc123',
    statusCheckRollup: [
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ],
  });

  assert.equal(state.ok, true);
  assert.equal(state.status, 'ELIGIBLE');
  assert.deepEqual(state.failures, []);
});

test('safe automerge guard triggers STOP_REQUIRED for deny/outside-allowlist diff', async () => {
  const { evaluateSafeAutomergeOpsOnly } = await loadModule();
  const state = evaluateSafeAutomergeOpsOnly({
    changedFiles: [
      'src/main/index.js',
      'docs/BIBLE.md',
    ],
    baseRefName: 'main',
    headRefOid: 'abc123',
    expectedHeadSha: 'abc123',
    statusCheckRollup: [
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ],
  });

  assert.equal(state.ok, false);
  assert.equal(state.status, 'STOP_REQUIRED');
  assert.ok(state.failures.includes('E_SAFE_AUTOMERGE_DENY_PATH_CHANGED'));
  assert.ok(state.failures.includes('E_SAFE_AUTOMERGE_DIFF_OUTSIDE_ALLOWLIST'));
});

test('safe automerge guard triggers STOP_REQUIRED for base/head/checks gate violations', async () => {
  const { evaluateSafeAutomergeOpsOnly } = await loadModule();
  const state = evaluateSafeAutomergeOpsOnly({
    changedFiles: [
      'docs/OPERATIONS/STATUS/CODEX_DELIVERY_TEMPLATE_v1.0.md',
    ],
    baseRefName: 'release',
    headRefOid: 'abc123',
    expectedHeadSha: 'def456',
    statusCheckRollup: [
      { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' },
    ],
  });

  assert.equal(state.ok, false);
  assert.equal(state.status, 'STOP_REQUIRED');
  assert.ok(state.failures.includes('E_SAFE_AUTOMERGE_BASE_NOT_MAIN'));
  assert.ok(state.failures.includes('E_SAFE_AUTOMERGE_HEAD_SHA_MISMATCH'));
  assert.ok(state.failures.includes('E_SAFE_AUTOMERGE_STATUS_CHECKS_NOT_SUCCESS'));
});
