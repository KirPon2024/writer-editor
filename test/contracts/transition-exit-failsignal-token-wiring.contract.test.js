const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FAILSIGNAL_REGISTRY_PATH = path.join(
  process.cwd(),
  'docs/OPS/FAILSIGNALS/FAILSIGNAL_REGISTRY.json',
);
const TOKEN_CATALOG_PATH = path.join(
  process.cwd(),
  'docs/OPS/TOKENS/TOKEN_CATALOG.json',
);
const REQUIRED_TOKEN_SET_PATH = path.join(
  process.cwd(),
  'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json',
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function indexBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const value = String(item?.[key] || '').trim();
    if (!value) continue;
    map.set(value, item);
  }
  return map;
}

test('transition-exit G0.2: required failSignals are registered with deterministic metadata', () => {
  const registry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const byCode = indexBy(registry.failSignals || [], 'code');

  const stageAxis = byCode.get('E_STAGE_AXIS_DRIFT');
  assert.ok(stageAxis, 'E_STAGE_AXIS_DRIFT must be registered');
  assert.equal(stageAxis.blocking, true);
  assert.equal(stageAxis.tier, 'release');
  assert.match(String(stageAxis.negativeTestRef || ''), /^test\/contracts\/menu-config-backcompat\.contract\.test\.js#/u);

  const promptLayer = byCode.get('E_PROMPT_LAYER_POLICY_INVALID');
  assert.ok(promptLayer, 'E_PROMPT_LAYER_POLICY_INVALID must be registered');
  assert.equal(promptLayer.blocking, true);
  assert.equal(promptLayer.tier, 'release');
  assert.match(String(promptLayer.negativeTestRef || ''), /^test\/contracts\/codex-no-repo-prompts\.contract\.test\.js#/u);

  const commandSurface = byCode.get('E_COMMAND_SURFACE_BYPASS');
  assert.ok(commandSurface, 'E_COMMAND_SURFACE_BYPASS must stay registered');
  assert.equal(commandSurface.blocking, true);
  assert.equal(commandSurface.tier, 'release');
  assert.match(String(commandSurface.negativeTestRef || ''), /^test\/contracts\/command-surface-bus-only\.contract\.test\.js#/u);
});

test('transition-exit G0.2: sequence-order drift is not registered as blocking failSignal', () => {
  const registry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const byCode = indexBy(registry.failSignals || [], 'code');
  const sequenceOrder = byCode.get('E_SEQUENCE_ORDER_DRIFT');
  if (!sequenceOrder) {
    assert.ok(true);
    return;
  }

  assert.equal(sequenceOrder.blocking, false);
});

test('transition-exit token wiring: stage/prompt/bus tokens are present with sourceBinding and failSignal binding', () => {
  const catalog = readJson(TOKEN_CATALOG_PATH);
  const byToken = indexBy(catalog.tokens || [], 'tokenId');

  const stageAxisToken = byToken.get('STAGE_AXIS_LOCK_ENFORCED_OK');
  assert.ok(stageAxisToken, 'STAGE_AXIS_LOCK_ENFORCED_OK must exist in token catalog');
  assert.equal(stageAxisToken.failSignalCode, 'E_STAGE_AXIS_DRIFT');
  assert.equal(stageAxisToken.sourceBinding, 'contract_test');
  assert.match(String(stageAxisToken.proofHook || ''), /^node --test test\/contracts\/menu-config-backcompat\.contract\.test\.js$/u);
  assert.ok(Object.prototype.hasOwnProperty.call(stageAxisToken, 'proofHookClosureSha256'));

  const promptLayerToken = byToken.get('PROMPT_LAYER_SINGLE_SOURCE_OK');
  assert.ok(promptLayerToken, 'PROMPT_LAYER_SINGLE_SOURCE_OK must exist in token catalog');
  assert.equal(promptLayerToken.failSignalCode, 'E_PROMPT_LAYER_POLICY_INVALID');
  assert.equal(promptLayerToken.sourceBinding, 'contract_test');
  assert.match(String(promptLayerToken.proofHook || ''), /^node scripts\/contracts\/check-codex-prompt-mode\.mjs$/u);
  assert.ok(Object.prototype.hasOwnProperty.call(promptLayerToken, 'proofHookClosureSha256'));

  const commandSurfaceToken = byToken.get('COMMAND_SURFACE_BUS_ONLY_OK');
  assert.ok(commandSurfaceToken, 'COMMAND_SURFACE_BUS_ONLY_OK must exist in token catalog');
  assert.equal(commandSurfaceToken.failSignalCode, 'E_COMMAND_SURFACE_BYPASS');
  assert.equal(commandSurfaceToken.sourceBinding, 'contract_test');
  assert.match(String(commandSurfaceToken.proofHook || ''), /^node --test test\/contracts\/command-surface-bus-only\.contract\.test\.js$/u);
  assert.ok(Object.prototype.hasOwnProperty.call(commandSurfaceToken, 'proofHookClosureSha256'));
});

test('transition-exit token wiring: new transitional tokens are not injected into release required set by default', () => {
  const requiredSet = readJson(REQUIRED_TOKEN_SET_PATH);
  const release = new Set(
    Array.isArray(requiredSet?.requiredSets?.release)
      ? requiredSet.requiredSets.release.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  );

  assert.equal(release.has('STAGE_AXIS_LOCK_ENFORCED_OK'), false);
  assert.equal(release.has('PROMPT_LAYER_SINGLE_SOURCE_OK'), false);
  assert.equal(release.has('COMMAND_SURFACE_BUS_ONLY_OK'), false);
});
