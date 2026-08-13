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

function assertPathlessTree(node) {
  assert.ok(node && typeof node === 'object');
  assert.equal(Object.prototype.hasOwnProperty.call(node, 'path'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(node, 'effectivePath'), false);
  assert.match(node.nodeId, /^tree-node-[a-f0-9]{32}$/u);
  assert.equal(node.id, node.nodeId);
  assert.equal(Object.values(node).some((value) => (
    typeof value === 'string' && (value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value))
  )), false);
  for (const child of node.children || []) assertPathlessTree(child);
}

test('project tree identity migration is atomic, idempotent, and rename-stable', async (t) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'tree-identity-main-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const documentsRoot = path.join(tempRoot, 'Documents', 'craftsman');
  const projectRoot = path.join(documentsRoot, 'Роман');
  const importedRoot = path.join(projectRoot, 'roman', 'Imported');
  const scenePath = path.join(importedRoot, '01_Scene.txt');
  await fsPromises.mkdir(importedRoot, { recursive: true });
  await fsPromises.writeFile(scenePath, 'scene text', 'utf8');

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  await main.buildProjectTreeRootsWithIdentities('Роман');
  const first = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(first.ok, true);
  assert.match(first.projectId, /^project-/u);
  assertPathlessTree(first.root);
  const firstScene = findNode(first.root, (node) => node.label === 'Scene' && node.kind === 'scene');
  assert.ok(firstScene);
  assert.match(firstScene.nodeId, /^tree-node-[a-f0-9]{32}$/u);
  const resolvedFirstScene = await main.resolveProjectTreeNodeIdentity(firstScene.nodeId, first.projectId);
  assert.equal(resolvedFirstScene.nodePath, scenePath);
  await assert.rejects(
    () => main.resolveProjectTreeNodeIdentity(firstScene.nodeId, 'project-from-another-workspace'),
    (error) => error && error.code === 'E_TREE_NODE_PROJECT_MISMATCH',
  );
  await assert.rejects(
    () => main.resolveProjectTreeNodeIdentity('not-a-tree-id', first.projectId),
    (error) => error && error.code === 'E_TREE_NODE_ID_INVALID',
  );
  assert.deepEqual(
    await main.getProjectDocumentIdentityPayload(scenePath),
    { documentId: firstScene.nodeId },
  );
  const externalIdentity = await main.getProjectDocumentIdentityPayload(path.join(tempRoot, 'external.txt'));
  assert.match(externalIdentity.documentId, /^external-document-[a-f0-9]{32}$/u);
  assert.equal(Object.prototype.hasOwnProperty.call(externalIdentity, 'path'), false);

  const manifestPath = path.join(projectRoot, 'project.craftsman.json');
  const firstManifestText = await fsPromises.readFile(manifestPath, 'utf8');
  const firstManifest = JSON.parse(firstManifestText);
  assert.equal(firstManifest.treeIdentity.schemaVersion, 1);
  assert.equal(firstManifest.treeIdentity.nodes[firstScene.nodeId].present, true);

  const second = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(second.ok, true);
  assert.equal(await fsPromises.readFile(manifestPath, 'utf8'), firstManifestText);

  const manifestWithFuture = {
    ...firstManifest,
    futureProData: { links: [{ id: 'keep-me' }] },
  };
  await fileManager.writeFileAtomic(manifestPath, JSON.stringify(manifestWithFuture, null, 2));

  const renamed = await main.handleUiRenameNodeCommand({
    projectId: first.projectId,
    nodeId: firstScene.nodeId,
    name: 'Renamed',
  });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.nodeId, firstScene.nodeId);
  assert.equal(Object.prototype.hasOwnProperty.call(renamed, 'path'), false);
  const afterRename = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(afterRename.ok, true);
  const renamedScene = findNode(afterRename.root, (node) => node.nodeId === firstScene.nodeId);
  assert.ok(renamedScene);
  assert.equal(renamedScene.nodeId, firstScene.nodeId);
  const renamedPath = path.join(importedRoot, '01_Renamed.txt');
  assert.equal(await fsPromises.readFile(renamedPath, 'utf8'), 'scene text');
  assert.deepEqual(
    await main.getProjectDocumentIdentityPayload(renamedPath),
    { documentId: firstScene.nodeId },
  );

  const finalManifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  assert.deepEqual(finalManifest.futureProData, { links: [{ id: 'keep-me' }] });
  assert.equal(finalManifest.treeIdentity.nodes[firstScene.nodeId].bindingKey, 'file:roman/Imported/01_Renamed.txt');
  assert.equal(fs.existsSync(path.join(projectRoot, 'backups')), true);

  const outsidePath = path.join(tempRoot, 'outside.txt');
  await fsPromises.writeFile(outsidePath, 'outside', 'utf8');
  await fsPromises.rm(renamedPath);
  await fsPromises.symlink(outsidePath, renamedPath);
  await assert.rejects(
    () => main.resolveProjectTreeNodeIdentity(firstScene.nodeId, first.projectId),
    (error) => error && error.code === 'E_PATH_BOUNDARY_VIOLATION',
  );
});
