'use strict';

// R2.4 T1 adoption: the atlas evidence reattach port carries the typed
// anchor lineage diagnosis on stale witnesses.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

async function buildFixture(finalText) {
  const runtime = await loadModule('src/core/runtime.mjs');
  const derived = await loadModule('src/derived/index.mjs');
  const projectId = 't1-diagnosis-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId, title: 'T1 diagnosis', sceneId } },
    { type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, payload: { projectId, sceneId, text: 'Anna arrived.' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' } },
  ]);
  assert.equal(built.ok, true);
  const aggregate = derived.deriveAtlasObservationAggregate({ coreState: built.state, params: { projectId, languageCode: 'en' } });
  assert.equal(aggregate.ok, true);
  const anna = aggregate.value.observations[0];
  assert.ok(anna);
  const confirmed = runtime.reduceCoreState(built.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: 'entity-anna',
      mentionId: anna.mentionId,
      evidenceAnchor: anna.evidenceAnchor,
      decisionId: 'decision-anna-t1',
    },
  });
  assert.equal(confirmed.ok, true);
  const anchor = confirmed.state.data.projects[projectId].atlas.decisions['decision-anna-t1'].evidenceAnchor;
  assert.equal(anchor.quote, 'Anna');
  const moved = runtime.reduceCoreState(confirmed.state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId, sceneId, text: finalText },
  });
  assert.equal(moved.ok, true);
  return { runtime, projectId, sceneId, anchor, movedState: moved.state };
}

function reattachWithStaleAnchor(runtime, { projectId, anchor, movedState }) {
  return runtime.reduceCoreState(movedState, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH,
    payload: {
      projectId,
      sourceRecordKind: 'decision',
      sourceRecordId: 'decision-anna-t1',
      staleEvidenceAnchor: anchor,
      newEvidenceAnchor: anchor,
    },
  });
}

test('T1 adoption: single surviving quote yields an exact typed diagnosis', async () => {
  const fixture = await buildFixture('Before. Anna arrived.');
  const result = reattachWithStaleAnchor(fixture.runtime, fixture);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_ATLAS_EVIDENCE_STALE');
  const diagnosis = result.error.details && result.error.details.anchorDiagnosis;
  assert.ok(diagnosis, 'anchorDiagnosis must be present');
  assert.equal(diagnosis.status, 'exact');
  assert.equal(diagnosis.basis, 'quote');
  assert.equal(diagnosis.candidateCount, 1);
  assert.deepEqual(diagnosis.candidates, [{ startOffset: 8, endOffset: 12 }]);
});

test('T1 adoption: duplicated quote yields an ambiguous typed diagnosis, never a silent first match', async () => {
  const fixture = await buildFixture('Anna left. Anna arrived.');
  const result = reattachWithStaleAnchor(fixture.runtime, fixture);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_ATLAS_EVIDENCE_STALE');
  const diagnosis = result.error.details && result.error.details.anchorDiagnosis;
  assert.ok(diagnosis);
  assert.equal(diagnosis.status, 'ambiguous');
  assert.equal(diagnosis.candidateCount, 2);
  assert.deepEqual(diagnosis.candidates, [
    { startOffset: 0, endOffset: 4 },
    { startOffset: 11, endOffset: 15 },
  ]);
});

test('T1 adoption: vanished quote yields a lost typed diagnosis', async () => {
  const fixture = await buildFixture('Nobody came.');
  const result = reattachWithStaleAnchor(fixture.runtime, fixture);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_ATLAS_EVIDENCE_STALE');
  const diagnosis = result.error.details && result.error.details.anchorDiagnosis;
  assert.ok(diagnosis);
  assert.equal(diagnosis.status, 'lost');
  assert.equal(diagnosis.candidateCount, 0);
  assert.deepEqual(diagnosis.candidates, []);
});

test('T1 adoption: a still-valid witness passes with no diagnosis and no behavior change', async () => {
  const runtime = await loadModule('src/core/runtime.mjs');
  const derived = await loadModule('src/derived/index.mjs');
  const projectId = 't1-valid-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId, title: 'T1 valid', sceneId } },
    { type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, payload: { projectId, sceneId, text: 'Anna arrived.' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' } },
  ]);
  const aggregate = derived.deriveAtlasObservationAggregate({ coreState: built.state, params: { projectId, languageCode: 'en' } });
  const anna = aggregate.value.observations[0];
  const confirmed = runtime.reduceCoreState(built.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: 'entity-anna',
      mentionId: anna.mentionId,
      evidenceAnchor: anna.evidenceAnchor,
      decisionId: 'decision-anna-valid',
    },
  });
  assert.equal(confirmed.ok, true);
  const anchor = confirmed.state.data.projects[projectId].atlas.decisions['decision-anna-valid'].evidenceAnchor;
  const result = runtime.reduceCoreState(confirmed.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH,
    payload: {
      projectId,
      sourceRecordKind: 'decision',
      sourceRecordId: 'decision-anna-valid',
      staleEvidenceAnchor: anchor,
      newEvidenceAnchor: anchor,
    },
  });
  assert.equal(result.ok, true, 'a witness that still matches the scene must reattach cleanly');
});
