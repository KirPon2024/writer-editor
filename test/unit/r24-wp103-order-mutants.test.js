'use strict';

// R2.4 WP-103 implementation mutants over the revision algebra, killed by
// the product-order corpus oracle.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'revision-algebra-v1.cjs');

const MUTANTS = [
  {
    id: 'concurrent-collapsed-to-greater',
    find: '  if (less && greater) return ORDER.CONCURRENT;',
    replace: '  if (less && greater) return ORDER.GREATER;',
  },
  {
    id: 'equal-collapsed-to-greater',
    find: '  return ORDER.EQUAL;',
    replace: '  return ORDER.GREATER;',
  },
  {
    id: 'component-dropped-from-order',
    find: "const COMPONENT_KEYS = Object.freeze(['projectRevision', 'entityRevision', 'sourceRevision', 'generation', 'writerEpoch']);",
    replace: "const COMPONENT_KEYS = Object.freeze(['projectRevision', 'entityRevision', 'sourceRevision', 'writerEpoch']);",
  },
  {
    id: 'parse-anchor-removed',
    find: "  const match = text.match(/^rv1:([^/]+)\\/([^/]+)\\/(\\d+)\\/(\\d+)\\/(\\d+)\\/(\\d+)\\/(\\d+)$/);",
    replace: "  const match = text.match(/rv1:([^/]+)\\/([^/]+)\\/(\\d+)\\/(\\d+)\\/(\\d+)\\/(\\d+)\\/(\\d+)/);",
  },
  {
    id: 'advance-decrements',
    find: "  return normalizeRevisionCoordinate({ ...current, [component]: current[component] + 1 });",
    replace: "  return normalizeRevisionCoordinate({ ...current, [component]: current[component] - 1 });",
  },
];

const BASE = {
  domain: { projectId: 'proj', entityId: 'scene' },
  projectRevision: 2,
  entityRevision: 2,
  sourceRevision: 2,
  generation: 2,
  writerEpoch: 2,
};

function corpusOracle(module) {
  const {
    advanceRevisionCoordinate,
    compareRevisionCoordinates,
    isLineageDescendant,
    parseRevisionCoordinate,
    serializeRevisionCoordinate,
  } = module;

  // Order law: equal, greater per component, concurrent typed.
  assert.equal(compareRevisionCoordinates(BASE, BASE), 'EQUAL');
  assert.equal(compareRevisionCoordinates({ ...BASE, generation: 3 }, BASE), 'GREATER');
  assert.equal(compareRevisionCoordinates({ ...BASE, generation: 3, writerEpoch: 1 }, BASE), 'CONCURRENT');
  assert.equal(isLineageDescendant({ ...BASE, generation: 3 }, BASE), true);
  assert.equal(isLineageDescendant({ ...BASE, generation: 3, writerEpoch: 1 }, BASE), false);

  // Advance law: strictly greater, one component at a time.
  const advanced = advanceRevisionCoordinate(BASE, 'entityRevision');
  assert.equal(advanced.entityRevision, 3);
  assert.equal(compareRevisionCoordinates(advanced, BASE), 'GREATER');

  // Serialization law: canonical round-trip and anchored parse.
  const text = serializeRevisionCoordinate(BASE);
  assert.equal(text, 'rv1:proj/scene/2/2/2/2/2');
  assert.equal(serializeRevisionCoordinate(parseRevisionCoordinate(text)), text);
  assert.throws(() => parseRevisionCoordinate(`xv1:proj/scene/2/2/2/2/2`));
  assert.throws(() => parseRevisionCoordinate(`garbage rv1:proj/scene/2/2/2/2/2`));
  assert.throws(() => parseRevisionCoordinate(`rv1:proj/scene/2/2/2/2/2 trailing`));
}

test('WP-103 revision algebra mutants: the product corpus kills every order-breaking mutation', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  corpusOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp103-mutant-'));
    const target = path.join(dir, 'revision-algebra-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      corpusOracle(require(target));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_WP103_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
