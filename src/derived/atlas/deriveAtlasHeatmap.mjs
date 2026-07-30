import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasMatrices } from './deriveAtlasMatrices.mjs';
import {
  ATLAS_HEATMAP_INTENSITY_BANDS,
  ATLAS_HEATMAP_LEGEND_SCHEMA_VERSION,
  ATLAS_HEATMAP_SCHEMA_VERSION,
  ATLAS_HEATMAP_SURFACE_MANIFEST_VERSION,
  ATLAS_HEATMAP_TILE_PACKET_SCHEMA_VERSION,
  ATLAS_HEATMAP_VIEWPORT_BUDGET_PROOF_SCHEMA_VERSION,
  compareAtlasHeatmapTiles,
  normalizeAtlasHeatmapBand,
} from './atlasHeatmapTypes.mjs';

const VIEW_ID = 'derived.atlas.heatmap.v1';
const PROVIDER_ID = 'query.atlasHeatmap';
const SURFACE_ID = 'surface.atlas.heatmap';
const RIGHT_RAIL_SLOT_ID = 'rightRail.context.atlas.heatmap';
const DEFAULT_ROW_LIMIT = 10;
const MAX_ROW_LIMIT = 16;
const DEFAULT_COLUMN_LIMIT = 10;
const MAX_COLUMN_LIMIT = 16;
const DEFAULT_TILE_LIMIT = 64;
const MAX_TILE_LIMIT = 144;
const DEFAULT_LIST_LIMIT = 16;
const MAX_LIST_LIMIT = 32;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(value, fallback, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

function fitViewportToTileLimit(rowLimit, columnLimit, tileLimit) {
  const fittedRows = Math.min(rowLimit, tileLimit);
  const fittedColumns = Math.min(columnLimit, Math.max(1, Math.floor(tileLimit / Math.max(1, fittedRows))));
  return {
    rowLimit: Math.max(1, fittedRows),
    columnLimit: Math.max(1, fittedColumns),
  };
}

function isAtlasHeatmapCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.heatmap'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.heatmap'] === false) return false;
  if (capabilities.atlasHeatmap === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.heatmap === false) return false;
  return true;
}

function buildSurfaceManifest() {
  return {
    schemaVersion: ATLAS_HEATMAP_SURFACE_MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    host: 'rightRail',
    slotId: RIGHT_RAIL_SLOT_ID,
    contributionKind: 'readOnlyHeavyProjection',
    allowedStateClasses: ['DERIVED_STATE', 'TRANSIENT_STATE'],
    commandAuthority: 'none',
    productMutation: false,
    storageAuthority: false,
    heavySurface: true,
    explicitOpenRequired: true,
    fallback: {
      empty: 'ATLAS_HEATMAP_EMPTY',
      degradedVisual: 'ATLAS_HEATMAP_DEGRADED_LIST_PARITY',
      unavailable: 'ATLAS_HEATMAP_UNAVAILABLE',
    },
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: ['derived.atlas.matrices.v1'],
    readModelOnly: true,
    commandAuthority: 'none',
    projectTruthMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    heavySurface: true,
    explicitOpenRequired: true,
    typingHotPath: false,
    backgroundDaemon: false,
    heatmapColorSystem: false,
  };
}

function buildLegend() {
  return {
    schemaVersion: ATLAS_HEATMAP_LEGEND_SCHEMA_VERSION,
    colorDependency: 'none',
    semanticPaletteChanged: false,
    bands: ATLAS_HEATMAP_INTENSITY_BANDS.map((band) => ({
      band,
      label: band === 'none' ? '0 observations' : `${band} density`,
      textFallback: band,
      cssToken: `data-band="${band}"`,
    })),
    degradedVisualFallback: {
      available: true,
      kind: 'listParity',
      reason: 'HEATMAP_CAN_RENDER_AS_TEXT_ROWS_WHEN_VISUAL_DENSITY_IS_UNAVAILABLE',
    },
  };
}

function emptyTilePacket() {
  return {
    schemaVersion: ATLAS_HEATMAP_TILE_PACKET_SCHEMA_VERSION,
    state: 'empty',
    mode: 'entityScene',
    rowAxis: emptyAxis('entity'),
    columnAxis: emptyAxis('scene'),
    rows: [],
    columns: [],
    tiles: [],
  };
}

function emptyAxis(kind) {
  return {
    kind,
    totalCount: 0,
    visibleCount: 0,
    omittedCount: 0,
    clipped: false,
  };
}

function buildBudgetProof({
  totalRows = 0,
  totalColumns = 0,
  visibleRows = 0,
  visibleColumns = 0,
  candidateTileCount = 0,
  renderedTileCount = 0,
  rowLimit = DEFAULT_ROW_LIMIT,
  columnLimit = DEFAULT_COLUMN_LIMIT,
  tileLimit = DEFAULT_TILE_LIMIT,
} = {}) {
  const totalTileCount = totalRows * totalColumns;
  return {
    schemaVersion: ATLAS_HEATMAP_VIEWPORT_BUDGET_PROOF_SCHEMA_VERSION,
    rowLimit,
    columnLimit,
    tileLimit,
    totalRows,
    totalColumns,
    totalTileCount,
    visibleRows,
    visibleColumns,
    candidateTileCount,
    renderedTileCount,
    omittedRowCount: Math.max(0, totalRows - visibleRows),
    omittedColumnCount: Math.max(0, totalColumns - visibleColumns),
    omittedCandidateTileCount: Math.max(0, candidateTileCount - renderedTileCount),
    omittedTotalTileCount: Math.max(0, totalTileCount - renderedTileCount),
    virtualized: true,
    renderAllCells: false,
    clippingHonest: totalRows > visibleRows || totalColumns > visibleColumns || candidateTileCount > renderedTileCount,
    queryOnlyOnExplicitOpen: true,
    typingHotPathNonblocking: true,
    refreshOnTyping: false,
    noBackgroundDaemon: true,
  };
}

function buildEvidence({ heatmapHash = '', matrixHash = '' } = {}) {
  return {
    schemaVersion: 'derived.atlas.heatmap.evidence.v1',
    heatmapHash,
    matrixHash,
    lazyweb: {
      applied: true,
      query: 'analytics heatmap dashboard',
      coverageStrength: 'strong',
      topSimilarity: 0.636,
      referenceCompanies: ['pop', 'mapbox', 'amplitude', 'atom-mobility', 'hotjar', 'squarespace', 'cloudflare', 'google-analytics'],
      resultUse: 'reference-only density legend, explicit heavy analytic surface, and nonblocking dashboard budget signal',
      fullReport: 'unavailable',
      fullReportUnavailableReason: 'LAZYWEB_LEGACY_PATH_RESTART_REQUIRED_AFTER_UPDATE',
    },
    designRoute: {
      lazyweb: 'search-applied',
      leonardo: 'not-applicable-no-semantic-heatmap-color-change',
      projectWallace: 'not-applicable-css-change-is-contained-to-existing-right-rail-surface',
    },
  };
}

function emptyHeatmapState(projectId, reason = '') {
  return {
    schemaVersion: ATLAS_HEATMAP_SCHEMA_VERSION,
    state: reason ? 'unavailable' : 'empty',
    unavailableReason: reason,
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId,
    summary: {
      entityCount: 0,
      sceneCount: 0,
      renderedTileCount: 0,
      omittedTileCount: 0,
      maxObservationCount: 0,
      heatmapHash: '',
      matrixHash: '',
      invalidationKey: '',
    },
    tilePacket: emptyTilePacket(),
    legend: buildLegend(),
    degradedVisualFallback: [],
    viewportBudgetProof: buildBudgetProof(),
    evidence: buildEvidence(),
  };
}

function intensityBand(value, maxValue) {
  const count = Number(value || 0);
  const max = Number(maxValue || 0);
  if (count <= 0 || max <= 0) return 'none';
  const ratio = count / max;
  if (ratio >= 1) return 'max';
  if (ratio >= 0.66) return 'high';
  if (ratio >= 0.33) return 'medium';
  return 'low';
}

function buildHeatmapFromMatrices({ matrices, rowLimit, columnLimit, tileLimit, listLimit, invalidationKey }) {
  const entitySceneMatrix = isPlainObject(matrices.entitySceneMatrix) ? matrices.entitySceneMatrix : emptyTilePacket();
  const rowAxis = isPlainObject(entitySceneMatrix.rowAxis) ? entitySceneMatrix.rowAxis : emptyAxis('entity');
  const columnAxis = isPlainObject(entitySceneMatrix.columnAxis) ? entitySceneMatrix.columnAxis : emptyAxis('scene');
  const rows = (Array.isArray(entitySceneMatrix.rows) ? entitySceneMatrix.rows : [])
    .slice(0, rowLimit)
    .map((row, rowIndex) => ({
      entityId: normalizeString(row.entityId),
      name: normalizeString(row.name) || normalizeString(row.entityId) || 'Entity',
      rowIndex,
    }));
  const columns = (Array.isArray(entitySceneMatrix.columns) ? entitySceneMatrix.columns : [])
    .slice(0, columnLimit)
    .map((column, columnIndex) => ({
      sceneId: normalizeString(column.sceneId),
      sceneTitle: normalizeString(column.sceneTitle) || normalizeString(column.sceneId) || 'Scene',
      sceneOrdinal: Number(column.sceneOrdinal || columnIndex),
      columnIndex,
    }));
  const sourceRows = Array.isArray(entitySceneMatrix.rows) ? entitySceneMatrix.rows.slice(0, rowLimit) : [];
  const maxObservationCount = Math.max(0, ...sourceRows.flatMap((row) => (Array.isArray(row.cells) ? row.cells : [])
    .slice(0, columnLimit)
    .map((cell) => Number(cell.appearanceCount || 0))));
  const candidateTiles = sourceRows.flatMap((row, rowIndex) => (Array.isArray(row.cells) ? row.cells : [])
    .slice(0, columnLimit)
    .map((cell, columnIndex) => {
      const observationCount = Number(cell.appearanceCount || 0);
      const band = normalizeAtlasHeatmapBand(intensityBand(observationCount, maxObservationCount));
      const entity = rows[rowIndex] || {};
      const scene = columns[columnIndex] || {};
      return {
        tileId: `${entity.entityId || rowIndex}:${scene.sceneId || columnIndex}`,
        entityId: entity.entityId || normalizeString(cell.entityId),
        sceneId: scene.sceneId || normalizeString(cell.sceneId),
        rowIndex,
        columnIndex,
        observationCount,
        intensityBand: band,
        evidenceAnchorIds: Array.isArray(cell.evidenceAnchorIds) ? cell.evidenceAnchorIds.filter((value) => typeof value === 'string') : [],
        ariaLabel: `${cell.ariaLabel || `${entity.name || 'Entity'} in ${scene.sceneTitle || 'Scene'}: ${observationCount} observations`}; ${band} heatmap intensity`,
        textFallback: `${entity.name || 'Entity'} / ${scene.sceneTitle || 'Scene'}: ${observationCount}`,
      };
    }));
  const tiles = candidateTiles.sort(compareAtlasHeatmapTiles).slice(0, tileLimit);
  const totalRows = Number(rowAxis.totalCount || rows.length);
  const totalColumns = Number(columnAxis.totalCount || columns.length);
  const visibleRows = rows.length;
  const visibleColumns = columns.length;
  const budgetProof = buildBudgetProof({
    totalRows,
    totalColumns,
    visibleRows,
    visibleColumns,
    candidateTileCount: candidateTiles.length,
    renderedTileCount: tiles.length,
    rowLimit,
    columnLimit,
    tileLimit,
  });
  const degradedRows = (Array.isArray(matrices.listParity?.entitySceneRows) ? matrices.listParity.entitySceneRows : [])
    .slice(0, listLimit)
    .map((row) => ({
      entityId: normalizeString(row.entityId),
      entityName: normalizeString(row.entityName) || normalizeString(row.entityId) || 'Entity',
      sceneId: normalizeString(row.sceneId),
      sceneTitle: normalizeString(row.sceneTitle) || normalizeString(row.sceneId) || 'Scene',
      observationCount: Number(row.appearanceCount || 0),
      evidenceAnchorCount: Array.isArray(row.evidenceAnchorIds) ? row.evidenceAnchorIds.length : 0,
      visibleInHeatmap: rows.some((entity) => entity.entityId === row.entityId) && columns.some((scene) => scene.sceneId === row.sceneId),
    }));
  const heatmapHash = hashCanonicalValue({
    matrixHash: matrices.summary?.matrixHash || '',
    rows,
    columns,
    tiles,
    budgetProof,
    degradedRows,
  });
  return {
    schemaVersion: ATLAS_HEATMAP_SCHEMA_VERSION,
    state: rows.length > 0 && columns.length > 0 ? 'ready' : 'empty',
    unavailableReason: '',
    surfaceManifest: buildSurfaceManifest(),
    authority: buildAuthority(),
    projectId: matrices.projectId || '',
    summary: {
      entityCount: totalRows,
      sceneCount: totalColumns,
      renderedTileCount: tiles.length,
      omittedTileCount: budgetProof.omittedTotalTileCount,
      maxObservationCount,
      heatmapHash,
      matrixHash: matrices.summary?.matrixHash || '',
      invalidationKey,
    },
    tilePacket: {
      schemaVersion: ATLAS_HEATMAP_TILE_PACKET_SCHEMA_VERSION,
      state: rows.length > 0 && columns.length > 0 ? 'ready' : 'empty',
      mode: 'entityScene',
      rowAxis: {
        kind: 'entity',
        totalCount: totalRows,
        visibleCount: visibleRows,
        omittedCount: Math.max(0, totalRows - visibleRows),
        clipped: totalRows > visibleRows,
      },
      columnAxis: {
        kind: 'scene',
        totalCount: totalColumns,
        visibleCount: visibleColumns,
        omittedCount: Math.max(0, totalColumns - visibleColumns),
        clipped: totalColumns > visibleColumns,
      },
      rows,
      columns,
      tiles,
    },
    legend: buildLegend(),
    degradedVisualFallback: degradedRows,
    viewportBudgetProof: budgetProof,
    evidence: buildEvidence({ heatmapHash, matrixHash: matrices.summary?.matrixHash || '' }),
  };
}

export function deriveAtlasHeatmap(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const languageCode = normalizeString(input?.params?.languageCode);
  const rowLimit = normalizeLimit(input?.params?.rowLimit, DEFAULT_ROW_LIMIT, MAX_ROW_LIMIT);
  const columnLimit = normalizeLimit(input?.params?.columnLimit, DEFAULT_COLUMN_LIMIT, MAX_COLUMN_LIMIT);
  const tileLimit = normalizeLimit(input?.params?.tileLimit, DEFAULT_TILE_LIMIT, MAX_TILE_LIMIT);
  const listLimit = normalizeLimit(input?.params?.listLimit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const fittedViewport = fitViewportToTileLimit(rowLimit, columnLimit, tileLimit);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_PROJECT_ID_REQUIRED',
        op: VIEW_ID,
        reason: 'PROJECT_ID_REQUIRED',
      },
    };
  }

  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params: {
      ...input.params,
      projectId,
      languageCode,
      rowLimit,
      columnLimit,
      tileLimit,
      listLimit,
      fittedRowLimit: fittedViewport.rowLimit,
      fittedColumnLimit: fittedViewport.columnLimit,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isAtlasHeatmapCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_HEATMAP_DISABLED',
          { capabilityId: 'atlas.heatmap' },
        );
      }
      const matrices = deriveAtlasMatrices({
        coreState,
        params: {
          projectId: params.projectId,
          languageCode: params.languageCode,
          rowLimit: params.fittedRowLimit,
          columnLimit: params.fittedColumnLimit,
          listLimit: params.listLimit,
        },
        capabilitySnapshot,
      });
      if (!matrices.ok) {
        throw createDerivedError(
          matrices.error?.code || 'E_ATLAS_MATRICES_UNAVAILABLE',
          VIEW_ID,
          matrices.error?.reason || 'ATLAS_MATRICES_UNAVAILABLE',
          matrices.error?.details || {},
        );
      }
      if (matrices.value.state === 'empty') return emptyHeatmapState(params.projectId);
      return buildHeatmapFromMatrices({
        matrices: matrices.value,
        rowLimit: params.fittedRowLimit,
        columnLimit: params.fittedColumnLimit,
        tileLimit: params.tileLimit,
        listLimit: params.listLimit,
        invalidationKey: meta.invalidationKey,
      });
    },
  });
}

export { VIEW_ID as ATLAS_HEATMAP_VIEW_ID };
