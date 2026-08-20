'use strict';

// R2.4 S1 implementation mutation suite for the IPC envelope law.
// Every mutant sabotages one envelope conjunct; survivors fail this suite.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'ipc-envelope-v1.cjs');

const MUTANTS = [
  {
    id: 'version-check-removed',
    find: 'if (envelope.v !== ENVELOPE_VERSION) return { ok: false, code: \'E_ENVELOPE_VERSION\' };',
    replace: "if (false) return { ok: false, code: 'E_ENVELOPE_VERSION' };",
  },
  {
    id: 'unknown-key-allowed',
    find: "if (!keySet.includes(key)) return { ok: false, code: 'E_ENVELOPE_KEY_UNKNOWN', detail: key };",
    replace: "if (false) return { ok: false, code: 'E_ENVELOPE_KEY_UNKNOWN', detail: key };",
  },
  {
    id: 'correlation-ignored',
    find: "if (typeof envelope.correlationId !== 'string' || envelope.correlationId.length < 8 || envelope.correlationId.length > 128) {",
    replace: 'if (false) {',
  },
  {
    id: 'identity-missing-ignored',
    find: 'if (typeof envelope[idField] !== \'string\' || envelope[idField].length === 0) {',
    replace: 'if (false) {',
  },
  {
    id: 'depth-limit-removed',
    find: "if (depth > maxDepth) return { code: 'E_ENVELOPE_DEPTH' };",
    replace: "if (false) return { code: 'E_ENVELOPE_DEPTH' };",
  },
  {
    id: 'bytes-limit-removed',
    find: "if (size > maxBytes) return { ok: false, code: 'E_ENVELOPE_BYTES', detail: `${size}>${maxBytes}` };",
    replace: "if (false) return { ok: false, code: 'E_ENVELOPE_BYTES', detail: `${size}>${maxBytes}` };",
  },
];

const CHANNEL = 'ui:command-bridge';

function killOracle(module) {
  const { createEnvelope, validateIpcEnvelope } = module;
  const good = createEnvelope(CHANNEL, 'cmd.project.new', { a: 1 });
  assert.equal(validateIpcEnvelope(good, CHANNEL).ok, true);
  assert.equal(validateIpcEnvelope({ ...good, v: 2 }, CHANNEL).code, 'E_ENVELOPE_VERSION');
  assert.equal(validateIpcEnvelope({ ...good, evil: 1 }, CHANNEL).code, 'E_ENVELOPE_KEY_UNKNOWN');
  assert.equal(validateIpcEnvelope({ ...good, correlationId: 'x' }, CHANNEL).code, 'E_ENVELOPE_CORRELATION_ID');
  const noId = { ...good };
  delete noId.commandId;
  assert.equal(validateIpcEnvelope(noId, CHANNEL).code, 'E_ENVELOPE_IDENTITY_MISSING');
  const deepPayload = {};
  let cursor = deepPayload;
  for (let i = 0; i < 12; i += 1) { cursor.next = {}; cursor = cursor.next; }
  assert.equal(validateIpcEnvelope(createEnvelope(CHANNEL, 'cmd.project.new', deepPayload), CHANNEL).code, 'E_ENVELOPE_DEPTH');
  const big = { data: 'x'.repeat(2 * 1024 * 1024) };
  assert.equal(validateIpcEnvelope(createEnvelope(CHANNEL, 'cmd.project.new', big), CHANNEL).code, 'E_ENVELOPE_BYTES');
}

test('S1 envelope law module: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-s1-mutant-'));
    const target = path.join(dir, 'ipc-envelope-v1.cjs');
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
  console.log(`R24_S1_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
