import { hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_BASIC_LANGUAGE_PACK_CASE_METRIC_SCHEMA_VERSION,
  ATLAS_BASIC_LANGUAGE_PACK_CERTIFICATION_SCHEMA_VERSION,
  ATLAS_BASIC_LANGUAGE_PACK_CLAIM,
  ATLAS_BASIC_LANGUAGE_PACK_CONTRACT_SCHEMA_VERSION,
  ATLAS_BASIC_LANGUAGE_PACK_LANGUAGE_ROW_SCHEMA_VERSION,
  ATLAS_BASIC_LANGUAGE_PACK_STATUS,
  sortAtlasBasicLanguagePackCaseMetrics,
  sortAtlasBasicLanguagePackRows,
} from './atlasBasicLanguagePackTypes.mjs';
import { ATLAS_OBSERVATION_ANALYZER_ID } from './atlasObservationTypes.mjs';

const DEFAULT_THRESHOLD = Object.freeze({
  precision: 1,
  recall: 1,
  f1: 1,
});

const DEFAULT_CORPUS = Object.freeze({
  schemaVersion: 'fixture.atlas.basicLanguagePackCertificationCorpus.v1',
  threshold: DEFAULT_THRESHOLD,
  languages: [
    { languageCode: 'und', accepted: true, claims: [ATLAS_BASIC_LANGUAGE_PACK_CLAIM.EXACT_BOUNDARY_MENTION] },
    {
      languageCode: 'en',
      accepted: true,
      claims: [
        ATLAS_BASIC_LANGUAGE_PACK_CLAIM.EXACT_BOUNDARY_MENTION,
        ATLAS_BASIC_LANGUAGE_PACK_CLAIM.PUNCTUATION_STABLE,
        ATLAS_BASIC_LANGUAGE_PACK_CLAIM.QUOTE_STABLE,
        ATLAS_BASIC_LANGUAGE_PACK_CLAIM.NAME_FORM_LITERAL,
        ATLAS_BASIC_LANGUAGE_PACK_CLAIM.CONTRACTION_LITERAL,
        ATLAS_BASIC_LANGUAGE_PACK_CLAIM.POSSESSIVE_LITERAL,
      ],
    },
    {
      languageCode: 'ru',
      accepted: true,
      claims: [
        ATLAS_BASIC_LANGUAGE_PACK_CLAIM.EXACT_BOUNDARY_MENTION,
        ATLAS_BASIC_LANGUAGE_PACK_CLAIM.PUNCTUATION_STABLE,
        ATLAS_BASIC_LANGUAGE_PACK_CLAIM.QUOTE_STABLE,
        ATLAS_BASIC_LANGUAGE_PACK_CLAIM.NAME_FORM_LITERAL,
        ATLAS_BASIC_LANGUAGE_PACK_CLAIM.DIACRITIC_PRESERVING,
      ],
    },
    { languageCode: 'de', accepted: true, claims: [ATLAS_BASIC_LANGUAGE_PACK_CLAIM.EXACT_BOUNDARY_MENTION, ATLAS_BASIC_LANGUAGE_PACK_CLAIM.DIACRITIC_PRESERVING] },
    { languageCode: 'es', accepted: true, claims: [ATLAS_BASIC_LANGUAGE_PACK_CLAIM.EXACT_BOUNDARY_MENTION, ATLAS_BASIC_LANGUAGE_PACK_CLAIM.DIACRITIC_PRESERVING] },
    { languageCode: 'fr', accepted: true, claims: [ATLAS_BASIC_LANGUAGE_PACK_CLAIM.EXACT_BOUNDARY_MENTION, ATLAS_BASIC_LANGUAGE_PACK_CLAIM.DIACRITIC_PRESERVING] },
    { languageCode: 'pl', accepted: true, claims: [ATLAS_BASIC_LANGUAGE_PACK_CLAIM.EXACT_BOUNDARY_MENTION, ATLAS_BASIC_LANGUAGE_PACK_CLAIM.DIACRITIC_PRESERVING] },
    { languageCode: 'it', accepted: false, claims: [] },
    { languageCode: 'pt-br', accepted: false, claims: [] },
    { languageCode: 'zh-hant', accepted: false, claims: [] },
  ],
  cases: [
    {
      caseId: 'und-exact-boundary-neutral',
      languageCode: 'und',
      dimensions: ['exact-boundary'],
      text: 'Ari met Nika. Aria stayed outside.',
      terms: [{ termId: 'ari', value: 'Ari' }],
      expectations: [{ termId: 'ari', count: 1 }],
    },
    {
      caseId: 'en-punctuation-quotes-names',
      languageCode: 'en',
      dimensions: ['punctuation', 'quotes', 'names'],
      text: 'Dr. Bell said, "Mira, wait." Mira waited; Annabelle did not.',
      terms: [
        { termId: 'dr-bell', value: 'Dr. Bell' },
        { termId: 'mira', value: 'Mira' },
        { termId: 'anna', value: 'Anna' },
      ],
      expectations: [
        { termId: 'dr-bell', count: 1 },
        { termId: 'mira', count: 2 },
        { termId: 'anna', count: 0 },
      ],
    },
    {
      caseId: 'en-contractions-possessives',
      languageCode: 'en',
      dimensions: ['contractions', 'possessives'],
      text: "Anna's note says she can't leave; Ann cannot answer.",
      terms: [
        { termId: 'anna-possessive', value: "Anna's" },
        { termId: 'cant', value: "can't" },
        { termId: 'ann', value: 'Ann' },
      ],
      expectations: [
        { termId: 'anna-possessive', count: 1 },
        { termId: 'cant', count: 1 },
        { termId: 'ann', count: 1 },
      ],
    },
    {
      caseId: 'ru-patronymic-surname-quotes',
      languageCode: 'ru',
      dimensions: ['punctuation', 'quotes', 'patronymic', 'surname'],
      text: '«Мария Ивановна Соколова», сказала Мария. Ивановна кивнула.',
      terms: [
        { termId: 'maria-full', value: 'Мария Ивановна Соколова' },
        { termId: 'maria', value: 'Мария' },
        { termId: 'ivanovna', value: 'Ивановна' },
      ],
      expectations: [
        { termId: 'maria-full', count: 1 },
        { termId: 'maria', count: 2 },
        { termId: 'ivanovna', count: 2 },
      ],
    },
    {
      caseId: 'ru-e-yo-preservation',
      languageCode: 'ru',
      dimensions: ['e-yo-preservation'],
      text: 'Семён встретил Семена. Семён написал письмо.',
      terms: [
        { termId: 'semyon-yo', value: 'Семён' },
        { termId: 'semen-e', value: 'Семен' },
      ],
      expectations: [
        { termId: 'semyon-yo', count: 2 },
        { termId: 'semen-e', count: 0 },
      ],
    },
    {
      caseId: 'de-diacritic-exact',
      languageCode: 'de',
      dimensions: ['european-diacritic'],
      text: 'Müller traf Muller. Herr Müller blieb.',
      terms: [
        { termId: 'mueller-umlaut', value: 'Müller' },
        { termId: 'muller-plain', value: 'Muller' },
      ],
      expectations: [
        { termId: 'mueller-umlaut', count: 2 },
        { termId: 'muller-plain', count: 1 },
      ],
    },
    {
      caseId: 'es-diacritic-exact',
      languageCode: 'es',
      dimensions: ['european-diacritic'],
      text: 'Iñigo vio a Inigo. Iñigo sonrió.',
      terms: [
        { termId: 'inigo-tilde', value: 'Iñigo' },
        { termId: 'inigo-plain', value: 'Inigo' },
      ],
      expectations: [
        { termId: 'inigo-tilde', count: 2 },
        { termId: 'inigo-plain', count: 1 },
      ],
    },
    {
      caseId: 'fr-diacritic-exact',
      languageCode: 'fr',
      dimensions: ['european-diacritic'],
      text: 'Élodie salue Elodie. Élodie reste.',
      terms: [
        { termId: 'elodie-accent', value: 'Élodie' },
        { termId: 'elodie-plain', value: 'Elodie' },
      ],
      expectations: [
        { termId: 'elodie-accent', count: 2 },
        { termId: 'elodie-plain', count: 1 },
      ],
    },
    {
      caseId: 'pl-diacritic-exact',
      languageCode: 'pl',
      dimensions: ['european-diacritic'],
      text: 'Łukasz minął Lukasz. Łukasz wrócił.',
      terms: [
        { termId: 'lukasz-stroke', value: 'Łukasz' },
        { termId: 'lukasz-plain', value: 'Lukasz' },
      ],
      expectations: [
        { termId: 'lukasz-stroke', count: 2 },
        { termId: 'lukasz-plain', count: 1 },
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

function evaluateCase(rawCase) {
  const caseId = normalizeString(rawCase?.caseId);
  const languageCode = normalizeLanguageCode(rawCase?.languageCode);
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
      observed.push({
        termId: term.termId,
        matchedText: term.value,
        startOffset: offset.startOffset,
        endOffset: offset.endOffset,
      });
    }
  }
  const precision = ratio(truePositiveCount, truePositiveCount + falsePositiveCount);
  const recall = ratio(truePositiveCount, truePositiveCount + falseNegativeCount);
  const f1 = calculateF1(precision, recall);
  return {
    schemaVersion: ATLAS_BASIC_LANGUAGE_PACK_CASE_METRIC_SCHEMA_VERSION,
    caseId,
    languageCode,
    dimensions: [...new Set((Array.isArray(rawCase?.dimensions) ? rawCase.dimensions : [])
      .map(normalizeString)
      .filter(Boolean))].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'variant' })),
    expectedMentionCount: [...expectationMap.values()].reduce((sum, count) => sum + count, 0),
    observedMentionCount: observed.length,
    truePositiveCount,
    falsePositiveCount,
    falseNegativeCount,
    precision,
    recall,
    f1,
    pass: precision >= DEFAULT_THRESHOLD.precision && recall >= DEFAULT_THRESHOLD.recall && f1 >= DEFAULT_THRESHOLD.f1,
    observed,
  };
}

function summarizeLanguage(language, caseMetrics, threshold) {
  const languageCode = normalizeLanguageCode(language?.languageCode);
  const accepted = language?.accepted === true;
  const rows = caseMetrics.filter((metric) => metric.languageCode === languageCode);
  const truePositiveCount = rows.reduce((sum, metric) => sum + metric.truePositiveCount, 0);
  const falsePositiveCount = rows.reduce((sum, metric) => sum + metric.falsePositiveCount, 0);
  const falseNegativeCount = rows.reduce((sum, metric) => sum + metric.falseNegativeCount, 0);
  const precision = ratio(truePositiveCount, truePositiveCount + falsePositiveCount);
  const recall = ratio(truePositiveCount, truePositiveCount + falseNegativeCount);
  const f1 = calculateF1(precision, recall);
  const metricPass = rows.length > 0 && precision >= threshold.precision && recall >= threshold.recall && f1 >= threshold.f1;
  const certified = accepted && metricPass;
  return {
    schemaVersion: ATLAS_BASIC_LANGUAGE_PACK_LANGUAGE_ROW_SCHEMA_VERSION,
    languageCode,
    status: certified
      ? ATLAS_BASIC_LANGUAGE_PACK_STATUS.CERTIFIED_EXACT_ONLY
      : ATLAS_BASIC_LANGUAGE_PACK_STATUS.UNSUPPORTED_EXACT_ONLY,
    acceptedForCertification: accepted,
    analyzerId: ATLAS_OBSERVATION_ANALYZER_ID,
    exactOnly: true,
    fuzzyMatching: false,
    englishFallback: false,
    deepSupported: false,
    caseCount: rows.length,
    passedCaseCount: rows.filter((row) => row.pass).length,
    truePositiveCount,
    falsePositiveCount,
    falseNegativeCount,
    precision,
    recall,
    f1,
    threshold,
    claims: [...new Set((Array.isArray(language?.claims) ? language.claims : [])
      .map(normalizeString)
      .filter(Boolean))].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'variant' })),
  };
}

export function getAtlasBasicLanguagePackDefaultCorpus() {
  return DEFAULT_CORPUS;
}

export function deriveAtlasBasicLanguagePackCertification(input = {}) {
  const corpus = isPlainObject(input.corpus) ? input.corpus : DEFAULT_CORPUS;
  const threshold = {
    precision: normalizeNumber(corpus?.threshold?.precision, DEFAULT_THRESHOLD.precision),
    recall: normalizeNumber(corpus?.threshold?.recall, DEFAULT_THRESHOLD.recall),
    f1: normalizeNumber(corpus?.threshold?.f1, DEFAULT_THRESHOLD.f1),
  };
  const caseMetrics = sortAtlasBasicLanguagePackCaseMetrics((Array.isArray(corpus.cases) ? corpus.cases : [])
    .map((corpusCase) => evaluateCase(corpusCase)));
  const languageRows = sortAtlasBasicLanguagePackRows((Array.isArray(corpus.languages) ? corpus.languages : [])
    .map((language) => summarizeLanguage(language, caseMetrics, threshold)));
  const certifiedLanguageCodes = languageRows
    .filter((row) => row.status === ATLAS_BASIC_LANGUAGE_PACK_STATUS.CERTIFIED_EXACT_ONLY)
    .map((row) => row.languageCode);
  const unsupportedLanguageCodes = languageRows
    .filter((row) => row.status === ATLAS_BASIC_LANGUAGE_PACK_STATUS.UNSUPPORTED_EXACT_ONLY)
    .map((row) => row.languageCode);
  const contract = {
    schemaVersion: ATLAS_BASIC_LANGUAGE_PACK_CONTRACT_SCHEMA_VERSION,
    analyzerId: ATLAS_OBSERVATION_ANALYZER_ID,
    contractId: 'atlas.basicLanguagePack.exactOnly.v1',
    claimLevel: 'BASIC',
    exactOnly: true,
    fuzzyMatching: false,
    stemming: false,
    morphology: false,
    segmentationEngine: false,
    englishFallback: false,
    deepSupported: false,
    runtimeDownload: false,
    dynamicExecutablePlugin: false,
    capabilities: [
      'manualAliases',
      'exactMentions',
      'evidenceAnchors',
      'observationAggregate',
      'literalDiacriticPreservation',
    ],
  };
  const certificationHash = hashCanonicalValue({
    schemaVersion: ATLAS_BASIC_LANGUAGE_PACK_CERTIFICATION_SCHEMA_VERSION,
    contract,
    languageRows,
    caseMetrics,
  });
  return {
    schemaVersion: ATLAS_BASIC_LANGUAGE_PACK_CERTIFICATION_SCHEMA_VERSION,
    state: languageRows.every((row) => row.englishFallback === false && row.deepSupported === false) ? 'ready' : 'degraded',
    corpusSchemaVersion: normalizeString(corpus.schemaVersion),
    contract,
    summary: {
      languageCount: languageRows.length,
      certifiedExactOnlyCount: certifiedLanguageCodes.length,
      unsupportedExactOnlyCount: unsupportedLanguageCodes.length,
      caseCount: caseMetrics.length,
      passedCaseCount: caseMetrics.filter((metric) => metric.pass).length,
      threshold,
      certifiedLanguageCodes,
      unsupportedLanguageCodes,
      certificationHash,
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
