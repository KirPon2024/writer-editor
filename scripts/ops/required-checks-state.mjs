#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONTRACT_PATH = 'scripts/ops/required-checks.json';

function normalizeProfile(value) {
  const profile = String(value || process.env.REQUIRED_CHECKS_PROFILE || 'ops').trim();
  return profile.length > 0 ? profile : 'ops';
}

function readContract(path) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hasStringArray(value) {
  return Array.isArray(value) && value.every((it) => typeof it === 'string' && it.trim().length > 0);
}

export function evaluateRequiredChecksState(input = {}) {
  const contractPath = input.contractPath || process.env.REQUIRED_CHECKS_CONTRACT_PATH || DEFAULT_CONTRACT_PATH;
  const profile = normalizeProfile(input.profile);
  const contract = readContract(contractPath);

  if (!contract) {
    return {
      contractPath,
      profile,
      contractPresentOk: 0,
      syncOk: 0,
      source: 'missing',
      stale: 1,
      count: 0,
      required: [],
      detail: 'contract_missing_or_invalid',
      failReason: 'REQUIRED_CHECKS_CONTRACT_INVALID',
    };
  }

  const profiles = contract.profiles && typeof contract.profiles === 'object' && !Array.isArray(contract.profiles)
    ? contract.profiles
    : null;
  const selected = profiles && profiles[profile] && typeof profiles[profile] === 'object' ? profiles[profile] : null;
  const required = selected && hasStringArray(selected.required)
    ? [...new Set(selected.required.map((it) => it.trim()))].sort()
    : [];

  if (!profiles || !selected || required.length === 0) {
    return {
      contractPath,
      profile,
      contractPresentOk: 1,
      syncOk: 0,
      source: 'invalid',
      stale: 1,
      count: 0,
      required: [],
      detail: 'profile_missing_or_required_invalid',
      failReason: 'REQUIRED_CHECKS_PROFILE_INVALID',
    };
  }

  const source = contract.source === 'canonical' ? 'canonical' : String(contract.lastSyncSource || 'local');
  const stale = source === 'canonical' ? 0 : 1;
  const syncOk = source === 'canonical' && stale === 0 ? 1 : 0;

  return {
    contractPath,
    profile,
    contractPresentOk: 1,
    syncOk,
    source,
    stale,
    count: required.length,
    required,
    detail: syncOk === 1 ? 'canonical_contract_ready' : 'non_canonical_contract_source',
    failReason: syncOk === 1 ? '' : 'REQUIRED_CHECKS_NOT_CANONICAL',
  };
}

function printTokens(state) {
  console.log(`REQUIRED_CHECKS_CONTRACT_PRESENT_OK=${state.contractPresentOk}`);
  console.log(`REQUIRED_CHECKS_SYNC_OK=${state.syncOk}`);
  console.log(`REQUIRED_CHECKS_SOURCE=${state.source}`);
  console.log(`REQUIRED_CHECKS_STALE=${state.stale}`);
  console.log(`REQUIRED_CHECKS_COUNT=${state.count}`);
  console.log(`REQUIRED_CHECKS_PROFILE=${state.profile}`);
  console.log(`REQUIRED_CHECKS_DETAIL=${state.detail}`);
  console.log(`REQUIRED_CHECKS_LIST=${JSON.stringify(state.required)}`);
  if (state.failReason) console.log(`FAIL_REASON=${state.failReason}`);
}

function parseArgs(argv) {
  const out = { profile: '', contractPath: '' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--profile') {
      out.profile = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (argv[i] === '--contract-path') {
      out.contractPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateRequiredChecksState({
    profile: args.profile,
    contractPath: args.contractPath,
  });
  printTokens(state);
  process.exit(state.syncOk === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
