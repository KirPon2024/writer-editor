const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function runP1(args = []) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-p1-queue-cleanup-'));
  const receiptPath = path.join(outDir, 'receipt.json');
  const run = spawnSync(process.execPath, [
    'scripts/ops/yalken-atlas-v5-final-audit-p1-transaction-queue-cleanup.mjs',
    '--out',
    outDir,
    '--receipt',
    receiptPath,
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const summary = run.stdout.trim() ? JSON.parse(run.stdout) : {};
  return { run, summary, receiptPath };
}

function readText(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('P1: product command transaction queue cleanup uses the stored tail promise identity', () => {
  const { run, summary, receiptPath } = runP1();
  assert.equal(run.status, 0, `P1 queue cleanup runner failed:\n${run.stdout}\n${run.stderr}`);
  assert.equal(summary.status, 'PASS_P1_TRANSACTION_QUEUE_CLEANUP_PROMISE_IDENTITY');
  assert.deepEqual(summary.failures, []);

  const report = JSON.parse(fs.readFileSync(summary.reportPath, 'utf8'));
  assert.equal(report.pass, true);
  assert.deepEqual(report.failures, []);
  assert.equal(report.acceptance.sourceUsesStoredTailIdentity, true);
  assert.equal(report.acceptance.queueCleansAfterSuccessFailureAndConcurrency, true);
  assert.equal(report.acceptance.oldIdentityLeakReproduced, true);
  assert.equal(report.acceptance.noCommandSemanticsChanged, true);
  assert.equal(report.acceptance.noStorageBypassIntroduced, true);
  assert.equal(report.acceptance.noNetworkIntroduced, true);
  assert.equal(report.acceptance.noProgramDoneClaim, true);
  assert.equal(report.authority.commandSemanticsChanged, false);
  assert.equal(report.authority.persistenceSemanticsChanged, false);
  assert.equal(report.authority.networkAdapterRuntimeDependency, false);
  assert.equal(report.authority.programDoneClaim, false);
  assert.equal(report.scenarios.current.finalQueueSize, 0);
  assert.equal(report.scenarios.current.failed, true);
  assert.deepEqual(report.scenarios.current.concurrent, ['one', 'two']);
  assert.equal(report.scenarios.oldLeak.leaked, true);

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.pass, true);
  assert.equal(receipt.programDoneClaim, false);
  assert.equal(receipt.acceptance.queueCleansAfterSuccessFailureAndConcurrency, true);
  assert.equal(receipt.report.sha256, sha256File(summary.reportPath));
});

test('P1: old promise identity comparison remains a negative leak case', () => {
  const { run, summary, receiptPath } = runP1(['--simulate-old-leak']);
  assert.notEqual(run.status, 0, `old promise identity mode must fail:\n${run.stdout}\n${run.stderr}`);
  assert.equal(summary.status, 'FAIL_P1_TRANSACTION_QUEUE_CLEANUP_PROMISE_IDENTITY');
  assert.equal(summary.pass, false);
  assert.ok(summary.failures.includes('OLD_PROMISE_IDENTITY_LEAK_MODE'));

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.pass, false);
  assert.equal(receipt.programDoneClaim, false);
});

test('P1: source guard keeps the queue cleanup scoped to identity cleanup only', () => {
  const mainSource = readText('src/main.js');
  const functionStart = mainSource.indexOf('async function enqueueProductCommandTransaction');
  const functionEnd = mainSource.indexOf('async function assertProductCommandManifestUnchanged', functionStart);
  assert.notEqual(functionStart, -1);
  assert.ok(functionEnd > functionStart);
  const functionSource = mainSource.slice(functionStart, functionEnd);

  assert.match(functionSource, /const queuedTail = previous\.then\(\(\) => current, \(\) => current\);/u);
  assert.match(functionSource, /productCommandTransactionQueues\.set\(key, queuedTail\);/u);
  assert.match(functionSource, /productCommandTransactionQueues\.get\(key\) === queuedTail/u);
  assert.doesNotMatch(functionSource, /productCommandTransactionQueues\.get\(key\) === current/u);
  assert.doesNotMatch(functionSource, /\bipcRenderer\b|\bipcMain\b/u);
  assert.doesNotMatch(functionSource, /\bfetch\s*\(/u);
  assert.doesNotMatch(functionSource, /\blocalStorage\b/u);
});
