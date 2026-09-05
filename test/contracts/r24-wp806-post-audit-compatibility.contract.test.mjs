import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  WP806_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,
  verifyWp806MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA = 'f806f806f806f806f806f806f806f806f806f806';
const FINAL_TREE = 'a806a806a806a806a806a806a806a806a806a806';
const instance = JSON.parse(fs.readFileSync(E.instancePath));
const ADMITTED = [...instance.operations.modifyPaths, ...instance.operations.createPaths].sort();
const response = (value, encoding) => encoding === 'utf8' ? `${value}\n` : Buffer.from(`${value}\n`);

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
        : fs.readFileSync(file);
      if (mutateJson?.path === file) {
        const value = JSON.parse(bytes);
        mutateJson.apply(value);
        bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
      }
      if (file === byteDrift) bytes = Buffer.concat([bytes, Buffer.from(' ')]);
      return encoding === 'utf8' ? bytes.toString() : bytes;
    }
    throw new Error(`UNEXPECTED_GIT:${args.join(' ')}`);
  };
}

test('WP806 candidate oracle binds the exact 45-path admission and protected baseline', () => {
  const result = verifyWp806MainProductPostEvaluationException({ git: fakeGit() });
  assert.equal(result.status, 'PASS');
  assert.equal(result.candidateSha, FINAL_SHA);
  assert.equal(result.candidateTree, FINAL_TREE);
  assert.equal(result.admittedPathDenominator, 45);
  assert.deepEqual(result.changedPaths, ADMITTED);
  assert.equal(result.protectedWipDenominator, 295);
  assert.equal(result.protectedDirtyDenominator, 11);
  assert.equal(result.admission.writeSetDigest, E.writeSetDigest);
  assert.equal(result.admission.ownerAuthorityBindingDigest, E.ownerAuthorityBindingDigest);
});

test('WP806 candidate oracle rejects scope, base, ancestry, missing artifact and byte drift', () => {
  assert.throws(() => verifyWp806MainProductPostEvaluationException({ git: fakeGit({ changedPaths: [...ADMITTED, 'src/forbidden-wp806.mjs'].sort() }) }), /E_WP806_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp806MainProductPostEvaluationException({ git: fakeGit({ changedPaths: ADMITTED.slice(1) }) }), /E_WP806_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp806MainProductPostEvaluationException({ git: fakeGit({ baseTreeDrift: true }) }), /E_WP806_ADMISSION_BASE/u);
  assert.throws(() => verifyWp806MainProductPostEvaluationException({ git: fakeGit({ ancestor: false }) }), /E_WP806_BASE_NOT_ANCESTOR/u);
  assert.throws(() => verifyWp806MainProductPostEvaluationException({ git: fakeGit({ missingArtifact: E.instancePath }) }), /E_WP806_CANDIDATE_ARTIFACT_MISSING/u);
  assert.throws(() => verifyWp806MainProductPostEvaluationException({ git: fakeGit({ byteDrift: E.admissionPath }) }), /E_WP806_CANONICAL_LF/u);
});

test('WP806 candidate oracle rejects forged lease, owner binding and carrier fallback', () => {
  assert.throws(() => verifyWp806MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: E.instancePath, apply: value => { value.lease.wip = 0; } } }) }), /E_WP806_ADMISSION_CARRIER_DIGEST/u);
  assert.throws(() => verifyWp806MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: E.authorityPath, apply: value => { value.ownerAuthorityBindingDigest = '0'.repeat(64); } } }) }), /E_WP806_ADMISSION_CARRIER_DIGEST/u);
  assert.throws(() => verifyWp806MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: 'docs/OPS/R24/CORRECTIVE/WP806_CARRIER_REGISTRY_V1.json', apply: value => { value.currentTreeFallbackAllowed = true; } } }) }), /E_WP806_CARRIER_DENOMINATOR/u);
});

test('WP806 routing pins the WP805 oracle to the immutable WP806 base', () => {
  const source = fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs', 'utf8');
  assert.match(source, /verifyWp805MainProductPostEvaluationException\(\{candidateSha:wp806Enabled\?WP806_MAIN_PRODUCT_ADMISSION_EXPECTATION\.baseSha:resolvedCandidate,git\}\)/u);
});
