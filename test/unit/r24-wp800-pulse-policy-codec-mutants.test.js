const assert = require('node:assert/strict');
const test = require('node:test');
const { cloneFixture, validPulseAggregateInput } = require('../fixtures/r24-wp800-pulse-policy-codec-fixtures.js');

const inputMutants = [
  ['content', 'secret prose'], ['identity', 'writer'], ['path', '/tmp/private'], ['network', true],
  ['export', true], ['telemetry', true], ['projectId', 'private-project'], ['sceneId', 'scene-private'],
  ['userId', 'owner'], ['timestamp', '2026-09-04T00:00:00Z'],
].map(([key, value]) => () => ({ ...cloneFixture(), [key]: value }));

function malformedInputMutants(maximum) { return [
  () => ({ ...cloneFixture(), sourceRevisionOrdinal: -1 }),
  () => ({ ...cloneFixture(), sourceRevisionOrdinal: 1.5 }),
  () => ({ ...cloneFixture(), generation: -1 }),
  () => ({ ...cloneFixture(), generation: Number.MAX_SAFE_INTEGER + 1 }),
  () => ({ ...cloneFixture(), aggregates: [] }),
  () => ({ ...cloneFixture(), aggregates: [...cloneFixture().aggregates, { metricId: 'WORDS_ADDED_COUNT', value: 1 }] }),
  () => ({ ...cloneFixture(), aggregates: [{ metricId: 'UNKNOWN_METRIC', value: 1 }] }),
  () => ({ ...cloneFixture(), aggregates: [{ metricId: 'WORDS_ADDED_COUNT', value: -1 }] }),
  () => ({ ...cloneFixture(), aggregates: [{ metricId: 'WORDS_ADDED_COUNT', value: 1.5 }] }),
  () => ({ ...cloneFixture(), aggregates: [{ metricId: 'WORDS_ADDED_COUNT', value: maximum + 1 }] }),
  () => ({ ...cloneFixture(), aggregates: [{ metricId: 'WORDS_ADDED_COUNT', value: 1, content: 'x' }] }),
  () => ({ ...cloneFixture(), aggregates: null }),
]; }

test('WP800 rejects every content, identity, path, network, export and telemetry authority mutant', async () => {
  const { PULSE_AGGREGATE_VALUE_MAX, createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const mutants = [...inputMutants, ...malformedInputMutants(PULSE_AGGREGATE_VALUE_MAX)];
  for (const mutant of mutants) assert.throws(() => createPulseAggregateReceipt(mutant()));
  assert.equal(mutants.length, 22);
});

test('WP800 rejects receipt tamper and non-canonical or hostile byte encodings', async () => {
  const { createPulseAggregateReceipt, decodePulseAggregateReceipt, encodePulseAggregateReceipt, verifyPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const validReceipt = () => createPulseAggregateReceipt(validPulseAggregateInput);
  const receiptMutants = [
    () => ({ ...validReceipt(), schemaVersion: 'future' }),
    () => ({ ...validReceipt(), policyId: 'caller-policy' }),
    () => ({ ...validReceipt(), payloadDigest: '0'.repeat(64) }),
    () => ({ ...validReceipt(), privacy: { ...validReceipt().privacy, content: 'ALLOWED' } }),
    () => ({ ...validReceipt(), content: 'private' }),
    () => ({ ...validReceipt(), aggregates: [...validReceipt().aggregates].reverse() }),
  ];
  for (const mutant of receiptMutants) assert.throws(() => verifyPulseAggregateReceipt(mutant()));
  const encoded = encodePulseAggregateReceipt(validReceipt());
  const byteMutants = [
    encoded.trimEnd(),
    `${encoded}\n`,
    ` ${encoded}`,
    encoded.replace('{', '{\n'),
    `\ufeff${encoded}`,
    '{"schemaVersion":"x","schemaVersion":"y"}\n',
    'not-json\n',
    '',
    'x'.repeat(4097),
    new Uint8Array([0xc3, 0x28]),
  ];
  for (const mutant of byteMutants) assert.throws(() => decodePulseAggregateReceipt(mutant));
  assert.equal(receiptMutants.length + byteMutants.length, 16);
});
