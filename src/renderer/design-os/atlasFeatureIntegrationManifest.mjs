export const ATLAS_FEATURE_INTEGRATION_MANIFEST_SCHEMA_VERSION = 'FEATURE_INTEGRATION_MANIFEST_V1';
export const ATLAS_DESIGN_OS_SLOT_RESOLVER_ID = 'YALKEN_ATLAS_FEATURE_SLOT_RESOLVER_V1';
export const ATLAS_DESIGN_OS_BINDING_SOURCE = 'DESIGN_OS_SLOT_RESOLVER';

const ATLAS_SURFACE_CONTRIBUTIONS = Object.freeze([
  {
    surfaceKey: 'currentScene',
    surfaceId: 'surface.atlas.currentScene',
    queryRegistryKey: 'ATLAS_CURRENT_SCENE',
    providerId: 'query.atlasCurrentScene',
    slotId: 'rightRail.context.atlas',
    hostKind: 'rightRail',
    stateClass: 'DERIVED_STATE',
    commandIds: [],
    capabilityIds: [],
  },
  {
    surfaceKey: 'journey',
    surfaceId: 'surface.atlas.journey',
    queryRegistryKey: 'ATLAS_CURRENT_SCENE',
    providerId: 'query.atlasCurrentScene',
    slotId: 'rightRail.context.atlas.journey',
    hostKind: 'rightRail',
    stateClass: 'TRANSIENT_STATE',
    commandIds: [
      'atlas.entity.create',
      'atlas.alias.add',
      'atlas.mention.confirm',
      'atlas.observation.suppress',
      'atlas.observation.reassign',
      'atlas.entity.merge',
      'atlas.entity.splitRestore',
      'atlas.evidence.reattach',
    ],
    capabilityIds: [
      'cap.atlas.entity.create',
      'cap.atlas.alias.add',
      'cap.atlas.mention.confirm',
      'cap.atlas.observation.suppress',
      'cap.atlas.observation.reassign',
      'cap.atlas.entity.merge',
      'cap.atlas.entity.splitRestore',
      'cap.atlas.evidence.reattach',
    ],
  },
  {
    surfaceKey: 'manualMap',
    surfaceId: 'surface.manualMap.workbench',
    queryRegistryKey: 'MANUAL_MAP_WORKBENCH',
    providerId: 'query.manualMapWorkbench',
    slotId: 'workspace.plan.manualMapWorkbench',
    hostKind: 'planWorkspace',
    stateClass: 'PROJECT_STATE',
    commandIds: [
      'manualMap.create',
      'manualMap.node.add',
      'manualMap.node.update',
      'manualMap.node.delete',
      'manualMap.edge.add',
      'manualMap.edge.update',
      'manualMap.edge.delete',
      'manualMap.group.create',
      'manualMap.group.update',
      'manualMap.group.delete',
      'manualMap.attachment.add',
      'manualMap.portal.add',
      'manualMap.template.apply',
      'manualMap.export.json',
      'manualMap.export.imagePdf',
      'manualMap.import.jsonRepeat',
    ],
    capabilityIds: ['cap.manualMap.edit'],
  },
  {
    surfaceKey: 'projection',
    surfaceId: 'surface.atlas.projectionInspector',
    queryRegistryKey: 'PROJECTION_INSPECTOR',
    providerId: 'query.projectionInspector',
    slotId: 'rightRail.context.atlas.projectionInspector',
    hostKind: 'rightRail',
    stateClass: 'DERIVED_STATE',
    commandIds: ['idea.create', 'idea.originLink.add', 'meaning.promote'],
    capabilityIds: ['cap.idea.edit', 'cap.meaning.edit'],
  },
  {
    surfaceKey: 'overview',
    surfaceId: 'surface.atlas.overview',
    queryRegistryKey: 'ATLAS_OVERVIEW',
    providerId: 'query.atlasOverview',
    slotId: 'rightRail.context.atlas.overview',
    hostKind: 'rightRail',
    stateClass: 'DERIVED_STATE',
    commandIds: [],
    capabilityIds: [],
  },
  {
    surfaceKey: 'workspace',
    surfaceId: 'surface.atlas.workspace',
    queryRegistryKey: 'ATLAS_OVERVIEW',
    providerId: 'query.atlasOverview',
    slotId: 'workspace.write.atlas',
    hostKind: 'writeWorkspace',
    stateClass: 'DERIVED_STATE',
    commandIds: [],
    capabilityIds: [],
  },
  {
    surfaceKey: 'entity',
    surfaceId: 'surface.atlas.entityDossier',
    queryRegistryKey: 'ATLAS_ENTITY_DOSSIER',
    providerId: 'query.atlasEntityDossier',
    slotId: 'rightRail.context.atlas.entityDossier',
    hostKind: 'rightRail',
    stateClass: 'DERIVED_STATE',
    commandIds: ['atlas.entity.merge', 'atlas.entity.splitRestore'],
    capabilityIds: ['cap.atlas.entity.merge', 'cap.atlas.entity.splitRestore'],
  },
  {
    surfaceKey: 'relation',
    surfaceId: 'surface.atlas.relationDossier',
    queryRegistryKey: 'ATLAS_RELATION_DOSSIER',
    providerId: 'query.atlasRelationDossier',
    slotId: 'rightRail.context.atlas.relationDossier',
    hostKind: 'rightRail',
    stateClass: 'DERIVED_STATE',
    commandIds: ['atlas.observation.suppress', 'atlas.observation.reassign', 'atlas.evidence.reattach'],
    capabilityIds: ['cap.atlas.observation.suppress', 'cap.atlas.observation.reassign', 'cap.atlas.evidence.reattach'],
  },
  {
    surfaceKey: 'matrices',
    surfaceId: 'surface.atlas.matrices',
    queryRegistryKey: 'ATLAS_MATRICES',
    providerId: 'query.atlasMatrices',
    slotId: 'rightRail.context.atlas.matrices',
    hostKind: 'rightRail',
    stateClass: 'DERIVED_STATE',
    commandIds: [],
    capabilityIds: [],
  },
  {
    surfaceKey: 'reports',
    surfaceId: 'surface.atlas.reportsSavedQueries',
    queryRegistryKey: 'ATLAS_REPORTS_SAVED_QUERIES',
    providerId: 'query.atlasReportsSavedQueries',
    slotId: 'rightRail.context.atlas.reportsSavedQueries',
    hostKind: 'rightRail',
    stateClass: 'DERIVED_STATE',
    commandIds: ['atlas.savedQuery.save'],
    capabilityIds: ['cap.atlas.savedQuery.save'],
  },
  {
    surfaceKey: 'diagnostics',
    surfaceId: 'surface.atlas.diagnosticsStageAcceptance',
    queryRegistryKey: 'ATLAS_DIAGNOSTICS_STAGE_ACCEPTANCE',
    providerId: 'query.atlasDiagnosticsStageAcceptance',
    slotId: 'rightRail.context.atlas.diagnosticsStageAcceptance',
    hostKind: 'rightRail',
    stateClass: 'DERIVED_STATE',
    commandIds: [],
    capabilityIds: [],
  },
  {
    surfaceKey: 'heatmap',
    surfaceId: 'surface.atlas.heatmap',
    queryRegistryKey: 'ATLAS_HEATMAP',
    providerId: 'query.atlasHeatmap',
    slotId: 'rightRail.context.atlas.heatmap',
    hostKind: 'rightRail',
    stateClass: 'DERIVED_STATE',
    commandIds: [],
    capabilityIds: [],
    explicitOpenRequired: true,
  },
  {
    surfaceKey: 'temporal',
    surfaceId: 'surface.atlas.temporalLayout',
    queryRegistryKey: 'ATLAS_TEMPORAL_LAYOUT',
    providerId: 'query.atlasTemporalLayout',
    slotId: 'rightRail.context.atlas.temporalLayout',
    hostKind: 'rightRail',
    stateClass: 'DERIVED_STATE',
    commandIds: ['atlas.calendar.define', 'atlas.sceneTemporalAnchor.set'],
    capabilityIds: ['cap.atlas.calendar.define', 'cap.atlas.sceneTemporalAnchor.set'],
    explicitOpenRequired: true,
  },
  {
    surfaceKey: 'continuity',
    surfaceId: 'surface.atlas.continuityLedger',
    queryRegistryKey: 'ATLAS_CONTINUITY_LEDGER_SURFACE',
    providerId: 'query.atlasContinuityLedgerSurface',
    slotId: 'rightRail.context.atlas.continuityLedger',
    hostKind: 'rightRail',
    stateClass: 'DERIVED_STATE',
    commandIds: ['atlas.continuityFact.record'],
    capabilityIds: ['cap.atlas.continuityFact.record'],
    explicitOpenRequired: true,
  },
]);

export const ATLAS_DESIGN_OS_ALLOWED_SLOT_IDS = Object.freeze([
  ...new Set(ATLAS_SURFACE_CONTRIBUTIONS.map((surface) => surface.slotId)),
]);

export const YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  schemaVersion: ATLAS_FEATURE_INTEGRATION_MANIFEST_SCHEMA_VERSION,
  featureId: 'yalken.atlasAndManualMap.v5',
  featureVersion: '5.1.0-wp503',
  domainOwner: 'Product Core',
  authoritativeData: [
    'atlas.author.v1',
    'manualMap.author.v1',
    'project.scenes.v1',
  ],
  derivedData: [
    'derived.atlas.*',
    'derived.manualMap.workbench.v1',
    'derived.projectionInspector.v1',
    'yalken.r24.atlasSurface.v1',
  ],
  commandIds: Object.freeze([...new Set(ATLAS_SURFACE_CONTRIBUTIONS.flatMap((surface) => surface.commandIds))]),
  queryIds: Object.freeze([...new Set(ATLAS_SURFACE_CONTRIBUTIONS.map((surface) => surface.providerId))]),
  productProjectionIds: Object.freeze([...new Set(ATLAS_SURFACE_CONTRIBUTIONS.map((surface) => surface.surfaceId))]),
  capabilityIds: Object.freeze([...new Set(ATLAS_SURFACE_CONTRIBUTIONS.flatMap((surface) => surface.capabilityIds))]),
  authorityMap: Object.freeze({
    productTruth: 'Product Core owns atlas/manual-map data, project persistence, migrations and recovery.',
    commandAuthority: 'Command Kernel validates every mutation; Design OS receives intent-only command ids.',
    designAuthority: 'Design OS slot resolver owns surface placement, provider projection binding and fallback visibility.',
  }),
  writePath: 'Surface intent -> host CommandDispatchPort -> Command Kernel -> Product Core -> atomic persistence/recovery.',
  readPath: 'Product Core/read models -> workspace query projection -> Design OS slot resolver -> renderer adapter.',
  requiredProductPorts: Object.freeze(['ProjectPersistencePort', 'WorkspaceQueryPort', 'ProductCommandDispatchPort']),
  requiredDesignOsPorts: Object.freeze(['CommandCatalogPort', 'CommandDispatchPort', 'DomainProjectionPort', 'ShellProjectionPort']),
  adapterRequirements: Object.freeze(['renderer-adapter:atlas-right-rail', 'renderer-adapter:atlas-workspace', 'renderer-adapter:manual-map-plan-workspace']),
  surfaceManifests: ATLAS_SURFACE_CONTRIBUTIONS,
  slotRequirements: Object.freeze([...new Set(ATLAS_SURFACE_CONTRIBUTIONS.map((surface) => surface.slotId))]),
  supportedWorkspaces: Object.freeze(['WRITE', 'PLAN', 'REVIEW']),
  platformAvailability: Object.freeze({ macos: 'active', windows: 'inactive', linux: 'inactive', web: 'inactive', mobile: 'inactive' }),
  accessibilityRequirements: Object.freeze(['keyboard-tablist', 'visible-focus', 'list-parity', 'explicit-open-for-heavy-surfaces']),
  fallbacks: Object.freeze(['unsupported-capability-disabled', 'missing-projection-unavailable', 'heavy-surface-explicit-open']),
  stateClasses: Object.freeze(['PROJECT_STATE', 'DERIVED_STATE', 'TRANSIENT_STATE']),
  persistenceClass: 'project-persistence-separated-from-shell-state',
  migrations: 'no schema migration in P0_04; binding only',
  recovery: 'project recovery remains Product Core owned; Design OS safe reset cannot mutate author truth',
  rollback: 'remove manifest binding and renderer adapter calls; existing product commands remain canonical',
  performanceBudget: 'slot resolver is O(surface count) and performs no workspace query or storage IO',
  securityBoundary: 'no network, no storage authority, no direct IPC acceptance, no private command bus',
  lifecycle: 'manifest -> resolve slots -> render projection -> dispatch intent-only command',
  negativeBypassChecks: Object.freeze([
    'html-data-attributes-alone-are-not-readiness-proof',
    'unknown-query-provider-fails-closed',
    'unknown-command-id-fails-closed',
    'missing-slot-id-fails-closed',
    'arbitrary-atlas-prefixed-slot-fails-closed',
    'renderer-host-uses-resolved-slot-binding',
  ]),
  evidenceBindings: Object.freeze(['P0_04 focused contract', 'EFINAL repair queue receipt row']),
  currentReality: 'WP503 extends the versioned resolver with one read-only Atlas workspace for manuscript, split and full postures over graph/list/table-parity rows.',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function catalogById(rows) {
  const catalog = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = normalizeString(row?.id);
    if (!id || catalog.has(id)) return null;
    catalog.set(id, row);
  }
  return catalog;
}

function fail(reason, details = {}) {
  return {
    ok: false,
    resolverId: ATLAS_DESIGN_OS_SLOT_RESOLVER_ID,
    source: ATLAS_DESIGN_OS_BINDING_SOURCE,
    reason,
    details,
    bindings: [],
  };
}

export function resolveAtlasFeatureDesignOsSlots(options = {}) {
  const manifest = isPlainObject(options.manifest) ? options.manifest : YALKEN_ATLAS_FEATURE_INTEGRATION_MANIFEST_V1;
  if (manifest.schemaVersion !== ATLAS_FEATURE_INTEGRATION_MANIFEST_SCHEMA_VERSION) {
    return fail('E_ATLAS_FEATURE_MANIFEST_SCHEMA_UNSUPPORTED', { schemaVersion: manifest.schemaVersion || '' });
  }

  if (!Array.isArray(options.commandCatalog) || options.commandCatalog.length === 0) {
    return fail('E_ATLAS_COMMAND_KERNEL_CATALOG_REQUIRED');
  }
  if (!Array.isArray(options.providerCatalog) || options.providerCatalog.length === 0) {
    return fail('E_ATLAS_PROVIDER_CATALOG_REQUIRED');
  }
  if (!Array.isArray(options.slotCatalog) || options.slotCatalog.length === 0) {
    return fail('E_ATLAS_SLOT_BINDING_CATALOG_REQUIRED');
  }
  const commandCatalog = catalogById(options.commandCatalog);
  const providerCatalog = catalogById(options.providerCatalog);
  const slotCatalog = new Map();
  for (const row of options.slotCatalog) {
    const surfaceKey = normalizeString(row?.surfaceKey);
    if (!surfaceKey || slotCatalog.has(surfaceKey)) return fail('E_ATLAS_SLOT_BINDING_CATALOG_INVALID');
    slotCatalog.set(surfaceKey, row);
  }
  if (!commandCatalog) return fail('E_ATLAS_COMMAND_KERNEL_CATALOG_INVALID');
  if (!providerCatalog) return fail('E_ATLAS_PROVIDER_CATALOG_INVALID');
  const surfaces = Array.isArray(manifest.surfaceManifests) ? manifest.surfaceManifests : [];
  if (surfaces.length === 0) return fail('E_ATLAS_FEATURE_MANIFEST_SURFACES_MISSING');

  const bindings = [];
  for (const surface of surfaces) {
    const surfaceKey = normalizeString(surface.surfaceKey);
    const surfaceId = normalizeString(surface.surfaceId);
    const providerId = normalizeString(surface.providerId);
    const slotId = normalizeString(surface.slotId);
    if (!surfaceKey || !surfaceId || !providerId || !slotId) {
      return fail('E_ATLAS_SURFACE_BINDING_FIELD_MISSING', { surfaceKey, surfaceId, providerId, slotId });
    }
    if (!providerCatalog.has(providerId)) {
      return fail('E_ATLAS_SURFACE_PROVIDER_NOT_IN_QUERY_REGISTRY', { surfaceKey, providerId });
    }
    const exactSlot = slotCatalog.get(surfaceKey);
    if (
      !exactSlot
      || normalizeString(exactSlot.surfaceId) !== surfaceId
      || normalizeString(exactSlot.providerId) !== providerId
      || normalizeString(exactSlot.slotId) !== slotId
      || normalizeString(exactSlot.hostKind) !== normalizeString(surface.hostKind)
    ) {
      return fail('E_ATLAS_SURFACE_SLOT_BINDING_UNRESOLVED', { surfaceKey, surfaceId, providerId, slotId });
    }
    for (const commandId of (Array.isArray(surface.commandIds) ? surface.commandIds : [])) {
      if (!commandCatalog.has(commandId)) {
        return fail('E_ATLAS_SURFACE_COMMAND_NOT_IN_COMMAND_KERNEL', { surfaceKey, commandId });
      }
    }
    bindings.push(Object.freeze({
      resolverId: ATLAS_DESIGN_OS_SLOT_RESOLVER_ID,
      source: ATLAS_DESIGN_OS_BINDING_SOURCE,
      featureId: manifest.featureId,
      manifestSchemaVersion: manifest.schemaVersion,
      surfaceKey,
      surfaceId,
      providerId,
      slotId,
      hostKind: normalizeString(surface.hostKind) || 'rightRail',
      stateClass: normalizeString(surface.stateClass) || 'DERIVED_STATE',
      commandIds: Object.freeze([...(Array.isArray(surface.commandIds) ? surface.commandIds : [])]),
      capabilityIds: Object.freeze([...(Array.isArray(surface.capabilityIds) ? surface.capabilityIds : [])]),
      explicitOpenRequired: surface.explicitOpenRequired === true,
      productMutation: false,
      storageAuthority: false,
      networkAuthority: false,
      dispatchAuthority: surface.commandIds?.length > 0 ? 'CommandKernel' : 'none',
    }));
  }

  return Object.freeze({
    ok: true,
    resolverId: ATLAS_DESIGN_OS_SLOT_RESOLVER_ID,
    source: ATLAS_DESIGN_OS_BINDING_SOURCE,
    featureId: manifest.featureId,
    manifestSchemaVersion: manifest.schemaVersion,
    bindingCount: bindings.length,
    bindings: Object.freeze(bindings),
    negativeBypassChecks: Object.freeze([...(Array.isArray(manifest.negativeBypassChecks) ? manifest.negativeBypassChecks : [])]),
  });
}

export function getAtlasFeatureSurfaceBinding(resolution, surfaceKey) {
  if (!resolution?.ok || !Array.isArray(resolution.bindings)) return null;
  const normalized = normalizeString(surfaceKey);
  return resolution.bindings.find((binding) => binding.surfaceKey === normalized) || null;
}

export function applyAtlasFeatureSurfaceBinding(host, binding, options = {}) {
  if (!host || typeof host !== 'object' || !binding) return false;
  if (!host.dataset || typeof host.dataset !== 'object') return false;
  host.dataset.designOsSlotResolver = binding.resolverId;
  host.dataset.designOsBindingSource = binding.source;
  host.dataset.featureIntegrationManifest = binding.manifestSchemaVersion;
  host.dataset.designOsFeatureId = binding.featureId;
  host.dataset.designOsSurfaceId = binding.surfaceId;
  host.dataset.designOsSlotId = binding.slotId;
  host.dataset.designOsProviderId = binding.providerId;
  host.dataset.designOsDispatchAuthority = binding.dispatchAuthority;
  host.dataset.designOsProductMutation = 'false';
  host.dataset.designOsStorageAuthority = 'false';
  host.dataset.designOsNetworkAuthority = 'false';
  const providerDatasetName = normalizeString(options.providerDatasetName);
  if (providerDatasetName) host.dataset[providerDatasetName] = binding.providerId;
  return true;
}
