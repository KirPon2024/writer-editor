'use strict';
const fs = require('node:fs');
const {
  aggregateReceipt,
  consentCommand,
} = require('./r24-wp804-pulse-privacy-fixtures.js');

const privacyPromise = import('../../src/core/pulse-privacy-v1.mjs');

async function seedPulseClaimDirectory(directory, { receipts = 2 } = {}) {
  fs.mkdirSync(directory, { recursive: true });
  const { openPulsePrivacyController } = await privacyPromise;
  const controller = await openPulsePrivacyController(directory);
  await controller.optIn(consentCommand('OPT_IN', 0, 'wp806-fixture-opt-in'));
  for (let index = 0; index < receipts; index += 1) {
    await controller.appendReceipt({
      expectedPrivacyRevision: 1,
      idempotencyKey: `wp806-ledger-${index + 1}`,
      expectedSequence: index,
      receipt: aggregateReceipt(index + 11, index + 21, index === 0 ? 0 : 7, index === 0 ? 0 : 2),
    });
  }
  return directory;
}

function directoryBytes(directory) {
  return Object.fromEntries(fs.readdirSync(directory).sort().map((basename) => [basename, fs.readFileSync(`${directory}/${basename}`)]));
}

module.exports = { directoryBytes, seedPulseClaimDirectory };
