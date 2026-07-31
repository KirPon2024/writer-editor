const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

async function loadModule() {
  return import(pathToFileURL(path.join(
    ROOT,
    'scripts',
    'ops',
    'yalken-atlas-v5-e11-c01-macos-package-artifact-security.mjs',
  )).href);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function presentArtifact(name) {
  return {
    path: `/physical/${name}`,
    exists: true,
    bytes: 100,
    sha256: `sha-${name}`,
  };
}

test('E11 C01: evaluator certifies only physical local macOS package artifacts and packaged renderer entrypoint', async () => {
  const { evaluateMacosPackageArtifactSecurity } = await loadModule();
  const result = evaluateMacosPackageArtifactSecurity({
    buildResult: { command: 'npm run build:mac', status: 0, durationMs: 1 },
    bundleCheck: { status: 0, command: 'node scripts/check-packaged-renderer-bundle.mjs app.asar', stdout: 'APP_ASAR_BUNDLE_CHECK_PASS', stderr: '' },
    codesignVerify: { status: 1, stdout: '', stderr: 'code object is not signed at all' },
    infoPlist: {
      ok: true,
      value: {
        CFBundleIdentifier: 'com.kirpon.writereditor',
        CFBundleName: 'Yalken',
        LSMinimumSystemVersion: '12.0',
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: false,
          NSExceptionDomains: {
            localhost: {
              NSTemporaryExceptionAllowsInsecureHTTPLoads: false,
              NSTemporaryExceptionAllowsInsecureHTTPSLoads: false,
            },
            '127.0.0.1': {
              NSTemporaryExceptionAllowsInsecureHTTPLoads: false,
              NSTemporaryExceptionAllowsInsecureHTTPSLoads: false,
            },
          },
        },
      },
    },
    artifacts: {
      appDir: presentArtifact('Yalken.app'),
      appAsar: presentArtifact('app.asar'),
      infoPlist: presentArtifact('Info.plist'),
      executable: presentArtifact('Yalken'),
      zip: presentArtifact('Yalken.zip'),
      dmg: presentArtifact('Yalken.dmg'),
    },
  });

  assert.equal(result.platformId, 'macos-packaged-electron');
  assert.equal(result.pass, true);
  assert.equal(result.status, 'PASS_UNSIGNED_LOCAL_ARTIFACT');
  assert.equal(result.bundleEntrypoint.status, 'PASS');
  assert.equal(result.negativeAssertions.physicalPackageProof, true);
  assert.equal(result.atsPolicy.ok, true);
  assert.equal(result.signing.status, 'NOT_READY_NO_DEVELOPER_ID');
  assert.equal(result.signing.passClaim, false);
  assert.equal(result.notarization.passClaim, false);
});

test('E11 C01: missing app.asar or failed packaged entrypoint cannot pass from CI parity alone', async () => {
  const { evaluateMacosPackageArtifactSecurity } = await loadModule();
  const result = evaluateMacosPackageArtifactSecurity({
    buildResult: { command: 'npm run build:mac', status: 0, durationMs: 1 },
    bundleCheck: { status: 7, command: 'node scripts/check-packaged-renderer-bundle.mjs app.asar', stdout: '', stderr: 'APP_ASAR_READER_MISSING' },
    codesignVerify: { status: 1, stdout: '', stderr: '' },
    infoPlist: { ok: false, value: null },
    artifacts: {
      appDir: presentArtifact('Yalken.app'),
      appAsar: { path: '/physical/app.asar', exists: false, bytes: 0, sha256: '' },
      infoPlist: presentArtifact('Info.plist'),
      executable: presentArtifact('Yalken'),
      zip: presentArtifact('Yalken.zip'),
      dmg: presentArtifact('Yalken.dmg'),
    },
  });

  assert.equal(result.pass, false);
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.negativeAssertions.ciParityIsNotPhysicalPackageProof, true);
  assert.equal(result.bundleEntrypoint.status, 'FAIL');
});

test('E11 C01: package config has mac build command, afterPack ATS hardening, and packaged entrypoint checker', () => {
  const pkg = JSON.parse(read('package.json'));
  const checker = read('scripts/check-packaged-renderer-bundle.mjs');
  const afterPack = read('scripts/after-pack.cjs');

  assert.equal(pkg.scripts['build:mac'], 'electron-builder --mac');
  assert.equal(pkg.build.afterPack, 'scripts/after-pack.cjs');
  assert.equal(pkg.build.mac.extendInfo.NSAppTransportSecurity.NSAllowsArbitraryLoads, false);
  assert.equal(pkg.build.mac.extendInfo.NSAppTransportSecurity.NSAllowsLocalNetworking, false);
  assert.match(checker, /APP_ASAR_BUNDLE_CHECK_PASS/u);
  assert.match(checker, /BUNDLE_ENTRYPOINT_PROOF_MODE=packaged/u);
  assert.match(afterPack, /NSAllowsArbitraryLoads/u);
  assert.match(afterPack, /NSAllowsLocalNetworking/u);
});

test('E11 C01: committed build evidence uses sanitized transcript, not ignored raw local keychain log', () => {
  const source = read('scripts/ops/yalken-atlas-v5-e11-c01-macos-package-artifact-security.mjs');
  const receiptPath = path.join('docs', 'OPS', 'STATUS', 'YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RECEIPT.json');
  const receipt = fileExists(receiptPath) ? JSON.parse(read(receiptPath)) : {};
  const transcriptPath = path.join('docs', 'OPS', 'EVIDENCE', 'YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY', 'build-mac-output.txt');
  const transcript = fileExists(transcriptPath) ? read(transcriptPath) : '';

  assert.match(source, /sanitizeBuildOutput/u);
  assert.match(source, /build-mac-output\.txt/u);
  assert.doesNotMatch(JSON.stringify(receipt), /build-mac\.log/u);
  assert.doesNotMatch(transcript, /allIdentities=/u);
  assert.doesNotMatch(transcript, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
  assert.doesNotMatch(transcript, /\b[A-F0-9]{40}\b/u);
});

test('E11 C01: script and receipt boundaries do not claim signing, notarization, inactive platforms, network, or final DoD', () => {
  const source = read('scripts/ops/yalken-atlas-v5-e11-c01-macos-package-artifact-security.mjs');
  const receiptPath = path.join('docs', 'OPS', 'STATUS', 'YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RECEIPT.json');
  const receipt = fileExists(receiptPath) ? read(receiptPath) : '';
  const combined = `${source}\n${receipt}`;

  assert.match(source, /NOT_READY_NO_DEVELOPER_ID/u);
  assert.match(source, /NOT_READY_NO_NOTARYTOOL_PROFILE/u);
  assert.match(source, /PASS_UNSIGNED_LOCAL_ARTIFACT/u);
  for (const forbidden of [
    /appleSigningPassClaim["']?\s*:\s*true/u,
    /appleNotarizationPassClaim["']?\s*:\s*true/u,
    /inactivePlatformCertificationClaim["']?\s*:\s*true/u,
    /runtimeNetworkActivated["']?\s*:\s*true/u,
    /finalProgramDoDClaim["']?\s*:\s*true/u,
    /SIGNED_AND_NOTARIZED_PASS/u,
    /windows.*certified.*true/iu,
    /linux.*certified.*true/iu,
    /web.*certified.*true/iu,
  ]) {
    assert.doesNotMatch(combined, forbidden);
  }
});
