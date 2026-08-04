const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const LIB_PATH = path.join(REPO_ROOT, 'scripts', 'agent-guardrails-lib.mjs');

async function loadGuardrails() {
  return import(pathToFileURL(LIB_PATH).href);
}

function currentHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function validDeclaration(overrides = {}) {
  return {
    schemaVersion: 1,
    taskId: 'AGENT_GUARDRAIL_CONTRACT_TEST',
    objective: 'Prove repository-native architecture declaration validation',
    taskType: 'HYGIENE_ISOLATION',
    bindingBaseSha: currentHead(),
    scopeIn: ['docs/AGENT_START_PROTOCOL.md'],
    scopeOut: ['src/renderer'],
    productAuthority: 'NOT_APPLICABLE_DOCS_ONLY',
    commandAuthority: 'NOT_APPLICABLE_DOCS_ONLY',
    designAuthority: 'NOT_APPLICABLE_DOCS_ONLY',
    operationKinds: ['NOT_APPLICABLE_DOCS_ONLY'],
    writePaths: ['DOCUMENTATION_ONLY'],
    readPaths: ['CANON_AND_EXACT_SOURCE_READS'],
    productPorts: ['NOT_APPLICABLE_DOCS_ONLY'],
    designOsPorts: ['NOT_APPLICABLE_DOCS_ONLY'],
    readProjections: ['NOT_APPLICABLE_DOCS_ONLY'],
    stateClasses: ['NOT_APPLICABLE_DOCS_ONLY'],
    identityGuards: ['EXACT_HEAD_AND_DOCUMENT_VERSION'],
    capabilityRevalidation: 'NOT_APPLICABLE_DOCS_ONLY',
    fallbacks: ['FAIL_CLOSED_ON_AUTHORITY_OR_SCHEMA_DRIFT'],
    recoveryAndNegativeChecks: ['VALIDATOR_REJECTS_INVALID_DECLARATION'],
    securityAndInputBoundary: 'NO_RUNTIME_OR_EXTERNAL_INPUT_CHANGE',
    performanceAndAccessibility: 'NOT_APPLICABLE_DOCS_ONLY',
    currentReality: ['REPOSITORY_ENTRYPOINTS_EXIST_ON_EXACT_HEAD'],
    targetOnly: ['NO_PRODUCT_RUNTIME_COMPLETENESS_CLAIM'],
    designToolRouter: 'NOT_APPLICABLE',
    dependenciesAndNetwork: 'NO_NEW_DEPENDENCY_NO_RUNTIME_NETWORK',
    deliveryPolicy: {
      commitRequired: true,
      pushRequired: true,
      prRequired: true,
      mergeRequired: true,
      postMergeExactHeadVerificationRequired: true,
    },
    rollbackPlan: 'REVERT_THE_SINGLE_GUARDRAIL_CONTOUR',
    ...overrides,
  };
}

test('agent architecture guardrails validate the active repository contract', async () => {
  const guardrails = await loadGuardrails();
  const result = guardrails.validateRepositoryGuardrails({ repoRoot: REPO_ROOT });
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.details.currentCorexPath, 'docs/corex/COREX.v2.md');
  assert.equal(result.details.bootstrapSpecId, 'AGENT_BOOTSTRAP_REPOSITORY_NATIVE_V2_0');
});

test('agent bootstrap fails closed without one concrete objective', async () => {
  const guardrails = await loadGuardrails();
  const result = guardrails.buildContextPacket({ repoRoot: REPO_ROOT, objective: '   ' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'E_AGENT_OBJECTIVE_REQUIRED'));
});

test('agent bootstrap emits exact-head context for an objective', async () => {
  const guardrails = await loadGuardrails();
  const result = guardrails.buildContextPacket({
    repoRoot: REPO_ROOT,
    objective: 'Validate repository-native context recovery',
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.packet.headSha, currentHead());
  assert.equal(result.packet.activeCanon.status, 'ACTIVE_CANON');
  assert.equal(result.packet.currentCorex, 'docs/corex/COREX.v2.md');
  assert.ok(result.packet.readingOrder.includes('docs/ARCHITECTURE_ONE_PAGE.md'));
});

test('task architecture preflight accepts a complete bounded declaration', async () => {
  const guardrails = await loadGuardrails();
  const result = guardrails.validateTaskDeclaration({
    repoRoot: REPO_ROOT,
    declaration: validDeclaration(),
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.details.scopeInCount, 1);
  assert.equal(result.details.scopeOutCount, 1);
});

test('task architecture preflight rejects a missing authority field', async () => {
  const guardrails = await loadGuardrails();
  const declaration = validDeclaration();
  delete declaration.commandAuthority;
  const result = guardrails.validateTaskDeclaration({ repoRoot: REPO_ROOT, declaration });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => (
    entry.code === 'E_TASK_DECLARATION_INVALID' && entry.field === 'commandAuthority'
  )));
});

test('task architecture preflight rejects a non-string authority value', async () => {
  const guardrails = await loadGuardrails();
  const result = guardrails.validateTaskDeclaration({
    repoRoot: REPO_ROOT,
    declaration: validDeclaration({ productAuthority: { owner: 'invalid' } }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => (
    entry.code === 'E_TASK_DECLARATION_INVALID' && entry.field === 'productAuthority'
  )));
});

test('task architecture preflight rejects stale base SHA', async () => {
  const guardrails = await loadGuardrails();
  const result = guardrails.validateTaskDeclaration({
    repoRoot: REPO_ROOT,
    declaration: validDeclaration({ bindingBaseSha: '0'.repeat(40) }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'E_BASE_SHA_MISMATCH'));
});

test('task architecture preflight rejects UI work without Lazyweb-first routing', async () => {
  const guardrails = await loadGuardrails();
  const result = guardrails.validateTaskDeclaration({
    repoRoot: REPO_ROOT,
    declaration: validDeclaration({ taskType: 'PRODUCT_UI' }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === 'E_DESIGN_TOOL_ROUTER_MISMATCH'));
});

test('task architecture preflight rejects an incomplete write delivery chain', async () => {
  const guardrails = await loadGuardrails();
  const declaration = validDeclaration();
  declaration.deliveryPolicy.postMergeExactHeadVerificationRequired = false;
  const result = guardrails.validateTaskDeclaration({ repoRoot: REPO_ROOT, declaration });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => (
    entry.code === 'E_TASK_DECLARATION_INVALID'
      && entry.message.includes('delivery flags default to true')
  )));
});
