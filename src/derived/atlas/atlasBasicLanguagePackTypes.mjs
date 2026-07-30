export const ATLAS_BASIC_LANGUAGE_PACK_CONTRACT_SCHEMA_VERSION = 'derived.atlas.basicLanguagePackContract.v1';
export const ATLAS_BASIC_LANGUAGE_PACK_CERTIFICATION_SCHEMA_VERSION = 'derived.atlas.basicLanguagePackCertification.v1';
export const ATLAS_BASIC_LANGUAGE_PACK_LANGUAGE_ROW_SCHEMA_VERSION = 'derived.atlas.basicLanguagePackLanguageRow.v1';
export const ATLAS_BASIC_LANGUAGE_PACK_CASE_METRIC_SCHEMA_VERSION = 'derived.atlas.basicLanguagePackCaseMetric.v1';

export const ATLAS_BASIC_LANGUAGE_PACK_STATUS = Object.freeze({
  CERTIFIED_EXACT_ONLY: 'CERTIFIED_EXACT_ONLY',
  UNSUPPORTED_EXACT_ONLY: 'UNSUPPORTED_EXACT_ONLY',
});

export const ATLAS_BASIC_LANGUAGE_PACK_CLAIM = Object.freeze({
  EXACT_BOUNDARY_MENTION: 'exactBoundaryMention',
  PUNCTUATION_STABLE: 'punctuationStable',
  QUOTE_STABLE: 'quoteStable',
  NAME_FORM_LITERAL: 'nameFormLiteral',
  CONTRACTION_LITERAL: 'contractionLiteral',
  POSSESSIVE_LITERAL: 'possessiveLiteral',
  DIACRITIC_PRESERVING: 'diacriticPreserving',
});

export function sortAtlasBasicLanguagePackRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    return String(left?.languageCode || '').localeCompare(String(right?.languageCode || ''), 'en', { sensitivity: 'variant' });
  });
}

export function sortAtlasBasicLanguagePackCaseMetrics(metrics) {
  return [...(Array.isArray(metrics) ? metrics : [])].sort((left, right) => {
    const language = String(left?.languageCode || '').localeCompare(String(right?.languageCode || ''), 'en', { sensitivity: 'variant' });
    if (language !== 0) return language;
    return String(left?.caseId || '').localeCompare(String(right?.caseId || ''), 'en', { sensitivity: 'variant' });
  });
}
