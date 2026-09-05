'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const historyPromise = import('../../src/core/pulse-local-history-v1.mjs');
const { createHistoryTriplet, decisionCommand } = require('../fixtures/r24-wp805-local-history-fixtures.js');

const fixture = t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp805-integration-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};

test('WP805 reopens the append-only local review decision in a fresh process', async t => {
  const { derivePulseLocalHistoryReview, openPulseLocalHistoryController } = await historyPromise;
  const root = fixture(t);
  const input = await createHistoryTriplet(path.join(root, 'history'));
  const review = derivePulseLocalHistoryReview(input);
  const journal = path.join(root, 'journal');
  const controller = await openPulseLocalHistoryController(journal);
  await controller.appendDecision(input, decisionCommand(review));
  const inputPath = path.join(root, 'review-input.json');
  fs.writeFileSync(inputPath, `${JSON.stringify(input)}\n`);
  const moduleUrl = pathToFileURL(path.resolve('src/core/pulse-local-history-v1.mjs')).href;
  const source = `import fs from 'node:fs'; import {openPulseLocalHistoryController} from ${JSON.stringify(moduleUrl)}; const input=JSON.parse(fs.readFileSync(process.argv[1])); const c=await openPulseLocalHistoryController(process.argv[2]); process.stdout.write(JSON.stringify(await c.review(input)));`;
  const reopened = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', source, inputPath, journal], { encoding: 'utf8' }));
  assert.equal(reopened.decisionSnapshot.sequence, 1);
  assert.equal(reopened.conflicts[0].decision, 'KEEP_OURS');
  assert.equal(reopened.networkSyncStatus, 'READY_AFTER_LOCAL_REVIEW');
});

test('WP805 binds a decision to the exact immutable WP804 projection identities', async t => {
  const { derivePulseLocalHistoryReview, openPulseLocalHistoryController } = await historyPromise;
  const root = fixture(t);
  const input = await createHistoryTriplet(path.join(root, 'history'));
  const review = derivePulseLocalHistoryReview(input);
  const controller = await openPulseLocalHistoryController(path.join(root, 'journal'));
  const first = await controller.appendDecision(input, decisionCommand(review));
  const changed = await createHistoryTriplet(path.join(root, 'changed'), { oursValue: 6, theirsValue: 5 });
  await assert.rejects(() => controller.appendDecision(changed, {
    ...decisionCommand(review, { requestId: 'stale-review-2', sequence: 1, headDigest: first.entry.entryDigest }),
  }), error => error.code === 'E_WP805_REVIEW_IDENTITY_STALE');
  assert.equal((await controller.review(input)).decisionSnapshot.sequence, 1);
});

test('WP805 rejects a tampered or noncanonical decision chain before reporting sync readiness', async t => {
  const { derivePulseLocalHistoryReview, openPulseLocalHistoryController } = await historyPromise;
  const root = fixture(t);
  const input = await createHistoryTriplet(path.join(root, 'history'));
  const review = derivePulseLocalHistoryReview(input);
  const journal = path.join(root, 'journal');
  let controller = await openPulseLocalHistoryController(journal);
  await controller.appendDecision(input, decisionCommand(review));
  const decisionPath = path.join(journal, 'pulse-local-history-decisions.v1.jsonl');
  const row = JSON.parse(fs.readFileSync(decisionPath, 'utf8'));
  row.selectedValue = 9;
  fs.writeFileSync(decisionPath, `${JSON.stringify(row)}\n`);
  controller = await openPulseLocalHistoryController(journal);
  await assert.rejects(() => controller.review(input), error => ['E_WP805_DECISION_CANONICAL', 'E_WP805_DECISION_TAMPER'].includes(error.code));
});

test('WP805 completes the disposable local review flow with no network or effect port', async t => {
  const { derivePulseLocalHistoryReview, openPulseLocalHistoryController } = await historyPromise;
  const root = fixture(t);
  const input = await createHistoryTriplet(path.join(root, 'history'));
  const review = derivePulseLocalHistoryReview(input);
  const controller = await openPulseLocalHistoryController(path.join(root, 'journal'));
  assert.deepEqual(Object.keys(controller).sort(), ['appendDecision', 'review']);
  const before = await controller.review(input);
  assert.equal(before.networkSyncStatus, 'BLOCKED_PENDING_LOCAL_REVIEW');
  await controller.appendDecision(input, decisionCommand(review, { decision: 'KEEP_THEIRS' }));
  const after = await controller.review(input);
  assert.equal(after.networkSyncStatus, 'READY_AFTER_LOCAL_REVIEW');
  assert.equal(after.conflicts[0].selectedValue, 9);
  const source = fs.readFileSync(path.resolve('src/core/pulse-local-history-v1.mjs'), 'utf8');
  for (const forbidden of ['fetch(', 'http.request', 'https.request', 'net.connect', 'child_process']) assert(!source.includes(forbidden));
});
