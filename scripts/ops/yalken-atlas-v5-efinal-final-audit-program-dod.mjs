#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORT_SCHEMA = 'yalken.atlas.v5.efinal.finalAuditProgramDod.v2';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_EFINAL_FINAL_AUDIT_AND_PROGRAM_DOD');

const PRODUCT_RUNTIME_PREFIXES = Object.freeze([
  'src/',
  'package.json',
  'package-lock.json',
  'electron-builder',
  'build/',
  'assets/',
]);

const LEGACY_RECEIPT_DIAGNOSTIC_PATHS = Object.freeze({
  stage00: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_STAGE_00_BINDING_AND_CALIBRATION_RECEIPT.json',
  stage01: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E01_C04_ATLAS_CONFIRMATION_REBUILD_RECOVERY_RECEIPT.json',
  stage02: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E02B_C04_LAYOUT_RESOURCE_BUDGET_PROOF_RECEIPT.json',
  stage03: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E03_C05_PROJECTION_INSPECTOR_FALLBACK_MANIFESTS_RECEIPT.json',
  stage04: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E04_C06_ATLAS_LOCAL_GRAPH_CLUSTER_LAYOUT_BUDGET_PROOF_RECEIPT.json',
  stage06: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E06_C08_ATLAS_STAGE_06_ACCEPTANCE_DIAGNOSTICS_HANDOFF_RECEIPT.json',
  stage07: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E07_C09_STAGE_07_ACCEPTANCE_DIAGNOSTICS_HANDOFF_RECEIPT.json',
  stage08: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E08_C05_RENDERER_ADAPTER_PROFILING_STAGE_08_ACCEPTANCE_RECEIPT.json',
  stage09: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E09_C05_SAVED_VIEWS_BATCH_OPERATIONS_STAGE_09_ACCEPTANCE_RECEIPT.json',
  stage10c01: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E10_C01_STABLE_COMMENT_ANCHORS_DECISION_SURVIVAL_RECEIPT.json',
  stage10c02: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E10_C02_REVISION_HISTORY_PROJECTION_AUTHOR_TRUTH_RECEIPT.json',
  stage10c06: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E10_C06_TRANSPORT_NEUTRAL_OPERATION_EXCHANGE_RECEIPT.json',
  stage11c01: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RECEIPT.json',
  stage11c02: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C02_PACKAGED_CRITICAL_JOURNEY_RECEIPT.json',
  stage11c03: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION_RECEIPT.json',
  stage11c04: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C04_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF_RECEIPT.json',
  e11Aggregate: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_ACTIVE_PLATFORM_CERTIFICATION_REVALIDATION_RECEIPT.json',
  r2C05: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R2_C05_HONEST_BLACK_BOX_ACCEPTANCE_RECEIPT.json',
  r2C06: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R2_C06_FINAL_REVALIDATION_RECEIPT.json',
  r3C05: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R3_C05_RELEASE_SATURATION_REVALIDATION_RECEIPT.json',
  night01C01: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_NIGHT01_C01_REMOTE_MERGE_VERIFICATION_RECEIPT.json',
});

const FORBIDDEN_READINESS_RECEIPT_PATHS = new Set([
  'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C04_PRODUCT_VERTICAL_JOURNEYS_GRAPH_WORKBENCH_RECEIPT.json',
  'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C06_ATLAS_RAIL_RESPONSIVE_ACCESSIBILITY_RECEIPT.json',
  'docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C07_STAGE_REVALIDATION_HANDOFF_RECEIPT.json',
  'docs/OPS/STATUS/YALKEN_ATLAS_V5_EFINAL_FINAL_AUDIT_PROGRAM_DOD_RECEIPT.json',
]);

const DEFAULT_MACHINE_SOURCE_PATHS = Object.freeze({
  r3C05PhysicalRerunReport: 'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_NIGHT01_C01_INDEPENDENT_FINAL_RERUN/physical-r3-c05-rerun/r3-c05-release-saturation-revalidation-report.json',
  p0_01Receipt: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_01_FUTURE_SCHEMA_LOSS_RECEIPT.json',
});

const FINAL_REPAIR_QUEUE = Object.freeze([
  {
    id: 'P0_01_FUTURE_SCHEMA_LOSS',
    receiptPath: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_01_FUTURE_SCHEMA_LOSS_RECEIPT.json',
    requiredAcceptance: [
      'futureSchemaLossFixed',
      'commandBridgePathTested',
      'migrationNegativeTested',
      'reopenTested',
      'recoverySnapshotTested',
      'receiptAloneIsNotReadinessProof',
      'fullRunnerPassed',
    ],
  },
  {
    id: 'P0_02_EFINAL_FALSE_GREEN',
    receiptPath: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_02_EFINAL_FALSE_GREEN_RECEIPT.json',
    requiredAcceptance: [
      'legacyReceiptStatusRejected',
      'machineCapabilityGateInstalled',
      'exactSourceBindingRequired',
      'negativeControlsRequired',
      'programDoneClaimFalseUntilAllP0Closed',
    ],
  },
  {
    id: 'P0_03_PACKAGED_JOURNEY_STALE',
    receiptPath: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_03_PACKAGED_JOURNEY_STALE_RECEIPT.json',
    requiredAcceptance: ['packagedJourneyFreshOnCurrentRuntimeSha', 'visibleControlsOnly', 'persistReopenRecoveryImportExportProof'],
  },
  {
    id: 'P0_04_DESIGN_OS_BINDING',
    receiptPath: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_04_DESIGN_OS_BINDING_RECEIPT.json',
    requiredAcceptance: ['featureIntegrationManifestBound', 'slotResolverBound', 'negativeBypassTested'],
  },
  {
    id: 'P0_05_MANUAL_MAP_PORTABILITY',
    receiptPath: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_05_MANUAL_MAP_PORTABILITY_RECEIPT.json',
    requiredAcceptance: ['runtimeUiPathConnected', 'repeatImportTested', 'pdfProofOrTypedLoss'],
  },
  {
    id: 'P0_06_MULTILINGUAL_MATCHER',
    receiptPath: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_06_MULTILINGUAL_MATCHER_RECEIPT.json',
    requiredAcceptance: ['languagePolicyBeforeMatching', 'graphemeAwareMatching', 'unicodeMatrixProductEvidence'],
  },
  {
    id: 'P0_07_STRESS_PRODUCT_PROOF',
    receiptPath: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_07_STRESS_PRODUCT_PROOF_RECEIPT.json',
    requiredAcceptance: ['persistedLargeProjects', 'rendered10k50kGraphs', 'measuredLimitsNoSilentCap'],
  },
  {
    id: 'P0_08_STAGE10_PRODUCT_WIRING',
    receiptPath: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_08_STAGE10_PRODUCT_WIRING_RECEIPT.json',
    requiredAcceptance: ['localProductPathsConnected', 'persistenceReopenRecoveryUndoConflicts', 'shadowDeclaredShadow'],
  },
]);

const CAPABILITY_REQUIREMENTS = Object.freeze({
  atlasEntityRelationUi: {
    journeyKey: 'c01',
    requiredAccepted: [
      'visibleInputRuntime',
      'pointerAndKeyboardUsed',
      'commandKernelButtonsOnly',
      'sceneTextSaved',
      'persistedEntityAliasMentionEvidence',
      'persistedRelationOperations',
      'reopenProjectionVisible',
    ],
    requiredNegativeFalse: [
      'directIpcAcceptedJourney',
      'hiddenFirstEntityFallbackAccepted',
      'generatedArtifactOnlyAccepted',
      'networkActivated',
    ],
  },
  atlasTemporalContinuityUi: {
    journeyKey: 'c02',
    requiredAccepted: [
      'visibleInputRuntime',
      'pointerAndKeyboardUsed',
      'temporalCommandsVisible',
      'continuityCommandVisibleAndExplicit',
      'savedQueryCommandVisible',
      'persistedTemporalContinuityQueryTruth',
      'reopenContinuityVisible',
      'reopenSavedQueryVisible',
      'noStatusOnlyContinuityRoute',
      'noSilentSceneSlice',
    ],
    requiredNegativeFalse: [
      'statusOnlyCorrectionAccepted',
      'silentSceneSliceAccepted',
      'directIpcAcceptedJourney',
      'generatedArtifactOnlyAccepted',
      'networkActivated',
    ],
  },
  manualMapPortabilityUi: {
    journeyKey: 'c03',
    requiredAccepted: [
      'visibleInputRuntime',
      'pointerAndKeyboardUsed',
      'attachmentPortalTemplateCommandsVisible',
      'visibleReadbackRuntime',
      'persistedPortabilityTruth',
      'reopenProjectionVisible',
      'exportRepeatImport',
      'imagePdfEvidenceIncludesPortability',
      'noDirectIpcOrStorageBypass',
    ],
    requiredNegativeFalse: [
      'directIpcAcceptedJourney',
      'generatedArtifactOnlyAccepted',
      'hiddenPortabilityControlsAccepted',
      'missingPortabilityTruthAccepted',
      'exportWithoutRepeatImportAccepted',
      'networkActivated',
      'viewStatePersisted',
    ],
  },
  multilingualWorkerStress: {
    journeyKey: 'c04',
    requiredAccepted: [],
    requiredNegativeFalse: [],
  },
});

const DOD_MACHINE_MAP = Object.freeze([
  ['DOD_01_FOUR_CANONICAL_PROJECTIONS_AND_MANUAL_MAPS', ['atlasEntityRelationUi', 'manualMapPortabilityUi']],
  ['DOD_02_SHARED_GRAPH_WORKBENCH_DISTINCT_AUTHORITY', ['manualMapPortabilityUi']],
  ['DOD_03_PRODUCT_CORE_SINGLE_DOMAIN_TRUTH', ['atlasEntityRelationUi', 'manualMapPortabilityUi']],
  ['DOD_04_COMMAND_KERNEL_SINGLE_WRITE_PATH', ['atlasEntityRelationUi', 'manualMapPortabilityUi']],
  ['DOD_05_DESIGN_OS_MANIFEST_TYPED_SLOTS', ['manualMapPortabilityUi']],
  ['DOD_06_ATLAS_EVIDENTIAL_REVERSIBLE_NO_MANUSCRIPT_REWRITE', ['atlasEntityRelationUi']],
  ['DOD_07_TIME_CALENDAR_CONTINUITY_WORKS', ['atlasTemporalContinuityUi']],
  ['DOD_08_GLOBAL_LANGUAGE_BASELINE_UNICODE', ['multilingualWorkerStress']],
  ['DOD_09_BASIC_DEEP_LANGUAGES_CERTIFIED', ['multilingualWorkerStress']],
  ['DOD_10_MIXED_CJK_RTL_IME_UNICODE_EDGES', ['multilingualWorkerStress']],
  ['DOD_11_MANUAL_MAPS_ATLAS_DECISIONS_AUTHOR_DATA_RECOVERY', ['atlasEntityRelationUi', 'manualMapPortabilityUi']],
  ['DOD_12_DERIVED_CACHE_REBUILDABLE', ['multilingualWorkerStress']],
  ['DOD_13_HISTORY_COMMENTS_COLLAB_NO_SECOND_TRUTH', ['atlasEntityRelationUi']],
  ['DOD_14_IMPORT_EXPORT_ROUNDTRIP_FULL_ARCHIVE', ['manualMapPortabilityUi']],
  ['DOD_15_PERFORMANCE_BUDGETS_APPROVED_CORPORA_HARDWARE', ['multilingualWorkerStress']],
  ['DOD_16_GRAPH_ACCESSIBILITY_FALLBACK_PARITY', ['manualMapPortabilityUi']],
  ['DOD_17_ACTIVE_PLATFORMS_PACKAGED_VERIFICATION', ['atlasEntityRelationUi', 'atlasTemporalContinuityUi', 'manualMapPortabilityUi']],
  ['DOD_18_FACTUAL_DOCS_MATCH_RUNTIME', ['atlasEntityRelationUi', 'atlasTemporalContinuityUi', 'manualMapPortabilityUi', 'multilingualWorkerStress']],
  ['DOD_19_NO_CAPABILITY_SILENTLY_LOST', ['atlasEntityRelationUi', 'manualMapPortabilityUi']],
  ['DOD_20_PROGRAM_ORDER_AND_DELIVERY_COMPLETE', ['atlasEntityRelationUi', 'atlasTemporalContinuityUi', 'manualMapPortabilityUi', 'multilingualWorkerStress']],
]);

function parseArgs(argv) {
  const out = { outDir: DEFAULT_OUT_DIR, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && i + 1 < argv.length) {
      out.outDir = path.resolve(String(argv[i + 1] || '').trim());
      i += 1;
    } else if (arg === '--json') {
      out.json = true;
    }
  }
  return out;
}

function runGit(args, repoRoot) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileProof(repoRoot, relativePath) {
  const abs = path.resolve(repoRoot, relativePath);
  if (!fs.existsSync(abs)) return { path: relativePath, exists: false, bytes: 0, sha256: '' };
  const stat = fs.statSync(abs);
  return {
    path: relativePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(abs) : '',
  };
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8'));
}

function readJsonIfExists(repoRoot, relativePath) {
  const fullPath = path.resolve(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function resolveEvidencePath(repoRoot, evidencePath) {
  if (!evidencePath) return '';
  return path.isAbsolute(evidencePath) ? evidencePath : path.resolve(repoRoot, evidencePath);
}

function relativeEvidencePath(repoRoot, evidencePath) {
  if (!evidencePath) return '';
  return path.relative(repoRoot, resolveEvidencePath(repoRoot, evidencePath));
}

function isProductRuntimePath(filePath) {
  return PRODUCT_RUNTIME_PREFIXES.some((prefix) => filePath === prefix || filePath.startsWith(prefix));
}

function diffNames(repoRoot, fromSha, toSha) {
  if (!fromSha || !toSha || fromSha === toSha) return [];
  const result = runGit(['diff', '--name-only', `${fromSha}..${toSha}`], repoRoot);
  return result.ok && result.stdout ? result.stdout.split(/\r?\n/u).filter(Boolean) : [];
}

function isAncestor(repoRoot, ancestorSha, descendantSha) {
  if (!ancestorSha || !descendantSha) return false;
  if (ancestorSha === descendantSha) return true;
  return runGit(['merge-base', '--is-ancestor', ancestorSha, descendantSha], repoRoot).ok === true;
}

function buildGitIdentity(repoRoot) {
  const head = runGit(['rev-parse', 'HEAD'], repoRoot);
  const origin = runGit(['rev-parse', 'origin/main'], repoRoot);
  const branch = runGit(['branch', '--show-current'], repoRoot);
  const dirty = runGit(['status', '--short'], repoRoot);
  const remoteBranch = branch.stdout ? runGit(['ls-remote', '--heads', 'origin', branch.stdout], repoRoot) : { stdout: '' };
  return {
    headSha: head.stdout,
    originMainSha: origin.stdout,
    branch: branch.stdout,
    headEqualsOriginMain: head.ok && origin.ok && head.stdout === origin.stdout,
    localDirtyFileCount: dirty.stdout ? dirty.stdout.split(/\r?\n/u).filter(Boolean).length : 0,
    remoteBranchExists: remoteBranch.stdout.length > 0,
  };
}

function legacyReceiptDiagnostic(repoRoot, receiptPaths = LEGACY_RECEIPT_DIAGNOSTIC_PATHS) {
  return Object.fromEntries(Object.entries(receiptPaths).map(([key, relativePath]) => {
    const proof = fileProof(repoRoot, relativePath);
    let parsed = null;
    let parseOk = false;
    if (proof.exists) {
      try {
        parsed = readJson(repoRoot, relativePath);
        parseOk = true;
      } catch {
        parseOk = false;
      }
    }
    return [key, {
      key,
      path: relativePath,
      proof,
      parseOk,
      status: parsed?.status || parsed?.deliveryStatus || parsed?.result || '',
      passFlag: parsed?.pass === true || parsed?.ok === true,
      readinessEligible: false,
      reason: FORBIDDEN_READINESS_RECEIPT_PATHS.has(relativePath)
        ? 'FORBIDDEN_STALE_READINESS_RECEIPT'
        : 'LEGACY_RECEIPT_STATUS_IS_DIAGNOSTIC_ONLY',
    }];
  }));
}

function objectBooleansEqual(source, keys, expected) {
  return keys.map((key) => ({
    key,
    expected,
    actual: source?.[key],
    pass: source?.[key] === expected,
  }));
}

function proofPass(details) {
  return details.every((item) => item.pass === true);
}

function normalizeRepairAcceptance(item, receipt, identity) {
  const acceptance = {
    ...(receipt?.acceptance || {}),
    ...(receipt?.accepted || {}),
  };
  if (item.id === 'P0_03_PACKAGED_JOURNEY_STALE') {
    const sourceBinding = receipt?.sourceBinding || {};
    const activationEvidence = receipt?.activationEvidence || {};
    const negativeAssertions = receipt?.negativeAssertions || {};
    acceptance.packagedJourneyFreshOnCurrentRuntimeSha = acceptance.packagedJourneyFreshOnCurrentRuntimeSha === true
      || (
        acceptance.currentSourcePackageBuilt === true
        && acceptance.exactSourceBindingPresent === true
        && acceptance.packagedExecutableRuntime === true
        && sourceBinding.headSha === identity.headSha
        && sourceBinding.packageBuiltAtHeadSha === identity.headSha
      );
    acceptance.visibleControlsOnly = acceptance.visibleControlsOnly === true
      || (
        acceptance.visibleUiInputUsed === true
        && acceptance.noDirectBridgeAcceptance === true
        && acceptance.noGeneratedArtifactOnlyAcceptance === true
        && activationEvidence.forbiddenDirectBridgeAccepted === false
        && negativeAssertions.directInjectedBridgeAcceptedAsPackagedJourney === false
        && negativeAssertions.screenshotOnlyAccepted === false
      );
    acceptance.persistReopenRecoveryImportExportProof = acceptance.persistReopenRecoveryImportExportProof === true
      || (
        acceptance.atlasCreateEditRelationContinuity === true
        && acceptance.manualMapLifecyclePersisted === true
        && acceptance.undoExportImportPersisted === true
        && acceptance.freshReopenReadback === true
      );
  }
  if (item.id === 'P0_05_MANUAL_MAP_PORTABILITY') {
    const physical = receipt?.checks?.physicalJourney || {};
    acceptance.runtimeUiPathConnected = acceptance.runtimeUiPathConnected === true
      || (
        acceptance.productCommandRuntimeUiPathBound === true
        && acceptance.visibleExportJsonControl === true
        && acceptance.visibleImagePdfPacketControl === true
        && acceptance.visibleRepeatImportControl === true
        && acceptance.noRendererStorageBypass === true
        && acceptance.noDirectIpcAcceptance === true
      );
    acceptance.repeatImportTested = acceptance.repeatImportTested === true
      || (
        acceptance.repeatImportPersistedAndReopened === true
        && physical.accepted?.exportRepeatImport === true
        && physical.negativeAssertions?.exportWithoutRepeatImportAccepted === false
      );
    acceptance.pdfProofOrTypedLoss = acceptance.pdfProofOrTypedLoss === true
      || (
        acceptance.imagePdfEvidenceGenerated === true
        && acceptance.binaryPdfUnsupportedDeclaredAsTypedLoss === true
        && physical.accepted?.imagePdfEvidenceIncludesPortability === true
        && physical.negativeAssertions?.binaryPdfClaimWithoutAdapter === false
      );
  }
  if (item.id === 'P0_08_STAGE10_PRODUCT_WIRING') {
    acceptance.localProductPathsConnected = acceptance.localProductPathsConnected === true
      || (
        acceptance.visibleUiCommandPath === true
        && acceptance.commandKernelCapabilityRevalidated === true
        && acceptance.commentsProductPathPersistReopen === true
        && acceptance.historyProductPathPersistReopenRecoveryUndo === true
        && acceptance.conflictsProductPathPersistManualDecision === true
        && acceptance.operationExchangeLocalProductPath === true
        && acceptance.negativeDirectBridgeDenied === true
      );
    acceptance.persistenceReopenRecoveryUndoConflicts = acceptance.persistenceReopenRecoveryUndoConflicts === true
      || (
        acceptance.commentsProductPathPersistReopen === true
        && acceptance.historyProductPathPersistReopenRecoveryUndo === true
        && acceptance.conflictsProductPathPersistManualDecision === true
      );
    acceptance.shadowDeclaredShadow = acceptance.shadowDeclaredShadow === true
      || (
        acceptance.shadowOnlyRejectedAsComplete === true
        && acceptance.networkAdapterNotRequired === true
      );
  }
  return acceptance;
}

function readJourneyReport(repoRoot, r3Report, spec) {
  const summary = r3Report?.journeys?.[spec.journeyKey] || {};
  const evidencePath = relativeEvidencePath(repoRoot, summary.reportPath || '');
  const fullPath = resolveEvidencePath(repoRoot, summary.reportPath || '');
  if (!summary.reportPath || !fs.existsSync(fullPath)) {
    return { summary, report: null, path: evidencePath, shaMatches: false };
  }
  const report = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const actualSha = sha256File(fullPath);
  return {
    summary,
    report,
    path: evidencePath,
    sha256: actualSha,
    shaMatches: summary.reportSha256 === actualSha,
  };
}

function validateJourneyCapability(repoRoot, capabilityId, spec, r3Report) {
  const evidence = readJourneyReport(repoRoot, r3Report, spec);
  const acceptedChecks = objectBooleansEqual(evidence.report?.accepted || {}, spec.requiredAccepted, true);
  const negativeChecks = objectBooleansEqual(evidence.report?.negativeAssertions || {}, spec.requiredNegativeFalse, false);
  const baseChecks = [
    { key: 'summaryPass', expected: true, actual: evidence.summary?.pass, pass: evidence.summary?.pass === true },
    { key: 'reportPass', expected: true, actual: evidence.report?.pass, pass: evidence.report?.pass === true },
    { key: 'reportPathExists', expected: true, actual: Boolean(evidence.report), pass: Boolean(evidence.report) },
    { key: 'reportHashMatchesSummary', expected: true, actual: evidence.shaMatches, pass: evidence.shaMatches === true },
  ];

  if (capabilityId === 'multilingualWorkerStress') {
    baseChecks.push(
      { key: 'futureSchemaQuarantine', expected: true, actual: evidence.report?.futureSchemaQuarantine?.quarantined, pass: evidence.report?.futureSchemaQuarantine?.quarantined === true },
      { key: 'futureSchemaNoDestructiveReplacement', expected: false, actual: evidence.report?.futureSchemaQuarantine?.destructiveReplacement, pass: evidence.report?.futureSchemaQuarantine?.destructiveReplacement === false },
      { key: 'allExpectedLanguages', expected: true, actual: evidence.report?.multilingualRouting?.allExpectedLanguages, pass: evidence.report?.multilingualRouting?.allExpectedLanguages === true },
      { key: 'exactOnlyNoFallback', expected: true, actual: evidence.report?.multilingualRouting?.exactOnlyNoFallback, pass: evidence.report?.multilingualRouting?.exactOnlyNoFallback === true },
      { key: 'splitLanguageTagRejected', expected: true, actual: evidence.report?.splitGraphemeRejections?.languageTagRejected, pass: evidence.report?.splitGraphemeRejections?.languageTagRejected === true },
      { key: 'splitEvidenceRejected', expected: true, actual: evidence.report?.splitGraphemeRejections?.evidenceRejected, pass: evidence.report?.splitGraphemeRejections?.evidenceRejected === true },
      { key: 'staleIdentityRejected', expected: true, actual: evidence.report?.workerStress?.staleIdentityRejected, pass: evidence.report?.workerStress?.staleIdentityRejected === true },
      { key: 'staleRevisionRejected', expected: true, actual: evidence.report?.workerStress?.staleRevisionRejected, pass: evidence.report?.workerStress?.staleRevisionRejected === true },
      { key: 'storageMutationByWorker', expected: false, actual: evidence.report?.authority?.storageMutationByWorker, pass: evidence.report?.authority?.storageMutationByWorker === false },
      { key: 'networkRuntime', expected: false, actual: evidence.report?.authority?.networkRuntime, pass: evidence.report?.authority?.networkRuntime === false },
    );
  }

  const details = [...baseChecks, ...acceptedChecks, ...negativeChecks];
  return {
    id: capabilityId,
    pass: proofPass(details),
    evidencePath: evidence.path,
    evidenceSha256: evidence.sha256 || '',
    checks: details,
  };
}

function validateRepairQueue(repoRoot, repairQueue = FINAL_REPAIR_QUEUE, identity = buildGitIdentity(repoRoot)) {
  return repairQueue.map((item) => {
    const receipt = readJsonIfExists(repoRoot, item.receiptPath);
    const proof = fileProof(repoRoot, item.receiptPath);
    const acceptance = normalizeRepairAcceptance(item, receipt, identity);
    const acceptanceChecks = item.requiredAcceptance.map((key) => ({
      key,
      expected: true,
      actual: acceptance?.[key],
      pass: acceptance?.[key] === true,
    }));
    const reportPath = receipt?.report?.path || '';
    const reportProof = reportPath ? fileProof(repoRoot, reportPath) : { path: reportPath, exists: false, bytes: 0, sha256: '' };
    const baseChecks = [
      { key: 'receiptExists', expected: true, actual: proof.exists, pass: proof.exists === true },
      { key: 'receiptParseOk', expected: true, actual: Boolean(receipt), pass: Boolean(receipt) },
      { key: 'receiptPassFlag', expected: true, actual: receipt?.pass, pass: receipt?.pass === true },
      { key: 'reportExists', expected: true, actual: reportProof.exists, pass: reportProof.exists === true },
      { key: 'reportShaMatchesReceipt', expected: true, actual: reportProof.sha256 === receipt?.report?.sha256, pass: reportProof.exists === true && reportProof.sha256 === receipt?.report?.sha256 },
    ];
    const checks = [...baseChecks, ...acceptanceChecks];
    return {
      id: item.id,
      pass: proofPass(checks),
      receiptPath: item.receiptPath,
      receiptSha256: proof.sha256,
      checks,
    };
  });
}

export function buildMachineCapabilityGate(input = {}) {
  const repoRoot = path.resolve(input.repoRoot || process.cwd());
  const identity = input.identity || buildGitIdentity(repoRoot);
  const r3Report = input.r3Report || readJsonIfExists(repoRoot, input.r3C05PhysicalRerunReportPath || DEFAULT_MACHINE_SOURCE_PATHS.r3C05PhysicalRerunReport);
  const r3ReportPath = input.r3C05PhysicalRerunReportPath || DEFAULT_MACHINE_SOURCE_PATHS.r3C05PhysicalRerunReport;
  const r3SourceHead = r3Report?.git?.headSha || r3Report?.identity?.headSha || '';
  const sourceDeltaFiles = input.sourceDeltaFiles || diffNames(repoRoot, r3SourceHead, identity.headSha);
  const productRuntimeDeltaFiles = sourceDeltaFiles.filter(isProductRuntimePath);
  const sourceHeadAcceptable = Boolean(r3SourceHead)
    && (
      r3SourceHead === identity.headSha
      || (
        productRuntimeDeltaFiles.length === 0
        && isAncestor(repoRoot, r3SourceHead, identity.headSha)
      )
    );
  const sourceBindingChecks = [
    { key: 'r3PhysicalReportExists', expected: true, actual: Boolean(r3Report), pass: Boolean(r3Report) },
    { key: 'r3PhysicalReportPass', expected: true, actual: r3Report?.pass, pass: r3Report?.pass === true },
    { key: 'exactHeadBinding', expected: `${identity.headSha} or ancestor with zero product-runtime delta`, actual: r3SourceHead, pass: sourceHeadAcceptable },
    { key: 'currentHeadEqualsOriginMain', expected: true, actual: identity.headEqualsOriginMain, pass: identity.headEqualsOriginMain === true },
    { key: 'noProductRuntimeDeltaSincePhysicalProof', expected: 0, actual: productRuntimeDeltaFiles.length, pass: productRuntimeDeltaFiles.length === 0 },
  ];
  const sourceBindingPass = proofPass(sourceBindingChecks);
  const capabilities = Object.fromEntries(Object.entries(CAPABILITY_REQUIREMENTS).map(([capabilityId, spec]) => [
    capabilityId,
    r3Report
      ? validateJourneyCapability(repoRoot, capabilityId, spec, r3Report)
      : { id: capabilityId, pass: false, evidencePath: '', evidenceSha256: '', checks: [{ key: 'missingR3Report', expected: false, actual: true, pass: false }] },
  ]));
  const capabilityRows = DOD_MACHINE_MAP.map(([id, requiredCapabilityIds]) => {
    const missing = requiredCapabilityIds.filter((capabilityId) => capabilities[capabilityId]?.pass !== true);
    return {
      id,
      requiredCapabilities: requiredCapabilityIds,
      pass: sourceBindingPass && missing.length === 0,
      missing,
      sourceBindingRequired: true,
    };
  });
  const repairQueue = validateRepairQueue(repoRoot, input.repairQueue || FINAL_REPAIR_QUEUE, identity);
  const failures = [
    ...sourceBindingChecks.filter((check) => check.pass !== true).map((check) => ({ code: 'MACHINE_SOURCE_BINDING_FAILED', id: check.key, actual: check.actual, expected: check.expected })),
    ...Object.values(capabilities).filter((capability) => capability.pass !== true).map((capability) => ({ code: 'MACHINE_CAPABILITY_PROOF_FAILED', id: capability.id })),
    ...capabilityRows.filter((row) => row.pass !== true).map((row) => ({ code: 'PROGRAM_DOD_MACHINE_CAPABILITY_MISSING', id: row.id, missing: row.missing })),
    ...repairQueue.filter((row) => row.pass !== true).map((row) => ({ code: 'FINAL_AUDIT_REPAIR_QUEUE_OPEN', id: row.id })),
  ];
  const pass = failures.length === 0;
  return {
    pass,
    status: pass ? 'PASS_EFINAL_MACHINE_CAPABILITY_GATE_READY_FOR_INDEPENDENT_AUDIT' : 'NOT_READY_EFINAL_MACHINE_CAPABILITY_GAPS',
    sourceBinding: {
      r3C05PhysicalRerunReport: r3ReportPath,
      r3SourceHeadSha: r3SourceHead,
      currentHeadSha: identity.headSha,
      currentOriginMainSha: identity.originMainSha,
      sourceDeltaFiles,
      productRuntimeDeltaFiles,
      checks: sourceBindingChecks,
      pass: sourceBindingPass,
    },
    capabilities,
    programDodEvidenceMap: capabilityRows,
    repairQueue,
    failures,
  };
}

export function evaluateFinalAudit(input = {}) {
  const repoRoot = path.resolve(input.repoRoot || process.cwd());
  const gitIdentity = input.identity || buildGitIdentity(repoRoot);
  const machineGate = buildMachineCapabilityGate({ ...input, repoRoot, identity: gitIdentity });
  const legacyReceiptDiagnostics = legacyReceiptDiagnostic(repoRoot, input.legacyReceiptPaths || LEGACY_RECEIPT_DIAGNOSTIC_PATHS);
  const pass = machineGate.pass === true;
  return {
    schemaVersion: REPORT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    contourId: 'EFINAL_FINAL_AUDIT_AND_PROGRAM_DOD',
    status: pass ? 'PASS_EFINAL_READY_FOR_INDEPENDENT_AUDIT' : 'NOT_READY_EFINAL_MACHINE_CAPABILITY_GAPS',
    pass,
    finalProgramDoDClaim: pass,
    finalProgramDoDClaimScope: pass
      ? 'READY_FOR_INDEPENDENT_AUDIT_PENDING_EXTERNAL_NO_OPEN_P0_VERDICT'
      : 'NOT_READY_RECEIPTS_ARE_DIAGNOSTIC_ONLY_MACHINE_CAPABILITY_GATE_REQUIRED',
    gitIdentity,
    machineCapabilityGate: machineGate,
    programDodEvidenceMap: machineGate.programDodEvidenceMap,
    criticalInvariants: machineGate.programDodEvidenceMap,
    legacyReceiptDiagnostics,
    legacyReceiptStatusCanCertifyProgramDoD: false,
    activePlatformScope: {
      macosPackagedElectron: pass ? 'MACHINE_GATE_READY_FOR_INDEPENDENT_AUDIT' : 'NOT_READY_MACHINE_CAPABILITY_GAPS',
      windows: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      linux: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      web: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      ios: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      android: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
    },
    falseReadinessGuards: {
      receiptPassDoneDeliveredStatusAcceptedAsProof: false,
      finalReceiptSelfCertificationAccepted: false,
      generatedScreenshotsAcceptedAlone: false,
      exactSourceBindingRequired: true,
      runtimeCommandUiPathRequired: true,
      persistedOutputRequired: true,
      reopenReadbackRequired: true,
      negativeControlsRequired: true,
      allP0RepairsRequiredBeforeProgramDone: true,
    },
    failures: machineGate.failures,
  };
}

export async function writeFinalAuditReport({ repoRoot = process.cwd(), outDir = DEFAULT_OUT_DIR } = {}) {
  const report = evaluateFinalAudit({ repoRoot });
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, 'final-audit-program-dod-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    ...report,
    reportPath,
    reportSha256: sha256File(reportPath),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await writeFinalAuditReport({ outDir: args.outDir });
  const line = `YALKEN_ATLAS_EFINAL_FINAL_AUDIT_PROGRAM_DOD_RESULT:${JSON.stringify(result)}`;
  process.stdout.write(`${args.json ? JSON.stringify(result, null, 2) : line}\n`);
  process.exit(result.pass ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
