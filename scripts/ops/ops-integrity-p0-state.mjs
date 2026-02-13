#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateTokenCatalogState } from './token-catalog-state.mjs';
import { evaluateFailsignalRegistryState } from './failsignal-registry-state.mjs';
import { evaluateRequiredSetNoTargetState } from './required-set-no-target-state.mjs';
import { evaluateConfigHashLockState } from './config-hash-lock-state.mjs';
import { evaluateProofhookIntegrityState } from './proofhook-integrity-state.mjs';

const TOKEN_NAME = 'OPS_INTEGRITY_P0_STATE_OK';
const COMPONENT_TOKEN_IDS = Object.freeze([
  'TOKEN_CATALOG_VALID_OK',
  'FAILSIGNAL_REGISTRY_VALID_OK',
  'REQUIRED_SET_NO_TARGET_OK',
  'CONFIG_HASH_LOCK_OK',
  'PROOFHOOK_INTEGRITY_OK',
]);

const DEFAULT_COMPONENT_EVALUATORS = Object.freeze({
  TOKEN_CATALOG_VALID_OK: () => evaluateTokenCatalogState(),
  FAILSIGNAL_REGISTRY_VALID_OK: () => evaluateFailsignalRegistryState(),
  REQUIRED_SET_NO_TARGET_OK: () => evaluateRequiredSetNoTargetState(),
  CONFIG_HASH_LOCK_OK: () => evaluateConfigHashLockState(),
  PROOFHOOK_INTEGRITY_OK: () => evaluateProofhookIntegrityState(),
});

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortObject(item));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSortObject(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value), null, 2);
}

function toTokenValue(value) {
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return value.trim() === '1' ? 1 : 0;
  return 0;
}

function resolveComponentToken(state, tokenId) {
  if (!isObjectRecord(state)) return 0;
  if (Object.prototype.hasOwnProperty.call(state, tokenId)) {
    return toTokenValue(state[tokenId]);
  }
  if (isObjectRecord(state.tokens) && Object.prototype.hasOwnProperty.call(state.tokens, tokenId)) {
    return toTokenValue(state.tokens[tokenId]);
  }
  return 0;
}

function evaluateComponent(tokenId, evaluator) {
  if (typeof evaluator !== 'function') return 0;
  try {
    const state = evaluator();
    return resolveComponentToken(state, tokenId);
  } catch {
    return 0;
  }
}

export function evaluateOpsIntegrityP0State(input = {}) {
  const overrides = isObjectRecord(input.componentEvaluators) ? input.componentEvaluators : {};
  const components = {};
  for (const tokenId of COMPONENT_TOKEN_IDS) {
    const evaluator = Object.prototype.hasOwnProperty.call(overrides, tokenId)
      ? overrides[tokenId]
      : DEFAULT_COMPONENT_EVALUATORS[tokenId];
    components[tokenId] = evaluateComponent(tokenId, evaluator);
  }

  const ok = COMPONENT_TOKEN_IDS.every((tokenId) => components[tokenId] === 1);
  return {
    [TOKEN_NAME]: ok ? 1 : 0,
    COMPONENTS: components,
  };
}

export function exitCodeFromOpsIntegrityP0State(state) {
  return toTokenValue(state && state[TOKEN_NAME]) === 1 ? 0 : 1;
}

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
  };
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`OPS_INTEGRITY_P0_COMPONENTS=${JSON.stringify(state.COMPONENTS)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateOpsIntegrityP0State();
  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(exitCodeFromOpsIntegrityP0State(state));
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
