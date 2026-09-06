import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  WP706_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,
  verifyWp706MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA = 'f3'.repeat(20);
const FINAL_TREE = 'a3'.repeat(20);
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

test('WP706 candidate oracle binds the exact 37-path admission and protected baseline', () => {
  const result = verifyWp706MainProductPostEvaluationException({ git: fakeGit() });
  assert.equal(result.status, 'PASS');
  assert.equal(result.candidateSha, FINAL_SHA);
  assert.equal(result.candidateTree, FINAL_TREE);
  assert.equal(result.admittedPathDenominator, 37);
  assert.deepEqual(result.changedPaths, ADMITTED);
  assert.equal(result.protectedWipDenominator, 302);
  assert.equal(result.protectedDirtyDenominator, 11);
  assert.equal(result.profileVerdict, 'BLOCKED');
  assert.equal(result.freshProviderExecutionByWp706, false);
  assert.equal(result.programDone, false);
  assert.equal(result.admission.writeSetDigest, E.writeSetDigest);
});

test('WP706 candidate oracle rejects scope, base, ancestry, missing artifact and byte drift', () => {
  assert.throws(() => verifyWp706MainProductPostEvaluationException({ git: fakeGit({ changedPaths: [...ADMITTED, 'src/forbidden-wp706.mjs'].sort() }) }), /E_WP706_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp706MainProductPostEvaluationException({ git: fakeGit({ changedPaths: ADMITTED.slice(1) }) }), /E_WP706_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp706MainProductPostEvaluationException({ git: fakeGit({ baseTreeDrift: true }) }), /E_WP706_ADMISSION_BASE/u);
  assert.throws(() => verifyWp706MainProductPostEvaluationException({ git: fakeGit({ ancestor: false }) }), /E_WP706_BASE_NOT_ANCESTOR/u);
  assert.throws(() => verifyWp706MainProductPostEvaluationException({ git: fakeGit({ missingArtifact: E.instancePath }) }), /E_WP706_CANDIDATE_ARTIFACT_MISSING/u);
  assert.throws(() => verifyWp706MainProductPostEvaluationException({ git: fakeGit({ byteDrift: E.admissionPath }) }), /E_WP706_CANONICAL_LF/u);
});

test('WP706 candidate oracle rejects forged admission, carrier fallback and false Word PASS', () => {
  assert.throws(() => verifyWp706MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: E.instancePath, apply: value => { value.lease.wip = 0; } } }) }), /E_WP706_ADMISSION_CARRIER_DIGEST/u);
  assert.throws(() => verifyWp706MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: 'docs/OPS/R24/CORRECTIVE/WP706_CARRIER_REGISTRY_V1.json', apply: value => { value.currentTreeFallbackAllowed = true; } } }) }), /E_WP706_CARRIER_DENOMINATOR/u);
  assert.throws(() => verifyWp706MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: 'docs/OPS/R24/CORRECTIVE/WP706_WORD_REPORT_CONTRACT_V1.json', apply: value => { value.profileVerdict = 'PASS'; } } }) }), /E_WP706_WORD_REPORT_CEILING/u);
  assert.throws(() => verifyWp706MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: 'docs/OPS/R24/CORRECTIVE/WP706_WORD_REPORT_OBSERVED_V1.json', apply: value => { value.authority.productApplyAuthority = true; } } }) }), /E_WP706_OBSERVED_REPORT/u);
});

test('WP706 routing pins V2 to the immutable WP706 base and admits only the WP706 candidate delta', () => {
  const source = fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs', 'utf8');
  assert.match(source, /const v2Exception=v2Enabled\?verifyV2MainProductPostEvaluationException\(\{candidateSha:wp706Enabled\?WP706_MAIN_PRODUCT_ADMISSION_EXPECTATION\.baseSha:resolvedCandidate,git\}\):null/u);
  assert.match(source, /const wp706Exception=wp706Enabled\?verifyWp706MainProductPostEvaluationException\(\{candidateSha:resolvedCandidate,git\}\):null/u);
  assert.match(source, /\.\.\.\(wp706Exception\?\.admittedPaths\?\?\[\]\)/u);
});
