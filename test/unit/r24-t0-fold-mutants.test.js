'use strict';

// R2.4 T0 implementation mutation suite for the deterministic fold tape law.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'text-fold-tape-v1.mjs');

const MUTANTS = [
  {
    id: 'final-sigma-rule-removed',
    find: "    return nextChar !== undefined && isLetter(nextChar) ? 'σ' : 'ς';",
    replace: "    return 'σ';",
  },
  {
    id: 'sigma-always-final',
    find: "    return nextChar !== undefined && isLetter(nextChar) ? 'σ' : 'ς';",
    replace: "    return 'ς';",
  },
  {
    id: 'fold-to-uppercase',
    find: '  return char.toLowerCase();',
    replace: '  return char.toUpperCase();',
  },
  {
    id: 'run-span-truncated',
    find: '      sourceEnd: utf16OffsetOf(endIndex),',
    replace: '      sourceEnd: utf16OffsetOf(runStart) + 1,',
  },
  {
    id: 'map-direction-flipped',
    find: '    direction: TEXT_TRANSFORM_DIRECTION.INVERSE,',
    replace: '    direction: TEXT_TRANSFORM_DIRECTION.FORWARD,',
  },
  {
    id: 'utf16-prefix-offset-replaced-by-code-point-index',
    find: '  const utf16OffsetOf = (codePointIndex) => utf16PrefixOffsets[codePointIndex];',
    replace: '  const utf16OffsetOf = (codePointIndex) => codePointIndex;',
  },
];

async function killOracle(modulePath) {
  const m = await import(pathToFileURL(modulePath).href);
  const tape = m.buildDeterministicFoldTape('abİcd');
  assert.equal(tape.foldedText, 'abi̇cd');
  assert.equal(m.buildDeterministicFoldTape('ΛΟΓΟΣ').foldedText, 'λογος');
  assert.equal(m.buildDeterministicFoldTape('ΣΑΣ').foldedText, 'σας');
  const inside = m.mapFoldedOffsetToOriginal(tape, 3);
  assert.equal(inside.status, 'UNMAPPABLE');
  const after = m.mapFoldedOffsetToOriginal(tape, 4);
  assert.equal(after.status, 'EXACT');
  assert.equal(after.position, 3);
  const hostileAstral = m.buildDeterministicFoldTape('😀A😀B');
  assert.deepEqual(
    hostileAstral.tape.operations.map(({ sourceStart, sourceEnd }) => ({ sourceStart, sourceEnd })),
    [
      { sourceStart: 2, sourceEnd: 3 },
      { sourceStart: 5, sourceEnd: 6 },
    ],
    'changed-run boundaries use UTF-16 code units after astral code points',
  );
  assert.equal(m.foldIncludes('Hello', 'hello'), true);
  assert.equal(m.foldIncludes('Straße', 'STRASSE'), false);
}

test('T0 fold tape law: all implementation mutants are executed and killed', async () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-t0-mutant-'));
    const target = path.join(dir, 'text-fold-tape-v1.mjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    fs.copyFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'textTransformAlgebra.mjs'), path.join(dir, 'textTransformAlgebra.mjs'));
    fs.copyFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'browser-safe-hash.mjs'), path.join(dir, 'browser-safe-hash.mjs'));
    fs.copyFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'textCoordinateAlgebra.mjs'), path.join(dir, 'textCoordinateAlgebra.mjs'));
    let killed = false;
    let detail = '';
    try {
      await killOracle(target);
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_T0_MUTATION_RECEIPT=${JSON.stringify({ total: results.length, killed: results.length - survived.length, survived: survived.map((s) => s.id), score: results.length ? (results.length - survived.length) / results.length : 0 })}`);
  assert.equal(results.length > 0, true, 'zero denominator forbidden');
  assert.deepEqual(survived, []);
});
