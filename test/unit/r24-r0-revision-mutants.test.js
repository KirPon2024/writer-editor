'use strict';

// R2.4 R0 implementation mutation suite for the revision algebra law.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'revision-algebra-v1.cjs');

const MUTANTS = [
  {
    id: 'concurrent-collapsed-to-greater',
    find: 'if (less && greater) return ORDER.CONCURRENT;',
    replace: 'if (less && greater) return ORDER.GREATER;',
  },
  {
    id: 'domain-mismatch-tolerated',
    find: 'if (a.domain.projectId !== b.domain.projectId || a.domain.entityId !== b.domain.entityId) {',
    replace: 'if (false) {',
  },
  {
    id: 'join-concurrent-silent',
    find: 'if (order === ORDER.CONCURRENT) {',
    replace: 'if (false) {',
  },
  {
    id: 'advance-not-monotonic',
    find: 'return normalizeRevisionCoordinate({ ...current, [component]: current[component] + 1 });',
    replace: 'return normalizeRevisionCoordinate({ ...current, [component]: current[component] + 0 });',
  },
  {
    id: 'parse-version-unbound',
    find: "const match = text.match(/^rv1:([^/]+)\\/([^/]+)\\/(\\d+)\\/(\\d+)\\/(\\d+)\\/(\\d+)\\/(\\d+)$/);",
    replace: "const match = text.match(/^rv[0-9]:([^/]+)\\/([^/]+)\\/(\\d+)\\/(\\d+)\\/(\\d+)\\/(\\d+)\\/(\\d+)$/);",
  },
  {
    id: 'less-collapsed-to-greater',
    find: 'if (less) return ORDER.LESS;',
    replace: 'if (less) return ORDER.GREATER;',
  },
];

function killOracle(module) {
  const {
    REVISION_ORDER,
    RevisionAlgebraError,
    advanceRevisionCoordinate,
    compareRevisionCoordinates,
    joinRevisionCoordinates,
    parseRevisionCoordinate,
    serializeRevisionCoordinate,
  } = module;
  const base = { domain: { projectId: 'p', entityId: 'e' }, projectRevision: 1, entityRevision: 1, sourceRevision: 1, generation: 1, writerEpoch: 1 };
  const mixed = { ...base, projectRevision: 2, generation: 0 };
  assert.equal(compareRevisionCoordinates(mixed, base), REVISION_ORDER.CONCURRENT);
  assert.equal(compareRevisionCoordinates(base, { ...base, projectRevision: 2 }), REVISION_ORDER.LESS);
  assert.throws(() => compareRevisionCoordinates(base, { ...base, domain: { projectId: 'q', entityId: 'e' } }), (e) => e instanceof RevisionAlgebraError && e.code === 'E_REVISION_DOMAIN_MISMATCH');
  assert.throws(() => joinRevisionCoordinates(mixed, base), (e) => e.code === 'E_REVISION_CONCURRENT_CONFLICT');
  assert.equal(advanceRevisionCoordinate(base, 'generation').generation, 2);
  const text = serializeRevisionCoordinate(base);
  assert.equal(text.startsWith('rv1:'), true);
  assert.throws(() => parseRevisionCoordinate(text.replace('rv1:', 'rv9:')), (e) => e.code === 'E_REVISION_PARSE');
}

test('R0 revision algebra module: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r0-mutant-'));
    const target = path.join(dir, 'revision-algebra-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
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
  console.log(`R24_R0_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
