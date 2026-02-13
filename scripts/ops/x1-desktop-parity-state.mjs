#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runX1DesktopParityHarness } from './x1-desktop-parity-harness.mjs';

const TOKEN_NAME = 'X1_DESKTOP_PARITY_STATE_OK';
const FAIL_CODE = 'E_X1_DESKTOP_PARITY_RUNTIME_INVALID';
const EXPECTED_SCHEMA_VERSION = 'v3.12';
const DEFAULT_METRICS_PATH = 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json';
const SUPPORTED_PLATFORMS = new Set(['win', 'linux', 'darwin']);

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

function toFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readRequiredNumber(errors, source, key, issuePath) {
  const value = toFiniteNumber(source?.[key]);
  if (value === null) {
    pushError(errors, 'E_X1_PARITY_REPORT_FIELD_REQUIRED', issuePath, `${key} is required and must be finite.`);
    return null;
  }
  return value;
}

function parseX1MetricsThresholds(metricsDoc, errors) {
  if (!metricsDoc) {
    pushError(errors, 'E_X1_PARITY_METRICS_UNREADABLE', 'metrics', 'Unable to read stage metrics JSON.');
    return null;
  }

  const schemaVersion = String(metricsDoc.schemaVersion || '').trim();
  if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    pushError(
      errors,
      'E_X1_PARITY_METRICS_SCHEMA_VERSION_INVALID',
      'metrics.schemaVersion',
      `Expected schemaVersion=${EXPECTED_SCHEMA_VERSION}.`,
    );
  }

  const stageEvidence = isObjectRecord(metricsDoc.stageEvidence) ? metricsDoc.stageEvidence : null;
  const x1Evidence = stageEvidence && isObjectRecord(stageEvidence.X1) ? stageEvidence.X1 : null;
  if (!x1Evidence) {
    pushError(errors, 'E_X1_PARITY_METRICS_X1_MISSING', 'metrics.stageEvidence.X1', 'Missing X1 stage evidence.');
    return null;
  }

  const runtimeParityRef = String(x1Evidence.x1RuntimeParityRef || '').trim();
  if (!runtimeParityRef) {
    pushError(
      errors,
      'E_X1_PARITY_RUNTIME_REF_MISSING',
      'metrics.stageEvidence.X1.x1RuntimeParityRef',
      'x1RuntimeParityRef is required.',
    );
  }

  const runtimeParityPassPct = toFiniteNumber(x1Evidence.runtimeParityPassPct);
  if (runtimeParityPassPct === null || runtimeParityPassPct < 0 || runtimeParityPassPct > 100) {
    pushError(
      errors,
      'E_X1_PARITY_RUNTIME_PASS_THRESHOLD_INVALID',
      'metrics.stageEvidence.X1.runtimeParityPassPct',
      'runtimeParityPassPct must be in range 0..100.',
    );
  }

  const flakyRatePct = toFiniteNumber(x1Evidence.flakyRatePct);
  if (flakyRatePct === null || flakyRatePct < 0 || flakyRatePct > 100) {
    pushError(
      errors,
      'E_X1_PARITY_FLAKY_THRESHOLD_INVALID',
      'metrics.stageEvidence.X1.flakyRatePct',
      'flakyRatePct must be in range 0..100.',
    );
  }

  const maxDocSizeMb = toFiniteNumber(x1Evidence.maxDocSizeMb);
  if (maxDocSizeMb === null || maxDocSizeMb < 0) {
    pushError(
      errors,
      'E_X1_PARITY_DOC_SIZE_THRESHOLD_INVALID',
      'metrics.stageEvidence.X1.maxDocSizeMb',
      'maxDocSizeMb must be a finite number >= 0.',
    );
  }

  return {
    metricsEvidenceRef: String(x1Evidence.metricsRef || '').trim() || null,
    runtimeParityRef: runtimeParityRef || null,
    runtimeParityPassPct,
    flakyRatePct,
    maxDocSizeMb,
  };
}

function validateHarnessReport(report, errors) {
  if (!isObjectRecord(report)) {
    pushError(errors, 'E_X1_PARITY_HARNESS_INVALID', 'harness', 'Harness must return an object payload.');
    return {
      tokenOk: false,
      passPct: 0,
      runtimeParityPassPct: 0,
      flakyRatePct: 100,
      maxDocSizeMbVerified: Infinity,
      platform: 'unsupported',
      durationMs: 0,
      fails: 1,
      hardFailures: true,
    };
  }

  const tokenOk = report.X1_DESKTOP_PARITY_RUNTIME_OK === 1;
  const passPct = readRequiredNumber(errors, report, 'passPct', 'harness.passPct');
  const runtimeParityPassPct = readRequiredNumber(
    errors,
    report,
    'runtimeParityPassPct',
    'harness.runtimeParityPassPct',
  );
  const flakyRatePct = readRequiredNumber(errors, report, 'flakyRatePct', 'harness.flakyRatePct');
  const maxDocSizeMbVerified = readRequiredNumber(
    errors,
    report,
    'maxDocSizeMbVerified',
    'harness.maxDocSizeMbVerified',
  );
  const durationMs = readRequiredNumber(errors, report, 'durationMs', 'harness.durationMs');
  const fails = readRequiredNumber(errors, report, 'fails', 'harness.fails');

  const platform = String(report.platform || '').trim();
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    pushError(
      errors,
      'E_X1_PARITY_PLATFORM_UNSUPPORTED',
      'harness.platform',
      `Unsupported platform reported by harness: ${platform || 'empty'}.`,
    );
  }

  if (!tokenOk) {
    pushError(
      errors,
      'E_X1_PARITY_HARNESS_FAILED',
      'harness.X1_DESKTOP_PARITY_RUNTIME_OK',
      'Harness reported runtime failure.',
    );
  }

  if (passPct !== null && (passPct < 0 || passPct > 100)) {
    pushError(errors, 'E_X1_PARITY_PASS_PCT_INVALID', 'harness.passPct', 'passPct must be in range 0..100.');
  }
  if (runtimeParityPassPct !== null && (runtimeParityPassPct < 0 || runtimeParityPassPct > 100)) {
    pushError(
      errors,
      'E_X1_PARITY_RUNTIME_PASS_PCT_INVALID',
      'harness.runtimeParityPassPct',
      'runtimeParityPassPct must be in range 0..100.',
    );
  }
  if (flakyRatePct !== null && (flakyRatePct < 0 || flakyRatePct > 100)) {
    pushError(
      errors,
      'E_X1_PARITY_FLAKY_RATE_INVALID',
      'harness.flakyRatePct',
      'flakyRatePct must be in range 0..100.',
    );
  }
  if (maxDocSizeMbVerified !== null && maxDocSizeMbVerified < 0) {
    pushError(
      errors,
      'E_X1_PARITY_DOC_SIZE_INVALID',
      'harness.maxDocSizeMbVerified',
      'maxDocSizeMbVerified must be >= 0.',
    );
  }

  const passPctValue = passPct ?? 0;
  if (passPctValue < 100) {
    pushError(
      errors,
      'E_X1_PARITY_PASS_PCT_NOT_FULL',
      'harness.passPct',
      `passPct must be 100 for X1 hard parity. observed=${passPctValue}.`,
    );
  }

  const failCountValue = fails ?? 1;
  if (failCountValue > 0) {
    pushError(
      errors,
      'E_X1_PARITY_FAIL_COUNT_NONZERO',
      'harness.fails',
      `Harness reported ${failCountValue} failing checks.`,
    );
  }

  return {
    tokenOk,
    passPct: passPctValue,
    runtimeParityPassPct: runtimeParityPassPct ?? 0,
    flakyRatePct: flakyRatePct ?? 100,
    maxDocSizeMbVerified: maxDocSizeMbVerified ?? Infinity,
    platform,
    durationMs: durationMs ?? 0,
    fails: failCountValue,
    hardFailures: failCountValue > 0 || !tokenOk,
  };
}

export async function evaluateX1DesktopParityState(input = {}) {
  const metricsPath = String(input.metricsPath || process.env.XPLAT_STAGE_METRICS_PATH || DEFAULT_METRICS_PATH).trim();
  const metricsDoc = isObjectRecord(input.metricsDoc) ? input.metricsDoc : readJsonObject(metricsPath);

  const errors = [];
  const thresholds = parseX1MetricsThresholds(metricsDoc, errors);

  const runHarness = typeof input.harnessRunner === 'function'
    ? input.harnessRunner
    : runX1DesktopParityHarness;

  let harnessState = isObjectRecord(input.harnessState) ? input.harnessState : null;
  if (!harnessState) {
    try {
      harnessState = await runHarness({
        workDir: input.workDir,
        repeat: input.repeat,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      harnessState = {
        X1_DESKTOP_PARITY_RUNTIME_OK: 0,
        passPct: 0,
        runtimeParityPassPct: 0,
        flakyRatePct: 100,
        maxDocSizeMbVerified: Infinity,
        durationMs: 0,
        platform: 'unsupported',
        fails: 1,
        failSignalCode: FAIL_CODE,
        failSignal: {
          code: FAIL_CODE,
          details: { message },
        },
      };
      pushError(
        errors,
        'E_X1_PARITY_HARNESS_EXCEPTION',
        'harness',
        message,
      );
    }
  }

  const observed = validateHarnessReport(harnessState, errors);

  if (thresholds) {
    if (typeof thresholds.runtimeParityPassPct === 'number'
      && observed.runtimeParityPassPct < thresholds.runtimeParityPassPct) {
      pushError(
        errors,
        'E_X1_PARITY_RUNTIME_PCT_BELOW_THRESHOLD',
        'threshold.runtimeParityPassPct',
        `Observed runtime parity pass pct ${observed.runtimeParityPassPct} is below threshold ${thresholds.runtimeParityPassPct}.`,
      );
    }

    if (typeof thresholds.flakyRatePct === 'number' && observed.flakyRatePct > thresholds.flakyRatePct) {
      pushError(
        errors,
        'E_X1_PARITY_FLAKY_RATE_ABOVE_THRESHOLD',
        'threshold.flakyRatePct',
        `Observed flakyRatePct ${observed.flakyRatePct} exceeds threshold ${thresholds.flakyRatePct}.`,
      );
    }

    if (typeof thresholds.maxDocSizeMb === 'number' && observed.maxDocSizeMbVerified > thresholds.maxDocSizeMb) {
      pushError(
        errors,
        'E_X1_PARITY_DOC_SIZE_ABOVE_THRESHOLD',
        'threshold.maxDocSizeMb',
        `Observed maxDocSizeMbVerified ${observed.maxDocSizeMbVerified} exceeds threshold ${thresholds.maxDocSizeMb}.`,
      );
    }
  }

  const sortedErrors = sortErrors(errors);
  const ok = sortedErrors.length === 0;

  return {
    [TOKEN_NAME]: ok ? 1 : 0,
    X1_DESKTOP_PARITY_PASS_PCT: observed.passPct,
    X1_DESKTOP_PARITY_PLATFORM: observed.platform,
    metricsEvidenceRef: thresholds?.metricsEvidenceRef || null,
    runtimeParityRef: thresholds?.runtimeParityRef || null,
    thresholds: thresholds
      ? {
          runtimeParityPassPct: thresholds.runtimeParityPassPct,
          flakyRatePct: thresholds.flakyRatePct,
          maxDocSizeMb: thresholds.maxDocSizeMb,
        }
      : null,
    observed: {
      runtimeParityPassPct: observed.runtimeParityPassPct,
      passPct: observed.passPct,
      flakyRatePct: observed.flakyRatePct,
      maxDocSizeMbVerified: Number.isFinite(observed.maxDocSizeMbVerified)
        ? observed.maxDocSizeMbVerified
        : null,
      platform: observed.platform,
      fails: observed.fails,
      durationMs: observed.durationMs,
    },
    failSignalCode: ok ? '' : FAIL_CODE,
    failSignal: ok
      ? null
      : {
          code: FAIL_CODE,
          details: {
            errors: sortedErrors,
          },
        },
    errors: sortedErrors,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    metricsPath: '',
    workDir: '',
    repeat: 1,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--metrics-path' && i + 1 < argv.length) {
      out.metricsPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--work-dir' && i + 1 < argv.length) {
      out.workDir = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--repeat' && i + 1 < argv.length) {
      const repeat = Number.parseInt(String(argv[i + 1]), 10);
      out.repeat = Number.isInteger(repeat) && repeat >= 1 ? repeat : 1;
      i += 1;
    }
  }

  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`X1_DESKTOP_PARITY_PASS_PCT=${state.X1_DESKTOP_PARITY_PASS_PCT}`);
  console.log(`X1_DESKTOP_PARITY_PLATFORM=${state.X1_DESKTOP_PARITY_PLATFORM}`);
  console.log(`X1_RUNTIME_PARITY_REF=${state.runtimeParityRef || ''}`);
  console.log(`X1_RUNTIME_METRICS_REF=${state.metricsEvidenceRef || ''}`);
  console.log(`X1_RUNTIME_FLAKY_RATE_PCT=${state.observed.flakyRatePct}`);
  console.log(`X1_RUNTIME_MAX_DOC_SIZE_MB=${state.observed.maxDocSizeMbVerified ?? ''}`);
  console.log(`X1_RUNTIME_DURATION_MS=${state.observed.durationMs}`);
  if (state.failSignalCode) {
    console.log(`FAIL_REASON=${state.failSignalCode}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = await evaluateX1DesktopParityState({
    metricsPath: args.metricsPath || undefined,
    workDir: args.workDir || undefined,
    repeat: args.repeat,
  });

  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }

  process.exit(state[TOKEN_NAME] === 1 ? 0 : 1);
}

if (process.argv[1]) {
  const entrypointPath = path.resolve(process.argv[1]);
  if (fileURLToPath(import.meta.url) === entrypointPath) {
    main().catch((error) => {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    });
  }
}
