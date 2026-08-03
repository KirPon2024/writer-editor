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
  const trackedOperations = ledger.operations.filter((operation) => operation.family === 'tracked_text_edit');
  const trackedExact = trackedOperations.filter((operation) => operation.expectedOutcome === 'EXACT');
  const trackedManual = trackedOperations.filter((operation) => operation.expectedOutcome === 'MANUAL');
  assert.equal(trackedExact.length + trackedManual.length, 1200);
  assert.equal(trackedExact.length > 0, true);
  assert.equal(trackedManual.length >= 400, true);
  assert.equal(trackedExact.every((operation) => operation.anchor.sceneSelectedTextOccurrenceCount === 1), true);
  assert.equal(
    ledger.operations
      .filter((operation) => operation.family === 'root_comment')
      .every((operation) => (
        operation.anchor.sceneSelectedTextOccurrenceCount === 1
        && operation.anchor.selectedText === operation.anchor.selectedText.trim()
        && operation.anchor.wordSelectedText === operation.anchor.selectedText
        && operation.anchor.sceneWordSelectedTextOccurrenceCount === 1
      )),
    true,
  );
  const trackedRangesByParagraph = new Map();
  for (const operation of trackedOperations) {
    const ranges = trackedRangesByParagraph.get(operation.anchor.paragraphId) || [];
    assert.equal(ranges.some((range) => (
      operation.anchor.graphemeStart <= range.end
      && operation.anchor.graphemeEnd >= range.start
    )), false);
    ranges.push({ start: operation.anchor.graphemeStart, end: operation.anchor.graphemeEnd });
    trackedRangesByParagraph.set(operation.anchor.paragraphId, ranges);
  }
  assert.equal(ledger.operations.filter((operation) => operation.expectedOutcome === 'SAFE_APPLY').length, 540);
  assert.equal(ledger.operations.filter((operation) => operation.expectedOutcome === 'MANUAL').length >= 595, true);
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

  const touching = structuredClone(ledger.operations);
  const firstTracked = touching.find((operation) => operation.family === 'tracked_text_edit');
  const secondTracked = touching.find((operation) => (
    operation.family === 'tracked_text_edit'
    && operation.id !== firstTracked.id
    && operation.sceneId === firstTracked.sceneId
  ));
  secondTracked.anchor.paragraphId = firstTracked.anchor.paragraphId;
  secondTracked.anchor.graphemeStart = firstTracked.anchor.graphemeEnd;
  secondTracked.anchor.graphemeEnd = firstTracked.anchor.graphemeEnd + 1;
  const touchingResult = validateC5V2LedgerDistribution({
    operations: touching,
    sceneProfiles: ledger.sceneProfiles,
    counts: ledger.counts,
  });
  assert.equal(touchingResult.ok, false);
  assert.equal(touchingResult.failures.some((failure) => failure.code === 'C5V2_TRACKED_RANGE_NOT_WORD_ISOLATED'), true);

  const wordUnstableRoot = structuredClone(ledger.operations);
  const root = wordUnstableRoot.find((operation) => operation.family === 'root_comment');
  root.anchor.selectedText = ` ${root.anchor.selectedText}`;
  const wordUnstableResult = validateC5V2LedgerDistribution({
    operations: wordUnstableRoot,
    sceneProfiles: ledger.sceneProfiles,
    counts: ledger.counts,
  });
  assert.equal(wordUnstableResult.ok, false);
  assert.equal(wordUnstableResult.failures.some((failure) => failure.code === 'C5V2_ROOT_COMMENT_WORD_NORMALIZED_SELECTION_NOT_UNIQUE'), true);
});

test('C5V2 resumed master ledger authority is recomputed from raw operation content and exact campaign identity', async () => {
  const {
    buildC5V2Ledger,
  } = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-ledger-engine.mjs'));
  const {
    bindC5V2MasterLedgerResumeAuthority,
    validateC5V2MasterLedgerResumeAuthority,
  } = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  const identity = {
    exactHead: '631a71f915aee10d46ea45cf0643ba7a33fa0a5d',
    campaignId: 'c5v2-dorian-finalrep02-631a71f9',
    corpusDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  };
  const bound = bindC5V2MasterLedgerResumeAuthority(buildC5V2Ledger({ scenes: makeScenes() }), identity);
  const accepted = validateC5V2MasterLedgerResumeAuthority(bound, identity);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.operationCount, 2000);
  assert.deepEqual(accepted.counts, {
    tracked_text_edit: 1200,
    root_comment: 300,
    reply: 120,
    comment_state: 100,
    formatting: 180,
    structural: 60,
    negative_probe: 40,
  });

  const removedOperation = structuredClone(bound);
  removedOperation.operations.pop();
  assert.equal(validateC5V2MasterLedgerResumeAuthority(removedOperation, identity).ok, false);
  assert.equal(
    validateC5V2MasterLedgerResumeAuthority(removedOperation, identity).failures.some((failure) => failure.startsWith('C5V2_MASTER_LEDGER_OPERATION_COUNT_INVALID:1999')),
    true,
  );

  const staleDigest = structuredClone(bound);
  staleDigest.operations[0].family = 'formatting';
  assert.equal(validateC5V2MasterLedgerResumeAuthority(staleDigest, identity).failures.includes('C5V2_MASTER_LEDGER_DIGEST_STALE'), true);

  const wrongCorpus = validateC5V2MasterLedgerResumeAuthority(bound, {
    ...identity,
    corpusDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });
  assert.equal(wrongCorpus.ok, false);
  assert.equal(wrongCorpus.failures.includes('C5V2_MASTER_LEDGER_RESUME_AUTHORITY_IDENTITY_MISMATCH'), true);

  const duplicateId = structuredClone(bound);
  duplicateId.operations[1].id = duplicateId.operations[0].id;
  duplicateId.operations[1].requestKey = duplicateId.operations[0].requestKey;
  duplicateId.operations[1].effectKey = duplicateId.operations[0].effectKey;
  duplicateId.ledgerDigest = bound.ledgerDigest;
  assert.equal(validateC5V2MasterLedgerResumeAuthority(duplicateId, identity).failures.some((failure) => failure.startsWith('C5V2_MASTER_LEDGER_OPERATION_ID_DUPLICATE:')), true);

  const futureRoundAltered = structuredClone(bound);
  const futureOperation = futureRoundAltered.operations.find((operation) => operation.round === 5);
  futureOperation.expectedOutcome = 'SAFE_APPLY';
  assert.equal(validateC5V2MasterLedgerResumeAuthority(futureRoundAltered, identity).failures.includes('C5V2_MASTER_LEDGER_DIGEST_STALE'), true);

  const requestKeyTampered = structuredClone(bound);
  requestKeyTampered.operations[0].requestKey = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
  assert.equal(validateC5V2MasterLedgerResumeAuthority(requestKeyTampered, identity).failures.some((failure) => failure.startsWith('C5V2_MASTER_LEDGER_REQUEST_KEY_MISMATCH:')), true);
});
