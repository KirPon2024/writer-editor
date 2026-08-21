'use strict';

// R2.4 WP-103 canonical serialization: rv1 coordinates round-trip exactly
// and non-canonical or malformed spellings are typed refusals.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  RevisionAlgebraError,
  normalizeRevisionCoordinate,
  parseRevisionCoordinate,
  serializeRevisionCoordinate,
} = require(path.join(__dirname, '..', '..', 'src', 'core', 'revision-algebra-v1.cjs'));

const COORD = {
  domain: { projectId: 'proj', entityId: 'scene' },
  projectRevision: 2,
  entityRevision: 10,
  sourceRevision: 0,
  generation: 7,
  writerEpoch: 1,
};

test('canonical form: serialize is exact and parse round-trips losslessly', () => {
  const text = serializeRevisionCoordinate(COORD);
  assert.equal(text, 'rv1:proj/scene/2/10/0/7/1');
  const parsed = parseRevisionCoordinate(text);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), JSON.parse(JSON.stringify(normalizeRevisionCoordinate(COORD))));
  assert.equal(serializeRevisionCoordinate(parsed), text, 'parse-serialize is a fixed point on canonical input');
});

test('canonicity detection: a string is canonical iff it is a fixed point of parse-serialize', () => {
  const canonical = serializeRevisionCoordinate(COORD);
  assert.equal(serializeRevisionCoordinate(parseRevisionCoordinate(canonical)), canonical);
  const nonCanonical = 'rv1:proj/scene/02/10/0/7/1';
  const reparsed = serializeRevisionCoordinate(parseRevisionCoordinate(nonCanonical));
  assert.notEqual(reparsed, nonCanonical, 'leading-zero spelling is parseable but provably non-canonical');
  assert.equal(reparsed, canonical, 'and it normalizes to the one canonical form');
});

test('malformed spellings are typed refusals, never partial parses', () => {
  const cases = [
    'xv1:proj/scene/2/10/0/7/1',
    'rv1:proj/scene/2/10/0/7',
    'rv1:proj/scene/2/10/0/7/1/extra',
    'rv1:proj//2/10/0/7/1',
    'rv1:proj/scene/-1/10/0/7/1',
    'rv1:proj/scene/2.5/10/0/7/1',
    'rv1:proj/scene/a/10/0/7/1',
    'rv2:proj/scene/2/10/0/7/1',
    '',
    ' rv1:proj/scene/2/10/0/7/1',
    'rv1:proj/scene/2/10/0/7/1 ',
  ];
  assert.equal(cases.length >= 10, true, 'denominator covers the malformed classes');
  for (const bad of cases) {
    assert.throws(() => parseRevisionCoordinate(bad), (e) => e instanceof RevisionAlgebraError, JSON.stringify(bad));
  }
});

test('domain parts with separators are refused at parse and normalize', () => {
  assert.throws(() => parseRevisionCoordinate('rv1:pro/j/scene/2/10/0/7/1'), (e) => e instanceof RevisionAlgebraError);
  assert.throws(
    () => normalizeRevisionCoordinate({ ...COORD, domain: { projectId: 'pro/j', entityId: 'scene' } }),
    (e) => e.code === 'E_REVISION_DOMAIN_IDENTITY',
  );
});

test('serialize refuses non-normalized coordinates; normalization freezes', () => {
  assert.throws(() => serializeRevisionCoordinate({ ...COORD, generation: -1 }), (e) => e.code === 'E_REVISION_COMPONENT_INVALID');
  assert.throws(() => serializeRevisionCoordinate({ ...COORD, domain: null }), (e) => e.code === 'E_REVISION_DOMAIN_SHAPE' || e.code === 'E_REVISION_SHAPE');
  const normalized = normalizeRevisionCoordinate(COORD);
  assert.equal(Object.isFrozen(normalized), true);
});
