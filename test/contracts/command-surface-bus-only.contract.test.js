const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = process.cwd();
const RUN_COMMAND_OWNER = 'src/renderer/commands/commandBusGuard.mjs';
const SRC_SCAN_ROOT = path.join(REPO_ROOT, 'src');

const FILES = Object.freeze({
  main: 'src/main.js',
  editor: 'src/renderer/editor.js',
  bus: 'src/renderer/commands/commandBusGuard.mjs',
});

const FORBIDDEN_EDITOR_COMMAND_APIS = Object.freeze([
  'window.electronAPI.newFile(',
  'window.electronAPI.openFile(',
  'window.electronAPI.saveFile(',
  'window.electronAPI.saveAs(',
  'window.electronAPI.exportDocxMin(',
  'window.electronAPI.importMarkdownV1(',
  'window.electronAPI.exportMarkdownV1(',
  'window.electronAPI.openFlowModeV1(',
  'window.electronAPI.saveFlowModeV1(',
]);

const FORBIDDEN_DIRECT_MENU_HANDLER_MARKERS = Object.freeze([
  'MENU_ACTION_HANDLERS',
  'buildClickHandler(',
  'menu-action:',
]);

const FORBIDDEN_DIRECT_IPC_COMMAND_CHANNELS = Object.freeze([
  "ipcMain.on('ui:new'",
  "ipcMain.on('ui:open'",
  "ipcMain.on('ui:save'",
  "ipcMain.on('ui:save-as'",
]);

function listFilesRecursive(absDir, out = []) {
  if (!fs.existsSync(absDir)) return out;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(absPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    out.push(absPath);
  }
  return out;
}

function loadRepoTextMap() {
  const textMap = new Map();
  const files = listFilesRecursive(SRC_SCAN_ROOT);
  for (const absPath of files) {
    if (!absPath.endsWith('.js') && !absPath.endsWith('.mjs')) continue;
    const relPath = path.relative(REPO_ROOT, absPath).replaceAll(path.sep, '/');
    textMap.set(relPath, fs.readFileSync(absPath, 'utf8'));
  }
  return textMap;
}

function extractAliasValues(mainText) {
  const match = /const\s+MENU_ACTION_ALIAS_TO_COMMAND\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\);/m.exec(mainText);
  if (!match) {
    return { ok: false, values: [] };
  }
  const values = [];
  const body = String(match[1] || '');
  const valueRegex = /:\s*'([^']+)'/g;
  let m = null;
  while ((m = valueRegex.exec(body)) !== null) {
    values.push(String(m[1] || ''));
  }
  return { ok: true, values };
}

function collectPatternMatches(textMap, pattern) {
  const matches = [];
  for (const [filePath, text] of [...textMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const input = String(text || '');
    pattern.lastIndex = 0;
    let match = null;
    while ((match = pattern.exec(input)) !== null) {
      matches.push({ filePath, match: String(match[0] || '') });
    }
  }
  return matches;
}

function evaluateBusOnlySurface(textMap) {
  const errors = [];
  const mainText = String(textMap.get(FILES.main) || '');
  const editorText = String(textMap.get(FILES.editor) || '');

  for (const marker of FORBIDDEN_DIRECT_MENU_HANDLER_MARKERS) {
    if (mainText.includes(marker)) {
      errors.push({ code: 'E_MAIN_MENU_DIRECT_HANDLER', marker });
    }
  }

  for (const marker of FORBIDDEN_DIRECT_IPC_COMMAND_CHANNELS) {
    if (mainText.includes(marker)) {
      errors.push({ code: 'E_DIRECT_IPC_BYPASS_CHANNEL', marker });
    }
  }

  for (const marker of FORBIDDEN_EDITOR_COMMAND_APIS) {
    if (editorText.includes(marker)) {
      errors.push({ code: 'E_RENDERER_DIRECT_COMMAND_IPC', marker });
    }
  }

  const runLegacyActionMatches = collectPatternMatches(textMap, /\brunLegacyAction\s*\(/g);
  if (runLegacyActionMatches.length > 0) {
    errors.push({
      code: 'E_RUN_LEGACY_ACTION_PRESENT',
      files: [...new Set(runLegacyActionMatches.map((entry) => entry.filePath))].sort((a, b) => a.localeCompare(b)),
    });
  }

  const runCommandMatches = collectPatternMatches(textMap, /\brunCommand\s*\(/g);
  const runCommandFiles = [...new Set(runCommandMatches.map((entry) => entry.filePath))].sort((a, b) => a.localeCompare(b));
  if (runCommandFiles.length !== 1 || runCommandFiles[0] !== RUN_COMMAND_OWNER) {
    errors.push({
      code: 'E_RUN_COMMAND_SURFACE_SPLIT',
      files: runCommandFiles,
      expectedOwner: RUN_COMMAND_OWNER,
    });
  }

  const aliasState = extractAliasValues(mainText);
  if (!aliasState.ok) {
    errors.push({ code: 'E_MENU_ALIAS_MAP_MISSING' });
  } else {
    if (!aliasState.values.length) {
      errors.push({ code: 'E_MENU_ALIAS_MAP_EMPTY' });
    }
    if (aliasState.values.some((value) => !value.startsWith('cmd.'))) {
      errors.push({ code: 'E_MENU_ALIAS_NOT_CMD' });
    }
  }

  if (!mainText.includes('resolveMenuActionToCommand(item.actionId)')) {
    errors.push({ code: 'E_MENU_ALIAS_RESOLVE_MISSING' });
  }

  const hasHotkeyOrToolbarDispatch =
    editorText.includes('dispatchUiCommand(COMMAND_IDS.PROJECT_OPEN)')
    && editorText.includes('dispatchUiCommand(COMMAND_IDS.PROJECT_SAVE)')
    && editorText.includes('dispatchUiCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN)');
  if (!hasHotkeyOrToolbarDispatch) {
    errors.push({ code: 'E_RENDERER_COMMAND_DISPATCH_MISSING' });
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function buildFixtureMap() {
  return new Map([
    [FILES.main, fs.readFileSync(path.join(REPO_ROOT, FILES.main), 'utf8')],
    [FILES.editor, fs.readFileSync(path.join(REPO_ROOT, FILES.editor), 'utf8')],
    [FILES.bus, fs.readFileSync(path.join(REPO_ROOT, FILES.bus), 'utf8')],
    ['src/renderer/commands/runCommand.mjs', fs.readFileSync(path.join(REPO_ROOT, 'src/renderer/commands/runCommand.mjs'), 'utf8')],
  ]);
}

test('command surface bus-only: repository enforces single bus execution path', () => {
  const state = evaluateBusOnlySurface(loadRepoTextMap());
  assert.equal(state.ok, true, JSON.stringify(state.errors, null, 2));
});

test('command surface bus-only negative: renderer direct saveAs bypass is rejected', () => {
  const fixture = buildFixtureMap();
  fixture.set(FILES.editor, `${fixture.get(FILES.editor)}\nwindow.electronAPI.saveAs();\n`);
  const state = evaluateBusOnlySurface(fixture);
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_RENDERER_DIRECT_COMMAND_IPC'));
});

test('command surface bus-only negative: main menu direct handler path is rejected', () => {
  const fixture = buildFixtureMap();
  fixture.set(FILES.main, `${fixture.get(FILES.main)}\nconst MENU_ACTION_HANDLERS = {};\n`);
  const state = evaluateBusOnlySurface(fixture);
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_MAIN_MENU_DIRECT_HANDLER'));
});

test('command surface bus-only negative: runCommand usage outside bus owner is rejected', () => {
  const fixture = buildFixtureMap();
  fixture.set('src/renderer/commands/runCommand.mjs', `${fixture.get('src/renderer/commands/runCommand.mjs')}\nrunCommand('cmd.project.open');\n`);
  const state = evaluateBusOnlySurface(fixture);
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_RUN_COMMAND_SURFACE_SPLIT'));
});

test('command surface bus-only negative: actionId without alias->cmd mapping is rejected', () => {
  const fixture = buildFixtureMap();
  fixture.set(
    FILES.main,
    String(fixture.get(FILES.main) || '').replace('newDocument: \'cmd.project.new\'', "newDocument: 'not-a-command'")
  );
  const state = evaluateBusOnlySurface(fixture);
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_MENU_ALIAS_NOT_CMD'));
});

test('command surface bus-only negative: direct IPC command bypass channel is rejected', () => {
  const fixture = buildFixtureMap();
  fixture.set(FILES.main, `${fixture.get(FILES.main)}\nipcMain.on('ui:open', () => {});\n`);
  const state = evaluateBusOnlySurface(fixture);
  assert.equal(state.ok, false);
  assert.ok(state.errors.some((entry) => entry.code === 'E_DIRECT_IPC_BYPASS_CHANNEL'));
});
