import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const CORE = path.join(ROOT, 'src', 'core');
const MODULE_BASENAME = 'path-text-integrity-v1.mjs';
const MODULE_SOURCE = fs.readFileSync(path.join(CORE, MODULE_BASENAME), 'utf8');
const sandbox = (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

const mutants = [
  {
    id: 'M_PATH_CAPABILITY_BYPASS',
    find: 'if (!pathVerdict.ok) {',
    replace: 'if (false) {',
    expectKilledBy: 'pathEscape',
  },
  {
    id: 'M_ALIAS_BYPASS',
    find: 'assertAliasSafe(documentPath, { readDirFn: aliasReadDirFn });',
    replace: '/* mutant: alias check bypassed */',
    expectKilledBy: 'aliasMismatch',
  },
  {
    id: 'M_IME_ACTIVE_ACCEPTED',
    find: 'if (ime.active) {',
    replace: 'if (false) {',
    expectKilledBy: 'imeActive',
  },
  {
    id: 'M_GRAPHEME_BOUNDARY_BYPASS',
    find: 'convertTextCoordinatePosition({\n      index,',
    replace: 'return;\n    convertTextCoordinatePosition({\n      index,',
    expectKilledBy: 'splitGrapheme',
  },
  {
    id: 'M_CLIPBOARD_HTML_ACCEPTED',
    find: 'if (payload.html !== null) {',
    replace: 'if (false) {',
    expectKilledBy: 'clipboardHtml',
  },
  {
    id: 'M_UNDO_HASH_GUARD_BYPASS',
    find: 'if (currentHash !== undoEntry.requiresTargetHash) {',
    replace: 'if (false) {',
    expectKilledBy: 'undoDrift',
  },
  {
    id: 'M_FOLD_UNMAPPABLE_ACCEPTED',
    find: 'if (mapped.status !== TEXT_TRANSFORM_POSITION_STATUS.EXACT) {',
    replace: 'if (false) {',
    expectKilledBy: 'foldUnmappable',
  },
];

function copyDependencyTree(dir) {
  fs.mkdirSync(path.join(dir, 'io'), { recursive: true });
  for (const basename of [
    'browser-safe-hash.mjs',
    'textCoordinateAlgebra.mjs',
    'textTransformAlgebra.mjs',
    'text-fold-tape-v1.mjs',
  ]) {
    fs.copyFileSync(path.join(CORE, basename), path.join(dir, basename));
  }
  fs.copyFileSync(
    path.join(CORE, 'io', 'path-capability-v1.cjs'),
    path.join(dir, 'io', 'path-capability-v1.cjs'),
  );
}

async function loadMutant(mutant) {
  assert.ok(MODULE_SOURCE.includes(mutant.find), `${mutant.id} insertion point exists`);
  const dir = sandbox(`r24-wp205-${mutant.id.toLowerCase()}-`);
  copyDependencyTree(dir);
  fs.writeFileSync(path.join(dir, MODULE_BASENAME), MODULE_SOURCE.replace(mutant.find, mutant.replace));
  return import(`${pathToFileURL(path.join(dir, MODULE_BASENAME)).href}?${mutant.id}`);
}

function makeBase(moduleUnderTest, overrides = {}) {
  const root = sandbox('r24-wp205-mutant-doc-');
  const documentPath = path.join(root, 'Scene.txt');
  fs.writeFileSync(documentPath, 'fixture');
  return {
    command: moduleUnderTest.PATH_TEXT_COMMANDS.REPLACE_RANGE,
    documentPath,
    allowedRoots: [root],
    sourceText: 'Hello world',
    sourceRevisionId: 'mutant-source',
    targetRevisionId: 'mutant-target',
    selection: { start: 0, end: 5 },
    search: null,
    replacementText: 'Hi',
    clipboardPayload: null,
    imeState: { active: false, generation: 1 },
    aliasReadDirFn: null,
    ...overrides,
  };
}

function assertOracleKills(moduleUnderTest, oracleId) {
  if (oracleId === 'pathEscape') {
    const base = makeBase(moduleUnderTest);
    const outside = path.join(path.dirname(base.allowedRoots[0]), 'Outside.txt');
    fs.writeFileSync(outside, 'outside');
    assert.throws(
      () => moduleUnderTest.planPathTextOperation({ ...base, documentPath: outside }),
      (error) => error.code === 'E_WP205_PATH_CAPABILITY',
    );
    return;
  }
  if (oracleId === 'aliasMismatch') {
    const base = makeBase(moduleUnderTest);
    assert.throws(
      () => moduleUnderTest.planPathTextOperation({
        ...base,
        documentPath: path.join(base.allowedRoots[0], 'scene.txt'),
        aliasReadDirFn: () => ['Scene.txt'],
      }),
      (error) => error.code === 'E_WP205_PATH_ALIAS',
    );
    return;
  }
  if (oracleId === 'imeActive') {
    assert.throws(
      () => moduleUnderTest.planPathTextOperation(makeBase(moduleUnderTest, {
        imeState: { active: true, generation: 5 },
      })),
      (error) => error.code === 'E_WP205_IME_COMPOSITION_ACTIVE',
    );
    return;
  }
  if (oracleId === 'splitGrapheme') {
    assert.throws(
      () => moduleUnderTest.planPathTextOperation(makeBase(moduleUnderTest, {
        sourceText: 'e\u0301clair',
        selection: { start: 1, end: 2 },
      })),
      (error) => error.code === 'E_WP205_GRAPHEME_BOUNDARY',
    );
    return;
  }
  if (oracleId === 'clipboardHtml') {
    assert.throws(
      () => moduleUnderTest.planPathTextOperation(makeBase(moduleUnderTest, {
        command: moduleUnderTest.PATH_TEXT_COMMANDS.CLIPBOARD_PASTE_TEXT,
        selection: { start: 0, end: 0 },
        replacementText: null,
        clipboardPayload: { text: 'plain', html: '<b>plain</b>' },
      })),
      (error) => error.code === 'E_WP205_CLIPBOARD_HTML_REJECTED',
    );
    return;
  }
  if (oracleId === 'undoDrift') {
    const receipt = moduleUnderTest.planPathTextOperation(makeBase(moduleUnderTest));
    assert.throws(
      () => moduleUnderTest.applyUndoEntry({ undoEntry: receipt.undo, currentText: `${receipt.targetText}!` }),
      (error) => error.code === 'E_WP205_UNDO_TARGET_DRIFT',
    );
    return;
  }
  if (oracleId === 'foldUnmappable') {
    assert.throws(
      () => moduleUnderTest.projectSearchRanges({
        sourceText: 'İ',
        sourceRevisionId: 'fold-mutant',
        search: { query: 'i', matchCase: false, maxReplacements: null },
      }),
      (error) => error.code === 'E_WP205_SEARCH_UNMAPPABLE_FOLD_RANGE',
    );
    return;
  }
  throw new Error(`unknown oracle ${oracleId}`);
}

test('WP205 path and text integrity kills every named implementation mutant', async () => {
  const killed = [];
  for (const mutant of mutants) {
    const moduleUnderTest = await loadMutant(mutant);
    try {
      assertOracleKills(moduleUnderTest, mutant.expectKilledBy);
    } catch {
      killed.push(mutant.id);
    }
  }
  assert.deepEqual(killed, mutants.map((mutant) => mutant.id));
});
