import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  WP802_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,
  verifyWp802MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA = 'f802f802f802f802f802f802f802f802f802f802';
const FINAL_TREE = 'a802a802a802a802a802a802a802a802a802a802';
const TERMINAL_SHA = 'e62310f3e958db6d86a7f71d4a310c2bc65461ce';
const TERMINAL_TREE = 'a7eeddc6a1a85961a3cb949a7b5ee74830fb8ae5';
const instance = JSON.parse(fs.readFileSync(E.instancePath));
const ADMITTED = [...instance.operations.modifyPaths, ...instance.operations.createPaths].sort();
const response = (value, encoding) => encoding === 'utf8' ? String(value) + '\n' : Buffer.from(String(value) + '\n');

function fakeGit({ changedPaths = ADMITTED, baseTreeDrift = false, missingArtifact = null, byteDrift = null, ancestor = true, mutateJson = null } = {}) {
  return (args, { encoding = null } = {}) => {
    if (args[0] === 'rev-parse') {
      if (args[1] === 'HEAD') return response(FINAL_SHA, encoding);
      if (args[1] === `${E.baseSha}^{tree}`) return response(baseTreeDrift ? 'b'.repeat(40) : E.baseTree, encoding);
      if (args[1] === `${TERMINAL_SHA}^{tree}`) return response(TERMINAL_TREE, encoding);
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
      let bytes = sha === E.baseSha || sha === TERMINAL_SHA
        ? execFileSync('git', ['show', `${sha}:${file}`], { encoding: null, maxBuffer: 32 * 1024 * 1024 })
        : fs.readFileSync(file);
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

test('WP802 candidate oracle binds the exact 37-path admission and protected baseline', () => {
  const result = verifyWp802MainProductPostEvaluationException({ candidateSha: TERMINAL_SHA, git: fakeGit() });
  assert.equal(result.status, 'PASS');
  assert.equal(result.candidateSha, TERMINAL_SHA);
  assert.equal(result.candidateTree, TERMINAL_TREE);
  assert.equal(result.admittedPathDenominator, 37);
  assert.deepEqual(result.changedPaths, ADMITTED);
  assert.equal(result.protectedWipDenominator, 286);
  assert.equal(result.protectedDirtyDenominator, 10);
  assert.equal(result.admission.writeSetDigest, E.writeSetDigest);
});

test('WP802 candidate oracle rejects scope, base, ancestry, missing-artifact and byte drift', () => {
  assert.throws(() => verifyWp802MainProductPostEvaluationException({ candidateSha: TERMINAL_SHA, git: fakeGit({ changedPaths: [...ADMITTED, 'src/main.js'].sort() }) }), /E_WP802_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp802MainProductPostEvaluationException({ candidateSha: TERMINAL_SHA, git: fakeGit({ changedPaths: ADMITTED.slice(1) }) }), /E_WP802_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp802MainProductPostEvaluationException({ candidateSha: TERMINAL_SHA, git: fakeGit({ baseTreeDrift: true }) }), /E_WP802_ADMISSION_BASE/u);
  assert.throws(() => verifyWp802MainProductPostEvaluationException({ candidateSha: TERMINAL_SHA, git: fakeGit({ ancestor: false }) }), /E_WP802_BASE_NOT_ANCESTOR/u);
  assert.throws(() => verifyWp802MainProductPostEvaluationException({ candidateSha: TERMINAL_SHA, git: fakeGit({ missingArtifact: E.instancePath }) }), /E_WP802_CANDIDATE_ARTIFACT_MISSING/u);
  assert.throws(() => verifyWp802MainProductPostEvaluationException({ candidateSha: TERMINAL_SHA, git: fakeGit({ byteDrift: E.admissionPath }) }), /E_WP802_CANONICAL_LF/u);
});

test('WP802 candidate oracle rejects a forged lease and carrier-registry fallback', () => {
  assert.throws(() => verifyWp802MainProductPostEvaluationException({ candidateSha: TERMINAL_SHA, git: fakeGit({ mutateJson: { path: E.instancePath, apply: (value) => { value.lease.wip = 0; } } }) }), /E_WP802_ADMISSION_CARRIER_DIGEST/u);
  assert.throws(() => verifyWp802MainProductPostEvaluationException({ candidateSha: TERMINAL_SHA, git: fakeGit({ mutateJson: { path: 'docs/OPS/R24/CORRECTIVE/WP802_CARRIER_REGISTRY_V1.json', apply: (value) => { value.currentTreeFallbackAllowed = true; } } }) }), /E_WP802_CARRIER_DENOMINATOR/u);
});

test('WP802 routing pins the WP801 oracle to the immutable WP802 base', () => {
  const source = fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs', 'utf8');
  assert.match(source, /verifyWp801MainProductPostEvaluationException\(\{candidateSha:wp802Enabled\?WP802_MAIN_PRODUCT_ADMISSION_EXPECTATION\.baseSha:resolvedCandidate,git\}\)/u);
});

test('WP803 pins WP802 to the immutable predecessor terminal tree', () => {
  const source = fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs', 'utf8');
  assert.match(source, /verifyWp802MainProductPostEvaluationException\(\{candidateSha:wp803Enabled\?WP803_MAIN_PRODUCT_ADMISSION_EXPECTATION\.baseSha:resolvedCandidate,git\}\)/u);
});
