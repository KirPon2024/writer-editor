export const ATLAS_OPTIONAL_RELATION_VOCABULARY_SCHEMA_VERSION = 'derived.atlas.optionalRelationVocabulary.v1';
export const ATLAS_OPTIONAL_RELATION_VOCABULARY_ROW_SCHEMA_VERSION = 'derived.atlas.optionalRelationVocabularyRow.v1';
export const ATLAS_OPTIONAL_RELATION_VOCABULARY_REJECTED_ROW_SCHEMA_VERSION = 'derived.atlas.optionalRelationVocabularyRejectedRow.v1';
export const ATLAS_OPTIONAL_RELATION_VOCABULARY_EVIDENCE_SCHEMA_VERSION = 'derived.atlas.optionalRelationVocabularyEvidence.v1';
export const ATLAS_OPTIONAL_RELATION_VOCABULARY_STAGE_ID = 'A1_OPTIONAL_RELATION_VOCABULARY';

export const ATLAS_OPTIONAL_RELATION_VOCABULARY_ROW_KIND = Object.freeze({
  AUTHOR_RELATION_VOCABULARY: 'authorRelationVocabulary',
  OBSERVED_COOCCURRENCE: 'observedCooccurrence',
});

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

export function sortAtlasOptionalRelationVocabularyRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const kind = compareText(a?.rowKind, b?.rowKind);
    if (kind !== 0) return kind;
    const label = compareText(a?.normalizedLabel, b?.normalizedLabel);
    if (label !== 0) return label;
    return compareText(a?.rowId, b?.rowId);
  });
}

export function sortAtlasOptionalRelationVocabularyRejectedRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const code = compareText(a?.code, b?.code);
    if (code !== 0) return code;
    return compareText(a?.sourceRowId, b?.sourceRowId);
  });
}
