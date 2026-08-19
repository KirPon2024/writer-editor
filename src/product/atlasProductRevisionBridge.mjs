import crypto from 'node:crypto';

import projectIdDomain from './projectIdDomain.cjs';

const { normalizeProjectId } = projectIdDomain;

export const ATLAS_PRODUCT_REVISION_BRIDGE_SCHEMA_VERSION =
  'yalken.atlas.productRevisionBridge.v1';

export const ATLAS_PRODUCT_REVISION_SCOPES = Object.freeze({
  CURRENT_SCENE: 'CURRENT_SCENE',
  WHOLE_PROJECT: 'WHOLE_PROJECT',
});

export const ATLAS_PRODUCT_REVISION_BRIDGE_ERROR_CODE =
  'E_ATLAS_PRODUCT_REVISION_BRIDGE_INVALID';

const PROJECT_REVISION_DOMAIN = 'yalken.atlas.projectRevision.v1';
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SCENE_ID_PATTERN = /^tree-node-[a-f0-9]{32}$/u;
const INPUT_KEYS = Object.freeze([
  'manifestRevision',
  'projectId',
  'revisionScope',
  'sceneOrder',
  'scenesById',
]);
const SCENE_RECORD_KEYS = Object.freeze([
  'sceneId',
  'sceneRevision',
  'text',
  'title',
]);
const REVISION_SCOPE_SET = new Set(Object.values(ATLAS_PRODUCT_REVISION_SCOPES));

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) return false;
  const actual = ownKeys.sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function hasOnlyDataProperties(value, keys) {
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor
      && descriptor.enumerable === true
      && Object.prototype.hasOwnProperty.call(descriptor, 'value');
  });
}

function isDenseDataArray(value) {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length !== 0) return false;
  const ownNames = Object.getOwnPropertyNames(value);
  if (ownNames.length !== value.length + 1 || !ownNames.includes('length')) return false;
  const ownNameSet = new Set(ownNames);
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    if (!ownNameSet.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor
      || descriptor.enumerable !== true
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) return false;
  }
  return true;
}

function isValidProjectId(value) {
  return typeof value === 'string'
    && normalizeProjectId(value) === value;
}

function isValidDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function isValidSceneId(value) {
  return typeof value === 'string' && SCENE_ID_PATTERN.test(value);
}

function freezeDeep(value) {
  if (!Array.isArray(value) && !isPlainObject(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function invalid(reason, details = null) {
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: ATLAS_PRODUCT_REVISION_BRIDGE_ERROR_CODE,
      reason,
      ...(isPlainObject(details) ? { details: Object.freeze({ ...details }) } : {}),
    }),
  });
}

function fieldDetails(field) {
  return { field };
}

function updateCanonicalRevisionField(hasher, label, value) {
  // Fixed field order plus UTF-8 byte lengths is the canonical stream framing;
  // delimiters inside author-controlled titles cannot create ambiguous inputs.
  const text = String(value);
  hasher.update(label, 'utf8');
  hasher.update(':', 'utf8');
  hasher.update(String(Buffer.byteLength(text, 'utf8')), 'utf8');
  hasher.update(':', 'utf8');
  hasher.update(text, 'utf8');
  hasher.update('\n', 'utf8');
}

export function buildAtlasProductRevisionBridge(input) {
  if (!isPlainObject(input)) {
    return invalid('INPUT_OBJECT_REQUIRED');
  }
  if (!sameKeys(input, INPUT_KEYS)) {
    return invalid('INPUT_KEYSET_INVALID', fieldDetails('input'));
  }
  if (!hasOnlyDataProperties(input, INPUT_KEYS)) {
    return invalid('INPUT_PROPERTY_DESCRIPTOR_INVALID', fieldDetails('input'));
  }
  if (!isValidProjectId(input.projectId)) {
    return invalid('PROJECT_ID_INVALID', fieldDetails('projectId'));
  }
  if (!REVISION_SCOPE_SET.has(input.revisionScope)) {
    return invalid('REVISION_SCOPE_INVALID', fieldDetails('revisionScope'));
  }
  if (!isValidDigest(input.manifestRevision)) {
    return invalid('MANIFEST_REVISION_INVALID', fieldDetails('manifestRevision'));
  }
  if (!Array.isArray(input.sceneOrder)) {
    return invalid('SCENE_ORDER_ARRAY_REQUIRED', fieldDetails('sceneOrder'));
  }
  if (!isDenseDataArray(input.sceneOrder)) {
    return invalid('SCENE_ORDER_STRUCTURE_INVALID', fieldDetails('sceneOrder'));
  }
  if (!isPlainObject(input.scenesById)) {
    return invalid('SCENES_BY_ID_OBJECT_REQUIRED', fieldDetails('scenesById'));
  }

  const sceneOwnKeys = Reflect.ownKeys(input.scenesById);
  if (sceneOwnKeys.some((sceneId) => typeof sceneId !== 'string')) {
    return invalid('SCENE_ID_INVALID', fieldDetails('scenesById'));
  }
  const sceneKeys = sceneOwnKeys;
  if (sceneKeys.some((sceneId) => !isValidSceneId(sceneId))) {
    return invalid('SCENE_ID_INVALID', fieldDetails('scenesById'));
  }
  if (!hasOnlyDataProperties(input.scenesById, sceneKeys)) {
    return invalid('SCENES_BY_ID_PROPERTY_DESCRIPTOR_INVALID', fieldDetails('scenesById'));
  }
  for (let index = 0; index < input.sceneOrder.length; index += 1) {
    if (!isValidSceneId(input.sceneOrder[index])) {
      return invalid('SCENE_ID_INVALID', fieldDetails(`sceneOrder[${index}]`));
    }
  }

  const orderedSceneIds = new Set(input.sceneOrder);
  const exactCoverage = input.sceneOrder.length === sceneKeys.length
    && orderedSceneIds.size === sceneKeys.length
    && input.sceneOrder.every((sceneId) => (
      Object.prototype.hasOwnProperty.call(input.scenesById, sceneId)
    ));
  if (!exactCoverage) {
    return invalid('SCENE_ORDER_EXACT_COVERAGE_REQUIRED', {
      field: 'sceneOrder',
      orderedSceneCount: input.sceneOrder.length,
      sceneRecordCount: sceneKeys.length,
    });
  }
  if (
    input.revisionScope === ATLAS_PRODUCT_REVISION_SCOPES.CURRENT_SCENE
    && input.sceneOrder.length !== 1
  ) {
    return invalid('CURRENT_SCENE_EXACTLY_ONE_SCENE_REQUIRED', {
      field: 'sceneOrder',
      orderedSceneCount: input.sceneOrder.length,
    });
  }

  const scenesById = {};
  const projectRevisionHasher = crypto.createHash('sha256');
  updateCanonicalRevisionField(projectRevisionHasher, 'domain', PROJECT_REVISION_DOMAIN);
  updateCanonicalRevisionField(
    projectRevisionHasher,
    'schemaVersion',
    ATLAS_PRODUCT_REVISION_BRIDGE_SCHEMA_VERSION,
  );
  updateCanonicalRevisionField(projectRevisionHasher, 'projectId', input.projectId);
  updateCanonicalRevisionField(projectRevisionHasher, 'revisionScope', input.revisionScope);
  updateCanonicalRevisionField(projectRevisionHasher, 'manifestRevision', input.manifestRevision);
  updateCanonicalRevisionField(projectRevisionHasher, 'sceneCount', input.sceneOrder.length);
  for (const sceneId of input.sceneOrder) {
    const record = input.scenesById[sceneId];
    if (!sameKeys(record, SCENE_RECORD_KEYS)) {
      return invalid('SCENE_RECORD_KEYSET_INVALID', fieldDetails(`scenesById.${sceneId}`));
    }
    if (!hasOnlyDataProperties(record, SCENE_RECORD_KEYS)) {
      return invalid(
        'SCENE_RECORD_PROPERTY_DESCRIPTOR_INVALID',
        fieldDetails(`scenesById.${sceneId}`),
      );
    }
    if (record.sceneId !== sceneId) {
      return invalid('SCENE_RECORD_ID_MISMATCH', fieldDetails(`scenesById.${sceneId}.sceneId`));
    }
    if (typeof record.title !== 'string') {
      return invalid('SCENE_TITLE_INVALID', fieldDetails(`scenesById.${sceneId}.title`));
    }
    if (typeof record.text !== 'string') {
      return invalid('SCENE_TEXT_INVALID', fieldDetails(`scenesById.${sceneId}.text`));
    }
    if (!isValidDigest(record.sceneRevision)) {
      return invalid('SCENE_REVISION_INVALID', fieldDetails(`scenesById.${sceneId}.sceneRevision`));
    }

    scenesById[sceneId] = {
      sceneId,
      title: record.title,
      text: record.text,
      sceneRevision: record.sceneRevision,
    };
    updateCanonicalRevisionField(projectRevisionHasher, 'sceneId', sceneId);
    updateCanonicalRevisionField(projectRevisionHasher, 'sceneTitle', record.title);
    updateCanonicalRevisionField(projectRevisionHasher, 'sceneRevision', record.sceneRevision);
  }

  const projectRevisionId = `sha256:${projectRevisionHasher.digest('hex')}`;

  return Object.freeze({
    ok: true,
    value: freezeDeep({
      schemaVersion: ATLAS_PRODUCT_REVISION_BRIDGE_SCHEMA_VERSION,
      revisionScope: input.revisionScope,
      projectId: input.projectId,
      projectRevisionId,
      manifestRevision: input.manifestRevision,
      sceneOrder: input.sceneOrder.slice(),
      scenesById,
    }),
  });
}
