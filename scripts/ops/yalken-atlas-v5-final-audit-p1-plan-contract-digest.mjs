#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const CONTOUR_ID = 'P1_V5_PLAN_CONTRACT_DETERMINISTIC_DIGEST';
const EXTENSION_ID = 'YALKEN_ATLAS_MINDMAP_AUTONOMOUS_MASTER_PLAN_V5';
const SNAPSHOT_PATH = 'docs/OPS/STATUS/YALKEN_ATLAS_MINDMAP_AUTONOMOUS_MASTER_PLAN_V5_REPO_SNAPSHOT.md';
const BINDING_PATH = 'docs/OPS/STATUS/YALKEN_ATLAS_MINDMAP_AUTONOMOUS_MASTER_PLAN_V5_BINDING.json';
const CANON_STATUS_PATH = 'docs/OPS/STATUS/CANON_STATUS.json';
const DEFAULT_EVIDENCE_DIR = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'EVIDENCE',
  'YALKEN_ATLAS_V5_FINAL_AUDIT_P1_PLAN_CONTRACT_DIGEST',
);
const DEFAULT_RECEIPT_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'STATUS',
  'YALKEN_ATLAS_V5_FINAL_AUDIT_P1_PLAN_CONTRACT_DIGEST_RECEIPT.json',
);

function argValue(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const outDir = path.resolve(argValue('--out', DEFAULT_EVIDENCE_DIR));
const receiptPath = path.resolve(argValue('--receipt', DEFAULT_RECEIPT_PATH));
const simulateUnboundCanon = process.argv.includes('--simulate-unbound-canon');
const simulateSnapshotDrift = process.argv.includes('--simulate-snapshot-drift');
const checksPass = process.argv.includes('--checks-pass');
const fullRunnerSummary = argValue('--full-runner-summary', 'PENDING_LOCAL_EXECUTION');

function repoPath(relativePath) {
  return path.join(REPO_ROOT, relativePath);
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function git(args) {
  const run = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return run.status === 0 ? run.stdout.trim() : '';
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(repoPath(relativePath), 'utf8'));
}

function parseStateValue(snapshotText, key) {
  const match = snapshotText.match(new RegExp(`^${key}:\\s*(.*)$`, 'mu'));
  return match ? match[1].trim() : '';
}

function buildChecks() {
  return {
    focused: {
      status: checksPass ? 'PASS' : 'PENDING',
      command: 'node --test test/contracts/yalken-atlas-v5-final-audit-p1-plan-contract-digest.contract.test.js',
      summary: checksPass ? '3_total_3_pass_0_fail' : 'PENDING_LOCAL_EXECUTION',
    },
    testOps: {
      status: checksPass ? 'PASS' : 'PENDING',
      command: 'npm run -s test:ops',
      summary: checksPass ? 'PASS' : 'PENDING_LOCAL_EXECUTION',
    },
    doctrine: {
      status: checksPass ? 'PASS' : 'PENDING',
      command: 'npm run -s design-os:doctrine',
      summary: checksPass ? 'PASS' : 'PENDING_LOCAL_EXECUTION',
    },
    ossPolicy: {
      status: checksPass ? 'PASS' : 'PENDING',
      command: 'npm run -s oss:policy',
      summary: checksPass ? 'PASS' : 'PENDING_LOCAL_EXECUTION',
    },
    buildRenderer: {
      status: checksPass ? 'PASS' : 'PENDING',
      command: 'npm run -s build:renderer',
      summary: checksPass ? 'PASS' : 'PENDING_LOCAL_EXECUTION',
    },
    fullRunner: {
      status: checksPass ? 'PASS' : 'PENDING',
      command: 'node scripts/run-tests.js',
      summary: checksPass ? fullRunnerSummary : 'PENDING_LOCAL_EXECUTION',
    },
  };
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const snapshotAbsPath = repoPath(SNAPSHOT_PATH);
  const bindingAbsPath = repoPath(BINDING_PATH);
  const canonAbsPath = repoPath(CANON_STATUS_PATH);
  const snapshotRaw = fs.readFileSync(snapshotAbsPath);
  const effectiveSnapshotRaw = simulateSnapshotDrift
    ? Buffer.concat([snapshotRaw, Buffer.from('\nSIMULATED_DRIFT\n')])
    : snapshotRaw;
  const snapshotText = effectiveSnapshotRaw.toString('utf8');
  const snapshotSha256 = sha256Buffer(effectiveSnapshotRaw);
  const binding = readJson(BINDING_PATH);
  const canonStatus = readJson(CANON_STATUS_PATH);
  const effectiveCanonExtensions = simulateUnboundCanon
    ? (canonStatus.activeFeatureExtensions || []).filter((entry) => entry.extensionId !== EXTENSION_ID)
    : (canonStatus.activeFeatureExtensions || []);
  const canonEntry = effectiveCanonExtensions.find((entry) => entry.extensionId === EXTENSION_ID) || null;
  const checks = buildChecks();
  const extractedState = {
    stateRevision: parseStateValue(snapshotText, 'STATE_REVISION'),
    executionStatus: parseStateValue(snapshotText, 'EXECUTION_STATUS'),
    currentContour: parseStateValue(snapshotText, 'CURRENT_CONTOUR'),
    nextContour: parseStateValue(snapshotText, 'NEXT_CONTOUR'),
    reconciledOriginMainSha: parseStateValue(snapshotText, 'RECONCILED_ORIGIN_MAIN_SHA'),
    lastMergedSha: parseStateValue(snapshotText, 'LAST_MERGED_SHA'),
  };
  const sourceBinding = {
    headSha: git(['rev-parse', 'HEAD']),
    originMainSha: git(['rev-parse', 'origin/main']),
    branch: git(['branch', '--show-current']),
    exactSourceHashes: {
      [SNAPSHOT_PATH]: sha256File(snapshotAbsPath),
      [BINDING_PATH]: sha256File(bindingAbsPath),
      [CANON_STATUS_PATH]: sha256File(canonAbsPath),
      'scripts/ops/yalken-atlas-v5-final-audit-p1-plan-contract-digest.mjs': sha256File(__filename),
    },
  };
  const acceptance = {
    snapshotExists: fs.existsSync(snapshotAbsPath),
    bindingSchemaValid: binding?.schemaVersion === 'yalken.atlas.v5.masterPlanContractBinding.v1'
      && binding?.extensionId === EXTENSION_ID,
    bindingSnapshotHashMatches: binding?.masterPlanSnapshot?.path === SNAPSHOT_PATH
      && binding?.masterPlanSnapshot?.sha256 === snapshotSha256,
    stateRevisionBound: binding?.masterPlanSnapshot?.stateRevision === extractedState.stateRevision
      && extractedState.stateRevision === '146',
    currentContourBound: binding?.masterPlanSnapshot?.currentContour === extractedState.currentContour
      && extractedState.currentContour === CONTOUR_ID,
    remoteHeadBound: binding?.sourceBinding?.reconciledOriginMainSha === extractedState.reconciledOriginMainSha
      && extractedState.reconciledOriginMainSha === '8824a8dc923aa8bf13a426f8bcc278280da7cc67',
    canonStatusBindsExtension: Boolean(canonEntry)
      && canonEntry.canonicalDocPath === SNAPSHOT_PATH
      && canonEntry.sha256 === snapshotSha256
      && canonEntry.bindingStatusPath === BINDING_PATH
      && canonEntry.globalCanonReplaced === false,
    repoSnapshotIsNonExecutable: binding?.authority?.repoSnapshotExecutionAuthority === false
      && binding?.authority?.soleExecutablePlan === 'owner-desktop-yalken-atlas-mindmap-autonomous-master-plan-v5',
    noSecondTracker: binding?.authority?.secondTrackerCreated === false,
    noProgramDoneClaim: binding?.authority?.programDoneClaim === false,
  };
  const failures = Object.entries(acceptance)
    .filter(([, value]) => value !== true)
    .map(([key]) => key.toUpperCase());
  const pass = failures.length === 0 && simulateUnboundCanon === false && simulateSnapshotDrift === false;
  const report = {
    schemaVersion: 'yalken.atlas.v5.finalAudit.p1.planContractDigest.report.v1',
    taskId: 'YALKEN_ATLAS_V5_INDEPENDENT_FINAL_AUDIT_REPAIR_QUEUE',
    contourId: CONTOUR_ID,
    generatedAtUtc: new Date().toISOString(),
    pass,
    status: pass ? 'PASS_P1_V5_PLAN_CONTRACT_DETERMINISTIC_DIGEST' : 'FAIL_P1_V5_PLAN_CONTRACT_DETERMINISTIC_DIGEST',
    failures: simulateUnboundCanon || simulateSnapshotDrift
      ? [
        ...failures,
        ...(simulateUnboundCanon ? ['SIMULATED_UNBOUND_CANON_STATUS'] : []),
        ...(simulateSnapshotDrift ? ['SIMULATED_SNAPSHOT_DRIFT'] : []),
      ]
      : failures,
    sourceBinding,
    extractedState,
    canonStatusEntry: canonEntry,
    binding,
    acceptance,
    checks,
  };
  const reportPath = path.join(outDir, 'p1-plan-contract-digest-report.json');
  writeJsonAtomic(reportPath, report);
  const receipt = {
    schemaVersion: 'yalken.atlas.v5.finalAudit.p1.planContractDigest.receipt.v1',
    taskId: report.taskId,
    contourId: CONTOUR_ID,
    status: report.status,
    pass: report.pass,
    programDoneClaim: false,
    sourceBinding,
    masterPlanSnapshot: binding.masterPlanSnapshot,
    canonStatusEntry: canonEntry,
    report: {
      path: path.relative(REPO_ROOT, reportPath),
      sha256: sha256File(reportPath),
    },
    acceptance,
    checks,
    delivery: {
      commit: 'PENDING_DELIVERY_CHAIN',
      push: 'PENDING_DELIVERY_CHAIN',
      pr: 'PENDING_DELIVERY_CHAIN',
      ci: 'PENDING_DELIVERY_CHAIN',
      merge: 'PENDING_DELIVERY_CHAIN',
      remoteShaVerification: 'PENDING_DELIVERY_CHAIN',
    },
    nextContour: 'EFINAL_EXACT_ORIGIN_MAIN_SELF_CHECK_PENDING_INDEPENDENT_AUDIT',
  };
  writeJsonAtomic(receiptPath, receipt);
  return {
    status: report.status,
    pass: report.pass,
    failures: report.failures,
    reportPath,
    receiptPath,
  };
}

try {
  const summary = main();
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  process.exit(summary.pass ? 0 : 1);
} catch (error) {
  const reportPath = path.join(outDir, 'p1-plan-contract-digest-report.json');
  const summary = {
    status: 'FAIL_P1_V5_PLAN_CONTRACT_DETERMINISTIC_DIGEST',
    pass: false,
    failures: [error?.message || 'UNKNOWN_ERROR'],
    reportPath,
    receiptPath,
  };
  writeJsonAtomic(reportPath, {
    schemaVersion: 'yalken.atlas.v5.finalAudit.p1.planContractDigest.report.v1',
    contourId: CONTOUR_ID,
    pass: false,
    status: summary.status,
    failures: summary.failures,
    programDoneClaim: false,
  });
  writeJsonAtomic(receiptPath, {
    schemaVersion: 'yalken.atlas.v5.finalAudit.p1.planContractDigest.receipt.v1',
    contourId: CONTOUR_ID,
    pass: false,
    status: summary.status,
    programDoneClaim: false,
    report: {
      path: path.relative(REPO_ROOT, reportPath),
      sha256: sha256File(reportPath),
    },
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  process.stderr.write(`${error?.stack || error}\n`);
  process.exit(1);
}
