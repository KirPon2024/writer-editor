#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { evaluateNextSectorState } from './next-sector-state.mjs';
import { evaluateXplatContractState } from './xplat-contract-state.mjs';
import { evaluateRequiredChecksState } from './required-checks-state.mjs';
import { evaluateFreezeRollupsState } from './freeze-rollups-state.mjs';

const REQUIRED_OPS_SCRIPTS = [
  'scripts/ops/check-merge-readiness.mjs',
  'scripts/ops/emit-ops-summary.mjs',
  'scripts/ops/extract-truth-table.mjs',
];

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' });
}

function readStdout(result) {
  return String(result && result.stdout ? result.stdout : '').trim();
}

function parseArgs(argv) {
  const out = { format: 'md' };
  for (const arg of argv) {
    if (arg === '--json') out.format = 'json';
    if (arg === '--md') out.format = 'md';
  }
  return out;
}

function buildTruthTable() {
  const headRes = run('git', ['rev-parse', 'HEAD']);
  const originRes = run('git', ['rev-parse', 'origin/main']);
  const ancestorRes = run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);

  const headSha = readStdout(headRes);
  const originMainSha = readStdout(originRes);
  const remoteBindingOk = headRes.status === 0 && originRes.status === 0 && ancestorRes.status === 0 && headSha === originMainSha;
  const opsBaselineFilesOk = REQUIRED_OPS_SCRIPTS.every((filePath) => fs.existsSync(filePath));
  const doctorScriptOk = fs.existsSync('scripts/doctor.mjs');
  const nextSector = evaluateNextSectorState();
  const xplat = evaluateXplatContractState();
  const requiredChecks = evaluateRequiredChecksState({ profile: 'ops' });
  const freezeRollups = evaluateFreezeRollupsState({
    mode: 'release',
    skipTokenEmissionCheck: true,
  });

  return {
    schemaVersion: 'truth-table.v1',
    generatedAt: new Date().toISOString(),
    NEXT_SECTOR_VALID: nextSector.valid ? 1 : 0,
    NEXT_SECTOR_MODE: nextSector.mode || '',
    NEXT_SECTOR_ID: nextSector.id || '',
    NEXT_SECTOR_REASON: nextSector.reason || '',
    NEXT_SECTOR_FAIL_REASON: nextSector.failReason || '',
    XPLAT_CONTRACT_PRESENT: xplat.present,
    XPLAT_CONTRACT_SHA256: xplat.sha256,
    XPLAT_CONTRACT_OK: xplat.ok,
    REQUIRED_CHECKS_SYNC_OK: requiredChecks.syncOk,
    REQUIRED_CHECKS_STALE: requiredChecks.stale,
    REQUIRED_CHECKS_SOURCE: requiredChecks.source,
    HEAD_STRICT_OK: freezeRollups.HEAD_STRICT_OK,
    CRITICAL_CLAIM_MATRIX_OK: freezeRollups.CRITICAL_CLAIM_MATRIX_OK,
    TOKEN_DECLARATION_VALID_OK: freezeRollups.TOKEN_DECLARATION_VALID_OK,
    SCR_RUNTIME_SHARED_RATIO_OK: freezeRollups.SCR_RUNTIME_SHARED_RATIO_OK,
    SCR_APP_TOTAL_SHARED_RATIO_INFO: freezeRollups.SCR_APP_TOTAL_SHARED_RATIO_INFO,
    SCR_SHARED_CODE_RATIO_OK: freezeRollups.SCR_SHARED_CODE_RATIO_OK,
    DEBT_TTL_VALID_OK: freezeRollups.DEBT_TTL_VALID_OK,
    DEBT_TTL_EXPIRED_COUNT: freezeRollups.DEBT_TTL_EXPIRED_COUNT,
    DRIFT_UNRESOLVED_P0_COUNT: freezeRollups.DRIFT_UNRESOLVED_P0_COUNT,
    CORE_SOT_REDUCER_IMPLEMENTED_OK: freezeRollups.CORE_SOT_REDUCER_IMPLEMENTED_OK,
    CORE_SOT_SCHEMA_ALIGNED_OK: freezeRollups.CORE_SOT_SCHEMA_ALIGNED_OK,
    CORE_SOT_COMMAND_CANON_OK: freezeRollups.CORE_SOT_COMMAND_CANON_OK,
    CORE_SOT_TYPED_ERRORS_OK: freezeRollups.CORE_SOT_TYPED_ERRORS_OK,
    CORE_SOT_HASH_DETERMINISTIC_OK: freezeRollups.CORE_SOT_HASH_DETERMINISTIC_OK,
    CORE_SOT_EXECUTABLE_OK: freezeRollups.CORE_SOT_EXECUTABLE_OK,
    COMMAND_SURFACE_ENFORCED_OK: freezeRollups.COMMAND_SURFACE_ENFORCED_OK,
    CAPABILITY_MATRIX_NON_EMPTY_OK: freezeRollups.CAPABILITY_MATRIX_NON_EMPTY_OK,
    CAPABILITY_BASELINE_MIN_OK: freezeRollups.CAPABILITY_BASELINE_MIN_OK,
    CAPABILITY_COMMAND_BINDING_OK: freezeRollups.CAPABILITY_COMMAND_BINDING_OK,
    CAPABILITY_COMMAND_COVERAGE_OK: freezeRollups.CAPABILITY_COMMAND_COVERAGE_OK,
    CAPABILITY_PLATFORM_RESOLVER_OK: freezeRollups.CAPABILITY_PLATFORM_RESOLVER_OK,
    CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK: freezeRollups.CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK,
    CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK: freezeRollups.CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK,
    CAPABILITY_ENFORCED_OK: freezeRollups.CAPABILITY_ENFORCED_OK,
    RECOVERY_ATOMIC_WRITE_OK: freezeRollups.RECOVERY_ATOMIC_WRITE_OK,
    RECOVERY_SNAPSHOT_OK: freezeRollups.RECOVERY_SNAPSHOT_OK,
    RECOVERY_CORRUPTION_OK: freezeRollups.RECOVERY_CORRUPTION_OK,
    RECOVERY_TYPED_ERRORS_OK: freezeRollups.RECOVERY_TYPED_ERRORS_OK,
    RECOVERY_REPLAY_OK: freezeRollups.RECOVERY_REPLAY_OK,
    RECOVERY_ACTION_CANON_OK: freezeRollups.RECOVERY_ACTION_CANON_OK,
    RECOVERY_IO_OK: freezeRollups.RECOVERY_IO_OK,
    HOTPATH_POLICY_OK: freezeRollups.HOTPATH_POLICY_OK,
    PERF_FIXTURE_OK: freezeRollups.PERF_FIXTURE_OK,
    PERF_RUNNER_DETERMINISTIC_OK: freezeRollups.PERF_RUNNER_DETERMINISTIC_OK,
    PERF_THRESHOLD_OK: freezeRollups.PERF_THRESHOLD_OK,
    PERF_BASELINE_OK: freezeRollups.PERF_BASELINE_OK,
    GOVERNANCE_STRICT_OK: freezeRollups.GOVERNANCE_STRICT_OK,
    ADAPTERS_DECLARED_OK: freezeRollups.ADAPTERS_DECLARED_OK,
    ADAPTERS_BOUNDARY_TESTED_OK: freezeRollups.ADAPTERS_BOUNDARY_TESTED_OK,
    ADAPTERS_PARITY_OK: freezeRollups.ADAPTERS_PARITY_OK,
    ADAPTERS_ENFORCED_OK: freezeRollups.ADAPTERS_ENFORCED_OK,
    COLLAB_STRESS_SAFE_OK: freezeRollups.COLLAB_STRESS_SAFE_OK,
    COMMENTS_HISTORY_SAFE_OK: freezeRollups.COMMENTS_HISTORY_SAFE_OK,
    SIMULATION_MIN_CONTRACT_OK: freezeRollups.SIMULATION_MIN_CONTRACT_OK,
    checks: [
      {
        id: 'REMOTE_BINDING',
        expected: true,
        actual: remoteBindingOk,
        pass: remoteBindingOk,
      },
      {
        id: 'OPS_BASELINE_FILES',
        expected: true,
        actual: opsBaselineFilesOk,
        pass: opsBaselineFilesOk,
      },
      {
        id: 'DOCTOR_SCRIPT_PRESENT',
        expected: true,
        actual: doctorScriptOk,
        pass: doctorScriptOk,
      },
      {
        id: 'NEXT_SECTOR_VALID',
        expected: true,
        actual: nextSector.valid,
        pass: nextSector.valid,
      },
      {
        id: 'XPLAT_CONTRACT_OK',
        expected: true,
        actual: xplat.ok === 1,
        pass: xplat.ok === 1,
      },
      {
        id: 'REQUIRED_CHECKS_SYNC_OK',
        expected: true,
        actual: requiredChecks.syncOk === 1,
        pass: requiredChecks.syncOk === 1,
      },
      {
        id: 'REQUIRED_CHECKS_STALE',
        expected: false,
        actual: requiredChecks.stale === 1,
        pass: requiredChecks.stale === 0,
      },
      {
        id: 'HEAD_STRICT_OK',
        expected: true,
        actual: freezeRollups.HEAD_STRICT_OK === 1,
        pass: freezeRollups.HEAD_STRICT_OK === 1,
      },
      {
        id: 'CRITICAL_CLAIM_MATRIX_OK',
        expected: true,
        actual: freezeRollups.CRITICAL_CLAIM_MATRIX_OK === 1,
        pass: freezeRollups.CRITICAL_CLAIM_MATRIX_OK === 1,
      },
      {
        id: 'TOKEN_DECLARATION_VALID_OK',
        expected: true,
        actual: freezeRollups.TOKEN_DECLARATION_VALID_OK === 1,
        pass: freezeRollups.TOKEN_DECLARATION_VALID_OK === 1,
      },
    ],
    context: {
      headSha,
      originMainSha,
      nextSector,
      xplat,
      requiredChecks,
      freezeRollups,
    },
  };
}

function emitMd(table) {
  console.log('| CHECK | EXPECTED | ACTUAL | PASS |');
  console.log('| --- | --- | --- | --- |');
  for (const row of table.checks) {
    console.log(`| ${row.id} | ${row.expected} | ${row.actual} | ${row.pass} |`);
  }
  console.log('');
  console.log(`HEAD_SHA=${table.context.headSha || 'unknown'}`);
  console.log(`ORIGIN_MAIN_SHA=${table.context.originMainSha || 'unknown'}`);
  console.log(`NEXT_SECTOR_ID=${table.NEXT_SECTOR_ID}`);
  console.log(`NEXT_SECTOR_MODE=${table.NEXT_SECTOR_MODE}`);
  console.log(`NEXT_SECTOR_REASON=${table.NEXT_SECTOR_REASON}`);
  console.log(`NEXT_SECTOR_VALID=${table.NEXT_SECTOR_VALID}`);
  console.log(`XPLAT_CONTRACT_PRESENT=${table.XPLAT_CONTRACT_PRESENT}`);
  console.log(`XPLAT_CONTRACT_SHA256=${table.XPLAT_CONTRACT_SHA256}`);
  console.log(`XPLAT_CONTRACT_OK=${table.XPLAT_CONTRACT_OK}`);
  console.log(`REQUIRED_CHECKS_SYNC_OK=${table.REQUIRED_CHECKS_SYNC_OK}`);
  console.log(`REQUIRED_CHECKS_STALE=${table.REQUIRED_CHECKS_STALE}`);
  console.log(`REQUIRED_CHECKS_SOURCE=${table.REQUIRED_CHECKS_SOURCE}`);
  console.log(`HEAD_STRICT_OK=${table.HEAD_STRICT_OK}`);
  console.log(`CRITICAL_CLAIM_MATRIX_OK=${table.CRITICAL_CLAIM_MATRIX_OK}`);
  console.log(`TOKEN_DECLARATION_VALID_OK=${table.TOKEN_DECLARATION_VALID_OK}`);
  console.log(`SCR_RUNTIME_SHARED_RATIO_OK=${table.SCR_RUNTIME_SHARED_RATIO_OK}`);
  console.log(`SCR_APP_TOTAL_SHARED_RATIO_INFO=${table.SCR_APP_TOTAL_SHARED_RATIO_INFO}`);
  console.log(`SCR_SHARED_CODE_RATIO_OK=${table.SCR_SHARED_CODE_RATIO_OK}`);
  console.log(`DEBT_TTL_VALID_OK=${table.DEBT_TTL_VALID_OK}`);
  console.log(`DEBT_TTL_EXPIRED_COUNT=${table.DEBT_TTL_EXPIRED_COUNT}`);
  console.log(`DRIFT_UNRESOLVED_P0_COUNT=${table.DRIFT_UNRESOLVED_P0_COUNT}`);
  console.log(`CORE_SOT_REDUCER_IMPLEMENTED_OK=${table.CORE_SOT_REDUCER_IMPLEMENTED_OK}`);
  console.log(`CORE_SOT_SCHEMA_ALIGNED_OK=${table.CORE_SOT_SCHEMA_ALIGNED_OK}`);
  console.log(`CORE_SOT_COMMAND_CANON_OK=${table.CORE_SOT_COMMAND_CANON_OK}`);
  console.log(`CORE_SOT_TYPED_ERRORS_OK=${table.CORE_SOT_TYPED_ERRORS_OK}`);
  console.log(`CORE_SOT_HASH_DETERMINISTIC_OK=${table.CORE_SOT_HASH_DETERMINISTIC_OK}`);
  console.log(`CORE_SOT_EXECUTABLE_OK=${table.CORE_SOT_EXECUTABLE_OK}`);
  console.log(`COMMAND_SURFACE_ENFORCED_OK=${table.COMMAND_SURFACE_ENFORCED_OK}`);
  console.log(`CAPABILITY_MATRIX_NON_EMPTY_OK=${table.CAPABILITY_MATRIX_NON_EMPTY_OK}`);
  console.log(`CAPABILITY_BASELINE_MIN_OK=${table.CAPABILITY_BASELINE_MIN_OK}`);
  console.log(`CAPABILITY_COMMAND_BINDING_OK=${table.CAPABILITY_COMMAND_BINDING_OK}`);
  console.log(`CAPABILITY_COMMAND_COVERAGE_OK=${table.CAPABILITY_COMMAND_COVERAGE_OK}`);
  console.log(`CAPABILITY_PLATFORM_RESOLVER_OK=${table.CAPABILITY_PLATFORM_RESOLVER_OK}`);
  console.log(`CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK=${table.CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK}`);
  console.log(`CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK=${table.CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK}`);
  console.log(`CAPABILITY_ENFORCED_OK=${table.CAPABILITY_ENFORCED_OK}`);
  console.log(`RECOVERY_ATOMIC_WRITE_OK=${table.RECOVERY_ATOMIC_WRITE_OK}`);
  console.log(`RECOVERY_SNAPSHOT_OK=${table.RECOVERY_SNAPSHOT_OK}`);
  console.log(`RECOVERY_CORRUPTION_OK=${table.RECOVERY_CORRUPTION_OK}`);
  console.log(`RECOVERY_TYPED_ERRORS_OK=${table.RECOVERY_TYPED_ERRORS_OK}`);
  console.log(`RECOVERY_REPLAY_OK=${table.RECOVERY_REPLAY_OK}`);
  console.log(`RECOVERY_ACTION_CANON_OK=${table.RECOVERY_ACTION_CANON_OK}`);
  console.log(`RECOVERY_IO_OK=${table.RECOVERY_IO_OK}`);
  console.log(`HOTPATH_POLICY_OK=${table.HOTPATH_POLICY_OK}`);
  console.log(`PERF_FIXTURE_OK=${table.PERF_FIXTURE_OK}`);
  console.log(`PERF_RUNNER_DETERMINISTIC_OK=${table.PERF_RUNNER_DETERMINISTIC_OK}`);
  console.log(`PERF_THRESHOLD_OK=${table.PERF_THRESHOLD_OK}`);
  console.log(`PERF_BASELINE_OK=${table.PERF_BASELINE_OK}`);
  console.log(`GOVERNANCE_STRICT_OK=${table.GOVERNANCE_STRICT_OK}`);
  console.log(`ADAPTERS_DECLARED_OK=${table.ADAPTERS_DECLARED_OK}`);
  console.log(`ADAPTERS_BOUNDARY_TESTED_OK=${table.ADAPTERS_BOUNDARY_TESTED_OK}`);
  console.log(`ADAPTERS_PARITY_OK=${table.ADAPTERS_PARITY_OK}`);
  console.log(`ADAPTERS_ENFORCED_OK=${table.ADAPTERS_ENFORCED_OK}`);
  console.log(`COLLAB_STRESS_SAFE_OK=${table.COLLAB_STRESS_SAFE_OK}`);
  console.log(`COMMENTS_HISTORY_SAFE_OK=${table.COMMENTS_HISTORY_SAFE_OK}`);
  console.log(`SIMULATION_MIN_CONTRACT_OK=${table.SIMULATION_MIN_CONTRACT_OK}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const table = buildTruthTable();
  if (args.format === 'json') {
    process.stdout.write(`${JSON.stringify(table, null, 2)}\n`);
  } else {
    emitMd(table);
  }
}

main();
