const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildLegacyMigrationFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const migration = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'index.mjs'));
  const projectId = 'legacy-apply-project';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Legacy apply project', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: 'scene-a', text: 'Manuscript text stays outside mind map migration.' },
    },
  ]);
  assert.equal(built.ok, true);

  const preview = migration.buildLegacyMindMapTxtMigrationPreview({
    projectId,
    mapId: 'legacy-apply-map',
    source: {
      name: 'legacy-outline.txt',
      content: '# Legacy Map\n- Root idea\n  - Branch idea\nBranch idea -> Ending idea\n',
    },
  });
  assert.equal(preview.ok, true);
  const shadow = migration.createLegacyMindMapShadowMigration({
    preview: preview.value,
    existingMapIds: [],
  });
  assert.equal(shadow.ok, true);
  return { runtime, migration, projectId, initialState: built.state, preview: preview.value, shadow: shadow.value };
}

async function buildCommandKernelExecutor(runtime, platformId = 'node') {
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const registry = registryModule.createCommandRegistry();
  for (const commandId of [
    runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
    runtime.CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
    runtime.CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD,
  ]) {
    registry.registerCommand(commandId, (input) => {
      return runtime.reduceCoreState(input.state, {
        type: commandId,
        payload: input.payload,
      });
    });
  }
  const runner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: platformId, entitlementTier: 'free' },
  });
  return async function commandExecutor(command, context) {
    return runner(command.type, {
      state: context.state,
      payload: command.payload,
    });
  };
}

test('E02C C02: legacy shadow command plan applies only through Command Kernel and validates after reopen', async () => {
  const { runtime, migration, projectId, initialState, preview, shadow } = await buildLegacyMigrationFixture();
  const commandExecutor = await buildCommandKernelExecutor(runtime, 'node');

  const applied = await migration.applyLegacyMindMapShadowMigrationViaCommandKernel({
    shadow,
    initialState,
    commandExecutor,
  });

  assert.equal(applied.ok, true);
  assert.equal(applied.value.schemaVersion, migration.LEGACY_MINDMAP_COMMAND_APPLY_SCHEMA_VERSION);
  assert.equal(applied.value.commandAuthority, 'CommandKernel');
  assert.equal(applied.value.directCoreMutation, false);
  assert.equal(applied.value.storageMutation, false);
  assert.equal(applied.value.projectTruthMutation, true);
  assert.equal(applied.value.appliedCommandCount, shadow.commandPlan.length);
  assert.deepEqual(applied.value.commandReceipts.map((entry) => entry.commandType), [
    'manualMap.create',
    'manualMap.node.add',
    'manualMap.node.add',
    'manualMap.node.add',
    'manualMap.edge.add',
    'manualMap.edge.add',
  ]);
  assert.equal(initialState.data.projects[projectId].manualMaps.maps['legacy-apply-map'], undefined);
  assert.equal(
    applied.value.state.data.projects[projectId].scenes['scene-a'].text,
    'Manuscript text stays outside mind map migration.',
  );

  const reopenedCoreState = JSON.parse(JSON.stringify(applied.value.state));
  const reopen = migration.validateLegacyMindMapReopenGraph({
    preview,
    reopenedCoreState,
  });

  assert.equal(reopen.ok, true);
  assert.equal(reopen.value.schemaVersion, migration.LEGACY_MINDMAP_REOPEN_VALIDATION_SCHEMA_VERSION);
  assert.equal(reopen.value.reopenedGraphMatchesPreview, true);
  assert.equal(reopen.value.nodeCount, preview.graph.nodes.length);
  assert.equal(reopen.value.edgeCount, preview.graph.edges.length);
  assert.equal(reopen.value.projectTruthMutation, false);
});

test('E02C C02: capability denial stops apply without fallback mutation', async () => {
  const { runtime, migration, initialState, shadow } = await buildLegacyMigrationFixture();
  const commandExecutor = await buildCommandKernelExecutor(runtime, 'web');

  const denied = await migration.applyLegacyMindMapShadowMigrationViaCommandKernel({
    shadow,
    initialState,
    commandExecutor,
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_LEGACY_MINDMAP_COMMAND_APPLY_FAILED');
  assert.equal(denied.error.details.commandIndex, 0);
  assert.equal(denied.error.details.commandType, 'manualMap.create');
  assert.equal(denied.error.details.commandError.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(initialState.data.lastCommandId, 2);
});

test('E02C C02: non-manual-map command types are rejected before executor call', async () => {
  const { migration, initialState, shadow } = await buildLegacyMigrationFixture();
  const tampered = JSON.parse(JSON.stringify(shadow));
  tampered.commandPlan.splice(1, 0, {
    type: 'project.applyTextEdit',
    payload: { projectId: tampered.projectId, sceneId: 'scene-a', text: 'bypass' },
  });
  let executorCallCount = 0;

  const result = await migration.applyLegacyMindMapShadowMigrationViaCommandKernel({
    shadow: tampered,
    initialState,
    commandExecutor: async () => {
      executorCallCount += 1;
      return { ok: true, state: initialState };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_LEGACY_MINDMAP_COMMAND_TYPE_NOT_ALLOWED');
  assert.equal(result.error.details.commandIndex, 1);
  assert.equal(result.error.details.commandType, 'project.applyTextEdit');
  assert.equal(executorCallCount, 0);
});

test('E02C C02: reopen validation fails closed when persisted graph diverges from preview', async () => {
  const { runtime, migration, initialState, preview, shadow } = await buildLegacyMigrationFixture();
  const commandExecutor = await buildCommandKernelExecutor(runtime, 'node');
  const applied = await migration.applyLegacyMindMapShadowMigrationViaCommandKernel({
    shadow,
    initialState,
    commandExecutor,
  });
  assert.equal(applied.ok, true);
  const corrupted = JSON.parse(JSON.stringify(applied.value.state));
  delete corrupted.data.projects[preview.projectId].manualMaps.maps[preview.mapId].nodes[preview.graph.nodes[0].id];

  const validation = migration.validateLegacyMindMapReopenGraph({
    preview,
    coreState: corrupted,
  });

  assert.equal(validation.ok, false);
  assert.equal(validation.error.code, 'E_LEGACY_MINDMAP_REOPEN_GRAPH_MISMATCH');
  assert.match(validation.error.details.expectedHash, /^[0-9a-f]{64}$/u);
  assert.match(validation.error.details.actualHash, /^[0-9a-f]{64}$/u);
});

test('E02C C02: legacy command apply contract is exported and adds no storage, renderer, or reducer bypass', async () => {
  const migration = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'index.mjs'));
  assert.equal(typeof migration.applyLegacyMindMapShadowMigrationViaCommandKernel, 'function');
  assert.equal(typeof migration.validateLegacyMindMapReopenGraph, 'function');

  const sourcePath = path.join(process.cwd(), 'src', 'import', 'mindmap', 'v1', 'legacyMindMapCommandApply.mjs');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchUiCommand/u,
    /reduceCoreState/u,
    /applyCoreSequence/u,
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(source, pattern, `legacyMindMapCommandApply.mjs matched ${pattern.source}`);
  }
});
