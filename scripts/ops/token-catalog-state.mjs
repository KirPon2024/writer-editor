#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'TOKEN_CATALOG_VALID_OK';
const FAIL_CODE = 'E_TOKEN_CATALOG_INVALID';
const DEFAULT_CATALOG_PATH = 'docs/OPS/TOKENS/TOKEN_CATALOG.json';
const DEFAULT_REQUIRED_SET_PATH = 'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json';

const TOKEN_ID_RE = /^[A-Z0-9_]+$/u;
const NAMESPACE_RE = /^[A-Z][A-Z0-9_]*$/u;
const FAIL_SIGNAL_RE = /^E_[A-Z0-9_]+$/u;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/u;
const PROMOTION_STATES = new Set(['existing', 'target']);
const GATE_TIERS = new Set(['core', 'release', 'conditional']);
const SOURCE_BINDINGS = new Set(['doctor', 'contract_test', 'ops_script', 'truth_table', 'ops_summary']);

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

function buildFailure(code, details = {}) {
  return {
    code: String(code || '').trim(),
    ...details,
  };
}

function sortFailures(failures) {
  return [...failures].sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    const tokenA = String(a.tokenId || a.token || '');
    const tokenB = String(b.tokenId || b.token || '');
    return tokenA.localeCompare(tokenB);
  });
}

function validateCatalogDoc(doc) {
  const failures = [];
  if (!doc) {
    failures.push(buildFailure('CATALOG_UNREADABLE'));
    return {
      failures,
      tokens: [],
    };
  }

  if (Number(doc.schemaVersion) !== 1) {
    failures.push(buildFailure('CATALOG_SCHEMA_VERSION_INVALID', {
      actual: Number(doc.schemaVersion || 0),
      expected: 1,
    }));
  }

  const tokens = Array.isArray(doc.tokens) ? doc.tokens : [];
  if (!Array.isArray(doc.tokens) || tokens.length === 0) {
    failures.push(buildFailure('CATALOG_TOKENS_INVALID'));
    return {
      failures,
      tokens: [],
    };
  }

  const tokenIds = [];
  const seenIds = new Set();
  for (let i = 0; i < tokens.length; i += 1) {
    const row = tokens[i];
    if (!isObjectRecord(row)) {
      failures.push(buildFailure('CATALOG_TOKEN_ROW_INVALID', { index: i }));
      continue;
    }

    const tokenId = String(row.tokenId || '').trim();
    const promotionState = String(row.promotionState || '').trim();
    const gateTier = String(row.gateTier || '').trim();
    const proofHook = String(row.proofHook || '').trim();
    const sourceBinding = String(row.sourceBinding || '').trim();
    const failSignalCode = String(row.failSignalCode || '').trim();
    const namespace = String(row.namespace || '').trim();
    const requiredWhen = row.requiredWhen;

    if (!TOKEN_ID_RE.test(tokenId)) {
      failures.push(buildFailure('CATALOG_TOKEN_ID_INVALID', { index: i, tokenId }));
      continue;
    }
    tokenIds.push(tokenId);

    if (seenIds.has(tokenId)) {
      failures.push(buildFailure('CATALOG_TOKEN_ID_DUPLICATE', { tokenId }));
    }
    seenIds.add(tokenId);

    if (!PROMOTION_STATES.has(promotionState)) {
      failures.push(buildFailure('CATALOG_PROMOTION_STATE_INVALID', { tokenId, promotionState }));
    }
    if (!GATE_TIERS.has(gateTier)) {
      failures.push(buildFailure('CATALOG_GATE_TIER_INVALID', { tokenId, gateTier }));
    }
    if (!(requiredWhen === null || (typeof requiredWhen === 'string' && requiredWhen.trim().length > 0))) {
      failures.push(buildFailure('CATALOG_REQUIRED_WHEN_INVALID', { tokenId }));
    }
    if (!proofHook) {
      failures.push(buildFailure('CATALOG_PROOF_HOOK_EMPTY', { tokenId }));
    }
    if (!SOURCE_BINDINGS.has(sourceBinding)) {
      failures.push(buildFailure('CATALOG_SOURCE_BINDING_INVALID', { tokenId, sourceBinding }));
    }
    if (!FAIL_SIGNAL_RE.test(failSignalCode)) {
      failures.push(buildFailure('CATALOG_FAIL_SIGNAL_INVALID', { tokenId, failSignalCode }));
    }
    if (!NAMESPACE_RE.test(namespace)) {
      failures.push(buildFailure('CATALOG_NAMESPACE_INVALID', { tokenId, namespace }));
    } else if (!tokenId.startsWith(`${namespace}_`)) {
      failures.push(buildFailure('CATALOG_NAMESPACE_PREFIX_MISMATCH', { tokenId, namespace }));
    }

    if (gateTier === 'release') {
      if (!Object.prototype.hasOwnProperty.call(row, 'proofHookClosureSha256')) {
        failures.push(buildFailure('CATALOG_RELEASE_CLOSURE_SHA_MISSING', { tokenId }));
      } else {
        const closureSha = row.proofHookClosureSha256;
        if (!(closureSha === null
          || (typeof closureSha === 'string' && SHA256_HEX_RE.test(closureSha.toLowerCase())))) {
          failures.push(buildFailure('CATALOG_RELEASE_CLOSURE_SHA_INVALID', { tokenId }));
        }
      }
    }
  }

  const sortedTokenIds = [...tokenIds].sort((a, b) => a.localeCompare(b));
  const orderOk = tokenIds.length === sortedTokenIds.length
    && tokenIds.every((token, idx) => token === sortedTokenIds[idx]);
  if (!orderOk) {
    failures.push(buildFailure('CATALOG_TOKEN_ORDER_NOT_SORTED'));
  }

  return {
    failures,
    tokens: tokens.filter((row) => isObjectRecord(row)),
  };
}

function validateRequiredSetCoverage(tokens, requiredSetDoc) {
  const failures = [];
  const requiredCore = uniqueSortedStrings(
    requiredSetDoc && requiredSetDoc.requiredSets ? requiredSetDoc.requiredSets.core : [],
  );
  const requiredRelease = uniqueSortedStrings(
    requiredSetDoc && requiredSetDoc.requiredSets ? requiredSetDoc.requiredSets.release : [],
  );

  if (requiredCore.length === 0) {
    failures.push(buildFailure('REQUIRED_SET_CORE_EMPTY'));
  }
  if (requiredRelease.length === 0) {
    failures.push(buildFailure('REQUIRED_SET_RELEASE_EMPTY'));
  }

  const requiredTokens = uniqueSortedStrings([...requiredCore, ...requiredRelease]);
  const catalogTokenSet = new Set(
    tokens
      .map((row) => String(row.tokenId || '').trim())
      .filter((token) => token.length > 0),
  );
  const missingRequiredTokens = requiredTokens.filter((token) => !catalogTokenSet.has(token));
  for (const token of missingRequiredTokens) {
    failures.push(buildFailure('CATALOG_REQUIRED_TOKEN_MISSING', { token }));
  }

  return {
    failures,
    requiredCore,
    requiredRelease,
    requiredTokens,
    missingRequiredTokens,
  };
}

export function evaluateTokenCatalogState(input = {}) {
  const catalogPath = String(
    input.catalogPath || process.env.TOKEN_CATALOG_PATH || DEFAULT_CATALOG_PATH,
  ).trim();
  const requiredSetPath = String(
    input.requiredSetPath || process.env.REQUIRED_TOKEN_SET_PATH || DEFAULT_REQUIRED_SET_PATH,
  ).trim();

  const catalogDoc = readJsonObject(catalogPath);
  const requiredSetDoc = readJsonObject(requiredSetPath);
  const failures = [];

  const catalogValidation = validateCatalogDoc(catalogDoc);
  failures.push(...catalogValidation.failures);

  if (!requiredSetDoc) {
    failures.push(buildFailure('REQUIRED_SET_UNREADABLE', { path: requiredSetPath }));
  }

  const coverageValidation = validateRequiredSetCoverage(catalogValidation.tokens, requiredSetDoc || {});
  failures.push(...coverageValidation.failures);

  const sortedFailures = sortFailures(failures);
  const ok = sortedFailures.length === 0;
  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    failSignalCode: ok ? '' : FAIL_CODE,
    catalogPath,
    requiredSetPath,
    catalogTokenCount: catalogValidation.tokens.length,
    requiredCore: coverageValidation.requiredCore,
    requiredRelease: coverageValidation.requiredRelease,
    requiredTokens: coverageValidation.requiredTokens,
    missingRequiredTokens: coverageValidation.missingRequiredTokens,
    failures: sortedFailures,
    failSignal: ok
      ? null
      : {
        code: FAIL_CODE,
        details: {
          failures: sortedFailures,
          missingRequiredTokens: coverageValidation.missingRequiredTokens,
          catalogPath,
          requiredSetPath,
        },
      },
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    catalogPath: '',
    requiredSetPath: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--catalog-path' && i + 1 < argv.length) {
      out.catalogPath = String(argv[i + 1] || '').trim();
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
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`TOKEN_CATALOG_PATH=${state.catalogPath}`);
  console.log(`TOKEN_CATALOG_REQUIRED_SET_PATH=${state.requiredSetPath}`);
  console.log(`TOKEN_CATALOG_TOKEN_COUNT=${state.catalogTokenCount}`);
  console.log(`TOKEN_CATALOG_FAILURES=${JSON.stringify(state.failures)}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.failSignalCode}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateTokenCatalogState({
    catalogPath: args.catalogPath || undefined,
    requiredSetPath: args.requiredSetPath || undefined,
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
