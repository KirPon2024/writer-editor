const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
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

function collectScenes(root, scenes = []) {
  if (!root) return scenes;
  if (root.kind === 'scene' && root.nodeId) scenes.push(root);
  for (const child of root.children || []) collectScenes(child, scenes);
  return scenes;
}

async function createHarness(t, files) {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'replace-mass-safe-'));
  t.after(async () => fsPromises.rm(tempRoot, { recursive: true, force: true }));
  const documentsRoot = path.join(tempRoot, 'Documents', 'craftsman');
  const projectRoot = path.join(documentsRoot, 'Роман');
  const importedRoot = path.join(projectRoot, 'roman', 'Imported');
  await fsPromises.mkdir(importedRoot, { recursive: true });
  const paths = {};
  for (const [fileName, text] of Object.entries(files)) {
    const filePath = path.join(importedRoot, fileName);
    await fsPromises.writeFile(filePath, text, 'utf8');
    paths[fileName] = filePath;
  }

  const { main, fileManager } = await loadMainWithElectronStub();
  const originalGetDocumentsPath = fileManager.getDocumentsPath;
  fileManager.getDocumentsPath = () => documentsRoot;
  t.after(() => { fileManager.getDocumentsPath = originalGetDocumentsPath; });

  await main.buildProjectTreeRootsWithIdentities('Роман');
  const tree = await main.handleWorkspaceProjectTreeQuery({ tab: 'roman' });
  assert.equal(tree.ok, true);
  const scenes = collectScenes(tree.root).sort((a, b) => a.label.localeCompare(b.label));
  assert.equal(scenes.length, Object.keys(files).length);
  return { main, tree, scenes, paths };
}

function sha256(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex');
}

function buildSearchDescriptor(scene, text, matchText) {
  const from = text.indexOf(matchText);
  assert.notEqual(from, -1);
  return {
    searchResultId: `search-result-${scene.nodeId}-${from}`,
    source: {
      type: 'document',
      sourceId: scene.nodeId,
      nodeId: scene.nodeId,
      kind: 'scene',
      title: scene.label,
      scope: 'project',
      field: 'body',
      contentHash: sha256(text),
    },
    range: {
      from,
      to: from + matchText.length,
    },
    expectedText: matchText,
  };
}

function buildPayload(tree, results, replacementText, previewPlan = null) {
  return {
    requestId: 'replace-mass-test',
    projectId: tree.projectId,
    replacementText,
    results,
    ...(previewPlan ? { previewPlan, confirmed: true } : {}),
  };
}

test('S22 replace mass reversible: preview is pathless and apply writes exactly previewed scenes', async (t) => {
  const harness = await createHarness(t, {
    '01_alpha.txt': 'alpha beta gamma',
    '02_delta.txt': 'delta beta epsilon',
  });
  const results = [
    buildSearchDescriptor(harness.scenes[0], 'alpha beta gamma', 'beta'),
    buildSearchDescriptor(harness.scenes[1], 'delta beta epsilon', 'beta'),
  ];

  const preview = await harness.main.handleReplaceMassPreviewCommand(buildPayload(harness.tree, results, 'BETA'));
  assert.equal(preview.ok, true);
  assert.equal(preview.preview, true);
  assert.equal(preview.plan.totals.scenes, 2);
  assert.equal(preview.plan.totals.operations, 2);
  assert.equal(JSON.stringify(preview.plan).includes('01_alpha.txt'), false);
  assert.equal(JSON.stringify(preview.plan).includes('/'), false);

  const applied = await harness.main.handleReplaceMassApplyCommand(
    buildPayload(harness.tree, results, 'BETA', preview.plan),
    { now: () => 1784419200000 },
  );
  assert.equal(applied.ok, true);
  assert.equal(applied.applied, true);
  assert.equal(applied.receipt.totals.scenes, 2);
  assert.equal(applied.receipt.scenes.every((scene) => fs.existsSync(scene.recovery.snapshotPath)), true);
  assert.equal(await fsPromises.readFile(harness.paths['01_alpha.txt'], 'utf8'), 'alpha BETA gamma');
  assert.equal(await fsPromises.readFile(harness.paths['02_delta.txt'], 'utf8'), 'delta BETA epsilon');
});

test('S22 replace mass reversible: stale mixed batch writes zero project bytes', async (t) => {
  const harness = await createHarness(t, {
    '01_alpha.txt': 'alpha beta gamma',
    '02_delta.txt': 'delta beta epsilon',
  });
  const results = [
    buildSearchDescriptor(harness.scenes[0], 'alpha beta gamma', 'beta'),
    buildSearchDescriptor(harness.scenes[1], 'delta beta epsilon', 'beta'),
  ];
  const preview = await harness.main.handleReplaceMassPreviewCommand(buildPayload(harness.tree, results, 'BETA'));
  assert.equal(preview.ok, true);
  await fsPromises.writeFile(harness.paths['02_delta.txt'], 'delta changed epsilon', 'utf8');

  const blocked = await harness.main.handleReplaceMassApplyCommand(
    buildPayload(harness.tree, results, 'BETA', preview.plan),
  );

  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'REPLACE_MASS_STALE_SOURCE_HASH');
  assert.equal(await fsPromises.readFile(harness.paths['01_alpha.txt'], 'utf8'), 'alpha beta gamma');
  assert.equal(await fsPromises.readFile(harness.paths['02_delta.txt'], 'utf8'), 'delta changed epsilon');
});

test('S22 replace mass reversible: queued pre-write revalidation blocks external race edits', async (t) => {
  const harness = await createHarness(t, {
    '01_alpha.txt': 'alpha beta gamma',
    '02_delta.txt': 'delta beta epsilon',
  });
  const results = [
    buildSearchDescriptor(harness.scenes[0], 'alpha beta gamma', 'beta'),
    buildSearchDescriptor(harness.scenes[1], 'delta beta epsilon', 'beta'),
  ];
  const preview = await harness.main.handleReplaceMassPreviewCommand(buildPayload(harness.tree, results, 'BETA'));
  assert.equal(preview.ok, true);

  const blocked = await harness.main.handleReplaceMassApplyCommand(
    buildPayload(harness.tree, results, 'BETA', preview.plan),
    {
      afterApplyPlanReady: async () => {
        await fsPromises.writeFile(harness.paths['01_alpha.txt'], 'alpha external gamma', 'utf8');
      },
    },
  );

  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'REPLACE_MASS_STALE_SOURCE_HASH');
  assert.equal(await fsPromises.readFile(harness.paths['01_alpha.txt'], 'utf8'), 'alpha external gamma');
  assert.equal(await fsPromises.readFile(harness.paths['02_delta.txt'], 'utf8'), 'delta beta epsilon');
});

test('S22 replace mass reversible: kill point after first scene rolls back written scene', async (t) => {
  const harness = await createHarness(t, {
    '01_alpha.txt': 'alpha beta gamma',
    '02_delta.txt': 'delta beta epsilon',
  });
  const results = [
    buildSearchDescriptor(harness.scenes[0], 'alpha beta gamma', 'beta'),
    buildSearchDescriptor(harness.scenes[1], 'delta beta epsilon', 'beta'),
  ];
  const preview = await harness.main.handleReplaceMassPreviewCommand(buildPayload(harness.tree, results, 'BETA'));
  assert.equal(preview.ok, true);

  const failed = await harness.main.handleReplaceMassApplyCommand(
    buildPayload(harness.tree, results, 'BETA', preview.plan),
    {
      now: () => 1784419200000,
      afterSceneWrite: async ({ appliedCount }) => {
        if (appliedCount === 1) throw new Error('KILL_POINT_AFTER_FIRST_WRITE');
      },
    },
  );

  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'REPLACE_MASS_APPLY_ROLLED_BACK');
  assert.equal(failed.details.appliedBeforeFailure, 1);
  assert.equal(failed.details.rollback.every((entry) => entry.ok === true), true);
  assert.equal(await fsPromises.readFile(harness.paths['01_alpha.txt'], 'utf8'), 'alpha beta gamma');
  assert.equal(await fsPromises.readFile(harness.paths['02_delta.txt'], 'utf8'), 'delta beta epsilon');
});

test('S22 replace mass reversible: receipt rollback restores every affected scene', async (t) => {
  const harness = await createHarness(t, {
    '01_alpha.txt': 'alpha beta gamma',
    '02_delta.txt': 'delta beta epsilon',
  });
  const results = [
    buildSearchDescriptor(harness.scenes[0], 'alpha beta gamma', 'beta'),
    buildSearchDescriptor(harness.scenes[1], 'delta beta epsilon', 'beta'),
  ];
  const preview = await harness.main.handleReplaceMassPreviewCommand(buildPayload(harness.tree, results, 'BETA'));
  const applied = await harness.main.handleReplaceMassApplyCommand(
    buildPayload(harness.tree, results, 'BETA', preview.plan),
    { now: () => 1784419200000 },
  );
  assert.equal(applied.ok, true);

  const rolledBack = await harness.main.handleReplaceMassRollbackCommand({ receiptId: applied.receipt.receiptId });

  assert.equal(rolledBack.ok, true);
  assert.equal(rolledBack.rolledBack, true);
  assert.equal(await fsPromises.readFile(harness.paths['01_alpha.txt'], 'utf8'), 'alpha beta gamma');
  assert.equal(await fsPromises.readFile(harness.paths['02_delta.txt'], 'utf8'), 'delta beta epsilon');
});

test('S22 replace mass reversible: bridge and UI stay pathless and outside Review Session', () => {
  const main = read('src/main.js');
  const editor = read('src/renderer/editor.js');
  const commands = read('src/renderer/commands/projectCommands.mjs');
  const capability = read('src/renderer/commands/capabilityPolicy.mjs');

  assert.ok(main.includes("const REPLACE_MASS_PREVIEW_COMMAND_ID = 'cmd.project.edit.replaceMassPreview';"));
  assert.ok(main.includes("const REPLACE_MASS_APPLY_COMMAND_ID = 'cmd.project.edit.replaceMassApply';"));
  assert.ok(main.includes("const REPLACE_MASS_ROLLBACK_COMMAND_ID = 'cmd.project.edit.replaceMassRollback';"));
  assert.ok(main.includes('[REPLACE_MASS_PREVIEW_COMMAND_ID]: async (payload = {}) => {'));
  assert.ok(main.includes('[REPLACE_MASS_APPLY_COMMAND_ID]: async (payload = {}) => {'));
  assert.ok(editor.includes('data-project-search-replace-all'));
  assert.ok(editor.includes('invokePreloadUiCommandBridge(EXTRA_COMMAND_IDS.EDIT_REPLACE_MASS_PREVIEW'));
  assert.ok(editor.includes('invokePreloadUiCommandBridge(EXTRA_COMMAND_IDS.EDIT_REPLACE_MASS_APPLY'));
  assert.ok(commands.includes("EDIT_REPLACE_MASS_PREVIEW: 'cmd.project.edit.replaceMassPreview'"));
  assert.ok(capability.includes("'cmd.project.edit.replaceMassApply': 'cap.project.edit.replaceMassApply'"));

  const start = main.indexOf('async function handleReplaceMassPreviewCommand(payload = {})');
  const end = main.indexOf('async function handleNotesCreateCommand', start);
  assert.ok(start > -1 && end > start);
  const handler = main.slice(start, end);
  for (const forbidden of ['activeReviewSessionStore', 'activeReviewSessionLifecycle', 'reviewSurface', 'reviewSession']) {
    assert.equal(handler.includes(forbidden), false, `replace mass must not create or depend on Review Session: ${forbidden}`);
  }
  for (const forbidden of ['payload.filePath', 'payload.projectRoot', 'payload.scenePath']) {
    assert.equal(handler.includes(forbidden), false, `renderer path authority must be rejected before use: ${forbidden}`);
  }
  for (const forbidden of ['RegExp(', 'regex', 'semantic']) {
    assert.equal(handler.includes(forbidden), false, `replace mass v1 must stay exact-only: ${forbidden}`);
  }
});
