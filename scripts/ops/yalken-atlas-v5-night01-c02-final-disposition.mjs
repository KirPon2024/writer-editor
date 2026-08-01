#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT_DIR = path.join(
  REPO_ROOT,
  'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_NIGHT01_C02_FINAL_DISPOSITION',
);
const DEFAULT_RECEIPT = path.join(
  REPO_ROOT,
  'docs/OPS/STATUS/YALKEN_ATLAS_V5_NIGHT01_C02_FINAL_DISPOSITION_RECEIPT.json',
);
const C01_REMOTE_RECEIPT = path.join(
  REPO_ROOT,
  'docs/OPS/STATUS/YALKEN_ATLAS_V5_NIGHT01_C01_REMOTE_MERGE_VERIFICATION_RECEIPT.json',
);
const FINAL_AUDIT_REPORT = path.join(
  REPO_ROOT,
  'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_EFINAL_FINAL_AUDIT_AND_PROGRAM_DOD/final-audit-program-dod-report.json',
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
  const options = { outDir: DEFAULT_OUT_DIR, receiptPath: DEFAULT_RECEIPT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && argv[index + 1]) {
      options.outDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--receipt' && argv[index + 1]) {
      options.receiptPath = path.resolve(argv[index + 1]);
      index += 1;
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

function readJson(filePath) {
  return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
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

function gitIdentity() {
  const headSha = git(['rev-parse', 'HEAD']);
  const originMainSha = git(['rev-parse', 'origin/main']);
  return {
    branch: git(['branch', '--show-current']),
    headSha,
    originMainSha,
    headEqualsOriginMain: headSha === originMainSha,
    dirtyFiles: gitLines(['status', '--short']).map((line) => line.slice(3)),
  };
}

function diffNames(fromSha, toSha) {
  if (!fromSha || !toSha) return [];
  return gitLines(['diff', '--name-only', `${fromSha}..${toSha}`]);
}

export function buildNight01C02Report({ identity, c01Receipt, finalAuditReport, runtimeDeltaFiles }) {
  const runtimeDelta = Array.isArray(runtimeDeltaFiles) ? runtimeDeltaFiles : [];
  const runtimeProductDelta = runtimeDelta.filter(isProductRuntimePath);
  const checks = {
    currentHeadIsOriginMain: identity.headEqualsOriginMain === true,
    finalAuditReportPassesOnCurrentHead: finalAuditReport?.pass === true
      && finalAuditReport?.finalProgramDoDClaim === true
      && finalAuditReport?.gitIdentity?.headSha === identity.headSha
      && finalAuditReport?.gitIdentity?.originMainSha === identity.originMainSha
      && Array.isArray(finalAuditReport?.failures)
      && finalAuditReport.failures.length === 0,
    c01RemoteVerifiedNoOpenP0: c01Receipt?.pass === true
      && c01Receipt?.independentAuditNoOpenP0 === true
      && c01Receipt?.releaseTruth?.noOpenNight01P0OnMergedRemoteHead === true,
    executableRerunSupersedesLegacyAggregation: c01Receipt?.releaseTruth?.legacyEfinalAggregationAcceptedAsProgramDone === false,
    noProductRuntimeDeltaSinceExactPhysicalRerun: runtimeProductDelta.length === 0,
    generatedScreenshotsNotAcceptedAlone: c01Receipt?.releaseTruth?.generatedScreenshotsAcceptedAlone === false,
  };
  const openFindings = Object.entries(checks)
    .filter(([, ok]) => ok !== true)
    .map(([id]) => id);
  const pass = openFindings.length === 0;
  return {
    schemaVersion: 'yalken.atlas.v5.night01.c02.finalDisposition.v1',
    taskId: 'YALKEN_ATLAS_V5_NIGHT01_C02_FINAL_DISPOSITION_AND_PROGRAM_DOD_RECONCILIATION',
    contourId: 'NIGHT_01_C02_FINAL_DISPOSITION_AND_PROGRAM_DOD_RECONCILIATION',
    generatedAtUtc: new Date().toISOString(),
    status: pass ? 'PASS_NIGHT01_C02_PROGRAM_DOD_READY_FOR_FINAL_REMOTE_VERIFICATION' : 'NOT_READY_NIGHT01_C02_OPEN_FINDINGS',
    pass,
    programDoneClaim: pass,
    programDoneClaimScope: 'READY_FOR_DELIVERY_PENDING_PR_MERGE_REMOTE_SHA_VERIFICATION_AND_CLEAN_WORKTREE',
    identity,
    checks,
    openFindings,
    runtimeDeltaSinceExactPhysicalRerun: {
      exactPhysicalRerunSha: c01Receipt?.postMergeChecks?.tempExactHeadIndependentRerun?.headSha || '',
      currentHeadSha: identity.headSha,
      changedFiles: runtimeDelta,
      productRuntimeChangedFiles: runtimeProductDelta,
    },
    evidence: {
      c01RemoteReceipt: {
        path: path.relative(REPO_ROOT, C01_REMOTE_RECEIPT),
        sha256: fsSync.existsSync(C01_REMOTE_RECEIPT) ? sha256File(C01_REMOTE_RECEIPT) : '',
        status: c01Receipt?.status || '',
      },
      finalAuditReport: {
        path: path.relative(REPO_ROOT, FINAL_AUDIT_REPORT),
        sha256: fsSync.existsSync(FINAL_AUDIT_REPORT) ? sha256File(FINAL_AUDIT_REPORT) : '',
        status: finalAuditReport?.status || '',
      },
    },
    finalDisposition: {
      blockingP0Open: openFindings.length > 0,
      advisoryOnlyItems: [
        'inactive-platforms-remain-not-activated-no-pass-no-hold',
        'future-language-case-folding-port-remains-not-activated',
      ],
      nextGate: pass ? 'DELIVER_C02_THEN_VERIFY_MERGED_REMOTE_HEAD_FOR_DONE' : 'REPAIR_OPEN_FINDINGS',
    },
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function runNight01C02(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  const receiptPath = path.resolve(options.receiptPath || DEFAULT_RECEIPT);
  const identity = gitIdentity();
  const c01Receipt = readJson(C01_REMOTE_RECEIPT);
  const finalAuditReport = readJson(FINAL_AUDIT_REPORT);
  const exactPhysicalRerunSha = c01Receipt?.postMergeChecks?.tempExactHeadIndependentRerun?.headSha || '';
  const runtimeDeltaFiles = diffNames(exactPhysicalRerunSha, identity.headSha);
  const report = buildNight01C02Report({
    identity,
    c01Receipt,
    finalAuditReport,
    runtimeDeltaFiles,
  });
  const reportPath = path.join(outDir, 'night01-c02-final-disposition-report.json');
  await writeJson(reportPath, report);
  const receipt = {
    schemaVersion: 'yalken.atlas.v5.night01.c02.finalDisposition.receipt.v1',
    taskId: report.taskId,
    contourId: report.contourId,
    generatedAtUtc: report.generatedAtUtc,
    status: report.status,
    pass: report.pass,
    programDoneClaim: report.programDoneClaim,
    programDoneClaimScope: report.programDoneClaimScope,
    headSha: identity.headSha,
    originMainSha: identity.originMainSha,
    openFindings: report.openFindings,
    checks: report.checks,
    report: {
      path: path.relative(REPO_ROOT, reportPath),
      sha256: sha256File(reportPath),
    },
    evidence: report.evidence,
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
  runNight01C02(parseArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify({
        status: result.status,
        pass: result.pass,
        programDoneClaim: result.programDoneClaim,
        headSha: result.identity.headSha,
        originMainSha: result.identity.originMainSha,
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
