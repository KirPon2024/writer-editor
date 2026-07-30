export const ATLAS_DEEP_FIXTURE_CERTIFICATION_SCHEMA_VERSION = 'derived.atlas.deepFixtureCertification.v1';
export const ATLAS_DEEP_FIXTURE_LANGUAGE_ROW_SCHEMA_VERSION = 'derived.atlas.deepFixtureLanguageRow.v1';
export const ATLAS_DEEP_FIXTURE_CASE_METRIC_SCHEMA_VERSION = 'derived.atlas.deepFixtureCaseMetric.v1';
export const ATLAS_DEEP_FIXTURE_CONTRACT_SCHEMA_VERSION = 'derived.atlas.deepFixtureContract.v1';

export const ATLAS_DEEP_FIXTURE_STATUS = Object.freeze({
  CERTIFIED_DEEP_FIXTURE: 'CERTIFIED_DEEP_FIXTURE',
  DEGRADED_TO_EXACT_ONLY: 'DEGRADED_TO_EXACT_ONLY',
  DECERTIFIED_BY_CORPUS: 'DECERTIFIED_BY_CORPUS',
});

export const ATLAS_DEEP_FIXTURE_CLAIM = Object.freeze({
  NER_FIXTURE: 'nerFixture',
  COREFERENCE_FIXTURE: 'coreferenceFixture',
  DIALOGUE_FIXTURE: 'dialogueFixture',
  EVENT_FIXTURE: 'eventFixture',
  ROLE_FIXTURE: 'roleFixture',
});

export function sortAtlasDeepFixtureCaseMetrics(caseMetrics) {
  return [...(Array.isArray(caseMetrics) ? caseMetrics : [])].sort((left, right) => {
    return String(left?.caseId || '').localeCompare(String(right?.caseId || ''), 'en', { sensitivity: 'variant' });
  });
}

export function sortAtlasDeepFixtureRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    return String(left?.languageCode || '').localeCompare(String(right?.languageCode || ''), 'en', { sensitivity: 'variant' });
  });
}
