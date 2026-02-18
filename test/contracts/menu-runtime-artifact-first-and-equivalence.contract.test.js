const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const CONTEXT_VALIDATOR_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-runtime-context.js');
const SOURCE_POLICY_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-runtime-source-policy.js');
const NORMALIZE_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'menu-config-normalize.mjs');
const DEFAULT_IN_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v2.example.json');
const DEFAULT_CONTEXT_PATH = path.join(REPO_ROOT, 'test', 'fixtures', 'menu', 'context.default.json');
const FAILSIGNAL_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json');
const TOKEN_CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'TOKENS', 'TOKEN_CATALOG.json');
const REQUIRED_SET_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runNormalizeCli(args) {
  return spawnSync(process.execPath, [NORMALIZE_SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function parseJsonOutput(result) {
  let parsed = null;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON output:\n${result.stdout}\n${result.stderr}`);
  return parsed;
}

function flattenStrings(input, out = []) {
  if (Array.isArray(input)) {
    input.forEach((entry) => flattenStrings(entry, out));
    return out;
  }
  if (!input || typeof input !== 'object') {
    if (typeof input === 'string') out.push(input);
    return out;
  }
  Object.values(input).forEach((value) => flattenStrings(value, out));
  return out;
}

function withTempDir(run) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-runtime-equivalence-'));
  try {
    run(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('runtime menu path is artifact-first and context validator rejects invalid input', () => {
  const mainText = fs.readFileSync(MAIN_PATH, 'utf8');
  assert.ok(mainText.includes('resolveRuntimeMenuBuildConfig'), 'runtime menu must be assembled from artifact-first resolver');
  assert.ok(mainText.includes('MENU_RUNTIME_ARTIFACT_ENV_PATH'), 'runtime artifact env key must be wired');
  assert.ok(mainText.includes('evaluateRuntimeMenuSourcePolicy'), 'runtime source mix policy must be wired');
  assert.equal(mainText.includes('loadAndValidateMenuConfig'), false, 'runtime must not call raw config validator in menu path');

  const { validateMenuContext } = require(CONTEXT_VALIDATOR_PATH);

  const unknownKeyState = validateMenuContext({
    platform: 'mac',
    profileId: 'minimal',
    unknownKey: true,
  }, { mode: 'release' });
  assert.equal(unknownKeyState.ok, false, 'unknown context keys must be rejected');
  assert.ok(unknownKeyState.errors.some((row) => row && row.code === 'E_MENU_RUNTIME_CONTEXT_UNKNOWN_KEY'));

  const invalidEnumState = validateMenuContext({
    platform: 'web',
    profileId: 'minimal',
  }, { mode: 'release' });
  assert.equal(invalidEnumState.ok, false, 'unsupported platform enum must be rejected');
  assert.ok(invalidEnumState.errors.some((row) => row && row.code === 'E_MENU_RUNTIME_CONTEXT_PLATFORM_INVALID'));
});

test('runtime source mix is advisory in release and blocking in promotion', () => {
  const { evaluateRuntimeMenuSourcePolicy } = require(SOURCE_POLICY_PATH);

  const release = evaluateRuntimeMenuSourcePolicy({
    mode: 'release',
    usesArtifact: true,
    usesRawConfig: true,
  });
  assert.equal(release.ok, true);
  assert.equal(release.result, 'WARN');
  assert.equal(release.fallbackToArtifactOnly, true);
  assert.equal(release.failSignalCode, 'E_MENU_RUNTIME_ARTIFACT_DIVERGENCE');

  const promotion = evaluateRuntimeMenuSourcePolicy({
    mode: 'promotion',
    usesArtifact: true,
    usesRawConfig: true,
  });
  assert.equal(promotion.ok, false);
  assert.equal(promotion.result, 'FAIL');
  assert.equal(promotion.exitCode, 1);
  assert.equal(promotion.failSignalCode, 'E_MENU_RUNTIME_ARTIFACT_DIVERGENCE');
});

test('runtime-equivalent-check release warns and promotion fails on mismatch', () => {
  withTempDir((tmpDir) => {
    const artifactPath = path.join(tmpDir, 'menu.normalized.json');
    writeJson(artifactPath, {
      schemaVersion: 1,
      snapshotId: 'menu-default-desktop-minimal',
      normalizedHashSha256: '0'.repeat(64),
      generatedAt: new Date().toISOString(),
      generatedFromCommit: 'contract-test',
      context: {
        contextHashSha256: '1'.repeat(64),
        contextRef: 'test/fixtures/menu/context.default.json',
      },
      sourceRefs: [],
      commands: [],
      menus: [],
    });

    const release = runNormalizeCli([
      '--runtime-equivalent-check',
      '--in',
      DEFAULT_IN_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--artifact',
      artifactPath,
      '--mode=release',
      '--json',
    ]);
    assert.equal(release.status, 0, `release must stay advisory:\n${release.stdout}\n${release.stderr}`);
    const releasePayload = parseJsonOutput(release);
    assert.equal(releasePayload.operation, 'runtime-equivalent-check');
    assert.equal(releasePayload.result, 'WARN');
    assert.equal(releasePayload.mismatch, true);
    assert.equal(releasePayload.failSignalCode, 'E_MENU_RUNTIME_ARTIFACT_DIVERGENCE');

    const promotion = runNormalizeCli([
      '--runtime-equivalent-check',
      '--in',
      DEFAULT_IN_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--artifact',
      artifactPath,
      '--mode=promotion',
      '--json',
    ]);
    assert.notEqual(promotion.status, 0, 'promotion must fail on runtime/artifact mismatch');
    const promotionPayload = parseJsonOutput(promotion);
    assert.equal(promotionPayload.operation, 'runtime-equivalent-check');
    assert.equal(promotionPayload.result, 'FAIL');
    assert.equal(promotionPayload.mismatch, true);
    assert.equal(promotionPayload.failSignalCode, 'E_MENU_RUNTIME_ARTIFACT_DIVERGENCE');
  });
});

test('failSignal and token are registered, token is not required', () => {
  const failRegistry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const failSignal = (failRegistry.failSignals || []).find((row) => row && row.code === 'E_MENU_RUNTIME_ARTIFACT_DIVERGENCE');
  assert.ok(failSignal, 'E_MENU_RUNTIME_ARTIFACT_DIVERGENCE must exist in failSignal registry');
  assert.equal(failSignal.modeMatrix.prCore, 'advisory');
  assert.equal(failSignal.modeMatrix.release, 'advisory');
  assert.equal(failSignal.modeMatrix.promotion, 'blocking');

  const tokenCatalog = readJson(TOKEN_CATALOG_PATH);
  const token = (tokenCatalog.tokens || []).find((row) => row && row.tokenId === 'MENU_RUNTIME_EQUIVALENT_TO_ARTIFACT_OK');
  assert.ok(token, 'MENU_RUNTIME_EQUIVALENT_TO_ARTIFACT_OK must exist in token catalog');
  assert.equal(token.failSignalCode, 'E_MENU_RUNTIME_ARTIFACT_DIVERGENCE');

  const requiredSet = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(requiredSet);
  assert.equal(flattened.includes('MENU_RUNTIME_EQUIVALENT_TO_ARTIFACT_OK'), false);
});
