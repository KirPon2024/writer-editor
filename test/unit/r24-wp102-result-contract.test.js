'use strict';

// R2.4 WP-102 result/error contract: every declared refusal normalizes to
// one canonical machine code; a refusal without a code is a typed throw,
// never a silent pass.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  CommandProtocolError,
  normalizeProtocolResult,
} = require(path.join(__dirname, '..', '..', 'src', 'core', 'command-protocol-v1.cjs'));

test('success results pass through unchanged', () => {
  const ok = { ok: true, value: { written: true } };
  assert.equal(normalizeProtocolResult(ok), ok);
});

test('refusals normalize to the canonical code with reason preserved', () => {
  const fromCode = normalizeProtocolResult({ ok: false, code: 'E_X', reason: 'BECAUSE' });
  assert.equal(fromCode.code, 'E_X');
  assert.equal(fromCode.reason, 'BECAUSE');
  assert.equal(Object.isFrozen(fromCode), true);

  const fromStringError = normalizeProtocolResult({ ok: false, error: 'COMMAND_EXECUTION_FAILED' });
  assert.equal(fromStringError.code, 'COMMAND_EXECUTION_FAILED');
  assert.equal(fromStringError.reason, 'COMMAND_EXECUTION_FAILED');

  const fromObjectError = normalizeProtocolResult({ ok: false, error: { code: 'E_OBJECT', reason: 'DETAIL' } });
  assert.equal(fromObjectError.code, 'E_OBJECT');
  assert.equal(fromObjectError.reason, 'DETAIL');

  const fromReasonOnly = normalizeProtocolResult({ ok: false, reason: 'ROUTE_UNSUPPORTED' });
  assert.equal(fromReasonOnly.code, 'ROUTE_UNSUPPORTED');

  const legacyFields = normalizeProtocolResult({ ok: false, code: 'E_KEEP', error: 'legacy-string', extra: 1 });
  assert.equal(legacyFields.error, 'legacy-string', 'legacy fields stay intact for existing consumers');
  assert.equal(legacyFields.extra, 1);
});

test('a refusal without any machine code is a typed throw, never a silent pass', () => {
  for (const bad of [
    { ok: false },
    { ok: false, code: '' },
    { ok: false, error: {}, reason: '' },
  ]) {
    assert.throws(
      () => normalizeProtocolResult(bad),
      (e) => e instanceof CommandProtocolError && e.code === 'E_PROTOCOL_REFUSAL_CODE_MISSING',
      JSON.stringify(bad),
    );
  }
});

test('non-object results are a typed throw; free-form payloads without ok pass through', () => {
  for (const bad of [null, undefined, 42, 'nope', []]) {
    assert.throws(() => normalizeProtocolResult(bad), (e) => e.code === 'E_PROTOCOL_RESULT_SHAPE');
  }
  const freeForm = { streamed: true, chunks: 3 };
  assert.equal(normalizeProtocolResult(freeForm), freeForm, 'payloads without an ok flag are not declared results');
});

test('bridge-shaped refusals all carry canonical codes', () => {
  // Every refusal shape the three bridges produce today normalizes exactly.
  const shapes = [
    { ok: false, reason: 'COMMAND_ROUTE_UNSUPPORTED' },
    { ok: false, reason: 'COMMAND_ID_NOT_ALLOWED' },
    { ok: false, reason: 'ENVELOPE_VERSION_UNSUPPORTED' },
    { ok: false, error: 'SIGNAL_ID_NOT_ALLOWED' },
    { ok: false, code: 'E_COMMAND_DISABLED_FOR_ENTITLEMENT', reason: 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE', commandId: 'cmd.project.review.switchMode' },
  ];
  for (const shape of shapes) {
    const normalized = normalizeProtocolResult(shape);
    assert.equal(typeof normalized.code, 'string', JSON.stringify(shape));
    assert.equal(normalized.code.length > 0, true);
    assert.equal(normalized.ok, false);
  }
});
