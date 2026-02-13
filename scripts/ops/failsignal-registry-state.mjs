#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'FAILSIGNAL_REGISTRY_VALID_OK';
const DEFAULT_REGISTRY_PATH = 'docs/OPS/FAILSIGNALS/FAILSIGNAL_REGISTRY.json';
const FAIL_CODE_DUPLICATE = 'E_FAILSIGNAL_DUPLICATE';
const FAIL_CODE_NEGATIVE = 'E_FAILSIGNAL_NEGATIVE_TEST_MISSING';
const FAIL_CODE_PRECEDENCE = 'E_FAILSIGNAL_PRECEDENCE_INVALID';
const FAIL_CODE_REGISTRY = 'E_FAILSIGNAL_REGISTRY_INVALID';
const ALLOWED_TIERS = new Set(['core', 'release']);
const NEGATIVE_TEST_REF_PATTERN = /^test\/contracts\/[a-z0-9._/-]+\.test\.js#[a-z0-9][a-z0-9-]*$/u;

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

function readRegistryDocument(registryPath) {
  if (!fs.existsSync(registryPath)) {
    return {
      ok: false,
      parsed: null,
      error: 'REGISTRY_MISSING',
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return {
      ok: true,
      parsed,
      error: '',
    };
  } catch {
    return {
      ok: false,
      parsed: null,
      error: 'REGISTRY_INVALID_JSON',
    };
  }
}

function issue(priority, index, type, details = {}) {
  return {
    priority,
    index,
    type,
    ...details,
  };
}

function classifyIssueType(type) {
  if (type === 'DUPLICATE_CODE') return FAIL_CODE_DUPLICATE;
  if (type === 'NEGATIVE_TEST_REF_MISSING' || type === 'NEGATIVE_TEST_REF_INVALID') return FAIL_CODE_NEGATIVE;
  if (type === 'PRECEDENCE_INVALID') return FAIL_CODE_PRECEDENCE;
  return FAIL_CODE_REGISTRY;
}

function validateRegistryShape(parsed) {
  if (!isObjectRecord(parsed)) {
    return {
      schemaVersion: 0,
      failSignals: [],
      issues: [issue(2, -1, 'SCHEMA_INVALID', { reason: 'TOP_LEVEL_NOT_OBJECT' })],
    };
  }

  const schemaVersion = Number(parsed.schemaVersion || 0);
  const failSignals = Array.isArray(parsed.failSignals) ? parsed.failSignals : null;
  const issues = [];

  if (schemaVersion !== 1) {
    issues.push(issue(2, -1, 'SCHEMA_INVALID', { reason: 'SCHEMA_VERSION_INVALID', actual: schemaVersion }));
  }
  if (!failSignals) {
    issues.push(issue(2, -1, 'SCHEMA_INVALID', { reason: 'FAILSIGNALS_NOT_ARRAY' }));
  }

  return {
    schemaVersion,
    failSignals: failSignals || [],
    issues,
  };
}

function validateFailSignals(failSignals) {
  const issues = [];
  const codes = new Set();
  const precedence = new Set();
  const precedenceRows = [];
  const seenOrder = [];

  for (let i = 0; i < failSignals.length; i += 1) {
    const row = failSignals[i];
    if (!isObjectRecord(row)) {
      issues.push(issue(2, i, 'SHAPE_INVALID', { reason: 'ENTRY_NOT_OBJECT' }));
      continue;
    }

    const code = String(row.code || '').trim();
    const blocking = row.blocking;
    const tier = String(row.tier || '').trim();
    const rationale = String(row.rationale || '').trim();
    const hasPrecedence = Object.prototype.hasOwnProperty.call(row, 'precedence');
    const rawPrecedence = row.precedence;
    const negativeTestRef = String(row.negativeTestRef || '').trim();

    if (!code || !/^E_[A-Z0-9_]+$/u.test(code)) {
      issues.push(issue(2, i, 'CODE_INVALID', { code: code || '<empty>' }));
      continue;
    }
    seenOrder.push(code);

    if (codes.has(code)) {
      issues.push(issue(0, i, 'DUPLICATE_CODE', { code }));
    }
    codes.add(code);

    if (blocking !== true && blocking !== false) {
      issues.push(issue(2, i, 'BLOCKING_INVALID', { code }));
    }

    if (!ALLOWED_TIERS.has(tier)) {
      issues.push(issue(2, i, 'TIER_INVALID', { code, tier: tier || '<empty>' }));
    }

    if (!rationale) {
      issues.push(issue(2, i, 'RATIONALE_MISSING', { code }));
    }

    if (hasPrecedence) {
      if (!Number.isInteger(rawPrecedence) || Number(rawPrecedence) < 0) {
        issues.push(issue(2, i, 'PRECEDENCE_INVALID', { code, precedence: rawPrecedence }));
      } else {
        const normalizedPrecedence = Number(rawPrecedence);
        if (precedence.has(normalizedPrecedence)) {
          issues.push(issue(2, i, 'PRECEDENCE_INVALID', {
            code,
            precedence: normalizedPrecedence,
            reason: 'PRECEDENCE_DUPLICATE',
          }));
        }
        precedence.add(normalizedPrecedence);
        precedenceRows.push({
          index: i,
          code,
          precedence: normalizedPrecedence,
        });
      }
    }

    if (!negativeTestRef) {
      issues.push(issue(1, i, 'NEGATIVE_TEST_REF_MISSING', { code }));
    } else if (!NEGATIVE_TEST_REF_PATTERN.test(negativeTestRef)) {
      issues.push(issue(1, i, 'NEGATIVE_TEST_REF_INVALID', { code, negativeTestRef }));
    }
  }

  for (let i = 1; i < precedenceRows.length; i += 1) {
    const prev = precedenceRows[i - 1];
    const curr = precedenceRows[i];
    if (prev.precedence >= curr.precedence) {
      issues.push(issue(2, curr.index, 'PRECEDENCE_INVALID', {
        code: curr.code,
        precedence: curr.precedence,
        reason: 'PRECEDENCE_NOT_STRICT_ASCENDING',
        previousCode: prev.code,
        previousPrecedence: prev.precedence,
      }));
      break;
    }
  }

  for (let i = 1; i < seenOrder.length; i += 1) {
    const prev = seenOrder[i - 1];
    const curr = seenOrder[i];
    if (prev.localeCompare(curr) > 0) {
      issues.push(issue(2, i, 'ORDER_NOT_STABLE', { previous: prev, current: curr }));
      break;
    }
  }

  return issues;
}

function finalizeIssues(rawIssues) {
  return [...rawIssues].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.index !== b.index) return a.index - b.index;
    const typeA = String(a.type || '');
    const typeB = String(b.type || '');
    if (typeA !== typeB) return typeA.localeCompare(typeB);
    const codeA = String(a.code || '');
    const codeB = String(b.code || '');
    return codeA.localeCompare(codeB);
  });
}

function buildState({ registryPath, schemaVersion, failSignalCount, issues }) {
  const sortedIssues = finalizeIssues(issues);
  const ok = sortedIssues.length === 0;
  const failSignalCode = ok ? '' : classifyIssueType(sortedIssues[0].type);

  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    failSignalCode,
    failSignal: ok
      ? null
      : {
        code: failSignalCode,
        issues: sortedIssues,
      },
    registryPath,
    schemaVersion,
    failSignalCount,
  };
}

export function evaluateFailsignalRegistryState(input = {}) {
  const registryPath = String(
    input.registryPath || process.env.FAILSIGNAL_REGISTRY_PATH || DEFAULT_REGISTRY_PATH,
  ).trim();

  const readState = readRegistryDocument(registryPath);
  if (!readState.ok || !readState.parsed) {
    return buildState({
      registryPath,
      schemaVersion: 0,
      failSignalCount: 0,
      issues: [issue(2, -1, 'SCHEMA_INVALID', { reason: readState.error || 'READ_FAILED' })],
    });
  }

  const base = validateRegistryShape(readState.parsed);
  const rowIssues = validateFailSignals(base.failSignals);
  return buildState({
    registryPath,
    schemaVersion: base.schemaVersion,
    failSignalCount: base.failSignals.length,
    issues: [...base.issues, ...rowIssues],
  });
}

function parseArgs(argv) {
  const out = {
    json: false,
    registryPath: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--registry-path' && i + 1 < argv.length) {
      out.registryPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`FAILSIGNAL_REGISTRY_PATH=${state.registryPath}`);
  console.log(`FAILSIGNAL_REGISTRY_SCHEMA_VERSION=${state.schemaVersion}`);
  console.log(`FAILSIGNAL_REGISTRY_COUNT=${state.failSignalCount}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.failSignalCode}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateFailsignalRegistryState({
    registryPath: args.registryPath || undefined,
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
