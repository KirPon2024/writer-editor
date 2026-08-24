'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { classifyProjectCommitState, commitProjectTextAndManifest } = require('../../src/core/project-commit-v1.cjs');
const { openTransactionalInboxOutbox } = require('../../src/core/transactional-inbox-outbox-v1.cjs');
const { ACK_OUTCOMES, decideAutosaveAck, mergeSignaledGeneration } = require('../../src/core/autosave-generation-v1.cjs');
const { SAVE_ACK_KINDS, classifySaveAck } = require('../../src/core/dirty-admission-v1.cjs');
const {
  LIFECYCLE_EVENTS,
  LIFECYCLE_REASONS,
  OUTBOX_OBSERVATION_SOURCES,
  createFreshOutboxObservation,
  evaluateLifecycleBarrier,
} = require('../../src/core/lifecycle-conflict-v1.cjs');

const SUBJECT = 'project:physical/document:scene';
const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r5-')));
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const digestFile = (filePath) => sha256hex(fs.readFileSync(filePath));
function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'missing function ' + name);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error('unterminated function ' + name);
}
const diskReceipt = (generation, scenePath, committedDigest) => ({
  schemaVersion: 'yalken.lifecycleDiskObservation.v1',
  subjectId: SUBJECT,
  observationGeneration: generation,
  committedDigest,
  observedDiskDigest: digestFile(scenePath),
  p3Classification: classifyProjectCommitState(scenePath).classification,
});
async function freshOutboxReceipt(dir, generation) {
  const fresh = await openTransactionalInboxOutbox(dir);
  return createFreshOutboxObservation({
    subjectId: SUBJECT,
    observationGeneration: generation,
    inboxOutbox: fresh,
  });
}

test('crash recovery consumes a fresh R4 reopen and physical publication proof', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  const manifestPath = path.join(dir, 'manifest.json');
  const box = await openTransactionalInboxOutbox(dir);
  const committed = await commitProjectTextAndManifest({
    scenePath,
    sceneContent: 'payload-v1',
    revision: 1,
    persistManifest: async () => ({ persisted: true, manifest: { v: 1 } }),
    intentInbox: box,
    intentId: 'commit-scene-1',
  });
  await box.stageEffect({ intentId: 'commit-scene-1', effectId: 'effect-manifest', kind: 'fs.write', detail: { target: 'manifest' } });

  const blocked = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    subjectId: SUBJECT,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    outboxObservation: await freshOutboxReceipt(dir, 1),
    diskObservation: diskReceipt(1, scenePath, committed.sceneDigest),
  });
  assert.equal(blocked.reason, LIFECYCLE_REASONS.PENDING_EFFECT_REPLAY_REQUIRED);

  fs.writeFileSync(manifestPath, JSON.stringify({ v: 1 }));
  assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).v, 1);
  await box.markEffectPublished('effect-manifest');

  const allowed = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    subjectId: SUBJECT,
    latestEditGeneration: 1,
    ackedGeneration: 1,
    outboxObservation: await freshOutboxReceipt(dir, 1),
    diskObservation: diskReceipt(1, scenePath, committed.sceneDigest),
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.reason, LIFECYCLE_REASONS.RECOVERY_CLEAN);
});

test('fresh reopen prevents a stale R4 handle from claiming no pending effects', async () => {
  const dir = sandbox();
  const stale = await openTransactionalInboxOutbox(dir);
  const writer = await openTransactionalInboxOutbox(dir);
  await writer.admitIntent({ intentId: 'i1', kind: 'commit', payload: { revision: 1 } });
  await writer.markExecuted('i1', { ok: true });
  await writer.stageEffect({ intentId: 'i1', effectId: 'e1', kind: 'fs.write', detail: {} });
  assert.equal(stale.pendingEffects().length, 0);
  const receipt = await freshOutboxReceipt(dir, 0);
  assert.equal(receipt.pendingEffects.length, 1);
});

test('P3 residue and corruption classifications block recovery', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  fs.writeFileSync(scenePath, 'old');
  fs.writeFileSync(path.join(dir, 'scene.txt.p3-orphan.tmp'), 'prepared');
  const receipt = {
    schemaVersion: 'yalken.lifecycleDiskObservation.v1',
    subjectId: SUBJECT,
    observationGeneration: 0,
    committedDigest: digestFile(scenePath),
    observedDiskDigest: digestFile(scenePath),
    p3Classification: classifyProjectCommitState(scenePath).classification,
  };
  const decision = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.CRASH_RECOVERY,
    subjectId: SUBJECT,
    latestEditGeneration: 0,
    ackedGeneration: 0,
    outboxObservation: await freshOutboxReceipt(dir, 0),
    diskObservation: receipt,
  });
  assert.equal(receipt.p3Classification, 'RESUMABLE_PREPARED');
  assert.equal(decision.reason, LIFECYCLE_REASONS.PROJECT_RECOVERY_REQUIRED);
});

test('physical external edit is subject-bound and diverges', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  fs.writeFileSync(scenePath, 'committed');
  const committedDigest = digestFile(scenePath);
  fs.writeFileSync(scenePath, 'external');
  const decision = evaluateLifecycleBarrier({
    eventKind: LIFECYCLE_EVENTS.EXTERNAL_EDIT,
    subjectId: SUBJECT,
    latestEditGeneration: 2,
    ackedGeneration: 2,
    outboxObservation: {
      schemaVersion: 'yalken.lifecycleOutboxObservation.v1',
      subjectId: SUBJECT,
      observationGeneration: 2,
      source: OUTBOX_OBSERVATION_SOURCES.NOT_ATTACHED,
      outboxDigest: null,
      pendingEffects: [],
    },
    diskObservation: {
      schemaVersion: 'yalken.lifecycleDiskObservation.v1',
      subjectId: SUBJECT,
      observationGeneration: 2,
      committedDigest,
      observedDiskDigest: digestFile(scenePath),
      p3Classification: 'OLD_COMMITTED',
    },
  });
  assert.equal(decision.reason, LIFECYCLE_REASONS.EXTERNAL_DIVERGENCE_DETECTED);
});

test('main quit joins saves and renderer false-clean signals have no authority', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /if \(activeAutoSavePromise\) return activeAutoSavePromise;/);
  assert.match(main, /const decision = evaluateLifecycleBarrier\(\{/);
  assert.match(main, /return decision\.allowed === true;/);
  assert.match(main, /RENDERER_FALSE_CANNOT_CLEAR_MAIN_DIRTY/);
  assert.doesNotMatch(main, /isDirty = payload\.state;/);
  assert.match(main, /guardedOn\('dirty-changed', \(_, state\) => \{\n  if \(state === true\) isDirty = true;/);
  assert.match(main, /function acknowledgeMainOwnedSave\(savedGeneration\)/);
  assert.equal((main.match(/acknowledgeMainOwnedSave\(snapshot\.generation\)/g) || []).length, 3);
  assert.match(main, /wasUntitled && saveAck\.kind === SAVE_ACK_KINDS\.SAVED/);
  assert.match(main, /result\.subjectId !== subjectId/);
  assert.equal((main.match(/const saveSubjectId = currentLifecycleSubjectId\(\);/g) || []).length, 2);
  assert.match(main, /fileManager\.writeFileAtomic\(saveTargetPath, content\)/);
  const closeBlock = main.slice(main.indexOf("mainWindow.on('close'"), main.indexOf("mainWindow.on('closed'"));
  assert.ok(closeBlock.indexOf('await persistWindowState(bounds)') < closeBlock.indexOf('await confirmDiscardChanges()'));
  const quitBlock = main.slice(main.indexOf("app.on('before-quit'"), main.indexOf("app.on('window-all-closed'"));
  assert.ok(quitBlock.indexOf('await persistWindowState(bounds)') < quitBlock.indexOf('await confirmDiscardChanges()'));
});

test('main save and single-flight coordinators execute the exact generation and join laws', async () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  const acknowledgeSource = extractFunction(main, 'acknowledgeMainOwnedSave');
  const acknowledgeHarness = [
    'let lastSignaledEditGeneration = 5;',
    'const states = [];',
    'function setDirtyState(state, ack = null) { states.push({ state, ack }); }',
    acknowledgeSource,
    'return { run: acknowledgeMainOwnedSave, states };',
  ].join('\n');
  const buildAcknowledger = new Function(
    'mergeSignaledGeneration',
    'decideAutosaveAck',
    'classifySaveAck',
    'SAVE_ACK_KINDS',
    'ACK_OUTCOMES',
    acknowledgeHarness,
  );
  const acknowledger = buildAcknowledger(
    mergeSignaledGeneration,
    decideAutosaveAck,
    classifySaveAck,
    SAVE_ACK_KINDS,
    ACK_OUTCOMES,
  );
  const stale = acknowledger.run(4);
  assert.equal(stale.kind, SAVE_ACK_KINDS.PROTECTED);
  assert.equal(acknowledger.states.at(-1).state, true);
  const exact = acknowledger.run(5);
  assert.equal(exact.kind, SAVE_ACK_KINDS.SAVED);
  assert.equal(acknowledger.states.at(-1).state, false);

  const autoSaveSource = extractFunction(main, 'autoSave');
  const singleFlightHarness = [
    'let activeAutoSavePromise = null;',
    'let calls = 0;',
    'let release;',
    'function runAutoSave() {',
    '  calls += 1;',
    '  return new Promise((resolve) => { release = resolve; });',
    '}',
    autoSaveSource,
    'return { run: autoSave, calls: () => calls, release: (value) => release(value) };',
  ].join('\n');
  const singleFlight = new Function(singleFlightHarness)();
  const first = singleFlight.run();
  const second = singleFlight.run();
  assert.equal(first, second);
  assert.equal(singleFlight.calls(), 1);
  singleFlight.release({ ok: true });
  await first;
  await Promise.resolve();
  const third = singleFlight.run();
  assert.equal(singleFlight.calls(), 2);
  singleFlight.release({ ok: true });
  await third;
});
