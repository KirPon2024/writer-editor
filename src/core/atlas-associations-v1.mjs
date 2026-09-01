import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { assertAtlasBookSnapshotCurrent, verifyAtlasBookSnapshot } from './atlas-book-snapshot-v1.mjs';

export const ATLAS_ASSOCIATIONS_SCHEMA_VERSION = 'yalken.r24.atlasAssociations.v1';
export const ATLAS_ASSOCIATION_SCHEMA_VERSION = 'yalken.r24.atlasAssociation.v1';
export const ATLAS_ASSOCIATION_QUERY_SCHEMA_VERSION = 'yalken.r24.atlasAssociationQuery.v1';
export const ATLAS_ASSOCIATIONS_NODE_ID = 'WP-500_ASSOCIATIONS';
export const ATLAS_ASSOCIATIONS_PROFILE_ID = 'ATLAS_PRODUCT_V33';
export const ATLAS_ASSOCIATIONS_MAX_COUNT = 10_000;
export const ATLAS_ASSOCIATIONS_MAX_EVIDENCE_PER_ASSOCIATION = 128;
export const ATLAS_ASSOCIATIONS_MAX_EVIDENCE_TOTAL = 100_000;
export const ATLAS_ASSOCIATION_MAX_OFFSET = 10_000_000;
export const ATLAS_ASSOCIATION_SCOPE_KIND = Object.freeze({
  BOOK: 'BOOK',
  SCENE: 'SCENE',
  FRAGMENT: 'FRAGMENT',
});
export const ATLAS_ASSOCIATION_DIRECTION = Object.freeze({
  DIRECTED: 'DIRECTED',
  UNDIRECTED: 'UNDIRECTED',
});

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const INPUT_KEYS = Object.freeze(['associations', 'currentSnapshotIdentity', 'snapshot']);
const ASSOCIATION_KEYS = Object.freeze([
  'associationId',
  'associationKind',
  'direction',
  'evidenceAnchorIds',
  'scope',
  'sourceEntityId',
  'targetEntityId',
]);
const ASSOCIATION_PROJECTION_KEYS = Object.freeze([
  'associationDigest',
  'associationId',
  'associationKind',
  'direction',
  'evidenceAnchorIds',
  'schemaVersion',
  'scope',
  'sourceEntityId',
  'targetEntityId',
]);
const BOOK_SCOPE_KEYS = Object.freeze(['kind', 'projectId', 'projectRevisionId']);
const SCENE_SCOPE_KEYS = Object.freeze(['kind', 'projectId', 'projectRevisionId', 'sceneId', 'sceneRevision']);
const FRAGMENT_SCOPE_KEYS = Object.freeze([
  'anchorLineageId',
  'endOffset',
  'kind',
  'projectId',
  'projectRevisionId',
  'sceneId',
  'sceneRevision',
  'startOffset',
]);
const PROJECTION_KEYS = Object.freeze([
  'associationCount',
  'associations',
  'authority',
  'bookAssociationIds',
  'featureManifestDigest',
  'fragmentAssociationIdsByScene',
  'profileId',
  'projectId',
  'projectRevisionId',
  'projectionDigest',
  'sceneAssociationIdsByScene',
  'schemaVersion',
  'scopeDenominator',
  'snapshotId',
  'stageId',
]);
const AUTHORITY_KEYS = Object.freeze([
  'commandAuthority',
  'externalEffects',
  'persistence',
  'productMutation',
  'rendererWiring',
  'stateClass',
]);
const SCOPE_DENOMINATOR_KEYS = Object.freeze(['book', 'fragment', 'scene', 'total']);
const QUERY_INPUT_KEYS = Object.freeze(['currentSnapshotIdentity', 'focusScope', 'projection', 'snapshot']);
const QUERY_RESULT_KEYS = Object.freeze([
  'applicableAssociationCount',
  'applicableAssociations',
  'focusScope',
  'projectionDigest',
  'queryDigest',
  'schemaVersion',
  'snapshotId',
]);

export const ATLAS_ASSOCIATIONS_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.atlas.associations.v1',
  featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:BOUND_TO_CURRENT_APPROVED_ENTRYPOINTS',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY',
  authoritativeData: 'VERIFIED_ATLAS_BOOK_SNAPSHOT_AND_CALLER_SUPPLIED_AUTHOR_ASSOCIATION_RECORDS',
  derivedData: 'REVISION_BOUND_BOOK_SCENE_FRAGMENT_ASSOCIATION_PROJECTION',
  commandIds: ['NOT_APPLICABLE_PURE_QUERY_NO_MUTATION'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  queryIds: ['atlas.associations.compile.v1', 'atlas.associations.query.v1'],
  productProjectionIds: [ATLAS_ASSOCIATIONS_SCHEMA_VERSION],
  capabilityIds: ['NOT_APPLICABLE_PLATFORM_NEUTRAL_PURE_MODULE'],
  authorityMap: 'PRODUCT_CORE_INPUTS_READ_ONLY_DERIVED_PROJECTOR_OUTPUT_ONLY',
  identityKeys: ['projectId', 'projectRevisionId', 'snapshotId', 'sceneRevision', 'anchorLineageId'],
  revisionPolicy: 'EXACT_BOOK_AND_SCENE_REVISION_BINDING_STALE_REJECTED',
  writePath: 'PURE_RETURN_VALUE_ONLY',
  readPath: 'VERIFIED_BOOK_SNAPSHOT_TO_IMMUTABLE_ASSOCIATION_PROJECTION',
  requiredProductPorts: ['NOT_APPLICABLE_NO_EXTERNAL_EFFECT'],
  requiredDesignOsPorts: ['NOT_APPLICABLE_NO_INTERFACE_PLANE_CHANGE'],
  adapterRequirements: ['NOT_APPLICABLE_NO_ADAPTER'],
  surfaceManifests: ['NOT_APPLICABLE_NO_UI_SURFACE'],
  slotRequirements: ['NOT_APPLICABLE_NO_UI_SLOT'],
  supportedWorkspaces: ['NOT_APPLICABLE_NO_UI_WORKSPACE'],
  platformAvailability: 'PLATFORM_NEUTRAL_PURE_MODULE',
  accessibilityRequirements: 'NOT_APPLICABLE_NO_VISUAL_OR_INTERACTIVE_SURFACE',
  fallbacks: ['EMPTY_PROJECTION_FOR_EMPTY_INPUT', 'FAIL_CLOSED_ON_STALE_OR_INVALID_SCOPE'],
  stateClasses: ['DERIVED_STATE'],
  persistenceClass: 'NOT_PERSISTED_BY_THIS_MODULE',
  migrations: ['NOT_APPLICABLE_NO_STORED_SCHEMA'],
  recovery: 'RECOMPILE_FROM_VERIFIED_SNAPSHOT_AND_AUTHOR_ASSOCIATION_RECORDS',
  rollback: 'REVERT_BOUNDED_MODULE_AND_TEST_COMMIT',
  performanceBudget: {
    maximumAssociations: ATLAS_ASSOCIATIONS_MAX_COUNT,
    maximumEvidencePerAssociation: ATLAS_ASSOCIATIONS_MAX_EVIDENCE_PER_ASSOCIATION,
    maximumEvidenceTotal: ATLAS_ASSOCIATIONS_MAX_EVIDENCE_TOTAL,
  },
  securityBoundary: 'STRICT_OWN_DATA_EXACT_KEYSETS_NFC_BOUNDED_DENOMINATORS_NO_ACCESSORS_OR_SYMBOLS',
  lifecycle: 'ON_DEMAND_PURE_COMPILATION_AND_QUERY_ONLY',
  negativeBypassChecks: [
    'STALE_BOOK_SCENE_AND_FRAGMENT_IDENTITIES_REJECTED',
    'SCENE_AND_FRAGMENT_SCOPE_LEAKAGE_REJECTED',
    'DUPLICATE_ID_AND_SEMANTIC_ASSOCIATION_REJECTED',
    'TAMPERED_PROJECTION_DIGEST_REJECTED',
  ],
  evidenceBindings: ['WP404_FOUNDATION_PREDECESSOR', 'EXACT_BOOK_SNAPSHOT', 'WP500_CONTRACT_INTEGRATION_MUTANTS'],
  currentReality: 'PURE_ASSOCIATION_PROJECTION_ONLY_NO_RUNTIME_STORAGE_OR_RENDERER_WIRING',
});

export class AtlasAssociationsError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AtlasAssociationsError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') {
  throw new AtlasAssociationsError(code, detail);
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

function assertDigest(value, code) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) fail(code);
  return value;
}

function assertOffset(value, code) {
  if (!Number.isSafeInteger(value) || value < 0 || value > ATLAS_ASSOCIATION_MAX_OFFSET) fail(code);
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

function assertSnapshotScene(snapshot, sceneId, sceneRevision) {
  if (!Object.prototype.hasOwnProperty.call(snapshot.sceneRevisionsById, sceneId)) {
    fail('E_ATLAS_ASSOCIATION_SCENE_NOT_FOUND', sceneId);
  }
  if (snapshot.sceneRevisionsById[sceneId] !== sceneRevision) {
    fail('E_ATLAS_ASSOCIATION_SCENE_REVISION_STALE', sceneId);
  }
}

function normalizeScope(scope, snapshot, code = 'E_ATLAS_ASSOCIATION_SCOPE_INVALID') {
  if (!isPlainDataObject(scope)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const kind = scope.kind;
  const expectedKeys = kind === ATLAS_ASSOCIATION_SCOPE_KIND.BOOK
    ? BOOK_SCOPE_KEYS
    : kind === ATLAS_ASSOCIATION_SCOPE_KIND.SCENE
      ? SCENE_SCOPE_KEYS
      : kind === ATLAS_ASSOCIATION_SCOPE_KIND.FRAGMENT
        ? FRAGMENT_SCOPE_KEYS
        : null;
  if (!expectedKeys) fail('E_ATLAS_ASSOCIATION_SCOPE_KIND');
  assertExactDataObject(scope, expectedKeys, code);
  const projectId = assertIdentifier(scope.projectId, 'E_ATLAS_ASSOCIATION_PROJECT_ID_INVALID', 200);
  const projectRevisionId = assertDigest(scope.projectRevisionId, 'E_ATLAS_ASSOCIATION_PROJECT_REVISION_INVALID');
  if (projectId !== snapshot.projectId) fail('E_ATLAS_ASSOCIATION_PROJECT_MISMATCH');
  if (projectRevisionId !== snapshot.projectRevisionId) fail('E_ATLAS_ASSOCIATION_PROJECT_REVISION_STALE');
  if (kind === ATLAS_ASSOCIATION_SCOPE_KIND.BOOK) return { kind, projectId, projectRevisionId };
  const sceneId = assertIdentifier(scope.sceneId, 'E_ATLAS_ASSOCIATION_SCENE_ID_INVALID', 200);
  const sceneRevision = assertDigest(scope.sceneRevision, 'E_ATLAS_ASSOCIATION_SCENE_REVISION_INVALID');
  assertSnapshotScene(snapshot, sceneId, sceneRevision);
  if (kind === ATLAS_ASSOCIATION_SCOPE_KIND.SCENE) {
    return { kind, projectId, projectRevisionId, sceneId, sceneRevision };
  }
  const anchorLineageId = assertIdentifier(scope.anchorLineageId, 'E_ATLAS_ASSOCIATION_ANCHOR_ID_INVALID', 300);
  const startOffset = assertOffset(scope.startOffset, 'E_ATLAS_ASSOCIATION_START_OFFSET_INVALID');
  const endOffset = assertOffset(scope.endOffset, 'E_ATLAS_ASSOCIATION_END_OFFSET_INVALID');
  if (endOffset <= startOffset) fail('E_ATLAS_ASSOCIATION_FRAGMENT_RANGE_INVALID');
  return { kind, projectId, projectRevisionId, sceneId, sceneRevision, anchorLineageId, startOffset, endOffset };
}

function normalizeAssociation(input, snapshot) {
  assertExactDataObject(input, ASSOCIATION_KEYS, 'E_ATLAS_ASSOCIATION_INVALID');
  const associationId = assertIdentifier(input.associationId, 'E_ATLAS_ASSOCIATION_ID_INVALID', 300);
  const associationKind = assertIdentifier(input.associationKind, 'E_ATLAS_ASSOCIATION_KIND_INVALID', 200);
  const direction = input.direction;
  if (!Object.values(ATLAS_ASSOCIATION_DIRECTION).includes(direction)) fail('E_ATLAS_ASSOCIATION_DIRECTION_INVALID');
  let sourceEntityId = assertIdentifier(input.sourceEntityId, 'E_ATLAS_ASSOCIATION_SOURCE_ENTITY_INVALID', 300);
  let targetEntityId = assertIdentifier(input.targetEntityId, 'E_ATLAS_ASSOCIATION_TARGET_ENTITY_INVALID', 300);
  if (sourceEntityId === targetEntityId) fail('E_ATLAS_ASSOCIATION_SELF_EDGE');
  if (direction === ATLAS_ASSOCIATION_DIRECTION.UNDIRECTED && sourceEntityId > targetEntityId) {
    [sourceEntityId, targetEntityId] = [targetEntityId, sourceEntityId];
  }
  assertDenseDataArray(input.evidenceAnchorIds, 'E_ATLAS_ASSOCIATION_EVIDENCE_INVALID');
  if (input.evidenceAnchorIds.length === 0 || input.evidenceAnchorIds.length > ATLAS_ASSOCIATIONS_MAX_EVIDENCE_PER_ASSOCIATION) {
    fail('E_ATLAS_ASSOCIATION_EVIDENCE_DENOMINATOR');
  }
  const evidenceAnchorIds = input.evidenceAnchorIds.map((value) => (
    assertIdentifier(value, 'E_ATLAS_ASSOCIATION_EVIDENCE_ID_INVALID', 300)
  ));
  if (new Set(evidenceAnchorIds).size !== evidenceAnchorIds.length) fail('E_ATLAS_ASSOCIATION_EVIDENCE_DUPLICATE');
  evidenceAnchorIds.sort();
  const scope = normalizeScope(input.scope, snapshot);
  const identity = {
    schemaVersion: ATLAS_ASSOCIATION_SCHEMA_VERSION,
    associationId,
    associationKind,
    direction,
    sourceEntityId,
    targetEntityId,
    scope,
    evidenceAnchorIds,
  };
  return { ...identity, associationDigest: digestCanonical(identity) };
}

function semanticAssociationKey(association) {
  return digestCanonical({
    associationKind: association.associationKind,
    direction: association.direction,
    sourceEntityId: association.sourceEntityId,
    targetEntityId: association.targetEntityId,
    scope: association.scope,
  });
}

function emptySceneMap(snapshot) {
  return Object.fromEntries(snapshot.sceneOrder.map((sceneId) => [sceneId, []]));
}

function projectionIdentity(normalized) {
  const {
    schemaVersion,
    stageId,
    profileId,
    snapshotId,
    projectId,
    projectRevisionId,
    associationCount,
    associations,
    bookAssociationIds,
    sceneAssociationIdsByScene,
    fragmentAssociationIdsByScene,
    scopeDenominator,
    authority,
    featureManifestDigest,
  } = normalized;
  return {
    schemaVersion,
    stageId,
    profileId,
    snapshotId,
    projectId,
    projectRevisionId,
    associationCount,
    associations,
    bookAssociationIds,
    sceneAssociationIdsByScene,
    fragmentAssociationIdsByScene,
    scopeDenominator,
    authority,
    featureManifestDigest,
  };
}

export function compileAtlasAssociations(input) {
  assertExactDataObject(input, INPUT_KEYS, 'E_ATLAS_ASSOCIATIONS_INPUT_INVALID');
  const snapshot = assertAtlasBookSnapshotCurrent(input.snapshot, input.currentSnapshotIdentity);
  assertDenseDataArray(input.associations, 'E_ATLAS_ASSOCIATIONS_ARRAY_INVALID');
  if (input.associations.length > ATLAS_ASSOCIATIONS_MAX_COUNT) fail('E_ATLAS_ASSOCIATIONS_COUNT_BOUND');
  const associations = input.associations.map((association) => normalizeAssociation(association, snapshot));
  associations.sort((left, right) => left.associationId.localeCompare(right.associationId, 'en'));
  if (new Set(associations.map((association) => association.associationId)).size !== associations.length) {
    fail('E_ATLAS_ASSOCIATION_ID_DUPLICATE');
  }
  if (new Set(associations.map(semanticAssociationKey)).size !== associations.length) {
    fail('E_ATLAS_ASSOCIATION_SEMANTIC_DUPLICATE');
  }
  const evidenceTotal = associations.reduce((sum, association) => sum + association.evidenceAnchorIds.length, 0);
  if (evidenceTotal > ATLAS_ASSOCIATIONS_MAX_EVIDENCE_TOTAL) fail('E_ATLAS_ASSOCIATIONS_EVIDENCE_TOTAL_BOUND');
  const bookAssociationIds = [];
  const sceneAssociationIdsByScene = emptySceneMap(snapshot);
  const fragmentAssociationIdsByScene = emptySceneMap(snapshot);
  const scopeDenominator = { book: 0, scene: 0, fragment: 0, total: associations.length };
  for (const association of associations) {
    if (association.scope.kind === ATLAS_ASSOCIATION_SCOPE_KIND.BOOK) {
      bookAssociationIds.push(association.associationId);
      scopeDenominator.book += 1;
    } else if (association.scope.kind === ATLAS_ASSOCIATION_SCOPE_KIND.SCENE) {
      sceneAssociationIdsByScene[association.scope.sceneId].push(association.associationId);
      scopeDenominator.scene += 1;
    } else {
      fragmentAssociationIdsByScene[association.scope.sceneId].push(association.associationId);
      scopeDenominator.fragment += 1;
    }
  }
  const authority = {
    stateClass: 'DERIVED_STATE',
    productMutation: false,
    persistence: false,
    rendererWiring: false,
    externalEffects: false,
    commandAuthority: 'NOT_APPLICABLE_PURE_QUERY',
  };
  const normalized = {
    schemaVersion: ATLAS_ASSOCIATIONS_SCHEMA_VERSION,
    stageId: ATLAS_ASSOCIATIONS_NODE_ID,
    profileId: ATLAS_ASSOCIATIONS_PROFILE_ID,
    snapshotId: snapshot.snapshotId,
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    associationCount: associations.length,
    associations,
    bookAssociationIds,
    sceneAssociationIdsByScene,
    fragmentAssociationIdsByScene,
    scopeDenominator,
    authority,
    featureManifestDigest: digestCanonical(ATLAS_ASSOCIATIONS_FEATURE_INTEGRATION_MANIFEST_V1),
  };
  return freezeDeep({ ...normalized, projectionDigest: digestCanonical(projectionIdentity(normalized)) });
}

function normalizeProjectionMap(value, snapshot, code) {
  if (!isPlainDataObject(value)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
  if (keys.length !== snapshot.sceneOrder.length || keys.some((key) => !snapshot.sceneOrder.includes(key))) fail(code, 'SCENE_COVERAGE');
  const result = {};
  for (const sceneId of snapshot.sceneOrder) {
    assertDenseDataArray(value[sceneId], code);
    result[sceneId] = value[sceneId].map((id) => assertIdentifier(id, code, 300));
  }
  return result;
}

export function verifyAtlasAssociationsProjection(projection, snapshotInput = null) {
  assertExactDataObject(projection, PROJECTION_KEYS, 'E_ATLAS_ASSOCIATIONS_PROJECTION_INVALID');
  if (projection.schemaVersion !== ATLAS_ASSOCIATIONS_SCHEMA_VERSION) fail('E_ATLAS_ASSOCIATIONS_PROJECTION_SCHEMA');
  const snapshot = snapshotInput ? verifyAtlasBookSnapshot(snapshotInput) : null;
  if (!snapshot) fail('E_ATLAS_ASSOCIATIONS_SNAPSHOT_REQUIRED');
  if (projection.snapshotId !== snapshot.snapshotId || projection.projectId !== snapshot.projectId || projection.projectRevisionId !== snapshot.projectRevisionId) {
    fail('E_ATLAS_ASSOCIATIONS_PROJECTION_STALE');
  }
  assertExactDataObject(projection.authority, AUTHORITY_KEYS, 'E_ATLAS_ASSOCIATIONS_AUTHORITY_INVALID');
  assertExactDataObject(projection.scopeDenominator, SCOPE_DENOMINATOR_KEYS, 'E_ATLAS_ASSOCIATIONS_DENOMINATOR_INVALID');
  assertDenseDataArray(projection.associations, 'E_ATLAS_ASSOCIATIONS_ARRAY_INVALID');
  assertDenseDataArray(projection.bookAssociationIds, 'E_ATLAS_ASSOCIATIONS_BOOK_IDS_INVALID');
  const sceneAssociationIdsByScene = normalizeProjectionMap(
    projection.sceneAssociationIdsByScene,
    snapshot,
    'E_ATLAS_ASSOCIATIONS_SCENE_MAP_INVALID',
  );
  const fragmentAssociationIdsByScene = normalizeProjectionMap(
    projection.fragmentAssociationIdsByScene,
    snapshot,
    'E_ATLAS_ASSOCIATIONS_FRAGMENT_MAP_INVALID',
  );
  assertDigest(projection.featureManifestDigest, 'E_ATLAS_ASSOCIATIONS_MANIFEST_DIGEST_INVALID');
  assertDigest(projection.projectionDigest, 'E_ATLAS_ASSOCIATIONS_PROJECTION_DIGEST_INVALID');
  if (projection.projectionDigest !== digestCanonical(projectionIdentity(projection))) {
    fail('E_ATLAS_ASSOCIATIONS_PROJECTION_DIGEST_MISMATCH');
  }
  if (
    projection.associationCount !== projection.associations.length
    || projection.scopeDenominator.total !== projection.associationCount
    || projection.scopeDenominator.book + projection.scopeDenominator.scene + projection.scopeDenominator.fragment !== projection.associationCount
  ) fail('E_ATLAS_ASSOCIATIONS_DENOMINATOR_MISMATCH');
  if (
    projection.stageId !== ATLAS_ASSOCIATIONS_NODE_ID
    || projection.profileId !== ATLAS_ASSOCIATIONS_PROFILE_ID
    || projection.featureManifestDigest !== digestCanonical(ATLAS_ASSOCIATIONS_FEATURE_INTEGRATION_MANIFEST_V1)
  ) fail('E_ATLAS_ASSOCIATIONS_CONTRACT_IDENTITY');
  if (
    projection.authority.stateClass !== 'DERIVED_STATE'
    || projection.authority.productMutation !== false
    || projection.authority.persistence !== false
    || projection.authority.rendererWiring !== false
    || projection.authority.externalEffects !== false
    || projection.authority.commandAuthority !== 'NOT_APPLICABLE_PURE_QUERY'
  ) fail('E_ATLAS_ASSOCIATIONS_AUTHORITY_LEAK');
  const rebuiltAssociations = projection.associations.map((association) => {
    assertExactDataObject(association, ASSOCIATION_PROJECTION_KEYS, 'E_ATLAS_ASSOCIATION_PROJECTION_INVALID');
    if (association.schemaVersion !== ATLAS_ASSOCIATION_SCHEMA_VERSION) fail('E_ATLAS_ASSOCIATION_SCHEMA');
    const { associationDigest, schemaVersion, ...input } = association;
    assertDigest(associationDigest, 'E_ATLAS_ASSOCIATION_DIGEST_INVALID');
    const rebuilt = normalizeAssociation(input, snapshot);
    if (associationDigest !== rebuilt.associationDigest || schemaVersion !== rebuilt.schemaVersion) {
      fail('E_ATLAS_ASSOCIATION_DIGEST_MISMATCH', association.associationId);
    }
    return rebuilt;
  });
  const associationIds = rebuiltAssociations.map((association) => association.associationId);
  if (
    new Set(associationIds).size !== associationIds.length
    || associationIds.some((id, index) => index > 0 && associationIds[index - 1].localeCompare(id, 'en') >= 0)
  ) fail('E_ATLAS_ASSOCIATION_ORDER_OR_DUPLICATE');
  if (new Set(rebuiltAssociations.map(semanticAssociationKey)).size !== rebuiltAssociations.length) {
    fail('E_ATLAS_ASSOCIATION_SEMANTIC_DUPLICATE');
  }
  const expectedBookIds = [];
  const expectedSceneIds = emptySceneMap(snapshot);
  const expectedFragmentIds = emptySceneMap(snapshot);
  const expectedDenominator = { book: 0, scene: 0, fragment: 0, total: rebuiltAssociations.length };
  for (const association of rebuiltAssociations) {
    if (association.scope.kind === ATLAS_ASSOCIATION_SCOPE_KIND.BOOK) {
      expectedBookIds.push(association.associationId);
      expectedDenominator.book += 1;
    } else if (association.scope.kind === ATLAS_ASSOCIATION_SCOPE_KIND.SCENE) {
      expectedSceneIds[association.scope.sceneId].push(association.associationId);
      expectedDenominator.scene += 1;
    } else {
      expectedFragmentIds[association.scope.sceneId].push(association.associationId);
      expectedDenominator.fragment += 1;
    }
  }
  if (
    JSON.stringify(projection.bookAssociationIds) !== JSON.stringify(expectedBookIds)
    || JSON.stringify(sceneAssociationIdsByScene) !== JSON.stringify(expectedSceneIds)
    || JSON.stringify(fragmentAssociationIdsByScene) !== JSON.stringify(expectedFragmentIds)
    || JSON.stringify(projection.scopeDenominator) !== JSON.stringify(expectedDenominator)
  ) fail('E_ATLAS_ASSOCIATIONS_INDEX_MISMATCH');
  return freezeDeep(projection);
}

function scopeApplies(associationScope, focusScope) {
  if (associationScope.kind === ATLAS_ASSOCIATION_SCOPE_KIND.BOOK) return true;
  if (focusScope.kind === ATLAS_ASSOCIATION_SCOPE_KIND.BOOK) return false;
  if (associationScope.sceneId !== focusScope.sceneId) return false;
  if (associationScope.kind === ATLAS_ASSOCIATION_SCOPE_KIND.SCENE) return true;
  if (focusScope.kind !== ATLAS_ASSOCIATION_SCOPE_KIND.FRAGMENT) return false;
  return associationScope.anchorLineageId === focusScope.anchorLineageId
    && associationScope.startOffset <= focusScope.startOffset
    && associationScope.endOffset >= focusScope.endOffset;
}

export function queryAtlasAssociations(input) {
  assertExactDataObject(input, QUERY_INPUT_KEYS, 'E_ATLAS_ASSOCIATION_QUERY_INPUT_INVALID');
  const snapshot = assertAtlasBookSnapshotCurrent(input.snapshot, input.currentSnapshotIdentity);
  const projection = verifyAtlasAssociationsProjection(input.projection, snapshot);
  const focusScope = normalizeScope(input.focusScope, snapshot, 'E_ATLAS_ASSOCIATION_FOCUS_SCOPE_INVALID');
  const applicableAssociations = projection.associations.filter((association) => scopeApplies(association.scope, focusScope));
  const identity = {
    schemaVersion: ATLAS_ASSOCIATION_QUERY_SCHEMA_VERSION,
    snapshotId: snapshot.snapshotId,
    projectionDigest: projection.projectionDigest,
    focusScope,
    applicableAssociationCount: applicableAssociations.length,
    applicableAssociations,
  };
  return freezeDeep({ ...identity, queryDigest: digestCanonical(identity) });
}

export function verifyAtlasAssociationQuery(result, projection, snapshot) {
  assertExactDataObject(result, QUERY_RESULT_KEYS, 'E_ATLAS_ASSOCIATION_QUERY_RESULT_INVALID');
  if (result.schemaVersion !== ATLAS_ASSOCIATION_QUERY_SCHEMA_VERSION) fail('E_ATLAS_ASSOCIATION_QUERY_SCHEMA');
  const verifiedProjection = verifyAtlasAssociationsProjection(projection, snapshot);
  if (result.snapshotId !== verifiedProjection.snapshotId || result.projectionDigest !== verifiedProjection.projectionDigest) {
    fail('E_ATLAS_ASSOCIATION_QUERY_STALE');
  }
  assertDenseDataArray(result.applicableAssociations, 'E_ATLAS_ASSOCIATION_QUERY_ASSOCIATIONS_INVALID');
  if (result.applicableAssociationCount !== result.applicableAssociations.length) fail('E_ATLAS_ASSOCIATION_QUERY_DENOMINATOR');
  const focusScope = normalizeScope(result.focusScope, snapshot, 'E_ATLAS_ASSOCIATION_FOCUS_SCOPE_INVALID');
  const expectedAssociations = verifiedProjection.associations.filter((association) => scopeApplies(association.scope, focusScope));
  if (JSON.stringify(result.applicableAssociations) !== JSON.stringify(expectedAssociations)) {
    fail('E_ATLAS_ASSOCIATION_QUERY_RESULT_MISMATCH');
  }
  assertDigest(result.queryDigest, 'E_ATLAS_ASSOCIATION_QUERY_DIGEST_INVALID');
  const { queryDigest, ...identity } = result;
  if (queryDigest !== digestCanonical(identity)) fail('E_ATLAS_ASSOCIATION_QUERY_DIGEST_MISMATCH');
  return freezeDeep(result);
}
