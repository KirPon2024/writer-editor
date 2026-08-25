import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROJECT_MANIFEST_FILENAME = 'project.craftsman.json';
const {
  MAX_CONTEXT_REVISION,
  MAX_RELATIVE_PATH_LENGTH,
  SESSION_CONTINUITY_SCHEMA_VERSION,
  commitSessionContinuityV1,
  readSessionContinuityV1,
  validateSessionContinuityV1,
} = require('../../src/core/session-continuity-v1.cjs');

function makeInput(overrides = {}) {
  return {
    projectId: 'project-alpha',
    documentRelativePath: 'roman/Imported/02 Continue.txt',
    selectionRange: { start: 2, end: 5 },
    ...overrides,
  };
}

function makeRecord(overrides = {}) {
  return commitSessionContinuityV1(undefined, makeInput(overrides));
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
  const tempRoot = await fsPromises.realpath(
    await fsPromises.mkdtemp(path.join(os.tmpdir(), 'r24-wp302-')),
  );
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
    fileManager,
    main,
    documentsRoot,
    settingsPath: path.join(userDataRoot, 'settings.json'),
  };
}

async function writeProject(root) {
  const romanRoot = path.join(root, 'roman', 'Imported');
  await fsPromises.mkdir(romanRoot, { recursive: true });
  const manifest = {
    schemaVersion: 1,
    projectId: 'project-alpha',
    projectName: 'Alpha',
    createdAtUtc: '2026-01-01T00:00:00.000Z',
  };
  await fsPromises.writeFile(
    path.join(root, PROJECT_MANIFEST_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  await fsPromises.writeFile(path.join(romanRoot, '01 Start.txt'), 'first scene', 'utf8');
  await fsPromises.writeFile(path.join(romanRoot, '02 Продолжение 👩🏽‍💻.txt'), 'second scene', 'utf8');
  return {
    manifest,
    firstRelativePath: 'roman/Imported/01 Start.txt',
    secondRelativePath: 'roman/Imported/02 Продолжение 👩🏽‍💻.txt',
  };
}

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

test('WP302 model commits one immutable Unicode-safe V1 context', () => {
  const record = makeRecord({
    projectId: 'project-роман',
    documentRelativePath: 'roman\\Черновик\\Сцена e\u0301 👩🏽‍💻.txt',
    selectionRange: { start: 7, end: 11 },
  });

  assert.equal(record.schemaVersion, SESSION_CONTINUITY_SCHEMA_VERSION);
  assert.equal(record.revision, 1);
  assert.equal(record.documentRelativePath, 'roman/Черновик/Сцена e\u0301 👩🏽‍💻.txt');
  assert.deepEqual(record.selectionRange, { start: 7, end: 11 });
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.selectionRange), true);
  assert.equal(validateSessionContinuityV1(record).ok, true);
  assert.equal(JSON.stringify(record).includes('/Volumes/'), false);
});

test('WP302 contract negatives reject schema drift, path authority, and malformed selection', () => {
  const valid = makeRecord();
  const mutants = [
    { ...valid, extraAuthority: true },
    { ...valid, schemaVersion: 'yalken.sessionContinuity.v2' },
    { ...valid, revision: 0 },
    { ...valid, projectId: '../project' },
    { ...valid, documentRelativePath: '/Users/private/Draft.txt' },
    { ...valid, documentRelativePath: '../Draft.txt' },
    { ...valid, documentRelativePath: 'C:\\private\\Draft.txt' },
    { ...valid, documentRelativePath: `roman/${'x'.repeat(256)}.txt` },
    { ...valid, documentRelativePath: `roman/${'x'.repeat(MAX_RELATIVE_PATH_LENGTH)}` },
    { ...valid, selectionRange: { start: 8, end: 4 } },
    { ...valid, selectionRange: { start: 1, end: 2, anchor: 1 } },
  ];

  for (const mutant of mutants) {
    assert.equal(validateSessionContinuityV1(mutant).ok, false, JSON.stringify(mutant));
  }
});

test('WP302 commit is idempotent and advances one monotonic revision on change', () => {
  const first = makeRecord();
  const replay = commitSessionContinuityV1(first, makeInput());
  assert.deepEqual(replay, first);
  assert.equal(replay.revision, 1);

  const changed = commitSessionContinuityV1(first, makeInput({
    selectionRange: { start: 5, end: 5 },
  }));
  assert.equal(changed.revision, 2);
  assert.deepEqual(changed.selectionRange, { start: 5, end: 5 });

  const exhausted = { ...first, revision: MAX_CONTEXT_REVISION };
  assert.throws(
    () => commitSessionContinuityV1(exhausted, makeInput({ selectionRange: { start: 6, end: 6 } })),
    (error) => error?.code === 'E_SESSION_CONTINUITY_REVISION_EXHAUSTED',
  );
});

test('WP302 legacy migration is bounded and a malformed present V1 blocks forged legacy fallback', () => {
  const legacy = readSessionContinuityV1({
    lastProjectId: 'project-alpha',
    lastProjectRelativePath: 'roman\\Imported\\02 Continue.txt',
    lastProjectSelectionRange: { start: 3, end: 9 },
  });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.source, 'legacy');
  assert.equal(legacy.record.documentRelativePath, 'roman/Imported/02 Continue.txt');
  assert.deepEqual(legacy.record.selectionRange, { start: 3, end: 9 });

  const truncatedOrForged = readSessionContinuityV1({
    sessionContinuityV1: {
      schemaVersion: SESSION_CONTINUITY_SCHEMA_VERSION,
      projectId: 'project-alpha',
    },
    lastProjectId: 'project-forged',
    lastProjectRelativePath: 'roman/Imported/forged.txt',
    lastProjectSelectionRange: { start: 0, end: 0 },
  });
  assert.equal(truncatedOrForged.ok, false);
  assert.equal(truncatedOrForged.present, true);
  assert.equal(truncatedOrForged.source, 'v1');
  assert.equal(truncatedOrForged.record, null);
});

test('WP302 integration restores V1 scene and cursor while rewriting conflicting legacy mirrors', async (t) => {
  const harness = await createHarness(t);
  const projectRoot = path.join(harness.documentsRoot, 'Alpha');
  const { manifest, firstRelativePath, secondRelativePath } = await writeProject(projectRoot);
  const continuity = makeRecord({
    projectId: manifest.projectId,
    documentRelativePath: secondRelativePath,
    selectionRange: { start: 2, end: 7 },
  });
  await fsPromises.writeFile(harness.settingsPath, JSON.stringify({
    sessionContinuityV1: continuity,
    lastProjectId: manifest.projectId,
    lastProjectRelativePath: firstRelativePath,
    lastProjectSelectionRange: { start: 0, end: 0 },
  }), 'utf8');

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.equal(opened.continuationSource, 'last-active');
  const persisted = JSON.parse(await fsPromises.readFile(harness.settingsPath, 'utf8'));
  assert.equal(persisted.sessionContinuityV1.documentRelativePath, secondRelativePath);
  assert.deepEqual(persisted.sessionContinuityV1.selectionRange, { start: 2, end: 7 });
  assert.equal(persisted.lastProjectRelativePath, secondRelativePath);
  assert.deepEqual(persisted.lastProjectSelectionRange, { start: 2, end: 7 });
  assert.equal(
    await harness.main.resolveLastOpenedFilePath(persisted),
    path.join(projectRoot, ...secondRelativePath.split('/')),
  );
});

test('WP302 return clamps a stale cursor to the recovered document length', async (t) => {
  const harness = await createHarness(t);
  const projectRoot = path.join(harness.documentsRoot, 'Alpha');
  const { manifest, secondRelativePath } = await writeProject(projectRoot);
  await fsPromises.writeFile(harness.settingsPath, JSON.stringify({
    sessionContinuityV1: makeRecord({
      projectId: manifest.projectId,
      documentRelativePath: secondRelativePath,
      selectionRange: { start: 200, end: 400 },
    }),
  }), 'utf8');

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const persisted = JSON.parse(await fsPromises.readFile(harness.settingsPath, 'utf8'));
  assert.deepEqual(persisted.sessionContinuityV1.selectionRange, { start: 12, end: 12 });
});

test('WP302 missing saved scene cannot transfer its cursor to the fallback scene', async (t) => {
  const harness = await createHarness(t);
  const projectRoot = path.join(harness.documentsRoot, 'Alpha');
  const { manifest, firstRelativePath } = await writeProject(projectRoot);
  await fsPromises.writeFile(harness.settingsPath, JSON.stringify({
    sessionContinuityV1: makeRecord({
      projectId: manifest.projectId,
      documentRelativePath: 'roman/Imported/99 Missing.txt',
      selectionRange: { start: 2, end: 7 },
    }),
  }), 'utf8');

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.equal(opened.continuationSource, 'first-scene');
  const persisted = JSON.parse(await fsPromises.readFile(harness.settingsPath, 'utf8'));
  assert.equal(persisted.sessionContinuityV1.documentRelativePath, firstRelativePath);
  assert.deepEqual(persisted.sessionContinuityV1.selectionRange, { start: 0, end: 0 });
});

test('WP302 project open fails closed when continuity persistence fails', async (t) => {
  const harness = await createHarness(t);
  const projectRoot = path.join(harness.documentsRoot, 'Alpha');
  const { manifest, secondRelativePath } = await writeProject(projectRoot);
  await fsPromises.writeFile(harness.settingsPath, JSON.stringify({
    sessionContinuityV1: makeRecord({
      projectId: manifest.projectId,
      documentRelativePath: secondRelativePath,
      selectionRange: { start: 2, end: 7 },
    }),
  }), 'utf8');

  const originalWriteFileAtomic = harness.fileManager.writeFileAtomic;
  harness.fileManager.writeFileAtomic = async (filePath, ...args) => (
    path.resolve(filePath) === path.resolve(harness.settingsPath)
      ? { success: false, error: 'injected continuity write failure' }
      : originalWriteFileAtomic(filePath, ...args)
  );
  t.after(() => { harness.fileManager.writeFileAtomic = originalWriteFileAtomic; });

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(opened.ok, false, JSON.stringify(opened));
  assert.equal(opened.code, 'E_SESSION_CONTINUITY_PERSIST_FAILED');
  const persisted = JSON.parse(await fsPromises.readFile(harness.settingsPath, 'utf8'));
  assert.deepEqual(persisted.sessionContinuityV1.selectionRange, { start: 2, end: 7 });
});

test('WP302 valid context for another project cannot select the current project scene', async (t) => {
  const harness = await createHarness(t);
  const projectRoot = path.join(harness.documentsRoot, 'Alpha');
  const { manifest, firstRelativePath, secondRelativePath } = await writeProject(projectRoot);
  await fsPromises.writeFile(harness.settingsPath, JSON.stringify({
    sessionContinuityV1: makeRecord({
      projectId: 'project-other',
      documentRelativePath: secondRelativePath,
      selectionRange: { start: 2, end: 7 },
    }),
    lastProjectId: manifest.projectId,
    lastProjectRelativePath: secondRelativePath,
    lastProjectSelectionRange: { start: 2, end: 7 },
  }), 'utf8');

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.equal(opened.continuationSource, 'first-scene');
  const persisted = JSON.parse(await fsPromises.readFile(harness.settingsPath, 'utf8'));
  assert.equal(persisted.sessionContinuityV1.projectId, manifest.projectId);
  assert.equal(persisted.sessionContinuityV1.documentRelativePath, firstRelativePath);
  assert.deepEqual(persisted.sessionContinuityV1.selectionRange, { start: 0, end: 0 });
});

test('WP302 crash recovery refuses malformed V1 and explicit open safely starts at first scene', async (t) => {
  const harness = await createHarness(t);
  const projectRoot = path.join(harness.documentsRoot, 'Alpha');
  const { manifest, firstRelativePath, secondRelativePath } = await writeProject(projectRoot);
  const malformed = {
    schemaVersion: SESSION_CONTINUITY_SCHEMA_VERSION,
    revision: 4,
    projectId: manifest.projectId,
    documentRelativePath: '../outside.txt',
    selectionRange: { start: 4, end: 8 },
  };
  const settings = {
    sessionContinuityV1: malformed,
    lastProjectId: manifest.projectId,
    lastProjectRelativePath: secondRelativePath,
    lastProjectSelectionRange: { start: 4, end: 8 },
  };
  await fsPromises.writeFile(harness.settingsPath, JSON.stringify(settings), 'utf8');
  assert.equal(await harness.main.resolveLastOpenedFilePath(settings), null);

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.equal(opened.continuationSource, 'first-scene');
  const persisted = JSON.parse(await fsPromises.readFile(harness.settingsPath, 'utf8'));
  assert.equal(persisted.sessionContinuityV1.documentRelativePath, firstRelativePath);
  assert.deepEqual(persisted.sessionContinuityV1.selectionRange, { start: 0, end: 0 });
  assert.equal(validateSessionContinuityV1(persisted.sessionContinuityV1).ok, true);
});

test('WP302 rename rebind preserves the active document cursor', async (t) => {
  const harness = await createHarness(t);
  const projectRoot = path.join(harness.documentsRoot, 'Роман');
  const { manifest, secondRelativePath } = await writeProject(projectRoot);
  await fsPromises.writeFile(harness.settingsPath, JSON.stringify({
    sessionContinuityV1: makeRecord({
      projectId: manifest.projectId,
      documentRelativePath: secondRelativePath,
      selectionRange: { start: 2, end: 7 },
    }),
  }), 'utf8');

  const opened = await harness.main.handleProjectLifecycleOpenCommand({ projectId: manifest.projectId });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  await harness.main.buildProjectTreeRootsWithIdentities('Роман');
  const tree = await harness.main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(tree.ok, true, JSON.stringify(tree));
  const activeScene = findNode(
    tree.root,
    (node) => node.kind === 'scene' && typeof node.label === 'string' && node.label.includes('Продолжение'),
  );
  assert.ok(activeScene);

  const renamed = await harness.main.handleUiRenameNodeCommand({
    projectId: manifest.projectId,
    nodeId: activeScene.nodeId,
    name: 'Renamed Continuity',
  });
  assert.equal(renamed.ok, true, JSON.stringify(renamed));
  const persisted = JSON.parse(await fsPromises.readFile(harness.settingsPath, 'utf8'));
  assert.match(persisted.sessionContinuityV1.documentRelativePath, /Renamed Continuity\.txt$/u);
  assert.deepEqual(persisted.sessionContinuityV1.selectionRange, { start: 2, end: 7 });
});

test('WP302 active document path rebind preserves selection without adding UI or background work', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const contractSource = fs.readFileSync(path.join(ROOT, 'src', 'core', 'session-continuity-v1.cjs'), 'utf8');
  assert.match(mainSource, /const continuity = readSessionContinuityV1\(settings\);[\s\S]*openLastFile/u);
  assert.match(mainSource, /await saveLastFile\(\{ selectionRange \}\);/u);
  assert.match(mainSource, /metaEnabled: context\.metaEnabled,[\s\S]*selectionRange,/u);
  assert.match(mainSource, /preserveSelectionOnPathRebind: true/u);
  assert.equal(contractSource.includes('src/renderer'), false);
  assert.equal(contractSource.includes('setInterval'), false);
  assert.equal(contractSource.includes('setTimeout'), false);
});
