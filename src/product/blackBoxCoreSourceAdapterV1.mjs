import crypto from 'node:crypto';

import {
  createSourceFenceTokenV1,
  evaluateSourceFenceV1,
  SOURCE_FENCE_V1_CODES,
  SOURCE_FENCE_V1_SCHEMAS,
} from './sourceFenceV1.mjs';
import {
  createDeterministicTreeNodeId,
  normalizeTreeBindingKey,
} from '../core/projectTreeIdentity.mjs';

export const BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG = 'yalken.blackBox.coreSourceAdapter.p0aV1';

export const BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS = Object.freeze({
  coreSnapshot: 'yalken.blackBoxCoreSourceAdapter.coreSnapshot.v1',
  featureFlag: 'yalken.blackBoxCoreSourceAdapter.featureFlag.v1',
  request: 'yalken.blackBoxCoreSourceAdapter.request.v1',
  sourceSet: 'yalken.blackBoxCoreSourceAdapter.sourceSet.v1',
  sourceSnapshot: 'yalken.blackBoxCoreSourceAdapter.sourceSnapshot.v1',
});

export const BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES = Object.freeze({
  CORE_ACCOUNTING_MISMATCH: 'YALKEN_BLACK_BOX_CORE_ACCOUNTING_MISMATCH',
  CORE_ITEM_UNSUPPORTED: 'YALKEN_BLACK_BOX_CORE_ITEM_UNSUPPORTED',
  CORE_MANIFEST_REQUIRED: 'YALKEN_BLACK_BOX_CORE_MANIFEST_REQUIRED',
  CORE_SOURCE_SET_READY: 'YALKEN_BLACK_BOX_CORE_SOURCE_SET_READY',
  FEATURE_DISABLED: 'YALKEN_BLACK_BOX_FEATURE_DISABLED',
  FIELD_INVALID: 'YALKEN_BLACK_BOX_FIELD_INVALID',
  KEYSET_INVALID: 'YALKEN_BLACK_BOX_KEYSET_INVALID',
  SOURCE_BINDING_MISMATCH: 'YALKEN_BLACK_BOX_SOURCE_BINDING_MISMATCH',
  SOURCE_FENCE_REJECTED: 'YALKEN_BLACK_BOX_SOURCE_FENCE_REJECTED',
});

const REQUEST_KEYS = Object.freeze(['featureFlags', 'schemaVersion', 'sourceSnapshot']);
const SOURCE_SNAPSHOT_KEYS = Object.freeze(['authority', 'core', 'current', 'expected', 'schemaVersion']);
const SOURCE_SNAPSHOT_AUTHORITY_KEYS = Object.freeze(['decision', 'mayWrite', 'queryId']);
const SOURCE_BINDING_KEYS = Object.freeze([
  'canonicalRevision',
  'documentId',
  'generation',
  'projectId',
  'rootId',
  'sourceDigest',
  'workingRevision',
]);
const SOURCE_CURRENT_KEYS = Object.freeze([
  'canonicalRevision',
  'dirtyState',
  'documentId',
  'generation',
  'projectId',
  'rootId',
  'sourceDigest',
  'workingRevision',
]);
const CORE_SNAPSHOT_KEYS = Object.freeze(['expectedCounts', 'items', 'manifest', 'schemaVersion']);
const CORE_COUNTS_KEYS = Object.freeze([
  'historyDocuments',
  'notesDocuments',
  'projectManifest',
  'sceneDocuments',
  'totalItems',
]);
const CORE_MANIFEST_ENTRY_KEYS = Object.freeze([
  'bindingKey',
  'documentId',
  'kind',
  'sourceText',
  'sourceTextDigest',
  'treeNodeId',
]);
const CORE_ITEM_KEYS = Object.freeze([
  'bindingKey',
  'documentId',
  'kind',
  'ordinal',
  'sourceText',
  'sourceTextDigest',
  'treeNodeId',
]);
const SOURCE_SNAPSHOT_AUTHORITY_DECISIONS = Object.freeze(['ALLOW', 'DENY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
const DIRTY_STATES = Object.freeze(['CLEAN', 'DIRTY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
const SUPPORTED_ITEM_KINDS = Object.freeze(['SCENE_DOCUMENT', 'NOTES_DOCUMENT', 'HISTORY_DOCUMENT']);
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex')}`;
}

function sha256Stable(value) {
  return sha256Text(stableJson(value));
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
    BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.KEYSET_INVALID,
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

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function normalizeSourceBinding(sourceBinding) {
  if (!isPlainObject(sourceBinding)) return null;
  return {
    projectId: typeof sourceBinding.projectId === 'string' ? sourceBinding.projectId : '',
    rootId: typeof sourceBinding.rootId === 'string' ? sourceBinding.rootId : '',
    documentId: typeof sourceBinding.documentId === 'string' ? sourceBinding.documentId : '',
    canonicalRevision: typeof sourceBinding.canonicalRevision === 'string' ? sourceBinding.canonicalRevision : '',
    workingRevision: typeof sourceBinding.workingRevision === 'string' ? sourceBinding.workingRevision : '',
    generation: typeof sourceBinding.generation === 'string' ? sourceBinding.generation : '',
    sourceDigest: typeof sourceBinding.sourceDigest === 'string' ? sourceBinding.sourceDigest : '',
  };
}

function validateSourceBinding(reasons, field, sourceBinding, { current = false } = {}) {
  const keys = current ? SOURCE_CURRENT_KEYS : SOURCE_BINDING_KEYS;
  if (!isPlainObject(sourceBinding)) {
    addKeysetReason(reasons, field, sourceBinding, keys);
    return;
  }
  if (!sameKeys(sourceBinding, keys)) {
    addKeysetReason(reasons, field, sourceBinding, keys);
  }
  for (const key of ['projectId', 'rootId', 'documentId']) {
    if (!normalizeIdentifier(sourceBinding[key])) {
      reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, `${field}.${key}`));
    }
  }
  for (const key of ['canonicalRevision', 'workingRevision', 'generation']) {
    if (!normalizeRevision(sourceBinding[key])) {
      reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, `${field}.${key}`));
    }
  }
  if (!validDigest(sourceBinding.sourceDigest)) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, `${field}.sourceDigest`));
  }
  if (current && !DIRTY_STATES.includes(sourceBinding.dirtyState)) {
    reasons.push(reason(
      BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_FENCE_REJECTED,
      `${field}.dirtyState`,
      DIRTY_STATES,
      sourceBinding.dirtyState,
    ));
  }
}

function validateSnapshotAuthority(reasons, authority) {
  if (!isPlainObject(authority)) {
    addKeysetReason(reasons, 'sourceSnapshot.authority', authority, SOURCE_SNAPSHOT_AUTHORITY_KEYS);
    return;
  }
  if (!sameKeys(authority, SOURCE_SNAPSHOT_AUTHORITY_KEYS)) {
    addKeysetReason(reasons, 'sourceSnapshot.authority', authority, SOURCE_SNAPSHOT_AUTHORITY_KEYS);
  }
  if (!SOURCE_SNAPSHOT_AUTHORITY_DECISIONS.includes(authority.decision)) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_FENCE_REJECTED, 'sourceSnapshot.authority.decision'));
  }
  if (authority.decision !== 'ALLOW' || authority.mayWrite !== false) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_FENCE_REJECTED, 'sourceSnapshot.authority'));
  }
  if (!normalizeIdentifier(authority.queryId)) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, 'sourceSnapshot.authority.queryId'));
  }
}

function fenceSourceFromBinding(binding) {
  const normalized = normalizeSourceBinding(binding) || {};
  return {
    projectId: normalized.projectId || '',
    rootId: normalized.rootId || '',
    documentId: normalized.documentId || '',
    canonicalRevision: normalized.canonicalRevision || '',
    workingRevision: normalized.workingRevision || '',
    sourceDigest: normalized.sourceDigest || '',
  };
}

function evaluateSnapshotFence(sourceSnapshot) {
  const expected = fenceSourceFromBinding(sourceSnapshot.expected);
  const current = {
    ...fenceSourceFromBinding(sourceSnapshot.current),
    dirtyState: sourceSnapshot.current?.dirtyState,
  };
  try {
    return evaluateSourceFenceV1({
      schemaVersion: SOURCE_FENCE_V1_SCHEMAS.request,
      purpose: 'READ_SOURCE_SNAPSHOT',
      expected,
      current,
      fence: createSourceFenceTokenV1({ purpose: 'READ_SOURCE_SNAPSHOT', ...expected }),
      dirtyPolicy: 'REQUIRE_CLEAN',
      authority: {
        decision: sourceSnapshot.authority?.decision,
        mayWrite: sourceSnapshot.authority?.mayWrite,
        commandId: sourceSnapshot.authority?.queryId,
      },
    });
  } catch {
    return {
      ok: false,
      code: SOURCE_FENCE_V1_CODES.FIELD_INVALID,
      reasons: [],
    };
  }
}

function normalizeCounts(counts) {
  if (!isPlainObject(counts)) return null;
  const out = {};
  for (const key of CORE_COUNTS_KEYS) {
    const value = counts[key];
    if (!Number.isSafeInteger(value) || value < 0 || value > 100000) return null;
    out[key] = value;
  }
  return out;
}

function emptyCounts() {
  return {
    projectManifest: 0,
    sceneDocuments: 0,
    notesDocuments: 0,
    historyDocuments: 0,
    totalItems: 0,
  };
}

function countKind(kind) {
  if (kind === 'PROJECT_MANIFEST') return 'projectManifest';
  if (kind === 'SCENE_DOCUMENT') return 'sceneDocuments';
  if (kind === 'NOTES_DOCUMENT') return 'notesDocuments';
  if (kind === 'HISTORY_DOCUMENT') return 'historyDocuments';
  return '';
}

function validateTreeNode(reasons, field, projectId, bindingKey, treeNodeId) {
  const normalizedTreeNodeId = normalizeIdentifier(treeNodeId);
  if (!normalizedTreeNodeId) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, `${field}.treeNodeId`));
    return;
  }
  const expectedTreeNodeId = createDeterministicTreeNodeId(projectId, bindingKey);
  if (treeNodeId !== expectedTreeNodeId) {
    reasons.push(reason(
      BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_BINDING_MISMATCH,
      `${field}.treeNodeId`,
      expectedTreeNodeId,
      treeNodeId,
    ));
  }
}

function validateSourceEntry(reasons, field, entry, {
  expectedKind,
  projectId,
  requireOrdinal,
  allowKinds = SUPPORTED_ITEM_KINDS,
}) {
  const keys = requireOrdinal ? CORE_ITEM_KEYS : CORE_MANIFEST_ENTRY_KEYS;
  if (!isPlainObject(entry)) {
    addKeysetReason(reasons, field, entry, keys);
    return null;
  }
  if (!sameKeys(entry, keys)) {
    addKeysetReason(reasons, field, entry, keys);
  }
  const kind = typeof entry.kind === 'string' ? entry.kind : '';
  if (expectedKind && kind !== expectedKind) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, `${field}.kind`, expectedKind, kind));
  } else if (!expectedKind && !allowKinds.includes(kind)) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_ITEM_UNSUPPORTED, `${field}.kind`, allowKinds, kind));
  }
  const documentId = normalizeIdentifier(entry.documentId, { allowSlash: true });
  if (!documentId) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, `${field}.documentId`));
  }
  const bindingKey = normalizeTreeBindingKey(entry.bindingKey);
  if (!bindingKey) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, `${field}.bindingKey`));
  } else {
    validateTreeNode(reasons, field, projectId, bindingKey, entry.treeNodeId);
  }
  if (requireOrdinal && (!Number.isSafeInteger(entry.ordinal) || entry.ordinal < 0 || entry.ordinal > 100000)) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, `${field}.ordinal`));
  }
  if (typeof entry.sourceText !== 'string') {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, `${field}.sourceText`));
  } else if (entry.sourceTextDigest !== sha256Text(entry.sourceText)) {
    reasons.push(reason(
      BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_BINDING_MISMATCH,
      `${field}.sourceTextDigest`,
      sha256Text(entry.sourceText),
      entry.sourceTextDigest,
    ));
  }
  if (!validDigest(entry.sourceTextDigest)) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, `${field}.sourceTextDigest`));
  }
  return {
    kind,
    documentId,
    bindingKey,
    treeNodeId: typeof entry.treeNodeId === 'string' ? entry.treeNodeId : '',
    ordinal: requireOrdinal ? entry.ordinal : 0,
    sourceText: typeof entry.sourceText === 'string' ? entry.sourceText : '',
    sourceTextDigest: typeof entry.sourceTextDigest === 'string' ? entry.sourceTextDigest : '',
    byteLength: typeof entry.sourceText === 'string' ? Buffer.byteLength(entry.sourceText, 'utf8') : 0,
  };
}

function parseManifest(reasons, manifestEntry, binding) {
  if (!manifestEntry || typeof manifestEntry.sourceText !== 'string') return null;
  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.sourceText);
  } catch {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_MANIFEST_REQUIRED, 'sourceSnapshot.core.manifest.sourceText'));
    return null;
  }
  if (!isPlainObject(manifest)) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_MANIFEST_REQUIRED, 'sourceSnapshot.core.manifest.sourceText'));
    return null;
  }
  if (manifest.projectId !== binding.projectId) {
    reasons.push(reason(
      BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_BINDING_MISMATCH,
      'sourceSnapshot.core.manifest.projectId',
      binding.projectId,
      manifest.projectId,
    ));
  }
  if (manifest.rootId !== binding.rootId) {
    reasons.push(reason(
      BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_BINDING_MISMATCH,
      'sourceSnapshot.core.manifest.rootId',
      binding.rootId,
      manifest.rootId,
    ));
  }
  if (!Array.isArray(manifest.sceneOrder)) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_MANIFEST_REQUIRED, 'sourceSnapshot.core.manifest.sceneOrder'));
  }
  if (manifest.scenes !== undefined && !isPlainObject(manifest.scenes)) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_MANIFEST_REQUIRED, 'sourceSnapshot.core.manifest.scenes'));
  }
  return manifest;
}

function digestEntry(entry) {
  return {
    kind: entry.kind,
    documentId: entry.documentId,
    bindingKey: entry.bindingKey,
    treeNodeId: entry.treeNodeId,
    ordinal: entry.ordinal,
    sourceTextDigest: entry.sourceTextDigest,
    byteLength: entry.byteLength,
  };
}

export function computeBlackBoxCoreSourceDigestV1(core, binding) {
  const sourceBinding = normalizeSourceBinding(binding);
  if (!sourceBinding || !isPlainObject(core) || !isPlainObject(core.manifest) || !Array.isArray(core.items)) {
    return '';
  }
  const manifest = {
    kind: core.manifest.kind,
    documentId: core.manifest.documentId,
    bindingKey: core.manifest.bindingKey,
    treeNodeId: core.manifest.treeNodeId,
    ordinal: 0,
    sourceTextDigest: core.manifest.sourceTextDigest,
    byteLength: typeof core.manifest.sourceText === 'string' ? Buffer.byteLength(core.manifest.sourceText, 'utf8') : 0,
  };
  const items = core.items.map((item) => ({
    kind: item.kind,
    documentId: item.documentId,
    bindingKey: item.bindingKey,
    treeNodeId: item.treeNodeId,
    ordinal: item.ordinal,
    sourceTextDigest: item.sourceTextDigest,
    byteLength: typeof item.sourceText === 'string' ? Buffer.byteLength(item.sourceText, 'utf8') : 0,
  }));
  return sha256Stable({
    schemaVersion: 'yalken.blackBoxCoreSourceAdapter.coreDigestInput.v1',
    projectId: sourceBinding.projectId,
    rootId: sourceBinding.rootId,
    documentId: sourceBinding.documentId,
    expectedCounts: core.expectedCounts,
    entries: [manifest, ...items],
  });
}

function analyzeCore(reasons, core, binding) {
  const expectedCounts = normalizeCounts(core?.expectedCounts);
  const observed = emptyCounts();
  const items = [];
  const bindingKeyOwners = new Map();
  const documentIdOwners = new Map();
  let unsupportedItems = 0;
  let omittedItems = 0;

  if (!isPlainObject(core)) {
    addKeysetReason(reasons, 'sourceSnapshot.core', core, CORE_SNAPSHOT_KEYS);
    return { expected: emptyCounts(), observed, items, unsupportedItems, omittedItems, coreDigest: '' };
  }
  if (!sameKeys(core, CORE_SNAPSHOT_KEYS)) {
    addKeysetReason(reasons, 'sourceSnapshot.core', core, CORE_SNAPSHOT_KEYS);
  }
  if (core.schemaVersion !== BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.coreSnapshot) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, 'sourceSnapshot.core.schemaVersion'));
  }
  if (!isPlainObject(core.expectedCounts) || !sameKeys(core.expectedCounts, CORE_COUNTS_KEYS) || !expectedCounts) {
    addKeysetReason(reasons, 'sourceSnapshot.core.expectedCounts', core.expectedCounts, CORE_COUNTS_KEYS);
  }
  if (!Array.isArray(core.items)) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, 'sourceSnapshot.core.items'));
  }

  if (!isPlainObject(core.manifest)) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_MANIFEST_REQUIRED, 'sourceSnapshot.core.manifest'));
  } else {
    const manifestEntry = validateSourceEntry(reasons, 'sourceSnapshot.core.manifest', core.manifest, {
      expectedKind: 'PROJECT_MANIFEST',
      projectId: binding.projectId,
      requireOrdinal: false,
    });
    if (manifestEntry) {
      observed.projectManifest = 1;
      observed.totalItems += 1;
      items.push(manifestEntry);
      bindingKeyOwners.set(manifestEntry.bindingKey, manifestEntry.documentId);
      documentIdOwners.set(manifestEntry.documentId, manifestEntry.bindingKey);
      parseManifest(reasons, manifestEntry, binding);
    }
  }

  if (Array.isArray(core.items)) {
    for (let index = 0; index < core.items.length; index += 1) {
      const field = `sourceSnapshot.core.items.${index}`;
      const entry = validateSourceEntry(reasons, field, core.items[index], {
        projectId: binding.projectId,
        requireOrdinal: true,
      });
      if (!entry) continue;
      if (!SUPPORTED_ITEM_KINDS.includes(entry.kind)) {
        unsupportedItems += 1;
      }
      const countKey = countKind(entry.kind);
      if (countKey) observed[countKey] += 1;
      observed.totalItems += 1;
      items.push(entry);
      if (bindingKeyOwners.has(entry.bindingKey)) {
        reasons.push(reason(
          BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_ACCOUNTING_MISMATCH,
          `${field}.bindingKey`,
          'UNIQUE_BINDING_KEY',
          entry.bindingKey,
        ));
      }
      if (documentIdOwners.has(entry.documentId)) {
        reasons.push(reason(
          BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_ACCOUNTING_MISMATCH,
          `${field}.documentId`,
          'UNIQUE_DOCUMENT_ID',
          entry.documentId,
        ));
      }
      bindingKeyOwners.set(entry.bindingKey, entry.documentId);
      documentIdOwners.set(entry.documentId, entry.bindingKey);
    }
  }

  if (expectedCounts) {
    for (const key of CORE_COUNTS_KEYS) {
      if (expectedCounts[key] !== observed[key]) {
        omittedItems += Math.max(0, expectedCounts[key] - observed[key]);
        reasons.push(reason(
          BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_ACCOUNTING_MISMATCH,
          `sourceSnapshot.core.expectedCounts.${key}`,
          expectedCounts[key],
          observed[key],
        ));
      }
    }
  }

  if (unsupportedItems > 0) {
    reasons.push(reason(
      BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_ITEM_UNSUPPORTED,
      'sourceSnapshot.core.items.kind',
      SUPPORTED_ITEM_KINDS,
      'UNSUPPORTED_PRESENT',
    ));
  }

  const parsedManifest = isPlainObject(core.manifest) && typeof core.manifest.sourceText === 'string'
    ? (() => {
        try { return JSON.parse(core.manifest.sourceText); } catch { return null; }
      })()
    : null;
  if (isPlainObject(parsedManifest) && Array.isArray(parsedManifest.sceneOrder)) {
    const sceneIds = items
      .filter((item) => item.kind === 'SCENE_DOCUMENT')
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((item) => item.documentId);
    const expectedSceneIds = parsedManifest.sceneOrder;
    if (
      sceneIds.length !== expectedSceneIds.length
      || sceneIds.some((sceneId, index) => sceneId !== expectedSceneIds[index])
    ) {
      omittedItems += Math.max(0, expectedSceneIds.length - sceneIds.length);
      reasons.push(reason(
        BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_ACCOUNTING_MISMATCH,
        'sourceSnapshot.core.sceneOrder',
        expectedSceneIds,
        sceneIds,
      ));
    }
  }

  return {
    expected: expectedCounts || emptyCounts(),
    observed,
    items,
    unsupportedItems,
    omittedItems,
    coreDigest: computeBlackBoxCoreSourceDigestV1(core, binding),
  };
}

function validateSourceSnapshot(reasons, sourceSnapshot) {
  if (!isPlainObject(sourceSnapshot)) {
    addKeysetReason(reasons, 'sourceSnapshot', sourceSnapshot, SOURCE_SNAPSHOT_KEYS);
    return {
      expected: normalizeSourceBinding(null) || {
        projectId: '',
        rootId: '',
        documentId: '',
        canonicalRevision: '',
        workingRevision: '',
        generation: '',
        sourceDigest: '',
      },
      coreAnalysis: {
        expected: emptyCounts(),
        observed: emptyCounts(),
        items: [],
        unsupportedItems: 0,
        omittedItems: 0,
        coreDigest: '',
      },
    };
  }
  if (!sameKeys(sourceSnapshot, SOURCE_SNAPSHOT_KEYS)) {
    addKeysetReason(reasons, 'sourceSnapshot', sourceSnapshot, SOURCE_SNAPSHOT_KEYS);
  }
  if (sourceSnapshot.schemaVersion !== BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.sourceSnapshot) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, 'sourceSnapshot.schemaVersion'));
  }
  validateSnapshotAuthority(reasons, sourceSnapshot.authority);
  validateSourceBinding(reasons, 'sourceSnapshot.expected', sourceSnapshot.expected);
  validateSourceBinding(reasons, 'sourceSnapshot.current', sourceSnapshot.current, { current: true });

  const expected = normalizeSourceBinding(sourceSnapshot.expected) || {
    projectId: '',
    rootId: '',
    documentId: '',
    canonicalRevision: '',
    workingRevision: '',
    generation: '',
    sourceDigest: '',
  };
  const coreAnalysis = analyzeCore(reasons, sourceSnapshot.core, expected);

  if (isPlainObject(sourceSnapshot.expected) && isPlainObject(sourceSnapshot.current)) {
    if (sourceSnapshot.expected.generation !== sourceSnapshot.current.generation) {
      reasons.push(reason(
        BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_BINDING_MISMATCH,
        'sourceSnapshot.current.generation',
        sourceSnapshot.expected.generation,
        sourceSnapshot.current.generation,
      ));
    }
  }

  if (coreAnalysis.coreDigest) {
    if (sourceSnapshot.expected?.sourceDigest !== coreAnalysis.coreDigest) {
      reasons.push(reason(
        BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_BINDING_MISMATCH,
        'sourceSnapshot.expected.sourceDigest',
        coreAnalysis.coreDigest,
        sourceSnapshot.expected?.sourceDigest,
      ));
    }
    if (sourceSnapshot.current?.sourceDigest !== coreAnalysis.coreDigest) {
      reasons.push(reason(
        BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_BINDING_MISMATCH,
        'sourceSnapshot.current.sourceDigest',
        coreAnalysis.coreDigest,
        sourceSnapshot.current?.sourceDigest,
      ));
    }
  }

  const fenceResult = evaluateSnapshotFence(sourceSnapshot);
  if (fenceResult.ok !== true || fenceResult.code !== SOURCE_FENCE_V1_CODES.ALLOWED) {
    reasons.push(reason(
      BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.SOURCE_FENCE_REJECTED,
      'sourceSnapshot.sourceFence',
      SOURCE_FENCE_V1_CODES.ALLOWED,
      fenceResult.code,
    ));
  }

  return { expected, coreAnalysis };
}

function featureFromFlags(featureFlags) {
  return resolveBlackBoxCoreSourceAdapterFeatureFlag(isPlainObject(featureFlags) ? featureFlags : {});
}

function sourceSetDigestPayload(result) {
  return {
    schemaVersion: result.schemaVersion,
    feature: result.feature,
    sourceBinding: result.sourceBinding,
    accounting: result.accounting,
    items: result.items.map((item) => ({
      kind: item.kind,
      documentId: item.documentId,
      bindingKey: item.bindingKey,
      treeNodeId: item.treeNodeId,
      ordinal: item.ordinal,
      sourceTextDigest: item.sourceTextDigest,
      byteLength: item.byteLength,
    })),
  };
}

function finish(ok, code, reasons, request, analysis = null, overrides = {}) {
  const sourceBinding = normalizeSourceBinding(request?.sourceSnapshot?.expected) || {
    projectId: '',
    rootId: '',
    documentId: '',
    canonicalRevision: '',
    workingRevision: '',
    generation: '',
    sourceDigest: '',
  };
  const coreAnalysis = analysis?.coreAnalysis || {
    expected: emptyCounts(),
    observed: emptyCounts(),
    items: [],
    unsupportedItems: 0,
    omittedItems: 0,
    coreDigest: '',
  };
  const base = {
    schemaVersion: BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.sourceSet,
    ok,
    decision: ok ? 'ALLOW' : 'DENY',
    code,
    reasons,
    feature: featureFromFlags(request?.featureFlags),
    sourceBinding,
    accounting: {
      expected: coreAnalysis.expected,
      observed: coreAnalysis.observed,
      eligibleItems: ok ? coreAnalysis.items.length : 0,
      blockedItems: ok ? 0 : coreAnalysis.items.length,
      omittedItems: coreAnalysis.omittedItems,
      unsupportedItems: coreAnalysis.unsupportedItems,
      droppedItems: 0,
    },
    items: ok ? coreAnalysis.items : [],
    sourceSetDigest: '',
    canWriteManuscript: false,
    canPublishCapsule: false,
    canRecoverProject: false,
    ownerKeyRequired: false,
    durablePublication: false,
    ...overrides,
  };
  base.sourceSetDigest = ok ? sha256Stable(sourceSetDigestPayload(base)) : '';
  return deepFreeze(base);
}

export function resolveBlackBoxCoreSourceAdapterFeatureFlag(flags = {}) {
  const enabled = isPlainObject(flags) && flags[BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG] === true;
  return deepFreeze({
    schemaVersion: BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.featureFlag,
    flag: BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG,
    enabled,
    canWriteManuscript: false,
    canPublishCapsule: false,
    canRecoverProject: false,
    mutationSurfaceEnabled: false,
  });
}

export function buildBlackBoxCoreSourceSetV1(request = {}) {
  const reasons = [];
  if (!isPlainObject(request)) {
    addKeysetReason(reasons, 'request', request, REQUEST_KEYS);
    return finish(false, BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.KEYSET_INVALID, reasons, request);
  }
  if (!sameKeys(request, REQUEST_KEYS)) {
    addKeysetReason(reasons, 'request', request, REQUEST_KEYS);
  }
  if (request.schemaVersion !== BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.request) {
    reasons.push(reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FIELD_INVALID, 'schemaVersion'));
  }

  const analysis = validateSourceSnapshot(reasons, request.sourceSnapshot);
  if (reasons.some((entry) => entry.code === BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.KEYSET_INVALID)) {
    return finish(false, BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.KEYSET_INVALID, reasons, request, analysis);
  }

  const feature = featureFromFlags(request.featureFlags);
  if (!feature.enabled) {
    return finish(false, BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FEATURE_DISABLED, [
      ...reasons,
      reason(BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.FEATURE_DISABLED, 'featureFlags'),
    ], request, analysis);
  }

  if (reasons.length > 0) {
    return finish(false, reasons[0].code, reasons, request, analysis);
  }

  return finish(true, BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES.CORE_SOURCE_SET_READY, [], request, analysis);
}
