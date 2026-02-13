#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'XPLAT_PARITY_BASELINE_VALID_OK';
const EXPECTED_SCHEMA_VERSION = 'v3.12';
const EXPECTED_STAGE_ID = 'X1';
const EXPECTED_CONCURRENCY_UNIT = 'Scene';
const EXPECTED_METRICS_REF = 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json';
const REQUIRED_HARD_PARITY_FLAGS = Object.freeze([
  'schemaStable',
  'migrationsDeterministic',
  'recoveryRoundtripOk',
  'normalizationInvariant',
  'exportImportRoundtripOk',
]);

export const DEFAULT_XPLAT_PARITY_BASELINE_PATH = 'docs/OPS/STATUS/XPLAT_PARITY_BASELINE_v3_12.json';
export const DEFAULT_XPLAT_STAGE_METRICS_PATH = 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json';

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSortObject(entry));
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

function pushError(errors, code, issuePath, message) {
  errors.push({
    code: String(code || '').trim(),
    path: String(issuePath || '').trim(),
    message: String(message || '').trim(),
  });
}

function sortErrors(errors) {
  return [...errors].sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.message.localeCompare(b.message);
  });
}

export function evaluateXplatParityBaselineState(input = {}) {
  const baselinePath = String(
    input.baselinePath || process.env.XPLAT_PARITY_BASELINE_PATH || DEFAULT_XPLAT_PARITY_BASELINE_PATH,
  ).trim();
  const metricsPath = String(
    input.metricsPath || process.env.XPLAT_STAGE_METRICS_PATH || DEFAULT_XPLAT_STAGE_METRICS_PATH,
  ).trim();

  const baselineDoc = isObjectRecord(input.baselineDoc) ? input.baselineDoc : readJsonObject(baselinePath);
  const metricsDoc = isObjectRecord(input.metricsDoc) ? input.metricsDoc : readJsonObject(metricsPath);
  const errors = [];

  let stageId = null;
  let concurrencyUnit = null;
  let metricsRef = null;

  if (!baselineDoc) {
    pushError(
      errors,
      'E_XPLAT_PARITY_BASELINE_UNREADABLE',
      'baseline',
      'Unable to read XPLAT parity baseline JSON.',
    );
  } else {
    const schemaVersion = String(baselineDoc.schemaVersion || '').trim();
    if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
      pushError(
        errors,
        'E_XPLAT_PARITY_BASELINE_SCHEMA_VERSION_INVALID',
        'baseline.schemaVersion',
        `Expected schemaVersion=${EXPECTED_SCHEMA_VERSION}.`,
      );
    }

    stageId = String(baselineDoc.stageId || '').trim() || null;
    if (stageId !== EXPECTED_STAGE_ID) {
      pushError(
        errors,
        'E_XPLAT_PARITY_BASELINE_STAGE_INVALID',
        'baseline.stageId',
        `Expected stageId=${EXPECTED_STAGE_ID}.`,
      );
    }

    concurrencyUnit = String(baselineDoc.concurrencyUnit || '').trim() || null;
    if (concurrencyUnit !== EXPECTED_CONCURRENCY_UNIT) {
      pushError(
        errors,
        'E_XPLAT_PARITY_BASELINE_CONCURRENCY_INVALID',
        'baseline.concurrencyUnit',
        `Expected concurrencyUnit=${EXPECTED_CONCURRENCY_UNIT}.`,
      );
    }

    metricsRef = String(baselineDoc.metricsRef || '').trim() || null;
    if (metricsRef !== EXPECTED_METRICS_REF) {
      pushError(
        errors,
        'E_XPLAT_PARITY_BASELINE_METRICS_REF_INVALID',
        'baseline.metricsRef',
        `Expected metricsRef=${EXPECTED_METRICS_REF}.`,
      );
    }

    const hardParity = isObjectRecord(baselineDoc.hardParity) ? baselineDoc.hardParity : null;
    if (!hardParity) {
      pushError(
        errors,
        'E_XPLAT_PARITY_BASELINE_HARD_PARITY_INVALID',
        'baseline.hardParity',
        'hardParity must be an object map.',
      );
    } else {
      for (const flagName of REQUIRED_HARD_PARITY_FLAGS) {
        if (hardParity[flagName] !== true) {
          pushError(
            errors,
            'E_XPLAT_PARITY_BASELINE_HARD_PARITY_FALSE',
            `baseline.hardParity.${flagName}`,
            `Expected hardParity.${flagName}=true.`,
          );
        }
      }
    }

    const testedPlatforms = isObjectRecord(baselineDoc.testedPlatforms) ? baselineDoc.testedPlatforms : null;
    if (!testedPlatforms) {
      pushError(
        errors,
        'E_XPLAT_PARITY_BASELINE_TESTED_PLATFORMS_INVALID',
        'baseline.testedPlatforms',
        'testedPlatforms must be an object map.',
      );
    } else {
      if (String(testedPlatforms.win || '').trim() !== 'subset') {
        pushError(
          errors,
          'E_XPLAT_PARITY_BASELINE_PLATFORM_SCOPE_INVALID',
          'baseline.testedPlatforms.win',
          'Expected testedPlatforms.win="subset".',
        );
      }
      if (String(testedPlatforms.linux || '').trim() !== 'subset') {
        pushError(
          errors,
          'E_XPLAT_PARITY_BASELINE_PLATFORM_SCOPE_INVALID',
          'baseline.testedPlatforms.linux',
          'Expected testedPlatforms.linux="subset".',
        );
      }
      if (Object.prototype.hasOwnProperty.call(testedPlatforms, 'web')) {
        pushError(
          errors,
          'E_XPLAT_PARITY_BASELINE_FORBIDDEN_PLATFORM',
          'baseline.testedPlatforms.web',
          'Web platform is forbidden for X1 hard parity baseline.',
        );
      }
      if (Object.prototype.hasOwnProperty.call(testedPlatforms, 'mobile')) {
        pushError(
          errors,
          'E_XPLAT_PARITY_BASELINE_FORBIDDEN_PLATFORM',
          'baseline.testedPlatforms.mobile',
          'Mobile platform is forbidden for X1 hard parity baseline.',
        );
      }
    }
  }

  if (!metricsDoc) {
    pushError(
      errors,
      'E_XPLAT_STAGE_METRICS_UNREADABLE',
      'metrics',
      'Unable to read XPLAT stage metrics JSON.',
    );
  } else {
    const schemaVersion = String(metricsDoc.schemaVersion || '').trim();
    if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
      pushError(
        errors,
        'E_XPLAT_STAGE_METRICS_SCHEMA_VERSION_INVALID',
        'metrics.schemaVersion',
        `Expected schemaVersion=${EXPECTED_SCHEMA_VERSION}.`,
      );
    }

    const x1Evidence = isObjectRecord(metricsDoc.stageEvidence) && isObjectRecord(metricsDoc.stageEvidence.X1)
      ? metricsDoc.stageEvidence.X1
      : null;
    if (!x1Evidence) {
      pushError(
        errors,
        'E_XPLAT_STAGE_METRICS_X1_EVIDENCE_MISSING',
        'metrics.stageEvidence.X1',
        'Expected stageEvidence.X1 object.',
      );
    } else {
      const x1MetricsRef = String(x1Evidence.metricsRef || '').trim();
      if (x1MetricsRef !== EXPECTED_METRICS_REF) {
        pushError(
          errors,
          'E_XPLAT_STAGE_METRICS_REF_MISMATCH',
          'metrics.stageEvidence.X1.metricsRef',
          `Expected metricsRef=${EXPECTED_METRICS_REF}.`,
        );
      }

      if (typeof x1Evidence.parityPassRatePct !== 'number' || !Number.isFinite(x1Evidence.parityPassRatePct)
        || x1Evidence.parityPassRatePct < 100) {
        pushError(
          errors,
          'E_XPLAT_STAGE_METRICS_PARITY_THRESHOLD_FAIL',
          'metrics.stageEvidence.X1.parityPassRatePct',
          'Expected parityPassRatePct >= 100 for X1 hard baseline.',
        );
      }

      if (x1Evidence.flakyRatePct !== 0) {
        pushError(
          errors,
          'E_XPLAT_STAGE_METRICS_FLAKY_NONZERO',
          'metrics.stageEvidence.X1.flakyRatePct',
          'Expected flakyRatePct = 0 for X1 hard baseline.',
        );
      }

      if (typeof x1Evidence.maxDocSizeMb !== 'number' || !Number.isFinite(x1Evidence.maxDocSizeMb)
        || x1Evidence.maxDocSizeMb < 0) {
        pushError(
          errors,
          'E_XPLAT_STAGE_METRICS_MAX_DOC_SIZE_INVALID',
          'metrics.stageEvidence.X1.maxDocSizeMb',
          'Expected finite non-negative maxDocSizeMb for X1 hard baseline.',
        );
      }
    }
  }

  const sortedErrors = sortErrors(errors);
  const ok = sortedErrors.length === 0;
  return {
    XPLAT_PARITY_BASELINE_VALID_OK: ok ? 1 : 0,
    stageId,
    concurrencyUnit,
    metricsRef,
    errors: sortedErrors,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    baselinePath: '',
    metricsPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--baseline-path' && i + 1 < argv.length) {
      out.baselinePath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--metrics-path' && i + 1 < argv.length) {
      out.metricsPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`XPLAT_PARITY_BASELINE_STAGE_ID=${state.stageId || ''}`);
  console.log(`XPLAT_PARITY_BASELINE_CONCURRENCY_UNIT=${state.concurrencyUnit || ''}`);
  console.log(`XPLAT_PARITY_BASELINE_METRICS_REF=${state.metricsRef || ''}`);
  console.log(`XPLAT_PARITY_BASELINE_ERRORS=${JSON.stringify(state.errors)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateXplatParityBaselineState({
    baselinePath: args.baselinePath || undefined,
    metricsPath: args.metricsPath || undefined,
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
