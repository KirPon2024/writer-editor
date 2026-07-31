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
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'scene-history-s23-'));
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

  const tree = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(tree.ok, true);
  const scene = findNode(tree.root, (node) => node.kind === 'scene' && node.label);
  assert.ok(scene);
  return { main, tree, scene, scenePath, tempRoot };
}

function sha256(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex');
}

function buildSearchDescriptor(scene, text, matchText) {
  const from = text.indexOf(matchText);
  assert.notEqual(from, -1);
  return {
    searchResultId: `search-result-${scene.nodeId}-${from}`,
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
    range: {
      from,
      to: from + matchText.length,
    },
    expectedText: matchText,
  };
}

test('S23 history: manual checkpoint creates pathless snapshot index and deterministic diff', async (t) => {
  const harness = await createHarness(t, '01_history.txt', 'alpha beta gamma');

  const checkpoint = await harness.main.handleHistoryCreateCheckpointCommand({
    projectId: harness.tree.projectId,
    nodeId: harness.scene.nodeId,
  });
  assert.equal(checkpoint.ok, true);
  assert.equal(checkpoint.receipt.snapshotCreated, true);
  assert.equal(JSON.stringify(checkpoint).includes(harness.tempRoot), false);

  await fsPromises.writeFile(harness.scenePath, 'alpha BETA gamma delta', 'utf8');
  const history = await harness.main.handleWorkspaceSceneHistoryQuery({
    projectId: harness.tree.projectId,
    nodeId: harness.scene.nodeId,
  });

  assert.equal(history.ok, true);
  assert.equal(history.schemaVersion, 'scene-history-read-model.v1');
  assert.equal(history.state, 'ready');
  assert.equal(history.snapshots.length, 1);
  assert.equal(history.snapshots[0].source, 'recovery-snapshot');
  assert.equal(history.selectedSnapshot.diff.changed, true);
  assert.equal(history.selectedSnapshot.diff.insertedText, 'BETA gamma delta');
  assert.equal(history.selectedSnapshot.diff.removedText, 'beta gamma');
  assert.equal(history.distinguishes.reviewSession, false);
  assert.equal(history.distinguishes.shellState, false);
  assert.equal(JSON.stringify(history).includes(harness.tempRoot), false);
});

test('S23 history: before-replace recovery snapshot is visible after exact replace', async (t) => {
  const harness = await createHarness(t, '01_replace_history.txt', 'alpha beta gamma');
  const descriptor = buildSearchDescriptor(harness.scene, 'alpha beta gamma', 'beta');

  const replaced = await harness.main.handleReplaceSingleSafeCommand({
    requestId: 'scene-history-replace',
    projectId: harness.tree.projectId,
    replacementText: 'BETA',
    ...descriptor,
  }, { now: () => 1784419200000 });
  assert.equal(replaced.ok, true);

  const history = await harness.main.handleWorkspaceSceneHistoryQuery({
    projectId: harness.tree.projectId,
    nodeId: harness.scene.nodeId,
  });
  assert.equal(history.ok, true);
  assert.equal(history.snapshots.length, 1);
  assert.equal(history.selectedSnapshot.diff.removedText, 'beta');
  assert.equal(history.selectedSnapshot.diff.insertedText, 'BETA');
  assert.equal(history.snapshots[0].changedFromCurrent, true);
});

test('S23 history: retention is bounded and does not delete the only recoverable copy', async (t) => {
  const harness = await createHarness(t, '01_retention.txt', 'alpha beta gamma');
  const markdownIo = await import(path.join(ROOT, 'src', 'io', 'markdown', 'index.mjs'));

  const first = await markdownIo.createRecoverySnapshot(harness.scenePath, {
    maxSnapshots: 20,
    now: () => 1784419200000,
  });
  assert.equal(first.snapshotCreated, true);
  assert.equal((await markdownIo.listRecoverySnapshots(harness.scenePath)).length, 1);

  for (let index = 1; index <= 24; index += 1) {
    await fsPromises.writeFile(harness.scenePath, `version ${index}`, 'utf8');
    await markdownIo.createRecoverySnapshot(harness.scenePath, {
      maxSnapshots: 20,
      now: () => 1784419200000 + index,
    });
  }

  const snapshots = await markdownIo.listRecoverySnapshots(harness.scenePath);
  assert.equal(snapshots.length, 20);
  const history = await harness.main.handleWorkspaceSceneHistoryQuery({
    projectId: harness.tree.projectId,
    nodeId: harness.scene.nodeId,
  });
  assert.equal(history.retention.bounded, true);
  assert.equal(history.retention.maxSnapshots, 20);
  assert.equal(history.snapshots.length, 20);
});

test('S23 history: read model tolerates unreadable snapshot records', async () => {
  const module = await import(path.join(ROOT, 'src', 'derived', 'sceneHistoryReadModel.mjs'));
  const model = module.buildSceneHistoryReadModel({
    projectId: 'project-test',
    nodeId: 'tree-node-00000000000000000000000000000000',
    currentText: 'current',
    snapshots: [
      {
        snapshotPath: '.scene.txt.bak.1784419200000',
        stamp: 1784419200000,
        readable: false,
        error: 'EACCES',
      },
    ],
  });

  assert.equal(model.ok, true);
  assert.equal(model.snapshots.length, 1);
  assert.equal(model.snapshots[0].readable, false);
  assert.equal(model.selectedSnapshot.readable, false);
  assert.equal(model.selectedSnapshot.diff, null);
});

test('S23 history: renderer has separate History tab and no file path authority', () => {
  const html = read('src/renderer/index.html');
  const renderer = read('src/renderer/editor.js');
  const main = read('src/main.js');
  const readModel = read('src/derived/sceneHistoryReadModel.mjs');

  assert.match(html, /data-right-tab="history"/u);
  assert.match(html, /data-scene-history-host/u);
  assert.match(renderer, /const SCENE_HISTORY_QUERY_ID = WORKSPACE_QUERY_IDS\.SCENE_HISTORY/u);
  assert.match(renderer, /EXTRA_COMMAND_IDS\.HISTORY_CREATE_CHECKPOINT/u);
  assert.doesNotMatch(renderer, /data-scene-history-path/u);
  assert.doesNotMatch(renderer, /selectedSnapshot\.snapshotPath|snapshot\.snapshotPath/u);
  assert.match(main, /SCENE_HISTORY_QUERY_ID/u);
  assert.match(main, /HISTORY_CREATE_CHECKPOINT_COMMAND_ID/u);
  assert.match(main, /resolveProjectTreeNodeIdentity\(safePayload\.nodeId/u);
  assert.match(main, /listRecoverySnapshots\(filePath\)/u);
  assert.match(readModel, /sourceOfTruth: 'recovery-evidence'/u);
});
