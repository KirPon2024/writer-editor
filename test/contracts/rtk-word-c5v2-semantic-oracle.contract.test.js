'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function makeScenes() {
  return Array.from({ length: 4 }, (_, index) => ({
    sceneId: `scene-${String(index + 1).padStart(2, '0')}`,
    title: `Scene ${index + 1}`,
  }));
}

function recordFor(operation, familyExtra = {}) {
  return {
    outcome: operation.expectedOutcome || 'SAFE_APPLY',
    anchor: structuredClone(operation.anchor),
    ...familyExtra,
  };
}

test('C5V2 multilingual QA layer distributes grapheme categories across scenes without becoming sole oracle', async () => {
  const {
    buildC5V2MultilingualQaLayer,
  } = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-semantic-oracle.mjs'));
  const layer = buildC5V2MultilingualQaLayer({ scenes: makeScenes() });

  assert.equal(layer.schemaVersion, 'yalken.rtk.word.c5v2.multilingual-qa-layer.v1');
  assert.equal(layer.gates.ok, true);
  assert.equal(layer.categories.length, 7);
  assert.equal(layer.sceneCoverage.length, 4);
  assert.equal(layer.passages.every((passage) => passage.oracleRole === 'supporting-grapheme-qa-not-sole-routing-authority'), true);
  assert.equal(layer.operations.some((operation) => operation.family === 'tracked_text_edit'), true);
  assert.equal(layer.operations.some((operation) => operation.family === 'root_comment'), true);
  assert.equal(layer.operations.some((operation) => operation.family === 'formatting'), true);
});

test('C5V2 semantic oracle requires per-operation Word and reopened Yalken semantics, not counts', async () => {
  const {
    buildC5V2MultilingualQaLayer,
    validateC5V2SemanticOracle,
  } = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-semantic-oracle.mjs'));
  const layer = buildC5V2MultilingualQaLayer({ scenes: makeScenes() });
  const operations = layer.operations.slice(0, 3);
  const wordOperationsById = {};
  const yalkenOperationsById = {};
  for (const operation of operations) {
    const extra = operation.family === 'tracked_text_edit'
      ? { textSemantics: { kind: operation.semanticIntent.kind, replacementText: operation.semanticIntent.replacementText } }
      : operation.family === 'root_comment'
        ? { commentSemantics: { threadId: `thread-${operation.id}`, state: 'open' } }
        : { formattingSemantics: { kind: operation.semanticIntent.kind, effective: true } };
    wordOperationsById[operation.id] = recordFor(operation, extra);
    yalkenOperationsById[operation.id] = recordFor(operation, extra);
  }

  const good = validateC5V2SemanticOracle({
    operations,
    wordReadback: {
      sourceKind: 'raw-ooxml',
      operationsById: wordOperationsById,
    },
    yalkenTruth: {
      sourceKind: 'reopened-yalken-project',
      operationsById: yalkenOperationsById,
    },
  });
  assert.equal(good.ok, true);
  assert.deepEqual(good.failures, []);
  assert.equal(good.oracleDigest.startsWith('sha256:'), true);

  const countsOnly = validateC5V2SemanticOracle({
    operations,
    wordReadback: {
      sourceKind: 'raw-ooxml',
      countsOnly: true,
      counts: { comments: 1, revisions: 1 },
    },
    yalkenTruth: {
      sourceKind: 'reopened-yalken-project',
      countsOnly: true,
      counts: { comments: 1, revisions: 1 },
    },
  });
  assert.equal(countsOnly.ok, false);
  assert.equal(countsOnly.failures.some((failure) => failure.code === 'C5V2_ORACLE_COUNTS_ONLY_FORBIDDEN'), true);
  assert.equal(countsOnly.failures.some((failure) => failure.code === 'C5V2_ORACLE_OPERATION_MAP_REQUIRED'), true);

  const wrongSceneWord = structuredClone(wordOperationsById);
  wrongSceneWord[operations[0].id].anchor.sceneId = 'wrong-scene';
  const wrongScene = validateC5V2SemanticOracle({
    operations,
    wordReadback: {
      sourceKind: 'word-object-model',
      operationsById: wrongSceneWord,
    },
    yalkenTruth: {
      sourceKind: 'reopened-yalken-project',
      operationsById: yalkenOperationsById,
    },
  });
  assert.equal(wrongScene.ok, false);
  assert.equal(wrongScene.failures.some((failure) => failure.code === 'C5V2_ORACLE_ANCHOR_MISMATCH' && failure.field === 'sceneId'), true);
});
