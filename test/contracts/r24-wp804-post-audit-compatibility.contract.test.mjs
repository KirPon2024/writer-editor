import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  WP804_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,
  WP805_MAIN_PRODUCT_ADMISSION_EXPECTATION,
  verifyWp804MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA = 'f804f804f804f804f804f804f804f804f804f804';
const FINAL_TREE = 'a804a804a804a804a804a804a804a804a804a804';
const WP804_MERGE_SHA = '22a12573e3539c5f91064cc6db90c0a1c47cbaa1';
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
      let bytes = execFileSync('git', ['show', `${sha === E.baseSha ? E.baseSha : WP804_MERGE_SHA}:${file}`],
        { encoding: null, maxBuffer: 32 * 1024 * 1024 });
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

test('WP804 candidate oracle binds the exact 41-path admission, owner decision and protected baseline', () => {
  const result = verifyWp804MainProductPostEvaluationException({ git: fakeGit() });
  assert.equal(result.status, 'PASS');
  assert.equal(result.candidateSha, FINAL_SHA);
  assert.equal(result.candidateTree, FINAL_TREE);
  assert.equal(result.admittedPathDenominator, 41);
  assert.deepEqual(result.changedPaths, ADMITTED);
  assert.equal(result.protectedWipDenominator, 290);
  assert.equal(result.protectedDirtyDenominator, 10);
  assert.equal(result.admission.writeSetDigest, E.writeSetDigest);
  assert.equal(result.admission.ownerDecisionDigest, E.ownerDecisionDigest);
});

test('WP804 candidate oracle rejects scope, base, ancestry, missing-artifact and byte drift', () => {
  assert.throws(() => verifyWp804MainProductPostEvaluationException({ git: fakeGit({ changedPaths: [...ADMITTED, 'src/main.js'].sort() }) }), /E_WP804_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp804MainProductPostEvaluationException({ git: fakeGit({ changedPaths: ADMITTED.slice(1) }) }), /E_WP804_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp804MainProductPostEvaluationException({ git: fakeGit({ baseTreeDrift: true }) }), /E_WP804_ADMISSION_BASE/u);
  assert.throws(() => verifyWp804MainProductPostEvaluationException({ git: fakeGit({ ancestor: false }) }), /E_WP804_BASE_NOT_ANCESTOR/u);
  assert.throws(() => verifyWp804MainProductPostEvaluationException({ git: fakeGit({ missingArtifact: E.instancePath }) }), /E_WP804_CANDIDATE_ARTIFACT_MISSING/u);
  assert.throws(() => verifyWp804MainProductPostEvaluationException({ git: fakeGit({ byteDrift: E.admissionPath }) }), /E_WP804_CANONICAL_LF/u);
});

test('WP804 candidate oracle rejects forged lease, owner policy and carrier fallback', () => {
  assert.throws(() => verifyWp804MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: E.instancePath, apply: value => { value.lease.wip = 0; } } }) }), /E_WP804_ADMISSION_CARRIER_DIGEST/u);
  assert.throws(() => verifyWp804MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: E.ownerDecisionPath, apply: value => { value.authorizedScope.automaticCleanup = true; } } }) }), /E_WP804_ADMISSION_CARRIER_DIGEST/u);
  assert.throws(() => verifyWp804MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: 'docs/OPS/R24/CORRECTIVE/WP804_CARRIER_REGISTRY_V1.json', apply: value => { value.currentTreeFallbackAllowed = true; } } }) }), /E_WP804_CARRIER_DENOMINATOR/u);
});

test('WP804 routing pins the WP803 oracle to the immutable WP804 base', () => {
  const source = fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs', 'utf8');
  assert.match(source, /verifyWp803MainProductPostEvaluationException\(\{candidateSha:wp804Enabled\?WP804_MAIN_PRODUCT_ADMISSION_EXPECTATION\.baseSha:resolvedCandidate,git\}\)/u);
});

test('WP804 exposes the admitted WP805 successor at its exact terminal merge', () => {
  assert.equal(WP805_MAIN_PRODUCT_ADMISSION_EXPECTATION.baseSha, '22a12573e3539c5f91064cc6db90c0a1c47cbaa1');
  assert.equal(WP805_MAIN_PRODUCT_ADMISSION_EXPECTATION.predecessorReleaseDigest, '610ba880eb36af11305d66e56f62e152dcd3104591a6cb12297cc347c60f84a9');
});
