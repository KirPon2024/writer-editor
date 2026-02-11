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

function hasFile(filePath) {
  return fs.existsSync(filePath);
}

function evaluateDoctorDeliveryStrict() {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
    },
  });
  const stdout = String(result.stdout || '');
  const strictOk = result.status === 0
    && stdout.includes('DOCTOR_OK')
    && !stdout.includes('DOCTOR_WARN')
    && !stdout.includes('DOCTOR_INFO')
    && stdout.includes('EFFECTIVE_MODE=STRICT')
    && stdout.includes('PLACEHOLDER_INVARIANTS_COUNT=0')
    && stdout.includes('NO_SOURCE_INVARIANTS_COUNT=0')
    && stdout.includes('CONTOUR_C_EXIT_IMPLEMENTED_P0_OK=1')
    && stdout.includes('RUNTIME_INVARIANT_COVERAGE_OK=1');
  return {
    ok: strictOk ? 1 : 0,
    status: result.status,
  };
}

function main() {
  const branchRes = run('git', ['branch', '--show-current']);
  const headRes = run('git', ['rev-parse', 'HEAD']);
  const originRes = run('git', ['rev-parse', 'origin/main']);
  const ancestorRes = run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);

  const branch = readStdout(branchRes);
  const headSha = readStdout(headRes);
  const originMainSha = readStdout(originRes);
  const remoteBindingOk = headRes.status === 0 && originRes.status === 0 && ancestorRes.status === 0 && headSha === originMainSha;
  const scriptsOk = REQUIRED_OPS_SCRIPTS.every((filePath) => hasFile(filePath));
  const nextSector = evaluateNextSectorState();
  const xplat = evaluateXplatContractState();
  const requiredChecks = evaluateRequiredChecksState({ profile: 'ops' });
  const doctorDeliveryStrict = evaluateDoctorDeliveryStrict();
  const freezeRollups = evaluateFreezeRollupsState({
    mode: 'release',
    skipTokenEmissionCheck: true,
  });

  const summary = {
    schemaVersion: 'ops-summary.v1',
    branch,
    headSha,
    originMainSha,
    remoteBindingOk,
    opsBaselineFilesOk: scriptsOk,
    nextSectorValid: nextSector.valid,
    nextSectorMode: nextSector.mode || '',
    nextSectorId: nextSector.id || '',
    nextSectorReason: nextSector.reason || '',
    xplatContractPresent: xplat.present,
    xplatContractSha256: xplat.sha256,
    xplatContractOk: xplat.ok,
    requiredChecksSyncOk: requiredChecks.syncOk,
    requiredChecksStale: requiredChecks.stale,
    requiredChecksSource: requiredChecks.source,
    doctorDeliveryStrictOk: doctorDeliveryStrict.ok,
    governanceStrictOk: remoteBindingOk
      && requiredChecks.syncOk === 1
      && requiredChecks.stale === 0
      && requiredChecks.source === 'canonical'
      && doctorDeliveryStrict.ok === 1
      && freezeRollups.HEAD_STRICT_OK === 1,
    headStrictOk: freezeRollups.HEAD_STRICT_OK,
    criticalClaimMatrixOk: freezeRollups.CRITICAL_CLAIM_MATRIX_OK,
    tokenDeclarationValidOk: freezeRollups.TOKEN_DECLARATION_VALID_OK,
    scrSharedCodeRatioOk: freezeRollups.SCR_SHARED_CODE_RATIO_OK,
    debtTtlValidOk: freezeRollups.DEBT_TTL_VALID_OK,
    debtTtlExpiredCount: freezeRollups.DEBT_TTL_EXPIRED_COUNT,
    driftUnresolvedP0Count: freezeRollups.DRIFT_UNRESOLVED_P0_COUNT,
    coreSotExecutableOk: freezeRollups.CORE_SOT_EXECUTABLE_OK,
    commandSurfaceEnforcedOk: freezeRollups.COMMAND_SURFACE_ENFORCED_OK,
    capabilityEnforcedOk: freezeRollups.CAPABILITY_ENFORCED_OK,
    recoveryIoOk: freezeRollups.RECOVERY_IO_OK,
    perfBaselineOk: freezeRollups.PERF_BASELINE_OK,
    adaptersEnforcedOk: freezeRollups.ADAPTERS_ENFORCED_OK,
    collabStressSafeOk: freezeRollups.COLLAB_STRESS_SAFE_OK,
    commentsHistorySafeOk: freezeRollups.COMMENTS_HISTORY_SAFE_OK,
    simulationMinContractOk: freezeRollups.SIMULATION_MIN_CONTRACT_OK,
    generatedAt: new Date().toISOString(),
  };

  console.log(`OPS_SUMMARY_VERSION=${summary.schemaVersion}`);
  console.log(`OPS_SUMMARY_BRANCH=${summary.branch || 'unknown'}`);
  console.log(`OPS_SUMMARY_HEAD_SHA=${summary.headSha || 'unknown'}`);
  console.log(`OPS_SUMMARY_ORIGIN_MAIN_SHA=${summary.originMainSha || 'unknown'}`);
  console.log(`OPS_SUMMARY_REMOTE_BINDING_OK=${summary.remoteBindingOk ? 1 : 0}`);
  console.log(`OPS_SUMMARY_BASELINE_FILES_OK=${summary.opsBaselineFilesOk ? 1 : 0}`);
  console.log(`OPS_SUMMARY_NEXT_SECTOR_ID=${summary.nextSectorId}`);
  console.log(`OPS_SUMMARY_NEXT_SECTOR_MODE=${summary.nextSectorMode}`);
  console.log(`OPS_SUMMARY_NEXT_SECTOR_REASON=${summary.nextSectorReason}`);
  console.log(`OPS_SUMMARY_NEXT_SECTOR_VALID=${summary.nextSectorValid ? 1 : 0}`);
  console.log(`OPS_SUMMARY_XPLAT_CONTRACT_PRESENT=${summary.xplatContractPresent}`);
  console.log(`OPS_SUMMARY_XPLAT_CONTRACT_SHA256=${summary.xplatContractSha256}`);
  console.log(`OPS_SUMMARY_XPLAT_CONTRACT_OK=${summary.xplatContractOk}`);
  console.log(`OPS_SUMMARY_REQUIRED_CHECKS_SYNC_OK=${summary.requiredChecksSyncOk}`);
  console.log(`OPS_SUMMARY_REQUIRED_CHECKS_STALE=${summary.requiredChecksStale}`);
  console.log(`OPS_SUMMARY_REQUIRED_CHECKS_SOURCE=${summary.requiredChecksSource}`);
  console.log(`OPS_SUMMARY_DOCTOR_DELIVERY_STRICT_OK=${summary.doctorDeliveryStrictOk}`);
  console.log(`OPS_SUMMARY_GOVERNANCE_STRICT_OK=${summary.governanceStrictOk ? 1 : 0}`);
  console.log(`OPS_SUMMARY_HEAD_STRICT_OK=${summary.headStrictOk}`);
  console.log(`OPS_SUMMARY_CRITICAL_CLAIM_MATRIX_OK=${summary.criticalClaimMatrixOk}`);
  console.log(`OPS_SUMMARY_TOKEN_DECLARATION_VALID_OK=${summary.tokenDeclarationValidOk}`);
  console.log(`OPS_SUMMARY_SCR_SHARED_CODE_RATIO_OK=${summary.scrSharedCodeRatioOk}`);
  console.log(`OPS_SUMMARY_DEBT_TTL_VALID_OK=${summary.debtTtlValidOk}`);
  console.log(`OPS_SUMMARY_DEBT_TTL_EXPIRED_COUNT=${summary.debtTtlExpiredCount}`);
  console.log(`OPS_SUMMARY_DRIFT_UNRESOLVED_P0_COUNT=${summary.driftUnresolvedP0Count}`);
  console.log(`OPS_SUMMARY_CORE_SOT_EXECUTABLE_OK=${summary.coreSotExecutableOk}`);
  console.log(`OPS_SUMMARY_COMMAND_SURFACE_ENFORCED_OK=${summary.commandSurfaceEnforcedOk}`);
  console.log(`OPS_SUMMARY_CAPABILITY_ENFORCED_OK=${summary.capabilityEnforcedOk}`);
  console.log(`OPS_SUMMARY_RECOVERY_IO_OK=${summary.recoveryIoOk}`);
  console.log(`OPS_SUMMARY_PERF_BASELINE_OK=${summary.perfBaselineOk}`);
  console.log(`OPS_SUMMARY_ADAPTERS_ENFORCED_OK=${summary.adaptersEnforcedOk}`);
  console.log(`OPS_SUMMARY_COLLAB_STRESS_SAFE_OK=${summary.collabStressSafeOk}`);
  console.log(`OPS_SUMMARY_COMMENTS_HISTORY_SAFE_OK=${summary.commentsHistorySafeOk}`);
  console.log(`OPS_SUMMARY_SIMULATION_MIN_CONTRACT_OK=${summary.simulationMinContractOk}`);

  if (!summary.remoteBindingOk) {
    console.log('FAIL_REASON=OPS_SUMMARY_REMOTE_BINDING_MISMATCH');
    process.exit(1);
  }
  if (!summary.opsBaselineFilesOk) {
    console.log('FAIL_REASON=OPS_SUMMARY_BASELINE_FILES_MISSING');
    process.exit(1);
  }
  if (!summary.nextSectorValid) {
    console.log(`FAIL_REASON=${nextSector.failReason || 'OPS_SUMMARY_NEXT_SECTOR_INVALID'}`);
    process.exit(1);
  }
  if (summary.xplatContractOk !== 1) {
    console.log(`FAIL_REASON=${xplat.failReason || 'OPS_SUMMARY_XPLAT_CONTRACT_INVALID'}`);
    process.exit(1);
  }
  if (summary.requiredChecksSyncOk !== 1 || summary.requiredChecksStale !== 0 || summary.requiredChecksSource !== 'canonical') {
    console.log(`FAIL_REASON=${requiredChecks.failReason || 'OPS_SUMMARY_REQUIRED_CHECKS_NOT_CANONICAL'}`);
    process.exit(1);
  }
  if (summary.doctorDeliveryStrictOk !== 1) {
    console.log('FAIL_REASON=OPS_SUMMARY_DOCTOR_DELIVERY_NOT_STRICT');
    process.exit(1);
  }
  if (summary.headStrictOk !== 1) {
    console.log('FAIL_REASON=OPS_SUMMARY_HEAD_STRICT_NOT_OK');
    process.exit(1);
  }
  if (summary.criticalClaimMatrixOk !== 1) {
    console.log('FAIL_REASON=OPS_SUMMARY_CRITICAL_CLAIM_MATRIX_NOT_OK');
    process.exit(1);
  }
  if (summary.tokenDeclarationValidOk !== 1) {
    console.log('FAIL_REASON=OPS_SUMMARY_TOKEN_DECLARATION_NOT_OK');
    process.exit(1);
  }
  if (summary.debtTtlValidOk !== 1) {
    console.log('FAIL_REASON=OPS_SUMMARY_DEBT_TTL_NOT_OK');
    process.exit(1);
  }
  if (!summary.governanceStrictOk) {
    console.log('FAIL_REASON=OPS_SUMMARY_GOVERNANCE_STRICT_NOT_OK');
    process.exit(1);
  }

  console.log('OPS_SUMMARY_OK=1');
}

main();
