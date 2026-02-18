const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const STATIC_CHECK_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'check-command-namespace-static.mjs');
const FAILSIGNAL_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json');
const TOKEN_CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'TOKENS', 'TOKEN_CATALOG.json');
const REQUIRED_SET_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json');
const RESOLVER_MODULE_PATH = path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'commandNamespaceCanon.mjs');

let resolverModulePromise = null;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectFilesRecursive(absDir, out = []) {
  if (!fs.existsSync(absDir)) return out;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursive(absPath, out);
      continue;
    }
    if (entry.isFile()) out.push(absPath);
  }
  return out;
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

function runStaticCheck(args = []) {
  return spawnSync(process.execPath, [STATIC_CHECK_PATH, '--json', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function loadResolverModule() {
  if (!resolverModulePromise) {
    resolverModulePromise = import(pathToFileURL(RESOLVER_MODULE_PATH).href);
  }
  return resolverModulePromise;
}

test('command namespace static freeze: static-check-script-exists-and-runs', () => {
  assert.equal(fs.existsSync(STATIC_CHECK_PATH), true, 'missing scripts/ops/check-command-namespace-static.mjs');

  const result = runStaticCheck(['--mode=release']);
  assert.equal(result.status, 0, `release static check must be non-blocking:\n${result.stdout}\n${result.stderr}`);

  const payload = JSON.parse(String(result.stdout || '{}'));
  assert.equal(payload.mode, 'release');
  assert.ok(['PASS', 'WARN'].includes(payload.result));
  assert.equal(typeof payload.legacyPrefixHits, 'number');
});

test('command namespace static freeze: promotion-blocks-legacy-prefix-in-static-check', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-namespace-static-'));
  const fixturePath = path.join(tmpDir, 'legacy-prefix-fixture.mjs');
  fs.writeFileSync(fixturePath, "export const demo = 'cmd.file.save';\n", 'utf8');

  const release = runStaticCheck(['--mode=release', '--scan-root', tmpDir]);
  assert.equal(release.status, 0, `release mode should be advisory:\n${release.stdout}\n${release.stderr}`);
  const releasePayload = JSON.parse(String(release.stdout || '{}'));
  assert.equal(releasePayload.result, 'WARN');
  assert.ok(Array.isArray(releasePayload.violations));
  assert.ok(releasePayload.violations.length > 0);

  const promotion = runStaticCheck(['--mode=promotion', '--scan-root', tmpDir]);
  assert.notEqual(promotion.status, 0, 'promotion mode must block when legacy prefix is present');
  const promotionPayload = JSON.parse(String(promotion.stdout || '{}'));
  assert.equal(promotionPayload.result, 'FAIL');
  assert.equal(promotionPayload.failSignalCode, 'E_COMMAND_NAMESPACE_UNKNOWN');
});

test('command namespace static freeze: legacy prefix is absent from runtime source files', () => {
  const sourceRoot = path.join(REPO_ROOT, 'src');
  const files = collectFilesRecursive(sourceRoot)
    .filter((absPath) => absPath.endsWith('.js') || absPath.endsWith('.mjs'));
  const violations = [];

  for (const absPath of files) {
    const text = fs.readFileSync(absPath, 'utf8');
    const matches = [...text.matchAll(/\bcmd\.file\.[a-zA-Z0-9._-]+/g)];
    if (matches.length > 0) {
      violations.push({
        filePath: path.relative(REPO_ROOT, absPath).replaceAll(path.sep, '/'),
        matches: matches.map((match) => String(match[0] || '')),
      });
    }
  }

  assert.deepEqual(violations, []);
});

test('command namespace static freeze: promotion-blocks-unknown-namespace', async () => {
  const { resolveCommandId } = await loadResolverModule();

  const releaseState = resolveCommandId('cmd.unknown.newFeature', { mode: 'release' });
  assert.equal(releaseState.ok, false);
  assert.equal(releaseState.code, 'COMMAND_NAMESPACE_UNKNOWN');
  assert.equal(releaseState.details.failSignalCode, 'E_COMMAND_NAMESPACE_UNKNOWN');
  assert.equal(releaseState.details.modeDisposition, 'advisory');

  const promotionState = resolveCommandId('cmd.unknown.newFeature', { mode: 'promotion' });
  assert.equal(promotionState.ok, false);
  assert.equal(promotionState.code, 'COMMAND_NAMESPACE_UNKNOWN');
  assert.equal(promotionState.details.failSignalCode, 'E_COMMAND_NAMESPACE_UNKNOWN');
  assert.equal(promotionState.details.modeDisposition, 'blocking');
});

test('command namespace static freeze: failsignal is registered with mode semantics', () => {
  const registry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const row = (registry.failSignals || []).find((item) => item && item.code === 'E_COMMAND_NAMESPACE_UNKNOWN');
  assert.ok(row, 'E_COMMAND_NAMESPACE_UNKNOWN must be registered');
  assert.ok(row.modeMatrix && typeof row.modeMatrix === 'object');
  assert.equal(row.modeMatrix.prCore, 'advisory');
  assert.equal(row.modeMatrix.release, 'advisory');
  assert.equal(row.modeMatrix.promotion, 'blocking');
});

test('command namespace static freeze: advisory token is present and not in required set', () => {
  const tokenCatalog = readJson(TOKEN_CATALOG_PATH);
  const token = (tokenCatalog.tokens || []).find((item) => item && item.tokenId === 'COMMAND_NAMESPACE_STATIC_CLEAN_OK');
  assert.ok(token, 'COMMAND_NAMESPACE_STATIC_CLEAN_OK must be registered in token catalog');
  assert.equal(token.failSignalCode, 'E_COMMAND_NAMESPACE_UNKNOWN');

  const requiredSet = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(requiredSet).map((value) => String(value || '').trim());
  assert.equal(flattened.includes('COMMAND_NAMESPACE_STATIC_CLEAN_OK'), false);
});
