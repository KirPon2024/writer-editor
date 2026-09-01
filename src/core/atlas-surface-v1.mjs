import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { assertAtlasBookSnapshotCurrent, verifyAtlasBookSnapshot } from './atlas-book-snapshot-v1.mjs';
import { verifyAtlasAssociationsProjection } from './atlas-associations-v1.mjs';
import { verifyAtlasTimeKnowledgeProjection } from './atlas-time-knowledge-v1.mjs';
import { verifyAtlasThreadsCausalityProjection } from './atlas-threads-causality-v1.mjs';

export const ATLAS_SURFACE_SCHEMA_VERSION = 'yalken.r24.atlasSurface.v1';
export const ATLAS_SURFACE_VIEW_SCHEMA_VERSION = 'yalken.r24.atlasSurfaceView.v1';
export const ATLAS_SURFACE_NODE_ID = 'WP-503_ATLAS_SURFACE';
export const ATLAS_SURFACE_PROFILE_ID = 'ATLAS_PRODUCT_V33';
export const ATLAS_SURFACE_MAX_ROWS = 50_000;
export const ATLAS_SURFACE_POSTURE = Object.freeze({
  MANUSCRIPT: 'MANUSCRIPT',
  SPLIT: 'SPLIT',
  FULL: 'FULL',
});
export const ATLAS_SURFACE_VIEW = Object.freeze({ GRAPH: 'GRAPH', LIST: 'LIST', TABLE: 'TABLE' });
export const ATLAS_SURFACE_SHEET = Object.freeze({
  ASSOCIATIONS: 'ASSOCIATIONS',
  TIME_KNOWLEDGE: 'TIME_KNOWLEDGE',
  THREADS: 'THREADS',
  CAUSALITY: 'CAUSALITY',
});

export const ATLAS_SURFACE_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.atlas.surface.v1',
  featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:BOUND_TO_CURRENT_APPROVED_ENTRYPOINTS',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY',
  authoritativeData: 'VERIFIED_WP500_ASSOCIATIONS_WP501_TIME_KNOWLEDGE_AND_WP502_THREADS_CAUSALITY_PROJECTIONS',
  derivedData: 'ONE_REVISION_BOUND_SHARED_ROW_SET_FOR_GRAPH_LIST_AND_TABLE',
  commandIds: ['NOT_APPLICABLE_PURE_QUERY_NO_MUTATION'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  queryIds: ['atlas.surface.compile.v1', 'atlas.surface.view.v1'],
  productProjectionIds: [ATLAS_SURFACE_SCHEMA_VERSION],
  capabilityIds: ['cap.atlas.surface.read'],
  authorityMap: 'PRODUCT_CORE_INPUTS_READ_ONLY_DERIVED_PROJECTOR_OUTPUT_ONLY',
  identityKeys: ['projectId', 'projectRevisionId', 'snapshotId', 'generation', 'sharedRowSetDigest', 'rowId'],
  revisionPolicy: 'EXACT_BOOK_AND_WP500_WP501_WP502_PROJECTION_IDENTITIES_STALE_REJECTED',
  writePath: 'PURE_RETURN_VALUE_ONLY',
  readPath: 'VERIFIED_PREDECESSOR_PROJECTIONS_TO_IMMUTABLE_SHARED_ATLAS_SHEETS',
  requiredProductPorts: ['WorkspaceQueryPort'],
  requiredDesignOsPorts: ['DomainProjectionPort', 'ShellProjectionPort'],
  adapterRequirements: ['renderer-adapter:atlas-workspace'],
  surfaceManifests: ['surface.atlas.workspace'],
  slotRequirements: ['workspace.write.atlas'],
  supportedWorkspaces: ['WRITE', 'PLAN', 'REVIEW'],
  platformAvailability: 'PLATFORM_NEUTRAL_PURE_PROJECTION_WITH_DESKTOP_RENDERER_ADAPTER',
  accessibilityRequirements: ['keyboard-tablist', 'visible-focus', 'graph-list-table-textual-parity'],
  fallbacks: ['MANUSCRIPT_DEFAULT', 'SPLIT_TO_MANUSCRIPT_ON_NARROW_VIEWPORT', 'LIST_PARITY_WHEN_GRAPH_UNAVAILABLE'],
  stateClasses: ['DERIVED_STATE', 'SHELL_STATE', 'TRANSIENT_STATE'],
  persistenceClass: 'NOT_PERSISTED_BY_THIS_MODULE',
  migrations: ['NOT_APPLICABLE_NO_STORED_SCHEMA'],
  recovery: 'RECOMPILE_FROM_VERIFIED_PREDECESSOR_PROJECTIONS',
  rollback: 'REVERT_BOUNDED_MODULE_RENDERER_ADAPTER_AND_TEST_COMMIT',
  performanceBudget: { maximumRows: ATLAS_SURFACE_MAX_ROWS, complexity: 'O(total predecessor rows)' },
  securityBoundary: 'STRICT_OWN_DATA_EXACT_KEYSETS_NFC_BOUNDED_DENOMINATORS_NO_ACCESSORS_OR_SYMBOLS',
  lifecycle: 'ON_DEMAND_PURE_COMPILATION_THEN_TRANSIENT_POSTURE_AND_VIEW_SELECTION',
  negativeBypassChecks: [
    'STALE_SNAPSHOT_PREDECESSOR_OR_GENERATION_REJECTED',
    'GRAPH_LIST_TABLE_ROW_SET_DRIFT_REJECTED',
    'DUPLICATE_ROW_SHEET_INDEX_DENOMINATOR_AND_DIGEST_TAMPER_REJECTED',
    'PRODUCT_MUTATION_PERSISTENCE_RENDERER_COMMAND_AND_EXTERNAL_EFFECT_AUTHORITY_REJECTED',
  ],
  evidenceBindings: ['WP500_CERTIFIED_PREDECESSOR', 'WP501_CERTIFIED_PREDECESSOR', 'WP502_EXTERNALLY_VERIFIED_PREDECESSOR', 'WP503_CONTRACT_INTEGRATION_MUTANTS'],
  currentReality: 'ONE_PURE_ATLAS_SURFACE_PROJECTION_AND_READ_ONLY_DESKTOP_PRESENTATION_ADAPTER',
});

const INPUT_KEYS = Object.freeze(['associationsProjection', 'currentSnapshotIdentity', 'generation', 'snapshot', 'threadsCausalityProjection', 'timeKnowledgeProjection']);
const ROW_KEYS = Object.freeze(['entityIds', 'evidenceIds', 'label', 'rowId', 'sceneIds', 'sheetId', 'sourceDigest', 'sourceId', 'status']);
const SHEET_KEYS = Object.freeze(['rowCount', 'rowIds', 'rowSetDigest', 'sheetId', 'title']);
const VIEW_KEYS = Object.freeze(['rowCount', 'rowIds', 'rowSetDigest', 'view']);
const AUTHORITY_KEYS = Object.freeze(['commandAuthority', 'externalEffects', 'persistence', 'productMutation', 'rendererWiring', 'stateClass']);
const PROJECTION_KEYS = Object.freeze([
  'associationsProjectionDigest', 'authority', 'denominator', 'featureManifestDigest', 'generation',
  'profileId', 'projectId', 'projectRevisionId', 'projectionDigest', 'rows', 'schemaVersion',
  'sharedRowSetDigest', 'sheets', 'snapshotId', 'stageId', 'threadsCausalityProjectionDigest',
  'timeKnowledgeProjectionDigest', 'views',
]);
const VIEW_INPUT_KEYS = Object.freeze(['currentIdentity', 'posture', 'projection', 'view']);
const CURRENT_IDENTITY_KEYS = Object.freeze(['generation', 'projectRevisionId', 'sharedRowSetDigest', 'snapshotId']);
const VIEW_RESULT_KEYS = Object.freeze(['generation', 'posture', 'projectRevisionId', 'projectionDigest', 'rowCount', 'rowIds', 'rows', 'schemaVersion', 'sharedRowSetDigest', 'snapshotId', 'view', 'viewDigest']);
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

export class AtlasSurfaceError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AtlasSurfaceError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new AtlasSurfaceError(code, detail); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function digestCanonical(value) { return `sha256:${hashCanonicalValue(value)}`; }
function isPlainDataObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function assertExactDataObject(value, expectedKeys, code) {
  if (!isPlainDataObject(value)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
  const actual = ownKeys.slice().sort(compare);
  if (actual.length !== expectedKeys.length || actual.some((key, index) => key !== expectedKeys[index])) fail(code, 'EXACT_KEYSET_REQUIRED');
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(code, 'DATA_PROPERTIES_REQUIRED');
  }
}
function assertDenseDataArray(value, code) {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length !== 0) fail(code, 'ARRAY_REQUIRED');
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes('length')) fail(code, 'DENSE_ARRAY_REQUIRED');
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(code, 'DATA_ELEMENTS_REQUIRED');
  }
}
function assertIdentifier(value, code, maximum = 1024) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum || value !== value.trim() || value !== value.normalize('NFC') || /[\u0000-\u001f\u007f]/u.test(value)) fail(code);
  return value;
}
function assertDigest(value, code) { if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) fail(code); return value; }
function assertGeneration(value) { if (!Number.isSafeInteger(value) || value < 0) fail('E_ATLAS_SURFACE_GENERATION_INVALID'); return value; }
function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}
function uniqueSorted(values) { return [...new Set(values)].sort(compare); }
function sceneIdsForScope(scope) { return scope?.kind === 'BOOK' ? [] : [scope.sceneId]; }
function normalizeRow(row) {
  assertExactDataObject(row, ROW_KEYS, 'E_ATLAS_SURFACE_ROW_INVALID');
  const result = {
    rowId: assertIdentifier(row.rowId, 'E_ATLAS_SURFACE_ROW_ID_INVALID'),
    sheetId: assertIdentifier(row.sheetId, 'E_ATLAS_SURFACE_SHEET_ID_INVALID'),
    sourceId: assertIdentifier(row.sourceId, 'E_ATLAS_SURFACE_SOURCE_ID_INVALID'),
    sourceDigest: assertDigest(row.sourceDigest, 'E_ATLAS_SURFACE_SOURCE_DIGEST_INVALID'),
    label: assertIdentifier(row.label, 'E_ATLAS_SURFACE_LABEL_INVALID', 4096),
    status: assertIdentifier(row.status, 'E_ATLAS_SURFACE_STATUS_INVALID'),
    sceneIds: uniqueSorted(row.sceneIds.map((value) => assertIdentifier(value, 'E_ATLAS_SURFACE_SCENE_ID_INVALID'))),
    entityIds: uniqueSorted(row.entityIds.map((value) => assertIdentifier(value, 'E_ATLAS_SURFACE_ENTITY_ID_INVALID'))),
    evidenceIds: uniqueSorted(row.evidenceIds.map((value) => assertIdentifier(value, 'E_ATLAS_SURFACE_EVIDENCE_ID_INVALID'))),
  };
  for (const key of ['sceneIds', 'entityIds', 'evidenceIds']) assertDenseDataArray(row[key], 'E_ATLAS_SURFACE_ROW_ARRAY_INVALID');
  return result;
}
function makeRows(associations, timeKnowledge, threadsCausality) {
  const rows = [];
  for (const row of associations.associations) rows.push(normalizeRow({
    rowId: `association:${row.associationId}`, sheetId: ATLAS_SURFACE_SHEET.ASSOCIATIONS,
    sourceId: row.associationId, sourceDigest: row.associationDigest,
    label: `${row.sourceEntityId} ${row.associationKind} ${row.targetEntityId}`,
    status: row.direction, sceneIds: sceneIdsForScope(row.scope),
    entityIds: [row.sourceEntityId, row.targetEntityId], evidenceIds: row.evidenceAnchorIds,
  }));
  for (const row of timeKnowledge.cells) rows.push(normalizeRow({
    rowId: `time:${row.cellId}`, sheetId: ATLAS_SURFACE_SHEET.TIME_KNOWLEDGE,
    sourceId: row.cellId, sourceDigest: row.cellDigest, label: row.propositionId,
    status: `${row.epistemicState}:${row.modality}`, sceneIds: sceneIdsForScope(row.scope),
    entityIds: [row.perspectiveEntityId], evidenceIds: row.evidenceAnchorIds,
  }));
  for (const row of threadsCausality.threads) rows.push(normalizeRow({
    rowId: `thread:${row.threadId}`, sheetId: ATLAS_SURFACE_SHEET.THREADS,
    sourceId: row.threadId, sourceDigest: row.threadDigest, label: `${row.threadKind} ${row.threadId}`,
    status: row.state, sceneIds: [], entityIds: row.participantEntityIds, evidenceIds: row.evidenceCellIds,
  }));
  for (const row of threadsCausality.causalEdges) rows.push(normalizeRow({
    rowId: `causal:${row.edgeId}`, sheetId: ATLAS_SURFACE_SHEET.CAUSALITY,
    sourceId: row.edgeId, sourceDigest: row.edgeDigest,
    label: `${row.sourcePropositionId} ${row.relation} ${row.targetPropositionId}`,
    status: row.epistemicState, sceneIds: [], entityIds: [], evidenceIds: row.evidenceCellIds,
  }));
  rows.sort((left, right) => compare(left.rowId, right.rowId));
  if (rows.length > ATLAS_SURFACE_MAX_ROWS) fail('E_ATLAS_SURFACE_ROW_COUNT_BOUND');
  if (new Set(rows.map((row) => row.rowId)).size !== rows.length) fail('E_ATLAS_SURFACE_ROW_ID_DUPLICATE');
  return rows;
}
function rowSetDigest(rows) { return digestCanonical(rows.map((row) => ({ rowId: row.rowId, sourceDigest: row.sourceDigest }))); }
function makeSheets(rows) {
  const titles = { ASSOCIATIONS: 'Associations', TIME_KNOWLEDGE: 'Time & knowledge', THREADS: 'Threads', CAUSALITY: 'Causality' };
  return Object.values(ATLAS_SURFACE_SHEET).map((sheetId) => {
    const rowIds = rows.filter((row) => row.sheetId === sheetId).map((row) => row.rowId);
    return freezeDeep({ sheetId, title: titles[sheetId], rowCount: rowIds.length, rowIds, rowSetDigest: digestCanonical(rowIds) });
  });
}
function makeViews(rows, sharedRowSetDigest) {
  const rowIds = rows.map((row) => row.rowId);
  return Object.values(ATLAS_SURFACE_VIEW).map((view) => freezeDeep({ view, rowCount: rowIds.length, rowIds: [...rowIds], rowSetDigest: sharedRowSetDigest }));
}
function projectionIdentity(value) {
  const { projectionDigest, ...identity } = value;
  return identity;
}

export function compileAtlasSurface(input) {
  assertExactDataObject(input, INPUT_KEYS, 'E_ATLAS_SURFACE_INPUT_INVALID');
  const snapshot = assertAtlasBookSnapshotCurrent(input.snapshot, input.currentSnapshotIdentity);
  const associations = verifyAtlasAssociationsProjection(input.associationsProjection, snapshot);
  const timeKnowledge = verifyAtlasTimeKnowledgeProjection(input.timeKnowledgeProjection, snapshot);
  const threadsCausality = verifyAtlasThreadsCausalityProjection(input.threadsCausalityProjection, snapshot, timeKnowledge);
  const generation = assertGeneration(input.generation);
  const rows = makeRows(associations, timeKnowledge, threadsCausality);
  const sharedRowSetDigest = rowSetDigest(rows);
  const sheets = makeSheets(rows);
  const views = makeViews(rows, sharedRowSetDigest);
  const denominator = {
    associations: associations.associationCount,
    timeKnowledgeCells: timeKnowledge.cellCount,
    threads: threadsCausality.threadCount,
    causalEdges: threadsCausality.edgeCount,
    totalRows: rows.length,
    sheets: sheets.length,
    views: views.length,
  };
  const authority = { stateClass: 'DERIVED_STATE', productMutation: false, persistence: false, rendererWiring: false, externalEffects: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' };
  const normalized = {
    schemaVersion: ATLAS_SURFACE_SCHEMA_VERSION,
    stageId: ATLAS_SURFACE_NODE_ID,
    profileId: ATLAS_SURFACE_PROFILE_ID,
    snapshotId: snapshot.snapshotId,
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    generation,
    associationsProjectionDigest: associations.projectionDigest,
    timeKnowledgeProjectionDigest: timeKnowledge.projectionDigest,
    threadsCausalityProjectionDigest: threadsCausality.projectionDigest,
    sharedRowSetDigest,
    rows,
    sheets,
    views,
    denominator,
    authority,
    featureManifestDigest: digestCanonical(ATLAS_SURFACE_FEATURE_INTEGRATION_MANIFEST_V1),
  };
  return freezeDeep({ ...normalized, projectionDigest: digestCanonical(normalized) });
}

export function verifyAtlasSurfaceProjection(projection, snapshotInput, associationsProjection, timeKnowledgeProjection, threadsCausalityProjection) {
  assertExactDataObject(projection, PROJECTION_KEYS, 'E_ATLAS_SURFACE_PROJECTION_INVALID');
  const snapshot = verifyAtlasBookSnapshot(snapshotInput);
  const currentSnapshotIdentity = {
    projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId, manifestRevision: snapshot.manifestRevision,
    orderDigest: snapshot.orderDigest, dependencyDigest: snapshot.dependencyDigest,
  };
  const rebuilt = compileAtlasSurface({ snapshot, currentSnapshotIdentity, associationsProjection, timeKnowledgeProjection, threadsCausalityProjection, generation: projection.generation });
  if (hashCanonicalValue(projection) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_SURFACE_PROJECTION_MISMATCH');
  return projection;
}

export function assertAtlasSurfaceCurrent(projection, currentIdentity) {
  assertExactDataObject(currentIdentity, CURRENT_IDENTITY_KEYS, 'E_ATLAS_SURFACE_CURRENT_IDENTITY_INVALID');
  assertGeneration(currentIdentity.generation);
  assertDigest(currentIdentity.sharedRowSetDigest, 'E_ATLAS_SURFACE_CURRENT_ROW_SET_DIGEST_INVALID');
  for (const key of ['snapshotId', 'projectRevisionId', 'generation', 'sharedRowSetDigest']) {
    if (projection[key] !== currentIdentity[key]) fail('E_ATLAS_SURFACE_STALE', key);
  }
  return projection;
}

export function projectAtlasSurfaceView(input) {
  assertExactDataObject(input, VIEW_INPUT_KEYS, 'E_ATLAS_SURFACE_VIEW_INPUT_INVALID');
  const projection = assertAtlasSurfaceCurrent(input.projection, input.currentIdentity);
  if (!Object.values(ATLAS_SURFACE_POSTURE).includes(input.posture)) fail('E_ATLAS_SURFACE_POSTURE_INVALID');
  if (!Object.values(ATLAS_SURFACE_VIEW).includes(input.view)) fail('E_ATLAS_SURFACE_VIEW_INVALID');
  const view = projection.views.find((candidate) => candidate.view === input.view);
  if (!view || view.rowSetDigest !== projection.sharedRowSetDigest) fail('E_ATLAS_SURFACE_VIEW_PARITY');
  const rowsById = new Map(projection.rows.map((row) => [row.rowId, row]));
  const rows = view.rowIds.map((rowId) => rowsById.get(rowId));
  if (rows.some((row) => !row)) fail('E_ATLAS_SURFACE_VIEW_ROW_MISSING');
  const normalized = {
    schemaVersion: ATLAS_SURFACE_VIEW_SCHEMA_VERSION,
    snapshotId: projection.snapshotId,
    projectRevisionId: projection.projectRevisionId,
    generation: projection.generation,
    projectionDigest: projection.projectionDigest,
    sharedRowSetDigest: projection.sharedRowSetDigest,
    posture: input.posture,
    view: input.view,
    rowCount: rows.length,
    rowIds: [...view.rowIds],
    rows,
  };
  return freezeDeep({ ...normalized, viewDigest: digestCanonical(normalized) });
}

export function verifyAtlasSurfaceView(result, projection, currentIdentity) {
  assertExactDataObject(result, VIEW_RESULT_KEYS, 'E_ATLAS_SURFACE_VIEW_RESULT_INVALID');
  const rebuilt = projectAtlasSurfaceView({ projection, currentIdentity, posture: result.posture, view: result.view });
  if (hashCanonicalValue(result) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_SURFACE_VIEW_RESULT_MISMATCH');
  return result;
}

