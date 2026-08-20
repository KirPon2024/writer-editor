'use strict';

// R2.4 P0 implementation mutation suite for the autosave generation law.
// Each mutant is a single semantic sabotage applied to a private copy of the
// module; the kill oracle replays the law's behavioral probes. A survivor
// fails this suite. Model witnesses do not count.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'autosave-generation-v1.cjs');

const MUTANTS = [
  {
    id: 'stale-ack-clears',
    find: 'return Object.freeze({ outcome: ACK_KEEP_DIRTY_STALE, capturedGeneration: captured, latestEditGeneration: latest });',
    replace: 'return Object.freeze({ outcome: ACK_CLEAR_DIRTY, capturedGeneration: captured, latestEditGeneration: latest });',
  },
  {
    id: 'unbound-ack-clears',
    find: 'return Object.freeze({ outcome: ACK_KEEP_DIRTY_UNBOUND, capturedGeneration: null, latestEditGeneration: latest });',
    replace: 'return Object.freeze({ outcome: ACK_CLEAR_DIRTY, capturedGeneration: null, latestEditGeneration: latest });',
  },
  {
    id: 'regression-guard-removed',
    find: 'if (order === REVISION_ORDER.GREATER) {',
    replace: 'if (false) {',
  },
  {
    id: 'merge-takes-minimum',
    find: 'return Math.max(latestNorm, signaledNorm);',
    replace: 'return Math.min(latestNorm, signaledNorm);',
  },
  {
    id: 'bump-not-monotonic',
    find: '      current += 1;',
    replace: '      current += 0;',
  },
];

function killOracle(module) {
  const {
    ACK_OUTCOMES,
    AutosaveGenerationError,
    createEditGenerationTracker,
    decideAutosaveAck,
    mergeSignaledGeneration,
  } = module;
  assert.equal(decideAutosaveAck({ capturedGeneration: 4, latestEditGeneration: 4 }).outcome, ACK_OUTCOMES.CLEAR_DIRTY);
  assert.equal(decideAutosaveAck({ capturedGeneration: 4, latestEditGeneration: 5 }).outcome, ACK_OUTCOMES.KEEP_DIRTY_STALE);
  assert.equal(decideAutosaveAck({ capturedGeneration: null, latestEditGeneration: 5 }).outcome, ACK_OUTCOMES.KEEP_DIRTY_UNBOUND);
  assert.throws(() => decideAutosaveAck({ capturedGeneration: 9, latestEditGeneration: 8 }), (e) => e instanceof AutosaveGenerationError && e.code === 'E_GENERATION_REGRESSION');
  assert.equal(mergeSignaledGeneration(5, 3), 5);
  assert.equal(mergeSignaledGeneration(5, 7), 7);
  const tracker = createEditGenerationTracker();
  assert.equal(tracker.bump(), 1);
  assert.equal(tracker.bump(), 2);
}

test('P0 law module: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-p0-mutant-'));
    const target = path.join(dir, 'autosave-generation-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    // R0: the module requires the revision algebra sibling; place it unmutated
    // alongside so only the oracle can kill the mutant.
    fs.copyFileSync(
      path.join(__dirname, '..', '..', 'src', 'core', 'revision-algebra-v1.cjs'),
      path.join(dir, 'revision-algebra-v1.cjs'),
    );
    delete require.cache[target];
    let killed = false;
    let detail = '';
    try {
      killOracle(require(target));
      detail = 'survived: kill oracle passed against mutated module';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  const receipt = {
    schemaVersion: 'yalken.r24-p0-mutation-receipt.v1',
    total: results.length,
    killed: results.filter((r) => r.killed).length,
    survived: survived.map((r) => r.id),
    score: results.length === 0 ? 0 : results.filter((r) => r.killed).length / results.length,
  };
  console.log(`R24_P0_MUTATION_RECEIPT=${JSON.stringify(receipt)}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
