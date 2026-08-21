'use strict';

// R2.4 T1 unit law tests for the anchor lineage protocol.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const law = require(path.join(__dirname, '..', '..', 'src', 'core', 'anchor-lineage-v1.cjs'));

const BASE_REVISION = {
  domain: { projectId: 'proj-a', entityId: 'scene-a' },
  projectRevision: 3,
  entityRevision: 2,
  sourceRevision: 1,
  generation: 0,
  writerEpoch: 0,
};

const LATER_REVISION = { ...BASE_REVISION, entityRevision: 5 };
const CONCURRENT_REVISION = { ...BASE_REVISION, entityRevision: 3, sourceRevision: 0 };
const OTHER_DOMAIN_REVISION = { ...BASE_REVISION, domain: { projectId: 'proj-a', entityId: 'scene-b' } };

function makeIdentity(overrides = {}) {
  return law.createAnchorIdentity({
    anchorId: 'anchor-1',
    projectId: 'proj-a',
    sceneId: 'scene-a',
    birthRevision: BASE_REVISION,
    ...overrides,
  });
}

test('identity is durable and never carries offsets or quote', () => {
  const identity = makeIdentity();
  assert.equal(identity.anchorId, 'anchor-1');
  assert.equal(identity.schemaVersion, 'yalken.anchorLineage.v1');
  assert.equal(Object.isFrozen(identity), true);
  for (const key of Object.keys(identity)) {
    assert.equal(['schemaVersion', 'anchorId', 'projectId', 'sceneId', 'birthRevision'].includes(key), true, `identity must not carry witness field ${key}`);
  }
  assert.throws(() => makeIdentity({ anchorId: '' }), (e) => e.code === 'E_ANCHOR_ID_REQUIRED');
  assert.throws(() => makeIdentity({ birthRevision: OTHER_DOMAIN_REVISION }), (e) => e.code === 'E_ANCHOR_DOMAIN_MISMATCH');
  assert.throws(() => makeIdentity({ birthRevision: { domain: { projectId: 'proj-a', entityId: 'scene-a' } } }), (e) => e.code === 'E_ANCHOR_BIRTH_REVISION_INVALID');
});

test('witness is fallible evidence: quote, hashes and context from the birth text', () => {
  const text = 'Before Anna arrived, Peter left.';
  const witness = law.createAnchorWitness(text, { startOffset: 7, endOffset: 11 });
  assert.equal(witness.quote, 'Anna');
  assert.equal(Object.isFrozen(witness), true);
  assert.equal(typeof witness.quoteHash, 'string');
  assert.equal(witness.sceneTextHash.length > 0, true);
  assert.equal(typeof witness.prefixContextHash, 'string');
  assert.throws(() => law.createAnchorWitness(text, { startOffset: -1, endOffset: 3 }), (e) => e.code === 'E_ANCHOR_WITNESS_SPAN');
  assert.throws(() => law.createAnchorWitness(text, { startOffset: 5, endOffset: 999 }), (e) => e.code === 'E_ANCHOR_WITNESS_SPAN');
});

test('lineage guard: unrelated or concurrent revisions are typed refusals', () => {
  const identity = makeIdentity();
  assert.equal(law.assertAnchorLineageRelated(identity, LATER_REVISION).entityRevision, 5);
  assert.equal(law.assertAnchorLineageRelated(identity, BASE_REVISION).entityRevision, 2);
  assert.throws(() => law.assertAnchorLineageRelated(identity, CONCURRENT_REVISION), (e) => e.code === 'E_ANCHOR_LINEAGE_UNRELATED');
  assert.throws(() => law.assertAnchorLineageRelated(identity, OTHER_DOMAIN_REVISION), (e) => e.code === 'E_ANCHOR_LINEAGE_UNRELATED');
  assert.throws(() => law.assertAnchorLineageRelated(identity, null), (e) => e.code === 'E_ANCHOR_TARGET_REVISION_INVALID');
});

test('lineage carry: earlier edits shift, later edits leave, interior overlap is LOST', () => {
  const span = { startOffset: 10, endOffset: 20 };
  const shifted = law.carryAnchorSpan(span, [{ startOffset: 0, endOffset: 4, insertedLength: 9 }]);
  assert.deepEqual({ status: shifted.status, span: shifted.span }, { status: 'exact', span: { startOffset: 15, endOffset: 25 } });

  const untouched = law.carryAnchorSpan(span, [{ startOffset: 25, endOffset: 30, insertedLength: 2 }]);
  assert.deepEqual({ status: untouched.status, span: untouched.span }, { status: 'exact', span });

  const boundaryInsert = law.carryAnchorSpan(span, [{ startOffset: 10, endOffset: 10, insertedLength: 3 }]);
  assert.deepEqual({ status: boundaryInsert.status, span: boundaryInsert.span }, { status: 'exact', span: { startOffset: 13, endOffset: 23 } }, 'insertion at the start boundary belongs before the anchor');

  const endInsert = law.carryAnchorSpan(span, [{ startOffset: 20, endOffset: 20, insertedLength: 3 }]);
  assert.deepEqual({ status: endInsert.status, span: endInsert.span }, { status: 'exact', span }, 'insertion at the end boundary leaves the span');

  const overwritten = law.carryAnchorSpan(span, [{ startOffset: 12, endOffset: 14, insertedLength: 0 }]);
  assert.equal(overwritten.status, 'lost');
  assert.equal(overwritten.reason, 'SPAN_OVERWRITTEN');

  const chained = law.carryAnchorSpan(span, [
    { startOffset: 0, endOffset: 0, insertedLength: 2 },
    { startOffset: 40, endOffset: 42, insertedLength: 0 },
  ]);
  assert.deepEqual({ status: chained.status, span: chained.span }, { status: 'exact', span: { startOffset: 12, endOffset: 22 } });

  assert.throws(() => law.carryAnchorSpan(span, [{ startOffset: 1, endOffset: 0, insertedLength: 0 }]), (e) => e.code === 'E_ANCHOR_EDIT_SHAPE');
});

test('witness ambiguity protocol: none lost, one exact, many need context, never silent first match', () => {
  const single = 'Anna arrived once.';
  const w1 = law.createAnchorWitness(single, { startOffset: 0, endOffset: 4 });
  const exact = law.resolveAnchorByWitness(w1, single);
  assert.equal(exact.status, 'exact');
  assert.equal(exact.basis, 'quote');

  const lost = law.resolveAnchorByWitness(w1, 'Nobody came.');
  assert.equal(lost.status, 'lost');
  assert.equal(lost.reason, 'QUOTE_NOT_FOUND');

  const dup = 'Anna left. Anna arrived.';
  const dupWitness = law.createAnchorWitness(dup, { startOffset: 0, endOffset: 4 });
  const resolved = law.resolveAnchorByWitness(dupWitness, dup);
  assert.equal(resolved.status, 'exact');
  assert.equal(resolved.basis, 'context', 'the birth context disambiguates the duplicate');
  assert.equal(resolved.span.startOffset, 0);

  const repeated = 'Anna Anna';
  const repWitness = { quote: 'Anna', prefixContextHash: '', suffixContextHash: '' };
  const ambiguous = law.resolveAnchorByWitness(repWitness, repeated);
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.reason, 'MULTIPLE_CANDIDATES');
  assert.equal(ambiguous.candidates.length, 2);
  assert.notEqual(ambiguous.candidates[0].startOffset, ambiguous.candidates[1].startOffset);
});

test('full carry: lineage exact survives, drifted witness resolves with typed diagnosis', () => {
  const identity = makeIdentity();
  const birth = 'Anna arrived.';
  const witness = law.createAnchorWitness(birth, { startOffset: 0, endOffset: 4 });
  const laterText = 'Before. Anna arrived.';
  const carried = law.carryAnchor(identity, witness, [{ startOffset: 0, endOffset: 0, insertedLength: 8 }], LATER_REVISION, laterText);
  assert.equal(carried.status, 'exact');
  assert.equal(carried.basis, 'lineage');
  assert.equal(carried.span.startOffset, 8);

  const noQuote = law.carryAnchor(identity, witness, [], LATER_REVISION, 'Nothing here.');
  assert.equal(noQuote.status, 'lost');

  assert.throws(
    () => law.carryAnchor(identity, witness, [], CONCURRENT_REVISION, laterText),
    (e) => e.code === 'E_ANCHOR_LINEAGE_UNRELATED',
  );
});
