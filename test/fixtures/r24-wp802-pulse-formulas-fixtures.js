'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const aggregateInputs = Object.freeze([
  Object.freeze({ sourceRevisionOrdinal: 21, generation: 7, aggregates: Object.freeze([
    Object.freeze({ metricId: 'ACTIVE_WRITING_SECONDS', value: 180 }),
    Object.freeze({ metricId: 'WORDS_ADDED_COUNT', value: 240 }),
  ]) }),
  Object.freeze({ sourceRevisionOrdinal: 22, generation: 8, aggregates: Object.freeze([
    Object.freeze({ metricId: 'SCENES_EDITED_COUNT', value: 2 }),
    Object.freeze({ metricId: 'SESSIONS_COMPLETED_COUNT', value: 1 }),
    Object.freeze({ metricId: 'WORDS_DELETED_COUNT', value: 8 }),
  ]) }),
  Object.freeze({ sourceRevisionOrdinal: 23, generation: 9, aggregates: Object.freeze([
    Object.freeze({ metricId: 'ACTIVE_WRITING_SECONDS', value: 120 }),
    Object.freeze({ metricId: 'WORDS_ADDED_COUNT', value: 60 }),
    Object.freeze({ metricId: 'WORDS_DELETED_COUNT', value: 5 }),
  ]) }),
]);

const overflowInputs = Object.freeze([
  Object.freeze({ sourceRevisionOrdinal: 31, generation: 1, aggregates: Object.freeze([
    Object.freeze({ metricId: 'ACTIVE_WRITING_SECONDS', value: 1 }),
    Object.freeze({ metricId: 'WORDS_ADDED_COUNT', value: 1_000_000_000 }),
  ]) }),
  Object.freeze({ sourceRevisionOrdinal: 32, generation: 2, aggregates: Object.freeze([
    Object.freeze({ metricId: 'WORDS_ADDED_COUNT', value: 1_000_000_000 }),
  ]) }),
  Object.freeze({ sourceRevisionOrdinal: 33, generation: 3, aggregates: Object.freeze([
    Object.freeze({ metricId: 'WORDS_ADDED_COUNT', value: 1_000_000_000 }),
  ]) }),
]);

async function buildPulseLedgerFixture(inputs = aggregateInputs) {
  const { createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const { openPulseLedger } = await import('../../src/core/pulse-ledger-v1.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wp802-pulse-'));
  const ledger = await openPulseLedger(directory);
  for (let index = 0; index < inputs.length; index += 1) {
    await ledger.appendReceipt({
      idempotencyKey: `wp802-${index + 1}`,
      expectedSequence: index,
      receipt: createPulseAggregateReceipt(inputs[index]),
    });
  }
  return Object.freeze({ directory, ledger, snapshot: await ledger.snapshot() });
}

module.exports = Object.freeze({ aggregateInputs, overflowInputs, buildPulseLedgerFixture });
