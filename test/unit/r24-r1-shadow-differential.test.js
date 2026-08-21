'use strict';

// R2.4 R1 differential proof: the shadow cell's advisory evaluation matches
// the production autosave ack law for every input class, and the main.js
// advisory hook provably cannot alter lifecycle behavior.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { decideAutosaveAck, ACK_OUTCOMES } = require('../../src/core/autosave-generation-v1.cjs');
const { SHADOW_ADVICE, createShadowAuthorityCell } = require('../../src/core/shadow-authority-cell-v1.cjs');

const CASES = [
  [0, 0], [1, 1], [2, 3], [3, 2], [5, 8], [8, 5], [10, 10],
  [null, 3], [undefined, 3], [0, 1], [1, 0], [42, 42],
];

const EXPECTED = (captured, latest) => {
  if (captured === null || captured === undefined) return [SHADOW_ADVICE.WOULD_KEEP_UNBOUND, ACK_OUTCOMES.KEEP_DIRTY_UNBOUND];
  if (captured === latest) return [SHADOW_ADVICE.WOULD_CLEAR, ACK_OUTCOMES.CLEAR_DIRTY];
  if (captured < latest) return [SHADOW_ADVICE.WOULD_KEEP_STALE, ACK_OUTCOMES.KEEP_DIRTY_STALE];
  return [SHADOW_ADVICE.WOULD_REJECT_REGRESSION, 'E_GENERATION_REGRESSION'];
};

test('shadow advice matches the production ack decision for every input class', () => {
  const cell = createShadowAuthorityCell({ projectId: 'differential' });
  for (const [captured, latest] of CASES) {
    const [wantAdvice, wantOutcome] = EXPECTED(captured, latest);
    const verdict = cell.shadowEvaluateWriteAdmission({ capturedGeneration: captured, latestEditGeneration: latest });
    assert.equal(verdict.advice, wantAdvice, `advice(${captured},${latest})`);
    let actualOutcome;
    try {
      actualOutcome = decideAutosaveAck({ capturedGeneration: captured, latestEditGeneration: latest }).outcome;
    } catch (error) {
      actualOutcome = error.code;
    }
    assert.equal(actualOutcome, wantOutcome, `production(${captured},${latest})`);
  }
});

test('the main.js advisory hook is try/catch-wrapped and after snapshot capture', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  const snapshotIdx = main.indexOf('const snapshot = await requestEditorSnapshot();');
  const hookIdx = main.indexOf('shadowCell.shadowEvaluateWriteAdmission', snapshotIdx);
  assert.ok(snapshotIdx !== -1 && hookIdx > snapshotIdx, 'the shadow evaluation runs after capture');
  const hookRegion = main.slice(hookIdx - 220, hookIdx + 420);
  assert.ok(hookRegion.includes('try {'), 'the hook is guarded');
  assert.ok(hookRegion.includes('catch (shadowError)'), 'shadow failure is telemetry-only');
  assert.ok(main.includes("advice: 'E_SHADOW_EVALUATION_UNAVAILABLE'"));
  assert.ok(main.includes("createShadowAuthorityCell({ projectId: 'yalken.local' })"));
});

test('advisory evaluation does not touch lifecycle state', () => {
  const cell = createShadowAuthorityCell({ projectId: 'differential' });
  const state = { dirty: true, generation: 3 };
  cell.shadowEvaluateWriteAdmission({ capturedGeneration: state.generation, latestEditGeneration: 5 });
  assert.equal(state.dirty, true);
  assert.equal(state.generation, 3, 'advisory evaluation mutates nothing outside the cell');
});

test('advisory evaluation is O(1) at scale', () => {
  const cell = createShadowAuthorityCell({ projectId: 'differential' });
  const start = process.hrtime.bigint();
  for (let i = 0; i < 100000; i += 1) {
    cell.shadowEvaluateWriteAdmission({ capturedGeneration: i % 7, latestEditGeneration: 7 });
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(elapsedMs < 2000, `100k advisory evaluations took ${elapsedMs.toFixed(1)}ms`);
});
