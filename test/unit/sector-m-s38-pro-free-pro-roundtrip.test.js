const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  buildProjectArchiveBuffer,
  verifyProjectArchiveBuffer,
} = require('../../src/export/archive/projectArchiveExportHandler');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_MANIFEST_FILENAME = 'project.craftsman.json';

function assertPathless(value, forbiddenRoot) {
  const text = JSON.stringify(value);
  assert.equal(text.includes(forbiddenRoot), false);
  assert.equal(/projectRoot|manifestPath|rootPath|privatePath|filePath/u.test(text), false);
}

async function importRepoModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
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

async function createHarness(t, prefix = 's38-roundtrip-') {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));
  const documentsParent = path.join(tempRoot, 'Documents');
  const documentsRoot = path.join(documentsParent, 'craftsman');
  const userDataRoot = path.join(tempRoot, 'userData');
  await fsPromises.mkdir(documentsRoot, { recursive: true });
  await fsPromises.mkdir(userDataRoot, { recursive: true });
  const { main, fileManager } = await loadMainWithElectronStub({
    tempRoot,
    documentsParent,
    userDataRoot,
  });
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });
  return {
    fileManager,
    main,
    tempRoot,
    documentsRoot,
  };
}

async function writeJson(filePath, value) {
  await fsPromises.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await fsPromises.readFile(filePath, 'utf8'));
}

function makeProRoundtripManifest() {
  return {
    schemaVersion: 1,
    projectId: 'project-s38-pro-roundtrip',
    projectName: 'Pro Roundtrip',
    createdAtUtc: '2026-07-19T00:00:00.000Z',
    proUnknown: {
      comments: [
        { id: 'comment-alpha', sceneId: 'roman/Imported/01 Alpha.txt', body: 'depends on alpha' },
        { id: 'comment-beta', sceneId: 'roman/Imported/02 Beta.txt', body: 'stable beta' },
      ],
      links: [
        { id: 'link-alpha-beta', sceneIds: ['roman/Imported/01 Alpha.txt', 'roman/Imported/02 Beta.txt'] },
        { id: 'link-gamma', sceneIds: ['roman/Imported/03 Gamma.txt'] },
      ],
      provenance: [
        { id: 'prov-alpha', dependsOnSceneIds: ['roman/Imported/01 Alpha.txt'], source: 'pro' },
        { id: 'prov-beta', dependsOnSceneIds: ['roman/Imported/02 Beta.txt'], source: 'pro' },
      ],
      continuity: {
        checksum: 'keep-me',
        nested: { marker: true },
      },
    },
    futureProData: {
      board: { cards: [{ id: 'card-1', title: 'Future card' }] },
      unknownArray: [{ x: 1 }],
    },
  };
}

async function writeProRoundtripProject(projectRoot, manifest) {
  await fsPromises.mkdir(path.join(projectRoot, 'roman', 'Imported'), { recursive: true });
  await fsPromises.mkdir(path.join(projectRoot, 'backups'), { recursive: true });
  await fsPromises.mkdir(path.join(projectRoot, 'recovery'), { recursive: true });
  await writeJson(path.join(projectRoot, PROJECT_MANIFEST_FILENAME), manifest);
  await fsPromises.writeFile(path.join(projectRoot, 'roman', 'Imported', '01 Alpha.txt'), 'alpha original', 'utf8');
  await fsPromises.writeFile(path.join(projectRoot, 'roman', 'Imported', '02 Beta.txt'), 'beta stable', 'utf8');
  await fsPromises.writeFile(path.join(projectRoot, 'roman', 'Imported', '03 Gamma.txt'), 'gamma stable', 'utf8');
  await writeJson(path.join(projectRoot, 'notes.json'), {
    notes: [
      {
        id: 'note-alpha',
        scope: 'scene',
        sceneId: 'roman/Imported/01 Alpha.txt',
        body: 'note',
        proUnknown: { kept: true },
      },
      {
        id: 'note-deleted',
        scope: 'inbox',
        body: 'old',
        deleted: true,
        deletedAtUtc: '2026-07-18T00:00:00.000Z',
        proUnknown: { deletedKept: true },
      },
    ],
  });
  await fsPromises.writeFile(path.join(projectRoot, 'backups', 'scene.bak'), 'backup text', 'utf8');
  await fsPromises.writeFile(path.join(projectRoot, 'recovery', 'snapshot.txt'), 'recovery text', 'utf8');
}

test('S38 Pro roundtrip: free edit invalidates only directly dependent Pro records', async () => {
  const {
    PRO_ROUNDTRIP_INVALIDATION_SCHEMA_VERSION,
    applyFreeEditProDataInvalidation,
  } = await importRepoModule('src/core/proRoundtripPreservation.mjs');
  const manifest = makeProRoundtripManifest();
  const result = applyFreeEditProDataInvalidation(manifest, {
    changedSceneIds: ['roman/Imported/01 Alpha.txt'],
    deletedSceneIds: ['roman/Imported/99 Deleted.txt'],
    nowIso: '2026-07-19T09:20:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.receipt.recomputedProAnalytics, false);
  assert.equal(result.receipt.unknownFieldsPreserved, true);
  assert.equal(manifest.proDataInvalidation, undefined);
  assert.equal(manifest.proUnknown.comments[0].stale, undefined);

  const next = result.manifest;
  assert.equal(next.proDataInvalidation.schemaVersion, PRO_ROUNDTRIP_INVALIDATION_SCHEMA_VERSION);
  assert.deepEqual(next.proDataInvalidation.changedSceneIds, ['roman/Imported/01 Alpha.txt']);
  assert.deepEqual(next.proDataInvalidation.deletedSceneIds, ['roman/Imported/99 Deleted.txt']);
  assert.deepEqual(next.proDataInvalidation.sceneTombstones, [
    {
      sceneId: 'roman/Imported/99 Deleted.txt',
      recoverable: true,
      reason: 'FREE_SCENE_DELETED',
      createdAtUtc: '2026-07-19T09:20:00.000Z',
    },
  ]);

  assert.equal(next.proUnknown.comments[0].stale, true);
  assert.equal(next.proUnknown.comments[0].requiresProRefresh, true);
  assert.equal(next.proUnknown.comments[0].staleReason, 'FREE_SCENE_TEXT_CHANGED');
  assert.deepEqual(next.proUnknown.comments[0].staleSceneIds, ['roman/Imported/01 Alpha.txt']);
  assert.equal(next.proUnknown.comments[1].stale, undefined);

  assert.equal(next.proUnknown.links[0].stale, true);
  assert.deepEqual(next.proUnknown.links[0].staleSceneIds, ['roman/Imported/01 Alpha.txt']);
  assert.equal(next.proUnknown.links[1].stale, undefined);
  assert.equal(next.proUnknown.provenance[0].stale, true);
  assert.equal(next.proUnknown.provenance[1].stale, undefined);
  assert.deepEqual(next.futureProData, manifest.futureProData);
});

test('S38 Pro roundtrip: main-owned Free scene save invalidates manifest Pro data', async (t) => {
  const harness = await createHarness(t, 's38-main-invalidation-');
  const manifest = {
    ...makeProRoundtripManifest(),
    projectName: 'Роман',
  };
  const projectRoot = path.join(harness.documentsRoot, 'Роман');
  const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
  const alphaPath = path.join(projectRoot, 'roman', 'Imported', '01 Alpha.txt');

  await writeProRoundtripProject(projectRoot, manifest);
  await fsPromises.writeFile(alphaPath, 'alpha edited through main helper', 'utf8');

  const invalidated = await harness.main.persistFreeEditProDataInvalidationForFile(alphaPath, {
    operationLabel: 'test pro data invalidation',
  });
  assert.equal(invalidated.persisted, true);

  const next = await readJson(manifestPath);
  assert.deepEqual(next.proDataInvalidation.changedSceneIds, ['roman/Imported/01 Alpha.txt']);
  assert.deepEqual(next.proDataInvalidation.deletedSceneIds, []);
  assert.equal(next.proUnknown.comments[0].stale, true);
  assert.equal(next.proUnknown.comments[1].stale, undefined);
  assert.deepEqual(next.futureProData, manifest.futureProData);
});

test('S38 Pro roundtrip: Free save and full archive reopen preserve unknown Pro data', async (t) => {
  const freeHarness = await createHarness(t, 's38-free-');
  const proHarness = await createHarness(t, 's38-pro-');
  const {
    applyFreeEditProDataInvalidation,
  } = await importRepoModule('src/core/proRoundtripPreservation.mjs');
  const capabilityProvider = await importRepoModule('src/renderer/commands/localCapabilityProvider.mjs');
  const manifest = makeProRoundtripManifest();
  const projectRoot = path.join(freeHarness.documentsRoot, manifest.projectName);
  const manifestPath = path.join(projectRoot, PROJECT_MANIFEST_FILENAME);
  const alphaPath = path.join(projectRoot, 'roman', 'Imported', '01 Alpha.txt');
  const betaPath = path.join(projectRoot, 'roman', 'Imported', '02 Beta.txt');
  const archivePath = path.join(freeHarness.tempRoot, 's38-roundtrip.yalken.zip');

  await writeProRoundtripProject(projectRoot, manifest);

  const freeState = capabilityProvider.normalizeLocalCapabilityState({ entitlementTier: 'free' });
  assert.equal(freeState.localOnly, true);
  assert.equal(freeState.freeCanReadProData, true);
  assert.equal(freeState.preservesUnknownProjectData, true);
  assert.equal(
    capabilityProvider.resolveCommandEntitlement('cmd.project.exportFullArchiveV1', { entitlementTier: 'free' }).available,
    true,
  );
  assert.equal(
    capabilityProvider.resolveCommandEntitlement('cmd.project.review.switchMode', { entitlementTier: 'free' }).available,
    false,
  );

  const normalizedBefore = await freeHarness.main.normalizeProjectManifest(manifest, manifest.projectName);
  assert.deepEqual(normalizedBefore.proUnknown, manifest.proUnknown);
  assert.deepEqual(normalizedBefore.futureProData, manifest.futureProData);

  const writeResult = await freeHarness.fileManager.writeFileAtomic(alphaPath, 'alpha edited in free');
  assert.equal(writeResult.success, true);
  const invalidation = applyFreeEditProDataInvalidation(normalizedBefore, {
    changedSceneIds: ['roman/Imported/01 Alpha.txt'],
    deletedSceneIds: ['roman/Imported/99 Deleted.txt'],
    nowIso: '2026-07-19T09:20:00.000Z',
  });
  await freeHarness.main.persistProjectManifestAtPath(
    manifestPath,
    invalidation.manifest,
    's38 free save manifest',
    { expectedText: await fsPromises.readFile(manifestPath, 'utf8') },
  );

  const archive = await buildProjectArchiveBuffer(projectRoot, {
    createdAtUtc: '2026-07-19T09:21:00.000Z',
  });
  const verified = verifyProjectArchiveBuffer(archive.buffer);
  assert.equal(verified.ok, true);
  await fsPromises.writeFile(archivePath, archive.buffer);

  const imported = await proHarness.main.handleImportProjectArchive({
    confirmed: true,
    requestId: 's38-pro-reopen',
    archivePath,
    mode: 'restore',
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.imported, true);
  assert.equal(imported.mode, 'restore');
  assert.equal(imported.projectId, manifest.projectId);
  assertPathless(imported, proHarness.tempRoot);

  const restoredRoot = path.join(proHarness.documentsRoot, manifest.projectName);
  const restoredManifest = await readJson(path.join(restoredRoot, PROJECT_MANIFEST_FILENAME));
  assert.equal(restoredManifest.projectId, manifest.projectId);
  assert.deepEqual(restoredManifest.futureProData, manifest.futureProData);
  assert.deepEqual(restoredManifest.proUnknown.continuity, manifest.proUnknown.continuity);
  assert.equal(restoredManifest.proUnknown.comments[0].stale, true);
  assert.equal(restoredManifest.proUnknown.comments[0].requiresProRefresh, true);
  assert.equal(restoredManifest.proUnknown.comments[1].stale, undefined);
  assert.equal(restoredManifest.proUnknown.links[0].stale, true);
  assert.equal(restoredManifest.proUnknown.links[1].stale, undefined);
  assert.equal(restoredManifest.proUnknown.provenance[0].stale, true);
  assert.equal(restoredManifest.proUnknown.provenance[1].stale, undefined);
  assert.deepEqual(restoredManifest.proDataInvalidation.changedSceneIds, ['roman/Imported/01 Alpha.txt']);
  assert.deepEqual(restoredManifest.proDataInvalidation.deletedSceneIds, ['roman/Imported/99 Deleted.txt']);
  assert.equal(restoredManifest.proDataInvalidation.sceneTombstones[0].recoverable, true);

  assert.equal(await fsPromises.readFile(path.join(restoredRoot, 'roman', 'Imported', '01 Alpha.txt'), 'utf8'), 'alpha edited in free');
  assert.equal(await fsPromises.readFile(path.join(restoredRoot, 'roman', 'Imported', '02 Beta.txt'), 'utf8'), 'beta stable');
  assert.equal(await fsPromises.readFile(path.join(restoredRoot, 'backups', 'scene.bak'), 'utf8'), 'backup text');
  assert.equal(await fsPromises.readFile(path.join(restoredRoot, 'recovery', 'snapshot.txt'), 'utf8'), 'recovery text');

  const notes = await readJson(path.join(restoredRoot, 'notes.json'));
  assert.deepEqual(notes.notes[0].proUnknown, { kept: true });
  assert.equal(notes.notes[1].deleted, true);
  assert.deepEqual(notes.notes[1].proUnknown, { deletedKept: true });
  assert.equal(await fsPromises.readFile(betaPath, 'utf8'), 'beta stable');

  const normalizedAfter = await proHarness.main.normalizeProjectManifest(restoredManifest, manifest.projectName);
  assert.deepEqual(normalizedAfter.futureProData, manifest.futureProData);
  assert.equal(
    capabilityProvider.resolveCommandEntitlement('cmd.project.review.switchMode', { entitlementTier: 'pro' }).available,
    false,
  );
  assert.equal(
    capabilityProvider.resolveCommandEntitlement('cmd.project.review.switchMode', { entitlementTier: 'pro' }).reason,
    'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE',
  );
});
