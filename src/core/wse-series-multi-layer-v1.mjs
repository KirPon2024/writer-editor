import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { createEvidenceCapsuleExport } from './evidence-capsule-export-v1.mjs';

export const WSE_SERIES_MULTI_LAYER_SCHEMA_VERSION = 'yalken.r24.wseSeriesMultiLayer.v1';
export const WSE_SERIES_MULTI_LAYER_STAGE_ID = 'WP-606_WSE_SERIES_MULTI_LAYER';
export const WSE_SERIES_MULTI_LAYER_PROFILE_ID = 'WSE_OPTIONAL_MODULES';
export const WSE_SERIES_MULTI_LAYER_MAX_LAYERS = 16;
export const WSE_SERIES_MULTI_LAYER_MAX_ROWS = 128;
export const WSE_SERIES_MULTI_LAYER_MAX_INPUT_RECORDS = 10_000;

const VIEWS = Object.freeze([
  Object.freeze({ id: 'seriesCanon', label: 'Series canon' }),
  Object.freeze({ id: 'multiLayerAtlas', label: 'Multi-layer atlas' }),
  Object.freeze({ id: 'evidenceCapsule', label: 'Evidence capsule' }),
  Object.freeze({ id: 'agentContextPacket', label: 'Agent context' }),
]);
const INPUT_KEYS = Object.freeze(['currentIdentity', 'expectedIdentity', 'identityLinks', 'layers', 'rowLimit', 'seriesManifest']);
const IDENTITY_KEYS = Object.freeze(['entityId', 'generation', 'projectId', 'sourceRevision']);
const LAYER_KEYS = Object.freeze(['label', 'layerId', 'projectionDigest', 'recordCount', 'state']);
const PRIVATE_FIELDS = new Set([
  'path', 'filepath', 'file_path', 'absolute_path', 'relative_path', 'source_path',
  'url', 'uri', 'content', 'text', 'bytes', 'byte_content', 'data', 'base64', 'raw',
  'buffer', 'secret', 'secrets', 'token', 'credentials', 'credential', 'password',
  'apikey', 'api_key', 'privatekey', 'private_key', 'ownerdata', 'privateownerdata',
]);
const ID_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._:@+-]{0,254}[A-Za-z0-9])?$/u;
const HEX64_RE = /^[0-9a-f]{64}$/u;

export const WSE_SERIES_MULTI_LAYER_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.wse.seriesMultiLayer.v1',
  featureVersion: 1,
  stageId: WSE_SERIES_MULTI_LAYER_STAGE_ID,
  profileId: WSE_SERIES_MULTI_LAYER_PROFILE_ID,
  productPlane: 'EXISTING_AUTHOR_CONFIRMED_SERIES_IDENTITIES_AND_IMMUTABLE_DERIVED_PROJECTIONS',
  interfacePlane: 'EXISTING_ATLAS_CONTINUITY_RIGHT_RAIL_READ_ONLY_PROJECTION',
  commandIds: ['NOT_APPLICABLE_READ_ONLY_PROJECTION'],
  queryIds: ['wse.seriesMultiLayer.project.v1'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  effectIds: ['NOT_APPLICABLE_NO_EFFECT'],
  productPorts: ['NOT_APPLICABLE_PURE_RETURN_VALUE'],
  designOsPorts: ['query.atlasContinuityLedgerSurface'],
  projectionIds: [WSE_SERIES_MULTI_LAYER_SCHEMA_VERSION],
  stateClasses: ['DERIVED_STATE', 'TRANSIENT_STATE'],
  identityKeys: ['projectId', 'entityId', 'sourceRevision', 'generation', 'projectionDigest'],
  sourceAuthority: 'PRODUCT_CORE_AUTHOR_CONFIRMED_SERIES_IDENTITY_AND_REVISION_BOUND_DERIVED_PROJECTIONS',
  mutationAuthority: false,
  persistence: false,
  externalEffects: false,
  runtimeNetwork: false,
  fallbacks: ['EMPTY_NO_SERIES_LINKS', 'UNKNOWN_LAYER_PROJECTION', 'UNKNOWN_EVIDENCE_PROFILE'],
  recovery: 'REBUILD_FROM_CURRENT_IMMUTABLE_INPUTS',
  performanceBudget: {
    maximumInputRecords: WSE_SERIES_MULTI_LAYER_MAX_INPUT_RECORDS,
    maximumLayers: WSE_SERIES_MULTI_LAYER_MAX_LAYERS,
    maximumVisibleRowsPerView: WSE_SERIES_MULTI_LAYER_MAX_ROWS,
    maximumEvidenceCapsuleBytes: 1_048_576,
  },
});

export const WSE_SERIES_MULTI_LAYER_SURFACE_MANIFEST_V1 = Object.freeze({
  schemaVersion: 'yalken.r24.wseSeriesMultiLayer.surfaceManifest.v1',
  surfaceId: 'surface.atlas.continuityLedger.seriesMultiLayer',
  host: 'rightRail',
  slotId: 'rightRail.context.atlas.continuityLedger',
  contributionKind: 'readOnlyImmutableProjection',
  explicitOpenRequired: true,
  heavySurface: true,
  views: VIEWS,
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
  if (typeof value !== 'object' || seen.has(value)) fail('E_WP606_INPUT_NOT_PLAIN_DATA', label);
  seen.add(value);
  if (!Array.isArray(value) && !isPlainObject(value)) fail('E_WP606_INPUT_NOT_PLAIN_DATA', label);
  if (Object.getOwnPropertySymbols(value).length > 0) fail('E_WP606_INPUT_SYMBOL', label);
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) fail('E_WP606_INPUT_ACCESSOR', `${label}.${key}`);
    if (PRIVATE_FIELDS.has(key.toLowerCase())) fail('E_WP606_PRIVATE_FIELD', `${label}.${key}`);
    assertOwnData(descriptor.value, `${label}.${key}`, seen);
  }
  seen.delete(value);
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail('E_WP606_OBJECT_REQUIRED', label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail('E_WP606_UNKNOWN_OR_MISSING_FIELD', label);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function identifier(value, label) {
  const normalized = text(value);
  if (!ID_RE.test(normalized)) fail('E_WP606_IDENTIFIER', label);
  return normalized;
}

function identity(value, label) {
  exactKeys(value, IDENTITY_KEYS, label);
  const normalized = {
    entityId: identifier(value.entityId, `${label}.entityId`),
    generation: value.generation,
    projectId: identifier(value.projectId, `${label}.projectId`),
    sourceRevision: identifier(value.sourceRevision, `${label}.sourceRevision`),
  };
  if (!Number.isSafeInteger(normalized.generation) || normalized.generation < 0) fail('E_WP606_GENERATION', label);
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

function boundedArray(value, limit, label) {
  if (!Array.isArray(value)) fail('E_WP606_ARRAY_REQUIRED', label);
  if (value.length > limit) fail('E_WP606_RECORD_BUDGET', label);
  return value;
}

function normalizedDigest(value) {
  const normalized = text(value);
  if (HEX64_RE.test(normalized)) return normalized;
  if (/^sha256:[0-9a-f]{64}$/u.test(normalized)) return normalized.slice(7);
  return normalized;
}

function normalizeBookRefs(manifest, projectId) {
  if (!isPlainObject(manifest)) fail('E_WP606_SERIES_MANIFEST', 'seriesManifest');
  if (text(manifest.projectId) !== projectId) fail('E_WP606_PROJECT_IDENTITY', 'seriesManifest.projectId');
  const seriesId = identifier(manifest.seriesId, 'seriesManifest.seriesId');
  const bookRefs = boundedArray(manifest.bookRefs, WSE_SERIES_MULTI_LAYER_MAX_ROWS, 'seriesManifest.bookRefs').map((ref, index) => {
    if (!isPlainObject(ref)) fail('E_WP606_BOOK_REF', String(index));
    return {
      id: identifier(ref.bookRefId, `seriesManifest.bookRefs[${index}].bookRefId`),
      bookId: identifier(ref.bookId, `seriesManifest.bookRefs[${index}].bookId`),
      projectId: identifier(ref.projectId, `seriesManifest.bookRefs[${index}].projectId`),
      role: text(ref.role) || 'external',
      currentProject: ref.currentProject === true,
      evidenceIdentityHash: HEX64_RE.test(text(ref.evidenceIdentityHash)) ? text(ref.evidenceIdentityHash) : '',
      authorTruthHash: HEX64_RE.test(text(ref.authorTruthHash)) ? text(ref.authorTruthHash) : '',
      pathless: ref.pathless === true && ref.containsPrivatePath === false,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (!bookRefs.every((row) => row.pathless)) fail('E_WP606_PATH_AUTHORITY', 'seriesManifest.bookRefs');
  return { seriesId, bookRefs };
}

function normalizeIdentityLinks(value, projectId, seriesId) {
  const sourceRows = Array.isArray(value) ? value : Object.values(isPlainObject(value) ? value : {});
  return boundedArray(sourceRows, WSE_SERIES_MULTI_LAYER_MAX_INPUT_RECORDS, 'identityLinks').map((row, index) => {
    if (!isPlainObject(row)) fail('E_WP606_IDENTITY_LINK', String(index));
    const localProjectId = identifier(row.localProjectId || projectId, `identityLinks[${index}].localProjectId`);
    if (localProjectId !== projectId || identifier(row.seriesId || seriesId, `identityLinks[${index}].seriesId`) !== seriesId) {
      fail('E_WP606_PROJECT_IDENTITY', `identityLinks[${index}]`);
    }
    if (row.authorConfirmed !== true || text(row.source) !== 'author-confirmed') fail('E_WP606_UNCONFIRMED_IDENTITY_LINK', String(index));
    const evidenceHashes = Array.isArray(row.evidenceIdentityHashes) ? row.evidenceIdentityHashes.filter((item) => HEX64_RE.test(text(item))) : [];
    return {
      id: identifier(row.id, `identityLinks[${index}].id`),
      localEntityId: identifier(row.localEntityId, `identityLinks[${index}].localEntityId`),
      sharedIdentityId: identifier(row.sharedIdentityId, `identityLinks[${index}].sharedIdentityId`),
      externalBookRefCount: Array.isArray(row.externalBookRefIds) ? row.externalBookRefIds.length : 0,
      evidenceIdentityCount: evidenceHashes.length,
      evidenceIdentitySetDigest: hashCanonicalValue([...evidenceHashes].sort()),
      authorConfirmed: true,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeLayers(value, projectId) {
  return boundedArray(value, WSE_SERIES_MULTI_LAYER_MAX_LAYERS, 'layers').map((row, index) => {
    exactKeys(row, LAYER_KEYS, `layers[${index}]`);
    const projectionDigest = normalizedDigest(row.projectionDigest);
    if (projectionDigest && !HEX64_RE.test(projectionDigest)) fail('E_WP606_PROJECTION_DIGEST', String(index));
    if (!Number.isSafeInteger(row.recordCount) || row.recordCount < 0 || row.recordCount > WSE_SERIES_MULTI_LAYER_MAX_INPUT_RECORDS) {
      fail('E_WP606_RECORD_BUDGET', `layers[${index}].recordCount`);
    }
    return {
      id: identifier(row.layerId, `layers[${index}].layerId`),
      label: text(row.label) || row.layerId,
      projectId,
      state: projectionDigest ? (text(row.state) || 'ready') : 'unknown',
      reason: projectionDigest ? '' : 'UNKNOWN_LAYER_PROJECTION',
      projectionDigest,
      recordCount: row.recordCount,
      readOnly: true,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function makeView(rows, rowLimit, emptyReason) {
  const visible = rows.slice(0, rowLimit);
  const unknownCount = rows.filter((row) => row.state === 'unknown').length;
  return {
    state: rows.length === 0 ? 'empty' : unknownCount ? 'degraded' : 'ready',
    reason: rows.length === 0 ? emptyReason : unknownCount ? 'UNKNOWN_LAYER_PROJECTION' : '',
    totalCount: rows.length,
    visibleCount: visible.length,
    omittedCount: Math.max(0, rows.length - visible.length),
    rows: visible,
  };
}

export function buildWseSeriesMultiLayer(input = {}) {
  assertOwnData(input);
  exactKeys(input, INPUT_KEYS, 'input');
  const currentIdentity = identity(input.currentIdentity, 'currentIdentity');
  const expectedIdentity = identity(input.expectedIdentity, 'expectedIdentity');
  if (canonical(currentIdentity) !== canonical(expectedIdentity)) fail('E_WP606_STALE_IDENTITY');
  const rowLimit = Number.isSafeInteger(input.rowLimit)
    ? Math.max(1, Math.min(WSE_SERIES_MULTI_LAYER_MAX_ROWS, input.rowLimit))
    : 32;
  const { seriesId, bookRefs } = normalizeBookRefs(input.seriesManifest, currentIdentity.projectId);
  const identityLinks = normalizeIdentityLinks(input.identityLinks, currentIdentity.projectId, seriesId);
  const layers = normalizeLayers(input.layers, currentIdentity.projectId);
  const seriesRows = [
    ...bookRefs.map((row) => ({ ...row, rowKind: 'bookReference', state: 'ready' })),
    ...identityLinks.map((row) => ({ ...row, rowKind: 'identityLink', state: 'ready' })),
  ];
  const capsuleRecords = layers.map((layer) => ({
    anchorIds: [],
    evidenceDigest: layer.projectionDigest || hashCanonicalValue({ layerId: layer.id, state: 'UNKNOWN' }),
    evidenceId: layer.id,
    evidenceKind: 'derivedProjection',
    generation: currentIdentity.generation,
    profileId: layer.id.startsWith('wse') ? 'WSE' : 'ATLAS',
    projectId: currentIdentity.projectId,
    sourceRevision: currentIdentity.sourceRevision,
    status: layer.projectionDigest ? 'CURRENT' : 'UNKNOWN',
  }));
  const capsule = createEvidenceCapsuleExport({
    capsuleId: `wp606-${hashCanonicalValue({ currentIdentity, seriesId })}`,
    currentIdentity,
    expectedIdentity,
    records: capsuleRecords,
    requestedProfiles: ['ATLAS', 'WSE'],
  });
  if (!capsule.ok || capsule.byteLength > 1_048_576) fail('E_WP606_EVIDENCE_CAPSULE', capsule.error?.code || 'BYTE_BUDGET');
  const profileRows = capsule.envelope.body.payload.profiles.map((profile) => ({
    id: `evidence-profile:${profile.profileId.toLowerCase()}`,
    label: profile.profileId,
    state: profile.status === 'AVAILABLE' ? 'ready' : 'unknown',
    reason: profile.status === 'AVAILABLE' ? '' : 'UNKNOWN_EVIDENCE_PROFILE',
    recordCount: profile.recordDenominator,
    evidenceDigestSetSha256: profile.evidenceDigestSetSha256,
  }));
  const agentRows = layers.map((layer) => ({
    id: `agent-layer:${layer.id}`,
    label: layer.label,
    state: layer.state,
    reason: layer.reason,
    projectionDigest: layer.projectionDigest,
    recordCount: layer.recordCount,
    instructionAuthority: false,
    providerAuthority: false,
    commandAuthority: false,
  }));
  const views = {
    seriesCanon: makeView(seriesRows, rowLimit, 'EMPTY_NO_SERIES_LINKS'),
    multiLayerAtlas: makeView(layers, rowLimit, 'EMPTY_NO_ATLAS_LAYERS'),
    evidenceCapsule: makeView(profileRows, rowLimit, 'UNKNOWN_EVIDENCE_PROFILE'),
    agentContextPacket: makeView(agentRows, rowLimit, 'EMPTY_NO_AGENT_CONTEXT'),
  };
  const denominator = {
    bookReferences: bookRefs.length,
    authorConfirmedIdentityLinks: identityLinks.length,
    layers: layers.length,
    evidenceProfiles: profileRows.length,
    evidenceRecords: capsule.envelope.body.payload.counts.recordDenominator,
    visibleRows: Object.values(views).reduce((sum, view) => sum + view.visibleCount, 0),
    omittedRows: Object.values(views).reduce((sum, view) => sum + view.omittedCount, 0),
  };
  const base = {
    schemaVersion: WSE_SERIES_MULTI_LAYER_SCHEMA_VERSION,
    stageId: WSE_SERIES_MULTI_LAYER_STAGE_ID,
    profileId: WSE_SERIES_MULTI_LAYER_PROFILE_ID,
    projectId: currentIdentity.projectId,
    seriesId,
    identity: { ...currentIdentity, staleRejected: true },
    state: Object.values(views).some((view) => view.state === 'degraded') ? 'degraded' : 'ready',
    viewOrder: VIEWS.map((view) => view.id),
    views,
    evidenceCapsule: {
      status: capsule.status,
      artifactPublished: false,
      byteLength: capsule.byteLength,
      sha256: capsule.sha256,
      recordDenominator: capsule.envelope.body.payload.counts.recordDenominator,
      metadataOnly: true,
    },
    agentContextPacket: {
      schemaVersion: 'yalken.r24.wseAgentContextPacket.v1',
      projectId: currentIdentity.projectId,
      seriesId,
      sourceRevision: currentIdentity.sourceRevision,
      generation: currentIdentity.generation,
      evidenceCapsuleSha256: capsule.sha256,
      layerDigestSetSha256: hashCanonicalValue(layers.map((layer) => layer.projectionDigest || 'UNKNOWN')),
      layerDenominator: layers.length,
      metadataOnly: true,
      instructionAuthority: false,
      providerAuthority: false,
      commandAuthority: false,
      pathAuthority: false,
      productMutationAuthority: false,
    },
    denominator,
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
    featureManifest: WSE_SERIES_MULTI_LAYER_FEATURE_INTEGRATION_MANIFEST_V1,
    surfaceManifest: WSE_SERIES_MULTI_LAYER_SURFACE_MANIFEST_V1,
  };
  return deepFreeze({ ...base, projectionDigest: hashCanonicalValue(base) });
}
