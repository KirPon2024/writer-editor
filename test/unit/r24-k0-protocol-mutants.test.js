'use strict';

// R2.4 K0 implementation mutation suite for the command protocol law.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'command-protocol-v1.cjs');

const MUTANTS = [
  {
    id: 'refusal-code-missing-tolerated',
    find: "if (code === null) throw new CommandProtocolError('E_PROTOCOL_REFUSAL_CODE_MISSING');",
    replace: "if (false) throw new CommandProtocolError('E_PROTOCOL_REFUSAL_CODE_MISSING');",
  },
  {
    id: 'legacy-fields-dropped',
    find: 'return Object.freeze({ ...result, ok: false, code, reason });',
    replace: 'return Object.freeze({ ok: false, code, reason });',
  },
  {
    id: 'query-bridge-misclassified',
    find: "OPERATION_CLASSES.QUERY, idField: 'queryId'",
    replace: "OPERATION_CLASSES.COMMAND, idField: 'queryId'",
  },
  {
    id: 'shape-check-removed',
    find: "if (!isObjectRecord(result)) throw new CommandProtocolError('E_PROTOCOL_RESULT_SHAPE');",
    replace: "if (false) throw new CommandProtocolError('E_PROTOCOL_RESULT_SHAPE');",
  },
  {
    id: 'payload-passthrough-tolerance-removed',
    find: 'if (result.ok !== false) return result;',
    replace: 'if (false) return result;',
  },
];

function killOracle(module) {
  const {
    OPERATION_CLASSES,
    CommandProtocolError,
    bridgeOperationClass,
    normalizeProtocolResult,
  } = module;
  assert.equal(bridgeOperationClass('ui:workspace-query-bridge'), OPERATION_CLASSES.QUERY);
  assert.equal(bridgeOperationClass('ui:command-bridge'), OPERATION_CLASSES.COMMAND);
  const ok = { ok: true, value: 1 };
  assert.equal(normalizeProtocolResult(ok), ok);
  const payloadOnly = { data: [1] };
  assert.equal(normalizeProtocolResult(payloadOnly), payloadOnly);
  const legacy = normalizeProtocolResult({ ok: false, error: { code: 'E_X', reason: 'r' } });
  assert.equal(legacy.code, 'E_X');
  assert.deepEqual(legacy.error, { code: 'E_X', reason: 'r' });
  assert.throws(() => normalizeProtocolResult({ ok: false }), (e) => e.code === 'E_PROTOCOL_REFUSAL_CODE_MISSING');
  assert.throws(() => normalizeProtocolResult(null), (e) => e instanceof CommandProtocolError && e.code === 'E_PROTOCOL_RESULT_SHAPE');
}

test('K0 protocol law module: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-k0-mutant-'));
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
  console.log(`R24_K0_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
