const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const LIB_PATH = path.join(REPO_ROOT, 'scripts', 'agent-guardrails-lib.mjs');
const VALIDATOR_PATH = path.join(REPO_ROOT, 'scripts', 'validate-agent-guardrails.mjs');

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

test('agent entrypoint requires every MAP MOVE PROVE protocol marker', async () => {
  const guardrails = await loadGuardrails();
  const agentText = fs.readFileSync(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8');
  assert.deepEqual(guardrails.findMissingRequiredTokens(agentText), []);
  const integrity = guardrails.validateAgentEntrypointText(agentText);
  assert.equal(integrity.ok, true, JSON.stringify(integrity.errors, null, 2));
  assert.equal(integrity.protocolSha256, guardrails.MAP_MOVE_PROVE_PROTOCOL_SHA256);

  const protocolMarkers = [
    'MAP_MOVE_PROVE_PROTOCOL_V1',
    'MAP → MOVE → PROVE',
    'EVIDENCE_NEVER_CREATES_AUTHORITY',
    'MUTATION_ALLOWED =',
    'CLAIM_STRENGTH = min(',
    'DONE =',
  ];
  for (const marker of protocolMarkers) {
    const strippedText = agentText.replaceAll(marker, 'REMOVED_PROTOCOL_MARKER');
    assert.ok(
      guardrails.findMissingRequiredTokens(strippedText).includes(marker),
      `guardrails must reject AGENTS.md without ${marker}`,
    );
  }
});

test('agent entrypoint rejects a decoy-marker shell after the full protocol section is removed', async () => {
  const guardrails = await loadGuardrails();
  const agentText = fs.readFileSync(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8');
  const section = guardrails.extractSingleBoundedSection(agentText);
  assert.equal(section.ok, true, section.failDetail);

  let tamperedText = agentText.replace(section.text, '');
  const decoyMarkers = guardrails.AGENT_ENTRYPOINT_REQUIRED_TOKENS
    .filter((token) => !tamperedText.includes(token));
  tamperedText += `\n<!-- TAMPERED_DECOY_MARKERS_ONLY -->\n${decoyMarkers.join('\n')}\n`;
  assert.deepEqual(guardrails.findMissingRequiredTokens(tamperedText), []);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-guardrails-tampered-'));
  try {
    const clone = spawnSync('git', ['clone', '--quiet', '--shared', '--no-checkout', REPO_ROOT, fixtureRoot], {
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(clone.status, 0, `${clone.stdout}\n${clone.stderr}`);
    const checkout = spawnSync('git', ['-C', fixtureRoot, 'checkout', '--quiet', 'HEAD'], {
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(checkout.status, 0, `${checkout.stdout}\n${checkout.stderr}`);
    fs.writeFileSync(path.join(fixtureRoot, 'AGENTS.md'), tamperedText, 'utf8');

    const validation = spawnSync(process.execPath, [VALIDATOR_PATH, '--json'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(validation.status, 1, `${validation.stdout}\n${validation.stderr}`);
    const result = JSON.parse(validation.stdout);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((entry) => (
      entry.code === 'E_AGENT_DOCUMENT_DRIFT'
      && entry.message.includes('MAP MOVE PROVE digest mismatch')
    )), JSON.stringify(result.errors, null, 2));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
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
