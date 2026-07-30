export const ATLAS_HEATMAP_SCHEMA_VERSION = 'derived.atlas.heatmap.v1';
export const ATLAS_HEATMAP_SURFACE_MANIFEST_VERSION = 'surface.atlas.heatmap.v1';
export const ATLAS_HEATMAP_TILE_PACKET_SCHEMA_VERSION = 'derived.atlas.heatmap.tilePacket.v1';
export const ATLAS_HEATMAP_LEGEND_SCHEMA_VERSION = 'derived.atlas.heatmapLegend.v1';
export const ATLAS_HEATMAP_VIEWPORT_BUDGET_PROOF_SCHEMA_VERSION = 'derived.atlas.heatmapViewportBudgetProof.v1';

export const ATLAS_HEATMAP_INTENSITY_BANDS = Object.freeze([
  'none',
  'low',
  'medium',
  'high',
  'max',
]);

export function normalizeAtlasHeatmapBand(value) {
  return ATLAS_HEATMAP_INTENSITY_BANDS.includes(value) ? value : 'none';
}

export function compareAtlasHeatmapTiles(a, b) {
  const row = Number(a.rowIndex || 0) - Number(b.rowIndex || 0);
  if (row !== 0) return row;
  const column = Number(a.columnIndex || 0) - Number(b.columnIndex || 0);
  if (column !== 0) return column;
  return String(a.tileId || '').localeCompare(String(b.tileId || ''), 'en', { sensitivity: 'variant' });
}
