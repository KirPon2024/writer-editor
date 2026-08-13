const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

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
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'history-restore-s24-'));
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
  return { main, tree, scene, scenePath, tempRoot };
}

async function createSnapshot(main, tree, scene) {
  const checkpoint = await main.handleHistoryCreateCheckpointCommand({
    projectId: tree.projectId,
    nodeId: scene.nodeId,
  });
  assert.equal(checkpoint.ok, true);
  assert.equal(checkpoint.receipt.snapshotCreated, true);
  return checkpoint.receipt.snapshotId;
}

test('S24 history restore: preview is pathless and apply writes selected snapshot with undo receipt', async (t) => {
  const harness = await createHarness(t, '01_restore.txt', 'old text');
  const snapshotId = await createSnapshot(harness.main, harness.tree, harness.scene);
  await fsPromises.writeFile(harness.scenePath, 'new text with edits', 'utf8');

  const preview = await harness.main.handleHistoryRestorePreviewCommand({
    projectId: harness.tree.projectId,
    nodeId: harness.scene.nodeId,
    snapshotId,
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.previewPlan.snapshotId, snapshotId);
  assert.equal(preview.previewPlan.changed, true);
  assert.equal(JSON.stringify(preview).includes(harness.tempRoot), false);

  const applied = await harness.main.handleHistoryRestoreApplyCommand({
    projectId: harness.tree.projectId,
    nodeId: harness.scene.nodeId,
    snapshotId,
    previewPlan: preview.previewPlan,
    confirmed: true,
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.receipt.undoAvailable, true);
  assert.equal(applied.receipt.preRestoreSnapshotCreated, true);
  assert.equal(await fsPromises.readFile(harness.scenePath, 'utf8'), 'old text');
  assert.equal(JSON.stringify(applied).includes(harness.tempRoot), false);

  const undone = await harness.main.handleHistoryRestoreUndoCommand({
    receiptId: applied.receipt.receiptId,
  });
  assert.equal(undone.ok, true);
  assert.equal(undone.undone, true);
  assert.equal(await fsPromises.readFile(harness.scenePath, 'utf8'), 'new text with edits');
});

test('S24 history restore: stale target blocks apply before writing', async (t) => {
  const harness = await createHarness(t, '01_restore_stale.txt', 'old text');
  const snapshotId = await createSnapshot(harness.main, harness.tree, harness.scene);
  await fsPromises.writeFile(harness.scenePath, 'new text', 'utf8');
  const preview = await harness.main.handleHistoryRestorePreviewCommand({
    projectId: harness.tree.projectId,
    nodeId: harness.scene.nodeId,
    snapshotId,
  });
  await fsPromises.writeFile(harness.scenePath, 'newer unpreviewed text', 'utf8');

  const applied = await harness.main.handleHistoryRestoreApplyCommand({
    projectId: harness.tree.projectId,
    nodeId: harness.scene.nodeId,
    snapshotId,
    previewPlan: preview.previewPlan,
    confirmed: true,
  });
  assert.equal(applied.ok, false);
  assert.equal(applied.reason, 'HISTORY_RESTORE_PREVIEW_MISMATCH');
  assert.equal(await fsPromises.readFile(harness.scenePath, 'utf8'), 'newer unpreviewed text');
});

test('S24 history restore: missing confirmation and non-scene scopes fail honestly', async (t) => {
  const harness = await createHarness(t, '01_restore_confirm.txt', 'old text');
  const snapshotId = await createSnapshot(harness.main, harness.tree, harness.scene);
  await fsPromises.writeFile(harness.scenePath, 'new text', 'utf8');
  const preview = await harness.main.handleHistoryRestorePreviewCommand({
    projectId: harness.tree.projectId,
    nodeId: harness.scene.nodeId,
    snapshotId,
  });

  const missingConfirmation = await harness.main.handleHistoryRestoreApplyCommand({
    previewPlan: preview.previewPlan,
  });
  assert.equal(missingConfirmation.ok, false);
  assert.equal(missingConfirmation.reason, 'HISTORY_RESTORE_CONFIRMATION_REQUIRED');

  const tree = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  const folder = findNode(tree.root, (node) => node.kind === 'folder' || node.kind === 'chapter-folder');
  assert.ok(folder);
  const unsupported = await harness.main.handleHistoryRestorePreviewCommand({
    projectId: tree.projectId,
    nodeId: folder.nodeId,
    snapshotId,
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.reason, 'HISTORY_RESTORE_SCOPE_UNSUPPORTED');
});

test('S24 history restore: renderer exposes preview-confirm-apply and undo without path authority', () => {
  const renderer = read('src/renderer/editor.js');
  const commands = read('src/renderer/commands/projectCommands.mjs');
  const main = read('src/main.js');

  assert.match(commands, /HISTORY_RESTORE_PREVIEW: 'cmd\.project\.history\.restorePreview'/u);
  assert.match(commands, /HISTORY_RESTORE_APPLY: 'cmd\.project\.history\.restoreApply'/u);
  assert.match(commands, /HISTORY_RESTORE_UNDO: 'cmd\.project\.history\.restoreUndo'/u);
  assert.match(renderer, /function restoreSelectedSceneHistorySnapshot/u);
  assert.match(renderer, /window\.confirm\(`Восстановить выбранный снимок/u);
  assert.match(renderer, /EXTRA_COMMAND_IDS\.HISTORY_RESTORE_PREVIEW/u);
  assert.match(renderer, /EXTRA_COMMAND_IDS\.HISTORY_RESTORE_APPLY/u);
  assert.match(renderer, /EXTRA_COMMAND_IDS\.HISTORY_RESTORE_UNDO/u);
  const restoreSource = renderer.slice(
    renderer.indexOf('async function restoreSelectedSceneHistorySnapshot'),
    renderer.indexOf('async function undoLastSceneHistoryRestore'),
  );
  assert.doesNotMatch(renderer, /data-scene-history-path/u);
  assert.doesNotMatch(restoreSource, /snapshotPath/u);
  assert.match(main, /HISTORY_RESTORE_PREVIEW_COMMAND_ID/u);
  assert.match(main, /writeMarkdownWithTransactionRecovery\(target\.filePath, snapshot\.snapshotText/u);
  assert.match(main, /lastHistoryRestoreReceipt/u);
});
