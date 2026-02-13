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
      path.join(process.cwd(), 'scripts/ops/required-set-no-target-state.mjs'),
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

test('required-set-no-target state: repository baseline is valid', async () => {
  const { evaluateRequiredSetNoTargetState } = await loadModule();
  const state = evaluateRequiredSetNoTargetState();
  assert.equal(state.ok, true);
  assert.equal(state.REQUIRED_SET_NO_TARGET_OK, 1);
  assert.equal(state.code, '');
});

test('required-set-no-target state: release required token from target set fails', async () => {
  const { evaluateRequiredSetNoTargetState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'required-set-no-target-'));
  try {
    const requiredSetPath = path.join(tmpDir, 'REQUIRED_TOKEN_SET.json');
    const declarationPath = path.join(tmpDir, 'TOKEN_DECLARATION.json');

    const requiredSetDoc = readJson('docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json');
    const declarationDoc = readJson('docs/OPS/TOKENS/TOKEN_DECLARATION.json');

    requiredSetDoc.requiredSets.release = Array.isArray(requiredSetDoc.requiredSets.release)
      ? [...new Set([...requiredSetDoc.requiredSets.release, 'LEGACY_VERIFY_SUNSET_GUARD_OK'])]
      : ['LEGACY_VERIFY_SUNSET_GUARD_OK'];
    if (!Array.isArray(declarationDoc.targetTokens)) {
      declarationDoc.targetTokens = ['LEGACY_VERIFY_SUNSET_GUARD_OK'];
    } else if (!declarationDoc.targetTokens.includes('LEGACY_VERIFY_SUNSET_GUARD_OK')) {
      declarationDoc.targetTokens.push('LEGACY_VERIFY_SUNSET_GUARD_OK');
    }

    writeJson(requiredSetPath, requiredSetDoc);
    writeJson(declarationPath, declarationDoc);

    const state = evaluateRequiredSetNoTargetState({
      requiredSetPath,
      declarationPath,
    });
    assert.equal(state.ok, false);
    assert.equal(state.REQUIRED_SET_NO_TARGET_OK, 0);
    assert.equal(state.code, 'E_REQUIRED_SET_CONTAINS_TARGET');
    assert.ok(state.details.violatingTokens.includes('LEGACY_VERIFY_SUNSET_GUARD_OK'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
