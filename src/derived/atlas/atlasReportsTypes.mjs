export const ATLAS_REPORTS_SAVED_QUERIES_SCHEMA_VERSION = 'derived.atlas.reportsSavedQueries.v1';
export const ATLAS_REPORTS_SURFACE_MANIFEST_VERSION = 'surface.atlas.reportsSavedQueries.v1';
export const ATLAS_LOCAL_REPORT_PACKET_SCHEMA_VERSION = 'derived.atlas.localReportPacket.v1';
export const ATLAS_SAVED_QUERY_READBACK_SCHEMA_VERSION = 'derived.atlas.savedQueryReadback.v1';
export const ATLAS_REPORT_EXPORT_SAFE_SUMMARY_SCHEMA_VERSION = 'derived.atlas.reportExportSafeSummary.v1';

export function sortAtlasSavedQueryReadbacks(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const updated = Number(b.updatedByCommandSeq || 0) - Number(a.updatedByCommandSeq || 0);
    if (updated !== 0) return updated;
    const names = String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'variant' });
    if (names !== 0) return names;
    return String(a.id || '').localeCompare(String(b.id || ''), 'en', { sensitivity: 'variant' });
  });
}
