import { hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_TEXT_ANCHOR_PACKET_SCHEMA_VERSION,
  ATLAS_TEXT_NORMALIZATION_MAP_SCHEMA_VERSION,
  ATLAS_TEXT_OFFSET_DOMAIN,
  ATLAS_TEXT_OFFSET_MAP_SCHEMA_VERSION,
} from './atlasTextAnchorTypes.mjs';
import { ATLAS_EVIDENCE_ANCHOR_SCHEMA_VERSION } from './atlasMentionTypes.mjs';

function plainString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function codePointHex(char) {
  const value = char.codePointAt(0);
  return Number.isFinite(value) ? `U+${value.toString(16).toUpperCase().padStart(4, '0')}` : '';
}

function buildNormalizationMap(text) {
  const nfc = text.normalize('NFC');
  const nfd = text.normalize('NFD');
  return {
    schemaVersion: ATLAS_TEXT_NORMALIZATION_MAP_SCHEMA_VERSION,
    originalTextHash: hashCanonicalValue(text),
    nfcHash: hashCanonicalValue(nfc),
    nfdHash: hashCanonicalValue(nfd),
    changedByNfc: nfc !== text,
    changedByNfd: nfd !== text,
    originalUtf16Length: text.length,
    nfcUtf16Length: nfc.length,
    nfdUtf16Length: nfd.length,
    destructiveNormalizationApplied: false,
  };
}

export function buildAtlasTextOffsetMap(textValue = '') {
  const text = plainString(textValue);
  const codePoints = [];
  let utf16Offset = 0;
  let codePointIndex = 0;
  for (const char of text) {
    const utf16Length = char.length;
    codePoints.push({
      codePointIndex,
      utf16Start: utf16Offset,
      utf16End: utf16Offset + utf16Length,
      text: char,
      codePointHex: codePointHex(char),
    });
    utf16Offset += utf16Length;
    codePointIndex += 1;
  }

  const graphemes = [];
  for (const point of codePoints) {
    const previous = graphemes[graphemes.length - 1] || null;
    const previousChar = previous?.text ? [...previous.text].at(-1) : '';
    if (!previous || !shouldAttachToPrevious(point.text, previousChar)) {
      graphemes.push({
        graphemeIndex: graphemes.length,
        utf16Start: point.utf16Start,
        utf16End: point.utf16End,
        codePointStart: point.codePointIndex,
        codePointEnd: point.codePointIndex + 1,
        text: point.text,
      });
      continue;
    }
    previous.utf16End = point.utf16End;
    previous.codePointEnd = point.codePointIndex + 1;
    previous.text += point.text;
  }

  return {
    schemaVersion: ATLAS_TEXT_OFFSET_MAP_SCHEMA_VERSION,
    offsetDomains: [
      ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT,
      ATLAS_TEXT_OFFSET_DOMAIN.UNICODE_CODE_POINT,
      ATLAS_TEXT_OFFSET_DOMAIN.GRAPHEME_CLUSTER,
    ],
    adapterOffsetDomain: ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT,
    utf16Length: text.length,
    codePointLength: codePoints.length,
    graphemeLength: graphemes.length,
    crlfCount: (text.match(/\r\n/gu) || []).length,
    loneLfCount: (text.replace(/\r\n/gu, '').match(/\n/gu) || []).length,
    codePoints,
    graphemes,
    normalizationMap: buildNormalizationMap(text),
  };
}

function rangeFromUtf16(items, startOffset, endOffset, indexKey) {
  const selected = items.filter((item) => item.utf16Start < endOffset && item.utf16End > startOffset);
  if (selected.length < 1) {
    return {
      start: 0,
      end: 0,
      length: 0,
    };
  }
  const start = selected[0][indexKey];
  const end = selected[selected.length - 1][indexKey] + 1;
  return {
    start,
    end,
    length: end - start,
  };
}

export function buildAtlasTextAnchorPacket(input = {}) {
  const sceneText = plainString(input.sceneText);
  const startOffset = Math.max(0, Math.min(Number(input.startOffset) || 0, sceneText.length));
  const endOffset = Math.max(startOffset, Math.min(Number(input.endOffset) || startOffset, sceneText.length));
  const quote = sceneText.slice(startOffset, endOffset);
  const offsetMap = buildAtlasTextOffsetMap(sceneText);
  const codePointRange = rangeFromUtf16(offsetMap.codePoints, startOffset, endOffset, 'codePointIndex');
  const graphemeRange = rangeFromUtf16(offsetMap.graphemes, startOffset, endOffset, 'graphemeIndex');
  const projectId = normalizeString(input.projectId);
  const sceneId = normalizeString(input.sceneId);
  const entityId = normalizeString(input.entityId);
  const termId = normalizeString(input.termId);
  const quoteHash = hashCanonicalValue(quote);
  const sceneTextHash = hashCanonicalValue(sceneText);
  const anchorHash = hashCanonicalValue({
    projectId,
    sceneId,
    entityId,
    termId,
    startOffset,
    endOffset,
    quoteHash,
    sceneTextHash,
  });
  return {
    schemaVersion: ATLAS_TEXT_ANCHOR_PACKET_SCHEMA_VERSION,
    evidenceAnchor: {
      schemaVersion: ATLAS_EVIDENCE_ANCHOR_SCHEMA_VERSION,
      anchorId: `atlas-anchor:${anchorHash}`,
      projectId,
      sceneId,
      entityId,
      startOffset,
      endOffset,
      quote,
      quoteHash,
      sceneTextHash,
      adapterOffsetDomain: ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT,
      canonicalOffsetDomains: offsetMap.offsetDomains,
      codePointRange,
      graphemeRange,
      prefixSelector: sceneText.slice(Math.max(0, startOffset - 24), startOffset),
      suffixSelector: sceneText.slice(endOffset, Math.min(sceneText.length, endOffset + 24)),
      normalizationMap: offsetMap.normalizationMap,
    },
    offsetMap,
    originalQuotePreserved: quote === sceneText.slice(startOffset, endOffset),
    destructiveNormalizationApplied: false,
  };
}
