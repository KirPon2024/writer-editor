import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { assertAtlasBookSnapshotCurrent } from './atlas-book-snapshot-v1.mjs';
import { verifyAtlasTimeKnowledgeProjection } from './atlas-time-knowledge-v1.mjs';

export const WSE_REVISION_TIME_OBJECT_SCHEMA_VERSION = 'yalken.r24.wseRevisionTimeObject.v1';
export const WSE_REVISION_TIME_OBJECT_STAGE_ID = 'WP-605_WSE_REVISION_TIME_OBJECT';
export const WSE_REVISION_TIME_OBJECT_PROFILE_ID = 'WSE_OPTIONAL_MODULES';
export const WSE_REVISION_TIME_OBJECT_MAX_RECORDS = 10_000;
export const WSE_REVISION_TIME_OBJECT_MAX_VISIBLE_ROWS = 128;

const VIEWS = Object.freeze([
  Object.freeze({ id: 'semanticDiff', label: 'Semantic diff' }),
  Object.freeze({ id: 'retconSimulator', label: 'Retcon' }),
  Object.freeze({ id: 'storyClock', label: 'Story clock' }),
  Object.freeze({ id: 'objectCustody', label: 'Object custody' }),
]);
const ALLOWED_INPUT_KEYS = Object.freeze([
  'currentFacts', 'currentGeneration', 'currentSourceRevision', 'generation', 'objectCustodyEvents',
  'previousSnapshot', 'projectId', 'retconProposal', 'rowLimit', 'sourceRevision', 'timeKnowledgeInput',
]);

export const WSE_REVISION_TIME_OBJECT_FEATURE_INTEGRATION_MANIFEST_V1 = Object.freeze({
  featureId: 'yalken.wse.revisionTimeObject.v1',
  featureVersion: 1,
  stageId: WSE_REVISION_TIME_OBJECT_STAGE_ID,
  profileId: WSE_REVISION_TIME_OBJECT_PROFILE_ID,
  productPlane: 'EXISTING_PRODUCT_CORE_FACTS_AND_CALLER_VERIFIED_REVISION_TIME_CUSTODY_INPUTS',
  interfacePlane: 'EXISTING_ATLAS_CONTINUITY_RIGHT_RAIL_READ_ONLY_PROJECTION',
  commandIds: ['NOT_APPLICABLE_READ_ONLY_PREVIEW'],
  queryIds: ['wse.revisionTimeObject.project.v1'],
  eventTypes: ['NOT_APPLICABLE_NO_EVENT'],
  effectIds: ['NOT_APPLICABLE_NO_EFFECT'],
  productPorts: ['NOT_APPLICABLE_PURE_RETURN_VALUE'],
  designOsPorts: ['query.atlasContinuityLedgerSurface'],
  projectionIds: [WSE_REVISION_TIME_OBJECT_SCHEMA_VERSION],
  stateClasses: ['DERIVED_STATE', 'TRANSIENT_STATE'],
  identityKeys: ['projectId', 'sourceRevision', 'generation', 'projectionDigest'],
  sourceAuthority: 'PRODUCT_CORE_AND_EXPLICITLY_VERIFIED_CALLER_PROJECTIONS',
  mutationAuthority: false,
  persistence: false,
  externalEffects: false,
  runtimeNetwork: false,
  fallbacks: [
    'UNKNOWN_NO_BASELINE', 'EMPTY_NO_RETCON_PROPOSAL', 'UNKNOWN_TIME_SOURCE', 'UNKNOWN_CUSTODY_SOURCE',
  ],
  recovery: 'REBUILD_FROM_CURRENT_IMMUTABLE_INPUTS',
  performanceBudget: {
    maximumRecords: WSE_REVISION_TIME_OBJECT_MAX_RECORDS,
    maximumVisibleRowsPerView: WSE_REVISION_TIME_OBJECT_MAX_VISIBLE_ROWS,
  },
});

export const WSE_REVISION_TIME_OBJECT_SURFACE_MANIFEST_V1 = Object.freeze({
  schemaVersion: 'yalken.r24.wseRevisionTimeObject.surfaceManifest.v1',
  surfaceId: 'surface.atlas.continuityLedger.revisionTimeObject',
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
  if (typeof value !== 'object' || seen.has(value)) fail('E_WP605_INPUT_NOT_PLAIN_DATA', label);
  seen.add(value);
  if (!Array.isArray(value) && !isPlainObject(value)) fail('E_WP605_INPUT_NOT_PLAIN_DATA', label);
  if (Object.getOwnPropertySymbols(value).length > 0) fail('E_WP605_INPUT_SYMBOL', label);
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) fail('E_WP605_INPUT_ACCESSOR', `${label}.${key}`);
    assertOwnData(descriptor.value, `${label}.${key}`, seen);
  }
  seen.delete(value);
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail('E_WP605_OBJECT_REQUIRED', label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail('E_WP605_UNKNOWN_OR_MISSING_FIELD', label);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nonEmpty(value, label) {
  const normalized = text(value);
  if (!normalized) fail('E_WP605_REQUIRED_STRING', label);
  return normalized;
}

function boundedArray(value, label, limit = WSE_REVISION_TIME_OBJECT_MAX_RECORDS) {
  if (!Array.isArray(value)) fail('E_WP605_ARRAY_REQUIRED', label);
  if (value.length > limit) fail('E_WP605_RECORD_BUDGET', label);
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeAnchor(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    anchorId: text(source.anchorId),
    sceneId: text(source.sceneId),
    startOffset: Number.isSafeInteger(source.startOffset) ? Math.max(0, source.startOffset) : 0,
    endOffset: Number.isSafeInteger(source.endOffset) ? Math.max(0, source.endOffset) : 0,
    quote: typeof source.quote === 'string' ? source.quote : '',
    quoteHash: text(source.quoteHash),
    sceneTextHash: text(source.sceneTextHash),
    evidenceState: text(source.evidenceState) || 'unknown',
  };
}

function normalizeFact(value, projectId, label) {
  if (!isPlainObject(value)) fail('E_WP605_FACT_OBJECT', label);
  const id = nonEmpty(value.id, `${label}.id`);
  const factProjectId = text(value.projectId) || projectId;
  if (factProjectId !== projectId) fail('E_WP605_PROJECT_IDENTITY', `${label}.projectId`);
  return {
    id,
    projectId: factProjectId,
    ledgerKind: text(value.ledgerKind) || 'unknown',
    sceneId: text(value.sceneId),
    subjectEntityId: text(value.subjectEntityId),
    relatedEntityIds: Array.isArray(value.relatedEntityIds)
      ? [...new Set(value.relatedEntityIds.map(text).filter(Boolean))].sort()
      : [],
    factLabel: text(value.factLabel),
    factValue: text(value.factValue),
    promiseState: text(value.promiseState),
    evidenceState: text(value.evidenceState) || 'unknown',
    evidenceAnchor: normalizeAnchor(value.evidenceAnchor),
    sourceHash: text(value.sourceHash) || hashCanonicalValue(value),
  };
}

function normalizeFacts(value, projectId, label) {
  const rows = boundedArray(value, label).map((fact, index) => normalizeFact(fact, projectId, `${label}[${index}]`));
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id)) fail('E_WP605_DUPLICATE_FACT_ID', row.id);
    ids.add(row.id);
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id, 'en', { sensitivity: 'variant' }));
}

function anchorForFact(fact) {
  return { ...fact.evidenceAnchor, factId: fact.id, ledgerKind: fact.ledgerKind };
}

function semanticRows(previousFacts, currentFacts, baselineAvailable) {
  if (!baselineAvailable) return [];
  const before = new Map(previousFacts.map((fact) => [fact.id, fact]));
  const after = new Map(currentFacts.map((fact) => [fact.id, fact]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  const rows = [];
  for (const factId of ids) {
    const left = before.get(factId);
    const right = after.get(factId);
    const beforeHash = left ? hashCanonicalValue(left) : '';
    const afterHash = right ? hashCanonicalValue(right) : '';
    if (beforeHash === afterHash) continue;
    rows.push({
      id: `semantic-diff:${factId}`,
      factId,
      change: !left ? 'ADDED' : !right ? 'REMOVED' : 'CHANGED',
      beforeHash,
      afterHash,
      beforeValue: left?.factValue || '',
      afterValue: right?.factValue || '',
      evidence: anchorForFact(right || left),
    });
  }
  return rows;
}

function buildSemanticDiff({ previousFacts, currentFacts, baselineAvailable, rowLimit, previousRevision }) {
  const allRows = semanticRows(previousFacts, currentFacts, baselineAvailable);
  return {
    state: baselineAvailable ? (allRows.length ? 'ready' : 'empty') : 'unknown',
    reason: baselineAvailable ? (allRows.length ? '' : 'NO_SEMANTIC_CHANGES') : 'UNKNOWN_NO_BASELINE',
    previousRevision: baselineAvailable ? previousRevision : '',
    totalCount: allRows.length,
    visibleCount: Math.min(allRows.length, rowLimit),
    omittedCount: Math.max(0, allRows.length - rowLimit),
    rows: allRows.slice(0, rowLimit),
  };
}

function buildRetcon({ currentFacts, proposal, rowLimit, projectId }) {
  if (proposal === null || proposal === undefined) {
    return { state: 'empty', reason: 'EMPTY_NO_RETCON_PROPOSAL', proposalId: '', totalCount: 0, visibleCount: 0, omittedCount: 0, rows: [] };
  }
  exactKeys(proposal, ['operations', 'proposalId'], 'retconProposal');
  const proposalId = nonEmpty(proposal.proposalId, 'retconProposal.proposalId');
  const operations = boundedArray(proposal.operations, 'retconProposal.operations', 100);
  const simulated = new Map(currentFacts.map((fact) => [fact.id, clone(fact)]));
  const touched = new Set();
  for (const [index, operation] of operations.entries()) {
    if (!isPlainObject(operation)) fail('E_WP605_RETCON_OPERATION', String(index));
    const kind = nonEmpty(operation.kind, `retconProposal.operations[${index}].kind`);
    if (!['ADD', 'REMOVE', 'REPLACE'].includes(kind)) fail('E_WP605_RETCON_KIND', kind);
    const factId = nonEmpty(operation.factId, `retconProposal.operations[${index}].factId`);
    if (touched.has(factId)) fail('E_WP605_RETCON_DUPLICATE_TARGET', factId);
    touched.add(factId);
    if (kind === 'REMOVE') {
      if (!simulated.has(factId)) fail('E_WP605_RETCON_TARGET_MISSING', factId);
      simulated.delete(factId);
      continue;
    }
    if (!isPlainObject(operation.fact)) fail('E_WP605_RETCON_FACT_REQUIRED', factId);
    const fact = normalizeFact({ ...operation.fact, id: factId }, projectId, `retconProposal.operations[${index}].fact`);
    if (kind === 'ADD' && simulated.has(factId)) fail('E_WP605_RETCON_TARGET_EXISTS', factId);
    if (kind === 'REPLACE' && !simulated.has(factId)) fail('E_WP605_RETCON_TARGET_MISSING', factId);
    simulated.set(factId, fact);
  }
  const rows = semanticRows(currentFacts, [...simulated.values()].sort((a, b) => a.id.localeCompare(b.id)), true)
    .map((row) => ({ ...row, simulationState: 'SIMULATED_NOT_APPLIED', proposalId }));
  return {
    state: rows.length ? 'ready' : 'empty',
    reason: rows.length ? '' : 'SIMULATION_HAS_NO_SEMANTIC_CHANGE',
    proposalId,
    totalCount: rows.length,
    visibleCount: Math.min(rows.length, rowLimit),
    omittedCount: Math.max(0, rows.length - rowLimit),
    rows: rows.slice(0, rowLimit),
  };
}

function coordinate(value) {
  const source = isPlainObject(value) ? value : {};
  const certainty = ['EXACT', 'APPROXIMATE', 'OPEN', 'UNKNOWN'].includes(source.certainty) ? source.certainty : 'UNKNOWN';
  return { certainty, ordinal: Number.isSafeInteger(source.ordinal) ? source.ordinal : null };
}

function buildStoryClock({ input, rowLimit, projectId }) {
  if (!isPlainObject(input)) return { state: 'unknown', reason: 'UNKNOWN_TIME_SOURCE', totalCount: 0, visibleCount: 0, omittedCount: 0, rows: [] };
  exactKeys(input, ['currentSnapshotIdentity', 'snapshot', 'timeKnowledgeProjection'], 'timeKnowledgeInput');
  let snapshot;
  let projection;
  try {
    snapshot = assertAtlasBookSnapshotCurrent(input.snapshot, input.currentSnapshotIdentity);
    projection = verifyAtlasTimeKnowledgeProjection(input.timeKnowledgeProjection, snapshot);
  } catch (error) {
    fail('E_WP605_TIME_VERIFICATION', error?.code || error?.message || 'INVALID');
  }
  if (text(snapshot.projectId) !== projectId || text(projection.projectId) !== projectId) fail('E_WP605_PROJECT_IDENTITY', 'timeKnowledgeInput.projectId');
  const projectionDigest = nonEmpty(projection.projectionDigest, 'timeKnowledgeInput.timeKnowledgeProjection.projectionDigest');
  const cells = boundedArray(projection.cells, 'timeKnowledgeInput.projection.cells').map((cell, index) => {
    if (!isPlainObject(cell)) fail('E_WP605_TIME_CELL', String(index));
    const tripleTime = isPlainObject(cell.tripleTime) ? cell.tripleTime : {};
    return {
      id: nonEmpty(cell.cellId, `timeKnowledgeInput.projection.cells[${index}].cellId`),
      propositionId: text(cell.propositionId),
      perspectiveEntityId: text(cell.perspectiveEntityId),
      storyTime: coordinate(tripleTime.storyTime),
      narrativeTime: coordinate(tripleTime.narrativeTime),
      knowledgeTime: coordinate(tripleTime.knowledgeTime),
      epistemicState: text(cell.epistemicState) || 'UNKNOWN',
      modality: text(cell.modality) || 'UNKNOWN',
      evidenceAnchorIds: Array.isArray(cell.evidenceAnchorIds) ? cell.evidenceAnchorIds.map(text).filter(Boolean).sort() : [],
    };
  }).sort((a, b) => {
    const ao = a.storyTime.ordinal ?? Number.MAX_SAFE_INTEGER;
    const bo = b.storyTime.ordinal ?? Number.MAX_SAFE_INTEGER;
    return ao - bo || a.id.localeCompare(b.id);
  });
  return { state: cells.length ? 'ready' : 'empty', reason: cells.length ? '' : 'EMPTY_VERIFIED_TIME_PROJECTION', projectionDigest, totalCount: cells.length, visibleCount: Math.min(cells.length, rowLimit), omittedCount: Math.max(0, cells.length - rowLimit), rows: cells.slice(0, rowLimit) };
}

function buildCustody({ events, rowLimit, projectId }) {
  if (events === null || events === undefined) return { state: 'unknown', reason: 'UNKNOWN_CUSTODY_SOURCE', totalCount: 0, visibleCount: 0, omittedCount: 0, rows: [] };
  const normalized = boundedArray(events, 'objectCustodyEvents').map((event, index) => {
    if (!isPlainObject(event)) fail('E_WP605_CUSTODY_EVENT', String(index));
    const eventProjectId = text(event.projectId) || projectId;
    if (eventProjectId !== projectId) fail('E_WP605_PROJECT_IDENTITY', `objectCustodyEvents[${index}].projectId`);
    return {
      eventId: nonEmpty(event.eventId, `objectCustodyEvents[${index}].eventId`),
      projectId: eventProjectId,
      objectId: nonEmpty(event.objectId, `objectCustodyEvents[${index}].objectId`),
      fromEntityId: text(event.fromEntityId),
      toEntityId: nonEmpty(event.toEntityId, `objectCustodyEvents[${index}].toEntityId`),
      sceneId: text(event.sceneId),
      storyOrdinal: Number.isSafeInteger(event.storyOrdinal) ? event.storyOrdinal : null,
      evidence: normalizeAnchor(event.evidenceAnchor),
    };
  });
  const byObject = new Map();
  for (const event of normalized) {
    if (!byObject.has(event.objectId)) byObject.set(event.objectId, []);
    byObject.get(event.objectId).push(event);
  }
  const rows = [...byObject.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([objectId, chain]) => {
    chain.sort((a, b) => (a.storyOrdinal ?? Number.MAX_SAFE_INTEGER) - (b.storyOrdinal ?? Number.MAX_SAFE_INTEGER) || a.eventId.localeCompare(b.eventId));
    let contiguous = chain.length > 0;
    let reason = '';
    for (let index = 1; index < chain.length; index += 1) {
      if (chain[index].storyOrdinal === null || chain[index - 1].storyOrdinal === null || chain[index].storyOrdinal < chain[index - 1].storyOrdinal || chain[index].fromEntityId !== chain[index - 1].toEntityId) {
        contiguous = false;
        reason = 'CUSTODY_CHAIN_GAP_OR_CONFLICT';
        break;
      }
    }
    return {
      id: `object-custody:${objectId}`,
      objectId,
      status: contiguous ? 'VERIFIED_CHAIN' : 'UNKNOWN',
      reason,
      currentHolderEntityId: contiguous ? chain.at(-1).toEntityId : '',
      eventCount: chain.length,
      events: chain,
      evidence: chain.at(-1)?.evidence || normalizeAnchor(),
    };
  });
  return { state: rows.length ? 'ready' : 'empty', reason: rows.length ? '' : 'EMPTY_CUSTODY_EVENTS', totalCount: rows.length, visibleCount: Math.min(rows.length, rowLimit), omittedCount: Math.max(0, rows.length - rowLimit), rows: rows.slice(0, rowLimit) };
}

export function buildWseRevisionTimeObject(input = {}) {
  assertOwnData(input);
  if (!isPlainObject(input)) fail('E_WP605_INPUT_OBJECT');
  const unknown = Object.keys(input).filter((key) => !ALLOWED_INPUT_KEYS.includes(key));
  if (unknown.length) fail('E_WP605_UNKNOWN_INPUT_KEY', unknown.sort().join(','));
  const projectId = nonEmpty(input.projectId, 'projectId');
  const sourceRevision = nonEmpty(input.sourceRevision, 'sourceRevision');
  const currentSourceRevision = nonEmpty(input.currentSourceRevision, 'currentSourceRevision');
  const generation = Number(input.generation);
  const currentGeneration = Number(input.currentGeneration);
  if (!Number.isSafeInteger(generation) || generation < 0 || !Number.isSafeInteger(currentGeneration) || currentGeneration < 0) fail('E_WP605_GENERATION');
  if (sourceRevision !== currentSourceRevision || generation !== currentGeneration) fail('E_WP605_STALE_IDENTITY');
  const rowLimit = Number.isSafeInteger(input.rowLimit) ? Math.max(1, Math.min(WSE_REVISION_TIME_OBJECT_MAX_VISIBLE_ROWS, input.rowLimit)) : 32;
  const currentFacts = normalizeFacts(input.currentFacts || [], projectId, 'currentFacts');
  let previousFacts = [];
  let previousRevision = '';
  let baselineAvailable = false;
  if (input.previousSnapshot !== null && input.previousSnapshot !== undefined) {
    exactKeys(input.previousSnapshot, ['facts', 'projectId', 'revisionId'], 'previousSnapshot');
    if (text(input.previousSnapshot.projectId) !== projectId) fail('E_WP605_PROJECT_IDENTITY', 'previousSnapshot.projectId');
    previousRevision = nonEmpty(input.previousSnapshot.revisionId, 'previousSnapshot.revisionId');
    previousFacts = normalizeFacts(input.previousSnapshot.facts, projectId, 'previousSnapshot.facts');
    baselineAvailable = true;
  }
  const semanticDiff = buildSemanticDiff({ previousFacts, currentFacts, baselineAvailable, rowLimit, previousRevision });
  const retconSimulator = buildRetcon({ currentFacts, proposal: input.retconProposal, rowLimit, projectId });
  const storyClock = buildStoryClock({ input: input.timeKnowledgeInput, rowLimit, projectId });
  const objectCustody = buildCustody({ events: input.objectCustodyEvents, rowLimit, projectId });
  const views = { semanticDiff, retconSimulator, storyClock, objectCustody };
  const denominator = {
    currentFacts: currentFacts.length,
    previousFacts: previousFacts.length,
    retconOperations: Array.isArray(input.retconProposal?.operations) ? input.retconProposal.operations.length : 0,
    timeCells: storyClock.totalCount,
    custodyEvents: Array.isArray(input.objectCustodyEvents) ? input.objectCustodyEvents.length : 0,
    visibleRows: Object.values(views).reduce((sum, view) => sum + view.visibleCount, 0),
    omittedRows: Object.values(views).reduce((sum, view) => sum + view.omittedCount, 0),
  };
  const base = {
    schemaVersion: WSE_REVISION_TIME_OBJECT_SCHEMA_VERSION,
    stageId: WSE_REVISION_TIME_OBJECT_STAGE_ID,
    profileId: WSE_REVISION_TIME_OBJECT_PROFILE_ID,
    projectId,
    identity: { sourceRevision, currentSourceRevision, generation, currentGeneration, staleRejected: true },
    state: Object.values(views).some((view) => view.state === 'ready') ? 'ready' : 'emptyOrUnknown',
    viewOrder: VIEWS.map((view) => view.id),
    views,
    denominator,
    authority: {
      stateClass: 'DERIVED_STATE',
      readOnly: true,
      commandAuthority: false,
      productMutation: false,
      manuscriptMutation: false,
      persistence: false,
      externalEffects: false,
      retconApply: false,
      inferredNegativeClaims: false,
    },
    featureManifest: WSE_REVISION_TIME_OBJECT_FEATURE_INTEGRATION_MANIFEST_V1,
    surfaceManifest: WSE_REVISION_TIME_OBJECT_SURFACE_MANIFEST_V1,
  };
  return deepFreeze({ ...base, projectionDigest: hashCanonicalValue(base) });
}
