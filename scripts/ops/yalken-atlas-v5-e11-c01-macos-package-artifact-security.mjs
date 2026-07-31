#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPORT_SCHEMA = 'yalken.atlas.v5.e11.c01.macosPackageArtifactSecurity.v1';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY');
const BUILD_OUTPUT_FILE = 'build-mac-output.txt';
const APP_DIR = path.resolve('dist/mac-arm64/Yalken.app');
const APP_ASAR = path.join(APP_DIR, 'Contents', 'Resources', 'app.asar');
const INFO_PLIST = path.join(APP_DIR, 'Contents', 'Info.plist');
const EXECUTABLE = path.join(APP_DIR, 'Contents', 'MacOS', 'Yalken');
const ZIP_PATH = path.resolve('dist/Yalken-1.0.2-arm64-mac.zip');
const DMG_PATH = path.resolve('dist/Yalken-1.0.2-arm64.dmg');

function parseArgs(argv) {
  const out = {
    outDir: DEFAULT_OUT_DIR,
    skipBuild: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && i + 1 < argv.length) {
      out.outDir = path.resolve(String(argv[i + 1] || '').trim());
      i += 1;
    } else if (arg === '--skip-build') {
      out.skipBuild = true;
    }
  }
  return out;
}

function run(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    ...options,
  });
  return {
    command: [command, ...args].join(' '),
    status: Number.isInteger(result.status) ? result.status : 1,
    signal: result.signal || '',
    durationMs: Date.now() - started,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sanitizeBuildOutput(value) {
  const raw = String(value || '');
  const signingSkipIndex = raw.indexOf('skipped macOS application code signing');
  const blockMapIndex = raw.indexOf('• building block map');
  const signingSummary = signingSkipIndex >= 0
    ? '  • skipped macOS application code signing  reason=Developer ID identity not available in local autonomous proof; local keychain identity details redacted\n'
    : '';
  const beforeSigning = signingSkipIndex >= 0 ? raw.slice(0, signingSkipIndex) : raw;
  const afterSigning = signingSkipIndex >= 0 && blockMapIndex > signingSkipIndex ? raw.slice(blockMapIndex) : '';
  return `${beforeSigning}${signingSummary}${afterSigning}`
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[redacted-email]')
    .replace(/\b[A-F0-9]{40}\b/gu, '[redacted-cert-hash]');
}

function fileProof(filePath) {
  const exists = fs.existsSync(filePath);
  if (!exists) {
    return {
      path: filePath,
      exists: false,
      bytes: 0,
      sha256: '',
    };
  }
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    exists: stat.isFile() || stat.isDirectory(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(filePath) : '',
  };
}

function parseInfoPlist() {
  const converted = run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', INFO_PLIST]);
  if (converted.status !== 0) {
    return {
      ok: false,
      failReason: 'INFO_PLIST_JSON_CONVERSION_FAILED',
      raw: converted,
      value: null,
    };
  }
  try {
    const parsed = JSON.parse(converted.stdout);
    return {
      ok: true,
      failReason: '',
      raw: converted,
      value: parsed,
    };
  } catch {
    return {
      ok: false,
      failReason: 'INFO_PLIST_JSON_PARSE_FAILED',
      raw: converted,
      value: null,
    };
  }
}

function evaluateAtsPolicy(infoPlistValue) {
  const ats = infoPlistValue?.NSAppTransportSecurity;
  const localhost = ats?.NSExceptionDomains?.localhost;
  const loopback = ats?.NSExceptionDomains?.['127.0.0.1'];
  const ok = Boolean(ats)
    && ats.NSAllowsArbitraryLoads === false
    && ats.NSAllowsLocalNetworking === false
    && localhost?.NSTemporaryExceptionAllowsInsecureHTTPLoads === false
    && localhost?.NSTemporaryExceptionAllowsInsecureHTTPSLoads === false
    && loopback?.NSTemporaryExceptionAllowsInsecureHTTPLoads === false
    && loopback?.NSTemporaryExceptionAllowsInsecureHTTPSLoads === false;
  return {
    ok,
    NSAllowsArbitraryLoads: ats?.NSAllowsArbitraryLoads,
    NSAllowsLocalNetworking: ats?.NSAllowsLocalNetworking,
    localhostHttp: localhost?.NSTemporaryExceptionAllowsInsecureHTTPLoads,
    localhostHttps: localhost?.NSTemporaryExceptionAllowsInsecureHTTPSLoads,
    loopbackHttp: loopback?.NSTemporaryExceptionAllowsInsecureHTTPLoads,
    loopbackHttps: loopback?.NSTemporaryExceptionAllowsInsecureHTTPSLoads,
  };
}

function classifySigning(codesignVerify) {
  if (codesignVerify.status === 0) {
    return {
      status: 'SIGNED_LOCAL_ARTIFACT',
      passClaim: false,
      reason: 'codesign verification succeeded locally; notarization still not claimed',
    };
  }
  return {
    status: 'NOT_READY_NO_DEVELOPER_ID',
    passClaim: false,
    reason: 'codesign verification did not pass for a Developer ID distribution artifact; local unsigned package is allowed only as reversible development proof',
  };
}

export function evaluateMacosPackageArtifactSecurity(input = {}) {
  const buildResult = input.buildResult || null;
  const bundleCheck = input.bundleCheck || { status: 1, stdout: '', stderr: '' };
  const infoPlist = input.infoPlist || parseInfoPlist();
  const codesignVerify = input.codesignVerify || run('/usr/bin/codesign', ['--verify', '--deep', '--strict', APP_DIR]);
  const artifacts = input.artifacts || {
    appDir: fileProof(APP_DIR),
    appAsar: fileProof(APP_ASAR),
    infoPlist: fileProof(INFO_PLIST),
    executable: fileProof(EXECUTABLE),
    zip: fileProof(ZIP_PATH),
    dmg: fileProof(DMG_PATH),
  };
  const atsPolicy = infoPlist.ok ? evaluateAtsPolicy(infoPlist.value) : { ok: false };
  const signing = classifySigning(codesignVerify);
  const notarization = {
    status: 'NOT_READY_NO_NOTARYTOOL_PROFILE',
    passClaim: false,
    reason: 'no paid Apple notarization credential or live notarization path is used in autonomous local proof',
  };
  const requiredArtifactsExist = artifacts.appDir.exists
    && artifacts.appAsar.exists
    && artifacts.infoPlist.exists
    && artifacts.executable.exists
    && artifacts.zip.exists
    && artifacts.dmg.exists;
  const bundleCheckPass = bundleCheck.status === 0
    && String(bundleCheck.stdout || '').includes('APP_ASAR_BUNDLE_CHECK_PASS');
  const buildPass = !buildResult || buildResult.status === 0;
  const pass = buildPass && requiredArtifactsExist && bundleCheckPass && atsPolicy.ok === true;

  return {
    schemaVersion: REPORT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    contourId: 'E11_C01_MACOS_PACKAGE_ARTIFACT_ENTRYPOINT_AND_OFFLINE_SECURITY',
    platformId: 'macos-packaged-electron',
    status: pass ? 'PASS_UNSIGNED_LOCAL_ARTIFACT' : 'NOT_READY',
    pass,
    build: buildResult
      ? {
        command: buildResult.command,
        status: buildResult.status === 0 ? 'PASS' : 'FAIL',
        exitCode: buildResult.status,
        durationMs: buildResult.durationMs,
      }
      : {
        command: 'npm run build:mac',
        status: 'SKIPPED_EXISTING_ARTIFACT',
        exitCode: 0,
        durationMs: 0,
      },
    artifacts,
    bundleEntrypoint: {
      command: bundleCheck.command || 'node scripts/check-packaged-renderer-bundle.mjs dist/mac-arm64/Yalken.app/Contents/Resources/app.asar',
      status: bundleCheckPass ? 'PASS' : 'FAIL',
      stdoutTail: String(bundleCheck.stdout || '').slice(-1000),
      stderrTail: String(bundleCheck.stderr || '').slice(-1000),
    },
    infoPlist: {
      status: infoPlist.ok ? 'PASS' : 'FAIL',
      bundleIdentifier: infoPlist.value?.CFBundleIdentifier || '',
      bundleName: infoPlist.value?.CFBundleName || '',
      minimumSystemVersion: infoPlist.value?.LSMinimumSystemVersion || '',
      sha256: artifacts.infoPlist.sha256,
    },
    atsPolicy,
    signing,
    notarization,
    negativeAssertions: {
      physicalPackageProof: requiredArtifactsExist,
      ciParityIsNotPhysicalPackageProof: true,
      runtimeNetworkActivated: false,
      appleSigningPassClaim: false,
      appleNotarizationPassClaim: false,
      inactivePlatformCertificationClaim: false,
      finalProgramDoDClaim: false,
    },
  };
}

export function runMacosPackageArtifactSecurity(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const buildResult = options.skipBuild ? null : run('npm', ['run', 'build:mac']);
  if (buildResult) {
    fs.writeFileSync(path.join(outDir, BUILD_OUTPUT_FILE), sanitizeBuildOutput(`${buildResult.stdout}${buildResult.stderr}`), 'utf8');
  }
  const bundleCheck = run('node', ['scripts/check-packaged-renderer-bundle.mjs', APP_ASAR]);
  const report = evaluateMacosPackageArtifactSecurity({ buildResult, bundleCheck });
  const reportPath = path.join(outDir, 'macos-package-artifact-security-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return {
    ...report,
    reportPath,
    reportSha256: sha256File(reportPath),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runMacosPackageArtifactSecurity(args);
  console.log(`YALKEN_ATLAS_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RESULT:${JSON.stringify(result)}`);
  process.exit(result.pass ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
