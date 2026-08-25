export const AUTHORING_SURFACES_SURFACE_ID = 'authoring.surfaces.v1';

export const AUTHORING_SURFACES_FEATURE_MANIFEST_SCHEMA = 'FEATURE_INTEGRATION_MANIFEST_V1';
export const AUTHORING_SURFACES_SURFACE_MANIFEST_SCHEMA = 'SURFACE_MANIFEST_V1';

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u;
const ABSOLUTE_PATH_PATTERN = /(?:[A-Za-z]:[\\/]|\/(?:Applications|Library|Network|System|Users|Volumes|etc|home|mnt|opt|private|tmp|var)\/)[^\s,;)"']+/gu;

const ACTION_BINDINGS = Object.freeze({
  'open-authoring-write': Object.freeze({ commandId: '', queryId: '' }),
  'open-current-scene': Object.freeze({ commandId: '', queryId: '' }),
  'open-flow-mode': Object.freeze({
    commandId: 'cmd.project.insert.flowOpen',
    queryId: '',
  }),
  'open-authoring-notes': Object.freeze({
    commandId: '',
    queryId: 'query.projectNotes',
  }),
  'open-authoring-search': Object.freeze({
    commandId: '',
    queryId: 'query.projectSearch',
  }),
  'review-open-comments': Object.freeze({
    commandId: 'cmd.project.review.openComments',
    queryId: 'query.reviewSurface',
  }),
  'toggle-configurator': Object.freeze({ commandId: '', queryId: '' }),
});

const AUTHORING_SURFACES_COMMAND_IDS = Object.freeze([
  'cmd.project.insert.flowOpen',
  'cmd.project.review.openComments',
]);

const AUTHORING_SURFACES_QUERY_IDS = Object.freeze([
  'query.projectNotes',
  'query.projectSearch',
  'query.reviewSurface',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nextValue of Object.values(value)) {
    deepFreeze(nextValue);
  }
  return value;
}

export const AUTHORING_SURFACES_SURFACE_MANIFEST_V1 = deepFreeze({
  schemaVersion: AUTHORING_SURFACES_SURFACE_MANIFEST_SCHEMA,
  surfaceKey: 'authoringSurfaces',
  surfaceId: AUTHORING_SURFACES_SURFACE_ID,
  surfaceKind: 'EDITOR_WORKSPACE_STRIP',
  slotId: 'workspace.write.editor.authoringSurfaces',
  hostKind: 'editorPanel',
  commandIds: AUTHORING_SURFACES_COMMAND_IDS,
  queryIds: AUTHORING_SURFACES_QUERY_IDS,
  stateClasses: [
    'AUTHORING_WORKING_STATE',
    'PROJECT_STATE',
    'DERIVED_STATE',
    'SHELL_STATE',
  ],
  directProductMutation: false,
  runtimeNetwork: false,
  fallbackSurface: 'HIDDEN_WHEN_NO_ACTIVE_EDITOR; DISABLED_WHEN_CAPABILITY_UNAVAILABLE',
});

export const AUTHORING_SURFACES_FEATURE_INTEGRATION_MANIFEST_V1 = deepFreeze({
  schemaVersion: AUTHORING_SURFACES_FEATURE_MANIFEST_SCHEMA,
  featureId: 'yalken.writer.authoringSurfaces.v1',
  featureVersion: '1.0.0',
  domainOwner: 'Design OS computed interface form',
  authoritativeData: 'NONE; renderer consumes existing revision-bound read models',
  derivedData: 'Transient authoring surface projection only',
  commandIds: AUTHORING_SURFACES_COMMAND_IDS,
  queryIds: AUTHORING_SURFACES_QUERY_IDS,
  productProjectionIds: [AUTHORING_SURFACES_SURFACE_ID],
  capabilityIds: [
    'cap.project.insert.flowOpen',
    'cap.project.review.openComments',
  ],
  authorityMap: {
    productTruth: 'Product Core remains authoritative for project and manuscript state.',
    commandAuthority: 'Command Kernel revalidates Flow and Review command intents at dispatch.',
    designAuthority: 'Design OS owns placement and read-only computed form only.',
  },
  writePath: 'Surface intent -> existing UI dispatcher -> Command Kernel; no direct persistence.',
  readPath: 'Existing workspace queries and renderer working state -> immutable projection -> renderer.',
  requiredProductPorts: ['WorkspaceQueryPort', 'ProductCommandDispatchPort'],
  requiredDesignOsPorts: ['CommandDispatchPort', 'DomainProjectionPort', 'ShellProjectionPort'],
  adapterRequirements: ['renderer-adapter:authoring-surfaces-editor-strip'],
  surfaceManifests: [AUTHORING_SURFACES_SURFACE_MANIFEST_V1],
  supportedWorkspaces: ['WRITE', 'REVIEW'],
  platformAvailability: {
    macos: 'active',
    windows: 'parity-required',
    linux: 'parity-required',
    web: 'inactive',
    mobile: 'inactive',
  },
  accessibilityRequirements: ['keyboard-buttons', 'visible-focus', 'disabled-state', 'responsive-wrap'],
  fallbacks: ['no-active-editor-hidden', 'missing-project-actions-disabled', 'missing-projection-hidden'],
  stateClasses: [
    'AUTHORING_WORKING_STATE',
    'PROJECT_STATE',
    'DERIVED_STATE',
    'SHELL_STATE',
  ],
  persistenceClass: 'NONE',
  recovery: 'Existing Product Core recovery remains authoritative; this surface is rebuildable.',
  rollback: 'Remove the projection, renderer adapter and editor host; existing commands remain canonical.',
  performanceBudget: 'O(1) bounded projection with at most eight rendered surface items.',
  securityBoundary: 'No storage, IPC, network, path or private command-bus authority.',
  negativeBypassChecks: [
    'unknown-action-fails-closed',
    'action-command-mismatch-cannot-create-authority',
    'unknown-query-cannot-create-authority',
    'direct-product-mutation-denied',
    'runtime-network-denied',
  ],
  currentReality: 'WP301 composes existing Writer actions and queries into a read-only authoring strip.',
});

function sameStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const normalized = [...new Set(actual.filter((value) => typeof value === 'string'))].sort();
  return normalized.length === expected.length
    && normalized.every((value, index) => value === [...expected].sort()[index]);
}

export function validateAuthoringSurfacesFeatureManifest(
  manifest = AUTHORING_SURFACES_FEATURE_INTEGRATION_MANIFEST_V1,
) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return deepFreeze({ ok: false, code: 'E_WP301_MANIFEST_OBJECT_REQUIRED' });
  }
  if (manifest.schemaVersion !== AUTHORING_SURFACES_FEATURE_MANIFEST_SCHEMA) {
    return deepFreeze({ ok: false, code: 'E_WP301_MANIFEST_SCHEMA' });
  }
  if (!sameStringSet(manifest.commandIds, AUTHORING_SURFACES_COMMAND_IDS)) {
    return deepFreeze({ ok: false, code: 'E_WP301_MANIFEST_COMMAND_BOUNDARY' });
  }
  if (!sameStringSet(manifest.queryIds, AUTHORING_SURFACES_QUERY_IDS)) {
    return deepFreeze({ ok: false, code: 'E_WP301_MANIFEST_QUERY_BOUNDARY' });
  }
  if (!Array.isArray(manifest.surfaceManifests) || manifest.surfaceManifests.length !== 1) {
    return deepFreeze({ ok: false, code: 'E_WP301_SURFACE_MANIFEST_COUNT' });
  }
  const surface = manifest.surfaceManifests[0];
  if (
    surface?.schemaVersion !== AUTHORING_SURFACES_SURFACE_MANIFEST_SCHEMA
    || surface.surfaceId !== AUTHORING_SURFACES_SURFACE_ID
    || surface.slotId !== AUTHORING_SURFACES_SURFACE_MANIFEST_V1.slotId
    || surface.hostKind !== AUTHORING_SURFACES_SURFACE_MANIFEST_V1.hostKind
  ) {
    return deepFreeze({ ok: false, code: 'E_WP301_SURFACE_BINDING' });
  }
  if (surface.directProductMutation !== false || surface.runtimeNetwork !== false) {
    return deepFreeze({ ok: false, code: 'E_WP301_SURFACE_AUTHORITY' });
  }
  return deepFreeze({
    ok: true,
    code: 'WP301_MANIFEST_VALID',
    featureId: manifest.featureId,
    surfaceId: surface.surfaceId,
  });
}

function normalizeText(value, fallback = '') {
  const raw = typeof value === 'string' ? value : fallback;
  return raw
    .replace(ABSOLUTE_PATH_PATTERN, '[local]')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeSafeId(value) {
  const raw = normalizeText(value);
  return SAFE_ID_PATTERN.test(raw) ? raw : '';
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeCount(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeState(value, fallback = 'ready') {
  const state = normalizeText(value).toLowerCase();
  if (['active', 'dirty', 'empty', 'ready', 'unavailable'].includes(state)) {
    return state;
  }
  return fallback;
}

function normalizeMode(value) {
  const mode = normalizeText(value).toLowerCase();
  if (mode === 'plan' || mode === 'review' || mode === 'write') {
    return mode;
  }
  return 'write';
}

function normalizeSurfaceClass(value) {
  const stateClass = normalizeText(value).toUpperCase();
  if ([
    'AUTHORING_WORKING_STATE',
    'DERIVED_STATE',
    'PROJECT_STATE',
    'SHELL_STATE',
  ].includes(stateClass)) {
    return stateClass;
  }
  return 'DERIVED_STATE';
}

function normalizeAction(rawAction = {}) {
  const action = typeof rawAction === 'string' ? { action: rawAction } : rawAction;
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return null;
  }
  const actionId = normalizeSafeId(action.action || action.id);
  const binding = ACTION_BINDINGS[actionId];
  if (!binding) {
    return null;
  }
  return deepFreeze({
    action: actionId,
    commandId: binding.commandId,
    queryId: binding.queryId,
    sourceSurface: AUTHORING_SURFACES_SURFACE_ID,
    boundary: 'EXISTING_COMMAND_KERNEL_REVALIDATION',
  });
}

function normalizeSurface(rawSurface = {}) {
  if (!rawSurface || typeof rawSurface !== 'object' || Array.isArray(rawSurface)) {
    return null;
  }
  const id = normalizeSafeId(rawSurface.id);
  const label = normalizeText(rawSurface.label);
  if (!id || !label) {
    return null;
  }
  const action = normalizeAction(rawSurface.action || rawSurface);
  return deepFreeze({
    id,
    label,
    value: normalizeText(rawSurface.value),
    state: normalizeState(rawSurface.state),
    enabled: normalizeBoolean(rawSurface.enabled, true),
    active: normalizeBoolean(rawSurface.active, false),
    stateClass: normalizeSurfaceClass(rawSurface.stateClass),
    action,
  });
}

export function countAuthoringSurfaceWords(text = '') {
  const trimmed = normalizeText(text);
  return trimmed ? trimmed.split(/\s+/u).filter(Boolean).length : 0;
}

export function buildAuthoringSurfacesProjection(options = {}) {
  const projectId = normalizeSafeId(options.projectId);
  const projectPresent = Boolean(normalizeText(options.projectId));
  const activeDocumentId = normalizeSafeId(options.activeDocumentId);
  const activeDocumentKind = normalizeSafeId(options.activeDocumentKind) || 'scene';
  const mode = normalizeMode(options.mode);
  const leftTab = normalizeSafeId(options.leftTab) || 'project';
  const rightTab = normalizeSafeId(options.rightTab) || 'inspector';
  const flowModeActive = normalizeBoolean(options.flowModeActive, false);
  const localDirty = normalizeBoolean(options.localDirty, false);
  const hasActiveDocument = Boolean(activeDocumentId);
  const hasProject = projectPresent;
  const wordCount = normalizeCount(options.wordCount);
  const toolbarVisibleItemCount = normalizeCount(options.toolbarVisibleItemCount);
  const notesInboxCount = normalizeCount(options.notesCounts?.inbox);
  const searchResultCount = normalizeCount(options.searchCounts?.returned);
  const reviewState = normalizeState(options.reviewState, 'empty');
  const title = normalizeText(options.activeDocumentTitle, hasActiveDocument ? 'Текущая сцена' : 'Сцена не выбрана');
  const postures = [
    normalizeSurface({
      id: 'posture-write',
      label: 'Письмо',
      value: flowModeActive ? 'Поток' : 'Сцена',
      state: mode === 'write' ? 'active' : 'ready',
      active: mode === 'write',
      action: 'open-authoring-write',
      stateClass: 'SHELL_STATE',
    }),
    normalizeSurface({
      id: 'posture-flow',
      label: 'Поток',
      value: flowModeActive ? 'Открыт' : 'Готов',
      state: flowModeActive ? 'active' : 'ready',
      active: flowModeActive,
      enabled: hasActiveDocument,
      action: {
        action: 'open-flow-mode',
        commandId: 'cmd.project.insert.flowOpen',
      },
      stateClass: 'AUTHORING_WORKING_STATE',
    }),
    normalizeSurface({
      id: 'posture-review',
      label: 'Ревью',
      value: reviewState === 'empty' ? 'Без замечаний' : 'Активно',
      state: reviewState === 'unavailable' ? 'unavailable' : 'ready',
      action: {
        action: 'review-open-comments',
        commandId: 'cmd.project.review.openComments',
        queryId: 'query.reviewSurface',
      },
      stateClass: 'DERIVED_STATE',
    }),
  ].filter(Boolean);
  const surfaces = [
    normalizeSurface({
      id: 'editorial-sheet',
      label: 'Лист',
      value: title,
      state: localDirty ? 'dirty' : (hasActiveDocument ? 'ready' : 'empty'),
      enabled: hasActiveDocument,
      action: {
        action: 'open-current-scene',
      },
      stateClass: 'AUTHORING_WORKING_STATE',
    }),
    normalizeSurface({
      id: 'toolbar',
      label: 'Тулбар',
      value: `${toolbarVisibleItemCount} слотов`,
      state: normalizeState(options.toolbarState, 'ready'),
      action: {
        action: 'toggle-configurator',
      },
      stateClass: 'SHELL_STATE',
    }),
    normalizeSurface({
      id: 'notes',
      label: 'Заметки',
      value: notesInboxCount ? `${notesInboxCount} входящих` : 'Готово',
      state: normalizeState(options.notesState, 'ready'),
      enabled: hasProject,
      action: {
        action: 'open-authoring-notes',
        queryId: 'query.projectNotes',
      },
      stateClass: 'DERIVED_STATE',
    }),
    normalizeSurface({
      id: 'project-search',
      label: 'Поиск',
      value: searchResultCount ? `${searchResultCount} результатов` : 'Проект',
      state: normalizeState(options.searchState, 'ready'),
      enabled: hasProject,
      action: {
        action: 'open-authoring-search',
        queryId: 'query.projectSearch',
      },
      stateClass: 'DERIVED_STATE',
    }),
    normalizeSurface({
      id: 'comments-review',
      label: 'Комментарии',
      value: reviewState === 'empty' ? 'Нет активных' : 'Открыть',
      state: reviewState,
      action: {
        action: 'review-open-comments',
        commandId: 'cmd.project.review.openComments',
        queryId: 'query.reviewSurface',
      },
      stateClass: 'DERIVED_STATE',
    }),
    ...(Array.isArray(options.extraSurfaces) ? options.extraSurfaces.map(normalizeSurface) : []),
  ].filter(Boolean).slice(0, 8);
  return deepFreeze({
    schemaVersion: 1,
    surfaceId: AUTHORING_SURFACES_SURFACE_ID,
    transient: true,
    projectId,
    activeDocumentId,
    activeDocumentKind,
    mode,
    leftTab,
    rightTab,
    summary: {
      posture: flowModeActive ? 'flow' : mode,
      sheetState: localDirty ? 'dirty' : (hasActiveDocument ? 'ready' : 'empty'),
      activeTitle: title,
      wordCount,
      localDirty,
      flowModeActive,
    },
    postures,
    surfaces,
    evidence: {
      featureId: AUTHORING_SURFACES_FEATURE_INTEGRATION_MANIFEST_V1.featureId,
      featureManifestSchema: AUTHORING_SURFACES_FEATURE_MANIFEST_SCHEMA,
      surfaceManifestSchema: AUTHORING_SURFACES_SURFACE_MANIFEST_SCHEMA,
      slotId: AUTHORING_SURFACES_SURFACE_MANIFEST_V1.slotId,
      commandBoundary: 'EXISTING_COMMAND_KERNEL_REVALIDATION',
      queryBoundary: 'WORKSPACE_QUERY_BRIDGE_READ_ONLY',
      designBoundary: 'COMPUTED_INTERFACE_FORM_ONLY',
      directPersistence: false,
      runtimeNetwork: false,
    },
  });
}
