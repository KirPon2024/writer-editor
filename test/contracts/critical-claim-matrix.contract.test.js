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

test('critical claim matrix includes release-tier blocking claim for proofhook integrity', () => {
  const matrixPath = path.join(process.cwd(), 'docs/OPS/CLAIMS/CRITICAL_CLAIM_MATRIX.json');
  const doc = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  const claim = Array.isArray(doc.claims)
    ? doc.claims.find((item) => item && item.claimId === 'PROOFHOOK_INTEGRITY')
    : null;
  assert.ok(claim, 'PROOFHOOK_INTEGRITY claim is missing');
  assert.equal(claim.requiredToken, 'PROOFHOOK_INTEGRITY_OK');
  assert.equal(claim.blocking, true);
  assert.equal(claim.gateTier, 'release');
  assert.equal(claim.proofHook, 'node scripts/ops/proofhook-integrity-state.mjs --json');
  assert.equal(claim.failSignal, 'E_PROOFHOOK_TAMPER_DETECTED');
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

test('critical claim matrix validator accepts CONDITIONAL namespace tokens', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-claim-matrix-'));
  const matrixPath = path.join(tmpDir, 'matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify({
    schemaVersion: 1,
    claims: [
      {
        claimId: 'CONDITIONAL_GATES_BOUND',
        requiredToken: 'CONDITIONAL_GATES_BOUND_OK',
        proofHook: 'node scripts/ops/conditional-gates-state.mjs --json',
        failSignal: 'E_CONDITIONAL_GATE_MISAPPLIED',
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

  assert.equal(result.status, 0, `validator rejected CONDITIONAL namespace:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokenMap(result.stdout);
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_OK'), '1');
});

test('critical claim matrix validator accepts TOKEN_CATALOG namespace tokens', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-claim-matrix-'));
  const matrixPath = path.join(tmpDir, 'matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify({
    schemaVersion: 1,
    claims: [
      {
        claimId: 'TOKEN_CATALOG_VALID',
        requiredToken: 'TOKEN_CATALOG_VALID_OK',
        proofHook: 'node scripts/ops/token-catalog-state.mjs --json',
        failSignal: 'E_TOKEN_CATALOG_INVALID',
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

  assert.equal(result.status, 0, `validator rejected TOKEN_CATALOG namespace:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokenMap(result.stdout);
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_OK'), '1');
});

test('critical claim matrix validator accepts VERIFY namespace tokens', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-claim-matrix-'));
  const matrixPath = path.join(tmpDir, 'matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify({
    schemaVersion: 1,
    claims: [
      {
        claimId: 'VERIFY_ORCHESTRATOR_CANON',
        requiredToken: 'VERIFY_ORCHESTRATOR_CANON_OK',
        proofHook: 'node scripts/ops/verify-orchestrator-canon-state.mjs --json',
        failSignal: 'E_VERIFY_ORCHESTRATOR_MISMATCH',
        blocking: false,
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

  assert.equal(result.status, 0, `validator rejected VERIFY namespace:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokenMap(result.stdout);
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_OK'), '1');
});

test('critical claim matrix validator accepts ORIGIN namespace tokens', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-claim-matrix-'));
  const matrixPath = path.join(tmpDir, 'matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify({
    schemaVersion: 1,
    claims: [
      {
        claimId: 'ORIGIN_SMOKE',
        requiredToken: 'ORIGIN_SMOKE_OK',
        proofHook: 'node scripts/ops/origin-smoke-state.mjs --json',
        failSignal: 'E_NETWORK_ORIGIN_UNAVAILABLE',
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

  assert.equal(result.status, 0, `validator rejected ORIGIN namespace:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokenMap(result.stdout);
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_OK'), '1');
});

test('critical claim matrix validator accepts ATTESTATION namespace tokens', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-claim-matrix-'));
  const matrixPath = path.join(tmpDir, 'matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify({
    schemaVersion: 1,
    claims: [
      {
        claimId: 'ATTESTATION_SIGNATURE',
        requiredToken: 'ATTESTATION_SIGNATURE_OK',
        proofHook: 'node scripts/ops/attestation-signature-state.mjs --json',
        failSignal: 'E_ATTESTATION_SIGNATURE_INVALID',
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

  assert.equal(result.status, 0, `validator rejected ATTESTATION namespace:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokenMap(result.stdout);
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_OK'), '1');
});

test('critical claim matrix validator accepts LEGACY namespace tokens', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-claim-matrix-'));
  const matrixPath = path.join(tmpDir, 'matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify({
    schemaVersion: 1,
    claims: [
      {
        claimId: 'LEGACY_VERIFY_SUNSET_GUARD',
        requiredToken: 'LEGACY_VERIFY_SUNSET_GUARD_OK',
        proofHook: 'node scripts/ops/legacy-verify-sunset-guard-state.mjs --json',
        failSignal: 'E_LEGACY_VERIFY_PATH_STILL_PASSING',
        blocking: false,
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

  assert.equal(result.status, 0, `validator rejected LEGACY namespace:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokenMap(result.stdout);
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_OK'), '1');
});

test('critical claim matrix validator accepts REQUIRED_SET namespace tokens', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-claim-matrix-'));
  const matrixPath = path.join(tmpDir, 'matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify({
    schemaVersion: 1,
    claims: [
      {
        claimId: 'REQUIRED_SET_NO_TARGET',
        requiredToken: 'REQUIRED_SET_NO_TARGET_OK',
        proofHook: 'node scripts/ops/required-set-no-target-state.mjs --json',
        failSignal: 'E_REQUIRED_SET_CONTAINS_TARGET',
        blocking: true,
        sourceBinding: 'ops_script+contract_test',
      },
    ],
  }, null, 2));

  const result = spawnSync(
    process.execPath,
    ['scripts/ops/critical-claim-matrix-state.mjs', '--matrix-path', matrixPath],
    { encoding: 'utf8' },
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.equal(result.status, 0, `validator rejected REQUIRED_SET namespace:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokenMap(result.stdout);
  assert.equal(tokens.get('CRITICAL_CLAIM_MATRIX_OK'), '1');
});

test('critical claim matrix validator rejects unknown gate tiers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-claim-matrix-'));
  const matrixPath = path.join(tmpDir, 'matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify({
    schemaVersion: 1,
    claims: [
      {
        claimId: 'PROOFHOOK_GATE_TIER_INVALID',
        requiredToken: 'PROOFHOOK_INTEGRITY_OK',
        proofHook: 'node scripts/ops/proofhook-integrity-state.mjs --json',
        failSignal: 'E_PROOFHOOK_TAMPER_DETECTED',
        blocking: true,
        gateTier: 'ship',
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
  assert.match(String(tokens.get('FAIL_REASON') || ''), /^CRITICAL_CLAIM_MATRIX_GATE_TIER_INVALID_/u);
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
