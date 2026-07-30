export const ATLAS_LANGUAGE_CAPABILITY_REPORT_SCHEMA_VERSION = 'derived.atlas.languageCapabilityReport.v1';
export const ATLAS_LANGUAGE_CAPABILITY_ROW_SCHEMA_VERSION = 'derived.atlas.languageCapabilityRow.v1';
export const ATLAS_LANGUAGE_CAPABILITY_GUARD_SCHEMA_VERSION = 'derived.atlas.languageCapabilityGuard.v1';

export const ATLAS_LANGUAGE_CAPABILITY_LEVEL = Object.freeze({
  GLOBAL: 'GLOBAL',
  BASIC: 'BASIC',
  DEEP: 'DEEP',
});

export const ATLAS_LANGUAGE_CAPABILITY_STATUS = Object.freeze({
  CERTIFIED_EXACT_ONLY: 'CERTIFIED_EXACT_ONLY',
  UNSUPPORTED_EXACT_ONLY: 'UNSUPPORTED_EXACT_ONLY',
  UNAVAILABLE: 'UNAVAILABLE',
});

export function sortAtlasLanguageCapabilityRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const level = String(left?.claimLevel || '').localeCompare(String(right?.claimLevel || ''), 'en', { sensitivity: 'variant' });
    if (level !== 0) return level;
    return String(left?.languageCode || '').localeCompare(String(right?.languageCode || ''), 'en', { sensitivity: 'variant' });
  });
}
