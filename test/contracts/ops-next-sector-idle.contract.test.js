const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function loadNextSectorEvaluator() {
  const modulePath = path.resolve(process.cwd(), 'scripts/ops/next-sector-state.mjs');
  const mod = await import(pathToFileURL(modulePath).href);
  return mod.evaluateNextSectorState;
}

function makeDoneSectorStatus(sector) {
  return {
    schemaVersion: `sector-${sector.toLowerCase()}-status.v1`,
    status: 'DONE',
    phase: 'DONE',
  };
}

test('case A: all sectors DONE + NEXT_SECTOR NONE/IDLE is valid', async () => {
  const evaluateNextSectorState = await loadNextSectorEvaluator();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-next-sector-idle-a-'));

  writeJson(path.join(tmpRoot, 'SECTOR_P.json'), makeDoneSectorStatus('P'));
  writeJson(path.join(tmpRoot, 'SECTOR_W.json'), makeDoneSectorStatus('W'));
  writeJson(path.join(tmpRoot, 'SECTOR_U.json'), makeDoneSectorStatus('U'));
  writeJson(path.join(tmpRoot, 'SECTOR_M.json'), makeDoneSectorStatus('M'));
  writeJson(path.join(tmpRoot, 'NEXT_SECTOR.json'), {
    schemaVersion: 'next-sector.v1',
    id: 'NONE',
    mode: 'IDLE',
    reason: 'ALL_SECTORS_DONE',
    goTag: 'GO:NEXT_SECTOR_START',
    prereqs: ['STRICT_LIE_CLASSES_OK==1'],
  });

  const result = evaluateNextSectorState({
    statusDir: tmpRoot,
    nextSectorPath: path.join(tmpRoot, 'NEXT_SECTOR.json'),
  });

  assert.equal(result.allSectorsDone, true);
  assert.equal(result.id, 'NONE');
  assert.equal(result.mode, 'IDLE');
  assert.equal(result.reason, 'ALL_SECTORS_DONE');
  assert.equal(result.valid, true);
  assert.equal(result.failReason, '');
});

test('case B: NEXT_SECTOR points to DONE sector is invalid', async () => {
  const evaluateNextSectorState = await loadNextSectorEvaluator();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-next-sector-idle-b-'));

  writeJson(path.join(tmpRoot, 'SECTOR_P.json'), makeDoneSectorStatus('P'));
  writeJson(path.join(tmpRoot, 'SECTOR_W.json'), makeDoneSectorStatus('W'));
  writeJson(path.join(tmpRoot, 'SECTOR_U.json'), makeDoneSectorStatus('U'));
  writeJson(path.join(tmpRoot, 'SECTOR_M.json'), makeDoneSectorStatus('M'));
  writeJson(path.join(tmpRoot, 'NEXT_SECTOR.json'), {
    schemaVersion: 'next-sector.v1',
    id: 'SECTOR M',
    goTag: 'GO:NEXT_SECTOR_START',
    prereqs: ['STRICT_LIE_CLASSES_OK==1'],
  });

  const result = evaluateNextSectorState({
    statusDir: tmpRoot,
    nextSectorPath: path.join(tmpRoot, 'NEXT_SECTOR.json'),
  });

  assert.equal(result.allSectorsDone, true);
  assert.equal(result.targetSector, 'M');
  assert.equal(result.targetStatus, 'DONE');
  assert.equal(result.valid, false);
  assert.ok(result.failReason.includes('DONE'));
});
