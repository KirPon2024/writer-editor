const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CONTRACT_PATH = path.join(process.cwd(), 'docs/OPS/STATUS/XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v1.0.md');

function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

function runNode(args, extraEnv = {}) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

function parseTokenMap(text) {
  const map = new Map();
  const lines = String(text || '').split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const normalized = trimmed.startsWith('DOCTOR_TOKEN ')
      ? trimmed.slice('DOCTOR_TOKEN '.length).trim()
      : trimmed;
    const idx = normalized.indexOf('=');
    if (idx <= 0) continue;
    const key = normalized.slice(0, idx).trim();
    const value = normalized.slice(idx + 1).trim();
    if (!key) continue;
    map.set(key, value);
  }
  return map;
}

test('xplat contract: deterministic tokens and matching sha256 across emitters', () => {
  const expectedSha = sha256File(CONTRACT_PATH);

  const truth1 = runNode(['scripts/ops/extract-truth-table.mjs', '--json']);
  const truth2 = runNode(['scripts/ops/extract-truth-table.mjs', '--json']);
  assert.equal(truth1.status, 0, `truth-table run 1 failed:\n${truth1.stdout}\n${truth1.stderr}`);
  assert.equal(truth2.status, 0, `truth-table run 2 failed:\n${truth2.stdout}\n${truth2.stderr}`);

  const doc1 = JSON.parse(String(truth1.stdout || '{}'));
  const doc2 = JSON.parse(String(truth2.stdout || '{}'));
  assert.equal(doc1.XPLAT_CONTRACT_PRESENT, 1);
  assert.equal(doc1.XPLAT_CONTRACT_OK, 1);
  assert.equal(doc1.XPLAT_CONTRACT_SHA256, expectedSha);
  assert.equal(doc2.XPLAT_CONTRACT_PRESENT, 1);
  assert.equal(doc2.XPLAT_CONTRACT_OK, 1);
  assert.equal(doc2.XPLAT_CONTRACT_SHA256, expectedSha);

  const summary = runNode(['scripts/ops/emit-ops-summary.mjs']);
  assert.equal(summary.status, 0, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryMap = parseTokenMap(summary.stdout);
  assert.equal(summaryMap.get('OPS_SUMMARY_XPLAT_CONTRACT_PRESENT'), '1');
  assert.equal(summaryMap.get('OPS_SUMMARY_XPLAT_CONTRACT_OK'), '1');
  assert.equal(summaryMap.get('OPS_SUMMARY_XPLAT_CONTRACT_SHA256'), expectedSha);

  const doctor = runNode(['scripts/doctor.mjs'], { DOCTOR_MODE: 'delivery' });
  assert.equal(doctor.status, 0, `doctor failed:\n${doctor.stdout}\n${doctor.stderr}`);
  const doctorOut = String(doctor.stdout || '');
  assert.equal(doctorOut.includes('DOCTOR_WARN'), false, `unexpected DOCTOR_WARN:\n${doctorOut}`);
  const doctorMap = parseTokenMap(doctorOut);
  assert.equal(doctorMap.get('XPLAT_CONTRACT_PRESENT'), '1');
  assert.equal(doctorMap.get('XPLAT_CONTRACT_OK'), '1');
  assert.equal(doctorMap.get('XPLAT_CONTRACT_SHA256'), expectedSha);
});

test('xplat contract: sha256 is runtime-derived from selected contract path (no hardcoded mismatch)', () => {
  const baseContent = fs.readFileSync(CONTRACT_PATH, 'utf8');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xplat-contract-'));
  const tmpContractPath = path.join(tmpDir, 'XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v1.0.md');
  fs.writeFileSync(tmpContractPath, `${baseContent}\nXPLAT_DYNAMIC_TEST=1\n`, 'utf8');
  const expectedSha = sha256File(tmpContractPath);

  const env = { XPLAT_CONTRACT_PATH: tmpContractPath };
  const truth = runNode(['scripts/ops/extract-truth-table.mjs', '--json'], env);
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthDoc = JSON.parse(String(truth.stdout || '{}'));
  assert.equal(truthDoc.XPLAT_CONTRACT_PRESENT, 1);
  assert.equal(truthDoc.XPLAT_CONTRACT_OK, 1);
  assert.equal(truthDoc.XPLAT_CONTRACT_SHA256, expectedSha);

  const summary = runNode(['scripts/ops/emit-ops-summary.mjs'], env);
  assert.equal(summary.status, 0, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryMap = parseTokenMap(summary.stdout);
  assert.equal(summaryMap.get('OPS_SUMMARY_XPLAT_CONTRACT_SHA256'), expectedSha);

  const doctor = runNode(['scripts/doctor.mjs'], { ...env, DOCTOR_MODE: 'delivery' });
  assert.equal(doctor.status, 0, `doctor failed:\n${doctor.stdout}\n${doctor.stderr}`);
  const doctorMap = parseTokenMap(doctor.stdout);
  assert.equal(doctorMap.get('XPLAT_CONTRACT_SHA256'), expectedSha);
});
