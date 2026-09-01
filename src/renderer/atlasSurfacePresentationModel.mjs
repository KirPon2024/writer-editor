import { hashCanonicalValue } from '../core/browser-safe-hash.mjs';
import { ATLAS_SURFACE_POSTURE, ATLAS_SURFACE_VIEW } from '../core/atlas-surface-v1.mjs';

export const ATLAS_SURFACE_PRESENTATION_SCHEMA_VERSION = 'yalken.renderer.atlasSurfacePresentation.v1';
export const ATLAS_SURFACE_SPLIT_MIN_WIDTH = 1120;

function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}
function safeText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/gu, '').trim();
  return normalized.slice(0, 320) || fallback;
}
function safeCount(value) { return Number.isInteger(value) && value >= 0 ? value : 0; }
function normalizePosture(posture) { return Object.values(ATLAS_SURFACE_POSTURE).includes(posture) ? posture : ATLAS_SURFACE_POSTURE.MANUSCRIPT; }
function normalizeView(view) { return Object.values(ATLAS_SURFACE_VIEW).includes(view) ? view : ATLAS_SURFACE_VIEW.GRAPH; }
function overviewRows(overview = {}) {
  const rows = [];
  for (const entity of Array.isArray(overview.topEntities) ? overview.topEntities : []) {
    const sourceId = safeText(entity?.entityId, 'unknown-entity');
    rows.push({
      rowId: `entity:${sourceId}`,
      kind: 'ENTITY',
      title: safeText(entity?.name, sourceId),
      subtitle: `${safeCount(entity?.appearanceCount)} appearances · ${safeCount(entity?.sceneCount)} scenes`,
      status: safeText(entity?.entityKind, 'entity'),
    });
  }
  for (const relation of Array.isArray(overview.topRelations) ? overview.topRelations : []) {
    const leftId = safeText(relation?.leftEntityId, 'left');
    const rightId = safeText(relation?.rightEntityId, 'right');
    const sourceId = safeText(relation?.pairId, `${leftId}:${rightId}`);
    rows.push({
      rowId: `relation:${sourceId}`,
      kind: 'RELATION',
      title: `${safeText(relation?.leftName, leftId)} ↔ ${safeText(relation?.rightName, rightId)}`,
      subtitle: `${safeCount(relation?.occurrenceCount)} occurrences · ${safeCount(relation?.sceneCount)} scenes`,
      status: 'relation',
    });
  }
  for (const coverage of Array.isArray(overview.sceneCoverage) ? overview.sceneCoverage : []) {
    const sourceId = safeText(coverage?.sceneId, 'unknown-scene');
    rows.push({
      rowId: `scene:${sourceId}`,
      kind: 'SCENE',
      title: safeText(coverage?.title, safeText(coverage?.sceneTitle, sourceId)),
      subtitle: `${safeCount(coverage?.entityCount)} entities · ${safeCount(coverage?.observationCount)} observations`,
      status: safeText(coverage?.evidenceHealth, 'scene'),
    });
  }
  rows.sort((left, right) => compare(left.rowId, right.rowId));
  const unique = [];
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.rowId)) continue;
    seen.add(row.rowId);
    unique.push(Object.freeze(row));
  }
  return unique;
}
function graphLayout(rows) {
  const count = Math.max(1, rows.length);
  const radius = Math.min(154, 58 + count * 7);
  return rows.map((row, index) => {
    const angle = ((Math.PI * 2) / count) * index - Math.PI / 2;
    return Object.freeze({ rowId: row.rowId, x: Math.round(180 + Math.cos(angle) * radius), y: Math.round(150 + Math.sin(angle) * radius) });
  });
}

export function buildAtlasSurfacePresentation(input = {}) {
  const requestedPosture = normalizePosture(input.posture);
  const viewportWidth = Number.isFinite(input.viewportWidth) ? Math.max(0, input.viewportWidth) : ATLAS_SURFACE_SPLIT_MIN_WIDTH;
  const posture = requestedPosture === ATLAS_SURFACE_POSTURE.SPLIT && viewportWidth < ATLAS_SURFACE_SPLIT_MIN_WIDTH
    ? ATLAS_SURFACE_POSTURE.MANUSCRIPT
    : requestedPosture;
  const view = normalizeView(input.view);
  const rows = overviewRows(input.overview);
  const rowIds = rows.map((row) => row.rowId);
  const sharedRowSetDigest = `sha256:${hashCanonicalValue(rowIds)}`;
  const selectedRowId = rowIds.includes(input.selectedRowId) ? input.selectedRowId : (rowIds[0] || '');
  const summary = input.overview?.summary && typeof input.overview.summary === 'object' ? input.overview.summary : {};
  return freezeDeep({
    schemaVersion: ATLAS_SURFACE_PRESENTATION_SCHEMA_VERSION,
    state: input.overview?.state === 'unavailable' ? 'unavailable' : rows.length ? 'ready' : 'empty',
    requestedPosture,
    posture,
    responsiveFallbackApplied: posture !== requestedPosture,
    view,
    selectedRowId,
    rowCount: rows.length,
    rows,
    rowIds,
    sharedRowSetDigest,
    views: Object.values(ATLAS_SURFACE_VIEW).map((candidate) => Object.freeze({ view: candidate, rowIds: [...rowIds], rowSetDigest: sharedRowSetDigest })),
    graphNodes: graphLayout(rows),
    summary: Object.freeze({
      sceneCount: safeCount(summary.sceneCount),
      entityCount: safeCount(summary.entityCount),
      relationCount: safeCount(summary.cooccurrencePairCount),
      evidenceHealth: safeText(summary.evidenceHealth, 'empty'),
    }),
    unavailableReason: safeText(input.overview?.unavailableReason, ''),
  });
}

export function reduceAtlasSurfacePresentation(state, intent = {}, viewportWidth = ATLAS_SURFACE_SPLIT_MIN_WIDTH) {
  const current = state && typeof state === 'object' ? state : {};
  const type = safeText(intent.type, 'NOOP');
  let posture = current.requestedPosture || current.posture;
  let view = current.view;
  let selectedRowId = current.selectedRowId;
  if (type === 'SET_POSTURE') posture = normalizePosture(intent.posture);
  if (type === 'SET_VIEW') view = normalizeView(intent.view);
  if (type === 'SELECT_ROW') selectedRowId = safeText(intent.rowId, '');
  return buildAtlasSurfacePresentation({ overview: intent.overview || current.sourceOverview || {}, posture, view, selectedRowId, viewportWidth });
}

export function assertAtlasSurfacePresentationParity(presentation) {
  if (!presentation || presentation.schemaVersion !== ATLAS_SURFACE_PRESENTATION_SCHEMA_VERSION) throw new Error('E_ATLAS_SURFACE_PRESENTATION_SCHEMA');
  const expected = JSON.stringify(presentation.rowIds);
  if (presentation.rowCount !== presentation.rows.length || presentation.rowCount !== presentation.rowIds.length) throw new Error('E_ATLAS_SURFACE_PRESENTATION_DENOMINATOR');
  for (const view of presentation.views) {
    if (JSON.stringify(view.rowIds) !== expected || view.rowSetDigest !== presentation.sharedRowSetDigest) throw new Error('E_ATLAS_SURFACE_PRESENTATION_PARITY');
  }
  return presentation;
}

export { ATLAS_SURFACE_POSTURE, ATLAS_SURFACE_VIEW };

