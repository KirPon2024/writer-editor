#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'ORIGIN_SMOKE_OK';
const FAIL_CODE = 'E_NETWORK_ORIGIN_UNAVAILABLE';

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

function runGit(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function parseHeadSha() {
  const result = runGit(['rev-parse', 'HEAD']);
  if (result.status !== 0) return '';
  return String(result.stdout || '').trim();
}

function parseOriginMainSha() {
  const result = runGit(['rev-parse', 'origin/main']);
  if (result.status !== 0) return '';
  return String(result.stdout || '').trim();
}

function parseAncestorOk() {
  const result = runGit(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
  return result.status === 0;
}

function parseArgs(argv) {
  const out = {
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
  }
  return out;
}

export function evaluateOriginSmokeState(input = {}) {
  const headSha = String(
    input.headSha === undefined ? parseHeadSha() : input.headSha,
  ).trim();
  const originMainSha = String(
    input.originMainSha === undefined ? parseOriginMainSha() : input.originMainSha,
  ).trim();
  const ancestorOk = input.ancestorOk === undefined
    ? parseAncestorOk()
    : input.ancestorOk === true;

  const ok = headSha.length > 0 && originMainSha.length > 0 && ancestorOk;
  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    code: ok ? '' : FAIL_CODE,
    details: {
      headSha,
      originMainSha,
      ancestorOk: ancestorOk ? 1 : 0,
    },
  };
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`ORIGIN_SMOKE_HEAD_SHA=${state.details.headSha}`);
  console.log(`ORIGIN_SMOKE_ORIGIN_MAIN_SHA=${state.details.originMainSha}`);
  console.log(`ORIGIN_SMOKE_ANCESTOR_OK=${state.details.ancestorOk}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.code}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateOriginSmokeState();
  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state[TOKEN_NAME] === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
