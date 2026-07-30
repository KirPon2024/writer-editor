export const ATLAS_SERIES_PORTABILITY_PREVIEW_SCHEMA_VERSION = 'derived.atlas.seriesPortabilityPreview.v1';
export const ATLAS_SERIES_IDENTITY_LINK_SCHEMA_VERSION = 'atlas.seriesIdentityLink.v1';
export const ATLAS_CUSTOM_VOCABULARY_ROW_SCHEMA_VERSION = 'atlas.customVocabularyRow.v1';
export const ATLAS_SERIES_PORTABILITY_COLLISION_SCHEMA_VERSION = 'atlas.seriesPortabilityCollision.v1';
export const ATLAS_SERIES_PORTABILITY_APPLY_RECEIPT_SCHEMA_VERSION = 'atlas.seriesPortabilityApplyReceipt.v1';
export const ATLAS_SERIES_PORTABILITY_ROLLBACK_PROOF_SCHEMA_VERSION = 'atlas.seriesPortabilityRollbackProof.v1';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

export function sortAtlasSeriesIdentityLinks(links) {
  return [...(Array.isArray(links) ? links : [])].sort((a, b) => {
    const shared = compareText(a?.sharedIdentityId, b?.sharedIdentityId);
    if (shared !== 0) return shared;
    const local = compareText(a?.localEntityId, b?.localEntityId);
    if (local !== 0) return local;
    return compareText(a?.id, b?.id);
  });
}

export function sortAtlasCustomVocabularyRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const kind = compareText(a?.vocabularyKind, b?.vocabularyKind);
    if (kind !== 0) return kind;
    const label = compareText(a?.normalizedLabel, b?.normalizedLabel);
    if (label !== 0) return label;
    return compareText(a?.id, b?.id);
  });
}

export function sortAtlasSeriesPortabilityCollisions(collisions) {
  return [...(Array.isArray(collisions) ? collisions : [])].sort((a, b) => {
    const severity = compareText(a?.severity, b?.severity);
    if (severity !== 0) return severity;
    const code = compareText(a?.code, b?.code);
    if (code !== 0) return code;
    return compareText(a?.subjectId, b?.subjectId);
  });
}
