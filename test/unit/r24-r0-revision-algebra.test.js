'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REVISION_ORDER,
  RevisionAlgebraError,
  advanceRevisionCoordinate,
  compareRevisionCoordinates,
  isLineageDescendant,
  joinRevisionCoordinates,
  normalizeRevisionCoordinate,
  parseRevisionCoordinate,
  serializeRevisionCoordinate,
} = require('../../src/core/revision-algebra-v1.cjs');

const coord = (pr, er, sr, gen, epoch, entityId = 'scene-1') => ({
  domain: { projectId: 'proj-1', entityId },
  projectRevision: pr,
  entityRevision: er,
  sourceRevision: sr,
  generation: gen,
  writerEpoch: epoch,
});

test('shape and domain validation fail closed', () => {
  assert.throws(() => normalizeRevisionCoordinate(null), (e) => e instanceof RevisionAlgebraError && e.code === 'E_REVISION_SHAPE');
  assert.throws(() => normalizeRevisionCoordinate([]), (e) => e.code === 'E_REVISION_SHAPE');
  assert.throws(() => normalizeRevisionCoordinate({ ...coord(0, 0, 0, 0, 0), domain: null }), (e) => e.code === 'E_REVISION_DOMAIN_SHAPE');
  assert.throws(() => normalizeRevisionCoordinate({ ...coord(0, 0, 0, 0, 0), domain: { projectId: '', entityId: 'x' } }), (e) => e.code === 'E_REVISION_DOMAIN_IDENTITY');
  assert.throws(() => normalizeRevisionCoordinate({ ...coord(0, 0, -1, 0, 0) }), (e) => e.code === 'E_REVISION_COMPONENT_INVALID');
  assert.throws(() => normalizeRevisionCoordinate({ ...coord(0, 0, 0, 1.5, 0) }), (e) => e.code === 'E_REVISION_COMPONENT_INVALID');
});

test('partial order: less, equal, greater, concurrent', () => {
  const base = coord(1, 1, 1, 1, 1);
  assert.equal(compareRevisionCoordinates(base, coord(1, 1, 1, 1, 1)), REVISION_ORDER.EQUAL);
  assert.equal(compareRevisionCoordinates(base, coord(2, 1, 1, 1, 1)), REVISION_ORDER.LESS);
  assert.equal(compareRevisionCoordinates(coord(2, 1, 1, 1, 1), base), REVISION_ORDER.GREATER);
  assert.equal(compareRevisionCoordinates(coord(2, 0, 1, 1, 1), coord(1, 1, 1, 1, 1)), REVISION_ORDER.CONCURRENT, 'mixed components are concurrent, never an arbitrary total order');
});

test('cross-domain comparison is a typed error, never a guess', () => {
  assert.throws(
    () => compareRevisionCoordinates(coord(1, 1, 1, 1, 1), coord(1, 1, 1, 1, 1, 'scene-2')),
    (e) => e.code === 'E_REVISION_DOMAIN_MISMATCH',
  );
});

test('join returns the greater for comparable and typed conflict for concurrent', () => {
  const joined = joinRevisionCoordinates(coord(1, 1, 1, 1, 1), coord(2, 1, 1, 1, 1));
  assert.equal(joined.projectRevision, 2);
  const equal = joinRevisionCoordinates(coord(1, 1, 1, 1, 1), coord(1, 1, 1, 1, 1));
  assert.equal(equal.projectRevision, 1);
  assert.throws(
    () => joinRevisionCoordinates(coord(2, 0, 1, 1, 1), coord(1, 1, 1, 1, 1)),
    (e) => e.code === 'E_REVISION_CONCURRENT_CONFLICT',
  );
});

test('lineage: descendant relation and single-component advance', () => {
  assert.equal(isLineageDescendant(coord(2, 1, 1, 1, 1), coord(1, 1, 1, 1, 1)), true);
  assert.equal(isLineageDescendant(coord(1, 1, 1, 1, 1), coord(1, 1, 1, 1, 1)), true);
  assert.equal(isLineageDescendant(coord(1, 1, 1, 1, 1), coord(2, 1, 1, 1, 1)), false);
  const advanced = advanceRevisionCoordinate(coord(1, 1, 1, 1, 1), 'generation');
  assert.equal(advanced.generation, 2);
  assert.equal(advanced.projectRevision, 1);
  assert.throws(() => advanceRevisionCoordinate(coord(1, 1, 1, 1, 1), 'bogus'), (e) => e.code === 'E_REVISION_COMPONENT_UNKNOWN');
});

test('canonical serialization round-trips and rejects malformed input', () => {
  const c = coord(3, 4, 5, 6, 7, 'entity-9');
  const text = serializeRevisionCoordinate(c);
  assert.equal(text, 'rv1:proj-1/entity-9/3/4/5/6/7');
  const parsed = parseRevisionCoordinate(text);
  assert.equal(compareRevisionCoordinates(parsed, c), REVISION_ORDER.EQUAL);
  assert.throws(() => parseRevisionCoordinate('rv1:proj/entity/1/2/3'), (e) => e.code === 'E_REVISION_PARSE');
  assert.throws(() => parseRevisionCoordinate('rv2:proj-1/entity-9/3/4/5/6/7'), (e) => e.code === 'E_REVISION_PARSE');
  assert.throws(() => parseRevisionCoordinate(42), (e) => e.code === 'E_REVISION_SERIALIZE_SHAPE');
  assert.throws(() => parseRevisionCoordinate('rv1:bad/seg/ment/1/2/3/4/5'), (e) => e.code === 'E_REVISION_PARSE');
});

test('unicode domain identities serialize exactly', () => {
  const c = coord(1, 2, 3, 4, 5, 'сцена-İ');
  const text = serializeRevisionCoordinate(c);
  const parsed = parseRevisionCoordinate(text);
  assert.equal(parsed.domain.entityId, 'сцена-İ');
  assert.equal(compareRevisionCoordinates(parsed, c), REVISION_ORDER.EQUAL);
});

test('algebra operations are O(1) at scale', () => {
  const a = coord(1, 1, 1, 1, 1);
  const b = coord(2, 2, 2, 2, 2);
  const start = process.hrtime.bigint();
  for (let i = 0; i < 100000; i += 1) {
    compareRevisionCoordinates(a, b);
    serializeRevisionCoordinate(a);
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(elapsedMs < 2000, `100k compare+serialize cycles took ${elapsedMs.toFixed(1)}ms`);
});
