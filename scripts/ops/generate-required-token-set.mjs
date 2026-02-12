#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  evaluateExecutionProfileValidationState,
  validateExecutionProfileDocument,
} from './validate-execution-profile.mjs';

const TOOL_VERSION = 'generate-required-token-set.v1';
const TOKEN_NAME = 'GATE_TIER_POLICY_OK';
const DEFAULT_PROFILE_PATH = 'docs/OPS/EXECUTION/EXECUTION_PROFILE.example.json';
const DEFAULT_LOCK_PATH = 'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json';
const TOKEN_RE = /^[A-Z0-9_]+$/u;
const RELEASE_ALWAYS_REQUIRED_TOKENS = Object.freeze([
  'PROOFHOOK_INTEGRITY_OK',
]);
const FREEZE_READY_EXCLUDED_RELEASE_TOKENS = new Set([
  'PROOFHOOK_INTEGRITY_OK',
]);

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortObject(item));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = stableSortObject(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value));
}

function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function uniqueSortedTokens(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const token = String(raw || '').trim();
    if (!token || seen.has(token) || !TOKEN_RE.test(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out.sort();
}

function readJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectConditionalTokens(profile, tier) {
  const requiredSets = isObjectRecord(profile.requiredSets) ? profile.requiredSets : {};
  const scopeFlags = isObjectRecord(profile.scopeFlags) ? profile.scopeFlags : {};
  const rows = Array.isArray(requiredSets.conditional) ? requiredSets.conditional : [];
  const tokens = [];
  for (const row of rows) {
    if (!isObjectRecord(row)) continue;
    const applyTo = Array.isArray(row.applyTo) ? row.applyTo.map((item) => String(item || '').trim()) : [];
    if (!applyTo.includes(tier)) continue;
    const flag = String(row.flag || '').trim();
    const enabledWhen = row.enabledWhen === true;
    if (!flag || typeof scopeFlags[flag] !== 'boolean') continue;
    if (scopeFlags[flag] === enabledWhen) {
      tokens.push(...uniqueSortedTokens(row.tokens));
    }
  }
  return uniqueSortedTokens(tokens);
}

export function buildRequiredTokenSetFromProfile(profileDoc = {}) {
  const validated = validateExecutionProfileDocument(profileDoc);
  if (!validated.ok) {
    return {
      ok: false,
      failures: validated.failures,
      requiredTokenSet: null,
      configHash: sha256Hex(stableStringify({
        profile: validated.normalizedProfile,
        failures: validated.failures,
      })),
    };
  }

  const profile = validated.normalizedProfile;
  const requiredSets = profile.requiredSets;
  const coreBase = uniqueSortedTokens(requiredSets.core);
  const releaseBase = uniqueSortedTokens(requiredSets.release);
  const freezeModeBase = uniqueSortedTokens(requiredSets.freezeMode);

  const coreConditional = collectConditionalTokens(profile, 'core');
  const releaseConditional = collectConditionalTokens(profile, 'release');
  const coreRequired = uniqueSortedTokens([...coreBase, ...coreConditional]);
  const releaseRequired = uniqueSortedTokens([
    ...releaseBase,
    ...releaseConditional,
    ...RELEASE_ALWAYS_REQUIRED_TOKENS,
  ]);
  const activeTier = String(profile.gateTier || '') === 'release' ? 'release' : 'core';
  const activeRequired = activeTier === 'release' ? releaseRequired : coreRequired;
  const freezeReadyRequiredAlways = releaseRequired.filter(
    (token) => !FREEZE_READY_EXCLUDED_RELEASE_TOKENS.has(token),
  );
  const freezeReadyRequiredTokens = uniqueSortedTokens([...freezeReadyRequiredAlways, ...freezeModeBase]);

  const payloadWithoutHash = {
    schemaVersion: 1,
    toolVersion: TOOL_VERSION,
    profile: String(profile.profile || ''),
    gateTier: activeTier,
    scopeFlags: stableSortObject(profile.scopeFlags || {}),
    requiredSets: {
      core: coreRequired,
      release: releaseRequired,
      active: activeRequired,
      freezeMode: freezeModeBase,
    },
    freezeReady: {
      requiredAlways: freezeReadyRequiredAlways,
      requiredFreezeMode: freezeModeBase,
      requiredTokens: freezeReadyRequiredTokens,
    },
  };

  return {
    ok: true,
    failures: [],
    requiredTokenSet: {
      ...payloadWithoutHash,
      configHash: sha256Hex(stableStringify(payloadWithoutHash)),
    },
    configHash: sha256Hex(stableStringify(payloadWithoutHash)),
  };
}

export function evaluateGenerateRequiredTokenSetState(input = {}) {
  const profilePath = String(
    input.profilePath
      || process.env.EXECUTION_PROFILE_PATH
      || DEFAULT_PROFILE_PATH,
  ).trim();
  const lockPath = String(
    input.lockPath
      || process.env.REQUIRED_TOKEN_SET_PATH
      || DEFAULT_LOCK_PATH,
  ).trim();
  const writeLock = input.writeLock === true;

  const validationState = evaluateExecutionProfileValidationState({ profilePath });
  const failures = new Set(validationState.failures);
  const profileDoc = isObjectRecord(input.profileDoc) ? input.profileDoc : readJsonObject(profilePath);
  const generated = buildRequiredTokenSetFromProfile(profileDoc || {});

  for (const failure of generated.failures) failures.add(failure);
  if (!generated.ok || !generated.requiredTokenSet) {
    failures.add('E_REQUIRED_TOKEN_SET_DRIFT');
  }

  if (generated.ok && generated.requiredTokenSet && writeLock) {
    const serialized = `${JSON.stringify(generated.requiredTokenSet, null, 2)}\n`;
    fs.writeFileSync(lockPath, serialized);
  }

  const sortedFailures = [...failures].sort();
  const ok = sortedFailures.length === 0;
  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    failures: sortedFailures,
    profilePath,
    lockPath,
    lockWritten: writeLock && generated.ok ? 1 : 0,
    requiredTokenSet: generated.requiredTokenSet || null,
    toolVersion: TOOL_VERSION,
    configHash: generated.configHash,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    writeLock: false,
    profilePath: '',
    lockPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--write-lock') out.writeLock = true;
    if (arg === '--profile' && i + 1 < argv.length) {
      out.profilePath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--lock-path' && i + 1 < argv.length) {
      out.lockPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`REQUIRED_TOKEN_SET_PROFILE_PATH=${state.profilePath}`);
  console.log(`REQUIRED_TOKEN_SET_LOCK_PATH=${state.lockPath}`);
  console.log(`REQUIRED_TOKEN_SET_LOCK_WRITTEN=${state.lockWritten}`);
  const active = state.requiredTokenSet && state.requiredTokenSet.requiredSets
    ? state.requiredTokenSet.requiredSets.active
    : [];
  console.log(`REQUIRED_TOKEN_SET_ACTIVE=${JSON.stringify(active)}`);
  const freezeReadyTokens = state.requiredTokenSet && state.requiredTokenSet.freezeReady
    ? state.requiredTokenSet.freezeReady.requiredTokens
    : [];
  console.log(`REQUIRED_TOKEN_SET_FREEZE_READY=${JSON.stringify(freezeReadyTokens)}`);
  console.log(`REQUIRED_TOKEN_SET_FAILURES=${JSON.stringify(state.failures)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateGenerateRequiredTokenSetState({
    profilePath: args.profilePath || undefined,
    lockPath: args.lockPath || undefined,
    writeLock: args.writeLock,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
