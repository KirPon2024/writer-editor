import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { verifyLocalAutomationReplay } from './local-automation-v1.mjs';
import { CORE_COMMAND_IDS, reduceCoreState, hashCoreState } from './runtime.mjs';

// This derived workflow prepares one existing command pair. It has no dispatcher,
// product store, timer, callback, provider, or executable command registry.
export const PROPOSAL_WORKFLOW_LIMITS_V1 = Object.freeze({
  maxEvents: 16, maxInputBytes: 8_388_608, maxTranscriptBytes: 33_554_432,
  maxCoreStateBytes: 2_097_152, maxPublicStateBytes: 2_097_152, maxChanges: 10_000,
});
const AUTHORITY = Object.freeze({ stateClass: 'DERIVED_STATE', commandAuthority: false,
  authentication: false, productMutation: false, persistence: false, externalEffects: false });
const HASH = /^sha256:[a-f0-9]{64}$/u;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const clone = value => JSON.parse(JSON.stringify(value));
const digest = value => `sha256:${hashCanonicalValue(value)}`;
const byteLength = value => new TextEncoder().encode(typeof value === 'string' ? value : canonical(value)).length;
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) fail('E_PROPOSAL_SHAPE');
}
function integer(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail('E_PROPOSAL_BOUND');
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !value || value.length > 200 || value.trim() !== value
    || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)
    || ['__proto__', 'prototype', 'constructor'].includes(value)) fail('E_PROPOSAL_ID');
  return value;
}
function hash(value) { if (typeof value !== 'string' || !HASH.test(value)) fail('E_PROPOSAL_DIGEST'); return value; }
function parse(raw, maximum = PROPOSAL_WORKFLOW_LIMITS_V1.maxInputBytes) {
  if (typeof raw !== 'string' || raw.length > maximum || byteLength(raw) > maximum) fail('E_PROPOSAL_INPUT_BYTES');
  let value;
  try { value = JSON.parse(raw); } catch { fail('E_PROPOSAL_JSON'); }
  let nodes = 0;
  function visit(item, depth) {
    if (++nodes > maximum || depth > 32) fail('E_PROPOSAL_INPUT_BOUND');
    if (typeof item === 'number' && !Number.isFinite(item)) fail('E_PROPOSAL_NUMBER');
    if (item && typeof item === 'object') {
      for (const key of Object.keys(item)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('E_PROPOSAL_UNSAFE_KEY');
        visit(item[key], depth + 1);
      }
    }
  }
  visit(value, 0);
  // Only JSON bytes cross this boundary: duplicate keys, alternate spellings,
  // getters, proxies and executable values cannot become interpreted input.
  if (canonical(value) !== raw) fail('E_PROPOSAL_NONCANONICAL_JSON');
  return value;
}
function configuration(value) {
  exact(value, ['workflowId', 'maxEvents']); identifier(value.workflowId);
  integer(value.maxEvents, 1, PROPOSAL_WORKFLOW_LIMITS_V1.maxEvents);
  return value;
}
const CONTEXT_KEYS = ['projectId', 'projectRevisionId', 'snapshotId', 'projectionDigest', 'generation', 'lifecycleId', 'coreStateDigest'];
function context(value) {
  exact(value, CONTEXT_KEYS); identifier(value.projectId); identifier(value.lifecycleId);
  for (const key of ['projectRevisionId', 'snapshotId', 'projectionDigest', 'coreStateDigest']) hash(value[key]);
  integer(value.generation, 1, Number.MAX_SAFE_INTEGER);
  return value;
}
function core(value, current) {
  exact(value, ['version', 'data']); exact(value.data, ['projects', 'lastCommandId']);
  if (value.version !== 1 || !value.data.projects || typeof value.data.projects !== 'object' || Array.isArray(value.data.projects)
    || !Object.hasOwn(value.data.projects, current.projectId) || !value.data.projects[current.projectId]
    || typeof value.data.projects[current.projectId] !== 'object' || Array.isArray(value.data.projects[current.projectId])
    || !Number.isSafeInteger(value.data.lastCommandId) || value.data.lastCommandId < 0
    || value.data.lastCommandId >= Number.MAX_SAFE_INTEGER - 2
    || byteLength(value) > PROPOSAL_WORKFLOW_LIMITS_V1.maxCoreStateBytes) fail('E_PROPOSAL_CORE_STATE');
  if (`sha256:${hashCoreState(value)}` !== current.coreStateDigest) fail('E_PROPOSAL_CORE_BINDING');
  return value;
}
function sameContext(actual, expected) {
  context(actual);
  if (canonical(actual) !== canonical(expected)) fail('E_PROPOSAL_STALE_CONTEXT');
}
function advancedContext(actual, previous, state) {
  context(actual); core(state, actual);
  if (actual.projectId !== previous.projectId || actual.lifecycleId !== previous.lifecycleId
    || actual.generation <= previous.generation || actual.projectRevisionId === previous.projectRevisionId
    || actual.snapshotId === previous.snapshotId) fail('E_PROPOSAL_OBSERVATION_CONTEXT');
}
function completeDiff(before, after) {
  const changes = [];
  function visit(left, right, path, hasLeft = true, hasRight = true) {
    if (hasLeft && hasRight && canonical(left) === canonical(right)) return;
    if (hasLeft && hasRight && left && right && typeof left === 'object' && typeof right === 'object'
      && Array.isArray(left) === Array.isArray(right)) {
      for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
        visit(left[key], right[key], [...path, key], Object.hasOwn(left, key), Object.hasOwn(right, key));
      }
    } else {
      changes.push({ path, before: { present: hasLeft, value: hasLeft ? left : null },
        after: { present: hasRight, value: hasRight ? right : null } });
      if (changes.length > PROPOSAL_WORKFLOW_LIMITS_V1.maxChanges) fail('E_PROPOSAL_DIFF_BOUND');
    }
  }
  visit(before, after, []);
  if (changes.length === 0) fail('E_PROPOSAL_EMPTY_DIFF');
  return { changes, changeDenominator: changes.length, diffDigest: digest(changes) };
}
function preview(before, command) {
  const result = reduceCoreState(clone(before), clone(command));
  if (!result.ok) fail(`E_PROPOSAL_CORE_REJECTED:${result.error?.code ?? 'UNKNOWN'}`);
  if (byteLength(result.state) > PROPOSAL_WORKFLOW_LIMITS_V1.maxCoreStateBytes) fail('E_PROPOSAL_CORE_STATE');
  // Core owns both domain transitions. Neither a second reducer nor an inverse
  // guessed from the displayed diff is allowed to write product truth.
  const delta = completeDiff(before, result.state);
  const payload = command.payload;
  const entities = command.type === CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE
    ? [payload.sourceEntityId, payload.targetEntityId]
    : [before.data.projects[payload.projectId].atlas.entityOperations[payload.operationId].sourceEntityId,
      before.data.projects[payload.projectId].atlas.entityOperations[payload.operationId].targetEntityId];
  for (const change of delta.changes) {
    const path = change.path;
    const sequenceOnly = canonical(path) === canonical(['data', 'lastCommandId']);
    const atlasOnly = path.length >= 6 && canonical(path.slice(0, 4)) === canonical(['data', 'projects', payload.projectId, 'atlas'])
      && ((path[4] === 'entities' && entities.includes(path[5]))
        || (path[4] === 'entityOperations' && path[5] === payload.operationId));
    if (!sequenceOnly && !atlasOnly) fail('E_PROPOSAL_PREVIEW_SCOPE');
  }
  return { after: result.state, view: {
    beforeStateDigest: `sha256:${hashCoreState(before)}`, afterStateDigest: `sha256:${hashCoreState(result.state)}`,
    ...delta, meaning: 'DISPOSABLE_CORE_PREVIEW_NOT_EXECUTION',
  } };
}
function evidence(action, current, intent) {
  verifyLocalAutomationReplay(action.automationReplayJson, action.automationTranscriptDigest, action.automationEventDenominator);
  const replay = JSON.parse(action.automationReplayJson);
  hash(action.jobId); identifier(action.associationId);
  const job = replay.finalState.jobs.find(entry => entry.jobId === action.jobId);
  if (!job || job.phase !== 'PUBLISHED' || job.output?.status !== 'OBSERVED'
    || job.output.denominator.complete !== true) fail('E_PROPOSAL_PUBLISHED_EVIDENCE');
  for (const key of CONTEXT_KEYS.filter(key => key !== 'coreStateDigest')) {
    if (job.identity[key] !== current[key]) fail('E_PROPOSAL_EVIDENCE_CONTEXT');
  }
  const row = job.output.rows.find(entry => entry.associationId === action.associationId);
  if (!row || row.evidenceAnchorIds.length === 0) fail('E_PROPOSAL_ASSOCIATION_EVIDENCE');
  const expected = [intent.sourceEntityId, intent.targetEntityId].sort();
  if (canonical([row.sourceEntityId, row.targetEntityId].sort()) !== canonical(expected)) fail('E_PROPOSAL_EVIDENCE_PAIR');
  const value = { automationTranscriptDigest: action.automationTranscriptDigest,
    automationEventDenominator: action.automationEventDenominator, jobId: action.jobId,
    queryReceiptDigest: job.output.receiptDigest, association: row,
    meaning: 'DECLARED_RELATEDNESS_NOT_ENTITY_IDENTITY_AUTHENTICATION_APPROVAL_OR_CAPABILITY',
    coreProjectionBinding: 'CALLER_PINNED_READ_CONTEXT_NOT_A_RECONSTRUCTED_CORE_REVISION_BRIDGE' };
  return { ...value, evidenceDigest: digest(value) };
}
function proposal(direction, current, command, evidenceBinding, previewBinding, parentProposalDigest, workflowId) {
  const value = { workflowId, direction, current, command, evidence: evidenceBinding,
    preview: previewBinding, parentProposalDigest, authority: AUTHORITY };
  const proposalDigest = digest(value);
  return { ...value, proposalDigest, reviewDigest: digest({ proposalDigest,
    evidenceDigest: evidenceBinding.evidenceDigest, diffDigest: previewBinding.diffDigest, current, command }) };
}
function decision(action, proposed) {
  identifier(action.decisionId); hash(action.reviewDigest);
  if (action.reviewDigest !== proposed.reviewDigest) fail('E_PROPOSAL_REVIEW_BINDING');
  sameContext(action.current, proposed.current);
  if (!['APPROVE', 'REJECT'].includes(action.decision)) fail('E_PROPOSAL_DECISION');
  const value = { decisionId: action.decisionId, decision: action.decision,
    reviewDigest: action.reviewDigest, proposalDigest: proposed.proposalDigest,
    current: action.current, meaning: 'EXPLICIT_CALLER_INTENT_NOT_AUTHENTICATION_OR_CAPABILITY' };
  return { ...value, decisionDigest: digest(value) };
}
function handoff(action, proposed, approved, workflowId) {
  sameContext(action.current, proposed.current); core(action.coreState, action.current);
  hash(action.decisionDigest);
  if (approved.decision !== 'APPROVE' || action.decisionDigest !== approved.decisionDigest) fail('E_PROPOSAL_APPROVAL_REQUIRED');
  const value = { schemaVersion: 'yalken.proposalCommandHandoff.v1', workflowId,
    direction: proposed.direction, proposalDigest: proposed.proposalDigest,
    reviewDigest: proposed.reviewDigest, decisionDigest: approved.decisionDigest,
    expectedContext: proposed.current, command: proposed.command, authority: AUTHORITY,
    dispatchRequirement: 'EXISTING_COMMAND_KERNEL_MUST_REVALIDATE_CURRENT_CAPABILITY_AND_CORE_GUARDS',
    publicationRequirement: 'CALLER_MUST_REVALIDATE_PROJECT_LIFECYCLE_REVISION_GENERATION_BEFORE_ASYNC_DISPATCH' };
  return { ...value, handoffDigest: digest(value) };
}

export const PROPOSAL_WORKFLOW_FEATURE_INTEGRATION_MANIFEST_V1 = freeze({
  featureId: 'yalken.proposalWorkflow.v1', featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:LOCAL_AUTOMATION_REPLAY_CORE_PREVIEW_AND_FIXED_COMMAND_HANDOFF',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY', authoritativeData: 'EXISTING_CORE_NOT_WORKFLOW_STATE',
  derivedData: 'CANDIDATE_EVIDENCE_DIFF_REVIEW_HANDOFF_AND_OBSERVED_EQUIVALENCE',
  commandIds: [CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE, CORE_COMMAND_IDS.ATLAS_ENTITY_SPLIT_RESTORE],
  eventTypes: ['EXPLICIT_LOCAL_WORKFLOW_INPUT_REPLAY_ONLY'], queryIds: ['proposalWorkflow.read.v1', 'proposalWorkflow.replay.v1'],
  productProjectionIds: ['yalken.proposalWorkflowState.v1'], capabilityIds: ['EXISTING_CAP_ATLAS_ENTITY_MERGE_AND_SPLIT_RESTORE'],
  authorityMap: 'EXPLICIT_INTENT_AND_HANDOFF_NEVER_AUTHENTICATION_OR_PRODUCT_CAPABILITY',
  identityKeys: ['workflowId', ...CONTEXT_KEYS, 'jobId', 'proposalDigest', 'reviewDigest', 'decisionDigest', 'handoffDigest'],
  revisionPolicy: 'EXACT_CALLER_READ_BINDING_AT_REVIEW_AND_HANDOFF_ADVANCED_CONTEXT_AT_OBSERVATION',
  writePath: 'IN_MEMORY_DERIVED_STATE_ONLY', readPath: 'VERIFIED_AUTOMATION_AND_CALLER_PINNED_CORE_SNAPSHOT',
  requiredProductPorts: ['EXISTING_LOCAL_AUTOMATION_REPLAY', 'EXISTING_DISPOSABLE_CORE_REDUCER', 'EXISTING_COMMAND_KERNEL_NOT_WIRED'],
  requiredDesignOsPorts: ['NOT_APPLICABLE_NO_UI_CHANGE'], adapterRequirements: ['FIXED_PAIR_NO_DYNAMIC_CODE_OR_CALLBACK'],
  surfaceManifests: ['NOT_APPLICABLE_NO_SURFACE'], slotRequirements: ['NOT_APPLICABLE'], supportedWorkspaces: ['NOT_APPLICABLE'],
  platformAvailability: 'PLATFORM_NEUTRAL_PURE_JAVASCRIPT', accessibilityRequirements: 'NOT_APPLICABLE_NO_INTERACTIVE_SURFACE',
  fallbacks: ['REJECT', 'CANCEL', 'STALE_REJECTION', 'UNKNOWN_OR_ABSTAIN_NO_PROPOSAL'],
  stateClasses: ['DERIVED_STATE'], persistenceClass: 'NOT_PERSISTED', migrations: ['NOT_APPLICABLE_NO_DURABLE_SCHEMA'],
  recovery: 'BOUNDED_EXACT_TRANSCRIPT_REPLAY_OR_DISCARD_DERIVED_STATE',
  rollback: 'SEPARATE_EXPLICIT_REVIEW_AND_HANDOFF_TO_EXISTING_SPLIT_RESTORE_NOT_DESTRUCTIVE_RESET',
  performanceBudget: PROPOSAL_WORKFLOW_LIMITS_V1, lifecycle: 'EXPLICIT_BOUNDED_STEPS_OFF_TYPING_PATH_NO_DAEMON',
  securityBoundary: 'CANONICAL_JSON_ONLY_NO_DISPATCH_STORAGE_NETWORK_PROVIDERS_OR_USER_DOCUMENT_WRITES',
  negativeBypassChecks: ['UNPUBLISHED_EVIDENCE', 'STALE_CONTEXT', 'APPROVAL_REUSE', 'ROLLBACK_WITHOUT_REVIEW', 'TAMPERED_REPLAY'],
  evidenceBindings: ['WP602_MODEL_CONTRACT_INTEGRATION_MUTANTS'],
  currentReality: 'FIXED_PAIR_PURE_API_NO_HOST_UI_WIRING_OR_PROFILE_WIDE_CLAIM',
  observationCeiling: 'EXACT_STATE_EQUIVALENCE_IS_NOT_EXECUTION_AUTHENTICATION_OR_PERSISTENCE_CERTIFICATION',
});

export function createProposalWorkflow(configJson) {
  const config = configuration(parse(configJson));
  let state = { phase: 'EMPTY', forward: null, rollback: null, decision: null, rollbackDecision: null,
    handoff: null, rollbackHandoff: null, observation: null, rollbackObservation: null,
    before: null, after: null, restored: null, events: [] };
  const publicState = value => {
    const { before, after, restored, events, ...visible } = value;
    const body = { schemaVersion: 'yalken.proposalWorkflowState.v1', workflowId: config.workflowId,
      ...visible, eventDenominator: events.length, authority: AUTHORITY };
    if (byteLength(body) > PROPOSAL_WORKFLOW_LIMITS_V1.maxPublicStateBytes) fail('E_PROPOSAL_STATE_BOUND');
    return freeze({ ...clone(body), stateDigest: digest(body) });
  };
  const read = () => publicState(state);
  const dispatch = raw => {
    const action = parse(raw);
    if (!action || typeof action !== 'object' || Array.isArray(action)) fail('E_PROPOSAL_SHAPE');
    const shapes = {
      PROPOSE: ['type', 'automationReplayJson', 'automationTranscriptDigest', 'automationEventDenominator', 'jobId', 'associationId', 'current', 'coreState', 'intent'],
      DECIDE: ['type', 'decisionId', 'decision', 'reviewDigest', 'current'],
      HANDOFF: ['type', 'decisionDigest', 'current', 'coreState'],
      OBSERVE: ['type', 'handoffDigest', 'current', 'coreState'],
      PREVIEW_ROLLBACK: ['type', 'current', 'coreState'],
      DECIDE_ROLLBACK: ['type', 'decisionId', 'decision', 'reviewDigest', 'current'],
      HANDOFF_ROLLBACK: ['type', 'decisionDigest', 'current', 'coreState'],
      OBSERVE_ROLLBACK: ['type', 'handoffDigest', 'current', 'coreState'],
      CANCEL: ['type', 'reason'],
    };
    if (!Object.hasOwn(shapes, action.type)) fail('E_PROPOSAL_ACTION');
    exact(action, shapes[action.type]);
    if (state.events.length >= config.maxEvents) fail('E_PROPOSAL_EVENT_BOUND');
    if (byteLength([...state.events, action]) > PROPOSAL_WORKFLOW_LIMITS_V1.maxTranscriptBytes) fail('E_PROPOSAL_TRANSCRIPT_BOUND');
    const next = clone(state);
    const phase = expected => { if (!expected.includes(state.phase)) fail('E_PROPOSAL_PHASE'); };
    if (action.type === 'PROPOSE') {
      phase(['EMPTY']); context(action.current); core(action.coreState, action.current);
      exact(action.intent, ['sourceEntityId', 'targetEntityId', 'operationId', 'restoreOperationId', 'reason']);
      for (const value of Object.values(action.intent)) identifier(value);
      const intent = action.intent;
      if (intent.sourceEntityId === intent.targetEntityId || intent.operationId === intent.restoreOperationId) fail('E_PROPOSAL_ID_COLLISION');
      const project = action.coreState.data.projects[action.current.projectId];
      if (!project.atlas?.entities || !Object.hasOwn(project.atlas.entities, intent.sourceEntityId)
        || !Object.hasOwn(project.atlas.entities, intent.targetEntityId)) fail('E_PROPOSAL_ENTITY');
      const binding = evidence(action, action.current, intent);
      const command = { type: CORE_COMMAND_IDS.ATLAS_ENTITY_MERGE, payload: {
        projectId: action.current.projectId, sourceEntityId: intent.sourceEntityId, targetEntityId: intent.targetEntityId,
        operationId: intent.operationId, reason: intent.reason,
        expectedSourceEntityHash: hashCanonicalValue(project.atlas.entities[intent.sourceEntityId]),
        expectedTargetEntityHash: hashCanonicalValue(project.atlas.entities[intent.targetEntityId]),
      } };
      const result = preview(action.coreState, command);
      // Keep both operation identities in the proposal's review-bound evidence.
      binding.rollbackIntent = { operationId: intent.operationId, restoreOperationId: intent.restoreOperationId };
      const { evidenceDigest: ignored, ...bindingBody } = binding;
      binding.evidenceDigest = digest(bindingBody);
      next.forward = proposal('FORWARD', action.current, command, binding, result.view, null, config.workflowId);
      next.before = action.coreState; next.after = result.after; next.phase = 'PROPOSED';
    } else if (action.type === 'DECIDE' || action.type === 'DECIDE_ROLLBACK') {
      const rollback = action.type === 'DECIDE_ROLLBACK';
      phase([rollback ? 'ROLLBACK_PROPOSED' : 'PROPOSED']);
      if (rollback && action.decisionId === state.decision.decisionId) fail('E_PROPOSAL_DECISION_REUSE');
      const approved = decision(action, rollback ? state.rollback : state.forward);
      if (rollback) next.rollbackDecision = approved; else next.decision = approved;
      next.phase = `${rollback ? 'ROLLBACK_' : ''}${approved.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`;
    } else if (action.type === 'HANDOFF' || action.type === 'HANDOFF_ROLLBACK') {
      const rollback = action.type === 'HANDOFF_ROLLBACK';
      phase([rollback ? 'ROLLBACK_APPROVED' : 'APPROVED']);
      const output = handoff(action, rollback ? state.rollback : state.forward,
        rollback ? state.rollbackDecision : state.decision, config.workflowId);
      if (rollback) next.rollbackHandoff = output; else next.handoff = output;
      next.phase = rollback ? 'ROLLBACK_HANDED_OFF' : 'HANDED_OFF';
    } else if (action.type === 'OBSERVE' || action.type === 'OBSERVE_ROLLBACK') {
      const rollback = action.type === 'OBSERVE_ROLLBACK';
      phase([rollback ? 'ROLLBACK_HANDED_OFF' : 'HANDED_OFF']);
      const output = rollback ? state.rollbackHandoff : state.handoff;
      hash(action.handoffDigest);
      if (action.handoffDigest !== output.handoffDigest) fail('E_PROPOSAL_HANDOFF_BINDING');
      advancedContext(action.current, output.expectedContext, action.coreState);
      if (canonical(action.coreState) !== canonical(rollback ? state.restored : state.after)) fail('E_PROPOSAL_OBSERVED_STATE');
      const observation = { handoffDigest: action.handoffDigest, current: action.current,
        meaning: 'CALLER_OBSERVED_EXACT_EQUIVALENCE_NOT_EXECUTION_AUTHENTICATION_OR_PERSISTENCE_PROOF' };
      if (rollback) next.rollbackObservation = observation; else next.observation = observation;
      next.phase = rollback ? 'ROLLBACK_OBSERVED_EQUIVALENT' : 'OBSERVED_EQUIVALENT';
    } else if (action.type === 'PREVIEW_ROLLBACK') {
      phase(['OBSERVED_EQUIVALENT']); sameContext(action.current, state.observation.current); core(action.coreState, action.current);
      const command = { type: CORE_COMMAND_IDS.ATLAS_ENTITY_SPLIT_RESTORE, payload: {
        projectId: action.current.projectId, ...state.forward.evidence.rollbackIntent,
      } };
      const result = preview(action.coreState, command);
      next.rollback = proposal('ROLLBACK', action.current, command, state.forward.evidence, result.view, state.forward.proposalDigest, config.workflowId);
      next.restored = result.after; next.phase = 'ROLLBACK_PROPOSED';
    } else {
      phase(['PROPOSED', 'APPROVED', 'ROLLBACK_PROPOSED', 'ROLLBACK_APPROVED']);
      identifier(action.reason); next.phase = 'CANCELLED';
    }
    next.events.push(action);
    const result = publicState(next); // All validation and output bounds before the sole derived-state commit.
    state = next;
    return result;
  };
  const exportReplay = () => {
    const value = { schemaVersion: 'yalken.proposalWorkflowReplay.v1', config,
      events: state.events, eventDenominator: state.events.length, finalState: read(),
      featureManifestDigest: digest(PROPOSAL_WORKFLOW_FEATURE_INTEGRATION_MANIFEST_V1), authority: AUTHORITY };
    return freeze({ ...clone(value), transcriptDigest: digest(value) });
  };
  return Object.freeze({ read, dispatch, exportReplay });
}

export function verifyProposalWorkflowReplay(replayJson, expectedTranscriptDigest, expectedEventDenominator) {
  hash(expectedTranscriptDigest); integer(expectedEventDenominator, 1, PROPOSAL_WORKFLOW_LIMITS_V1.maxEvents);
  const replay = parse(replayJson, 2 * PROPOSAL_WORKFLOW_LIMITS_V1.maxTranscriptBytes);
  exact(replay, ['schemaVersion', 'config', 'events', 'eventDenominator', 'finalState', 'featureManifestDigest', 'authority', 'transcriptDigest']);
  const { transcriptDigest, ...body } = replay;
  if (replay.schemaVersion !== 'yalken.proposalWorkflowReplay.v1' || transcriptDigest !== expectedTranscriptDigest
    || transcriptDigest !== digest(body) || !Array.isArray(replay.events)
    || replay.events.length !== expectedEventDenominator || replay.eventDenominator !== expectedEventDenominator) fail('E_PROPOSAL_REPLAY_BINDING');
  const session = createProposalWorkflow(canonical(replay.config));
  for (const event of replay.events) session.dispatch(canonical(event));
  if (canonical(session.exportReplay()) !== canonical(replay)) fail('E_PROPOSAL_REPLAY_MISMATCH');
  return freeze({ status: 'VERIFIED_EXACT_REPLAY', transcriptDigest,
    eventDenominator: expectedEventDenominator, stateDigest: session.read().stateDigest, authority: AUTHORITY });
}
