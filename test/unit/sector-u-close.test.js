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

test('doctor marks sector-u close tokens as ready/ok with canonical lock', () => {
  const fixtureRoot = path.join(process.cwd(), 'test', 'fixtures', 'sector-u', 'close');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-u-close-'));
  const statusPath = path.join(tmpRoot, 'SECTOR_U.json');
  const reportPath = path.join(tmpRoot, 'SECTOR_U_CLOSE_REPORT.md');
  const lockPath = path.join(tmpRoot, 'SECTOR_U_CLOSED_LOCK.json');

  fs.copyFileSync(path.join(fixtureRoot, 'sector-u-status-done.json'), statusPath);
  fs.copyFileSync(path.join(fixtureRoot, 'sector-u-close-report.md'), reportPath);
  const lockDoc = {
    schemaVersion: 'sector-u-closed-lock.v1',
    sector: 'U',
    generatedAt: '2026-02-08T13:55:00.000Z',
    generatedBy: 'test',
    artifacts: [
      { path: statusPath, sha256: sha256(statusPath) },
      { path: reportPath, sha256: sha256(reportPath) },
    ],
  };
  fs.writeFileSync(lockPath, `${JSON.stringify(lockDoc, null, 2)}\n`, 'utf8');

  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_U_STATUS_PATH: statusPath,
      SECTOR_U_CLOSE_REPORT_PATH: reportPath,
      SECTOR_U_CLOSED_LOCK_PATH: lockPath,
      SECTOR_U_FAST_DURATION_MS: '10',
    },
  });

  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('SECTOR_U_PHASE'), 'DONE');
  assert.equal(tokens.get('SECTOR_U_STATUS_OK'), '1');
  assert.equal(tokens.get('SECTOR_U_CLOSE_READY'), '1');
  assert.equal(tokens.get('SECTOR_U_CLOSE_OK'), '1');
  assert.equal(tokens.get('SECTOR_U_CLOSED_MUTATION'), '0');
  assert.deepEqual(JSON.parse(tokens.get('SECTOR_U_CLOSED_MUTATION_VIOLATIONS')), []);
});
