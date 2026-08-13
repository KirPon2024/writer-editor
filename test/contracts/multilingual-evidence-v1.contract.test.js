'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'product', 'multilingualEvidenceV1.mjs');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'multilingual-evidence-v1-model.mjs');

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

async function loadModel() {
  return import(pathToFileURL(MODEL_PATH).href);
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex')}`;
}

const SOURCE_BINDING = Object.freeze({
  projectId: 'project-alpha',
  rootId: 'root-main',
  documentId: 'scene-001',
  canonicalRevision: 'canon-r001',
  workingRevision: 'work-r001',
  generation: 'gen-r001',
  sourceDigest: SHA_A,
});

function withSourceBinding(overrides = {}) {
  return { ...SOURCE_BINDING, ...overrides };
}

function assertDenied(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'DENY');
  assert.ok(
    result.reasons.some((reason) => reason.code === code),
    `expected ${code} in ${JSON.stringify(result.reasons)}`,
  );
}

function trustedSnapshot(module, overrides = {}) {
  const text = overrides.text || 'Привет, мир. Café keeper.';
  const sourceDigest = overrides.sourceDigest || sha256Text(text);
  const baseBinding = {
    ...withSourceBinding({
      sourceDigest,
      generation: overrides.generation || 'gen-r001',
      ...(overrides.binding || {}),
    }),
  };
  const current = {
    ...baseBinding,
    dirtyState: overrides.dirtyState || 'CLEAN',
    ...(overrides.current || {}),
  };
  return {
    schemaVersion: module.MULTILINGUAL_EVIDENCE_V1_SCHEMAS.sourceSnapshot,
    authority: {
      decision: overrides.decision || 'ALLOW',
      mayWrite: overrides.mayWrite ?? false,
      queryId: overrides.queryId || 'query.multilingualEvidence.readSourceSnapshot.v1',
    },
    expected: baseBinding,
    current,
    document: {
      documentId: baseBinding.documentId,
      languageCode: overrides.languageCode || 'ru',
      text,
      sourceTextDigest: overrides.sourceTextDigest || sha256Text(text),
      ...(overrides.document || {}),
    },
  };
}

async function buildTrustedRequest(overrides = {}) {
  const module = await loadModule();
  return {
    schemaVersion: module.MULTILINGUAL_EVIDENCE_V1_SCHEMAS.indexRequest,
    featureFlags: overrides.featureFlags || {
      [module.MULTILINGUAL_EVIDENCE_V1_FEATURE_FLAG]: true,
    },
    sourceSnapshot: overrides.sourceSnapshot || trustedSnapshot(module, overrides),
    ...(overrides.extraRequestFields || {}),
  };
}

async function buildRequest(overrides = {}) {
  const module = await loadModule();
  const document = overrides.documents?.[0] || {
    documentId: SOURCE_BINDING.documentId,
    languageCode: 'ru',
    text: 'Привет, мир. Café keeper.',
  };
  const text = typeof document.text === 'string' ? document.text : '';
  const sourceBinding = withSourceBinding({
    sourceDigest: sha256Text(text),
    generation: 'gen-r001',
    ...(overrides.sourceBinding || {}),
  });
  return buildTrustedRequest({
    ...overrides,
    sourceSnapshot: overrides.sourceSnapshot || trustedSnapshot(module, {
      text,
      languageCode: document.languageCode,
      binding: sourceBinding,
      document: { documentId: document.documentId },
      current: overrides.current,
      dirtyState: overrides.dirtyState,
      decision: overrides.decision,
      mayWrite: overrides.mayWrite,
    }),
  });
}

test('F1 multilingual evidence v1 exports closed schemas, reason codes and a default-off no-write flag', async () => {
  const module = await loadModule();
  const disabled = module.resolveMultilingualEvidenceFeatureFlag({});
  const enabled = module.resolveMultilingualEvidenceFeatureFlag({
    [module.MULTILINGUAL_EVIDENCE_V1_FEATURE_FLAG]: true,
  });

  assert.equal(module.MULTILINGUAL_EVIDENCE_V1_FEATURE_FLAG, 'yalken.multilingualEvidence.readonlyV1');
  assert.deepEqual(sortedKeys(module.MULTILINGUAL_EVIDENCE_V1_SCHEMAS), [
    'featureFlag',
    'index',
    'indexRequest',
    'searchRequest',
    'searchResult',
    'sourceSnapshot',
  ]);
  assert.deepEqual(sortedKeys(module.MULTILINGUAL_EVIDENCE_V1_CODES), [
    'FEATURE_DISABLED',
    'FIELD_INVALID',
    'INDEX_BUILT',
    'INDEX_NOT_SEARCHABLE',
    'KEYSET_INVALID',
    'LANGUAGE_ABSTAINED',
    'QUERY_EMPTY',
    'SEARCH_COMPLETE',
    'SOURCE_BINDING_MISMATCH',
    'SOURCE_FENCE_REJECTED',
  ]);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.canWriteManuscript, false);
  assert.equal(disabled.mutationSurfaceEnabled, false);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.canWriteManuscript, false);
  assert.equal(enabled.canApply, false);
});

test('F1 multilingual evidence v1 uses a trusted Product Core source snapshot, not caller-carried ALLOW or source text', async () => {
  const module = await loadModule();
  const { MULTILINGUAL_EVIDENCE_V1_CODES: CODES } = module;

  const index = module.buildMultilingualEvidenceIndexV1(await buildTrustedRequest());
  assert.equal(index.ok, true);
  assert.equal(index.code, CODES.INDEX_BUILT);
  assert.equal(index.sourceBinding.generation, 'gen-r001');
  assert.equal(index.sourceBinding.sourceDigest, sha256Text('Привет, мир. Café keeper.'));
  assert.equal(index.documents[0].sourceTextSha256, sha256Text('Привет, мир. Café keeper.'));

  const forgedCallerAllow = await buildTrustedRequest({
    extraRequestFields: {
      sourceFenceResult: {
        schemaVersion: 'yalken.sourceFence.result.v1',
        ok: true,
        decision: 'ALLOW',
        code: 'YALKEN_SOURCE_FENCE_ALLOWED',
        reasons: [],
        observed: withSourceBinding({ sourceDigest: SHA_A }),
      },
      documents: [{ documentId: SOURCE_BINDING.documentId, languageCode: 'ru', text: 'forged caller text' }],
      sourceBinding: withSourceBinding({ sourceDigest: SHA_A }),
    },
  });
  assertDenied(module.buildMultilingualEvidenceIndexV1(forgedCallerAllow), CODES.KEYSET_INVALID);

  assertDenied(module.buildMultilingualEvidenceIndexV1(await buildTrustedRequest({
    sourceSnapshot: trustedSnapshot(module, { sourceTextDigest: SHA_A }),
  })), CODES.SOURCE_BINDING_MISMATCH);

  assertDenied(module.buildMultilingualEvidenceIndexV1(await buildTrustedRequest({
    sourceSnapshot: trustedSnapshot(module, { current: { canonicalRevision: 'canon-r002' } }),
  })), CODES.SOURCE_FENCE_REJECTED);

  assertDenied(module.buildMultilingualEvidenceIndexV1(await buildTrustedRequest({
    sourceSnapshot: trustedSnapshot(module, { current: { generation: 'gen-r002' } }),
  })), CODES.SOURCE_BINDING_MISMATCH);

  assertDenied(module.buildMultilingualEvidenceIndexV1(await buildTrustedRequest({
    sourceSnapshot: trustedSnapshot(module, { current: { projectId: 'project-beta' } }),
  })), CODES.SOURCE_FENCE_REJECTED);

  for (const decision of ['UNKNOWN', 'ABSTAIN', 'CONFLICTING']) {
    assertDenied(module.buildMultilingualEvidenceIndexV1(await buildTrustedRequest({
      sourceSnapshot: trustedSnapshot(module, { decision }),
    })), CODES.SOURCE_FENCE_REJECTED);
  }
});

test('F1 multilingual evidence v1 is source-fence-bound and rejects stale or transplanted source context', async () => {
  const module = await loadModule();
  const { MULTILINGUAL_EVIDENCE_V1_CODES: CODES } = module;

  const allowed = module.buildMultilingualEvidenceIndexV1(await buildRequest());
  assert.equal(allowed.ok, true);
  assert.equal(allowed.code, CODES.INDEX_BUILT);
  assert.deepEqual(sortedKeys(allowed), [
    'accounting',
    'code',
    'decision',
    'documents',
    'feature',
    'indexDigest',
    'ok',
    'reasons',
    'schemaVersion',
    'sourceBinding',
    'tokens',
  ]);
  assert.equal(allowed.sourceBinding.projectId, SOURCE_BINDING.projectId);
  assert.equal(allowed.sourceBinding.canonicalRevision, SOURCE_BINDING.canonicalRevision);
  assert.equal(allowed.feature.enabled, true);

  assertDenied(module.buildMultilingualEvidenceIndexV1(await buildRequest({
    current: { canonicalRevision: 'canon-r002' },
  })), CODES.SOURCE_FENCE_REJECTED);

  assertDenied(module.buildMultilingualEvidenceIndexV1(await buildRequest({
    documents: [{ documentId: 'scene-999', languageCode: 'ru', text: 'Привет, мир. Café keeper.' }],
  })), CODES.SOURCE_BINDING_MISMATCH);
});

test('F1 multilingual evidence v1 closes request keys and preserves no-silent-drop accounting', async () => {
  const module = await loadModule();
  const { MULTILINGUAL_EVIDENCE_V1_CODES: CODES } = module;

  const disabled = module.buildMultilingualEvidenceIndexV1(await buildRequest({ featureFlags: {} }));
  assertDenied(disabled, CODES.FEATURE_DISABLED);
  assert.equal(disabled.accounting.totalDocuments, 1);
  assert.equal(disabled.accounting.indexedDocuments, 0);
  assert.equal(disabled.accounting.abstainedDocuments, 0);
  assert.equal(disabled.accounting.droppedDocuments, 0);

  const missing = await buildRequest();
  delete missing.sourceSnapshot.expected.sourceDigest;
  assertDenied(module.buildMultilingualEvidenceIndexV1(missing), CODES.KEYSET_INVALID);

  const extra = await buildRequest();
  extra.sourceSnapshot.document.silentDrop = true;
  assertDenied(module.buildMultilingualEvidenceIndexV1(extra), CODES.KEYSET_INVALID);

  const unknownLanguage = module.buildMultilingualEvidenceIndexV1(await buildRequest({
    documents: [{ documentId: SOURCE_BINDING.documentId, languageCode: 'zz', text: 'Mystery text' }],
  }));
  assertDenied(unknownLanguage, CODES.LANGUAGE_ABSTAINED);
  assert.equal(unknownLanguage.accounting.totalDocuments, 1);
  assert.equal(unknownLanguage.accounting.indexedDocuments, 0);
  assert.equal(unknownLanguage.accounting.abstainedDocuments, 1);
  assert.equal(unknownLanguage.accounting.droppedDocuments, 0);
  assert.equal(unknownLanguage.documents[0].status, 'ABSTAIN_UNKNOWN_LANGUAGE');
});

test('F1 multilingual evidence v1 indexes Unicode with NFC casefold and grapheme/token boundaries without mutating source text', async () => {
  const module = await loadModule();
  const request = await buildRequest({
    documents: [{
      documentId: SOURCE_BINDING.documentId,
      languageCode: 'fr',
      text: 'Café CAFÉ 👩‍💻 Annabel Anna',
    }],
  });
  const index = module.buildMultilingualEvidenceIndexV1(request);

  assert.equal(index.ok, true);
  assert.equal(index.accounting.totalDocuments, 1);
  assert.equal(index.accounting.indexedDocuments, 1);
  assert.equal(index.accounting.droppedDocuments, 0);
  assert.equal(index.documents[0].originalTextPreserved, true);
  assert.equal(index.documents[0].sourceTextSha256.startsWith('sha256:'), true);
  assert.ok(index.tokens.some((token) => token.raw === 'Café' && token.folded === 'café'));
  assert.ok(index.tokens.some((token) => token.raw === 'CAFÉ' && token.folded === 'café'));
  assert.ok(index.tokens.every((token) => token.utf16End > token.utf16Start));
  assert.ok(index.tokens.every((token) => token.graphemeEnd > token.graphemeStart));
  assert.equal(index.tokens.some((token) => token.raw === '👩‍💻'), false);
});

test('F1 multilingual evidence v1 search is read-only, revision-bound and boundary-safe', async () => {
  const module = await loadModule();
  const index = module.buildMultilingualEvidenceIndexV1(await buildRequest({
    documents: [{
      documentId: SOURCE_BINDING.documentId,
      languageCode: 'ru',
      text: 'Привет приветствие ПРИВЕТ',
    }],
  }));

  const found = module.searchMultilingualEvidenceIndexV1({
    schemaVersion: module.MULTILINGUAL_EVIDENCE_V1_SCHEMAS.searchRequest,
    index,
    query: { languageCode: 'ru', text: 'привет' },
  });
  assert.equal(found.ok, true);
  assert.equal(found.code, module.MULTILINGUAL_EVIDENCE_V1_CODES.SEARCH_COMPLETE);
  assert.deepEqual(found.matches.map((match) => match.matchedText), ['Привет', 'ПРИВЕТ']);
  assert.equal(found.matches.some((match) => match.matchedText === 'приветствие'), false);
  assert.equal(found.mutationSurfaceEnabled, false);
  assert.equal(found.canWriteManuscript, false);
  assert.equal(found.sourceBinding.canonicalRevision, SOURCE_BINDING.canonicalRevision);

  const staleIndex = clone(index);
  staleIndex.sourceBinding.sourceDigest = SHA_B;
  assertDenied(module.searchMultilingualEvidenceIndexV1({
    schemaVersion: module.MULTILINGUAL_EVIDENCE_V1_SCHEMAS.searchRequest,
    index: staleIndex,
    query: { languageCode: 'ru', text: 'привет' },
  }), module.MULTILINGUAL_EVIDENCE_V1_CODES.INDEX_NOT_SEARCHABLE);

  const empty = module.searchMultilingualEvidenceIndexV1({
    schemaVersion: module.MULTILINGUAL_EVIDENCE_V1_SCHEMAS.searchRequest,
    index,
    query: { languageCode: 'ru', text: '   ' },
  });
  assertDenied(empty, module.MULTILINGUAL_EVIDENCE_V1_CODES.QUERY_EMPTY);
});

test('F1 multilingual evidence v1 generated model, hostile Unicode corpus and semantic mutations are deterministic', async () => {
  const module = await loadModule();
  const model = await loadModel();
  const first = model.runMultilingualEvidenceV1Model(module);
  const second = model.runMultilingualEvidenceV1Model(module);

  assert.equal(first.schemaVersion, 'yalken.multilingualEvidence.modelReport.v1');
  assert.deepEqual(first, second);
  assert.equal(first.cases.total, 24);
  assert.equal(first.cases.disagreements, 0);
  assert.equal(first.hostile.total, 18);
  assert.equal(first.hostile.failures, 0);
  assert.equal(first.mutations.total, 15);
  assert.equal(first.mutations.survivors, 0);
  assert.equal(first.controls.supportedLanguageSearchPasses, true);
  assert.equal(first.controls.unknownLanguageAbstains, true);
  assert.equal(first.controls.forgedCallerAllowIsNotPass, true);
  assert.equal(first.controls.staleGenerationIsNotPass, true);
  assert.equal(first.controls.digestMismatchIsNotPass, true);
  assert.equal(first.skips, 0);
});
