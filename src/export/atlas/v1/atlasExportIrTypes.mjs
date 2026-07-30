export const ATLAS_EXPORT_IR_SCHEMA_VERSION = 'atlas.exportIr.v1';
export const ATLAS_EXPORT_READABLE_JSON_SCHEMA_VERSION = 'atlas.exportReadableJson.v1';
export const ATLAS_EXPORT_UNKNOWN_FIELDS_ENVELOPE_SCHEMA_VERSION = 'atlas.unknownFieldsEnvelope.v1';
export const ATLAS_EXPORT_EVIDENCE_IDENTITY_INDEX_SCHEMA_VERSION = 'atlas.evidenceIdentityIndex.v1';
export const ATLAS_EXPORT_EVIDENCE_IDENTITY_ROW_SCHEMA_VERSION = 'atlas.evidenceIdentityRow.v1';
export const ATLAS_EXPORT_ROUND_TRIP_PROOF_SCHEMA_VERSION = 'atlas.exportRoundTripProof.v1';
export const ATLAS_IMPORT_PREVIEW_SCHEMA_VERSION = 'atlas.exportIrImportPreview.v1';
export const ATLAS_EXPORT_FORMAT = 'atlas-readable-json';

export const ATLAS_EXPORT_KNOWN_AUTHOR_DATA_KEYS = Object.freeze([
  'calendarDefinitions',
  'continuityFactLedgers',
  'decisions',
  'entities',
  'entityOperations',
  'entityVocabulary',
  'evidenceReattachments',
  'languageTags',
  'reassignments',
  'relationVocabulary',
  'savedQueries',
  'sceneTemporalAnchors',
  'schemaVersion',
  'seriesIdentityLinks',
  'seriesPortabilityOperations',
  'suppressions',
]);

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

export function sortAtlasEvidenceIdentityRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const anchor = compareText(a?.anchorId, b?.anchorId);
    if (anchor !== 0) return anchor;
    const scene = compareText(a?.sceneId, b?.sceneId);
    if (scene !== 0) return scene;
    const entity = compareText(a?.entityId, b?.entityId);
    if (entity !== 0) return entity;
    return compareText(a?.identityHash, b?.identityHash);
  });
}
