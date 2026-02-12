#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'GOVERNANCE_SINGLE_VERIFY_CONTOUR_ENFORCED_OK';
const FAIL_CODE = 'E_DOUBLE_VERIFY_CONTOUR_DETECTED';
const DEFAULT_OPS_DIR = 'scripts/ops';
const DEFAULT_CLAIMS_PATH = 'docs/OPS/CLAIMS/CRITICAL_CLAIM_MATRIX.json';
const ORCHESTRATOR_FILE = 'post-merge-verify.mjs';
const HELPER_FILE = 'emit-post-merge-verify-attestation.mjs';
const SELF_FILE = 'verify-contour-state.mjs';
const ORCHESTRATOR_FILE_RE = /^post-merge-verify.*\.mjs$/u;

function parseArgs(argv) {
  const out = {
    json: false,
    opsDir: DEFAULT_OPS_DIR,
    claimsPath: DEFAULT_CLAIMS_PATH,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--ops-dir' && i + 1 < argv.length) {
      out.opsDir = String(argv[i + 1] || '').trim() || DEFAULT_OPS_DIR;
      i += 1;
      continue;
    }
    if (arg === '--claims-path' && i + 1 < argv.length) {
      out.claimsPath = String(argv[i + 1] || '').trim() || DEFAULT_CLAIMS_PATH;
      i += 1;
    }
  }
  return out;
}

function listOpsFiles(opsDir) {
  try {
    return fs.readdirSync(opsDir, { withFileTypes: true })
      .filter((item) => item.isFile())
      .map((item) => item.name)
      .sort();
  } catch {
    return [];
  }
}

function parseClaimMatrix(claimsPath) {
  try {
    const raw = fs.readFileSync(claimsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    if (!Array.isArray(parsed.claims)) return [];
    return parsed.claims.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  } catch {
    return [];
  }
}

export function evaluateVerifyContourState(input = {}) {
  const opsDir = String(input.opsDir || process.env.VERIFY_CONTOUR_OPS_DIR || DEFAULT_OPS_DIR).trim() || DEFAULT_OPS_DIR;
  const claimsPath = String(
    input.claimsPath || process.env.VERIFY_CONTOUR_CLAIMS_PATH || DEFAULT_CLAIMS_PATH,
  ).trim() || DEFAULT_CLAIMS_PATH;

  const failures = [];
  const files = listOpsFiles(opsDir);

  const orchestratorPath = path.join(opsDir, ORCHESTRATOR_FILE);
  const orchestratorExists = files.includes(ORCHESTRATOR_FILE);
  if (!orchestratorExists) {
    failures.push(`missing_orchestrator:${ORCHESTRATOR_FILE}`);
  }

  const helperExists = files.includes(HELPER_FILE);
  const contourCandidates = files.filter((name) => ORCHESTRATOR_FILE_RE.test(name));
  const secondaryOrchestrators = contourCandidates
    .filter((name) => name !== ORCHESTRATOR_FILE);

  if (secondaryOrchestrators.length > 0) {
    failures.push(`secondary_orchestrators:${secondaryOrchestrators.join(',')}`);
  }

  const claims = parseClaimMatrix(claimsPath);
  const helperHooks = claims
    .map((claim) => String(claim.proofHook || '').trim())
    .filter((hook) => hook.includes(HELPER_FILE));
  if (helperHooks.length > 0) {
    failures.push('helper_used_as_proof_hook');
  }

  const ok = failures.length === 0;
  const state = {
    ok,
    token: TOKEN_NAME,
    [TOKEN_NAME]: ok ? 1 : 0,
    opsDir,
    claimsPath,
    orchestratorPath,
    orchestratorExists: orchestratorExists ? 1 : 0,
    helperExists: helperExists ? 1 : 0,
    contourCandidates,
    secondaryOrchestrators,
    failSignal: ok
      ? null
      : {
        code: FAIL_CODE,
        details: failures,
      },
  };
  return state;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`VERIFY_CONTOUR_ORCHESTRATOR_PATH=${state.orchestratorPath}`);
  console.log(`VERIFY_CONTOUR_ORCHESTRATOR_EXISTS=${state.orchestratorExists}`);
  console.log(`VERIFY_CONTOUR_HELPER_EXISTS=${state.helperExists}`);
  console.log(`VERIFY_CONTOUR_CANDIDATES=${JSON.stringify(state.contourCandidates)}`);
  if (state.failSignal) {
    console.log(`FAIL_REASON=${state.failSignal.code}`);
    console.log(`FAIL_DETAILS=${JSON.stringify(state.failSignal.details)}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateVerifyContourState({
    opsDir: args.opsDir,
    claimsPath: args.claimsPath,
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
