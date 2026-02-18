const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const CHECK_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'check-command-namespace.mjs');
const FAILSIGNAL_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json');
const REQUIRED_SET_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json');
const RESOLVER_MODULE_PATH = path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'commandNamespaceCanon.mjs');

let resolverModulePromise = null;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadResolverModule() {
  if (!resolverModulePromise) {
    resolverModulePromise = import(pathToFileURL(RESOLVER_MODULE_PATH).href);
  }
  return resolverModulePromise;
}

function runNamespaceCheck(mode, scanRoot, today) {
  return spawnSync(
    process.execPath,
    [CHECK_SCRIPT_PATH, '--json', '--mode', mode, '--scan-root', scanRoot, '--today', today],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
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

test('command namespace sunset promotion: release warns while promotion blocks after sunset in ops check', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-namespace-sunset-'));
  const fixturePath = path.join(tmpDir, 'fixture.js');
  fs.writeFileSync(fixturePath, "export const id = 'cmd.file.save';\n", 'utf8');
  const forcedExpiredDate = '2099-01-01';

  const release = runNamespaceCheck('release', tmpDir, forcedExpiredDate);
  assert.equal(release.status, 0, `release mode must stay advisory:\n${release.stdout}\n${release.stderr}`);
  const releasePayload = JSON.parse(String(release.stdout || '{}'));
  assert.equal(releasePayload.mode, 'release');
  assert.equal(releasePayload.result, 'WARN');
  assert.equal(releasePayload.sunsetExpired, true);
  assert.ok(Number(releasePayload.deprecatedHits) >= 1);

  const promotion = runNamespaceCheck('promotion', tmpDir, forcedExpiredDate);
  assert.notEqual(promotion.status, 0, 'promotion mode must block after sunset');
  const promotionPayload = JSON.parse(String(promotion.stdout || '{}'));
  assert.equal(promotionPayload.mode, 'promotion');
  assert.equal(promotionPayload.result, 'FAIL');
  assert.equal(promotionPayload.failSignalCode, 'E_COMMAND_NAMESPACE_DRIFT');
  assert.equal(promotionPayload.sunsetExpired, true);
  assert.ok(Number(promotionPayload.deprecatedHits) >= 1);
});

test('command namespace sunset promotion: resolver keeps release advisory and blocks promotion after sunset', async () => {
  const { resolveCommandId } = await loadResolverModule();
  const forcedExpiredDate = '2099-01-01';

  const releaseState = resolveCommandId('cmd.file.save', {
    mode: 'release',
    today: forcedExpiredDate,
  });
  assert.equal(releaseState.ok, true);
  assert.equal(releaseState.commandId, 'cmd.project.save');
  assert.equal(releaseState.sunsetExpired, true);
  assert.ok(Array.isArray(releaseState.warnings));
  assert.ok(releaseState.warnings.length > 0);

  const promotionState = resolveCommandId('cmd.file.save', {
    mode: 'promotion',
    today: forcedExpiredDate,
  });
  assert.equal(promotionState.ok, false);
  assert.equal(promotionState.reason, 'COMMAND_NAMESPACE_SUNSET_EXPIRED');
  assert.equal(promotionState.details.failSignalCode, 'E_COMMAND_NAMESPACE_DRIFT');
});

test('command namespace sunset promotion: failsignal is registered and promotion mode is blocking', () => {
  const registry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const row = (registry.failSignals || []).find((item) => item && item.code === 'E_COMMAND_NAMESPACE_DRIFT');
  assert.ok(row, 'E_COMMAND_NAMESPACE_DRIFT must be present in failSignal registry');
  assert.ok(row.modeMatrix && typeof row.modeMatrix === 'object', 'modeMatrix must exist for E_COMMAND_NAMESPACE_DRIFT');
  assert.equal(row.modeMatrix.prCore, 'advisory');
  assert.equal(row.modeMatrix.release, 'advisory');
  assert.equal(row.modeMatrix.promotion, 'blocking');
});

test('command namespace sunset promotion: COMMAND_NAMESPACE_CANON_OK remains outside required sets', () => {
  const requiredSet = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(requiredSet).map((value) => String(value || '').trim());
  assert.equal(flattened.includes('COMMAND_NAMESPACE_CANON_OK'), false);
});
