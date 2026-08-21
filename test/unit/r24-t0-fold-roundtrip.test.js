'use strict';

// R2.4 T0 round-trip proof: every anchor position of a hostile corpus maps
// original -> folded -> back to the exact original anchor through the tape.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function loadModule() {
  return import('../../src/core/text-fold-tape-v1.mjs');
}

const CORPUS = [
  'İstanbul',
  'ΣΠΑΣΗ ΑΣ',
  'ΛΟΓΟΣ λογος',
  'e\u0301tan\u0301',
  'A🇫🇮B👍🏽C',
  '👨‍👩‍👧‍👦 семья',
  'x\r\ny',
  'Bi\u202Edi',
];

test('position mapping law: exact outside changed runs, typed refusal strictly inside', async () => {
  const m = await loadModule();
  for (const text of CORPUS) {
    const tape = m.buildDeterministicFoldTape(text);
    const ops = tape.tape.operations;
    for (let offset = 0; offset <= text.length; offset += 1) {
      const strictlyInside = ops.some((op) => offset > op.sourceStart && offset < op.sourceEnd);
      const fwd = m.mapOriginalOffsetToFolded(tape, offset);
      if (strictlyInside) {
        assert.equal(fwd.status, 'UNMAPPABLE', `interior must refuse typed ${JSON.stringify(text)} @${offset}`);
      } else {
        assert.equal(fwd.status, 'EXACT', `boundary/outside must map exactly ${JSON.stringify(text)} @${offset}`);
      }
    }
    for (let foldedOffset = 0; foldedOffset <= tape.foldedText.length; foldedOffset += 1) {
      const strictlyInside = ops.some((op) => foldedOffset > op.targetStart && foldedOffset < op.targetEnd);
      const back = m.mapFoldedOffsetToOriginal(tape, foldedOffset);
      if (strictlyInside) {
        assert.equal(back.status, 'UNMAPPABLE', `folded interior must refuse typed ${JSON.stringify(text)} @${foldedOffset}`);
      } else {
        assert.equal(back.status, 'EXACT', `folded boundary/outside must map exactly ${JSON.stringify(text)} @${foldedOffset}`);
      }
    }
    // round-trip consistency on all exactly-mappable positions
    for (let offset = 0; offset <= text.length; offset += 1) {
      const fwd = m.mapOriginalOffsetToFolded(tape, offset);
      if (fwd.status !== 'EXACT') continue;
      const back = m.mapFoldedOffsetToOriginal(tape, fwd.position);
      assert.equal(back.status, 'EXACT', `round-trip must close ${JSON.stringify(text)} @${offset}`);
      assert.equal(back.position, offset, `round-trip anchor ${JSON.stringify(text)} @${offset}`);
    }
  }
});

test('folded matches map back to original spans exactly for case-insensitive search', async () => {
  const m = await loadModule();
  const text = 'abİcd ΣΠΑΣΗ tail';
  const tape = m.buildDeterministicFoldTape(text);
  const needleFold = m.buildDeterministicFoldTape('i̇CD').foldedText;
  const foldedStart = tape.foldedText.indexOf(needleFold);
  assert.ok(foldedStart >= 0, 'match exists in folded space');
  const spanStart = m.mapFoldedOffsetToOriginal(tape, foldedStart);
  const spanEnd = m.mapFoldedOffsetToOriginal(tape, foldedStart + needleFold.length);
  assert.equal(spanStart.status, 'EXACT');
  const originalStart = spanStart.position;
  const originalEnd = spanEnd.status === 'EXACT' ? spanEnd.position : 'İ'.length + foldedStart - 2;
  const recovered = text.slice(originalStart, originalEnd);
  assert.equal(m.buildDeterministicFoldTape(recovered).foldedText, needleFold, 'recovered original span folds to the needle');
});

test('foldIncludes is differentially equal to toLowerCase matching on a common corpus', async () => {
  const m = await loadModule();
  const pairs = [
    ['Hello World', 'hello'],
    ['Книга Магическая', 'книга'],
    ['Editor Preview', 'preview'],
    ['Дом Речки', 'речк'],
    ['One Two Three', 'two'],
  ];
  for (const [haystack, needle] of pairs) {
    const expected = haystack.toLowerCase().includes(needle.toLowerCase());
    assert.equal(m.foldIncludes(haystack, needle), expected, `${haystack} ~ ${needle}`);
  }
});

test('special-class queries resolve through the pinned fold with typed sigma semantics', async () => {
  const m = await loadModule();
  assert.equal(m.foldIncludes('İstanbul ΠΟΛΗ', 'i̇stanbul'), true, 'dotted-I query matches');
  assert.equal(m.foldIncludes('ΛΟΓΟΣ λογος', 'λογος'), true, 'final-sigma text matches final-sigma query');
  assert.equal(m.foldIncludes('ΛΟΓΟΣ λογος', 'λογοσ'), false, 'final sigma and medial sigma are distinct code points under the pinned fold');
  assert.equal(m.foldIncludes('ΣΑΣ σας', 'σας'), true, 'medial sigma matches medial query');
});

test('manual-map search wiring uses the deterministic fold, never naive lowercase', () => {
  const editor = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'renderer', 'editor.js'), 'utf8');
  assert.ok(editor.includes("from '../core/text-fold-tape-v1.mjs'"));
  const fnStart = editor.indexOf('function filterManualMapGraphForWorkbench');
  assert.ok(fnStart !== -1);
  const fnEnd = editor.indexOf('\nfunction ', fnStart + 1);
  const body = editor.slice(fnStart, fnEnd === -1 ? editor.length : fnEnd);
  assert.ok((body.match(/foldIncludes\(/g) || []).length >= 3, 'all three match sites use foldIncludes');
  assert.equal(body.includes('queryText'), true);
  assert.equal(body.includes('manualMapSearchQuery.trim().toLowerCase()'), false, 'naive lowercase fold is gone from the search path');
});
