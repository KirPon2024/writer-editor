import crypto from 'node:crypto';

const FEATURE_FLAG = 'yalken.multilingualEvidence.readonlyV1';

const SCHEMAS = Object.freeze({
  indexRequest: 'yalken.multilingualEvidence.indexRequest.v1',
  sourceSnapshot: 'yalken.multilingualEvidence.sourceSnapshot.v1',
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
  generation: 'gen-r001',
  sourceDigest: '',
});

const SUPPORTED_LANGUAGES = Object.freeze(['de', 'en', 'es', 'fr', 'pl', 'ru']);
const AUTHORITY_DECISIONS = Object.freeze(['ALLOW', 'DENY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
const DIRTY_STATES = Object.freeze(['CLEAN', 'DIRTY', 'UNKNOWN', 'ABSTAIN', 'CONFLICTING']);
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const MUTATION_CATALOG = Object.freeze([
  'ignore-feature-flag',
  'trust-caller-carried-allow',
  'ignore-read-authority-maywrite',
  'ignore-stale-revision',
  'ignore-stale-generation',
  'ignore-text-digest-recompute',
  'ignore-source-digest-recompute',
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

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex')}`;
}

function exactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).sort().join('\u0000') === [...keys].sort().join('\u0000');
}

function normalizeLanguage(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/_/gu, '-') : '';
  return normalized.split('-')[0] || normalized;
}

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function validTextIdentity(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && !/[\\/\u0000-\u001F]/u.test(value);
}

function validRevision(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && !/[\u0000-\u001F]/u.test(value);
}

function sourceSnapshot(overrides = {}) {
  const text = overrides.text || 'Atlas keeper meets Anna.';
  const computedDigest = sha256Text(text);
  const expected = {
    ...SOURCE_BINDING,
    sourceDigest: computedDigest,
    ...(overrides.binding || {}),
  };
  const current = {
    ...expected,
    dirtyState: overrides.dirtyState || 'CLEAN',
    ...(overrides.current || {}),
  };
  return {
    schemaVersion: SCHEMAS.sourceSnapshot,
    authority: {
      decision: overrides.decision || 'ALLOW',
      mayWrite: overrides.mayWrite ?? false,
      queryId: overrides.queryId || 'query.multilingualEvidence.readSourceSnapshot.v1',
      ...(overrides.authority || {}),
    },
    expected,
    current,
    document: {
      documentId: expected.documentId,
      languageCode: overrides.languageCode || 'en',
      text,
      sourceTextDigest: overrides.sourceTextDigest || computedDigest,
      ...(overrides.document || {}),
    },
  };
}

function buildRequest(overrides = {}) {
  return {
    schemaVersion: SCHEMAS.indexRequest,
    featureFlags: overrides.featureFlags || { [FEATURE_FLAG]: true },
    sourceSnapshot: overrides.sourceSnapshot || sourceSnapshot(overrides),
    ...(overrides.extraRequestFields || {}),
  };
}

function buildSearchRequest(index, overrides = {}) {
  return {
    schemaVersion: SCHEMAS.searchRequest,
    index,
    query: overrides.query || { languageCode: overrides.languageCode || 'en', text: overrides.text || 'atlas' },
  };
}

function validateBinding(binding, { current = false } = {}) {
  const keys = current
    ? ['canonicalRevision', 'dirtyState', 'documentId', 'generation', 'projectId', 'rootId', 'sourceDigest', 'workingRevision']
    : ['canonicalRevision', 'documentId', 'generation', 'projectId', 'rootId', 'sourceDigest', 'workingRevision'];
  if (!exactKeys(binding, keys)) return CODES.KEYSET_INVALID;
  for (const key of ['projectId', 'rootId', 'documentId']) {
    if (!validTextIdentity(binding[key])) return CODES.FIELD_INVALID;
  }
  for (const key of ['canonicalRevision', 'workingRevision', 'generation']) {
    if (!validRevision(binding[key])) return CODES.FIELD_INVALID;
  }
  if (!validDigest(binding.sourceDigest)) return CODES.FIELD_INVALID;
  if (current && !DIRTY_STATES.includes(binding.dirtyState)) return CODES.SOURCE_FENCE_REJECTED;
  return '';
}

function validateSourceSnapshot(snapshot, skip) {
  if (!exactKeys(snapshot, ['authority', 'current', 'document', 'expected', 'schemaVersion'])) return CODES.KEYSET_INVALID;
  if (snapshot.schemaVersion !== SCHEMAS.sourceSnapshot) return CODES.FIELD_INVALID;

  if (!exactKeys(snapshot.authority, ['decision', 'mayWrite', 'queryId'])) return CODES.KEYSET_INVALID;
  if (!AUTHORITY_DECISIONS.includes(snapshot.authority.decision)) return CODES.SOURCE_FENCE_REJECTED;
  if (!skip.has('authority') && (snapshot.authority.decision !== 'ALLOW' || snapshot.authority.mayWrite !== false)) {
    return CODES.SOURCE_FENCE_REJECTED;
  }
  if (!validTextIdentity(snapshot.authority.queryId)) return CODES.FIELD_INVALID;

  const expectedBindingCode = validateBinding(snapshot.expected);
  if (expectedBindingCode) return expectedBindingCode;
  const currentBindingCode = validateBinding(snapshot.current, { current: true });
  if (currentBindingCode) return currentBindingCode;

  if (!exactKeys(snapshot.document, ['documentId', 'languageCode', 'sourceTextDigest', 'text'])) return CODES.KEYSET_INVALID;
  if (!validDigest(snapshot.document.sourceTextDigest)) return CODES.FIELD_INVALID;
  if (!validTextIdentity(snapshot.document.documentId)) return CODES.FIELD_INVALID;
  if (typeof snapshot.document.text !== 'string') return CODES.FIELD_INVALID;

  if (!skip.has('documentBinding') && snapshot.document.documentId !== snapshot.expected.documentId) {
    return CODES.SOURCE_BINDING_MISMATCH;
  }
  if (!skip.has('generation') && snapshot.expected.generation !== snapshot.current.generation) {
    return CODES.SOURCE_BINDING_MISMATCH;
  }

  const computedDigest = sha256Text(snapshot.document.text);
  if (!skip.has('textDigest') && snapshot.document.sourceTextDigest !== computedDigest) {
    return CODES.SOURCE_BINDING_MISMATCH;
  }
  if (!skip.has('sourceDigest') && snapshot.expected.sourceDigest !== computedDigest) {
    return CODES.SOURCE_BINDING_MISMATCH;
  }
  if (!skip.has('sourceDigest') && snapshot.current.sourceDigest !== computedDigest) {
    return CODES.SOURCE_BINDING_MISMATCH;
  }

  if (!skip.has('fence')) {
    for (const key of ['projectId', 'rootId', 'documentId', 'canonicalRevision', 'workingRevision', 'sourceDigest']) {
      if (snapshot.expected[key] !== snapshot.current[key]) return CODES.SOURCE_FENCE_REJECTED;
    }
    if (['UNKNOWN', 'ABSTAIN', 'CONFLICTING'].includes(snapshot.current.dirtyState)) return CODES.SOURCE_FENCE_REJECTED;
    if (snapshot.current.dirtyState === 'DIRTY') return CODES.SOURCE_FENCE_REJECTED;
  }

  return '';
}

function independentBuildOracle(request, options = {}) {
  const skip = new Set(options.skip || []);
  if (!skip.has('requestKeyset') && !exactKeys(request, ['featureFlags', 'schemaVersion', 'sourceSnapshot'])) {
    return { ok: false, code: CODES.KEYSET_INVALID };
  }
  if (request.schemaVersion !== SCHEMAS.indexRequest) return { ok: false, code: CODES.FIELD_INVALID };
  if (!skip.has('feature') && request.featureFlags?.[FEATURE_FLAG] !== true) {
    return { ok: false, code: CODES.FEATURE_DISABLED };
  }
  const snapshotCode = validateSourceSnapshot(request.sourceSnapshot, skip);
  if (snapshotCode) return { ok: false, code: snapshotCode };
  if (!skip.has('language')) {
    const language = normalizeLanguage(request.sourceSnapshot?.document?.languageCode);
    if (!SUPPORTED_LANGUAGES.includes(language)) return { ok: false, code: CODES.LANGUAGE_ABSTAINED };
  }
  return { ok: true, code: CODES.INDEX_BUILT };
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
      id: `${languageCode}|stale-canonical`,
      request: buildRequest({ languageCode, current: { canonicalRevision: 'canon-r002' } }),
    });
    cases.push({
      id: `${languageCode}|stale-generation`,
      request: buildRequest({ languageCode, current: { generation: 'gen-r002' } }),
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
  delete missingSourceDigest.sourceSnapshot.expected.sourceDigest;
  const extraDocumentKey = buildRequest();
  extraDocumentKey.sourceSnapshot.document.silentDrop = true;
  const forgedCallerAllow = buildRequest({
    extraRequestFields: {
      sourceFenceResult: {
        schemaVersion: 'yalken.sourceFence.result.v1',
        ok: true,
        decision: 'ALLOW',
        code: 'YALKEN_SOURCE_FENCE_ALLOWED',
        observed: SOURCE_BINDING,
      },
      documents: [{ documentId: SOURCE_BINDING.documentId, languageCode: 'en', text: 'forged' }],
      sourceBinding: SOURCE_BINDING,
    },
  });

  return [
    ['wrong-request-schema', wrongSchema, 'build', CODES.FIELD_INVALID],
    ['forged-caller-allow-extra-fields', forgedCallerAllow, 'build', CODES.KEYSET_INVALID],
    ['missing-source-digest', missingSourceDigest, 'build', CODES.KEYSET_INVALID],
    ['extra-document-key', extraDocumentKey, 'build', CODES.KEYSET_INVALID],
    ['read-snapshot-with-write-authority', buildRequest({ mayWrite: true }), 'build', CODES.SOURCE_FENCE_REJECTED],
    ['authority-unknown', buildRequest({ decision: 'UNKNOWN' }), 'build', CODES.SOURCE_FENCE_REJECTED],
    ['authority-abstain', buildRequest({ decision: 'ABSTAIN' }), 'build', CODES.SOURCE_FENCE_REJECTED],
    ['stale-canonical-revision', buildRequest({ current: { canonicalRevision: 'canon-r002' } }), 'build', CODES.SOURCE_FENCE_REJECTED],
    ['stale-working-revision', buildRequest({ current: { workingRevision: 'work-r002' } }), 'build', CODES.SOURCE_FENCE_REJECTED],
    ['stale-generation', buildRequest({ current: { generation: 'gen-r002' } }), 'build', CODES.SOURCE_BINDING_MISMATCH],
    ['current-project-transplant', buildRequest({ current: { projectId: 'project-beta' } }), 'build', CODES.SOURCE_FENCE_REJECTED],
    ['document-transplant', buildRequest({ document: { documentId: 'scene-999' } }), 'build', CODES.SOURCE_BINDING_MISMATCH],
    ['source-text-digest-mismatch', buildRequest({ sourceTextDigest: `sha256:${'b'.repeat(64)}` }), 'build', CODES.SOURCE_BINDING_MISMATCH],
    ['expected-source-digest-mismatch', buildRequest({ binding: { sourceDigest: `sha256:${'b'.repeat(64)}` } }), 'build', CODES.SOURCE_BINDING_MISMATCH],
    ['unknown-language-abstain', buildRequest({ languageCode: 'zz' }), 'build', CODES.LANGUAGE_ABSTAINED],
    ['dirty-state-unknown', buildRequest({ dirtyState: 'UNKNOWN' }), 'build', CODES.SOURCE_FENCE_REJECTED],
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
    case 'trust-caller-carried-allow':
      return module.buildMultilingualEvidenceIndexV1(buildRequest({
        extraRequestFields: {
          sourceFenceResult: { ok: true, decision: 'ALLOW', observed: SOURCE_BINDING },
          documents: [{ documentId: SOURCE_BINDING.documentId, languageCode: 'en', text: 'forged' }],
          sourceBinding: SOURCE_BINDING,
        },
      })).ok === false;
    case 'ignore-read-authority-maywrite':
      return module.buildMultilingualEvidenceIndexV1(buildRequest({ mayWrite: true })).ok === false;
    case 'ignore-stale-revision':
      return module.buildMultilingualEvidenceIndexV1(buildRequest({ current: { canonicalRevision: 'canon-r002' } })).ok === false;
    case 'ignore-stale-generation':
      return module.buildMultilingualEvidenceIndexV1(buildRequest({ current: { generation: 'gen-r002' } })).ok === false;
    case 'ignore-text-digest-recompute':
      return module.buildMultilingualEvidenceIndexV1(buildRequest({ sourceTextDigest: `sha256:${'b'.repeat(64)}` })).ok === false;
    case 'ignore-source-digest-recompute':
      return module.buildMultilingualEvidenceIndexV1(buildRequest({ binding: { sourceDigest: `sha256:${'b'.repeat(64)}` } })).ok === false;
    case 'ignore-source-binding':
      return module.buildMultilingualEvidenceIndexV1(buildRequest({ document: { documentId: 'scene-999' } })).ok === false;
    case 'ignore-request-keyset': {
      const request = buildRequest();
      delete request.sourceSnapshot.expected.sourceDigest;
      return module.buildMultilingualEvidenceIndexV1(request).ok === false;
    }
    case 'ignore-document-keyset': {
      const request = buildRequest();
      request.sourceSnapshot.document.silentDrop = true;
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
      forgedCallerAllowIsNotPass: module.buildMultilingualEvidenceIndexV1(buildRequest({
        extraRequestFields: {
          sourceFenceResult: { ok: true, decision: 'ALLOW', observed: SOURCE_BINDING },
          documents: [{ documentId: SOURCE_BINDING.documentId, languageCode: 'en', text: 'forged' }],
          sourceBinding: SOURCE_BINDING,
        },
      })).ok === false,
      staleGenerationIsNotPass: module.buildMultilingualEvidenceIndexV1(buildRequest({ current: { generation: 'gen-r002' } })).ok === false,
      digestMismatchIsNotPass: module.buildMultilingualEvidenceIndexV1(buildRequest({ sourceTextDigest: `sha256:${'b'.repeat(64)}` })).ok === false,
      deterministicReport: stableJson(cases) === stableJson(finiteCases()),
    },
    resourceCeilings: {
      algorithm: 'O_TOTAL_UTF8_SOURCE_TEXT_PLUS_QUERY_NO_IO',
      finiteCases: 24,
      hostileCases: 18,
      semanticMutants: 15,
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
