const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GUARD_SCRIPT_PATH = 'scripts/guards/check-debt-consolidation-sla.mjs';
const REGISTRY_PATH = path.join(process.cwd(), 'docs/OPS/FAILSIGNALS/FAILSIGNAL_REGISTRY.json');
const FAIL_SIGNAL_CODE = 'E_DEBT_TTL_EXPIRED';
const NEGATIVE_REF = 'test/contracts/debt-ttl-expired.contract.test.js#expired-active-debt-detected';

function runDebtTtlGuard(args = []) {
  return spawnSync(process.execPath, [GUARD_SCRIPT_PATH, '--json', ...args], {
    encoding: 'utf8',
  });
}

function parseJsonOutput(result) {
  let parsed = null;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON output:\n${result.stdout}\n${result.stderr}`);
  return parsed;
}

function withDebtRegistryFixture(doc, run) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debt-ttl-expired-contract-'));
  const tmpRegistryPath = path.join(tmpDir, 'DEBT_REGISTRY.json');
  try {
    fs.writeFileSync(tmpRegistryPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    run(tmpRegistryPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('debt ttl failsignal is registered with expected negative test ref', () => {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const row = registry.failSignals.find((entry) => entry && entry.code === FAIL_SIGNAL_CODE);
  assert.ok(row, `${FAIL_SIGNAL_CODE} must exist in registry`);
  assert.equal(row.negativeTestRef, NEGATIVE_REF);
  assert.equal(row.blocking, false);
  assert.ok(row.modeMatrix && typeof row.modeMatrix === 'object');
  assert.equal(row.modeMatrix.prCore, 'advisory');
  assert.equal(row.modeMatrix.release, 'blocking');
  assert.equal(row.modeMatrix.promotion, 'blocking');
});

test('expired-active-debt-detected', () => {
  const fixture = {
    schemaVersion: 2,
    items: [
      {
        debtId: 'DEBT:TEST_EXPIRED',
        active: true,
        owner: 'OPS_CANON',
        severity: 'D2',
        createdAt: '2026-01-01',
        ttlUntil: '2000-01-01',
        exitCriteria: 'fixture',
        rollbackPlan: 'fixture',
      },
    ],
  };

  withDebtRegistryFixture(fixture, (debtRegistryPath) => {
    const result = runDebtTtlGuard(['--debt-registry-path', debtRegistryPath]);
    assert.notEqual(result.status, 0, 'expected non-zero status for expired active debt');
    const payload = parseJsonOutput(result);
    assert.equal(payload.ok, false);
    assert.equal(payload.failSignalCode, FAIL_SIGNAL_CODE);
    assert.equal(payload.failReason, 'DEBT_TTL_EXPIRED');
    assert.equal(payload.expiredCount, 1);
    assert.deepEqual(payload.expiredDebtIds, ['DEBT:TEST_EXPIRED']);
  });
});

test('debt ttl guard passes for active debt with future ttl', () => {
  const fixture = {
    schemaVersion: 2,
    items: [
      {
        debtId: 'DEBT:TEST_FUTURE',
        active: true,
        owner: 'OPS_CANON',
        severity: 'D2',
        createdAt: '2026-01-01',
        ttlUntil: '2099-01-01',
        exitCriteria: 'fixture',
        rollbackPlan: 'fixture',
      },
    ],
  };

  withDebtRegistryFixture(fixture, (debtRegistryPath) => {
    const result = runDebtTtlGuard(['--debt-registry-path', debtRegistryPath]);
    assert.equal(result.status, 0, `expected zero status:\n${result.stdout}\n${result.stderr}`);
    const payload = parseJsonOutput(result);
    assert.equal(payload.ok, true);
    assert.equal(payload.failSignalCode, '');
    assert.equal(payload.expiredCount, 0);
    assert.deepEqual(payload.expiredDebtIds, []);
  });
});
