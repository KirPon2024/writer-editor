#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWN_STAGE_IDS } from './xplat-rollout-plan-state.mjs';

const TOKEN_NAME = 'STAGE_PROMOTION_RECORD_VALID_OK';
const EXPECTED_SCHEMA_VERSION = 'v3.12';
export const DEFAULT_STAGE_PROMOTION_RECORD_SCHEMA_PATH = 'docs/OPS/STATUS/STAGE_PROMOTION_RECORD_SCHEMA_v3_12.json';
export const DEFAULT_STAGE_PROMOTION_RECORD_PATH = 'docs/OPS/STATUS/STAGE_PROMOTION_RECORD_v3_12.json';
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

function toNormalizedStageOrder(schemaDoc) {
  if (!schemaDoc || !isObjectRecord(schemaDoc.constraints) || !Array.isArray(schemaDoc.constraints.stageOrder)) {
    return [...KNOWN_STAGE_IDS];
  }
  const stageOrder = schemaDoc.constraints.stageOrder
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry.length > 0);
  return stageOrder.length > 0 ? stageOrder : [...KNOWN_STAGE_IDS];
}

function isIso8601String(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed);
}

function validateMetricValue(metricName, metricValue, metricSpec, errors, issuePath) {
  if (!isObjectRecord(metricSpec)) {
    pushError(
      errors,
      'E_PROMOTION_METRIC_SPEC_MISSING',
      issuePath,
      `Metric specification for "${metricName}" is missing.`,
    );
    return;
  }

  const metricType = String(metricSpec.type || '').trim();
  if (metricType === 'boolean') {
    if (typeof metricValue !== 'boolean') {
      pushError(
        errors,
        'E_PROMOTION_METRIC_TYPE_INVALID',
        issuePath,
        `Metric "${metricName}" must be boolean.`,
      );
    }
    return;
  }

  if (typeof metricValue !== 'number' || !Number.isFinite(metricValue)) {
    pushError(
      errors,
      'E_PROMOTION_METRIC_NAN_OR_INVALID',
      issuePath,
      `Metric "${metricName}" must be a finite number.`,
    );
    return;
  }

  if (metricValue < 0) {
    pushError(
      errors,
      'E_PROMOTION_METRIC_NEGATIVE',
      issuePath,
      `Metric "${metricName}" cannot be negative.`,
    );
  }

  const min = Number(metricSpec.minimum);
  if (Number.isFinite(min) && metricValue < min) {
    pushError(
      errors,
      'E_PROMOTION_METRIC_OUT_OF_RANGE',
      issuePath,
      `Metric "${metricName}" must be >= ${min}.`,
    );
  }

  const max = Number(metricSpec.maximum);
  if (Number.isFinite(max) && metricValue > max) {
    pushError(
      errors,
      'E_PROMOTION_METRIC_OUT_OF_RANGE',
      issuePath,
      `Metric "${metricName}" must be <= ${max}.`,
    );
  }

  if (metricType === 'percent' && (metricValue < 0 || metricValue > 100)) {
    pushError(
      errors,
      'E_PROMOTION_METRIC_OUT_OF_RANGE',
      issuePath,
      `Metric "${metricName}" percent must be in range 0..100.`,
    );
  }
}

export function evaluateStagePromotionRecordState(input = {}) {
  const schemaPath = String(
    input.schemaPath || process.env.STAGE_PROMOTION_RECORD_SCHEMA_PATH || DEFAULT_STAGE_PROMOTION_RECORD_SCHEMA_PATH,
  ).trim();
  const recordPath = String(
    input.recordPath || process.env.STAGE_PROMOTION_RECORD_PATH || DEFAULT_STAGE_PROMOTION_RECORD_PATH,
  ).trim();
  const metricsPath = String(
    input.metricsPath || process.env.XPLAT_STAGE_METRICS_PATH || DEFAULT_XPLAT_STAGE_METRICS_PATH,
  ).trim();

  const schemaDoc = isObjectRecord(input.schemaDoc) ? input.schemaDoc : readJsonObject(schemaPath);
  const recordDoc = isObjectRecord(input.recordDoc) ? input.recordDoc : readJsonObject(recordPath);
  const metricsDoc = isObjectRecord(input.metricsDoc) ? input.metricsDoc : readJsonObject(metricsPath);

  const errors = [];

  if (!schemaDoc) {
    pushError(errors, 'E_PROMOTION_SCHEMA_UNREADABLE', 'schema', 'Unable to read promotion schema JSON.');
  } else if (String(schemaDoc.schemaVersion || '').trim() !== EXPECTED_SCHEMA_VERSION) {
    pushError(
      errors,
      'E_PROMOTION_SCHEMA_VERSION_INVALID',
      'schema.schemaVersion',
      `Expected schemaVersion=${EXPECTED_SCHEMA_VERSION}.`,
    );
  }

  if (!recordDoc) {
    pushError(errors, 'E_PROMOTION_RECORD_UNREADABLE', 'record', 'Unable to read promotion record JSON.');
  } else if (String(recordDoc.schemaVersion || '').trim() !== EXPECTED_SCHEMA_VERSION) {
    pushError(
      errors,
      'E_PROMOTION_RECORD_SCHEMA_VERSION_INVALID',
      'record.schemaVersion',
      `Expected schemaVersion=${EXPECTED_SCHEMA_VERSION}.`,
    );
  }

  if (!metricsDoc) {
    pushError(errors, 'E_PROMOTION_METRICS_UNREADABLE', 'metrics', 'Unable to read metrics registry JSON.');
  } else if (String(metricsDoc.schemaVersion || '').trim() !== EXPECTED_SCHEMA_VERSION) {
    pushError(
      errors,
      'E_PROMOTION_METRICS_SCHEMA_VERSION_INVALID',
      'metrics.schemaVersion',
      `Expected schemaVersion=${EXPECTED_SCHEMA_VERSION}.`,
    );
  }

  const requiredMetricsByStage = schemaDoc && isObjectRecord(schemaDoc.requiredMetricsByStage)
    ? schemaDoc.requiredMetricsByStage
    : null;
  if (!requiredMetricsByStage) {
    pushError(
      errors,
      'E_PROMOTION_SCHEMA_REQUIRED_METRICS_INVALID',
      'schema.requiredMetricsByStage',
      'requiredMetricsByStage must be an object map.',
    );
  }

  const metricSpecs = metricsDoc && isObjectRecord(metricsDoc.metrics) ? metricsDoc.metrics : null;
  if (!metricSpecs) {
    pushError(errors, 'E_PROMOTION_METRIC_REGISTRY_INVALID', 'metrics.metrics', 'metrics map must be an object.');
  }

  let isActive = false;
  let fromStageId = null;
  let toStageId = null;

  if (recordDoc) {
    if (typeof recordDoc.isActive !== 'boolean') {
      pushError(errors, 'E_PROMOTION_RECORD_IS_ACTIVE_INVALID', 'record.isActive', 'isActive must be boolean.');
    } else {
      isActive = recordDoc.isActive;
    }

    const promotionId = String(recordDoc.promotionId || '').trim();
    if (!promotionId) {
      pushError(errors, 'E_PROMOTION_RECORD_ID_MISSING', 'record.promotionId', 'promotionId is required.');
    }

    const approvedBy = String(recordDoc.approvedBy || '').trim();
    if (!approvedBy) {
      pushError(errors, 'E_PROMOTION_RECORD_APPROVED_BY_MISSING', 'record.approvedBy', 'approvedBy is required.');
    }

    if (!isIso8601String(recordDoc.approvedAtUtc)) {
      pushError(
        errors,
        'E_PROMOTION_RECORD_APPROVED_AT_INVALID',
        'record.approvedAtUtc',
        'approvedAtUtc must be valid ISO-8601 timestamp.',
      );
    }

    const normalizedFromStage = String(recordDoc.fromStageId || '').trim();
    const normalizedToStage = String(recordDoc.toStageId || '').trim();
    fromStageId = normalizedFromStage || null;
    toStageId = normalizedToStage || null;
    if (!KNOWN_STAGE_IDS.includes(normalizedFromStage)) {
      pushError(errors, 'E_PROMOTION_STAGE_FROM_INVALID', 'record.fromStageId', 'fromStageId is invalid.');
    }
    if (!KNOWN_STAGE_IDS.includes(normalizedToStage)) {
      pushError(errors, 'E_PROMOTION_STAGE_TO_INVALID', 'record.toStageId', 'toStageId is invalid.');
    }

    const evidence = isObjectRecord(recordDoc.evidence) ? recordDoc.evidence : null;
    if (!evidence) {
      pushError(errors, 'E_PROMOTION_EVIDENCE_INVALID', 'record.evidence', 'evidence must be an object.');
    }

    if (isActive) {
      const stageOrder = toNormalizedStageOrder(schemaDoc);
      const fromIndex = stageOrder.indexOf(normalizedFromStage);
      const toIndex = stageOrder.indexOf(normalizedToStage);
      if (fromIndex === -1 || toIndex === -1 || toIndex !== fromIndex + 1) {
        pushError(
          errors,
          'E_PROMOTION_STAGE_TRANSITION_INVALID',
          'record.toStageId',
          'Active promotion requires single-step stage transition.',
        );
      }

      const requiredMetrics = requiredMetricsByStage && Array.isArray(requiredMetricsByStage[normalizedToStage])
        ? requiredMetricsByStage[normalizedToStage].map((entry) => String(entry || '').trim()).filter(Boolean)
        : null;
      if (!requiredMetrics) {
        pushError(
          errors,
          'E_PROMOTION_REQUIRED_METRICS_STAGE_UNDEFINED',
          `schema.requiredMetricsByStage.${normalizedToStage}`,
          `Missing required metric policy for stage ${normalizedToStage}.`,
        );
      } else {
        for (const metricName of requiredMetrics) {
          const metricPath = `record.evidence.${metricName}`;
          if (!evidence || !Object.prototype.hasOwnProperty.call(evidence, metricName)) {
            pushError(
              errors,
              'E_PROMOTION_REQUIRED_METRIC_MISSING',
              metricPath,
              `Required metric "${metricName}" is missing.`,
            );
            continue;
          }
          const metricSpec = metricSpecs ? metricSpecs[metricName] : null;
          validateMetricValue(metricName, evidence[metricName], metricSpec, errors, metricPath);
        }
      }
    }
  }

  const sortedErrors = sortErrors(errors);
  const ok = sortedErrors.length === 0;
  return {
    STAGE_PROMOTION_RECORD_VALID_OK: ok ? 1 : 0,
    isActive,
    fromStageId,
    toStageId,
    errors: sortedErrors,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    schemaPath: '',
    recordPath: '',
    metricsPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--schema-path' && i + 1 < argv.length) {
      out.schemaPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--record-path' && i + 1 < argv.length) {
      out.recordPath = String(argv[i + 1] || '').trim();
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
  console.log(`STAGE_PROMOTION_RECORD_VALID_OK=${state.STAGE_PROMOTION_RECORD_VALID_OK}`);
  console.log(`STAGE_PROMOTION_RECORD_IS_ACTIVE=${state.isActive ? 1 : 0}`);
  console.log(`STAGE_PROMOTION_RECORD_FROM_STAGE=${state.fromStageId || ''}`);
  console.log(`STAGE_PROMOTION_RECORD_TO_STAGE=${state.toStageId || ''}`);
  console.log(`STAGE_PROMOTION_RECORD_ERRORS=${JSON.stringify(state.errors)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateStagePromotionRecordState({
    schemaPath: args.schemaPath || undefined,
    recordPath: args.recordPath || undefined,
    metricsPath: args.metricsPath || undefined,
  });
  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state.STAGE_PROMOTION_RECORD_VALID_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
