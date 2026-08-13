const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');

async function importModule(relativeParts) {
  return import(pathToFileURL(path.join(ROOT, ...relativeParts)).href);
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

function findNode(root, predicate) {
  if (!root) return null;
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

async function createProjectFixture(prefix) {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), prefix));
  const documentsRoot = path.join(tempRoot, 'Documents', 'craftsman');
  const projectRoot = path.join(documentsRoot, 'Роман');
  await fsPromises.mkdir(path.join(projectRoot, 'roman', 'Imported'), { recursive: true });
  await fsPromises.writeFile(
    path.join(projectRoot, 'project.craftsman.json'),
    JSON.stringify({
      schemaVersion: 1,
      projectId: 'project-alpha',
      projectName: 'Роман',
      createdAtUtc: '2026-07-18T20:00:00Z',
      proWorldModel: { kept: true },
    }, null, 2),
    'utf8',
  );
  return { tempRoot, documentsRoot, projectRoot };
}

test('S18 notes commands create update delete restore and query pathless read model', async (t) => {
  const { tempRoot, documentsRoot, projectRoot } = await createProjectFixture('notes-commands-main-');
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  const empty = await main.handleWorkspaceProjectNotesQuery({ projectId: 'project-alpha', scope: 'inbox' });
  assert.equal(empty.ok, true);
  assert.equal(empty.state, 'ready');
  assert.equal(empty.notes.length, 0);
  assert.equal(fs.existsSync(path.join(projectRoot, 'notes.craftsman.json')), false);

  const created = await main.handleNotesCreateCommand({
    projectId: 'project-alpha',
    noteId: 'note-inbox-1',
    scope: 'inbox',
    title: 'Capture',
    body: 'Alpha note body',
  }, { now: () => '2026-07-18T20:01:00Z' });
  assert.equal(created.ok, true);
  assert.equal(created.note.id, 'note-inbox-1');
  assert.equal(created.receipt.operation, 'create');
  assert.equal(created.receipt.recovery.snapshotCreated, true);
  assert.equal(JSON.stringify(created).includes(projectRoot), false);

  const updated = await main.handleNotesUpdateCommand({
    projectId: 'project-alpha',
    noteId: 'note-inbox-1',
    title: 'Updated',
    body: 'Beta note body',
  }, { now: () => '2026-07-18T20:02:00Z' });
  assert.equal(updated.ok, true);
  assert.equal(updated.note.title, 'Updated');

  const deleted = await main.handleNotesDeleteCommand({
    projectId: 'project-alpha',
    noteId: 'note-inbox-1',
  }, { now: () => '2026-07-18T20:03:00Z' });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.note.deleted, true);

  const restored = await main.handleNotesRestoreCommand({
    projectId: 'project-alpha',
    noteId: 'note-inbox-1',
  }, { now: () => '2026-07-18T20:04:00Z' });
  assert.equal(restored.ok, true);
  assert.equal(restored.note.deleted, false);

  const inbox = await main.handleWorkspaceProjectNotesQuery({ projectId: 'project-alpha', scope: 'inbox' });
  assert.equal(inbox.ok, true);
  assert.equal(inbox.notes.length, 1);
  assert.equal(inbox.notes[0].body, 'Beta note body');
  assert.equal(inbox.counts.inbox, 1);
  assert.equal(JSON.stringify(inbox).includes(projectRoot), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'project.craftsman.json'), 'utf8'));
  assert.deepEqual(manifest.proWorldModel, { kept: true });
});

test('S18 notes attach uses stable scene node ownership and rejects forged project', async (t) => {
  const { tempRoot, documentsRoot, projectRoot } = await createProjectFixture('notes-attach-main-');
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));
  await fsPromises.writeFile(path.join(projectRoot, 'roman', 'Imported', '01_Alpha.txt'), 'alpha text', 'utf8');

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  await main.buildProjectTreeRootsWithIdentities('Роман');
  await main.handleNotesCreateCommand({
    projectId: 'project-alpha',
    noteId: 'note-attach-1',
    scope: 'inbox',
    body: 'Attach me',
  }, { now: () => '2026-07-18T20:01:00Z' });
  const tree = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  const alpha = findNode(tree.root, (node) => node.kind === 'scene' && node.label === 'Alpha');
  assert.ok(alpha);

  const mismatch = await main.handleNotesAttachToSceneCommand({
    projectId: 'wrong-project',
    noteId: 'note-attach-1',
    nodeId: alpha.nodeId,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'E_NOTES_PROJECT_MISMATCH');

  const attached = await main.handleNotesAttachToSceneCommand({
    projectId: 'project-alpha',
    noteId: 'note-attach-1',
    nodeId: alpha.nodeId,
  }, { now: () => '2026-07-18T20:02:00Z' });
  assert.equal(attached.ok, true);
  assert.equal(attached.note.scope, 'scene');
  assert.equal(attached.note.attachment.nodeId, alpha.nodeId);
  assert.equal(attached.note.attachment.sceneId, 'roman/Imported/01_Alpha.txt');
  assert.equal(JSON.stringify(attached).includes(projectRoot), false);
});

test('S18 notes convert previews first then creates scene while preserving source note provenance', async (t) => {
  const { tempRoot, documentsRoot, projectRoot } = await createProjectFixture('notes-convert-main-');
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  await main.handleNotesCreateCommand({
    projectId: 'project-alpha',
    noteId: 'note-convert-1',
    scope: 'inbox',
    title: 'Converted',
    body: 'Scene from note',
  }, { now: () => '2026-07-18T20:01:00Z' });

  const preview = await main.handleNotesConvertToSceneCommand({
    projectId: 'project-alpha',
    noteId: 'note-convert-1',
    title: 'Converted scene',
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.preview, true);
  assert.equal(fs.readdirSync(path.join(projectRoot, 'roman', 'Imported')).length, 0);

  const converted = await main.handleNotesConvertToSceneCommand({
    projectId: 'project-alpha',
    noteId: 'note-convert-1',
    title: 'Converted scene',
    confirmed: true,
  }, { now: () => '2026-07-18T20:02:00Z' });
  assert.equal(converted.ok, true);
  assert.equal(converted.converted, true);
  assert.equal(converted.note.deleted, false);
  assert.equal(converted.note.conversions.length, 1);
  assert.equal(converted.note.conversions[0].sceneId, converted.scene.sceneId);
  assert.equal(JSON.stringify(converted).includes(projectRoot), false);

  const sceneFiles = fs.readdirSync(path.join(projectRoot, 'roman', 'Imported'));
  assert.equal(sceneFiles.length, 1);
  assert.equal(fs.readFileSync(path.join(projectRoot, 'roman', 'Imported', sceneFiles[0]), 'utf8'), 'Scene from note');
});

test('S18 notes command registry and capability policy expose node-only notes commands', async () => {
  const projectCommands = await importModule(['src', 'renderer', 'commands', 'projectCommands.mjs']);
  const capability = await importModule(['src', 'renderer', 'commands', 'capabilityPolicy.mjs']);
  const registered = new Map();
  const registry = {
    registerCommand(meta, handler) {
      registered.set(meta.id, { meta, handler });
    },
  };
  const calls = [];
  projectCommands.registerProjectCommands(registry, {
    electronAPI: {
      invokeUiCommandBridge: async (request) => {
        calls.push(request);
        return { ok: true, value: { ok: true, note: { id: request.payload.noteId || 'n1' }, receipt: { schemaVersion: 'notes-command-receipt.v1' } } };
      },
    },
  });

  const commandIds = [
    projectCommands.EXTRA_COMMAND_IDS.NOTES_CREATE,
    projectCommands.EXTRA_COMMAND_IDS.NOTES_UPDATE,
    projectCommands.EXTRA_COMMAND_IDS.NOTES_DELETE,
    projectCommands.EXTRA_COMMAND_IDS.NOTES_RESTORE,
    projectCommands.EXTRA_COMMAND_IDS.NOTES_ATTACH_SCENE,
    projectCommands.EXTRA_COMMAND_IDS.NOTES_CONVERT_SCENE,
  ];
  for (const commandId of commandIds) {
    assert.equal(registered.has(commandId), true);
    assert.equal(capability.enforceCapabilityForCommand(commandId, { platformId: 'node' }).ok, true);
    assert.equal(capability.enforceCapabilityForCommand(commandId, { platformId: 'web' }).ok, false);
  }

  const result = await registered.get(projectCommands.EXTRA_COMMAND_IDS.NOTES_CREATE).handler({
    projectId: 'project-alpha',
    noteId: 'note-created',
    body: 'body',
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].commandId, projectCommands.EXTRA_COMMAND_IDS.NOTES_CREATE);
  assert.equal(calls[0].route, 'command.bus');
  assert.deepEqual(calls[0].payload, {
    projectId: 'project-alpha',
    noteId: 'note-created',
    body: 'body',
  });
});
