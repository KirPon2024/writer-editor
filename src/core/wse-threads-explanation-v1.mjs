import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { assertAtlasBookSnapshotCurrent } from './atlas-book-snapshot-v1.mjs';
import { verifyAtlasTimeKnowledgeProjection } from './atlas-time-knowledge-v1.mjs';
import { verifyAtlasThreadsCausalityProjection } from './atlas-threads-causality-v1.mjs';
import { compileTypedQueryIr, freezeFeatureSpec } from './frozen-feature-spec-query-ir-v1.mjs';

export const WSE_THREADS_EXPLANATION_SCHEMA_VERSION = 'yalken.wseThreadsExplanation.v1';
export const WSE_THREADS_EXPLANATION_QUERY_SCHEMA_VERSION = 'yalken.wseThreadsExplanation.whyWhyNot.v1';
export const WSE_THREADS_EXPLANATION_LIMITS_V1 = Object.freeze({
  maxInputFacts: 10_000,
  maxVisibleRowsPerView: 128,
  maxEvidenceReferences: 16_384,
});

const INPUT_KEYS = Object.freeze([
  'causalContext', 'currentGeneration', 'currentSourceRevision', 'facts', 'generation',
  'projectId', 'rowLimit', 'sourceRevision',
]);
const CAUSAL_CONTEXT_KEYS = Object.freeze([
  'currentSnapshotIdentity', 'snapshot', 'threadsCausalityProjection', 'timeKnowledgeProjection',
]);
const QUERY_KEYS = Object.freeze(['currentIdentity', 'projection', 'sourcePropositionId', 'targetPropositionId']);
const CURRENT_IDENTITY_KEYS = Object.freeze(['generation', 'projectId', 'projectionDigest', 'sourceRevision']);
const PROMISE_STATES = Object.freeze(['open', 'fulfilled', 'broken']);

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const isPlainObject = (value) => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const compare = (left, right) => String(left || '').localeCompare(String(right || ''), 'en', { sensitivity: 'variant' });
const text = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
const digest = (value) => `sha256:${hashCanonicalValue(value)}`;

function assertExactObject(value, keys, code) {
  if (!isPlainObject(value)) fail(code);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')
    || ownKeys.length !== keys.length
    || ownKeys.some((key) => !keys.includes(key))) fail(code);
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
  }
}

function assertDenseArray(value, maximum, code) {
  if (!Array.isArray(value) || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) fail(code);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
  }
  return value;
}

function assertIdentityText(value, code) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value !== value.normalize('NFC')
    || /[\u0000-\u001f\u007f]/u.test(value)) fail(code);
  return value;
}

export const WSE_THREADS_EXPLANATION_FEATURE_SPEC_V1 = freezeFeatureSpec({
  featureId: 'yalken.wseThreadsExplanation.v1',
  outcome: 'Evidence-bound setup-payoff, dependency, canon-check and why or why-not views.',
  nonGoals: ['Automatic manuscript change', 'Causal inference from adjacency', 'New persistence or command authority'],
  inputs: ['Authored promise facts', 'Optional verified explicit threads-causality projection'],
  outputs: ['Setup-payoff board', 'Dependency DAG', 'Canon CI', 'Why or why-not explanation'],
  invariants: ['Absence remains unknown', 'Every causal edge is explicit', 'Projection is read-only'],
  limits: { maxAssociations: 10_000, maxResults: 128, maxEvidenceReferences: 16_384 },
  threatProfile: ['Cross-project input', 'Stale projection', 'Unbounded corpus', 'Implicit causal inference'],
  rollback: 'Revert the bounded WP604 merge by a new reviewed commit.',
  corpus: { corpusId: 'wp604-wse-threads-explanation-v1', normalCases: 5, boundaryCases: 4, adversarialCases: 5, counterexampleCases: 4, negativeDenominator: 13 },
  relationTypes: ['causes', 'enables', 'foreshadows', 'prevents', 'requires'],
});

export const WSE_THREADS_EXPLANATION_QUERY_PLANS_V1 = deepFreeze({
  setupPayoffBoard: compileTypedQueryIr(WSE_THREADS_EXPLANATION_FEATURE_SPEC_V1, {
    queryId: 'query.wse.setupPayoffBoard.v1', relationTypes: ['foreshadows'], entityIds: [], endpoint: 'EITHER', limit: 128,
  }),
  dependencyDag: compileTypedQueryIr(WSE_THREADS_EXPLANATION_FEATURE_SPEC_V1, {
    queryId: 'query.wse.dependencyDag.v1', relationTypes: ['causes', 'enables', 'prevents', 'requires'], entityIds: [], endpoint: 'EITHER', limit: 128,
  }),
  canonCi: compileTypedQueryIr(WSE_THREADS_EXPLANATION_FEATURE_SPEC_V1, {
    queryId: 'query.wse.canonCi.v1', relationTypes: ['causes', 'enables', 'foreshadows', 'prevents', 'requires'], entityIds: [], endpoint: 'EITHER', limit: 128,
  }),
  whyWhyNot: compileTypedQueryIr(WSE_THREADS_EXPLANATION_FEATURE_SPEC_V1, {
    queryId: 'query.wse.whyWhyNot.v1', relationTypes: ['causes', 'enables', 'prevents', 'requires'], entityIds: [], endpoint: 'EITHER', limit: 128,
  }),
});

export const WSE_THREADS_EXPLANATION_FEATURE_INTEGRATION_MANIFEST_V1 = deepFreeze({
  schemaVersion: 'FEATURE_INTEGRATION_MANIFEST_V1',
  featureId: 'yalken.wseThreadsExplanation.v1',
  productPlane: 'AUTHORED_PROMISE_FACTS_AND_OPTIONAL_VERIFIED_EXPLICIT_CAUSAL_PROJECTION_READ_ONLY',
  interfacePlane: 'EXISTING_ATLAS_CONTINUITY_RIGHT_RAIL_SLOT',
  commands: ['NOT_APPLICABLE_READ_ONLY_QUERY'],
  queries: Object.values(WSE_THREADS_EXPLANATION_QUERY_PLANS_V1).map((plan) => plan.queryId),
  events: ['NOT_APPLICABLE_NO_NEW_EVENT'],
  effects: ['NOT_APPLICABLE_NO_EFFECT'],
  productPorts: ['query.atlasContinuityLedgerSurface'],
  designOsPorts: ['rightRail.context.atlas.continuityLedger'],
  stateClasses: ['DERIVED_STATE', 'TRANSIENT_STATE'],
  identityGuards: ['projectId', 'sourceRevision', 'generation', 'projectionDigest'],
  fallback: ['UNKNOWN_NO_EXPLICIT_CAUSAL_PROJECTION', 'UNKNOWN_NO_EXPLICIT_DIRECT_CAUSAL_EDGE', 'ABSTAIN_STALE_OR_MISSING_EVIDENCE'],
  recovery: 'RECOMPUTE_FROM_CURRENT_IMMUTABLE_SOURCE',
  performance: WSE_THREADS_EXPLANATION_LIMITS_V1,
  accessibility: ['NATIVE_TAB_BUTTONS', 'TEXTUAL_DAG_PARITY', 'TEXT_STATUS', 'VISIBLE_FOCUS'],
  security: 'LOCAL_PLAIN_DATA_ONLY_NO_STORAGE_NETWORK_COMMAND_OR_PROVIDER_AUTHORITY',
  rollback: 'REVERT_BY_NEW_REVIEWED_COMMIT',
});

export const WSE_THREADS_EXPLANATION_SURFACE_MANIFEST_V1 = deepFreeze({
  schemaVersion: 'SURFACE_MANIFEST_V1',
  surfaceId: 'surface.atlas.continuityLedger.wseThreadsExplanation',
  host: 'rightRail',
  slotId: 'rightRail.context.atlas.continuityLedger',
  contributionKind: 'readOnlyProjection',
  existingSurfaceReused: true,
  explicitOpenRequired: true,
  productMutation: false,
  manuscriptMutation: false,
  storageAuthority: false,
  commandAuthority: false,
  viewIds: Object.keys(WSE_THREADS_EXPLANATION_QUERY_PLANS_V1),
  keyboard: ['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'],
  fallback: { empty: 'WSE_NO_EXPLICIT_THREADS', degraded: 'WSE_THREAD_EVIDENCE_STALE', unavailable: 'WSE_THREAD_SOURCE_UNAVAILABLE' },
});

function normalizeEvidence(fact) {
  const anchor = isPlainObject(fact.evidenceAnchor) ? fact.evidenceAnchor : {};
  return {
    anchorId: text(anchor.anchorId),
    factId: text(fact.id),
    sceneId: text(anchor.sceneId || fact.sceneId),
    quote: typeof anchor.quote === 'string' ? anchor.quote : '',
    startOffset: Number.isSafeInteger(anchor.startOffset) ? anchor.startOffset : 0,
    endOffset: Number.isSafeInteger(anchor.endOffset) ? anchor.endOffset : 0,
    quoteHash: text(anchor.quoteHash),
    sceneTextHash: text(anchor.sceneTextHash),
    evidenceState: fact.evidenceState === 'current' ? 'current' : 'staleOrMissing',
  };
}

function normalizePromiseFact(fact, projectId) {
  if (!isPlainObject(fact) || text(fact.projectId) !== projectId) fail('E_WSE_THREADS_FACT_IDENTITY');
  const id = assertIdentityText(text(fact.id), 'E_WSE_THREADS_FACT_IDENTITY');
  const promiseState = text(fact.promiseState).toLowerCase();
  if (!PROMISE_STATES.includes(promiseState)) fail('E_WSE_THREADS_PROMISE_STATE');
  return {
    id,
    projectId,
    sceneId: assertIdentityText(text(fact.sceneId), 'E_WSE_THREADS_FACT_SCENE'),
    subjectEntityId: assertIdentityText(text(fact.subjectEntityId), 'E_WSE_THREADS_FACT_SUBJECT'),
    relatedEntityIds: [...new Set((Array.isArray(fact.relatedEntityIds) ? fact.relatedEntityIds : []).map(text).filter(Boolean))].sort(compare),
    factLabel: text(fact.factLabel) || id,
    factValue: text(fact.factValue) || 'UNKNOWN',
    promiseState,
    evidenceState: fact.evidenceState === 'current' ? 'current' : 'staleOrMissing',
    createdByCommandSeq: Number.isSafeInteger(fact.createdByCommandSeq) ? fact.createdByCommandSeq : 0,
    updatedByCommandSeq: Number.isSafeInteger(fact.updatedByCommandSeq) ? fact.updatedByCommandSeq : 0,
    evidence: normalizeEvidence(fact),
  };
}

function groupPromiseFacts(facts) {
  const groups = new Map();
  for (const fact of facts) {
    const key = JSON.stringify([fact.subjectEntityId, fact.factLabel, fact.factValue]);
    const rows = groups.get(key) || [];
    rows.push(fact);
    groups.set(key, rows);
  }
  return [...groups.values()].map((rows) => rows.sort((left, right) => (
    left.createdByCommandSeq - right.createdByCommandSeq
    || left.updatedByCommandSeq - right.updatedByCommandSeq
    || compare(left.sceneId, right.sceneId)
    || compare(left.id, right.id)
  ))).sort((left, right) => compare(left[0].id, right[0].id));
}

function setupPayoffRows(groups) {
  return groups.map((facts) => {
    const states = new Set(facts.map((fact) => fact.promiseState));
    const contradictory = states.has('fulfilled') && states.has('broken');
    const payoffState = contradictory ? 'CONTRADICTORY'
      : states.has('fulfilled') ? 'FULFILLED'
        : states.has('broken') ? 'BROKEN' : 'UNKNOWN_NOT_RECORDED';
    const payoffFacts = payoffState === 'FULFILLED' ? facts.filter((fact) => fact.promiseState === 'fulfilled')
      : payoffState === 'BROKEN' ? facts.filter((fact) => fact.promiseState === 'broken')
        : contradictory ? facts.filter((fact) => fact.promiseState !== 'open') : [];
    const evidenceState = facts.every((fact) => fact.evidenceState === 'current') ? 'current' : 'staleOrMissing';
    const first = facts[0];
    return {
      id: `setup-payoff:${hashCanonicalValue([first.subjectEntityId, first.factLabel, first.factValue])}`,
      label: first.factLabel,
      value: first.factValue,
      subjectEntityId: first.subjectEntityId,
      participantEntityIds: [...new Set(facts.flatMap((fact) => [fact.subjectEntityId, ...fact.relatedEntityIds]))].sort(compare),
      setupState: 'EXPLICIT_PROMISE_RECORD',
      payoffState,
      factIds: facts.map((fact) => fact.id),
      setupEvidence: facts.map((fact) => fact.evidence),
      payoffEvidence: payoffFacts.map((fact) => fact.evidence),
      evidenceState,
    };
  });
}

function verifyCausalContext(context, projectId) {
  if (context === null) return null;
  assertExactObject(context, CAUSAL_CONTEXT_KEYS, 'E_WSE_THREADS_CAUSAL_CONTEXT');
  const snapshot = assertAtlasBookSnapshotCurrent(context.snapshot, context.currentSnapshotIdentity);
  if (snapshot.projectId !== projectId) fail('E_WSE_THREADS_CAUSAL_PROJECT');
  const timeKnowledge = verifyAtlasTimeKnowledgeProjection(context.timeKnowledgeProjection, snapshot);
  const threads = verifyAtlasThreadsCausalityProjection(context.threadsCausalityProjection, snapshot, timeKnowledge);
  return { snapshot, timeKnowledge, threads };
}

function causalEvidence(edge, timeKnowledge) {
  const cellsById = new Map(timeKnowledge.cells.map((cell) => [cell.cellId, cell]));
  const anchorsById = new Map(timeKnowledge.evidenceAnchors.map((anchor) => [anchor.anchorId, anchor]));
  return edge.evidenceCellIds.map((cellId) => {
    const cell = cellsById.get(cellId);
    const anchors = (cell?.evidenceAnchorIds || []).map((anchorId) => anchorsById.get(anchorId)).filter(Boolean);
    return {
      cellId,
      propositionId: text(cell?.propositionId),
      perspectiveEntityId: text(cell?.perspectiveEntityId),
      epistemicState: text(cell?.epistemicState, 'UNKNOWN'),
      modality: text(cell?.modality, 'UNKNOWN'),
      anchorIds: anchors.map((anchor) => anchor.anchorId),
      sceneIds: [...new Set(anchors.map((anchor) => anchor.sceneId))].sort(compare),
      sceneRevisions: [...new Set(anchors.map((anchor) => anchor.sceneRevision))].sort(compare),
    };
  });
}

function dependencyModel(causal) {
  if (!causal) return {
    availability: 'UNKNOWN_NO_EXPLICIT_CAUSAL_PROJECTION',
    rows: [],
    nodes: [],
    layers: [],
  };
  const propositionIds = [...new Set(causal.threads.threads.flatMap((thread) => thread.propositionIds))].sort(compare);
  const outgoing = new Map(propositionIds.map((id) => [id, []]));
  const indegree = new Map(propositionIds.map((id) => [id, 0]));
  for (const edge of causal.threads.causalEdges) {
    outgoing.get(edge.sourcePropositionId)?.push(edge.targetPropositionId);
    indegree.set(edge.targetPropositionId, (indegree.get(edge.targetPropositionId) || 0) + 1);
  }
  const ready = propositionIds.filter((id) => indegree.get(id) === 0);
  const layerById = new Map(propositionIds.map((id) => [id, 0]));
  for (let cursor = 0; cursor < ready.length; cursor += 1) {
    const source = ready[cursor];
    for (const target of (outgoing.get(source) || []).sort(compare)) {
      layerById.set(target, Math.max(layerById.get(target) || 0, (layerById.get(source) || 0) + 1));
      const next = (indegree.get(target) || 0) - 1;
      indegree.set(target, next);
      if (next === 0) ready.push(target);
    }
  }
  const nodes = propositionIds.map((propositionId) => ({ propositionId, layer: layerById.get(propositionId) || 0 }));
  const layers = [...new Set(nodes.map((node) => node.layer))].sort((a, b) => a - b)
    .map((layer) => ({ layer, propositionIds: nodes.filter((node) => node.layer === layer).map((node) => node.propositionId) }));
  const rows = causal.threads.causalEdges.map((edge) => ({
    id: edge.edgeId,
    sourcePropositionId: edge.sourcePropositionId,
    targetPropositionId: edge.targetPropositionId,
    sourceLayer: layerById.get(edge.sourcePropositionId) || 0,
    targetLayer: layerById.get(edge.targetPropositionId) || 0,
    relation: edge.relation,
    epistemicState: edge.epistemicState,
    evidence: causalEvidence(edge, causal.timeKnowledge),
  }));
  return { availability: 'EXPLICIT_VERIFIED_CAUSAL_PROJECTION', rows, nodes, layers };
}

function canonCiRows(setupRows, dependency) {
  const rows = setupRows.map((row) => {
    let status = 'ABSTAIN';
    let reason = 'PAYOFF_NOT_RECORDED';
    if (row.evidenceState !== 'current') reason = 'STALE_OR_MISSING_EVIDENCE';
    else if (row.payoffState === 'FULFILLED') { status = 'PASS'; reason = 'EXPLICIT_FULFILLED_EVIDENCE'; }
    else if (row.payoffState === 'BROKEN') { status = 'REVIEW'; reason = 'EXPLICIT_BROKEN_PROMISE'; }
    else if (row.payoffState === 'CONTRADICTORY') { status = 'REVIEW'; reason = 'CONTRADICTORY_PAYOFF_EVIDENCE'; }
    return { id: `canon:${row.id}`, subjectId: row.id, checkKind: 'SETUP_PAYOFF', status, reason, evidenceState: row.evidenceState };
  });
  if (dependency.availability !== 'EXPLICIT_VERIFIED_CAUSAL_PROJECTION') {
    rows.push({ id: 'canon:causal-projection', subjectId: '', checkKind: 'DEPENDENCY_DAG', status: 'ABSTAIN', reason: dependency.availability, evidenceState: 'unknown' });
  } else {
    for (const edge of dependency.rows) {
      const evidencePresent = edge.evidence.length > 0 && edge.evidence.every((item) => item.anchorIds.length > 0);
      const status = !evidencePresent || edge.epistemicState === 'UNKNOWN' ? 'ABSTAIN'
        : edge.epistemicState === 'ASSERTED' ? 'PASS' : 'REVIEW';
      const reason = !evidencePresent ? 'EDGE_EVIDENCE_MISSING'
        : edge.epistemicState === 'ASSERTED' ? 'EXPLICIT_ASSERTED_EDGE'
          : edge.epistemicState === 'UNKNOWN' ? 'EDGE_EPISTEMIC_STATE_UNKNOWN' : `EDGE_${edge.epistemicState}_REQUIRES_REVIEW`;
      rows.push({ id: `canon:${edge.id}`, subjectId: edge.id, checkKind: 'CAUSAL_EDGE', status, reason, evidenceState: evidencePresent ? 'current' : 'staleOrMissing' });
    }
  }
  return rows;
}

function whyRows(dependency) {
  if (dependency.availability !== 'EXPLICIT_VERIFIED_CAUSAL_PROJECTION') return [{
    id: 'why:causal-projection-unavailable',
    sourcePropositionId: '', targetPropositionId: '', relationState: 'UNKNOWN', relation: '', epistemicState: 'UNKNOWN',
    unknownReason: dependency.availability, evidence: [],
  }];
  if (dependency.rows.length === 0) return [{
    id: 'why:no-explicit-edges',
    sourcePropositionId: '', targetPropositionId: '', relationState: 'UNKNOWN', relation: '', epistemicState: 'UNKNOWN',
    unknownReason: 'NO_EXPLICIT_DIRECT_CAUSAL_EDGE', evidence: [],
  }];
  return dependency.rows.map((row) => ({
    id: `why:${row.id}`,
    sourcePropositionId: row.sourcePropositionId,
    targetPropositionId: row.targetPropositionId,
    relationState: 'EXPLICIT', relation: row.relation, epistemicState: row.epistemicState,
    unknownReason: '', evidence: row.evidence,
  }));
}

function limitRows(rows, limit, extra = {}) {
  return deepFreeze({
    ...extra,
    rows: rows.slice(0, limit),
    totalCount: rows.length,
    visibleCount: Math.min(rows.length, limit),
    omittedCount: Math.max(0, rows.length - limit),
  });
}

function projectionIdentity(projection) {
  const { projectionDigest, ...identity } = projection;
  return identity;
}

export function buildWseThreadsExplanation(input) {
  assertExactObject(input, INPUT_KEYS, 'E_WSE_THREADS_INPUT');
  const projectId = assertIdentityText(input.projectId, 'E_WSE_THREADS_PROJECT_ID');
  const sourceRevision = assertIdentityText(input.sourceRevision, 'E_WSE_THREADS_SOURCE_REVISION');
  const currentSourceRevision = assertIdentityText(input.currentSourceRevision, 'E_WSE_THREADS_CURRENT_SOURCE_REVISION');
  if (sourceRevision !== currentSourceRevision) fail('E_WSE_THREADS_STALE_SOURCE_REVISION');
  if (!Number.isSafeInteger(input.generation) || input.generation < 0
    || !Number.isSafeInteger(input.currentGeneration) || input.currentGeneration < 0
    || input.generation !== input.currentGeneration) fail('E_WSE_THREADS_STALE_GENERATION');
  const limit = Number.isSafeInteger(input.rowLimit) && input.rowLimit > 0
    ? Math.min(input.rowLimit, WSE_THREADS_EXPLANATION_LIMITS_V1.maxVisibleRowsPerView) : 32;
  const rawFacts = assertDenseArray(input.facts, WSE_THREADS_EXPLANATION_LIMITS_V1.maxInputFacts, 'E_WSE_THREADS_FACT_BUDGET');
  const promiseFacts = rawFacts.filter((fact) => isPlainObject(fact) && text(fact.ledgerKind) === 'promise')
    .map((fact) => normalizePromiseFact(fact, projectId));
  const setupRows = setupPayoffRows(groupPromiseFacts(promiseFacts));
  const causal = verifyCausalContext(input.causalContext, projectId);
  const dependency = dependencyModel(causal);
  const ciRows = canonCiRows(setupRows, dependency);
  const explanationRows = whyRows(dependency);
  const evidenceReferences = setupRows.reduce((sum, row) => sum + row.setupEvidence.length + row.payoffEvidence.length, 0)
    + dependency.rows.reduce((sum, row) => sum + row.evidence.length, 0);
  if (evidenceReferences > WSE_THREADS_EXPLANATION_LIMITS_V1.maxEvidenceReferences) fail('E_WSE_THREADS_EVIDENCE_BUDGET');
  const ciDenominator = {
    pass: ciRows.filter((row) => row.status === 'PASS').length,
    review: ciRows.filter((row) => row.status === 'REVIEW').length,
    abstain: ciRows.filter((row) => row.status === 'ABSTAIN').length,
  };
  const degraded = setupRows.some((row) => row.evidenceState !== 'current')
    || dependency.rows.some((row) => row.epistemicState === 'UNKNOWN');
  const value = {
    schemaVersion: WSE_THREADS_EXPLANATION_SCHEMA_VERSION,
    projectId,
    sourceRevision,
    generation: input.generation,
    state: setupRows.length === 0 && !causal ? 'empty' : degraded ? 'degraded' : 'ready',
    selectedViewDefault: 'setupPayoffBoard',
    views: {
      setupPayoffBoard: limitRows(setupRows, limit),
      dependencyDag: limitRows(dependency.rows, limit, {
        availability: dependency.availability,
        nodes: dependency.nodes.slice(0, limit),
        nodeTotalCount: dependency.nodes.length,
        layers: dependency.layers.slice(0, limit),
        layerTotalCount: dependency.layers.length,
        omittedLayerCount: Math.max(0, dependency.layers.length - limit),
        textualParity: true,
      }),
      canonCi: limitRows(ciRows, limit, { statusDenominator: ciDenominator }),
      whyWhyNot: limitRows(explanationRows, limit, { directRelationsOnly: true }),
    },
    denominator: {
      inputFacts: rawFacts.length,
      promiseFacts: promiseFacts.length,
      promiseThreads: setupRows.length,
      causalThreads: causal?.threads.threadCount || 0,
      causalEdges: dependency.rows.length,
      evidenceReferences,
      complete: true,
    },
    availability: {
      promiseFacts: setupRows.length > 0 ? 'EXPLICIT_AUTHORED_FACTS' : 'UNKNOWN_NOT_RECORDED',
      causalProjection: dependency.availability,
    },
    openWorld: {
      absenceMeans: 'UNKNOWN_NOT_RECORDED',
      missingDirectEdgeMeans: 'UNKNOWN_NO_EXPLICIT_DIRECT_CAUSAL_EDGE',
      inference: false,
      transitiveClosure: false,
    },
    authority: {
      stateClass: 'DERIVED_STATE', readOnly: true, productMutation: false, manuscriptMutation: false,
      storageAuthority: false, commandAuthority: false, networkAuthority: false,
    },
    featureSpecDigest: WSE_THREADS_EXPLANATION_FEATURE_SPEC_V1.specDigest,
    queryPlanDigests: Object.fromEntries(Object.entries(WSE_THREADS_EXPLANATION_QUERY_PLANS_V1).map(([key, plan]) => [key, plan.queryDigest])),
    featureManifestDigest: digest(WSE_THREADS_EXPLANATION_FEATURE_INTEGRATION_MANIFEST_V1),
    surfaceManifest: WSE_THREADS_EXPLANATION_SURFACE_MANIFEST_V1,
    causalProjectionDigest: causal?.threads.projectionDigest || '',
  };
  return deepFreeze({ ...value, projectionDigest: digest(value) });
}

export function assertWseThreadsExplanationCurrent(projection, currentIdentity) {
  if (!isPlainObject(projection) || projection.schemaVersion !== WSE_THREADS_EXPLANATION_SCHEMA_VERSION) fail('E_WSE_THREADS_PROJECTION');
  assertExactObject(currentIdentity, CURRENT_IDENTITY_KEYS, 'E_WSE_THREADS_CURRENT_IDENTITY');
  if (projection.projectId !== currentIdentity.projectId
    || projection.sourceRevision !== currentIdentity.sourceRevision
    || projection.generation !== currentIdentity.generation
    || projection.projectionDigest !== currentIdentity.projectionDigest) fail('E_WSE_THREADS_PROJECTION_STALE');
  if (projection.projectionDigest !== digest(projectionIdentity(projection))) fail('E_WSE_THREADS_PROJECTION_TAMPER');
  return projection;
}

export function explainWseWhyWhyNot(input) {
  assertExactObject(input, QUERY_KEYS, 'E_WSE_THREADS_WHY_QUERY');
  const projection = assertWseThreadsExplanationCurrent(input.projection, input.currentIdentity);
  const sourcePropositionId = assertIdentityText(input.sourcePropositionId, 'E_WSE_THREADS_WHY_SOURCE');
  const targetPropositionId = assertIdentityText(input.targetPropositionId, 'E_WSE_THREADS_WHY_TARGET');
  if (sourcePropositionId === targetPropositionId) fail('E_WSE_THREADS_WHY_SELF_PAIR');
  const matches = projection.views.dependencyDag.rows.filter((row) => (
    row.sourcePropositionId === sourcePropositionId && row.targetPropositionId === targetPropositionId
  ));
  const value = {
    schemaVersion: WSE_THREADS_EXPLANATION_QUERY_SCHEMA_VERSION,
    projectId: projection.projectId,
    sourceRevision: projection.sourceRevision,
    generation: projection.generation,
    projectionDigest: projection.projectionDigest,
    sourcePropositionId,
    targetPropositionId,
    relationState: matches.length > 0 ? 'EXPLICIT'
      : projection.views.dependencyDag.omittedCount > 0 ? 'ABSTAIN' : 'UNKNOWN',
    unknownReason: matches.length > 0 ? ''
      : projection.views.dependencyDag.omittedCount > 0
        ? 'DIRECT_EDGE_OUTSIDE_VISIBLE_BOUND_POSSIBLE'
        : 'NO_EXPLICIT_DIRECT_CAUSAL_EDGE',
    directRelationCount: matches.length,
    relations: matches,
    inference: false,
  };
  return deepFreeze({ ...value, queryDigest: digest(value) });
}
