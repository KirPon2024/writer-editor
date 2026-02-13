#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'VERIFY_ORCHESTRATOR_CANON_OK';
const FAIL_CODE = 'E_VERIFY_ORCHESTRATOR_MISMATCH';
const DEFAULT_OPS_DIR = 'scripts/ops';
const ORCHESTRATOR_FILE = 'post-merge-verify.mjs';
const HELPER_FILE = 'emit-post-merge-verify-attestation.mjs';
const ORCHESTRATOR_FILE_RE = /^post-merge-verify.*\.mjs$/u;
const LEGACY_DENYLIST = Object.freeze([
  'post-merge-verify-legacy.mjs',
  'post-merge-verify-old.mjs',
  'post-merge-verify-deprecated.mjs',
  'post-merge-verify-v1.mjs',
  'post-merge-verify-v2.mjs',
]);

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

function listOpsFiles(opsDir) {
  try {
    return fs.readdirSync(opsDir, { withFileTypes: true })
      .filter((item) => item.isFile())
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function parseArgs(argv) {
  const out = {
    json: false,
    opsDir: DEFAULT_OPS_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--ops-dir' && i + 1 < argv.length) {
      out.opsDir = String(argv[i + 1] || '').trim() || DEFAULT_OPS_DIR;
      i += 1;
    }
  }
  return out;
}

function buildFailDetails({
  orchestratorExists,
  helperExists,
  foundEntrypoints,
  denylistHits,
}) {
  return {
    orchestratorExists: orchestratorExists ? 1 : 0,
    helperExists: helperExists ? 1 : 0,
    foundEntrypoints: [...foundEntrypoints].sort((a, b) => a.localeCompare(b)),
    denylistHits: [...denylistHits].sort((a, b) => a.localeCompare(b)),
  };
}

export function evaluateVerifyOrchestratorCanonState(input = {}) {
  const opsDir = String(input.opsDir || process.env.VERIFY_ORCHESTRATOR_OPS_DIR || DEFAULT_OPS_DIR).trim() || DEFAULT_OPS_DIR;
  const opsFiles = listOpsFiles(opsDir);

  const orchestratorExists = opsFiles.includes(ORCHESTRATOR_FILE);
  const helperExists = opsFiles.includes(HELPER_FILE);

  const orchestratorCandidates = opsFiles.filter((name) => ORCHESTRATOR_FILE_RE.test(name));
  const alternativeEntrypoints = orchestratorCandidates
    .filter((name) => name !== ORCHESTRATOR_FILE)
    .sort((a, b) => a.localeCompare(b));
  const denylistHits = LEGACY_DENYLIST.filter((name) => opsFiles.includes(name));

  const foundEntrypoints = [
    ...alternativeEntrypoints,
    ...denylistHits,
  ].sort((a, b) => a.localeCompare(b));

  const ok = orchestratorExists && helperExists && foundEntrypoints.length === 0;
  const details = buildFailDetails({
    orchestratorExists,
    helperExists,
    foundEntrypoints,
    denylistHits,
  });

  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    code: ok ? '' : FAIL_CODE,
    details,
    paths: {
      opsDir,
      orchestratorPath: path.join(opsDir, ORCHESTRATOR_FILE),
      helperPath: path.join(opsDir, HELPER_FILE),
    },
  };
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`VERIFY_ORCHESTRATOR_CANON_OPS_DIR=${state.paths.opsDir}`);
  console.log(`VERIFY_ORCHESTRATOR_CANON_ORCHESTRATOR_PATH=${state.paths.orchestratorPath}`);
  console.log(`VERIFY_ORCHESTRATOR_CANON_HELPER_PATH=${state.paths.helperPath}`);
  console.log(`VERIFY_ORCHESTRATOR_CANON_FOUND_ENTRYPOINTS=${JSON.stringify(state.details.foundEntrypoints)}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.code}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateVerifyOrchestratorCanonState({ opsDir: args.opsDir });
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
