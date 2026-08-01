const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..');

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('S37 local capability provider: defaults to local Free without account or network authority', async () => {
  const provider = await importModule('src/renderer/commands/localCapabilityProvider.mjs');
  const state = provider.normalizeLocalCapabilityState({});

  assert.equal(state.schemaVersion, 'local-capability-provider.v1');
  assert.equal(state.tier, 'free');
  assert.equal(state.label, 'Free');
  assert.equal(state.localOnly, true);
  assert.equal(state.requiresAccount, false);
  assert.equal(state.requiresNetwork, false);
  assert.equal(state.hasRemoteLicenseAuthority, false);
  assert.equal(state.projectFormatShared, true);
  assert.equal(state.preservesUnknownProjectData, true);
  assert.equal(state.freeCanReadProData, true);
  assert.equal(state.fullArchiveAlwaysAvailable, true);
});

test('S37 local capability provider: toolbar profile does not become a product tier', async () => {
  const provider = await importModule('src/renderer/commands/localCapabilityProvider.mjs');

  const masterState = provider.normalizeLocalCapabilityState({ toolbarProfile: 'master' });
  assert.equal(masterState.tier, 'free');
  assert.equal(masterState.profileId, 'master');
  assert.equal(masterState.profileIsTier, false);

  const proState = provider.normalizeLocalCapabilityState({ entitlementTier: 'pro', toolbarProfile: 'minimal' });
  assert.equal(proState.tier, 'pro');
  assert.equal(proState.profileId, 'minimal');
  assert.equal(proState.profileIsTier, false);
});

test('S37 local capability provider: Free keeps authorship, toolbar, import, export, and archive commands', async () => {
  const provider = await importModule('src/renderer/commands/localCapabilityProvider.mjs');
  const freeState = { entitlementTier: 'free' };
  const requiredFreeCommands = [
    'cmd.project.open',
    'cmd.project.save',
    'cmd.project.tree.createNode',
    'cmd.project.metadata.update',
    'cmd.project.notes.create',
    'cmd.project.edit.find',
    'cmd.project.edit.replaceMassApply',
    'cmd.project.history.restoreApply',
    'cmd.project.format.toggleBold',
    'cmd.project.format.toggleItalic',
    'cmd.project.format.toggleUnderline',
    'cmd.project.list.toggleBullet',
    'cmd.project.insert.linkPrompt',
    'cmd.project.importDocxV1',
    'cmd.project.importTxtV1',
    'cmd.project.importMarkdownV1',
    'cmd.project.export.docxMin',
    'cmd.project.review.exportDocxReviewPacket',
    'cmd.project.exportPdfV1',
    'cmd.project.exportMarkdownV1',
    'cmd.project.exportFullArchiveV1',
    'cmd.project.importFullArchiveV1',
    'cmd.project.flowOpenV1',
    'cmd.project.flowSaveV1',
  ];

  for (const commandId of requiredFreeCommands) {
    const entitlement = provider.resolveCommandEntitlement(commandId, freeState);
    assert.equal(entitlement.available, true, commandId);
    assert.equal(entitlement.visible, true, commandId);
  }

  assert.equal(provider.isFreeAlwaysAvailableCommand('cmd.project.exportFullArchiveV1'), true);
  assert.equal(provider.isFreeAlwaysAvailableCommand('cmd.project.importFullArchiveV1'), true);
});

test('S37 local capability provider: Pro complexity commands are unavailable in Free and enabled in Pro', async () => {
  const provider = await importModule('src/renderer/commands/localCapabilityProvider.mjs');
  const freeReview = provider.resolveCommandEntitlement('cmd.project.review.switchMode', { entitlementTier: 'free' });
  const freeReviewApply = provider.resolveCommandEntitlement('cmd.project.review.applyExactTextChange', { entitlementTier: 'free' });
  const freeReviewApplyBatch = provider.resolveCommandEntitlement('cmd.project.review.applyExactTextChangesBatch', { entitlementTier: 'free' });
  const proReview = provider.resolveCommandEntitlement('cmd.project.review.switchMode', { entitlementTier: 'pro' });
  const freeComments = provider.resolveCommandEntitlement('cmd.project.review.openComments', { entitlementTier: 'free' });
  const freeCancel = provider.resolveCommandEntitlement('cmd.project.review.cancelOperation', { entitlementTier: 'free' });

  assert.equal(freeReview.available, false);
  assert.equal(freeReview.visible, false);
  assert.equal(freeReview.reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE');
  assert.equal(freeReviewApply.available, false);
  assert.equal(freeReviewApply.visible, false);
  assert.equal(freeReviewApply.reason, 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE');
  assert.equal(freeReviewApplyBatch.available, true);
  assert.equal(freeReviewApplyBatch.visible, true);
  assert.equal(proReview.available, true);
  assert.equal(proReview.visible, true);
  assert.equal(freeComments.available, true);
  assert.equal(freeComments.access, 'read_only');
  assert.equal(freeComments.reason, 'PRO_DATA_READ_ONLY_IN_FREE');
  assert.equal(freeCancel.available, true);
  assert.equal(freeCancel.access, 'read_only');
  assert.equal(freeCancel.reason, 'PRO_DATA_READ_ONLY_IN_FREE');
});

test('S37 local capability provider: Free fails closed for unclassified commands', async () => {
  const provider = await importModule('src/renderer/commands/localCapabilityProvider.mjs');
  const entitlement = provider.resolveCommandEntitlement('cmd.project.future.proOnly', { entitlementTier: 'free' });

  assert.equal(entitlement.available, false);
  assert.equal(entitlement.visible, false);
  assert.equal(entitlement.access, 'unclassified');
  assert.equal(entitlement.reason, 'COMMAND_ENTITLEMENT_UNCLASSIFIED');
});

test('S37 main bridge boundary blocks Pro review writes in local Free', () => {
  const main = read('src/main.js');

  assert.ok(main.includes('const MAIN_FREE_PRO_COMPLEXITY_COMMAND_IDS = new Set(['));
  assert.ok(main.includes("'cmd.project.review.applyExactTextChange'"));
  const guardStart = main.indexOf('const MAIN_FREE_PRO_COMPLEXITY_COMMAND_IDS = new Set([');
  const guardEnd = main.indexOf(']);', guardStart);
  const mainFreeProGuard = main.slice(guardStart, guardEnd);
  assert.equal(mainFreeProGuard.includes("'cmd.project.review.applyExactTextChangesBatch'"), false);
  assert.equal(
    mainFreeProGuard.includes("'cmd.project.review.exportDocxReviewPacket'"),
    false,
    'Review DOCX export is a local artifact export and must stay reachable from the product UI in Free',
  );
  assert.match(
    main,
    /if\s*\(\s*MAIN_FREE_PRO_COMPLEXITY_COMMAND_IDS\.has\(commandId\)\s*\)\s*\{[\s\S]*PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE/u,
  );
});

test('S37 local capability provider: surface projection separates visibility from availability', async () => {
  const provider = await importModule('src/renderer/commands/localCapabilityProvider.mjs');
  const entries = [
    { id: 'cmd.project.save', label: 'Save', surface: ['palette'] },
    { id: 'cmd.project.review.switchMode', label: 'Review', surface: ['palette'] },
    { id: 'cmd.project.review.openComments', label: 'Comments', surface: ['palette'] },
  ];

  const visibleFree = provider.listSurfaceEntriesForEntitlement(entries, 'palette', { entitlementTier: 'free' });
  assert.deepEqual(visibleFree.map((entry) => entry.id), [
    'cmd.project.save',
    'cmd.project.review.openComments',
  ]);

  const allFree = provider.listSurfaceEntriesForEntitlement(
    entries,
    'palette',
    { entitlementTier: 'free' },
    { includeUnavailable: true },
  );
  const review = allFree.find((entry) => entry.id === 'cmd.project.review.switchMode');
  assert.equal(review.entitlement.available, false);
  assert.equal(review.entitlement.visible, false);
});

test('S37 command capability enforcement: entitlement is optional and blocks only when supplied', async () => {
  const capability = await importModule('src/renderer/commands/capabilityPolicy.mjs');
  const registryModule = await importModule('src/renderer/commands/registry.mjs');
  const runnerModule = await importModule('src/renderer/commands/runCommand.mjs');

  assert.equal(
    capability.enforceCapabilityForCommand('cmd.project.review.switchMode', { platformId: 'node' }).ok,
    true,
  );
  const freeCheck = capability.enforceCapabilityForCommand(
    'cmd.project.review.switchMode',
    { platformId: 'node', entitlementTier: 'free' },
  );
  assert.equal(freeCheck.ok, false);
  assert.equal(freeCheck.error.code, 'E_CAPABILITY_DISABLED_FOR_ENTITLEMENT');

  const richToolbar = capability.enforceCapabilityForCommand(
    'cmd.project.format.toggleBold',
    { platformId: 'node', editorMode: 'tiptap', entitlementTier: 'free' },
  );
  assert.equal(richToolbar.ok, true);

  const registry = registryModule.createCommandRegistry();
  let calls = 0;
  registry.registerCommand('cmd.project.review.switchMode', async () => {
    calls += 1;
    return { ok: true, value: { performed: true } };
  });
  const freeRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node', defaultEntitlementTier: 'free' },
  });
  const proRunner = runnerModule.createCommandRunner(registry, {
    capability: { defaultPlatformId: 'node', defaultEntitlementTier: 'pro' },
  });

  assert.equal((await freeRunner('cmd.project.review.switchMode')).ok, false);
  assert.equal(calls, 0);
  assert.equal((await proRunner('cmd.project.review.switchMode')).ok, true);
  assert.equal(calls, 1);
});

test('S37 palette provider: optional entitlement hides Free Pro-complexity entries without changing default provider', async () => {
  const palette = await importModule('src/renderer/commands/palette-groups.v1.mjs');
  const entries = [
    { id: 'cmd.project.save', label: 'Save', group: 'File', surface: ['palette'] },
    { id: 'cmd.project.review.switchMode', label: 'Review mode', group: 'Review', surface: ['palette'] },
    { id: 'cmd.project.review.openComments', label: 'Comments', group: 'Review', surface: ['palette'] },
  ];
  const defaultProvider = palette.createPaletteDataProvider(entries, { defaultSurface: 'palette' });
  assert.deepEqual(defaultProvider.listAll().map((entry) => entry.id), [
    'cmd.project.review.openComments',
    'cmd.project.review.switchMode',
    'cmd.project.save',
  ]);

  const freeProvider = palette.createPaletteDataProvider(entries, {
    defaultSurface: 'palette',
    entitlementTier: 'free',
  });
  assert.deepEqual(freeProvider.listAll().map((entry) => entry.id), [
    'cmd.project.review.openComments',
    'cmd.project.save',
  ]);

  const proProvider = palette.createPaletteDataProvider(entries, {
    defaultSurface: 'palette',
    entitlementTier: 'pro',
  });
  assert.deepEqual(proProvider.listAll().map((entry) => entry.id), [
    'cmd.project.review.openComments',
    'cmd.project.review.switchMode',
    'cmd.project.save',
  ]);
});

test('S37 settings aggregation: capability tier is read-only local state and no second store', async () => {
  const settings = await importModule('src/renderer/settings/settingsAggregator.mjs');
  const aggregation = settings.buildSettingsAggregation({
    entitlementTier: 'free',
    toolbarProfile: 'master',
  });
  const entitlement = aggregation.settings.find((entry) => entry.id === 'privacy.entitlement');
  const toolbar = aggregation.settings.find((entry) => entry.id === 'layout.toolbarProfile');

  assert.equal(entitlement.value, 'Free');
  assert.equal(entitlement.owner, 'Local capability provider');
  assert.equal(entitlement.status, 'read_only');
  assert.equal(entitlement.persistenceClass, 'local-runtime-entitlement');
  assert.equal(aggregation.createsStore, false);
  assert.equal(toolbar.value, 'Полный');
});

test('S37 preservation contract: provider and editor expose capability without deleting unknown project fields', () => {
  const providerSource = read('src/renderer/commands/localCapabilityProvider.mjs');
  const editorSource = read('src/renderer/editor.js');

  assert.match(providerSource, /preservesUnknownProjectData: true/u);
  assert.match(providerSource, /projectFormatShared: true/u);
  assert.match(providerSource, /fullArchiveAlwaysAvailable: true/u);
  assert.match(providerSource, /requiresNetwork: false/u);
  assert.match(providerSource, /requiresAccount: false/u);
  assert.match(editorSource, /entitlementTier: 'free'/u);
  assert.match(editorSource, /defaultEntitlementTier: 'free'/u);
  assert.equal(/fetch\(|XMLHttpRequest|https?:\/\//u.test(providerSource), false);
});
