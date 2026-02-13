const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/attestation-signature-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

test('attestation signature state: baseline signature is valid', async () => {
  const { evaluateAttestationSignatureState } = await loadModule();
  const state = evaluateAttestationSignatureState();
  assert.equal(state.ok, true);
  assert.equal(state.ATTESTATION_SIGNATURE_OK, 1);
  assert.equal(state.code, '');
  assert.match(String(state.details.signature || ''), /^[0-9a-f]{64}$/u);
});

test('attestation signature state: tampered signature fails with canonical code', async () => {
  const { evaluateAttestationSignatureState } = await loadModule();
  const state = evaluateAttestationSignatureState({
    signature: '0'.repeat(64),
  });
  assert.equal(state.ok, false);
  assert.equal(state.ATTESTATION_SIGNATURE_OK, 0);
  assert.equal(state.code, 'E_ATTESTATION_SIGNATURE_INVALID');
});
