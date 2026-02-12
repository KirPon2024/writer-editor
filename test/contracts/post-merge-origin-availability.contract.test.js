const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/guards/check-post-merge-origin-availability.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

test('post-merge origin availability passes on happy-path fixture', async () => {
  const { evaluatePostMergeOriginAvailability } = await loadModule();
  const state = evaluatePostMergeOriginAvailability({
    fetchOrigin: { status: 0, stdout: '', stderr: '' },
    lsRemoteOrigin: { status: 0, stdout: '71162026\tHEAD', stderr: '' },
    originMainReadable: { status: 0, stdout: '71162026', stderr: '' },
  });

  assert.equal(state.ok, true);
  assert.equal(state.stopRequired, 0);
  assert.equal(state.failReason, '');
  assert.deepEqual(state.failures, []);
  assert.deepEqual(state.failedChecks, []);
});

test('post-merge origin availability stops on DNS failure fixture', async () => {
  const { evaluatePostMergeOriginAvailability } = await loadModule();
  const state = evaluatePostMergeOriginAvailability({
    fetchOrigin: { status: 128, stdout: '', stderr: 'Could not resolve host: github.com' },
    lsRemoteOrigin: { status: 128, stdout: '', stderr: 'Could not resolve host: github.com' },
    originMainReadable: { status: 1, stdout: '', stderr: "unknown revision 'origin/main'" },
  });

  assert.equal(state.ok, false);
  assert.equal(state.stopRequired, 1);
  assert.equal(state.failReason, 'NETWORK_ORIGIN_UNAVAILABLE');
  assert.ok(state.failures.includes('E_NETWORK_ORIGIN_UNAVAILABLE'));
  assert.deepEqual(state.failedChecks, ['fetchOrigin', 'lsRemoteOrigin', 'originMainReadable']);
});
