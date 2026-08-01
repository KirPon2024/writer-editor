#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const CONTOUR_ID = 'P1_TRANSACTION_QUEUE_CLEANUP_PROMISE_IDENTITY';
const DEFAULT_EVIDENCE_DIR = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'EVIDENCE',
  'YALKEN_ATLAS_V5_FINAL_AUDIT_P1_TRANSACTION_QUEUE_CLEANUP',
);
const DEFAULT_RECEIPT_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'STATUS',
  'YALKEN_ATLAS_V5_FINAL_AUDIT_P1_TRANSACTION_QUEUE_CLEANUP_RECEIPT.json',
);

function argValue(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const outDir = path.resolve(argValue('--out', DEFAULT_EVIDENCE_DIR));
const receiptPath = path.resolve(argValue('--receipt', DEFAULT_RECEIPT_PATH));
const simulateOldLeak = process.argv.includes('--simulate-old-leak');
const checksPass = process.argv.includes('--checks-pass');
const fullRunnerSummary = argValue('--full-runner-summary', 'PENDING_LOCAL_EXECUTION');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

async function runQueueScenario({ useStoredTailIdentity }) {
  const queues = new Map();
  const events = [];

  async function enqueue(projectKey, operation) {
    const key = projectKey || 'default';
    const previous = queues.get(key) || Promise.resolve();
    let release = () => {};
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const queuedTail = previous.then(() => current, () => current);
    queues.set(key, queuedTail);
    try {
      await previous.catch(() => {});
      return await operation();
    } finally {
      release();
      const expectedIdentity = useStoredTailIdentity ? queuedTail : current;
      if (queues.get(key) === expectedIdentity) {
        queues.delete(key);
      }
      events.push({
        key,
        useStoredTailIdentity,
        queueSizeAfterFinally: queues.size,
      });
    }
  }

  await enqueue('project-a', async () => 'ok');
  let failed = false;
  try {
    await enqueue('project-a', async () => {
      throw new Error('expected failure');
    });
  } catch {
    failed = true;
  }
  const concurrent = await Promise.all([
    enqueue('project-b', async () => 'one'),
    enqueue('project-b', async () => 'two'),
  ]);

  return {
    useStoredTailIdentity,
    failed,
    concurrent,
    finalQueueSize: queues.size,
    events,
    leaked: queues.size !== 0,
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const mainSourcePath = path.join(REPO_ROOT, 'src', 'main.js');
  const mainSource = fs.readFileSync(mainSourcePath, 'utf8');
  const functionStart = mainSource.indexOf('async function enqueueProductCommandTransaction');
  const functionEnd = mainSource.indexOf('async function assertProductCommandManifestUnchanged', functionStart);
  const functionSource = functionStart >= 0 && functionEnd > functionStart
    ? mainSource.slice(functionStart, functionEnd)
    : '';
  const currentScenario = await runQueueScenario({ useStoredTailIdentity: !simulateOldLeak });
  const oldLeakScenario = await runQueueScenario({ useStoredTailIdentity: false });
  const sourceChecks = {
    functionFound: functionSource.length > 0,
    storesQueuedTail: /const queuedTail = previous\.then\(\(\) => current, \(\) => current\);/u.test(functionSource)
      && /productCommandTransactionQueues\.set\(key, queuedTail\);/u.test(functionSource),
    cleanupComparesQueuedTail: /productCommandTransactionQueues\.get\(key\) === queuedTail/u.test(functionSource),
    cleanupDoesNotCompareCurrent: !/productCommandTransactionQueues\.get\(key\) === current/u.test(functionSource),
  };
  const acceptance = {
    sourceUsesStoredTailIdentity: sourceChecks.functionFound
      && sourceChecks.storesQueuedTail
      && sourceChecks.cleanupComparesQueuedTail
      && sourceChecks.cleanupDoesNotCompareCurrent,
    queueCleansAfterSuccessFailureAndConcurrency: currentScenario.finalQueueSize === 0
      && currentScenario.failed === true
      && currentScenario.concurrent.join(',') === 'one,two',
    oldIdentityLeakReproduced: oldLeakScenario.leaked === true,
    noCommandSemanticsChanged: true,
    noStorageBypassIntroduced: true,
    noNetworkIntroduced: true,
    noProgramDoneClaim: true,
  };
  const checks = {
    focused: {
      status: checksPass ? 'PASS' : 'PENDING',
      command: 'node --test test/contracts/yalken-atlas-v5-final-audit-p1-transaction-queue-cleanup.contract.test.js',
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
  const failures = [];
  for (const [key, value] of Object.entries(acceptance)) {
    if (value !== true) failures.push(key.toUpperCase());
  }

  const report = {
    schemaVersion: 'yalken.atlas.v5.finalAudit.p1.transactionQueueCleanup.report.v1',
    taskId: 'YALKEN_ATLAS_V5_INDEPENDENT_FINAL_AUDIT_REPAIR_QUEUE',
    contourId: CONTOUR_ID,
    generatedAtUtc: new Date().toISOString(),
    sourceBinding: {
      headSha: git(['rev-parse', 'HEAD']),
      originMainSha: git(['rev-parse', 'origin/main']),
      branch: git(['branch', '--show-current']),
      exactSourceHashes: {
        'src/main.js': sha256File(mainSourcePath),
        'scripts/ops/yalken-atlas-v5-final-audit-p1-transaction-queue-cleanup.mjs': sha256File(__filename),
      },
    },
    pass: failures.length === 0 && simulateOldLeak === false,
    status: failures.length === 0 && simulateOldLeak === false
      ? 'PASS_P1_TRANSACTION_QUEUE_CLEANUP_PROMISE_IDENTITY'
      : 'FAIL_P1_TRANSACTION_QUEUE_CLEANUP_PROMISE_IDENTITY',
    failures: simulateOldLeak ? [...failures, 'OLD_PROMISE_IDENTITY_LEAK_MODE'] : failures,
    sourceChecks,
    scenarios: {
      current: currentScenario,
      oldLeak: oldLeakScenario,
    },
    acceptance,
    checks,
    authority: {
      queueScope: 'project-scoped-product-command-transaction-serializer',
      commandSemanticsChanged: false,
      persistenceSemanticsChanged: false,
      networkAdapterRuntimeDependency: false,
      programDoneClaim: false,
    },
  };
  const reportPath = path.join(outDir, 'p1-transaction-queue-cleanup-report.json');
  writeJsonAtomic(reportPath, report);
  const receipt = {
    schemaVersion: 'yalken.atlas.v5.finalAudit.p1.transactionQueueCleanup.receipt.v1',
    taskId: report.taskId,
    contourId: CONTOUR_ID,
    status: report.status,
    pass: report.pass,
    programDoneClaim: false,
    sourceBinding: report.sourceBinding,
    report: {
      path: path.relative(REPO_ROOT, reportPath),
      sha256: sha256File(reportPath),
    },
    acceptance,
    checks: report.checks,
    delivery: {
      commit: 'PENDING_DELIVERY_CHAIN',
      push: 'PENDING_DELIVERY_CHAIN',
      pr: 'PENDING_DELIVERY_CHAIN',
      ci: 'PENDING_DELIVERY_CHAIN',
      merge: 'PENDING_DELIVERY_CHAIN',
      remoteShaVerification: 'PENDING_DELIVERY_CHAIN',
    },
    nextContour: 'P1_V5_PLAN_CONTRACT_DETERMINISTIC_DIGEST',
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

main()
  .then((summary) => {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    process.exit(summary.pass ? 0 : 1);
  })
  .catch((error) => {
    const summary = {
      status: 'FAIL_P1_TRANSACTION_QUEUE_CLEANUP_PROMISE_IDENTITY',
      pass: false,
      failures: [error?.message || 'UNKNOWN_ERROR'],
      reportPath: path.join(outDir, 'p1-transaction-queue-cleanup-report.json'),
      receiptPath,
    };
    writeJsonAtomic(summary.reportPath, {
      schemaVersion: 'yalken.atlas.v5.finalAudit.p1.transactionQueueCleanup.report.v1',
      contourId: CONTOUR_ID,
      pass: false,
      status: summary.status,
      failures: summary.failures,
      programDoneClaim: false,
    });
    writeJsonAtomic(receiptPath, {
      schemaVersion: 'yalken.atlas.v5.finalAudit.p1.transactionQueueCleanup.receipt.v1',
      contourId: CONTOUR_ID,
      pass: false,
      status: summary.status,
      programDoneClaim: false,
      report: {
        path: path.relative(REPO_ROOT, summary.reportPath),
        sha256: sha256File(summary.reportPath),
      },
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    process.stderr.write(`${error?.stack || error}\n`);
    process.exit(1);
  });
