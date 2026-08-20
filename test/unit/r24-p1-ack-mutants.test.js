'use strict';

// R2.4 P1 implementation mutation suite for the dirty admission law.
// Every mutant sabotages one acknowledgement-law conjunct; survivors fail.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'dirty-admission-v1.cjs');

const MUTANTS = [
  {
    id: 'write-failure-not-dominant',
    find: 'if (writeSucceeded !== true) {',
    replace: 'if (false) {',
  },
  {
    id: 'stale-classified-as-saved',
    find: 'if (saved !== latest) {',
    replace: 'if (false) {',
  },
  {
    id: 'unbound-not-at-risk',
    find: "return Object.freeze({ kind: ACK_KIND_AT_RISK, reason: 'UNBOUND_GENERATION', savedGeneration: null, latestEditGeneration: latest });",
    replace: "return Object.freeze({ kind: ACK_KIND_SAVED, reason: '', savedGeneration: null, latestEditGeneration: latest });",
  },
  {
    id: 'acked-regression-allowed',
    find: "if (saved < acked) throw new DirtyAdmissionError('E_SAVE_ACK_REGRESSION', `saved=${saved} acked=${acked}`);",
    replace: "if (false) throw new DirtyAdmissionError('E_SAVE_ACK_REGRESSION', `saved=${saved} acked=${acked}`);",
  },
  {
    id: 'protected-advances-coordinate',
    find: '  return Object.freeze({ latestEditGeneration: latest, ackedGeneration: acked });',
    replace: '  return Object.freeze({ latestEditGeneration: latest, ackedGeneration: latest });',
  },
  {
    id: 'derive-dirty-inverted',
    find: 'return latest > acked;',
    replace: 'return latest <= acked;',
  },
];

function killOracle(module) {
  const gen = require('../../src/core/autosave-generation-v1.cjs');
  const {
    SAVE_ACK_KINDS,
    DirtyAdmissionError,
    applySaveAck,
    classifySaveAck,
    deriveDirty,
  } = module;
  assert.equal(classifySaveAck({ writeSucceeded: false, ackOutcome: gen.ACK_OUTCOMES.CLEAR_DIRTY, savedGeneration: 3, latestEditGeneration: 3 }).kind, SAVE_ACK_KINDS.AT_RISK);
  assert.equal(classifySaveAck({ writeSucceeded: true, ackOutcome: gen.ACK_OUTCOMES.CLEAR_DIRTY, savedGeneration: 3, latestEditGeneration: 4 }).kind, SAVE_ACK_KINDS.PROTECTED);
  assert.equal(classifySaveAck({ writeSucceeded: true, ackOutcome: gen.ACK_OUTCOMES.KEEP_DIRTY_UNBOUND, savedGeneration: null, latestEditGeneration: 4 }).kind, SAVE_ACK_KINDS.AT_RISK);
  assert.equal(classifySaveAck({ writeSucceeded: true, ackOutcome: gen.ACK_OUTCOMES.CLEAR_DIRTY, savedGeneration: 4, latestEditGeneration: 4 }).kind, SAVE_ACK_KINDS.SAVED);
  assert.throws(() => applySaveAck({ latestEditGeneration: 5, ackedGeneration: 6 }, { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: 5 }), (e) => e instanceof DirtyAdmissionError && e.code === 'E_SAVE_ACK_REGRESSION');
  const kept = applySaveAck({ latestEditGeneration: 5, ackedGeneration: 2 }, { kind: SAVE_ACK_KINDS.PROTECTED, savedGeneration: 4 });
  assert.equal(kept.ackedGeneration, 2);
  assert.equal(deriveDirty({ latestEditGeneration: 5, ackedGeneration: 2 }), true);
  assert.equal(deriveDirty({ latestEditGeneration: 5, ackedGeneration: 5 }), false);
}

test('P1 admission law module: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p1-mutant-'));
    const target = path.join(dir, 'dirty-admission-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    // The module requires its sibling generation law; place the unmutated
    // sibling alongside so only the oracle can kill the mutant.
    fs.copyFileSync(
      path.join(__dirname, '..', '..', 'src', 'core', 'autosave-generation-v1.cjs'),
      path.join(dir, 'autosave-generation-v1.cjs'),
    );
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
  console.log(`R24_P1_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
