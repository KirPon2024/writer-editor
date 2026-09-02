import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { assertAtlasSurfaceCurrent } from './atlas-surface-v1.mjs';

export const ATLAS_DOSSIER_LAYOUT_LINKS_SCHEMA_VERSION = 'yalken.r24.atlasDossierLayoutLinks.v1';
export const ATLAS_DOSSIER_LAYOUT_VIEW_SCHEMA_VERSION = 'yalken.r24.atlasDossierLayoutView.v1';
export const ATLAS_DOSSIER_LAYOUT_LINKS_NODE_ID = 'WP-504_DOSSIER_LAYOUT_LINKS';
export const ATLAS_DOSSIER_LAYOUT_LINKS_PROFILE_ID = 'ATLAS_PRODUCT_V33';
export const ATLAS_DOSSIER_MAX_ROWS = 50_000;
export const ATLAS_DOSSIER_MAX_EVIDENCE = 200_000;
export const ATLAS_DOSSIER_LOD = Object.freeze({ OVERVIEW: 'OVERVIEW', CONTEXT: 'CONTEXT', EVIDENCE: 'EVIDENCE' });
export const ATLAS_DEEP_LINK_KIND = Object.freeze({ ROW: 'ATLAS_ROW', ENTITY: 'ATLAS_ENTITY', RELATION: 'ATLAS_RELATION', SCENE: 'ATLAS_SCENE', EVIDENCE: 'ATLAS_EVIDENCE' });
export const ATLAS_EVIDENCE_KIND = Object.freeze({ SCENE_RANGE: 'SCENE_RANGE', RECORD: 'RECORD' });

export const ATLAS_DOSSIER_LAYOUT_LINKS_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.atlas.dossierLayoutLinks.v1',
  featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:WP503_ATLAS_SURFACE_READ_MODEL',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY',
  authoritativeData: 'VERIFIED_WP503_ATLAS_SURFACE_AND_CALLER_VERIFIED_EVIDENCE_RECORDS',
  derivedData: 'REVISION_BOUND_DOSSIERS_STABLE_LAYOUT_LOD_AND_TYPED_READ_ONLY_LINKS',
  commandIds: ['NOT_APPLICABLE_PURE_QUERY_NO_MUTATION'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  queryIds: ['atlas.dossierLayoutLinks.compile.v1', 'atlas.dossierLayoutLinks.view.v1'],
  productProjectionIds: [ATLAS_DOSSIER_LAYOUT_LINKS_SCHEMA_VERSION],
  capabilityIds: ['cap.atlas.dossier.read', 'cap.atlas.evidence.navigate'],
  authorityMap: 'PRODUCT_CORE_INPUTS_READ_ONLY_DERIVED_PROJECTOR_OUTPUT_ONLY',
  identityKeys: ['projectId', 'projectRevisionId', 'snapshotId', 'generation', 'sharedRowSetDigest', 'surfaceProjectionDigest', 'projectionDigest'],
  revisionPolicy: 'EXACT_WP503_SURFACE_AND_EVIDENCE_SOURCE_REVISIONS_STALE_REJECTED',
  writePath: 'PURE_RETURN_VALUE_ONLY',
  readPath: 'VERIFIED_WP503_ROWS_AND_COMPLETE_EVIDENCE_DENOMINATOR',
  requiredProductPorts: ['WorkspaceQueryPort'],
  requiredDesignOsPorts: ['DomainProjectionPort', 'ShellProjectionPort'],
  adapterRequirements: ['renderer-adapter:atlas-workspace-dossier-rail'],
  surfaceManifests: ['surface.atlas.workspace.dossier'],
  slotRequirements: ['workspace.write.atlas.dossier'],
  supportedWorkspaces: ['WRITE', 'PLAN', 'REVIEW'],
  accessibilityRequirements: ['keyboard-lod-tablist', 'visible-focus', 'typed-link-text', 'graph-list-table-dossier-parity'],
  fallbacks: ['OVERVIEW_LOD_DEFAULT', 'TEXTUAL_DOSSIER_WHEN_GRAPH_UNAVAILABLE', 'EMPTY_STATE_WITHOUT_SYNTHETIC_EVIDENCE'],
  stateClasses: ['DERIVED_STATE', 'SHELL_STATE', 'TRANSIENT_STATE'],
  persistenceClass: 'NOT_PERSISTED_BY_THIS_MODULE',
  migrations: ['NOT_APPLICABLE_NO_STORED_SCHEMA'],
  recovery: 'RECOMPILE_FROM_VERIFIED_WP503_SURFACE_AND_EVIDENCE_RECORDS',
  rollback: 'REVERT_BOUNDED_MODULE_RENDERER_ADAPTER_AND_TEST_COMMIT',
  performanceBudget: { maximumRows: ATLAS_DOSSIER_MAX_ROWS, maximumEvidenceRecords: ATLAS_DOSSIER_MAX_EVIDENCE, complexity: 'O(rows_plus_evidence)' },
  securityBoundary: 'STRICT_OWN_DATA_EXACT_KEYSETS_NFC_BOUNDED_DENOMINATORS_NO_ACCESSORS_SYMBOLS_PATHS_URLS_OR_COMMAND_AUTHORITY',
  lifecycle: 'ON_DEMAND_PURE_COMPILATION_AND_TRANSIENT_LOD_SELECTION',
  negativeBypassChecks: ['STALE_SURFACE_IDENTITY_REJECTED', 'FUTURE_MISSING_DUPLICATE_OR_MISMATCHED_EVIDENCE_REJECTED', 'UNKNOWN_LINK_KIND_REJECTED', 'LOD_POSITION_DRIFT_REJECTED', 'PRODUCT_MUTATION_PERSISTENCE_AND_EXTERNAL_EFFECT_AUTHORITY_REJECTED'],
  evidenceBindings: ['WP503_EXTERNALLY_VERIFIED_PREDECESSOR', 'WP504_MODEL_CONTRACT_INTEGRATION_MUTANTS_DIFFERENTIAL_STALE_LARGE_CORPUS'],
  currentReality: 'ONE_PURE_REVISION_BOUND_DOSSIER_LAYOUT_PROJECTION_AND_READ_ONLY_DESKTOP_PRESENTATION_ADAPTER',
});

const INPUT_KEYS = Object.freeze(['currentIdentity', 'evidenceIdentity', 'evidenceRecords', 'surfaceProjection']);
const CURRENT_IDENTITY_KEYS = Object.freeze(['generation', 'projectRevisionId', 'sharedRowSetDigest', 'snapshotId']);
const EVIDENCE_IDENTITY_KEYS = Object.freeze(['generation', 'projectRevisionId', 'recordCount', 'recordSetDigest', 'snapshotId']);
const EVIDENCE_KEYS = Object.freeze(['endOffset', 'evidenceId', 'kind', 'label', 'quoteDigest', 'sceneId', 'sourceId', 'sourceRevisionDigest', 'startOffset']);
const POSITION_KEYS = Object.freeze(['rowId', 'x', 'y']);
const LINK_KEYS = Object.freeze(['identity', 'kind', 'label', 'targetDigest', 'targetId']);
const LINK_IDENTITY_KEYS = Object.freeze(['generation', 'projectId', 'projectRevisionId', 'sharedRowSetDigest', 'snapshotId']);
const DOSSIER_KEYS = Object.freeze(['deepLinks', 'dossierDigest', 'dossierId', 'entityIds', 'evidence', 'evidenceCount', 'label', 'position', 'rowId', 'sceneIds', 'sheetId', 'sourceDigest', 'sourceId', 'status']);
const AUTHORITY_KEYS = Object.freeze(['commandAuthority', 'externalEffects', 'persistence', 'productMutation', 'rendererWiring', 'stateClass']);
const PROJECTION_KEYS = Object.freeze(['authority', 'denominator', 'dossiers', 'evidenceRecordSetDigest', 'featureManifestDigest', 'generation', 'positions', 'profileId', 'projectId', 'projectRevisionId', 'projectionDigest', 'schemaVersion', 'sharedRowSetDigest', 'snapshotId', 'stageId', 'surfaceProjectionDigest']);
const VIEW_INPUT_KEYS = Object.freeze(['currentIdentity', 'lod', 'projection', 'selectedRowId', 'visibleRowIds']);
const VIEW_KEYS = Object.freeze(['dossiers', 'generation', 'lod', 'nodeCount', 'nodes', 'projectRevisionId', 'projectionDigest', 'schemaVersion', 'selectedRowId', 'sharedRowSetDigest', 'snapshotId', 'viewDigest', 'visibleRowIds']);
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export class AtlasDossierLayoutLinksError extends Error {
  constructor(code, detail = '') { super(detail ? `${code}: ${detail}` : code); this.name = 'AtlasDossierLayoutLinksError'; this.code = code; this.detail = detail; }
}
function fail(code, detail = '') { throw new AtlasDossierLayoutLinksError(code, detail); }
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function digest(value) { return `sha256:${hashCanonicalValue(value)}`; }
function plain(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const p = Object.getPrototypeOf(value); return p === Object.prototype || p === null; }
function exact(value, keys, code) {
  if (!plain(value)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
  const actual = own.slice().sort(compare);
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) fail(code, 'EXACT_KEYSET_REQUIRED');
  for (const key of own) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(code, 'DATA_PROPERTIES_REQUIRED'); }
}
function dense(values, code) {
  if (!Array.isArray(values) || Object.getOwnPropertySymbols(values).length !== 0) fail(code, 'ARRAY_REQUIRED');
  const names = Object.getOwnPropertyNames(values);
  if (names.length !== values.length + 1 || !names.includes('length')) fail(code, 'DENSE_ARRAY_REQUIRED');
  for (let index = 0; index < values.length; index += 1) { const d = Object.getOwnPropertyDescriptor(values, String(index)); if (!d || d.enumerable !== true || !Object.prototype.hasOwnProperty.call(d, 'value')) fail(code, 'DATA_ELEMENTS_REQUIRED'); }
}
function identifier(value, code, maximum = 2048) { if (typeof value !== 'string' || !value || value.length > maximum || value !== value.trim() || value !== value.normalize('NFC') || /[\u0000-\u001f\u007f]/u.test(value)) fail(code); return value; }
function digestValue(value, code) { if (typeof value !== 'string' || !DIGEST.test(value)) fail(code); return value; }
function integer(value, code, minimum = 0) { if (!Number.isSafeInteger(value) || value < minimum) fail(code); return value; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) freeze(child); return Object.freeze(value); }
function uniqueSorted(values, code) { dense(values, code); const result = values.map((value) => identifier(value, code)).sort(compare); if (new Set(result).size !== result.length) fail(code, 'DUPLICATE'); return result; }
function stablePosition(rowId) {
  const hash = hashCanonicalValue({ namespace: 'WP504_STABLE_LAYOUT_V1', rowId });
  const x = 36 + (Number.parseInt(hash.slice(0, 8), 16) % 928);
  const y = 36 + (Number.parseInt(hash.slice(8, 16), 16) % 628);
  return freeze({ rowId, x, y });
}
function linkIdentity(surface) { return freeze({ projectId: surface.projectId, projectRevisionId: surface.projectRevisionId, snapshotId: surface.snapshotId, generation: surface.generation, sharedRowSetDigest: surface.sharedRowSetDigest }); }
function deepLink(kind, targetId, targetDigest, label, surface) { return freeze({ kind, targetId, targetDigest, label, identity: linkIdentity(surface) }); }
function normalizeEvidence(record) {
  exact(record, EVIDENCE_KEYS, 'E_ATLAS_DOSSIER_EVIDENCE_INVALID');
  const kind = identifier(record.kind, 'E_ATLAS_DOSSIER_EVIDENCE_KIND_INVALID');
  if (!Object.values(ATLAS_EVIDENCE_KIND).includes(kind)) fail('E_ATLAS_DOSSIER_EVIDENCE_KIND_INVALID');
  const startOffset = record.startOffset;
  const endOffset = record.endOffset;
  const sceneId = typeof record.sceneId === 'string' ? record.sceneId : '';
  if (kind === ATLAS_EVIDENCE_KIND.SCENE_RANGE) {
    identifier(sceneId, 'E_ATLAS_DOSSIER_EVIDENCE_SCENE_INVALID');
    integer(startOffset, 'E_ATLAS_DOSSIER_EVIDENCE_RANGE_INVALID'); integer(endOffset, 'E_ATLAS_DOSSIER_EVIDENCE_RANGE_INVALID');
    if (endOffset <= startOffset) fail('E_ATLAS_DOSSIER_EVIDENCE_RANGE_INVALID');
  } else if (sceneId !== '' || startOffset !== null || endOffset !== null) fail('E_ATLAS_DOSSIER_EVIDENCE_RECORD_LOCATOR_INVALID');
  return freeze({
    evidenceId: identifier(record.evidenceId, 'E_ATLAS_DOSSIER_EVIDENCE_ID_INVALID'), kind,
    sourceId: identifier(record.sourceId, 'E_ATLAS_DOSSIER_EVIDENCE_SOURCE_INVALID'),
    sourceRevisionDigest: digestValue(record.sourceRevisionDigest, 'E_ATLAS_DOSSIER_EVIDENCE_REVISION_INVALID'),
    sceneId, startOffset, endOffset,
    quoteDigest: digestValue(record.quoteDigest, 'E_ATLAS_DOSSIER_EVIDENCE_QUOTE_DIGEST_INVALID'),
    label: identifier(record.label, 'E_ATLAS_DOSSIER_EVIDENCE_LABEL_INVALID', 4096),
  });
}
function projectionIdentity(value) { const { projectionDigest, ...identity } = value; return identity; }

export function createAtlasEvidenceSetIdentity(evidenceRecords, currentIdentity) {
  dense(evidenceRecords, 'E_ATLAS_DOSSIER_EVIDENCE_ARRAY_INVALID');
  exact(currentIdentity, CURRENT_IDENTITY_KEYS, 'E_ATLAS_DOSSIER_CURRENT_IDENTITY_INVALID');
  const normalized = evidenceRecords.map(normalizeEvidence).sort((a, b) => compare(a.evidenceId, b.evidenceId));
  if (new Set(normalized.map((item) => item.evidenceId)).size !== normalized.length) fail('E_ATLAS_DOSSIER_EVIDENCE_ID_DUPLICATE');
  return freeze({ projectRevisionId: currentIdentity.projectRevisionId, snapshotId: currentIdentity.snapshotId, generation: currentIdentity.generation, recordCount: normalized.length, recordSetDigest: digest(normalized) });
}

export function compileAtlasDossierLayoutLinks(input) {
  exact(input, INPUT_KEYS, 'E_ATLAS_DOSSIER_INPUT_INVALID');
  exact(input.currentIdentity, CURRENT_IDENTITY_KEYS, 'E_ATLAS_DOSSIER_CURRENT_IDENTITY_INVALID');
  const surface = assertAtlasSurfaceCurrent(input.surfaceProjection, input.currentIdentity);
  dense(input.evidenceRecords, 'E_ATLAS_DOSSIER_EVIDENCE_ARRAY_INVALID');
  if (surface.rows.length > ATLAS_DOSSIER_MAX_ROWS || input.evidenceRecords.length > ATLAS_DOSSIER_MAX_EVIDENCE) fail('E_ATLAS_DOSSIER_DENOMINATOR_BOUND');
  const evidence = input.evidenceRecords.map(normalizeEvidence).sort((a, b) => compare(a.evidenceId, b.evidenceId));
  if (new Set(evidence.map((item) => item.evidenceId)).size !== evidence.length) fail('E_ATLAS_DOSSIER_EVIDENCE_ID_DUPLICATE');
  exact(input.evidenceIdentity, EVIDENCE_IDENTITY_KEYS, 'E_ATLAS_DOSSIER_EVIDENCE_IDENTITY_INVALID');
  if (input.evidenceIdentity.projectRevisionId !== surface.projectRevisionId || input.evidenceIdentity.snapshotId !== surface.snapshotId || input.evidenceIdentity.generation !== surface.generation) fail('E_ATLAS_DOSSIER_EVIDENCE_IDENTITY_STALE');
  if (input.evidenceIdentity.recordCount !== evidence.length || input.evidenceIdentity.recordSetDigest !== digest(evidence)) fail('E_ATLAS_DOSSIER_EVIDENCE_IDENTITY_MISMATCH');
  const requiredEvidenceIds = [...new Set(surface.rows.flatMap((row) => row.evidenceIds))].sort(compare);
  if (requiredEvidenceIds.length !== evidence.length || requiredEvidenceIds.some((id, index) => id !== evidence[index].evidenceId)) fail('E_ATLAS_DOSSIER_EVIDENCE_DENOMINATOR_MISMATCH');
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
  const positions = surface.rows.map((row) => stablePosition(row.rowId)).sort((a, b) => compare(a.rowId, b.rowId));
  const positionById = new Map(positions.map((position) => [position.rowId, position]));
  const dossiers = surface.rows.map((row) => {
    const rowEvidence = row.evidenceIds.map((id) => evidenceById.get(id));
    if (rowEvidence.some((item) => !item)) fail('E_ATLAS_DOSSIER_EVIDENCE_MISSING', row.rowId);
    const links = [deepLink(ATLAS_DEEP_LINK_KIND.ROW, row.rowId, row.sourceDigest, row.label, surface)];
    for (const entityId of row.entityIds) links.push(deepLink(ATLAS_DEEP_LINK_KIND.ENTITY, entityId, row.sourceDigest, entityId, surface));
    for (const sceneId of row.sceneIds) links.push(deepLink(ATLAS_DEEP_LINK_KIND.SCENE, sceneId, row.sourceDigest, sceneId, surface));
    for (const item of rowEvidence) links.push(deepLink(ATLAS_DEEP_LINK_KIND.EVIDENCE, item.evidenceId, item.sourceRevisionDigest, item.label, surface));
    const deepLinks = links.sort((a, b) => compare(`${a.kind}:${a.targetId}`, `${b.kind}:${b.targetId}`));
    const normalized = { dossierId: `dossier:${row.rowId}`, rowId: row.rowId, sheetId: row.sheetId, sourceId: row.sourceId, sourceDigest: row.sourceDigest, label: row.label, status: row.status, sceneIds: [...row.sceneIds], entityIds: [...row.entityIds], evidenceCount: rowEvidence.length, evidence: rowEvidence, deepLinks, position: positionById.get(row.rowId) };
    return freeze({ ...normalized, dossierDigest: digest(normalized) });
  }).sort((a, b) => compare(a.rowId, b.rowId));
  const denominator = { rows: surface.rows.length, dossiers: dossiers.length, evidenceRecords: evidence.length, requiredEvidenceIds: requiredEvidenceIds.length, positions: positions.length, deepLinks: dossiers.reduce((sum, dossier) => sum + dossier.deepLinks.length, 0) };
  if (denominator.rows !== denominator.dossiers || denominator.rows !== denominator.positions || denominator.evidenceRecords !== denominator.requiredEvidenceIds) fail('E_ATLAS_DOSSIER_DENOMINATOR_MISMATCH');
  const authority = { stateClass: 'DERIVED_STATE', productMutation: false, persistence: false, rendererWiring: false, externalEffects: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' };
  const normalized = { schemaVersion: ATLAS_DOSSIER_LAYOUT_LINKS_SCHEMA_VERSION, stageId: ATLAS_DOSSIER_LAYOUT_LINKS_NODE_ID, profileId: ATLAS_DOSSIER_LAYOUT_LINKS_PROFILE_ID, projectId: surface.projectId, projectRevisionId: surface.projectRevisionId, snapshotId: surface.snapshotId, generation: surface.generation, sharedRowSetDigest: surface.sharedRowSetDigest, surfaceProjectionDigest: surface.projectionDigest, evidenceRecordSetDigest: digest(evidence), dossiers, positions, denominator, authority, featureManifestDigest: digest(ATLAS_DOSSIER_LAYOUT_LINKS_FEATURE_INTEGRATION_MANIFEST_V1) };
  return freeze({ ...normalized, projectionDigest: digest(normalized) });
}

export function assertAtlasDossierLayoutLinksCurrent(projection, currentIdentity) {
  exact(projection, PROJECTION_KEYS, 'E_ATLAS_DOSSIER_PROJECTION_INVALID');
  exact(currentIdentity, CURRENT_IDENTITY_KEYS, 'E_ATLAS_DOSSIER_CURRENT_IDENTITY_INVALID');
  for (const key of ['projectRevisionId', 'snapshotId', 'generation', 'sharedRowSetDigest']) if (projection[key] !== currentIdentity[key]) fail('E_ATLAS_DOSSIER_STALE', key);
  return projection;
}

export function verifyAtlasDossierLayoutLinksProjection(projection, input) {
  const rebuilt = compileAtlasDossierLayoutLinks(input);
  if (hashCanonicalValue(projection) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_DOSSIER_PROJECTION_MISMATCH');
  return projection;
}

export function projectAtlasDossierLayoutView(input) {
  exact(input, VIEW_INPUT_KEYS, 'E_ATLAS_DOSSIER_VIEW_INPUT_INVALID');
  const projection = assertAtlasDossierLayoutLinksCurrent(input.projection, input.currentIdentity);
  if (!Object.values(ATLAS_DOSSIER_LOD).includes(input.lod)) fail('E_ATLAS_DOSSIER_LOD_INVALID');
  const allIds = projection.dossiers.map((dossier) => dossier.rowId);
  const visibleRowIds = uniqueSorted(input.visibleRowIds, 'E_ATLAS_DOSSIER_VISIBLE_ROWS_INVALID');
  if (visibleRowIds.some((rowId) => !allIds.includes(rowId))) fail('E_ATLAS_DOSSIER_VISIBLE_ROW_UNKNOWN');
  const selectedRowId = input.selectedRowId === '' ? '' : identifier(input.selectedRowId, 'E_ATLAS_DOSSIER_SELECTED_ROW_INVALID');
  if (selectedRowId && !allIds.includes(selectedRowId)) fail('E_ATLAS_DOSSIER_SELECTED_ROW_UNKNOWN');
  const dossiers = projection.dossiers.filter((dossier) => visibleRowIds.includes(dossier.rowId));
  const detail = { OVERVIEW: 'DOT', CONTEXT: 'LABEL', EVIDENCE: 'EVIDENCE_COUNT' }[input.lod];
  const nodes = dossiers.map((dossier) => freeze({ rowId: dossier.rowId, x: dossier.position.x, y: dossier.position.y, detail, selected: dossier.rowId === selectedRowId, evidenceCount: dossier.evidenceCount }));
  const normalized = { schemaVersion: ATLAS_DOSSIER_LAYOUT_VIEW_SCHEMA_VERSION, projectRevisionId: projection.projectRevisionId, snapshotId: projection.snapshotId, generation: projection.generation, sharedRowSetDigest: projection.sharedRowSetDigest, projectionDigest: projection.projectionDigest, lod: input.lod, selectedRowId, visibleRowIds, nodeCount: nodes.length, nodes, dossiers };
  return freeze({ ...normalized, viewDigest: digest(normalized) });
}

export function verifyAtlasDossierLayoutView(view, projection, currentIdentity) {
  exact(view, VIEW_KEYS, 'E_ATLAS_DOSSIER_VIEW_INVALID');
  for (const node of view.nodes) exact(node, ['detail', 'evidenceCount', 'rowId', 'selected', 'x', 'y'], 'E_ATLAS_DOSSIER_VIEW_NODE_INVALID');
  for (const dossier of view.dossiers) {
    exact(dossier, DOSSIER_KEYS, 'E_ATLAS_DOSSIER_INVALID'); exact(dossier.position, POSITION_KEYS, 'E_ATLAS_DOSSIER_POSITION_INVALID');
    for (const link of dossier.deepLinks) { exact(link, LINK_KEYS, 'E_ATLAS_DOSSIER_LINK_INVALID'); exact(link.identity, LINK_IDENTITY_KEYS, 'E_ATLAS_DOSSIER_LINK_IDENTITY_INVALID'); if (!Object.values(ATLAS_DEEP_LINK_KIND).includes(link.kind)) fail('E_ATLAS_DOSSIER_LINK_KIND_INVALID'); }
  }
  const rebuilt = projectAtlasDossierLayoutView({ projection, currentIdentity, lod: view.lod, selectedRowId: view.selectedRowId, visibleRowIds: view.visibleRowIds });
  if (hashCanonicalValue(view) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_DOSSIER_VIEW_MISMATCH');
  return view;
}

export function assertAtlasDossierMentalMapStable(...views) {
  if (views.length < 2) fail('E_ATLAS_DOSSIER_STABILITY_DENOMINATOR');
  const positionByRow = new Map();
  for (const view of views) for (const node of view.nodes) {
    const previous = positionByRow.get(node.rowId);
    const current = `${node.x}:${node.y}`;
    if (previous !== undefined && previous !== current) fail('E_ATLAS_DOSSIER_POSITION_DRIFT', node.rowId);
    positionByRow.set(node.rowId, current);
  }
  return freeze({ status: 'PASS', viewCount: views.length, survivorCount: positionByRow.size, positionDigest: digest([...positionByRow.entries()].sort((a, b) => compare(a[0], b[0]))) });
}

export function assertAtlasDeepLinkCurrent(link, currentIdentity) {
  exact(link, LINK_KEYS, 'E_ATLAS_DOSSIER_LINK_INVALID'); exact(link.identity, LINK_IDENTITY_KEYS, 'E_ATLAS_DOSSIER_LINK_IDENTITY_INVALID');
  if (!Object.values(ATLAS_DEEP_LINK_KIND).includes(link.kind)) fail('E_ATLAS_DOSSIER_LINK_KIND_INVALID');
  for (const key of ['projectRevisionId', 'snapshotId', 'generation', 'sharedRowSetDigest']) if (link.identity[key] !== currentIdentity[key]) fail('E_ATLAS_DOSSIER_LINK_STALE', key);
  return link;
}

export function verifyAtlasDossierProjectionDigest(projection) {
  exact(projection, PROJECTION_KEYS, 'E_ATLAS_DOSSIER_PROJECTION_INVALID');
  if (projection.projectionDigest !== digest(projectionIdentity(projection))) fail('E_ATLAS_DOSSIER_PROJECTION_DIGEST_MISMATCH');
  return projection;
}
