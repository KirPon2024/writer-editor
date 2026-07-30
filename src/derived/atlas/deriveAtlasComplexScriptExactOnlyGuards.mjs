import { hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_COMPLEX_SCRIPT_CLASS,
  ATLAS_COMPLEX_SCRIPT_EXACT_ONLY_GUARD_SCHEMA_VERSION,
  ATLAS_COMPLEX_SCRIPT_GUARD_CASE_METRIC_SCHEMA_VERSION,
  ATLAS_COMPLEX_SCRIPT_GUARD_LANGUAGE_ROW_SCHEMA_VERSION,
  ATLAS_COMPLEX_SCRIPT_GUARD_STATUS,
  sortAtlasComplexScriptGuardCaseMetrics,
  sortAtlasComplexScriptGuardRows,
} from './atlasComplexScriptGuardTypes.mjs';
import { ATLAS_OBSERVATION_ANALYZER_ID } from './atlasObservationTypes.mjs';
import { buildAtlasTextAnchorPacket } from './atlasTextAnchorNormalization.mjs';

const DEFAULT_THRESHOLD = Object.freeze({
  precision: 1,
  recall: 1,
  f1: 1,
});

const DEFAULT_CORPUS = Object.freeze({
  schemaVersion: 'fixture.atlas.complexScriptExactOnlyGuardCorpus.v1',
  threshold: DEFAULT_THRESHOLD,
  languages: [
    { languageCode: 'zh-hans', scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.CJK, guarded: true },
    { languageCode: 'zh-hant', scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.CJK, guarded: true },
    { languageCode: 'ja', scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.CJK, guarded: true },
    { languageCode: 'ko', scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.CJK, guarded: true },
    { languageCode: 'ar', scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.RTL, guarded: true },
    { languageCode: 'he', scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.RTL, guarded: true },
    { languageCode: 'hi', scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.INDIC, guarded: true },
    { languageCode: 'ta', scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.INDIC, guarded: true },
    { languageCode: 'und-combining', scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.COMBINING, guarded: true },
  ],
  cases: [
    {
      caseId: 'zh-hans-exact-phrase-no-segmentation',
      languageCode: 'zh-hans',
      scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.CJK,
      text: '阿明见到小林。阿明回家。',
      terms: [
        { termId: 'zh-hans-phrase', value: '阿明见到小林' },
        { termId: 'zh-hans-subterm', value: '阿明' },
      ],
      expectations: [
        { termId: 'zh-hans-phrase', count: 1 },
        { termId: 'zh-hans-subterm', count: 0 },
      ],
    },
    {
      caseId: 'zh-hant-exact-phrase-no-segmentation',
      languageCode: 'zh-hant',
      scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.CJK,
      text: '阿明見到小林。阿明回家。',
      terms: [
        { termId: 'zh-hant-phrase', value: '阿明見到小林' },
        { termId: 'zh-hant-subterm', value: '阿明' },
      ],
      expectations: [
        { termId: 'zh-hant-phrase', count: 1 },
        { termId: 'zh-hant-subterm', count: 0 },
      ],
    },
    {
      caseId: 'ja-exact-phrase-no-segmentation',
      languageCode: 'ja',
      scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.CJK,
      text: '太郎が花子を見た。太郎は帰った。',
      terms: [
        { termId: 'ja-phrase', value: '太郎が花子を見た' },
        { termId: 'ja-subterm', value: '太郎' },
      ],
      expectations: [
        { termId: 'ja-phrase', count: 1 },
        { termId: 'ja-subterm', count: 0 },
      ],
    },
    {
      caseId: 'ko-exact-phrase-no-segmentation',
      languageCode: 'ko',
      scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.CJK,
      text: '민수는 지연을 만났다. 민수는 돌아왔다.',
      terms: [
        { termId: 'ko-phrase', value: '민수는 지연을 만났다' },
        { termId: 'ko-subterm', value: '민수' },
      ],
      expectations: [
        { termId: 'ko-phrase', count: 1 },
        { termId: 'ko-subterm', count: 0 },
      ],
    },
    {
      caseId: 'ar-rtl-exact-phrase-bidi-preserved',
      languageCode: 'ar',
      scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.RTL,
      text: 'قالت مريم: علي عاد. \u200fعلي بقي.',
      terms: [
        { termId: 'ar-phrase', value: 'علي عاد' },
        { termId: 'ar-name', value: 'علي' },
      ],
      expectations: [
        { termId: 'ar-phrase', count: 1 },
        { termId: 'ar-name', count: 2 },
      ],
    },
    {
      caseId: 'he-rtl-exact-phrase-bidi-preserved',
      languageCode: 'he',
      scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.RTL,
      text: 'מרים אמרה: דניאל חזר. \u200fדניאל שתק.',
      terms: [
        { termId: 'he-phrase', value: 'דניאל חזר' },
        { termId: 'he-name', value: 'דניאל' },
      ],
      expectations: [
        { termId: 'he-phrase', count: 1 },
        { termId: 'he-name', count: 2 },
      ],
    },
    {
      caseId: 'hi-complex-grapheme-exact-phrase',
      languageCode: 'hi',
      scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.INDIC,
      text: 'मीरा ने कृष्ण को देखा। कृष्ण मुस्कुराए।',
      terms: [
        { termId: 'hi-phrase', value: 'कृष्ण को देखा' },
        { termId: 'hi-name', value: 'कृष्ण' },
      ],
      expectations: [
        { termId: 'hi-phrase', count: 1 },
        { termId: 'hi-name', count: 2 },
      ],
    },
    {
      caseId: 'ta-complex-grapheme-exact-phrase',
      languageCode: 'ta',
      scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.INDIC,
      text: 'மீரா அருணை பார்த்தாள். அருண் அமைதியாக இருந்தான்.',
      terms: [
        { termId: 'ta-phrase', value: 'அருணை பார்த்தாள்' },
        { termId: 'ta-name', value: 'அருண்' },
      ],
      expectations: [
        { termId: 'ta-phrase', count: 1 },
        { termId: 'ta-name', count: 1 },
      ],
    },
    {
      caseId: 'und-combining-original-preserved',
      languageCode: 'und-combining',
      scriptClass: ATLAS_COMPLEX_SCRIPT_CLASS.COMBINING,
      text: 'Cafe\u0301 met Café. Cafe\u0301 stayed.',
      terms: [
        { termId: 'nfd-cafe', value: 'Cafe\u0301' },
        { termId: 'nfc-cafe', value: 'Café' },
      ],
      expectations: [
        { termId: 'nfd-cafe', count: 2 },
        { termId: 'nfc-cafe', count: 1 },
      ],
    },
  ],
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLanguageCode(value) {
  return normalizeString(value).toLowerCase().replace(/_/gu, '-') || 'und';
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isTokenChar(char) {
  return typeof char === 'string' && char.length > 0 && /[\p{L}\p{N}_]/u.test(char);
}

function hasExactBoundaries(text, startOffset, endOffset, term) {
  const before = startOffset > 0 ? text[startOffset - 1] : '';
  const after = endOffset < text.length ? text[endOffset] : '';
  const first = term[0] || '';
  const last = term[term.length - 1] || '';
  if (isTokenChar(first) && isTokenChar(before)) return false;
  if (isTokenChar(last) && isTokenChar(after)) return false;
  return true;
}

function collectTermOffsets(text, term) {
  const out = [];
  let cursor = 0;
  while (cursor <= text.length) {
    const found = text.indexOf(term, cursor);
    if (found < 0) break;
    const endOffset = found + term.length;
    if (hasExactBoundaries(text, found, endOffset, term)) {
      out.push({ startOffset: found, endOffset });
    }
    cursor = Math.max(endOffset, found + 1);
  }
  return out;
}

function normalizeTerms(rawTerms) {
  return (Array.isArray(rawTerms) ? rawTerms : [])
    .map((term, index) => {
      const value = normalizeString(term?.value);
      const termId = normalizeString(term?.termId) || `term-${index + 1}`;
      return value ? { termId, value } : null;
    })
    .filter(Boolean);
}

function normalizeExpectations(rawExpectations) {
  const out = new Map();
  for (const expectation of Array.isArray(rawExpectations) ? rawExpectations : []) {
    const termId = normalizeString(expectation?.termId);
    if (!termId) continue;
    out.set(termId, Math.max(0, Math.trunc(normalizeNumber(expectation?.count, 0))));
  }
  return out;
}

function ratio(numerator, denominator) {
  if (denominator === 0) return 1;
  return Number((numerator / denominator).toFixed(6));
}

function calculateF1(precision, recall) {
  if (precision + recall === 0) return 0;
  return Number(((2 * precision * recall) / (precision + recall)).toFixed(6));
}

function buildAnchor({ caseId, languageCode, text, term, offset }) {
  const packet = buildAtlasTextAnchorPacket({
    projectId: 'atlas-complex-script-guard-fixture',
    sceneId: `${languageCode}:${caseId}`,
    entityId: '',
    termId: term.termId,
    startOffset: offset.startOffset,
    endOffset: offset.endOffset,
    sceneText: text,
  });
  return packet.evidenceAnchor;
}

function evaluateCase(rawCase, threshold) {
  const caseId = normalizeString(rawCase?.caseId);
  const languageCode = normalizeLanguageCode(rawCase?.languageCode);
  const scriptClass = normalizeString(rawCase?.scriptClass);
  const text = typeof rawCase?.text === 'string' ? rawCase.text : '';
  const terms = normalizeTerms(rawCase?.terms);
  const expectationMap = normalizeExpectations(rawCase?.expectations);
  let truePositiveCount = 0;
  let falsePositiveCount = 0;
  let falseNegativeCount = 0;
  const observed = [];
  for (const term of terms) {
    const offsets = collectTermOffsets(text, term.value);
    const expectedCount = expectationMap.has(term.termId) ? expectationMap.get(term.termId) : 0;
    const actualCount = offsets.length;
    truePositiveCount += Math.min(actualCount, expectedCount);
    if (actualCount > expectedCount) falsePositiveCount += actualCount - expectedCount;
    if (expectedCount > actualCount) falseNegativeCount += expectedCount - actualCount;
    for (const offset of offsets) {
      const evidenceAnchor = buildAnchor({ caseId, languageCode, text, term, offset });
      observed.push({
        termId: term.termId,
        matchedText: term.value,
        startOffset: offset.startOffset,
        endOffset: offset.endOffset,
        quote: evidenceAnchor.quote,
        quoteHash: evidenceAnchor.quoteHash,
        adapterOffsetDomain: evidenceAnchor.adapterOffsetDomain,
        codePointRange: evidenceAnchor.codePointRange,
        graphemeRange: evidenceAnchor.graphemeRange,
        originalTextPreserved: evidenceAnchor.quote === term.value,
      });
    }
  }
  const precision = ratio(truePositiveCount, truePositiveCount + falsePositiveCount);
  const recall = ratio(truePositiveCount, truePositiveCount + falseNegativeCount);
  const f1 = calculateF1(precision, recall);
  return {
    schemaVersion: ATLAS_COMPLEX_SCRIPT_GUARD_CASE_METRIC_SCHEMA_VERSION,
    caseId,
    languageCode,
    scriptClass,
    expectedMentionCount: [...expectationMap.values()].reduce((sum, count) => sum + count, 0),
    observedMentionCount: observed.length,
    truePositiveCount,
    falsePositiveCount,
    falseNegativeCount,
    precision,
    recall,
    f1,
    pass: precision >= threshold.precision && recall >= threshold.recall && f1 >= threshold.f1
      && observed.every((item) => item.originalTextPreserved === true),
    segmentationCertified: false,
    morphologyCertified: false,
    deepSupported: false,
    englishFallback: false,
    observed,
  };
}

function summarizeLanguage(language, caseMetrics, threshold) {
  const languageCode = normalizeLanguageCode(language?.languageCode);
  const guarded = language?.guarded === true;
  const rows = caseMetrics.filter((metric) => metric.languageCode === languageCode);
  const truePositiveCount = rows.reduce((sum, metric) => sum + metric.truePositiveCount, 0);
  const falsePositiveCount = rows.reduce((sum, metric) => sum + metric.falsePositiveCount, 0);
  const falseNegativeCount = rows.reduce((sum, metric) => sum + metric.falseNegativeCount, 0);
  const precision = ratio(truePositiveCount, truePositiveCount + falsePositiveCount);
  const recall = ratio(truePositiveCount, truePositiveCount + falseNegativeCount);
  const f1 = calculateF1(precision, recall);
  const pass = rows.length > 0
    && precision >= threshold.precision
    && recall >= threshold.recall
    && f1 >= threshold.f1
    && rows.every((row) => row.pass === true);
  return {
    schemaVersion: ATLAS_COMPLEX_SCRIPT_GUARD_LANGUAGE_ROW_SCHEMA_VERSION,
    languageCode,
    scriptClass: normalizeString(language?.scriptClass),
    status: guarded && pass
      ? ATLAS_COMPLEX_SCRIPT_GUARD_STATUS.GUARDED_EXACT_ONLY
      : ATLAS_COMPLEX_SCRIPT_GUARD_STATUS.UNSUPPORTED_EXACT_ONLY,
    analyzerId: ATLAS_OBSERVATION_ANALYZER_ID,
    exactOnly: true,
    segmentationCertified: false,
    morphologyCertified: false,
    englishFallback: false,
    deepSupported: false,
    runtimeDownload: false,
    caseCount: rows.length,
    passedCaseCount: rows.filter((row) => row.pass).length,
    precision,
    recall,
    f1,
    threshold,
  };
}

export function getAtlasComplexScriptExactOnlyGuardDefaultCorpus() {
  return DEFAULT_CORPUS;
}

export function deriveAtlasComplexScriptExactOnlyGuards(input = {}) {
  const corpus = isPlainObject(input.corpus) ? input.corpus : DEFAULT_CORPUS;
  const threshold = {
    precision: normalizeNumber(corpus?.threshold?.precision, DEFAULT_THRESHOLD.precision),
    recall: normalizeNumber(corpus?.threshold?.recall, DEFAULT_THRESHOLD.recall),
    f1: normalizeNumber(corpus?.threshold?.f1, DEFAULT_THRESHOLD.f1),
  };
  const caseMetrics = sortAtlasComplexScriptGuardCaseMetrics((Array.isArray(corpus.cases) ? corpus.cases : [])
    .map((corpusCase) => evaluateCase(corpusCase, threshold)));
  const languageRows = sortAtlasComplexScriptGuardRows((Array.isArray(corpus.languages) ? corpus.languages : [])
    .map((language) => summarizeLanguage(language, caseMetrics, threshold)));
  const guardedLanguageCodes = languageRows
    .filter((row) => row.status === ATLAS_COMPLEX_SCRIPT_GUARD_STATUS.GUARDED_EXACT_ONLY)
    .map((row) => row.languageCode);
  const guardHash = hashCanonicalValue({
    schemaVersion: ATLAS_COMPLEX_SCRIPT_EXACT_ONLY_GUARD_SCHEMA_VERSION,
    languageRows,
    caseMetrics,
  });
  return {
    schemaVersion: ATLAS_COMPLEX_SCRIPT_EXACT_ONLY_GUARD_SCHEMA_VERSION,
    state: 'ready',
    corpusSchemaVersion: normalizeString(corpus.schemaVersion),
    analyzerId: ATLAS_OBSERVATION_ANALYZER_ID,
    summary: {
      languageCount: languageRows.length,
      guardedExactOnlyCount: guardedLanguageCodes.length,
      caseCount: caseMetrics.length,
      passedCaseCount: caseMetrics.filter((metric) => metric.pass).length,
      guardedLanguageCodes,
      threshold,
      guardHash,
    },
    guards: {
      originalUnicodePreserved: caseMetrics.every((metric) => metric.observed.every((item) => item.originalTextPreserved === true)),
      noSegmentationClaim: languageRows.every((row) => row.segmentationCertified === false),
      noMorphologyClaim: languageRows.every((row) => row.morphologyCertified === false),
      noSilentEnglishFallback: languageRows.every((row) => row.englishFallback === false),
      noDeepClaim: languageRows.every((row) => row.deepSupported === false),
      noRuntimeDownload: languageRows.every((row) => row.runtimeDownload === false),
    },
    authority: {
      readModelOnly: true,
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      runtimeDownload: false,
      dynamicExecutablePlugin: false,
      releaseReadinessClaim: false,
    },
    languageRows,
    caseMetrics,
  };
}
