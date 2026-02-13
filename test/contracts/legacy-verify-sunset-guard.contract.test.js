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
      path.join(process.cwd(), 'scripts/ops/legacy-verify-sunset-guard-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

test('legacy verify sunset guard state: baseline without legacy paths is valid', async () => {
  const { evaluateLegacyVerifySunsetGuardState } = await loadModule();
  const state = evaluateLegacyVerifySunsetGuardState();
  assert.equal(state.ok, true);
  assert.equal(state.LEGACY_VERIFY_SUNSET_GUARD_OK, 1);
  assert.equal(state.code, '');
});

test('legacy verify sunset guard state: legacy path that still emits PASS fails', async () => {
  const { evaluateLegacyVerifySunsetGuardState } = await loadModule();
  const tmpOpsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-verify-ops-'));
  const tmpGuardsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-verify-guards-'));
  try {
    const legacyPath = path.join(tmpOpsDir, 'post-merge-verify-legacy.mjs');
    fs.writeFileSync(legacyPath, 'console.log("POST_MERGE_VERIFY_OK=1");\n', 'utf8');

    const state = evaluateLegacyVerifySunsetGuardState({
      opsDir: tmpOpsDir,
      guardsDir: tmpGuardsDir,
    });
    assert.equal(state.ok, false);
    assert.equal(state.LEGACY_VERIFY_SUNSET_GUARD_OK, 0);
    assert.equal(state.code, 'E_LEGACY_VERIFY_PATH_STILL_PASSING');
    assert.ok(state.details.violatingPaths.includes(legacyPath));
  } finally {
    fs.rmSync(tmpOpsDir, { recursive: true, force: true });
    fs.rmSync(tmpGuardsDir, { recursive: true, force: true });
  }
});

test('legacy verify sunset guard state: legacy path with explicit legacy+block markers passes', async () => {
  const { evaluateLegacyVerifySunsetGuardState } = await loadModule();
  const tmpOpsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-verify-ops-'));
  const tmpGuardsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-verify-guards-'));
  try {
    const legacyPath = path.join(tmpOpsDir, 'post-merge-verify-legacy.mjs');
    fs.writeFileSync(
      legacyPath,
      '// LEGACY path\nconst FAIL_REASON = "E_LEGACY_VERIFY_DISABLED";\nprocess.exit(1);\n',
      'utf8',
    );

    const state = evaluateLegacyVerifySunsetGuardState({
      opsDir: tmpOpsDir,
      guardsDir: tmpGuardsDir,
    });
    assert.equal(state.ok, true);
    assert.equal(state.LEGACY_VERIFY_SUNSET_GUARD_OK, 1);
    assert.equal(state.code, '');
  } finally {
    fs.rmSync(tmpOpsDir, { recursive: true, force: true });
    fs.rmSync(tmpGuardsDir, { recursive: true, force: true });
  }
});
