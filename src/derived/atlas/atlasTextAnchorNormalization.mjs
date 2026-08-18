import {
  assertTextCoordinateIndexMatches,
  buildTextCoordinateIndex,
  convertTextCoordinateRange,
  iterateTextCoordinateSegments,
  TEXT_COORDINATE_DOMAIN,
  TextCoordinateError,
} from '../../core/textCoordinateAlgebra.mjs';
import { hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_TEXT_ANCHOR_PACKET_SCHEMA_VERSION,
  ATLAS_TEXT_NORMALIZATION_MAP_SCHEMA_VERSION,
  ATLAS_TEXT_OFFSET_DOMAIN,
  ATLAS_TEXT_OFFSET_MAP_SCHEMA_VERSION,
} from './atlasTextAnchorTypes.mjs';
import { ATLAS_EVIDENCE_ANCHOR_SCHEMA_VERSION } from './atlasMentionTypes.mjs';

const ATLAS_OFFSET_DOMAINS = Object.freeze([
  ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT,
  ATLAS_TEXT_OFFSET_DOMAIN.UNICODE_CODE_POINT,
  ATLAS_TEXT_OFFSET_DOMAIN.GRAPHEME_CLUSTER,
]);
const ATLAS_COORDINATE_METADATA = new WeakMap();

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readAnchorInput(input) {
  const requiredFields = ['sceneText', 'startOffset', 'endOffset'];
  const allowedFields = [
    'projectId',
    'sceneId',
    'entityId',
    'termId',
    ...requiredFields,
    'coordinateIndex',
    'materializeOffsetMap',
  ];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TextCoordinateError('E_TEXT_COORDINATE_INVALID', 'ANCHOR_INPUT_MUST_BE_PLAIN_DATA_RECORD');
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TextCoordinateError('E_TEXT_COORDINATE_INVALID', 'ANCHOR_INPUT_PROTOTYPE_INVALID');
  }
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.some((key) => typeof key !== 'string' || !allowedFields.includes(key))) {
    throw new TextCoordinateError('E_TEXT_COORDINATE_INVALID', 'ANCHOR_INPUT_FIELDS_INVALID');
  }
  const values = {};
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new TextCoordinateError(
        'E_TEXT_COORDINATE_INVALID',
        'ANCHOR_INPUT_FIELD_MUST_BE_ENUMERABLE_DATA_PROPERTY',
        { field: typeof key === 'string' ? key : '' },
      );
    }
    values[key] = descriptor.value;
  }
  for (const field of requiredFields) {
    if (!Object.hasOwn(values, field)) {
      throw new TextCoordinateError('E_TEXT_COORDINATE_INVALID', 'ANCHOR_INPUT_FIELD_REQUIRED', { field });
    }
  }
  if (Object.hasOwn(values, 'materializeOffsetMap') && typeof values.materializeOffsetMap !== 'boolean') {
    throw new TextCoordinateError(
      'E_TEXT_COORDINATE_INVALID',
      'ANCHOR_MATERIALIZE_OFFSET_MAP_MUST_BE_BOOLEAN',
    );
  }
  return values;
}

function codePointHex(char) {
  const value = char.codePointAt(0);
  return Number.isFinite(value) ? `U+${value.toString(16).toUpperCase().padStart(4, '0')}` : '';
}

function buildNormalizationMap(text) {
  const nfc = text.normalize('NFC');
  const nfd = text.normalize('NFD');
  const originalTextHash = hashCanonicalValue(text);
  return Object.freeze({
    schemaVersion: ATLAS_TEXT_NORMALIZATION_MAP_SCHEMA_VERSION,
    originalTextHash,
    nfcHash: nfc === text ? originalTextHash : hashCanonicalValue(nfc),
    nfdHash: nfd === text ? originalTextHash : hashCanonicalValue(nfd),
    changedByNfc: nfc !== text,
    changedByNfd: nfd !== text,
    originalUtf16Length: text.length,
    nfcUtf16Length: nfc.length,
    nfdUtf16Length: nfd.length,
    destructiveNormalizationApplied: false,
  });
}

function coordinateMetadata(text, coordinateIndex) {
  assertTextCoordinateIndexMatches(coordinateIndex, text);
  const cached = ATLAS_COORDINATE_METADATA.get(coordinateIndex);
  if (cached) return cached;
  const normalizationMap = buildNormalizationMap(text);
  const metadata = Object.freeze({
    normalizationMap,
    sceneTextHash: normalizationMap.originalTextHash,
  });
  ATLAS_COORDINATE_METADATA.set(coordinateIndex, metadata);
  return metadata;
}

function resolveCoordinateIndex(text, candidate) {
  if (candidate === undefined || candidate === null) return buildTextCoordinateIndex(text);
  assertTextCoordinateIndexMatches(candidate, text);
  return candidate;
}

export function buildAtlasTextCoordinateIndex(textValue) {
  return buildTextCoordinateIndex(textValue);
}

export function buildAtlasTextOffsetMap(textValue = '', coordinateIndexValue = null) {
  const text = textValue;
  const coordinateIndex = resolveCoordinateIndex(text, coordinateIndexValue);
  const metadata = coordinateMetadata(text, coordinateIndex);
  const codePoints = [...iterateTextCoordinateSegments(
    coordinateIndex,
    TEXT_COORDINATE_DOMAIN.UNICODE_CODE_POINT,
  )].map((segment) => ({
    codePointIndex: segment.index,
    utf16Start: segment.utf16Start,
    utf16End: segment.utf16End,
    text: segment.text,
    codePointHex: codePointHex(segment.text),
  }));
  const graphemes = [...iterateTextCoordinateSegments(
    coordinateIndex,
    TEXT_COORDINATE_DOMAIN.GRAPHEME_CLUSTER,
  )].map((segment) => ({
    graphemeIndex: segment.index,
    utf16Start: segment.utf16Start,
    utf16End: segment.utf16End,
    codePointStart: segment.codePointStart,
    codePointEnd: segment.codePointEnd,
    text: segment.text,
  }));

  return {
    schemaVersion: ATLAS_TEXT_OFFSET_MAP_SCHEMA_VERSION,
    offsetDomains: [...ATLAS_OFFSET_DOMAINS],
    adapterOffsetDomain: ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT,
    utf16Length: coordinateIndex.utf16Length,
    codePointLength: coordinateIndex.codePointLength,
    graphemeLength: coordinateIndex.graphemeLength,
    crlfCount: (text.match(/\r\n/gu) || []).length,
    loneLfCount: (text.replace(/\r\n/gu, '').match(/\n/gu) || []).length,
    codePoints,
    graphemes,
    normalizationMap: metadata.normalizationMap,
  };
}

export function buildAtlasTextAnchorPacket(input = {}) {
  const values = readAnchorInput(input);
  const sceneText = values.sceneText;
  const coordinateIndex = resolveCoordinateIndex(sceneText, values.coordinateIndex);
  const codePointRange = convertTextCoordinateRange({
    index: coordinateIndex,
    fromDomain: TEXT_COORDINATE_DOMAIN.UTF16_JS_CODE_UNIT,
    toDomain: TEXT_COORDINATE_DOMAIN.UNICODE_CODE_POINT,
    start: values.startOffset,
    end: values.endOffset,
  });
  const graphemeRange = convertTextCoordinateRange({
    index: coordinateIndex,
    fromDomain: TEXT_COORDINATE_DOMAIN.UTF16_JS_CODE_UNIT,
    toDomain: TEXT_COORDINATE_DOMAIN.GRAPHEME_CLUSTER,
    start: values.startOffset,
    end: values.endOffset,
  });
  const startOffset = values.startOffset;
  const endOffset = values.endOffset;
  const quote = sceneText.slice(startOffset, endOffset);
  const projectId = normalizeString(values.projectId);
  const sceneId = normalizeString(values.sceneId);
  const entityId = normalizeString(values.entityId);
  const termId = normalizeString(values.termId);
  const quoteHash = hashCanonicalValue(quote);
  const metadata = coordinateMetadata(sceneText, coordinateIndex);
  const sceneTextHash = metadata.sceneTextHash;
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
  const offsetMap = values.materializeOffsetMap === false
    ? null
    : buildAtlasTextOffsetMap(sceneText, coordinateIndex);
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
      offsetDomains: [...ATLAS_OFFSET_DOMAINS],
      canonicalOffsetDomains: [...ATLAS_OFFSET_DOMAINS],
      codePointRange,
      graphemeRange,
      prefixSelector: sceneText.slice(Math.max(0, startOffset - 24), startOffset),
      suffixSelector: sceneText.slice(endOffset, Math.min(sceneText.length, endOffset + 24)),
      normalizationMap: metadata.normalizationMap,
    },
    offsetMap,
    originalQuotePreserved: quote === sceneText.slice(startOffset, endOffset),
    destructiveNormalizationApplied: false,
  };
}
