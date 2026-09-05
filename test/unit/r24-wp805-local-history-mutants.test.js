'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { createHistoryTriplet, decisionCommand } = require('../fixtures/r24-wp805-local-history-fixtures.js');

const sourcePath = path.resolve(__dirname, '../../src/core/pulse-local-history-v1.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const originalPromise = import(pathToFileURL(sourcePath).href);
const hashPromise = import('../../src/core/browser-safe-hash.mjs');
const fixture = (t, name) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `yalken-wp805-mutant-${name}-`));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const projectionPayload = value => ({ schemaVersion: value.schemaVersion, policy: value.policy, privacyState: value.privacyState, identity: value.identity, history: value.history });

function mutateOnce(from, to) {
  assert.equal(source.split(from).length - 1, 1, `exactly one mutation site required: ${from}`);
  return source.replace(from, to).replace(/from '(\.\/[^']+)'/gu,
    (_, relative) => `from ${JSON.stringify(pathToFileURL(path.resolve(path.dirname(sourcePath), relative)).href)}`);
}
async function loadMutant(from, to, name) {
  return import(`data:text/javascript;base64,${Buffer.from(mutateOnce(from, to)).toString('base64')}#${encodeURIComponent(name)}`);
}
async function inputAt(t, name) { return createHistoryTriplet(path.join(fixture(t, name), 'history')); }

const mutations = [
  {
    name: 'divergent values mislabeled identical',
    from: "  return 'CONFLICT';\n}",
    to: "  return 'BOTH_IDENTICAL';\n}",
    oracle: async (module, t, name) => assert.equal(module.derivePulseLocalHistoryReview(await inputAt(t, name)).changes[0].classification, 'CONFLICT'),
  },
  {
    name: 'immutable lineage guard removed',
    from: '    if (canonicalSerialize(lineageRow(base.history[index])) !== canonicalSerialize(lineageRow(candidate.history[index]))) {',
    to: '    if (false && canonicalSerialize(lineageRow(base.history[index])) !== canonicalSerialize(lineageRow(candidate.history[index]))) {',
    oracle: async (module, t, name) => {
      const input = await inputAt(t, name);
      input.ours = structuredClone(input.ours);
      input.ours.history[0].effectiveAggregates[1].originalValue = 13;
      input.ours.explanationDigest = (await hashPromise).hashCanonicalValue(projectionPayload(input.ours));
      assert.throws(() => module.derivePulseLocalHistoryReview(input), error => error.code === 'E_WP805_OURS_LINEAGE_DRIFT');
    },
  },
  {
    name: 'review digest revalidation removed',
    from: "        if (command.expectedReviewDigest !== review.reviewDigest) fail('E_WP805_REVIEW_IDENTITY_STALE');",
    to: '        void command.expectedReviewDigest;',
    oracle: async (module, t, name) => {
      const root = fixture(t, name), input = await createHistoryTriplet(path.join(root, 'history'));
      const review = module.derivePulseLocalHistoryReview(input), controller = await module.openPulseLocalHistoryController(path.join(root, 'journal'));
      await assert.rejects(() => controller.appendDecision(input, { ...decisionCommand(review), expectedReviewDigest: 'f'.repeat(64) }), error => error.code === 'E_WP805_REVIEW_IDENTITY_STALE');
    },
  },
  {
    name: 'decision journal identity guard removed',
    from: "        if (command.expectedDecisionSequence !== snapshot.sequence || command.expectedDecisionHeadDigest !== snapshot.headDigest) fail('E_WP805_DECISION_IDENTITY_STALE');",
    to: '        void snapshot.headDigest;',
    oracle: async (module, t, name) => {
      const root = fixture(t, name), input = await createHistoryTriplet(path.join(root, 'history'));
      const review = module.derivePulseLocalHistoryReview(input), controller = await module.openPulseLocalHistoryController(path.join(root, 'journal'));
      await assert.rejects(() => controller.appendDecision(input, { ...decisionCommand(review), expectedDecisionSequence: 1 }), error => error.code === 'E_WP805_DECISION_IDENTITY_STALE');
    },
  },
  {
    name: 'typed conflict identity guard removed',
    from: "        if (!conflict) fail('E_WP805_CONFLICT_ID_STALE');",
    to: "        if (!conflict) return { status: 'MUTANT_ACCEPTED_UNKNOWN_CONFLICT' };",
    oracle: async (module, t, name) => {
      const root = fixture(t, name), input = await createHistoryTriplet(path.join(root, 'history'));
      const review = module.derivePulseLocalHistoryReview(input), controller = await module.openPulseLocalHistoryController(path.join(root, 'journal'));
      await assert.rejects(() => controller.appendDecision(input, { ...decisionCommand(review), conflictId: 'e'.repeat(64) }), error => error.code === 'E_WP805_CONFLICT_ID_STALE');
    },
  },
  {
    name: 'append-only decision head reset',
    from: '          previousEntryDigest: snapshot.headDigest,',
    to: '          previousEntryDigest: PULSE_LEDGER_ZERO_DIGEST,',
    oracle: async (module, t, name) => {
      const root = fixture(t, name), input = await createHistoryTriplet(path.join(root, 'history'));
      const review = module.derivePulseLocalHistoryReview(input), controller = await module.openPulseLocalHistoryController(path.join(root, 'journal'));
      const first = await controller.appendDecision(input, decisionCommand(review, { decision: 'DEFER' }));
      const second = await controller.appendDecision(input, decisionCommand(review, { requestId: 'second', sequence: 1, headDigest: first.entry.entryDigest }));
      assert.equal(second.entry.previousEntryDigest, first.entry.entryDigest);
    },
  },
  {
    name: 'keep ours selects theirs',
    from: "        const selectedValue = command.decision === 'KEEP_OURS' ? conflict.oursValue",
    to: "        const selectedValue = command.decision === 'KEEP_OURS' ? conflict.theirsValue",
    oracle: async (module, t, name) => {
      const root = fixture(t, name), input = await createHistoryTriplet(path.join(root, 'history'));
      const review = module.derivePulseLocalHistoryReview(input), controller = await module.openPulseLocalHistoryController(path.join(root, 'journal'));
      assert.equal((await controller.appendDecision(input, decisionCommand(review))).entry.selectedValue, 10);
    },
  },
  {
    name: 'command unknown field rejection removed',
    from: "  exactKeys(command, ['schemaVersion', 'type', 'requestId', 'expectedReviewDigest', 'expectedDecisionSequence', 'expectedDecisionHeadDigest', 'conflictId', 'decision'], 'E_WP805_COMMAND_SCHEMA');",
    to: '  void command;',
    oracle: async (module, t, name) => {
      const root = fixture(t, name), input = await createHistoryTriplet(path.join(root, 'history'));
      const review = module.derivePulseLocalHistoryReview(input), controller = await module.openPulseLocalHistoryController(path.join(root, 'journal'));
      await assert.rejects(() => controller.appendDecision(input, { ...decisionCommand(review), path: '/tmp/forbidden' }), error => error.code === 'E_WP805_COMMAND_SCHEMA');
    },
  },
  {
    name: 'unresolved conflict reported ready',
    from: "    networkSyncStatus: unresolvedConflictCount === 0 ? 'READY_AFTER_LOCAL_REVIEW' : 'BLOCKED_PENDING_LOCAL_REVIEW',",
    to: "    networkSyncStatus: 'READY_AFTER_LOCAL_REVIEW',",
    oracle: async (module, t, name) => {
      const root = fixture(t, name), input = await createHistoryTriplet(path.join(root, 'history'));
      const controller = await module.openPulseLocalHistoryController(path.join(root, 'journal'));
      assert.equal((await controller.review(input)).networkSyncStatus, 'BLOCKED_PENDING_LOCAL_REVIEW');
    },
  },
  {
    name: 'decision tamper check removed',
    from: "    if (hashCanonicalValue(decisionPayload(entry)) !== entry.entryDigest) fail('E_WP805_DECISION_TAMPER');",
    to: '    void decisionPayload(entry);',
    oracle: async (module, t, name) => {
      const root = fixture(t, name), input = await createHistoryTriplet(path.join(root, 'history'));
      const review = module.derivePulseLocalHistoryReview(input), journal = path.join(root, 'journal');
      let controller = await module.openPulseLocalHistoryController(journal);
      await controller.appendDecision(input, decisionCommand(review));
      const file = path.join(journal, 'pulse-local-history-decisions.v1.jsonl');
      const row = JSON.parse(fs.readFileSync(file, 'utf8')); row.selectedValue = 9;
      const { canonicalSerialize } = await hashPromise;
      fs.writeFileSync(file, `${canonicalSerialize(row)}\n`);
      controller = await module.openPulseLocalHistoryController(journal);
      await assert.rejects(() => controller.review(input), error => error.code === 'E_WP805_DECISION_TAMPER');
    },
  },
];

for (const mutation of mutations) test(`WP805 kills implementation mutant: ${mutation.name}`, async t => {
  const original = await originalPromise;
  await mutation.oracle(original, t, `original-${mutation.name.replaceAll(' ', '-')}`);
  const implementation = await loadMutant(mutation.from, mutation.to, mutation.name);
  await assert.rejects(() => mutation.oracle(implementation, t, `mutant-${mutation.name.replaceAll(' ', '-')}`),
    'real source mutant must be killed by a behavioral oracle');
});
