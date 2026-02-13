const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = 'scripts/ops/lossless-map-state.mjs';
const MAP_PATH = path.join(process.cwd(), 'docs/OPS/STATUS/LOSSLESS_MAP_V3_4.json');

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

function withTempMap(mutator) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lossless-map-contract-'));
  const tmpMapPath = path.join(tmpDir, 'LOSSLESS_MAP_V3_4.json');
  const doc = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  mutator(doc);
  fs.writeFileSync(tmpMapPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  return { tmpDir, tmpMapPath };
}

test('lossless map state: baseline mapping is valid', () => {
  const result = runState();
  assert.equal(result.status, 0, `expected success:\n${result.stdout}\n${result.stderr}`);
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens.LOSSLESS_MAP_OK, 1);
  assert.equal(payload.code, '');
  assert.equal(payload.mapEnforced, 1);
  assert.ok(Number(payload.partASectionCount) >= 1);
  assert.ok(Number(payload.annexBindingCount) >= 1);
});

test('lossless map state: missing release token binding emits missing-token code', () => {
  const files = withTempMap((doc) => {
    doc.annexBindings = doc.annexBindings.filter((item) => item.token !== 'LOSSLESS_MAP_OK');
  });
  const result = runState(['--lossless-map-path', files.tmpMapPath]);
  fs.rmSync(files.tmpDir, { recursive: true, force: true });

  assert.notEqual(result.status, 0, 'expected non-zero status');
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens.LOSSLESS_MAP_OK, 0);
  assert.equal(payload.code, 'E_LOSSLESS_MAP_MISSING_TOKEN');
  assert.ok(payload.failures.includes('LOSSLESS_MAP_MISSING_TOKEN_RELEASE_BINDING'));
});

test('lossless map state: missing proofhook path emits missing-proofhook code', () => {
  const files = withTempMap((doc) => {
    const idx = doc.annexBindings.findIndex((item) => item.token === 'LOSSLESS_MAP_OK');
    doc.annexBindings[idx].proofHook = 'node scripts/ops/not-existing-proofhook.mjs --json';
  });
  const result = runState(['--lossless-map-path', files.tmpMapPath]);
  fs.rmSync(files.tmpDir, { recursive: true, force: true });

  assert.notEqual(result.status, 0, 'expected non-zero status');
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens.LOSSLESS_MAP_OK, 0);
  assert.equal(payload.code, 'E_LOSSLESS_MAP_MISSING_PROOFHOOK');
  assert.ok(payload.failures.includes('LOSSLESS_MAP_ANNEX_MISSING_PROOFHOOK'));
});

test('lossless map state: orphan section drift emits drift code', () => {
  const files = withTempMap((doc) => {
    doc.annexBindings[0].sectionId = 'PART_A_ORPHAN_SECTION';
  });
  const result = runState(['--lossless-map-path', files.tmpMapPath]);
  fs.rmSync(files.tmpDir, { recursive: true, force: true });

  assert.notEqual(result.status, 0, 'expected non-zero status');
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens.LOSSLESS_MAP_OK, 0);
  assert.equal(payload.code, 'E_LOSSLESS_MAP_DRIFT');
  assert.ok(payload.failures.includes('LOSSLESS_MAP_ANNEX_ORPHAN_SECTION'));
});
