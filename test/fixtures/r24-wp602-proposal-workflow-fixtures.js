'use strict';
const assert = require('node:assert/strict');
const base = require('./r24-wp600-featurespec-query-ir-fixtures.js');
const { canonical, config: automationConfig } = require('./r24-wp601-local-automation-fixtures.js');
const config = () => ({ workflowId: 'wp602-synthetic-workflow', maxEvents: 16 });
async function fixture(override, options = {}) {
  const [api, runtime, automation, snapshots, associations, queryApi] = await Promise.all([
    override || base.importRepo('src/core/proposal-workflow-v1.mjs'), base.importRepo('src/core/runtime.mjs'),
    base.importRepo('src/core/local-automation-v1.mjs'), base.importRepo('src/core/atlas-book-snapshot-v1.mjs'),
    base.importRepo('src/core/atlas-associations-v1.mjs'), base.importRepo('src/core/frozen-feature-spec-query-ir-v1.mjs'),
  ]);
  const projectId = options.projectId ?? 'wp602-project', sceneId = 'scene-a';
  const sourceEntityId = 'source-a', targetEntityId = 'target-a';
  const text = options.text ?? 'Mira and Anna are explicitly distinct until the author decides otherwise.';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId, title: 'Synthetic proposal', sceneId } },
    { type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, payload: { projectId, sceneId, text } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: sourceEntityId, name: options.sourceName ?? 'Mira', entityKind: 'character' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: targetEntityId, name: options.targetName ?? 'Anna', entityKind: 'character' } },
  ]);
  assert.equal(built.ok, true);
  const state = built.state;
  // This synthetic fixture explicitly defines its project read revision. It does
  // not claim to implement the product host's separate revision-bridge adapter.
  const snapshot = snapshots.createAtlasBookSnapshot({ projectId, projectRevisionId: base.canonicalDigest(state.data.projects[projectId]),
    manifestRevision: base.digest('synthetic-manifest-v1'), sceneOrder: [sceneId],
    sceneRevisionsById: { [sceneId]: base.canonicalDigest(state.data.projects[projectId].scenes[sceneId]) },
    dependenciesBySceneId: { [sceneId]: [] } });
  const currentSnapshotIdentity = Object.fromEntries(['projectId','projectRevisionId','manifestRevision','orderDigest','dependencyDigest'].map(key => [key,snapshot[key]]));
  const book = { kind: 'BOOK', projectId, projectRevisionId: snapshot.projectRevisionId };
  const raw = [{ associationId: 'declared-pair', associationKind: 'contrasts', direction: 'UNDIRECTED',
    sourceEntityId, targetEntityId, evidenceAnchorIds: ['synthetic-anchor-1'], scope: book }];
  const projection = associations.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations: raw });
  const spec = queryApi.freezeFeatureSpec(base.specInput()), query = queryApi.compileTypedQueryIr(spec, base.queryInput());
  const queryInput = { spec, query, snapshot, currentSnapshotIdentity, projection, focusScope: book, generation: 7, currentGeneration: 7 };
  const auto = automation.createLocalAutomationSession(canonical(automationConfig()));
  const autoSend = action => auto.dispatch(canonical(action));
  const autoContext = { snapshot, projectionDigest: projection.projectionDigest, generation: 7, lifecycleId: 'lifecycle-1', enabled: true };
  autoSend({ type: 'CONTEXT', at: 0, context: autoContext });
  const jobId = autoSend({ type: 'ENQUEUE', at: 1, job: { jobKey: 'pair-evidence', priority: 1,
    deadline: 100, workBudget: 1_048_576, lifecycleId: autoContext.lifecycleId, queryInput } }).jobId;
  autoSend({ type: 'RUN_NEXT', at: 2 }); autoSend({ type: 'PUBLISH', at: 3, jobId });
  const replay = auto.exportReplay();
  assert.equal(replay.finalState.jobs[0].phase, 'PUBLISHED');
  const current = { projectId, projectRevisionId: snapshot.projectRevisionId, snapshotId: snapshot.snapshotId,
    projectionDigest: projection.projectionDigest, generation: 7, lifecycleId: autoContext.lifecycleId, coreStateDigest: base.canonicalDigest(state) };
  const intent = { sourceEntityId, targetEntityId, operationId: 'explicit-merge-1', restoreOperationId: 'explicit-restore-1',
    reason: 'Explicit synthetic author choice; relatedness alone proves no identity' };
  const propose = { type: 'PROPOSE', automationReplayJson: canonical(replay), automationTranscriptDigest: replay.transcriptDigest,
    automationEventDenominator: replay.eventDenominator, jobId, associationId: 'declared-pair', current, coreState: state, intent };
  const session = api.createProposalWorkflow(canonical(options.config ?? config()));
  const send = action => session.dispatch(canonical(action));
  return { api, runtime, automation, queryApi, snapshots, associations, projectId, sceneId, sourceEntityId, targetEntityId,
    text, state, snapshot, projection, queryInput, raw, auto, autoSend, replay, current, intent, propose, session, send };
}
function decide(f, rollback = false, choice = 'APPROVE') {
  const p = rollback ? f.session.read().rollback : f.session.read().forward;
  return f.send({ type: rollback ? 'DECIDE_ROLLBACK' : 'DECIDE', decisionId: rollback ? 'review-rollback-1' : 'review-forward-1',
    decision: choice, reviewDigest: p.reviewDigest, current: p.current });
}
function handoff(f, rollback = false, state = f.state) {
  const s = f.session.read(), p = rollback ? s.rollback : s.forward, d = rollback ? s.rollbackDecision : s.decision;
  return f.send({ type: rollback ? 'HANDOFF_ROLLBACK' : 'HANDOFF', decisionDigest: d.decisionDigest, current: p.current, coreState: state });
}
function nextContext(f, state, previous) {
  return { ...previous, generation: previous.generation + 1, coreStateDigest: base.canonicalDigest(state),
    projectRevisionId: base.canonicalDigest(state.data.projects[f.projectId]), snapshotId: base.digest(canonical({ state, generation: previous.generation + 1 })),
    projectionDigest: base.digest(canonical({ state, kind: 'synthetic-advanced-projection' })) };
}
function observe(f, state, rollback = false) {
  const handoffValue = rollback ? f.session.read().rollbackHandoff : f.session.read().handoff;
  return f.send({ type: rollback ? 'OBSERVE_ROLLBACK' : 'OBSERVE', handoffDigest: handoffValue.handoffDigest,
    current: nextContext(f, state, handoffValue.expectedContext), coreState: state });
}
function runForward(f) {
  f.send(f.propose); decide(f); handoff(f);
  const result = f.runtime.reduceCoreState(f.state, f.session.read().handoff.command);
  assert.equal(result.ok, true); observe(f, result.state); return result;
}
function runRollback(f, merged) {
  f.send({ type: 'PREVIEW_ROLLBACK', current: f.session.read().observation.current, coreState: merged.state });
  decide(f, true); handoff(f, true, merged.state);
  const result = f.runtime.reduceCoreState(merged.state, f.session.read().rollbackHandoff.command);
  assert.equal(result.ok, true); observe(f, result.state, true); return result;
}
function rehashReplay(value) {
  const body = { ...value }; delete body.transcriptDigest;
  value.transcriptDigest = base.canonicalDigest(body); return value;
}
module.exports = { ...base, canonical, config, fixture, decide, handoff, nextContext, observe, runForward, runRollback, rehashReplay };
