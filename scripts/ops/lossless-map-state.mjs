#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateTokenDeclarationState } from './token-declaration-state.mjs';
import { evaluateCriticalClaimMatrixState } from './critical-claim-matrix-state.mjs';

const TOKEN_NAME = 'LOSSLESS_MAP_OK';
const FAIL_CODE_DRIFT = 'E_LOSSLESS_MAP_DRIFT';
const FAIL_CODE_MISSING_TOKEN = 'E_LOSSLESS_MAP_MISSING_TOKEN';
const FAIL_CODE_MISSING_PROOFHOOK = 'E_LOSSLESS_MAP_MISSING_PROOFHOOK';
const DEFAULT_TOKEN_DECLARATION_PATH = 'docs/OPS/TOKENS/TOKEN_DECLARATION.json';
const DEFAULT_CLAIMS_PATH = 'docs/OPS/CLAIMS/CRITICAL_CLAIM_MATRIX.json';
const DEFAULT_REQUIRED_SET_PATH = 'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json';
const DEFAULT_LOSSLESS_MAP_PATH = 'docs/OPS/STATUS/LOSSLESS_MAP_V3_4.json';

const ALLOWED_LOSSLESS_MAP_VERSION = 'v3.4';
const PROOF_HOOK_ALLOWED_CMD = new Set(['node']);

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

function normalizeRelativePath(value) {
  const normalized = String(value || '').trim().replaceAll('\\', '/');
  if (!normalized || path.isAbsolute(normalized)) return '';
  if (normalized.split('/').some((segment) => segment.length === 0 || segment === '..')) return '';
  return normalized;
}

function pathExistsAsFile(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return false;
  const rootAbs = path.resolve(process.cwd());
  const fileAbs = path.resolve(rootAbs, normalized);
  const rel = path.relative(rootAbs, fileAbs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  try {
    return fs.existsSync(fileAbs) && fs.statSync(fileAbs).isFile();
  } catch {
    return false;
  }
}

function parseProofHookScriptPath(proofHook) {
  const chunks = String(proofHook || '').trim().split(/\s+/u).filter(Boolean);
  if (chunks.length === 0) return '';
  let idx = 0;
  while (idx < chunks.length && /^[A-Z_][A-Z0-9_]*=.*/u.test(chunks[idx])) idx += 1;
  const cmd = String(chunks[idx] || '').trim();
  if (!PROOF_HOOK_ALLOWED_CMD.has(cmd)) return '';
  return normalizeRelativePath(chunks[idx + 1] || '');
}

function deriveFailureCode(issues) {
  if (issues.some((item) => String(item.code || '').includes('MISSING_PROOFHOOK'))) {
    return FAIL_CODE_MISSING_PROOFHOOK;
  }
  if (issues.some((item) => String(item.code || '').includes('MISSING_TOKEN'))) {
    return FAIL_CODE_MISSING_TOKEN;
  }
  return FAIL_CODE_DRIFT;
}

function uniqueSortedValuesFromSet(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function collectLosslessMapStatusIssues({
  mapDoc,
  mapPath,
  releaseRequired,
  claimsByToken,
}) {
  const issues = [];

  if (!isObjectRecord(mapDoc)) {
    issues.push(toIssue('LOSSLESS_MAP_STATUS_UNREADABLE', { path: mapPath }));
    return { issues, partASectionCount: 0, annexBindingCount: 0 };
  }

  const schemaVersion = Number(mapDoc.schemaVersion);
  if (schemaVersion !== 1) {
    issues.push(toIssue('LOSSLESS_MAP_STATUS_SCHEMA_INVALID', {
      path: mapPath,
      actual: schemaVersion,
      expected: 1,
    }));
  }

  const version = String(mapDoc.version || '').trim();
  if (version !== ALLOWED_LOSSLESS_MAP_VERSION) {
    issues.push(toIssue('LOSSLESS_MAP_STATUS_VERSION_INVALID', {
      path: mapPath,
      actual: version || '<empty>',
      expected: ALLOWED_LOSSLESS_MAP_VERSION,
    }));
  }

  const partASectionsRaw = Array.isArray(mapDoc.partASections) ? mapDoc.partASections : [];
  const annexBindingsRaw = Array.isArray(mapDoc.annexBindings) ? mapDoc.annexBindings : [];
  if (partASectionsRaw.length === 0) {
    issues.push(toIssue('LOSSLESS_MAP_STATUS_PARTA_EMPTY', { path: mapPath }));
  }
  if (annexBindingsRaw.length === 0) {
    issues.push(toIssue('LOSSLESS_MAP_STATUS_ANNEX_EMPTY', { path: mapPath }));
  }

  const sectionMap = new Map();
  const partATokens = new Set();
  for (let index = 0; index < partASectionsRaw.length; index += 1) {
    const section = partASectionsRaw[index];
    if (!isObjectRecord(section)) {
      issues.push(toIssue('LOSSLESS_MAP_PARTA_SECTION_INVALID', { index }));
      continue;
    }
    const sectionId = String(section.sectionId || '').trim();
    if (!sectionId) {
      issues.push(toIssue('LOSSLESS_MAP_PARTA_SECTION_ID_MISSING', { index }));
      continue;
    }
    if (sectionMap.has(sectionId)) {
      issues.push(toIssue('LOSSLESS_MAP_PARTA_SECTION_DUPLICATE', { sectionId }));
      continue;
    }
    const tokens = uniqueSortedStrings(section.tokens);
    const proofHooks = uniqueSortedStrings(section.proofHooks);
    const registryFiles = uniqueSortedStrings(section.registryFiles);

    if (tokens.length === 0) {
      issues.push(toIssue('LOSSLESS_MAP_PARTA_SECTION_TOKENS_EMPTY', { sectionId }));
    }
    if (proofHooks.length === 0) {
      issues.push(toIssue('LOSSLESS_MAP_PARTA_SECTION_PROOFHOOKS_EMPTY', { sectionId }));
    }
    if (registryFiles.length === 0) {
      issues.push(toIssue('LOSSLESS_MAP_PARTA_SECTION_REGISTRY_EMPTY', { sectionId }));
    }

    for (const token of tokens) partATokens.add(token);

    const proofHookSet = new Set();
    for (const proofHook of proofHooks) {
      const scriptPath = parseProofHookScriptPath(proofHook);
      if (!scriptPath || !pathExistsAsFile(scriptPath)) {
        issues.push(toIssue('LOSSLESS_MAP_PARTA_MISSING_PROOFHOOK', {
          sectionId,
          proofHook,
          scriptPath: scriptPath || '<invalid>',
        }));
      } else {
        proofHookSet.add(proofHook);
      }
    }

    const registrySet = new Set();
    for (const registryFile of registryFiles) {
      if (!pathExistsAsFile(registryFile)) {
        issues.push(toIssue('LOSSLESS_MAP_PARTA_REGISTRY_MISSING', {
          sectionId,
          registryFile,
        }));
      } else {
        registrySet.add(registryFile);
      }
    }

    sectionMap.set(sectionId, {
      sectionId,
      tokens: new Set(tokens),
      proofHooks: proofHookSet,
      registryFiles: registrySet,
    });
  }

  const releaseSet = new Set(releaseRequired);
  const bindingsByToken = new Map();
  const sectionBindings = new Map();
  const annexTokens = new Set();

  for (let index = 0; index < annexBindingsRaw.length; index += 1) {
    const binding = annexBindingsRaw[index];
    if (!isObjectRecord(binding)) {
      issues.push(toIssue('LOSSLESS_MAP_ANNEX_BINDING_INVALID', { index }));
      continue;
    }
    const token = String(binding.token || '').trim();
    const sectionId = String(binding.sectionId || '').trim();
    const proofHook = String(binding.proofHook || '').trim();
    const registryFiles = uniqueSortedStrings(binding.registryFiles);

    if (!token) {
      issues.push(toIssue('LOSSLESS_MAP_ANNEX_BINDING_TOKEN_MISSING', { index }));
      continue;
    }
    annexTokens.add(token);
    if (bindingsByToken.has(token)) {
      issues.push(toIssue('LOSSLESS_MAP_ANNEX_BINDING_DUPLICATE_TOKEN', { token }));
      continue;
    }
    bindingsByToken.set(token, { sectionId, proofHook, registryFiles });

    if (!sectionId || !sectionMap.has(sectionId)) {
      issues.push(toIssue('LOSSLESS_MAP_ANNEX_ORPHAN_SECTION', { token, sectionId }));
    } else {
      const sectionState = sectionBindings.get(sectionId) || new Set();
      sectionState.add(token);
      sectionBindings.set(sectionId, sectionState);
      const section = sectionMap.get(sectionId);
      if (!section.tokens.has(token)) {
        issues.push(toIssue('LOSSLESS_MAP_ANNEX_TOKEN_NOT_IN_SECTION', { token, sectionId }));
      }
      if (!section.proofHooks.has(proofHook)) {
        issues.push(toIssue('LOSSLESS_MAP_ANNEX_PROOFHOOK_NOT_IN_SECTION', {
          token,
          sectionId,
          proofHook,
        }));
      }
      for (const registryFile of registryFiles) {
        if (!section.registryFiles.has(registryFile)) {
          issues.push(toIssue('LOSSLESS_MAP_ANNEX_REGISTRY_NOT_IN_SECTION', {
            token,
            sectionId,
            registryFile,
          }));
        }
      }
    }

    if (!releaseSet.has(token)) {
      issues.push(toIssue('LOSSLESS_MAP_ANNEX_TOKEN_NOT_RELEASE', { token }));
    }

    if (registryFiles.length === 0) {
      issues.push(toIssue('LOSSLESS_MAP_ANNEX_REGISTRY_EMPTY', { token }));
    }
    for (const registryFile of registryFiles) {
      if (!pathExistsAsFile(registryFile)) {
        issues.push(toIssue('LOSSLESS_MAP_ANNEX_REGISTRY_MISSING', { token, registryFile }));
      }
    }

    const scriptPath = parseProofHookScriptPath(proofHook);
    if (!scriptPath || !pathExistsAsFile(scriptPath)) {
      issues.push(toIssue('LOSSLESS_MAP_ANNEX_MISSING_PROOFHOOK', {
        token,
        proofHook,
        scriptPath: scriptPath || '<invalid>',
      }));
    }

    const claimList = claimsByToken.get(token) || [];
    if (claimList.length > 0) {
      const expectedClaim = claimList.find((claim) => claim.blocking === true) || claimList[0];
      const expectedProofHook = String(expectedClaim.proofHook || '').trim();
      if (expectedProofHook && expectedProofHook !== proofHook) {
        issues.push(toIssue('LOSSLESS_MAP_ANNEX_PROOFHOOK_CLAIM_DRIFT', {
          token,
          expected: expectedProofHook,
          actual: proofHook,
        }));
      }
    }
  }

  for (const token of releaseRequired) {
    if (!bindingsByToken.has(token)) {
      issues.push(toIssue('LOSSLESS_MAP_MISSING_TOKEN_RELEASE_BINDING', { token }));
    }
    if (!partATokens.has(token)) {
      issues.push(toIssue('LOSSLESS_MAP_MISSING_TOKEN_PARTA_BINDING', { token }));
    }
  }

  for (const token of annexTokens) {
    if (!releaseSet.has(token)) {
      issues.push(toIssue('LOSSLESS_MAP_ANNEX_TOKEN_ORPHAN', { token }));
    }
  }

  for (const token of partATokens) {
    if (!releaseSet.has(token)) {
      issues.push(toIssue('LOSSLESS_MAP_PARTA_TOKEN_ORPHAN', { token }));
    }
    if (!bindingsByToken.has(token)) {
      issues.push(toIssue('LOSSLESS_MAP_PARTA_TOKEN_NOT_IN_ANNEX', { token }));
    }
  }

  for (const [sectionId, section] of sectionMap.entries()) {
    const actualTokens = sectionBindings.get(sectionId) || new Set();
    const expectedTokens = uniqueSortedValuesFromSet(section.tokens);
    const observedTokens = uniqueSortedValuesFromSet(actualTokens);
    if (expectedTokens.length !== observedTokens.length
      || expectedTokens.some((token, index) => token !== observedTokens[index])) {
      issues.push(toIssue('LOSSLESS_MAP_PARTA_ANNEX_TOKEN_DRIFT', {
        sectionId,
        expectedTokens,
        observedTokens,
      }));
    }
    if (actualTokens.size === 0) {
      issues.push(toIssue('LOSSLESS_MAP_PARTA_SECTION_ORPHAN', { sectionId }));
    }
  }

  return {
    issues,
    partASectionCount: sectionMap.size,
    annexBindingCount: bindingsByToken.size,
  };
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
  const losslessMapPath = String(
    input.losslessMapPath || process.env.LOSSLESS_MAP_STATUS_PATH || DEFAULT_LOSSLESS_MAP_PATH,
  ).trim();

  const defaultProfileInputs = declarationPath === DEFAULT_TOKEN_DECLARATION_PATH
    && claimsPath === DEFAULT_CLAIMS_PATH
    && requiredSetPath === DEFAULT_REQUIRED_SET_PATH;
  const enforceMap = input.enforceMap === true
    || process.env.LOSSLESS_MAP_ENFORCE === '1'
    || defaultProfileInputs
    || Boolean(input.losslessMapPath);

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

  let partASectionCount = 0;
  let annexBindingCount = 0;
  if (enforceMap) {
    const mapDoc = readJsonObject(losslessMapPath);
    const mapState = collectLosslessMapStatusIssues({
      mapDoc,
      mapPath: losslessMapPath,
      releaseRequired,
      claimsByToken,
    });
    partASectionCount = mapState.partASectionCount;
    annexBindingCount = mapState.annexBindingCount;
    issues.push(...mapState.issues);
  }

  const sortedIssues = sortIssues(issues);
  const failures = uniqueSortedStrings(sortedIssues.map((item) => item.code));
  const ok = failures.length === 0;
  const code = ok ? '' : deriveFailureCode(sortedIssues);

  return {
    ok,
    tokens: {
      [TOKEN_NAME]: ok ? 1 : 0,
    },
    code,
    releaseRequired,
    coreRequired,
    releaseBlockingTokens: uniqueSortedStrings(releaseBlockingTokens),
    losslessMapPath,
    mapEnforced: enforceMap ? 1 : 0,
    partASectionCount,
    annexBindingCount,
    failures,
    issues: sortedIssues,
    failSignal: ok
      ? null
      : {
        code,
        details: {
          failures,
          issues: sortedIssues,
          losslessMapPath,
          partASectionCount,
          annexBindingCount,
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
    losslessMapPath: '',
    enforceMap: false,
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
    if (arg === '--lossless-map-path' && i + 1 < argv.length) {
      out.losslessMapPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--enforce-map') out.enforceMap = true;
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state.tokens[TOKEN_NAME]}`);
  console.log(`LOSSLESS_MAP_STATUS_PATH=${state.losslessMapPath}`);
  console.log(`LOSSLESS_MAP_STATUS_ENFORCED=${state.mapEnforced}`);
  console.log(`LOSSLESS_MAP_STATUS_PARTA_SECTIONS=${state.partASectionCount}`);
  console.log(`LOSSLESS_MAP_STATUS_ANNEX_BINDINGS=${state.annexBindingCount}`);
  console.log(`LOSSLESS_MAP_RELEASE_BLOCKING_TOKENS=${JSON.stringify(state.releaseBlockingTokens)}`);
  console.log(`LOSSLESS_MAP_FAILURES=${JSON.stringify(state.failures)}`);
  if (state.code) {
    console.log(`FAIL_REASON=${state.code}`);
  }
  if (state.failSignal) {
    console.log(`FAIL_DETAILS=${JSON.stringify(state.failSignal.details)}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateLosslessMapState({
    declarationPath: args.declarationPath || undefined,
    claimsPath: args.claimsPath || undefined,
    requiredSetPath: args.requiredSetPath || undefined,
    losslessMapPath: args.losslessMapPath || undefined,
    enforceMap: args.enforceMap,
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
