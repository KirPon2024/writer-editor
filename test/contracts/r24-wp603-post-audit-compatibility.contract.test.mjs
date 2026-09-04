import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  WP603_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,
  WP604_MAIN_PRODUCT_ADMISSION_EXPECTATION,
  verifyWp603MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA = 'f603f603f603f603f603f603f603f603f603f603';
const FINAL_TREE = 'a603a603a603a603a603a603a603a603a603a603';
const HISTORICAL_CANDIDATE = WP604_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha;
const instance = JSON.parse(fs.readFileSync(E.instancePath));
const ADMITTED = [...instance.operations.modifyPaths, ...instance.operations.createPaths].sort();
const response = (value, encoding) => encoding === 'utf8' ? String(value) + '\n' : Buffer.from(String(value) + '\n');

function fakeGit({ changedPaths = ADMITTED, baseTreeDrift = false, missingArtifact = null, byteDrift = null, ancestor = true, mutateJson = null } = {}) {
  return (args, { encoding = null } = {}) => {
    if (args[0] === 'rev-parse') {
      if (args[1] === 'HEAD') return response(FINAL_SHA, encoding);
      if (args[1] === `${E.baseSha}^{tree}`) return response(baseTreeDrift ? 'b'.repeat(40) : E.baseTree, encoding);
      if (args[1] === `${FINAL_SHA}^{tree}`) return response(FINAL_TREE, encoding);
      return response(args[1], encoding);
    }
    if (args[0] === 'merge-base') {
      if (!ancestor) throw new Error('NO_ANCESTRY');
      return Buffer.alloc(0);
    }
    if (args[0] === 'diff') return response(changedPaths.join('\n'), encoding);
    if (args[0] === 'show') {
      const split = args[1].indexOf(':');
      const sha = args[1].slice(0, split);
      const file = args[1].slice(split + 1);
      if (file === missingArtifact) throw new Error('MISSING');
      let bytes = sha === E.baseSha
        ? execFileSync('git', ['show', `${E.baseSha}:${file}`], { encoding: null, maxBuffer: 32 * 1024 * 1024 })
        : execFileSync('git', ['show', `${HISTORICAL_CANDIDATE}:${file}`], { encoding: null, maxBuffer: 32 * 1024 * 1024 });
      if (mutateJson?.path === file) {
        const value = JSON.parse(bytes);
        mutateJson.apply(value);
        bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
      }
      if (file === byteDrift) bytes = Buffer.concat([bytes, Buffer.from(' ')]);
      return encoding === 'utf8' ? bytes.toString() : bytes;
    }
    throw new Error('UNEXPECTED_GIT:' + args.join(' '));
  };
}

test('WP603 candidate oracle binds the exact 45-path admission and complete protected baseline', () => {
  const result = verifyWp603MainProductPostEvaluationException({ git: fakeGit() });
  assert.equal(result.status, 'PASS');
  assert.equal(result.candidateSha, FINAL_SHA);
  assert.equal(result.candidateTree, FINAL_TREE);
  assert.equal(result.admittedPathDenominator, 45);
  assert.deepEqual(result.changedPaths, ADMITTED);
  assert.equal(result.protectedWipDenominator, 269);
  assert.equal(result.protectedDirtyDenominator, 10);
  assert.equal(result.admission.writeSetDigest, E.writeSetDigest);
});

test('WP603 rejects scope drift, base drift, non-descendants, missing artifacts and byte drift', () => {
  assert.throws(() => verifyWp603MainProductPostEvaluationException({ git: fakeGit({ changedPaths: [...ADMITTED, 'src/main.js'].sort() }) }), /E_WP603_EXACT_ADMITTED_DELTA/);
  assert.throws(() => verifyWp603MainProductPostEvaluationException({ git: fakeGit({ changedPaths: ADMITTED.slice(1) }) }), /E_WP603_EXACT_ADMITTED_DELTA/);
  assert.throws(() => verifyWp603MainProductPostEvaluationException({ git: fakeGit({ baseTreeDrift: true }) }), /E_WP603_ADMISSION_BASE/);
  assert.throws(() => verifyWp603MainProductPostEvaluationException({ git: fakeGit({ ancestor: false }) }), /E_WP603_BASE_NOT_ANCESTOR/);
  assert.throws(() => verifyWp603MainProductPostEvaluationException({ git: fakeGit({ missingArtifact: E.ownerAmendmentPath }) }), /E_WP603_CANDIDATE_ARTIFACT_MISSING/);
  assert.throws(() => verifyWp603MainProductPostEvaluationException({ git: fakeGit({ byteDrift: E.admissionPath }) }), /E_WP603_CANONICAL_LF/);
});

test('WP603 rejects a forged owner amendment and carrier-registry fallback', () => {
  assert.throws(() => verifyWp603MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: E.ownerAmendmentPath, apply: (value) => { value.ownerDecision.rawJsonlRecordSha256 = '0'.repeat(64); } } }) }), /E_WP603_SOURCE_DIGEST/);
  assert.throws(() => verifyWp603MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: 'docs/OPS/R24/CORRECTIVE/WP603_CARRIER_REGISTRY_V1.json', apply: (value) => { value.currentTreeFallbackAllowed = true; } } }) }), /E_WP603_CARRIER_DENOMINATOR/);
});
