const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, startMarker);
  assert.notEqual(end, -1, endMarker);
  return source.slice(start, end);
}

test('S30 export surface: one modal exposes existing bounded export lanes', () => {
  const html = read('src/renderer/index.html');
  const styles = read('src/renderer/styles.css');

  for (const marker of [
    'data-export-surface-modal',
    'data-export-surface-status',
    'data-export-surface-detail',
    'data-export-surface-format="docx"',
    'data-export-surface-format="pdf"',
    'data-export-surface-format="markdown"',
    'data-export-surface-format="txt-current"',
    'data-export-surface-format="txt-selected"',
    'data-export-surface-format="txt-all"',
    'Choose what to export from saved project truth.',
    'Unsupported layout fidelity is reported by the chosen export lane.',
  ]) {
    assert.ok(html.includes(marker), marker);
  }

  assert.ok(styles.includes('.export-surface__content'));
  assert.ok(styles.includes('.export-surface__grid'));
  assert.ok(styles.includes('.export-surface__option-copy'));
});

test('S30 export surface: buttons delegate to existing export commands and do not compile text', () => {
  const editor = read('src/renderer/editor.js');
  const section = sectionBetween(
    editor,
    'function runExportSurfaceFormat(format)',
    'function runCommandPaletteAction(commandId)',
  );

  assert.ok(section.includes("if (normalizedFormat === 'docx') {"));
  assert.ok(section.includes('return openExportPreviewModal();'));
  assert.ok(section.includes("if (normalizedFormat === 'pdf') {"));
  assert.ok(section.includes('COMMAND_IDS.PROJECT_EXPORT_PDF_V1'));
  assert.ok(section.includes("if (normalizedFormat === 'markdown') {"));
  assert.ok(section.includes('return handleMarkdownExportUiPath();'));
  assert.ok(section.includes("if (normalizedFormat === 'txt-current') {"));
  assert.ok(section.includes('EXTRA_COMMAND_IDS.PROJECT_EXPORT_CURRENT_SCENE_TXT'));
  assert.ok(section.includes("if (normalizedFormat === 'txt-selected') {"));
  assert.ok(section.includes('return openSelectedScenesTxtExportFlow();'));
  assert.ok(section.includes("if (normalizedFormat === 'txt-all') {"));
  assert.ok(section.includes('EXTRA_COMMAND_IDS.PROJECT_EXPORT_ALL_SCENES_TXT'));

  for (const forbidden of [
    'getPlainText(',
    'setPlainText(',
    'setContent(',
    'currentDocumentPath =',
    'treeRoot',
    'outPath',
    'scene:',
  ]) {
    assert.equal(section.includes(forbidden), false, forbidden);
  }
});

test('S30 export surface: palette, runtime, and Tiptap routes converge on surface while direct TXT menus stay canonical', () => {
  const editor = read('src/renderer/editor.js');
  const runtimeBridge = read('src/renderer/tiptap/runtimeBridge.js');
  const main = read('src/main.js');

  const paletteSection = sectionBetween(
    editor,
    'function runCommandPaletteAction(commandId)',
    'function openSettingsModal()',
  );
  assert.ok(paletteSection.includes("const exportDocxCommandId = 'cmd.project.export.docxMin';"));
  assert.ok(paletteSection.includes("const exportPdfCommandId = 'cmd.project.exportPdfV1';"));
  assert.ok(paletteSection.includes("const exportMarkdownCommandId = 'cmd.project.exportMarkdownV1';"));
  assert.ok(paletteSection.includes('normalizedCommandId === BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID'));
  assert.equal((paletteSection.match(/return openExportSurfaceModal\(normalizedCommandId\);/g) || []).length, 5);

  const runtimeSection = sectionBetween(
    editor,
    'function handleCanonicalRuntimeCommandId(commandId, runtimePayload = null)',
    'if (isTiptapMode) {',
  );
  for (const marker of [
    'if (commandId === COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1) {',
    'if (commandId === COMMAND_IDS.PROJECT_EXPORT_PDF_V1) {',
    'if (commandId === COMMAND_IDS.PROJECT_EXPORT_FULL_ARCHIVE_V1) {',
    'if (commandId === EXTRA_COMMAND_IDS.PROJECT_EXPORT_CURRENT_SCENE_TXT) {',
    'if (commandId === EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT) {',
    'if (commandId === EXTRA_COMMAND_IDS.PROJECT_EXPORT_ALL_SCENES_TXT) {',
    'if (commandId === BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID) {',
    'if (commandId === COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN && payload.preview === true) {',
  ]) {
    assert.ok(runtimeSection.includes(marker), marker);
  }
  assert.equal((runtimeSection.match(/openExportSurfaceModal\(commandId\);/g) || []).length, 8);
  assert.ok(editor.includes('openExportSurface: (commandId = \'\') => openExportSurfaceModal(commandId),'));

  for (const commandId of [
    'cmd.project.exportMarkdownV1',
    'cmd.project.exportPdfV1',
    'cmd.project.exportCurrentSceneTxtV1',
    'cmd.project.exportSelectedScenesTxtV1',
    'cmd.project.exportAllScenesTxtV1',
  ]) {
    assert.ok(runtimeBridge.includes(`commandId === '${commandId}'`), commandId);
  }
  assert.ok(runtimeBridge.includes('runBridgeCallback(runtimeHandlers.openExportSurface, commandId, commandId)'));

  for (const marker of [
    '[EXPORT_CURRENT_SCENE_TXT_COMMAND_ID]: async (payload = {}) => {',
    '[EXPORT_ALL_SCENES_TXT_COMMAND_ID]: async (payload = {}) => {',
    'COMMAND_SURFACE_KERNEL_COMMAND_IDS.PROJECT_EXPORT_CURRENT_SCENE_TXT_V1',
    'COMMAND_SURFACE_KERNEL_COMMAND_IDS.PROJECT_EXPORT_ALL_SCENES_TXT_V1',
  ]) {
    assert.ok(main.includes(marker), marker);
  }
  const currentMenuSection = sectionBetween(
    main,
    '[EXPORT_CURRENT_SCENE_TXT_COMMAND_ID]: async (payload = {}) => {',
    '[EXPORT_SELECTED_SCENES_TXT_COMMAND_ID]: async (payload = {}) => {',
  );
  const allMenuSection = sectionBetween(
    main,
    '[EXPORT_ALL_SCENES_TXT_COMMAND_ID]: async (payload = {}) => {',
    '  [EXPORT_PDF_COMMAND_ID]: async (payload = {}) => {',
  );
  assert.equal(currentMenuSection.includes('sendCanonicalRuntimeCommand('), false);
  assert.equal(allMenuSection.includes('sendCanonicalRuntimeCommand('), false);
});

test('S30 export surface: canonical export flows retain save and loss ownership', () => {
  const editor = read('src/renderer/editor.js');

  for (const marker of [
    'function openExportPreviewModal()',
    'async function confirmExportPreviewAndRun()',
    'await dispatchUiCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN, {',
    'confirmed: true,',
    'async function handleMarkdownExportUiPath()',
    'MARKDOWN_EXPORT_LOCAL_FILE_COMMAND_ID',
    'async function openSelectedScenesTxtExportFlow()',
    'const result = await dispatchUiCommand(EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT, {',
    'selectedSceneIds,',
    'function runExportSurfaceBridgeCommand(commandId, requestPrefix, statusBase)',
    'invokePreloadUiCommandBridge(commandId, {',
    'confirmed: true,',
  ]) {
    assert.ok(editor.includes(marker), marker);
  }
});
