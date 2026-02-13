const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = path.join(process.cwd(), 'scripts/ops/governance-approval-state.mjs');
const REPO_APPROVALS_PATH = path.join(
  process.cwd(),
  'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json',
);

function runState(repoRoot, approvalsPath) {
  return spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--json', '--repo-root', repoRoot, '--approvals-path', approvalsPath],
    {
      encoding: 'utf8',
    },
  );
}

function parseJsonStdout(result) {
  let payload = null;
  assert.doesNotThrow(() => {
    payload = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON output:\n${result.stdout}\n${result.stderr}`);
  return payload;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('governance approval state: repository registry is valid', () => {
  const result = runState(process.cwd(), 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json');
  assert.equal(result.status, 0, `expected pass:\n${result.stdout}\n${result.stderr}`);
  const payload = parseJsonStdout(result);
  assert.equal(payload.tokens.GOVERNANCE_APPROVAL_REGISTRY_VALID_OK, 1);
  assert.ok(Number(payload.approvals_count) >= 0);
});

test('governance approval state: registry sha256 matches raw file bytes for real entry', () => {
  const parsed = JSON.parse(fs.readFileSync(REPO_APPROVALS_PATH, 'utf8'));
  assert.ok(Array.isArray(parsed.approvals), 'approvals array must exist');
  assert.ok(parsed.approvals.length > 0, 'approvals array must be non-empty');

  const entry = parsed.approvals[0];
  const entryPath = path.join(process.cwd(), String(entry.filePath || ''));
  const rawBytes = fs.readFileSync(entryPath);
  const actualSha = crypto.createHash('sha256').update(rawBytes).digest('hex');
  assert.equal(actualSha, String(entry.sha256 || '').toLowerCase(), 'sha must match raw bytes hash');
});

test('governance approval state: in-memory tampered sha mismatches raw bytes hash', () => {
  const parsed = JSON.parse(fs.readFileSync(REPO_APPROVALS_PATH, 'utf8'));
  assert.ok(Array.isArray(parsed.approvals), 'approvals array must exist');
  assert.ok(parsed.approvals.length > 0, 'approvals array must be non-empty');

  const entry = parsed.approvals[0];
  const entryPath = path.join(process.cwd(), String(entry.filePath || ''));
  const actualSha = sha256File(entryPath);
  const tamperedSha = String(actualSha).replace(/.$/u, actualSha.endsWith('0') ? '1' : '0');
  assert.notEqual(tamperedSha, actualSha, 'tampered sha should differ from actual raw bytes hash');
});

test('governance approval state: hash mismatch fails with canonical reason', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-approval-state-'));
  const targetRelPath = 'scripts/ops/test-state.mjs';
  const targetAbsPath = path.join(repoRoot, targetRelPath);
  fs.mkdirSync(path.dirname(targetAbsPath), { recursive: true });
  fs.writeFileSync(targetAbsPath, 'export const ok = true;\n', 'utf8');

  const approvalsRelPath = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
  const approvalsAbsPath = path.join(repoRoot, approvalsRelPath);
  fs.mkdirSync(path.dirname(approvalsAbsPath), { recursive: true });
  fs.writeFileSync(approvalsAbsPath, `${JSON.stringify({
    version: 'v1.0',
    approvals: [
      {
        filePath: targetRelPath,
        sha256: sha256File(targetAbsPath).replace(/.$/u, '0'),
        approvedBy: 'contract-test',
        approvedAtUtc: '2026-02-13T00:00:00.000Z',
        rationale: 'negative mismatch fixture',
      },
    ],
  }, null, 2)}\n`, 'utf8');

  const result = runState(repoRoot, approvalsRelPath);
  const payload = parseJsonStdout(result);
  fs.rmSync(repoRoot, { recursive: true, force: true });

  assert.notEqual(result.status, 0, 'expected hash mismatch failure');
  assert.equal(payload.tokens.GOVERNANCE_APPROVAL_REGISTRY_VALID_OK, 0);
  assert.equal(payload.failReason, 'E_GOVERNANCE_APPROVAL_INVALID');
});
