const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('runtime and core invariants are implemented and bound to canonical audit checks', () => {
  const registry = readJson('docs/OPS/INVARIANTS_REGISTRY.json');
  const audit = readJson('docs/OPS/AUDIT_CHECKS.json');
  const auditSet = new Set(Array.isArray(audit.checkIds) ? audit.checkIds : []);
  const items = Array.isArray(registry.items) ? registry.items : [];

  const active = items.filter((it) => it && typeof it === 'object' && it.enforcementMode !== 'off');
  assert.ok(active.length >= 1, 'expected non-empty active invariants');

  for (const it of active) {
    assert.equal(it.maturity, 'implemented', `active invariant must be implemented: ${it.invariantId}`);
    assert.equal(typeof it.checkId, 'string', `active invariant checkId must be string: ${it.invariantId}`);
    assert.ok(it.checkId.length > 0, `active invariant checkId is required: ${it.invariantId}`);
    assert.equal(auditSet.has(it.checkId), true, `checkId must exist in canonical audit list: ${it.invariantId}`);
  }

  const corePurity = active.find((it) => it.invariantId === 'CORE_PURITY_NO_EFFECT_TOKENS');
  assert.ok(corePurity, 'CORE_PURITY_NO_EFFECT_TOKENS must be active');
  assert.equal(corePurity.enforcementMode, 'hard');

  const contourRuntime = active
    .filter((it) => typeof it.invariantId === 'string' && it.invariantId.startsWith('C_RUNTIME_'))
    .map((it) => it.invariantId)
    .sort();

  assert.deepEqual(
    contourRuntime,
    [
      'C_RUNTIME_NO_BYPASS_CORE',
      'C_RUNTIME_SINGLE_WRITER_ORDERING_KEY',
      'C_RUNTIME_TRACE_STRUCTURED_DIAGNOSTICS',
    ],
  );
});
