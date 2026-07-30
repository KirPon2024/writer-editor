export const ATLAS_CONTINUITY_LEDGER_SURFACE_SCHEMA_VERSION = 'derived.atlas.continuityLedgerSurface.v1';
export const ATLAS_CONTINUITY_LEDGER_SURFACE_MANIFEST_VERSION = 'surface.atlas.continuityLedger.v1';
export const ATLAS_CONTINUITY_LEDGER_ROW_SCHEMA_VERSION = 'derived.atlas.continuityLedgerRow.v1';
export const ATLAS_CONTINUITY_LEDGER_EVIDENCE_ROW_SCHEMA_VERSION = 'derived.atlas.continuityLedgerEvidenceRow.v1';
export const ATLAS_CONTINUITY_LEDGER_JUMP_INTENT_SCHEMA_VERSION = 'derived.atlas.continuityLedgerJumpIntent.v1';
export const ATLAS_CONTINUITY_LEDGER_CORRECTION_ROUTE_SCHEMA_VERSION = 'derived.atlas.continuityLedgerCorrectionRoute.v1';
export const ATLAS_CONTINUITY_LEDGER_KEYBOARD_CONTRACT_SCHEMA_VERSION = 'derived.atlas.continuityLedgerKeyboardContract.v1';
export const ATLAS_CONTINUITY_LEDGER_LIST_PARITY_SCHEMA_VERSION = 'derived.atlas.continuityLedgerListParity.v1';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0);
}

export function sortAtlasContinuityLedgerRows(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const severity = compareText(a.severityRank, b.severityRank);
    if (severity !== 0) return severity;
    const scene = compareNumber(a.firstSceneOrdinal, b.firstSceneOrdinal);
    if (scene !== 0) return scene;
    const kind = compareText(a.findingKind || a.outcomeKind, b.findingKind || b.outcomeKind);
    if (kind !== 0) return kind;
    return compareText(a.id, b.id);
  });
}

export function sortAtlasContinuityLedgerEvidenceRows(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const scene = compareText(a.sceneId, b.sceneId);
    if (scene !== 0) return scene;
    const start = compareNumber(a.startOffset, b.startOffset);
    if (start !== 0) return start;
    return compareText(a.anchorId, b.anchorId);
  });
}
