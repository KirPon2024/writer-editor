const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  ATLAS_MULTILINGUAL_MATCHER_ID,
  collectAtlasMultilingualMatches,
} = require('../../src/shared/atlasMultilingualMatcher.cjs');

test('P0 06: shared matcher case-folds canonically while preserving original grapheme-safe offsets', () => {
  const cases = [
    { languageCode: 'en', sourceText: 'atlas keeper and Annabel', needle: 'Atlas Keeper', quote: 'atlas keeper' },
    { languageCode: 'fr', sourceText: 'Café and tea', needle: 'Café', quote: 'Café' },
    { languageCode: 'zh-Hans', sourceText: '東京で会う。東京都ではない。', needle: '東京', quote: '東京' },
    { languageCode: 'he', sourceText: 'אבג אמר שלום', needle: 'אבג', quote: 'אבג' },
    { languageCode: 'hi', sourceText: 'नमस्ते फिर मिलेंगे', needle: 'नमस्ते', quote: 'नमस्ते' },
    { languageCode: 'und', sourceText: 'The 👩‍💻 fixed it, not partial 👩.', needle: '👩‍💻', quote: '👩‍💻' },
  ];
  for (const item of cases) {
    const result = collectAtlasMultilingualMatches(item);
    assert.equal(result.matcherId, ATLAS_MULTILINGUAL_MATCHER_ID);
    assert.equal(result.policy.segmentationAppliedBeforeMatching, true);
    assert.equal(result.policy.graphemeBoundaryRequired, true);
    assert.equal(result.policy.caseFold, true);
    assert.equal(result.policy.fuzzyMatching, false);
    assert.equal(result.policy.englishFallback, false);
    assert.equal(result.matches.some((match) => (
      match.matchedText === item.quote
      && item.sourceText.slice(match.startOffset, match.endOffset) === item.quote
      && match.boundaryAligned === true
      && match.graphemeRange.length >= 1
      && match.matchMode === 'CASE_AND_CANONICAL_EQUIVALENCE_EXACT'
    )), true, item.languageCode);
  }
});

test('P0 06: matcher rejects boundary and split-grapheme false positives', () => {
  const latin = collectAtlasMultilingualMatches({ sourceText: 'Annabel met Anna.', needle: 'Anna', languageCode: 'en' });
  assert.deepEqual(latin.matches.map((match) => match.matchedText), ['Anna']);

  const emoji = collectAtlasMultilingualMatches({ sourceText: '👩‍💻 and 👩', needle: '👩', languageCode: 'und' });
  assert.deepEqual(emoji.matches.map((match) => match.matchedText), ['👩']);

  const cjk = collectAtlasMultilingualMatches({ sourceText: '東京都 東京', needle: '東京', languageCode: 'zh-hans' });
  assert.deepEqual(cjk.matches.map((match) => match.matchedText), ['東京']);
});

test('P0 06: production source no longer uses raw case-sensitive UTF16 matcher paths', () => {
  const mentionSource = fs.readFileSync(path.join(process.cwd(), 'src/derived/atlas/deriveAtlasMentionIndex.mjs'), 'utf8');
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');
  const matcherSource = fs.readFileSync(path.join(process.cwd(), 'src/shared/atlasMultilingualMatcher.cjs'), 'utf8');
  assert.equal(mentionSource.includes('sceneText.indexOf(term.value, cursor)'), false);
  assert.equal(mainSource.includes('sourceText.indexOf(needle, index)'), false);
  assert.match(mentionSource, /collectAtlasMultilingualMatches\(\{/u);
  assert.match(mainSource, /countAtlasMultilingualMatches\(\{/u);
  assert.match(matcherSource, /Intl\.Segmenter/u);
  assert.match(matcherSource, /toLocaleLowerCase/u);
});

test('P0 06: product evidence runner proves shared matcher, mention index, and Core admission', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-p0-06-'));
  const receiptPath = path.join(outDir, 'receipt.json');
  const run = spawnSync(process.execPath, [
    'scripts/ops/yalken-atlas-v5-final-audit-p0-06-multilingual-matcher.mjs',
    '--out',
    outDir,
    '--receipt',
    receiptPath,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(run.status, 0, `P0 06 runner failed:\n${run.stdout}\n${run.stderr}`);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.status, 'PASS_P0_06_MULTILINGUAL_MATCHER');
  assert.deepEqual(summary.failures, []);
  const report = JSON.parse(fs.readFileSync(summary.reportPath, 'utf8'));
  assert.equal(report.pass, true);
  assert.equal(report.authority.programDoneClaim, false);
  assert.equal(report.sourceBinding.noMentionIndexRawCaseSensitiveIndexOf, true);
  assert.equal(report.sourceBinding.noMainRawCaseSensitiveNeedleIndexOf, true);
  assert.equal(report.sharedMatcher.length, 6);
  assert.equal(report.sharedMatcher.every((row) => row.expectedQuotesPresent === true), true);
  assert.equal(report.productMentionIndex.rows.every((row) => row.matcherBound === true), true);
  assert.equal(report.coreAdmission.splitGraphemeEvidenceRejected, true);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.pass, true);
  assert.equal(receipt.programDoneClaim, false);
});
