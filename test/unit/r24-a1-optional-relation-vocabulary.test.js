'use strict';

// R2.4 A1 optional Atlas relation vocabulary tests: derived-only vocabulary
// rows may summarize existing relation vocabulary and observed cooccurrences,
// but never promote Writer, mutate product truth, or block absence.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function buildFixture() {
  const runtime = await loadModule('src/core/runtime.mjs');
  const derived = await loadModule('src/derived/index.mjs');
  const projectId = 'r24-a1-project';
  const sceneId = 'scene-a';
  const stateResult = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'R24 A1', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text: 'Anna trusts Mira. Mira protects Anna.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-mira', name: 'Mira', entityKind: 'character' },
    },
  ]);
  assert.equal(stateResult.ok, true);
  const state = cloneJson(stateResult.state);
  state.data.projects[projectId].atlas.relationVocabulary['relation-ally'] = {
    id: 'relation-ally',
    schemaVersion: 'atlas.customVocabularyRow.v1',
    vocabularyKind: 'relation',
    label: 'Ally',
    normalizedLabel: 'ally',
    appliesTo: 'relationKind',
    aliases: ['Protector'],
    description: 'Author-defined relation vocabulary.',
    authorConfirmed: true,
  };
  return { runtime, derived, projectId, state };
}

test('A1 builds a read-only optional vocabulary packet from author rows and observed cooccurrences', async () => {
  const { derived, projectId, state } = await buildFixture();
  const beforeHash = derived.hashCanonicalValue(state);
  const result = derived.deriveAtlasOptionalRelationVocabulary({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasOptionalRelationVocabulary: true } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_OPTIONAL_RELATION_VOCABULARY_SCHEMA_VERSION);
  assert.equal(result.value.projectId, projectId);
  assert.equal(result.value.state, 'ready');
  assert.equal(result.value.programBinding.stageId, 'A1_OPTIONAL_RELATION_VOCABULARY');
  assert.equal(result.value.programBinding.optionalNonBlocking, true);
  assert.equal(result.value.programBinding.writerBlocking, false);
  assert.equal(result.value.programBinding.programVerdictContribution, false);
  assert.deepEqual(result.value.programBinding.requiredEvidence, ['E2_CONTRACT', 'E3_INTEGRATION']);

  assert.equal(result.value.authority.readModelOnly, true);
  assert.equal(result.value.authority.commandAuthority, 'none');
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(result.value.authority.manuscriptMutation, false);
  assert.equal(result.value.authority.storageMutation, false);
  assert.equal(result.value.authority.networkMutation, false);
  assert.equal(result.value.authority.rendererMutation, false);
  assert.equal(result.value.authority.claimPromotion, false);

  assert.equal(result.value.summary.authorVocabularyRowCount, 1);
  assert.equal(result.value.summary.observedRelationRowCount, 1);
  assert.equal(result.value.summary.rejectedRowCount, 0);
  assert.match(result.value.summary.vocabularyHash, /^[0-9a-f]{64}$/u);
  assert.match(result.value.evidence.sourceHashes.authorRelationVocabularyHash, /^[0-9a-f]{64}$/u);
  assert.match(result.value.evidence.sourceHashes.observedCooccurrenceHash, /^[0-9a-f]{64}$/u);
  assert.equal(result.value.evidence.optionalNonBlocking, true);
  assert.equal(result.value.evidence.writerBlocking, false);
  assert.equal(result.value.evidence.programVerdictContribution, false);

  const author = result.value.authorVocabularyRows[0];
  assert.equal(author.schemaVersion, derived.ATLAS_OPTIONAL_RELATION_VOCABULARY_ROW_SCHEMA_VERSION);
  assert.equal(author.rowKind, derived.ATLAS_OPTIONAL_RELATION_VOCABULARY_ROW_KIND.AUTHOR_RELATION_VOCABULARY);
  assert.equal(author.label, 'Ally');
  assert.equal(author.normalizedLabel, 'ally');
  assert.equal(author.observedOnly, false);
  assert.equal(author.projectTruthMutation, false);

  const observed = result.value.observedRelationRows[0];
  assert.equal(observed.rowKind, derived.ATLAS_OPTIONAL_RELATION_VOCABULARY_ROW_KIND.OBSERVED_COOCCURRENCE);
  assert.equal(observed.relationKind, 'cooccurrence');
  assert.equal(observed.leftEntityId, 'entity-anna');
  assert.equal(observed.rightEntityId, 'entity-mira');
  assert.equal(observed.sceneCount, 1);
  assert.equal(observed.observedOnly, true);
  assert.equal(derived.hashCanonicalValue(state), beforeHash);

  console.log(`R24_A1_OPTIONAL_RELATION_VOCABULARY_RECEIPT=${JSON.stringify({
    state: result.value.state,
    authorRows: result.value.summary.authorVocabularyRowCount,
    observedRows: result.value.summary.observedRelationRowCount,
    hash: result.value.summary.vocabularyHash,
  })}`);
});

test('A1 fails closed for missing project identity and disabled capability', async () => {
  const { derived, projectId, state } = await buildFixture();
  const missingProjectId = derived.deriveAtlasOptionalRelationVocabulary({
    coreState: state,
    params: {},
  });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_OPTIONAL_RELATION_VOCABULARY_PROJECT_ID_REQUIRED');

  const missingProject = derived.deriveAtlasOptionalRelationVocabulary({
    coreState: state,
    params: { projectId: 'missing-project' },
  });
  assert.equal(missingProject.ok, false);
  assert.equal(missingProject.error.code, 'E_ATLAS_OPTIONAL_RELATION_VOCABULARY_PROJECT_NOT_FOUND');

  const disabled = derived.deriveAtlasOptionalRelationVocabulary({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasOptionalRelationVocabulary: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.reason, 'ATLAS_OPTIONAL_RELATION_VOCABULARY_DISABLED');
});

test('A1 keeps malformed local vocabulary neutral, degraded, and private-payload closed', async () => {
  const { derived, projectId, state } = await buildFixture();
  const degradedState = cloneJson(state);
  degradedState.data.projects[projectId].atlas.relationVocabulary['bad-empty'] = {
    id: 'bad-empty',
    label: '',
    path: '/tmp/private-book.json',
    content: 'private manuscript bytes',
  };
  degradedState.data.projects[projectId].atlas.relationVocabulary['duplicate-ally'] = {
    id: 'duplicate-ally',
    label: 'ally',
  };

  const result = derived.deriveAtlasOptionalRelationVocabulary({
    coreState: degradedState,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasOptionalRelationVocabulary: true } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.state, 'degraded');
  assert.equal(result.value.summary.optionalNonBlocking, true);
  assert.equal(result.value.summary.absenceNeutral, true);
  assert.equal(result.value.summary.writerBlocking, false);
  assert.equal(result.value.summary.projectTruthMutation, false);
  assert.equal(result.value.summary.rejectedRowCount, 2);
  assert.deepEqual(
    result.value.rejectedRows.map((row) => row.code).sort(),
    ['RELATION_VOCABULARY_DUPLICATE_NORMALIZED_LABEL', 'RELATION_VOCABULARY_LABEL_REQUIRED'],
  );
  assert.equal(result.value.rejectedRows.every((row) => row.blocksWriter === false && row.optionalNonBlocking === true), true);
  assert.equal(JSON.stringify(result.value).includes('/tmp/private-book.json'), false);
  assert.equal(JSON.stringify(result.value).includes('private manuscript bytes'), false);
});

test('A1 absence of relation vocabulary remains a neutral empty optional packet', async () => {
  const { derived, projectId, state } = await buildFixture();
  const emptyState = cloneJson(state);
  emptyState.data.projects[projectId].atlas.relationVocabulary = {};
  emptyState.data.projects[projectId].scenes['scene-a'].text = 'Anna writes alone.';

  const result = derived.deriveAtlasOptionalRelationVocabulary({
    coreState: emptyState,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasOptionalRelationVocabulary: true } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.state, 'empty');
  assert.equal(result.value.summary.authorVocabularyRowCount, 0);
  assert.equal(result.value.summary.observedRelationRowCount, 0);
  assert.equal(result.value.programBinding.optionalNonBlocking, true);
  assert.equal(result.value.programBinding.absenceNeutral, true);
  assert.equal(result.value.programBinding.writerBlocking, false);
  assert.equal(result.value.authority.projectTruthMutation, false);
});
