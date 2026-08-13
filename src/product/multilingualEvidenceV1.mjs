import crypto from 'node:crypto';

import {
  createSourceFenceTokenV1,
  evaluateSourceFenceV1,
  SOURCE_FENCE_V1_CODES,
  SOURCE_FENCE_V1_SCHEMAS,
} from './sourceFenceV1.mjs';

export const MULTILINGUAL_EVIDENCE_V1_FEATURE_FLAG = 'yalken.multilingualEvidence.readonlyV1';

export const MULTILINGUAL_EVIDENCE_V1_SCHEMAS = Object.freeze({
  featureFlag: 'yalken.multilingualEvidence.featureFlag.v1',
  indexRequest: 'yalken.multilingualEvidence.indexRequest.v1',
  sourceSnapshot: 'yalken.multilingualEvidence.sourceSnapshot.v1',
  index: 'yalken.multilingualEvidence.index.v1',
  searchRequest: 'yalken.multilingualEvidence.searchRequest.v1',
  searchResult: 'yalken.multilingualEvidence.searchResult.v1',
});

export const MULTILINGUAL_EVIDENCE_V1_CODES = Object.freeze({
  FEATURE_DISABLED: 'YALKEN_MULTILINGUAL_FEATURE_DISABLED',
  FIELD_INVALID: 'YALKEN_MULTILINGUAL_FIELD_INVALID',
  INDEX_BUILT: 'YALKEN_MULTILINGUAL_INDEX_BUILT',
  INDEX_NOT_SEARCHABLE: 'YALKEN_MULTILINGUAL_INDEX_NOT_SEARCHABLE',
  KEYSET_INVALID: 'YALKEN_MULTILINGUAL_KEYSET_INVALID',
  LANGUAGE_ABSTAINED: 'YALKEN_MULTILINGUAL_LANGUAGE_ABSTAINED',
  QUERY_EMPTY: 'YALKEN_MULTILINGUAL_QUERY_EMPTY',
  SEARCH_COMPLETE: 'YALKEN_MULTILINGUAL_SEARCH_COMPLETE',
  SOURCE_BINDING_MISMATCH: 'YALKEN_MULTILINGUAL_SOURCE_BINDING_MISMATCH',
  SOURCE_FENCE_REJECTED: 'YALKEN_MULTILINGUAL_SOURCE_FENCE_REJECTED',
});

const INDEX_REQUEST_KEYS = Object.freeze([
  'featureFlags',
  'schemaVersion',
  'sourceSnapshot',
]);
const SOURCE_SNAPSHOT_KEYS = Object.freeze([
  'authority',
  'current',
  'document',
  'expected',
  'schemaVersion',
]);
const SOURCE_SNAPSHOT_AUTHORITY_KEYS = Object.freeze(['decision', 'mayWrite', 'queryId']);
const SOURCE_BINDING_KEYS = Object.freeze([
  'canonicalRevision',
  'documentId',
  'generation',
  'projectId',
  'rootId',
  'sourceDigest',
  'workingRevision',
]);
const SOURCE_CURRENT_KEYS = Object.freeze([
  'canonicalRevision',
  'dirtyState',
  'documentId',
  'generation',
  'projectId',
  'rootId',
  'sourceDigest',
  'workingRevision',
]);
const DOCUMENT_KEYS = Object.freeze(['documentId', 'languageCode', 'sourceTextDigest', 'text']);
const SEARCH_REQUEST_KEYS = Object.freeze(['index', 'query', 'schemaVersion']);
const SEARCH_QUERY_KEYS = Object.freeze(['languageCode', 'text']);
const SUPPORTED_LANGUAGE_PROFILES = Object.freeze(['de', 'en', 'es', 'fr', 'pl', 'ru']);
const SOURCE_SNAPSHOT_AUTHORITY_DECISIONS = Object.freeze(['ALLOW', 'DENY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
const DIRTY_STATES = Object.freeze(['CLEAN', 'DIRTY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if ((isPlainObject(nested) || Array.isArray(nested)) && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Stable(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex')}`;
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex')}`;
}

function sortedKeys(value) {
  return isPlainObject(value) ? Object.keys(value).sort() : [];
}

function sameKeys(value, keys) {
  const actual = sortedKeys(value);
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function reason(code, field, expected, actual) {
  const out = { code, field };
  if (expected !== undefined) out.expected = expected;
  if (actual !== undefined) out.actual = actual;
  return Object.freeze(out);
}

function addKeysetReason(reasons, field, actual, expected) {
  reasons.push(reason(
    MULTILINGUAL_EVIDENCE_V1_CODES.KEYSET_INVALID,
    field,
    expected,
    sortedKeys(actual),
  ));
}

function normalizeIdentifier(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value) return '';
  if (/[\\/\u0000-\u001F]/u.test(value)) return '';
  return value;
}

function normalizeRevision(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value) return '';
  if (/[\u0000-\u001F]/u.test(value)) return '';
  return value;
}

function normalizeLanguageCode(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/_/gu, '-') : '';
  const primary = normalized.split('-')[0] || '';
  return primary || normalized;
}

function localeFor(languageCode) {
  const normalized = normalizeLanguageCode(languageCode);
  return SUPPORTED_LANGUAGE_PROFILES.includes(normalized) ? normalized : 'en';
}

function supportedLanguage(languageCode) {
  return SUPPORTED_LANGUAGE_PROFILES.includes(normalizeLanguageCode(languageCode));
}

function foldForLanguage(value, languageCode) {
  const nfc = String(value || '').normalize('NFC');
  try {
    return nfc.toLocaleLowerCase(localeFor(languageCode));
  } catch {
    return nfc.toLowerCase();
  }
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

function fallbackSegmentGraphemes(text) {
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
  const text = typeof textValue === 'string' ? textValue : '';
  if (!text) return [];
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
      const segments = [...segmenter.segment(text)];
      return segments.map((segment, index) => ({
        index,
        utf16Start: segment.index,
        utf16End: index + 1 < segments.length ? segments[index + 1].index : text.length,
        text: segment.segment,
      }));
    } catch {
      return fallbackSegmentGraphemes(text);
    }
  }
  return fallbackSegmentGraphemes(text);
}

function isTokenGrapheme(grapheme) {
  return typeof grapheme === 'string' && /[\p{L}\p{N}_]/u.test(grapheme);
}

function collectTokenRuns(document) {
  const graphemes = segmentGraphemes(document.text);
  const runs = [];
  let active = null;
  for (const segment of graphemes) {
    if (isTokenGrapheme(segment.text)) {
      if (!active) {
        active = {
          documentId: document.documentId,
          languageCode: normalizeLanguageCode(document.languageCode),
          raw: '',
          utf16Start: segment.utf16Start,
          utf16End: segment.utf16End,
          graphemeStart: segment.index,
          graphemeEnd: segment.index + 1,
        };
      } else {
        active.utf16End = segment.utf16End;
        active.graphemeEnd = segment.index + 1;
      }
      active.raw += segment.text;
      continue;
    }
    if (active) {
      active.folded = foldForLanguage(active.raw, document.languageCode);
      runs.push(active);
      active = null;
    }
  }
  if (active) {
    active.folded = foldForLanguage(active.raw, document.languageCode);
    runs.push(active);
  }
  return runs;
}

function emptyAccounting(totalDocuments = 0) {
  return {
    totalDocuments,
    indexedDocuments: 0,
    abstainedDocuments: 0,
    droppedDocuments: 0,
    totalTokens: 0,
  };
}

function normalizeSourceBinding(sourceBinding) {
  if (!isPlainObject(sourceBinding)) return null;
  return {
    projectId: typeof sourceBinding.projectId === 'string' ? sourceBinding.projectId : '',
    rootId: typeof sourceBinding.rootId === 'string' ? sourceBinding.rootId : '',
    documentId: typeof sourceBinding.documentId === 'string' ? sourceBinding.documentId : '',
    canonicalRevision: typeof sourceBinding.canonicalRevision === 'string' ? sourceBinding.canonicalRevision : '',
    workingRevision: typeof sourceBinding.workingRevision === 'string' ? sourceBinding.workingRevision : '',
    generation: typeof sourceBinding.generation === 'string' ? sourceBinding.generation : '',
    sourceDigest: typeof sourceBinding.sourceDigest === 'string' ? sourceBinding.sourceDigest : '',
  };
}

function validateSourceBinding(reasons, field, sourceBinding, { current = false } = {}) {
  const keys = current ? SOURCE_CURRENT_KEYS : SOURCE_BINDING_KEYS;
  if (!isPlainObject(sourceBinding)) {
    addKeysetReason(reasons, field, sourceBinding, keys);
    return;
  }
  if (!sameKeys(sourceBinding, keys)) {
    addKeysetReason(reasons, field, sourceBinding, keys);
  }
  for (const key of ['projectId', 'rootId', 'documentId']) {
    if (!normalizeIdentifier(sourceBinding[key])) {
      reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.FIELD_INVALID, `${field}.${key}`));
    }
  }
  for (const key of ['canonicalRevision', 'workingRevision', 'generation']) {
    if (!normalizeRevision(sourceBinding[key])) {
      reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.FIELD_INVALID, `${field}.${key}`));
    }
  }
  if (typeof sourceBinding.sourceDigest !== 'string' || !DIGEST_PATTERN.test(sourceBinding.sourceDigest)) {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.FIELD_INVALID, `${field}.sourceDigest`));
  }
  if (current && !DIRTY_STATES.includes(sourceBinding.dirtyState)) {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.SOURCE_FENCE_REJECTED, `${field}.dirtyState`, DIRTY_STATES, sourceBinding.dirtyState));
  }
}

function fenceSourceFromBinding(binding) {
  const normalized = normalizeSourceBinding(binding) || {};
  return {
    projectId: normalized.projectId || '',
    rootId: normalized.rootId || '',
    documentId: normalized.documentId || '',
    canonicalRevision: normalized.canonicalRevision || '',
    workingRevision: normalized.workingRevision || '',
    sourceDigest: normalized.sourceDigest || '',
  };
}

function validateSnapshotAuthority(reasons, authority) {
  if (!isPlainObject(authority)) {
    addKeysetReason(reasons, 'sourceSnapshot.authority', authority, SOURCE_SNAPSHOT_AUTHORITY_KEYS);
    return;
  }
  if (!sameKeys(authority, SOURCE_SNAPSHOT_AUTHORITY_KEYS)) {
    addKeysetReason(reasons, 'sourceSnapshot.authority', authority, SOURCE_SNAPSHOT_AUTHORITY_KEYS);
  }
  if (!SOURCE_SNAPSHOT_AUTHORITY_DECISIONS.includes(authority.decision)) {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.SOURCE_FENCE_REJECTED, 'sourceSnapshot.authority.decision'));
  }
  if (authority.decision !== 'ALLOW' || authority.mayWrite !== false) {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.SOURCE_FENCE_REJECTED, 'sourceSnapshot.authority'));
  }
  if (!normalizeIdentifier(authority.queryId)) {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.FIELD_INVALID, 'sourceSnapshot.authority.queryId'));
  }
}

function validateSnapshotDocument(reasons, document, sourceBinding) {
  if (!isPlainObject(document)) {
    addKeysetReason(reasons, 'sourceSnapshot.document', document, DOCUMENT_KEYS);
    return;
  }
  if (!sameKeys(document, DOCUMENT_KEYS)) {
    addKeysetReason(reasons, 'sourceSnapshot.document', document, DOCUMENT_KEYS);
  }
  if (document.documentId !== sourceBinding?.documentId) {
    reasons.push(reason(
      MULTILINGUAL_EVIDENCE_V1_CODES.SOURCE_BINDING_MISMATCH,
      'sourceSnapshot.document.documentId',
      sourceBinding?.documentId,
      document.documentId,
    ));
  }
  if (!normalizeLanguageCode(document.languageCode)) {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.FIELD_INVALID, 'sourceSnapshot.document.languageCode'));
  }
  if (typeof document.text !== 'string') {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.FIELD_INVALID, 'sourceSnapshot.document.text'));
  }
  if (typeof document.sourceTextDigest !== 'string' || !DIGEST_PATTERN.test(document.sourceTextDigest)) {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.FIELD_INVALID, 'sourceSnapshot.document.sourceTextDigest'));
  }
}

function evaluateSnapshotFence(snapshot) {
  const expected = fenceSourceFromBinding(snapshot.expected);
  const current = {
    ...fenceSourceFromBinding(snapshot.current),
    dirtyState: snapshot.current?.dirtyState,
  };
  try {
    return evaluateSourceFenceV1({
      schemaVersion: SOURCE_FENCE_V1_SCHEMAS.request,
      purpose: 'READ_SOURCE_SNAPSHOT',
      expected,
      current,
      fence: createSourceFenceTokenV1({ purpose: 'READ_SOURCE_SNAPSHOT', ...expected }),
      dirtyPolicy: 'REQUIRE_CLEAN',
      authority: {
        decision: snapshot.authority?.decision,
        mayWrite: snapshot.authority?.mayWrite,
        commandId: snapshot.authority?.queryId,
      },
    });
  } catch {
    return {
      ok: false,
      code: SOURCE_FENCE_V1_CODES.FIELD_INVALID,
      reasons: [],
    };
  }
}

function validateSourceSnapshot(reasons, sourceSnapshot) {
  if (!isPlainObject(sourceSnapshot)) {
    addKeysetReason(reasons, 'sourceSnapshot', sourceSnapshot, SOURCE_SNAPSHOT_KEYS);
    return;
  }
  if (!sameKeys(sourceSnapshot, SOURCE_SNAPSHOT_KEYS)) {
    addKeysetReason(reasons, 'sourceSnapshot', sourceSnapshot, SOURCE_SNAPSHOT_KEYS);
  }
  if (sourceSnapshot.schemaVersion !== MULTILINGUAL_EVIDENCE_V1_SCHEMAS.sourceSnapshot) {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.FIELD_INVALID, 'sourceSnapshot.schemaVersion'));
  }

  validateSnapshotAuthority(reasons, sourceSnapshot.authority);
  validateSourceBinding(reasons, 'sourceSnapshot.expected', sourceSnapshot.expected);
  validateSourceBinding(reasons, 'sourceSnapshot.current', sourceSnapshot.current, { current: true });
  validateSnapshotDocument(reasons, sourceSnapshot.document, sourceSnapshot.expected);

  if (!isPlainObject(sourceSnapshot.expected) || !isPlainObject(sourceSnapshot.current) || !isPlainObject(sourceSnapshot.document)) {
    return;
  }

  if (sourceSnapshot.expected.generation !== sourceSnapshot.current.generation) {
    reasons.push(reason(
      MULTILINGUAL_EVIDENCE_V1_CODES.SOURCE_BINDING_MISMATCH,
      'sourceSnapshot.current.generation',
      sourceSnapshot.expected.generation,
      sourceSnapshot.current.generation,
    ));
  }

  if (typeof sourceSnapshot.document.text === 'string') {
    const computedTextDigest = sha256Text(sourceSnapshot.document.text);
    if (sourceSnapshot.document.sourceTextDigest !== computedTextDigest) {
      reasons.push(reason(
        MULTILINGUAL_EVIDENCE_V1_CODES.SOURCE_BINDING_MISMATCH,
        'sourceSnapshot.document.sourceTextDigest',
        computedTextDigest,
        sourceSnapshot.document.sourceTextDigest,
      ));
    }
    if (sourceSnapshot.expected.sourceDigest !== computedTextDigest) {
      reasons.push(reason(
        MULTILINGUAL_EVIDENCE_V1_CODES.SOURCE_BINDING_MISMATCH,
        'sourceSnapshot.expected.sourceDigest',
        computedTextDigest,
        sourceSnapshot.expected.sourceDigest,
      ));
    }
    if (sourceSnapshot.current.sourceDigest !== computedTextDigest) {
      reasons.push(reason(
        MULTILINGUAL_EVIDENCE_V1_CODES.SOURCE_BINDING_MISMATCH,
        'sourceSnapshot.current.sourceDigest',
        computedTextDigest,
        sourceSnapshot.current.sourceDigest,
      ));
    }
  }

  const fenceResult = evaluateSnapshotFence(sourceSnapshot);
  if (fenceResult.ok !== true || fenceResult.code !== SOURCE_FENCE_V1_CODES.ALLOWED) {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.SOURCE_FENCE_REJECTED, 'sourceSnapshot.sourceFence', SOURCE_FENCE_V1_CODES.ALLOWED, fenceResult.code));
  }
}

function featureFromFlags(featureFlags) {
  return resolveMultilingualEvidenceFeatureFlag(isPlainObject(featureFlags) ? featureFlags : {});
}

function indexDigestPayload(index) {
  return {
    schemaVersion: index.schemaVersion,
    sourceBinding: index.sourceBinding,
    feature: index.feature,
    accounting: index.accounting,
    documents: index.documents,
    tokens: index.tokens,
  };
}

function expectedIndexDigest(index) {
  return sha256Stable(indexDigestPayload(index));
}

function finishIndex(ok, code, reasons, request, overrides = {}) {
  const sourceBinding = normalizeSourceBinding(request?.sourceSnapshot?.expected) || {
    projectId: '',
    rootId: '',
    documentId: '',
    canonicalRevision: '',
    workingRevision: '',
    generation: '',
    sourceDigest: '',
  };
  const totalDocuments = isPlainObject(request?.sourceSnapshot?.document) ? 1 : 0;
  const base = {
    schemaVersion: MULTILINGUAL_EVIDENCE_V1_SCHEMAS.index,
    ok,
    decision: ok ? 'ALLOW' : 'DENY',
    code,
    reasons,
    feature: featureFromFlags(request?.featureFlags),
    sourceBinding,
    accounting: emptyAccounting(totalDocuments),
    documents: [],
    tokens: [],
    indexDigest: '',
    ...overrides,
  };
  base.indexDigest = ok ? expectedIndexDigest(base) : '';
  return deepFreeze(base);
}

function finishSearch(ok, code, reasons, request, overrides = {}) {
  const index = isPlainObject(request?.index) ? request.index : {};
  return deepFreeze({
    schemaVersion: MULTILINGUAL_EVIDENCE_V1_SCHEMAS.searchResult,
    ok,
    decision: ok ? 'ALLOW' : 'DENY',
    code,
    reasons,
    sourceBinding: normalizeSourceBinding(index.sourceBinding) || {
      projectId: '',
      rootId: '',
      documentId: '',
      canonicalRevision: '',
      workingRevision: '',
      generation: '',
      sourceDigest: '',
    },
    query: isPlainObject(request?.query) ? {
      languageCode: normalizeLanguageCode(request.query.languageCode),
      text: typeof request.query.text === 'string' ? request.query.text : '',
    } : { languageCode: '', text: '' },
    matches: [],
    mutationSurfaceEnabled: false,
    canWriteManuscript: false,
    ...overrides,
  });
}

export function resolveMultilingualEvidenceFeatureFlag(flags = {}) {
  const enabled = isPlainObject(flags) && flags[MULTILINGUAL_EVIDENCE_V1_FEATURE_FLAG] === true;
  return deepFreeze({
    schemaVersion: MULTILINGUAL_EVIDENCE_V1_SCHEMAS.featureFlag,
    flag: MULTILINGUAL_EVIDENCE_V1_FEATURE_FLAG,
    enabled,
    mutationSurfaceEnabled: false,
    canWriteManuscript: false,
    canApply: false,
  });
}

export function buildMultilingualEvidenceIndexV1(request = {}) {
  const reasons = [];
  if (!isPlainObject(request)) {
    addKeysetReason(reasons, 'request', request, INDEX_REQUEST_KEYS);
    return finishIndex(false, MULTILINGUAL_EVIDENCE_V1_CODES.KEYSET_INVALID, reasons, request);
  }
  if (!sameKeys(request, INDEX_REQUEST_KEYS)) {
    addKeysetReason(reasons, 'request', request, INDEX_REQUEST_KEYS);
  }
  if (request.schemaVersion !== MULTILINGUAL_EVIDENCE_V1_SCHEMAS.indexRequest) {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.FIELD_INVALID, 'schemaVersion'));
  }
  validateSourceSnapshot(reasons, request.sourceSnapshot);

  const feature = featureFromFlags(request.featureFlags);
  if (!feature.enabled) {
    return finishIndex(false, MULTILINGUAL_EVIDENCE_V1_CODES.FEATURE_DISABLED, [
      ...reasons,
      reason(MULTILINGUAL_EVIDENCE_V1_CODES.FEATURE_DISABLED, 'featureFlags'),
    ], request);
  }

  if (reasons.length > 0) {
    return finishIndex(false, reasons[0].code, reasons, request);
  }

  const document = request.sourceSnapshot.document;
  const documents = [];
  const tokens = [];
  const accounting = emptyAccounting(1);
  const languageCode = normalizeLanguageCode(document.languageCode);
  if (!supportedLanguage(languageCode)) {
    accounting.abstainedDocuments += 1;
    documents.push({
      documentId: document.documentId,
      languageCode,
      status: 'ABSTAIN_UNKNOWN_LANGUAGE',
      reason: MULTILINGUAL_EVIDENCE_V1_CODES.LANGUAGE_ABSTAINED,
      sourceTextSha256: sha256Text(document.text),
      originalTextPreserved: true,
      tokenCount: 0,
    });
    return finishIndex(false, MULTILINGUAL_EVIDENCE_V1_CODES.LANGUAGE_ABSTAINED, [
      reason(MULTILINGUAL_EVIDENCE_V1_CODES.LANGUAGE_ABSTAINED, 'documents.languageCode'),
    ], request, { accounting, documents, tokens });
  }
  const documentTokens = collectTokenRuns(document);
  accounting.indexedDocuments += 1;
  accounting.totalTokens += documentTokens.length;
  documents.push({
    documentId: document.documentId,
    languageCode,
    status: 'INDEXED',
    reason: '',
    sourceTextSha256: sha256Text(document.text),
    originalTextPreserved: document.text === String(document.text),
    tokenCount: documentTokens.length,
  });
  tokens.push(...documentTokens);

  return finishIndex(true, MULTILINGUAL_EVIDENCE_V1_CODES.INDEX_BUILT, [], request, { accounting, documents, tokens });
}

function validateSearchRequest(reasons, request) {
  if (!isPlainObject(request)) {
    addKeysetReason(reasons, 'request', request, SEARCH_REQUEST_KEYS);
    return;
  }
  if (!sameKeys(request, SEARCH_REQUEST_KEYS)) {
    addKeysetReason(reasons, 'request', request, SEARCH_REQUEST_KEYS);
  }
  if (request.schemaVersion !== MULTILINGUAL_EVIDENCE_V1_SCHEMAS.searchRequest) {
    reasons.push(reason(MULTILINGUAL_EVIDENCE_V1_CODES.FIELD_INVALID, 'schemaVersion'));
  }
  if (!isPlainObject(request.query)) {
    addKeysetReason(reasons, 'query', request.query, SEARCH_QUERY_KEYS);
  } else if (!sameKeys(request.query, SEARCH_QUERY_KEYS)) {
    addKeysetReason(reasons, 'query', request.query, SEARCH_QUERY_KEYS);
  }
}

function indexSearchable(index) {
  if (!isPlainObject(index)) return false;
  if (index.schemaVersion !== MULTILINGUAL_EVIDENCE_V1_SCHEMAS.index) return false;
  if (index.ok !== true || index.decision !== 'ALLOW' || index.code !== MULTILINGUAL_EVIDENCE_V1_CODES.INDEX_BUILT) return false;
  if (!isPlainObject(index.feature) || index.feature.enabled !== true || index.feature.mutationSurfaceEnabled !== false) return false;
  if (!Array.isArray(index.documents) || !Array.isArray(index.tokens) || !isPlainObject(index.accounting)) return false;
  if (typeof index.indexDigest !== 'string' || index.indexDigest !== expectedIndexDigest(index)) return false;
  return true;
}

export function searchMultilingualEvidenceIndexV1(request = {}) {
  const reasons = [];
  validateSearchRequest(reasons, request);
  if (reasons.length > 0) return finishSearch(false, reasons[0].code, reasons, request);
  if (!indexSearchable(request.index)) {
    return finishSearch(false, MULTILINGUAL_EVIDENCE_V1_CODES.INDEX_NOT_SEARCHABLE, [
      reason(MULTILINGUAL_EVIDENCE_V1_CODES.INDEX_NOT_SEARCHABLE, 'index'),
    ], request);
  }
  const languageCode = normalizeLanguageCode(request.query.languageCode);
  if (!supportedLanguage(languageCode)) {
    return finishSearch(false, MULTILINGUAL_EVIDENCE_V1_CODES.LANGUAGE_ABSTAINED, [
      reason(MULTILINGUAL_EVIDENCE_V1_CODES.LANGUAGE_ABSTAINED, 'query.languageCode'),
    ], request);
  }
  const queryTokens = collectTokenRuns({
    documentId: request.index.sourceBinding.documentId,
    languageCode,
    text: request.query.text,
  });
  if (queryTokens.length !== 1) {
    return finishSearch(false, MULTILINGUAL_EVIDENCE_V1_CODES.QUERY_EMPTY, [
      reason(MULTILINGUAL_EVIDENCE_V1_CODES.QUERY_EMPTY, 'query.text'),
    ], request);
  }
  const folded = queryTokens[0].folded;
  const matches = request.index.tokens
    .filter((token) => token.languageCode === languageCode && token.folded === folded)
    .map((token) => ({
      schemaVersion: `${MULTILINGUAL_EVIDENCE_V1_SCHEMAS.searchResult}.match`,
      projectId: request.index.sourceBinding.projectId,
      rootId: request.index.sourceBinding.rootId,
      documentId: token.documentId,
      languageCode: token.languageCode,
      matchedText: token.raw,
      foldedMatch: token.folded,
      utf16Start: token.utf16Start,
      utf16End: token.utf16End,
      graphemeStart: token.graphemeStart,
      graphemeEnd: token.graphemeEnd,
      sourceDigest: request.index.sourceBinding.sourceDigest,
      canonicalRevision: request.index.sourceBinding.canonicalRevision,
      workingRevision: request.index.sourceBinding.workingRevision,
      generation: request.index.sourceBinding.generation,
    }));
  return finishSearch(true, MULTILINGUAL_EVIDENCE_V1_CODES.SEARCH_COMPLETE, [], request, { matches });
}
