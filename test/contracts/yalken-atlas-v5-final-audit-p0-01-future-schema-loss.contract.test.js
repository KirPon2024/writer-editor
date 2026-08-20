const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_MANIFEST_FILENAME = 'project.craftsman.json';

// R2.4 S0: the app-shell caller identity used by harness dispatches. The
// shell URL must equal the fence's file prefix computed from src/main.js.
const HARNESS_SHELL_URL = pathToFileURL(path.join(ROOT, 'src', 'renderer', 'index.html')).href;
const syntheticShellWebContents = {
  id: 1,
  getURL: () => HARNESS_SHELL_URL,
  isDestroyed: () => false,
};
const harnessCallerEvent = () => ({
  sender: { id: syntheticShellWebContents.id, isDestroyed: () => false },
  senderFrame: { url: HARNESS_SHELL_URL },
});

// R2.4 S1: bridge dispatches must carry the versioned envelope frame.
const frameBridgeRequest = (request) => ({
  v: 1,
  correlationId: `harness-${Math.random().toString(36).slice(2, 12)}`,
  issuedAt: new Date().toISOString(),
  ...request,
});

async function loadRuntimeModule() {
  return import(pathToFileURL(path.join(ROOT, 'src', 'core', 'runtime.mjs')).href);
}

async function loadMainWithElectronStub(paths, options = {}) {
  const mainPath = path.join(ROOT, 'src', 'main.js');
  const fileManagerPath = path.join(ROOT, 'src', 'utils', 'fileManager.js');
  const originalLoad = Module._load;
  const originalArgv = process.argv.slice();
  if (options.devMode === true && !process.argv.includes('--dev')) {
    process.argv.push('--dev');
  }
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
    webContents: {
      // R2.4 S0: the caller-identity fence resolves legitimate senders from
      // the live shell webContents registry; the harness registers one
      // synthetic shell contents so dispatches model a genuine caller.
      getAllWebContents: () => [syntheticShellWebContents],
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
    process.argv = originalArgv;
  }
}

async function createHarness(t, options = {}) {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'atlas-p0-01-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));
  const documentsParent = path.join(tempRoot, 'Documents');
  const documentsRoot = path.join(documentsParent, 'craftsman');
  const userDataRoot = path.join(tempRoot, 'userData');
  await fsPromises.mkdir(documentsRoot, { recursive: true });
  await fsPromises.mkdir(userDataRoot, { recursive: true });
  const loaded = await loadMainWithElectronStub({ tempRoot, documentsParent, userDataRoot }, options);
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

function findSerializedTreeNodeByName(node, name) {
  if (!node || typeof node !== 'object') return null;
  if (node.name === name || node.label === name) return node;
  for (const child of Array.isArray(node.children) ? node.children : []) {
    const found = findSerializedTreeNodeByName(child, name);
    if (found) return found;
  }
  return null;
}

async function captureConsoleErrorDuring(operation) {
  const originalError = console.error;
  const messages = [];
  console.error = (...args) => {
    messages.push(args.map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(' '));
  };
  try {
    const value = await operation();
    return { value, messages };
  } finally {
    console.error = originalError;
  }
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
  const dispatched = await commandBridge(harnessCallerEvent(), frameBridgeRequest({
    route: 'command.bus',
    commandId: 'atlas.entity.create',
    payload: {
      projectId: sourceManifest.projectId,
      entityId: 'entity-after-future-quarantine',
      name: 'After Future Quarantine',
      entityKind: 'character',
    },
  }));
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
  const dispatched = await commandBridge(harnessCallerEvent(), frameBridgeRequest({
    route: 'command.bus',
    commandId: 'atlas.entity.create',
    payload: {
      projectId: manifest.projectId,
      entityId: 'entity-preserves-foreign-future-domains',
      name: 'Preserved Domains',
      entityKind: 'character',
    },
  }));
  assert.equal(dispatched.ok, true, JSON.stringify(dispatched));

  const persisted = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  assert.deepEqual(persisted.manualMaps, futureDomains.manualMaps);
  assert.deepEqual(persisted.ideas, futureDomains.ideas);
  assert.deepEqual(persisted.meanings, futureDomains.meanings);
  assert.equal(persisted.atlas.entities['entity-preserves-foreign-future-domains'].name, 'Preserved Domains');
});

test('R1 C: supported Manual Map Idea and Meaning author extensions survive mutation reopen and replay state', async () => {
  const runtime = await loadRuntimeModule();
  const projectId = 'author-extension-preservation-project';
  const sceneId = 'scene-extension-preservation';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Author extension preservation', sceneId },
    },
  ]);
  assert.equal(created.ok, true);
  const state = JSON.parse(JSON.stringify(created.state));
  const project = state.data.projects[projectId];
  const manualMapExtension = { extensionSchema: 'manualMap.extension.vFuture', nested: { survives: ['map', 'truth'] } };
  const ideaExtension = { extensionSchema: 'idea.extension.vFuture', nested: { survives: ['idea', 'truth'] } };
  const meaningExtension = { extensionSchema: 'meaning.extension.vFuture', nested: { survives: ['meaning', 'truth'] } };
  project.manualMaps = {
    schemaVersion: 'manualMap.author.v1',
    maps: {},
    extensionCapsule: manualMapExtension,
  };
  project.ideas = {
    schemaVersion: 'idea.author.v1',
    ideas: {},
    originLinks: {},
    extensionCapsule: ideaExtension,
  };
  project.meanings = {
    schemaVersion: 'meaning.author.v1',
    meanings: {},
    extensionCapsule: meaningExtension,
  };

  const mapCreated = runtime.reduceCoreState(state, {
    type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
    payload: { projectId, mapId: 'map-extension-preserved', title: 'Preserved Map Extension' },
  });
  assert.equal(mapCreated.ok, true, JSON.stringify(mapCreated.error));
  const ideaCreated = runtime.reduceCoreState(mapCreated.state, {
    type: runtime.CORE_COMMAND_IDS.IDEA_CREATE,
    payload: { projectId, ideaId: 'idea-extension-preserved', title: 'Preserved Idea Extension' },
  });
  assert.equal(ideaCreated.ok, true, JSON.stringify(ideaCreated.error));
  const meaningPromoted = runtime.reduceCoreState(ideaCreated.state, {
    type: runtime.CORE_COMMAND_IDS.MEANING_PROMOTE,
    payload: {
      projectId,
      meaningId: 'meaning-extension-preserved',
      title: 'Preserved Meaning Extension',
      interpretation: 'Meaning reducer must not drop future extension fields.',
      source: { kind: 'idea', ideaId: 'idea-extension-preserved' },
    },
  });
  assert.equal(meaningPromoted.ok, true, JSON.stringify(meaningPromoted.error));

  const reopened = JSON.parse(JSON.stringify(meaningPromoted.state));
  const reopenedProject = reopened.data.projects[projectId];
  assert.deepEqual(reopenedProject.manualMaps.extensionCapsule, manualMapExtension);
  assert.deepEqual(reopenedProject.ideas.extensionCapsule, ideaExtension);
  assert.deepEqual(reopenedProject.meanings.extensionCapsule, meaningExtension);
  assert.equal(reopenedProject.manualMaps.maps['map-extension-preserved'].title, 'Preserved Map Extension');
  assert.equal(reopenedProject.ideas.ideas['idea-extension-preserved'].title, 'Preserved Idea Extension');
  assert.equal(reopenedProject.meanings.meanings['meaning-extension-preserved'].title, 'Preserved Meaning Extension');
});

test('R1 B: released Atlas mutation advances the canonical Command Kernel event and receipt authority', async (t) => {
  const harness = await createHarness(t);
  const created = await harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Роман' });
  assert.equal(created.ok, true);
  const projectRoot = path.join(harness.documentsRoot, 'Роман');
  const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
  const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  const stage10Root = path.join(projectRoot, '.stage10-local');
  const sessionPath = path.join(stage10Root, 'product-session.v2.json');
  const authorityPath = path.join(stage10Root, 'command-receipt-authority-store.v2.json');
  const beforeSession = JSON.parse(await fsPromises.readFile(sessionPath, 'utf8'));
  const beforeAuthority = JSON.parse(await fsPromises.readFile(authorityPath, 'utf8'));

  const commandBridge = harness.ipcHandlers.get('ui:command-bridge');
  const dispatched = await commandBridge(harnessCallerEvent(), frameBridgeRequest({
    route: 'command.bus',
    commandId: 'atlas.entity.create',
    payload: {
      projectId: manifest.projectId,
      opId: 'r1-b-atlas-entity-create-1',
      entityId: 'entity-command-kernel-authority',
      name: 'Canonical Authority',
      entityKind: 'character',
    },
  }));
  assert.equal(dispatched.ok, true, JSON.stringify(dispatched));
  const receipt = dispatched.value?.receipt;
  assert.equal(receipt?.schemaVersion, 'command-kernel.receipt.v1');
  assert.equal(receipt?.operationId, 'r1-b-atlas-entity-create-1');
  assert.equal(receipt?.commandId, 'atlas.entity.create');
  assert.equal(receipt?.storageWritten, true);
  assert.equal(receipt?.details?.projectTruthMutation, true);

  const afterSession = JSON.parse(await fsPromises.readFile(sessionPath, 'utf8'));
  const afterAuthority = JSON.parse(await fsPromises.readFile(authorityPath, 'utf8'));
  assert.equal(afterSession.eventLog.events.length, beforeSession.eventLog.events.length + 1);
  assert.equal(afterAuthority.receipts.length, beforeAuthority.receipts.length + 1);
  assert.equal(afterSession.eventLog.events.at(-1).commandId, 'atlas.entity.create');
  assert.equal(afterAuthority.receipts.at(-1).commandId, 'atlas.entity.create');
  assert.equal(afterSession.eventLog.events.at(-1).opId, 'r1-b-atlas-entity-create-1');
  assert.equal(afterAuthority.receipts.at(-1).operationId, 'r1-b-atlas-entity-create-1');
  assert.equal(
    afterSession.eventLog.events.at(-1).domainEventDigest,
    afterAuthority.receipts.at(-1).domainEventDigest,
  );

  const persisted = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  assert.equal(persisted.atlas.entities['entity-command-kernel-authority'].name, 'Canonical Authority');

  const manifestAfterFirst = await fsPromises.readFile(manifestPath, 'utf8');
  const sessionAfterFirst = await fsPromises.readFile(sessionPath, 'utf8');
  const authorityAfterFirst = await fsPromises.readFile(authorityPath, 'utf8');
  const projectTruthRecoveryPath = path.join(stage10Root, 'recovery', 'project-truth.latest.v1.json');
  const projectTruthRecoveryAfterFirst = await fsPromises.readFile(projectTruthRecoveryPath, 'utf8');
  const projectTruthRecovery = JSON.parse(projectTruthRecoveryAfterFirst);
  assert.equal(projectTruthRecovery.schemaVersion, 'yalken.stage10.projectTruthRecovery.v1');
  assert.equal(projectTruthRecovery.projectId, manifest.projectId);
  const recoveredPreviousManifest = JSON.parse(projectTruthRecovery.previousText);
  assert.equal(recoveredPreviousManifest.atlas?.entities?.['entity-command-kernel-authority'], undefined);
  const duplicate = await commandBridge(harnessCallerEvent(), frameBridgeRequest({
    route: 'command.bus',
    commandId: 'atlas.entity.create',
    payload: {
      projectId: manifest.projectId,
      opId: 'r1-b-atlas-entity-create-1',
      entityId: 'entity-duplicate-must-not-persist',
      name: 'Duplicate Must Not Persist',
      entityKind: 'character',
    },
  }));
  assert.equal(duplicate.ok, false, JSON.stringify(duplicate));
  assert.match(JSON.stringify(duplicate), /COMMAND_KERNEL_(RECEIPT_ID|OPERATION_ID)_ALREADY_EXISTS/u);
  assert.equal(await fsPromises.readFile(manifestPath, 'utf8'), manifestAfterFirst);
  assert.equal(await fsPromises.readFile(sessionPath, 'utf8'), sessionAfterFirst);
  assert.equal(await fsPromises.readFile(authorityPath, 'utf8'), authorityAfterFirst);
  assert.equal(await fsPromises.readFile(projectTruthRecoveryPath, 'utf8'), projectTruthRecoveryAfterFirst);

  const reopened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(reopened.ok, true, JSON.stringify(reopened));
  const reopenedManifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  assert.equal(reopenedManifest.atlas.entities['entity-command-kernel-authority'].name, 'Canonical Authority');
  assert.equal(reopenedManifest.atlas.entities['entity-duplicate-must-not-persist'], undefined);

  const reopenedSessionBefore = JSON.parse(await fsPromises.readFile(sessionPath, 'utf8'));
  const reopenedAuthorityBefore = JSON.parse(await fsPromises.readFile(authorityPath, 'utf8'));
  const registryModule = await import(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'registry.mjs')).href);
  const projectCommands = await import(pathToFileURL(path.join(ROOT, 'src', 'renderer', 'commands', 'projectCommands.mjs')).href);
  const registry = registryModule.createCommandRegistry();
  projectCommands.registerProjectCommands(registry, {
    electronAPI: {
      invokeUiCommandBridge: (request) => commandBridge(harnessCallerEvent(), frameBridgeRequest(request)),
    },
  });
  const alias = await registry.getHandler('atlas.alias.add')({
    projectId: manifest.projectId,
    opId: 'r1-b-atlas-alias-add-1',
    entityId: 'entity-command-kernel-authority',
    aliasId: 'alias-command-kernel-authority',
    value: 'Authority Alias',
  });
  assert.equal(alias.ok, true, JSON.stringify(alias));
  assert.equal(alias.value?.result?.receipt?.schemaVersion, 'command-kernel.receipt.v1');
  const reopenedSessionAfter = JSON.parse(await fsPromises.readFile(sessionPath, 'utf8'));
  const reopenedAuthorityAfter = JSON.parse(await fsPromises.readFile(authorityPath, 'utf8'));
  assert.equal(reopenedSessionAfter.eventLog.events.length, reopenedSessionBefore.eventLog.events.length + 1);
  assert.equal(reopenedAuthorityAfter.receipts.length, reopenedAuthorityBefore.receipts.length + 1);
  assert.equal(reopenedSessionAfter.eventLog.events.at(-1).commandId, 'atlas.alias.add');
  assert.equal(reopenedAuthorityAfter.receipts.at(-1).commandId, 'atlas.alias.add');
  const manifestAfterAlias = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  assert.equal(
    manifestAfterAlias.atlas.entities['entity-command-kernel-authority'].aliases['alias-command-kernel-authority'].value,
    'Authority Alias',
  );
});

test('P0 01: project tree query uses read-only identity when same process holds Stage-10 lease', async (t) => {
  const harness = await createHarness(t);
  const created = await harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Роман' });
  assert.equal(created.ok, true);
  const projectRoot = path.join(harness.documentsRoot, 'Роман');
  const scenePath = path.join(projectRoot, 'roman', 'Imported', '01_same-process-lease-scene.txt');
  await fsPromises.mkdir(path.dirname(scenePath), { recursive: true });
  await fsPromises.writeFile(scenePath, 'Same process lease scene\\n', 'utf8');
  const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
  const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));

  const firstTree = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(firstTree.ok, true, JSON.stringify(firstTree));
  const manifestRawAfterFirstTree = await fsPromises.readFile(manifestPath, 'utf8');
  const staleScenePath = path.join(projectRoot, 'roman', 'Imported', '02_stale-readonly-lease-scene.txt');

  const { createProjectLeaseManager } = await import(pathToFileURL(
    path.join(ROOT, 'src', 'product', 'projectLease.mjs'),
  ).href);
  const leaseManager = createProjectLeaseManager({
    leaseRoot: path.join(harness.userDataRoot, 'stage10-integrity-anchors'),
  });
  const heldLease = await leaseManager.acquire(manifest.projectId);
  try {
    await fsPromises.writeFile(staleScenePath, 'Stale read-only lease scene\\n', 'utf8');
    const secondTree = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
    assert.equal(secondTree.ok, true, JSON.stringify(secondTree));
    assert.equal(secondTree.projectId, manifest.projectId);
    const staleNode = findSerializedTreeNodeByName(secondTree.root, 'stale-readonly-lease-scene');
    assert.ok(staleNode, JSON.stringify(secondTree.root));
    assert.match(staleNode.nodeId, /^tree-node-[a-f0-9]{32}$/u);
    const documentIdentity = await harness.main.getProjectDocumentIdentityPayload(staleScenePath);
    assert.match(documentIdentity.documentId, /^tree-node-[a-f0-9]{32}$/u);
    assert.equal(documentIdentity.documentId, staleNode.nodeId);
    assert.equal(await fsPromises.readFile(manifestPath, 'utf8'), manifestRawAfterFirstTree);
  } finally {
    await leaseManager.release(heldLease);
  }
});

test('P0 01: Word-return read-only identity consumers do not write when manifest is unavailable under Stage-10 lease', async (t) => {
  const harness = await createHarness(t, { devMode: true });
  const { value: created } = await captureConsoleErrorDuring(
    () => harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Роман' }),
  );
  assert.equal(created.ok, true);
  const projectRoot = path.join(harness.documentsRoot, 'Роман');
  const scenePath = path.join(projectRoot, 'roman', 'Imported', '01_missing-manifest-return-scene.txt');
  await fsPromises.mkdir(path.dirname(scenePath), { recursive: true });
  await fsPromises.writeFile(scenePath, 'Missing manifest return scene\\n', 'utf8');
  const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
  const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));

  const { createProjectLeaseManager } = await import(pathToFileURL(
    path.join(ROOT, 'src', 'product', 'projectLease.mjs'),
  ).href);
  const leaseManager = createProjectLeaseManager({
    leaseRoot: path.join(harness.userDataRoot, 'stage10-integrity-anchors'),
  });
  const heldLease = await leaseManager.acquire(manifest.projectId);
  try {
    await fsPromises.unlink(manifestPath);
    const captured = await captureConsoleErrorDuring(async () => {
      const tree = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
      assert.equal(tree.ok, false, JSON.stringify(tree));
      assert.equal(tree.error, 'E_PROJECT_MANIFEST_UNAVAILABLE');
      await assert.rejects(
        () => harness.main.getProjectDocumentIdentityPayload(scenePath),
        (error) => error && error.code === 'E_PROJECT_DOCUMENT_IDENTITY_UNAVAILABLE',
      );
    });
    assert.equal(captured.messages.join('\\n').includes('E_PROJECT_LEASE_HELD'), false);
    assert.equal(fs.existsSync(manifestPath), false);
  } finally {
    await leaseManager.release(heldLease);
  }
});

test('P0 01: Word-return read-only identity consumers do not repair unreadable manifest under Stage-10 lease', async (t) => {
  const harness = await createHarness(t, { devMode: true });
  const { value: created } = await captureConsoleErrorDuring(
    () => harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Роман' }),
  );
  assert.equal(created.ok, true);
  const projectRoot = path.join(harness.documentsRoot, 'Роман');
  const scenePath = path.join(projectRoot, 'roman', 'Imported', '01_unreadable-manifest-return-scene.txt');
  await fsPromises.mkdir(path.dirname(scenePath), { recursive: true });
  await fsPromises.writeFile(scenePath, 'Unreadable manifest return scene\\n', 'utf8');
  const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
  const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  const unreadableManifestText = '{ "schemaVersion": 1, "projectId": ';

  const { createProjectLeaseManager } = await import(pathToFileURL(
    path.join(ROOT, 'src', 'product', 'projectLease.mjs'),
  ).href);
  const leaseManager = createProjectLeaseManager({
    leaseRoot: path.join(harness.userDataRoot, 'stage10-integrity-anchors'),
  });
  const heldLease = await leaseManager.acquire(manifest.projectId);
  try {
    await fsPromises.writeFile(manifestPath, unreadableManifestText, 'utf8');
    const captured = await captureConsoleErrorDuring(async () => {
      const tree = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
      assert.equal(tree.ok, false, JSON.stringify(tree));
      assert.equal(tree.error, 'E_PROJECT_MANIFEST_UNAVAILABLE');
      await assert.rejects(
        () => harness.main.getProjectDocumentIdentityPayload(scenePath),
        (error) => error && error.code === 'E_PROJECT_DOCUMENT_IDENTITY_UNAVAILABLE',
      );
    });
    assert.equal(captured.messages.join('\\n').includes('E_PROJECT_LEASE_HELD'), false);
    assert.equal(await fsPromises.readFile(manifestPath, 'utf8'), unreadableManifestText);
  } finally {
    await leaseManager.release(heldLease);
  }
});

test('P0 01: Word-return document identity does not upsert readable unbound paths under Stage-10 lease', async (t) => {
  const harness = await createHarness(t, { devMode: true });
  const { value: created } = await captureConsoleErrorDuring(
    () => harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Роман' }),
  );
  assert.equal(created.ok, true);
  const projectRoot = path.join(harness.documentsRoot, 'Роман');
  const scenePath = path.join(projectRoot, 'roman', 'Detached', '01_unbound-readable-return-scene.txt');
  await fsPromises.mkdir(path.dirname(scenePath), { recursive: true });
  await fsPromises.writeFile(scenePath, 'Unbound readable return scene\\n', 'utf8');
  const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
  const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  const manifestRawBefore = await fsPromises.readFile(manifestPath, 'utf8');

  const { createProjectLeaseManager } = await import(pathToFileURL(
    path.join(ROOT, 'src', 'product', 'projectLease.mjs'),
  ).href);
  const leaseManager = createProjectLeaseManager({
    leaseRoot: path.join(harness.userDataRoot, 'stage10-integrity-anchors'),
  });
  const heldLease = await leaseManager.acquire(manifest.projectId);
  try {
    const captured = await captureConsoleErrorDuring(async () => {
      const identity = await harness.main.getProjectDocumentIdentityPayload(scenePath);
      assert.match(identity.documentId, /^tree-node-[a-f0-9]{32}$/u);
    });
    assert.equal(captured.messages.join('\\n').includes('E_PROJECT_LEASE_HELD'), false);
    assert.equal(await fsPromises.readFile(manifestPath, 'utf8'), manifestRawBefore);
  } finally {
    await leaseManager.release(heldLease);
  }
});

test('P0 01: fresh product project persists tree identity before mutating child scene creation', async (t) => {
  const harness = await createHarness(t, { devMode: true });
  const { value: created } = await captureConsoleErrorDuring(
    () => harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Роман' }),
  );
  assert.equal(created.ok, true);
  const projectRoot = path.join(harness.documentsRoot, 'Роман');
  const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
  const manifestRawBefore = await fsPromises.readFile(manifestPath, 'utf8');
  const tree = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(tree.ok, true, JSON.stringify(tree));
  const romanNode = findSerializedTreeNodeByName(tree.root, 'Роман');
  assert.ok(romanNode && typeof romanNode.nodeId === 'string', JSON.stringify(tree.root));

  const createResult = await harness.main.handleUiCreateNodeCommand({
    parentNodeId: romanNode.nodeId,
    kind: 'scene',
    name: 'dorian-00-preface',
  });
  assert.equal(createResult.ok, true, JSON.stringify(createResult));
  assert.match(createResult.nodeId, /^tree-node-[a-f0-9]{32}$/u);
  assert.equal(manifestRawBefore.includes(romanNode.nodeId), true);
  const manifestRawAfter = await fsPromises.readFile(manifestPath, 'utf8');
  assert.equal(manifestRawAfter.includes(createResult.nodeId), true);
  assert.doesNotMatch(JSON.stringify(createResult), /E_TREE_NODE_NOT_FOUND/u);
});

test('P0 01: startup-created product project persists tree identity before renderer child scene creation', async (t) => {
  const harness = await createHarness(t, { devMode: true });
  await harness.main.initializeApp();
  const projectRoot = path.join(harness.documentsRoot, 'Роман');
  const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
  const manifestRawBefore = await fsPromises.readFile(manifestPath, 'utf8');
  const tree = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(tree.ok, true, JSON.stringify(tree));
  const romanNode = findSerializedTreeNodeByName(tree.root, 'Роман');
  assert.ok(romanNode && typeof romanNode.nodeId === 'string', JSON.stringify(tree.root));
  assert.equal(manifestRawBefore.includes(romanNode.nodeId), true);

  const commandBridge = harness.ipcHandlers.get('ui:command-bridge');
  assert.equal(typeof commandBridge, 'function');
  const bridgeResult = await commandBridge(harnessCallerEvent(), frameBridgeRequest({
    route: 'command.bus',
    commandId: 'cmd.project.tree.createNode',
    payload: {
      parentNodeId: romanNode.nodeId,
      kind: 'scene',
      name: 'dorian-00-preface',
    },
  }));
  assert.equal(bridgeResult.ok, true, JSON.stringify(bridgeResult));
  assert.equal(bridgeResult.value?.ok, true, JSON.stringify(bridgeResult));
  assert.match(bridgeResult.value.nodeId, /^tree-node-[a-f0-9]{32}$/u);
  assert.doesNotMatch(JSON.stringify(bridgeResult), /E_TREE_NODE_NOT_FOUND/u);
  const manifestRawAfter = await fsPromises.readFile(manifestPath, 'utf8');
  assert.equal(manifestRawAfter.includes(bridgeResult.value.nodeId), true);
});

test('P0 01: lifecycle open bootstraps current-schema missing or stale tree identity before renderer child scene creation', async (t) => {
  const scenarios = [
    {
      name: 'missing-tree-identity',
      mutateManifest(manifest) {
        delete manifest.treeIdentity;
      },
    },
    {
      name: 'stale-tree-identity',
      mutateManifest(manifest) {
        manifest.treeIdentity = {
          schemaVersion: 1,
          nodes: {
            'tree-node-stale-open-route': {
              bindingKey: 'file:roman/Deleted/ghost.txt',
              kind: 'scene',
              present: true,
            },
          },
        };
      },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async (t) => {
      const harness = await createHarness(t, { devMode: true });
      const created = await harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Роман' });
      assert.equal(created.ok, true);
      const projectRoot = path.join(harness.documentsRoot, 'Роман');
      const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
      const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
      scenario.mutateManifest(manifest);
      await fsPromises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

      const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
      assert.equal(opened.ok, true, JSON.stringify(opened));
      assert.equal(opened.readOnlyProject, false);

      const manifestRawAfterOpen = await fsPromises.readFile(manifestPath, 'utf8');
      const tree = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
      assert.equal(tree.ok, true, JSON.stringify(tree));
      const romanNode = findSerializedTreeNodeByName(tree.root, 'Роман');
      assert.ok(romanNode && typeof romanNode.nodeId === 'string', JSON.stringify(tree.root));
      assert.equal(manifestRawAfterOpen.includes(romanNode.nodeId), true);

      const commandBridge = harness.ipcHandlers.get('ui:command-bridge');
      assert.equal(typeof commandBridge, 'function');
      const bridgeResult = await commandBridge(harnessCallerEvent(), frameBridgeRequest({
        route: 'command.bus',
        commandId: 'cmd.project.tree.createNode',
        payload: {
          parentNodeId: romanNode.nodeId,
          kind: 'scene',
          name: `dorian-${scenario.name}`,
        },
      }));
      assert.equal(bridgeResult.ok, true, JSON.stringify(bridgeResult));
      assert.equal(bridgeResult.value?.ok, true, JSON.stringify(bridgeResult));
      assert.match(bridgeResult.value.nodeId, /^tree-node-[a-f0-9]{32}$/u);
      assert.doesNotMatch(JSON.stringify(bridgeResult), /E_TREE_NODE_NOT_FOUND/u);
      const manifestRawAfterCreate = await fsPromises.readFile(manifestPath, 'utf8');
      assert.equal(manifestRawAfterCreate.includes(bridgeResult.value.nodeId), true);
    });
  }
});

test('P0 01: failed lifecycle open preserves prior active project tree authority', async (t) => {
  const harness = await createHarness(t, { devMode: true });
  const alpha = await harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Роман' });
  assert.equal(alpha.ok, true, JSON.stringify(alpha));

  const alphaRoot = path.join(harness.documentsRoot, 'Роман');
  const betaRoot = path.join(harness.documentsRoot, 'Бета');
  const alphaManifestPath = path.join(alphaRoot, PROJECT_MANIFEST_FILENAME);
  const betaManifestPath = path.join(betaRoot, PROJECT_MANIFEST_FILENAME);
  const alphaManifest = JSON.parse(await fsPromises.readFile(alphaManifestPath, 'utf8'));
  const betaManifest = {
    schemaVersion: alphaManifest.schemaVersion,
    projectId: 'project-beta-failed-open-rollback',
    projectName: 'Бета',
    createdAtUtc: '2026-08-04T00:00:00.000Z',
  };
  for (const folderName of ['roman', 'mindmap', 'print', 'materials', 'reference', 'trash', 'backups']) {
    await fsPromises.mkdir(path.join(betaRoot, folderName), { recursive: true });
  }
  // Бета намеренно пуста (нет ни одной сцены): tree identity bootstrap корректно
  // выполняется для открываемого проекта, а open честно завершается E_PROJECT_EMPTY
  // уже ПОСЛЕ активации active project, что реально упражняет transactional rollback.
  await fsPromises.mkdir(path.join(betaRoot, 'roman', 'Imported'), { recursive: true });
  await fsPromises.writeFile(betaManifestPath, `${JSON.stringify(betaManifest, null, 2)}\n`, 'utf8');

  const openedAlpha = await harness.main.handleProjectLifecycleOpenCommand({ projectId: alphaManifest.projectId });
  assert.equal(openedAlpha.ok, true, JSON.stringify(openedAlpha));
  const alphaTreeBefore = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(alphaTreeBefore.ok, true, JSON.stringify(alphaTreeBefore));
  assert.equal(alphaTreeBefore.projectId, alphaManifest.projectId);

  const failedBetaOpen = await harness.main.handleProjectLifecycleOpenCommand({ projectId: betaManifest.projectId });
  assert.equal(failedBetaOpen.ok, false, JSON.stringify(failedBetaOpen));
  assert.equal(failedBetaOpen.code, 'E_PROJECT_EMPTY', JSON.stringify(failedBetaOpen));

  const activeTreeAfterFailure = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(activeTreeAfterFailure.ok, true, JSON.stringify(activeTreeAfterFailure));
  assert.equal(activeTreeAfterFailure.projectId, alphaManifest.projectId);
  const alphaRomanNode = findSerializedTreeNodeByName(activeTreeAfterFailure.root, 'Роман');
  assert.ok(alphaRomanNode && typeof alphaRomanNode.nodeId === 'string', JSON.stringify(activeTreeAfterFailure.root));

  const commandBridge = harness.ipcHandlers.get('ui:command-bridge');
  assert.equal(typeof commandBridge, 'function');
  const createAfterFailure = await commandBridge(harnessCallerEvent(), frameBridgeRequest({
    route: 'command.bus',
    commandId: 'cmd.project.tree.createNode',
    payload: {
      parentNodeId: alphaRomanNode.nodeId,
      kind: 'scene',
      name: 'alpha-after-failed-beta-open',
    },
  }));
  assert.equal(createAfterFailure.ok, true, JSON.stringify(createAfterFailure));
  assert.equal(createAfterFailure.value?.ok, true, JSON.stringify(createAfterFailure));
  assert.match(createAfterFailure.value.nodeId, /^tree-node-[a-f0-9]{32}$/u);
  assert.doesNotMatch(JSON.stringify(createAfterFailure), /E_TREE_NODE_NOT_FOUND/u);

  const alphaManifestAfter = await fsPromises.readFile(alphaManifestPath, 'utf8');
  const betaManifestAfter = await fsPromises.readFile(betaManifestPath, 'utf8');
  assert.equal(alphaManifestAfter.includes(createAfterFailure.value.nodeId), true);
  assert.equal(betaManifestAfter.includes(createAfterFailure.value.nodeId), false);
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

    const dispatched = await harness.ipcHandlers.get('ui:command-bridge')(harnessCallerEvent(), frameBridgeRequest({
      route: 'command.bus',
      commandId: scenario.commandId,
      payload: { projectId: manifest.projectId, ...scenario.payload },
    }));
    assert.equal(dispatched.ok, false, `${scenario.commandId}:${JSON.stringify(dispatched)}`);
    assert.match(JSON.stringify(dispatched), /E_PRODUCT_COMMAND_AUTHOR_SCHEMA_UNSUPPORTED/u);
    assert.equal(await fsPromises.readFile(manifestPath, 'utf8'), sourceRaw);
    assert.equal(fs.existsSync(path.join(projectRoot, 'backups', 'project-lifecycle-recovery')), false);
  }
});
