const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const RECEIPT_PATH = path.join(
  ROOT,
  'docs',
  'OPS',
  'STATUS',
  'YALKEN_ATLAS_V5_E11_C00_ACTIVE_PLATFORM_CERTIFICATION_COMPILATION_RECEIPT.json',
);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function receipt() {
  return JSON.parse(fs.readFileSync(RECEIPT_PATH, 'utf8'));
}

test('E11 C00: compilation receipt binds Stage 11 to active macOS packaged Electron only', () => {
  const row = receipt();

  assert.equal(row.schemaVersion, 1);
  assert.equal(row.contourId, 'E11_C00_ACTIVE_PLATFORM_CERTIFICATION_COMPILATION');
  assert.equal(row.programStage, 'E11_ACTIVE_PLATFORM_CERTIFICATION');
  assert.equal(row.baseSha, '18deb5cdf96dced5f4a1dd603afb8baf4a9b8d90');
  assert.equal(row.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(row.activePlatformScope.platformId, 'macos-packaged-electron');
  assert.equal(row.activePlatformScope.packageCommand, 'npm run build:mac');
  assert.equal(row.activePlatformScope.physicalPackagedProofRequired, true);
  assert.equal(row.activePlatformScope.ciParityIsNotPhysicalPackageProof, true);

  const inactive = new Map(row.inactivePlatformScope.map((item) => [item.platformId, item]));
  for (const platformId of ['windows-packaged-electron', 'linux-packaged-electron', 'web', 'ios', 'android']) {
    assert.equal(inactive.get(platformId).stage11Hold, false);
    assert.equal(inactive.get(platformId).certificationClaim, 'NOT_CLAIMED');
  }
});

test('E11 C00: ER C07 handoff is accepted without converting it into final Program DoD', () => {
  const row = receipt();
  const erC07 = readJson('docs/OPS/STATUS/YALKEN_ATLAS_V5_ER_C07_STAGE_REVALIDATION_HANDOFF_RECEIPT.json');

  assert.equal(erC07.contourId, 'ER_C07_STAGE_REVALIDATION_AND_HANDOFF');
  assert.equal(erC07.stage11Started, false);
  assert.equal(row.runtimeFacts.erC07ReceiptExists, true);
  assert.equal(row.runtimeFacts.erC07FinalProgramDoDClaim, false);
  assert.deepEqual(row.runtimeFacts.erC07CertifiedStageOutcomes, [
    'E01_STAGE_01_EXACT_ATLAS_USER_OUTCOME',
    'E02_STAGE_02_MANUAL_MAP_GRAPH_WORKBENCH_USER_OUTCOME',
    'E03_STAGE_03_PLOT_IDEA_MEANING_USER_OUTCOME',
    'E05_STAGE_05_FULL_ATLAS_READ_SURFACES_USER_OUTCOME',
  ]);
  assert.equal(row.handoffBinding.previousContour, 'ER_C07_STAGE_REVALIDATION_AND_HANDOFF');
  assert.equal(row.handoffBinding.finalProgramDoDClaim, false);
});

test('E11 C00: compiled queue covers package artifact, critical journey, quality gates, and handoff', () => {
  const row = receipt();

  assert.deepEqual(row.compiledQueue.map((item) => item.contourId), [
    'E11_C01_MACOS_PACKAGE_ARTIFACT_ENTRYPOINT_AND_OFFLINE_SECURITY',
    'E11_C02_PACKAGED_CRITICAL_JOURNEY_CREATE_SAVE_REOPEN_RECOVERY_EXPORT_IMPORT',
    'E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_PERFORMANCE_SECURITY_VISUAL',
    'E11_C04_STAGE_11_ACCEPTANCE_AND_EFINAL_HANDOFF',
  ]);
  for (const item of row.compiledQueue) {
    assert.ok(item.userOutcome);
    assert.ok(Array.isArray(item.scopeIn) && item.scopeIn.length > 0);
    assert.ok(Array.isArray(item.scopeOut));
    assert.ok(Array.isArray(item.expectedWriteSet) && item.expectedWriteSet.length > 0);
    assert.ok(Array.isArray(item.designRoute) && item.designRoute.length > 0);
    assert.ok(!item.contourId.includes('EFINAL_FINAL_AUDIT'));
  }

  const allScope = row.compiledQueue.flatMap((item) => [...item.scopeIn, ...item.scopeOut, ...item.designRoute]);
  for (const phrase of [
    'app.asar renderer entrypoint proof',
    'afterPack ATS deny policy proof',
    'packaged project create/save/reopen journey',
    'recovery snapshot and recovery pack proof',
    'performance baseline and Atlas/Manual Map workload',
    'generic SAST gap resolution or explicit NOT_READY classification',
    'inactive platform non-hold matrix',
    'handoff to EFINAL',
  ]) {
    assert.ok(allScope.some((item) => item.includes(phrase)), phrase);
  }
});

test('E11 C00: factual runtime probes find existing package and platform certification seams', () => {
  const pkg = readJson('package.json');
  const row = receipt();

  assert.equal(pkg.scripts['build:mac'], 'electron-builder --mac');
  assert.equal(pkg.scripts['build:renderer'], 'node scripts/build-renderer.mjs');
  assert.equal(pkg.build.afterPack, 'scripts/after-pack.cjs');
  assert.equal(pkg.build.mac.extendInfo.NSAppTransportSecurity.NSAllowsArbitraryLoads, false);
  assert.equal(pkg.build.mac.extendInfo.NSAppTransportSecurity.NSAllowsLocalNetworking, false);
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'after-pack.cjs')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'check-packaged-renderer-bundle.mjs')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'test', 'unit', 'macos-package-network-policy.test.js')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'test', 'contracts', 'macos-signing-readiness.contract.test.js')), true);
  assert.equal(row.runtimeFacts.packageJsonBuildMacScriptExists, true);
  assert.equal(row.runtimeFacts.electronBuilderConfigured, true);
  assert.equal(row.runtimeFacts.packagedRendererBundleCheckExists, true);
});

test('E11 C00: receipt cannot claim package, inactive-platform, SAST, release, or Program DoD false green', () => {
  const row = receipt();
  const source = readText('docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C00_ACTIVE_PLATFORM_CERTIFICATION_COMPILATION_RECEIPT.json');

  assert.equal(row.runtimeFacts.physicalPackagedAppBuilt, false);
  assert.equal(row.runtimeFacts.packagedJourneyExecuted, false);
  assert.equal(row.runtimeFacts.inactivePlatformsCertified, false);
  assert.equal(row.runtimeFacts.genericSastReady, false);
  assert.equal(row.runtimeFacts.genericSastFalsePass, false);
  assert.equal(row.runtimeFacts.programDoDClaim, false);
  assert.equal(row.nextContour, 'E11_C01_MACOS_PACKAGE_ARTIFACT_ENTRYPOINT_AND_OFFLINE_SECURITY');

  for (const forbidden of [
    /inactivePlatformsCertified["']?\s*:\s*true/u,
    /genericSastFalsePass["']?\s*:\s*true/u,
    /programDoDClaim["']?\s*:\s*true/u,
    /Windows physical package certification.*PASS/u,
    /Linux physical package certification.*PASS/u,
    /genericSastReady["']?\s*:\s*true/u,
    /releaseReadinessClaim["']?\s*:\s*true/u,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test('E11 C00: validation rows are not false green before local execution', () => {
  const row = receipt();
  for (const validation of row.validation) {
    const summary = String(validation.summary || '').toLowerCase();
    assert.ok(['PENDING', 'NOT_RUN', 'PASS'].includes(validation.result), validation.command);
    assert.ok(validation.result !== 'PASS' || !summary.includes('pending'), validation.command);
    assert.ok(validation.result !== 'PASS' || !summary.includes('not_run'), validation.command);
  }
});
