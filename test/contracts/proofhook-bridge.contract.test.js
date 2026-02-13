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
      path.join(process.cwd(), 'scripts/ops/proofhook-bridge-state.mjs'),
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

function withTempDocs(mutator, run) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofhook-bridge-contract-'));
  const mapPath = path.join(tmpDir, 'PROOFHOOK_BRIDGE_MAP.json');
  const declarationPath = path.join(tmpDir, 'TOKEN_DECLARATION.json');
  try {
    const baseMap = readJson('docs/OPS/BRIDGES/PROOFHOOK_BRIDGE_MAP.json');
    const baseDecl = readJson('docs/OPS/TOKENS/TOKEN_DECLARATION.json');
    const mutated = mutator({
      map: JSON.parse(JSON.stringify(baseMap)),
      declaration: JSON.parse(JSON.stringify(baseDecl)),
    });
    writeJson(mapPath, mutated.map);
    writeJson(declarationPath, mutated.declaration);
    run({ mapPath, declarationPath });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('proofhook bridge state: baseline map is valid', async () => {
  const { evaluateBridgeMapState } = await loadModule();
  const state = evaluateBridgeMapState();
  assert.equal(state.ok, true);
  assert.equal(state.PROOFHOOK_BRIDGE_VALID_OK, 1);
  assert.equal(state.failSignalCode, '');
});

test('proofhook bridge state: duplicate tokenId fails as invalid', async () => {
  const { evaluateBridgeMapState } = await loadModule();
  withTempDocs(({ map, declaration }) => {
    map.bridges.push({ ...map.bridges[0] });
    return { map, declaration };
  }, ({ mapPath, declarationPath }) => {
    const state = evaluateBridgeMapState({
      bridgeMapPath: mapPath,
      declarationPath: declarationPath,
    });
    assert.equal(state.ok, false);
    assert.equal(state.PROOFHOOK_BRIDGE_VALID_OK, 0);
    assert.equal(state.failSignalCode, 'E_PROOFHOOK_BRIDGE_INVALID');
  });
});

test('proofhook bridge state: active bridge missing sunset metadata fails as invalid', async () => {
  const { evaluateBridgeMapState } = await loadModule();
  withTempDocs(({ map, declaration }) => {
    const row = map.bridges.find((item) => item.status === 'ACTIVE_BRIDGE');
    if (row) {
      delete row.sunsetAtUtc;
      delete row.sunsetCommitMarker;
    } else {
      map.bridges.push({
        tokenId: 'PROOFHOOK_INTEGRITY_OK',
        status: 'ACTIVE_BRIDGE',
        currentProofHook: 'node scripts/ops/proofhook-integrity-state.mjs --json',
        targetProofHook: 'node scripts/ops/proofhook-integrity-state.mjs --json',
        rationale: 'compat bridge',
      });
    }
    return { map, declaration };
  }, ({ mapPath, declarationPath }) => {
    const state = evaluateBridgeMapState({
      bridgeMapPath: mapPath,
      declarationPath: declarationPath,
    });
    assert.equal(state.ok, false);
    assert.equal(state.PROOFHOOK_BRIDGE_VALID_OK, 0);
    assert.equal(state.failSignalCode, 'E_PROOFHOOK_BRIDGE_INVALID');
  });
});

test('proofhook bridge state: expired sunset fails with E_PROOFHOOK_BRIDGE_SUNSET_EXPIRED', async () => {
  const { evaluateBridgeMapState } = await loadModule();
  withTempDocs(({ map, declaration }) => {
    map.bridges[0].status = 'ACTIVE_BRIDGE';
    map.bridges[0].currentProofHook = 'node scripts/ops/proofhook-bridge-state.mjs --json';
    map.bridges[0].sunsetAtUtc = '2020-01-01T00:00:00Z';
    map.bridges[0].sunsetCommitMarker = 'expired-marker';
    return { map, declaration };
  }, ({ mapPath, declarationPath }) => {
    const state = evaluateBridgeMapState({
      bridgeMapPath: mapPath,
      declarationPath: declarationPath,
    });
    assert.equal(state.ok, false);
    assert.equal(state.PROOFHOOK_BRIDGE_VALID_OK, 0);
    assert.equal(state.failSignalCode, 'E_PROOFHOOK_BRIDGE_SUNSET_EXPIRED');
  });
});

test('proofhook bridge state: null currentProofHook for non-target token fails as invalid', async () => {
  const { evaluateBridgeMapState } = await loadModule();
  withTempDocs(({ map, declaration }) => {
    map.bridges.push({
      tokenId: 'CORE_SOT_EXECUTABLE_OK',
      status: 'TARGET_ONLY',
      currentProofHook: null,
      targetProofHook: 'DOCTOR_MODE=delivery node scripts/doctor.mjs',
      sunsetAtUtc: '2026-12-31T23:59:59Z',
      sunsetCommitMarker: 'bridge-core-demo',
      rationale: 'invalid sample',
    });
    return { map, declaration };
  }, ({ mapPath, declarationPath }) => {
    const state = evaluateBridgeMapState({
      bridgeMapPath: mapPath,
      declarationPath: declarationPath,
    });
    assert.equal(state.ok, false);
    assert.equal(state.PROOFHOOK_BRIDGE_VALID_OK, 0);
    assert.equal(state.failSignalCode, 'E_PROOFHOOK_BRIDGE_INVALID');
  });
});
