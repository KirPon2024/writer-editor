const assert = require('node:assert/strict');
const test = require('node:test');
const { validPulseAggregateInput } = require('../fixtures/r24-wp800-pulse-policy-codec-fixtures.js');

test('WP800 creates a deterministic immutable receipt from the fixed local aggregate allowlist', async () => {
  const { PULSE_METRIC_ALLOWLIST, PULSE_PRIVACY_POLICY, createPulseAggregateReceipt, verifyPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const receipt = createPulseAggregateReceipt(validPulseAggregateInput);
  assert.deepEqual(receipt.aggregates.map((row) => row.metricId), PULSE_METRIC_ALLOWLIST);
  assert.deepEqual(receipt.privacy, PULSE_PRIVACY_POLICY);
  assert.equal(receipt.payloadDigest.length, 64);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.aggregates), true);
  assert.equal(Object.isFrozen(receipt.aggregates[0]), true);
  assert.equal(Object.isFrozen(receipt.privacy), true);
  assert.deepEqual(verifyPulseAggregateReceipt(receipt), receipt);
});

test('WP800 canonical receipt contains only numeric aggregates and fixed policy strings', async () => {
  const { PULSE_METRIC_ALLOWLIST, createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const receipt = createPulseAggregateReceipt(validPulseAggregateInput);
  const dynamicStrings = receipt.aggregates.map((row) => row.metricId);
  assert.deepEqual(dynamicStrings, PULSE_METRIC_ALLOWLIST);
  assert.equal(Object.values(receipt.aggregates).some((value) => typeof value === 'string'), false);
  assert.deepEqual(Object.keys(receipt).sort(), [
    'aggregates', 'generation', 'payloadDigest', 'policyId', 'privacy', 'schemaVersion', 'sourceRevisionOrdinal',
  ]);
});
