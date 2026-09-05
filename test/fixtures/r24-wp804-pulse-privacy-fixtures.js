'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');

const PULSE_PRIVACY_COMMAND_SCHEMA = 'yalken.r24.pulsePrivacyCommand.v1';
const PULSE_LEDGER_ZERO_DIGEST = '0'.repeat(64);

const canonical = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');

function aggregateReceipt(sourceRevisionOrdinal = 1, generation = 1, added = 12, deleted = 3) {
  const payload = {
    schemaVersion: 'yalken.r24.pulseLocalAggregateReceipt.v1',
    policyId: 'WP800_LOCAL_AGGREGATES_CONTENT_FREE_V1',
    sourceRevisionOrdinal,
    generation,
    aggregates: [
      { metricId: 'SESSIONS_COMPLETED_COUNT', value: 1 },
      { metricId: 'WORDS_ADDED_COUNT', value: added },
      { metricId: 'WORDS_DELETED_COUNT', value: deleted },
    ],
    privacy: { scope: 'LOCAL_AGGREGATES_ONLY', content: 'DENIED', identity: 'DENIED', path: 'DENIED', network: 'DENIED', export: 'DENIED', telemetry: 'DENIED' },
  };
  return Object.freeze({ ...payload, payloadDigest: hash(payload) });
}

const consentCommand = (type, expectedPrivacyRevision, requestId = `fixture-${type.toLowerCase()}-${expectedPrivacyRevision}`) => ({
  schemaVersion: PULSE_PRIVACY_COMMAND_SCHEMA,
  type,
  requestId,
  expectedPrivacyRevision,
});

function correctionCommand({
  expectedPrivacyRevision,
  correctionSequence = 0,
  correctionHeadDigest = PULSE_LEDGER_ZERO_DIGEST,
  targetLedgerSequence = 1,
  targetEntryDigest,
  metricId = 'WORDS_ADDED_COUNT',
  correctedValue = 10,
  requestId = `fixture-correction-${correctionSequence + 1}`,
}) {
  return {
    schemaVersion: PULSE_PRIVACY_COMMAND_SCHEMA,
    type: 'CORRECT',
    requestId,
    expectedPrivacyRevision,
    expectedCorrectionSequence: correctionSequence,
    expectedCorrectionHeadDigest: correctionHeadDigest,
    targetLedgerSequence,
    targetEntryDigest,
    metricId,
    correctedValue,
  };
}

function effectCommand(type, explanation, requestId = `fixture-${type.toLowerCase()}-${explanation.identity.privacyRevision}`) {
  return {
    schemaVersion: PULSE_PRIVACY_COMMAND_SCHEMA,
    type,
    requestId,
    expectedPrivacyRevision: explanation.identity.privacyRevision,
    expectedLedgerSequence: explanation.identity.ledgerSequence,
    expectedLedgerHeadDigest: explanation.identity.ledgerHeadDigest,
    expectedCorrectionSequence: explanation.identity.correctionSequence,
    expectedCorrectionHeadDigest: explanation.identity.correctionHeadDigest,
  };
}

function disposableExportPort(calls) {
  return async request => {
    calls.push(request);
    return { status: 'EXPORTED', requestDigest: request.requestDigest, payloadDigest: request.payloadDigest };
  };
}

function disposableDeletePort(calls) {
  return async request => {
    calls.push(request);
    for (const basename of request.basenames) {
      if (basename.includes('/') || basename.includes('\\') || basename === '.' || basename === '..') throw new Error('UNSAFE_FIXTURE_BASENAME');
      try { fs.unlinkSync(`${request.directory}/${basename}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return { status: 'DELETED', requestDigest: request.requestDigest, deletedBasenames: [...request.basenames] };
  };
}

module.exports = { aggregateReceipt, consentCommand, correctionCommand, disposableDeletePort, disposableExportPort, effectCommand };
