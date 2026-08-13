const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function loadMainWithElectronStub() {
  const mainPath = path.join(ROOT, 'src', 'main.js');
  const fileManagerPath = path.join(ROOT, 'src', 'utils', 'fileManager.js');
  const originalLoad = Module._load;
  const electronStub = {
    app: {
      getPath: () => ROOT,
      setPath: () => {},
      whenReady: () => new Promise(() => {}),
      on: () => {},
      quit: () => {},
      exit: () => {},
      setName: () => {},
      requestSingleInstanceLock: () => true,
    },
    BrowserWindow: {
      getFocusedWindow: () => null,
      getAllWindows: () => [],
    },
    Menu: {
      buildFromTemplate: () => ({}),
      setApplicationMenu: () => {},
    },
    dialog: {
      showMessageBox: async () => ({}),
      showSaveDialog: async () => ({ canceled: true }),
      showOpenDialog: async () => ({ canceled: true }),
    },
    ipcMain: {
      on: () => {},
      handle: () => {},
    },
    session: {
      defaultSession: { webRequest: { onHeadersReceived: () => {} } },
    },
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return electronStub;
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[mainPath];
  delete require.cache[fileManagerPath];
  try {
    return {
      main: require(mainPath),
      fileManager: require(fileManagerPath),
    };
  } finally {
    Module._load = originalLoad;
  }
}

function findNode(root, predicate) {
  if (!root) return null;
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

async function createHarness(t, fileName, text) {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'replace-single-safe-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));
  const documentsRoot = path.join(tempRoot, 'Documents', 'craftsman');
  const projectRoot = path.join(documentsRoot, 'Роман');
  const importedRoot = path.join(projectRoot, 'roman', 'Imported');
  await fsPromises.mkdir(importedRoot, { recursive: true });
  const scenePath = path.join(importedRoot, fileName);
  await fsPromises.writeFile(scenePath, text, 'utf8');

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  await main.buildProjectTreeRootsWithIdentities('Роман');
  const tree = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(tree.ok, true);
  const scene = findNode(tree.root, (node) => node.kind === 'scene' && node.label);
  assert.ok(scene);
  return { main, tree, scene, scenePath };
}

function sha256(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex');
}

function buildSearchDescriptor(scene, text, matchText) {
  const from = text.indexOf(matchText);
  assert.notEqual(from, -1);
  return {
    id: `search-result-${scene.nodeId}-${from}`,
    source: {
      type: 'document',
      sourceId: scene.nodeId,
      nodeId: scene.nodeId,
      kind: 'scene',
      title: scene.label,
      scope: 'project',
      field: 'body',
      contentHash: sha256(text),
    },
    preview: {
      from,
      to: from + matchText.length,
      matchText,
      text,
    },
  };
}

function buildPayload(tree, result, replacementText) {
  return {
    requestId: 'replace-single-safe-test',
    projectId: tree.projectId,
    searchResultId: result.id,
    source: result.source,
    range: {
      from: result.preview.from,
      to: result.preview.to,
    },
    expectedText: result.preview.matchText,
    replacementText,
  };
}

test('S21 replace single safe: exact current match writes once with recovery receipt', async (t) => {
  const harness = await createHarness(t, '01_unique.txt', 'alpha beta gamma');
  const result = buildSearchDescriptor(harness.scene, 'alpha beta gamma', 'beta');
  const replaced = await harness.main.handleReplaceSingleSafeCommand(
    buildPayload(harness.tree, result, 'BETA'),
    { now: () => 1784419200000 },
  );

  assert.equal(replaced.ok, true);
  assert.equal(replaced.applied, true);
  assert.equal(replaced.receipt.commandId, 'cmd.project.edit.replaceSingleSafe');
  assert.equal(replaced.receipt.nodeId, harness.scene.nodeId);
  assert.notEqual(replaced.receipt.contentHashBefore, replaced.receipt.contentHashAfter);
  assert.equal(replaced.receipt.recovery.snapshotCreated, true);
  assert.equal(fs.existsSync(replaced.receipt.recovery.snapshotPath), true);
  assert.equal(await fsPromises.readFile(harness.scenePath, 'utf8'), 'alpha BETA gamma');
});

test('S21 replace single safe: stale result writes zero bytes', async (t) => {
  const harness = await createHarness(t, '01_stale.txt', 'alpha beta gamma');
  const result = buildSearchDescriptor(harness.scene, 'alpha beta gamma', 'beta');
  await fsPromises.writeFile(harness.scenePath, 'alpha changed gamma', 'utf8');

  const blocked = await harness.main.handleReplaceSingleSafeCommand(
    buildPayload(harness.tree, result, 'BETA'),
  );

  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'REPLACE_SINGLE_SAFE_STALE_SOURCE_HASH');
  assert.equal(await fsPromises.readFile(harness.scenePath, 'utf8'), 'alpha changed gamma');
});

test('S21 replace single safe: ambiguous exact text writes zero bytes', async (t) => {
  const harness = await createHarness(t, '01_ambiguous.txt', 'beta one beta');
  const result = buildSearchDescriptor(harness.scene, 'beta one beta', 'beta');

  const blocked = await harness.main.handleReplaceSingleSafeCommand(
    buildPayload(harness.tree, result, 'BETA'),
  );

  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'REPLACE_SINGLE_SAFE_AMBIGUOUS_MATCH');
  assert.equal(await fsPromises.readFile(harness.scenePath, 'utf8'), 'beta one beta');
});

test('S21 replace single safe: bridge and UI stay pathless and outside Review Session', () => {
  const main = read('src/main.js');
  const editor = read('src/renderer/editor.js');
  const commands = read('src/renderer/commands/projectCommands.mjs');
  const capability = read('src/renderer/commands/capabilityPolicy.mjs');

  assert.ok(main.includes("const REPLACE_SINGLE_SAFE_COMMAND_ID = 'cmd.project.edit.replaceSingleSafe';"));
  assert.ok(main.includes('REPLACE_SINGLE_SAFE_COMMAND_ID,'));
  assert.ok(main.includes('[REPLACE_SINGLE_SAFE_COMMAND_ID]: async (payload = {}) => {'));
  assert.ok(editor.includes('data-replace-search-result-id'));
  assert.ok(editor.includes('invokePreloadUiCommandBridge(EXTRA_COMMAND_IDS.EDIT_REPLACE_SINGLE_SAFE'));
  assert.ok(commands.includes("EDIT_REPLACE_SINGLE_SAFE: 'cmd.project.edit.replaceSingleSafe'"));
  assert.ok(capability.includes("'cmd.project.edit.replaceSingleSafe': 'cap.project.edit.replaceSingleSafe'"));

  const start = main.indexOf('async function handleReplaceSingleSafeCommand(payload = {}, options = {})');
  const end = main.indexOf('function makeReplaceMassError', start);
  assert.ok(start > -1 && end > start);
  const handler = main.slice(start, end);
  for (const forbidden of ['activeReviewSessionStore', 'activeReviewSessionLifecycle', 'reviewSurface', 'reviewSession']) {
    assert.equal(handler.includes(forbidden), false, `replace single safe must not create or depend on Review Session: ${forbidden}`);
  }
  for (const forbidden of ['payload.filePath', 'payload.projectRoot', 'payload.scenePath']) {
    assert.equal(handler.includes(forbidden), false, `renderer path authority must be rejected before use: ${forbidden}`);
  }
});
