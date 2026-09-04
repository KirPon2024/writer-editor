'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { clone, fixture } = require('../fixtures/r24-wp604-wse-threads-explanation-fixtures.js');

test('WP604 rejects all 13 registered boundary, adversarial and counterexample mutants', async () => {
  const f = await fixture();
  const sparse = new Array(1);
  const accessor = { ...f.input };
  Object.defineProperty(accessor, 'facts', { enumerable: true, get: () => f.facts });
  const nonNfcFacts = clone(f.facts); nonNfcFacts[0].id = 'Cafe\u0301';
  const crossProjectFacts = clone(f.facts); crossProjectFacts[0].projectId = 'other-project';
  const badStateFacts = clone(f.facts); badStateFacts[0].promiseState = 'guessed';
  const manyFacts = Array.from({ length: 10001 }, (_, index) => ({ ...clone(f.facts[0]), id: `fact-${index}` }));
  const evidenceHeavy = Array.from({ length: 8200 }, (_, index) => ({
    ...clone(f.facts[1]), id: `fulfilled-${index}`, factValue: `value-${index}`,
  }));
  const wrongCurrentSnapshot = clone(f.causalContext);
  wrongCurrentSnapshot.currentSnapshotIdentity.projectRevisionId = 'sha256:' + '0'.repeat(64);
  const cases = [
    { name: 'extra input key', input: { ...f.input, extra: true } },
    { name: 'sparse facts', input: { ...f.input, facts: sparse } },
    { name: 'accessor input', input: accessor },
    { name: 'blank project', input: { ...f.input, projectId: '' } },
    { name: 'non NFC fact identity', input: { ...f.input, facts: nonNfcFacts } },
    { name: 'cross project fact', input: { ...f.input, facts: crossProjectFacts } },
    { name: 'invented promise state', input: { ...f.input, facts: badStateFacts } },
    { name: 'stale source revision', input: { ...f.input, currentSourceRevision: 'revision-8' } },
    { name: 'stale generation', input: { ...f.input, currentGeneration: 8 } },
    { name: 'input denominator', input: { ...f.input, facts: manyFacts } },
    { name: 'evidence denominator', input: { ...f.input, facts: evidenceHeavy, causalContext: null } },
    { name: 'causal extra key', input: { ...f.input, causalContext: { ...f.causalContext, extra: true } } },
    { name: 'stale causal snapshot', input: { ...f.input, causalContext: wrongCurrentSnapshot } },
  ];
  assert.equal(cases.length, f.api.WSE_THREADS_EXPLANATION_FEATURE_SPEC_V1.corpus.negativeDenominator);
  for (const mutant of cases) {
    assert.throws(() => f.api.buildWseThreadsExplanation(mutant.input), undefined, mutant.name);
  }
});

test('WP604 current identity rejects stale, cross-project and digest-tampered projections', async () => {
  const f = await fixture();
  const projection = f.api.buildWseThreadsExplanation(f.input);
  const identity = { projectId: projection.projectId, sourceRevision: projection.sourceRevision, generation: projection.generation, projectionDigest: projection.projectionDigest };
  assert.equal(f.api.assertWseThreadsExplanationCurrent(projection, identity), projection);
  assert.throws(() => f.api.assertWseThreadsExplanationCurrent(projection, { ...identity, generation: 8 }), { code: 'E_WSE_THREADS_PROJECTION_STALE' });
  assert.throws(() => f.api.assertWseThreadsExplanationCurrent(projection, { ...identity, projectId: 'other-project' }), { code: 'E_WSE_THREADS_PROJECTION_STALE' });
  const tampered = clone(projection); tampered.denominator.causalEdges = 0;
  assert.throws(() => f.api.assertWseThreadsExplanationCurrent(tampered, identity), { code: 'E_WSE_THREADS_PROJECTION_TAMPER' });
});
