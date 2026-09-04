import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  WP800_MAIN_PRODUCT_ADMISSION_EXPECTATION as E,
  verifyWp800MainProductPostEvaluationException,
} from '../../scripts/ops/r24/corrective/post-audit-certification-set.mjs';

test('WP800 historical oracle replays the exact merged artifact and admitted 41-path delta', () => {
  const result = verifyWp800MainProductPostEvaluationException();
  assert.equal(result.status, 'PASS');
  assert.equal(result.artifactRevisionSha, E.terminalMergeSha);
  assert.equal(result.artifactRevisionTree, E.terminalMergeTree);
  assert.equal(result.admittedPathDenominator, 41);
  assert.equal(result.changedPathDenominator, 41);
  assert.equal(result.protectedWipDenominator, 282);
  assert.equal(result.protectedDirtyDenominator, 10);
  assert.equal(result.admission.writeSetDigest, E.writeSetDigest);
});

test('WP800 oracle cannot fall back to mutable workspace bytes after terminal merge', () => {
  const source = fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs', 'utf8');
  const start = source.indexOf('export function verifyWp800MainProductPostEvaluationException');
  const end = source.indexOf('export function verifyWp801MainProductPostEvaluationException', start);
  const body = source.slice(start, end);
  assert.match(body, /historicalGit=defaultGit/u);
  assert.match(body, /objectBytes\(historicalGit,artifactRevision,p\)/u);
  assert.match(body, /objectBytes\(historicalGit,artifactRevision,binding\.path\)/u);
  assert.doesNotMatch(body, /objectBytes\(git,resolvedCandidate,p\)/u);
  assert.doesNotMatch(body, /objectBytes\(git,resolvedCandidate,binding\.path\)/u);
});
