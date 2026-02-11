#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFreezeRollupsState } from './freeze-rollups-state.mjs';

const VERSION = 'xplat-cost-guarantee-state.v1';
const REQUIRED_TOKENS = Object.freeze([
  'SCR_SHARED_CODE_RATIO_OK',
  'PLATFORM_COVERAGE_BOUNDARY_TESTED_OK',
  'CAPABILITY_ENFORCED_OK',
  'ADAPTERS_ENFORCED_OK',
]);

function parseArgs(argv) {
  const out = { json: false };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
  }
  return out;
}

export function evaluateXplatCostGuaranteeState() {
  const rollups = evaluateFreezeRollupsState({
    mode: 'release',
    skipTokenEmissionCheck: true,
  });

  const requires = {};
  const missing = [];
  for (const token of REQUIRED_TOKENS) {
    if (!Object.prototype.hasOwnProperty.call(rollups, token)) {
      requires[token] = null;
      missing.push(token);
      continue;
    }
    requires[token] = Number(rollups[token]) === 1 ? 1 : 0;
  }

  const ok = missing.length === 0 && REQUIRED_TOKENS.every((token) => requires[token] === 1);
  const state = {
    version: VERSION,
    ok,
    XPLAT_COST_GUARANTEE_OK: ok ? 1 : 0,
    requires,
    missing,
    failReason: '',
  };

  if (!ok) {
    if (missing.length > 0) state.failReason = 'XPLAT_COST_GUARANTEE_MISSING_REQUIRED_TOKEN';
    else state.failReason = 'XPLAT_COST_GUARANTEE_REQUIREMENT_NOT_MET';
  }
  return state;
}

function printTokens(state) {
  console.log(`XPLAT_COST_GUARANTEE_VERSION=${state.version}`);
  console.log(`XPLAT_COST_GUARANTEE_OK=${state.XPLAT_COST_GUARANTEE_OK}`);
  console.log(`XPLAT_COST_GUARANTEE_REQUIRES=${JSON.stringify(state.requires)}`);
  console.log(`XPLAT_COST_GUARANTEE_MISSING=${JSON.stringify(state.missing)}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateXplatCostGuaranteeState();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
