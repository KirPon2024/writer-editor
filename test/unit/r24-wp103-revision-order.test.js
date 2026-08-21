'use strict';

// R2.4 WP-103 revision product order: coordinates are comparable with a
// typed concurrent case, never a silent total order, as the product uses
// them across the algebra's consumers.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CORE = (name) => path.join(__dirname, '..', '..', 'src', 'core', name);
const {
  REVISION_ORDER,
  RevisionAlgebraError,
  advanceRevisionCoordinate,
  compareRevisionCoordinates,
  isLineageDescendant,
  joinRevisionCoordinates,
  normalizeRevisionCoordinate,
} = require(CORE('revision-algebra-v1.cjs'));

const BASE = {
  domain: { projectId: 'proj', entityId: 'scene' },
  projectRevision: 2,
  entityRevision: 2,
  sourceRevision: 2,
  generation: 2,
  writerEpoch: 2,
};

const at = (overrides) => ({ ...BASE, ...overrides });

test('product order: each component direction compares exactly', () => {
  assert.equal(compareRevisionCoordinates(BASE, BASE), 'EQUAL');
  for (const key of ['projectRevision', 'entityRevision', 'sourceRevision', 'generation', 'writerEpoch']) {
    assert.equal(compareRevisionCoordinates(at({ [key]: 3 }), BASE), 'GREATER', `${key} up`);
    assert.equal(compareRevisionCoordinates(at({ [key]: 1 }), BASE), 'LESS', `${key} down`);
    assert.equal(compareRevisionCoordinates(at({ [key]: 3, ...(key === 'generation' ? { writerEpoch: 1 } : { generation: 1 }) }), BASE), 'CONCURRENT', `${key} mixed is concurrent`);
  }
});

test('concurrent is typed: join refuses and lineage stays false, never an arbitrary winner', () => {
  const left = at({ entityRevision: 3, sourceRevision: 1 });
  const right = at({ entityRevision: 1, sourceRevision: 3 });
  assert.equal(compareRevisionCoordinates(left, right), 'CONCURRENT');
  assert.throws(() => joinRevisionCoordinates(left, right), (e) => e instanceof RevisionAlgebraError && e.code === 'E_REVISION_CONCURRENT_CONFLICT');
  assert.equal(isLineageDescendant(left, right), false);
  assert.equal(isLineageDescendant(right, left), false);
  assert.equal(isLineageDescendant(at({ entityRevision: 3 }), BASE), true);
  assert.equal(isLineageDescendant(BASE, BASE), true);
  assert.equal(isLineageDescendant(at({ entityRevision: 1 }), BASE), false);
});

test('single-component advance is always GREATER and composes transitively', () => {
  let cursor = BASE;
  const chain = [cursor];
  for (const key of ['entityRevision', 'sourceRevision', 'entityRevision', 'projectRevision']) {
    cursor = advanceRevisionCoordinate(cursor, key);
    chain.push(cursor);
  }
  for (let i = 1; i < chain.length; i += 1) {
    assert.equal(compareRevisionCoordinates(chain[i], chain[i - 1]), 'GREATER');
    assert.equal(compareRevisionCoordinates(chain[i], BASE), 'GREATER');
  }
  assert.throws(() => advanceRevisionCoordinate(BASE, 'notAComponent'), (e) => e.code === 'E_REVISION_COMPONENT_UNKNOWN');
});

test('cross-domain comparison is a typed mismatch, not a false order', () => {
  const other = { ...BASE, domain: { projectId: 'proj', entityId: 'scene-b' } };
  assert.throws(() => compareRevisionCoordinates(BASE, other), (e) => e.code === 'E_REVISION_DOMAIN_MISMATCH');
});

test('fence scalar agreement: the P3 commit fence order agrees with the coordinate order', () => {
  // The P3 fence is one scalar component; its monotonic law must agree with
  // the algebra's order on that component.
  const presented = [1, 2, 3, 5, 8];
  let marker = 0;
  for (const revision of presented) {
    const fenceRegresses = marker >= revision;
    const coordinateOrder = compareRevisionCoordinates(
      at({ entityRevision: revision }),
      at({ entityRevision: marker }),
    );
    assert.equal(fenceRegresses, false);
    assert.equal(coordinateOrder === 'GREATER' || (revision === marker && coordinateOrder === 'EQUAL'), true);
    marker = revision;
  }
  // A replayed or older fence is a regression in BOTH orders.
  const replay = 5;
  assert.equal(marker >= replay, true, 'fence law: replay refused');
  assert.equal(isLineageDescendant(at({ entityRevision: marker }), at({ entityRevision: replay })), true, 'the live marker descends from the replay');
  assert.equal(isLineageDescendant(at({ entityRevision: replay }), at({ entityRevision: marker })), false, 'the replay is an ancestor, never a descendant');
  const older = 3;
  assert.equal(compareRevisionCoordinates(at({ entityRevision: older }), at({ entityRevision: marker })), 'LESS');
});

test('consumers: anchor lineage revisions ride the same algebra', () => {
  const anchorLaw = require(CORE('anchor-lineage-v1.cjs'));
  const identity = anchorLaw.createAnchorIdentity({
    anchorId: 'a1',
    projectId: 'proj',
    sceneId: 'scene',
    birthRevision: BASE,
  });
  const later = advanceRevisionCoordinate(BASE, 'entityRevision');
  assert.equal(anchorLaw.assertAnchorLineageRelated(identity, later).entityRevision, 3);
  const concurrent = at({ entityRevision: 3, sourceRevision: 1 });
  assert.throws(() => anchorLaw.assertAnchorLineageRelated(identity, concurrent), (e) => e.code === 'E_ANCHOR_LINEAGE_UNRELATED');
});
