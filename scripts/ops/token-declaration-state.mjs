#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_DECLARATION_PATH = 'docs/OPS/TOKENS/TOKEN_DECLARATION.json';

function parseJson(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseTokenMap(text) {
  const out = new Map();
  for (const raw of String(text || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const normalized = line.startsWith('DOCTOR_TOKEN ')
      ? line.slice('DOCTOR_TOKEN '.length).trim()
      : line;
    const idx = normalized.indexOf('=');
    if (idx <= 0) continue;
    const key = normalized.slice(0, idx).trim();
    const value = normalized.slice(idx + 1).trim();
    if (!key) continue;
    out.set(key, value);
  }
  return out;
}

function uniqueSortedTokens(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const token = String(item || '').trim();
    if (!token) return null;
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out.sort();
}

function collectAuthoritativeTokens() {
  const env = {
    ...process.env,
    TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
  };
  const additionalTokenProbes = [
    'scripts/ops/conditional-gates-state.mjs',
    'scripts/ops/config-hash-lock-state.mjs',
    'scripts/ops/failsignal-registry-state.mjs',
    'scripts/ops/lossless-map-state.mjs',
    'scripts/ops/proofhook-integrity-state.mjs',
    'scripts/ops/token-catalog-state.mjs',
  ];

  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env,
  });
  const truthTokens = new Set();
  if (truth.status === 0) {
    try {
      const parsed = JSON.parse(String(truth.stdout || '{}'));
      for (const key of Object.keys(parsed || {})) {
        truthTokens.add(key);
      }
    } catch {
      // ignore parse errors; handled by status token below
    }
  }

  const doctor = spawnSync(process.execPath, ['scripts/doctor.mjs', '--strict'], {
    encoding: 'utf8',
    env: {
      ...env,
      DOCTOR_MODE: 'delivery',
    },
  });
  const doctorTokens = new Set(parseTokenMap(doctor.stdout).keys());

  const probeTokens = new Set();
  for (const scriptPath of additionalTokenProbes) {
    const probe = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env,
    });
    for (const key of parseTokenMap(probe.stdout).keys()) {
      probeTokens.add(key);
    }
  }

  const all = new Set([...truthTokens, ...doctorTokens, ...probeTokens]);
  return {
    truthStatus: truth.status,
    doctorStatus: doctor.status,
    tokens: all,
  };
}

export function evaluateTokenDeclarationState(input = {}) {
  const declarationPath = input.declarationPath || process.env.TOKEN_DECLARATION_PATH || DEFAULT_DECLARATION_PATH;
  const skipEmissionCheck = input.skipEmissionCheck === true
    || process.env.TOKEN_DECLARATION_SKIP_EMISSION_CHECK === '1';

  if (!fs.existsSync(declarationPath)) {
    return {
      path: declarationPath,
      present: 0,
      schemaVersion: 0,
      existingCount: 0,
      targetCount: 0,
      overlapCount: 0,
      overlap: [],
      missingExistingEmission: [],
      ok: 0,
      failReason: 'TOKEN_DECLARATION_MISSING',
    };
  }

  const doc = parseJson(declarationPath);
  if (!doc) {
    return {
      path: declarationPath,
      present: 1,
      schemaVersion: 0,
      existingCount: 0,
      targetCount: 0,
      overlapCount: 0,
      overlap: [],
      missingExistingEmission: [],
      ok: 0,
      failReason: 'TOKEN_DECLARATION_INVALID_JSON',
    };
  }

  const existingTokens = uniqueSortedTokens(doc.existingTokens);
  const targetTokens = uniqueSortedTokens(doc.targetTokens);

  if (!Number.isInteger(doc.schemaVersion) || doc.schemaVersion !== 1) {
    return {
      path: declarationPath,
      present: 1,
      schemaVersion: Number(doc.schemaVersion || 0),
      existingCount: 0,
      targetCount: 0,
      overlapCount: 0,
      overlap: [],
      missingExistingEmission: [],
      ok: 0,
      failReason: 'TOKEN_DECLARATION_SCHEMA_INVALID',
    };
  }

  if (!existingTokens || !targetTokens) {
    return {
      path: declarationPath,
      present: 1,
      schemaVersion: 1,
      existingCount: 0,
      targetCount: 0,
      overlapCount: 0,
      overlap: [],
      missingExistingEmission: [],
      ok: 0,
      failReason: 'TOKEN_DECLARATION_ARRAY_INVALID',
    };
  }

  const targetSet = new Set(targetTokens);
  const overlap = existingTokens.filter((token) => targetSet.has(token));
  if (overlap.length > 0) {
    return {
      path: declarationPath,
      present: 1,
      schemaVersion: 1,
      existingCount: existingTokens.length,
      targetCount: targetTokens.length,
      overlapCount: overlap.length,
      overlap,
      missingExistingEmission: [],
      ok: 0,
      failReason: 'TOKEN_DECLARATION_OVERLAP',
    };
  }

  let missingExistingEmission = [];
  if (!skipEmissionCheck) {
    const observed = collectAuthoritativeTokens();
    if (observed.truthStatus !== 0 || observed.doctorStatus !== 0) {
      return {
        path: declarationPath,
        present: 1,
        schemaVersion: 1,
        existingCount: existingTokens.length,
        targetCount: targetTokens.length,
        overlapCount: 0,
        overlap: [],
        missingExistingEmission: [],
        ok: 0,
        failReason: 'TOKEN_DECLARATION_AUTHORITATIVE_CHECK_FAILED',
      };
    }
    missingExistingEmission = existingTokens.filter((token) => !observed.tokens.has(token));
    if (missingExistingEmission.length > 0) {
      return {
        path: declarationPath,
        present: 1,
        schemaVersion: 1,
        existingCount: existingTokens.length,
        targetCount: targetTokens.length,
        overlapCount: 0,
        overlap: [],
        missingExistingEmission,
        ok: 0,
        failReason: 'TOKEN_DECLARATION_EXISTING_NOT_EMITTED',
      };
    }
  }

  return {
    path: declarationPath,
    present: 1,
    schemaVersion: 1,
    existingCount: existingTokens.length,
    targetCount: targetTokens.length,
    overlapCount: 0,
    overlap: [],
    missingExistingEmission,
    ok: 1,
    failReason: '',
  };
}

function parseArgs(argv) {
  const out = {
    declarationPath: '',
    skipEmissionCheck: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--declaration-path') {
      out.declarationPath = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (argv[i] === '--skip-emission-check') {
      out.skipEmissionCheck = true;
    }
  }
  return out;
}

function printTokens(state) {
  console.log(`TOKEN_DECLARATION_PATH=${state.path}`);
  console.log(`TOKEN_DECLARATION_PRESENT=${state.present}`);
  console.log(`TOKEN_DECLARATION_SCHEMA_VERSION=${state.schemaVersion}`);
  console.log(`TOKEN_DECLARATION_EXISTING_COUNT=${state.existingCount}`);
  console.log(`TOKEN_DECLARATION_TARGET_COUNT=${state.targetCount}`);
  console.log(`TOKEN_DECLARATION_OVERLAP_COUNT=${state.overlapCount}`);
  console.log(`TOKEN_DECLARATION_OVERLAP=${JSON.stringify(state.overlap)}`);
  console.log(`TOKEN_DECLARATION_MISSING_EXISTING_EMISSION=${JSON.stringify(state.missingExistingEmission)}`);
  console.log(`TOKEN_DECLARATION_VALID_OK=${state.ok}`);
  if (state.failReason) console.log(`FAIL_REASON=${state.failReason}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateTokenDeclarationState({
    declarationPath: args.declarationPath,
    skipEmissionCheck: args.skipEmissionCheck,
  });
  printTokens(state);
  process.exit(state.ok === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
