const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/token-catalog-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeTempFiles(catalogDoc, requiredSetDoc) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-catalog-contract-'));
  const catalogPath = path.join(tmpDir, 'TOKEN_CATALOG.json');
  const requiredSetPath = path.join(tmpDir, 'REQUIRED_TOKEN_SET.json');
  writeJson(catalogPath, catalogDoc);
  writeJson(requiredSetPath, requiredSetDoc);
  return { tmpDir, catalogPath, requiredSetPath };
}

function cleanupTempDir(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

test('token catalog state: repository baseline is valid', async () => {
  const { evaluateTokenCatalogState } = await loadModule();
  const state = evaluateTokenCatalogState();
  assert.equal(state.ok, true);
  assert.equal(state.TOKEN_CATALOG_VALID_OK, 1);
  assert.equal(state.failSignalCode, '');
});

test('token catalog state: duplicate tokenId fails with E_TOKEN_CATALOG_INVALID', async () => {
  const { evaluateTokenCatalogState } = await loadModule();
  const catalogDoc = readJson('docs/OPS/TOKENS/TOKEN_CATALOG.json');
  const requiredSetDoc = readJson('docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json');

  const duplicateToken = JSON.parse(JSON.stringify(catalogDoc.tokens[0]));
  catalogDoc.tokens.push(duplicateToken);
  const { tmpDir, catalogPath, requiredSetPath } = makeTempFiles(catalogDoc, requiredSetDoc);

  const state = evaluateTokenCatalogState({ catalogPath, requiredSetPath });
  cleanupTempDir(tmpDir);

  assert.equal(state.ok, false);
  assert.equal(state.TOKEN_CATALOG_VALID_OK, 0);
  assert.equal(state.failSignalCode, 'E_TOKEN_CATALOG_INVALID');
  assert.ok(state.failures.some((row) => row.code === 'CATALOG_TOKEN_ID_DUPLICATE'));
});

test('token catalog state: missing release required token fails with E_TOKEN_CATALOG_INVALID', async () => {
  const { evaluateTokenCatalogState } = await loadModule();
  const catalogDoc = readJson('docs/OPS/TOKENS/TOKEN_CATALOG.json');
  const requiredSetDoc = readJson('docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json');
  const requiredRelease = requiredSetDoc.requiredSets.release;
  const tokenToRemove = String(requiredRelease[0] || '').trim();

  catalogDoc.tokens = catalogDoc.tokens.filter((row) => row.tokenId !== tokenToRemove);
  const { tmpDir, catalogPath, requiredSetPath } = makeTempFiles(catalogDoc, requiredSetDoc);

  const state = evaluateTokenCatalogState({ catalogPath, requiredSetPath });
  cleanupTempDir(tmpDir);

  assert.equal(state.ok, false);
  assert.equal(state.TOKEN_CATALOG_VALID_OK, 0);
  assert.equal(state.failSignalCode, 'E_TOKEN_CATALOG_INVALID');
  assert.ok(state.missingRequiredTokens.includes(tokenToRemove));
  assert.ok(state.failures.some((row) => row.code === 'CATALOG_REQUIRED_TOKEN_MISSING'));
});
