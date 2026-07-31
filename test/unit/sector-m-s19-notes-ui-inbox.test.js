const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('S19 notes UI: workspace, quick capture, and detail actions are shipped as a quiet surface', () => {
  const html = read('src/renderer/index.html');
  const styles = read('src/renderer/styles.css');

  assert.ok(html.includes('data-left-tab="notes"'));
  assert.ok(html.includes('data-notes-workspace'));
  assert.ok(html.includes('data-notes-capture-form'));
  assert.ok(html.includes('data-notes-list'));
  assert.ok(html.includes('data-notes-detail'));
  assert.ok(html.includes('data-notes-attach-scene'));
  assert.ok(html.includes('data-notes-convert-scene'));
  assert.ok(html.includes('data-notes-restore'));

  assert.ok(styles.includes('.main-content--notes'));
  assert.ok(styles.includes('.notes-workspace__body'));
  assert.ok(styles.includes('grid-template-columns: minmax(220px, 0.44fr) minmax(320px, 1fr);'));
  assert.ok(styles.includes('@media (max-width: 899px)'));
  assert.equal(styles.includes('.notes-workspace .floating-toolbar'), false);
});

test('S19 notes UI: renderer uses pathless Notes query and command bridge only', () => {
  const editor = read('src/renderer/editor.js');

  assert.ok(editor.includes('const NOTES_WORKSPACE_QUERY_ID = WORKSPACE_QUERY_IDS.PROJECT_NOTES;'));
  assert.ok(editor.includes('WORKSPACE_QUERY_ID_SET.has(queryId)'));
  assert.ok(editor.includes('invokeWorkspaceQueryBridge(NOTES_WORKSPACE_QUERY_ID'));
  assert.ok(editor.includes('EXTRA_COMMAND_IDS.NOTES_CREATE'));
  assert.ok(editor.includes('EXTRA_COMMAND_IDS.NOTES_UPDATE'));
  assert.ok(editor.includes('EXTRA_COMMAND_IDS.NOTES_DELETE'));
  assert.ok(editor.includes('EXTRA_COMMAND_IDS.NOTES_RESTORE'));
  assert.ok(editor.includes('EXTRA_COMMAND_IDS.NOTES_ATTACH_SCENE'));
  assert.ok(editor.includes('EXTRA_COMMAND_IDS.NOTES_CONVERT_SCENE'));
  assert.ok(editor.includes('nodeId: currentDocumentId'));
  assert.ok(editor.includes('confirmed: true'));
  assert.ok(editor.includes("notesCaptureBody.addEventListener('keydown'"));
  assert.ok(editor.includes("event.key === 'Enter'"));

  const notesStart = editor.indexOf('function normalizeNotesWorkspaceReadModel');
  const notesEnd = editor.indexOf('function renderOutlineList');
  assert.ok(notesStart > -1 && notesEnd > notesStart);
  const notesBlock = editor.slice(notesStart, notesEnd);
  for (const forbidden of ['notes.craftsman.json', 'writeFile', 'readFile', 'projectRoot', 'notesPath']) {
    assert.equal(notesBlock.includes(forbidden), false, `notes UI must not use file/path truth: ${forbidden}`);
  }
});

test('S19 notes UI: tab routing returns from notes without creating a second editor shell', () => {
  const editor = read('src/renderer/editor.js');

  assert.ok(editor.includes("if (notesLeftListElement) notesLeftListElement.hidden = tab !== 'notes';"));
  assert.ok(editor.includes("if (tab === 'notes') {"));
  assert.ok(editor.includes('hideProjectSearchWorkspace();\n    showNotesWorkspace();'));
  assert.ok(editor.includes('const wasNotesWorkspaceVisible = notesWorkspace instanceof HTMLElement && notesWorkspace.hidden !== true;'));
  assert.ok(editor.includes('editorPanel?.classList.remove(\'active\');'));
  assert.ok(editor.includes('mainContent?.classList.add(\'main-content--notes\');'));
  assert.ok(editor.includes('hideNotesWorkspace();\n  hideProjectSearchWorkspace();\n  editorPanel?.classList.add(\'active\');'));
});
