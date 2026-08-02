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

test('P0 01: product command bridge fails closed on unsupported future Atlas author schema before replacement', async (t) => {
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
  assert.equal(dispatched.ok, false, JSON.stringify(dispatched));
  assert.match(JSON.stringify(dispatched), /E_PRODUCT_COMMAND_AUTHOR_SCHEMA_UNSUPPORTED/u);
  assert.equal(await fsPromises.readFile(sourceManifestPath, 'utf8'), sourceRaw);

  const reopened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: sourceManifest.projectId });
  assert.equal(reopened.ok, true);
  const reopenedManifest = (await harness.main.readProjectManifest('Роман')).manifest;
  assert.deepEqual(reopenedManifest.atlas, sourceManifest.atlas);

  const recoveryRoot = path.join(projectRoot, 'backups', 'project-lifecycle-recovery');
  const recoveryFiles = fs.existsSync(recoveryRoot)
    ? fs.readdirSync(recoveryRoot, { recursive: true }).map(String)
    : [];
  assert.equal(recoveryFiles.length, 0);
});

test('P0 01: Atlas mutation preserves opaque future Manual Map, Idea and Meaning domains', async (t) => {
  const harness = await createHarness(t);
  const created = await harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Роман' });
  assert.equal(created.ok, true);
  const projectRoot = path.join(harness.documentsRoot, 'Роман');
  const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
  const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  const futureDomains = {
    manualMaps: {
      schemaVersion: 'manualMap.author.vFuture',
      opaqueMaps: { 'map-future': { nested: ['manual', 'map', 'truth'] } },
    },
    ideas: {
      schemaVersion: 'idea.author.vFuture',
      opaqueIdeas: { 'idea-future': { nested: ['idea', 'truth'] } },
    },
    meanings: {
      schemaVersion: 'meaning.author.vFuture',
      opaqueMeanings: { 'meaning-future': { nested: ['meaning', 'truth'] } },
    },
  };
  Object.assign(manifest, futureDomains);
  await fsPromises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(opened.ok, true);
  const commandBridge = harness.ipcHandlers.get('ui:command-bridge');
  const dispatched = await commandBridge(null, {
    route: 'command.bus',
    commandId: 'atlas.entity.create',
    payload: {
      projectId: manifest.projectId,
      entityId: 'entity-preserves-foreign-future-domains',
      name: 'Preserved Domains',
      entityKind: 'character',
    },
  });
  assert.equal(dispatched.ok, true, JSON.stringify(dispatched));

  const persisted = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  assert.deepEqual(persisted.manualMaps, futureDomains.manualMaps);
  assert.deepEqual(persisted.ideas, futureDomains.ideas);
  assert.deepEqual(persisted.meanings, futureDomains.meanings);
  assert.equal(persisted.atlas.entities['entity-preserves-foreign-future-domains'].name, 'Preserved Domains');
});

test('P0 01: each commanded future author domain fails before recovery or durable write', async (t) => {
  const scenarios = [
    {
      projectName: 'Роман',
      manifestKey: 'manualMaps',
      value: { schemaVersion: 'manualMap.author.vFuture', opaque: { keep: ['map'] } },
      commandId: 'manualMap.create',
      payload: { mapId: 'map-new', title: 'Must Not Apply' },
    },
    {
      projectName: 'Роман',
      manifestKey: 'ideas',
      value: { schemaVersion: 'idea.author.vFuture', opaque: { keep: ['idea'] } },
      commandId: 'idea.create',
      payload: { ideaId: 'idea-new', title: 'Must Not Apply' },
    },
    {
      projectName: 'Роман',
      manifestKey: 'meanings',
      value: { schemaVersion: 'meaning.author.vFuture', opaque: { keep: ['meaning'] } },
      commandId: 'meaning.promote',
      payload: {
        meaningId: 'meaning-new',
        title: 'Must Not Apply',
        interpretation: 'Must Not Apply',
        source: { kind: 'idea', ideaId: 'missing-idea' },
      },
    },
  ];

  for (const scenario of scenarios) {
    const harness = await createHarness(t);
    const created = await harness.main.handleProjectLifecycleCreateCommand({ projectName: scenario.projectName });
    assert.equal(created.ok, true);
    const projectRoot = path.join(harness.documentsRoot, scenario.projectName);
    const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
    const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
    manifest[scenario.manifestKey] = scenario.value;
    const sourceRaw = `${JSON.stringify(manifest, null, 2)}\n`;
    await fsPromises.writeFile(manifestPath, sourceRaw, 'utf8');
    assert.equal((await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId })).ok, true);

    const dispatched = await harness.ipcHandlers.get('ui:command-bridge')(null, {
      route: 'command.bus',
      commandId: scenario.commandId,
      payload: { projectId: manifest.projectId, ...scenario.payload },
    });
    assert.equal(dispatched.ok, false, `${scenario.commandId}:${JSON.stringify(dispatched)}`);
    assert.match(JSON.stringify(dispatched), /E_PRODUCT_COMMAND_AUTHOR_SCHEMA_UNSUPPORTED/u);
    assert.equal(await fsPromises.readFile(manifestPath, 'utf8'), sourceRaw);
    assert.equal(fs.existsSync(path.join(projectRoot, 'backups', 'project-lifecycle-recovery')), false);
  }
});
