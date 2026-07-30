export const ATLAS_SAVED_VIEW_PORTABILITY_PACKET_SCHEMA_VERSION = 'atlas.savedViewPortabilityPacket.v1';
export const ATLAS_SAVED_VIEW_PORTABILITY_ROW_SCHEMA_VERSION = 'atlas.savedViewPortabilityRow.v1';
export const ATLAS_SAVED_VIEW_BATCH_PREVIEW_SCHEMA_VERSION = 'atlas.savedViewBatchPreview.v1';
export const ATLAS_SAVED_VIEW_BATCH_ROW_SCHEMA_VERSION = 'atlas.savedViewBatchRow.v1';
export const ATLAS_SAVED_VIEW_BATCH_COLLISION_SCHEMA_VERSION = 'atlas.savedViewBatchCollision.v1';
export const ATLAS_SAVED_VIEW_BATCH_APPLY_RECEIPT_SCHEMA_VERSION = 'atlas.savedViewBatchApplyReceipt.v1';
export const ATLAS_STAGE_09_ACCEPTANCE_SCHEMA_VERSION = 'atlas.stage09SeriesPortabilityAcceptance.v1';
export const ATLAS_STAGE_09_ID = 'E09_STAGE_09_SERIES_AND_PORTABILITY_CONTOURS';
export const ATLAS_STAGE_09_NEXT_CONTOUR = 'E10_C00_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOUR_COMPILATION';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

export function sortAtlasSavedViewPortabilityRows(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const type = compareText(a?.reportType, b?.reportType);
    if (type !== 0) return type;
    const name = compareText(a?.name, b?.name);
    if (name !== 0) return name;
    return compareText(a?.id, b?.id);
  });
}

export function sortAtlasSavedViewBatchRows(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const order = Number(a?.order || 0) - Number(b?.order || 0);
    if (order !== 0) return order;
    return compareText(a?.savedViewId, b?.savedViewId);
  });
}

export function sortAtlasSavedViewBatchCollisions(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const blocking = Number(b?.blocking === true) - Number(a?.blocking === true);
    if (blocking !== 0) return blocking;
    const reason = compareText(a?.reasonCode, b?.reasonCode);
    if (reason !== 0) return reason;
    return compareText(a?.savedViewId, b?.savedViewId);
  });
}
