#!/usr/bin/env node
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createDeterministicTreeNodeId } from '../../src/core/projectTreeIdentity.mjs';
import * as defaultModule from '../../src/product/blackBoxCoreSourceAdapterV1.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
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

function digestEntry(entry) {
  return {
    kind: entry.kind,
    documentId: entry.documentId,
    bindingKey: entry.bindingKey,
    treeNodeId: entry.treeNodeId,
    ordinal: entry.ordinal,
    sourceTextDigest: entry.sourceTextDigest,
    byteLength: Buffer.byteLength(entry.sourceText, 'utf8'),
  };
}

function expectedCoreDigest(core, binding) {
  return sha256Stable({
    schemaVersion: 'yalken.blackBoxCoreSourceAdapter.coreDigestInput.v1',
    projectId: binding.projectId,
    rootId: binding.rootId,
    documentId: binding.documentId,
    expectedCounts: core.expectedCounts,
    entries: [
      digestEntry({ ...core.manifest, ordinal: 0 }),
      ...core.items.map(digestEntry),
    ],
  });
}

function makeEntry(projectId, kind, documentId, bindingKey, sourceText, ordinal = 0) {
  return {
    kind,
    documentId,
    bindingKey,
    treeNodeId: createDeterministicTreeNodeId(projectId, bindingKey),
    ordinal,
    sourceText,
    sourceTextDigest: sha256Text(sourceText),
  };
}

function makeCore(module, overrides = {}) {
  const projectId = overrides.projectId || 'project-alpha';
  const rootId = overrides.rootId || 'root-main';
  const manifestObject = overrides.manifestObject || {
    schemaVersion: 'yalken.syntheticProjectManifest.v1',
    projectId,
    rootId,
    sceneOrder: ['scene-001', 'scene-002'],
    scenes: {
      'scene-001': { title: 'Opening', bindingKey: 'file:scenes/scene-001.json' },
      'scene-002': { title: 'Turn', bindingKey: 'file:scenes/scene-002.json' },
    },
    notesOrder: [],
    historyOrder: [],
  };
  const manifestText = overrides.manifestText || stableJson(manifestObject);
  const manifestBindingKey = 'file:project.json';
  const manifest = {
    kind: 'PROJECT_MANIFEST',
    documentId: 'project-manifest',
    bindingKey: manifestBindingKey,
    treeNodeId: createDeterministicTreeNodeId(projectId, manifestBindingKey),
    sourceText: manifestText,
    sourceTextDigest: sha256Text(manifestText),
  };
  const items = overrides.items || [
    makeEntry(projectId, 'SCENE_DOCUMENT', 'scene-001', 'file:scenes/scene-001.json', 'Opening line.\nSecond line.', 0),
    makeEntry(projectId, 'SCENE_DOCUMENT', 'scene-002', 'file:scenes/scene-002.json', 'A later scene.', 1),
  ];
  return {
    schemaVersion: module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.coreSnapshot,
    manifest: overrides.manifest === undefined ? manifest : overrides.manifest,
    items,
    expectedCounts: overrides.expectedCounts || {
      projectManifest: 1,
      sceneDocuments: 2,
      notesDocuments: 0,
      historyDocuments: 0,
      totalItems: 3,
    },
  };
}

function makeRequest(module, overrides = {}) {
  const binding = {
    projectId: overrides.projectId || 'project-alpha',
    rootId: overrides.rootId || 'root-main',
    documentId: overrides.documentId || 'black-box-core',
    canonicalRevision: 'canon-r001',
    workingRevision: 'work-r001',
    generation: 'gen-r001',
    sourceDigest: 'sha256:' + '0'.repeat(64),
    ...(overrides.binding || {}),
  };
  const core = overrides.core || makeCore(module, { projectId: binding.projectId, rootId: binding.rootId });
  binding.sourceDigest = overrides.sourceDigest || expectedCoreDigest(core, binding);
  const current = {
    ...binding,
    dirtyState: 'CLEAN',
    ...(overrides.current || {}),
  };
  return {
    schemaVersion: module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.request,
    featureFlags: overrides.featureFlags === undefined
      ? { [module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_FEATURE_FLAG]: true }
      : overrides.featureFlags,
    sourceSnapshot: {
      schemaVersion: module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_SCHEMAS.sourceSnapshot,
      authority: {
        decision: overrides.decision || 'ALLOW',
        mayWrite: overrides.mayWrite ?? false,
        queryId: 'query.blackBoxCoreSourceAdapter.readSourceSnapshot.v1',
        ...(overrides.authority || {}),
      },
      expected: binding,
      current,
      core,
      ...(overrides.snapshotExtra || {}),
    },
    ...(overrides.requestExtra || {}),
  };
}

function expectPass(result) {
  return result.ok === true && result.code === 'YALKEN_BLACK_BOX_CORE_SOURCE_SET_READY';
}

function expectDeny(result) {
  return result.ok === false && result.decision === 'DENY';
}

function runCase(module, row) {
  let request = makeRequest(module);
  if (typeof row.mutate === 'function') {
    request = row.mutate(request, module);
  }
  let result;
  let threw = false;
  try {
    result = module.buildBlackBoxCoreSourceSetV1(request);
  } catch (error) {
    threw = true;
    result = { ok: false, code: 'THREW', error: String(error?.message || error) };
  }
  const oracleOk = row.expectOk ? expectPass(result) : expectDeny(result);
  return {
    id: row.id,
    expectOk: row.expectOk,
    expectedCode: row.expectedCode || '',
    actualOk: result.ok === true,
    actualCode: result.code || '',
    oracleOk: oracleOk && (!row.expectedCode || result.code === row.expectedCode || (result.reasons || []).some((reason) => reason.code === row.expectedCode)),
    threw,
  };
}

function caseRows(module) {
  const C = module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES;
  return [
    { id: 'positive', expectOk: true },
    { id: 'feature-disabled', expectOk: false, expectedCode: C.FEATURE_DISABLED, mutate: (request) => ({ ...request, featureFlags: {} }) },
    { id: 'request-extra-forged-allow', expectOk: false, expectedCode: C.KEYSET_INVALID, mutate: (request) => ({ ...request, sourceFenceResult: { ok: true } }) },
    { id: 'authority-deny', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.authority.decision = 'DENY'; return request; } },
    { id: 'authority-unknown', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.authority.decision = 'UNKNOWN'; return request; } },
    { id: 'authority-abstain', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.authority.decision = 'ABSTAIN'; return request; } },
    { id: 'authority-conflicting', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.authority.decision = 'CONFLICTING'; return request; } },
    { id: 'authority-may-write-true', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.authority.mayWrite = true; return request; } },
    { id: 'stale-canonical-revision', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.current.canonicalRevision = 'canon-r002'; return request; } },
    { id: 'stale-working-revision', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.current.workingRevision = 'work-r002'; return request; } },
    { id: 'stale-generation', expectOk: false, expectedCode: C.SOURCE_BINDING_MISMATCH, mutate: (request) => { request.sourceSnapshot.current.generation = 'gen-r002'; return request; } },
    { id: 'project-transplant', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.current.projectId = 'project-beta'; return request; } },
    { id: 'root-transplant', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.current.rootId = 'root-other'; return request; } },
    { id: 'document-transplant', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.current.documentId = 'other-core'; return request; } },
    { id: 'source-digest-current-drift', expectOk: false, expectedCode: C.SOURCE_BINDING_MISMATCH, mutate: (request) => { request.sourceSnapshot.current.sourceDigest = 'sha256:' + 'a'.repeat(64); return request; } },
    { id: 'source-digest-expected-drift', expectOk: false, expectedCode: C.SOURCE_BINDING_MISMATCH, mutate: (request) => { request.sourceSnapshot.expected.sourceDigest = 'sha256:' + 'b'.repeat(64); request.sourceSnapshot.current.sourceDigest = request.sourceSnapshot.expected.sourceDigest; return request; } },
    { id: 'dirty-source', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.current.dirtyState = 'DIRTY'; return request; } },
    { id: 'unknown-dirty-source', expectOk: false, expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.current.dirtyState = 'UNKNOWN'; return request; } },
    { id: 'missing-manifest', expectOk: false, expectedCode: C.CORE_MANIFEST_REQUIRED, mutate: (request) => { request.sourceSnapshot.core.manifest = null; return request; } },
    { id: 'invalid-manifest-json', expectOk: false, expectedCode: C.CORE_MANIFEST_REQUIRED, mutate: (request) => { request.sourceSnapshot.core.manifest.sourceText = '{'; request.sourceSnapshot.core.manifest.sourceTextDigest = sha256Text('{'); return request; } },
    { id: 'manifest-project-mismatch', expectOk: false, expectedCode: C.SOURCE_BINDING_MISMATCH, mutate: (request, mod) => { request.sourceSnapshot.core = makeCore(mod, { manifestObject: { schemaVersion: 'x', projectId: 'project-beta', rootId: 'root-main', sceneOrder: ['scene-001', 'scene-002'], scenes: {} } }); return request; } },
    { id: 'omitted-scene', expectOk: false, expectedCode: C.CORE_ACCOUNTING_MISMATCH, mutate: (request) => { request.sourceSnapshot.core.items.pop(); return request; } },
    { id: 'phantom-scene', expectOk: false, expectedCode: C.CORE_ACCOUNTING_MISMATCH, mutate: (request) => { request.sourceSnapshot.core.items.push(makeEntry('project-alpha', 'SCENE_DOCUMENT', 'scene-999', 'file:scenes/scene-999.json', 'Phantom.', 2)); request.sourceSnapshot.core.expectedCounts.sceneDocuments = 3; request.sourceSnapshot.core.expectedCounts.totalItems = 4; return request; } },
    { id: 'unsupported-asset', expectOk: false, expectedCode: C.CORE_ITEM_UNSUPPORTED, mutate: (request) => { request.sourceSnapshot.core.items.push(makeEntry('project-alpha', 'ASSET_BINARY', 'asset-001', 'file:assets/asset-001.bin', 'not binary', 2)); request.sourceSnapshot.core.expectedCounts.totalItems = 4; return request; } },
    { id: 'duplicate-document', expectOk: false, expectedCode: C.CORE_ACCOUNTING_MISMATCH, mutate: (request) => { request.sourceSnapshot.core.items[1] = clone(request.sourceSnapshot.core.items[0]); return request; } },
    { id: 'tree-node-transplant', expectOk: false, expectedCode: C.SOURCE_BINDING_MISMATCH, mutate: (request) => { request.sourceSnapshot.core.items[0].treeNodeId = createDeterministicTreeNodeId('project-beta', request.sourceSnapshot.core.items[0].bindingKey); return request; } },
    { id: 'binding-key-invalid', expectOk: false, expectedCode: C.FIELD_INVALID, mutate: (request) => { request.sourceSnapshot.core.items[0].bindingKey = '../secret'; return request; } },
    { id: 'item-extra-key', expectOk: false, expectedCode: C.KEYSET_INVALID, mutate: (request) => { request.sourceSnapshot.core.items[0].path = '/tmp/secret'; return request; } },
    { id: 'core-extra-key', expectOk: false, expectedCode: C.KEYSET_INVALID, mutate: (request) => { request.sourceSnapshot.core.publisher = true; return request; } },
    { id: 'notes-omitted', expectOk: false, expectedCode: C.CORE_ACCOUNTING_MISMATCH, mutate: (request) => { request.sourceSnapshot.core.expectedCounts.notesDocuments = 1; request.sourceSnapshot.core.expectedCounts.totalItems = 4; return request; } },
    { id: 'history-omitted', expectOk: false, expectedCode: C.CORE_ACCOUNTING_MISMATCH, mutate: (request) => { request.sourceSnapshot.core.expectedCounts.historyDocuments = 1; request.sourceSnapshot.core.expectedCounts.totalItems = 4; return request; } },
    { id: 'snapshot-extra-key', expectOk: false, expectedCode: C.KEYSET_INVALID, mutate: (request) => { request.sourceSnapshot.sourceBinding = request.sourceSnapshot.expected; return request; } },
  ];
}

function hostileRows(module) {
  return caseRows(module).filter((row) => row.expectOk === false).slice(0, 18);
}

function mutationRows(module) {
  const C = module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES;
  return [
    { id: 'kill-authority-deny', expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.authority.decision = 'DENY'; return request; } },
    { id: 'kill-authority-unknown', expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.authority.decision = 'UNKNOWN'; return request; } },
    { id: 'kill-maywrite', expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.authority.mayWrite = true; return request; } },
    { id: 'kill-canonical', expectedCode: C.SOURCE_FENCE_REJECTED, mutate: (request) => { request.sourceSnapshot.current.canonicalRevision = 'canon-r002'; return request; } },
    { id: 'kill-generation', expectedCode: C.SOURCE_BINDING_MISMATCH, mutate: (request) => { request.sourceSnapshot.current.generation = 'gen-r002'; return request; } },
    { id: 'kill-digest', expectedCode: C.SOURCE_BINDING_MISMATCH, mutate: (request) => { request.sourceSnapshot.current.sourceDigest = 'sha256:' + 'c'.repeat(64); return request; } },
    { id: 'kill-manifest', expectedCode: C.CORE_MANIFEST_REQUIRED, mutate: (request) => { request.sourceSnapshot.core.manifest = null; return request; } },
    { id: 'kill-omission', expectedCode: C.CORE_ACCOUNTING_MISMATCH, mutate: (request) => { request.sourceSnapshot.core.items.pop(); return request; } },
    { id: 'kill-phantom', expectedCode: C.CORE_ACCOUNTING_MISMATCH, mutate: (request) => { request.sourceSnapshot.core.items.push(makeEntry('project-alpha', 'SCENE_DOCUMENT', 'scene-999', 'file:scenes/scene-999.json', 'x', 2)); return request; } },
    { id: 'kill-unsupported', expectedCode: C.CORE_ITEM_UNSUPPORTED, mutate: (request) => { request.sourceSnapshot.core.items.push(makeEntry('project-alpha', 'ASSET_BINARY', 'asset-001', 'file:assets/asset-001.bin', 'x', 2)); return request; } },
    { id: 'kill-keyset', expectedCode: C.KEYSET_INVALID, mutate: (request) => { request.sourceSnapshot.core.items[0].extra = true; return request; } },
    { id: 'kill-treeid', expectedCode: C.SOURCE_BINDING_MISMATCH, mutate: (request) => { request.sourceSnapshot.core.items[0].treeNodeId = 'tree-node-forged'; return request; } },
  ];
}

export function runBlackBoxP0aSourceAdapterV1Model(module = defaultModule) {
  const rows = caseRows(module);
  const caseResults = rows.map((row) => runCase(module, row));
  const hostileResults = hostileRows(module).map((row) => runCase(module, row));
  const mutationResults = mutationRows(module).map((row) => runCase(module, { ...row, expectOk: false }));
  const disagreements = caseResults.filter((row) => !row.oracleOk);
  const hostileFailures = hostileResults.filter((row) => row.actualOk || !row.oracleOk);
  const survivors = mutationResults.filter((row) => row.actualOk || !row.oracleOk);
  const C = module.BLACK_BOX_CORE_SOURCE_ADAPTER_V1_CODES;
  const controls = {
    syntheticCorePasses: expectPass(module.buildBlackBoxCoreSourceSetV1(makeRequest(module))),
    forgedAllowIsNotPass: !module.buildBlackBoxCoreSourceSetV1({ ...makeRequest(module), sourceFenceResult: { ok: true } }).ok,
    digestMismatchIsNotPass: !module.buildBlackBoxCoreSourceSetV1(mutationRows(module).find((row) => row.id === 'kill-digest').mutate(makeRequest(module))).ok,
    omissionIsNotPass: !module.buildBlackBoxCoreSourceSetV1(mutationRows(module).find((row) => row.id === 'kill-omission').mutate(makeRequest(module))).ok,
    unknownAuthorityIsNotPass: !module.buildBlackBoxCoreSourceSetV1({ ...makeRequest(module, { decision: 'UNKNOWN' }) }).ok,
    coreReadyCode: module.buildBlackBoxCoreSourceSetV1(makeRequest(module)).code === C.CORE_SOURCE_SET_READY,
  };
  return {
    schemaVersion: 'yalken.blackBoxCoreSourceAdapter.modelReport.v1',
    cases: {
      total: caseResults.length,
      disagreements: disagreements.length,
      disagreementsIds: disagreements.map((row) => row.id),
    },
    hostile: {
      total: hostileResults.length,
      failures: hostileFailures.length,
      failureIds: hostileFailures.map((row) => row.id),
    },
    mutations: {
      total: mutationResults.length,
      survivors: survivors.length,
      survivorIds: survivors.map((row) => row.id),
    },
    controls,
    skips: 0,
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  process.stdout.write(`${JSON.stringify(runBlackBoxP0aSourceAdapterV1Model(), null, 2)}\n`);
}
