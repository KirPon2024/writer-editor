export const ATLAS_COMPLEX_SCRIPT_EXACT_ONLY_GUARD_SCHEMA_VERSION = 'derived.atlas.complexScriptExactOnlyGuard.v1';
export const ATLAS_COMPLEX_SCRIPT_GUARD_LANGUAGE_ROW_SCHEMA_VERSION = 'derived.atlas.complexScriptGuardLanguageRow.v1';
export const ATLAS_COMPLEX_SCRIPT_GUARD_CASE_METRIC_SCHEMA_VERSION = 'derived.atlas.complexScriptGuardCaseMetric.v1';

export const ATLAS_COMPLEX_SCRIPT_GUARD_STATUS = Object.freeze({
  GUARDED_EXACT_ONLY: 'GUARDED_EXACT_ONLY',
  UNSUPPORTED_EXACT_ONLY: 'UNSUPPORTED_EXACT_ONLY',
});

export const ATLAS_COMPLEX_SCRIPT_CLASS = Object.freeze({
  CJK: 'CJK',
  RTL: 'RTL',
  INDIC: 'INDIC',
  COMBINING: 'COMBINING',
});

export function sortAtlasComplexScriptGuardRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    return String(left?.languageCode || '').localeCompare(String(right?.languageCode || ''), 'en', { sensitivity: 'variant' });
  });
}

export function sortAtlasComplexScriptGuardCaseMetrics(metrics) {
  return [...(Array.isArray(metrics) ? metrics : [])].sort((left, right) => {
    const language = String(left?.languageCode || '').localeCompare(String(right?.languageCode || ''), 'en', { sensitivity: 'variant' });
    if (language !== 0) return language;
    return String(left?.caseId || '').localeCompare(String(right?.caseId || ''), 'en', { sensitivity: 'variant' });
  });
}
