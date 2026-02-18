const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const LAW_PATH_CANON_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'LAW_PATH_CANON.json');
const LAW_CHECK_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'check-law-path-canon.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runLawPathCheck(mode) {
  return spawnSync(process.execPath, [LAW_CHECK_SCRIPT_PATH, '--json', `--mode=${mode}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

test('law path canon exists and points to active canonical law file', () => {
  assert.equal(fs.existsSync(LAW_PATH_CANON_PATH), true, 'missing LAW_PATH_CANON.json');
  assert.equal(fs.existsSync(LAW_CHECK_SCRIPT_PATH), true, 'missing check-law-path-canon.mjs');

  const canon = readJson(LAW_PATH_CANON_PATH);
  assert.equal(canon.version, 1);
  assert.equal(canon.lawDocId, 'XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT');
  assert.equal(canon.status, 'ACTIVE_CANON');
  assert.equal(
    canon.lawDocPath,
    'docs/OPS/STATUS/XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v3.13a-final.md',
  );

  const lawAbsPath = path.join(REPO_ROOT, canon.lawDocPath);
  assert.equal(fs.existsSync(lawAbsPath), true, `law path from canon must exist: ${canon.lawDocPath}`);

  const lawText = fs.readFileSync(lawAbsPath, 'utf8');
  assert.ok(/\bSTATUS:\s*ACTIVE_CANON\b/u.test(lawText), 'active law must declare STATUS: ACTIVE_CANON');
  assert.ok(/\bTRANSITION_EXIT:\s*CLOSED\b/u.test(lawText), 'active law must declare transition closure');
});

test('law path canon check passes in release and promotion mode for active path', () => {
  const release = runLawPathCheck('release');
  assert.equal(release.status, 0, `${release.stdout}\n${release.stderr}`);
  const releasePayload = JSON.parse(String(release.stdout || '{}'));
  assert.equal(releasePayload.result, 'PASS');
  assert.equal(releasePayload.lawDocFound, true);

  const promotion = runLawPathCheck('promotion');
  assert.equal(promotion.status, 0, `${promotion.stdout}\n${promotion.stderr}`);
  const promotionPayload = JSON.parse(String(promotion.stdout || '{}'));
  assert.equal(promotionPayload.result, 'PASS');
  assert.equal(promotionPayload.lawDocFound, true);
});
