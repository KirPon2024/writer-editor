#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'PROOFHOOK_BRIDGE_VALID_OK';
const FAIL_INVALID = 'E_PROOFHOOK_BRIDGE_INVALID';
const FAIL_SUNSET_EXPIRED = 'E_PROOFHOOK_BRIDGE_SUNSET_EXPIRED';
const DEFAULT_BRIDGE_PATH = 'docs/OPS/BRIDGES/PROOFHOOK_BRIDGE_MAP.json';
const DEFAULT_DECLARATION_PATH = 'docs/OPS/TOKENS/TOKEN_DECLARATION.json';
const ALLOWED_STATUSES = new Set(['ACTIVE_BRIDGE', 'TARGET_ONLY', 'DONE_NATIVE']);
const TOKEN_RE = /^[A-Z0-9_]+$/u;

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

function readJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function uniqueSortedStrings(values) {
  if (!Array.isArray(values)) return [];
  const out = new Set();
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value) continue;
    out.add(value);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function issue(type, details = {}) {
  return {
    type: String(type || '').trim(),
    ...details,
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNullOrNonEmptyString(value) {
  return value === null || isNonEmptyString(value);
}

function isSunsetRequired(status) {
  return status === 'ACTIVE_BRIDGE' || status === 'TARGET_ONLY';
}

function sortIssues(issues) {
  return [...issues].sort((a, b) => {
    const typeA = String(a.type || '');
    const typeB = String(b.type || '');
    if (typeA !== typeB) return typeA.localeCompare(typeB);
    const tokenA = String(a.tokenId || '');
    const tokenB = String(b.tokenId || '');
    if (tokenA !== tokenB) return tokenA.localeCompare(tokenB);
    const fieldA = String(a.field || '');
    const fieldB = String(b.field || '');
    return fieldA.localeCompare(fieldB);
  });
}

function classifyFailCode(issues) {
  const hasExpired = issues.some((row) => row.type === 'SUNSET_EXPIRED');
  return hasExpired ? FAIL_SUNSET_EXPIRED : FAIL_INVALID;
}

function evaluateBridgeMapState(input = {}) {
  const bridgeMapPath = String(
    input.bridgeMapPath || process.env.PROOFHOOK_BRIDGE_MAP_PATH || DEFAULT_BRIDGE_PATH,
  ).trim();
  const declarationPath = String(
    input.declarationPath || process.env.TOKEN_DECLARATION_PATH || DEFAULT_DECLARATION_PATH,
  ).trim();

  const bridgeDoc = readJsonObject(bridgeMapPath);
  const declarationDoc = readJsonObject(declarationPath);
  const issues = [];

  if (!bridgeDoc) {
    issues.push(issue('BRIDGE_MAP_UNREADABLE', { path: bridgeMapPath }));
  }
  if (!declarationDoc) {
    issues.push(issue('TOKEN_DECLARATION_UNREADABLE', { path: declarationPath }));
  }

  const targetTokens = new Set(uniqueSortedStrings(
    declarationDoc && Array.isArray(declarationDoc.targetTokens) ? declarationDoc.targetTokens : [],
  ));

  const schemaVersion = bridgeDoc ? Number(bridgeDoc.schemaVersion || 0) : 0;
  if (schemaVersion !== 1) {
    issues.push(issue('SCHEMA_VERSION_INVALID', {
      expected: 1,
      actual: schemaVersion,
    }));
  }

  const bridges = bridgeDoc && Array.isArray(bridgeDoc.bridges) ? bridgeDoc.bridges : [];
  if (!bridgeDoc || !Array.isArray(bridgeDoc.bridges) || bridges.length === 0) {
    issues.push(issue('BRIDGES_ARRAY_INVALID'));
  }

  const seenTokenIds = new Set();
  const seenOrder = [];
  const nowMs = Date.now();

  for (let i = 0; i < bridges.length; i += 1) {
    const row = bridges[i];
    if (!isObjectRecord(row)) {
      issues.push(issue('BRIDGE_ROW_INVALID', { index: i }));
      continue;
    }

    const tokenId = String(row.tokenId || '').trim();
    const status = String(row.status || '').trim();
    const currentProofHook = row.currentProofHook;
    const targetProofHook = row.targetProofHook;
    const sunsetAtUtc = row.sunsetAtUtc;
    const sunsetCommitMarker = row.sunsetCommitMarker;
    const rationale = row.rationale;
    seenOrder.push(tokenId);

    if (!TOKEN_RE.test(tokenId)) {
      issues.push(issue('TOKEN_ID_INVALID', { index: i, tokenId }));
      continue;
    }
    if (seenTokenIds.has(tokenId)) {
      issues.push(issue('TOKEN_ID_DUPLICATE', { tokenId }));
    }
    seenTokenIds.add(tokenId);

    if (!ALLOWED_STATUSES.has(status)) {
      issues.push(issue('STATUS_INVALID', { tokenId, status }));
    }

    if (!isNullOrNonEmptyString(currentProofHook)) {
      issues.push(issue('CURRENT_PROOFHOOK_INVALID', { tokenId }));
    }
    if (!isNonEmptyString(targetProofHook)) {
      issues.push(issue('TARGET_PROOFHOOK_INVALID', { tokenId }));
    }
    if (!isNonEmptyString(rationale)) {
      issues.push(issue('RATIONALE_MISSING', { tokenId }));
    }

    if (currentProofHook === null && !targetTokens.has(tokenId)) {
      issues.push(issue('CURRENT_NULL_TOKEN_NOT_TARGET', { tokenId }));
    }

    if (isSunsetRequired(status)) {
      if (!isNonEmptyString(sunsetAtUtc)) {
        issues.push(issue('SUNSET_AT_MISSING', { tokenId }));
      }
      if (!isNonEmptyString(sunsetCommitMarker)) {
        issues.push(issue('SUNSET_COMMIT_MARKER_MISSING', { tokenId }));
      }
    }

    if (status === 'ACTIVE_BRIDGE') {
      if (!isNonEmptyString(sunsetAtUtc) || !isNonEmptyString(sunsetCommitMarker)) {
        issues.push(issue('ACTIVE_BRIDGE_SUNSET_REQUIRED', { tokenId }));
      }
    }

    if (isNonEmptyString(sunsetAtUtc)) {
      const parsed = Date.parse(sunsetAtUtc);
      if (!Number.isFinite(parsed)) {
        issues.push(issue('SUNSET_AT_INVALID', { tokenId, sunsetAtUtc }));
      } else if (status !== 'DONE_NATIVE' && parsed < nowMs) {
        issues.push(issue('SUNSET_EXPIRED', { tokenId, sunsetAtUtc }));
      }
    }

    if (status === 'DONE_NATIVE') {
      if (!(sunsetAtUtc === null || sunsetAtUtc === undefined || isNonEmptyString(sunsetAtUtc))) {
        issues.push(issue('SUNSET_AT_INVALID', { tokenId, sunsetAtUtc }));
      }
      if (!(sunsetCommitMarker === null || sunsetCommitMarker === undefined || isNonEmptyString(sunsetCommitMarker))) {
        issues.push(issue('SUNSET_COMMIT_MARKER_INVALID', { tokenId }));
      }
    }
  }

  const sortedTokenOrder = [...seenOrder].sort((a, b) => a.localeCompare(b));
  if (seenOrder.length > 0) {
    const orderOk = seenOrder.length === sortedTokenOrder.length
      && seenOrder.every((token, idx) => token === sortedTokenOrder[idx]);
    if (!orderOk) {
      issues.push(issue('TOKEN_ORDER_NOT_STABLE'));
    }
  }

  const sortedIssues = sortIssues(issues);
  const ok = sortedIssues.length === 0;
  const failSignalCode = ok ? '' : classifyFailCode(sortedIssues);

  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    failSignalCode,
    bridgeMapPath,
    declarationPath,
    schemaVersion,
    bridgeCount: bridges.length,
    issues: sortedIssues,
    failSignal: ok
      ? null
      : {
        code: failSignalCode,
        issues: sortedIssues,
      },
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    bridgeMapPath: '',
    declarationPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--bridge-map-path' && i + 1 < argv.length) {
      out.bridgeMapPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--declaration-path' && i + 1 < argv.length) {
      out.declarationPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`PROOFHOOK_BRIDGE_MAP_PATH=${state.bridgeMapPath}`);
  console.log(`PROOFHOOK_BRIDGE_SCHEMA_VERSION=${state.schemaVersion}`);
  console.log(`PROOFHOOK_BRIDGE_COUNT=${state.bridgeCount}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.failSignalCode}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateBridgeMapState({
    bridgeMapPath: args.bridgeMapPath || undefined,
    declarationPath: args.declarationPath || undefined,
  });
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

export {
  evaluateBridgeMapState,
};
