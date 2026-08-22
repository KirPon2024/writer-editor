'use strict';

// R2.4 A1 integration checks: the optional vocabulary projection is exported
// through normal derived barrels, deterministic across object ordering, and
// side-effect closed at source level.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const DERIVE_SOURCE = path.join(ROOT, 'src', 'derived', 'atlas', 'deriveAtlasOptionalRelationVocabulary.mjs');
const TYPES_SOURCE = path.join(ROOT, 'src', 'derived', 'atlas', 'atlasOptionalRelationVocabularyTypes.mjs');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function baseState() {
  const runtime = await loadModule('src/core/runtime.mjs');
  const projectId = 'r24-a1-integration-project';
  const sceneId = 'scene-a';
  const result = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'A1 integration', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text: 'Iris follows Sol. Sol challenges Iris.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-iris', name: 'Iris', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-sol', name: 'Sol', entityKind: 'character' },
    },
  ]);
  assert.equal(result.ok, true);
  return { projectId, state: result.state };
}

function withVocabularyOrder(state, projectId, order) {
  const next = cloneJson(state);
  const rows = {
    ally: {
      id: 'ally',
      label: 'Ally',
      aliases: ['Partner'],
    },
    rival: {
      id: 'rival',
      label: 'Rival',
      aliases: ['Opposition'],
    },
  };
  next.data.projects[projectId].atlas.relationVocabulary = {};
  for (const key of order) next.data.projects[projectId].atlas.relationVocabulary[key] = rows[key];
  return next;
}

test('A1 exports through Atlas and top-level derived barrels', async () => {
  const atlas = await loadModule('src/derived/atlas/index.mjs');
  const derived = await loadModule('src/derived/index.mjs');

  assert.equal(typeof atlas.deriveAtlasOptionalRelationVocabulary, 'function');
  assert.equal(typeof derived.deriveAtlasOptionalRelationVocabulary, 'function');
  assert.equal(
    derived.ATLAS_OPTIONAL_RELATION_VOCABULARY_SCHEMA_VERSION,
    atlas.ATLAS_OPTIONAL_RELATION_VOCABULARY_SCHEMA_VERSION,
  );
  assert.equal(
    derived.ATLAS_OPTIONAL_RELATION_VOCABULARY_STAGE_ID,
    'A1_OPTIONAL_RELATION_VOCABULARY',
  );
});

test('A1 output hash is deterministic across relationVocabulary object ordering', async () => {
  const derived = await loadModule('src/derived/index.mjs');
  const { projectId, state } = await baseState();
  const firstState = withVocabularyOrder(state, projectId, ['ally', 'rival']);
  const secondState = withVocabularyOrder(state, projectId, ['rival', 'ally']);

  const first = derived.deriveAtlasOptionalRelationVocabulary({
    coreState: firstState,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasOptionalRelationVocabulary: true } },
  });
  const second = derived.deriveAtlasOptionalRelationVocabulary({
    coreState: secondState,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasOptionalRelationVocabulary: true } },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.summary.vocabularyHash, second.value.summary.vocabularyHash);
  assert.deepEqual(first.value.summary.normalizedLabels, ['ally', 'observed co-occurrence', 'rival']);
  assert.deepEqual(second.value.summary.normalizedLabels, ['ally', 'observed co-occurrence', 'rival']);
});

test('A1 remains available when temporal cooccurrence source is capability-disabled', async () => {
  const derived = await loadModule('src/derived/index.mjs');
  const { projectId, state } = await baseState();
  const withVocabulary = withVocabularyOrder(state, projectId, ['ally']);
  const beforeHash = derived.hashCanonicalValue(withVocabulary);

  const result = derived.deriveAtlasOptionalRelationVocabulary({
    coreState: withVocabulary,
    params: { projectId },
    capabilitySnapshot: {
      capabilities: {
        atlasOptionalRelationVocabulary: true,
        atlasTemporalContinuity: false,
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.state, 'ready');
  assert.equal(result.value.summary.authorVocabularyRowCount, 1);
  assert.equal(result.value.summary.observedRelationRowCount, 0);
  assert.equal(result.value.sourceAvailability.temporalContinuity.state, 'unavailable');
  assert.equal(result.value.sourceAvailability.temporalContinuity.errorCode, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(derived.hashCanonicalValue(withVocabulary), beforeHash);
});

test('A1 source stays free of platform, storage, network, renderer and process effects', () => {
  const combined = [
    fs.readFileSync(DERIVE_SOURCE, 'utf8'),
    fs.readFileSync(TYPES_SOURCE, 'utf8'),
  ].join('\n');
  const forbidden = [
    'node:fs',
    'node:child_process',
    'electron',
    'writeFile',
    'readFile',
    'fetch(',
    'XMLHttpRequest',
    'localStorage',
    'sessionStorage',
    'querySelector',
    'dispatchEvent',
    'ipcRenderer',
    'ipcMain',
  ];
  for (const token of forbidden) {
    assert.equal(combined.includes(token), false, `forbidden token present: ${token}`);
  }
});
