const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/origin-smoke-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

test('origin smoke state: repository baseline is valid', async () => {
  const { evaluateOriginSmokeState } = await loadModule();
  const state = evaluateOriginSmokeState();
  assert.equal(state.ok, true);
  assert.equal(state.ORIGIN_SMOKE_OK, 1);
  assert.equal(state.code, '');
  assert.ok(String(state.details.headSha || '').length > 0);
  assert.ok(String(state.details.originMainSha || '').length > 0);
});

test('origin smoke state: unavailable origin fails with canonical code', async () => {
  const { evaluateOriginSmokeState } = await loadModule();
  const state = evaluateOriginSmokeState({
    headSha: 'a0d124127828c2b0272e58f00d3c9847705abba9',
    originMainSha: '',
    ancestorOk: false,
  });
  assert.equal(state.ok, false);
  assert.equal(state.ORIGIN_SMOKE_OK, 0);
  assert.equal(state.code, 'E_NETWORK_ORIGIN_UNAVAILABLE');
});
