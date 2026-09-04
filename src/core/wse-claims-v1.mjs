import { hashCanonicalValue } from './browser-safe-hash.mjs';

export const WSE_CLAIMS_SCHEMA_VERSION = 'yalken.r24.wseClaims.v1';
export const WSE_CLAIMS_STAGE_ID = 'WP-607_WSE_CLAIMS';
export const WSE_CLAIMS_PROFILE_ID = 'WSE_OPTIONAL_MODULES';
export const WSE_CLAIMS_MAX_MODULES = 4;
export const WSE_CLAIMS_MAX_INPUT_RECORDS_PER_MODULE = 10_000;
export const WSE_CLAIMS_MAX_VISIBLE_ROWS_PER_SOURCE_VIEW = 128;
export const WSE_CLAIMS_MAX_VISIBLE_ROWS_PER_MODULE = 512;
export const WSE_CLAIMS_MAX_OUTPUT_ROWS = 16;

const VIEW_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'userJobs', label: 'User jobs' }),
  Object.freeze({ id: 'noBloat', label: 'No bloat' }),
  Object.freeze({ id: 'corpus', label: 'Corpus' }),
  Object.freeze({ id: 'hardLimits', label: 'Hard limits' }),
]);
const MODULE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'stateEvidence', label: 'State & evidence', job: 'Inspect story state and its evidence', sourceStageId: 'WP-603_WSE_STATE_EVIDENCE' }),
  Object.freeze({ id: 'threadsExplanation', label: 'Threads & explanation', job: 'Explain setup, payoff, dependencies and why', sourceStageId: 'WP-604_WSE_THREADS_EXPLANATION' }),
  Object.freeze({ id: 'revisionTimeObject', label: 'Revision, time & objects', job: 'Review semantic diff, retcons, story clock and object custody', sourceStageId: 'WP-605_WSE_REVISION_TIME_OBJECT' }),
  Object.freeze({ id: 'seriesMultiLayer', label: 'Series & layers', job: 'Review series canon, layers, evidence capsule and agent context', sourceStageId: 'WP-606_WSE_SERIES_MULTI_LAYER' }),
]);
const MODULE_BY_ID = new Map(MODULE_DEFINITIONS.map((item) => [item.id, item]));
const INPUT_KEYS = Object.freeze(['currentIdentity', 'expectedIdentity', 'modules', 'rowLimit']);
const IDENTITY_KEYS = Object.freeze(['generation', 'projectId', 'sourceRevision']);
const MODULE_KEYS = Object.freeze(['generation', 'inputCount', 'maxViewVisibleCount', 'moduleId', 'omittedCount', 'projectId', 'projectionDigest', 'sourceRevision', 'state', 'visibleCount']);
const PRIVATE_FIELDS = new Set([
  'path', 'filepath', 'file_path', 'absolute_path', 'relative_path', 'source_path',
  'url', 'uri', 'content', 'text', 'bytes', 'byte_content', 'data', 'base64', 'raw',
  'buffer', 'secret', 'secrets', 'token', 'credentials', 'credential', 'password',
  'apikey', 'api_key', 'privatekey', 'private_key', 'ownerdata', 'privateownerdata',
  'command', 'commandid', 'effect', 'effectid', 'write', 'mutation', 'instructions',
]);
const ID_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._:@+-]{0,254}[A-Za-z0-9])?$/u;
const HEX64_RE = /^[0-9a-f]{64}$/u;

export const WSE_CLAIMS_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.wse.claims.v1',
  featureVersion: 1,
  stageId: WSE_CLAIMS_STAGE_ID,
  profileId: WSE_CLAIMS_PROFILE_ID,
  productPlane: 'EXISTING_REVISION_BOUND_WSE_DERIVED_PROJECTIONS',
  interfacePlane: 'EXISTING_ATLAS_CONTINUITY_RIGHT_RAIL_READ_ONLY_PROJECTION',
  commandIds: ['NOT_APPLICABLE_READ_ONLY_PROJECTION'],
  queryIds: ['wse.claims.project.v1'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  effectIds: ['NOT_APPLICABLE_NO_EFFECT'],
  productPorts: ['NOT_APPLICABLE_PURE_RETURN_VALUE'],
  designOsPorts: ['query.atlasContinuityLedgerSurface'],
  projectionIds: [WSE_CLAIMS_SCHEMA_VERSION],
  stateClasses: ['DERIVED_STATE', 'TRANSIENT_STATE'],
  identityKeys: ['projectId', 'sourceRevision', 'generation', 'projectionDigest'],
  sourceAuthority: 'CURRENT_IMMUTABLE_WSE_PROJECTION_METADATA',
  mutationAuthority: false,
  persistence: false,
  externalEffects: false,
  runtimeNetwork: false,
  fallbacks: ['ABSTAIN_EMPTY_CORPUS', 'ABSTAIN_UNAVAILABLE_PROJECTION'],
  recovery: 'REBUILD_FROM_CURRENT_IMMUTABLE_INPUTS',
  performanceBudget: {
    maximumModules: WSE_CLAIMS_MAX_MODULES,
    maximumInputRecordsPerModule: WSE_CLAIMS_MAX_INPUT_RECORDS_PER_MODULE,
    maximumVisibleRowsPerSourceView: WSE_CLAIMS_MAX_VISIBLE_ROWS_PER_SOURCE_VIEW,
    maximumVisibleRowsPerModule: WSE_CLAIMS_MAX_VISIBLE_ROWS_PER_MODULE,
    maximumOutputRows: WSE_CLAIMS_MAX_OUTPUT_ROWS,
  },
});

export const WSE_CLAIMS_SURFACE_MANIFEST_V1 = Object.freeze({
  schemaVersion: 'yalken.r24.wseClaims.surfaceManifest.v1',
  surfaceId: 'surface.atlas.continuityLedger.wseClaims',
  host: 'rightRail',
  slotId: 'rightRail.context.atlas.continuityLedger',
  contributionKind: 'readOnlyImmutableProjection',
  explicitOpenRequired: true,
  heavySurface: false,
  views: VIEW_DEFINITIONS,
  keyboardContract: {
    role: 'tablist',
    keys: ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'],
    listTextParity: true,
    pointerOnlyState: false,
  },
  productMutation: false,
  manuscriptMutation: false,
  storageAuthority: false,
});

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertOwnData(value, label = 'input', seen = new Set()) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (typeof value !== 'object' || seen.has(value)) fail('E_WP607_INPUT_NOT_PLAIN_DATA', label);
  seen.add(value);
  if (!Array.isArray(value) && !isPlainObject(value)) fail('E_WP607_INPUT_NOT_PLAIN_DATA', label);
  if (Object.getOwnPropertySymbols(value).length > 0) fail('E_WP607_INPUT_SYMBOL', label);
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) fail('E_WP607_INPUT_ACCESSOR', `${label}.${key}`);
    if (PRIVATE_FIELDS.has(key.toLowerCase())) fail('E_WP607_PRIVATE_OR_AUTHORITY_FIELD', `${label}.${key}`);
    assertOwnData(descriptor.value, `${label}.${key}`, seen);
  }
  seen.delete(value);
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail('E_WP607_OBJECT_REQUIRED', label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail('E_WP607_UNKNOWN_OR_MISSING_FIELD', label);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function identifier(value, label) {
  const normalized = text(value);
  if (!ID_RE.test(normalized)) fail('E_WP607_IDENTIFIER', label);
  return normalized;
}

function count(value, limit, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > limit) fail('E_WP607_RECORD_BUDGET', label);
  return value;
}

function identity(value, label) {
  exactKeys(value, IDENTITY_KEYS, label);
  const normalized = {
    projectId: identifier(value.projectId, `${label}.projectId`),
    sourceRevision: identifier(value.sourceRevision, `${label}.sourceRevision`),
    generation: value.generation,
  };
  if (!Number.isSafeInteger(normalized.generation) || normalized.generation < 0) fail('E_WP607_GENERATION', label);
  return normalized;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeDigest(value, label) {
  const normalized = text(value).replace(/^sha256:/u, '');
  if (!HEX64_RE.test(normalized)) fail('E_WP607_PROJECTION_DIGEST', label);
  return normalized;
}

function normalizeModule(value, expectedIdentity, index) {
  const label = `modules[${index}]`;
  exactKeys(value, MODULE_KEYS, label);
  const moduleId = identifier(value.moduleId, `${label}.moduleId`);
  if (!MODULE_BY_ID.has(moduleId)) fail('E_WP607_MODULE_ID', moduleId);
  const projectId = identifier(value.projectId, `${label}.projectId`);
  const sourceRevision = identifier(value.sourceRevision, `${label}.sourceRevision`);
  if (projectId !== expectedIdentity.projectId) fail('E_WP607_PROJECT_IDENTITY', moduleId);
  if (sourceRevision !== expectedIdentity.sourceRevision || value.generation !== expectedIdentity.generation) fail('E_WP607_STALE_MODULE', moduleId);
  if (!Number.isSafeInteger(value.generation) || value.generation < 0) fail('E_WP607_GENERATION', label);
  const inputCount = count(value.inputCount, WSE_CLAIMS_MAX_INPUT_RECORDS_PER_MODULE, `${label}.inputCount`);
  const maxViewVisibleCount = count(value.maxViewVisibleCount, WSE_CLAIMS_MAX_VISIBLE_ROWS_PER_SOURCE_VIEW, `${label}.maxViewVisibleCount`);
  const visibleCount = count(value.visibleCount, WSE_CLAIMS_MAX_VISIBLE_ROWS_PER_MODULE, `${label}.visibleCount`);
  const omittedCount = count(value.omittedCount, WSE_CLAIMS_MAX_INPUT_RECORDS_PER_MODULE, `${label}.omittedCount`);
  const state = text(value.state);
  if (!['ready', 'degraded', 'empty', 'emptyOrUnknown', 'unavailable'].includes(state)) fail('E_WP607_MODULE_STATE', moduleId);
  return {
    moduleId,
    projectId,
    sourceRevision,
    generation: value.generation,
    projectionDigest: normalizeDigest(value.projectionDigest, moduleId),
    state,
    inputCount,
    maxViewVisibleCount,
    visibleCount,
    omittedCount,
  };
}

function verdictRow(module, viewId) {
  const definition = MODULE_BY_ID.get(module.moduleId);
  const evidenceDigest = hashCanonicalValue({
    moduleId: module.moduleId,
    projectionDigest: module.projectionDigest,
    sourceRevision: module.sourceRevision,
    generation: module.generation,
    viewId,
  });
  if (viewId === 'userJobs') {
    const abstain = module.state === 'unavailable';
    return {
      moduleId: module.moduleId,
      moduleLabel: definition.label,
      status: abstain ? 'ABSTAIN' : 'PASS',
      reason: abstain ? 'PROJECTION_UNAVAILABLE' : 'USER_JOB_BOUND_TO_CURRENT_PROJECTION',
      detail: definition.job,
      evidenceDigest,
    };
  }
  if (viewId === 'noBloat') {
    return {
      moduleId: module.moduleId,
      moduleLabel: definition.label,
      status: 'PASS',
      reason: 'BOUNDED_READ_ONLY_MODULE_CONTRACT',
      detail: `${definition.sourceStageId} · no store, command, effect or runtime dependency`,
      evidenceDigest,
    };
  }
  if (viewId === 'corpus') {
    const pass = module.state === 'ready' && module.inputCount > 0;
    return {
      moduleId: module.moduleId,
      moduleLabel: definition.label,
      status: pass ? 'PASS' : 'ABSTAIN',
      reason: pass ? 'CURRENT_NON_EMPTY_CORPUS' : module.inputCount === 0 ? 'EMPTY_CORPUS' : 'CORPUS_NOT_FULLY_CURRENT',
      detail: `${module.inputCount} inputs · ${module.visibleCount} visible · ${module.omittedCount} omitted`,
      evidenceDigest,
    };
  }
  return {
    moduleId: module.moduleId,
    moduleLabel: definition.label,
    status: 'PASS',
    reason: 'HARD_LIMITS_VALIDATED_BEFORE_PUBLICATION',
    detail: `${module.inputCount}/${WSE_CLAIMS_MAX_INPUT_RECORDS_PER_MODULE} inputs · ${module.maxViewVisibleCount}/${WSE_CLAIMS_MAX_VISIBLE_ROWS_PER_SOURCE_VIEW} max per view · ${module.visibleCount}/${WSE_CLAIMS_MAX_VISIBLE_ROWS_PER_MODULE} visible`,
    evidenceDigest,
  };
}

function makeView(modules, view, rowLimit) {
  const allRows = modules.map((module) => verdictRow(module, view.id));
  const rows = allRows.slice(0, rowLimit);
  const passCount = allRows.filter((row) => row.status === 'PASS').length;
  const abstainCount = allRows.filter((row) => row.status === 'ABSTAIN').length;
  const failCount = allRows.filter((row) => row.status === 'FAIL').length;
  return {
    id: view.id,
    label: view.label,
    state: failCount ? 'fail' : abstainCount ? 'degraded' : 'pass',
    denominator: allRows.length,
    passCount,
    abstainCount,
    failCount,
    visibleCount: rows.length,
    omittedCount: Math.max(0, allRows.length - rows.length),
    rows,
  };
}

export function buildWseClaims(input = {}) {
  assertOwnData(input);
  exactKeys(input, INPUT_KEYS, 'input');
  const currentIdentity = identity(input.currentIdentity, 'currentIdentity');
  const expectedIdentity = identity(input.expectedIdentity, 'expectedIdentity');
  if (canonical(currentIdentity) !== canonical(expectedIdentity)) fail('E_WP607_STALE_IDENTITY');
  if (!Array.isArray(input.modules) || input.modules.length !== WSE_CLAIMS_MAX_MODULES) fail('E_WP607_MODULE_DENOMINATOR');
  const modules = input.modules.map((module, index) => normalizeModule(module, currentIdentity, index))
    .sort((left, right) => MODULE_DEFINITIONS.findIndex((item) => item.id === left.moduleId) - MODULE_DEFINITIONS.findIndex((item) => item.id === right.moduleId));
  if (new Set(modules.map((module) => module.moduleId)).size !== WSE_CLAIMS_MAX_MODULES) fail('E_WP607_DUPLICATE_MODULE');
  if (modules.some((module, index) => module.moduleId !== MODULE_DEFINITIONS[index].id)) fail('E_WP607_MODULE_SET');
  const rowLimit = input.rowLimit === undefined ? WSE_CLAIMS_MAX_MODULES : count(input.rowLimit, WSE_CLAIMS_MAX_MODULES, 'rowLimit');
  if (rowLimit < 1) fail('E_WP607_ROW_LIMIT');
  const views = Object.fromEntries(VIEW_DEFINITIONS.map((view) => [view.id, makeView(modules, view, rowLimit)]));
  const totalRows = Object.values(views).reduce((sum, view) => sum + view.denominator, 0);
  if (totalRows > WSE_CLAIMS_MAX_OUTPUT_ROWS) fail('E_WP607_OUTPUT_BUDGET');
  const base = {
    schemaVersion: WSE_CLAIMS_SCHEMA_VERSION,
    stageId: WSE_CLAIMS_STAGE_ID,
    profileId: WSE_CLAIMS_PROFILE_ID,
    identity: { ...currentIdentity, staleRejected: true },
    state: Object.values(views).some((view) => view.state === 'degraded') ? 'degraded' : 'ready',
    viewOrder: VIEW_DEFINITIONS.map((view) => view.id),
    views,
    denominator: {
      modules: modules.length,
      views: VIEW_DEFINITIONS.length,
      claimRows: totalRows,
      complete: true,
    },
    privacy: {
      metadataOnly: true,
      sourceContentIncluded: false,
      privateOwnerDataIncluded: false,
      pathsIncluded: false,
      secretsIncluded: false,
      networkUsed: false,
    },
    authority: {
      stateClass: 'DERIVED_STATE',
      readOnly: true,
      commandAuthority: false,
      productMutation: false,
      manuscriptMutation: false,
      persistence: false,
      externalEffects: false,
      agentInstructionAuthority: false,
    },
    featureManifest: WSE_CLAIMS_FEATURE_INTEGRATION_MANIFEST_V1,
    surfaceManifest: WSE_CLAIMS_SURFACE_MANIFEST_V1,
  };
  return deepFreeze({ ...base, projectionDigest: hashCanonicalValue(base) });
}

export function assertWseClaimsCurrent(projection, currentIdentity) {
  assertOwnData(projection, 'projection');
  const expectedIdentity = identity(currentIdentity, 'currentIdentity');
  if (!isPlainObject(projection) || !isPlainObject(projection.identity)) fail('E_WP607_PROJECTION_REQUIRED');
  const actualIdentity = {
    projectId: projection.identity.projectId,
    sourceRevision: projection.identity.sourceRevision,
    generation: projection.identity.generation,
  };
  if (canonical(actualIdentity) !== canonical(expectedIdentity)) fail('E_WP607_PROJECTION_STALE');
  const { projectionDigest, ...body } = projection;
  if (projectionDigest !== hashCanonicalValue(body)) fail('E_WP607_PROJECTION_TAMPER');
  return true;
}
