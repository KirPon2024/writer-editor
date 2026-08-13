const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
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

function sha256(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex');
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

test('metadata inspector read model exposes active scene metadata without file paths', async (t) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'metadata-read-main-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const documentsRoot = path.join(tempRoot, 'Documents', 'craftsman');
  const projectRoot = path.join(documentsRoot, 'Роман');
  const importedRoot = path.join(projectRoot, 'roman', 'Imported');
  await fsPromises.mkdir(importedRoot, { recursive: true });
  await fsPromises.writeFile(
    path.join(importedRoot, '01_Alpha.txt'),
    [
      '[meta]',
      'synopsis: Quiet scene summary',
      'status: чистовой текст',
      'tags: POV=Kira; линия=A; место=Station',
      '[/meta]',
      '',
      'alpha beta gamma',
    ].join('\n'),
    'utf8',
  );

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  await main.buildProjectTreeRootsWithIdentities('Роман');
  const tree = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(tree.ok, true);
  const alpha = findNode(tree.root, (node) => node.kind === 'scene' && node.label === 'Alpha');
  assert.ok(alpha);

  const result = await main.handleWorkspaceMetadataInspectorQuery({
    projectId: tree.projectId,
    nodeId: alpha.nodeId,
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'ready');
  assert.equal(result.context.nodeId, alpha.nodeId);
  assert.equal(result.context.kind, 'scene');
  assert.equal(result.context.title, 'Alpha');
  assert.equal(result.context.metaEnabled, true);
  assert.equal(result.metadata.synopsis, 'Quiet scene summary');
  assert.equal(result.metadata.status, 'чистовой текст');
  assert.deepEqual(result.metadata.tags, { pov: 'Kira', line: 'A', place: 'Station' });
  assert.equal(result.wordCount, 3);
  assert.match(result.modifiedAtUtc, /^\d{4}-\d{2}-\d{2}T/u);
  assert.equal(result.contentHash, sha256(await fsPromises.readFile(path.join(importedRoot, '01_Alpha.txt'), 'utf8')));
  assert.equal(JSON.stringify(result).includes(projectRoot), false);
});

test('metadata inspector read model exposes legacy manuscript documents without granting metadata writes', async (t) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'metadata-read-empty-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const documentsRoot = path.join(tempRoot, 'Documents', 'craftsman');
  const legacyRoot = path.join(documentsRoot, 'Роман', 'roman');
  const legacyText = 'Первый сон возвращается перед рассветом.';
  await fsPromises.mkdir(legacyRoot, { recursive: true });
  await fsPromises.writeFile(path.join(legacyRoot, 'сны.txt'), legacyText, 'utf8');
  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  await main.buildProjectTreeRootsWithIdentities('Роман');
  const empty = await main.handleWorkspaceMetadataInspectorQuery({});
  assert.equal(empty.ok, true);
  assert.equal(empty.state, 'empty');
  assert.equal(empty.unavailableReason, 'NO_ACTIVE_NODE');

  const tree = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  const romanSection = findNode(tree.root, (node) => node.kind === 'roman-section' && node.label === 'сны');
  assert.ok(romanSection);
  const legacyDocument = await main.handleWorkspaceMetadataInspectorQuery({
    projectId: tree.projectId,
    nodeId: romanSection.nodeId,
  });
  assert.equal(legacyDocument.ok, true);
  assert.equal(legacyDocument.state, 'ready');
  assert.equal(legacyDocument.context.kind, 'roman-section');
  assert.equal(legacyDocument.context.title, 'сны');
  assert.equal(legacyDocument.context.metaEnabled, false);
  assert.equal(legacyDocument.wordCount, 5);
  assert.match(legacyDocument.modifiedAtUtc, /^\d{4}-\d{2}-\d{2}T/u);
  assert.equal(Object.hasOwn(legacyDocument, 'contentHash'), false);
  assert.equal(JSON.stringify(legacyDocument).includes(documentsRoot), false);

  const blockedWrite = await main.handleMetadataUpdateCommand({
    projectId: tree.projectId,
    nodeId: romanSection.nodeId,
    baselineHash: sha256(legacyText),
    metadata: { synopsis: 'Не должно сохраниться' },
  });
  assert.equal(blockedWrite.ok, false);
  assert.equal(blockedWrite.code, 'E_METADATA_UPDATE_KIND_BLOCKED');
  assert.equal(await fsPromises.readFile(path.join(legacyRoot, 'сны.txt'), 'utf8'), legacyText);
});

test('metadata update command writes only metadata and preserves text plus unknown fields', async (t) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'metadata-write-main-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const documentsRoot = path.join(tempRoot, 'Documents', 'craftsman');
  const projectRoot = path.join(documentsRoot, 'Роман');
  const importedRoot = path.join(projectRoot, 'roman', 'Imported');
  const scenePath = path.join(importedRoot, '01_Alpha.txt');
  await fsPromises.mkdir(importedRoot, { recursive: true });
  const before = [
    '[meta]',
    'synopsis: Old summary',
    'status: черновик',
    'tags: POV=Old; линия=Old line; место=Old place',
    '[/meta]',
    '',
    'alpha beta gamma',
    '',
    '[pro-unknown]',
    '{"timeline":["future"]}',
    '[/pro-unknown]',
  ].join('\n');
  await fsPromises.writeFile(scenePath, before, 'utf8');

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  await main.buildProjectTreeRootsWithIdentities('Роман');
  const tree = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  const alpha = findNode(tree.root, (node) => node.kind === 'scene' && node.label === 'Alpha');
  assert.ok(alpha);

  const result = await main.handleMetadataUpdateCommand({
    projectId: tree.projectId,
    nodeId: alpha.nodeId,
    baselineHash: sha256(before),
    metadata: {
      synopsis: 'New summary',
      status: 'чистовой текст',
      tags: { pov: 'Kira', line: 'A', place: 'Station' },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.updated, true);
  assert.equal(result.receipt.schemaVersion, 'metadata-update-receipt.v1');
  assert.equal(result.receipt.recovery.snapshotCreated, true);
  assert.equal(result.receipt.recovery.snapshotReadable, true);
  assert.equal(result.receipt.recovery.snapshotHashMatchesInput, true);
  assert.equal(JSON.stringify(result).includes(projectRoot), false);

  const after = await fsPromises.readFile(scenePath, 'utf8');
  assert.ok(after.includes('synopsis: New summary'));
  assert.ok(after.includes('status: чистовой текст'));
  assert.ok(after.includes('tags: POV=Kira; линия=A; место=Station'));
  assert.ok(after.includes('alpha beta gamma'));
  assert.ok(after.includes('[pro-unknown]\n{"timeline":["future"]}\n[/pro-unknown]'));
  assert.equal(after.replace(/^\[meta\][\s\S]*?\[\/meta\]\n\n/u, ''), before.replace(/^\[meta\][\s\S]*?\[\/meta\]\n\n/u, ''));
});

test('metadata update command fails closed on stale context and renderer path authority', async (t) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'metadata-write-stale-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));

  const documentsRoot = path.join(tempRoot, 'Documents', 'craftsman');
  const projectRoot = path.join(documentsRoot, 'Роман');
  const importedRoot = path.join(projectRoot, 'roman', 'Imported');
  const scenePath = path.join(importedRoot, '01_Alpha.txt');
  await fsPromises.mkdir(importedRoot, { recursive: true });
  const before = [
    '[meta]',
    'synopsis: Old summary',
    'status: черновик',
    'tags: POV=; линия=; место=',
    '[/meta]',
    '',
    'alpha beta gamma',
  ].join('\n');
  await fsPromises.writeFile(scenePath, before, 'utf8');

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  await main.buildProjectTreeRootsWithIdentities('Роман');
  const tree = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  const alpha = findNode(tree.root, (node) => node.kind === 'scene' && node.label === 'Alpha');
  assert.ok(alpha);

  const pathAuthority = await main.handleMetadataUpdateCommand({
    projectId: tree.projectId,
    nodeId: alpha.nodeId,
    baselineHash: sha256(before),
    path: scenePath,
    metadata: { synopsis: 'Blocked', status: 'черновик', tags: {} },
  });
  assert.equal(pathAuthority.ok, false);
  assert.equal(pathAuthority.reason, 'METADATA_UPDATE_RENDERER_AUTHORITY_DENIED');

  const stale = await main.handleMetadataUpdateCommand({
    projectId: tree.projectId,
    nodeId: alpha.nodeId,
    baselineHash: sha256('different content'),
    metadata: { synopsis: 'Blocked', status: 'чистовой текст', tags: {} },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'METADATA_UPDATE_STALE_CONTEXT');
  assert.equal(await fsPromises.readFile(scenePath, 'utf8'), before);
});
