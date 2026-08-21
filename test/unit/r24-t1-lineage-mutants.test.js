'use strict';

// R2.4 T1 implementation mutation suite for the anchor lineage law.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'anchor-lineage-v1.cjs');

const MUTANTS = [
  {
    id: 'lineage-guard-removed',
    find: '    if (!isLineageDescendant(targetRevision, identity.birthRevision)) {',
    replace: '    if (false) {',
  },
  {
    id: 'shift-skipped',
    find: '    if (editEnd <= start) {',
    replace: '    if (false) {',
  },
  {
    id: 'overlap-tolerated',
    find: "    return Object.freeze({\n      status: ANCHOR_STATUS.LOST,\n      reason: 'SPAN_OVERWRITTEN',",
    replace: "    return Object.freeze({\n      status: ANCHOR_STATUS.EXACT,\n      reason: 'SPAN_OVERWRITTEN',",
  },
  {
    id: 'silent-first-match',
    find: '  if (candidates.length === 1) {',
    replace: '  if (candidates.length >= 1) {',
  },
  {
    id: 'context-check-removed',
    find: '  const contextMatches = candidates.filter((candidate) => candidate.contextMatches);',
    replace: '  const contextMatches = candidates;',
  },
  {
    id: 'quote-required-dropped',
    find: "  if (!quote) throw new AnchorLineageError('E_ANCHOR_WITNESS_QUOTE_REQUIRED');",
    replace: '  if (false) { throw new AnchorLineageError(\'E_ANCHOR_WITNESS_QUOTE_REQUIRED\'); }',
  },
];

const BASE_REVISION = {
  domain: { projectId: 'proj-a', entityId: 'scene-a' },
  projectRevision: 1,
  entityRevision: 1,
  sourceRevision: 1,
  generation: 0,
  writerEpoch: 0,
};

function killOracle(module) {
  const {
    createAnchorIdentity,
    createAnchorWitness,
    assertAnchorLineageRelated,
    carryAnchorSpan,
    resolveAnchorByWitness,
  } = module;
  const identity = createAnchorIdentity({
    anchorId: 'a1',
    projectId: 'proj-a',
    sceneId: 'scene-a',
    birthRevision: BASE_REVISION,
  });

  // Lineage guard: concurrent (mixed-order) revisions refuse.
  const concurrent = { ...BASE_REVISION, entityRevision: 2, sourceRevision: 0 };
  assert.throws(() => assertAnchorLineageRelated(identity, concurrent), (e) => e.code === 'E_ANCHOR_LINEAGE_UNRELATED');

  // Carry: edits before the span shift it.
  const shifted = carryAnchorSpan({ startOffset: 10, endOffset: 20 }, [{ startOffset: 0, endOffset: 4, insertedLength: 9 }]);
  assert.equal(shifted.status, 'exact');
  assert.equal(shifted.span.startOffset, 15);

  // Carry: interior overlap is LOST, never silently kept.
  const lost = carryAnchorSpan({ startOffset: 10, endOffset: 20 }, [{ startOffset: 12, endOffset: 14, insertedLength: 0 }]);
  assert.equal(lost.status, 'lost');

  // Witness: duplicates without context are ambiguous, never first-matched.
  const dup = resolveAnchorByWitness({ quote: 'Anna', prefixContextHash: '', suffixContextHash: '' }, 'Anna Anna');
  assert.equal(dup.status, 'ambiguous');
  assert.equal(dup.candidates.length, 2);

  // Witness: birth context disambiguates.
  const text = 'Anna left. Anna arrived.';
  const witness = createAnchorWitness(text, { startOffset: 0, endOffset: 4 });
  const resolved = resolveAnchorByWitness(witness, text);
  assert.equal(resolved.status, 'exact');
  assert.equal(resolved.basis, 'context');

  // Witness: empty quote is refused, not scanned.
  assert.throws(
    () => resolveAnchorByWitness({ quote: '', prefixContextHash: '', suffixContextHash: '' }, text),
    (e) => e.code === 'E_ANCHOR_WITNESS_QUOTE_REQUIRED',
  );
}

test('T1 anchor lineage law: all implementation mutants are executed and killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  killOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-t1-mutant-'));
    // The module resolves ./revision-algebra-v1.cjs next to itself, so the
    // mutant must live at the same layout depth.
    fs.copyFileSync(
      path.join(__dirname, '..', '..', 'src', 'core', 'revision-algebra-v1.cjs'),
      path.join(dir, 'revision-algebra-v1.cjs'),
    );
    const target = path.join(dir, 'anchor-lineage-v1.cjs');
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
  console.log(`R24_T1_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
