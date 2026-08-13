import crypto from 'node:crypto';

const SCHEMAS = Object.freeze({
  request: 'yalken.sourceFence.request.v1',
  token: 'yalken.sourceFence.token.v1',
});

const CODES = Object.freeze({
  AUTHORITY_NOT_GRANTED: 'YALKEN_SOURCE_FENCE_AUTHORITY_NOT_GRANTED',
  CANONICAL_REVISION_STALE: 'YALKEN_SOURCE_FENCE_CANONICAL_REVISION_STALE',
  DIRTY_DOCUMENT_REJECTED: 'YALKEN_SOURCE_FENCE_DIRTY_DOCUMENT_REJECTED',
  DIRTY_STATE_UNKNOWN: 'YALKEN_SOURCE_FENCE_DIRTY_STATE_UNKNOWN',
  DOCUMENT_ID_MISMATCH: 'YALKEN_SOURCE_FENCE_DOCUMENT_ID_MISMATCH',
  FENCE_TRANSPLANT_REJECTED: 'YALKEN_SOURCE_FENCE_TRANSPLANT_REJECTED',
  KEYSET_INVALID: 'YALKEN_SOURCE_FENCE_KEYSET_INVALID',
  PROJECT_ID_MISMATCH: 'YALKEN_SOURCE_FENCE_PROJECT_ID_MISMATCH',
  PURPOSE_MISMATCH: 'YALKEN_SOURCE_FENCE_PURPOSE_MISMATCH',
  ROOT_ID_MISMATCH: 'YALKEN_SOURCE_FENCE_ROOT_ID_MISMATCH',
  SCHEMA_INVALID: 'YALKEN_SOURCE_FENCE_SCHEMA_INVALID',
  SOURCE_DIGEST_MISMATCH: 'YALKEN_SOURCE_FENCE_SOURCE_DIGEST_MISMATCH',
  WORKING_REVISION_STALE: 'YALKEN_SOURCE_FENCE_WORKING_REVISION_STALE',
});

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;

const BASE_SOURCE = Object.freeze({
  projectId: 'project-alpha',
  rootId: 'root-main',
  documentId: 'scene-001',
  canonicalRevision: 'canon-r001',
  workingRevision: 'work-r001',
  sourceDigest: SHA_A,
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function tokenDigestPayload(input) {
  return {
    schemaVersion: SCHEMAS.token,
    purpose: input.purpose,
    projectId: input.projectId,
    rootId: input.rootId,
    documentId: input.documentId,
    canonicalRevision: input.canonicalRevision,
    workingRevision: input.workingRevision,
    sourceDigest: input.sourceDigest,
  };
}

function createOracleFence(input) {
  const payload = tokenDigestPayload(input);
  return {
    ...payload,
    fenceDigest: sha256Stable(payload),
  };
}

function withSource(overrides = {}) {
  return { ...BASE_SOURCE, ...overrides };
}

function withCurrent(overrides = {}) {
  return { ...withSource(), dirtyState: 'CLEAN', ...overrides };
}

function withAuthority(overrides = {}) {
  return {
    decision: 'ALLOW',
    mayWrite: true,
    commandId: 'command-save-current-source',
    ...overrides,
  };
}

function buildRequest(overrides = {}) {
  const purpose = overrides.purpose || 'WRITE_SOURCE';
  const expected = overrides.expected || withSource();
  const current = overrides.current || withCurrent();
  const fenceSource = overrides.fenceSource || expected;
  const fence = overrides.fence || createOracleFence({ purpose, ...fenceSource });
  return {
    schemaVersion: SCHEMAS.request,
    purpose,
    expected,
    current,
    fence,
    dirtyPolicy: overrides.dirtyPolicy || 'REQUIRE_CLEAN',
    authority: overrides.authority || withAuthority(),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function exactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).sort().join('\u0000') === [...keys].sort().join('\u0000');
}

function independentOracle(request, options = {}) {
  const skip = new Set(options.skip || []);
  const codes = [];

  if (!exactKeys(request, ['authority', 'current', 'dirtyPolicy', 'expected', 'fence', 'purpose', 'schemaVersion'])) {
    codes.push(CODES.KEYSET_INVALID);
    return { ok: false, codes };
  }
  if (request.schemaVersion !== SCHEMAS.request) codes.push(CODES.SCHEMA_INVALID);
  if (!exactKeys(request.expected, ['canonicalRevision', 'documentId', 'projectId', 'rootId', 'sourceDigest', 'workingRevision'])) {
    codes.push(CODES.KEYSET_INVALID);
  }
  if (!exactKeys(request.current, ['canonicalRevision', 'dirtyState', 'documentId', 'projectId', 'rootId', 'sourceDigest', 'workingRevision'])) {
    codes.push(CODES.KEYSET_INVALID);
  }
  if (!exactKeys(request.fence, ['canonicalRevision', 'documentId', 'fenceDigest', 'projectId', 'purpose', 'rootId', 'schemaVersion', 'sourceDigest', 'workingRevision'])) {
    codes.push(CODES.KEYSET_INVALID);
  }
  if (!exactKeys(request.authority, ['commandId', 'decision', 'mayWrite'])) {
    codes.push(CODES.KEYSET_INVALID);
  }
  if (codes.length > 0) return { ok: false, codes };

  if (request.fence.schemaVersion !== SCHEMAS.token) codes.push(CODES.SCHEMA_INVALID);
  if (!skip.has('purpose') && request.purpose !== request.fence.purpose) codes.push(CODES.PURPOSE_MISMATCH);
  const expectedFenceDigest = sha256Stable(tokenDigestPayload(request.fence));
  if (!skip.has('fence') && request.fence.fenceDigest !== expectedFenceDigest) codes.push(CODES.FENCE_TRANSPLANT_REJECTED);

  for (const key of ['projectId', 'rootId', 'documentId', 'canonicalRevision', 'workingRevision', 'sourceDigest']) {
    if (!skip.has('fence') && request.expected[key] !== request.fence[key]) codes.push(CODES.FENCE_TRANSPLANT_REJECTED);
  }
  if (!skip.has('project') && request.expected.projectId !== request.current.projectId) codes.push(CODES.PROJECT_ID_MISMATCH);
  if (!skip.has('root') && request.expected.rootId !== request.current.rootId) codes.push(CODES.ROOT_ID_MISMATCH);
  if (!skip.has('document') && request.expected.documentId !== request.current.documentId) codes.push(CODES.DOCUMENT_ID_MISMATCH);
  if (!skip.has('canonical') && request.expected.canonicalRevision !== request.current.canonicalRevision) codes.push(CODES.CANONICAL_REVISION_STALE);
  if (!skip.has('working') && request.expected.workingRevision !== request.current.workingRevision) codes.push(CODES.WORKING_REVISION_STALE);
  if (!skip.has('digest') && request.expected.sourceDigest !== request.current.sourceDigest) codes.push(CODES.SOURCE_DIGEST_MISMATCH);
  if (!skip.has('dirty')) {
    if (['UNKNOWN', 'ABSTAIN', 'CONFLICTING'].includes(request.current.dirtyState)) codes.push(CODES.DIRTY_STATE_UNKNOWN);
    if (request.dirtyPolicy === 'REQUIRE_CLEAN' && request.current.dirtyState === 'DIRTY') codes.push(CODES.DIRTY_DOCUMENT_REJECTED);
  }
  const requiredMayWrite = request.purpose === 'READ_SOURCE_SNAPSHOT' ? false : true;
  if (!skip.has('authority') && (request.authority.decision !== 'ALLOW' || request.authority.mayWrite !== requiredMayWrite)) {
    codes.push(CODES.AUTHORITY_NOT_GRANTED);
  }

  return { ok: codes.length === 0, codes: [...new Set(codes)] };
}

const HOSTILE_BUILDERS = Object.freeze([
  ['missing-current-sourceDigest', () => {
    const request = buildRequest();
    delete request.current.sourceDigest;
    return { request, expectedCode: CODES.KEYSET_INVALID };
  }],
  ['extra-expected-authority', () => {
    const request = buildRequest();
    request.expected.unclaimedAuthority = 'MUST_NOT_BE_IGNORED';
    return { request, expectedCode: CODES.KEYSET_INVALID };
  }],
  ['wrong-request-schema', () => ({
    request: buildRequest({}),
    patch: (request) => { request.schemaVersion = 'yalken.sourceFence.request.v0'; },
    expectedCode: CODES.SCHEMA_INVALID,
  })],
  ['wrong-project', () => ({
    request: buildRequest({ current: withCurrent({ projectId: 'project-beta' }) }),
    expectedCode: CODES.PROJECT_ID_MISMATCH,
  })],
  ['wrong-root', () => ({
    request: buildRequest({ current: withCurrent({ rootId: 'root-archive' }) }),
    expectedCode: CODES.ROOT_ID_MISMATCH,
  })],
  ['wrong-document', () => ({
    request: buildRequest({ current: withCurrent({ documentId: 'scene-999' }) }),
    expectedCode: CODES.DOCUMENT_ID_MISMATCH,
  })],
  ['stale-canonical-revision', () => ({
    request: buildRequest({ current: withCurrent({ canonicalRevision: 'canon-r002' }) }),
    expectedCode: CODES.CANONICAL_REVISION_STALE,
  })],
  ['stale-working-revision', () => ({
    request: buildRequest({ current: withCurrent({ workingRevision: 'work-r002' }) }),
    expectedCode: CODES.WORKING_REVISION_STALE,
  })],
  ['current-source-digest-changed', () => ({
    request: buildRequest({ current: withCurrent({ sourceDigest: SHA_B }) }),
    expectedCode: CODES.SOURCE_DIGEST_MISMATCH,
  })],
  ['dirty-document-require-clean', () => ({
    request: buildRequest({ current: withCurrent({ dirtyState: 'DIRTY' }), dirtyPolicy: 'REQUIRE_CLEAN' }),
    expectedCode: CODES.DIRTY_DOCUMENT_REJECTED,
  })],
  ['dirty-state-unknown', () => ({
    request: buildRequest({ current: withCurrent({ dirtyState: 'UNKNOWN' }) }),
    expectedCode: CODES.DIRTY_STATE_UNKNOWN,
  })],
  ['authority-unknown', () => ({
    request: buildRequest({ authority: withAuthority({ decision: 'UNKNOWN' }) }),
    expectedCode: CODES.AUTHORITY_NOT_GRANTED,
  })],
  ['authority-abstain', () => ({
    request: buildRequest({ authority: withAuthority({ decision: 'ABSTAIN' }) }),
    expectedCode: CODES.AUTHORITY_NOT_GRANTED,
  })],
  ['authority-conflicting', () => ({
    request: buildRequest({ authority: withAuthority({ decision: 'CONFLICTING' }) }),
    expectedCode: CODES.AUTHORITY_NOT_GRANTED,
  })],
  ['read-snapshot-with-write-authority', () => ({
    request: buildRequest({
      purpose: 'READ_SOURCE_SNAPSHOT',
      authority: withAuthority({ mayWrite: true, commandId: 'query-source-snapshot' }),
    }),
    expectedCode: CODES.AUTHORITY_NOT_GRANTED,
  })],
  ['fence-project-transplant', () => ({
    request: buildRequest({ fenceSource: withSource({ projectId: 'project-beta' }) }),
    expectedCode: CODES.FENCE_TRANSPLANT_REJECTED,
  })],
  ['purpose-mismatch', () => {
    const request = buildRequest();
    request.purpose = 'READ_SOURCE_SNAPSHOT';
    return { request, expectedCode: CODES.PURPOSE_MISMATCH };
  }],
]);

export const SOURCE_FENCE_V1_MUTATION_CATALOG = Object.freeze([
  ['ignore-project-mismatch', 'project'],
  ['ignore-root-mismatch', 'root'],
  ['ignore-document-mismatch', 'document'],
  ['ignore-canonical-revision', 'canonical'],
  ['ignore-working-revision', 'working'],
  ['ignore-source-digest', 'digest'],
  ['ignore-dirty-policy', 'dirty'],
  ['ignore-fence-transplant', 'fence'],
  ['ignore-authority', 'authority'],
]);

export function sourceFenceV1HostileCorpus() {
  return HOSTILE_BUILDERS.map(([id, build]) => {
    const built = build();
    if (typeof built.patch === 'function') built.patch(built.request);
    return {
      id,
      request: built.request,
      expectedCode: built.expectedCode,
    };
  });
}

function reasonCodes(result) {
  return Array.isArray(result.reasons) ? result.reasons.map((entry) => entry.code) : [];
}

function implementationDeniedWith(result, expectedCode) {
  return result?.ok === false && reasonCodes(result).includes(expectedCode);
}

function finiteCases() {
  const cases = [];
  const bits = [false, true];
  const dirtyModes = [
    ['clean-require-clean', 'CLEAN', 'REQUIRE_CLEAN'],
    ['dirty-require-clean', 'DIRTY', 'REQUIRE_CLEAN'],
    ['dirty-allow-matched-working', 'DIRTY', 'ALLOW_DIRTY_IF_WORKING_REVISION_MATCHES'],
  ];
  for (const projectMismatch of bits) {
    for (const rootMismatch of bits) {
      for (const documentMismatch of bits) {
        for (const canonicalMismatch of bits) {
          for (const workingMismatch of bits) {
            for (const digestMismatch of bits) {
              for (const [dirtyId, dirtyState, dirtyPolicy] of dirtyModes) {
                const current = withCurrent({
                  projectId: projectMismatch ? 'project-beta' : BASE_SOURCE.projectId,
                  rootId: rootMismatch ? 'root-archive' : BASE_SOURCE.rootId,
                  documentId: documentMismatch ? 'scene-999' : BASE_SOURCE.documentId,
                  canonicalRevision: canonicalMismatch ? 'canon-r002' : BASE_SOURCE.canonicalRevision,
                  workingRevision: workingMismatch ? 'work-r002' : BASE_SOURCE.workingRevision,
                  sourceDigest: digestMismatch ? SHA_B : BASE_SOURCE.sourceDigest,
                  dirtyState,
                });
                cases.push({
                  id: [
                    projectMismatch ? 'wrong-project' : 'same-project',
                    rootMismatch ? 'wrong-root' : 'same-root',
                    documentMismatch ? 'wrong-document' : 'same-document',
                    canonicalMismatch ? 'stale-canonical' : 'same-canonical',
                    workingMismatch ? 'stale-working' : 'same-working',
                    digestMismatch ? 'changed-digest' : 'same-digest',
                    dirtyId,
                  ].join('|'),
                  request: buildRequest({ current, dirtyPolicy }),
                });
              }
            }
          }
        }
      }
    }
  }
  return cases;
}

function mutationKilled(module, mutantSkip) {
  return sourceFenceV1HostileCorpus().some(({ request }) => {
    const baseline = independentOracle(request);
    const mutant = independentOracle(request, { skip: [mutantSkip] });
    const result = module.evaluateSourceFenceV1(clone(request));
    return baseline.ok === false && mutant.ok === true && result.ok === false;
  });
}

export function runSourceFenceV1FiniteModel(module) {
  const disagreements = [];
  const cases = finiteCases();

  for (const entry of cases) {
    const oracle = independentOracle(entry.request);
    const result = module.evaluateSourceFenceV1(clone(entry.request));
    const codes = reasonCodes(result);
    const expectedCodesPresent = oracle.codes.every((code) => codes.includes(code));
    if (result.ok !== oracle.ok || (!oracle.ok && !expectedCodesPresent)) {
      disagreements.push({
        id: entry.id,
        oracle,
        implementation: { ok: result.ok, codes },
      });
    }
  }

  const hostileFailures = [];
  for (const entry of sourceFenceV1HostileCorpus()) {
    const result = module.evaluateSourceFenceV1(clone(entry.request));
    if (!implementationDeniedWith(result, entry.expectedCode)) {
      hostileFailures.push({
        id: entry.id,
        expectedCode: entry.expectedCode,
        actual: { ok: result.ok, codes: reasonCodes(result) },
      });
    }
  }

  const survivors = [];
  for (const [id, mutantSkip] of SOURCE_FENCE_V1_MUTATION_CATALOG) {
    if (!mutationKilled(module, mutantSkip)) survivors.push(id);
  }

  return {
    schemaVersion: 'yalken.sourceFence.modelReport.v1',
    cases: {
      total: cases.length,
      disagreements: disagreements.length,
      disagreementIds: disagreements.map((entry) => entry.id),
    },
    hostile: {
      total: HOSTILE_BUILDERS.length,
      failures: hostileFailures.length,
      failureIds: hostileFailures.map((entry) => entry.id),
    },
    mutations: {
      total: SOURCE_FENCE_V1_MUTATION_CATALOG.length,
      survivors: survivors.length,
      survivorIds: survivors,
    },
    controls: {
      cleanWriteAllowed: module.evaluateSourceFenceV1(buildRequest()).ok === true,
      dirtyMatchedWriteAllowed: module.evaluateSourceFenceV1(buildRequest({
        current: withCurrent({ dirtyState: 'DIRTY' }),
        dirtyPolicy: 'ALLOW_DIRTY_IF_WORKING_REVISION_MATCHES',
      })).ok === true,
      restartVisibleFenceAllowed: module.evaluateSourceFenceV1({
        ...buildRequest(),
        fence: JSON.parse(JSON.stringify(buildRequest().fence)),
      }).ok === true,
      readSnapshotLeastPrivilegeAllowed: module.evaluateSourceFenceV1(buildRequest({
        purpose: 'READ_SOURCE_SNAPSHOT',
        authority: withAuthority({ mayWrite: false, commandId: 'query-source-snapshot' }),
      })).ok === true,
      readSnapshotWriteAuthorityDenied: module.evaluateSourceFenceV1(buildRequest({
        purpose: 'READ_SOURCE_SNAPSHOT',
        authority: withAuthority({ mayWrite: true, commandId: 'query-source-snapshot' }),
      })).ok === false,
    },
    resourceCeilings: {
      algorithm: 'O_1_PER_REQUEST_NO_IO',
      maxFiniteCases: 192,
      hostileCases: 17,
      semanticMutants: 9,
      productSlo: 'NOT_CLAIMED_LAB_ONLY',
    },
    skips: 0,
  };
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const module = await import(new URL('../../src/product/sourceFenceV1.mjs', import.meta.url));
  const report = runSourceFenceV1FiniteModel(module);
  console.log(JSON.stringify(report, null, 2));
  if (report.cases.disagreements !== 0 || report.hostile.failures !== 0 || report.mutations.survivors !== 0) {
    process.exitCode = 1;
  }
}
