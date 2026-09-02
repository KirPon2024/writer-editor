import { hashCanonicalValue } from './browser-safe-hash.mjs';
import {
  assertAtlasRegisterCurrent,
  verifyAtlasRegisterProjection,
  verifyAtlasRegisterProjectionDigest,
} from './atlas-register-ask-v1.mjs';

export const ATLAS_COUNTERFACTUAL_BRANCH_SCHEMA_VERSION = 'yalken.r24.atlasCounterfactualBranch.v1';
export const ATLAS_COUNTERFACTUAL_PROPOSAL_SCHEMA_VERSION = 'yalken.r24.atlasCounterfactualProposal.v1';
export const ATLAS_COUNTERFACTUAL_NODE_ID = 'WP-506_COUNTERFACTUAL';
export const ATLAS_COUNTERFACTUAL_PROFILE_ID = 'ATLAS_PRODUCT_V33';
export const ATLAS_COUNTERFACTUAL_MAX_OPERATIONS = 2_048;
export const ATLAS_COUNTERFACTUAL_MAX_ENTRIES = 52_048;

export const ATLAS_COUNTERFACTUAL_OPERATION_KIND = Object.freeze({
  ADD: 'ADD',
  REMOVE: 'REMOVE',
  REPLACE: 'REPLACE',
});

export const ATLAS_COUNTERFACTUAL_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.atlas.counterfactual.v1',
  featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:WP505_REGISTER_PROJECTION_READ_MODEL',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY',
  authoritativeData: 'CALLER_VERIFIED_EXACT_WP505_REGISTER_PROJECTION_AND_ITS_REBUILD_INPUT',
  derivedData: 'DISPOSABLE_REVISION_BOUND_RETCON_BRANCH_AND_SEMANTIC_IMPACT_PROPOSAL',
  commandIds: ['NOT_APPLICABLE_PURE_QUERY_NO_MUTATION_OR_APPLY'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  queryIds: ['atlas.counterfactual.branch.v1', 'atlas.counterfactual.impact.v1'],
  productProjectionIds: [ATLAS_COUNTERFACTUAL_BRANCH_SCHEMA_VERSION, ATLAS_COUNTERFACTUAL_PROPOSAL_SCHEMA_VERSION],
  capabilityIds: ['cap.atlas.counterfactual.preview'],
  authorityMap: 'PRODUCT_CORE_INPUTS_READ_ONLY_DERIVED_PROJECTOR_OUTPUT_ONLY',
  identityKeys: ['projectId', 'projectRevisionId', 'snapshotId', 'generation', 'sharedRowSetDigest', 'registerProjectionDigest', 'branchDigest', 'proposalDigest'],
  revisionPolicy: 'EXACT_WP505_REGISTER_AND_CURRENT_IDENTITY_REQUIRED_STALE_REJECTED',
  writePath: 'PURE_RETURN_VALUE_ONLY',
  readPath: 'VERIFIED_WP505_REGISTER_TO_IMMUTABLE_DISPOSABLE_BRANCH_AND_IMPACT_PROPOSAL',
  requiredProductPorts: ['WorkspaceQueryPort'],
  requiredDesignOsPorts: ['NOT_APPLICABLE_NO_INTERFACE_PLANE_CHANGE'],
  adapterRequirements: ['NOT_APPLICABLE_NO_ADAPTER'],
  surfaceManifests: ['NOT_APPLICABLE_NO_NEW_VISUAL_SURFACE'],
  slotRequirements: ['NOT_APPLICABLE_NO_UI_SLOT'],
  supportedWorkspaces: ['NOT_APPLICABLE_NO_UI_WORKSPACE'],
  platformAvailability: 'PLATFORM_NEUTRAL_PURE_MODULE',
  accessibilityRequirements: ['NOT_APPLICABLE_NO_VISUAL_OR_INTERACTIVE_SURFACE'],
  fallbacks: ['EMPTY_OPERATION_SET_RETURNS_EXPLICIT_NO_CHANGE_PROPOSAL', 'STALE_OR_INVALID_INPUT_FAILS_CLOSED', 'NO_APPLY_FALLBACK_EXISTS'],
  stateClasses: ['DERIVED_STATE'],
  persistenceClass: 'NOT_PERSISTED_BY_THIS_MODULE',
  migrations: ['NOT_APPLICABLE_NO_STORED_SCHEMA'],
  recovery: 'DISCARD_AND_REBUILD_FROM_EXACT_WP505_REGISTER_PROJECTION',
  rollback: 'REVERT_BOUNDED_MODULE_AND_TEST_COMMIT',
  performanceBudget: { maximumOperations: ATLAS_COUNTERFACTUAL_MAX_OPERATIONS, maximumEntries: ATLAS_COUNTERFACTUAL_MAX_ENTRIES, complexity: 'O(register_entries_plus_operations)' },
  securityBoundary: 'STRICT_OWN_DATA_EXACT_KEYSETS_NFC_BOUNDED_DENOMINATORS_NO_ACCESSORS_SYMBOLS_UNSAFE_KEYS_PATHS_URLS_COMMANDS_NETWORK_EXTERNAL_AI_OR_EFFECT_AUTHORITY',
  lifecycle: 'ON_DEMAND_PURE_DISPOSABLE_PREVIEW_ONLY',
  negativeBypassChecks: ['STALE_REGISTER_REJECTED', 'TAMPERED_BRANCH_AND_PROPOSAL_REJECTED', 'DUPLICATE_CONFLICTING_MISSING_AND_OVERSIZED_OPERATIONS_REJECTED', 'PRODUCT_MUTATION_APPLY_PERSISTENCE_RENDERER_NETWORK_EXTERNAL_AI_AND_EFFECT_AUTHORITY_REJECTED'],
  evidenceBindings: ['WP505_EXTERNALLY_VERIFIED_PREDECESSOR', 'WP506_MODEL_CONTRACT_INTEGRATION_MUTANTS_DIFFERENTIAL_STALE_LARGE_CORPUS'],
  currentReality: 'ONE_PURE_DISPOSABLE_COUNTERFACTUAL_PROJECTION_ONLY_NO_CANONICAL_RETCON_APPLY_STORAGE_OR_RENDERER_WIRING',
});

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const CURRENT_IDENTITY_KEYS = Object.freeze(['generation', 'projectRevisionId', 'sharedRowSetDigest', 'snapshotId']);
const INPUT_KEYS = Object.freeze(['currentIdentity', 'operations', 'registerInput', 'registerProjection']);
const OPERATION_KEYS = Object.freeze(['after', 'entryId', 'kind', 'operationId', 'rationale', 'sourceEvidenceIds']);
const SEMANTIC_ENTRY_KEYS = Object.freeze(['body', 'entityIds', 'evidenceIds', 'kind', 'label', 'sceneIds', 'tags']);
const NORMALIZED_OPERATION_KEYS = Object.freeze(['after', 'afterDigest', 'beforeDigest', 'entryId', 'kind', 'operationDigest', 'operationId', 'rationale', 'sourceEvidenceIds']);
const BRANCH_KEYS = Object.freeze(['authority', 'baselineEntriesDigest', 'branchDigest', 'branchId', 'denominator', 'disposable', 'entries', 'featureManifestDigest', 'generation', 'operations', 'profileId', 'projectId', 'projectRevisionId', 'registerProjectionDigest', 'schemaVersion', 'sharedRowSetDigest', 'snapshotId', 'stageId']);
const PROPOSAL_KEYS = Object.freeze(['authority', 'branchDigest', 'canApply', 'changes', 'denominator', 'generation', 'impact', 'profileId', 'projectId', 'projectRevisionId', 'proposalDigest', 'proposalOnly', 'registerProjectionDigest', 'schemaVersion', 'sharedRowSetDigest', 'snapshotId', 'stageId']);
const AUTHORITY_KEYS = Object.freeze(['applyAuthority', 'commandAuthority', 'externalAi', 'externalEffects', 'network', 'persistence', 'productMutation', 'rendererWiring', 'stateClass']);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class AtlasCounterfactualError extends Error {
  constructor(code, detail = '') { super(detail ? `${code}: ${detail}` : code); this.name = 'AtlasCounterfactualError'; this.code = code; this.detail = detail; }
}
function fail(code, detail = '') { throw new AtlasCounterfactualError(code, detail); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function digest(value) { return `sha256:${hashCanonicalValue(value)}`; }
function plain(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function exact(value, keys, code) {
  if (!plain(value)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== 'string' || UNSAFE_KEYS.has(key))) fail(code, 'SAFE_STRING_KEYS_REQUIRED');
  const actual = own.slice().sort(compare);
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) fail(code, 'EXACT_KEYSET_REQUIRED');
  for (const key of own) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(code, 'DATA_PROPERTIES_REQUIRED'); }
}
function dense(values, code) {
  if (!Array.isArray(values) || Object.getOwnPropertySymbols(values).length !== 0) fail(code, 'ARRAY_REQUIRED');
  const names = Object.getOwnPropertyNames(values);
  if (names.length !== values.length + 1 || !names.includes('length')) fail(code, 'DENSE_ARRAY_REQUIRED');
  for (let index = 0; index < values.length; index += 1) { const descriptor = Object.getOwnPropertyDescriptor(values, String(index)); if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(code, 'DATA_ELEMENTS_REQUIRED'); }
}
function identifier(value, code, maximum = 4_096, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value) || value.length > maximum || value !== value.trim() || value !== value.normalize('NFC') || /[\u0000-\u001f\u007f]/u.test(value)) fail(code);
  return value;
}
function digestValue(value, code) { if (typeof value !== 'string' || !DIGEST.test(value)) fail(code); return value; }
function integer(value, code, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code); return value; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) freeze(child); return Object.freeze(value); }
function canonicalStrings(values, code, allowEmpty = true) {
  dense(values, code);
  if (!allowEmpty && values.length === 0) fail(code, 'NON_EMPTY_REQUIRED');
  const normalized = values.map((value) => identifier(value, code));
  if (new Set(normalized).size !== normalized.length) fail(code, 'DUPLICATE');
  if (normalized.some((value, index) => index > 0 && compare(normalized[index - 1], value) >= 0)) fail(code, 'CANONICAL_ORDER_REQUIRED');
  return normalized;
}
function assertIdentity(identity) {
  exact(identity, CURRENT_IDENTITY_KEYS, 'E_ATLAS_COUNTERFACTUAL_CURRENT_IDENTITY_INVALID');
  integer(identity.generation, 'E_ATLAS_COUNTERFACTUAL_GENERATION_INVALID');
  digestValue(identity.projectRevisionId, 'E_ATLAS_COUNTERFACTUAL_REVISION_INVALID');
  digestValue(identity.sharedRowSetDigest, 'E_ATLAS_COUNTERFACTUAL_ROW_SET_INVALID');
  identifier(identity.snapshotId, 'E_ATLAS_COUNTERFACTUAL_SNAPSHOT_INVALID');
}
function copySemanticEntry(value, code) {
  exact(value, SEMANTIC_ENTRY_KEYS, code);
  return freeze({
    kind: identifier(value.kind, code, 256),
    label: identifier(value.label, code, 4_096),
    body: identifier(value.body, code, 16_384),
    evidenceIds: canonicalStrings(value.evidenceIds, code),
    entityIds: canonicalStrings(value.entityIds, code),
    sceneIds: canonicalStrings(value.sceneIds, code),
    tags: canonicalStrings(value.tags, code),
  });
}
function semanticFromRegister(entry) {
  return freeze({ kind: entry.kind, label: entry.label, body: entry.body, evidenceIds: [...entry.evidenceIds].sort(compare), entityIds: [...entry.entityIds].sort(compare), sceneIds: [...entry.sceneIds].sort(compare), tags: [...entry.tags].sort(compare) });
}
function branchEntry(entryId, semantic, source) {
  const normalized = { entryId, ...semantic, baselineEntryDigest: source?.entryDigest ?? '', counterfactual: source === null || digest(semantic) !== digest(semanticFromRegister(source)) };
  return freeze({ ...normalized, branchEntryDigest: digest(normalized) });
}
function authority() {
  return freeze({ stateClass: 'DERIVED_STATE', productMutation: false, persistence: false, rendererWiring: false, externalEffects: false, network: false, externalAi: false, applyAuthority: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' });
}
function validateRegister(input) {
  const current = input.currentIdentity;
  assertIdentity(current);
  const projection = verifyAtlasRegisterProjectionDigest(assertAtlasRegisterCurrent(input.registerProjection, current));
  verifyAtlasRegisterProjection(projection, input.registerInput);
  if (projection.entries.length > ATLAS_COUNTERFACTUAL_MAX_ENTRIES) fail('E_ATLAS_COUNTERFACTUAL_BASE_DENOMINATOR_BOUND');
  return projection;
}
function normalizeOperations(values, projection) {
  dense(values, 'E_ATLAS_COUNTERFACTUAL_OPERATIONS_INVALID');
  if (values.length > ATLAS_COUNTERFACTUAL_MAX_OPERATIONS) fail('E_ATLAS_COUNTERFACTUAL_OPERATION_BOUND');
  const baseline = new Map(projection.entries.map((entry) => [entry.entryId, entry]));
  const evidenceUniverse = new Set(projection.entries.flatMap((entry) => entry.evidenceIds));
  const normalized = values.map((value) => {
    exact(value, OPERATION_KEYS, 'E_ATLAS_COUNTERFACTUAL_OPERATION_INVALID');
    const operationId = identifier(value.operationId, 'E_ATLAS_COUNTERFACTUAL_OPERATION_ID_INVALID');
    const entryId = identifier(value.entryId, 'E_ATLAS_COUNTERFACTUAL_ENTRY_ID_INVALID');
    const kind = identifier(value.kind, 'E_ATLAS_COUNTERFACTUAL_OPERATION_KIND_INVALID', 32);
    if (!Object.values(ATLAS_COUNTERFACTUAL_OPERATION_KIND).includes(kind)) fail('E_ATLAS_COUNTERFACTUAL_OPERATION_KIND_INVALID');
    const before = baseline.get(entryId) ?? null;
    if (kind === ATLAS_COUNTERFACTUAL_OPERATION_KIND.ADD && (before || !entryId.startsWith('counterfactual:'))) fail('E_ATLAS_COUNTERFACTUAL_ADD_TARGET_INVALID');
    if (kind !== ATLAS_COUNTERFACTUAL_OPERATION_KIND.ADD && !before) fail('E_ATLAS_COUNTERFACTUAL_TARGET_MISSING');
    if (kind === ATLAS_COUNTERFACTUAL_OPERATION_KIND.REMOVE && value.after !== null) fail('E_ATLAS_COUNTERFACTUAL_REMOVE_AFTER_INVALID');
    if (kind !== ATLAS_COUNTERFACTUAL_OPERATION_KIND.REMOVE && value.after === null) fail('E_ATLAS_COUNTERFACTUAL_AFTER_REQUIRED');
    const after = value.after === null ? null : copySemanticEntry(value.after, 'E_ATLAS_COUNTERFACTUAL_AFTER_INVALID');
    if (kind === ATLAS_COUNTERFACTUAL_OPERATION_KIND.REPLACE && digest(after) === digest(semanticFromRegister(before))) fail('E_ATLAS_COUNTERFACTUAL_REPLACE_NO_CHANGE');
    const sourceEvidenceIds = canonicalStrings(value.sourceEvidenceIds, 'E_ATLAS_COUNTERFACTUAL_SOURCE_EVIDENCE_INVALID', false);
    if (sourceEvidenceIds.some((id) => !evidenceUniverse.has(id))) fail('E_ATLAS_COUNTERFACTUAL_SOURCE_EVIDENCE_UNKNOWN', operationId);
    const core = { operationId, kind, entryId, rationale: identifier(value.rationale, 'E_ATLAS_COUNTERFACTUAL_RATIONALE_INVALID', 8_192), sourceEvidenceIds, beforeDigest: before?.entryDigest ?? '', afterDigest: after === null ? '' : digest(after), after };
    return freeze({ ...core, operationDigest: digest(core) });
  });
  if (new Set(normalized.map((value) => value.operationId)).size !== normalized.length) fail('E_ATLAS_COUNTERFACTUAL_OPERATION_ID_DUPLICATE');
  if (new Set(normalized.map((value) => value.entryId)).size !== normalized.length) fail('E_ATLAS_COUNTERFACTUAL_TARGET_CONFLICT');
  if (normalized.some((value, index) => index > 0 && compare(normalized[index - 1].operationId, value.operationId) >= 0)) fail('E_ATLAS_COUNTERFACTUAL_OPERATION_ORDER');
  return normalized;
}
function applyOperations(projection, operations) {
  const byId = new Map(projection.entries.map((entry) => [entry.entryId, branchEntry(entry.entryId, semanticFromRegister(entry), entry)]));
  for (const operation of operations) {
    if (operation.kind === ATLAS_COUNTERFACTUAL_OPERATION_KIND.REMOVE) byId.delete(operation.entryId);
    else {
      const source = projection.entries.find((entry) => entry.entryId === operation.entryId) ?? null;
      byId.set(operation.entryId, branchEntry(operation.entryId, operation.after, source));
    }
  }
  const entries = [...byId.values()].sort((left, right) => compare(left.entryId, right.entryId));
  if (entries.length > ATLAS_COUNTERFACTUAL_MAX_ENTRIES) fail('E_ATLAS_COUNTERFACTUAL_RESULT_DENOMINATOR_BOUND');
  return entries;
}
function identityWithout(value, key) { const { [key]: ignored, ...identity } = value; return identity; }

export function createAtlasCounterfactualBranch(input) {
  exact(input, INPUT_KEYS, 'E_ATLAS_COUNTERFACTUAL_INPUT_INVALID');
  const projection = validateRegister(input);
  const operations = normalizeOperations(input.operations, projection);
  const entries = applyOperations(projection, operations);
  const denominator = freeze({ baselineEntries: projection.entries.length, operations: operations.length, added: operations.filter((value) => value.kind === 'ADD').length, replaced: operations.filter((value) => value.kind === 'REPLACE').length, removed: operations.filter((value) => value.kind === 'REMOVE').length, branchEntries: entries.length });
  if (denominator.branchEntries !== denominator.baselineEntries + denominator.added - denominator.removed || denominator.operations !== denominator.added + denominator.replaced + denominator.removed) fail('E_ATLAS_COUNTERFACTUAL_DENOMINATOR_MISMATCH');
  const normalized = {
    schemaVersion: ATLAS_COUNTERFACTUAL_BRANCH_SCHEMA_VERSION,
    stageId: ATLAS_COUNTERFACTUAL_NODE_ID,
    profileId: ATLAS_COUNTERFACTUAL_PROFILE_ID,
    projectId: projection.projectId,
    projectRevisionId: projection.projectRevisionId,
    snapshotId: projection.snapshotId,
    generation: projection.generation,
    sharedRowSetDigest: projection.sharedRowSetDigest,
    registerProjectionDigest: projection.projectionDigest,
    baselineEntriesDigest: digest(projection.entries),
    branchId: `counterfactual:${digest({ registerProjectionDigest: projection.projectionDigest, operations: operations.map((value) => value.operationDigest) }).slice(7)}`,
    disposable: true,
    operations,
    entries,
    denominator,
    authority: authority(),
    featureManifestDigest: digest(ATLAS_COUNTERFACTUAL_FEATURE_INTEGRATION_MANIFEST_V1),
  };
  return freeze({ ...normalized, branchDigest: digest(normalized) });
}

function changedDimensions(before, after, kind) {
  if (kind === 'ADD') return ['ADDITION'];
  if (kind === 'REMOVE') return ['REMOVAL'];
  const dimensions = [];
  for (const [key, label] of [['body', 'BODY'], ['entityIds', 'ENTITIES'], ['evidenceIds', 'EVIDENCE'], ['kind', 'KIND'], ['label', 'LABEL'], ['sceneIds', 'SCENES'], ['tags', 'TAGS']]) if (hashCanonicalValue(before[key]) !== hashCanonicalValue(after[key])) dimensions.push(label);
  return dimensions.sort(compare);
}
function delta(before = [], after = []) { const left = new Set(before); const right = new Set(after); return [...new Set([...before.filter((value) => !right.has(value)), ...after.filter((value) => !left.has(value))])].sort(compare); }

export function proposeAtlasCounterfactualImpact(input) {
  exact(input, INPUT_KEYS, 'E_ATLAS_COUNTERFACTUAL_INPUT_INVALID');
  const projection = validateRegister(input);
  const branch = createAtlasCounterfactualBranch(input);
  const baseline = new Map(projection.entries.map((entry) => [entry.entryId, semanticFromRegister(entry)]));
  const changes = branch.operations.map((operation) => {
    const before = baseline.get(operation.entryId) ?? null;
    const after = operation.after;
    const normalized = {
      operationId: operation.operationId,
      operationDigest: operation.operationDigest,
      kind: operation.kind,
      entryId: operation.entryId,
      beforeDigest: operation.beforeDigest,
      afterDigest: operation.afterDigest,
      changedDimensions: changedDimensions(before, after, operation.kind),
      affectedEntityIds: delta(before?.entityIds, after?.entityIds),
      affectedSceneIds: delta(before?.sceneIds, after?.sceneIds),
      affectedEvidenceIds: [...new Set([...operation.sourceEvidenceIds, ...delta(before?.evidenceIds, after?.evidenceIds)])].sort(compare),
      affectedTags: delta(before?.tags, after?.tags),
      rationale: operation.rationale,
    };
    return freeze({ ...normalized, changeDigest: digest(normalized) });
  });
  const impact = freeze({
    entityIds: [...new Set(changes.flatMap((value) => value.affectedEntityIds))].sort(compare),
    sceneIds: [...new Set(changes.flatMap((value) => value.affectedSceneIds))].sort(compare),
    evidenceIds: [...new Set(changes.flatMap((value) => value.affectedEvidenceIds))].sort(compare),
    tags: [...new Set(changes.flatMap((value) => value.affectedTags))].sort(compare),
    dimensions: [...new Set(changes.flatMap((value) => value.changedDimensions))].sort(compare),
  });
  const denominator = freeze({ changes: changes.length, entities: impact.entityIds.length, scenes: impact.sceneIds.length, evidence: impact.evidenceIds.length, tags: impact.tags.length, dimensions: impact.dimensions.length });
  const normalized = {
    schemaVersion: ATLAS_COUNTERFACTUAL_PROPOSAL_SCHEMA_VERSION,
    stageId: ATLAS_COUNTERFACTUAL_NODE_ID,
    profileId: ATLAS_COUNTERFACTUAL_PROFILE_ID,
    projectId: projection.projectId,
    projectRevisionId: projection.projectRevisionId,
    snapshotId: projection.snapshotId,
    generation: projection.generation,
    sharedRowSetDigest: projection.sharedRowSetDigest,
    registerProjectionDigest: projection.projectionDigest,
    branchDigest: branch.branchDigest,
    proposalOnly: true,
    canApply: false,
    changes,
    impact,
    denominator,
    authority: authority(),
  };
  return freeze({ ...normalized, proposalDigest: digest(normalized) });
}

export function assertAtlasCounterfactualCurrent(value, currentIdentity) {
  assertIdentity(currentIdentity);
  for (const key of CURRENT_IDENTITY_KEYS) if (value[key] !== currentIdentity[key]) fail('E_ATLAS_COUNTERFACTUAL_STALE', key);
  return value;
}
export function verifyAtlasCounterfactualBranch(value, input) {
  exact(value, BRANCH_KEYS, 'E_ATLAS_COUNTERFACTUAL_BRANCH_INVALID');
  exact(value.authority, AUTHORITY_KEYS, 'E_ATLAS_COUNTERFACTUAL_AUTHORITY_INVALID');
  dense(value.operations, 'E_ATLAS_COUNTERFACTUAL_BRANCH_OPERATIONS_INVALID');
  for (const operation of value.operations) exact(operation, NORMALIZED_OPERATION_KEYS, 'E_ATLAS_COUNTERFACTUAL_BRANCH_OPERATION_INVALID');
  const rebuilt = createAtlasCounterfactualBranch(input);
  if (hashCanonicalValue(value) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_COUNTERFACTUAL_BRANCH_MISMATCH');
  return value;
}
export function verifyAtlasCounterfactualProposal(value, input) {
  exact(value, PROPOSAL_KEYS, 'E_ATLAS_COUNTERFACTUAL_PROPOSAL_INVALID');
  exact(value.authority, AUTHORITY_KEYS, 'E_ATLAS_COUNTERFACTUAL_AUTHORITY_INVALID');
  const rebuilt = proposeAtlasCounterfactualImpact(input);
  if (hashCanonicalValue(value) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_COUNTERFACTUAL_PROPOSAL_MISMATCH');
  return value;
}
export function verifyAtlasCounterfactualDigests(branch, proposal) {
  exact(branch, BRANCH_KEYS, 'E_ATLAS_COUNTERFACTUAL_BRANCH_INVALID');
  exact(proposal, PROPOSAL_KEYS, 'E_ATLAS_COUNTERFACTUAL_PROPOSAL_INVALID');
  if (branch.branchDigest !== digest(identityWithout(branch, 'branchDigest'))) fail('E_ATLAS_COUNTERFACTUAL_BRANCH_DIGEST_MISMATCH');
  if (proposal.proposalDigest !== digest(identityWithout(proposal, 'proposalDigest'))) fail('E_ATLAS_COUNTERFACTUAL_PROPOSAL_DIGEST_MISMATCH');
  if (proposal.branchDigest !== branch.branchDigest) fail('E_ATLAS_COUNTERFACTUAL_PROPOSAL_BRANCH_MISMATCH');
  return freeze({ branch, proposal });
}
