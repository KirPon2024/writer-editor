'use strict';

// R2.4 R0 integration: the revision algebra driving the P0/P1 save lifecycle
// laws and a two-writer lineage conflict scenario.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decideAutosaveAck,
  ACK_OUTCOMES,
  createEditGenerationTracker,
} = require('../../src/core/autosave-generation-v1.cjs');
const {
  REVISION_ORDER,
  RevisionAlgebraError,
  compareRevisionCoordinates,
  isLineageDescendant,
  joinRevisionCoordinates,
  parseRevisionCoordinate,
  serializeRevisionCoordinate,
} = require('../../src/core/revision-algebra-v1.cjs');
const { SAVE_ACK_KINDS, classifySaveAck, applySaveAck } = require('../../src/core/dirty-admission-v1.cjs');

test('the P0 ack law runs on the algebra with identical semantics', () => {
  assert.equal(decideAutosaveAck({ capturedGeneration: 4, latestEditGeneration: 4 }).outcome, ACK_OUTCOMES.CLEAR_DIRTY);
  assert.equal(decideAutosaveAck({ capturedGeneration: 4, latestEditGeneration: 5 }).outcome, ACK_OUTCOMES.KEEP_DIRTY_STALE);
  assert.equal(decideAutosaveAck({ capturedGeneration: null, latestEditGeneration: 5 }).outcome, ACK_OUTCOMES.KEEP_DIRTY_UNBOUND);
  assert.throws(() => decideAutosaveAck({ capturedGeneration: 9, latestEditGeneration: 8 }), (e) => e.code === 'E_GENERATION_REGRESSION');
});

test('full lifecycle through the algebra: edit, stale ack, saved ack, admission', () => {
  const tracker = createEditGenerationTracker();
  tracker.bump();
  const capturedAtFive = tracker.current();
  tracker.bump();
  const latest = tracker.current();
  const decision = decideAutosaveAck({ capturedGeneration: capturedAtFive, latestEditGeneration: latest });
  const ack = classifySaveAck({ writeSucceeded: true, ackOutcome: decision.outcome, savedGeneration: capturedAtFive, latestEditGeneration: latest });
  assert.equal(ack.kind, SAVE_ACK_KINDS.PROTECTED);
  const finalDecision = decideAutosaveAck({ capturedGeneration: latest, latestEditGeneration: latest });
  const finalAck = classifySaveAck({ writeSucceeded: true, ackOutcome: finalDecision.outcome, savedGeneration: latest, latestEditGeneration: latest });
  const admission = applySaveAck({ latestEditGeneration: latest, ackedGeneration: 0 }, finalAck);
  assert.equal(admission.ackedGeneration, latest);
});

test('two writers diverging is a typed conflict, never last-write-wins', () => {
  const base = {
    domain: { projectId: 'proj', entityId: 'scene-7' },
    projectRevision: 1, entityRevision: 1, sourceRevision: 1, generation: 10, writerEpoch: 1,
  };
  const writerA = { ...base, generation: 11, writerEpoch: 2 };
  const writerB = { ...base, entityRevision: 2, writerEpoch: 2 };
  assert.equal(compareRevisionCoordinates(writerA, writerB), REVISION_ORDER.CONCURRENT);
  assert.throws(() => joinRevisionCoordinates(writerA, writerB), (e) => e instanceof RevisionAlgebraError && e.code === 'E_REVISION_CONCURRENT_CONFLICT');
  const aDescendant = { ...writerA, entityRevision: 2 };
  assert.equal(isLineageDescendant(aDescendant, writerB), true);
  const joined = joinRevisionCoordinates(aDescendant, writerB);
  assert.equal(joined.entityRevision, 2);
  assert.equal(joined.generation, 11);
});

test('canonical serialization survives the round trip through storage text', () => {
  const c = {
    domain: { projectId: 'proj-Σ', entityId: 'сцена-İ' },
    projectRevision: 9, entityRevision: 8, sourceRevision: 7, generation: 6, writerEpoch: 5,
  };
  const text = serializeRevisionCoordinate(c);
  assert.equal(compareRevisionCoordinates(parseRevisionCoordinate(text), c), REVISION_ORDER.EQUAL);
});
