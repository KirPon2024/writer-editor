#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'REQUIRED_SET_NO_TARGET_OK';
const FAIL_CODE = 'E_REQUIRED_SET_CONTAINS_TARGET';
const DEFAULT_REQUIRED_SET_PATH = 'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json';
const DEFAULT_DECLARATION_PATH = 'docs/OPS/TOKENS/TOKEN_DECLARATION.json';
const SELF_BOOTSTRAP_ALLOWED_TARGETS = Object.freeze([
  'REQUIRED_SET_NO_TARGET_OK',
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

function uniqueSortedStrings(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function readJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildIssue(code, details = {}) {
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
    return tokenA.localeCompare(tokenB);
  });
}

export function evaluateRequiredSetNoTargetState(input = {}) {
  const requiredSetPath = String(
    input.requiredSetPath || process.env.REQUIRED_TOKEN_SET_PATH || DEFAULT_REQUIRED_SET_PATH,
  ).trim();
  const declarationPath = String(
    input.declarationPath || process.env.TOKEN_DECLARATION_PATH || DEFAULT_DECLARATION_PATH,
  ).trim();

  const requiredSetDoc = readJsonObject(requiredSetPath);
  const declarationDoc = readJsonObject(declarationPath);
  const issues = [];

  if (!requiredSetDoc) {
    issues.push(buildIssue('REQUIRED_SET_UNREADABLE', { path: requiredSetPath }));
  }
  if (!declarationDoc) {
    issues.push(buildIssue('TOKEN_DECLARATION_UNREADABLE', { path: declarationPath }));
  }

  const releaseRequired = uniqueSortedStrings(
    requiredSetDoc && requiredSetDoc.requiredSets ? requiredSetDoc.requiredSets.release : [],
  );
  const targetTokens = uniqueSortedStrings(
    declarationDoc && Array.isArray(declarationDoc.targetTokens) ? declarationDoc.targetTokens : [],
  );
  const targetSet = new Set(targetTokens);
  const bootstrapAllowedSet = new Set(SELF_BOOTSTRAP_ALLOWED_TARGETS);

  if (releaseRequired.length === 0) {
    issues.push(buildIssue('RELEASE_REQUIRED_SET_EMPTY'));
  }

  const releaseTargetTokens = releaseRequired.filter((token) => targetSet.has(token));
  const violatingTokens = releaseTargetTokens.filter((token) => !bootstrapAllowedSet.has(token));
  for (const token of violatingTokens) {
    issues.push(buildIssue('RELEASE_CONTAINS_TARGET_TOKEN', { token }));
  }

  const sortedIssues = sortIssues(issues);
  const ok = sortedIssues.length === 0;
  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    code: ok ? '' : FAIL_CODE,
    details: {
      requiredSetPath,
      declarationPath,
      releaseRequired,
      targetTokens,
      releaseTargetTokens,
      bootstrapAllowedTargetTokens: [...SELF_BOOTSTRAP_ALLOWED_TARGETS],
      violatingTokens,
      issues: sortedIssues,
    },
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    requiredSetPath: '',
    declarationPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--required-set-path' && i + 1 < argv.length) {
      out.requiredSetPath = String(argv[i + 1] || '').trim();
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
  console.log(`REQUIRED_SET_NO_TARGET_RELEASE_TARGET_TOKENS=${JSON.stringify(state.details.releaseTargetTokens)}`);
  console.log(`REQUIRED_SET_NO_TARGET_VIOLATING_TOKENS=${JSON.stringify(state.details.violatingTokens)}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.code}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateRequiredSetNoTargetState({
    requiredSetPath: args.requiredSetPath || undefined,
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
