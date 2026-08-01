const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_MANIFEST_FILENAME = 'project.craftsman.json';

async function loadMainWithElectronStub(paths) {
  const mainPath = path.join(ROOT, 'src', 'main.js');
  const fileManagerPath = path.join(ROOT, 'src', 'utils', 'fileManager.js');
  const originalLoad = Module._load;
  const ipcHandlers = new Map();
  const electronStub = {
    app: {
      getPath: (name) => {
        if (name === 'userData') return paths.userDataRoot;
        if (name === 'documents') return paths.documentsParent;
        if (name === 'appData') return paths.tempRoot;
        return paths.tempRoot;
      },
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
      handle: (channel, handler) => {
        ipcHandlers.set(channel, handler);
      },
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
      ipcHandlers,
    };
  } finally {
    Module._load = originalLoad;
  }
}

async function createHarness(t) {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'atlas-p0-01-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));
  const documentsParent = path.join(tempRoot, 'Documents');
  const documentsRoot = path.join(documentsParent, 'craftsman');
  const userDataRoot = path.join(tempRoot, 'userData');
  await fsPromises.mkdir(documentsRoot, { recursive: true });
  await fsPromises.mkdir(userDataRoot, { recursive: true });
  const loaded = await loadMainWithElectronStub({ tempRoot, documentsParent, userDataRoot });
  const originalGetDocumentsPath = loaded.fileManager.getDocumentsPath;
  loaded.fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { loaded.fileManager.getDocumentsPath = originalGetDocumentsPath; });
  return {
    ...loaded,
    tempRoot,
    documentsRoot,
    userDataRoot,
  };
}

async function injectFutureAtlasPayload(manifestPath) {
  const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  manifest.atlas = {
    schemaVersion: 'atlas.author.vFuture',
    futureEntities: {
      'future-entity': {
        id: 'future-entity',
        name: 'Preserve Future Entity',
        nested: { keep: ['bytes', 'and', 'shape'] },
      },
    },
    unknownFutureLedger: {
      schemaVersion: 'atlas.futureLedger.v1',
      rows: [{ id: 'future-row', value: 'must survive command binding' }],
    },
  };
  await fsPromises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

test('P0 01: product command bridge quarantines unsupported future Atlas author schema without replacement', async (t) => {
  const harness = await createHarness(t);
  const created = await harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Роман' });
  assert.equal(created.ok, true);
  const projectRoot = path.join(harness.documentsRoot, 'Роман');
  const sourceManifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
  const sourceManifest = await injectFutureAtlasPayload(sourceManifestPath);
  const sourceRaw = await fsPromises.readFile(sourceManifestPath, 'utf8');

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: sourceManifest.projectId });
  assert.equal(opened.ok, true);
  assert.equal(opened.readOnlyProject, false);
  const tree = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(tree.ok, true, JSON.stringify(tree));

  const commandBridge = harness.ipcHandlers.get('ui:command-bridge');
  assert.equal(typeof commandBridge, 'function');
  const dispatched = await commandBridge(null, {
    route: 'command.bus',
    commandId: 'atlas.entity.create',
    payload: {
      projectId: sourceManifest.projectId,
      entityId: 'entity-after-future-quarantine',
      name: 'After Future Quarantine',
      entityKind: 'character',
    },
  });
  assert.equal(dispatched.ok, true, JSON.stringify(dispatched));
  assert.equal(dispatched.value.mutationApplied, true);
  assert.equal(dispatched.value.storageWritten, true);
  assert.equal(dispatched.value.recovery.snapshotHashMatchesInput, true);

  const persisted = JSON.parse(await fsPromises.readFile(sourceManifestPath, 'utf8'));
  assert.equal(persisted.atlas.schemaVersion, 'atlas.author.v1');
  assert.equal(persisted.atlas.entities['entity-after-future-quarantine'].name, 'After Future Quarantine');
  assert.equal(
    persisted.atlas.unsupportedAuthorDataQuarantine.schemaVersion,
    'atlas.authorUnsupportedQuarantine.v1',
  );
  assert.equal(
    persisted.atlas.unsupportedAuthorDataQuarantine.originalAuthorData.futureEntities['future-entity'].nested.keep[2],
    'shape',
  );
  assert.deepEqual(
    persisted.atlas.unsupportedAuthorDataQuarantine.originalAuthorData,
    sourceManifest.atlas,
  );
  assert.equal(persisted.atlas.unsupportedAuthorDataQuarantine.destructiveReplacement, false);

  const reopened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: sourceManifest.projectId });
  assert.equal(reopened.ok, true);
  const reopenedManifest = (await harness.main.readProjectManifest('Роман')).manifest;
  assert.equal(
    reopenedManifest.atlas.unsupportedAuthorDataQuarantine.originalAuthorData.unknownFutureLedger.rows[0].id,
    'future-row',
  );

  const recoveryRoot = path.join(projectRoot, 'backups', 'project-lifecycle-recovery');
  const recoveryFiles = fs.existsSync(recoveryRoot)
    ? fs.readdirSync(recoveryRoot, { recursive: true }).map(String)
    : [];
  assert.equal(recoveryFiles.length > 0, true);
  assert.equal(
    recoveryFiles.some((entry) => {
      const candidate = path.join(recoveryRoot, entry);
      return fs.existsSync(candidate)
        && fs.statSync(candidate).isFile()
        && fs.readFileSync(candidate, 'utf8') === sourceRaw;
    }),
    true,
  );
});
