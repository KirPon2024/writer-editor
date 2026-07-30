export const ATLAS_CONTINUITY_FACT_SCHEMA_VERSION = 'atlas.continuityFact.v1';
export const ATLAS_CONTINUITY_FACT_LEDGERS_SCHEMA_VERSION = 'derived.atlas.continuityFactLedgers.v1';
export const ATLAS_CONTINUITY_FACT_LEDGERS_SURFACE_MANIFEST_VERSION = 'surface.atlas.continuityFactLedgers.v1';

export const ATLAS_CONTINUITY_LEDGER_KINDS = Object.freeze([
  'location',
  'knowledge',
  'object',
  'promise',
]);

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0);
}

export function sortAtlasContinuityFacts(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const ledger = compareText(a.ledgerKind, b.ledgerKind);
    if (ledger !== 0) return ledger;
    const scene = compareText(a.sceneId, b.sceneId);
    if (scene !== 0) return scene;
    const updated = compareNumber(a.updatedByCommandSeq, b.updatedByCommandSeq);
    if (updated !== 0) return updated;
    return compareText(a.id, b.id);
  });
}

export function createEmptyAtlasContinuityFactLedgerRows() {
  return {
    location: [],
    knowledge: [],
    object: [],
    promise: [],
  };
}
