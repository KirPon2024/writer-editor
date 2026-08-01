const ATLAS_MULTILINGUAL_MATCHER_SCHEMA_VERSION = 'atlas.multilingualMatcher.v1';
const ATLAS_MULTILINGUAL_MATCHER_ID = 'BASIC_EXACT_TERM_GRAPHEME_CASEFOLD_V1';

const BASIC_SUPPORTED_LANGUAGE_CODES = Object.freeze(['de', 'en', 'es', 'fr', 'pl', 'ru', 'und']);

function plainString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeLanguageCode(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/_/gu, '-') : '';
  return normalized || 'und';
}

function primaryLocale(languageCode) {
  const normalized = normalizeLanguageCode(languageCode);
  const primary = normalized.split('-')[0] || 'und';
  return primary === 'und' ? 'en' : primary;
}

function isCombiningMark(char) {
  return /\p{Mark}/u.test(char);
}

function isVariationSelector(char) {
  if (!char) return false;
  const codePoint = char.codePointAt(0);
  return (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef);
}

function isJoinControl(char) {
  return char === '\u200d' || char === '\u200c';
}

function isBidiControl(char) {
  return /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(char);
}

function shouldAttachToPrevious(char, previousChar) {
  return isCombiningMark(char)
    || isVariationSelector(char)
    || isJoinControl(char)
    || isBidiControl(char)
    || isJoinControl(previousChar);
}

function segmentWithFallback(text) {
  const graphemes = [];
  let utf16Offset = 0;
  for (const char of text) {
    const previous = graphemes[graphemes.length - 1] || null;
    const previousChar = previous?.text ? [...previous.text].at(-1) : '';
    const utf16End = utf16Offset + char.length;
    if (!previous || !shouldAttachToPrevious(char, previousChar)) {
      graphemes.push({
        index: graphemes.length,
        utf16Start: utf16Offset,
        utf16End,
        text: char,
      });
    } else {
      previous.utf16End = utf16End;
      previous.text += char;
    }
    utf16Offset = utf16End;
  }
  return graphemes;
}

function segmentGraphemes(textValue) {
  const text = plainString(textValue);
  if (!text) return [];
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
      const rawSegments = [...segmenter.segment(text)];
      return rawSegments.map((segment, index) => ({
        index,
        utf16Start: segment.index,
        utf16End: index + 1 < rawSegments.length ? rawSegments[index + 1].index : text.length,
        text: segment.segment,
      }));
    } catch {
      return segmentWithFallback(text);
    }
  }
  return segmentWithFallback(text);
}

function isTokenGrapheme(grapheme) {
  return typeof grapheme === 'string' && /[\p{L}\p{N}_]/u.test(grapheme);
}

function hasHan(grapheme) {
  return typeof grapheme === 'string' && /\p{Script=Han}/u.test(grapheme);
}

function hasHiragana(grapheme) {
  return typeof grapheme === 'string' && /\p{Script=Hiragana}/u.test(grapheme);
}

function hasKatakana(grapheme) {
  return typeof grapheme === 'string' && /\p{Script=Katakana}/u.test(grapheme);
}

function hasHangul(grapheme) {
  return typeof grapheme === 'string' && /\p{Script=Hangul}/u.test(grapheme);
}

function hasSameCjkScript(termGrapheme, adjacentGrapheme) {
  if (!adjacentGrapheme) return false;
  return (hasHan(termGrapheme) && hasHan(adjacentGrapheme))
    || (hasHiragana(termGrapheme) && hasHiragana(adjacentGrapheme))
    || (hasKatakana(termGrapheme) && hasKatakana(adjacentGrapheme))
    || (hasHangul(termGrapheme) && hasHangul(adjacentGrapheme));
}

function isCjkBoundarySensitive(grapheme) {
  return hasHan(grapheme) || hasHiragana(grapheme) || hasKatakana(grapheme) || hasHangul(grapheme);
}

function foldForLanguage(value, languageCode) {
  const locale = primaryLocale(languageCode);
  const nfc = plainString(value).normalize('NFC');
  try {
    return nfc.toLocaleLowerCase(locale);
  } catch {
    return nfc.toLowerCase();
  }
}

function buildFoldedIndex(textValue, languageCode) {
  const text = plainString(textValue);
  const graphemes = segmentGraphemes(text);
  let foldedText = '';
  const foldedSegments = [];
  for (const grapheme of graphemes) {
    const folded = foldForLanguage(grapheme.text, languageCode);
    const foldedStart = foldedText.length;
    foldedText += folded;
    foldedSegments.push({
      ...grapheme,
      foldedStart,
      foldedEnd: foldedText.length,
      foldedText: folded,
    });
  }
  return { text, languageCode: normalizeLanguageCode(languageCode), foldedText, graphemes: foldedSegments };
}

function findFoldedBoundarySegment(segments, foldedOffset, key) {
  return segments.find((segment) => segment[key] === foldedOffset) || null;
}

function graphemeAtUtf16(segments, utf16Offset, direction) {
  if (direction === 'before') {
    return [...segments].reverse().find((segment) => segment.utf16End <= utf16Offset) || null;
  }
  return segments.find((segment) => segment.utf16Start >= utf16Offset) || null;
}

function hasTokenBoundaries(index, startOffset, endOffset, term) {
  const termGraphemes = segmentGraphemes(term);
  const firstTerm = termGraphemes[0]?.text || '';
  const lastTerm = termGraphemes[termGraphemes.length - 1]?.text || '';
  const before = graphemeAtUtf16(index.graphemes, startOffset, 'before')?.text || '';
  const after = graphemeAtUtf16(index.graphemes, endOffset, 'after')?.text || '';
  if (isCjkBoundarySensitive(firstTerm) || isCjkBoundarySensitive(lastTerm)) {
    if (hasSameCjkScript(firstTerm, before)) return false;
    if (hasSameCjkScript(lastTerm, after)) return false;
    return true;
  }
  if (isTokenGrapheme(firstTerm) && isTokenGrapheme(before)) return false;
  if (isTokenGrapheme(lastTerm) && isTokenGrapheme(after)) return false;
  return true;
}

function rangeFromGraphemeSegments(segments, startOffset, endOffset) {
  const selected = segments.filter((segment) => segment.utf16Start < endOffset && segment.utf16End > startOffset);
  if (selected.length < 1) return { start: 0, end: 0, length: 0 };
  return {
    start: selected[0].index,
    end: selected[selected.length - 1].index + 1,
    length: selected[selected.length - 1].index + 1 - selected[0].index,
  };
}

function normalizeAtlasMatcherPolicy(input = {}) {
  const languageCode = normalizeLanguageCode(input.languageCode);
  const supported = BASIC_SUPPORTED_LANGUAGE_CODES.includes(languageCode);
  return {
    schemaVersion: `${ATLAS_MULTILINGUAL_MATCHER_SCHEMA_VERSION}.policy`,
    matcherId: ATLAS_MULTILINGUAL_MATCHER_ID,
    languageCode,
    analyzerId: 'BASIC_EXACT_TERM_V1',
    languagePolicy: supported ? 'BASIC_SUPPORTED' : 'UNSUPPORTED_EXACT_ONLY',
    exactOnly: true,
    fuzzyMatching: false,
    englishFallback: false,
    segmentationAppliedBeforeMatching: true,
    graphemeBoundaryRequired: true,
    canonicalNormalization: 'NFC',
    caseFold: true,
  };
}

function collectAtlasMultilingualMatches(input = {}) {
  const sourceText = plainString(input.sourceText);
  const needle = plainString(input.needle);
  const policy = normalizeAtlasMatcherPolicy({ languageCode: input.languageCode });
  if (!sourceText || !needle) {
    return {
      schemaVersion: ATLAS_MULTILINGUAL_MATCHER_SCHEMA_VERSION,
      matcherId: ATLAS_MULTILINGUAL_MATCHER_ID,
      policy,
      matches: [],
    };
  }

  const index = buildFoldedIndex(sourceText, policy.languageCode);
  const foldedNeedle = foldForLanguage(needle, policy.languageCode);
  const matches = [];
  let cursor = 0;
  while (cursor <= index.foldedText.length) {
    const found = index.foldedText.indexOf(foldedNeedle, cursor);
    if (found < 0) break;
    const foldedEnd = found + foldedNeedle.length;
    const startSegment = findFoldedBoundarySegment(index.graphemes, found, 'foldedStart');
    const endSegment = findFoldedBoundarySegment(index.graphemes, foldedEnd, 'foldedEnd');
    if (startSegment && endSegment) {
      const startOffset = startSegment.utf16Start;
      const endOffset = endSegment.utf16End;
      if (hasTokenBoundaries(index, startOffset, endOffset, needle)) {
        const quote = sourceText.slice(startOffset, endOffset);
        matches.push({
          schemaVersion: `${ATLAS_MULTILINGUAL_MATCHER_SCHEMA_VERSION}.match`,
          matcherId: ATLAS_MULTILINGUAL_MATCHER_ID,
          matchMode: 'CASE_AND_CANONICAL_EQUIVALENCE_EXACT',
          languageCode: policy.languageCode,
          languagePolicy: policy.languagePolicy,
          startOffset,
          endOffset,
          matchedText: quote,
          queryText: needle,
          foldedQuery: foldedNeedle,
          foldedMatch: index.foldedText.slice(found, foldedEnd),
          originalTextPreserved: quote === sourceText.slice(startOffset, endOffset),
          graphemeRange: rangeFromGraphemeSegments(index.graphemes, startOffset, endOffset),
          boundaryAligned: true,
          fuzzyMatching: false,
          englishFallback: false,
        });
      }
    }
    cursor = Math.max(found + Math.max(foldedNeedle.length, 1), found + 1);
  }

  return {
    schemaVersion: ATLAS_MULTILINGUAL_MATCHER_SCHEMA_VERSION,
    matcherId: ATLAS_MULTILINGUAL_MATCHER_ID,
    policy,
    sourceUtf16Length: sourceText.length,
    sourceGraphemeLength: index.graphemes.length,
    needleUtf16Length: needle.length,
    matches,
  };
}

function countAtlasMultilingualMatches(input = {}) {
  return collectAtlasMultilingualMatches(input).matches.length;
}

module.exports = Object.freeze({
  ATLAS_MULTILINGUAL_MATCHER_SCHEMA_VERSION,
  ATLAS_MULTILINGUAL_MATCHER_ID,
  collectAtlasMultilingualMatches,
  countAtlasMultilingualMatches,
  normalizeAtlasMatcherPolicy,
});
