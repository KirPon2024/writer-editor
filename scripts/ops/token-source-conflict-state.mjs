#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TOOL_VERSION = 'token-source-conflict-state.v1';
const TOKEN_NAME = 'TOKEN_SOURCE_CONFLICT_OK';
const FAILURE_CONFLICT = 'E_TOKEN_SOURCE_CONFLICT';
const FAILURE_INPUT_UNAVAILABLE = 'E_TOKEN_SOURCE_INPUT_UNAVAILABLE';
const DEFAULT_TOKEN_DECLARATION_PATH = 'docs/OPS/TOKENS/TOKEN_DECLARATION.json';
const EXCLUDED_TOKENS = new Set([TOKEN_NAME]);
const TOKEN_RE = /^[A-Z0-9_]+$/u;

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueSortedStrings(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const token = String(raw || '').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out.sort();
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

function normalizeValueForCompare(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return `s:${value}`;
  if (typeof value === 'number') return `n:${String(value)}`;
  if (typeof value === 'boolean') return `b:${value ? '1' : '0'}`;
  return `j:${stableStringify(value)}`;
}

function readJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseTokenDeclaration(doc) {
  if (!isObjectRecord(doc)) return [];
  const existing = uniqueSortedStrings(doc.existingTokens);
  const target = uniqueSortedStrings(doc.targetTokens);
  const merged = uniqueSortedStrings([...existing, ...target]);
  return merged.filter((token) => TOKEN_RE.test(token) && !EXCLUDED_TOKENS.has(token));
}

function runJsonScript(scriptPath, args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
  if (result.status !== 0) {
    return { ok: false, json: null };
  }
  try {
    const parsed = JSON.parse(String(result.stdout || '{}'));
    return { ok: isObjectRecord(parsed), json: isObjectRecord(parsed) ? parsed : null };
  } catch {
    return { ok: false, json: null };
  }
}

function collectRuntimeSources() {
  const childEnv = { TOKEN_SOURCE_CONFLICT_SKIP: '1' };
  const truthResult = runJsonScript('scripts/ops/extract-truth-table.mjs', ['--json'], childEnv);
  const summaryResult = runJsonScript('scripts/ops/emit-ops-summary.mjs', ['--json'], childEnv);
  return {
    ok: truthResult.ok && summaryResult.ok,
    truthTableJson: truthResult.json || {},
    opsSummaryJson: summaryResult.json || {},
  };
}

function buildSourceMaps(input) {
  const truthTableJson = isObjectRecord(input.truthTableJson) ? input.truthTableJson : {};
  const opsSummaryJson = isObjectRecord(input.opsSummaryJson) ? input.opsSummaryJson : {};
  const doctorJson = isObjectRecord(input.doctorJson) ? input.doctorJson : {};
  const opsSummaryTokenValues = isObjectRecord(input.opsSummaryTokenValues)
    ? input.opsSummaryTokenValues
    : (isObjectRecord(opsSummaryJson.tokenValues) ? opsSummaryJson.tokenValues : {});
  const doctorTokenValues = isObjectRecord(input.doctorTokenValues)
    ? input.doctorTokenValues
    : (isObjectRecord(doctorJson.tokenValues) ? doctorJson.tokenValues : {});
  return {
    truthTableJson,
    opsSummaryTokenValues,
    doctorTokenValues,
  };
}

export function evaluateTokenSourceConflictState(input = {}) {
  const failures = new Set();

  const tokenDeclarationPath = String(
    input.tokenDeclarationPath
    || process.env.TOKEN_DECLARATION_PATH
    || DEFAULT_TOKEN_DECLARATION_PATH,
  ).trim();
  const tokenDeclarationJson = isObjectRecord(input.tokenDeclarationJson)
    ? input.tokenDeclarationJson
    : readJsonObject(tokenDeclarationPath);
  const comparedTokens = parseTokenDeclaration(tokenDeclarationJson);

  let truthTableJson = isObjectRecord(input.truthTableJson) ? input.truthTableJson : null;
  let opsSummaryJson = isObjectRecord(input.opsSummaryJson) ? input.opsSummaryJson : null;
  let opsSummaryTokenValues = isObjectRecord(input.opsSummaryTokenValues) ? input.opsSummaryTokenValues : null;
  let doctorJson = isObjectRecord(input.doctorJson) ? input.doctorJson : null;
  let doctorTokenValues = isObjectRecord(input.doctorTokenValues) ? input.doctorTokenValues : null;

  if (!truthTableJson || (!opsSummaryJson && !opsSummaryTokenValues)) {
    const runtime = collectRuntimeSources();
    if (!runtime.ok) {
      failures.add(FAILURE_INPUT_UNAVAILABLE);
    } else {
      if (!truthTableJson) truthTableJson = runtime.truthTableJson;
      if (!opsSummaryJson) opsSummaryJson = runtime.opsSummaryJson;
    }
  }

  const sourceMaps = buildSourceMaps({
    truthTableJson: truthTableJson || {},
    opsSummaryJson: opsSummaryJson || {},
    opsSummaryTokenValues,
    doctorJson: doctorJson || {},
    doctorTokenValues,
  });

  const conflicts = [];
  const doctorAvailable = Object.keys(sourceMaps.doctorTokenValues).length > 0;
  const comparedSourceKeys = doctorAvailable ? ['opsSummary', 'doctor'] : ['opsSummary'];
  for (const token of comparedTokens) {
    const hasTruth = Object.prototype.hasOwnProperty.call(sourceMaps.truthTableJson, token);
    const hasOpsSummary = Object.prototype.hasOwnProperty.call(sourceMaps.opsSummaryTokenValues, token);
    const hasDoctor = doctorAvailable && Object.prototype.hasOwnProperty.call(sourceMaps.doctorTokenValues, token);
    if (!hasTruth && !hasOpsSummary && !hasDoctor) continue;

    const sources = {
      truthTable: hasTruth ? sourceMaps.truthTableJson[token] : null,
      opsSummary: hasOpsSummary ? sourceMaps.opsSummaryTokenValues[token] : null,
    };
    if (doctorAvailable) {
      sources.doctor = hasDoctor ? sourceMaps.doctorTokenValues[token] : null;
    }

    if (!hasTruth) {
      conflicts.push({
        token,
        sources,
        expectedSource: 'truthTable',
        reason: 'SOURCE_MISSING',
      });
      continue;
    }

    const missingSecondarySource = comparedSourceKeys.some((sourceKey) => {
      if (sourceKey === 'opsSummary') return !hasOpsSummary;
      if (sourceKey === 'doctor') return !hasDoctor;
      return false;
    });
    if (missingSecondarySource) {
      conflicts.push({
        token,
        sources,
        expectedSource: 'truthTable',
        reason: 'SOURCE_MISSING',
      });
      continue;
    }

    const truthComparable = normalizeValueForCompare(sources.truthTable);
    const mismatch = comparedSourceKeys.some((sourceKey) => {
      const sourceComparable = normalizeValueForCompare(sources[sourceKey]);
      return sourceComparable !== truthComparable;
    });
    if (mismatch) {
      conflicts.push({
        token,
        sources,
        expectedSource: 'truthTable',
        reason: 'VALUE_MISMATCH',
      });
    }
  }

  conflicts.sort((a, b) => {
    if (a.token !== b.token) return a.token.localeCompare(b.token);
    return a.reason.localeCompare(b.reason);
  });
  if (conflicts.length > 0) {
    failures.add(FAILURE_CONFLICT);
  }

  const sortedFailures = [...failures].sort();
  const ok = sortedFailures.length === 0;
  const config = {
    tokenDeclarationPath,
    comparedTokens,
    sourcePriority: doctorAvailable
      ? ['truthTable', 'opsSummary', 'doctor']
      : ['truthTable', 'opsSummary'],
    doctorStructuredSourceAvailable: doctorAvailable ? 1 : 0,
  };

  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    conflicts,
    failures: sortedFailures,
    toolVersion: TOOL_VERSION,
    configHash: sha256Hex(stableStringify(config)),
  };
}

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
  };
}

function printTokens(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`TOKEN_SOURCE_CONFLICTS_COUNT=${state.conflicts.length}`);
  console.log(`TOKEN_SOURCE_CONFLICT_FAILURES=${JSON.stringify(state.failures)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateTokenSourceConflictState();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
