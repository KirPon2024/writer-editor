const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/emit-post-merge-verify-attestation.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

function buildPassingSteps() {
  return Array.from({ length: 13 }, (_, index) => ({
    id: `STEP_${String(index + 1).padStart(2, '0')}`,
    exitCode: 0,
    keyLines: [],
  }));
}

test('post-merge verify attestation exposes required schema fields', async () => {
  const { evaluatePostMergeVerifyAttestation } = await loadModule();
  const sha = '741716c0c12857a1528710ff20e9da6c958bc01f';
  const report = evaluatePostMergeVerifyAttestation({
    expectedMergeSha: sha,
    originSmoke: { ok: true, lsRemoteOk: true, fetchOk: true, failReason: '' },
    steps: buildPassingSteps(),
    headSha: sha,
    originMainSha: sha,
    promptDetection: 'NOT_DETECTED',
    timestampIso: '2026-02-12T00:00:00.000Z',
  });

  assert.equal(typeof report, 'object');
  assert.equal(report.schemaVersion, 'post-merge-strict-verify-attestation.v1');
  assert.equal(report.expectedMergeSha, sha);
  assert.equal(typeof report.equalityOk, 'boolean');
  assert.equal(Array.isArray(report.steps), true);
  assert.equal(report.steps.length, 13);
  assert.equal(typeof report.originSmoke, 'object');
  assert.equal(report.verifyAttestationOk, true);
});

test('post-merge verify attestation marks mismatch when head differs from expected merge sha', async () => {
  const { evaluatePostMergeVerifyAttestation } = await loadModule();
  const report = evaluatePostMergeVerifyAttestation({
    expectedMergeSha: '741716c0c12857a1528710ff20e9da6c958bc01f',
    originSmoke: { ok: true, lsRemoteOk: true, fetchOk: true, failReason: '' },
    steps: buildPassingSteps(),
    headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    originMainSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    promptDetection: 'NOT_DETECTED',
    timestampIso: '2026-02-12T00:00:00.000Z',
  });

  assert.equal(report.equalityOk, false);
  assert.equal(report.verifyAttestationOk, false);
  assert.ok(report.failures.includes('MERGE_SHA_MISMATCH'));
});
