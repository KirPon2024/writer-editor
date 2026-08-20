import {
  applyTiptapCharacterStyle,
  applyTiptapParagraphStyle,
  focusTiptapSurface,
  getTiptapDocumentSnapshot,
  getTiptapFormattingState,
  getTiptapSelectionOffsets,
  getTiptapPlainText,
  initTiptap,
  redoTiptap,
  runTiptapFormatCommand,
  setTiptapDocumentSnapshot,
  setTiptapFormattingStateHandler,
  setTiptapSelectionOffsets,
  setTiptapPlainText,
  setTiptapRuntimeHandlers,
  undoTiptap,
} from './tiptap/index.js';
import { createCommandRegistry } from './commands/registry.mjs';
import { createCommandRunner } from './commands/runCommand.mjs';
import { enforceCapabilityForCommand } from './commands/capabilityPolicy.mjs';
import { listCommandCatalog } from './commands/command-catalog.v1.mjs';
import {
  COMMAND_IDS,
  EXTRA_COMMAND_IDS,
  UI_COMMAND_IDS,
  registerProjectCommands,
} from './commands/projectCommands.mjs';
import { createCoreDomainEventProductPort } from '../product/domainEventPort.mjs';
import { COMMAND_BUS_ROUTE, runCommandThroughBus } from './commands/commandBusGuard.mjs';
import { createPaletteDataProvider } from './commands/palette-groups.v1.mjs';
import { isAtlasRelationReviewActionCommandId } from './commands/atlasRelationReviewActions.mjs';
import {
  buildFlowModeKickoffStatus,
  buildFlowModeCoreStatus,
  buildFlowModeReopenBlockedStatus,
  buildFlowModeM9KickoffStatus,
  buildFlowModeM9CoreSaveErrorStatus,
  buildFlowModeM9NextNoopSaveStatus,
  buildFlowProjectionSavePayload,
  buildFlowSavePayload,
  composeFlowDocument,
  composeFlowReadProjection,
  findFlowProjectionSceneAtOffset,
  nextSceneCaretAtBoundary,
  previousSceneCaretAtBoundary,
} from './commands/flowMode.mjs';
import {
  composeObservablePayload,
  parseObservablePayload,
} from './documentContentEnvelope.mjs';
import {
  createDefaultBookProfile,
  normalizeBookProfile,
} from '../core/bookProfile.mjs';
import {
  buildSettingsAggregation,
  summarizeSettingsAggregation,
} from './settings/settingsAggregator.mjs';
import {
  PX_PER_MM_AT_ZOOM_1,
  resolvePageLayoutMetrics,
} from '../core/pageLayoutMetrics.mjs';
import centralSheetStripProofDecision from './centralSheetStripProofDecision.js';
import {
  buildLeftRailPresentationTree,
  getLeftRailPresentationExpandKey,
  getLeftRailPresentationKind,
  isLeftRailPresentationDefaultExpanded,
  resolveLeftRailActiveReveal,
} from './leftRailPresentationModel.mjs';
import {
  applyNavigatorSelection,
  buildNavigatorSelectionDescriptor,
  createNavigatorSelectionState,
  moveNavigatorFocus,
  reconcileNavigatorSelection,
} from './navigatorSelectionModel.mjs';
import {
  applyPreviewChromeCssVars,
  createPreviewChromeState,
} from './previewChrome.mjs';
import {
  buildVirtualViewportWindowMathContract,
  buildCachedLayoutPreviewSnapshot,
  createLayoutPreviewSnapshotCache,
  createLayoutPreviewState,
  renderLayoutPreviewSnapshot,
} from './layoutPreview.mjs';
import { buildLargePayloadLineSafeRows } from './largePayloadLineWrap.mjs';
import {
  createRepoGroundedDesignOsBrowserRuntime,
  applyAtlasFeatureSurfaceBinding,
  ATLAS_DESIGN_OS_SLOT_CATALOG_V1,
  buildLayoutPatchFromSpatialState,
  buildSidebarLayoutModel,
  buildSpatialStateFromLayoutSnapshot,
  deriveSidebarViewportMode,
  getAtlasFeatureSurfaceBinding,
  LEFT_RAIL_COLLAPSED_WIDTH,
  RIGHT_RAIL_COLLAPSED_WIDTH,
  resolveAtlasFeatureDesignOsSlots,
  YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1,
} from './design-os/index.mjs';
import {
  getToolbarFunctionCatalogEntryById,
  listLiveToolbarFunctionCatalogEntries,
} from './toolbar/toolbarFunctionCatalog.mjs';
import {
  consumeLegacyConfiguratorBuckets,
  createCanonicalMinimalToolbarProfileState,
  createEphemeralBaselineToolbarProfileState,
  createToolbarProfileState,
  getToolbarProfileStorageKey,
  isImplicitExpandedToolbarProfileState,
  resolveToolbarProfileStateForProjectSwitch,
  writeToolbarProfileState,
} from './toolbar/toolbarProfileState.mjs';
import workspaceQueryRegistry from '../shared/workspaceQueryRegistry.cjs';
import {
  MANUAL_MAP_VIEW_INTENT,
  normalizeManualMapViewState,
  reduceManualMapViewIntent,
} from '../derived/mindmap/manualMapInteraction.mjs';
import { buildManualMapViewportPlan } from '../derived/mindmap/manualMapViewportPlanner.mjs';
import {
  acceptManualMapLayoutResult,
  createManualMapLayoutJob,
  runManualMapLayoutJob,
} from '../derived/mindmap/manualMapLayoutScheduler.mjs';
import {
  buildManualMapListParityModel,
  reduceManualMapListKeyboardIntent,
} from '../derived/mindmap/manualMapListKeyboardParity.mjs';

const {
  WORKSPACE_QUERY_IDS,
  WORKSPACE_QUERY_ID_SET,
  WORKSPACE_QUERY_RECORDS,
} = workspaceQueryRegistry;
import * as toolbarRuntimeProjectionModule from './toolbar/toolbarRuntimeProjection.mjs';
import uiErrorMapDoc from '../../docs/OPS/STATUS/UI_ERROR_MAP.json';

const {
  resolveCentralSheetStripProofDecision,
} = centralSheetStripProofDecision;

const MANUAL_MAP_SVG_NS = 'http://www.w3.org/2000/svg';
const MANUAL_MAP_VIEWPORT_LIMITS = Object.freeze({
  overscanPx: 220,
  maxNodes: 600,
  maxEdges: 900,
  labelZoomThreshold: 0.55,
});
const MANUAL_MAP_DEFAULT_VIEWPORT = Object.freeze({
  x: -420,
  y: -260,
  width: 840,
  height: 520,
  zoom: 1,
});
const MANUAL_MAP_LAYOUT_MODES = Object.freeze({
  MANUAL: 'manual-fixed-position',
  HIERARCHY: 'hierarchy-derived-presentation',
});

const isTiptapMode = window.__USE_TIPTAP === true;
const editor = document.getElementById('editor');
if (isTiptapMode) {
  initTiptap(editor, {
    attachIpc: false,
    onContentParseIssue: handleDocumentContentParseIssue,
  });
}

function isEditorPasteTargetFocused() {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement) || typeof activeElement.closest !== 'function') {
    return false;
  }
  const proseMirror = activeElement.closest('.ProseMirror');
  return Boolean(proseMirror instanceof HTMLElement && proseMirror.isContentEditable && proseMirror.contains(activeElement));
}

function notifyEditorPasteFocusState() {
  if (!window.electronAPI || typeof window.electronAPI.notifyEditorPasteFocusState !== 'function') {
    return;
  }
  window.electronAPI.notifyEditorPasteFocusState(isEditorPasteTargetFocused());
}

if (window.electronAPI && typeof window.electronAPI.notifyEditorPasteFocusState === 'function') {
  document.addEventListener('focusin', notifyEditorPasteFocusState);
  document.addEventListener('focusout', () => {
    window.requestAnimationFrame(notifyEditorPasteFocusState);
  });
  window.addEventListener('blur', () => {
    window.electronAPI.notifyEditorPasteFocusState(false);
  });
  notifyEditorPasteFocusState();
}
const statusElement = document.getElementById('status');
const saveStateElement = document.querySelector('[data-save-state]');
const warningStateElement = document.querySelector('[data-warning-state]');
const perfHintElement = document.querySelector('[data-perf-hint]');
const appLayout = document.querySelector('.app-layout');
const emptyState = document.querySelector('.empty-state');
const editorPanel = document.querySelector('.editor-panel');
const editorPanelWrapper = document.querySelector('.editor-panel-wrapper');
const sidebar = document.querySelector('.sidebar');
const sidebarResizer = document.querySelector('[data-sidebar-resizer]');
const leftRailCollapseButton = document.querySelector('[data-left-rail-collapse]');
const leftRailOverlayBackdrop = document.querySelector('[data-left-rail-overlay-backdrop]');
const rightRailCollapseButton = document.querySelector('[data-right-rail-collapse]');
const rightSidebarResizer = document.querySelector('[data-right-sidebar-resizer]');
const mainContent = document.querySelector('.main-content');
const toolbar = document.querySelector('[data-toolbar]');
const toolbarShell = document.querySelector('[data-toolbar-shell]');
const leftToolbar = document.querySelector('[data-left-toolbar]');
const leftToolbarShell = document.querySelector('[data-left-toolbar-shell]');
const topWorkBar = document.querySelector('[data-top-work-bar]');
const configuratorPanel = document.querySelector('[data-configurator-panel]');
const configuratorMasterSection = document.querySelector('.configurator-panel__section--master');
const configuratorMinimalSection = document.querySelector('.configurator-panel__section--minimal');
const configuratorProfileSwitchButtons = Array.from(document.querySelectorAll('[data-toolbar-profile-switch]'));
const configuratorLibraryGrid = document.querySelector('.configurator-panel__grid');
const gridTriggerButton = document.querySelector('[data-grid-button]');
const configuratorBuckets = Array.from(document.querySelectorAll('[data-configurator-bucket]'));
const toolbarRotateHandles = Array.from(document.querySelectorAll('[data-toolbar-rotate-handle]'));
const toolbarWidthHandle = document.querySelector('[data-toolbar-width-handle]');
const toolbarScaleHandle = document.querySelector('[data-toolbar-scale-handle]');
const leftToolbarRotateHandles = Array.from(document.querySelectorAll('[data-left-toolbar-rotate-handle]'));
const leftToolbarWidthHandle = document.querySelector('[data-left-toolbar-width-handle]');
const leftToolbarCluster = document.querySelector('.left-floating-toolbar .work-bar__cluster');
const leftToolbarButtons = Array.from(document.querySelectorAll('.left-floating-toolbar .work-bar__button[data-action]'));
const leftToolbarSpacingMenu = document.querySelector('[data-left-toolbar-spacing-menu]');
const leftToolbarSpacingAction = document.querySelector('[data-left-toolbar-spacing-action]');
const toolbarTunableItems = Array.from(
  document.querySelectorAll(
    '.floating-toolbar [data-toolbar-item-key], .floating-toolbar .floating-toolbar__button[data-action]'
  )
);
const toolbarSpacingMenu = document.querySelector('[data-toolbar-spacing-menu]');
const toolbarSpacingAction = document.querySelector('[data-toolbar-spacing-action]');
const formatBoldButton = document.querySelector('[data-toolbar-item-key="format-bold"]');
const formatItalicButton = document.querySelector('[data-toolbar-item-key="format-italic"]');
const formatUnderlineButton = document.querySelector('[data-toolbar-item-key="format-underline"]');
const colorTextButton = document.querySelector('[data-toolbar-item-key="color-text"]');
const colorHighlightButton = document.querySelector('[data-toolbar-item-key="color-highlight"]');
const reviewCommentsButton = document.querySelector('[data-toolbar-item-key="review-comment"]');
const styleParagraphButton = document.querySelector('[data-toolbar-item-key="style-paragraph"]');
const styleCharacterButton = document.querySelector('[data-toolbar-item-key="style-character"]');
const paragraphTriggerButton = document.querySelector('[data-toolbar-item-key="paragraph-trigger"]');
const paragraphMenu = document.querySelector('[data-paragraph-menu]');
const listTriggerButton = document.querySelector('[data-toolbar-item-key="list-type"]');
const listMenu = document.querySelector('[data-list-menu]');
const insertLinkButton = document.querySelector('[data-toolbar-item-key="insert-link"]');
const toolbarColorPickerOverlay = document.querySelector('[data-toolbar-color-picker]');
const toolbarColorPickerTitle = document.querySelector('[data-toolbar-color-picker-title]');
const toolbarColorPickerSwatchHost = document.querySelector('[data-toolbar-color-picker-swatches]');
const toolbarColorPickerCloseButton = document.querySelector('[data-toolbar-color-picker-close]');
const toolbarStylesMenu = document.querySelector('[data-toolbar-styles-menu]');
const paragraphStyleOptionButtons = Array.from(document.querySelectorAll('[data-style-paragraph-option]'));
const characterStyleOptionButtons = Array.from(document.querySelectorAll('[data-style-character-option]'));
const listActionButtons = Array.from(document.querySelectorAll('[data-list-action]'));
let toolbarRuntimeRegistry = typeof toolbarRuntimeProjectionModule.createToolbarRuntimeRegistry === 'function'
  ? toolbarRuntimeProjectionModule.createToolbarRuntimeRegistry({
      toolbar,
    })
  : null;
const modeSwitcher = document.querySelector('[data-mode-switcher]');
const modeButtons = Array.from(document.querySelectorAll('[data-mode]'));
const flowViewModeButtons = Array.from(document.querySelectorAll('[data-flow-view-mode]'));
const leftRailHeader = document.querySelector('[data-left-rail-header]');
const leftRailActionButtons = Array.from(document.querySelectorAll('[data-left-rail-action]'));
const leftRailProjectControls = document.querySelector('[data-left-rail-project-controls]');
const leftRailSummary = document.querySelector('[data-left-rail-summary]');
const leftRailUnitCount = document.querySelector('[data-left-rail-unit-count]');
const leftRailWordCount = document.querySelector('[data-left-rail-word-count]');
const leftRailProgressLabel = document.querySelector('[data-left-rail-progress-label]');
const leftRailProgress = document.querySelector('[data-left-rail-progress]');
const leftRailProgressValue = document.querySelector('[data-left-rail-progress-value]');
const leftTabsHost = document.querySelector('[data-left-tabs]');
const leftTabButtons = Array.from(document.querySelectorAll('[data-left-tab]'));
const leftSearchPanel = document.querySelector('[data-left-search-panel]');
const leftSearchInput = document.querySelector('[data-left-search-input]');
const outlineListElement = document.querySelector('[data-outline-list]');
const notesLeftListElement = document.querySelector('[data-notes-left-list]');
const searchResultsElement = document.querySelector('[data-search-results]');
const projectSearchWorkspace = document.querySelector('[data-project-search-workspace]');
const projectSearchStatusElement = document.querySelector('[data-project-search-status]');
const projectSearchScopeSelect = document.querySelector('[data-project-search-scope]');
const projectSearchCaseCheckbox = document.querySelector('[data-project-search-case]');
const projectSearchWholeWordCheckbox = document.querySelector('[data-project-search-whole-word]');
const projectSearchResultsElement = document.querySelector('[data-project-search-results]');
const manualMapPlanWorkspace = document.querySelector('[data-manual-map-plan-workspace]');
const manualMapPlanHost = document.querySelector('[data-manual-map-plan-host]');
const rightSidebar = document.querySelector('[data-right-sidebar]');
const rightTabsHost = document.querySelector('[data-right-tabs]');
const rightTabButtons = Array.from(document.querySelectorAll('[data-right-tab]'));
const atlasReachabilityOpener = document.querySelector('[data-atlas-reachability-opener]');
const atlasReachabilityCaption = document.querySelector('[data-atlas-reachability-caption]');
const rightInspectorPanel = document.querySelector('[data-right-panel-inspector]');
const rightCommentsPanel = document.querySelector('[data-right-panel-comments]');
const rightHistoryPanel = document.querySelector('[data-right-panel-history]');
const rightAtlasPanel = document.querySelector('[data-right-panel-atlas]');
const rightInspectorTabButton = document.querySelector('[data-right-tab="inspector"]');
const atlasSurfaceNav = document.querySelector('[data-atlas-surface-nav]');
const atlasSurfaceButtons = Array.from(document.querySelectorAll('[data-atlas-surface-button]'));
const atlasSurfaceShells = Array.from(document.querySelectorAll('[data-atlas-surface-shell]'));
const sceneHistoryHost = document.querySelector('[data-scene-history-host]');
const reviewSurfaceHost = document.querySelector('[data-review-surface-host]');
const atlasJourneyHost = document.querySelector('[data-atlas-journey-host]');
const manualMapWorkbenchHost = document.querySelector('[data-manual-map-workbench-host]');
const projectionInspectorHost = document.querySelector('[data-projection-inspector-host]');
const atlasOverviewHost = document.querySelector('[data-atlas-overview-host]');
const atlasEntityDossierHost = document.querySelector('[data-atlas-entity-dossier-host]');
const atlasRelationDossierHost = document.querySelector('[data-atlas-relation-dossier-host]');
const atlasMatricesHost = document.querySelector('[data-atlas-matrices-host]');
const atlasHeatmapShell = document.querySelector('[data-atlas-heatmap-shell]');
const atlasHeatmapHost = document.querySelector('[data-atlas-heatmap-host]');
const atlasTemporalLayoutShell = document.querySelector('[data-atlas-temporal-layout-shell]');
const atlasTemporalLayoutHost = document.querySelector('[data-atlas-temporal-layout-host]');
const atlasContinuityLedgerShell = document.querySelector('[data-atlas-continuity-ledger-shell]');
const atlasContinuityLedgerHost = document.querySelector('[data-atlas-continuity-ledger-host]');
const atlasReportsHost = document.querySelector('[data-atlas-reports-host]');
const atlasDiagnosticsHost = document.querySelector('[data-atlas-diagnostics-host]');
const atlasCurrentSceneHost = document.querySelector('[data-atlas-current-scene-host]');
const inspectorCommentsAction = document.querySelector('[data-inspector-comments-action]');
const inspectorFocusStatus = document.querySelector('[data-inspector-focus-status]');
const inspectorMarginsValue = document.querySelector('[data-inspector-margins]');
const inspectorEmptyState = document.querySelector('[data-inspector-empty-state]');
const inspectorContextKind = document.querySelector('[data-inspector-context-kind]');
const inspectorMetaContextValue = document.querySelector('[data-inspector-meta-context]');
const inspectorMetaStatusValue = document.querySelector('[data-inspector-meta-status]');
const inspectorMetaWordCountValue = document.querySelector('[data-inspector-meta-word-count]');
const inspectorMetaSynopsisValue = document.querySelector('[data-inspector-meta-synopsis]');
const inspectorMetaTagsValue = document.querySelector('[data-inspector-meta-tags]');
const inspectorMetaModifiedValue = document.querySelector('[data-inspector-meta-modified]');
const inspectorSceneSections = Array.from(document.querySelectorAll('[data-inspector-scene-section]'));
const inspectorSceneDetails = document.querySelector('[data-inspector-scene-details]');
const inspectorDocumentSummary = document.querySelector('[data-inspector-document-summary]');
const inspectorDocumentTypeValue = document.querySelector('[data-inspector-document-type]');
const inspectorDocumentWordCountValue = document.querySelector('[data-inspector-document-word-count]');
const inspectorDocumentModifiedValue = document.querySelector('[data-inspector-document-modified]');
const inspectorDetailsShowLabel = document.querySelector('[data-inspector-details-show]');
const inspectorDetailsHideLabel = document.querySelector('[data-inspector-details-hide]');
const previewChromeFormatValueElement = Array.from(document.querySelectorAll('.right-rail-form-row')).find((row) => {
  const key = row.querySelector('.right-rail-form-key');
  return key && key.textContent && key.textContent.trim() === 'Формат';
})?.querySelector('.right-rail-form-value');
const previewFormatButtons = Array.from(document.querySelectorAll('[data-preview-format-option]'));
const previewOrientationButtons = Array.from(document.querySelectorAll('[data-preview-orientation-option]'));
const layoutPreviewToggleButton = document.querySelector('[data-layout-preview-toggle]');
const layoutPreviewFrameToggleButton = document.querySelector('[data-layout-preview-frame-toggle]');
const inspectorSnapshotElement = document.querySelector('[data-inspector-snapshot]');
const wordCountElement = document.querySelector('[data-word-count]');
const zoomValueElement = document.querySelector('[data-zoom-value]');
const styleSelect = document.querySelector('[data-style-select]');
const fontSelect = document.querySelector('[data-font-select]');
const weightSelect = document.querySelector('[data-weight-select]');
const sizeSelect = document.querySelector('[data-size-select]');
const lineHeightSelect = document.querySelector('[data-line-height-select]');
const fontDisplay = document.querySelector('[data-font-display]');
const weightDisplay = document.querySelector('[data-weight-display]');
const sizeDisplay = document.querySelector('[data-size-display]');
const lineHeightDisplay = document.querySelector('[data-line-height-display]');
const textStyleSelect = document.querySelector('[data-text-style-select]');
const themeDarkButton = document.querySelector('[data-action="theme-dark"]');
const themeLightButton = document.querySelector('[data-action="theme-light"]');
const wrapToggleButton = document.querySelector('[data-action="toggle-wrap"]');
const toolbarToggleButton = document.querySelector('[data-action="minimize"]');
const alignButtons = Array.from(document.querySelectorAll('[data-paragraph-alignment]'));
const treeContainer = document.querySelector('[data-tree]');
const metaPanel = document.querySelector('[data-meta-panel]');
const metaSynopsis = document.querySelector('[data-meta-synopsis]');
const metaStatus = document.querySelector('[data-meta-status]');
const metaTagPov = document.querySelector('[data-meta-tag="pov"]');
const metaTagLine = document.querySelector('[data-meta-tag="line"]');
const metaTagPlace = document.querySelector('[data-meta-tag="place"]');
const cardsList = document.querySelector('[data-cards-list]');
const addCardButton = document.querySelector('[data-action="add-card"]');
const contextMenu = document.querySelector('[data-context-menu]');
const cardModal = document.querySelector('[data-card-modal]');
const settingsModal = document.querySelector('[data-settings-modal]');
const settingsThemeSelect = document.querySelector('[data-settings-theme]');
const settingsWrapSelect = document.querySelector('[data-settings-wrap]');
const settingsSummary = document.querySelector('[data-settings-summary]');
const settingsSections = document.querySelector('[data-settings-sections]');
const settingsCloseButtons = Array.from(document.querySelectorAll('[data-settings-close]'));
const commandPaletteModal = document.querySelector('[data-command-palette-modal]');
const commandPaletteSearchInput = document.querySelector('[data-command-palette-search]');
const commandPaletteSummary = document.querySelector('[data-command-palette-summary]');
const commandPaletteList = document.querySelector('[data-command-palette-list]');
const commandPaletteCloseButtons = Array.from(document.querySelectorAll('[data-command-palette-close]'));
const recoveryModal = document.querySelector('[data-recovery-modal]');
const recoveryMessage = document.querySelector('[data-recovery-message]');
const recoveryCloseButtons = Array.from(document.querySelectorAll('[data-recovery-close]'));
const exportPreviewModal = document.querySelector('[data-export-preview-modal]');
const exportPreviewMessage = document.querySelector('[data-export-preview-message]');
const exportPreviewConfirmButtons = Array.from(document.querySelectorAll('[data-export-preview-confirm]'));
const exportPreviewCancelButtons = Array.from(document.querySelectorAll('[data-export-preview-cancel]'));
const exportSurfaceModal = document.querySelector('[data-export-surface-modal]');
const exportSurfaceStatus = document.querySelector('[data-export-surface-status]');
const exportSurfaceDetail = document.querySelector('[data-export-surface-detail]');
const exportSurfaceFormatButtons = Array.from(document.querySelectorAll('[data-export-surface-format]'));
const exportSurfaceCloseButtons = Array.from(document.querySelectorAll('[data-export-surface-close]'));
const selectedScenesTxtExportModal = document.querySelector('[data-selected-scenes-txt-export-modal]');
const selectedScenesTxtExportSummary = document.querySelector('[data-selected-scenes-txt-export-summary]');
const selectedScenesTxtExportList = document.querySelector('[data-selected-scenes-txt-export-list]');
const selectedScenesTxtExportConfirmButtons = Array.from(document.querySelectorAll('[data-selected-scenes-txt-export-confirm]'));
const selectedScenesTxtExportCancelButtons = Array.from(document.querySelectorAll('[data-selected-scenes-txt-export-cancel]'));
const importSurfaceModal = document.querySelector('[data-import-surface-modal]');
const importSurfaceStatus = document.querySelector('[data-import-surface-status]');
const importSurfaceDetail = document.querySelector('[data-import-surface-detail]');
const importSurfaceFormatButtons = Array.from(document.querySelectorAll('[data-import-surface-format]'));
const importSurfaceCloseButtons = Array.from(document.querySelectorAll('[data-import-surface-close]'));
const projectLibraryModal = document.querySelector('[data-project-library-modal]');
const projectLibraryList = document.querySelector('[data-project-library-list]');
const projectLibraryStatus = document.querySelector('[data-project-library-status]');
const projectLibraryNameInput = document.querySelector('[data-project-library-name]');
const projectLibraryCreateButton = document.querySelector('[data-project-library-create]');
const projectLibraryRefreshButtons = Array.from(document.querySelectorAll('[data-project-library-refresh]'));
const projectLibraryContinueButton = document.querySelector('[data-project-library-continue]');
const projectLibraryOpenButton = document.querySelector('[data-project-library-open]');
const projectLibraryRenameButton = document.querySelector('[data-project-library-rename]');
const projectLibraryDuplicateButton = document.querySelector('[data-project-library-duplicate]');
const projectLibraryMoveButton = document.querySelector('[data-project-library-move]');
const projectLibraryArchiveButton = document.querySelector('[data-project-library-archive]');
const projectLibraryTrashButton = document.querySelector('[data-project-library-trash]');
const projectLibraryRestoreButton = document.querySelector('[data-project-library-restore]');
const projectLibraryBackupButton = document.querySelector('[data-project-library-backup]');
const projectLibraryIntegrityButton = document.querySelector('[data-project-library-integrity]');
const projectLibraryCloseButtons = Array.from(document.querySelectorAll('[data-project-library-close]'));
const docxImportPreviewModal = document.querySelector('[data-docx-import-preview-modal]');
const docxImportPreviewMessage = document.querySelector('[data-docx-import-preview-message]');
const docxImportPreviewLoss = document.querySelector('[data-docx-import-preview-loss]');
const docxImportPreviewConfirmButtons = Array.from(document.querySelectorAll('[data-docx-import-preview-confirm]'));
const docxImportPreviewCancelButtons = Array.from(document.querySelectorAll('[data-docx-import-preview-cancel]'));
const diagnosticsModal = document.querySelector('[data-diagnostics-modal]');
const diagnosticsText = document.querySelector('[data-diagnostics-text]');
const diagnosticsCloseButtons = Array.from(document.querySelectorAll('[data-diagnostics-close]'));
const cardTitleInput = document.querySelector('[data-card-title]');
const cardTextInput = document.querySelector('[data-card-text]');
const cardTagsInput = document.querySelector('[data-card-tags]');
const cardSaveButtons = Array.from(document.querySelectorAll('[data-card-save]'));
const cardCancelButtons = Array.from(document.querySelectorAll('[data-card-cancel]'));
const notesWorkspace = document.querySelector('[data-notes-workspace]');
const notesStatusElement = document.querySelector('[data-notes-status]');
const notesCaptureForm = document.querySelector('[data-notes-capture-form]');
const notesCaptureTitle = document.querySelector('[data-notes-capture-title]');
const notesCaptureBody = document.querySelector('[data-notes-capture-body]');
const notesListElement = document.querySelector('[data-notes-list]');
const notesDetailEmpty = document.querySelector('[data-notes-detail-empty]');
const notesDetailContent = document.querySelector('[data-notes-detail-content]');
const notesDetailMeta = document.querySelector('[data-notes-detail-meta]');
const notesDetailTitle = document.querySelector('[data-notes-detail-title]');
const notesDetailBody = document.querySelector('[data-notes-detail-body]');
const notesSaveButton = document.querySelector('[data-notes-save]');
const notesAttachSceneButton = document.querySelector('[data-notes-attach-scene]');
const notesConvertSceneButton = document.querySelector('[data-notes-convert-scene]');
const notesDeleteButton = document.querySelector('[data-notes-delete]');
const notesRestoreButton = document.querySelector('[data-notes-restore]');
const TOOLBAR_COMPACT_CLASS = 'is-compact';
const TEXT_STYLE_DEFAULT = 'paragraph-none';
const ALIGNMENT_PREFIX_BY_ACTION = {
  'align-center': '::center:: ',
  'align-right': '::right:: ',
  'align-justify': '::justify:: ',
  'align-left': '',
};
const ALIGNMENT_MARKERS = ['::center:: ', '::right:: ', '::justify:: '];
const EDITOR_ZOOM_STORAGE_KEY = 'editorZoom';
const EDITOR_ZOOM_MIN = 0.5;
const EDITOR_ZOOM_MAX = 2.0;
const EDITOR_ZOOM_STEP = 0.05;
const EDITOR_ZOOM_DEFAULT = 1.0;
const FLOATING_TOOLBAR_STORAGE_KEY = 'yalkenLiteralStageAToolbarState';
const FLOATING_TOOLBAR_ITEM_OFFSETS_STORAGE_KEY = 'yalkenLiteralStageAToolbarItemOffsets';
const LEFT_FLOATING_TOOLBAR_STORAGE_KEY = 'yalkenLeftToolbarState';
const LEFT_TOOLBAR_BUTTON_OFFSETS_STORAGE_KEY = 'yalkenLeftToolbarButtonOffsets';
const SPATIAL_LAYOUT_STORAGE_KEY_PREFIX = 'yalkenSpatialLayout';
const SPATIAL_LAYOUT_VERSION = 1;
const SPATIAL_LAYOUT_DESKTOP_LEFT_BASELINE_WIDTH = 290;
const SPATIAL_LAYOUT_DESKTOP_RIGHT_BASELINE_WIDTH = 290;
const SPATIAL_LAYOUT_COMPACT_LEFT_BASELINE_WIDTH = 260;
const SPATIAL_LAYOUT_COMPACT_RIGHT_BASELINE_WIDTH = 260;
const SPATIAL_LAYOUT_MOBILE_LEFT_BASELINE_WIDTH = 240;
const SPATIAL_LAYOUT_MOBILE_RIGHT_BASELINE_WIDTH = 240;
const SAFE_RESET_BASELINE_THEME = 'light';
const SAFE_RESET_BASELINE_FONT_FAMILY = '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const SAFE_RESET_BASELINE_FONT_SIZE_PX = 12;
const SAFE_RESET_BASELINE_FONT_WEIGHT = 'light';
const SAFE_RESET_BASELINE_LINE_HEIGHT = '1.0';
const SAFE_RESET_BASELINE_VIEW_MODE = 'default';
const PROJECT_WORKSPACE_RESET_TABS = Object.freeze(['project', 'outline', 'search', 'roman']);
const PROJECT_TREE_QUERY_ID = WORKSPACE_QUERY_IDS.PROJECT_TREE;
const PROJECT_LIBRARY_QUERY_ID = WORKSPACE_QUERY_IDS.PROJECT_LIBRARY;
const COLLAB_SCOPE_LOCAL_QUERY_ID = WORKSPACE_QUERY_IDS.COLLAB_SCOPE_LOCAL;
const NOTES_WORKSPACE_QUERY_ID = WORKSPACE_QUERY_IDS.PROJECT_NOTES;
const PROJECT_SEARCH_QUERY_ID = WORKSPACE_QUERY_IDS.PROJECT_SEARCH;
const TOOLBAR_CONFIGURATOR_LIBRARY_COLUMN_COUNT = 4;
const TOOLBAR_CONFIGURATOR_LIBRARY_MIN_SLOT_COUNT = 20;
const TOOLBAR_CONFIGURATOR_LIBRARY_PLACEHOLDER_TEXT = 'New Slot';
const TOOLBAR_COLOR_PICKER_MODE_LABELS = Object.freeze({
  text: 'Text color',
  highlight: 'Highlight color',
});
const TOOLBAR_COLOR_PICKER_MODE_SWATCHES = Object.freeze({
  text: Object.freeze([
    Object.freeze({ value: '#1f1a15', label: 'Ink' }),
    Object.freeze({ value: '#8a3b2e', label: 'Brick' }),
    Object.freeze({ value: '#2f5f8a', label: 'Blue' }),
    Object.freeze({ value: '#2f6a4f', label: 'Green' }),
  ]),
  highlight: Object.freeze([
    Object.freeze({ value: '#ffdf20', label: 'Yellow' }),
    Object.freeze({ value: '#ffd6e7', label: 'Pink' }),
    Object.freeze({ value: '#cfe8ff', label: 'Sky' }),
    Object.freeze({ value: '#d8f0c2', label: 'Mint' }),
  ]),
});

let projectLibraryState = {
  loading: false,
  entries: [],
  selectedProjectId: '',
  statusText: 'Готово',
};
const TOOLBAR_STYLES_MENU_ANCHORS = Object.freeze({
  paragraph: 'paragraph',
  character: 'character',
});
const FLOATING_TOOLBAR_DRAG_THRESHOLD_PX = 6;
const FLOATING_TOOLBAR_ROTATE_THRESHOLD_PX = 30;
const FLOATING_TOOLBAR_SNAP_ZONE_PX = 30;
const FLOATING_TOOLBAR_CENTER_ANCHOR_PX = 30;
const FLOATING_TOOLBAR_ITEM_SNAP_THRESHOLD_PX = 10;
const FLOATING_TOOLBAR_VISIBLE_STRIP_PX = 56;
const FLOATING_TOOLBAR_SCALE_MIN = 0.5;
const FLOATING_TOOLBAR_SCALE_MAX = 2.0;
const FLOATING_TOOLBAR_SCALE_STEP = 0.05;
const FLOATING_TOOLBAR_PROJECTED_SCALE_HORIZONTAL_MIN = 0.8;
const FLOATING_TOOLBAR_PROJECTED_SCALE_HORIZONTAL_MAX = 1.15;
const FLOATING_TOOLBAR_PROJECTED_SCALE_VERTICAL_MIN = 0.75;
const FLOATING_TOOLBAR_PROJECTED_SCALE_VERTICAL_MAX = 1.35;
const FLOATING_TOOLBAR_WIDTH_SCALE_MIN = 0.1;
const FLOATING_TOOLBAR_WIDTH_SCALE_MAX = 2.0;
const FLOATING_TOOLBAR_METRIC_BASE_PX = Object.freeze({
  '--toolbar-chrome-gap-xxs': 4,
  '--toolbar-chrome-gap-xs': 6,
  '--toolbar-chrome-gap-sm': 8,
  '--toolbar-chrome-gap-md': 12,
  '--toolbar-chrome-gap-lg': 16,
  '--toolbar-chrome-row-height': 48,
  '--toolbar-chrome-pad-x': 24,
  '--toolbar-chrome-item-gap': 10,
  '--toolbar-chrome-group-gap': 20,
  '--toolbar-chrome-separator-gap': 12,
  '--toolbar-chrome-control-height': 28,
  '--toolbar-chrome-control-height-large': 32,
  '--toolbar-chrome-control-text-height': 32,
  '--toolbar-chrome-control-pad-x': 12,
  '--toolbar-chrome-chevron-gap': 8,
  '--toolbar-chrome-slot-icon': 28,
  '--toolbar-chrome-slot-icon-wide': 40,
  '--toolbar-chrome-slot-short': 56,
  '--toolbar-chrome-slot-medium': 72,
  '--toolbar-chrome-slot-long': 104,
  '--toolbar-chrome-slot-xlong': 136,
  '--toolbar-chrome-vertical-panel-width': 160,
  '--toolbar-chrome-vertical-pad': 12,
  '--toolbar-chrome-icon-size': 16,
  '--toolbar-chrome-utility-icon-size': 14,
  '--toolbar-chrome-caret-size': 10,
  '--toolbar-chrome-radius-button': 10,
  '--toolbar-chrome-radius-control': 10,
  '--floating-toolbar-control-font-size': 13,
  '--floating-toolbar-control-line-height': 17,
  '--floating-toolbar-display-icon-pad-x': 8,
  '--floating-toolbar-select-icon-size': 12,
  '--floating-toolbar-swatch-size': 14,
  '--floating-toolbar-swatch-radius': 4,
  '--floating-toolbar-list-caret-size': 8,
  '--floating-toolbar-vertical-field-pad-x': 10,
  '--floating-toolbar-separator-block-margin': 2,
});
const FLOATING_TOOLBAR_OPTICAL_METRIC_KEYS = new Set([
  '--toolbar-chrome-gap-xxs',
  '--toolbar-chrome-gap-xs',
  '--toolbar-chrome-gap-sm',
  '--toolbar-chrome-gap-md',
  '--toolbar-chrome-gap-lg',
  '--toolbar-chrome-pad-x',
  '--toolbar-chrome-item-gap',
  '--toolbar-chrome-group-gap',
  '--toolbar-chrome-separator-gap',
  '--toolbar-chrome-control-pad-x',
  '--toolbar-chrome-chevron-gap',
  '--toolbar-chrome-vertical-pad',
  '--toolbar-chrome-radius-button',
  '--toolbar-chrome-radius-control',
  '--floating-toolbar-display-icon-pad-x',
  '--floating-toolbar-swatch-radius',
  '--floating-toolbar-vertical-field-pad-x',
  '--floating-toolbar-separator-block-margin',
]);
const FONT_WEIGHT_PRESETS = Object.freeze({
  light: { weight: '300', stretch: 'normal', spacing: '0em' },
  regular: { weight: '400', stretch: 'normal', spacing: '0em' },
  semibold: { weight: '600', stretch: 'normal', spacing: '0em' },
  bold: { weight: '700', stretch: 'normal', spacing: '0em' },
  condensed: { weight: '400', stretch: 'condensed', spacing: '-0.02em' },
  'condensed-light': { weight: '300', stretch: 'condensed', spacing: '-0.015em' },
  'condensed-bold': { weight: '700', stretch: 'condensed', spacing: '-0.025em' },
});
const LEGACY_FONT_WEIGHT_PRESET_MAP = Object.freeze({
  '300': 'light',
  '400': 'regular',
  '500': 'semibold',
  '600': 'semibold',
  '700': 'bold',
});
let editorZoom = EDITOR_ZOOM_DEFAULT;
const isMac = navigator.platform.toUpperCase().includes('MAC');
let currentFontSizePx = 12;
let wordWrapEnabled = true;
let collabScopeLocal = false;
let currentMode = 'write';
let currentLeftTab = 'project';
let notesWorkspaceState = {
  state: 'idle',
  notes: [],
  counts: { total: 0, deleted: 0, inbox: 0 },
  selectedId: '',
  includeDeleted: false,
};
let currentRightTab = 'inspector';
let currentAtlasSurface = 'currentScene';
let pendingDocxImportPreviewValue = null;
let pendingDocxImportPreviewPlan = null;
let toolbarColorPickerState = {
  open: false,
  mode: 'text',
  selectedByMode: {
    text: '',
    highlight: '',
  },
};
let toolbarStylesMenuState = {
  open: false,
  anchor: TOOLBAR_STYLES_MENU_ANCHORS.paragraph,
  selectedByKind: {
    paragraph: '',
    character: '',
  },
};
let lastSearchQuery = '';
let projectSearchState = {
  state: 'idle',
  results: [],
  counts: { total: 0, returned: 0, sources: 0 },
  options: {},
  sequence: 0,
  selectedResultId: '',
  unavailableReason: '',
};
let projectSearchRefreshTimer = null;
let pendingProjectSearchJump = null;
let sceneHistoryState = {
  state: 'empty',
  snapshots: [],
  selectedSnapshot: null,
  selectedSnapshotId: '',
  sequence: 0,
  unavailableReason: '',
  restoreReceiptId: '',
  restoreState: 'idle',
};
let atlasOverviewState = {
  state: 'empty',
  projectId: '',
  summary: {
    sceneCount: 0,
    entityCount: 0,
    observationCount: 0,
    activeObservationCount: 0,
    evidenceAnchorCount: 0,
    cooccurrencePairCount: 0,
    graphNodeCount: 0,
    graphEdgeCount: 0,
    graphClusterCount: 0,
    evidenceHealth: 'empty',
  },
  topEntities: [],
  topRelations: [],
  sceneCoverage: [],
  graphPreview: { clusters: [] },
  degradedCapabilities: [],
  unavailableReason: '',
};
let atlasEntityDossierState = {
  state: 'empty',
  projectId: '',
  requestedEntityId: '',
  selectedEntityId: '',
  entity: null,
  aliases: [],
  summary: {
    observationCount: 0,
    activeObservationCount: 0,
    suppressedObservationCount: 0,
    sceneCount: 0,
    aliasCount: 0,
    relationCount: 0,
    evidenceRowCount: 0,
    sourceRecordEvidenceCount: 0,
    reviewRequiredEvidenceCount: 0,
    reattachedEvidenceCount: 0,
    currentEvidenceCount: 0,
    evidenceHealth: 'empty',
  },
  relationRows: [],
  absenceIntervals: [],
  evidenceLedger: { rows: [] },
  unavailableReason: '',
};
let atlasSelectedEntityId = '';
let atlasRelationDossierState = {
  state: 'empty',
  projectId: '',
  requestedPairId: '',
  requestedLeftEntityId: '',
  requestedRightEntityId: '',
  selectedPairId: '',
  relation: null,
  summary: {
    sceneCount: 0,
    occurrenceCount: 0,
    evidenceRowCount: 0,
    leftEvidenceCount: 0,
    rightEvidenceCount: 0,
    reviewRequiredEvidenceCount: 0,
    absenceIntervalCount: 0,
    actionCount: 0,
    availableActionCount: 0,
    evidenceHealth: 'empty',
    dossierHash: '',
  },
  evidencePacket: { rows: [] },
  timelineRows: [],
  absenceContext: [],
  contextualReviewActions: { actions: [] },
  unavailableReason: '',
};
let atlasSelectedRelation = {
  pairId: '',
  leftEntityId: '',
  rightEntityId: '',
};
let atlasMatricesState = {
  state: 'empty',
  projectId: '',
  summary: {
    entityCount: 0,
    sceneCount: 0,
    entitySceneCellCount: 0,
    relationCellCount: 0,
    entitySceneListRowCount: 0,
    relationListRowCount: 0,
    omittedEntityCount: 0,
    omittedSceneCount: 0,
    omittedEntitySceneCellCount: 0,
    omittedRelationCellCount: 0,
    matrixHash: '',
  },
  entitySceneMatrix: { columns: [], rows: [], rowAxis: {}, columnAxis: {} },
  relationMatrix: { columns: [], rows: [], rowAxis: {}, columnAxis: {} },
  listParity: { entitySceneRows: [], relationRows: [] },
  accessibilityContract: { keyboardNavigation: { supportedKeys: [] } },
  largeProjectBudgetProof: {},
  unavailableReason: '',
};
let atlasMatricesKeyboardBound = false;
let atlasHeatmapExplicitOpen = false;
let atlasHeatmapState = {
  state: 'empty',
  projectId: '',
  summary: {
    entityCount: 0,
    sceneCount: 0,
    renderedTileCount: 0,
    omittedTileCount: 0,
    maxObservationCount: 0,
    heatmapHash: '',
    matrixHash: '',
  },
  tilePacket: {
    rows: [],
    columns: [],
    tiles: [],
    rowAxis: {},
    columnAxis: {},
  },
  legend: { bands: [], degradedVisualFallback: {} },
  degradedVisualFallback: [],
  viewportBudgetProof: {},
  unavailableReason: '',
};
let atlasTemporalLayoutExplicitOpen = false;
let atlasTemporalLayoutKeyboardBound = false;
let atlasTemporalLayoutState = {
  state: 'empty',
  projectId: '',
  summary: {
    sceneCount: 0,
    anchoredSceneCount: 0,
    unknownTemporalSceneCount: 0,
    relationSegmentCount: 0,
    selectedSceneCount: 0,
    layoutHash: '',
    sourceHash: '',
  },
  layoutPacket: {
    axis: { min: 0, max: 0, step: 1 },
    events: [],
    segments: [],
  },
  timeSliderState: {
    min: 0,
    max: 0,
    step: 1,
    value: 0,
    selectedSceneIds: [],
    rangeLabel: 'empty',
  },
  listParity: { rows: [], equivalentToTimeline: true, omittedRowCount: 0 },
  keyboardContract: { supportedKeys: [] },
  largeProjectBudgetProof: {},
  unavailableReason: '',
};
let atlasContinuityLedgerExplicitOpen = false;
let atlasContinuityLedgerState = {
  state: 'empty',
  projectId: '',
  summary: {
    findingCount: 0,
    outcomeCount: 0,
    rowCount: 0,
    visibleRowCount: 0,
    omittedRowCount: 0,
    evidenceAnchorCount: 0,
    correctionRouteCount: 0,
    degradedRowCount: 0,
    surfaceHash: '',
    sourceHash: '',
  },
  rows: [],
  listParity: { rows: [], omittedRowCount: 0 },
  keyboardContract: {},
  unavailableReason: '',
};
let atlasReportsState = {
  state: 'empty',
  projectId: '',
  summary: {
    reportCount: 0,
    savedQueryCount: 0,
    staleSavedQueryCount: 0,
    exportSafeRowCount: 0,
    reportHash: '',
    sourceHash: '',
  },
  localReportPacket: { sections: [] },
  savedQueries: [],
  exportSafeSummary: { rows: [] },
  unavailableReason: '',
};
let atlasDiagnosticsState = {
  state: 'empty',
  projectId: '',
  summary: {
    surfaceCount: 0,
    degradedSurfaceCount: 0,
    degradedCapabilityCount: 0,
    acceptanceGateCount: 0,
    passedAcceptanceGateCount: 0,
    stageAcceptance: 'empty',
    diagnosticsHash: '',
  },
  surfaceFallbackInventory: { rows: [] },
  degradedCapabilityReport: { rows: [] },
  stageAcceptanceProof: { gates: [], pass: false },
  finalUiAuditReceipt: { finalBar: { status: 'EMPTY' } },
  heuristicReviewReceipt: { usabilityScoreJudged: 0, grade: 'F' },
  unavailableReason: '',
};
let atlasCurrentSceneState = {
  state: 'empty',
  projectId: '',
  sceneId: '',
  sceneTitle: '',
  summary: { entityCount: 0, mentionCount: 0 },
  entities: [],
  mentions: [],
  unavailableReason: '',
};
let atlasJourneyState = {
  status: 'idle',
  lastCommandId: '',
  lastResult: '',
  commandSeq: 0,
};
let atlasStableUiIdSeq = 0;
let atlasJourneyDraft = {
  entityName: '',
  aliasValue: '',
  sourceEntityId: '',
  targetEntityId: '',
  mentionId: '',
  decisionId: '',
  decisionEvidenceAnchor: null,
  suppressionId: '',
  reassignmentId: '',
  mergeOperationId: '',
  restoreOperationId: '',
  reattachmentId: '',
};
let atlasTemporalAuthorDraft = {
  calendarId: 'calendar-r3-c02-story',
  calendarName: 'R3 C02 story calendar',
  storyDate: '2026-07-31',
  narrativeDay: '0',
  note: 'R3 C02 visible temporal anchor',
  anchorId: '',
};
let atlasContinuityAuthorDraft = {
  ledgerKind: 'promise',
  promiseState: 'open',
  entityId: '',
  mentionId: '',
  factLabel: 'R3 C02 continuity promise',
  factValue: 'visible UI command path',
  note: 'R3 C02 visible continuity fact',
  factId: '',
};
let atlasReportsAuthorDraft = {
  savedQueryId: 'saved-query-r3-c02-visible',
  name: 'R3 C02 visible saved query',
  reportType: 'overview',
};
let manualMapWorkbenchState = {
  state: 'empty',
  projectId: '',
  mapId: '',
  mapRows: [],
  graph: { nodes: [], edges: [], groups: [] },
  listParity: { rows: [], counts: { rows: 0, nodes: 0, edges: 0, groups: 0 } },
  summary: { mapCount: 0, nodeCount: 0, edgeCount: 0, groupCount: 0, listRowCount: 0 },
  unavailableReason: '',
};
let manualMapTransientViewState = normalizeManualMapViewState({
  viewport: MANUAL_MAP_DEFAULT_VIEWPORT,
}, {});
let manualMapListState = { activeRowId: '' };
let manualMapLayoutMode = MANUAL_MAP_LAYOUT_MODES.MANUAL;
let manualMapLayoutGeneration = 0;
let manualMapSearchQuery = '';
let manualMapPinnedNodeIds = new Set();
let manualMapDragState = null;
let manualMapCommandDraft = null;
let manualMapPortabilityCommandState = {
  status: '',
  exportJsonSha256: '',
  exportMapId: '',
  imageEvidenceHash: '',
  pdfTypedLoss: '',
  importMapId: '',
  lastCommandId: '',
};
let projectionInspectorState = {
  state: 'empty',
  projectId: '',
  manifests: [],
  projectionStates: [],
  summary: { manifestCount: 0, readyCount: 0, emptyCount: 0, unavailableCount: 0 },
  unavailableReason: '',
};
let plainTextBuffer = '';
const activeTab = 'roman';
let currentDocumentId = null;
let currentDocumentKind = null;
let currentDocumentTitle = '';
let currentProjectId = '';
let activeDocumentRevealRequested = false;
let navigatorSelectionState = createNavigatorSelectionState();
let spatialLayoutState = null;
let leftRailAdaptiveMode = '';
let leftRailOverlayOpen = false;
let leftRailOverlayReturnFocus = null;
let rightRailAdaptiveMode = '';
let rightRailOverlayOpen = false;
let rightRailOverlayReturnFocus = null;
let flowModeState = {
  active: false,
  scenes: [],
  projection: null,
  dirty: false,
};
let reviewSurfaceState = null;
let reviewSurfaceExactTextApplyTransientState = null;
let stage10LifecycleSurfaceState = {
  status: 'idle',
  lastCommandId: '',
  lastReceiptId: '',
  lastReason: '',
  runningCommandId: '',
};
let stage10ProductState = null;
let reviewSurfaceApplyActionListenerBound = false;
let metaEnabled = false;
let currentCards = [];
let treeRoot = null;
let currentMeta = {
  synopsis: '',
  status: 'черновик',
  tags: { pov: '', line: '', place: '' }
};
let currentMetadataBaselineHash = '';
let metadataUpdateDebounceId = null;
let metadataUpdatePending = false;
let expandedNodesByTab = new Map();
let autoSaveTimerId = null;
let floatingToolbarState = {
  x: 0,
  y: 0,
  isVertical: false,
  isDetached: false,
  scale: 1,
  widthScale: 1,
  dockedWidthScale: 1,
  freeWidthScale: 1,
  toolbarHeight: 0,
};
let leftFloatingToolbarState = {
  x: 0,
  y: 0,
  isVertical: false,
  isDetached: false,
  widthScale: 1,
};
let floatingToolbarInteractionState = {
  mode: null,
  active: false,
  startX: 0,
  startY: 0,
  origin: null,
};
let leftFloatingToolbarInteractionState = {
  mode: null,
  active: false,
  startX: 0,
  startY: 0,
  origin: null,
};
let floatingToolbarHandlesVisible = false;
let floatingToolbarSuppressClickOnce = false;
let toolbarItemSuppressClickOnce = false;
let toolbarSpacingTuningMode = false;
let toolbarAnchorFrameId = 0;
let floatingToolbarMetricScaleSignature = '';
let floatingToolbarScaleFrameId = 0;
let pendingFloatingToolbarScaleState = null;
let toolbarItemOffsets = {};
let toolbarItemOffsetDragState = {
  active: false,
  item: null,
  key: '',
  startX: 0,
  originOffset: 0,
  moved: false,
};
let leftFloatingToolbarHandlesVisible = false;
let leftFloatingToolbarSuppressClickOnce = false;
let leftToolbarButtonSuppressClickOnce = false;
let leftToolbarSpacingTuningMode = false;
let leftToolbarAnchorFrameId = 0;
let leftToolbarButtonOffsets = {};
let leftToolbarButtonOffsetDragState = {
  active: false,
  button: null,
  action: '',
  startX: 0,
  originOffset: 0,
  moved: false,
};
const TOOLBAR_CONFIGURATOR_DEFAULT_ACTIVE_PROFILE = 'minimal';
const TOOLBAR_CONFIGURATOR_PROFILE_NAMES = Object.freeze(['minimal', 'master']);
const TOOLBAR_CONFIGURATOR_CANONICAL_LIVE_IDS = Object.freeze(
  listLiveToolbarFunctionCatalogEntries().map((entry) => entry.id)
);
const Y4_RENDERER_LIVE_WIRING_ACTIVE = 'Y4_RENDERER_LIVE_WIRING_ACTIVE';
let designOsRuntimeBootstrap = null;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// REVIEW_SURFACE_PRESENTATION_START
const REVIEW_SURFACE_RECEIPT_SCHEMA = 'revision-bridge.exact-text-min-safe-write.receipt.v1';
const REVIEW_SURFACE_QUERY_ID = WORKSPACE_QUERY_IDS.REVIEW_SURFACE;
const METADATA_INSPECTOR_QUERY_ID = WORKSPACE_QUERY_IDS.METADATA_INSPECTOR;
const SCENE_HISTORY_QUERY_ID = WORKSPACE_QUERY_IDS.SCENE_HISTORY;
const STAGE10_PRODUCT_STATE_QUERY_ID = WORKSPACE_QUERY_IDS.STAGE10_PRODUCT_STATE;
const ATLAS_OVERVIEW_QUERY_ID = WORKSPACE_QUERY_IDS.ATLAS_OVERVIEW;
const ATLAS_ENTITY_DOSSIER_QUERY_ID = WORKSPACE_QUERY_IDS.ATLAS_ENTITY_DOSSIER;
const ATLAS_RELATION_DOSSIER_QUERY_ID = WORKSPACE_QUERY_IDS.ATLAS_RELATION_DOSSIER;
const ATLAS_MATRICES_QUERY_ID = WORKSPACE_QUERY_IDS.ATLAS_MATRICES;
const ATLAS_HEATMAP_QUERY_ID = WORKSPACE_QUERY_IDS.ATLAS_HEATMAP;
const ATLAS_TEMPORAL_LAYOUT_QUERY_ID = WORKSPACE_QUERY_IDS.ATLAS_TEMPORAL_LAYOUT;
const ATLAS_CONTINUITY_LEDGER_SURFACE_QUERY_ID = WORKSPACE_QUERY_IDS.ATLAS_CONTINUITY_LEDGER_SURFACE;
const ATLAS_REPORTS_SAVED_QUERIES_QUERY_ID = WORKSPACE_QUERY_IDS.ATLAS_REPORTS_SAVED_QUERIES;
const ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_QUERY_ID = WORKSPACE_QUERY_IDS.ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE;
const ATLAS_CURRENT_SCENE_QUERY_ID = WORKSPACE_QUERY_IDS.ATLAS_CURRENT_SCENE;
const MANUAL_MAP_WORKBENCH_QUERY_ID = WORKSPACE_QUERY_IDS.MANUAL_MAP_WORKBENCH;
const PROJECTION_INSPECTOR_QUERY_ID = WORKSPACE_QUERY_IDS.PROJECTION_INSPECTOR;
const RIGHT_RAIL_SURFACE_PROVIDERS = Object.freeze({
  inspector: METADATA_INSPECTOR_QUERY_ID,
  comments: REVIEW_SURFACE_QUERY_ID,
  history: SCENE_HISTORY_QUERY_ID,
  atlas: ATLAS_CURRENT_SCENE_QUERY_ID,
});
const ATLAS_SURFACE_IDS = Object.freeze([
  'currentScene',
  'journey',
  'manualMap',
  'projection',
  'overview',
  'entity',
  'relation',
  'matrices',
  'reports',
  'diagnostics',
  'heatmap',
  'temporal',
  'continuity',
]);
const ATLAS_DEFERRED_SURFACE_IDS = Object.freeze(['heatmap', 'temporal', 'continuity']);
const METADATA_UPDATE_COMMAND_ID = 'cmd.project.metadata.update';
const REVIEW_SURFACE_IMPORT_LOCAL_PACKET_COMMAND_ID = 'cmd.project.review.importLocalPacket';
const REVIEW_SURFACE_CLEAR_SESSION_COMMAND_ID = 'cmd.project.review.clearSession';
const REVIEW_SURFACE_EXACT_TEXT_APPLY_COMMAND_ID = 'cmd.project.review.applyExactTextChange';
const REVIEW_SURFACE_EXACT_TEXT_APPLY_BATCH_COMMAND_ID = 'cmd.project.review.applyExactTextChangesBatch';
const REVIEW_SURFACE_FULL_MANUSCRIPT_EXACT_TEXT_APPLY_COMMAND_ID = 'cmd.project.review.applyFullManuscriptExactTextReturn';
const REVIEW_SURFACE_FORMATTING_APPLY_COMMAND_ID = 'cmd.project.review.applyFormattingReturn';
const REVIEW_SURFACE_FORMATTING_REPLAY_INSPECT_COMMAND_ID = 'cmd.project.review.inspectFormattingReturnReplay';
const REVIEW_SURFACE_RELOAD_RECONCILED_SCENE_COMMAND_ID = 'cmd.project.review.reloadReconciledScene';
const REVIEW_SURFACE_CANCEL_OPERATION_COMMAND_ID = 'cmd.project.review.cancelOperation';
const REVIEW_SURFACE_EXACT_APPLY_BATCH_MAX_CHANGE_IDS = 10;
const REVIEW_SURFACE_DISPLAY_DIFF_MAX_TOKENS = 24;
const REVIEW_SURFACE_REPORT_EXCERPT_MAX_CHARS = 80;
const REVIEW_SURFACE_EXACT_APPLY_TRANSIENT_STATES = Object.freeze([
  'ready',
  'applying',
  'applied',
  'ambiguous',
  'blocked',
  'failed',
]);
const REVIEW_SURFACE_SOURCE_MODES = Object.freeze(['TRACKED', 'CLEAN', 'MIXED']);
const REVIEW_SURFACE_LIFECYCLE_STATES = Object.freeze([
  'DRAFT_EXPORT_INTENT',
  'OPEN_FOR_RETURN',
  'RETURN_ADMITTED',
  'RETURN_ANALYZED',
  'TERMINAL',
  'RECOVERY_REQUIRED',
  'QUARANTINED',
]);
const REVIEW_SURFACE_EXACT_APPLY_BLOCKED_REASON = 'REVIEW_SURFACE_SINGLE_EXACT_CHANGE_REQUIRED';
const REVIEW_SURFACE_EXACT_APPLY_CHANGE_ID_REQUIRED_REASON = 'REVIEW_SURFACE_EXACT_CHANGE_ID_REQUIRED';

function reviewSurfaceIsPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function reviewSurfaceText(value) {
  return typeof value === 'string' ? value : '';
}

function reviewSurfaceArray(value) {
  return Array.isArray(value) ? value : [];
}

function reviewSurfaceEscapeHtml(value) {
  return reviewSurfaceText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function reviewSurfacePresentStatus(value) {
  const status = reviewSurfaceText(value);
  switch (status) {
    case 'open':
      return 'открыта';
    case 'closed':
      return 'закрыта';
    case 'ready':
      return 'готово';
    case 'blocked':
      return 'заблокировано';
    case 'unplaced':
      return 'не привязан';
    case 'placed':
      return 'привязан';
    case 'preview':
      return 'предпросмотр';
    case 'applied':
      return 'применено';
    default:
      return status;
  }
}

function reviewSurfaceNormalizeSourceMode(value) {
  const mode = reviewSurfaceText(value).toUpperCase();
  return REVIEW_SURFACE_SOURCE_MODES.includes(mode) ? mode : '';
}

function reviewSurfacePresentSourceMode(value) {
  const mode = reviewSurfaceNormalizeSourceMode(value);
  switch (mode) {
    case 'TRACKED':
      return 'TRACKED: правки Word';
    case 'CLEAN':
      return 'CLEAN: чистая версия';
    case 'MIXED':
      return 'MIXED: правки и drift';
    default:
      return 'не определен';
  }
}

function reviewSurfaceNormalizeLifecycleState(value) {
  const state = reviewSurfaceText(value).toUpperCase();
  return REVIEW_SURFACE_LIFECYCLE_STATES.includes(state) ? state : '';
}

function reviewSurfacePresentLifecycleState(value) {
  return reviewSurfaceNormalizeLifecycleState(value) || reviewSurfaceText(value) || 'ожидание';
}

function reviewSurfaceShortDigest(value) {
  const text = reviewSurfaceText(value);
  return /^[a-f0-9]{64}$/u.test(text) || /^sha256:[a-f0-9]{64}$/u.test(text)
    ? text
    : reviewSurfaceText(text);
}

function reviewSurfaceIsIsoUtcTimestamp(value) {
  const normalized = reviewSurfaceText(value);
  if (!normalized) return false;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return false;
  return new Date(parsed).toISOString() === normalized;
}

function reviewSurfaceBackupIdFromSnapshotPath(snapshotPath) {
  const normalized = reviewSurfaceText(snapshotPath);
  if (!normalized) return '';
  const basename = normalized.split(/[\\/]/u).pop() || '';
  const match = basename.match(/\.bak\.(\d{13})$/u);
  return match ? match[1] : '';
}

function reviewSurfaceReasonCode(value, fallback = '') {
  if (reviewSurfaceIsPlainObject(value)) {
    return reviewSurfaceText(value.code || value.reason || value.message || fallback);
  }
  return reviewSurfaceText(value || fallback);
}

function reviewSurfaceResolveIncomingPayload(input = {}) {
  const source = reviewSurfaceIsPlainObject(input) ? input : {};
  if (reviewSurfaceIsPlainObject(source.reviewSurface)) {
    return source.reviewSurface;
  }
  if (
    reviewSurfaceIsPlainObject(source.revisionSession)
    || reviewSurfaceIsPlainObject(source.session)
    || reviewSurfaceIsPlainObject(source.exactTextPlanPreview)
    || reviewSurfaceIsPlainObject(source.planPreview)
    || reviewSurfaceIsPlainObject(source.structuralManualReviewPreview)
    || reviewSurfaceIsPlainObject(source.commentSurvivalPreview)
    || reviewSurfaceIsPlainObject(source.revisionBridgePreviewResult)
    || reviewSurfaceIsPlainObject(source.previewInput)
    || reviewSurfaceIsPlainObject(source.reviewPacket)
    || reviewSurfaceIsPlainObject(source.shadowPreview)
    || reviewSurfaceIsPlainObject(source.blockedApplyPlan)
    || reviewSurfaceIsPlainObject(source.receipt)
    || reviewSurfaceIsPlainObject(source.exactTextApply)
    || reviewSurfaceIsPlainObject(source.exactTextApplyReconciliation)
    || reviewSurfaceIsPlainObject(source.formattingReturnPreview)
    || reviewSurfaceIsPlainObject(source.formattingReturnResult)
    || source.ok === false
  ) {
    return source;
  }
  return {};
}

function reviewSurfaceNormalizeFormattingReturn(previewValue, resultValue) {
  const preview = reviewSurfaceIsPlainObject(previewValue) ? previewValue : {};
  const result = reviewSurfaceIsPlainObject(resultValue) ? resultValue : {};
  const operations = reviewSurfaceArray(preview.operations).map((operation) => ({
    operationId: reviewSurfaceText(operation?.operationId),
    sceneId: reviewSurfaceText(operation?.sceneId),
    blockId: reviewSurfaceText(operation?.blockId),
    selectedText: typeof operation?.selectedText === 'string' ? operation.selectedText : '',
    expectedOutcome: reviewSurfaceText(operation?.expectedOutcome),
  })).filter((operation) => operation.operationId && operation.sceneId);
  const diagnostics = reviewSurfaceArray(preview.diagnostics).map((diagnostic) => ({
    code: reviewSurfaceText(diagnostic?.code),
    sceneId: reviewSurfaceText(diagnostic?.sceneId),
    blockId: reviewSurfaceText(diagnostic?.blockId),
    paragraphIndex: Number.isSafeInteger(diagnostic?.paragraphIndex) ? diagnostic.paragraphIndex : -1,
    keys: reviewSurfaceArray(diagnostic?.keys).map(reviewSurfaceText).filter(Boolean),
  })).filter((diagnostic) => diagnostic.code);
  if (operations.length === 0 && diagnostics.length === 0 && Object.keys(result).length === 0) return null;
  const status = reviewSurfaceText(result.status || preview.status) || 'blocked';
  const replayVerified = result.replayVerified === true;
  return {
    status,
    code: reviewSurfaceText(result.code || preview.code),
    operationCount: Number.isSafeInteger(preview.operationCount) ? preview.operationCount : operations.length,
    sceneCount: Number.isSafeInteger(preview.sceneCount)
      ? preview.sceneCount
      : new Set(operations.map((operation) => operation.sceneId)).size,
    diagnosticCount: Number.isSafeInteger(preview.diagnosticCount)
      ? preview.diagnosticCount
      : diagnostics.length,
    diagnostics,
    operations,
    ready: ['ready', 'partial'].includes(preview.status) && operations.length > 0,
    partial: preview.status === 'partial' || diagnostics.length > 0,
    applied: result.applied === true,
    replayVerified,
    writerCalled: result.writerCalled === true,
    sceneReadback: reviewSurfaceArray(result.sceneReadback).map((item) => ({
      sceneId: reviewSurfaceText(item?.sceneId),
      matchesAfter: item?.matchesAfter === true,
    })).filter((item) => item.sceneId),
  };
}

function reviewSurfaceNormalizeExactTextApplyState(value = {}) {
  const source = reviewSurfaceIsPlainObject(value) ? value : {};
  const state = reviewSurfaceText(source.state);
  if (!REVIEW_SURFACE_EXACT_APPLY_TRANSIENT_STATES.includes(state)) {
    return null;
  }
  return {
    state,
    requestId: reviewSurfaceText(source.requestId),
    changeId: reviewSurfaceText(source.changeId),
    reason: reviewSurfaceText(source.reason),
  };
}

function reviewSurfaceBuildExactTextApplyPayload(requestId, changeId) {
  const payload = {};
  const normalizedRequestId = reviewSurfaceText(requestId);
  const normalizedChangeId = reviewSurfaceText(changeId);
  if (normalizedRequestId) payload.requestId = normalizedRequestId;
  if (normalizedChangeId) payload.changeId = normalizedChangeId;
  return payload;
}

function reviewSurfaceBuildExactTextApplyBatchPayload(requestId, changeIds) {
  const payload = {};
  const normalizedRequestId = reviewSurfaceText(requestId);
  const normalizedChangeIds = reviewSurfaceArray(changeIds)
    .map((changeId) => reviewSurfaceText(changeId))
    .filter(Boolean);
  if (normalizedRequestId) payload.requestId = normalizedRequestId;
  payload.changeIds = normalizedChangeIds;
  return payload;
}

function reviewSurfaceUnwrapCommandResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  if (reviewSurfaceIsPlainObject(result.value)) {
    return result.value;
  }
  return result;
}

function reviewSurfaceExtractCommandFailureReason(result = {}) {
  const source = reviewSurfaceUnwrapCommandResult(result);
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return 'REVIEW_SURFACE_APPLY_FAILED';
  }
  if (typeof source.reason === 'string' && source.reason) {
    return source.reason;
  }
  if (source.error && typeof source.error === 'object' && !Array.isArray(source.error)) {
    if (typeof source.error.reason === 'string' && source.error.reason) {
      return source.error.reason;
    }
    if (typeof source.error.code === 'string' && source.error.code) {
      return source.error.code;
    }
  }
  if (typeof source.code === 'string' && source.code) {
    return source.code;
  }
  return 'REVIEW_SURFACE_APPLY_FAILED';
}

function reviewSurfaceIsExactApplyBlockedReason(reason) {
  const normalized = reviewSurfaceText(reason).toUpperCase();
  return [
    'ALREADY_APPLIED',
    'BLOCK',
    'DIRTY',
    'DUPLICATE',
    'MISMATCH',
    'NO_MATCH',
    'STALE',
    'UNSUPPORTED',
  ].some((token) => normalized.includes(token));
}

function reviewSurfaceIsExactApplyAmbiguousReason(reason) {
  const normalized = reviewSurfaceText(reason).toUpperCase();
  return normalized.includes('AMBIGUOUS')
    || normalized.includes('RECONCILIATION_CONFLICT')
    || normalized.includes('APPLIED_RECEIPT_MISSING');
}

function reviewSurfacePresentExactApplyState(state) {
  switch (reviewSurfaceText(state)) {
    case 'applying':
      return 'применяется';
    case 'applied':
      return 'применено';
    case 'blocked':
      return 'заблокировано';
    case 'failed':
      return 'ошибка';
    case 'ambiguous':
      return 'нужна проверка';
    case 'ready':
    default:
      return 'готово';
  }
}

function reviewSurfaceCanonicalSession(source) {
  if (reviewSurfaceIsPlainObject(source.revisionSession)) return source.revisionSession;
  if (reviewSurfaceIsPlainObject(source.session)) return source.session;
  if (reviewSurfaceIsPlainObject(source.revisionBridgePreviewResult?.session)) {
    return source.revisionBridgePreviewResult.session;
  }
  if (reviewSurfaceIsPlainObject(source.shadowPreview?.session)) {
    return source.shadowPreview.session;
  }
  return null;
}

function reviewSurfaceCanonicalExactTextPreview(source) {
  if (reviewSurfaceIsPlainObject(source.exactTextPlanPreview)) return source.exactTextPlanPreview;
  if (reviewSurfaceIsPlainObject(source.planPreview)) return source.planPreview;
  if (reviewSurfaceIsPlainObject(source.blockedApplyPlan)) {
    return {
      status: reviewSurfaceText(source.blockedApplyPlan.status) || 'blocked',
      reasons: reviewSurfaceArray(source.blockedApplyPlan.reasons),
      plan: {
        applyOps: reviewSurfaceArray(source.blockedApplyPlan.applyOps),
      },
    };
  }
  return null;
}

function reviewSurfaceGenericStructuralPreview(session) {
  const reviewGraph = reviewSurfaceIsPlainObject(session?.reviewGraph) ? session.reviewGraph : {};
  const structuralChanges = reviewSurfaceArray(reviewGraph.structuralChanges);
  if (structuralChanges.length === 0) return null;
  return {
    items: structuralChanges.map((change, index) => {
      const reasonCodes = reviewSurfaceArray(change?.reasonCodes)
        .map((reason) => reviewSurfaceReasonCode(reason))
        .filter(Boolean);
      const manualOnlyReason = reviewSurfaceText(change?.manualOnlyReason)
        || reasonCodes[0]
        || 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_REQUIRED';
      return {
        itemId: reviewSurfaceText(change?.itemId) || `structural-generic-${index}`,
        structuralChangeId: reviewSurfaceText(change?.structuralChangeId),
        structuralKind: reviewSurfaceText(change?.kind),
        summary: reviewSurfaceText(change?.summary) || 'Структурный элемент только для ручной проверки',
        manualOnlyReason,
        reasonCodes: reasonCodes.length > 0 ? reasonCodes : [manualOnlyReason],
      };
    }),
    unsupportedObservations: [],
    summary: {
      totalStructuralChanges: structuralChanges.length,
    },
  };
}

function reviewSurfaceCanonicalStructuralPreview(source, session) {
  if (reviewSurfaceIsPlainObject(source.structuralManualReviewPreview)) return source.structuralManualReviewPreview;
  if (reviewSurfaceIsPlainObject(source.structuralPreview)) return source.structuralPreview;
  return reviewSurfaceGenericStructuralPreview(session);
}

function reviewSurfaceGenericCommentPreview(session) {
  const reviewGraph = reviewSurfaceIsPlainObject(session?.reviewGraph) ? session.reviewGraph : {};
  const threads = reviewSurfaceArray(reviewGraph.commentThreads);
  const placements = reviewSurfaceArray(reviewGraph.commentPlacements);
  if (threads.length === 0 && placements.length === 0) return null;
  return {
    totalThreads: threads.length,
    totalPlacements: placements.length,
    preservedThreads: threads.map((thread, index) => ({
      threadId: reviewSurfaceText(thread?.threadId) || `thread-${index}`,
      messages: reviewSurfaceArray(thread?.messages).map((message) => ({
        body: reviewSurfaceText(message?.body),
      })),
    })),
    placementResults: placements.map((placement, index) => ({
      placementId: reviewSurfaceText(placement?.placementId) || `placement-${index}`,
      threadId: reviewSurfaceText(placement?.threadId),
      status: reviewSurfaceText(placement?.status) || 'unplaced',
      evaluation: reviewSurfaceIsPlainObject(placement?.evaluation)
        ? placement.evaluation
        : {
            reasonCodes: reviewSurfaceArray(placement?.reasonCodes),
          },
    })),
    diagnostics: [],
  };
}

function reviewSurfaceCanonicalCommentPreview(source, session) {
  if (reviewSurfaceIsPlainObject(source.commentSurvivalPreview)) return source.commentSurvivalPreview;
  if (reviewSurfaceIsPlainObject(source.commentPreview)) return source.commentPreview;
  return reviewSurfaceGenericCommentPreview(session);
}

function reviewSurfaceNormalizeReceipt(rawReceipt) {
  if (!reviewSurfaceIsPlainObject(rawReceipt)) return null;
  const recovery = reviewSurfaceIsPlainObject(rawReceipt.recovery) ? rawReceipt.recovery : null;
  const writtenAt = reviewSurfaceText(rawReceipt.writtenAt);
  const backupId = reviewSurfaceText(rawReceipt.backupId);
  const recoverySnapshotPath = reviewSurfaceText(recovery?.snapshotPath);
  const backupIdMatchesRecovery = !recoverySnapshotPath
    || !backupId
    || reviewSurfaceBackupIdFromSnapshotPath(recoverySnapshotPath) === backupId;
  const receiptCandidateValid = rawReceipt.schemaVersion === REVIEW_SURFACE_RECEIPT_SCHEMA
    && reviewSurfaceText(rawReceipt.projectId)
    && reviewSurfaceText(rawReceipt.sessionId)
    && reviewSurfaceText(rawReceipt.sceneId)
    && reviewSurfaceText(rawReceipt.changeId)
    && reviewSurfaceText(rawReceipt.baselineHashBefore)
    && reviewSurfaceText(rawReceipt.operationKind) === 'replaceExactText'
    && reviewSurfaceText(rawReceipt.writeStatus) === 'applied'
    && backupId
    && reviewSurfaceIsIsoUtcTimestamp(writtenAt)
    && reviewSurfaceText(rawReceipt.transactionId)
    && reviewSurfaceText(rawReceipt.inputHash)
    && reviewSurfaceText(rawReceipt.outputHash)
    && reviewSurfaceIsPlainObject(recovery)
    && backupIdMatchesRecovery;
  if (!receiptCandidateValid) return null;
  return {
    schemaVersion: rawReceipt.schemaVersion,
    operationId: reviewSurfaceText(rawReceipt.operationId),
    projectId: reviewSurfaceText(rawReceipt.projectId),
    sessionId: reviewSurfaceText(rawReceipt.sessionId),
    sceneId: reviewSurfaceText(rawReceipt.sceneId),
    changeId: reviewSurfaceText(rawReceipt.changeId),
    baselineHashBefore: reviewSurfaceText(rawReceipt.baselineHashBefore),
    operationKind: reviewSurfaceText(rawReceipt.operationKind),
    writeStatus: reviewSurfaceText(rawReceipt.writeStatus),
    backupId,
    writtenAt,
    transactionId: reviewSurfaceText(rawReceipt.transactionId),
    inputHash: reviewSurfaceText(rawReceipt.inputHash),
    outputHash: reviewSurfaceText(rawReceipt.outputHash),
    bytesWritten: Number.isFinite(rawReceipt.bytesWritten) ? rawReceipt.bytesWritten : 0,
    reason: reviewSurfaceText(rawReceipt.reason),
    recovery: {
      snapshotCreated: recovery.snapshotCreated === true,
      snapshotReadable: recovery.snapshotReadable === true,
      snapshotHashMatchesInput: recovery.snapshotHashMatchesInput === true,
      snapshotPath: reviewSurfaceText(recovery.snapshotPath),
      recoveryAction: reviewSurfaceText(recovery.recoveryAction),
    },
  };
}

function reviewSurfaceNormalizeExactTextBatchApplyResult(rawResult) {
  if (!reviewSurfaceIsPlainObject(rawResult)) return null;
  const changes = reviewSurfaceArray(rawResult.changes)
    .filter((change) => reviewSurfaceIsPlainObject(change))
    .map((change) => ({
      changeId: reviewSurfaceText(change.changeId),
      status: reviewSurfaceText(change.status),
      reason: reviewSurfaceText(change.reason),
    }))
    .filter((change) => change.changeId);
  const status = reviewSurfaceText(rawResult.status);
  const reason = reviewSurfaceText(rawResult.reason);
  if (!status && !reason && changes.length === 0) return null;
  return {
    status,
    reason,
    applied: rawResult.applied === true,
    changes,
    totals: reviewSurfaceIsPlainObject(rawResult.totals)
      ? {
          requested: Number.isFinite(rawResult.totals.requested) ? rawResult.totals.requested : 0,
          applied: Number.isFinite(rawResult.totals.applied) ? rawResult.totals.applied : 0,
          blocked: Number.isFinite(rawResult.totals.blocked) ? rawResult.totals.blocked : 0,
          failed: Number.isFinite(rawResult.totals.failed) ? rawResult.totals.failed : 0,
          skipped: Number.isFinite(rawResult.totals.skipped) ? rawResult.totals.skipped : 0,
        }
      : null,
  };
}

function reviewSurfaceNormalizeExactTextApplyReconciliation(rawState) {
  if (!reviewSurfaceIsPlainObject(rawState)) return null;
  const allowedOutcomes = new Set([
    'not_applied',
    'applied_receipt_missing',
    'applied_receipt_present',
    'conflict',
  ]);
  const items = reviewSurfaceArray(rawState.items)
    .filter((item) => reviewSurfaceIsPlainObject(item))
    .map((item) => ({
      operationId: reviewSurfaceText(item.operationId),
      outcome: reviewSurfaceText(item.outcome),
      ambiguous: item.ambiguous === true,
      sceneId: reviewSurfaceText(item.sceneId),
      sceneRelativePath: reviewSurfaceText(item.sceneRelativePath),
      observedHash: reviewSurfaceText(item.observedHash),
      recoveryVerified: item.recoveryVerified === true,
      snapshotAvailable: item.snapshotAvailable === true,
      safeActions: reviewSurfaceArray(item.safeActions)
        .map((action) => reviewSurfaceText(action))
        .filter((action) => action === 'RELOAD_CANONICAL'),
      reconciledAt: reviewSurfaceText(item.reconciledAt),
    }))
    .filter((item) => item.operationId && allowedOutcomes.has(item.outcome));
  const errors = reviewSurfaceArray(rawState.errors)
    .filter((item) => reviewSurfaceIsPlainObject(item))
    .map((item) => ({
      operationId: reviewSurfaceText(item.operationId),
      code: reviewSurfaceText(item.code),
    }))
    .filter((item) => item.code);
  if (items.length === 0 && errors.length === 0) return null;
  return { items, errors };
}

function reviewSurfaceNormalizePackageRewriteReport(rawReport) {
  if (!reviewSurfaceIsPlainObject(rawReport)) return null;
  const changedBlocks = reviewSurfaceArray(rawReport.changedBlocks)
    .filter((block) => reviewSurfaceIsPlainObject(block))
    .slice(0, 12)
    .map((block, index) => ({
      blockId: reviewSurfaceText(block.blockId) || `changed-${index}`,
      originalDigest: reviewSurfaceShortDigest(block.originalDigest),
      finalDigest: reviewSurfaceShortDigest(block.finalDigest),
      originalExcerpt: reviewSurfaceText(block.originalText || block.originalExcerpt).slice(0, REVIEW_SURFACE_REPORT_EXCERPT_MAX_CHARS),
      finalExcerpt: reviewSurfaceText(block.finalText || block.finalExcerpt).slice(0, REVIEW_SURFACE_REPORT_EXCERPT_MAX_CHARS),
    }));
  const unchangedBlocks = reviewSurfaceArray(rawReport.unchangedBlocks)
    .filter((block) => reviewSurfaceIsPlainObject(block))
    .slice(0, 12)
    .map((block, index) => ({
      blockId: reviewSurfaceText(block.blockId) || `unchanged-${index}`,
      textDigest: reviewSurfaceShortDigest(block.textDigest),
      excerpt: reviewSurfaceText(block.excerpt || block.text).slice(0, REVIEW_SURFACE_REPORT_EXCERPT_MAX_CHARS),
    }));
  if (changedBlocks.length === 0 && unchangedBlocks.length === 0 && !reviewSurfaceText(rawReport.reportId)) return null;
  return {
    schemaVersion: reviewSurfaceText(rawReport.schemaVersion),
    reportId: reviewSurfaceShortDigest(rawReport.reportId),
    canWriteManuscript: rawReport.canWriteManuscript === true,
    canApply: rawReport.canApply === true,
    changedBlocks,
    unchangedBlocks,
  };
}

function reviewSurfaceNormalizeProgress(rawProgress, transient = null) {
  const source = reviewSurfaceIsPlainObject(rawProgress) ? rawProgress : {};
  const transientState = reviewSurfaceText(transient?.state);
  const active = source.active === true || transientState === 'applying';
  const cancelled = source.cancelled === true || source.state === 'cancelled';
  const percent = Number.isFinite(source.percent)
    ? Math.max(0, Math.min(100, Math.round(source.percent)))
    : (active ? 40 : 0);
  const cancellable = source.cancellable === true || active;
  return {
    active,
    cancelled,
    state: reviewSurfaceText(source.state) || (cancelled ? 'cancelled' : (active ? 'running' : 'idle')),
    label: reviewSurfaceText(source.label) || (active ? 'Review operation in progress' : 'No active review operation'),
    operationId: reviewSurfaceText(source.operationId || transient?.requestId),
    percent,
    cancellable,
  };
}

function reviewSurfaceNormalizeState(input = {}) {
  const source = reviewSurfaceResolveIncomingPayload(input);
  const revisionSession = reviewSurfaceCanonicalSession(source);
  const exactTextPlanPreview = reviewSurfaceCanonicalExactTextPreview(source);
  const structuralManualReviewPreview = reviewSurfaceCanonicalStructuralPreview(source, revisionSession);
  const commentSurvivalPreview = reviewSurfaceCanonicalCommentPreview(source, revisionSession);
  const receipt = reviewSurfaceNormalizeReceipt(source.receipt);
  const receipts = reviewSurfaceArray(source.exactTextApplyReceipts)
    .map((rawReceipt) => reviewSurfaceNormalizeReceipt(rawReceipt))
    .filter(Boolean);
  if (receipt && !receipts.some((candidate) => candidate.changeId === receipt.changeId)) {
    receipts.push(receipt);
  }
  const exactTextAppliedChangeIds = reviewSurfaceArray(source.exactTextAppliedChangeIds)
    .map((changeId) => reviewSurfaceText(changeId))
    .filter(Boolean);
  const exactTextBatchApplyResult = reviewSurfaceNormalizeExactTextBatchApplyResult(
    source.exactTextBatchApplyResult || source.lastExactTextApplyBatchResult,
  );
  const exactTextApplyReconciliation = reviewSurfaceNormalizeExactTextApplyReconciliation(
    source.exactTextApplyReconciliation,
  );
  const formattingReturn = reviewSurfaceNormalizeFormattingReturn(
    source.formattingReturnPreview,
    source.formattingReturnResult,
  );
  const error = reviewSurfaceIsPlainObject(source.error)
    ? {
        code: reviewSurfaceText(source.error.code),
        message: reviewSurfaceText(source.error.message || source.error.detail),
      }
    : (
      source.ok === false
        ? {
            code: reviewSurfaceText(source.code || source.reason),
            message: reviewSurfaceText(source.reasons?.[0]?.message || source.detail || source.message),
          }
        : null
    );
  const hasReviewData = Boolean(
    revisionSession
    || exactTextPlanPreview
    || structuralManualReviewPreview
    || commentSurvivalPreview
    || receipt
    || receipts.length > 0
    || exactTextAppliedChangeIds.length > 0
    || exactTextBatchApplyResult
    || exactTextApplyReconciliation
    || formattingReturn,
  );
  const status = error
    ? 'error'
    : (hasReviewData ? 'ready' : 'empty');
  const exactTextApply = reviewSurfaceNormalizeExactTextApplyState(source.exactTextApply);
  const sourceMode = reviewSurfaceNormalizeSourceMode(
    source.sourceMode
    || source.reviewIr?.sourceMode
    || source.returnedReviewAnalysis?.sourceMode
    || source.analysis?.sourceMode
    || revisionSession?.sourceMode,
  );
  const lifecycleState = reviewSurfaceNormalizeLifecycleState(
    source.lifecycleState
    || source.roundLifecycleState
    || source.publicManifest?.lifecycleState
    || source.reviewRoundManifest?.lifecycleState
    || revisionSession?.lifecycleState,
  );
  const packageRewriteReport = reviewSurfaceNormalizePackageRewriteReport(
    source.packageRewriteReport || source.redactedPackageRewriteReport || source.rewriteReport,
  );
  const reviewProgress = reviewSurfaceNormalizeProgress(source.reviewProgress || source.progress, exactTextApply);

  return {
    status,
    revisionSession,
    exactTextPlanPreview,
    structuralManualReviewPreview,
    commentSurvivalPreview,
    receipt,
    receipts,
    exactTextAppliedChangeIds,
    exactTextBatchApplyResult,
    exactTextApplyReconciliation,
    formattingReturn,
    error,
    exactTextApply,
    sourceMode,
    lifecycleState,
    returnArtifactSha256: reviewSurfaceShortDigest(source.returnArtifactSha256 || source.returnArtifactHash || source.returnedArtifactSha256),
    manifestDigest: reviewSurfaceShortDigest(source.manifestDigest || source.publicManifest?.manifestDigest),
    parserProfileDigest: reviewSurfaceShortDigest(source.parserProfileDigest || source.parserProfile?.parserProfileDigest),
    analysisDigest: reviewSurfaceShortDigest(source.analysisDigest || source.returnedReviewAnalysis?.analysisDigest),
    packageRewriteReport,
    reviewProgress,
  };
}

reviewSurfaceState = reviewSurfaceNormalizeState();

function reviewSurfaceBuildImportSummary(state) {
  const session = reviewSurfaceIsPlainObject(state.revisionSession) ? state.revisionSession : {};
  const reviewGraph = reviewSurfaceIsPlainObject(session.reviewGraph) ? session.reviewGraph : {};
  const exactPreview = reviewSurfaceIsPlainObject(state.exactTextPlanPreview) ? state.exactTextPlanPreview : {};
  const structuralPreview = reviewSurfaceIsPlainObject(state.structuralManualReviewPreview) ? state.structuralManualReviewPreview : {};
  const commentPreview = reviewSurfaceIsPlainObject(state.commentSurvivalPreview) ? state.commentSurvivalPreview : {};
  const sessionTextChanges = reviewSurfaceArray(reviewGraph.textChanges);
  const sessionStructuralChanges = reviewSurfaceArray(reviewGraph.structuralChanges);
  const sessionCommentThreads = reviewSurfaceArray(reviewGraph.commentThreads);
  const sessionCommentPlacements = reviewSurfaceArray(reviewGraph.commentPlacements);
  const sessionDiagnosticItems = reviewSurfaceArray(reviewGraph.diagnosticItems);
  const sessionDecisionStates = reviewSurfaceArray(reviewGraph.decisionStates);

  return {
    projectId: reviewSurfaceText(session.projectId || exactPreview.plan?.projectId || state.receipt?.projectId),
    sessionId: reviewSurfaceText(session.sessionId || exactPreview.plan?.sessionId || state.receipt?.sessionId),
    baselineHash: reviewSurfaceText(session.baselineHash || exactPreview.plan?.baselineHash),
    sessionStatus: reviewSurfaceText(session.status),
    textChangeCount: sessionTextChanges.length || reviewSurfaceArray(exactPreview.plan?.applyOps).length,
    structuralChangeCount: sessionStructuralChanges.length || Number(structuralPreview.summary?.totalStructuralChanges) || 0,
    commentThreadCount: sessionCommentThreads.length || Number(commentPreview.totalThreads) || 0,
    commentPlacementCount: sessionCommentPlacements.length || Number(commentPreview.totalPlacements) || 0,
    diagnosticCount: sessionDiagnosticItems.length || reviewSurfaceArray(commentPreview.diagnostics).length,
    decisionCount: sessionDecisionStates.length,
  };
}

function reviewSurfaceBuildReviewItems(state) {
  const items = [];
  const session = reviewSurfaceIsPlainObject(state.revisionSession) ? state.revisionSession : {};
  const reviewGraph = reviewSurfaceIsPlainObject(session.reviewGraph) ? session.reviewGraph : {};
  const exactPreview = reviewSurfaceIsPlainObject(state.exactTextPlanPreview) ? state.exactTextPlanPreview : {};
  const structuralPreview = reviewSurfaceIsPlainObject(state.structuralManualReviewPreview) ? state.structuralManualReviewPreview : {};

  for (const change of reviewSurfaceArray(reviewGraph.textChanges)) {
    const changeId = reviewSurfaceText(change?.changeId) || 'text-change';
    const sceneId = reviewSurfaceText(change?.targetScope?.id);
    const expectedText = reviewSurfaceText(change?.match?.quote);
    const replacementText = reviewSurfaceText(change?.replacementText);
    const previewReady = exactPreview.status === 'ready'
      && reviewSurfaceArray(exactPreview.plan?.applyOps).some((op) => reviewSurfaceText(op?.changeId) === changeId);
    items.push({
      itemId: `text:${changeId}`,
      title: `Текстовая правка ${changeId}`,
      body: expectedText || replacementText
        ? `"${expectedText}" -> "${replacementText}"`
        : 'Кандидат на точную текстовую замену',
      meta: [sceneId ? `Сцена ${sceneId}` : '', previewReady ? 'Предпросмотр готов' : 'Предпросмотр заблокирован'].filter(Boolean),
      tone: previewReady ? 'preview' : 'blocked',
    });
  }

  for (const item of reviewSurfaceArray(structuralPreview.items)) {
    const structuralKind = reviewSurfaceText(item?.structuralKind);
    const manualOnlyReason = reviewSurfaceText(item?.manualOnlyReason);
    items.push({
      itemId: `structural:${reviewSurfaceText(item?.structuralChangeId) || reviewSurfaceText(item?.itemId) || items.length}`,
      title: structuralKind ? `Структура ${structuralKind}` : 'Структурная проверка',
      body: reviewSurfaceText(item?.summary) || 'Структурный элемент только для ручной проверки',
      meta: [manualOnlyReason || 'MANUAL_ONLY', 'Только вручную'].filter(Boolean),
      tone: 'manual',
    });
  }

  for (const item of reviewSurfaceArray(reviewGraph.diagnosticItems)) {
    const diagnosticId = reviewSurfaceText(item?.diagnosticId) || `diagnostic-${items.length}`;
    const severity = reviewSurfaceText(item?.severity) || 'info';
    const scopeId = reviewSurfaceText(item?.targetScope?.id);
    items.push({
      itemId: `diagnostic:${diagnosticId}`,
      title: `Диагностика ${diagnosticId}`,
      body: reviewSurfaceText(item?.message) || 'Диагностическое наблюдение доступно только для чтения.',
      meta: [severity, 'Только чтение', scopeId ? `Источник ${scopeId}` : 'DOCX evidence'].filter(Boolean),
      tone: 'readonly',
    });
  }

  return items;
}

function reviewSurfaceBuildManualOnlyReasons(state) {
  const reasons = [];
  const structuralPreview = reviewSurfaceIsPlainObject(state.structuralManualReviewPreview) ? state.structuralManualReviewPreview : {};
  const exactPreview = reviewSurfaceIsPlainObject(state.exactTextPlanPreview) ? state.exactTextPlanPreview : {};
  for (const item of reviewSurfaceArray(structuralPreview.items)) {
    const manualOnlyReason = reviewSurfaceText(item?.manualOnlyReason);
    if (manualOnlyReason) reasons.push(manualOnlyReason);
    for (const reasonCode of reviewSurfaceArray(item?.reasonCodes)) {
      const normalized = reviewSurfaceText(reasonCode);
      if (normalized) reasons.push(normalized);
    }
  }
  for (const reason of reviewSurfaceArray(exactPreview.reasons)) {
    const code = reviewSurfaceText(reason?.code || reason);
    if (code) reasons.push(code);
  }
  return [...new Set(reasons)];
}

function reviewSurfaceBuildOrphanComments(state) {
  const commentPreview = reviewSurfaceIsPlainObject(state.commentSurvivalPreview) ? state.commentSurvivalPreview : {};
  const threadsById = new Map();
  for (const thread of reviewSurfaceArray(commentPreview.preservedThreads)) {
    const threadId = reviewSurfaceText(thread?.threadId);
    if (!threadId) continue;
    const messageBody = reviewSurfaceArray(thread?.messages)
      .map((message) => reviewSurfaceText(message?.body))
      .find(Boolean);
    threadsById.set(threadId, {
      threadId,
      body: messageBody || 'Текст комментария недоступен',
    });
  }

  return reviewSurfaceArray(commentPreview.placementResults)
    .filter((placement) => reviewSurfaceText(placement?.status) !== 'placed')
    .map((placement, index) => {
      const threadId = reviewSurfaceText(placement?.threadId);
      const thread = threadsById.get(threadId);
      const reasonCodes = reviewSurfaceArray(
        placement?.evaluation?.reasonCodes || placement?.evaluation?.confidenceEvaluation?.reasonCodes,
      ).map((reasonCode) => reviewSurfaceText(reasonCode)).filter(Boolean);
      return {
        itemId: reviewSurfaceText(placement?.placementId) || `orphan-${index}`,
        threadId,
        body: thread?.body || 'Текст комментария недоступен',
        status: reviewSurfacePresentStatus(placement?.status) || 'не привязан',
        reasonCodes,
      };
    });
}

function reviewSurfaceBuildUnsupportedObservations(state) {
  const structuralPreview = reviewSurfaceIsPlainObject(state.structuralManualReviewPreview) ? state.structuralManualReviewPreview : {};
  return reviewSurfaceArray(structuralPreview.unsupportedObservations).map((observation, index) => ({
    itemId: reviewSurfaceText(observation?.itemId) || `unsupported-${index}`,
    structuralKind: reviewSurfaceText(observation?.structuralKind),
    reason: reviewSurfaceText(observation?.reason) || 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_KIND',
  }));
}

function reviewSurfaceTokenizeDisplayText(value) {
  return reviewSurfaceText(value).split(/(\s+)/u).filter((token) => token.length > 0);
}

function reviewSurfaceBuildBoundedDisplayDiff(expectedText, replacementText) {
  const beforeTokens = reviewSurfaceTokenizeDisplayText(expectedText).filter((token) => token.trim());
  const afterTokens = reviewSurfaceTokenizeDisplayText(replacementText).filter((token) => token.trim());
  const beforeSample = beforeTokens.slice(0, REVIEW_SURFACE_DISPLAY_DIFF_MAX_TOKENS);
  const afterSample = afterTokens.slice(0, REVIEW_SURFACE_DISPLAY_DIFF_MAX_TOKENS);
  const truncated = beforeTokens.length > beforeSample.length || afterTokens.length > afterSample.length;
  return [
    ...beforeSample.map((token) => ({ kind: 'removed', text: token })),
    ...afterSample.map((token) => ({ kind: 'added', text: token })),
    ...(truncated ? [{ kind: 'context', text: '...' }] : []),
  ];
}

function reviewSurfaceBuildLanes(state, exactTextPreview) {
  const structuralPreview = reviewSurfaceIsPlainObject(state.structuralManualReviewPreview) ? state.structuralManualReviewPreview : {};
  const commentPreview = reviewSurfaceIsPlainObject(state.commentSurvivalPreview) ? state.commentSurvivalPreview : {};
  const exactOps = reviewSurfaceArray(exactTextPreview.ops);
  const manualItems = [
    ...reviewSurfaceArray(structuralPreview.items),
    ...reviewSurfaceArray(structuralPreview.unsupportedObservations),
  ];
  const commentThreads = reviewSurfaceArray(commentPreview.preservedThreads);
  const commentPlacements = reviewSurfaceArray(commentPreview.placementResults);
  return [
    {
      laneId: 'exact',
      label: 'Exact',
      state: exactTextPreview.state === 'ready' && exactOps.some((op) => op.applyState === 'ready') ? 'ready' : exactTextPreview.state,
      count: exactOps.length,
      detail: exactOps.length > 0 ? 'Bounded exact text candidates' : 'No exact text candidates',
    },
    {
      laneId: 'manual',
      label: 'Manual',
      state: manualItems.length > 0 || state.sourceMode === 'CLEAN' || state.sourceMode === 'MIXED' ? 'manual' : 'empty',
      count: manualItems.length,
      detail: state.sourceMode ? reviewSurfacePresentSourceMode(state.sourceMode) : 'No manual-only items',
    },
    {
      laneId: 'comments',
      label: 'Comments',
      state: commentThreads.length > 0 || commentPlacements.length > 0 ? 'comments' : 'empty',
      count: Math.max(commentThreads.length, commentPlacements.length),
      detail: commentThreads.length > 0 ? 'Independent comment lane' : 'No comment threads',
    },
  ];
}

function reviewSurfaceBuildCommentLane(state) {
  const commentPreview = reviewSurfaceIsPlainObject(state.commentSurvivalPreview) ? state.commentSurvivalPreview : {};
  const placementsByThread = new Map();
  for (const placement of reviewSurfaceArray(commentPreview.placementResults)) {
    const threadId = reviewSurfaceText(placement?.threadId);
    if (!threadId) continue;
    placementsByThread.set(threadId, placement);
  }
  return reviewSurfaceArray(commentPreview.preservedThreads).map((thread, index) => {
    const threadId = reviewSurfaceText(thread?.threadId) || `thread-${index}`;
    const messages = reviewSurfaceArray(thread?.messages);
    const placement = placementsByThread.get(threadId);
    const status = reviewSurfaceText(placement?.status);
    const reasonCodes = reviewSurfaceArray(
      placement?.evaluation?.reasonCodes || placement?.evaluation?.confidenceEvaluation?.reasonCodes,
    ).map((reasonCode) => reviewSurfaceText(reasonCode)).filter(Boolean);
    return {
      threadId,
      author: reviewSurfaceText(thread?.author || messages[0]?.author) || 'unknown author',
      createdAt: reviewSurfaceText(thread?.createdAt || messages[0]?.createdAt),
      body: reviewSurfaceText(messages[0]?.body || thread?.body),
      replies: Math.max(0, messages.length - 1),
      resolved: thread?.resolved === true || status === 'resolved',
      outcome: reviewSurfaceText(placement?.outcome || status || 'ORPHAN').toUpperCase(),
      reasonCodes,
    };
  });
}

function reviewSurfaceBuildTerminalSummary(state) {
  const batch = state.exactTextBatchApplyResult;
  if (reviewSurfaceIsPlainObject(batch?.totals)) {
    return {
      status: reviewSurfaceText(batch.status) || 'batch',
      detail: `${batch.totals.applied || 0} applied, ${batch.totals.blocked || 0} blocked, ${batch.totals.failed || 0} failed`,
      reason: reviewSurfaceText(batch.reason),
    };
  }
  if (state.receipt) {
    return {
      status: state.receipt.writeStatus,
      detail: `${state.receipt.changeId} / ${state.receipt.bytesWritten} bytes`,
      reason: state.receipt.reason,
    };
  }
  return {
    status: 'pending',
    detail: 'No terminal apply summary',
    reason: '',
  };
}

function reviewSurfaceBuildExactTextPreview(state) {
  const exactPreview = reviewSurfaceIsPlainObject(state.exactTextPlanPreview) ? state.exactTextPlanPreview : {};
  const fullManuscriptPreview = reviewSurfaceIsPlainObject(state.fullManuscriptExactTextReturnPreview)
    ? state.fullManuscriptExactTextReturnPreview
    : {};
  const structuralPreview = reviewSurfaceIsPlainObject(state.structuralManualReviewPreview) ? state.structuralManualReviewPreview : {};
  const commentPreview = reviewSurfaceIsPlainObject(state.commentSurvivalPreview) ? state.commentSurvivalPreview : {};
  const applyOpsRaw = reviewSurfaceArray(exactPreview.plan?.applyOps);
  const transient = reviewSurfaceNormalizeExactTextApplyState(state.exactTextApply);
  const appliedChangeIds = new Set([
    ...reviewSurfaceArray(state.receipts)
      .filter((receipt) => receipt?.writeStatus === 'applied')
      .map((receipt) => reviewSurfaceText(receipt.changeId))
      .filter(Boolean),
    ...reviewSurfaceArray(state.exactTextAppliedChangeIds)
      .map((changeId) => reviewSurfaceText(changeId))
      .filter(Boolean),
    ...reviewSurfaceArray(state.exactTextBatchApplyResult?.changes)
      .filter((change) => change?.status === 'applied')
      .map((change) => reviewSurfaceText(change.changeId))
      .filter(Boolean),
  ]);
  const structuralItems = reviewSurfaceArray(structuralPreview.items);
  const unsupportedStructuralItems = reviewSurfaceArray(structuralPreview.unsupportedObservations);
  const structuralBlocked = structuralItems.length > 0 || unsupportedStructuralItems.length > 0;
  const commentBlocked = Number(commentPreview.totalThreads) > 0
    || Number(commentPreview.totalPlacements) > 0
    || reviewSurfaceArray(commentPreview.preservedThreads).length > 0
    || reviewSurfaceArray(commentPreview.placementResults).length > 0;
  const singleReadyOp = exactPreview.status === 'ready' && applyOpsRaw.length === 1 && !structuralBlocked;
  const batchChangeIds = applyOpsRaw.map((op) => reviewSurfaceText(op?.changeId)).filter(Boolean);
  const batchUniqueChangeIds = [...new Set(batchChangeIds)];
  const batchSceneIds = [...new Set(applyOpsRaw.map((op) => reviewSurfaceText(op?.sceneId)).filter(Boolean))];
  const batchCandidate = exactPreview.status === 'ready' && applyOpsRaw.length > 1;
  const batchAllApplied = batchCandidate
    && batchChangeIds.length === applyOpsRaw.length
    && batchChangeIds.every((changeId) => appliedChangeIds.has(changeId));
  let batchApplyState = 'blocked';
  let batchApplyReason = '';
  if (batchCandidate) {
    if (batchAllApplied) {
      batchApplyState = 'applied';
    } else if (transient && !transient.changeId) {
      batchApplyState = transient.state;
      batchApplyReason = transient.reason;
    } else if (structuralBlocked) {
      batchApplyReason = 'REVIEW_SURFACE_STRUCTURAL_REVIEW_BLOCKS_EXACT_BATCH_APPLY';
    } else if (commentBlocked) {
      batchApplyReason = 'REVIEW_SURFACE_COMMENT_REVIEW_BLOCKS_EXACT_BATCH_APPLY';
    } else if (batchChangeIds.length !== applyOpsRaw.length) {
      batchApplyReason = REVIEW_SURFACE_EXACT_APPLY_CHANGE_ID_REQUIRED_REASON;
    } else if (batchUniqueChangeIds.length !== batchChangeIds.length) {
      batchApplyReason = 'REVIEW_SURFACE_EXACT_BATCH_DUPLICATE_CHANGE_ID';
    } else if (batchSceneIds.length !== 1) {
      batchApplyReason = 'REVIEW_SURFACE_EXACT_BATCH_SINGLE_SCENE_REQUIRED';
    } else if (batchChangeIds.length > REVIEW_SURFACE_EXACT_APPLY_BATCH_MAX_CHANGE_IDS) {
      batchApplyReason = 'REVIEW_SURFACE_EXACT_BATCH_LIMIT_EXCEEDED';
    } else {
      batchApplyState = 'ready';
    }
  }
  const fullManuscriptCandidate = exactPreview.status === 'ready'
    && exactPreview.plan?.fullManuscript === true
    && fullManuscriptPreview.status === 'preview-ready'
    && reviewSurfaceText(fullManuscriptPreview.applyCommandId) === REVIEW_SURFACE_FULL_MANUSCRIPT_EXACT_TEXT_APPLY_COMMAND_ID
    && applyOpsRaw.length > 0;
  const fullManuscriptAllApplied = fullManuscriptCandidate
    && batchChangeIds.length === applyOpsRaw.length
    && batchChangeIds.every((changeId) => appliedChangeIds.has(changeId));
  let fullManuscriptApplyState = 'blocked';
  let fullManuscriptApplyReason = '';
  if (fullManuscriptCandidate) {
    if (fullManuscriptAllApplied) {
      fullManuscriptApplyState = 'applied';
    } else if (transient && !transient.changeId) {
      fullManuscriptApplyState = transient.state;
      fullManuscriptApplyReason = transient.reason;
    } else if (structuralBlocked) {
      fullManuscriptApplyReason = 'REVIEW_SURFACE_STRUCTURAL_REVIEW_BLOCKS_FULL_MANUSCRIPT_EXACT_APPLY';
    } else if (commentBlocked) {
      fullManuscriptApplyReason = 'REVIEW_SURFACE_COMMENT_REVIEW_BLOCKS_FULL_MANUSCRIPT_EXACT_APPLY';
    } else if (batchChangeIds.length !== applyOpsRaw.length) {
      fullManuscriptApplyReason = REVIEW_SURFACE_EXACT_APPLY_CHANGE_ID_REQUIRED_REASON;
    } else if (batchUniqueChangeIds.length !== batchChangeIds.length) {
      fullManuscriptApplyReason = 'REVIEW_SURFACE_FULL_MANUSCRIPT_EXACT_DUPLICATE_CHANGE_ID';
    } else {
      fullManuscriptApplyState = 'ready';
    }
  }
  const applyOps = applyOpsRaw.map((op) => {
    const changeId = reviewSurfaceText(op?.changeId);
    const opCanApply = singleReadyOp && Boolean(changeId);
    let applyState = opCanApply ? 'ready' : 'blocked';
    let applyReason = opCanApply
      ? ''
      : (
        structuralBlocked
          ? 'REVIEW_SURFACE_STRUCTURAL_REVIEW_BLOCKS_EXACT_APPLY'
          : (singleReadyOp ? REVIEW_SURFACE_EXACT_APPLY_CHANGE_ID_REQUIRED_REASON : REVIEW_SURFACE_EXACT_APPLY_BLOCKED_REASON)
      );
    if (changeId && appliedChangeIds.has(changeId)) {
      applyState = 'applied';
      applyReason = '';
    } else if (transient && (!transient.changeId || transient.changeId === changeId)) {
      applyState = transient.state;
      applyReason = transient.reason;
    }
    return {
      itemId: reviewSurfaceText(op?.opId),
      sceneId: reviewSurfaceText(op?.sceneId),
      changeId,
      from: Number.isFinite(op?.from) ? op.from : null,
      to: Number.isFinite(op?.to) ? op.to : null,
      expectedText: reviewSurfaceText(op?.expectedText),
      replacementText: reviewSurfaceText(op?.replacementText),
      displayDiff: reviewSurfaceBuildBoundedDisplayDiff(op?.expectedText, op?.replacementText),
      applyState,
      applyLabel: applyState === 'ready' ? 'Применить' : reviewSurfacePresentExactApplyState(applyState),
      applyDisabled: applyState !== 'ready',
      applyReason,
    };
  });

  if (exactPreview.status === 'ready' && applyOps.length > 0) {
    return {
      state: 'ready',
      ops: applyOps,
      batchAction: batchCandidate
        ? {
            changeIds: batchUniqueChangeIds,
            applyState: batchApplyState,
            applyLabel: batchApplyState === 'ready' ? 'Применить все' : reviewSurfacePresentExactApplyState(batchApplyState),
            applyDisabled: batchApplyState !== 'ready',
            applyReason: batchApplyReason,
          }
        : null,
      fullManuscriptAction: fullManuscriptCandidate
        ? {
            changeIds: batchUniqueChangeIds,
            sceneIds: batchSceneIds,
            applyState: fullManuscriptApplyState,
            applyLabel: fullManuscriptApplyState === 'ready'
              ? 'Применить весь рукописный пакет'
              : reviewSurfacePresentExactApplyState(fullManuscriptApplyState),
            applyDisabled: fullManuscriptApplyState !== 'ready',
            applyReason: fullManuscriptApplyReason,
          }
        : null,
      blockedReasons: [],
    };
  }

  return {
    state: exactPreview.status === 'blocked' ? 'blocked' : 'empty',
    ops: [],
    blockedReasons: reviewSurfaceArray(exactPreview.reasons).map((reason) => reviewSurfaceText(reason?.code || reason)).filter(Boolean),
  };
}

function buildReviewSurfaceViewModel(input = {}) {
  const state = reviewSurfaceNormalizeState(input);
  const exactTextPreview = reviewSurfaceBuildExactTextPreview(state);
  return {
    status: state.status,
    error: state.error,
    importSummary: reviewSurfaceBuildImportSummary(state),
    reviewItems: reviewSurfaceBuildReviewItems(state),
    manualOnlyReasons: reviewSurfaceBuildManualOnlyReasons(state),
    orphanComments: reviewSurfaceBuildOrphanComments(state),
    unsupportedObservations: reviewSurfaceBuildUnsupportedObservations(state),
    exactTextPreview,
    formattingReturn: state.formattingReturn,
    lanes: reviewSurfaceBuildLanes(state, exactTextPreview),
    commentLane: reviewSurfaceBuildCommentLane(state),
    sourceMode: state.sourceMode,
    lifecycleState: state.lifecycleState,
    identity: {
      returnArtifactSha256: state.returnArtifactSha256,
      manifestDigest: state.manifestDigest,
      parserProfileDigest: state.parserProfileDigest,
      analysisDigest: state.analysisDigest,
    },
    packageRewriteReport: state.packageRewriteReport,
    reviewProgress: state.reviewProgress,
    terminalSummary: reviewSurfaceBuildTerminalSummary(state),
    receipt: state.receipt,
    reconciliation: state.exactTextApplyReconciliation,
  };
}

function reviewSurfaceRenderKeyValueRows(rows) {
  return rows.map(([key, value]) => `
    <div class="right-rail-form-row">
      <span class="right-rail-form-key">${reviewSurfaceEscapeHtml(key)}</span>
      <span class="right-rail-form-value">${reviewSurfaceEscapeHtml(value || '—')}</span>
    </div>
  `).join('');
}

function reviewSurfaceRenderList(items, renderItem, emptyLabel) {
  if (items.length === 0) {
    return `<div class="tree__empty">${reviewSurfaceEscapeHtml(emptyLabel)}</div>`;
  }
  return `<div class="right-rail-review-list">${items.map((item, index) => renderItem(item, index)).join('')}</div>`;
}

function reviewSurfaceRenderDisplayDiff(tokens) {
  const items = reviewSurfaceArray(tokens);
  if (items.length === 0) return '';
  return `
    <div class="right-rail-review-diff" data-review-display-diff="bounded">
      ${items.map((token) => `
        <span class="right-rail-review-diff-token right-rail-review-diff-token--${reviewSurfaceEscapeHtml(token.kind)}">${reviewSurfaceEscapeHtml(token.text)}</span>
      `).join('')}
    </div>
  `;
}

const STAGE10_LIFECYCLE_PRODUCT_COMMANDS = Object.freeze([
  {
    commandId: 'cmd.comments.importStablePacket',
    label: 'Import comment packet',
    lane: 'comments',
  },
  {
    commandId: 'cmd.collab.conflict.preview',
    label: 'Preview conflict',
    lane: 'conflict',
  },
  {
    commandId: 'cmd.collab.operationExchange.prepare',
    label: 'Prepare exchange',
    lane: 'exchange',
  },
  {
    commandId: 'cmd.collab.operationExchange.localFixturePreview',
    label: 'Preview exchange',
    lane: 'exchange',
  },
  {
    commandId: 'cmd.collab.eventLog.apply',
    label: 'Apply local event log',
    lane: 'collab',
  },
]);

function unwrapStage10LifecycleCommandResult(result = {}) {
  const value = reviewSurfaceIsPlainObject(result?.value) ? result.value : {};
  const bridged = reviewSurfaceIsPlainObject(value.result) ? value.result : value;
  const nested = reviewSurfaceIsPlainObject(bridged.value) ? bridged.value : bridged;
  return reviewSurfaceIsPlainObject(nested) ? nested : {};
}

function getStage10LifecycleReceiptId(result = {}) {
  const unwrapped = unwrapStage10LifecycleCommandResult(result);
  return reviewSurfaceText(
    unwrapped.receipt?.receiptId
    || unwrapped.receipt?.operationId
    || unwrapped.value?.receipt?.receiptId
    || unwrapped.value?.receipt?.operationId,
  );
}

function buildStage10LifecycleCommandRequest(commandId) {
  const productState = reviewSurfaceIsPlainObject(stage10ProductState) ? stage10ProductState : {};
  const activeProjectMatches = Boolean(
    currentProjectId
    && productState.projectId
    && productState.projectId === currentProjectId,
  );
  if (!activeProjectMatches) {
    return { available: false, reason: 'Stage-10 state is not bound to the selected project', payload: null };
  }
  const commandIsPublished = reviewSurfaceArray(productState.controls)
    .some((control) => reviewSurfaceText(control?.commandId) === commandId);
  if (!commandIsPublished) {
    return { available: false, reason: 'Command is not published by the product runtime', payload: null };
  }
  const base = { projectId: productState.projectId };
  if (commandId === 'cmd.comments.importStablePacket') {
    const revisionSession = reviewSurfaceIsPlainObject(reviewSurfaceState?.revisionSession)
      ? reviewSurfaceState.revisionSession
      : {};
    const reviewGraph = reviewSurfaceIsPlainObject(revisionSession.reviewGraph)
      ? revisionSession.reviewGraph
      : {};
    const commentThreads = reviewSurfaceArray(reviewGraph.commentThreads)
      .filter((thread) => reviewSurfaceIsPlainObject(thread) && reviewSurfaceText(thread.threadId))
      .map((thread) => ({
        ...thread,
        messages: reviewSurfaceArray(thread.messages)
          .filter((message) => reviewSurfaceIsPlainObject(message) && reviewSurfaceText(message.body)),
      }))
      .filter((thread) => thread.messages.length > 0);
    if (commentThreads.length === 0) {
      return { available: false, reason: 'No imported review comments are selected', payload: null };
    }
    const sceneId = reviewSurfaceText(
      reviewGraph.commentPlacements?.[0]?.sceneId
      || currentDocumentId,
    );
    if (!sceneId) {
      return { available: false, reason: 'No selected scene is bound to the comment packet', payload: null };
    }
    return {
      available: true,
      reason: '',
      payload: {
        ...base,
        sceneId,
        revisionId: reviewSurfaceText(
          revisionSession.revisionId
          || revisionSession.sessionId
          || revisionSession.baselineHash,
        ),
        reviewIr: {
          schemaVersion: reviewSurfaceText(revisionSession.reviewIr?.schemaVersion || reviewGraph.schemaVersion),
          commentThreads,
        },
        context: {
          sourceSessionId: reviewSurfaceText(revisionSession.sessionId),
          baselineHash: reviewSurfaceText(revisionSession.baselineHash),
          visibleControl: true,
        },
      },
    };
  }
  if (commandId === 'cmd.collab.conflict.preview') {
    const sessions = reviewSurfaceArray(productState.conflictPreviewSessions);
    if (sessions.length === 0) {
      return { available: false, reason: 'No retained collaborator sessions require conflict preview', payload: null };
    }
    return {
      available: true,
      reason: '',
      payload: { ...base, sessions },
    };
  }
  if (commandId === 'cmd.collab.operationExchange.prepare') {
    if (!productState.readiness?.exchangePrepare) {
      return { available: false, reason: 'Canonical event history is empty', payload: null };
    }
    return {
      available: true,
      reason: '',
      payload: {
        ...base,
        transportCapabilityEnabled: true,
        networkAdapterEnabled: false,
      },
    };
  }
  if (commandId === 'cmd.collab.operationExchange.localFixturePreview') {
    const packetId = reviewSurfaceText(productState.latestExchangePacketId);
    return packetId
      ? { available: true, reason: '', payload: { ...base, packetId } }
      : { available: false, reason: 'No retained exchange packet is available', payload: null };
  }
  if (commandId === 'cmd.collab.eventLog.apply') {
    const events = reviewSurfaceArray(productState.pendingCollaboratorEvents);
    if (events.length === 0) {
      return { available: false, reason: 'No admitted collaborator events are pending', payload: null };
    }
    return {
      available: true,
      reason: '',
      payload: { ...base, events },
    };
  }
  return { available: false, reason: 'Stage-10 command is unsupported', payload: null };
}

function renderStage10LifecycleSurface() {
  if (typeof currentProjectId === 'undefined') {
    return '';
  }
  const lifecycleState = (typeof stage10LifecycleSurfaceState !== 'undefined' && stage10LifecycleSurfaceState)
    ? stage10LifecycleSurfaceState
    : {};
  const activeProjectId = currentProjectId;
  const status = reviewSurfaceText(lifecycleState.status) || 'idle';
  const lastCommandId = reviewSurfaceText(lifecycleState.lastCommandId);
  const lastReceiptId = reviewSurfaceText(lifecycleState.lastReceiptId);
  const lastReason = reviewSurfaceText(lifecycleState.lastReason);
  const runningCommandId = reviewSurfaceText(lifecycleState.runningCommandId);
  const productState = reviewSurfaceIsPlainObject(stage10ProductState) ? stage10ProductState : {};
  return `
    <section
      class="right-rail-surface right-rail-surface--review-state"
      data-stage10-lifecycle-surface
      data-stage10-project-id="${reviewSurfaceEscapeHtml(reviewSurfaceText(productState.projectId))}"
      data-stage10-lifecycle-id="${reviewSurfaceEscapeHtml(reviewSurfaceText(productState.lifecycleId))}"
    >
      <div class="right-rail-section__label">Stage-10 lifecycle</div>
      <div class="right-rail-review-state right-rail-review-state--${reviewSurfaceEscapeHtml(status === 'failed' ? 'error' : 'info')}">
        <strong>${reviewSurfaceEscapeHtml(status === 'idle' ? 'Ready' : reviewSurfacePresentStatus(status))}</strong>
        <p>Visible controls route through preload, main IPC, application bootstrap and the Command Kernel.</p>
        ${lastCommandId ? `<div class="right-rail-review-code">${reviewSurfaceEscapeHtml(lastCommandId)}${lastReceiptId ? ` · ${reviewSurfaceEscapeHtml(lastReceiptId)}` : ''}</div>` : ''}
        ${lastReason ? `<div class="right-rail-review-code">${reviewSurfaceEscapeHtml(lastReason)}</div>` : ''}
        <div class="right-rail-review-code">
          events ${Number(productState.eventCount) || 0}
          · conflicts ${reviewSurfaceArray(productState.conflictReportIds).length}
          · exchanges ${reviewSurfaceArray(productState.exchangePacketIds).length}
          · pending ${reviewSurfaceArray(productState.pendingCollaboratorEvents).length}
        </div>
      </div>
      <div class="right-rail-review-actions right-rail-review-actions--batch" data-stage10-lifecycle-controls>
        ${STAGE10_LIFECYCLE_PRODUCT_COMMANDS.map((command) => {
          const request = buildStage10LifecycleCommandRequest(command.commandId);
          const disabled = !activeProjectId || !request.available || Boolean(runningCommandId);
          const reason = !activeProjectId ? 'Project is not open' : request.reason;
          return `
            <button
              type="button"
              class="right-rail-stage10-lifecycle-button"
              data-stage10-product-command="${reviewSurfaceEscapeHtml(command.commandId)}"
              data-stage10-lifecycle-lane="${reviewSurfaceEscapeHtml(command.lane)}"
              ${disabled ? 'disabled aria-disabled="true"' : ''}
              ${reason ? `title="${reviewSurfaceEscapeHtml(reason)}"` : ''}
            >${reviewSurfaceEscapeHtml(command.label)}</button>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderReviewSurfaceMarkup(viewModel) {
  const reconciliationItems = reviewSurfaceArray(viewModel.reconciliation?.items);
  const reconciliationErrors = reviewSurfaceArray(viewModel.reconciliation?.errors);
  const reconciliationMarkup = reconciliationItems.length > 0 || reconciliationErrors.length > 0
    ? `
      <section class="right-rail-surface right-rail-surface--review-state">
        <div class="right-rail-section__label">Восстановление Apply</div>
        ${reviewSurfaceRenderList(reconciliationItems, (item) => {
          const presentation = item.outcome === 'not_applied'
            ? {
                title: 'Изменение не записано',
                body: 'Canonical файл остался в состоянии до Apply.',
                tone: 'blocked',
              }
            : (item.outcome === 'applied_receipt_missing'
              ? {
                  title: 'Запись применена без отчета',
                  body: 'Хэш файла совпал с результатом Apply, recovery snapshot сохранен.',
                  tone: 'manual',
                }
              : {
                  title: 'Состояние записи требует проверки',
                  body: 'Файл, journal и recovery evidence не дают единственного подтвержденного исхода.',
                  tone: 'blocked',
                });
          const canReload = item.safeActions.includes('RELOAD_CANONICAL');
          return `
            <article class="right-rail-review-item right-rail-review-item--${presentation.tone}">
              <div class="right-rail-review-item-head">
                <div class="right-rail-review-item-title">${reviewSurfaceEscapeHtml(presentation.title)}</div>
                <span class="right-rail-review-pill right-rail-review-pill--${presentation.tone}">${reviewSurfaceEscapeHtml(item.outcome)}</span>
              </div>
              <p class="right-rail-review-item-body">${reviewSurfaceEscapeHtml(presentation.body)}</p>
              <div class="right-rail-review-item-meta">
                <span>${reviewSurfaceEscapeHtml(item.sceneId || item.sceneRelativePath || 'сцена')}</span>
                <span>${item.recoveryVerified ? 'recovery подтвержден' : 'recovery не подтвержден'}</span>
              </div>
              ${canReload
                ? `
                  <div class="right-rail-review-actions">
                    <button
                      type="button"
                      class="right-rail-review-apply-button"
                      data-review-reload-reconciled-scene
                      data-operation-id="${reviewSurfaceEscapeHtml(item.operationId)}"
                    >Перечитать файл</button>
                  </div>
                `
                : ''}
              <div class="right-rail-review-code">${reviewSurfaceEscapeHtml(item.operationId)}</div>
            </article>
          `;
        }, 'Нет операций для восстановления.')}
        ${reconciliationErrors.map((item) => `
          <div class="right-rail-review-state right-rail-review-state--error">
            <strong>Journal требует ручной проверки</strong>
            <div class="right-rail-review-code">${reviewSurfaceEscapeHtml(item.code)}</div>
          </div>
        `).join('')}
      </section>
    `
    : '';
  const errorMarkup = viewModel.status === 'error'
    ? `
      <section class="right-rail-surface right-rail-surface--review-state">
        <div class="right-rail-section__label">Проверка</div>
        <div class="right-rail-review-state right-rail-review-state--error">
          <strong>Поверхность проверки недоступна</strong>
          <p>${reviewSurfaceEscapeHtml(viewModel.error?.message || 'Рендерер отклонил состояние проверки.')}</p>
          <div class="right-rail-review-code">${reviewSurfaceEscapeHtml(viewModel.error?.code || 'REVIEW_SURFACE_ERROR')}</div>
        </div>
      </section>
    `
    : '';
  const summary = viewModel.importSummary;
  const summaryRows = reviewSurfaceRenderKeyValueRows([
    ['Проект', summary.projectId || 'локальный'],
    ['Сессия', summary.sessionId || 'не загружена'],
    ['Основа', summary.baselineHash || 'ожидание'],
    ['Source mode', reviewSurfacePresentSourceMode(viewModel.sourceMode)],
    ['Lifecycle', reviewSurfacePresentLifecycleState(viewModel.lifecycleState)],
    ['Статус', reviewSurfacePresentStatus(summary.sessionStatus) || (viewModel.status === 'empty' ? 'пусто' : 'только вручную')],
    ['Текст', String(summary.textChangeCount)],
    ['Структура', String(summary.structuralChangeCount)],
    ['Треды', String(summary.commentThreadCount)],
    ['Привязки', String(summary.commentPlacementCount)],
    ['Диагностика', String(summary.diagnosticCount)],
    ['Решения', String(summary.decisionCount)],
  ]);
  const identityRows = reviewSurfaceRenderKeyValueRows([
    ['Return artifact', viewModel.identity.returnArtifactSha256],
    ['Manifest', viewModel.identity.manifestDigest],
    ['Parser profile', viewModel.identity.parserProfileDigest],
    ['Analysis', viewModel.identity.analysisDigest],
  ]);
  const lanesMarkup = `
    <div class="right-rail-review-lanes" role="list" aria-label="Review lanes">
      ${reviewSurfaceArray(viewModel.lanes).map((lane) => `
        <div class="right-rail-review-lane right-rail-review-lane--${reviewSurfaceEscapeHtml(lane.state)}" role="listitem">
          <div class="right-rail-review-lane-head">
            <span>${reviewSurfaceEscapeHtml(lane.label)}</span>
            <span class="right-rail-review-lane-count">${reviewSurfaceEscapeHtml(String(lane.count))}</span>
          </div>
          <div class="right-rail-review-lane-detail">${reviewSurfaceEscapeHtml(lane.detail)}</div>
        </div>
      `).join('')}
    </div>
  `;
  const reviewItemsMarkup = reviewSurfaceRenderList(viewModel.reviewItems, (item) => `
    <article class="right-rail-review-item right-rail-review-item--${reviewSurfaceEscapeHtml(item.tone)}">
      <div class="right-rail-review-item-head">
        <div class="right-rail-review-item-title">${reviewSurfaceEscapeHtml(item.title)}</div>
        <span class="right-rail-review-pill right-rail-review-pill--${reviewSurfaceEscapeHtml(item.tone)}">${reviewSurfaceEscapeHtml(item.meta[1] || item.tone)}</span>
      </div>
      <p class="right-rail-review-item-body">${reviewSurfaceEscapeHtml(item.body)}</p>
      <div class="right-rail-review-item-meta">${item.meta.map((value) => `<span>${reviewSurfaceEscapeHtml(value)}</span>`).join('')}</div>
    </article>
  `, 'Нет импортированных элементов проверки.');
  const manualOnlyMarkup = reviewSurfaceRenderList(viewModel.manualOnlyReasons, (reasonCode) => `
    <article class="right-rail-review-item right-rail-review-item--manual">
      <div class="right-rail-review-item-head">
        <div class="right-rail-review-item-title">${reviewSurfaceEscapeHtml(reasonCode)}</div>
        <span class="right-rail-review-pill right-rail-review-pill--manual">Только вручную</span>
      </div>
    </article>
  `, 'Нет ручных ограничений.');
  const orphanMarkup = reviewSurfaceRenderList(viewModel.orphanComments, (item) => `
    <article class="right-rail-review-item right-rail-review-item--orphan">
      <div class="right-rail-review-item-head">
        <div class="right-rail-review-item-title">${reviewSurfaceEscapeHtml(item.threadId || item.itemId)}</div>
        <span class="right-rail-review-pill right-rail-review-pill--blocked">${reviewSurfaceEscapeHtml(item.status)}</span>
      </div>
      <p class="right-rail-review-item-body">${reviewSurfaceEscapeHtml(item.body)}</p>
      <div class="right-rail-review-item-meta">${item.reasonCodes.map((value) => `<span>${reviewSurfaceEscapeHtml(value)}</span>`).join('')}</div>
    </article>
  `, 'Нет потерянных или непривязанных комментариев.');
  const commentLaneMarkup = reviewSurfaceRenderList(viewModel.commentLane, (item) => `
    <article class="right-rail-review-item right-rail-review-item--comments">
      <div class="right-rail-review-item-head">
        <div class="right-rail-review-item-title">${reviewSurfaceEscapeHtml(item.threadId)}</div>
        <span class="right-rail-review-pill right-rail-review-pill--${item.resolved ? 'readonly' : 'comments'}">${reviewSurfaceEscapeHtml(item.outcome)}</span>
      </div>
      <p class="right-rail-review-item-body">${reviewSurfaceEscapeHtml(item.body)}</p>
      <div class="right-rail-review-item-meta">
        <span>${reviewSurfaceEscapeHtml(item.author)}</span>
        <span>${reviewSurfaceEscapeHtml(item.createdAt || 'no timestamp')}</span>
        <span>${reviewSurfaceEscapeHtml(`${item.replies} replies`)}</span>
      </div>
      ${item.reasonCodes.length > 0 ? `<div class="right-rail-review-code">${item.reasonCodes.map((value) => reviewSurfaceEscapeHtml(value)).join(' ')}</div>` : ''}
    </article>
  `, 'Нет комментариев в независимой lane.');
  const unsupportedMarkup = reviewSurfaceRenderList(viewModel.unsupportedObservations, (item) => `
    <article class="right-rail-review-item right-rail-review-item--readonly">
      <div class="right-rail-review-item-head">
        <div class="right-rail-review-item-title">${reviewSurfaceEscapeHtml(item.structuralKind || item.itemId)}</div>
        <span class="right-rail-review-pill right-rail-review-pill--readonly">Только чтение</span>
      </div>
      <p class="right-rail-review-item-body">${reviewSurfaceEscapeHtml(item.reason)}</p>
    </article>
  `, 'Нет неподдержанных наблюдений.');
  const exactPreview = viewModel.exactTextPreview;
  const exactPreviewMarkup = exactPreview.state === 'ready'
    ? `
      ${exactPreview.fullManuscriptAction
        ? `
          <div class="right-rail-review-actions right-rail-review-actions--batch">
            <button
              type="button"
              class="right-rail-review-apply-button"
              data-review-apply-full-manuscript-exact
              ${exactPreview.fullManuscriptAction.applyDisabled ? 'disabled aria-disabled="true"' : ''}
            >${reviewSurfaceEscapeHtml(exactPreview.fullManuscriptAction.applyLabel)}</button>
          </div>
          ${exactPreview.fullManuscriptAction.applyReason ? `<div class="right-rail-review-code">${reviewSurfaceEscapeHtml(exactPreview.fullManuscriptAction.applyReason)}</div>` : ''}
        `
        : ''}
      ${exactPreview.batchAction
        ? `
          <div class="right-rail-review-actions right-rail-review-actions--batch">
            <button
              type="button"
              class="right-rail-review-apply-button"
              data-review-apply-exact-batch
              data-change-ids="${reviewSurfaceEscapeHtml(exactPreview.batchAction.changeIds.join(','))}"
              ${exactPreview.batchAction.applyDisabled ? 'disabled aria-disabled="true"' : ''}
            >${reviewSurfaceEscapeHtml(exactPreview.batchAction.applyLabel)}</button>
          </div>
          ${exactPreview.batchAction.applyReason ? `<div class="right-rail-review-code">${reviewSurfaceEscapeHtml(exactPreview.batchAction.applyReason)}</div>` : ''}
        `
        : ''}
      ${reviewSurfaceRenderList(exactPreview.ops, (op) => `
        <article class="right-rail-review-item right-rail-review-item--preview">
          <div class="right-rail-review-item-head">
            <div class="right-rail-review-item-title">${reviewSurfaceEscapeHtml(op.changeId || op.itemId)}</div>
            <span class="right-rail-review-pill right-rail-review-pill--${reviewSurfaceEscapeHtml(op.applyState)}">${reviewSurfaceEscapeHtml(op.applyLabel)}</span>
          </div>
          <p class="right-rail-review-item-body">"${reviewSurfaceEscapeHtml(op.expectedText)}" -> "${reviewSurfaceEscapeHtml(op.replacementText)}"</p>
          ${reviewSurfaceRenderDisplayDiff(op.displayDiff)}
          <div class="right-rail-review-item-meta">
            <span>${reviewSurfaceEscapeHtml(op.sceneId || 'сцена')}</span>
            <span>${reviewSurfaceEscapeHtml(`${op.from ?? '—'}:${op.to ?? '—'}`)}</span>
          </div>
          <div class="right-rail-review-actions">
            <button
              type="button"
              class="right-rail-review-apply-button"
              data-review-apply-exact-change
              data-change-id="${reviewSurfaceEscapeHtml(op.changeId)}"
              ${op.applyDisabled ? 'disabled aria-disabled="true"' : ''}
            >${reviewSurfaceEscapeHtml(op.applyLabel)}</button>
          </div>
          ${op.applyReason ? `<div class="right-rail-review-code">${reviewSurfaceEscapeHtml(op.applyReason)}</div>` : ''}
        </article>
      `, 'Нет точного текстового предпросмотра.')}
    `
    : (
      exactPreview.state === 'blocked'
        ? `<div class="right-rail-review-state right-rail-review-state--blocked"><strong>Предпросмотр заблокирован</strong><p>${reviewSurfaceEscapeHtml(exactPreview.blockedReasons[0] || 'Нужна ручная проверка, прежде чем показать точный текстовый шаг.')}</p></div>`
        : '<div class="tree__empty">Нет точного текстового предпросмотра.</div>'
    );
  const formattingReturn = viewModel.formattingReturn;
  const formattingDiagnosticsMarkup = formattingReturn?.diagnostics?.length > 0
    ? reviewSurfaceRenderList(formattingReturn.diagnostics, (diagnostic) => `
        <article class="right-rail-review-item right-rail-review-item--manual">
          <div class="right-rail-review-item-head">
            <div class="right-rail-review-item-title">${reviewSurfaceEscapeHtml(diagnostic.code)}</div>
            <span class="right-rail-review-pill right-rail-review-pill--manual">Ручная проверка</span>
          </div>
          <div class="right-rail-review-item-meta">
            <span>${reviewSurfaceEscapeHtml(diagnostic.sceneId || 'проект')}</span>
            <span>${reviewSurfaceEscapeHtml(diagnostic.blockId || `абзац ${diagnostic.paragraphIndex}`)}</span>
          </div>
          ${diagnostic.keys.length > 0 ? `<div class="right-rail-review-code">${reviewSurfaceEscapeHtml(diagnostic.keys.join(', '))}</div>` : ''}
        </article>
      `, '')
    : '';
  const formattingReturnMarkup = formattingReturn
    ? `
      <div class="right-rail-review-state ${formattingReturn.replayVerified ? 'right-rail-review-state--info' : 'right-rail-review-state--manual'}">
        <strong>${reviewSurfaceEscapeHtml(formattingReturn.replayVerified ? 'Форматирование применено' : formattingReturn.partial ? 'Безопасная часть готова' : 'Форматирование из Word готово')}</strong>
        <p>${reviewSurfaceEscapeHtml(`${formattingReturn.operationCount} операций в ${formattingReturn.sceneCount} сценах${formattingReturn.diagnosticCount > 0 ? `, вручную: ${formattingReturn.diagnosticCount}` : ''}`)}</p>
        ${formattingReturn.code ? `<div class="right-rail-review-code">${reviewSurfaceEscapeHtml(formattingReturn.code)}</div>` : ''}
      </div>
      ${formattingDiagnosticsMarkup}
      <div class="right-rail-review-actions">
        <button
          type="button"
          class="right-rail-review-apply-button"
          data-review-apply-formatting-return
          aria-label="Применить форматирование из Word"
          ${!formattingReturn.ready || formattingReturn.replayVerified ? 'disabled aria-disabled="true"' : ''}
        >${reviewSurfaceEscapeHtml(formattingReturn.replayVerified ? 'Применено' : formattingReturn.partial ? 'Применить безопасную часть' : 'Применить форматирование')}</button>
        <button
          type="button"
          class="right-rail-review-apply-button"
          data-review-inspect-formatting-replay
          aria-label="Проверить сохраненное форматирование после повторного открытия"
        >Проверить повтор</button>
      </div>
    `
    : `
      <div class="tree__empty">Нет безопасного форматирования для применения.</div>
      <div class="right-rail-review-actions">
        <button
          type="button"
          class="right-rail-review-apply-button"
          data-review-inspect-formatting-replay
          aria-label="Проверить сохраненное форматирование после повторного открытия"
        >Проверить повтор</button>
      </div>
    `;
  const receiptMarkup = viewModel.receipt
    ? `
      <div class="right-rail-form-grid">
        ${reviewSurfaceRenderKeyValueRows([
          ['Проект', viewModel.receipt.projectId],
          ['Operation ID', viewModel.receipt.operationId],
          ['Сессия', viewModel.receipt.sessionId],
          ['Сцена', viewModel.receipt.sceneId],
          ['Изменение', viewModel.receipt.changeId],
          ['Основа до записи', viewModel.receipt.baselineHashBefore],
          ['Операция', viewModel.receipt.operationKind],
          ['Статус записи', reviewSurfacePresentStatus(viewModel.receipt.writeStatus) || viewModel.receipt.writeStatus],
          ['Backup ID', viewModel.receipt.backupId],
          ['Записано', viewModel.receipt.writtenAt],
          ['Байты', String(viewModel.receipt.bytesWritten)],
          ['Транзакция', viewModel.receipt.transactionId],
          ['Входной хэш', viewModel.receipt.inputHash],
          ['Выходной хэш', viewModel.receipt.outputHash],
          ['Recovery', viewModel.receipt.recovery.snapshotCreated ? 'снимок создан' : 'снимок отсутствует'],
        ])}
      </div>
    `
    : '<div class="tree__empty">Нет отчета о записи.</div>';
  const rewriteReport = viewModel.packageRewriteReport;
  const reportMarkup = rewriteReport
    ? `
      <div class="right-rail-review-state ${rewriteReport.canWriteManuscript || rewriteReport.canApply ? 'right-rail-review-state--blocked' : 'right-rail-review-state--info'}">
        <strong>Package Rewrite Report</strong>
        <p>${reviewSurfaceEscapeHtml(rewriteReport.reportId || 'redacted report')}</p>
      </div>
      ${reviewSurfaceRenderList(rewriteReport.changedBlocks, (block) => `
        <article class="right-rail-review-item right-rail-review-item--manual">
          <div class="right-rail-review-item-head">
            <div class="right-rail-review-item-title">${reviewSurfaceEscapeHtml(block.blockId)}</div>
            <span class="right-rail-review-pill right-rail-review-pill--manual">redacted</span>
          </div>
          <div class="right-rail-review-code">${reviewSurfaceEscapeHtml(block.originalDigest)} -> ${reviewSurfaceEscapeHtml(block.finalDigest)}</div>
          <p class="right-rail-review-item-body">${reviewSurfaceEscapeHtml(block.originalExcerpt)} -> ${reviewSurfaceEscapeHtml(block.finalExcerpt)}</p>
        </article>
      `, 'Нет измененных блоков report.')}
    `
    : '<div class="tree__empty">Нет Package Rewrite Report.</div>';
  const progress = viewModel.reviewProgress;
  const progressMarkup = `
    <div class="right-rail-review-progress" data-review-progress-state="${reviewSurfaceEscapeHtml(progress.state)}">
      <div class="right-rail-review-progress-head">
        <span>${reviewSurfaceEscapeHtml(progress.label)}</span>
        <span>${reviewSurfaceEscapeHtml(`${progress.percent}%`)}</span>
      </div>
      <div class="right-rail-review-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${reviewSurfaceEscapeHtml(String(progress.percent))}">
        <span style="width: ${reviewSurfaceEscapeHtml(String(progress.percent))}%"></span>
      </div>
      ${progress.cancellable
        ? `
          <button
            type="button"
            class="right-rail-review-apply-button right-rail-review-apply-button--secondary"
            data-review-cancel-operation
            data-operation-id="${reviewSurfaceEscapeHtml(progress.operationId)}"
          >Cancel</button>
        `
        : ''}
    </div>
  `;
  const terminalMarkup = `
    <div class="right-rail-review-state right-rail-review-state--info">
      <strong>${reviewSurfaceEscapeHtml(reviewSurfacePresentStatus(viewModel.terminalSummary.status) || viewModel.terminalSummary.status)}</strong>
      <p>${reviewSurfaceEscapeHtml(viewModel.terminalSummary.detail)}</p>
      ${viewModel.terminalSummary.reason ? `<div class="right-rail-review-code">${reviewSurfaceEscapeHtml(viewModel.terminalSummary.reason)}</div>` : ''}
    </div>
  `;

  return `
    ${errorMarkup}
    ${reconciliationMarkup}
    <section class="right-rail-surface right-rail-surface--review-header">
      <div class="right-rail-section__label">Проверка правок</div>
      <div class="right-rail-review-state ${viewModel.status === 'empty' ? 'right-rail-review-state--empty' : 'right-rail-review-state--info'}">
        <strong>Безопасная проверка</strong>
        <p>Запись в проект идет только через подтвержденный путь.</p>
      </div>
    </section>
    ${renderStage10LifecycleSurface()}
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Сводка импорта</div>
      <div class="right-rail-form-grid">${summaryRows}</div>
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Lanes</div>
      ${lanesMarkup}
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Identity</div>
      <div class="right-rail-form-grid">${identityRows}</div>
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Элементы проверки</div>
      ${reviewItemsMarkup}
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Почему только вручную</div>
      ${manualOnlyMarkup}
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Comment lane</div>
      ${commentLaneMarkup}
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Потерянные комментарии</div>
      ${orphanMarkup}
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Неподдержанные случаи</div>
      ${unsupportedMarkup}
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Точный текстовый шаг</div>
      ${exactPreviewMarkup}
    </section>
    <section class="right-rail-surface right-rail-surface--review-state">
      <div class="right-rail-section__label">Форматирование Word</div>
      ${formattingReturnMarkup}
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Rewrite report</div>
      ${reportMarkup}
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Progress</div>
      ${progressMarkup}
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Apply summary</div>
      ${terminalMarkup}
    </section>
    <section class="right-rail-surface">
      <div class="right-rail-section__label">Отчет записи</div>
      ${receiptMarkup}
    </section>
  `;
}
// REVIEW_SURFACE_PRESENTATION_END

const ATLAS_DESIGN_OS_SLOT_RESOLUTION = resolveAtlasFeatureDesignOsSlots({
  manifest: YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1,
  commandCatalog: listCommandCatalog(),
  providerCatalog: WORKSPACE_QUERY_RECORDS,
  slotCatalog: ATLAS_DESIGN_OS_SLOT_CATALOG_V1,
});
if (!ATLAS_DESIGN_OS_SLOT_RESOLUTION.ok) {
  throw new Error(`ATLAS_DESIGN_OS_BINDING_FAILED:${ATLAS_DESIGN_OS_SLOT_RESOLUTION.reason || 'UNKNOWN'}`);
}
const ATLAS_SURFACE_PROVIDER_BY_ID = Object.freeze(Object.fromEntries(ATLAS_SURFACE_IDS.map((surfaceId) => {
  const binding = getAtlasFeatureSurfaceBinding(ATLAS_DESIGN_OS_SLOT_RESOLUTION, surfaceId);
  if (!binding?.providerId) throw new Error(`ATLAS_DESIGN_OS_PROVIDER_UNRESOLVED:${surfaceId}`);
  return [surfaceId, binding.providerId];
})));

function buildY4RendererLiveWiringProductTruth() {
  return {
    project_id: normalizeProjectId(currentProjectId) || 'y4-renderer-live-wiring',
    scenes: { s1: 'renderer-live-wiring' },
    active_scene_id: 's1',
  };
}

function applyDesignOsRuntimeWiring() {
  const root = document.documentElement;
  try {
    designOsRuntimeBootstrap = createRepoGroundedDesignOsBrowserRuntime({
      productTruth: buildY4RendererLiveWiringProductTruth(),
    });
    if (root) {
      root.setAttribute('data-y4-renderer-live-wiring', Y4_RENDERER_LIVE_WIRING_ACTIVE);
    }
    return designOsRuntimeBootstrap;
  } catch {
    designOsRuntimeBootstrap = null;
    if (root) {
      root.removeAttribute('data-y4-renderer-live-wiring');
    }
    return null;
  }
}

function normalizeToolbarConfiguratorProfileName(profileName) {
  const normalizedProfileName = typeof profileName === 'string' ? profileName.trim().toLowerCase() : '';
  return normalizedProfileName === 'master' || normalizedProfileName === 'pro' ? 'master' : 'minimal';
}

function normalizeToolbarConfiguratorItemIds(rawIds) {
  const normalized = createToolbarProfileState(Array.isArray(rawIds) ? rawIds : []);
  return Array.isArray(normalized?.toolbarProfiles?.minimal)
    ? [...normalized.toolbarProfiles.minimal]
    : [];
}

function createToolbarConfiguratorCanonicalProfileIds() {
  return [...TOOLBAR_CONFIGURATOR_CANONICAL_LIVE_IDS];
}

function createToolbarConfiguratorSeedState() {
  const canonicalMinimalState = createCanonicalMinimalToolbarProfileState();
  const canonicalMinimalIds = Array.isArray(canonicalMinimalState?.toolbarProfiles?.minimal)
    ? canonicalMinimalState.toolbarProfiles.minimal
    : createToolbarConfiguratorCanonicalProfileIds();
  return Object.freeze({
    version: 3,
    activeToolbarProfile: TOOLBAR_CONFIGURATOR_DEFAULT_ACTIVE_PROFILE,
    toolbarProfiles: Object.freeze({
      minimal: Object.freeze([...canonicalMinimalIds]),
      master: Object.freeze(createToolbarConfiguratorCanonicalProfileIds()),
    }),
  });
}

function createToolbarConfiguratorState(rawState = {}) {
  const source = isPlainObject(rawState) ? rawState : {};
  const rawToolbarProfiles = isPlainObject(source.toolbarProfiles) ? source.toolbarProfiles : {};
  const hasMinimal = Object.prototype.hasOwnProperty.call(rawToolbarProfiles, 'minimal');
  const hasMaster = Object.prototype.hasOwnProperty.call(rawToolbarProfiles, 'master');
  const hasPro = Object.prototype.hasOwnProperty.call(rawToolbarProfiles, 'pro');

  return Object.freeze({
    version: 3,
    activeToolbarProfile: normalizeToolbarConfiguratorProfileName(source.activeToolbarProfile),
    toolbarProfiles: Object.freeze({
      minimal: Object.freeze(normalizeToolbarConfiguratorItemIds(hasMinimal ? rawToolbarProfiles.minimal : [])),
      master: Object.freeze(
        hasMaster
          ? normalizeToolbarConfiguratorItemIds(rawToolbarProfiles.master)
          : hasPro
            ? normalizeToolbarConfiguratorItemIds(rawToolbarProfiles.pro)
          : createToolbarConfiguratorCanonicalProfileIds()
      ),
    }),
  });
}

function readToolbarConfiguratorStoredState(projectId = currentProjectId) {
  const storageKey = getToolbarProfileStorageKey(projectId);
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeToolbarConfiguratorStoredState(projectId, state) {
  const storageKey = getToolbarProfileStorageKey(projectId);
  if (!storageKey) return false;
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function resolveToolbarConfiguratorState(projectId = currentProjectId) {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) {
    return {
      source: 'ephemeral',
      shouldPersist: false,
      shouldConsumeLegacySource: false,
      state: createToolbarConfiguratorSeedState(),
    };
  }

  const rawState = readToolbarConfiguratorStoredState(normalizedProjectId);
  if (isPlainObject(rawState)) {
    const normalizedState = createToolbarConfiguratorState(rawState);
    const effectiveState = isImplicitExpandedToolbarProfileState(normalizedState)
      ? createToolbarConfiguratorSeedState()
      : normalizedState;
    return {
      source: 'persisted',
      shouldPersist: JSON.stringify(rawState) !== JSON.stringify(effectiveState),
      shouldConsumeLegacySource: false,
      state: effectiveState,
    };
  }

  const resolution = resolveToolbarProfileStateForProjectSwitch(localStorage, normalizedProjectId);
  const minimalIds = Array.isArray(resolution?.state?.toolbarProfiles?.minimal)
    ? resolution.state.toolbarProfiles.minimal
    : [];
  const shouldPersist = resolution?.shouldPersist !== false;
  const shouldConsumeLegacySource = Boolean(resolution?.shouldConsumeLegacySource);

  if (shouldConsumeLegacySource) {
    return {
      source: resolution.source || 'legacy',
      shouldPersist,
      shouldConsumeLegacySource,
      state: createToolbarConfiguratorState({
        activeToolbarProfile: TOOLBAR_CONFIGURATOR_DEFAULT_ACTIVE_PROFILE,
        toolbarProfiles: {
          minimal: minimalIds,
          master: createToolbarConfiguratorCanonicalProfileIds(),
        },
      }),
    };
  }

  return {
    source: resolution?.source || 'seed',
    shouldPersist,
    shouldConsumeLegacySource: false,
    state: createToolbarConfiguratorSeedState(),
  };
}

let configuratorBucketState = createToolbarConfiguratorSeedState();
let activeConfiguratorDragPayload = null;
let activeConfiguratorDragElement = null;
let activeConfiguratorBucketItemSelection = {
  bucketKey: '',
  itemId: '',
};
const AUTO_SAVE_DELAY = 600;
const HOTPATH_RENDER_DEBOUNCE_MS = 32;
const HOTPATH_FULL_RENDER_MIN_INTERVAL_MS = 280;
const HOTPATH_PAGINATION_IDLE_DELAY_MS = 220;
const HOTPATH_PAGINATION_IDLE_TIMEOUT_MS = 750;
const PAGINATION_MEASURE_BATCH_SIZE = 12;
const CENTRAL_SHEET_STRIP_PROOF_CLASS = 'tiptap-host--central-sheet-strip-proof';
const CENTRAL_SHEET_STRIP_MEASURING_CLASS = 'tiptap-host--central-sheet-strip-measuring';
const CENTRAL_SHEET_RUNTIME_WINDOW_DOM_BUDGET = 15;
const CENTRAL_SHEET_RUNTIME_WINDOW_OVERSCAN = 6;
const CENTRAL_SHEET_TEXT_MASK_BLEED_PX = 2;
// Million-character single-paragraph loads need chunked presentation before Range rects drift horizontally.
const CENTRAL_SHEET_LARGE_PAYLOAD_FAST_PATH_CHAR_THRESHOLD = 1000000;
const CENTRAL_SHEET_LARGE_PAYLOAD_ESTIMATED_CHARS_PER_PAGE = 520;
const CENTRAL_SHEET_LARGE_PAYLOAD_PRESENTATION_CHUNK_TARGET_CHARS = 520;
const CENTRAL_SHEET_LARGE_PAYLOAD_PRESENTATION_CHUNK_MIN_CHARS = 360;
const CENTRAL_SHEET_LARGE_PAYLOAD_VISIBLE_PAGE_CHARS = 1600;
const CENTRAL_SHEET_LARGE_PAYLOAD_LINE_WIDTH_SAFETY_PX = 12;
const UI_ERROR_MAP_SCHEMA_VERSION = 'ui-error-map.v1';
const UI_ERROR_FALLBACK_MESSAGE = 'Операция не выполнена';
const UI_ERROR_FALLBACK_SEVERITY = 'ERROR';

const ZOOM_DEFAULT = 1.0;
const DEFAULT_ACTIVE_BOOK_PROFILE = createDefaultBookProfile();
const DEFAULT_PREVIEW_CHROME_STATE = createPreviewChromeState();
const DEFAULT_LAYOUT_PREVIEW_STATE = createLayoutPreviewState();

let activeBookProfileState = DEFAULT_ACTIVE_BOOK_PROFILE;
let activePreviewChromeState = DEFAULT_PREVIEW_CHROME_STATE;
let activeLayoutPreviewState = DEFAULT_LAYOUT_PREVIEW_STATE;
const layoutPreviewSnapshotCache = createLayoutPreviewSnapshotCache();
let layoutPreviewHost = null;
let layoutPreviewRefreshTimerId = null;
let centralSheetStripRefreshFrameId = null;
let centralSheetStripScrollContainer = null;
let centralSheetStripGlobalScrollBound = false;
let centralSheetStripRefreshMode = 'full';
let centralSheetStripCachedRuntimeState = null;
let centralSheetStripCacheDirty = false;
let centralSheetStripLastScrollTop = 0;
let centralSheetStripLastAppliedSignature = '';
let centralSheetStripPendingStructuralInput = false;
let centralSheetStripStructuralSettleFrameId = null;
let centralSheetStripStructuralSettleSignature = '';
let centralSheetStripStructuralStablePassCount = 0;
let centralSheetStripStructuralGuardActive = false;
let centralSheetStripLargePayloadFastPathActive = false;
let centralSheetStripLargePayloadFastPathText = '';
let centralSheetStripLargePayloadFastPathDirty = false;
let centralSheetStripLargePayloadFastPathRevision = 0;
let centralSheetStripTextMeasureCanvas = null;
let derivedPageMapRuntimeBridgeRefreshSerial = 0;

function resetCentralSheetStripStructuralSettleState() {
  if (centralSheetStripStructuralSettleFrameId) {
    window.cancelAnimationFrame(centralSheetStripStructuralSettleFrameId);
    centralSheetStripStructuralSettleFrameId = null;
  }
  centralSheetStripStructuralSettleSignature = '';
  centralSheetStripStructuralStablePassCount = 0;
}

function getActivePreviewChrome(source = activePreviewChromeState) {
  return createPreviewChromeState(source);
}

function getActiveBookProfile(source = activeBookProfileState) {
  const normalizedResult = normalizeBookProfile(source);
  return normalizedResult.ok ? normalizedResult.value : DEFAULT_ACTIVE_BOOK_PROFILE;
}

function getPageMetrics({
  profile = activeBookProfileState,
  zoom = ZOOM_DEFAULT,
  pxPerMm = PX_PER_MM_AT_ZOOM_1,
} = {}) {
  const normalizedResult = normalizeBookProfile(profile);
  const resolvedProfile = normalizedResult.ok ? normalizedResult.value : DEFAULT_ACTIVE_BOOK_PROFILE;
  const metricsResult = resolvePageLayoutMetrics(resolvedProfile, {
    zoom,
    pxPerMm,
  });
  if (metricsResult.ok) {
    return metricsResult.value;
  }

  if (resolvedProfile === DEFAULT_ACTIVE_BOOK_PROFILE) {
    return null;
  }

  const fallbackResult = resolvePageLayoutMetrics(DEFAULT_ACTIVE_BOOK_PROFILE, {
    zoom: ZOOM_DEFAULT,
    pxPerMm: PX_PER_MM_AT_ZOOM_1,
  });
  if (!fallbackResult.ok) {
    return null;
  }

  return fallbackResult.value;
}

function applyPageGeometryCssVars(metrics) {
  if (!metrics) {
    return;
  }

  document.documentElement.style.setProperty('--page-width-px', `${Math.round(metrics.pageWidthPx)}px`);
  document.documentElement.style.setProperty('--page-height-px', `${Math.round(metrics.pageHeightPx)}px`);
  document.documentElement.style.setProperty('--page-margin-top-px', `${Math.round(metrics.marginTopPx)}px`);
  document.documentElement.style.setProperty('--page-margin-right-px', `${Math.round(metrics.marginRightPx)}px`);
  document.documentElement.style.setProperty('--page-margin-bottom-px', `${Math.round(metrics.marginBottomPx)}px`);
  document.documentElement.style.setProperty('--page-margin-left-px', `${Math.round(metrics.marginLeftPx)}px`);
}

function getRootCssPxValue(name, fallback = 0) {
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableSerializeRuntimeAdapter(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeRuntimeAdapter(item)).join(',')}]`;
  }
  if (type === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerializeRuntimeAdapter(value[key])}`).join(',')}}`;
  }
  return 'null';
}

function hashRuntimeAdapterValue(value) {
  let hash = 0x811c9dc5;
  const source = stableSerializeRuntimeAdapter(value);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function getCentralSheetContentMetrics(metrics) {
  return {
    widthPx: Math.max(1, Math.round(metrics.pageWidthPx - metrics.marginLeftPx - metrics.marginRightPx)),
    heightPx: Math.max(1, Math.round(metrics.pageHeightPx - metrics.marginTopPx - metrics.marginBottomPx)),
  };
}

function resolveCentralSheetLineHeightPx(element) {
  if (!(element instanceof HTMLElement)) {
    return 32;
  }
  const styles = window.getComputedStyle(element);
  const parsedLineHeight = Number.parseFloat(styles.lineHeight);
  const parsedFontSize = Number.parseFloat(styles.fontSize);
  const fallbackLineHeight = Number.isFinite(parsedFontSize) && parsedFontSize > 0
    ? parsedFontSize * 1.625
    : 32;
  return Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
    ? parsedLineHeight
    : fallbackLineHeight;
}

function normalizeLargePayloadFastPathText(value = '') {
  return String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function shouldUseCentralSheetLargePayloadFastPath(text = '') {
  if (!isTiptapMode) {
    return false;
  }
  const normalizedText = normalizeLargePayloadFastPathText(text);
  return (
    normalizedText.length >= CENTRAL_SHEET_LARGE_PAYLOAD_FAST_PATH_CHAR_THRESHOLD
    && !normalizedText.includes('\n')
  );
}

function clearCentralSheetLargePayloadFastPath() {
  centralSheetStripLargePayloadFastPathActive = false;
  centralSheetStripLargePayloadFastPathText = '';
  centralSheetStripLargePayloadFastPathDirty = false;
  centralSheetStripLargePayloadFastPathRevision = 0;
  if (editor instanceof HTMLElement) {
    delete editor.dataset.centralSheetLargePayloadFastPathActive;
  }
}

function beginCentralSheetLargePayloadFastPath(text = '') {
  centralSheetStripLargePayloadFastPathActive = true;
  centralSheetStripLargePayloadFastPathText = normalizeLargePayloadFastPathText(text);
  centralSheetStripLargePayloadFastPathDirty = false;
  centralSheetStripLargePayloadFastPathRevision += 1;
  if (editor instanceof HTMLElement) {
    editor.dataset.centralSheetLargePayloadFastPathActive = 'true';
  }
}

function markCentralSheetLargePayloadFastPathDirty() {
  if (!centralSheetStripLargePayloadFastPathActive) {
    return;
  }
  centralSheetStripLargePayloadFastPathDirty = true;
  centralSheetStripLargePayloadFastPathRevision += 1;
}

function readCentralSheetLargePayloadFastPathText() {
  if (!centralSheetStripLargePayloadFastPathActive) {
    return '';
  }
  if (!centralSheetStripLargePayloadFastPathDirty) {
    return centralSheetStripLargePayloadFastPathText;
  }
  const proseMirror = editor instanceof HTMLElement
    ? editor.querySelector('.ProseMirror')
    : null;
  centralSheetStripLargePayloadFastPathText = proseMirror instanceof HTMLElement
    ? String(proseMirror.textContent || '').replace(/\u00a0/g, ' ')
    : centralSheetStripLargePayloadFastPathText;
  centralSheetStripLargePayloadFastPathDirty = false;
  return centralSheetStripLargePayloadFastPathText;
}

function isCentralSheetLargePayloadBlockedInputType(inputType = '') {
  return (
    inputType === 'insertParagraph'
    || inputType === 'insertLineBreak'
  );
}

function shouldBlockCentralSheetLargePayloadPaste(event) {
  if (!centralSheetStripLargePayloadFastPathActive) {
    return false;
  }
  const clipboardText = typeof event?.clipboardData?.getData === 'function'
    ? event.clipboardData.getData('text/plain')
    : '';
  return normalizeLargePayloadFastPathText(clipboardText).includes('\n');
}

function blockCentralSheetLargePayloadStructuralEdit(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  updateWarningStateText('large document structural edit blocked');
}

function estimateCentralSheetPageCountFromText(text = '') {
  const normalizedLength = Math.max(0, normalizeLargePayloadFastPathText(text).length);
  return Math.max(
    1,
    Math.ceil(normalizedLength / CENTRAL_SHEET_LARGE_PAYLOAD_ESTIMATED_CHARS_PER_PAGE),
  );
}

function splitLargeSingleParagraphForPresentation(text = '') {
  const normalizedText = normalizeLargePayloadFastPathText(text);
  const chunks = [];
  let cursor = 0;
  while (cursor < normalizedText.length) {
    const hardEnd = Math.min(
      normalizedText.length,
      cursor + CENTRAL_SHEET_LARGE_PAYLOAD_PRESENTATION_CHUNK_TARGET_CHARS,
    );
    if (hardEnd >= normalizedText.length) {
      chunks.push(normalizedText.slice(cursor));
      break;
    }
    const minEnd = Math.min(
      normalizedText.length,
      cursor + CENTRAL_SHEET_LARGE_PAYLOAD_PRESENTATION_CHUNK_MIN_CHARS,
    );
    const candidate = normalizedText.slice(minEnd, hardEnd);
    const whitespaceOffset = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\t'));
    const splitAt = whitespaceOffset >= 0
      ? minEnd + whitespaceOffset + 1
      : hardEnd;
    chunks.push(normalizedText.slice(cursor, splitAt));
    cursor = splitAt;
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

function buildLargeSingleParagraphPresentationDoc(text = '') {
  const chunks = splitLargeSingleParagraphForPresentation(text);
  return {
    type: 'doc',
    content: chunks.length > 0
      ? chunks.map((chunk) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: chunk }],
      }))
      : [{ type: 'paragraph' }],
  };
}

function ensureCentralSheetStripShell() {
  if (!isTiptapMode || !(editor instanceof HTMLElement)) {
    return null;
  }
  let strip = editor.querySelector('.tiptap-sheet-strip');
  if (strip instanceof HTMLElement) {
    return strip;
  }
  strip = document.createElement('div');
  strip.className = 'tiptap-sheet-strip';
  editor.prepend(strip);
  return strip;
}

function appendCentralSheetStripSpacer({
  fragment,
  kind,
  heightPx,
  existingNode = null,
}) {
  const normalizedHeightPx = Math.max(0, Math.round(Number(heightPx) || 0));
  if (!(fragment instanceof DocumentFragment) || normalizedHeightPx <= 0) {
    return;
  }
  const spacer = existingNode instanceof HTMLElement
    ? existingNode
    : document.createElement('div');
  spacer.className = `tiptap-sheet-strip__spacer tiptap-sheet-strip__spacer--${kind}`;
  spacer.dataset.kind = String(kind || 'unknown');
  spacer.dataset.spacerHeightPx = String(normalizedHeightPx);
  spacer.style.height = `${normalizedHeightPx}px`;
  fragment.appendChild(spacer);
}

function ensureCentralSheetStripPageWrapShell(existingWrap = null) {
  const wrap = existingWrap instanceof HTMLElement
    ? existingWrap
    : document.createElement('div');
  wrap.className = 'tiptap-page-wrap';

  const firstChild = wrap.firstElementChild;
  let page = firstChild instanceof HTMLElement && firstChild.classList.contains('tiptap-page')
    ? firstChild
    : null;
  if (!(page instanceof HTMLElement) || wrap.childElementCount !== 1) {
    page = document.createElement('div');
    page.className = 'tiptap-page';
    wrap.replaceChildren(page);
  } else {
    page.className = 'tiptap-page';
  }

  const pageFirstChild = page.firstElementChild;
  let content = pageFirstChild instanceof HTMLElement && pageFirstChild.classList.contains('tiptap-page__content')
    ? pageFirstChild
    : null;
  if (!(content instanceof HTMLElement) || page.childElementCount !== 1) {
    content = document.createElement('div');
    content.className = 'tiptap-page__content';
    page.replaceChildren(content);
  } else {
    content.className = 'tiptap-page__content';
  }

  return wrap;
}

function getCentralSheetTextMeasureContext() {
  if (!(centralSheetStripTextMeasureCanvas instanceof HTMLCanvasElement)) {
    centralSheetStripTextMeasureCanvas = document.createElement('canvas');
  }
  return centralSheetStripTextMeasureCanvas.getContext('2d');
}

function resolveCentralSheetTextMeasureFont(element) {
  const styles = element instanceof HTMLElement
    ? window.getComputedStyle(element)
    : null;
  if (!styles) {
    return 'normal 400 18px sans-serif';
  }
  return [
    styles.fontStyle || 'normal',
    styles.fontWeight || '400',
    styles.fontSize || '18px',
    styles.fontFamily || 'sans-serif',
  ].join(' ');
}

function buildLargePayloadFastPathPageLines(sourceText = '', pageNumber = 1, layout = {}) {
  if (!centralSheetStripLargePayloadFastPathActive) {
    return [];
  }
  const context = getCentralSheetTextMeasureContext();
  if (context) {
    context.font = String(layout.font || 'normal 400 18px sans-serif');
  }
  return buildLargePayloadLineSafeRows({
    sourceText,
    pageNumber,
    pageCharBudget: CENTRAL_SHEET_LARGE_PAYLOAD_ESTIMATED_CHARS_PER_PAGE,
    visibleCharBudget: CENTRAL_SHEET_LARGE_PAYLOAD_VISIBLE_PAGE_CHARS,
    contentWidthPx: layout.contentWidthPx,
    contentHeightPx: layout.contentHeightPx,
    lineHeightPx: layout.lineHeightPx,
    topGuardPx: layout.topGuardPx,
    bottomGuardPx: layout.bottomGuardPx,
    lineWidthSafetyPx: CENTRAL_SHEET_LARGE_PAYLOAD_LINE_WIDTH_SAFETY_PX,
    measureText: context ? (text) => context.measureText(String(text || '')).width : null,
  });
}

function syncCentralSheetStripPageWrapDerivedText(wrap, pageNumber, sourceText = '', layout = {}) {
  if (!(wrap instanceof HTMLElement)) {
    return;
  }
  const pageContent = wrap.querySelector(':scope > .tiptap-page > .tiptap-page__content');
  if (!(pageContent instanceof HTMLElement)) {
    return;
  }
  let derivedText = pageContent.querySelector(':scope > .tiptap-sheet-derived-text');
  if (!centralSheetStripLargePayloadFastPathActive) {
    if (derivedText instanceof HTMLElement) {
      derivedText.remove();
    }
    return;
  }
  if (!(derivedText instanceof HTMLElement)) {
    derivedText = document.createElement('div');
    derivedText.className = 'tiptap-sheet-derived-text';
    derivedText.setAttribute('aria-hidden', 'true');
    pageContent.replaceChildren(derivedText);
  }
  const nextLines = buildLargePayloadFastPathPageLines(sourceText, pageNumber, layout);
  const nextSignature = nextLines.join('\n');
  derivedText.style.setProperty('--central-sheet-derived-line-height-px', `${Math.max(1, Number(layout.lineHeightPx) || 32)}px`);
  derivedText.dataset.lineSafe = 'true';
  if (derivedText.dataset.textSignature === nextSignature) {
    return;
  }
  derivedText.replaceChildren(...nextLines.map((line) => {
    const lineNode = document.createElement('div');
    lineNode.className = 'tiptap-sheet-derived-line';
    lineNode.textContent = line;
    return lineNode;
  }));
  derivedText.dataset.textSignature = nextSignature;
}

function renderCentralSheetStripShellPages(pageWindow, runtimeState = null) {
  const strip = ensureCentralSheetStripShell();
  if (!(strip instanceof HTMLElement)) {
    return;
  }
  const normalizedWindow = pageWindow && typeof pageWindow === 'object' ? pageWindow : null;
  const renderedPageCount = normalizedWindow
    ? Math.max(0, Number(normalizedWindow.renderedPageCount) || 0)
    : 0;
  if (renderedPageCount === 0) {
    strip.replaceChildren();
    delete strip.dataset.windowSignature;
    return;
  }
  const firstRenderedPage = Math.max(1, Number(normalizedWindow.firstRenderedPage) || 1);
  const lastRenderedPage = Math.max(firstRenderedPage, Number(normalizedWindow.lastRenderedPage) || firstRenderedPage);
  const topSpacerHeight = Math.max(0, Math.round(Number(normalizedWindow.topSpacerHeight) || 0));
  const bottomSpacerHeight = Math.max(0, Math.round(Number(normalizedWindow.bottomSpacerHeight) || 0));
  const nextWindowSignature = [
    firstRenderedPage,
    lastRenderedPage,
    topSpacerHeight,
    bottomSpacerHeight,
    renderedPageCount,
    centralSheetStripLargePayloadFastPathActive ? centralSheetStripLargePayloadFastPathRevision : 0,
  ].join(':');
  if (strip.dataset.windowSignature === nextWindowSignature) {
    return;
  }
  const largePayloadText = centralSheetStripLargePayloadFastPathActive
    ? readCentralSheetLargePayloadFastPathText()
    : '';
  const derivedTextLayout = runtimeState && typeof runtimeState === 'object'
    ? {
      contentWidthPx: runtimeState.contentWidthPx,
      contentHeightPx: runtimeState.contentHeightPx,
      lineHeightPx: resolveCentralSheetLineHeightPx(editor),
      topGuardPx: Math.ceil(Math.max(0, Number(runtimeState.lineGuardPx) || 0) * 0.4),
      bottomGuardPx: Math.ceil(Math.max(0, Number(runtimeState.lineGuardPx) || 0)),
      font: resolveCentralSheetTextMeasureFont(editor),
    }
    : {};
  const existingTopSpacer = strip.querySelector(':scope > .tiptap-sheet-strip__spacer--top');
  const existingBottomSpacer = strip.querySelector(':scope > .tiptap-sheet-strip__spacer--bottom');
  const existingPageWraps = [...strip.querySelectorAll(':scope > .tiptap-page-wrap')]
    .filter((node) => node instanceof HTMLElement);
  const fragment = document.createDocumentFragment();
  appendCentralSheetStripSpacer({
    fragment,
    kind: 'top',
    heightPx: topSpacerHeight,
    existingNode: existingTopSpacer,
  });
  for (let offset = 0; offset < renderedPageCount; offset += 1) {
    const pageNumber = Math.min(lastRenderedPage, firstRenderedPage + offset);
    const pageIndex = Math.max(0, pageNumber - 1);
    const wrap = ensureCentralSheetStripPageWrapShell(existingPageWraps[offset] || null);
    wrap.dataset.pageIndex = String(pageIndex);
    wrap.dataset.pageNumber = String(pageNumber);
    syncCentralSheetStripPageWrapDerivedText(wrap, pageNumber, largePayloadText, derivedTextLayout);
    fragment.appendChild(wrap);
  }
  appendCentralSheetStripSpacer({
    fragment,
    kind: 'bottom',
    heightPx: bottomSpacerHeight,
    existingNode: existingBottomSpacer,
  });
  strip.replaceChildren(fragment);
  strip.dataset.windowSignature = nextWindowSignature;
}

function measureCentralSheetNaturalHeight(proseMirror) {
  if (!(proseMirror instanceof HTMLElement) || !(editor instanceof HTMLElement)) {
    return 0;
  }
  editor.classList.add(CENTRAL_SHEET_STRIP_MEASURING_CLASS);
  const naturalHeight = Math.max(
    proseMirror.scrollHeight,
    proseMirror.offsetHeight,
    Math.ceil(proseMirror.getBoundingClientRect().height),
  );
  editor.classList.remove(CENTRAL_SHEET_STRIP_MEASURING_CLASS);
  return naturalHeight;
}

function resolveCentralSheetLineGuardPx(proseMirror) {
  if (!(proseMirror instanceof HTMLElement)) {
    return 32;
  }
  const lineHeight = resolveCentralSheetLineHeightPx(proseMirror);
  return Math.max(56, Math.min(128, Math.ceil((lineHeight * 2.25) + 2)));
}

function resolveCentralSheetStructuralMinimumPageCount({
  proseMirror,
  pageStridePx,
  pageHeightPx,
  marginBottomPx,
} = {}) {
  if (!(proseMirror instanceof HTMLElement)) {
    return 1;
  }
  const lastBlock = proseMirror.lastElementChild;
  if (!(lastBlock instanceof HTMLElement)) {
    return 1;
  }
  const proseRect = proseMirror.getBoundingClientRect();
  const lastBlockRect = lastBlock.getBoundingClientRect();
  const resolvedPageStridePx = Math.max(1, Math.round(Number(pageStridePx) || 1));
  const resolvedPageHeightPx = Math.max(1, Math.round(Number(pageHeightPx) || resolvedPageStridePx));
  const resolvedPageGapPx = Math.max(0, resolvedPageStridePx - resolvedPageHeightPx);
  const resolvedTextPageHeightPx = Math.max(1, resolvedPageHeightPx - resolvedPageGapPx);
  const resolvedMarginBottomPx = Math.max(0, Math.round(Number(marginBottomPx) || 0));
  const requiredBottomOffsetPx = Math.max(
    0,
    Math.ceil(lastBlockRect.bottom - proseRect.top) + resolvedMarginBottomPx,
  );
  // Natural text height is measured without sheet gaps, so long continuous prose needs text-capacity lower bounds.
  return Math.max(
    1,
    Math.ceil(requiredBottomOffsetPx / resolvedPageStridePx),
    Math.ceil(requiredBottomOffsetPx / resolvedPageHeightPx),
    Math.ceil(requiredBottomOffsetPx / resolvedTextPageHeightPx),
  );
}

function beginCentralSheetStripStructuralTransition() {
  centralSheetStripPendingStructuralInput = true;
  centralSheetStripStructuralGuardActive = true;
  centralSheetStripCacheDirty = true;
  resetCentralSheetStripStructuralSettleState();
}

function finishCentralSheetStripStructuralTransition() {
  centralSheetStripPendingStructuralInput = false;
  centralSheetStripStructuralGuardActive = false;
  resetCentralSheetStripStructuralSettleState();
}

function clearCentralSheetStripProof({ overflowReason = '' } = {}) {
  if (!(editor instanceof HTMLElement)) {
    return;
  }
  finishCentralSheetStripStructuralTransition();
  centralSheetStripCachedRuntimeState = null;
  centralSheetStripCacheDirty = false;
  centralSheetStripLastScrollTop = 0;
  centralSheetStripLastAppliedSignature = '';
  editor.classList.remove(CENTRAL_SHEET_STRIP_PROOF_CLASS);
  editor.classList.remove(CENTRAL_SHEET_STRIP_MEASURING_CLASS);
  delete editor.dataset.centralSheetCount;
  delete editor.dataset.centralSheetFlow;
  delete editor.dataset.centralSheetBoundedOverflowReason;
  delete editor.dataset.centralSheetBoundedOverflowSourcePageCount;
  delete editor.dataset.centralSheetBoundedOverflowVisiblePageCount;
  delete editor.dataset.centralSheetBoundedOverflowHiddenPageCount;
  delete editor.dataset.centralSheetRenderedPageCount;
  delete editor.dataset.centralSheetTotalPageCount;
  delete editor.dataset.centralSheetSourcePageCount;
  delete editor.dataset.centralSheetDecisionPageCount;
  delete editor.dataset.centralSheetStructuralRuntimePageCount;
  delete editor.dataset.centralSheetWindowFirstRenderedPage;
  delete editor.dataset.centralSheetWindowLastRenderedPage;
  delete editor.dataset.centralSheetWindowVisiblePageCount;
  delete editor.dataset.centralSheetWindowingEnabled;
  delete editor.dataset.centralSheetBoundedOverflowRuntimePageCount;
  clearDerivedPageMapRuntimeBridgeDataset();
  if (overflowReason) {
    editor.dataset.centralSheetOverflowReason = overflowReason;
  } else {
    delete editor.dataset.centralSheetOverflowReason;
  }
  editor.style.removeProperty('--central-sheet-count');
  editor.style.removeProperty('--central-sheet-strip-width-px');
  editor.style.removeProperty('--central-sheet-strip-height-px');
  editor.style.removeProperty('--central-sheet-total-virtual-height-px');
  editor.style.removeProperty('--central-sheet-content-width-px');
  editor.style.removeProperty('--central-sheet-content-height-px');
  editor.style.removeProperty('--central-sheet-page-stride-px');
  editor.style.removeProperty('--central-sheet-editor-height-px');
  editor.style.removeProperty('--central-sheet-line-guard-px');
  editor.style.removeProperty('--central-sheet-line-top-guard-px');
  editor.style.removeProperty('--central-sheet-derived-text-top-guard-px');
  editor.style.removeProperty('--central-sheet-mask-bleed-px');
  renderCentralSheetStripShellPages(null);
}

function resetCentralSheetStripForIncomingPayload() {
  if (!isTiptapMode || !(editor instanceof HTMLElement)) {
    return;
  }
  if (centralSheetStripRefreshFrameId) {
    window.cancelAnimationFrame(centralSheetStripRefreshFrameId);
    centralSheetStripRefreshFrameId = null;
  }
  centralSheetStripRefreshMode = 'full';
  const scrollContainer = editor.closest('.main-content--editor');
  if (scrollContainer instanceof HTMLElement) {
    scrollContainer.scrollTop = 0;
  }
  if (centralSheetStripScrollContainer instanceof HTMLElement) {
    centralSheetStripScrollContainer.scrollTop = 0;
  }
  editor.scrollTop = 0;
  clearCentralSheetStripProof();
  centralSheetStripCacheDirty = true;
}

function applyEstimatedCentralSheetStripRuntimeStateFromText(text = '') {
  if (!isTiptapMode || !(editor instanceof HTMLElement)) {
    return false;
  }
  const metrics = getPageMetrics({
    profile: activeBookProfileState,
    zoom: editorZoom,
  });
  if (!metrics) {
    return false;
  }
  const { widthPx, heightPx } = getCentralSheetContentMetrics(metrics);
  const pageGapPx = Math.max(0, Math.round(getRootCssPxValue('--page-gap-px', 24)));
  const estimatedPageCount = estimateCentralSheetPageCountFromText(text);
  const proseMirror = editor.querySelector('.ProseMirror');
  const lineGuardPx = resolveCentralSheetLineGuardPx(proseMirror instanceof HTMLElement ? proseMirror : editor);
  const runtimeState = {
    metrics,
    contentWidthPx: widthPx,
    contentHeightPx: heightPx,
    pageGapPx,
    lineGuardPx,
    decisionPageCount: estimatedPageCount,
    sourcePageCount: estimatedPageCount,
    structuralMinimumPageCount: estimatedPageCount,
    pageCount: estimatedPageCount,
    shouldRender: true,
    overflowReason: estimatedPageCount > CENTRAL_SHEET_RUNTIME_WINDOW_DOM_BUDGET ? 'max-page-count' : '',
    activeLayoutPreviewSnapshot: null,
    skipDerivedPageMapRuntimeBridge: true,
    estimatedLargePayload: true,
  };
  const applied = applyCentralSheetStripRuntimeState(runtimeState);
  if (!applied) {
    return false;
  }
  centralSheetStripCachedRuntimeState = runtimeState;
  centralSheetStripCacheDirty = false;
  return true;
}

function syncCentralSheetStripOverflowMetadata({
  pageCount,
  sourcePageCount,
  visiblePageCount,
  overflowReason,
} = {}) {
  if (!(editor instanceof HTMLElement)) {
    return;
  }
  const resolvedPageCount = Math.max(0, Number(pageCount) || 0);
  const resolvedSourcePageCount = Math.max(0, Number(sourcePageCount) || 0);
  const resolvedVisiblePageCount = Math.max(0, Number(visiblePageCount) || 0);
  const hasBoundedOverflow = (
    overflowReason === 'max-page-count'
    && resolvedVisiblePageCount > 0
    && resolvedPageCount > resolvedVisiblePageCount
  );
  if (!hasBoundedOverflow) {
    delete editor.dataset.centralSheetOverflowReason;
    delete editor.dataset.centralSheetBoundedOverflowReason;
    delete editor.dataset.centralSheetBoundedOverflowSourcePageCount;
    delete editor.dataset.centralSheetBoundedOverflowRuntimePageCount;
    delete editor.dataset.centralSheetBoundedOverflowVisiblePageCount;
    delete editor.dataset.centralSheetBoundedOverflowHiddenPageCount;
    return;
  }
  delete editor.dataset.centralSheetOverflowReason;
  editor.dataset.centralSheetBoundedOverflowReason = overflowReason;
  editor.dataset.centralSheetBoundedOverflowSourcePageCount = String(resolvedSourcePageCount || resolvedPageCount);
  editor.dataset.centralSheetBoundedOverflowRuntimePageCount = String(resolvedPageCount);
  editor.dataset.centralSheetBoundedOverflowVisiblePageCount = String(resolvedVisiblePageCount);
  editor.dataset.centralSheetBoundedOverflowHiddenPageCount = String(resolvedPageCount - resolvedVisiblePageCount);
}

function getRenderedWindowPageNumbers(pageWindow) {
  if (!pageWindow || typeof pageWindow !== 'object') {
    return [];
  }
  const firstRenderedPage = Math.max(1, Number(pageWindow.firstRenderedPage) || 1);
  const renderedPageCount = Math.max(0, Number(pageWindow.renderedPageCount) || 0);
  return Array.from({ length: renderedPageCount }, (_, index) => firstRenderedPage + index);
}

function buildDerivedPageMapRuntimeBridge({
  activeLayoutPreviewSnapshot,
  pageWindow,
} = {}) {
  const snapshot = activeLayoutPreviewSnapshot && typeof activeLayoutPreviewSnapshot === 'object'
    ? activeLayoutPreviewSnapshot
    : null;
  const pageMap = snapshot && snapshot.pageMap && typeof snapshot.pageMap === 'object'
    ? snapshot.pageMap
    : null;
  const contract = pageMap && pageMap.contract && typeof pageMap.contract === 'object'
    ? pageMap.contract
    : {};
  const renderedWindowPageNumbers = getRenderedWindowPageNumbers(pageWindow);
  const pageMapHash = typeof pageMap?.meta?.pageMapHash === 'string'
    ? pageMap.meta.pageMapHash
    : '';
  const sourceContractHash = pageMapHash
    ? hashRuntimeAdapterValue({
      contract,
      pageMapHash,
      runtimeContractSchemaVersion: pageMap.runtimeContractSchemaVersion || '',
    })
    : '';
  const bridgeSource = isTiptapMode ? 'tiptapPlainTextProvider' : 'plainTextBuffer';
  const editorTextHash = typeof snapshot?.flow?.meta?.flowHash === 'string'
    ? snapshot.flow.meta.flowHash
    : hashRuntimeAdapterValue({
      bridgeSource,
      text: getPlainText(),
    });
  const pageMapProductRuntimeBinding = contract.productRuntimeBinding === true;
  const truthBoundaryOk = (
    contract.derived === true
    && contract.derivedOnly === true
    && contract.runtimeOnly === true
    && contract.textTruth === false
    && contract.storageTruth === false
    && contract.exportTruth === false
    && pageMapProductRuntimeBinding === false
  );

  return {
    bridgeActive: Boolean(
      truthBoundaryOk
      && sourceContractHash
      && pageWindow
      && pageWindow.windowingEnabled === true
      && renderedWindowPageNumbers.length > 0,
    ),
    bridgeSource,
    sourceContractHash,
    editorTextHash,
    renderedWindowPageNumbers,
    textTruth: false,
    storageTruth: false,
    exportTruth: false,
    pageMapProductRuntimeBinding,
  };
}

function clearDerivedPageMapRuntimeBridgeDataset() {
  if (!(editor instanceof HTMLElement)) {
    return;
  }
  delete editor.dataset.derivedPageMapRuntimeBridgeActive;
  delete editor.dataset.derivedPageMapRuntimeBridgeSource;
  delete editor.dataset.derivedPageMapRuntimeBridgeSourceContractHash;
  delete editor.dataset.derivedPageMapRuntimeBridgeEditorTextHash;
  delete editor.dataset.derivedPageMapRuntimeBridgeRenderedWindowPageNumbers;
  delete editor.dataset.derivedPageMapRuntimeBridgeTextTruth;
  delete editor.dataset.derivedPageMapRuntimeBridgeStorageTruth;
  delete editor.dataset.derivedPageMapRuntimeBridgeExportTruth;
  delete editor.dataset.derivedPageMapRuntimeBridgePageMapProductRuntimeBinding;
  delete editor.dataset.derivedPageMapRuntimeBridgeRefreshSerial;
}

function syncDerivedPageMapRuntimeBridgeDataset(bridge) {
  if (!(editor instanceof HTMLElement) || !bridge) {
    clearDerivedPageMapRuntimeBridgeDataset();
    return;
  }
  derivedPageMapRuntimeBridgeRefreshSerial += 1;
  editor.dataset.derivedPageMapRuntimeBridgeActive = bridge.bridgeActive ? 'true' : 'false';
  editor.dataset.derivedPageMapRuntimeBridgeSource = String(bridge.bridgeSource || '');
  editor.dataset.derivedPageMapRuntimeBridgeSourceContractHash = String(bridge.sourceContractHash || '');
  editor.dataset.derivedPageMapRuntimeBridgeEditorTextHash = String(bridge.editorTextHash || '');
  editor.dataset.derivedPageMapRuntimeBridgeRenderedWindowPageNumbers = bridge.renderedWindowPageNumbers.join(',');
  editor.dataset.derivedPageMapRuntimeBridgeTextTruth = bridge.textTruth ? 'true' : 'false';
  editor.dataset.derivedPageMapRuntimeBridgeStorageTruth = bridge.storageTruth ? 'true' : 'false';
  editor.dataset.derivedPageMapRuntimeBridgeExportTruth = bridge.exportTruth ? 'true' : 'false';
  editor.dataset.derivedPageMapRuntimeBridgePageMapProductRuntimeBinding = bridge.pageMapProductRuntimeBinding ? 'true' : 'false';
  editor.dataset.derivedPageMapRuntimeBridgeRefreshSerial = String(derivedPageMapRuntimeBridgeRefreshSerial);
}

function resolveCentralSheetViewportRuntimeWindow({
  totalPageCount,
  pageHeightPx,
  pageGapPx,
} = {}) {
  if (!(editor instanceof HTMLElement)) {
    return null;
  }
  const scrollContainer = editor.closest('.main-content--editor');
  let viewportHeightPx = 0;
  let viewportTopPx = 0;
  if (scrollContainer instanceof HTMLElement) {
    viewportTopPx = Math.max(0, Math.round(Number(scrollContainer.scrollTop) || 0));
    viewportHeightPx = Math.max(1, Math.round(Number(scrollContainer.clientHeight) || 0));
  }
  if (viewportHeightPx <= 0) {
    const hostRect = editor.getBoundingClientRect();
    viewportTopPx = 0;
    viewportHeightPx = Math.max(
      1,
      Math.round((window.innerHeight || hostRect.height || pageHeightPx || 1)),
    );
  }
  const runtimeWindow = buildVirtualViewportWindowMathContract({
    totalPageCount: Math.max(0, Number(totalPageCount) || 0),
    pageHeight: Math.max(1, Math.round(Number(pageHeightPx) || 1)),
    pageGap: Math.max(0, Math.round(Number(pageGapPx) || 0)),
    scrollTop: viewportTopPx,
    viewportHeight: viewportHeightPx,
    domBudget: CENTRAL_SHEET_RUNTIME_WINDOW_DOM_BUDGET,
    overscan: CENTRAL_SHEET_RUNTIME_WINDOW_OVERSCAN,
  });
  if (!runtimeWindow || runtimeWindow.windowingEnabled !== true) {
    return runtimeWindow;
  }
  if (runtimeWindow.totalPageCount <= 3 || runtimeWindow.renderedPageCount >= 4) {
    return runtimeWindow;
  }
  const minimumRenderedPageCount = Math.min(runtimeWindow.totalPageCount, 4);
  let firstRenderedPage = Math.max(1, runtimeWindow.firstRenderedPage);
  let lastRenderedPage = Math.max(firstRenderedPage, runtimeWindow.lastRenderedPage);
  const minimumLastRenderedPage = Math.min(
    runtimeWindow.totalPageCount,
    firstRenderedPage + minimumRenderedPageCount - 1,
  );
  const pageStride = Math.max(1, runtimeWindow.pageStride);
  lastRenderedPage = Math.max(lastRenderedPage, minimumLastRenderedPage);
  const minimumFirstRenderedPage = Math.max(
    1,
    lastRenderedPage - minimumRenderedPageCount + 1,
  );
  firstRenderedPage = Math.min(firstRenderedPage, minimumFirstRenderedPage);
  return {
    ...runtimeWindow,
    firstRenderedPage,
    lastRenderedPage,
    renderedPageCount: (lastRenderedPage - firstRenderedPage) + 1,
    topSpacerHeight: Math.max(0, firstRenderedPage - 1) * pageStride,
    bottomSpacerHeight: Math.max(0, runtimeWindow.totalPageCount - lastRenderedPage) * pageStride,
    overscanBefore: Math.max(0, runtimeWindow.firstVisiblePage - firstRenderedPage),
    overscanAfter: Math.max(0, lastRenderedPage - runtimeWindow.lastVisiblePage),
    visibleCoverageComplete: true,
    visiblePagesOmitted: false,
  };
}

function buildCentralSheetStripRuntimeState({ proseMirror, reuseCachedDecision = false } = {}) {
  if (reuseCachedDecision && centralSheetStripCachedRuntimeState) {
    return centralSheetStripCachedRuntimeState;
  }
  const metrics = getPageMetrics({
    profile: activeBookProfileState,
    zoom: editorZoom,
  });
  if (!metrics) {
    return null;
  }

  const { widthPx, heightPx } = getCentralSheetContentMetrics(metrics);
  const pageGapPx = Math.max(0, Math.round(getRootCssPxValue('--page-gap-px', 24)));
  const lineGuardPx = resolveCentralSheetLineGuardPx(proseMirror);
  const pageStridePx = Math.round(metrics.pageHeightPx + pageGapPx);
  const structuralMinimumPageCount = resolveCentralSheetStructuralMinimumPageCount({
    proseMirror,
    pageStridePx,
    pageHeightPx: metrics.pageHeightPx,
    marginBottomPx: metrics.marginBottomPx,
  });
  const activeLayoutPreviewSnapshot = buildActiveLayoutPreviewSnapshot();
  const naturalHeight = measureCentralSheetNaturalHeight(proseMirror);
  const centralSheetDecision = resolveCentralSheetStripProofDecision({
    naturalHeight,
    contentHeightPx: heightPx,
    activeLayoutPreviewSnapshot,
    maxPageCount: CENTRAL_SHEET_RUNTIME_WINDOW_DOM_BUDGET,
  });
  const {
    pageCount: decisionPageCount,
    shouldRender,
    overflowReason,
  } = centralSheetDecision;
  const sourcePageCount = Math.max(1, decisionPageCount);
  const runtimePageCount = Math.max(1, structuralMinimumPageCount);
  const scrollPageCount = runtimePageCount;
  return {
    metrics,
    contentWidthPx: widthPx,
    contentHeightPx: heightPx,
    pageGapPx,
    lineGuardPx,
    decisionPageCount,
    sourcePageCount,
    structuralMinimumPageCount,
    pageCount: runtimePageCount,
    scrollPageCount,
    shouldRender,
    overflowReason,
    activeLayoutPreviewSnapshot,
  };
}

function applyCentralSheetStripRuntimeState(runtimeState) {
  if (!(editor instanceof HTMLElement) || !runtimeState) {
    return false;
  }
  const {
    metrics,
    contentWidthPx,
    contentHeightPx,
    pageGapPx,
    lineGuardPx,
    activeLayoutPreviewSnapshot,
    skipDerivedPageMapRuntimeBridge,
    decisionPageCount,
    sourcePageCount,
    structuralMinimumPageCount,
    pageCount,
    scrollPageCount,
  } = runtimeState;
  editor.style.setProperty('--central-sheet-content-width-px', `${contentWidthPx}px`);
  editor.style.setProperty('--central-sheet-content-height-px', `${contentHeightPx}px`);
  editor.style.setProperty('--central-sheet-line-guard-px', `${lineGuardPx}px`);
  editor.style.setProperty('--central-sheet-line-top-guard-px', `${Math.ceil(Math.max(0, lineGuardPx))}px`);
  editor.style.setProperty('--central-sheet-derived-text-top-guard-px', `${Math.ceil(Math.max(0, lineGuardPx) * 0.4)}px`);
  editor.style.setProperty('--central-sheet-mask-bleed-px', `${CENTRAL_SHEET_TEXT_MASK_BLEED_PX}px`);
  const pageWindow = resolveCentralSheetViewportRuntimeWindow({
    totalPageCount: Math.max(1, Number(scrollPageCount || pageCount) || 1),
    pageHeightPx: metrics.pageHeightPx,
    pageGapPx,
  });
  if (!pageWindow || pageWindow.windowingEnabled !== true) {
    clearDerivedPageMapRuntimeBridgeDataset();
    return false;
  }
  const renderedPageCount = Math.max(0, Number(pageWindow.renderedPageCount) || 0);
  const stripHeightPx = Math.round(pageWindow.totalVirtualHeight || 0);
  const pageStridePx = Math.round(metrics.pageHeightPx + pageGapPx);
  const editorHeightPx = Math.max(
    contentHeightPx,
    Math.round(stripHeightPx - metrics.marginTopPx - metrics.marginBottomPx),
  );

  editor.style.setProperty('--central-sheet-count', String(renderedPageCount));
  editor.style.setProperty('--central-sheet-strip-width-px', `${Math.round(metrics.pageWidthPx)}px`);
  editor.style.setProperty('--central-sheet-strip-height-px', `${stripHeightPx}px`);
  editor.style.setProperty('--central-sheet-total-virtual-height-px', `${stripHeightPx}px`);
  editor.style.setProperty('--central-sheet-page-stride-px', `${pageStridePx}px`);
  editor.style.setProperty('--central-sheet-editor-height-px', `${editorHeightPx}px`);
  editor.dataset.centralSheetCount = String(renderedPageCount);
  editor.dataset.centralSheetFlow = 'vertical';
  editor.dataset.centralSheetRenderedPageCount = String(renderedPageCount);
  editor.dataset.centralSheetTotalPageCount = String(pageCount);
  editor.dataset.centralSheetSourcePageCount = String(sourcePageCount || pageCount);
  editor.dataset.centralSheetDecisionPageCount = String(decisionPageCount || sourcePageCount || pageCount);
  editor.dataset.centralSheetStructuralRuntimePageCount = String(structuralMinimumPageCount || pageCount);
  editor.dataset.centralSheetWindowTotalPageCount = String(pageWindow.totalPageCount);
  editor.dataset.centralSheetWindowFirstRenderedPage = String(pageWindow.firstRenderedPage);
  editor.dataset.centralSheetWindowLastRenderedPage = String(pageWindow.lastRenderedPage);
  editor.dataset.centralSheetWindowVisiblePageCount = String(pageWindow.visiblePageCount);
  editor.dataset.centralSheetWindowingEnabled = pageWindow.windowingEnabled ? 'true' : 'false';
  if (skipDerivedPageMapRuntimeBridge === true) {
    syncDerivedPageMapRuntimeBridgeDataset({
      bridgeActive: false,
      bridgeSource: 'largePayloadFastPath',
      sourceContractHash: '',
      editorTextHash: '',
      renderedWindowPageNumbers: getRenderedWindowPageNumbers(pageWindow),
      textTruth: false,
      storageTruth: false,
      exportTruth: false,
      pageMapProductRuntimeBinding: false,
    });
  } else {
    syncDerivedPageMapRuntimeBridgeDataset(buildDerivedPageMapRuntimeBridge({
      activeLayoutPreviewSnapshot,
      pageWindow,
    }));
  }
  centralSheetStripLastAppliedSignature = [
    decisionPageCount,
    sourcePageCount,
    structuralMinimumPageCount,
    pageCount,
    Number(scrollPageCount || 0),
    Number(pageWindow.firstRenderedPage || 0),
    Number(pageWindow.lastRenderedPage || 0),
    renderedPageCount,
    stripHeightPx,
    editorHeightPx,
  ].join(':');
  syncCentralSheetStripOverflowMetadata({
    pageCount,
    sourcePageCount,
    visiblePageCount: renderedPageCount,
    overflowReason: renderedPageCount < pageCount ? 'max-page-count' : '',
  });
  renderCentralSheetStripShellPages(pageWindow, runtimeState);
  editor.classList.add(CENTRAL_SHEET_STRIP_PROOF_CLASS);
  centralSheetStripLastScrollTop = Math.max(0, Number(pageWindow.scrollTop) || 0);
  return true;
}

function syncCentralSheetStripWindowFromCachedRuntimeState() {
  if (
    !isTiptapMode
    || !(editor instanceof HTMLElement)
    || !centralSheetStripCachedRuntimeState
    || centralSheetStripStructuralGuardActive
  ) {
    return false;
  }
  if (centralSheetStripCachedRuntimeState.shouldRender === false) {
    return false;
  }
  return applyCentralSheetStripRuntimeState(centralSheetStripCachedRuntimeState);
}

function refreshCentralSheetStripProof({ reuseCachedDecision = false } = {}) {
  if (!isTiptapMode || !(editor instanceof HTMLElement)) {
    return;
  }
  const tiptapEditor = editor.querySelector('.tiptap-editor');
  const proseMirror = editor.querySelector('.ProseMirror');
  if (!(tiptapEditor instanceof HTMLElement) || !(proseMirror instanceof HTMLElement)) {
    clearCentralSheetStripProof();
    return false;
  }
  if (
    centralSheetStripLargePayloadFastPathActive
    && !centralSheetStripStructuralGuardActive
  ) {
    return applyEstimatedCentralSheetStripRuntimeStateFromText(readCentralSheetLargePayloadFastPathText());
  }
  const effectiveReuseCachedDecision = (
    reuseCachedDecision === true
    && !centralSheetStripStructuralGuardActive
  );
  const runtimeState = buildCentralSheetStripRuntimeState({
    proseMirror,
    reuseCachedDecision: effectiveReuseCachedDecision,
  });
  if (!runtimeState) {
    clearCentralSheetStripProof();
    return false;
  }
  if (!runtimeState.shouldRender) {
    clearCentralSheetStripProof({ overflowReason: runtimeState.overflowReason });
    return false;
  }
  if (!effectiveReuseCachedDecision) {
    centralSheetStripCachedRuntimeState = runtimeState;
    centralSheetStripCacheDirty = false;
  }
  if (!applyCentralSheetStripRuntimeState(runtimeState)) {
    clearCentralSheetStripProof({ overflowReason: 'viewport-window-unavailable' });
    return false;
  }
  return true;
}

function scheduleCentralSheetStripProofRefreshOnScroll() {
  if (!isTiptapMode || !(editor instanceof HTMLElement)) {
    return;
  }
  bindCentralSheetStripScrollRefresh();
  if (!(centralSheetStripScrollContainer instanceof HTMLElement) || !centralSheetStripCachedRuntimeState) {
    refreshCentralSheetStripProof();
    return;
  }

  const caughtUp = syncCentralSheetStripWindowFromCachedRuntimeState();
  if (!caughtUp) {
    refreshCentralSheetStripProof();
    return;
  }

  if (centralSheetStripCacheDirty) {
    refreshCentralSheetStripProof({
      reuseCachedDecision: centralSheetStripCachedRuntimeState.estimatedLargePayload === true,
    });
    return;
  }
}

function scheduleCentralSheetStripProofRefresh({ scrollOnly = false, forceFull = false } = {}) {
  if (!isTiptapMode || !(editor instanceof HTMLElement)) {
    return;
  }
  bindCentralSheetStripScrollRefresh();
  const shouldKeepEstimatedLargePayloadState = (
    forceFull !== true
    && centralSheetStripLargePayloadFastPathActive
    && centralSheetStripCachedRuntimeState?.estimatedLargePayload === true
    && !centralSheetStripStructuralGuardActive
  );
  const nextRefreshMode = (scrollOnly || shouldKeepEstimatedLargePayloadState) ? 'scroll' : 'full';
  if (centralSheetStripRefreshFrameId) {
    if (nextRefreshMode === 'full') {
      centralSheetStripRefreshMode = 'full';
      centralSheetStripCacheDirty = true;
    }
    return;
  }
  if (nextRefreshMode === 'full') {
    centralSheetStripCacheDirty = true;
  }
  centralSheetStripRefreshMode = nextRefreshMode;
  centralSheetStripRefreshFrameId = window.requestAnimationFrame(() => {
    centralSheetStripRefreshFrameId = null;
    const refreshMode = centralSheetStripRefreshMode;
    centralSheetStripRefreshMode = 'full';
    refreshCentralSheetStripProof({ reuseCachedDecision: refreshMode === 'scroll' });
  });
}

function scheduleCentralSheetStripPostStructuralRefresh() {
  if (!isTiptapMode || !(editor instanceof HTMLElement)) {
    return;
  }
  if (!centralSheetStripStructuralGuardActive || centralSheetStripStructuralSettleFrameId) {
    return;
  }
  centralSheetStripStructuralSettleFrameId = window.requestAnimationFrame(() => {
    centralSheetStripStructuralSettleFrameId = null;
    centralSheetStripCacheDirty = true;
    const applied = refreshCentralSheetStripProof();
    if (!centralSheetStripStructuralGuardActive) {
      return;
    }
    if (!applied || !centralSheetStripLastAppliedSignature) {
      scheduleCentralSheetStripPostStructuralRefresh();
      return;
    }
    if (centralSheetStripLastAppliedSignature === centralSheetStripStructuralSettleSignature) {
      centralSheetStripStructuralStablePassCount += 1;
    } else {
      centralSheetStripStructuralSettleSignature = centralSheetStripLastAppliedSignature;
      centralSheetStripStructuralStablePassCount = 0;
    }
    if (centralSheetStripStructuralStablePassCount >= 1) {
      finishCentralSheetStripStructuralTransition();
      return;
    }
    scheduleCentralSheetStripPostStructuralRefresh();
  });
}

function bindCentralSheetStripScrollRefresh() {
  if (!isTiptapMode || !(editor instanceof HTMLElement)) {
    return;
  }
  const nextScrollContainer = editor.closest('.main-content--editor');
  if (centralSheetStripScrollContainer === nextScrollContainer) {
    return;
  }
  if (centralSheetStripScrollContainer instanceof HTMLElement) {
    centralSheetStripScrollContainer.removeEventListener('scroll', scheduleCentralSheetStripProofRefreshOnScroll);
  }
  centralSheetStripScrollContainer = nextScrollContainer instanceof HTMLElement
    ? nextScrollContainer
    : null;
  if (centralSheetStripScrollContainer instanceof HTMLElement) {
    centralSheetStripScrollContainer.addEventListener('scroll', scheduleCentralSheetStripProofRefreshOnScroll, {
      passive: true,
    });
  }
  if (!centralSheetStripGlobalScrollBound) {
    window.addEventListener('scroll', scheduleCentralSheetStripProofRefreshOnScroll, {
      capture: true,
      passive: true,
    });
    centralSheetStripGlobalScrollBound = true;
  }
}

function syncPreviewChromeFormatValue() {
  const activeProfile = getActiveBookProfile();
  const activeFormatId = activeProfile.formatId;
  const activeOrientation = activeProfile.orientation;
  if (previewChromeFormatValueElement) {
    previewChromeFormatValueElement.textContent = activeFormatId;
  }
  previewFormatButtons.forEach((button) => {
    const isActive = button.dataset.previewFormatOption === activeFormatId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  previewOrientationButtons.forEach((button) => {
    const isActive = button.dataset.previewOrientationOption === activeOrientation;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  syncInspectorBookProfileValues(activeProfile);
}

function formatInspectorMetric(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '';
  return String(normalized).replace('.', ',');
}

function syncInspectorBookProfileValues(profile = getActiveBookProfile()) {
  if (!inspectorMarginsValue) return;
  const margins = [
    profile.marginTopMm,
    profile.marginRightMm,
    profile.marginBottomMm,
    profile.marginLeftMm,
  ].map(formatInspectorMetric);
  if (margins.every((margin) => margin === margins[0])) {
    inspectorMarginsValue.textContent = `${margins[0]} мм`;
  } else if (margins[0] === margins[2] && margins[1] === margins[3]) {
    inspectorMarginsValue.textContent = `${margins[0]} × ${margins[1]} мм`;
  } else {
    inspectorMarginsValue.textContent = `${margins.join(' / ')} мм`;
  }
  inspectorMarginsValue.title = `Верх ${margins[0]} мм, справа ${margins[1]} мм, низ ${margins[2]} мм, слева ${margins[3]} мм`;
}

function syncLayoutPreviewControlStates() {
  if (layoutPreviewToggleButton) {
    const isEnabled = activeLayoutPreviewState.enabled;
    layoutPreviewToggleButton.classList.toggle('is-active', isEnabled);
    layoutPreviewToggleButton.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
    layoutPreviewToggleButton.textContent = isEnabled ? 'Вкл' : 'Выкл';
  }
  if (layoutPreviewFrameToggleButton) {
    const isFrameEnabled = activeLayoutPreviewState.frameMode;
    layoutPreviewFrameToggleButton.classList.toggle('is-active', isFrameEnabled);
    layoutPreviewFrameToggleButton.setAttribute('aria-pressed', isFrameEnabled ? 'true' : 'false');
    layoutPreviewFrameToggleButton.textContent = isFrameEnabled ? 'Вкл' : 'Выкл';
  }
}

function setActiveBookProfileFormat(formatId) {
  const nextProfileResult = normalizeBookProfile({
    ...activeBookProfileState,
    formatId,
  });
  if (!nextProfileResult.ok) {
    syncPreviewChromeFormatValue();
    return activeBookProfileState;
  }

  const nextProfile = nextProfileResult.value;
  if (nextProfile.formatId === activeBookProfileState.formatId) {
    syncPreviewChromeFormatValue();
    return nextProfile;
  }

  activeBookProfileState = nextProfile;
  const metrics = getPageMetrics({
    profile: activeBookProfileState,
    zoom: editorZoom,
  });
  if (metrics) {
    applyPageGeometryCssVars(metrics);
  }
  scheduleLayoutPreviewRefresh();
  scheduleCentralSheetStripProofRefresh();
  syncPreviewChromeFormatValue();
  return nextProfile;
}

function setActiveBookProfileOrientation(orientation) {
  const nextProfileResult = normalizeBookProfile({
    ...activeBookProfileState,
    orientation,
  });
  if (!nextProfileResult.ok) {
    syncPreviewChromeFormatValue();
    return activeBookProfileState;
  }

  const nextProfile = nextProfileResult.value;
  if (nextProfile.orientation === activeBookProfileState.orientation) {
    syncPreviewChromeFormatValue();
    return nextProfile;
  }

  activeBookProfileState = nextProfile;
  const metrics = getPageMetrics({
    profile: activeBookProfileState,
    zoom: editorZoom,
  });
  if (metrics) {
    applyPageGeometryCssVars(metrics);
  }
  scheduleLayoutPreviewRefresh();
  scheduleCentralSheetStripProofRefresh();
  syncPreviewChromeFormatValue();
  return nextProfile;
}

const initialPageMetrics = getPageMetrics({
  profile: activeBookProfileState,
  zoom: ZOOM_DEFAULT,
});
if (initialPageMetrics) {
  applyPageGeometryCssVars(initialPageMetrics);
}
applyPreviewChromeCssVars(activePreviewChromeState, document.documentElement, ZOOM_DEFAULT, PX_PER_MM_AT_ZOOM_1);
syncPreviewChromeFormatValue();
syncLayoutPreviewControlStates();

function ensureLayoutPreviewHost() {
  if (layoutPreviewHost) {
    return layoutPreviewHost;
  }
  if (!(mainContent instanceof HTMLElement)) {
    return null;
  }
  const host = document.createElement('aside');
  host.className = 'layout-preview-dock';
  host.hidden = true;
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-label', 'Layout preview');
  mainContent.appendChild(host);
  layoutPreviewHost = host;
  return layoutPreviewHost;
}

function clearLayoutPreviewHost() {
  const host = ensureLayoutPreviewHost();
  if (!host) {
    return;
  }
  host.replaceChildren();
}

function buildActiveLayoutPreviewSnapshot() {
  const metrics = getPageMetrics({
    profile: activeBookProfileState,
    zoom: editorZoom,
  });
  if (!metrics) {
    return null;
  }
  return buildCachedLayoutPreviewSnapshot({
    text: getPlainText(),
    profile: getActiveBookProfile(),
    metrics,
    selectionRange: getSelectionOffsets(),
  }, layoutPreviewSnapshotCache);
}

function refreshLayoutPreviewNow() {
  const host = ensureLayoutPreviewHost();
  if (!host) {
    return;
  }
  if (!activeLayoutPreviewState.enabled || currentMode !== 'write') {
    clearLayoutPreviewHost();
    return;
  }
  const snapshot = buildActiveLayoutPreviewSnapshot();
  if (!snapshot) {
    clearLayoutPreviewHost();
    return;
  }
  renderLayoutPreviewSnapshot(host, snapshot, activeLayoutPreviewState);
}

function scheduleLayoutPreviewRefresh() {
  if (!activeLayoutPreviewState.enabled || currentMode !== 'write') {
    return;
  }
  if (layoutPreviewRefreshTimerId) {
    window.clearTimeout(layoutPreviewRefreshTimerId);
    layoutPreviewRefreshTimerId = null;
  }
  layoutPreviewRefreshTimerId = window.setTimeout(() => {
    layoutPreviewRefreshTimerId = null;
    refreshLayoutPreviewNow();
  }, 120);
}

function syncLayoutPreviewVisibility() {
  syncLayoutPreviewControlStates();
  const host = ensureLayoutPreviewHost();
  if (!host) {
    return;
  }
  const shouldShow = activeLayoutPreviewState.enabled && currentMode === 'write';
  host.hidden = !shouldShow;
  if (mainContent instanceof HTMLElement) {
    mainContent.classList.toggle('is-layout-preview-visible', shouldShow);
  }
  if (!shouldShow) {
    clearLayoutPreviewHost();
    if (layoutPreviewRefreshTimerId) {
      window.clearTimeout(layoutPreviewRefreshTimerId);
      layoutPreviewRefreshTimerId = null;
    }
    return;
  }
  refreshLayoutPreviewNow();
}

function handleToggleLayoutPreview() {
  activeLayoutPreviewState = createLayoutPreviewState({
    ...activeLayoutPreviewState,
    enabled: !activeLayoutPreviewState.enabled,
  });
  syncLayoutPreviewVisibility();
  updateInspectorSnapshot();
  return {
    performed: true,
    enabled: activeLayoutPreviewState.enabled,
  };
}

function handleToggleLayoutPreviewFrame() {
  activeLayoutPreviewState = createLayoutPreviewState({
    ...activeLayoutPreviewState,
    frameMode: !activeLayoutPreviewState.frameMode,
  });
  syncLayoutPreviewControlStates();
  if (activeLayoutPreviewState.enabled) {
    syncLayoutPreviewVisibility();
  }
  updateInspectorSnapshot();
  return {
    performed: true,
    frameMode: activeLayoutPreviewState.frameMode,
  };
}

function canStartFloatingToolbarDrag(target) {
  if (!target || !(target instanceof Element)) return false;
  return !target.closest('button, select, option, input, textarea, label');
}

function clampFloatingToolbarPosition(position, shellRect = toolbarShell?.getBoundingClientRect()) {
  if (!toolbarShell) {
    return position;
  }
  const minX = FLOATING_TOOLBAR_VISIBLE_STRIP_PX - shellRect.width;
  const maxX = window.innerWidth - FLOATING_TOOLBAR_VISIBLE_STRIP_PX;
  const minY = FLOATING_TOOLBAR_VISIBLE_STRIP_PX - shellRect.height;
  const maxY = window.innerHeight - FLOATING_TOOLBAR_VISIBLE_STRIP_PX;
  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  };
}

function clampFloatingToolbarWidthScale(widthScale, isVertical = false) {
  const minimumWidthScale = isVertical ? 1 : FLOATING_TOOLBAR_WIDTH_SCALE_MIN;
  return Math.min(
    Math.max(widthScale, minimumWidthScale),
    FLOATING_TOOLBAR_WIDTH_SCALE_MAX
  );
}

function clampFloatingToolbarScale(scale) {
  const clamped = Math.min(
    Math.max(scale, FLOATING_TOOLBAR_SCALE_MIN),
    FLOATING_TOOLBAR_SCALE_MAX
  );
  const stepped = Math.round(clamped / FLOATING_TOOLBAR_SCALE_STEP) * FLOATING_TOOLBAR_SCALE_STEP;
  return Number(Math.min(
    Math.max(stepped, FLOATING_TOOLBAR_SCALE_MIN),
    FLOATING_TOOLBAR_SCALE_MAX
  ).toFixed(2));
}

function getFloatingToolbarDevicePixelStep() {
  const devicePixelRatio = Number(window.devicePixelRatio);
  const boundedRatio = Number.isFinite(devicePixelRatio)
    ? Math.min(Math.max(devicePixelRatio, 1), 4)
    : 1;
  return 1 / boundedRatio;
}

function snapFloatingToolbarMetric(value, step = getFloatingToolbarDevicePixelStep()) {
  return Math.round(value / step) * step;
}

function formatFloatingToolbarMetric(value) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/u, '').replace(/\.$/u, '');
}

function getFloatingToolbarContentMetricScale(scale, isVertical) {
  const clampedScale = clampFloatingToolbarScale(scale);
  const projectedMinimum = isVertical
    ? FLOATING_TOOLBAR_PROJECTED_SCALE_VERTICAL_MIN
    : FLOATING_TOOLBAR_PROJECTED_SCALE_HORIZONTAL_MIN;
  const projectedMaximum = isVertical
    ? FLOATING_TOOLBAR_PROJECTED_SCALE_VERTICAL_MAX
    : FLOATING_TOOLBAR_PROJECTED_SCALE_HORIZONTAL_MAX;
  if (clampedScale >= 1) {
    const progress = (clampedScale - 1) / (FLOATING_TOOLBAR_SCALE_MAX - 1);
    return 1 + (progress * (projectedMaximum - 1));
  }
  const progress = (clampedScale - FLOATING_TOOLBAR_SCALE_MIN) / (1 - FLOATING_TOOLBAR_SCALE_MIN);
  return projectedMinimum + (progress * (1 - projectedMinimum));
}

function getFloatingToolbarMetricProjectionScale(name, contentScale) {
  return FLOATING_TOOLBAR_OPTICAL_METRIC_KEYS.has(name)
    ? Math.sqrt(contentScale)
    : contentScale;
}

function applyFloatingToolbarMetricScale() {
  if (!toolbarShell) return;
  const scale = clampFloatingToolbarScale(floatingToolbarState.scale);
  const contentScale = getFloatingToolbarContentMetricScale(scale, floatingToolbarState.isVertical);
  const devicePixelStep = getFloatingToolbarDevicePixelStep();
  const signature = `${scale}:${contentScale}:${devicePixelStep}`;
  if (signature === floatingToolbarMetricScaleSignature) return;
  for (const [name, baseValue] of Object.entries(FLOATING_TOOLBAR_METRIC_BASE_PX)) {
    const projectionScale = getFloatingToolbarMetricProjectionScale(name, contentScale);
    const scaledValue = snapFloatingToolbarMetric(baseValue * projectionScale, devicePixelStep);
    toolbarShell.style.setProperty(name, `${formatFloatingToolbarMetric(scaledValue)}px`);
  }
  floatingToolbarMetricScaleSignature = signature;
}

function readFloatingToolbarState() {
  try {
    const raw = localStorage.getItem(FLOATING_TOOLBAR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    const scale = Number(parsed.scale);
    const widthScale = Number(parsed.widthScale);
    const dockedWidthScale = Number(parsed.dockedWidthScale);
    const freeWidthScale = Number(parsed.freeWidthScale);
    const toolbarHeight = Number(parsed.toolbarHeight);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const resolvedWidthScale = Number.isFinite(widthScale) ? widthScale : 1;
    const resolvedDockedWidthScale = Number.isFinite(dockedWidthScale) ? dockedWidthScale : resolvedWidthScale;
    const resolvedFreeWidthScale = Number.isFinite(freeWidthScale) ? freeWidthScale : resolvedWidthScale;
    return {
      x,
      y,
      isVertical: Boolean(parsed.isVertical),
      isDetached: Boolean(parsed.isDetached),
      scale: Number.isFinite(scale) ? scale : 1,
      widthScale: Boolean(parsed.isDetached) ? resolvedFreeWidthScale : resolvedDockedWidthScale,
      dockedWidthScale: resolvedDockedWidthScale,
      freeWidthScale: resolvedFreeWidthScale,
      toolbarHeight: Number.isFinite(toolbarHeight) ? toolbarHeight : 0,
    };
  } catch {
    return null;
  }
}

function persistFloatingToolbarState() {
  try {
    localStorage.setItem(FLOATING_TOOLBAR_STORAGE_KEY, JSON.stringify(floatingToolbarState));
  } catch {}
}

function readFloatingToolbarItemOffsets() {
  try {
    const raw = localStorage.getItem(FLOATING_TOOLBAR_ITEM_OFFSETS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => Number.isFinite(Number(value)))
    );
  } catch {
    return {};
  }
}

function persistFloatingToolbarItemOffsets() {
  try {
    localStorage.setItem(FLOATING_TOOLBAR_ITEM_OFFSETS_STORAGE_KEY, JSON.stringify(toolbarItemOffsets));
  } catch {}
}

function getFloatingToolbarItemOffsetKey(item) {
  if (!(item instanceof HTMLElement)) return '';
  return item.dataset.toolbarItemKey || item.dataset.action || '';
}

function applyFloatingToolbarItemOffsets() {
  const contentScale = getFloatingToolbarContentMetricScale(
    floatingToolbarState.scale,
    floatingToolbarState.isVertical
  );
  toolbarTunableItems.forEach((item) => {
    const key = getFloatingToolbarItemOffsetKey(item);
    const offset = floatingToolbarState.isDetached ? Number(toolbarItemOffsets[key] || 0) : 0;
    const scaledOffset = snapFloatingToolbarMetric(offset * contentScale);
    item.style.setProperty('--floating-toolbar-offset-x', `${formatFloatingToolbarMetric(scaledOffset)}px`);
  });
  scheduleToolbarAnchorUpdate();
}

function setFloatingToolbarItemOffset(item, nextOffset, persist = true) {
  const key = getFloatingToolbarItemOffsetKey(item);
  if (!key) return;
  const roundedOffset = Math.round(nextOffset);
  const normalizedOffset = Math.abs(roundedOffset) <= FLOATING_TOOLBAR_ITEM_SNAP_THRESHOLD_PX ? 0 : roundedOffset;
  if (normalizedOffset === 0) {
    delete toolbarItemOffsets[key];
  } else {
    toolbarItemOffsets[key] = normalizedOffset;
  }
  applyFloatingToolbarItemOffsets();
  if (persist) {
    persistFloatingToolbarItemOffsets();
  }
}

function restoreFloatingToolbarItemOffsets() {
  toolbarItemOffsets = readFloatingToolbarItemOffsets();
  applyFloatingToolbarItemOffsets();
}

function stopFloatingToolbarItemOffsetDrag() {
  if (!toolbarItemOffsetDragState.active) return;
  const shouldReleaseClickSuppression = toolbarItemOffsetDragState.moved;
  if (toolbarItemOffsetDragState.item) {
    persistFloatingToolbarItemOffsets();
  }
  toolbarItemOffsetDragState = {
    active: false,
    item: null,
    key: '',
    startX: 0,
    originOffset: 0,
    moved: false,
  };
  if (shouldReleaseClickSuppression) {
    window.setTimeout(() => {
      toolbarItemSuppressClickOnce = false;
    }, 0);
  }
}

function setToolbarSpacingMenuOpen(nextOpen) {
  if (!toolbarSpacingMenu || !toolbarShell) return;
  if (!nextOpen) {
    toolbarSpacingMenu.hidden = true;
    return;
  }
  setParagraphMenuOpen(false);
  setListMenuOpen(false);
  setToolbarColorPickerOpen(false);
  setToolbarStylesMenuOpen(false);
  const shellRect = toolbarShell.getBoundingClientRect();
  toolbarSpacingMenu.hidden = false;
  const menuRect = toolbarSpacingMenu.getBoundingClientRect();
  const clusterLeft = Number.parseFloat(toolbarShell.style.getPropertyValue('--floating-toolbar-cluster-left')) || 0;
  const clusterRight = Number.parseFloat(toolbarShell.style.getPropertyValue('--floating-toolbar-cluster-right')) || 0;
  const clusterBottom = Number.parseFloat(toolbarShell.style.getPropertyValue('--floating-toolbar-cluster-bottom')) || 0;
  const clusterCenterX = clusterLeft + ((clusterRight - clusterLeft) / 2);
  const desiredLeft = clusterCenterX - (menuRect.width / 2);
  const desiredTop = clusterBottom + 18;
  const maxLeft = Math.max(0, shellRect.width - menuRect.width);
  const nextLeft = Math.round(Math.min(Math.max(desiredLeft, 0), maxLeft));
  const nextTop = Math.round(desiredTop);
  toolbarSpacingMenu.style.left = `${nextLeft}px`;
  toolbarSpacingMenu.style.top = `${nextTop}px`;
}

function setParagraphMenuOpen(nextOpen) {
  if (!paragraphMenu || !paragraphTriggerButton || !toolbarShell) return;
  if (!nextOpen) {
    paragraphMenu.hidden = true;
    paragraphTriggerButton.setAttribute('aria-expanded', 'false');
    return;
  }
  setToolbarSpacingMenuOpen(false);
  setListMenuOpen(false);
  setToolbarColorPickerOpen(false);
  setToolbarStylesMenuOpen(false);
  const shellRect = toolbarShell.getBoundingClientRect();
  const triggerRect = paragraphTriggerButton.getBoundingClientRect();
  paragraphMenu.hidden = false;
  const menuRect = paragraphMenu.getBoundingClientRect();
  const desiredLeft = triggerRect.left - shellRect.left;
  const desiredTop = (triggerRect.bottom - shellRect.top) + 10;
  const maxLeft = Math.max(0, shellRect.width - menuRect.width);
  const nextLeft = Math.round(Math.min(Math.max(desiredLeft, 0), maxLeft));
  const nextTop = Math.round(desiredTop);
  paragraphMenu.style.left = `${nextLeft}px`;
  paragraphMenu.style.top = `${nextTop}px`;
  paragraphTriggerButton.setAttribute('aria-expanded', 'true');
}

function setListMenuOpen(nextOpen) {
  if (!listMenu || !listTriggerButton || !toolbarShell) return;
  if (!nextOpen || !isTiptapMode) {
    listMenu.hidden = true;
    listTriggerButton.setAttribute('aria-expanded', 'false');
    return;
  }
  setParagraphMenuOpen(false);
  setToolbarSpacingMenuOpen(false);
  setToolbarColorPickerOpen(false);
  setToolbarStylesMenuOpen(false);
  const shellRect = toolbarShell.getBoundingClientRect();
  const triggerRect = listTriggerButton.getBoundingClientRect();
  listMenu.hidden = false;
  const menuRect = listMenu.getBoundingClientRect();
  const desiredLeft = triggerRect.left - shellRect.left;
  const desiredTop = (triggerRect.bottom - shellRect.top) + 10;
  const maxLeft = Math.max(0, shellRect.width - menuRect.width);
  const nextLeft = Math.round(Math.min(Math.max(desiredLeft, 0), maxLeft));
  const nextTop = Math.round(desiredTop);
  listMenu.style.left = `${nextLeft}px`;
  listMenu.style.top = `${nextTop}px`;
  listTriggerButton.setAttribute('aria-expanded', 'true');
}

function normalizeToolbarStylesMenuAnchor(anchor) {
  return anchor === TOOLBAR_STYLES_MENU_ANCHORS.character
    ? TOOLBAR_STYLES_MENU_ANCHORS.character
    : TOOLBAR_STYLES_MENU_ANCHORS.paragraph;
}

function getToolbarStylesAnchorButton(anchor) {
  return normalizeToolbarStylesMenuAnchor(anchor) === TOOLBAR_STYLES_MENU_ANCHORS.character
    ? styleCharacterButton
    : styleParagraphButton;
}

function setToolbarStylesMenuOpen(nextOpen, nextAnchor = toolbarStylesMenuState.anchor) {
  if (!toolbarStylesMenu || !toolbarShell) return;
  const anchor = normalizeToolbarStylesMenuAnchor(nextAnchor);
  if (!nextOpen) {
    toolbarStylesMenu.hidden = true;
    toolbarStylesMenu.setAttribute('aria-hidden', 'true');
    if (styleParagraphButton instanceof HTMLElement) {
      styleParagraphButton.setAttribute('aria-expanded', 'false');
    }
    if (styleCharacterButton instanceof HTMLElement) {
      styleCharacterButton.setAttribute('aria-expanded', 'false');
    }
    toolbarStylesMenuState = {
      ...toolbarStylesMenuState,
      open: false,
      anchor,
    };
    return;
  }
  setToolbarSpacingMenuOpen(false);
  setParagraphMenuOpen(false);
  setListMenuOpen(false);
  setToolbarColorPickerOpen(false);
  const anchorButton = getToolbarStylesAnchorButton(anchor);
  if (!(anchorButton instanceof HTMLElement)) return;
  const shellRect = toolbarShell.getBoundingClientRect();
  const triggerRect = anchorButton.getBoundingClientRect();
  toolbarStylesMenu.hidden = false;
  toolbarStylesMenu.setAttribute('aria-hidden', 'false');
  const menuRect = toolbarStylesMenu.getBoundingClientRect();
  const rawLeft = (triggerRect.left - shellRect.left) + ((triggerRect.width - menuRect.width) / 2);
  const maxLeft = Math.max(0, shellRect.width - menuRect.width);
  const nextLeft = Math.round(Math.min(Math.max(rawLeft, 0), maxLeft));
  const nextTop = Math.round((triggerRect.bottom - shellRect.top) + 10);
  toolbarStylesMenu.style.left = `${nextLeft}px`;
  toolbarStylesMenu.style.top = `${nextTop}px`;
  toolbarStylesMenuState = {
    ...toolbarStylesMenuState,
    open: true,
    anchor,
  };
  if (styleParagraphButton instanceof HTMLElement) {
    styleParagraphButton.setAttribute('aria-expanded', anchor === TOOLBAR_STYLES_MENU_ANCHORS.paragraph ? 'true' : 'false');
  }
  if (styleCharacterButton instanceof HTMLElement) {
    styleCharacterButton.setAttribute('aria-expanded', anchor === TOOLBAR_STYLES_MENU_ANCHORS.character ? 'true' : 'false');
  }
}

function setToolbarSpacingTuningMode(nextActive) {
  toolbarSpacingTuningMode = Boolean(nextActive);
  if (toolbarShell) {
    toolbarShell.classList.toggle('is-spacing-tuning', toolbarSpacingTuningMode);
  }
  if (toolbarSpacingAction) {
    toolbarSpacingAction.textContent = toolbarSpacingTuningMode ? 'Завершить отступы' : 'Изменить отступы';
    toolbarSpacingAction.setAttribute('aria-pressed', toolbarSpacingTuningMode ? 'true' : 'false');
  }
  if (!toolbarSpacingTuningMode) {
    stopFloatingToolbarItemOffsetDrag();
  }
}

function getToolbarAnchorSnapStep() {
  const dpr = Number(window.devicePixelRatio);
  return Number.isFinite(dpr) && dpr >= 2 ? 0.5 : 1;
}

function snapToolbarAnchorValue(value) {
  if (!Number.isFinite(value)) return 0;
  const step = getToolbarAnchorSnapStep();
  return Math.round(value / step) * step;
}

function setToolbarAnchorVar(host, name, value) {
  if (!(host instanceof HTMLElement)) return;
  const snapped = snapToolbarAnchorValue(value);
  const cssValue = Number.isInteger(snapped) ? String(snapped) : snapped.toFixed(1);
  host.style.setProperty(name, `${cssValue}px`);
}

function updateToolbarAnchorVars() {
  if (!toolbarShell || !toolbarTunableItems.length) return;
  const shellRect = toolbarShell.getBoundingClientRect();
  const itemRects = toolbarTunableItems
    .map((item) => item.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!itemRects.length) return;
  const bounds = itemRects.reduce((acc, rect) => ({
    left: Math.min(acc.left, rect.left),
    right: Math.max(acc.right, rect.right),
    top: Math.min(acc.top, rect.top),
    bottom: Math.max(acc.bottom, rect.bottom),
  }), {
    left: itemRects[0].left,
    right: itemRects[0].right,
    top: itemRects[0].top,
    bottom: itemRects[0].bottom,
  });
  const localLeft = bounds.left - shellRect.left;
  const localRight = bounds.right - shellRect.left;
  const localTop = bounds.top - shellRect.top;
  const localBottom = bounds.bottom - shellRect.top;
  setToolbarAnchorVar(toolbarShell, '--floating-toolbar-cluster-left', localLeft);
  setToolbarAnchorVar(toolbarShell, '--floating-toolbar-cluster-right', localRight);
  setToolbarAnchorVar(toolbarShell, '--floating-toolbar-cluster-top', localTop);
  setToolbarAnchorVar(toolbarShell, '--floating-toolbar-cluster-bottom', localBottom);
  setToolbarAnchorVar(toolbarShell, '--floating-toolbar-cluster-center-x', localLeft + ((localRight - localLeft) / 2));
  setToolbarAnchorVar(toolbarShell, '--floating-toolbar-cluster-center-y', localTop + ((localBottom - localTop) / 2));
  if (!toolbarSpacingMenu?.hidden) {
    setToolbarSpacingMenuOpen(true);
  } else if (!paragraphMenu?.hidden) {
    setParagraphMenuOpen(true);
  } else if (!listMenu?.hidden) {
    setListMenuOpen(true);
  } else if (!toolbarStylesMenu?.hidden) {
    setToolbarStylesMenuOpen(true, toolbarStylesMenuState.anchor);
  }
}

function scheduleToolbarAnchorUpdate() {
  if (toolbarAnchorFrameId) {
    cancelAnimationFrame(toolbarAnchorFrameId);
  }
  toolbarAnchorFrameId = requestAnimationFrame(() => {
    toolbarAnchorFrameId = 0;
    updateToolbarAnchorVars();
  });
}

function isMainToolbarAnchorHidden(anchor) {
  if (!(anchor instanceof HTMLElement)) return true;
  return anchor.hidden || anchor.getClientRects().length === 0;
}

function getVisibleToolbarBindKeys(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }
  const keys =
    snapshot.visibleBindKeys ||
    snapshot.visibleKeys ||
    snapshot.visibleToolbarBindKeys ||
    snapshot.bindKeys;
  return Array.isArray(keys) ? new Set(keys.filter((key) => typeof key === 'string' && key.length > 0)) : null;
}

function getCurrentMainToolbarRoot() {
  return document.querySelector('[data-toolbar]') || toolbar;
}

function closeOrphanedMainToolbarOverlays(snapshot) {
  const runtimeRegistry = snapshot?.registry && typeof snapshot.registry === 'object'
    ? snapshot.registry
    : toolbarRuntimeRegistry;
  const visibleBindKeys = getVisibleToolbarBindKeys(snapshot);
  const hasVisibleItems = !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
    ? true
    : snapshot.hasVisibleItems !== false;
  const paragraphVisible = typeof snapshot?.paragraphTriggerVisible === 'boolean'
    ? snapshot.paragraphTriggerVisible
    : !hasVisibleItems
    ? false
    : visibleBindKeys
    ? (
      visibleBindKeys.has('paragraph-trigger')
      || visibleBindKeys.has('toolbar.paragraph.alignment')
      || visibleBindKeys.has('style-paragraph')
    )
    : !isMainToolbarAnchorHidden(runtimeRegistry?.paragraphTriggerButton || paragraphTriggerButton);
  const spacingVisible = hasVisibleItems;
  const listVisible = typeof snapshot?.listTriggerVisible === 'boolean'
    ? snapshot.listTriggerVisible
    : !hasVisibleItems
    ? false
    : visibleBindKeys
    ? visibleBindKeys.has('list-type')
    : !isMainToolbarAnchorHidden(runtimeRegistry?.listTriggerButton || listTriggerButton);

  const currentParagraphMenu = runtimeRegistry?.paragraphMenu || paragraphMenu;
  const currentParagraphTriggerButton = runtimeRegistry?.paragraphTriggerButton || paragraphTriggerButton;
  const currentListMenu = runtimeRegistry?.listMenu || listMenu;
  const currentListTriggerButton = runtimeRegistry?.listTriggerButton || listTriggerButton;
  const currentSpacingMenu = runtimeRegistry?.toolbarSpacingMenu || toolbarSpacingMenu;

  if (currentParagraphMenu && !currentParagraphMenu.hidden && !paragraphVisible) {
    currentParagraphMenu.hidden = true;
    if (currentParagraphTriggerButton && typeof currentParagraphTriggerButton.setAttribute === 'function') {
      currentParagraphTriggerButton.setAttribute('aria-expanded', 'false');
    }
  }
  if (currentListMenu && !currentListMenu.hidden && !listVisible) {
    currentListMenu.hidden = true;
    if (currentListTriggerButton && typeof currentListTriggerButton.setAttribute === 'function') {
      currentListTriggerButton.setAttribute('aria-expanded', 'false');
    }
  }
  if (currentSpacingMenu && !currentSpacingMenu.hidden && !spacingVisible) {
    currentSpacingMenu.hidden = true;
  }
}

function restoreFocusFromHiddenMainToolbarItem() {
  const activeElement = document.activeElement;
  const currentToolbar = getCurrentMainToolbarRoot();
  if (!(activeElement instanceof HTMLElement) || !(currentToolbar instanceof HTMLElement) || !currentToolbar.contains(activeElement)) {
    return;
  }
  const activeToolbarItem = activeElement.closest('[data-toolbar-item-key]');
  if (!(activeToolbarItem instanceof HTMLElement)) {
    return;
  }
  if (!activeToolbarItem.hidden && activeToolbarItem.getClientRects().length > 0) {
    return;
  }
  const focusResult = focusEditorSurface('current');
  if (focusResult && focusResult.performed !== false) {
    return;
  }
  if (typeof activeElement.blur === 'function') {
    activeElement.blur();
  }
}

function projectMainFloatingToolbarRuntime(reason = 'projection') {
  const applyToolbarActiveProfile = typeof toolbarRuntimeProjectionModule.applyToolbarActiveProfile === 'function'
    ? toolbarRuntimeProjectionModule.applyToolbarActiveProfile
    : toolbarRuntimeProjectionModule.applyToolbarProfileMinimal;
  if (!toolbarRuntimeRegistry || typeof applyToolbarActiveProfile !== 'function') {
    return null;
  }
  const snapshot = applyToolbarActiveProfile(
    toolbarRuntimeRegistry,
    configuratorBucketState,
    {
      reason,
      currentProjectId,
      floatingToolbarState,
      toolbarItemOffsets,
    }
  );
  if (snapshot?.registry && snapshot.registry !== toolbarRuntimeRegistry) {
    toolbarRuntimeRegistry = snapshot.registry;
  }
  closeOrphanedMainToolbarOverlays(snapshot);
  restoreFocusFromHiddenMainToolbarItem();
  syncToolbarFormattingState();
  if (!snapshot || snapshot.anchorResyncRequired !== false) {
    scheduleToolbarAnchorUpdate();
  }
  return snapshot;
}

function getSnappedFloatingToolbarPosition(shellRect = toolbarShell?.getBoundingClientRect()) {
  const topBarRect = topWorkBar?.getBoundingClientRect();
  const shellWidth = shellRect?.width || 0;
  const shellHeight = shellRect?.height || 0;
  const baseY = topBarRect ? topBarRect.top + ((topBarRect.height - shellHeight) / 2) : 92;
  const centeredX = topBarRect ? topBarRect.left + ((topBarRect.width - shellWidth) / 2) : (window.innerWidth - shellWidth) / 2;
  const leftShellRect = leftToolbarShell?.getBoundingClientRect();
  const leftReservation = leftShellRect && leftShellRect.width > 0
    ? leftShellRect.right + 16
    : topBarRect?.left || 0;
  const maximumX = topBarRect ? topBarRect.right - shellWidth - 16 : window.innerWidth - shellWidth;
  const baseX = Math.min(Math.max(centeredX, leftReservation), maximumX);
  return clampFloatingToolbarPosition({
    x: baseX,
    y: baseY,
  }, shellRect);
}

function getSnappedFloatingToolbarX(nextX, shellRect = toolbarShell?.getBoundingClientRect()) {
  const topBarRect = topWorkBar?.getBoundingClientRect();
  if (!topBarRect) {
    return clampFloatingToolbarPosition({ x: nextX, y: floatingToolbarState.y }, shellRect).x;
  }
  const shellWidth = shellRect?.width || 0;
  const minX = topBarRect.left;
  const maxX = topBarRect.right - shellWidth;
  const centeredX = topBarRect.left + ((topBarRect.width - shellWidth) / 2);
  const clampedX = Math.min(Math.max(nextX, minX), maxX);
  if (Math.abs(clampedX - centeredX) <= FLOATING_TOOLBAR_CENTER_ANCHOR_PX) {
    return centeredX;
  }
  return clampedX;
}

function getDefaultFloatingToolbarState(shellRect = toolbarShell?.getBoundingClientRect()) {
  const snapped = getSnappedFloatingToolbarPosition(shellRect);
  const topBarRect = topWorkBar?.getBoundingClientRect();
  return {
    x: snapped.x,
    y: snapped.y,
    isVertical: false,
    isDetached: false,
    scale: 1,
    widthScale: 1,
    dockedWidthScale: 1,
    freeWidthScale: 1,
    toolbarHeight: Number.isFinite(topBarRect?.height) ? topBarRect.height : 0,
  };
}

function applyFloatingToolbarVisualState() {
  if (!toolbarShell) return;
  toolbarShell.style.transform = 'none';
  toolbarShell.style.setProperty('--floating-toolbar-scale', String(floatingToolbarState.scale));
  applyFloatingToolbarMetricScale();
  toolbarShell.style.setProperty(
    '--floating-toolbar-width-scale',
    String(floatingToolbarState.isDetached ? floatingToolbarState.freeWidthScale : floatingToolbarState.dockedWidthScale)
  );
  toolbarShell.classList.toggle('is-vertical', floatingToolbarState.isVertical);
  toolbarShell.classList.toggle('is-snapped', !floatingToolbarState.isDetached);
  scheduleToolbarAnchorUpdate();
}

function applyFloatingToolbarState(partialState, persist = true) {
  if (!toolbar) return;
  const shellRect = toolbarShell?.getBoundingClientRect();
  const nextPosition = clampFloatingToolbarPosition({
    x: partialState.x,
    y: partialState.y,
  }, shellRect);
  const nextIsDetached = Boolean(partialState.isDetached);
  const nextIsVertical = Boolean(partialState.isVertical);
  const nextScale = clampFloatingToolbarScale(
    Number.isFinite(partialState.scale) ? partialState.scale : floatingToolbarState.scale
  );
  const isModeTransition = nextIsDetached !== floatingToolbarState.isDetached;
  const providedWidthScale = Number.isFinite(partialState.widthScale)
    ? partialState.widthScale
    : floatingToolbarState.widthScale;
  let nextDockedWidthScale;
  let nextFreeWidthScale;
  if (isModeTransition) {
    if (nextIsDetached) {
      nextDockedWidthScale = clampFloatingToolbarWidthScale(
        Number.isFinite(partialState.dockedWidthScale)
          ? partialState.dockedWidthScale
          : floatingToolbarState.dockedWidthScale || providedWidthScale,
        nextIsVertical
      );
      nextFreeWidthScale = clampFloatingToolbarWidthScale(providedWidthScale, nextIsVertical);
    } else {
      nextDockedWidthScale = clampFloatingToolbarWidthScale(providedWidthScale, nextIsVertical);
      nextFreeWidthScale = clampFloatingToolbarWidthScale(
        Number.isFinite(partialState.freeWidthScale)
          ? partialState.freeWidthScale
          : floatingToolbarState.freeWidthScale || providedWidthScale,
        nextIsVertical
      );
    }
  } else {
    nextDockedWidthScale = clampFloatingToolbarWidthScale(
      Number.isFinite(partialState.dockedWidthScale)
        ? partialState.dockedWidthScale
        : (!nextIsDetached ? providedWidthScale : floatingToolbarState.dockedWidthScale || providedWidthScale),
      nextIsVertical
    );
    nextFreeWidthScale = clampFloatingToolbarWidthScale(
      Number.isFinite(partialState.freeWidthScale)
        ? partialState.freeWidthScale
        : (nextIsDetached ? providedWidthScale : floatingToolbarState.freeWidthScale || providedWidthScale),
      nextIsVertical
    );
  }
  floatingToolbarState = {
    x: nextPosition.x,
    y: nextPosition.y,
    isVertical: nextIsVertical,
    isDetached: nextIsDetached,
    scale: nextScale,
    widthScale: nextIsDetached ? nextFreeWidthScale : nextDockedWidthScale,
    dockedWidthScale: nextDockedWidthScale,
    freeWidthScale: nextFreeWidthScale,
    toolbarHeight: Number.isFinite(partialState.toolbarHeight) ? partialState.toolbarHeight : 0,
  };
  toolbar.style.left = `${Math.round(floatingToolbarState.x)}px`;
  toolbar.style.top = `${Math.round(floatingToolbarState.y)}px`;
  toolbar.style.transform = 'none';
  if (persist) {
    persistFloatingToolbarState();
  }
  applyFloatingToolbarVisualState();
  applyFloatingToolbarItemOffsets();
  scheduleToolbarAnchorUpdate();
}

function restoreFloatingToolbarPosition() {
  if (!toolbarShell) return;
  const saved = readFloatingToolbarState();
  if (saved && !saved.isDetached) {
    const snapped = getSnappedFloatingToolbarPosition();
    applyFloatingToolbarState({
      ...saved,
      x: snapped.x,
      y: snapped.y,
    }, true);
    return;
  }
  applyFloatingToolbarState(saved || getDefaultFloatingToolbarState(), Boolean(saved));
}

function clampLeftFloatingToolbarPosition(position, shellRect = leftToolbarShell?.getBoundingClientRect()) {
  if (!leftToolbarShell) {
    return position;
  }
  const minX = FLOATING_TOOLBAR_VISIBLE_STRIP_PX - shellRect.width;
  const maxX = window.innerWidth - FLOATING_TOOLBAR_VISIBLE_STRIP_PX;
  const minY = FLOATING_TOOLBAR_VISIBLE_STRIP_PX - shellRect.height;
  const maxY = window.innerHeight - FLOATING_TOOLBAR_VISIBLE_STRIP_PX;
  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  };
}

function readLeftFloatingToolbarState() {
  try {
    const raw = localStorage.getItem(LEFT_FLOATING_TOOLBAR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    const widthScale = Number(parsed.widthScale);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x,
      y,
      isVertical: Boolean(parsed.isVertical),
      isDetached: Boolean(parsed.isDetached),
      widthScale: Number.isFinite(widthScale) ? widthScale : 1,
    };
  } catch {
    return null;
  }
}

function persistLeftFloatingToolbarState() {
  try {
    localStorage.setItem(LEFT_FLOATING_TOOLBAR_STORAGE_KEY, JSON.stringify(leftFloatingToolbarState));
  } catch {}
}

function readLeftToolbarButtonOffsets() {
  try {
    const raw = localStorage.getItem(LEFT_TOOLBAR_BUTTON_OFFSETS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => Number.isFinite(Number(value)))
    );
  } catch {
    return {};
  }
}

function persistLeftToolbarButtonOffsets() {
  try {
    localStorage.setItem(LEFT_TOOLBAR_BUTTON_OFFSETS_STORAGE_KEY, JSON.stringify(leftToolbarButtonOffsets));
  } catch {}
}

function getLeftToolbarButtonOffsetKey(button) {
  if (!(button instanceof HTMLElement)) return '';
  return button.dataset.action || '';
}

function applyLeftToolbarButtonOffsets() {
  leftToolbarButtons.forEach((button) => {
    const key = getLeftToolbarButtonOffsetKey(button);
    const offset = Number(leftToolbarButtonOffsets[key] || 0);
    button.style.setProperty('--work-bar-offset-x', `${offset}px`);
  });
  scheduleLeftToolbarAnchorUpdate();
}

function setLeftToolbarButtonOffset(button, nextOffset, persist = true) {
  const key = getLeftToolbarButtonOffsetKey(button);
  if (!key) return;
  const normalizedOffset = Math.round(nextOffset);
  if (normalizedOffset === 0) {
    delete leftToolbarButtonOffsets[key];
  } else {
    leftToolbarButtonOffsets[key] = normalizedOffset;
  }
  applyLeftToolbarButtonOffsets();
  if (persist) {
    persistLeftToolbarButtonOffsets();
  }
}

function restoreLeftToolbarButtonOffsets() {
  leftToolbarButtonOffsets = readLeftToolbarButtonOffsets();
  applyLeftToolbarButtonOffsets();
}

function stopLeftToolbarButtonOffsetDrag() {
  if (!leftToolbarButtonOffsetDragState.active) return;
  const shouldReleaseClickSuppression = leftToolbarButtonOffsetDragState.moved;
  if (leftToolbarButtonOffsetDragState.button) {
    persistLeftToolbarButtonOffsets();
  }
  leftToolbarButtonOffsetDragState = {
    active: false,
    button: null,
    action: '',
    startX: 0,
    originOffset: 0,
    moved: false,
  };
  if (shouldReleaseClickSuppression) {
    window.setTimeout(() => {
      leftToolbarButtonSuppressClickOnce = false;
    }, 0);
  }
}

function setLeftToolbarSpacingMenuOpen(nextOpen, position = null) {
  if (!leftToolbarSpacingMenu || !leftToolbarShell) return;
  if (!nextOpen) {
    leftToolbarSpacingMenu.hidden = true;
    return;
  }
  const shellRect = leftToolbarShell.getBoundingClientRect();
  const clusterRect = leftToolbarCluster?.getBoundingClientRect();
  leftToolbarSpacingMenu.hidden = false;
  const menuRect = leftToolbarSpacingMenu.getBoundingClientRect();
  const clusterLeft = clusterRect ? clusterRect.left - shellRect.left : 0;
  const clusterRight = clusterRect ? clusterRect.right - shellRect.left : 0;
  const clusterBottom = clusterRect ? clusterRect.bottom - shellRect.top : 0;
  const clusterCenterX = clusterLeft + ((clusterRight - clusterLeft) / 2);
  const desiredLeft = clusterCenterX - (menuRect.width / 2);
  const desiredTop = clusterBottom + 18;
  const nextLeft = Math.round(desiredLeft);
  const nextTop = Math.round(desiredTop);
  leftToolbarSpacingMenu.style.left = `${nextLeft}px`;
  leftToolbarSpacingMenu.style.top = `${nextTop}px`;
}

function setLeftToolbarSpacingTuningMode(nextActive) {
  leftToolbarSpacingTuningMode = Boolean(nextActive);
  if (leftToolbarShell) {
    leftToolbarShell.classList.toggle('is-spacing-tuning', leftToolbarSpacingTuningMode);
  }
  if (leftToolbarSpacingAction) {
    leftToolbarSpacingAction.textContent = leftToolbarSpacingTuningMode ? 'Завершить отступы' : 'Изменить отступы';
    leftToolbarSpacingAction.setAttribute('aria-pressed', leftToolbarSpacingTuningMode ? 'true' : 'false');
  }
  if (!leftToolbarSpacingTuningMode) {
    stopLeftToolbarButtonOffsetDrag();
  }
}

function updateLeftToolbarAnchorVars() {
  if (!leftToolbarShell || !leftToolbarButtons.length) return;
  const shellRect = leftToolbarShell.getBoundingClientRect();
  const buttonRects = leftToolbarButtons
    .map((button) => button.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!buttonRects.length) return;
  const bounds = buttonRects.reduce((acc, rect) => ({
    left: Math.min(acc.left, rect.left),
    right: Math.max(acc.right, rect.right),
    top: Math.min(acc.top, rect.top),
    bottom: Math.max(acc.bottom, rect.bottom),
  }), {
    left: buttonRects[0].left,
    right: buttonRects[0].right,
    top: buttonRects[0].top,
    bottom: buttonRects[0].bottom,
  });
  const localLeft = bounds.left - shellRect.left;
  const localRight = bounds.right - shellRect.left;
  const localTop = bounds.top - shellRect.top;
  const localBottom = bounds.bottom - shellRect.top;
  setToolbarAnchorVar(leftToolbarShell, '--left-toolbar-cluster-left', localLeft);
  setToolbarAnchorVar(leftToolbarShell, '--left-toolbar-cluster-right', localRight);
  setToolbarAnchorVar(leftToolbarShell, '--left-toolbar-cluster-top', localTop);
  setToolbarAnchorVar(leftToolbarShell, '--left-toolbar-cluster-bottom', localBottom);
  setToolbarAnchorVar(leftToolbarShell, '--left-toolbar-cluster-center-x', localLeft + ((localRight - localLeft) / 2));
  setToolbarAnchorVar(leftToolbarShell, '--left-toolbar-cluster-center-y', localTop + ((localBottom - localTop) / 2));
}

function scheduleLeftToolbarAnchorUpdate() {
  if (leftToolbarAnchorFrameId) {
    cancelAnimationFrame(leftToolbarAnchorFrameId);
  }
  leftToolbarAnchorFrameId = requestAnimationFrame(() => {
    leftToolbarAnchorFrameId = 0;
    updateLeftToolbarAnchorVars();
  });
}

function getSnappedLeftFloatingToolbarPosition(shellRect = leftToolbarShell?.getBoundingClientRect()) {
  const topBarRect = topWorkBar?.getBoundingClientRect();
  const shellWidth = shellRect?.width || 0;
  const shellHeight = shellRect?.height || 0;
  const baseY = topBarRect ? topBarRect.top + ((topBarRect.height - shellHeight) / 2) : 92;
  const baseX = topBarRect ? topBarRect.left + 24 : 24;
  return clampLeftFloatingToolbarPosition({
    x: baseX,
    y: baseY,
  }, shellRect);
}

function getDefaultLeftFloatingToolbarState(shellRect = leftToolbarShell?.getBoundingClientRect()) {
  const snapped = getSnappedLeftFloatingToolbarPosition(shellRect);
  return {
    x: snapped.x,
    y: snapped.y,
    isVertical: false,
    isDetached: false,
    widthScale: 1,
  };
}

function applyLeftFloatingToolbarVisualState() {
  if (!leftToolbarShell) return;
  leftToolbarShell.style.transform = 'none';
  leftToolbarShell.style.removeProperty('--left-toolbar-scale');
  leftToolbarShell.style.setProperty('--left-toolbar-width-scale', String(leftFloatingToolbarState.widthScale));
  leftToolbarShell.classList.toggle('is-vertical', leftFloatingToolbarState.isVertical);
  leftToolbarShell.classList.toggle('is-snapped', !leftFloatingToolbarState.isDetached);
  scheduleLeftToolbarAnchorUpdate();
}

function applyLeftFloatingToolbarState(partialState, persist = true) {
  if (!leftToolbar) return;
  const shellRect = leftToolbarShell?.getBoundingClientRect();
  const nextPosition = clampLeftFloatingToolbarPosition({
    x: partialState.x,
    y: partialState.y,
  }, shellRect);
  leftFloatingToolbarState = {
    x: nextPosition.x,
    y: nextPosition.y,
    isVertical: Boolean(partialState.isVertical),
    isDetached: Boolean(partialState.isDetached),
    widthScale: Math.min(
      Math.max(partialState.widthScale, FLOATING_TOOLBAR_WIDTH_SCALE_MIN),
      FLOATING_TOOLBAR_WIDTH_SCALE_MAX
    ),
  };
  leftToolbar.style.left = `${Math.round(leftFloatingToolbarState.x)}px`;
  leftToolbar.style.top = `${Math.round(leftFloatingToolbarState.y)}px`;
  leftToolbar.style.transform = 'none';
  if (persist) {
    persistLeftFloatingToolbarState();
  }
  applyLeftFloatingToolbarVisualState();
}

function restoreLeftFloatingToolbarPosition() {
  if (!leftToolbarShell) return;
  const saved = readLeftFloatingToolbarState();
  applyLeftFloatingToolbarState(saved || getDefaultLeftFloatingToolbarState(), Boolean(saved));
  scheduleLeftToolbarAnchorUpdate();
}

function updateLeftTransformingClass() {
  if (!leftToolbarShell) return;
  leftToolbarShell.classList.toggle('is-transforming', Boolean(leftFloatingToolbarInteractionState.mode));
}

function setLeftFloatingToolbarHandlesVisible(nextVisible) {
  if (!leftToolbarShell) return;
  leftFloatingToolbarHandlesVisible = Boolean(nextVisible);
  leftToolbarShell.classList.toggle('is-handles-visible', leftFloatingToolbarHandlesVisible);
}

function startLeftFloatingToolbarInteraction(mode, event) {
  if (!leftToolbarShell) return;
  if (mode === 'move' && !canStartFloatingToolbarDrag(event.target)) {
    return;
  }
  event.preventDefault();
  if (mode === 'move' && event.altKey) {
    return;
  }
  leftFloatingToolbarInteractionState = {
    mode,
    active: false,
    startX: event.clientX,
    startY: event.clientY,
    origin: { ...leftFloatingToolbarState },
  };
  updateLeftTransformingClass();
}

function stopLeftFloatingToolbarInteraction() {
  if (!leftToolbarShell) return;
  if (leftFloatingToolbarInteractionState.mode) {
    persistLeftFloatingToolbarState();
  }
  leftFloatingToolbarInteractionState = {
    mode: null,
    active: false,
    startX: 0,
    startY: 0,
    origin: null,
  };
  leftToolbarShell.classList.remove('is-dragging');
  updateLeftTransformingClass();
}

function initializeLeftToolbarButtonOffsetTuning() {
  if (!leftToolbarButtons.length) return;
  restoreLeftToolbarButtonOffsets();
  leftToolbarButtons.forEach((button) => {
    button.addEventListener('mousedown', (event) => {
      // Keep button click handling independent from toolbar drag foundation.
      event.stopPropagation();
    });
    button.addEventListener('mousedown', (event) => {
      const tuningIntent = leftToolbarSpacingTuningMode || event.altKey;
      if (event.button !== 0 || !tuningIntent) return;
      const key = getLeftToolbarButtonOffsetKey(button);
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      leftToolbarButtonOffsetDragState = {
        active: true,
        button,
        action: key,
        startX: event.clientX,
        originOffset: Number(leftToolbarButtonOffsets[key] || 0),
        moved: false,
      };
    });
    button.addEventListener('dblclick', (event) => {
      if (!leftToolbarSpacingTuningMode && !event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      setLeftToolbarButtonOffset(button, 0);
      leftFloatingToolbarSuppressClickOnce = true;
    });
  });

  document.addEventListener('mousemove', (event) => {
    if (!leftToolbarButtonOffsetDragState.active || !leftToolbarButtonOffsetDragState.button) return;
    const deltaX = event.clientX - leftToolbarButtonOffsetDragState.startX;
    if (!leftToolbarButtonOffsetDragState.moved && Math.abs(deltaX) >= 1) {
      leftToolbarButtonOffsetDragState.moved = true;
      leftFloatingToolbarSuppressClickOnce = true;
      leftToolbarButtonSuppressClickOnce = true;
    }
    setLeftToolbarButtonOffset(
      leftToolbarButtonOffsetDragState.button,
      leftToolbarButtonOffsetDragState.originOffset + deltaX,
      false
    );
    event.preventDefault();
  });

  document.addEventListener('mouseup', () => {
    stopLeftToolbarButtonOffsetDrag();
  });
}

function initializeLeftToolbarActionButtons() {
  if (!leftToolbarCluster) return;
  let pressedButton = null;

  const resolveActionButton = (eventTarget) => {
    if (!(eventTarget instanceof Element)) return null;
    const button = eventTarget.closest('[data-left-action]');
    if (!(button instanceof HTMLElement)) return null;
    if (!leftToolbarCluster.contains(button)) return null;
    return button;
  };

  const clearPressedState = () => {
    if (!pressedButton) return;
    pressedButton.classList.remove('is-pressed');
    pressedButton = null;
  };

  leftToolbarCluster.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.altKey || leftToolbarSpacingTuningMode) return;
    const button = resolveActionButton(event.target);
    if (!button) return;
    clearPressedState();
    pressedButton = button;
    button.classList.add('is-pressed');
  }, true);

  document.addEventListener('pointerup', () => {
    if (!pressedButton) return;
    clearPressedState();
  });

  document.addEventListener('pointercancel', () => {
    clearPressedState();
  });

  leftToolbarCluster.addEventListener('click', (event) => {
    const button = resolveActionButton(event.target);
    if (!button) return;
    if (event.altKey || leftToolbarSpacingTuningMode) return;
    if (leftFloatingToolbarSuppressClickOnce || leftToolbarButtonSuppressClickOnce) {
      leftFloatingToolbarSuppressClickOnce = false;
      leftToolbarButtonSuppressClickOnce = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const action = button.dataset.leftAction || button.dataset.action || '';
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    triggerLeftToolbarAction(action);
  }, true);
}

function initializeLeftToolbarSpacingMenu() {
  if (!leftToolbarCluster || !leftToolbarSpacingMenu || !leftToolbarSpacingAction) return;
  setLeftToolbarSpacingTuningMode(false);
  leftToolbarCluster.addEventListener('contextmenu', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-left-toolbar-rotate-handle], [data-left-toolbar-width-handle]')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setLeftToolbarSpacingMenuOpen(true, { x: event.clientX, y: event.clientY });
    leftToolbarSpacingAction.focus();
  });
  leftToolbarSpacingAction.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setLeftToolbarSpacingTuningMode(!leftToolbarSpacingTuningMode);
    setLeftToolbarSpacingMenuOpen(false);
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!leftToolbarSpacingMenu.contains(target)) {
      setLeftToolbarSpacingMenuOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setLeftToolbarSpacingMenuOpen(false);
      if (leftToolbarSpacingTuningMode) {
        setLeftToolbarSpacingTuningMode(false);
      }
    }
  });
}

function initializeLeftFloatingToolbarDragFoundation() {
  if (!leftToolbarShell) return;
  leftToolbarShell.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    startLeftFloatingToolbarInteraction('move', event);
  });
  leftToolbarRotateHandles.forEach((handle) => {
    handle.addEventListener('mousedown', (event) => {
      event.stopPropagation();
    });
    handle.addEventListener('click', (event) => {
      event.stopPropagation();
      applyLeftFloatingToolbarState({
        ...leftFloatingToolbarState,
        isVertical: !leftFloatingToolbarState.isVertical,
      });
    });
  });
  leftToolbarWidthHandle?.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    startLeftFloatingToolbarInteraction('width', event);
  });

  document.addEventListener('mousemove', (event) => {
    const { mode, origin } = leftFloatingToolbarInteractionState;
    if (!mode || !origin || !leftToolbarShell) return;
    const deltaX = event.clientX - leftFloatingToolbarInteractionState.startX;
    const deltaY = event.clientY - leftFloatingToolbarInteractionState.startY;
    if (mode === 'move') {
      if (!leftFloatingToolbarInteractionState.active) {
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < FLOATING_TOOLBAR_DRAG_THRESHOLD_PX) {
          return;
        }
        leftFloatingToolbarInteractionState.active = true;
        leftFloatingToolbarSuppressClickOnce = true;
        leftToolbarShell.classList.add('is-dragging');
      }
      const topBarRect = topWorkBar?.getBoundingClientRect();
      const pointerNearSnapZone = Boolean(
        topBarRect &&
        event.clientY >= topBarRect.top - FLOATING_TOOLBAR_SNAP_ZONE_PX &&
        event.clientY <= topBarRect.bottom + FLOATING_TOOLBAR_SNAP_ZONE_PX
      );
      if (pointerNearSnapZone) {
        const shellRect = leftToolbarShell.getBoundingClientRect();
        const snapped = getSnappedLeftFloatingToolbarPosition(shellRect);
        const shellWidth = shellRect?.width || 0;
        const minX = topBarRect.left;
        const maxX = topBarRect.right - shellWidth;
        applyLeftFloatingToolbarState({
          ...origin,
          x: Math.min(Math.max(origin.x + deltaX, minX), maxX),
          y: snapped.y,
          isDetached: false,
        }, false);
      } else {
        applyLeftFloatingToolbarState({
          ...origin,
          x: origin.x + deltaX,
          y: origin.y + deltaY,
          isDetached: true,
        }, false);
      }
    } else if (mode === 'width') {
      leftFloatingToolbarInteractionState.active = true;
      applyLeftFloatingToolbarState({
        ...origin,
        widthScale: origin.widthScale + (deltaX * 0.01),
      }, false);
    }
    event.preventDefault();
  });

  document.addEventListener('mouseup', () => {
    if (!leftFloatingToolbarInteractionState.mode) return;
    stopLeftFloatingToolbarInteraction();
  });

  leftToolbarShell.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (leftFloatingToolbarSuppressClickOnce) {
      leftFloatingToolbarSuppressClickOnce = false;
      return;
    }
    if (target.closest('button, select, option, input, textarea, label, [data-left-toolbar-rotate-handle], [data-left-toolbar-width-handle]')) {
      return;
    }
    setLeftFloatingToolbarHandlesVisible(!leftFloatingToolbarHandlesVisible);
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!leftToolbarShell.contains(target)) {
      setLeftFloatingToolbarHandlesVisible(false);
    }
  });

  window.addEventListener('resize', () => {
    restoreLeftFloatingToolbarPosition();
    scheduleLeftToolbarAnchorUpdate();
  });

  requestAnimationFrame(() => {
    restoreLeftFloatingToolbarPosition();
    scheduleLeftToolbarAnchorUpdate();
  });
}

function setConfiguratorOpen(nextOpen) {
  if (!configuratorPanel) return;
  if (!nextOpen) {
    clearToolbarConfiguratorBucketItemSelection(true);
  }
  configuratorPanel.hidden = !nextOpen;
  if (gridTriggerButton) {
    gridTriggerButton.classList.toggle('is-active', nextOpen);
    gridTriggerButton.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    gridTriggerButton.setAttribute('aria-pressed', nextOpen ? 'true' : 'false');
  }
}

function toggleConfiguratorOpen() {
  if (!configuratorPanel) return false;
  const nextOpen = configuratorPanel.hidden;
  setConfiguratorOpen(nextOpen);
  return nextOpen;
}

function writeConfiguratorDragPayload(event, payload) {
  if (!event.dataTransfer) return false;
  try {
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
  } catch {}
  event.dataTransfer.setData('text/plain', payload.itemId || '');
  return true;
}

function readConfiguratorDragPayload(event) {
  if (activeConfiguratorDragPayload) {
    return activeConfiguratorDragPayload;
  }
  const raw = event.dataTransfer?.getData('application/json') || '';
  if (!raw) {
    const itemId = event.dataTransfer?.getData('text/plain')?.trim() || '';
    return itemId ? { sourceType: 'library-item', itemId } : null;
  }
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object') return null;
    return payload;
  } catch {
    return null;
  }
}

function getToolbarConfiguratorCatalogItem(itemId) {
  const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedItemId) return null;
  return getToolbarFunctionCatalogEntryById(normalizedItemId) || null;
}

function getToolbarConfiguratorEntryPanelLabel(entry) {
  const ruLabels = entry?.labels?.ru || null;
  const enLabels = entry?.labels?.en || null;
  return ruLabels?.panelLabel || enLabels?.panelLabel || entry?.id || '';
}

function getToolbarConfiguratorEntryAriaLabel(entry) {
  const ruLabels = entry?.labels?.ru || null;
  const enLabels = entry?.labels?.en || null;
  return ruLabels?.ariaLabel || ruLabels?.panelLabel || enLabels?.ariaLabel || enLabels?.panelLabel || entry?.id || '';
}

function getToolbarConfiguratorActiveProfile() {
  return normalizeToolbarConfiguratorProfileName(configuratorBucketState?.activeToolbarProfile);
}

function getToolbarConfiguratorProfileIds(profileName = getToolbarConfiguratorActiveProfile()) {
  const normalizedProfileName = normalizeToolbarConfiguratorProfileName(profileName);
  const profileIds = configuratorBucketState?.toolbarProfiles?.[normalizedProfileName];
  return Array.isArray(profileIds) ? profileIds : [];
}

function createToolbarConfiguratorBucketItemSelection(bucketKey = '', itemId = '') {
  const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  const normalizedBucketKey = TOOLBAR_CONFIGURATOR_PROFILE_NAMES.includes(bucketKey) ? bucketKey : '';
  if (!normalizedBucketKey || !normalizedItemId) {
    return {
      bucketKey: '',
      itemId: '',
    };
  }
  return {
    bucketKey: normalizedBucketKey,
    itemId: normalizedItemId,
  };
}

function isToolbarConfiguratorBucketItemSelected(bucketKey, itemId) {
  const normalizedSelection = createToolbarConfiguratorBucketItemSelection(bucketKey, itemId);
  return Boolean(normalizedSelection.itemId)
    && activeConfiguratorBucketItemSelection.bucketKey === normalizedSelection.bucketKey
    && activeConfiguratorBucketItemSelection.itemId === normalizedSelection.itemId;
}

function clearToolbarConfiguratorBucketItemSelection(shouldRender = false) {
  const hadSelection = Boolean(
    activeConfiguratorBucketItemSelection.bucketKey
    || activeConfiguratorBucketItemSelection.itemId
  );
  activeConfiguratorBucketItemSelection = {
    bucketKey: '',
    itemId: '',
  };
  if (shouldRender && hadSelection) {
    renderToolbarConfiguratorBuckets();
  }
  return hadSelection;
}

function reconcileToolbarConfiguratorBucketItemSelection() {
  const { bucketKey, itemId } = activeConfiguratorBucketItemSelection;
  if (!bucketKey || !itemId) {
    return false;
  }
  if (getToolbarConfiguratorProfileIds(bucketKey).includes(itemId)) {
    return false;
  }
  clearToolbarConfiguratorBucketItemSelection(false);
  return true;
}

function setToolbarConfiguratorBucketItemSelection(bucketKey, itemId, shouldRender = true) {
  const nextSelection = createToolbarConfiguratorBucketItemSelection(bucketKey, itemId);
  const didChange = nextSelection.bucketKey !== activeConfiguratorBucketItemSelection.bucketKey
    || nextSelection.itemId !== activeConfiguratorBucketItemSelection.itemId;
  if (!didChange) {
    return false;
  }
  activeConfiguratorBucketItemSelection = nextSelection;
  if (shouldRender) {
    renderToolbarConfiguratorBuckets();
  }
  return true;
}

function getToolbarConfiguratorBucketItems(bucket) {
  if (!(bucket instanceof HTMLElement)) return [];
  return Array.from(bucket.querySelectorAll('.configurator-panel__bucket-item[data-item-id]'));
}

function listToolbarConfiguratorLibraryEntries() {
  const activeProfile = getToolbarConfiguratorActiveProfile();
  const activeProfileIds = new Set(getToolbarConfiguratorProfileIds(activeProfile));
  return listLiveToolbarFunctionCatalogEntries().filter((entry) => !activeProfileIds.has(entry.id));
}

function getToolbarConfiguratorLibraryColumns(entries = listToolbarConfiguratorLibraryEntries()) {
  const safeEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const slotCount = Math.max(
    TOOLBAR_CONFIGURATOR_LIBRARY_MIN_SLOT_COUNT,
    Math.ceil(safeEntries.length / TOOLBAR_CONFIGURATOR_LIBRARY_COLUMN_COUNT) * TOOLBAR_CONFIGURATOR_LIBRARY_COLUMN_COUNT,
  );
  const columns = Array.from({ length: TOOLBAR_CONFIGURATOR_LIBRARY_COLUMN_COUNT }, () => []);
  for (let index = 0; index < slotCount; index += 1) {
    const entry = safeEntries[index] || null;
    columns[index % TOOLBAR_CONFIGURATOR_LIBRARY_COLUMN_COUNT].push(entry
      ? {
          kind: 'item',
          itemId: entry.id,
          entry,
        }
      : {
          kind: 'placeholder',
          itemId: '',
          label: TOOLBAR_CONFIGURATOR_LIBRARY_PLACEHOLDER_TEXT,
          slotIndex: index,
        });
  }
  return columns;
}

function isToolbarConfiguratorProtectedBucket(bucketKey) {
  return normalizeToolbarConfiguratorProfileName(bucketKey) === 'master';
}

function getToolbarConfiguratorBucketDropIntent(payload, bucketKey) {
  const normalizedItemId = typeof payload?.itemId === 'string' ? payload.itemId.trim() : '';
  if (!normalizedItemId) return null;

  const targetBucketKey = normalizeToolbarConfiguratorProfileName(bucketKey);
  if (payload?.sourceType !== 'bucket-item') {
    return targetBucketKey === 'minimal' || targetBucketKey === 'master' ? 'insert' : null;
  }

  const sourceBucketKey = normalizeToolbarConfiguratorProfileName(payload.bucketKey || '');
  if (sourceBucketKey === targetBucketKey) {
    return 'reorder';
  }
  if (sourceBucketKey === 'master' && targetBucketKey === 'minimal') {
    return 'copy-from-master';
  }
  if (sourceBucketKey === 'minimal' && targetBucketKey === 'master') {
    return 'return-to-master';
  }
  return null;
}

function moveToolbarConfiguratorItemWithinBucket(itemIds, itemId, insertionIndex) {
  const nextIds = Array.isArray(itemIds) ? [...itemIds] : [];
  const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  const currentIndex = nextIds.indexOf(normalizedItemId);
  if (!normalizedItemId || currentIndex < 0) return null;

  nextIds.splice(currentIndex, 1);
  let nextInsertIndex = Math.min(
    Math.max(Number.isFinite(insertionIndex) ? Math.trunc(insertionIndex) : nextIds.length, 0),
    nextIds.length,
  );
  nextIds.splice(nextInsertIndex, 0, normalizedItemId);
  return nextIds.join('\u0000') === itemIds.join('\u0000') ? null : nextIds;
}

function insertToolbarConfiguratorItemIntoBucket(itemIds, itemId, insertionIndex) {
  const nextIds = Array.isArray(itemIds) ? [...itemIds] : [];
  const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedItemId) return null;

  const currentIndex = nextIds.indexOf(normalizedItemId);
  if (currentIndex >= 0) {
    nextIds.splice(currentIndex, 1);
  }
  let nextInsertIndex = Math.min(
    Math.max(Number.isFinite(insertionIndex) ? Math.trunc(insertionIndex) : nextIds.length, 0),
    nextIds.length,
  );
  nextIds.splice(nextInsertIndex, 0, normalizedItemId);
  return nextIds.join('\u0000') === itemIds.join('\u0000') ? null : nextIds;
}

function resolveToolbarConfiguratorInterBucketTransfer(state, payload, bucketKey, insertionIndex) {
  const normalizedState = isPlainObject(state) ? state : createToolbarConfiguratorSeedState();
  const normalizedItemId = typeof payload?.itemId === 'string' ? payload.itemId.trim() : '';
  const sourceBucketKey = normalizeToolbarConfiguratorProfileName(payload?.bucketKey || '');
  const targetBucketKey = normalizeToolbarConfiguratorProfileName(bucketKey);
  if (!normalizedItemId || sourceBucketKey === targetBucketKey) {
    return null;
  }

  const minimalIds = Array.isArray(normalizedState?.toolbarProfiles?.minimal)
    ? [...normalizedState.toolbarProfiles.minimal]
    : [];
  const masterIds = Array.isArray(normalizedState?.toolbarProfiles?.master)
    ? [...normalizedState.toolbarProfiles.master]
    : [];

  if (!masterIds.includes(normalizedItemId)) {
    return null;
  }

  if (sourceBucketKey === 'master' && targetBucketKey === 'minimal') {
    const nextMinimalIds = insertToolbarConfiguratorItemIntoBucket(minimalIds, normalizedItemId, insertionIndex);
    if (!nextMinimalIds) return null;
    return {
      ...normalizedState,
      toolbarProfiles: {
        ...normalizedState.toolbarProfiles,
        minimal: nextMinimalIds,
        master: masterIds,
      },
    };
  }

  if (sourceBucketKey === 'minimal' && targetBucketKey === 'master') {
    if (!minimalIds.includes(normalizedItemId)) {
      return null;
    }
    const nextMinimalIds = minimalIds.filter((currentItemId) => currentItemId !== normalizedItemId);
    if (nextMinimalIds.length === minimalIds.length) {
      return null;
    }
    return {
      ...normalizedState,
      toolbarProfiles: {
        ...normalizedState.toolbarProfiles,
        minimal: nextMinimalIds,
        master: masterIds,
      },
    };
  }

  return null;
}

function clearToolbarConfiguratorDragSource() {
  if (activeConfiguratorDragElement instanceof HTMLElement) {
    activeConfiguratorDragElement.classList.remove('is-dragging');
  }
  activeConfiguratorDragElement = null;
}

function clearToolbarConfiguratorDropTargets() {
  configuratorBuckets.forEach((bucket) => {
    bucket.classList.remove('is-drop-target', 'is-drop-target-inside');
    delete bucket.dataset.dropIndex;
    delete bucket.dataset.dropIntent;
    bucket.querySelectorAll('.configurator-panel__bucket-item.is-drop-target-before, .configurator-panel__bucket-item.is-drop-target-after').forEach((item) => {
      item.classList.remove('is-drop-target-before', 'is-drop-target-after');
    });
  });
}

function setToolbarConfiguratorDropTarget(bucket, marker = 'inside', hoveredItem = null) {
  clearToolbarConfiguratorDropTargets();
  if (!(bucket instanceof HTMLElement)) return;
  bucket.classList.add('is-drop-target');
  if (marker === 'inside') {
    bucket.classList.add('is-drop-target-inside');
    return;
  }
  if (hoveredItem instanceof HTMLElement) {
    hoveredItem.classList.add(marker === 'before' ? 'is-drop-target-before' : 'is-drop-target-after');
  }
}

function getToolbarConfiguratorBucketInsertionIndex(bucket, event, hoveredItem = null) {
  const bucketItems = getToolbarConfiguratorBucketItems(bucket);
  if (!bucketItems.length) return 0;

  const hoveredItemElement = hoveredItem instanceof HTMLElement
    ? hoveredItem
    : (event.target instanceof Element
      ? event.target.closest('.configurator-panel__bucket-item[data-item-id]')
      : null);

  if (hoveredItemElement instanceof HTMLElement && bucket.contains(hoveredItemElement)) {
    const hoveredIndex = Math.max(0, Number.parseInt(hoveredItemElement.dataset.bucketIndex || '0', 10) || 0);
    const hoveredRect = hoveredItemElement.getBoundingClientRect();
    const isBefore = event.clientX < (hoveredRect.left + hoveredRect.width / 2);
    const sourceIndex = Number.parseInt(activeConfiguratorDragPayload?.sourceIndex || '-1', 10);

    if (activeConfiguratorDragPayload?.sourceType === 'bucket-item'
      && activeConfiguratorDragPayload.itemId
      && activeConfiguratorDragPayload.itemId === hoveredItemElement.dataset.itemId) {
      return hoveredIndex;
    }

    if (Number.isInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < hoveredIndex) {
      return isBefore ? hoveredIndex - 1 : hoveredIndex;
    }

    return isBefore ? hoveredIndex : hoveredIndex + 1;
  }

  return bucketItems.length;
}

function commitToolbarConfiguratorBucketDrop(payload, bucketKey, insertionIndex, hoveredItem = null) {
  const targetBucketKey = normalizeToolbarConfiguratorProfileName(bucketKey);
  const normalizedItemId = typeof payload?.itemId === 'string' ? payload.itemId.trim() : '';
  if (!normalizedItemId) return false;

  const catalogItem = getToolbarConfiguratorCatalogItem(normalizedItemId);
  if (!catalogItem || catalogItem.implementationState !== 'live') return false;

  const dropIntent = getToolbarConfiguratorBucketDropIntent(payload, targetBucketKey);
  if (!dropIntent) return false;

  const currentIds = getToolbarConfiguratorProfileIds(targetBucketKey);
  const nextIds = [...currentIds];
  const clampedIndex = Math.min(Math.max(Number.isFinite(insertionIndex) ? insertionIndex : nextIds.length, 0), nextIds.length);

  if (payload?.sourceType === 'bucket-item') {
    if (dropIntent === 'return-to-master') {
      const nextState = resolveToolbarConfiguratorInterBucketTransfer(
        configuratorBucketState,
        payload,
        targetBucketKey,
        clampedIndex,
      );
      if (!nextState) return false;
      commitToolbarConfiguratorState(nextState);
      return true;
    }

    if (dropIntent === 'copy-from-master') {
      const nextState = resolveToolbarConfiguratorInterBucketTransfer(
        configuratorBucketState,
        payload,
        targetBucketKey,
        clampedIndex,
      );
      if (!nextState) return false;
      commitToolbarConfiguratorState(nextState);
      return true;
    } else {
      if (hoveredItem instanceof HTMLElement && hoveredItem.dataset.itemId === normalizedItemId) return false;
      const reorderedIds = moveToolbarConfiguratorItemWithinBucket(nextIds, normalizedItemId, clampedIndex);
      if (!reorderedIds) return false;
      commitToolbarConfiguratorState({
        ...configuratorBucketState,
        toolbarProfiles: {
          ...configuratorBucketState.toolbarProfiles,
          [targetBucketKey]: reorderedIds,
        },
      });
      return true;
    }
  } else {
    if (nextIds.includes(normalizedItemId)) return false;
    nextIds.splice(clampedIndex, 0, normalizedItemId);
  }

  if (nextIds.join('\u0000') === currentIds.join('\u0000')) {
    return false;
  }

  commitToolbarConfiguratorState({
    ...configuratorBucketState,
    toolbarProfiles: {
      ...configuratorBucketState.toolbarProfiles,
      [targetBucketKey]: nextIds,
    },
  });
  return true;
}

function renderToolbarConfiguratorProfileSwitch() {
  const activeProfile = getToolbarConfiguratorActiveProfile();
  configuratorProfileSwitchButtons.forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    const profileName = normalizeToolbarConfiguratorProfileName(button.dataset.toolbarProfileSwitch || '');
    const isActive = profileName === activeProfile;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
  });
}

function commitToolbarConfiguratorState(nextState) {
  const normalizedState = createToolbarConfiguratorState(nextState);
  configuratorBucketState = normalizedState;
  reconcileToolbarConfiguratorBucketItemSelection();
  if (normalizeProjectId(currentProjectId)) {
    writeToolbarConfiguratorStoredState(currentProjectId, normalizedState);
  }
  renderToolbarConfiguratorLibrary();
  renderToolbarConfiguratorProfileSwitch();
  renderToolbarConfiguratorBuckets();
  projectMainFloatingToolbarRuntime('configurator-commit');
  return normalizedState;
}

function adoptToolbarConfiguratorState(projectId = currentProjectId) {
  const resolution = resolveToolbarConfiguratorState(projectId);
  if (resolution.shouldConsumeLegacySource) {
    consumeLegacyConfiguratorBuckets(localStorage);
  }
  if (resolution.shouldPersist) {
    writeToolbarConfiguratorStoredState(projectId, resolution.state);
  }
  configuratorBucketState = resolution.state;
  reconcileToolbarConfiguratorBucketItemSelection();
  renderToolbarConfiguratorLibrary();
  renderToolbarConfiguratorProfileSwitch();
  renderToolbarConfiguratorBuckets();
  projectMainFloatingToolbarRuntime('configurator-adopt');
  return resolution;
}

function createToolbarConfiguratorLibraryButton(entry) {
  const isPlaceholder = entry?.kind === 'placeholder';
  const catalogEntry = isPlaceholder ? null : entry?.entry || entry || null;
  const isLiveEntry = !isPlaceholder && catalogEntry?.implementationState === 'live';
  const isSelected = isLiveEntry && getToolbarConfiguratorProfileIds(getToolbarConfiguratorActiveProfile()).includes(catalogEntry.id);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `configurator-panel__slot${isPlaceholder ? ' configurator-panel__slot--placeholder' : ''}`;
  button.draggable = isLiveEntry;
  button.disabled = !isLiveEntry;
  if (isLiveEntry) {
    button.dataset.itemId = catalogEntry.id;
  } else {
    button.dataset.slotPlaceholder = 'true';
  }
  button.dataset.implementationState = catalogEntry?.implementationState || '';
  button.setAttribute('aria-label', isPlaceholder ? TOOLBAR_CONFIGURATOR_LIBRARY_PLACEHOLDER_TEXT : getToolbarConfiguratorEntryAriaLabel(catalogEntry));
  button.setAttribute('aria-disabled', isLiveEntry ? 'false' : 'true');
  if (isSelected) {
    button.classList.add('is-selected');
    button.setAttribute('aria-pressed', 'true');
  }

  const icon = document.createElement('span');
  icon.className = 'configurator-panel__slot-icon';
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'configurator-panel__slot-text';
  text.textContent = isPlaceholder
    ? (entry?.label || TOOLBAR_CONFIGURATOR_LIBRARY_PLACEHOLDER_TEXT)
    : getToolbarConfiguratorEntryPanelLabel(catalogEntry);

  button.append(icon, text);
  return button;
}

function renderToolbarConfiguratorLibrary() {
  if (!configuratorLibraryGrid) return;
  configuratorLibraryGrid.replaceChildren();

  getToolbarConfiguratorLibraryColumns().forEach((groupItems) => {
    const column = document.createElement('div');
    column.className = 'configurator-panel__column';

    groupItems.forEach((entry) => {
      column.appendChild(createToolbarConfiguratorLibraryButton(entry));
    });
    configuratorLibraryGrid.appendChild(column);
  });
}

function createToolbarConfiguratorBucketItem(itemId, bucketKey, index) {
  const entry = getToolbarConfiguratorCatalogItem(itemId);
  const label = getToolbarConfiguratorEntryPanelLabel(entry) || itemId;
  const isActiveItem = isToolbarConfiguratorBucketItemSelected(bucketKey, itemId);

  const item = document.createElement('div');
  item.className = `configurator-panel__bucket-item${isActiveItem ? ' is-active' : ''}`;
  item.draggable = true;
  item.dataset.bucketKey = bucketKey;
  item.dataset.bucketIndex = String(index);
  item.dataset.itemId = itemId;
  item.setAttribute('role', 'listitem');
  item.setAttribute('aria-label', label);
  item.tabIndex = 0;

  const icon = document.createElement('span');
  icon.className = 'configurator-panel__slot-icon';
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'configurator-panel__slot-text';
  text.textContent = label;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'configurator-panel__bucket-remove';
  removeButton.dataset.configuratorRemove = 'true';
  removeButton.dataset.itemId = itemId;
  removeButton.dataset.bucketKey = bucketKey;
  removeButton.setAttribute('aria-label', `Remove ${label}`);
  removeButton.textContent = '×';

  item.append(icon, text, removeButton);
  return item;
}

function syncToolbarConfiguratorSectionVisibility() {
  if (configuratorMasterSection instanceof HTMLElement) {
    configuratorMasterSection.hidden = getToolbarConfiguratorActiveProfile() !== 'master';
  }
  if (configuratorMinimalSection instanceof HTMLElement) {
    configuratorMinimalSection.hidden = getToolbarConfiguratorActiveProfile() === 'master';
  }
}

function renderToolbarConfiguratorBuckets() {
  syncToolbarConfiguratorSectionVisibility();
  configuratorBuckets.forEach((bucket) => {
    const bucketKey = bucket.dataset.configuratorBucket || '';
    bucket.replaceChildren();
    bucket.hidden = false;
    if (!TOOLBAR_CONFIGURATOR_PROFILE_NAMES.includes(bucketKey)) {
      return;
    }
    getToolbarConfiguratorProfileIds(bucketKey).forEach((itemId, index) => {
      bucket.appendChild(createToolbarConfiguratorBucketItem(itemId, bucketKey, index));
    });
  });
}

function addToolbarConfiguratorItem(itemId, bucketKey = getToolbarConfiguratorActiveProfile()) {
  const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedItemId) return;
  const catalogItem = getToolbarConfiguratorCatalogItem(normalizedItemId);
  if (!catalogItem || catalogItem.implementationState !== 'live') return;
  const targetBucketKey = normalizeToolbarConfiguratorProfileName(bucketKey);
  const targetIds = getToolbarConfiguratorProfileIds(targetBucketKey);
  if (targetIds.includes(normalizedItemId)) return;
  commitToolbarConfiguratorState({
    ...configuratorBucketState,
    toolbarProfiles: {
      ...configuratorBucketState.toolbarProfiles,
      [targetBucketKey]: [...targetIds, normalizedItemId],
    },
  });
}

function removeToolbarConfiguratorItem(itemId, bucketKey = getToolbarConfiguratorActiveProfile()) {
  const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  if (!normalizedItemId) return;
  const targetBucketKey = normalizeToolbarConfiguratorProfileName(bucketKey);
  const targetIds = getToolbarConfiguratorProfileIds(targetBucketKey);
  const nextIds = targetIds.filter((currentItemId) => currentItemId !== normalizedItemId);
  if (nextIds.length === targetIds.length) return;
  commitToolbarConfiguratorState({
    ...configuratorBucketState,
    toolbarProfiles: {
      ...configuratorBucketState.toolbarProfiles,
      [targetBucketKey]: nextIds,
    },
  });
}

function setToolbarConfiguratorActiveProfile(profileName) {
  const nextProfile = normalizeToolbarConfiguratorProfileName(profileName);
  if (nextProfile === getToolbarConfiguratorActiveProfile()) {
    return false;
  }
  clearToolbarConfiguratorBucketItemSelection(false);
  commitToolbarConfiguratorState({
    ...configuratorBucketState,
    activeToolbarProfile: nextProfile,
  });
  return true;
}

function initializeToolbarConfiguratorFoundation() {
  if (!configuratorPanel || !configuratorLibraryGrid || !configuratorBuckets.length) {
    return;
  }

  adoptToolbarConfiguratorState(currentProjectId);

  configuratorPanel.addEventListener('click', (event) => {
    if (event.target === configuratorPanel) {
      setConfiguratorOpen(false);
      return;
    }

    const profileSwitchButton = event.target instanceof Element
      ? event.target.closest('[data-toolbar-profile-switch]')
      : null;
    if (profileSwitchButton instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();
      setToolbarConfiguratorActiveProfile(profileSwitchButton.dataset.toolbarProfileSwitch || '');
      return;
    }

    const removeButton = event.target instanceof Element
      ? event.target.closest('[data-configurator-remove]')
      : null;
    if (removeButton instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();
      const bucketKey = removeButton.dataset.bucketKey
        || removeButton.closest('[data-configurator-bucket]')?.dataset.configuratorBucket
        || getToolbarConfiguratorActiveProfile();
      removeToolbarConfiguratorItem(removeButton.dataset.itemId || '', bucketKey);
      return;
    }

    const bucketItem = event.target instanceof Element
      ? event.target.closest('.configurator-panel__bucket-item[data-item-id]')
      : null;
    if (
      bucketItem instanceof HTMLElement
      && configuratorBuckets.some((bucket) => bucket.contains(bucketItem))
    ) {
      event.preventDefault();
      event.stopPropagation();
      setToolbarConfiguratorBucketItemSelection(
        bucketItem.dataset.bucketKey || '',
        bucketItem.dataset.itemId || '',
      );
      return;
    }

    const libraryButton = event.target instanceof Element
      ? event.target.closest('.configurator-panel__slot[data-item-id]')
      : null;
    if (libraryButton instanceof HTMLElement && configuratorLibraryGrid.contains(libraryButton)) {
      event.preventDefault();
      event.stopPropagation();
      addToolbarConfiguratorItem(libraryButton.dataset.itemId || '', getToolbarConfiguratorActiveProfile());
    }
  });

  configuratorPanel.addEventListener('focusin', (event) => {
    const bucketItem = event.target instanceof Element
      ? event.target.closest('.configurator-panel__bucket-item[data-item-id]')
      : null;
    if (
      bucketItem instanceof HTMLElement
      && configuratorBuckets.some((bucket) => bucket.contains(bucketItem))
    ) {
      setToolbarConfiguratorBucketItemSelection(
        bucketItem.dataset.bucketKey || '',
        bucketItem.dataset.itemId || '',
      );
    }
  });

  configuratorPanel.addEventListener('dragstart', (event) => {
    const sourceElement = event.target instanceof Element
      ? event.target.closest('.configurator-panel__slot[data-item-id], .configurator-panel__bucket-item[data-item-id]')
      : null;
    if (!(sourceElement instanceof HTMLElement)) {
      return;
    }
    const isLibraryButton = configuratorLibraryGrid.contains(sourceElement);
    const isBucketItem = !isLibraryButton && sourceElement.matches('.configurator-panel__bucket-item[data-item-id]');
    if (!isLibraryButton && !isBucketItem) {
      return;
    }
    const sourceBucketKey = isBucketItem
      ? normalizeToolbarConfiguratorProfileName(
        sourceElement.dataset.bucketKey || sourceElement.closest('[data-configurator-bucket]')?.dataset.configuratorBucket || ''
      )
      : '';
    const itemId = sourceElement.dataset.itemId || '';
    if (!itemId || !event.dataTransfer) return;
    activeConfiguratorDragPayload = {
      sourceType: isBucketItem ? 'bucket-item' : 'library-item',
      itemId,
      bucketKey: isBucketItem
        ? sourceBucketKey
        : undefined,
      sourceIndex: isBucketItem ? sourceElement.dataset.bucketIndex || '' : undefined,
    };
    activeConfiguratorDragElement = sourceElement;
    writeConfiguratorDragPayload(event, activeConfiguratorDragPayload);
    sourceElement.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = isBucketItem ? 'move' : 'copy';
  });

  configuratorPanel.addEventListener('dragend', () => {
    clearToolbarConfiguratorDragSource();
    activeConfiguratorDragPayload = null;
    clearToolbarConfiguratorDropTargets();
  });

  configuratorBuckets.forEach((bucket) => {
    const bucketKey = bucket.dataset.configuratorBucket || '';
    bucket.addEventListener('dragover', (event) => {
      const payload = readConfiguratorDragPayload(event);
      const dropIntent = getToolbarConfiguratorBucketDropIntent(payload, bucketKey);
      if (!payload || !payload.sourceType || !payload.itemId || !dropIntent) return;
      const hoveredItem = event.target instanceof Element
        ? event.target.closest('.configurator-panel__bucket-item[data-item-id]')
        : null;
      const insertionIndex = dropIntent === 'return-to-master'
        ? getToolbarConfiguratorProfileIds('master').length
        : getToolbarConfiguratorBucketInsertionIndex(bucket, event, hoveredItem);
      const marker = dropIntent === 'return-to-master'
        ? 'inside'
        : hoveredItem instanceof HTMLElement && bucket.contains(hoveredItem)
          ? (event.clientX < hoveredItem.getBoundingClientRect().left + hoveredItem.getBoundingClientRect().width / 2 ? 'before' : 'after')
          : 'inside';
      setToolbarConfiguratorDropTarget(bucket, marker, hoveredItem instanceof HTMLElement && bucket.contains(hoveredItem) ? hoveredItem : null);
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = payload.sourceType === 'bucket-item' ? 'move' : 'copy';
      }
      bucket.dataset.dropIndex = String(insertionIndex);
      bucket.dataset.dropIntent = dropIntent;
    });
    bucket.addEventListener('dragleave', () => {
      clearToolbarConfiguratorDropTargets();
    });
    bucket.addEventListener('drop', (event) => {
      const payload = readConfiguratorDragPayload(event);
      const dropIntent = getToolbarConfiguratorBucketDropIntent(payload, bucketKey);
      const hoveredItem = event.target instanceof Element
        ? event.target.closest('.configurator-panel__bucket-item[data-item-id]')
        : null;
      const insertionIndex = dropIntent === 'return-to-master'
        ? getToolbarConfiguratorProfileIds('master').length
        : getToolbarConfiguratorBucketInsertionIndex(bucket, event, hoveredItem);
      event.preventDefault();
      clearToolbarConfiguratorDropTargets();
      delete bucket.dataset.dropIndex;
      delete bucket.dataset.dropIntent;
      if (!payload || !payload.sourceType || !payload.itemId || !dropIntent) {
        activeConfiguratorDragPayload = null;
        return;
      }
      commitToolbarConfiguratorBucketDrop(payload, bucketKey, insertionIndex, hoveredItem instanceof HTMLElement ? hoveredItem : null);
      activeConfiguratorDragPayload = null;
    });
  });
}

function updateTransformingClass() {
  if (!toolbarShell) return;
  toolbarShell.classList.toggle('is-transforming', Boolean(floatingToolbarInteractionState.mode));
}

function setFloatingToolbarHandlesVisible(nextVisible) {
  if (!toolbarShell) return;
  floatingToolbarHandlesVisible = Boolean(nextVisible);
  toolbarShell.classList.toggle('is-handles-visible', floatingToolbarHandlesVisible);
}

function startFloatingToolbarInteraction(mode, event) {
  if (!toolbarShell) return;
  if (mode === 'move' && !canStartFloatingToolbarDrag(event.target)) {
    return;
  }
  event.preventDefault();
  const origin = { ...floatingToolbarState };
  floatingToolbarInteractionState = {
    mode,
    active: false,
    startX: event.clientX,
    startY: event.clientY,
    origin,
  };
  updateTransformingClass();
}

function flushPendingFloatingToolbarScaleState() {
  if (floatingToolbarScaleFrameId) {
    cancelAnimationFrame(floatingToolbarScaleFrameId);
    floatingToolbarScaleFrameId = 0;
  }
  const pendingState = pendingFloatingToolbarScaleState;
  pendingFloatingToolbarScaleState = null;
  if (pendingState) {
    applyFloatingToolbarState(pendingState, false);
  }
}

function scheduleFloatingToolbarScaleState(nextState) {
  pendingFloatingToolbarScaleState = nextState;
  if (floatingToolbarScaleFrameId) return;
  floatingToolbarScaleFrameId = requestAnimationFrame(() => {
    floatingToolbarScaleFrameId = 0;
    const pendingState = pendingFloatingToolbarScaleState;
    pendingFloatingToolbarScaleState = null;
    if (pendingState) {
      applyFloatingToolbarState(pendingState, false);
    }
  });
}

function stopFloatingToolbarInteraction() {
  if (!toolbarShell) return;
  if (floatingToolbarInteractionState.mode === 'scale') {
    flushPendingFloatingToolbarScaleState();
  }
  if (floatingToolbarInteractionState.mode) {
    persistFloatingToolbarState();
  }
  floatingToolbarInteractionState = {
    mode: null,
    active: false,
    startX: 0,
    startY: 0,
    origin: null,
  };
  toolbarShell.classList.remove('is-dragging');
  updateTransformingClass();
}

function initializeFloatingToolbarItemOffsetTuning() {
  if (!toolbarTunableItems.length) return;
  restoreFloatingToolbarItemOffsets();
  toolbarTunableItems.forEach((item) => {
    item.addEventListener('mousedown', (event) => {
      const tuningIntent = toolbarSpacingTuningMode || event.altKey;
      if (event.button !== 0 || !tuningIntent) return;
      const key = getFloatingToolbarItemOffsetKey(item);
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      toolbarItemOffsetDragState = {
        active: true,
        item,
        key,
        startX: event.clientX,
        originOffset: Number(toolbarItemOffsets[key] || 0),
        moved: false,
      };
    });
    item.addEventListener('dblclick', (event) => {
      if (!toolbarSpacingTuningMode && !event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      setFloatingToolbarItemOffset(item, 0);
      floatingToolbarSuppressClickOnce = true;
    });
    item.addEventListener('click', (event) => {
      if (!toolbarItemSuppressClickOnce && !event.altKey && !toolbarSpacingTuningMode) return;
      event.preventDefault();
      event.stopPropagation();
      toolbarItemSuppressClickOnce = false;
    });
  });

  document.addEventListener('mousemove', (event) => {
    if (!toolbarItemOffsetDragState.active || !toolbarItemOffsetDragState.item) return;
    const deltaX = event.clientX - toolbarItemOffsetDragState.startX;
    if (!toolbarItemOffsetDragState.moved && Math.abs(deltaX) >= 1) {
      toolbarItemOffsetDragState.moved = true;
      floatingToolbarSuppressClickOnce = true;
      toolbarItemSuppressClickOnce = true;
    }
    setFloatingToolbarItemOffset(
      toolbarItemOffsetDragState.item,
      toolbarItemOffsetDragState.originOffset + (deltaX / getFloatingToolbarContentMetricScale(
        floatingToolbarState.scale,
        floatingToolbarState.isVertical
      )),
      false
    );
    event.preventDefault();
  });

  document.addEventListener('mouseup', () => {
    stopFloatingToolbarItemOffsetDrag();
  });
}

function initializeFloatingToolbarSpacingMenu() {
  if (!toolbarShell || !toolbarSpacingMenu || !toolbarSpacingAction) return;
  setToolbarSpacingTuningMode(false);
  toolbarShell.addEventListener('contextmenu', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-toolbar-rotate-handle], [data-toolbar-width-handle], [data-toolbar-scale-handle]')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setToolbarSpacingMenuOpen(true);
    toolbarSpacingAction.focus();
  });
  toolbarSpacingAction.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setToolbarSpacingTuningMode(!toolbarSpacingTuningMode);
    setToolbarSpacingMenuOpen(false);
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!toolbarSpacingMenu.contains(target)) {
      setToolbarSpacingMenuOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setToolbarSpacingMenuOpen(false);
      if (toolbarSpacingTuningMode) {
        setToolbarSpacingTuningMode(false);
      }
    }
  });
}

function initializeFloatingToolbarParagraphMenu() {
  if (!toolbarShell || !paragraphMenu || !paragraphTriggerButton) return;
  paragraphMenu.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-paragraph-alignment]') : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const action = target.dataset.paragraphAlignment;
    if (action) {
      handleUiAction(action);
    }
    setParagraphMenuOpen(false);
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!paragraphMenu.contains(target) && target !== paragraphTriggerButton && !paragraphTriggerButton.contains(target)) {
      setParagraphMenuOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setParagraphMenuOpen(false);
    }
  });
}

function initializeFloatingToolbarListMenu() {
  if (!toolbarShell || !listMenu || !listTriggerButton) return;
  listMenu.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-list-action]') : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const action = target.dataset.listAction || '';
    void dispatchListTypeAction(action).then(() => {
      syncToolbarFormattingState();
    });
    setListMenuOpen(false);
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!listMenu.contains(target) && target !== listTriggerButton && !listTriggerButton.contains(target)) {
      setListMenuOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setListMenuOpen(false);
    }
  });
}

function initializeFloatingToolbarColorPickerOverlay() {
  if (!toolbarShell || !toolbarColorPickerOverlay) return;

  toolbarColorPickerOverlay.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-toolbar-color-swatch-value], [data-toolbar-color-picker-close]') : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (target.hasAttribute('data-toolbar-color-picker-close')) {
      setToolbarColorPickerOpen(false);
      return;
    }
    const swatchValue = target.dataset.toolbarColorSwatchValue || '';
    setToolbarColorPickerSelection(swatchValue);
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (toolbarColorPickerOverlay.hidden) return;
    if (toolbarColorPickerOverlay.contains(target)) return;
    if (target.closest('[data-toolbar-item-key="color-text"], [data-toolbar-item-key="color-highlight"]')) return;
    setToolbarColorPickerOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !toolbarColorPickerOverlay.hidden) {
      event.preventDefault();
      setToolbarColorPickerOpen(false);
    }
  });
}

function initializeFloatingToolbarStylesMenu() {
  if (!toolbarShell || !toolbarStylesMenu) return;

  toolbarStylesMenu.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-style-paragraph-option], [data-style-character-option]')
      : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const optionId = target.getAttribute('data-style-paragraph-option')
      || target.getAttribute('data-style-character-option')
      || '';
    if (!optionId) return;
    applyTextStyle(optionId);
    setToolbarStylesMenuOpen(false);
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (toolbarStylesMenu.hidden) return;
    if (toolbarStylesMenu.contains(target)) return;
    if (target.closest('[data-toolbar-item-key="style-paragraph"], [data-toolbar-item-key="style-character"]')) return;
    setToolbarStylesMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !toolbarStylesMenu.hidden) {
      event.preventDefault();
      setToolbarStylesMenuOpen(false);
    }
  });
}

function isMainToolbarInteractiveTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
        '.floating-toolbar__button',
        '.floating-toolbar__select-wrap',
        '.floating-toolbar__display',
        '.floating-toolbar__paragraph-menu-item',
        '.floating-toolbar__list-menu-item',
        '.floating-toolbar__styles-menu-item',
        '.floating-toolbar__color-picker-close',
        '[data-toolbar-color-swatch-value]',
        '.floating-toolbar-spacing-menu__action',
        '.floating-toolbar__select',
      ].join(', ')
    )
  );
}

function isMainToolbarSelectionPreservingTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
        '.floating-toolbar__button',
        '.floating-toolbar__paragraph-menu-item',
        '.floating-toolbar__list-menu-item',
        '.floating-toolbar__styles-menu-item',
        '.floating-toolbar__color-picker-close',
        '[data-toolbar-color-swatch-value]',
        '.floating-toolbar-spacing-menu__action',
      ].join(', ')
    )
  );
}

function initializeFloatingToolbarDragFoundation() {
  if (!toolbarShell) return;
  const preserveSelectionOnMouseDown = (event) => {
    if (event.button !== 0) return;
    if (!isMainToolbarSelectionPreservingTarget(event.target)) return;
    event.preventDefault();
  };
  [
    toolbarShell,
    paragraphMenu,
    listMenu,
    toolbarStylesMenu,
    toolbarColorPickerOverlay,
    toolbarSpacingMenu,
  ].forEach((surface) => {
    surface?.addEventListener('mousedown', preserveSelectionOnMouseDown, true);
  });
  toolbarShell.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (isMainToolbarInteractiveTarget(event.target)) return;
    startFloatingToolbarInteraction('move', event);
  });
  toolbarRotateHandles.forEach((handle) => {
    handle.addEventListener('mousedown', (event) => {
      event.stopPropagation();
    });
    handle.addEventListener('click', (event) => {
      event.stopPropagation();
      applyFloatingToolbarState({
        ...floatingToolbarState,
        isVertical: !floatingToolbarState.isVertical,
      });
    });
  });
  toolbarWidthHandle?.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    startFloatingToolbarInteraction('width', event);
  });
  toolbarScaleHandle?.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    startFloatingToolbarInteraction('scale', event);
  });
  document.addEventListener('mousemove', (event) => {
    const { mode, origin } = floatingToolbarInteractionState;
    if (!mode || !origin) return;
    const deltaX = event.clientX - floatingToolbarInteractionState.startX;
    const deltaY = event.clientY - floatingToolbarInteractionState.startY;
    if (mode === 'move') {
      if (!floatingToolbarInteractionState.active) {
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < FLOATING_TOOLBAR_DRAG_THRESHOLD_PX) {
          return;
        }
        floatingToolbarInteractionState.active = true;
        floatingToolbarSuppressClickOnce = true;
        toolbarShell.classList.add('is-dragging');
      }
      const topBarRect = topWorkBar?.getBoundingClientRect();
      const pointerNearSnapZone = Boolean(
        topBarRect &&
        event.clientY >= topBarRect.top - FLOATING_TOOLBAR_SNAP_ZONE_PX &&
        event.clientY <= topBarRect.bottom + FLOATING_TOOLBAR_SNAP_ZONE_PX
      );
      if (pointerNearSnapZone) {
        const shellRect = toolbarShell.getBoundingClientRect();
        const snapped = getSnappedFloatingToolbarPosition(shellRect);
        applyFloatingToolbarState({
          ...origin,
          x: getSnappedFloatingToolbarX(origin.x + deltaX, shellRect),
          y: snapped.y,
          isDetached: false,
          toolbarHeight: topBarRect?.height || origin.toolbarHeight || 0,
        }, false);
      } else {
        applyFloatingToolbarState({
          ...origin,
          x: origin.x + deltaX,
          y: origin.y + deltaY,
          isDetached: true,
          toolbarHeight: topBarRect?.height || origin.toolbarHeight || 0,
        }, false);
      }
    } else if (mode === 'width') {
      floatingToolbarInteractionState.active = true;
      const widthDelta = (origin.isVertical ? deltaX : deltaX) * 0.01;
      const nextWidthScale = origin.widthScale + widthDelta;
      applyFloatingToolbarState({
        ...origin,
        widthScale: nextWidthScale,
        dockedWidthScale: origin.isDetached ? origin.dockedWidthScale : nextWidthScale,
        freeWidthScale: origin.isDetached ? nextWidthScale : origin.freeWidthScale,
      }, false);
    } else if (mode === 'scale') {
      floatingToolbarInteractionState.active = true;
      const scaleDelta = (origin.isVertical ? deltaY : deltaX) * 0.01;
      scheduleFloatingToolbarScaleState({
        ...origin,
        scale: origin.scale + scaleDelta,
      });
    }
    event.preventDefault();
  });

  document.addEventListener('mouseup', () => {
    if (!floatingToolbarInteractionState.mode) return;
    stopFloatingToolbarInteraction();
  });

  toolbarShell.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (floatingToolbarSuppressClickOnce) {
      floatingToolbarSuppressClickOnce = false;
      return;
    }
    if (target.closest('button, select, option, input, textarea, label, [data-toolbar-rotate-handle], [data-toolbar-width-handle], [data-toolbar-scale-handle]')) {
      return;
    }
    setFloatingToolbarHandlesVisible(!floatingToolbarHandlesVisible);
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!toolbarShell.contains(target)) {
      setFloatingToolbarHandlesVisible(false);
    }
  });

  window.addEventListener('resize', () => {
    restoreFloatingToolbarPosition();
    scheduleToolbarAnchorUpdate();
  });

  requestAnimationFrame(() => {
    restoreFloatingToolbarPosition();
    scheduleToolbarAnchorUpdate();
  });
}

const commandRegistry = createCommandRegistry();
const runCommand = createCommandRunner(commandRegistry, {
  capability: {
    defaultPlatformId: window.electronAPI ? 'node' : 'web',
    defaultEntitlementTier: 'free',
  },
});
registerProjectCommands(commandRegistry, {
  domainEventPort: createCoreDomainEventProductPort(),
  electronAPI: window.electronAPI,
  uiActions: {
    openSettings: () => openSettingsModal(),
    safeResetShell: () => performSafeResetShell(),
    restoreLastStableShell: () => performRestoreLastStableShell(),
    openDiagnostics: () => openDiagnosticsModal(),
    openRecovery: () => openRecoveryModal('Recovery modal opened from menu'),
    switchMode: (mode) => applyMode(mode),
    undo: () => handleUndo(),
    redo: () => handleRedo(),
    find: () => handleFind(),
    replace: () => handleReplace(),
    zoomOut: () => handleZoomOut(),
    zoomIn: () => handleZoomIn(),
    toggleWrap: () => handleToggleWrap(),
    setPreviewFormat: ({ formatId } = {}) => setActiveBookProfileFormat(formatId),
    setPreviewOrientation: ({ orientation } = {}) => setActiveBookProfileOrientation(orientation),
    togglePreview: () => handleToggleLayoutPreview(),
    togglePreviewFrame: () => handleToggleLayoutPreviewFrame(),
    insertMarkdownPrompt: () => handleInsertMarkdownPrompt(),
    insertFlowOpen: () => handleInsertFlowOpen(),
    insertAddCard: () => handleInsertAddCard(),
    formatToggleBold: () => handleTiptapFormatCommand('toggleBold'),
    formatToggleItalic: () => handleTiptapFormatCommand('toggleItalic'),
    formatToggleUnderline: () => handleTiptapFormatCommand('toggleUnderline'),
    formatTextColorPicker: () => handleFormatTextColorPicker(),
    formatHighlightColorPicker: () => handleFormatHighlightColorPicker(),
    formatAlignLeft: () => handleFormatAlign('align-left'),
    formatAlignCenter: () => handleFormatAlign('align-center'),
    formatAlignRight: () => handleFormatAlign('align-right'),
    formatAlignJustify: () => handleFormatAlign('align-justify'),
    listToggleBullet: () => handleTiptapFormatCommand('toggleBulletList'),
    listToggleOrdered: () => handleTiptapFormatCommand('toggleOrderedList'),
    listClear: () => handleTiptapFormatCommand('clearList'),
    insertLinkPrompt: (payload = {}) => handleInsertLinkPrompt(payload),
    reviewImportLocalPacket: () => handleReviewImportLocalPacket(),
    reviewOpenComments: () => handleReviewOpenComments(),
    reviewClearSession: () => handleReviewClearSession(),
    reviewCancelOperation: (payload = {}) => handleReviewCancelOperation(payload),
    planFlowSave: () => handlePlanFlowSave(),
    reviewExportMarkdown: () => handleReviewExportMarkdown(),
    openSelectedScenesTxtExport: () => openSelectedScenesTxtExportFlow(),
    setTheme: (payload) => handleUiSetThemeCommand(payload),
    setFont: (payload) => handleUiSetFontCommand(payload),
    setFontSize: (payload) => handleUiSetFontSizeCommand(payload),
  },
});
const PREVIEW_FORMAT_COMMAND_IDS = Object.freeze({
  A4: EXTRA_COMMAND_IDS.VIEW_PREVIEW_FORMAT_A4,
  A5: EXTRA_COMMAND_IDS.VIEW_PREVIEW_FORMAT_A5,
  LETTER: EXTRA_COMMAND_IDS.VIEW_PREVIEW_FORMAT_LETTER,
});
const PREVIEW_ORIENTATION_COMMAND_IDS = Object.freeze({
  PORTRAIT: EXTRA_COMMAND_IDS.VIEW_PREVIEW_ORIENTATION_PORTRAIT,
  LANDSCAPE: EXTRA_COMMAND_IDS.VIEW_PREVIEW_ORIENTATION_LANDSCAPE,
});
const commandPaletteDataProvider = createPaletteDataProvider(commandRegistry, {
  defaultSurface: 'palette',
  entitlementTier: 'free',
});
window.__COMMAND_PALETTE_DATA_PROVIDER_V1__ = commandPaletteDataProvider;
const MARKDOWN_IMPORT_STATUS_MESSAGE = 'Imported Markdown v1';
const MARKDOWN_EXPORT_STATUS_MESSAGE = 'Exported Markdown v1';
const MARKDOWN_EXPORT_CANCELLED_STATUS_MESSAGE = 'Export Markdown cancelled';
const MARKDOWN_EXPORT_SAVE_FAILED_STATUS_MESSAGE = 'Export Markdown save failed';
const MARKDOWN_IMPORT_LOCAL_FILE_PREVIEW_COMMAND_ID = 'cmd.project.markdown.previewLocalFile';
const MARKDOWN_IMPORT_LOCAL_FILE_ACCEPT_COMMAND_ID = 'cmd.project.markdown.acceptLocalPreview';
const MARKDOWN_EXPORT_LOCAL_FILE_COMMAND_ID = 'cmd.project.markdown.exportLocalFile';
const BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID = 'cmd.project.blackBox.exportManualCoreCapsuleKitV1';
const BLACK_BOX_EXPORT_MANUAL_CORE_FORMAT = 'black-box-manual-core';
const SELECTED_SCENES_TXT_EXPORT_SCOPE_QUERY_ID = WORKSPACE_QUERY_IDS.SELECTED_SCENES_TXT_EXPORT_SCOPE;
const LINK_PROMPT_TITLE = 'Insert link';
const FLOW_OPEN_ERROR_MESSAGE = 'Flow mode unavailable';
const FLOW_SAVE_ERROR_MESSAGE = 'Flow mode save failed';

function sanitizeUiErrorMap(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { defaultUserMessage: UI_ERROR_FALLBACK_MESSAGE, index: new Map() };
  }
  const schemaVersion = typeof input.schemaVersion === 'string' ? input.schemaVersion : '';
  const defaultUserMessage = typeof input.defaultUserMessage === 'string' && input.defaultUserMessage.length > 0
    ? input.defaultUserMessage
    : UI_ERROR_FALLBACK_MESSAGE;
  if (schemaVersion !== UI_ERROR_MAP_SCHEMA_VERSION || !Array.isArray(input.map)) {
    return { defaultUserMessage, index: new Map() };
  }
  const index = new Map();
  for (const rule of input.map) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) continue;
    if (typeof rule.code !== 'string' || rule.code.length === 0) continue;
    if (typeof rule.userMessage !== 'string' || rule.userMessage.length === 0) continue;
    if (rule.severity !== 'ERROR' && rule.severity !== 'WARN') continue;
    if (index.has(rule.code)) continue;
    index.set(rule.code, { userMessage: rule.userMessage, severity: rule.severity });
  }
  return { defaultUserMessage, index };
}

const uiErrorMap = sanitizeUiErrorMap(uiErrorMapDoc);

function mapCommandErrorToUi(error) {
  const source = error && typeof error === 'object' && !Array.isArray(error)
    ? error
    : {};
  const code = typeof source.code === 'string' && source.code.length > 0
    ? source.code
    : 'E_COMMAND_FAILED';
  const op = typeof source.op === 'string' && source.op.length > 0 ? source.op : '';
  const details = source.details && typeof source.details === 'object' && !Array.isArray(source.details)
    ? source.details
    : null;
  const recoveryActions = details && Array.isArray(details.recoveryActions)
    ? details.recoveryActions.filter((item) => typeof item === 'string' && item.length > 0).slice(0, 3)
    : [];
  const detailsUserMessage = details && typeof details.userMessage === 'string' && details.userMessage.length > 0
    ? details.userMessage
    : '';
  const actionSuffix = recoveryActions.length > 0 ? ` [${recoveryActions.join(' / ')}]` : '';
  if (detailsUserMessage) {
    return {
      userMessage: `${detailsUserMessage}${actionSuffix}`,
      severity: code.startsWith('E_IO_') ? 'WARN' : UI_ERROR_FALLBACK_SEVERITY,
      code,
      op,
    };
  }
  const mapped = uiErrorMap.index.get(code);
  if (mapped) {
    return {
      userMessage: mapped.userMessage,
      severity: mapped.severity,
      code,
      op,
    };
  }
  return {
    userMessage: uiErrorMap.defaultUserMessage,
    severity: UI_ERROR_FALLBACK_SEVERITY,
    code,
    op,
  };
}

function withEditorModeCommandPayload(payload = {}) {
  const basePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  return {
    ...basePayload,
    editorMode: isTiptapMode ? 'tiptap' : 'legacy',
  };
}

async function dispatchUiCommand(commandId, payload = {}) {
  const result = await runCommandThroughBus(runCommand, commandId, withEditorModeCommandPayload(payload), {
    route: COMMAND_BUS_ROUTE,
  });
  if (!result.ok) {
    const mapped = mapCommandErrorToUi(result.error);
    updateStatusText(mapped.userMessage);
    if (mapped.severity === 'ERROR') {
      const opSuffix = mapped.op ? ` op=${mapped.op}` : '';
      console.error(`UI_COMMAND_ERROR code=${mapped.code}${opSuffix}`);
    }
  }
  return result;
}

async function invokePreloadUiCommandBridge(commandId, payload = {}) {
  if (!window.electronAPI || typeof window.electronAPI.invokeUiCommandBridge !== 'function') {
    return { ok: false, reason: 'UI_COMMAND_BRIDGE_UNAVAILABLE' };
  }

  return window.electronAPI.invokeUiCommandBridge({
    route: COMMAND_BUS_ROUTE,
    commandId,
    payload,
  });
}

async function invokeWorkspaceQueryBridge(queryId, payload = {}) {
  if (!WORKSPACE_QUERY_ID_SET.has(queryId)) {
    return null;
  }
  if (!window.electronAPI || typeof window.electronAPI.invokeWorkspaceQueryBridge !== 'function') {
    return null;
  }
  return window.electronAPI.invokeWorkspaceQueryBridge({ queryId, payload });
}

async function invokeSaveLifecycleSignalBridge(signalId, payload = {}) {
  if (signalId !== 'signal.localDirty.set' && signalId !== 'signal.autoSave.request') {
    return null;
  }
  if (!window.electronAPI || typeof window.electronAPI.invokeSaveLifecycleSignalBridge !== 'function') {
    return { ok: false, error: 'SAVE_LIFECYCLE_SIGNAL_BRIDGE_UNAVAILABLE' };
  }
  return window.electronAPI.invokeSaveLifecycleSignalBridge({ signalId, payload });
}

function resolveSceneFromImportResult(importResult) {
  if (!importResult || importResult.ok !== true) return null;
  const value = importResult.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const scene = value.scene;
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return null;
  return scene;
}

function normalizeMarkdownImportCreatedSceneIds(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function sanitizeMarkdownImportSceneLabelPart(value) {
  const safe = String(value || '')
    .trim()
    .replace(/[\\/<>:"|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');

  return safe.slice(0, 80) || 'Imported scene';
}

function sanitizeMarkdownImportExpectedSceneLabel(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/<>:"|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .slice(0, 96);
}

function getMarkdownImportSceneLocatorsFromPreview(previewPayload, createdSceneIds) {
  const createdIds = normalizeMarkdownImportCreatedSceneIds(createdSceneIds);
  if (createdIds.length === 0) return [];
  const createdSet = new Set(createdIds);
  const payload = previewPayload && typeof previewPayload === 'object' && !Array.isArray(previewPayload)
    ? previewPayload
    : {};
  const entries = Array.isArray(payload?.safeCreatePlan?.entries)
    ? payload.safeCreatePlan.entries
    : [];
  const sourceTitle = typeof payload.sourceName === 'string'
    ? payload.sourceName.replace(/\.md$/i, '').replace(/\s+/g, ' ').trim()
    : '';

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const sceneId = typeof entry.sceneId === 'string' ? entry.sceneId.trim() : '';
      if (!sceneId || !createdSet.has(sceneId)) return null;
      const hashFromSceneId = /^scene-([a-f0-9]{10})$/u.exec(sceneId);
      const explicitLabel = sanitizeMarkdownImportExpectedSceneLabel(entry.expectedLabel);
      if (explicitLabel) {
        return {
          sceneId,
          expectedLabel: explicitLabel,
        };
      }
      const contentTextHash = typeof entry.contentTextHash === 'string' && entry.contentTextHash.trim()
        ? entry.contentTextHash.trim()
        : (hashFromSceneId ? hashFromSceneId[1] : '');
      if (!/^[a-f0-9]{10}$/u.test(contentTextHash)) return null;
      const title = typeof entry.title === 'string' && entry.title.trim()
        ? entry.title.trim()
        : (sourceTitle || 'Imported scene');
      return {
        sceneId,
        expectedLabel: `${sanitizeMarkdownImportSceneLabelPart(title)} ${contentTextHash}`,
      };
    })
    .filter(Boolean);
}

function findMarkdownImportSceneNode(root, locators) {
  if (!root || !Array.isArray(locators) || locators.length === 0) return null;
  const matches = [];
  const seenNodeIds = new Set();

  const visit = (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const kind = getEffectiveDocumentKind(node);
    if (kind === 'scene') {
      const sceneId = typeof node.sceneId === 'string' ? node.sceneId.trim() : '';
      const label = typeof node.label === 'string'
        ? node.label.trim()
        : (typeof node.name === 'string' ? node.name.trim() : '');
      const nodeId = typeof node.nodeId === 'string'
        ? node.nodeId.trim()
        : (typeof node.id === 'string' ? node.id.trim() : '');
      const matched = locators.some((locator) => {
        if (!locator || typeof locator !== 'object' || Array.isArray(locator)) return false;
        const expectedLabel = typeof locator.expectedLabel === 'string' ? locator.expectedLabel.trim() : '';
        if (expectedLabel) return label === expectedLabel;
        return sceneId && typeof locator.sceneId === 'string' && sceneId === locator.sceneId;
      });
      if (matched && nodeId && !seenNodeIds.has(nodeId)) {
        seenNodeIds.add(nodeId);
        matches.push(node);
      }
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };

  visit(root);
  return matches.length === 1 ? matches[0] : null;
}

async function openImportedMarkdownSceneAfterSafeCreate(previewPayload, createdSceneIds) {
  const locators = getMarkdownImportSceneLocatorsFromPreview(previewPayload, createdSceneIds);
  if (locators.length === 0) {
    return { opened: false, reason: 'no-created-markdown-scene-locator' };
  }
  const node = findMarkdownImportSceneNode(treeRoot, locators);
  if (!node) {
    return { opened: false, reason: 'imported-markdown-scene-not-found' };
  }
  const opened = await openDocumentNode(node);
  if (opened) {
    renderTree();
    return { opened: true, reason: 'opened-imported-markdown-scene' };
  }
  return { opened: false, reason: 'imported-markdown-scene-open-failed' };
}

async function runMarkdownImportCommand(markdownText, sourceName, options = {}) {
  const safeOptions = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const previewPayload = safeOptions.previewPayload && typeof safeOptions.previewPayload === 'object' && !Array.isArray(safeOptions.previewPayload)
    ? safeOptions.previewPayload
    : null;
  return dispatchUiCommand(COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1, {
    text: markdownText,
    sourceName,
    preview: safeOptions.preview === true,
    safeCreate: safeOptions.safeCreate === true,
    previewPayload,
  });
}

async function runMarkdownExportCommand(scene, options = {}) {
  const safeOptions = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  return dispatchUiCommand(COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1, {
    scene,
    saveAs: safeOptions.saveAs === true,
    outPath: typeof safeOptions.outPath === 'string' ? safeOptions.outPath : '',
    defaultName: typeof safeOptions.defaultName === 'string' ? safeOptions.defaultName : '',
    snapshotLimit: Number.isInteger(safeOptions.snapshotLimit) && safeOptions.snapshotLimit >= 1
      ? safeOptions.snapshotLimit
      : 3,
    safetyMode: typeof safeOptions.safetyMode === 'string' ? safeOptions.safetyMode : 'strict',
  });
}

async function runFlowOpenCommand() {
  return dispatchUiCommand(COMMAND_IDS.PROJECT_FLOW_OPEN_V1);
}

async function runFlowSaveCommand(scenes) {
  return dispatchUiCommand(COMMAND_IDS.PROJECT_FLOW_SAVE_V1, { scenes });
}

function syncFlowViewModeButtons() {
  const activeMode = flowModeState.active ? 'continuous' : 'scene';
  document.body.dataset.flowViewMode = activeMode;
  for (const button of flowViewModeButtons) {
    const active = button.dataset.flowViewMode === activeMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function clearFlowModeState() {
  flowModeState = {
    active: false,
    scenes: [],
    projection: null,
    dirty: false,
  };
  syncFlowViewModeButtons();
}

function normalizeFlowSceneRefs(rawScenes) {
  const scenes = Array.isArray(rawScenes) ? rawScenes : [];
  return scenes
    .map((scene) => {
      if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return null;
      const path = typeof scene.path === 'string' ? scene.path : '';
      const sceneId = typeof scene.sceneId === 'string' ? scene.sceneId : '';
      const nodeId = typeof scene.nodeId === 'string' ? scene.nodeId : '';
      const baselineHash = typeof scene.baselineHash === 'string' ? scene.baselineHash : '';
      const title = typeof scene.title === 'string' ? scene.title : '';
      const kind = typeof scene.kind === 'string' ? scene.kind : 'scene';
      const content = typeof scene.content === 'string' ? scene.content : '';
      const missing = scene.missing === true;
      const partial = missing || scene.partial === true;
      if (!path && !sceneId && !nodeId) return null;
      return { path, sceneId, nodeId, baselineHash, title, kind, content, missing, partial };
    })
    .filter(Boolean);
}

async function jumpToFlowProjectionSourceAtCaret() {
  if (!flowModeState.active || !flowModeState.projection) return false;
  const selection = getSelectionOffsets();
  const source = findFlowProjectionSceneAtOffset(flowModeState.projection, selection.start);
  if (!source || !source.nodeId || source.missing) {
    updateStatusText('Непрерывно: исходная сцена недоступна');
    return false;
  }
  const node = findTreeNodeById(treeRoot, source.nodeId);
  if (!node) {
    updateStatusText('Непрерывно: исходная сцена не найдена');
    return false;
  }
  const opened = await openDocumentNode(node);
  if (!opened) {
    updateStatusText('Непрерывно: исходная сцена не открылась');
    return false;
  }
  clearFlowModeState();
  renderTree();
  updateStatusText(`Открыта исходная сцена: ${source.title || 'Без названия'}`);
  return true;
}

async function handleFlowModeOpenUiPath() {
  if (flowModeState.active && flowModeState.dirty) {
    updateStatusText(buildFlowModeReopenBlockedStatus(flowModeState.scenes.length));
    return;
  }

  const openResult = await runFlowOpenCommand();
  if (!openResult.ok) return;

  const scenes = normalizeFlowSceneRefs(openResult.value && openResult.value.scenes);
  if (!scenes.length) {
    updateStatusText(FLOW_OPEN_ERROR_MESSAGE);
    return;
  }

  const projection = composeFlowReadProjection(scenes);

  flowModeState = {
    active: true,
    scenes: scenes.map((scene) => ({
      path: scene.path,
      sceneId: scene.sceneId,
      nodeId: scene.nodeId,
      baselineHash: scene.baselineHash,
      title: scene.title,
      kind: scene.kind,
      missing: scene.missing,
      partial: scene.partial,
      content: scene.content,
    })),
    projection,
    dirty: false,
  };
  syncFlowViewModeButtons();

  setPlainText(projection.text || composeFlowDocument(scenes));
  updateWordCount();
  localDirty = false;
  await invokeSaveLifecycleSignalBridge('signal.localDirty.set', { state: false });
  showEditorPanelFor('Непрерывно');
  const partialSuffix = projection.partial ? ' · есть недоступные сцены' : '';
  updateStatusText(`${buildFlowModeM9KickoffStatus('open', scenes.length, { m8Kickoff: true, m9Kickoff: true })}${partialSuffix}`);
}

async function handleFlowModeSaveUiPath() {
  if (!flowModeState.active) {
    updateStatusText(FLOW_SAVE_ERROR_MESSAGE);
    return;
  }

  if (!flowModeState.dirty) {
    updateStatusText(buildFlowModeM9NextNoopSaveStatus(flowModeState.scenes.length));
    return;
  }

  const payload = flowModeState.projection
    ? buildFlowProjectionSavePayload(getPlainText(), flowModeState.scenes)
    : buildFlowSavePayload(getPlainText(), flowModeState.scenes);
  if (!payload.ok) {
    updateStatusText(buildFlowModeM9CoreSaveErrorStatus(payload.error, flowModeState.scenes.length));
    return;
  }

  const saveResult = await runFlowSaveCommand(payload.scenes);
  if (!saveResult.ok) return;
  const refreshedScenes = normalizeFlowSceneRefs(saveResult.value && saveResult.value.scenes);
  const nextScenes = refreshedScenes.length === flowModeState.scenes.length
    ? refreshedScenes
    : flowModeState.scenes;
  const nextProjection = refreshedScenes.length === flowModeState.scenes.length
    ? composeFlowReadProjection(refreshedScenes)
    : flowModeState.projection;

  flowModeState = {
    ...flowModeState,
    scenes: nextScenes,
    projection: nextProjection,
    dirty: false,
  };
  syncFlowViewModeButtons();
  localDirty = false;
  await invokeSaveLifecycleSignalBridge('signal.localDirty.set', { state: false });
  updateStatusText(buildFlowModeM9KickoffStatus('save', payload.scenes.length, { m8Kickoff: true, m9Kickoff: true }));
}

function resolveMarkdownLocalFileBridgeValue(result) {
  if (!result || result.ok !== true) return null;
  const value = result.value;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.ok !== true) return null;
  return value;
}

function getMarkdownLossReport(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const previewResult = source.previewResult
    && typeof source.previewResult === 'object'
    && !Array.isArray(source.previewResult)
    ? source.previewResult
    : {};
  const lossReport = source.lossReport
    && typeof source.lossReport === 'object'
    && !Array.isArray(source.lossReport)
    ? source.lossReport
    : previewResult.lossReport;
  return lossReport && typeof lossReport === 'object' && !Array.isArray(lossReport)
    ? lossReport
    : { count: 0, items: [] };
}

function getMarkdownLossCount(value) {
  const lossReport = getMarkdownLossReport(value);
  return Number.isInteger(lossReport.count)
    ? Math.max(0, lossReport.count)
    : (Array.isArray(lossReport.items) ? lossReport.items.length : 0);
}

function getMarkdownLossCodes(value) {
  const lossReport = getMarkdownLossReport(value);
  const items = Array.isArray(lossReport.items) ? lossReport.items : [];
  return [...new Set(items
    .map((item) => (item && typeof item === 'object' && typeof item.code === 'string' ? item.code.trim() : ''))
    .filter(Boolean))]
    .slice(0, 5);
}

function summarizeMarkdownLocalFilePreview(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const previewResult = source.previewResult
    && typeof source.previewResult === 'object'
    && !Array.isArray(source.previewResult)
    ? source.previewResult
    : {};
  const entries = Array.isArray(previewResult?.safeCreatePlan?.entries)
    ? previewResult.safeCreatePlan.entries
    : [];
  const sourceName = typeof source.sourceName === 'string' && source.sourceName.trim()
    ? source.sourceName.trim()
    : 'import.md';
  const byteLength = Number.isInteger(source.byteLength) && source.byteLength >= 0
    ? source.byteLength
    : 0;
  const lossCount = getMarkdownLossCount(source);
  const lossCodes = getMarkdownLossCodes(source);
  const lossCodeSuffix = lossCodes.length > 0 ? ` (${lossCodes.join(', ')})` : '';
  return `Markdown: ${sourceName}. Bytes: ${byteLength}. Scenes ready: ${entries.length}. Losses: ${lossCount}${lossCodeSuffix}.`;
}

function buildMarkdownPreviewReadyStatus(value) {
  const lossCount = getMarkdownLossCount(value);
  return lossCount > 0
    ? `Markdown import preview ready; losses: ${lossCount}`
    : 'Markdown import preview ready';
}

function getProjectArchiveImportBridgeValue(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return {};
  if (result.value && typeof result.value === 'object' && !Array.isArray(result.value)) {
    return result.value;
  }
  return result;
}

function summarizeProjectArchiveImportPreview(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const manifest = source.archiveManifest && typeof source.archiveManifest === 'object' && !Array.isArray(source.archiveManifest)
    ? source.archiveManifest
    : {};
  const projectName = typeof manifest.projectName === 'string' && manifest.projectName.trim()
    ? manifest.projectName.trim()
    : 'Project';
  const fileCount = Number.isInteger(manifest.fileCount) ? manifest.fileCount : 0;
  const byteCount = Number.isInteger(manifest.byteCount) ? manifest.byteCount : 0;
  const mode = source.restoreAvailable === true ? 'restore' : 'copy';
  return `Archive: ${projectName}. Files: ${fileCount}. Bytes: ${byteCount}. Mode: ${mode}.`;
}

async function handleProjectArchiveImportUiPath() {
  const requestId = `project-archive-import-${Date.now()}`;
  updateStatusText('Preparing project archive preview');
  const previewBridgeResult = await invokePreloadUiCommandBridge(
    COMMAND_IDS.PROJECT_IMPORT_FULL_ARCHIVE_V1,
    { requestId },
  );
  const previewValue = getProjectArchiveImportBridgeValue(previewBridgeResult);
  if (!previewValue || previewValue.preview !== true) {
    updateStatusText('Project archive preview unavailable');
    return;
  }
  if (previewValue.canceled === true || previewValue.cancelled === true) {
    updateStatusText('Project archive import cancelled');
    return;
  }
  const mode = previewValue.restoreAvailable === true ? 'restore' : 'copy';
  const previewSummary = summarizeProjectArchiveImportPreview(previewValue);
  const confirmed = typeof window.confirm === 'function'
    ? window.confirm(`${previewSummary}\n\nImport project archive?`)
    : false;
  if (!confirmed) {
    updateStatusText('Project archive preview ready');
    return;
  }
  updateStatusText('Importing project archive');
  const importBridgeResult = await invokePreloadUiCommandBridge(
    COMMAND_IDS.PROJECT_IMPORT_FULL_ARCHIVE_V1,
    {
      confirmed: true,
      requestId,
      mode,
      openAfterImport: true,
    },
  );
  const importValue = getProjectArchiveImportBridgeValue(importBridgeResult);
  if (importValue.imported === true) {
    const importedMode = typeof importValue.mode === 'string' ? importValue.mode : mode;
    updateStatusText(`Project archive imported: ${importedMode}`);
    await refreshProjectLibraryModal();
    return;
  }
  updateStatusText('Project archive import failed');
}

async function handleMarkdownImportUiPath() {
  updateStatusText('Preparing Markdown import preview');
  const previewBridgeResult = await invokePreloadUiCommandBridge(
    MARKDOWN_IMPORT_LOCAL_FILE_PREVIEW_COMMAND_ID,
    { requestId: `markdown-local-preview-${Date.now()}` },
  );
  const previewValue = resolveMarkdownLocalFileBridgeValue(previewBridgeResult);
  if (!previewValue) {
    updateStatusText('Import Markdown preview unavailable');
    return;
  }
  if (previewValue.canceled === true) {
    updateStatusText('Import Markdown cancelled');
    return;
  }

  const previewPayload = previewValue.previewResult
    && typeof previewValue.previewResult === 'object'
    && !Array.isArray(previewValue.previewResult)
    ? previewValue.previewResult
    : null;
  const previewId = typeof previewValue.previewId === 'string' ? previewValue.previewId.trim() : '';
  if (!previewPayload || !/^mdp_[a-f0-9]{24}$/u.test(previewId)) {
    updateStatusText('Import Markdown preview unavailable');
    return;
  }

  const previewSummary = summarizeMarkdownLocalFilePreview(previewValue);
  const confirmed = typeof window.confirm === 'function'
    ? window.confirm(`${previewSummary}\n\nCreate imported Markdown scene?`)
    : false;
  if (!confirmed) {
    updateStatusText(buildMarkdownPreviewReadyStatus(previewValue));
    return;
  }

  updateStatusText('Importing Markdown');
  const acceptBridgeResult = await invokePreloadUiCommandBridge(
    MARKDOWN_IMPORT_LOCAL_FILE_ACCEPT_COMMAND_ID,
    {
      requestId: `markdown-local-accept-${Date.now()}`,
      previewId,
    },
  );
  const safeCreateValue = resolveMarkdownLocalFileBridgeValue(acceptBridgeResult);
  if (!safeCreateValue || safeCreateValue.safeCreate !== true) {
    updateStatusText('Import Markdown safe create failed');
    return;
  }

  const createdSceneIds = Array.isArray(safeCreateValue.createdSceneIds)
    ? safeCreateValue.createdSceneIds
    : [];
  await loadTree();
  const openResult = await openImportedMarkdownSceneAfterSafeCreate(previewPayload, createdSceneIds);
  const openSuffix = openResult.opened
    ? '; opened imported scene'
    : (createdSceneIds.length > 0 ? `; ${openResult.reason}` : '');
  const lossCount = getMarkdownLossCount(previewValue);
  const lossSuffix = lossCount > 0 ? `; losses: ${lossCount}` : '';
  updateStatusText(`Imported Markdown scenes: ${createdSceneIds.length}${openSuffix}${lossSuffix}`);
}

async function handleMarkdownExportUiPath() {
  const exportBridgeResult = await invokePreloadUiCommandBridge(
    MARKDOWN_EXPORT_LOCAL_FILE_COMMAND_ID,
    { requestId: `markdown-local-export-${Date.now()}` },
  );
  const exportValue = resolveMarkdownLocalFileBridgeValue(exportBridgeResult);
  if (!exportValue) {
    updateStatusText(MARKDOWN_EXPORT_SAVE_FAILED_STATUS_MESSAGE);
    return;
  }

  if (exportValue.canceled === true) {
    updateStatusText(MARKDOWN_EXPORT_CANCELLED_STATUS_MESSAGE);
    return;
  }

  if (
    exportValue.exported !== true
    || exportValue.canonicalSavedSceneSource !== true
    || !Number.isInteger(exportValue.bytesWritten)
    || exportValue.bytesWritten <= 0
  ) {
    updateStatusText(MARKDOWN_EXPORT_SAVE_FAILED_STATUS_MESSAGE);
    return;
  }

  const lossCount = getMarkdownLossCount(exportValue);
  updateStatusText(lossCount > 0
    ? `${MARKDOWN_EXPORT_STATUS_MESSAGE}; losses: ${lossCount}`
    : MARKDOWN_EXPORT_STATUS_MESSAGE);
}

function getPlainText() {
  if (centralSheetStripLargePayloadFastPathActive) {
    plainTextBuffer = readCentralSheetLargePayloadFastPathText();
    return plainTextBuffer;
  }
  if (isTiptapMode) {
    plainTextBuffer = getTiptapPlainText();
  }
  return plainTextBuffer;
}

let deferredRenderTimerId = null;
let deferredPaginationTimerId = null;
let deferredRenderIncludePagination = false;
let deferredRenderPreserveSelection = true;
let incrementalInputDomSyncScheduled = false;
let deferredWordCountFrameId = null;
let deferredWordCountText = null;
let lastFullRenderAtMs = 0;
let legacyCompositionActive = false;
let legacyCompositionRenderPending = false;

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function cancelDeferredRenderWork() {
  if (deferredRenderTimerId) {
    window.clearTimeout(deferredRenderTimerId);
    deferredRenderTimerId = null;
  }
  if (deferredPaginationTimerId) {
    window.clearTimeout(deferredPaginationTimerId);
    deferredPaginationTimerId = null;
  }
  deferredRenderIncludePagination = false;
  deferredRenderPreserveSelection = true;
}

function setPlainText(text = '', options = {}) {
  plainTextBuffer = text;
  if (isTiptapMode) {
    cancelDeferredRenderWork();
    setTiptapPlainText(text);
    scheduleLayoutPreviewRefresh();
    return;
  }
  const includePagination = options.includePagination !== false;
  const preserveSelection = options.preserveSelection !== false;
  if (options.deferRender === true) {
    scheduleDeferredHotpathRender({ includePagination, preserveSelection });
    scheduleLayoutPreviewRefresh();
    return;
  }
  cancelDeferredRenderWork();
  renderStyledView(text, { includePagination, preserveSelection });
  scheduleLayoutPreviewRefresh();
}

function parseDocumentContent(rawText = '') {
  return parseObservablePayload(rawText);
}

function composeDocumentContent() {
  if (isTiptapMode && centralSheetStripLargePayloadFastPathActive) {
    return composeObservablePayload({
      doc: null,
      text: readCentralSheetLargePayloadFastPathText(),
      metaEnabled,
      meta: currentMeta,
      cards: currentCards,
    });
  }
  const tiptapSnapshot = isTiptapMode ? getTiptapDocumentSnapshot() : null;
  return composeObservablePayload({
    doc: tiptapSnapshot ? tiptapSnapshot.doc : null,
    text: tiptapSnapshot ? tiptapSnapshot.text : getPlainText(),
    metaEnabled,
    meta: currentMeta,
    cards: currentCards,
  });
}

function composeEditorSnapshot() {
  return {
    content: composeDocumentContent(),
    plainText: getPlainText(),
    bookProfile: getActiveBookProfile(),
    selectionRange: getSelectionOffsets(),
    generation: localEditGeneration,
  };
}

function applyIncomingBookProfile(bookProfile) {
  const normalizedResult = normalizeBookProfile(bookProfile);
  activeBookProfileState = normalizedResult.ok ? normalizedResult.value : DEFAULT_ACTIVE_BOOK_PROFILE;
  const metrics = getPageMetrics({
    profile: activeBookProfileState,
    zoom: editorZoom,
  });
  if (metrics) {
    applyPageGeometryCssVars(metrics);
  }
  syncPreviewChromeFormatValue();
  scheduleLayoutPreviewRefresh();
}

function handleDocumentContentParseIssue(issue) {
  if (!issue || typeof issue !== 'object') {
    return;
  }
  updateWarningStateText('recovery');
  if (recoveryMessage) {
    recoveryMessage.textContent = issue.userMessage || 'Recovery ready';
  }
  if (typeof issue.userMessage === 'string' && issue.userMessage.length > 0) {
    updateStatusText(issue.userMessage);
  }
}

function getSelectionOffsets() {
  if (isTiptapMode) {
    return getTiptapSelectionOffsets();
  }
  if (!editor) return { start: 0, end: 0 };
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { start: 0, end: 0 };
  }
  const range = selection.getRangeAt(0);
  const normalizePosition = (node, offset) => {
    const boundaryRange = document.createRange();
    boundaryRange.setStart(editor, 0);
    boundaryRange.setEnd(node, offset);
    return boundaryRange.toString().length;
  };
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    return { start: 0, end: 0 };
  }
  const startOffset = normalizePosition(range.startContainer, range.startOffset);
  const endOffset = normalizePosition(range.endContainer, range.endOffset);
  return {
    start: Math.min(startOffset, endOffset),
    end: Math.max(startOffset, endOffset),
  };
}

function getNodeForOffset(offset) {
  if (!editor) return { node: editor || document.body, offset: 0 };
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  let accumulated = 0;
  let currentNode = walker.nextNode();
  while (currentNode) {
    const length = currentNode.textContent?.length || 0;
    if (offset <= accumulated + length) {
      return { node: currentNode, offset: Math.max(0, offset - accumulated) };
    }
    accumulated += length;
    currentNode = walker.nextNode();
  }
  return { node: editor, offset: editor.childNodes.length };
}

function setSelectionRange(start, end) {
  if (isTiptapMode) {
    setTiptapSelectionOffsets(start, end);
    return;
  }
  if (!editor) return;
  const text = getPlainText();
  const normalizedStart = Math.max(0, Math.min(start, text.length));
  const normalizedEnd = Math.max(0, Math.min(end, text.length));
  const startPosition = getNodeForOffset(normalizedStart);
  const endPosition = getNodeForOffset(normalizedEnd);
  const range = document.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectAllEditor() {
  const length = getPlainText().length;
  setSelectionRange(0, length);
}

function renderNodesWithoutPagination(nodes) {
  if (isTiptapMode) return;
  if (!editor) return;
  editor.innerHTML = '';
  const page = createPageElement(true, 0);
  const content = page.querySelector('.editor-page__content');
  const fragment = document.createDocumentFragment();
  nodes.forEach((node) => {
    fragment.appendChild(node);
  });
  content.appendChild(fragment);
  editor.appendChild(page);
}

function renderStyledView(text = '', options = {}) {
  if (isTiptapMode) {
    plainTextBuffer = text;
    return;
  }
  if (!editor) return;
  const includePagination = options.includePagination !== false;
  const preserveSelection = options.preserveSelection !== false;
  const { start, end } = preserveSelection ? getSelectionOffsets() : { start: 0, end: 0 };
  if (!text) {
    editor.innerHTML = '';
    createEmptyPage();
    if (preserveSelection) {
      setSelectionRange(0, 0);
    }
    lastFullRenderAtMs = nowMs();
    return;
  }

  const nodes = [];
  const lines = text.split('\n');
  let inCodeBlock = false;

  const createLineElement = (styleClass, markerText, contentText) => {
    const lineEl = document.createElement('div');
    lineEl.classList.add('editor-line', styleClass);
    if (markerText) {
      const marker = document.createElement('span');
      marker.classList.add('marker');
      marker.textContent = markerText;
      lineEl.appendChild(marker);
    }
    const content = document.createElement('span');
    content.classList.add('content');
    content.textContent = contentText;
    lineEl.appendChild(content);
    return lineEl;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '```') {
      nodes.push(createLineElement('line--code-fence', '```', ''));
      inCodeBlock = !inCodeBlock;
    } else if (inCodeBlock) {
      nodes.push(createLineElement('line--codeblock', '', line));
    } else {
      const { styleClass, marker, content } = parseParagraphLine(line);
      nodes.push(createLineElement(styleClass, marker, content));
    }

    if (index < lines.length - 1) {
      nodes.push(document.createTextNode('\n'));
    }
  });

  if (includePagination) {
    editor.innerHTML = '';
    paginateNodes(nodes);
  } else {
    renderNodesWithoutPagination(nodes);
  }
  if (preserveSelection) {
    setSelectionRange(start, end);
  }
  lastFullRenderAtMs = nowMs();
}

function createPageElement(isFirstPage = false, pageIndex = 0) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('editor-page-wrap');
  wrapper.dataset.pageIndex = String(pageIndex);

  const page = document.createElement('div');
  page.classList.add('editor-page');
  const content = document.createElement('div');
  content.classList.add('editor-page__content');
  page.appendChild(content);
  wrapper.appendChild(page);
  return wrapper;
}

function createEmptyPage() {
  if (isTiptapMode) return;
  if (!editor) return;
  editor.innerHTML = '';
  const page = createPageElement(true, 0);
  editor.appendChild(page);
}

function paginateNodes(nodes) {
  if (isTiptapMode) return;
  if (!editor) return;
  if (!nodes.length) {
    createEmptyPage();
    return;
  }

  const isOverflowing = (contentEl) => {
    const limit = contentEl.clientHeight;
    return limit > 0 && contentEl.scrollHeight > limit;
  };

  const moveTailOverflow = (contentEl) => {
    const overflow = [];
    while (contentEl.childNodes.length > 1 && isOverflowing(contentEl)) {
      const tailNode = contentEl.lastChild;
      if (!tailNode) break;
      overflow.unshift(tailNode);
      contentEl.removeChild(tailNode);
    }
    return overflow;
  };

  let pageIndexCounter = 0;
  let currentPage = createPageElement(true, pageIndexCounter++);
  editor.appendChild(currentPage);
  let currentContent = currentPage.querySelector('.editor-page__content');
  let pendingMeasureCount = 0;

  const flushOverflowIfNeeded = () => {
    if (pendingMeasureCount === 0) {
      return;
    }
    pendingMeasureCount = 0;
    if (!isOverflowing(currentContent)) {
      return;
    }
    let overflowNodes = moveTailOverflow(currentContent);
    while (overflowNodes.length > 0) {
      currentPage = createPageElement(false, pageIndexCounter++);
      editor.appendChild(currentPage);
      currentContent = currentPage.querySelector('.editor-page__content');
      const fragment = document.createDocumentFragment();
      overflowNodes.forEach((node) => {
        fragment.appendChild(node);
      });
      currentContent.appendChild(fragment);
      overflowNodes = moveTailOverflow(currentContent);
    }
  };

  nodes.forEach((node, index) => {
    currentContent.appendChild(node);
    pendingMeasureCount += 1;
    const mustMeasure = pendingMeasureCount >= PAGINATION_MEASURE_BATCH_SIZE || index === nodes.length - 1;
    if (mustMeasure) {
      flushOverflowIfNeeded();
    }
  });
}

let layoutRefreshScheduled = false;
function scheduleLayoutRefresh() {
  if (isTiptapMode) return;
  if (layoutRefreshScheduled) {
    return;
  }
  layoutRefreshScheduled = true;
  window.requestAnimationFrame(() => {
    layoutRefreshScheduled = false;
    renderStyledView(getPlainText(), { includePagination: true });
  });
}

function scheduleDeferredHotpathRender(options = {}) {
  if (isTiptapMode) return;
  const includePagination = options.includePagination === true;
  const preserveSelection = options.preserveSelection !== false;
  deferredRenderIncludePagination = deferredRenderIncludePagination || includePagination;
  deferredRenderPreserveSelection = deferredRenderPreserveSelection && preserveSelection;
  if (deferredRenderTimerId) {
    window.clearTimeout(deferredRenderTimerId);
    deferredRenderTimerId = null;
  }
  const elapsedSinceFullRender = nowMs() - lastFullRenderAtMs;
  const throttledDelay = Math.max(0, HOTPATH_FULL_RENDER_MIN_INTERVAL_MS - elapsedSinceFullRender);
  const nextDelay = Math.max(HOTPATH_RENDER_DEBOUNCE_MS, throttledDelay);
  deferredRenderTimerId = window.setTimeout(() => {
    deferredRenderTimerId = null;
    const nextIncludePagination = deferredRenderIncludePagination;
    const nextPreserveSelection = deferredRenderPreserveSelection;
    deferredRenderIncludePagination = false;
    deferredRenderPreserveSelection = true;
    renderStyledView(getPlainText(), {
      includePagination: nextIncludePagination,
      preserveSelection: nextPreserveSelection,
    });
  }, nextDelay);
}

function scheduleDeferredPaginationRefresh() {
  if (isTiptapMode) return;
  if (deferredPaginationTimerId) {
    window.clearTimeout(deferredPaginationTimerId);
    deferredPaginationTimerId = null;
  }
  deferredPaginationTimerId = window.setTimeout(() => {
    deferredPaginationTimerId = null;
    const runPaginationPass = () => {
      scheduleDeferredHotpathRender({ includePagination: true, preserveSelection: true });
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(runPaginationPass, { timeout: HOTPATH_PAGINATION_IDLE_TIMEOUT_MS });
      return;
    }
    runPaginationPass();
  }, HOTPATH_PAGINATION_IDLE_DELAY_MS);
}

function normalizeActiveTextNodeWhitespace() {
  if (isTiptapMode) return;
  const selection = window.getSelection();
  const activeNode = selection && selection.anchorNode;
  if (!activeNode || !editor.contains(activeNode) || activeNode.nodeType !== Node.TEXT_NODE) {
    return;
  }
  if (activeNode.textContent && activeNode.textContent.includes('\u00a0')) {
    activeNode.textContent = activeNode.textContent.replace(/\u00a0/g, ' ');
  }
}

function scheduleIncrementalInputDomSync() {
  if (incrementalInputDomSyncScheduled) {
    return;
  }
  incrementalInputDomSyncScheduled = true;
  window.requestAnimationFrame(() => {
    incrementalInputDomSyncScheduled = false;
    normalizeActiveTextNodeWhitespace();
  });
}

function syncPlainTextBufferFromEditorDom() {
  if (centralSheetStripLargePayloadFastPathActive) {
    markCentralSheetLargePayloadFastPathDirty();
    plainTextBuffer = readCentralSheetLargePayloadFastPathText();
    return;
  }
  if (isTiptapMode) {
    plainTextBuffer = getTiptapPlainText();
    return;
  }
  plainTextBuffer = (editor.textContent || '').replace(/\u00a0/g, ' ');
}

function flushLegacyCompositionRender() {
  legacyCompositionRenderPending = false;
  scheduleIncrementalInputDomSync();
  syncPlainTextBufferFromEditorDom();
  scheduleDeferredHotpathRender({ includePagination: false, preserveSelection: true });
  scheduleDeferredPaginationRefresh();
  markAsModified();
  updateWordCount();
}

let lastPointerDownPageIndex = -1;

function getPageWrapFromNode(node) {
  if (!node) {
    return null;
  }
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!element || typeof element.closest !== 'function') {
    return null;
  }
  return element.closest('.editor-page-wrap');
}

function getPageIndexFromWrap(wrap) {
  if (!wrap) {
    return null;
  }
  const index = Number(wrap.dataset.pageIndex);
  return Number.isFinite(index) ? index : null;
}

function getPageIndexFromNode(node) {
  const wrap = getPageWrapFromNode(node);
  return getPageIndexFromWrap(wrap);
}

function getSelectionPageIndex(selection) {
  const activeSelection = selection || window.getSelection();
  if (!activeSelection || activeSelection.rangeCount === 0) {
    return null;
  }
  const anchorNode = activeSelection.anchorNode;
  if (!anchorNode) {
    return null;
  }
  return getPageIndexFromNode(anchorNode);
}

function getPageContentByIndex(index) {
  if (index == null || index < 0 || !editor) {
    return null;
  }
  const page = editor.querySelector(`.editor-page-wrap[data-page-index="${index}"]`);
  return page ? page.querySelector('.editor-page__content') : null;
}

function moveSelectionToPageContent(pageContent) {
  if (!pageContent) {
    return;
  }
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const range = document.createRange();
  range.setStart(pageContent, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function ensureCaretInLastPointerPage() {
  if (lastPointerDownPageIndex < 0) {
    return;
  }
  const activeIndex = getSelectionPageIndex();
  if (activeIndex === lastPointerDownPageIndex) {
    return;
  }
  const targetContent = getPageContentByIndex(lastPointerDownPageIndex);
  moveSelectionToPageContent(targetContent);
}

function parseParagraphLine(line) {
  const patternMatchers = [
    { prefix: '---[ SCENE ', className: 'line--heading2' },
    { prefix: '::caption:: ', className: 'line--caption' },
    { prefix: '::center:: ', className: 'line--centered' },
    { prefix: '::right:: ', className: 'line--align-right' },
    { prefix: '::justify:: ', className: 'line--align-justify' },
    { prefix: '::verse:: ', className: 'line--verse' },
    { prefix: '— ', className: 'line--attribution' },
    { prefix: '### ', className: 'line--heading2' },
    { prefix: '## ', className: 'line--heading1' },
    { prefix: '# ', className: 'line--title' },
    { prefix: '> ', className: 'line--blockquote' },
  ];

  for (const matcher of patternMatchers) {
    if (line.startsWith(matcher.prefix)) {
      return {
        styleClass: matcher.className,
        marker: matcher.prefix,
        content: line.slice(matcher.prefix.length),
      };
    }
  }

  return {
    styleClass: 'line--paragraph',
    marker: '',
    content: line,
  };
}

function positionCaretForCurrentText() {
  if (!editor) return;
  const textLength = Math.max(0, (getPlainText() || '').length);
  setSelectionRange(textLength, textLength);
}

function focusEditorSurface(position = 'current') {
  if (!editor) {
    return { performed: false, action: 'focusEditorSurface', reason: 'EDITOR_UNAVAILABLE', position };
  }

  if (isTiptapMode) {
    return focusTiptapSurface(position);
  }

  try {
    editor.focus({ preventScroll: true });
  } catch {
    editor.focus();
  }
  return { performed: true, action: 'focusEditorSurface', reason: null, position };
}

function normalizeProjectId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getActiveDocumentTitleStorageKey(projectId = currentProjectId) {
  const normalizedProjectId = normalizeProjectId(projectId);
  return normalizedProjectId ? `activeDocumentTitle:${normalizedProjectId}` : 'activeDocumentTitle';
}

function getTreeExpandedStorageKey(tab, projectId = currentProjectId) {
  const normalizedProjectId = normalizeProjectId(projectId);
  const normalizedTab = typeof tab === 'string' && tab ? tab : activeTab;
  return normalizedProjectId
    ? `treeExpanded:${normalizedProjectId}:${normalizedTab}`
    : `treeExpanded:${normalizedTab}`;
}

function readWorkspaceStorage(primaryKey, legacyKey = primaryKey) {
  try {
    const primaryValue = localStorage.getItem(primaryKey);
    if (primaryValue !== null || primaryKey === legacyKey) {
      return primaryValue;
    }
    return localStorage.getItem(legacyKey);
  } catch {
    return null;
  }
}

function getSpatialLayoutStorageKey(projectId = currentProjectId) {
  const normalizedProjectId = normalizeProjectId(projectId);
  return normalizedProjectId
    ? `${SPATIAL_LAYOUT_STORAGE_KEY_PREFIX}:${normalizedProjectId}`
    : SPATIAL_LAYOUT_STORAGE_KEY_PREFIX;
}

function getSpatialLayoutViewportWidth() {
  return Math.max(0, Math.floor(window.innerWidth || document.documentElement.clientWidth || 0));
}

function getSpatialLayoutMode(viewportWidth = getSpatialLayoutViewportWidth()) {
  return deriveSidebarViewportMode(viewportWidth);
}

function getSpatialLayoutBaselineForViewport(viewportWidth = getSpatialLayoutViewportWidth()) {
  const mode = getSpatialLayoutMode(viewportWidth);
  if (mode === 'mobile') {
    return {
      version: SPATIAL_LAYOUT_VERSION,
      projectId: normalizeProjectId(currentProjectId),
      leftSidebarWidth: SPATIAL_LAYOUT_MOBILE_LEFT_BASELINE_WIDTH,
      rightSidebarWidth: SPATIAL_LAYOUT_MOBILE_RIGHT_BASELINE_WIDTH,
      leftCollapsed: false,
      rightCollapsed: false,
      viewportWidth,
      viewportMode: mode,
      savedAtUtc: '',
      source: 'baseline',
    };
  }
  if (mode === 'compact') {
    return {
      version: SPATIAL_LAYOUT_VERSION,
      projectId: normalizeProjectId(currentProjectId),
      leftSidebarWidth: SPATIAL_LAYOUT_COMPACT_LEFT_BASELINE_WIDTH,
      rightSidebarWidth: SPATIAL_LAYOUT_COMPACT_RIGHT_BASELINE_WIDTH,
      leftCollapsed: false,
      rightCollapsed: false,
      viewportWidth,
      viewportMode: mode,
      savedAtUtc: '',
      source: 'baseline',
    };
  }
  return {
    version: SPATIAL_LAYOUT_VERSION,
    projectId: normalizeProjectId(currentProjectId),
    leftSidebarWidth: SPATIAL_LAYOUT_DESKTOP_LEFT_BASELINE_WIDTH,
    rightSidebarWidth: SPATIAL_LAYOUT_DESKTOP_RIGHT_BASELINE_WIDTH,
    leftCollapsed: false,
    rightCollapsed: false,
    viewportWidth,
    viewportMode: mode,
    savedAtUtc: '',
    source: 'baseline',
  };
}

function getSpatialLayoutConstraintsForViewport(viewportWidth = getSpatialLayoutViewportWidth()) {
  const mode = getSpatialLayoutMode(viewportWidth);
  const model = buildSidebarLayoutModel(
    spatialLayoutState || getSpatialLayoutBaselineForViewport(viewportWidth),
    { viewportWidth, viewportMode: mode },
  );
  return {
    mode: model.viewportMode,
    ...model.constraints,
    layoutVariant: model.layoutVariant,
    rightVisible: model.rightVisible,
    leftCollapsed: model.leftCollapsed,
    rightCollapsed: model.rightCollapsed,
    leftRailMode: model.leftRailMode,
    rightRailMode: model.constraints.rightRailMode,
  };
}

function clampSpatialSidebarWidth(value, min, max) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return min;
  return Math.max(min, Math.min(max, Math.round(nextValue)));
}

function isAtlasSupportedViewportWidth(viewportWidth = getSpatialLayoutViewportWidth()) {
  return Math.max(0, Math.floor(Number(viewportWidth) || 0)) >= 768;
}

function syncAtlasReachabilityOpenerState({
  viewportWidth = getSpatialLayoutViewportWidth(),
  rightOverlayMode = getSpatialLayoutConstraintsForViewport(viewportWidth).rightRailMode === 'overlay',
  rightOverlayActive = rightRailOverlayOpen === true,
  rightCollapsed = false,
} = {}) {
  if (!(atlasReachabilityOpener instanceof HTMLElement)) return;
  const supported = isAtlasSupportedViewportWidth(viewportWidth);
  const atlasActive = currentRightTab === 'atlas';
  const expanded = atlasActive && (rightOverlayActive || (!rightOverlayMode && rightCollapsed !== true));
  atlasReachabilityOpener.hidden = false;
  atlasReachabilityOpener.disabled = false;
  atlasReachabilityOpener.dataset.atlasReachabilitySupported = supported ? 'true' : 'false';
  atlasReachabilityOpener.dataset.atlasReachabilityMode = supported ? 'supported' : 'handset-advisory';
  atlasReachabilityOpener.dataset.atlasReachabilityRailMode = rightOverlayMode ? 'overlay' : 'docked';
  atlasReachabilityOpener.dataset.atlasReachabilitySurface = currentAtlasSurface;
  atlasReachabilityOpener.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  const label = supported
    ? 'Открыть Atlas'
    : 'Atlas доступен как компактный просмотр; сертификация начинается с ширины 768';
  atlasReachabilityOpener.setAttribute('aria-label', label);
  atlasReachabilityOpener.title = label;
  if (atlasReachabilityCaption instanceof HTMLElement) {
    atlasReachabilityCaption.textContent = supported ? 'Контекст' : '768+';
  }
}

function normalizeSpatialLayoutState(rawState, viewportWidth = getSpatialLayoutViewportWidth()) {
  const fallback = getSpatialLayoutBaselineForViewport(viewportWidth);
  const constraints = getSpatialLayoutConstraintsForViewport(viewportWidth);
  if (!rawState || typeof rawState !== 'object') {
    return { ...fallback };
  }

  if (rawState.version !== SPATIAL_LAYOUT_VERSION) {
    return { ...fallback };
  }

  const sharedState = buildSpatialStateFromLayoutSnapshot(
    {
      left_width: rawState.leftSidebarWidth,
      right_width: rawState.rightSidebarWidth,
      viewport_width: viewportWidth,
    },
    {
      viewportMode: constraints.mode,
      viewportWidth,
      rightVisible: constraints.rightVisible,
      leftCollapsed: rawState.leftCollapsed === true,
      rightCollapsed: rawState.rightCollapsed === true,
    }
  );

  return {
    version: SPATIAL_LAYOUT_VERSION,
    projectId: normalizeProjectId(rawState.projectId || currentProjectId),
    leftSidebarWidth: sharedState.leftSidebarWidth,
    rightSidebarWidth: sharedState.rightSidebarWidth,
    leftCollapsed: sharedState.leftCollapsed,
    rightCollapsed: sharedState.rightCollapsed,
    viewportWidth,
    viewportMode: constraints.mode,
    savedAtUtc: typeof rawState.savedAtUtc === 'string' ? rawState.savedAtUtc : '',
    source: 'stored',
  };
}

function readSpatialLayoutState(projectId = currentProjectId) {
  const storageKey = getSpatialLayoutStorageKey(projectId);
  const legacyKey = normalizeProjectId(projectId) ? storageKey : 'spatialLayout';
  const raw = readWorkspaceStorage(storageKey, legacyKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistSpatialLayoutState(state, projectId = currentProjectId) {
  const normalizedProjectId = normalizeProjectId(projectId);
  const nextState = {
    version: SPATIAL_LAYOUT_VERSION,
    projectId: normalizedProjectId,
    leftSidebarWidth: Math.round(Number(state?.leftSidebarWidth) || SPATIAL_LAYOUT_DESKTOP_LEFT_BASELINE_WIDTH),
    rightSidebarWidth: Math.round(Number(state?.rightSidebarWidth) || SPATIAL_LAYOUT_DESKTOP_RIGHT_BASELINE_WIDTH),
    leftCollapsed: state?.leftCollapsed === true,
    rightCollapsed: state?.rightCollapsed === true,
    viewportWidth: Math.max(0, Math.floor(Number(state?.viewportWidth) || getSpatialLayoutViewportWidth())),
    viewportMode: state?.viewportMode || getSpatialLayoutMode(),
    savedAtUtc: new Date().toISOString(),
    source: state?.source || 'committed',
  };
  try {
    localStorage.setItem(getSpatialLayoutStorageKey(normalizedProjectId), JSON.stringify(nextState));
  } catch {}
  spatialLayoutState = nextState;
  return nextState;
}

function applySpatialLayoutState(state, { persist = false, projectId = currentProjectId } = {}) {
  const viewportWidth = getSpatialLayoutViewportWidth();
  const normalizedState = normalizeSpatialLayoutState(state, viewportWidth);
  const constraints = getSpatialLayoutConstraintsForViewport(viewportWidth);
  const rightVisible = constraints.rightVisible;
  const previousAdaptiveMode = leftRailAdaptiveMode;
  const previousRightAdaptiveMode = rightRailAdaptiveMode;
  const overlayMode = constraints.leftRailMode === 'overlay';
  const rightOverlayMode = constraints.rightRailMode === 'overlay';
  if (previousAdaptiveMode && previousAdaptiveMode !== constraints.leftRailMode) {
    leftRailOverlayOpen = false;
    leftRailOverlayReturnFocus = null;
  }
  if (previousRightAdaptiveMode && previousRightAdaptiveMode !== constraints.rightRailMode) {
    rightRailOverlayOpen = false;
    rightRailOverlayReturnFocus = null;
  }
  leftRailAdaptiveMode = constraints.leftRailMode;
  rightRailAdaptiveMode = constraints.rightRailMode;
  if (!rightOverlayMode) {
    rightRailOverlayOpen = false;
    rightRailOverlayReturnFocus = null;
  }
  const effectiveLeftCollapsed = overlayMode
    ? !leftRailOverlayOpen
    : normalizedState.leftCollapsed;
  const effectiveRightCollapsed = rightOverlayMode
    ? !rightRailOverlayOpen
    : normalizedState.rightCollapsed;
  const rightOverlayActive = rightOverlayMode && rightRailOverlayOpen;
  const anyOverlayActive = (overlayMode && leftRailOverlayOpen) || rightOverlayActive;
  const layoutPatch = buildLayoutPatchFromSpatialState(normalizedState, {
    viewportWidth,
    viewportHeight: Math.max(0, Math.floor(window.innerHeight || document.documentElement.clientHeight || 0)),
    shellMode: constraints.mode === 'compact' ? 'COMPACT_DOCKED' : 'CALM_DOCKED',
    viewportMode: constraints.mode,
    rightVisible,
    leftCollapsed: effectiveLeftCollapsed,
    rightCollapsed: effectiveRightCollapsed,
  });

  if (appLayout) {
    appLayout.style.setProperty('--app-left-sidebar-collapsed-width', `${LEFT_RAIL_COLLAPSED_WIDTH}px`);
    appLayout.style.setProperty('--app-right-sidebar-collapsed-width', `${RIGHT_RAIL_COLLAPSED_WIDTH}px`);
    appLayout.style.setProperty('--app-left-sidebar-expanded-width', `${normalizedState.leftSidebarWidth}px`);
    appLayout.style.setProperty('--app-right-sidebar-expanded-width', `${normalizedState.rightSidebarWidth}px`);
    appLayout.style.setProperty('--app-left-sidebar-width', `${layoutPatch.left_width}px`);
    appLayout.style.setProperty('--app-right-sidebar-width', `${layoutPatch.right_width}px`);
    appLayout.dataset.sidebarLayout = constraints.layoutVariant;
    appLayout.dataset.leftRailCollapsed = effectiveLeftCollapsed ? 'true' : 'false';
    appLayout.dataset.rightRailCollapsed = effectiveRightCollapsed ? 'true' : 'false';
    appLayout.dataset.leftRailMode = constraints.leftRailMode;
    appLayout.dataset.rightRailMode = constraints.rightRailMode;
    appLayout.dataset.leftRailOverlayOpen = overlayMode && leftRailOverlayOpen ? 'true' : 'false';
    appLayout.dataset.rightRailOverlayOpen = rightOverlayActive ? 'true' : 'false';
  }

  sidebar?.classList.toggle('is-collapsed', effectiveLeftCollapsed);
  sidebar?.classList.toggle('is-overlay-mode', overlayMode);
  sidebar?.classList.toggle('is-overlay-open', overlayMode && leftRailOverlayOpen);
  if (leftRailCollapseButton) {
    const expanded = !effectiveLeftCollapsed;
    const label = overlayMode
      ? expanded ? 'Закрыть навигатор' : 'Показать навигатор'
      : expanded ? 'Свернуть навигатор' : 'Показать навигатор';
    leftRailCollapseButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    leftRailCollapseButton.setAttribute('aria-label', label);
    leftRailCollapseButton.title = label;
  }
  if (sidebarResizer) {
    sidebarResizer.hidden = overlayMode || normalizedState.leftCollapsed;
  }
  if (leftRailOverlayBackdrop) {
    leftRailOverlayBackdrop.hidden = !anyOverlayActive;
    leftRailOverlayBackdrop.setAttribute('aria-hidden', anyOverlayActive ? 'false' : 'true');
  }
  if (mainContent) {
    mainContent.inert = anyOverlayActive;
  }

  if (rightSidebar) {
    rightSidebar.hidden = !rightVisible && !rightOverlayActive;
    rightSidebar.classList.toggle('is-collapsed', effectiveRightCollapsed);
    rightSidebar.classList.toggle('is-overlay-mode', rightOverlayMode);
    rightSidebar.classList.toggle('is-overlay-open', rightOverlayActive);
  }
  if (rightRailCollapseButton) {
    const expanded = !effectiveRightCollapsed;
    const label = rightOverlayMode
      ? expanded ? 'Закрыть контекст' : 'Показать контекст'
      : expanded ? 'Свернуть контекст' : 'Показать контекст';
    rightRailCollapseButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    rightRailCollapseButton.setAttribute('aria-label', label);
    rightRailCollapseButton.title = label;
  }
  syncAtlasReachabilityOpenerState({
    viewportWidth,
    rightOverlayMode,
    rightOverlayActive,
    rightCollapsed: effectiveRightCollapsed,
  });
  if (rightSidebarResizer) {
    rightSidebarResizer.hidden = !rightVisible || effectiveRightCollapsed;
  }

  spatialLayoutState = {
    ...normalizedState,
    projectId: normalizeProjectId(projectId || normalizedState.projectId || currentProjectId),
    viewportWidth,
    viewportMode: constraints.mode,
    leftCollapsed: normalizedState.leftCollapsed,
    rightCollapsed: normalizedState.rightCollapsed,
    source: persist ? 'committed' : normalizedState.source,
  };

  if (persist) {
    persistSpatialLayoutState(spatialLayoutState, projectId);
  }

  return spatialLayoutState;
}

function restoreSpatialLayoutState(projectId = currentProjectId) {
  const storedState = readSpatialLayoutState(projectId);
  const resolvedState = normalizeSpatialLayoutState(storedState, getSpatialLayoutViewportWidth());
  return applySpatialLayoutState(resolvedState, { persist: false, projectId });
}

function commitSpatialLayoutState(projectId = currentProjectId) {
  return applySpatialLayoutState(spatialLayoutState || getSpatialLayoutBaselineForViewport(), {
    persist: true,
    projectId,
  });
}

function setLeftRailCollapsed(collapsed, { persist = true, restoreFocus = true } = {}) {
  const nextState = {
    ...(spatialLayoutState || getSpatialLayoutBaselineForViewport()),
    leftCollapsed: collapsed === true,
  };
  const applied = applySpatialLayoutState(nextState, { persist, projectId: currentProjectId });
  scheduleLayoutRefresh();
  if (restoreFocus && leftRailCollapseButton) {
    requestAnimationFrame(() => leftRailCollapseButton.focus({ preventScroll: true }));
  }
  return applied;
}

function getLeftRailOverlayFocusableElements() {
  if (!sidebar || !leftRailOverlayOpen) return [];
  return Array.from(sidebar.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((element) => !element.hidden && !element.disabled && element.getClientRects().length > 0);
}

function getRightRailOverlayFocusableElements() {
  if (!rightSidebar || !rightRailOverlayOpen) return [];
  return Array.from(rightSidebar.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((element) => !element.hidden && !element.disabled && element.getClientRects().length > 0);
}

function setLeftRailOverlayOpen(open, { restoreFocus = true } = {}) {
  const constraints = getSpatialLayoutConstraintsForViewport();
  if (constraints.leftRailMode !== 'overlay') return spatialLayoutState;
  const nextOpen = open === true;
  if (nextOpen === leftRailOverlayOpen) return spatialLayoutState;
  if (nextOpen) {
    const activeElement = document.activeElement;
    leftRailOverlayReturnFocus = activeElement instanceof HTMLElement ? activeElement : leftRailCollapseButton;
    rightRailOverlayOpen = false;
    rightRailOverlayReturnFocus = null;
  }
  const returnFocusTarget = leftRailOverlayReturnFocus;
  leftRailOverlayOpen = nextOpen;
  applySpatialLayoutState(spatialLayoutState || getSpatialLayoutBaselineForViewport(), {
    persist: false,
    projectId: currentProjectId,
  });
  scheduleLayoutRefresh();
  requestAnimationFrame(() => {
    if (nextOpen) {
      (getLeftRailOverlayFocusableElements()[0] || leftRailCollapseButton)?.focus({ preventScroll: true });
      return;
    }
    if (restoreFocus) {
      const target = returnFocusTarget?.isConnected ? returnFocusTarget : leftRailCollapseButton;
      target?.focus({ preventScroll: true });
    }
    leftRailOverlayReturnFocus = null;
  });
  return spatialLayoutState;
}

function setRightRailCollapsed(collapsed, { persist = true, restoreFocus = true } = {}) {
  const nextState = {
    ...(spatialLayoutState || getSpatialLayoutBaselineForViewport()),
    rightCollapsed: collapsed === true,
  };
  const applied = applySpatialLayoutState(nextState, { persist, projectId: currentProjectId });
  scheduleLayoutRefresh();
  if (restoreFocus && rightRailCollapseButton) {
    requestAnimationFrame(() => rightRailCollapseButton.focus({ preventScroll: true }));
  }
  return applied;
}

function setRightRailOverlayOpen(open, { restoreFocus = true } = {}) {
  const constraints = getSpatialLayoutConstraintsForViewport();
  if (constraints.rightRailMode !== 'overlay') return spatialLayoutState;
  const nextOpen = open === true;
  if (nextOpen === rightRailOverlayOpen) return spatialLayoutState;
  if (nextOpen) {
    const activeElement = document.activeElement;
    rightRailOverlayReturnFocus = activeElement instanceof HTMLElement ? activeElement : rightRailCollapseButton;
    leftRailOverlayOpen = false;
    leftRailOverlayReturnFocus = null;
  }
  const returnFocusTarget = rightRailOverlayReturnFocus;
  rightRailOverlayOpen = nextOpen;
  applySpatialLayoutState(spatialLayoutState || getSpatialLayoutBaselineForViewport(), {
    persist: false,
    projectId: currentProjectId,
  });
  scheduleLayoutRefresh();
  requestAnimationFrame(() => {
    if (nextOpen) {
      (getRightRailOverlayFocusableElements()[0] || rightRailCollapseButton)?.focus({ preventScroll: true });
      return;
    }
    if (restoreFocus) {
      const target = returnFocusTarget?.isConnected ? returnFocusTarget : rightRailCollapseButton;
      target?.focus({ preventScroll: true });
    }
    rightRailOverlayReturnFocus = null;
  });
  return spatialLayoutState;
}

function toggleRightRailCollapsed() {
  if (getSpatialLayoutConstraintsForViewport().rightRailMode === 'overlay') {
    return setRightRailOverlayOpen(!rightRailOverlayOpen);
  }
  const currentState = spatialLayoutState || getSpatialLayoutBaselineForViewport();
  return setRightRailCollapsed(currentState.rightCollapsed !== true);
}

function openAtlasRailFromReachabilityOpener({ surfaceId = currentAtlasSurface } = {}) {
  const viewportWidth = getSpatialLayoutViewportWidth();
  const supported = isAtlasSupportedViewportWidth(viewportWidth);
  applyRightTab('atlas');
  setCurrentAtlasSurface(surfaceId, { refresh: true });
  const constraints = getSpatialLayoutConstraintsForViewport(viewportWidth);
  if (constraints.rightRailMode === 'overlay') {
    setRightRailOverlayOpen(true);
  } else {
    const currentState = spatialLayoutState || getSpatialLayoutBaselineForViewport(viewportWidth);
    if (currentState.rightCollapsed === true) {
      setRightRailCollapsed(false);
    } else {
      syncAtlasReachabilityOpenerState({
        viewportWidth,
        rightOverlayMode: false,
        rightOverlayActive: false,
        rightCollapsed: false,
      });
    }
  }
  updateStatusText(supported
    ? 'Atlas context открыт'
    : 'Atlas открыт в компактном режиме; сертификация интерфейса начинается с 768px');
  return spatialLayoutState;
}

function toggleLeftRailCollapsed() {
  if (getSpatialLayoutConstraintsForViewport().leftRailMode === 'overlay') {
    return setLeftRailOverlayOpen(!leftRailOverlayOpen);
  }
  const currentState = spatialLayoutState || getSpatialLayoutBaselineForViewport();
  return setLeftRailCollapsed(currentState.leftCollapsed !== true);
}

function updateSpatialLayoutForViewportChange() {
  const storedState = readSpatialLayoutState(currentProjectId);
  const resolvedState = normalizeSpatialLayoutState(storedState || spatialLayoutState, getSpatialLayoutViewportWidth());
  applySpatialLayoutState(resolvedState, { persist: false, projectId: currentProjectId });
}

function showEditorPanelFor(title) {
  hideManualMapPlanWorkspace();
  hideNotesWorkspace();
  hideProjectSearchWorkspace();
  editorPanel?.classList.add('active');
  currentDocumentTitle = typeof title === 'string' ? title.trim() : '';
  mainContent?.classList.add('main-content--editor');
  emptyState?.classList.add('hidden');
  updateMetaVisibility();
  try {
    if (title) {
      localStorage.setItem(getActiveDocumentTitleStorageKey(currentProjectId), title);
    }
  } catch {}

  requestAnimationFrame(() => {
    if (mainContent) {
      mainContent.scrollTop = 0;
    }
    if (editor) {
      editor.scrollTop = 0;
      if (!isTiptapMode) {
        focusEditorSurface('current');
        positionCaretForCurrentText();
      }
      scheduleCentralSheetStripProofRefresh();
    }
  });
}

function collapseSelection() {
  clearFlowModeState();
  hideManualMapPlanWorkspace();
  hideNotesWorkspace();
  hideProjectSearchWorkspace();
  editorPanel?.classList.remove('active');
  mainContent?.classList.remove('main-content--editor');
  emptyState?.classList.remove('hidden');
  metaPanel?.classList.add('is-hidden');
  if (inspectorEmptyState) inspectorEmptyState.hidden = false;
  metaEnabled = false;
  currentDocumentTitle = '';
  currentMetadataBaselineHash = '';
  metadataUpdatePending = false;
  clearPendingMetadataUpdate();
  currentMeta = { synopsis: '', status: 'черновик', tags: { pov: '', line: '', place: '' } };
  currentCards = [];
  updateCardsList();
  if (editor) {
    setPlainText('');
    updateWordCount();
  }
  updateInspectorSnapshot();
  renderMetadataInspectorState({ state: 'empty', unavailableReason: 'NO_ACTIVE_NODE' });
}

function updateMetaInputs() {
  if (!metaSynopsis || !metaStatus || !metaTagPov || !metaTagLine || !metaTagPlace) return;
  metaSynopsis.value = currentMeta.synopsis || '';
  const status = currentMeta.status || 'черновик';
  ensureSelectHasOption(metaStatus, status, status);
  metaStatus.value = status;
  metaTagPov.value = currentMeta.tags.pov || '';
  metaTagLine.value = currentMeta.tags.line || '';
  metaTagPlace.value = currentMeta.tags.place || '';
}

function syncMetaFromInputs() {
  if (!metaSynopsis || !metaStatus || !metaTagPov || !metaTagLine || !metaTagPlace) return;
  currentMeta = {
    synopsis: metaSynopsis.value || '',
    status: metaStatus.value || 'черновик',
    tags: {
      pov: metaTagPov.value || '',
      line: metaTagLine.value || '',
      place: metaTagPlace.value || ''
    }
  };
}

function updateMetaVisibility() {
  if (!metaPanel) return;
  metaPanel.classList.toggle('is-hidden', !metaEnabled);
  if (inspectorEmptyState) {
    inspectorEmptyState.hidden = metaEnabled;
  }
}

function updateCardsList() {
  if (!cardsList) return;
  cardsList.innerHTML = '';
  if (!currentCards.length) {
    const empty = document.createElement('div');
    empty.className = 'tree__empty';
    empty.textContent = 'Карточек пока нет';
    cardsList.appendChild(empty);
    return;
  }
  currentCards.forEach((card) => {
    const item = document.createElement('div');
    item.className = 'card-item';
    const title = document.createElement('div');
    title.className = 'card-item__title';
    title.textContent = card.title || 'Без названия';
    const text = document.createElement('div');
    text.className = 'card-item__text';
    text.textContent = card.text || '';
    item.appendChild(title);
    item.appendChild(text);
    cardsList.appendChild(item);
  });
}

function getExpandedSet(tab) {
  if (expandedNodesByTab.has(tab)) {
    return expandedNodesByTab.get(tab);
  }
  let stored = [];
  try {
    stored = JSON.parse(
      readWorkspaceStorage(
        getTreeExpandedStorageKey(tab, currentProjectId),
        `treeExpanded:${tab}`
      ) || '[]'
    );
  } catch {
    stored = [];
  }
  const set = new Set(stored);
  expandedNodesByTab.set(tab, set);
  return set;
}

function saveExpandedSet(tab) {
  const set = expandedNodesByTab.get(tab);
  if (!set) return;
  try {
    localStorage.setItem(getTreeExpandedStorageKey(tab, currentProjectId), JSON.stringify(Array.from(set)));
  } catch {}
}

function revealActiveDocumentAncestors({ persist = false } = {}) {
  if (!treeRoot || !currentDocumentId) {
    return { found: false, changed: false, ancestorKeys: [] };
  }
  const presentationRoot = buildLeftRailPresentationTree(treeRoot);
  const result = resolveLeftRailActiveReveal(
    presentationRoot,
    currentDocumentId,
    getExpandedSet(activeTab),
  );
  if (result.changed) {
    expandedNodesByTab.set(activeTab, result.expandedKeys);
    if (persist) saveExpandedSet(activeTab);
  }
  return result;
}

function scheduleActiveTreeRowReveal({ restoreEditorFocus = false } = {}) {
  if (!treeContainer || !currentDocumentId) return;
  requestAnimationFrame(() => {
    const activeRow = treeContainer.querySelector('.tree__row[data-active-document="true"]');
    if (activeRow instanceof HTMLElement) {
      activeRow.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (restoreEditorFocus) {
      requestAnimationFrame(() => {
        focusEditorSurface('current');
      });
    }
  });
}

function getEffectiveDocumentId(node) {
  if (!node) return '';
  if (typeof node.nodeId === 'string' && node.nodeId) return node.nodeId;
  return typeof node.id === 'string' ? node.id : '';
}

function isProjectTreeDocumentId(value) {
  return typeof value === 'string' && /^tree-node-[a-f0-9]{32}$/u.test(value);
}

function findTreeNodeById(root, nodeId) {
  if (!root || typeof root !== 'object' || !nodeId) return null;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (getEffectiveDocumentId(node) === nodeId) return node;
    const children = Array.isArray(node.children) ? node.children : [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }
  return null;
}

const NAVIGATOR_SELECTABLE_KINDS = new Set(['roman-section', 'chapter-file', 'scene']);
const NAVIGATOR_MOVABLE_KINDS = new Set(['part', 'chapter-folder', 'chapter-file', 'scene']);

function isNavigatorSelectableNode(node) {
  return NAVIGATOR_SELECTABLE_KINDS.has(getEffectiveDocumentKind(node));
}

function isNavigatorMovableNode(node) {
  return NAVIGATOR_MOVABLE_KINDS.has(getEffectiveDocumentKind(node));
}

function collectNavigatorSelectionUniverse() {
  if (!treeRoot) return { availableIds: [], selectableIds: [] };
  const presentationRoot = buildLeftRailPresentationTree(treeRoot);
  const availableIds = [];
  const selectableIds = [];
  const stack = [presentationRoot];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const nodeId = getEffectiveDocumentId(node);
    if (nodeId) {
      availableIds.push(nodeId);
      if (isNavigatorSelectableNode(node)) selectableIds.push(nodeId);
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }
  return { availableIds, selectableIds };
}

function reconcileNavigatorSelectionWithTree() {
  const universe = collectNavigatorSelectionUniverse();
  navigatorSelectionState = reconcileNavigatorSelection(navigatorSelectionState, {
    projectId: currentProjectId,
    ...universe,
  });
  return navigatorSelectionState;
}

function getVisibleNavigatorRowIds({ selectableOnly = false } = {}) {
  if (!treeContainer) return [];
  return Array.from(treeContainer.querySelectorAll('.tree__row[data-navigator-row-id]'))
    .filter((row) => !selectableOnly || row.dataset.navigatorSelectable === 'true')
    .map((row) => row.dataset.navigatorRowId || '')
    .filter(Boolean);
}

function getNavigatorSelectionDescriptor() {
  return buildNavigatorSelectionDescriptor(navigatorSelectionState, {
    activeDocumentId: currentDocumentId || '',
  });
}

function scheduleNavigatorRowFocus(nodeId) {
  if (!treeContainer || !nodeId) return;
  requestAnimationFrame(() => {
    const row = treeContainer.querySelector(`.tree__row[data-navigator-row-id="${nodeId}"]`);
    if (row instanceof HTMLElement) row.focus({ preventScroll: true });
  });
}

function selectNavigatorNode(node, event = null) {
  const nodeId = getEffectiveDocumentId(node);
  if (!nodeId || !isNavigatorSelectableNode(node)) return false;
  const toggle = Boolean(event && (event.metaKey || event.ctrlKey));
  const extend = Boolean(event && event.shiftKey);
  navigatorSelectionState = applyNavigatorSelection(navigatorSelectionState, {
    nodeId,
    orderedSelectableIds: getVisibleNavigatorRowIds({ selectableOnly: true }),
    mode: extend ? 'range' : (toggle ? 'toggle' : 'single'),
    additive: extend && toggle,
  });
  return true;
}

function getEffectiveDocumentKind(node) {
  if (!node) return '';
  if (typeof node.effectiveKind === 'string' && node.effectiveKind) {
    return node.effectiveKind;
  }
  if (node.kind === 'materials-category') return 'material';
  if (node.kind === 'reference-category') return 'reference';
  return node.kind || '';
}

function getTreeNodeExpandKey(node) {
  return getLeftRailPresentationExpandKey(node);
}

function getTreeNodePresentationKind(node) {
  return getLeftRailPresentationKind(node);
}

function normalizeNavigatorDerivedCounters(node) {
  const counters = node && node.derivedCounters && typeof node.derivedCounters === 'object' && !Array.isArray(node.derivedCounters)
    ? node.derivedCounters
    : null;
  if (!counters) return null;
  const wordCount = Number.isInteger(counters.wordCount) ? Math.max(0, counters.wordCount) : 0;
  const sceneCount = Number.isInteger(counters.sceneCount) ? Math.max(0, counters.sceneCount) : 0;
  const progressPercent = Number.isInteger(counters.progressPercent)
    ? Math.min(100, Math.max(0, counters.progressPercent))
    : 0;
  if (wordCount === 0 && sceneCount === 0) return null;
  return { wordCount, sceneCount, progressPercent };
}

function formatNavigatorDerivedCounters(node) {
  const counters = normalizeNavigatorDerivedCounters(node);
  if (!counters) return '';
  const presentationKind = getTreeNodePresentationKind(node);
  if (presentationKind === 'presentation-workspace') {
    return counters.sceneCount > 0 ? `${formatLeftRailNumber(counters.sceneCount)} сц.` : '';
  }
  if (presentationKind === 'presentation-manuscript') {
    return counters.wordCount > 0 ? `${formatLeftRailNumber(counters.wordCount)} сл.` : '';
  }
  if (presentationKind === 'part' || presentationKind === 'chapter-folder') {
    return counters.sceneCount > 0 ? `${formatLeftRailNumber(counters.sceneCount)} сц.` : '';
  }
  if (presentationKind === 'scene' || presentationKind === 'chapter-file') {
    return counters.wordCount > 0 ? `${formatLeftRailNumber(counters.wordCount)} сл.` : '';
  }
  const parts = [];
  if (counters.wordCount > 0) parts.push(`${formatLeftRailNumber(counters.wordCount)} сл.`);
  if (counters.sceneCount > 0) parts.push(`${formatLeftRailNumber(counters.sceneCount)} сц.`);
  return parts.join(' · ');
}

function formatLeftRailNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Math.max(0, Number(value) || 0));
}

function formatLeftRailSceneCount(value) {
  const count = Math.max(0, Number(value) || 0);
  const mod10 = count % 10;
  const mod100 = count % 100;
  const suffix = mod10 === 1 && mod100 !== 11
    ? 'сцена'
    : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'сцены' : 'сцен');
  return `${formatLeftRailNumber(count)} ${suffix}`;
}

function updateLeftRailSummary(presentationRoot = null) {
  if (!leftRailSummary || !leftRailUnitCount || !leftRailWordCount || !leftRailProgressLabel) return;
  const counters = normalizeNavigatorDerivedCounters(presentationRoot);
  if (!counters) {
    leftRailUnitCount.textContent = 'Локально';
    leftRailWordCount.textContent = 'Без ограничений';
    leftRailProgressLabel.textContent = 'На этом устройстве';
    if (leftRailProgress) leftRailProgress.hidden = true;
    if (leftRailProgressValue) leftRailProgressValue.style.width = '0%';
    return;
  }
  leftRailUnitCount.textContent = formatLeftRailSceneCount(counters.sceneCount);
  leftRailWordCount.textContent = `${formatLeftRailNumber(counters.wordCount)} слов`;
  leftRailProgressLabel.textContent = `${counters.progressPercent}% заполнено`;
  if (leftRailProgress) {
    leftRailProgress.hidden = false;
    leftRailProgress.setAttribute('aria-valuenow', String(counters.progressPercent));
  }
  if (leftRailProgressValue) {
    leftRailProgressValue.style.width = `${counters.progressPercent}%`;
  }
}

function isTreeNodeDefaultExpanded(node) {
  return isLeftRailPresentationDefaultExpanded(node);
}

function isTreeNodeImplicitlyExpanded(node) {
  if (!node) return false;
  return (
    isTreeNodeDefaultExpanded(node) ||
    node.kind === 'materials-root' ||
    node.kind === 'reference-root' ||
    node.kind === 'materials-category' ||
    node.kind === 'reference-category'
  );
}

function isTreeNodeRowExpandable(node) {
  if (!node) return false;
  return (
    node.kind === 'part' ||
    node.kind === 'chapter-folder' ||
    node.kind === 'folder' ||
    node.kind === 'roman-root' ||
    node.kind === 'roman-section-group' ||
    node.kind === 'mindmap-root' ||
    node.kind === 'print-root' ||
    node.kind === 'presentation-workspace' ||
    node.kind === 'presentation-manuscript' ||
    node.kind === 'presentation-notes'
  );
}

function clearContextMenu() {
  if (!contextMenu) return;
  contextMenu.innerHTML = '';
  contextMenu.hidden = true;
}

function showContextMenu(items, x, y) {
  if (!contextMenu) return;
  contextMenu.innerHTML = '';
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-menu__item';
    button.textContent = item.label;
    button.dataset.commandId = item.commandId;
    button.disabled = item.enabled === false;
    button.addEventListener('click', () => {
      if (button.disabled) return;
      clearContextMenu();
      item.onInvoke();
    });
    contextMenu.appendChild(button);
  });
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.hidden = false;
}

function isNavigatorContextCommandAvailable(commandId) {
  if (!commandRegistry.hasCommand(commandId)) return false;
  return enforceCapabilityForCommand(
    commandId,
    withEditorModeCommandPayload(),
    { defaultPlatformId: window.electronAPI ? 'node' : 'web' },
  ).ok;
}

function appendContextMenuCommandItem(items, commandId, label, onInvoke, options = {}) {
  if (!isNavigatorContextCommandAvailable(commandId) || typeof onInvoke !== 'function') return;
  items.push({
    commandId,
    label,
    onInvoke,
    enabled: options.enabled !== false,
  });
}

function openCardModal(prefillText = '') {
  if (!cardModal || !cardTitleInput || !cardTextInput || !cardTagsInput) return;
  cardTitleInput.value = '';
  cardTextInput.value = prefillText || '';
  cardTagsInput.value = '';
  cardModal.hidden = false;
  cardTitleInput.focus();
}

function closeCardModal() {
  if (!cardModal) return;
  cardModal.hidden = true;
}

async function openDocumentNode(node) {
  const documentId = getEffectiveDocumentId(node);
  if (!documentId) return false;
  activeDocumentRevealRequested = true;
  try {
    const result = await dispatchUiCommand(EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN, {
      projectId: currentProjectId,
      nodeId: documentId,
    });
    if (!result || result.ok === false) {
      activeDocumentRevealRequested = false;
      return false;
    }
    const value = result.value && typeof result.value === 'object' && !Array.isArray(result.value)
      ? result.value
      : null;
    if (value && value.cancelled) {
      activeDocumentRevealRequested = false;
      return false;
    }
    currentDocumentId = value && typeof value.documentId === 'string'
      ? value.documentId
      : documentId;
    currentDocumentKind = getEffectiveDocumentKind(node);
    metaEnabled = currentDocumentKind === 'scene' || currentDocumentKind === 'chapter-file';
    updateMetaVisibility();
    updateInspectorSnapshot();
    refreshMetadataInspector();
    if (currentRightTab === 'history') {
      refreshSceneHistory('');
    }
    if (currentRightTab === 'atlas') {
      refreshActiveAtlasSurface();
    }
    return true;
  } catch {
    activeDocumentRevealRequested = false;
    return false;
  }
}

async function handleCreateNode(node, kind, promptLabel) {
  const name = window.prompt(promptLabel || 'Название', '');
  if (!name) return;
  const result = await dispatchUiCommand(EXTRA_COMMAND_IDS.TREE_CREATE_NODE, {
    projectId: currentProjectId,
    parentNodeId: getEffectiveDocumentId(node),
    kind,
    name
  });
  if (!result || result.ok === false) {
    return;
  }
  await loadTree();
}

async function handleRenameNode(node) {
  const name = window.prompt('Новое имя', node.label || '');
  if (!name) return;
  const nodeId = getEffectiveDocumentId(node);
  const result = await dispatchUiCommand(EXTRA_COMMAND_IDS.TREE_RENAME_NODE, {
    projectId: currentProjectId,
    nodeId,
    name,
  });
  if (!result || result.ok === false) {
    return;
  }
  await loadTree();
}

async function handleDeleteNode(node) {
  const confirmed = window.confirm('Переместить в корзину?');
  if (!confirmed) return;
  const nodeId = getEffectiveDocumentId(node);
  const result = await dispatchUiCommand(EXTRA_COMMAND_IDS.TREE_DELETE_NODE, {
    projectId: currentProjectId,
    nodeId,
  });
  if (!result || result.ok === false) {
    return;
  }
  if (currentDocumentId && currentDocumentId === nodeId) {
    currentDocumentId = null;
  }
  await loadTree();
  if (!currentDocumentId) {
    collapseSelection();
  }
  updateInspectorSnapshot();
}

async function handleMoveNode(node, targetParentNodeId, targetIndex) {
  const result = await dispatchUiCommand(EXTRA_COMMAND_IDS.TREE_MOVE_NODE, {
    projectId: currentProjectId,
    nodeId: getEffectiveDocumentId(node),
    targetParentNodeId,
    targetIndex,
  });
  if (!result || result.ok === false) {
    return;
  }
  await loadTree();
}

async function handleReorderNode(node, direction) {
  const targetParentNodeId = typeof node.parentNodeId === 'string' ? node.parentNodeId : '';
  const siblingIndex = Number.isInteger(node.siblingIndex) ? node.siblingIndex : -1;
  if (!targetParentNodeId || siblingIndex < 0) return;
  const targetIndex = direction === 'up' ? siblingIndex - 1 : direction === 'down' ? siblingIndex + 1 : siblingIndex;
  if (targetIndex < 0) return;
  await handleMoveNode(node, targetParentNodeId, targetIndex);
}

async function handleAddCardForNode(node) {
  const opened = await openDocumentNode(node);
  if (!opened) return;
  await dispatchUiCommand(EXTRA_COMMAND_IDS.INSERT_ADD_CARD);
}

function buildContextMenuItems(node) {
  const items = [];
  if (!node) return items;

  const append = (commandId, label, onInvoke, options) => {
    appendContextMenuCommandItem(items, commandId, label, onInvoke, options);
  };
  const appendOpen = () => {
    append(EXTRA_COMMAND_IDS.PROJECT_DOCUMENT_OPEN, 'Открыть', () => openDocumentNode(node));
  };
  const appendReorder = () => {
    append(EXTRA_COMMAND_IDS.TREE_MOVE_NODE, 'Вверх', () => handleReorderNode(node, 'up'));
    append(EXTRA_COMMAND_IDS.TREE_MOVE_NODE, 'Вниз', () => handleReorderNode(node, 'down'));
  };
  const appendRenameDelete = () => {
    append(EXTRA_COMMAND_IDS.TREE_RENAME_NODE, 'Переименовать', () => handleRenameNode(node));
    append(EXTRA_COMMAND_IDS.TREE_DELETE_NODE, 'Удалить', () => handleDeleteNode(node));
  };

  if (node.kind === 'part') {
    append(EXTRA_COMMAND_IDS.TREE_CREATE_NODE, 'Новая глава (документ)', () => handleCreateNode(node, 'chapter-file', 'Название главы'));
    append(EXTRA_COMMAND_IDS.TREE_CREATE_NODE, 'Новая глава (со сценами)', () => handleCreateNode(node, 'chapter-folder', 'Название главы'));
    appendReorder();
    appendRenameDelete();
    return items;
  }

  if (node.kind === 'chapter-folder') {
    append(EXTRA_COMMAND_IDS.TREE_CREATE_NODE, 'Новая сцена', () => handleCreateNode(node, 'scene', 'Название сцены'));
    appendReorder();
    appendRenameDelete();
    return items;
  }

  if (node.kind === 'chapter-file' || node.kind === 'scene') {
    appendOpen();
    append(EXTRA_COMMAND_IDS.INSERT_ADD_CARD, 'Добавить карточку…', () => handleAddCardForNode(node));
    append(
      EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT,
      'Экспорт TXT выбранных сцен',
      () => dispatchUiCommand(EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT),
    );
    appendReorder();
    appendRenameDelete();
    return items;
  }

  if (node.kind === 'materials-category' || node.kind === 'reference-category' || node.kind === 'folder') {
    if (node.kind === 'materials-category' || node.kind === 'reference-category') {
      appendOpen();
      append(EXTRA_COMMAND_IDS.INSERT_ADD_CARD, 'Добавить карточку…', () => handleAddCardForNode(node));
    }
    append(EXTRA_COMMAND_IDS.TREE_CREATE_NODE, 'Новая папка', () => handleCreateNode(node, 'folder', 'Название папки'));
    append(EXTRA_COMMAND_IDS.TREE_CREATE_NODE, 'Новый документ', () => handleCreateNode(node, 'file', 'Название документа'));
    if (node.kind === 'folder') {
      appendRenameDelete();
    }
    return items;
  }

  if (node.kind === 'material' || node.kind === 'reference') {
    appendOpen();
    append(EXTRA_COMMAND_IDS.INSERT_ADD_CARD, 'Добавить карточку…', () => handleAddCardForNode(node));
    appendRenameDelete();
    return items;
  }

  return items;
}

function renderTreeNode(node, level, isLast, ancestorHasNext = [], parentNodeId = '', siblingIndex = 0) {
  const li = document.createElement('li');
  li.className = 'tree__node';
  node.parentNodeId = parentNodeId;
  node.siblingIndex = siblingIndex;

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'tree__row';
  row.dataset.level = String(level);
  row.dataset.kind = getTreeNodePresentationKind(node);

  const effectiveDocumentId = getEffectiveDocumentId(node);
  if (effectiveDocumentId) {
    row.dataset.documentId = effectiveDocumentId;
    row.dataset.navigatorRowId = effectiveDocumentId;
    row.draggable = activeTab === 'roman' && isNavigatorMovableNode(node);
  }
  const derivedCounters = normalizeNavigatorDerivedCounters(node);
  if (derivedCounters) {
    row.dataset.navigatorWordCount = String(derivedCounters.wordCount);
    row.dataset.navigatorSceneCount = String(derivedCounters.sceneCount);
    row.dataset.navigatorProgressPercent = String(derivedCounters.progressPercent);
  }
  if (parentNodeId) {
    row.dataset.navigatorParentNodeId = parentNodeId;
  }
  row.dataset.navigatorSiblingIndex = String(siblingIndex);
  if (currentDocumentId && effectiveDocumentId && currentDocumentId === effectiveDocumentId) {
    row.classList.add('is-active-document');
    row.dataset.activeDocument = 'true';
    row.setAttribute('aria-current', 'true');
  }
  if (effectiveDocumentId && isNavigatorSelectableNode(node)) {
    const selected = navigatorSelectionState.selectedIds.includes(effectiveDocumentId);
    row.dataset.navigatorSelectable = 'true';
    row.classList.toggle('is-selected', selected);
    row.setAttribute('aria-selected', selected ? 'true' : 'false');
  }

  const indent = document.createElement('span');
  indent.className = 'tree__indent';
  ancestorHasNext.forEach((hasNext) => {
    const guide = document.createElement('span');
    guide.className = 'tree__guide';
    if (hasNext) {
      guide.classList.add('is-active');
    }
    indent.appendChild(guide);
  });
  const currentGuide = document.createElement('span');
  currentGuide.className = 'tree__guide is-current';
  if (isLast) {
    currentGuide.classList.add('is-last');
  }
  indent.appendChild(currentGuide);
  row.appendChild(indent);

  const toggle = document.createElement('span');
  toggle.className = 'tree__toggle';
  const hasChildren = node.children && node.children.length > 0;
  if (hasChildren) {
    toggle.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4 10 8 6 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  const expandedSet = getExpandedSet(activeTab);
  const expandKey = getTreeNodeExpandKey(node);
  const collapsedKey = expandKey ? `collapsed:${expandKey}` : '';
  const isImplicitlyExpanded = isTreeNodeImplicitlyExpanded(node);
  const isExpanded =
    hasChildren &&
    (!collapsedKey || !expandedSet.has(collapsedKey)) &&
    ((expandKey && expandedSet.has(expandKey)) || isImplicitlyExpanded);
  if (isExpanded) {
    toggle.classList.add('is-expanded');
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!hasChildren) return;
    if (isExpanded) {
      if (isImplicitlyExpanded && collapsedKey) {
        expandedSet.add(collapsedKey);
      } else if (expandKey) {
        expandedSet.delete(expandKey);
      }
    } else {
      if (collapsedKey) expandedSet.delete(collapsedKey);
      if (expandKey) expandedSet.add(expandKey);
    }
    saveExpandedSet(activeTab);
    renderTree();
  });

  const label = document.createElement('span');
  label.className = 'tree__label';
  label.textContent = node.label || node.name || '';
  const counterLabel = formatNavigatorDerivedCounters(node);

  if (!hasChildren) {
    toggle.classList.add('is-empty');
  }
  row.appendChild(toggle);
  row.appendChild(label);
  if (counterLabel) {
    const counters = document.createElement('span');
    counters.className = 'tree__counters';
    counters.textContent = counterLabel;
    counters.setAttribute('aria-label', `Счетчики: ${counterLabel}`);
    row.appendChild(counters);
  }
  row.addEventListener('focus', () => {
    if (!effectiveDocumentId) return;
    navigatorSelectionState = {
      ...navigatorSelectionState,
      focusedId: effectiveDocumentId,
    };
  });
  row.addEventListener('click', async (event) => {
    if (hasChildren && isTreeNodeRowExpandable(node)) {
      if (isExpanded) {
        if (isImplicitlyExpanded && collapsedKey) {
          expandedSet.add(collapsedKey);
        } else if (expandKey) {
          expandedSet.delete(expandKey);
        }
      } else {
        if (collapsedKey) expandedSet.delete(collapsedKey);
        if (expandKey) expandedSet.add(expandKey);
      }
      saveExpandedSet(activeTab);
      renderTree();
      return;
    }
    if (
      getEffectiveDocumentId(node) &&
      (node.kind === 'chapter-file' ||
        node.kind === 'scene' ||
        node.kind === 'material' ||
        node.kind === 'reference' ||
        node.kind === 'materials-category' ||
        node.kind === 'reference-category' ||
        node.kind === 'roman-section' ||
        node.kind === 'mindmap-section' ||
        node.kind === 'print-section')
    ) {
      const selectionHandled = selectNavigatorNode(node, event);
      const selectionOnly = selectionHandled && Boolean(event.metaKey || event.ctrlKey || event.shiftKey);
      if (selectionOnly) {
        renderTree();
        scheduleNavigatorRowFocus(effectiveDocumentId);
        return;
      }
      const opened = await openDocumentNode(node);
      renderTree();
      if (!opened) scheduleNavigatorRowFocus(effectiveDocumentId);
    }
  });

  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (
      effectiveDocumentId
      && isNavigatorSelectableNode(node)
      && !navigatorSelectionState.selectedIds.includes(effectiveDocumentId)
    ) {
      selectNavigatorNode(node);
      renderTree();
    }
    const items = buildContextMenuItems(node);
    if (items.length) {
      showContextMenu(items, event.clientX, event.clientY);
    }
  });

  row.addEventListener('dragstart', (event) => {
    if (!event.dataTransfer) {
      event.preventDefault();
      return;
    }
    if (!effectiveDocumentId || activeTab !== 'roman' || !isNavigatorMovableNode(node)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-yalken-tree-node-id', effectiveDocumentId);
    event.dataTransfer.setData('application/x-yalken-tree-parent-node-id', parentNodeId || '');
    event.dataTransfer.setData('application/x-yalken-tree-sibling-index', String(siblingIndex));
  });

  row.addEventListener('dragover', (event) => {
    if (!event.dataTransfer) return;
    if (!effectiveDocumentId || activeTab !== 'roman') return;
    const draggedId = event.dataTransfer.getData('application/x-yalken-tree-node-id');
    if (!draggedId || draggedId === effectiveDocumentId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });

  row.addEventListener('drop', (event) => {
    if (!event.dataTransfer) return;
    if (!effectiveDocumentId || activeTab !== 'roman') return;
    const draggedId = event.dataTransfer.getData('application/x-yalken-tree-node-id');
    if (!draggedId || draggedId === effectiveDocumentId) return;
    const draggedNode = findTreeNodeById(treeRoot, draggedId);
    if (!draggedNode) return;
    event.preventDefault();
    const targetParentNodeId = node.kind === 'chapter-folder' || node.kind === 'part' || node.kind === 'roman-root'
      ? effectiveDocumentId
      : parentNodeId;
    let targetIndex = node.kind === 'chapter-folder' || node.kind === 'part' || node.kind === 'roman-root'
      ? 0
      : siblingIndex;
    const sourceParentNodeId = event.dataTransfer.getData('application/x-yalken-tree-parent-node-id');
    const sourceSiblingIndex = Number(event.dataTransfer.getData('application/x-yalken-tree-sibling-index'));
    if (
      sourceParentNodeId
      && sourceParentNodeId === targetParentNodeId
      && Number.isInteger(sourceSiblingIndex)
      && sourceSiblingIndex >= 0
      && sourceSiblingIndex < targetIndex
    ) {
      targetIndex -= 1;
    }
    if (!targetParentNodeId || targetIndex < 0) return;
    handleMoveNode(draggedNode, targetParentNodeId, targetIndex);
  });

  li.appendChild(row);

  if (hasChildren && isExpanded) {
    const ul = document.createElement('ul');
    ul.className = 'tree__children';
    node.children.forEach((child, index) => {
      ul.appendChild(
        renderTreeNode(
          child,
          level + 1,
          index === node.children.length - 1,
          ancestorHasNext.concat(!isLast),
          effectiveDocumentId,
          index
        )
      );
    });
    li.appendChild(ul);
  }

  return li;
}

function findRomanRootNode(root) {
  if (!root) return null;
  if (root.kind === 'roman-root') return root;
  if (Array.isArray(root.children)) {
    return root.children.find((child) => child.kind === 'roman-root') || null;
  }
  return null;
}

function buildNavigatorRootCreateMenuItems() {
  if (activeTab !== 'roman' || !treeRoot) return [];
  const romanRoot = findRomanRootNode(treeRoot);
  if (!romanRoot) return [];
  const items = [];
  appendContextMenuCommandItem(
    items,
    EXTRA_COMMAND_IDS.TREE_CREATE_NODE,
    'Новая часть',
    () => handleCreateNode(romanRoot, 'part', 'Название части'),
  );
  appendContextMenuCommandItem(
    items,
    EXTRA_COMMAND_IDS.TREE_CREATE_NODE,
    'Новая глава (документ)',
    () => handleCreateNode(romanRoot, 'chapter-file', 'Название главы'),
  );
  appendContextMenuCommandItem(
    items,
    EXTRA_COMMAND_IDS.TREE_CREATE_NODE,
    'Новая глава (со сценами)',
    () => handleCreateNode(romanRoot, 'chapter-folder', 'Название главы'),
  );
  return items;
}

function openNavigatorRootCreateMenu(anchor = null, point = null) {
  const items = buildNavigatorRootCreateMenuItems();
  if (!items.length) return false;
  const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : null;
  const x = point && Number.isFinite(point.x)
    ? point.x
    : Math.max(8, (rect ? rect.right : 188) - 180);
  const y = point && Number.isFinite(point.y)
    ? point.y
    : (rect ? rect.bottom + 4 : 52);
  showContextMenu(items, x, y);
  return true;
}

function renderTree({ revealActive = false, restoreEditorFocus = false } = {}) {
  if (!treeContainer) return;
  reconcileNavigatorSelectionWithTree();
  treeContainer.innerHTML = '';
  if (!treeRoot) {
    const empty = document.createElement('div');
    empty.className = 'tree__empty';
    empty.textContent = 'Дерево пустое';
    treeContainer.appendChild(empty);
    updateLeftRailSummary(null);
    renderOutlineList();
    renderSearchResults(leftSearchInput ? leftSearchInput.value : '');
    updateInspectorSnapshot();
    return;
  }
  const list = document.createElement('ul');
  list.className = 'tree__list';
  const presentationRoot = buildLeftRailPresentationTree(treeRoot);
  updateLeftRailSummary(presentationRoot);
  const nodesToRender =
    (presentationRoot.kind === 'presentation-workspace'
      ? [presentationRoot]
      : (presentationRoot.kind === 'roman-root' ? [presentationRoot] : presentationRoot.children)) || [];
  nodesToRender.forEach((child, index) => {
    list.appendChild(renderTreeNode(child, 0, index === nodesToRender.length - 1, []));
  });
  treeContainer.appendChild(list);
  if (revealActive) {
    scheduleActiveTreeRowReveal({ restoreEditorFocus });
  }
  renderOutlineList();
  renderSearchResults(leftSearchInput ? leftSearchInput.value : '');
  updateInspectorSnapshot();
}

async function loadTree() {
  if (!window.electronAPI || typeof window.electronAPI.invokeWorkspaceQueryBridge !== 'function') return;
  try {
    const result = await invokeWorkspaceQueryBridge(PROJECT_TREE_QUERY_ID, { tab: activeTab });
    if (!result || result.ok === false) {
      updateStatusText('Ошибка');
      return;
    }
    if (typeof result.projectId === 'string' && result.projectId.trim()) {
      const nextProjectId = normalizeProjectId(result.projectId);
      if (nextProjectId !== currentProjectId) {
        currentProjectId = nextProjectId;
        expandedNodesByTab = new Map();
        navigatorSelectionState = createNavigatorSelectionState(currentProjectId);
      }
    }
    treeRoot = result.root;
    if (treeContainer) {
      treeContainer.dataset.tab = activeTab;
    }
    if (activeTab === 'roman' && treeRoot) {
      const expandedSet = getExpandedSet(activeTab);
      let stored = null;
      stored = readWorkspaceStorage(
        getTreeExpandedStorageKey('roman', currentProjectId),
        'treeExpanded:roman'
      );
      if (stored === null) {
        const romanRoot = findRomanRootNode(treeRoot);
        const nodeIdToExpand = getEffectiveDocumentId(romanRoot) || getEffectiveDocumentId(treeRoot);
        if (nodeIdToExpand) {
          expandedSet.add(nodeIdToExpand);
          saveExpandedSet(activeTab);
        }
      }
    }
    const shouldRevealActiveDocument = activeDocumentRevealRequested && isProjectTreeDocumentId(currentDocumentId);
    const revealResult = shouldRevealActiveDocument
      ? revealActiveDocumentAncestors({ persist: true })
      : { found: false };
    if (revealResult.found) {
      activeDocumentRevealRequested = false;
    }
    renderTree({
      revealActive: revealResult.found,
      restoreEditorFocus: revealResult.found,
    });
  } catch {
    updateStatusText('Ошибка');
  }
}

function unwrapBridgeResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  if (result.value && typeof result.value === 'object' && !Array.isArray(result.value)) {
    return result.value;
  }
  return result;
}

function normalizeProjectLibraryEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const projectId = typeof entry.projectId === 'string' ? entry.projectId.trim() : '';
  const projectName = typeof entry.projectName === 'string' && entry.projectName.trim()
    ? entry.projectName.trim()
    : 'Без названия';
  if (!projectId) return null;
  return {
    projectId,
    projectName,
    status: typeof entry.status === 'string' ? entry.status : 'available',
    lastOpenedAtUtc: typeof entry.lastOpenedAtUtc === 'string' ? entry.lastOpenedAtUtc : '',
    duplicateProjectId: Boolean(entry.duplicateProjectId),
    warnings: Array.isArray(entry.warnings) ? entry.warnings.filter((warning) => typeof warning === 'string') : [],
  };
}

function normalizeProjectLibraryModel(model) {
  const source = model && typeof model === 'object' && !Array.isArray(model) ? model : {};
  const entries = Array.isArray(source.entries)
    ? source.entries.map(normalizeProjectLibraryEntry).filter(Boolean)
    : [];
  return {
    ok: source.ok === true,
    entries,
    counts: source.counts && typeof source.counts === 'object' && !Array.isArray(source.counts)
      ? source.counts
      : {},
  };
}

function setProjectLibraryStatus(text) {
  projectLibraryState = {
    ...projectLibraryState,
    statusText: text || 'Готово',
  };
  if (projectLibraryStatus) {
    projectLibraryStatus.textContent = projectLibraryState.statusText;
  }
}

function getSelectedProjectLibraryEntry() {
  const projectId = projectLibraryState.selectedProjectId;
  return projectLibraryState.entries.find((entry) => entry.projectId === projectId) || null;
}

function renderProjectLibraryModal() {
  if (!projectLibraryList) return;
  projectLibraryList.innerHTML = '';
  const selectedEntry = getSelectedProjectLibraryEntry();
  const hasSelection = Boolean(selectedEntry);
  const selectedStatus = selectedEntry?.status || 'available';
  const canOpenSelected = hasSelection && selectedStatus !== 'trashed' && selectedStatus !== 'missing';
  const canMutateSelected = hasSelection && selectedStatus !== 'missing';
  if (projectLibraryOpenButton) projectLibraryOpenButton.disabled = !canOpenSelected;
  if (projectLibraryRenameButton) projectLibraryRenameButton.disabled = !canOpenSelected;
  if (projectLibraryDuplicateButton) projectLibraryDuplicateButton.disabled = !hasSelection;
  if (projectLibraryMoveButton) projectLibraryMoveButton.disabled = !canOpenSelected;
  if (projectLibraryArchiveButton) projectLibraryArchiveButton.disabled = !canOpenSelected || selectedStatus === 'archived';
  if (projectLibraryTrashButton) projectLibraryTrashButton.disabled = !canOpenSelected;
  if (projectLibraryRestoreButton) projectLibraryRestoreButton.disabled = !canMutateSelected || (selectedStatus !== 'archived' && selectedStatus !== 'trashed');
  if (projectLibraryBackupButton) projectLibraryBackupButton.disabled = !canMutateSelected;
  if (projectLibraryIntegrityButton) projectLibraryIntegrityButton.disabled = !hasSelection;
  if (!projectLibraryState.entries.length) {
    const empty = document.createElement('div');
    empty.className = 'project-library__empty';
    empty.textContent = 'Пока нет локальных проектов';
    projectLibraryList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  projectLibraryState.entries.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `project-library__row${entry.projectId === projectLibraryState.selectedProjectId ? ' is-active' : ''}`;
    button.dataset.projectLibraryId = entry.projectId;
    button.setAttribute('aria-pressed', entry.projectId === projectLibraryState.selectedProjectId ? 'true' : 'false');

    const name = document.createElement('span');
    name.className = 'project-library__name';
    name.textContent = entry.projectName;

    const meta = document.createElement('small');
    meta.className = 'project-library__meta';
    const flags = [
      entry.status !== 'available' ? entry.status : '',
      entry.duplicateProjectId ? 'duplicate' : '',
      entry.warnings.length ? 'needs attention' : '',
    ].filter(Boolean);
    meta.textContent = flags.length ? flags.join(' · ') : 'local project';

    button.appendChild(name);
    button.appendChild(meta);
    fragment.appendChild(button);
  });
  projectLibraryList.appendChild(fragment);
}

async function refreshProjectLibraryModal() {
  if (!projectLibraryModal) return;
  projectLibraryState = { ...projectLibraryState, loading: true };
  setProjectLibraryStatus('Обновляю');
  try {
    const result = await invokeWorkspaceQueryBridge(PROJECT_LIBRARY_QUERY_ID, {});
    const model = normalizeProjectLibraryModel(result);
    if (!model.ok) {
      projectLibraryState = { ...projectLibraryState, loading: false, entries: [], selectedProjectId: '' };
      setProjectLibraryStatus('Библиотека недоступна');
      renderProjectLibraryModal();
      return;
    }
    const selectedStillExists = model.entries.some((entry) => entry.projectId === projectLibraryState.selectedProjectId);
    projectLibraryState = {
      loading: false,
      entries: model.entries,
      selectedProjectId: selectedStillExists
        ? projectLibraryState.selectedProjectId
        : (model.entries[0]?.projectId || ''),
      statusText: '',
    };
    setProjectLibraryStatus(model.entries.length ? `${model.entries.length} проектов` : 'Нет проектов');
    renderProjectLibraryModal();
  } catch {
    projectLibraryState = { ...projectLibraryState, loading: false };
    setProjectLibraryStatus('Библиотека недоступна');
    renderProjectLibraryModal();
  }
}

function openProjectLibraryModal() {
  openSimpleModal(projectLibraryModal);
  void refreshProjectLibraryModal();
}

async function runProjectLifecycleAndRefresh(commandId, payload, statusText) {
  const result = await dispatchUiCommand(commandId, payload);
  const value = unwrapBridgeResult(result);
  if (!result || result.ok !== true) {
    setProjectLibraryStatus(value && typeof value.reason === 'string' ? value.reason : 'Команда не выполнена');
    return false;
  }
  closeSimpleModal(projectLibraryModal);
  updateStatusText(statusText);
  await loadTree();
  return true;
}

async function createProjectFromLibraryModal() {
  const projectName = projectLibraryNameInput?.value?.trim() || '';
  if (!projectName) {
    setProjectLibraryStatus('Введите имя проекта');
    projectLibraryNameInput?.focus();
    return;
  }
  if (projectLibraryCreateButton) projectLibraryCreateButton.disabled = true;
  try {
    const ok = await runProjectLifecycleAndRefresh(
      EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CREATE,
      { projectName },
      'Проект создан',
    );
    if (ok && projectLibraryNameInput) projectLibraryNameInput.value = '';
  } finally {
    if (projectLibraryCreateButton) projectLibraryCreateButton.disabled = false;
  }
}

async function openSelectedProjectFromLibraryModal() {
  const projectId = projectLibraryState.selectedProjectId;
  if (!projectId) {
    setProjectLibraryStatus('Выберите проект');
    return;
  }
  await runProjectLifecycleAndRefresh(
    EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_OPEN,
    { projectId },
    'Проект открыт',
  );
}

async function continueLastProjectFromLibraryModal() {
  await runProjectLifecycleAndRefresh(
    EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_CONTINUE,
    {},
    'Последний проект открыт',
  );
}

async function renameSelectedProjectFromLibraryModal() {
  const projectId = projectLibraryState.selectedProjectId;
  const projectName = projectLibraryNameInput?.value?.trim() || '';
  if (!projectId) {
    setProjectLibraryStatus('Выберите проект');
    return;
  }
  if (!projectName) {
    setProjectLibraryStatus('Введите новое имя');
    projectLibraryNameInput?.focus();
    return;
  }
  if (projectLibraryRenameButton) projectLibraryRenameButton.disabled = true;
  try {
    const ok = await runProjectLifecycleAndRefresh(
      EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_RENAME,
      { projectId, projectName },
      'Проект переименован',
    );
    if (ok && projectLibraryNameInput) projectLibraryNameInput.value = '';
  } finally {
    if (projectLibraryRenameButton) projectLibraryRenameButton.disabled = false;
  }
}

async function duplicateSelectedProjectFromLibraryModal() {
  const projectId = projectLibraryState.selectedProjectId;
  const projectName = projectLibraryNameInput?.value?.trim() || '';
  if (!projectId) {
    setProjectLibraryStatus('Выберите проект');
    return;
  }
  if (!projectName) {
    setProjectLibraryStatus('Введите имя копии');
    projectLibraryNameInput?.focus();
    return;
  }
  if (projectLibraryDuplicateButton) projectLibraryDuplicateButton.disabled = true;
  try {
    const ok = await runProjectLifecycleAndRefresh(
      EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_DUPLICATE,
      { projectId, projectName },
      'Проект продублирован',
    );
    if (ok && projectLibraryNameInput) projectLibraryNameInput.value = '';
  } finally {
    if (projectLibraryDuplicateButton) projectLibraryDuplicateButton.disabled = false;
  }
}

async function moveSelectedProjectFromLibraryModal() {
  const projectId = projectLibraryState.selectedProjectId;
  if (!projectId) {
    setProjectLibraryStatus('Выберите проект');
    return;
  }
  if (projectLibraryMoveButton) projectLibraryMoveButton.disabled = true;
  try {
    await runProjectLifecycleAndRefresh(
      EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_MOVE_LOCATION,
      { projectId },
      'Проект перемещён',
    );
  } finally {
    if (projectLibraryMoveButton) projectLibraryMoveButton.disabled = false;
  }
}

async function runSelectedProjectLibraryLifecycleAction(commandId, button, statusText) {
  const projectId = projectLibraryState.selectedProjectId;
  if (!projectId) {
    setProjectLibraryStatus('Выберите проект');
    return;
  }
  if (button) button.disabled = true;
  try {
    const result = await dispatchUiCommand(commandId, { projectId });
    const value = unwrapBridgeResult(result);
    if (!result || result.ok !== true) {
      setProjectLibraryStatus(value && typeof value.reason === 'string' ? value.reason : 'Команда не выполнена');
      return;
    }
    setProjectLibraryStatus(statusText);
    updateStatusText(statusText);
    await refreshProjectLibraryModal();
    await loadTree();
  } finally {
    if (button) button.disabled = false;
  }
}

async function archiveSelectedProjectFromLibraryModal() {
  await runSelectedProjectLibraryLifecycleAction(
    EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_ARCHIVE,
    projectLibraryArchiveButton,
    'Проект архивирован',
  );
}

async function trashSelectedProjectFromLibraryModal() {
  await runSelectedProjectLibraryLifecycleAction(
    EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_TRASH,
    projectLibraryTrashButton,
    'Проект перемещён в корзину',
  );
}

async function restoreSelectedProjectFromLibraryModal() {
  await runSelectedProjectLibraryLifecycleAction(
    EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_RESTORE,
    projectLibraryRestoreButton,
    'Проект восстановлен',
  );
}

async function backupSelectedProjectFromLibraryModal() {
  await runSelectedProjectLibraryLifecycleAction(
    EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_BACKUP,
    projectLibraryBackupButton,
    'Резервная копия создана',
  );
}

async function inspectSelectedProjectIntegrityFromLibraryModal() {
  await runSelectedProjectLibraryLifecycleAction(
    EXTRA_COMMAND_IDS.PROJECT_LIFECYCLE_INTEGRITY,
    projectLibraryIntegrityButton,
    'Целостность проверена',
  );
}

if (treeContainer) {
  treeContainer.addEventListener('keydown', (event) => {
    const row = event.target instanceof Element
      ? event.target.closest('.tree__row[data-navigator-row-id]')
      : null;
    if (!(row instanceof HTMLElement)) return;
    const currentId = row.dataset.navigatorRowId || '';
    const visibleIds = getVisibleNavigatorRowIds();
    const directionByKey = {
      ArrowUp: 'previous',
      ArrowDown: 'next',
      Home: 'first',
      End: 'last',
    };
    const direction = directionByKey[event.key];
    if (direction) {
      event.preventDefault();
      navigatorSelectionState = moveNavigatorFocus(navigatorSelectionState, {
        orderedIds: visibleIds,
        currentId,
        direction,
      });
      const targetId = navigatorSelectionState.focusedId;
      if (event.shiftKey && targetId) {
        navigatorSelectionState = applyNavigatorSelection(navigatorSelectionState, {
          nodeId: targetId,
          orderedSelectableIds: getVisibleNavigatorRowIds({ selectableOnly: true }),
          mode: 'range',
          additive: Boolean(event.metaKey || event.ctrlKey),
        });
        renderTree();
        scheduleNavigatorRowFocus(targetId);
        return;
      }
      const target = treeContainer.querySelector(`.tree__row[data-navigator-row-id="${targetId}"]`);
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
      return;
    }

    if ((event.key === ' ' || event.key === 'Spacebar') && row.dataset.navigatorSelectable === 'true') {
      event.preventDefault();
      const toggle = event.metaKey || event.ctrlKey;
      navigatorSelectionState = applyNavigatorSelection(navigatorSelectionState, {
        nodeId: currentId,
        orderedSelectableIds: getVisibleNavigatorRowIds({ selectableOnly: true }),
        mode: event.shiftKey ? 'range' : (toggle ? 'toggle' : 'single'),
        additive: event.shiftKey && toggle,
      });
      renderTree();
      scheduleNavigatorRowFocus(currentId);
    }
  });

  treeContainer.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.tree__row')) {
      return;
    }
    if (!treeRoot) return;
    event.preventDefault();
    openNavigatorRootCreateMenu(null, { x: event.clientX, y: event.clientY });
  });
}

let spatialResizeDragState = null;

function updateSpatialResizeFromClientX(clientX) {
  if (!spatialResizeDragState) return;
  const constraints = getSpatialLayoutConstraintsForViewport();
  const nextState = {
    ...(spatialLayoutState || getSpatialLayoutBaselineForViewport()),
    viewportWidth: getSpatialLayoutViewportWidth(),
    viewportMode: constraints.mode,
  };

  if (spatialResizeDragState.rightVisible) {
    if (spatialResizeDragState.side === 'left') {
      nextState.leftSidebarWidth = clampSpatialSidebarWidth(
        spatialResizeDragState.startLeftWidth + (clientX - spatialResizeDragState.startX),
        constraints.leftMin,
        constraints.leftMax
      );
    } else {
      nextState.rightSidebarWidth = clampSpatialSidebarWidth(
        spatialResizeDragState.startRightWidth + (spatialResizeDragState.startX - clientX),
        constraints.rightMin,
        constraints.rightMax
      );
    }
  } else {
    nextState.leftSidebarWidth = clampSpatialSidebarWidth(
      spatialResizeDragState.startLeftWidth + (clientX - spatialResizeDragState.startX),
      constraints.leftMin,
      constraints.leftMax
    );
  }

  applySpatialLayoutState(nextState, { persist: false, projectId: currentProjectId });
  scheduleLayoutRefresh();
}

function bindCapturedSpatialResizeStream(target, pointerId) {
  if (!(target instanceof Element)) return false;
  if (!Number.isInteger(pointerId) || typeof target.setPointerCapture !== 'function') {
    return false;
  }
  try {
    target.setPointerCapture(pointerId);
  } catch {
    return false;
  }
  target.addEventListener('pointermove', handleSpatialResizeMove);
  target.addEventListener('pointerup', stopSpatialResize);
  target.addEventListener('pointercancel', stopSpatialResize);
  target.addEventListener('lostpointercapture', stopSpatialResize);
  return true;
}

function bindWindowSpatialResizeMouseStream() {
  window.addEventListener('mousemove', handleSpatialResizeMouseMove);
  window.addEventListener('mouseup', stopSpatialResize);
}

function unbindWindowSpatialResizeMouseStream() {
  window.removeEventListener('mousemove', handleSpatialResizeMouseMove);
  window.removeEventListener('mouseup', stopSpatialResize);
}

function bindWindowSpatialResizePointerStream() {
  window.addEventListener('pointermove', handleSpatialResizeMove);
  window.addEventListener('pointerup', stopSpatialResize);
  window.addEventListener('pointercancel', stopSpatialResize);
}

function unbindWindowSpatialResizePointerStream() {
  window.removeEventListener('pointermove', handleSpatialResizeMove);
  window.removeEventListener('pointerup', stopSpatialResize);
  window.removeEventListener('pointercancel', stopSpatialResize);
}

function unbindCapturedSpatialResizeStream(target, pointerId) {
  if (!(target instanceof Element)) return;
  target.removeEventListener('pointermove', handleSpatialResizeMove);
  target.removeEventListener('pointerup', stopSpatialResize);
  target.removeEventListener('pointercancel', stopSpatialResize);
  target.removeEventListener('lostpointercapture', stopSpatialResize);
  if (
    Number.isInteger(pointerId) &&
    typeof target.hasPointerCapture === 'function' &&
    target.hasPointerCapture(pointerId) &&
    typeof target.releasePointerCapture === 'function'
  ) {
    try {
      target.releasePointerCapture(pointerId);
    } catch {}
  }
}

function startSpatialResize(side, event) {
  const draftState = spatialLayoutState || getSpatialLayoutBaselineForViewport();
  const pointerTarget = event.currentTarget instanceof Element ? event.currentTarget : null;
  const pointerId = Number.isInteger(event.pointerId) ? event.pointerId : null;
  spatialResizeDragState = {
    side,
    startX: event.clientX,
    startLeftWidth: draftState.leftSidebarWidth,
    startRightWidth: draftState.rightSidebarWidth,
    rightVisible: getSpatialLayoutConstraintsForViewport().rightVisible,
    pointerId,
    pointerTarget,
    activeHandle: pointerTarget,
    captureBound: false,
    mouseFallbackBound: false,
    pointerFallbackBound: false,
  };
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  pointerTarget?.classList.add('is-resizing');
  appLayout?.classList.add('is-sidebar-resizing');
  if (bindCapturedSpatialResizeStream(pointerTarget, pointerId)) {
    spatialResizeDragState.captureBound = true;
  }
  if (event.pointerType === 'mouse') {
    if (!spatialResizeDragState.captureBound) {
      spatialResizeDragState.mouseFallbackBound = true;
      bindWindowSpatialResizeMouseStream();
    }
    return;
  }
  if (!spatialResizeDragState.captureBound) {
    spatialResizeDragState.pointerFallbackBound = true;
    bindWindowSpatialResizePointerStream();
  }
}

function handleSpatialResizeMove(event) {
  if (!spatialResizeDragState) return;
  if (
    Number.isInteger(spatialResizeDragState.pointerId) &&
    Number.isInteger(event.pointerId) &&
    event.pointerId !== spatialResizeDragState.pointerId
  ) {
    return;
  }
  updateSpatialResizeFromClientX(event.clientX);
  event.preventDefault();
}

function handleSpatialResizeMouseMove(event) {
  if (!spatialResizeDragState) return;
  if (event.buttons === 0) {
    stopSpatialResize();
    return;
  }
  updateSpatialResizeFromClientX(event.clientX);
  event.preventDefault();
}

function stopSpatialResize() {
  if (!spatialResizeDragState) return;
  const {
    pointerId,
    pointerTarget,
    activeHandle,
    captureBound,
    mouseFallbackBound,
    pointerFallbackBound,
  } = spatialResizeDragState;
  spatialResizeDragState = null;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  activeHandle?.classList.remove('is-resizing');
  appLayout?.classList.remove('is-sidebar-resizing');
  if (captureBound) {
    unbindCapturedSpatialResizeStream(pointerTarget, pointerId);
  }
  if (mouseFallbackBound) {
    unbindWindowSpatialResizeMouseStream();
  }
  if (pointerFallbackBound) {
    unbindWindowSpatialResizePointerStream();
  }
  commitSpatialLayoutState(currentProjectId);
  scheduleLayoutRefresh();
}

if (sidebar && sidebarResizer) {
  sidebarResizer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startSpatialResize('left', event);
  });
}

if (rightSidebar && rightSidebarResizer) {
  rightSidebarResizer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startSpatialResize('right', event);
  });
}

let localDirty = false;
// R2.4 P0: per-session monotonically increasing local edit generation.
// Every authoring mutation bumps it exactly once; autosave captures and
// acknowledgements are fenced by it so a stale save cannot clear newer work.
let localEditGeneration = 0;

if (metaSynopsis) {
  metaSynopsis.addEventListener('input', () => {
    syncMetaFromInputs();
    scheduleMetadataUpdate();
  });
}

if (metaStatus) {
  metaStatus.addEventListener('change', () => {
    syncMetaFromInputs();
    scheduleMetadataUpdate();
  });
}

if (metaTagPov) {
  metaTagPov.addEventListener('input', () => {
    syncMetaFromInputs();
    scheduleMetadataUpdate();
  });
}

if (metaTagLine) {
  metaTagLine.addEventListener('input', () => {
    syncMetaFromInputs();
    scheduleMetadataUpdate();
  });
}

if (metaTagPlace) {
  metaTagPlace.addEventListener('input', () => {
    syncMetaFromInputs();
    scheduleMetadataUpdate();
  });
}

if (addCardButton) {
  addCardButton.addEventListener('click', () => {
    void dispatchUiCommand(EXTRA_COMMAND_IDS.INSERT_ADD_CARD);
  });
}

if (cardSaveButtons.length) {
  cardSaveButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!cardTitleInput || !cardTextInput || !cardTagsInput) return;
      const card = {
        title: cardTitleInput.value.trim(),
        text: cardTextInput.value.trim(),
        tags: cardTagsInput.value.trim()
      };
      currentCards.push(card);
      updateCardsList();
      markAsModified();
      closeCardModal();
    });
  });
}

if (cardCancelButtons.length) {
  cardCancelButtons.forEach((button) => {
    button.addEventListener('click', () => {
      closeCardModal();
    });
  });
}

document.addEventListener('click', (event) => {
  const actionTarget = event.target.closest('[data-action]');
  if (actionTarget && !actionTarget.closest('[data-toolbar]')) {
    const action = actionTarget.dataset.action;
    if (handleUiAction(action)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
  }
  if (
    configuratorPanel &&
    !configuratorPanel.hidden &&
    !configuratorPanel.contains(event.target) &&
    !event.target.closest('[data-grid-button]')
  ) {
    setConfiguratorOpen(false);
  }
  if (contextMenu && !contextMenu.hidden && !contextMenu.contains(event.target)) {
    clearContextMenu();
  }
});

document.addEventListener('contextmenu', (event) => {
  if (editor && editor.contains(event.target)) {
    event.preventDefault();
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString() : '';
    showContextMenu(
      [
        {
          label: 'Добавить карточку…',
          onClick: () => openCardModal(selectedText)
        }
      ],
      event.clientX,
      event.clientY
    );
  }
});

document.addEventListener('scroll', () => {
  clearContextMenu();
}, true);

function updateStatusText(text) {
  if (statusElement && text) {
    statusElement.textContent = text;
  }
}

function updateSaveStateText(text) {
  if (saveStateElement && text) {
    saveStateElement.textContent = `Save: ${text}`;
  }
}

function updateWarningStateText(text) {
  if (warningStateElement && text) {
    warningStateElement.textContent = `Warnings: ${text}`;
  }
}

function updatePerfHintText(text) {
  if (perfHintElement && text) {
    perfHintElement.textContent = `Perf: ${text}`;
  }
}

function updateInspectorSnapshot() {
  if (!inspectorSnapshotElement) return;
  const snapshot = [
    `Mode=${currentMode}`,
    `DocKind=${currentDocumentKind || 'none'}`,
    `DocId=${currentDocumentId || 'none'}`,
    `Dirty=${localDirty ? 'true' : 'false'}`,
    `FlowMode=${flowModeState.active ? 'active' : 'off'}`,
    `CollabScopeLocal=${collabScopeLocal ? 'true' : 'false'}`,
  ];
  inspectorSnapshotElement.textContent = snapshot.join('\n');
}

function normalizeMetadataInspectorPayload(result) {
  const state = typeof result?.state === 'string' ? result.state : 'empty';
  const context = result?.context && typeof result.context === 'object' && !Array.isArray(result.context)
    ? result.context
    : null;
  const metadata = result?.metadata && typeof result.metadata === 'object' && !Array.isArray(result.metadata)
    ? result.metadata
    : {};
  const tags = metadata.tags && typeof metadata.tags === 'object' && !Array.isArray(metadata.tags)
    ? metadata.tags
    : {};
  return {
    state,
    unavailableReason: typeof result?.unavailableReason === 'string' ? result.unavailableReason : '',
    context: context
      ? {
        nodeId: typeof context.nodeId === 'string' ? context.nodeId : '',
        kind: typeof context.kind === 'string' ? context.kind : '',
        title: typeof context.title === 'string' ? context.title : '',
        metaEnabled: context.metaEnabled === true,
      }
      : null,
    metadata: {
      synopsis: typeof metadata.synopsis === 'string' ? metadata.synopsis : '',
      status: typeof metadata.status === 'string' && metadata.status ? metadata.status : 'черновик',
      tags: {
        pov: typeof tags.pov === 'string' ? tags.pov : '',
        line: typeof tags.line === 'string' ? tags.line : '',
        place: typeof tags.place === 'string' ? tags.place : '',
      },
    },
    wordCount: Number.isInteger(result?.wordCount) ? Math.max(0, result.wordCount) : 0,
    modifiedAtUtc: typeof result?.modifiedAtUtc === 'string' ? result.modifiedAtUtc : '',
  };
}

function presentMetadataInspectorUnavailable(reason = '') {
  if (reason === 'DOCUMENT_EMPTY') {
    return {
      title: 'Пустая сцена',
      detail: 'Добавьте текст или сведения сцены.',
    };
  }
  if (reason === 'METADATA_UNSUPPORTED_FOR_NODE') {
    return {
      title: 'Выберите сцену',
      detail: 'Для папок и заметок сведения сцены не показываются.',
    };
  }
  if (reason === 'NO_ACTIVE_NODE' || reason === 'E_TREE_NODE_ID_INVALID' || reason === 'TREE_NODE_UNAVAILABLE') {
    return {
      title: 'Выберите сцену',
      detail: 'Сведения появятся после выбора сцены в навигаторе.',
    };
  }
  return {
    title: 'Сведения недоступны',
    detail: 'Текст сцены остаётся доступен и не изменён.',
  };
}

function formatMetadataInspectorModifiedAt(value = '') {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat('ru', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  if (sameDay) return `сегодня, ${time}`;
  return new Intl.DateTimeFormat('ru', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function setMetadataInspectorEditingEnabled(enabled) {
  const editable = enabled === true;
  for (const control of [metaSynopsis, metaStatus, metaTagPov, metaTagLine, metaTagPlace]) {
    if (control) control.disabled = !editable;
  }
  if (metaPanel) {
    metaPanel.dataset.metadataEditable = editable ? 'true' : 'false';
  }
}

function setMetadataInspectorSurfaceVisible(visible) {
  const contextVisible = visible === true;
  metaPanel?.classList.toggle('is-hidden', !contextVisible);
  if (inspectorEmptyState) inspectorEmptyState.hidden = contextVisible;
}

function getMetadataInspectorContextPresentation(kind = '') {
  if (kind === 'chapter-file') {
    return { label: 'Глава', tab: 'Глава', type: 'Глава рукописи', sceneFields: true };
  }
  if (kind === 'roman-section') {
    return { label: 'Документ', tab: 'Документ', type: 'Раздел рукописи', sceneFields: false };
  }
  return { label: 'Сцена', tab: 'Сцена', type: 'Сцена рукописи', sceneFields: true };
}

function setMetadataInspectorContextPresentation(state, contextAvailable) {
  const presentation = getMetadataInspectorContextPresentation(state.context?.kind || '');
  const sceneFieldsVisible = contextAvailable && state.context?.metaEnabled === true && presentation.sceneFields;
  if (rightInspectorTabButton) rightInspectorTabButton.textContent = contextAvailable ? presentation.tab : 'Сцена';
  if (inspectorContextKind) inspectorContextKind.textContent = presentation.label;
  for (const section of inspectorSceneSections) section.hidden = !sceneFieldsVisible;
  if (inspectorSceneDetails) inspectorSceneDetails.hidden = !sceneFieldsVisible;
  if (inspectorDocumentSummary) inspectorDocumentSummary.hidden = !contextAvailable || sceneFieldsVisible;
  if (inspectorDocumentTypeValue) inspectorDocumentTypeValue.textContent = presentation.type;
  if (inspectorDetailsShowLabel) {
    inspectorDetailsShowLabel.textContent = sceneFieldsVisible ? 'Показать сведения' : 'Показать настройки';
  }
  if (inspectorDetailsHideLabel) {
    inspectorDetailsHideLabel.textContent = sceneFieldsVisible ? 'Скрыть сведения' : 'Скрыть настройки';
  }
  if (metaPanel) {
    metaPanel.dataset.contextKind = state.context?.kind || '';
    metaPanel.dataset.contextMode = sceneFieldsVisible ? 'metadata' : 'document';
  }
}

function renderMetadataInspectorState(rawState = {}) {
  const state = normalizeMetadataInspectorPayload(rawState);
  const hasWritableBaseline = typeof rawState?.contentHash === 'string' && /^[a-f0-9]{64}$/u.test(rawState.contentHash);
  if (hasWritableBaseline) {
    currentMetadataBaselineHash = rawState.contentHash;
    if (metadataUpdatePending) {
      scheduleMetadataUpdate();
    }
  } else {
    currentMetadataBaselineHash = '';
  }
  const contextAvailable = state.state === 'ready' && Boolean(state.context);
  const sceneAvailable = contextAvailable && state.context?.metaEnabled === true;
  const editable = sceneAvailable && hasWritableBaseline;
  setMetadataInspectorSurfaceVisible(contextAvailable);
  setMetadataInspectorContextPresentation(state, contextAvailable);
  setMetadataInspectorEditingEnabled(editable);

  if (state.state === 'ready' && !metadataUpdatePending) {
    currentMeta = {
      synopsis: state.metadata.synopsis,
      status: state.metadata.status,
      tags: { ...state.metadata.tags },
    };
    updateMetaInputs();
  }

  const unavailable = presentMetadataInspectorUnavailable(state.unavailableReason);
  if (inspectorEmptyState) {
    const title = inspectorEmptyState.querySelector('strong');
    const detail = inspectorEmptyState.querySelector('span');
    if (title) title.textContent = unavailable.title;
    if (detail) detail.textContent = unavailable.detail;
  }
  const contextLabel = state.context && state.context.title
    ? state.context.title
    : (currentDocumentTitle || unavailable.title);
  if (inspectorMetaContextValue) inspectorMetaContextValue.textContent = contextLabel;
  if (inspectorMetaStatusValue) {
    inspectorMetaStatusValue.value = currentMeta.status || 'черновик';
  }
  if (inspectorMetaWordCountValue) {
    const liveWordCount = state.state === 'ready'
      ? state.wordCount
      : String(getPlainText() || '').trim().split(/\s+/u).filter(Boolean).length;
    inspectorMetaWordCountValue.textContent = String(liveWordCount);
    if (inspectorDocumentWordCountValue) {
      inspectorDocumentWordCountValue.textContent = String(liveWordCount);
    }
  }
  if (inspectorMetaSynopsisValue && document.activeElement !== inspectorMetaSynopsisValue) {
    inspectorMetaSynopsisValue.value = currentMeta.synopsis || '';
  }
  if (inspectorMetaTagsValue) {
    const hasTags = Boolean(currentMeta.tags?.pov || currentMeta.tags?.line || currentMeta.tags?.place);
    inspectorMetaTagsValue.dataset.empty = hasTags ? 'false' : 'true';
  }
  if (inspectorMetaModifiedValue) {
    const modifiedLabel = formatMetadataInspectorModifiedAt(state.modifiedAtUtc);
    inspectorMetaModifiedValue.textContent = modifiedLabel;
    if (inspectorDocumentModifiedValue) inspectorDocumentModifiedValue.textContent = modifiedLabel;
  }
}

function clearPendingMetadataUpdate() {
  if (metadataUpdateDebounceId) {
    window.clearTimeout(metadataUpdateDebounceId);
    metadataUpdateDebounceId = null;
  }
}

function getMetadataUpdatePayload() {
  if (!metaEnabled || !currentProjectId || !currentDocumentId || !currentMetadataBaselineHash) return null;
  return {
    projectId: currentProjectId,
    nodeId: currentDocumentId,
    baselineHash: currentMetadataBaselineHash,
    metadata: {
      synopsis: currentMeta.synopsis || '',
      status: currentMeta.status || 'черновик',
      tags: {
        pov: currentMeta.tags?.pov || '',
        line: currentMeta.tags?.line || '',
        place: currentMeta.tags?.place || '',
      },
    },
  };
}

async function flushMetadataUpdate() {
  clearPendingMetadataUpdate();
  const payload = getMetadataUpdatePayload();
  if (!payload) return;
  metadataUpdatePending = false;
  const result = await dispatchUiCommand(METADATA_UPDATE_COMMAND_ID, payload);
  if (!result || result.ok !== true) {
    updateStatusText('Метаданные не сохранены');
    await refreshMetadataInspector();
    return;
  }
  const receipt = result.value?.receipt && typeof result.value.receipt === 'object' && !Array.isArray(result.value.receipt)
    ? result.value.receipt
    : null;
  if (receipt && typeof receipt.contentHashAfter === 'string' && /^[a-f0-9]{64}$/u.test(receipt.contentHashAfter)) {
    currentMetadataBaselineHash = receipt.contentHashAfter;
  }
  updateStatusText('Метаданные сохранены');
  await refreshMetadataInspector();
}

function scheduleMetadataUpdate() {
  if (!metaEnabled) return;
  metadataUpdatePending = true;
  clearPendingMetadataUpdate();
  metadataUpdateDebounceId = window.setTimeout(() => {
    void flushMetadataUpdate();
  }, 400);
}

async function refreshMetadataInspector() {
  if (!window.electronAPI || typeof window.electronAPI.invokeWorkspaceQueryBridge !== 'function') {
    renderMetadataInspectorState({ state: 'unavailable', unavailableReason: 'QUERY_BRIDGE_UNAVAILABLE' });
    return;
  }
  const result = await invokeWorkspaceQueryBridge(METADATA_INSPECTOR_QUERY_ID, {
    projectId: currentProjectId,
    nodeId: currentDocumentId || '',
  });
  if (!result || result.ok === false) {
    renderMetadataInspectorState({ state: 'unavailable', unavailableReason: 'METADATA_QUERY_FAILED' });
    return;
  }
  renderMetadataInspectorState(result);
}

function normalizeNotesWorkspaceReadModel(result = {}) {
  const notes = Array.isArray(result.notes)
    ? result.notes
        .filter((note) => note && typeof note === 'object' && !Array.isArray(note))
        .map((note) => ({
          id: typeof note.id === 'string' ? note.id : '',
          scope: typeof note.scope === 'string' ? note.scope : 'inbox',
          title: typeof note.title === 'string' ? note.title : '',
          body: typeof note.body === 'string' ? note.body : '',
          createdAtUtc: typeof note.createdAtUtc === 'string' ? note.createdAtUtc : '',
          updatedAtUtc: typeof note.updatedAtUtc === 'string' ? note.updatedAtUtc : '',
          deleted: note.deleted === true,
          attachment: note.attachment && typeof note.attachment === 'object' && !Array.isArray(note.attachment)
            ? note.attachment
            : {},
          conversions: Array.isArray(note.conversions) ? note.conversions : [],
          contentHash: typeof note.contentHash === 'string' ? note.contentHash : '',
        }))
        .filter((note) => note.id)
    : [];
  const counts = result.counts && typeof result.counts === 'object' && !Array.isArray(result.counts)
    ? result.counts
    : {};
  return {
    ok: result.ok === true,
    state: typeof result.state === 'string' ? result.state : 'unavailable',
    notes,
    counts: {
      total: Number.isInteger(counts.total) ? Math.max(0, counts.total) : notes.filter((note) => !note.deleted).length,
      deleted: Number.isInteger(counts.deleted) ? Math.max(0, counts.deleted) : notes.filter((note) => note.deleted).length,
      inbox: Number.isInteger(counts.inbox) ? Math.max(0, counts.inbox) : notes.filter((note) => !note.deleted && note.scope === 'inbox').length,
    },
  };
}

function getSelectedNotesWorkspaceNote() {
  return notesWorkspaceState.notes.find((note) => note.id === notesWorkspaceState.selectedId) || null;
}

function setNotesWorkspaceStatus(text) {
  if (notesStatusElement) {
    notesStatusElement.textContent = text || 'Готово';
  }
}

function presentNoteScope(scope) {
  switch (scope) {
    case 'scene':
      return 'сцена';
    case 'selection':
      return 'фрагмент';
    case 'manuscript':
      return 'рукопись';
    case 'project':
      return 'проект';
    default:
      return 'входящие';
  }
}

function presentNoteTitle(note) {
  const title = typeof note?.title === 'string' ? note.title.trim() : '';
  if (title) return title;
  const body = typeof note?.body === 'string' ? note.body.trim() : '';
  return body ? body.slice(0, 42) : 'Без названия';
}

function renderNotesLeftList() {
  if (!notesLeftListElement) return;
  notesLeftListElement.innerHTML = '';
  const activeNotes = notesWorkspaceState.notes.filter((note) => !note.deleted).slice(0, 12);
  if (!activeNotes.length) {
    const empty = document.createElement('div');
    empty.className = 'tree__empty';
    empty.textContent = 'Заметок пока нет';
    notesLeftListElement.appendChild(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'tree__list notes-left-list';
  for (const note of activeNotes) {
    const item = document.createElement('li');
    item.className = 'tree__node notes-left-list__item';
    item.textContent = presentNoteTitle(note);
    list.appendChild(item);
  }
  notesLeftListElement.appendChild(list);
}

function renderNotesWorkspaceList() {
  if (!notesListElement) return;
  notesListElement.innerHTML = '';
  if (notesWorkspaceState.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'notes-list__empty';
    loading.textContent = 'Загружаю заметки';
    notesListElement.appendChild(loading);
    return;
  }
  if (notesWorkspaceState.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'notes-list__empty notes-list__empty--error';
    unavailable.textContent = 'Заметки недоступны. Данные проекта не изменены.';
    notesListElement.appendChild(unavailable);
    return;
  }
  if (!notesWorkspaceState.notes.length) {
    const empty = document.createElement('div');
    empty.className = 'notes-list__empty';
    empty.textContent = 'Входящие пусты';
    notesListElement.appendChild(empty);
    return;
  }
  for (const note of notesWorkspaceState.notes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notes-list__item';
    button.dataset.noteId = note.id;
    button.classList.toggle('is-active', note.id === notesWorkspaceState.selectedId);
    button.classList.toggle('is-deleted', note.deleted);
    button.setAttribute('aria-pressed', note.id === notesWorkspaceState.selectedId ? 'true' : 'false');
    const title = document.createElement('span');
    title.className = 'notes-list__title';
    title.textContent = presentNoteTitle(note);
    const meta = document.createElement('span');
    meta.className = 'notes-list__meta';
    meta.textContent = `${presentNoteScope(note.scope)} · ${note.deleted ? 'удалена' : 'активна'}`;
    button.append(title, meta);
    notesListElement.appendChild(button);
  }
}

function renderNotesWorkspaceDetail() {
  const note = getSelectedNotesWorkspaceNote();
  const hasNote = Boolean(note);
  if (notesDetailEmpty) notesDetailEmpty.hidden = hasNote;
  if (notesDetailContent) notesDetailContent.hidden = !hasNote;
  if (!hasNote) {
    if (notesDetailTitle) notesDetailTitle.value = '';
    if (notesDetailBody) notesDetailBody.value = '';
    return;
  }
  if (notesDetailMeta) {
    const attached = note.attachment && typeof note.attachment.nodeId === 'string' && note.attachment.nodeId
      ? ' · привязана'
      : '';
    notesDetailMeta.textContent = `${presentNoteScope(note.scope)}${attached}`;
  }
  if (notesDetailTitle && notesDetailTitle.value !== note.title) notesDetailTitle.value = note.title;
  if (notesDetailBody && notesDetailBody.value !== note.body) notesDetailBody.value = note.body;
  if (notesSaveButton) notesSaveButton.disabled = note.deleted;
  if (notesAttachSceneButton) {
    notesAttachSceneButton.disabled = note.deleted || !currentDocumentId || currentDocumentKind !== 'scene';
  }
  if (notesConvertSceneButton) notesConvertSceneButton.disabled = note.deleted || !note.body.trim();
  if (notesDeleteButton) notesDeleteButton.hidden = note.deleted;
  if (notesRestoreButton) notesRestoreButton.hidden = !note.deleted;
}

function renderNotesWorkspace() {
  renderNotesLeftList();
  renderNotesWorkspaceList();
  renderNotesWorkspaceDetail();
  const countText = `${notesWorkspaceState.counts.inbox || 0} входящих`;
  setNotesWorkspaceStatus(notesWorkspaceState.state === 'ready' ? countText : notesWorkspaceState.state);
}

function getNotesCommandResult(dispatchResult) {
  const value = dispatchResult && dispatchResult.value && typeof dispatchResult.value === 'object'
    ? dispatchResult.value
    : null;
  const result = value && value.result && typeof value.result === 'object' ? value.result : value;
  return result && result.ok === true ? result : null;
}

async function refreshNotesWorkspace(options = {}) {
  if (!notesWorkspace) return;
  notesWorkspaceState = {
    ...notesWorkspaceState,
    state: 'loading',
    includeDeleted: options.includeDeleted === true || notesWorkspaceState.includeDeleted === true,
  };
  renderNotesWorkspace();
  const result = await invokeWorkspaceQueryBridge(NOTES_WORKSPACE_QUERY_ID, {
    projectId: currentProjectId,
    scope: '',
    includeDeleted: notesWorkspaceState.includeDeleted,
  });
  if (!result || result.ok === false) {
    notesWorkspaceState = {
      ...notesWorkspaceState,
      state: 'unavailable',
      notes: [],
      counts: { total: 0, deleted: 0, inbox: 0 },
      selectedId: '',
    };
    renderNotesWorkspace();
    return;
  }
  const readModel = normalizeNotesWorkspaceReadModel(result);
  const selectedStillExists = readModel.notes.some((note) => note.id === notesWorkspaceState.selectedId);
  notesWorkspaceState = {
    ...notesWorkspaceState,
    state: readModel.state === 'ready' ? 'ready' : readModel.state,
    notes: readModel.notes,
    counts: readModel.counts,
    selectedId: selectedStillExists ? notesWorkspaceState.selectedId : (readModel.notes[0]?.id || ''),
  };
  renderNotesWorkspace();
}

function showNotesWorkspace() {
  hideManualMapPlanWorkspace();
  notesWorkspace?.removeAttribute('hidden');
  notesWorkspace?.classList.add('is-active');
  editorPanel?.classList.remove('active');
  mainContent?.classList.remove('main-content--editor');
  mainContent?.classList.add('main-content--notes');
  emptyState?.classList.add('hidden');
  metaPanel?.classList.add('is-hidden');
  void refreshNotesWorkspace();
  requestAnimationFrame(() => {
    notesCaptureBody?.focus({ preventScroll: true });
  });
}

function hideNotesWorkspace() {
  notesWorkspace?.setAttribute('hidden', '');
  notesWorkspace?.classList.remove('is-active');
  mainContent?.classList.remove('main-content--notes');
}

function showProjectSearchWorkspace() {
  hideManualMapPlanWorkspace();
  projectSearchWorkspace?.removeAttribute('hidden');
  projectSearchWorkspace?.classList.add('is-active');
  editorPanel?.classList.remove('active');
  mainContent?.classList.remove('main-content--editor');
  mainContent?.classList.add('main-content--search');
  emptyState?.classList.add('hidden');
  metaPanel?.classList.add('is-hidden');
  renderProjectSearchResults();
  scheduleProjectSearchResults(leftSearchInput ? leftSearchInput.value : '');
  requestAnimationFrame(() => {
    leftSearchInput?.focus({ preventScroll: true });
  });
}

function hideProjectSearchWorkspace() {
  projectSearchWorkspace?.setAttribute('hidden', '');
  projectSearchWorkspace?.classList.remove('is-active');
  mainContent?.classList.remove('main-content--search');
}

function showManualMapPlanWorkspace() {
  if (!(manualMapPlanWorkspace instanceof HTMLElement)) return;
  hideNotesWorkspace();
  hideProjectSearchWorkspace();
  manualMapPlanWorkspace.removeAttribute('hidden');
  manualMapPlanWorkspace.classList.add('is-active');
  editorPanel?.classList.remove('active');
  editorPanelWrapper?.setAttribute('hidden', '');
  mainContent?.classList.remove('main-content--editor');
  mainContent?.classList.add('main-content--manual-map');
  emptyState?.classList.add('hidden');
  metaPanel?.classList.add('is-hidden');
  applyLeftTab('outline');
  if (currentRightTab !== 'atlas') {
    applyRightTab('atlas');
  }
  setCurrentAtlasSurface('manualMap', { refresh: false });
  void refreshManualMapWorkbench({ force: true });
  requestAnimationFrame(() => {
    manualMapPlanHost?.querySelector('input, button, [tabindex]')?.focus({ preventScroll: true });
  });
}

function hideManualMapPlanWorkspace() {
  manualMapPlanWorkspace?.setAttribute('hidden', '');
  manualMapPlanWorkspace?.classList.remove('is-active');
  editorPanelWrapper?.removeAttribute('hidden');
  mainContent?.classList.remove('main-content--manual-map');
}

async function runNotesMutation(commandId, payload, successStatus) {
  const result = await dispatchUiCommand(commandId, payload);
  const notesResult = getNotesCommandResult(result);
  if (!notesResult) {
    setNotesWorkspaceStatus('Не сохранено');
    return null;
  }
  if (notesResult.note && typeof notesResult.note.id === 'string') {
    notesWorkspaceState.selectedId = notesResult.note.id;
  }
  setNotesWorkspaceStatus(successStatus || 'Сохранено');
  await refreshNotesWorkspace();
  return notesResult;
}

async function createInboxNoteFromCapture() {
  const body = notesCaptureBody?.value.trim() || '';
  const title = notesCaptureTitle?.value.trim() || '';
  if (!body && !title) {
    setNotesWorkspaceStatus('Пустая заметка');
    notesCaptureBody?.focus();
    return;
  }
  const created = await runNotesMutation(EXTRA_COMMAND_IDS.NOTES_CREATE, {
    projectId: currentProjectId,
    scope: 'inbox',
    title,
    body,
  }, 'Заметка сохранена');
  if (created) {
    if (notesCaptureTitle) notesCaptureTitle.value = '';
    if (notesCaptureBody) notesCaptureBody.value = '';
  }
}

async function saveSelectedNote() {
  const note = getSelectedNotesWorkspaceNote();
  if (!note || note.deleted) return;
  await runNotesMutation(EXTRA_COMMAND_IDS.NOTES_UPDATE, {
    projectId: currentProjectId,
    noteId: note.id,
    title: notesDetailTitle?.value || '',
    body: notesDetailBody?.value || '',
  }, 'Заметка обновлена');
}

async function attachSelectedNoteToActiveScene() {
  const note = getSelectedNotesWorkspaceNote();
  if (!note || note.deleted || !currentDocumentId || currentDocumentKind !== 'scene') return;
  await runNotesMutation(EXTRA_COMMAND_IDS.NOTES_ATTACH_SCENE, {
    projectId: currentProjectId,
    noteId: note.id,
    nodeId: currentDocumentId,
  }, 'Привязано к сцене');
}

async function convertSelectedNoteToScene() {
  const note = getSelectedNotesWorkspaceNote();
  if (!note || note.deleted) return;
  const title = notesDetailTitle?.value.trim() || note.title || 'Новая сцена';
  const preview = await runNotesMutation(EXTRA_COMMAND_IDS.NOTES_CONVERT_SCENE, {
    projectId: currentProjectId,
    noteId: note.id,
    title,
  }, 'Готово к созданию сцены');
  if (!preview || preview.preview !== true) return;
  if (!window.confirm('Создать сцену из выбранной заметки? Заметка останется во входящих.')) {
    setNotesWorkspaceStatus('Создание отменено');
    return;
  }
  await runNotesMutation(EXTRA_COMMAND_IDS.NOTES_CONVERT_SCENE, {
    projectId: currentProjectId,
    noteId: note.id,
    title,
    confirmed: true,
  }, 'Сцена создана');
  await loadTree();
}

function renderOutlineList() {
  if (!outlineListElement) return;
  outlineListElement.innerHTML = '';
  const items = [];
  if (treeRoot && Array.isArray(treeRoot.children)) {
    const walk = (nodes) => {
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const kind = String(node.kind || '');
        const isMindMap = kind === 'mindmap-section' || kind === 'mindmap-root';
        if (isMindMap && currentMode !== 'plan') {
          continue;
        }
        if (kind === 'part' || kind === 'chapter-folder' || kind === 'chapter-file' || kind === 'scene' || isMindMap) {
          items.push(`${kind}: ${node.label || ''}`);
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
          walk(node.children);
        }
      }
    };
    walk(treeRoot.children);
  }
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree__empty';
    empty.textContent = 'Outline is empty';
    outlineListElement.appendChild(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'tree__list';
  for (const line of items) {
    const li = document.createElement('li');
    li.className = 'tree__node';
    li.textContent = line;
    list.appendChild(li);
  }
  outlineListElement.appendChild(list);
}

function normalizeProjectSearchReadModel(result, sequence = projectSearchState.sequence) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const results = Array.isArray(source.results)
    ? source.results
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .slice(0, 100)
    : [];
  const counts = source.counts && typeof source.counts === 'object' && !Array.isArray(source.counts)
    ? source.counts
    : {};
  return {
    state: typeof source.state === 'string' ? source.state : 'unavailable',
    results,
    counts: {
      total: Number.isFinite(Number(counts.total)) ? Number(counts.total) : results.length,
      returned: Number.isFinite(Number(counts.returned)) ? Number(counts.returned) : results.length,
      sources: Number.isFinite(Number(counts.sources)) ? Number(counts.sources) : 0,
    },
    options: source.options && typeof source.options === 'object' && !Array.isArray(source.options)
      ? source.options
      : {},
    sequence,
    selectedResultId: projectSearchState.selectedResultId,
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    stale: source.stale === true,
    truncated: source.truncated === true,
  };
}

function setProjectSearchStatus(message) {
  if (projectSearchStatusElement) {
    projectSearchStatusElement.textContent = message;
  }
}

function getProjectSearchPayload(query) {
  const descriptor = getNavigatorSelectionDescriptor();
  const selectedNodeIds = Array.isArray(descriptor.selectedIds) ? descriptor.selectedIds : [];
  const scope = projectSearchScopeSelect instanceof HTMLSelectElement
    ? projectSearchScopeSelect.value
    : 'project';
  return {
    projectId: currentProjectId,
    query: String(query || ''),
    scope,
    caseSensitive: projectSearchCaseCheckbox instanceof HTMLInputElement
      ? projectSearchCaseCheckbox.checked
      : false,
    wholeWord: projectSearchWholeWordCheckbox instanceof HTMLInputElement
      ? projectSearchWholeWordCheckbox.checked
      : false,
    activeNodeId: currentDocumentId || descriptor.activeDocumentId || '',
    scopeNodeId: descriptor.focusedId || currentDocumentId || '',
    selectedNodeIds,
    limit: 100,
  };
}

function renderProjectSearchLeftResults() {
  if (!searchResultsElement) return;
  searchResultsElement.innerHTML = '';
  const query = leftSearchInput ? leftSearchInput.value.trim() : '';
  if (!query) {
    const empty = document.createElement('div');
    empty.className = 'tree__empty';
    empty.textContent = 'Введите запрос';
    searchResultsElement.appendChild(empty);
    return;
  }
  if (projectSearchState.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'tree__empty';
    loading.textContent = 'Ищу...';
    searchResultsElement.appendChild(loading);
    return;
  }
  if (projectSearchState.results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tree__empty';
    empty.textContent = projectSearchState.state === 'unavailable' ? 'Поиск недоступен' : 'Нет совпадений';
    searchResultsElement.appendChild(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'tree__list project-search-left-list';
  projectSearchState.results.slice(0, 24).forEach((result) => {
    const li = document.createElement('li');
    li.className = 'tree__node project-search-left-list__item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-search-left-list__button';
    button.dataset.searchResultId = result.id || '';
    button.textContent = `${result.source?.title || result.title || 'Источник'} - ${result.preview?.matchText || ''}`;
    li.appendChild(button);
    list.appendChild(li);
  });
  searchResultsElement.appendChild(list);
}

function renderProjectSearchCentralResults() {
  if (!projectSearchResultsElement) return;
  projectSearchResultsElement.innerHTML = '';
  const query = leftSearchInput ? leftSearchInput.value.trim() : '';
  if (!query) {
    const empty = document.createElement('div');
    empty.className = 'project-search-workspace__empty';
    empty.textContent = 'Введите запрос слева, чтобы найти текст в рукописи, заметках и аннотациях.';
    projectSearchResultsElement.appendChild(empty);
    setProjectSearchStatus('Введите запрос');
    return;
  }
  if (projectSearchState.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'project-search-workspace__empty';
    loading.textContent = 'Идёт поиск. Старые результаты не будут показаны поверх нового запроса.';
    projectSearchResultsElement.appendChild(loading);
    setProjectSearchStatus('Поиск...');
    return;
  }
  if (projectSearchState.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'project-search-workspace__empty';
    unavailable.textContent = `Поиск сейчас недоступен: ${projectSearchState.unavailableReason || 'нужно безопасно перечитать проект'}. Данные не изменены.`;
    projectSearchResultsElement.appendChild(unavailable);
    setProjectSearchStatus('Недоступен');
    return;
  }
  if (projectSearchState.results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'project-search-workspace__empty';
    empty.textContent = 'Совпадений нет. Проект не изменялся.';
    projectSearchResultsElement.appendChild(empty);
    setProjectSearchStatus('0 совпадений');
    return;
  }
  const summary = document.createElement('div');
  summary.className = 'project-search-workspace__summary';
  const summaryText = document.createElement('span');
  summaryText.textContent = `${projectSearchState.counts.returned} из ${projectSearchState.counts.total} совпадений`;
  summary.appendChild(summaryText);
  const replaceableCount = projectSearchState.results.filter((result) => {
    return result?.source?.type === 'document' && result?.source?.kind === 'scene' && result?.source?.field === 'body';
  }).length;
  if (replaceableCount > 1) {
    const replaceAllButton = document.createElement('button');
    replaceAllButton.type = 'button';
    replaceAllButton.className = 'project-search-workspace__mass-replace';
    replaceAllButton.dataset.projectSearchReplaceAll = 'true';
    replaceAllButton.textContent = 'Заменить показанные';
    summary.appendChild(replaceAllButton);
  }
  projectSearchResultsElement.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'project-search-results';
  projectSearchState.results.forEach((result) => {
    const item = document.createElement('div');
    item.className = 'project-search-result';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'project-search-result__open';
    openButton.dataset.searchResultId = result.id || '';
    const title = document.createElement('span');
    title.className = 'project-search-result__title';
    title.textContent = result.source?.title || result.title || 'Источник';
    const meta = document.createElement('span');
    meta.className = 'project-search-result__meta';
    meta.textContent = [result.source?.scope, result.source?.kind, result.source?.field]
      .filter(Boolean)
      .join(' / ');
    const preview = document.createElement('span');
    preview.className = 'project-search-result__preview';
    preview.textContent = result.preview?.text || '';
    openButton.append(title, meta, preview);
    item.appendChild(openButton);
    if (result.source?.type === 'document' && result.source?.kind === 'scene' && result.source?.field === 'body') {
      const replaceButton = document.createElement('button');
      replaceButton.type = 'button';
      replaceButton.className = 'project-search-result__replace';
      replaceButton.dataset.replaceSearchResultId = result.id || '';
      replaceButton.textContent = 'Заменить';
      item.appendChild(replaceButton);
    }
    list.appendChild(item);
  });
  projectSearchResultsElement.appendChild(list);
  setProjectSearchStatus(projectSearchState.truncated ? 'Показан лимит' : 'Готово');
}

function renderProjectSearchResults() {
  renderProjectSearchLeftResults();
  renderProjectSearchCentralResults();
}

async function refreshProjectSearchResults(query = '') {
  const sequence = projectSearchState.sequence + 1;
  projectSearchState = {
    ...projectSearchState,
    state: query.trim() ? 'loading' : 'empty',
    results: [],
    sequence,
  };
  renderProjectSearchResults();
  if (!query.trim()) return;
  const result = await invokeWorkspaceQueryBridge(PROJECT_SEARCH_QUERY_ID, getProjectSearchPayload(query));
  if (sequence !== projectSearchState.sequence) return;
  projectSearchState = normalizeProjectSearchReadModel(result, sequence);
  renderProjectSearchResults();
}

function scheduleProjectSearchResults(query = '') {
  if (projectSearchRefreshTimer) {
    window.clearTimeout(projectSearchRefreshTimer);
  }
  projectSearchRefreshTimer = window.setTimeout(() => {
    projectSearchRefreshTimer = null;
    void refreshProjectSearchResults(query);
  }, 120);
}

function renderSearchResults(query = '') {
  if (currentLeftTab !== 'search') {
    renderProjectSearchResults();
    return;
  }
  scheduleProjectSearchResults(query);
}

function getProjectSearchResultById(resultId) {
  const normalized = typeof resultId === 'string' ? resultId : '';
  if (!normalized) return null;
  return projectSearchState.results.find((result) => result && result.id === normalized) || null;
}

function applyPendingProjectSearchJump(documentId) {
  if (!pendingProjectSearchJump || pendingProjectSearchJump.nodeId !== documentId) return;
  const jump = pendingProjectSearchJump;
  pendingProjectSearchJump = null;
  if (!Number.isFinite(jump.from) || !Number.isFinite(jump.to) || jump.to < jump.from) return;
  requestAnimationFrame(() => {
    focusEditorSurface('current');
    setSelectionRange(jump.from, jump.to);
  });
}

async function activateProjectSearchResult(resultId) {
  const result = getProjectSearchResultById(resultId);
  if (!result) return;
  const source = result.source && typeof result.source === 'object' && !Array.isArray(result.source)
    ? result.source
    : {};
  if (source.type === 'note' && source.noteId) {
    notesWorkspaceState = {
      ...notesWorkspaceState,
      selectedId: source.noteId,
    };
    applyLeftTab('notes');
    updateStatusText('Заметка открыта');
    return;
  }
  if (source.nodeId) {
    pendingProjectSearchJump = {
      nodeId: source.nodeId,
      from: Number(result.preview?.from),
      to: Number(result.preview?.to),
    };
    const opened = await openDocumentNode({
      nodeId: source.nodeId,
      id: source.nodeId,
      kind: source.kind || result.kind || 'scene',
      label: source.title || result.title || '',
      name: source.title || result.title || '',
    });
    if (opened) {
      applyLeftTab('project');
      updateStatusText('Источник открыт');
    } else {
      pendingProjectSearchJump = null;
      updateStatusText('Источник недоступен');
    }
    return;
  }
  if (source.type === 'annotation') {
    applyMode('review');
    void dispatchUiCommand(EXTRA_COMMAND_IDS.REVIEW_OPEN_COMMENTS);
    updateStatusText('Аннотация открыта');
  }
}

async function replaceProjectSearchResult(resultId) {
  const result = getProjectSearchResultById(resultId);
  if (!result) return;
  const source = result.source && typeof result.source === 'object' && !Array.isArray(result.source)
    ? result.source
    : {};
  if (source.type !== 'document' || source.kind !== 'scene' || source.field !== 'body') {
    updateStatusText('Можно заменить только текст сцены');
    return;
  }
  const expectedText = typeof result.preview?.matchText === 'string' ? result.preview.matchText : '';
  if (!expectedText) {
    updateStatusText('Нет точного фрагмента для замены');
    return;
  }
  if (typeof window.prompt !== 'function') {
    updateStatusText('Замена недоступна');
    return;
  }
  const replacementText = window.prompt('Заменить найденный фрагмент на:', expectedText);
  if (replacementText === null) return;
  const bridgeResult = await invokePreloadUiCommandBridge(EXTRA_COMMAND_IDS.EDIT_REPLACE_SINGLE_SAFE, {
    requestId: `replace-single-safe-${Date.now()}`,
    projectId: currentProjectId,
    searchResultId: result.id || '',
    source: {
      type: source.type || '',
      nodeId: source.nodeId || '',
      kind: source.kind || '',
      field: source.field || '',
      contentHash: source.contentHash || '',
    },
    range: {
      from: Number(result.preview?.from),
      to: Number(result.preview?.to),
    },
    expectedText,
    replacementText,
  });
  const value = bridgeResult && bridgeResult.ok === true && bridgeResult.value && typeof bridgeResult.value === 'object'
    ? bridgeResult.value
    : null;
  if (value && value.ok === true) {
    updateStatusText(value.applied === true ? 'Замена применена' : 'Замена не изменила текст');
    await refreshProjectSearchResults(leftSearchInput ? leftSearchInput.value : '');
    return;
  }
  const reason = value?.reason || bridgeResult?.reason || 'REPLACE_SINGLE_SAFE_FAILED';
  updateStatusText(reason === 'REPLACE_SINGLE_SAFE_AMBIGUOUS_MATCH'
    ? 'Замена заблокирована: найдено несколько таких фрагментов'
    : 'Замена заблокирована: результат устарел или небезопасен');
}

function getReplaceableProjectSearchResults() {
  return projectSearchState.results.filter((result) => {
    return result?.source?.type === 'document'
      && result?.source?.kind === 'scene'
      && result?.source?.field === 'body'
      && typeof result?.preview?.matchText === 'string'
      && result.preview.matchText.length > 0;
  });
}

function buildReplaceMassResultPayload(result) {
  const source = result.source && typeof result.source === 'object' && !Array.isArray(result.source)
    ? result.source
    : {};
  return {
    searchResultId: result.id || '',
    source: {
      type: source.type || '',
      nodeId: source.nodeId || '',
      kind: source.kind || '',
      title: source.title || '',
      field: source.field || '',
      contentHash: source.contentHash || '',
    },
    range: {
      from: Number(result.preview?.from),
      to: Number(result.preview?.to),
    },
    expectedText: result.preview?.matchText || '',
  };
}

async function replaceVisibleProjectSearchResults() {
  const results = getReplaceableProjectSearchResults();
  if (results.length < 2) {
    updateStatusText('Для массовой замены нужно несколько совпадений в сценах');
    return;
  }
  if (typeof window.prompt !== 'function' || typeof window.confirm !== 'function') {
    updateStatusText('Массовая замена недоступна');
    return;
  }
  const replacementText = window.prompt('Заменить все показанные совпадения на:', '');
  if (replacementText === null) return;
  const payload = {
    requestId: `replace-mass-${Date.now()}`,
    projectId: currentProjectId,
    replacementText,
    results: results.map(buildReplaceMassResultPayload),
  };
  const previewBridgeResult = await invokePreloadUiCommandBridge(EXTRA_COMMAND_IDS.EDIT_REPLACE_MASS_PREVIEW, payload);
  const preview = previewBridgeResult && previewBridgeResult.ok === true && previewBridgeResult.value && typeof previewBridgeResult.value === 'object'
    ? previewBridgeResult.value
    : null;
  if (!preview || preview.ok !== true || !preview.plan) {
    updateStatusText('Массовая замена заблокирована: результаты устарели');
    return;
  }
  const scenes = Number(preview.plan?.totals?.scenes) || 0;
  const operations = Number(preview.plan?.totals?.operations) || 0;
  const confirmed = window.confirm(`Будет изменено сцен: ${scenes}. Замен: ${operations}. Продолжить?`);
  if (!confirmed) {
    updateStatusText('Массовая замена отменена');
    return;
  }
  const applyBridgeResult = await invokePreloadUiCommandBridge(EXTRA_COMMAND_IDS.EDIT_REPLACE_MASS_APPLY, {
    ...payload,
    confirmed: true,
    previewPlan: preview.plan,
  });
  const applied = applyBridgeResult && applyBridgeResult.ok === true && applyBridgeResult.value && typeof applyBridgeResult.value === 'object'
    ? applyBridgeResult.value
    : null;
  if (applied && applied.ok === true && applied.applied === true) {
    updateStatusText(`Массовая замена применена: ${operations}`);
    await refreshProjectSearchResults(leftSearchInput ? leftSearchInput.value : '');
    return;
  }
  updateStatusText('Массовая замена отклонена или откатана');
}

function applyLeftTab(tab) {
  const wasNotesWorkspaceVisible = notesWorkspace instanceof HTMLElement && notesWorkspace.hidden !== true;
  const wasSearchWorkspaceVisible = projectSearchWorkspace instanceof HTMLElement && projectSearchWorkspace.hidden !== true;
  currentLeftTab = tab;
  for (const button of leftTabButtons) {
    const active = button.dataset.leftTab === tab;
    button.classList.toggle('is-active', active);
    button.tabIndex = active ? 0 : -1;
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  if (treeContainer) treeContainer.hidden = tab !== 'project';
  if (outlineListElement) outlineListElement.hidden = tab !== 'outline';
  if (notesLeftListElement) notesLeftListElement.hidden = tab !== 'notes';
  if (searchResultsElement) searchResultsElement.hidden = tab !== 'search';
  if (leftSearchPanel) leftSearchPanel.hidden = tab !== 'search';
  if (leftRailProjectControls) leftRailProjectControls.hidden = tab !== 'project';
  if (leftRailSummary) leftRailSummary.hidden = tab !== 'project';
  if (tab === 'outline') {
    hideNotesWorkspace();
    hideProjectSearchWorkspace();
    renderOutlineList();
  }
  if (tab === 'notes') {
    hideProjectSearchWorkspace();
    showNotesWorkspace();
  } else if (tab === 'search') {
    hideNotesWorkspace();
    showProjectSearchWorkspace();
  } else if (tab !== 'outline') {
    hideNotesWorkspace();
    hideProjectSearchWorkspace();
  }
  if (tab !== 'notes' && tab !== 'search' && (wasNotesWorkspaceVisible || wasSearchWorkspaceVisible)) {
    if (currentDocumentId) {
      showEditorPanelFor('');
    } else {
      collapseSelection();
    }
  }
  if (tab === 'search') {
    renderSearchResults(leftSearchInput ? leftSearchInput.value : '');
  }
}

function ensureCommandsOpenerInRightInspectorSurface() {
  if (!rightInspectorPanel) return null;
  const actionsHost = rightInspectorPanel.querySelector('.x101-action-buttons');
  if (!actionsHost) return null;

  let commandsButton = actionsHost.querySelector('[data-action="open-command-palette"]');
  if (!commandsButton) {
    commandsButton = document.createElement('button');
    commandsButton.type = 'button';
    commandsButton.className = 'toolbar__button toolbar__button--wide x101-action-button';
    commandsButton.dataset.action = 'open-command-palette';
    commandsButton.textContent = 'Commands';
    const settingsButton = actionsHost.querySelector('[data-action="open-settings"]');
    if (settingsButton) {
      actionsHost.insertBefore(commandsButton, settingsButton);
    } else {
      actionsHost.prepend(commandsButton);
    }
  }

  commandsButton.hidden = false;
  commandsButton.disabled = false;
  if (!commandsButton.textContent || !commandsButton.textContent.trim()) {
    commandsButton.textContent = 'Commands';
  }
  return commandsButton;
}

function normalizeRightTab(tab) {
  if (tab === 'atlas') return 'atlas';
  if (tab === 'history') return 'history';
  if (tab === 'comments') return 'comments';
  return 'inspector';
}

function normalizeAtlasSurface(surfaceId) {
  const normalized = typeof surfaceId === 'string' ? surfaceId.trim() : '';
  return ATLAS_SURFACE_IDS.includes(normalized) ? normalized : 'currentScene';
}

function isAtlasSurfaceActive(surfaceId) {
  return normalizeAtlasSurface(surfaceId) === currentAtlasSurface;
}

function getAtlasResolvedSurfaceBinding(surfaceId) {
  return getAtlasFeatureSurfaceBinding(ATLAS_DESIGN_OS_SLOT_RESOLUTION, normalizeAtlasSurface(surfaceId));
}

function applyAtlasResolvedSurfaceBinding(surfaceId, host, providerDatasetName) {
  const binding = getAtlasResolvedSurfaceBinding(surfaceId);
  if (!(host instanceof HTMLElement) || !binding) return '';
  applyAtlasFeatureSurfaceBinding(host, binding, { providerDatasetName });
  return binding.providerId;
}

function syncAtlasSurfaceCompositionState() {
  const activeSurface = normalizeAtlasSurface(currentAtlasSurface);
  currentAtlasSurface = activeSurface;
  const activeProvider = ATLAS_SURFACE_PROVIDER_BY_ID[activeSurface] || ATLAS_CURRENT_SCENE_QUERY_ID;
  if (rightAtlasPanel instanceof HTMLElement) {
    rightAtlasPanel.dataset.activeAtlasSurface = activeSurface;
    rightAtlasPanel.dataset.activeAtlasProvider = activeProvider;
  }
  for (const button of atlasSurfaceButtons) {
    if (!(button instanceof HTMLElement)) continue;
    const active = button.dataset.atlasSurfaceButton === activeSurface;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  }
  for (const shell of atlasSurfaceShells) {
    if (!(shell instanceof HTMLElement)) continue;
    const active = shell.dataset.atlasSurfaceShell === activeSurface;
    shell.hidden = !active;
    shell.dataset.atlasSurfaceActive = active ? 'true' : 'false';
  }
  syncAtlasReachabilityOpenerState();
}

function refreshActiveAtlasSurface() {
  if (currentRightTab !== 'atlas') return;
  const surface = normalizeAtlasSurface(currentAtlasSurface);
  syncAtlasSurfaceCompositionState();
  if (surface === 'journey') {
    renderAtlasJourneyState();
    void refreshAtlasCurrentScene({ force: true }).finally(() => renderAtlasJourneyState());
    return;
  }
  if (surface === 'manualMap') {
    refreshManualMapWorkbench();
    return;
  }
  if (surface === 'projection') {
    refreshProjectionInspector();
    return;
  }
  if (surface === 'overview') {
    refreshAtlasOverview();
    return;
  }
  if (surface === 'entity') {
    refreshAtlasEntityDossier();
    return;
  }
  if (surface === 'relation') {
    refreshAtlasRelationDossier();
    return;
  }
  if (surface === 'matrices') {
    refreshAtlasMatrices();
    return;
  }
  if (surface === 'reports') {
    refreshAtlasReportsSavedQueries();
    return;
  }
  if (surface === 'diagnostics') {
    refreshAtlasDiagnosticsStageAcceptance();
    return;
  }
  if (surface === 'heatmap') {
    atlasHeatmapExplicitOpen = true;
    renderAtlasHeatmapState();
    refreshAtlasHeatmap();
    return;
  }
  if (surface === 'temporal') {
    atlasTemporalLayoutExplicitOpen = true;
    renderAtlasTemporalLayoutState();
    refreshAtlasTemporalLayout();
    return;
  }
  if (surface === 'continuity') {
    atlasContinuityLedgerExplicitOpen = true;
    renderAtlasContinuityLedgerState();
    refreshAtlasContinuityLedgerSurface();
    return;
  }
  refreshAtlasCurrentScene();
}

function setCurrentAtlasSurface(surfaceId, options = {}) {
  currentAtlasSurface = normalizeAtlasSurface(surfaceId);
  if (ATLAS_DEFERRED_SURFACE_IDS.includes(currentAtlasSurface)) {
    if (currentAtlasSurface === 'heatmap') atlasHeatmapExplicitOpen = true;
    if (currentAtlasSurface === 'temporal') atlasTemporalLayoutExplicitOpen = true;
    if (currentAtlasSurface === 'continuity') atlasContinuityLedgerExplicitOpen = true;
  }
  syncAtlasSurfaceCompositionState();
  if (options.focus === true) {
    const button = atlasSurfaceButtons.find((item) => item instanceof HTMLElement && item.dataset.atlasSurfaceButton === currentAtlasSurface);
    requestAnimationFrame(() => button?.focus({ preventScroll: true }));
  }
  if (options.refresh !== false) {
    refreshActiveAtlasSurface();
  }
}

function syncInspectorStateSurface() {
  const commentsActive = currentRightTab === 'comments';
  if (inspectorCommentsAction) {
    inspectorCommentsAction.classList.toggle('is-active', commentsActive);
    inspectorCommentsAction.setAttribute('aria-pressed', commentsActive ? 'true' : 'false');
  }
  if (inspectorFocusStatus) {
    const focusActive = document.body.classList.contains('focus-mode');
    inspectorFocusStatus.dataset.state = focusActive ? 'on' : 'off';
    inspectorFocusStatus.textContent = focusActive ? 'Вкл' : 'Выкл';
  }
}

function syncRightRailCompositionState(tab) {
  const providerId = RIGHT_RAIL_SURFACE_PROVIDERS[tab] || RIGHT_RAIL_SURFACE_PROVIDERS.inspector;
  if (rightTabsHost instanceof HTMLElement) {
    rightTabsHost.dataset.activeRightTab = tab;
    rightTabsHost.dataset.activeRightProvider = providerId;
  }
  for (const button of rightTabButtons) {
    const active = button.dataset.rightTab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  }
  if (rightInspectorPanel instanceof HTMLElement) {
    rightInspectorPanel.hidden = tab !== 'inspector';
    rightInspectorPanel.dataset.rightSurfaceProvider = RIGHT_RAIL_SURFACE_PROVIDERS.inspector;
  }
  if (rightCommentsPanel instanceof HTMLElement) {
    rightCommentsPanel.hidden = tab !== 'comments';
    rightCommentsPanel.dataset.rightSurfaceProvider = RIGHT_RAIL_SURFACE_PROVIDERS.comments;
  }
  if (rightHistoryPanel instanceof HTMLElement) {
    rightHistoryPanel.hidden = tab !== 'history';
    rightHistoryPanel.dataset.rightSurfaceProvider = RIGHT_RAIL_SURFACE_PROVIDERS.history;
  }
  if (rightAtlasPanel instanceof HTMLElement) {
    rightAtlasPanel.hidden = tab !== 'atlas';
    rightAtlasPanel.dataset.rightSurfaceProvider = RIGHT_RAIL_SURFACE_PROVIDERS.atlas;
  }
  if (reviewSurfaceHost instanceof HTMLElement) {
    reviewSurfaceHost.dataset.reviewSurfaceProvider = RIGHT_RAIL_SURFACE_PROVIDERS.comments;
  }
  applyAtlasResolvedSurfaceBinding('journey', atlasJourneyHost, 'atlasJourneyProvider');
  applyAtlasResolvedSurfaceBinding('manualMap', manualMapWorkbenchHost, 'manualMapWorkbenchProvider');
  applyAtlasResolvedSurfaceBinding('projection', projectionInspectorHost, 'projectionInspectorProvider');
  applyAtlasResolvedSurfaceBinding('overview', atlasOverviewHost, 'atlasOverviewProvider');
  applyAtlasResolvedSurfaceBinding('entity', atlasEntityDossierHost, 'atlasEntityDossierProvider');
  applyAtlasResolvedSurfaceBinding('relation', atlasRelationDossierHost, 'atlasRelationDossierProvider');
  applyAtlasResolvedSurfaceBinding('matrices', atlasMatricesHost, 'atlasMatricesProvider');
  applyAtlasResolvedSurfaceBinding('heatmap', atlasHeatmapHost, 'atlasHeatmapProvider');
  applyAtlasResolvedSurfaceBinding('temporal', atlasTemporalLayoutHost, 'atlasTemporalLayoutProvider');
  applyAtlasResolvedSurfaceBinding('continuity', atlasContinuityLedgerHost, 'atlasContinuityLedgerProvider');
  applyAtlasResolvedSurfaceBinding('reports', atlasReportsHost, 'atlasReportsProvider');
  applyAtlasResolvedSurfaceBinding('diagnostics', atlasDiagnosticsHost, 'atlasDiagnosticsProvider');
  applyAtlasResolvedSurfaceBinding('currentScene', atlasCurrentSceneHost, 'atlasCurrentSceneProvider');
  syncAtlasSurfaceCompositionState();
  syncAtlasReachabilityOpenerState();
}

function applyRightTab(tab) {
  tab = normalizeRightTab(tab);
  currentRightTab = tab;
  syncRightRailCompositionState(tab);
  if (tab === 'inspector') {
    ensureCommandsOpenerInRightInspectorSurface();
    refreshMetadataInspector();
  } else if (tab === 'history') {
    refreshSceneHistory();
  } else if (tab === 'atlas') {
    refreshActiveAtlasSurface();
  }
  syncInspectorStateSurface();
  syncToolbarShellState();
}

function normalizeSceneHistoryReadModel(result = {}, sequence = sceneHistoryState.sequence) {
  if (!result || result.ok === false || typeof result !== 'object' || Array.isArray(result)) {
    return {
      state: 'unavailable',
      snapshots: [],
      selectedSnapshot: null,
      selectedSnapshotId: '',
      sequence,
      unavailableReason: 'SCENE_HISTORY_QUERY_FAILED',
    };
  }
  const snapshots = Array.isArray(result.snapshots) ? result.snapshots : [];
  const selectedSnapshot = result.selectedSnapshot && typeof result.selectedSnapshot === 'object' && !Array.isArray(result.selectedSnapshot)
    ? result.selectedSnapshot
    : null;
  return {
    ...result,
    snapshots,
    selectedSnapshot,
    selectedSnapshotId: selectedSnapshot?.snapshotId || sceneHistoryState.selectedSnapshotId || '',
    sequence,
    unavailableReason: typeof result.unavailableReason === 'string' ? result.unavailableReason : '',
    restoreReceiptId: sceneHistoryState.restoreReceiptId || '',
    restoreState: sceneHistoryState.restoreState || 'idle',
  };
}

function renderSceneHistoryState() {
  if (!(sceneHistoryHost instanceof HTMLElement)) return;
  const state = sceneHistoryState.state || 'empty';
  const snapshots = Array.isArray(sceneHistoryState.snapshots) ? sceneHistoryState.snapshots : [];
  const selected = sceneHistoryState.selectedSnapshot;
  sceneHistoryHost.dataset.sceneHistoryState = state;

  const buttonDisabled = !currentProjectId || !currentDocumentId || state === 'unavailable';
  const header = `
    <section class="right-rail-surface right-rail-surface--history-header">
      <div class="right-rail-section__label">История текста</div>
      <div class="right-rail-history-actions">
        <button
          type="button"
          class="right-rail-history-checkpoint"
          data-scene-history-checkpoint
          ${buttonDisabled ? 'disabled' : ''}
        >Снимок</button>
      </div>
    </section>
  `;

  if (state === 'empty') {
    sceneHistoryHost.innerHTML = `${header}<div class="right-rail-history-state">Откройте сцену, чтобы увидеть снимки текста.</div>`;
    return;
  }
  if (state === 'unavailable') {
    const reason = reviewSurfaceEscapeHtml(sceneHistoryState.unavailableReason || 'SCENE_HISTORY_UNAVAILABLE');
    sceneHistoryHost.innerHTML = `${header}<div class="right-rail-history-state right-rail-history-state--blocked">История текста недоступна.<span>${reason}</span></div>`;
    return;
  }
  if (snapshots.length === 0) {
    sceneHistoryHost.innerHTML = `${header}<div class="right-rail-history-state">Снимков пока нет. Ручной снимок создаёт точку восстановления перед дальнейшей правкой.</div>`;
    return;
  }

  const selectedId = selected?.snapshotId || sceneHistoryState.selectedSnapshotId || snapshots[0]?.snapshotId || '';
  const list = snapshots.map((snapshot) => {
    const active = snapshot.snapshotId === selectedId;
    const label = snapshot.createdAtUtc ? new Date(snapshot.createdAtUtc).toLocaleString('ru-RU') : snapshot.label;
    const changeLabel = snapshot.changedFromCurrent ? 'изменён' : 'без изменений';
    return `
      <button
        type="button"
        class="right-rail-history-item${active ? ' is-active' : ''}"
        data-scene-history-snapshot="${reviewSurfaceEscapeHtml(snapshot.snapshotId)}"
        aria-pressed="${active ? 'true' : 'false'}"
      >
        <span>${reviewSurfaceEscapeHtml(label)}</span>
        <small>${snapshot.readable ? changeLabel : 'не читается'}</small>
      </button>
    `;
  }).join('');

  const diff = selected?.diff || null;
  const canRestore = Boolean(selected?.readable && diff && diff.changed && selectedId);
  const undoMarkup = sceneHistoryState.restoreReceiptId
    ? `
      <button
        type="button"
        class="right-rail-history-checkpoint right-rail-history-checkpoint--undo"
        data-scene-history-restore-undo
      >Отменить</button>
    `
    : '';
  const diffMarkup = diff
    ? `
      <section class="right-rail-surface right-rail-surface--history-diff">
        <div class="right-rail-section__label">Diff</div>
        <div class="right-rail-history-delta">${diff.changed ? `${diff.deltaWords >= 0 ? '+' : ''}${diff.deltaWords} слов` : 'Без изменений'}</div>
        <pre class="right-rail-history-diff-block right-rail-history-diff-block--removed">${reviewSurfaceEscapeHtml(diff.removedPreview || '')}</pre>
        <pre class="right-rail-history-diff-block right-rail-history-diff-block--inserted">${reviewSurfaceEscapeHtml(diff.insertedPreview || '')}</pre>
        <div class="right-rail-history-restore-row">
          <button
            type="button"
            class="right-rail-history-restore"
            data-scene-history-restore
            ${canRestore ? '' : 'disabled'}
          >Восстановить</button>
          ${undoMarkup}
        </div>
      </section>
    `
    : '<div class="right-rail-history-state">Выбранный снимок нельзя прочитать.</div>';

  sceneHistoryHost.innerHTML = `${header}<div class="right-rail-history-list">${list}</div>${diffMarkup}`;
}

async function refreshSceneHistory(selectedSnapshotId = sceneHistoryState.selectedSnapshotId || '') {
  if (currentRightTab !== 'history' && selectedSnapshotId === sceneHistoryState.selectedSnapshotId) return;
  const sequence = sceneHistoryState.sequence + 1;
  sceneHistoryState = {
    ...sceneHistoryState,
    state: currentDocumentId ? 'loading' : 'empty',
    sequence,
  };
  renderSceneHistoryState();
  const result = await invokeWorkspaceQueryBridge(SCENE_HISTORY_QUERY_ID, {
    projectId: currentProjectId,
    nodeId: currentDocumentId || '',
    selectedSnapshotId,
  });
  if (sequence !== sceneHistoryState.sequence) return;
  sceneHistoryState = normalizeSceneHistoryReadModel(result, sequence);
  renderSceneHistoryState();
}

function normalizeAtlasOverview(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary) ? source.summary : {};
  const graphPreview = source.graphPreview && typeof source.graphPreview === 'object' && !Array.isArray(source.graphPreview) ? source.graphPreview : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'derived.atlas.overview.v1',
    state: typeof source.state === 'string' ? source.state : 'empty',
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    summary: {
      sceneCount: Number.isInteger(summary.sceneCount) ? Math.max(0, summary.sceneCount) : 0,
      entityCount: Number.isInteger(summary.entityCount) ? Math.max(0, summary.entityCount) : 0,
      observationCount: Number.isInteger(summary.observationCount) ? Math.max(0, summary.observationCount) : 0,
      activeObservationCount: Number.isInteger(summary.activeObservationCount) ? Math.max(0, summary.activeObservationCount) : 0,
      evidenceAnchorCount: Number.isInteger(summary.evidenceAnchorCount) ? Math.max(0, summary.evidenceAnchorCount) : 0,
      cooccurrencePairCount: Number.isInteger(summary.cooccurrencePairCount) ? Math.max(0, summary.cooccurrencePairCount) : 0,
      graphNodeCount: Number.isInteger(summary.graphNodeCount) ? Math.max(0, summary.graphNodeCount) : 0,
      graphEdgeCount: Number.isInteger(summary.graphEdgeCount) ? Math.max(0, summary.graphEdgeCount) : 0,
      graphClusterCount: Number.isInteger(summary.graphClusterCount) ? Math.max(0, summary.graphClusterCount) : 0,
      evidenceHealth: typeof summary.evidenceHealth === 'string' ? summary.evidenceHealth : 'empty',
      overviewHash: typeof summary.overviewHash === 'string' ? summary.overviewHash : '',
    },
    topEntities: Array.isArray(source.topEntities) ? source.topEntities.filter(reviewSurfaceIsPlainObject) : [],
    topRelations: Array.isArray(source.topRelations) ? source.topRelations.filter(reviewSurfaceIsPlainObject) : [],
    sceneCoverage: Array.isArray(source.sceneCoverage) ? source.sceneCoverage.filter(reviewSurfaceIsPlainObject) : [],
    graphPreview: {
      state: typeof graphPreview.state === 'string' ? graphPreview.state : 'empty',
      nodeCount: Number.isInteger(graphPreview.nodeCount) ? Math.max(0, graphPreview.nodeCount) : 0,
      edgeCount: Number.isInteger(graphPreview.edgeCount) ? Math.max(0, graphPreview.edgeCount) : 0,
      clusterCount: Number.isInteger(graphPreview.clusterCount) ? Math.max(0, graphPreview.clusterCount) : 0,
      omittedNodeCount: Number.isInteger(graphPreview.omittedNodeCount) ? Math.max(0, graphPreview.omittedNodeCount) : 0,
      omittedEdgeCount: Number.isInteger(graphPreview.omittedEdgeCount) ? Math.max(0, graphPreview.omittedEdgeCount) : 0,
      clusters: Array.isArray(graphPreview.clusters) ? graphPreview.clusters.filter(reviewSurfaceIsPlainObject) : [],
    },
    degradedCapabilities: Array.isArray(source.degradedCapabilities) ? source.degradedCapabilities.filter(reviewSurfaceIsPlainObject) : [],
  };
}

function appendAtlasOverviewMetric(parent, label, value, state = '') {
  const item = document.createElement('div');
  item.className = 'right-rail-atlas-overview-metric';
  if (state) item.dataset.state = state;
  const valueElement = document.createElement('strong');
  valueElement.textContent = String(value);
  const labelElement = document.createElement('span');
  labelElement.textContent = label;
  item.append(valueElement, labelElement);
  parent.appendChild(item);
  return item;
}

function appendAtlasOverviewRow(parent, primary, secondary = '', tertiary = '') {
  const row = document.createElement('div');
  row.className = 'right-rail-atlas-overview-row';
  const main = document.createElement('span');
  main.className = 'right-rail-atlas-overview-row__main';
  main.textContent = primary;
  row.appendChild(main);
  if (secondary) {
    const meta = document.createElement('span');
    meta.className = 'right-rail-atlas-overview-row__meta';
    meta.textContent = secondary;
    row.appendChild(meta);
  }
  if (tertiary) {
    const tag = document.createElement('span');
    tag.className = 'right-rail-atlas-overview-row__tag';
    tag.textContent = tertiary;
    row.appendChild(tag);
  }
  parent.appendChild(row);
  return row;
}

function appendAtlasOverviewSection(parent, title, options = {}) {
  const section = document.createElement('details');
  section.className = 'right-rail-atlas-overview-section';
  section.open = options.open === true;
  const summary = document.createElement('summary');
  summary.textContent = title;
  const body = document.createElement('div');
  body.className = 'right-rail-atlas-overview-section__body';
  section.append(summary, body);
  parent.appendChild(section);
  return body;
}

function normalizeManualMapWorkbench(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary) ? source.summary : {};
  const graph = source.graph && typeof source.graph === 'object' && !Array.isArray(source.graph) ? source.graph : {};
  const listParity = source.listParity && typeof source.listParity === 'object' && !Array.isArray(source.listParity) ? source.listParity : {};
  const counts = listParity.counts && typeof listParity.counts === 'object' && !Array.isArray(listParity.counts) ? listParity.counts : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'surface.manualMap.workbench.v1',
    state: typeof source.state === 'string' ? source.state : 'empty',
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    mapId: typeof source.mapId === 'string' ? source.mapId : '',
    mapRows: Array.isArray(source.mapRows) ? source.mapRows.filter(reviewSurfaceIsPlainObject) : [],
    graph: {
      schemaVersion: typeof graph.schemaVersion === 'string' ? graph.schemaVersion : 'derived.manualMap.graph.v1',
      projectId: typeof graph.projectId === 'string' ? graph.projectId : '',
      mapId: typeof graph.mapId === 'string' ? graph.mapId : '',
      title: typeof graph.title === 'string' ? graph.title : '',
      nodes: Array.isArray(graph.nodes) ? graph.nodes.filter(reviewSurfaceIsPlainObject) : [],
      edges: Array.isArray(graph.edges) ? graph.edges.filter(reviewSurfaceIsPlainObject) : [],
      groups: Array.isArray(graph.groups) ? graph.groups.filter(reviewSurfaceIsPlainObject) : [],
      attachments: Array.isArray(graph.attachments) ? graph.attachments.filter(reviewSurfaceIsPlainObject) : [],
      portals: Array.isArray(graph.portals) ? graph.portals.filter(reviewSurfaceIsPlainObject) : [],
      templates: Array.isArray(graph.templates) ? graph.templates.filter(reviewSurfaceIsPlainObject) : [],
      meta: graph.meta && typeof graph.meta === 'object' && !Array.isArray(graph.meta) ? graph.meta : {},
    },
    listParity: {
      rows: Array.isArray(listParity.rows) ? listParity.rows.filter(reviewSurfaceIsPlainObject) : [],
      counts: {
        rows: Number.isInteger(counts.rows) ? Math.max(0, counts.rows) : 0,
        nodes: Number.isInteger(counts.nodes) ? Math.max(0, counts.nodes) : 0,
        edges: Number.isInteger(counts.edges) ? Math.max(0, counts.edges) : 0,
        groups: Number.isInteger(counts.groups) ? Math.max(0, counts.groups) : 0,
      },
      meta: listParity.meta && typeof listParity.meta === 'object' && !Array.isArray(listParity.meta) ? listParity.meta : {},
    },
    summary: {
      mapCount: Number.isInteger(summary.mapCount) ? Math.max(0, summary.mapCount) : 0,
      nodeCount: Number.isInteger(summary.nodeCount) ? Math.max(0, summary.nodeCount) : 0,
      edgeCount: Number.isInteger(summary.edgeCount) ? Math.max(0, summary.edgeCount) : 0,
      groupCount: Number.isInteger(summary.groupCount) ? Math.max(0, summary.groupCount) : 0,
      listRowCount: Number.isInteger(summary.listRowCount) ? Math.max(0, summary.listRowCount) : 0,
      workbenchHash: typeof summary.workbenchHash === 'string' ? summary.workbenchHash : '',
    },
  };
}

function manualMapText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function manualMapNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cloneManualMapJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function getManualMapGraph(state = manualMapWorkbenchState) {
  const normalized = normalizeManualMapWorkbench(state);
  return normalized.graph || { nodes: [], edges: [], groups: [] };
}

function buildManualMapHierarchyPresentationGraph(graph) {
  const source = graph && typeof graph === 'object' && !Array.isArray(graph) ? graph : {};
  const nodes = Array.isArray(source.nodes) ? source.nodes : [];
  const edges = Array.isArray(source.edges) ? source.edges : [];
  if (manualMapLayoutMode !== MANUAL_MAP_LAYOUT_MODES.HIERARCHY || nodes.length < 1) {
    return cloneManualMapJson(source);
  }
  const nodeIds = new Set(nodes.map((node) => manualMapText(node?.id)).filter(Boolean));
  const childrenByNode = new Map();
  const incoming = new Map();
  for (const node of nodes) {
    const nodeId = manualMapText(node?.id);
    if (!nodeId) continue;
    childrenByNode.set(nodeId, []);
    incoming.set(nodeId, 0);
  }
  for (const edge of edges) {
    const from = manualMapText(edge?.from);
    const to = manualMapText(edge?.to);
    if (!nodeIds.has(from) || !nodeIds.has(to)) continue;
    childrenByNode.get(from)?.push(to);
    incoming.set(to, (incoming.get(to) || 0) + 1);
  }
  const roots = nodes
    .map((node) => manualMapText(node?.id))
    .filter((nodeId) => nodeId && (incoming.get(nodeId) || 0) === 0);
  const orderedRoots = roots.length ? roots : nodes.map((node) => manualMapText(node?.id)).filter(Boolean).slice(0, 1);
  const depthByNode = new Map();
  const visited = new Set();
  const queue = orderedRoots.map((nodeId, index) => ({ nodeId, depth: 0, order: index }));
  const orderByNode = new Map(queue.map((entry) => [entry.nodeId, entry.order]));
  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry || visited.has(entry.nodeId)) continue;
    visited.add(entry.nodeId);
    depthByNode.set(entry.nodeId, entry.depth);
    orderByNode.set(entry.nodeId, orderByNode.has(entry.nodeId) ? orderByNode.get(entry.nodeId) : orderByNode.size);
    const children = childrenByNode.get(entry.nodeId) || [];
    children.forEach((childId) => {
      if (!visited.has(childId)) {
        queue.push({ nodeId: childId, depth: entry.depth + 1, order: orderByNode.size });
      }
    });
  }
  nodes.forEach((node) => {
    const nodeId = manualMapText(node?.id);
    if (nodeId && !depthByNode.has(nodeId)) {
      depthByNode.set(nodeId, 0);
      orderByNode.set(nodeId, orderByNode.size);
    }
  });
  const rowsByDepth = new Map();
  for (const nodeId of depthByNode.keys()) {
    const depth = depthByNode.get(nodeId) || 0;
    if (!rowsByDepth.has(depth)) rowsByDepth.set(depth, []);
    rowsByDepth.get(depth).push(nodeId);
  }
  for (const row of rowsByDepth.values()) {
    row.sort((a, b) => (orderByNode.get(a) || 0) - (orderByNode.get(b) || 0));
  }
  const positionByNode = new Map();
  const depthKeys = [...rowsByDepth.keys()].sort((a, b) => a - b);
  depthKeys.forEach((depth) => {
    const row = rowsByDepth.get(depth) || [];
    const startY = -((row.length - 1) * 92) / 2;
    row.forEach((nodeId, index) => {
      positionByNode.set(nodeId, {
        x: depth * 210,
        y: startY + index * 92,
      });
    });
  });
  return {
    ...cloneManualMapJson(source),
    nodes: nodes.map((node) => {
      const nodeId = manualMapText(node?.id);
      return {
        ...cloneManualMapJson(node),
        position: positionByNode.get(nodeId) || node?.position || { x: 0, y: 0 },
      };
    }),
  };
}

function filterManualMapGraphForWorkbench(graph) {
  const query = manualMapSearchQuery.trim().toLowerCase();
  if (!query) return graph;
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const groups = Array.isArray(graph.groups) ? graph.groups : [];
  const matchingNodeIds = new Set(nodes
    .filter((node) => {
      const haystack = `${manualMapText(node?.label)} ${manualMapText(node?.id)} ${manualMapText(node?.kind)} ${manualMapText(node?.target?.kind)} ${manualMapText(node?.target?.id)}`.toLowerCase();
      return haystack.includes(query);
    })
    .map((node) => manualMapText(node?.id))
    .filter(Boolean));
  const matchingEdgeIds = new Set(edges
    .filter((edge) => `${manualMapText(edge?.label)} ${manualMapText(edge?.id)} ${manualMapText(edge?.kind)} ${manualMapText(edge?.from)} ${manualMapText(edge?.to)}`.toLowerCase().includes(query))
    .map((edge) => manualMapText(edge?.id))
    .filter(Boolean));
  const matchingGroups = groups.filter((group) => `${manualMapText(group?.label)} ${manualMapText(group?.id)} ${manualMapText(group?.colorTag)}`.toLowerCase().includes(query));
  matchingGroups.forEach((group) => {
    (Array.isArray(group.nodeIds) ? group.nodeIds : []).forEach((nodeId) => matchingNodeIds.add(manualMapText(nodeId)));
  });
  edges.forEach((edge) => {
    const edgeId = manualMapText(edge?.id);
    if (matchingEdgeIds.has(edgeId)) {
      matchingNodeIds.add(manualMapText(edge?.from));
      matchingNodeIds.add(manualMapText(edge?.to));
    }
  });
  return {
    ...graph,
    nodes: nodes.filter((node) => matchingNodeIds.has(manualMapText(node?.id))),
    edges: edges.filter((edge) => matchingEdgeIds.has(manualMapText(edge?.id))
      || (matchingNodeIds.has(manualMapText(edge?.from)) && matchingNodeIds.has(manualMapText(edge?.to)))),
    groups: groups
      .map((group) => ({
        ...group,
        nodeIds: (Array.isArray(group.nodeIds) ? group.nodeIds : []).filter((nodeId) => matchingNodeIds.has(manualMapText(nodeId))),
      }))
      .filter((group) => group.nodeIds.length > 0),
  };
}

function buildManualMapWorkbenchRuntimeModel(state) {
  const sourceGraph = getManualMapGraph(state);
  const presentationGraph = filterManualMapGraphForWorkbench(buildManualMapHierarchyPresentationGraph(sourceGraph));
  manualMapTransientViewState = normalizeManualMapViewState({
    ...manualMapTransientViewState,
    viewport: {
      ...MANUAL_MAP_DEFAULT_VIEWPORT,
      ...(manualMapTransientViewState.viewport || {}),
    },
  }, presentationGraph);
  const layoutJob = createManualMapLayoutJob({
    graph: presentationGraph,
    viewState: manualMapTransientViewState,
    sequence: manualMapLayoutGeneration + 1,
    layoutKind: manualMapLayoutMode,
    limits: MANUAL_MAP_VIEWPORT_LIMITS,
  });
  let viewportPlan = buildManualMapViewportPlan({
    graph: presentationGraph,
    viewState: manualMapTransientViewState,
    limits: MANUAL_MAP_VIEWPORT_LIMITS,
  });
  let resourceBudgetProof = null;
  if (layoutJob.ok === true) {
    const layoutResult = runManualMapLayoutJob(layoutJob.value);
    const accepted = layoutResult.ok === true
      ? acceptManualMapLayoutResult({
        activeJob: layoutJob.value,
        result: layoutResult.value,
        currentGraph: presentationGraph,
      })
      : null;
    if (accepted?.ok === true) {
      manualMapLayoutGeneration = layoutJob.value.generation;
      viewportPlan = layoutResult.value.viewportPlan || viewportPlan;
      resourceBudgetProof = layoutResult.value.resourceBudgetProof || null;
    }
  }
  const listParity = buildManualMapListParityModel({
    graph: presentationGraph,
    viewState: manualMapTransientViewState,
    listState: manualMapListState,
  });
  manualMapListState = listParity.listState || manualMapListState;
  return {
    sourceGraph,
    presentationGraph,
    viewportPlan,
    resourceBudgetProof,
    listParity,
  };
}

function getManualMapNodeById(graph, nodeId) {
  return (Array.isArray(graph?.nodes) ? graph.nodes : []).find((node) => manualMapText(node?.id) === nodeId) || null;
}

function getManualMapEdgeById(graph, edgeId) {
  return (Array.isArray(graph?.edges) ? graph.edges : []).find((edge) => manualMapText(edge?.id) === edgeId) || null;
}

function getManualMapGroupByNodeId(graph, nodeId) {
  return (Array.isArray(graph?.groups) ? graph.groups : []).find((group) => {
    const nodeIds = Array.isArray(group?.nodeIds) ? group.nodeIds : [];
    return nodeIds.map(manualMapText).includes(nodeId);
  }) || null;
}

function manualMapNodePosition(node) {
  const position = node && typeof node.position === 'object' && !Array.isArray(node.position) ? node.position : {};
  return {
    x: manualMapNumber(position.x),
    y: manualMapNumber(position.y),
  };
}

function setManualMapViewIntent(intent, graph) {
  manualMapTransientViewState = reduceManualMapViewIntent(manualMapTransientViewState, intent, graph);
  renderManualMapWorkbenchState();
}

function getManualMapSelectedNodeId() {
  return manualMapText(manualMapTransientViewState.selection?.primaryNodeId)
    || manualMapText(manualMapTransientViewState.selection?.nodeIds?.[0]);
}

function getManualMapSelectedEdgeId() {
  return manualMapText(manualMapTransientViewState.selection?.edgeIds?.[0]);
}

function getManualMapSecondarySelectedNodeId() {
  const selectedIds = Array.isArray(manualMapTransientViewState.selection?.nodeIds)
    ? manualMapTransientViewState.selection.nodeIds.map(manualMapText).filter(Boolean)
    : [];
  return selectedIds[1] || selectedIds[0] || '';
}

async function runManualMapWorkbenchCommand(commandId, payload = {}) {
  await runProductJourneyCommand(commandId, payload);
  await refreshManualMapWorkbench({ force: true });
}

function unwrapManualMapProductCommandReceipt(result = {}) {
  const value = result && typeof result === 'object' && !Array.isArray(result)
    ? result.value
    : null;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.result && typeof value.result === 'object' && !Array.isArray(value.result)) return value.result;
    return value;
  }
  return {};
}

async function runManualMapExportCommand(commandId, payload = {}) {
  manualMapPortabilityCommandState = {
    ...manualMapPortabilityCommandState,
    status: 'running',
    lastCommandId: commandId,
  };
  renderManualMapWorkbenchState();
  const result = await runProductJourneyCommand(commandId, payload);
  if (result && result.ok === true) {
    const receipt = unwrapManualMapProductCommandReceipt(result);
    const exported = receipt.export || {};
    manualMapPortabilityCommandState = {
      ...manualMapPortabilityCommandState,
      status: 'exported',
      lastCommandId: commandId,
      exportMapId: receipt.mapId || payload.mapId || '',
      exportJsonSha256: exported.jsonSha256 || manualMapPortabilityCommandState.exportJsonSha256,
      imageEvidenceHash: exported.evidenceHash || manualMapPortabilityCommandState.imageEvidenceHash,
      pdfTypedLoss: exported.pdf?.typedLoss?.code || manualMapPortabilityCommandState.pdfTypedLoss,
    };
  } else {
    manualMapPortabilityCommandState = {
      ...manualMapPortabilityCommandState,
      status: result?.reason || result?.error?.reason || 'export_failed',
      lastCommandId: commandId,
    };
  }
  await refreshManualMapWorkbench({ force: true });
  renderManualMapWorkbenchState();
  return result;
}

function createManualMapCommandDraft(config = {}) {
  const payload = config.payload && typeof config.payload === 'object' && !Array.isArray(config.payload)
    ? { ...config.payload }
    : {};
  return {
    schemaVersion: 'manualMap.commandDraft.v1',
    state: 'draft',
    commandId: manualMapText(config.commandId),
    title: manualMapText(config.title, manualMapText(config.commandId, 'Manual Map command')),
    targetKind: manualMapText(config.targetKind, 'manualMap'),
    targetId: manualMapText(config.targetId || payload.nodeId || payload.edgeId || payload.groupId || payload.mapId),
    risk: manualMapText(config.risk, 'semantic'),
    payload,
    fields: Array.isArray(config.fields) ? config.fields.map((field) => ({ ...field })) : [],
    impactPreview: manualMapText(config.impactPreview, 'Preview unavailable'),
    confirmChecked: false,
    result: null,
  };
}

function openManualMapCommandDraft(config = {}) {
  manualMapCommandDraft = createManualMapCommandDraft(config);
  renderManualMapWorkbenchState();
}

function cancelManualMapCommandDraft() {
  if (!manualMapCommandDraft) return;
  manualMapCommandDraft = {
    ...manualMapCommandDraft,
    state: 'cancelled',
    result: {
      status: 'CANCELLED_NOOP',
      mutationDispatched: false,
    },
  };
  renderManualMapWorkbenchState();
}

function updateManualMapCommandDraftField(fieldName, fieldValue) {
  if (!manualMapCommandDraft) return;
  const name = manualMapText(fieldName);
  if (!name) return;
  manualMapCommandDraft = {
    ...manualMapCommandDraft,
    payload: {
      ...manualMapCommandDraft.payload,
      [name]: fieldValue,
    },
    fields: manualMapCommandDraft.fields.map((field) => (field.name === name ? { ...field, value: fieldValue } : field)),
    result: null,
  };
  renderManualMapWorkbenchState();
}

function setManualMapCommandDraftConfirmation(checked) {
  if (!manualMapCommandDraft) return;
  manualMapCommandDraft = {
    ...manualMapCommandDraft,
    confirmChecked: checked === true,
    result: null,
  };
  renderManualMapWorkbenchState();
}

async function applyManualMapCommandDraft() {
  const draft = manualMapCommandDraft;
  if (!draft || draft.state !== 'draft') return;
  const commandId = manualMapText(draft.commandId);
  const payload = draft.payload && typeof draft.payload === 'object' && !Array.isArray(draft.payload)
    ? { ...draft.payload }
    : {};
  if (!commandId || !manualMapText(payload.mapId) && commandId !== 'manualMap.create') {
    manualMapCommandDraft = {
      ...draft,
      result: { status: 'NOT_APPLIED', reason: 'MANUAL_MAP_TARGET_REQUIRED', mutationDispatched: false },
    };
    renderManualMapWorkbenchState();
    return;
  }
  if ((draft.risk === 'destructive' || draft.risk === 'structural') && draft.confirmChecked !== true) {
    manualMapCommandDraft = {
      ...draft,
      result: { status: 'NOT_APPLIED', reason: 'CONFIRMATION_REQUIRED', mutationDispatched: false },
    };
    renderManualMapWorkbenchState();
    return;
  }
  manualMapCommandDraft = { ...draft, state: 'applying', result: null };
  renderManualMapWorkbenchState();
  const result = await runProductJourneyCommand(commandId, payload);
  await refreshManualMapWorkbench({ force: true });
  const commandApplied = result && result.ok === true;
  const commandReason = commandApplied
    ? ''
    : manualMapText(result?.reason || result?.error?.reason || result?.error || 'NO_COMMAND_RESULT');
  if (commandApplied && commandId === 'manualMap.import.jsonRepeat') {
    const receipt = unwrapManualMapProductCommandReceipt(result);
    manualMapPortabilityCommandState = {
      ...manualMapPortabilityCommandState,
      status: 'imported',
      lastCommandId: commandId,
      importMapId: receipt.import?.mapId || receipt.mapId || payload.targetMapId || '',
    };
  }
  manualMapCommandDraft = {
    ...draft,
    state: commandApplied ? 'applied' : 'failed',
    result: {
      status: commandApplied ? 'APPLIED' : 'FAILED',
      mutationDispatched: commandApplied,
      commandId,
      reason: commandReason,
    },
  };
  renderManualMapWorkbenchState();
}

function makeManualMapDraftButton(label, draftFactory, optionsFactory = () => ({})) {
  const options = optionsFactory();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'right-rail-atlas-action manual-map-workspace__action';
  button.textContent = label;
  button.dataset.manualMapCommandDraft = 'true';
  button.disabled = options.disabled === true;
  if (options.reason) {
    button.title = options.reason;
    button.setAttribute('aria-label', `${label}. ${options.reason}`);
  }
  button.addEventListener('click', () => {
    if (button.disabled) return;
    openManualMapCommandDraft(draftFactory());
  });
  return button;
}

function renderManualMapToolbar(parent, state, runtime, options = {}) {
  const actionBar = document.createElement('div');
  actionBar.className = options.compact
    ? 'right-rail-atlas-action-bar'
    : 'manual-map-workspace__toolbar';
  const graph = runtime.presentationGraph;
  const sourceGraph = runtime.sourceGraph;
  const nodes = Array.isArray(sourceGraph.nodes) ? sourceGraph.nodes : [];
  const edges = Array.isArray(sourceGraph.edges) ? sourceGraph.edges : [];
  const groups = Array.isArray(sourceGraph.groups) ? sourceGraph.groups : [];
  const selectedNodeId = getManualMapSelectedNodeId();
  const selectedEdgeId = getManualMapSelectedEdgeId();
  const selectedNode = getManualMapNodeById(sourceGraph, selectedNodeId);
  const selectedEdge = getManualMapEdgeById(sourceGraph, selectedEdgeId);
  const selectedGroup = getManualMapGroupByNodeId(sourceGraph, selectedNodeId);
  const mapId = state.mapId || makeStableUiId('manual-map');
  actionBar.appendChild(makeManualMapDraftButton('Create map', () => {
    const draftMapId = makeStableUiId('manual-map');
    return {
      commandId: 'manualMap.create',
      title: 'Create map',
      targetKind: 'map',
      targetId: draftMapId,
      risk: 'structural',
      payload: {
        mapId: draftMapId,
        title: currentDocumentTitle || 'Manual map',
      },
      fields: [
        { name: 'title', label: 'Map title', type: 'text', value: currentDocumentTitle || 'Manual map' },
      ],
      impactPreview: 'Creates one Manual Map inside the current project. No scene text is changed.',
    };
  }, () => ({ disabled: !currentProjectId, reason: currentProjectId ? '' : 'Project is not open' })));
  actionBar.appendChild(makeManualMapDraftButton('Add node', () => {
    const nodeId = makeStableUiId('manual-node');
    return {
      commandId: 'manualMap.node.add',
      title: 'Add node',
      targetKind: 'node',
      targetId: nodeId,
      risk: 'semantic',
      payload: {
        mapId,
        nodeId,
        label: currentDocumentTitle || 'Node',
        nodeKind: 'note',
        position: { x: state.summary.nodeCount * 40, y: state.summary.nodeCount * 24 },
      },
      fields: [
        { name: 'label', label: 'Node label', type: 'text', value: currentDocumentTitle || 'Node' },
      ],
      impactPreview: `Adds one note node to ${mapId}. Existing nodes and scene text stay unchanged.`,
    };
  }, () => ({ disabled: !state.mapId, reason: state.mapId ? '' : 'Create a map first' })));
  actionBar.appendChild(makeManualMapDraftButton('Scene node', () => {
    const nodeId = makeStableUiId('manual-scene-node');
    return {
      commandId: 'manualMap.node.add',
      title: 'Add scene node',
      targetKind: 'node',
      targetId: nodeId,
      risk: 'semantic',
      payload: {
        mapId,
        nodeId,
        label: currentDocumentTitle || 'Scene',
        nodeKind: 'scene',
        targetKind: 'scene',
        targetId: currentDocumentId || '',
        position: { x: state.summary.nodeCount * 40, y: state.summary.nodeCount * 24 },
      },
      fields: [
        { name: 'label', label: 'Node label', type: 'text', value: currentDocumentTitle || 'Scene' },
      ],
      impactPreview: `Adds one node linked to scene ${currentDocumentId || 'none'}. The scene body is not edited.`,
    };
  }, () => ({ disabled: !state.mapId || !currentDocumentId, reason: currentDocumentId ? '' : 'No scene selected' })));
  actionBar.appendChild(makeManualMapDraftButton('Entity node', () => {
    const entity = findAtlasJourneyEntity(atlasJourneyDraft.sourceEntityId);
    const nodeId = makeStableUiId('manual-entity-node');
    return {
      commandId: 'manualMap.node.add',
      title: 'Add entity node',
      targetKind: 'node',
      targetId: nodeId,
      risk: 'semantic',
      payload: {
        mapId,
        nodeId,
        label: entity?.name || entity?.entityId || 'Entity',
        nodeKind: 'entity',
        targetKind: 'entity',
        targetId: entity?.entityId || '',
        position: { x: state.summary.nodeCount * 40, y: state.summary.nodeCount * 24 },
      },
      fields: [
        { name: 'label', label: 'Node label', type: 'text', value: entity?.name || entity?.entityId || 'Entity' },
      ],
      impactPreview: `Adds one node linked to Atlas entity ${entity?.entityId || 'none'}. Atlas entity truth is not rewritten.`,
    };
  }, () => {
    const entity = findAtlasJourneyEntity(atlasJourneyDraft.sourceEntityId);
    return { disabled: !state.mapId || !entity, reason: entity ? '' : 'Select an Atlas entity first' };
  }));
  actionBar.appendChild(makeManualMapDraftButton('Add edge', () => {
    const selectedIds = manualMapTransientViewState.selection?.nodeIds || [];
    return {
      commandId: 'manualMap.edge.add',
      title: 'Add edge',
      targetKind: 'edge',
      targetId: `${selectedIds[0] || ''}->${selectedIds[1] || ''}`,
      risk: 'semantic',
      payload: {
        mapId,
        edgeId: makeStableUiId('manual-edge'),
        fromNodeId: selectedIds[0] || '',
        toNodeId: selectedIds[1] || '',
        edgeKind: 'link',
        label: 'Link',
      },
      fields: [
        { name: 'label', label: 'Edge label', type: 'text', value: 'Link' },
      ],
      impactPreview: `Connects selected nodes ${selectedIds[0] || 'none'} and ${selectedIds[1] || 'none'}.`,
    };
  }, () => ({
    disabled: (manualMapTransientViewState.selection?.nodeIds || []).length < 2,
    reason: 'Select two nodes',
  })));
  actionBar.appendChild(makeManualMapDraftButton('Edit node', () => ({
    commandId: 'manualMap.node.update',
    title: 'Edit node',
    targetKind: 'node',
    targetId: selectedNodeId,
    risk: 'semantic',
    payload: {
      mapId,
      nodeId: selectedNodeId,
      label: selectedNode?.label || 'Node',
    },
    fields: [
      { name: 'label', label: 'Node label', type: 'text', value: selectedNode?.label || 'Node' },
    ],
    impactPreview: `Renames selected node ${selectedNodeId}. No other node is targeted.`,
  }), () => ({
    disabled: !selectedNode,
    reason: 'Select a node',
  })));
  actionBar.appendChild(makeManualMapDraftButton('Delete node', () => ({
    commandId: 'manualMap.node.delete',
    title: 'Delete node',
    targetKind: 'node',
    targetId: selectedNodeId,
    risk: 'destructive',
    payload: {
      mapId,
      nodeId: selectedNodeId,
    },
    impactPreview: `Deletes selected node ${selectedNodeId}. Command Kernel owns any related edge or group cleanup.`,
  }), () => ({
    disabled: !selectedNode,
    reason: 'Select a node',
  })));
  actionBar.appendChild(makeManualMapDraftButton('Edit edge', () => ({
    commandId: 'manualMap.edge.update',
    title: 'Edit edge',
    targetKind: 'edge',
    targetId: selectedEdgeId,
    risk: 'semantic',
    payload: {
      mapId,
      edgeId: selectedEdgeId,
      label: selectedEdge?.label || 'Edge',
    },
    fields: [
      { name: 'label', label: 'Edge label', type: 'text', value: selectedEdge?.label || 'Edge' },
    ],
    impactPreview: `Renames selected edge ${selectedEdgeId}. No first-edge fallback is allowed.`,
  }), () => ({
    disabled: !selectedEdge,
    reason: 'Select an edge',
  })));
  actionBar.appendChild(makeManualMapDraftButton('Delete edge', () => ({
    commandId: 'manualMap.edge.delete',
    title: 'Delete edge',
    targetKind: 'edge',
    targetId: selectedEdgeId,
    risk: 'destructive',
    payload: {
      mapId,
      edgeId: selectedEdgeId,
    },
    impactPreview: `Deletes selected edge ${selectedEdgeId}. Nodes remain unchanged.`,
  }), () => ({
    disabled: !selectedEdge,
    reason: 'Select an edge',
  })));
  actionBar.appendChild(makeManualMapDraftButton('Create group', () => {
    const selectedIds = manualMapTransientViewState.selection?.nodeIds || [];
    const groupId = makeStableUiId('manual-group');
    return {
      commandId: 'manualMap.group.create',
      title: 'Create group',
      targetKind: 'group',
      targetId: groupId,
      risk: 'structural',
      payload: {
        mapId,
        groupId,
        label: 'Group',
        colorTag: 'neutral',
        nodeIds: selectedIds,
      },
      fields: [
        { name: 'label', label: 'Group label', type: 'text', value: 'Group' },
        { name: 'colorTag', label: 'Color tag', type: 'text', value: 'neutral' },
      ],
      impactPreview: `Groups selected nodes: ${selectedIds.join(', ')}.`,
    };
  }, () => ({
    disabled: (manualMapTransientViewState.selection?.nodeIds || []).length < 2,
    reason: 'Select at least two nodes',
  })));
  actionBar.appendChild(makeManualMapDraftButton('Edit group', () => ({
    commandId: 'manualMap.group.update',
    title: 'Edit group',
    targetKind: 'group',
    targetId: manualMapText(selectedGroup?.id),
    risk: 'structural',
    payload: {
      mapId,
      groupId: manualMapText(selectedGroup?.id),
      label: selectedGroup?.label || 'Group',
      colorTag: selectedGroup?.colorTag || 'neutral',
      nodeIds: selectedGroup?.nodeIds || [],
    },
    fields: [
      { name: 'label', label: 'Group label', type: 'text', value: selectedGroup?.label || 'Group' },
      { name: 'colorTag', label: 'Color tag', type: 'text', value: selectedGroup?.colorTag || 'neutral' },
    ],
    impactPreview: `Updates selected group ${manualMapText(selectedGroup?.id)}. Group membership is preserved from the selected group only.`,
  }), () => ({
    disabled: !selectedGroup,
    reason: 'Select a grouped node',
  })));
  actionBar.appendChild(makeManualMapDraftButton('Delete group', () => ({
    commandId: 'manualMap.group.delete',
    title: 'Delete group',
    targetKind: 'group',
    targetId: manualMapText(selectedGroup?.id),
    risk: 'destructive',
    payload: {
      mapId,
      groupId: manualMapText(selectedGroup?.id),
    },
    impactPreview: `Deletes selected group ${manualMapText(selectedGroup?.id)}. Nodes are not deleted.`,
  }), () => ({
    disabled: !selectedGroup,
    reason: 'Select a grouped node',
  })));
  actionBar.appendChild(makeManualMapDraftButton('Add attachment', () => {
    const attachmentId = makeStableUiId('manual-attachment');
    return {
      commandId: 'manualMap.attachment.add',
      title: 'Add attachment',
      targetKind: 'attachment',
      targetId: attachmentId,
      risk: 'semantic',
      payload: {
        mapId,
        nodeId: selectedNodeId,
        attachmentId,
        label: 'Reference packet',
        attachmentKind: 'reference',
        source: {
          name: 'manual-map-reference.txt',
          mediaType: 'text/plain',
          sourceHash: 'd'.repeat(64),
          byteLength: 128,
        },
      },
      fields: [
        { name: 'label', label: 'Attachment label', type: 'text', value: 'Reference packet' },
        { name: 'attachmentKind', label: 'Kind', type: 'text', value: 'reference' },
      ],
      impactPreview: `Adds one pathless attachment reference to selected node ${selectedNodeId}. File bytes are not embedded and scene text is unchanged.`,
    };
  }, () => ({
    disabled: !selectedNode,
    reason: 'Select a node',
  })));
  actionBar.appendChild(makeManualMapDraftButton('Add portal', () => {
    const portalId = makeStableUiId('manual-portal');
    const targetNodeId = getManualMapSecondarySelectedNodeId();
    return {
      commandId: 'manualMap.portal.add',
      title: 'Add portal',
      targetKind: 'portal',
      targetId: portalId,
      risk: 'semantic',
      payload: {
        mapId,
        portalId,
        fromNodeId: selectedNodeId,
        targetMapId: mapId,
        targetNodeId,
        label: 'Portal link',
      },
      fields: [
        { name: 'label', label: 'Portal label', type: 'text', value: 'Portal link' },
      ],
      impactPreview: `Adds one portal from ${selectedNodeId} to ${mapId}:${targetNodeId || 'map'}. It links graph navigation only and does not rewrite target content.`,
    };
  }, () => ({
    disabled: !selectedNode,
    reason: 'Select a source node',
  })));
  actionBar.appendChild(makeManualMapDraftButton('Apply template', () => {
    const templateInstanceId = makeStableUiId('manual-template');
    const nodeOneId = makeStableUiId('manual-template-node');
    const nodeTwoId = makeStableUiId('manual-template-node');
    const edgeId = makeStableUiId('manual-template-edge');
    const nextIndex = state.summary.nodeCount + 1;
    return {
      commandId: 'manualMap.template.apply',
      title: 'Apply template',
      targetKind: 'template',
      targetId: templateInstanceId,
      risk: 'structural',
      payload: {
        mapId,
        templateInstanceId,
        templateId: 'r3-c03-two-step',
        templateName: 'Two step starter',
        nodes: [
          { nodeId: nodeOneId, label: 'Template start', nodeKind: 'note', position: { x: nextIndex * 42, y: 72 } },
          { nodeId: nodeTwoId, label: 'Template finish', nodeKind: 'note', position: { x: nextIndex * 42 + 130, y: 72 } },
        ],
        edges: [
          { edgeId, fromNodeId: nodeOneId, toNodeId: nodeTwoId, edgeKind: 'link', label: 'template flow' },
        ],
      },
      fields: [
        { name: 'templateName', label: 'Template name', type: 'text', value: 'Two step starter' },
      ],
      impactPreview: `Applies a bounded two-node template to ${mapId}. Existing nodes remain untouched and ViewState is not persisted.`,
    };
  }, () => ({
    disabled: !state.mapId,
    reason: state.mapId ? '' : 'Create a map first',
  })));
  const exportJsonButton = document.createElement('button');
  exportJsonButton.type = 'button';
  exportJsonButton.className = 'right-rail-atlas-action manual-map-workspace__action';
  exportJsonButton.textContent = 'Export JSON';
  exportJsonButton.dataset.manualMapPortabilityAction = 'export-json';
  exportJsonButton.dataset.productCommandId = 'manualMap.export.json';
  exportJsonButton.disabled = !state.mapId;
  exportJsonButton.addEventListener('click', () => {
    if (exportJsonButton.disabled) return;
    void runManualMapExportCommand('manualMap.export.json', { mapId });
  });
  actionBar.appendChild(exportJsonButton);
  const imagePdfButton = document.createElement('button');
  imagePdfButton.type = 'button';
  imagePdfButton.className = 'right-rail-atlas-action manual-map-workspace__action';
  imagePdfButton.textContent = 'Export SVG';
  imagePdfButton.dataset.manualMapPortabilityAction = 'export-image-pdf';
  imagePdfButton.dataset.productCommandId = 'manualMap.export.imagePdf';
  imagePdfButton.disabled = !state.mapId;
  imagePdfButton.addEventListener('click', () => {
    if (imagePdfButton.disabled) return;
    void runManualMapExportCommand('manualMap.export.imagePdf', { mapId });
  });
  actionBar.appendChild(imagePdfButton);
  actionBar.appendChild(makeManualMapDraftButton('Import JSON file', () => {
    const targetMapId = makeStableUiId('manual-map-imported');
    return {
      commandId: 'manualMap.import.jsonRepeat',
      title: 'Import exported copy',
      targetKind: 'map',
      targetId: targetMapId,
      risk: 'structural',
      payload: {
        mapId,
        targetMapId,
        title: `${state.graph.title || state.mapId || 'Manual map'} copy`,
      },
      fields: [
        { name: 'title', label: 'Imported map title', type: 'text', value: `${state.graph.title || state.mapId || 'Manual map'} copy` },
      ],
      impactPreview: `Selects a local Manual Map JSON file and imports it into new map ${targetMapId}. Existing maps and scene text stay unchanged.`,
    };
  }, () => ({
    disabled: !state.mapId,
    reason: state.mapId ? '' : 'Create a map first',
  })));
  if (!options.compact) {
    const layoutToggle = document.createElement('button');
    layoutToggle.type = 'button';
    layoutToggle.className = 'manual-map-workspace__chip';
    layoutToggle.textContent = manualMapLayoutMode === MANUAL_MAP_LAYOUT_MODES.HIERARCHY ? 'Hierarchy' : 'Manual';
    layoutToggle.setAttribute('aria-pressed', manualMapLayoutMode === MANUAL_MAP_LAYOUT_MODES.HIERARCHY ? 'true' : 'false');
    layoutToggle.addEventListener('click', () => {
      manualMapLayoutMode = manualMapLayoutMode === MANUAL_MAP_LAYOUT_MODES.HIERARCHY
        ? MANUAL_MAP_LAYOUT_MODES.MANUAL
        : MANUAL_MAP_LAYOUT_MODES.HIERARCHY;
      renderManualMapWorkbenchState();
    });
    actionBar.appendChild(layoutToggle);
  }
  parent.appendChild(actionBar);
}

function renderManualMapGraphCanvas(parent, state, runtime) {
  const graph = runtime.presentationGraph;
  const viewState = runtime.viewportPlan.viewState || manualMapTransientViewState;
  const viewport = viewState.viewport || MANUAL_MAP_DEFAULT_VIEWPORT;
  const canvas = document.createElement('div');
  canvas.className = 'manual-map-workspace__canvas';
  canvas.dataset.manualMapCanvas = 'true';
  const svg = document.createElementNS(MANUAL_MAP_SVG_NS, 'svg');
  svg.classList.add('manual-map-workspace__svg');
  svg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Manual map graph: ${state.summary.nodeCount} nodes, ${state.summary.edgeCount} edges`);
  const worldToSvg = (position) => ({
    x: (manualMapNumber(position.x) - viewport.x) * viewport.zoom,
    y: (manualMapNumber(position.y) - viewport.y) * viewport.zoom,
  });
  const nodesById = new Map((Array.isArray(graph.nodes) ? graph.nodes : []).map((node) => [manualMapText(node?.id), node]));
  const selectedNodeIds = new Set(viewState.selection?.nodeIds || []);
  const selectedEdgeIds = new Set(viewState.selection?.edgeIds || []);
  const edgeLayer = document.createElementNS(MANUAL_MAP_SVG_NS, 'g');
  edgeLayer.classList.add('manual-map-workspace__edge-layer');
  for (const edge of runtime.viewportPlan.edges || []) {
    const sourceEdge = getManualMapEdgeById(graph, manualMapText(edge.id));
    const fromNode = nodesById.get(edge.from);
    const toNode = nodesById.get(edge.to);
    if (!fromNode || !toNode) continue;
    const from = worldToSvg(manualMapNodePosition(fromNode));
    const to = worldToSvg(manualMapNodePosition(toNode));
    const line = document.createElementNS(MANUAL_MAP_SVG_NS, 'line');
    line.classList.add('manual-map-workspace__edge');
    if (selectedEdgeIds.has(edge.id)) line.classList.add('is-selected');
    line.dataset.manualMapEdgeId = edge.id;
    line.setAttribute('x1', String(from.x));
    line.setAttribute('y1', String(from.y));
    line.setAttribute('x2', String(to.x));
    line.setAttribute('y2', String(to.y));
    line.setAttribute('tabindex', '0');
    line.setAttribute('role', 'button');
    line.setAttribute('aria-label', sourceEdge?.label || `${edge.from} to ${edge.to}`);
    edgeLayer.appendChild(line);
  }
  svg.appendChild(edgeLayer);
  const nodeLayer = document.createElementNS(MANUAL_MAP_SVG_NS, 'g');
  nodeLayer.classList.add('manual-map-workspace__node-layer');
  for (const node of runtime.viewportPlan.nodes || []) {
    const sourceNode = nodesById.get(node.id);
    if (!sourceNode) continue;
    const position = worldToSvg(manualMapNodePosition(sourceNode));
    const group = document.createElementNS(MANUAL_MAP_SVG_NS, 'g');
    group.classList.add('manual-map-workspace__node');
    if (selectedNodeIds.has(node.id)) group.classList.add('is-selected');
    if (manualMapPinnedNodeIds.has(node.id)) group.classList.add('is-pinned');
    group.dataset.manualMapNodeId = node.id;
    group.setAttribute('transform', `translate(${position.x} ${position.y})`);
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', sourceNode.label || node.id);
    const rect = document.createElementNS(MANUAL_MAP_SVG_NS, 'rect');
    rect.setAttribute('x', '-58');
    rect.setAttribute('y', '-19');
    rect.setAttribute('width', '116');
    rect.setAttribute('height', '38');
    rect.setAttribute('rx', '8');
    const text = document.createElementNS(MANUAL_MAP_SVG_NS, 'text');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = (sourceNode.label || node.id).slice(0, 26);
    group.append(rect, text);
    nodeLayer.appendChild(group);
  }
  svg.appendChild(nodeLayer);
  canvas.appendChild(svg);

  const minimap = document.createElement('div');
  minimap.className = 'manual-map-workspace__minimap';
  minimap.setAttribute('aria-hidden', 'true');
  const bounds = runtime.viewportPlan.worldBounds || { minX: 0, minY: 0, width: 1, height: 1 };
  const width = Math.max(1, bounds.width || 1);
  const height = Math.max(1, bounds.height || 1);
  for (const node of graph.nodes || []) {
    const dot = document.createElement('span');
    dot.className = 'manual-map-workspace__minimap-dot';
    const position = manualMapNodePosition(node);
    dot.style.left = `${Math.max(0, Math.min(100, ((position.x - bounds.minX) / width) * 100))}%`;
    dot.style.top = `${Math.max(0, Math.min(100, ((position.y - bounds.minY) / height) * 100))}%`;
    minimap.appendChild(dot);
  }
  canvas.appendChild(minimap);
  parent.appendChild(canvas);
}

function renderManualMapList(parent, runtime, options = {}) {
  const list = document.createElement('div');
  list.className = options.compact
    ? 'right-rail-atlas-matrix-list right-rail-manual-map-list'
    : 'manual-map-workspace__list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Manual map graph list');
  list.tabIndex = 0;
  for (const row of runtime.listParity.rows.slice(0, options.compact ? 12 : 80)) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = options.compact
      ? 'right-rail-atlas-matrix-list-row right-rail-manual-map-row'
      : 'manual-map-workspace__row';
    item.dataset.manualMapRowId = row.rowId || '';
    item.dataset.rowKind = row.rowKind || '';
    item.dataset.itemId = row.itemId || '';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', row.selected ? 'true' : 'false');
    if (row.active) item.classList.add('is-active');
    const main = document.createElement('span');
    main.className = options.compact ? 'right-rail-atlas-matrix-list-row__main' : 'manual-map-workspace__row-main';
    main.textContent = row.label || row.itemId || 'row';
    const meta = document.createElement('span');
    meta.className = options.compact ? 'right-rail-atlas-matrix-list-row__meta' : 'manual-map-workspace__row-meta';
    meta.textContent = row.rowKind === 'edge'
      ? `${row.endpoints?.from || ''} -> ${row.endpoints?.to || ''}`
      : row.rowKind === 'group'
        ? `${Array.isArray(row.nodeIds) ? row.nodeIds.length : 0} nodes`
        : `${row.kind || 'node'} ${row.target?.kind || ''}`.trim();
    item.append(main, meta);
    list.appendChild(item);
  }
  if (runtime.listParity.rows.length < 1) {
    appendAtlasReportsRow(list, 'No graph rows yet', 'Create a manual map node to populate the fallback.');
  }
  parent.appendChild(list);
}

function renderManualMapPortabilityReadback(parent, runtime, options = {}) {
  const graph = runtime.sourceGraph || {};
  const rows = [
    ...(Array.isArray(graph.attachments) ? graph.attachments : []).map((attachment) => ({
      kind: 'attachment',
      id: manualMapText(attachment?.id),
      label: manualMapText(attachment?.label),
      meta: `${manualMapText(attachment?.nodeId)} · ${manualMapText(attachment?.attachmentKind || attachment?.kind)} · ${manualMapText(attachment?.source?.sourceHash).slice(0, 8)}`,
    })),
    ...(Array.isArray(graph.portals) ? graph.portals : []).map((portal) => ({
      kind: 'portal',
      id: manualMapText(portal?.id),
      label: manualMapText(portal?.label),
      meta: `${manualMapText(portal?.fromNodeId)} -> ${manualMapText(portal?.target?.mapId)}:${manualMapText(portal?.target?.nodeId)}`,
    })),
    ...(Array.isArray(graph.templates) ? graph.templates : []).map((template) => ({
      kind: 'template',
      id: manualMapText(template?.id),
      label: manualMapText(template?.name),
      meta: `${(template?.appliedNodeIds || []).length} nodes · ${(template?.appliedEdgeIds || []).length} edges`,
    })),
  ];
  const section = document.createElement('div');
  section.className = options.compact ? 'right-rail-atlas-matrix-list' : 'manual-map-workspace__portability';
  section.dataset.manualMapPortabilityReadback = 'true';
  if (rows.length < 1) {
    appendAtlasReportsRow(section, 'No portability records yet', 'Add an attachment, portal, or template from the workspace.');
    parent.appendChild(section);
    return;
  }
  for (const row of rows) {
    const item = document.createElement('div');
    item.className = options.compact
      ? 'right-rail-atlas-matrix-list-row right-rail-manual-map-row'
      : 'manual-map-workspace__portability-row';
    item.dataset.manualMapPortabilityKind = row.kind;
    item.dataset.manualMapPortabilityId = row.id;
    const main = document.createElement('span');
    main.className = options.compact ? 'right-rail-atlas-matrix-list-row__main' : 'manual-map-workspace__row-main';
    main.textContent = row.label || row.id || row.kind;
    const meta = document.createElement('span');
    meta.className = options.compact ? 'right-rail-atlas-matrix-list-row__meta' : 'manual-map-workspace__row-meta';
    meta.textContent = `${row.kind} · ${row.meta}`.trim();
    item.append(main, meta);
    section.appendChild(item);
  }
  parent.appendChild(section);
}

function renderManualMapPortabilityCommandReadback(parent, options = {}) {
  const state = manualMapPortabilityCommandState || {};
  const section = document.createElement('div');
  section.className = options.compact ? 'right-rail-atlas-matrix-list' : 'manual-map-workspace__portability';
  section.dataset.manualMapPortabilityCommandReadback = 'true';
  const rows = [
    {
      key: 'status',
      label: 'Portability command',
      value: state.status || 'ready',
    },
    {
      key: 'json',
      label: 'JSON export',
      value: state.exportJsonSha256 ? state.exportJsonSha256.slice(0, 12) : 'not exported',
    },
    {
      key: 'imagePdf',
      label: 'Image/PDF packet',
      value: state.imageEvidenceHash ? `${state.imageEvidenceHash.slice(0, 12)}${state.pdfTypedLoss ? ' typed PDF loss' : ''}` : 'not exported',
    },
    {
      key: 'import',
      label: 'Repeat import',
      value: state.importMapId || 'not imported',
    },
  ];
  for (const row of rows) {
    const item = document.createElement('div');
    item.className = options.compact
      ? 'right-rail-atlas-matrix-list-row right-rail-manual-map-row'
      : 'manual-map-workspace__portability-row';
    item.dataset.manualMapPortabilityCommandState = row.key;
    const main = document.createElement('span');
    main.className = options.compact ? 'right-rail-atlas-matrix-list-row__main' : 'manual-map-workspace__row-main';
    main.textContent = row.label;
    const meta = document.createElement('span');
    meta.className = options.compact ? 'right-rail-atlas-matrix-list-row__meta' : 'manual-map-workspace__row-meta';
    meta.textContent = row.value;
    item.append(main, meta);
    section.appendChild(item);
  }
  parent.appendChild(section);
}

function renderManualMapCommandDraft(parent) {
  if (!manualMapCommandDraft) return;
  const draft = manualMapCommandDraft;
  const panel = document.createElement('form');
  panel.className = 'manual-map-workspace__command-form';
  panel.dataset.manualMapCommandForm = 'true';
  panel.dataset.manualMapCommandId = draft.commandId || '';
  panel.dataset.manualMapCommandRisk = draft.risk || '';
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    void applyManualMapCommandDraft();
  });

  const title = document.createElement('strong');
  title.className = 'manual-map-workspace__command-title';
  title.textContent = draft.title || draft.commandId || 'Manual Map command';
  const target = document.createElement('div');
  target.className = 'manual-map-workspace__command-meta';
  target.dataset.manualMapSelectionTarget = draft.targetId || '';
  target.textContent = `${draft.targetKind || 'target'}: ${draft.targetId || 'none'} · ${draft.commandId || 'command'}`;
  const impact = document.createElement('div');
  impact.className = 'manual-map-workspace__impact-preview';
  impact.dataset.manualMapImpactPreview = 'true';
  impact.textContent = draft.impactPreview || 'Preview unavailable';
  panel.append(title, target, impact);

  for (const field of draft.fields || []) {
    const label = document.createElement('label');
    label.className = 'manual-map-workspace__field';
    const labelText = document.createElement('span');
    labelText.textContent = field.label || field.name || 'Field';
    const input = document.createElement('input');
    input.type = field.type || 'text';
    input.value = manualMapText(draft.payload?.[field.name], manualMapText(field.value));
    input.dataset.manualMapCommandField = field.name || '';
    input.addEventListener('input', () => updateManualMapCommandDraftField(field.name, input.value));
    label.append(labelText, input);
    panel.appendChild(label);
  }

  if (draft.risk === 'destructive' || draft.risk === 'structural') {
    const confirmLabel = document.createElement('label');
    confirmLabel.className = 'manual-map-workspace__confirm';
    const confirm = document.createElement('input');
    confirm.type = 'checkbox';
    confirm.checked = draft.confirmChecked === true;
    confirm.dataset.manualMapConfirmRisk = draft.risk;
    confirm.addEventListener('change', () => setManualMapCommandDraftConfirmation(confirm.checked));
    const text = document.createElement('span');
    text.textContent = draft.risk === 'destructive'
      ? 'Confirm destructive change'
      : 'Confirm structural change';
    confirmLabel.append(confirm, text);
    panel.appendChild(confirmLabel);
  }

  if (draft.result) {
    const result = document.createElement('div');
    result.className = 'manual-map-workspace__command-result';
    result.dataset.manualMapOperationResult = draft.result.status || '';
    result.textContent = draft.result.reason
      ? `${draft.result.status}: ${draft.result.reason}`
      : draft.result.status || 'READY';
    panel.appendChild(result);
  }

  const actions = document.createElement('div');
  actions.className = 'manual-map-workspace__command-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'manual-map-workspace__chip';
  cancel.dataset.manualMapCommandCancel = 'true';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => cancelManualMapCommandDraft());
  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.className = 'manual-map-workspace__action';
  apply.dataset.manualMapCommandApply = 'true';
  apply.textContent = draft.state === 'applying' ? 'Applying' : 'Apply';
  apply.disabled = draft.state === 'applying';
  actions.append(cancel, apply);
  panel.appendChild(actions);
  parent.appendChild(panel);
}

function renderManualMapInspector(parent, state, runtime) {
  const panel = document.createElement('aside');
  panel.className = 'manual-map-workspace__inspector';
  const selectedNodeId = getManualMapSelectedNodeId();
  const selectedEdgeId = getManualMapSelectedEdgeId();
  const selectedNode = getManualMapNodeById(runtime.sourceGraph, selectedNodeId);
  const selectedEdge = getManualMapEdgeById(runtime.sourceGraph, selectedEdgeId);
  const title = document.createElement('strong');
  title.className = 'manual-map-workspace__inspector-title';
  title.textContent = selectedNode?.label || selectedEdge?.label || selectedEdge?.id || state.graph.title || 'Selection';
  const meta = document.createElement('div');
  meta.className = 'manual-map-workspace__inspector-meta';
  if (selectedNode) {
    const position = manualMapNodePosition(selectedNode);
    meta.textContent = `${selectedNode.kind || 'node'} · ${selectedNode.id} · ${Math.round(position.x)}, ${Math.round(position.y)}`;
  } else if (selectedEdge) {
    meta.textContent = `${selectedEdge.kind || 'edge'} · ${selectedEdge.from} -> ${selectedEdge.to}`;
  } else {
    meta.textContent = 'Select a node, edge, or list row.';
  }
  const status = document.createElement('div');
  status.className = 'manual-map-workspace__inspector-meta';
  status.textContent = `ViewState transient · ${manualMapLayoutMode === MANUAL_MAP_LAYOUT_MODES.HIERARCHY ? 'hierarchy' : 'manual'} · ${runtime.resourceBudgetProof?.planned?.nodes || 0}/${runtime.resourceBudgetProof?.input?.nodes || 0}`;
  panel.append(title, meta, status);
  parent.appendChild(panel);
}

function renderManualMapWorkbenchInto(host, options = {}) {
  if (!(host instanceof HTMLElement)) return;
  const state = normalizeManualMapWorkbench(manualMapWorkbenchState);
  const compact = options.compact === true;
  host.innerHTML = '';
  applyAtlasResolvedSurfaceBinding('manualMap', host, 'manualMapWorkbenchProvider');
  host.dataset.manualMapWorkbenchStatus = state.state;
  host.dataset.manualMapWorkbenchPlacement = compact ? 'right-rail-inspector' : 'plan-workspace';

  const header = document.createElement('div');
  header.className = compact ? 'right-rail-atlas-matrices-head' : 'manual-map-workspace__header';
  const headerText = document.createElement('div');
  const label = document.createElement('div');
  label.className = compact ? 'right-rail-section__label' : 'manual-map-workspace__eyebrow';
  label.textContent = compact ? 'Graph inspector' : 'Manual Map';
  const title = document.createElement(compact ? 'strong' : 'h2');
  title.className = compact ? 'right-rail-atlas-matrices-title' : 'manual-map-workspace__title';
  title.textContent = state.graph.title || state.mapId || 'Graph workbench';
  headerText.append(label, title);
  const hash = document.createElement('span');
  hash.className = compact ? 'right-rail-atlas-overview-hash' : 'manual-map-workspace__status';
  hash.textContent = state.summary.workbenchHash ? state.summary.workbenchHash.slice(0, 8) : state.state;
  header.append(headerText, hash);
  host.appendChild(header);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = compact ? 'right-rail-atlas-state right-rail-atlas-state--blocked' : 'manual-map-workspace__empty';
    unavailable.textContent = state.unavailableReason || 'MANUAL_MAP_WORKBENCH_UNAVAILABLE';
    host.appendChild(unavailable);
    return;
  }
  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = compact ? 'right-rail-atlas-state' : 'manual-map-workspace__empty';
    loading.textContent = 'Graph workbench обновляется.';
    host.appendChild(loading);
    return;
  }

  const runtime = buildManualMapWorkbenchRuntimeModel(state);
  const metrics = document.createElement('div');
  metrics.className = compact
    ? 'right-rail-atlas-overview-metrics right-rail-atlas-matrices-metrics'
    : 'manual-map-workspace__metrics';
  appendAtlasOverviewMetric(metrics, 'maps', state.summary.mapCount);
  appendAtlasOverviewMetric(metrics, 'nodes', state.summary.nodeCount);
  appendAtlasOverviewMetric(metrics, 'edges', state.summary.edgeCount);
  appendAtlasOverviewMetric(metrics, 'groups', state.summary.groupCount);
  appendAtlasOverviewMetric(metrics, 'refs', (runtime.sourceGraph.attachments || []).length);
  appendAtlasOverviewMetric(metrics, 'portals', (runtime.sourceGraph.portals || []).length);
  appendAtlasOverviewMetric(metrics, 'templates', (runtime.sourceGraph.templates || []).length);
  host.appendChild(metrics);

  renderManualMapToolbar(host, state, runtime, { compact });
  renderManualMapCommandDraft(host);
  if (compact) {
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'right-rail-atlas-action';
    openButton.textContent = 'Open workspace';
    openButton.addEventListener('click', () => showManualMapPlanWorkspace());
    host.appendChild(openButton);
    const listSection = appendAtlasOverviewSection(host, 'Keyboard list fallback', { open: true });
    renderManualMapList(listSection, runtime, { compact: true });
    const portabilitySection = appendAtlasOverviewSection(host, 'Portability records', { open: true });
    renderManualMapPortabilityReadback(portabilitySection, runtime, { compact: true });
    const commandSection = appendAtlasOverviewSection(host, 'Portability commands', { open: true });
    renderManualMapPortabilityCommandReadback(commandSection, { compact: true });
    return;
  }

  const controls = document.createElement('div');
  controls.className = 'manual-map-workspace__controls';
  const search = document.createElement('input');
  search.className = 'manual-map-workspace__search';
  search.type = 'search';
  search.value = manualMapSearchQuery;
  search.placeholder = 'Search map';
  search.setAttribute('aria-label', 'Search manual map');
  search.addEventListener('input', () => {
    manualMapSearchQuery = search.value;
    renderManualMapWorkbenchState();
  });
  const zoomOut = document.createElement('button');
  zoomOut.type = 'button';
  zoomOut.className = 'manual-map-workspace__chip';
  zoomOut.textContent = '-';
  zoomOut.setAttribute('aria-label', 'Zoom out');
  zoomOut.addEventListener('click', () => setManualMapViewIntent({ type: MANUAL_MAP_VIEW_INTENT.ZOOM, payload: { factor: 0.85 } }, runtime.presentationGraph));
  const zoomIn = document.createElement('button');
  zoomIn.type = 'button';
  zoomIn.className = 'manual-map-workspace__chip';
  zoomIn.textContent = '+';
  zoomIn.setAttribute('aria-label', 'Zoom in');
  zoomIn.addEventListener('click', () => setManualMapViewIntent({ type: MANUAL_MAP_VIEW_INTENT.ZOOM, payload: { factor: 1.18 } }, runtime.presentationGraph));
  const fit = document.createElement('button');
  fit.type = 'button';
  fit.className = 'manual-map-workspace__chip';
  fit.textContent = 'Fit';
  fit.addEventListener('click', () => {
    const bounds = runtime.viewportPlan.worldBounds || { minX: -420, minY: -260 };
    manualMapTransientViewState = normalizeManualMapViewState({
      ...manualMapTransientViewState,
      viewport: {
        ...MANUAL_MAP_DEFAULT_VIEWPORT,
        x: manualMapNumber(bounds.minX, -420) - 80,
        y: manualMapNumber(bounds.minY, -260) - 80,
        zoom: 1,
      },
    }, runtime.presentationGraph);
    renderManualMapWorkbenchState();
  });
  controls.append(search, zoomOut, zoomIn, fit);
  host.appendChild(controls);

  const body = document.createElement('div');
  body.className = 'manual-map-workspace__body';
  const graphColumn = document.createElement('div');
  graphColumn.className = 'manual-map-workspace__graph-column';
  renderManualMapGraphCanvas(graphColumn, state, runtime);
  const listColumn = document.createElement('div');
  listColumn.className = 'manual-map-workspace__list-column';
  renderManualMapList(listColumn, runtime);
  renderManualMapPortabilityReadback(listColumn, runtime);
  renderManualMapPortabilityCommandReadback(listColumn);
  renderManualMapInspector(listColumn, state, runtime);
  body.append(graphColumn, listColumn);
  host.appendChild(body);
}

function normalizeProjectionInspector(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary) ? source.summary : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'derived.projection.inspectorProvider.v1',
    state: typeof source.state === 'string' ? source.state : (source.projectionStates ? 'ready' : 'empty'),
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    manifests: Array.isArray(source.manifests) ? source.manifests.filter(reviewSurfaceIsPlainObject) : [],
    projectionStates: Array.isArray(source.projectionStates) ? source.projectionStates.filter(reviewSurfaceIsPlainObject) : [],
    summary: {
      manifestCount: Number.isInteger(summary.manifestCount) ? Math.max(0, summary.manifestCount) : 0,
      readyCount: Number.isInteger(summary.readyCount) ? Math.max(0, summary.readyCount) : 0,
      emptyCount: Number.isInteger(summary.emptyCount) ? Math.max(0, summary.emptyCount) : 0,
      unavailableCount: Number.isInteger(summary.unavailableCount) ? Math.max(0, summary.unavailableCount) : 0,
    },
    authority: source.authority && typeof source.authority === 'object' && !Array.isArray(source.authority) ? source.authority : {},
  };
}

function makeAtlasCommandButton(label, commandId, payload, options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'right-rail-atlas-action';
  button.textContent = label;
  button.dataset.productCommandId = commandId;
  button.dataset.atlasJourneyAction = options.actionId || commandId;
  button.disabled = options.disabled === true;
  if (typeof options.reason === 'string' && options.reason) {
    button.title = options.reason;
    button.setAttribute('aria-label', `${label}. ${options.reason}`);
  }
  button.addEventListener('click', () => {
    const nextPayload = typeof payload === 'function' ? payload() : payload;
    void runProductJourneyCommand(commandId, nextPayload);
  });
  return button;
}

async function runAtlasSurfaceProductCommand(commandId, payload = {}, options = {}) {
  const result = await dispatchUiCommand(commandId, {
    ...payload,
    projectId: currentProjectId,
  });
  const statusLabel = options.statusLabel || commandId;
  updateStatusText(result && result.ok ? `${statusLabel} persisted` : (result?.reason || result?.error?.reason || `${statusLabel} failed`));
  await refreshAtlasCurrentScene({ force: true });
  void refreshAtlasProductSurfaces({ currentScene: false }).catch((error) => {
    console.warn('Atlas surface command refresh failed', error);
  });
  return result;
}

function makeAtlasSurfaceCommandButton(label, commandId, payload, options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'right-rail-atlas-action';
  button.textContent = label;
  button.dataset.productCommandId = commandId;
  if (options.actionDatasetName && options.actionId) {
    button.dataset[options.actionDatasetName] = options.actionId;
  }
  button.disabled = options.disabled === true;
  if (typeof options.reason === 'string' && options.reason) {
    button.title = options.reason;
    button.setAttribute('aria-label', `${label}. ${options.reason}`);
  }
  button.addEventListener('click', () => {
    const nextPayload = typeof payload === 'function' ? payload() : payload;
    void runAtlasSurfaceProductCommand(commandId, nextPayload, options);
  });
  return button;
}

function getAtlasJourneyEntities() {
  const entities = Array.isArray(atlasCurrentSceneState.entities) ? atlasCurrentSceneState.entities : [];
  return entities.filter((entity) => entity && typeof entity.entityId === 'string' && entity.entityId);
}

function getAtlasJourneyMentions() {
  const mentions = Array.isArray(atlasCurrentSceneState.mentions) ? atlasCurrentSceneState.mentions : [];
  return mentions.filter((mention) => mention && mention.evidenceAnchor && mention.mentionId);
}

function findAtlasJourneyEntity(entityId = '') {
  return getAtlasJourneyEntities().find((entity) => entity.entityId === entityId) || null;
}

function findAtlasJourneyMention(mentionId = '') {
  return getAtlasJourneyMentions().find((mention) => mention.mentionId === mentionId) || null;
}

function makeStableUiId(prefix) {
  atlasStableUiIdSeq += 1;
  return `${prefix}-${atlasStableUiIdSeq.toString(36).padStart(5, '0')}`;
}

function ensureAtlasJourneyDraftId(fieldName, prefix) {
  if (!atlasJourneyDraft[fieldName]) {
    atlasJourneyDraft = {
      ...atlasJourneyDraft,
      [fieldName]: makeStableUiId(prefix),
    };
  }
  return atlasJourneyDraft[fieldName];
}

function getAtlasJourneyEntityName() {
  return (atlasJourneyDraft.entityName || '').trim()
    || currentDocumentTitle
    || atlasCurrentSceneState.sceneTitle
    || 'Entity';
}

function getAtlasJourneyAliasValue() {
  const sourceEntity = findAtlasJourneyEntity(atlasJourneyDraft.sourceEntityId);
  return (atlasJourneyDraft.aliasValue || '').trim()
    || `${sourceEntity?.name || 'Alias'} alias`;
}

function reconcileAtlasJourneyDraft() {
  const entities = getAtlasJourneyEntities();
  const entityIds = new Set(entities.map((entity) => entity.entityId));
  let sourceEntityId = entityIds.has(atlasJourneyDraft.sourceEntityId)
    ? atlasJourneyDraft.sourceEntityId
    : (entities[0]?.entityId || '');
  let targetEntityId = entityIds.has(atlasJourneyDraft.targetEntityId)
    ? atlasJourneyDraft.targetEntityId
    : '';
  if (!targetEntityId || targetEntityId === sourceEntityId) {
    targetEntityId = entities.find((entity) => entity.entityId !== sourceEntityId)?.entityId || '';
  }
  const mentions = getAtlasJourneyMentions();
  const mentionIds = new Set(mentions.map((mention) => mention.mentionId));
  let mentionId = mentionIds.has(atlasJourneyDraft.mentionId)
    ? atlasJourneyDraft.mentionId
    : '';
  if (!mentionId) {
    mentionId = mentions.find((mention) => !sourceEntityId || mention.entityId === sourceEntityId)?.mentionId
      || mentions[0]?.mentionId
      || '';
  }
  const selectedMention = mentions.find((mention) => mention.mentionId === mentionId);
  if (selectedMention?.entityId && entityIds.has(selectedMention.entityId)) {
    sourceEntityId = selectedMention.entityId;
    if (!targetEntityId || targetEntityId === sourceEntityId) {
      targetEntityId = entities.find((entity) => entity.entityId !== sourceEntityId)?.entityId || '';
    }
  }
  atlasJourneyDraft = {
    ...atlasJourneyDraft,
    sourceEntityId,
    targetEntityId,
    mentionId,
  };
}

function appendAtlasJourneyField(parent, config = {}) {
  const field = document.createElement('label');
  field.className = 'right-rail-atlas-journey-field';
  const caption = document.createElement('span');
  caption.className = 'right-rail-atlas-journey-field__label';
  caption.textContent = config.label || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'right-rail-atlas-journey-field__control';
  input.value = config.value || '';
  input.placeholder = config.placeholder || '';
  input.dataset.atlasJourneyField = config.fieldName || '';
  input.addEventListener('input', () => {
    atlasJourneyDraft = {
      ...atlasJourneyDraft,
      [config.fieldName]: input.value,
    };
  });
  field.append(caption, input);
  parent.appendChild(field);
  return input;
}

function appendAtlasJourneySelect(parent, config = {}) {
  const field = document.createElement('label');
  field.className = 'right-rail-atlas-journey-field';
  const caption = document.createElement('span');
  caption.className = 'right-rail-atlas-journey-field__label';
  caption.textContent = config.label || '';
  const select = document.createElement('select');
  select.className = 'right-rail-atlas-journey-field__control';
  select.dataset.atlasJourneyField = config.fieldName || '';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = config.emptyLabel || 'Unavailable';
  select.appendChild(emptyOption);
  for (const option of Array.isArray(config.options) ? config.options : []) {
    const element = document.createElement('option');
    element.value = option.value || '';
    element.textContent = option.label || option.value || '';
    select.appendChild(element);
  }
  select.value = config.value || '';
  select.addEventListener('change', () => {
    atlasJourneyDraft = {
      ...atlasJourneyDraft,
      [config.fieldName]: select.value,
    };
    if (config.fieldName === 'mentionId') {
      const mention = findAtlasJourneyMention(select.value);
      if (mention?.entityId) {
        atlasJourneyDraft.sourceEntityId = mention.entityId;
      }
    }
    renderAtlasJourneyState();
  });
  field.append(caption, select);
  parent.appendChild(field);
  return select;
}

function appendAtlasSurfaceField(parent, config = {}, draftRef, assignDraft) {
  const field = document.createElement('label');
  field.className = 'right-rail-atlas-journey-field';
  const caption = document.createElement('span');
  caption.className = 'right-rail-atlas-journey-field__label';
  caption.textContent = config.label || '';
  const input = document.createElement('input');
  input.type = config.type || 'text';
  input.className = 'right-rail-atlas-journey-field__control';
  input.value = draftRef?.[config.fieldName] || config.value || '';
  input.placeholder = config.placeholder || '';
  input.dataset[config.datasetName || 'atlasSurfaceField'] = config.fieldName || '';
  input.addEventListener('input', () => {
    assignDraft(config.fieldName, input.value);
  });
  field.append(caption, input);
  parent.appendChild(field);
  return input;
}

function appendAtlasSurfaceSelect(parent, config = {}, draftRef, assignDraft) {
  const field = document.createElement('label');
  field.className = 'right-rail-atlas-journey-field';
  const caption = document.createElement('span');
  caption.className = 'right-rail-atlas-journey-field__label';
  caption.textContent = config.label || '';
  const select = document.createElement('select');
  select.className = 'right-rail-atlas-journey-field__control';
  select.dataset[config.datasetName || 'atlasSurfaceField'] = config.fieldName || '';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = config.emptyLabel || 'Select';
  select.appendChild(emptyOption);
  for (const option of Array.isArray(config.options) ? config.options : []) {
    const element = document.createElement('option');
    element.value = option.value || '';
    element.textContent = option.label || option.value || '';
    select.appendChild(element);
  }
  select.value = draftRef?.[config.fieldName] || '';
  select.addEventListener('change', () => {
    assignDraft(config.fieldName, select.value);
    if (typeof config.onChange === 'function') config.onChange(select.value);
    if (typeof config.render === 'function') config.render();
  });
  field.append(caption, select);
  parent.appendChild(field);
  return select;
}

function ensureAtlasSurfaceDraftId(draftRef, fieldName, prefix, assignDraft) {
  if (draftRef[fieldName]) return draftRef[fieldName];
  const id = makeStableUiId(prefix);
  assignDraft({
    ...draftRef,
    [fieldName]: id,
  });
  return id;
}

function exactAtlasCalendarRange(calendarId, dateValue) {
  const value = (dateValue || '').trim() || '2026-07-31';
  return {
    rangeKind: 'exact',
    start: { pointKind: 'calendarDate', calendarId, value },
    end: { pointKind: 'calendarDate', calendarId, value },
  };
}

function exactAtlasNarrativeRange(dayValue) {
  const dayIndex = Number.parseInt(String(dayValue || '0'), 10);
  const safeDay = Number.isSafeInteger(dayIndex) ? dayIndex : 0;
  return {
    rangeKind: 'exact',
    start: { pointKind: 'ordinalDay', dayIndex: safeDay },
    end: { pointKind: 'ordinalDay', dayIndex: safeDay },
  };
}

function getAtlasTemporalCalendarPayload() {
  return {
    calendarId: atlasTemporalAuthorDraft.calendarId || 'calendar-r3-c02-story',
    name: atlasTemporalAuthorDraft.calendarName || 'R3 C02 story calendar',
    calendarKind: 'fictional',
    calendarSystem: 'r3-c02-local-story',
    dayZeroLabel: 'R3 C02 day zero',
    conversionRules: [
      {
        ruleId: 'rule-r3-c02-story-to-narrative',
        ruleKind: 'dayOffset',
        sourceScale: 'story-day',
        targetScale: 'narrative-day',
        offsetDays: 0,
        precision: 'approximate',
      },
    ],
  };
}

function getAtlasTemporalAnchorPayload() {
  const calendarId = atlasTemporalAuthorDraft.calendarId || 'calendar-r3-c02-story';
  return {
    sceneId: atlasCurrentSceneState.sceneId || currentDocumentId || '',
    anchorId: ensureAtlasSurfaceDraftId(
      atlasTemporalAuthorDraft,
      'anchorId',
      'atlas-temporal-anchor',
      (next) => { atlasTemporalAuthorDraft = next; },
    ),
    storyRange: exactAtlasCalendarRange(calendarId, atlasTemporalAuthorDraft.storyDate),
    narrativeRange: exactAtlasNarrativeRange(atlasTemporalAuthorDraft.narrativeDay),
    note: atlasTemporalAuthorDraft.note || 'R3 C02 visible temporal anchor',
  };
}

function getAtlasContinuityFactPayload() {
  const mention = findAtlasJourneyMention(atlasContinuityAuthorDraft.mentionId);
  const ledgerKind = atlasContinuityAuthorDraft.ledgerKind || 'promise';
  return {
    ledgerKind,
    factId: ensureAtlasSurfaceDraftId(
      atlasContinuityAuthorDraft,
      'factId',
      'atlas-continuity-fact',
      (next) => { atlasContinuityAuthorDraft = next; },
    ),
    sceneId: mention?.sceneId || atlasCurrentSceneState.sceneId || currentDocumentId || '',
    subjectEntityId: atlasContinuityAuthorDraft.entityId || '',
    factLabel: atlasContinuityAuthorDraft.factLabel || 'R3 C02 continuity fact',
    factValue: atlasContinuityAuthorDraft.factValue || 'visible UI command path',
    promiseState: ledgerKind === 'promise' ? (atlasContinuityAuthorDraft.promiseState || 'open') : '',
    evidenceAnchor: mention?.evidenceAnchor || null,
    note: atlasContinuityAuthorDraft.note || 'R3 C02 visible continuity fact',
  };
}

function getAtlasSavedQueryPayload() {
  return {
    savedQueryId: atlasReportsAuthorDraft.savedQueryId || 'saved-query-r3-c02-visible',
    name: atlasReportsAuthorDraft.name || 'R3 C02 visible saved query',
    reportType: atlasReportsAuthorDraft.reportType || 'overview',
    sourceHash: atlasReportsState.summary?.sourceHash
      || atlasOverviewState.summary?.overviewHash
      || atlasCurrentSceneState.summary?.sceneTextHash
      || currentProjectId,
    filter: {
      entityIds: atlasContinuityAuthorDraft.entityId ? [atlasContinuityAuthorDraft.entityId] : [],
      sceneIds: atlasCurrentSceneState.sceneId ? [atlasCurrentSceneState.sceneId] : [],
      relationPairIds: [],
    },
  };
}

function formatAtlasJourneyEntityOption(entity) {
  return `${entity.name || entity.entityId} · ${entity.entityKind || 'entity'}`;
}

function formatAtlasJourneyMentionOption(mention) {
  const entity = findAtlasJourneyEntity(mention.entityId);
  const quote = mention.context?.quote || mention.matchedText || mention.mentionId;
  return `${entity?.name || mention.entityId} · ${quote}`;
}

function setAtlasTemporalDraftField(fieldName, value) {
  atlasTemporalAuthorDraft = {
    ...atlasTemporalAuthorDraft,
    [fieldName]: value,
  };
}

function setAtlasContinuityDraftField(fieldName, value) {
  atlasContinuityAuthorDraft = {
    ...atlasContinuityAuthorDraft,
    [fieldName]: value,
  };
}

function setAtlasReportsDraftField(fieldName, value) {
  atlasReportsAuthorDraft = {
    ...atlasReportsAuthorDraft,
    [fieldName]: value,
  };
}

function appendAtlasTemporalAuthorControls(parent) {
  const section = appendAtlasOverviewSection(parent, 'Author controls', { open: true });
  const fields = document.createElement('div');
  fields.className = 'right-rail-atlas-journey-fields';
  appendAtlasSurfaceField(fields, {
    datasetName: 'atlasTemporalField',
    fieldName: 'calendarId',
    label: 'Calendar id',
    placeholder: 'calendar-story',
  }, atlasTemporalAuthorDraft, setAtlasTemporalDraftField);
  appendAtlasSurfaceField(fields, {
    datasetName: 'atlasTemporalField',
    fieldName: 'calendarName',
    label: 'Calendar name',
    placeholder: 'Story calendar',
  }, atlasTemporalAuthorDraft, setAtlasTemporalDraftField);
  appendAtlasSurfaceField(fields, {
    datasetName: 'atlasTemporalField',
    fieldName: 'storyDate',
    label: 'Story date',
    placeholder: '2026-07-31',
  }, atlasTemporalAuthorDraft, setAtlasTemporalDraftField);
  appendAtlasSurfaceField(fields, {
    datasetName: 'atlasTemporalField',
    fieldName: 'narrativeDay',
    label: 'Narrative day',
    placeholder: '0',
  }, atlasTemporalAuthorDraft, setAtlasTemporalDraftField);
  appendAtlasSurfaceField(fields, {
    datasetName: 'atlasTemporalField',
    fieldName: 'note',
    label: 'Note',
    placeholder: 'Anchor note',
  }, atlasTemporalAuthorDraft, setAtlasTemporalDraftField);
  section.appendChild(fields);

  const actions = document.createElement('div');
  actions.className = 'right-rail-atlas-action-bar';
  actions.appendChild(makeAtlasSurfaceCommandButton('Define calendar', 'atlas.calendar.define', getAtlasTemporalCalendarPayload, {
    actionDatasetName: 'atlasTemporalAction',
    actionId: 'define-calendar',
    statusLabel: 'Atlas calendar',
    disabled: !currentProjectId,
    reason: currentProjectId ? '' : 'Project is not open',
  }));
  actions.appendChild(makeAtlasSurfaceCommandButton('Set scene time', 'atlas.sceneTemporalAnchor.set', getAtlasTemporalAnchorPayload, {
    actionDatasetName: 'atlasTemporalAction',
    actionId: 'set-scene-time',
    statusLabel: 'Atlas temporal anchor',
    disabled: !currentProjectId || !(atlasCurrentSceneState.sceneId || currentDocumentId),
    reason: (atlasCurrentSceneState.sceneId || currentDocumentId) ? '' : 'Open a scene first',
  }));
  section.appendChild(actions);
}

function appendAtlasContinuityAuthorControls(parent) {
  const entities = getAtlasJourneyEntities();
  const mentions = getAtlasJourneyMentions();
  const section = appendAtlasOverviewSection(parent, 'Author fact', { open: true });
  const fields = document.createElement('div');
  fields.className = 'right-rail-atlas-journey-fields';
  appendAtlasSurfaceSelect(fields, {
    datasetName: 'atlasContinuityField',
    fieldName: 'ledgerKind',
    label: 'Ledger',
    emptyLabel: 'Ledger',
    options: [
      { value: 'promise', label: 'Promise' },
      { value: 'location', label: 'Location' },
      { value: 'knowledge', label: 'Knowledge' },
      { value: 'object', label: 'Object' },
    ],
    render: renderAtlasContinuityLedgerState,
  }, atlasContinuityAuthorDraft, setAtlasContinuityDraftField);
  appendAtlasSurfaceSelect(fields, {
    datasetName: 'atlasContinuityField',
    fieldName: 'promiseState',
    label: 'Promise state',
    emptyLabel: 'State',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'fulfilled', label: 'Fulfilled' },
      { value: 'broken', label: 'Broken' },
      { value: 'unknown', label: 'Unknown' },
    ],
  }, atlasContinuityAuthorDraft, setAtlasContinuityDraftField);
  appendAtlasSurfaceSelect(fields, {
    datasetName: 'atlasContinuityField',
    fieldName: 'entityId',
    label: 'Subject',
    emptyLabel: 'Select entity',
    options: entities.map((entity) => ({ value: entity.entityId, label: formatAtlasJourneyEntityOption(entity) })),
  }, atlasContinuityAuthorDraft, setAtlasContinuityDraftField);
  appendAtlasSurfaceSelect(fields, {
    datasetName: 'atlasContinuityField',
    fieldName: 'mentionId',
    label: 'Evidence mention',
    emptyLabel: 'Select mention',
    options: mentions.map((mention) => ({ value: mention.mentionId, label: formatAtlasJourneyMentionOption(mention) })),
    onChange: (mentionId) => {
      const mention = findAtlasJourneyMention(mentionId);
      if (mention?.entityId) {
        atlasContinuityAuthorDraft = {
          ...atlasContinuityAuthorDraft,
          mentionId,
          entityId: mention.entityId,
        };
      }
    },
    render: renderAtlasContinuityLedgerState,
  }, atlasContinuityAuthorDraft, setAtlasContinuityDraftField);
  appendAtlasSurfaceField(fields, {
    datasetName: 'atlasContinuityField',
    fieldName: 'factLabel',
    label: 'Fact label',
    placeholder: 'Promise',
  }, atlasContinuityAuthorDraft, setAtlasContinuityDraftField);
  appendAtlasSurfaceField(fields, {
    datasetName: 'atlasContinuityField',
    fieldName: 'factValue',
    label: 'Fact value',
    placeholder: 'What changes',
  }, atlasContinuityAuthorDraft, setAtlasContinuityDraftField);
  section.appendChild(fields);

  const mention = findAtlasJourneyMention(atlasContinuityAuthorDraft.mentionId);
  const canRecord = Boolean(currentProjectId && atlasContinuityAuthorDraft.entityId && mention?.evidenceAnchor);
  const actions = document.createElement('div');
  actions.className = 'right-rail-atlas-action-bar right-rail-atlas-continuity-actions';
  actions.appendChild(makeAtlasSurfaceCommandButton('Record fact', 'atlas.continuityFact.record', getAtlasContinuityFactPayload, {
    actionDatasetName: 'atlasContinuityAction',
    actionId: 'record-fact',
    statusLabel: 'Atlas continuity fact',
    disabled: !canRecord,
    reason: canRecord ? '' : 'Select subject and evidence mention',
  }));
  section.appendChild(actions);
}

function appendAtlasSavedQueryControls(parent) {
  const section = appendAtlasOverviewSection(parent, 'Save query', { open: true });
  const fields = document.createElement('div');
  fields.className = 'right-rail-atlas-journey-fields';
  appendAtlasSurfaceField(fields, {
    datasetName: 'atlasReportsField',
    fieldName: 'savedQueryId',
    label: 'Query id',
    placeholder: 'saved-query',
  }, atlasReportsAuthorDraft, setAtlasReportsDraftField);
  appendAtlasSurfaceField(fields, {
    datasetName: 'atlasReportsField',
    fieldName: 'name',
    label: 'Query name',
    placeholder: 'Saved query name',
  }, atlasReportsAuthorDraft, setAtlasReportsDraftField);
  appendAtlasSurfaceSelect(fields, {
    datasetName: 'atlasReportsField',
    fieldName: 'reportType',
    label: 'Report type',
    emptyLabel: 'Report',
    options: [
      { value: 'overview', label: 'Overview' },
      { value: 'entity', label: 'Entity' },
      { value: 'relation', label: 'Relation' },
      { value: 'matrix', label: 'Matrix' },
      { value: 'heatmap', label: 'Heatmap' },
    ],
  }, atlasReportsAuthorDraft, setAtlasReportsDraftField);
  section.appendChild(fields);
  const actions = document.createElement('div');
  actions.className = 'right-rail-atlas-action-bar';
  actions.appendChild(makeAtlasSurfaceCommandButton('Save query', 'atlas.savedQuery.save', getAtlasSavedQueryPayload, {
    actionDatasetName: 'atlasReportsAction',
    actionId: 'save-query',
    statusLabel: 'Atlas saved query',
    disabled: !currentProjectId,
    reason: currentProjectId ? '' : 'Project is not open',
  }));
  section.appendChild(actions);
}

async function refreshAtlasProductSurfaces(options = {}) {
  const refreshes = [
    refreshAtlasOverview(),
    refreshAtlasEntityDossier(),
    refreshAtlasRelationDossier(),
    refreshAtlasMatrices(),
    refreshAtlasReportsSavedQueries(),
    refreshAtlasDiagnosticsStageAcceptance(),
    refreshManualMapWorkbench(),
    refreshProjectionInspector(),
  ];
  if (options.currentScene !== false) {
    refreshes.push(refreshAtlasCurrentScene({ force: true }));
  }
  await Promise.all(refreshes);
}

async function runProductJourneyCommand(commandId, payload = {}) {
  const nextCommandSeq = Number(atlasJourneyState.commandSeq || 0) + 1;
  atlasJourneyState = {
    status: 'running',
    lastCommandId: commandId,
    lastResult: '',
    commandSeq: nextCommandSeq,
  };
  renderAtlasJourneyState();
  const result = await dispatchUiCommand(commandId, {
    ...payload,
    projectId: currentProjectId,
  });
  if (commandId === 'atlas.mention.confirm' && result && result.ok) {
    atlasJourneyDraft = {
      ...atlasJourneyDraft,
      decisionId: payload?.decisionId || atlasJourneyDraft.decisionId,
      decisionEvidenceAnchor: payload?.evidenceAnchor || atlasJourneyDraft.decisionEvidenceAnchor || null,
    };
  }
  atlasJourneyState = {
    status: result && result.ok ? 'applied' : 'failed',
    lastCommandId: commandId,
    lastResult: result && result.ok ? 'persisted' : (result?.reason || result?.error?.reason || 'failed'),
    commandSeq: nextCommandSeq,
  };
  renderAtlasJourneyState();
  await refreshAtlasCurrentScene({ force: true });
  renderAtlasJourneyState();
  void refreshAtlasProductSurfaces({ currentScene: false }).catch((error) => {
    console.warn('Atlas background surface refresh failed', error);
  });
  return result;
}

function renderAtlasJourneyState() {
  if (!(atlasJourneyHost instanceof HTMLElement)) return;
  reconcileAtlasJourneyDraft();
  atlasJourneyHost.innerHTML = '';
  applyAtlasResolvedSurfaceBinding('journey', atlasJourneyHost, 'atlasJourneyProvider');
  atlasJourneyHost.dataset.atlasJourneyStatus = atlasJourneyState.status;
  atlasJourneyHost.dataset.atlasJourneyLastCommandId = atlasJourneyState.lastCommandId || '';
  atlasJourneyHost.dataset.atlasJourneyCommandSeq = String(atlasJourneyState.commandSeq || 0);
  atlasJourneyHost.dataset.atlasJourneySourceEntityId = atlasJourneyDraft.sourceEntityId || '';
  atlasJourneyHost.dataset.atlasJourneyTargetEntityId = atlasJourneyDraft.targetEntityId || '';
  atlasJourneyHost.dataset.atlasJourneyMentionId = atlasJourneyDraft.mentionId || '';

  const header = document.createElement('div');
  header.className = 'right-rail-atlas-matrices-head';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Atlas journey';
  const title = document.createElement('strong');
  title.className = 'right-rail-atlas-matrices-title';
  title.textContent = atlasCurrentSceneState.sceneTitle || currentDocumentTitle || 'Current scene';
  const status = document.createElement('span');
  status.className = 'right-rail-atlas-overview-hash';
  status.textContent = atlasJourneyState.lastResult || atlasJourneyState.status;
  header.append(label, title, status);
  atlasJourneyHost.appendChild(header);

  const entities = getAtlasJourneyEntities();
  const mentions = getAtlasJourneyMentions();
  const sourceEntity = findAtlasJourneyEntity(atlasJourneyDraft.sourceEntityId);
  const targetEntity = findAtlasJourneyEntity(atlasJourneyDraft.targetEntityId);
  const mention = findAtlasJourneyMention(atlasJourneyDraft.mentionId);

  const fields = document.createElement('div');
  fields.className = 'right-rail-atlas-journey-fields';
  appendAtlasJourneyField(fields, {
    fieldName: 'entityName',
    label: 'Entity name',
    value: atlasJourneyDraft.entityName,
    placeholder: currentDocumentTitle || atlasCurrentSceneState.sceneTitle || 'Name',
  });
  appendAtlasJourneyField(fields, {
    fieldName: 'aliasValue',
    label: 'Alias',
    value: atlasJourneyDraft.aliasValue,
    placeholder: sourceEntity?.name ? `${sourceEntity.name} alias` : 'Alias',
  });
  appendAtlasJourneySelect(fields, {
    fieldName: 'sourceEntityId',
    label: 'Source entity',
    value: atlasJourneyDraft.sourceEntityId,
    emptyLabel: 'No entity',
    options: entities.map((entity) => ({
      value: entity.entityId,
      label: formatAtlasJourneyEntityOption(entity),
    })),
  });
  appendAtlasJourneySelect(fields, {
    fieldName: 'targetEntityId',
    label: 'Target entity',
    value: atlasJourneyDraft.targetEntityId,
    emptyLabel: 'No target',
    options: entities
      .filter((entity) => entity.entityId !== atlasJourneyDraft.sourceEntityId)
      .map((entity) => ({
        value: entity.entityId,
        label: formatAtlasJourneyEntityOption(entity),
      })),
  });
  appendAtlasJourneySelect(fields, {
    fieldName: 'mentionId',
    label: 'Evidence mention',
    value: atlasJourneyDraft.mentionId,
    emptyLabel: 'No mention',
    options: mentions.map((item) => ({
      value: item.mentionId,
      label: formatAtlasJourneyMentionOption(item),
    })),
  });
  atlasJourneyHost.appendChild(fields);

  const actionBar = document.createElement('div');
  actionBar.className = 'right-rail-atlas-action-bar';
  actionBar.appendChild(makeAtlasCommandButton('Create entity', 'atlas.entity.create', () => ({
    entityId: makeStableUiId('atlas-entity'),
    name: getAtlasJourneyEntityName(),
    entityKind: 'character',
  }), { actionId: 'create-entity', disabled: !currentProjectId, reason: currentProjectId ? '' : 'Project is not open' }));
  actionBar.appendChild(makeAtlasCommandButton('Add alias', 'atlas.alias.add', () => ({
    entityId: atlasJourneyDraft.sourceEntityId || '',
    aliasId: makeStableUiId('atlas-alias'),
    value: getAtlasJourneyAliasValue(),
    scope: atlasCurrentSceneState.sceneId ? 'scene' : 'project',
    sceneId: atlasCurrentSceneState.sceneId || '',
  }), { actionId: 'add-alias', disabled: !sourceEntity, reason: sourceEntity ? '' : 'Select an entity' }));
  actionBar.appendChild(makeAtlasCommandButton('Confirm mention', 'atlas.mention.confirm', () => ({
    sceneId: mention?.sceneId || atlasCurrentSceneState.sceneId || '',
    entityId: mention?.entityId || atlasJourneyDraft.sourceEntityId || '',
    mentionId: mention?.mentionId || '',
    evidenceAnchor: mention?.evidenceAnchor || null,
    decisionId: ensureAtlasJourneyDraftId('decisionId', 'atlas-decision'),
  }), { actionId: 'confirm-mention', disabled: !mention, reason: mention ? '' : 'Select an exact mention' }));
  actionBar.appendChild(makeAtlasCommandButton('Suppress', 'atlas.observation.suppress', () => ({
    sceneId: mention?.sceneId || atlasCurrentSceneState.sceneId || '',
    entityId: mention?.entityId || atlasJourneyDraft.sourceEntityId || '',
    mentionId: mention?.mentionId || '',
    evidenceAnchor: mention?.evidenceAnchor || null,
    suppressionId: ensureAtlasJourneyDraftId('suppressionId', 'atlas-suppression'),
    reason: 'author-reviewed',
  }), { actionId: 'suppress-observation', disabled: !mention, reason: mention ? '' : 'Select an exact mention' }));
  actionBar.appendChild(makeAtlasCommandButton('Reassign', 'atlas.observation.reassign', () => ({
    sceneId: mention?.sceneId || atlasCurrentSceneState.sceneId || '',
    sourceEntityId: mention?.entityId || atlasJourneyDraft.sourceEntityId || '',
    targetEntityId: atlasJourneyDraft.targetEntityId || '',
    mentionId: mention?.mentionId || '',
    evidenceAnchor: mention?.evidenceAnchor || null,
    reassignmentId: ensureAtlasJourneyDraftId('reassignmentId', 'atlas-reassign'),
    reason: 'author-reviewed',
  }), { actionId: 'reassign-observation', disabled: !mention || !targetEntity, reason: targetEntity ? '' : 'Select a different target entity' }));
  actionBar.appendChild(makeAtlasCommandButton('Merge', 'atlas.entity.merge', () => ({
    sourceEntityId: atlasJourneyDraft.sourceEntityId || '',
    targetEntityId: atlasJourneyDraft.targetEntityId || '',
    operationId: ensureAtlasJourneyDraftId('mergeOperationId', 'atlas-merge'),
    reason: 'author-reviewed',
  }), { actionId: 'merge-entities', disabled: !sourceEntity || !targetEntity, reason: targetEntity ? '' : 'Select source and target entities' }));
  actionBar.appendChild(makeAtlasCommandButton('Split restore', 'atlas.entity.splitRestore', () => ({
    operationId: atlasJourneyDraft.mergeOperationId || '',
    restoreOperationId: ensureAtlasJourneyDraftId('restoreOperationId', 'atlas-split-restore'),
  }), { actionId: 'split-restore', disabled: !atlasJourneyDraft.mergeOperationId, reason: atlasJourneyDraft.mergeOperationId ? '' : 'Merge first' }));
  actionBar.appendChild(makeAtlasCommandButton('Reattach evidence', 'atlas.evidence.reattach', () => ({
    sourceRecordKind: 'decision',
    sourceRecordId: atlasJourneyDraft.decisionId || '',
    staleEvidenceAnchor: atlasJourneyDraft.decisionEvidenceAnchor || mention?.evidenceAnchor || null,
    newEvidenceAnchor: mention?.evidenceAnchor || null,
    reattachmentId: ensureAtlasJourneyDraftId('reattachmentId', 'atlas-reattach'),
    reason: 'author-reviewed',
  }), { actionId: 'reattach-evidence', disabled: !mention || !atlasJourneyDraft.decisionId, reason: atlasJourneyDraft.decisionId ? '' : 'Confirm a mention first' }));
  atlasJourneyHost.appendChild(actionBar);

  const targetSummary = document.createElement('div');
  targetSummary.className = 'right-rail-atlas-journey-targets';
  targetSummary.dataset.atlasJourneyTargetSummary = 'true';
  targetSummary.textContent = `Target: ${sourceEntity?.name || 'none'} -> ${targetEntity?.name || 'none'} · mention ${mention ? 'selected' : 'none'}`;
  atlasJourneyHost.appendChild(targetSummary);
}

function renderManualMapWorkbenchState() {
  renderManualMapWorkbenchInto(manualMapWorkbenchHost, { compact: true });
  if (manualMapPlanWorkspace instanceof HTMLElement && manualMapPlanWorkspace.hidden !== true) {
    renderManualMapWorkbenchInto(manualMapPlanHost, { compact: false });
  }
}

function getManualMapEventGraph() {
  return buildManualMapWorkbenchRuntimeModel(normalizeManualMapWorkbench(manualMapWorkbenchState)).presentationGraph;
}

function applyManualMapSelectionForRow(rowElement, event = null) {
  if (!(rowElement instanceof HTMLElement)) return;
  const runtime = buildManualMapWorkbenchRuntimeModel(normalizeManualMapWorkbench(manualMapWorkbenchState));
  const rowId = manualMapText(rowElement.dataset.manualMapRowId);
  const row = runtime.listParity.rows.find((item) => item.rowId === rowId);
  if (!row?.selectionIntent) return;
  const selectionIntent = {
    ...row.selectionIntent,
    payload: {
      ...(row.selectionIntent.payload || {}),
      additive: event && event.shiftKey === true,
    },
  };
  manualMapTransientViewState = reduceManualMapViewIntent(
    manualMapTransientViewState,
    selectionIntent,
    runtime.presentationGraph,
  );
  manualMapListState = {
    ...manualMapListState,
    activeRowId: rowId,
  };
  renderManualMapWorkbenchState();
}

function handleManualMapWorkbenchClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const host = target.closest('[data-manual-map-plan-host], [data-manual-map-workbench-host]');
  if (!(host instanceof HTMLElement)) return;
  const nodeElement = target.closest('[data-manual-map-node-id]');
  if (nodeElement instanceof Element) {
    const nodeId = manualMapText(nodeElement.getAttribute('data-manual-map-node-id'));
    setManualMapViewIntent({
      type: MANUAL_MAP_VIEW_INTENT.SELECT_NODE,
      payload: { nodeId, additive: event.shiftKey === true },
    }, getManualMapEventGraph());
    return;
  }
  const edgeElement = target.closest('[data-manual-map-edge-id]');
  if (edgeElement instanceof Element) {
    const edgeId = manualMapText(edgeElement.getAttribute('data-manual-map-edge-id'));
    setManualMapViewIntent({
      type: MANUAL_MAP_VIEW_INTENT.SELECT_EDGE,
      payload: { edgeId, additive: event.shiftKey === true },
    }, getManualMapEventGraph());
    return;
  }
  const rowElement = target.closest('[data-manual-map-row-id]');
  if (rowElement instanceof HTMLElement) {
    applyManualMapSelectionForRow(rowElement, event);
  }
}

function handleManualMapWorkbenchDoubleClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const nodeElement = target?.closest('[data-manual-map-node-id]');
  if (!(nodeElement instanceof Element)) return;
  const nodeId = manualMapText(nodeElement.getAttribute('data-manual-map-node-id'));
  if (!nodeId) return;
  if (manualMapPinnedNodeIds.has(nodeId)) {
    manualMapPinnedNodeIds.delete(nodeId);
  } else {
    manualMapPinnedNodeIds.add(nodeId);
  }
  renderManualMapWorkbenchState();
}

function handleManualMapWorkbenchKeydown(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('[data-manual-map-plan-host], [data-manual-map-workbench-host]')) return;
  const graph = getManualMapEventGraph();
  const rowScope = target.closest('[role="listbox"], [data-manual-map-row-id]');
  if (rowScope) {
    const result = reduceManualMapListKeyboardIntent({
      graph,
      viewState: manualMapTransientViewState,
      listState: manualMapListState,
      key: event.key,
      additive: event.shiftKey === true,
    });
    if (result.action !== 'noop') {
      event.preventDefault();
      manualMapTransientViewState = result.viewState || manualMapTransientViewState;
      manualMapListState = result.listState || manualMapListState;
      renderManualMapWorkbenchState();
    }
    return;
  }
  const panByKey = {
    ArrowLeft: { dx: -64, dy: 0 },
    ArrowRight: { dx: 64, dy: 0 },
    ArrowUp: { dx: 0, dy: -64 },
    ArrowDown: { dx: 0, dy: 64 },
  };
  if (panByKey[event.key]) {
    event.preventDefault();
    setManualMapViewIntent({
      type: MANUAL_MAP_VIEW_INTENT.PAN,
      payload: panByKey[event.key],
    }, graph);
  }
}

function handleManualMapWorkbenchWheel(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('[data-manual-map-canvas="true"]')) return;
  event.preventDefault();
  const graph = getManualMapEventGraph();
  const factor = event.deltaY > 0 ? 0.92 : 1.08;
  setManualMapViewIntent({
    type: MANUAL_MAP_VIEW_INTENT.ZOOM,
    payload: { factor },
  }, graph);
}

function handleManualMapWorkbenchPointerDown(event) {
  const target = event.target instanceof Element ? event.target : null;
  const nodeElement = target?.closest('[data-manual-map-node-id]');
  if (!(nodeElement instanceof Element)) return;
  const nodeId = manualMapText(nodeElement.getAttribute('data-manual-map-node-id'));
  const graph = getManualMapEventGraph();
  const node = getManualMapNodeById(graph, nodeId);
  if (!node) return;
  const position = manualMapNodePosition(node);
  manualMapDragState = {
    nodeId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: position.x,
    startY: position.y,
    zoom: manualMapNumber(manualMapTransientViewState.viewport?.zoom, 1) || 1,
  };
  setManualMapViewIntent({
    type: MANUAL_MAP_VIEW_INTENT.SELECT_NODE,
    payload: { nodeId, additive: event.shiftKey === true },
  }, graph);
}

function handleManualMapWorkbenchPointerUp(event) {
  if (!manualMapDragState) return;
  const drag = manualMapDragState;
  manualMapDragState = null;
  const dx = (event.clientX - drag.startClientX) / drag.zoom;
  const dy = (event.clientY - drag.startClientY) / drag.zoom;
  if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
  const state = normalizeManualMapWorkbench(manualMapWorkbenchState);
  if (!state.mapId || manualMapLayoutMode === MANUAL_MAP_LAYOUT_MODES.HIERARCHY) return;
  const nextPosition = {
    x: Math.round(drag.startX + dx),
    y: Math.round(drag.startY + dy),
  };
  openManualMapCommandDraft({
    commandId: 'manualMap.node.update',
    title: 'Move node',
    targetKind: 'node',
    targetId: drag.nodeId,
    risk: 'semantic',
    payload: {
      mapId: state.mapId,
      nodeId: drag.nodeId,
      position: nextPosition,
    },
    impactPreview: `Moves selected node ${drag.nodeId} to ${nextPosition.x}, ${nextPosition.y}. ViewState remains transient; only node position is written after Apply.`,
  });
}

async function refreshManualMapWorkbench(options = {}) {
  const workspaceVisible = manualMapPlanWorkspace instanceof HTMLElement && manualMapPlanWorkspace.hidden !== true;
  if (currentRightTab !== 'atlas' && workspaceVisible !== true && options.force !== true) return;
  manualMapWorkbenchState = {
    ...manualMapWorkbenchState,
    state: currentProjectId ? 'loading' : 'empty',
    projectId: currentProjectId || '',
  };
  renderManualMapWorkbenchState();
  const result = await invokeWorkspaceQueryBridge(MANUAL_MAP_WORKBENCH_QUERY_ID, {
    projectId: currentProjectId,
    mapId: manualMapWorkbenchState.mapId || '',
  });
  const nextState = result && result.ok !== false && result.manualMapWorkbench
    ? result.manualMapWorkbench
    : { state: 'unavailable', unavailableReason: 'MANUAL_MAP_WORKBENCH_QUERY_FAILED' };
  manualMapWorkbenchState = normalizeManualMapWorkbench(nextState);
  renderManualMapWorkbenchState();
}

function renderProjectionInspectorState() {
  if (!(projectionInspectorHost instanceof HTMLElement)) return;
  const state = normalizeProjectionInspector(projectionInspectorState);
  projectionInspectorHost.innerHTML = '';
  applyAtlasResolvedSurfaceBinding('projection', projectionInspectorHost, 'projectionInspectorProvider');
  projectionInspectorHost.dataset.projectionInspectorStatus = state.state;

  const header = document.createElement('div');
  header.className = 'right-rail-atlas-matrices-head';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Projection inspector';
  const title = document.createElement('strong');
  title.className = 'right-rail-atlas-matrices-title';
  title.textContent = 'Plot, Idea, Meaning';
  const meta = document.createElement('span');
  meta.className = 'right-rail-atlas-overview-hash';
  meta.textContent = `${state.summary.readyCount}/${state.summary.manifestCount || state.projectionStates.length}`;
  header.append(label, title, meta);
  projectionInspectorHost.appendChild(header);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'right-rail-atlas-state right-rail-atlas-state--blocked';
    unavailable.textContent = state.unavailableReason || 'PROJECTION_INSPECTOR_UNAVAILABLE';
    projectionInspectorHost.appendChild(unavailable);
    return;
  }
  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'right-rail-atlas-state';
    loading.textContent = 'Projection inspector обновляется.';
    projectionInspectorHost.appendChild(loading);
    return;
  }

  const metrics = document.createElement('div');
  metrics.className = 'right-rail-atlas-overview-metrics right-rail-atlas-matrices-metrics';
  appendAtlasOverviewMetric(metrics, 'ready', state.summary.readyCount);
  appendAtlasOverviewMetric(metrics, 'empty', state.summary.emptyCount);
  appendAtlasOverviewMetric(metrics, 'unavail.', state.summary.unavailableCount, state.summary.unavailableCount > 0 ? 'reviewRequired' : 'current');
  appendAtlasOverviewMetric(metrics, 'manifests', state.summary.manifestCount || state.manifests.length);
  projectionInspectorHost.appendChild(metrics);

  const rowsSection = appendAtlasOverviewSection(projectionInspectorHost, 'Projection states', { open: true });
  const rows = document.createElement('div');
  rows.className = 'right-rail-atlas-matrix-list';
  for (const item of state.projectionStates) {
    appendAtlasReportsRow(
      rows,
      item.projectionId || item.inspectorId || 'projection',
      `${item.state || 'empty'} · ${item.itemCount || 0} items · ${item.fallbackCode || item.projectionHash || ''}`,
      item.state === 'ready' ? 'current' : 'reviewRequired',
    );
  }
  if (state.projectionStates.length < 1) {
    appendAtlasReportsRow(rows, 'No projection states', 'Read models will appear after project data exists.');
  }
  rowsSection.appendChild(rows);

  const boundary = appendAtlasOverviewSection(projectionInspectorHost, 'Promotion boundary', { open: true });
  appendAtlasReportsRow(boundary, 'Plot', 'Read projection from scenes and confirmed mentions', 'current');
  appendAtlasReportsRow(boundary, 'Idea', 'Author truth: idea.create and idea.originLink.add', 'current');
  appendAtlasReportsRow(boundary, 'Meaning', 'Promotion only through meaning.promote via CommandKernel only', 'current');
}

async function refreshProjectionInspector() {
  if (currentRightTab !== 'atlas') return;
  projectionInspectorState = {
    ...projectionInspectorState,
    state: currentProjectId ? 'loading' : 'empty',
    projectId: currentProjectId || '',
  };
  renderProjectionInspectorState();
  const result = await invokeWorkspaceQueryBridge(PROJECTION_INSPECTOR_QUERY_ID, {
    projectId: currentProjectId,
  });
  const nextState = result && result.ok !== false && result.projectionInspector
    ? result.projectionInspector
    : { state: 'unavailable', unavailableReason: 'PROJECTION_INSPECTOR_QUERY_FAILED' };
  projectionInspectorState = normalizeProjectionInspector(nextState);
  renderProjectionInspectorState();
}

function renderAtlasOverviewState() {
  if (!(atlasOverviewHost instanceof HTMLElement)) return;
  const state = normalizeAtlasOverview(atlasOverviewState);
  atlasOverviewHost.innerHTML = '';
  atlasOverviewHost.dataset.atlasOverviewStatus = state.state;
  applyAtlasResolvedSurfaceBinding('overview', atlasOverviewHost, 'atlasOverviewProvider');

  const header = document.createElement('div');
  header.className = 'right-rail-atlas-overview-head';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Atlas overview';
  const hash = document.createElement('span');
  hash.className = 'right-rail-atlas-overview-hash';
  hash.textContent = state.summary.overviewHash ? state.summary.overviewHash.slice(0, 8) : state.summary.evidenceHealth;
  header.append(label, hash);
  atlasOverviewHost.appendChild(header);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'right-rail-atlas-state right-rail-atlas-state--blocked';
    unavailable.textContent = state.unavailableReason || 'ATLAS_OVERVIEW_UNAVAILABLE';
    atlasOverviewHost.appendChild(unavailable);
    return;
  }

  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'right-rail-atlas-state';
    loading.textContent = 'Atlas overview обновляется.';
    atlasOverviewHost.appendChild(loading);
    return;
  }

  const metrics = document.createElement('div');
  metrics.className = 'right-rail-atlas-overview-metrics';
  appendAtlasOverviewMetric(metrics, 'сцен', state.summary.sceneCount);
  appendAtlasOverviewMetric(metrics, 'сущн.', state.summary.entityCount);
  appendAtlasOverviewMetric(metrics, 'набл.', state.summary.activeObservationCount);
  appendAtlasOverviewMetric(metrics, 'связей', state.summary.cooccurrencePairCount);
  appendAtlasOverviewMetric(metrics, 'граф', `${state.summary.graphNodeCount}/${state.summary.graphEdgeCount}`, state.summary.evidenceHealth);
  atlasOverviewHost.appendChild(metrics);

  if (state.summary.observationCount < 1) {
    const empty = document.createElement('div');
    empty.className = 'right-rail-atlas-state';
    empty.textContent = 'Atlas overview пуст.';
    atlasOverviewHost.appendChild(empty);
    return;
  }

  const health = appendAtlasOverviewSection(atlasOverviewHost, 'Health', { open: true });
  appendAtlasOverviewRow(health, state.summary.evidenceHealth, `${state.summary.evidenceAnchorCount} evidence anchors`, state.degradedCapabilities.length ? 'degraded' : 'ready');
  for (const item of state.degradedCapabilities.slice(0, 4)) {
    appendAtlasOverviewRow(health, item.code || 'ATLAS_DEGRADED', item.detail || '');
  }

  const entities = appendAtlasOverviewSection(atlasOverviewHost, 'Entities');
  for (const entity of state.topEntities.slice(0, 5)) {
    const row = appendAtlasOverviewRow(entities, entity.name || entity.entityId || 'Entity', `${entity.appearanceCount || 0} appearances, ${entity.sceneCount || 0} scenes`, entity.entityKind || '');
    if (entity.entityId) {
      row.dataset.atlasEntityId = entity.entityId;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Open Atlas entity ${entity.name || entity.entityId}`);
    }
  }

  const relations = appendAtlasOverviewSection(atlasOverviewHost, 'Relations');
  for (const relation of state.topRelations.slice(0, 5)) {
    const row = appendAtlasOverviewRow(relations, `${relation.leftName || relation.leftEntityId} ↔ ${relation.rightName || relation.rightEntityId}`, `${relation.occurrenceCount || 0} occurrences`, `${relation.sceneCount || 0} scenes`);
    if (relation.pairId) {
      row.dataset.atlasRelationPairId = relation.pairId;
      row.dataset.atlasRelationLeftEntityId = relation.leftEntityId || '';
      row.dataset.atlasRelationRightEntityId = relation.rightEntityId || '';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Open Atlas relation ${relation.leftName || relation.leftEntityId} and ${relation.rightName || relation.rightEntityId}`);
    }
  }

  const graph = appendAtlasOverviewSection(atlasOverviewHost, 'Graph');
  appendAtlasOverviewRow(graph, `${state.graphPreview.clusterCount || 0} clusters`, `${state.graphPreview.nodeCount || 0} nodes, ${state.graphPreview.edgeCount || 0} edges`, state.graphPreview.state || 'empty');
  for (const cluster of state.graphPreview.clusters.slice(0, 4)) {
    appendAtlasOverviewRow(graph, cluster.clusterKind || 'cluster', `${cluster.nodeCount || 0} nodes`, `${cluster.edgeCount || 0} edges`);
  }
}

async function refreshAtlasOverview() {
  if (currentRightTab !== 'atlas') return;
  atlasOverviewState = {
    ...atlasOverviewState,
    state: currentProjectId ? 'loading' : 'empty',
    projectId: currentProjectId || '',
  };
  renderAtlasOverviewState();
  const result = await invokeWorkspaceQueryBridge(ATLAS_OVERVIEW_QUERY_ID, {
    projectId: currentProjectId,
    limit: 5,
  });
  const nextState = result && result.ok !== false && result.atlasOverview
    ? result.atlasOverview
    : { state: 'unavailable', unavailableReason: 'ATLAS_OVERVIEW_QUERY_FAILED' };
  atlasOverviewState = normalizeAtlasOverview(nextState);
  renderAtlasOverviewState();
}

function normalizeAtlasEntityDossier(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary) ? source.summary : {};
  const ledger = source.evidenceLedger && typeof source.evidenceLedger === 'object' && !Array.isArray(source.evidenceLedger)
    ? source.evidenceLedger
    : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'derived.atlas.entityDossier.v1',
    state: typeof source.state === 'string' ? source.state : 'empty',
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    requestedEntityId: typeof source.requestedEntityId === 'string' ? source.requestedEntityId : '',
    selectedEntityId: typeof source.selectedEntityId === 'string' ? source.selectedEntityId : '',
    entity: source.entity && typeof source.entity === 'object' && !Array.isArray(source.entity) ? source.entity : null,
    aliases: Array.isArray(source.aliases) ? source.aliases.filter(reviewSurfaceIsPlainObject) : [],
    summary: {
      observationCount: Number.isInteger(summary.observationCount) ? Math.max(0, summary.observationCount) : 0,
      activeObservationCount: Number.isInteger(summary.activeObservationCount) ? Math.max(0, summary.activeObservationCount) : 0,
      suppressedObservationCount: Number.isInteger(summary.suppressedObservationCount) ? Math.max(0, summary.suppressedObservationCount) : 0,
      sceneCount: Number.isInteger(summary.sceneCount) ? Math.max(0, summary.sceneCount) : 0,
      aliasCount: Number.isInteger(summary.aliasCount) ? Math.max(0, summary.aliasCount) : 0,
      relationCount: Number.isInteger(summary.relationCount) ? Math.max(0, summary.relationCount) : 0,
      evidenceRowCount: Number.isInteger(summary.evidenceRowCount) ? Math.max(0, summary.evidenceRowCount) : 0,
      sourceRecordEvidenceCount: Number.isInteger(summary.sourceRecordEvidenceCount) ? Math.max(0, summary.sourceRecordEvidenceCount) : 0,
      reviewRequiredEvidenceCount: Number.isInteger(summary.reviewRequiredEvidenceCount) ? Math.max(0, summary.reviewRequiredEvidenceCount) : 0,
      reattachedEvidenceCount: Number.isInteger(summary.reattachedEvidenceCount) ? Math.max(0, summary.reattachedEvidenceCount) : 0,
      currentEvidenceCount: Number.isInteger(summary.currentEvidenceCount) ? Math.max(0, summary.currentEvidenceCount) : 0,
      evidenceHealth: typeof summary.evidenceHealth === 'string' ? summary.evidenceHealth : 'empty',
      dossierHash: typeof summary.dossierHash === 'string' ? summary.dossierHash : '',
    },
    relationRows: Array.isArray(source.relationRows) ? source.relationRows.filter(reviewSurfaceIsPlainObject) : [],
    absenceIntervals: Array.isArray(source.absenceIntervals) ? source.absenceIntervals.filter(reviewSurfaceIsPlainObject) : [],
    evidenceLedger: {
      schemaVersion: typeof ledger.schemaVersion === 'string' ? ledger.schemaVersion : 'derived.atlas.entityEvidenceLedger.v1',
      state: typeof ledger.state === 'string' ? ledger.state : 'empty',
      readOnly: ledger.readOnly !== false,
      commandAuthority: typeof ledger.commandAuthority === 'string' ? ledger.commandAuthority : 'none',
      rows: Array.isArray(ledger.rows) ? ledger.rows.filter(reviewSurfaceIsPlainObject) : [],
    },
  };
}

function renderAtlasEntityDossierState() {
  if (!(atlasEntityDossierHost instanceof HTMLElement)) return;
  const state = normalizeAtlasEntityDossier(atlasEntityDossierState);
  atlasEntityDossierHost.innerHTML = '';
  atlasEntityDossierHost.dataset.atlasEntityDossierStatus = state.state;
  applyAtlasResolvedSurfaceBinding('entity', atlasEntityDossierHost, 'atlasEntityDossierProvider');
  atlasEntityDossierHost.dataset.atlasSelectedEntityId = state.selectedEntityId || atlasSelectedEntityId || '';

  const header = document.createElement('div');
  header.className = 'right-rail-atlas-entity-dossier-head';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Entity dossier';
  const name = document.createElement('strong');
  name.className = 'right-rail-atlas-entity-dossier-name';
  name.textContent = state.entity?.name || state.selectedEntityId || 'Entity';
  const hash = document.createElement('span');
  hash.className = 'right-rail-atlas-overview-hash';
  hash.textContent = state.summary.dossierHash ? state.summary.dossierHash.slice(0, 8) : state.summary.evidenceHealth;
  header.append(label, name, hash);
  atlasEntityDossierHost.appendChild(header);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'right-rail-atlas-state right-rail-atlas-state--blocked';
    unavailable.textContent = state.unavailableReason || 'ATLAS_ENTITY_DOSSIER_UNAVAILABLE';
    atlasEntityDossierHost.appendChild(unavailable);
    return;
  }
  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'right-rail-atlas-state';
    loading.textContent = 'Entity dossier обновляется.';
    atlasEntityDossierHost.appendChild(loading);
    return;
  }
  if (!state.selectedEntityId) {
    const empty = document.createElement('div');
    empty.className = 'right-rail-atlas-state';
    empty.textContent = 'Выберите сущность в Atlas overview или текущей сцене.';
    atlasEntityDossierHost.appendChild(empty);
    return;
  }

  const metrics = document.createElement('div');
  metrics.className = 'right-rail-atlas-overview-metrics right-rail-atlas-entity-dossier-metrics';
  appendAtlasOverviewMetric(metrics, 'сцен', state.summary.sceneCount);
  appendAtlasOverviewMetric(metrics, 'набл.', state.summary.activeObservationCount);
  appendAtlasOverviewMetric(metrics, 'evidence', state.summary.evidenceRowCount, state.summary.evidenceHealth);
  appendAtlasOverviewMetric(metrics, 'review', state.summary.reviewRequiredEvidenceCount, state.summary.reviewRequiredEvidenceCount > 0 ? 'reviewRequired' : 'current');
  atlasEntityDossierHost.appendChild(metrics);

  if (state.aliases.length > 0) {
    const aliases = appendAtlasOverviewSection(atlasEntityDossierHost, 'Aliases');
    for (const alias of state.aliases.slice(0, 6)) {
      appendAtlasOverviewRow(aliases, alias.value || alias.aliasId || 'alias', alias.scope || 'project', alias.sceneId || '');
    }
  }

  const relations = appendAtlasOverviewSection(atlasEntityDossierHost, 'Relations');
  for (const relation of state.relationRows.slice(0, 6)) {
    const row = appendAtlasOverviewRow(relations, relation.otherName || relation.otherEntityId || 'Entity', `${relation.occurrenceCount || 0} occurrences`, `${relation.sceneCount || 0} scenes`);
    if (relation.pairId) {
      row.dataset.atlasRelationPairId = relation.pairId;
      row.dataset.atlasRelationLeftEntityId = state.selectedEntityId || '';
      row.dataset.atlasRelationRightEntityId = relation.otherEntityId || '';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Open Atlas relation ${state.entity?.name || state.selectedEntityId} and ${relation.otherName || relation.otherEntityId}`);
    }
  }
  if (state.relationRows.length < 1) {
    appendAtlasOverviewRow(relations, 'No relation evidence yet', '', '');
  }

  const evidence = appendAtlasOverviewSection(atlasEntityDossierHost, 'Evidence ledger', { open: true });
  for (const row of state.evidenceLedger.rows.slice(0, 8)) {
    appendAtlasOverviewRow(evidence, row.quote || row.sourceRecordId || row.observationId || 'evidence', `${row.rowKind || 'row'} ${row.sceneId || ''}`.trim(), row.evidenceState || 'CURRENT');
  }
  if (state.evidenceLedger.rows.length < 1) {
    appendAtlasOverviewRow(evidence, 'No evidence rows yet', '', '');
  }
}

async function refreshAtlasEntityDossier() {
  if (currentRightTab !== 'atlas') return;
  atlasEntityDossierState = {
    ...atlasEntityDossierState,
    state: currentProjectId ? 'loading' : 'empty',
    projectId: currentProjectId || '',
    requestedEntityId: atlasSelectedEntityId || '',
  };
  renderAtlasEntityDossierState();
  const result = await invokeWorkspaceQueryBridge(ATLAS_ENTITY_DOSSIER_QUERY_ID, {
    projectId: currentProjectId,
    entityId: atlasSelectedEntityId || '',
    limit: 8,
  });
  const nextState = result && result.ok !== false && result.atlasEntityDossier
    ? result.atlasEntityDossier
    : { state: 'unavailable', unavailableReason: 'ATLAS_ENTITY_DOSSIER_QUERY_FAILED' };
  atlasEntityDossierState = normalizeAtlasEntityDossier(nextState);
  atlasSelectedEntityId = atlasEntityDossierState.selectedEntityId || atlasSelectedEntityId || '';
  renderAtlasEntityDossierState();
}

function selectAtlasEntity(entityId = '') {
  const normalized = typeof entityId === 'string' ? entityId.trim() : '';
  if (!normalized) return;
  atlasSelectedEntityId = normalized;
  setCurrentAtlasSurface('entity', { refresh: false });
  refreshAtlasEntityDossier();
  updateStatusText('Atlas entity dossier открыт');
}

function normalizeAtlasRelationDossier(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary) ? source.summary : {};
  const packet = source.evidencePacket && typeof source.evidencePacket === 'object' && !Array.isArray(source.evidencePacket)
    ? source.evidencePacket
    : {};
  const actions = source.contextualReviewActions && typeof source.contextualReviewActions === 'object' && !Array.isArray(source.contextualReviewActions)
    ? source.contextualReviewActions
    : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'derived.atlas.relationDossier.v1',
    state: typeof source.state === 'string' ? source.state : 'empty',
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    requestedPairId: typeof source.requestedPairId === 'string' ? source.requestedPairId : '',
    requestedLeftEntityId: typeof source.requestedLeftEntityId === 'string' ? source.requestedLeftEntityId : '',
    requestedRightEntityId: typeof source.requestedRightEntityId === 'string' ? source.requestedRightEntityId : '',
    selectedPairId: typeof source.selectedPairId === 'string' ? source.selectedPairId : '',
    relation: source.relation && typeof source.relation === 'object' && !Array.isArray(source.relation) ? source.relation : null,
    summary: {
      sceneCount: Number.isInteger(summary.sceneCount) ? Math.max(0, summary.sceneCount) : 0,
      occurrenceCount: Number.isInteger(summary.occurrenceCount) ? Math.max(0, summary.occurrenceCount) : 0,
      evidenceRowCount: Number.isInteger(summary.evidenceRowCount) ? Math.max(0, summary.evidenceRowCount) : 0,
      leftEvidenceCount: Number.isInteger(summary.leftEvidenceCount) ? Math.max(0, summary.leftEvidenceCount) : 0,
      rightEvidenceCount: Number.isInteger(summary.rightEvidenceCount) ? Math.max(0, summary.rightEvidenceCount) : 0,
      reviewRequiredEvidenceCount: Number.isInteger(summary.reviewRequiredEvidenceCount) ? Math.max(0, summary.reviewRequiredEvidenceCount) : 0,
      absenceIntervalCount: Number.isInteger(summary.absenceIntervalCount) ? Math.max(0, summary.absenceIntervalCount) : 0,
      actionCount: Number.isInteger(summary.actionCount) ? Math.max(0, summary.actionCount) : 0,
      availableActionCount: Number.isInteger(summary.availableActionCount) ? Math.max(0, summary.availableActionCount) : 0,
      evidenceHealth: typeof summary.evidenceHealth === 'string' ? summary.evidenceHealth : 'empty',
      dossierHash: typeof summary.dossierHash === 'string' ? summary.dossierHash : '',
    },
    evidencePacket: {
      schemaVersion: typeof packet.schemaVersion === 'string' ? packet.schemaVersion : 'derived.atlas.relationEvidencePacket.v1',
      state: typeof packet.state === 'string' ? packet.state : 'empty',
      readOnly: packet.readOnly !== false,
      rows: Array.isArray(packet.rows) ? packet.rows.filter(reviewSurfaceIsPlainObject) : [],
    },
    timelineRows: Array.isArray(source.timelineRows) ? source.timelineRows.filter(reviewSurfaceIsPlainObject) : [],
    absenceContext: Array.isArray(source.absenceContext) ? source.absenceContext.filter(reviewSurfaceIsPlainObject) : [],
    contextualReviewActions: {
      schemaVersion: typeof actions.schemaVersion === 'string' ? actions.schemaVersion : 'derived.atlas.relationContextualActions.v1',
      state: typeof actions.state === 'string' ? actions.state : 'empty',
      commandAuthority: typeof actions.commandAuthority === 'string' ? actions.commandAuthority : 'CommandKernel',
      directDispatch: actions.directDispatch === true ? true : false,
      actions: Array.isArray(actions.actions) ? actions.actions.filter(reviewSurfaceIsPlainObject) : [],
    },
  };
}

function isAtlasRelationActionCapabilityAvailable(action) {
  if (!isAtlasRelationReviewActionCommandId(action.commandId)) return false;
  if (action.availability !== 'available') return false;
  const capability = enforceCapabilityForCommand(
    action.commandId,
    { platformId: 'node', editorMode: currentEditorMode },
    { platformId: 'node' },
  );
  return capability.ok === true;
}

function appendAtlasRelationAction(parent, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'right-rail-atlas-action';
  button.dataset.atlasRelationActionId = action.actionId || '';
  button.dataset.commandId = action.commandId || '';
  button.dataset.payloadPreview = JSON.stringify(action.payloadPreview || {});
  button.textContent = action.label || action.commandId || 'Review action';
  const available = isAtlasRelationActionCapabilityAvailable(action);
  button.disabled = !available;
  button.setAttribute('aria-disabled', available ? 'false' : 'true');
  button.title = available
    ? `Command Kernel intent: ${action.commandId}`
    : action.unavailableReason || action.availability || 'Unavailable';
  parent.appendChild(button);
  return button;
}

function renderAtlasRelationDossierState() {
  if (!(atlasRelationDossierHost instanceof HTMLElement)) return;
  const state = normalizeAtlasRelationDossier(atlasRelationDossierState);
  atlasRelationDossierHost.innerHTML = '';
  atlasRelationDossierHost.dataset.atlasRelationDossierStatus = state.state;
  applyAtlasResolvedSurfaceBinding('relation', atlasRelationDossierHost, 'atlasRelationDossierProvider');
  atlasRelationDossierHost.dataset.atlasSelectedRelationPairId = state.selectedPairId || atlasSelectedRelation.pairId || '';

  const header = document.createElement('div');
  header.className = 'right-rail-atlas-relation-dossier-head';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Relation dossier';
  const name = document.createElement('strong');
  name.className = 'right-rail-atlas-relation-dossier-name';
  name.textContent = state.relation
    ? `${state.relation.leftName || state.relation.leftEntityId} - ${state.relation.rightName || state.relation.rightEntityId}`
    : 'Entity pair';
  const hash = document.createElement('span');
  hash.className = 'right-rail-atlas-overview-hash';
  hash.textContent = state.summary.dossierHash ? state.summary.dossierHash.slice(0, 8) : state.summary.evidenceHealth;
  header.append(label, name, hash);
  atlasRelationDossierHost.appendChild(header);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'right-rail-atlas-state right-rail-atlas-state--blocked';
    unavailable.textContent = state.unavailableReason || 'ATLAS_RELATION_DOSSIER_UNAVAILABLE';
    atlasRelationDossierHost.appendChild(unavailable);
    return;
  }
  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'right-rail-atlas-state';
    loading.textContent = 'Relation dossier обновляется.';
    atlasRelationDossierHost.appendChild(loading);
    return;
  }
  if (!state.selectedPairId) {
    const empty = document.createElement('div');
    empty.className = 'right-rail-atlas-state';
    empty.textContent = 'Выберите relation в Atlas overview или entity dossier.';
    atlasRelationDossierHost.appendChild(empty);
    return;
  }

  const metrics = document.createElement('div');
  metrics.className = 'right-rail-atlas-overview-metrics right-rail-atlas-relation-dossier-metrics';
  appendAtlasOverviewMetric(metrics, 'сцен', state.summary.sceneCount);
  appendAtlasOverviewMetric(metrics, 'co-occur', state.summary.occurrenceCount);
  appendAtlasOverviewMetric(metrics, 'evidence', state.summary.evidenceRowCount, state.summary.evidenceHealth);
  appendAtlasOverviewMetric(metrics, 'actions', `${state.summary.availableActionCount}/${state.summary.actionCount}`, state.summary.availableActionCount > 0 ? 'current' : 'empty');
  atlasRelationDossierHost.appendChild(metrics);

  const actionBar = document.createElement('div');
  actionBar.className = 'right-rail-atlas-action-bar';
  for (const action of state.contextualReviewActions.actions.slice(0, 4)) {
    appendAtlasRelationAction(actionBar, action);
  }
  if (actionBar.childElementCount > 0) atlasRelationDossierHost.appendChild(actionBar);

  const timeline = appendAtlasOverviewSection(atlasRelationDossierHost, 'Co-occurrence timeline', { open: true });
  for (const row of state.timelineRows.slice(0, 8)) {
    appendAtlasOverviewRow(timeline, row.sceneId || 'scene', `${row.leftObservationCount || 0}/${row.rightObservationCount || 0} observations`, `${row.evidenceAnchorIds?.length || 0} anchors`);
  }
  if (state.timelineRows.length < 1) {
    appendAtlasOverviewRow(timeline, 'No co-occurrence timeline yet', '', '');
  }

  const evidence = appendAtlasOverviewSection(atlasRelationDossierHost, 'Pair evidence');
  for (const row of state.evidencePacket.rows.slice(0, 8)) {
    appendAtlasOverviewRow(evidence, row.quote || row.sourceRecordId || row.observationId || 'evidence', `${row.side || 'pair'} ${row.sceneId || ''}`.trim(), row.evidenceState || 'CURRENT');
  }
  if (state.evidencePacket.rows.length < 1) {
    appendAtlasOverviewRow(evidence, 'No pair evidence rows yet', '', '');
  }

  const absence = appendAtlasOverviewSection(atlasRelationDossierHost, 'Absence context');
  for (const row of state.absenceContext.slice(0, 6)) {
    appendAtlasOverviewRow(absence, row.entityId || 'entity', `${row.length || 0} scenes absent`, `${row.startSceneOrdinal || 0}-${row.endSceneOrdinal || 0}`);
  }
  if (state.absenceContext.length < 1) {
    appendAtlasOverviewRow(absence, 'No absence interval between appearances', '', '');
  }
}

async function refreshAtlasRelationDossier() {
  if (currentRightTab !== 'atlas') return;
  atlasRelationDossierState = {
    ...atlasRelationDossierState,
    state: currentProjectId ? 'loading' : 'empty',
    projectId: currentProjectId || '',
    requestedPairId: atlasSelectedRelation.pairId || '',
    requestedLeftEntityId: atlasSelectedRelation.leftEntityId || '',
    requestedRightEntityId: atlasSelectedRelation.rightEntityId || '',
  };
  renderAtlasRelationDossierState();
  const result = await invokeWorkspaceQueryBridge(ATLAS_RELATION_DOSSIER_QUERY_ID, {
    projectId: currentProjectId,
    pairId: atlasSelectedRelation.pairId || '',
    leftEntityId: atlasSelectedRelation.leftEntityId || '',
    rightEntityId: atlasSelectedRelation.rightEntityId || '',
    limit: 8,
  });
  const nextState = result && result.ok !== false && result.atlasRelationDossier
    ? result.atlasRelationDossier
    : { state: 'unavailable', unavailableReason: 'ATLAS_RELATION_DOSSIER_QUERY_FAILED' };
  atlasRelationDossierState = normalizeAtlasRelationDossier(nextState);
  atlasSelectedRelation = {
    pairId: atlasRelationDossierState.selectedPairId || atlasSelectedRelation.pairId || '',
    leftEntityId: atlasRelationDossierState.relation?.leftEntityId || atlasSelectedRelation.leftEntityId || '',
    rightEntityId: atlasRelationDossierState.relation?.rightEntityId || atlasSelectedRelation.rightEntityId || '',
  };
  renderAtlasRelationDossierState();
}

function selectAtlasRelation(relation = {}) {
  const source = relation && typeof relation === 'object' && !Array.isArray(relation) ? relation : {};
  const pairId = typeof source.pairId === 'string' ? source.pairId.trim() : '';
  const leftEntityId = typeof source.leftEntityId === 'string' ? source.leftEntityId.trim() : '';
  const rightEntityId = typeof source.rightEntityId === 'string' ? source.rightEntityId.trim() : '';
  if (!pairId && (!leftEntityId || !rightEntityId)) return;
  atlasSelectedRelation = { pairId, leftEntityId, rightEntityId };
  setCurrentAtlasSurface('relation', { refresh: false });
  refreshAtlasRelationDossier();
  updateStatusText('Atlas relation dossier открыт');
}

function normalizeAtlasMatrixAxis(axis = {}, kind = '') {
  const source = axis && typeof axis === 'object' && !Array.isArray(axis) ? axis : {};
  return {
    kind: typeof source.kind === 'string' ? source.kind : kind,
    totalCount: Number.isInteger(source.totalCount) ? Math.max(0, source.totalCount) : 0,
    visibleCount: Number.isInteger(source.visibleCount) ? Math.max(0, source.visibleCount) : 0,
    omittedCount: Number.isInteger(source.omittedCount) ? Math.max(0, source.omittedCount) : 0,
    clipped: source.clipped === true,
  };
}

function normalizeAtlasMatrixTable(matrix = {}, fallbackSchemaVersion = '') {
  const source = matrix && typeof matrix === 'object' && !Array.isArray(matrix) ? matrix : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : fallbackSchemaVersion,
    state: typeof source.state === 'string' ? source.state : 'empty',
    rowAxis: normalizeAtlasMatrixAxis(source.rowAxis, 'entity'),
    columnAxis: normalizeAtlasMatrixAxis(source.columnAxis, 'scene'),
    columns: Array.isArray(source.columns) ? source.columns.filter(reviewSurfaceIsPlainObject) : [],
    rows: Array.isArray(source.rows) ? source.rows.filter(reviewSurfaceIsPlainObject) : [],
  };
}

function normalizeAtlasMatrices(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary) ? source.summary : {};
  const parity = source.listParity && typeof source.listParity === 'object' && !Array.isArray(source.listParity) ? source.listParity : {};
  const accessibility = source.accessibilityContract && typeof source.accessibilityContract === 'object' && !Array.isArray(source.accessibilityContract)
    ? source.accessibilityContract
    : {};
  const keyboard = accessibility.keyboardNavigation && typeof accessibility.keyboardNavigation === 'object' && !Array.isArray(accessibility.keyboardNavigation)
    ? accessibility.keyboardNavigation
    : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'derived.atlas.matrices.v1',
    state: typeof source.state === 'string' ? source.state : 'empty',
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    summary: {
      entityCount: Number.isInteger(summary.entityCount) ? Math.max(0, summary.entityCount) : 0,
      sceneCount: Number.isInteger(summary.sceneCount) ? Math.max(0, summary.sceneCount) : 0,
      entitySceneCellCount: Number.isInteger(summary.entitySceneCellCount) ? Math.max(0, summary.entitySceneCellCount) : 0,
      relationCellCount: Number.isInteger(summary.relationCellCount) ? Math.max(0, summary.relationCellCount) : 0,
      entitySceneListRowCount: Number.isInteger(summary.entitySceneListRowCount) ? Math.max(0, summary.entitySceneListRowCount) : 0,
      relationListRowCount: Number.isInteger(summary.relationListRowCount) ? Math.max(0, summary.relationListRowCount) : 0,
      omittedEntityCount: Number.isInteger(summary.omittedEntityCount) ? Math.max(0, summary.omittedEntityCount) : 0,
      omittedSceneCount: Number.isInteger(summary.omittedSceneCount) ? Math.max(0, summary.omittedSceneCount) : 0,
      omittedEntitySceneCellCount: Number.isInteger(summary.omittedEntitySceneCellCount) ? Math.max(0, summary.omittedEntitySceneCellCount) : 0,
      omittedRelationCellCount: Number.isInteger(summary.omittedRelationCellCount) ? Math.max(0, summary.omittedRelationCellCount) : 0,
      matrixHash: typeof summary.matrixHash === 'string' ? summary.matrixHash : '',
    },
    entitySceneMatrix: normalizeAtlasMatrixTable(source.entitySceneMatrix, 'derived.atlas.entitySceneMatrix.v1'),
    relationMatrix: normalizeAtlasMatrixTable(source.relationMatrix, 'derived.atlas.relationMatrix.v1'),
    listParity: {
      entitySceneRows: Array.isArray(parity.entitySceneRows) ? parity.entitySceneRows.filter(reviewSurfaceIsPlainObject) : [],
      relationRows: Array.isArray(parity.relationRows) ? parity.relationRows.filter(reviewSurfaceIsPlainObject) : [],
      omittedEntitySceneRowCount: Number.isInteger(parity.omittedEntitySceneRowCount) ? Math.max(0, parity.omittedEntitySceneRowCount) : 0,
      omittedRelationRowCount: Number.isInteger(parity.omittedRelationRowCount) ? Math.max(0, parity.omittedRelationRowCount) : 0,
    },
    accessibilityContract: {
      schemaVersion: typeof accessibility.schemaVersion === 'string' ? accessibility.schemaVersion : 'derived.atlas.matrixAccessibilityContract.v1',
      tableFirst: accessibility.tableFirst !== false,
      equivalentListParity: accessibility.equivalentListParity !== false,
      keyboardNavigation: {
        focusModel: typeof keyboard.focusModel === 'string' ? keyboard.focusModel : 'roving-gridcell-tabindex',
        supportedKeys: Array.isArray(keyboard.supportedKeys) ? keyboard.supportedKeys.filter((value) => typeof value === 'string') : [],
        wrap: keyboard.wrap === true,
      },
    },
    largeProjectBudgetProof: source.largeProjectBudgetProof && typeof source.largeProjectBudgetProof === 'object' && !Array.isArray(source.largeProjectBudgetProof)
      ? source.largeProjectBudgetProof
      : {},
  };
}

function normalizeAtlasHeatmap(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary) ? source.summary : {};
  const tilePacket = source.tilePacket && typeof source.tilePacket === 'object' && !Array.isArray(source.tilePacket) ? source.tilePacket : {};
  const legend = source.legend && typeof source.legend === 'object' && !Array.isArray(source.legend) ? source.legend : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'derived.atlas.heatmap.v1',
    state: typeof source.state === 'string' ? source.state : 'empty',
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    summary: {
      entityCount: Number.isInteger(summary.entityCount) ? Math.max(0, summary.entityCount) : 0,
      sceneCount: Number.isInteger(summary.sceneCount) ? Math.max(0, summary.sceneCount) : 0,
      renderedTileCount: Number.isInteger(summary.renderedTileCount) ? Math.max(0, summary.renderedTileCount) : 0,
      omittedTileCount: Number.isInteger(summary.omittedTileCount) ? Math.max(0, summary.omittedTileCount) : 0,
      maxObservationCount: Number.isInteger(summary.maxObservationCount) ? Math.max(0, summary.maxObservationCount) : 0,
      heatmapHash: typeof summary.heatmapHash === 'string' ? summary.heatmapHash : '',
      matrixHash: typeof summary.matrixHash === 'string' ? summary.matrixHash : '',
    },
    tilePacket: {
      schemaVersion: typeof tilePacket.schemaVersion === 'string' ? tilePacket.schemaVersion : 'derived.atlas.heatmap.tilePacket.v1',
      state: typeof tilePacket.state === 'string' ? tilePacket.state : 'empty',
      mode: typeof tilePacket.mode === 'string' ? tilePacket.mode : 'entityScene',
      rowAxis: normalizeAtlasMatrixAxis(tilePacket.rowAxis, 'entity'),
      columnAxis: normalizeAtlasMatrixAxis(tilePacket.columnAxis, 'scene'),
      rows: Array.isArray(tilePacket.rows) ? tilePacket.rows.filter(reviewSurfaceIsPlainObject) : [],
      columns: Array.isArray(tilePacket.columns) ? tilePacket.columns.filter(reviewSurfaceIsPlainObject) : [],
      tiles: Array.isArray(tilePacket.tiles) ? tilePacket.tiles.filter(reviewSurfaceIsPlainObject) : [],
    },
    legend: {
      schemaVersion: typeof legend.schemaVersion === 'string' ? legend.schemaVersion : 'derived.atlas.heatmapLegend.v1',
      bands: Array.isArray(legend.bands) ? legend.bands.filter(reviewSurfaceIsPlainObject) : [],
      degradedVisualFallback: legend.degradedVisualFallback && typeof legend.degradedVisualFallback === 'object' && !Array.isArray(legend.degradedVisualFallback)
        ? legend.degradedVisualFallback
        : {},
    },
    degradedVisualFallback: Array.isArray(source.degradedVisualFallback) ? source.degradedVisualFallback.filter(reviewSurfaceIsPlainObject) : [],
    viewportBudgetProof: source.viewportBudgetProof && typeof source.viewportBudgetProof === 'object' && !Array.isArray(source.viewportBudgetProof)
      ? source.viewportBudgetProof
      : {},
  };
}

function atlasMatrixCellValue(cell, mode) {
  if (!cell || typeof cell !== 'object') return '';
  if (mode === 'relation') {
    if (cell.rowEntityId && cell.columnEntityId && cell.rowEntityId === cell.columnEntityId) return '·';
    return String(Number(cell.occurrenceCount || 0));
  }
  return String(Number(cell.appearanceCount || 0));
}

function appendAtlasMatrixTable(parent, matrix, gridId, label, mode) {
  const wrapper = document.createElement('div');
  wrapper.className = 'right-rail-atlas-matrix-wrap';
  const table = document.createElement('table');
  table.className = 'right-rail-atlas-matrix';
  table.dataset.atlasMatrixGrid = gridId;
  table.setAttribute('role', 'grid');
  table.setAttribute('aria-label', label);
  const caption = document.createElement('caption');
  caption.textContent = label;
  table.appendChild(caption);
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.setAttribute('role', 'row');
  const corner = document.createElement('th');
  corner.scope = 'col';
  corner.textContent = mode === 'relation' ? 'Entity' : 'Scene';
  headRow.appendChild(corner);
  for (const column of matrix.columns) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.setAttribute('role', 'columnheader');
    th.textContent = column.sceneTitle || column.name || column.entityId || column.sceneId || 'column';
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  let firstCell = true;
  matrix.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    tr.setAttribute('role', 'row');
    const rowHeader = document.createElement('th');
    rowHeader.scope = 'row';
    rowHeader.textContent = row.name || row.entityId || 'entity';
    tr.appendChild(rowHeader);
    const cells = Array.isArray(row.cells) ? row.cells : [];
    cells.forEach((cell, columnIndex) => {
      const td = document.createElement('td');
      td.setAttribute('role', 'gridcell');
      td.tabIndex = firstCell ? 0 : -1;
      firstCell = false;
      td.dataset.atlasMatrixCell = 'true';
      td.dataset.atlasMatrixGrid = gridId;
      td.dataset.atlasMatrixRow = String(rowIndex);
      td.dataset.atlasMatrixColumn = String(columnIndex);
      td.dataset.atlasMatrixMode = mode;
      td.dataset.atlasRelationPairId = cell.pairId || '';
      td.dataset.atlasRelationLeftEntityId = cell.rowEntityId || '';
      td.dataset.atlasRelationRightEntityId = cell.columnEntityId || '';
      td.setAttribute('aria-label', cell.ariaLabel || `${rowHeader.textContent}: ${atlasMatrixCellValue(cell, mode)}`);
      td.textContent = atlasMatrixCellValue(cell, mode);
      if (mode === 'relation' && cell.pairId) td.classList.add('is-actionable');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  parent.appendChild(wrapper);
  return table;
}

function appendAtlasMatrixListRows(parent, rows, kind, omittedCount = 0) {
  const list = document.createElement('div');
  list.className = 'right-rail-atlas-matrix-list';
  list.dataset.atlasMatrixListKind = kind;
  for (const row of rows.slice(0, 12)) {
    const item = document.createElement('div');
    item.className = 'right-rail-atlas-matrix-list-row';
    const main = document.createElement('span');
    main.className = 'right-rail-atlas-matrix-list-row__main';
    const meta = document.createElement('span');
    meta.className = 'right-rail-atlas-matrix-list-row__meta';
    if (kind === 'relation') {
      main.textContent = `${row.leftName || row.leftEntityId || 'Entity'} - ${row.rightName || row.rightEntityId || 'Entity'}`;
      meta.textContent = `${row.occurrenceCount || 0} co-occurrences · ${row.sceneCount || 0} scenes`;
      if (row.pairId) {
        item.dataset.atlasRelationPairId = row.pairId;
        item.dataset.atlasRelationLeftEntityId = row.leftEntityId || '';
        item.dataset.atlasRelationRightEntityId = row.rightEntityId || '';
        item.tabIndex = 0;
        item.setAttribute('role', 'button');
        item.setAttribute('aria-label', `Open Atlas relation ${main.textContent}`);
      }
    } else {
      main.textContent = `${row.entityName || row.entityId || 'Entity'} · ${row.sceneTitle || row.sceneId || 'Scene'}`;
      meta.textContent = `${row.appearanceCount || 0} observations · ${row.evidenceAnchorIds?.length || 0} anchors`;
    }
    item.append(main, meta);
    list.appendChild(item);
  }
  if (rows.length < 1) {
    const empty = document.createElement('div');
    empty.className = 'right-rail-atlas-state';
    empty.textContent = kind === 'relation' ? 'No relation list rows yet' : 'No entity-scene list rows yet';
    list.appendChild(empty);
  }
  if (omittedCount > 0) {
    const omitted = document.createElement('div');
    omitted.className = 'right-rail-atlas-state';
    omitted.textContent = `${omittedCount} additional rows clipped by matrix budget.`;
    list.appendChild(omitted);
  }
  parent.appendChild(list);
}

function focusAtlasMatrixCell(gridId, row, column) {
  if (!(atlasMatricesHost instanceof HTMLElement)) return;
  const selector = `[data-atlas-matrix-cell][data-atlas-matrix-grid="${gridId}"][data-atlas-matrix-row="${row}"][data-atlas-matrix-column="${column}"]`;
  const next = atlasMatricesHost.querySelector(selector);
  if (!(next instanceof HTMLElement)) return;
  const current = atlasMatricesHost.querySelector(`[data-atlas-matrix-cell][data-atlas-matrix-grid="${gridId}"][tabindex="0"]`);
  if (current instanceof HTMLElement) current.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
}

function activateAtlasMatrixCell(cell) {
  if (!(cell instanceof HTMLElement)) return;
  if (cell.dataset.atlasMatrixMode !== 'relation') return;
  const pairId = cell.dataset.atlasRelationPairId || '';
  const leftEntityId = cell.dataset.atlasRelationLeftEntityId || '';
  const rightEntityId = cell.dataset.atlasRelationRightEntityId || '';
  if (!pairId && (!leftEntityId || !rightEntityId)) return;
  selectAtlasRelation({ pairId, leftEntityId, rightEntityId });
}

function handleAtlasMatrixGridKeydown(event) {
  const target = event.target instanceof Element ? event.target.closest('[data-atlas-matrix-cell]') : null;
  if (!(target instanceof HTMLElement) || !(atlasMatricesHost instanceof HTMLElement) || !atlasMatricesHost.contains(target)) return;
  const key = event.key;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(key)) return;
  event.preventDefault();
  if (key === 'Enter' || key === ' ') {
    activateAtlasMatrixCell(target);
    return;
  }
  const gridId = target.dataset.atlasMatrixGrid || '';
  const row = Number(target.dataset.atlasMatrixRow || 0);
  const column = Number(target.dataset.atlasMatrixColumn || 0);
  const cells = Array.from(atlasMatricesHost.querySelectorAll(`[data-atlas-matrix-cell][data-atlas-matrix-grid="${gridId}"]`))
    .filter((cell) => cell instanceof HTMLElement);
  const maxRow = Math.max(0, ...cells.map((cell) => Number(cell.dataset.atlasMatrixRow || 0)));
  const maxColumn = Math.max(0, ...cells.map((cell) => Number(cell.dataset.atlasMatrixColumn || 0)));
  if (key === 'ArrowUp') focusAtlasMatrixCell(gridId, Math.max(0, row - 1), column);
  if (key === 'ArrowDown') focusAtlasMatrixCell(gridId, Math.min(maxRow, row + 1), column);
  if (key === 'ArrowLeft') focusAtlasMatrixCell(gridId, row, Math.max(0, column - 1));
  if (key === 'ArrowRight') focusAtlasMatrixCell(gridId, row, Math.min(maxColumn, column + 1));
  if (key === 'Home') focusAtlasMatrixCell(gridId, row, 0);
  if (key === 'End') focusAtlasMatrixCell(gridId, row, maxColumn);
}

function handleAtlasMatrixGridClick(event) {
  const heatmapOpen = event.target instanceof Element ? event.target.closest('[data-atlas-heatmap-open]') : null;
  if (heatmapOpen instanceof HTMLElement && atlasMatricesHost instanceof HTMLElement && atlasMatricesHost.contains(heatmapOpen)) {
    openAtlasHeatmapSurface();
    return;
  }
  const temporalLayoutOpen = event.target instanceof Element ? event.target.closest('[data-atlas-temporal-layout-open]') : null;
  if (temporalLayoutOpen instanceof HTMLElement && atlasMatricesHost instanceof HTMLElement && atlasMatricesHost.contains(temporalLayoutOpen)) {
    openAtlasTemporalLayoutSurface();
    return;
  }
  const continuityLedgerOpen = event.target instanceof Element ? event.target.closest('[data-atlas-continuity-ledger-open]') : null;
  if (continuityLedgerOpen instanceof HTMLElement && atlasMatricesHost instanceof HTMLElement && atlasMatricesHost.contains(continuityLedgerOpen)) {
    openAtlasContinuityLedgerSurface();
    return;
  }
  const target = event.target instanceof Element ? event.target.closest('[data-atlas-matrix-cell], [data-atlas-relation-pair-id]') : null;
  if (!(target instanceof HTMLElement) || !(atlasMatricesHost instanceof HTMLElement) || !atlasMatricesHost.contains(target)) return;
  if (target.dataset.atlasMatrixCell === 'true') {
    activateAtlasMatrixCell(target);
    return;
  }
  if (target.dataset.atlasRelationPairId) {
    selectAtlasRelation({
      pairId: target.dataset.atlasRelationPairId || '',
      leftEntityId: target.dataset.atlasRelationLeftEntityId || '',
      rightEntityId: target.dataset.atlasRelationRightEntityId || '',
    });
  }
}

function bindAtlasMatricesKeyboardNavigation() {
  if (!(atlasMatricesHost instanceof HTMLElement) || atlasMatricesKeyboardBound) return;
  atlasMatricesHost.addEventListener('keydown', handleAtlasMatrixGridKeydown);
  atlasMatricesHost.addEventListener('click', handleAtlasMatrixGridClick);
  atlasMatricesKeyboardBound = true;
}

function renderAtlasMatricesState() {
  if (!(atlasMatricesHost instanceof HTMLElement)) return;
  bindAtlasMatricesKeyboardNavigation();
  const state = normalizeAtlasMatrices(atlasMatricesState);
  atlasMatricesHost.innerHTML = '';
  atlasMatricesHost.dataset.atlasMatricesStatus = state.state;
  applyAtlasResolvedSurfaceBinding('matrices', atlasMatricesHost, 'atlasMatricesProvider');

  const header = document.createElement('div');
  header.className = 'right-rail-atlas-matrices-head';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Matrices';
  const title = document.createElement('strong');
  title.className = 'right-rail-atlas-matrices-title';
  title.textContent = 'Atlas matrix parity';
  const hash = document.createElement('span');
  hash.className = 'right-rail-atlas-overview-hash';
  hash.textContent = state.summary.matrixHash ? state.summary.matrixHash.slice(0, 8) : state.state;
  header.append(label, title, hash);
  atlasMatricesHost.appendChild(header);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'right-rail-atlas-state right-rail-atlas-state--blocked';
    unavailable.textContent = state.unavailableReason || 'ATLAS_MATRICES_UNAVAILABLE';
    atlasMatricesHost.appendChild(unavailable);
    return;
  }
  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'right-rail-atlas-state';
    loading.textContent = 'Atlas matrices обновляются.';
    atlasMatricesHost.appendChild(loading);
    return;
  }

  const metrics = document.createElement('div');
  metrics.className = 'right-rail-atlas-overview-metrics right-rail-atlas-matrices-metrics';
  appendAtlasOverviewMetric(metrics, 'entities', state.summary.entityCount);
  appendAtlasOverviewMetric(metrics, 'scenes', state.summary.sceneCount);
  appendAtlasOverviewMetric(metrics, 'cells', state.summary.entitySceneCellCount + state.summary.relationCellCount);
  appendAtlasOverviewMetric(metrics, 'clipped', state.summary.omittedEntitySceneCellCount + state.summary.omittedRelationCellCount, state.largeProjectBudgetProof?.clippingHonest ? 'reviewRequired' : 'current');
  atlasMatricesHost.appendChild(metrics);

  const actionBar = document.createElement('div');
  actionBar.className = 'right-rail-atlas-action-bar';
  const heatmapButton = document.createElement('button');
  heatmapButton.type = 'button';
  heatmapButton.className = 'right-rail-atlas-action';
  heatmapButton.dataset.atlasHeatmapOpen = 'true';
  heatmapButton.disabled = state.state !== 'ready';
  heatmapButton.textContent = atlasHeatmapExplicitOpen ? 'Refresh heatmap' : 'Open heatmap';
  actionBar.appendChild(heatmapButton);
  const temporalLayoutButton = document.createElement('button');
  temporalLayoutButton.type = 'button';
  temporalLayoutButton.className = 'right-rail-atlas-action';
  temporalLayoutButton.dataset.atlasTemporalLayoutOpen = 'true';
  temporalLayoutButton.disabled = state.summary.sceneCount < 1;
  temporalLayoutButton.textContent = atlasTemporalLayoutExplicitOpen ? 'Refresh timeline' : 'Open timeline';
  actionBar.appendChild(temporalLayoutButton);
  const continuityLedgerButton = document.createElement('button');
  continuityLedgerButton.type = 'button';
  continuityLedgerButton.className = 'right-rail-atlas-action';
  continuityLedgerButton.dataset.atlasContinuityLedgerOpen = 'true';
  continuityLedgerButton.disabled = !currentProjectId;
  continuityLedgerButton.textContent = atlasContinuityLedgerExplicitOpen ? 'Refresh ledger' : 'Open ledger';
  actionBar.appendChild(continuityLedgerButton);
  atlasMatricesHost.appendChild(actionBar);

  if (state.state === 'empty') {
    const empty = document.createElement('div');
    empty.className = 'right-rail-atlas-state';
    empty.textContent = 'Atlas matrix rows appear after entity observations exist.';
    atlasMatricesHost.appendChild(empty);
    return;
  }

  const entityScene = appendAtlasOverviewSection(atlasMatricesHost, 'Entity-scene matrix', { open: true });
  appendAtlasMatrixTable(entityScene, state.entitySceneMatrix, 'entity-scene', 'Entity by scene observations', 'entityScene');
  appendAtlasMatrixListRows(entityScene, state.listParity.entitySceneRows, 'entityScene', state.listParity.omittedEntitySceneRowCount);

  const relation = appendAtlasOverviewSection(atlasMatricesHost, 'Relation matrix', { open: true });
  appendAtlasMatrixTable(relation, state.relationMatrix, 'relation', 'Entity relation co-occurrences', 'relation');
  appendAtlasMatrixListRows(relation, state.listParity.relationRows, 'relation', state.listParity.omittedRelationRowCount);

  if (state.largeProjectBudgetProof?.clippingHonest) {
    const budget = document.createElement('div');
    budget.className = 'right-rail-atlas-state';
    budget.textContent = `Clipped to ${state.largeProjectBudgetProof.visibleEntityRows || 0} rows, ${state.largeProjectBudgetProof.visibleSceneColumns || 0} scene columns, ${state.largeProjectBudgetProof.visibleEntitySceneListRows || 0}/${state.largeProjectBudgetProof.totalEntitySceneListRows || 0} list rows.`;
    atlasMatricesHost.appendChild(budget);
  }
}

async function refreshAtlasMatrices() {
  if (currentRightTab !== 'atlas') return;
  atlasMatricesState = {
    ...atlasMatricesState,
    state: currentProjectId ? 'loading' : 'empty',
    projectId: currentProjectId || '',
  };
  renderAtlasMatricesState();
  const result = await invokeWorkspaceQueryBridge(ATLAS_MATRICES_QUERY_ID, {
    projectId: currentProjectId,
    rowLimit: 8,
    columnLimit: 8,
    listLimit: 24,
  });
  const nextState = result && result.ok !== false && result.atlasMatrices
    ? result.atlasMatrices
    : { state: 'unavailable', unavailableReason: 'ATLAS_MATRICES_QUERY_FAILED' };
  atlasMatricesState = normalizeAtlasMatrices(nextState);
  renderAtlasMatricesState();
}

function renderAtlasHeatmapState() {
  if (!(atlasHeatmapHost instanceof HTMLElement)) return;
  if (atlasHeatmapShell instanceof HTMLElement) {
    atlasHeatmapShell.hidden = !isAtlasSurfaceActive('heatmap') || atlasHeatmapExplicitOpen !== true;
  }
  atlasHeatmapHost.innerHTML = '';
  atlasHeatmapHost.dataset.atlasHeatmapStatus = atlasHeatmapExplicitOpen ? atlasHeatmapState.state : 'closed';
  applyAtlasResolvedSurfaceBinding('heatmap', atlasHeatmapHost, 'atlasHeatmapProvider');
  if (atlasHeatmapExplicitOpen !== true) return;

  const state = normalizeAtlasHeatmap(atlasHeatmapState);
  const header = document.createElement('div');
  header.className = 'right-rail-atlas-matrices-head right-rail-atlas-heatmap-head';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Heatmap';
  const title = document.createElement('strong');
  title.className = 'right-rail-atlas-matrices-title';
  title.textContent = 'Atlas density heatmap';
  const hash = document.createElement('span');
  hash.className = 'right-rail-atlas-overview-hash';
  hash.textContent = state.summary.heatmapHash ? state.summary.heatmapHash.slice(0, 8) : state.state;
  header.append(label, title, hash);
  atlasHeatmapHost.appendChild(header);

  const metrics = document.createElement('div');
  metrics.className = 'right-rail-atlas-overview-metrics right-rail-atlas-matrices-metrics';
  appendAtlasOverviewMetric(metrics, 'tiles', state.summary.renderedTileCount);
  appendAtlasOverviewMetric(metrics, 'omitted', state.summary.omittedTileCount, state.viewportBudgetProof?.clippingHonest ? 'reviewRequired' : 'current');
  appendAtlasOverviewMetric(metrics, 'max', state.summary.maxObservationCount);
  appendAtlasOverviewMetric(metrics, 'budget', state.viewportBudgetProof?.tileLimit || 0);
  atlasHeatmapHost.appendChild(metrics);

  const actionBar = document.createElement('div');
  actionBar.className = 'right-rail-atlas-action-bar';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'right-rail-atlas-action';
  closeButton.dataset.atlasHeatmapClose = 'true';
  closeButton.textContent = 'Close';
  actionBar.appendChild(closeButton);
  atlasHeatmapHost.appendChild(actionBar);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'right-rail-atlas-state right-rail-atlas-state--blocked';
    unavailable.textContent = state.unavailableReason || 'ATLAS_HEATMAP_UNAVAILABLE';
    atlasHeatmapHost.appendChild(unavailable);
    return;
  }
  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'right-rail-atlas-state';
    loading.textContent = 'Atlas heatmap загружается только после явного открытия.';
    atlasHeatmapHost.appendChild(loading);
    return;
  }
  if (state.state === 'empty') {
    const empty = document.createElement('div');
    empty.className = 'right-rail-atlas-state';
    empty.textContent = 'Heatmap appears after entity-scene observations exist.';
    atlasHeatmapHost.appendChild(empty);
    return;
  }

  const packet = state.tilePacket;
  const tableSection = appendAtlasOverviewSection(atlasHeatmapHost, 'Density tiles', { open: true });
  const wrapper = document.createElement('div');
  wrapper.className = 'right-rail-atlas-matrix-wrap';
  const table = document.createElement('table');
  table.className = 'right-rail-atlas-matrix right-rail-atlas-heatmap';
  table.setAttribute('role', 'grid');
  table.setAttribute('aria-label', 'Atlas entity scene density heatmap');
  const caption = document.createElement('caption');
  caption.textContent = 'Entity-scene observation density';
  table.appendChild(caption);
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.setAttribute('role', 'row');
  const corner = document.createElement('th');
  corner.scope = 'col';
  corner.textContent = 'Scene';
  headRow.appendChild(corner);
  for (const column of packet.columns) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.setAttribute('role', 'columnheader');
    th.textContent = column.sceneTitle || column.sceneId || 'Scene';
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  const tilesByPosition = new Map(packet.tiles.map((tile) => [`${tile.rowIndex}:${tile.columnIndex}`, tile]));
  packet.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    tr.setAttribute('role', 'row');
    const rowHeader = document.createElement('th');
    rowHeader.scope = 'row';
    rowHeader.textContent = row.name || row.entityId || 'Entity';
    tr.appendChild(rowHeader);
    packet.columns.forEach((column, columnIndex) => {
      const tile = tilesByPosition.get(`${rowIndex}:${columnIndex}`) || {};
      const td = document.createElement('td');
      td.setAttribute('role', 'gridcell');
      td.dataset.atlasHeatmapTile = 'true';
      td.dataset.atlasHeatmapBand = tile.intensityBand || 'none';
      td.setAttribute('aria-label', tile.ariaLabel || `${rowHeader.textContent} in ${column.sceneTitle || 'Scene'}: no rendered heatmap tile`);
      td.textContent = Number.isInteger(tile.observationCount) ? String(tile.observationCount) : '·';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  tableSection.appendChild(wrapper);

  const legendSection = appendAtlasOverviewSection(atlasHeatmapHost, 'Legend and fallback', { open: false });
  const legend = document.createElement('div');
  legend.className = 'right-rail-atlas-heatmap-legend';
  for (const band of state.legend.bands) {
    const item = document.createElement('span');
    item.className = 'right-rail-atlas-heatmap-legend-item';
    item.dataset.atlasHeatmapBand = band.band || 'none';
    item.textContent = band.label || band.band || 'none';
    legend.appendChild(item);
  }
  legendSection.appendChild(legend);
  appendAtlasMatrixListRows(legendSection, state.degradedVisualFallback.map((row) => ({
    entityName: row.entityName,
    sceneTitle: row.sceneTitle,
    appearanceCount: row.observationCount,
    evidenceAnchorIds: Array.from({ length: row.evidenceAnchorCount || 0 }, (_, index) => String(index)),
  })), 'entityScene', 0);

  if (state.viewportBudgetProof?.clippingHonest) {
    const budget = document.createElement('div');
    budget.className = 'right-rail-atlas-state';
    budget.textContent = `Virtualized ${state.viewportBudgetProof.renderedTileCount || 0}/${state.viewportBudgetProof.totalTileCount || 0} tiles. Typing path stays nonblocking.`;
    atlasHeatmapHost.appendChild(budget);
  }
}

function closeAtlasHeatmapSurface() {
  atlasHeatmapExplicitOpen = false;
  setCurrentAtlasSurface('matrices', { refresh: true });
  renderAtlasHeatmapState();
}

function openAtlasHeatmapSurface() {
  atlasHeatmapExplicitOpen = true;
  setCurrentAtlasSurface('heatmap', { refresh: false });
  renderAtlasHeatmapState();
  refreshAtlasHeatmap();
}

async function refreshAtlasHeatmap() {
  if (currentRightTab !== 'atlas') return;
  if (atlasHeatmapExplicitOpen !== true) return;
  atlasHeatmapState = {
    ...atlasHeatmapState,
    state: currentProjectId ? 'loading' : 'empty',
    projectId: currentProjectId || '',
  };
  renderAtlasHeatmapState();
  const result = await invokeWorkspaceQueryBridge(ATLAS_HEATMAP_QUERY_ID, {
    projectId: currentProjectId,
    explicitOpen: atlasHeatmapExplicitOpen === true,
    rowLimit: 10,
    columnLimit: 10,
    tileLimit: 64,
    listLimit: 16,
  });
  const nextState = result && result.ok !== false && result.atlasHeatmap
    ? result.atlasHeatmap
    : { state: 'unavailable', unavailableReason: 'ATLAS_HEATMAP_QUERY_FAILED' };
  atlasHeatmapState = normalizeAtlasHeatmap(nextState);
  renderAtlasHeatmapState();
}

function normalizeAtlasTemporalLayout(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary) ? source.summary : {};
  const packet = source.layoutPacket && typeof source.layoutPacket === 'object' && !Array.isArray(source.layoutPacket) ? source.layoutPacket : {};
  const slider = source.timeSliderState && typeof source.timeSliderState === 'object' && !Array.isArray(source.timeSliderState) ? source.timeSliderState : {};
  const parity = source.listParity && typeof source.listParity === 'object' && !Array.isArray(source.listParity) ? source.listParity : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'derived.atlas.temporalLayout.v1',
    state: typeof source.state === 'string' ? source.state : 'empty',
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    summary: {
      sceneCount: Number.isInteger(summary.sceneCount) ? Math.max(0, summary.sceneCount) : 0,
      anchoredSceneCount: Number.isInteger(summary.anchoredSceneCount) ? Math.max(0, summary.anchoredSceneCount) : 0,
      unknownTemporalSceneCount: Number.isInteger(summary.unknownTemporalSceneCount) ? Math.max(0, summary.unknownTemporalSceneCount) : 0,
      relationSegmentCount: Number.isInteger(summary.relationSegmentCount) ? Math.max(0, summary.relationSegmentCount) : 0,
      selectedSceneCount: Number.isInteger(summary.selectedSceneCount) ? Math.max(0, summary.selectedSceneCount) : 0,
      layoutHash: typeof summary.layoutHash === 'string' ? summary.layoutHash : '',
      sourceHash: typeof summary.sourceHash === 'string' ? summary.sourceHash : '',
    },
    layoutPacket: {
      schemaVersion: typeof packet.schemaVersion === 'string' ? packet.schemaVersion : 'derived.atlas.temporalLayoutPacket.v1',
      state: typeof packet.state === 'string' ? packet.state : 'empty',
      axis: packet.axis && typeof packet.axis === 'object' && !Array.isArray(packet.axis) ? packet.axis : { min: 0, max: 0, step: 1 },
      events: Array.isArray(packet.events) ? packet.events.filter(reviewSurfaceIsPlainObject) : [],
      segments: Array.isArray(packet.segments) ? packet.segments.filter(reviewSurfaceIsPlainObject) : [],
    },
    timeSliderState: {
      schemaVersion: typeof slider.schemaVersion === 'string' ? slider.schemaVersion : 'derived.atlas.timeSliderState.v1',
      min: Number.isFinite(Number(slider.min)) ? Number(slider.min) : 0,
      max: Number.isFinite(Number(slider.max)) ? Number(slider.max) : 0,
      step: Number.isFinite(Number(slider.step)) ? Number(slider.step) : 1,
      value: Number.isFinite(Number(slider.value)) ? Number(slider.value) : 0,
      selectedSceneIds: Array.isArray(slider.selectedSceneIds) ? slider.selectedSceneIds.filter((value) => typeof value === 'string') : [],
      rangeLabel: typeof slider.rangeLabel === 'string' ? slider.rangeLabel : 'empty',
    },
    listParity: {
      schemaVersion: typeof parity.schemaVersion === 'string' ? parity.schemaVersion : 'derived.atlas.temporalLayoutListParity.v1',
      rows: Array.isArray(parity.rows) ? parity.rows.filter(reviewSurfaceIsPlainObject) : [],
      equivalentToTimeline: parity.equivalentToTimeline !== false,
      omittedRowCount: Number.isInteger(parity.omittedRowCount) ? Math.max(0, parity.omittedRowCount) : 0,
    },
    keyboardContract: source.keyboardContract && typeof source.keyboardContract === 'object' && !Array.isArray(source.keyboardContract)
      ? source.keyboardContract
      : {},
    largeProjectBudgetProof: source.largeProjectBudgetProof && typeof source.largeProjectBudgetProof === 'object' && !Array.isArray(source.largeProjectBudgetProof)
      ? source.largeProjectBudgetProof
      : {},
  };
}

function focusAtlasTemporalEvent(offset) {
  if (!(atlasTemporalLayoutHost instanceof HTMLElement)) return;
  const events = Array.from(atlasTemporalLayoutHost.querySelectorAll('[data-atlas-temporal-event]'))
    .filter((item) => item instanceof HTMLElement);
  if (events.length < 1) return;
  const currentIndex = Math.max(0, events.findIndex((item) => item.getAttribute('tabindex') === '0' || item === document.activeElement));
  const nextIndex = Math.max(0, Math.min(events.length - 1, currentIndex + offset));
  events.forEach((item, index) => { item.tabIndex = index === nextIndex ? 0 : -1; });
  events[nextIndex].focus();
}

function handleAtlasTemporalLayoutKeydown(event) {
  const target = event.target instanceof Element ? event.target.closest('[data-atlas-temporal-event]') : null;
  if (!(target instanceof HTMLElement) || !(atlasTemporalLayoutHost instanceof HTMLElement) || !atlasTemporalLayoutHost.contains(target)) return;
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'ArrowLeft') focusAtlasTemporalEvent(-1);
  if (event.key === 'ArrowRight') focusAtlasTemporalEvent(1);
  if (event.key === 'Home') focusAtlasTemporalEvent(-9999);
  if (event.key === 'End') focusAtlasTemporalEvent(9999);
  if (event.key === 'Enter' || event.key === ' ') {
    updateStatusText(`Atlas timeline scene: ${target.dataset.atlasTemporalSceneId || 'scene'}`);
  }
}

function handleAtlasTemporalLayoutClick(event) {
  const close = event.target instanceof Element ? event.target.closest('[data-atlas-temporal-layout-close]') : null;
  if (close instanceof HTMLElement && atlasTemporalLayoutHost instanceof HTMLElement && atlasTemporalLayoutHost.contains(close)) {
    closeAtlasTemporalLayoutSurface();
    return;
  }
  const eventButton = event.target instanceof Element ? event.target.closest('[data-atlas-temporal-event]') : null;
  if (eventButton instanceof HTMLElement && atlasTemporalLayoutHost instanceof HTMLElement && atlasTemporalLayoutHost.contains(eventButton)) {
    updateStatusText(`Atlas timeline scene: ${eventButton.dataset.atlasTemporalSceneId || 'scene'}`);
  }
}

function handleAtlasTemporalLayoutInput(event) {
  const input = event.target instanceof Element ? event.target.closest('[data-atlas-temporal-slider]') : null;
  if (!(input instanceof HTMLInputElement) || !(atlasTemporalLayoutHost instanceof HTMLElement) || !atlasTemporalLayoutHost.contains(input)) return;
  atlasTemporalLayoutState = {
    ...atlasTemporalLayoutState,
    timeSliderState: {
      ...atlasTemporalLayoutState.timeSliderState,
      value: Number(input.value || 0),
    },
  };
  refreshAtlasTemporalLayout(Number(input.value || 0));
}

function bindAtlasTemporalLayoutKeyboardNavigation() {
  if (!(atlasTemporalLayoutHost instanceof HTMLElement) || atlasTemporalLayoutKeyboardBound) return;
  atlasTemporalLayoutHost.addEventListener('keydown', handleAtlasTemporalLayoutKeydown);
  atlasTemporalLayoutHost.addEventListener('click', handleAtlasTemporalLayoutClick);
  atlasTemporalLayoutHost.addEventListener('input', handleAtlasTemporalLayoutInput);
  atlasTemporalLayoutKeyboardBound = true;
}

function appendAtlasTemporalLayoutList(parent, rows, omittedCount = 0) {
  const list = document.createElement('div');
  list.className = 'right-rail-atlas-temporal-list';
  for (const row of rows.slice(0, 16)) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'right-rail-atlas-temporal-list-row';
    item.dataset.atlasTemporalSceneId = row.sceneId || '';
    item.dataset.state = row.selected ? 'selected' : row.temporalState || 'anchored';
    const main = document.createElement('span');
    main.className = 'right-rail-atlas-matrix-list-row__main';
    main.textContent = row.sceneTitle || row.sceneId || 'Scene';
    const meta = document.createElement('span');
    meta.className = 'right-rail-atlas-matrix-list-row__meta';
    meta.textContent = `${row.storyLabel || 'unknown'} · ${row.relationSegmentCount || 0} segments`;
    item.append(main, meta);
    list.appendChild(item);
  }
  if (rows.length < 1) {
    const empty = document.createElement('div');
    empty.className = 'right-rail-atlas-state';
    empty.textContent = 'Timeline list appears after scene temporal anchors exist.';
    list.appendChild(empty);
  }
  if (omittedCount > 0) {
    const omitted = document.createElement('div');
    omitted.className = 'right-rail-atlas-state';
    omitted.textContent = `${omittedCount} additional timeline rows clipped by surface budget.`;
    list.appendChild(omitted);
  }
  parent.appendChild(list);
}

function renderAtlasTemporalLayoutState() {
  if (!(atlasTemporalLayoutHost instanceof HTMLElement)) return;
  bindAtlasTemporalLayoutKeyboardNavigation();
  if (atlasTemporalLayoutShell instanceof HTMLElement) {
    atlasTemporalLayoutShell.hidden = !isAtlasSurfaceActive('temporal') || atlasTemporalLayoutExplicitOpen !== true;
  }
  atlasTemporalLayoutHost.innerHTML = '';
  atlasTemporalLayoutHost.dataset.atlasTemporalLayoutStatus = atlasTemporalLayoutExplicitOpen ? atlasTemporalLayoutState.state : 'closed';
  applyAtlasResolvedSurfaceBinding('temporal', atlasTemporalLayoutHost, 'atlasTemporalLayoutProvider');
  if (atlasTemporalLayoutExplicitOpen !== true) return;

  const state = normalizeAtlasTemporalLayout(atlasTemporalLayoutState);
  const header = document.createElement('div');
  header.className = 'right-rail-atlas-matrices-head right-rail-atlas-temporal-head';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Timeline';
  const title = document.createElement('strong');
  title.className = 'right-rail-atlas-matrices-title';
  title.textContent = 'Atlas temporal layout';
  const hash = document.createElement('span');
  hash.className = 'right-rail-atlas-overview-hash';
  hash.textContent = state.summary.layoutHash ? state.summary.layoutHash.slice(0, 8) : state.state;
  header.append(label, title, hash);
  atlasTemporalLayoutHost.appendChild(header);

  const metrics = document.createElement('div');
  metrics.className = 'right-rail-atlas-overview-metrics right-rail-atlas-matrices-metrics';
  appendAtlasOverviewMetric(metrics, 'scenes', state.summary.sceneCount);
  appendAtlasOverviewMetric(metrics, 'anchored', state.summary.anchoredSceneCount);
  appendAtlasOverviewMetric(metrics, 'unknown', state.summary.unknownTemporalSceneCount, state.summary.unknownTemporalSceneCount > 0 ? 'reviewRequired' : 'current');
  appendAtlasOverviewMetric(metrics, 'segments', state.summary.relationSegmentCount);
  atlasTemporalLayoutHost.appendChild(metrics);

  const actionBar = document.createElement('div');
  actionBar.className = 'right-rail-atlas-action-bar';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'right-rail-atlas-action';
  closeButton.dataset.atlasTemporalLayoutClose = 'true';
  closeButton.textContent = 'Close';
  actionBar.appendChild(closeButton);
  atlasTemporalLayoutHost.appendChild(actionBar);
  appendAtlasTemporalAuthorControls(atlasTemporalLayoutHost);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'right-rail-atlas-state right-rail-atlas-state--blocked';
    unavailable.textContent = state.unavailableReason || 'ATLAS_TEMPORAL_LAYOUT_UNAVAILABLE';
    atlasTemporalLayoutHost.appendChild(unavailable);
    return;
  }
  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'right-rail-atlas-state';
    loading.textContent = 'Atlas timeline загружается только после явного открытия.';
    atlasTemporalLayoutHost.appendChild(loading);
    return;
  }
  if (state.state === 'empty') {
    const empty = document.createElement('div');
    empty.className = 'right-rail-atlas-state';
    empty.textContent = 'Timeline appears after scene temporal anchors exist.';
    atlasTemporalLayoutHost.appendChild(empty);
    return;
  }

  const sliderSection = appendAtlasOverviewSection(atlasTemporalLayoutHost, 'Time slider', { open: true });
  const sliderWrap = document.createElement('label');
  sliderWrap.className = 'right-rail-atlas-temporal-slider';
  const sliderText = document.createElement('span');
  sliderText.textContent = state.timeSliderState.rangeLabel || 'story time';
  const sliderInput = document.createElement('input');
  sliderInput.type = 'range';
  sliderInput.min = String(state.timeSliderState.min);
  sliderInput.max = String(state.timeSliderState.max);
  sliderInput.step = String(state.timeSliderState.step || 1);
  sliderInput.value = String(state.timeSliderState.value);
  sliderInput.dataset.atlasTemporalSlider = 'true';
  sliderInput.setAttribute('aria-label', 'Atlas time slider');
  sliderWrap.append(sliderText, sliderInput);
  sliderSection.appendChild(sliderWrap);

  const timelineSection = appendAtlasOverviewSection(atlasTemporalLayoutHost, 'Temporal layout', { open: true });
  const rail = document.createElement('div');
  rail.className = 'right-rail-atlas-temporal-rail';
  rail.setAttribute('role', 'list');
  for (const event of state.layoutPacket.events.slice(0, 24)) {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'right-rail-atlas-temporal-event';
    marker.dataset.atlasTemporalEvent = 'true';
    marker.dataset.atlasTemporalSceneId = event.sceneId || '';
    marker.dataset.state = event.selected ? 'selected' : event.temporalState || 'anchored';
    marker.style.setProperty('--atlas-temporal-x', `${Number(event.xPercent || 0)}%`);
    marker.tabIndex = Number(event.focusIndex || 0) === 0 ? 0 : -1;
    marker.setAttribute('aria-label', event.ariaLabel || `${event.sceneTitle || event.sceneId || 'Scene'} timeline event`);
    marker.textContent = String(Number(event.sceneOrdinal || 0) + 1);
    rail.appendChild(marker);
  }
  timelineSection.appendChild(rail);

  const listSection = appendAtlasOverviewSection(atlasTemporalLayoutHost, 'List fallback', { open: true });
  appendAtlasTemporalLayoutList(listSection, state.listParity.rows, state.listParity.omittedRowCount);

  if (state.largeProjectBudgetProof?.clippingHonest) {
    const budget = document.createElement('div');
    budget.className = 'right-rail-atlas-state';
    budget.textContent = `Virtualized ${state.largeProjectBudgetProof.visibleSceneCount || 0}/${state.largeProjectBudgetProof.totalSceneCount || 0} scenes and ${state.largeProjectBudgetProof.visibleSegmentCount || 0}/${state.largeProjectBudgetProof.totalSegmentCount || 0} segments.`;
    atlasTemporalLayoutHost.appendChild(budget);
  }
}

function closeAtlasTemporalLayoutSurface() {
  atlasTemporalLayoutExplicitOpen = false;
  setCurrentAtlasSurface('matrices', { refresh: true });
  renderAtlasTemporalLayoutState();
}

function openAtlasTemporalLayoutSurface() {
  atlasTemporalLayoutExplicitOpen = true;
  setCurrentAtlasSurface('temporal', { refresh: false });
  renderAtlasTemporalLayoutState();
  refreshAtlasTemporalLayout();
}

async function refreshAtlasTemporalLayout(sliderValue = null) {
  if (currentRightTab !== 'atlas') return;
  if (atlasTemporalLayoutExplicitOpen !== true) return;
  atlasTemporalLayoutState = {
    ...atlasTemporalLayoutState,
    state: currentProjectId ? 'loading' : 'empty',
    projectId: currentProjectId || '',
  };
  renderAtlasTemporalLayoutState();
  const result = await invokeWorkspaceQueryBridge(ATLAS_TEMPORAL_LAYOUT_QUERY_ID, {
    projectId: currentProjectId,
    explicitOpen: atlasTemporalLayoutExplicitOpen === true,
    sceneLimit: 48,
    segmentLimit: 32,
    sliderValue,
  });
  const nextState = result && result.ok !== false && result.atlasTemporalLayout
    ? result.atlasTemporalLayout
    : { state: 'unavailable', unavailableReason: 'ATLAS_TEMPORAL_LAYOUT_QUERY_FAILED' };
  atlasTemporalLayoutState = normalizeAtlasTemporalLayout(nextState);
  renderAtlasTemporalLayoutState();
}

function normalizeAtlasContinuityLedgerSurface(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary) ? source.summary : {};
  const parity = source.listParity && typeof source.listParity === 'object' && !Array.isArray(source.listParity) ? source.listParity : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'derived.atlas.continuityLedgerSurface.v1',
    state: typeof source.state === 'string' ? source.state : 'empty',
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    summary: {
      findingCount: Number.isInteger(summary.findingCount) ? Math.max(0, summary.findingCount) : 0,
      outcomeCount: Number.isInteger(summary.outcomeCount) ? Math.max(0, summary.outcomeCount) : 0,
      rowCount: Number.isInteger(summary.rowCount) ? Math.max(0, summary.rowCount) : 0,
      visibleRowCount: Number.isInteger(summary.visibleRowCount) ? Math.max(0, summary.visibleRowCount) : 0,
      omittedRowCount: Number.isInteger(summary.omittedRowCount) ? Math.max(0, summary.omittedRowCount) : 0,
      evidenceAnchorCount: Number.isInteger(summary.evidenceAnchorCount) ? Math.max(0, summary.evidenceAnchorCount) : 0,
      correctionRouteCount: Number.isInteger(summary.correctionRouteCount) ? Math.max(0, summary.correctionRouteCount) : 0,
      degradedRowCount: Number.isInteger(summary.degradedRowCount) ? Math.max(0, summary.degradedRowCount) : 0,
      surfaceHash: typeof summary.surfaceHash === 'string' ? summary.surfaceHash : '',
      sourceHash: typeof summary.sourceHash === 'string' ? summary.sourceHash : '',
    },
    rows: Array.isArray(source.rows) ? source.rows.filter(reviewSurfaceIsPlainObject) : [],
    listParity: {
      schemaVersion: typeof parity.schemaVersion === 'string' ? parity.schemaVersion : 'derived.atlas.continuityLedgerListParity.v1',
      rows: Array.isArray(parity.rows) ? parity.rows.filter(reviewSurfaceIsPlainObject) : [],
      equivalentToFindingRows: parity.equivalentToFindingRows !== false,
      omittedRowCount: Number.isInteger(parity.omittedRowCount) ? Math.max(0, parity.omittedRowCount) : 0,
    },
    keyboardContract: source.keyboardContract && typeof source.keyboardContract === 'object' && !Array.isArray(source.keyboardContract)
      ? source.keyboardContract
      : {},
  };
}

function focusAtlasContinuityLedgerEvidence(button) {
  if (!(button instanceof HTMLElement)) return;
  const sceneId = button.dataset.atlasContinuityEvidenceSceneId || '';
  const start = Number(button.dataset.atlasContinuityEvidenceStart || 0);
  const end = Number(button.dataset.atlasContinuityEvidenceEnd || 0);
  if (!sceneId || sceneId !== currentDocumentId) {
    updateStatusText(`Atlas evidence route: ${sceneId || 'scene'} нужно открыть вручную`);
    return;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    updateStatusText('Atlas continuity anchor устарел');
    return;
  }
  focusEditorSurface('atlas-continuity-ledger');
  setSelectionRange(start, end);
  updateStatusText('Atlas continuity evidence открыт в тексте');
}

function focusAtlasContinuityAuthorRoute(button) {
  if (!(button instanceof HTMLElement)) return;
  const commandId = button.dataset.commandId || 'atlas.continuityFact.record';
  const target = atlasContinuityLedgerHost?.querySelector('[data-atlas-continuity-field="mentionId"]')
    || atlasContinuityLedgerHost?.querySelector('[data-atlas-continuity-field="entityId"]')
    || button;
  if (target instanceof HTMLElement) {
    target.focus({ preventScroll: false });
  }
  updateStatusText(`Atlas author controls ready for ${commandId}`);
}

function handleAtlasContinuityLedgerClick(event) {
  const close = event.target instanceof Element ? event.target.closest('[data-atlas-continuity-ledger-close]') : null;
  if (close instanceof HTMLElement && atlasContinuityLedgerHost instanceof HTMLElement && atlasContinuityLedgerHost.contains(close)) {
    closeAtlasContinuityLedgerSurface();
    return;
  }
  const jump = event.target instanceof Element ? event.target.closest('[data-atlas-continuity-evidence-jump]') : null;
  if (jump instanceof HTMLElement && atlasContinuityLedgerHost instanceof HTMLElement && atlasContinuityLedgerHost.contains(jump)) {
    focusAtlasContinuityLedgerEvidence(jump);
    return;
  }
  const route = event.target instanceof Element ? event.target.closest('[data-atlas-continuity-correction-route]') : null;
  if (route instanceof HTMLElement && atlasContinuityLedgerHost instanceof HTMLElement && atlasContinuityLedgerHost.contains(route)) {
    focusAtlasContinuityAuthorRoute(route);
  }
}

function appendAtlasContinuityLedgerRows(parent, rows) {
  const list = document.createElement('div');
  list.className = 'right-rail-atlas-continuity-list';
  for (const row of rows.slice(0, 16)) {
    const item = document.createElement('section');
    item.className = 'right-rail-atlas-continuity-row';
    item.dataset.state = row.severity || row.rowKind || 'info';
    const head = document.createElement('div');
    head.className = 'right-rail-atlas-continuity-row__head';
    const title = document.createElement('strong');
    title.textContent = row.findingKind || row.outcomeKind || row.id || 'Continuity row';
    const meta = document.createElement('span');
    meta.textContent = `${row.rowKind || 'row'} · ${row.evidenceAnchorCount || 0} anchors`;
    head.append(title, meta);
    item.appendChild(head);

    const summary = document.createElement('p');
    summary.className = 'right-rail-atlas-continuity-row__summary';
    summary.textContent = row.summary || 'Evidence-backed continuity row.';
    item.appendChild(summary);

    const evidenceList = document.createElement('div');
    evidenceList.className = 'right-rail-atlas-continuity-evidence';
    const evidenceRows = Array.isArray(row.evidenceRows) ? row.evidenceRows : [];
    for (const evidence of evidenceRows.slice(0, 3)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'right-rail-atlas-continuity-evidence-button';
      button.dataset.atlasContinuityEvidenceJump = 'true';
      button.dataset.atlasContinuityEvidenceSceneId = evidence.sceneId || '';
      button.dataset.atlasContinuityEvidenceStart = String(Number(evidence.startOffset || 0));
      button.dataset.atlasContinuityEvidenceEnd = String(Number(evidence.endOffset || evidence.startOffset || 0));
      button.setAttribute('aria-label', `Jump to evidence ${evidence.anchorId || evidence.factId || 'anchor'}`);
      const quote = document.createElement('span');
      quote.className = 'right-rail-atlas-continuity-evidence-button__quote';
      quote.textContent = evidence.quote || evidence.anchorId || 'Evidence anchor';
      const detail = document.createElement('span');
      detail.className = 'right-rail-atlas-continuity-evidence-button__detail';
      detail.textContent = `${evidence.ledgerKind || 'fact'} · ${evidence.sceneId || 'scene'} · ${evidence.evidenceState || 'unknown'}`;
      button.append(quote, detail);
      evidenceList.appendChild(button);
    }
    if (evidenceRows.length > 3) {
      const omitted = document.createElement('div');
      omitted.className = 'right-rail-atlas-state';
      omitted.textContent = `${evidenceRows.length - 3} additional anchors clipped.`;
      evidenceList.appendChild(omitted);
    }
    item.appendChild(evidenceList);

    const actions = document.createElement('div');
    actions.className = 'right-rail-atlas-action-bar right-rail-atlas-continuity-actions';
    const route = Array.isArray(row.correctionRoutes) ? row.correctionRoutes[0] : null;
    const routeButton = document.createElement('button');
    routeButton.type = 'button';
    routeButton.className = 'right-rail-atlas-action';
    routeButton.dataset.atlasContinuityCorrectionRoute = 'true';
    routeButton.dataset.commandId = route?.commandId || 'atlas.continuityFact.record';
    routeButton.textContent = 'Correction route';
    actions.appendChild(routeButton);
    item.appendChild(actions);
    list.appendChild(item);
  }
  parent.appendChild(list);
}

function renderAtlasContinuityLedgerState() {
  if (!(atlasContinuityLedgerHost instanceof HTMLElement)) return;
  if (atlasContinuityLedgerShell instanceof HTMLElement) {
    atlasContinuityLedgerShell.hidden = !isAtlasSurfaceActive('continuity') || atlasContinuityLedgerExplicitOpen !== true;
  }
  atlasContinuityLedgerHost.innerHTML = '';
  atlasContinuityLedgerHost.dataset.atlasContinuityLedgerStatus = atlasContinuityLedgerExplicitOpen ? atlasContinuityLedgerState.state : 'closed';
  applyAtlasResolvedSurfaceBinding('continuity', atlasContinuityLedgerHost, 'atlasContinuityLedgerProvider');
  if (atlasContinuityLedgerExplicitOpen !== true) return;

  const state = normalizeAtlasContinuityLedgerSurface(atlasContinuityLedgerState);
  const header = document.createElement('div');
  header.className = 'right-rail-atlas-matrices-head right-rail-atlas-continuity-head';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Continuity';
  const title = document.createElement('strong');
  title.className = 'right-rail-atlas-matrices-title';
  title.textContent = 'Continuity ledger';
  const hash = document.createElement('span');
  hash.className = 'right-rail-atlas-overview-hash';
  hash.textContent = state.summary.surfaceHash ? state.summary.surfaceHash.slice(0, 8) : state.state;
  header.append(label, title, hash);
  atlasContinuityLedgerHost.appendChild(header);

  const metrics = document.createElement('div');
  metrics.className = 'right-rail-atlas-overview-metrics right-rail-atlas-matrices-metrics';
  appendAtlasOverviewMetric(metrics, 'findings', state.summary.findingCount, state.summary.findingCount > 0 ? 'reviewRequired' : 'current');
  appendAtlasOverviewMetric(metrics, 'outcomes', state.summary.outcomeCount);
  appendAtlasOverviewMetric(metrics, 'anchors', state.summary.evidenceAnchorCount);
  appendAtlasOverviewMetric(metrics, 'routes', state.summary.correctionRouteCount);
  atlasContinuityLedgerHost.appendChild(metrics);

  const actionBar = document.createElement('div');
  actionBar.className = 'right-rail-atlas-action-bar';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'right-rail-atlas-action';
  closeButton.dataset.atlasContinuityLedgerClose = 'true';
  closeButton.textContent = 'Close';
  actionBar.appendChild(closeButton);
  atlasContinuityLedgerHost.appendChild(actionBar);
  appendAtlasContinuityAuthorControls(atlasContinuityLedgerHost);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'right-rail-atlas-state right-rail-atlas-state--blocked';
    unavailable.textContent = state.unavailableReason || 'ATLAS_CONTINUITY_LEDGER_UNAVAILABLE';
    atlasContinuityLedgerHost.appendChild(unavailable);
    return;
  }
  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'right-rail-atlas-state';
    loading.textContent = 'Atlas continuity ledger загружается только после явного открытия.';
    atlasContinuityLedgerHost.appendChild(loading);
    return;
  }
  if (state.state === 'empty') {
    const empty = document.createElement('div');
    empty.className = 'right-rail-atlas-state';
    empty.textContent = 'Continuity findings appear after author facts create evidence-backed review rows.';
    atlasContinuityLedgerHost.appendChild(empty);
    return;
  }

  const rowsSection = appendAtlasOverviewSection(atlasContinuityLedgerHost, 'Finding rows', { open: true });
  appendAtlasContinuityLedgerRows(rowsSection, state.rows);
  if (state.summary.omittedRowCount > 0) {
    const omitted = document.createElement('div');
    omitted.className = 'right-rail-atlas-state';
    omitted.textContent = `${state.summary.omittedRowCount} ledger rows clipped by surface budget.`;
    atlasContinuityLedgerHost.appendChild(omitted);
  }
}

function closeAtlasContinuityLedgerSurface() {
  atlasContinuityLedgerExplicitOpen = false;
  setCurrentAtlasSurface('matrices', { refresh: true });
  renderAtlasContinuityLedgerState();
}

function openAtlasContinuityLedgerSurface() {
  atlasContinuityLedgerExplicitOpen = true;
  setCurrentAtlasSurface('continuity', { refresh: false });
  renderAtlasContinuityLedgerState();
  refreshAtlasContinuityLedgerSurface();
}

async function refreshAtlasContinuityLedgerSurface() {
  if (currentRightTab !== 'atlas') return;
  if (atlasContinuityLedgerExplicitOpen !== true) return;
  atlasContinuityLedgerState = {
    ...atlasContinuityLedgerState,
    state: currentProjectId ? 'loading' : 'empty',
    projectId: currentProjectId || '',
  };
  renderAtlasContinuityLedgerState();
  const result = await invokeWorkspaceQueryBridge(ATLAS_CONTINUITY_LEDGER_SURFACE_QUERY_ID, {
    projectId: currentProjectId,
    explicitOpen: atlasContinuityLedgerExplicitOpen === true,
    rowLimit: 16,
  });
  const nextState = result && result.ok !== false && result.atlasContinuityLedgerSurface
    ? result.atlasContinuityLedgerSurface
    : { state: 'unavailable', unavailableReason: 'ATLAS_CONTINUITY_LEDGER_QUERY_FAILED' };
  atlasContinuityLedgerState = normalizeAtlasContinuityLedgerSurface(nextState);
  renderAtlasContinuityLedgerState();
}

function normalizeAtlasReportsSavedQueries(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary) ? source.summary : {};
  const report = source.localReportPacket && typeof source.localReportPacket === 'object' && !Array.isArray(source.localReportPacket) ? source.localReportPacket : {};
  const exportSafe = source.exportSafeSummary && typeof source.exportSafeSummary === 'object' && !Array.isArray(source.exportSafeSummary) ? source.exportSafeSummary : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'derived.atlas.reportsSavedQueries.v1',
    state: typeof source.state === 'string' ? source.state : 'empty',
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    summary: {
      reportCount: Number.isInteger(summary.reportCount) ? Math.max(0, summary.reportCount) : 0,
      savedQueryCount: Number.isInteger(summary.savedQueryCount) ? Math.max(0, summary.savedQueryCount) : 0,
      staleSavedQueryCount: Number.isInteger(summary.staleSavedQueryCount) ? Math.max(0, summary.staleSavedQueryCount) : 0,
      exportSafeRowCount: Number.isInteger(summary.exportSafeRowCount) ? Math.max(0, summary.exportSafeRowCount) : 0,
      reportHash: typeof summary.reportHash === 'string' ? summary.reportHash : '',
      sourceHash: typeof summary.sourceHash === 'string' ? summary.sourceHash : '',
    },
    localReportPacket: {
      schemaVersion: typeof report.schemaVersion === 'string' ? report.schemaVersion : 'derived.atlas.localReportPacket.v1',
      state: typeof report.state === 'string' ? report.state : 'empty',
      sections: Array.isArray(report.sections) ? report.sections.filter(reviewSurfaceIsPlainObject) : [],
    },
    savedQueries: Array.isArray(source.savedQueries) ? source.savedQueries.filter(reviewSurfaceIsPlainObject) : [],
    exportSafeSummary: {
      schemaVersion: typeof exportSafe.schemaVersion === 'string' ? exportSafe.schemaVersion : 'derived.atlas.reportExportSafeSummary.v1',
      rows: Array.isArray(exportSafe.rows) ? exportSafe.rows.filter(reviewSurfaceIsPlainObject) : [],
      pathless: exportSafe.pathless !== false,
      containsPrivateData: exportSafe.containsPrivateData === true,
    },
  };
}

function appendAtlasReportsRow(parent, primary, secondary = '', state = '') {
  const row = document.createElement('div');
  row.className = 'right-rail-atlas-matrix-list-row right-rail-atlas-reports-row';
  if (state) row.dataset.state = state;
  const main = document.createElement('span');
  main.className = 'right-rail-atlas-matrix-list-row__main';
  main.textContent = primary;
  const meta = document.createElement('span');
  meta.className = 'right-rail-atlas-matrix-list-row__meta';
  meta.textContent = secondary;
  row.append(main, meta);
  parent.appendChild(row);
  return row;
}

function renderAtlasReportsSavedQueriesState() {
  if (!(atlasReportsHost instanceof HTMLElement)) return;
  const state = normalizeAtlasReportsSavedQueries(atlasReportsState);
  atlasReportsHost.innerHTML = '';
  atlasReportsHost.dataset.atlasReportsStatus = state.state;
  applyAtlasResolvedSurfaceBinding('reports', atlasReportsHost, 'atlasReportsProvider');

  const header = document.createElement('div');
  header.className = 'right-rail-atlas-matrices-head';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Reports';
  const title = document.createElement('strong');
  title.className = 'right-rail-atlas-matrices-title';
  title.textContent = 'Local Atlas reports';
  const hash = document.createElement('span');
  hash.className = 'right-rail-atlas-overview-hash';
  hash.textContent = state.summary.reportHash ? state.summary.reportHash.slice(0, 8) : state.state;
  header.append(label, title, hash);
  atlasReportsHost.appendChild(header);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'right-rail-atlas-state right-rail-atlas-state--blocked';
    unavailable.textContent = state.unavailableReason || 'ATLAS_REPORTS_SAVED_QUERIES_UNAVAILABLE';
    atlasReportsHost.appendChild(unavailable);
    return;
  }
  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'right-rail-atlas-state';
    loading.textContent = 'Atlas reports обновляются.';
    atlasReportsHost.appendChild(loading);
    return;
  }
  appendAtlasSavedQueryControls(atlasReportsHost);

  const metrics = document.createElement('div');
  metrics.className = 'right-rail-atlas-overview-metrics right-rail-atlas-matrices-metrics';
  appendAtlasOverviewMetric(metrics, 'reports', state.summary.reportCount);
  appendAtlasOverviewMetric(metrics, 'queries', state.summary.savedQueryCount);
  appendAtlasOverviewMetric(metrics, 'stale', state.summary.staleSavedQueryCount, state.summary.staleSavedQueryCount > 0 ? 'reviewRequired' : 'current');
  appendAtlasOverviewMetric(metrics, 'export rows', state.summary.exportSafeRowCount);
  atlasReportsHost.appendChild(metrics);

  const reportSection = appendAtlasOverviewSection(atlasReportsHost, 'Report packet', { open: true });
  const reportRows = document.createElement('div');
  reportRows.className = 'right-rail-atlas-matrix-list';
  for (const section of state.localReportPacket.sections) {
    const metricsText = Object.entries(section.metrics || {})
      .map(([key, value]) => `${key} ${value}`)
      .join(' · ');
    appendAtlasReportsRow(reportRows, section.label || section.id || 'Report section', metricsText);
  }
  if (state.localReportPacket.sections.length < 1) {
    appendAtlasReportsRow(reportRows, 'No local report sections yet', 'Atlas reports appear after observations exist.');
  }
  reportSection.appendChild(reportRows);

  const querySection = appendAtlasOverviewSection(atlasReportsHost, 'Saved queries', { open: true });
  const queryRows = document.createElement('div');
  queryRows.className = 'right-rail-atlas-matrix-list';
  for (const query of state.savedQueries) {
    const filterCount = (query.filter?.entityIds?.length || 0) + (query.filter?.sceneIds?.length || 0) + (query.filter?.relationPairIds?.length || 0);
    appendAtlasReportsRow(
      queryRows,
      query.name || query.id || 'Saved query',
      `${query.reportType || 'overview'} · ${filterCount} filters · ${query.stale ? 'stale source' : 'current source'}`,
      query.stale ? 'reviewRequired' : 'current',
    );
  }
  if (state.savedQueries.length < 1) {
    appendAtlasReportsRow(queryRows, 'No saved queries yet', 'Command boundary: atlas.savedQuery.save');
  }
  querySection.appendChild(queryRows);

  const exportSection = appendAtlasOverviewSection(atlasReportsHost, 'Export-safe summary', { open: false });
  const exportRows = document.createElement('div');
  exportRows.className = 'right-rail-atlas-matrix-list';
  for (const row of state.exportSafeSummary.rows.slice(0, 8)) {
    appendAtlasReportsRow(exportRows, row.label || row.id || row.kind || 'row', row.summary || '');
  }
  exportSection.appendChild(exportRows);
}

async function refreshAtlasReportsSavedQueries() {
  if (currentRightTab !== 'atlas') return;
  atlasReportsState = {
    ...atlasReportsState,
    state: currentProjectId ? 'loading' : 'empty',
    projectId: currentProjectId || '',
  };
  renderAtlasReportsSavedQueriesState();
  const result = await invokeWorkspaceQueryBridge(ATLAS_REPORTS_SAVED_QUERIES_QUERY_ID, {
    projectId: currentProjectId,
    limit: 12,
  });
  const nextState = result && result.ok !== false && result.atlasReportsSavedQueries
    ? result.atlasReportsSavedQueries
    : { state: 'unavailable', unavailableReason: 'ATLAS_REPORTS_SAVED_QUERIES_QUERY_FAILED' };
  atlasReportsState = normalizeAtlasReportsSavedQueries(nextState);
  renderAtlasReportsSavedQueriesState();
}

function normalizeAtlasDiagnosticsStageAcceptance(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary) ? source.summary : {};
  const inventory = source.surfaceFallbackInventory && typeof source.surfaceFallbackInventory === 'object' && !Array.isArray(source.surfaceFallbackInventory)
    ? source.surfaceFallbackInventory
    : {};
  const degraded = source.degradedCapabilityReport && typeof source.degradedCapabilityReport === 'object' && !Array.isArray(source.degradedCapabilityReport)
    ? source.degradedCapabilityReport
    : {};
  const proof = source.stageAcceptanceProof && typeof source.stageAcceptanceProof === 'object' && !Array.isArray(source.stageAcceptanceProof)
    ? source.stageAcceptanceProof
    : {};
  const audit = source.finalUiAuditReceipt && typeof source.finalUiAuditReceipt === 'object' && !Array.isArray(source.finalUiAuditReceipt)
    ? source.finalUiAuditReceipt
    : {};
  const heuristic = source.heuristicReviewReceipt && typeof source.heuristicReviewReceipt === 'object' && !Array.isArray(source.heuristicReviewReceipt)
    ? source.heuristicReviewReceipt
    : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'derived.atlas.diagnosticsStageAcceptance.v1',
    state: typeof source.state === 'string' ? source.state : 'empty',
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    summary: {
      surfaceCount: Number.isInteger(summary.surfaceCount) ? Math.max(0, summary.surfaceCount) : 0,
      degradedSurfaceCount: Number.isInteger(summary.degradedSurfaceCount) ? Math.max(0, summary.degradedSurfaceCount) : 0,
      degradedCapabilityCount: Number.isInteger(summary.degradedCapabilityCount) ? Math.max(0, summary.degradedCapabilityCount) : 0,
      acceptanceGateCount: Number.isInteger(summary.acceptanceGateCount) ? Math.max(0, summary.acceptanceGateCount) : 0,
      passedAcceptanceGateCount: Number.isInteger(summary.passedAcceptanceGateCount) ? Math.max(0, summary.passedAcceptanceGateCount) : 0,
      stageAcceptance: typeof summary.stageAcceptance === 'string' ? summary.stageAcceptance : 'empty',
      diagnosticsHash: typeof summary.diagnosticsHash === 'string' ? summary.diagnosticsHash : '',
    },
    surfaceFallbackInventory: {
      rows: Array.isArray(inventory.rows) ? inventory.rows.filter(reviewSurfaceIsPlainObject) : [],
    },
    degradedCapabilityReport: {
      rows: Array.isArray(degraded.rows) ? degraded.rows.filter(reviewSurfaceIsPlainObject) : [],
    },
    stageAcceptanceProof: {
      gates: Array.isArray(proof.gates) ? proof.gates.filter(reviewSurfaceIsPlainObject) : [],
      pass: proof.pass === true,
    },
    finalUiAuditReceipt: {
      finalBar: audit.finalBar && typeof audit.finalBar === 'object' && !Array.isArray(audit.finalBar) ? audit.finalBar : { status: 'EMPTY' },
    },
    heuristicReviewReceipt: {
      usabilityScoreJudged: Number.isInteger(heuristic.usabilityScoreJudged) ? Math.max(0, Math.min(100, heuristic.usabilityScoreJudged)) : 0,
      grade: typeof heuristic.grade === 'string' ? heuristic.grade : 'F',
    },
  };
}

function renderAtlasDiagnosticsStageAcceptanceState() {
  if (!(atlasDiagnosticsHost instanceof HTMLElement)) return;
  const state = normalizeAtlasDiagnosticsStageAcceptance(atlasDiagnosticsState);
  atlasDiagnosticsHost.innerHTML = '';
  atlasDiagnosticsHost.dataset.atlasDiagnosticsStatus = state.state;
  applyAtlasResolvedSurfaceBinding('diagnostics', atlasDiagnosticsHost, 'atlasDiagnosticsProvider');

  const header = document.createElement('div');
  header.className = 'right-rail-atlas-matrices-head';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Diagnostics';
  const title = document.createElement('strong');
  title.className = 'right-rail-atlas-matrices-title';
  title.textContent = 'Stage 05 acceptance / Stage 06 handoff';
  const hash = document.createElement('span');
  hash.className = 'right-rail-atlas-overview-hash';
  hash.textContent = state.summary.diagnosticsHash ? state.summary.diagnosticsHash.slice(0, 8) : state.state;
  header.append(label, title, hash);
  atlasDiagnosticsHost.appendChild(header);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'right-rail-atlas-state right-rail-atlas-state--blocked';
    unavailable.textContent = state.unavailableReason || 'ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_UNAVAILABLE';
    atlasDiagnosticsHost.appendChild(unavailable);
    return;
  }
  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'right-rail-atlas-state';
    loading.textContent = 'Atlas diagnostics обновляются.';
    atlasDiagnosticsHost.appendChild(loading);
    return;
  }

  const metrics = document.createElement('div');
  metrics.className = 'right-rail-atlas-overview-metrics right-rail-atlas-matrices-metrics';
  appendAtlasOverviewMetric(metrics, 'surfaces', state.summary.surfaceCount);
  appendAtlasOverviewMetric(metrics, 'degraded', state.summary.degradedSurfaceCount + state.summary.degradedCapabilityCount, state.summary.degradedSurfaceCount > 0 ? 'reviewRequired' : 'current');
  appendAtlasOverviewMetric(metrics, 'gates', `${state.summary.passedAcceptanceGateCount}/${state.summary.acceptanceGateCount}`, state.stageAcceptanceProof.pass ? 'current' : 'reviewRequired');
  appendAtlasOverviewMetric(metrics, 'score', `${state.heuristicReviewReceipt.usabilityScoreJudged} ${state.heuristicReviewReceipt.grade}`, state.heuristicReviewReceipt.usabilityScoreJudged >= 80 ? 'current' : 'reviewRequired');
  atlasDiagnosticsHost.appendChild(metrics);

  const gatesSection = appendAtlasOverviewSection(atlasDiagnosticsHost, 'Acceptance gates', { open: true });
  const gateRows = document.createElement('div');
  gateRows.className = 'right-rail-atlas-matrix-list';
  for (const gate of state.stageAcceptanceProof.gates) {
    appendAtlasReportsRow(
      gateRows,
      gate.label || gate.id || 'Gate',
      `${gate.status || 'UNKNOWN'} · ${gate.evidence || ''}`,
      gate.status === 'PASS' ? 'current' : 'reviewRequired',
    );
  }
  if (state.stageAcceptanceProof.gates.length < 1) {
    appendAtlasReportsRow(gateRows, 'No acceptance gates yet', 'Diagnostics will populate after project Atlas data is available.');
  }
  gatesSection.appendChild(gateRows);

  const degradedSection = appendAtlasOverviewSection(atlasDiagnosticsHost, 'Degraded capability report', { open: true });
  const degradedRows = document.createElement('div');
  degradedRows.className = 'right-rail-atlas-matrix-list';
  for (const row of state.degradedCapabilityReport.rows.slice(0, 10)) {
    appendAtlasReportsRow(
      degradedRows,
      row.label || row.code || 'Capability',
      `${row.severity || 'info'} · ${row.detail || row.surfaceId || ''}`,
      row.severity === 'degraded' ? 'reviewRequired' : 'current',
    );
  }
  degradedSection.appendChild(degradedRows);

  const inventorySection = appendAtlasOverviewSection(atlasDiagnosticsHost, 'Fallback inventory', { open: false });
  const inventoryRows = document.createElement('div');
  inventoryRows.className = 'right-rail-atlas-matrix-list';
  for (const row of state.surfaceFallbackInventory.rows.slice(0, 10)) {
    appendAtlasReportsRow(
      inventoryRows,
      row.surfaceId || 'Surface',
      `${row.state || 'unknown'} · ${row.fallback || ''}`,
      row.state === 'unavailable' || row.state === 'degraded' ? 'reviewRequired' : 'current',
    );
  }
  inventorySection.appendChild(inventoryRows);
}

async function refreshAtlasDiagnosticsStageAcceptance() {
  if (currentRightTab !== 'atlas') return;
  atlasDiagnosticsState = {
    ...atlasDiagnosticsState,
    state: currentProjectId ? 'loading' : 'empty',
    projectId: currentProjectId || '',
  };
  renderAtlasDiagnosticsStageAcceptanceState();
  const result = await invokeWorkspaceQueryBridge(ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_QUERY_ID, {
    projectId: currentProjectId,
  });
  const nextState = result && result.ok !== false && result.atlasDiagnosticsStageAcceptance
    ? result.atlasDiagnosticsStageAcceptance
    : { state: 'unavailable', unavailableReason: 'ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE_QUERY_FAILED' };
  atlasDiagnosticsState = normalizeAtlasDiagnosticsStageAcceptance(nextState);
  renderAtlasDiagnosticsStageAcceptanceState();
}

function normalizeAtlasCurrentSceneDossier(result = {}) {
  const source = result && typeof result === 'object' && !Array.isArray(result)
    ? result
    : {};
  const summary = source.summary && typeof source.summary === 'object' && !Array.isArray(source.summary)
    ? source.summary
    : {};
  return {
    schemaVersion: typeof source.schemaVersion === 'string' ? source.schemaVersion : 'derived.atlas.currentSceneDossier.v1',
    state: typeof source.state === 'string' ? source.state : 'empty',
    unavailableReason: typeof source.unavailableReason === 'string' ? source.unavailableReason : '',
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    sceneId: typeof source.sceneId === 'string' ? source.sceneId : '',
    sceneTitle: typeof source.sceneTitle === 'string' ? source.sceneTitle : '',
    summary: {
      entityCount: Number.isInteger(summary.entityCount) ? Math.max(0, summary.entityCount) : 0,
      mentionCount: Number.isInteger(summary.mentionCount) ? Math.max(0, summary.mentionCount) : 0,
      sceneTextHash: typeof summary.sceneTextHash === 'string' ? summary.sceneTextHash : '',
      indexHash: typeof summary.indexHash === 'string' ? summary.indexHash : '',
      invalidationKey: typeof summary.invalidationKey === 'string' ? summary.invalidationKey : '',
    },
    entities: Array.isArray(source.entities) ? source.entities.filter(reviewSurfaceIsPlainObject) : [],
    mentions: Array.isArray(source.mentions) ? source.mentions.filter(reviewSurfaceIsPlainObject) : [],
  };
}

function appendAtlasText(parent, className, text) {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function renderAtlasCurrentSceneState() {
  if (!(atlasCurrentSceneHost instanceof HTMLElement)) return;
  const state = normalizeAtlasCurrentSceneDossier(atlasCurrentSceneState);
  atlasCurrentSceneHost.innerHTML = '';
  atlasCurrentSceneHost.dataset.atlasCurrentSceneStatus = state.state;
  applyAtlasResolvedSurfaceBinding('currentScene', atlasCurrentSceneHost, 'atlasCurrentSceneProvider');

  const header = document.createElement('section');
  header.className = 'right-rail-surface right-rail-surface--atlas-header';
  const label = document.createElement('div');
  label.className = 'right-rail-section__label';
  label.textContent = 'Atlas';
  const title = document.createElement('div');
  title.className = 'right-rail-atlas-title';
  title.textContent = state.sceneTitle || currentDocumentTitle || 'Текущая сцена';
  const metrics = document.createElement('div');
  metrics.className = 'right-rail-atlas-metrics';
  appendAtlasText(metrics, 'right-rail-atlas-metric', `${state.summary.entityCount} сущн.`);
  appendAtlasText(metrics, 'right-rail-atlas-metric', `${state.summary.mentionCount} упом.`);
  header.append(label, title, metrics);
  atlasCurrentSceneHost.appendChild(header);

  if (state.state === 'unavailable') {
    const unavailable = document.createElement('div');
    unavailable.className = 'right-rail-atlas-state right-rail-atlas-state--blocked';
    unavailable.textContent = state.unavailableReason || 'Atlas dossier недоступен. Текст сцены не изменён.';
    atlasCurrentSceneHost.appendChild(unavailable);
    return;
  }

  if (state.state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'right-rail-atlas-state';
    loading.textContent = 'Atlas dossier обновляется.';
    atlasCurrentSceneHost.appendChild(loading);
    return;
  }

  if (state.summary.mentionCount < 1) {
    const empty = document.createElement('div');
    empty.className = 'right-rail-atlas-state';
    empty.textContent = state.sceneId
      ? 'Точных упоминаний для текущей сцены пока нет.'
      : 'Откройте сцену, чтобы увидеть Atlas dossier.';
    atlasCurrentSceneHost.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'right-rail-atlas-entity-list';
  for (const entity of state.entities) {
    const entitySection = document.createElement('section');
    entitySection.className = 'right-rail-atlas-entity';
    if (entity.entityId) entitySection.dataset.atlasEntityId = entity.entityId;
    const entityHead = document.createElement('div');
    entityHead.className = 'right-rail-atlas-entity__head';
    if (entity.entityId) {
      entityHead.dataset.atlasEntityId = entity.entityId;
      entityHead.tabIndex = 0;
      entityHead.setAttribute('role', 'button');
      entityHead.setAttribute('aria-label', `Open Atlas entity ${entity.name || entity.entityId}`);
    }
    appendAtlasText(entityHead, 'right-rail-atlas-entity__name', entity.name || entity.entityId || 'Entity');
    appendAtlasText(entityHead, 'right-rail-atlas-entity__count', `${entity.mentionCount || 0}`);
    entitySection.appendChild(entityHead);

    const mentions = Array.isArray(entity.mentions) ? entity.mentions : [];
    for (const mention of mentions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'right-rail-atlas-mention';
      button.dataset.atlasMentionId = mention.mentionId || '';
      const quote = document.createElement('span');
      quote.className = 'right-rail-atlas-mention__quote';
      quote.textContent = mention.context?.quote || mention.matchedText || '';
      const context = document.createElement('span');
      context.className = 'right-rail-atlas-mention__context';
      context.textContent = [mention.context?.before || '', mention.context?.after || '']
        .filter(Boolean)
        .join(' ');
      const offset = document.createElement('span');
      offset.className = 'right-rail-atlas-mention__offset';
      offset.textContent = `${Number(mention.startOffset) || 0}-${Number(mention.endOffset) || 0}`;
      button.append(quote, context, offset);
      entitySection.appendChild(button);
    }
    list.appendChild(entitySection);
  }
  atlasCurrentSceneHost.appendChild(list);
}

async function refreshAtlasCurrentScene(options = {}) {
  if (currentRightTab !== 'atlas' && options.force !== true) return;
  atlasCurrentSceneState = {
    ...atlasCurrentSceneState,
    state: currentDocumentId ? 'loading' : 'empty',
    sceneId: currentDocumentId || '',
    sceneTitle: currentDocumentTitle || '',
  };
  renderAtlasCurrentSceneState();
  const result = await invokeWorkspaceQueryBridge(ATLAS_CURRENT_SCENE_QUERY_ID, {
    projectId: currentProjectId,
    nodeId: currentDocumentId || '',
  });
  const nextState = result && result.ok !== false && result.atlasCurrentScene
    ? result.atlasCurrentScene
    : { state: 'unavailable', unavailableReason: 'ATLAS_QUERY_FAILED' };
  atlasCurrentSceneState = normalizeAtlasCurrentSceneDossier(nextState);
  renderAtlasCurrentSceneState();
}

function focusAtlasMention(mentionId = '') {
  const mention = atlasCurrentSceneState.mentions.find((item) => item.mentionId === mentionId);
  if (!mention || mention.sceneId !== currentDocumentId) {
    updateStatusText('Упоминание Atlas недоступно для текущей сцены');
    return;
  }
  const start = Number(mention.startOffset);
  const end = Number(mention.endOffset);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    updateStatusText('Atlas anchor устарел');
    return;
  }
  focusEditorSurface('atlas');
  setSelectionRange(start, end);
  updateStatusText('Atlas evidence открыт в тексте');
}

async function createSceneHistoryCheckpoint() {
  if (!currentProjectId || !currentDocumentId) return;
  const result = await invokePreloadUiCommandBridge(EXTRA_COMMAND_IDS.HISTORY_CREATE_CHECKPOINT, {
    projectId: currentProjectId,
    nodeId: currentDocumentId,
  });
  if (!result || result.ok !== true) {
    updateStatusText('Снимок истории не создан');
    await refreshSceneHistory();
    return;
  }
  updateStatusText('Снимок истории создан');
  await refreshSceneHistory('');
}

async function restoreSelectedSceneHistorySnapshot() {
  const selected = sceneHistoryState.selectedSnapshot;
  const snapshotId = selected?.snapshotId || sceneHistoryState.selectedSnapshotId || '';
  if (!currentProjectId || !currentDocumentId || !snapshotId) return;
  sceneHistoryState = { ...sceneHistoryState, restoreState: 'previewing' };
  renderSceneHistoryState();
  const previewResult = await invokePreloadUiCommandBridge(EXTRA_COMMAND_IDS.HISTORY_RESTORE_PREVIEW, {
    projectId: currentProjectId,
    nodeId: currentDocumentId,
    snapshotId,
  });
  const previewPlan = previewResult?.value?.previewPlan || previewResult?.previewPlan || null;
  if (!previewResult || previewResult.ok !== true || !previewPlan) {
    sceneHistoryState = { ...sceneHistoryState, restoreState: 'failed' };
    updateStatusText('Восстановление недоступно');
    renderSceneHistoryState();
    return;
  }
  const delta = previewPlan.diff && Number.isFinite(previewPlan.diff.deltaWords)
    ? previewPlan.diff.deltaWords
    : 0;
  const confirmed = window.confirm(`Восстановить выбранный снимок? Изменение: ${delta >= 0 ? '+' : ''}${delta} слов. Перед восстановлением будет создан новый checkpoint.`);
  if (!confirmed) {
    sceneHistoryState = { ...sceneHistoryState, restoreState: 'idle' };
    renderSceneHistoryState();
    return;
  }
  const applyResult = await invokePreloadUiCommandBridge(EXTRA_COMMAND_IDS.HISTORY_RESTORE_APPLY, {
    projectId: currentProjectId,
    nodeId: currentDocumentId,
    snapshotId,
    previewPlan,
    confirmed: true,
  });
  const receipt = applyResult?.value?.receipt || applyResult?.receipt || null;
  if (!applyResult || applyResult.ok !== true || !receipt) {
    sceneHistoryState = { ...sceneHistoryState, restoreState: 'failed' };
    updateStatusText('Восстановление не применено');
    renderSceneHistoryState();
    return;
  }
  sceneHistoryState = {
    ...sceneHistoryState,
    restoreReceiptId: typeof receipt.receiptId === 'string' ? receipt.receiptId : '',
    restoreState: 'applied',
    selectedSnapshotId: '',
  };
  updateStatusText('Снимок восстановлен');
  await refreshSceneHistory('');
}

async function undoLastSceneHistoryRestore() {
  const receiptId = sceneHistoryState.restoreReceiptId || '';
  if (!receiptId) return;
  const confirmed = window.confirm('Отменить последнее восстановление и вернуть текст, который был перед ним?');
  if (!confirmed) return;
  const undoResult = await invokePreloadUiCommandBridge(EXTRA_COMMAND_IDS.HISTORY_RESTORE_UNDO, {
    receiptId,
  });
  if (!undoResult || undoResult.ok !== true) {
    updateStatusText('Отмена восстановления недоступна');
    return;
  }
  sceneHistoryState = {
    ...sceneHistoryState,
    restoreReceiptId: '',
    restoreState: 'undone',
    selectedSnapshotId: '',
  };
  updateStatusText('Восстановление отменено');
  await refreshSceneHistory('');
}

function renderReviewSurface() {
  if (!(reviewSurfaceHost instanceof HTMLElement)) {
    return;
  }
  const viewModel = buildReviewSurfaceViewModel({
    ...reviewSurfaceState,
    exactTextApply: reviewSurfaceExactTextApplyTransientState,
  });
  reviewSurfaceHost.dataset.reviewSurfaceStatus = viewModel.status;
  reviewSurfaceHost.dataset.reviewSurfaceProvider = RIGHT_RAIL_SURFACE_PROVIDERS.comments;
  reviewSurfaceHost.innerHTML = renderReviewSurfaceMarkup(viewModel);
}

function setReviewSurfaceState(nextState = {}, options = {}) {
  reviewSurfaceState = reviewSurfaceNormalizeState(nextState);
  if (options.preserveExactApplyState !== true) {
    reviewSurfaceExactTextApplyTransientState = null;
  }
  renderReviewSurface();
  return reviewSurfaceState;
}

async function loadStage10ProductStateFromQuery() {
  if (!currentProjectId) {
    stage10ProductState = null;
    return null;
  }
  const result = await invokeWorkspaceQueryBridge(STAGE10_PRODUCT_STATE_QUERY_ID, {
    projectId: currentProjectId,
  });
  stage10ProductState = result?.ok === true && reviewSurfaceIsPlainObject(result.stage10ProductState)
    ? result.stage10ProductState
    : null;
  return stage10ProductState;
}

async function loadReviewSurfaceFromQuery() {
  const result = await invokeWorkspaceQueryBridge(REVIEW_SURFACE_QUERY_ID);
  await loadStage10ProductStateFromQuery();
  if (!result || result.ok === false) {
    return setReviewSurfaceState({});
  }
  if (reviewSurfaceHost instanceof HTMLElement) {
    reviewSurfaceHost.dataset.reviewSurfaceLoadedFrom = REVIEW_SURFACE_QUERY_ID;
  }
  return setReviewSurfaceState(result.reviewSurface);
}

function setReviewSurfaceExactTextApplyTransientState(nextState = null) {
  reviewSurfaceExactTextApplyTransientState = reviewSurfaceNormalizeExactTextApplyState(nextState);
  renderReviewSurface();
}

function reviewSurfaceCreateExactTextApplyRequestId(changeId) {
  const normalizedChangeId = reviewSurfaceText(changeId) || 'change';
  return `review-exact-apply-${normalizedChangeId}-${Date.now()}`;
}

function reviewSurfaceCreateExactTextApplyBatchRequestId(changeIds) {
  const normalizedChangeIds = reviewSurfaceArray(changeIds)
    .map((changeId) => reviewSurfaceText(changeId))
    .filter(Boolean);
  const suffix = normalizedChangeIds.length > 0 ? normalizedChangeIds.join('-') : 'batch';
  return `review-exact-batch-apply-${suffix}-${Date.now()}`;
}

async function handleReviewCancelOperation(payload = {}) {
  const operationId = reviewSurfaceText(payload.operationId || reviewSurfaceState?.reviewProgress?.operationId);
  reviewSurfaceExactTextApplyTransientState = null;
  reviewSurfaceState = {
    ...reviewSurfaceNormalizeState(reviewSurfaceState),
    reviewProgress: {
      active: false,
      cancelled: true,
      state: 'cancelled',
      label: 'Review operation cancelled locally',
      operationId,
      percent: 0,
      cancellable: false,
    },
  };
  renderReviewSurface();
  updateStatusText('Review operation cancelled');
  return {
    performed: true,
    action: 'reviewCancelOperation',
    reason: null,
    operationId,
  };
}

function setReviewFormattingEditorLock(locked) {
  if (!(editor instanceof HTMLElement)) return;
  if (locked) {
    if (!Object.prototype.hasOwnProperty.call(editor.dataset, 'reviewFormattingPreviousEditable')) {
      editor.dataset.reviewFormattingPreviousEditable = editor.getAttribute('contenteditable') || '';
    }
    editor.setAttribute('contenteditable', 'false');
    editor.setAttribute('aria-busy', 'true');
    return;
  }
  const previous = editor.dataset.reviewFormattingPreviousEditable;
  if (previous) editor.setAttribute('contenteditable', previous);
  else editor.removeAttribute('contenteditable');
  delete editor.dataset.reviewFormattingPreviousEditable;
  editor.removeAttribute('aria-busy');
}

async function handleStage10LifecycleProductCommand(button) {
  if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
  const commandId = reviewSurfaceText(button.dataset.stage10ProductCommand);
  if (!STAGE10_LIFECYCLE_PRODUCT_COMMANDS.some((command) => command.commandId === commandId)) return false;
  const request = buildStage10LifecycleCommandRequest(commandId);
  if (!request.available || !reviewSurfaceIsPlainObject(request.payload)) return false;
  stage10LifecycleSurfaceState = {
    status: 'running',
    lastCommandId: commandId,
    lastReceiptId: '',
    lastReason: '',
    runningCommandId: commandId,
  };
  renderReviewSurface();
  let result = null;
  try {
    result = await dispatchUiCommand(commandId, request.payload);
  } catch (error) {
    stage10LifecycleSurfaceState = {
      status: 'failed',
      lastCommandId: commandId,
      lastReceiptId: '',
      lastReason: error && typeof error.message === 'string' ? error.message : 'STAGE10_LIFECYCLE_COMMAND_THROW',
      runningCommandId: '',
    };
    renderReviewSurface();
    return true;
  }
  const reason = reviewSurfaceExtractCommandFailureReason(result);
  const receiptId = getStage10LifecycleReceiptId(result);
  stage10LifecycleSurfaceState = {
    status: result && result.ok === true ? 'complete' : 'failed',
    lastCommandId: commandId,
    lastReceiptId: receiptId,
    lastReason: result && result.ok === true ? '' : reason,
    runningCommandId: '',
  };
  updateStatusText(result && result.ok === true ? 'Stage-10 lifecycle command persisted' : 'Stage-10 lifecycle command failed');
  await loadStage10ProductStateFromQuery();
  renderReviewSurface();
  return true;
}

async function handleReviewSurfaceExactTextApplyClick(event) {
  const target = event?.target;
  if (!(target instanceof Element) || !(reviewSurfaceHost instanceof HTMLElement)) return;
  const stage10Button = target.closest('[data-stage10-product-command]');
  if (stage10Button instanceof HTMLButtonElement && reviewSurfaceHost.contains(stage10Button)) {
    await handleStage10LifecycleProductCommand(stage10Button);
    return;
  }
  const replayInspectButton = target.closest('[data-review-inspect-formatting-replay]');
  if (replayInspectButton instanceof HTMLButtonElement && reviewSurfaceHost.contains(replayInspectButton)) {
    if (replayInspectButton.disabled) return;
    replayInspectButton.disabled = true;
    let bridgeResult = null;
    try {
      bridgeResult = await invokePreloadUiCommandBridge(
        REVIEW_SURFACE_FORMATTING_REPLAY_INSPECT_COMMAND_ID,
        { requestId: `review-formatting-replay-${Date.now()}` },
      );
    } catch (error) {
      updateStatusText(error && typeof error.message === 'string'
        ? error.message
        : 'Не удалось проверить сохраненное форматирование');
      replayInspectButton.disabled = false;
      return;
    }
    const commandResult = reviewSurfaceUnwrapCommandResult(bridgeResult);
    if (reviewSurfaceIsPlainObject(commandResult?.reviewSurface)) {
      setReviewSurfaceState(commandResult.reviewSurface);
    } else {
      replayInspectButton.disabled = false;
    }
    updateStatusText(commandResult?.replayVerified === true
      ? 'Сохраненное форматирование подтверждено после повторного открытия'
      : reviewSurfaceExtractCommandFailureReason(bridgeResult) || 'Сохраненное форматирование требует восстановления');
    return;
  }
  const formattingButton = target.closest('[data-review-apply-formatting-return]');
  if (formattingButton instanceof HTMLButtonElement && reviewSurfaceHost.contains(formattingButton)) {
    if (formattingButton.disabled) return;
    formattingButton.disabled = true;
    setReviewFormattingEditorLock(true);
    const requestId = `review-formatting-apply-${Date.now()}`;
    let bridgeResult = null;
    try {
      bridgeResult = await invokePreloadUiCommandBridge(
        REVIEW_SURFACE_FORMATTING_APPLY_COMMAND_ID,
        { requestId },
      );
    } catch (error) {
      updateStatusText(error && typeof error.message === 'string'
        ? error.message
        : 'Не удалось применить форматирование из Word');
      formattingButton.disabled = false;
      return;
    } finally {
      setReviewFormattingEditorLock(false);
    }
    const commandResult = reviewSurfaceUnwrapCommandResult(bridgeResult);
    if (bridgeResult?.ok === true && commandResult?.ok === true && commandResult?.replayVerified === true) {
      setReviewSurfaceState(
        reviewSurfaceIsPlainObject(commandResult.reviewSurface) ? commandResult.reviewSurface : {},
      );
      updateStatusText('Форматирование из Word применено и проверено повтором');
      return;
    }
    if (reviewSurfaceIsPlainObject(commandResult?.reviewSurface)) {
      setReviewSurfaceState(commandResult.reviewSurface);
    } else {
      formattingButton.disabled = false;
    }
    updateStatusText(reviewSurfaceExtractCommandFailureReason(bridgeResult) || 'Форматирование из Word заблокировано');
    return;
  }
  const cancelButton = target.closest('[data-review-cancel-operation]');
  if (cancelButton instanceof HTMLButtonElement && reviewSurfaceHost.contains(cancelButton)) {
    if (cancelButton.disabled) return;
    cancelButton.disabled = true;
    let bridgeResult = null;
    try {
      bridgeResult = await invokePreloadUiCommandBridge(REVIEW_SURFACE_CANCEL_OPERATION_COMMAND_ID, {
        operationId: reviewSurfaceText(cancelButton.dataset.operationId),
      });
    } catch (error) {
      updateStatusText(error && typeof error.message === 'string'
        ? error.message
        : 'Review operation cancel failed');
      cancelButton.disabled = false;
      return;
    }
    const commandResult = reviewSurfaceUnwrapCommandResult(bridgeResult);
    if (bridgeResult?.ok === true && commandResult?.ok === true) {
      await handleReviewCancelOperation({
        operationId: reviewSurfaceText(commandResult.operationId || cancelButton.dataset.operationId),
      });
      return;
    }
    updateStatusText(reviewSurfaceText(commandResult?.reason || bridgeResult?.reason) || 'Review operation cancel failed');
    cancelButton.disabled = false;
    return;
  }
  const reloadButton = target.closest('[data-review-reload-reconciled-scene]');
  if (reloadButton instanceof HTMLButtonElement && reviewSurfaceHost.contains(reloadButton)) {
    if (reloadButton.disabled) return;
    const operationId = reviewSurfaceText(reloadButton.dataset.operationId);
    reloadButton.disabled = true;
    const requestId = `review-reconciliation-reload-${Date.now()}`;
    let bridgeResult = null;
    try {
      bridgeResult = await invokePreloadUiCommandBridge(
        REVIEW_SURFACE_RELOAD_RECONCILED_SCENE_COMMAND_ID,
        { requestId, operationId },
      );
    } catch (error) {
      setReviewSurfaceExactTextApplyTransientState({
        state: 'failed',
        requestId,
        changeId: '',
        reason: error && typeof error.message === 'string'
          ? error.message
          : 'REVIEW_RECONCILIATION_RELOAD_THROW',
      });
      return;
    }
    const commandResult = reviewSurfaceUnwrapCommandResult(bridgeResult);
    if (bridgeResult?.ok === true && commandResult?.ok === true && commandResult.reloaded === true) {
      reviewSurfaceExactTextApplyTransientState = null;
      setReviewSurfaceState(
        reviewSurfaceIsPlainObject(commandResult.reviewSurface) ? commandResult.reviewSurface : {},
      );
      return;
    }
    const reason = reviewSurfaceExtractCommandFailureReason(bridgeResult);
    setReviewSurfaceExactTextApplyTransientState({
      state: reviewSurfaceIsExactApplyAmbiguousReason(reason) ? 'ambiguous' : 'failed',
      requestId,
      changeId: '',
      reason,
    });
    return;
  }
  const fullManuscriptButton = target.closest('[data-review-apply-full-manuscript-exact]');
  if (fullManuscriptButton instanceof HTMLButtonElement && reviewSurfaceHost.contains(fullManuscriptButton)) {
    if (fullManuscriptButton.disabled) return;
    const requestId = `review-full-manuscript-exact-apply-${Date.now()}`;
    setReviewSurfaceExactTextApplyTransientState({
      state: 'applying',
      requestId,
      changeId: '',
    });

    let bridgeResult = null;
    try {
      bridgeResult = await invokePreloadUiCommandBridge(
        REVIEW_SURFACE_FULL_MANUSCRIPT_EXACT_TEXT_APPLY_COMMAND_ID,
        { requestId },
      );
    } catch (error) {
      setReviewSurfaceExactTextApplyTransientState({
        state: 'failed',
        requestId,
        changeId: '',
        reason: error && typeof error.message === 'string' ? error.message : 'REVIEW_SURFACE_FULL_MANUSCRIPT_APPLY_THROW',
      });
      return;
    }

    const commandResult = reviewSurfaceUnwrapCommandResult(bridgeResult);
    if (
      bridgeResult?.ok === true
      && commandResult?.ok === true
      && (commandResult.applied === true || commandResult.replay === true)
    ) {
      reviewSurfaceExactTextApplyTransientState = null;
      if (reviewSurfaceIsPlainObject(commandResult.reviewSurface)) {
        setReviewSurfaceState(commandResult.reviewSurface);
        return;
      }
      await loadReviewSurfaceFromQuery();
      return;
    }

    const reason = reviewSurfaceExtractCommandFailureReason(bridgeResult);
    const blocked = reviewSurfaceIsExactApplyBlockedReason(reason);
    reviewSurfaceExactTextApplyTransientState = {
      state: reviewSurfaceIsExactApplyAmbiguousReason(reason) ? 'ambiguous' : (blocked ? 'blocked' : 'failed'),
      requestId,
      changeId: '',
      reason,
    };
    if (reviewSurfaceIsPlainObject(commandResult?.reviewSurface)) {
      setReviewSurfaceState(commandResult.reviewSurface, { preserveExactApplyState: true });
    } else {
      renderReviewSurface();
    }
    return;
  }
  const batchButton = target.closest('[data-review-apply-exact-batch]');
  if (batchButton instanceof HTMLButtonElement && reviewSurfaceHost.contains(batchButton)) {
    if (batchButton.disabled) return;
    const changeIds = reviewSurfaceText(batchButton.dataset.changeIds)
      .split(',')
      .map((changeId) => changeId.trim())
      .filter(Boolean);
    const requestId = reviewSurfaceCreateExactTextApplyBatchRequestId(changeIds);
    setReviewSurfaceExactTextApplyTransientState({
      state: 'applying',
      requestId,
      changeId: '',
    });

    const payload = reviewSurfaceBuildExactTextApplyBatchPayload(requestId, changeIds);
    let bridgeResult = null;
    try {
      bridgeResult = await invokePreloadUiCommandBridge(REVIEW_SURFACE_EXACT_TEXT_APPLY_BATCH_COMMAND_ID, payload);
    } catch (error) {
      setReviewSurfaceExactTextApplyTransientState({
        state: 'failed',
        requestId,
        changeId: '',
        reason: error && typeof error.message === 'string' ? error.message : 'REVIEW_SURFACE_BATCH_APPLY_THROW',
      });
      return;
    }

    const commandResult = reviewSurfaceUnwrapCommandResult(bridgeResult);
    if (bridgeResult?.ok === true && commandResult?.ok === true && commandResult.applied === true) {
      reviewSurfaceExactTextApplyTransientState = null;
      if (reviewSurfaceIsPlainObject(commandResult.reviewSurface)) {
        setReviewSurfaceState(commandResult.reviewSurface);
        return;
      }
      await loadReviewSurfaceFromQuery();
      return;
    }

    const reason = reviewSurfaceExtractCommandFailureReason(bridgeResult);
    const blocked = reviewSurfaceIsExactApplyBlockedReason(reason);
    reviewSurfaceExactTextApplyTransientState = {
      state: reviewSurfaceIsExactApplyAmbiguousReason(reason) ? 'ambiguous' : (blocked ? 'blocked' : 'failed'),
      requestId,
      changeId: '',
      reason,
    };
    if (reviewSurfaceIsPlainObject(commandResult?.reviewSurface)) {
      setReviewSurfaceState(commandResult.reviewSurface, { preserveExactApplyState: true });
    } else {
      renderReviewSurface();
    }
    return;
  }

  const button = target.closest('[data-review-apply-exact-change]');
  if (!(button instanceof HTMLButtonElement) || !reviewSurfaceHost.contains(button) || button.disabled) {
    return;
  }

  const changeId = reviewSurfaceText(button.dataset.changeId);
  const requestId = reviewSurfaceCreateExactTextApplyRequestId(changeId);
  setReviewSurfaceExactTextApplyTransientState({
    state: 'applying',
    requestId,
    changeId,
  });

  const payload = reviewSurfaceBuildExactTextApplyPayload(requestId, changeId);
  let bridgeResult = null;
  try {
    bridgeResult = await invokePreloadUiCommandBridge(REVIEW_SURFACE_EXACT_TEXT_APPLY_COMMAND_ID, payload);
  } catch (error) {
    setReviewSurfaceExactTextApplyTransientState({
      state: 'failed',
      requestId,
      changeId,
      reason: error && typeof error.message === 'string' ? error.message : 'REVIEW_SURFACE_APPLY_THROW',
    });
    return;
  }

  const commandResult = reviewSurfaceUnwrapCommandResult(bridgeResult);
  if (bridgeResult?.ok === true && commandResult?.ok === true && commandResult.applied === true) {
    reviewSurfaceExactTextApplyTransientState = null;
    if (reviewSurfaceIsPlainObject(commandResult.reviewSurface)) {
      setReviewSurfaceState(commandResult.reviewSurface);
      return;
    }
    await loadReviewSurfaceFromQuery();
    return;
  }

  const reason = reviewSurfaceExtractCommandFailureReason(bridgeResult);
  const blocked = reviewSurfaceIsExactApplyBlockedReason(reason);
  reviewSurfaceExactTextApplyTransientState = {
    state: reviewSurfaceIsExactApplyAmbiguousReason(reason) ? 'ambiguous' : (blocked ? 'blocked' : 'failed'),
    requestId,
    changeId,
    reason,
  };
  if (reviewSurfaceIsPlainObject(commandResult?.reviewSurface)) {
    setReviewSurfaceState(commandResult.reviewSurface, { preserveExactApplyState: true });
  } else {
    renderReviewSurface();
  }
}

function bindReviewSurfaceApplyActions() {
  if (!(reviewSurfaceHost instanceof HTMLElement) || reviewSurfaceApplyActionListenerBound) {
    return;
  }
  reviewSurfaceHost.addEventListener('click', handleReviewSurfaceExactTextApplyClick);
  reviewSurfaceApplyActionListenerBound = true;
}

function initializeReviewSurface() {
  bindReviewSurfaceApplyActions();
  setReviewSurfaceState({});
}

function applyMode(mode) {
  currentMode = mode;
  document.body.dataset.mode = mode;
  for (const button of modeButtons) {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  if (mode === 'plan') {
    applyLeftTab('outline');
  } else if (mode === 'review') {
    applyRightTab(collabScopeLocal ? 'comments' : 'inspector');
  } else {
    applyLeftTab('project');
    applyRightTab('inspector');
  }
  const viewportWidth = getSpatialLayoutViewportWidth();
  const constraints = getSpatialLayoutConstraintsForViewport(viewportWidth);
  if (constraints.rightVisible) {
    const currentSpatialState = spatialLayoutState || getSpatialLayoutBaselineForViewport(viewportWidth);
    const normalizedSpatialState = normalizeSpatialLayoutState(currentSpatialState, viewportWidth);
    const hasSpatialDrift =
      normalizedSpatialState.leftSidebarWidth !== currentSpatialState.leftSidebarWidth ||
      normalizedSpatialState.rightSidebarWidth !== currentSpatialState.rightSidebarWidth ||
      normalizedSpatialState.viewportMode !== currentSpatialState.viewportMode;
    if (hasSpatialDrift) {
      applySpatialLayoutState(normalizedSpatialState, { persist: true, projectId: currentProjectId });
    }
  }
  syncLayoutPreviewVisibility();
  updateInspectorSnapshot();
  syncToolbarShellState();
  if (mode === 'plan') {
    showManualMapPlanWorkspace();
  } else if (manualMapPlanWorkspace instanceof HTMLElement && manualMapPlanWorkspace.hidden !== true) {
    showEditorPanelFor(currentDocumentTitle || 'Yalken');
  }
}

function resolveSafeResetFontFamily() {
  if (fontSelect) {
    const hasPreferredOption = Array.from(fontSelect.options).some((option) => option.value === SAFE_RESET_BASELINE_FONT_FAMILY);
    if (hasPreferredOption) {
      return SAFE_RESET_BASELINE_FONT_FAMILY;
    }
    if (typeof fontSelect.value === 'string' && fontSelect.value.trim()) {
      return fontSelect.value;
    }
  }
  return SAFE_RESET_BASELINE_FONT_FAMILY;
}

function clearProjectWorkspaceStorage(projectId = currentProjectId) {
  const normalizedProjectId = normalizeProjectId(projectId);
  const keysToRemove = new Set([
    'activeDocumentTitle',
    'spatialLayout',
    ...PROJECT_WORKSPACE_RESET_TABS.map((tab) => `treeExpanded:${tab}`),
  ]);

  if (normalizedProjectId) {
    keysToRemove.add(getActiveDocumentTitleStorageKey(normalizedProjectId));
    keysToRemove.add(getSpatialLayoutStorageKey(normalizedProjectId));
    keysToRemove.add(getToolbarProfileStorageKey(normalizedProjectId));
    PROJECT_WORKSPACE_RESET_TABS.forEach((tab) => {
      keysToRemove.add(getTreeExpandedStorageKey(tab, normalizedProjectId));
    });
  }

  try {
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    if (normalizedProjectId) {
      const prefixedKeys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (typeof key === 'string' && key.startsWith(`treeExpanded:${normalizedProjectId}:`)) {
          prefixedKeys.push(key);
        }
      }
      prefixedKeys.forEach((key) => localStorage.removeItem(key));
    }
  } catch {}

  expandedNodesByTab = new Map();
}

function performSafeResetShell() {
  const nextFontFamily = resolveSafeResetFontFamily();

  clearProjectWorkspaceStorage(currentProjectId);
  navigatorSelectionState = createNavigatorSelectionState(currentProjectId);

  try {
    localStorage.removeItem('editorTheme');
    localStorage.removeItem('editorFont');
    localStorage.removeItem('editorFontWeight');
    localStorage.removeItem('editorLineHeight');
    localStorage.removeItem('editorWordWrap');
    localStorage.removeItem('editorViewMode');
    localStorage.removeItem(EDITOR_ZOOM_STORAGE_KEY);
    localStorage.removeItem(FLOATING_TOOLBAR_STORAGE_KEY);
    localStorage.removeItem(FLOATING_TOOLBAR_ITEM_OFFSETS_STORAGE_KEY);
    localStorage.removeItem(LEFT_FLOATING_TOOLBAR_STORAGE_KEY);
    localStorage.removeItem(LEFT_TOOLBAR_BUTTON_OFFSETS_STORAGE_KEY);
  } catch {}
  consumeLegacyConfiguratorBuckets(localStorage);

  applyTheme(SAFE_RESET_BASELINE_THEME);
  if (settingsThemeSelect) {
    settingsThemeSelect.value = SAFE_RESET_BASELINE_THEME;
  }

  if (fontSelect) {
    ensureSelectHasOption(fontSelect, nextFontFamily, 'Roboto Ms');
    fontSelect.value = nextFontFamily;
  }
  applyFont(nextFontFamily);

  if (weightSelect) {
    weightSelect.value = SAFE_RESET_BASELINE_FONT_WEIGHT;
  }
  applyFontWeight(SAFE_RESET_BASELINE_FONT_WEIGHT);

  if (lineHeightSelect) {
    ensureSelectHasOption(lineHeightSelect, SAFE_RESET_BASELINE_LINE_HEIGHT, SAFE_RESET_BASELINE_LINE_HEIGHT, '__custom_line_height__');
    lineHeightSelect.value = SAFE_RESET_BASELINE_LINE_HEIGHT;
  }
  applyLineHeight(SAFE_RESET_BASELINE_LINE_HEIGHT);

  applyWordWrap(true);
  if (settingsWrapSelect) {
    settingsWrapSelect.value = 'on';
  }
  applyViewMode(SAFE_RESET_BASELINE_VIEW_MODE);
  setEditorZoom(EDITOR_ZOOM_DEFAULT);
  setToolbarCompactMode(false);
  applySpatialLayoutState(getSpatialLayoutBaselineForViewport(), {
    persist: true,
    projectId: currentProjectId,
  });

  if (editor) {
    editor.style.fontSize = `${SAFE_RESET_BASELINE_FONT_SIZE_PX}px`;
  }
  setCurrentFontSize(SAFE_RESET_BASELINE_FONT_SIZE_PX);
  window.electronAPI?.setFontSizePx(SAFE_RESET_BASELINE_FONT_SIZE_PX);

  toolbarItemOffsets = {};
  persistFloatingToolbarItemOffsets();
  applyFloatingToolbarState(getDefaultFloatingToolbarState(), true);

  leftToolbarButtonOffsets = {};
  persistLeftToolbarButtonOffsets();
  applyLeftFloatingToolbarState(getDefaultLeftFloatingToolbarState(), true);

  const nextToolbarProfileState = createToolbarConfiguratorSeedState();
  configuratorBucketState = nextToolbarProfileState;
  if (normalizeProjectId(currentProjectId)) {
    writeToolbarConfiguratorStoredState(currentProjectId, nextToolbarProfileState);
  }
  renderToolbarConfiguratorProfileSwitch();
  renderToolbarConfiguratorBuckets();
  setConfiguratorOpen(false);
  setToolbarSpacingTuningMode(false);
  setToolbarSpacingMenuOpen(false);
  setLeftToolbarSpacingTuningMode(false);
  setLeftToolbarSpacingMenuOpen(false);
  projectMainFloatingToolbarRuntime('safe-reset-shell');

  if (leftSearchInput) {
    leftSearchInput.value = '';
    renderSearchResults('');
  }

  closeSimpleModal(settingsModal);
  closeSimpleModal(recoveryModal);
  closeSimpleModal(exportPreviewModal);
  closeSimpleModal(exportSurfaceModal);
  closeSimpleModal(selectedScenesTxtExportModal);
  closeSimpleModal(importSurfaceModal);
  closeDocxImportPreviewModal();
  closeSimpleModal(diagnosticsModal);

  applyMode('write');
  applyLeftTab('project');
  applyRightTab('inspector');
  loadTree();
  updateWordCount();
  updateSaveStateText(localDirty ? 'unsaved' : 'idle');
  updateWarningStateText('none');
  updatePerfHintText('normal');
  updateStatusText('Shell reset to baseline');
  updateInspectorSnapshot();

  return { performed: true, action: 'safe-reset-shell', reason: null };
}

function performRestoreLastStableShell() {
  const savedActiveDocumentTitle = String(
    readWorkspaceStorage(getActiveDocumentTitleStorageKey(currentProjectId), 'activeDocumentTitle') || ''
  ).trim();

  loadSavedTheme();
  if (settingsThemeSelect) {
    settingsThemeSelect.value = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
  }

  loadSavedFont();
  loadSavedFontWeight();
  loadSavedLineHeight();
  loadSavedWordWrap();
  if (settingsWrapSelect) {
    settingsWrapSelect.value = wordWrapEnabled ? 'on' : 'off';
  }
  loadSavedViewMode();
  loadSavedEditorZoom();

  const restoredFontSizePx = Number.isFinite(currentFontSizePx)
    ? currentFontSizePx
    : SAFE_RESET_BASELINE_FONT_SIZE_PX;
  if (editor) {
    editor.style.fontSize = `${restoredFontSizePx}px`;
  }
  setCurrentFontSize(restoredFontSizePx);
  window.electronAPI?.setFontSizePx(restoredFontSizePx);

  restoreFloatingToolbarItemOffsets();
  restoreFloatingToolbarPosition();
  restoreLeftToolbarButtonOffsets();
  restoreLeftFloatingToolbarPosition();
  restoreSpatialLayoutState(currentProjectId);

  adoptToolbarConfiguratorState(currentProjectId);
  setConfiguratorOpen(false);
  setToolbarSpacingTuningMode(false);
  setToolbarSpacingMenuOpen(false);
  setLeftToolbarSpacingTuningMode(false);
  setLeftToolbarSpacingMenuOpen(false);

  expandedNodesByTab = new Map();
  renderTree();
  if (leftSearchInput && currentLeftTab === 'search') {
    renderSearchResults(leftSearchInput.value);
  }

  closeSimpleModal(settingsModal);
  closeSimpleModal(recoveryModal);
  closeSimpleModal(exportPreviewModal);
  closeSimpleModal(exportSurfaceModal);
  closeSimpleModal(selectedScenesTxtExportModal);
  closeSimpleModal(importSurfaceModal);
  closeDocxImportPreviewModal();
  closeSimpleModal(diagnosticsModal);

  updateWordCount();
  updateSaveStateText(localDirty ? 'unsaved' : 'idle');
  updateWarningStateText('recovery restored');
  updatePerfHintText('normal');
  updateStatusText(
    savedActiveDocumentTitle
      ? `Restored last stable shell state for ${savedActiveDocumentTitle}`
      : 'Restored last stable shell state'
  );
  updateInspectorSnapshot();

  return { performed: true, action: 'restore-last-stable-shell', reason: null };
}

function openSimpleModal(modal) {
  if (!modal) return;
  modal.hidden = false;
}

function closeSimpleModal(modal) {
  if (!modal) return;
  modal.hidden = true;
}

function filterCommandPaletteEntries(entries, rawQuery) {
  const query = typeof rawQuery === 'string' ? rawQuery.trim().toLowerCase() : '';
  if (!query) return entries.slice();
  return entries.filter((entry) => {
    const label = typeof entry?.label === 'string' ? entry.label.toLowerCase() : '';
    const id = typeof entry?.id === 'string' ? entry.id.toLowerCase() : '';
    const hotkey = typeof entry?.hotkey === 'string' ? entry.hotkey.toLowerCase() : '';
    return label.includes(query) || id.includes(query) || hotkey.includes(query);
  });
}

function renderCommandPaletteList(rawQuery = '') {
  if (!commandPaletteList || typeof document === 'undefined') return;
  const sourceEntries =
    commandPaletteDataProvider && typeof commandPaletteDataProvider.listAll === 'function'
      ? commandPaletteDataProvider.listAll()
      : [];
  const entries = filterCommandPaletteEntries(Array.isArray(sourceEntries) ? sourceEntries : [], rawQuery);
  const fragment = document.createDocumentFragment();
  commandPaletteList.innerHTML = '';
  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const commandId = typeof entry.id === 'string' ? entry.id : '';
    if (!commandId) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'modal__button';
    button.dataset.commandPaletteCommandId = commandId;
    const label = typeof entry.label === 'string' && entry.label.length > 0 ? entry.label : commandId;
    const hotkey = typeof entry.hotkey === 'string' && entry.hotkey.length > 0 ? ` (${entry.hotkey})` : '';
    button.textContent = `${label}${hotkey}`;
    fragment.append(button);
  });
  commandPaletteList.append(fragment);
  if (commandPaletteSummary) {
    commandPaletteSummary.textContent =
      entries.length > 0 ? `Commands available: ${entries.length}` : 'No commands found';
  }
}

function ensureCommandPaletteSearchFieldVisible() {
  if (!commandPaletteSearchInput) return;
  commandPaletteSearchInput.hidden = false;
  commandPaletteSearchInput.disabled = false;
  commandPaletteSearchInput.readOnly = false;
  commandPaletteSearchInput.tabIndex = 0;
  if (typeof commandPaletteSearchInput.removeAttribute === 'function') {
    commandPaletteSearchInput.removeAttribute('hidden');
    commandPaletteSearchInput.removeAttribute('disabled');
    commandPaletteSearchInput.removeAttribute('readonly');
  }
  if (commandPaletteSearchInput.style) {
    commandPaletteSearchInput.style.display = 'block';
    commandPaletteSearchInput.style.visibility = 'visible';
    commandPaletteSearchInput.style.opacity = '1';
    commandPaletteSearchInput.style.pointerEvents = 'auto';
    commandPaletteSearchInput.style.minHeight = '36px';
  }
}

function openCommandPaletteModal() {
  ensureCommandPaletteSearchFieldVisible();
  if (commandPaletteSearchInput) {
    commandPaletteSearchInput.value = '';
  }
  renderCommandPaletteList('');
  openSimpleModal(commandPaletteModal);
  commandPaletteSearchInput?.focus();
}

function setImportSurfaceStatus(message = '', detail = '') {
  if (importSurfaceStatus) {
    importSurfaceStatus.textContent = message || 'Choose a local source format. Preview creates no project files.';
  }
  if (importSurfaceDetail) {
    importSurfaceDetail.textContent = detail || 'Unsupported structure stays outside automatic import.';
  }
}

function normalizeSurfaceCommandId(input = '') {
  if (typeof input === 'string') return input.trim();
  if (input && typeof input === 'object' && !Array.isArray(input) && typeof input.commandId === 'string') {
    return input.commandId.trim();
  }
  return '';
}

function openImportSurfaceModal(commandId = '') {
  const normalizedCommandId = normalizeSurfaceCommandId(commandId);
  const currentFormat = normalizedCommandId === COMMAND_IDS.PROJECT_IMPORT_DOCX_V1
    ? 'DOCX'
    : (normalizedCommandId === COMMAND_IDS.PROJECT_IMPORT_TXT_V1
      ? 'TXT'
      : (normalizedCommandId === COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1
        ? 'Markdown'
        : (normalizedCommandId === COMMAND_IDS.PROJECT_IMPORT_FULL_ARCHIVE_V1 ? 'Project Archive' : '')));
  const prefix = currentFormat ? `${currentFormat} selected. ` : '';
  setImportSurfaceStatus(
    `${prefix}Choose the existing safe import lane to preview before writing.`,
    'Preview remains zero-write; accept delegates to the format safe-create command.',
  );
  openSimpleModal(importSurfaceModal);
}

function closeImportSurfaceModal() {
  closeSimpleModal(importSurfaceModal);
}

function runImportSurfaceFormat(format) {
  const normalizedFormat = typeof format === 'string' ? format.trim().toLowerCase() : '';
  closeImportSurfaceModal();
  if (normalizedFormat === 'docx') {
    return openDocxImportPreviewFlow();
  }
  if (normalizedFormat === 'txt') {
    return openTxtImportPreviewFlow();
  }
  if (normalizedFormat === 'markdown') {
    return handleMarkdownImportUiPath();
  }
  if (normalizedFormat === 'archive') {
    return handleProjectArchiveImportUiPath();
  }
  updateStatusText('Import format unavailable');
  return undefined;
}

function setExportSurfaceStatus(message = '', detail = '') {
  if (exportSurfaceStatus) {
    exportSurfaceStatus.textContent = message || 'Choose what to export from saved project truth.';
  }
  if (exportSurfaceDetail) {
    exportSurfaceDetail.textContent = detail || 'Unsupported layout fidelity is reported by the chosen export lane.';
  }
}

function openExportSurfaceModal(commandId = '') {
  const normalizedCommandId = normalizeSurfaceCommandId(commandId);
  const currentFormat = normalizedCommandId === COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN
    ? 'DOCX Minimal'
    : (normalizedCommandId === COMMAND_IDS.PROJECT_EXPORT_PDF_V1
      ? 'PDF'
      : (normalizedCommandId === COMMAND_IDS.PROJECT_EXPORT_FULL_ARCHIVE_V1
        ? 'Project Archive'
        : (normalizedCommandId === COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1
          ? 'Markdown'
          : (normalizedCommandId === BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID
            ? 'Black Box CORE Capsule'
            : (normalizedCommandId === EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT
              ? 'TXT Selected Scenes'
              : (normalizedCommandId === EXTRA_COMMAND_IDS.PROJECT_EXPORT_CURRENT_SCENE_TXT
                ? 'TXT Current Scene'
                : (normalizedCommandId === EXTRA_COMMAND_IDS.PROJECT_EXPORT_ALL_SCENES_TXT ? 'TXT All Scenes' : '')))))));
  const prefix = currentFormat ? `${currentFormat} selected. ` : '';
  const detail = normalizedCommandId === BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID
    ? 'Black Box CORE capsule export remains default-off; Command Kernel revalidates saved CORE truth, provider, source fence, and safe target before writing.'
    : 'Target picking, loss reports, and unsupported fidelity stay owned by the selected export command.';
  setExportSurfaceStatus(
    `${prefix}Choose an existing export lane; project text is read from saved truth.`,
    detail,
  );
  openSimpleModal(exportSurfaceModal);
}

function closeExportSurfaceModal() {
  closeSimpleModal(exportSurfaceModal);
}

function getExportBridgeValue(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return {};
  if (result.value && typeof result.value === 'object' && !Array.isArray(result.value)) {
    return result.value;
  }
  return result;
}

function findCommandResultReason(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 4) return '';
  if (typeof value.reason === 'string' && value.reason) return value.reason;
  if (value.error && typeof value.error === 'object' && !Array.isArray(value.error)) {
    const errorReason = findCommandResultReason(value.error, depth + 1);
    if (errorReason) return errorReason;
  }
  if (value.value && typeof value.value === 'object' && !Array.isArray(value.value)) {
    const nestedReason = findCommandResultReason(value.value, depth + 1);
    if (nestedReason) return nestedReason;
  }
  if (value.details && typeof value.details === 'object' && !Array.isArray(value.details)) {
    const detailReason = findCommandResultReason(value.details, depth + 1);
    if (detailReason) return detailReason;
  }
  if (typeof value.error === 'string' && value.error) return value.error;
  return '';
}

async function runExportSurfaceBridgeCommand(commandId, requestPrefix, statusBase) {
  updateStatusText(`${statusBase} export`);
  setExportSurfaceStatus(`${statusBase} export`, 'Command Kernel is resolving the saved project truth.');
  const payload = {
    requestId: `${requestPrefix}-${Date.now()}`,
  };
  if (
    commandId !== EXTRA_COMMAND_IDS.PROJECT_EXPORT_ALL_SCENES_TXT
    && commandId !== EXTRA_COMMAND_IDS.PROJECT_EXPORT_CURRENT_SCENE_TXT
  ) {
    payload.confirmed = true;
  }
  const result = await invokePreloadUiCommandBridge(commandId, {
    ...payload,
  });
  if (!result || result.ok !== true) {
    updateStatusText(`${statusBase} export failed`);
    const reason = findCommandResultReason(result) || 'Command returned NOT_OK';
    setExportSurfaceStatus(`${statusBase} export failed`, reason);
    return result;
  }
  const value = getExportBridgeValue(result);
  if (value.canceled === true || value.cancelled === true) {
    updateStatusText(`${statusBase} export cancelled`);
    setExportSurfaceStatus(`${statusBase} export cancelled`, 'Target selection was cancelled.');
    return result;
  }
  if (value.exported === true || result.ok === true) {
    const sceneCount = Number.isInteger(value.sceneCount) ? `: ${value.sceneCount}` : '';
    updateStatusText(`${statusBase} exported${sceneCount}`);
    setExportSurfaceStatus(`${statusBase} exported${sceneCount}`, value.outPath || 'Export completed.');
    return result;
  }
  updateStatusText(`${statusBase} export unavailable`);
  setExportSurfaceStatus(`${statusBase} export unavailable`, 'Command completed without an exported artifact.');
  return result;
}

function runExportSurfaceFormat(format) {
  const normalizedFormat = typeof format === 'string' ? format.trim().toLowerCase() : '';
  closeExportSurfaceModal();
  if (normalizedFormat === 'docx') {
    return openExportPreviewModal();
  }
  if (normalizedFormat === 'pdf') {
    return runExportSurfaceBridgeCommand(
      COMMAND_IDS.PROJECT_EXPORT_PDF_V1,
      'export-pdf',
      'PDF',
    );
  }
  if (normalizedFormat === 'archive') {
    return runExportSurfaceBridgeCommand(
      COMMAND_IDS.PROJECT_EXPORT_FULL_ARCHIVE_V1,
      'export-full-archive',
      'Project archive',
    );
  }
  if (normalizedFormat === BLACK_BOX_EXPORT_MANUAL_CORE_FORMAT) {
    return runExportSurfaceBridgeCommand(
      BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID,
      'black-box-manual-core-capsule',
      'Black Box CORE capsule',
    );
  }
  if (normalizedFormat === 'markdown') {
    return handleMarkdownExportUiPath();
  }
  if (normalizedFormat === 'txt-current') {
    return runExportSurfaceBridgeCommand(
      EXTRA_COMMAND_IDS.PROJECT_EXPORT_CURRENT_SCENE_TXT,
      'export-current-scene-txt',
      'Current scene TXT',
    );
  }
  if (normalizedFormat === 'txt-selected') {
    return openSelectedScenesTxtExportFlow();
  }
  if (normalizedFormat === 'txt-all') {
    return runExportSurfaceBridgeCommand(
      EXTRA_COMMAND_IDS.PROJECT_EXPORT_ALL_SCENES_TXT,
      'export-all-scenes-txt',
      'All scenes TXT',
    );
  }
  updateStatusText('Export format unavailable');
  return undefined;
}

function runCommandPaletteAction(commandId) {
  if (typeof commandId !== 'string' || commandId.trim().length === 0) return;
  closeSimpleModal(commandPaletteModal);
  const normalizedCommandId = commandId.trim();
  const importDocxCommandId = 'cmd.project.importDocxV1';
  const importTxtCommandId = 'cmd.project.importTxtV1';
  const importMarkdownCommandId = 'cmd.project.importMarkdownV1';
  const importFullArchiveCommandId = 'cmd.project.importFullArchiveV1';
  const exportDocxCommandId = 'cmd.project.export.docxMin';
  const exportPdfCommandId = 'cmd.project.exportPdfV1';
  const exportFullArchiveCommandId = 'cmd.project.exportFullArchiveV1';
  const exportMarkdownCommandId = 'cmd.project.exportMarkdownV1';
  if (normalizedCommandId === importDocxCommandId) {
    return openImportSurfaceModal(normalizedCommandId);
  }
  if (normalizedCommandId === importTxtCommandId) {
    return openImportSurfaceModal(normalizedCommandId);
  }
  if (normalizedCommandId === importMarkdownCommandId) {
    return openImportSurfaceModal(normalizedCommandId);
  }
  if (normalizedCommandId === importFullArchiveCommandId) {
    return openImportSurfaceModal(normalizedCommandId);
  }
  if (normalizedCommandId === exportDocxCommandId) {
    return openExportSurfaceModal(normalizedCommandId);
  }
  if (normalizedCommandId === exportPdfCommandId) {
    return openExportSurfaceModal(normalizedCommandId);
  }
  if (normalizedCommandId === exportFullArchiveCommandId) {
    return openExportSurfaceModal(normalizedCommandId);
  }
  if (normalizedCommandId === exportMarkdownCommandId) {
    return openExportSurfaceModal(normalizedCommandId);
  }
  if (normalizedCommandId === BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID) {
    return openExportSurfaceModal(normalizedCommandId);
  }
  return dispatchUiCommand(commandId.trim());
}

function buildSettingsAggregationSnapshot() {
  const profile = getActiveBookProfile(activeBookProfileState);
  return buildSettingsAggregation({
    theme: document.body.classList.contains('dark-theme') ? 'dark' : 'light',
    fontFamily: fontSelect?.value || '',
    fontWeight: weightSelect?.value || '',
    fontSizePx: currentFontSizePx,
    lineHeight: lineHeightSelect?.value || '',
    wordWrap: wordWrapEnabled,
    viewMode: styleSelect?.value || localStorage.getItem('editorViewMode') || 'default',
    editorZoom,
    projectId: currentProjectId,
    bookFormat: profile.formatId || 'A4',
    bookOrientation: profile.orientation || 'portrait',
    toolbarProfile: getToolbarConfiguratorActiveProfile(),
    entitlementTier: 'free',
  });
}

function renderSettingsAggregation() {
  if (!settingsSections && !settingsSummary) return;
  const aggregation = buildSettingsAggregationSnapshot();
  const summary = summarizeSettingsAggregation(aggregation);
  if (settingsSummary) {
    settingsSummary.textContent = `${summary.total} settings · ${summary.live} live · ${summary.readOnly} read-only · ${summary.unavailable} unavailable`;
  }
  if (!settingsSections) return;
  settingsSections.replaceChildren();

  aggregation.sections.forEach((section) => {
    if (!section.settings.length) return;
    const sectionElement = document.createElement('section');
    sectionElement.className = 'settings-surface__section';
    sectionElement.dataset.settingsSection = section.id;

    const heading = document.createElement('h4');
    heading.className = 'settings-surface__section-title';
    heading.textContent = section.label;
    sectionElement.appendChild(heading);

    section.settings.forEach((setting) => {
      const row = document.createElement('div');
      row.className = 'settings-surface__row';
      row.dataset.settingsId = setting.id;
      row.dataset.settingsStatus = setting.status;
      row.dataset.settingsOwner = setting.owner;
      row.dataset.settingsPersistence = setting.persistenceClass;
      row.dataset.settingsScope = setting.scope;

      const main = document.createElement('div');
      main.className = 'settings-surface__row-main';
      const label = document.createElement('div');
      label.className = 'settings-surface__row-label';
      label.textContent = setting.label;
      const meta = document.createElement('div');
      meta.className = 'settings-surface__row-meta';
      meta.textContent = `${setting.owner} · ${setting.scope} · ${setting.persistenceClass}`;
      main.append(label, meta);

      const aside = document.createElement('div');
      aside.className = 'settings-surface__row-aside';
      const value = document.createElement('span');
      value.className = 'settings-surface__row-value';
      value.textContent = setting.value;
      const status = document.createElement('span');
      status.className = `settings-surface__status settings-surface__status--${setting.status}`;
      status.textContent = setting.status.replace('_', ' ');
      aside.append(value, status);

      row.append(main, aside);
      if (setting.note) {
        const note = document.createElement('div');
        note.className = 'settings-surface__row-note';
        note.textContent = setting.note;
        row.appendChild(note);
      }
      sectionElement.appendChild(row);
    });

    settingsSections.appendChild(sectionElement);
  });
}

function openSettingsModal() {
  if (settingsThemeSelect) {
    settingsThemeSelect.value = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
  }
  if (settingsWrapSelect) {
    settingsWrapSelect.value = wordWrapEnabled ? 'on' : 'off';
  }
  renderSettingsAggregation();
  openSimpleModal(settingsModal);
}

function openRecoveryModal(message = '') {
  if (recoveryMessage) {
    recoveryMessage.textContent = message || 'Recovery ready';
  }
  openSimpleModal(recoveryModal);
}

function openDiagnosticsModal() {
  if (diagnosticsText) {
    const lines = [
      `mode=${currentMode}`,
      `leftTab=${currentLeftTab}`,
      `rightTab=${currentRightTab}`,
      `docKind=${currentDocumentKind || 'none'}`,
      `docId=${currentDocumentId || 'none'}`,
      `dirty=${localDirty ? 'true' : 'false'}`,
      `flowModeActive=${flowModeState.active ? 'true' : 'false'}`,
      `collabScopeLocal=${collabScopeLocal ? 'true' : 'false'}`,
    ];
    diagnosticsText.value = lines.join('\n');
  }
  openSimpleModal(diagnosticsModal);
}

function openExportPreviewModal() {
  if (exportPreviewMessage) {
    exportPreviewMessage.textContent = 'DOCX baseline export. Confirm to continue.';
  }
  openSimpleModal(exportPreviewModal);
}

async function confirmExportPreviewAndRun() {
  closeSimpleModal(exportPreviewModal);
  updatePerfHintText('export');
  await dispatchUiCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN, {
    confirmed: true,
  });
  updatePerfHintText('normal');
  updateWarningStateText('none');
}

function normalizeSelectedScenesTxtExportScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null;
  const projectId = typeof scope.projectId === 'string' ? scope.projectId.trim() : '';
  const sceneCandidates = Array.isArray(scope.sceneCandidates)
    ? scope.sceneCandidates
        .filter((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate))
        .map((candidate) => ({
          sceneId: typeof candidate.sceneId === 'string' ? candidate.sceneId.trim() : '',
          nodeId: typeof candidate.nodeId === 'string' ? candidate.nodeId.trim() : '',
          label: typeof candidate.label === 'string' && candidate.label.trim()
            ? candidate.label.trim()
            : (typeof candidate.title === 'string' ? candidate.title.trim() : ''),
          title: typeof candidate.title === 'string' ? candidate.title.trim() : '',
        }))
        .filter((candidate) => candidate.sceneId && candidate.label)
    : [];
  const defaultSceneIds = Array.isArray(scope.defaultSceneIds)
    ? scope.defaultSceneIds
        .filter((sceneId) => typeof sceneId === 'string' && sceneId.trim())
        .map((sceneId) => sceneId.trim())
    : [];
  if (sceneCandidates.length === 0) return null;
  return {
    projectId,
    defaultSceneIds,
    sceneCandidates,
  };
}

function applyNavigatorSelectionToExportScope(scope) {
  const descriptor = getNavigatorSelectionDescriptor();
  if (
    !scope
    || !descriptor.projectId
    || descriptor.projectId !== scope.projectId
    || descriptor.selectedIds.length === 0
  ) {
    return scope;
  }
  const selectedNodeIds = new Set(descriptor.selectedIds);
  const selectedSceneIds = scope.sceneCandidates
    .filter((candidate) => candidate.nodeId && selectedNodeIds.has(candidate.nodeId))
    .map((candidate) => candidate.sceneId);
  return selectedSceneIds.length > 0
    ? { ...scope, defaultSceneIds: selectedSceneIds }
    : scope;
}

function getSelectedScenesTxtExportCheckedSceneIds() {
  if (!(selectedScenesTxtExportList instanceof HTMLElement)) return [];
  return Array.from(selectedScenesTxtExportList.querySelectorAll('[data-selected-scenes-txt-export-checkbox]:checked'))
    .map((input) => (input instanceof HTMLInputElement ? input.value.trim() : ''))
    .filter(Boolean);
}

function updateSelectedScenesTxtExportModalState() {
  const selectedCount = getSelectedScenesTxtExportCheckedSceneIds().length;
  if (selectedScenesTxtExportSummary) {
    selectedScenesTxtExportSummary.textContent = selectedCount > 0
      ? `Выбрано сцен: ${selectedCount}`
      : 'Выберите сцены для экспорта в один TXT файл.';
  }
  selectedScenesTxtExportConfirmButtons.forEach((button) => {
    button.disabled = selectedCount === 0;
    button.textContent = selectedCount > 0 ? `Экспорт TXT (${selectedCount})` : 'Экспорт TXT';
  });
}

function closeSelectedScenesTxtExportModal() {
  closeSimpleModal(selectedScenesTxtExportModal);
}

function renderSelectedScenesTxtExportCandidateList(scope) {
  if (!(selectedScenesTxtExportList instanceof HTMLElement)) return;
  selectedScenesTxtExportList.innerHTML = '';
  const defaultSceneIdSet = new Set(Array.isArray(scope?.defaultSceneIds) ? scope.defaultSceneIds : []);

  scope.sceneCandidates.forEach((candidate, index) => {
    const row = document.createElement('label');
    row.className = 'modal__checkbox-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'modal__checkbox';
    checkbox.value = candidate.sceneId;
    checkbox.dataset.selectedScenesTxtExportCheckbox = 'true';
    checkbox.checked = defaultSceneIdSet.has(candidate.sceneId);
    checkbox.addEventListener('change', () => {
      updateSelectedScenesTxtExportModalState();
    });

    const copy = document.createElement('span');
    copy.className = 'modal__checkbox-copy';
    copy.textContent = candidate.label || candidate.title || `Scene ${index + 1}`;

    row.appendChild(checkbox);
    row.appendChild(copy);
    selectedScenesTxtExportList.appendChild(row);
  });
}

function openSelectedScenesTxtExportModal(scope) {
  const normalizedScope = normalizeSelectedScenesTxtExportScope(scope);
  if (!normalizedScope) {
    updateStatusText('Selected scenes TXT export unavailable');
    return;
  }
  renderSelectedScenesTxtExportCandidateList(normalizedScope);
  updateSelectedScenesTxtExportModalState();
  openSimpleModal(selectedScenesTxtExportModal);
}

async function confirmSelectedScenesTxtExportAndRun() {
  const selectedSceneIds = getSelectedScenesTxtExportCheckedSceneIds();
  if (selectedSceneIds.length === 0) {
    updateSelectedScenesTxtExportModalState();
    return;
  }

  closeSelectedScenesTxtExportModal();
  updateStatusText('Exporting selected scenes TXT');
  const result = await dispatchUiCommand(EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT, {
    confirmed: true,
    requestId: `selected-scenes-txt-export-${Date.now()}`,
    selectedSceneIds,
  });
  if (!result || result.ok !== true) {
    updateStatusText('Selected scenes TXT export failed');
    return;
  }

  const value = result.value && typeof result.value === 'object' && !Array.isArray(result.value)
    ? result.value
    : {};
  if (value.canceled === true) {
    updateStatusText('Selected scenes TXT export cancelled');
    return;
  }
  if (value.exported === true) {
    const sceneCount = Number.isInteger(value.sceneCount) ? value.sceneCount : selectedSceneIds.length;
    updateStatusText(`Selected scenes TXT exported: ${sceneCount}`);
    return;
  }
  updateStatusText('Selected scenes TXT export unavailable');
}

async function openSelectedScenesTxtExportFlow() {
  updateStatusText('Preparing selected scenes TXT export');
  let result = null;
  try {
    result = await invokeWorkspaceQueryBridge(SELECTED_SCENES_TXT_EXPORT_SCOPE_QUERY_ID, {});
  } catch {
    updateStatusText('Selected scenes TXT export unavailable');
    return;
  }
  if (!result || result.ok !== true) {
    updateStatusText('Selected scenes TXT export unavailable');
    return;
  }

  const scope = applyNavigatorSelectionToExportScope(
    normalizeSelectedScenesTxtExportScope(result.scope),
  );
  if (!scope) {
    updateStatusText('No exportable scenes available');
    return;
  }

  openSelectedScenesTxtExportModal(scope);
  updateStatusText('Selected scenes TXT export ready');
}

function getDocxImportPreviewPlanFromValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const direct = value.docxImportPreviewPlan;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct;
  const localPreview = value.localFilePreview;
  if (!localPreview || typeof localPreview !== 'object' || Array.isArray(localPreview)) return null;
  const nested = localPreview.docxImportPreviewPlan;
  return nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : null;
}

function normalizeDocxImportCreatedSceneIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim());
}

function sanitizeDocxImportSceneLabelPart(value) {
  const safe = String(value || '')
    .trim()
    .replace(/[\\/<>:"|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');

  return safe.slice(0, 80) || 'Untitled';
}

function getDocxImportSceneLocatorsFromPlan(plan, createdSceneIds) {
  const createdIds = normalizeDocxImportCreatedSceneIds(createdSceneIds);
  if (createdIds.length === 0) return [];
  const createdSet = new Set(createdIds);
  const entries = Array.isArray(plan?.candidateCreatePlan?.entries)
    ? plan.candidateCreatePlan.entries
    : [];

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const sceneId = typeof entry.sceneId === 'string' ? entry.sceneId.trim() : '';
      const contentTextHash = typeof entry.contentTextHash === 'string'
        ? entry.contentTextHash.trim()
        : '';
      if (!sceneId || !createdSet.has(sceneId) || !/^[a-f0-9]{8}$/u.test(contentTextHash)) {
        return null;
      }
      const title = typeof entry.title === 'string' && entry.title.trim()
        ? entry.title.trim()
        : 'Imported DOCX preview';
      return {
        sceneId,
        expectedLabel: `${sanitizeDocxImportSceneLabelPart(title)} ${contentTextHash}`,
      };
    })
    .filter(Boolean);
}

function findDocxImportSceneNode(root, locators) {
  if (!root || !Array.isArray(locators) || locators.length === 0) return null;
  const sceneIds = new Set(locators.map((item) => item.sceneId).filter(Boolean));
  const expectedLabels = new Set(locators.map((item) => item.expectedLabel).filter(Boolean));
  const matches = [];
  const seenNodeIds = new Set();

  const visit = (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const kind = getEffectiveDocumentKind(node);
    if (kind === 'scene') {
      const sceneId = typeof node.sceneId === 'string' ? node.sceneId.trim() : '';
      const label = typeof node.label === 'string'
        ? node.label.trim()
        : (typeof node.name === 'string' ? node.name.trim() : '');
      const nodeId = typeof node.nodeId === 'string'
        ? node.nodeId.trim()
        : (typeof node.id === 'string' ? node.id.trim() : '');
      if (
        ((sceneId && sceneIds.has(sceneId)) || (label && expectedLabels.has(label)))
        && nodeId
        && !seenNodeIds.has(nodeId)
      ) {
        seenNodeIds.add(nodeId);
        matches.push(node);
      }
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };

  visit(root);
  return matches.length === 1 ? matches[0] : null;
}

async function openImportedDocxSceneAfterAccept(plan, createdSceneIds) {
  const locators = getDocxImportSceneLocatorsFromPlan(plan, createdSceneIds);
  if (locators.length === 0) {
    return { opened: false, reason: 'no-created-scene-locator' };
  }
  const node = findDocxImportSceneNode(treeRoot, locators);
  if (!node) {
    return { opened: false, reason: 'imported-scene-not-found' };
  }
  const opened = await openDocumentNode(node);
  if (opened) {
    renderTree();
    return { opened: true, reason: 'opened-imported-scene' };
  }
  return { opened: false, reason: 'imported-scene-open-failed' };
}

function getTxtImportPreviewPlanFromValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const direct = value.txtImportPreviewPlan;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct;
  const localPreview = value.localFilePreview;
  if (!localPreview || typeof localPreview !== 'object' || Array.isArray(localPreview)) return null;
  const nested = localPreview.txtImportPreviewPlan;
  return nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : null;
}

function normalizeTxtImportCreatedSceneIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim());
}

function sanitizeTxtImportSceneLabelPart(value) {
  const safe = String(value || '')
    .trim()
    .replace(/[\\/<>:"|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');

  return safe.slice(0, 80) || 'Imported TXT';
}

function getTxtImportSceneLocatorsFromPlan(plan, createdSceneIds) {
  const createdIds = normalizeTxtImportCreatedSceneIds(createdSceneIds);
  if (createdIds.length === 0) return [];
  const createdSet = new Set(createdIds);
  const entries = Array.isArray(plan?.candidateCreatePlan?.entries)
    ? plan.candidateCreatePlan.entries
    : [];

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const sceneId = typeof entry.sceneId === 'string' ? entry.sceneId.trim() : '';
      const contentTextHash = typeof entry.contentTextHash === 'string'
        ? entry.contentTextHash.trim()
        : '';
      if (!sceneId || !createdSet.has(sceneId) || !/^[a-f0-9]{10}$/u.test(contentTextHash)) {
        return null;
      }
      const title = typeof entry.title === 'string' && entry.title.trim()
        ? entry.title.trim()
        : 'Imported TXT';
      return {
        sceneId,
        expectedLabel: `${sanitizeTxtImportSceneLabelPart(title)} ${contentTextHash}`,
      };
    })
    .filter(Boolean);
}

function findTxtImportSceneNode(root, locators) {
  if (!root || !Array.isArray(locators) || locators.length === 0) return null;
  const sceneIds = new Set(locators.map((item) => item.sceneId).filter(Boolean));
  const expectedLabels = new Set(locators.map((item) => item.expectedLabel).filter(Boolean));
  const matches = [];
  const seenNodeIds = new Set();

  const visit = (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const kind = getEffectiveDocumentKind(node);
    if (kind === 'scene') {
      const sceneId = typeof node.sceneId === 'string' ? node.sceneId.trim() : '';
      const label = typeof node.label === 'string'
        ? node.label.trim()
        : (typeof node.name === 'string' ? node.name.trim() : '');
      const nodeId = typeof node.nodeId === 'string'
        ? node.nodeId.trim()
        : (typeof node.id === 'string' ? node.id.trim() : '');
      if (
        ((sceneId && sceneIds.has(sceneId)) || (label && expectedLabels.has(label)))
        && nodeId
        && !seenNodeIds.has(nodeId)
      ) {
        seenNodeIds.add(nodeId);
        matches.push(node);
      }
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };

  visit(root);
  return matches.length === 1 ? matches[0] : null;
}

async function openImportedTxtSceneAfterAccept(plan, createdSceneIds) {
  const locators = getTxtImportSceneLocatorsFromPlan(plan, createdSceneIds);
  if (locators.length === 0) {
    return { opened: false, reason: 'no-created-txt-scene-locator' };
  }
  const node = findTxtImportSceneNode(treeRoot, locators);
  if (!node) {
    return { opened: false, reason: 'imported-txt-scene-not-found' };
  }
  const opened = await openDocumentNode(node);
  if (opened) {
    renderTree();
    return { opened: true, reason: 'opened-imported-txt-scene' };
  }
  return { opened: false, reason: 'imported-txt-scene-open-failed' };
}

function summarizeDocxImportPreview(value) {
  const plan = getDocxImportPreviewPlanFromValue(value);
  const entryCount = Number.isInteger(plan?.candidateCreatePlan?.entryCount)
    ? plan.candidateCreatePlan.entryCount
    : (Array.isArray(plan?.candidateCreatePlan?.entries) ? plan.candidateCreatePlan.entries.length : 0);
  const firstEntry = Array.isArray(plan?.candidateCreatePlan?.entries)
    ? plan.candidateCreatePlan.entries[0]
    : null;
  const textLength = typeof firstEntry?.content === 'string' ? firstEntry.content.length : 0;
  if (!plan || plan.ok !== true) {
    return 'DOCX preview is not importable.';
  }
  return `Ready to create ${entryCount || 1} scene from DOCX preview. Text chars: ${textLength}.`;
}

function summarizeDocxImportLoss(value) {
  const lossReport = value && typeof value === 'object' && !Array.isArray(value)
    ? value.lossReport
    : null;
  const itemCount = Number.isInteger(lossReport?.itemCount)
    ? lossReport.itemCount
    : (Number.isInteger(lossReport?.count) ? lossReport.count : 0);
  const mode = typeof lossReport?.mode === 'string' && lossReport.mode
    ? lossReport.mode
    : 'plain-text-only';
  return `Loss report: ${mode}; items: ${itemCount}.`;
}

function closeDocxImportPreviewModal() {
  pendingDocxImportPreviewValue = null;
  pendingDocxImportPreviewPlan = null;
  closeSimpleModal(docxImportPreviewModal);
}

function openDocxImportPreviewModal(value) {
  const plan = getDocxImportPreviewPlanFromValue(value);
  pendingDocxImportPreviewValue = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  pendingDocxImportPreviewPlan = plan;
  if (docxImportPreviewMessage) {
    docxImportPreviewMessage.textContent = summarizeDocxImportPreview(value);
  }
  if (docxImportPreviewLoss) {
    docxImportPreviewLoss.textContent = summarizeDocxImportLoss(value);
  }
  docxImportPreviewConfirmButtons.forEach((button) => {
    button.disabled = !(plan && plan.ok === true);
  });
  openSimpleModal(docxImportPreviewModal);
}

async function openDocxImportPreviewFlow() {
  updateStatusText('Preparing DOCX import preview');
  const result = await dispatchUiCommand(COMMAND_IDS.PROJECT_IMPORT_DOCX_V1);
  if (!result || result.ok !== true) return;
  openDocxImportPreviewModal(result.value);
  updateStatusText('DOCX import preview ready');
}

async function confirmDocxImportPreviewAndRun() {
  const plan = pendingDocxImportPreviewPlan;
  const previewValue = pendingDocxImportPreviewValue;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    updateStatusText('DOCX import preview unavailable');
    closeDocxImportPreviewModal();
    return;
  }
  closeSimpleModal(docxImportPreviewModal);
  updateStatusText('Importing DOCX');
  const result = await dispatchUiCommand(COMMAND_IDS.PROJECT_IMPORT_DOCX_V1, {
    accept: true,
    localFilePreview: previewValue?.localFilePreview || null,
    docxContentPreviewReport: previewValue?.docxContentPreviewReport
      || previewValue?.localFilePreview?.docxContentPreviewReport
      || null,
    docxImportPreviewPlan: plan,
  });
  pendingDocxImportPreviewValue = null;
  pendingDocxImportPreviewPlan = null;
  if (!result || result.ok !== true) return;
  const resultValue = result.value && typeof result.value === 'object' && !Array.isArray(result.value)
    ? result.value
    : {};
  const createdSceneIds = Array.isArray(resultValue.visibleCreatedSceneIds)
    ? resultValue.visibleCreatedSceneIds
    : (Array.isArray(resultValue.createdSceneIds) ? resultValue.createdSceneIds : []);
  await loadTree();
  const openResult = await openImportedDocxSceneAfterAccept(plan, createdSceneIds);
  const openSuffix = openResult.opened
    ? '; opened imported scene'
    : (createdSceneIds.length > 0 ? `; ${openResult.reason}` : '');
  updateStatusText(`Imported DOCX scenes: ${createdSceneIds.length}${openSuffix}`);
}

function summarizeTxtImportPreview(value) {
  const plan = getTxtImportPreviewPlanFromValue(value);
  const entry = Array.isArray(plan?.candidateCreatePlan?.entries)
    ? plan.candidateCreatePlan.entries[0]
    : null;
  const source = value?.sourceSummary && typeof value.sourceSummary === 'object'
    ? value.sourceSummary
    : (value?.localFilePreview?.sourceSummary && typeof value.localFilePreview.sourceSummary === 'object'
      ? value.localFilePreview.sourceSummary
      : null);
  if (!plan || plan.ok !== true || !entry || typeof entry.content !== 'string') {
    return 'TXT preview is not importable.';
  }
  const lineCount = Number.isInteger(source?.lineCount) ? source.lineCount : entry.content.split('\n').length;
  const sourceName = typeof source?.sourceName === 'string' && source.sourceName.trim()
    ? source.sourceName.trim()
    : 'import.txt';
  return `Ready to create 1 scene from ${sourceName}. Text chars: ${entry.content.length}. Lines: ${lineCount}.`;
}

async function openTxtImportPreviewFlow() {
  updateStatusText('Preparing TXT import preview');
  const result = await dispatchUiCommand(COMMAND_IDS.PROJECT_IMPORT_TXT_V1);
  if (!result || result.ok !== true) return;
  const previewValue = result.value && typeof result.value === 'object' && !Array.isArray(result.value)
    ? result.value
    : {};
  const localFilePreview = previewValue.localFilePreview && typeof previewValue.localFilePreview === 'object'
    ? previewValue.localFilePreview
    : null;
  if (localFilePreview && localFilePreview.status === 'cancelled') {
    updateStatusText('TXT import cancelled');
    return;
  }
  const plan = getTxtImportPreviewPlanFromValue(previewValue);
  if (!plan || plan.ok !== true) {
    updateStatusText('TXT import preview unavailable');
    return;
  }

  const previewSummary = summarizeTxtImportPreview(previewValue);
  const confirmed = typeof window.confirm === 'function'
    ? window.confirm(`${previewSummary}\n\nCreate imported TXT scene?`)
    : true;
  if (!confirmed) {
    updateStatusText('TXT import preview ready');
    return;
  }

  updateStatusText('Importing TXT');
  const acceptResult = await dispatchUiCommand(COMMAND_IDS.PROJECT_IMPORT_TXT_V1, {
    accept: true,
    localFilePreview,
    sourceSummary: previewValue.sourceSummary
      || localFilePreview?.sourceSummary
      || null,
    txtImportPreviewPlan: plan,
  });
  if (!acceptResult || acceptResult.ok !== true) return;

  const resultValue = acceptResult.value && typeof acceptResult.value === 'object' && !Array.isArray(acceptResult.value)
    ? acceptResult.value
    : {};
  const createdSceneIds = Array.isArray(resultValue.visibleCreatedSceneIds)
    ? resultValue.visibleCreatedSceneIds
    : (Array.isArray(resultValue.createdSceneIds) ? resultValue.createdSceneIds : []);
  await loadTree();
  const openResult = await openImportedTxtSceneAfterAccept(plan, createdSceneIds);
  const openSuffix = openResult.opened
    ? '; opened imported TXT scene'
    : (createdSceneIds.length > 0 ? `; ${openResult.reason}` : '');
  updateStatusText(`Imported TXT scenes: ${createdSceneIds.length}${openSuffix}`);
}

function applyCollabGate() {
  applyRightTab(currentRightTab);
  updateInspectorSnapshot();
}

async function initializeCollabScopeLocal() {
  try {
    if (window.electronAPI && typeof window.electronAPI.invokeWorkspaceQueryBridge === 'function') {
      collabScopeLocal = (await invokeWorkspaceQueryBridge(COLLAB_SCOPE_LOCAL_QUERY_ID)) === true;
    } else {
      collabScopeLocal = localStorage.getItem('COLLAB_SCOPE_LOCAL') === 'true';
    }
  } catch {
    collabScopeLocal = false;
  }
  applyCollabGate();
}

function installNetworkGuard() {
  const blockedError = () => new Error('E_COLLAB_TRANSPORT_FORBIDDEN_IN_MVP');
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async (...args) => {
      const url = String(args[0] || '');
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('ws://') || url.startsWith('wss://')) {
        updateWarningStateText('network blocked before X4');
        throw blockedError();
      }
      return originalFetch(...args);
    };
  }
}

function updateWordCount(textOverride = null) {
  if (!editor || !wordCountElement) return;
  const text = typeof textOverride === 'string' ? textOverride : getPlainText();
  const trimmed = text.trim();
  const count = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  wordCountElement.textContent = `${count} words`;
  if (inspectorMetaWordCountValue && !flowModeState.active) {
    inspectorMetaWordCountValue.textContent = String(count);
    if (inspectorDocumentWordCountValue) inspectorDocumentWordCountValue.textContent = String(count);
  }
  if (count > 20000) {
    updatePerfHintText('large document');
  }
}

function scheduleWordCountRefresh(text = null) {
  deferredWordCountText = typeof text === 'string' ? text : null;
  if (deferredWordCountFrameId) {
    return;
  }
  deferredWordCountFrameId = window.requestAnimationFrame(() => {
    deferredWordCountFrameId = null;
    const nextText = deferredWordCountText;
    deferredWordCountText = null;
    updateWordCount(nextText);
  });
}

function updateZoomValue() {
  if (!zoomValueElement) return;
  const percent = Math.round(editorZoom * 100);
  zoomValueElement.textContent = `${percent}%`;
}

function setEditorZoom(value, persist = true) {
  const quantized = Math.round(value / EDITOR_ZOOM_STEP) * EDITOR_ZOOM_STEP;
  const nextZoom = Math.max(EDITOR_ZOOM_MIN, Math.min(EDITOR_ZOOM_MAX, quantized));
  editorZoom = nextZoom;
  const metrics = getPageMetrics({
    profile: activeBookProfileState,
    zoom: editorZoom,
  });
  if (metrics) {
    applyPageGeometryCssVars(metrics);
  }
  applyPreviewChromeCssVars(activePreviewChromeState, document.documentElement, editorZoom, PX_PER_MM_AT_ZOOM_1);
  scheduleLayoutPreviewRefresh();
  scheduleCentralSheetStripProofRefresh();
  updateZoomValue();
  if (!persist) {
    return;
  }

  try {
    localStorage.setItem(EDITOR_ZOOM_STORAGE_KEY, String(editorZoom));
  } catch {}
}

function changeEditorZoom(delta) {
  setEditorZoom(editorZoom + delta);
}

function loadSavedEditorZoom() {
  try {
    const saved = Number(localStorage.getItem(EDITOR_ZOOM_STORAGE_KEY));
    if (Number.isFinite(saved)) {
      setEditorZoom(saved, false);
      return;
    }
  } catch {}

  setEditorZoom(EDITOR_ZOOM_DEFAULT, false);
}

function setCurrentFontSize(px) {
  if (!Number.isFinite(px)) return;
  currentFontSizePx = px;
  if (sizeSelect) {
    ensureSelectHasOption(sizeSelect, String(px), String(px), '__custom_size__');
    sizeSelect.value = String(px);
  }
  syncLiteralToolbarDisplays();
}

function scheduleAutoSave(delay = AUTO_SAVE_DELAY) {
  if (!window.electronAPI || typeof window.electronAPI.invokeSaveLifecycleSignalBridge !== 'function') {
    return;
  }

  if (autoSaveTimerId) {
    clearTimeout(autoSaveTimerId);
  }

  autoSaveTimerId = window.setTimeout(() => {
    invokeSaveLifecycleSignalBridge('signal.autoSave.request')
      .catch(() => {})
      .finally(() => {
        autoSaveTimerId = null;
      });
  }, delay);
}

function markAsModified() {
  if (flowModeState.active) {
    flowModeState = {
      ...flowModeState,
      dirty: true,
    };
    updateStatusText(buildFlowModeCoreStatus(flowModeState.scenes.length, { dirty: true }));
  } else {
    updateStatusText('Изменено');
  }

  localEditGeneration += 1;
  localDirty = true;
  // R2.4 P0: every edit's generation is signaled so the main-side autosave
  // acknowledgement fence always compares against the true latest edit.
  void invokeSaveLifecycleSignalBridge('signal.localDirty.set', { state: true, generation: localEditGeneration });
  updateSaveStateText('unsaved');
  updatePerfHintText('typing');
  updateInspectorSnapshot();
  scheduleAutoSave();
}

function normalizeFontWeightPreset(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (FONT_WEIGHT_PRESETS[raw]) {
    return raw;
  }
  return LEGACY_FONT_WEIGHT_PRESET_MAP[raw] || 'light';
}

function ensureSelectHasOption(select, value, label = value, beforeValue = '') {
  if (!(select instanceof HTMLSelectElement)) return;
  const stringValue = String(value);
  const existing = Array.from(select.options).find((option) => option.value === stringValue);
  if (existing) {
    existing.textContent = label;
    return;
  }
  const option = new Option(label, stringValue);
  const beforeOption = beforeValue
    ? Array.from(select.options).find((candidate) => candidate.value === beforeValue) || null
    : null;
  select.add(option, beforeOption);
}

function applyFontWeight(weightPreset, persist = true) {
  if (!editor) return;
  const presetId = normalizeFontWeightPreset(weightPreset);
  const preset = FONT_WEIGHT_PRESETS[presetId] || FONT_WEIGHT_PRESETS.light;
  editor.style.fontWeight = preset.weight;
  editor.style.fontStretch = preset.stretch;
  editor.style.letterSpacing = preset.spacing;
  if (weightSelect) {
    weightSelect.value = presetId;
  }
  if (persist) {
    localStorage.setItem('editorFontWeight', presetId);
  }
  syncLiteralToolbarDisplays();
  renderStyledView(getPlainText());
  scheduleCentralSheetStripProofRefresh();
}

function applyLineHeight(value, persist = true) {
  if (!editor) return;
  editor.style.lineHeight = String(value);
  if (lineHeightSelect) {
    ensureSelectHasOption(lineHeightSelect, String(value), String(value), '__custom_line_height__');
    lineHeightSelect.value = String(value);
  }
  if (persist) {
    localStorage.setItem('editorLineHeight', String(value));
  }
  syncLiteralToolbarDisplays();
  renderStyledView(getPlainText());
  scheduleCentralSheetStripProofRefresh();
}

function applyWordWrap(enabled, persist = true) {
  if (!editor) return;
  wordWrapEnabled = enabled;
  editor.style.whiteSpace = enabled ? 'pre-wrap' : 'pre';
  editor.style.overflowX = enabled ? 'hidden' : 'auto';
  if (wrapToggleButton) {
    wrapToggleButton.classList.toggle('is-active', enabled);
    wrapToggleButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }
  if (persist) {
    localStorage.setItem('editorWordWrap', enabled ? 'on' : 'off');
  }
  updateInspectorSnapshot();
}

function applyViewMode(mode, persist = true) {
  const isFocus = mode === 'focus';
  document.body.classList.toggle('focus-mode', isFocus);
  if (styleSelect) {
    styleSelect.value = mode;
  }
  if (persist) {
    localStorage.setItem('editorViewMode', mode);
  }
  syncInspectorStateSurface();
}

function applyTextStyle(action) {
  if (!editor || !action) {
    return { performed: false, action: 'applyTextStyle', reason: 'EDITOR_UNAVAILABLE', optionId: action || '' };
  }
  if (isTiptapMode) {
    const tiptapResult = action.startsWith('paragraph-')
      ? applyTiptapParagraphStyle(action)
      : (action.startsWith('character-')
        ? applyTiptapCharacterStyle(action)
        : { performed: false, action: 'applyTextStyle', reason: 'UNSUPPORTED_STYLE_OPTION', optionId: action });
    if (tiptapResult && tiptapResult.performed !== false) {
      markAsModified();
      updateWordCount();
    }
    syncToolbarFormattingState();
    return tiptapResult;
  }
  const text = getPlainText();
  const { start: rawStart, end: rawEnd } = getSelectionOffsets();
  const boundedStart = Math.max(0, Math.min(rawStart, rawEnd));
  const boundedEnd = Math.max(0, Math.max(rawStart, rawEnd));
  const start = Math.min(boundedStart, text.length);
  const end = Math.min(boundedEnd, text.length);
  let result = null;
  let actionId = 'applyTextStyle';

  if (action.startsWith('character-') && start === end) {
    updateStatusText('Выделите текст');
    return { performed: false, action: 'applyCharacterStyle', reason: 'NO_SELECTION', optionId: action };
  }

  if (action.startsWith('paragraph-')) {
    actionId = 'applyParagraphStyle';
    result = applyParagraphStyle(text, start, end, action);
  } else if (action.startsWith('character-')) {
    actionId = 'applyCharacterStyle';
    result = applyCharacterStyle(text, start, end, action);
  }

  if (!result) {
    return { performed: false, action: actionId, reason: 'NO_OP', optionId: action };
  }
  setPlainText(result.newText);
  setSelectionRange(result.newStart, result.newEnd);
  markAsModified();
  updateWordCount();
  return { performed: true, action: actionId, reason: null, optionId: action };
}

function updateAlignmentButtons(activeAction) {
  if (!alignButtons.length) return;
  alignButtons.forEach((button) => {
    const isActive = button.dataset.paragraphAlignment === activeAction;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function getAlignmentActionForLine(line) {
  if (line.startsWith('::center:: ')) return 'align-center';
  if (line.startsWith('::right:: ')) return 'align-right';
  if (line.startsWith('::justify:: ')) return 'align-justify';
  return 'align-left';
}

function syncAlignmentButtonsToSelection() {
  if (isTiptapMode) return;
  if (!editor) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    return;
  }
  const text = getPlainText();
  const { start: rawStart } = getSelectionOffsets();
  const start = Math.max(0, Math.min(rawStart, text.length));
  const lineMeta = getLineMeta(text);
  const lineIndex = findLineIndexForPosition(lineMeta, start);
  if (lineIndex === -1) return;
  const action = getAlignmentActionForLine(lineMeta[lineIndex].content);
  updateAlignmentButtons(action);
}

function stripAlignmentMarker(line) {
  for (const marker of ALIGNMENT_MARKERS) {
    if (line.startsWith(marker)) {
      return line.slice(marker.length);
    }
  }
  return line;
}

function applyAlignmentStyle(action) {
  if (!editor || !action) return;
  const prefix = ALIGNMENT_PREFIX_BY_ACTION[action];
  if (prefix === undefined) return;

  const text = getPlainText();
  const { start: rawStart, end: rawEnd } = getSelectionOffsets();
  const boundedStart = Math.max(0, Math.min(rawStart, rawEnd));
  const boundedEnd = Math.max(0, Math.max(rawStart, rawEnd));
  const start = Math.min(boundedStart, text.length);
  const end = Math.min(boundedEnd, text.length);
  const result = applyAlignmentMarkers(text, start, end, prefix);

  if (!result) return;
  setPlainText(result.newText);
  setSelectionRange(result.newStart, result.newEnd);
  markAsModified();
  updateWordCount();
}

function applyAlignmentMarkers(text, selectionStart, selectionEnd, prefix) {
  const lineMeta = getLineMeta(text);
  if (!lineMeta.length) return null;
  const { startIdx, endIdx } = getSelectionLineRange(lineMeta, selectionStart, selectionEnd);
  if (startIdx === -1 || endIdx === -1) return null;

  const edits = [];
  const adjustments = [];

  const queueEdit = (start, end, value) => {
    if (start === end && !value) return;
    edits.push({ start, end, value });
    adjustments.push({ pos: start, delta: value.length - (end - start) });
  };

  const queueLineReplacement = (idx, content) => {
    const line = lineMeta[idx];
    if (!line || line.content === content) return;
    queueEdit(line.start, line.end, content);
  };

  for (let idx = startIdx; idx <= endIdx; idx++) {
    const baseLine = stripAlignmentMarker(lineMeta[idx].content);
    const nextLine = prefix ? `${prefix}${baseLine}` : baseLine;
    queueLineReplacement(idx, nextLine);
  }

  if (!edits.length) {
    return null;
  }

  return finalizeEdits(text, edits, adjustments, selectionStart, selectionEnd);
}

function applyParagraphStyle(text, selectionStart, selectionEnd, style) {
  const lineMeta = getLineMeta(text);
  if (!lineMeta.length) return null;
  const { startIdx, endIdx } = getSelectionLineRange(lineMeta, selectionStart, selectionEnd);
  if (startIdx === -1 || endIdx === -1) return null;

  const edits = [];
  const adjustments = [];

  const queueEdit = (start, end, value) => {
    if (start === end && !value) return;
    edits.push({ start, end, value });
    adjustments.push({ pos: start, delta: value.length - (end - start) });
  };

  const queueLineReplacement = (idx, content) => {
    const line = lineMeta[idx];
    if (!line || line.content === content) return;
    queueEdit(line.start, line.end, content);
  };

  const applyParagraphPrefix = (prefix) => {
    for (let idx = startIdx; idx <= endIdx; idx++) {
      const baseLine = stripParagraphMarkers(lineMeta[idx].content);
      queueLineReplacement(idx, `${prefix}${baseLine}`);
    }
  };

  switch (style) {
    case 'paragraph-none':
      for (let idx = startIdx; idx <= endIdx; idx++) {
        const cleaned = stripParagraphMarkers(lineMeta[idx].content);
        queueLineReplacement(idx, cleaned);
      }
      removeCodeBlockFences(lineMeta, startIdx, endIdx, queueEdit);
      break;

    case 'paragraph-codeblock': {
      const removed = removeCodeBlockFences(lineMeta, startIdx, endIdx, queueEdit);
      if (!removed) {
        const prefix = '```\n';
        const suffix = '\n```\n';
        queueEdit(lineMeta[startIdx].start, lineMeta[startIdx].start, prefix);
        queueEdit(lineMeta[endIdx].endWithNewline, lineMeta[endIdx].endWithNewline, suffix);
      }
      break;
    }

    default: {
      const paragraphPrefixes = {
        'paragraph-title': '# ',
        'paragraph-heading1': '## ',
        'paragraph-heading2': '### ',
        'paragraph-blockquote': '> ',
        'paragraph-caption': '::caption:: ',
        'paragraph-centered': '::center:: ',
        'paragraph-verse': '::verse:: ',
        'paragraph-attribution': '— ',
      };
      if (paragraphPrefixes[style]) {
        applyParagraphPrefix(paragraphPrefixes[style]);
      }
      break;
    }
  }

  if (!edits.length) {
    return null;
  }

  return finalizeEdits(text, edits, adjustments, selectionStart, selectionEnd);
}

function applyCharacterStyle(text, selectionStart, selectionEnd, style) {
  if (selectionStart === selectionEnd) {
    updateStatusText('Выделите текст');
    return null;
  }

  const selected = text.slice(selectionStart, selectionEnd);
  let replacement = selected;

  if (style === 'character-emphasis') {
    if (selected.startsWith('*') && selected.endsWith('*') && selected.length >= 2) {
      replacement = selected.slice(1, -1);
    } else {
      replacement = `*${selected}*`;
    }
  } else if (style === 'character-code-span') {
    if (selected.startsWith('`') && selected.endsWith('`') && selected.length >= 2) {
      replacement = selected.slice(1, -1);
    } else {
      replacement = `\`${selected}\``;
    }
  }

  const edits = [{ start: selectionStart, end: selectionEnd, value: replacement }];
  const adjustments = [{ pos: selectionStart, delta: replacement.length - (selectionEnd - selectionStart) }];
  const newText = applyEditsToText(text, edits);
  const sortedAdjustments = adjustments.slice().sort((a, b) => a.pos - b.pos);
  const newStart = mapPosition(selectionStart, sortedAdjustments, newText.length);
  const newEnd = mapPosition(selectionEnd, sortedAdjustments, newText.length);
  return { newText, newStart, newEnd };
}

function getLineMeta(text) {
  const rawLines = text.split('\n');
  const meta = [];
  let cursor = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const content = rawLines[i];
    const start = cursor;
    const end = start + content.length;
    const hasNewline = i < rawLines.length - 1;
    const endWithNewline = hasNewline ? end + 1 : end;
    meta.push({ content, start, end, endWithNewline });
    cursor = endWithNewline;
  }
  if (!meta.length) {
    meta.push({ content: '', start: 0, end: 0, endWithNewline: 0 });
  }
  return meta;
}

function getSelectionLineRange(meta, selectionStart, selectionEnd) {
  const startIdx = findLineIndexForPosition(meta, selectionStart);
  const effectiveEnd = selectionEnd > selectionStart ? selectionEnd - 1 : selectionStart;
  const endIdx = findLineIndexForPosition(meta, effectiveEnd);
  return { startIdx, endIdx };
}

function findLineIndexForPosition(meta, position) {
  if (!meta.length) return -1;
  for (let i = 0; i < meta.length; i++) {
    if (position <= meta[i].endWithNewline) {
      return i;
    }
  }
  return meta.length - 1;
}

function stripParagraphMarkers(line) {
  let cleaned = line;
  const markers = [
    '::caption:: ',
    '::center:: ',
    '::right:: ',
    '::justify:: ',
    '::verse:: ',
    '— ',
    '> ',
    '### ',
    '## ',
    '# ',
  ];
  let loop = true;
  while (loop) {
    loop = false;
    for (const marker of markers) {
      if (cleaned.startsWith(marker)) {
        cleaned = cleaned.slice(marker.length);
        loop = true;
        break;
      }
    }
  }
  return cleaned;
}

function removeCodeBlockFences(meta, startIdx, endIdx, queueEdit) {
  const beforeIdx = startIdx - 1;
  const afterIdx = endIdx + 1;
  if (
    beforeIdx >= 0 &&
    afterIdx < meta.length &&
    meta[beforeIdx].content.trim() === '```' &&
    meta[afterIdx].content.trim() === '```'
  ) {
    queueEdit(meta[beforeIdx].start, meta[beforeIdx].endWithNewline, '');
    queueEdit(meta[afterIdx].start, meta[afterIdx].endWithNewline, '');
    return true;
  }
  return false;
}

function applyEditsToText(text, edits) {
  if (!edits.length) return text;
  const sorted = edits.slice().sort((a, b) => a.start - b.start);
  let cursor = 0;
  let result = '';
  for (const edit of sorted) {
    if (edit.start > cursor) {
      result += text.slice(cursor, edit.start);
    }
    result += edit.value;
    cursor = edit.end;
  }
  result += text.slice(cursor);
  return result;
}

function finalizeEdits(text, edits, adjustments, selectionStart, selectionEnd) {
  const newText = applyEditsToText(text, edits);
  const sortedAdjustments = adjustments.slice().sort((a, b) => a.pos - b.pos);
  const newStart = mapPosition(selectionStart, sortedAdjustments, newText.length);
  const newEnd = mapPosition(selectionEnd, sortedAdjustments, newText.length);
  return { newText, newStart, newEnd };
}

function mapPosition(index, adjustments, textLength) {
  let mapped = index;
  for (const adjustment of adjustments) {
    if (adjustment.pos <= index) {
      mapped += adjustment.delta;
    }
  }
  return Math.max(0, Math.min(mapped, textLength));
}

function updateThemeSwatches(theme) {
  if (themeDarkButton) {
    themeDarkButton.classList.toggle('is-active', theme === 'dark');
  }
  if (themeLightButton) {
    themeLightButton.classList.toggle('is-active', theme === 'light');
  }
}

  function applyFont(fontFamily) {
    editor.style.fontFamily = fontFamily;
    localStorage.setItem('editorFont', fontFamily);
    syncLiteralToolbarDisplays();
    scheduleCentralSheetStripProofRefresh();
  }

function syncLiteralToolbarDisplays() {
  let fontLabel = 'Roboto Ms';
  let weightLabel = 'Light';
  let sizeLabel = String(currentFontSizePx);
  let lineHeightLabel = String(editor?.style.lineHeight || '1.0');
  if (fontDisplay && fontSelect) {
    const option = fontSelect.options[fontSelect.selectedIndex];
    fontLabel = option?.textContent || fontLabel;
    fontDisplay.textContent = fontLabel;
  }
  if (weightDisplay && weightSelect) {
    const option = weightSelect.options[weightSelect.selectedIndex];
    weightLabel = option?.textContent || weightLabel;
    weightDisplay.textContent = weightLabel;
  }
  if (sizeDisplay && sizeSelect) {
    const option = sizeSelect.options[sizeSelect.selectedIndex];
    sizeLabel = option?.textContent || sizeLabel;
    sizeDisplay.textContent = sizeLabel;
  }
  if (lineHeightDisplay && lineHeightSelect) {
    const option = lineHeightSelect.options[lineHeightSelect.selectedIndex];
    lineHeightLabel = option?.value && !option.value.startsWith('__')
      ? option.value
      : lineHeightLabel;
    lineHeightDisplay.textContent = lineHeightLabel;
  }
}

function promptForCustomFontSize() {
  const response = window.prompt('Font size (px)', String(currentFontSizePx));
  if (response === null) return null;
  const nextSize = Number(response);
  if (!Number.isFinite(nextSize) || nextSize <= 0) {
    updateStatusText('Некорректный размер шрифта');
    if (sizeSelect) {
      sizeSelect.value = String(currentFontSizePx);
    }
    return null;
  }
  const normalizedSize = Math.round(nextSize);
  ensureSelectHasOption(sizeSelect, String(normalizedSize), String(normalizedSize), '__custom_size__');
  return normalizedSize;
}

function promptForCustomLineHeight() {
  const currentValue = lineHeightSelect?.value && !lineHeightSelect.value.startsWith('__')
    ? lineHeightSelect.value
    : String(editor?.style.lineHeight || '1.0');
  const response = window.prompt('Line height', currentValue);
  if (response === null) return;
  const nextValue = Number(response);
  if (!Number.isFinite(nextValue) || nextValue <= 0) {
    updateStatusText('Некорректный интерлиньяж');
    if (lineHeightSelect) {
      lineHeightSelect.value = String(editor?.style.lineHeight || '1.0');
    }
    return;
  }
  const normalizedValue = String(Number(nextValue.toFixed(3)));
  ensureSelectHasOption(lineHeightSelect, normalizedValue, normalizedValue, '__custom_line_height__');
  applyLineHeight(normalizedValue);
}

function loadSavedFont() {
  const savedFont = localStorage.getItem('editorFont');
  const hasOption =
    fontSelect &&
    Array.from(fontSelect.options).some((option) => option.value === savedFont);

  if (savedFont && hasOption) {
    applyFont(savedFont);
    if (fontSelect) {
      fontSelect.value = savedFont;
    }
  } else if (fontSelect) {
    const fallbackFont = fontSelect.value;
    if (fallbackFont) {
      applyFont(fallbackFont);
      localStorage.setItem('editorFont', fallbackFont);
    }
  }
  syncLiteralToolbarDisplays();
}

if (window.electronAPI) {
  window.electronAPI.onFontChanged((fontFamily) => {
    applyFont(fontFamily);
    if (fontSelect) {
      fontSelect.value = fontFamily;
    }
  });
}

loadSavedFont();

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  localStorage.setItem('editorTheme', theme);
  updateThemeSwatches(theme);
  updateInspectorSnapshot();
}

async function handleUiSetThemeCommand(payload = {}) {
  const nextTheme = payload && payload.theme === 'dark' ? 'dark' : 'light';
  const bridgeResult = await invokePreloadUiCommandBridge(UI_COMMAND_IDS.THEME_SET, { theme: nextTheme });
  if (bridgeResult && bridgeResult.ok !== true) {
    return { performed: false, action: UI_COMMAND_IDS.THEME_SET, reason: bridgeResult.reason || 'UI_COMMAND_BRIDGE_FAILED', theme: nextTheme };
  }
  return { performed: true, action: UI_COMMAND_IDS.THEME_SET, reason: null, theme: nextTheme };
}

async function handleUiSetFontCommand(payload = {}) {
  const fontFamily = payload && typeof payload.fontFamily === 'string' ? payload.fontFamily : '';
  if (!fontFamily) {
    return { performed: false, action: UI_COMMAND_IDS.FONT_SET, reason: 'INVALID_FONT_FAMILY' };
  }
  const bridgeResult = await invokePreloadUiCommandBridge(UI_COMMAND_IDS.FONT_SET, { fontFamily });
  if (bridgeResult && bridgeResult.ok !== true) {
    return { performed: false, action: UI_COMMAND_IDS.FONT_SET, reason: bridgeResult.reason || 'UI_COMMAND_BRIDGE_FAILED', fontFamily };
  }
  return { performed: true, action: UI_COMMAND_IDS.FONT_SET, reason: null, fontFamily };
}

async function handleUiSetFontSizeCommand(payload = {}) {
  const px = Number(payload && payload.px);
  if (!Number.isFinite(px) || px <= 0) {
    return { performed: false, action: UI_COMMAND_IDS.FONT_SIZE_SET, reason: 'INVALID_FONT_SIZE' };
  }
  const bridgeResult = await invokePreloadUiCommandBridge(UI_COMMAND_IDS.FONT_SIZE_SET, { px });
  if (bridgeResult && bridgeResult.ok !== true) {
    return { performed: false, action: UI_COMMAND_IDS.FONT_SIZE_SET, reason: bridgeResult.reason || 'UI_COMMAND_BRIDGE_FAILED', px };
  }
  return { performed: true, action: UI_COMMAND_IDS.FONT_SIZE_SET, reason: null, px };
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem('editorTheme') || 'light';
  applyTheme(savedTheme);
}

if (window.electronAPI) {
  window.electronAPI.onThemeChanged((theme) => {
    applyTheme(theme);
  });
}

loadSavedTheme();

function setToolbarCompactMode(isCompact) {
  if (!toolbar) return;
  toolbar.classList.toggle(TOOLBAR_COMPACT_CLASS, isCompact);
  if (toolbarToggleButton) {
    toolbarToggleButton.textContent = isCompact ? 'max' : 'min';
    toolbarToggleButton.setAttribute(
      'aria-label',
      isCompact ? 'Maximize toolbar' : 'Minimize toolbar'
    );
  }
}

function toggleToolbarCompactMode() {
  if (!toolbar) return;
  const nextState = !toolbar.classList.contains(TOOLBAR_COMPACT_CLASS);
  setToolbarCompactMode(nextState);
}

setToolbarCompactMode(false);

function handleFind() {
  if (!editor) return { performed: false, found: false, query: '' };
  const query = window.prompt('Find', lastSearchQuery);
  if (!query) return { performed: false, found: false, query: '' };
  const text = getPlainText();
  const normalized = text.toLowerCase();
  const needle = query.toLowerCase();
  const { end: currentEnd } = getSelectionOffsets();
  const startIndex = query === lastSearchQuery ? currentEnd : 0;
  let index = normalized.indexOf(needle, startIndex);

  if (index === -1 && startIndex > 0) {
    index = normalized.indexOf(needle, 0);
  }

  if (index === -1) {
    updateStatusText('Не найдено');
    return { performed: true, found: false, query };
  }

  lastSearchQuery = query;
  focusEditorSurface('current');
  setSelectionRange(index, index + query.length);
  return { performed: true, found: true, query, index };
}

function handleReplace() {
  if (!editor) return { performed: false, replaced: 0 };
  const query = window.prompt('Find', lastSearchQuery);
  if (!query) return { performed: false, replaced: 0 };
  const replacement = window.prompt('Replace with', '');
  if (replacement === null) return { performed: false, replaced: 0 };

  const text = getPlainText();
  if (!text.includes(query)) {
    updateStatusText('Не найдено');
    return { performed: true, replaced: 0 };
  }

  let replaced = 0;
  let cursor = 0;
  while (cursor <= text.length) {
    const index = text.indexOf(query, cursor);
    if (index === -1) break;
    replaced += 1;
    cursor = index + query.length;
    if (query.length === 0) break;
  }

  if (replaced === 0) {
    updateStatusText('Не найдено');
    return { performed: true, replaced: 0 };
  }

  const next = text.split(query).join(replacement);
  setPlainText(next);
  markAsModified();
  updateWordCount();
  lastSearchQuery = query;
  updateStatusText(`Заменено: ${replaced}`);
  return { performed: true, replaced };
}

function handleUndo() {
  if (!editor) return { performed: false };
  if (isTiptapMode) {
    beginCentralSheetStripStructuralTransition();
    return undoTiptap();
  }
  editor.focus();
  document.execCommand('undo');
  return { performed: true };
}

function handleRedo() {
  if (!editor) return { performed: false };
  if (isTiptapMode) {
    beginCentralSheetStripStructuralTransition();
    return redoTiptap();
  }
  editor.focus();
  document.execCommand('redo');
  return { performed: true };
}

function handleZoomOut() {
  changeEditorZoom(-EDITOR_ZOOM_STEP);
  return { performed: true, direction: 'out' };
}

function handleZoomIn() {
  changeEditorZoom(EDITOR_ZOOM_STEP);
  return { performed: true, direction: 'in' };
}

function handleToggleWrap() {
  applyWordWrap(!wordWrapEnabled);
  return { performed: true, enabled: wordWrapEnabled };
}

async function handleInsertMarkdownPrompt() {
  await handleMarkdownImportUiPath();
  return { performed: true };
}

async function handleInsertFlowOpen() {
  await handleFlowModeOpenUiPath();
  return { performed: true };
}

function handleInsertAddCard() {
  const selection = window.getSelection();
  const text = selection && editor && editor.contains(selection.anchorNode) ? selection.toString() : '';
  openCardModal(text);
  return { performed: true, source: 'selection' };
}

function handleFormatAlign(action) {
  if (!Object.prototype.hasOwnProperty.call(ALIGNMENT_PREFIX_BY_ACTION, action)) {
    return { performed: false, reason: 'ALIGN_ACTION_UNKNOWN' };
  }
  applyAlignmentStyle(action);
  updateAlignmentButtons(action);
  return { performed: true, action };
}

function normalizeToolbarLinkPromptCandidate(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeToolbarLinkPromptValue(value) {
  const raw = normalizeToolbarLinkPromptCandidate(value);
  if (!raw) {
    return { ok: true, href: '' };
  }
  if (/\s/.test(raw)) {
    return { ok: false, reason: 'UNSAFE_SCHEME' };
  }

  let normalized = raw;
  const lower = raw.toLowerCase();
  if (
    lower.startsWith('http://')
    || lower.startsWith('https://')
    || lower.startsWith('mailto:')
  ) {
    normalized = raw;
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return { ok: false, reason: 'UNSAFE_SCHEME' };
  } else if (raw.startsWith('www.') || /^[^/\s]+\.[^\s]+/.test(raw)) {
    normalized = `https://${raw}`;
  }

  try {
    const parsed = new URL(normalized);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'mailto:') {
      return { ok: false, reason: 'UNSAFE_SCHEME' };
    }
    if (protocol === 'mailto:' && !parsed.pathname) {
      return { ok: false, reason: 'UNSAFE_SCHEME' };
    }
    return { ok: true, href: parsed.href };
  } catch {
    return { ok: false, reason: 'UNSAFE_SCHEME' };
  }
}

function readToolbarLinkPromptInitialValue(payload, state) {
  const input = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  const payloadHref = normalizeToolbarLinkPromptCandidate(input.href || input.initialHref || input.initialValue);
  if (payloadHref) {
    return payloadHref;
  }
  return normalizeToolbarLinkPromptCandidate(state.linkHref);
}

function normalizeToolbarFormattingState(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input
    : {};
  return {
    bold: Boolean(source.bold),
    italic: Boolean(source.italic),
    underline: Boolean(source.underline),
    textColor: typeof source.textColor === 'string' ? source.textColor : '',
    textColorActive: Boolean(source.textColorActive || (typeof source.textColor === 'string' && source.textColor.length > 0)),
    highlightColor: typeof source.highlightColor === 'string' ? source.highlightColor : '',
    highlightActive: Boolean(source.highlightActive || (typeof source.highlightColor === 'string' && source.highlightColor.length > 0)),
    bulletList: Boolean(source.bulletList),
    orderedList: Boolean(source.orderedList),
    link: Boolean(source.link || source.linkActive),
    linkHref: typeof source.linkHref === 'string' ? source.linkHref : '',
    paragraphStyle: typeof source.paragraphStyle === 'string' ? source.paragraphStyle : '',
    characterStyle: typeof source.characterStyle === 'string' ? source.characterStyle : '',
    selectionEmpty: source.selectionEmpty !== false,
  };
}

function normalizeToolbarColorPickerMode(mode) {
  return mode === 'highlight' ? 'highlight' : 'text';
}

function getToolbarColorPickerSwatches(mode) {
  return TOOLBAR_COLOR_PICKER_MODE_SWATCHES[normalizeToolbarColorPickerMode(mode)] || [];
}

function renderToolbarColorPickerOverlay() {
  if (!(toolbarColorPickerOverlay instanceof HTMLElement)) return;
  const mode = normalizeToolbarColorPickerMode(toolbarColorPickerState.mode);
  const isOpen = Boolean(toolbarColorPickerState.open);
  const selectedValue = toolbarColorPickerState.selectedByMode[mode] || '';

  toolbarColorPickerOverlay.hidden = !isOpen;
  toolbarColorPickerOverlay.dataset.toolbarColorPickerMode = mode;
  toolbarColorPickerOverlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

  if (toolbarColorPickerTitle instanceof HTMLElement) {
    toolbarColorPickerTitle.textContent = TOOLBAR_COLOR_PICKER_MODE_LABELS[mode] || mode;
  }

  if (toolbarColorPickerSwatchHost instanceof HTMLElement) {
    toolbarColorPickerSwatchHost.replaceChildren();

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'toolbar__swatch toolbar__swatch--clear';
    clearButton.dataset.toolbarColorSwatchValue = '';
    clearButton.setAttribute('role', 'menuitemradio');
    clearButton.setAttribute('aria-label', `Clear ${TOOLBAR_COLOR_PICKER_MODE_LABELS[mode] || mode.toLowerCase()}`);
    clearButton.setAttribute('aria-checked', selectedValue === '' ? 'true' : 'false');
    clearButton.setAttribute('aria-pressed', selectedValue === '' ? 'true' : 'false');
    clearButton.classList.toggle('is-active', selectedValue === '');
    clearButton.textContent = '×';
    toolbarColorPickerSwatchHost.appendChild(clearButton);

    for (const swatch of getToolbarColorPickerSwatches(mode)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toolbar__swatch';
      button.dataset.toolbarColorSwatchValue = swatch.value;
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-label', swatch.label);
      button.setAttribute('aria-checked', swatch.value === selectedValue ? 'true' : 'false');
      button.setAttribute('aria-pressed', swatch.value === selectedValue ? 'true' : 'false');
      button.classList.toggle('is-active', swatch.value === selectedValue);
      button.style.setProperty('--swatch-color', swatch.value);
      toolbarColorPickerSwatchHost.appendChild(button);
    }
  }

  if (toolbarColorPickerCloseButton instanceof HTMLElement) {
    toolbarColorPickerCloseButton.setAttribute('aria-label', `Close ${TOOLBAR_COLOR_PICKER_MODE_LABELS[mode] || mode.toLowerCase()}`);
  }
}

function setToolbarColorPickerOpen(nextOpen, nextMode = toolbarColorPickerState.mode) {
  const mode = normalizeToolbarColorPickerMode(nextMode);
  if (nextOpen) {
    setParagraphMenuOpen(false);
    setListMenuOpen(false);
    setToolbarSpacingMenuOpen(false);
    setToolbarStylesMenuOpen(false);
  }
  toolbarColorPickerState = {
    ...toolbarColorPickerState,
    open: Boolean(nextOpen),
    mode,
  };
  if (nextOpen && isTiptapMode) {
    const state = normalizeToolbarFormattingState(getTiptapFormattingState());
    toolbarColorPickerState = {
      ...toolbarColorPickerState,
      selectedByMode: {
        ...toolbarColorPickerState.selectedByMode,
        text: state.textColor,
        highlight: state.highlightColor,
      },
    };
  }
  syncToolbarShellState();
}

function setToolbarColorPickerSelection(nextValue) {
  const mode = normalizeToolbarColorPickerMode(toolbarColorPickerState.mode);
  const value = typeof nextValue === 'string' ? nextValue.trim().toLowerCase() : '';
  const result = mode === 'highlight'
    ? (value
      ? handleTiptapFormatCommand('setHighlight', { value })
      : handleTiptapFormatCommand('unsetHighlight'))
    : (value
      ? handleTiptapFormatCommand('setColor', { value })
      : handleTiptapFormatCommand('unsetColor'));
  toolbarColorPickerState = {
    ...toolbarColorPickerState,
    selectedByMode: {
      ...toolbarColorPickerState.selectedByMode,
      [mode]: result && result.performed !== false ? value : toolbarColorPickerState.selectedByMode[mode],
    },
    open: false,
  };
  syncToolbarShellState();
  return result;
}

function resolveToolbarColorButtonForMode(mode) {
  return normalizeToolbarColorPickerMode(mode) === 'highlight'
    ? colorHighlightButton
    : colorTextButton;
}

function positionToolbarColorPickerOverlay() {
  if (!(toolbarColorPickerOverlay instanceof HTMLElement) || !(toolbarShell instanceof HTMLElement)) return;
  const anchorButton = resolveToolbarColorButtonForMode(toolbarColorPickerState.mode);
  if (!(anchorButton instanceof HTMLElement)) return;

  const shellRect = toolbarShell.getBoundingClientRect();
  const anchorRect = anchorButton.getBoundingClientRect();
  const overlayRect = toolbarColorPickerOverlay.getBoundingClientRect();
  const rawLeft = anchorRect.left - shellRect.left + ((anchorRect.width - overlayRect.width) / 2);
  const maxLeft = Math.max(0, shellRect.width - overlayRect.width);
  const left = Math.min(Math.max(0, rawLeft), maxLeft);
  const top = anchorRect.bottom - shellRect.top + 10;
  toolbarColorPickerOverlay.style.left = `${left}px`;
  toolbarColorPickerOverlay.style.top = `${top}px`;
}

function syncToolbarShellState() {
  if (colorTextButton instanceof HTMLElement) {
    colorTextButton.classList.toggle('is-open', toolbarColorPickerState.open && toolbarColorPickerState.mode === 'text');
    colorTextButton.setAttribute('aria-label', 'Text color');
  }
  if (colorHighlightButton instanceof HTMLElement) {
    colorHighlightButton.classList.toggle('is-open', toolbarColorPickerState.open && toolbarColorPickerState.mode === 'highlight');
    colorHighlightButton.setAttribute('aria-label', 'Highlight color');
  }
  if (reviewCommentsButton instanceof HTMLElement) {
    const isActive = currentRightTab === 'comments';
    reviewCommentsButton.classList.toggle('is-pressed', isActive);
    reviewCommentsButton.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    reviewCommentsButton.setAttribute('aria-label', 'Open comments');
  }
  if (styleParagraphButton instanceof HTMLElement) {
    styleParagraphButton.classList.toggle(
      'is-open',
      toolbarStylesMenuState.open && toolbarStylesMenuState.anchor === TOOLBAR_STYLES_MENU_ANCHORS.paragraph,
    );
    styleParagraphButton.classList.toggle('is-active', toolbarStylesMenuState.selectedByKind.paragraph.length > 0);
    styleParagraphButton.setAttribute(
      'aria-expanded',
      toolbarStylesMenuState.open && toolbarStylesMenuState.anchor === TOOLBAR_STYLES_MENU_ANCHORS.paragraph ? 'true' : 'false',
    );
  }
  if (styleCharacterButton instanceof HTMLElement) {
    styleCharacterButton.classList.toggle(
      'is-open',
      toolbarStylesMenuState.open && toolbarStylesMenuState.anchor === TOOLBAR_STYLES_MENU_ANCHORS.character,
    );
    styleCharacterButton.classList.toggle('is-active', toolbarStylesMenuState.selectedByKind.character.length > 0);
    styleCharacterButton.setAttribute(
      'aria-expanded',
      toolbarStylesMenuState.open && toolbarStylesMenuState.anchor === TOOLBAR_STYLES_MENU_ANCHORS.character ? 'true' : 'false',
    );
  }
  if (toolbarColorPickerOverlay instanceof HTMLElement) {
    toolbarColorPickerOverlay.classList.toggle('is-open', toolbarColorPickerState.open);
    toolbarColorPickerOverlay.dataset.toolbarColorPickerMode = normalizeToolbarColorPickerMode(toolbarColorPickerState.mode);
    if (toolbarColorPickerState.open) {
      positionToolbarColorPickerOverlay();
    } else {
      toolbarColorPickerOverlay.style.left = '';
      toolbarColorPickerOverlay.style.top = '';
    }
  }
  paragraphStyleOptionButtons.forEach((button) => {
    const optionId = button.getAttribute('data-style-paragraph-option') || '';
    const active = optionId.length > 0 && optionId === toolbarStylesMenuState.selectedByKind.paragraph;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  characterStyleOptionButtons.forEach((button) => {
    const optionId = button.getAttribute('data-style-character-option') || '';
    const active = optionId.length > 0 && optionId === toolbarStylesMenuState.selectedByKind.character;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  renderToolbarColorPickerOverlay();
}

function updateToolbarPressedButton(button, active) {
  if (!(button instanceof HTMLElement)) return;
  button.classList.toggle('is-pressed', active);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  button.disabled = !isTiptapMode;
}

function syncToolbarFormattingState(nextState = null) {
  const state = isTiptapMode
    ? normalizeToolbarFormattingState(nextState || getTiptapFormattingState())
    : normalizeToolbarFormattingState();
  updateToolbarPressedButton(formatBoldButton, state.bold);
  updateToolbarPressedButton(formatItalicButton, state.italic);
  updateToolbarPressedButton(formatUnderlineButton, state.underline);
  updateToolbarPressedButton(insertLinkButton, state.link);
  if (colorTextButton instanceof HTMLElement) {
    updateToolbarPressedButton(colorTextButton, state.textColorActive);
  }
  if (colorHighlightButton instanceof HTMLElement) {
    updateToolbarPressedButton(colorHighlightButton, state.highlightActive);
  }
  toolbarColorPickerState = {
    ...toolbarColorPickerState,
    selectedByMode: {
      text: state.textColor,
      highlight: state.highlightColor,
    },
  };
  toolbarStylesMenuState = {
    ...toolbarStylesMenuState,
    selectedByKind: {
      paragraph: state.paragraphStyle,
      character: state.characterStyle,
    },
  };

  if (listTriggerButton instanceof HTMLElement) {
    const hasList = state.bulletList || state.orderedList;
    listTriggerButton.classList.toggle('is-active', hasList);
    listTriggerButton.disabled = !isTiptapMode;
  }

  listActionButtons.forEach((button) => {
    const action = button.dataset.listAction || '';
    const active = (action === 'bullet' && state.bulletList)
      || (action === 'ordered' && state.orderedList)
      || (action === 'no-list' && !state.bulletList && !state.orderedList);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', active ? 'true' : 'false');
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  syncToolbarShellState();
}

function handleToggleStylesMenu(anchor) {
  const normalizedAnchor = normalizeToolbarStylesMenuAnchor(anchor);
  const isOpen = toolbarStylesMenu instanceof HTMLElement
    && !toolbarStylesMenu.hidden
    && toolbarStylesMenuState.anchor === normalizedAnchor;
  setToolbarStylesMenuOpen(!isOpen, normalizedAnchor);
  syncToolbarShellState();
  return { performed: true, action: 'toggleStylesMenu', reason: null, optionId: normalizedAnchor };
}

function handleStyleParagraphMenu() {
  return handleToggleStylesMenu(TOOLBAR_STYLES_MENU_ANCHORS.paragraph);
}

function handleStyleCharacterMenu() {
  return handleToggleStylesMenu(TOOLBAR_STYLES_MENU_ANCHORS.character);
}

function handleFormatTextColorPicker() {
  if (!isTiptapMode) {
    return { performed: false, action: 'textColorPicker', reason: 'EDITOR_MODE_UNSUPPORTED' };
  }
  const isOpen = toolbarColorPickerOverlay instanceof HTMLElement
    && !toolbarColorPickerOverlay.hidden
    && toolbarColorPickerState.mode === 'text';
  setToolbarColorPickerOpen(!isOpen, 'text');
  return { performed: true, action: 'textColorPicker', reason: null };
}

function handleFormatHighlightColorPicker() {
  if (!isTiptapMode) {
    return { performed: false, action: 'highlightColorPicker', reason: 'EDITOR_MODE_UNSUPPORTED' };
  }
  const isOpen = toolbarColorPickerOverlay instanceof HTMLElement
    && !toolbarColorPickerOverlay.hidden
    && toolbarColorPickerState.mode === 'highlight';
  setToolbarColorPickerOpen(!isOpen, 'highlight');
  return { performed: true, action: 'highlightColorPicker', reason: null };
}

async function handleReviewOpenComments() {
  setToolbarColorPickerOpen(false);
  setToolbarStylesMenuOpen(false);
  if (currentMode === 'review' && currentRightTab === 'comments') {
    await loadReviewSurfaceFromQuery();
    syncToolbarShellState();
    return { performed: true, action: 'reviewOpenComments', reason: null };
  }
  applyMode('review');
  applyRightTab('comments');
  await loadReviewSurfaceFromQuery();
  syncToolbarShellState();
  return { performed: true, action: 'reviewOpenComments', reason: null };
}

function createReviewImportLocalPacketRequestId() {
  return `review-import-local-packet-${Date.now()}`;
}

async function handleReviewImportLocalPacket() {
  setToolbarColorPickerOpen(false);
  setToolbarStylesMenuOpen(false);
  const requestId = createReviewImportLocalPacketRequestId();

  let bridgeResult = null;
  try {
    bridgeResult = await invokePreloadUiCommandBridge(REVIEW_SURFACE_IMPORT_LOCAL_PACKET_COMMAND_ID, { requestId });
  } catch (error) {
    const reason = error && typeof error.message === 'string'
      ? error.message
      : 'REVIEW_IMPORT_LOCAL_PACKET_THROW';
    updateStatusText('Review packet import failed');
    return { performed: false, action: 'reviewImportLocalPacket', reason };
  }

  const commandResult = reviewSurfaceUnwrapCommandResult(bridgeResult);
  if (bridgeResult?.ok === true && commandResult?.ok === true) {
    if (commandResult.cancelled === true) {
      updateStatusText('Review packet import cancelled');
      return { performed: false, action: 'reviewImportLocalPacket', reason: 'USER_CANCELLED' };
    }
    applyMode('review');
    applyRightTab('comments');
    if (reviewSurfaceIsPlainObject(commandResult.reviewSurface)) {
      setReviewSurfaceState(commandResult.reviewSurface);
    } else {
      await loadReviewSurfaceFromQuery();
    }
    syncToolbarShellState();
    updateStatusText('Review packet imported');
    return { performed: true, action: 'reviewImportLocalPacket', reason: null };
  }

  const reason = reviewSurfaceExtractCommandFailureReason(bridgeResult);
  updateStatusText('Review packet import failed');
  return { performed: false, action: 'reviewImportLocalPacket', reason };
}

async function handleReviewClearSession() {
  let bridgeResult = null;
  try {
    bridgeResult = await invokePreloadUiCommandBridge(REVIEW_SURFACE_CLEAR_SESSION_COMMAND_ID, {
      requestId: `review-clear-session-${Date.now()}`,
    });
  } catch (error) {
    const reason = error && typeof error.message === 'string'
      ? error.message
      : 'REVIEW_CLEAR_SESSION_THROW';
    updateStatusText('Review session clear failed');
    return { performed: false, action: 'reviewClearSession', reason };
  }

  const commandResult = reviewSurfaceUnwrapCommandResult(bridgeResult);
  if (bridgeResult?.ok === true && commandResult?.ok === true && commandResult.cleared === true) {
    applyMode('review');
    applyRightTab('comments');
    setReviewSurfaceState({});
    syncToolbarShellState();
    updateStatusText('Review session cleared');
    return { performed: true, action: 'reviewClearSession', reason: null };
  }

  const reason = reviewSurfaceExtractCommandFailureReason(bridgeResult);
  updateStatusText('Review session clear failed');
  return { performed: false, action: 'reviewClearSession', reason };
}

function handleTiptapFormatCommand(commandName, payload = {}) {
  if (!isTiptapMode) {
    return { performed: false, action: commandName, reason: 'EDITOR_MODE_UNSUPPORTED' };
  }
  const result = runTiptapFormatCommand(commandName, payload);
  if (result && result.performed !== false) {
    markAsModified();
    updateWordCount();
  }
  syncToolbarFormattingState();
  return result;
}

function handleInsertLinkPrompt(payload = {}) {
  if (!isTiptapMode) {
    return { performed: false, action: 'insertLinkPrompt', reason: 'EDITOR_MODE_UNSUPPORTED' };
  }

  const state = normalizeToolbarFormattingState(getTiptapFormattingState());
  if (state.selectionEmpty && !state.link) {
    syncToolbarFormattingState(state);
    return { performed: false, action: 'insertLinkPrompt', reason: 'NO_SELECTION' };
  }
  if (typeof window.prompt !== 'function') {
    return { performed: false, action: 'insertLinkPrompt', reason: 'PROMPT_UNAVAILABLE' };
  }

  const response = window.prompt(LINK_PROMPT_TITLE, readToolbarLinkPromptInitialValue(payload, state));
  if (response === null) {
    return { performed: false, action: 'insertLinkPrompt', reason: 'USER_CANCELLED' };
  }

  const normalized = normalizeToolbarLinkPromptValue(response);
  if (!normalized.ok) {
    syncToolbarFormattingState(state);
    return { performed: false, action: 'insertLinkPrompt', reason: normalized.reason };
  }
  if (!normalized.href) {
    if (!state.link) {
      syncToolbarFormattingState(state);
      return { performed: false, action: 'insertLinkPrompt', reason: 'NO_OP' };
    }
    return handleTiptapFormatCommand('unsetLink');
  }

  return handleTiptapFormatCommand('setLink', { href: normalized.href });
}

function dispatchListTypeAction(listAction) {
  switch (listAction) {
    case 'no-list':
      return dispatchUiCommand(EXTRA_COMMAND_IDS.LIST_CLEAR);
    case 'bullet':
      return dispatchUiCommand(EXTRA_COMMAND_IDS.LIST_TOGGLE_BULLET);
    case 'ordered':
      return dispatchUiCommand(EXTRA_COMMAND_IDS.LIST_TOGGLE_ORDERED);
    default:
      return Promise.resolve({ ok: false, error: { reason: 'LIST_ACTION_UNKNOWN' } });
  }
}

async function handlePlanFlowSave() {
  await handleFlowModeSaveUiPath();
  return { performed: true };
}

async function handleReviewExportMarkdown() {
  await handleMarkdownExportUiPath();
  return { performed: true };
}

function handleUiAction(action) {
  switch (action) {
    case 'toggle-configurator':
      toggleConfiguratorOpen();
      return true;
    case 'save-as':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.PROJECT_SAVE_AS);
      return true;
    case 'search':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_FIND);
      return true;
    case 'replace':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_REPLACE);
      return true;
    case 'new':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.PROJECT_NEW);
      return true;
    case 'clear':
      if (editor) {
        setPlainText('');
        markAsModified();
        updateWordCount();
      }
      return true;
    case 'open':
      openProjectLibraryModal();
      return true;
    case 'open-current-scene':
      if (flowModeState.active) {
        void jumpToFlowProjectionSourceAtCaret();
      } else {
        updateStatusText('Открыта текущая сцена');
      }
      return true;
    case 'open-flow-mode':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.INSERT_FLOW_OPEN);
      return true;
    case 'save':
      commitSpatialLayoutState(currentProjectId);
      if (flowModeState.active) {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.PLAN_FLOW_SAVE);
      } else {
        void dispatchUiCommand(COMMAND_IDS.PROJECT_SAVE);
      }
      return true;
    case 'export-docx-min':
      void dispatchUiCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN);
      return true;
    case 'import-markdown-v1':
      openImportSurfaceModal(COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1);
      return true;
    case 'export-markdown-v1':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.REVIEW_EXPORT_MARKDOWN);
      return true;
    case 'theme-dark':
      void dispatchUiCommand(UI_COMMAND_IDS.THEME_SET, { theme: 'dark' });
      return true;
    case 'theme-light':
      void dispatchUiCommand(UI_COMMAND_IDS.THEME_SET, { theme: 'light' });
      return true;
    case 'toggle-wrap':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.VIEW_TOGGLE_WRAP);
      return true;
    case 'switch-preview-format-a4':
      void dispatchUiCommand(PREVIEW_FORMAT_COMMAND_IDS.A4);
      return true;
    case 'switch-preview-format-a5':
      void dispatchUiCommand(PREVIEW_FORMAT_COMMAND_IDS.A5);
      return true;
    case 'switch-preview-format-letter':
      void dispatchUiCommand(PREVIEW_FORMAT_COMMAND_IDS.LETTER);
      return true;
    case 'switch-preview-orientation-portrait':
      void dispatchUiCommand(PREVIEW_ORIENTATION_COMMAND_IDS.PORTRAIT);
      return true;
    case 'switch-preview-orientation-landscape':
      void dispatchUiCommand(PREVIEW_ORIENTATION_COMMAND_IDS.LANDSCAPE);
      return true;
    case 'toggle-preview':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.VIEW_TOGGLE_PREVIEW);
      return true;
    case 'toggle-preview-frame':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.VIEW_TOGGLE_PREVIEW_FRAME);
      return true;
    case 'zoom-out':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.VIEW_ZOOM_OUT);
      return true;
    case 'zoom-in':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.VIEW_ZOOM_IN);
      return true;
    case 'toggle-paragraph-menu':
      setParagraphMenuOpen(!(paragraphMenu && !paragraphMenu.hidden));
      return true;
    case 'toggle-list-menu':
      setListMenuOpen(!(listMenu && !listMenu.hidden));
      return true;
    case 'toggle-style-paragraph-menu':
      handleStyleParagraphMenu();
      return true;
    case 'toggle-style-character-menu':
      handleStyleCharacterMenu();
      return true;
    case 'format-bold':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_TOGGLE_BOLD);
      return true;
    case 'format-italic':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_TOGGLE_ITALIC);
      return true;
    case 'format-underline':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_TOGGLE_UNDERLINE);
      return true;
    case 'color-text':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_TEXT_COLOR_PICKER);
      return true;
    case 'color-highlight':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_HIGHLIGHT_COLOR_PICKER);
      return true;
    case 'insert-link':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.INSERT_LINK_PROMPT);
      return true;
    case 'review-open-comments':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.REVIEW_OPEN_COMMENTS);
      return true;
    case 'toolbar-color-picker-close':
      setToolbarColorPickerOpen(false);
      return true;
    case 'undo':
      return handleUndo().performed !== false;
    case 'redo':
      return handleRedo().performed !== false;
    case 'align-left':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_ALIGN_LEFT);
      return true;
    case 'align-center':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_ALIGN_CENTER);
      return true;
    case 'align-right':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_ALIGN_RIGHT);
      return true;
    case 'align-justify':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_ALIGN_JUSTIFY);
      return true;
    case 'minimize':
      toggleToolbarCompactMode();
      return true;
    case 'open-settings':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.VIEW_OPEN_SETTINGS);
      return true;
    case 'open-command-palette':
      openCommandPaletteModal();
      return true;
    case 'toggle-left-rail':
      toggleLeftRailCollapsed();
      return true;
    case 'close-left-rail-overlay':
      setLeftRailOverlayOpen(false);
      setRightRailOverlayOpen(false, { restoreFocus: false });
      return true;
    case 'toggle-right-rail':
      toggleRightRailCollapsed();
      return true;
    case 'open-atlas-rail':
      openAtlasRailFromReachabilityOpener();
      return true;
    case 'close-right-rail-overlay':
      setRightRailOverlayOpen(false);
      return true;
    case 'open-diagnostics':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.TOOLS_OPEN_DIAGNOSTICS);
      return true;
    case 'open-recovery':
      void dispatchUiCommand(EXTRA_COMMAND_IDS.REVIEW_OPEN_RECOVERY);
      return true;
    default:
      return false;
  }
}

function triggerLeftToolbarAction(action) {
  if (typeof action !== 'string' || action.length === 0) return false;
  switch (action) {
    case 'search':
      {
        const result = handleFind();
        if (!result || result.performed !== true) {
          applyLeftTab('search');
          leftSearchInput?.focus();
        }
      }
      return true;
    case 'new':
      if (typeof dispatchUiCommand === 'function') {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.PROJECT_NEW);
        return true;
      }
      break;
    case 'open':
      openProjectLibraryModal();
      return true;
    case 'toggle-configurator':
      toggleConfiguratorOpen();
      return true;
    default:
      break;
  }
  return handleUiAction(action);
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (handleUiAction(action)) {
    event.preventDefault();
  }
});

if (styleSelect) {
  styleSelect.addEventListener('change', (event) => {
    applyViewMode(event.target.value);
  });
}

if (textStyleSelect) {
  textStyleSelect.addEventListener('change', (event) => {
    applyTextStyle(event.target.value);
    textStyleSelect.value = TEXT_STYLE_DEFAULT;
  });
}

if (fontSelect) {
  fontSelect.addEventListener('change', (event) => {
    const fontFamily = event.target.value;
    void dispatchUiCommand(UI_COMMAND_IDS.FONT_SET, { fontFamily });
  });
}

if (weightSelect) {
  weightSelect.addEventListener('change', (event) => {
    applyFontWeight(event.target.value);
  });
}

if (sizeSelect) {
  sizeSelect.addEventListener('change', (event) => {
    if (event.target.value === '__custom_size__') {
      const customSize = promptForCustomFontSize();
      if (Number.isFinite(customSize)) {
        void dispatchUiCommand(UI_COMMAND_IDS.FONT_SIZE_SET, { px: customSize });
      }
      return;
    }
    const nextSize = Number(event.target.value);
    if (Number.isFinite(nextSize)) {
      void dispatchUiCommand(UI_COMMAND_IDS.FONT_SIZE_SET, { px: nextSize });
    }
  });
}

if (lineHeightSelect) {
  lineHeightSelect.addEventListener('change', (event) => {
    if (event.target.value === '__custom_line_height__') {
      promptForCustomLineHeight();
      return;
    }
    applyLineHeight(event.target.value);
  });
}

function loadSavedViewMode() {
  const saved = localStorage.getItem('editorViewMode') || 'default';
  applyViewMode(saved, false);
}

function loadSavedFontWeight() {
  const saved = localStorage.getItem('editorFontWeight');
  if (saved) {
    applyFontWeight(saved, false);
    if (weightSelect) {
      weightSelect.value = normalizeFontWeightPreset(saved);
    }
  } else {
    applyFontWeight('light', false);
    if (weightSelect) {
      weightSelect.value = 'light';
    }
  }
}

function loadSavedLineHeight() {
  const saved = localStorage.getItem('editorLineHeight');
  if (saved) {
    applyLineHeight(saved, false);
  } else {
    applyLineHeight('1.625', false);
  }
}

function loadSavedWordWrap() {
  const saved = localStorage.getItem('editorWordWrap');
  const enabled = saved !== 'off';
  applyWordWrap(enabled, false);
}

function applyLiteralToolbarMasterVisualDefaults() {
  if (!document.body.classList.contains('literal-stage-a')) return;
  if (fontSelect) {
    const literalFont = '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    fontSelect.value = literalFont;
    applyFont(literalFont);
  }
  if (weightSelect) {
    weightSelect.value = 'light';
  }
  if (lineHeightSelect) {
    lineHeightSelect.value = '1.0';
  }
  applyFontWeight('light', false);
  if (editor) {
    editor.style.fontSize = '12px';
  }
  setCurrentFontSize(12);
  syncLiteralToolbarDisplays();
}

loadSavedViewMode();
loadSavedFontWeight();
loadSavedLineHeight();
loadSavedWordWrap();
loadSavedEditorZoom();
applyLiteralToolbarMasterVisualDefaults();

setPlainText('');
restoreSpatialLayoutState(currentProjectId);
metaPanel?.classList.add('is-hidden');
updateSaveStateText('idle');
updateWarningStateText('none');
updatePerfHintText('normal');
updateInspectorSnapshot();
applyMode('write');
applyLeftTab('project');
applyRightTab('inspector');
initializeReviewSurface();
ensureCommandsOpenerInRightInspectorSurface();
installNetworkGuard();
void initializeCollabScopeLocal();
initializeToolbarConfiguratorFoundation();
showEditorPanelFor('Yalken');
updateWordCount();
initializeFloatingToolbarSpacingMenu();
initializeFloatingToolbarParagraphMenu();
initializeFloatingToolbarListMenu();
initializeFloatingToolbarColorPickerOverlay();
initializeFloatingToolbarStylesMenu();
syncToolbarFormattingState();
if (isTiptapMode) {
  setTiptapFormattingStateHandler(syncToolbarFormattingState);
}
initializeFloatingToolbarItemOffsetTuning();
initializeFloatingToolbarDragFoundation();
initializeLeftToolbarSpacingMenu();
initializeLeftToolbarButtonOffsetTuning();
initializeLeftToolbarActionButtons();
initializeLeftFloatingToolbarDragFoundation();
document.addEventListener('click', handleManualMapWorkbenchClick);
document.addEventListener('dblclick', handleManualMapWorkbenchDoubleClick);
document.addEventListener('keydown', handleManualMapWorkbenchKeydown);
document.addEventListener('wheel', handleManualMapWorkbenchWheel, { passive: false });
document.addEventListener('pointerdown', handleManualMapWorkbenchPointerDown);
document.addEventListener('pointerup', handleManualMapWorkbenchPointerUp);

loadTree();
syncFlowViewModeButtons();

if (modeSwitcher) {
  modeSwitcher.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mode]');
    if (!button) return;
    const mode = button.dataset.mode;
    if (mode === 'write' || mode === 'plan' || mode === 'review') {
      applyMode(mode);
    }
  });
}

if (leftRailHeader) {
  leftRailHeader.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-left-rail-action]')
      : null;
    if (!(button instanceof HTMLElement) || !leftRailActionButtons.includes(button)) return;
    const action = button.dataset.leftRailAction;
    if (action === 'search') {
      applyLeftTab('search');
      requestAnimationFrame(() => leftSearchInput?.focus({ preventScroll: true }));
      return;
    }
    if (action === 'add') {
      event.stopPropagation();
      if (!openNavigatorRootCreateMenu(button)) {
        updateStatusText('Добавление недоступно для этого раздела');
      }
    }
  });
}

if (leftTabsHost) {
  leftTabsHost.addEventListener('click', (event) => {
    const button = event.target.closest('[data-left-tab]');
    if (!button) return;
    const tab = button.dataset.leftTab;
    if (tab === 'project' || tab === 'outline' || tab === 'notes' || tab === 'search') {
      applyLeftTab(tab);
    }
  });

  leftTabsHost.addEventListener('keydown', (event) => {
    const currentButton = event.target instanceof Element
      ? event.target.closest('[data-left-tab]')
      : null;
    if (!(currentButton instanceof HTMLElement)) return;

    const tabs = leftTabButtons.filter((button) => button instanceof HTMLElement);
    const currentIndex = tabs.indexOf(currentButton);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else if (event.key === 'Enter' || event.key === ' ') {
      const tab = currentButton.dataset.leftTab;
      if (tab === 'project' || tab === 'outline' || tab === 'notes' || tab === 'search') {
        event.preventDefault();
        applyLeftTab(tab);
      }
      return;
    } else {
      return;
    }

    event.preventDefault();
    const nextButton = tabs[nextIndex];
    const tab = nextButton.dataset.leftTab;
    if (tab === 'project' || tab === 'outline' || tab === 'notes' || tab === 'search') {
      nextButton.focus();
      applyLeftTab(tab);
    }
  });
}

if (notesCaptureForm) {
  notesCaptureForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void createInboxNoteFromCapture();
  });
}

if (notesCaptureBody) {
  notesCaptureBody.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void createInboxNoteFromCapture();
    }
  });
}

if (notesListElement) {
  notesListElement.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-note-id]')
      : null;
    if (!(button instanceof HTMLElement)) return;
    const noteId = button.dataset.noteId || '';
    if (!noteId) return;
    notesWorkspaceState = { ...notesWorkspaceState, selectedId: noteId };
    renderNotesWorkspace();
  });
}

notesSaveButton?.addEventListener('click', () => {
  void saveSelectedNote();
});

notesAttachSceneButton?.addEventListener('click', () => {
  void attachSelectedNoteToActiveScene();
});

notesConvertSceneButton?.addEventListener('click', () => {
  void convertSelectedNoteToScene();
});

notesDeleteButton?.addEventListener('click', () => {
  const note = getSelectedNotesWorkspaceNote();
  if (!note || note.deleted) return;
  void runNotesMutation(EXTRA_COMMAND_IDS.NOTES_DELETE, {
    projectId: currentProjectId,
    noteId: note.id,
  }, 'Заметка удалена');
});

notesRestoreButton?.addEventListener('click', () => {
  const note = getSelectedNotesWorkspaceNote();
  if (!note || !note.deleted) return;
  void runNotesMutation(EXTRA_COMMAND_IDS.NOTES_RESTORE, {
    projectId: currentProjectId,
    noteId: note.id,
  }, 'Заметка возвращена');
});

projectLibraryCloseButtons.forEach((button) => {
  button.addEventListener('click', () => closeSimpleModal(projectLibraryModal));
});

projectLibraryRefreshButtons.forEach((button) => {
  button.addEventListener('click', () => {
    void refreshProjectLibraryModal();
  });
});

projectLibraryCreateButton?.addEventListener('click', () => {
  void createProjectFromLibraryModal();
});

projectLibraryOpenButton?.addEventListener('click', () => {
  void openSelectedProjectFromLibraryModal();
});

projectLibraryContinueButton?.addEventListener('click', () => {
  void continueLastProjectFromLibraryModal();
});

projectLibraryRenameButton?.addEventListener('click', () => {
  void renameSelectedProjectFromLibraryModal();
});

projectLibraryDuplicateButton?.addEventListener('click', () => {
  void duplicateSelectedProjectFromLibraryModal();
});

projectLibraryMoveButton?.addEventListener('click', () => {
  void moveSelectedProjectFromLibraryModal();
});

projectLibraryArchiveButton?.addEventListener('click', () => {
  void archiveSelectedProjectFromLibraryModal();
});

projectLibraryTrashButton?.addEventListener('click', () => {
  void trashSelectedProjectFromLibraryModal();
});

projectLibraryRestoreButton?.addEventListener('click', () => {
  void restoreSelectedProjectFromLibraryModal();
});

projectLibraryBackupButton?.addEventListener('click', () => {
  void backupSelectedProjectFromLibraryModal();
});

projectLibraryIntegrityButton?.addEventListener('click', () => {
  void inspectSelectedProjectIntegrityFromLibraryModal();
});

projectLibraryNameInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void createProjectFromLibraryModal();
  }
});

projectLibraryList?.addEventListener('click', (event) => {
  const button = event.target instanceof Element
    ? event.target.closest('[data-project-library-id]')
    : null;
  if (!(button instanceof HTMLElement)) return;
  projectLibraryState = {
    ...projectLibraryState,
    selectedProjectId: button.dataset.projectLibraryId || '',
  };
  renderProjectLibraryModal();
});

if (rightTabsHost) {
  const activateRightRailTabButton = (button) => {
    const tab = button?.dataset?.rightTab;
    if (tab === 'comments') {
      void dispatchUiCommand(EXTRA_COMMAND_IDS.REVIEW_OPEN_COMMENTS);
      return;
    }
    if (tab === 'inspector' || tab === 'history' || tab === 'atlas') {
      applyRightTab(tab);
    }
  };

  rightTabsHost.addEventListener('click', (event) => {
    const button = event.target.closest('[data-right-tab]');
    if (!button) return;
    activateRightRailTabButton(button);
  });

  rightTabsHost.addEventListener('keydown', (event) => {
    const activeButton = event.target instanceof Element
      ? event.target.closest('[data-right-tab]')
      : null;
    if (!(activeButton instanceof HTMLElement)) return;
    const buttons = rightTabButtons.filter((button) => button instanceof HTMLElement && !button.hidden);
    const currentIndex = buttons.indexOf(activeButton);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = buttons.length - 1;
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateRightRailTabButton(activeButton);
      return;
    } else {
      return;
    }
    event.preventDefault();
    buttons[nextIndex].focus();
    activateRightRailTabButton(buttons[nextIndex]);
  });
}

if (atlasSurfaceNav) {
  atlasSurfaceNav.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-atlas-surface-button]')
      : null;
    if (!(button instanceof HTMLElement)) return;
    setCurrentAtlasSurface(button.dataset.atlasSurfaceButton || 'currentScene', { refresh: true });
  });

  atlasSurfaceNav.addEventListener('keydown', (event) => {
    const activeButton = event.target instanceof Element
      ? event.target.closest('[data-atlas-surface-button]')
      : null;
    if (!(activeButton instanceof HTMLElement)) return;
    const buttons = atlasSurfaceButtons.filter((button) => button instanceof HTMLElement && !button.hidden);
    const currentIndex = buttons.indexOf(activeButton);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = buttons.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    setCurrentAtlasSurface(buttons[nextIndex].dataset.atlasSurfaceButton || 'currentScene', {
      refresh: true,
      focus: true,
    });
  });
}

atlasCurrentSceneHost?.addEventListener('click', (event) => {
  const button = event.target instanceof Element
    ? event.target.closest('[data-atlas-mention-id]')
    : null;
  if (button instanceof HTMLElement) {
    focusAtlasMention(button.dataset.atlasMentionId || '');
    return;
  }
  const entity = event.target instanceof Element
    ? event.target.closest('[data-atlas-entity-id]')
    : null;
  if (!(entity instanceof HTMLElement)) return;
  selectAtlasEntity(entity.dataset.atlasEntityId || '');
});

atlasCurrentSceneHost?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const entity = event.target instanceof Element
    ? event.target.closest('[data-atlas-entity-id]')
    : null;
  if (!(entity instanceof HTMLElement)) return;
  event.preventDefault();
  selectAtlasEntity(entity.dataset.atlasEntityId || '');
});

atlasOverviewHost?.addEventListener('click', (event) => {
  const entity = event.target instanceof Element
    ? event.target.closest('[data-atlas-entity-id]')
    : null;
  if (entity instanceof HTMLElement) {
    selectAtlasEntity(entity.dataset.atlasEntityId || '');
    return;
  }
  const relation = event.target instanceof Element
    ? event.target.closest('[data-atlas-relation-pair-id]')
    : null;
  if (!(relation instanceof HTMLElement)) return;
  selectAtlasRelation({
    pairId: relation.dataset.atlasRelationPairId || '',
    leftEntityId: relation.dataset.atlasRelationLeftEntityId || '',
    rightEntityId: relation.dataset.atlasRelationRightEntityId || '',
  });
});

atlasOverviewHost?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const entity = event.target instanceof Element
    ? event.target.closest('[data-atlas-entity-id]')
    : null;
  if (entity instanceof HTMLElement) {
    event.preventDefault();
    selectAtlasEntity(entity.dataset.atlasEntityId || '');
    return;
  }
  const relation = event.target instanceof Element
    ? event.target.closest('[data-atlas-relation-pair-id]')
    : null;
  if (!(relation instanceof HTMLElement)) return;
  event.preventDefault();
  selectAtlasRelation({
    pairId: relation.dataset.atlasRelationPairId || '',
    leftEntityId: relation.dataset.atlasRelationLeftEntityId || '',
    rightEntityId: relation.dataset.atlasRelationRightEntityId || '',
  });
});

atlasEntityDossierHost?.addEventListener('click', (event) => {
  const relation = event.target instanceof Element
    ? event.target.closest('[data-atlas-relation-pair-id]')
    : null;
  if (!(relation instanceof HTMLElement)) return;
  selectAtlasRelation({
    pairId: relation.dataset.atlasRelationPairId || '',
    leftEntityId: relation.dataset.atlasRelationLeftEntityId || '',
    rightEntityId: relation.dataset.atlasRelationRightEntityId || '',
  });
});

atlasEntityDossierHost?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const relation = event.target instanceof Element
    ? event.target.closest('[data-atlas-relation-pair-id]')
    : null;
  if (!(relation instanceof HTMLElement)) return;
  event.preventDefault();
  selectAtlasRelation({
    pairId: relation.dataset.atlasRelationPairId || '',
    leftEntityId: relation.dataset.atlasRelationLeftEntityId || '',
    rightEntityId: relation.dataset.atlasRelationRightEntityId || '',
  });
});

atlasRelationDossierHost?.addEventListener('click', async (event) => {
  const action = event.target instanceof Element
    ? event.target.closest('[data-atlas-relation-action-id]')
    : null;
  if (!(action instanceof HTMLButtonElement)) return;
  const commandId = action.dataset.commandId || '';
  if (!isAtlasRelationReviewActionCommandId(commandId) || action.disabled) return;
  let payloadPreview = {};
  try {
    const parsed = JSON.parse(action.dataset.payloadPreview || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      payloadPreview = parsed;
    }
  } catch {}
  action.disabled = true;
  const result = await dispatchUiCommand(commandId, {
    ...payloadPreview,
    source: 'atlasRelationDossier',
    actionId: action.dataset.atlasRelationActionId || '',
    projectId: currentProjectId || atlasRelationDossierState.projectId || '',
    pairId: atlasRelationDossierState.selectedPairId || atlasSelectedRelation.pairId || '',
    leftEntityId: atlasRelationDossierState.requestedLeftEntityId || atlasSelectedRelation.leftEntityId || '',
    rightEntityId: atlasRelationDossierState.requestedRightEntityId || atlasSelectedRelation.rightEntityId || '',
    commandAuthority: 'CommandKernel',
  });
  const reason = result?.error?.reason
    || result?.value?.error?.reason
    || result?.value?.reason
    || result?.reason
    || '';
  updateStatusText(result?.ok === true
    ? `Atlas review action dispatched: ${commandId}`
    : `Atlas review action degraded: ${reason || commandId}`);
  action.disabled = false;
});

atlasHeatmapHost?.addEventListener('click', (event) => {
  const closeButton = event.target instanceof Element
    ? event.target.closest('[data-atlas-heatmap-close]')
    : null;
  if (!(closeButton instanceof HTMLButtonElement)) return;
  closeAtlasHeatmapSurface();
});

atlasContinuityLedgerHost?.addEventListener('click', handleAtlasContinuityLedgerClick);

sceneHistoryHost?.addEventListener('click', (event) => {
  const checkpointButton = event.target instanceof Element
    ? event.target.closest('[data-scene-history-checkpoint]')
    : null;
  if (checkpointButton) {
    void createSceneHistoryCheckpoint();
    return;
  }
  const restoreButton = event.target instanceof Element
    ? event.target.closest('[data-scene-history-restore]')
    : null;
  if (restoreButton) {
    void restoreSelectedSceneHistorySnapshot();
    return;
  }
  const undoButton = event.target instanceof Element
    ? event.target.closest('[data-scene-history-restore-undo]')
    : null;
  if (undoButton) {
    void undoLastSceneHistoryRestore();
    return;
  }
  const snapshotButton = event.target instanceof Element
    ? event.target.closest('[data-scene-history-snapshot]')
    : null;
  if (!(snapshotButton instanceof HTMLElement)) return;
  const snapshotId = snapshotButton.dataset.sceneHistorySnapshot || '';
  if (!snapshotId) return;
  sceneHistoryState = { ...sceneHistoryState, selectedSnapshotId: snapshotId };
  void refreshSceneHistory(snapshotId);
});

if (leftSearchInput) {
  leftSearchInput.addEventListener('input', () => {
    if (currentLeftTab === 'search') {
      renderSearchResults(leftSearchInput.value);
    }
  });
}

projectSearchScopeSelect?.addEventListener('change', () => {
  if (currentLeftTab === 'search') {
    renderSearchResults(leftSearchInput ? leftSearchInput.value : '');
  }
});

projectSearchCaseCheckbox?.addEventListener('change', () => {
  if (currentLeftTab === 'search') {
    renderSearchResults(leftSearchInput ? leftSearchInput.value : '');
  }
});

projectSearchWholeWordCheckbox?.addEventListener('change', () => {
  if (currentLeftTab === 'search') {
    renderSearchResults(leftSearchInput ? leftSearchInput.value : '');
  }
});

searchResultsElement?.addEventListener('click', (event) => {
  const target = event.target instanceof Element
    ? event.target.closest('[data-search-result-id]')
    : null;
  if (!target) return;
  void activateProjectSearchResult(target.dataset.searchResultId || '');
});

projectSearchResultsElement?.addEventListener('click', (event) => {
  const replaceAllTarget = event.target instanceof Element
    ? event.target.closest('[data-project-search-replace-all]')
    : null;
  if (replaceAllTarget) {
    event.preventDefault();
    void replaceVisibleProjectSearchResults();
    return;
  }
  const replaceTarget = event.target instanceof Element
    ? event.target.closest('[data-replace-search-result-id]')
    : null;
  if (replaceTarget) {
    event.preventDefault();
    void replaceProjectSearchResult(replaceTarget.dataset.replaceSearchResultId || '');
    return;
  }
  const target = event.target instanceof Element
    ? event.target.closest('[data-search-result-id]')
    : null;
  if (!target) return;
  void activateProjectSearchResult(target.dataset.searchResultId || '');
});

if (settingsThemeSelect) {
  settingsThemeSelect.addEventListener('change', () => {
    const nextTheme = settingsThemeSelect.value === 'dark' ? 'dark' : 'light';
    void dispatchUiCommand(UI_COMMAND_IDS.THEME_SET, { theme: nextTheme });
    renderSettingsAggregation();
  });
}

if (settingsWrapSelect) {
  settingsWrapSelect.addEventListener('change', () => {
    const enabled = settingsWrapSelect.value !== 'off';
    applyWordWrap(enabled);
    updateInspectorSnapshot();
    renderSettingsAggregation();
  });
}

settingsCloseButtons.forEach((button) => {
  button.addEventListener('click', () => closeSimpleModal(settingsModal));
});
if (commandPaletteSearchInput) {
  commandPaletteSearchInput.addEventListener('input', () => {
    renderCommandPaletteList(commandPaletteSearchInput.value);
  });
}
if (commandPaletteList) {
  commandPaletteList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-command-palette-command-id]');
    if (!button) return;
    void runCommandPaletteAction(button.dataset.commandPaletteCommandId || '');
  });
}
commandPaletteCloseButtons.forEach((button) => {
  button.addEventListener('click', () => closeSimpleModal(commandPaletteModal));
});
recoveryCloseButtons.forEach((button) => {
  button.addEventListener('click', () => closeSimpleModal(recoveryModal));
});
exportPreviewCancelButtons.forEach((button) => {
  button.addEventListener('click', () => closeSimpleModal(exportPreviewModal));
});
exportPreviewConfirmButtons.forEach((button) => {
  button.addEventListener('click', () => {
    void confirmExportPreviewAndRun();
  });
});
exportSurfaceCloseButtons.forEach((button) => {
  button.addEventListener('click', () => closeExportSurfaceModal());
});
exportSurfaceFormatButtons.forEach((button) => {
  const runExportSurfaceButtonFormat = () => {
    void runExportSurfaceFormat(button.dataset.exportSurfaceFormat || '');
  };
  button.addEventListener('click', () => {
    runExportSurfaceButtonFormat();
  });
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    event.preventDefault();
    runExportSurfaceButtonFormat();
  });
});
selectedScenesTxtExportCancelButtons.forEach((button) => {
  button.addEventListener('click', () => closeSelectedScenesTxtExportModal());
});
selectedScenesTxtExportConfirmButtons.forEach((button) => {
  button.addEventListener('click', () => {
    void confirmSelectedScenesTxtExportAndRun();
  });
});
importSurfaceCloseButtons.forEach((button) => {
  button.addEventListener('click', () => closeImportSurfaceModal());
});
importSurfaceFormatButtons.forEach((button) => {
  const runImportSurfaceButtonFormat = () => {
    void runImportSurfaceFormat(button.dataset.importSurfaceFormat || '');
  };
  button.addEventListener('click', () => {
    runImportSurfaceButtonFormat();
  });
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    event.preventDefault();
    runImportSurfaceButtonFormat();
  });
});
docxImportPreviewCancelButtons.forEach((button) => {
  button.addEventListener('click', () => closeDocxImportPreviewModal());
});
docxImportPreviewConfirmButtons.forEach((button) => {
  button.addEventListener('click', () => {
    void confirmDocxImportPreviewAndRun();
  });
});
diagnosticsCloseButtons.forEach((button) => {
  button.addEventListener('click', () => closeSimpleModal(diagnosticsModal));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && configuratorPanel && !configuratorPanel.hidden) {
    event.preventDefault();
    setConfiguratorOpen(false);
    return;
  }
  if (event.key === 'Escape' && leftRailOverlayOpen) {
    event.preventDefault();
    event.stopPropagation();
    setLeftRailOverlayOpen(false);
    return;
  }
  if (event.key === 'Escape' && rightRailOverlayOpen) {
    event.preventDefault();
    event.stopPropagation();
    setRightRailOverlayOpen(false);
    return;
  }
  if (event.key === 'Tab' && leftRailOverlayOpen) {
    const focusable = getLeftRailOverlayFocusableElements();
    if (focusable.length > 0) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sidebar?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
    return;
  }
  if (event.key === 'Tab' && rightRailOverlayOpen) {
    const focusable = getRightRailOverlayFocusableElements();
    if (focusable.length > 0) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !rightSidebar?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (document.activeElement === last || !rightSidebar?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
    return;
  }
  if (flowModeState.active && event.altKey && event.key === 'Enter') {
    event.preventDefault();
    void jumpToFlowProjectionSourceAtCaret();
    return;
  }
  const isPrimaryModifier = isMac ? event.metaKey : event.ctrlKey;
  if (!isPrimaryModifier || event.altKey) {
    return;
  }

  const { key, code } = event;
  const isPlus =
    ['+', '=', 'Add'].includes(key) || code === 'Equal' || code === 'NumpadAdd';
  const isMinus =
    ['-'].includes(key) || code === 'Minus' || code === 'NumpadSubtract';
  const isZero =
    key === '0' || code === 'Digit0' || code === 'Numpad0';

  if (!isPlus && !isMinus && !isZero) {
    if ((key === 'N' || key === 'n') && !event.shiftKey) {
      event.preventDefault();
      void dispatchUiCommand(EXTRA_COMMAND_IDS.PROJECT_NEW);
      return;
    }
    if ((key === 'O' || key === 'o') && !event.shiftKey) {
      event.preventDefault();
      void dispatchUiCommand(COMMAND_IDS.PROJECT_OPEN);
      return;
    }
    if ((key === 'S' || key === 's') && !event.shiftKey) {
      event.preventDefault();
      if (flowModeState.active) {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.PLAN_FLOW_SAVE);
      } else {
        void dispatchUiCommand(COMMAND_IDS.PROJECT_SAVE);
      }
      return;
    }
    if ((key === 'S' || key === 's') && event.shiftKey && !flowModeState.active) {
      event.preventDefault();
      void dispatchUiCommand(EXTRA_COMMAND_IDS.PROJECT_SAVE_AS);
      return;
    }
    if ((key === 'Z' || key === 'z') && !event.shiftKey) {
      event.preventDefault();
      void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_UNDO);
      return;
    }
    if ((key === 'Z' || key === 'z') && event.shiftKey) {
      event.preventDefault();
      void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_REDO);
      return;
    }
    if ((key === 'Y' || key === 'y') && !event.shiftKey) {
      event.preventDefault();
      void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_REDO);
      return;
    }
    if ((key === 'F' || key === 'f') && !event.shiftKey) {
      event.preventDefault();
      void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_FIND);
      return;
    }
    if ((key === 'H' || key === 'h') && !event.shiftKey) {
      event.preventDefault();
      void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_REPLACE);
      return;
    }
    if ((key === 'E' || key === 'e') && event.shiftKey) {
      event.preventDefault();
      void dispatchUiCommand(COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN);
      return;
    }
    if ((key === 'I' || key === 'i') && event.shiftKey) {
      event.preventDefault();
      openImportSurfaceModal();
      return;
    }
    if ((key === 'M' || key === 'm') && event.shiftKey) {
      event.preventDefault();
      void dispatchUiCommand(EXTRA_COMMAND_IDS.REVIEW_EXPORT_MARKDOWN);
      return;
    }
    if ((key === 'F' || key === 'f') && event.shiftKey) {
      event.preventDefault();
      void dispatchUiCommand(EXTRA_COMMAND_IDS.INSERT_FLOW_OPEN);
      return;
    }
    if ((key === 'K' || key === 'k') && event.shiftKey) {
      event.preventDefault();
      void dispatchUiCommand(EXTRA_COMMAND_IDS.INSERT_ADD_CARD);
      return;
    }
    if ((key === 'S' || key === 's') && event.shiftKey && flowModeState.active) {
      event.preventDefault();
      void dispatchUiCommand(EXTRA_COMMAND_IDS.PLAN_FLOW_SAVE);
      return;
    }
    return;
  }

  event.preventDefault();
  if (isPlus) {
    void dispatchUiCommand(EXTRA_COMMAND_IDS.VIEW_ZOOM_IN);
    return;
  }
  if (isMinus) {
    void dispatchUiCommand(EXTRA_COMMAND_IDS.VIEW_ZOOM_OUT);
    return;
  }
  if (isZero) {
    setEditorZoom(EDITOR_ZOOM_DEFAULT);
  }
}, true);
document.addEventListener('selectionchange', syncAlignmentButtonsToSelection);
document.addEventListener('selectionchange', syncToolbarFormattingState);

window.addEventListener('resize', () => {
  updateSpatialLayoutForViewportChange();
  scheduleLayoutRefresh();
  scheduleCentralSheetStripProofRefresh();
});

if (window.electronAPI) {
  window.electronAPI.onEditorSetText((payload) => {
    const content = typeof payload === 'string' ? payload : payload?.content || '';
    const title = typeof payload === 'object' && payload ? payload.title : '';
    const hasDocumentId = typeof payload === 'object' && payload && Object.prototype.hasOwnProperty.call(payload, 'documentId');
    const hasKind = typeof payload === 'object' && payload && Object.prototype.hasOwnProperty.call(payload, 'kind');
    const hasProjectId = typeof payload === 'object' && payload && Object.prototype.hasOwnProperty.call(payload, 'projectId');
    const hasBookProfile = typeof payload === 'object' && payload && Object.prototype.hasOwnProperty.call(payload, 'bookProfile');
    const documentId = hasDocumentId && typeof payload.documentId === 'string' ? payload.documentId : '';
    const kind = hasKind ? payload.kind : '';
    const projectId = hasProjectId && typeof payload.projectId === 'string' ? payload.projectId : '';
    const bookProfile = hasBookProfile ? payload.bookProfile : null;
    const incomingSelectionRange = typeof payload === 'object' && payload && payload.selectionRange
      && typeof payload.selectionRange === 'object' && !Array.isArray(payload.selectionRange)
      && Number.isFinite(Number(payload.selectionRange.start))
      && Number.isFinite(Number(payload.selectionRange.end))
      ? {
        start: Math.max(0, Math.floor(Number(payload.selectionRange.start))),
        end: Math.max(0, Math.floor(Number(payload.selectionRange.end))),
      }
      : null;
    const nextMetaEnabled = typeof payload === 'object' && payload ? Boolean(payload.metaEnabled) : false;
    const shouldRevealActiveDocument = isProjectTreeDocumentId(documentId) && (
      activeDocumentRevealRequested || documentId !== currentDocumentId
    );

    clearFlowModeState();
    clearPendingMetadataUpdate();
    currentMetadataBaselineHash = '';
    metadataUpdatePending = false;
    metaEnabled = nextMetaEnabled;
    if (hasDocumentId) {
      currentDocumentId = documentId || null;
    } else if (hasKind || hasProjectId) {
      currentDocumentId = null;
    }
    if (hasKind) {
      currentDocumentKind = kind || null;
    }
    if (hasProjectId) {
      const nextProjectId = normalizeProjectId(projectId);
      if (nextProjectId !== currentProjectId) {
        currentProjectId = nextProjectId;
        expandedNodesByTab = new Map();
        navigatorSelectionState = createNavigatorSelectionState(currentProjectId);
        restoreSpatialLayoutState(currentProjectId);
        adoptToolbarConfiguratorState(currentProjectId);
      }
    }
    if (hasBookProfile) {
      applyIncomingBookProfile(bookProfile);
    } else {
      applyIncomingBookProfile(null);
    }
    setReviewSurfaceState(reviewSurfaceResolveIncomingPayload(payload));

    const parsed = parseDocumentContent(content);
    currentMeta = parsed.meta;
    currentCards = parsed.cards;
    plainTextBuffer = parsed.text || '';
    const useLargePayloadFastPath = !parsed.doc && shouldUseCentralSheetLargePayloadFastPath(parsed.text || '');
    if (useLargePayloadFastPath) {
      beginCentralSheetLargePayloadFastPath(parsed.text || '');
      parsed.doc = buildLargeSingleParagraphPresentationDoc(parsed.text || '');
    } else {
      clearCentralSheetLargePayloadFastPath();
    }
    if (isTiptapMode) {
      resetCentralSheetStripForIncomingPayload();
      setTiptapDocumentSnapshot({
        doc: parsed.doc,
        text: parsed.text || '',
      });
      resetCentralSheetStripForIncomingPayload();
      if (useLargePayloadFastPath) {
        applyEstimatedCentralSheetStripRuntimeStateFromText(parsed.text || '');
        scheduleCentralSheetStripProofRefresh({ scrollOnly: true });
      }
    } else {
      setPlainText(parsed.text || '');
    }
    if (parsed.issue) {
      handleDocumentContentParseIssue(parsed.issue);
    }
    updateMetaInputs();
    updateMetaVisibility();
    updateCardsList();

    localDirty = false;
    updateWordCount();
    if (!useLargePayloadFastPath) {
      scheduleCentralSheetStripProofRefresh();
    }
    if (incomingSelectionRange) {
      requestAnimationFrame(() => {
        setSelectionRange(incomingSelectionRange.start, incomingSelectionRange.end);
      });
    }

    const resolvedTitle = title || '';
    if (resolvedTitle) {
      showEditorPanelFor(resolvedTitle);
    }
    const revealResult = shouldRevealActiveDocument
      ? revealActiveDocumentAncestors({ persist: true })
      : { found: false };
    renderTree({
      revealActive: revealResult.found,
      restoreEditorFocus: revealResult.found && Boolean(resolvedTitle),
    });
    activeDocumentRevealRequested = shouldRevealActiveDocument && !revealResult.found;
    updateSaveStateText('loaded');
    updatePerfHintText('normal');
    updateInspectorSnapshot();
    refreshMetadataInspector();
    if (currentRightTab === 'history') {
      refreshSceneHistory('');
    }
    if (currentRightTab === 'atlas') {
      renderAtlasJourneyState();
      refreshManualMapWorkbench();
      refreshProjectionInspector();
      refreshAtlasOverview();
      refreshAtlasEntityDossier();
      refreshAtlasRelationDossier();
      refreshAtlasMatrices();
      refreshAtlasReportsSavedQueries();
      refreshAtlasDiagnosticsStageAcceptance();
      refreshAtlasCurrentScene();
    }
    applyPendingProjectSearchJump(currentDocumentId || '');
  });

  window.electronAPI.onEditorTextRequest(({ requestId }) => {
    window.electronAPI.sendEditorTextResponse(requestId, composeDocumentContent());
  });

  if (typeof window.electronAPI.onEditorSnapshotRequest === 'function') {
    window.electronAPI.onEditorSnapshotRequest(({ requestId }) => {
      window.electronAPI.sendEditorSnapshotResponse(requestId, composeEditorSnapshot());
    });
  }

  window.electronAPI.onEditorSetFontSize(({ px }) => {
    if (Number.isFinite(px)) {
      editor.style.fontSize = `${px}px`;
      setCurrentFontSize(px);
      renderStyledView(getPlainText());
      scheduleCentralSheetStripProofRefresh();
    }
  });

  if (typeof window.electronAPI.onRecoveryRestored === 'function') {
    window.electronAPI.onRecoveryRestored((payload) => {
      const message = payload && typeof payload.message === 'string'
        ? payload.message
        : 'Recovered from autosave';
      updateWarningStateText('recovery restored');
      if (recoveryMessage) {
        recoveryMessage.textContent = message;
      }
      updateInspectorSnapshot();
    });
  }

  function handleCanonicalRuntimeCommandId(commandId, runtimePayload = null) {
    const payload = runtimePayload && typeof runtimePayload === 'object' && !Array.isArray(runtimePayload)
      ? runtimePayload
      : {};
    if (commandId === EXTRA_COMMAND_IDS.VIEW_OPEN_SETTINGS) {
      openSettingsModal();
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.VIEW_SAFE_RESET) {
      performSafeResetShell();
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.VIEW_RESTORE_LAST_STABLE) {
      performRestoreLastStableShell();
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.TOOLS_OPEN_DIAGNOSTICS) {
      openDiagnosticsModal();
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.REVIEW_OPEN_RECOVERY) {
      openRecoveryModal('Recovery modal opened from menu');
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.REVIEW_OPEN_COMMENTS) {
      void handleReviewOpenComments();
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.INSERT_ADD_CARD) {
      handleInsertAddCard();
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.FORMAT_ALIGN_LEFT) {
      void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_ALIGN_LEFT);
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.EDIT_UNDO) {
      void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_UNDO);
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.EDIT_REDO) {
      void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_REDO);
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.EDIT_FIND) {
      void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_FIND);
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.EDIT_REPLACE) {
      void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_REPLACE);
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.PLAN_SWITCH_MODE) {
      applyMode('plan');
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.REVIEW_SWITCH_MODE) {
      applyMode('review');
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.WINDOW_SWITCH_MODE_WRITE) {
      applyMode('write');
      return true;
    }
    if (commandId === COMMAND_IDS.PROJECT_IMPORT_DOCX_V1) {
      openImportSurfaceModal(commandId);
      return true;
    }
    if (commandId === COMMAND_IDS.PROJECT_IMPORT_TXT_V1) {
      openImportSurfaceModal(commandId);
      return true;
    }
    if (commandId === COMMAND_IDS.PROJECT_IMPORT_MARKDOWN_V1) {
      openImportSurfaceModal(commandId);
      return true;
    }
    if (commandId === COMMAND_IDS.PROJECT_IMPORT_FULL_ARCHIVE_V1) {
      openImportSurfaceModal(commandId);
      return true;
    }
    if (commandId === COMMAND_IDS.PROJECT_EXPORT_PDF_V1) {
      openExportSurfaceModal(commandId);
      return true;
    }
    if (commandId === COMMAND_IDS.PROJECT_EXPORT_FULL_ARCHIVE_V1) {
      openExportSurfaceModal(commandId);
      return true;
    }
    if (commandId === COMMAND_IDS.PROJECT_EXPORT_MARKDOWN_V1) {
      openExportSurfaceModal(commandId);
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.PROJECT_EXPORT_CURRENT_SCENE_TXT) {
      openExportSurfaceModal(commandId);
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.PROJECT_EXPORT_SELECTED_SCENES_TXT) {
      openExportSurfaceModal(commandId);
      return true;
    }
    if (commandId === EXTRA_COMMAND_IDS.PROJECT_EXPORT_ALL_SCENES_TXT) {
      openExportSurfaceModal(commandId);
      return true;
    }
    if (commandId === BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID) {
      openExportSurfaceModal(commandId);
      return true;
    }
    if (commandId === COMMAND_IDS.PROJECT_EXPORT_DOCX_MIN && payload.preview === true) {
      openExportSurfaceModal(commandId);
      return true;
    }
    return false;
  }

  if (isTiptapMode) {
    setTiptapRuntimeHandlers({
      openSettings: () => openSettingsModal(),
      safeResetShell: () => performSafeResetShell(),
      restoreLastStableShell: () => performRestoreLastStableShell(),
      openDiagnostics: () => openDiagnosticsModal(),
      openRecovery: () => openRecoveryModal('Recovery modal opened from menu'),
      openExportPreview: () => openExportPreviewModal(),
      openImportSurface: (commandId = '') => openImportSurfaceModal(commandId),
      openExportSurface: (commandId = '') => openExportSurfaceModal(commandId),
      insertAddCard: () => handleInsertAddCard(),
      find: () => {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_FIND);
      },
      replace: () => {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_REPLACE);
      },
      setPreviewFormat: (formatId) => setActiveBookProfileFormat(formatId),
      setPreviewOrientation: (orientation) => setActiveBookProfileOrientation(orientation),
      togglePreview: () => handleToggleLayoutPreview(),
      togglePreviewFrame: () => handleToggleLayoutPreviewFrame(),
      formatAlignLeft: () => {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_ALIGN_LEFT);
      },
      formatToggleBold: () => {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_TOGGLE_BOLD);
      },
      formatToggleItalic: () => {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_TOGGLE_ITALIC);
      },
      formatTextColorPicker: (_commandId, payload = {}) => handleFormatTextColorPicker(payload),
      formatHighlightColorPicker: (_commandId, payload = {}) => handleFormatHighlightColorPicker(payload),
      insertLinkPrompt: (_commandId, payload = {}) => handleInsertLinkPrompt(payload),
      listToggleBullet: () => {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.LIST_TOGGLE_BULLET);
      },
      listToggleOrdered: () => {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.LIST_TOGGLE_ORDERED);
      },
      listClear: () => {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.LIST_CLEAR);
      },
      reviewImportLocalPacket: () => handleReviewImportLocalPacket(),
      reviewOpenComments: () => handleReviewOpenComments(),
      reviewClearSession: () => handleReviewClearSession(),
      reviewCancelOperation: (payload = {}) => handleReviewCancelOperation(payload),
      switchMode: (mode) => applyMode(mode),
    });
  } else if (typeof window.electronAPI.onRuntimeCommand === 'function') {
    window.electronAPI.onRuntimeCommand((payload) => {
      const commandId = payload && typeof payload.commandId === 'string' ? payload.commandId : '';
      const command = payload && typeof payload.command === 'string' ? payload.command : '';
      const commandPayload = payload && payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload)
        ? payload.payload
        : null;
      if (handleCanonicalRuntimeCommandId(commandId, commandPayload)) {
      } else if (command === 'open-settings') {
        openSettingsModal();
      } else if (command === 'safe-reset-shell') {
        performSafeResetShell();
      } else if (command === 'restore-last-stable-shell') {
        performRestoreLastStableShell();
      } else if (command === 'open-diagnostics') {
        openDiagnosticsModal();
      } else if (command === 'open-recovery') {
        openRecoveryModal('Recovery modal opened from menu');
      } else if (command === 'open-export-preview') {
        openExportPreviewModal();
      } else if (command === 'insert-add-card') {
        handleInsertAddCard();
      } else if (command === 'format-align-left') {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.FORMAT_ALIGN_LEFT);
      } else if (command === 'undo' || command === 'edit-undo') {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_UNDO);
      } else if (command === 'redo' || command === 'edit-redo') {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_REDO);
      } else if (command === 'search') {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_FIND);
      } else if (command === 'replace') {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.EDIT_REPLACE);
      } else if (command === 'switch-preview-format-a4') {
        void dispatchUiCommand(PREVIEW_FORMAT_COMMAND_IDS.A4);
      } else if (command === 'switch-preview-format-a5') {
        void dispatchUiCommand(PREVIEW_FORMAT_COMMAND_IDS.A5);
      } else if (command === 'switch-preview-format-letter') {
        void dispatchUiCommand(PREVIEW_FORMAT_COMMAND_IDS.LETTER);
      } else if (command === 'switch-preview-orientation-portrait') {
        void dispatchUiCommand(PREVIEW_ORIENTATION_COMMAND_IDS.PORTRAIT);
      } else if (command === 'switch-preview-orientation-landscape') {
        void dispatchUiCommand(PREVIEW_ORIENTATION_COMMAND_IDS.LANDSCAPE);
      } else if (command === 'toggle-preview') {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.VIEW_TOGGLE_PREVIEW);
      } else if (command === 'toggle-preview-frame') {
        void dispatchUiCommand(EXTRA_COMMAND_IDS.VIEW_TOGGLE_PREVIEW_FRAME);
      } else if (command === 'switch-mode-plan') {
        applyMode('plan');
      } else if (command === 'switch-mode-review') {
        applyMode('review');
      } else if (command === 'switch-mode-write') {
        applyMode('write');
      }
    });
  }
}

if (isTiptapMode) {
  editor.addEventListener('keydown', (event) => {
    if (event.isComposing) {
      return;
    }
    const key = typeof event.key === 'string' ? event.key : '';
    if (centralSheetStripLargePayloadFastPathActive && key === 'Enter') {
      blockCentralSheetLargePayloadStructuralEdit(event);
      finishCentralSheetStripStructuralTransition();
      return;
    }
    const normalizedKey = key.toLowerCase();
    const isPrimaryModifier = isMac ? event.metaKey : event.ctrlKey;
    const isUndoRedoKey = isPrimaryModifier && !event.altKey && normalizedKey === 'z';
    const isStructuralKey = (
      key === 'Enter'
      || key === 'Backspace'
      || key === 'Delete'
      || isUndoRedoKey
    );
    if (!isStructuralKey) {
      return;
    }
    beginCentralSheetStripStructuralTransition();
  });
  editor.addEventListener('beforeinput', (event) => {
    const inputType = typeof event.inputType === 'string' ? event.inputType : '';
    if (
      centralSheetStripLargePayloadFastPathActive
      && isCentralSheetLargePayloadBlockedInputType(inputType)
    ) {
      blockCentralSheetLargePayloadStructuralEdit(event);
      centralSheetStripPendingStructuralInput = false;
      finishCentralSheetStripStructuralTransition();
      return;
    }
    centralSheetStripPendingStructuralInput = (
      inputType === 'insertParagraph'
      || inputType === 'insertLineBreak'
      || inputType === 'historyUndo'
      || inputType === 'historyRedo'
      || inputType === 'insertFromPaste'
      || inputType === 'deleteContentBackward'
      || inputType === 'deleteContentForward'
    );
    if (centralSheetStripPendingStructuralInput) {
      beginCentralSheetStripStructuralTransition();
    }
  });
  editor.addEventListener('paste', (event) => {
    if (shouldBlockCentralSheetLargePayloadPaste(event)) {
      blockCentralSheetLargePayloadStructuralEdit(event);
      finishCentralSheetStripStructuralTransition();
      return;
    }
    beginCentralSheetStripStructuralTransition();
  });
  editor.addEventListener('input', () => {
    const needsPostStructuralRefresh = centralSheetStripPendingStructuralInput;
    scheduleIncrementalInputDomSync();
    syncPlainTextBufferFromEditorDom();
    scheduleDeferredHotpathRender({ includePagination: false, preserveSelection: true });
    scheduleDeferredPaginationRefresh();
    if (needsPostStructuralRefresh) {
      scheduleCentralSheetStripProofRefresh();
      scheduleCentralSheetStripPostStructuralRefresh();
    } else {
      scheduleCentralSheetStripProofRefresh();
    }
    markAsModified();
    scheduleWordCountRefresh(plainTextBuffer);
  });
} else {
  editor.addEventListener('pointerdown', (event) => {
    const nextIndex = getPageIndexFromNode(event.target);
    lastPointerDownPageIndex = nextIndex != null ? nextIndex : -1;
  });

  editor.addEventListener('beforeinput', (event) => {
    if (event.isComposing || event.inputType === 'insertCompositionText' || event.inputType === 'deleteCompositionText') {
      return;
    }
    ensureCaretInLastPointerPage();
  });

  editor.addEventListener('compositionstart', () => {
    legacyCompositionActive = true;
    legacyCompositionRenderPending = false;
    cancelDeferredRenderWork();
  });

  editor.addEventListener('compositionend', () => {
    legacyCompositionActive = false;
    window.requestAnimationFrame(() => {
      if (legacyCompositionRenderPending) {
        flushLegacyCompositionRender();
      }
    });
  });

  editor.addEventListener('input', () => {
    scheduleIncrementalInputDomSync();
    syncPlainTextBufferFromEditorDom();
    if (legacyCompositionActive) {
      legacyCompositionRenderPending = true;
      return;
    }
    scheduleDeferredHotpathRender({ includePagination: false, preserveSelection: true });
    scheduleDeferredPaginationRefresh();
    markAsModified();
    updateWordCount();
  });

  editor.addEventListener('paste', (event) => {
    ensureCaretInLastPointerPage();
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    if (text) {
      document.execCommand('insertText', false, text);
    }
  });

  editor.addEventListener('keydown', (event) => {
    if (event.isComposing || legacyCompositionActive) {
      return;
    }

    if (flowModeState.active) {
      const { start, end } = getSelectionOffsets();
      const hasCollapsedSelection = start === end;
      if (hasCollapsedSelection && event.key === 'ArrowDown') {
        const nextCaret = nextSceneCaretAtBoundary(getPlainText(), start);
        if (Number.isInteger(nextCaret)) {
          event.preventDefault();
          setSelectionRange(nextCaret, nextCaret);
          return;
        }
      }
      if (hasCollapsedSelection && event.key === 'ArrowUp') {
        const prevCaret = previousSceneCaretAtBoundary(getPlainText(), start);
        if (Number.isInteger(prevCaret)) {
          event.preventDefault();
          setSelectionRange(prevCaret, prevCaret);
          return;
        }
      }
      if (hasCollapsedSelection && event.key === 'Backspace') {
        const prevCaret = previousSceneCaretAtBoundary(getPlainText(), start);
        if (Number.isInteger(prevCaret)) {
          event.preventDefault();
          setSelectionRange(prevCaret, prevCaret);
          return;
        }
      }
    }

    if (event.key === 'Enter') {
      ensureCaretInLastPointerPage();
      event.preventDefault();
      const { start, end } = getSelectionOffsets();
      const text = getPlainText();
      const normalizedStart = Math.max(0, Math.min(start, text.length));
      const normalizedEnd = Math.max(0, Math.min(end, text.length));
      const nextText = `${text.slice(0, normalizedStart)}\n${text.slice(normalizedEnd)}`;
      setPlainText(nextText);
      setSelectionRange(normalizedStart + 1, normalizedStart + 1);
      markAsModified();
      updateWordCount();
    }
  });
}

if (window.electronAPI) {
  window.electronAPI.onStatusUpdate((status) => {
    updateStatusText(status);
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('восстановлено') || normalized.includes('recovery')) {
      updateWarningStateText('recovery');
    } else if (normalized.includes('ошибка') || normalized.includes('error')) {
      updateWarningStateText('error');
    } else {
      updateWarningStateText('none');
    }
    updatePerfHintText('normal');
    updateInspectorSnapshot();
  });

  window.electronAPI.onSetDirty((state) => {
    localDirty = state;
    updateSaveStateText(localDirty ? 'unsaved' : 'saved');
    updateInspectorSnapshot();
  });
}

setCurrentFontSize(currentFontSizePx);
applyDesignOsRuntimeWiring();
updateWordCount();
if (isTiptapMode) {
  scheduleCentralSheetStripProofRefresh();
}
