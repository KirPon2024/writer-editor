#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'XPLAT_ROLLOUT_PLAN_VALID_OK';
const EXPECTED_SCHEMA_VERSION = 'v3.12';
export const DEFAULT_ROLLOUT_PLAN_PATH = 'docs/OPS/STATUS/XPLAT_ROLLOUT_PLAN_v3_12.json';
export const DEFAULT_SCOPEFLAGS_REGISTRY_PATH = 'docs/OPS/STATUS/SCOPEFLAGS_REGISTRY_v3_12.json';
export const KNOWN_STAGE_IDS = Object.freeze(['X0', 'X1', 'X2', 'X3', 'X4']);
const STAGES_REQUIRING_SCOPE_FLAG = new Set(['X1', 'X2', 'X3', 'X4']);

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

function collectKnownScopeFlags(scopeRegistryDoc, errors) {
  const out = new Set();
  if (!scopeRegistryDoc) {
    pushError(errors, 'E_SCOPEFLAGS_REGISTRY_UNREADABLE', 'scopeflags', 'Unable to read scope flag registry JSON.');
    return out;
  }

  if (String(scopeRegistryDoc.schemaVersion || '').trim() !== EXPECTED_SCHEMA_VERSION) {
    pushError(
      errors,
      'E_SCOPEFLAGS_REGISTRY_SCHEMA_VERSION_INVALID',
      'scopeflags.schemaVersion',
      `Expected schemaVersion=${EXPECTED_SCHEMA_VERSION}.`,
    );
  }

  const flags = Array.isArray(scopeRegistryDoc.flags) ? scopeRegistryDoc.flags : null;
  if (!flags) {
    pushError(errors, 'E_SCOPEFLAGS_REGISTRY_FLAGS_INVALID', 'scopeflags.flags', 'Expected non-empty array of flags.');
    return out;
  }

  for (let i = 0; i < flags.length; i += 1) {
    const row = flags[i];
    if (!isObjectRecord(row)) {
      pushError(errors, 'E_SCOPEFLAGS_REGISTRY_ROW_INVALID', `scopeflags.flags[${i}]`, 'Flag row must be an object.');
      continue;
    }
    const flagId = String(row.flagId || '').trim();
    if (!flagId) {
      pushError(errors, 'E_SCOPEFLAGS_REGISTRY_FLAGID_MISSING', `scopeflags.flags[${i}].flagId`, 'flagId is required.');
      continue;
    }
    out.add(flagId);
  }
  return out;
}

export function evaluateXplatRolloutPlanState(input = {}) {
  const planPath = String(
    input.planPath || process.env.XPLAT_ROLLOUT_PLAN_PATH || DEFAULT_ROLLOUT_PLAN_PATH,
  ).trim();
  const scopeflagsPath = String(
    input.scopeflagsPath || process.env.SCOPEFLAGS_REGISTRY_PATH || DEFAULT_SCOPEFLAGS_REGISTRY_PATH,
  ).trim();

  const errors = [];
  const planDoc = isObjectRecord(input.planDoc) ? input.planDoc : readJsonObject(planPath);
  const scopeflagsDoc = isObjectRecord(input.scopeflagsDoc) ? input.scopeflagsDoc : readJsonObject(scopeflagsPath);
  const knownScopeFlags = collectKnownScopeFlags(scopeflagsDoc, errors);

  if (!planDoc) {
    pushError(errors, 'E_ROLLOUT_PLAN_UNREADABLE', 'rolloutPlan', 'Unable to read rollout plan JSON.');
  }

  let activeStageId = '';
  let requiredScopeFlagForActiveStage = null;
  let promotionModeAllowed = false;

  if (planDoc) {
    if (String(planDoc.schemaVersion || '').trim() !== EXPECTED_SCHEMA_VERSION) {
      pushError(
        errors,
        'E_ROLLOUT_PLAN_SCHEMA_VERSION_INVALID',
        'rolloutPlan.schemaVersion',
        `Expected schemaVersion=${EXPECTED_SCHEMA_VERSION}.`,
      );
    }

    const rawActiveStage = String(planDoc.activeStageId || '').trim();
    activeStageId = rawActiveStage;
    if (!rawActiveStage) {
      pushError(errors, 'E_ROLLOUT_PLAN_ACTIVE_STAGE_MISSING', 'rolloutPlan.activeStageId', 'activeStageId is required.');
    } else if (!KNOWN_STAGE_IDS.includes(rawActiveStage)) {
      pushError(
        errors,
        'E_ROLLOUT_PLAN_ACTIVE_STAGE_UNKNOWN',
        'rolloutPlan.activeStageId',
        `Unknown active stage "${rawActiveStage}".`,
      );
    }

    if (!Object.prototype.hasOwnProperty.call(planDoc, 'promotionModeAllowed')
      || typeof planDoc.promotionModeAllowed !== 'boolean') {
      pushError(
        errors,
        'E_ROLLOUT_PLAN_PROMOTION_MODE_ALLOWED_INVALID',
        'rolloutPlan.promotionModeAllowed',
        'promotionModeAllowed must be boolean.',
      );
    } else {
      promotionModeAllowed = planDoc.promotionModeAllowed;
    }

    const stageToScopeFlag = isObjectRecord(planDoc.stageToScopeFlag) ? planDoc.stageToScopeFlag : null;
    if (!stageToScopeFlag) {
      pushError(
        errors,
        'E_ROLLOUT_PLAN_STAGE_SCOPEFLAG_MAP_INVALID',
        'rolloutPlan.stageToScopeFlag',
        'stageToScopeFlag must be an object map.',
      );
    } else {
      for (const stageKey of Object.keys(stageToScopeFlag)) {
        if (!KNOWN_STAGE_IDS.includes(stageKey)) {
          pushError(
            errors,
            'E_ROLLOUT_PLAN_STAGE_SCOPEFLAG_STAGE_UNKNOWN',
            `rolloutPlan.stageToScopeFlag.${stageKey}`,
            `Unknown stage key "${stageKey}" in stageToScopeFlag map.`,
          );
          continue;
        }
        const rawFlagValue = stageToScopeFlag[stageKey];
        if (!(rawFlagValue === null || typeof rawFlagValue === 'string')) {
          pushError(
            errors,
            'E_ROLLOUT_PLAN_SCOPEFLAG_VALUE_INVALID',
            `rolloutPlan.stageToScopeFlag.${stageKey}`,
            'Scope flag value must be string or null.',
          );
          continue;
        }
        if (typeof rawFlagValue === 'string') {
          const normalizedFlag = rawFlagValue.trim();
          if (!normalizedFlag) {
            pushError(
              errors,
              'E_ROLLOUT_PLAN_SCOPEFLAG_VALUE_INVALID',
              `rolloutPlan.stageToScopeFlag.${stageKey}`,
              'Scope flag string must be non-empty.',
            );
            continue;
          }
          if (!knownScopeFlags.has(normalizedFlag)) {
            pushError(
              errors,
              'E_ROLLOUT_PLAN_SCOPEFLAG_UNKNOWN',
              `rolloutPlan.stageToScopeFlag.${stageKey}`,
              `Unknown scope flag "${normalizedFlag}".`,
            );
          }
        }
      }

      if (KNOWN_STAGE_IDS.includes(rawActiveStage)) {
        const rawFlag = stageToScopeFlag[rawActiveStage];
        if (typeof rawFlag === 'string' && rawFlag.trim()) {
          requiredScopeFlagForActiveStage = rawFlag.trim();
        } else {
          requiredScopeFlagForActiveStage = null;
        }

        if (STAGES_REQUIRING_SCOPE_FLAG.has(rawActiveStage) && requiredScopeFlagForActiveStage === null) {
          pushError(
            errors,
            'E_ROLLOUT_PLAN_SCOPEFLAG_REQUIRED',
            `rolloutPlan.stageToScopeFlag.${rawActiveStage}`,
            `Active stage ${rawActiveStage} requires an explicit scope flag mapping.`,
          );
        }
      }
    }
  }

  const sortedErrors = sortErrors(errors);
  const ok = sortedErrors.length === 0;
  return {
    [TOKEN_NAME]: ok ? 1 : 0,
    activeStageId: activeStageId || null,
    promotionModeAllowed: promotionModeAllowed === true,
    requiredScopeFlagForActiveStage,
    scopeflagsRegistrySize: knownScopeFlags.size,
    errors: sortedErrors,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    planPath: '',
    scopeflagsPath: '',
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
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`XPLAT_ACTIVE_STAGE_ID=${state.activeStageId || ''}`);
  console.log(`XPLAT_PROMOTION_MODE_ALLOWED=${state.promotionModeAllowed ? 1 : 0}`);
  console.log(`XPLAT_REQUIRED_SCOPEFLAG_FOR_ACTIVE_STAGE=${state.requiredScopeFlagForActiveStage || ''}`);
  console.log(`XPLAT_ROLLOUT_ERRORS=${JSON.stringify(state.errors)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateXplatRolloutPlanState({
    planPath: args.planPath || undefined,
    scopeflagsPath: args.scopeflagsPath || undefined,
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
