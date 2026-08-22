#!/usr/bin/env node
// R2.4 PK1 - release security physical posture. This OPS-only verifier binds
// package-security evidence to explicit supported-target claims while refusing
// release-ready, signing, notarization, fuse, runtime-network, product-runtime,
// dependency, publication, inactive-platform, and Program PASS promotion.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const PK1_STAGE_ID = 'PK1_RELEASE_SECURITY_PHYSICAL';
export const PK1_PROFILE_ID = 'PACKAGED_RELEASE_SECURITY';
export const PK1_SCHEMA_VERSION = 'yalken.r24.pk1.release-security-physical.v1';

export const PK1_REQUIRED_RECEIPT_STATUSES = Object.freeze({
  c01: 'PASS_UNSIGNED_LOCAL_ARTIFACT',
  c02: 'PASS_PACKAGE_BOUND_RUNTIME_JOURNEY',
  c03: 'PASS_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION',
  c04: 'PASS_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF',
});

export const PK1_REQUIRED_FAULTS = Object.freeze([
  'UNEXPECTED_RUNTIME_FILE',
  'MISSING_RUNTIME_FILE',
  'SIGNATURE_INVALID',
  'NOTARIZATION_MISSING',
  'FUSE_DRIFT',
  'ASAR_INTEGRITY_FAILURE',
  'HARDENED_RUNTIME_MISMATCH',
  'PACKAGED_RECOVERY_FAILURE',
  'TARGET_ARCH_DRIFT',
]);

export const PK1_RECEIPT_PATHS = Object.freeze({
  c01: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RECEIPT.json',
  c02: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C02_PACKAGED_CRITICAL_JOURNEY_RECEIPT.json',
  c03: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION_RECEIPT.json',
  c04: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C04_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF_RECEIPT.json',
  activePlatform: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_ACTIVE_PLATFORM_CERTIFICATION_REVALIDATION_RECEIPT.json',
});

const RELEASE_READY_CLAIM = false;
const SIGNING_PASS_CLAIM = false;
const NOTARIZATION_PASS_CLAIM = false;
const FUSE_PASS_CLAIM = false;
const CURRENT_HEAD_PHYSICAL_PASS_CLAIM = false;
const PRODUCTION_DISTRIBUTION_CLAIM = false;
const DEPENDENCY_MUTATION_ALLOWED = false;
const PRODUCT_RUNTIME_MUTATION = false;
const RUNTIME_NETWORK_ACTIVATED = false;
const INACTIVE_PLATFORM_CERTIFICATION_CLAIM = false;
const PROGRAM_PASS_CLAIM = false;
const STALE_PHYSICAL_RECEIPT_BLOCKER_ENABLED = true;

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function hashCanonicalValue(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

export function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function uniqSorted(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].sort();
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/u.test(String(value || ''));
}

function isGitSha(value) {
  return /^[a-f0-9]{40}$/u.test(String(value || ''));
}

function pushUnique(list, code) {
  if (code && !list.includes(code)) list.push(code);
}

function getAsarSha(receipt, key) {
  if (key === 'c01') return receipt?.physicalArtifactEvidence?.artifactSet?.appAsar?.sha256 || '';
  if (key === 'c02' || key === 'c03') return receipt?.packageBinding?.appAsarSha256 || '';
  if (key === 'c04') return receipt?.receiptSet?.appAsarSha256 || '';
  return '';
}

function validateProgramBinding(programDag, scientificContracts) {
  const stages = Array.isArray(programDag?.stages) ? programDag.stages : [];
  const stage = stages.find((row) => row?.stageId === PK1_STAGE_ID);
  const faultModels = Array.isArray(scientificContracts?.faultModels) ? scientificContracts.faultModels : [];
  const resourceEnvelopes = Array.isArray(scientificContracts?.resourceEnvelopes) ? scientificContracts.resourceEnvelopes : [];
  const claims = Array.isArray(scientificContracts?.claims) ? scientificContracts.claims : [];
  const faultModel = faultModels.find((row) => row?.faultModelId === 'FM_PACKAGED_RELEASE_R1');
  const resourceEnvelope = resourceEnvelopes.find((row) => row?.resourceEnvelopeId === 'RE_PACKAGE_SUPPORTED_TARGET_MATRIX_R1');
  const claim = claims.find((row) => row?.claimId === 'CLM_PACKAGED_RELEASE_SECURITY');
  const errors = [];

  if (!stage) errors.push('PK1_STAGE_MISSING');
  if (stage && stage.profile !== PK1_PROFILE_ID) errors.push('PK1_PROFILE_MISMATCH');
  if (stage && stage.mutationAuthority !== 'PACKAGED_RELEASE_SECURITY_EVIDENCE') errors.push('PK1_AUTHORITY_MISMATCH');
  if (stage && stage.claimCeiling !== 'SUPPORTED_RELEASE_TARGETS_ONLY') errors.push('PK1_CLAIM_CEILING_MISMATCH');
  for (const dep of ['PK0_PACKAGE_CONTENT_TRUST', 'R6_MIGRATION_HISTORY_BACKUP_GC']) {
    if (stage && (!Array.isArray(stage.dependsOn) || !stage.dependsOn.includes(dep))) errors.push(`PK1_DEPENDENCY_MISSING:${dep}`);
  }
  for (const evidenceClass of ['E5_PHYSICAL', 'E6_INDEPENDENT_EXACT_HEAD']) {
    if (stage && (!Array.isArray(stage.requiredEvidence) || !stage.requiredEvidence.includes(evidenceClass))) {
      errors.push(`PK1_REQUIRED_EVIDENCE_MISSING:${evidenceClass}`);
    }
  }

  if (!faultModel) errors.push('PK1_FAULT_MODEL_MISSING');
  if (faultModel && faultModel.profileId !== PK1_PROFILE_ID) errors.push('PK1_FAULT_MODEL_PROFILE_MISMATCH');
  for (const fault of PK1_REQUIRED_FAULTS) {
    if (faultModel && (!Array.isArray(faultModel.includedFaults) || !faultModel.includedFaults.includes(fault))) {
      errors.push(`PK1_FAULT_NOT_COVERED:${fault}`);
    }
  }
  if (!resourceEnvelope) errors.push('PK1_RESOURCE_ENVELOPE_MISSING');
  if (resourceEnvelope?.limits?.status !== 'TARGET_MATRIX_MUST_BE_EXPLICIT') errors.push('PK1_TARGET_MATRIX_NOT_EXPLICIT');
  if (resourceEnvelope?.limits?.unlistedTargets !== 'OUT_OF_SCOPE_NOT_PASS') errors.push('PK1_UNLISTED_TARGETS_NOT_FAIL_CLOSED');
  if (resourceEnvelope?.exceedDisposition !== 'NOT_READY') errors.push('PK1_RESOURCE_EXCEED_DISPOSITION_MISMATCH');

  if (!claim) errors.push('PK1_CLAIM_MISSING');
  if (claim?.profileId !== PK1_PROFILE_ID) errors.push('PK1_CLAIM_PROFILE_MISMATCH');
  if (claim?.minimumEvidenceClass !== 'E6_INDEPENDENT_EXACT_HEAD') errors.push('PK1_CLAIM_EVIDENCE_CLASS_MISMATCH');
  if (claim?.currentVerdict !== 'NOT_READY') errors.push('PK1_CLAIM_CURRENT_VERDICT_MISMATCH');
  for (const forbiddenPromotion of ['UNLISTED_TARGET', 'UNSIGNED_ARTIFACT', 'MODEL_ONLY']) {
    if (claim && (!Array.isArray(claim.cannotPromote) || !claim.cannotPromote.includes(forbiddenPromotion))) {
      errors.push(`PK1_CLAIM_PROMOTION_GUARD_MISSING:${forbiddenPromotion}`);
    }
  }

  return { ok: errors.length === 0, errors, stage, faultModel, resourceEnvelope, claim };
}

function validatePackageConfiguration(packageJson) {
  const errors = [];
  const ats = packageJson?.build?.mac?.extendInfo?.NSAppTransportSecurity || {};
  if (packageJson?.build?.afterPack !== 'scripts/after-pack.cjs') errors.push('PK1_AFTER_PACK_HARDENING_HOOK_MISSING');
  if (packageJson?.scripts?.['build:mac'] !== 'electron-builder --mac') errors.push('PK1_MAC_BUILD_SCRIPT_MISMATCH');
  if (ats.NSAllowsArbitraryLoads !== false) errors.push('PK1_ATS_ARBITRARY_LOADS_NOT_FALSE');
  if (ats.NSAllowsLocalNetworking !== false) errors.push('PK1_ATS_LOCAL_NETWORKING_NOT_FALSE');
  for (const host of ['localhost', '127.0.0.1']) {
    const rule = ats.NSExceptionDomains?.[host] || {};
    if (rule.NSTemporaryExceptionAllowsInsecureHTTPLoads !== false) errors.push(`PK1_ATS_INSECURE_HTTP_NOT_FALSE:${host}`);
    if (rule.NSTemporaryExceptionAllowsInsecureHTTPSLoads !== false) errors.push(`PK1_ATS_INSECURE_HTTPS_NOT_FALSE:${host}`);
  }
  return { ok: errors.length === 0, errors };
}

function validateReceipts(receipts) {
  const errors = [];
  for (const [key, expected] of Object.entries(PK1_REQUIRED_RECEIPT_STATUSES)) {
    const receipt = receipts?.[key] || {};
    if (receipt.status !== expected) errors.push(`PK1_RECEIPT_STATUS_MISMATCH:${key}`);
    if (receipt.pass !== true) errors.push(`PK1_RECEIPT_NOT_PASS:${key}`);
  }

  const asarShas = Object.keys(PK1_REQUIRED_RECEIPT_STATUSES).map((key) => getAsarSha(receipts?.[key], key));
  const uniqueAsarShas = uniqSorted(asarShas);
  const asarBindingPass = uniqueAsarShas.length === 1 && uniqueAsarShas[0] !== '';
  if (!asarBindingPass) errors.push('PK1_ASAR_BINDING_MISMATCH');
  if (uniqueAsarShas[0] && !isSha256(uniqueAsarShas[0])) errors.push('PK1_ASAR_SHA_INVALID');

  const c01 = receipts?.c01 || {};
  const c02 = receipts?.c02 || {};
  const c03 = receipts?.c03 || {};
  const c04 = receipts?.c04 || {};
  if (c01?.atsPolicy?.ok !== true) errors.push('PK1_C01_ATS_POLICY_NOT_PASS');
  if (c01?.negativeAssertions?.runtimeNetworkActivated !== false) errors.push('PK1_C01_RUNTIME_NETWORK_ASSERTION_DRIFT');
  if (c01?.signing?.status !== 'NOT_READY_NO_DEVELOPER_ID' || c01?.signing?.passClaim !== false) errors.push('PK1_SIGNING_STATUS_UNEXPECTED');
  if (c01?.notarization?.status !== 'NOT_READY_NO_NOTARYTOOL_PROFILE' || c01?.notarization?.passClaim !== false) {
    errors.push('PK1_NOTARIZATION_STATUS_UNEXPECTED');
  }
  const c02First = c02?.runtimeJourney?.firstLaunch || {};
  const c02Second = c02?.runtimeJourney?.secondLaunch || {};
  if (c02First.createOk !== true || c02First.saveOk !== true || c02First.sameLaunchReopenOk !== true) {
    errors.push('PK1_C02_CRITICAL_CREATE_SAVE_REOPEN_NOT_PASS');
  }
  if (c02First.docxExportOk !== true || c02First.markdownImportSafeCreateOk !== true) {
    errors.push('PK1_C02_EXPORT_IMPORT_NOT_PASS');
  }
  if (c02Second.freshProcessReopenOk !== true || c02Second.markerStart !== true || c02Second.markerEnd !== true) {
    errors.push('PK1_C02_PACKAGED_RECOVERY_NOT_PASS');
  }
  if (c02First.networkRequests !== 0) errors.push('PK1_C02_RUNTIME_NETWORK_DETECTED');
  if (c03?.accessibilityResponsiveEvidence?.assertions?.noNetwork !== true || c03?.accessibilityResponsiveEvidence?.networkRequestCount !== 0) {
    errors.push('PK1_C03_RUNTIME_NETWORK_DETECTED');
  }
  if (c03?.negativeAssertions?.inactivePlatformCertificationClaim !== false) errors.push('PK1_C03_INACTIVE_PLATFORM_ASSERTION_DRIFT');
  if (c04?.performanceEvidence?.pass !== true || c04?.performanceEvidence?.status !== 'PASS') errors.push('PK1_C04_PERFORMANCE_NOT_PASS');
  const genericSastClean = (
    c04?.securityEvidence?.genericSast?.status !== 'PASS'
    || c04?.securityEvidence?.genericSast?.exitCode !== 0
    || c04?.securityEvidence?.genericSast?.findings !== 0
    || c04?.securityEvidence?.genericSast?.timeouts !== 0
    || c04?.securityEvidence?.genericSast?.nonTimeoutErrors !== 0
  ) === false;
  if (!genericSastClean) {
    errors.push('PK1_SAST_NOT_CLEAN');
  }
  if (c04?.securityEvidence?.packageOfflineSecurity?.runtimeNetworkActivated !== false) errors.push('PK1_C04_RUNTIME_NETWORK_DETECTED');
  if (c04?.limitations?.liveProductionDistributionClaim !== false) errors.push('PK1_C04_LIVE_DISTRIBUTION_ASSERTION_DRIFT');
  for (const platform of ['windows', 'linux', 'web', 'ios', 'android']) {
    if (c04?.inactivePlatformScope?.[platform] !== 'NOT_ACTIVATED_NO_PASS_NO_HOLD') {
      errors.push(`PK1_INACTIVE_PLATFORM_NOT_FAIL_CLOSED:${platform}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    asarBindingPass,
    appAsarSha256: asarBindingPass ? uniqueAsarShas[0] : '',
  };
}

function classifyFreshness(receipts, expectedHeadSha) {
  const staleReceipts = [];
  const receiptHeads = {};
  for (const key of Object.keys(PK1_REQUIRED_RECEIPT_STATUSES)) {
    const head = String(receipts?.[key]?.headShaAtReceiptGeneration || '').trim();
    receiptHeads[key] = head;
    if (head !== expectedHeadSha) staleReceipts.push(key);
  }
  return {
    receiptHeads,
    staleReceipts,
    physicalEvidenceFreshForCurrentHead: staleReceipts.length === 0,
  };
}

function validateExternalClaims(externalClaims) {
  const claims = externalClaims && typeof externalClaims === 'object' && !Array.isArray(externalClaims) ? externalClaims : {};
  const errors = [];
  if (claims.releaseReady === true || RELEASE_READY_CLAIM === true) errors.push('PK1_RELEASE_READY_CLAIM_FORBIDDEN');
  if (claims.signingPass === true || SIGNING_PASS_CLAIM === true) errors.push('PK1_SIGNING_PASS_CLAIM_FORBIDDEN');
  if (claims.notarizationPass === true || NOTARIZATION_PASS_CLAIM === true) errors.push('PK1_NOTARIZATION_PASS_CLAIM_FORBIDDEN');
  if (claims.fusePass === true || FUSE_PASS_CLAIM === true) errors.push('PK1_FUSE_PASS_CLAIM_FORBIDDEN');
  if (claims.currentHeadPhysicalPackagePass === true || CURRENT_HEAD_PHYSICAL_PASS_CLAIM === true) {
    errors.push('PK1_CURRENT_HEAD_PHYSICAL_PASS_CLAIM_FORBIDDEN');
  }
  if (claims.productionDistribution === true || PRODUCTION_DISTRIBUTION_CLAIM === true) errors.push('PK1_PRODUCTION_DISTRIBUTION_CLAIM_FORBIDDEN');
  if (claims.dependencyMutation === true || DEPENDENCY_MUTATION_ALLOWED === true) errors.push('PK1_DEPENDENCY_MUTATION_FORBIDDEN');
  if (claims.productRuntimeMutation === true || PRODUCT_RUNTIME_MUTATION === true) errors.push('PK1_PRODUCT_RUNTIME_MUTATION_FORBIDDEN');
  if (claims.runtimeNetworkActivated === true || RUNTIME_NETWORK_ACTIVATED === true) errors.push('PK1_RUNTIME_NETWORK_FORBIDDEN');
  if (claims.inactivePlatformCertification === true || INACTIVE_PLATFORM_CERTIFICATION_CLAIM === true) {
    errors.push('PK1_INACTIVE_PLATFORM_CERTIFICATION_CLAIM_FORBIDDEN');
  }
  if (claims.programPass === true || PROGRAM_PASS_CLAIM === true) errors.push('PK1_PROGRAM_PASS_CLAIM_FORBIDDEN');
  return { ok: errors.length === 0, errors };
}

export function evaluateReleaseSecurityPhysical(input = {}) {
  const receipts = input.receipts || {};
  const expectedHeadSha = String(input.expectedHeadSha || '').trim();
  const errors = [];
  const blockers = [];

  if (!isGitSha(expectedHeadSha)) errors.push('PK1_EXPECTED_HEAD_INVALID');

  const programBinding = validateProgramBinding(input.programDag, input.scientificContracts);
  if (!programBinding.ok) errors.push(...programBinding.errors);

  const packageConfiguration = validatePackageConfiguration(input.packageJson || {});
  if (!packageConfiguration.ok) errors.push(...packageConfiguration.errors);

  const receiptValidation = validateReceipts(receipts);
  if (!receiptValidation.ok) errors.push(...receiptValidation.errors);

  const freshness = classifyFreshness(receipts, expectedHeadSha);
  if (STALE_PHYSICAL_RECEIPT_BLOCKER_ENABLED && freshness.staleReceipts.length > 0) {
    pushUnique(blockers, 'PHYSICAL_RECEIPTS_NOT_CURRENT_HEAD');
  }

  const externalClaims = validateExternalClaims(input.externalClaims);
  if (!externalClaims.ok) errors.push(...externalClaims.errors);

  const signingPass = receipts?.c01?.signing?.status === 'PASS_DEVELOPER_ID' && receipts?.c01?.signing?.passClaim === true;
  const notarizationPass = receipts?.c01?.notarization?.status === 'PASS_NOTARIZED' && receipts?.c01?.notarization?.passClaim === true;
  const atsPolicyPass = receipts?.c01?.atsPolicy?.ok === true && receipts?.c04?.securityEvidence?.packageOfflineSecurity?.atsPolicyPass === true;
  const criticalJourneyPass = receipts?.c02?.runtimeJourney?.firstLaunch?.createOk === true
    && receipts?.c02?.runtimeJourney?.firstLaunch?.saveOk === true
    && receipts?.c02?.runtimeJourney?.firstLaunch?.sameLaunchReopenOk === true
    && receipts?.c02?.runtimeJourney?.firstLaunch?.docxExportOk === true
    && receipts?.c02?.runtimeJourney?.firstLaunch?.markdownImportSafeCreateOk === true;
  const packagedRecoveryPass = receipts?.c02?.runtimeJourney?.secondLaunch?.freshProcessReopenOk === true
    && receipts?.c02?.runtimeJourney?.secondLaunch?.markerStart === true
    && receipts?.c02?.runtimeJourney?.secondLaunch?.markerEnd === true;
  const sastPass = receipts?.c04?.securityEvidence?.genericSast?.status === 'PASS'
    && receipts?.c04?.securityEvidence?.genericSast?.exitCode === 0
    && receipts?.c04?.securityEvidence?.genericSast?.findings === 0
    && receipts?.c04?.securityEvidence?.genericSast?.timeouts === 0
    && receipts?.c04?.securityEvidence?.genericSast?.nonTimeoutErrors === 0;
  const runtimeNetworkActivated = receipts?.c01?.negativeAssertions?.runtimeNetworkActivated === true
    || receipts?.c02?.runtimeJourney?.firstLaunch?.networkRequests !== 0
    || receipts?.c03?.accessibilityResponsiveEvidence?.networkRequestCount !== 0
    || receipts?.c04?.securityEvidence?.packageOfflineSecurity?.runtimeNetworkActivated !== false;

  if (!signingPass) pushUnique(blockers, 'DEVELOPER_ID_SIGNATURE_NOT_READY');
  if (!notarizationPass) pushUnique(blockers, 'APPLE_NOTARIZATION_NOT_READY');
  pushUnique(blockers, 'ELECTRON_FUSE_POLICY_NOT_PROVEN');
  pushUnique(blockers, 'HARDENED_RUNTIME_NOT_PROVEN_FOR_DISTRIBUTION');
  pushUnique(blockers, 'PRODUCTION_RELEASE_PUBLICATION_NOT_AUTHORIZED');
  pushUnique(blockers, 'NON_MACOS_TARGETS_NOT_ACTIVATED');

  const targetMatrix = {
    macosPackagedElectronLocalUnsigned: receipts?.activePlatform?.activePlatformScope?.macosPackagedElectron
      || 'CERTIFIED_FOR_LOCAL_UNSIGNED_PACKAGED_PROOF',
    macosProductionDistribution: 'NOT_READY_UNSIGNED_UNNOTARIZED_NO_FUSE_OR_HARDENED_RUNTIME_PROOF',
    windows: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
    linux: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
    web: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
    ios: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
    android: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
  };

  const value = {
    schemaVersion: PK1_SCHEMA_VERSION,
    stageId: PK1_STAGE_ID,
    profileId: PK1_PROFILE_ID,
    state: errors.length === 0 ? 'ready_for_package_claim_compiler' : 'blocked',
    pass: errors.length === 0,
    errors: uniqSorted(errors),
    blockers: uniqSorted(blockers),
    blockersHash: hashCanonicalValue(uniqSorted(blockers)),
    profileVerdictCandidate: 'NOT_READY',
    stageClosureKind: 'TYPED_RELEASE_SECURITY_NOT_READY_CLASSIFICATION',
    programBinding: {
      stageId: PK1_STAGE_ID,
      profileId: PK1_PROFILE_ID,
      claimCeiling: 'SUPPORTED_RELEASE_TARGETS_ONLY',
      minimumEvidenceClass: 'E6_INDEPENDENT_EXACT_HEAD',
      packageProfileOnly: true,
      writerProfilePromotion: false,
      wordProfilePromotion: false,
      atlasProfilePromotion: false,
      programVerdictContribution: false,
    },
    authority: {
      packagedReleaseSecurityEvidence: true,
      productRuntimeMutation: false,
      dependencyMutation: false,
      lockfileMutation: false,
      runtimeNetworkActivated: false,
      signingCredentialUse: false,
      notarizationCredentialUse: false,
      releasePublication: false,
      releaseReadyClaim: false,
      signingPassClaim: false,
      notarizationPassClaim: false,
      fusePassClaim: false,
      inactivePlatformCertificationClaim: false,
      programScalarPass: false,
      wordOrGoogleClaim: false,
    },
    releaseReadiness: {
      status: 'NOT_READY',
      productionReleaseReady: false,
      currentHeadPhysicalPackageProof: freshness.physicalEvidenceFreshForCurrentHead,
      physicalEvidenceFreshForCurrentHead: freshness.physicalEvidenceFreshForCurrentHead,
      staleReceipts: freshness.staleReceipts,
      signingPass,
      notarizationPass,
      fusePass: false,
      hardenedRuntimePass: false,
      productionDistributionPublished: false,
      blockers: uniqSorted(blockers),
    },
    integrity: {
      asarBinding: receiptValidation.asarBindingPass,
      appAsarSha256: receiptValidation.appAsarSha256,
      atsPolicyPass,
      packagedRecoveryPass,
      criticalJourneyPass,
      genericSastPass: sastPass,
      runtimeNetworkActivated,
      signingStatus: receipts?.c01?.signing?.status || 'UNKNOWN',
      notarizationStatus: receipts?.c01?.notarization?.status || 'UNKNOWN',
      fuseStatus: 'NOT_PROVEN_TYPED_BLOCKER',
      hardenedRuntimeStatus: 'NOT_PROVEN_FOR_DISTRIBUTION_TYPED_BLOCKER',
    },
    evidence: {
      expectedHeadSha,
      receiptHeads: freshness.receiptHeads,
      statuses: Object.fromEntries(Object.keys(PK1_REQUIRED_RECEIPT_STATUSES).map((key) => [key, receipts?.[key]?.status || 'UNKNOWN'])),
      activePlatformStatus: receipts?.activePlatform?.status || 'UNKNOWN',
      appAsarSha256: receiptValidation.appAsarSha256,
      c04Sast: receipts?.c04?.securityEvidence?.genericSast || {},
      c04Performance: {
        pass: receipts?.c04?.performanceEvidence?.pass === true,
        status: receipts?.c04?.performanceEvidence?.status || 'UNKNOWN',
        p95WallTimeMs: receipts?.c04?.performanceEvidence?.metrics?.p95WallTimeMs ?? null,
        nodeCount: receipts?.c04?.performanceEvidence?.corpus?.nodeCount ?? null,
      },
      receiptDigest: hashCanonicalValue({
        c01: receipts?.c01 || {},
        c02: receipts?.c02 || {},
        c03: receipts?.c03 || {},
        c04: receipts?.c04 || {},
        activePlatform: receipts?.activePlatform || {},
      }),
    },
    targetMatrix,
  };

  return errors.length === 0 ? { ok: true, value } : { ok: false, error: { code: 'E_R24_PK1_RELEASE_SECURITY_PHYSICAL', value } };
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function readJsonWithSha(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return { value: JSON.parse(raw), sha256: sha256Text(raw), bytes: Buffer.byteLength(raw) };
}

export function gitRevParseHead({ cwd = process.cwd() } = {}) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  });
  if (result.status !== 0) {
    throw new Error(`git rev-parse HEAD failed: ${String(result.stderr || '').trim()}`);
  }
  return String(result.stdout || '').trim();
}

export function evaluateRepositoryReleaseSecurityPhysical({ repoRoot = process.cwd(), expectedHeadSha = null } = {}) {
  const root = path.resolve(repoRoot);
  const receiptReads = {};
  const receipts = {};
  for (const [key, relativePath] of Object.entries(PK1_RECEIPT_PATHS)) {
    receiptReads[key] = readJsonWithSha(path.join(root, relativePath));
    receipts[key] = receiptReads[key].value;
  }
  const result = evaluateReleaseSecurityPhysical({
    expectedHeadSha: expectedHeadSha || gitRevParseHead({ cwd: root }),
    packageJson: readJson(path.join(root, 'package.json')),
    programDag: readJson(path.join(root, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json')),
    scientificContracts: readJson(path.join(root, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'SCIENTIFIC_CONTRACTS.json')),
    receipts,
  });
  const receipt = result.ok ? result.value : result.error.value;
  receipt.evidence.receiptFiles = Object.fromEntries(Object.entries(receiptReads).map(([key, read]) => [key, {
    path: PK1_RECEIPT_PATHS[key],
    sha256: read.sha256,
    bytes: read.bytes,
  }]));
  return result;
}

function main() {
  const result = evaluateRepositoryReleaseSecurityPhysical();
  const receipt = result.ok ? result.value : result.error.value;
  console.log(`R24_PK1_RELEASE_SECURITY_PHYSICAL_RECEIPT=${JSON.stringify({
    pass: receipt.pass,
    stageId: receipt.stageId,
    profileId: receipt.profileId,
    state: receipt.state,
    profileVerdictCandidate: receipt.profileVerdictCandidate,
    errors: receipt.errors,
    blockers: receipt.blockers,
    expectedHeadSha: receipt.evidence.expectedHeadSha,
    staleReceipts: receipt.releaseReadiness.staleReceipts,
    appAsarSha256: receipt.evidence.appAsarSha256,
    productionReleaseReady: receipt.releaseReadiness.productionReleaseReady,
    releaseReadyClaim: receipt.authority.releaseReadyClaim,
    signingPassClaim: receipt.authority.signingPassClaim,
    notarizationPassClaim: receipt.authority.notarizationPassClaim,
    fusePassClaim: receipt.authority.fusePassClaim,
    programScalarPass: receipt.authority.programScalarPass,
  })}`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
