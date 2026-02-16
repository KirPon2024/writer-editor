#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ROLLOUT_PLAN_PATH,
  DEFAULT_SCOPEFLAGS_REGISTRY_PATH,
  KNOWN_STAGE_IDS,
  evaluateXplatRolloutPlanState,
} from './xplat-rollout-plan-state.mjs';
import {
  DEFAULT_STAGE_PROMOTION_RECORD_PATH,
  DEFAULT_STAGE_PROMOTION_RECORD_SCHEMA_PATH,
  DEFAULT_XPLAT_STAGE_METRICS_PATH,
  evaluateStagePromotionRecordState,
} from './stage-promotion-record-state.mjs';

const TOKEN_NAME = 'STAGE_ACTIVATION_OK';

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

function normalizeRepoRelativePath(value) {
  const raw = String(value || '').trim().replaceAll('\\', '/');
  if (!raw || path.isAbsolute(raw)) return '';
  if (raw.split('/').some((segment) => segment.length === 0 || segment === '..')) return '';
  return raw;
}

function toUniqueSortedStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function parseScopeFlagsFromString(value) {
  return String(value || '')
    .split(/[\s,;]+/u)
    .map((entry) => String(entry || '').trim())
    .filter((entry) => /^[A-Z][A-Z0-9_]+$/u.test(entry));
}

function parseScopeFlags(inputScopeFlags) {
  if (Array.isArray(inputScopeFlags)) {
    return toUniqueSortedStrings(inputScopeFlags);
  }
  if (typeof inputScopeFlags === 'string') {
    return toUniqueSortedStrings(parseScopeFlagsFromString(inputScopeFlags));
  }

  const envCandidates = [
    process.env.XPLAT_SCOPE_FLAGS,
    process.env.SCOPE_FLAGS,
    process.env.COLLAB_SCOPE_LOCAL,
  ];
  const merged = [];
  for (const raw of envCandidates) {
    merged.push(...parseScopeFlagsFromString(raw));
  }
  return toUniqueSortedStrings(merged);
}

function parseBooleanish(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function collectKnownScopeFlags(scopeflagsDoc) {
  const known = new Set();
  const flags = scopeflagsDoc && Array.isArray(scopeflagsDoc.flags) ? scopeflagsDoc.flags : [];
  for (const row of flags) {
    const flagId = String(row && row.flagId ? row.flagId : '').trim();
    if (!flagId) continue;
    known.add(flagId);
  }
  return known;
}

function normalizeStageDefinitions(planDoc) {
  const normalized = [];

  if (planDoc && Array.isArray(planDoc.stageDefinitions)) {
    for (const row of planDoc.stageDefinitions) {
      if (!isObjectRecord(row)) continue;
      const stageId = String(row.stageId || '').trim();
      if (!KNOWN_STAGE_IDS.includes(stageId)) continue;
      const requiredScopeFlag = row.requiredScopeFlag === null
        ? null
        : String(row.requiredScopeFlag || '').trim() || null;
      const stageGatedSsot = Array.isArray(row.stageGatedSsot)
        ? toUniqueSortedStrings(row.stageGatedSsot.map((filePath) => normalizeRepoRelativePath(filePath)).filter(Boolean))
        : [];

      normalized.push({
        stageId,
        requiredScopeFlag,
        stageGatedSsot,
      });
    }
  }

  if (normalized.length > 0) {
    return normalized.sort((a, b) => a.stageId.localeCompare(b.stageId));
  }

  const stageToScopeFlag = planDoc && isObjectRecord(planDoc.stageToScopeFlag) ? planDoc.stageToScopeFlag : {};
  for (const stageId of KNOWN_STAGE_IDS) {
    const rawFlag = stageToScopeFlag[stageId];
    const requiredScopeFlag = rawFlag === null ? null : String(rawFlag || '').trim() || null;
    normalized.push({
      stageId,
      requiredScopeFlag,
      stageGatedSsot: [],
    });
  }
  return normalized;
}

function hasStageMetricsErrors(promotionErrors) {
  return promotionErrors.some((entry) => {
    const code = String(entry && entry.code ? entry.code : '').trim();
    return code === 'E_PROMOTION_REQUIRED_METRIC_MISSING'
      || code === 'E_PROMOTION_REQUIRED_METRICS_STAGE_UNDEFINED'
      || code === 'E_PROMOTION_METRIC_SPEC_MISSING'
      || code === 'E_PROMOTION_METRIC_TYPE_INVALID'
      || code === 'E_PROMOTION_METRIC_NAN_OR_INVALID'
      || code === 'E_PROMOTION_METRIC_NEGATIVE'
      || code === 'E_PROMOTION_METRIC_OUT_OF_RANGE';
  });
}

function parseArgs(argv) {
  const out = {
    json: false,
    profile: '',
    gateTier: '',
    scopeFlags: '',
    promotionMode: '',
    planPath: '',
    scopeflagsPath: '',
    recordPath: '',
    schemaPath: '',
    metricsPath: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg.startsWith('--profile=')) {
      out.profile = arg.slice('--profile='.length).trim();
      continue;
    }
    if (arg === '--profile' && i + 1 < argv.length) {
      out.profile = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--gateTier=')) {
      out.gateTier = arg.slice('--gateTier='.length).trim();
      continue;
    }
    if (arg === '--gateTier' && i + 1 < argv.length) {
      out.gateTier = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--scopeFlags=')) {
      out.scopeFlags = arg.slice('--scopeFlags='.length).trim();
      continue;
    }
    if (arg === '--scopeFlags' && i + 1 < argv.length) {
      out.scopeFlags = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--promotionMode=')) {
      out.promotionMode = arg.slice('--promotionMode='.length).trim();
      continue;
    }
    if (arg === '--promotionMode' && i + 1 < argv.length) {
      out.promotionMode = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--plan-path=')) {
      out.planPath = arg.slice('--plan-path='.length).trim();
      continue;
    }
    if (arg === '--plan-path' && i + 1 < argv.length) {
      out.planPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--scopeflags-path=')) {
      out.scopeflagsPath = arg.slice('--scopeflags-path='.length).trim();
      continue;
    }
    if (arg === '--scopeflags-path' && i + 1 < argv.length) {
      out.scopeflagsPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--record-path=')) {
      out.recordPath = arg.slice('--record-path='.length).trim();
      continue;
    }
    if (arg === '--record-path' && i + 1 < argv.length) {
      out.recordPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--schema-path=')) {
      out.schemaPath = arg.slice('--schema-path='.length).trim();
      continue;
    }
    if (arg === '--schema-path' && i + 1 < argv.length) {
      out.schemaPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--metrics-path=')) {
      out.metricsPath = arg.slice('--metrics-path='.length).trim();
      continue;
    }
    if (arg === '--metrics-path' && i + 1 < argv.length) {
      out.metricsPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
  }

  return out;
}

export function evaluateResolveActiveStageState(input = {}) {
  const profile = String(input.profile || process.env.WAVE_PROFILE || 'pr').trim() || 'pr';
  const gateTier = String(input.gateTier || process.env.WAVE_GATE_TIER || 'core').trim() || 'core';
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
  const scopeFlags = parseScopeFlags(input.scopeFlags);

  const planDoc = isObjectRecord(input.planDoc) ? input.planDoc : readJsonObject(planPath);
  const scopeflagsDoc = isObjectRecord(input.scopeflagsDoc) ? input.scopeflagsDoc : readJsonObject(scopeflagsPath);
  const knownScopeFlags = collectKnownScopeFlags(scopeflagsDoc);
  const stageDefinitions = normalizeStageDefinitions(planDoc);

  const rollout = evaluateXplatRolloutPlanState({
    planPath,
    scopeflagsPath,
    planDoc,
    scopeflagsDoc,
  });

  const failSignals = [];
  const errors = [];

  function pushFail(signal, reason) {
    if (!failSignals.includes(signal)) failSignals.push(signal);
    if (reason) errors.push(String(reason));
  }

  for (const flag of scopeFlags) {
    if (!knownScopeFlags.has(flag)) {
      pushFail('E_SCOPEFLAG_UNKNOWN', `Unknown scope flag: ${flag}`);
    }
  }

  const stageById = new Map(stageDefinitions.map((entry) => [entry.stageId, entry]));
  const rolloutActiveStageId = typeof rollout.activeStageId === 'string' ? rollout.activeStageId : '';
  const stageDefinition = stageById.get(rolloutActiveStageId) || null;

  if (rollout.XPLAT_ROLLOUT_PLAN_VALID_OK !== 1) {
    const hasScopeErrors = Array.isArray(rollout.errors)
      && rollout.errors.some((entry) => String(entry.code || '').includes('SCOPEFLAG'));
    if (hasScopeErrors) {
      pushFail('E_SCOPEFLAG_UNKNOWN', 'Rollout plan references unknown scope flags.');
    }
    pushFail('E_STAGE_PROMOTION_INVALID', 'Rollout plan validation failed.');
  }

  if (!stageDefinition) {
    pushFail('E_STAGE_PROMOTION_INVALID', `Active stage definition missing for ${rolloutActiveStageId || '<none>'}.`);
  }

  const requiredScopeFlag = stageDefinition
    ? stageDefinition.requiredScopeFlag
    : (rollout.requiredScopeFlagForActiveStage || null);

  if (requiredScopeFlag && !knownScopeFlags.has(requiredScopeFlag)) {
    pushFail('E_SCOPEFLAG_UNKNOWN', `Unknown required scope flag for active stage: ${requiredScopeFlag}`);
  }

  let stageActive = 0;
  if (rolloutActiveStageId && stageDefinition && failSignals.length === 0) {
    if (!requiredScopeFlag || scopeFlags.includes(requiredScopeFlag)) {
      stageActive = 1;
    }
  }

  const promotionModeRequested = input.promotionMode === true
    || parseBooleanish(input.promotionMode)
    || parseBooleanish(process.env.PROMOTION_MODE)
    || gateTier.toLowerCase() === 'promotion';

  let promotionMode = 0;
  let promotionState = {
    STAGE_PROMOTION_RECORD_VALID_OK: 1,
    isActive: false,
    fromStageId: null,
    toStageId: null,
    errors: [],
  };

  if (promotionModeRequested) {
    promotionState = evaluateStagePromotionRecordState({
      schemaPath,
      recordPath,
      metricsPath,
      schemaDoc: input.schemaDoc,
      recordDoc: input.recordDoc,
      metricsDoc: input.metricsDoc,
    });

    if (rollout.promotionModeAllowed !== true) {
      pushFail('E_STAGE_PROMOTION_INVALID', 'Promotion mode requested but rollout plan forbids promotion mode.');
    }

    if (promotionState.STAGE_PROMOTION_RECORD_VALID_OK !== 1 || promotionState.isActive !== true) {
      pushFail('E_STAGE_PROMOTION_INVALID', 'Promotion mode requested without a valid active promotion record.');
      if (hasStageMetricsErrors(Array.isArray(promotionState.errors) ? promotionState.errors : [])) {
        pushFail('E_STAGE_METRICS_MISSING', 'Promotion record is missing required stage metrics evidence.');
      }
    } else if (promotionState.toStageId && promotionState.toStageId !== rolloutActiveStageId) {
      pushFail(
        'E_STAGE_PROMOTION_INVALID',
        `Promotion target ${promotionState.toStageId} does not match active stage ${rolloutActiveStageId}.`,
      );
    } else {
      promotionMode = 1;
    }
  }

  const relevantStageGatedSsot = stageActive === 1 && stageDefinition
    ? [...stageDefinition.stageGatedSsot]
    : [];

  const activeStageIds = stageActive === 1 && rolloutActiveStageId ? [rolloutActiveStageId] : [];
  const activeScopeFlags = stageActive === 1
    ? toUniqueSortedStrings(requiredScopeFlag ? [requiredScopeFlag] : [])
    : [];

  const ok = failSignals.length === 0;

  return {
    ok,
    profile,
    gateTier,
    promotionModeRequested: promotionModeRequested ? 1 : 0,
    promotionMode,
    STAGE_ACTIVE: stageActive,
    ACTIVE_STAGE_ID: stageActive === 1 ? rolloutActiveStageId : 'NONE',
    ACTIVE_STAGE_IDS: activeStageIds,
    ACTIVE_SCOPEFLAGS: activeScopeFlags,
    RELEVANT_STAGE_GATED_SSOT_COUNT: relevantStageGatedSsot.length,
    relevantStageGatedSsot,
    [TOKEN_NAME]: ok ? 1 : 0,
    failReason: ok ? '' : failSignals[0],
    failSignals: toUniqueSortedStrings(failSignals),
    errors: toUniqueSortedStrings(errors),
    requiredScopeFlag: requiredScopeFlag || '',
    scopeFlags,
    knownScopeFlags: toUniqueSortedStrings([...knownScopeFlags]),
    paths: {
      planPath,
      scopeflagsPath,
      recordPath,
      schemaPath,
      metricsPath,
    },
    promotionState: {
      STAGE_PROMOTION_RECORD_VALID_OK: Number(promotionState.STAGE_PROMOTION_RECORD_VALID_OK) === 1 ? 1 : 0,
      isActive: promotionState.isActive === true ? 1 : 0,
      fromStageId: promotionState.fromStageId || '',
      toStageId: promotionState.toStageId || '',
      errors: Array.isArray(promotionState.errors)
        ? promotionState.errors.map((entry) => ({
          code: String(entry && entry.code ? entry.code : ''),
          path: String(entry && entry.path ? entry.path : ''),
          message: String(entry && entry.message ? entry.message : ''),
        }))
        : [],
    },
  };
}

function printHuman(state) {
  console.log(`STAGE_ACTIVATION_OK=${state.STAGE_ACTIVATION_OK}`);
  console.log(`STAGE_ACTIVE=${state.STAGE_ACTIVE}`);
  console.log(`ACTIVE_STAGE_ID=${state.ACTIVE_STAGE_ID}`);
  console.log(`ACTIVE_STAGE_IDS=${JSON.stringify(state.ACTIVE_STAGE_IDS)}`);
  console.log(`ACTIVE_SCOPEFLAGS=${JSON.stringify(state.ACTIVE_SCOPEFLAGS)}`);
  console.log(`RELEVANT_STAGE_GATED_SSOT_COUNT=${state.RELEVANT_STAGE_GATED_SSOT_COUNT}`);
  console.log(`RELEVANT_STAGE_GATED_SSOT=${JSON.stringify(state.relevantStageGatedSsot)}`);
  console.log(`STAGE_FAIL_REASON=${state.failReason}`);
  console.log(`STAGE_FAIL_SIGNALS=${JSON.stringify(state.failSignals)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateResolveActiveStageState({
    profile: args.profile,
    gateTier: args.gateTier,
    scopeFlags: args.scopeFlags,
    promotionMode: args.promotionMode,
    planPath: args.planPath,
    scopeflagsPath: args.scopeflagsPath,
    recordPath: args.recordPath,
    schemaPath: args.schemaPath,
    metricsPath: args.metricsPath,
  });

  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }

  process.exit(state.STAGE_ACTIVATION_OK === 1 ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
