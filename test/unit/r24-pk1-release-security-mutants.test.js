'use strict';

// R2.4 PK1 mutation proof: each mutant weakens one release-security guard and
// the oracle must kill every mutant.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'release-security-physical-pk1.mjs');
const APP_ASAR_SHA = '39382c67ffa427a8e4604399a74337570695d6c88d7db8b44fa948a6d273ccca';
const EXPECTED_HEAD = '6eaedd7ea2f81d6d2b4692024c1e65d201235d0a';
const STALE_HEAD = '336b5e1981ed40f2fed052bc1b56bc403b297d01';

const MUTANTS = Object.freeze([
  {
    id: 'release-ready-claim-promoted',
    find: 'const RELEASE_READY_CLAIM = false;',
    replace: 'const RELEASE_READY_CLAIM = true;',
  },
  {
    id: 'signing-pass-claim-promoted',
    find: 'const SIGNING_PASS_CLAIM = false;',
    replace: 'const SIGNING_PASS_CLAIM = true;',
  },
  {
    id: 'notarization-pass-claim-promoted',
    find: 'const NOTARIZATION_PASS_CLAIM = false;',
    replace: 'const NOTARIZATION_PASS_CLAIM = true;',
  },
  {
    id: 'fuse-pass-claim-promoted',
    find: 'const FUSE_PASS_CLAIM = false;',
    replace: 'const FUSE_PASS_CLAIM = true;',
  },
  {
    id: 'stale-physical-blocker-disabled',
    find: 'const STALE_PHYSICAL_RECEIPT_BLOCKER_ENABLED = true;',
    replace: 'const STALE_PHYSICAL_RECEIPT_BLOCKER_ENABLED = false;',
  },
  {
    id: 'asar-binding-always-passes',
    find: "  const asarBindingPass = uniqueAsarShas.length === 1 && uniqueAsarShas[0] !== '';",
    replace: '  const asarBindingPass = true;',
  },
  {
    id: 'sast-clean-error-disabled',
    find: '  if (!genericSastClean) {',
    replace: '  if (false && !genericSastClean) {',
  },
  {
    id: 'after-pack-hook-check-disabled',
    find: "  if (packageJson?.build?.afterPack !== 'scripts/after-pack.cjs') errors.push('PK1_AFTER_PACK_HARDENING_HOOK_MISSING');",
    replace: "  if (false && packageJson?.build?.afterPack !== 'scripts/after-pack.cjs') errors.push('PK1_AFTER_PACK_HARDENING_HOOK_MISSING');",
  },
]);

async function importModule(modulePath) {
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}-${Math.random()}`);
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
        profileId: 'PACKAGED_RELEASE_SECURITY',
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
      physicalArtifactEvidence: { artifactSet: { appAsar: { exists: true, bytes: 1, sha256: APP_ASAR_SHA } } },
      atsPolicy: { ok: true },
      signing: { status: 'NOT_READY_NO_DEVELOPER_ID', passClaim: false },
      notarization: { status: 'NOT_READY_NO_NOTARYTOOL_PROFILE', passClaim: false },
      negativeAssertions: { runtimeNetworkActivated: false },
    },
    c02: {
      status: 'PASS_PACKAGE_BOUND_RUNTIME_JOURNEY',
      pass: true,
      headShaAtReceiptGeneration: head,
      packageBinding: { packageBound: true, appAsarSha256: APP_ASAR_SHA, c01AppAsarSha256: APP_ASAR_SHA },
      runtimeJourney: {
        firstLaunch: {
          createOk: true,
          saveOk: true,
          sameLaunchReopenOk: true,
          docxExportOk: true,
          markdownImportSafeCreateOk: true,
          networkRequests: 0,
        },
        secondLaunch: { freshProcessReopenOk: true, markerStart: true, markerEnd: true },
      },
    },
    c03: {
      status: 'PASS_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION',
      pass: true,
      headShaAtReceiptGeneration: head,
      packageBinding: { packageBound: true, appAsarSha256: APP_ASAR_SHA, c01AppAsarSha256: APP_ASAR_SHA },
      accessibilityResponsiveEvidence: { assertions: { noNetwork: true }, networkRequestCount: 0 },
      negativeAssertions: { inactivePlatformCertificationClaim: false },
    },
    c04: {
      status: 'PASS_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF',
      pass: true,
      headShaAtReceiptGeneration: head,
      receiptSet: {
        pass: true,
        appAsarSha256: APP_ASAR_SHA,
        c01AppAsarSha256: APP_ASAR_SHA,
        c02PackageBound: true,
        c03PackageBound: true,
      },
      performanceEvidence: { pass: true, status: 'PASS' },
      securityEvidence: {
        genericSast: { status: 'PASS', exitCode: 0, findings: 0, timeouts: 0, nonTimeoutErrors: 0 },
        packageOfflineSecurity: { atsPolicyPass: true, runtimeNetworkActivated: false },
      },
      inactivePlatformScope: {
        macosPackagedElectron: 'CERTIFIED_BY_E11_C01_C02_C03_C04',
        windows: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        linux: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        web: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        ios: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
        android: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      },
      limitations: { liveProductionDistributionClaim: false },
    },
    activePlatform: {
      status: 'PASS_READY_FOR_EFINAL_REVALIDATION',
      pass: true,
      activePlatformScope: { macosPackagedElectron: 'CERTIFIED_FOR_LOCAL_UNSIGNED_PACKAGED_PROOF' },
    },
  };
}

function evaluate(module, overrides = {}) {
  return module.evaluateReleaseSecurityPhysical({
    expectedHeadSha: EXPECTED_HEAD,
    packageJson: overrides.packageJson || packageFixture(),
    programDag: programDagFixture(),
    scientificContracts: scientificContractsFixture(),
    receipts: overrides.receipts || receiptsFixture(),
    externalClaims: overrides.externalClaims,
  });
}

async function killOracle(module) {
  const normal = evaluate(module);
  assert.equal(normal.ok, true, normal.ok ? '' : JSON.stringify(normal.error.value.errors));
  assert.equal(normal.value.profileVerdictCandidate, 'NOT_READY');
  assert.equal(normal.value.authority.releaseReadyClaim, false);
  assert.equal(normal.value.authority.signingPassClaim, false);
  assert.equal(normal.value.authority.notarizationPassClaim, false);
  assert.equal(normal.value.authority.fusePassClaim, false);
  assert.equal(normal.value.blockers.includes('PHYSICAL_RECEIPTS_NOT_CURRENT_HEAD'), true);

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

  const packageDrift = packageFixture();
  delete packageDrift.build.afterPack;
  const afterPackDrift = evaluate(module, { packageJson: packageDrift });
  assert.equal(afterPackDrift.ok, false);
  assert.equal(afterPackDrift.error.value.errors.includes('PK1_AFTER_PACK_HARDENING_HOOK_MISSING'), true);
}

function materializeMutant(source, mutant) {
  const occurrences = source.split(mutant.find).length - 1;
  assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-pk1-mutant-')));
  const modulePath = path.join(dir, 'release-security-physical-pk1.mjs');
  fs.writeFileSync(modulePath, source.replace(mutant.find, mutant.replace));
  return { dir, modulePath };
}

test('PK1 release security mutants are executed and killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  await killOracle(await importModule(MODULE_PATH));

  const results = [];
  for (const mutant of MUTANTS) {
    const { dir, modulePath } = materializeMutant(source, mutant);
    let killed = false;
    let detail = '';
    try {
      await killOracle(await importModule(modulePath));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((result) => !result.killed);
  console.log(`R24_PK1_MUTATION_RECEIPT=${JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
    score: results.length ? (results.length - survived.length) / results.length : 0,
  })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
