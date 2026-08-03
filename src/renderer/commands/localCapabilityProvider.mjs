import productCommandRegistry from '../../shared/productCommandRegistry.cjs';

const { PRODUCT_COMMAND_ID_LIST } = productCommandRegistry;

export const LOCAL_CAPABILITY_SCHEMA_VERSION = 'local-capability-provider.v1';

export const LOCAL_ENTITLEMENT_TIERS = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
});

const FREE_READ_ONLY_COMMAND_IDS = Object.freeze([
  'cmd.project.review.openComments',
  'cmd.project.review.cancelOperation',
]);

const FREE_PRO_COMPLEXITY_COMMAND_IDS = Object.freeze([
  'cmd.project.plan.switchMode',
  'cmd.project.review.switchMode',
  'cmd.project.review.importLocalPacket',
  'cmd.project.review.exportLocalPacket',
  'cmd.project.review.openDocxReviewPreviewSession',
  'cmd.project.review.clearSession',
  'cmd.project.review.applyExactTextChange',
  'cmd.project.review.applyFullManuscriptExactTextReturn',
  'cmd.project.review.exportMarkdown',
]);

const FREE_ALWAYS_AVAILABLE_COMMAND_IDS = Object.freeze([
  'project.create',
  'project.applyTextEdit',
  ...PRODUCT_COMMAND_ID_LIST,
  'cmd.project.new',
  'cmd.project.open',
  'cmd.project.save',
  'cmd.project.saveAs',
  'cmd.project.lifecycle.create',
  'cmd.project.lifecycle.open',
  'cmd.project.lifecycle.continue',
  'cmd.project.lifecycle.rename',
  'cmd.project.lifecycle.duplicate',
  'cmd.project.lifecycle.moveLocation',
  'cmd.project.lifecycle.archive',
  'cmd.project.lifecycle.trash',
  'cmd.project.lifecycle.restore',
  'cmd.project.lifecycle.createBackup',
  'cmd.project.lifecycle.inspectIntegrity',
  'cmd.project.document.open',
  'cmd.project.exportCurrentSceneTxtV1',
  'cmd.project.exportSelectedScenesTxtV1',
  'cmd.project.exportAllScenesTxtV1',
  'cmd.project.window.switchModeWrite',
  'cmd.project.tree.createNode',
  'cmd.project.tree.renameNode',
  'cmd.project.tree.deleteNode',
  'cmd.project.tree.reorderNode',
  'cmd.project.tree.moveNode',
  'cmd.project.metadata.update',
  'cmd.project.notes.create',
  'cmd.project.notes.update',
  'cmd.project.notes.delete',
  'cmd.project.notes.restore',
  'cmd.project.notes.attachToScene',
  'cmd.project.notes.convertToScene',
  'cmd.project.edit.undo',
  'cmd.project.edit.redo',
  'cmd.project.edit.find',
  'cmd.project.edit.replace',
  'cmd.project.edit.replaceSingleSafe',
  'cmd.project.edit.replaceMassPreview',
  'cmd.project.edit.replaceMassApply',
  'cmd.project.edit.replaceMassRollback',
  'cmd.project.history.createCheckpoint',
  'cmd.project.history.restorePreview',
  'cmd.project.history.restoreApply',
  'cmd.project.history.restoreUndo',
  'cmd.project.view.zoomOut',
  'cmd.project.view.zoomIn',
  'cmd.project.view.toggleWrap',
  'cmd.project.view.previewFormatA4',
  'cmd.project.view.previewFormatA5',
  'cmd.project.view.previewFormatLetter',
  'cmd.project.view.previewOrientationPortrait',
  'cmd.project.view.previewOrientationLandscape',
  'cmd.project.view.togglePreview',
  'cmd.project.view.togglePreviewFrame',
  'cmd.project.view.setMenuPresentationClassic',
  'cmd.project.view.setMenuPresentationCompact',
  'cmd.project.view.setMenuLocaleBase',
  'cmd.project.view.setMenuLocaleRu',
  'cmd.project.view.setMenuLocaleEn',
  'cmd.project.view.resetMenuCustomization',
  'cmd.project.view.openSettings',
  'cmd.project.view.safeReset',
  'cmd.project.view.restoreLastStable',
  'cmd.project.tools.openDiagnostics',
  'cmd.project.review.openRecovery',
  'cmd.project.review.applyExactTextChangesBatch',
  'cmd.project.review.applyFullManuscriptExactTextReturn',
  'cmd.project.review.exportDocxReviewPacket',
  'cmd.project.review.exportFullManuscriptDocxReviewPacket',
  'cmd.project.insert.markdownPrompt',
  'cmd.project.insert.flowOpen',
  'cmd.project.insert.addCard',
  'cmd.project.format.toggleBold',
  'cmd.project.format.toggleItalic',
  'cmd.project.format.toggleUnderline',
  'cmd.project.format.textColorPicker',
  'cmd.project.format.highlightColorPicker',
  'cmd.project.format.alignLeft',
  'cmd.project.format.alignCenter',
  'cmd.project.format.alignRight',
  'cmd.project.format.alignJustify',
  'cmd.project.list.toggleBullet',
  'cmd.project.list.toggleOrdered',
  'cmd.project.list.clear',
  'cmd.project.insert.linkPrompt',
  'cmd.project.docx.previewLocalFile',
  'cmd.project.docx.previewImportPlan',
  'cmd.project.docx.importSafeCreate',
  'cmd.project.txt.previewLocalFile',
  'cmd.project.txt.importSafeCreate',
  'cmd.project.export.docxMin',
  'cmd.project.exportPdfV1',
  'cmd.project.exportFullArchiveV1',
  'cmd.project.importFullArchiveV1',
  'cmd.project.importMarkdownV1',
  'cmd.project.importDocxV1',
  'cmd.project.importTxtV1',
  'cmd.project.exportMarkdownV1',
  'cmd.project.flowOpenV1',
  'cmd.project.flowSaveV1',
  'cmd.project.plan.flowSave',
  'cmd.ui.theme.set',
  'cmd.ui.font.set',
  'cmd.ui.fontSize.set',
]);

const FREE_READ_ONLY_SET = new Set(FREE_READ_ONLY_COMMAND_IDS);
const FREE_PRO_COMPLEXITY_SET = new Set(FREE_PRO_COMPLEXITY_COMMAND_IDS);
const FREE_ALWAYS_AVAILABLE_SET = new Set(FREE_ALWAYS_AVAILABLE_COMMAND_IDS);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTier(value) {
  return normalizeString(value).toLowerCase() === LOCAL_ENTITLEMENT_TIERS.PRO
    ? LOCAL_ENTITLEMENT_TIERS.PRO
    : LOCAL_ENTITLEMENT_TIERS.FREE;
}

function pickTier(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return normalizeTier(
    source.entitlementTier
      || source.tier
      || source.plan
      || source.productTier
      || source.localTier
      || '',
  );
}

export function resolveEntitlementTierLabel(value) {
  return normalizeTier(value) === LOCAL_ENTITLEMENT_TIERS.PRO ? 'Pro' : 'Free';
}

export function normalizeLocalCapabilityState(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const entitlementState = source.entitlementState && typeof source.entitlementState === 'object' && !Array.isArray(source.entitlementState)
    ? source.entitlementState
    : {};
  const profileId = normalizeString(source.profileId || source.toolbarProfile || entitlementState.profileId);
  const tier = pickTier({
    ...entitlementState,
    entitlementTier: source.entitlementTier || entitlementState.entitlementTier,
    tier: source.tier || entitlementState.tier,
    plan: source.plan || entitlementState.plan,
    productTier: source.productTier || entitlementState.productTier,
    localTier: source.localTier || entitlementState.localTier,
  });

  return Object.freeze({
    schemaVersion: LOCAL_CAPABILITY_SCHEMA_VERSION,
    tier,
    label: resolveEntitlementTierLabel(tier),
    localOnly: true,
    requiresAccount: false,
    requiresNetwork: false,
    hasRemoteLicenseAuthority: false,
    profileId,
    profileIsTier: false,
    preservesUnknownProjectData: true,
    freeCanReadProData: true,
    freeCanEditAuthoredText: true,
    fullArchiveAlwaysAvailable: true,
    projectFormatShared: true,
  });
}

export function isFreeAlwaysAvailableCommand(commandId) {
  return FREE_ALWAYS_AVAILABLE_SET.has(normalizeString(commandId));
}

export function isProComplexityCommand(commandId) {
  return FREE_PRO_COMPLEXITY_SET.has(normalizeString(commandId));
}

export function getLocalCapabilityContract() {
  return Object.freeze({
    schemaVersion: LOCAL_CAPABILITY_SCHEMA_VERSION,
    tiers: Object.freeze([LOCAL_ENTITLEMENT_TIERS.FREE, LOCAL_ENTITLEMENT_TIERS.PRO]),
    freeAlwaysAvailableCommandIds: Object.freeze([...FREE_ALWAYS_AVAILABLE_COMMAND_IDS]),
    freeReadOnlyCommandIds: Object.freeze([...FREE_READ_ONLY_COMMAND_IDS]),
    freeProComplexityCommandIds: Object.freeze([...FREE_PRO_COMPLEXITY_COMMAND_IDS]),
    invariants: Object.freeze({
      localOnly: true,
      requiresAccount: false,
      requiresNetwork: false,
      profileIsTier: false,
      fullArchiveAlwaysAvailable: true,
      projectFormatShared: true,
      preservesUnknownProjectData: true,
    }),
  });
}

export function resolveCommandEntitlement(commandId, entitlementInput = {}) {
  const normalizedCommandId = normalizeString(commandId);
  const state = normalizeLocalCapabilityState(entitlementInput);
  if (!normalizedCommandId) {
    return Object.freeze({
      ok: false,
      available: false,
      visible: false,
      access: 'unavailable',
      reason: 'COMMAND_ID_INVALID',
      state,
      commandId: normalizedCommandId,
    });
  }

  if (state.tier === LOCAL_ENTITLEMENT_TIERS.PRO) {
    return Object.freeze({
      ok: true,
      available: true,
      visible: true,
      access: 'enabled',
      reason: '',
      state,
      commandId: normalizedCommandId,
    });
  }

  if (FREE_READ_ONLY_SET.has(normalizedCommandId)) {
    return Object.freeze({
      ok: true,
      available: true,
      visible: true,
      access: 'read_only',
      reason: 'PRO_DATA_READ_ONLY_IN_FREE',
      state,
      commandId: normalizedCommandId,
    });
  }

  if (FREE_PRO_COMPLEXITY_SET.has(normalizedCommandId)) {
    return Object.freeze({
      ok: false,
      available: false,
      visible: false,
      access: 'pro_complexity_surface',
      reason: 'PRO_COMPLEXITY_SURFACE_UNAVAILABLE_IN_FREE',
      state,
      commandId: normalizedCommandId,
    });
  }

  if (FREE_ALWAYS_AVAILABLE_SET.has(normalizedCommandId)) {
    return Object.freeze({
      ok: true,
      available: true,
      visible: true,
      access: 'free_authorship',
      reason: '',
      state,
      commandId: normalizedCommandId,
    });
  }

  return Object.freeze({
    ok: false,
    available: false,
    visible: false,
    access: 'unclassified',
    reason: 'COMMAND_ENTITLEMENT_UNCLASSIFIED',
    state,
    commandId: normalizedCommandId,
  });
}

function normalizeSurfaceEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const id = normalizeString(input.id);
  if (!id) return null;
  return {
    ...input,
    id,
    surface: Array.isArray(input.surface) ? [...input.surface] : [],
  };
}

function resolveSurfaceEntries(source, surface) {
  if (source && typeof source.listBySurface === 'function') {
    return source.listBySurface(surface).map(normalizeSurfaceEntry).filter(Boolean);
  }
  if (source && typeof source.listCommandMeta === 'function') {
    return source.listCommandMeta()
      .map(normalizeSurfaceEntry)
      .filter((entry) => entry && (!surface || entry.surface.includes(surface)));
  }
  if (Array.isArray(source)) {
    return source
      .map(normalizeSurfaceEntry)
      .filter((entry) => entry && (!surface || entry.surface.includes(surface)));
  }
  return [];
}

export function annotateSurfaceEntriesForEntitlement(entries = [], entitlementInput = {}) {
  return entries
    .map(normalizeSurfaceEntry)
    .filter(Boolean)
    .map((entry) => {
      const entitlement = resolveCommandEntitlement(entry.id, entitlementInput);
      return Object.freeze({
        ...entry,
        entitlement: Object.freeze({
          tier: entitlement.state.tier,
          available: entitlement.available,
          visible: entitlement.visible,
          access: entitlement.access,
          reason: entitlement.reason,
        }),
      });
    });
}

export function listSurfaceEntriesForEntitlement(source, surface = 'palette', entitlementInput = {}, options = {}) {
  const includeUnavailable = options && options.includeUnavailable === true;
  const entries = annotateSurfaceEntriesForEntitlement(resolveSurfaceEntries(source, surface), entitlementInput);
  if (includeUnavailable) return entries;
  return entries.filter((entry) => entry.entitlement.visible === true);
}
