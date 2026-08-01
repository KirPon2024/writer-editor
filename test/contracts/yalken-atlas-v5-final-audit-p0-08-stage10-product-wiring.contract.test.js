const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function runP008(args = []) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-p0-08-'));
  const receiptPath = path.join(outDir, 'receipt.json');
  const run = spawnSync(process.execPath, [
    'scripts/ops/yalken-atlas-v5-final-audit-p0-08-stage10-product-wiring.mjs',
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

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

test('P0 08: Stage 10 local product wiring persists and reopens comments, history, conflicts and exchange through visible commands', () => {
  const { run, summary, receiptPath } = runP008();
  assert.equal(run.status, 0, `P0 08 runner failed:\n${run.stdout}\n${run.stderr}`);
  assert.equal(summary.status, 'PASS_P0_08_STAGE10_PRODUCT_WIRING');
  assert.deepEqual(summary.failures, []);

  const report = JSON.parse(fs.readFileSync(summary.reportPath, 'utf8'));
  assert.equal(report.pass, true);
  assert.deepEqual(report.failures, []);
  assert.equal(report.authority.commandKernelOwnsMutation, true);
  assert.equal(report.authority.designOsSurfaceIntentOnly, true);
  assert.equal(report.authority.networkAdapterRuntimeDependency, false);
  assert.equal(report.authority.shadowAcceptedAsComplete, false);
  assert.equal(report.authority.programDoneClaim, false);

  assert.equal(report.acceptance.visibleUiCommandPath, true);
  assert.equal(report.acceptance.commandKernelCapabilityRevalidated, true);
  assert.equal(report.acceptance.commentsProductPathPersistReopen, true);
  assert.equal(report.acceptance.historyProductPathPersistReopenRecoveryUndo, true);
  assert.equal(report.acceptance.conflictsProductPathPersistManualDecision, true);
  assert.equal(report.acceptance.operationExchangeLocalProductPath, true);
  assert.equal(report.acceptance.negativeDirectBridgeDenied, true);
  assert.equal(report.acceptance.shadowOnlyRejectedAsComplete, true);
  assert.equal(report.acceptance.networkAdapterNotRequired, true);
  assert.equal(report.acceptance.noProgramDoneClaim, true);

  assert.equal(report.commandPath.allCapabilityRevalidated, true);
  assert.equal(report.commandPath.directBridgeDenied, true);
  assert.equal(report.commandPath.directBridgeMutatedState, false);
  assert.ok(report.commandPath.commandIds.includes('project.applyTextEdit'));
  assert.ok(report.commandPath.commandIds.includes('cmd.comments.importStablePacket'));
  assert.ok(report.commandPath.commandIds.includes('cmd.project.history.restoreUndo'));
  assert.ok(report.commandPath.commandIds.includes('cmd.collab.operationExchange.localFixturePreview'));
  assert.equal(report.persistence.recoverySnapshotCount >= 2, true);
  assert.equal(report.productPaths.comments.secondCommentTruth, false);
  assert.equal(report.productPaths.history.storedHistoryTruth, false);
  assert.equal(report.productPaths.conflicts.automaticMerge, false);
  assert.equal(report.productPaths.conflicts.silentProjectRewrite, false);
  assert.equal(report.productPaths.operationExchange.networkAdapterEnabled, false);
  assert.equal(report.productPaths.operationExchange.shadowOnly, false);
  assert.equal(report.negativeAssertions.receiptOnlyAcceptedAsReadiness, false);
  assert.equal(report.negativeAssertions.storageBypassAccepted, false);

  for (const event of report.activationModes) {
    assert.equal(event.activationMode, 'PHYSICAL_POINTER_OR_KEYBOARD');
    assert.equal(event.visibleControl, true);
    assert.equal(event.directBridge, false);
  }

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.pass, true);
  assert.equal(receipt.programDoneClaim, false);
  assert.equal(receipt.acceptance.operationExchangeLocalProductPath, true);
  assert.equal(receipt.report.sha256, sha256File(summary.reportPath));
});

test('P0 08: shadow-only comments/history/collab artifacts cannot close product wiring', () => {
  const { run, summary, receiptPath } = runP008(['--shadow-only']);
  assert.notEqual(run.status, 0, `shadow-only run must fail acceptance:\n${run.stdout}\n${run.stderr}`);
  assert.equal(summary.status, 'FAIL_P0_08_STAGE10_PRODUCT_WIRING');
  assert.ok(summary.failures.includes('VISIBLE_UI_COMMAND_PATH_NOT_PROVEN'));
  assert.ok(summary.failures.includes('COMMENTS_PRODUCT_PATH_NOT_PERSISTED_REOPENED'));
  assert.ok(summary.failures.includes('SHADOW_ONLY_ACCEPTED_AS_COMPLETE'));

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.pass, false);
  assert.equal(receipt.programDoneClaim, false);
});

test('P0 08: product path fails closed without storage/reopen port', () => {
  const { run, summary, receiptPath } = runP008(['--disable-storage']);
  assert.notEqual(run.status, 0, `storage-disabled run must fail:\n${run.stdout}\n${run.stderr}`);
  assert.equal(summary.status, 'FAIL_P0_08_STAGE10_PRODUCT_WIRING');
  assert.equal(summary.pass, false);
  assert.ok(summary.failures.includes('E_STAGE10_STORAGE_PORT_REQUIRED'));

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.pass, false);
  assert.equal(receipt.programDoneClaim, false);
});

test('P0 08: network exchange request remains rejected instead of becoming runtime dependency', () => {
  const { run, summary } = runP008(['--request-network-adapter']);
  assert.notEqual(run.status, 0, `network adapter request must fail local product acceptance:\n${run.stdout}\n${run.stderr}`);
  assert.equal(summary.status, 'FAIL_P0_08_STAGE10_PRODUCT_WIRING');
  assert.ok(summary.failures.includes('NETWORK_ADAPTER_REQUIRED_OR_ACCEPTED'));

  const report = JSON.parse(fs.readFileSync(summary.reportPath, 'utf8'));
  assert.equal(report.authority.networkAdapterRuntimeDependency, false);
  assert.equal(report.negativeAssertions.networkAdapterAccepted, false);
});

test('P0 08: direct command bridge is denied by production adapter before reducer or persistence', async () => {
  const module = await importModule('src/product/stage10ProductWiring.mjs');
  const writes = [];
  const storagePort = {
    writeSession(projectId, session) {
      writes.push({ projectId, session });
      return { ok: true };
    },
    readSession() {
      return writes.at(-1)?.session;
    },
    writeRecoverySnapshot() {
      return { ok: true };
    },
    readRecoverySnapshot() {
      return null;
    },
  };
  const runtime = await module.createStage10ProductRuntime({
    projectId: 'p0-08-direct-negative',
    storagePort,
    capabilitySnapshot: { capabilities: { stage10LocalProductWiring: true } },
  });
  const beforeHash = module.buildStage10ProductReadModels(runtime.getSession()).surface.projectId;
  const denied = await runtime.dispatchVisibleCommand(
    'project.create',
    { projectId: 'p0-08-direct-negative', sceneId: 'scene-1' },
    { mode: module.STAGE10_ACTIVATION_MODES.FORBIDDEN_DIRECT_BRIDGE, controlId: 'ipc' },
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_STAGE10_DIRECT_BRIDGE_DENIED');
  assert.equal(runtime.getSession().commandReceipts.length, 0);
  assert.equal(writes.length, 0);
  assert.equal(module.buildStage10ProductReadModels(runtime.getSession()).surface.projectId, beforeHash);
});

test('P0 08: source guard keeps adapter browser-safe and blocks receipt-only DONE shortcuts', () => {
  const adapterSource = readText('src/product/stage10ProductWiring.mjs');
  const runnerSource = readText('scripts/ops/yalken-atlas-v5-final-audit-p0-08-stage10-product-wiring.mjs');

  for (const source of [adapterSource]) {
    assert.doesNotMatch(source, /from\s+['"]node:fs['"]/u);
    assert.doesNotMatch(source, /from\s+['"]node:http['"]/u);
    assert.doesNotMatch(source, /from\s+['"]node:https['"]/u);
    assert.doesNotMatch(source, /\bfetch\s*\(/u);
    assert.doesNotMatch(source, /\blocalStorage\b/u);
    assert.doesNotMatch(source, /\bipcRenderer\b|\bipcMain\b/u);
    assert.doesNotMatch(source, /programDoneClaim:\s*true/u);
    assert.doesNotMatch(source, /shadowAcceptedAsComplete:\s*true/u);
  }

  assert.match(adapterSource, /applyCommandWithEventLog/u);
  assert.match(adapterSource, /reduceCoreState/u);
  assert.match(adapterSource, /buildRevisionHistoryProjectionPacket/u);
  assert.match(adapterSource, /buildStableCommentAnchorPacketFromReviewIr/u);
  assert.match(adapterSource, /buildLocalMultiSessionRecoveryReport/u);
  assert.match(adapterSource, /buildTransportNeutralExchangePacket/u);
  assert.match(adapterSource, /storagePort\.writeSession/u);
  assert.match(runnerSource, /--shadow-only/u);
  assert.match(runnerSource, /DIRECT_BRIDGE_NEGATIVE_NOT_PROVEN/u);
  assert.match(runnerSource, /NETWORK_ADAPTER_REQUIRED_OR_ACCEPTED/u);
});
