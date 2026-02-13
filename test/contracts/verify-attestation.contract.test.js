const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/verify-attestation-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

test('verify attestation state: baseline attestation is valid', async () => {
  const { evaluateVerifyAttestationState } = await loadModule();
  const state = evaluateVerifyAttestationState();
  assert.equal(state.ok, true);
  assert.equal(state.VERIFY_ATTESTATION_OK, 1);
  assert.equal(state.code, '');
  assert.equal(state.details.attestationKind, 'POST_MERGE_VERIFY');
});

test('verify attestation state: malformed attestation fails with canonical code', async () => {
  const { evaluateVerifyAttestationState } = await loadModule();
  const state = evaluateVerifyAttestationState({
    attestationState: {
      POST_MERGE_VERIFY_ATTESTATION_EMITTED: 0,
      attestationKind: '',
      taskId: '',
      verifyPath: '',
      verifyOk: 0,
    },
  });
  assert.equal(state.ok, false);
  assert.equal(state.VERIFY_ATTESTATION_OK, 0);
  assert.equal(state.code, 'E_VERIFY_ATTESTATION_INVALID');
});
