import { hashCanonicalValue } from '../core/browser-safe-hash.mjs';
import { ATLAS_DEEP_LINK_KIND, ATLAS_DOSSIER_LOD } from '../core/atlas-dossier-layout-links-v1.mjs';

export const ATLAS_DOSSIER_PRESENTATION_SCHEMA_VERSION = 'yalken.renderer.atlasDossierLayoutPresentation.v1';

function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function freezeDeep(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) freezeDeep(child); return Object.freeze(value); }
function safeText(value, fallback = '', maximum = 320) { if (typeof value !== 'string') return fallback; const text = value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/gu, '').trim(); return text.slice(0, maximum) || fallback; }
function safeCount(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function normalizeLod(value) { return Object.values(ATLAS_DOSSIER_LOD).includes(value) ? value : ATLAS_DOSSIER_LOD.CONTEXT; }
function stablePosition(rowId) {
  const hash = hashCanonicalValue({ namespace: 'WP504_STABLE_LAYOUT_V1', rowId });
  return Object.freeze({ rowId, x: 36 + (Number.parseInt(hash.slice(0, 8), 16) % 928), y: 36 + (Number.parseInt(hash.slice(8, 16), 16) % 628) });
}
function typedLink(kind, targetId, label, meta = '') { return Object.freeze({ kind, targetId: safeText(targetId), label: safeText(label, targetId), meta: safeText(meta) }); }
function evidenceRows(rows) {
  const result = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const sourceId = safeText(row.evidenceId || row.anchorId || row.observationId || row.sourceRecordId || row.cellId);
    const sceneId = safeText(row.sceneId);
    const startOffset = Number.isSafeInteger(row.startOffset) && row.startOffset >= 0 ? row.startOffset : null;
    const endOffset = Number.isSafeInteger(row.endOffset) && row.endOffset >= (startOffset ?? 0) ? row.endOffset : null;
    result.push(Object.freeze({
      evidenceId: sourceId || `evidence-${result.length + 1}`,
      label: safeText(row.quote || row.label || row.sourceRecordId || row.observationId, 'Evidence', 480),
      sceneId,
      startOffset,
      endOffset,
      state: safeText(row.evidenceState || row.state, 'CURRENT'),
    }));
  }
  return result;
}
function buildSelectedDossier(row, entityDossier = {}, relationDossier = {}) {
  if (!row) return freezeDeep({ state: 'empty', rowId: '', kicker: 'Dossier', title: 'Select an Atlas item', meta: 'Evidence and typed links stay bound to the current selection.', evidence: [], typedLinks: [] });
  const typedLinks = [typedLink(ATLAS_DEEP_LINK_KIND.ROW, row.rowId, row.title, row.kind)];
  let evidence = [];
  if (row.kind === 'ENTITY') {
    const entityId = row.rowId.slice('entity:'.length);
    typedLinks.push(typedLink(ATLAS_DEEP_LINK_KIND.ENTITY, entityId, 'Open entity dossier', row.status));
    if (safeText(entityDossier?.selectedEntityId) === entityId) evidence = evidenceRows(entityDossier?.evidenceLedger?.rows);
  } else if (row.kind === 'RELATION') {
    const pairId = row.rowId.slice('relation:'.length);
    typedLinks.push(typedLink(ATLAS_DEEP_LINK_KIND.RELATION, pairId, 'Open relation dossier', row.status));
    if (safeText(relationDossier?.selectedPairId) === pairId) evidence = evidenceRows(relationDossier?.evidencePacket?.rows);
  } else if (row.kind === 'SCENE') {
    const sceneId = row.rowId.slice('scene:'.length);
    typedLinks.push(typedLink(ATLAS_DEEP_LINK_KIND.SCENE, sceneId, 'Locate scene', row.status));
  }
  for (const item of evidence) typedLinks.push(typedLink(ATLAS_DEEP_LINK_KIND.EVIDENCE, item.evidenceId, 'Locate evidence', item.sceneId || item.state));
  return freezeDeep({
    state: 'ready', rowId: row.rowId, kicker: `${row.kind} dossier`, title: row.title,
    meta: `${row.subtitle} · ${evidence.length} exact evidence ${evidence.length === 1 ? 'item' : 'items'}`,
    evidence, typedLinks,
  });
}

export function buildAtlasDossierLayoutPresentation(input = {}) {
  const source = input.surfacePresentation && typeof input.surfacePresentation === 'object' ? input.surfacePresentation : {};
  const rows = Array.isArray(source.rows) ? source.rows : [];
  const rowIds = rows.map((row) => safeText(row?.rowId)).filter(Boolean);
  const selectedRowId = rowIds.includes(source.selectedRowId) ? source.selectedRowId : (rowIds[0] || '');
  const selectedRow = rows.find((row) => row?.rowId === selectedRowId) || null;
  const lod = normalizeLod(input.lod);
  const detail = { OVERVIEW: 'DOT', CONTEXT: 'LABEL', EVIDENCE: 'EVIDENCE_COUNT' }[lod];
  const graphNodes = rows.map((row) => Object.freeze({ ...stablePosition(row.rowId), detail, selected: row.rowId === selectedRowId, evidenceCount: row.rowId === selectedRowId ? buildSelectedDossier(row, input.entityDossier, input.relationDossier).evidence.length : 0 }));
  const positionDigest = `sha256:${hashCanonicalValue(graphNodes.map(({ rowId, x, y }) => ({ rowId, x, y })).sort((a, b) => compare(a.rowId, b.rowId)))}`;
  return freezeDeep({
    schemaVersion: ATLAS_DOSSIER_PRESENTATION_SCHEMA_VERSION,
    state: source.state === 'unavailable' ? 'unavailable' : rows.length ? 'ready' : 'empty',
    lod, selectedRowId, rowIds, rowCount: rows.length, graphNodes, positionDigest,
    dossier: buildSelectedDossier(selectedRow, input.entityDossier, input.relationDossier),
    summary: Object.freeze({ dossierCount: rows.length, selectedEvidenceCount: selectedRow ? buildSelectedDossier(selectedRow, input.entityDossier, input.relationDossier).evidence.length : 0, linkCount: selectedRow ? buildSelectedDossier(selectedRow, input.entityDossier, input.relationDossier).typedLinks.length : 0 }),
  });
}

export function assertAtlasDossierPresentationParity(presentation, surfacePresentation) {
  if (!presentation || presentation.schemaVersion !== ATLAS_DOSSIER_PRESENTATION_SCHEMA_VERSION) throw new Error('E_ATLAS_DOSSIER_PRESENTATION_SCHEMA');
  if (!surfacePresentation || JSON.stringify(presentation.rowIds) !== JSON.stringify(surfacePresentation.rowIds)) throw new Error('E_ATLAS_DOSSIER_PRESENTATION_ROW_PARITY');
  if (presentation.rowCount !== presentation.rowIds.length || presentation.graphNodes.length !== presentation.rowCount) throw new Error('E_ATLAS_DOSSIER_PRESENTATION_DENOMINATOR');
  if (new Set(presentation.graphNodes.map((node) => node.rowId)).size !== presentation.rowCount) throw new Error('E_ATLAS_DOSSIER_PRESENTATION_NODE_DUPLICATE');
  return presentation;
}

export function assertAtlasDossierPresentationMentalMapStable(...presentations) {
  if (presentations.length < 2) throw new Error('E_ATLAS_DOSSIER_PRESENTATION_STABILITY_DENOMINATOR');
  const positions = new Map();
  for (const presentation of presentations) for (const node of presentation.graphNodes) {
    const value = `${node.x}:${node.y}`;
    if (positions.has(node.rowId) && positions.get(node.rowId) !== value) throw new Error(`E_ATLAS_DOSSIER_PRESENTATION_POSITION_DRIFT:${node.rowId}`);
    positions.set(node.rowId, value);
  }
  return Object.freeze({ status: 'PASS', presentationCount: presentations.length, survivorCount: positions.size });
}

export { ATLAS_DEEP_LINK_KIND, ATLAS_DOSSIER_LOD };
