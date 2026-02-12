const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function parseTokenMap(text) {
  const out = new Map();
  for (const raw of String(text || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    out.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return out;
}

test('critical claim matrix is machine-readable and valid', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/critical-claim-matrix-state.mjs'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `critical-claim-matrix-state failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokenMap(result.stdout);
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_PRESENT'), '1');
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_OK'), '1');
  assert.ok(Number(tokens.get('CRITICAL_CLAIM_MATRIX_CLAIMS_COUNT')) >= 1);
});

test('critical claim matrix validator accepts PROOFHOOK namespace tokens', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-claim-matrix-'));
  const matrixPath = path.join(tmpDir, 'matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify({
    schemaVersion: 1,
    claims: [
      {
        claimId: 'PROOFHOOK_INTEGRITY',
        requiredToken: 'PROOFHOOK_INTEGRITY_OK',
        proofHook: 'node scripts/ops/proofhook-integrity-state.mjs --json',
        failSignal: 'E_PROOFHOOK_TAMPER_DETECTED',
        blocking: true,
        sourceBinding: 'ops_script',
      },
    ],
  }, null, 2));

  const result = spawnSync(
    process.execPath,
    ['scripts/ops/critical-claim-matrix-state.mjs', '--matrix-path', matrixPath],
    { encoding: 'utf8' },
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.equal(result.status, 0, `validator rejected PROOFHOOK namespace:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokenMap(result.stdout);
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_OK'), '1');
});

test('critical claim matrix validator still rejects unknown namespaces', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-claim-matrix-'));
  const matrixPath = path.join(tmpDir, 'matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify({
    schemaVersion: 1,
    claims: [
      {
        claimId: 'UNKNOWN_NAMESPACE',
        requiredToken: 'FOO_NAMESPACE_OK',
        proofHook: 'node scripts/ops/failsignal-registry-state.mjs --json',
        failSignal: 'E_UNKNOWN_NAMESPACE',
        blocking: true,
        sourceBinding: 'ops_script',
      },
    ],
  }, null, 2));

  const result = spawnSync(
    process.execPath,
    ['scripts/ops/critical-claim-matrix-state.mjs', '--matrix-path', matrixPath],
    { encoding: 'utf8' },
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.notEqual(result.status, 0);
  const tokens = parseTokenMap(result.stdout);
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_OK'), '0');
  assert.match(String(tokens.get('FAIL_REASON') || ''), /^CRITICAL_CLAIM_MATRIX_TOKEN_NAMESPACE_INVALID_/u);
});
