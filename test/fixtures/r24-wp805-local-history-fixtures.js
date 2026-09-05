'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {
  aggregateReceipt,
  consentCommand,
  correctionCommand,
} = require('./r24-wp804-pulse-privacy-fixtures.js');

const ZERO = '0'.repeat(64);
const modulePromise = import('../../src/core/pulse-privacy-v1.mjs');

async function createProjection(directory, { correctionValue = null, secondReceipt = false } = {}) {
  fs.mkdirSync(directory, { recursive: true });
  const { openPulsePrivacyController } = await modulePromise;
  const controller = await openPulsePrivacyController(directory);
  await controller.optIn(consentCommand('OPT_IN', 0, 'wp805-shared-opt-in'));
  const first = await controller.appendReceipt({
    expectedPrivacyRevision: 1,
    idempotencyKey: 'wp805-shared-ledger-1',
    expectedSequence: 0,
    receipt: aggregateReceipt(1, 1, 12, 3),
  });
  if (secondReceipt) await controller.appendReceipt({
    expectedPrivacyRevision: 1,
    idempotencyKey: 'wp805-shared-ledger-2',
    expectedSequence: 1,
    receipt: aggregateReceipt(2, 2, 4, 1),
  });
  if (correctionValue !== null) await controller.appendCorrection(correctionCommand({
    expectedPrivacyRevision: 1,
    targetEntryDigest: first.entry.entryDigest,
    correctedValue: correctionValue,
    requestId: `wp805-correction-${correctionValue}`,
  }));
  return controller.explain();
}

async function createHistoryTriplet(root, { oursValue = 10, theirsValue = 9, oursAppend = false, theirsAppend = false } = {}) {
  const base = await createProjection(path.join(root, 'base'));
  const ours = await createProjection(path.join(root, 'ours'), { correctionValue: oursValue, secondReceipt: oursAppend });
  const theirs = await createProjection(path.join(root, 'theirs'), { correctionValue: theirsValue, secondReceipt: theirsAppend });
  return { base, ours, theirs };
}

function decisionCommand(review, {
  decision = 'KEEP_OURS',
  requestId = 'wp805-local-decision-1',
  sequence = 0,
  headDigest = ZERO,
  conflictId = review.conflicts[0]?.conflictId,
} = {}) {
  return {
    schemaVersion: 'yalken.r24.pulseLocalHistoryDecisionCommand.v1',
    type: 'DECIDE_CONFLICT',
    requestId,
    expectedReviewDigest: review.reviewDigest,
    expectedDecisionSequence: sequence,
    expectedDecisionHeadDigest: headDigest,
    conflictId,
    decision,
  };
}

module.exports = { createHistoryTriplet, createProjection, decisionCommand, ZERO };
