import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import {
  loadHostedC8EInputs,
  verifyHostedC8E,
} from '../../scripts/ops/r24/corrective/audit-r2-c8e-hosted-lease-replay.mjs';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const SHA = process.env.AUDIT_R2_EVALUATION_SHA || '1'.repeat(40);
const TREE = process.env.AUDIT_R2_EVALUATION_TREE_SHA || '2'.repeat(40);
const gitResolve = (args) => {
  const target = args.at(-1);
  if (target === 'HEAD') return SHA;
  if (target === 'HEAD^{tree}') return TREE;
  if (target.endsWith('^{tree}')) return 'a0cd27dc14381c0c93f0c8fc5961814c8f77ae91';
  throw new Error(`unexpected git resolve ${args.join(' ')}`);
};
const verify = (overrides = {}) => verifyHostedC8E({ evaluationSha: SHA, evaluationTreeSha: TREE, root: repoRoot, gitResolve, ...overrides });

test('C8E hosted successor verifies immutable ledger and historical package evidence at exact head', () => {
  const result = verify();
  assert.equal(result.status, 'PASS');
  assert.equal(result.highestEffectiveFencingCounter, 54);
  assert.equal(result.profileVerdict, 'NOT_READY');
  assert.equal(result.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.ephemeralLocalAuthorityRequired, false);
  assert.equal(result.programDoneClaimed, false);
  assert.equal(result.wp400MutationStarted, false);
});

test('missing, mutated, or arbitrary ledger bytes, digests, events, and counters fail closed', () => {
  assert.throws(() => verify({ inputs: { ...loadHostedC8EInputs(repoRoot), ledger: null } }));
  for (const mutate of [
    (value) => { value.ledger.digest = '0'.repeat(64); },
    (value) => { value.ledger.value.highestEffectiveFencingCounter = 55; value.ledger.bytes = canonicalBytes(value.ledger.value); value.ledger.digest = '94808bcdb9d31e5183cc4e4138eb953f685925d9e0965039d048fca4a7d7257f'; },
    (value) => { value.ledger.value.events[1].payload.fencingCounter = 55; },
    (value) => { value.currentInstance.value.leaseBinding.fenceEventDigest = '0'.repeat(64); },
    (value) => { value.currentAdmission.value.fencingCounter = 53; },
  ]) {
    const candidate = loadHostedC8EInputs(repoRoot);
    mutate(candidate);
    assert.throws(() => verify({ inputs: candidate }));
  }
});

test('stale SHA or tree and mutated current admission fail closed', () => {
  assert.throws(() => verifyHostedC8E({ evaluationSha: '3'.repeat(40), evaluationTreeSha: TREE, root: repoRoot, gitResolve }));
  const inputs = loadHostedC8EInputs(repoRoot);
  inputs.currentAdmission.digest = '0'.repeat(64);
  assert.throws(() => verify({ inputs }));
});

test('missing or mutated historical C8E carriers and source bytes fail closed', () => {
  for (const mutate of [
    (value) => { value.historicalContract.digest = '0'.repeat(64); },
    (value) => { value.historicalEvidence.value.observations.compiler.programVerdict = 'PASS'; },
    (value) => { value.historicalScriptBytes = Buffer.from('mutated'); },
    (value) => { value.historicalTestBytes = Buffer.from('mutated'); },
  ]) {
    const candidate = loadHostedC8EInputs(repoRoot);
    mutate(candidate);
    assert.throws(() => verify({ inputs: candidate }));
  }
});

test('release, signing, notarization, or Program DONE promotion fails closed', () => {
  for (const mutate of [
    (value) => { value.historicalContract.value.claimCeiling.productionReleaseReady = true; },
    (value) => { value.historicalContract.value.claimCeiling.programDone = true; },
    (value) => { value.historicalEvidence.value.observations.safety.signing = true; },
    (value) => { value.historicalEvidence.value.observations.safety.notarization = true; },
  ]) {
    const candidate = loadHostedC8EInputs(repoRoot);
    mutate(candidate);
    assert.throws(() => verify({ inputs: candidate }));
  }
});

test('successor source never reads ephemeral local lease or fence files as authority', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/ops/r24/corrective/audit-r2-c8e-hosted-lease-replay.mjs'), 'utf8');
  assert.equal(/readFileSync\(LOCAL_(?:LEASE|FENCE)\)/u.test(source), false);
  assert.match(source, /validateLedger/u);
  assert.match(source, /highestEffectiveFencingCounter/u);
});
