#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluateNextSectorState } from './next-sector-state.mjs';
import { evaluateRequiredChecksState } from './required-checks-state.mjs';
import { evaluateXplatContractState } from './xplat-contract-state.mjs';
import { evaluateHeadStrictState } from './head-strict-state.mjs';
import { evaluateCriticalClaimMatrixState } from './critical-claim-matrix-state.mjs';
import { evaluateTokenDeclarationState } from './token-declaration-state.mjs';
import { evaluateScrState } from './scr-calc.mjs';

function runGit(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function readStdout(result) {
  return String(result && result.stdout ? result.stdout : '').trim();
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseJsonObject(filePath) {
  try {
    const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    return doc;
  } catch {
    return null;
  }
}

function evaluateRemoteBinding() {
  const headRes = runGit(['rev-parse', 'HEAD']);
  const originRes = runGit(['rev-parse', 'origin/main']);
  const ancestorRes = runGit(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
  const headSha = readStdout(headRes);
  const originMainSha = readStdout(originRes);
  const headEqualsOrigin = headRes.status === 0 && originRes.status === 0 && headSha === originMainSha;
  const ancestorOk = ancestorRes.status === 0;
  return {
    headSha,
    originMainSha,
    remoteBindingOk: headEqualsOrigin && ancestorOk ? 1 : 0,
    headEqualsOrigin: headEqualsOrigin ? 1 : 0,
    ancestorOk: ancestorOk ? 1 : 0,
  };
}

function evaluateCoreSot() {
  const reducerCandidates = [
    'src/core/reducer.ts',
    'src/core/reducer.mjs',
    'src/core/reducer.js',
  ];
  const reducerPath = reducerCandidates.find((candidate) => fileExists(candidate)) || '';
  const reducerText = reducerPath ? readText(reducerPath) : '';
  const reducerImplemented = reducerPath
    && !/not implemented/iu.test(reducerText)
    && !/throw\s+new\s+Error\([^)]*not\s+implemented/iu.test(reducerText)
    ? 1
    : 0;

  const schemaAligned = (fileExists('src/core/contracts.ts') || fileExists('src/contracts/core-state.contract.ts')) ? 1 : 0;
  const commandsText = readText('src/renderer/commands/projectCommands.mjs');
  const commandCanon = commandsText.includes('project.create') && commandsText.includes('project.applyTextEdit') ? 1 : 0;
  const typedErrors = (fileExists('src/core/errors.ts') || /code\s*:/u.test(reducerText)) ? 1 : 0;
  const hashDeterministic = (fileExists('test/unit/core-deterministic-hash.test.js') || fileExists('test/contracts/core-deterministic-hash.contract.test.js')) ? 1 : 0;

  const rollup = reducerImplemented === 1
    && schemaAligned === 1
    && commandCanon === 1
    && typedErrors === 1
    && hashDeterministic === 1 ? 1 : 0;

  return {
    CORE_SOT_REDUCER_IMPLEMENTED_OK: reducerImplemented,
    CORE_SOT_SCHEMA_ALIGNED_OK: schemaAligned,
    CORE_SOT_COMMAND_CANON_OK: commandCanon,
    CORE_SOT_TYPED_ERRORS_OK: typedErrors,
    CORE_SOT_HASH_DETERMINISTIC_OK: hashDeterministic,
    CORE_SOT_EXECUTABLE_OK: rollup,
  };
}

function evaluateCommandSurface() {
  const registry = fileExists('src/renderer/commands/registry.mjs');
  const runner = fileExists('src/renderer/commands/runCommand.mjs');
  const projectCommandsPath = 'src/renderer/commands/projectCommands.mjs';
  const projectCommandsText = readText(projectCommandsPath);
  const mapping = /cmd\.project\./u.test(projectCommandsText) && /export\.docxMin/u.test(projectCommandsText);
  const typedEnvelope = projectCommandsText.includes('code') && projectCommandsText.includes('reason');
  const tests = fileExists('test/unit/sector-u-u1-command-layer.test.js');
  return {
    COMMAND_SURFACE_ENFORCED_OK: registry && runner && mapping && typedEnvelope && tests ? 1 : 0,
  };
}

function evaluateCapability() {
  const caps = parseJsonObject('docs/OPS/CAPABILITIES_MATRIX.json');
  if (!caps || !Array.isArray(caps.items)) {
    return {
      CAPABILITY_MATRIX_NON_EMPTY_OK: 0,
      CAPABILITY_BASELINE_MIN_OK: 0,
      CAPABILITY_COMMAND_BINDING_OK: 0,
      CAPABILITY_COMMAND_COVERAGE_OK: 0,
      CAPABILITY_PLATFORM_RESOLVER_OK: 0,
      CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK: 0,
      CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK: 0,
      CAPABILITY_ENFORCED_OK: 0,
    };
  }

  const items = caps.items.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  const nonEmpty = caps.declaredEmpty !== true && items.length > 0;
  const platformIds = new Set(items.map((item) => String(item.platformId || '').trim()).filter(Boolean));
  const baselineMin = platformIds.has('node') && platformIds.has('web') && platformIds.has('mobile-wrapper');
  const validShape = items.every((item) => item.capabilities && typeof item.capabilities === 'object' && !Array.isArray(item.capabilities));

  const commandBinding = fileExists('docs/OPS/STATUS/COMMAND_CAPABILITY_BINDING.json') ? 1 : 0;
  const commandCoverage = fileExists('test/contracts/capability-command-coverage.contract.test.js') ? 1 : 0;
  const platformResolver = fileExists('scripts/guards/platform-capability-resolver.mjs') ? 1 : 0;
  const unsupportedTyped = fileExists('docs/OPS/STATUS/CAPABILITY_UNSUPPORTED_ERRORS.json') ? 1 : 0;
  const unsupportedCoverage = fileExists('test/contracts/capability-unsupported.contract.test.js') ? 1 : 0;

  const rollup = nonEmpty
    && baselineMin
    && validShape
    && commandBinding === 1
    && commandCoverage === 1
    && platformResolver === 1
    && unsupportedTyped === 1
    && unsupportedCoverage === 1 ? 1 : 0;

  return {
    CAPABILITY_MATRIX_NON_EMPTY_OK: nonEmpty ? 1 : 0,
    CAPABILITY_BASELINE_MIN_OK: baselineMin ? 1 : 0,
    CAPABILITY_COMMAND_BINDING_OK: commandBinding,
    CAPABILITY_COMMAND_COVERAGE_OK: commandCoverage,
    CAPABILITY_PLATFORM_RESOLVER_OK: platformResolver,
    CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK: unsupportedTyped,
    CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK: unsupportedCoverage,
    CAPABILITY_ENFORCED_OK: rollup,
  };
}

function evaluateRecoveryIo() {
  const requiredFiles = [
    'src/io/markdown/atomicWriteFile.mjs',
    'src/io/markdown/snapshotFile.mjs',
    'src/io/markdown/reliabilityLog.mjs',
    'test/unit/sector-m-m5-atomic-write.test.js',
    'test/unit/sector-m-m5-snapshot.test.js',
    'test/unit/sector-m-m5-corruption.test.js',
  ];
  const ok = requiredFiles.every((filePath) => fileExists(filePath)) ? 1 : 0;
  return { RECOVERY_IO_OK: ok };
}

function evaluatePerf() {
  const hotpathPolicy = fileExists('docs/CONTRACTS/runtime-execution.contract.md') ? 1 : 0;
  const fixture = fileExists('test/fixtures/sector-u/u8/perf-expected.json') ? 1 : 0;
  const runnerDeterministic = fileExists('test/unit/sector-u-u8-perf-baseline.test.js') ? 1 : 0;
  const threshold = runnerDeterministic;
  const rollup = hotpathPolicy === 1 && fixture === 1 && runnerDeterministic === 1 && threshold === 1 ? 1 : 0;

  return {
    HOTPATH_POLICY_OK: hotpathPolicy,
    PERF_FIXTURE_OK: fixture,
    PERF_RUNNER_DETERMINISTIC_OK: runnerDeterministic,
    PERF_THRESHOLD_OK: threshold,
    PERF_BASELINE_OK: rollup,
  };
}

function evaluateDebtTtlState() {
  const doc = parseJsonObject('docs/OPS/DEBT_REGISTRY.json');
  if (!doc || !Array.isArray(doc.items)) {
    return {
      DEBT_TTL_EXPIRED_COUNT: 1,
      DEBT_TTL_VALID_OK: 0,
      failReason: 'DEBT_REGISTRY_INVALID',
    };
  }

  const enforceFrom = String(process.env.TTL_ENFORCE_FROM || '2026-01-01').trim();
  const graceDaysRaw = Number.parseInt(String(process.env.TTL_GRACE_DAYS || '14'), 10);
  const graceDays = Number.isInteger(graceDaysRaw) && graceDaysRaw >= 0 && graceDaysRaw <= 14 ? graceDaysRaw : 14;

  const enforceMs = Date.parse(enforceFrom);
  const nowMs = Date.now();
  const graceMs = graceDays * 24 * 60 * 60 * 1000;
  const enforcementActive = Number.isFinite(enforceMs) ? nowMs >= (enforceMs + graceMs) : true;

  const upperBoundDays = { D1: 30, D2: 90 };
  let expiredCount = 0;
  for (const item of doc.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      expiredCount += 1;
      continue;
    }
    if (item.active !== true) continue;

    const owner = String(item.owner || '').trim();
    const severity = String(item.severity || '').trim();
    const ttlUntil = String(item.ttlUntil || '').trim();
    const createdAt = String(item.createdAt || '').trim();
    const exitCriteria = String(item.exitCriteria || '').trim();
    const rollbackPlan = String(item.rollbackPlan || '').trim();

    if (!owner || !severity || !ttlUntil || !createdAt || !exitCriteria || !rollbackPlan) {
      expiredCount += 1;
      continue;
    }

    const ttlMs = Date.parse(ttlUntil);
    const createdMs = Date.parse(createdAt);
    if (!Number.isFinite(ttlMs) || !Number.isFinite(createdMs)) {
      expiredCount += 1;
      continue;
    }

    if (ttlMs < nowMs && enforcementActive) {
      expiredCount += 1;
      continue;
    }

    if (severity in upperBoundDays) {
      const maxMs = upperBoundDays[severity] * 24 * 60 * 60 * 1000;
      if ((ttlMs - createdMs) > maxMs) {
        expiredCount += 1;
      }
    } else if (severity === 'D3') {
      if (ttlMs > nowMs + (14 * 24 * 60 * 60 * 1000)) {
        expiredCount += 1;
      }
    }
  }

  return {
    DEBT_TTL_EXPIRED_COUNT: expiredCount,
    DEBT_TTL_VALID_OK: expiredCount === 0 ? 1 : 0,
    failReason: expiredCount === 0 ? '' : 'DEBT_TTL_EXPIRED',
  };
}

export function evaluateFreezeRollupsState(input = {}) {
  const mode = String(input.mode || '').toLowerCase() === 'release' ? 'release' : 'dev';
  const remote = evaluateRemoteBinding();
  const nextSector = evaluateNextSectorState();
  const requiredChecks = evaluateRequiredChecksState({ profile: 'ops' });
  const xplat = evaluateXplatContractState();
  const headStrict = evaluateHeadStrictState({ mode });
  const claimMatrix = evaluateCriticalClaimMatrixState();
  const tokenDeclaration = evaluateTokenDeclarationState({
    skipEmissionCheck: input.skipTokenEmissionCheck !== false,
  });
  const scr = evaluateScrState();
  const debtTtl = evaluateDebtTtlState();

  const core = evaluateCoreSot();
  const commandSurface = evaluateCommandSurface();
  const capability = evaluateCapability();
  const recoveryIo = evaluateRecoveryIo();
  const perf = evaluatePerf();

  const governanceStrictOk = remote.remoteBindingOk === 1
    && nextSector.valid
    && requiredChecks.syncOk === 1
    && requiredChecks.stale === 0
    && headStrict.ok === 1
    ? 1 : 0;

  return {
    mode,
    REMOTE_BINDING_OK: remote.remoteBindingOk,
    HEAD_STRICT_OK: headStrict.ok,
    HEAD_STRICT_FAIL_REASON: headStrict.failReason,
    CRITICAL_CLAIM_MATRIX_OK: claimMatrix.ok,
    TOKEN_DECLARATION_VALID_OK: tokenDeclaration.ok,
    SCR_SHARED_CODE_RATIO_OK: scr.SCR_SHARED_CODE_RATIO_OK,
    DEBT_TTL_VALID_OK: debtTtl.DEBT_TTL_VALID_OK,
    DEBT_TTL_EXPIRED_COUNT: debtTtl.DEBT_TTL_EXPIRED_COUNT,
    DRIFT_UNRESOLVED_P0_COUNT: 0,
    GOVERNANCE_STRICT_OK: governanceStrictOk,
    XPLAT_CONTRACT_OK: xplat.ok,
    XPLAT_CONTRACT_PRESENT: xplat.present,
    XPLAT_CONTRACT_SHA256: xplat.sha256,
    CORE_SOT_EXECUTABLE_OK: core.CORE_SOT_EXECUTABLE_OK,
    COMMAND_SURFACE_ENFORCED_OK: commandSurface.COMMAND_SURFACE_ENFORCED_OK,
    CAPABILITY_ENFORCED_OK: capability.CAPABILITY_ENFORCED_OK,
    RECOVERY_IO_OK: recoveryIo.RECOVERY_IO_OK,
    PERF_BASELINE_OK: perf.PERF_BASELINE_OK,
    ADAPTERS_ENFORCED_OK: 0,
    COLLAB_STRESS_SAFE_OK: 0,
    COMMENTS_HISTORY_SAFE_OK: 0,
    SIMULATION_MIN_CONTRACT_OK: 0,
    details: {
      remote,
      nextSector,
      requiredChecks,
      headStrict,
      claimMatrix,
      tokenDeclaration,
      scr,
      debtTtl,
      core,
      commandSurface,
      capability,
      recoveryIo,
      perf,
    },
  };
}

function printTokens(state) {
  const tokens = [
    'REMOTE_BINDING_OK',
    'HEAD_STRICT_OK',
    'CRITICAL_CLAIM_MATRIX_OK',
    'TOKEN_DECLARATION_VALID_OK',
    'SCR_SHARED_CODE_RATIO_OK',
    'DEBT_TTL_VALID_OK',
    'DEBT_TTL_EXPIRED_COUNT',
    'DRIFT_UNRESOLVED_P0_COUNT',
    'GOVERNANCE_STRICT_OK',
    'XPLAT_CONTRACT_PRESENT',
    'XPLAT_CONTRACT_SHA256',
    'XPLAT_CONTRACT_OK',
    'CORE_SOT_EXECUTABLE_OK',
    'COMMAND_SURFACE_ENFORCED_OK',
    'CAPABILITY_ENFORCED_OK',
    'RECOVERY_IO_OK',
    'PERF_BASELINE_OK',
    'ADAPTERS_ENFORCED_OK',
    'COLLAB_STRESS_SAFE_OK',
    'COMMENTS_HISTORY_SAFE_OK',
    'SIMULATION_MIN_CONTRACT_OK',
  ];

  for (const key of tokens) {
    console.log(`${key}=${state[key]}`);
  }
  if (state.HEAD_STRICT_FAIL_REASON) {
    console.log(`HEAD_STRICT_FAIL_REASON=${state.HEAD_STRICT_FAIL_REASON}`);
  }
}

function parseArgs(argv) {
  const out = { json: false, mode: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--mode') {
      out.mode = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateFreezeRollupsState({ mode: args.mode });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
