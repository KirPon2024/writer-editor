'use strict';

// R2.4 WP-102 implementation mutation suite for the command protocol
// contract (carried by the WP-104 contour: closes the WP-102
// IMPLEMENTATION_MUTANTS evidence deficit found by the falsification audit).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'command-protocol-v1.cjs');

const MUTANTS = [
  {
    id: 'refusal-without-code-tolerated',
    find: "  if (code === null) throw new CommandProtocolError('E_PROTOCOL_REFUSAL_CODE_MISSING');",
    replace: '  if (code === null) return Object.freeze({ ...result, ok: false });',
  },
  {
    id: 'unknown-channel-admitted',
    find: "  if (!entry) throw new CommandProtocolError('E_PROTOCOL_CHANNEL_UNKNOWN', String(channel));",
    replace: "  if (!entry) return 'COMMAND';",
  },
  {
    id: 'result-shape-check-removed',
    find: "  if (!isObjectRecord(result)) throw new CommandProtocolError('E_PROTOCOL_RESULT_SHAPE');",
    replace: '  if (false) { throw new CommandProtocolError(\'E_PROTOCOL_RESULT_SHAPE\'); }',
  },
  {
    id: 'success-copied-not-passthrough',
    find: '  if (result.ok === true) return result;',
    replace: '  if (result.ok === true) return Object.freeze({ ...result });',
  },
];

function killOracle(module) {
  const { normalizeProtocolResult, bridgeOperationClass, CommandProtocolError } = module;
  assert.throws(() => normalizeProtocolResult({ ok: false }), (e) => e instanceof CommandProtocolError && e.code === 'E_PROTOCOL_REFUSAL_CODE_MISSING');
  assert.throws(() => bridgeOperationClass('ui:never-heard-of-it'), (e) => e.code === 'E_PROTOCOL_CHANNEL_UNKNOWN');
  assert.throws(() => normalizeProtocolResult(null), (e) => e.code === 'E_PROTOCOL_RESULT_SHAPE');
  const ok = { ok: true, value: 1 };
  assert.equal(normalizeProtocolResult(ok), ok, 'success passes through by identity');
  const refusal = normalizeProtocolResult({ ok: false, reason: 'ROUTE_UNSUPPORTED' });
  assert.equal(refusal.code, 'ROUTE_UNSUPPORTED');
}

test('WP-102 protocol contract: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp102-mutant-'));
    const target = path.join(dir, 'command-protocol-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      killOracle(require(target));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_WP102_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
