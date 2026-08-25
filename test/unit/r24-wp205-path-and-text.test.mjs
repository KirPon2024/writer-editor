import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyUndoEntry,
  PATH_TEXT_COMMANDS,
  PATH_TEXT_INTEGRITY_SCHEMA_VERSION,
  PathTextIntegrityError,
  planPathTextOperation,
  projectSearchRanges,
} from '../../src/core/path-text-integrity-v1.mjs';
import { sha256Hex } from '../../src/core/browser-safe-hash.mjs';

const sandbox = (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

function makeDocument() {
  const root = sandbox('r24-wp205-');
  const documentPath = path.join(root, 'Scene.txt');
  fs.writeFileSync(documentPath, 'synthetic fixture');
  return { root, documentPath };
}

function baseInput(overrides = {}) {
  const { root, documentPath } = makeDocument();
  return {
    command: PATH_TEXT_COMMANDS.REPLACE_RANGE,
    documentPath,
    allowedRoots: [root],
    sourceText: 'Hello world',
    sourceRevisionId: 'rev-source',
    targetRevisionId: 'rev-target',
    selection: { start: 6, end: 11 },
    search: null,
    replacementText: 'writer',
    clipboardPayload: null,
    imeState: { active: false, generation: 7 },
    aliasReadDirFn: null,
    ...overrides,
  };
}

test('WP205 search replace binds path capability, folded Unicode ranges, exact text tape and undo', () => {
  const { root, documentPath } = makeDocument();
  const sourceText = 'Hello İSTANBUL cafe\u0301\nHello';
  const receipt = planPathTextOperation({
    command: PATH_TEXT_COMMANDS.SEARCH_REPLACE,
    documentPath,
    allowedRoots: [root],
    sourceText,
    sourceRevisionId: 'rev-1',
    targetRevisionId: 'rev-2',
    selection: null,
    search: { query: 'hello', matchCase: false, maxReplacements: null },
    replacementText: 'Merhaba',
    clipboardPayload: null,
    imeState: { active: false, generation: 12 },
    aliasReadDirFn: null,
  });

  assert.equal(receipt.schemaVersion, PATH_TEXT_INTEGRITY_SCHEMA_VERSION);
  assert.equal(receipt.contourId, 'WP-205_PATH_AND_TEXT');
  assert.equal(receipt.path.canonicalPath, documentPath);
  assert.equal(receipt.path.noFollow, true);
  assert.equal(receipt.path.aliasSafe, true);
  assert.equal(receipt.search.matchCount, 2);
  assert.deepEqual(receipt.search.ranges.map(({ start, end }) => [start, end]), [[0, 5], [21, 26]]);
  assert.equal(receipt.targetText, 'Merhaba İSTANBUL cafe\u0301\nMerhaba');
  assert.equal(receipt.text.sourceTextHash, sha256Hex(sourceText));
  assert.equal(receipt.text.targetTextHash, sha256Hex(receipt.targetText));
  assert.equal(receipt.text.normalization, 'EXACT_NO_NORMALIZATION');
  assert.equal(receipt.authority.liveFileWrite, false);
  assert.equal(receipt.authority.rendererBypass, false);
  assert.equal(receipt.authority.automaticUndoApply, false);
  assert.match(receipt.receiptDigest, /^[0-9a-f]{64}$/u);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.text.operations), true);

  const undo = applyUndoEntry({
    undoEntry: JSON.parse(JSON.stringify(receipt.undo)),
    currentText: receipt.targetText,
  });
  assert.equal(undo.restoredText, sourceText);
  assert.equal(undo.automaticApply, false);
});

test('clipboard paste accepts only plain text and preserves composed characters exactly', () => {
  const receipt = planPathTextOperation(baseInput({
    command: PATH_TEXT_COMMANDS.CLIPBOARD_PASTE_TEXT,
    sourceText: 'A 👩‍💻 Z',
    selection: { start: 2, end: 2 },
    replacementText: null,
    clipboardPayload: { text: 'paste café', html: null },
  }));

  assert.equal(receipt.targetText, 'A paste café👩‍💻 Z');
  assert.equal(receipt.clipboard.plainTextOnly, true);
  assert.equal(receipt.clipboard.htmlAccepted, false);
  assert.equal(receipt.clipboard.systemClipboardMutation, false);
  assert.equal(receipt.text.operationCount, 1);
});

test('range replace refuses IME-active, grapheme-splitting and ill-formed Unicode mutations', () => {
  assert.throws(
    () => planPathTextOperation(baseInput({ imeState: { active: true, generation: 9 } })),
    (error) => error instanceof PathTextIntegrityError && error.code === 'E_WP205_IME_COMPOSITION_ACTIVE',
  );

  assert.throws(
    () => planPathTextOperation(baseInput({
      sourceText: 'e\u0301clair',
      selection: { start: 1, end: 2 },
      replacementText: 'x',
    })),
    (error) => error.code === 'E_WP205_GRAPHEME_BOUNDARY',
  );

  assert.throws(
    () => planPathTextOperation(baseInput({ sourceText: 'bad\uD800text' })),
    (error) => error.code === 'E_WP205_UNICODE_INVALID',
  );
});

test('path escape, alias mismatch, clipboard html and undo drift fail closed', () => {
  const { root, documentPath } = makeDocument();
  const outside = path.join(path.dirname(root), 'Outside.txt');
  fs.writeFileSync(outside, 'outside');
  assert.throws(
    () => planPathTextOperation(baseInput({ documentPath: outside, allowedRoots: [root] })),
    (error) => error.code === 'E_WP205_PATH_CAPABILITY',
  );

  assert.throws(
    () => planPathTextOperation(baseInput({
      documentPath: path.join(root, 'scene.txt'),
      allowedRoots: [root],
      aliasReadDirFn: () => ['Scene.txt'],
    })),
    (error) => error.code === 'E_WP205_PATH_ALIAS',
  );

  assert.throws(
    () => planPathTextOperation(baseInput({
      command: PATH_TEXT_COMMANDS.CLIPBOARD_PASTE_TEXT,
      selection: { start: 0, end: 0 },
      replacementText: null,
      clipboardPayload: { text: 'plain', html: '<b>plain</b>' },
    })),
    (error) => error.code === 'E_WP205_CLIPBOARD_HTML_REJECTED',
  );

  const receipt = planPathTextOperation(baseInput());
  assert.throws(
    () => applyUndoEntry({ undoEntry: receipt.undo, currentText: `${receipt.targetText}!` }),
    (error) => error.code === 'E_WP205_UNDO_TARGET_DRIFT',
  );
});

test('folded search refuses length-changing fold boundaries instead of guessing offsets', () => {
  assert.throws(
    () => projectSearchRanges({
      sourceText: 'İ',
      sourceRevisionId: 'rev-fold',
      search: { query: 'i', matchCase: false, maxReplacements: null },
    }),
    (error) => error.code === 'E_WP205_SEARCH_UNMAPPABLE_FOLD_RANGE',
  );

  const exact = projectSearchRanges({
    sourceText: 'İ',
    sourceRevisionId: 'rev-fold-exact',
    search: { query: 'İ', matchCase: true, maxReplacements: null },
  });
  assert.deepEqual(exact.ranges.map(({ start, end }) => [start, end]), [[0, 1]]);
});
