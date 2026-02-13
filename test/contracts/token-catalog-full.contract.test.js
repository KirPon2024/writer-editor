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
      path.join(process.cwd(), 'scripts/ops/lossless-map-state.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

function makeTempCatalogFiles(config = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-catalog-full-'));
  const declarationPath = path.join(tmpDir, 'TOKEN_DECLARATION.json');
  const claimsPath = path.join(tmpDir, 'CRITICAL_CLAIM_MATRIX.json');
  const requiredSetPath = path.join(tmpDir, 'REQUIRED_TOKEN_SET.json');

  const declarationDoc = config.declarationDoc || {
    schemaVersion: 1,
    existingTokens: ['CORE_SOT_EXECUTABLE_OK'],
    targetTokens: ['LOSSLESS_MAP_OK'],
  };
  const claimsDoc = config.claimsDoc || {
    schemaVersion: 1,
    claims: [
      {
        claimId: 'LOSSLESS_MAP',
        requiredToken: 'LOSSLESS_MAP_OK',
        proofHook: 'node scripts/ops/lossless-map-state.mjs --json',
        failSignal: 'E_LOSSLESS_MAP_INCOMPLETE',
        blocking: true,
        gateTier: 'release',
        sourceBinding: 'ops_script',
      },
    ],
  };
  const requiredSetDoc = config.requiredSetDoc || {
    schemaVersion: 1,
    requiredSets: {
      core: ['CORE_SOT_EXECUTABLE_OK'],
      release: ['CORE_SOT_EXECUTABLE_OK', 'LOSSLESS_MAP_OK'],
      active: ['CORE_SOT_EXECUTABLE_OK', 'LOSSLESS_MAP_OK'],
      freezeMode: ['FREEZE_MODE_STRICT_OK'],
    },
    freezeReady: {
      requiredAlways: ['CORE_SOT_EXECUTABLE_OK'],
      requiredFreezeMode: ['FREEZE_MODE_STRICT_OK'],
      requiredTokens: ['CORE_SOT_EXECUTABLE_OK', 'FREEZE_MODE_STRICT_OK'],
    },
  };

  fs.writeFileSync(declarationPath, JSON.stringify(declarationDoc, null, 2));
  fs.writeFileSync(claimsPath, JSON.stringify(claimsDoc, null, 2));
  fs.writeFileSync(requiredSetPath, JSON.stringify(requiredSetDoc, null, 2));

  return { tmpDir, declarationPath, claimsPath, requiredSetPath };
}

test('lossless map: repository baseline is complete', async () => {
  const { evaluateLosslessMapState } = await loadModule();
  const state = evaluateLosslessMapState();
  assert.equal(state.ok, true);
  assert.equal(state.tokens.LOSSLESS_MAP_OK, 1);
  assert.equal(state.releaseRequired.includes('LOSSLESS_MAP_OK'), true);
  assert.equal(state.coreRequired.includes('LOSSLESS_MAP_OK'), false);
});

test('lossless map: fails when release set misses LOSSLESS_MAP_OK', async () => {
  const { evaluateLosslessMapState } = await loadModule();
  const files = makeTempCatalogFiles({
    requiredSetDoc: {
      schemaVersion: 1,
      requiredSets: {
        core: ['CORE_SOT_EXECUTABLE_OK'],
        release: ['CORE_SOT_EXECUTABLE_OK'],
        active: ['CORE_SOT_EXECUTABLE_OK'],
        freezeMode: ['FREEZE_MODE_STRICT_OK'],
      },
      freezeReady: {
        requiredAlways: ['CORE_SOT_EXECUTABLE_OK'],
        requiredFreezeMode: ['FREEZE_MODE_STRICT_OK'],
        requiredTokens: ['CORE_SOT_EXECUTABLE_OK', 'FREEZE_MODE_STRICT_OK'],
      },
    },
  });

  const state = evaluateLosslessMapState({
    declarationPath: files.declarationPath,
    claimsPath: files.claimsPath,
    requiredSetPath: files.requiredSetPath,
  });
  fs.rmSync(files.tmpDir, { recursive: true, force: true });

  assert.equal(state.ok, false);
  assert.equal(state.tokens.LOSSLESS_MAP_OK, 0);
  assert.ok(state.failures.includes('LOSSLESS_TOKEN_MISSING_IN_RELEASE_REQUIRED_SET'));
});

test('lossless map: fails on unknown namespace drift in claim matrix', async () => {
  const { evaluateLosslessMapState } = await loadModule();
  const files = makeTempCatalogFiles({
    declarationDoc: {
      schemaVersion: 1,
      existingTokens: ['CORE_SOT_EXECUTABLE_OK'],
      targetTokens: ['FOO_NAMESPACE_OK', 'LOSSLESS_MAP_OK'],
    },
    claimsDoc: {
      schemaVersion: 1,
      claims: [
        {
          claimId: 'FOO_NAMESPACE',
          requiredToken: 'FOO_NAMESPACE_OK',
          proofHook: 'node scripts/ops/failsignal-registry-state.mjs --json',
          failSignal: 'E_UNKNOWN_NAMESPACE',
          blocking: true,
          gateTier: 'release',
          sourceBinding: 'ops_script',
        },
      ],
    },
    requiredSetDoc: {
      schemaVersion: 1,
      requiredSets: {
        core: ['CORE_SOT_EXECUTABLE_OK'],
        release: ['CORE_SOT_EXECUTABLE_OK', 'FOO_NAMESPACE_OK', 'LOSSLESS_MAP_OK'],
        active: ['CORE_SOT_EXECUTABLE_OK', 'FOO_NAMESPACE_OK', 'LOSSLESS_MAP_OK'],
        freezeMode: ['FREEZE_MODE_STRICT_OK'],
      },
      freezeReady: {
        requiredAlways: ['CORE_SOT_EXECUTABLE_OK'],
        requiredFreezeMode: ['FREEZE_MODE_STRICT_OK'],
        requiredTokens: ['CORE_SOT_EXECUTABLE_OK', 'FREEZE_MODE_STRICT_OK'],
      },
    },
  });

  const state = evaluateLosslessMapState({
    declarationPath: files.declarationPath,
    claimsPath: files.claimsPath,
    requiredSetPath: files.requiredSetPath,
  });
  fs.rmSync(files.tmpDir, { recursive: true, force: true });

  assert.equal(state.ok, false);
  assert.equal(state.tokens.LOSSLESS_MAP_OK, 0);
  assert.ok(state.failures.includes('CRITICAL_CLAIM_MATRIX_INVALID'));
});
