'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const loadModule = (relativePath) => import(pathToFileURL(path.join(ROOT, relativePath)).href);

const BASE_REVISION = Object.freeze({
  domain: { projectId: 'wp400-project', entityId: 'scene-a' },
  projectRevision: 2,
  entityRevision: 2,
  sourceRevision: 1,
  generation: 0,
  writerEpoch: 0,
});

const LATER_REVISION = Object.freeze({ ...BASE_REVISION, projectRevision: 5, entityRevision: 5 });

function identityInput(overrides = {}) {
  return {
    anchorId: 'anchor-anna',
    projectId: 'wp400-project',
    sceneId: 'scene-a',
    birthRevision: BASE_REVISION,
    ...overrides,
  };
}

test('WP-400 contract: durable identity is stable and contains no fallible witness fields', async () => {
  const lineage = await loadModule('src/core/atlas-anchor-lineage-v1.mjs');
  const identity = lineage.createDurableAnchorIdentity({
    ...identityInput(),
    quote: 'must-not-enter-identity',
    startOffset: 7,
  });
  assert.equal(identity.schemaVersion, lineage.ATLAS_ANCHOR_IDENTITY_SCHEMA_VERSION);
  assert.equal(identity.anchorId, 'anchor-anna');
  assert.equal(Object.isFrozen(identity), true);
  assert.deepEqual(Object.keys(identity), ['schemaVersion', 'anchorId', 'projectId', 'sceneId', 'birthRevision']);
  assert.equal('quote' in identity, false);
  assert.equal('startOffset' in identity, false);
  assert.throws(() => lineage.createDurableAnchorIdentity(identityInput({ anchorId: '' })), (error) => error.code === 'E_ATLAS_ANCHOR_ID_REQUIRED');
  assert.throws(
    () => lineage.createDurableAnchorIdentity(identityInput({
      birthRevision: { ...BASE_REVISION, domain: { projectId: 'wp400-project', entityId: 'other-scene' } },
    })),
    (error) => error.code === 'E_ATLAS_ANCHOR_BIRTH_DOMAIN_MISMATCH',
  );
  assert.throws(
    () => lineage.createDurableAnchorIdentity(identityInput({
      birthRevision: { ...BASE_REVISION, projectRevision: '2' },
    })),
    (error) => error.code === 'E_ATLAS_ANCHOR_BIRTH_REVISION_INVALID',
  );
});

test('WP-400 contract: witness is separately validated and tampering fails closed', async () => {
  const lineage = await loadModule('src/core/atlas-anchor-lineage-v1.mjs');
  const identity = lineage.createDurableAnchorIdentity(identityInput());
  const sceneText = 'Before Anna arrived, Peter left.';
  const witness = lineage.createRelocationWitness(identity, sceneText, { startOffset: 7, endOffset: 11 }, BASE_REVISION);
  assert.equal(witness.schemaVersion, lineage.ATLAS_ANCHOR_WITNESS_SCHEMA_VERSION);
  assert.equal(witness.quote, 'Anna');
  assert.equal(witness.anchorId, identity.anchorId);
  assert.equal(Object.isFrozen(witness), true);
  assert.deepEqual(lineage.validateRelocationWitness(witness, identity), witness);
  assert.throws(
    () => lineage.validateRelocationWitness({ ...witness, quoteHash: '0'.repeat(64) }, identity),
    (error) => error.code === 'E_ATLAS_ANCHOR_WITNESS_QUOTE_HASH_MISMATCH',
  );
  assert.throws(
    () => lineage.validateRelocationWitness({ ...witness, quoteHash: ` ${witness.quoteHash}` }, identity),
    (error) => error.code === 'E_ATLAS_ANCHOR_WITNESS_QUOTE_HASH_INVALID',
  );
  assert.throws(
    () => lineage.validateRelocationWitness({ ...witness, anchorId: 'other-anchor' }, identity),
    (error) => error.code === 'E_ATLAS_ANCHOR_WITNESS_IDENTITY_MISMATCH',
  );
  assert.throws(
    () => lineage.validateRelocationWitness({ ...witness, schemaVersion: 'atlas.anchorWitness.v0' }, identity),
    (error) => error.code === 'E_ATLAS_ANCHOR_WITNESS_SCHEMA_INVALID',
  );
});

test('WP-400 relocation: exact, typed LOST, ambiguity and explicit selection are deterministic', async () => {
  const lineage = await loadModule('src/core/atlas-anchor-lineage-v1.mjs');
  const identity = lineage.createDurableAnchorIdentity(identityInput());
  const birthText = 'Anna arrived.';
  const witness = lineage.createRelocationWitness(identity, birthText, { startOffset: 0, endOffset: 4 }, BASE_REVISION);

  const exact = lineage.relocateAnchor({
    identity,
    witness,
    targetRevision: LATER_REVISION,
    currentSceneText: 'Before. Anna arrived.',
  });
  assert.equal(exact.status, lineage.ATLAS_ANCHOR_STATUS.EXACT);
  assert.equal(exact.basis, 'unique-quote');
  assert.deepEqual({ startOffset: exact.span.startOffset, endOffset: exact.span.endOffset }, { startOffset: 8, endOffset: 12 });
  assert.equal(exact.automaticReattachment, false);
  assert.equal(exact.requiresExplicitReattachment, true);

  const lost = lineage.relocateAnchor({
    identity,
    witness,
    targetRevision: LATER_REVISION,
    currentSceneText: 'Nobody came.',
  });
  assert.equal(lost.status, lineage.ATLAS_ANCHOR_STATUS.LOST);
  assert.equal(lost.reason, 'QUOTE_NOT_FOUND');
  assert.deepEqual(lost.candidates, []);

  const contextNeutralWitness = {
    ...witness,
    prefixContextHash: '0'.repeat(64),
    suffixContextHash: '0'.repeat(64),
  };
  const ambiguous = lineage.relocateAnchor({
    identity,
    witness: contextNeutralWitness,
    targetRevision: LATER_REVISION,
    currentSceneText: 'Anna Anna',
  });
  assert.equal(ambiguous.status, lineage.ATLAS_ANCHOR_STATUS.AMBIGUOUS);
  assert.equal(ambiguous.requiresExplicitSelection, true);
  assert.equal(ambiguous.candidateCount, 2);
  assert.notEqual(ambiguous.candidates[0].candidateId, ambiguous.candidates[1].candidateId);

  const selected = lineage.relocateAnchor({
    identity,
    witness: contextNeutralWitness,
    targetRevision: LATER_REVISION,
    currentSceneText: 'Anna Anna',
    selectedCandidateId: ambiguous.candidates[1].candidateId,
  });
  assert.equal(selected.status, lineage.ATLAS_ANCHOR_STATUS.EXACT);
  assert.equal(selected.basis, 'explicit-selection');
  assert.equal(selected.selectedCandidateId, ambiguous.candidates[1].candidateId);
  assert.deepEqual({ startOffset: selected.span.startOffset, endOffset: selected.span.endOffset }, { startOffset: 5, endOffset: 9 });
  assert.equal(selected.automaticReattachment, false);

  assert.throws(
    () => lineage.relocateAnchor({
      identity,
      witness: contextNeutralWitness,
      targetRevision: LATER_REVISION,
      currentSceneText: 'Anna Anna',
      selectedCandidateId: 'atlas-anchor-candidate:not-present',
    }),
    (error) => error.code === 'E_ATLAS_ANCHOR_SELECTION_NOT_A_CANDIDATE',
  );
});

test('WP-400 relocation: stale, concurrent and cross-scene revision identities are refused', async () => {
  const lineage = await loadModule('src/core/atlas-anchor-lineage-v1.mjs');
  const identity = lineage.createDurableAnchorIdentity(identityInput());
  const witness = lineage.createRelocationWitness(identity, 'Anna arrived.', { startOffset: 0, endOffset: 4 }, BASE_REVISION);
  assert.throws(
    () => lineage.relocateAnchor({
      identity,
      witness,
      targetRevision: { ...BASE_REVISION, entityRevision: 1 },
      currentSceneText: 'Anna arrived.',
    }),
    (error) => error.code === 'E_ATLAS_ANCHOR_TARGET_REVISION_UNRELATED',
  );
  assert.throws(
    () => lineage.relocateAnchor({
      identity,
      witness,
      targetRevision: { ...LATER_REVISION, domain: { projectId: 'wp400-project', entityId: 'scene-b' } },
      currentSceneText: 'Anna arrived.',
    }),
    (error) => error.code === 'E_ATLAS_ANCHOR_TARGET_DOMAIN_MISMATCH',
  );
});

test('WP-400 append-only lineage: entries chain by hash and rewrites or gaps are rejected', async () => {
  const lineage = await loadModule('src/core/atlas-anchor-lineage-v1.mjs');
  const identity = lineage.createDurableAnchorIdentity(identityInput());
  const empty = lineage.createAnchorLineage(identity);
  const first = lineage.appendAnchorLineageEntry(empty, {
    toRevision: LATER_REVISION,
    status: lineage.ATLAS_ANCHOR_STATUS.EXACT,
    basis: 'explicit-selection',
    selectionRequired: true,
    selectedCandidateId: 'candidate-1',
    span: { startOffset: 8, endOffset: 12 },
    witnessHash: 'witness-1',
    reattachmentId: 'reattach-1',
    commandSeq: 5,
  });
  const finalRevision = { ...LATER_REVISION, projectRevision: 6, entityRevision: 6 };
  const second = lineage.appendAnchorLineageEntry(first, {
    toRevision: finalRevision,
    status: lineage.ATLAS_ANCHOR_STATUS.LOST,
    reason: 'QUOTE_NOT_FOUND',
    witnessHash: 'witness-2',
    commandSeq: 6,
  });
  assert.equal(second.entries.length, 2);
  assert.equal(second.entries[1].previousEntryHash, second.entries[0].entryHash);
  assert.equal(second.headEntryHash, second.entries[1].entryHash);
  assert.deepEqual(lineage.verifyAnchorLineage(second), second);
  assert.equal(second.entries.every((entry) => entry.automaticReattachment === false), true);

  const rewritten = JSON.parse(JSON.stringify(second));
  rewritten.entries[0].basis = 'silently-rewritten';
  assert.throws(() => lineage.verifyAnchorLineage(rewritten), (error) => error.code === 'E_ATLAS_ANCHOR_LINEAGE_ENTRY_HASH_MISMATCH');
  assert.throws(
    () => lineage.appendAnchorLineageEntry(first, {
      fromRevision: BASE_REVISION,
      toRevision: finalRevision,
      status: lineage.ATLAS_ANCHOR_STATUS.LOST,
    }),
    (error) => error.code === 'E_ATLAS_ANCHOR_LINEAGE_REVISION_GAP',
  );
});

async function buildRuntimeFixture(finalText) {
  const runtime = await loadModule('src/core/runtime.mjs');
  const derived = await loadModule('src/derived/index.mjs');
  const projectId = 'wp400-runtime-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId, title: 'WP400', sceneId } },
    { type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, payload: { projectId, sceneId, text: 'Anna arrived.' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' } },
  ]);
  assert.equal(built.ok, true);
  const aggregate = derived.deriveAtlasObservationAggregate({ coreState: built.state, params: { projectId, languageCode: 'en' } });
  const observation = aggregate.value.observations[0];
  const confirmed = runtime.reduceCoreState(built.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: 'entity-anna',
      mentionId: observation.mentionId,
      evidenceAnchor: observation.evidenceAnchor,
      decisionId: 'decision-anna-wp400',
    },
  });
  const staleEvidenceAnchor = confirmed.state.data.projects[projectId].atlas.decisions['decision-anna-wp400'].evidenceAnchor;
  const moved = runtime.reduceCoreState(confirmed.state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId, sceneId, text: finalText },
  });
  return { runtime, projectId, sceneId, staleEvidenceAnchor, movedState: moved.state };
}

test('WP-400 runtime integration: ambiguous relocation requires explicit candidate and records immutable lineage without source mutation', async () => {
  const { hashCanonicalValue } = await loadModule('src/core/browser-safe-hash.mjs');
  const fixture = await buildRuntimeFixture('Anna left. Anna arrived.');
  const diagnosis = fixture.runtime.diagnoseAtlasAnchorRelocation({
    evidenceAnchor: fixture.staleEvidenceAnchor,
    sceneId: fixture.sceneId,
    currentSceneText: fixture.movedState.data.projects[fixture.projectId].scenes[fixture.sceneId].text,
  });
  assert.equal(diagnosis.ok, true);
  assert.equal(diagnosis.value.status, 'ambiguous');
  assert.equal(diagnosis.value.candidateCount, 2);
  assert.equal(diagnosis.value.automaticReattachment, false);

  const secondCandidate = diagnosis.value.candidates[1];
  const currentText = fixture.movedState.data.projects[fixture.projectId].scenes[fixture.sceneId].text;
  const newEvidenceAnchor = {
    ...fixture.staleEvidenceAnchor,
    startOffset: secondCandidate.startOffset,
    endOffset: secondCandidate.endOffset,
    quote: 'Anna',
    quoteHash: hashCanonicalValue('Anna'),
    sceneTextHash: hashCanonicalValue(currentText),
  };
  const basePayload = {
    projectId: fixture.projectId,
    sourceRecordKind: 'decision',
    sourceRecordId: 'decision-anna-wp400',
    staleEvidenceAnchor: fixture.staleEvidenceAnchor,
    newEvidenceAnchor,
    reattachmentId: 'wp400-reattach-1',
  };
  const refused = fixture.runtime.reduceCoreState(fixture.movedState, {
    type: fixture.runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH,
    payload: basePayload,
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'E_ATLAS_ANCHOR_SELECTION_REQUIRED');
  assert.equal(refused.stateHash, fixture.runtime.hashCoreState(fixture.movedState));

  const accepted = fixture.runtime.reduceCoreState(fixture.movedState, {
    type: fixture.runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH,
    payload: { ...basePayload, selectedCandidateId: secondCandidate.candidateId },
  });
  assert.equal(accepted.ok, true);
  const project = accepted.state.data.projects[fixture.projectId];
  assert.deepEqual(project.atlas.decisions['decision-anna-wp400'].evidenceAnchor, fixture.staleEvidenceAnchor, 'query and ledger never rewrite source evidence');
  const record = project.atlas.evidenceReattachments['wp400-reattach-1'];
  assert.equal(record.automaticReattachment, false);
  assert.equal(record.durableAnchorIdentity.anchorId, fixture.staleEvidenceAnchor.anchorId);
  assert.equal(record.anchorLineage.entries.length, 1);
  assert.equal(record.anchorLineage.entries[0].selectedCandidateId, secondCandidate.candidateId);
  assert.equal(record.anchorLineage.entries[0].basis, 'explicit-selection');

  const acceptedAgain = fixture.runtime.reduceCoreState(accepted.state, {
    type: fixture.runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH,
    payload: {
      ...basePayload,
      reattachmentId: 'wp400-reattach-2',
      selectedCandidateId: secondCandidate.candidateId,
    },
  });
  assert.equal(acceptedAgain.ok, true);
  const secondRecord = acceptedAgain.state.data.projects[fixture.projectId].atlas.evidenceReattachments['wp400-reattach-2'];
  assert.equal(secondRecord.anchorLineage.entries.length, 2);
  assert.equal(secondRecord.anchorLineage.entries[1].previousEntryHash, secondRecord.anchorLineage.entries[0].entryHash);
  assert.deepEqual(
    acceptedAgain.state.data.projects[fixture.projectId].atlas.evidenceReattachments['wp400-reattach-1'].anchorLineage,
    record.anchorLineage,
    'prior lineage snapshot remains append-only and unchanged',
  );
});

test('WP-400 runtime integration: explicit replacement after LOST starts a separate durable identity lineage', async () => {
  const { hashCanonicalValue } = await loadModule('src/core/browser-safe-hash.mjs');
  const fixture = await buildRuntimeFixture('Nobody came.');
  const currentText = fixture.movedState.data.projects[fixture.projectId].scenes[fixture.sceneId].text;
  const diagnosis = fixture.runtime.diagnoseAtlasAnchorRelocation({
    evidenceAnchor: fixture.staleEvidenceAnchor,
    sceneId: fixture.sceneId,
    currentSceneText: currentText,
  });
  assert.equal(diagnosis.ok, true);
  assert.equal(diagnosis.value.status, 'lost');

  const replacementAnchor = {
    ...fixture.staleEvidenceAnchor,
    anchorId: 'anchor-manual-replacement',
    startOffset: 0,
    endOffset: 6,
    quote: 'Nobody',
    quoteHash: hashCanonicalValue('Nobody'),
    sceneTextHash: hashCanonicalValue(currentText),
  };
  const replaced = fixture.runtime.reduceCoreState(fixture.movedState, {
    type: fixture.runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH,
    payload: {
      projectId: fixture.projectId,
      sourceRecordKind: 'decision',
      sourceRecordId: 'decision-anna-wp400',
      staleEvidenceAnchor: fixture.staleEvidenceAnchor,
      newEvidenceAnchor: replacementAnchor,
      reattachmentId: 'wp400-explicit-new-identity',
      reason: 'author explicitly selected replacement text after LOST',
    },
  });
  assert.equal(replaced.ok, true);
  const project = replaced.state.data.projects[fixture.projectId];
  assert.deepEqual(project.atlas.decisions['decision-anna-wp400'].evidenceAnchor, fixture.staleEvidenceAnchor);
  const record = project.atlas.evidenceReattachments['wp400-explicit-new-identity'];
  assert.equal(record.durableAnchorIdentity.anchorId, replacementAnchor.anchorId);
  assert.equal(record.anchorLineage.entries.length, 1);
  assert.equal(record.anchorLineage.entries[0].basis, 'manual-explicit-new-identity');
  assert.equal(record.automaticReattachment, false);
});

test('WP-400 differential and large-corpus oracle: every candidate is enumerated in stable order', async () => {
  const lineage = await loadModule('src/core/atlas-anchor-lineage-v1.mjs');
  const runtime = await loadModule('src/core/runtime.mjs');
  const { hashCanonicalValue } = await loadModule('src/core/browser-safe-hash.mjs');
  const text = Array.from({ length: 1024 }, (_, index) => (index % 17 === 0 ? 'Anna' : `token-${index}`)).join(' ');
  const witness = {
    startOffset: 0,
    endOffset: 4,
    quote: 'Anna',
    quoteHash: '',
    sceneTextHash: '',
    prefixContextHash: '',
    suffixContextHash: '',
  };
  const result = lineage.diagnoseRelocationWitness({
    anchorId: 'large-anchor',
    sceneId: 'scene-a',
    witness,
    currentSceneText: text,
  });
  const oracle = [];
  for (let offset = text.indexOf('Anna'); offset !== -1; offset = text.indexOf('Anna', offset + 1)) oracle.push(offset);
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates.map((candidate) => candidate.startOffset), oracle);
  assert.equal(new Set(result.candidates.map((candidate) => candidate.candidateId)).size, oracle.length);
  assert.equal(result.automaticReattachment, false);
  assert.equal(oracle.length > 32, true, 'corpus must exercise the runtime candidate boundary');
  const runtimeResult = runtime.diagnoseAtlasAnchorRelocation({
    sceneId: 'scene-a',
    currentSceneText: text,
    evidenceAnchor: {
      schemaVersion: 'atlas.evidenceAnchor.v1',
      anchorId: 'large-anchor',
      projectId: 'large-project',
      sceneId: 'scene-a',
      entityId: 'entity-anna',
      startOffset: 0,
      endOffset: 4,
      quote: 'Anna',
      quoteHash: hashCanonicalValue('Anna'),
      sceneTextHash: hashCanonicalValue('Anna'),
    },
  });
  assert.equal(runtimeResult.ok, true);
  assert.equal(runtimeResult.value.candidateCount, oracle.length);
  assert.deepEqual(runtimeResult.value.candidates.map((candidate) => candidate.startOffset), oracle);
});
