import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  WP606_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,
  verifyWp606MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

const FINAL_SHA = 'f710f710f710f710f710f710f710f710f710f710';
const FINAL_TREE = 'a710a710a710a710a710a710a710a710a710a710';
const instance = JSON.parse(fs.readFileSync(E.instancePath));
const ADMITTED = [...instance.operations.modifyPaths, ...instance.operations.createPaths].sort();
const response = (value, encoding) => encoding === 'utf8' ? String(value) + '\n' : Buffer.from(String(value) + '\n');

function assertTerminalReaderHasNoCurrentTreeFallback(source, terminalSha, label) {
  assert.match(source, new RegExp(terminalSha, 'u'), label + ':terminal-sha');
  assert.match(source, /historicalBytes/u, label + ':historical-reader');
  assert.doesNotMatch(source, /fs\.readFileSync/u, label + ':filesystem-fallback');
  assert.doesNotMatch(source, /\bbytes\(/u, label + ':current-bytes-helper');
}

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
        bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
      }
      if (file === byteDrift) bytes = Buffer.concat([bytes, Buffer.from(' ')]);
      return encoding === 'utf8' ? bytes.toString() : bytes;
    }
    throw new Error('UNEXPECTED_GIT:' + args.join(' '));
  };
}

test('WP606 candidate oracle binds the exact 58-path append-only admission and protected baseline', () => {
  const result = verifyWp606MainProductPostEvaluationException({ git: fakeGit() });
  assert.equal(result.status, 'PASS');
  assert.equal(result.candidateSha, FINAL_SHA);
  assert.equal(result.candidateTree, FINAL_TREE);
  assert.equal(result.admittedPathDenominator, 58);
  assert.deepEqual(result.changedPaths, ADMITTED);
  assert.equal(result.protectedWipDenominator, 277);
  assert.equal(result.protectedDirtyDenominator, 10);
  assert.equal(result.admission.writeSetDigest, E.writeSetDigest);
});

test('WP606 candidate oracle rejects scope, base, ancestry, missing-artifact and byte drift', () => {
  assert.throws(() => verifyWp606MainProductPostEvaluationException({ git: fakeGit({ changedPaths: [...ADMITTED, 'src/main.js'].sort() }) }), /E_WP606_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp606MainProductPostEvaluationException({ git: fakeGit({ changedPaths: ADMITTED.slice(1) }) }), /E_WP606_EXACT_ADMITTED_DELTA/u);
  assert.throws(() => verifyWp606MainProductPostEvaluationException({ git: fakeGit({ baseTreeDrift: true }) }), /E_WP606_ADMISSION_BASE/u);
  assert.throws(() => verifyWp606MainProductPostEvaluationException({ git: fakeGit({ ancestor: false }) }), /E_WP606_BASE_NOT_ANCESTOR/u);
  assert.throws(() => verifyWp606MainProductPostEvaluationException({ git: fakeGit({ missingArtifact: E.instancePath }) }), /E_WP606_CANDIDATE_ARTIFACT_MISSING/u);
  assert.throws(() => verifyWp606MainProductPostEvaluationException({ git: fakeGit({ byteDrift: E.admissionPath }) }), /E_WP606_CANONICAL_LF/u);
});

test('WP606 candidate oracle rejects a forged lease and carrier-registry fallback', () => {
  assert.throws(() => verifyWp606MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: E.instancePath, apply: (value) => { value.lease.wip = 0; } } }) }), /E_WP606_ADMISSION_CARRIER_DIGEST/u);
  assert.throws(() => verifyWp606MainProductPostEvaluationException({ git: fakeGit({ mutateJson: { path: 'docs/OPS/R24/CORRECTIVE/WP606_CARRIER_REGISTRY_V1.json', apply: (value) => { value.currentTreeFallbackAllowed = true; } } }) }), /E_WP606_CARRIER_DENOMINATOR/u);
});

test('WP606 historical-reader closure rejects current-tree fallback for WP605 and WP710', () => {
  const wp605 = fs.readFileSync('test/contracts/r24-wp605-terminal-carriers.contract.test.mjs', 'utf8');
  const wp710 = fs.readFileSync('test/contracts/r24-wp710-terminal-carriers.contract.test.mjs', 'utf8');
  assertTerminalReaderHasNoCurrentTreeFallback(wp605, '725b47c254895a5075c381ce5182592a40c31b45', 'WP605');
  assertTerminalReaderHasNoCurrentTreeFallback(wp710, '19c1ae3f39de73b87d468ff84dd65ecdbd478269', 'WP710');
  assert.throws(
    () => assertTerminalReaderHasNoCurrentTreeFallback(wp605.replace('historicalBytes(binding.path)', 'bytes(binding.path)'), '725b47c254895a5075c381ce5182592a40c31b45', 'WP605_MUTANT'),
    /WP605_MUTANT:current-bytes-helper/u,
  );
  const postAudit = fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs', 'utf8');
  for (const stage of ['605', '710']) {
    const compatibility = fs.readFileSync(`test/contracts/r24-wp${stage}-post-audit-compatibility.contract.test.mjs`, 'utf8');
    assert.match(compatibility, /historicalGit: injectedGit/u, `WP${stage}:explicit-historical-injection`);
    assert.match(compatibility, /sha === E\.baseSha \|\| sha === E\.terminalMergeSha/u, `WP${stage}:terminal-object-reader`);
  }
  for (const [stage, functionName, next] of [['WP605', 'verifyWp605MainProductPostEvaluationException', 'verifyWp710MainProductPostEvaluationException'], ['WP710', 'verifyWp710MainProductPostEvaluationException', 'verifyWp606MainProductPostEvaluationException']]) {
    const start = postAudit.indexOf(`export function ${functionName}`);
    const end = postAudit.indexOf(`export function ${next}`, start);
    const body = postAudit.slice(start, end);
    assert.match(body, /historicalGit=defaultGit/u, stage + ':historical-git');
    assert.match(body, /objectBytes\(historicalGit,artifactRevision,p\)/u, stage + ':carrier-reader');
    assert.doesNotMatch(body, /objectBytes\(git,artifactRevision,p\)/u, stage + ':current-tree-fallback');
  }
});
