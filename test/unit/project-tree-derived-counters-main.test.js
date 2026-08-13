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

test('project tree query exposes derived counters from scene files without path authority', async (t) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'tree-counters-main-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const documentsRoot = path.join(tempRoot, 'Documents', 'craftsman');
  const projectRoot = path.join(documentsRoot, 'Роман');
  const importedRoot = path.join(projectRoot, 'roman', 'Imported');
  await fsPromises.mkdir(importedRoot, { recursive: true });
  await fsPromises.writeFile(path.join(importedRoot, '01_Alpha.txt'), 'alpha beta', 'utf8');
  await fsPromises.writeFile(path.join(importedRoot, '02_Beta.txt'), 'gamma', 'utf8');

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  await main.buildProjectTreeRootsWithIdentities('Роман');
  const result = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(result.ok, true);
  const imported = findNode(result.root, (node) => node.kind === 'chapter-folder' && node.label === 'Imported');
  const alpha = findNode(result.root, (node) => node.kind === 'scene' && node.label === 'Alpha');
  assert.ok(imported);
  assert.ok(alpha);
  assert.equal(imported.derivedCounters.wordCount, 3);
  assert.equal(imported.derivedCounters.sceneCount, 2);
  assert.equal(imported.derivedCounters.completedSceneCount, 2);
  assert.equal(imported.derivedCounters.progressPercent, 100);
  assert.equal(alpha.derivedCounters.wordCount, 2);
  assert.equal(JSON.stringify(result).includes(projectRoot), false);
  assert.equal(Object.prototype.hasOwnProperty.call(alpha, 'path'), false);
  assert.equal(fs.existsSync(path.join(projectRoot, 'project.craftsman.json')), true);
});
