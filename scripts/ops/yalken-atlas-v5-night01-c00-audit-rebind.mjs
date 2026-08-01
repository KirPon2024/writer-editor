#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildP0Rows,
  evaluateSourceInvariants,
} from './yalken-atlas-v5-r3-c05-release-saturation-revalidation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT_DIR = path.join(
  REPO_ROOT,
  'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_NIGHT01_C00_AUDIT_REBIND',
);
const DEFAULT_RECEIPT = path.join(
  REPO_ROOT,
  'docs/OPS/STATUS/YALKEN_ATLAS_V5_NIGHT01_C00_AUDIT_REBIND_RECEIPT.json',
);
const R3_C05_REMOTE_RECEIPT = path.join(
  REPO_ROOT,
  'docs/OPS/STATUS/YALKEN_ATLAS_V5_R3_C05_REMOTE_MERGE_VERIFICATION_RECEIPT.json',
);
const R3_C05_REPORT = path.join(
  REPO_ROOT,
  'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_R3_C05_RELEASE_SATURATION_REVALIDATION/r3-c05-release-saturation-revalidation-report.json',
);

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

function gitIdentity() {
  const headSha = git(['rev-parse', 'HEAD']);
  const originMainSha = git(['rev-parse', 'origin/main']);
  const branch = git(['branch', '--show-current']);
  const dirtyFiles = git(['status', '--short'])
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return {
    branch,
    headSha,
    originMainSha,
    headEqualsOriginMain: headSha === originMainSha,
    dirtyFiles,
  };
}

function isAncestor(ancestorSha, descendantSha) {
  if (typeof ancestorSha !== 'string' || !ancestorSha || typeof descendantSha !== 'string' || !descendantSha) {
    return false;
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestorSha, descendantSha], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function journeyFromReport(report, key) {
  const row = report?.journeys?.[key];
  return {
    status: typeof row?.status === 'string' ? row.status : 'MISSING',
    pass: row?.pass === true,
    reportPath: typeof row?.reportPath === 'string' ? row.reportPath : '',
    reportSha256: typeof row?.reportSha256 === 'string' ? row.reportSha256 : '',
  };
}

function buildAuditRows({ source, r3Report, remoteReceipt, identity }) {
  const p0Rows = buildP0Rows({
    c01: journeyFromReport(r3Report, 'c01'),
    c02: journeyFromReport(r3Report, 'c02'),
    c03: journeyFromReport(r3Report, 'c03'),
    c04: journeyFromReport(r3Report, 'c04'),
    source,
  });
  const remoteVerifiedSha = remoteReceipt?.delivery?.verifiedOriginMainSha || '';
  const remoteReceiptOk = remoteReceipt?.status === 'PASS_R3_C05_REMOTE_MERGE_VERIFIED'
    && remoteReceipt?.pass === true
    && remoteReceipt?.delivery?.mergeCommitSha === remoteVerifiedSha
    && isAncestor(remoteVerifiedSha, identity.originMainSha)
    && remoteReceipt?.releaseTruth?.programDoneClaim === false;
  return p0Rows.map((row) => ({
    ...row,
    reboundToSha: identity.originMainSha,
    remoteReceiptRequired: true,
    remoteReceiptOk,
    finalStatus: row.status === 'OPEN' || !remoteReceiptOk ? 'OPEN' : 'REBOUND_CLOSED',
  }));
}

export function evaluateNight01C00() {
  const identity = gitIdentity();
  const source = evaluateSourceInvariants();
  const r3Report = readJson(R3_C05_REPORT);
  const remoteReceipt = readJson(R3_C05_REMOTE_RECEIPT);
  const rows = buildAuditRows({ source, r3Report, remoteReceipt, identity });
  const openRows = rows.filter((row) => row.finalStatus === 'OPEN');
  const remoteVerifiedSha = remoteReceipt.delivery?.verifiedOriginMainSha || '';
  const pass = identity.headEqualsOriginMain
    && openRows.length === 0
    && remoteReceipt.status === 'PASS_R3_C05_REMOTE_MERGE_VERIFIED'
    && isAncestor(remoteVerifiedSha, identity.originMainSha);
  return {
    schemaVersion: 'yalken.atlas.v5.night01.c00.auditRebind.v1',
    taskId: 'YALKEN_ATLAS_V5_RELEASE_AUDIT_NIGHT_01_REBIND',
    status: pass ? 'PASS_NIGHT01_C00_P0_REBOUND_TO_REMOTE_MAIN' : 'NOT_READY_NIGHT01_C00_OPEN_P0_OR_REMOTE_BINDING_GAP',
    pass,
    generatedAtUtc: new Date().toISOString(),
    identity,
    sourceChecks: source.checks,
    remoteReceipt: {
      path: path.relative(REPO_ROOT, R3_C05_REMOTE_RECEIPT),
      sha256: sha256File(R3_C05_REMOTE_RECEIPT),
      status: remoteReceipt.status,
      mergeCommitSha: remoteReceipt.delivery?.mergeCommitSha || '',
      verifiedOriginMainSha: remoteReceipt.delivery?.verifiedOriginMainSha || '',
      programDoneClaim: remoteReceipt.releaseTruth?.programDoneClaim === true,
    },
    r3C05Report: {
      path: path.relative(REPO_ROOT, R3_C05_REPORT),
      sha256: sha256File(R3_C05_REPORT),
      status: r3Report.status,
      openP0: Array.isArray(r3Report.openP0) ? r3Report.openP0 : [],
    },
    rows,
    openRows,
    releaseTruth: {
      notProgramDone: true,
      dirtyFilesRecordedForPreDeliveryReceipt: identity.dirtyFiles,
      nextRequiredGate: 'NIGHT01_INDEPENDENT_FINAL_RERUN_ON_EXACT_REMOTE_HEAD',
      advisoryRisksToInspect: [
        'case-folding-language-analyzer-port-not-activated',
        'large-graph-50k-packaged-physical-matrix-not-yet-independent-rerun',
        'full-EFINAL-Program-DoD must execute packaged rows again on final remote head',
      ],
    },
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function runNight01C00(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  const receiptPath = path.resolve(options.receiptPath || DEFAULT_RECEIPT);
  const result = evaluateNight01C00();
  const reportPath = path.join(outDir, 'night01-c00-audit-rebind-report.json');
  await writeJson(reportPath, result);
  const receipt = {
    schemaVersion: 'yalken.atlas.v5.night01.c00.auditRebindReceipt.v1',
    taskId: result.taskId,
    status: result.status,
    pass: result.pass,
    generatedAtUtc: result.generatedAtUtc,
    headSha: result.identity.headSha,
    originMainSha: result.identity.originMainSha,
    reportPath: path.relative(REPO_ROOT, reportPath),
    reportSha256: sha256File(reportPath),
    openRows: result.openRows.map((row) => row.id),
    programDoneClaim: false,
    nextRequiredGate: result.releaseTruth.nextRequiredGate,
  };
  await writeJson(receiptPath, receipt);
  return {
    ...result,
    reportPath,
    reportSha256: receipt.reportSha256,
    receiptPath,
    receiptSha256: sha256File(receiptPath),
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      options.outDir = argv[index + 1];
      index += 1;
    } else if (arg === '--receipt') {
      options.receiptPath = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runNight01C00(parseArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify({
        status: result.status,
        pass: result.pass,
        headSha: result.identity.headSha,
        originMainSha: result.identity.originMainSha,
        reportPath: result.reportPath,
        reportSha256: result.reportSha256,
        receiptPath: result.receiptPath,
        receiptSha256: result.receiptSha256,
        openRows: result.openRows.map((row) => row.id),
      }, null, 2));
      process.exit(result.pass ? 0 : 1);
    })
    .catch((error) => {
      console.error(error && error.stack ? error.stack : String(error));
      process.exit(1);
    });
}
