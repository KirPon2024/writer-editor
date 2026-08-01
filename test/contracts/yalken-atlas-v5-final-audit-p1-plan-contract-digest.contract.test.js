const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SNAPSHOT_PATH = 'docs/OPS/STATUS/YALKEN_ATLAS_MINDMAP_AUTONOMOUS_MASTER_PLAN_V5_REPO_SNAPSHOT.md';
const BINDING_PATH = 'docs/OPS/STATUS/YALKEN_ATLAS_MINDMAP_AUTONOMOUS_MASTER_PLAN_V5_BINDING.json';
const CANON_STATUS_PATH = 'docs/OPS/STATUS/CANON_STATUS.json';
const EXTENSION_ID = 'YALKEN_ATLAS_MINDMAP_AUTONOMOUS_MASTER_PLAN_V5';

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function runP1Digest(args = []) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-p1-plan-digest-'));
  const receiptPath = path.join(outDir, 'receipt.json');
  const run = spawnSync(process.execPath, [
    'scripts/ops/yalken-atlas-v5-final-audit-p1-plan-contract-digest.mjs',
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

function parseDoctorTokens(stdout) {
  const tokens = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/u)) {
    const line = raw.startsWith('DOCTOR_TOKEN ')
      ? raw.slice('DOCTOR_TOKEN '.length)
      : raw;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    tokens.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return tokens;
}

test('P1 digest: V5 plan snapshot, binding, and CANON_STATUS resolve to one deterministic contract', () => {
  const { run, summary, receiptPath } = runP1Digest();
  assert.equal(run.status, 0, `P1 digest runner failed:\n${run.stdout}\n${run.stderr}`);
  assert.equal(summary.status, 'PASS_P1_V5_PLAN_CONTRACT_DETERMINISTIC_DIGEST');
  assert.deepEqual(summary.failures, []);

  const report = JSON.parse(fs.readFileSync(summary.reportPath, 'utf8'));
  assert.equal(report.pass, true);
  assert.deepEqual(report.failures, []);
  assert.equal(report.acceptance.snapshotExists, true);
  assert.equal(report.acceptance.bindingSchemaValid, true);
  assert.equal(report.acceptance.bindingSnapshotHashMatches, true);
  assert.equal(report.acceptance.stateRevisionBound, true);
  assert.equal(report.acceptance.currentContourBound, true);
  assert.equal(report.acceptance.remoteHeadBound, true);
  assert.equal(report.acceptance.canonStatusBindsExtension, true);
  assert.equal(report.acceptance.repoSnapshotIsNonExecutable, true);
  assert.equal(report.acceptance.noSecondTracker, true);
  assert.equal(report.acceptance.noProgramDoneClaim, true);
  assert.match(report.extractedState.stateRevision, /^[1-9][0-9]*$/u);
  assert.equal(report.extractedState.currentContour, 'P1_V5_PLAN_CONTRACT_DETERMINISTIC_DIGEST');
  assert.equal(report.extractedState.reconciledOriginMainSha, report.sourceBinding.originMainSha);
  assert.equal(report.canonStatusEntry.extensionId, EXTENSION_ID);
  assert.equal(report.canonStatusEntry.canonicalDocPath, SNAPSHOT_PATH);
  assert.equal(report.canonStatusEntry.bindingStatusPath, BINDING_PATH);
  assert.equal(report.canonStatusEntry.globalCanonReplaced, false);

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.pass, true);
  assert.equal(receipt.programDoneClaim, false);
  assert.equal(receipt.report.sha256, sha256File(summary.reportPath));

  const doctor = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      OPS_EXEC_MODE: 'LOCAL_EXEC',
      SECTOR_U_FAST_DURATION_MS: '10',
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(doctor.status, 0, `doctor failed:\n${doctor.stdout}\n${doctor.stderr}`);
  const doctorTokens = parseDoctorTokens(doctor.stdout);
  assert.equal(doctorTokens.get('CANON_WORKTREE_SPLIT_BRAIN_DETECTED'), '0');
});

test('P1 digest: CANON_STATUS must bind the Atlas V5 plan extension explicitly', () => {
  const { run, summary } = runP1Digest(['--simulate-unbound-canon']);
  assert.notEqual(run.status, 0, `unbound CANON_STATUS mode must fail:\n${run.stdout}\n${run.stderr}`);
  assert.equal(summary.status, 'FAIL_P1_V5_PLAN_CONTRACT_DETERMINISTIC_DIGEST');
  assert.ok(summary.failures.includes('CANONSTATUSBINDSEXTENSION'));
  assert.ok(summary.failures.includes('SIMULATED_UNBOUND_CANON_STATUS'));
});

test('P1 digest: snapshot byte drift breaks the immutable binding', () => {
  const { run, summary } = runP1Digest(['--simulate-snapshot-drift']);
  assert.notEqual(run.status, 0, `snapshot drift mode must fail:\n${run.stdout}\n${run.stderr}`);
  assert.equal(summary.status, 'FAIL_P1_V5_PLAN_CONTRACT_DETERMINISTIC_DIGEST');
  assert.ok(summary.failures.includes('BINDINGSNAPSHOTHASHMATCHES'));
  assert.ok(summary.failures.includes('SIMULATED_SNAPSHOT_DRIFT'));

  const snapshotHash = sha256File(path.join(process.cwd(), SNAPSHOT_PATH));
  const binding = JSON.parse(fs.readFileSync(path.join(process.cwd(), BINDING_PATH), 'utf8'));
  const canonStatus = JSON.parse(fs.readFileSync(path.join(process.cwd(), CANON_STATUS_PATH), 'utf8'));
  const canonEntry = canonStatus.activeFeatureExtensions.find((entry) => entry.extensionId === EXTENSION_ID);
  assert.equal(binding.masterPlanSnapshot.sha256, snapshotHash);
  assert.equal(canonEntry.sha256, snapshotHash);
});
