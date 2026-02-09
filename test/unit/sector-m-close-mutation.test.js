const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function parseTokens(stdout) {
  const tokens = new Map();
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    tokens.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return tokens;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function makeDoneSectorMStatus() {
  const sourcePath = path.join(process.cwd(), 'docs', 'OPS', 'STATUS', 'SECTOR_M.json');
  const base = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  return {
    ...base,
    status: 'DONE',
    phase: 'DONE',
    goTag: 'GO:SECTOR_M_DONE',
    closedAt: '2026-02-09T19:29:50.000Z',
    closedBy: 'HO',
    closedLockVersion: 'v1',
  };
}

test('doctor detects sector-m closed mutation when lock hash diverges', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-m-close-mutation-'));
  const statusPath = path.join(tmpRoot, 'SECTOR_M.json');
  const reportPath = path.join(tmpRoot, 'SECTOR_M_CLOSE_REPORT.md');
  const lockPath = path.join(tmpRoot, 'SECTOR_M_CLOSED_LOCK.json');

  fs.writeFileSync(statusPath, `${JSON.stringify(makeDoneSectorMStatus(), null, 2)}\n`, 'utf8');
  fs.writeFileSync(reportPath, 'SECTOR: M\nFINAL_PHASE: M9\n', 'utf8');

  const lockDoc = {
    sector: 'M',
    status: 'CLOSED',
    lockVersion: 'v1',
    lockedAt: '2026-02-09T19:29:50.000Z',
    lockedBy: 'HO',
    hashes: {
      [statusPath]: sha256(statusPath),
      [reportPath]: sha256(reportPath),
    },
  };
  fs.writeFileSync(lockPath, `${JSON.stringify(lockDoc, null, 2)}\n`, 'utf8');

  fs.appendFileSync(reportPath, '\nmutation\n', 'utf8');

  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_M_STATUS_PATH: statusPath,
      SECTOR_M_CLOSE_REPORT_PATH: reportPath,
      SECTOR_M_CLOSED_LOCK_PATH: lockPath,
      SECTOR_U_FAST_DURATION_MS: '10',
    },
  });

  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('SECTOR_M_PHASE'), 'DONE');
  assert.equal(tokens.get('SECTOR_M_CLOSE_READY'), '1');
  assert.equal(tokens.get('SECTOR_M_CLOSE_OK'), '0');
  assert.equal(tokens.get('SECTOR_M_CLOSED_MUTATION'), '1');
  const violations = JSON.parse(tokens.get('SECTOR_M_CLOSED_MUTATION_VIOLATIONS'));
  assert.ok(Array.isArray(violations));
  assert.ok(violations.some((it) => it.includes('LOCK_HASH_MISMATCH')));
});
