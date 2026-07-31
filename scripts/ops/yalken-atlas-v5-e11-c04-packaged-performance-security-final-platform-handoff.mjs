#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const REPORT_SCHEMA = 'yalken.atlas.v5.e11.c04.packagedPerformanceSecurityFinalPlatformHandoff.v1';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_E11_C04_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF');
const C01_RECEIPT_PATH = path.resolve('docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RECEIPT.json');
const C02_RECEIPT_PATH = path.resolve('docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C02_PACKAGED_CRITICAL_JOURNEY_RECEIPT.json');
const C03_RECEIPT_PATH = path.resolve('docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION_RECEIPT.json');
const APP_ASAR = path.resolve('dist/mac-arm64/Yalken.app/Contents/Resources/app.asar');

function parseArgs(argv) {
  const out = { outDir: DEFAULT_OUT_DIR, skipRuntime: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && i + 1 < argv.length) {
      out.outDir = path.resolve(String(argv[i + 1] || '').trim());
      i += 1;
    } else if (arg === '--skip-runtime') {
      out.skipRuntime = true;
    }
  }
  return out;
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fsSync.readFileSync(filePath));
}

function fileProof(filePath) {
  if (!filePath || !fsSync.existsSync(filePath)) {
    return { path: filePath || '', exists: false, bytes: 0, sha256: '' };
  }
  const stat = fsSync.statSync(filePath);
  return {
    path: filePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(filePath) : '',
  };
}

function readJson(filePath) {
  return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
}

function parseSastOutput(stdout = '') {
  const lines = String(stdout || '').split(/\r?\n/u);
  const valueFor = (key) => {
    const line = lines.find((item) => item.startsWith(`${key}:`));
    return line ? line.slice(key.length + 1).trim() : '';
  };
  return {
    runner: valueFor('GENERIC_SAST_RUNNER'),
    config: valueFor('GENERIC_SAST_CONFIG'),
    findings: Number(valueFor('GENERIC_SAST_FINDINGS') || NaN),
    timeouts: Number(valueFor('GENERIC_SAST_TIMEOUTS') || NaN),
    nonTimeoutErrors: Number(valueFor('GENERIC_SAST_NON_TIMEOUT_ERRORS') || NaN),
    status: valueFor('GENERIC_SAST_STATUS'),
  };
}

function runCommand(command, args, options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeoutMs || 180_000,
  });
  return {
    command: [command, ...args].join(' '),
    exitCode: typeof result.status === 'number' ? result.status : null,
    signal: result.signal || '',
    timedOut: result.error?.code === 'ETIMEDOUT',
    durationMs: Date.now() - startedAt,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : '',
  };
}

function evaluateReceiptSet({ c01Receipt, c02Receipt, c03Receipt, appAsarProof }) {
  const c01AppAsarSha = c01Receipt?.physicalArtifactEvidence?.artifactSet?.appAsar?.sha256 || '';
  const c02PackageBound = c02Receipt?.packageBinding?.packageBound === true
    && c02Receipt?.packageBinding?.appAsarSha256 === c01AppAsarSha;
  const c03PackageBound = c03Receipt?.packageBinding?.packageBound === true
    && c03Receipt?.packageBinding?.appAsarSha256 === c01AppAsarSha;
  return {
    pass: c01Receipt?.pass === true
      && c02Receipt?.pass === true
      && c03Receipt?.pass === true
      && c01Receipt?.status === 'PASS_UNSIGNED_LOCAL_ARTIFACT'
      && c02Receipt?.status === 'PASS_PACKAGE_BOUND_RUNTIME_JOURNEY'
      && c03Receipt?.status === 'PASS_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION'
      && appAsarProof.exists === true
      && appAsarProof.sha256 === c01AppAsarSha
      && c02PackageBound
      && c03PackageBound,
    c01Status: c01Receipt?.status || '',
    c02Status: c02Receipt?.status || '',
    c03Status: c03Receipt?.status || '',
    appAsarSha256: appAsarProof.sha256,
    c01AppAsarSha256: c01AppAsarSha,
    c02PackageBound,
    c03PackageBound,
  };
}

function evaluatePerformance(perfReport = null) {
  const metrics = perfReport?.metrics || {};
  const budgets = perfReport?.budgets || {};
  const pass = perfReport?.status === 'PASS'
    && perfReport?.performanceProofKind === 'measured-worker-runtime-not-element-count'
    && perfReport?.corpus?.nodeCount === 10000
    && metrics.p95WallTimeMs <= budgets.p95WallTimeMs
    && metrics.p95InputLatencyMs <= budgets.p95InputLatencyMs
    && metrics.p95FrameDelayMs <= budgets.p95FrameDelayMs
    && metrics.maxHeapDeltaBytes <= budgets.maxHeapDeltaBytes
    && metrics.executionModes?.includes('worker-thread') === true
    && perfReport?.authority?.syncSchedulerLabeledWorker === false
    && perfReport?.authority?.projectTruthMutation === false
    && perfReport?.authority?.storageMutation === false
    && perfReport?.authority?.networkMutation === false
    && perfReport?.authority?.rendererMutation === false;
  return {
    pass,
    status: perfReport?.status || 'NOT_RUN',
    corpus: perfReport?.corpus || null,
    budgets,
    metrics,
    failures: perfReport?.failures || [],
    authority: perfReport?.authority || {},
  };
}

function evaluateSecurity({ sast = null, c01Receipt = null }) {
  const signing = c01Receipt?.signing || {};
  const notarization = c01Receipt?.notarization || {};
  const pass = sast?.exitCode === 0
    && sast?.parsed?.status === 'PASS'
    && sast?.parsed?.findings === 0
    && sast?.parsed?.timeouts === 0
    && sast?.parsed?.nonTimeoutErrors === 0
    && (c01Receipt?.atsPolicy?.pass === true || c01Receipt?.atsPolicy?.ok === true)
    && c01Receipt?.negativeAssertions?.runtimeNetworkActivated === false;
  return {
    pass,
    genericSast: {
      command: sast?.command || '',
      exitCode: sast?.exitCode ?? null,
      timedOut: sast?.timedOut === true,
      status: sast?.parsed?.status || 'NOT_RUN',
      findings: sast?.parsed?.findings ?? null,
      timeouts: sast?.parsed?.timeouts ?? null,
      nonTimeoutErrors: sast?.parsed?.nonTimeoutErrors ?? null,
      runner: sast?.parsed?.runner || '',
      config: sast?.parsed?.config || '',
    },
    packageOfflineSecurity: {
      atsPolicyPass: c01Receipt?.atsPolicy?.pass === true || c01Receipt?.atsPolicy?.ok === true,
      runtimeNetworkActivated: c01Receipt?.negativeAssertions?.runtimeNetworkActivated === true,
      signingStatus: signing.status || 'UNKNOWN',
      notarizationStatus: notarization.status || 'UNKNOWN',
      signingRequiredForLocalCertification: false,
      notarizationRequiredForLocalCertification: false,
    },
  };
}

export function evaluatePackagedPerformanceSecurityFinalPlatformHandoff(input = {}) {
  const c01Receipt = input.c01Receipt || (fsSync.existsSync(C01_RECEIPT_PATH) ? readJson(C01_RECEIPT_PATH) : null);
  const c02Receipt = input.c02Receipt || (fsSync.existsSync(C02_RECEIPT_PATH) ? readJson(C02_RECEIPT_PATH) : null);
  const c03Receipt = input.c03Receipt || (fsSync.existsSync(C03_RECEIPT_PATH) ? readJson(C03_RECEIPT_PATH) : null);
  const appAsarProof = input.appAsarProof || fileProof(APP_ASAR);
  const receiptSet = evaluateReceiptSet({ c01Receipt, c02Receipt, c03Receipt, appAsarProof });
  const performance = evaluatePerformance(input.perfReport || null);
  const security = evaluateSecurity({ sast: input.sast || null, c01Receipt });
  const pass = receiptSet.pass === true && performance.pass === true && security.pass === true;

  return {
    schemaVersion: REPORT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    contourId: 'E11_C04_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF',
    platformId: 'macos-packaged-electron',
    status: pass ? 'PASS_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF' : 'NOT_READY',
    pass,
    receiptSet,
    performance,
    security,
    inactivePlatformScope: {
      macosPackagedElectron: pass ? 'CERTIFIED_BY_E11_C01_C02_C03_C04' : 'NOT_READY',
      windows: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      linux: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      web: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      ios: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
      android: 'NOT_ACTIVATED_NO_PASS_NO_HOLD',
    },
    limitations: {
      localUnsignedArtifact: c01Receipt?.signing?.status === 'NOT_READY_NO_DEVELOPER_ID',
      localUnnotarizedArtifact: c01Receipt?.notarization?.status === 'NOT_READY_NO_NOTARYTOOL_PROFILE',
      liveProductionDistributionClaim: false,
      physicalWindowsLinuxWebMobileProof: false,
    },
    negativeAssertions: {
      ciParityCanSubstitutePackagedProof: false,
      genericSastTimeoutCanPass: false,
      genericSastParserErrorCanPass: false,
      elementCountCanSubstitutePerformanceProof: false,
      inactivePlatformCertificationClaim: false,
      finalProgramDoDClaim: false,
    },
    handoffBinding: {
      completedContour: 'E11_C04_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF',
      nextContour: 'EFINAL_FINAL_AUDIT_AND_PROGRAM_DOD',
      stage11CompletionClaim: pass ? 'READY_FOR_EFINAL_REVALIDATION' : 'NOT_MADE',
      programDoneClaim: 'NOT_MADE',
    },
  };
}

export async function runPackagedPerformanceSecurityFinalPlatformHandoff(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  let perfReport = null;
  let sast = null;
  if (!options.skipRuntime) {
    const perf = runCommand(process.execPath, [
      'scripts/ops/yalken-atlas-v5-er-c05-10k-worker-budget.mjs',
      '--json',
      '--iterations=3',
    ], { timeoutMs: 120_000 });
    await fs.writeFile(path.join(outDir, 'er-c05-10k-worker-budget.json'), perf.stdout, 'utf8');
    perfReport = perf.exitCode === 0 ? JSON.parse(perf.stdout) : null;

    const sastRun = runCommand('npm', ['run', '-s', 'security:audit:generic-sast'], { timeoutMs: 180_000 });
    await fs.writeFile(path.join(outDir, 'generic-sast-output.txt'), `${sastRun.stdout}${sastRun.stderr}`, 'utf8');
    sast = {
      ...sastRun,
      parsed: parseSastOutput(sastRun.stdout),
    };
  }
  const report = evaluatePackagedPerformanceSecurityFinalPlatformHandoff({ perfReport, sast });
  const reportPath = path.join(outDir, 'packaged-performance-security-final-platform-handoff-report.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return {
    ...report,
    reportPath,
    reportSha256: sha256File(reportPath),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runPackagedPerformanceSecurityFinalPlatformHandoff(args);
  console.log(`YALKEN_ATLAS_E11_C04_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF_RESULT:${JSON.stringify(result)}`);
  process.exit(result.pass ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
