#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runX2WebParityHarness } from './x2-web-parity-harness.mjs';

const TOKEN_NAME = 'X2_WEB_PARITY_STATE_OK';
const FAIL_CODE = 'E_X2_WEB_PARITY_CONTRACT_INVALID';
const EXPECTED_SCHEMA_VERSION = 'v3.12';
const DEFAULT_METRICS_PATH = 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json';
const DEFAULT_ROLLOUT_PATH = 'docs/OPS/STATUS/XPLAT_ROLLOUT_PLAN_v3_12.json';
const REQUIRED_P95_METRICS = Object.freeze(['openP95Ms', 'saveP95Ms', 'reopenP95Ms', 'exportP95Ms']);
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

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
    pushError(errors, 'E_X2_WEB_PARITY_REPORT_FIELD_REQUIRED', issuePath, `${key} is required and must be finite.`);
    return null;
  }
  return value;
}

function parseX2Binding(metricsDoc, errors) {
  if (!metricsDoc) {
    pushError(errors, 'E_X2_WEB_PARITY_METRICS_UNREADABLE', 'metrics', 'Unable to read stage metrics JSON.');
    return null;
  }

  const schemaVersion = String(metricsDoc.schemaVersion || '').trim();
  if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    pushError(
      errors,
      'E_X2_WEB_PARITY_METRICS_SCHEMA_VERSION_INVALID',
      'metrics.schemaVersion',
      `Expected schemaVersion=${EXPECTED_SCHEMA_VERSION}.`,
    );
  }

  const x2Evidence = isObjectRecord(metricsDoc.stageEvidence) && isObjectRecord(metricsDoc.stageEvidence.X2)
    ? metricsDoc.stageEvidence.X2
    : null;
  if (!x2Evidence) {
    pushError(errors, 'E_X2_WEB_PARITY_METRICS_X2_MISSING', 'metrics.stageEvidence.X2', 'Missing X2 stage evidence.');
    return null;
  }

  const requiredStrings = [
    ['metricsRef', 'E_X2_WEB_PARITY_BINDING_METRICS_REF_MISSING'],
    ['x2WebRuntimeParityRef', 'E_X2_WEB_PARITY_BINDING_REF_MISSING'],
    ['x2WebRuntimeParityHarnessRef', 'E_X2_WEB_PARITY_BINDING_HARNESS_REF_MISSING'],
    ['proofHook', 'E_X2_WEB_PARITY_BINDING_PROOFHOOK_MISSING'],
    ['sourceBinding', 'E_X2_WEB_PARITY_BINDING_SOURCE_MISSING'],
    ['metricSourceBinding', 'E_X2_WEB_PARITY_BINDING_METRIC_SOURCE_MISSING'],
    ['failSignalCode', 'E_X2_WEB_PARITY_BINDING_FAIL_SIGNAL_MISSING'],
    ['positiveContractRef', 'E_X2_WEB_PARITY_BINDING_POSITIVE_CONTRACT_MISSING'],
    ['negativeContractRef', 'E_X2_WEB_PARITY_BINDING_NEGATIVE_CONTRACT_MISSING'],
  ];

  for (const [key, code] of requiredStrings) {
    const value = String(x2Evidence[key] || '').trim();
    if (!value) {
      pushError(errors, code, `metrics.stageEvidence.X2.${key}`, `${key} is required.`);
    }
  }

  const failSignalCode = String(x2Evidence.failSignalCode || '').trim();
  if (failSignalCode && failSignalCode !== FAIL_CODE) {
    pushError(
      errors,
      'E_X2_WEB_PARITY_BINDING_FAIL_SIGNAL_INVALID',
      'metrics.stageEvidence.X2.failSignalCode',
      `failSignalCode must equal ${FAIL_CODE}.`,
    );
  }

  const closureSha = String(x2Evidence.proofHookClosureSha256 || '').trim().toLowerCase();
  if (!SHA256_HEX_RE.test(closureSha)) {
    pushError(
      errors,
      'E_X2_WEB_PARITY_BINDING_CLOSURE_SHA_INVALID',
      'metrics.stageEvidence.X2.proofHookClosureSha256',
      'proofHookClosureSha256 must be a raw-byte sha256 hex string.',
    );
  }

  const requiredP95Metrics = Array.isArray(x2Evidence.requiredP95Metrics)
    ? x2Evidence.requiredP95Metrics.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  if (requiredP95Metrics.length === 0) {
    pushError(
      errors,
      'E_X2_WEB_PARITY_BINDING_REQUIRED_P95_MISSING',
      'metrics.stageEvidence.X2.requiredP95Metrics',
      'requiredP95Metrics must be a non-empty string array.',
    );
  }

  for (const metric of REQUIRED_P95_METRICS) {
    if (!requiredP95Metrics.includes(metric)) {
      pushError(
        errors,
        'E_X2_WEB_PARITY_BINDING_REQUIRED_P95_INCOMPLETE',
        'metrics.stageEvidence.X2.requiredP95Metrics',
        `requiredP95Metrics must include ${metric}.`,
      );
    }
  }

  const flakyRatePctThreshold = Object.prototype.hasOwnProperty.call(x2Evidence, 'flakyRatePctThreshold')
    ? toFiniteNumber(x2Evidence.flakyRatePctThreshold)
    : null;
  if (Object.prototype.hasOwnProperty.call(x2Evidence, 'flakyRatePctThreshold') && flakyRatePctThreshold === null) {
    pushError(
      errors,
      'E_X2_WEB_PARITY_BINDING_FLAKY_THRESHOLD_INVALID',
      'metrics.stageEvidence.X2.flakyRatePctThreshold',
      'flakyRatePctThreshold must be finite when provided.',
    );
  }

  return {
    requiredP95Metrics: requiredP95Metrics.length > 0 ? requiredP95Metrics : [...REQUIRED_P95_METRICS],
    flakyRatePctThreshold,
  };
}

function validateRolloutStage(rolloutDoc, errors) {
  if (!rolloutDoc) {
    pushError(errors, 'E_X2_WEB_PARITY_ROLLOUT_UNREADABLE', 'rollout', 'Unable to read rollout plan JSON.');
    return '';
  }

  const activeStageId = String(rolloutDoc.activeStageId || '').trim();
  if (activeStageId !== 'X2') {
    pushError(
      errors,
      'E_X2_WEB_PARITY_STAGE_NOT_ACTIVE',
      'rollout.activeStageId',
      `activeStageId must be X2. observed=${activeStageId || 'empty'}.`,
    );
  }
  return activeStageId;
}

function validateReport(report, binding, errors) {
  if (!isObjectRecord(report)) {
    pushError(errors, 'E_X2_WEB_PARITY_REPORT_INVALID', 'harness', 'Harness report must be an object payload.');
    return {
      passPct: 0,
      flakyRatePct: 100,
      p95: {
        openP95Ms: 0,
        saveP95Ms: 0,
        reopenP95Ms: 0,
        exportP95Ms: 0,
      },
    };
  }

  if (report.X2_WEB_RUNTIME_PARITY_OK !== 1) {
    pushError(
      errors,
      'E_X2_WEB_PARITY_HARNESS_TOKEN_FAIL',
      'harness.X2_WEB_RUNTIME_PARITY_OK',
      'Harness reported non-green token.',
    );
  }

  const reportVersion = String(report.reportVersion || '').trim();
  if (!reportVersion) {
    pushError(errors, 'E_X2_WEB_PARITY_REPORT_VERSION_MISSING', 'harness.reportVersion', 'reportVersion is required.');
  }

  const platform = String(report.platform || '').trim();
  if (!platform) {
    pushError(errors, 'E_X2_WEB_PARITY_PLATFORM_MISSING', 'harness.platform', 'platform field is required.');
  }

  const passPct = readRequiredNumber(errors, report, 'passPct', 'harness.passPct');
  const flakyRatePct = readRequiredNumber(errors, report, 'flakyRatePct', 'harness.flakyRatePct');

  if (passPct !== null && passPct !== 100) {
    pushError(
      errors,
      'E_X2_WEB_PARITY_PASS_PCT_NOT_FULL',
      'harness.passPct',
      `passPct must be exactly 100. observed=${passPct}.`,
    );
  }

  if (flakyRatePct !== null && (flakyRatePct < 0 || flakyRatePct > 100)) {
    pushError(
      errors,
      'E_X2_WEB_PARITY_FLAKY_RATE_INVALID',
      'harness.flakyRatePct',
      'flakyRatePct must be in range 0..100.',
    );
  }

  if (flakyRatePct !== null && typeof binding?.flakyRatePctThreshold === 'number'
    && flakyRatePct > binding.flakyRatePctThreshold) {
    pushError(
      errors,
      'E_X2_WEB_PARITY_FLAKY_THRESHOLD_EXCEEDED',
      'harness.flakyRatePct',
      `flakyRatePct ${flakyRatePct} exceeds threshold ${binding.flakyRatePctThreshold}.`,
    );
  }

  const p95 = {};
  const requiredP95Metrics = Array.isArray(binding?.requiredP95Metrics)
    ? binding.requiredP95Metrics
    : REQUIRED_P95_METRICS;

  for (const metric of requiredP95Metrics) {
    const value = readRequiredNumber(errors, report, metric, `harness.${metric}`);
    if (value !== null && value <= 0) {
      pushError(
        errors,
        'E_X2_WEB_PARITY_P95_NON_POSITIVE',
        `harness.${metric}`,
        `${metric} must be > 0.`,
      );
    }
    p95[metric] = value ?? 0;
  }

  return {
    passPct: passPct ?? 0,
    flakyRatePct: flakyRatePct ?? 100,
    p95,
  };
}

export async function evaluateX2WebParityState(input = {}) {
  const metricsPath = String(input.metricsPath || process.env.X2_WEB_PARITY_METRICS_PATH || DEFAULT_METRICS_PATH).trim();
  const rolloutPath = String(input.rolloutPath || process.env.X2_WEB_PARITY_ROLLOUT_PATH || DEFAULT_ROLLOUT_PATH).trim();
  const reportPath = String(input.reportPath || process.env.X2_WEB_PARITY_REPORT_PATH || '').trim();
  const repeat = Number.parseInt(String(input.repeat ?? process.env.X2_WEB_PARITY_REPEAT ?? ''), 10);

  const metricsDoc = isObjectRecord(input.metricsDoc) ? input.metricsDoc : readJsonObject(metricsPath);
  const rolloutDoc = isObjectRecord(input.rolloutDoc) ? input.rolloutDoc : readJsonObject(rolloutPath);
  const errors = [];

  const binding = parseX2Binding(metricsDoc, errors);
  const activeStageId = validateRolloutStage(rolloutDoc, errors);

  let reportDoc = isObjectRecord(input.reportDoc) ? input.reportDoc : null;
  if (!reportDoc && reportPath) {
    reportDoc = readJsonObject(reportPath);
    if (!reportDoc) {
      pushError(
        errors,
        'E_X2_WEB_PARITY_REPORT_UNREADABLE',
        'harness',
        `Unable to read report JSON from path: ${reportPath}`,
      );
    }
  }

  if (!reportDoc) {
    try {
      const harnessRunner = typeof input.harnessRunner === 'function' ? input.harnessRunner : runX2WebParityHarness;
      reportDoc = await harnessRunner({
        workDir: input.workDir,
        repeat: Number.isInteger(repeat) && repeat > 0 ? repeat : undefined,
      });
    } catch (error) {
      pushError(
        errors,
        'E_X2_WEB_PARITY_HARNESS_EXECUTION_FAILED',
        'harness',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const observed = validateReport(reportDoc, binding, errors);
  const sortedErrors = sortErrors(errors);
  const ok = sortedErrors.length === 0;

  return {
    [TOKEN_NAME]: ok ? 1 : 0,
    X2_WEB_PARITY_PASS_PCT: observed.passPct,
    X2_WEB_PARITY_FLAKY_RATE_PCT: observed.flakyRatePct,
    X2_WEB_PARITY_P95: observed.p95,
    activeStageId: activeStageId || null,
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
    rolloutPath: '',
    reportPath: '',
    repeat: 0,
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
    if (arg === '--rollout-path' && i + 1 < argv.length) {
      out.rolloutPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--report-path' && i + 1 < argv.length) {
      out.reportPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--repeat' && i + 1 < argv.length) {
      out.repeat = Number.parseInt(String(argv[i + 1] || '0'), 10);
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`X2_WEB_PARITY_PASS_PCT=${state.X2_WEB_PARITY_PASS_PCT}`);
  console.log(`X2_WEB_PARITY_FLAKY_RATE_PCT=${state.X2_WEB_PARITY_FLAKY_RATE_PCT}`);
  console.log(`X2_WEB_PARITY_ACTIVE_STAGE_ID=${state.activeStageId || ''}`);
  console.log(`X2_WEB_PARITY_P95=${JSON.stringify(state.X2_WEB_PARITY_P95)}`);
  if (state.failSignalCode) {
    console.log(`FAIL_REASON=${state.failSignalCode}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = await evaluateX2WebParityState({
    metricsPath: args.metricsPath || undefined,
    rolloutPath: args.rolloutPath || undefined,
    reportPath: args.reportPath || undefined,
    repeat: args.repeat > 0 ? args.repeat : undefined,
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
  main().catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
