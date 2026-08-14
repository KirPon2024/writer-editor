import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG,
  BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS,
  BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES,
  buildBlackBoxCoreSourceSetV1,
  computeBlackBoxCoreSourceDigestV1,
  resolveBlackBoxCoreSourceAdapterFeatureFlag,
} from './blackBoxCoreSourceAdapterV1.mjs';
import {
  createDeterministicTreeNodeId,
  normalizeTreeBindingKey,
} from '../core/projectTreeIdentity.mjs';

export const BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_FEATURE_FLAG = BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG;

export const BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_SCHEMAS = Object.freeze({
  featureFlag: 'yalken.blackBoxTrustedSourceSnapshot.featureFlag.v1',
  request: 'yalken.blackBoxTrustedSourceSnapshot.request.v1',
  result: 'yalken.blackBoxTrustedSourceSnapshot.result.v1',
  revisionObservation: 'yalken.blackBoxTrustedSourceSnapshot.revisionObservation.v1',
});

export const BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES = Object.freeze({
  AUTHORITY_NOT_GRANTED: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_AUTHORITY_NOT_GRANTED',
  DIRTY_DOCUMENT_REJECTED: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_DIRTY_DOCUMENT_REJECTED',
  FEATURE_DISABLED: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_FEATURE_DISABLED',
  FIELD_INVALID: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_FIELD_INVALID',
  KEYSET_INVALID: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_KEYSET_INVALID',
  PROJECT_MANIFEST_REQUIRED: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_PROJECT_MANIFEST_REQUIRED',
  PROJECT_ROOT_UNSAFE: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_PROJECT_ROOT_UNSAFE',
  P0A_REJECTED: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_P0A_REJECTED',
  REVISION_OBSERVER_REQUIRED: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_REVISION_OBSERVER_REQUIRED',
  REVISION_STALE: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_REVISION_STALE',
  SOURCE_FILE_MISSING: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_FILE_MISSING',
  SOURCE_FILE_UNSUPPORTED: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_FILE_UNSUPPORTED',
  SOURCE_SNAPSHOT_READY: 'YALKEN_BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_READY',
});

const REQUEST_KEYS = Object.freeze(['expected', 'featureFlags', 'projectRoot', 'schemaVersion']);
const EXPECTED_KEYS = Object.freeze([
  'canonicalRevision',
  'documentId',
  'generation',
  'projectId',
  'rootId',
  'workingRevision',
]);
const OBSERVATION_KEYS = Object.freeze([
  'authority',
  'canonicalRevision',
  'dirtyState',
  'documentId',
  'generation',
  'projectId',
  'rootId',
  'schemaVersion',
  'workingRevision',
]);
const AUTHORITY_KEYS = Object.freeze(['decision', 'mayWrite', 'queryId']);
const AUTHORITY_DECISIONS = Object.freeze(['ALLOW', 'DENY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
const DIRTY_STATES = Object.freeze(['CLEAN', 'DIRTY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
const PROJECT_MANIFEST_BINDING_KEY = 'file:project.craftsman.json';
const PROJECT_MANIFEST_DOCUMENT_ID = 'project-manifest';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if ((isPlainObject(nested) || Array.isArray(nested)) && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function sortedKeys(value) {
  return isPlainObject(value) ? Object.keys(value).sort() : [];
}

function sameKeys(value, keys) {
  const actual = sortedKeys(value);
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function reason(code, field, expected, actual) {
  const out = { code, field };
  if (expected !== undefined) out.expected = expected;
  if (actual !== undefined) out.actual = actual;
  return Object.freeze(out);
}

function addKeysetReason(reasons, field, actual, expected) {
  reasons.push(reason(
    BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.KEYSET_INVALID,
    field,
    expected,
    sortedKeys(actual),
  ));
}

function normalizeIdentifier(value, { allowSlash = false } = {}) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value || /[\u0000-\u001F\\]/u.test(value)) return '';
  if (!allowSlash && value.includes('/')) return '';
  if (allowSlash) {
    if (value.startsWith('/')) return '';
    const segments = value.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return '';
  }
  return value;
}

function normalizeRevision(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value || /[\u0000-\u001F]/u.test(value)) return '';
  return value;
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex')}`;
}

function resolveFeature(featureFlags) {
  const adapterFeature = resolveBlackBoxCoreSourceAdapterFeatureFlag(isPlainObject(featureFlags) ? featureFlags : {});
  return deepFreeze({
    ...adapterFeature,
    schemaVersion: BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_SCHEMAS.featureFlag,
  });
}

export function resolveBlackBoxTrustedSourceSnapshotFeatureFlag(flags = {}) {
  return resolveFeature(flags);
}

function finish({ ok, code, reasons, request, startedAt, sourceSnapshot = null, sourceSet = null, rootRealPath = '' }) {
  const elapsedMs = Math.max(0, Number((performance.now() - startedAt).toFixed(3)));
  return deepFreeze({
    schemaVersion: BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_SCHEMAS.result,
    ok,
    decision: ok ? 'ALLOW' : 'DENY',
    code,
    reasons,
    feature: resolveFeature(request?.featureFlags),
    sourceSnapshot: ok ? sourceSnapshot : null,
    sourceSetDigest: ok && sourceSet ? sourceSet.sourceSetDigest : '',
    accounting: ok && sourceSet ? sourceSet.accounting : null,
    metrics: {
      elapsedMs,
      rssDeltaBytes: 0,
    },
    rootRealPath: ok ? rootRealPath : '',
    canWriteManuscript: false,
    canPublishCapsule: false,
    canRecoverProject: false,
    userDocumentsTouched: false,
  });
}

function validateExpected(reasons, expected) {
  if (!isPlainObject(expected)) {
    addKeysetReason(reasons, 'expected', expected, EXPECTED_KEYS);
    return null;
  }
  if (!sameKeys(expected, EXPECTED_KEYS)) addKeysetReason(reasons, 'expected', expected, EXPECTED_KEYS);
  for (const key of ['projectId', 'rootId']) {
    if (!normalizeIdentifier(expected[key])) {
      reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FIELD_INVALID, `expected.${key}`));
    }
  }
  if (!normalizeIdentifier(expected.documentId, { allowSlash: true })) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FIELD_INVALID, 'expected.documentId'));
  }
  for (const key of ['canonicalRevision', 'workingRevision', 'generation']) {
    if (!normalizeRevision(expected[key])) {
      reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FIELD_INVALID, `expected.${key}`));
    }
  }
  return {
    projectId: typeof expected.projectId === 'string' ? expected.projectId : '',
    rootId: typeof expected.rootId === 'string' ? expected.rootId : '',
    documentId: typeof expected.documentId === 'string' ? expected.documentId : '',
    canonicalRevision: typeof expected.canonicalRevision === 'string' ? expected.canonicalRevision : '',
    workingRevision: typeof expected.workingRevision === 'string' ? expected.workingRevision : '',
    generation: typeof expected.generation === 'string' ? expected.generation : '',
  };
}

function validateAuthority(reasons, field, authority) {
  if (!isPlainObject(authority)) {
    addKeysetReason(reasons, field, authority, AUTHORITY_KEYS);
    return;
  }
  if (!sameKeys(authority, AUTHORITY_KEYS)) addKeysetReason(reasons, field, authority, AUTHORITY_KEYS);
  if (!AUTHORITY_DECISIONS.includes(authority.decision)) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.AUTHORITY_NOT_GRANTED, `${field}.decision`));
  }
  if (authority.decision !== 'ALLOW' || authority.mayWrite !== false) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.AUTHORITY_NOT_GRANTED, field));
  }
  if (!normalizeIdentifier(authority.queryId)) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FIELD_INVALID, `${field}.queryId`));
  }
}

function validateObservation(reasons, field, observation, expected) {
  if (!isPlainObject(observation)) {
    addKeysetReason(reasons, field, observation, OBSERVATION_KEYS);
    return null;
  }
  if (!sameKeys(observation, OBSERVATION_KEYS)) addKeysetReason(reasons, field, observation, OBSERVATION_KEYS);
  if (observation.schemaVersion !== BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_SCHEMAS.revisionObservation) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FIELD_INVALID, `${field}.schemaVersion`));
  }
  validateAuthority(reasons, `${field}.authority`, observation.authority);
  if (!DIRTY_STATES.includes(observation.dirtyState) || observation.dirtyState !== 'CLEAN') {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.DIRTY_DOCUMENT_REJECTED, `${field}.dirtyState`, 'CLEAN', observation.dirtyState));
  }
  for (const key of ['projectId', 'rootId', 'documentId', 'canonicalRevision', 'workingRevision', 'generation']) {
    if (observation[key] !== expected[key]) {
      reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.REVISION_STALE, `${field}.${key}`, expected[key], observation[key]));
    }
  }
  return {
    schemaVersion: observation.schemaVersion,
    authority: observation.authority,
    projectId: typeof observation.projectId === 'string' ? observation.projectId : '',
    rootId: typeof observation.rootId === 'string' ? observation.rootId : '',
    documentId: typeof observation.documentId === 'string' ? observation.documentId : '',
    canonicalRevision: typeof observation.canonicalRevision === 'string' ? observation.canonicalRevision : '',
    workingRevision: typeof observation.workingRevision === 'string' ? observation.workingRevision : '',
    generation: typeof observation.generation === 'string' ? observation.generation : '',
    dirtyState: typeof observation.dirtyState === 'string' ? observation.dirtyState : '',
  };
}

function validateObservationStable(reasons, before, after) {
  if (!before || !after) return;
  for (const key of ['projectId', 'rootId', 'documentId', 'canonicalRevision', 'workingRevision', 'generation', 'dirtyState']) {
    if (before[key] !== after[key]) {
      reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.REVISION_STALE, `after.${key}`, before[key], after[key]));
    }
  }
  if (before.authority?.decision !== after.authority?.decision || before.authority?.mayWrite !== after.authority?.mayWrite) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.AUTHORITY_NOT_GRANTED, 'after.authority'));
  }
}

function realProjectRoot(reasons, projectRoot) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot) || /[\u0000-\u001F]/u.test(projectRoot)) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_ROOT_UNSAFE, 'projectRoot'));
    return '';
  }
  try {
    const stat = fs.statSync(projectRoot);
    if (!stat.isDirectory()) {
      reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_ROOT_UNSAFE, 'projectRoot'));
      return '';
    }
    return fs.realpathSync(projectRoot);
  } catch (error) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_ROOT_UNSAFE, 'projectRoot', 'READABLE_DIRECTORY', error.code || error.message));
    return '';
  }
}

function pathInside(rootRealPath, fullPath) {
  return fullPath === rootRealPath || fullPath.startsWith(`${rootRealPath}${path.sep}`);
}

function readFileForBinding(rootRealPath, bindingKey, field, reasons, { manifest = false } = {}) {
  const normalizedBindingKey = normalizeTreeBindingKey(bindingKey);
  if (!normalizedBindingKey || !normalizedBindingKey.startsWith('file:')) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.SOURCE_FILE_UNSUPPORTED, `${field}.bindingKey`));
    return null;
  }
  const relativePath = normalizedBindingKey.slice('file:'.length);
  const resolved = path.resolve(rootRealPath, relativePath);
  if (!pathInside(rootRealPath, resolved)) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.SOURCE_FILE_UNSUPPORTED, `${field}.bindingKey`));
    return null;
  }
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    reasons.push(reason(
      manifest
        ? BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_MANIFEST_REQUIRED
        : BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.SOURCE_FILE_MISSING,
      `${field}.path`,
      'READABLE_FILE',
      error.code || error.message,
    ));
    return null;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.SOURCE_FILE_UNSUPPORTED, `${field}.path`));
    return null;
  }
  let realFilePath = '';
  try {
    realFilePath = fs.realpathSync(resolved);
  } catch (error) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.SOURCE_FILE_UNSUPPORTED, `${field}.path`, 'REALPATH', error.code || error.message));
    return null;
  }
  if (!pathInside(rootRealPath, realFilePath)) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.SOURCE_FILE_UNSUPPORTED, `${field}.path`));
    return null;
  }
  try {
    const sourceText = fs.readFileSync(realFilePath, 'utf8');
    return { bindingKey: normalizedBindingKey, sourceText };
  } catch (error) {
    reasons.push(reason(
      manifest
        ? BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_MANIFEST_REQUIRED
        : BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.SOURCE_FILE_MISSING,
      `${field}.path`,
      'READABLE_UTF8_FILE',
      error.code || error.message,
    ));
    return null;
  }
}

function makeEntry({ kind, documentId, bindingKey, ordinal, sourceText, projectId, includeOrdinal = true }) {
  const base = {
    kind,
    documentId,
    bindingKey,
    treeNodeId: createDeterministicTreeNodeId(projectId, bindingKey),
    sourceText,
    sourceTextDigest: sha256Text(sourceText),
  };
  if (includeOrdinal) base.ordinal = ordinal;
  return base;
}

function parseProjectManifest(rootRealPath, expected, reasons) {
  const manifestFile = readFileForBinding(rootRealPath, PROJECT_MANIFEST_BINDING_KEY, 'manifest', reasons, { manifest: true });
  if (!manifestFile) return null;
  let manifestObject;
  try {
    manifestObject = JSON.parse(manifestFile.sourceText);
  } catch {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_MANIFEST_REQUIRED, 'manifest.sourceText'));
    return null;
  }
  if (!isPlainObject(manifestObject)) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_MANIFEST_REQUIRED, 'manifest.sourceText'));
    return null;
  }
  if (manifestObject.projectId !== expected.projectId) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.REVISION_STALE, 'manifest.projectId', expected.projectId, manifestObject.projectId));
  }
  if (manifestObject.rootId !== expected.rootId) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.REVISION_STALE, 'manifest.rootId', expected.rootId, manifestObject.rootId));
  }
  if (!Array.isArray(manifestObject.sceneOrder)) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_MANIFEST_REQUIRED, 'manifest.sceneOrder'));
  }
  if (manifestObject.scenes !== undefined && !isPlainObject(manifestObject.scenes)) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_MANIFEST_REQUIRED, 'manifest.scenes'));
  }
  return {
    manifestObject,
    manifestEntry: makeEntry({
      kind: 'PROJECT_MANIFEST',
      documentId: PROJECT_MANIFEST_DOCUMENT_ID,
      bindingKey: PROJECT_MANIFEST_BINDING_KEY,
      ordinal: 0,
      sourceText: manifestFile.sourceText,
      projectId: expected.projectId,
      includeOrdinal: false,
    }),
  };
}

function readOrderedManifestFiles({ rootRealPath, manifestObject, expected, orderKey, tableKeys, kind, reasons, ordinalStart }) {
  const order = manifestObject[orderKey];
  if (order === undefined) return [];
  if (!Array.isArray(order)) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_MANIFEST_REQUIRED, `manifest.${orderKey}`));
    return [];
  }
  if (order.length === 0) return [];
  const table = tableKeys
    .map((key) => manifestObject[key])
    .find((candidate) => isPlainObject(candidate));
  if (!table) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.SOURCE_FILE_UNSUPPORTED, `manifest.${orderKey}`));
    return [];
  }
  const entries = [];
  const seen = new Set();
  for (let index = 0; index < order.length; index += 1) {
    const documentId = order[index];
    const field = `manifest.${orderKey}.${index}`;
    if (!normalizeIdentifier(documentId, { allowSlash: true }) || seen.has(documentId)) {
      reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FIELD_INVALID, field));
      continue;
    }
    seen.add(documentId);
    const descriptor = table[documentId];
    if (!isPlainObject(descriptor) || typeof descriptor.bindingKey !== 'string') {
      reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.SOURCE_FILE_UNSUPPORTED, `${field}.bindingKey`));
      continue;
    }
    const file = readFileForBinding(rootRealPath, descriptor.bindingKey, field, reasons);
    if (!file) continue;
    entries.push(makeEntry({
      kind,
      documentId,
      bindingKey: file.bindingKey,
      ordinal: ordinalStart + entries.length,
      sourceText: file.sourceText,
      projectId: expected.projectId,
    }));
  }
  return entries;
}

function buildCoreFromDisk(rootRealPath, expected, reasons) {
  const parsed = parseProjectManifest(rootRealPath, expected, reasons);
  if (!parsed) return null;
  const { manifestObject, manifestEntry } = parsed;
  const sceneItems = readOrderedManifestFiles({
    rootRealPath,
    manifestObject,
    expected,
    orderKey: 'sceneOrder',
    tableKeys: ['scenes'],
    kind: 'SCENE_DOCUMENT',
    reasons,
    ordinalStart: 0,
  });
  const noteItems = readOrderedManifestFiles({
    rootRealPath,
    manifestObject,
    expected,
    orderKey: 'notesOrder',
    tableKeys: ['notes'],
    kind: 'NOTES_DOCUMENT',
    reasons,
    ordinalStart: sceneItems.length,
  });
  const historyItems = readOrderedManifestFiles({
    rootRealPath,
    manifestObject,
    expected,
    orderKey: 'historyOrder',
    tableKeys: ['history', 'histories'],
    kind: 'HISTORY_DOCUMENT',
    reasons,
    ordinalStart: sceneItems.length + noteItems.length,
  });
  const items = [...sceneItems, ...noteItems, ...historyItems];
  return {
    schemaVersion: BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.coreSnapshot,
    manifest: manifestEntry,
    items,
    expectedCounts: {
      projectManifest: 1,
      sceneDocuments: sceneItems.length,
      notesDocuments: noteItems.length,
      historyDocuments: historyItems.length,
      totalItems: 1 + items.length,
    },
  };
}

async function observeRevision(options, phase, request, expected) {
  if (typeof options.observeRevision !== 'function') return null;
  return options.observeRevision({
    schemaVersion: BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_SCHEMAS.revisionObservation,
    phase,
    projectRoot: request.projectRoot,
    expected: { ...expected },
  });
}

function firstCode(reasons, fallback) {
  return reasons[0]?.code || fallback;
}

export async function buildBlackBoxTrustedSourceSnapshotV1(request = {}, options = {}) {
  const startedAt = performance.now();
  const reasons = [];

  if (!isPlainObject(request)) {
    addKeysetReason(reasons, 'request', request, REQUEST_KEYS);
    return finish({ ok: false, code: BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.KEYSET_INVALID, reasons, request, startedAt });
  }
  if (!sameKeys(request, REQUEST_KEYS)) addKeysetReason(reasons, 'request', request, REQUEST_KEYS);
  if (request.schemaVersion !== BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_SCHEMAS.request) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FIELD_INVALID, 'schemaVersion'));
  }
  const expected = validateExpected(reasons, request.expected);
  if (reasons.some((entry) => entry.code === BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.KEYSET_INVALID)) {
    return finish({ ok: false, code: BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.KEYSET_INVALID, reasons, request, startedAt });
  }
  if (!expected || reasons.some((entry) => entry.code === BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FIELD_INVALID)) {
    return finish({ ok: false, code: firstCode(reasons, BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FIELD_INVALID), reasons, request, startedAt });
  }

  const feature = resolveFeature(request.featureFlags);
  if (!feature.enabled) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FEATURE_DISABLED, 'featureFlags'));
    return finish({ ok: false, code: BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.FEATURE_DISABLED, reasons, request, startedAt });
  }
  if (typeof options.observeRevision !== 'function') {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.REVISION_OBSERVER_REQUIRED, 'options.observeRevision'));
    return finish({ ok: false, code: BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.REVISION_OBSERVER_REQUIRED, reasons, request, startedAt });
  }

  const rootRealPath = realProjectRoot(reasons, request.projectRoot);
  if (!rootRealPath) {
    return finish({ ok: false, code: BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_ROOT_UNSAFE, reasons, request, startedAt });
  }

  const beforeRaw = await observeRevision(options, 'before', request, expected);
  const before = validateObservation(reasons, 'before', beforeRaw, expected);
  if (reasons.length > 0) {
    return finish({ ok: false, code: firstCode(reasons, BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.REVISION_STALE), reasons, request, startedAt });
  }

  const core = buildCoreFromDisk(rootRealPath, expected, reasons);
  if (!core || reasons.length > 0) {
    return finish({ ok: false, code: firstCode(reasons, BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.PROJECT_MANIFEST_REQUIRED), reasons, request, startedAt });
  }

  const afterRaw = await observeRevision(options, 'after', request, expected);
  const after = validateObservation(reasons, 'after', afterRaw, expected);
  validateObservationStable(reasons, before, after);
  if (reasons.length > 0) {
    return finish({ ok: false, code: firstCode(reasons, BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.REVISION_STALE), reasons, request, startedAt });
  }

  const digestBinding = { ...expected, sourceDigest: `sha256:${'0'.repeat(64)}` };
  const sourceDigest = computeBlackBoxCoreSourceDigestV1(core, digestBinding);
  const sourceBinding = {
    ...expected,
    sourceDigest,
  };
  const sourceSnapshot = {
    schemaVersion: BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.sourceSnapshot,
    authority: {
      decision: 'ALLOW',
      mayWrite: false,
      queryId: after.authority.queryId,
    },
    expected: sourceBinding,
    current: {
      ...sourceBinding,
      dirtyState: after.dirtyState,
    },
    core,
  };
  const sourceSet = buildBlackBoxCoreSourceSetV1({
    schemaVersion: BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.request,
    featureFlags: request.featureFlags,
    sourceSnapshot,
  });
  if (sourceSet.ok !== true || sourceSet.code !== BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_SOURCE_SET_READY) {
    reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.P0A_REJECTED, 'sourceSnapshot', BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_SOURCE_SET_READY, sourceSet.code));
    for (const sourceReason of sourceSet.reasons || []) {
      reasons.push(reason(BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.P0A_REJECTED, sourceReason.field, sourceReason.expected, sourceReason.actual));
    }
    return finish({ ok: false, code: BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.P0A_REJECTED, reasons, request, startedAt });
  }

  return finish({
    ok: true,
    code: BLACK_BOX_TRUSTED_SOURCE_SNAPSHOT_V1_CODES.SOURCE_SNAPSHOT_READY,
    reasons: [],
    request,
    startedAt,
    sourceSnapshot,
    sourceSet,
    rootRealPath,
  });
}
