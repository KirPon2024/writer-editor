const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');

async function loadNotesStorage() {
  return import(pathToFileURL(path.join(ROOT, 'src', 'product', 'notesStoragePersistence.mjs')).href);
}

async function writeAtomicForTest(filePath, content) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, content, 'utf8');
  return { success: true };
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

test('S17 notes schema normalizes Free note types and preserves unknown fields', async () => {
  const notesStorage = await loadNotesStorage();
  const result = notesStorage.normalizeNotesDocument({
    schemaVersion: 0,
    projectId: 'project-alpha',
    proFutureField: { atlasRefs: ['kept'] },
    notes: [
      {
        id: 'inbox-1',
        scope: 'inbox',
        title: 'Inbox',
        body: '  capture  ',
        proUnknown: { retained: true },
      },
      {
        id: 'project-1',
        scope: 'project',
        title: 'Project note',
        body: 'project body',
      },
      {
        id: 'manuscript-1',
        scope: 'manuscript',
        title: 'Manuscript note',
      },
      {
        id: 'scene-1',
        scope: 'scene',
        sceneId: 'roman/Imported/01_Alpha.txt',
        nodeId: 'tree-node-alpha',
      },
      {
        id: 'selection-1',
        scope: 'selection',
        sceneId: 'roman/Imported/01_Alpha.txt',
        nodeId: 'tree-node-alpha',
        attachment: {
          scope: 'selection',
          sceneId: 'roman/Imported/01_Alpha.txt',
          nodeId: 'tree-node-alpha',
          anchor: { kind: 'text-range', start: 10, end: 5, quoteHash: 'hash' },
          futureSelectionField: 'kept',
        },
      },
      {
        id: 'deleted-1',
        scope: 'inbox',
        tombstone: true,
        deletedAtUtc: '2026-07-18T20:00:00Z',
      },
    ],
  }, {
    projectId: 'project-alpha',
    now: () => '2026-07-18T20:00:00Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, 1);
  assert.deepEqual(result.value.proFutureField, { atlasRefs: ['kept'] });
  assert.equal(result.value.notes.length, 6);
  const byId = Object.fromEntries(result.value.notes.map((note) => [note.id, note]));
  assert.equal(byId['inbox-1'].scope, 'inbox');
  assert.equal(byId['inbox-1'].body, '  capture  ');
  assert.deepEqual(byId['inbox-1'].proUnknown, { retained: true });
  assert.equal(byId['project-1'].attachment.scope, 'project');
  assert.equal(byId['manuscript-1'].attachment.scope, 'manuscript');
  assert.equal(byId['scene-1'].sceneId, 'roman/Imported/01_Alpha.txt');
  assert.equal(byId['scene-1'].attachment.nodeId, 'tree-node-alpha');
  assert.equal(byId['selection-1'].attachment.anchor.start, 10);
  assert.equal(byId['selection-1'].attachment.anchor.end, 10);
  assert.equal(byId['selection-1'].attachment.futureSelectionField, 'kept');
  assert.equal(byId['deleted-1'].deleted, true);
  assert.equal(byId['deleted-1'].deletedAtUtc, '2026-07-18T20:00:00Z');
});

test('S17 notes mutations preserve body whitespace and reject oversized body', async () => {
  const notesStorage = await loadNotesStorage();
  const created = notesStorage.applyNotesMutation(
    { schemaVersion: 1, projectId: 'project-alpha', notes: [] },
    {
      op: 'create',
      noteId: 'lossless-1',
      scope: 'inbox',
      title: 'Lossless',
      body: '  exact body  \n',
    },
    {
      projectId: 'project-alpha',
      now: () => '2026-07-18T20:00:00Z',
    },
  );

  assert.equal(created.ok, true);
  assert.equal(created.note.body, '  exact body  \n');
  assert.equal(created.document.notes[0].body, '  exact body  \n');

  const oversized = notesStorage.applyNotesMutation(
    created.document,
    {
      op: 'update',
      noteId: 'lossless-1',
      body: 'x'.repeat(notesStorage.NOTES_BODY_MAX_LENGTH + 1),
    },
    {
      projectId: 'project-alpha',
      now: () => '2026-07-18T20:01:00Z',
    },
  );

  assert.equal(oversized.ok, false);
  assert.equal(oversized.code, 'E_NOTE_BODY_TOO_LARGE');
  assert.equal(oversized.reason, 'NOTE_BODY_TOO_LARGE');
});

test('S17 notes storage missing project stays read-only until explicit atomic migration', async (t) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'notes-storage-missing-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const notesStorage = await loadNotesStorage();
  const missing = await notesStorage.readNotesStorage({
    projectRoot: tempRoot,
    projectId: 'project-alpha',
    readFile: async () => {
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    },
    now: () => '2026-07-18T20:00:00Z',
  });

  assert.equal(missing.ok, true);
  assert.equal(missing.state, 'missing');
  assert.deepEqual(missing.document.notes, []);
  assert.equal(fs.existsSync(path.join(tempRoot, notesStorage.NOTES_STORAGE_FILENAME)), false);

  let writes = 0;
  const migrated = await notesStorage.migrateNotesStorage({
    projectRoot: tempRoot,
    projectId: 'project-alpha',
    writeFileAtomic: async (filePath, content) => {
      writes += 1;
      return writeAtomicForTest(filePath, content);
    },
    writeRecoveryFileAtomic: writeAtomicForTest,
    now: () => '2026-07-18T20:00:00Z',
  });

  assert.equal(migrated.ok, true);
  assert.equal(migrated.migrated, true);
  assert.equal(writes, 1);
  assert.equal(migrated.receipt.recovery, null);
  assert.equal(fs.existsSync(path.join(tempRoot, notesStorage.NOTES_STORAGE_FILENAME)), true);

  const second = await notesStorage.migrateNotesStorage({
    projectRoot: tempRoot,
    projectId: 'project-alpha',
    writeFileAtomic: async () => {
      throw new Error('should not write');
    },
    writeRecoveryFileAtomic: async () => {
      throw new Error('should not write recovery');
    },
    now: () => '2026-07-18T20:00:00Z',
  });
  assert.equal(second.ok, true);
  assert.equal(second.migrated, false);
});

test('S17 notes storage corrupt source writes readable recovery before replacement', async (t) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'notes-storage-corrupt-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const notesStorage = await loadNotesStorage();
  const notesPath = path.join(tempRoot, notesStorage.NOTES_STORAGE_FILENAME);
  await fsPromises.writeFile(notesPath, '{ broken json', 'utf8');

  const result = await notesStorage.migrateNotesStorage({
    projectRoot: tempRoot,
    projectId: 'project-alpha',
    writeFileAtomic: async (filePath, content) => {
      await fsPromises.writeFile(filePath, content, 'utf8');
      return { success: true };
    },
    writeRecoveryFileAtomic: writeAtomicForTest,
    now: () => '2026-07-18T20:00:00Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'corrupt');
  assert.equal(result.receipt.recovery.snapshotCreated, true);
  assert.equal(result.receipt.recovery.snapshotReadable, true);
  assert.equal(result.receipt.recovery.snapshotHashMatchesInput, true);
  assert.equal(JSON.stringify(result).includes(tempRoot), false);
  const recoveryRoot = path.join(tempRoot, 'backups', notesStorage.NOTES_RECOVERY_DIRNAME);
  const recoveryFiles = fs.readdirSync(recoveryRoot);
  assert.equal(recoveryFiles.length, 1);
  assert.equal(fs.readFileSync(path.join(recoveryRoot, recoveryFiles[0]), 'utf8'), '{ broken json');
  const after = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
  assert.equal(after.schemaVersion, 1);
  assert.deepEqual(after.notes, []);
});

test('S17 notes storage write failure reports recovery without mutating source', async (t) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'notes-storage-fail-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const notesStorage = await loadNotesStorage();
  const notesPath = path.join(tempRoot, notesStorage.NOTES_STORAGE_FILENAME);
  const oldText = JSON.stringify({
    schemaVersion: 0,
    projectId: 'project-alpha',
    notes: [{ id: 'n1', scope: 'scene', sceneId: 's1', body: 'body' }],
  });
  await fsPromises.writeFile(notesPath, oldText, 'utf8');

  const result = await notesStorage.migrateNotesStorage({
    projectRoot: tempRoot,
    projectId: 'project-alpha',
    writeFileAtomic: async () => ({ success: false, error: 'disk full' }),
    writeRecoveryFileAtomic: writeAtomicForTest,
    now: () => '2026-07-18T20:00:00Z',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'E_NOTES_STORAGE_WRITE_FAILED');
  assert.equal(result.recovery.snapshotCreated, true);
  assert.equal(fs.readFileSync(notesPath, 'utf8'), oldText);
});

test('S17 main notes migration uses project authority and preserves Pro unknown fields pathlessly', async (t) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'notes-storage-main-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const documentsRoot = path.join(tempRoot, 'Documents', 'craftsman');
  const projectRoot = path.join(documentsRoot, 'Роман');
  await fsPromises.mkdir(projectRoot, { recursive: true });
  await fsPromises.writeFile(
    path.join(projectRoot, 'project.craftsman.json'),
    JSON.stringify({
      schemaVersion: 1,
      projectId: 'project-alpha',
      projectName: 'Роман',
      createdAtUtc: '2026-07-18T20:00:00Z',
      proWorldModel: { characters: ['kept'] },
    }, null, 2),
    'utf8',
  );
  await fsPromises.writeFile(
    path.join(projectRoot, 'notes.craftsman.json'),
    JSON.stringify({
      schemaVersion: 0,
      projectId: 'project-alpha',
      notes: [{ id: 'main-1', scope: 'inbox', body: 'capture', proNoteField: 'kept' }],
      proNotesIndex: { future: true },
    }),
    'utf8',
  );

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  const mismatch = await main.migrateProjectNotesStorage({ projectId: 'wrong-project' });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'E_NOTES_PROJECT_MISMATCH');

  const migrated = await main.migrateProjectNotesStorage({
    projectId: 'project-alpha',
    now: () => '2026-07-18T20:00:00Z',
  });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.receipt.schemaVersion, 'notes-storage-migration-receipt.v1');
  assert.equal(migrated.document.proNotesIndex.future, true);
  assert.equal(migrated.document.notes[0].proNoteField, 'kept');
  assert.equal(JSON.stringify(migrated).includes(projectRoot), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'project.craftsman.json'), 'utf8'));
  assert.deepEqual(manifest.proWorldModel, { characters: ['kept'] });
});
