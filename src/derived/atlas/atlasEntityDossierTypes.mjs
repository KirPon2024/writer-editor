export const ATLAS_ENTITY_DOSSIER_SCHEMA_VERSION = 'derived.atlas.entityDossier.v1';
export const ATLAS_ENTITY_DOSSIER_SURFACE_MANIFEST_VERSION = 'surface.atlas.entityDossier.v1';
export const ATLAS_ENTITY_EVIDENCE_LEDGER_SCHEMA_VERSION = 'derived.atlas.entityEvidenceLedger.v1';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0);
}

export function sortAtlasEntityEvidenceRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const status = compareText(a.evidenceState, b.evidenceState);
    if (status !== 0) return status;
    const scene = compareText(a.sceneId, b.sceneId);
    if (scene !== 0) return scene;
    const start = compareNumber(a.startOffset, b.startOffset);
    if (start !== 0) return start;
    return compareText(a.ledgerRowId, b.ledgerRowId);
  });
}

export function sortAtlasEntityRelationRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const scenes = compareNumber(b.sceneCount, a.sceneCount);
    if (scenes !== 0) return scenes;
    const occurrences = compareNumber(b.occurrenceCount, a.occurrenceCount);
    if (occurrences !== 0) return occurrences;
    return compareText(a.otherEntityId, b.otherEntityId);
  });
}
