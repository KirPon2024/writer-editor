const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..', '..');

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

async function readSnapshot(projectRoot) {
  const importedRoot = path.join(projectRoot, 'roman', 'Imported');
  const files = {};
  for (const name of fs.existsSync(importedRoot) ? fs.readdirSync(importedRoot).sort() : []) {
    const filePath = path.join(importedRoot, name);
    if (fs.statSync(filePath).isFile()) {
      files[name] = fs.readFileSync(filePath, 'utf8');
    }
  }
  const manifestPath = path.join(projectRoot, 'project.craftsman.json');
  const manifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : '';
  return { files, manifest };
}

test('project tree move command moves by stable IDs, preserves content, writes recovery, and blocks unsafe branches', async (t) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'tree-move-main-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const documentsRoot = path.join(tempRoot, 'Documents', 'craftsman');
  const projectRoot = path.join(documentsRoot, 'Роман');
  const importedRoot = path.join(projectRoot, 'roman', 'Imported');
  await fsPromises.mkdir(importedRoot, { recursive: true });
  await fsPromises.writeFile(path.join(importedRoot, '01_Alpha.txt'), 'alpha text', 'utf8');
  await fsPromises.writeFile(path.join(importedRoot, '02_Beta.txt'), 'beta text', 'utf8');

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  await main.buildProjectTreeRootsWithIdentities('Роман');
  const first = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(first.ok, true);
  const imported = findNode(first.root, (node) => node.kind === 'chapter-folder' && node.label === 'Imported');
  const alpha = findNode(first.root, (node) => node.kind === 'scene' && node.label === 'Alpha');
  assert.ok(imported);
  assert.ok(alpha);

  const moved = await main.handleUiMoveNodeCommand({
    projectId: first.projectId,
    nodeId: alpha.nodeId,
    targetParentNodeId: imported.nodeId,
    targetIndex: 1,
  }, { now: () => 1700000100000 });
  assert.equal(moved.ok, true);
  assert.equal(moved.nodeId, alpha.nodeId);
  assert.equal(moved.receipt.schemaVersion, 'project-tree-move-receipt.v1');
  assert.equal(moved.receipt.recovery.snapshotCreated, true);
  assert.equal(moved.receipt.recovery.snapshotReadable, true);
  assert.equal(moved.receipt.recovery.snapshotHashMatchesInput, true);
  assert.equal(fs.readFileSync(path.join(importedRoot, '01_Beta.txt'), 'utf8'), 'beta text');
  assert.equal(fs.readFileSync(path.join(importedRoot, '02_Alpha.txt'), 'utf8'), 'alpha text');
  assert.equal(fs.existsSync(path.join(projectRoot, 'backups')), true);
  assert.equal(fs.existsSync(path.join(projectRoot, 'backups', 'tree-move-recovery')), true);

  const afterMove = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(afterMove.ok, true);
  const movedAlpha = findNode(afterMove.root, (node) => node.nodeId === alpha.nodeId);
  assert.ok(movedAlpha);
  assert.equal(movedAlpha.label, 'Alpha');
  const resolved = await main.resolveProjectTreeNodeIdentity(alpha.nodeId, first.projectId);
  assert.equal(resolved.nodePath, path.join(importedRoot, '02_Alpha.txt'));

  const beforeInvalid = await readSnapshot(projectRoot);
  const cycle = await main.handleUiMoveNodeCommand({
    projectId: first.projectId,
    nodeId: imported.nodeId,
    targetParentNodeId: imported.nodeId,
    targetIndex: 0,
  });
  assert.equal(cycle.ok, false);
  assert.equal(cycle.code, 'E_TREE_MOVE_CYCLE_BLOCKED');
  assert.deepEqual(await readSnapshot(projectRoot), beforeInvalid);

  const forged = await main.handleUiMoveNodeCommand({
    projectId: first.projectId,
    nodeId: alpha.nodeId,
    targetParentNodeId: imported.nodeId,
    targetIndex: 0,
    path: path.join(projectRoot, 'roman'),
  });
  assert.equal(forged.ok, false);
  assert.equal(forged.code, 'E_TREE_MOVE_PAYLOAD_INVALID');
  assert.deepEqual(await readSnapshot(projectRoot), beforeInvalid);

  const killPoint = await main.handleUiMoveNodeCommand({
    projectId: first.projectId,
    nodeId: alpha.nodeId,
    targetParentNodeId: imported.nodeId,
    targetIndex: 0,
  }, {
    afterFsMoveBeforeIdentity: async () => {
      throw new Error('KILL_POINT_AFTER_FS_MOVE');
    },
  });
  assert.equal(killPoint.ok, false);
  assert.equal(killPoint.code, 'E_TREE_MOVE_FILESYSTEM_FAILED');
  assert.deepEqual(await readSnapshot(projectRoot), beforeInvalid);
});
