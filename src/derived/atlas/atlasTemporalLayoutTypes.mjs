export const ATLAS_TEMPORAL_LAYOUT_SCHEMA_VERSION = 'derived.atlas.temporalLayout.v1';
export const ATLAS_TEMPORAL_LAYOUT_SURFACE_MANIFEST_VERSION = 'surface.atlas.temporalLayout.v1';
export const ATLAS_TEMPORAL_LAYOUT_PACKET_SCHEMA_VERSION = 'derived.atlas.temporalLayoutPacket.v1';
export const ATLAS_TIME_SLIDER_STATE_SCHEMA_VERSION = 'derived.atlas.timeSliderState.v1';
export const ATLAS_TEMPORAL_LAYOUT_LIST_PARITY_SCHEMA_VERSION = 'derived.atlas.temporalLayoutListParity.v1';
export const ATLAS_TEMPORAL_LAYOUT_KEYBOARD_CONTRACT_SCHEMA_VERSION = 'derived.atlas.temporalLayoutKeyboardContract.v1';
export const ATLAS_TEMPORAL_LAYOUT_BUDGET_PROOF_SCHEMA_VERSION = 'derived.atlas.temporalLayoutBudgetProof.v1';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

function compareNumber(a, b) {
  return Number(a || 0) - Number(b || 0);
}

export function sortAtlasTemporalLayoutEvents(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const time = compareNumber(a.timeValue, b.timeValue);
    if (time !== 0) return time;
    const ordinal = compareNumber(a.sceneOrdinal, b.sceneOrdinal);
    if (ordinal !== 0) return ordinal;
    return compareText(a.sceneId, b.sceneId);
  });
}

export function sortAtlasTemporalLayoutSegments(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const start = compareNumber(a.startTimeValue, b.startTimeValue);
    if (start !== 0) return start;
    const end = compareNumber(a.endTimeValue, b.endTimeValue);
    if (end !== 0) return end;
    return compareText(a.segmentId, b.segmentId);
  });
}
