#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ROLLOUT_PLAN_PATH,
  DEFAULT_SCOPEFLAGS_REGISTRY_PATH,
  evaluateXplatRolloutPlanState,
} from './xplat-rollout-plan-state.mjs';
import {
  DEFAULT_STAGE_PROMOTION_RECORD_PATH,
  DEFAULT_STAGE_PROMOTION_RECORD_SCHEMA_PATH,
  DEFAULT_XPLAT_STAGE_METRICS_PATH,
  evaluateStagePromotionRecordState,
} from './stage-promotion-record-state.mjs';

const TOKEN_NAME = 'STAGE_ACTIVATION_STATE_OK';

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

function pushError(errors, code, message, details = {}) {
  errors.push({
    code: String(code || '').trim(),
    message: String(message || '').trim(),
    ...details,
  });
}

function sortErrors(errors) {
  return [...errors].sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    const msgA = String(a.message || '');
    const msgB = String(b.message || '');
    if (msgA !== msgB) return msgA.localeCompare(msgB);
    const pathA = String(a.path || '');
    const pathB = String(b.path || '');
    return pathA.localeCompare(pathB);
  });
}

function extractEnabledFlags(input, enabledFlagsPath, errors) {
  if (Array.isArray(input.enabledFlags)) {
    const normalized = input.enabledFlags
      .map((entry) => String(entry || '').trim())
      .filter((entry) => entry.length > 0);
    return new Set(normalized);
  }

  if (!enabledFlagsPath) return null;

  const enabledFlagsDoc = isObjectRecord(input.enabledFlagsDoc)
    ? input.enabledFlagsDoc
    : readJsonObject(enabledFlagsPath);
  if (!enabledFlagsDoc || !Array.isArray(enabledFlagsDoc.enabledFlags)) {
    pushError(
      errors,
      'E_STAGE_ENABLED_FLAGS_INVALID',
      'enabledFlagsPath must point to JSON object with enabledFlags array.',
      { path: enabledFlagsPath },
    );
    return null;
  }

  const normalized = enabledFlagsDoc.enabledFlags
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry.length > 0);
  return new Set(normalized);
}

export function evaluateStageActivationState(input = {}) {
  const planPath = String(
    input.planPath || process.env.XPLAT_ROLLOUT_PLAN_PATH || DEFAULT_ROLLOUT_PLAN_PATH,
  ).trim();
  const scopeflagsPath = String(
    input.scopeflagsPath || process.env.SCOPEFLAGS_REGISTRY_PATH || DEFAULT_SCOPEFLAGS_REGISTRY_PATH,
  ).trim();
  const recordPath = String(
    input.recordPath || process.env.STAGE_PROMOTION_RECORD_PATH || DEFAULT_STAGE_PROMOTION_RECORD_PATH,
  ).trim();
  const schemaPath = String(
    input.schemaPath || process.env.STAGE_PROMOTION_RECORD_SCHEMA_PATH || DEFAULT_STAGE_PROMOTION_RECORD_SCHEMA_PATH,
  ).trim();
  const metricsPath = String(
    input.metricsPath || process.env.XPLAT_STAGE_METRICS_PATH || DEFAULT_XPLAT_STAGE_METRICS_PATH,
  ).trim();
  const enabledFlagsPath = String(
    input.enabledFlagsPath || process.env.STAGE_ENABLED_FLAGS_PATH || '',
  ).trim();

  const errors = [];
  const rolloutState = evaluateXplatRolloutPlanState({
    planPath,
    scopeflagsPath,
    planDoc: input.planDoc,
    scopeflagsDoc: input.scopeflagsDoc,
  });
  const promotionState = evaluateStagePromotionRecordState({
    schemaPath,
    recordPath,
    metricsPath,
    schemaDoc: input.schemaDoc,
    recordDoc: input.recordDoc,
    metricsDoc: input.metricsDoc,
  });

  if (rolloutState.XPLAT_ROLLOUT_PLAN_VALID_OK !== 1) {
    pushError(errors, 'E_STAGE_ROLLOUT_PLAN_INVALID', 'Rollout plan state is invalid.');
  }

  const activeStageId = typeof rolloutState.activeStageId === 'string' ? rolloutState.activeStageId : null;
  const requiredScopeFlagForActiveStage = typeof rolloutState.requiredScopeFlagForActiveStage === 'string'
    ? rolloutState.requiredScopeFlagForActiveStage
    : null;

  let scopeFlagKnown = requiredScopeFlagForActiveStage ? 0 : 1;
  const enabledFlags = extractEnabledFlags(input, enabledFlagsPath, errors);
  if (requiredScopeFlagForActiveStage && enabledFlags) {
    scopeFlagKnown = 1;
    if (!enabledFlags.has(requiredScopeFlagForActiveStage)) {
      pushError(
        errors,
        'E_STAGE_SCOPEFLAG_DISABLED',
        `Required scope flag "${requiredScopeFlagForActiveStage}" is not enabled.`,
      );
    }
  }

  const recordIsActive = promotionState.isActive === true;
  const planPromotionModeAllowed = rolloutState.promotionModeAllowed === true;
  let promotionMode = 0;
  let toStageId = null;

  if (recordIsActive) {
    toStageId = typeof promotionState.toStageId === 'string' ? promotionState.toStageId : null;
    if (!planPromotionModeAllowed) {
      pushError(
        errors,
        'E_STAGE_PROMOTION_MODE_NOT_ALLOWED',
        'Promotion record is active while rollout plan forbids promotion mode.',
      );
    }
    if (promotionState.STAGE_PROMOTION_RECORD_VALID_OK !== 1) {
      pushError(
        errors,
        'E_STAGE_PROMOTION_RECORD_INVALID',
        'Promotion record is active but validation failed.',
      );
    }
    if (planPromotionModeAllowed && promotionState.STAGE_PROMOTION_RECORD_VALID_OK === 1) {
      promotionMode = 1;
    }
  }

  const sortedErrors = sortErrors(errors);
  const ok = sortedErrors.length === 0;
  return {
    [TOKEN_NAME]: ok ? 1 : 0,
    activeStageId,
    promotionMode,
    toStageId,
    scopeFlagKnown,
    requiredScopeFlagForActiveStage,
    errors: sortedErrors,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    planPath: '',
    scopeflagsPath: '',
    recordPath: '',
    schemaPath: '',
    metricsPath: '',
    enabledFlagsPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--plan-path' && i + 1 < argv.length) {
      out.planPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--scopeflags-path' && i + 1 < argv.length) {
      out.scopeflagsPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--record-path' && i + 1 < argv.length) {
      out.recordPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--schema-path' && i + 1 < argv.length) {
      out.schemaPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--metrics-path' && i + 1 < argv.length) {
      out.metricsPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--enabled-flags-path' && i + 1 < argv.length) {
      out.enabledFlagsPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`STAGE_ACTIVE_STAGE_ID=${state.activeStageId || ''}`);
  console.log(`STAGE_PROMOTION_MODE=${state.promotionMode}`);
  console.log(`STAGE_PROMOTION_TO_STAGE=${state.toStageId || ''}`);
  console.log(`STAGE_SCOPEFLAG_KNOWN=${state.scopeFlagKnown}`);
  console.log(`STAGE_SCOPEFLAG_REQUIRED=${state.requiredScopeFlagForActiveStage || ''}`);
  console.log(`STAGE_ACTIVATION_ERRORS=${JSON.stringify(state.errors)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateStageActivationState({
    planPath: args.planPath || undefined,
    scopeflagsPath: args.scopeflagsPath || undefined,
    recordPath: args.recordPath || undefined,
    schemaPath: args.schemaPath || undefined,
    metricsPath: args.metricsPath || undefined,
    enabledFlagsPath: args.enabledFlagsPath || undefined,
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
