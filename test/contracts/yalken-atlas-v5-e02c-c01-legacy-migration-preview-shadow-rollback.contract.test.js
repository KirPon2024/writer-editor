const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

const LEGACY_TXT = [
  '# Story Map',
  '- Opening',
  '  - Inciting incident',
  '  - Refusal',
  '- Midpoint',
  'Opening -> Midpoint',
  'Bad -> ',
].join('\n');

test('E02C C01: legacy TXT inventory is pathless, deterministic, and admission-scoped', async () => {
  const migration = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'legacyMindMapTxtMigration.mjs'));
  const first = migration.inventoryLegacyMindMapTxtSources([
    { sourceId: 'source-a', name: 'legacy-map.txt', text: LEGACY_TXT },
    { sourceId: 'source-b', name: 'image.png', text: LEGACY_TXT },
    { sourceId: 'source-c', name: 'empty.txt', text: '   ' },
  ]);
  const second = migration.inventoryLegacyMindMapTxtSources([
    { sourceId: 'source-a', name: 'legacy-map.txt', text: LEGACY_TXT },
    { sourceId: 'source-b', name: 'image.png', text: LEGACY_TXT },
    { sourceId: 'source-c', name: 'empty.txt', text: '   ' },
  ]);

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 'manualMap.legacyTxtInventory.v1');
  assert.deepEqual(first.counts, { total: 3, admissible: 1, rejected: 2 });
  assert.equal(first.entries[0].admissible, true);
  assert.equal(Object.hasOwn(first.entries[0], 'content'), false);
  assert.equal(first.entries[1].reasons.includes('EXTENSION_UNSUPPORTED'), true);
  assert.equal(first.entries[2].reasons.includes('CONTENT_EMPTY'), true);
  assert.match(first.meta.inventoryHash, /^[0-9a-f]{64}$/u);
});

test('E02C C01: legacy TXT preview builds manual map graph and command plan without mutation', async () => {
  const migration = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'legacyMindMapTxtMigration.mjs'));
  const preview = migration.buildLegacyMindMapTxtMigrationPreview({
    projectId: 'legacy-project',
    source: { sourceId: 'legacy-source', name: 'legacy-map.txt', text: LEGACY_TXT },
  });
  const repeat = migration.buildLegacyMindMapTxtMigrationPreview({
    projectId: 'legacy-project',
    source: { sourceId: 'legacy-source', name: 'legacy-map.txt', text: LEGACY_TXT },
  });

  assert.equal(preview.ok, true);
  assert.deepEqual(preview, repeat);
  assert.equal(preview.value.schemaVersion, 'manualMap.legacyTxtMigrationPreview.v1');
  assert.equal(preview.value.projectTruthMutation, false);
  assert.equal(preview.value.applyRequiresCommandKernel, true);
  assert.equal(preview.value.title, 'Story Map');
  assert.equal(preview.value.graph.schemaVersion, 'derived.manualMap.graph.v1');
  assert.equal(preview.value.graph.nodes.length, 4);
  assert.equal(preview.value.graph.edges.length, 3);
  assert.equal(preview.value.commandPlan[0].type, 'manualMap.create');
  assert.equal(preview.value.commandPlan.filter((command) => command.type === 'manualMap.node.add').length, 4);
  assert.equal(preview.value.commandPlan.filter((command) => command.type === 'manualMap.edge.add').length, 3);
  assert.equal(preview.value.sourceLineMap.length, 4);
  assert.equal(preview.value.lossReport.lossCount, 1);
  assert.equal(preview.value.lossReport.losses[0].reasonCode, 'LEGACY_MINDMAP_ARROW_MALFORMED');
  assert.match(preview.value.meta.previewHash, /^[0-9a-f]{64}$/u);
});

test('E02C C01: shadow migration blocks target collisions and rollback discards only shadow state', async () => {
  const migration = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'legacyMindMapTxtMigration.mjs'));
  const preview = migration.buildLegacyMindMapTxtMigrationPreview({
    projectId: 'legacy-project',
    mapId: 'legacy-main',
    source: { sourceId: 'legacy-source', name: 'legacy-map.txt', text: LEGACY_TXT },
  }).value;
  const collision = migration.createLegacyMindMapShadowMigration({
    preview,
    existingMapIds: ['legacy-main'],
  });
  const shadow = migration.createLegacyMindMapShadowMigration({
    preview,
    existingMapIds: ['other-map'],
  });
  const rollback = migration.rollbackLegacyMindMapShadowMigration(shadow.value);

  assert.equal(collision.ok, false);
  assert.equal(collision.error.code, 'E_LEGACY_MINDMAP_TARGET_EXISTS');
  assert.equal(shadow.ok, true);
  assert.equal(shadow.value.schemaVersion, 'manualMap.legacyTxtShadowMigration.v1');
  assert.equal(shadow.value.projectTruthMutation, false);
  assert.equal(shadow.value.applyRequiresCommandKernel, true);
  assert.equal(shadow.value.rollbackPlan.mode, 'discard-shadow-only');
  assert.deepEqual(shadow.value.commandPlan, preview.commandPlan);
  assert.equal(rollback.ok, true);
  assert.equal(rollback.value.rolledBack, true);
  assert.equal(rollback.value.projectTruthMutation, false);
  assert.equal(rollback.value.discardedCommandCount, preview.commandPlan.length);
  assert.match(rollback.value.meta.rollbackHash, /^[0-9a-f]{64}$/u);
});

test('E02C C01: legacy migration contract is exported through import barrel', async () => {
  const barrel = await loadModule(path.join('src', 'import', 'mindmap', 'v1', 'index.mjs'));

  assert.equal(barrel.LEGACY_MINDMAP_TXT_INVENTORY_SCHEMA_VERSION, 'manualMap.legacyTxtInventory.v1');
  assert.equal(barrel.LEGACY_MINDMAP_TXT_PREVIEW_SCHEMA_VERSION, 'manualMap.legacyTxtMigrationPreview.v1');
  assert.equal(barrel.LEGACY_MINDMAP_TXT_SHADOW_SCHEMA_VERSION, 'manualMap.legacyTxtShadowMigration.v1');
  assert.equal(barrel.LEGACY_MINDMAP_TXT_ROLLBACK_SCHEMA_VERSION, 'manualMap.legacyTxtRollback.v1');
  assert.equal(typeof barrel.inventoryLegacyMindMapTxtSources, 'function');
  assert.equal(typeof barrel.rollbackLegacyMindMapShadowMigration, 'function');
});

test('E02C C01: legacy migration preview adds no storage, network, command dispatch, or UI bypass', () => {
  const sources = [
    path.join(process.cwd(), 'src', 'import', 'mindmap', 'v1', 'legacyMindMapTxtMigration.mjs'),
    path.join(process.cwd(), 'src', 'import', 'mindmap', 'v1', 'index.mjs'),
  ];
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\bmkdir(?:Sync)?\s*\(/u,
    /\brename(?:Sync)?\s*\(/u,
    /\bunlink(?:Sync)?\s*\(/u,
    /\brm(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchUiCommand/u,
    /addEventListener\s*\(\s*['"](?:beforeinput|input|keydown|pointermove|wheel)['"]/u,
  ];

  for (const sourcePath of sources) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(sourcePath)} matched ${pattern.source}`);
    }
  }
});
