import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyUndoEntry,
  PATH_TEXT_COMMANDS,
  planPathTextOperation,
} from '../../src/core/path-text-integrity-v1.mjs';

const sandbox = (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

function inputFor(root, documentPath, overrides = {}) {
  return {
    command: PATH_TEXT_COMMANDS.REPLACE_RANGE,
    documentPath,
    allowedRoots: [root],
    sourceText: 'abc',
    sourceRevisionId: 'physics-source',
    targetRevisionId: 'physics-target',
    selection: { start: 1, end: 2 },
    search: null,
    replacementText: 'B',
    clipboardPayload: null,
    imeState: { active: false, generation: 1 },
    aliasReadDirFn: null,
    ...overrides,
  };
}

test('real filesystem symlink component is refused by no-follow path capability', () => {
  const root = sandbox('r24-wp205-root-');
  const outside = sandbox('r24-wp205-outside-');
  const link = path.join(root, 'linked');
  fs.symlinkSync(outside, link, 'dir');
  const documentPath = path.join(link, 'Scene.txt');
  fs.writeFileSync(path.join(outside, 'Scene.txt'), 'outside');

  assert.throws(
    () => planPathTextOperation(inputFor(root, documentPath)),
    (error) => error.code === 'E_WP205_PATH_CAPABILITY'
      && error.details.reason === 'E_CAP_NOFOLLOW_SYMLINK',
  );
});

test('undo receipt survives JSON persistence and still refuses stale target text', () => {
  const root = sandbox('r24-wp205-recovery-');
  const documentPath = path.join(root, 'Scene.txt');
  fs.writeFileSync(documentPath, 'fixture');
  const receipt = planPathTextOperation(inputFor(root, documentPath, {
    sourceText: 'draft 👨‍👩‍👧‍👦',
    sourceRevisionId: 'recover-source',
    targetRevisionId: 'recover-target',
    selection: { start: 6, end: 17 },
    replacementText: 'family',
  }));
  const persistedUndo = JSON.parse(JSON.stringify(receipt.undo));

  const restored = applyUndoEntry({ undoEntry: persistedUndo, currentText: receipt.targetText });
  assert.equal(restored.restoredText, 'draft 👨‍👩‍👧‍👦');
  assert.throws(
    () => applyUndoEntry({ undoEntry: persistedUndo, currentText: 'draft other' }),
    (error) => error.code === 'E_WP205_UNDO_TARGET_DRIFT',
  );
});

test('large deterministic search replace stays bounded and does not normalize text', () => {
  const root = sandbox('r24-wp205-large-');
  const documentPath = path.join(root, 'Scene.txt');
  fs.writeFileSync(documentPath, 'fixture');
  const sourceText = `${'Hello cafe\u0301\n'.repeat(5000)}tail`;
  const start = process.hrtime.bigint();
  const receipt = planPathTextOperation(inputFor(root, documentPath, {
    command: PATH_TEXT_COMMANDS.SEARCH_REPLACE,
    sourceText,
    sourceRevisionId: 'large-source',
    targetRevisionId: 'large-target',
    selection: null,
    search: { query: 'Hello', matchCase: true, maxReplacements: 2500 },
    replacementText: 'Hi',
  }));
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

  assert.equal(receipt.search.matchCount, 2500);
  assert.equal(receipt.targetText.includes('cafe\u0301'), true);
  assert.equal(receipt.targetText.includes('café'), false);
  assert.ok(elapsedMs < 10000, `WP205 large replace took ${elapsedMs.toFixed(1)}ms`);
});
