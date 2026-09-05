'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const modulePromise = import('../../src/core/pulse-privacy-v1.mjs');
const PULSE_LEDGER_ZERO_DIGEST = '0'.repeat(64);
const {
  aggregateReceipt,
  consentCommand,
  correctionCommand,
  disposableDeletePort,
  disposableExportPort,
  effectCommand,
} = require('../fixtures/r24-wp804-pulse-privacy-fixtures.js');

const fixture = () => fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp804-unit-'));
const appendOne = async controller => controller.appendReceipt({
  expectedPrivacyRevision: 1,
  idempotencyKey: 'fixture-ledger-1',
  expectedSequence: 0,
  receipt: aggregateReceipt(),
});
const openController = async (...args) => (await modulePromise).openPulsePrivacyController(...args);

test('WP804 defaults to opted out and explains the exact owner policy', async () => {
  const { PULSE_PRIVACY_POLICY_V1 } = await modulePromise;
  const controller = await openController(fixture());
  const explanation = await controller.explain();
  assert.equal(explanation.privacyState.collectionStatus, 'OPTED_OUT');
  assert.equal(explanation.privacyState.revision, 0);
  assert.deepEqual(explanation.policy, PULSE_PRIVACY_POLICY_V1);
  assert.equal(explanation.policy.maximumRetainedEntries, 4096);
  assert.equal(explanation.policy.automaticCleanup, 'DENIED');
  await assert.rejects(() => controller.appendReceipt({ expectedPrivacyRevision: 0, idempotencyKey: 'denied', expectedSequence: 0, receipt: aggregateReceipt() }),
    error => error.code === 'E_WP804_COLLECTION_OPT_IN_REQUIRED');
});

test('WP804 requires explicit opt-in and stores no raw request id', async () => {
  const directory = fixture();
  const controller = await openController(directory);
  const result = await controller.optIn(consentCommand('OPT_IN', 0, 'private-fixture-request-id'));
  assert.equal(result.status, 'OPTED_IN');
  assert.equal(result.privacyState.revision, 1);
  assert(!fs.readFileSync(path.join(directory, 'pulse-privacy-state.v1.json'), 'utf8').includes('private-fixture-request-id'));
  const appended = await appendOne(controller);
  assert.equal(appended.status, 'APPENDED');
  assert.equal((await controller.explain()).identity.ledgerSequence, 1);
});

test('WP804 serializes opt-out before and blocks every later collection', async () => {
  const controller = await openController(fixture());
  await controller.optIn(consentCommand('OPT_IN', 0));
  await appendOne(controller);
  const optOut = controller.optOut(consentCommand('OPT_OUT', 1));
  const laterCollection = controller.appendReceipt({ expectedPrivacyRevision: 1, idempotencyKey: 'later', expectedSequence: 1, receipt: aggregateReceipt(2, 2) });
  assert.equal((await optOut).privacyState.collectionStatus, 'OPTED_OUT');
  await assert.rejects(() => laterCollection, error => error.code === 'E_WP804_PRIVACY_REVISION_STALE');
  assert.equal((await controller.explain()).identity.ledgerSequence, 1);
});

test('WP804 keeps corrections as separate append-only entries and applies the latest value', async () => {
  const directory = fixture();
  const controller = await openController(directory);
  await controller.optIn(consentCommand('OPT_IN', 0));
  const appended = await appendOne(controller);
  const first = await controller.appendCorrection(correctionCommand({
    expectedPrivacyRevision: 1,
    targetEntryDigest: appended.entry.entryDigest,
    correctedValue: 10,
  }));
  const second = await controller.appendCorrection(correctionCommand({
    expectedPrivacyRevision: 1,
    correctionSequence: 1,
    correctionHeadDigest: first.entry.entryDigest,
    targetEntryDigest: appended.entry.entryDigest,
    correctedValue: 9,
  }));
  assert.equal(second.entry.previousEntryDigest, first.entry.entryDigest);
  const explanation = await controller.explain();
  assert.deepEqual(explanation.history[0].effectiveAggregates.find(row => row.metricId === 'WORDS_ADDED_COUNT'), {
    metricId: 'WORDS_ADDED_COUNT',
    originalValue: 12,
    effectiveValue: 9,
    correctionSequence: 2,
  });
  assert.equal(fs.readFileSync(path.join(directory, 'pulse-corrections.v1.jsonl'), 'utf8').trim().split('\n').length, 2);
});

test('WP804 rejects stale correction identity, wrong target and unrecorded metrics', async () => {
  const controller = await openController(fixture());
  await controller.optIn(consentCommand('OPT_IN', 0));
  const appended = await appendOne(controller);
  const base = correctionCommand({ expectedPrivacyRevision: 1, targetEntryDigest: appended.entry.entryDigest });
  await assert.rejects(() => controller.appendCorrection({ ...base, expectedCorrectionSequence: 1 }), error => error.code === 'E_WP804_CORRECTION_IDENTITY_STALE');
  await assert.rejects(() => controller.appendCorrection({ ...base, targetEntryDigest: 'f'.repeat(64) }), error => error.code === 'E_WP804_CORRECTION_TARGET_STALE');
  await assert.rejects(() => controller.appendCorrection({ ...base, metricId: 'SCENES_EDITED_COUNT' }), error => error.code === 'E_WP804_CORRECTION_METRIC_NOT_RECORDED');
});

test('WP804 exports only through the named port after an exact explicit request', async () => {
  const calls = [];
  const directory = fixture();
  const controller = await openController(directory, { exportPort: disposableExportPort(calls) });
  await controller.optIn(consentCommand('OPT_IN', 0));
  await appendOne(controller);
  const explanation = await controller.explain();
  const result = await controller.exportOnUserRequest(effectCommand('EXPORT', explanation, 'export-request-private-token'));
  assert.equal(result.status, 'EXPORTED');
  assert.equal(calls.length, 1);
  assert(!calls[0].serialized.includes('export-request-private-token'));
  assert(!calls[0].serialized.includes(directory));
  assert.equal(JSON.parse(calls[0].serialized).schemaVersion, 'yalken.r24.pulsePrivacyExport.v1');
  await assert.rejects(() => controller.exportOnUserRequest({ ...effectCommand('EXPORT', explanation), path: '/tmp/forbidden' }),
    error => error.code === 'E_WP804_COMMAND_SCHEMA');
});

test('WP804 deletion uses only fixed basenames and reopens empty and opted out', async () => {
  const directory = fixture();
  const calls = [];
  const controller = await openController(directory, { deletePort: disposableDeletePort(calls) });
  await controller.optIn(consentCommand('OPT_IN', 0));
  await appendOne(controller);
  const before = await controller.explain();
  const deleted = await controller.deleteOnUserRequest(effectCommand('DELETE', before));
  assert.deepEqual(deleted.deletedBasenames, [
    'pulse-corrections.v1.jsonl',
    'pulse-ledger-intents.v1.jsonl',
    'pulse-ledger-outbox.v1.jsonl',
    'pulse-ledger.v1.jsonl',
    'pulse-privacy-state.v1.json',
  ]);
  assert.deepEqual(calls[0].basenames, deleted.deletedBasenames);
  const reopened = await openController(directory);
  const after = await reopened.explain();
  assert.equal(after.privacyState.collectionStatus, 'OPTED_OUT');
  assert.equal(after.privacyState.revision, 0);
  assert.equal(after.identity.ledgerSequence, 0);
  assert.equal(after.identity.correctionHeadDigest, PULSE_LEDGER_ZERO_DIGEST);
});

test('WP804 deletion failure preserves the committed opt-out state', async () => {
  const directory = fixture();
  const controller = await openController(directory, { deletePort: async () => { throw new Error('fixture delete failure'); } });
  await controller.optIn(consentCommand('OPT_IN', 0));
  await appendOne(controller);
  const explanation = await controller.explain();
  await assert.rejects(() => controller.deleteOnUserRequest(effectCommand('DELETE', explanation)), /fixture delete failure/u);
  const reopened = await openController(directory);
  const state = await reopened.explain();
  assert.equal(state.privacyState.collectionStatus, 'OPTED_OUT');
  assert.equal(state.privacyState.revision, 2);
  assert.equal(state.identity.ledgerSequence, 1);
});

test('WP804 fails closed at capacity and never calls automatic cleanup', async () => {
  let appendCalls = 0;
  const fakeLedger = async () => ({
    async snapshot() { return { sequence: 4096, headDigest: 'a'.repeat(64), entries: [] }; },
    async appendReceipt() { appendCalls += 1; },
  });
  const directory = fixture();
  const controller = await openController(directory, { openLedger: fakeLedger });
  await controller.optIn(consentCommand('OPT_IN', 0));
  await assert.rejects(() => controller.appendReceipt({ expectedPrivacyRevision: 1, idempotencyKey: 'full', expectedSequence: 4096, receipt: aggregateReceipt() }),
    error => error.code === 'E_WP804_RETENTION_CAPACITY_NO_AUTOCLEANUP');
  assert.equal(appendCalls, 0);
});

test('WP804 rejects accessors, symbols, unknown fields, cycles and stale effect identities', async () => {
  const controller = await openController(fixture(), { exportPort: disposableExportPort([]) });
  const accessor = consentCommand('OPT_IN', 0);
  Object.defineProperty(accessor, 'requestId', { enumerable: true, get() { return 'forbidden'; } });
  await assert.rejects(() => controller.optIn(accessor), error => error.code === 'E_WP804_INPUT_ACCESSOR');
  const symbol = consentCommand('OPT_IN', 0); symbol[Symbol('x')] = 1;
  await assert.rejects(() => controller.optIn(symbol), error => error.code === 'E_WP804_INPUT_SYMBOL');
  const cycle = consentCommand('OPT_IN', 0); cycle.self = cycle;
  await assert.rejects(() => controller.optIn(cycle), error => error.code === 'E_WP804_INPUT_NOT_PLAIN_DATA');
  await assert.rejects(() => controller.optIn({ ...consentCommand('OPT_IN', 0), extra: true }), error => error.code === 'E_WP804_COMMAND_SCHEMA');
  await assert.rejects(() => controller.appendReceipt({ expectedPrivacyRevision: 0, idempotencyKey: 'x', expectedSequence: 0, receipt: aggregateReceipt(), extra: true }),
    error => error.code === 'E_WP804_APPEND_SCHEMA');
  await controller.optIn(consentCommand('OPT_IN', 0));
  const explanation = await controller.explain();
  await assert.rejects(() => controller.exportOnUserRequest({ ...effectCommand('EXPORT', explanation), expectedLedgerHeadDigest: 'f'.repeat(64) }),
    error => error.code === 'E_WP804_LEDGER_IDENTITY_STALE');
});
