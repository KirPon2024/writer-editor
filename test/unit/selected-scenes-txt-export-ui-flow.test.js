const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('selected scenes TXT export UI flow: renderer owns only transient picker and confirmation flow', () => {
  const editor = read('src/renderer/editor.js');

  for (const marker of [
    'const SELECTED_SCENES_TXT_EXPORT_SCOPE_QUERY_ID = WORKSPACE_QUERY_IDS.SELECTED_SCENES_TXT_EXPORT_SCOPE;',
    'const selectedScenesTxtExportModal = document.querySelector(\'[data-selected-scenes-txt-export-modal]\');',
    'function normalizeSelectedScenesTxtExportScope(scope)',
    'function getSelectedScenesTxtExportCheckedSceneIds()',
    'function updateSelectedScenesTxtExportModalState()',
    'function renderSelectedScenesTxtExportCandidateList(scope)',
    'function openSelectedScenesTxtExportModal(scope)',
    'async function confirmSelectedScenesTxtExportAndRun()',
    'async function openSelectedScenesTxtExportFlow()',
    'try {',
    "result = await invokeWorkspaceQueryBridge(SELECTED_SCENES_TXT_EXPORT_SCOPE_QUERY_ID, {});",
    "updateStatusText('Selected scenes TXT export unavailable');",
    'const result = await dispatchUiCommand(EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT, {',
    'selectedSceneIds,',
    'if (commandId === EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT) {',
    'openExportSurfaceModal(commandId);',
  ]) {
    assert.ok(editor.includes(marker), marker);
  }
  assert.equal(
    editor.includes("invokePreloadUiCommandBridge('cmd.project.exportSelectedScenesTxtV1'"),
    false,
  );
});

test('selected scenes TXT export UI flow: renderer does not treat tree row state as export truth', () => {
  const editor = read('src/renderer/editor.js');
  const start = editor.indexOf('async function openSelectedScenesTxtExportFlow()');
  const end = editor.indexOf('function getDocxImportPreviewPlanFromValue(value)', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const section = editor.slice(start, end);

  for (const forbidden of [
    'currentDocumentPath =',
    'treeRoot',
    'openDocumentNode(',
    'dispatchUiCommand(COMMAND_IDS.PROJECT_IMPORT_TXT_V1',
  ]) {
    assert.equal(section.includes(forbidden), false, forbidden);
  }
});

test('selected scenes TXT export UI flow: shipped bundle carries the transient selector surface', () => {
  const bundle = read('src/renderer/editor.bundle.js');
  const html = read('src/renderer/index.html');
  for (const marker of [
    'query.selectedScenesTxtExportScope',
    'cmd.project.exportSelectedScenesTxtV1',
    'Selected scenes TXT export ready',
    'Selected scenes TXT export cancelled',
    'Selected scenes TXT exported:',
  ]) {
    assert.ok(bundle.includes(marker), marker);
  }

  for (const marker of [
    'data-selected-scenes-txt-export-modal',
    'Selected Scenes TXT Export',
    'Выберите сцены для экспорта в один TXT файл.',
  ]) {
    assert.ok(html.includes(marker), marker);
  }
});
