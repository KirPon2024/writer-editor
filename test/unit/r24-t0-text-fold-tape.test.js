'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../../src/core/text-fold-tape-v1.mjs');
}

test('ASCII fold is identity with exact offset mapping', async () => {
  const m = await loadModule();
  const tape = m.buildDeterministicFoldTape('Hello World');
  assert.equal(tape.foldedText, 'hello world');
  for (let i = 0; i <= 'Hello World'.length; i += 1) {
    const back = m.mapFoldedOffsetToOriginal(tape, i);
    assert.equal(back.status, 'EXACT');
    assert.equal(back.position, i);
    const fwd = m.mapOriginalOffsetToFolded(tape, i);
    assert.equal(fwd.status, 'EXACT');
    assert.equal(fwd.position, i);
  }
});

test('Turkish dotted I expansion maps through the tape with typed refusal inside', async () => {
  const m = await loadModule();
  const tape = m.buildDeterministicFoldTape('abİcd');
  assert.equal(tape.foldedText, 'abi̇cd');
  const atStart = m.mapFoldedOffsetToOriginal(tape, 2);
  assert.equal(atStart.status, 'EXACT');
  assert.equal(atStart.position, 2, 'start of the İ span maps to the original İ');
  const inside = m.mapFoldedOffsetToOriginal(tape, 3);
  assert.equal(inside.status, 'UNMAPPABLE', 'inside the length-changing span is a typed refusal, never a guess');
  const after = m.mapFoldedOffsetToOriginal(tape, 4);
  assert.equal(after.status, 'EXACT');
  assert.equal(after.position, 3, 'after the span maps to the position after İ');
});

test('Turkish dotless ı and plain I fold 1:1 with exact anchors everywhere', async () => {
  const m = await loadModule();
  const tape = m.buildDeterministicFoldTape('Istanbul Iı');
  assert.equal(tape.foldedText, 'istanbul iı', 'plain I folds to plain i, dotless ı stays ı');
  for (let i = 0; i <= 'Istanbul Iı'.length; i += 1) {
    const back = m.mapFoldedOffsetToOriginal(tape, i);
    assert.equal(back.status, 'EXACT', `@${i}`);
    assert.equal(back.position, i);
  }
});

test('Greek final sigma follows the pinned contextual rule in both branches', async () => {
  const m = await loadModule();
  assert.equal(m.buildDeterministicFoldTape('ΛΟΓΟΣ').foldedText, 'λογος', 'word-final sigma is final form');
  assert.equal(m.buildDeterministicFoldTape('ΣΑΣ').foldedText, 'σας', 'word-internal sigma is medial form');
  assert.equal(m.buildDeterministicFoldTape('Σ ΠΟΛΗ').foldedText, 'ς πολη', 'standalone sigma before space is final');
  assert.equal(m.buildDeterministicFoldTape('ΣA').foldedText, 'σa', 'sigma before a letter is medial');
});

test('combining marks, astral, ZWJ, CRLF and bidi pass through with exact anchors; ill-formed input refuses typed', async () => {
  const m = await loadModule();
  const samples = [
    'e\u0301',
    'cafe\u0301',
    '🇫🇮👍🏽',
    '👨‍👩‍👧‍👦',
    'a\r\nb',
    'x\u202Ey',
  ];
  for (const sample of samples) {
    const tape = m.buildDeterministicFoldTape(sample);
    for (let i = 0; i <= sample.length; i += 1) {
      const back = m.mapFoldedOffsetToOriginal(tape, i);
      assert.equal(back.status, 'EXACT', `${JSON.stringify(sample)} @${i}`);
      assert.equal(back.position, i);
    }
  }
  assert.throws(
    () => m.buildDeterministicFoldTape('lone\uD800surrogate'),
    (e) => e.code === 'E_TEXT_TRANSFORM_UNICODE_INVALID',
    'lone surrogates are refused typed by the transform law, never folded silently',
  );
});

test('foldIncludes matches the deterministic fold on both sides', async () => {
  const m = await loadModule();
  assert.equal(m.foldIncludes('İSTANBUL ΠΟΛΗ', 'i̇stanbul πολη'), true);
  assert.equal(m.foldIncludes('ΛΟΓΟΣ', 'λογος'), true);
  assert.equal(m.foldIncludes('Straße München', 'STRASSE'), false, 'ß is not ss under the pinned fold');
  assert.equal(m.foldIncludes('Straße München', 'straße'), true);
});

test('tape construction fails closed on non-string input', async () => {
  const m = await loadModule();
  assert.throws(() => m.buildDeterministicFoldTape(42), (e) => e.code === 'E_TEXT_FOLD_INPUT_SHAPE');
  assert.throws(() => m.mapFoldedOffsetToOriginal(null, 0), (e) => e.code === 'E_TEXT_FOLD_TAPE_REQUIRED');
});

test('fold and tape build are O(n) at scale', async () => {
  const m = await loadModule();
  const big = 'İΣλX'.repeat(5000);
  const start = process.hrtime.bigint();
  const tape = m.buildDeterministicFoldTape(big);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(tape.foldedText.length > 0, true);
  assert.ok(elapsedMs < 10000, `fold of ${big.length} took ${elapsedMs.toFixed(1)}ms`);
});
