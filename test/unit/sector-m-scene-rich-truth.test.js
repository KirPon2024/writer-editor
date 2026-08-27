const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function readSource(basenameParts) {
  return fs.readFileSync(path.join(ROOT, ...basenameParts), 'utf8');
}

test('sector-m scene rich truth: editor switches save and restore truth to the shared envelope module', () => {
  const source = readSource(['src', 'renderer', 'editor.js']);

  assert.ok(source.includes('attachIpc: false'));
  assert.ok(source.includes("from './documentContentEnvelope.mjs'"));
  assert.ok(source.includes('getTiptapDocumentSnapshot'));
  assert.ok(source.includes('setTiptapDocumentSnapshot'));
  assert.ok(source.includes('return parseObservablePayload(rawText);'));
  assert.ok(source.includes('return composeObservablePayload({'));
  assert.ok(source.includes('doc: tiptapSnapshot ? tiptapSnapshot.doc : null,'));
  assert.ok(source.includes('setTiptapDocumentSnapshot({'));
  assert.ok(source.includes('doc: parsed.doc,'));
  assert.ok(source.includes('handleDocumentContentParseIssue(parsed.issue);'));
});

test('sector-m scene rich truth: tiptap exposes document snapshots instead of text-only restore truth', () => {
  const source = readSource(['src', 'renderer', 'tiptap', 'index.js']);

  assert.ok(source.includes("from '../documentContentEnvelope.mjs'"));
  assert.ok(source.includes('buildParagraphDocumentFromText'));
  assert.ok(source.includes('canonicalizeDocumentJson'));
  assert.ok(source.includes('attachWindowListeners: options.attachWindowListeners === true'));
  assert.ok(source.includes('doc: readEditorDocument(editor),'));
  assert.ok(source.includes('editor.commands.setContent(parsed.doc || buildParagraphDocumentFromText(parsed.text || \'\'), false)'));
  assert.ok(source.includes('export function getTiptapDocumentSnapshot() {'));
  assert.ok(source.includes('export function setTiptapDocumentSnapshot(snapshot = {}) {'));
});

test('sector-m scene rich truth: flow mode derives visible text and writes canonical envelope content', () => {
  const source = readSource(['src', 'renderer', 'commands', 'flowMode.mjs']);

  assert.ok(source.includes("from '../documentContentEnvelope.mjs'"));
  assert.ok(source.includes('parseObservablePayload(scene.content || \'\')'));
  assert.ok(source.includes('composeDocumentContentFromBase({'));
  assert.ok(source.includes("reason === 'flow_scene_rich_content_unsupported'"));
});

test('sector-m scene rich truth: no new autosave or recovery channel is introduced in main process', () => {
  const source = readSource(['src', 'main.js']);

  assert.ok(source.includes("return path.join(getAutosaveDir(), 'autosave.txt');"));
  assert.equal(source.includes('autosave.rich.txt'), false);
  assert.equal(source.includes('rich-recovery'), false);
  assert.ok(source.includes('const snapshot = await requestEditorSnapshot();'));
  assert.ok(source.includes('const content = snapshot.content;'));
  assert.ok(source.includes('async function commitWriterProjectSnapshot(filePath, content, revision, bookProfile, operationLabel)'));
  assert.ok(source.includes('() => commitWriterProjectSnapshot('));
  assert.ok(source.includes("'autosave project transaction'"));
  assert.ok(source.includes("'save existing project transaction'"));
  assert.equal(source.includes('() => fileManager.writeFileAtomic(currentFilePath, content)'), false);
  assert.ok(source.includes("mainWindow.webContents.send('ui:recovery-restored'"));
});
