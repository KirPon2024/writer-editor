import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { assertAtlasBookSnapshotCurrent, verifyAtlasBookSnapshot } from './atlas-book-snapshot-v1.mjs';
import { verifyAtlasTimeKnowledgeProjection } from './atlas-time-knowledge-v1.mjs';

export const ATLAS_THREADS_CAUSALITY_SCHEMA_VERSION = 'yalken.r24.atlasThreadsCausality.v1';
export const ATLAS_THREAD_SCHEMA_VERSION = 'yalken.r24.atlasThread.v1';
export const ATLAS_CAUSAL_EDGE_SCHEMA_VERSION = 'yalken.r24.atlasCausalEdge.v1';
export const ATLAS_THREADS_CAUSALITY_QUERY_SCHEMA_VERSION = 'yalken.r24.atlasThreadsCausalityQuery.v1';
export const ATLAS_THREADS_CAUSALITY_NODE_ID = 'WP-502_THREADS_CAUSALITY';
export const ATLAS_THREADS_CAUSALITY_PROFILE_ID = 'ATLAS_PRODUCT_V33';
export const ATLAS_THREADS_CAUSALITY_MAX_THREADS = 10_000;
export const ATLAS_THREADS_CAUSALITY_MAX_EDGES = 20_000;
export const ATLAS_THREADS_CAUSALITY_MAX_REFERENCES = 128;

export const ATLAS_THREAD_KIND = Object.freeze({ PROMISE: 'PROMISE', PLOT: 'PLOT' });
export const ATLAS_THREAD_STATE = Object.freeze({
  OPEN: 'OPEN', RESOLVED: 'RESOLVED', BROKEN: 'BROKEN', ABANDONED: 'ABANDONED', UNKNOWN: 'UNKNOWN',
});
export const ATLAS_CAUSAL_RELATION = Object.freeze({
  CAUSES: 'CAUSES', ENABLES: 'ENABLES', PREVENTS: 'PREVENTS', MOTIVATES: 'MOTIVATES',
});
export const ATLAS_CAUSAL_EPISTEMIC_STATE = Object.freeze({
  ASSERTED: 'ASSERTED', INFERRED: 'INFERRED', POSSIBLE: 'POSSIBLE', UNKNOWN: 'UNKNOWN',
});

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const INPUT_KEYS = Object.freeze(['causalEdges', 'currentSnapshotIdentity', 'snapshot', 'threads', 'timeKnowledgeProjection']);
const INCREMENTAL_INPUT_KEYS = Object.freeze(['causalEdgeBatches', 'currentSnapshotIdentity', 'snapshot', 'threadBatches', 'timeKnowledgeProjection']);
const THREAD_KEYS = Object.freeze(['evidenceCellIds', 'participantEntityIds', 'propositionIds', 'state', 'threadId', 'threadKind']);
const THREAD_PROJECTION_KEYS = Object.freeze(['evidenceCellIds', 'participantEntityIds', 'propositionIds', 'schemaVersion', 'state', 'threadDigest', 'threadId', 'threadKind']);
const EDGE_KEYS = Object.freeze(['edgeId', 'epistemicState', 'evidenceCellIds', 'relation', 'sourcePropositionId', 'targetPropositionId']);
const EDGE_PROJECTION_KEYS = Object.freeze(['edgeDigest', 'edgeId', 'epistemicState', 'evidenceCellIds', 'relation', 'schemaVersion', 'sourcePropositionId', 'targetPropositionId']);
const AUTHORITY_KEYS = Object.freeze(['commandAuthority', 'externalEffects', 'persistence', 'productMutation', 'rendererWiring', 'stateClass']);
const DENOMINATOR_KEYS = Object.freeze([
  'abandonedThreads', 'assertedEdges', 'brokenThreads', 'causesEdges', 'edges', 'enablesEdges',
  'inferredEdges', 'motivatesEdges', 'openThreads', 'plotThreads', 'possibleEdges', 'preventsEdges',
  'promiseThreads', 'resolvedThreads', 'threads', 'unknownEdges', 'unknownThreads',
]);
const PROJECTION_KEYS = Object.freeze([
  'authority', 'causalEdges', 'causalEdgesBySourcePropositionId', 'causalEdgesByTargetPropositionId',
  'denominator', 'edgeCount', 'featureManifestDigest', 'profileId', 'projectId', 'projectRevisionId',
  'projectionDigest', 'schemaVersion', 'snapshotId', 'stageId', 'threadCount', 'threadIdsByParticipantEntityId',
  'threadIdsByPropositionId', 'threads', 'threadsById', 'timeKnowledgeProjectionDigest',
]);
const QUERY_INPUT_KEYS = Object.freeze([
  'currentSnapshotIdentity', 'projection', 'snapshot', 'sourcePropositionId', 'targetPropositionId',
  'threadId', 'timeKnowledgeProjection',
]);
const QUERY_RESULT_KEYS = Object.freeze([
  'causalEdgeCount', 'causalEdges', 'projectionDigest', 'queryDigest', 'relationState', 'schemaVersion',
  'snapshotId', 'sourcePropositionId', 'targetPropositionId', 'threadCount', 'threadId', 'threads',
  'unknownReason',
]);

export const ATLAS_THREADS_CAUSALITY_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.atlas.threadsCausality.v1',
  featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:BOUND_TO_CURRENT_APPROVED_ENTRYPOINTS',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY',
  authoritativeData: 'VERIFIED_ATLAS_BOOK_SNAPSHOT_VERIFIED_WP501_TIME_KNOWLEDGE_AND_CALLER_SUPPLIED_EXPLICIT_THREAD_CAUSAL_RECORDS',
  derivedData: 'REVISION_BOUND_PROMISE_PLOT_THREAD_AND_EXPLICIT_CAUSAL_EDGE_PROJECTION',
  commandIds: ['NOT_APPLICABLE_PURE_QUERY_NO_MUTATION'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  queryIds: ['atlas.threadsCausality.compile.v1', 'atlas.threadsCausality.query.v1'],
  productProjectionIds: [ATLAS_THREADS_CAUSALITY_SCHEMA_VERSION],
  capabilityIds: ['NOT_APPLICABLE_PLATFORM_NEUTRAL_PURE_MODULE'],
  authorityMap: 'PRODUCT_CORE_INPUTS_READ_ONLY_DERIVED_PROJECTOR_OUTPUT_ONLY',
  identityKeys: ['projectId', 'projectRevisionId', 'snapshotId', 'timeKnowledgeProjectionDigest', 'threadId', 'edgeId', 'propositionId', 'evidenceCellId'],
  revisionPolicy: 'EXACT_BOOK_AND_WP501_PROJECTION_IDENTITY_STALE_REJECTED',
  writePath: 'PURE_RETURN_VALUE_ONLY',
  readPath: 'VERIFIED_BOOK_AND_WP501_PROJECTION_PLUS_AUTHOR_RECORDS_TO_IMMUTABLE_THREADS_CAUSALITY_PROJECTION',
  requiredProductPorts: ['NOT_APPLICABLE_NO_EXTERNAL_EFFECT'],
  requiredDesignOsPorts: ['NOT_APPLICABLE_NO_INTERFACE_PLANE_CHANGE'],
  adapterRequirements: ['NOT_APPLICABLE_NO_ADAPTER'],
  surfaceManifests: ['NOT_APPLICABLE_NO_UI_SURFACE'],
  slotRequirements: ['NOT_APPLICABLE_NO_UI_SLOT'],
  supportedWorkspaces: ['NOT_APPLICABLE_NO_UI_WORKSPACE'],
  platformAvailability: 'PLATFORM_NEUTRAL_PURE_MODULE',
  accessibilityRequirements: 'NOT_APPLICABLE_NO_VISUAL_OR_INTERACTIVE_SURFACE',
  fallbacks: [
    'EMPTY_PROJECTION_FOR_EMPTY_INPUT',
    'UNASSERTED_CAUSAL_RELATION_RETURNS_EXPLICIT_UNKNOWN_NEVER_FALSE',
    'EXPLICIT_UNKNOWN_THREAD_OR_EDGE_STATE_REMAINS_UNKNOWN',
    'FAIL_CLOSED_ON_STALE_INVALID_UNEVIDENCED_OR_CYCLIC_INPUT',
  ],
  stateClasses: ['DERIVED_STATE'],
  persistenceClass: 'NOT_PERSISTED_BY_THIS_MODULE',
  migrations: ['NOT_APPLICABLE_NO_STORED_SCHEMA'],
  recovery: 'RECOMPILE_FROM_VERIFIED_BOOK_WP501_PROJECTION_AND_AUTHOR_THREAD_CAUSAL_RECORDS',
  rollback: 'REVERT_BOUNDED_MODULE_AND_TEST_COMMIT',
  performanceBudget: {
    maximumThreads: ATLAS_THREADS_CAUSALITY_MAX_THREADS,
    maximumCausalEdges: ATLAS_THREADS_CAUSALITY_MAX_EDGES,
    maximumReferencesPerRecord: ATLAS_THREADS_CAUSALITY_MAX_REFERENCES,
  },
  securityBoundary: 'STRICT_OWN_DATA_EXACT_KEYSETS_NFC_BOUNDED_DENOMINATORS_NO_ACCESSORS_OR_SYMBOLS',
  lifecycle: 'ON_DEMAND_PURE_COMPILATION_AND_QUERY_ONLY',
  negativeBypassChecks: [
    'STALE_BOOK_WP501_PROJECTION_AND_EVIDENCE_IDENTITIES_REJECTED',
    'ORPHAN_THREAD_EDGE_AND_EVIDENCE_REFERENCES_REJECTED',
    'ABSENCE_NEVER_COLLAPSES_TO_FALSE_OR_TRANSITIVE_INFERENCE',
    'SELF_EDGE_CYCLE_DUPLICATE_INDEX_DENOMINATOR_AND_DIGEST_TAMPER_REJECTED',
  ],
  evidenceBindings: ['WP501_CERTIFIED_PREDECESSOR', 'EXACT_BOOK_SNAPSHOT', 'EXACT_WP501_PROJECTION', 'WP502_CONTRACT_INTEGRATION_MUTANTS'],
  currentReality: 'PURE_THREADS_CAUSALITY_PROJECTION_ONLY_NO_RUNTIME_STORAGE_RENDERER_COMMAND_OR_PLATFORM_WIRING',
});

export class AtlasThreadsCausalityError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AtlasThreadsCausalityError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = '') { throw new AtlasThreadsCausalityError(code, detail); }

function isPlainDataObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactDataObject(value, expectedKeys, code) {
  if (!isPlainDataObject(value)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
  const actual = ownKeys.slice().sort();
  if (actual.length !== expectedKeys.length || actual.some((key, index) => key !== expectedKeys[index])) fail(code, 'EXACT_KEYSET_REQUIRED');
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(code, 'DATA_PROPERTIES_REQUIRED');
  }
}

function assertDenseDataArray(value, code) {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length !== 0) fail(code, 'ARRAY_REQUIRED');
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes('length')) fail(code, 'DENSE_ARRAY_REQUIRED');
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || descriptor.enumerable !== true || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(code, 'DATA_ELEMENTS_REQUIRED');
  }
}

function assertIdentifier(value, code, maxLength = 512) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value !== value.trim() || value !== value.normalize('NFC') || /[\u0000-\u001f\u007f]/u.test(value)) fail(code);
  return value;
}

function assertOptionalIdentifier(value, code) {
  return value === '' ? '' : assertIdentifier(value, code);
}

function assertDigest(value, code) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) fail(code);
  return value;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function digestCanonical(value) { return `sha256:${hashCanonicalValue(value)}`; }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function normalizeIdArray(value, code, { minimum = 1 } = {}) {
  assertDenseDataArray(value, code);
  if (value.length < minimum || value.length > ATLAS_THREADS_CAUSALITY_MAX_REFERENCES) fail(code, 'DENOMINATOR');
  const normalized = value.map((item) => assertIdentifier(item, code)).sort(compare);
  if (new Set(normalized).size !== normalized.length) fail(code, 'DUPLICATE');
  return normalized;
}

function normalizeThread(input, cellsById, propositionIds) {
  assertExactDataObject(input, THREAD_KEYS, 'E_ATLAS_THREADS_CAUSALITY_THREAD_INVALID');
  const threadId = assertIdentifier(input.threadId, 'E_ATLAS_THREADS_CAUSALITY_THREAD_ID_INVALID');
  if (!Object.values(ATLAS_THREAD_KIND).includes(input.threadKind)) fail('E_ATLAS_THREADS_CAUSALITY_THREAD_KIND_INVALID');
  if (!Object.values(ATLAS_THREAD_STATE).includes(input.state)) fail('E_ATLAS_THREADS_CAUSALITY_THREAD_STATE_INVALID');
  const participantEntityIds = normalizeIdArray(input.participantEntityIds, 'E_ATLAS_THREADS_CAUSALITY_PARTICIPANTS_INVALID');
  const threadPropositionIds = normalizeIdArray(input.propositionIds, 'E_ATLAS_THREADS_CAUSALITY_PROPOSITIONS_INVALID');
  const evidenceCellIds = normalizeIdArray(input.evidenceCellIds, 'E_ATLAS_THREADS_CAUSALITY_EVIDENCE_CELLS_INVALID');
  for (const propositionId of threadPropositionIds) if (!propositionIds.has(propositionId)) fail('E_ATLAS_THREADS_CAUSALITY_PROPOSITION_NOT_FOUND', propositionId);
  for (const cellId of evidenceCellIds) {
    const cell = cellsById.get(cellId);
    if (!cell) fail('E_ATLAS_THREADS_CAUSALITY_EVIDENCE_CELL_NOT_FOUND', cellId);
    if (!threadPropositionIds.includes(cell.propositionId)) fail('E_ATLAS_THREADS_CAUSALITY_THREAD_EVIDENCE_LEAK', cellId);
  }
  const identity = {
    schemaVersion: ATLAS_THREAD_SCHEMA_VERSION, threadId, threadKind: input.threadKind, state: input.state,
    participantEntityIds, propositionIds: threadPropositionIds, evidenceCellIds,
  };
  return { ...identity, threadDigest: digestCanonical(identity) };
}

function normalizeEdge(input, cellsById, propositionIds, threadIdsByProposition) {
  assertExactDataObject(input, EDGE_KEYS, 'E_ATLAS_THREADS_CAUSALITY_EDGE_INVALID');
  const edgeId = assertIdentifier(input.edgeId, 'E_ATLAS_THREADS_CAUSALITY_EDGE_ID_INVALID');
  const sourcePropositionId = assertIdentifier(input.sourcePropositionId, 'E_ATLAS_THREADS_CAUSALITY_SOURCE_INVALID');
  const targetPropositionId = assertIdentifier(input.targetPropositionId, 'E_ATLAS_THREADS_CAUSALITY_TARGET_INVALID');
  if (sourcePropositionId === targetPropositionId) fail('E_ATLAS_THREADS_CAUSALITY_SELF_EDGE', edgeId);
  if (!propositionIds.has(sourcePropositionId) || !propositionIds.has(targetPropositionId)) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_PROPOSITION_NOT_FOUND', edgeId);
  if (!Object.values(ATLAS_CAUSAL_RELATION).includes(input.relation)) fail('E_ATLAS_THREADS_CAUSALITY_RELATION_INVALID');
  if (!Object.values(ATLAS_CAUSAL_EPISTEMIC_STATE).includes(input.epistemicState)) fail('E_ATLAS_THREADS_CAUSALITY_EPISTEMIC_STATE_INVALID');
  const evidenceCellIds = normalizeIdArray(input.evidenceCellIds, 'E_ATLAS_THREADS_CAUSALITY_EDGE_EVIDENCE_INVALID');
  for (const cellId of evidenceCellIds) {
    const cell = cellsById.get(cellId);
    if (!cell) fail('E_ATLAS_THREADS_CAUSALITY_EVIDENCE_CELL_NOT_FOUND', cellId);
    if (cell.propositionId !== sourcePropositionId && cell.propositionId !== targetPropositionId) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_EVIDENCE_LEAK', cellId);
  }
  const sourceThreadIds = threadIdsByProposition.get(sourcePropositionId);
  const targetThreadIds = threadIdsByProposition.get(targetPropositionId);
  const smallerThreadIds = sourceThreadIds?.size <= targetThreadIds?.size ? sourceThreadIds : targetThreadIds;
  const largerThreadIds = smallerThreadIds === sourceThreadIds ? targetThreadIds : sourceThreadIds;
  let sharedThread = false;
  if (smallerThreadIds && largerThreadIds) for (const threadId of smallerThreadIds) if (largerThreadIds.has(threadId)) {
    sharedThread = true;
    break;
  }
  if (!sharedThread) {
    fail('E_ATLAS_THREADS_CAUSALITY_EDGE_WITHOUT_THREAD', edgeId);
  }
  const identity = {
    schemaVersion: ATLAS_CAUSAL_EDGE_SCHEMA_VERSION, edgeId, sourcePropositionId, targetPropositionId,
    relation: input.relation, epistemicState: input.epistemicState, evidenceCellIds,
  };
  return { ...identity, edgeDigest: digestCanonical(identity) };
}

function assertAcyclic(edges) {
  const outgoing = new Map();
  const indegree = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.sourcePropositionId)) outgoing.set(edge.sourcePropositionId, []);
    outgoing.get(edge.sourcePropositionId).push(edge.targetPropositionId);
    indegree.set(edge.sourcePropositionId, indegree.get(edge.sourcePropositionId) ?? 0);
    indegree.set(edge.targetPropositionId, (indegree.get(edge.targetPropositionId) ?? 0) + 1);
  }
  const ready = [...indegree].filter(([, count]) => count === 0).map(([id]) => id).sort(compare);
  let visited = 0;
  for (let cursor = 0; cursor < ready.length; cursor += 1) {
    const source = ready[cursor]; visited += 1;
    for (const target of outgoing.get(source) ?? []) {
      const count = indegree.get(target) - 1; indegree.set(target, count);
      if (count === 0) ready.push(target);
    }
  }
  if (visited !== indegree.size) fail('E_ATLAS_THREADS_CAUSALITY_CYCLE');
}

function indexIds(values, keys, idField) {
  const index = new Map();
  for (const value of values) for (const key of keys(value)) {
    const current = index.get(key);
    if (current) current.push(value[idField]); else index.set(key, [value[idField]]);
  }
  return Object.fromEntries([...index.keys()].sort(compare).map((key) => [key, index.get(key).sort(compare)]));
}

function makeDenominator(threads, edges) {
  const result = {
    threads: threads.length, promiseThreads: 0, plotThreads: 0, openThreads: 0, resolvedThreads: 0,
    brokenThreads: 0, abandonedThreads: 0, unknownThreads: 0, edges: edges.length, causesEdges: 0,
    enablesEdges: 0, preventsEdges: 0, motivatesEdges: 0, assertedEdges: 0, inferredEdges: 0,
    possibleEdges: 0, unknownEdges: 0,
  };
  const kindKeys = { PROMISE: 'promiseThreads', PLOT: 'plotThreads' };
  const stateKeys = { OPEN: 'openThreads', RESOLVED: 'resolvedThreads', BROKEN: 'brokenThreads', ABANDONED: 'abandonedThreads', UNKNOWN: 'unknownThreads' };
  const relationKeys = { CAUSES: 'causesEdges', ENABLES: 'enablesEdges', PREVENTS: 'preventsEdges', MOTIVATES: 'motivatesEdges' };
  const epistemicKeys = { ASSERTED: 'assertedEdges', INFERRED: 'inferredEdges', POSSIBLE: 'possibleEdges', UNKNOWN: 'unknownEdges' };
  for (const thread of threads) { result[kindKeys[thread.threadKind]] += 1; result[stateKeys[thread.state]] += 1; }
  for (const edge of edges) { result[relationKeys[edge.relation]] += 1; result[epistemicKeys[edge.epistemicState]] += 1; }
  return result;
}

function projectionIdentity(value) {
  const {
    schemaVersion, stageId, profileId, snapshotId, projectId, projectRevisionId, timeKnowledgeProjectionDigest,
    threadCount, edgeCount, threads, causalEdges, denominator, authority, featureManifestDigest,
  } = value;
  return {
    schemaVersion, stageId, profileId, snapshotId, projectId, projectRevisionId, timeKnowledgeProjectionDigest,
    threadCount, edgeCount,
    threadDigests: threads.map((thread) => thread.threadDigest),
    causalEdgeDigests: causalEdges.map((edge) => edge.edgeDigest),
    denominator, authority, featureManifestDigest,
  };
}

function compileCurrent(input) {
  const snapshot = assertAtlasBookSnapshotCurrent(input.snapshot, input.currentSnapshotIdentity);
  const timeKnowledge = verifyAtlasTimeKnowledgeProjection(input.timeKnowledgeProjection, snapshot);
  const cellsById = new Map(timeKnowledge.cells.map((cell) => [cell.cellId, cell]));
  const propositionIds = new Set(timeKnowledge.cells.map((cell) => cell.propositionId));
  assertDenseDataArray(input.threads, 'E_ATLAS_THREADS_CAUSALITY_THREADS_ARRAY_INVALID');
  if (input.threads.length > ATLAS_THREADS_CAUSALITY_MAX_THREADS) fail('E_ATLAS_THREADS_CAUSALITY_THREAD_COUNT_BOUND');
  const threads = input.threads.map((thread) => normalizeThread(thread, cellsById, propositionIds)).sort((a, b) => compare(a.threadId, b.threadId));
  if (new Set(threads.map((thread) => thread.threadId)).size !== threads.length) fail('E_ATLAS_THREADS_CAUSALITY_THREAD_ID_DUPLICATE');
  const threadSemanticKeys = threads.map((thread) => JSON.stringify([thread.threadKind, thread.participantEntityIds, thread.propositionIds]));
  if (new Set(threadSemanticKeys).size !== threadSemanticKeys.length) fail('E_ATLAS_THREADS_CAUSALITY_THREAD_SEMANTIC_DUPLICATE');
  const threadIdsByProposition = new Map();
  for (const thread of threads) for (const propositionId of thread.propositionIds) {
    const threadIds = threadIdsByProposition.get(propositionId) ?? new Set();
    threadIds.add(thread.threadId);
    threadIdsByProposition.set(propositionId, threadIds);
  }
  assertDenseDataArray(input.causalEdges, 'E_ATLAS_THREADS_CAUSALITY_EDGES_ARRAY_INVALID');
  if (input.causalEdges.length > ATLAS_THREADS_CAUSALITY_MAX_EDGES) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_COUNT_BOUND');
  const causalEdges = input.causalEdges.map((edge) => normalizeEdge(edge, cellsById, propositionIds, threadIdsByProposition)).sort((a, b) => compare(a.edgeId, b.edgeId));
  if (new Set(causalEdges.map((edge) => edge.edgeId)).size !== causalEdges.length) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_ID_DUPLICATE');
  const edgeSemanticKeys = causalEdges.map((edge) => JSON.stringify([edge.sourcePropositionId, edge.targetPropositionId, edge.relation, edge.epistemicState]));
  if (new Set(edgeSemanticKeys).size !== edgeSemanticKeys.length) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_SEMANTIC_DUPLICATE');
  assertAcyclic(causalEdges);
  const authority = { stateClass: 'DERIVED_STATE', productMutation: false, persistence: false, rendererWiring: false, externalEffects: false, commandAuthority: 'NOT_APPLICABLE_PURE_QUERY' };
  const normalized = {
    schemaVersion: ATLAS_THREADS_CAUSALITY_SCHEMA_VERSION,
    stageId: ATLAS_THREADS_CAUSALITY_NODE_ID,
    profileId: ATLAS_THREADS_CAUSALITY_PROFILE_ID,
    snapshotId: snapshot.snapshotId,
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    timeKnowledgeProjectionDigest: timeKnowledge.projectionDigest,
    threadCount: threads.length,
    edgeCount: causalEdges.length,
    threads,
    causalEdges,
    threadsById: Object.fromEntries(threads.map((thread) => [thread.threadId, thread])),
    threadIdsByPropositionId: indexIds(threads, (thread) => thread.propositionIds, 'threadId'),
    threadIdsByParticipantEntityId: indexIds(threads, (thread) => thread.participantEntityIds, 'threadId'),
    causalEdgesBySourcePropositionId: indexIds(causalEdges, (edge) => [edge.sourcePropositionId], 'edgeId'),
    causalEdgesByTargetPropositionId: indexIds(causalEdges, (edge) => [edge.targetPropositionId], 'edgeId'),
    denominator: makeDenominator(threads, causalEdges),
    authority,
    featureManifestDigest: digestCanonical(ATLAS_THREADS_CAUSALITY_FEATURE_INTEGRATION_MANIFEST_V1),
  };
  return freezeDeep({ ...normalized, projectionDigest: digestCanonical(projectionIdentity(normalized)) });
}

export function compileAtlasThreadsCausality(input) {
  assertExactDataObject(input, INPUT_KEYS, 'E_ATLAS_THREADS_CAUSALITY_INPUT_INVALID');
  return compileCurrent(input);
}

export function compileAtlasThreadsCausalityIncremental(input) {
  assertExactDataObject(input, INCREMENTAL_INPUT_KEYS, 'E_ATLAS_THREADS_CAUSALITY_INCREMENTAL_INPUT_INVALID');
  assertDenseDataArray(input.threadBatches, 'E_ATLAS_THREADS_CAUSALITY_THREAD_BATCHES_INVALID');
  assertDenseDataArray(input.causalEdgeBatches, 'E_ATLAS_THREADS_CAUSALITY_EDGE_BATCHES_INVALID');
  const threads = [], causalEdges = [];
  for (const batch of input.threadBatches) {
    assertDenseDataArray(batch, 'E_ATLAS_THREADS_CAUSALITY_THREAD_BATCH_INVALID');
    if (threads.length + batch.length > ATLAS_THREADS_CAUSALITY_MAX_THREADS) fail('E_ATLAS_THREADS_CAUSALITY_THREAD_COUNT_BOUND');
    threads.push(...batch);
  }
  for (const batch of input.causalEdgeBatches) {
    assertDenseDataArray(batch, 'E_ATLAS_THREADS_CAUSALITY_EDGE_BATCH_INVALID');
    if (causalEdges.length + batch.length > ATLAS_THREADS_CAUSALITY_MAX_EDGES) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_COUNT_BOUND');
    causalEdges.push(...batch);
  }
  return compileCurrent({ snapshot: input.snapshot, currentSnapshotIdentity: input.currentSnapshotIdentity, timeKnowledgeProjection: input.timeKnowledgeProjection, threads, causalEdges });
}

function assertExactIndex(actual, expected, code) {
  if (!isPlainDataObject(actual)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const keys = Reflect.ownKeys(actual);
  if (keys.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
  if (JSON.stringify(keys.sort(compare)) !== JSON.stringify(Object.keys(expected).sort(compare))) fail(code, 'KEY_COVERAGE');
  for (const key of Object.keys(expected)) {
    assertDenseDataArray(actual[key], code);
    if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) fail(code, 'VALUE_MISMATCH');
  }
}

function assertExactObjectIndex(actual, expected, code) {
  if (!isPlainDataObject(actual)) fail(code, 'PLAIN_OBJECT_REQUIRED');
  const keys = Reflect.ownKeys(actual);
  if (keys.some((key) => typeof key !== 'string')) fail(code, 'STRING_KEYS_REQUIRED');
  if (JSON.stringify(keys.sort(compare)) !== JSON.stringify(Object.keys(expected).sort(compare))) fail(code, 'KEY_COVERAGE');
  for (const key of Object.keys(expected)) {
    if (hashCanonicalValue(actual[key]) !== hashCanonicalValue(expected[key])) fail(code, 'VALUE_MISMATCH');
  }
}

export function verifyAtlasThreadsCausalityProjection(projection, snapshotInput, timeKnowledgeProjection) {
  assertExactDataObject(projection, PROJECTION_KEYS, 'E_ATLAS_THREADS_CAUSALITY_PROJECTION_INVALID');
  if (projection.schemaVersion !== ATLAS_THREADS_CAUSALITY_SCHEMA_VERSION) fail('E_ATLAS_THREADS_CAUSALITY_PROJECTION_SCHEMA');
  const snapshot = verifyAtlasBookSnapshot(snapshotInput);
  const timeKnowledge = verifyAtlasTimeKnowledgeProjection(timeKnowledgeProjection, snapshot);
  if (projection.snapshotId !== snapshot.snapshotId || projection.projectId !== snapshot.projectId || projection.projectRevisionId !== snapshot.projectRevisionId || projection.timeKnowledgeProjectionDigest !== timeKnowledge.projectionDigest) fail('E_ATLAS_THREADS_CAUSALITY_PROJECTION_STALE');
  assertDenseDataArray(projection.threads, 'E_ATLAS_THREADS_CAUSALITY_THREADS_ARRAY_INVALID');
  assertDenseDataArray(projection.causalEdges, 'E_ATLAS_THREADS_CAUSALITY_EDGES_ARRAY_INVALID');
  const rawThreads = projection.threads.map((thread) => {
    assertExactDataObject(thread, THREAD_PROJECTION_KEYS, 'E_ATLAS_THREADS_CAUSALITY_THREAD_PROJECTION_INVALID');
    if (thread.schemaVersion !== ATLAS_THREAD_SCHEMA_VERSION) fail('E_ATLAS_THREADS_CAUSALITY_THREAD_SCHEMA');
    assertDigest(thread.threadDigest, 'E_ATLAS_THREADS_CAUSALITY_THREAD_DIGEST_INVALID');
    const { schemaVersion, threadDigest, ...input } = thread;
    return { schemaVersion, threadDigest, input };
  });
  const rawEdges = projection.causalEdges.map((edge) => {
    assertExactDataObject(edge, EDGE_PROJECTION_KEYS, 'E_ATLAS_THREADS_CAUSALITY_EDGE_PROJECTION_INVALID');
    if (edge.schemaVersion !== ATLAS_CAUSAL_EDGE_SCHEMA_VERSION) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_SCHEMA');
    assertDigest(edge.edgeDigest, 'E_ATLAS_THREADS_CAUSALITY_EDGE_DIGEST_INVALID');
    const { schemaVersion, edgeDigest, ...input } = edge;
    return { schemaVersion, edgeDigest, input };
  });
  const currentSnapshotIdentity = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId, manifestRevision: snapshot.manifestRevision, orderDigest: snapshot.orderDigest, dependencyDigest: snapshot.dependencyDigest };
  const rebuilt = compileAtlasThreadsCausality({ snapshot, currentSnapshotIdentity, timeKnowledgeProjection: timeKnowledge, threads: rawThreads.map((row) => row.input), causalEdges: rawEdges.map((row) => row.input) });
  for (let index = 0; index < rawThreads.length; index += 1) if (rawThreads[index].threadDigest !== rebuilt.threads[index].threadDigest || rawThreads[index].schemaVersion !== rebuilt.threads[index].schemaVersion) fail('E_ATLAS_THREADS_CAUSALITY_THREAD_DIGEST_MISMATCH', rawThreads[index].input.threadId);
  for (let index = 0; index < rawEdges.length; index += 1) if (rawEdges[index].edgeDigest !== rebuilt.causalEdges[index].edgeDigest || rawEdges[index].schemaVersion !== rebuilt.causalEdges[index].schemaVersion) fail('E_ATLAS_THREADS_CAUSALITY_EDGE_DIGEST_MISMATCH', rawEdges[index].input.edgeId);
  assertExactDataObject(projection.authority, AUTHORITY_KEYS, 'E_ATLAS_THREADS_CAUSALITY_AUTHORITY_INVALID');
  assertExactDataObject(projection.denominator, DENOMINATOR_KEYS, 'E_ATLAS_THREADS_CAUSALITY_DENOMINATOR_INVALID');
  assertExactObjectIndex(projection.threadsById, rebuilt.threadsById, 'E_ATLAS_THREADS_CAUSALITY_THREAD_ID_INDEX_INVALID');
  assertExactIndex(projection.threadIdsByPropositionId, rebuilt.threadIdsByPropositionId, 'E_ATLAS_THREADS_CAUSALITY_PROPOSITION_INDEX_INVALID');
  assertExactIndex(projection.threadIdsByParticipantEntityId, rebuilt.threadIdsByParticipantEntityId, 'E_ATLAS_THREADS_CAUSALITY_PARTICIPANT_INDEX_INVALID');
  assertExactIndex(projection.causalEdgesBySourcePropositionId, rebuilt.causalEdgesBySourcePropositionId, 'E_ATLAS_THREADS_CAUSALITY_SOURCE_INDEX_INVALID');
  assertExactIndex(projection.causalEdgesByTargetPropositionId, rebuilt.causalEdgesByTargetPropositionId, 'E_ATLAS_THREADS_CAUSALITY_TARGET_INDEX_INVALID');
  if (projection.threadCount !== rebuilt.threadCount || projection.edgeCount !== rebuilt.edgeCount || JSON.stringify(projection.denominator) !== JSON.stringify(rebuilt.denominator)) fail('E_ATLAS_THREADS_CAUSALITY_DENOMINATOR_MISMATCH');
  if (projection.stageId !== ATLAS_THREADS_CAUSALITY_NODE_ID || projection.profileId !== ATLAS_THREADS_CAUSALITY_PROFILE_ID || projection.featureManifestDigest !== rebuilt.featureManifestDigest) fail('E_ATLAS_THREADS_CAUSALITY_CONTRACT_IDENTITY');
  if (projection.authority.stateClass !== 'DERIVED_STATE' || projection.authority.productMutation !== false || projection.authority.persistence !== false || projection.authority.rendererWiring !== false || projection.authority.externalEffects !== false || projection.authority.commandAuthority !== 'NOT_APPLICABLE_PURE_QUERY') fail('E_ATLAS_THREADS_CAUSALITY_AUTHORITY_LEAK');
  assertDigest(projection.projectionDigest, 'E_ATLAS_THREADS_CAUSALITY_PROJECTION_DIGEST_INVALID');
  if (projection.projectionDigest !== digestCanonical(projectionIdentity(projection))) fail('E_ATLAS_THREADS_CAUSALITY_PROJECTION_DIGEST_MISMATCH');
  if (hashCanonicalValue(projection) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_THREADS_CAUSALITY_PROJECTION_MISMATCH');
  return freezeDeep(projection);
}

function expectedQuery({ projection, threadId, sourcePropositionId, targetPropositionId }) {
  let threads = [];
  if (threadId) threads = [projection.threadsById[threadId]].filter(Boolean);
  else if (sourcePropositionId && targetPropositionId) {
    threads = projection.threads.filter((thread) => thread.propositionIds.includes(sourcePropositionId) && thread.propositionIds.includes(targetPropositionId));
  }
  let causalEdges = [];
  if (sourcePropositionId && targetPropositionId) {
    const sourceIds = new Set(projection.causalEdgesBySourcePropositionId[sourcePropositionId] ?? []);
    causalEdges = projection.causalEdges.filter((edge) => sourceIds.has(edge.edgeId) && edge.targetPropositionId === targetPropositionId);
  } else if (threadId && threads.length === 1) {
    const propositions = new Set(threads[0].propositionIds);
    causalEdges = projection.causalEdges.filter((edge) => propositions.has(edge.sourcePropositionId) && propositions.has(edge.targetPropositionId));
  }
  return { threads, causalEdges };
}

export function queryAtlasThreadsCausality(input) {
  assertExactDataObject(input, QUERY_INPUT_KEYS, 'E_ATLAS_THREADS_CAUSALITY_QUERY_INPUT_INVALID');
  const snapshot = assertAtlasBookSnapshotCurrent(input.snapshot, input.currentSnapshotIdentity);
  const projection = verifyAtlasThreadsCausalityProjection(input.projection, snapshot, input.timeKnowledgeProjection);
  const threadId = assertOptionalIdentifier(input.threadId, 'E_ATLAS_THREADS_CAUSALITY_THREAD_ID_INVALID');
  const sourcePropositionId = assertOptionalIdentifier(input.sourcePropositionId, 'E_ATLAS_THREADS_CAUSALITY_SOURCE_INVALID');
  const targetPropositionId = assertOptionalIdentifier(input.targetPropositionId, 'E_ATLAS_THREADS_CAUSALITY_TARGET_INVALID');
  const hasPair = Boolean(sourcePropositionId && targetPropositionId);
  if ((!threadId && !hasPair) || Boolean(sourcePropositionId) !== Boolean(targetPropositionId)) fail('E_ATLAS_THREADS_CAUSALITY_QUERY_FILTER_INVALID');
  const expected = expectedQuery({ projection, threadId, sourcePropositionId, targetPropositionId });
  const relationState = expected.causalEdges.length > 0 ? 'EXPLICIT' : 'UNKNOWN';
  const unknownReason = relationState === 'UNKNOWN' ? 'NO_EXPLICIT_DIRECT_CAUSAL_EDGE' : '';
  const identity = {
    schemaVersion: ATLAS_THREADS_CAUSALITY_QUERY_SCHEMA_VERSION, snapshotId: snapshot.snapshotId,
    projectionDigest: projection.projectionDigest, threadId, sourcePropositionId, targetPropositionId,
    threadCount: expected.threads.length, threads: expected.threads,
    causalEdgeCount: expected.causalEdges.length, causalEdges: expected.causalEdges,
    relationState, unknownReason,
  };
  return freezeDeep({ ...identity, queryDigest: digestCanonical(identity) });
}

export function verifyAtlasThreadsCausalityQuery(result, projection, snapshot, timeKnowledgeProjection) {
  assertExactDataObject(result, QUERY_RESULT_KEYS, 'E_ATLAS_THREADS_CAUSALITY_QUERY_RESULT_INVALID');
  if (result.schemaVersion !== ATLAS_THREADS_CAUSALITY_QUERY_SCHEMA_VERSION) fail('E_ATLAS_THREADS_CAUSALITY_QUERY_SCHEMA');
  const verified = verifyAtlasThreadsCausalityProjection(projection, snapshot, timeKnowledgeProjection);
  if (result.snapshotId !== verified.snapshotId || result.projectionDigest !== verified.projectionDigest) fail('E_ATLAS_THREADS_CAUSALITY_QUERY_STALE');
  const currentSnapshotIdentity = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId, manifestRevision: snapshot.manifestRevision, orderDigest: snapshot.orderDigest, dependencyDigest: snapshot.dependencyDigest };
  const rebuilt = queryAtlasThreadsCausality({ snapshot, currentSnapshotIdentity, timeKnowledgeProjection, projection: verified, threadId: result.threadId, sourcePropositionId: result.sourcePropositionId, targetPropositionId: result.targetPropositionId });
  if (hashCanonicalValue(result) !== hashCanonicalValue(rebuilt)) fail('E_ATLAS_THREADS_CAUSALITY_QUERY_RESULT_MISMATCH');
  return freezeDeep(result);
}
