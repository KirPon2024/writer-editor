import { hashCanonicalValue } from './browser-safe-hash.mjs';

export const ATLAS_BOOK_SNAPSHOT_SCHEMA_VERSION = 'yalken.atlas.bookSnapshot.v1';
export const ATLAS_BOOK_ORDER_SCHEMA_VERSION = 'yalken.atlas.bookOrder.v1';
export const ATLAS_BOOK_DEPENDENCY_SCHEMA_VERSION = 'yalken.atlas.bookDependencies.v1';
export const ATLAS_SCENE_DEPENDENCY_SCHEMA_VERSION = 'yalken.atlas.sceneDependencies.v1';
export const ATLAS_PRODUCT_REVISION_BRIDGE_SCHEMA_VERSION = 'yalken.atlas.productRevisionBridge.v1';
export const ATLAS_BOOK_SNAPSHOT_MAX_SCENES = 10_000;
export const ATLAS_BOOK_SNAPSHOT_MAX_DEPENDENCIES = 100_000;

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const INPUT_KEYS = Object.freeze([
  'dependenciesBySceneId',
  'manifestRevision',
  'projectId',
  'projectRevisionId',
  'sceneOrder',
  'sceneRevisionsById',
]);
const SNAPSHOT_KEYS = Object.freeze([
  'dependenciesBySceneId',
  'dependencyDigest',
  'manifestRevision',
  'orderDigest',
  'projectId',
  'projectRevisionId',
  'sceneCount',
  'sceneDependencyDigestsById',
  'sceneOrder',
  'sceneRevisionsById',
  'schemaVersion',
  'snapshotId',
]);
const REVISION_BRIDGE_KEYS = Object.freeze([
  'manifestRevision',
  'projectId',
  'projectRevisionId',
  'revisionScope',
  'sceneOrder',
  'scenesById',
  'schemaVersion',
]);
const REVISION_SCENE_KEYS = Object.freeze([
  'sceneId',
  'sceneRevision',
  'text',
  'title',
]);
const CURRENT_IDENTITY_KEYS = Object.freeze([
  'dependencyDigest',
  'manifestRevision',
  'orderDigest',
  'projectId',
  'projectRevisionId',
]);

export class AtlasBookSnapshotError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AtlasBookSnapshotError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') {
  throw new AtlasBookSnapshotError(code, detail);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactDataObject(value, expectedKeys, code) {
  if (!isPlainObject(value)) fail(code, 'OBJECT_REQUIRED');
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
  const ownNames = Object.getOwnPropertyNames(value);
  if (ownNames.length !== value.length + 1 || !ownNames.includes('length')) fail(code, 'DENSE_ARRAY_REQUIRED');
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

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function digestCanonical(value) {
  return `sha256:${hashCanonicalValue(value)}`;
}

function assertMapDataProperties(value, code) {
  if (!isPlainObject(value)) fail(code, 'OBJECT_REQUIRED');
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail(code, 'DATA_PROPERTIES_REQUIRED');
    }
  }
  return keys;
}

function assertExactCoverage(sceneOrder, mapKeys, code) {
  const ordered = new Set(sceneOrder);
  if (
    ordered.size !== sceneOrder.length
    || mapKeys.length !== sceneOrder.length
    || mapKeys.some((sceneId) => !ordered.has(sceneId))
  ) fail(code);
}

function normalizeSnapshotInput(input) {
  assertExactDataObject(input, INPUT_KEYS, 'E_ATLAS_BOOK_SNAPSHOT_INPUT_INVALID');
  const projectId = assertIdentifier(input.projectId, 'E_ATLAS_BOOK_SNAPSHOT_PROJECT_ID_INVALID', 200);
  const projectRevisionId = assertDigest(input.projectRevisionId, 'E_ATLAS_BOOK_SNAPSHOT_PROJECT_REVISION_INVALID');
  const manifestRevision = assertDigest(input.manifestRevision, 'E_ATLAS_BOOK_SNAPSHOT_MANIFEST_REVISION_INVALID');
  assertDenseDataArray(input.sceneOrder, 'E_ATLAS_BOOK_SNAPSHOT_SCENE_ORDER_INVALID');
  if (input.sceneOrder.length > ATLAS_BOOK_SNAPSHOT_MAX_SCENES) fail('E_ATLAS_BOOK_SNAPSHOT_SCENE_LIMIT');
  const sceneOrder = input.sceneOrder.map((sceneId) => assertIdentifier(sceneId, 'E_ATLAS_BOOK_SNAPSHOT_SCENE_ID_INVALID'));
  if (new Set(sceneOrder).size !== sceneOrder.length) fail('E_ATLAS_BOOK_SNAPSHOT_SCENE_ORDER_DUPLICATE');

  const revisionKeys = assertMapDataProperties(input.sceneRevisionsById, 'E_ATLAS_BOOK_SNAPSHOT_SCENE_REVISIONS_INVALID');
  const dependencyKeys = assertMapDataProperties(input.dependenciesBySceneId, 'E_ATLAS_BOOK_SNAPSHOT_DEPENDENCIES_INVALID');
  for (const sceneId of [...revisionKeys, ...dependencyKeys]) {
    assertIdentifier(sceneId, 'E_ATLAS_BOOK_SNAPSHOT_SCENE_ID_INVALID');
  }
  assertExactCoverage(sceneOrder, revisionKeys, 'E_ATLAS_BOOK_SNAPSHOT_REVISION_COVERAGE');
  assertExactCoverage(sceneOrder, dependencyKeys, 'E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_COVERAGE');

  const sceneRevisionsById = {};
  const dependenciesBySceneId = {};
  let dependencyCount = 0;
  for (const sceneId of sceneOrder) {
    sceneRevisionsById[sceneId] = assertDigest(
      input.sceneRevisionsById[sceneId],
      'E_ATLAS_BOOK_SNAPSHOT_SCENE_REVISION_INVALID',
    );
    const dependencies = input.dependenciesBySceneId[sceneId];
    assertDenseDataArray(dependencies, 'E_ATLAS_BOOK_SNAPSHOT_SCENE_DEPENDENCIES_INVALID');
    const normalized = dependencies.map((digest) => (
      assertDigest(digest, 'E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_INVALID')
    ));
    if (new Set(normalized).size !== normalized.length) fail('E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_DUPLICATE');
    if (normalized.some((digest, index) => index > 0 && normalized[index - 1] >= digest)) {
      fail('E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_ORDER');
    }
    dependencyCount += normalized.length;
    if (dependencyCount > ATLAS_BOOK_SNAPSHOT_MAX_DEPENDENCIES) fail('E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_LIMIT');
    dependenciesBySceneId[sceneId] = normalized;
  }
  return { projectId, projectRevisionId, manifestRevision, sceneOrder, sceneRevisionsById, dependenciesBySceneId };
}

function buildSnapshot(normalized) {
  const {
    projectId,
    projectRevisionId,
    manifestRevision,
    sceneOrder,
    sceneRevisionsById,
    dependenciesBySceneId,
  } = normalized;
  const orderDigest = digestCanonical({
    schemaVersion: ATLAS_BOOK_ORDER_SCHEMA_VERSION,
    projectId,
    sceneOrder,
  });
  const sceneDependencyDigestsById = {};
  for (const sceneId of sceneOrder) {
    sceneDependencyDigestsById[sceneId] = digestCanonical({
      schemaVersion: ATLAS_SCENE_DEPENDENCY_SCHEMA_VERSION,
      projectId,
      sceneId,
      sceneRevision: sceneRevisionsById[sceneId],
      dependencyDigests: dependenciesBySceneId[sceneId],
    });
  }
  const dependencyDigest = digestCanonical({
    schemaVersion: ATLAS_BOOK_DEPENDENCY_SCHEMA_VERSION,
    projectId,
    manifestRevision,
    orderedSceneDependencies: sceneOrder.map((sceneId) => ({
      sceneId,
      digest: sceneDependencyDigestsById[sceneId],
    })),
  });
  const identity = {
    schemaVersion: ATLAS_BOOK_SNAPSHOT_SCHEMA_VERSION,
    projectId,
    projectRevisionId,
    manifestRevision,
    sceneCount: sceneOrder.length,
    orderDigest,
    dependencyDigest,
  };
  const snapshotId = digestCanonical(identity);
  return freezeDeep({
    schemaVersion: ATLAS_BOOK_SNAPSHOT_SCHEMA_VERSION,
    snapshotId,
    projectId,
    projectRevisionId,
    manifestRevision,
    sceneCount: sceneOrder.length,
    sceneOrder: sceneOrder.slice(),
    orderDigest,
    sceneRevisionsById: { ...sceneRevisionsById },
    dependenciesBySceneId: Object.fromEntries(
      sceneOrder.map((sceneId) => [sceneId, dependenciesBySceneId[sceneId].slice()]),
    ),
    sceneDependencyDigestsById,
    dependencyDigest,
  });
}

export function createAtlasBookSnapshot(input) {
  return buildSnapshot(normalizeSnapshotInput(input));
}

export function createAtlasBookSnapshotFromRevisionBridge(revisionBridge, dependenciesBySceneId) {
  assertExactDataObject(revisionBridge, REVISION_BRIDGE_KEYS, 'E_ATLAS_BOOK_SNAPSHOT_REVISION_BRIDGE_INVALID');
  if (revisionBridge.schemaVersion !== ATLAS_PRODUCT_REVISION_BRIDGE_SCHEMA_VERSION) {
    fail('E_ATLAS_BOOK_SNAPSHOT_REVISION_BRIDGE_SCHEMA');
  }
  if (revisionBridge.revisionScope !== 'WHOLE_PROJECT') fail('E_ATLAS_BOOK_SNAPSHOT_WHOLE_PROJECT_REQUIRED');
  assertDenseDataArray(revisionBridge.sceneOrder, 'E_ATLAS_BOOK_SNAPSHOT_REVISION_BRIDGE_ORDER');
  if (revisionBridge.sceneOrder.length > ATLAS_BOOK_SNAPSHOT_MAX_SCENES) {
    fail('E_ATLAS_BOOK_SNAPSHOT_SCENE_LIMIT');
  }
  const sceneKeys = assertMapDataProperties(
    revisionBridge.scenesById,
    'E_ATLAS_BOOK_SNAPSHOT_REVISION_BRIDGE_SCENES',
  );
  assertExactCoverage(
    revisionBridge.sceneOrder,
    sceneKeys,
    'E_ATLAS_BOOK_SNAPSHOT_REVISION_BRIDGE_COVERAGE',
  );
  const sceneRevisionsById = {};
  for (const sceneId of revisionBridge.sceneOrder) {
    const scene = revisionBridge.scenesById[sceneId];
    assertExactDataObject(scene, REVISION_SCENE_KEYS, 'E_ATLAS_BOOK_SNAPSHOT_REVISION_BRIDGE_SCENE_INVALID');
    if (scene.sceneId !== sceneId) fail('E_ATLAS_BOOK_SNAPSHOT_REVISION_BRIDGE_SCENE_ID');
    sceneRevisionsById[sceneId] = scene.sceneRevision;
  }
  return createAtlasBookSnapshot({
    projectId: revisionBridge.projectId,
    projectRevisionId: revisionBridge.projectRevisionId,
    manifestRevision: revisionBridge.manifestRevision,
    sceneOrder: revisionBridge.sceneOrder,
    sceneRevisionsById,
    dependenciesBySceneId,
  });
}

export function verifyAtlasBookSnapshot(snapshot) {
  assertExactDataObject(snapshot, SNAPSHOT_KEYS, 'E_ATLAS_BOOK_SNAPSHOT_INVALID');
  if (snapshot.schemaVersion !== ATLAS_BOOK_SNAPSHOT_SCHEMA_VERSION) fail('E_ATLAS_BOOK_SNAPSHOT_SCHEMA');
  if (!Number.isSafeInteger(snapshot.sceneCount) || snapshot.sceneCount < 0) fail('E_ATLAS_BOOK_SNAPSHOT_SCENE_COUNT');
  const rebuilt = createAtlasBookSnapshot({
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    manifestRevision: snapshot.manifestRevision,
    sceneOrder: snapshot.sceneOrder,
    sceneRevisionsById: snapshot.sceneRevisionsById,
    dependenciesBySceneId: snapshot.dependenciesBySceneId,
  });
  if (snapshot.sceneCount !== rebuilt.sceneCount) fail('E_ATLAS_BOOK_SNAPSHOT_SCENE_COUNT');
  if (hashCanonicalValue(snapshot) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_BOOK_SNAPSHOT_DIGEST_MISMATCH');
  return rebuilt;
}

function currentIdentityFromSnapshot(snapshot) {
  return {
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    manifestRevision: snapshot.manifestRevision,
    orderDigest: snapshot.orderDigest,
    dependencyDigest: snapshot.dependencyDigest,
  };
}

export function assessAtlasBookSnapshotCurrent(snapshotInput, currentIdentity) {
  const snapshot = verifyAtlasBookSnapshot(snapshotInput);
  assertExactDataObject(currentIdentity, CURRENT_IDENTITY_KEYS, 'E_ATLAS_BOOK_SNAPSHOT_CURRENT_IDENTITY_INVALID');
  const current = {
    projectId: assertIdentifier(currentIdentity.projectId, 'E_ATLAS_BOOK_SNAPSHOT_PROJECT_ID_INVALID', 200),
    projectRevisionId: assertDigest(currentIdentity.projectRevisionId, 'E_ATLAS_BOOK_SNAPSHOT_PROJECT_REVISION_INVALID'),
    manifestRevision: assertDigest(currentIdentity.manifestRevision, 'E_ATLAS_BOOK_SNAPSHOT_MANIFEST_REVISION_INVALID'),
    orderDigest: assertDigest(currentIdentity.orderDigest, 'E_ATLAS_BOOK_SNAPSHOT_ORDER_DIGEST_INVALID'),
    dependencyDigest: assertDigest(currentIdentity.dependencyDigest, 'E_ATLAS_BOOK_SNAPSHOT_DEPENDENCY_DIGEST_INVALID'),
  };
  const expected = currentIdentityFromSnapshot(snapshot);
  const checks = [
    ['projectId', 'PROJECT_CHANGED'],
    ['projectRevisionId', 'PROJECT_REVISION_CHANGED'],
    ['manifestRevision', 'MANIFEST_REVISION_CHANGED'],
    ['orderDigest', 'SCENE_ORDER_CHANGED'],
    ['dependencyDigest', 'DEPENDENCIES_CHANGED'],
  ];
  for (const [field, reason] of checks) {
    if (expected[field] !== current[field]) {
      return freezeDeep({
        ok: false,
        code: 'E_ATLAS_BOOK_SNAPSHOT_STALE',
        reason,
        snapshotId: snapshot.snapshotId,
      });
    }
  }
  return freezeDeep({
    ok: true,
    code: 'ATLAS_BOOK_SNAPSHOT_CURRENT',
    snapshotId: snapshot.snapshotId,
    identity: expected,
  });
}

export function assertAtlasBookSnapshotCurrent(snapshot, currentIdentity) {
  const result = assessAtlasBookSnapshotCurrent(snapshot, currentIdentity);
  if (!result.ok) fail(result.code, result.reason);
  return verifyAtlasBookSnapshot(snapshot);
}
