'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, HEAD, baseInput, read } = require('../fixtures/r24-wp706-word-report-fixtures.js');

const MODULE = path.join(ROOT, 'scripts/ops/r24/word-report-wp706.mjs');
const load = () => import(`${pathToFileURL(MODULE).href}?v=${Date.now()}-${Math.random()}`);

test('WP706 compiles a qualified report-only BLOCKED result from the disposable full-book evidence', async () => {
  const c = await load();
  const result = c.compileWordReport(baseInput(c));
  assert.equal(result.ok, true);
  assert.equal(result.code, 'R24_WP706_WORD_REPORT_COMPILED');
  assert.equal(result.report.nodeVerdict, 'DONE_AFTER_REQUIRED_DELIVERY');
  assert.equal(result.report.profileVerdict, 'BLOCKED');
  assert.equal(result.report.physicalSource.plannedLedgerOperations, 2000);
  assert.equal(result.report.physicalSource.round01AttemptedOperations, 379);
  assert.equal(result.report.physicalSource.freshProviderExecutionByWp706, false);
  assert.deepEqual(result.report.blockerVector.exactTextOperationIds, { matched: 0, expected: 105 });
  assert.deepEqual(result.report.blockerVector.nativeLifecycle, { verified: 0, blocked: 38 });
  assert.equal(result.report.authority.productApplyAuthority, false);
  assert.equal(result.report.authority.wordProcessInvoked, false);
  assert.equal(result.report.successor.activated, false);
  assert.equal(result.report.successor.ownerGateRequired, 'WORD_MULTI_SCENE_SEPARATE_ADR');
  assert.equal(result.report.programDone, false);
});

test('WP706 rejects stale, dirty and source-drifted evaluation identity', async () => {
  const c = await load();
  assert.equal(c.compileWordReport(baseInput(c, { repoState: { headSha: '4'.repeat(40), originMainSha: '2'.repeat(40), treeSha: '3'.repeat(40), dirty: false } })).code, 'E_R24_WP706_EXACT_HEAD_MISMATCH');
  assert.equal(c.compileWordReport(baseInput(c, { repoState: { headSha: HEAD, originMainSha: '2'.repeat(40), treeSha: '3'.repeat(40), dirty: true } })).code, 'E_R24_WP706_WORKTREE_DIRTY');
  assert.equal(c.compileWordReport(baseInput(c, { sourceDigests: { ...c.EXPECTED_SOURCE_DIGESTS, c1Receipt: '0'.repeat(64) } })).code, 'E_R24_WP706_SOURCE_DIGEST');
});

test('WP706 rejects route, apply, document, provider, release and program promotion', async () => {
  const c = await load();
  for (const field of c.FORBIDDEN_TRUE_FIELDS) {
    const result = c.compileWordReport(baseInput(c, { claimRequest: { [field]: true } }));
    assert.equal(result.ok, false, field);
    assert.equal(result.code, 'E_R24_WP706_PROMOTION_FORBIDDEN', field);
  }
  assert.equal(c.compileWordReport(baseInput(c, { claimRequest: { profileVerdict: 'PASS' } })).code, 'E_R24_WP706_SCALAR_PASS_FORBIDDEN');
  assert.equal(c.compileWordReport(baseInput(c, { claimRequest: { profiles: ['WORD_ROUNDTRIP', 'WRITER_CORE'] } })).code, 'E_R24_WP706_PROFILE_IMPORT_FORBIDDEN');
});

test('WP706 rejects incomplete apply, lifecycle and reuse blocker accounting', async () => {
  const c = await load();
  const receipt = read('docs/OPS/RTK/YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1.json');
  receipt.physicalEvidence.round01.productReturnApply.expectedOperationCount = 0;
  const result = c.compileWordReport(baseInput(c, { c1Receipt: receipt }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /E_R24_WP706_C1_RECEIPT_INVALID|E_R24_WP706_BLOCKER_COUNTS/u);
});

test('WP706 observed carrier is exactly reproducible from the admitted source projection', async () => {
  const c = await load();
  const observed = read('docs/OPS/R24/CORRECTIVE/WP706_WORD_REPORT_OBSERVED_V1.json');
  const input = baseInput(c, {
    repoState: { ...observed.evaluationIdentity, dirty: false },
    expectedHeadSha: observed.evaluationIdentity.headSha,
    expectedOriginMainSha: observed.evaluationIdentity.originMainSha,
  });
  const result = c.verifyObservedReport(observed, input);
  assert.equal(result.ok, true);
  const changed = structuredClone(observed);
  changed.profileVerdict = 'PASS';
  assert.equal(c.verifyObservedReport(changed, input).code, 'E_R24_WP706_OBSERVED_REPORT_DRIFT');
});
