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

function runP007(args = []) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-p0-07-'));
  const receiptPath = path.join(outDir, 'receipt.json');
  const run = spawnSync(process.execPath, [
    'scripts/ops/yalken-atlas-v5-final-audit-p0-07-stress-product-proof.mjs',
    '--out',
    outDir,
    '--receipt',
    receiptPath,
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  const summary = run.stdout.trim() ? JSON.parse(run.stdout) : {};
  return { run, summary, outDir, receiptPath };
}

test('P0 07: stress proof requires persisted 1000+ scene project plus rendered 10k and 50k graph evidence', () => {
  const { run, summary, receiptPath } = runP007();
  assert.equal(run.status, 0, `P0 07 runner failed:\n${run.stdout}\n${run.stderr}`);
  assert.equal(summary.status, 'PASS_P0_07_STRESS_PRODUCT_PROOF');
  assert.deepEqual(summary.failures, []);

  const report = JSON.parse(fs.readFileSync(summary.reportPath, 'utf8'));
  assert.equal(report.pass, true);
  assert.deepEqual(report.failures, []);
  assert.equal(report.authority.programDoneClaim, false);
  assert.equal(report.persistedLargeProject.sceneCount >= 1000, true);
  assert.equal(report.persistedLargeProject.bundleReadbackOk, true);
  assert.equal(report.persistedLargeProject.recoveryReadbackOk, true);
  assert.equal(report.persistedLargeProject.derivedDataPersistedAsTruth, false);
  assert.equal(report.workerQueue.coalescedLatestOnly, true);
  assert.equal(report.workerQueue.abortedRejected, true);
  assert.equal(report.workerQueue.staleIdentityRejected, true);
  assert.equal(report.workerQueue.staleRevisionRejected, true);
  assert.equal(report.acceptance.persistedLargeProjects, true);
  assert.equal(report.acceptance.rendered10k50kGraphs, true);
  assert.equal(report.acceptance.measuredLimitsNoSilentCap, true);
  assert.equal(report.negativeAssertions.workerOnlyAcceptedAsProductProof, false);
  assert.equal(report.negativeAssertions.receiptOnlyAcceptedAsReadiness, false);
  assert.equal(report.negativeAssertions.generatedScreenshotOnlyAccepted, false);

  for (const count of [10000, 50000]) {
    const runRow = report.workerRuns.find((item) => item.graphSourceCount === count);
    assert.ok(runRow, `missing worker row ${count}`);
    assert.equal(runRow.executionMode, 'worker-thread');
    assert.equal(runRow.workerThreadId > 0, true);
    assert.equal(runRow.plannedNodes > 0, true);
    assert.equal(runRow.plannedEdges > 0, true);
    assert.equal(runRow.spatialIndexCells > 0, true);
    assert.equal(runRow.fullGraphIncluded, false);
    assert.equal(runRow.coreStateIncluded, false);
    assert.equal(runRow.acceptedPointerOnly, true);
    assert.equal(runRow.renderAllNodes, false);
    assert.equal(runRow.renderAllEdges, false);

    const render = report.renderedGraphs.find((item) => item.graphSourceCount === count);
    assert.ok(render, `missing render row ${count}`);
    assert.equal(render.ok, true);
    assert.equal(render.dom.nodeCount, runRow.plannedNodes);
    assert.equal(render.dom.edgeCount > 0, true);
    assert.equal(render.dom.edgeCount <= runRow.plannedEdges, true);
    assert.equal(render.screenshotProof.exists, true);
    assert.equal(render.screenshotProof.bytes > 1000, true);
    assert.equal(render.nonBlankRatio > 0.001, true);
    assert.equal(render.networkRequests, 0);
  }

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.pass, true);
  assert.equal(receipt.programDoneClaim, false);
  assert.equal(receipt.acceptance.rendered10k50kGraphs, true);
  assert.equal(receipt.report.sha256, sha256File(summary.reportPath));
});

test('P0 07: worker-only run without Electron render cannot close the contour', () => {
  const { run, summary, receiptPath } = runP007(['--skip-electron-render']);
  assert.notEqual(run.status, 0, `skip-render run must fail acceptance:\n${run.stdout}\n${run.stderr}`);
  assert.equal(summary.status, 'FAIL_P0_07_STRESS_PRODUCT_PROOF');
  assert.equal(summary.pass, false);
  assert.ok(summary.failures.includes('RENDER_10000_MISSING'));
  assert.ok(summary.failures.includes('RENDER_50000_MISSING'));

  const report = JSON.parse(fs.readFileSync(summary.reportPath, 'utf8'));
  assert.equal(report.acceptance.persistedLargeProjects, true);
  assert.equal(report.acceptance.rendered10k50kGraphs, false);
  assert.equal(report.negativeAssertions.workerOnlyAcceptedAsProductProof, false);
  assert.equal(report.authority.programDoneClaim, false);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.pass, false);
  assert.equal(receipt.acceptance.rendered10k50kGraphs, false);
});

test('P0 07: source guard rejects silent caps and DONE-by-receipt shortcuts', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'ops', 'yalken-atlas-v5-final-audit-p0-07-stress-product-proof.mjs'),
    'utf8',
  );
  assert.doesNotMatch(source, /slice\(\s*0\s*,\s*500\s*\)/u);
  assert.doesNotMatch(source, /programDoneClaim:\s*true/u);
  assert.match(source, /skipElectronRender/u);
  assert.match(source, /SKIP_ELECTRON_RENDER_IS_NOT_ACCEPTANCE_ELIGIBLE/u);
  assert.match(source, /coalesceAtlasGraphWorkerPayloads/u);
  assert.match(source, /acceptAtlasGraphWorkerResult/u);
});
