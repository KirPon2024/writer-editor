import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readCanonicalJson } from '../../scripts/ops/r24/corrective/canonical-json.mjs';

const ROOT = 'docs/OPS/R24/CORRECTIVE';
const PATHS = Object.freeze({
  admission: `${ROOT}/AUDIT_R2_C8E_HOSTED_LEASE_REPLAY_CI_RECOVERY_STAGE_ADMISSION_ATTESTATION_V1.json`,
  diagnostic: `${ROOT}/AUDIT_R2_C8E_HOSTED_LEASE_REPLAY_CI_RECOVERY_DIAGNOSTIC_EVIDENCE_V1.json`,
  instance: `${ROOT}/AUDIT_R2_C8E_HOSTED_LEASE_REPLAY_CI_RECOVERY_STAGE_INSTANCE_V1.json`,
  lab: 'test/contracts/rtk-lab01-build-bound-profiles.contract.test.js',
});
const EXPECTED = Object.freeze({
  admission: '31e06a80563c2c1e6d51e0083e484641f49b3299dc96cd799f4519ccfbff32db',
  diagnostic: '985aba4f1fdd5335f86f517f8d50ea5e5f3de601883f759efb66252135906da0',
  instance: 'a073f48f5dd5779aad4fa7b815edc11adbbca1af0663aa37ff5dd40233f1c3ea',
  nowUtc: '2026-06-15T00:00:00.000Z',
});
export function verifyDeterministicHistoricalRejoinSource(source) {
  assert.equal(typeof source, 'string');
  const start = source.indexOf("test('LAB01-16-historical-rejoin-positive'");
  const end = source.indexOf("test('LAB01-17-rung-without-evidence-blocked-on-reconciliation'", start);
  assert.ok(start >= 0 && end > start, 'LAB01-16 exact bounded source block is required');
  const block = source.slice(start, end);
  assert.ok(block.includes(`nowUtc: '${EXPECTED.nowUtc}'`), 'LAB01-16 must inject the exact within-policy UTC clock');
  assert.equal(block.includes('Date.now('), false, 'LAB01-16 must not recover through the wall clock');
  assert.equal(block.includes('new Date('), false, 'LAB01-16 must not recover through an alternate wall clock');
  return true;
}

test('CI recovery carriers bind the exact failed run, typed stale cause, and admitted successor', () => {
  const diagnostic = readCanonicalJson(PATHS.diagnostic);
  const instance = readCanonicalJson(PATHS.instance);
  const admission = readCanonicalJson(PATHS.admission);
  assert.equal(diagnostic.digest, EXPECTED.diagnostic);
  assert.equal(instance.digest, EXPECTED.instance);
  assert.equal(admission.digest, EXPECTED.admission);
  assert.equal(admission.value.status, 'ADMITTED');
  assert.equal(admission.value.stageInstanceDigest, EXPECTED.instance);
  assert.equal(diagnostic.value.candidateFailure.runId, '33282702002');
  assert.equal(diagnostic.value.candidateFailure.failedJobId, '99180450170');
  assert.equal(diagnostic.value.failure.code, 'RTK_LAB01_EVIDENCE_STALE');
  assert.deepEqual(diagnostic.value.failure.resultCounts, { fail: 1, pass: 1066, skipped: 0, tests: 1067 });
  assert.equal(diagnostic.value.recovery.injectedNowUtc, EXPECTED.nowUtc);
  assert.equal(diagnostic.value.programDoneClaimed, false);
  assert.equal(diagnostic.value.wp400MutationStarted, false);
});

test('LAB01 historical rejoin positive is deterministic and wall-clock independent', () => {
  assert.equal(verifyDeterministicHistoricalRejoinSource(fs.readFileSync(PATHS.lab, 'utf8')), true);
});

test('missing, stale, or wall-clock recovery mutations fail the CI recovery source contract', () => {
  const source = fs.readFileSync(PATHS.lab, 'utf8');
  assert.throws(() => verifyDeterministicHistoricalRejoinSource(source.replace(`    nowUtc: '${EXPECTED.nowUtc}',\n`, '')));
  assert.throws(() => verifyDeterministicHistoricalRejoinSource(source.replace(EXPECTED.nowUtc, '2026-12-01T00:00:00.000Z')));
  assert.throws(() => verifyDeterministicHistoricalRejoinSource(source.replace(`nowUtc: '${EXPECTED.nowUtc}'`, 'nowUtc: new Date().toISOString()')));
});
