#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'X3_READINESS_GATE_OK';
const EXPECTED_SCHEMA_VERSION = 'v3.12';
const REQUIRED_STAGE = 'X2';
const REQUIRED_METRIC = 'resumeRecoverySmokePass';
const DEFAULT_METRICS_PATH = 'docs/OPS/STATUS/XPLAT_STAGE_METRICS_v3_12.json';
const DEFAULT_ROLLOUT_PATH = 'docs/OPS/STATUS/XPLAT_ROLLOUT_PLAN_v3_12.json';

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

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || '').trim()).filter(Boolean);
}

export function evaluateX3ReadinessGateState(input = {}) {
  const metricsPath = String(
    input.metricsPath || process.env.X3_READINESS_METRICS_PATH || DEFAULT_METRICS_PATH,
  ).trim();
  const rolloutPath = String(
    input.rolloutPath || process.env.X3_READINESS_ROLLOUT_PATH || DEFAULT_ROLLOUT_PATH,
  ).trim();

  const errors = [];
  const metricsDoc = isObjectRecord(input.metricsDoc) ? input.metricsDoc : readJsonObject(metricsPath);
  const rolloutDoc = isObjectRecord(input.rolloutDoc) ? input.rolloutDoc : readJsonObject(rolloutPath);
  let activeStageId = '';

  if (!metricsDoc) {
    pushError(errors, 'E_X3_METRICS_UNREADABLE', 'metrics', 'Unable to read XPLAT_STAGE_METRICS document.');
  } else {
    const metricsSchemaVersion = String(metricsDoc.schemaVersion || '').trim();
    if (metricsSchemaVersion !== EXPECTED_SCHEMA_VERSION) {
      pushError(
        errors,
        'E_X3_METRICS_SCHEMA_VERSION_INVALID',
        'metrics.schemaVersion',
        `Expected schemaVersion=${EXPECTED_SCHEMA_VERSION}.`,
      );
    }

    const x3Evidence = isObjectRecord(metricsDoc.stageEvidence) && isObjectRecord(metricsDoc.stageEvidence.X3)
      ? metricsDoc.stageEvidence.X3
      : null;
    if (!x3Evidence) {
      pushError(
        errors,
        'E_X3_STAGE_EVIDENCE_MISSING',
        'metrics.stageEvidence.X3',
        'Missing X3 stage evidence block.',
      );
    } else {
      const metricsRef = String(x3Evidence.metricsRef || '').trim();
      if (!metricsRef) {
        pushError(errors, 'E_X3_METRICS_REF_MISSING', 'metrics.stageEvidence.X3.metricsRef', 'metricsRef is required.');
      }

      const gateRef = String(x3Evidence.x3ReadinessGateRef || '').trim();
      if (!gateRef) {
        pushError(
          errors,
          'E_X3_GATE_REF_MISSING',
          'metrics.stageEvidence.X3.x3ReadinessGateRef',
          'x3ReadinessGateRef is required.',
        );
      }

      const requiredMinimumMetrics = toStringArray(x3Evidence.requiredMinimumMetrics);
      if (!requiredMinimumMetrics.includes(REQUIRED_METRIC)) {
        pushError(
          errors,
          'E_X3_REQUIRED_MIN_METRIC_MISSING',
          'metrics.stageEvidence.X3.requiredMinimumMetrics',
          `requiredMinimumMetrics must include ${REQUIRED_METRIC}.`,
        );
      }
    }

    const metricsCatalog = isObjectRecord(metricsDoc.metrics) ? metricsDoc.metrics : null;
    if (!metricsCatalog) {
      pushError(errors, 'E_X3_METRIC_CATALOG_MISSING', 'metrics.metrics', 'metrics catalog object is required.');
    } else {
      const metricDef = isObjectRecord(metricsCatalog[REQUIRED_METRIC]) ? metricsCatalog[REQUIRED_METRIC] : null;
      if (!metricDef) {
        pushError(
          errors,
          'E_X3_METRIC_DEF_MISSING',
          `metrics.metrics.${REQUIRED_METRIC}`,
          `${REQUIRED_METRIC} metric definition is required.`,
        );
      } else if (String(metricDef.type || '').trim() !== 'boolean') {
        pushError(
          errors,
          'E_X3_METRIC_DEF_TYPE_INVALID',
          `metrics.metrics.${REQUIRED_METRIC}.type`,
          `${REQUIRED_METRIC} metric type must be boolean.`,
        );
      }
    }
  }

  if (!rolloutDoc) {
    pushError(errors, 'E_X3_ROLLOUT_UNREADABLE', 'rollout', 'Unable to read rollout plan.');
  } else {
    activeStageId = String(rolloutDoc.activeStageId || '').trim();
    if (activeStageId !== REQUIRED_STAGE) {
      pushError(
        errors,
        'E_X3_ROLLOUT_STAGE_INVALID',
        'rollout.activeStageId',
        `activeStageId must remain ${REQUIRED_STAGE}. observed=${activeStageId || 'empty'}.`,
      );
    }
  }

  const sortedErrors = sortErrors(errors);
  const ok = sortedErrors.length === 0;
  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    failReason: ok ? '' : 'X3_READINESS_GATE_BLOCKED',
    activeStageId: activeStageId || null,
    requiredMetric: REQUIRED_METRIC,
    errors: sortedErrors,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    metricsPath: '',
    rolloutPath: '',
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
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`X3_READINESS_ACTIVE_STAGE=${state.activeStageId || ''}`);
  console.log(`X3_REQUIRED_METRIC=${state.requiredMetric}`);
  if (state.failReason) {
    console.log(`FAIL_REASON=${state.failReason}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateX3ReadinessGateState({
    metricsPath: args.metricsPath || undefined,
    rolloutPath: args.rolloutPath || undefined,
  });
  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state[TOKEN_NAME] === 1 ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
