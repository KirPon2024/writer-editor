const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const OPS_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'menu-config-normalize.mjs');
const SNAPSHOT_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'MENU_SNAPSHOT_REGISTRY.json');
const EXAMPLE_CONFIG_PATH = path.join(REPO_ROOT, 'src', 'menu', 'menu-config.v2.example.json');
const DEFAULT_CONTEXT_PATH = path.join(REPO_ROOT, 'test', 'fixtures', 'menu', 'context.default.json');
const FAILSIGNAL_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json');
const TOKEN_CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'TOKENS', 'TOKEN_CATALOG.json');
const REQUIRED_SET_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
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
  return spawnSync(process.execPath, [OPS_SCRIPT_PATH, ...args], {
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-snapshot-contract-'));
  try {
    run(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('menu snapshot registry exists and has schemaVersion=1', () => {
  assert.equal(fs.existsSync(SNAPSHOT_REGISTRY_PATH), true, 'missing MENU_SNAPSHOT_REGISTRY.json');
  const registry = readJson(SNAPSHOT_REGISTRY_PATH);
  assert.equal(registry.schemaVersion, 1);
  assert.equal(Array.isArray(registry.snapshots), true);
});

test('snapshot-create updates registry and snapshot-check passes for frozen hash', () => {
  withTempDir((tmpDir) => {
    const snapshotId = 'menu-contract-create-pass';
    const registryPath = path.join(tmpDir, 'MENU_SNAPSHOT_REGISTRY.json');
    const outCreatePath = path.join(tmpDir, 'normalized.create.json');
    writeJson(registryPath, {
      schemaVersion: 1,
      snapshots: [],
    });

    const create = runNormalizeCli([
      '--snapshot-create',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      registryPath,
      '--in',
      EXAMPLE_CONFIG_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--out',
      outCreatePath,
      '--mode=release',
      '--json',
    ]);
    assert.equal(create.status, 0, `${create.stdout}\n${create.stderr}`);
    const createPayload = parseJsonOutput(create);
    assert.equal(createPayload.operation, 'snapshot-create');
    assert.equal(createPayload.result, 'PASS');

    const registry = readJson(registryPath);
    const entry = registry.snapshots.find((row) => row && row.id === snapshotId);
    assert.ok(entry, 'snapshot entry must exist after create');
    assert.match(String(entry.normalizedHashSha256 || ''), /^[0-9a-f]{64}$/u);
    assert.match(String(entry.contextHashSha256 || ''), /^[0-9a-f]{64}$/u);
    assert.ok(typeof entry.createdAt === 'string' && entry.createdAt.length > 0);

    const check = runNormalizeCli([
      '--snapshot-check',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      registryPath,
      '--in',
      EXAMPLE_CONFIG_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--mode=release',
      '--json',
    ]);
    assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
    const checkPayload = parseJsonOutput(check);
    assert.equal(checkPayload.operation, 'snapshot-check');
    assert.equal(checkPayload.result, 'PASS');
    assert.equal(checkPayload.snapshotExists, true);
    assert.equal(checkPayload.failSignalCode, '');
  });
});

test('snapshot-check release warns and promotion fails on mismatch', () => {
  withTempDir((tmpDir) => {
    const snapshotId = 'menu-contract-mismatch';
    const registryPath = path.join(tmpDir, 'MENU_SNAPSHOT_REGISTRY.json');
    const mutatedConfigPath = path.join(tmpDir, 'menu-config.mutated.json');
    writeJson(registryPath, {
      schemaVersion: 1,
      snapshots: [],
    });

    const create = runNormalizeCli([
      '--snapshot-create',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      registryPath,
      '--in',
      EXAMPLE_CONFIG_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--mode=release',
      '--json',
    ]);
    assert.equal(create.status, 0, `${create.stdout}\n${create.stderr}`);

    const mutatedConfig = readJson(EXAMPLE_CONFIG_PATH);
    mutatedConfig.menus[0].items[0].label = 'Открыть проект (mismatch)';
    writeJson(mutatedConfigPath, mutatedConfig);

    const release = runNormalizeCli([
      '--snapshot-check',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      registryPath,
      '--in',
      mutatedConfigPath,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--mode=release',
      '--json',
    ]);
    assert.equal(release.status, 0, `release mode must stay advisory:\n${release.stdout}\n${release.stderr}`);
    const releasePayload = parseJsonOutput(release);
    assert.equal(releasePayload.result, 'WARN');
    assert.equal(releasePayload.failSignalCode, 'E_MENU_SNAPSHOT_MISMATCH');

    const promotion = runNormalizeCli([
      '--snapshot-check',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      registryPath,
      '--in',
      mutatedConfigPath,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--mode=promotion',
      '--json',
    ]);
    assert.notEqual(promotion.status, 0, 'promotion mode must block on snapshot mismatch');
    const promotionPayload = parseJsonOutput(promotion);
    assert.equal(promotionPayload.result, 'FAIL');
    assert.equal(promotionPayload.failSignalCode, 'E_MENU_SNAPSHOT_MISMATCH');
  });
});

test('determinism guard: two snapshot-check runs keep same hash and overlay-like config change is detected', () => {
  withTempDir((tmpDir) => {
    const snapshotId = 'menu-contract-determinism';
    const registryPath = path.join(tmpDir, 'MENU_SNAPSHOT_REGISTRY.json');
    const overlayLikeConfigPath = path.join(tmpDir, 'menu-config.overlay.json');
    writeJson(registryPath, {
      schemaVersion: 1,
      snapshots: [],
    });

    const create = runNormalizeCli([
      '--snapshot-create',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      registryPath,
      '--in',
      EXAMPLE_CONFIG_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--mode=release',
      '--json',
    ]);
    assert.equal(create.status, 0, `${create.stdout}\n${create.stderr}`);

    const checkA = runNormalizeCli([
      '--snapshot-check',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      registryPath,
      '--in',
      EXAMPLE_CONFIG_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--mode=release',
      '--json',
    ]);
    assert.equal(checkA.status, 0, `${checkA.stdout}\n${checkA.stderr}`);
    const payloadA = parseJsonOutput(checkA);
    assert.equal(payloadA.result, 'PASS');

    const checkB = runNormalizeCli([
      '--snapshot-check',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      registryPath,
      '--in',
      EXAMPLE_CONFIG_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--mode=release',
      '--json',
    ]);
    assert.equal(checkB.status, 0, `${checkB.stdout}\n${checkB.stderr}`);
    const payloadB = parseJsonOutput(checkB);
    assert.equal(payloadB.result, 'PASS');
    assert.equal(payloadA.normalizedHashSha256, payloadB.normalizedHashSha256);

    const overlayLikeConfig = readJson(EXAMPLE_CONFIG_PATH);
    overlayLikeConfig.menus[0].items.push({
      id: 'file-overlay-extra',
      label: 'Overlay Extra',
      actionId: 'saveDocument',
      mode: ['offline'],
      profile: ['minimal', 'pro', 'guru'],
      stage: ['X1', 'X2', 'X3', 'X4'],
      enabledWhen: { op: 'all', args: [] },
    });
    writeJson(overlayLikeConfigPath, overlayLikeConfig);

    const mismatch = runNormalizeCli([
      '--snapshot-check',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      registryPath,
      '--in',
      overlayLikeConfigPath,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--mode=release',
      '--json',
    ]);
    assert.equal(mismatch.status, 0, `${mismatch.stdout}\n${mismatch.stderr}`);
    const mismatchPayload = parseJsonOutput(mismatch);
    assert.equal(mismatchPayload.result, 'WARN');
    assert.equal(mismatchPayload.failSignalCode, 'E_MENU_SNAPSHOT_MISMATCH');
    assert.notEqual(mismatchPayload.normalizedHashSha256, payloadA.normalizedHashSha256);
  });
});

test('hash cannot be changed without CLI recalculation (manual hash edit is detected)', () => {
  withTempDir((tmpDir) => {
    const snapshotId = 'menu-contract-manual-hash';
    const registryPath = path.join(tmpDir, 'MENU_SNAPSHOT_REGISTRY.json');
    writeJson(registryPath, {
      schemaVersion: 1,
      snapshots: [],
    });

    const create = runNormalizeCli([
      '--snapshot-create',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      registryPath,
      '--in',
      EXAMPLE_CONFIG_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--mode=release',
      '--json',
    ]);
    assert.equal(create.status, 0, `${create.stdout}\n${create.stderr}`);

    const registry = readJson(registryPath);
    const entry = registry.snapshots.find((row) => row && row.id === snapshotId);
    assert.ok(entry);
    entry.normalizedHashSha256 = 'f'.repeat(64);
    writeJson(registryPath, registry);

    const promotion = runNormalizeCli([
      '--snapshot-check',
      '--snapshot-id',
      snapshotId,
      '--snapshot-registry',
      registryPath,
      '--in',
      EXAMPLE_CONFIG_PATH,
      '--context',
      DEFAULT_CONTEXT_PATH,
      '--mode=promotion',
      '--json',
    ]);
    assert.notEqual(promotion.status, 0, 'manual hash tamper must fail in promotion mode');
    const payload = parseJsonOutput(promotion);
    assert.equal(payload.result, 'FAIL');
    assert.equal(payload.failSignalCode, 'E_MENU_SNAPSHOT_MISMATCH');
    assert.equal(payload.mismatch.reason, 'SNAPSHOT_HASH_MISMATCH');
  });
});

test('failSignal and token are registered, token is not in required set', () => {
  const failRegistry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const signal = (failRegistry.failSignals || []).find((entry) => entry && entry.code === 'E_MENU_SNAPSHOT_MISMATCH');
  assert.ok(signal, 'E_MENU_SNAPSHOT_MISMATCH must exist in failSignal registry');
  assert.ok(signal.modeMatrix && typeof signal.modeMatrix === 'object');
  assert.equal(signal.modeMatrix.prCore, 'advisory');
  assert.equal(signal.modeMatrix.release, 'advisory');
  assert.equal(signal.modeMatrix.promotion, 'blocking');

  const tokenCatalog = readJson(TOKEN_CATALOG_PATH);
  const token = (tokenCatalog.tokens || []).find((entry) => entry && entry.tokenId === 'MENU_SNAPSHOT_MATCH_OK');
  assert.ok(token, 'MENU_SNAPSHOT_MATCH_OK must exist in token catalog');
  assert.equal(token.failSignalCode, 'E_MENU_SNAPSHOT_MISMATCH');

  const requiredSet = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(requiredSet);
  assert.equal(flattened.includes('MENU_SNAPSHOT_MATCH_OK'), false);
});
