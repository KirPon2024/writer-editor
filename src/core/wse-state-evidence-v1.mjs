import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { compileTypedQueryIr, freezeFeatureSpec } from './frozen-feature-spec-query-ir-v1.mjs';

export const WSE_STATE_EVIDENCE_SCHEMA_VERSION = 'yalken.wseStateEvidence.v1';
export const WSE_STATE_EVIDENCE_LIMITS_V1 = Object.freeze({
  maxInputFacts: 10_000,
  maxInputRows: 10_000,
  maxVisibleRowsPerView: 128,
  maxEvidenceReferences: 16_384,
  maxRelatedEntitiesPerFact: 64,
  maxEvidencePerRow: 16,
});

const deepFreeze = (value) => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const isPlainObject = (value) => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const text = (value, fallback = '') => typeof value === 'string' ? value.trim() : fallback;
const compare = (left, right) => String(left || '').localeCompare(String(right || ''), 'en', { sensitivity: 'variant' });
const bounded = (value, maximum, code) => {
  if (!Array.isArray(value) || value.length > maximum) fail(code);
  return value;
};

export const WSE_STATE_EVIDENCE_FEATURE_SPEC_V1 = freezeFeatureSpec({
  featureId: 'yalken.wseStateEvidence.v1',
  outcome: 'Four bounded source-first views over authored continuity facts and findings.',
  nonGoals: ['Automatic manuscript change', 'Knowledge inference from missing facts', 'New persistence or command authority'],
  inputs: ['Authored continuity fact ledger projection', 'Continuity finding projection'],
  outputs: ['Story state debugger', 'Living evidence bible', 'Scene cockpit', 'Knowledge matrix'],
  invariants: ['Absence remains unknown', 'Every emitted claim retains evidence state', 'Projection is read-only'],
  limits: { maxAssociations: 10_000, maxResults: 128, maxEvidenceReferences: 16_384 },
  threatProfile: ['Stale evidence', 'Cross-project result', 'Unbounded corpus', 'Renderer authority leak'],
  rollback: 'Revert the bounded WP603 merge by a new reviewed commit.',
  corpus: { corpusId: 'wp603-wse-state-evidence-v1', normalCases: 4, boundaryCases: 3, adversarialCases: 4, counterexampleCases: 3, negativeDenominator: 10 },
  relationTypes: ['knows', 'locatedAt', 'mentions', 'owns'],
});

export const WSE_STATE_EVIDENCE_QUERY_PLANS_V1 = deepFreeze({
  storyStateDebugger: compileTypedQueryIr(WSE_STATE_EVIDENCE_FEATURE_SPEC_V1, {
    queryId: 'query.wse.storyStateDebugger.v1', relationTypes: ['mentions'], entityIds: [], endpoint: 'EITHER', limit: 128,
  }),
  livingEvidenceBible: compileTypedQueryIr(WSE_STATE_EVIDENCE_FEATURE_SPEC_V1, {
    queryId: 'query.wse.livingEvidenceBible.v1', relationTypes: ['knows', 'locatedAt', 'mentions', 'owns'], entityIds: [], endpoint: 'EITHER', limit: 128,
  }),
  sceneCockpit: compileTypedQueryIr(WSE_STATE_EVIDENCE_FEATURE_SPEC_V1, {
    queryId: 'query.wse.sceneCockpit.v1', relationTypes: ['knows', 'locatedAt', 'mentions', 'owns'], entityIds: [], endpoint: 'EITHER', limit: 128,
  }),
  knowledgeMatrix: compileTypedQueryIr(WSE_STATE_EVIDENCE_FEATURE_SPEC_V1, {
    queryId: 'query.wse.knowledgeMatrix.v1', relationTypes: ['knows'], entityIds: [], endpoint: 'EITHER', limit: 128,
  }),
});

export const WSE_STATE_EVIDENCE_FEATURE_INTEGRATION_MANIFEST_V1 = deepFreeze({
  schemaVersion: 'FEATURE_INTEGRATION_MANIFEST_V1',
  featureId: 'yalken.wseStateEvidence.v1',
  productPlane: 'AUTHORED_CONTINUITY_FACTS_AND_FINDINGS_READ_ONLY',
  interfacePlane: 'EXISTING_ATLAS_CONTINUITY_RIGHT_RAIL_SLOT',
  commands: ['NOT_APPLICABLE_READ_ONLY_QUERY'],
  queries: Object.values(WSE_STATE_EVIDENCE_QUERY_PLANS_V1).map((plan) => plan.queryId),
  events: ['NOT_APPLICABLE_NO_NEW_EVENT'],
  effects: ['NOT_APPLICABLE_NO_EFFECT'],
  productPorts: ['query.atlasContinuityLedgerSurface'],
  designOsPorts: ['rightRail.context.atlas.continuityLedger'],
  stateClasses: ['DERIVED_STATE', 'TRANSIENT_STATE'],
  identityGuards: ['projectId', 'sourceRevision', 'generation', 'surfaceHash', 'evidenceAnchorHash'],
  fallback: ['UNKNOWN_OPEN_WORLD_ABSENCE', 'ABSTAIN_UNAVAILABLE_OR_OVER_BUDGET', 'STALE_OR_MISSING_EVIDENCE'],
  recovery: 'RECOMPUTE_FROM_CURRENT_IMMUTABLE_SOURCE',
  performance: WSE_STATE_EVIDENCE_LIMITS_V1,
  accessibility: ['NATIVE_TAB_BUTTONS', 'NATIVE_TABLE_OR_LIST', 'TEXT_STATUS', 'VISIBLE_FOCUS'],
  security: 'LOCAL_PLAIN_DATA_ONLY_NO_STORAGE_NETWORK_COMMAND_OR_PROVIDER_AUTHORITY',
  rollback: 'REVERT_BY_NEW_REVIEWED_COMMIT',
});

export const WSE_STATE_EVIDENCE_SURFACE_MANIFEST_V1 = deepFreeze({
  schemaVersion: 'SURFACE_MANIFEST_V1',
  surfaceId: 'surface.atlas.continuityLedger.wseStateEvidence',
  host: 'rightRail',
  slotId: 'rightRail.context.atlas.continuityLedger',
  contributionKind: 'readOnlyProjection',
  existingSurfaceReused: true,
  explicitOpenRequired: true,
  productMutation: false,
  manuscriptMutation: false,
  storageAuthority: false,
  commandAuthority: 'CommandKernel',
  viewIds: Object.keys(WSE_STATE_EVIDENCE_QUERY_PLANS_V1),
  keyboard: ['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', 'Space'],
  fallback: { empty: 'WSE_NO_AUTHORED_FACTS', degraded: 'WSE_EVIDENCE_STALE_OR_MISSING', unavailable: 'WSE_SOURCE_UNAVAILABLE' },
});

function evidence(fact) {
  const anchor = isPlainObject(fact.evidenceAnchor) ? fact.evidenceAnchor : {};
  return {
    anchorId: text(anchor.anchorId),
    factId: text(fact.id),
    ledgerKind: text(fact.ledgerKind),
    sceneId: text(anchor.sceneId || fact.sceneId),
    subjectEntityId: text(fact.subjectEntityId),
    quote: typeof anchor.quote === 'string' ? anchor.quote : '',
    startOffset: Number.isSafeInteger(anchor.startOffset) ? anchor.startOffset : 0,
    endOffset: Number.isSafeInteger(anchor.endOffset) ? anchor.endOffset : 0,
    quoteHash: text(anchor.quoteHash),
    sceneTextHash: text(anchor.sceneTextHash),
    evidenceState: fact.evidenceState === 'current' ? 'current' : 'staleOrMissing',
  };
}
function continuityEvidence(value) {
  const source = isPlainObject(value) ? value : {};
  const target = isPlainObject(source.jumpIntent?.target) ? source.jumpIntent.target : {};
  return {
    anchorId: text(source.anchorId),
    factId: text(source.factId),
    ledgerKind: text(source.ledgerKind),
    sceneId: text(source.sceneId || target.sceneId),
    subjectEntityId: text(source.subjectEntityId),
    quote: typeof source.quote === 'string' ? source.quote : '',
    startOffset: Number.isSafeInteger(source.startOffset) ? source.startOffset : 0,
    endOffset: Number.isSafeInteger(source.endOffset) ? source.endOffset : 0,
    quoteHash: text(source.quoteHash || target.quoteHash),
    sceneTextHash: text(source.sceneTextHash || target.sceneTextHash),
    evidenceState: source.evidenceState === 'current' ? 'current' : 'staleOrMissing',
  };
}
function limitRows(rows, limit) {
  return { rows: rows.slice(0, limit), totalCount: rows.length, visibleCount: Math.min(rows.length, limit), omittedCount: Math.max(0, rows.length - limit) };
}
function normalizeFact(fact, projectId) {
  if (!isPlainObject(fact) || text(fact.projectId) !== projectId || !text(fact.id) || !text(fact.ledgerKind)) fail('E_WSE_FACT_IDENTITY');
  if (Array.isArray(fact.relatedEntityIds) && fact.relatedEntityIds.length > WSE_STATE_EVIDENCE_LIMITS_V1.maxRelatedEntitiesPerFact) fail('E_WSE_RELATED_ENTITY_BUDGET');
  return {
    id: text(fact.id), ledgerKind: text(fact.ledgerKind), sceneId: text(fact.sceneId),
    subjectEntityId: text(fact.subjectEntityId), relatedEntityIds: Array.isArray(fact.relatedEntityIds) ? [...new Set(fact.relatedEntityIds.map(text).filter(Boolean))].sort(compare) : [],
    factLabel: text(fact.factLabel), factValue: text(fact.factValue), promiseState: text(fact.promiseState),
    evidenceState: fact.evidenceState === 'current' ? 'current' : 'staleOrMissing', source: text(fact.source, 'author'),
    sourceHash: text(fact.sourceHash), evidence: evidence(fact),
  };
}

export function buildWseStateEvidence(input = {}) {
  if (!isPlainObject(input)) fail('E_WSE_INPUT');
  const projectId = text(input.projectId);
  if (!projectId) fail('E_WSE_PROJECT_ID');
  const limit = Number.isSafeInteger(input.rowLimit) ? Math.max(1, Math.min(input.rowLimit, WSE_STATE_EVIDENCE_LIMITS_V1.maxVisibleRowsPerView)) : 32;
  const facts = bounded(input.facts, WSE_STATE_EVIDENCE_LIMITS_V1.maxInputFacts, 'E_WSE_FACT_BUDGET')
    .map((fact) => normalizeFact(fact, projectId))
    .sort((a, b) => compare(a.ledgerKind, b.ledgerKind) || compare(a.sceneId, b.sceneId) || compare(a.id, b.id));
  const continuityRows = bounded(input.continuityRows, WSE_STATE_EVIDENCE_LIMITS_V1.maxInputRows, 'E_WSE_ROW_BUDGET').filter(isPlainObject);
  const continuityEvidenceCount = continuityRows.reduce((sum, row) => sum + (Array.isArray(row.evidenceRows) ? row.evidenceRows.length : 0), 0);
  if (facts.length + continuityEvidenceCount > WSE_STATE_EVIDENCE_LIMITS_V1.maxEvidenceReferences) fail('E_WSE_EVIDENCE_BUDGET');

  const storyRows = continuityRows.map((row) => {
    const rowEvidence = Array.isArray(row.evidenceRows) ? row.evidenceRows.filter(isPlainObject).map(continuityEvidence) : [];
    return {
      id: text(row.id), kind: text(row.findingKind || row.outcomeKind || row.rowKind), severity: text(row.severity, 'info'),
      summary: text(row.summary), sceneIds: Array.isArray(row.sceneIds) ? row.sceneIds.map(text).filter(Boolean) : [],
      evidenceState: rowEvidence.length > 0 && rowEvidence.every((item) => item.evidenceState === 'current') ? 'current' : 'staleOrMissing',
      evidence: rowEvidence.slice(0, WSE_STATE_EVIDENCE_LIMITS_V1.maxEvidencePerRow),
      evidenceTotalCount: rowEvidence.length,
      omittedEvidenceCount: Math.max(0, rowEvidence.length - WSE_STATE_EVIDENCE_LIMITS_V1.maxEvidencePerRow),
    };
  });
  const story = limitRows(storyRows, limit);
  const bible = limitRows(facts.map((fact) => ({
    id: fact.id, ledgerKind: fact.ledgerKind, label: fact.factLabel, value: fact.factValue || fact.promiseState || 'UNKNOWN',
    sceneId: fact.sceneId, subjectEntityId: fact.subjectEntityId, evidenceState: fact.evidenceState, source: fact.source, evidence: fact.evidence,
  })), limit);
  const byScene = new Map();
  for (const fact of facts) {
    if (!byScene.has(fact.sceneId)) byScene.set(fact.sceneId, []);
    byScene.get(fact.sceneId).push(fact);
  }
  const cockpit = limitRows([...byScene].sort(([a], [b]) => compare(a, b)).map(([sceneId, sceneFacts]) => ({
    id: 'scene:' + sceneId, sceneId, factCount: sceneFacts.length,
    currentEvidenceCount: sceneFacts.filter((fact) => fact.evidenceState === 'current').length,
    staleEvidenceCount: sceneFacts.filter((fact) => fact.evidenceState !== 'current').length,
    evidenceState: sceneFacts.some((fact) => fact.evidenceState !== 'current') ? 'staleOrMissing' : 'current',
    ledgerKinds: [...new Set(sceneFacts.map((fact) => fact.ledgerKind))].sort(compare),
    factIds: sceneFacts.map((fact) => fact.id),
    evidence: sceneFacts.slice(0, WSE_STATE_EVIDENCE_LIMITS_V1.maxEvidencePerRow).map((fact) => fact.evidence),
    evidenceTotalCount: sceneFacts.length,
    omittedEvidenceCount: Math.max(0, sceneFacts.length - WSE_STATE_EVIDENCE_LIMITS_V1.maxEvidencePerRow),
  })), limit);
  const matrixRows = [];
  let matrixTotalCount = 0;
  for (const fact of facts) {
    if (fact.ledgerKind !== 'knowledge') continue;
    const targets = fact.relatedEntityIds.length ? fact.relatedEntityIds : ['UNSPECIFIED'];
    matrixTotalCount += targets.length;
    for (const targetEntityId of targets) {
      if (matrixRows.length >= limit) continue;
      matrixRows.push({
        id: fact.id + ':' + targetEntityId, subjectEntityId: fact.subjectEntityId, targetEntityId,
        claim: fact.factValue || fact.factLabel || 'UNKNOWN', sourceFactId: fact.id,
        evidenceState: fact.evidenceState, evidence: fact.evidence,
      });
    }
  }
  const matrix = { rows: matrixRows, totalCount: matrixTotalCount, visibleCount: matrixRows.length, omittedCount: Math.max(0, matrixTotalCount - matrixRows.length) };
  const value = {
    schemaVersion: WSE_STATE_EVIDENCE_SCHEMA_VERSION, projectId,
    state: facts.length === 0 && continuityRows.length === 0
      ? 'empty'
      : facts.some((fact) => fact.evidenceState !== 'current') || storyRows.some((row) => row.evidenceState !== 'current') ? 'degraded' : 'ready',
    selectedViewDefault: 'storyStateDebugger',
    views: { storyStateDebugger: story, livingEvidenceBible: bible, sceneCockpit: cockpit, knowledgeMatrix: matrix },
    denominator: { inputFacts: facts.length, inputContinuityRows: continuityRows.length, evidenceReferences: facts.length + continuityEvidenceCount, complete: true },
    openWorld: { absenceMeans: 'UNKNOWN_NOT_RECORDED', contradictionMeans: 'REVIEW_REQUIRED_NOT_AUTO_RESOLVED', inference: false },
    authority: { stateClass: 'DERIVED_STATE', readOnly: true, productMutation: false, manuscriptMutation: false, storageAuthority: false, commandAuthority: false },
    featureSpecDigest: WSE_STATE_EVIDENCE_FEATURE_SPEC_V1.specDigest,
    queryPlanDigests: Object.fromEntries(Object.entries(WSE_STATE_EVIDENCE_QUERY_PLANS_V1).map(([key, plan]) => [key, plan.queryDigest])),
    featureManifestDigest: 'sha256:' + hashCanonicalValue(WSE_STATE_EVIDENCE_FEATURE_INTEGRATION_MANIFEST_V1),
    surfaceManifest: WSE_STATE_EVIDENCE_SURFACE_MANIFEST_V1,
  };
  return deepFreeze({ ...value, projectionDigest: 'sha256:' + hashCanonicalValue(value) });
}
