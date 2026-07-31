#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_E11_ACTIVE_PLATFORM_CERTIFICATION_REVALIDATION');
const RESULT_PREFIX = 'YALKEN_ATLAS_E11_ACTIVE_PLATFORM_CERTIFICATION_REVALIDATION_RESULT:';

export const E11_RECEIPTS = Object.freeze({
  c01: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RECEIPT.json',
  c02: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C02_PACKAGED_CRITICAL_JOURNEY_RECEIPT.json',
  c03: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION_RECEIPT.json',
  c04: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C04_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF_RECEIPT.json',
});

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function readJson(relativePath, root = repoRoot) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8'));
}

function fileProof(relativePath, root = repoRoot) {
  const absolutePath = path.resolve(root, relativePath);
  if (!fs.existsSync(absolutePath)) return { path: relativePath, exists: false, bytes: 0, sha256: '' };
  const stat = fs.statSync(absolutePath);
  return {
    path: relativePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(absolutePath) : '',
  };
}

function runGit(args, root = repoRoot) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function gitIdentity(root = repoRoot) {
  const head = runGit(['rev-parse', 'HEAD'], root);
  const originMain = runGit(['rev-parse', 'origin/main'], root);
  const branch = runGit(['branch', '--show-current'], root);
  const originMainAncestorOfHead = head.ok && originMain.ok
    ? runGit(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], root).ok
    : false;
  return {
    branch: branch.stdout,
    headSha: head.stdout,
    originMainSha: originMain.stdout,
    headEqualsOriginMain: head.ok && originMain.ok && head.stdout === originMain.stdout,
    originMainAncestorOfHead,
  };
}

function loadReceipts(root = repoRoot) {
  return Object.fromEntries(Object.entries(E11_RECEIPTS).map(([key, relativePath]) => {
    const proof = fileProof(relativePath, root);
    const doc = proof.exists ? readJson(relativePath, root) : null;
    return [key, { key, path: relativePath, proof, doc }];
  }));
}

function statusReady(key, doc) {
  const expected = {
    c01: 'PASS_UNSIGNED_LOCAL_ARTIFACT',
    c02: 'PASS_PACKAGE_BOUND_RUNTIME_JOURNEY',
    c03: 'PASS_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION',
    c04: 'PASS_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF',
  };
  return doc?.pass === true && doc?.status === expected[key];
}

function inactivePlatformsSafe(scope = {}) {
  return ['windows', 'linux', 'web', 'ios', 'android'].every((platform) => {
    const value = scope?.[platform];
    return value === 'NOT_ACTIVATED_NO_PASS_NO_HOLD'
      || (value?.status === 'NOT_ACTIVATED_BY_OWNER' && value?.certificationClaim === 'NOT_CLAIMED' && value?.stage11Hold === false);
  });
}

export function evaluateE11ActivePlatformCertificationRevalidation(input = {}) {
  const root = input.repoRoot ? path.resolve(input.repoRoot) : repoRoot;
  const git = input.gitIdentity || gitIdentity(root);
  const receipts = input.receipts || loadReceipts(root);
  const c01 = receipts.c01?.doc;
  const c02 = receipts.c02?.doc;
  const c03 = receipts.c03?.doc;
  const c04 = receipts.c04?.doc;
  const c01Asar = c01?.physicalArtifactEvidence?.artifactSet?.appAsar?.sha256 || '';
  const readinessRows = Object.entries(receipts).map(([key, entry]) => ({
    key,
    path: entry.path,
    sha256: entry.proof.sha256,
    status: entry.doc?.status || '',
    pass: statusReady(key, entry.doc),
    headShaAtReceiptGeneration: entry.doc?.headShaAtReceiptGeneration || entry.doc?.baseSha || '',
  }));
  const facts = {
    c01LocalUnsignedPhysicalPackage: statusReady('c01', c01)
      && c01?.negativeAssertions?.physicalPackageProof === true
      && c01?.negativeAssertions?.appleSigningPassClaim === false
      && c01?.negativeAssertions?.appleNotarizationPassClaim === false,
    c02PackageBoundCriticalJourney: statusReady('c02', c02)
      && c02?.packageBinding?.packageBound === true
      && c02?.packageBinding?.appAsarSha256 === c01Asar
      && c02?.runtimeJourney?.firstLaunch?.commandKernelRoute === true
      && c02?.runtimeJourney?.secondLaunch?.freshProcessReopenOk === true
      && c02?.runtimeJourney?.firstLaunch?.networkRequests === 0
      && c02?.runtimeJourney?.secondLaunch?.networkRequests === 0,
    c03PackageBoundResponsiveVisual: statusReady('c03', c03)
      && c03?.packageBinding?.packageBound === true
      && c03?.packageBinding?.appAsarSha256 === c01Asar
      && c03?.accessibilityResponsiveEvidence?.assertions?.supportedWidthMatrix === true
      && c03?.visualRegressionEvidence?.comparisons?.every((row) => row.pass === true) === true,
    c04PerformanceSecurityHandoff: statusReady('c04', c04)
      && c04?.receiptSet?.pass === true
      && c04?.receiptSet?.appAsarSha256 === c01Asar
      && c04?.performanceEvidence?.pass === true
      && c04?.securityEvidence?.genericSast?.findings === 0
      && c04?.securityEvidence?.genericSast?.timeouts === 0
      && c04?.securityEvidence?.genericSast?.nonTimeoutErrors === 0,
    inactivePlatformScopeHonest: inactivePlatformsSafe(c04?.inactivePlatformScope),
    programDoDNotClaimed: c04?.negativeAssertions?.finalProgramDoDClaim === false
      && c04?.handoffBinding?.programDoneClaim === 'NOT_MADE',
  };
  const allReceiptsReady = readinessRows.every((row) => row.pass);
  const allFactsReady = Object.values(facts).every(Boolean);
  const remoteIdentityReady = git.headEqualsOriginMain === true || git.originMainAncestorOfHead === true;
  const pass = allReceiptsReady && allFactsReady && remoteIdentityReady;
  return {
    schemaVersion: 'yalken.atlas.v5.e11.activePlatformCertificationRevalidation.v1',
    taskId: 'YALKEN_ATLAS_V5_POST_FINAL_PRODUCT_OUTCOME_REPAIR_001_E11_REVALIDATION',
    contourId: 'E11_ACTIVE_PLATFORM_CERTIFICATION_REVALIDATION',
    programStage: 'E11_ACTIVE_PLATFORM_CERTIFICATION',
    generatedAtUtc: new Date().toISOString(),
    status: pass ? 'PASS_READY_FOR_EFINAL_REVALIDATION' : 'NOT_READY_E11_REVALIDATION_GAP',
    pass,
    activePlatformScope: {
      macosPackagedElectron: pass ? 'CERTIFIED_FOR_LOCAL_UNSIGNED_PACKAGED_PROOF' : 'NOT_READY',
      windows: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      linux: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      web: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      ios: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      android: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
    },
    git,
    e11ReceiptReadiness: readinessRows,
    certifiedFacts: facts,
    limitations: {
      localUnsignedArtifact: true,
      localUnnotarizedArtifact: true,
      liveProductionDistributionClaim: false,
      physicalWindowsLinuxWebMobileProof: false,
    },
    negativeAssertions: {
      ciParityCanSubstitutePackagedProof: false,
      inactivePlatformCanCreateHoldOrPass: false,
      staleReceiptCanCertifyCurrentProgramDone: false,
      programDoneClaim: false,
    },
    certifiedStageOutcomes: pass ? ['E11_STAGE_11_ACTIVE_MACOS_PACKAGED_ELECTRON_CERTIFIED'] : [],
    unsatisfiedStageOutcomes: ['EFINAL_PROGRAM_DOD_REVALIDATION'],
    nextContour: 'EFINAL_FINAL_AUDIT_AND_PROGRAM_DOD_REVALIDATION',
  };
}

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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = evaluateE11ActivePlatformCertificationRevalidation({ repoRoot });
  fs.mkdirSync(args.outDir, { recursive: true });
  const reportPath = path.join(args.outDir, 'e11-active-platform-certification-revalidation-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  const output = {
    status: result.status,
    pass: result.pass,
    reportPath,
    reportSha256: sha256File(reportPath),
  };
  if (args.json) console.log(JSON.stringify(output, null, 2));
  else console.log(`${RESULT_PREFIX}${JSON.stringify(output)}`);
  process.exit(result.pass ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
