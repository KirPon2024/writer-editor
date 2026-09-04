const assert = require('node:assert/strict');
const test = require('node:test');
const { currentPulseBinding, validPulseAggregateInput } = require('../fixtures/r24-wp800-pulse-policy-codec-fixtures.js');

test('WP800 canonical encode/decode roundtrip preserves digest and current revision binding', async () => {
  const { assertPulseAggregateReceiptCurrent, createPulseAggregateReceipt, decodePulseAggregateReceipt, encodePulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const receipt = createPulseAggregateReceipt(validPulseAggregateInput);
  const encoded = encodePulseAggregateReceipt(receipt);
  assert.equal(encoded, encodePulseAggregateReceipt(createPulseAggregateReceipt(validPulseAggregateInput)));
  assert.deepEqual(decodePulseAggregateReceipt(Buffer.from(encoded), currentPulseBinding), receipt);
  assert.deepEqual(assertPulseAggregateReceiptCurrent(receipt, currentPulseBinding), receipt);
});

test('WP800 decode fails closed on stale generation or source revision', async () => {
  const { createPulseAggregateReceipt, decodePulseAggregateReceipt, encodePulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const encoded = encodePulseAggregateReceipt(createPulseAggregateReceipt(validPulseAggregateInput));
  assert.throws(() => decodePulseAggregateReceipt(encoded, { sourceRevisionOrdinal: 41, generation: 7 }), /E_WP800_STALE_SOURCE_REVISION/u);
  assert.throws(() => decodePulseAggregateReceipt(encoded, { sourceRevisionOrdinal: 42, generation: 8 }), /E_WP800_STALE_GENERATION/u);
});
