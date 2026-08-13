const FEATURE_FLAG = 'yalken.multilingualEvidence.readonlyV1';

const SCHEMAS = Object.freeze({
  indexRequest: 'yalken.multilingualEvidence.indexRequest.v1',
  index: 'yalken.multilingualEvidence.index.v1',
  searchRequest: 'yalken.multilingualEvidence.searchRequest.v1',
});

const CODES = Object.freeze({
  FEATURE_DISABLED: 'YALKEN_MULTILINGUAL_FEATURE_DISABLED',
  FIELD_INVALID: 'YALKEN_MULTILINGUAL_FIELD_INVALID',
  INDEX_BUILT: 'YALKEN_MULTILINGUAL_INDEX_BUILT',
  INDEX_NOT_SEARCHABLE: 'YALKEN_MULTILINGUAL_INDEX_NOT_SEARCHABLE',
  KEYSET_INVALID: 'YALKEN_MULTILINGUAL_KEYSET_INVALID',
  LANGUAGE_ABSTAINED: 'YALKEN_MULTILINGUAL_LANGUAGE_ABSTAINED',
  QUERY_EMPTY: 'YALKEN_MULTILINGUAL_QUERY_EMPTY',
  SEARCH_COMPLETE: 'YALKEN_MULTILINGUAL_SEARCH_COMPLETE',
  SOURCE_BINDING_MISMATCH: 'YALKEN_MULTILINGUAL_SOURCE_BINDING_MISMATCH',
  SOURCE_FENCE_REJECTED: 'YALKEN_MULTILINGUAL_SOURCE_FENCE_REJECTED',
});

const SOURCE_BINDING = Object.freeze({
  projectId: 'project-alpha',
  rootId: 'root-main',
  documentId: 'scene-001',
  canonicalRevision: 'canon-r001',
  workingRevision: 'work-r001',
  sourceDigest: `sha256:${'a'.repeat(64)}`,
});

const SUPPORTED_LANGUAGES = Object.freeze(['de', 'en', 'es', 'fr', 'pl', 'ru']);
const MUTATION_CATALOG = Object.freeze([
  'ignore-feature-flag',
  'ignore-source-fence',
  'ignore-source-binding',
  'ignore-request-keyset',
  'ignore-document-keyset',
  'ignore-unknown-language',
  'ignore-empty-query',
  'ignore-index-digest',
  'ignore-nfc-casefold',
  'ignore-token-boundary',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function allowedFence(sourceBinding = SOURCE_BINDING, overrides = {}) {
  return {
    schemaVersion: 'yalken.sourceFence.result.v1',
    ok: overrides.ok ?? true,
    decision: overrides.decision || 'ALLOW',
    code: overrides.code || 'YALKEN_SOURCE_FENCE_ALLOWED',
    reasons: [],
    observed: {
      purpose: overrides.purpose || 'READ_SOURCE_SNAPSHOT',
      projectId: sourceBinding.projectId,
      rootId: sourceBinding.rootId,
      documentId: sourceBinding.documentId,
      canonicalRevision: sourceBinding.canonicalRevision,
      workingRevision: sourceBinding.workingRevision,
      sourceDigest: sourceBinding.sourceDigest,
      dirtyState: 'CLEAN',
      dirtyPolicy: 'REQUIRE_CLEAN',
      ...(overrides.observed || {}),
    },
  };
}

function buildRequest(overrides = {}) {
  const sourceBinding = { ...SOURCE_BINDING, ...(overrides.sourceBinding || {}) };
  return {
    schemaVersion: SCHEMAS.indexRequest,
    featureFlags: overrides.featureFlags || { [FEATURE_FLAG]: true },
    sourceBinding,
    sourceFenceResult: overrides.sourceFenceResult || allowedFence(sourceBinding, overrides.sourceFenceOptions || {}),
    documents: overrides.documents || [{
      documentId: sourceBinding.documentId,
      languageCode: overrides.languageCode || 'en',
      text: overrides.text || 'Atlas keeper meets Anna.',
    }],
  };
}

function buildSearchRequest(index, overrides = {}) {
  return {
    schemaVersion: SCHEMAS.searchRequest,
    index,
    query: overrides.query || { languageCode: overrides.languageCode || 'en', text: overrides.text || 'atlas' },
  };
}

function exactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).sort().join('\u0000') === [...keys].sort().join('\u0000');
}

function normalizeLanguage(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/_/gu, '-') : '';
  return normalized.split('-')[0] || normalized;
}

function independentBuildOracle(request, options = {}) {
  const skip = new Set(options.skip || []);
  if (!skip.has('requestKeyset') && !exactKeys(request, ['documents', 'featureFlags', 'schemaVersion', 'sourceBinding', 'sourceFenceResult'])) {
    return { ok: false, code: CODES.KEYSET_INVALID };
  }
  if (request.schemaVersion !== SCHEMAS.indexRequest) return { ok: false, code: CODES.FIELD_INVALID };
  if (!skip.has('feature') && request.featureFlags?.[FEATURE_FLAG] !== true) {
    return { ok: false, code: CODES.FEATURE_DISABLED };
  }
  if (!skip.has('requestKeyset') && !exactKeys(request.sourceBinding, [
    'canonicalRevision',
    'documentId',
    'projectId',
    'rootId',
    'sourceDigest',
    'workingRevision',
  ])) {
    return { ok: false, code: CODES.KEYSET_INVALID };
  }
  if (!skip.has('documentKeyset')) {
    if (!Array.isArray(request.documents) || request.documents.length !== 1) return { ok: false, code: CODES.FIELD_INVALID };
    if (!exactKeys(request.documents[0], ['documentId', 'languageCode', 'text'])) return { ok: false, code: CODES.KEYSET_INVALID };
  }
  if (!skip.has('fence')) {
    const fence = request.sourceFenceResult;
    if (!isPlainObject(fence)
      || fence.schemaVersion !== 'yalken.sourceFence.result.v1'
      || fence.ok !== true
      || fence.decision !== 'ALLOW'
      || fence.code !== 'YALKEN_SOURCE_FENCE_ALLOWED'
      || fence.observed?.purpose !== 'READ_SOURCE_SNAPSHOT') {
      return { ok: false, code: CODES.SOURCE_FENCE_REJECTED };
    }
  }
  if (!skip.has('binding')) {
    for (const key of ['projectId', 'rootId', 'documentId', 'canonicalRevision', 'workingRevision', 'sourceDigest']) {
      if (request.sourceBinding?.[key] !== request.sourceFenceResult?.observed?.[key]) {
        return { ok: false, code: CODES.SOURCE_BINDING_MISMATCH };
      }
    }
    if (Array.isArray(request.documents) && request.documents[0]?.documentId !== request.sourceBinding?.documentId) {
      return { ok: false, code: CODES.SOURCE_BINDING_MISMATCH };
    }
  }
  if (!skip.has('language')) {
    const language = normalizeLanguage(request.documents?.[0]?.languageCode);
    if (!SUPPORTED_LANGUAGES.includes(language)) return { ok: false, code: CODES.LANGUAGE_ABSTAINED };
  }
  return { ok: true, code: CODES.INDEX_BUILT };
}

function independentSearchOracle(searchRequest, options = {}) {
  const skip = new Set(options.skip || []);
  if (!skip.has('queryKeyset') && !exactKeys(searchRequest, ['index', 'query', 'schemaVersion'])) {
    return { ok: false, code: CODES.KEYSET_INVALID };
  }
  if (searchRequest.schemaVersion !== SCHEMAS.searchRequest) return { ok: false, code: CODES.FIELD_INVALID };
  if (!skip.has('indexDigest') && (searchRequest.index?.ok !== true || searchRequest.index?.indexDigest !== searchRequest.expectedIndexDigest)) {
    return { ok: false, code: CODES.INDEX_NOT_SEARCHABLE };
  }
  if (!skip.has('emptyQuery') && String(searchRequest.query?.text || '').trim() === '') {
    return { ok: false, code: CODES.QUERY_EMPTY };
  }
  if (!skip.has('language') && !SUPPORTED_LANGUAGES.includes(normalizeLanguage(searchRequest.query?.languageCode))) {
    return { ok: false, code: CODES.LANGUAGE_ABSTAINED };
  }
  return { ok: true, code: CODES.SEARCH_COMPLETE };
}

function resultCode(result) {
  return result?.code || '';
}

function finiteCases() {
  const cases = [];
  for (const languageCode of SUPPORTED_LANGUAGES) {
    cases.push({
      id: `${languageCode}|clean`,
      request: buildRequest({ languageCode }),
    });
    cases.push({
      id: `${languageCode}|feature-disabled`,
      request: buildRequest({ languageCode, featureFlags: {} }),
    });
    cases.push({
      id: `${languageCode}|stale-fence`,
      request: buildRequest({
        languageCode,
        sourceFenceResult: allowedFence(SOURCE_BINDING, {
          ok: false,
          decision: 'DENY',
          code: 'YALKEN_SOURCE_FENCE_CANONICAL_REVISION_STALE',
          observed: { canonicalRevision: 'canon-r002' },
        }),
      }),
    });
    cases.push({
      id: `${languageCode}|binding-mismatch`,
      request: buildRequest({
        languageCode,
        sourceBinding: { projectId: 'project-beta' },
        sourceFenceResult: allowedFence(SOURCE_BINDING),
      }),
    });
  }
  return cases;
}

function hostileCorpus(module) {
  const index = module.buildMultilingualEvidenceIndexV1(buildRequest({
    languageCode: 'ru',
    text: 'Привет приветствие ПРИВЕТ',
  }));
  const tampered = clone(index);
  tampered.sourceBinding.sourceDigest = `sha256:${'b'.repeat(64)}`;

  const wrongSchema = buildRequest();
  wrongSchema.schemaVersion = 'yalken.multilingualEvidence.indexRequest.v0';
  const missingSourceDigest = buildRequest();
  delete missingSourceDigest.sourceBinding.sourceDigest;
  const extraDocumentKey = buildRequest();
  extraDocumentKey.documents[0].silentDrop = true;

  return [
    ['feature-disabled', buildRequest({ featureFlags: {} }), 'build', CODES.FEATURE_DISABLED],
    ['wrong-request-schema', wrongSchema, 'build', CODES.FIELD_INVALID],
    ['missing-source-digest', missingSourceDigest, 'build', CODES.KEYSET_INVALID],
    ['extra-document-key', extraDocumentKey, 'build', CODES.KEYSET_INVALID],
    ['stale-source-fence', buildRequest({
      sourceFenceResult: allowedFence(SOURCE_BINDING, { ok: false, decision: 'DENY', code: 'YALKEN_SOURCE_FENCE_CANONICAL_REVISION_STALE' }),
    }), 'build', CODES.SOURCE_FENCE_REJECTED],
    ['source-binding-transplant', buildRequest({
      sourceBinding: { projectId: 'project-beta' },
      sourceFenceResult: allowedFence(SOURCE_BINDING),
    }), 'build', CODES.SOURCE_BINDING_MISMATCH],
    ['unknown-language-abstain', buildRequest({ languageCode: 'zz' }), 'build', CODES.LANGUAGE_ABSTAINED],
    ['wrong-document-id', buildRequest({
      documents: [{ documentId: 'scene-999', languageCode: 'en', text: 'Atlas' }],
    }), 'build', CODES.SOURCE_BINDING_MISMATCH],
    ['empty-documents', buildRequest({ documents: [] }), 'build', CODES.FIELD_INVALID],
    ['wrong-fence-purpose', buildRequest({ sourceFenceResult: allowedFence(SOURCE_BINDING, { purpose: 'WRITE_SOURCE' }) }), 'build', CODES.SOURCE_FENCE_REJECTED],
    ['empty-query', buildSearchRequest(index, { text: '   ', languageCode: 'ru' }), 'search', CODES.QUERY_EMPTY],
    ['tampered-index-digest', buildSearchRequest(tampered, { text: 'привет', languageCode: 'ru' }), 'search', CODES.INDEX_NOT_SEARCHABLE],
  ];
}

function codeForHostile(module, entry) {
  const [, payload, phase] = entry;
  const result = phase === 'search'
    ? module.searchMultilingualEvidenceIndexV1(payload)
    : module.buildMultilingualEvidenceIndexV1(payload);
  return resultCode(result);
}

function mutationKilled(module, mutationId) {
  switch (mutationId) {
    case 'ignore-feature-flag':
      return module.buildMultilingualEvidenceIndexV1(buildRequest({ featureFlags: {} })).ok === false;
    case 'ignore-source-fence':
      return module.buildMultilingualEvidenceIndexV1(buildRequest({
        sourceFenceResult: allowedFence(SOURCE_BINDING, { ok: false, decision: 'DENY', code: 'YALKEN_SOURCE_FENCE_CANONICAL_REVISION_STALE' }),
      })).ok === false;
    case 'ignore-source-binding':
      return module.buildMultilingualEvidenceIndexV1(buildRequest({
        sourceBinding: { projectId: 'project-beta' },
        sourceFenceResult: allowedFence(SOURCE_BINDING),
      })).ok === false;
    case 'ignore-request-keyset': {
      const request = buildRequest();
      delete request.sourceBinding.sourceDigest;
      return module.buildMultilingualEvidenceIndexV1(request).ok === false;
    }
    case 'ignore-document-keyset': {
      const request = buildRequest();
      request.documents[0].silentDrop = true;
      return module.buildMultilingualEvidenceIndexV1(request).ok === false;
    }
    case 'ignore-unknown-language':
      return module.buildMultilingualEvidenceIndexV1(buildRequest({ languageCode: 'zz' })).ok === false;
    case 'ignore-empty-query': {
      const index = module.buildMultilingualEvidenceIndexV1(buildRequest());
      return module.searchMultilingualEvidenceIndexV1(buildSearchRequest(index, { text: '   ' })).ok === false;
    }
    case 'ignore-index-digest': {
      const index = module.buildMultilingualEvidenceIndexV1(buildRequest());
      const tampered = clone(index);
      tampered.sourceBinding.sourceDigest = `sha256:${'b'.repeat(64)}`;
      return module.searchMultilingualEvidenceIndexV1(buildSearchRequest(tampered)).ok === false;
    }
    case 'ignore-nfc-casefold': {
      const index = module.buildMultilingualEvidenceIndexV1(buildRequest({
        languageCode: 'fr',
        text: 'Café CAFÉ',
      }));
      const search = module.searchMultilingualEvidenceIndexV1(buildSearchRequest(index, { languageCode: 'fr', text: 'Café' }));
      return search.matches.length === 2;
    }
    case 'ignore-token-boundary': {
      const index = module.buildMultilingualEvidenceIndexV1(buildRequest({
        languageCode: 'en',
        text: 'Annabel Anna',
      }));
      const search = module.searchMultilingualEvidenceIndexV1(buildSearchRequest(index, { languageCode: 'en', text: 'Anna' }));
      return search.matches.length === 1 && search.matches[0].matchedText === 'Anna';
    }
    default:
      return false;
  }
}

export function runMultilingualEvidenceV1Model(module) {
  const disagreements = [];
  const cases = finiteCases();
  for (const entry of cases) {
    const oracle = independentBuildOracle(entry.request);
    const implementation = module.buildMultilingualEvidenceIndexV1(clone(entry.request));
    if (oracle.ok !== implementation.ok || oracle.code !== implementation.code) {
      disagreements.push({
        id: entry.id,
        oracle,
        implementation: { ok: implementation.ok, code: implementation.code },
      });
    }
  }

  const hostileFailures = [];
  for (const entry of hostileCorpus(module)) {
    const [id,, phase, expectedCode] = entry;
    const actualCode = codeForHostile(module, entry);
    if (actualCode !== expectedCode) {
      hostileFailures.push({ id, phase, expectedCode, actualCode });
    }
  }

  const survivors = [];
  for (const mutationId of MUTATION_CATALOG) {
    if (!mutationKilled(module, mutationId)) survivors.push(mutationId);
  }

  const supportedIndex = module.buildMultilingualEvidenceIndexV1(buildRequest({
    languageCode: 'ru',
    text: 'Привет ПРИВЕТ',
  }));
  const supportedSearch = module.searchMultilingualEvidenceIndexV1(buildSearchRequest(supportedIndex, { languageCode: 'ru', text: 'привет' }));
  const unknown = module.buildMultilingualEvidenceIndexV1(buildRequest({ languageCode: 'zz' }));

  return {
    schemaVersion: 'yalken.multilingualEvidence.modelReport.v1',
    cases: {
      total: cases.length,
      disagreements: disagreements.length,
      disagreementIds: disagreements.map((entry) => entry.id),
    },
    hostile: {
      total: hostileCorpus(module).length,
      failures: hostileFailures.length,
      failureIds: hostileFailures.map((entry) => entry.id),
    },
    mutations: {
      total: MUTATION_CATALOG.length,
      survivors: survivors.length,
      survivorIds: survivors,
    },
    controls: {
      supportedLanguageSearchPasses: supportedSearch.ok === true && supportedSearch.matches.length === 2,
      unknownLanguageAbstains: unknown.ok === false && unknown.code === CODES.LANGUAGE_ABSTAINED,
      featureDisabledIsNotPass: module.buildMultilingualEvidenceIndexV1(buildRequest({ featureFlags: {} })).ok === false,
      deterministicReport: stableJson(cases) === stableJson(finiteCases()),
    },
    resourceCeilings: {
      algorithm: 'O_TOTAL_UTF16_TEXT_PLUS_QUERY_NO_IO',
      finiteCases: 24,
      hostileCases: 12,
      semanticMutants: 10,
      productSlo: 'NOT_CLAIMED_LAB_ONLY',
    },
    skips: 0,
  };
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const module = await import(new URL('../../src/product/multilingualEvidenceV1.mjs', import.meta.url));
  const report = runMultilingualEvidenceV1Model(module);
  console.log(JSON.stringify(report, null, 2));
  if (report.cases.disagreements !== 0 || report.hostile.failures !== 0 || report.mutations.survivors !== 0) {
    process.exitCode = 1;
  }
}
