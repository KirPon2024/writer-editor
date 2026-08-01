#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runR3C05 } from './yalken-atlas-v5-r3-c05-release-saturation-revalidation.mjs';
import { evaluateFinalAudit } from './yalken-atlas-v5-efinal-final-audit-program-dod.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT_DIR = path.join(
  REPO_ROOT,
  'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_NIGHT01_C01_INDEPENDENT_FINAL_RERUN',
);
const DEFAULT_RECEIPT = path.join(
  REPO_ROOT,
  'docs/OPS/STATUS/YALKEN_ATLAS_V5_NIGHT01_C01_INDEPENDENT_FINAL_RERUN_RECEIPT.json',
);

const PRODUCT_RUNTIME_PREFIXES = Object.freeze([
  'src/',
  'package.json',
  'package-lock.json',
  'electron-builder',
  'build/',
  'assets/',
]);

function parseArgs(argv) {
  const options = {
    outDir: DEFAULT_OUT_DIR,
    receiptPath: DEFAULT_RECEIPT,
    skipPhysical: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && argv[index + 1]) {
      options.outDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--receipt' && argv[index + 1]) {
      options.receiptPath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--skip-physical') {
      options.skipPhysical = true;
    }
  }
  return options;
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fsSync.readFileSync(filePath));
}

function fileProof(filePath) {
  if (!filePath || !fsSync.existsSync(filePath)) {
    return { path: path.relative(REPO_ROOT, filePath || ''), exists: false, bytes: 0, sha256: '' };
  }
  const stat = fsSync.statSync(filePath);
  return {
    path: path.relative(REPO_ROOT, filePath),
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(filePath) : '',
  };
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function gitLines(args) {
  const value = git(args);
  return value ? value.split(/\r?\n/u).filter(Boolean) : [];
}

function isProductRuntimePath(filePath) {
  return PRODUCT_RUNTIME_PREFIXES.some((prefix) => filePath === prefix || filePath.startsWith(prefix));
}

export function gitIdentity() {
  const dirtyFiles = gitLines(['status', '--short']).map((line) => line.slice(3));
  const runtimeDirtyFiles = dirtyFiles.filter(isProductRuntimePath);
  const headSha = git(['rev-parse', 'HEAD']);
  const originMainSha = git(['rev-parse', 'origin/main']);
  return {
    branch: git(['branch', '--show-current']),
    headSha,
    originMainSha,
    headEqualsOriginMain: headSha === originMainSha,
    dirtyFiles,
    runtimeDirtyFiles,
    runtimeCleanForIndependentRerun: runtimeDirtyFiles.length === 0,
  };
}

function summarizeLegacyFinalAudit(finalAudit) {
  return {
    schemaVersion: finalAudit?.schemaVersion || '',
    status: finalAudit?.status || '',
    pass: finalAudit?.pass === true,
    advisoryOnly: true,
    acceptedAsProgramDoneToken: false,
    reason: 'Night01 requires executable physical rerun rows; legacy receipt aggregation is not sufficient.',
  };
}

function summarizeR3Result(r3Result) {
  const p0Rows = Array.isArray(r3Result?.p0Rows) ? r3Result.p0Rows : [];
  const openP0 = Array.isArray(r3Result?.openP0) ? r3Result.openP0 : [];
  return {
    status: r3Result?.status || 'NOT_RUN',
    pass: r3Result?.pass === true,
    reportPath: r3Result?.reportPath ? path.relative(REPO_ROOT, r3Result.reportPath) : '',
    reportSha256: r3Result?.reportSha256 || '',
    receiptPath: r3Result?.receiptPath ? path.relative(REPO_ROOT, r3Result.receiptPath) : '',
    receiptSha256: r3Result?.receiptSha256 || '',
    p0Rows: p0Rows.map((row) => ({ id: row.id, status: row.status })),
    openP0: openP0.map((row) => row.id || row),
  };
}

export function buildNight01C01Report({ identity, r3Result, finalAudit }) {
  const r3 = summarizeR3Result(r3Result);
  const checks = {
    exactRemoteHead: identity.headEqualsOriginMain === true,
    productRuntimeClean: identity.runtimeCleanForIndependentRerun === true,
    executablePhysicalRowsPass: r3.pass === true,
    noOpenNight01P0: r3.openP0.length === 0,
    staleEfinalAggregationRejected: true,
    programDoneNotClaimedByThisContour: true,
  };
  const openFindings = Object.entries(checks)
    .filter(([, ok]) => ok !== true)
    .map(([id]) => id);
  const pass = openFindings.length === 0;
  return {
    schemaVersion: 'yalken.atlas.v5.night01.c01.independentFinalRerun.v1',
    taskId: 'YALKEN_ATLAS_V5_RELEASE_AUDIT_NIGHT_01_INDEPENDENT_FINAL_RERUN',
    contourId: 'NIGHT_01_C01_INDEPENDENT_FINAL_RERUN_ON_EXACT_REMOTE_HEAD',
    generatedAtUtc: new Date().toISOString(),
    status: pass
      ? 'PASS_NIGHT01_C01_INDEPENDENT_FINAL_RERUN_NO_OPEN_P0'
      : 'NOT_READY_NIGHT01_C01_INDEPENDENT_FINAL_RERUN_OPEN_FINDINGS',
    pass,
    independentAuditNoOpenP0: pass,
    programDoneClaim: false,
    identity,
    checks,
    openFindings,
    executableRerun: r3,
    legacyFinalAudit: summarizeLegacyFinalAudit(finalAudit),
    releaseTruth: {
      finalAcceptanceRequiresExactMergedRemoteHead: true,
      packagedJourneysRequiredOverReceipts: true,
      noGeneratedScreenshotOnlyProof: true,
      nextGate: pass
        ? 'DELIVER_C01_AND_REMOTE_VERIFY_BEFORE_FINAL_DISPOSITION'
        : 'REPAIR_OPEN_FINDINGS_BEFORE_DELIVERY',
    },
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function runNight01C01(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  const receiptPath = path.resolve(options.receiptPath || DEFAULT_RECEIPT);
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.dirname(receiptPath), { recursive: true });

  const identity = gitIdentity();
  const physicalOutDir = path.join(outDir, 'physical-r3-c05-rerun');
  const physicalReceiptPath = path.join(outDir, 'physical-r3-c05-rerun-receipt.json');
  const r3Result = await runR3C05({
    outDir: physicalOutDir,
    receiptPath: physicalReceiptPath,
    skipPhysical: options.skipPhysical === true,
  }).catch((error) => ({
    status: 'ERROR_R3_C05_RERUN_FAILED',
    pass: false,
    error: error && error.stack ? error.stack : String(error),
    p0Rows: [],
    openP0: [{ id: 'R3_C05_RERUN_THROWN' }],
  }));
  const finalAudit = evaluateFinalAudit({ repoRoot: REPO_ROOT });
  const report = buildNight01C01Report({ identity, r3Result, finalAudit });
  const reportPath = path.join(outDir, 'night01-c01-independent-final-rerun-report.json');
  await writeJson(reportPath, report);

  const receipt = {
    schemaVersion: 'yalken.atlas.v5.night01.c01.independentFinalRerun.receipt.v1',
    taskId: report.taskId,
    contourId: report.contourId,
    generatedAtUtc: report.generatedAtUtc,
    status: report.status,
    pass: report.pass,
    independentAuditNoOpenP0: report.independentAuditNoOpenP0,
    programDoneClaim: false,
    headSha: report.identity.headSha,
    originMainSha: report.identity.originMainSha,
    runtimeDirtyFiles: report.identity.runtimeDirtyFiles,
    report: fileProof(reportPath),
    executableRerun: report.executableRerun,
    legacyFinalAudit: report.legacyFinalAudit,
    delivery: {
      commitRequired: true,
      pushRequired: true,
      prRequired: true,
      mergeRequired: true,
      remoteHeadVerificationRequired: true,
    },
  };
  await writeJson(receiptPath, receipt);

  return {
    ...report,
    reportPath,
    reportSha256: sha256File(reportPath),
    receiptPath,
    receiptSha256: sha256File(receiptPath),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runNight01C01(parseArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify({
        status: result.status,
        pass: result.pass,
        independentAuditNoOpenP0: result.independentAuditNoOpenP0,
        headSha: result.identity.headSha,
        originMainSha: result.identity.originMainSha,
        runtimeDirtyFiles: result.identity.runtimeDirtyFiles,
        reportPath: result.reportPath,
        reportSha256: result.reportSha256,
        receiptPath: result.receiptPath,
        receiptSha256: result.receiptSha256,
        openFindings: result.openFindings,
      }, null, 2));
      process.exit(result.pass ? 0 : 1);
    })
    .catch((error) => {
      console.error(error && error.stack ? error.stack : String(error));
      process.exit(1);
    });
}
