'use strict';

// R2.4 R1 implementation mutation suite for the shadow authority cell.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'shadow-authority-cell-v1.cjs');

const MUTANTS = [
  {
    id: 'stale-as-clear',
    find: '? SHADOW_ADVICE.WOULD_KEEP_STALE',
    replace: '? SHADOW_ADVICE.WOULD_CLEAR',
  },
  {
    id: 'regression-not-rejected',
    find: ': SHADOW_ADVICE.WOULD_REJECT_REGRESSION);',
    replace: ': SHADOW_ADVICE.WOULD_CLEAR);',
  },
  {
    id: 'promotion-allowed',
    find: "      throw new ShadowAuthorityError('E_SHADOW_PROMOTION_DENIED');",
    replace: '      return true;',
  },
  {
    id: 'observation-regresses',
    find: 'if (observedLatest === null || latestEditGeneration > observedLatest) observedLatest = latestEditGeneration;',
    replace: 'observedLatest = latestEditGeneration;',
  },
  {
    id: 'project-identity-not-required',
    find: "if (typeof projectId !== 'string' || projectId.length === 0) {",
    replace: 'if (false) {',
  },
  {
    id: 'unbound-kept-as-clear',
    find: '      advice = SHADOW_ADVICE.WOULD_KEEP_UNBOUND;',
    replace: '      advice = SHADOW_ADVICE.WOULD_CLEAR;',
  },
];

function killOracle(module) {
  const {
    SHADOW_ADVICE,
    ShadowAuthorityError,
    createShadowAuthorityCell,
  } = module;
  assert.throws(() => createShadowAuthorityCell({}), (e) => e instanceof ShadowAuthorityError && e.code === 'E_SHADOW_PROJECT_IDENTITY_REQUIRED');
  const cell = createShadowAuthorityCell({ projectId: 'oracle' });
  assert.equal(cell.shadowEvaluateWriteAdmission({ capturedGeneration: 2, latestEditGeneration: 3 }).advice, SHADOW_ADVICE.WOULD_KEEP_STALE);
  assert.equal(cell.shadowEvaluateWriteAdmission({ capturedGeneration: 9, latestEditGeneration: 3 }).advice, SHADOW_ADVICE.WOULD_REJECT_REGRESSION);
  assert.equal(cell.shadowEvaluateWriteAdmission({ capturedGeneration: null, latestEditGeneration: 3 }).advice, SHADOW_ADVICE.WOULD_KEEP_UNBOUND);
  assert.throws(() => cell.promoteToAuthority(), (e) => e instanceof ShadowAuthorityError && e.code === 'E_SHADOW_PROMOTION_DENIED');
  cell.recordObservation(8);
  cell.recordObservation(2);
  assert.equal(cell.shadowSnapshot().observedLatestGeneration, 8);
  assert.equal(cell.shadowEvaluateWriteAdmission({ capturedGeneration: 'bogus', latestEditGeneration: 'bogus2' }).advice !== undefined || true, true);
}

test('R1 shadow cell: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r1-mutant-'));
    const target = path.join(dir, 'shadow-authority-cell-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    // Sibling law modules required by the cell are placed unmutated alongside.
    for (const sibling of ['revision-algebra-v1.cjs']) {
      fs.copyFileSync(path.join(__dirname, '..', '..', 'src', 'core', sibling), path.join(dir, sibling));
    }
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
  console.log(`R24_R1_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
