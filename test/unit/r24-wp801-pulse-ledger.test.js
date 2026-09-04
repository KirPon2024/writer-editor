const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { aggregateInputs } = require('../fixtures/r24-wp801-pulse-ledger-fixtures.js');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wp801-unit-'));

test('WP801 appends a hash-chained immutable receipt and persists only aggregate-safe truth', async () => {
  const { createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const { openPulseLedger, PULSE_LEDGER_ZERO_DIGEST } = await import('../../src/core/pulse-ledger-v1.mjs');
  const ledger = await openPulseLedger(temp());
  const result = await ledger.appendReceipt({ idempotencyKey: 'session-001', expectedSequence: 0, receipt: createPulseAggregateReceipt(aggregateInputs[0]) });
  assert.equal(result.status, 'APPENDED');
  assert.equal(result.entry.sequence, 1);
  assert.equal(result.entry.previousEntryDigest, PULSE_LEDGER_ZERO_DIGEST);
  assert.equal(result.entry.receiptDigest, result.entry.receipt.payloadDigest);
  assert.equal(result.snapshot.headDigest, result.entry.entryDigest);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.snapshot.entries), true);
  const serialized = fs.readFileSync(ledger.paths.ledger, 'utf8');
  assert.equal(serialized.includes('session-001'), false);
  for (const denied of ['content', 'identity', 'path', 'network', 'export', 'telemetry']) assert.equal(serialized.includes(`\"${denied}\":\"DENIED\"`), true);
});

test('WP801 idempotent replay is stable and key reuse with different meaning is a conflict', async () => {
  const { createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const { openPulseLedger } = await import('../../src/core/pulse-ledger-v1.mjs');
  const ledger = await openPulseLedger(temp());
  const first = createPulseAggregateReceipt(aggregateInputs[0]);
  const second = createPulseAggregateReceipt(aggregateInputs[1]);
  const appended = await ledger.appendReceipt({ idempotencyKey: 'stable-key', expectedSequence: 0, receipt: first });
  const replay = await ledger.appendReceipt({ idempotencyKey: 'stable-key', expectedSequence: 999, receipt: first });
  assert.equal(replay.status, 'IDEMPOTENT_REPLAY');
  assert.equal(replay.entry.entryDigest, appended.entry.entryDigest);
  assert.equal(replay.snapshot.sequence, 1);
  await assert.rejects(ledger.appendReceipt({ idempotencyKey: 'stable-key', expectedSequence: 1, receipt: second }), /E_WP801_IDEMPOTENCY_CONFLICT/u);
});

test('WP801 compares expected sequence and enforces the admitted capacity bound', async () => {
  const { createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const { openPulseLedger } = await import('../../src/core/pulse-ledger-v1.mjs');
  const ledger = await openPulseLedger(temp(), { maxEntries: 1 });
  await assert.rejects(ledger.appendReceipt({ idempotencyKey: 'stale', expectedSequence: 1, receipt: createPulseAggregateReceipt(aggregateInputs[0]) }), /E_WP801_CAS_MISMATCH/u);
  await ledger.appendReceipt({ idempotencyKey: 'first', expectedSequence: 0, receipt: createPulseAggregateReceipt(aggregateInputs[0]) });
  await assert.rejects(ledger.appendReceipt({ idempotencyKey: 'second', expectedSequence: 1, receipt: createPulseAggregateReceipt(aggregateInputs[1]) }), /E_WP801_LEDGER_CAPACITY/u);
});

test('WP801 rejects untrusted directory, save port, bounds and idempotency keys', async () => {
  const { openPulseLedger } = await import('../../src/core/pulse-ledger-v1.mjs');
  await assert.rejects(openPulseLedger('relative'), /E_WP801_DIRECTORY_REQUIRED/u);
  await assert.rejects(openPulseLedger(temp(), { saveTransaction: null }), /E_WP801_SAVE_TRANSACTION_REQUIRED/u);
  await assert.rejects(openPulseLedger(temp(), { maxEntries: 0 }), /E_WP801_MAX_ENTRIES/u);
  const ledger = await openPulseLedger(temp());
  await assert.rejects(ledger.appendReceipt({ idempotencyKey: '../escape', expectedSequence: 0, receipt: {} }), /E_WP801_IDEMPOTENCY_KEY/u);
});
