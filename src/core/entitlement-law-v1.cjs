'use strict';

// R2.4 ENT0 — the single entitlement decision table of the product.
// This module lives in the product plane and is the ONLY authority that
// classifies a command as free authorship, read-only in free, or a pro
// complexity surface. Authoritative product ports (menu dispatch, command
// bridge) enforce decideCommandEntitlement with a product-owned tier.
// The renderer may mirror this exact table for visibility hints, but a
// hint is never enforcement and a renderer-supplied tier never reaches a
// port decision.
//
// v1 local law: localOnly, no account, no network, no remote license
// authority; the product-owned tier is therefore the constant FREE until an
// owner-approved product contour admits another tier source.

const productCommandRegistry = require('../shared/productCommandRegistry.cjs');

const { PRODUCT_COMMAND_ID_LIST } = productCommandRegistry;

const ENTITLEMENT_LAW_SCHEMA_VERSION = 'entitlement-law.v1';

const ENTITLEMENT_TIERS = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
});

const ENTITLEMENT_AUTHORITY_MODE = Object.freeze({
  schemaVersion: 'entitlement-authority-mode.v1',
  gateId: 'ENTITLEMENT_SEMANTICS_ADR_OR_DENY',
  ownerDecision: 'DENIED',
  mode: 'SAFE_DENY',
  entitlementDependentBehaviorEnabled: false,
  enabledTiers: Object.freeze([ENTITLEMENT_TIERS.FREE]),
  disabledTiers: Object.freeze([ENTITLEMENT_TIERS.PRO]),
  pricingAuthority: false,
  businessAuthority: false,
  releaseAuthority: false,
  cloudAuthority: false,
  userDataAuthority: false,
  dependencyAdoption: false,
});

const E_COMMAND_DISABLED_FOR_ENTITLEMENT = 'E_COMMAND_DISABLED_FOR_ENTITLEMENT';

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
  // Bridge-admitted product surface commands (ui:command-bridge allowlist).
  // They are not palette entries, so this classification changes no palette
  // visibility; it closes the unclassified hole so the port decision and the
  // product truth agree for every admitted command.
  'cmd.project.docx.previewContent',
  'cmd.project.markdown.previewLocalFile',
  'cmd.project.markdown.acceptLocalPreview',
  'cmd.project.markdown.exportLocalFile',
  'cmd.project.releaseClaim.admit',
  'cmd.project.releaseClaim.execute',
  'cmd.project.review.applyFormattingReturn',
  'cmd.project.review.inspectFormattingReturnReplay',
  'cmd.project.review.applyStructuralReturn',
  'cmd.project.review.inspectStructuralReturnReplay',
  'cmd.project.review.reloadReconciledScene',
  'cmd.project.review.inspectDocxIntakeGate',
  'cmd.project.review.inspectDocxReviewPreflight',
  'cmd.project.review.activateDocxReviewPreviewSession',
]);

const FREE_READ_ONLY_SET = new Set(FREE_READ_ONLY_COMMAND_IDS);
const FREE_PRO_COMPLEXITY_SET = new Set(FREE_PRO_COMPLEXITY_COMMAND_IDS);
const FREE_ALWAYS_AVAILABLE_SET = new Set(FREE_ALWAYS_AVAILABLE_COMMAND_IDS);

const ENTITLEMENT_INVARIANTS = Object.freeze({
  localOnly: true,
  requiresAccount: false,
  requiresNetwork: false,
  hasRemoteLicenseAuthority: false,
  profileIsTier: false,
  preservesUnknownProjectData: true,
  freeCanReadProData: true,
  freeCanEditAuthoredText: true,
  fullArchiveAlwaysAvailable: true,
  projectFormatShared: true,
  safeDenyUntilProductDecision: true,
  entitlementDependentBehaviorEnabled: false,
  pricingAuthority: false,
  businessAuthority: false,
  releaseAuthority: false,
  cloudAuthority: false,
  userDataAuthority: false,
  dependencyAdoption: false,
});

const normalizeCommandId = (value) => (typeof value === 'string' ? value.trim() : '');

// Fail-closed tier normalization: only the exact pro spelling counts as
// pro; every other, missing or hostile value degrades to free.
function normalizeEntitlementTier(value) {
  return (typeof value === 'string' ? value.trim() : '').toLowerCase() === ENTITLEMENT_TIERS.PRO
    ? ENTITLEMENT_TIERS.PRO
    : ENTITLEMENT_TIERS.FREE;
}

function isEntitlementTierEnabled(value) {
  const tier = normalizeEntitlementTier(value);
  return ENTITLEMENT_AUTHORITY_MODE.enabledTiers.includes(tier);
}

function normalizeEffectiveEntitlementTier(value) {
  const tier = normalizeEntitlementTier(value);
  return isEntitlementTierEnabled(tier) ? tier : ENTITLEMENT_TIERS.FREE;
}

// The product-owned tier for port decisions. v1 local law admits no remote
// license authority, account or network source, so the tier is the constant
// FREE. WP206 safe-deny authority also prevents a supplied Pro spelling from
// becoming an effective entitlement tier until a future owner-approved product
// contour changes ENTITLEMENT_AUTHORITY_MODE; renderer payloads are never read
// here.
function getProductEntitlementTier() {
  return ENTITLEMENT_TIERS.FREE;
}

function isFreeReadOnlyCommandId(commandId) {
  return FREE_READ_ONLY_SET.has(normalizeCommandId(commandId));
}

function isProComplexityCommandId(commandId) {
  return FREE_PRO_COMPLEXITY_SET.has(normalizeCommandId(commandId));
}

function isFreeAlwaysAvailableCommandId(commandId) {
  return FREE_ALWAYS_AVAILABLE_SET.has(normalizeCommandId(commandId));
}

// The one decision: every command id is classified by this table alone.
// Unknown or unclassified commands fail closed as unavailable.
function decideCommandEntitlement(commandId, tierInput) {
  const normalizedCommandId = normalizeCommandId(commandId);
  const tier = normalizeEffectiveEntitlementTier(tierInput);
  if (!normalizedCommandId) {
    return Object.freeze({
      ok: false,
      available: false,
      visible: false,
      access: 'unavailable',
      reason: 'COMMAND_ID_INVALID',
      commandId: normalizedCommandId,
    });
  }
  if (tier === ENTITLEMENT_TIERS.PRO) {
    return Object.freeze({
      ok: true,
      available: true,
      visible: true,
      access: 'enabled',
      reason: '',
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
      commandId: normalizedCommandId,
    });
  }
  return Object.freeze({
    ok: false,
    available: false,
    visible: false,
    access: 'unclassified',
    reason: 'COMMAND_ENTITLEMENT_UNCLASSIFIED',
    commandId: normalizedCommandId,
  });
}

module.exports = Object.freeze({
  ENTITLEMENT_LAW_SCHEMA_VERSION,
  ENTITLEMENT_TIERS,
  ENTITLEMENT_AUTHORITY_MODE,
  E_COMMAND_DISABLED_FOR_ENTITLEMENT,
  ENTITLEMENT_INVARIANTS,
  FREE_READ_ONLY_COMMAND_IDS,
  FREE_PRO_COMPLEXITY_COMMAND_IDS,
  FREE_ALWAYS_AVAILABLE_COMMAND_IDS,
  normalizeEntitlementTier,
  getProductEntitlementTier,
  isFreeReadOnlyCommandId,
  isProComplexityCommandId,
  isFreeAlwaysAvailableCommandId,
  isEntitlementTierEnabled,
  normalizeEffectiveEntitlementTier,
  decideCommandEntitlement,
});
