import { hashCanonicalValue } from './browser-safe-hash.mjs';
import { verifyFrozenFeatureSpec, verifyTypedQueryIr, queryFeatureAtlasAssociations } from './frozen-feature-spec-query-ir-v1.mjs';
import { assertAtlasBookSnapshotCurrent, verifyAtlasBookSnapshot } from './atlas-book-snapshot-v1.mjs';
import { verifyAtlasAssociationsProjection } from './atlas-associations-v1.mjs';
import { createAtlasProjectorJob, runAtlasProjectorJob, assessAtlasProjectorResultForPublication } from './atlas-projector-kernel-v1.mjs';

// Explicit cooperative steps over one fixed, pure query adapter. This is not a
// timer, daemon, executable feature registry, or product-command dispatcher.
export const LOCAL_AUTOMATION_LIMITS_V1 = Object.freeze({
  maxQueueSize: 32, maxJobs: 64, maxEvents: 256,
  maxJobWorkUnits: 1_048_576, maxTotalWorkUnits: 8_388_608,
  maxInputBytes: 1_048_576, maxTranscriptBytes: 4_194_304, maxStateBytes: 2_097_152,
});
const AUTHORITY = Object.freeze({ stateClass: 'DERIVED_STATE', productMutation: false,
  persistence: false, externalEffects: false, commandAuthority: false, runtimeRegistry: false });
const HASH = /^sha256:[a-f0-9]{64}$/u;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest = value => `sha256:${hashCanonicalValue(value)}`;
const bytes = value => new TextEncoder().encode(typeof value === 'string' ? value : canonical(value)).length;
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || Object.keys(value).some(key => !keys.includes(key))) fail('E_AUTOMATION_SHAPE');
}
function integer(value, minimum, maximum, code = 'E_AUTOMATION_LIMIT') {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !value || value.length > 200 || value.trim() !== value
    || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)) fail('E_AUTOMATION_ID');
  return value;
}
function hash(value) { if (typeof value !== 'string' || !HASH.test(value)) fail('E_AUTOMATION_DIGEST'); return value; }
function parse(raw, maximum = LOCAL_AUTOMATION_LIMITS_V1.maxInputBytes, nodeMaximum = 100_000) {
  if (typeof raw !== 'string' || raw.length > maximum || bytes(raw) > maximum) fail('E_AUTOMATION_INPUT_BYTES');
  let value;
  try { value = JSON.parse(raw); } catch { fail('E_AUTOMATION_JSON'); }
  let count = 0;
  function visit(current, depth) {
    count += 1;
    if (depth > 24 || count > nodeMaximum) fail('E_AUTOMATION_INPUT_BOUND');
    if (typeof current === 'number' && !Number.isFinite(current)) fail('E_AUTOMATION_INPUT_NUMBER');
    if (current && typeof current === 'object') for (const item of Object.values(current)) visit(item, depth + 1);
  }
  visit(value, 0);
  // A canonical wire form also rejects duplicate keys, alternate number spellings
  // and ambiguous input bytes; no caller object/getter/proxy is traversed.
  if (canonical(value) !== raw) fail('E_AUTOMATION_NONCANONICAL_JSON');
  return value;
}
function configuration(value) {
  exact(value, ['sessionId', 'limits']); identifier(value.sessionId);
  exact(value.limits, ['maxQueueSize', 'maxJobs', 'maxEvents', 'maxJobWorkUnits', 'maxTotalWorkUnits']);
  for (const [key, limit] of Object.entries(value.limits)) integer(limit, 1, LOCAL_AUTOMATION_LIMITS_V1[key]);
  if (value.limits.maxQueueSize > value.limits.maxJobs) fail('E_AUTOMATION_QUEUE_LIMIT');
  return value;
}
function context(value) {
  exact(value, ['snapshot', 'projectionDigest', 'generation', 'lifecycleId', 'enabled']);
  verifyAtlasBookSnapshot(value.snapshot); hash(value.projectionDigest);
  integer(value.generation, 1, Number.MAX_SAFE_INTEGER); identifier(value.lifecycleId);
  if (typeof value.enabled !== 'boolean') fail('E_AUTOMATION_ENABLED');
  return value;
}
function identityOf(job) {
  const input = job.input.queryInput;
  return { projectId: input.snapshot.projectId, projectRevisionId: input.snapshot.projectRevisionId,
    snapshotId: input.snapshot.snapshotId, projectionDigest: input.projection.projectionDigest,
    generation: input.generation, lifecycleId: job.input.lifecycleId,
    specDigest: input.spec.specDigest, queryDigest: input.query.queryDigest };
}
function current(job, currentContext) {
  const id = identityOf(job);
  return currentContext !== null && currentContext.enabled
    && id.projectId === currentContext.snapshot.projectId
    && id.projectRevisionId === currentContext.snapshot.projectRevisionId
    && id.snapshotId === currentContext.snapshot.snapshotId
    && id.projectionDigest === currentContext.projectionDigest
    && id.generation === currentContext.generation
    && id.lifecycleId === currentContext.lifecycleId;
}
function prepareJob(value, limits) {
  exact(value, ['jobKey', 'priority', 'deadline', 'workBudget', 'lifecycleId', 'queryInput']);
  identifier(value.jobKey); identifier(value.lifecycleId);
  integer(value.priority, 0, 3); integer(value.deadline, 0, Number.MAX_SAFE_INTEGER);
  integer(value.workBudget, 1, limits.maxJobWorkUnits);
  const input = value.queryInput;
  exact(input, ['spec', 'query', 'snapshot', 'currentSnapshotIdentity', 'projection', 'focusScope', 'generation', 'currentGeneration']);
  const spec = verifyFrozenFeatureSpec(input.spec); verifyTypedQueryIr(spec, input.query);
  assertAtlasBookSnapshotCurrent(input.snapshot, input.currentSnapshotIdentity);
  // WP500's denominator oracle compares JSON member order. Restore only that
  // representation after closed-shape validation; no value or digest is repaired.
  const denominator = input.projection?.scopeDenominator;
  exact(denominator, ['book', 'scene', 'fragment', 'total']);
  input.projection = { ...input.projection, scopeDenominator: {
    book: denominator.book, scene: denominator.scene,
    fragment: denominator.fragment, total: denominator.total,
  } };
  verifyAtlasAssociationsProjection(input.projection, input.snapshot);
  integer(input.generation, 1, Number.MAX_SAFE_INTEGER);
  if (input.generation !== input.currentGeneration) fail('E_AUTOMATION_STALE_ENQUEUE');
  const projector = createAtlasProjectorJob({ snapshot: input.snapshot,
    projectorId: `local-query:${value.jobKey}`, generation: input.generation });
  const workUnits = bytes(input);
  if (workUnits > limits.maxJobWorkUnits) fail('E_AUTOMATION_JOB_HARD_BOUND');
  return { jobId: digest(value), key: `${input.snapshot.projectId}\0${value.jobKey}`,
    input: value, projector, workUnits, phase: 'QUEUED', reason: null, result: null };
}
function compare(a, b) {
  return b.input.priority - a.input.priority || a.input.deadline - b.input.deadline
    || (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0);
}
function halt(job, phase, reason) { job.phase = phase; job.reason = reason; job.result = null; }
function publicState(state, sessionId) {
  const value = { schemaVersion: 'yalken.localAutomationState.v1', sessionId, tick: state.tick,
    eventDenominator: state.events.length, workUnitsConsumed: state.workUsed,
    queueDenominator: state.jobs.filter(job => job.phase === 'QUEUED').length,
    jobDenominator: state.jobs.length, context: state.context === null ? null : {
      projectId: state.context.snapshot.projectId, projectRevisionId: state.context.snapshot.projectRevisionId,
      snapshotId: state.context.snapshot.snapshotId, projectionDigest: state.context.projectionDigest,
      generation: state.context.generation, lifecycleId: state.context.lifecycleId, enabled: state.context.enabled },
    jobs: state.jobs.map(job => ({ jobId: job.jobId, jobKey: job.input.jobKey,
      priority: job.input.priority, deadline: job.input.deadline, workUnits: job.workUnits,
      identity: identityOf(job), phase: job.phase, reason: job.reason,
      output: job.phase === 'PUBLISHED' ? job.result.output : null })), authority: AUTHORITY };
  if (bytes(value) > LOCAL_AUTOMATION_LIMITS_V1.maxStateBytes) fail('E_AUTOMATION_STATE_BYTES');
  return freeze({ ...value, stateDigest: digest(value) });
}

export const LOCAL_AUTOMATION_FEATURE_INTEGRATION_MANIFEST_V1 = freeze({
  featureId: 'yalken.localAutomation.v1', featureVersion: 1,
  integrationMode: 'EXISTING_SEAM:FIXED_FEATURE_QUERY_AND_ATLAS_PROJECTOR_ADAPTER',
  domainOwner: 'DERIVED_PROJECTOR_AUTHORITY', authoritativeData: 'READ_ONLY_VERIFIED_BOOK_SNAPSHOT',
  derivedData: 'EPHEMERAL_BOUNDED_JOB_STATE_AND_QUERY_RECEIPTS',
  commandIds: ['NOT_APPLICABLE_NO_PRODUCT_COMMAND'], eventTypes: ['LOCAL_JOB_CONTROL_REPLAY_ONLY'],
  queryIds: ['localAutomation.read.v1', 'localAutomation.replay.v1'],
  productProjectionIds: ['yalken.localAutomationState.v1'], capabilityIds: ['DERIVED_ONLY_ENABLED_CONTEXT'],
  authorityMap: 'JOB_CONTROL_AND_FEATURESPEC_NEVER_GRANT_PRODUCT_OR_EXTERNAL_EFFECT_AUTHORITY',
  identityKeys: ['sessionId', 'projectId', 'lifecycleId', 'projectRevisionId', 'snapshotId', 'projectionDigest', 'generation', 'jobId', 'specDigest', 'queryDigest'],
  revisionPolicy: 'REVALIDATE_AT_EXECUTION_AND_PUBLICATION', writePath: 'IN_MEMORY_DERIVED_STATE_ONLY',
  readPath: 'IMMUTABLE_IDENTITY_BOUND_QUERY_RECEIPTS',
  requiredProductPorts: ['EXISTING_PURE_FEATURE_QUERY', 'EXISTING_ATLAS_PROJECTOR_GUARDS'],
  requiredDesignOsPorts: ['NOT_APPLICABLE_NO_UI_CHANGE'], adapterRequirements: ['FIXED_ADAPTER_NO_DYNAMIC_EXECUTION'],
  surfaceManifests: ['NOT_APPLICABLE_NO_SURFACE'], slotRequirements: ['NOT_APPLICABLE'], supportedWorkspaces: ['NOT_APPLICABLE'],
  platformAvailability: 'PLATFORM_NEUTRAL_PURE_JAVASCRIPT', accessibilityRequirements: 'NOT_APPLICABLE_NO_INTERACTIVE_SURFACE',
  fallbacks: ['UNKNOWN', 'ABSTAIN', 'CANCELLED', 'EXPIRED', 'STALE', 'SUPERSEDED', 'FAILED'],
  stateClasses: ['DERIVED_STATE'], persistenceClass: 'NOT_PERSISTED', migrations: ['NOT_APPLICABLE_NO_DURABLE_SCHEMA'],
  recovery: 'REPLAY_BOUNDED_CANONICAL_INPUT_TRANSCRIPT_OR_DISCARD', rollback: 'REVERT_ONE_NODE_COMMIT',
  performanceBudget: LOCAL_AUTOMATION_LIMITS_V1,
  securityBoundary: 'CANONICAL_JSON_BYTES_ONLY_NO_USER_FILES_NETWORK_PROVIDERS_OR_CALLBACK_EXECUTION',
  lifecycle: 'EXPLICIT_COOPERATIVE_ONE_QUERY_STEP_OFF_TYPING_PATH',
  negativeBypassChecks: ['STALE_PUBLICATION', 'CANCEL_AFTER_RUN', 'DEADLINE_EQUALITY', 'WORK_BUDGET', 'REPLAY_TAMPERING'],
  evidenceBindings: ['WP601_MODEL_CONTRACT_INTEGRATION_MUTANTS'],
  currentReality: 'BOUNDED_IN_MEMORY_MODULE_NO_DAEMON_OR_HOST_UI_WIRING',
  clockContract: 'CALLER_SUPPLIED_MONOTONE_LOGICAL_TICKS_NOT_WALL_CLOCK_TIME',
  workUnitContract: 'CANONICAL_QUERY_INPUT_UTF8_BYTES_PER_EXECUTED_QUERY_NOT_CPU_TIME',
  cancellationContract: 'COOPERATIVE_BETWEEN_SINGLE_BOUNDED_QUERY_STEPS_AND_BEFORE_PUBLICATION',
});

export function createLocalAutomationSession(configJson) {
  const config = configuration(parse(configJson));
  let state = { tick: 0, context: null, workUsed: 0, jobs: [], events: [] };
  const read = () => publicState(state, config.sessionId);
  const dispatch = raw => {
    const action = parse(raw);
    if (!action || typeof action !== 'object' || Array.isArray(action)) fail('E_AUTOMATION_SHAPE');
    const shapes = { CONTEXT: ['type', 'at', 'context'], ENQUEUE: ['type', 'at', 'job'],
      RUN_NEXT: ['type', 'at'], CANCEL: ['type', 'at', 'jobId'], PUBLISH: ['type', 'at', 'jobId'] };
    if (!Object.hasOwn(shapes, action.type)) fail('E_AUTOMATION_ACTION');
    exact(action, shapes[action.type]);
    integer(action.at, state.tick, Number.MAX_SAFE_INTEGER, 'E_AUTOMATION_CLOCK_REWIND');
    if (state.events.length >= config.limits.maxEvents) fail('E_AUTOMATION_EVENT_BOUND');
    if (bytes([...state.events, action]) > LOCAL_AUTOMATION_LIMITS_V1.maxTranscriptBytes) fail('E_AUTOMATION_TRANSCRIPT_BOUND');
    const next = clone(state); next.tick = action.at;
    let changedJob = null;
    if (action.type === 'CONTEXT') {
      next.context = context(action.context);
      for (const job of next.jobs) if (['READY', 'PUBLISHED'].includes(job.phase) && !current(job, next.context)) halt(job, 'STALE', 'CURRENT_CONTEXT_CHANGED');
    } else if (action.type === 'ENQUEUE') {
      const job = prepareJob(action.job, config.limits);
      if (!current(job, next.context)) fail('E_AUTOMATION_CONTEXT_REQUIRED');
      if (job.input.deadline <= action.at) fail('E_AUTOMATION_EXPIRED_ENQUEUE');
      if (next.jobs.some(previous => previous.jobId === job.jobId)) fail('E_AUTOMATION_DUPLICATE_JOB');
      const sameKey = next.jobs.filter(previous => previous.key === job.key);
      if (sameKey.some(previous => previous.input.queryInput.generation >= job.input.queryInput.generation)) fail('E_AUTOMATION_GENERATION_COLLISION');
      if (next.jobs.length >= config.limits.maxJobs) fail('E_AUTOMATION_JOB_BOUND');
      for (const previous of sameKey) if (['QUEUED', 'READY', 'PUBLISHED'].includes(previous.phase)) halt(previous, 'SUPERSEDED', 'NEWER_GENERATION');
      if (next.jobs.filter(previous => previous.phase === 'QUEUED').length >= config.limits.maxQueueSize) fail('E_AUTOMATION_QUEUE_BOUND');
      next.jobs.push(job); changedJob = job;
    } else if (action.type === 'CANCEL') {
      hash(action.jobId); changedJob = next.jobs.find(job => job.jobId === action.jobId);
      if (!changedJob) fail('E_AUTOMATION_UNKNOWN_JOB');
      if (!['QUEUED', 'READY', 'CANCELLED'].includes(changedJob.phase)) fail('E_AUTOMATION_CANCEL_PHASE');
      halt(changedJob, 'CANCELLED', 'EXPLICIT_CANCELLATION');
    } else if (action.type === 'RUN_NEXT') {
      changedJob = next.jobs.filter(job => job.phase === 'QUEUED').sort(compare)[0] ?? null;
      if (changedJob) {
        if (!current(changedJob, next.context)) halt(changedJob, 'STALE', 'CURRENT_CONTEXT_MISMATCH');
        else if (action.at >= changedJob.input.deadline) halt(changedJob, 'EXPIRED', 'DEADLINE_REACHED');
        else if (changedJob.workUnits > changedJob.input.workBudget
          || next.workUsed + changedJob.workUnits > config.limits.maxTotalWorkUnits) halt(changedJob, 'ABSTAIN', 'WORK_BUDGET');
        else {
          next.workUsed += changedJob.workUnits;
          try {
            const output = queryFeatureAtlasAssociations(changedJob.input.queryInput);
            changedJob.result = runAtlasProjectorJob(changedJob.projector, () => output);
            changedJob.phase = 'READY';
          } catch (error) {
            // Failure is explicit, consumes the admitted work, and never emits a
            // partial projection or silently retries a failed query.
            halt(changedJob, 'FAILED', typeof error?.code === 'string' ? error.code : 'E_AUTOMATION_QUERY_FAILED');
          }
        }
      }
    } else {
      hash(action.jobId); changedJob = next.jobs.find(job => job.jobId === action.jobId);
      if (!changedJob) fail('E_AUTOMATION_UNKNOWN_JOB');
      if (changedJob.phase !== 'READY') fail('E_AUTOMATION_PUBLISH_PHASE');
      if (!current(changedJob, next.context)) halt(changedJob, 'STALE', 'CURRENT_CONTEXT_MISMATCH');
      else if (action.at >= changedJob.input.deadline) halt(changedJob, 'EXPIRED', 'DEADLINE_REACHED');
      else {
        const assessment = assessAtlasProjectorResultForPublication({ activeJob: changedJob.projector,
          result: changedJob.result, currentSnapshot: next.context.snapshot, currentGeneration: next.context.generation });
        if (!assessment.ok) halt(changedJob, 'STALE', assessment.reason);
        else changedJob.phase = 'PUBLISHED';
      }
    }
    next.events.push(action);
    const result = publicState(next, config.sessionId); // All bounds before commit.
    state = next;
    return freeze({ action: action.type, jobId: changedJob?.jobId ?? null, phase: changedJob?.phase ?? null, state: result });
  };
  const exportReplay = () => {
    const value = { schemaVersion: 'yalken.localAutomationReplay.v1', config,
      events: state.events, eventDenominator: state.events.length, finalState: read(),
      featureManifestDigest: digest(LOCAL_AUTOMATION_FEATURE_INTEGRATION_MANIFEST_V1), authority: AUTHORITY };
    return freeze({ ...clone(value), transcriptDigest: digest(value) });
  };
  return Object.freeze({ dispatch, read, exportReplay });
}

export function verifyLocalAutomationReplay(replayJson, expectedTranscriptDigest, expectedEventDenominator) {
  hash(expectedTranscriptDigest); integer(expectedEventDenominator, 1, LOCAL_AUTOMATION_LIMITS_V1.maxEvents);
  // A replay contains multiple individually bounded inputs. Every parsed node
  // needs at least one UTF-8 byte, so the fixed replay byte ceiling also provides
  // a complete, finite node ceiling without excluding an accepted prefix.
  const replayByteLimit = 2 * LOCAL_AUTOMATION_LIMITS_V1.maxTranscriptBytes;
  const replay = parse(replayJson, replayByteLimit, replayByteLimit);
  exact(replay, ['schemaVersion', 'config', 'events', 'eventDenominator', 'finalState', 'featureManifestDigest', 'authority', 'transcriptDigest']);
  const { transcriptDigest, ...body } = replay;
  if (replay.schemaVersion !== 'yalken.localAutomationReplay.v1' || transcriptDigest !== expectedTranscriptDigest
    || transcriptDigest !== digest(body) || !Array.isArray(replay.events)
    || replay.events.length !== expectedEventDenominator || replay.eventDenominator !== expectedEventDenominator) fail('E_AUTOMATION_REPLAY_BINDING');
  const session = createLocalAutomationSession(canonical(replay.config));
  for (const event of replay.events) session.dispatch(canonical(event));
  if (canonical(session.exportReplay()) !== canonical(replay)) fail('E_AUTOMATION_REPLAY_MISMATCH');
  return freeze({ status: 'VERIFIED_EXACT_REPLAY', eventDenominator: expectedEventDenominator,
    transcriptDigest, stateDigest: session.read().stateDigest, authority: AUTHORITY });
}
