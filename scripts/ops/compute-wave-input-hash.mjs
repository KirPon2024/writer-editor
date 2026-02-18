#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ROLLOUT_PLAN_PATH,
  DEFAULT_SCOPEFLAGS_REGISTRY_PATH,
} from './xplat-rollout-plan-state.mjs';
import {
  DEFAULT_STAGE_PROMOTION_RECORD_PATH,
  DEFAULT_STAGE_PROMOTION_RECORD_SCHEMA_PATH,
  DEFAULT_XPLAT_STAGE_METRICS_PATH,
} from './stage-promotion-record-state.mjs';
import { evaluateResolveActiveStageState } from './resolve-active-stage.mjs';

export const DEFAULT_WAVE_FRESHNESS_POLICY_PATH = 'docs/OPS/STATUS/WAVE_FRESHNESS_POLICY_v3_12.json';

const ALWAYS_ON_SSOT = Object.freeze([
  'docs/OPS/STATUS/XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v3.13a-final.md',
  DEFAULT_ROLLOUT_PLAN_PATH,
  DEFAULT_SCOPEFLAGS_REGISTRY_PATH,
  DEFAULT_STAGE_PROMOTION_RECORD_SCHEMA_PATH,
  DEFAULT_STAGE_PROMOTION_RECORD_PATH,
  DEFAULT_XPLAT_STAGE_METRICS_PATH,
  DEFAULT_WAVE_FRESHNESS_POLICY_PATH,
]);

const WAVE_SCRIPT_FILES = Object.freeze([
  'scripts/doctor.mjs',
  'scripts/ops/extract-truth-table.mjs',
  'scripts/ops/emit-ops-summary.mjs',
  'scripts/ops/freeze-rollups-state.mjs',
  'scripts/ops/resolve-active-stage.mjs',
  'scripts/ops/compute-wave-input-hash.mjs',
  'scripts/ops/wave-cache.mjs',
]);

const WAVE_LOCK_FILES = Object.freeze([
  'scripts/ops/required-checks.json',
  'docs/OPS/TOKENS/TOKEN_DECLARATION.json',
  'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json',
]);

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

function sha256Bytes(data) {
  return createHash('sha256').update(data).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
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

function parseScopeFlags(inputScopeFlags) {
  if (Array.isArray(inputScopeFlags)) return toUniqueSortedStrings(inputScopeFlags);
  return toUniqueSortedStrings(String(inputScopeFlags || '').split(/[\s,;]+/u));
}

function readJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function classifyTtlClass(profile, gateTier) {
  const normalizedProfile = String(profile || '').trim().toLowerCase();
  const normalizedGateTier = String(gateTier || '').trim().toLowerCase();
  if (normalizedProfile === 'promotion' || normalizedProfile === 'release') return 'networkSensitive';
  if (normalizedGateTier === 'promotion' || normalizedGateTier === 'release') return 'networkSensitive';
  return 'deterministicLocal';
}

function resolveTtlSeconds(policyDoc, ttlClass) {
  const classConfig = policyDoc
    && isObjectRecord(policyDoc.ttlClasses)
    && isObjectRecord(policyDoc.ttlClasses[ttlClass])
    ? policyDoc.ttlClasses[ttlClass]
    : null;

  const classTtl = Number(classConfig && classConfig.ttlSec);
  if (Number.isFinite(classTtl) && classTtl > 0) return Math.trunc(classTtl);

  if (ttlClass === 'networkSensitive') {
    const fallback = Number(policyDoc && policyDoc.networkSensitiveTtlSec);
    if (Number.isFinite(fallback) && fallback > 0) return Math.trunc(fallback);
    return 900;
  }

  const fallback = Number(policyDoc && policyDoc.deterministicLocalTtlSec);
  if (Number.isFinite(fallback) && fallback > 0) return Math.trunc(fallback);
  return 21600;
}

function collectFileFingerprints(filePaths) {
  const files = [];
  const missing = [];

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      missing.push(filePath);
      continue;
    }
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      missing.push(filePath);
      continue;
    }
    if (!stat.isFile()) {
      missing.push(filePath);
      continue;
    }

    files.push({
      path: filePath,
      sha256: sha256File(filePath),
      bytes: stat.size,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  missing.sort((a, b) => a.localeCompare(b));
  return {
    files,
    missing,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    profile: '',
    gateTier: '',
    scopeFlags: '',
    planPath: '',
    scopeflagsPath: '',
    recordPath: '',
    schemaPath: '',
    metricsPath: '',
    policyPath: '',
    extraSsotPath: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (arg === '--json') {
      out.json = true;
      continue;
    }

    const parseInline = (name) => arg.startsWith(`${name}=`) ? arg.slice(name.length + 1).trim() : null;

    const profileInline = parseInline('--profile');
    if (profileInline !== null) {
      out.profile = profileInline;
      continue;
    }
    if (arg === '--profile' && i + 1 < argv.length) {
      out.profile = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const gateTierInline = parseInline('--gateTier');
    if (gateTierInline !== null) {
      out.gateTier = gateTierInline;
      continue;
    }
    if (arg === '--gateTier' && i + 1 < argv.length) {
      out.gateTier = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const scopeFlagsInline = parseInline('--scopeFlags');
    if (scopeFlagsInline !== null) {
      out.scopeFlags = scopeFlagsInline;
      continue;
    }
    if (arg === '--scopeFlags' && i + 1 < argv.length) {
      out.scopeFlags = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const planInline = parseInline('--plan-path');
    if (planInline !== null) {
      out.planPath = planInline;
      continue;
    }
    if (arg === '--plan-path' && i + 1 < argv.length) {
      out.planPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const scopePathInline = parseInline('--scopeflags-path');
    if (scopePathInline !== null) {
      out.scopeflagsPath = scopePathInline;
      continue;
    }
    if (arg === '--scopeflags-path' && i + 1 < argv.length) {
      out.scopeflagsPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const recordInline = parseInline('--record-path');
    if (recordInline !== null) {
      out.recordPath = recordInline;
      continue;
    }
    if (arg === '--record-path' && i + 1 < argv.length) {
      out.recordPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const schemaInline = parseInline('--schema-path');
    if (schemaInline !== null) {
      out.schemaPath = schemaInline;
      continue;
    }
    if (arg === '--schema-path' && i + 1 < argv.length) {
      out.schemaPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const metricsInline = parseInline('--metrics-path');
    if (metricsInline !== null) {
      out.metricsPath = metricsInline;
      continue;
    }
    if (arg === '--metrics-path' && i + 1 < argv.length) {
      out.metricsPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const policyInline = parseInline('--policy-path');
    if (policyInline !== null) {
      out.policyPath = policyInline;
      continue;
    }
    if (arg === '--policy-path' && i + 1 < argv.length) {
      out.policyPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    const extraSsotInline = parseInline('--extra-ssot-path');
    if (extraSsotInline !== null) {
      out.extraSsotPath = extraSsotInline;
      continue;
    }
    if (arg === '--extra-ssot-path' && i + 1 < argv.length) {
      out.extraSsotPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
  }

  return out;
}

export function evaluateComputeWaveInputHashState(input = {}) {
  const profile = String(input.profile || process.env.WAVE_PROFILE || 'pr').trim() || 'pr';
  const gateTier = String(input.gateTier || process.env.WAVE_GATE_TIER || 'core').trim() || 'core';
  const scopeFlags = parseScopeFlags(input.scopeFlags || process.env.XPLAT_SCOPE_FLAGS || process.env.SCOPE_FLAGS || '');
  const policyPath = String(
    input.policyPath || process.env.WAVE_FRESHNESS_POLICY_PATH || DEFAULT_WAVE_FRESHNESS_POLICY_PATH,
  ).trim();

  const stageState = isObjectRecord(input.stageState)
    ? input.stageState
    : evaluateResolveActiveStageState({
      profile,
      gateTier,
      scopeFlags,
      planPath: input.planPath,
      scopeflagsPath: input.scopeflagsPath,
      recordPath: input.recordPath,
      schemaPath: input.schemaPath,
      metricsPath: input.metricsPath,
      promotionMode: input.promotionMode,
      planDoc: input.planDoc,
      scopeflagsDoc: input.scopeflagsDoc,
      recordDoc: input.recordDoc,
      schemaDoc: input.schemaDoc,
      metricsDoc: input.metricsDoc,
    });

  const policyDoc = isObjectRecord(input.policyDoc) ? input.policyDoc : readJsonObject(policyPath);

  const stagePaths = isObjectRecord(stageState.paths) ? stageState.paths : {};
  const stageAlwaysOnSsot = toUniqueSortedStrings([
    String(stagePaths.planPath || ''),
    String(stagePaths.scopeflagsPath || ''),
    String(stagePaths.schemaPath || ''),
    String(stagePaths.recordPath || ''),
    String(stagePaths.metricsPath || ''),
  ].map((filePath) => normalizeRepoRelativePath(filePath)).filter(Boolean));

  const extraSsotPathsRaw = Array.isArray(input.extraSsotPaths)
    ? input.extraSsotPaths
    : String(input.extraSsotPath || '').split(/[\s,;]+/u);
  const extraSsotPaths = toUniqueSortedStrings(extraSsotPathsRaw.map((value) => normalizeRepoRelativePath(value)).filter(Boolean));

  const relevantSsotPaths = toUniqueSortedStrings([
    ...ALWAYS_ON_SSOT,
    ...stageAlwaysOnSsot,
    ...(Array.isArray(stageState.relevantStageGatedSsot) ? stageState.relevantStageGatedSsot : []),
    ...extraSsotPaths,
  ].map((filePath) => normalizeRepoRelativePath(filePath)).filter(Boolean));

  const scriptPaths = toUniqueSortedStrings(
    WAVE_SCRIPT_FILES.map((filePath) => normalizeRepoRelativePath(filePath)).filter(Boolean),
  );
  const lockPaths = toUniqueSortedStrings(
    WAVE_LOCK_FILES.map((filePath) => normalizeRepoRelativePath(filePath)).filter(Boolean),
  );

  const ssotFingerprints = collectFileFingerprints(relevantSsotPaths);
  const scriptFingerprints = collectFileFingerprints(scriptPaths);
  const lockFingerprints = collectFileFingerprints(lockPaths);

  const missingFiles = toUniqueSortedStrings([
    ...ssotFingerprints.missing,
    ...scriptFingerprints.missing,
    ...lockFingerprints.missing,
  ]);

  const ttlClass = classifyTtlClass(profile, gateTier);
  const ttlSec = resolveTtlSeconds(policyDoc, ttlClass);

  const hashPayload = {
    schemaVersion: 'wave-input-hash.v1',
    profile,
    gateTier,
    scopeFlags,
    stage: {
      stageActive: Number(stageState.STAGE_ACTIVE) === 1 ? 1 : 0,
      activeStageId: String(stageState.ACTIVE_STAGE_ID || 'NONE'),
      activeScopeFlags: Array.isArray(stageState.ACTIVE_SCOPEFLAGS)
        ? toUniqueSortedStrings(stageState.ACTIVE_SCOPEFLAGS)
        : [],
      relevantStageGatedSsot: Array.isArray(stageState.relevantStageGatedSsot)
        ? toUniqueSortedStrings(stageState.relevantStageGatedSsot)
        : [],
      stageActivationOk: Number(stageState.STAGE_ACTIVATION_OK) === 1 ? 1 : 0,
    },
    policy: {
      path: policyPath,
      schemaVersion: String(policyDoc && policyDoc.schemaVersion ? policyDoc.schemaVersion : ''),
      ttlClass,
      ttlSec,
      reuseRule: String(policyDoc && policyDoc.reuseRule ? policyDoc.reuseRule : ''),
    },
    ssotFiles: ssotFingerprints.files,
    scriptFiles: scriptFingerprints.files,
    lockFiles: lockFingerprints.files,
  };

  const hashInput = stableStringify(hashPayload);
  const waveInputHash = missingFiles.length === 0 ? sha256Bytes(hashInput) : '';

  const failSignals = [];
  if (missingFiles.length > 0) failSignals.push('E_WAVE_RESULT_STALE');
  if (Number(stageState.STAGE_ACTIVATION_OK) !== 1) {
    for (const signal of Array.isArray(stageState.failSignals) ? stageState.failSignals : []) {
      if (!failSignals.includes(signal)) failSignals.push(signal);
    }
  }

  const ok = waveInputHash.length === 64 && Number(stageState.STAGE_ACTIVATION_OK) === 1;

  return {
    ok,
    WAVE_INPUT_HASH: waveInputHash,
    WAVE_INPUT_HASH_PRESENT: waveInputHash.length === 64 ? 1 : 0,
    ttlClass,
    ttlSec,
    failReason: ok ? '' : (failSignals[0] || 'E_WAVE_RESULT_STALE'),
    failSignals: toUniqueSortedStrings(failSignals),
    missingFiles,
    inputs: {
      profile,
      gateTier,
      scopeFlags,
      ssotFiles: ssotFingerprints.files,
      scriptFiles: scriptFingerprints.files,
      lockFiles: lockFingerprints.files,
      policyPath,
      extraSsotPaths,
    },
    stage: {
      STAGE_ACTIVATION_OK: Number(stageState.STAGE_ACTIVATION_OK) === 1 ? 1 : 0,
      STAGE_ACTIVE: Number(stageState.STAGE_ACTIVE) === 1 ? 1 : 0,
      ACTIVE_STAGE_ID: String(stageState.ACTIVE_STAGE_ID || 'NONE'),
      ACTIVE_SCOPEFLAGS: Array.isArray(stageState.ACTIVE_SCOPEFLAGS)
        ? toUniqueSortedStrings(stageState.ACTIVE_SCOPEFLAGS)
        : [],
      RELEVANT_STAGE_GATED_SSOT_COUNT: Number(stageState.RELEVANT_STAGE_GATED_SSOT_COUNT) || 0,
      relevantStageGatedSsot: Array.isArray(stageState.relevantStageGatedSsot)
        ? toUniqueSortedStrings(stageState.relevantStageGatedSsot)
        : [],
      failSignals: Array.isArray(stageState.failSignals)
        ? toUniqueSortedStrings(stageState.failSignals)
        : [],
      failReason: String(stageState.failReason || ''),
    },
  };
}

function printHuman(state) {
  console.log(`WAVE_INPUT_HASH_PRESENT=${state.WAVE_INPUT_HASH_PRESENT}`);
  console.log(`WAVE_INPUT_HASH=${state.WAVE_INPUT_HASH}`);
  console.log(`WAVE_TTL_CLASS=${state.ttlClass}`);
  console.log(`WAVE_TTL_SEC=${state.ttlSec}`);
  console.log(`WAVE_FAIL_REASON=${state.failReason}`);
  console.log(`WAVE_FAIL_SIGNALS=${JSON.stringify(state.failSignals)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateComputeWaveInputHashState({
    profile: args.profile,
    gateTier: args.gateTier,
    scopeFlags: args.scopeFlags,
    planPath: args.planPath,
    scopeflagsPath: args.scopeflagsPath,
    recordPath: args.recordPath,
    schemaPath: args.schemaPath,
    metricsPath: args.metricsPath,
    policyPath: args.policyPath,
    extraSsotPath: args.extraSsotPath,
  });

  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }

  process.exit(state.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
