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
      path.join(process.cwd(), 'scripts/ops/verify-orchestrator-canon-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

test('verify orchestrator canon state: repository baseline is valid', async () => {
  const { evaluateVerifyOrchestratorCanonState } = await loadModule();
  const state = evaluateVerifyOrchestratorCanonState();
  assert.equal(state.ok, true);
  assert.equal(state.VERIFY_ORCHESTRATOR_CANON_OK, 1);
  assert.equal(state.code, '');
});

test('verify orchestrator canon state: secondary post-merge orchestrator fails', async () => {
  const { evaluateVerifyOrchestratorCanonState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-orchestrator-canon-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'post-merge-verify.mjs'), '// canonical\n', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'emit-post-merge-verify-attestation.mjs'), '// helper\n', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'post-merge-verify-legacy.mjs'), '// legacy entry\n', 'utf8');

    const state = evaluateVerifyOrchestratorCanonState({ opsDir: tmpDir });
    assert.equal(state.ok, false);
    assert.equal(state.VERIFY_ORCHESTRATOR_CANON_OK, 0);
    assert.equal(state.code, 'E_VERIFY_ORCHESTRATOR_MISMATCH');
    assert.ok(state.details.foundEntrypoints.includes('post-merge-verify-legacy.mjs'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('verify orchestrator canon state: missing helper fails', async () => {
  const { evaluateVerifyOrchestratorCanonState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-orchestrator-canon-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'post-merge-verify.mjs'), '// canonical\n', 'utf8');
    const state = evaluateVerifyOrchestratorCanonState({ opsDir: tmpDir });
    assert.equal(state.ok, false);
    assert.equal(state.VERIFY_ORCHESTRATOR_CANON_OK, 0);
    assert.equal(state.code, 'E_VERIFY_ORCHESTRATOR_MISMATCH');
    assert.equal(state.details.helperExists, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
