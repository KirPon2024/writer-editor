import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { assertAtlasBookSnapshotCurrent, verifyAtlasBookSnapshot } from './atlas-book-snapshot-v1.mjs';

export const ATLAS_TIME_KNOWLEDGE_SCHEMA_VERSION = 'yalken.r24.atlasTimeKnowledge.v1';
export const ATLAS_TIME_KNOWLEDGE_CELL_SCHEMA_VERSION = 'yalken.r24.atlasTimeKnowledgeCell.v1';
export const ATLAS_TIME_KNOWLEDGE_EVIDENCE_SCHEMA_VERSION = 'yalken.r24.atlasTimeKnowledgeEvidence.v1';
export const ATLAS_TIME_KNOWLEDGE_QUERY_SCHEMA_VERSION = 'yalken.r24.atlasTimeKnowledgeQuery.v1';
export const ATLAS_TIME_KNOWLEDGE_NODE_ID = 'WP-501_TIME_KNOWLEDGE';
export const ATLAS_TIME_KNOWLEDGE_PROFILE_ID = 'ATLAS_PRODUCT_V33';
export const ATLAS_TIME_KNOWLEDGE_MAX_CELLS = 10_000;
export const ATLAS_TIME_KNOWLEDGE_MAX_EVIDENCE_ANCHORS = 100_000;
export const ATLAS_TIME_KNOWLEDGE_MAX_EVIDENCE_PER_CELL = 128;
export const ATLAS_TIME_KNOWLEDGE_MAX_ORDINAL = 10_000_000;
export const ATLAS_TIME_KNOWLEDGE_MAX_OFFSET = 10_000_000;

export const ATLAS_TIME_AXIS = Object.freeze({
  STORY: 'storyTime',
  NARRATIVE: 'narrativeTime',
  KNOWLEDGE: 'knowledgeTime',
});
export const ATLAS_TIME_CERTAINTY = Object.freeze({
  EXACT: 'EXACT',
  APPROXIMATE: 'APPROXIMATE',
  OPEN: 'OPEN',
  UNKNOWN: 'UNKNOWN',
});
export const ATLAS_KNOWLEDGE_STATE = Object.freeze({
  KNOWN: 'KNOWN',
  BELIEVED: 'BELIEVED',
  DISBELIEVED: 'DISBELIEVED',
  UNKNOWN: 'UNKNOWN',
});
export const ATLAS_KNOWLEDGE_MODALITY = Object.freeze({
  ASSERTED: 'ASSERTED',
  INFERRED: 'INFERRED',
  POSSIBLE: 'POSSIBLE',
  COUNTERFACTUAL: 'COUNTERFACTUAL',
});
export const ATLAS_TIME_KNOWLEDGE_SCOPE_KIND = Object.freeze({
  BOOK: 'BOOK',
  SCENE: 'SCENE',
  FRAGMENT: 'FRAGMENT',
});

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const INPUT_KEYS = Object.freeze(['cells', 'currentSnapshotIdentity', 'evidenceAnchors', 'snapshot']);
const INCREMENTAL_INPUT_KEYS = Object.freeze(['cellBatches', 'currentSnapshotIdentity', 'evidenceAnchors', 'snapshot']);
const CELL_KEYS = Object.freeze([
  'cellId', 'epistemicState', 'evidenceAnchorIds', 'modality', 'perspectiveEntityId',
  'propositionId', 'scope', 'tripleTime',
]);
const CELL_PROJECTION_KEYS = Object.freeze([
  'cellDigest', 'cellId', 'epistemicState', 'evidenceAnchorIds', 'modality',
  'perspectiveEntityId', 'propositionId', 'schemaVersion', 'scope', 'tripleTime',
]);
const EVIDENCE_KEYS = Object.freeze([
  'anchorId', 'anchorLineageId', 'endOffset', 'sceneId', 'sceneRevision', 'startOffset',
]);
const EVIDENCE_PROJECTION_KEYS = Object.freeze([
  'anchorDigest', 'anchorId', 'anchorLineageId', 'endOffset', 'sceneId', 'sceneRevision',
  'schemaVersion', 'startOffset',
]);
const TRIPLE_TIME_KEYS = Object.freeze(['knowledgeTime', 'narrativeTime', 'storyTime']);
const TIME_COORDINATE_KEYS = Object.freeze(['certainty', 'ordinal']);
const BOOK_SCOPE_KEYS = Object.freeze(['kind', 'projectId', 'projectRevisionId']);
const SCENE_SCOPE_KEYS = Object.freeze(['kind', 'projectId', 'projectRevisionId', 'sceneId', 'sceneRevision']);
const FRAGMENT_SCOPE_KEYS = Object.freeze([
  'anchorLineageId', 'endOffset', 'kind', 'projectId', 'projectRevisionId',
  'sceneId', 'sceneRevision', 'startOffset',
]);
const PROJECTION_KEYS = Object.freeze([
  'authority', 'cellCount', 'cells', 'cellsByPerspectiveEntityId', 'cellsByPropositionId',
  'evidenceAnchorCount', 'evidenceAnchors', 'evidenceDenominator', 'featureManifestDigest',
  'profileId', 'projectId', 'projectRevisionId', 'projectionDigest', 'schemaVersion',
  'snapshotId', 'stageId', 'timeAxisDenominator',
]);
const AUTHORITY_KEYS = Object.freeze([
  'commandAuthority', 'externalEffects', 'persistence', 'productMutation',
  'rendererWiring', 'stateClass',
]);
const EVIDENCE_DENOMINATOR_KEYS = Object.freeze(['anchors', 'cellsWithoutEvidence', 'references']);
const TIME_DENOMINATOR_KEYS = Object.freeze([
  'knowledgeApproximate', 'knowledgeExact', 'knowledgeOpen', 'knowledgeUnknown',
  'narrativeApproximate', 'narrativeExact', 'narrativeOpen', 'narrativeUnknown',
  'storyApproximate', 'storyExact', 'storyOpen', 'storyUnknown', 'totalCells',
]);
const QUERY_INPUT_KEYS = Object.freeze([
  'currentSnapshotIdentity', 'perspectiveEntityId', 'projection', 'propositionId', 'snapshot',
]);
const QUERY_RESULT_KEYS = Object.freeze([
  'applicableCellCount', 'applicableCells', 'perspectiveEntityId', 'projectionDigest',
  'propositionId', 'queryDigest', 'schemaVersion', 'snapshotId',
]);

export const ATLAS_TIME_KNOWLEDGE_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.atlas.timeKnowledge.v1',
  featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:BOUND_TO_CURRENT_APPROVED_ENTRYPOINTS',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY',
  authoritativeData: 'VERIFIED_ATLAS_BOOK_SNAPSHOT_AND_CALLER_SUPPLIED_AUTHOR_TIME_KNOWLEDGE_RECORDS',
  derivedData: 'REVISION_BOUND_PROPOSITION_PERSPECTIVE_MODALITY_AND_TRIPLE_TIME_PROJECTION',
  commandIds: ['NOT_APPLICABLE_PURE_QUERY_NO_MUTATION'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  queryIds: ['atlas.timeKnowledge.compile.v1', 'atlas.timeKnowledge.query.v1'],
  productProjectionIds: [ATLAS_TIME_KNOWLEDGE_SCHEMA_VERSION],
  capabilityIds: ['NOT_APPLICABLE_PLATFORM_NEUTRAL_PURE_MODULE'],
  authorityMap: 'PRODUCT_CORE_INPUTS_READ_ONLY_DERIVED_PROJECTOR_OUTPUT_ONLY',
  identityKeys: [
    'projectId', 'projectRevisionId', 'snapshotId', 'sceneId', 'sceneRevision',
    'anchorLineageId', 'propositionId', 'perspectiveEntityId',
  ],
  revisionPolicy: 'EXACT_BOOK_SCENE_EVIDENCE_AND_PROJECTION_IDENTITY_STALE_REJECTED',
  writePath: 'PURE_RETURN_VALUE_ONLY',
  readPath: 'VERIFIED_BOOK_SNAPSHOT_AND_AUTHOR_RECORDS_TO_IMMUTABLE_TIME_KNOWLEDGE_PROJECTION',
  requiredProductPorts: ['NOT_APPLICABLE_NO_EXTERNAL_EFFECT'],
  requiredDesignOsPorts: ['NOT_APPLICABLE_NO_INTERFACE_PLANE_CHANGE'],
  adapterRequirements: ['NOT_APPLICABLE_NO_ADAPTER'],
  surfaceManifests: ['NOT_APPLICABLE_NO_UI_SURFACE'],
  slotRequirements: ['NOT_APPLICABLE_NO_UI_SLOT'],
  supportedWorkspaces: ['NOT_APPLICABLE_NO_UI_WORKSPACE'],
  platformAvailability: 'PLATFORM_NEUTRAL_PURE_MODULE',
  accessibilityRequirements: 'NOT_APPLICABLE_NO_VISUAL_OR_INTERACTIVE_SURFACE',
  fallbacks: [
    'EMPTY_PROJECTION_FOR_EMPTY_INPUT',
    'EXPLICIT_UNKNOWN_TIME_OR_KNOWLEDGE_STATE',
    'FAIL_CLOSED_ON_STALE_INVALID_OR_UNEVIDENCED_INPUT',
  ],
  stateClasses: ['DERIVED_STATE'],
  persistenceClass: 'NOT_PERSISTED_BY_THIS_MODULE',
  migrations: ['NOT_APPLICABLE_NO_STORED_SCHEMA'],
  recovery: 'RECOMPILE_FROM_VERIFIED_SNAPSHOT_AND_AUTHOR_TIME_KNOWLEDGE_RECORDS',
  rollback: 'REVERT_BOUNDED_MODULE_AND_TEST_COMMIT',
  performanceBudget: {
    maximumCells: ATLAS_TIME_KNOWLEDGE_MAX_CELLS,
    maximumEvidenceAnchors: ATLAS_TIME_KNOWLEDGE_MAX_EVIDENCE_ANCHORS,
    maximumEvidencePerCell: ATLAS_TIME_KNOWLEDGE_MAX_EVIDENCE_PER_CELL,
  },
  securityBoundary: 'STRICT_OWN_DATA_EXACT_KEYSETS_NFC_BOUNDED_DENOMINATORS_NO_ACCESSORS_OR_SYMBOLS',
  lifecycle: 'ON_DEMAND_PURE_COMPILATION_AND_QUERY_ONLY',
  negativeBypassChecks: [
    'STALE_BOOK_SCENE_PROJECTION_AND_EVIDENCE_IDENTITIES_REJECTED',
    'UNEVIDENCED_CELL_AND_SCOPE_LEAKAGE_REJECTED',
    'UNKNOWN_NEVER_COLLAPSES_TO_FALSE',
    'TAMPERED_PROJECTION_DENOMINATOR_INDEX_AND_DIGEST_REJECTED',
  ],
  evidenceBindings: ['WP500_CERTIFIED_PREDECESSOR', 'EXACT_BOOK_SNAPSHOT', 'WP501_CONTRACT_INTEGRATION_MUTANTS'],
  currentReality: 'PURE_TIME_KNOWLEDGE_PROJECTION_ONLY_NO_RUNTIME_STORAGE_OR_RENDERER_WIRING',
});

export class AtlasTimeKnowledgeError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AtlasTimeKnowledgeError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') {
  throw new AtlasTimeKnowledgeError(code, detail);
}

function isPlainDataObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactDataObject(value, expectedKeys, code) {
  if (!isPlainDataObject(value)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
  const actual = ownKeys.slice().sort();
  if (actual.length !== expectedKeys.length || actual.some((key, index) => key !== expectedKeys[index])) {
    fail(code, 'EXACT_KEYSET_REQUIRED');
  }
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail(code, 'DATA_PROPERTIES_REQUIRED');
    }
  }
}

function assertDenseDataArray(value, code) {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length !== 0) fail(code, 'ARRAY_REQUIRED');
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes('length')) fail(code, 'DENSE_ARRAY_REQUIRED');
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail(code, 'DATA_ELEMENTS_REQUIRED');
    }
  }
}

function assertIdentifier(value, code, maxLength = 512) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maxLength
    || value !== value.trim()
    || value !== value.normalize('NFC')
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) fail(code);
  return value;
}

function assertOptionalIdentifier(value, code, maxLength = 512) {
  if (value === '') return '';
  return assertIdentifier(value, code, maxLength);
}

function assertDigest(value, code) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) fail(code);
  return value;
}

function assertOrdinal(value, code) {
  if (!Number.isSafeInteger(value) || value < 0 || value > ATLAS_TIME_KNOWLEDGE_MAX_ORDINAL) fail(code);
  return value;
}

function assertOffset(value, code) {
  if (!Number.isSafeInteger(value) || value < 0 || value > ATLAS_TIME_KNOWLEDGE_MAX_OFFSET) fail(code);
  return value;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function digestCanonical(value) {
  return `sha256:${hashCanonicalValue(value)}`;
}

function normalizeTimeCoordinate(value, axis) {
  assertExactDataObject(value, TIME_COORDINATE_KEYS, 'E_ATLAS_TIME_COORDINATE_INVALID');
  if (!Object.values(ATLAS_TIME_CERTAINTY).includes(value.certainty)) {
    fail('E_ATLAS_TIME_CERTAINTY_INVALID', axis);
  }
  if (value.certainty === ATLAS_TIME_CERTAINTY.UNKNOWN) {
    if (value.ordinal !== null) fail('E_ATLAS_TIME_UNKNOWN_ORDINAL', axis);
    return { certainty: value.certainty, ordinal: null };
  }
  return { certainty: value.certainty, ordinal: assertOrdinal(value.ordinal, 'E_ATLAS_TIME_ORDINAL_INVALID') };
}

function normalizeTripleTime(value, narrativeOrdinal) {
  assertExactDataObject(value, TRIPLE_TIME_KEYS, 'E_ATLAS_TRIPLE_TIME_INVALID');
  const storyTime = normalizeTimeCoordinate(value.storyTime, ATLAS_TIME_AXIS.STORY);
  const narrativeTime = normalizeTimeCoordinate(value.narrativeTime, ATLAS_TIME_AXIS.NARRATIVE);
  const knowledgeTime = normalizeTimeCoordinate(value.knowledgeTime, ATLAS_TIME_AXIS.KNOWLEDGE);
  if (narrativeTime.certainty !== ATLAS_TIME_CERTAINTY.EXACT || narrativeTime.ordinal !== narrativeOrdinal) {
    fail('E_ATLAS_NARRATIVE_TIME_SCENE_ORDER_MISMATCH');
  }
  return { storyTime, narrativeTime, knowledgeTime };
}

function assertSnapshotScene(snapshot, sceneId, sceneRevision) {
  if (!Object.prototype.hasOwnProperty.call(snapshot.sceneRevisionsById, sceneId)) {
    fail('E_ATLAS_TIME_KNOWLEDGE_SCENE_NOT_FOUND', sceneId);
  }
  if (snapshot.sceneRevisionsById[sceneId] !== sceneRevision) {
    fail('E_ATLAS_TIME_KNOWLEDGE_SCENE_REVISION_STALE', sceneId);
  }
}

function normalizeEvidenceAnchor(input, snapshot) {
  assertExactDataObject(input, EVIDENCE_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_INVALID');
  const anchorId = assertIdentifier(input.anchorId, 'E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_ID_INVALID', 300);
  const anchorLineageId = assertIdentifier(input.anchorLineageId, 'E_ATLAS_TIME_KNOWLEDGE_LINEAGE_ID_INVALID', 300);
  const sceneId = assertIdentifier(input.sceneId, 'E_ATLAS_TIME_KNOWLEDGE_SCENE_ID_INVALID', 200);
  const sceneRevision = assertDigest(input.sceneRevision, 'E_ATLAS_TIME_KNOWLEDGE_SCENE_REVISION_INVALID');
  assertSnapshotScene(snapshot, sceneId, sceneRevision);
  const startOffset = assertOffset(input.startOffset, 'E_ATLAS_TIME_KNOWLEDGE_START_OFFSET_INVALID');
  const endOffset = assertOffset(input.endOffset, 'E_ATLAS_TIME_KNOWLEDGE_END_OFFSET_INVALID');
  if (endOffset <= startOffset) fail('E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_RANGE_INVALID');
  const identity = {
    schemaVersion: ATLAS_TIME_KNOWLEDGE_EVIDENCE_SCHEMA_VERSION,
    anchorId, anchorLineageId, sceneId, sceneRevision, startOffset, endOffset,
  };
  return { ...identity, anchorDigest: digestCanonical(identity) };
}

function normalizeScope(scope, snapshot) {
  if (!isPlainDataObject(scope)) fail('E_ATLAS_TIME_KNOWLEDGE_SCOPE_INVALID', 'PLAIN_OBJECT_REQUIRED');
  const expected = scope.kind === ATLAS_TIME_KNOWLEDGE_SCOPE_KIND.BOOK
    ? BOOK_SCOPE_KEYS
    : scope.kind === ATLAS_TIME_KNOWLEDGE_SCOPE_KIND.SCENE
      ? SCENE_SCOPE_KEYS
      : scope.kind === ATLAS_TIME_KNOWLEDGE_SCOPE_KIND.FRAGMENT
        ? FRAGMENT_SCOPE_KEYS
        : null;
  if (!expected) fail('E_ATLAS_TIME_KNOWLEDGE_SCOPE_KIND_INVALID');
  assertExactDataObject(scope, expected, 'E_ATLAS_TIME_KNOWLEDGE_SCOPE_INVALID');
  const projectId = assertIdentifier(scope.projectId, 'E_ATLAS_TIME_KNOWLEDGE_PROJECT_ID_INVALID', 200);
  const projectRevisionId = assertDigest(scope.projectRevisionId, 'E_ATLAS_TIME_KNOWLEDGE_PROJECT_REVISION_INVALID');
  if (projectId !== snapshot.projectId) fail('E_ATLAS_TIME_KNOWLEDGE_PROJECT_MISMATCH');
  if (projectRevisionId !== snapshot.projectRevisionId) fail('E_ATLAS_TIME_KNOWLEDGE_PROJECT_REVISION_STALE');
  if (scope.kind === ATLAS_TIME_KNOWLEDGE_SCOPE_KIND.BOOK) return { kind: scope.kind, projectId, projectRevisionId };
  const sceneId = assertIdentifier(scope.sceneId, 'E_ATLAS_TIME_KNOWLEDGE_SCENE_ID_INVALID', 200);
  const sceneRevision = assertDigest(scope.sceneRevision, 'E_ATLAS_TIME_KNOWLEDGE_SCENE_REVISION_INVALID');
  assertSnapshotScene(snapshot, sceneId, sceneRevision);
  if (scope.kind === ATLAS_TIME_KNOWLEDGE_SCOPE_KIND.SCENE) {
    return { kind: scope.kind, projectId, projectRevisionId, sceneId, sceneRevision };
  }
  const anchorLineageId = assertIdentifier(scope.anchorLineageId, 'E_ATLAS_TIME_KNOWLEDGE_LINEAGE_ID_INVALID', 300);
  const startOffset = assertOffset(scope.startOffset, 'E_ATLAS_TIME_KNOWLEDGE_START_OFFSET_INVALID');
  const endOffset = assertOffset(scope.endOffset, 'E_ATLAS_TIME_KNOWLEDGE_END_OFFSET_INVALID');
  if (endOffset <= startOffset) fail('E_ATLAS_TIME_KNOWLEDGE_SCOPE_RANGE_INVALID');
  return { kind: scope.kind, projectId, projectRevisionId, sceneId, sceneRevision, anchorLineageId, startOffset, endOffset };
}

function evidenceFitsScope(anchor, scope) {
  if (scope.kind === ATLAS_TIME_KNOWLEDGE_SCOPE_KIND.BOOK) return true;
  if (anchor.sceneId !== scope.sceneId || anchor.sceneRevision !== scope.sceneRevision) return false;
  if (scope.kind === ATLAS_TIME_KNOWLEDGE_SCOPE_KIND.SCENE) return true;
  return anchor.anchorLineageId === scope.anchorLineageId
    && anchor.startOffset >= scope.startOffset
    && anchor.endOffset <= scope.endOffset;
}

function normalizeCell(input, snapshot, evidenceById) {
  assertExactDataObject(input, CELL_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_CELL_INVALID');
  const cellId = assertIdentifier(input.cellId, 'E_ATLAS_TIME_KNOWLEDGE_CELL_ID_INVALID', 300);
  const propositionId = assertIdentifier(input.propositionId, 'E_ATLAS_TIME_KNOWLEDGE_PROPOSITION_ID_INVALID', 300);
  const perspectiveEntityId = assertIdentifier(input.perspectiveEntityId, 'E_ATLAS_TIME_KNOWLEDGE_PERSPECTIVE_ID_INVALID', 300);
  if (!Object.values(ATLAS_KNOWLEDGE_STATE).includes(input.epistemicState)) {
    fail('E_ATLAS_TIME_KNOWLEDGE_STATE_INVALID');
  }
  if (!Object.values(ATLAS_KNOWLEDGE_MODALITY).includes(input.modality)) {
    fail('E_ATLAS_TIME_KNOWLEDGE_MODALITY_INVALID');
  }
  assertDenseDataArray(input.evidenceAnchorIds, 'E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_IDS_INVALID');
  if (input.evidenceAnchorIds.length === 0 || input.evidenceAnchorIds.length > ATLAS_TIME_KNOWLEDGE_MAX_EVIDENCE_PER_CELL) {
    fail('E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_DENOMINATOR');
  }
  const evidenceAnchorIds = input.evidenceAnchorIds.map((id) => (
    assertIdentifier(id, 'E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_ID_INVALID', 300)
  )).sort();
  if (new Set(evidenceAnchorIds).size !== evidenceAnchorIds.length) fail('E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_DUPLICATE');
  const evidence = evidenceAnchorIds.map((id) => {
    const anchor = evidenceById.get(id);
    if (!anchor) fail('E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_NOT_FOUND', id);
    return anchor;
  });
  const evidenceSceneId = evidence[0].sceneId;
  if (evidence.some((anchor) => anchor.sceneId !== evidenceSceneId)) {
    fail('E_ATLAS_TIME_KNOWLEDGE_MULTI_SCENE_CELL');
  }
  const scope = normalizeScope(input.scope, snapshot);
  if (evidence.some((anchor) => !evidenceFitsScope(anchor, scope))) fail('E_ATLAS_TIME_KNOWLEDGE_SCOPE_LEAK');
  const narrativeOrdinal = snapshot.sceneOrder.indexOf(evidenceSceneId);
  if (narrativeOrdinal < 0) fail('E_ATLAS_TIME_KNOWLEDGE_SCENE_NOT_FOUND', evidenceSceneId);
  const tripleTime = normalizeTripleTime(input.tripleTime, narrativeOrdinal);
  const identity = {
    schemaVersion: ATLAS_TIME_KNOWLEDGE_CELL_SCHEMA_VERSION,
    cellId, propositionId, perspectiveEntityId,
    epistemicState: input.epistemicState,
    modality: input.modality,
    tripleTime, scope, evidenceAnchorIds,
  };
  return { ...identity, cellDigest: digestCanonical(identity) };
}

function sortById(values, field) {
  return values.sort((left, right) => left[field].localeCompare(right[field], 'en', { sensitivity: 'variant' }));
}

function indexCells(cells, key) {
  const values = [...new Set(cells.map((cell) => cell[key]))].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
  return Object.fromEntries(values.map((value) => [value, cells.filter((cell) => cell[key] === value).map((cell) => cell.cellId)]));
}

function emptyTimeDenominator(totalCells) {
  return {
    storyExact: 0, storyApproximate: 0, storyOpen: 0, storyUnknown: 0,
    narrativeExact: 0, narrativeApproximate: 0, narrativeOpen: 0, narrativeUnknown: 0,
    knowledgeExact: 0, knowledgeApproximate: 0, knowledgeOpen: 0, knowledgeUnknown: 0,
    totalCells,
  };
}

function countTimeAxes(cells) {
  const result = emptyTimeDenominator(cells.length);
  const suffix = {
    [ATLAS_TIME_CERTAINTY.EXACT]: 'Exact',
    [ATLAS_TIME_CERTAINTY.APPROXIMATE]: 'Approximate',
    [ATLAS_TIME_CERTAINTY.OPEN]: 'Open',
    [ATLAS_TIME_CERTAINTY.UNKNOWN]: 'Unknown',
  };
  for (const cell of cells) {
    for (const axis of Object.values(ATLAS_TIME_AXIS)) {
      const key = `${axis.replace('Time', '')}${suffix[cell.tripleTime[axis].certainty]}`;
      result[key] += 1;
    }
  }
  return result;
}

function projectionIdentity(value) {
  const {
    schemaVersion, stageId, profileId, snapshotId, projectId, projectRevisionId,
    cellCount, evidenceAnchorCount, cells, evidenceAnchors, cellsByPerspectiveEntityId,
    cellsByPropositionId, timeAxisDenominator, evidenceDenominator, authority,
    featureManifestDigest,
  } = value;
  return {
    schemaVersion, stageId, profileId, snapshotId, projectId, projectRevisionId,
    cellCount, evidenceAnchorCount, cells, evidenceAnchors, cellsByPerspectiveEntityId,
    cellsByPropositionId, timeAxisDenominator, evidenceDenominator, authority,
    featureManifestDigest,
  };
}

function compileCurrent(input) {
  const snapshot = assertAtlasBookSnapshotCurrent(input.snapshot, input.currentSnapshotIdentity);
  assertDenseDataArray(input.evidenceAnchors, 'E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_ARRAY_INVALID');
  if (input.evidenceAnchors.length > ATLAS_TIME_KNOWLEDGE_MAX_EVIDENCE_ANCHORS) {
    fail('E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_COUNT_BOUND');
  }
  const evidenceAnchors = sortById(input.evidenceAnchors.map((row) => normalizeEvidenceAnchor(row, snapshot)), 'anchorId');
  if (new Set(evidenceAnchors.map((row) => row.anchorId)).size !== evidenceAnchors.length) {
    fail('E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_ID_DUPLICATE');
  }
  const evidenceById = new Map(evidenceAnchors.map((row) => [row.anchorId, row]));
  assertDenseDataArray(input.cells, 'E_ATLAS_TIME_KNOWLEDGE_CELL_ARRAY_INVALID');
  if (input.cells.length > ATLAS_TIME_KNOWLEDGE_MAX_CELLS) fail('E_ATLAS_TIME_KNOWLEDGE_CELL_COUNT_BOUND');
  const cells = sortById(input.cells.map((row) => normalizeCell(row, snapshot, evidenceById)), 'cellId');
  if (new Set(cells.map((row) => row.cellId)).size !== cells.length) fail('E_ATLAS_TIME_KNOWLEDGE_CELL_ID_DUPLICATE');
  const semanticKeys = cells.map((row) => digestCanonical({
    propositionId: row.propositionId,
    perspectiveEntityId: row.perspectiveEntityId,
    epistemicState: row.epistemicState,
    modality: row.modality,
    tripleTime: row.tripleTime,
    scope: row.scope,
  }));
  if (new Set(semanticKeys).size !== semanticKeys.length) fail('E_ATLAS_TIME_KNOWLEDGE_SEMANTIC_DUPLICATE');
  const usedEvidence = new Set(cells.flatMap((row) => row.evidenceAnchorIds));
  if (usedEvidence.size !== evidenceAnchors.length) fail('E_ATLAS_TIME_KNOWLEDGE_UNUSED_EVIDENCE');
  const evidenceReferences = cells.reduce((sum, row) => sum + row.evidenceAnchorIds.length, 0);
  const authority = {
    stateClass: 'DERIVED_STATE',
    productMutation: false,
    persistence: false,
    rendererWiring: false,
    externalEffects: false,
    commandAuthority: 'NOT_APPLICABLE_PURE_QUERY',
  };
  const normalized = {
    schemaVersion: ATLAS_TIME_KNOWLEDGE_SCHEMA_VERSION,
    stageId: ATLAS_TIME_KNOWLEDGE_NODE_ID,
    profileId: ATLAS_TIME_KNOWLEDGE_PROFILE_ID,
    snapshotId: snapshot.snapshotId,
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    cellCount: cells.length,
    evidenceAnchorCount: evidenceAnchors.length,
    cells,
    evidenceAnchors,
    cellsByPerspectiveEntityId: indexCells(cells, 'perspectiveEntityId'),
    cellsByPropositionId: indexCells(cells, 'propositionId'),
    timeAxisDenominator: countTimeAxes(cells),
    evidenceDenominator: { anchors: evidenceAnchors.length, references: evidenceReferences, cellsWithoutEvidence: 0 },
    authority,
    featureManifestDigest: digestCanonical(ATLAS_TIME_KNOWLEDGE_FEATURE_INTEGRATION_MANIFEST_V1),
  };
  return freezeDeep({ ...normalized, projectionDigest: digestCanonical(projectionIdentity(normalized)) });
}

export function compileAtlasTimeKnowledge(input) {
  assertExactDataObject(input, INPUT_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_INPUT_INVALID');
  return compileCurrent(input);
}

export function compileAtlasTimeKnowledgeIncremental(input) {
  assertExactDataObject(input, INCREMENTAL_INPUT_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_INCREMENTAL_INPUT_INVALID');
  assertDenseDataArray(input.cellBatches, 'E_ATLAS_TIME_KNOWLEDGE_BATCH_ARRAY_INVALID');
  const cells = [];
  for (const batch of input.cellBatches) {
    assertDenseDataArray(batch, 'E_ATLAS_TIME_KNOWLEDGE_BATCH_INVALID');
    if (cells.length + batch.length > ATLAS_TIME_KNOWLEDGE_MAX_CELLS) fail('E_ATLAS_TIME_KNOWLEDGE_CELL_COUNT_BOUND');
    cells.push(...batch);
  }
  return compileCurrent({
    snapshot: input.snapshot,
    currentSnapshotIdentity: input.currentSnapshotIdentity,
    evidenceAnchors: input.evidenceAnchors,
    cells,
  });
}

function normalizeIndex(value, cells, field, code) {
  if (!isPlainDataObject(value)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
  const expected = indexCells(cells, field);
  if (JSON.stringify(keys.sort()) !== JSON.stringify(Object.keys(expected).sort())) fail(code, 'KEY_COVERAGE');
  for (const key of Object.keys(expected)) {
    assertDenseDataArray(value[key], code);
    if (JSON.stringify(value[key]) !== JSON.stringify(expected[key])) fail(code, 'VALUE_MISMATCH');
  }
  return expected;
}

export function verifyAtlasTimeKnowledgeProjection(projection, snapshotInput) {
  assertExactDataObject(projection, PROJECTION_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_PROJECTION_INVALID');
  if (projection.schemaVersion !== ATLAS_TIME_KNOWLEDGE_SCHEMA_VERSION) fail('E_ATLAS_TIME_KNOWLEDGE_PROJECTION_SCHEMA');
  const snapshot = verifyAtlasBookSnapshot(snapshotInput);
  if (
    projection.snapshotId !== snapshot.snapshotId
    || projection.projectId !== snapshot.projectId
    || projection.projectRevisionId !== snapshot.projectRevisionId
  ) fail('E_ATLAS_TIME_KNOWLEDGE_PROJECTION_STALE');
  assertExactDataObject(projection.authority, AUTHORITY_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_AUTHORITY_INVALID');
  assertExactDataObject(projection.timeAxisDenominator, TIME_DENOMINATOR_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_TIME_DENOMINATOR_INVALID');
  assertExactDataObject(projection.evidenceDenominator, EVIDENCE_DENOMINATOR_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_DENOMINATOR_INVALID');
  assertDenseDataArray(projection.cells, 'E_ATLAS_TIME_KNOWLEDGE_CELL_ARRAY_INVALID');
  assertDenseDataArray(projection.evidenceAnchors, 'E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_ARRAY_INVALID');
  const rawEvidence = projection.evidenceAnchors.map((row) => {
    assertExactDataObject(row, EVIDENCE_PROJECTION_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_PROJECTION_INVALID');
    if (row.schemaVersion !== ATLAS_TIME_KNOWLEDGE_EVIDENCE_SCHEMA_VERSION) fail('E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_SCHEMA');
    const { anchorDigest, schemaVersion, ...input } = row;
    assertDigest(anchorDigest, 'E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_DIGEST_INVALID');
    const rebuilt = normalizeEvidenceAnchor(input, snapshot);
    if (anchorDigest !== rebuilt.anchorDigest || schemaVersion !== rebuilt.schemaVersion) {
      fail('E_ATLAS_TIME_KNOWLEDGE_EVIDENCE_DIGEST_MISMATCH', row.anchorId);
    }
    return input;
  });
  const rawCells = projection.cells.map((row) => {
    assertExactDataObject(row, CELL_PROJECTION_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_CELL_PROJECTION_INVALID');
    if (row.schemaVersion !== ATLAS_TIME_KNOWLEDGE_CELL_SCHEMA_VERSION) fail('E_ATLAS_TIME_KNOWLEDGE_CELL_SCHEMA');
    const { cellDigest, schemaVersion, ...input } = row;
    assertDigest(cellDigest, 'E_ATLAS_TIME_KNOWLEDGE_CELL_DIGEST_INVALID');
    return { input, cellDigest, schemaVersion };
  });
  const currentSnapshotIdentity = {
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    manifestRevision: snapshot.manifestRevision,
    orderDigest: snapshot.orderDigest,
    dependencyDigest: snapshot.dependencyDigest,
  };
  const rebuilt = compileAtlasTimeKnowledge({
    snapshot,
    currentSnapshotIdentity,
    evidenceAnchors: rawEvidence,
    cells: rawCells.map((row) => row.input),
  });
  for (let index = 0; index < rawCells.length; index += 1) {
    if (
      rawCells[index].schemaVersion !== rebuilt.cells[index].schemaVersion
      || rawCells[index].cellDigest !== rebuilt.cells[index].cellDigest
    ) fail('E_ATLAS_TIME_KNOWLEDGE_CELL_DIGEST_MISMATCH', rawCells[index].input.cellId);
  }
  normalizeIndex(projection.cellsByPerspectiveEntityId, rebuilt.cells, 'perspectiveEntityId', 'E_ATLAS_TIME_KNOWLEDGE_PERSPECTIVE_INDEX_INVALID');
  normalizeIndex(projection.cellsByPropositionId, rebuilt.cells, 'propositionId', 'E_ATLAS_TIME_KNOWLEDGE_PROPOSITION_INDEX_INVALID');
  if (
    projection.cellCount !== rebuilt.cellCount
    || projection.evidenceAnchorCount !== rebuilt.evidenceAnchorCount
    || JSON.stringify(projection.timeAxisDenominator) !== JSON.stringify(rebuilt.timeAxisDenominator)
    || JSON.stringify(projection.evidenceDenominator) !== JSON.stringify(rebuilt.evidenceDenominator)
  ) fail('E_ATLAS_TIME_KNOWLEDGE_DENOMINATOR_MISMATCH');
  if (
    projection.stageId !== ATLAS_TIME_KNOWLEDGE_NODE_ID
    || projection.profileId !== ATLAS_TIME_KNOWLEDGE_PROFILE_ID
    || projection.featureManifestDigest !== rebuilt.featureManifestDigest
  ) fail('E_ATLAS_TIME_KNOWLEDGE_CONTRACT_IDENTITY');
  if (
    projection.authority.stateClass !== 'DERIVED_STATE'
    || projection.authority.productMutation !== false
    || projection.authority.persistence !== false
    || projection.authority.rendererWiring !== false
    || projection.authority.externalEffects !== false
    || projection.authority.commandAuthority !== 'NOT_APPLICABLE_PURE_QUERY'
  ) fail('E_ATLAS_TIME_KNOWLEDGE_AUTHORITY_LEAK');
  assertDigest(projection.featureManifestDigest, 'E_ATLAS_TIME_KNOWLEDGE_MANIFEST_DIGEST_INVALID');
  assertDigest(projection.projectionDigest, 'E_ATLAS_TIME_KNOWLEDGE_PROJECTION_DIGEST_INVALID');
  if (projection.projectionDigest !== digestCanonical(projectionIdentity(projection))) {
    fail('E_ATLAS_TIME_KNOWLEDGE_PROJECTION_DIGEST_MISMATCH');
  }
  if (hashCanonicalValue(projection) !== hashCanonicalValue(rebuilt)) {
    fail('E_ATLAS_TIME_KNOWLEDGE_PROJECTION_MISMATCH');
  }
  return freezeDeep(projection);
}

export function queryAtlasTimeKnowledge(input) {
  assertExactDataObject(input, QUERY_INPUT_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_QUERY_INPUT_INVALID');
  const snapshot = assertAtlasBookSnapshotCurrent(input.snapshot, input.currentSnapshotIdentity);
  const projection = verifyAtlasTimeKnowledgeProjection(input.projection, snapshot);
  const propositionId = assertOptionalIdentifier(input.propositionId, 'E_ATLAS_TIME_KNOWLEDGE_PROPOSITION_ID_INVALID', 300);
  const perspectiveEntityId = assertOptionalIdentifier(input.perspectiveEntityId, 'E_ATLAS_TIME_KNOWLEDGE_PERSPECTIVE_ID_INVALID', 300);
  if (!propositionId && !perspectiveEntityId) fail('E_ATLAS_TIME_KNOWLEDGE_QUERY_FILTER_REQUIRED');
  const applicableCells = projection.cells.filter((cell) => (
    (!propositionId || cell.propositionId === propositionId)
    && (!perspectiveEntityId || cell.perspectiveEntityId === perspectiveEntityId)
  ));
  const identity = {
    schemaVersion: ATLAS_TIME_KNOWLEDGE_QUERY_SCHEMA_VERSION,
    snapshotId: snapshot.snapshotId,
    projectionDigest: projection.projectionDigest,
    propositionId,
    perspectiveEntityId,
    applicableCellCount: applicableCells.length,
    applicableCells,
  };
  return freezeDeep({ ...identity, queryDigest: digestCanonical(identity) });
}

export function verifyAtlasTimeKnowledgeQuery(result, projection, snapshot) {
  assertExactDataObject(result, QUERY_RESULT_KEYS, 'E_ATLAS_TIME_KNOWLEDGE_QUERY_RESULT_INVALID');
  if (result.schemaVersion !== ATLAS_TIME_KNOWLEDGE_QUERY_SCHEMA_VERSION) fail('E_ATLAS_TIME_KNOWLEDGE_QUERY_SCHEMA');
  const verifiedProjection = verifyAtlasTimeKnowledgeProjection(projection, snapshot);
  if (result.snapshotId !== verifiedProjection.snapshotId || result.projectionDigest !== verifiedProjection.projectionDigest) {
    fail('E_ATLAS_TIME_KNOWLEDGE_QUERY_STALE');
  }
  const propositionId = assertOptionalIdentifier(result.propositionId, 'E_ATLAS_TIME_KNOWLEDGE_PROPOSITION_ID_INVALID', 300);
  const perspectiveEntityId = assertOptionalIdentifier(result.perspectiveEntityId, 'E_ATLAS_TIME_KNOWLEDGE_PERSPECTIVE_ID_INVALID', 300);
  if (!propositionId && !perspectiveEntityId) fail('E_ATLAS_TIME_KNOWLEDGE_QUERY_FILTER_REQUIRED');
  assertDenseDataArray(result.applicableCells, 'E_ATLAS_TIME_KNOWLEDGE_QUERY_CELLS_INVALID');
  const expected = verifiedProjection.cells.filter((cell) => (
    (!propositionId || cell.propositionId === propositionId)
    && (!perspectiveEntityId || cell.perspectiveEntityId === perspectiveEntityId)
  ));
  if (result.applicableCellCount !== expected.length || JSON.stringify(result.applicableCells) !== JSON.stringify(expected)) {
    fail('E_ATLAS_TIME_KNOWLEDGE_QUERY_RESULT_MISMATCH');
  }
  assertDigest(result.queryDigest, 'E_ATLAS_TIME_KNOWLEDGE_QUERY_DIGEST_INVALID');
  const { queryDigest, ...identity } = result;
  if (queryDigest !== digestCanonical(identity)) fail('E_ATLAS_TIME_KNOWLEDGE_QUERY_DIGEST_MISMATCH');
  return freezeDeep(result);
}
