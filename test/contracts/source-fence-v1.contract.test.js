'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'product', 'sourceFenceV1.mjs');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'source-fence-v1-model.mjs');

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

function assertReason(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'DENY');
  assert.ok(
    result.reasons.some((reason) => reason.code === code),
    `expected ${code} in ${JSON.stringify(result.reasons)}`,
  );
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const BASE_SOURCE = Object.freeze({
  projectId: 'project-alpha',
  rootId: 'root-main',
  documentId: 'scene-001',
  canonicalRevision: 'canon-r001',
  workingRevision: 'work-r001',
  sourceDigest: SHA_A,
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function buildRequest(module, overrides = {}) {
  const purpose = overrides.purpose || 'WRITE_SOURCE';
  const expected = overrides.expected || withSource();
  const current = overrides.current || withCurrent();
  const fenceSource = overrides.fenceSource || expected;
  const fence = overrides.fence || module.createSourceFenceTokenV1({ purpose, ...fenceSource });
  return {
    schemaVersion: module.SOURCE_FENCE_V1_SCHEMAS.request,
    purpose,
    expected,
    current,
    fence,
    dirtyPolicy: overrides.dirtyPolicy || 'REQUIRE_CLEAN',
    authority: overrides.authority || withAuthority(),
  };
}

test('S0 source fence v1 exports only the closed versioned public contract', async () => {
  const module = await loadModule();

  assert.deepEqual(sortedKeys(module.SOURCE_FENCE_V1_SCHEMAS), [
    'observation',
    'request',
    'result',
    'token',
  ]);
  assert.deepEqual(module.SOURCE_FENCE_V1_SCHEMAS, {
    observation: 'yalken.sourceFence.observation.v1',
    request: 'yalken.sourceFence.request.v1',
    token: 'yalken.sourceFence.token.v1',
    result: 'yalken.sourceFence.result.v1',
  });

  assert.deepEqual(sortedKeys(module.SOURCE_FENCE_V1_CODES), [
    'ALLOWED',
    'AUTHORITY_NOT_GRANTED',
    'CANONICAL_REVISION_STALE',
    'DIRTY_DOCUMENT_REJECTED',
    'DIRTY_STATE_UNKNOWN',
    'DOCUMENT_ID_MISMATCH',
    'FENCE_TRANSPLANT_REJECTED',
    'FIELD_INVALID',
    'KEYSET_INVALID',
    'PROJECT_ID_MISMATCH',
    'PURPOSE_MISMATCH',
    'ROOT_ID_MISMATCH',
    'SCHEMA_INVALID',
    'SOURCE_DIGEST_MISMATCH',
    'WORKING_REVISION_STALE',
  ]);
});

test('S0 source fence v1 closes request/result keys and rejects missing or extra evidence', async () => {
  const module = await loadModule();
  const { SOURCE_FENCE_V1_CODES: CODES } = module;
  const valid = buildRequest(module);

  const allowed = module.evaluateSourceFenceV1(valid);
  assert.equal(allowed.ok, true);
  assert.equal(allowed.code, CODES.ALLOWED);
  assert.deepEqual(sortedKeys(allowed), ['code', 'decision', 'observed', 'ok', 'reasons', 'schemaVersion']);
  assert.deepEqual(sortedKeys(allowed.observed), [
    'canonicalRevision',
    'dirtyPolicy',
    'dirtyState',
    'documentId',
    'projectId',
    'purpose',
    'rootId',
    'sourceDigest',
    'workingRevision',
  ]);

  const missing = clone(valid);
  delete missing.current.sourceDigest;
  assertReason(module.evaluateSourceFenceV1(missing), CODES.KEYSET_INVALID);

  const extra = clone(valid);
  extra.expected.unclaimedAuthority = 'MUST_NOT_BE_IGNORED';
  assertReason(module.evaluateSourceFenceV1(extra), CODES.KEYSET_INVALID);
});

test('S0 source fence v1 rejects stale canonical revision, dirty disallowed document, and wrong identities', async () => {
  const module = await loadModule();
  const { SOURCE_FENCE_V1_CODES: CODES } = module;

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      current: withCurrent({ canonicalRevision: 'canon-r002' }),
    })),
    CODES.CANONICAL_REVISION_STALE,
  );

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      current: withCurrent({ dirtyState: 'DIRTY' }),
      dirtyPolicy: 'REQUIRE_CLEAN',
    })),
    CODES.DIRTY_DOCUMENT_REJECTED,
  );

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      current: withCurrent({ projectId: 'project-beta' }),
    })),
    CODES.PROJECT_ID_MISMATCH,
  );

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      current: withCurrent({ rootId: 'root-archive' }),
    })),
    CODES.ROOT_ID_MISMATCH,
  );

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      current: withCurrent({ documentId: 'scene-999' }),
    })),
    CODES.DOCUMENT_ID_MISMATCH,
  );
});

test('S0 source fence v1 rejects replay/transplant fences and lost-update interleavings', async () => {
  const module = await loadModule();
  const { SOURCE_FENCE_V1_CODES: CODES } = module;

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      fenceSource: withSource({ projectId: 'project-beta' }),
    })),
    CODES.FENCE_TRANSPLANT_REJECTED,
  );

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      current: withCurrent({ workingRevision: 'work-r002' }),
    })),
    CODES.WORKING_REVISION_STALE,
  );

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      current: withCurrent({ sourceDigest: SHA_B }),
    })),
    CODES.SOURCE_DIGEST_MISMATCH,
  );

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      current: withCurrent({ canonicalRevision: 'canon-r002', sourceDigest: SHA_B }),
    })),
    CODES.CANONICAL_REVISION_STALE,
  );
});

test('S0 source fence v1 distinguishes least-privilege read snapshot authority from write authority', async () => {
  const module = await loadModule();
  const { SOURCE_FENCE_V1_CODES: CODES } = module;

  const readOnly = module.evaluateSourceFenceV1(buildRequest(module, {
    purpose: 'READ_SOURCE_SNAPSHOT',
    authority: withAuthority({
      mayWrite: false,
      commandId: 'query-source-snapshot',
    }),
  }));
  assert.equal(readOnly.ok, true);
  assert.equal(readOnly.code, CODES.ALLOWED);
  assert.equal(readOnly.observed.purpose, 'READ_SOURCE_SNAPSHOT');

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      purpose: 'READ_SOURCE_SNAPSHOT',
      authority: withAuthority({
        mayWrite: true,
        commandId: 'query-source-snapshot',
      }),
    })),
    CODES.AUTHORITY_NOT_GRANTED,
  );

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      purpose: 'WRITE_SOURCE',
      authority: withAuthority({ mayWrite: false }),
    })),
    CODES.AUTHORITY_NOT_GRANTED,
  );
});

test('S0 source fence v1 preserves a restart-visible fence but invalidates it after source changes', async () => {
  const module = await loadModule();
  const { SOURCE_FENCE_V1_CODES: CODES } = module;
  const request = buildRequest(module);
  const restarted = { ...request, fence: JSON.parse(JSON.stringify(request.fence)) };

  const allowed = module.evaluateSourceFenceV1(restarted);
  assert.equal(allowed.ok, true);
  assert.equal(allowed.code, CODES.ALLOWED);

  const staleAfterRestart = clone(restarted);
  staleAfterRestart.current.canonicalRevision = 'canon-r002';
  staleAfterRestart.current.sourceDigest = SHA_B;
  assertReason(module.evaluateSourceFenceV1(staleAfterRestart), CODES.CANONICAL_REVISION_STALE);
});

test('S0 source fence v1 never aggregates UNKNOWN ABSTAIN or CONFLICTING into PASS', async () => {
  const module = await loadModule();
  const { SOURCE_FENCE_V1_CODES: CODES } = module;

  assertReason(
    module.evaluateSourceFenceV1(buildRequest(module, {
      current: withCurrent({ dirtyState: 'UNKNOWN' }),
    })),
    CODES.DIRTY_STATE_UNKNOWN,
  );

  for (const decision of ['UNKNOWN', 'ABSTAIN', 'CONFLICTING']) {
    assertReason(
      module.evaluateSourceFenceV1(buildRequest(module, {
        authority: withAuthority({ decision }),
      })),
      CODES.AUTHORITY_NOT_GRANTED,
    );
  }
});

test('S0 source fence v1 generated finite model, hostile corpus and independent oracle are deterministic', async () => {
  const module = await loadModule();
  const model = await loadModel();

  const first = model.runSourceFenceV1FiniteModel(module);
  const second = model.runSourceFenceV1FiniteModel(module);

  assert.equal(first.schemaVersion, 'yalken.sourceFence.modelReport.v1');
  assert.equal(stableJson(first), stableJson(second));
  assert.equal(first.cases.disagreements, 0);
  assert.equal(first.cases.total, 192);
  assert.equal(first.hostile.total, 17);
  assert.equal(first.hostile.failures, 0);
  assert.equal(first.mutations.total, 9);
  assert.equal(first.mutations.survivors, 0);
  assert.equal(first.skips, 0);
  assert.deepEqual(first.resourceCeilings, {
    algorithm: 'O_1_PER_REQUEST_NO_IO',
    maxFiniteCases: 192,
    hostileCases: 17,
    semanticMutants: 9,
    productSlo: 'NOT_CLAIMED_LAB_ONLY',
  });
});
