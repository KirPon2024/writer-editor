const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/head-strict-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

test('head strict state: repository baseline passes in release mode', async () => {
  const { evaluateHeadStrictState } = await loadModule();
  const state = evaluateHeadStrictState({ mode: 'release' });
  assert.equal(state.ok, 1);
  assert.equal(state.HEAD_STRICT_OK, 1);
  assert.equal(state.code, '');
  assert.equal(state.failReason, '');
  assert.equal(state.details.remoteUnavailableDetected, 0);
});

test('head strict state: non-merge head fails in release mode', async () => {
  const { evaluateHeadStrictState } = await loadModule();
  const state = evaluateHeadStrictState({
    mode: 'release',
    headSha: 'c32d70e7d1a42585a4a38ebd8e47e32425bf0bba',
    originMainSha: 'c32d70e7d1a42585a4a38ebd8e47e32425bf0bba',
    headResolved: true,
    originResolved: true,
    originAncestorOfHead: true,
    headParentCount: 1,
    shaLockValid: true,
    remoteUnavailableDetected: false,
  });
  assert.equal(state.ok, 0);
  assert.equal(state.HEAD_STRICT_OK, 0);
  assert.equal(state.code, 'E_HEAD_BINDING_INVALID');
});

test('head strict state: remote unavailable fails with canonical binding code', async () => {
  const { evaluateHeadStrictState } = await loadModule();
  const state = evaluateHeadStrictState({
    mode: 'release',
    headSha: 'c32d70e7d1a42585a4a38ebd8e47e32425bf0bba',
    originMainSha: '',
    headResolved: true,
    originResolved: false,
    originAncestorOfHead: false,
    headParentCount: 2,
    shaLockValid: false,
    remoteUnavailableDetected: true,
  });
  assert.equal(state.ok, 0);
  assert.equal(state.HEAD_STRICT_OK, 0);
  assert.equal(state.code, 'E_HEAD_BINDING_INVALID');
  assert.equal(state.details.remoteUnavailableCode, 'E_REMOTE_UNAVAILABLE');
});
