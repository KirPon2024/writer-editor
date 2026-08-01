const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

async function loadR3C05() {
  return import(pathToFileURL(path.join(
    process.cwd(),
    'scripts/ops/yalken-atlas-v5-r3-c05-release-saturation-revalidation.mjs',
  )).href);
}

test('R3 C05: source invariants close transaction, payloadPreview, Design OS slot, and old EFINAL false-green gaps', async () => {
  const mod = await loadR3C05();
  const source = mod.evaluateSourceInvariants();
  assert.equal(source.checks.productCommandTransactionSerialized, true);
  assert.equal(source.checks.relationPayloadPreviewPreserved, true);
  assert.equal(source.checks.atlasDesignOsSlotBinding, true);
  assert.equal(source.checks.oldEfinalNotAcceptedAsCurrentProof, true);
  assert.equal(source.checks.noSilentSourceSceneSlice, true);
  assert.equal(source.oldEfinal.acceptedAsCurrentDodProof, false);
  assert.equal(source.rawMatcherDisposition.currentDisposition, 'INSPECTED_EXACT_ONLY_AUTHOR_BOUND_MATCHER_NOT_RELEASE_VETO_FOR_R3_C05');
});

test('R3 C05: P0 rows only close when executable journey rows are PASS', async () => {
  const mod = await loadR3C05();
  const source = mod.evaluateSourceInvariants();
  const passJourney = { pass: true, reportSha256: 'sha' };
  const rows = mod.buildP0Rows({
    c01: passJourney,
    c02: passJourney,
    c03: passJourney,
    c04: passJourney,
    source,
  });
  assert.equal(rows.every((row) => row.status !== 'OPEN'), true);

  const missingPhysicalRows = mod.buildP0Rows({
    c01: { pass: false, reportSha256: '' },
    c02: passJourney,
    c03: passJourney,
    c04: passJourney,
    source,
  });
  assert.ok(missingPhysicalRows.some((row) => row.status === 'OPEN'));
});

test('R3 C05: skip-physical runner is NOT_READY and cannot claim release saturation PASS', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-r3-c05-skip-'));
  const receiptPath = path.join(outDir, 'receipt.json');
  const run = spawnSync(process.execPath, [
    'scripts/ops/yalken-atlas-v5-r3-c05-release-saturation-revalidation.mjs',
    '--out',
    outDir,
    '--receipt',
    receiptPath,
    '--skip-physical',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.notEqual(run.status, 0);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.pass, false);
  assert.equal(summary.status, 'NOT_READY_R3_C05_OPEN_P0');
  assert.ok(summary.openP0.length > 0);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.pass, false);
  assert.equal(receipt.programDoneClaim, false);
});
