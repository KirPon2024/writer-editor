import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  WP707_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,
  verifyWp707MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA = 'f4'.repeat(20);
const FINAL_TREE = 'a4'.repeat(20);
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

test('WP707 candidate oracle binds the exact 37-path admission and physical Word proof', () => {
  const result = verifyWp707MainProductPostEvaluationException({ git: fakeGit() });
  assert.equal(result.status, 'PASS');
  assert.equal(result.candidateSha, FINAL_SHA);
  assert.equal(result.candidateTree, FINAL_TREE);
  assert.equal(result.admittedPathDenominator, 37);
  assert.deepEqual(result.changedPaths, ADMITTED);
  assert.equal(result.protectedWipDenominator, 302);
  assert.equal(result.protectedDirtyDenominator, 11);
  assert.equal(result.missionDigest, E.missionDigest);
  assert.equal(result.physicalRepetitionDenominator, 3);
  assert.equal(result.physicalRepetitionPass, 3);
  assert.equal(result.automaticApply, false);
  assert.equal(result.multiSceneApply, false);
  assert.equal(result.programDone, false);
});

test('WP707 candidate oracle rejects scope, base, ancestry, missing artifact and byte drift', () => {
  assert.throws(() => verifyWp707MainProductPostEvaluationException({ git: fakeGit({ changedPaths: [...ADMITTED, 'src/forbidden-wp707.mjs'].sort() }) }), /E_WP707_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp707MainProductPostEvaluationException({ git: fakeGit({ changedPaths: ADMITTED.slice(1) }) }), /E_WP707_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp707MainProductPostEvaluationException({ git: fakeGit({ baseTreeDrift: true }) }), /E_WP707_ADMISSION_BASE/u);
  assert.throws(() => verifyWp707MainProductPostEvaluationException({ git: fakeGit({ ancestor: false }) }), /E_WP707_BASE_NOT_ANCESTOR/u);
  assert.throws(() => verifyWp707MainProductPostEvaluationException({ git: fakeGit({ missingArtifact: E.instancePath }) }), /E_WP707_CANDIDATE_ARTIFACT_MISSING/u);
  assert.throws(() => verifyWp707MainProductPostEvaluationException({ git: fakeGit({ byteDrift: E.admissionPath }) }), /E_WP707_CANONICAL_LF/u);
});

test('WP707 candidate oracle rejects forged authority, owner decision and Word evidence', () => {
  assert.throws(() => verifyWp707MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: E.instancePath, apply: value => { value.lease.wip = 0; } } }) }), /E_WP707_ADMISSION_CARRIER_DIGEST/u);
  assert.throws(() => verifyWp707MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: E.ownerDecisionPath, apply: value => { value.authorizedScope.singleSceneWordApply = false; } } }) }), /E_WP707_OWNER_DECISION/u);
  assert.throws(() => verifyWp707MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: 'docs/OPS/R24/CORRECTIVE/WP707_CARRIER_REGISTRY_V1.json', apply: value => { value.currentTreeFallbackAllowed = true; } } }) }), /E_WP707_CARRIER_DENOMINATOR/u);
  assert.throws(() => verifyWp707MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: 'docs/OPS/R24/CORRECTIVE/WP707_WORD_APPLY_CONTRACT_V1.json', apply: value => { value.authority.automaticApply = true; } } }) }), /E_WP707_WORD_APPLY_SCOPE/u);
  assert.throws(() => verifyWp707MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: 'docs/OPS/R24/CORRECTIVE/WP707_WORD_APPLY_PHYSICAL_RECEIPT_V1.json', apply: value => { value.repetitions[0].wordOpenedT7Directly = true; } } }) }), /E_WP707_WORD_PHYSICAL/u);
});

test('WP707 routing pins WP706 to the immutable WP707 base and admits only the WP707 candidate delta', () => {
  const source = fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs', 'utf8');
  assert.match(source, /const wp706Exception=wp706Enabled\?verifyWp706MainProductPostEvaluationException\(\{candidateSha:wp707Enabled\?WP707_MAIN_PRODUCT_ADMISSION_EXPECTATION\.baseSha:resolvedCandidate,git\}\):null/u);
  assert.match(source, /const wp707Exception=wp707Enabled\?verifyWp707MainProductPostEvaluationException\(\{candidateSha:resolvedCandidate,git\}\):null/u);
  assert.match(source, /\.\.\.\(wp707Exception\?\.admittedPaths\?\?\[\]\)/u);
});
