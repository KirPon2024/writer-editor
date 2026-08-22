'use strict';

// R2.4 PK1 release security physical: model/contract proof for package
// security evidence classification and no distribution-readiness promotion.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'release-security-physical-pk1.mjs');
const APP_ASAR_SHA = '39382c67ffa427a8e4604399a74337570695d6c88d7db8b44fa948a6d273ccca';
const EXPECTED_HEAD = '6eaedd7ea2f81d6d2b4692024c1e65d201235d0a';
const STALE_HEAD = '336b5e1981ed40f2fed052bc1b56bc403b297d01';

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function programDagFixture() {
  return {
    stages: [
      {
        stageId: 'PK1_RELEASE_SECURITY_PHYSICAL',
        profile: 'PACKAGED_RELEASE_SECURITY',
        dependsOn: ['PK0_PACKAGE_CONTENT_TRUST', 'R6_MIGRATION_HISTORY_BACKUP_GC'],
        status: 'NOT_READY',
        mutationAuthority: 'PACKAGED_RELEASE_SECURITY_EVIDENCE',
        requiredEvidence: ['E5_PHYSICAL', 'E6_INDEPENDENT_EXACT_HEAD'],
        objective: 'Prove signing, notarization, hardened runtime, fuses, ASAR integrity, packaged recovery and critical journeys on supported targets.',
        claimCeiling: 'SUPPORTED_RELEASE_TARGETS_ONLY',
      },
    ],
  };
}

function scientificContractsFixture() {
  return {
    faultModels: [
      {
        faultModelId: 'FM_PACKAGED_RELEASE_R1',
        profileId: 'PACKAGED_RELEASE_SECURITY',
        includedFaults: [
          'UNEXPECTED_RUNTIME_FILE',
          'MISSING_RUNTIME_FILE',
          'SIGNATURE_INVALID',
          'NOTARIZATION_MISSING',
          'FUSE_DRIFT',
          'ASAR_INTEGRITY_FAILURE',
          'HARDENED_RUNTIME_MISMATCH',
          'PACKAGED_RECOVERY_FAILURE',
          'TARGET_ARCH_DRIFT',
        ],
        excludedFaults: ['UNSUPPORTED_RELEASE_TARGET', 'COMPROMISED_OS_TRUST_ROOT'],
      },
    ],
    resourceEnvelopes: [
      {
        resourceEnvelopeId: 'RE_PACKAGE_SUPPORTED_TARGET_MATRIX_R1',
        profileId: 'PACKAGED_RELEASE_SECURITY',
        limits: { status: 'TARGET_MATRIX_MUST_BE_EXPLICIT', unlistedTargets: 'OUT_OF_SCOPE_NOT_PASS' },
        exceedDisposition: 'NOT_READY',
      },
    ],
    claims: [
      {
        claimId: 'CLM_PACKAGED_RELEASE_SECURITY',
        statement: 'Packaged release security remains not ready until the supported target matrix has physical signing, notarization, integrity, recovery and critical-journey evidence.',
        profileId: 'PACKAGED_RELEASE_SECURITY',
        faultModelId: 'FM_PACKAGED_RELEASE_R1',
        resourceEnvelopeId: 'RE_PACKAGE_SUPPORTED_TARGET_MATRIX_R1',
        minimumEvidenceClass: 'E6_INDEPENDENT_EXACT_HEAD',
        currentVerdict: 'NOT_READY',
        cannotPromote: ['UNLISTED_TARGET', 'UNSIGNED_ARTIFACT', 'MODEL_ONLY'],
      },
    ],
  };
}

function packageFixture() {
  return {
    scripts: { 'build:mac': 'electron-builder --mac' },
    build: {
      afterPack: 'scripts/after-pack.cjs',
      mac: {
        extendInfo: {
          NSAppTransportSecurity: {
            NSAllowsArbitraryLoads: false,
            NSAllowsLocalNetworking: false,
            NSExceptionDomains: {
              '127.0.0.1': {
                NSTemporaryExceptionAllowsInsecureHTTPLoads: false,
                NSTemporaryExceptionAllowsInsecureHTTPSLoads: false,
              },
              localhost: {
                NSTemporaryExceptionAllowsInsecureHTTPLoads: false,
                NSTemporaryExceptionAllowsInsecureHTTPSLoads: false,
              },
            },
          },
        },
      },
    },
  };
}

function receiptsFixture({ head = STALE_HEAD } = {}) {
  return {
    c01: {
      status: 'PASS_UNSIGNED_LOCAL_ARTIFACT',
      pass: true,
      headShaAtReceiptGeneration: head,
      platformId: 'macos-packaged-electron',
      physicalArtifactEvidence: {
        artifactSet: {
          appAsar: { exists: true, bytes: 78669818, sha256: APP_ASAR_SHA },
        },
      },
      atsPolicy: {
        ok: true,
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: false,
        localhostHttp: false,
        localhostHttps: false,
        loopbackHttp: false,
        loopbackHttps: false,
      },
      signing: { status: 'NOT_READY_NO_DEVELOPER_ID', passClaim: false },
      notarization: { status: 'NOT_READY_NO_NOTARYTOOL_PROFILE', passClaim: false },
      negativeAssertions: {
        runtimeNetworkActivated: false,
        appleSigningPassClaim: false,
        appleNotarizationPassClaim: false,
        inactivePlatformCertificationClaim: false,
        finalProgramDoDClaim: false,
      },
    },
    c02: {
      status: 'PASS_PACKAGE_BOUND_RUNTIME_JOURNEY',
      pass: true,
      headShaAtReceiptGeneration: head,
      packageBinding: {
        packageBound: true,
        appAsarSha256: APP_ASAR_SHA,
        c01AppAsarSha256: APP_ASAR_SHA,
        ciParityIsNotPackageProof: true,
      },
      runtimeJourney: {
        firstLaunch: {
          ok: true,
          networkRequests: 0,
          createOk: true,
          saveOk: true,
          sameLaunchReopenOk: true,
          docxExportOk: true,
          markdownImportSafeCreateOk: true,
        },
        secondLaunch: {
          ok: true,
          freshProcessReopenOk: true,
          markerStart: true,
          markerEnd: true,
        },
      },
      inactivePlatformScope: {
        macosPackagedElectron: 'CERTIFIED_BY_THIS_CONTOUR',
        windows: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        linux: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        web: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        ios: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        android: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      },
      negativeAssertions: {
        runtimeNetworkActivated: false,
        inactivePlatformCertificationClaim: false,
        finalProgramDoDClaim: false,
      },
    },
    c03: {
      status: 'PASS_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION',
      pass: true,
      headShaAtReceiptGeneration: head,
      packageBinding: {
        packageBound: true,
        appAsarSha256: APP_ASAR_SHA,
        c01AppAsarSha256: APP_ASAR_SHA,
      },
      accessibilityResponsiveEvidence: {
        assertions: { noNetwork: true },
        networkRequestCount: 0,
      },
      negativeAssertions: {
        runtimeNetworkActivated: false,
        inactivePlatformCertificationClaim: false,
        finalProgramDoDClaim: false,
      },
    },
    c04: {
      status: 'PASS_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF',
      pass: true,
      headShaAtReceiptGeneration: head,
      receiptSet: {
        pass: true,
        c01Status: 'PASS_UNSIGNED_LOCAL_ARTIFACT',
        c02Status: 'PASS_PACKAGE_BOUND_RUNTIME_JOURNEY',
        c03Status: 'PASS_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION',
        appAsarSha256: APP_ASAR_SHA,
        c01AppAsarSha256: APP_ASAR_SHA,
        c02PackageBound: true,
        c03PackageBound: true,
      },
      performanceEvidence: {
        pass: true,
        status: 'PASS',
        corpus: { nodeCount: 10000 },
        metrics: { p95WallTimeMs: 128.572 },
      },
      securityEvidence: {
        genericSast: {
          status: 'PASS',
          exitCode: 0,
          findings: 0,
          timeouts: 0,
          nonTimeoutErrors: 0,
        },
        packageOfflineSecurity: {
          atsPolicyPass: true,
          runtimeNetworkActivated: false,
          signingStatus: 'NOT_READY_NO_DEVELOPER_ID',
          notarizationStatus: 'NOT_READY_NO_NOTARYTOOL_PROFILE',
        },
      },
      inactivePlatformScope: {
        macosPackagedElectron: 'CERTIFIED_BY_E11_C01_C02_C03_C04',
        windows: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        linux: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        web: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        ios: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        android: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      },
      limitations: {
        localUnsignedArtifact: true,
        localUnnotarizedArtifact: true,
        liveProductionDistributionClaim: false,
        physicalWindowsLinuxWebMobileProof: false,
      },
      negativeAssertions: {
        ciParityCanSubstitutePackagedProof: false,
        inactivePlatformCertificationClaim: false,
        finalProgramDoDClaim: false,
      },
    },
    activePlatform: {
      status: 'PASS_READY_FOR_EFINAL_REVALIDATION',
      pass: true,
      headShaAtReceiptGeneration: head,
      activePlatformScope: {
        macosPackagedElectron: 'CERTIFIED_FOR_LOCAL_UNSIGNED_PACKAGED_PROOF',
        windows: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        linux: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        web: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        ios: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        android: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      },
      limitations: {
        localUnsignedArtifact: true,
        localUnnotarizedArtifact: true,
        liveProductionDistributionClaim: false,
      },
    },
  };
}

function evaluate(module, overrides = {}) {
  return module.evaluateReleaseSecurityPhysical({
    expectedHeadSha: overrides.expectedHeadSha || EXPECTED_HEAD,
    packageJson: overrides.packageJson || packageFixture(),
    programDag: overrides.programDag || programDagFixture(),
    scientificContracts: overrides.scientificContracts || scientificContractsFixture(),
    receipts: overrides.receipts || receiptsFixture(),
    externalClaims: overrides.externalClaims,
  });
}

test('PK1 classifies release security evidence as profile NOT_READY without promoting distribution claims', async () => {
  const module = await loadModule();
  const result = evaluate(module);
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.error.value.errors));
  const receipt = result.value;

  assert.equal(receipt.stageId, 'PK1_RELEASE_SECURITY_PHYSICAL');
  assert.equal(receipt.profileId, 'PACKAGED_RELEASE_SECURITY');
  assert.equal(receipt.profileVerdictCandidate, 'NOT_READY');
  assert.equal(receipt.releaseReadiness.status, 'NOT_READY');
  assert.equal(receipt.releaseReadiness.productionReleaseReady, false);
  assert.equal(receipt.releaseReadiness.currentHeadPhysicalPackageProof, false);
  assert.equal(receipt.blockers.includes('PHYSICAL_RECEIPTS_NOT_CURRENT_HEAD'), true);
  assert.equal(receipt.blockers.includes('DEVELOPER_ID_SIGNATURE_NOT_READY'), true);
  assert.equal(receipt.blockers.includes('APPLE_NOTARIZATION_NOT_READY'), true);
  assert.equal(receipt.blockers.includes('ELECTRON_FUSE_POLICY_NOT_PROVEN'), true);
  assert.equal(receipt.blockers.includes('HARDENED_RUNTIME_NOT_PROVEN_FOR_DISTRIBUTION'), true);
  assert.equal(receipt.integrity.asarBinding, true);
  assert.equal(receipt.integrity.criticalJourneyPass, true);
  assert.equal(receipt.integrity.packagedRecoveryPass, true);
  assert.equal(receipt.integrity.genericSastPass, true);
  assert.equal(receipt.integrity.runtimeNetworkActivated, false);
  assert.equal(receipt.authority.releasePublication, false);
  assert.equal(receipt.authority.releaseReadyClaim, false);
  assert.equal(receipt.authority.signingPassClaim, false);
  assert.equal(receipt.authority.notarizationPassClaim, false);
  assert.equal(receipt.authority.fusePassClaim, false);
  assert.equal(receipt.authority.programScalarPass, false);
  assert.equal(receipt.targetMatrix.windows, 'NOT_ACTIVATED_NO_PASS_NO_HOLD');
});

test('PK1 rejects explicit release, signing, notarization, fuse, inactive platform and Program PASS promotion', async () => {
  const module = await loadModule();
  const result = evaluate(module, {
    externalClaims: {
      releaseReady: true,
      signingPass: true,
      notarizationPass: true,
      fusePass: true,
      currentHeadPhysicalPackagePass: true,
      productionDistribution: true,
      dependencyMutation: true,
      productRuntimeMutation: true,
      runtimeNetworkActivated: true,
      inactivePlatformCertification: true,
      programPass: true,
    },
  });

  assert.equal(result.ok, false);
  const errors = result.error.value.errors;
  assert.equal(errors.includes('PK1_RELEASE_READY_CLAIM_FORBIDDEN'), true);
  assert.equal(errors.includes('PK1_SIGNING_PASS_CLAIM_FORBIDDEN'), true);
  assert.equal(errors.includes('PK1_NOTARIZATION_PASS_CLAIM_FORBIDDEN'), true);
  assert.equal(errors.includes('PK1_FUSE_PASS_CLAIM_FORBIDDEN'), true);
  assert.equal(errors.includes('PK1_CURRENT_HEAD_PHYSICAL_PASS_CLAIM_FORBIDDEN'), true);
  assert.equal(errors.includes('PK1_PRODUCTION_DISTRIBUTION_CLAIM_FORBIDDEN'), true);
  assert.equal(errors.includes('PK1_DEPENDENCY_MUTATION_FORBIDDEN'), true);
  assert.equal(errors.includes('PK1_PRODUCT_RUNTIME_MUTATION_FORBIDDEN'), true);
  assert.equal(errors.includes('PK1_RUNTIME_NETWORK_FORBIDDEN'), true);
  assert.equal(errors.includes('PK1_INACTIVE_PLATFORM_CERTIFICATION_CLAIM_FORBIDDEN'), true);
  assert.equal(errors.includes('PK1_PROGRAM_PASS_CLAIM_FORBIDDEN'), true);
});

test('PK1 rejects program, package, ASAR, SAST and inactive-target drift', async () => {
  const module = await loadModule();

  const programDrift = evaluate(module, {
    programDag: { stages: [{ stageId: 'PK1_RELEASE_SECURITY_PHYSICAL', profile: 'WRITER_CORE' }] },
    scientificContracts: { faultModels: [], resourceEnvelopes: [], claims: [] },
  });
  assert.equal(programDrift.ok, false);
  assert.equal(programDrift.error.value.errors.includes('PK1_PROFILE_MISMATCH'), true);
  assert.equal(programDrift.error.value.errors.includes('PK1_FAULT_MODEL_MISSING'), true);
  assert.equal(programDrift.error.value.errors.includes('PK1_RESOURCE_ENVELOPE_MISSING'), true);
  assert.equal(programDrift.error.value.errors.includes('PK1_CLAIM_MISSING'), true);

  const packageDrift = evaluate(module, {
    packageJson: { scripts: { 'build:mac': 'electron-builder --mac' }, build: { mac: { extendInfo: { NSAppTransportSecurity: {} } } } },
  });
  assert.equal(packageDrift.ok, false);
  assert.equal(packageDrift.error.value.errors.includes('PK1_AFTER_PACK_HARDENING_HOOK_MISSING'), true);
  assert.equal(packageDrift.error.value.errors.includes('PK1_ATS_ARBITRARY_LOADS_NOT_FALSE'), true);

  const asarDriftReceipts = receiptsFixture();
  asarDriftReceipts.c02.packageBinding.appAsarSha256 = 'a'.repeat(64);
  const asarDrift = evaluate(module, { receipts: asarDriftReceipts });
  assert.equal(asarDrift.ok, false);
  assert.equal(asarDrift.error.value.errors.includes('PK1_ASAR_BINDING_MISMATCH'), true);

  const sastDriftReceipts = receiptsFixture();
  sastDriftReceipts.c04.securityEvidence.genericSast.findings = 1;
  const sastDrift = evaluate(module, { receipts: sastDriftReceipts });
  assert.equal(sastDrift.ok, false);
  assert.equal(sastDrift.error.value.errors.includes('PK1_SAST_NOT_CLEAN'), true);

  const inactiveTargetDriftReceipts = receiptsFixture();
  inactiveTargetDriftReceipts.c04.inactivePlatformScope.windows = 'CERTIFIED';
  const inactiveTargetDrift = evaluate(module, { receipts: inactiveTargetDriftReceipts });
  assert.equal(inactiveTargetDrift.ok, false);
  assert.equal(inactiveTargetDrift.error.value.errors.includes('PK1_INACTIVE_PLATFORM_NOT_FAIL_CLOSED:windows'), true);
});

test('PK1 removes only freshness blocker when all physical receipts match current head', async () => {
  const module = await loadModule();
  const result = evaluate(module, { receipts: receiptsFixture({ head: EXPECTED_HEAD }) });
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.error.value.errors));
  assert.equal(result.value.releaseReadiness.currentHeadPhysicalPackageProof, true);
  assert.equal(result.value.blockers.includes('PHYSICAL_RECEIPTS_NOT_CURRENT_HEAD'), false);
  assert.equal(result.value.releaseReadiness.productionReleaseReady, false);
  assert.equal(result.value.blockers.includes('DEVELOPER_ID_SIGNATURE_NOT_READY'), true);
  assert.equal(result.value.blockers.includes('APPLE_NOTARIZATION_NOT_READY'), true);
});

module.exports = {
  APP_ASAR_SHA,
  EXPECTED_HEAD,
  STALE_HEAD,
  clone,
  programDagFixture,
  scientificContractsFixture,
  packageFixture,
  receiptsFixture,
  evaluate,
};
