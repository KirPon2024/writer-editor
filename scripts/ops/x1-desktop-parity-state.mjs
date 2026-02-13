#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runX1DesktopParityHarness } from './x1-desktop-parity-harness.mjs';

const TOKEN_NAME = 'X1_DESKTOP_PARITY_STATE_OK';
const FAIL_CODE = 'E_X1_DESKTOP_PARITY_RUNTIME_INVALID';
const EXPECTED_SCHEMA_VERSION = 'v3.12';
const DEFAULT_METRICS_PATH = 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json';

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

export function evaluateX1DesktopParityState(input = {}) {
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
      harnessState = runHarness({
        workDir: input.workDir,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      harnessState = {
        X1_DESKTOP_PARITY_RUNTIME_OK: 0,
        roundtripOk: false,
        exportImportOk: false,
        normalizationOk: false,
        durationMs: 0,
        docSizeMb: Infinity,
        flakyRatePct: 0,
        runtimeParityPassPct: 0,
        failSignalCode: FAIL_CODE,
        failSignal: {
          code: FAIL_CODE,
          details: { message },
        },
        errors: [
          {
            code: 'E_X1_DESKTOP_PARITY_HARNESS_EXCEPTION',
            path: 'harness',
            message,
          },
        ],
      };
    }
  }

  if (!isObjectRecord(harnessState)) {
    pushError(errors, 'E_X1_PARITY_HARNESS_INVALID', 'harness', 'Harness must return an object payload.');
  }

  const runtimeOk = isObjectRecord(harnessState) && harnessState.X1_DESKTOP_PARITY_RUNTIME_OK === 1;
  const roundtripOk = isObjectRecord(harnessState) && harnessState.roundtripOk === true;
  const exportImportOk = isObjectRecord(harnessState) && harnessState.exportImportOk === true;
  const normalizationOk = isObjectRecord(harnessState) && harnessState.normalizationOk === true;
  const durationMs = isObjectRecord(harnessState) ? Number(harnessState.durationMs || 0) : 0;
  const observedRuntimeParityPassPct = runtimeOk ? 100 : 0;
  const observedFlakyRatePct = isObjectRecord(harnessState)
    ? Number.isFinite(Number(harnessState.flakyRatePct))
      ? Number(harnessState.flakyRatePct)
      : 0
    : 0;
  const observedDocSizeMb = isObjectRecord(harnessState)
    ? Number.isFinite(Number(harnessState.docSizeMb))
      ? Number(harnessState.docSizeMb)
      : Infinity
    : Infinity;

  if (!runtimeOk) {
    pushError(errors, 'E_X1_PARITY_HARNESS_FAILED', 'harness.X1_DESKTOP_PARITY_RUNTIME_OK', 'Harness returned runtime failure.');
  }
  if (!roundtripOk) {
    pushError(errors, 'E_X1_PARITY_ROUNDTRIP_FAILED', 'harness.roundtripOk', 'Roundtrip invariant failed.');
  }
  if (!exportImportOk) {
    pushError(errors, 'E_X1_PARITY_EXPORT_IMPORT_FAILED', 'harness.exportImportOk', 'Export/import invariant failed.');
  }
  if (!normalizationOk) {
    pushError(errors, 'E_X1_PARITY_NORMALIZATION_FAILED', 'harness.normalizationOk', 'Normalization invariant failed.');
  }

  if (thresholds) {
    if (typeof thresholds.runtimeParityPassPct === 'number'
      && observedRuntimeParityPassPct < thresholds.runtimeParityPassPct) {
      pushError(
        errors,
        'E_X1_PARITY_RUNTIME_PCT_BELOW_THRESHOLD',
        'threshold.runtimeParityPassPct',
        `Observed runtime parity pass pct ${observedRuntimeParityPassPct} is below threshold ${thresholds.runtimeParityPassPct}.`,
      );
    }

    if (typeof thresholds.flakyRatePct === 'number' && observedFlakyRatePct > thresholds.flakyRatePct) {
      pushError(
        errors,
        'E_X1_PARITY_FLAKY_RATE_ABOVE_THRESHOLD',
        'threshold.flakyRatePct',
        `Observed flakyRatePct ${observedFlakyRatePct} exceeds threshold ${thresholds.flakyRatePct}.`,
      );
    }

    if (typeof thresholds.maxDocSizeMb === 'number' && observedDocSizeMb > thresholds.maxDocSizeMb) {
      pushError(
        errors,
        'E_X1_PARITY_DOC_SIZE_ABOVE_THRESHOLD',
        'threshold.maxDocSizeMb',
        `Observed docSizeMb ${observedDocSizeMb} exceeds threshold ${thresholds.maxDocSizeMb}.`,
      );
    }
  }

  const sortedErrors = sortErrors(errors);
  const ok = sortedErrors.length === 0;
  return {
    [TOKEN_NAME]: ok ? 1 : 0,
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
      runtimeParityPassPct: observedRuntimeParityPassPct,
      flakyRatePct: observedFlakyRatePct,
      docSizeMb: Number.isFinite(observedDocSizeMb) ? observedDocSizeMb : null,
      durationMs,
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
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--metrics-path' && i + 1 < argv.length) {
      out.metricsPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--work-dir' && i + 1 < argv.length) {
      out.workDir = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`X1_RUNTIME_PARITY_REF=${state.runtimeParityRef || ''}`);
  console.log(`X1_RUNTIME_METRICS_REF=${state.metricsEvidenceRef || ''}`);
  console.log(`X1_RUNTIME_PARITY_PASS_PCT=${state.observed.runtimeParityPassPct}`);
  console.log(`X1_RUNTIME_FLAKY_RATE_PCT=${state.observed.flakyRatePct}`);
  console.log(`X1_RUNTIME_DOC_SIZE_MB=${state.observed.docSizeMb ?? ''}`);
  console.log(`X1_RUNTIME_DURATION_MS=${state.observed.durationMs}`);
  if (state.failSignalCode) {
    console.log(`FAIL_REASON=${state.failSignalCode}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateX1DesktopParityState({
    metricsPath: args.metricsPath || undefined,
    workDir: args.workDir || undefined,
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
    main();
  }
}
