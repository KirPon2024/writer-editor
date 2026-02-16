const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    modulePromise = import(pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/dependency-remediation-policy-state.mjs'),
    ).href);
  }
  return modulePromise;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('dependency remediation policy: positive baseline is valid', async () => {
  const { evaluateDependencyRemediationPolicyState } = await loadModule();
  const state = evaluateDependencyRemediationPolicyState();
  assert.equal(state.ok, true, JSON.stringify(state, null, 2));
  assert.equal(state.DEPENDENCY_REMEDIATION_POLICY_OK, 1);
  assert.equal(state.failSignal, '');
});

test('dependency remediation policy: missing reachable critical/high rule fails with E_DEP_REMEDIATION_POLICY_INVALID', async () => {
  const { evaluateDependencyRemediationPolicyState } = await loadModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-policy-'));
  try {
    const filePath = path.join(tmpDir, 'policy.json');
    writeJson(filePath, {
      schemaVersion: 'v3.12',
      policyId: 'DEPENDENCY_REMEDIATION_POLICY_v3_12',
      severityClasses: ['critical', 'high', 'moderate', 'low'],
      reachabilityClasses: ['reachable', 'nonReachable', 'unknown'],
      environmentClasses: ['prod', 'dev'],
      actionRules: [
        {
          id: 'only-non-reachable',
          when: { reachability: 'nonReachable' },
          action: { exceptionAllowed: true, exceptionTtlRequired: true },
        },
      ],
      exceptionRequiredFields: ['owner', 'expiryUtc', 'mitigationPlan'],
      auditLinkage: { artifactsGlob: 'docs/AUDIT/*', required: true },
      modeMatrix: { prCore: 'advisory', release: 'advisory', promotion: 'blocking' },
    });
    const state = evaluateDependencyRemediationPolicyState({ policyPath: filePath });
    assert.equal(state.ok, false);
    assert.equal(state.DEPENDENCY_REMEDIATION_POLICY_OK, 0);
    assert.equal(state.failSignal, 'E_DEP_REMEDIATION_POLICY_INVALID');
    assert.equal(state.failures.includes('REACHABLE_CRITICAL_HIGH_RULE_MISSING'), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('dependency remediation policy: release mode stays advisory when invalid', async () => {
  const { evaluateDependencyRemediationPolicyState } = await loadModule();
  const state = evaluateDependencyRemediationPolicyState({
    policyPath: 'docs/OPS/STATUS/DOES_NOT_EXIST.json',
    gateTier: 'release',
  });
  assert.equal(state.ok, false);
  assert.equal(state.mode, 'advisory');
  assert.equal(state.promotionBlocking, 0);
  assert.equal(state.releaseBlocking, 0);
});

test('dependency remediation policy: promotion mode becomes blocking when invalid', async () => {
  const { evaluateDependencyRemediationPolicyState } = await loadModule();
  const state = evaluateDependencyRemediationPolicyState({
    policyPath: 'docs/OPS/STATUS/DOES_NOT_EXIST.json',
    gateTier: 'promotion',
  });
  assert.equal(state.ok, false);
  assert.equal(state.mode, 'blocking');
  assert.equal(state.promotionBlocking, 1);
});

test('dependency remediation policy: deterministic output for repeated runs', async () => {
  const { evaluateDependencyRemediationPolicyState } = await loadModule();
  const runA = evaluateDependencyRemediationPolicyState({ gateTier: 'promotion' });
  const runB = evaluateDependencyRemediationPolicyState({ gateTier: 'promotion' });
  assert.deepEqual(runA, runB);
});

