#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateGovernanceChangeDetection } from './governance-change-detection.mjs';

const TOKEN_NAME = 'GOVERNANCE_FREEZE_OK';
const DEFAULT_BASE_REF = 'origin/main';
const FREEZE_PROFILE_VALUE = 'governance';

function normalizeFreezeProfile(value) {
  return String(value || '').trim().toLowerCase();
}

function buildState({
  ok,
  freezeActive,
  changedFiles,
  baseRef,
  repoRoot,
  freezeProfile,
  failReason,
}) {
  return {
    ok,
    tokens: {
      [TOKEN_NAME]: ok ? 1 : 0,
    },
    freeze_active: freezeActive,
    changed_files: [...changedFiles].sort((a, b) => a.localeCompare(b)),
    baseRef,
    repoRoot,
    freeze_profile: freezeProfile,
    failReason: ok ? '' : String(failReason || 'GOVERNANCE_FREEZE_CHECK_FAILED'),
  };
}

export function evaluateGovernanceFreezeState(input = {}) {
  const baseRef = String(input.baseRef || process.env.GOVERNANCE_FREEZE_BASE_REF || DEFAULT_BASE_REF).trim();
  const repoRoot = String(input.repoRoot || process.env.GOVERNANCE_FREEZE_REPO_ROOT || process.cwd()).trim();
  const freezeProfile = normalizeFreezeProfile(
    input.freezeProfile || process.env.FREEZE_PROFILE,
  );
  const freezeActive = freezeProfile === FREEZE_PROFILE_VALUE;

  if (!freezeActive) {
    return buildState({
      ok: true,
      freezeActive,
      changedFiles: [],
      baseRef,
      repoRoot,
      freezeProfile,
      failReason: '',
    });
  }

  const changeState = evaluateGovernanceChangeDetection({
    baseRef,
    repoRoot,
  });
  const changedFiles = Array.isArray(changeState && changeState.changed_governance_files)
    ? changeState.changed_governance_files
    : [];

  if (changedFiles.length > 0) {
    return buildState({
      ok: false,
      freezeActive,
      changedFiles,
      baseRef,
      repoRoot,
      freezeProfile,
      failReason: 'GOVERNANCE_FREEZE_VIOLATION',
    });
  }

  if (!changeState || changeState.ok !== true) {
    return buildState({
      ok: false,
      freezeActive,
      changedFiles,
      baseRef,
      repoRoot,
      freezeProfile,
      failReason: changeState && changeState.failReason
        ? changeState.failReason
        : 'GOVERNANCE_FREEZE_DETECTION_FAILED',
    });
  }

  return buildState({
    ok: true,
    freezeActive,
    changedFiles,
    baseRef,
    repoRoot,
    freezeProfile,
    failReason: '',
  });
}

function parseArgs(argv) {
  const out = {
    json: false,
    baseRef: '',
    repoRoot: '',
    freezeProfile: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--base-ref' && i + 1 < argv.length) {
      out.baseRef = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--repo-root' && i + 1 < argv.length) {
      out.repoRoot = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--freeze-profile' && i + 1 < argv.length) {
      out.freezeProfile = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state.tokens[TOKEN_NAME]}`);
  console.log(`GOVERNANCE_FREEZE_ACTIVE=${state.freeze_active ? 1 : 0}`);
  console.log(`GOVERNANCE_FREEZE_PROFILE=${state.freeze_profile}`);
  console.log(`GOVERNANCE_FREEZE_CHANGED_FILES=${JSON.stringify(state.changed_files)}`);
  if (state.failReason) {
    console.log(`GOVERNANCE_FREEZE_FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateGovernanceFreezeState({
    baseRef: args.baseRef,
    repoRoot: args.repoRoot,
    freezeProfile: args.freezeProfile,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state.ok ? 0 : 1);
}

const isEntrypoint = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main();
}
