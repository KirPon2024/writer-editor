#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_RECORD_VALID = 'PRE_UI_OPS_CONTOUR_RECORD_VALID_OK';
const TOKEN_CLOSED = 'PRE_UI_OPS_CONTOUR_CLOSED_OK';
const DEFAULT_RECORD_PATH = 'docs/OPS/STATUS/PRE_UI_OPS_CONTOUR_CLOSE_v1.json';

const FAIL_RECORD_MISSING = 'E_PRE_UI_CONTOUR_RECORD_MISSING';
const FAIL_RECORD_INVALID = 'E_PRE_UI_CONTOUR_RECORD_INVALID';
const FAIL_HEAD_ORIGIN_MISMATCH = 'E_PRE_UI_CONTOUR_HEAD_ORIGIN_MISMATCH';
const FAIL_DIRTY_WORKTREE = 'E_PRE_UI_CONTOUR_DIRTY_WORKTREE';
const FAIL_REQUIRED_TOKENS_MISSING = 'E_PRE_UI_CONTOUR_REQUIRED_TOKENS_MISSING';
const FAIL_REQUIRED_TOKENS_FAIL = 'E_PRE_UI_CONTOUR_REQUIRED_TOKENS_FAIL';

const SHA1_HEX_RE = /^[0-9a-f]{40}$/u;
const TOKEN_KEY_RE = /^[A-Z0-9_]+$/u;

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toIsoUtc(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toISOString();
}

function parseJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function runGit(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function readStdout(result) {
  return String(result && result.stdout ? result.stdout : '');
}

function trimStdout(result) {
  return readStdout(result).trim();
}

function normalizeRequirementSpec(rawSpec) {
  const spec = String(rawSpec || '').trim();
  if (!spec) return null;

  const eqMatch = spec.match(/^([A-Z0-9_]+)\s*==\s*(-?\d+)$/u);
  if (eqMatch) {
    return {
      spec,
      key: eqMatch[1],
      expected: Number(eqMatch[2]),
      operator: '==',
    };
  }

  if (TOKEN_KEY_RE.test(spec)) {
    return {
      spec,
      key: spec,
      expected: 1,
      operator: '==',
    };
  }
  return null;
}

function normalizeNumericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (/^-?\d+$/u.test(normalized)) return Number(normalized);
  }
  return Number.NaN;
}

function resolveTokenValues(input) {
  if (isObjectRecord(input.tokenValues)) {
    return {
      tokenValues: input.tokenValues,
      source: 'input',
      failReason: '',
    };
  }

  const result = spawnSync(process.execPath, ['scripts/ops/freeze-rollups-state.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
      PRE_UI_CONTOUR_SELF_CHECK: '1',
    },
  });
  if (result.status !== 0) {
    return {
      tokenValues: {},
      source: 'freeze-rollups',
      failReason: 'TOKEN_VALUES_UNAVAILABLE',
    };
  }

  try {
    const parsed = JSON.parse(String(result.stdout || '{}'));
    return {
      tokenValues: isObjectRecord(parsed) ? parsed : {},
      source: 'freeze-rollups',
      failReason: isObjectRecord(parsed) ? '' : 'TOKEN_VALUES_INVALID',
    };
  } catch {
    return {
      tokenValues: {},
      source: 'freeze-rollups',
      failReason: 'TOKEN_VALUES_INVALID_JSON',
    };
  }
}

function validateRecordShape(record) {
  const errors = [];
  const requiredSpecs = [];

  if (!isObjectRecord(record)) {
    errors.push('RECORD_NOT_OBJECT');
    return { ok: false, errors, requiredSpecs };
  }

  if (String(record.schemaVersion || '').trim() !== 'v1') {
    errors.push('SCHEMA_VERSION_INVALID');
  }

  if (!toIsoUtc(record.closedAtUtc)) {
    errors.push('CLOSED_AT_UTC_INVALID');
  }

  const closedBy = String(record.closedBy || '').trim();
  if (!closedBy) {
    errors.push('CLOSED_BY_INVALID');
  }

  const headSha = String(record.headSha || '').trim().toLowerCase();
  const originMainSha = String(record.originMainSha || '').trim().toLowerCase();
  if (!SHA1_HEX_RE.test(headSha)) {
    errors.push('HEAD_SHA_INVALID');
  }
  if (!SHA1_HEX_RE.test(originMainSha)) {
    errors.push('ORIGIN_MAIN_SHA_INVALID');
  }

  if (!Array.isArray(record.prs)) {
    errors.push('PRS_INVALID');
  } else if (record.prs.some((entry) => String(entry || '').trim().length === 0)) {
    errors.push('PRS_ITEM_INVALID');
  }

  if (!isObjectRecord(record.evidence)) {
    errors.push('EVIDENCE_INVALID');
  } else {
    const strictDoctorOk = record.evidence.strictDoctorOk;
    const strictOpsSummaryOk = record.evidence.strictOpsSummaryOk;
    const truthTableHasTokensOk = record.evidence.truthTableHasTokensOk;
    if (!Number.isInteger(strictDoctorOk) || (strictDoctorOk !== 0 && strictDoctorOk !== 1)) {
      errors.push('EVIDENCE_STRICT_DOCTOR_INVALID');
    }
    if (!Number.isInteger(strictOpsSummaryOk) || (strictOpsSummaryOk !== 0 && strictOpsSummaryOk !== 1)) {
      errors.push('EVIDENCE_STRICT_OPS_SUMMARY_INVALID');
    }
    if (!Number.isInteger(truthTableHasTokensOk) || (truthTableHasTokensOk !== 0 && truthTableHasTokensOk !== 1)) {
      errors.push('EVIDENCE_TRUTH_TABLE_INVALID');
    }
  }

  if (!Array.isArray(record.requiredTokens) || record.requiredTokens.length === 0) {
    errors.push('REQUIRED_TOKENS_INVALID');
  } else {
    for (const rawSpec of record.requiredTokens) {
      const spec = normalizeRequirementSpec(rawSpec);
      if (!spec) {
        errors.push(`REQUIRED_TOKEN_SPEC_INVALID:${String(rawSpec || '').trim()}`);
        continue;
      }
      requiredSpecs.push(spec);
    }
  }

  if (typeof record.notes !== 'string') {
    errors.push('NOTES_INVALID');
  }

  return {
    ok: errors.length === 0,
    errors,
    requiredSpecs,
  };
}

export function evaluatePreUiOpsContourCloseState(input = {}) {
  const recordPath = String(input.recordPath || process.env.PRE_UI_OPS_CONTOUR_CLOSE_PATH || DEFAULT_RECORD_PATH).trim();
  const recordExists = input.recordExists === false ? false : fs.existsSync(recordPath);

  const stateBase = {
    ok: false,
    [TOKEN_RECORD_VALID]: 0,
    [TOKEN_CLOSED]: 0,
    failSignal: '',
    failReason: '',
    recordPath,
    recordPresent: recordExists ? 1 : 0,
    recordSchemaVersion: '',
    recordHeadSha: '',
    recordOriginMainSha: '',
    currentHeadSha: '',
    currentOriginMainSha: '',
    headMatchesRecord: 0,
    originMainMatchesRecord: 0,
    headEqualsOriginMain: 0,
    worktreeClean: 0,
    requiredTokenMissing: [],
    requiredTokenFailed: [],
    requiredTokenChecks: [],
    violations: [],
    tokenValuesSource: '',
  };

  if (!recordExists && !isObjectRecord(input.recordDoc)) {
    return {
      ...stateBase,
      failSignal: FAIL_RECORD_MISSING,
      failReason: 'RECORD_MISSING',
      violations: ['RECORD_MISSING'],
    };
  }

  const record = isObjectRecord(input.recordDoc)
    ? input.recordDoc
    : parseJsonObject(recordPath);
  if (!record) {
    return {
      ...stateBase,
      failSignal: FAIL_RECORD_INVALID,
      failReason: 'RECORD_INVALID_JSON',
      violations: ['RECORD_INVALID_JSON'],
      recordPresent: recordExists ? 1 : 0,
    };
  }

  const validation = validateRecordShape(record);
  if (!validation.ok) {
    return {
      ...stateBase,
      recordSchemaVersion: String(record.schemaVersion || '').trim(),
      recordHeadSha: String(record.headSha || '').trim(),
      recordOriginMainSha: String(record.originMainSha || '').trim(),
      failSignal: FAIL_RECORD_INVALID,
      failReason: validation.errors[0] || 'RECORD_INVALID',
      violations: [...validation.errors],
    };
  }

  const currentHeadSha = String(
    input.currentHeadSha
    || process.env.PRE_UI_CONTOUR_HEAD_SHA
    || trimStdout(runGit(['rev-parse', 'HEAD'])),
  ).trim().toLowerCase();
  const currentOriginMainSha = String(
    input.currentOriginMainSha
    || process.env.PRE_UI_CONTOUR_ORIGIN_MAIN_SHA
    || trimStdout(runGit(['rev-parse', 'origin/main'])),
  ).trim().toLowerCase();

  const worktreePorcelain = typeof input.worktreePorcelain === 'string'
    ? input.worktreePorcelain
    : readStdout(runGit(['status', '--porcelain', '--untracked-files=all']));
  const worktreeClean = String(worktreePorcelain).trim() === '' ? 1 : 0;
  const enforceWorktreeClean = input.enforceWorktreeClean === undefined
    ? true
    : input.enforceWorktreeClean === true;

  const recordHeadSha = String(record.headSha || '').trim().toLowerCase();
  const recordOriginMainSha = String(record.originMainSha || '').trim().toLowerCase();
  const headMatchesRecord = currentHeadSha === recordHeadSha ? 1 : 0;
  const originMainMatchesRecord = currentOriginMainSha === recordOriginMainSha ? 1 : 0;
  const headEqualsOriginMain = currentHeadSha && currentOriginMainSha && currentHeadSha === currentOriginMainSha ? 1 : 0;

  const resolvedTokenValues = resolveTokenValues(input);
  const tokenValues = resolvedTokenValues.tokenValues;
  const requiredTokenMissing = [];
  const requiredTokenFailed = [];
  const requiredTokenChecks = [];

  for (const requirement of validation.requiredSpecs) {
    const hasToken = Object.prototype.hasOwnProperty.call(tokenValues, requirement.key);
    const rawActual = hasToken ? tokenValues[requirement.key] : null;
    const actualNumeric = normalizeNumericValue(rawActual);
    const pass = hasToken && Number.isFinite(actualNumeric) && actualNumeric === requirement.expected;
    requiredTokenChecks.push({
      spec: requirement.spec,
      key: requirement.key,
      operator: requirement.operator,
      expected: requirement.expected,
      present: hasToken ? 1 : 0,
      actual: hasToken ? rawActual : null,
      pass: pass ? 1 : 0,
    });
    if (!hasToken) {
      requiredTokenMissing.push(requirement.spec);
      continue;
    }
    if (!pass) {
      requiredTokenFailed.push(requirement.spec);
    }
  }

  const evidenceChecks = [];
  if (record.evidence.strictDoctorOk !== 1) evidenceChecks.push('EVIDENCE_STRICT_DOCTOR_NOT_GREEN');
  if (record.evidence.strictOpsSummaryOk !== 1) evidenceChecks.push('EVIDENCE_STRICT_OPS_SUMMARY_NOT_GREEN');
  if (record.evidence.truthTableHasTokensOk !== 1) evidenceChecks.push('EVIDENCE_TRUTH_TABLE_NOT_GREEN');

  const violations = [];
  let failSignal = '';
  let failReason = '';

  if (headEqualsOriginMain !== 1) {
    violations.push('HEAD_ORIGIN_MISMATCH');
    failSignal = FAIL_HEAD_ORIGIN_MISMATCH;
    failReason = 'HEAD_ORIGIN_MISMATCH';
  } else if (enforceWorktreeClean && worktreeClean !== 1) {
    violations.push('WORKTREE_DIRTY');
    failSignal = FAIL_DIRTY_WORKTREE;
    failReason = 'WORKTREE_DIRTY';
  } else if (requiredTokenMissing.length > 0) {
    violations.push('REQUIRED_TOKENS_MISSING');
    failSignal = FAIL_REQUIRED_TOKENS_MISSING;
    failReason = 'REQUIRED_TOKENS_MISSING';
  } else if (requiredTokenFailed.length > 0 || evidenceChecks.length > 0 || resolvedTokenValues.failReason) {
    violations.push('REQUIRED_TOKENS_FAIL');
    failSignal = FAIL_REQUIRED_TOKENS_FAIL;
    failReason = 'REQUIRED_TOKENS_FAIL';
  }

  if (evidenceChecks.length > 0) violations.push(...evidenceChecks);
  if (resolvedTokenValues.failReason) violations.push(resolvedTokenValues.failReason);

  const recordValidToken = 1;
  const closedToken = failSignal ? 0 : 1;

  return {
    ...stateBase,
    ok: closedToken === 1,
    [TOKEN_RECORD_VALID]: recordValidToken,
    [TOKEN_CLOSED]: closedToken,
    failSignal,
    failReason,
    recordPresent: 1,
    recordSchemaVersion: String(record.schemaVersion || '').trim(),
    recordHeadSha,
    recordOriginMainSha,
    currentHeadSha,
    currentOriginMainSha,
    headMatchesRecord,
    originMainMatchesRecord,
    headEqualsOriginMain,
    worktreeClean,
    enforceWorktreeClean: enforceWorktreeClean ? 1 : 0,
    requiredTokenMissing: [...requiredTokenMissing].sort((a, b) => a.localeCompare(b)),
    requiredTokenFailed: [...requiredTokenFailed].sort((a, b) => a.localeCompare(b)),
    requiredTokenChecks: [...requiredTokenChecks].sort((a, b) => a.spec.localeCompare(b.spec)),
    tokenValuesSource: resolvedTokenValues.source,
    violations: [...new Set(violations)].sort((a, b) => a.localeCompare(b)),
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    recordPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (arg === '--json') out.json = true;
    if (arg === '--record-path' && i + 1 < argv.length) {
      out.recordPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_RECORD_VALID}=${state[TOKEN_RECORD_VALID]}`);
  console.log(`${TOKEN_CLOSED}=${state[TOKEN_CLOSED]}`);
  console.log(`PRE_UI_OPS_CONTOUR_RECORD_PATH=${state.recordPath}`);
  console.log(`PRE_UI_OPS_CONTOUR_RECORD_PRESENT=${state.recordPresent}`);
  console.log(`PRE_UI_OPS_CONTOUR_RECORD_SCHEMA_VERSION=${state.recordSchemaVersion}`);
  console.log(`PRE_UI_OPS_CONTOUR_RECORD_HEAD_SHA=${state.recordHeadSha}`);
  console.log(`PRE_UI_OPS_CONTOUR_RECORD_ORIGIN_MAIN_SHA=${state.recordOriginMainSha}`);
  console.log(`PRE_UI_OPS_CONTOUR_CURRENT_HEAD_SHA=${state.currentHeadSha}`);
  console.log(`PRE_UI_OPS_CONTOUR_CURRENT_ORIGIN_MAIN_SHA=${state.currentOriginMainSha}`);
  console.log(`PRE_UI_OPS_CONTOUR_HEAD_MATCHES_RECORD=${state.headMatchesRecord}`);
  console.log(`PRE_UI_OPS_CONTOUR_ORIGIN_MATCHES_RECORD=${state.originMainMatchesRecord}`);
  console.log(`PRE_UI_OPS_CONTOUR_HEAD_EQUALS_ORIGIN=${state.headEqualsOriginMain}`);
  console.log(`PRE_UI_OPS_CONTOUR_WORKTREE_CLEAN=${state.worktreeClean}`);
  console.log(`PRE_UI_OPS_CONTOUR_REQUIRED_TOKEN_MISSING=${JSON.stringify(state.requiredTokenMissing)}`);
  console.log(`PRE_UI_OPS_CONTOUR_REQUIRED_TOKEN_FAILED=${JSON.stringify(state.requiredTokenFailed)}`);
  console.log(`PRE_UI_OPS_CONTOUR_VIOLATIONS=${JSON.stringify(state.violations)}`);
  if (state.failSignal) console.log(`FAIL_SIGNAL=${state.failSignal}`);
  if (state.failReason) console.log(`FAIL_REASON=${state.failReason}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluatePreUiOpsContourCloseState({
    recordPath: args.recordPath || undefined,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state[TOKEN_CLOSED] === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
