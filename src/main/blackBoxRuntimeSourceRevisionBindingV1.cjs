'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_SCHEMA = 'yalken.blackBoxRuntimeSourceRevisionBinding.v1';
const BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_OBSERVATION_SCHEMA =
  'yalken.blackBoxTrustedSourceSnapshot.revisionObservation.v1';
const BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_QUERY_ID =
  'query.blackBoxProductCommandExportManualCore.readSourceSnapshot.v1';
const BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_DOCUMENT_ID = 'black-box-core';
const PROJECT_MANIFEST_BINDING_KEY = 'file:project.craftsman.json';
const ZERO_REVISION = `sha256:${'0'.repeat(64)}`;
const VALID_AUTHORITY_DECISION = Object.freeze({
  decision: 'ALLOW',
  mayWrite: false,
  queryId: BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_QUERY_ID,
});
const UNKNOWN_AUTHORITY_DECISION = Object.freeze({
  decision: 'UNKNOWN',
  mayWrite: false,
  queryId: BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_QUERY_ID,
});

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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Stable(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex')}`;
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

function normalizeBindingKey(value) {
  if (typeof value !== 'string') return '';
  const bindingKey = value.trim().replace(/\\/gu, '/');
  if (
    !bindingKey
    || bindingKey !== value
    || bindingKey.length > 1024
    || /[\u0000-\u001F]/u.test(bindingKey)
    || !bindingKey.startsWith('file:')
  ) {
    return '';
  }
  const relativePath = bindingKey.slice('file:'.length);
  const segments = relativePath.split('/');
  if (
    !relativePath
    || relativePath.startsWith('/')
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return '';
  }
  return bindingKey;
}

function normalizeRoot(projectRoot, fsImpl = fs, pathModule = path) {
  if (typeof projectRoot !== 'string' || !pathModule.isAbsolute(projectRoot) || /[\u0000-\u001F]/u.test(projectRoot)) {
    return '';
  }
  try {
    const stat = fsImpl.statSync(projectRoot);
    if (!stat.isDirectory()) return '';
    return fsImpl.realpathSync(projectRoot);
  } catch {
    return '';
  }
}

function isInsidePath(rootRealPath, filePath, pathModule = path) {
  return filePath === rootRealPath || filePath.startsWith(`${rootRealPath}${pathModule.sep}`);
}

function readFileBinding({ rootRealPath, bindingKey, fsImpl = fs, pathModule = path }) {
  const normalizedBindingKey = normalizeBindingKey(bindingKey);
  if (!normalizedBindingKey) return { ok: false, code: 'SOURCE_BINDING_KEY_INVALID' };
  const relativePath = normalizedBindingKey.slice('file:'.length);
  const resolved = pathModule.resolve(rootRealPath, relativePath);
  if (!isInsidePath(rootRealPath, resolved, pathModule)) return { ok: false, code: 'SOURCE_BINDING_PATH_OUTSIDE_ROOT' };
  try {
    const stat = fsImpl.lstatSync(resolved);
    if (stat.isSymbolicLink() || !stat.isFile()) return { ok: false, code: 'SOURCE_BINDING_FILE_UNSUPPORTED' };
    const realPath = fsImpl.realpathSync(resolved);
    if (!isInsidePath(rootRealPath, realPath, pathModule)) return { ok: false, code: 'SOURCE_BINDING_REALPATH_OUTSIDE_ROOT' };
    return {
      ok: true,
      bindingKey: normalizedBindingKey,
      sourceText: fsImpl.readFileSync(realPath, 'utf8'),
    };
  } catch (error) {
    return { ok: false, code: 'SOURCE_BINDING_FILE_UNREADABLE', detail: error?.code || error?.message || 'UNKNOWN' };
  }
}

function normalizeProjectTreeRootId(projectTree) {
  if (normalizeIdentifier(projectTree?.rootId)) return projectTree.rootId;
  if (Array.isArray(projectTree?.roots)) {
    for (const root of projectTree.roots) {
      if (normalizeIdentifier(root?.rootId)) return root.rootId;
    }
  }
  if (isPlainObject(projectTree?.roots)) {
    for (const root of Object.values(projectTree.roots)) {
      if (normalizeIdentifier(root?.rootId)) return root.rootId;
    }
  }
  return '';
}

function readManifest(rootRealPath, options = {}) {
  const manifestFile = readFileBinding({
    rootRealPath,
    bindingKey: PROJECT_MANIFEST_BINDING_KEY,
    fsImpl: options.fsImpl,
    pathModule: options.pathModule,
  });
  if (!manifestFile.ok) return { ok: false, code: 'PROJECT_MANIFEST_UNREADABLE', detail: manifestFile.code };
  try {
    const manifest = JSON.parse(manifestFile.sourceText);
    if (!isPlainObject(manifest)) return { ok: false, code: 'PROJECT_MANIFEST_OBJECT_REQUIRED' };
    return { ok: true, manifest, manifestFile };
  } catch {
    return { ok: false, code: 'PROJECT_MANIFEST_JSON_INVALID' };
  }
}

function readOrderedManifestFiles({ rootRealPath, manifest, orderKey, tableKeys, kind, ordinalStart, fsImpl, pathModule }) {
  const order = manifest[orderKey];
  if (order === undefined) return { ok: true, entries: [] };
  if (!Array.isArray(order)) return { ok: false, code: `PROJECT_MANIFEST_${orderKey}_INVALID`, entries: [] };
  const table = tableKeys.map((key) => manifest[key]).find((candidate) => isPlainObject(candidate));
  if (order.length > 0 && !table) return { ok: false, code: `PROJECT_MANIFEST_${orderKey}_TABLE_MISSING`, entries: [] };

  const entries = [];
  const seen = new Set();
  for (let index = 0; index < order.length; index += 1) {
    const documentId = order[index];
    if (!normalizeIdentifier(documentId, { allowSlash: true }) || seen.has(documentId)) {
      return { ok: false, code: `PROJECT_MANIFEST_${orderKey}_DOCUMENT_ID_INVALID`, entries };
    }
    seen.add(documentId);
    const descriptor = table[documentId];
    if (!isPlainObject(descriptor) || typeof descriptor.bindingKey !== 'string') {
      return { ok: false, code: `PROJECT_MANIFEST_${orderKey}_BINDING_MISSING`, entries };
    }
    const file = readFileBinding({ rootRealPath, bindingKey: descriptor.bindingKey, fsImpl, pathModule });
    if (!file.ok) return { ok: false, code: file.code, entries };
    entries.push({
      kind,
      documentId,
      bindingKey: file.bindingKey,
      ordinal: ordinalStart + entries.length,
      sourceTextDigest: sha256Stable({ sourceText: file.sourceText }),
    });
  }
  return { ok: true, entries };
}

function computeRuntimeSourceRevision(options = {}) {
  const fsImpl = options.fsImpl || fs;
  const pathModule = options.pathModule || path;
  const rootRealPath = normalizeRoot(options.projectRoot, fsImpl, pathModule);
  if (!rootRealPath) return { ok: false, code: 'PROJECT_ROOT_UNAVAILABLE' };

  const parsed = readManifest(rootRealPath, { fsImpl, pathModule });
  if (!parsed.ok) return { ok: false, code: parsed.code, rootRealPath };
  const { manifest, manifestFile } = parsed;
  const projectId = normalizeIdentifier(manifest.projectId) || normalizeIdentifier(options.projectTree?.projectId);
  const rootId = normalizeIdentifier(manifest.rootId) || normalizeProjectTreeRootId(options.projectTree);
  if (!projectId) return { ok: false, code: 'PROJECT_ID_UNAVAILABLE', rootRealPath };
  if (!rootId) return { ok: false, code: 'ROOT_ID_UNAVAILABLE', rootRealPath, projectId };
  if (normalizeIdentifier(options.projectTree?.projectId) && options.projectTree.projectId !== projectId) {
    return { ok: false, code: 'PROJECT_ID_MISMATCH', rootRealPath, projectId, rootId };
  }
  const projectTreeRootId = normalizeProjectTreeRootId(options.projectTree);
  if (projectTreeRootId && projectTreeRootId !== rootId) {
    return { ok: false, code: 'ROOT_ID_MISMATCH', rootRealPath, projectId, rootId };
  }

  const sceneItems = readOrderedManifestFiles({
    rootRealPath,
    manifest,
    orderKey: 'sceneOrder',
    tableKeys: ['scenes'],
    kind: 'SCENE_DOCUMENT',
    ordinalStart: 0,
    fsImpl,
    pathModule,
  });
  if (!sceneItems.ok) return { ok: false, code: sceneItems.code, rootRealPath, projectId, rootId };

  const noteItems = readOrderedManifestFiles({
    rootRealPath,
    manifest,
    orderKey: 'notesOrder',
    tableKeys: ['notes'],
    kind: 'NOTES_DOCUMENT',
    ordinalStart: sceneItems.entries.length,
    fsImpl,
    pathModule,
  });
  if (!noteItems.ok) return { ok: false, code: noteItems.code, rootRealPath, projectId, rootId };

  const historyItems = readOrderedManifestFiles({
    rootRealPath,
    manifest,
    orderKey: 'historyOrder',
    tableKeys: ['history', 'histories'],
    kind: 'HISTORY_DOCUMENT',
    ordinalStart: sceneItems.entries.length + noteItems.entries.length,
    fsImpl,
    pathModule,
  });
  if (!historyItems.ok) return { ok: false, code: historyItems.code, rootRealPath, projectId, rootId };

  const revision = sha256Stable({
    schemaVersion: BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_SCHEMA,
    projectId,
    rootId,
    documentId: BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_DOCUMENT_ID,
    manifest: {
      bindingKey: manifestFile.bindingKey,
      sourceTextDigest: sha256Stable({ sourceText: manifestFile.sourceText }),
    },
    items: [...sceneItems.entries, ...noteItems.entries, ...historyItems.entries],
  });
  return {
    ok: true,
    rootRealPath,
    projectId,
    rootId,
    documentId: BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_DOCUMENT_ID,
    revision,
  };
}

function readBoolean(value) {
  if (typeof value === 'function') return value() === true;
  return value === true;
}

function makeExpected(source) {
  const projectId = normalizeIdentifier(source?.projectId) || 'project-unavailable';
  const rootId = normalizeIdentifier(source?.rootId) || 'root-unavailable';
  const revision = typeof source?.revision === 'string' && /^sha256:[a-f0-9]{64}$/u.test(source.revision)
    ? source.revision
    : ZERO_REVISION;
  return deepFreeze({
    projectId,
    rootId,
    documentId: BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_DOCUMENT_ID,
    canonicalRevision: revision,
    workingRevision: revision,
    generation: revision,
  });
}

function makeObservation({ source, expected, authority, dirtyState }) {
  const revision = typeof source?.revision === 'string' && /^sha256:[a-f0-9]{64}$/u.test(source.revision)
    ? source.revision
    : ZERO_REVISION;
  return deepFreeze({
    schemaVersion: BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_OBSERVATION_SCHEMA,
    authority,
    projectId: normalizeIdentifier(source?.projectId) || expected.projectId,
    rootId: normalizeIdentifier(source?.rootId) || expected.rootId,
    documentId: BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_DOCUMENT_ID,
    canonicalRevision: revision,
    workingRevision: revision,
    generation: revision,
    dirtyState,
  });
}

function createBlackBoxRuntimeSourceRevisionBindingV1(options = {}) {
  const initialSource = computeRuntimeSourceRevision(options);
  const expected = makeExpected(initialSource);
  const initialDirty = readBoolean(options.isDirty) || readBoolean(options.autoSaveInProgress);
  const ok = initialSource.ok === true && initialDirty === false;

  function observeRevision(input = {}) {
    const currentExpected = isPlainObject(input.expected) ? input.expected : expected;
    const currentDirty = readBoolean(options.isDirty) || readBoolean(options.autoSaveInProgress);
    const source = computeRuntimeSourceRevision(options);
    if (!source.ok) {
      return makeObservation({
        source,
        expected: currentExpected,
        authority: UNKNOWN_AUTHORITY_DECISION,
        dirtyState: 'UNKNOWN',
      });
    }
    return makeObservation({
      source,
      expected: currentExpected,
      authority: VALID_AUTHORITY_DECISION,
      dirtyState: currentDirty ? 'DIRTY' : 'CLEAN',
    });
  }

  return deepFreeze({
    schemaVersion: BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_SCHEMA,
    ok,
    expected,
    reasons: initialSource.ok
      ? (initialDirty ? [{ code: 'DIRTY_DOCUMENT_REJECTED', field: 'dirtyState' }] : [])
      : [{ code: initialSource.code || 'RUNTIME_SOURCE_REVISION_UNAVAILABLE', field: 'source' }],
    observeRevision,
  });
}

module.exports = {
  BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_DOCUMENT_ID,
  BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1_QUERY_ID,
  createBlackBoxRuntimeSourceRevisionBindingV1,
  computeRuntimeSourceRevision,
};
