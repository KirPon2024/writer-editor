import { hashCanonicalValue } from '../deriveView.mjs';
import { ATLAS_OBSERVATION_ANALYZER_ID } from './atlasObservationTypes.mjs';
import {
  ATLAS_DEEP_FIXTURE_CASE_METRIC_SCHEMA_VERSION,
  ATLAS_DEEP_FIXTURE_CERTIFICATION_SCHEMA_VERSION,
  ATLAS_DEEP_FIXTURE_CLAIM,
  ATLAS_DEEP_FIXTURE_CONTRACT_SCHEMA_VERSION,
  ATLAS_DEEP_FIXTURE_LANGUAGE_ROW_SCHEMA_VERSION,
  ATLAS_DEEP_FIXTURE_STATUS,
  sortAtlasDeepFixtureCaseMetrics,
  sortAtlasDeepFixtureRows,
} from './atlasDeepFixtureCertificationTypes.mjs';

const ADAPTER_ID = 'atlas.deep.localFixtureAdapter.v1';
const DEFAULT_THRESHOLD = Object.freeze({
  precision: 1,
  recall: 1,
  f1: 1,
});

const DEFAULT_CORPUS = Object.freeze({
  schemaVersion: 'fixture.atlas.ruEnDeepCertificationCorpus.v1',
  threshold: DEFAULT_THRESHOLD,
  languages: [
    {
      languageCode: 'en',
      accepted: true,
      claims: [
        ATLAS_DEEP_FIXTURE_CLAIM.NER_FIXTURE,
        ATLAS_DEEP_FIXTURE_CLAIM.COREFERENCE_FIXTURE,
        ATLAS_DEEP_FIXTURE_CLAIM.DIALOGUE_FIXTURE,
        ATLAS_DEEP_FIXTURE_CLAIM.EVENT_FIXTURE,
        ATLAS_DEEP_FIXTURE_CLAIM.ROLE_FIXTURE,
      ],
    },
    {
      languageCode: 'ru',
      accepted: true,
      claims: [
        ATLAS_DEEP_FIXTURE_CLAIM.NER_FIXTURE,
        ATLAS_DEEP_FIXTURE_CLAIM.COREFERENCE_FIXTURE,
        ATLAS_DEEP_FIXTURE_CLAIM.DIALOGUE_FIXTURE,
        ATLAS_DEEP_FIXTURE_CLAIM.EVENT_FIXTURE,
        ATLAS_DEEP_FIXTURE_CLAIM.ROLE_FIXTURE,
      ],
    },
    { languageCode: 'de', accepted: false, claims: [] },
    { languageCode: 'ar', accepted: false, claims: [] },
  ],
  cases: [
    {
      caseId: 'en-dialogue-promise-coref',
      languageCode: 'en',
      dimensions: ['ner', 'dialogue', 'coreference', 'event', 'role'],
      expectations: [
        { signalId: 'entity:mira', kind: 'ner', count: 2 },
        { signalId: 'entity:anna', kind: 'ner', count: 1 },
        { signalId: 'speaker:anna', kind: 'dialogue', count: 1 },
        { signalId: 'coref:she->anna', kind: 'coreference', count: 1 },
        { signalId: 'event:promise:return', kind: 'event', count: 1 },
        { signalId: 'role:anna:promiser', kind: 'role', count: 1 },
      ],
      observed: [
        { signalId: 'entity:mira', kind: 'ner', count: 2 },
        { signalId: 'entity:anna', kind: 'ner', count: 1 },
        { signalId: 'speaker:anna', kind: 'dialogue', count: 1 },
        { signalId: 'coref:she->anna', kind: 'coreference', count: 1 },
        { signalId: 'event:promise:return', kind: 'event', count: 1 },
        { signalId: 'role:anna:promiser', kind: 'role', count: 1 },
      ],
    },
    {
      caseId: 'ru-dialogue-return-coref',
      languageCode: 'ru',
      dimensions: ['ner', 'dialogue', 'coreference', 'event', 'role'],
      expectations: [
        { signalId: 'entity:мария', kind: 'ner', count: 2 },
        { signalId: 'entity:софья', kind: 'ner', count: 1 },
        { signalId: 'speaker:мария', kind: 'dialogue', count: 1 },
        { signalId: 'coref:она->мария', kind: 'coreference', count: 1 },
        { signalId: 'event:обещание:вернуться', kind: 'event', count: 1 },
        { signalId: 'role:мария:promiser', kind: 'role', count: 1 },
      ],
      observed: [
        { signalId: 'entity:мария', kind: 'ner', count: 2 },
        { signalId: 'entity:софья', kind: 'ner', count: 1 },
        { signalId: 'speaker:мария', kind: 'dialogue', count: 1 },
        { signalId: 'coref:она->мария', kind: 'coreference', count: 1 },
        { signalId: 'event:обещание:вернуться', kind: 'event', count: 1 },
        { signalId: 'role:мария:promiser', kind: 'role', count: 1 },
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

function normalizeSignals(rawSignals) {
  const out = new Map();
  for (const signal of Array.isArray(rawSignals) ? rawSignals : []) {
    const signalId = normalizeString(signal?.signalId);
    const kind = normalizeString(signal?.kind);
    if (!signalId || !kind) continue;
    const key = `${kind}:${signalId}`;
    out.set(key, {
      signalId,
      kind,
      count: Math.max(0, Math.trunc(normalizeNumber(signal?.count, 0))),
    });
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

function evaluateCase(rawCase, threshold) {
  const caseId = normalizeString(rawCase?.caseId);
  const languageCode = normalizeLanguageCode(rawCase?.languageCode);
  const expectations = normalizeSignals(rawCase?.expectations);
  const observedSignals = normalizeSignals(rawCase?.observed);
  const signalKeys = [...new Set([...expectations.keys(), ...observedSignals.keys()])].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'variant' }));
  let truePositiveCount = 0;
  let falsePositiveCount = 0;
  let falseNegativeCount = 0;
  const signalMetrics = [];
  for (const key of signalKeys) {
    const expected = expectations.get(key) || { signalId: key, kind: 'unknown', count: 0 };
    const observed = observedSignals.get(key) || { signalId: expected.signalId, kind: expected.kind, count: 0 };
    truePositiveCount += Math.min(observed.count, expected.count);
    if (observed.count > expected.count) falsePositiveCount += observed.count - expected.count;
    if (expected.count > observed.count) falseNegativeCount += expected.count - observed.count;
    signalMetrics.push({
      signalId: expected.signalId,
      kind: expected.kind,
      expectedCount: expected.count,
      observedCount: observed.count,
    });
  }
  const precision = ratio(truePositiveCount, truePositiveCount + falsePositiveCount);
  const recall = ratio(truePositiveCount, truePositiveCount + falseNegativeCount);
  const f1 = calculateF1(precision, recall);
  return {
    schemaVersion: ATLAS_DEEP_FIXTURE_CASE_METRIC_SCHEMA_VERSION,
    caseId,
    languageCode,
    dimensions: [...new Set((Array.isArray(rawCase?.dimensions) ? rawCase.dimensions : [])
      .map(normalizeString)
      .filter(Boolean))].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'variant' })),
    expectedSignalCount: [...expectations.values()].reduce((sum, signal) => sum + signal.count, 0),
    observedSignalCount: [...observedSignals.values()].reduce((sum, signal) => sum + signal.count, 0),
    truePositiveCount,
    falsePositiveCount,
    falseNegativeCount,
    precision,
    recall,
    f1,
    pass: precision >= threshold.precision && recall >= threshold.recall && f1 >= threshold.f1,
    signalMetrics,
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
  const status = accepted
    ? metricPass
      ? ATLAS_DEEP_FIXTURE_STATUS.CERTIFIED_DEEP_FIXTURE
      : ATLAS_DEEP_FIXTURE_STATUS.DECERTIFIED_BY_CORPUS
    : ATLAS_DEEP_FIXTURE_STATUS.DEGRADED_TO_EXACT_ONLY;
  return {
    schemaVersion: ATLAS_DEEP_FIXTURE_LANGUAGE_ROW_SCHEMA_VERSION,
    languageCode,
    status,
    acceptedForCertification: accepted,
    adapterId: ADAPTER_ID,
    fixtureOnly: true,
    productionRuntimeClaim: false,
    englishFallback: false,
    deepSupported: status === ATLAS_DEEP_FIXTURE_STATUS.CERTIFIED_DEEP_FIXTURE,
    caseCount: rows.length,
    passedCaseCount: rows.filter((row) => row.pass).length,
    truePositiveCount,
    falsePositiveCount,
    falseNegativeCount,
    precision,
    recall,
    f1,
    threshold,
    claims: status === ATLAS_DEEP_FIXTURE_STATUS.CERTIFIED_DEEP_FIXTURE
      ? [...new Set((Array.isArray(language?.claims) ? language.claims : [])
        .map(normalizeString)
        .filter(Boolean))].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'variant' }))
      : [],
    downgradeTarget: 'BASIC_OR_GLOBAL_EXACT_ONLY',
  };
}

export function getAtlasRuEnDeepFixtureDefaultCorpus() {
  return DEFAULT_CORPUS;
}

export function deriveAtlasDeepFixtureCertification(input = {}) {
  const corpus = isPlainObject(input.corpus) ? input.corpus : DEFAULT_CORPUS;
  const threshold = {
    precision: normalizeNumber(corpus?.threshold?.precision, DEFAULT_THRESHOLD.precision),
    recall: normalizeNumber(corpus?.threshold?.recall, DEFAULT_THRESHOLD.recall),
    f1: normalizeNumber(corpus?.threshold?.f1, DEFAULT_THRESHOLD.f1),
  };
  const caseMetrics = sortAtlasDeepFixtureCaseMetrics((Array.isArray(corpus.cases) ? corpus.cases : [])
    .map((corpusCase) => evaluateCase(corpusCase, threshold)));
  const languageRows = sortAtlasDeepFixtureRows((Array.isArray(corpus.languages) ? corpus.languages : [])
    .map((language) => summarizeLanguage(language, caseMetrics, threshold)));
  const certifiedLanguageCodes = languageRows
    .filter((row) => row.status === ATLAS_DEEP_FIXTURE_STATUS.CERTIFIED_DEEP_FIXTURE)
    .map((row) => row.languageCode);
  const degradedLanguageCodes = languageRows
    .filter((row) => row.status === ATLAS_DEEP_FIXTURE_STATUS.DEGRADED_TO_EXACT_ONLY)
    .map((row) => row.languageCode);
  const decertifiedLanguageCodes = languageRows
    .filter((row) => row.status === ATLAS_DEEP_FIXTURE_STATUS.DECERTIFIED_BY_CORPUS)
    .map((row) => row.languageCode);
  const contract = {
    schemaVersion: ATLAS_DEEP_FIXTURE_CONTRACT_SCHEMA_VERSION,
    analyzerId: ATLAS_OBSERVATION_ANALYZER_ID,
    adapterId: ADAPTER_ID,
    contractId: 'atlas.deep.ruEnLocalFixture.v1',
    claimLevel: 'DEEP',
    fixtureOnly: true,
    productionRuntimeClaim: false,
    remoteModelRequired: false,
    runtimeDownload: false,
    dynamicExecutablePlugin: false,
    englishFallback: false,
    projectTruthMutation: false,
    manuscriptMutation: false,
    capabilities: [
      'ner',
      'constrainedCoreference',
      'dialogue',
      'eventExtraction',
      'roles',
      'corpusFixtureMetrics',
    ],
  };
  const certificationHash = hashCanonicalValue({
    schemaVersion: ATLAS_DEEP_FIXTURE_CERTIFICATION_SCHEMA_VERSION,
    contract,
    languageRows,
    caseMetrics,
  });
  return {
    schemaVersion: ATLAS_DEEP_FIXTURE_CERTIFICATION_SCHEMA_VERSION,
    state: decertifiedLanguageCodes.length === 0 ? 'ready' : 'degraded',
    corpusSchemaVersion: normalizeString(corpus.schemaVersion),
    contract,
    summary: {
      languageCount: languageRows.length,
      certifiedDeepCount: certifiedLanguageCodes.length,
      degradedToExactOnlyCount: degradedLanguageCodes.length,
      decertifiedByCorpusCount: decertifiedLanguageCodes.length,
      caseCount: caseMetrics.length,
      passedCaseCount: caseMetrics.filter((metric) => metric.pass).length,
      threshold,
      certifiedLanguageCodes,
      degradedLanguageCodes,
      decertifiedLanguageCodes,
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
    guards: {
      fixtureOnly: true,
      noProductionRuntimeClaim: true,
      noSilentEnglishFallback: languageRows.every((row) => row.englishFallback === false),
      certifiedOnlyWithMetrics: languageRows
        .filter((row) => row.status === ATLAS_DEEP_FIXTURE_STATUS.CERTIFIED_DEEP_FIXTURE)
        .every((row) => row.caseCount > 0 && row.precision >= threshold.precision && row.recall >= threshold.recall && row.f1 >= threshold.f1),
      degradationIsLocalPerLanguage: true,
      noRuntimeDownload: true,
      noDynamicExecutablePlugin: true,
    },
    languageRows,
    caseMetrics,
  };
}
