#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateTokenDeclarationState } from './token-declaration-state.mjs';
import { evaluateCriticalClaimMatrixState } from './critical-claim-matrix-state.mjs';

const TOKEN_NAME = 'LOSSLESS_MAP_OK';
const FAIL_CODE = 'E_LOSSLESS_MAP_INCOMPLETE';
const DEFAULT_TOKEN_DECLARATION_PATH = 'docs/OPS/TOKENS/TOKEN_DECLARATION.json';
const DEFAULT_CLAIMS_PATH = 'docs/OPS/CLAIMS/CRITICAL_CLAIM_MATRIX.json';
const DEFAULT_REQUIRED_SET_PATH = 'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json';

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueSortedStrings(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const item = String(raw || '').trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
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

function duplicateStrings(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const dupes = new Set();
  for (const raw of values) {
    const item = String(raw || '').trim();
    if (!item) continue;
    if (seen.has(item)) dupes.add(item);
    seen.add(item);
  }
  return [...dupes].sort();
}

function collectDeclarationTokens(doc) {
  if (!isObjectRecord(doc)) return [];
  const existing = uniqueSortedStrings(doc.existingTokens);
  const target = uniqueSortedStrings(doc.targetTokens);
  return uniqueSortedStrings([...existing, ...target]);
}

function collectClaims(doc) {
  if (!isObjectRecord(doc) || !Array.isArray(doc.claims)) return [];
  return doc.claims.filter((item) => isObjectRecord(item));
}

function toIssue(code, details = {}) {
  return {
    code: String(code || '').trim(),
    ...details,
  };
}

function sortIssues(issues) {
  return [...issues].sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    const tokenA = String(a.token || '');
    const tokenB = String(b.token || '');
    if (tokenA !== tokenB) return tokenA.localeCompare(tokenB);
    const claimA = String(a.claimId || '');
    const claimB = String(b.claimId || '');
    return claimA.localeCompare(claimB);
  });
}

export function evaluateLosslessMapState(input = {}) {
  const declarationPath = String(
    input.declarationPath || process.env.TOKEN_DECLARATION_PATH || DEFAULT_TOKEN_DECLARATION_PATH,
  ).trim();
  const claimsPath = String(
    input.claimsPath || process.env.CRITICAL_CLAIM_MATRIX_PATH || DEFAULT_CLAIMS_PATH,
  ).trim();
  const requiredSetPath = String(
    input.requiredSetPath || process.env.REQUIRED_TOKEN_SET_PATH || DEFAULT_REQUIRED_SET_PATH,
  ).trim();

  const issues = [];

  const tokenDeclaration = readJsonObject(declarationPath);
  const claimMatrix = readJsonObject(claimsPath);
  const requiredSet = readJsonObject(requiredSetPath);

  if (!tokenDeclaration) issues.push(toIssue('TOKEN_DECLARATION_UNREADABLE', { path: declarationPath }));
  if (!claimMatrix) issues.push(toIssue('CRITICAL_CLAIM_MATRIX_UNREADABLE', { path: claimsPath }));
  if (!requiredSet) issues.push(toIssue('REQUIRED_TOKEN_SET_UNREADABLE', { path: requiredSetPath }));

  const declarationState = evaluateTokenDeclarationState({
    declarationPath,
    skipEmissionCheck: true,
  });
  if (declarationState.ok !== 1) {
    issues.push(toIssue('TOKEN_DECLARATION_INVALID', {
      path: declarationPath,
      reason: String(declarationState.failReason || 'UNKNOWN'),
    }));
  }

  const matrixState = evaluateCriticalClaimMatrixState({ matrixPath: claimsPath });
  if (matrixState.ok !== 1) {
    issues.push(toIssue('CRITICAL_CLAIM_MATRIX_INVALID', {
      path: claimsPath,
      reason: String(matrixState.failReason || 'UNKNOWN'),
    }));
  }

  const declarationTokens = collectDeclarationTokens(tokenDeclaration || {});
  const declarationTokenSet = new Set(declarationTokens);
  const claims = collectClaims(claimMatrix || {});
  const releaseRaw = requiredSet && requiredSet.requiredSets ? requiredSet.requiredSets.release : [];
  const coreRaw = requiredSet && requiredSet.requiredSets ? requiredSet.requiredSets.core : [];

  if (!Array.isArray(releaseRaw)) {
    issues.push(toIssue('REQUIRED_SET_RELEASE_INVALID', { path: requiredSetPath }));
  }
  if (!Array.isArray(coreRaw)) {
    issues.push(toIssue('REQUIRED_SET_CORE_INVALID', { path: requiredSetPath }));
  }

  const releaseDupes = duplicateStrings(releaseRaw);
  for (const token of releaseDupes) {
    issues.push(toIssue('REQUIRED_SET_RELEASE_DUPLICATE', { token }));
  }
  const coreDupes = duplicateStrings(coreRaw);
  for (const token of coreDupes) {
    issues.push(toIssue('REQUIRED_SET_CORE_DUPLICATE', { token }));
  }

  const releaseRequired = uniqueSortedStrings(releaseRaw);
  const coreRequired = uniqueSortedStrings(coreRaw);
  const releaseSet = new Set(releaseRequired);
  const coreSet = new Set(coreRequired);

  for (const token of releaseRequired) {
    if (!declarationTokenSet.has(token)) {
      issues.push(toIssue('RELEASE_TOKEN_MISSING_IN_DECLARATION', { token }));
    }
  }

  const claimsByToken = new Map();
  for (const claim of claims) {
    const requiredToken = String(claim.requiredToken || '').trim();
    if (!requiredToken) continue;
    const list = claimsByToken.get(requiredToken) || [];
    list.push(claim);
    claimsByToken.set(requiredToken, list);
  }

  const releaseBlockingTokens = [];
  for (const token of releaseRequired) {
    const claimList = claimsByToken.get(token) || [];
    const hasBlockingClaim = claimList.some((claim) => claim.blocking === true);
    if (!hasBlockingClaim) continue;
    releaseBlockingTokens.push(token);
    if (!declarationTokenSet.has(token)) {
      issues.push(toIssue('RELEASE_BLOCKING_TOKEN_MISSING_IN_DECLARATION', { token }));
    }
  }

  if (!releaseSet.has(TOKEN_NAME)) {
    issues.push(toIssue('LOSSLESS_TOKEN_MISSING_IN_RELEASE_REQUIRED_SET', { token: TOKEN_NAME }));
  }
  if (coreSet.has(TOKEN_NAME)) {
    issues.push(toIssue('LOSSLESS_TOKEN_PRESENT_IN_CORE_REQUIRED_SET', { token: TOKEN_NAME }));
  }

  const losslessClaims = claimsByToken.get(TOKEN_NAME) || [];
  if (losslessClaims.length === 0) {
    issues.push(toIssue('LOSSLESS_CLAIM_MISSING', { token: TOKEN_NAME }));
  } else {
    const releaseBlockingLossless = losslessClaims.find((claim) => {
      return claim.blocking === true && String(claim.gateTier || '').trim() === 'release';
    });
    if (!releaseBlockingLossless) {
      issues.push(toIssue('LOSSLESS_CLAIM_NOT_RELEASE_BLOCKING', { token: TOKEN_NAME }));
    } else {
      const proofHook = String(releaseBlockingLossless.proofHook || '').trim();
      if (proofHook !== 'node scripts/ops/lossless-map-state.mjs --json') {
        issues.push(toIssue('LOSSLESS_CLAIM_PROOFHOOK_MISMATCH', {
          token: TOKEN_NAME,
          expected: 'node scripts/ops/lossless-map-state.mjs --json',
          actual: proofHook,
        }));
      }
    }
  }

  const sortedIssues = sortIssues(issues);
  const failures = uniqueSortedStrings(sortedIssues.map((item) => item.code));
  const ok = failures.length === 0;

  return {
    ok,
    tokens: {
      [TOKEN_NAME]: ok ? 1 : 0,
    },
    releaseRequired,
    coreRequired,
    releaseBlockingTokens: uniqueSortedStrings(releaseBlockingTokens),
    failures,
    issues: sortedIssues,
    failSignal: ok
      ? null
      : {
        code: FAIL_CODE,
        details: {
          failures,
          issues: sortedIssues,
        },
      },
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    declarationPath: '',
    claimsPath: '',
    requiredSetPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--declaration-path' && i + 1 < argv.length) {
      out.declarationPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--claims-path' && i + 1 < argv.length) {
      out.claimsPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--required-set-path' && i + 1 < argv.length) {
      out.requiredSetPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state.tokens[TOKEN_NAME]}`);
  console.log(`LOSSLESS_MAP_RELEASE_BLOCKING_TOKENS=${JSON.stringify(state.releaseBlockingTokens)}`);
  console.log(`LOSSLESS_MAP_FAILURES=${JSON.stringify(state.failures)}`);
  if (state.failSignal) {
    console.log(`FAIL_REASON=${state.failSignal.code}`);
    console.log(`FAIL_DETAILS=${JSON.stringify(state.failSignal.details)}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateLosslessMapState({
    declarationPath: args.declarationPath || undefined,
    claimsPath: args.claimsPath || undefined,
    requiredSetPath: args.requiredSetPath || undefined,
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
