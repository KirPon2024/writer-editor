#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { evaluateNextSectorState } from './next-sector-state.mjs';
import { evaluateXplatContractState } from './xplat-contract-state.mjs';
import { evaluateRequiredChecksState } from './required-checks-state.mjs';
import { evaluateFreezeRollupsState } from './freeze-rollups-state.mjs';
import { evaluateFreezeModeState } from './freeze-mode-state.mjs';

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
  const freezeMode = evaluateFreezeModeState({
    freezeRollups,
    freezeModeEnabled: String(process.env.FREEZE_MODE || '').trim() === '1',
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
    governanceStateValid: freezeRollups.GOVERNANCE_STATE_VALID,
    strategyProgressValid: freezeRollups.STRATEGY_PROGRESS_VALID,
    headStrictOk: freezeRollups.HEAD_STRICT_OK,
    criticalClaimMatrixOk: freezeRollups.CRITICAL_CLAIM_MATRIX_OK,
    tokenDeclarationValidOk: freezeRollups.TOKEN_DECLARATION_VALID_OK,
    scrRuntimeSharedRatioOk: freezeRollups.SCR_RUNTIME_SHARED_RATIO_OK,
    scrAppTotalSharedRatioInfo: freezeRollups.SCR_APP_TOTAL_SHARED_RATIO_INFO,
    scrSharedCodeRatioOk: freezeRollups.SCR_SHARED_CODE_RATIO_OK,
    debtTtlValidOk: freezeRollups.DEBT_TTL_VALID_OK,
    debtTtlExpiredCount: freezeRollups.DEBT_TTL_EXPIRED_COUNT,
    driftUnresolvedP0Count: freezeRollups.DRIFT_UNRESOLVED_P0_COUNT,
    freezeModeStrictOk: freezeMode.FREEZE_MODE_STRICT_OK,
    freezeReadyOk: freezeRollups.FREEZE_READY_OK,
    coreSotReducerImplementedOk: freezeRollups.CORE_SOT_REDUCER_IMPLEMENTED_OK,
    coreSotSchemaAlignedOk: freezeRollups.CORE_SOT_SCHEMA_ALIGNED_OK,
    coreSotCommandCanonOk: freezeRollups.CORE_SOT_COMMAND_CANON_OK,
    coreSotTypedErrorsOk: freezeRollups.CORE_SOT_TYPED_ERRORS_OK,
    coreSotHashDeterministicOk: freezeRollups.CORE_SOT_HASH_DETERMINISTIC_OK,
    coreSotExecutableOk: freezeRollups.CORE_SOT_EXECUTABLE_OK,
    commandSurfaceEnforcedOk: freezeRollups.COMMAND_SURFACE_ENFORCED_OK,
    capabilityMatrixNonEmptyOk: freezeRollups.CAPABILITY_MATRIX_NON_EMPTY_OK,
    capabilityBaselineMinOk: freezeRollups.CAPABILITY_BASELINE_MIN_OK,
    capabilityCommandBindingOk: freezeRollups.CAPABILITY_COMMAND_BINDING_OK,
    capabilityCommandCoverageOk: freezeRollups.CAPABILITY_COMMAND_COVERAGE_OK,
    capabilityPlatformResolverOk: freezeRollups.CAPABILITY_PLATFORM_RESOLVER_OK,
    capabilityUnsupportedTypedErrorsOk: freezeRollups.CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK,
    capabilityUnsupportedMapCoverageOk: freezeRollups.CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK,
    capabilityEnforcedOk: freezeRollups.CAPABILITY_ENFORCED_OK,
    recoveryAtomicWriteOk: freezeRollups.RECOVERY_ATOMIC_WRITE_OK,
    recoverySnapshotOk: freezeRollups.RECOVERY_SNAPSHOT_OK,
    recoveryCorruptionOk: freezeRollups.RECOVERY_CORRUPTION_OK,
    recoveryTypedErrorsOk: freezeRollups.RECOVERY_TYPED_ERRORS_OK,
    recoveryReplayOk: freezeRollups.RECOVERY_REPLAY_OK,
    recoveryActionCanonOk: freezeRollups.RECOVERY_ACTION_CANON_OK,
    recoveryIoOk: freezeRollups.RECOVERY_IO_OK,
    hotpathPolicyOk: freezeRollups.HOTPATH_POLICY_OK,
    perfFixtureOk: freezeRollups.PERF_FIXTURE_OK,
    perfRunnerDeterministicOk: freezeRollups.PERF_RUNNER_DETERMINISTIC_OK,
    perfThresholdOk: freezeRollups.PERF_THRESHOLD_OK,
    perfBaselineOk: freezeRollups.PERF_BASELINE_OK,
    platformCoverageDeclaredOk: freezeRollups.PLATFORM_COVERAGE_DECLARED_OK,
    platformCoverageBoundaryTestedOk: freezeRollups.PLATFORM_COVERAGE_BOUNDARY_TESTED_OK,
    derivedViewsPureOk: freezeRollups.DERIVED_VIEWS_PURE_OK,
    derivedViewsDeterministicOk: freezeRollups.DERIVED_VIEWS_DETERMINISTIC_OK,
    derivedViewsNoSecondSotOk: freezeRollups.DERIVED_VIEWS_NO_SECOND_SOT_OK,
    derivedViewsInvalidationKeyOk: freezeRollups.DERIVED_VIEWS_INVALIDATION_KEY_OK,
    derivedViewsInfraOk: freezeRollups.DERIVED_VIEWS_INFRA_OK,
    mindmapDerivedGraphDeterministicOk: freezeRollups.MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK,
    mindmapDerivedGraphHashOk: freezeRollups.MINDMAP_DERIVED_GRAPH_HASH_OK,
    mindmapDerivedGraphInvalidationKeyOk: freezeRollups.MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK,
    mindmapDerivedGraphNoSecondSotOk: freezeRollups.MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK,
    mindmapDerivedGraphOk: freezeRollups.MINDMAP_DERIVED_GRAPH_OK,
    xplatCostGuaranteeOk: freezeRollups.XPLAT_COST_GUARANTEE_OK,
    adaptersDeclaredOk: freezeRollups.ADAPTERS_DECLARED_OK,
    adaptersBoundaryTestedOk: freezeRollups.ADAPTERS_BOUNDARY_TESTED_OK,
    adaptersParityOk: freezeRollups.ADAPTERS_PARITY_OK,
    adaptersEnforcedOk: freezeRollups.ADAPTERS_ENFORCED_OK,
    collabStressSafeOk: freezeRollups.COLLAB_STRESS_SAFE_OK,
    collabEventLogSchemaOk: freezeRollups.COLLAB_EVENTLOG_SCHEMA_OK,
    collabEventLogAppendOnlyOk: freezeRollups.COLLAB_EVENTLOG_APPEND_ONLY_OK,
    collabEventLogReplayDeterministicOk: freezeRollups.COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK,
    collabEventLogIdempotencyOk: freezeRollups.COLLAB_EVENTLOG_IDEMPOTENCY_OK,
    collabEventLogOk: freezeRollups.COLLAB_EVENTLOG_OK,
    collabApplyPipelinePureOk: freezeRollups.COLLAB_APPLY_PIPELINE_PURE_OK,
    collabApplyPipelineDeterministicOk: freezeRollups.COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK,
    collabApplyPipelineTypedErrorsOk: freezeRollups.COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK,
    collabApplyPipelineOk: freezeRollups.COLLAB_APPLY_PIPELINE_OK,
    collabCausalQueueReadinessOk: freezeRollups.COLLAB_CAUSAL_QUEUE_READINESS_OK,
    commentsHistorySafeOk: freezeRollups.COMMENTS_HISTORY_SAFE_OK,
    simulationMinContractOk: freezeRollups.SIMULATION_MIN_CONTRACT_OK,
    xplatContractMacosSigningReadyOk: freezeRollups.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK,
    releaseArtifactSourcesOk: freezeRollups.RELEASE_ARTIFACT_SOURCES_OK,
    thirdPartyNoticesReadinessOk: freezeRollups.THIRD_PARTY_NOTICES_READINESS_OK,
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
  console.log(`OPS_SUMMARY_GOVERNANCE_STATE_VALID=${summary.governanceStateValid}`);
  console.log(`OPS_SUMMARY_STRATEGY_PROGRESS_VALID=${summary.strategyProgressValid}`);
  console.log(`OPS_SUMMARY_HEAD_STRICT_OK=${summary.headStrictOk}`);
  console.log(`OPS_SUMMARY_CRITICAL_CLAIM_MATRIX_OK=${summary.criticalClaimMatrixOk}`);
  console.log(`OPS_SUMMARY_TOKEN_DECLARATION_VALID_OK=${summary.tokenDeclarationValidOk}`);
  console.log(`OPS_SUMMARY_SCR_RUNTIME_SHARED_RATIO_OK=${summary.scrRuntimeSharedRatioOk}`);
  console.log(`OPS_SUMMARY_SCR_APP_TOTAL_SHARED_RATIO_INFO=${summary.scrAppTotalSharedRatioInfo}`);
  console.log(`OPS_SUMMARY_SCR_SHARED_CODE_RATIO_OK=${summary.scrSharedCodeRatioOk}`);
  console.log(`OPS_SUMMARY_DEBT_TTL_VALID_OK=${summary.debtTtlValidOk}`);
  console.log(`OPS_SUMMARY_DEBT_TTL_EXPIRED_COUNT=${summary.debtTtlExpiredCount}`);
  console.log(`OPS_SUMMARY_DRIFT_UNRESOLVED_P0_COUNT=${summary.driftUnresolvedP0Count}`);
  console.log(`OPS_SUMMARY_FREEZE_MODE_STRICT_OK=${summary.freezeModeStrictOk}`);
  console.log(`OPS_SUMMARY_FREEZE_READY_OK=${summary.freezeReadyOk}`);
  console.log(`OPS_SUMMARY_CORE_SOT_REDUCER_IMPLEMENTED_OK=${summary.coreSotReducerImplementedOk}`);
  console.log(`OPS_SUMMARY_CORE_SOT_SCHEMA_ALIGNED_OK=${summary.coreSotSchemaAlignedOk}`);
  console.log(`OPS_SUMMARY_CORE_SOT_COMMAND_CANON_OK=${summary.coreSotCommandCanonOk}`);
  console.log(`OPS_SUMMARY_CORE_SOT_TYPED_ERRORS_OK=${summary.coreSotTypedErrorsOk}`);
  console.log(`OPS_SUMMARY_CORE_SOT_HASH_DETERMINISTIC_OK=${summary.coreSotHashDeterministicOk}`);
  console.log(`OPS_SUMMARY_CORE_SOT_EXECUTABLE_OK=${summary.coreSotExecutableOk}`);
  console.log(`OPS_SUMMARY_COMMAND_SURFACE_ENFORCED_OK=${summary.commandSurfaceEnforcedOk}`);
  console.log(`OPS_SUMMARY_CAPABILITY_MATRIX_NON_EMPTY_OK=${summary.capabilityMatrixNonEmptyOk}`);
  console.log(`OPS_SUMMARY_CAPABILITY_BASELINE_MIN_OK=${summary.capabilityBaselineMinOk}`);
  console.log(`OPS_SUMMARY_CAPABILITY_COMMAND_BINDING_OK=${summary.capabilityCommandBindingOk}`);
  console.log(`OPS_SUMMARY_CAPABILITY_COMMAND_COVERAGE_OK=${summary.capabilityCommandCoverageOk}`);
  console.log(`OPS_SUMMARY_CAPABILITY_PLATFORM_RESOLVER_OK=${summary.capabilityPlatformResolverOk}`);
  console.log(`OPS_SUMMARY_CAPABILITY_UNSUPPORTED_TYPED_ERRORS_OK=${summary.capabilityUnsupportedTypedErrorsOk}`);
  console.log(`OPS_SUMMARY_CAPABILITY_UNSUPPORTED_MAP_COVERAGE_OK=${summary.capabilityUnsupportedMapCoverageOk}`);
  console.log(`OPS_SUMMARY_CAPABILITY_ENFORCED_OK=${summary.capabilityEnforcedOk}`);
  console.log(`OPS_SUMMARY_RECOVERY_ATOMIC_WRITE_OK=${summary.recoveryAtomicWriteOk}`);
  console.log(`OPS_SUMMARY_RECOVERY_SNAPSHOT_OK=${summary.recoverySnapshotOk}`);
  console.log(`OPS_SUMMARY_RECOVERY_CORRUPTION_OK=${summary.recoveryCorruptionOk}`);
  console.log(`OPS_SUMMARY_RECOVERY_TYPED_ERRORS_OK=${summary.recoveryTypedErrorsOk}`);
  console.log(`OPS_SUMMARY_RECOVERY_REPLAY_OK=${summary.recoveryReplayOk}`);
  console.log(`OPS_SUMMARY_RECOVERY_ACTION_CANON_OK=${summary.recoveryActionCanonOk}`);
  console.log(`OPS_SUMMARY_RECOVERY_IO_OK=${summary.recoveryIoOk}`);
  console.log(`OPS_SUMMARY_HOTPATH_POLICY_OK=${summary.hotpathPolicyOk}`);
  console.log(`OPS_SUMMARY_PERF_FIXTURE_OK=${summary.perfFixtureOk}`);
  console.log(`OPS_SUMMARY_PERF_RUNNER_DETERMINISTIC_OK=${summary.perfRunnerDeterministicOk}`);
  console.log(`OPS_SUMMARY_PERF_THRESHOLD_OK=${summary.perfThresholdOk}`);
  console.log(`OPS_SUMMARY_PERF_BASELINE_OK=${summary.perfBaselineOk}`);
  console.log(`OPS_SUMMARY_PLATFORM_COVERAGE_DECLARED_OK=${summary.platformCoverageDeclaredOk}`);
  console.log(`OPS_SUMMARY_PLATFORM_COVERAGE_BOUNDARY_TESTED_OK=${summary.platformCoverageBoundaryTestedOk}`);
  console.log(`OPS_SUMMARY_DERIVED_VIEWS_PURE_OK=${summary.derivedViewsPureOk}`);
  console.log(`OPS_SUMMARY_DERIVED_VIEWS_DETERMINISTIC_OK=${summary.derivedViewsDeterministicOk}`);
  console.log(`OPS_SUMMARY_DERIVED_VIEWS_NO_SECOND_SOT_OK=${summary.derivedViewsNoSecondSotOk}`);
  console.log(`OPS_SUMMARY_DERIVED_VIEWS_INVALIDATION_KEY_OK=${summary.derivedViewsInvalidationKeyOk}`);
  console.log(`OPS_SUMMARY_DERIVED_VIEWS_INFRA_OK=${summary.derivedViewsInfraOk}`);
  console.log(`OPS_SUMMARY_MINDMAP_DERIVED_GRAPH_DETERMINISTIC_OK=${summary.mindmapDerivedGraphDeterministicOk}`);
  console.log(`OPS_SUMMARY_MINDMAP_DERIVED_GRAPH_HASH_OK=${summary.mindmapDerivedGraphHashOk}`);
  console.log(`OPS_SUMMARY_MINDMAP_DERIVED_GRAPH_INVALIDATION_KEY_OK=${summary.mindmapDerivedGraphInvalidationKeyOk}`);
  console.log(`OPS_SUMMARY_MINDMAP_DERIVED_GRAPH_NO_SECOND_SOT_OK=${summary.mindmapDerivedGraphNoSecondSotOk}`);
  console.log(`OPS_SUMMARY_MINDMAP_DERIVED_GRAPH_OK=${summary.mindmapDerivedGraphOk}`);
  console.log(`OPS_SUMMARY_XPLAT_COST_GUARANTEE_OK=${summary.xplatCostGuaranteeOk}`);
  console.log(`OPS_SUMMARY_ADAPTERS_DECLARED_OK=${summary.adaptersDeclaredOk}`);
  console.log(`OPS_SUMMARY_ADAPTERS_BOUNDARY_TESTED_OK=${summary.adaptersBoundaryTestedOk}`);
  console.log(`OPS_SUMMARY_ADAPTERS_PARITY_OK=${summary.adaptersParityOk}`);
  console.log(`OPS_SUMMARY_ADAPTERS_ENFORCED_OK=${summary.adaptersEnforcedOk}`);
  console.log(`OPS_SUMMARY_COLLAB_STRESS_SAFE_OK=${summary.collabStressSafeOk}`);
  console.log(`OPS_SUMMARY_COLLAB_EVENTLOG_SCHEMA_OK=${summary.collabEventLogSchemaOk}`);
  console.log(`OPS_SUMMARY_COLLAB_EVENTLOG_APPEND_ONLY_OK=${summary.collabEventLogAppendOnlyOk}`);
  console.log(`OPS_SUMMARY_COLLAB_EVENTLOG_REPLAY_DETERMINISTIC_OK=${summary.collabEventLogReplayDeterministicOk}`);
  console.log(`OPS_SUMMARY_COLLAB_EVENTLOG_IDEMPOTENCY_OK=${summary.collabEventLogIdempotencyOk}`);
  console.log(`OPS_SUMMARY_COLLAB_EVENTLOG_OK=${summary.collabEventLogOk}`);
  console.log(`OPS_SUMMARY_COLLAB_APPLY_PIPELINE_PURE_OK=${summary.collabApplyPipelinePureOk}`);
  console.log(`OPS_SUMMARY_COLLAB_APPLY_PIPELINE_DETERMINISTIC_OK=${summary.collabApplyPipelineDeterministicOk}`);
  console.log(`OPS_SUMMARY_COLLAB_APPLY_PIPELINE_TYPED_ERRORS_OK=${summary.collabApplyPipelineTypedErrorsOk}`);
  console.log(`OPS_SUMMARY_COLLAB_APPLY_PIPELINE_OK=${summary.collabApplyPipelineOk}`);
  console.log(`OPS_SUMMARY_COLLAB_CAUSAL_QUEUE_READINESS_OK=${summary.collabCausalQueueReadinessOk}`);
  console.log(`OPS_SUMMARY_COMMENTS_HISTORY_SAFE_OK=${summary.commentsHistorySafeOk}`);
  console.log(`OPS_SUMMARY_SIMULATION_MIN_CONTRACT_OK=${summary.simulationMinContractOk}`);
  console.log(`OPS_SUMMARY_XPLAT_CONTRACT_MACOS_SIGNING_READY_OK=${summary.xplatContractMacosSigningReadyOk}`);
  console.log(`OPS_SUMMARY_RELEASE_ARTIFACT_SOURCES_OK=${summary.releaseArtifactSourcesOk}`);
  console.log(`OPS_SUMMARY_THIRD_PARTY_NOTICES_READINESS_OK=${summary.thirdPartyNoticesReadinessOk}`);

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
  if (summary.platformCoverageBoundaryTestedOk !== 1) {
    console.log('FAIL_REASON=OPS_SUMMARY_PLATFORM_COVERAGE_NOT_OK');
    process.exit(1);
  }
  if (summary.xplatCostGuaranteeOk !== 1) {
    console.log('FAIL_REASON=OPS_SUMMARY_XPLAT_COST_GUARANTEE_NOT_OK');
    process.exit(1);
  }
  if (String(process.env.FREEZE_MODE || '').trim() === '1' && summary.freezeModeStrictOk !== 1) {
    console.log('FAIL_REASON=OPS_SUMMARY_FREEZE_MODE_STRICT_NOT_OK');
    process.exit(1);
  }

  console.log('OPS_SUMMARY_OK=1');
}

main();
