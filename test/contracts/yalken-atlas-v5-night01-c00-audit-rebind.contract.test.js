const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function loadModule() {
  return import(pathToFileURL(path.join(
    process.cwd(),
    'scripts/ops/yalken-atlas-v5-night01-c00-audit-rebind.mjs',
  )).href);
}

test('Night01 C00: rebinding accepts only remote-verified R3 C05 rows on current origin/main', async () => {
  const mod = await loadModule();
  const result = mod.evaluateNight01C00();
  assert.equal(result.status, 'PASS_NIGHT01_C00_P0_REBOUND_TO_REMOTE_MAIN');
  assert.equal(result.pass, true);
  assert.equal(result.identity.headSha, result.identity.originMainSha);
  assert.deepEqual(result.openRows, []);
  assert.equal(result.remoteReceipt.status, 'PASS_R3_C05_REMOTE_MERGE_VERIFIED');
  const ancestry = spawnSync('git', [
    'merge-base',
    '--is-ancestor',
    result.remoteReceipt.verifiedOriginMainSha,
    result.identity.originMainSha,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(ancestry.status, 0);
  assert.equal(result.remoteReceipt.programDoneClaim, false);
  assert.equal(result.releaseTruth.notProgramDone, true);
});

test('Night01 C00: an open P0 row remains open even when other rows pass', async () => {
  const r3 = await import(pathToFileURL(path.join(
    process.cwd(),
    'scripts/ops/yalken-atlas-v5-r3-c05-release-saturation-revalidation.mjs',
  )).href);
  const source = r3.evaluateSourceInvariants();
  const passJourney = { pass: true, reportSha256: 'sha' };
  const rows = r3.buildP0Rows({
    c01: { pass: false, reportSha256: '' },
    c02: passJourney,
    c03: passJourney,
    c04: passJourney,
    source,
  });
  assert.ok(rows.some((row) => row.id === 'NIGHT01_P0_01_EXECUTABLE_DOD_ROWS' && row.status === 'OPEN'));
});
