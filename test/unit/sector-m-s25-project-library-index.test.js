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

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function loadProjectLibraryModule() {
  return import(pathToFileURL(path.join(ROOT, 'src', 'derived', 'projectLibraryReadModel.mjs')).href);
}

async function loadMainWithElectronStub(paths) {
  const mainPath = path.join(ROOT, 'src', 'main.js');
  const fileManagerPath = path.join(ROOT, 'src', 'utils', 'fileManager.js');
  const originalLoad = Module._load;
  const electronStub = {
    app: {
      getPath: (name) => {
        if (name === 'userData') return paths.userDataRoot;
        if (name === 'documents') return paths.documentsParent;
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

async function createHarness(t) {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'project-library-s25-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));
  const documentsParent = path.join(tempRoot, 'Documents');
  const documentsRoot = path.join(documentsParent, 'craftsman');
  const userDataRoot = path.join(tempRoot, 'userData');
  await fsPromises.mkdir(documentsRoot, { recursive: true });
  await fsPromises.mkdir(userDataRoot, { recursive: true });
  const { main, fileManager } = await loadMainWithElectronStub({ tempRoot, documentsParent, userDataRoot });
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });
  return {
    main,
    tempRoot,
    documentsRoot,
    userDataRoot,
    indexPath: path.join(userDataRoot, 'project-library-index.v1.json'),
  };
}

async function writeProject(root, options) {
  await fsPromises.mkdir(root, { recursive: true });
  const manifest = {
    schemaVersion: 1,
    projectId: options.projectId,
    projectName: options.projectName,
    createdAtUtc: options.createdAtUtc || '2026-01-01T00:00:00.000Z',
  };
  await fsPromises.writeFile(
    path.join(root, PROJECT_MANIFEST_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return manifest;
}

function assertPathlessReadModel(model, tempRoot) {
  const text = JSON.stringify(model);
  assert.equal(text.includes(tempRoot), false);
  assert.equal(/projectRoot|manifestPath|rootPath|filePath|privatePath/u.test(text), false);
}

test('S25 project library provider: builds pathless views and duplicate flags', async () => {
  const provider = await loadProjectLibraryModule();
  const model = provider.buildProjectLibraryReadModel({
    scannedAtUtc: '2026-01-04T00:00:00.000Z',
    projects: [
      {
        projectId: 'project-alpha',
        projectName: 'Alpha',
        locationKey: 'alpha-a',
        status: 'available',
        lastOpenedAtUtc: '2026-01-03T00:00:00.000Z',
      },
      {
        projectId: 'project-alpha',
        projectName: 'Alpha Copy',
        locationKey: 'alpha-b',
        status: 'archived',
      },
      {
        projectId: 'project-missing',
        projectName: 'Missing',
        locationKey: 'missing',
        status: 'missing',
      },
    ],
  });

  assert.equal(model.ok, true);
  assert.equal(model.schemaVersion, 'project-library-read-model.v1');
  assert.equal(model.authority.pathsExposed, false);
  assert.equal(model.authority.indexIsRebuildable, true);
  assert.equal(model.authority.accountRequired, false);
  assert.equal(model.authority.networkRequired, false);
  assert.equal(model.counts.total, 3);
  assert.equal(model.counts.duplicateProjectIds, 1);
  assert.equal(model.views.recent.length, 1);
  assert.equal(model.views.archived.length, 1);
  assert.equal(model.views.missing.length, 1);
  assert.equal(model.entries.filter((entry) => entry.duplicateProjectId).length, 2);
});

test('S25 project library main query: deleting index is safe and rebuild discovers manifests', async (t) => {
  const harness = await createHarness(t);
  await writeProject(path.join(harness.documentsRoot, 'Alpha'), {
    projectId: 'project-alpha',
    projectName: 'Alpha',
  });
  await fsPromises.rm(harness.indexPath, { force: true });

  const first = await harness.main.handleWorkspaceProjectLibraryQuery({});
  assert.equal(first.ok, true);
  assert.equal(first.state, 'ready');
  assert.equal(first.counts.total, 1);
  assert.equal(first.entries[0].projectId, 'project-alpha');
  assert.equal(first.entries[0].projectName, 'Alpha');
  assertPathlessReadModel(first, harness.tempRoot);
  assert.equal(fs.existsSync(harness.indexPath), true);

  await fsPromises.rm(harness.indexPath, { force: true });
  const rebuilt = await harness.main.handleWorkspaceProjectLibraryQuery({});
  assert.equal(rebuilt.ok, true);
  assert.equal(rebuilt.counts.total, 1);
  assert.equal(rebuilt.entries[0].projectId, 'project-alpha');
  assertPathlessReadModel(rebuilt, harness.tempRoot);
});

test('S25 project library main query: missing projects are reported from index, not deleted', async (t) => {
  const harness = await createHarness(t);
  const projectRoot = path.join(harness.documentsRoot, 'Vanishing');
  await writeProject(projectRoot, {
    projectId: 'project-vanishing',
    projectName: 'Vanishing',
  });
  const indexed = await harness.main.handleWorkspaceProjectLibraryQuery({});
  assert.equal(indexed.counts.total, 1);

  await fsPromises.rm(projectRoot, { recursive: true, force: true });
  const missing = await harness.main.handleWorkspaceProjectLibraryQuery({});
  assert.equal(missing.ok, true);
  assert.equal(missing.counts.total, 1);
  assert.equal(missing.counts.missing, 1);
  assert.equal(missing.entries[0].status, 'missing');
  assert.equal(missing.entries[0].projectId, 'project-vanishing');
  assert.equal(missing.entries[0].warnings.includes('PROJECT_MISSING'), true);
  assertPathlessReadModel(missing, harness.tempRoot);
});

test('S25 project library main query: archived trashed and duplicate project ids are visible pathlessly', async (t) => {
  const harness = await createHarness(t);
  await writeProject(path.join(harness.documentsRoot, 'Alpha'), {
    projectId: 'project-duplicate',
    projectName: 'Alpha',
  });
  await writeProject(path.join(harness.documentsRoot, 'archived', 'Alpha Archived'), {
    projectId: 'project-duplicate',
    projectName: 'Alpha Archived',
  });
  await writeProject(path.join(harness.documentsRoot, 'trash', 'Beta'), {
    projectId: 'project-beta',
    projectName: 'Beta',
  });

  const model = await harness.main.handleWorkspaceProjectLibraryQuery({});
  assert.equal(model.ok, true);
  assert.equal(model.counts.total, 3);
  assert.equal(model.counts.available, 1);
  assert.equal(model.counts.archived, 1);
  assert.equal(model.counts.trashed, 1);
  assert.equal(model.counts.duplicateProjectIds, 1);
  assert.equal(model.entries.filter((entry) => entry.duplicateProjectId).length, 2);
  assert.equal(model.views.archived.length, 1);
  assert.equal(model.views.trashed.length, 1);
  assertPathlessReadModel(model, harness.tempRoot);
});

test('S25 project library bridge: query is allowlisted and zero-network', () => {
  const main = read('src/main.js');
  const preload = read('src/preload.js');
  const provider = read('src/derived/projectLibraryReadModel.mjs');

  assert.match(main, /const PROJECT_LIBRARY_QUERY_ID = WORKSPACE_QUERY_IDS\.PROJECT_LIBRARY/u);
  assert.match(main, /\[PROJECT_LIBRARY_QUERY_ID,\s*handleWorkspaceProjectLibraryQuery\]/u);
  assert.match(main, /WORKSPACE_QUERY_BRIDGE_HANDLERS\.get\(queryId\)/u);
  assert.match(preload, /getProjectLibrary: \(payload\) => \{/u);
  assert.match(preload, /PROJECT_LIBRARY: 'query\.projectLibrary'/u);
  assert.match(preload, /queryId: PRELOAD_WORKSPACE_QUERY_IDS\.PROJECT_LIBRARY/u);
  assert.doesNotMatch(provider, /\bfetch\b|https?:|XMLHttpRequest|net\.request/u);
});
