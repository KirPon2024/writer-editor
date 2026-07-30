export const ATLAS_LANGUAGE_DECERTIFICATION_ROLLBACK_SCHEMA_VERSION = 'derived.atlas.languageDecertificationRollback.v1';
export const ATLAS_LANGUAGE_ROLLBACK_ROW_SCHEMA_VERSION = 'derived.atlas.languageRollbackRow.v1';
export const ATLAS_LANGUAGE_RESOURCE_ISOLATION_SCHEMA_VERSION = 'derived.atlas.languageResourceIsolation.v1';

export const ATLAS_LANGUAGE_ROLLBACK_STATUS = Object.freeze({
  CERTIFIED_ACTIVE: 'CERTIFIED_ACTIVE',
  ROLLED_BACK_TO_EXACT_ONLY: 'ROLLED_BACK_TO_EXACT_ONLY',
  DECERTIFIED_BY_CORPUS: 'DECERTIFIED_BY_CORPUS',
  DEGRADED_TO_EXACT_ONLY: 'DEGRADED_TO_EXACT_ONLY',
  UNAVAILABLE: 'UNAVAILABLE',
});

export const ATLAS_LANGUAGE_ROLLBACK_ACTION = Object.freeze({
  KEEP_CERTIFIED: 'KEEP_CERTIFIED',
  DECERTIFY_TO_EXACT_ONLY: 'DECERTIFY_TO_EXACT_ONLY',
  KEEP_DEGRADED_EXACT_ONLY: 'KEEP_DEGRADED_EXACT_ONLY',
  KEEP_DECERTIFIED_EXACT_ONLY: 'KEEP_DECERTIFIED_EXACT_ONLY',
});

export function sortAtlasLanguageRollbackRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    return String(left?.languageCode || '').localeCompare(String(right?.languageCode || ''), 'en', { sensitivity: 'variant' });
  });
}
