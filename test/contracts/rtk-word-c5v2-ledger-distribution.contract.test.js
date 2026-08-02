'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function makeScenes() {
  const sentence = 'The painter studied the changing light beside the window, while the editor marked a careful phrase for later discussion.';
  return Array.from({ length: 21 }, (_, index) => ({
    sceneId: `dorian-${String(index).padStart(2, '0')}`,
    title: index === 0 ? 'Preface' : `Chapter ${index}`,
    text: Array.from({ length: 120 }, (_, paragraphIndex) => (
      `${index === 0 ? 'Preface' : `Chapter ${index}`} paragraph ${paragraphIndex + 1}. ${sentence} This natural paragraph contains distinct literary language for deterministic range sampling ${index}-${paragraphIndex}.`
    )).join('\n\n'),
  }));
}

test('C5V2 ledger engine emits deterministic 2,000-op natural full-book coverage with fail-closed gates', async () => {
  const {
    DEFAULT_C5V2_LEDGER_COUNTS,
    buildC5V2Ledger,
  } = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-ledger-engine.mjs'));
  const ledger = buildC5V2Ledger({ scenes: makeScenes() });

  assert.equal(ledger.schemaVersion, 'yalken.rtk.word.c5v2.fullbook-ledger.v1');
  assert.equal(ledger.topology, 'one-full-manuscript-project-cumulative-rounds');
  assert.equal(ledger.gates.ok, true);
  assert.deepEqual(ledger.gates.failures, []);
  assert.equal(ledger.sceneCount, 21);
  assert.equal(ledger.operations.length, 2000);
  assert.equal(ledger.operations.filter((operation) => operation.family === 'tracked_text_edit').length, DEFAULT_C5V2_LEDGER_COUNTS.tracked_text_edit);
  assert.equal(ledger.operations.filter((operation) => operation.family === 'root_comment').length, DEFAULT_C5V2_LEDGER_COUNTS.root_comment);
  assert.equal(ledger.operations.filter((operation) => operation.family === 'reply').length, DEFAULT_C5V2_LEDGER_COUNTS.reply);
  assert.equal(ledger.operations.filter((operation) => operation.family === 'comment_state').length, DEFAULT_C5V2_LEDGER_COUNTS.comment_state);
  assert.equal(ledger.operations.filter((operation) => operation.family === 'formatting').length, DEFAULT_C5V2_LEDGER_COUNTS.formatting);
  assert.equal(ledger.operations.filter((operation) => operation.family === 'structural').length, DEFAULT_C5V2_LEDGER_COUNTS.structural);
  assert.equal(ledger.operations.filter((operation) => operation.family === 'negative_probe').length, DEFAULT_C5V2_LEDGER_COUNTS.negative_probe);

  for (const family of ['tracked_text_edit', 'root_comment', 'reply', 'comment_state', 'formatting', 'structural']) {
    const stats = ledger.distribution.coverage.byFamily[family];
    assert.equal(stats.sceneCoverage, 21);
    assert.equal(stats.decileCoverage, 10);
    assert.equal(stats.thirdCoverage, 3);
  }

  const serialized = JSON.stringify(ledger.operations);
  assert.equal(serialized.includes('YALKEN_C5_CERTIFICATION_ANCHORS'), false);
  assert.equal(serialized.includes('COMMENT_TARGET'), false);
  assert.equal(serialized.includes('OLD_WORD'), false);
  assert.equal(serialized.includes('FORMAT_ME'), false);

  const primaryAnchorKeys = new Set();
  const commentParagraphCounts = new Map();
  for (const operation of ledger.operations.filter((item) => (
    item.family !== 'negative_probe' && !['reply', 'comment_state'].includes(item.family)
  ))) {
    const key = [
      operation.anchor.sceneId,
      operation.anchor.paragraphId,
      operation.anchor.graphemeStart,
      operation.anchor.graphemeEnd,
      operation.anchor.contextBefore,
      operation.anchor.contextAfter,
    ].join('|');
    assert.equal(primaryAnchorKeys.has(key), false);
    primaryAnchorKeys.add(key);
  }
  for (const operation of ledger.operations.filter((item) => (
    ['root_comment', 'reply', 'comment_state'].includes(item.family)
  ))) {
    commentParagraphCounts.set(operation.anchor.paragraphId, (commentParagraphCounts.get(operation.anchor.paragraphId) || 0) + 1);
  }
  assert.equal(Math.max(...commentParagraphCounts.values()), 2);
  assert.equal(ledger.operations.filter((operation) => operation.expectedOutcome === 'EXACT').length, 800);
  assert.equal(ledger.operations.filter((operation) => operation.expectedOutcome === 'SAFE_APPLY').length, 540);
  assert.equal(ledger.operations.filter((operation) => operation.expectedOutcome === 'MANUAL').length, 595);
  assert.equal(ledger.operations.filter((operation) => operation.expectedOutcome === 'BLOCKED').length, 25);
  assert.equal(ledger.operations.filter((operation) => operation.expectedOutcome === 'REJECT').length, 40);
  assert.deepEqual(
    [...new Set(ledger.operations.filter((operation) => operation.family === 'structural').map((operation) => operation.semanticIntent.kind))],
    ['headingLevel'],
  );
  assert.deepEqual(
    [...new Set(ledger.operations.filter((operation) => operation.family === 'tracked_text_edit').map((operation) => operation.semanticIntent.unicodeProfile))].sort(),
    ['cjk', 'emoji-zwj', 'indic', 'nfc-composed', 'nfd-combining', 'rtl-arabic', 'rtl-hebrew', 'thai'],
  );
  const paragraphRounds = new Map();
  const sceneRoundMutationFamilies = new Map();
  for (const operation of ledger.operations.filter((item) => item.anchor)) {
    const rounds = paragraphRounds.get(operation.anchor.paragraphId) || new Set();
    rounds.add(operation.round);
    paragraphRounds.set(operation.anchor.paragraphId, rounds);
    if (['tracked_text_edit', 'formatting', 'structural'].includes(operation.family)) {
      const key = `${operation.sceneId}:${operation.round}`;
      const families = sceneRoundMutationFamilies.get(key) || new Set();
      families.add(operation.family);
      sceneRoundMutationFamilies.set(key, families);
    }
  }
  assert.equal([...paragraphRounds.values()].every((rounds) => rounds.size === 1), true);
  assert.equal([...sceneRoundMutationFamilies.values()].every((families) => families.size === 1), true);
  for (const round of [1, 2, 3, 4, 5]) {
    const roundFamilies = new Set(ledger.operations.filter((operation) => operation.round === round).map((operation) => operation.family));
    assert.deepEqual(
      [...roundFamilies].sort(),
      ['comment_state', 'formatting', 'reply', 'root_comment', 'structural', 'tracked_text_edit'],
    );
  }
  assert.equal(ledger.distribution.paragraphHotspotGini < 0.75, true);
});

test('C5V2 ledger engine rejects synthetic-tail positive source and detects adversarial hotspot mutation', async () => {
  const {
    buildC5V2Ledger,
    validateC5V2LedgerDistribution,
  } = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-ledger-engine.mjs'));

  const syntheticScenes = makeScenes();
  syntheticScenes[0] = {
    ...syntheticScenes[0],
    text: `${syntheticScenes[0].text}\n\nYALKEN_C5_CERTIFICATION_ANCHORS\nCOMMENT_TARGET OLD_WORD`,
  };
  assert.throws(() => buildC5V2Ledger({ scenes: syntheticScenes }), /C5V2_SYNTHETIC_SENTINEL_IN_POSITIVE_SOURCE/u);

  const ledger = buildC5V2Ledger({ scenes: makeScenes() });
  const mutated = structuredClone(ledger.operations);
  const rootComments = mutated.filter((operation) => operation.family === 'root_comment');
  for (let index = 1; index < 8; index += 1) {
    rootComments[index].anchor = structuredClone(rootComments[0].anchor);
  }
  const result = validateC5V2LedgerDistribution({
    operations: mutated,
    sceneProfiles: ledger.sceneProfiles,
    counts: ledger.counts,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failures.some((failure) => failure.code === 'C5V2_DUPLICATE_POSITIVE_ANCHOR'), true);
  assert.equal(result.failures.some((failure) => failure.code === 'C5V2_DUPLICATE_POSITIVE_ANCHOR_START'), true);
  assert.equal(result.failures.some((failure) => failure.code === 'C5V2_DUPLICATE_POSITIVE_ROOT_COMMENT_ANCHOR'), true);
  assert.equal(result.failures.some((failure) => failure.code === 'C5V2_COMMENT_PARAGRAPH_HOTSPOT'), true);
});
