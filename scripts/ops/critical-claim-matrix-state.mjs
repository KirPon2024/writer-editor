#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MATRIX_PATH = 'docs/OPS/CLAIMS/CRITICAL_CLAIM_MATRIX.json';
const ALLOWED_NAMESPACE_PREFIXES = [
  'CORE_SOT_',
  'COMMAND_SURFACE_',
  'CAPABILITY_',
  'RECOVERY_',
  'RECOVERY_IO_',
  'HOTPATH_',
  'PERF_',
  'PLATFORM_COVERAGE_',
  'DERIVED_',
  'GOVERNANCE_',
  'ADAPTERS_',
  'COLLAB_',
  'COMMENTS_',
  'HISTORY_',
  'SIMULATION_',
  'XPLAT_',
  'XPLAT_CONTRACT_',
  'DRIFT_',
  'SCR_',
  'TOKEN_DECLARATION_',
  'CRITICAL_CLAIM_MATRIX_',
  'HEAD_STRICT_',
  'DEBT_TTL_',
];

function parseJson(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseProofCommand(proofHook) {
  const chunks = String(proofHook || '').trim().split(/\s+/u).filter(Boolean);
  if (chunks.length === 0) return '';
  let idx = 0;
  while (idx < chunks.length && /^[A-Z_][A-Z0-9_]*=.*/u.test(chunks[idx])) idx += 1;
  return idx < chunks.length ? chunks[idx] : '';
}

function validateProofHook(proofHook) {
  const hook = String(proofHook || '').trim();
  if (!hook) return { ok: 0, reason: 'proofHook_missing' };
  if (/\bmanual\b/iu.test(hook)) return { ok: 0, reason: 'proofHook_manual' };
  const cmd = parseProofCommand(hook);
  if (!cmd) return { ok: 0, reason: 'proofHook_command_missing' };
  if (cmd !== 'node' && cmd !== 'npm' && cmd !== 'git') {
    return { ok: 0, reason: 'proofHook_command_not_allowed' };
  }
  return { ok: 1, reason: '' };
}

function tokenNamespaceOk(token) {
  const value = String(token || '').trim();
  if (!value) return false;
  return ALLOWED_NAMESPACE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function evaluateCriticalClaimMatrixState(input = {}) {
  const matrixPath = input.matrixPath || process.env.CRITICAL_CLAIM_MATRIX_PATH || DEFAULT_MATRIX_PATH;
  if (!fs.existsSync(matrixPath)) {
    return {
      path: matrixPath,
      present: 0,
      schemaVersion: 0,
      claimsCount: 0,
      ok: 0,
      failReason: 'CRITICAL_CLAIM_MATRIX_MISSING',
    };
  }

  const doc = parseJson(matrixPath);
  if (!doc) {
    return {
      path: matrixPath,
      present: 1,
      schemaVersion: 0,
      claimsCount: 0,
      ok: 0,
      failReason: 'CRITICAL_CLAIM_MATRIX_INVALID_JSON',
    };
  }

  if (!Number.isInteger(doc.schemaVersion) || doc.schemaVersion < 1) {
    return {
      path: matrixPath,
      present: 1,
      schemaVersion: Number(doc.schemaVersion || 0),
      claimsCount: 0,
      ok: 0,
      failReason: 'CRITICAL_CLAIM_MATRIX_SCHEMA_INVALID',
    };
  }

  if (!Array.isArray(doc.claims) || doc.claims.length === 0) {
    return {
      path: matrixPath,
      present: 1,
      schemaVersion: doc.schemaVersion,
      claimsCount: 0,
      ok: 0,
      failReason: 'CRITICAL_CLAIM_MATRIX_CLAIMS_EMPTY',
    };
  }

  const ids = new Set();
  for (let i = 0; i < doc.claims.length; i += 1) {
    const item = doc.claims[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return {
        path: matrixPath,
        present: 1,
        schemaVersion: doc.schemaVersion,
        claimsCount: doc.claims.length,
        ok: 0,
        failReason: `CRITICAL_CLAIM_MATRIX_ITEM_${i}_INVALID`,
      };
    }

    const claimId = String(item.claimId || '').trim();
    const requiredToken = String(item.requiredToken || '').trim();
    const failSignal = String(item.failSignal || '').trim();
    const sourceBinding = String(item.sourceBinding || '').trim();
    const blocking = item.blocking === true || item.blocking === false;

    if (!claimId || ids.has(claimId)) {
      return {
        path: matrixPath,
        present: 1,
        schemaVersion: doc.schemaVersion,
        claimsCount: doc.claims.length,
        ok: 0,
        failReason: `CRITICAL_CLAIM_MATRIX_CLAIM_ID_INVALID_${i}`,
      };
    }
    ids.add(claimId);

    if (!tokenNamespaceOk(requiredToken)) {
      return {
        path: matrixPath,
        present: 1,
        schemaVersion: doc.schemaVersion,
        claimsCount: doc.claims.length,
        ok: 0,
        failReason: `CRITICAL_CLAIM_MATRIX_TOKEN_NAMESPACE_INVALID_${claimId}`,
      };
    }

    if (!failSignal || !/^E_[A-Z0-9_]+$/u.test(failSignal)) {
      return {
        path: matrixPath,
        present: 1,
        schemaVersion: doc.schemaVersion,
        claimsCount: doc.claims.length,
        ok: 0,
        failReason: `CRITICAL_CLAIM_MATRIX_FAIL_SIGNAL_INVALID_${claimId}`,
      };
    }

    if (!blocking) {
      return {
        path: matrixPath,
        present: 1,
        schemaVersion: doc.schemaVersion,
        claimsCount: doc.claims.length,
        ok: 0,
        failReason: `CRITICAL_CLAIM_MATRIX_BLOCKING_INVALID_${claimId}`,
      };
    }

    const hookValidation = validateProofHook(item.proofHook);
    if (hookValidation.ok !== 1) {
      return {
        path: matrixPath,
        present: 1,
        schemaVersion: doc.schemaVersion,
        claimsCount: doc.claims.length,
        ok: 0,
        failReason: `CRITICAL_CLAIM_MATRIX_${hookValidation.reason}_${claimId}`,
      };
    }

    if (!sourceBinding) {
      return {
        path: matrixPath,
        present: 1,
        schemaVersion: doc.schemaVersion,
        claimsCount: doc.claims.length,
        ok: 0,
        failReason: `CRITICAL_CLAIM_MATRIX_SOURCE_BINDING_INVALID_${claimId}`,
      };
    }
  }

  return {
    path: matrixPath,
    present: 1,
    schemaVersion: doc.schemaVersion,
    claimsCount: doc.claims.length,
    ok: 1,
    failReason: '',
  };
}

function parseArgs(argv) {
  const out = { matrixPath: '' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--matrix-path') {
      out.matrixPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printTokens(state) {
  console.log(`CRITICAL_CLAIM_MATRIX_PATH=${state.path}`);
  console.log(`CRITICAL_CLAIM_MATRIX_PRESENT=${state.present}`);
  console.log(`CRITICAL_CLAIM_MATRIX_SCHEMA_VERSION=${state.schemaVersion}`);
  console.log(`CRITICAL_CLAIM_MATRIX_CLAIMS_COUNT=${state.claimsCount}`);
  console.log(`CRITICAL_CLAIM_MATRIX_OK=${state.ok}`);
  if (state.failReason) console.log(`FAIL_REASON=${state.failReason}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateCriticalClaimMatrixState({ matrixPath: args.matrixPath });
  printTokens(state);
  process.exit(state.ok === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
