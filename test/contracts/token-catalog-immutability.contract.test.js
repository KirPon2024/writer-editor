const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = 'scripts/ops/token-catalog-immutability-state.mjs';
const DECLARATION_PATH = path.join(process.cwd(), 'docs/OPS/TOKENS/TOKEN_DECLARATION.json');
const LOCK_PATH = path.join(process.cwd(), 'docs/OPS/TOKENS/TOKEN_CATALOG_LOCK.json');

function runState(args = []) {
  return spawnSync(process.execPath, [SCRIPT_PATH, '--json', ...args], {
    encoding: 'utf8',
  });
}

function parseJsonStdout(result) {
  let payload = null;
  assert.doesNotThrow(() => {
    payload = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON output:\n${result.stdout}\n${result.stderr}`);
  return payload;
}

test('token catalog immutability: baseline lock is valid and deterministic', () => {
  const firstRun = runState();
  assert.equal(firstRun.status, 0, `expected success:\n${firstRun.stdout}\n${firstRun.stderr}`);
  const firstPayload = parseJsonStdout(firstRun);
  assert.equal(firstPayload.tokens.TOKEN_CATALOG_IMMUTABLE_OK, 1);
  assert.match(String(firstPayload.expected || ''), /^[0-9a-f]{64}$/u);
  assert.equal(firstPayload.expected, firstPayload.actual);

  const secondRun = runState();
  assert.equal(secondRun.status, 0, `expected second success:\n${secondRun.stdout}\n${secondRun.stderr}`);
  const secondPayload = parseJsonStdout(secondRun);
  assert.equal(secondPayload.tokens.TOKEN_CATALOG_IMMUTABLE_OK, 1);
  assert.equal(secondPayload.expected, secondPayload.actual);

  assert.equal(firstPayload.expected, secondPayload.expected);
  assert.equal(firstPayload.actual, secondPayload.actual);
});

test('token catalog immutability: formatting-only change does not trigger drift', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-catalog-immutability-format-'));
  const tmpDeclarationPath = path.join(tmpDir, 'TOKEN_DECLARATION.json');
  const tmpLockPath = path.join(tmpDir, 'TOKEN_CATALOG_LOCK.json');

  const declarationDoc = JSON.parse(fs.readFileSync(DECLARATION_PATH, 'utf8'));
  fs.writeFileSync(tmpDeclarationPath, `${JSON.stringify(declarationDoc)}\n`, 'utf8');
  fs.copyFileSync(LOCK_PATH, tmpLockPath);

  const result = runState(['--declaration-path', tmpDeclarationPath, '--lock-path', tmpLockPath]);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.equal(result.status, 0, `expected success for formatting-only rewrite:\n${result.stdout}\n${result.stderr}`);
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens.TOKEN_CATALOG_IMMUTABLE_OK, 1);
  assert.equal(payload.expected, payload.actual);
});

test('token catalog immutability: semantic mutation triggers mismatch', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-catalog-immutability-mutation-'));
  const tmpDeclarationPath = path.join(tmpDir, 'TOKEN_DECLARATION.json');
  const tmpLockPath = path.join(tmpDir, 'TOKEN_CATALOG_LOCK.json');

  const declarationDoc = JSON.parse(fs.readFileSync(DECLARATION_PATH, 'utf8'));
  declarationDoc.targetTokens = Array.isArray(declarationDoc.targetTokens)
    ? [...declarationDoc.targetTokens, 'TOKEN_CATALOG_IMMUTABILITY_TEST_TOKEN']
    : ['TOKEN_CATALOG_IMMUTABILITY_TEST_TOKEN'];

  fs.writeFileSync(tmpDeclarationPath, `${JSON.stringify(declarationDoc, null, 2)}\n`, 'utf8');
  fs.copyFileSync(LOCK_PATH, tmpLockPath);

  const result = runState(['--declaration-path', tmpDeclarationPath, '--lock-path', tmpLockPath]);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.notEqual(result.status, 0, 'expected non-zero on semantic drift');
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens.TOKEN_CATALOG_IMMUTABLE_OK, 0);
  assert.match(String(payload.expected || ''), /^[0-9a-f]{64}$/u);
  assert.match(String(payload.actual || ''), /^[0-9a-f]{64}$/u);
  assert.notEqual(payload.expected, payload.actual);
  assert.equal(payload.failReason, 'TOKEN_CATALOG_LOCK_MISMATCH');
});
