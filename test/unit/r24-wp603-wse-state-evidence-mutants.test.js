'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, fixture, clone } = require('../fixtures/r24-wp603-wse-state-evidence-fixtures.js');

const file = path.join(ROOT, 'src/core/wse-state-evidence-v1.mjs');
const source = fs.readFileSync(file, 'utf8');
function executable(changed) {
  return changed.replace(/from '(\.\/[^']+)'/gu, (_, relative) => "from '" + pathToFileURL(path.resolve(path.dirname(file), relative)).href + "'");
}
async function loadMutant(id, before, after) {
  assert.equal(source.split(before).length - 1, 1, id + ': unique source anchor');
  const changed = source.replace(before, after);
  assert.notEqual(changed, source);
  return import('data:text/javascript;base64,' + Buffer.from(executable(changed)).toString('base64') + '#' + id);
}

const mutations = [
  ['unknown-absence', "openWorld: { absenceMeans: 'UNKNOWN_NOT_RECORDED'", "openWorld: { absenceMeans: 'KNOWN_FALSE'", async (api, f) => {
    assert.equal(api.buildWseStateEvidence({ projectId: f.projectId, facts: f.facts, continuityRows: [] }).openWorld.absenceMeans, 'UNKNOWN_NOT_RECORDED');
  }],
  ['no-inference', "contradictionMeans: 'REVIEW_REQUIRED_NOT_AUTO_RESOLVED', inference: false", "contradictionMeans: 'REVIEW_REQUIRED_NOT_AUTO_RESOLVED', inference: true", async (api, f) => {
    assert.equal(api.buildWseStateEvidence({ projectId: f.projectId, facts: f.facts, continuityRows: [] }).openWorld.inference, false);
  }],
  ['row-budget', 'rows: rows.slice(0, limit), totalCount:', 'rows, totalCount:', async (api, f) => {
    const many = Array.from({ length: 40 }, (_, index) => ({ ...clone(f.facts[index % 4]), id: 'mutant-' + index }));
    assert.equal(api.buildWseStateEvidence({ projectId: f.projectId, facts: many, continuityRows: [], rowLimit: 3 }).views.livingEvidenceBible.rows.length, 3);
  }],
  ['project-binding', "text(fact.projectId) !== projectId || !text(fact.id)", "!text(fact.id)", async (api, f) => {
    const facts = clone(f.facts); facts[0].projectId = 'other';
    assert.throws(() => api.buildWseStateEvidence({ projectId: f.projectId, facts, continuityRows: [] }), { code: 'E_WSE_FACT_IDENTITY' });
  }],
  ['stale-evidence', "evidenceState: fact.evidenceState === 'current' ? 'current' : 'staleOrMissing', source:", "evidenceState: 'current', source:", async (api, f) => {
    assert.equal(api.buildWseStateEvidence({ projectId: f.projectId, facts: f.facts, continuityRows: [] }).state, 'degraded');
  }],
  ['read-only-authority', "authority: { stateClass: 'DERIVED_STATE', readOnly: true, productMutation: false", "authority: { stateClass: 'DERIVED_STATE', readOnly: true, productMutation: true", async (api, f) => {
    assert.equal(api.buildWseStateEvidence({ projectId: f.projectId, facts: [], continuityRows: [] }).authority.productMutation, false);
  }],
];

test('WP603 behavioral oracles kill all real implementation mutants', async (t) => {
  let killed = 0;
  for (const [id, before, after, oracle] of mutations) {
    const f = await fixture();
    await oracle(f.api, f);
    const mutant = await loadMutant(id, before, after);
    await assert.rejects(() => oracle(mutant, f), { name: 'AssertionError' }, id);
    killed += 1;
  }
  assert.equal(killed, mutations.length);
  assert.equal(fs.readFileSync(file, 'utf8'), source);
  t.diagnostic(JSON.stringify({ implementationMutants: mutations.length, killed, survivors: 0, productionSourceMutations: 0 }));
});
