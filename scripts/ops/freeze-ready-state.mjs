#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFreezeRollupsState } from './freeze-rollups-state.mjs';
import { evaluateFreezeReadyFromRollups } from './freeze-ready-evaluator.mjs';

function parseArgs(argv) {
  const out = { json: false };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
  }
  return out;
}

export function evaluateFreezeReadyState() {
  const rollups = evaluateFreezeRollupsState({
    mode: 'release',
    skipTokenEmissionCheck: true,
  });
  return evaluateFreezeReadyFromRollups(rollups);
}

function printTokens(state) {
  console.log(`FREEZE_READY_OK=${state.FREEZE_READY_OK}`);
  console.log(`FREEZE_READY_FREEZE_READY=${state.freezeReady ? 1 : 0}`);
  console.log(`FREEZE_READY_MISSING_TOKENS=${JSON.stringify(state.missingTokens)}`);
  console.log(`FREEZE_READY_DRIFT_COUNT=${state.driftCount}`);
  console.log(`FREEZE_READY_DEBT_TTL_VALID=${state.debtTTLValid ? 1 : 0}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateFreezeReadyState();
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
