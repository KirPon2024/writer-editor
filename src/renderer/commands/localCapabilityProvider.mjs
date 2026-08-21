// R2.4 ENT0: the entitlement decision table lives in the product plane
// (src/core/entitlement-law-v1.cjs). This provider mirrors that exact table
// for renderer visibility hints; a hint is never enforcement and the
// authoritative ports decide with a product-owned tier.
import entitlementLaw from '../../core/entitlement-law-v1.cjs';

const {
  ENTITLEMENT_TIERS,
  FREE_READ_ONLY_COMMAND_IDS,
  FREE_PRO_COMPLEXITY_COMMAND_IDS,
  FREE_ALWAYS_AVAILABLE_COMMAND_IDS,
  decideCommandEntitlement,
  normalizeEntitlementTier,
} = entitlementLaw;

export const LOCAL_CAPABILITY_SCHEMA_VERSION = 'local-capability-provider.v1';

export const LOCAL_ENTITLEMENT_TIERS = ENTITLEMENT_TIERS;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTier(value) {
  return normalizeEntitlementTier(value);
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
  return entitlementLaw.isFreeAlwaysAvailableCommandId(commandId);
}

export function isProComplexityCommand(commandId) {
  return entitlementLaw.isProComplexityCommandId(commandId);
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
  const decision = decideCommandEntitlement(normalizedCommandId, state.tier);
  return Object.freeze({
    ok: decision.ok,
    available: decision.available,
    visible: decision.visible,
    access: decision.access,
    reason: decision.reason,
    state,
    commandId: decision.commandId,
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
