const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const NORMALIZE_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'menu-config-normalize.mjs');
const CHECK_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'check-menu-artifact-lock.mjs');
const FAILSIGNAL_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json');
const TOKEN_CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'TOKENS', 'TOKEN_CATALOG.json');
const REQUIRED_SET_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json');
const VERIFY_CANON_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'MENU_ARTIFACT_VERIFY_CANON.json');
const RUNTIME_MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

function runNormalizeCli(args) {
  return spawnSync(process.execPath, [NORMALIZE_SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function runLockCheckCli(args) {
  return spawnSync(process.execPath, [CHECK_SCRIPT_PATH, ...args], {
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

function withTempDir(run) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-artifact-contract-'));
  try {
    run(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('export creates artifact and lock updates via CLI', () => {
  withTempDir((tmpDir) => {
    const snapshotId = 'menu-artifact-contract';
    const snapshotRegistryPath = path.join(tmpDir, 'MENU_SNAPSHOT_REGISTRY.json');
    const artifactPath = path.join(tmpDir, 'menu.normalized.json');
    const lockPath = path.join(tmpDir, 'MENU_ARTIFACT_LOCK.json');

    const snapshotCreate = runNormalizeCli([
      '--snapshot-create',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      snapshotRegistryPath,
      '--mode=release',
      '--json',
    ]);
    assert.equal(snapshotCreate.status, 0, `${snapshotCreate.stdout}\n${snapshotCreate.stderr}`);

    const exportResult = runNormalizeCli([
      '--export-artifact',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      snapshotRegistryPath,
      '--out',
      artifactPath,
      '--lock-artifact',
      '--lock-path',
      lockPath,
      '--mode=release',
      '--json',
    ]);
    assert.equal(exportResult.status, 0, `${exportResult.stdout}\n${exportResult.stderr}`);
    const payload = parseJsonOutput(exportResult);
    assert.equal(payload.operation, 'export-artifact');
    assert.equal(payload.result, 'PASS');
    assert.equal(payload.lockWritten, true);

    assert.equal(fs.existsSync(artifactPath), true, 'artifact must exist after export');
    assert.equal(fs.existsSync(lockPath), true, 'lock must exist after export');

    const artifact = readJson(artifactPath);
    assert.equal(artifact.schemaVersion, 1);
    assert.equal(artifact.snapshotId, snapshotId);
    assert.match(String(artifact.normalizedHashSha256 || ''), /^[0-9a-f]{64}$/u);
    assert.ok(typeof artifact.generatedAt === 'string' && artifact.generatedAt.length > 0);
    assert.ok(typeof artifact.generatedFromCommit === 'string' && artifact.generatedFromCommit.length > 0);
    assert.ok(artifact.context && typeof artifact.context === 'object' && !Array.isArray(artifact.context));
    assert.equal(Array.isArray(artifact.sourceRefs), true);
    assert.equal(Array.isArray(artifact.commands), true);
    assert.equal(Array.isArray(artifact.menus), true);

    const lock = readJson(lockPath);
    assert.equal(lock.schemaVersion, 1);
    assert.equal(lock.snapshotId, snapshotId);
    assert.match(String(lock.normalizedHashSha256 || ''), /^[0-9a-f]{64}$/u);
    assert.match(String(lock.artifactBytesSha256 || ''), /^[0-9a-f]{64}$/u);
  });
});

test('tamper artifact: release warns and promotion fails', () => {
  withTempDir((tmpDir) => {
    const snapshotId = 'menu-artifact-tamper';
    const snapshotRegistryPath = path.join(tmpDir, 'MENU_SNAPSHOT_REGISTRY.json');
    const artifactPath = path.join(tmpDir, 'menu.normalized.json');
    const lockPath = path.join(tmpDir, 'MENU_ARTIFACT_LOCK.json');

    const snapshotCreate = runNormalizeCli([
      '--snapshot-create',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      snapshotRegistryPath,
      '--mode=release',
      '--json',
    ]);
    assert.equal(snapshotCreate.status, 0, `${snapshotCreate.stdout}\n${snapshotCreate.stderr}`);

    const exportResult = runNormalizeCli([
      '--export-artifact',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      snapshotRegistryPath,
      '--out',
      artifactPath,
      '--lock-artifact',
      '--lock-path',
      lockPath,
      '--mode=release',
      '--json',
    ]);
    assert.equal(exportResult.status, 0, `${exportResult.stdout}\n${exportResult.stderr}`);

    const artifact = readJson(artifactPath);
    artifact.menus[0].label = `${artifact.menus[0].label} (tampered)`;
    writeJson(artifactPath, artifact);

    const release = runLockCheckCli([
      '--artifact',
      artifactPath,
      '--lock',
      lockPath,
      '--snapshot-id',
      snapshotId,
      '--mode=release',
      '--json',
    ]);
    assert.equal(release.status, 0, `release mode must stay advisory:\n${release.stdout}\n${release.stderr}`);
    const releasePayload = parseJsonOutput(release);
    assert.equal(releasePayload.result, 'WARN');
    assert.equal(releasePayload.failSignalCode, 'E_MENU_ARTIFACT_TAMPER_OR_DRIFT');
    assert.equal(releasePayload.mismatch, true);

    const promotion = runLockCheckCli([
      '--artifact',
      artifactPath,
      '--lock',
      lockPath,
      '--snapshot-id',
      snapshotId,
      '--mode=promotion',
      '--json',
    ]);
    assert.notEqual(promotion.status, 0, 'promotion mode must fail when artifact is tampered');
    const promotionPayload = parseJsonOutput(promotion);
    assert.equal(promotionPayload.result, 'FAIL');
    assert.equal(promotionPayload.failSignalCode, 'E_MENU_ARTIFACT_TAMPER_OR_DRIFT');
    assert.equal(promotionPayload.mismatch, true);
  });
});

test('runtime verify wiring exists in main process before menu render', () => {
  assert.equal(fs.existsSync(VERIFY_CANON_PATH), true, 'missing MENU_ARTIFACT_VERIFY_CANON.json');
  const verifyCanon = readJson(VERIFY_CANON_PATH);
  assert.equal(verifyCanon.schemaVersion, 1);
  assert.equal(verifyCanon.hashMethod, 'sha256(raw-file-bytes)');

  const mainText = fs.readFileSync(RUNTIME_MAIN_PATH, 'utf8');
  assert.ok(mainText.includes('evaluateMenuArtifactLockState'), 'main.js must import menu artifact evaluator');
  assert.ok(mainText.includes('verifyMenuArtifactLockAtRuntime()'), 'main.js must call runtime artifact verification');
  assert.ok(mainText.includes('createMenu();'), 'main.js must still render menu after runtime verification stage');
});

test('failSignal/token are registered and token is not in required set', () => {
  const failRegistry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const failSignal = (failRegistry.failSignals || []).find((row) => row && row.code === 'E_MENU_ARTIFACT_TAMPER_OR_DRIFT');
  assert.ok(failSignal, 'E_MENU_ARTIFACT_TAMPER_OR_DRIFT must exist in failSignal registry');
  assert.ok(failSignal.modeMatrix && typeof failSignal.modeMatrix === 'object');
  assert.equal(failSignal.modeMatrix.prCore, 'advisory');
  assert.equal(failSignal.modeMatrix.release, 'advisory');
  assert.equal(failSignal.modeMatrix.promotion, 'blocking');

  const tokenCatalog = readJson(TOKEN_CATALOG_PATH);
  const token = (tokenCatalog.tokens || []).find((row) => row && row.tokenId === 'MENU_ARTIFACT_LOCK_MATCH_OK');
  assert.ok(token, 'MENU_ARTIFACT_LOCK_MATCH_OK must exist in token catalog');
  assert.equal(token.failSignalCode, 'E_MENU_ARTIFACT_TAMPER_OR_DRIFT');

  const requiredSet = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(requiredSet);
  assert.equal(flattened.includes('MENU_ARTIFACT_LOCK_MATCH_OK'), false);
});
