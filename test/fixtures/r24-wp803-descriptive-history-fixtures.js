'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const aggregateInputs = [
  { sourceRevisionOrdinal: 31, generation: 2, aggregates: [
    { metricId: 'WORDS_ADDED_COUNT', value: 20 }, { metricId: 'WORDS_DELETED_COUNT', value: 5 },
    { metricId: 'SCENES_EDITED_COUNT', value: 2 }, { metricId: 'SESSIONS_COMPLETED_COUNT', value: 1 },
  ] },
  { sourceRevisionOrdinal: 32, generation: 3, aggregates: [
    { metricId: 'WORDS_ADDED_COUNT', value: 0 }, { metricId: 'WORDS_DELETED_COUNT', value: 8 },
    { metricId: 'SCENES_EDITED_COUNT', value: 1 }, { metricId: 'SESSIONS_COMPLETED_COUNT', value: 0 },
  ] },
  { sourceRevisionOrdinal: 33, generation: 4, aggregates: [{ metricId: 'WORDS_ADDED_COUNT', value: 9 }] },
];
function historyInput(snapshot, entries = null) {
  const declarations = entries ?? [
    { sequence: 1, entryDigest: snapshot.entries[0].entryDigest, declaredTaskCount: 3, manualPhase: 'REVISING' },
    { sequence: 2, entryDigest: snapshot.entries[1].entryDigest, declaredTaskCount: 0, manualPhase: null },
  ];
  return {
    ledgerSnapshot: snapshot,
    declarationSnapshot: { schemaVersion: 'yalken.r24.pulseHistoryDeclarations.v1', ledgerSequence: snapshot.sequence,
      ledgerHeadDigest: snapshot.headDigest, revisionOrdinal: 7, generation: 4, entries: declarations },
    currentIdentity: { ledgerSequence: snapshot.sequence, ledgerHeadDigest: snapshot.headDigest, declarationRevisionOrdinal: 7, generation: 4 },
  };
}
async function fixture(t, inputs = aggregateInputs) {
  const { openPulseLedger } = await import('../../src/core/pulse-ledger-v1.mjs');
  const { createPulseAggregateReceipt } = await import('../../src/core/pulse-policy-codec-v1.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wp803-pulse-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const ledger = await openPulseLedger(directory);
  for (let index = 0; index < inputs.length; index += 1) await ledger.appendReceipt({ idempotencyKey: `wp803-${index}`, expectedSequence: index, receipt: createPulseAggregateReceipt(inputs[index]) });
  const snapshot = await ledger.snapshot();
  return { directory, ledger, snapshot, input: historyInput(snapshot, snapshot.sequence < 2 ? [] : null) };
}
module.exports = { aggregateInputs, historyInput, fixture };
