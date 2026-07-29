import { resolveCommandEntitlement } from './localCapabilityProvider.mjs';

export const CAPABILITY_BINDING = Object.freeze({
  'project.create': 'cap.core.project.create',
  'project.applyTextEdit': 'cap.core.project.applyTextEdit',
  'atlas.entity.create': 'cap.atlas.entity.create',
  'atlas.alias.add': 'cap.atlas.alias.add',
  'atlas.mention.confirm': 'cap.atlas.mention.confirm',
  'atlas.observation.suppress': 'cap.atlas.observation.suppress',
  'idea.create': 'cap.idea.edit',
  'idea.originLink.add': 'cap.idea.edit',
  'meaning.promote': 'cap.meaning.edit',
  'manualMap.create': 'cap.manualMap.edit',
  'manualMap.node.add': 'cap.manualMap.edit',
  'manualMap.edge.add': 'cap.manualMap.edit',
  'manualMap.attachment.add': 'cap.manualMap.edit',
  'manualMap.portal.add': 'cap.manualMap.edit',
  'manualMap.template.apply': 'cap.manualMap.edit',
  'cmd.project.new': 'cap.project.new',
  'cmd.project.lifecycle.create': 'cap.project.lifecycle.create',
  'cmd.project.lifecycle.open': 'cap.project.lifecycle.open',
  'cmd.project.lifecycle.continue': 'cap.project.lifecycle.continue',
  'cmd.project.lifecycle.rename': 'cap.project.lifecycle.rename',
  'cmd.project.lifecycle.duplicate': 'cap.project.lifecycle.duplicate',
  'cmd.project.lifecycle.moveLocation': 'cap.project.lifecycle.moveLocation',
  'cmd.project.document.open': 'cap.project.document.open',
  'cmd.project.exportCurrentSceneTxtV1': 'cap.project.export.currentSceneTxtV1',
  'cmd.project.exportSelectedScenesTxtV1': 'cap.project.export.selectedScenesTxtV1',
  'cmd.project.exportAllScenesTxtV1': 'cap.project.export.allScenesTxtV1',
  'cmd.project.open': 'cap.project.open',
  'cmd.project.save': 'cap.project.save',
  'cmd.project.saveAs': 'cap.project.saveAs',
  'cmd.project.view.setMenuPresentationClassic': 'cap.project.view.menuPresentation',
  'cmd.project.view.setMenuPresentationCompact': 'cap.project.view.menuPresentation',
  'cmd.project.view.setMenuLocaleBase': 'cap.project.view.menuLocale',
  'cmd.project.view.setMenuLocaleRu': 'cap.project.view.menuLocale',
  'cmd.project.view.setMenuLocaleEn': 'cap.project.view.menuLocale',
  'cmd.project.view.resetMenuCustomization': 'cap.project.view.menuCustomization',
  'cmd.project.view.openSettings': 'cap.project.view.openSettings',
  'cmd.project.view.safeReset': 'cap.project.view.safeReset',
  'cmd.project.view.restoreLastStable': 'cap.project.view.restoreLastStable',
  'cmd.project.tools.openDiagnostics': 'cap.project.tools.openDiagnostics',
  'cmd.project.review.openRecovery': 'cap.project.review.openRecovery',
  'cmd.project.plan.switchMode': 'cap.project.plan.switchMode',
  'cmd.project.review.switchMode': 'cap.project.review.switchMode',
  'cmd.project.window.switchModeWrite': 'cap.project.window.switchModeWrite',
  'cmd.project.tree.createNode': 'cap.project.tree.createNode',
  'cmd.project.tree.renameNode': 'cap.project.tree.renameNode',
  'cmd.project.tree.deleteNode': 'cap.project.tree.deleteNode',
  'cmd.project.tree.reorderNode': 'cap.project.tree.reorderNode',
  'cmd.project.tree.moveNode': 'cap.project.tree.moveNode',
  'cmd.project.metadata.update': 'cap.project.metadata.update',
  'cmd.project.notes.create': 'cap.project.notes.create',
  'cmd.project.notes.update': 'cap.project.notes.update',
  'cmd.project.notes.delete': 'cap.project.notes.delete',
  'cmd.project.notes.restore': 'cap.project.notes.restore',
  'cmd.project.notes.attachToScene': 'cap.project.notes.attachToScene',
  'cmd.project.notes.convertToScene': 'cap.project.notes.convertToScene',
  'cmd.project.edit.undo': 'cap.project.edit.undo',
  'cmd.project.edit.redo': 'cap.project.edit.redo',
  'cmd.project.edit.find': 'cap.project.edit.find',
  'cmd.project.edit.replace': 'cap.project.edit.replace',
  'cmd.project.edit.replaceSingleSafe': 'cap.project.edit.replaceSingleSafe',
  'cmd.project.edit.replaceMassPreview': 'cap.project.edit.replaceMassPreview',
  'cmd.project.edit.replaceMassApply': 'cap.project.edit.replaceMassApply',
  'cmd.project.edit.replaceMassRollback': 'cap.project.edit.replaceMassRollback',
  'cmd.project.view.zoomOut': 'cap.project.view.zoomOut',
  'cmd.project.view.zoomIn': 'cap.project.view.zoomIn',
  'cmd.project.view.toggleWrap': 'cap.project.view.toggleWrap',
  'cmd.project.view.previewFormatA4': 'cap.project.view.previewFormatA4',
  'cmd.project.view.previewFormatA5': 'cap.project.view.previewFormatA5',
  'cmd.project.view.previewFormatLetter': 'cap.project.view.previewFormatLetter',
  'cmd.project.view.previewOrientationPortrait': 'cap.project.view.previewOrientationPortrait',
  'cmd.project.view.previewOrientationLandscape': 'cap.project.view.previewOrientationLandscape',
  'cmd.project.view.togglePreview': 'cap.project.view.togglePreview',
  'cmd.project.view.togglePreviewFrame': 'cap.project.view.togglePreviewFrame',
  'cmd.project.insert.markdownPrompt': 'cap.project.insert.markdownPrompt',
  'cmd.project.insert.flowOpen': 'cap.project.insert.flowOpen',
  'cmd.project.insert.addCard': 'cap.project.insert.addCard',
  'cmd.project.format.toggleBold': 'cap.project.format.toggleBold',
  'cmd.project.format.toggleItalic': 'cap.project.format.toggleItalic',
  'cmd.project.format.toggleUnderline': 'cap.project.format.toggleUnderline',
  'cmd.project.format.textColorPicker': 'cap.project.format.textColorPicker',
  'cmd.project.format.highlightColorPicker': 'cap.project.format.highlightColorPicker',
  'cmd.project.format.alignLeft': 'cap.project.format.alignLeft',
  'cmd.project.format.alignCenter': 'cap.project.format.alignCenter',
  'cmd.project.format.alignRight': 'cap.project.format.alignRight',
  'cmd.project.format.alignJustify': 'cap.project.format.alignJustify',
  'cmd.project.list.toggleBullet': 'cap.project.list.toggleBullet',
  'cmd.project.list.toggleOrdered': 'cap.project.list.toggleOrdered',
  'cmd.project.list.clear': 'cap.project.list.clear',
  'cmd.project.insert.linkPrompt': 'cap.project.insert.linkPrompt',
  'cmd.project.review.importLocalPacket': 'cap.project.review.importLocalPacket',
  'cmd.project.review.exportLocalPacket': 'cap.project.review.exportLocalPacket',
  'cmd.project.review.openDocxReviewPreviewSession': 'cap.project.review.openDocxReviewPreviewSession',
  'cmd.project.review.openComments': 'cap.project.review.openComments',
  'cmd.project.review.clearSession': 'cap.project.review.clearSession',
  'cmd.project.review.cancelOperation': 'cap.project.review.cancelOperation',
  'cmd.project.plan.flowSave': 'cap.project.plan.flowSave',
  'cmd.project.review.exportMarkdown': 'cap.project.review.exportMarkdown',
  'cmd.project.docx.previewLocalFile': 'cap.project.docx.previewLocalFile',
  'cmd.project.docx.previewImportPlan': 'cap.project.docx.previewImportPlan',
  'cmd.project.docx.importSafeCreate': 'cap.project.docx.importSafeCreate',
  'cmd.project.txt.previewLocalFile': 'cap.project.txt.previewLocalFile',
  'cmd.project.txt.importSafeCreate': 'cap.project.txt.importSafeCreate',
  'cmd.project.export.docxMin': 'cap.project.export.docxMin',
  'cmd.project.exportPdfV1': 'cap.project.export.pdfV1',
  'cmd.project.exportFullArchiveV1': 'cap.project.export.fullArchiveV1',
  'cmd.project.importFullArchiveV1': 'cap.project.import.fullArchiveV1',
  'cmd.project.importMarkdownV1': 'cap.project.import.markdownV1',
  'cmd.project.importDocxV1': 'cap.project.import.docxV1',
  'cmd.project.importTxtV1': 'cap.project.import.txtV1',
  'cmd.project.exportMarkdownV1': 'cap.project.export.markdownV1',
  'cmd.project.flowOpenV1': 'cap.project.flow.openV1',
  'cmd.project.flowSaveV1': 'cap.project.flow.saveV1',
  'cmd.ui.theme.set': 'cap.ui.theme.set',
  'cmd.ui.font.set': 'cap.ui.font.set',
  'cmd.ui.fontSize.set': 'cap.ui.fontSize.set',
});

export const CAPABILITY_MATRIX = Object.freeze({
  node: Object.freeze({
    'cap.core.project.create': true,
    'cap.core.project.applyTextEdit': true,
    'cap.atlas.entity.create': true,
    'cap.atlas.alias.add': true,
    'cap.atlas.mention.confirm': true,
    'cap.atlas.observation.suppress': true,
    'cap.idea.edit': true,
    'cap.meaning.edit': true,
    'cap.manualMap.edit': true,
    'cap.project.new': true,
    'cap.project.lifecycle.create': true,
    'cap.project.lifecycle.open': true,
    'cap.project.lifecycle.continue': true,
    'cap.project.lifecycle.rename': true,
    'cap.project.lifecycle.duplicate': true,
    'cap.project.lifecycle.moveLocation': true,
    'cap.project.document.open': true,
    'cap.project.export.currentSceneTxtV1': true,
    'cap.project.export.selectedScenesTxtV1': true,
    'cap.project.export.allScenesTxtV1': true,
    'cap.project.open': true,
    'cap.project.save': true,
    'cap.project.saveAs': true,
    'cap.project.view.menuPresentation': true,
    'cap.project.view.menuLocale': true,
    'cap.project.view.menuCustomization': true,
    'cap.project.view.openSettings': true,
    'cap.project.view.safeReset': true,
    'cap.project.view.restoreLastStable': true,
    'cap.project.tools.openDiagnostics': true,
    'cap.project.review.openRecovery': true,
    'cap.project.plan.switchMode': true,
    'cap.project.review.switchMode': true,
    'cap.project.window.switchModeWrite': true,
    'cap.project.tree.createNode': true,
    'cap.project.tree.renameNode': true,
    'cap.project.tree.deleteNode': true,
    'cap.project.tree.reorderNode': true,
    'cap.project.tree.moveNode': true,
    'cap.project.metadata.update': true,
    'cap.project.notes.create': true,
    'cap.project.notes.update': true,
    'cap.project.notes.delete': true,
    'cap.project.notes.restore': true,
    'cap.project.notes.attachToScene': true,
    'cap.project.notes.convertToScene': true,
    'cap.project.edit.undo': true,
    'cap.project.edit.redo': true,
    'cap.project.edit.find': true,
    'cap.project.edit.replace': true,
    'cap.project.edit.replaceSingleSafe': true,
    'cap.project.edit.replaceMassPreview': true,
    'cap.project.edit.replaceMassApply': true,
    'cap.project.edit.replaceMassRollback': true,
    'cap.project.view.zoomOut': true,
    'cap.project.view.zoomIn': true,
    'cap.project.view.toggleWrap': true,
    'cap.project.view.previewFormatA4': true,
    'cap.project.view.previewFormatA5': true,
    'cap.project.view.previewFormatLetter': true,
    'cap.project.view.previewOrientationPortrait': true,
    'cap.project.view.previewOrientationLandscape': true,
    'cap.project.view.togglePreview': true,
    'cap.project.view.togglePreviewFrame': true,
    'cap.project.insert.markdownPrompt': true,
    'cap.project.insert.flowOpen': true,
    'cap.project.insert.addCard': true,
    'cap.project.format.toggleBold': true,
    'cap.project.format.toggleItalic': true,
    'cap.project.format.toggleUnderline': true,
    'cap.project.format.textColorPicker': true,
    'cap.project.format.highlightColorPicker': true,
    'cap.project.format.alignLeft': true,
    'cap.project.format.alignCenter': true,
    'cap.project.format.alignRight': true,
    'cap.project.format.alignJustify': true,
    'cap.project.list.toggleBullet': true,
    'cap.project.list.toggleOrdered': true,
    'cap.project.list.clear': true,
    'cap.project.insert.linkPrompt': true,
    'cap.project.review.importLocalPacket': true,
    'cap.project.review.exportLocalPacket': true,
    'cap.project.review.openDocxReviewPreviewSession': true,
    'cap.project.review.openComments': true,
    'cap.project.review.clearSession': true,
    'cap.project.review.cancelOperation': true,
    'cap.project.plan.flowSave': true,
    'cap.project.review.exportMarkdown': true,
    'cap.project.docx.previewLocalFile': true,
    'cap.project.docx.previewImportPlan': true,
    'cap.project.docx.importSafeCreate': true,
    'cap.project.txt.previewLocalFile': true,
    'cap.project.txt.importSafeCreate': true,
    'cap.project.export.docxMin': true,
    'cap.project.export.pdfV1': true,
    'cap.project.export.fullArchiveV1': true,
    'cap.project.import.fullArchiveV1': true,
    'cap.project.import.markdownV1': true,
    'cap.project.import.docxV1': true,
    'cap.project.import.txtV1': true,
    'cap.project.export.markdownV1': true,
    'cap.project.flow.openV1': true,
    'cap.project.flow.saveV1': true,
    'cap.ui.theme.set': true,
    'cap.ui.font.set': true,
    'cap.ui.fontSize.set': true,
  }),
  web: Object.freeze({
    'cap.core.project.create': true,
    'cap.core.project.applyTextEdit': true,
    'cap.atlas.entity.create': false,
    'cap.atlas.alias.add': false,
    'cap.atlas.mention.confirm': false,
    'cap.atlas.observation.suppress': false,
    'cap.idea.edit': false,
    'cap.meaning.edit': false,
    'cap.manualMap.edit': false,
    'cap.project.new': false,
    'cap.project.lifecycle.create': false,
    'cap.project.lifecycle.open': false,
    'cap.project.lifecycle.continue': false,
    'cap.project.lifecycle.rename': false,
    'cap.project.lifecycle.duplicate': false,
    'cap.project.lifecycle.moveLocation': false,
    'cap.project.document.open': false,
    'cap.project.export.currentSceneTxtV1': false,
    'cap.project.export.selectedScenesTxtV1': false,
    'cap.project.export.allScenesTxtV1': false,
    'cap.project.open': false,
    'cap.project.save': false,
    'cap.project.saveAs': false,
    'cap.project.view.menuPresentation': false,
    'cap.project.view.menuLocale': false,
    'cap.project.view.menuCustomization': false,
    'cap.project.view.openSettings': false,
    'cap.project.view.safeReset': false,
    'cap.project.view.restoreLastStable': false,
    'cap.project.tools.openDiagnostics': false,
    'cap.project.review.openRecovery': false,
    'cap.project.plan.switchMode': false,
    'cap.project.review.switchMode': false,
    'cap.project.window.switchModeWrite': false,
    'cap.project.tree.createNode': false,
    'cap.project.tree.renameNode': false,
    'cap.project.tree.deleteNode': false,
    'cap.project.tree.reorderNode': false,
    'cap.project.tree.moveNode': false,
    'cap.project.metadata.update': false,
    'cap.project.notes.create': false,
    'cap.project.notes.update': false,
    'cap.project.notes.delete': false,
    'cap.project.notes.restore': false,
    'cap.project.notes.attachToScene': false,
    'cap.project.notes.convertToScene': false,
    'cap.project.edit.undo': true,
    'cap.project.edit.redo': true,
    'cap.project.edit.find': true,
    'cap.project.edit.replace': true,
    'cap.project.edit.replaceSingleSafe': true,
    'cap.project.edit.replaceMassPreview': true,
    'cap.project.edit.replaceMassApply': true,
    'cap.project.edit.replaceMassRollback': true,
    'cap.project.view.zoomOut': true,
    'cap.project.view.zoomIn': true,
    'cap.project.view.toggleWrap': true,
    'cap.project.view.previewFormatA4': true,
    'cap.project.view.previewFormatA5': true,
    'cap.project.view.previewFormatLetter': true,
    'cap.project.view.previewOrientationPortrait': true,
    'cap.project.view.previewOrientationLandscape': true,
    'cap.project.view.togglePreview': true,
    'cap.project.view.togglePreviewFrame': true,
    'cap.project.insert.markdownPrompt': false,
    'cap.project.insert.flowOpen': false,
    'cap.project.insert.addCard': true,
    'cap.project.format.toggleBold': true,
    'cap.project.format.toggleItalic': true,
    'cap.project.format.toggleUnderline': true,
    'cap.project.format.textColorPicker': true,
    'cap.project.format.highlightColorPicker': true,
    'cap.project.format.alignLeft': true,
    'cap.project.format.alignCenter': true,
    'cap.project.format.alignRight': true,
    'cap.project.format.alignJustify': true,
    'cap.project.list.toggleBullet': true,
    'cap.project.list.toggleOrdered': true,
    'cap.project.list.clear': true,
    'cap.project.insert.linkPrompt': true,
    'cap.project.review.importLocalPacket': false,
    'cap.project.review.exportLocalPacket': false,
    'cap.project.review.openDocxReviewPreviewSession': false,
    'cap.project.review.openComments': true,
    'cap.project.review.clearSession': false,
    'cap.project.review.cancelOperation': true,
    'cap.project.plan.flowSave': false,
    'cap.project.review.exportMarkdown': false,
    'cap.project.docx.previewLocalFile': false,
    'cap.project.docx.previewImportPlan': false,
    'cap.project.docx.importSafeCreate': false,
    'cap.project.txt.previewLocalFile': false,
    'cap.project.txt.importSafeCreate': false,
    'cap.project.export.docxMin': false,
    'cap.project.export.pdfV1': false,
    'cap.project.export.fullArchiveV1': false,
    'cap.project.import.fullArchiveV1': false,
    'cap.project.import.markdownV1': false,
    'cap.project.import.docxV1': false,
    'cap.project.import.txtV1': false,
    'cap.project.export.markdownV1': false,
    'cap.project.flow.openV1': false,
    'cap.project.flow.saveV1': false,
    'cap.ui.theme.set': false,
    'cap.ui.font.set': false,
    'cap.ui.fontSize.set': false,
  }),
  'mobile-wrapper': Object.freeze({
    'cap.core.project.create': true,
    'cap.core.project.applyTextEdit': true,
    'cap.atlas.entity.create': false,
    'cap.atlas.alias.add': false,
    'cap.atlas.mention.confirm': false,
    'cap.atlas.observation.suppress': false,
    'cap.idea.edit': false,
    'cap.meaning.edit': false,
    'cap.manualMap.edit': false,
    'cap.project.new': false,
    'cap.project.lifecycle.create': false,
    'cap.project.lifecycle.open': false,
    'cap.project.lifecycle.continue': false,
    'cap.project.lifecycle.rename': false,
    'cap.project.lifecycle.duplicate': false,
    'cap.project.lifecycle.moveLocation': false,
    'cap.project.document.open': false,
    'cap.project.export.currentSceneTxtV1': false,
    'cap.project.export.selectedScenesTxtV1': false,
    'cap.project.export.allScenesTxtV1': false,
    'cap.project.open': false,
    'cap.project.save': false,
    'cap.project.saveAs': false,
    'cap.project.view.menuPresentation': false,
    'cap.project.view.menuLocale': false,
    'cap.project.view.menuCustomization': false,
    'cap.project.view.openSettings': false,
    'cap.project.view.safeReset': false,
    'cap.project.view.restoreLastStable': false,
    'cap.project.tools.openDiagnostics': false,
    'cap.project.review.openRecovery': false,
    'cap.project.plan.switchMode': false,
    'cap.project.review.switchMode': false,
    'cap.project.window.switchModeWrite': false,
    'cap.project.tree.createNode': false,
    'cap.project.tree.renameNode': false,
    'cap.project.tree.deleteNode': false,
    'cap.project.tree.reorderNode': false,
    'cap.project.tree.moveNode': false,
    'cap.project.metadata.update': false,
    'cap.project.notes.create': false,
    'cap.project.notes.update': false,
    'cap.project.notes.delete': false,
    'cap.project.notes.restore': false,
    'cap.project.notes.attachToScene': false,
    'cap.project.notes.convertToScene': false,
    'cap.project.edit.undo': true,
    'cap.project.edit.redo': true,
    'cap.project.edit.find': true,
    'cap.project.edit.replace': true,
    'cap.project.edit.replaceSingleSafe': true,
    'cap.project.edit.replaceMassPreview': true,
    'cap.project.edit.replaceMassApply': true,
    'cap.project.edit.replaceMassRollback': true,
    'cap.project.view.zoomOut': true,
    'cap.project.view.zoomIn': true,
    'cap.project.view.toggleWrap': true,
    'cap.project.view.previewFormatA4': true,
    'cap.project.view.previewFormatA5': true,
    'cap.project.view.previewFormatLetter': true,
    'cap.project.view.previewOrientationPortrait': true,
    'cap.project.view.previewOrientationLandscape': true,
    'cap.project.view.togglePreview': true,
    'cap.project.view.togglePreviewFrame': true,
    'cap.project.insert.markdownPrompt': false,
    'cap.project.insert.flowOpen': false,
    'cap.project.insert.addCard': true,
    'cap.project.format.toggleBold': true,
    'cap.project.format.toggleItalic': true,
    'cap.project.format.toggleUnderline': true,
    'cap.project.format.textColorPicker': true,
    'cap.project.format.highlightColorPicker': true,
    'cap.project.format.alignLeft': true,
    'cap.project.format.alignCenter': true,
    'cap.project.format.alignRight': true,
    'cap.project.format.alignJustify': true,
    'cap.project.list.toggleBullet': true,
    'cap.project.list.toggleOrdered': true,
    'cap.project.list.clear': true,
    'cap.project.insert.linkPrompt': true,
    'cap.project.review.importLocalPacket': false,
    'cap.project.review.exportLocalPacket': false,
    'cap.project.review.openDocxReviewPreviewSession': false,
    'cap.project.review.openComments': true,
    'cap.project.review.clearSession': false,
    'cap.project.review.cancelOperation': true,
    'cap.project.plan.flowSave': false,
    'cap.project.review.exportMarkdown': false,
    'cap.project.docx.previewLocalFile': false,
    'cap.project.docx.previewImportPlan': false,
    'cap.project.docx.importSafeCreate': false,
    'cap.project.txt.previewLocalFile': false,
    'cap.project.txt.importSafeCreate': false,
    'cap.project.export.docxMin': false,
    'cap.project.export.pdfV1': false,
    'cap.project.export.fullArchiveV1': false,
    'cap.project.import.fullArchiveV1': false,
    'cap.project.import.markdownV1': false,
    'cap.project.import.docxV1': false,
    'cap.project.import.txtV1': false,
    'cap.project.export.markdownV1': false,
    'cap.project.flow.openV1': false,
    'cap.project.flow.saveV1': false,
    'cap.ui.theme.set': false,
    'cap.ui.font.set': false,
    'cap.ui.fontSize.set': false,
  }),
});

function makeCapabilityError(code, op, reason, details) {
  const error = { code, op, reason };
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    error.details = details;
  }
  return error;
}

function normalizePlatformId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isDomainCommandId(commandId) {
  return commandId.startsWith('project.')
    || commandId.startsWith('atlas.')
    || commandId.startsWith('idea.')
    || commandId.startsWith('meaning.')
    || commandId.startsWith('cmd.project.');
}

const TIPTAP_RICH_COMMAND_IDS = new Set([
  'cmd.project.format.toggleBold',
  'cmd.project.format.toggleItalic',
  'cmd.project.format.toggleUnderline',
  'cmd.project.format.textColorPicker',
  'cmd.project.format.highlightColorPicker',
  'cmd.project.list.toggleBullet',
  'cmd.project.list.toggleOrdered',
  'cmd.project.list.clear',
  'cmd.project.insert.linkPrompt',
]);

function normalizeEditorMode(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function resolveEditorMode(input, options) {
  const fromInput = normalizeEditorMode(input && input.editorMode);
  if (fromInput) return fromInput;

  const fromOption = normalizeEditorMode(options && options.editorMode);
  if (fromOption) return fromOption;

  const defaultMode = normalizeEditorMode(options && options.defaultEditorMode);
  if (defaultMode) return defaultMode;

  return '';
}

function resolvePlatformId(input, options) {
  const fromInput = normalizePlatformId(input && input.platformId);
  if (fromInput) return fromInput;

  const fromOption = normalizePlatformId(options && options.platformId);
  if (fromOption) return fromOption;

  const defaultPlatform = normalizePlatformId(options && options.defaultPlatformId);
  if (defaultPlatform) return defaultPlatform;

  const fromEnv = normalizePlatformId(process && process.env ? process.env.CAPABILITY_PLATFORM_ID : '');
  if (fromEnv) return fromEnv;

  return 'node';
}

function hasEntitlementInput(input, options) {
  const inputSource = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const optionSource = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  return Object.prototype.hasOwnProperty.call(inputSource, 'entitlementState')
    || Object.prototype.hasOwnProperty.call(inputSource, 'entitlementTier')
    || Object.prototype.hasOwnProperty.call(inputSource, 'tier')
    || Object.prototype.hasOwnProperty.call(inputSource, 'plan')
    || Object.prototype.hasOwnProperty.call(optionSource, 'entitlementState')
    || Object.prototype.hasOwnProperty.call(optionSource, 'entitlementTier')
    || Object.prototype.hasOwnProperty.call(optionSource, 'defaultEntitlementTier');
}

function resolveEntitlementInput(input, options) {
  const inputSource = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const optionSource = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  return {
    ...(optionSource.entitlementState && typeof optionSource.entitlementState === 'object' && !Array.isArray(optionSource.entitlementState)
      ? optionSource.entitlementState
      : {}),
    entitlementTier: inputSource.entitlementTier
      || inputSource.tier
      || inputSource.plan
      || optionSource.entitlementTier
      || optionSource.defaultEntitlementTier
      || '',
    entitlementState: inputSource.entitlementState || optionSource.entitlementState || undefined,
    profileId: inputSource.profileId || inputSource.toolbarProfile || optionSource.profileId || optionSource.toolbarProfile || '',
  };
}

export function enforceCapabilityForCommand(commandId, input = {}, options = {}) {
  if (typeof commandId !== 'string' || commandId.length === 0) {
    return {
      ok: false,
      error: makeCapabilityError('E_CAPABILITY_ENFORCEMENT_MISSING', 'unknown', 'COMMAND_ID_INVALID'),
    };
  }

  const capabilityId = CAPABILITY_BINDING[commandId];
  if (!capabilityId) {
    if (isDomainCommandId(commandId)) {
      return {
        ok: false,
        error: makeCapabilityError(
          'E_CAPABILITY_ENFORCEMENT_MISSING',
          commandId,
          'CAPABILITY_ENFORCEMENT_MISSING',
          { commandId },
        ),
      };
    }
    return { ok: true };
  }

  const platformId = resolvePlatformId(input, options);
  if (!platformId) {
    return {
      ok: false,
      error: makeCapabilityError(
        'E_PLATFORM_ID_REQUIRED',
        commandId,
        'PLATFORM_ID_REQUIRED',
        { commandId, capabilityId },
      ),
    };
  }

  const platformCapabilities = CAPABILITY_MATRIX[platformId];
  if (!platformCapabilities || typeof platformCapabilities !== 'object') {
    return {
      ok: false,
      error: makeCapabilityError(
        'E_UNSUPPORTED_PLATFORM',
        commandId,
        'UNSUPPORTED_PLATFORM',
        { platformId, capabilityId, commandId },
      ),
    };
  }

  if (!(capabilityId in platformCapabilities)) {
    return {
      ok: false,
      error: makeCapabilityError(
        'E_CAPABILITY_MISSING',
        commandId,
        'CAPABILITY_MISSING',
        { platformId, capabilityId, commandId },
      ),
    };
  }

  if (platformCapabilities[capabilityId] !== true) {
    return {
      ok: false,
      error: makeCapabilityError(
        'E_CAPABILITY_DISABLED_FOR_COMMAND',
        commandId,
        'CAPABILITY_DISABLED_FOR_COMMAND',
        { platformId, capabilityId, commandId },
      ),
    };
  }

  if (TIPTAP_RICH_COMMAND_IDS.has(commandId) && resolveEditorMode(input, options) !== 'tiptap') {
    return {
      ok: false,
      error: makeCapabilityError(
        'E_CAPABILITY_DISABLED_FOR_COMMAND',
        commandId,
        'EDITOR_MODE_UNSUPPORTED',
        { platformId, capabilityId, commandId, editorMode: resolveEditorMode(input, options) || 'unknown' },
      ),
    };
  }

  if (hasEntitlementInput(input, options)) {
    const entitlement = resolveCommandEntitlement(commandId, resolveEntitlementInput(input, options));
    if (!entitlement.available) {
      return {
        ok: false,
        error: makeCapabilityError(
          'E_CAPABILITY_DISABLED_FOR_ENTITLEMENT',
          commandId,
          entitlement.reason || 'CAPABILITY_DISABLED_FOR_ENTITLEMENT',
          {
            platformId,
            capabilityId,
            commandId,
            entitlementTier: entitlement.state.tier,
            access: entitlement.access,
          },
        ),
      };
    }
  }

  return { ok: true };
}
