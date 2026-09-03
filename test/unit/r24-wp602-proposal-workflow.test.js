'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, canonical, canonicalDigest, clone, digest, config, decide, handoff,
  nextContext, observe, runForward, runRollback, rehashReplay } = require('../fixtures/r24-wp602-proposal-workflow-fixtures.js');
function rejectedAtomically(f, action, expected) {
  const before = canonical(f.session.exportReplay());
  assert.throws(() => typeof action === 'string' ? f.session.dispatch(action) : f.send(action), expected);
  assert.equal(canonical(f.session.exportReplay()), before);
}
function decisionAction(f, rollback = false) {
  const p = rollback ? f.session.read().rollback : f.session.read().forward;
  return { type: rollback ? 'DECIDE_ROLLBACK' : 'DECIDE', decisionId: rollback ? 'rollback-review' : 'forward-review',
    decision: 'APPROVE', reviewDigest: p.reviewDigest, current: clone(p.current) };
}
function handoffAction(f, state, rollback = false) {
  const s = f.session.read(), p = rollback ? s.rollback : s.forward, d = rollback ? s.rollbackDecision : s.decision;
  return { type: rollback ? 'HANDOFF_ROLLBACK' : 'HANDOFF', decisionDigest: d.decisionDigest, current: clone(p.current), coreState: state };
}

test('WP602 explicit review gates both fixed commands; every successful prefix has an exact replay', async () => {
  const f = await fixture(), original = canonical(f.state), originalProposal = canonical(f.propose);
  const stages = [];
  const step = action => {
    const view = f.send(action); stages.push(view.phase);
    const r = f.session.exportReplay();
    assert.equal(f.api.verifyProposalWorkflowReplay(canonical(r), r.transcriptDigest, r.eventDenominator).status, 'VERIFIED_EXACT_REPLAY');
    assert.equal(view.eventDenominator, stages.length); return view;
  };
  const proposed = step(f.propose);
  assert.equal(proposed.handoff, null);
  assert.equal(proposed.forward.evidence.meaning, 'DECLARED_RELATEDNESS_NOT_ENTITY_IDENTITY_AUTHENTICATION_APPROVAL_OR_CAPABILITY');
  assert.equal(proposed.forward.preview.beforeStateDigest, canonicalDigest(f.state));
  assert.equal(proposed.forward.command.type, 'atlas.entity.merge');
  assert.deepEqual(Object.keys(proposed.forward.command.payload).sort(), ['expectedSourceEntityHash','expectedTargetEntityHash','operationId','projectId','reason','sourceEntityId','targetEntityId'].sort());
  step(decisionAction(f)); step(handoffAction(f, f.state));
  const merged = f.runtime.reduceCoreState(f.state, f.session.read().handoff.command); assert.equal(merged.ok, true);
  const mergedContext = nextContext(f, merged.state, f.current);
  step({ type:'OBSERVE', handoffDigest:f.session.read().handoff.handoffDigest, current:mergedContext, coreState:merged.state });
  step({ type:'PREVIEW_ROLLBACK', current:mergedContext, coreState:merged.state });
  assert.equal(f.session.read().rollbackHandoff, null);
  step(decisionAction(f,true)); step(handoffAction(f,merged.state,true));
  const restored = f.runtime.reduceCoreState(merged.state,f.session.read().rollbackHandoff.command); assert.equal(restored.ok,true);
  step({type:'OBSERVE_ROLLBACK',handoffDigest:f.session.read().rollbackHandoff.handoffDigest,
    current:nextContext(f,restored.state,mergedContext),coreState:restored.state});
  assert.deepEqual(stages,['PROPOSED','APPROVED','HANDED_OFF','OBSERVED_EQUIVALENT','ROLLBACK_PROPOSED','ROLLBACK_APPROVED','ROLLBACK_HANDED_OFF','ROLLBACK_OBSERVED_EQUIVALENT']);
  assert.deepEqual(restored.state.data.projects[f.projectId].atlas.entities, f.state.data.projects[f.projectId].atlas.entities);
  assert.equal(canonical(restored.state.data.projects[f.projectId].scenes), canonical(f.state.data.projects[f.projectId].scenes));
  assert.equal(canonical(f.state),original);assert.equal(canonical(f.propose),originalProposal);
  for(const key of ['commandAuthority','authentication','productMutation','persistence','externalEffects'])assert.equal(f.session.read().authority[key],false);
  assert.match(f.session.read().rollbackObservation.meaning,/NOT_EXECUTION_AUTHENTICATION_OR_PERSISTENCE_PROOF/);
  assert.throws(()=>{proposed.forward.preview.changes.push({});},TypeError);
  assert.throws(()=>{f.session.read().handoff.command.type='project.applyTextEdit';},TypeError);
});

test('WP602 every project lifecycle revision snapshot projection generation and Core digest is revalidated before handoff',async t=>{
  let rejected=0;
  for(const phase of ['DECIDE','HANDOFF','PREVIEW_ROLLBACK','HANDOFF_ROLLBACK']){
    for(const key of Object.keys((await fixture()).current)){
      const f=await fixture();let action;
      if(phase==='DECIDE'){f.send(f.propose);action=decisionAction(f);}
      else if(phase==='HANDOFF'){f.send(f.propose);decide(f);action=handoffAction(f,f.state);}
      else {
        const merged=runForward(f);
        if(phase==='PREVIEW_ROLLBACK')action={type:phase,current:clone(f.session.read().observation.current),coreState:merged.state};
        else {f.send({type:'PREVIEW_ROLLBACK',current:f.session.read().observation.current,coreState:merged.state});decide(f,true);action=handoffAction(f,merged.state,true);}
      }
      action.current[key]=key==='generation'?action.current[key]+1:['projectId','lifecycleId'].includes(key)?'other-identity':digest('stale-'+key);
      rejectedAtomically(f,action,/E_PROPOSAL_STALE_CONTEXT/);rejected++;
    }
  }
  assert.equal(rejected,28);t.diagnostic(JSON.stringify({identityGuardNegatives:28,rejected}));
});

test('WP602 canonical byte boundary refuses objects getters proxies duplicate keys unsafe keys and bounds atomically',async()=>{
  const f=await fixture();let touched=0;
  const hostile={get workflowId(){touched++;throw Error('getter');}};
  const proxy=new Proxy({}, {get(){touched++;throw Error('proxy');},ownKeys(){touched++;throw Error('keys');}});
  for(const raw of [hostile,proxy,null,42,()=>{},'[]','null','{','{"workflowId":"a","workflowId":"b","maxEvents":16}',
    '{"maxEvents":1.0,"workflowId":"a"}','{"workflowId":"a","maxEvents":16}','{"__proto__":{},"maxEvents":16,"workflowId":"a"}']){
    assert.throws(()=>f.api.createProposalWorkflow(raw));
  }
  assert.equal(touched,0);
  for(const workflowId of ['Анна','Μίρα','李华','ليلى','Éva','नदी','עדי','📚']){
    assert.equal(f.api.createProposalWorkflow(canonical({...config(),workflowId})).read().workflowId,workflowId);
  }
  assert.throws(()=>f.api.createProposalWorkflow(canonical({...config(),workflowId:'e\u0301'})),/E_PROPOSAL_ID/);
  assert.throws(()=>f.api.createProposalWorkflow(canonical({...config(),maxEvents:0})),/E_PROPOSAL_BOUND/);
  assert.throws(()=>f.api.createProposalWorkflow(canonical({...config(),maxEvents:17})),/E_PROPOSAL_BOUND/);
  let deep=0;for(let i=0;i<34;i++)deep=[deep];
  rejectedAtomically(f,canonical(deep),/E_PROPOSAL_INPUT_BOUND/);
  rejectedAtomically(f,' '.repeat(f.api.PROPOSAL_WORKFLOW_LIMITS_V1.maxInputBytes+1),/E_PROPOSAL_INPUT_BYTES/);
  const large=clone(f.propose);large.coreState.data.projects[f.projectId].scenes[f.sceneId].text='x'.repeat(f.api.PROPOSAL_WORKFLOW_LIMITS_V1.maxCoreStateBytes);
  large.current.coreStateDigest=canonicalDigest(large.coreState);rejectedAtomically(f,large,/E_PROPOSAL_CORE_STATE/);
  const bounded=await fixture(undefined,{config:{...config(),maxEvents:1}});bounded.send(bounded.propose);
  rejectedAtomically(bounded,decisionAction(bounded),/E_PROPOSAL_EVENT_BOUND/);
});

test('WP602 only verified published complete matching-pair evidence permits a proposal',async t=>{
  let count=0;
  const cases=[
    a=>{a.automationTranscriptDigest=digest('wrong');},
    a=>{a.automationEventDenominator--;},
    a=>{a.jobId=digest('missing-job');},
    a=>{a.associationId='missing-association';},
    a=>{a.intent.sourceEntityId=a.intent.targetEntityId;},
    a=>{a.intent.restoreOperationId=a.intent.operationId;},
    a=>{a.intent.reason='';},
    a=>{a.current.coreStateDigest=digest('not-core');},
    a=>{a.current.lifecycleId='different-lifecycle';},
    a=>{a.current.projectRevisionId=digest('different-revision');},
    a=>{a.intent.command='project.applyTextEdit';},
    a=>{const r=JSON.parse(a.automationReplayJson);r.finalState.jobs[0].output.rows=[];rehashReplay(r);a.automationReplayJson=canonical(r);a.automationTranscriptDigest=r.transcriptDigest;},
  ];
  for(const mutate of cases){const f=await fixture(),a=clone(f.propose);mutate(a);rejectedAtomically(f,a);count++;}
  for(const mode of ['UNPUBLISHED','ABSTAIN','DIFFERENT_PAIR','NO_ANCHORS','UNKNOWN']){
    const f=await fixture(),events=clone(f.replay.events);
    if(mode==='NO_ANCHORS'){
      const r=clone(f.replay);r.finalState.jobs[0].output.rows[0].evidenceAnchorIds=[];rehashReplay(r);
      rejectedAtomically(f,{...f.propose,automationReplayJson:canonical(r),automationTranscriptDigest:r.transcriptDigest});count++;continue;
    }
    if(mode==='UNPUBLISHED')events.pop();
    if(mode==='ABSTAIN'){events[1].job.workBudget=1;events.pop();}
    if(mode==='DIFFERENT_PAIR'||mode==='UNKNOWN'){
      const rows=clone(f.raw);
      if(mode==='DIFFERENT_PAIR')rows[0].targetEntityId='unselected-target';else rows.length=0;
      const projection=f.associations.compileAtlasAssociations({snapshot:f.snapshot,currentSnapshotIdentity:f.queryInput.currentSnapshotIdentity,associations:rows});
      events[0].context.projectionDigest=projection.projectionDigest;events[1].job.queryInput.projection=projection;
      f.propose.current.projectionDigest=projection.projectionDigest;
    }
    const auto=f.automation.createLocalAutomationSession(canonical(f.replay.config));
    let jobId;
    for(const event of events){if(event.type==='PUBLISH')event.jobId=jobId;const r=auto.dispatch(canonical(event));if(event.type==='ENQUEUE')jobId=r.jobId;}
    const replay=auto.exportReplay(),a={...f.propose,automationReplayJson:canonical(replay),automationTranscriptDigest:replay.transcriptDigest,automationEventDenominator:replay.eventDenominator,jobId};
    rejectedAtomically(f,a);count++;
  }
  assert.equal(count,17);t.diagnostic(JSON.stringify({evidenceNegatives:count,rejected:count}));
});

test('WP602 approvals and handoffs are one-shot; cross-workflow and forward-to-rollback approvals cannot be reused',async()=>{
  const f=await fixture();f.send(f.propose);
  rejectedAtomically(f,{type:'HANDOFF',decisionDigest:digest('unapproved'),current:f.current,coreState:f.state},/E_PROPOSAL_PHASE/);
  const bad=decisionAction(f);bad.reviewDigest=digest('other-review');rejectedAtomically(f,bad,/E_PROPOSAL_REVIEW_BINDING/);
  const other=await fixture(undefined,{config:{...config(),workflowId:'other-workflow'}});other.send(other.propose);
  const copied=decisionAction(f);copied.reviewDigest=other.session.read().forward.reviewDigest;rejectedAtomically(f,copied,/E_PROPOSAL_REVIEW_BINDING/);
  decide(f);const wrong=handoffAction(f,f.state);wrong.decisionDigest=digest('other-decision');rejectedAtomically(f,wrong,/E_PROPOSAL_APPROVAL_REQUIRED/);
  handoff(f);rejectedAtomically(f,handoffAction(f,f.state),/E_PROPOSAL_PHASE/);
  rejectedAtomically(f,{type:'CANCEL',reason:'cannot recall an already emitted command'},/E_PROPOSAL_PHASE/);
  const merged=f.runtime.reduceCoreState(f.state,f.session.read().handoff.command);observe(f,merged.state);
  f.send({type:'PREVIEW_ROLLBACK',current:f.session.read().observation.current,coreState:merged.state});
  rejectedAtomically(f,{type:'HANDOFF_ROLLBACK',decisionDigest:f.session.read().decision.decisionDigest,current:f.session.read().rollback.current,coreState:merged.state},/E_PROPOSAL_PHASE/);
  const duplicate=decisionAction(f,true);duplicate.decisionId=f.session.read().decision.decisionId;rejectedAtomically(f,duplicate,/E_PROPOSAL_DECISION_REUSE/);
  const wrongReview=decisionAction(f,true);wrongReview.reviewDigest=f.session.read().forward.reviewDigest;rejectedAtomically(f,wrongReview,/E_PROPOSAL_REVIEW_BINDING/);
  decide(f,true);handoff(f,true,merged.state);rejectedAtomically(f,handoffAction(f,merged.state,true),/E_PROPOSAL_PHASE/);
});

test('WP602 reject and cancel discard derived work without product mutation or implicit rollback',async()=>{
  for(const mode of ['REJECT','CANCEL','APPROVED_CANCEL','ROLLBACK_REJECT','ROLLBACK_CANCEL']){
    const f=await fixture(),before=canonical(f.state);let merged;
    if(mode.startsWith('ROLLBACK')){merged=runForward(f);f.send({type:'PREVIEW_ROLLBACK',current:f.session.read().observation.current,coreState:merged.state});}
    else f.send(f.propose);
    if(mode.endsWith('REJECT'))decide(f,mode.startsWith('ROLLBACK'),'REJECT');
    else {if(mode==='APPROVED_CANCEL')decide(f);f.send({type:'CANCEL',reason:'explicit withdrawal'});}
    const s=f.session.read();assert.equal(s.rollbackHandoff,null);
    if(!mode.startsWith('ROLLBACK'))assert.equal(s.handoff,null);
    else assert.equal(merged.state.data.projects[f.projectId].atlas.entities[f.sourceEntityId].mergeState,'MERGED');
    assert.equal(canonical(f.state),before);
    rejectedAtomically(f,decisionAction(f,mode.startsWith('ROLLBACK')),/E_PROPOSAL_PHASE/);
  }
});

test('WP602 observation compares exact state and an advanced context without certifying execution',async t=>{
  let rejected=0;
  for(const rollback of [false,true]){
    for(const kind of ['handoff','projectId','lifecycleId','generation','projectRevisionId','snapshotId','state']){
      const f=await fixture();let currentState;
      if(rollback){const merged=runForward(f);f.send({type:'PREVIEW_ROLLBACK',current:f.session.read().observation.current,coreState:merged.state});decide(f,true);handoff(f,true,merged.state);
        currentState=f.runtime.reduceCoreState(merged.state,f.session.read().rollbackHandoff.command).state;
      }else{f.send(f.propose);decide(f);handoff(f);currentState=f.runtime.reduceCoreState(f.state,f.session.read().handoff.command).state;}
      const h=rollback?f.session.read().rollbackHandoff:f.session.read().handoff;
      const action={type:rollback?'OBSERVE_ROLLBACK':'OBSERVE',handoffDigest:h.handoffDigest,current:nextContext(f,currentState,h.expectedContext),coreState:clone(currentState)};
      if(kind==='handoff')action.handoffDigest=digest('wrong-handoff');
      else if(kind==='state'){action.coreState.data.projects[f.projectId].scenes[f.sceneId].text='tampered';action.current.coreStateDigest=canonicalDigest(action.coreState);}
      else action.current[kind]=['projectId','lifecycleId'].includes(kind)?'different':h.expectedContext[kind];
      rejectedAtomically(f,action);rejected++;
    }
  }
  assert.equal(rejected,14);t.diagnostic(JSON.stringify({observationNegatives:14,rejected}));
});

test('WP602 replay pins the complete event denominator and recomputes all output bytes',async()=>{
  const f=await fixture();const merged=runForward(f);runRollback(f,merged);
  const replay=f.session.exportReplay();
  assert.throws(()=>f.api.verifyProposalWorkflowReplay(canonical(replay),digest('wrong'),8),/E_PROPOSAL_REPLAY_BINDING/);
  assert.throws(()=>f.api.verifyProposalWorkflowReplay(canonical(replay),replay.transcriptDigest,7),/E_PROPOSAL_REPLAY_BINDING/);
  for(const mutate of [
    r=>{r.events.pop();r.eventDenominator--;},
    r=>{[r.events[1],r.events[2]]=[r.events[2],r.events[1]];},
    r=>{r.finalState.forward.preview.changes=[];},
    r=>{r.finalState.phase='CERTIFIED_PERSISTED';},
    r=>{r.authority.productMutation=true;},
    r=>{r.events[1].decision='REJECT';},
    r=>{r.featureManifestDigest=digest('other-manifest');},
    r=>{r.config.workflowId='transplanted-workflow';},
  ]){
    const bad=clone(replay);mutate(bad);rehashReplay(bad);
    assert.throws(()=>f.api.verifyProposalWorkflowReplay(canonical(bad),bad.transcriptDigest,8));
  }
});
