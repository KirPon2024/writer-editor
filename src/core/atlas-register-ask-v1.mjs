import { hashCanonicalValue } from './browser-safe-hash.mjs';
import {
  assertAtlasDossierLayoutLinksCurrent,
  verifyAtlasDossierProjectionDigest,
} from './atlas-dossier-layout-links-v1.mjs';

export const ATLAS_REGISTER_SCHEMA_VERSION = 'yalken.r24.atlasRegister.v1';
export const ATLAS_ASK_RESULT_SCHEMA_VERSION = 'yalken.r24.atlasAskResult.v1';
export const ATLAS_REGISTER_ASK_NODE_ID = 'WP-505_REGISTER_AND_ASK';
export const ATLAS_REGISTER_ASK_PROFILE_ID = 'ATLAS_PRODUCT_V33';
export const ATLAS_REGISTER_MAX_ENTRIES = 50_000;
export const ATLAS_ASK_MAX_CLAUSES = 16;
export const ATLAS_ASK_MAX_RESULTS = 128;

export const ATLAS_REGISTER_ORIGIN = Object.freeze({ AUTHORED: 'AUTHORED', COMPUTED: 'COMPUTED' });
export const ATLAS_AUTHORED_REGISTER_KIND = Object.freeze({ NOTE: 'NOTE', QUESTION: 'QUESTION', DECISION: 'DECISION' });
export const ATLAS_COMPUTED_REGISTER_KIND = 'DOSSIER';
export const ATLAS_QUERY_FIELD = Object.freeze({
  ORIGIN: 'ORIGIN', KIND: 'KIND', TAG: 'TAG', ENTITY_ID: 'ENTITY_ID', SCENE_ID: 'SCENE_ID',
  EVIDENCE_ID: 'EVIDENCE_ID', LABEL: 'LABEL',
});
export const ATLAS_QUERY_OPERATOR = Object.freeze({ EQ: 'EQ', CONTAINS: 'CONTAINS', PREFIX: 'PREFIX' });
export const ATLAS_QUERY_ORDER_FIELD = Object.freeze({ ENTRY_ID: 'ENTRY_ID', LABEL: 'LABEL', SOURCE_ID: 'SOURCE_ID' });
export const ATLAS_QUERY_DIRECTION = Object.freeze({ ASC: 'ASC', DESC: 'DESC' });

export const ATLAS_REGISTER_ASK_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.atlas.registerAsk.v1',
  featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:WP504_DOSSIER_LAYOUT_LINKS_READ_MODEL',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY',
  authoritativeData: 'CALLER_VERIFIED_AUTHORED_REGISTER_RECORDS_AND_EXACT_WP504_DOSSIER_PROJECTION',
  derivedData: 'REVISION_BOUND_AUTHORED_COMPUTED_REGISTER_AND_BOUNDED_QUERY_IR_RESULTS',
  commandIds: ['NOT_APPLICABLE_PURE_QUERY_NO_MUTATION'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  queryIds: ['atlas.register.compile.v1', 'atlas.ask.queryIr.v1'],
  productProjectionIds: [ATLAS_REGISTER_SCHEMA_VERSION, ATLAS_ASK_RESULT_SCHEMA_VERSION],
  capabilityIds: ['cap.atlas.register.read', 'cap.atlas.ask.query'],
  authorityMap: 'PRODUCT_CORE_INPUTS_READ_ONLY_DERIVED_PROJECTOR_OUTPUT_ONLY',
  identityKeys: ['projectId', 'projectRevisionId', 'snapshotId', 'generation', 'sharedRowSetDigest', 'dossierProjectionDigest', 'projectionDigest', 'queryDigest'],
  revisionPolicy: 'EXACT_WP504_PROJECTION_AND_AUTHORED_SET_IDENTITY_STALE_REJECTED',
  writePath: 'PURE_RETURN_VALUE_ONLY',
  readPath: 'VERIFIED_WP504_DOSSIERS_AND_CALLER_VERIFIED_AUTHORED_RECORDS',
  requiredProductPorts: ['WorkspaceQueryPort'],
  requiredDesignOsPorts: ['DomainProjectionPort', 'ShellProjectionPort'],
  adapterRequirements: ['renderer-adapter:atlas-register-ask-read-model'],
  surfaceManifests: ['surface.atlas.workspace.register', 'surface.atlas.workspace.ask'],
  slotRequirements: ['workspace.write.atlas.register', 'workspace.write.atlas.ask'],
  supportedWorkspaces: ['WRITE', 'PLAN', 'REVIEW'],
  accessibilityRequirements: ['typed-text-results', 'origin-kind-source-labels', 'explicit-empty-and-truncated-states'],
  fallbacks: ['EMPTY_REGISTER_WITHOUT_SYNTHETIC_FACTS', 'TEXTUAL_RESULTS_ONLY', 'UNSUPPORTED_QUERY_FAILS_CLOSED'],
  stateClasses: ['DERIVED_STATE'],
  persistenceClass: 'NOT_PERSISTED_BY_THIS_MODULE',
  migrations: ['NOT_APPLICABLE_NO_STORED_SCHEMA'],
  recovery: 'RECOMPILE_FROM_EXACT_WP504_PROJECTION_AND_AUTHORED_RECORDS',
  rollback: 'REVERT_BOUNDED_MODULE_RENDERER_ADAPTER_AND_TEST_COMMIT',
  performanceBudget: { maximumEntries: ATLAS_REGISTER_MAX_ENTRIES, maximumClauses: ATLAS_ASK_MAX_CLAUSES, maximumResults: ATLAS_ASK_MAX_RESULTS, complexity: 'O(entries_times_bounded_clauses)' },
  securityBoundary: 'STRICT_OWN_DATA_EXACT_KEYSETS_NFC_BOUNDED_DENOMINATORS_NO_ACCESSORS_SYMBOLS_PATHS_URLS_COMMANDS_NETWORK_EXTERNAL_AI_OR_EFFECT_AUTHORITY',
  lifecycle: 'ON_DEMAND_PURE_COMPILATION_AND_QUERY',
  negativeBypassChecks: ['FORGED_COMPUTED_ENTRY_REJECTED', 'STALE_IDENTITY_REJECTED', 'UNKNOWN_OR_OVERSIZED_QUERY_REJECTED', 'MISSING_FUTURE_OR_DUPLICATE_EVIDENCE_REJECTED', 'PROJECTION_AND_RESULT_TAMPER_REJECTED', 'PRODUCT_MUTATION_PERSISTENCE_AND_EXTERNAL_EFFECT_AUTHORITY_REJECTED'],
  evidenceBindings: ['WP504_EXTERNALLY_VERIFIED_PREDECESSOR', 'WP505_MODEL_CONTRACT_INTEGRATION_MUTANTS_DIFFERENTIAL_STALE_LARGE_CORPUS'],
  currentReality: 'ONE_PURE_REVISION_BOUND_REGISTER_PROJECTION_AND_CLOSED_LOCAL_QUERY_IR_ASK_RESULT',
});

const CURRENT_IDENTITY_KEYS = Object.freeze(['generation', 'projectRevisionId', 'sharedRowSetDigest', 'snapshotId']);
const AUTHORED_KEYS = Object.freeze(['body', 'entryId', 'evidenceIds', 'kind', 'label', 'sourceId', 'sourceRevisionDigest', 'tags']);
const AUTHORED_IDENTITY_KEYS = Object.freeze(['entryCount', 'entrySetDigest', 'generation', 'projectRevisionId', 'sharedRowSetDigest', 'snapshotId']);
const COMPILE_INPUT_KEYS = Object.freeze(['authoredEntries', 'authoredIdentity', 'currentIdentity', 'dossierProjection']);
const ENTRY_KEYS = Object.freeze(['body', 'computedFromDossierId', 'entityIds', 'entryDigest', 'entryId', 'evidenceIds', 'kind', 'label', 'origin', 'sceneIds', 'sourceId', 'sourceRevisionDigest', 'tags']);
const AUTHORITY_KEYS = Object.freeze(['commandAuthority', 'externalAi', 'externalEffects', 'network', 'persistence', 'productMutation', 'rendererWiring', 'stateClass']);
const PROJECTION_KEYS = Object.freeze(['authoredEntrySetDigest', 'authority', 'computedFromDossierProjectionDigest', 'denominator', 'entries', 'featureManifestDigest', 'generation', 'profileId', 'projectId', 'projectRevisionId', 'projectionDigest', 'schemaVersion', 'sharedRowSetDigest', 'snapshotId', 'stageId']);
const QUERY_KEYS = Object.freeze(['clauses', 'limit', 'orderBy']);
const CLAUSE_KEYS = Object.freeze(['field', 'operator', 'value']);
const ORDER_KEYS = Object.freeze(['direction', 'field']);
const ASK_INPUT_KEYS = Object.freeze(['currentIdentity', 'query', 'registerProjection']);
const RESULT_KEYS = Object.freeze(['authority', 'entries', 'generation', 'profileId', 'projectId', 'projectRevisionId', 'queryDigest', 'registerProjectionDigest', 'resultDigest', 'returned', 'schemaVersion', 'sharedRowSetDigest', 'snapshotId', 'stageId', 'totalMatched', 'truncated']);
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export class AtlasRegisterAskError extends Error {
  constructor(code, detail = '') { super(detail ? `${code}: ${detail}` : code); this.name = 'AtlasRegisterAskError'; this.code = code; this.detail = detail; }
}
function fail(code, detail = '') { throw new AtlasRegisterAskError(code, detail); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function digest(value) { return `sha256:${hashCanonicalValue(value)}`; }
function plain(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function exact(value, keys, code) {
  if (!plain(value)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
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
function identifier(value, code, maximum = 2048, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value) || value.length > maximum || value !== value.trim() || value !== value.normalize('NFC') || /[\u0000-\u001f\u007f]/u.test(value)) fail(code);
  return value;
}
function digestValue(value, code) { if (typeof value !== 'string' || !DIGEST.test(value)) fail(code); return value; }
function integer(value, code, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code); return value; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) freeze(child); return Object.freeze(value); }
function canonicalStrings(values, code) {
  dense(values, code);
  const normalized = values.map((value) => identifier(value, code));
  if (new Set(normalized).size !== normalized.length) fail(code, 'DUPLICATE');
  if (normalized.some((value, index) => index > 0 && compare(normalized[index - 1], value) >= 0)) fail(code, 'CANONICAL_ORDER_REQUIRED');
  return normalized;
}
function assertIdentityValues(identity, code) {
  exact(identity, CURRENT_IDENTITY_KEYS, code);
  identifier(identity.snapshotId, code);
  digestValue(identity.projectRevisionId, code);
  integer(identity.generation, code);
  digestValue(identity.sharedRowSetDigest, code);
}
function projectionIdentity(value) { const { projectionDigest, ...identity } = value; return identity; }
function resultIdentity(value) { const { resultDigest, ...identity } = value; return identity; }

function normalizeAuthoredEntry(entry, currentIdentity) {
  exact(entry, AUTHORED_KEYS, 'E_ATLAS_REGISTER_AUTHORED_ENTRY_INVALID');
  const entryId = identifier(entry.entryId, 'E_ATLAS_REGISTER_AUTHORED_ID_INVALID');
  if (entryId.startsWith('computed:')) fail('E_ATLAS_REGISTER_AUTHORED_RESERVED_ID');
  const kind = identifier(entry.kind, 'E_ATLAS_REGISTER_AUTHORED_KIND_INVALID');
  if (!Object.values(ATLAS_AUTHORED_REGISTER_KIND).includes(kind)) fail('E_ATLAS_REGISTER_AUTHORED_KIND_INVALID');
  const sourceRevisionDigest = digestValue(entry.sourceRevisionDigest, 'E_ATLAS_REGISTER_AUTHORED_REVISION_INVALID');
  if (sourceRevisionDigest !== currentIdentity.projectRevisionId) fail('E_ATLAS_REGISTER_AUTHORED_REVISION_STALE');
  return freeze({
    entryId,
    kind,
    label: identifier(entry.label, 'E_ATLAS_REGISTER_AUTHORED_LABEL_INVALID', 4096),
    body: identifier(entry.body, 'E_ATLAS_REGISTER_AUTHORED_BODY_INVALID', 16_384),
    sourceId: identifier(entry.sourceId, 'E_ATLAS_REGISTER_AUTHORED_SOURCE_INVALID'),
    sourceRevisionDigest,
    evidenceIds: canonicalStrings(entry.evidenceIds, 'E_ATLAS_REGISTER_AUTHORED_EVIDENCE_INVALID'),
    tags: canonicalStrings(entry.tags, 'E_ATLAS_REGISTER_AUTHORED_TAGS_INVALID'),
  });
}

export function createAtlasAuthoredRegisterIdentity(authoredEntries, currentIdentity) {
  assertIdentityValues(currentIdentity, 'E_ATLAS_REGISTER_CURRENT_IDENTITY_INVALID');
  dense(authoredEntries, 'E_ATLAS_REGISTER_AUTHORED_ARRAY_INVALID');
  const normalized = authoredEntries.map((entry) => normalizeAuthoredEntry(entry, currentIdentity)).sort((left, right) => compare(left.entryId, right.entryId));
  if (new Set(normalized.map((entry) => entry.entryId)).size !== normalized.length) fail('E_ATLAS_REGISTER_AUTHORED_ID_DUPLICATE');
  return freeze({
    projectRevisionId: currentIdentity.projectRevisionId,
    snapshotId: currentIdentity.snapshotId,
    generation: currentIdentity.generation,
    sharedRowSetDigest: currentIdentity.sharedRowSetDigest,
    entryCount: normalized.length,
    entrySetDigest: digest(normalized),
  });
}

function authoredRegisterEntry(entry) {
  const normalized = {
    entryId: entry.entryId,
    origin: ATLAS_REGISTER_ORIGIN.AUTHORED,
    kind: entry.kind,
    label: entry.label,
    body: entry.body,
    sourceId: entry.sourceId,
    sourceRevisionDigest: entry.sourceRevisionDigest,
    evidenceIds: [...entry.evidenceIds],
    entityIds: [],
    sceneIds: [],
    tags: [...entry.tags],
    computedFromDossierId: '',
  };
  return freeze({ ...normalized, entryDigest: digest(normalized) });
}

function computedRegisterEntry(dossier) {
  const normalized = {
    entryId: `computed:${dossier.rowId}`,
    origin: ATLAS_REGISTER_ORIGIN.COMPUTED,
    kind: ATLAS_COMPUTED_REGISTER_KIND,
    label: dossier.label,
    body: `${dossier.sheetId}:${dossier.status}`,
    sourceId: dossier.sourceId,
    sourceRevisionDigest: dossier.sourceDigest,
    evidenceIds: dossier.evidence.map((record) => record.evidenceId).sort(compare),
    entityIds: [...dossier.entityIds].sort(compare),
    sceneIds: [...dossier.sceneIds].sort(compare),
    tags: [dossier.sheetId, dossier.status].sort(compare),
    computedFromDossierId: dossier.dossierId,
  };
  return freeze({ ...normalized, entryDigest: digest(normalized) });
}

export function compileAtlasRegister(input) {
  exact(input, COMPILE_INPUT_KEYS, 'E_ATLAS_REGISTER_INPUT_INVALID');
  assertIdentityValues(input.currentIdentity, 'E_ATLAS_REGISTER_CURRENT_IDENTITY_INVALID');
  const dossierProjection = verifyAtlasDossierProjectionDigest(assertAtlasDossierLayoutLinksCurrent(input.dossierProjection, input.currentIdentity));
  dense(input.authoredEntries, 'E_ATLAS_REGISTER_AUTHORED_ARRAY_INVALID');
  if (input.authoredEntries.length + dossierProjection.dossiers.length > ATLAS_REGISTER_MAX_ENTRIES) fail('E_ATLAS_REGISTER_DENOMINATOR_BOUND');
  const authored = input.authoredEntries.map((entry) => normalizeAuthoredEntry(entry, input.currentIdentity)).sort((left, right) => compare(left.entryId, right.entryId));
  if (new Set(authored.map((entry) => entry.entryId)).size !== authored.length) fail('E_ATLAS_REGISTER_AUTHORED_ID_DUPLICATE');
  exact(input.authoredIdentity, AUTHORED_IDENTITY_KEYS, 'E_ATLAS_REGISTER_AUTHORED_IDENTITY_INVALID');
  for (const key of CURRENT_IDENTITY_KEYS) if (input.authoredIdentity[key] !== input.currentIdentity[key]) fail('E_ATLAS_REGISTER_AUTHORED_IDENTITY_STALE', key);
  if (input.authoredIdentity.entryCount !== authored.length || input.authoredIdentity.entrySetDigest !== digest(authored)) fail('E_ATLAS_REGISTER_AUTHORED_IDENTITY_MISMATCH');
  const knownEvidenceIds = new Set(dossierProjection.dossiers.flatMap((dossier) => dossier.evidence.map((record) => record.evidenceId)));
  for (const entry of authored) if (entry.evidenceIds.some((evidenceId) => !knownEvidenceIds.has(evidenceId))) fail('E_ATLAS_REGISTER_AUTHORED_EVIDENCE_UNKNOWN', entry.entryId);
  const authoredEntries = authored.map(authoredRegisterEntry);
  const computedEntries = dossierProjection.dossiers.map(computedRegisterEntry).sort((left, right) => compare(left.entryId, right.entryId));
  if (computedEntries.length !== dossierProjection.dossiers.length) fail('E_ATLAS_REGISTER_COMPUTED_DENOMINATOR_MISMATCH');
  const entries = [...authoredEntries, ...computedEntries].sort((left, right) => compare(left.entryId, right.entryId));
  if (new Set(entries.map((entry) => entry.entryId)).size !== entries.length) fail('E_ATLAS_REGISTER_ENTRY_ID_DUPLICATE');
  const denominator = freeze({ authored: authoredEntries.length, computed: computedEntries.length, dossierSources: dossierProjection.dossiers.length, total: entries.length, evidenceUniverse: knownEvidenceIds.size });
  if (denominator.total !== denominator.authored + denominator.computed || denominator.computed !== denominator.dossierSources) fail('E_ATLAS_REGISTER_DENOMINATOR_MISMATCH');
  const authority = freeze({ stateClass: 'DERIVED_STATE', productMutation: false, persistence: false, rendererWiring: false, externalEffects: false, network: false, externalAi: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' });
  const normalized = {
    schemaVersion: ATLAS_REGISTER_SCHEMA_VERSION,
    stageId: ATLAS_REGISTER_ASK_NODE_ID,
    profileId: ATLAS_REGISTER_ASK_PROFILE_ID,
    projectId: dossierProjection.projectId,
    projectRevisionId: dossierProjection.projectRevisionId,
    snapshotId: dossierProjection.snapshotId,
    generation: dossierProjection.generation,
    sharedRowSetDigest: dossierProjection.sharedRowSetDigest,
    computedFromDossierProjectionDigest: dossierProjection.projectionDigest,
    authoredEntrySetDigest: digest(authored),
    entries,
    denominator,
    authority,
    featureManifestDigest: digest(ATLAS_REGISTER_ASK_FEATURE_INTEGRATION_MANIFEST_V1),
  };
  return freeze({ ...normalized, projectionDigest: digest(normalized) });
}

export function assertAtlasRegisterCurrent(projection, currentIdentity) {
  exact(projection, PROJECTION_KEYS, 'E_ATLAS_REGISTER_PROJECTION_INVALID');
  assertIdentityValues(currentIdentity, 'E_ATLAS_REGISTER_CURRENT_IDENTITY_INVALID');
  for (const key of CURRENT_IDENTITY_KEYS) if (projection[key] !== currentIdentity[key]) fail('E_ATLAS_REGISTER_STALE', key);
  return projection;
}

export function verifyAtlasRegisterProjection(projection, input) {
  const rebuilt = compileAtlasRegister(input);
  if (hashCanonicalValue(projection) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_REGISTER_PROJECTION_MISMATCH');
  return projection;
}

export function verifyAtlasRegisterProjectionDigest(projection) {
  exact(projection, PROJECTION_KEYS, 'E_ATLAS_REGISTER_PROJECTION_INVALID');
  if (projection.projectionDigest !== digest(projectionIdentity(projection))) fail('E_ATLAS_REGISTER_PROJECTION_DIGEST_MISMATCH');
  return projection;
}

function normalizeQuery(query) {
  exact(query, QUERY_KEYS, 'E_ATLAS_ASK_QUERY_INVALID');
  dense(query.clauses, 'E_ATLAS_ASK_CLAUSES_INVALID');
  if (query.clauses.length > ATLAS_ASK_MAX_CLAUSES) fail('E_ATLAS_ASK_CLAUSE_BOUND');
  const clauses = query.clauses.map((clause) => {
    exact(clause, CLAUSE_KEYS, 'E_ATLAS_ASK_CLAUSE_INVALID');
    const field = identifier(clause.field, 'E_ATLAS_ASK_FIELD_INVALID');
    const operator = identifier(clause.operator, 'E_ATLAS_ASK_OPERATOR_INVALID');
    const value = identifier(clause.value, 'E_ATLAS_ASK_VALUE_INVALID', 4096);
    const allowed = {
      ORIGIN: ['EQ'], KIND: ['EQ'], TAG: ['CONTAINS'], ENTITY_ID: ['CONTAINS'],
      SCENE_ID: ['CONTAINS'], EVIDENCE_ID: ['CONTAINS'], LABEL: ['PREFIX'],
    };
    if (!Object.prototype.hasOwnProperty.call(allowed, field) || !allowed[field].includes(operator)) fail('E_ATLAS_ASK_FIELD_OPERATOR_INVALID', `${field}:${operator}`);
    if (field === ATLAS_QUERY_FIELD.ORIGIN && !Object.values(ATLAS_REGISTER_ORIGIN).includes(value)) fail('E_ATLAS_ASK_ORIGIN_VALUE_INVALID');
    return freeze({ field, operator, value });
  });
  const clauseKeys = clauses.map((clause) => `${clause.field}\u0000${clause.operator}\u0000${clause.value}`);
  if (new Set(clauseKeys).size !== clauseKeys.length) fail('E_ATLAS_ASK_CLAUSE_DUPLICATE');
  if (clauseKeys.some((value, index) => index > 0 && compare(clauseKeys[index - 1], value) >= 0)) fail('E_ATLAS_ASK_CLAUSE_ORDER');
  exact(query.orderBy, ORDER_KEYS, 'E_ATLAS_ASK_ORDER_INVALID');
  const field = identifier(query.orderBy.field, 'E_ATLAS_ASK_ORDER_FIELD_INVALID');
  const direction = identifier(query.orderBy.direction, 'E_ATLAS_ASK_ORDER_DIRECTION_INVALID');
  if (!Object.values(ATLAS_QUERY_ORDER_FIELD).includes(field)) fail('E_ATLAS_ASK_ORDER_FIELD_INVALID');
  if (!Object.values(ATLAS_QUERY_DIRECTION).includes(direction)) fail('E_ATLAS_ASK_ORDER_DIRECTION_INVALID');
  const limit = integer(query.limit, 'E_ATLAS_ASK_LIMIT_INVALID', 1, ATLAS_ASK_MAX_RESULTS);
  return freeze({ clauses, limit, orderBy: freeze({ field, direction }) });
}

function clauseMatches(entry, clause) {
  if (clause.field === ATLAS_QUERY_FIELD.ORIGIN) return entry.origin === clause.value;
  if (clause.field === ATLAS_QUERY_FIELD.KIND) return entry.kind === clause.value;
  if (clause.field === ATLAS_QUERY_FIELD.TAG) return entry.tags.includes(clause.value);
  if (clause.field === ATLAS_QUERY_FIELD.ENTITY_ID) return entry.entityIds.includes(clause.value);
  if (clause.field === ATLAS_QUERY_FIELD.SCENE_ID) return entry.sceneIds.includes(clause.value);
  if (clause.field === ATLAS_QUERY_FIELD.EVIDENCE_ID) return entry.evidenceIds.includes(clause.value);
  if (clause.field === ATLAS_QUERY_FIELD.LABEL) return entry.label.toLowerCase().startsWith(clause.value.toLowerCase());
  fail('E_ATLAS_ASK_FIELD_INVALID');
}

function orderValue(entry, field) {
  if (field === ATLAS_QUERY_ORDER_FIELD.ENTRY_ID) return entry.entryId;
  if (field === ATLAS_QUERY_ORDER_FIELD.LABEL) return entry.label;
  if (field === ATLAS_QUERY_ORDER_FIELD.SOURCE_ID) return entry.sourceId;
  fail('E_ATLAS_ASK_ORDER_FIELD_INVALID');
}

export function askAtlas(input) {
  exact(input, ASK_INPUT_KEYS, 'E_ATLAS_ASK_INPUT_INVALID');
  const projection = verifyAtlasRegisterProjectionDigest(assertAtlasRegisterCurrent(input.registerProjection, input.currentIdentity));
  const query = normalizeQuery(input.query);
  const direction = query.orderBy.direction === ATLAS_QUERY_DIRECTION.ASC ? 1 : -1;
  const matched = projection.entries
    .filter((entry) => query.clauses.every((clause) => clauseMatches(entry, clause)))
    .sort((left, right) => direction * (compare(orderValue(left, query.orderBy.field), orderValue(right, query.orderBy.field)) || compare(left.entryId, right.entryId)));
  const entries = matched.slice(0, query.limit);
  const authority = freeze({ stateClass: 'DERIVED_STATE', productMutation: false, persistence: false, rendererWiring: false, externalEffects: false, network: false, externalAi: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' });
  const normalized = {
    schemaVersion: ATLAS_ASK_RESULT_SCHEMA_VERSION,
    stageId: ATLAS_REGISTER_ASK_NODE_ID,
    profileId: ATLAS_REGISTER_ASK_PROFILE_ID,
    projectId: projection.projectId,
    projectRevisionId: projection.projectRevisionId,
    snapshotId: projection.snapshotId,
    generation: projection.generation,
    sharedRowSetDigest: projection.sharedRowSetDigest,
    registerProjectionDigest: projection.projectionDigest,
    queryDigest: digest(query),
    totalMatched: matched.length,
    returned: entries.length,
    truncated: matched.length > entries.length,
    entries,
    authority,
  };
  return freeze({ ...normalized, resultDigest: digest(normalized) });
}

export function verifyAtlasAskResult(result, input) {
  exact(result, RESULT_KEYS, 'E_ATLAS_ASK_RESULT_INVALID');
  exact(result.authority, AUTHORITY_KEYS, 'E_ATLAS_ASK_AUTHORITY_INVALID');
  dense(result.entries, 'E_ATLAS_ASK_RESULT_ENTRIES_INVALID');
  for (const entry of result.entries) exact(entry, ENTRY_KEYS, 'E_ATLAS_ASK_RESULT_ENTRY_INVALID');
  const rebuilt = askAtlas(input);
  if (hashCanonicalValue(result) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_ASK_RESULT_MISMATCH');
  return result;
}

export function verifyAtlasAskResultDigest(result) {
  exact(result, RESULT_KEYS, 'E_ATLAS_ASK_RESULT_INVALID');
  if (result.resultDigest !== digest(resultIdentity(result))) fail('E_ATLAS_ASK_RESULT_DIGEST_MISMATCH');
  return result;
}
