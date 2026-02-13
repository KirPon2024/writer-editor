#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluateGenerateRequiredTokenSetState as defaultGeneratorEvaluator } from './generate-required-token-set.mjs';

const TOKEN_NAME = 'CONDITIONAL_GATES_BOUND_OK';
const FAIL_CODE = 'E_CONDITIONAL_GATE_MISAPPLIED';
const DEFAULT_PROFILE_PATH = 'docs/OPS/EXECUTION/EXECUTION_PROFILE.example.json';

const PERF_TOKEN = 'PERF_BASELINE_OK';
const SCR_TOKEN = 'SCR_SHARED_CODE_RATIO_OK';

const CASES = Object.freeze([
  Object.freeze({
    id: 'A_RELEASE_SCOPE_PERF_0',
    token: PERF_TOKEN,
    flag: 'RELEASE_SCOPE_PERF',
    flagValue: false,
    expectIncluded: false,
  }),
  Object.freeze({
    id: 'B_RELEASE_SCOPE_PERF_1',
    token: PERF_TOKEN,
    flag: 'RELEASE_SCOPE_PERF',
    flagValue: true,
    expectIncluded: true,
  }),
  Object.freeze({
    id: 'C_ECONOMIC_CLAIM_SHARED_CODE_0',
    token: SCR_TOKEN,
    flag: 'ECONOMIC_CLAIM_SHARED_CODE',
    flagValue: false,
    expectIncluded: false,
  }),
  Object.freeze({
    id: 'D_ECONOMIC_CLAIM_SHARED_CODE_1',
    token: SCR_TOKEN,
    flag: 'ECONOMIC_CLAIM_SHARED_CODE',
    flagValue: true,
    expectIncluded: true,
  }),
]);

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortObject(item));
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

function uniqueSortedTokens(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0))]
    .sort((a, b) => a.localeCompare(b));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readProfileDoc(profilePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeProfileForCase(baseProfile, override) {
  const profile = cloneJson(baseProfile);
  if (!isObjectRecord(profile.scopeFlags)) profile.scopeFlags = {};
  if (!isObjectRecord(profile.requiredSets)) profile.requiredSets = {};
  const releaseBase = uniqueSortedTokens([
    ...(Array.isArray(profile.requiredSets.release) ? profile.requiredSets.release : []),
    PERF_TOKEN,
    SCR_TOKEN,
  ]);
  profile.requiredSets.release = releaseBase;
  profile.scopeFlags[override.flag] = override.flagValue;
  if (override.flag === 'RELEASE_SCOPE_PERF') {
    profile.requirePerfBaseline = override.flagValue;
  }
  if (override.flag === 'ECONOMIC_CLAIM_SHARED_CODE') {
    profile.economicClaimDeclared = override.flagValue;
    profile.requireScrSharedRatio = override.flagValue;
  }
  return profile;
}

function readReleaseRequiredTokens(generatorState) {
  const release = generatorState
    && generatorState.requiredTokenSet
    && generatorState.requiredTokenSet.requiredSets
    ? generatorState.requiredTokenSet.requiredSets.release
    : [];
  return uniqueSortedTokens(release);
}

function normalizeIssues(issues) {
  return [...issues].sort((a, b) => {
    const caseA = String(a.caseId || '');
    const caseB = String(b.caseId || '');
    if (caseA !== caseB) return caseA.localeCompare(caseB);
    const tokenA = String(a.token || '');
    const tokenB = String(b.token || '');
    if (tokenA !== tokenB) return tokenA.localeCompare(tokenB);
    const reasonA = String(a.reason || '');
    const reasonB = String(b.reason || '');
    return reasonA.localeCompare(reasonB);
  });
}

async function loadGeneratorEvaluator(modulePathArg) {
  const raw = String(modulePathArg || '').trim();
  if (!raw) {
    return {
      evaluator: defaultGeneratorEvaluator,
      modulePath: 'scripts/ops/generate-required-token-set.mjs',
      loadError: '',
    };
  }

  const absPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  const href = pathToFileURL(absPath).href;
  try {
    const loaded = await import(href);
    if (typeof loaded.evaluateGenerateRequiredTokenSetState !== 'function') {
      return {
        evaluator: null,
        modulePath: absPath,
        loadError: 'GENERATOR_EVALUATOR_MISSING',
      };
    }
    return {
      evaluator: loaded.evaluateGenerateRequiredTokenSetState,
      modulePath: absPath,
      loadError: '',
    };
  } catch {
    return {
      evaluator: null,
      modulePath: absPath,
      loadError: 'GENERATOR_MODULE_LOAD_FAILED',
    };
  }
}

function evaluateCase(evaluator, profilePath, baseProfile, spec) {
  const profileDoc = normalizeProfileForCase(baseProfile, {
    flag: spec.flag,
    flagValue: spec.flagValue,
  });
  const generatorState = evaluator({
    profilePath,
    profileDoc,
    writeLock: false,
  });
  const releaseRequired = readReleaseRequiredTokens(generatorState);
  const included = releaseRequired.includes(spec.token);
  const generatorOk = generatorState && generatorState.ok === true;
  const pass = generatorOk && included === spec.expectIncluded;

  return {
    caseId: spec.id,
    token: spec.token,
    flag: spec.flag,
    flagValue: spec.flagValue,
    expectedIncluded: spec.expectIncluded,
    actualIncluded: included,
    generatorOk,
    pass,
    generatorFailures: uniqueSortedTokens(generatorState && generatorState.failures),
  };
}

function buildState(input) {
  const issues = normalizeIssues(input.issues || []);
  const ok = issues.length === 0;
  return {
    ok,
    [TOKEN_NAME]: ok ? 1 : 0,
    failSignalCode: ok ? '' : FAIL_CODE,
    failSignal: ok
      ? null
      : {
        code: FAIL_CODE,
        details: {
          issues,
        },
      },
    profilePath: input.profilePath,
    generatorModulePath: input.generatorModulePath,
    cases: input.cases,
    issues,
  };
}

export async function evaluateConditionalGatesState(input = {}) {
  const profilePath = String(
    input.profilePath || process.env.EXECUTION_PROFILE_PATH || DEFAULT_PROFILE_PATH,
  ).trim();
  const generatorModulePath = String(input.generatorModulePath || '').trim();

  const baseProfile = readProfileDoc(profilePath);
  if (!baseProfile) {
    return buildState({
      profilePath,
      generatorModulePath: generatorModulePath || 'scripts/ops/generate-required-token-set.mjs',
      cases: [],
      issues: [
        {
          caseId: 'PROFILE_READ',
          reason: 'PROFILE_INVALID_OR_MISSING',
        },
      ],
    });
  }

  const evaluatorState = await loadGeneratorEvaluator(generatorModulePath);
  if (!evaluatorState.evaluator) {
    return buildState({
      profilePath,
      generatorModulePath: evaluatorState.modulePath,
      cases: [],
      issues: [
        {
          caseId: 'GENERATOR_LOAD',
          reason: evaluatorState.loadError,
        },
      ],
    });
  }

  const results = [];
  const issues = [];
  for (const spec of CASES) {
    const result = evaluateCase(
      evaluatorState.evaluator,
      profilePath,
      baseProfile,
      spec,
    );
    results.push(result);
    if (!result.pass) {
      issues.push({
        caseId: result.caseId,
        token: result.token,
        reason: result.generatorOk ? 'CONDITION_MISMATCH' : 'GENERATOR_NOT_OK',
        expectedIncluded: result.expectedIncluded,
        actualIncluded: result.actualIncluded,
        generatorFailures: result.generatorFailures,
      });
    }
  }

  return buildState({
    profilePath,
    generatorModulePath: evaluatorState.modulePath,
    cases: results,
    issues,
  });
}

function parseArgs(argv) {
  const out = {
    json: false,
    profilePath: '',
    generatorModulePath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--profile-path' && i + 1 < argv.length) {
      out.profilePath = String(argv[i + 1] || '').trim();
      i += 1;
    }
    if (arg === '--generator-module' && i + 1 < argv.length) {
      out.generatorModulePath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`CONDITIONAL_GATES_PROFILE_PATH=${state.profilePath}`);
  console.log(`CONDITIONAL_GATES_GENERATOR_MODULE=${state.generatorModulePath}`);
  console.log(`CONDITIONAL_GATES_CASES=${JSON.stringify(state.cases)}`);
  if (!state.ok) {
    console.log(`FAIL_REASON=${state.failSignalCode}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = await evaluateConditionalGatesState({
    profilePath: args.profilePath || undefined,
    generatorModulePath: args.generatorModulePath || undefined,
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
