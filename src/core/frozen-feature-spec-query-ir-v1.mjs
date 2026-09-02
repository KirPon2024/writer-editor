import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { queryAtlasAssociations } from './atlas-associations-v1.mjs';

// A closed query vocabulary over declared association labels, not inferred facts,
// a plugin registry, or authority to install/execute a feature from its catalog.
export const FEATURE_QUERY_RELATION_TYPES_V1 = Object.freeze([
  'allyOf', 'causes', 'contains', 'contrasts', 'echoes', 'enables', 'fears',
  'follows', 'foreshadows', 'knows', 'locatedAt', 'mentions', 'opposes',
  'overlaps', 'owns', 'partOf', 'participatesIn', 'precedes', 'prevents',
  'requires', 'sameAs', 'wants',
]);
const UNDIRECTED = Object.freeze(['allyOf', 'contrasts', 'opposes', 'overlaps', 'sameAs']);
export const FEATURE_QUERY_LIMITS_V1 = Object.freeze({
  maxAssociations: 10_000, maxResults: 128, maxEvidenceReferences: 16_384,
  maxEntityIds: 128, maxRelations: 22, maxCatalogFeatures: 128,
});
const SPEC_SCHEMA = 'yalken.frozenFeatureSpec.v1';
const QUERY_SCHEMA = 'yalken.typedQueryIr.v1';
const RESULT_SCHEMA = 'yalken.derivedQueryReceipt.v1';
const AUTHORITY = Object.freeze({
  stateClass: 'DERIVED_STATE', productMutation: false, persistence: false,
  externalEffects: false, runtimeRegistry: false, commandAuthority: false,
});
const digest = (value) => `sha256:${hashCanonicalValue(value)}`;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const freeze = (value) => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

function object(value, keys, code = 'E_FEATURE_QUERY_OBJECT') {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(code);
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== 'string')
    || own.length !== keys.length || own.some((key) => !keys.includes(key))) fail(code);
  for (const key of own) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
  }
}
function array(value, maximum, code = 'E_FEATURE_QUERY_ARRAY') {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) fail(code);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
  }
}
function text(value) {
  if (typeof value !== 'string' || !value || value.length > 1024
    || value.trim() !== value || value.normalize('NFC') !== value
    || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)) fail('E_FEATURE_QUERY_TEXT');
  return value;
}
function integer(value, minimum, maximum, code = 'E_FEATURE_QUERY_LIMIT') {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}
function strings(value, maximum, minimum = 1) {
  array(value, maximum);
  if (value.length < minimum) fail('E_FEATURE_QUERY_EMPTY');
  const result = value.map(text);
  if (new Set(result).size !== result.length) fail('E_FEATURE_QUERY_DUPLICATE');
  return result.sort();
}
function relations(value) {
  const result = strings(value, FEATURE_QUERY_LIMITS_V1.maxRelations);
  if (result.some((type) => !FEATURE_QUERY_RELATION_TYPES_V1.includes(type))) fail('E_FEATURE_QUERY_RELATION');
  return result;
}
function assertDataTree(value, depth = 0, budget = { count: 0 }) {
  budget.count += 1;
  if (depth > 16 || budget.count > 50_000) fail('E_FEATURE_QUERY_RESULT_BOUND');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') { text(value); return; }
  if (typeof value === 'number') { integer(value, 0, Number.MAX_SAFE_INTEGER); return; }
  if (Array.isArray(value)) array(value, 16_384);
  else {
    if (!value || typeof value !== 'object') fail('E_FEATURE_QUERY_RESULT_DATA');
    const keys = Reflect.ownKeys(value);
    if (keys.length > 128) fail('E_FEATURE_QUERY_RESULT_BOUND');
    object(value, keys);
  }
  for (const child of Object.values(value)) assertDataTree(child, depth + 1, budget);
}

export const FEATURE_QUERY_FEATURE_INTEGRATION_MANIFEST_V1 = freeze({
  featureId: 'yalken.frozenFeatureSpecQueryIr.v1', featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:EXPLICIT_ATLAS_ASSOCIATION_QUERY_ADAPTER',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY',
  authoritativeData: 'VERIFIED_SNAPSHOT_AND_DECLARED_ASSOCIATIONS_READ_ONLY',
  derivedData: 'FROZEN_PLAN_TIME_SPEC_AND_REVISION_BOUND_QUERY_RECEIPT',
  commandIds: ['NOT_APPLICABLE_PURE_QUERY'], eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  queryIds: ['featureSpec.freeze.v1', 'featureQuery.compile.v1', 'featureQuery.atlasAssociations.v1'],
  productProjectionIds: [SPEC_SCHEMA, QUERY_SCHEMA, RESULT_SCHEMA],
  capabilityIds: ['NOT_APPLICABLE_NO_EFFECT_CAPABILITY'],
  authorityMap: 'PLAN_TIME_SPEC_NEVER_GRANTS_RUNTIME_OR_PRODUCT_AUTHORITY',
  identityKeys: ['projectId', 'projectRevisionId', 'snapshotId', 'projectionDigest', 'generation', 'specDigest', 'queryDigest'],
  revisionPolicy: 'EXACT_CURRENT_SNAPSHOT_AND_GENERATION_REQUIRED',
  writePath: 'IMMUTABLE_PURE_RETURN_VALUE_ONLY',
  readPath: 'EXPLICIT_VERIFIED_ATLAS_ASSOCIATIONS_ADAPTER',
  requiredProductPorts: ['EXISTING_PURE_ATLAS_ASSOCIATION_QUERY'],
  requiredDesignOsPorts: ['NOT_APPLICABLE_NO_INTERFACE_CHANGE'],
  adapterRequirements: ['NO_DYNAMIC_DISPATCH_OR_RUNTIME_REGISTRATION'],
  surfaceManifests: ['NOT_APPLICABLE_NO_UI_SURFACE'], slotRequirements: ['NOT_APPLICABLE'],
  supportedWorkspaces: ['NOT_APPLICABLE'], platformAvailability: 'PLATFORM_NEUTRAL_PURE_MODULE',
  accessibilityRequirements: 'NOT_APPLICABLE_NO_INTERACTIVE_SURFACE',
  fallbacks: ['UNKNOWN_NO_MATCHING_EVIDENCE', 'ABSTAIN_UNSUPPORTED_OR_OVER_BUDGET'],
  stateClasses: ['DERIVED_STATE'], persistenceClass: 'NOT_PERSISTED',
  migrations: ['NOT_APPLICABLE_NO_STORED_SCHEMA'], recovery: 'RECOMPUTE_FROM_VERIFIED_INPUTS',
  rollback: 'REVERT_BOUNDED_MODULE_AND_TEST_COMMIT', performanceBudget: FEATURE_QUERY_LIMITS_V1,
  securityBoundary: 'STRICT_OWN_DATA_BOUNDED_INPUT_NO_NETWORK_STORAGE_OR_PROVIDER',
  lifecycle: 'EXPLICIT_ON_DEMAND_QUERY_OFF_TYPING_PATH',
  negativeBypassChecks: ['CATALOG_NOT_EXECUTABLE', 'STALE_IDENTITY', 'TAMPERED_RECEIPT', 'BUDGET_NO_PARTIAL_SUCCESS'],
});

const SPEC_INPUT_KEYS = ['featureId', 'outcome', 'nonGoals', 'inputs', 'outputs', 'invariants', 'limits', 'threatProfile', 'rollback', 'corpus', 'relationTypes'];
export function freezeFeatureSpec(input) {
  object(input, SPEC_INPUT_KEYS);
  object(input.limits, ['maxAssociations', 'maxResults', 'maxEvidenceReferences']);
  const limits = Object.fromEntries(Object.keys(input.limits).map((key) => [key, integer(input.limits[key], 1, FEATURE_QUERY_LIMITS_V1[key])]));
  object(input.corpus, ['corpusId', 'normalCases', 'boundaryCases', 'adversarialCases', 'counterexampleCases', 'negativeDenominator']);
  const corpus = { corpusId: text(input.corpus.corpusId) };
  for (const key of ['normalCases', 'boundaryCases', 'adversarialCases', 'counterexampleCases']) corpus[key] = integer(input.corpus[key], 1, 100_000);
  corpus.negativeDenominator = integer(input.corpus.negativeDenominator, 3, 300_000);
  if (corpus.negativeDenominator !== corpus.boundaryCases + corpus.adversarialCases + corpus.counterexampleCases) fail('E_FEATURE_SPEC_NEGATIVE_DENOMINATOR');
  const value = {
    schemaVersion: SPEC_SCHEMA, catalogRole: 'PLAN_TIME_ONLY_NOT_RUNTIME_AUTHORITY',
    featureId: text(input.featureId), outcome: text(input.outcome),
    nonGoals: strings(input.nonGoals, 32), inputs: strings(input.inputs, 32), outputs: strings(input.outputs, 32),
    invariants: strings(input.invariants, 32), limits, threatProfile: strings(input.threatProfile, 32),
    rollback: text(input.rollback), corpus, relationTypes: relations(input.relationTypes), authority: AUTHORITY,
  };
  return freeze({ ...value, specDigest: digest(value) });
}

export function verifyFrozenFeatureSpec(spec) {
  object(spec, [...SPEC_INPUT_KEYS, 'schemaVersion', 'catalogRole', 'authority', 'specDigest']);
  // Rebuild the fixed authority fields, not just the caller's self-hash.
  const expected = freezeFeatureSpec(Object.fromEntries(SPEC_INPUT_KEYS.map((key) => [key, spec[key]])));
  assertDataTree(spec);
  if (digest(spec) !== digest(expected)) fail('E_FEATURE_SPEC_BINDING');
  return expected;
}

export function compileFeatureSpecCatalog(specs) {
  array(specs, FEATURE_QUERY_LIMITS_V1.maxCatalogFeatures);
  const features = specs.map(verifyFrozenFeatureSpec).sort((a, b) => a.featureId < b.featureId ? -1 : a.featureId > b.featureId ? 1 : 0);
  if (new Set(features.map((spec) => spec.featureId)).size !== features.length) fail('E_FEATURE_CATALOG_DUPLICATE');
  const value = { schemaVersion: 'yalken.featureSpecCatalog.v1', role: 'PLAN_TIME_ONLY_NOT_RUNTIME_AUTHORITY', features, featureDenominator: features.length, authority: AUTHORITY };
  return freeze({ ...value, catalogDigest: digest(value) });
}

const QUERY_INPUT_KEYS = ['queryId', 'relationTypes', 'entityIds', 'endpoint', 'limit'];
export function compileTypedQueryIr(specInput, input) {
  const spec = verifyFrozenFeatureSpec(specInput);
  object(input, QUERY_INPUT_KEYS);
  if (!['SOURCE', 'TARGET', 'EITHER'].includes(input.endpoint)) fail('E_FEATURE_QUERY_ENDPOINT');
  const value = {
    schemaVersion: QUERY_SCHEMA, featureId: spec.featureId, specDigest: spec.specDigest,
    queryId: text(input.queryId), relationTypes: relations(input.relationTypes),
    entityIds: strings(input.entityIds, FEATURE_QUERY_LIMITS_V1.maxEntityIds, 0), endpoint: input.endpoint,
    limit: integer(input.limit, 1, spec.limits.maxResults),
  };
  return freeze({ ...value, queryDigest: digest(value) });
}
export function verifyTypedQueryIr(spec, query) {
  object(query, [...QUERY_INPUT_KEYS, 'schemaVersion', 'featureId', 'specDigest', 'queryDigest']);
  const expected = compileTypedQueryIr(spec, Object.fromEntries(QUERY_INPUT_KEYS.map((key) => [key, query[key]])));
  assertDataTree(query);
  if (digest(query) !== digest(expected)) fail('E_FEATURE_QUERY_BINDING');
  return expected;
}

const EXECUTION_KEYS = ['spec', 'query', 'snapshot', 'currentSnapshotIdentity', 'projection', 'focusScope', 'generation', 'currentGeneration'];
export function queryFeatureAtlasAssociations(input) {
  object(input, EXECUTION_KEYS);
  const spec = verifyFrozenFeatureSpec(input.spec);
  const query = verifyTypedQueryIr(spec, input.query);
  integer(input.generation, 0, Number.MAX_SAFE_INTEGER);
  integer(input.currentGeneration, 0, Number.MAX_SAFE_INTEGER);
  if (input.generation !== input.currentGeneration) fail('E_FEATURE_QUERY_STALE_GENERATION');
  // Bound the raw array before the existing full projection verifier does work.
  const rowsDescriptor = input.projection && Object.getOwnPropertyDescriptor(input.projection, 'associations');
  if (!rowsDescriptor || !Object.hasOwn(rowsDescriptor, 'value')) fail('E_FEATURE_QUERY_PROJECTION');
  array(rowsDescriptor.value, FEATURE_QUERY_LIMITS_V1.maxAssociations, 'E_FEATURE_QUERY_HARD_ASSOCIATION_LIMIT');
  const scoped = queryAtlasAssociations({ snapshot: input.snapshot, currentSnapshotIdentity: input.currentSnapshotIdentity, projection: input.projection, focusScope: input.focusScope });
  const typed = scoped.applicableAssociations.filter((row) => query.relationTypes.includes(row.associationKind));
  for (const row of typed) {
    const expectedDirection = UNDIRECTED.includes(row.associationKind) ? 'UNDIRECTED' : 'DIRECTED';
    if (row.direction !== expectedDirection) fail('E_FEATURE_QUERY_TYPED_DIRECTION');
  }
  const entities = new Set(query.entityIds);
  const matches = typed.filter((row) => {
    if (entities.size === 0) return true;
    const source = entities.has(row.sourceEntityId), target = entities.has(row.targetEntityId);
    if (row.direction === 'UNDIRECTED' || query.endpoint === 'EITHER') return source || target;
    return query.endpoint === 'SOURCE' ? source : target;
  });
  const evidenceReferences = matches.reduce((sum, row) => sum + row.evidenceAnchorIds.length, 0);
  let reason = null;
  if (query.relationTypes.some((type) => !spec.relationTypes.includes(type))) reason = 'UNSUPPORTED_RELATION';
  else if (rowsDescriptor.value.length > spec.limits.maxAssociations) reason = 'ASSOCIATION_BUDGET';
  else if (matches.length > query.limit) reason = 'RESULT_BUDGET';
  else if (evidenceReferences > spec.limits.maxEvidenceReferences) reason = 'EVIDENCE_BUDGET';
  const rows = reason === null ? matches : [];
  const status = reason !== null ? 'ABSTAIN' : rows.length === 0 ? 'UNKNOWN' : 'OBSERVED';
  const value = {
    schemaVersion: RESULT_SCHEMA, featureId: spec.featureId, specDigest: spec.specDigest, queryDigest: query.queryDigest,
    projectId: input.snapshot.projectId, projectRevisionId: input.snapshot.projectRevisionId,
    snapshotId: scoped.snapshotId, projectionDigest: scoped.projectionDigest,
    scopedQueryDigest: scoped.queryDigest, generation: input.generation, focusScope: scoped.focusScope,
    status, reason: reason ?? (rows.length === 0 ? 'NO_MATCHING_DECLARED_EVIDENCE' : 'DECLARED_ASSOCIATIONS_ONLY_NOT_SEMANTIC_TRUTH'),
    denominator: { totalAssociations: rowsDescriptor.value.length, applicableAssociations: scoped.applicableAssociationCount,
      typedCandidates: typed.length, matchedAssociations: matches.length, emittedAssociations: rows.length,
      evidenceReferences, complete: reason === null },
    rows, authority: AUTHORITY, featureManifestDigest: digest(FEATURE_QUERY_FEATURE_INTEGRATION_MANIFEST_V1),
  };
  return freeze({ ...value, receiptDigest: digest(value) });
}

export function verifyFeatureQueryReceipt(receipt, input) {
  assertDataTree(receipt);
  const expected = queryFeatureAtlasAssociations(input);
  if (digest(receipt) !== digest(expected)) fail('E_FEATURE_QUERY_RECEIPT_MISMATCH');
  return expected;
}
