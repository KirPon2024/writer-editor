#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFreezeRollupsState } from './freeze-rollups-state.mjs';
import { evaluateFreezeModeFromRollups } from './freeze-mode-evaluator.mjs';

const TOOL_VERSION = 'freeze-mode-state.v1';

function parseArgs(argv) {
  const out = { json: false };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
  }
  return out;
}

function resolveFreezeModeEnabled(input) {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'number') return input === 1;
  return String(process.env.FREEZE_MODE || '').trim() === '1';
}

export function evaluateFreezeModeState(input = {}) {
  const freezeRollups = input.freezeRollups && typeof input.freezeRollups === 'object' && !Array.isArray(input.freezeRollups)
    ? input.freezeRollups
    : evaluateFreezeRollupsState({
      mode: 'release',
      skipTokenEmissionCheck: true,
    });

  const modeState = evaluateFreezeModeFromRollups(freezeRollups, {
    freezeModeEnabled: resolveFreezeModeEnabled(input.freezeModeEnabled),
  });

  return {
    toolVersion: TOOL_VERSION,
    freezeMode: modeState.freezeMode,
    ok: modeState.ok,
    missingTokens: modeState.missingTokens,
    violations: modeState.violations,
    FREEZE_MODE_STRICT_OK: modeState.FREEZE_MODE_STRICT_OK,
  };
}

function printTokens(state) {
  console.log(`FREEZE_MODE_ACTIVE=${state.freezeMode ? 1 : 0}`);
  console.log(`FREEZE_MODE_STRICT_OK=${state.FREEZE_MODE_STRICT_OK}`);
  console.log(`FREEZE_MODE_OK=${state.ok ? 1 : 0}`);
  console.log(`FREEZE_MODE_MISSING_TOKENS=${JSON.stringify(state.missingTokens)}`);
  console.log(`FREEZE_MODE_VIOLATIONS=${JSON.stringify(state.violations)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateFreezeModeState();
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
