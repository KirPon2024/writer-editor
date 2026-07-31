const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_MANIFEST_FILENAME = 'project.craftsman.json';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
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
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'project-lifecycle-s26-'));
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
    settingsPath: path.join(userDataRoot, 'settings.json'),
    autosavePath: path.join(documentsRoot, '.autosave', 'autosave.txt'),
  };
}

async function writeProject(root, options = {}) {
  const romanRoot = path.join(root, 'roman', 'Imported');
  await fsPromises.mkdir(romanRoot, { recursive: true });
  const manifest = {
    schemaVersion: options.schemaVersion ?? 1,
    projectId: options.projectId || 'project-alpha',
    projectName: options.projectName || 'Alpha',
    createdAtUtc: '2026-01-01T00:00:00.000Z',
  };
  await fsPromises.writeFile(
    path.join(root, PROJECT_MANIFEST_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  await fsPromises.writeFile(path.join(romanRoot, '01 Start.txt'), 'first scene', 'utf8');
  await fsPromises.writeFile(path.join(romanRoot, '02 Continue.txt'), 'second scene', 'utf8');
  return {
    manifest,
    secondRelativePath: path.join('roman', 'Imported', '02 Continue.txt'),
  };
}

function assertPathless(value, forbiddenRoot) {
  const text = JSON.stringify(value);
  assert.equal(text.includes(forbiddenRoot), false);
  assert.equal(/projectRoot|manifestPath|filePath|privatePath/u.test(text), false);
}

test('S26 project lifecycle: create builds local skeleton and pathless library entry', async (t) => {
  const harness = await createHarness(t);

  const created = await harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Alpha Book' });
  assert.equal(created.ok, true);
  assert.equal(created.created, true);
  assert.equal(created.recoveryChecked, true);
  assert.equal(typeof created.projectId, 'string');
  assert.ok(created.projectId);

  const projectRoot = path.join(harness.documentsRoot, 'Alpha Book');
  assert.equal(fs.existsSync(path.join(projectRoot, PROJECT_MANIFEST_FILENAME)), true);
  assert.equal(fs.existsSync(path.join(projectRoot, 'roman', 'Imported', '01 Начало.txt')), true);

  const library = await harness.main.handleWorkspaceProjectLibraryQuery({});
  assert.equal(library.ok, true);
  assert.equal(library.counts.total, 1);
  assert.equal(library.entries[0].projectId, created.projectId);
  assert.equal(library.entries[0].projectName, 'Alpha Book');
  assertPathless(library, harness.tempRoot);
});

test('S26 project lifecycle: open restores last active scene and cursor when valid', async (t) => {
  const harness = await createHarness(t);
  const projectRoot = path.join(harness.documentsRoot, 'Alpha');
  const { manifest, secondRelativePath } = await writeProject(projectRoot, {
    projectId: 'project-alpha',
    projectName: 'Alpha',
  });
  await fsPromises.writeFile(harness.settingsPath, JSON.stringify({
    lastProjectId: manifest.projectId,
    lastProjectRelativePath: secondRelativePath,
    lastProjectSelectionRange: { start: 2, end: 5 },
  }), 'utf8');

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(opened.ok, true);
  assert.equal(opened.opened, true);
  assert.equal(opened.continuationSource, 'last-active');
  assert.equal(opened.projectId, manifest.projectId);

  const settings = JSON.parse(await fsPromises.readFile(harness.settingsPath, 'utf8'));
  assert.equal(settings.lastProjectId, manifest.projectId);
  assert.equal(settings.lastProjectRelativePath, secondRelativePath);
  assert.deepEqual(settings.lastProjectSelectionRange, { start: 2, end: 5 });
});

test('S26 project lifecycle: recovery snapshot blocks create and open before editing', async (t) => {
  const harness = await createHarness(t);
  const projectRoot = path.join(harness.documentsRoot, 'Alpha');
  const { manifest } = await writeProject(projectRoot, {
    projectId: 'project-alpha',
    projectName: 'Alpha',
  });
  await fsPromises.mkdir(path.dirname(harness.autosavePath), { recursive: true });
  await fsPromises.writeFile(harness.autosavePath, 'unsaved recovery', 'utf8');

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(opened.ok, false);
  assert.equal(opened.reason, 'PROJECT_RECOVERY_PENDING');

  const created = await harness.main.handleProjectLifecycleCreateCommand({ projectName: 'Beta' });
  assert.equal(created.ok, false);
  assert.equal(created.reason, 'PROJECT_RECOVERY_PENDING');
});

test('S26 project lifecycle: future schema opens read-only and falls back to first scene', async (t) => {
  const harness = await createHarness(t);
  const projectRoot = path.join(harness.documentsRoot, 'Future');
  const { manifest } = await writeProject(projectRoot, {
    schemaVersion: 999,
    projectId: 'project-future',
    projectName: 'Future',
  });

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(opened.ok, true);
  assert.equal(opened.continuationSource, 'first-scene');
  assert.equal(opened.readOnlyProject, true);

  const rawManifest = JSON.parse(await fsPromises.readFile(path.join(projectRoot, PROJECT_MANIFEST_FILENAME), 'utf8'));
  assert.equal(rawManifest.schemaVersion, 999);
});

test('S26 project lifecycle UI bridge and renderer wiring are explicit', () => {
  const main = read('src/main.js');
  const renderer = read('src/renderer/editor.js');
  const html = read('src/renderer/index.html');
  const commands = read('src/renderer/commands/projectCommands.mjs');

  assert.match(main, /PROJECT_LIFECYCLE_CREATE_COMMAND_ID = 'cmd\.project\.lifecycle\.create'/u);
  assert.match(main, /PROJECT_LIFECYCLE_OPEN_COMMAND_ID = 'cmd\.project\.lifecycle\.open'/u);
  assert.match(main, /PROJECT_LIFECYCLE_CONTINUE_COMMAND_ID = 'cmd\.project\.lifecycle\.continue'/u);
  assert.match(main, /PROJECT_LIFECYCLE_CREATE_COMMAND_ID,/u);
  assert.match(main, /handleProjectLifecycleCreateCommand,/u);
  assert.match(main, /handleProjectLifecycleOpenCommand,/u);
  assert.match(main, /handleProjectLifecycleContinueCommand,/u);
  assert.match(renderer, /const PROJECT_LIBRARY_QUERY_ID = WORKSPACE_QUERY_IDS\.PROJECT_LIBRARY/u);
  assert.match(renderer, /WORKSPACE_QUERY_ID_SET\.has\(queryId\)/u);
  assert.match(renderer, /selectionRange: getSelectionOffsets\(\)/u);
  assert.match(renderer, /setSelectionRange\(incomingSelectionRange\.start, incomingSelectionRange\.end\)/u);
  assert.match(renderer, /function openProjectLibraryModal\(\)/u);
  assert.match(html, /data-project-library-modal/u);
  assert.match(html, /data-project-library-create/u);
  assert.match(html, /data-project-library-continue/u);
  assert.match(commands, /PROJECT_LIFECYCLE_CREATE: 'cmd\.project\.lifecycle\.create'/u);
  assert.match(commands, /PROJECT_LIFECYCLE_OPEN: 'cmd\.project\.lifecycle\.open'/u);
  assert.match(commands, /PROJECT_LIFECYCLE_CONTINUE: 'cmd\.project\.lifecycle\.continue'/u);
});
