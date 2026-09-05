'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const historyPromise = import('../../src/core/pulse-local-history-v1.mjs');
const hashPromise = import('../../src/core/browser-safe-hash.mjs');
const { createHistoryTriplet, decisionCommand, ZERO } = require('../fixtures/r24-wp805-local-history-fixtures.js');

const fixture = t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp805-unit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const payload = value => ({ schemaVersion: value.schemaVersion, policy: value.policy, privacyState: value.privacyState, identity: value.identity, history: value.history });
async function rehash(value) {
  const { hashCanonicalValue } = await hashPromise;
  value.explanationDigest = hashCanonicalValue(payload(value));
  return value;
}

test('WP805 derives a typed three-way semantic conflict without content or identity data', async t => {
  const { derivePulseLocalHistoryReview } = await historyPromise;
  const review = derivePulseLocalHistoryReview(await createHistoryTriplet(fixture(t)));
  assert.equal(review.changes.length, 1);
  assert.equal(review.changes[0].classification, 'CONFLICT');
  assert.equal(review.changes[0].baseValue, 12);
  assert.equal(review.changes[0].oursValue, 10);
  assert.equal(review.changes[0].theirsValue, 9);
  assert.equal(review.conflicts[0].status, 'REQUIRES_LOCAL_DECISION');
  assert.equal(review.networkSyncStatus, 'BLOCKED_PENDING_LOCAL_REVIEW');
  assert.equal(review.policy.content, 'DENIED');
  assert.equal(review.policy.identity, 'DENIED');
  assert.equal(review.policy.path, 'DENIED');
  assert.equal(review.policy.network, 'DENIED');
  const serialized = JSON.stringify(review);
  for (const forbidden of ['projectId', 'userId', '/Users/', '/Volumes/', 'networkPort']) assert(!serialized.includes(forbidden));
});

test('WP805 distinguishes identical, ours-only and theirs-only semantic changes', async t => {
  const { derivePulseLocalHistoryReview } = await historyPromise;
  const root = fixture(t);
  const identical = derivePulseLocalHistoryReview(await createHistoryTriplet(path.join(root, 'identical'), { oursValue: 7, theirsValue: 7 }));
  assert.equal(identical.changes[0].classification, 'BOTH_IDENTICAL');
  assert.equal(identical.conflicts.length, 0);
  assert.equal(identical.networkSyncStatus, 'READY_AFTER_LOCAL_REVIEW');
  const ours = derivePulseLocalHistoryReview(await createHistoryTriplet(path.join(root, 'ours'), { oursValue: 8, theirsValue: null }));
  assert.equal(ours.changes[0].classification, 'OURS_ONLY');
  const theirs = derivePulseLocalHistoryReview(await createHistoryTriplet(path.join(root, 'theirs'), { oursValue: null, theirsValue: 6 }));
  assert.equal(theirs.changes[0].classification, 'THEIRS_ONLY');
});

test('WP805 compares append-only new ledger rows and keeps the review immutable', async t => {
  const { derivePulseLocalHistoryReview } = await historyPromise;
  const input = await createHistoryTriplet(fixture(t), { oursValue: null, theirsValue: null, oursAppend: true, theirsAppend: true });
  const review = derivePulseLocalHistoryReview(input);
  assert.equal(review.changes.length, 3);
  assert(review.changes.every(row => row.classification === 'BOTH_IDENTICAL' && row.baseValue === null));
  assert(Object.isFrozen(review));
  assert(Object.isFrozen(review.changes));
  assert(Object.isFrozen(review.changes[0]));
});

test('WP805 rejects immutable lineage drift even when the outer projection digest is refreshed', async t => {
  const { derivePulseLocalHistoryReview } = await historyPromise;
  const input = await createHistoryTriplet(fixture(t));
  input.ours = structuredClone(input.ours);
  input.ours.history[0].effectiveAggregates[1].originalValue = 13;
  await rehash(input.ours);
  assert.throws(() => derivePulseLocalHistoryReview(input), error => error.code === 'E_WP805_OURS_LINEAGE_DRIFT');
});

test('WP805 rejects tampered explanation, unknown fields, accessors, symbols and cycles', async t => {
  const { derivePulseLocalHistoryReview } = await historyPromise;
  const input = await createHistoryTriplet(fixture(t));
  const tampered = structuredClone(input); tampered.ours.history[0].effectiveAggregates[1].effectiveValue = 4;
  assert.throws(() => derivePulseLocalHistoryReview(tampered), error => error.code === 'E_WP805_OURS_TAMPER');
  assert.throws(() => derivePulseLocalHistoryReview({ ...input, extra: true }), error => error.code === 'E_WP805_REVIEW_INPUT_SCHEMA');
  const accessor = { ...input }; Object.defineProperty(accessor, 'ours', { enumerable: true, get() { return input.ours; } });
  assert.throws(() => derivePulseLocalHistoryReview(accessor), error => error.code === 'E_WP805_INPUT_ACCESSOR');
  const symbol = { ...input }; symbol[Symbol('forbidden')] = true;
  assert.throws(() => derivePulseLocalHistoryReview(symbol), error => error.code === 'E_WP805_INPUT_SYMBOL');
  const cycle = { ...input }; cycle.self = cycle;
  assert.throws(() => derivePulseLocalHistoryReview(cycle), error => error.code === 'E_WP805_INPUT_NOT_PLAIN_DATA');
});

test('WP805 appends a hash-chained local decision and never persists the raw request id', async t => {
  const { derivePulseLocalHistoryReview, openPulseLocalHistoryController } = await historyPromise;
  const root = fixture(t);
  const input = await createHistoryTriplet(path.join(root, 'history'));
  const review = derivePulseLocalHistoryReview(input);
  const controller = await openPulseLocalHistoryController(path.join(root, 'journal'));
  const result = await controller.appendDecision(input, decisionCommand(review, { requestId: 'private-local-request-token' }));
  assert.equal(result.status, 'LOCAL_DECISION_APPENDED');
  assert.equal(result.entry.previousEntryDigest, ZERO);
  assert.equal(result.entry.selectedValue, 10);
  assert.equal(result.unresolvedConflictCount, 0);
  assert.equal(result.networkSyncStatus, 'READY_AFTER_LOCAL_REVIEW');
  const bytes = fs.readFileSync(path.join(root, 'journal', 'pulse-local-history-decisions.v1.jsonl'), 'utf8');
  assert(!bytes.includes('private-local-request-token'));
  assert.equal(bytes.trim().split('\n').length, 1);
});

test('WP805 keeps deferred conflicts blocked and permits a later append-only resolution', async t => {
  const { derivePulseLocalHistoryReview, openPulseLocalHistoryController } = await historyPromise;
  const root = fixture(t);
  const input = await createHistoryTriplet(path.join(root, 'history'));
  const review = derivePulseLocalHistoryReview(input);
  const controller = await openPulseLocalHistoryController(path.join(root, 'journal'));
  const deferred = await controller.appendDecision(input, decisionCommand(review, { decision: 'DEFER' }));
  assert.equal(deferred.unresolvedConflictCount, 1);
  assert.equal(deferred.entry.selectedValue, null);
  const resolved = await controller.appendDecision(input, decisionCommand(review, {
    decision: 'KEEP_THEIRS', requestId: 'resolve-2', sequence: 1, headDigest: deferred.entry.entryDigest,
  }));
  assert.equal(resolved.entry.previousEntryDigest, deferred.entry.entryDigest);
  assert.equal(resolved.entry.selectedValue, 9);
  assert.equal(resolved.unresolvedConflictCount, 0);
});

test('WP805 rejects stale review, journal identity, conflict id and request path authority', async t => {
  const { derivePulseLocalHistoryReview, openPulseLocalHistoryController } = await historyPromise;
  const root = fixture(t);
  const input = await createHistoryTriplet(path.join(root, 'history'));
  const review = derivePulseLocalHistoryReview(input);
  const controller = await openPulseLocalHistoryController(path.join(root, 'journal'));
  await assert.rejects(() => controller.appendDecision(input, { ...decisionCommand(review), expectedReviewDigest: 'f'.repeat(64) }), error => error.code === 'E_WP805_REVIEW_IDENTITY_STALE');
  await assert.rejects(() => controller.appendDecision(input, { ...decisionCommand(review), expectedDecisionSequence: 1 }), error => error.code === 'E_WP805_DECISION_IDENTITY_STALE');
  await assert.rejects(() => controller.appendDecision(input, { ...decisionCommand(review), conflictId: 'e'.repeat(64) }), error => error.code === 'E_WP805_CONFLICT_ID_STALE');
  await assert.rejects(() => controller.appendDecision(input, { ...decisionCommand(review), path: '/tmp/forbidden' }), error => error.code === 'E_WP805_COMMAND_SCHEMA');
  assert(!fs.existsSync(path.join(root, 'journal', 'pulse-local-history-decisions.v1.jsonl')));
});

test('WP805 serializes concurrent decisions so one stale identity fails closed', async t => {
  const { derivePulseLocalHistoryReview, openPulseLocalHistoryController } = await historyPromise;
  const root = fixture(t);
  const input = await createHistoryTriplet(path.join(root, 'history'));
  const review = derivePulseLocalHistoryReview(input);
  const controller = await openPulseLocalHistoryController(path.join(root, 'journal'));
  const results = await Promise.allSettled([
    controller.appendDecision(input, decisionCommand(review, { requestId: 'race-a' })),
    controller.appendDecision(input, decisionCommand(review, { requestId: 'race-b' })),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'E_WP805_DECISION_IDENTITY_STALE');
});
