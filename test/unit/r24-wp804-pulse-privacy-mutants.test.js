'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const {
  aggregateReceipt,
  consentCommand,
  correctionCommand,
  disposableDeletePort,
  disposableExportPort,
  effectCommand,
} = require('../fixtures/r24-wp804-pulse-privacy-fixtures.js');

const sourcePath = path.resolve(__dirname, '../../src/core/pulse-privacy-v1.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const originalPromise = import(pathToFileURL(sourcePath).href);
const fixture = t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp804-mutant-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const append = (controller, expectedSequence = 0, idempotencyKey = `mutant-${expectedSequence}`) => controller.appendReceipt({
  expectedPrivacyRevision: 1,
  idempotencyKey,
  expectedSequence,
  receipt: aggregateReceipt(expectedSequence + 1, expectedSequence + 1),
});
function mutateOnce(from, to) {
  assert.equal(source.split(from).length - 1, 1, `exactly one mutation site required: ${from}`);
  return source.replace(from, to).replace(/from '(\.\/[^']+)'/gu,
    (_, relative) => `from ${JSON.stringify(pathToFileURL(path.resolve(path.dirname(sourcePath), relative)).href)}`);
}
async function loadMutant(from, to, name) {
  const mutated = mutateOnce(from, to);
  return import(`data:text/javascript;base64,${Buffer.from(mutated).toString('base64')}#${encodeURIComponent(name)}`);
}

const mutations = [
  {
    name: 'default opt-out removed',
    from: "collectionStatus: 'OPTED_OUT',\n    lastCommandDigest: PULSE_LEDGER_ZERO_DIGEST,",
    to: "collectionStatus: 'OPTED_IN',\n    lastCommandDigest: PULSE_LEDGER_ZERO_DIGEST,",
    oracle: async (module, t) => assert.equal((await (await module.openPulsePrivacyController(fixture(t))).explain()).privacyState.collectionStatus, 'OPTED_OUT'),
  },
  {
    name: 'automatic cleanup allowed',
    from: "automaticCleanup: 'DENIED',",
    to: "automaticCleanup: 'ALLOWED',",
    oracle: async module => assert.equal(module.PULSE_PRIVACY_POLICY_V1.automaticCleanup, 'DENIED'),
  },
  {
    name: 'collection opt-in guard inverted',
    from: "if (current.state.collectionStatus !== 'OPTED_IN') fail('E_WP804_COLLECTION_OPT_IN_REQUIRED');",
    to: "if (current.state.collectionStatus === 'OPTED_IN') fail('E_WP804_COLLECTION_OPT_IN_REQUIRED');",
    oracle: async (module, t) => {
      const controller = await module.openPulsePrivacyController(fixture(t));
      await controller.optIn(consentCommand('OPT_IN', 0));
      assert.equal((await append(controller)).status, 'APPENDED');
    },
  },
  {
    name: 'retention maximum made off by one',
    from: 'if (current.ledger.sequence >= PULSE_LEDGER_DEFAULT_MAX_ENTRIES)',
    to: 'if (current.ledger.sequence > PULSE_LEDGER_DEFAULT_MAX_ENTRIES)',
    oracle: async (module, t) => {
      const fakeLedger = async () => ({
        async snapshot() { return { sequence: 4096, headDigest: 'a'.repeat(64), entries: [] }; },
        async appendReceipt() { return { status: 'MUTANT_APPENDED' }; },
      });
      const controller = await module.openPulsePrivacyController(fixture(t), { openLedger: fakeLedger });
      await controller.optIn(consentCommand('OPT_IN', 0));
      await assert.rejects(() => append(controller, 4096), error => error.code === 'E_WP804_RETENTION_CAPACITY_NO_AUTOCLEANUP');
    },
  },
  {
    name: 'opt-out persistence remains opted in',
    from: "const state = nextState(current.state, 'OPTED_OUT', command.requestDigest);\n        await persistState(state);\n        return cloneFrozen({ status: 'OPTED_OUT', privacyState: state });",
    to: "const state = nextState(current.state, 'OPTED_IN', command.requestDigest);\n        await persistState(state);\n        return cloneFrozen({ status: 'OPTED_OUT', privacyState: state });",
    oracle: async (module, t) => {
      const controller = await module.openPulsePrivacyController(fixture(t));
      await controller.optIn(consentCommand('OPT_IN', 0));
      await controller.optOut(consentCommand('OPT_OUT', 1));
      assert.equal((await controller.explain()).privacyState.collectionStatus, 'OPTED_OUT');
    },
  },
  {
    name: 'correction chain head reset',
    from: 'previousEntryDigest: current.corrections.headDigest,',
    to: 'previousEntryDigest: PULSE_LEDGER_ZERO_DIGEST,',
    oracle: async (module, t) => {
      const controller = await module.openPulsePrivacyController(fixture(t));
      await controller.optIn(consentCommand('OPT_IN', 0));
      const ledger = await append(controller);
      const first = await controller.appendCorrection(correctionCommand({ expectedPrivacyRevision: 1, targetEntryDigest: ledger.entry.entryDigest }));
      const second = await controller.appendCorrection(correctionCommand({ expectedPrivacyRevision: 1, correctionSequence: 1,
        correctionHeadDigest: first.entry.entryDigest, targetEntryDigest: ledger.entry.entryDigest, correctedValue: 8 }));
      assert.equal(second.entry.previousEntryDigest, first.entry.entryDigest);
    },
  },
  {
    name: 'export correction identity guard removed',
    from: "assertLedgerIdentity(command, current.ledger);\n        assertCorrectionIdentity(command, current.corrections);\n        const explanation = explainValue(current);",
    to: "assertLedgerIdentity(command, current.ledger);\n        void current.corrections;\n        const explanation = explainValue(current);",
    oracle: async (module, t) => {
      const calls = [];
      const controller = await module.openPulsePrivacyController(fixture(t), { exportPort: disposableExportPort(calls) });
      await controller.optIn(consentCommand('OPT_IN', 0));
      const ledger = await append(controller);
      const stale = await controller.explain();
      await controller.appendCorrection(correctionCommand({ expectedPrivacyRevision: 1, targetEntryDigest: ledger.entry.entryDigest }));
      await assert.rejects(() => controller.exportOnUserRequest(effectCommand('EXPORT', stale)), error => error.code === 'E_WP804_CORRECTION_IDENTITY_STALE');
      assert.equal(calls.length, 0);
    },
  },
  {
    name: 'delete ledger identity guard removed',
    from: "assertPrivacyRevision(command, current.state);\n        assertLedgerIdentity(command, current.ledger);\n        assertCorrectionIdentity(command, current.corrections);\n        const optedOut = nextState",
    to: "assertPrivacyRevision(command, current.state);\n        void current.ledger;\n        assertCorrectionIdentity(command, current.corrections);\n        const optedOut = nextState",
    oracle: async (module, t) => {
      const controller = await module.openPulsePrivacyController(fixture(t), { deletePort: disposableDeletePort([]) });
      await controller.optIn(consentCommand('OPT_IN', 0));
      await append(controller, 0, 'delete-first');
      const stale = await controller.explain();
      await append(controller, 1, 'delete-second');
      await assert.rejects(() => controller.deleteOnUserRequest(effectCommand('DELETE', stale)), error => error.code === 'E_WP804_LEDGER_IDENTITY_STALE');
    },
  },
  {
    name: 'delete port result validation removed',
    from: "validatePortResult(result, expected, 'E_WP804_DELETE_PORT_RESULT');",
    to: 'void result;',
    oracle: async (module, t) => {
      const controller = await module.openPulsePrivacyController(fixture(t), { deletePort: async () => ({ status: 'FORGED' }) });
      await controller.optIn(consentCommand('OPT_IN', 0));
      const explanation = await controller.explain();
      await assert.rejects(() => controller.deleteOnUserRequest(effectCommand('DELETE', explanation)), error => error.code === 'E_WP804_DELETE_PORT_RESULT');
    },
  },
  {
    name: 'persisted correction no longer bound to current ledger',
    from: 'assertCorrectionsBindLedger(correctionEntries, ledger);',
    to: 'void ledger;',
    oracle: async (module, t) => {
      const entry = { sequence: 1, entryDigest: 'a'.repeat(64), receiptDigest: 'c'.repeat(64),
        receipt: { sourceRevisionOrdinal: 1, generation: 1, aggregates: [{ metricId: 'WORDS_ADDED_COUNT', value: 3 }] } };
      const fakeLedger = async () => ({ async snapshot() { return { sequence: 1, headDigest: entry.entryDigest, entries: [structuredClone(entry)] }; } });
      const controller = await module.openPulsePrivacyController(fixture(t), { openLedger: fakeLedger });
      await controller.optIn(consentCommand('OPT_IN', 0));
      await controller.appendCorrection(correctionCommand({ expectedPrivacyRevision: 1, targetEntryDigest: entry.entryDigest }));
      entry.entryDigest = 'b'.repeat(64);
      await assert.rejects(() => controller.explain(), error => error.code === 'E_WP804_CORRECTION_TARGET_STALE');
    },
  },
];

for (const mutation of mutations) test(`WP804 kills implementation mutant: ${mutation.name}`, async t => {
  const original = await originalPromise;
  await mutation.oracle(original, t);
  const implementation = await loadMutant(mutation.from, mutation.to, mutation.name);
  await assert.rejects(() => mutation.oracle(implementation, t),
    'real source mutant must be killed by a behavioral oracle');
});
