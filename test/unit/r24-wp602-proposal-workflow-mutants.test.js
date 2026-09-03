'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, fixture, canonical, canonicalDigest, clone, digest, config, decide, handoff, nextContext,
  runForward, runRollback, rehashReplay } = require('../fixtures/r24-wp602-proposal-workflow-fixtures.js');
const file=path.join(ROOT,'src/core/proposal-workflow-v1.mjs'),source=fs.readFileSync(file,'utf8');
const decisionAction=f=>({type:'DECIDE',decisionId:'review-1',decision:'APPROVE',reviewDigest:f.session.read().forward.reviewDigest,current:f.current});
const handoffAction=f=>({type:'HANDOFF',decisionDigest:f.session.read().decision.decisionDigest,current:f.current,coreState:f.state});
const observation = mutate => async f => {
  f.send(f.propose);decide(f);handoff(f);
  const state=f.runtime.reduceCoreState(f.state,f.session.read().handoff.command).state;
  const action={type:'OBSERVE',handoffDigest:f.session.read().handoff.handoffDigest,current:nextContext(f,state,f.current),coreState:state};
  mutate(action,f);assert.throws(()=>f.send(action));
};
const mutations=[
  ['automation-replay',"verifyLocalAutomationReplay(action.automationReplayJson, action.automationTranscriptDigest, action.automationEventDenominator);","",async f=>{
    const a=clone(f.propose),r=JSON.parse(a.automationReplayJson);r.finalState.jobs[0].output.rows[0].associationKind='echoes';rehashReplay(r);
    a.automationReplayJson=canonical(r);a.automationTranscriptDigest=r.transcriptDigest;assert.throws(()=>f.send(a));
  }],
  ['evidence-context',"if (job.identity[key] !== current[key]) fail('E_PROPOSAL_EVIDENCE_CONTEXT');","",async f=>{
    const a=clone(f.propose);a.current.lifecycleId='unrelated-lifecycle';assert.throws(()=>f.send(a));
  }],
  ['evidence-pair',"if (canonical([row.sourceEntityId, row.targetEntityId].sort()) !== canonical(expected)) fail('E_PROPOSAL_EVIDENCE_PAIR');","",async f=>{
    const a=clone(f.propose);a.intent.targetEntityId='third-entity';
    a.coreState.data.projects[f.projectId].atlas.entities['third-entity']=clone(a.coreState.data.projects[f.projectId].atlas.entities[f.targetEntityId]);
    a.current.coreStateDigest=canonicalDigest(a.coreState);assert.throws(()=>f.send(a),/E_PROPOSAL_EVIDENCE_PAIR/);
  }],
  ['exact-current-context',"if (canonical(actual) !== canonical(expected)) fail('E_PROPOSAL_STALE_CONTEXT');","",async f=>{
    f.send(f.propose);decide(f);const a=handoffAction(f);a.current={...f.current,generation:8};assert.throws(()=>f.send(a));
  }],
  ['core-state-binding',"if (`sha256:${hashCoreState(value)}` !== current.coreStateDigest) fail('E_PROPOSAL_CORE_BINDING');","",async f=>{
    const a=clone(f.propose);a.coreState.data.projects[f.projectId].scenes[f.sceneId].text='changed Core at unchanged read binding';assert.throws(()=>f.send(a));
  }],
  ['review-binding',"if (action.reviewDigest !== proposed.reviewDigest) fail('E_PROPOSAL_REVIEW_BINDING');","",async f=>{
    f.send(f.propose);const a=decisionAction(f);a.reviewDigest=digest('unreviewed-diff');assert.throws(()=>f.send(a));
  }],
  ['decision-enum',"if (!['APPROVE', 'REJECT'].includes(action.decision)) fail('E_PROPOSAL_DECISION');","",async f=>{
    f.send(f.propose);const a=decisionAction(f);a.decision='MAYBE';assert.throws(()=>f.send(a));
  }],
  ['approval-digest'," || action.decisionDigest !== approved.decisionDigest","",async f=>{
    f.send(f.propose);decide(f);const a=handoffAction(f);a.decisionDigest=digest('wrong-approval');assert.throws(()=>f.send(a));
  }],
  ['one-shot-phase',"if (!expected.includes(state.phase)) fail('E_PROPOSAL_PHASE');","",async f=>{
    f.send(f.propose);decide(f);handoff(f);assert.throws(()=>f.send(handoffAction(f)));
  }],
  ['event-limit',"if (state.events.length >= config.maxEvents) fail('E_PROPOSAL_EVENT_BOUND');","",async f=>{
    const session=f.api.createProposalWorkflow(canonical({...config(),maxEvents:1}));session.dispatch(canonical(f.propose));
    assert.throws(()=>session.dispatch(canonical({type:'DECIDE',decisionId:'one-too-many',decision:'APPROVE',reviewDigest:session.read().forward.reviewDigest,current:f.current})));
  }],
  ['canonical-bytes',"if (canonical(value) !== raw) fail('E_PROPOSAL_NONCANONICAL_JSON');","",async f=>{
    assert.throws(()=>f.api.createProposalWorkflow('{"workflowId":"noncanonical-order","maxEvents":16}'));
  }],
  ['unsafe-object-key',"if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('E_PROPOSAL_UNSAFE_KEY');","",async f=>{
    const a=clone(f.propose);Object.defineProperty(a.coreState.data.projects[f.projectId].scenes[f.sceneId],'constructor',{value:'data',enumerable:true});
    a.current.coreStateDigest=canonicalDigest(a.coreState);assert.throws(()=>f.send(a),/E_PROPOSAL_UNSAFE_KEY/);
  }],
  ['observed-handoff',"if (action.handoffDigest !== output.handoffDigest) fail('E_PROPOSAL_HANDOFF_BINDING');","",observation(a=>{a.handoffDigest=digest('other-handoff');})],
  ['observed-state',"if (canonical(action.coreState) !== canonical(rollback ? state.restored : state.after)) fail('E_PROPOSAL_OBSERVED_STATE');","",observation(a=>{
    a.coreState.data.projects[a.current.projectId].scenes['scene-a'].text='not the previewed state';a.current.coreStateDigest=canonicalDigest(a.coreState);
  })],
  ['observed-generation',"actual.generation <= previous.generation || ","",observation((a,f)=>{a.current.generation=f.current.generation;})],
  ['observed-lifecycle'," || actual.lifecycleId !== previous.lifecycleId","",observation(a=>{a.current.lifecycleId='other-lifecycle';})],
  ['observed-revision'," || actual.projectRevisionId === previous.projectRevisionId","",observation((a,f)=>{a.current.projectRevisionId=f.current.projectRevisionId;})],
  ['observed-snapshot'," || actual.snapshotId === previous.snapshotId","",observation((a,f)=>{a.current.snapshotId=f.current.snapshotId;})],
  ['fresh-rollback-review',"if (rollback && action.decisionId === state.decision.decisionId) fail('E_PROPOSAL_DECISION_REUSE');","",async f=>{
    const merged=runForward(f);f.send({type:'PREVIEW_ROLLBACK',current:f.session.read().observation.current,coreState:merged.state});
    assert.throws(()=>f.send({type:'DECIDE_ROLLBACK',decisionId:f.session.read().decision.decisionId,decision:'APPROVE',reviewDigest:f.session.read().rollback.reviewDigest,current:f.session.read().rollback.current}));
  }],
  ['replay-output',"if (canonical(session.exportReplay()) !== canonical(replay)) fail('E_PROPOSAL_REPLAY_MISMATCH');","",async f=>{
    f.send(f.propose);const r=clone(f.session.exportReplay());r.finalState.phase='CERTIFIED_PERSISTED';rehashReplay(r);
    assert.throws(()=>f.api.verifyProposalWorkflowReplay(canonical(r),r.transcriptDigest,1));
  }],
  ['complete-event-denominator',"replay.events.length !== expectedEventDenominator || replay.eventDenominator !== expectedEventDenominator","false",async f=>{
    f.send(f.propose);decide(f);const r=f.session.exportReplay();assert.throws(()=>f.api.verifyProposalWorkflowReplay(canonical(r),r.transcriptDigest,1));
  }],
  ['caller-pinned-replay'," || transcriptDigest !== expectedTranscriptDigest","",async f=>{
    f.send(f.propose);const r=f.session.exportReplay();assert.throws(()=>f.api.verifyProposalWorkflowReplay(canonical(r),digest('wrong-pin'),1));
  }],
  ['complete-field-denominator',"changeDenominator: changes.length, diffDigest","changeDenominator: changes.length - 1, diffDigest",async f=>{
    const p=f.send(f.propose).forward.preview;assert.equal(p.changeDenominator,p.changes.length);
  }],
  ['preview-scope',"if (!sequenceOnly && !atlasOnly) fail('E_PROPOSAL_PREVIEW_SCOPE');","",async f=>{
    const a=clone(f.propose);delete a.coreState.data.projects[f.projectId].atlas.languageTags;
    a.current.coreStateDigest=canonicalDigest(a.coreState);assert.throws(()=>f.send(a),/E_PROPOSAL_PREVIEW_SCOPE/);
  }],
  ['authority-ceiling',"authentication: false, productMutation: false","authentication: false, productMutation: true",async f=>{
    assert.equal(f.session.read().authority.productMutation,false);
  }],
  ['workflow-review-identity',"const value = { workflowId, direction, current, command, evidence: evidenceBinding,","const value = { direction, current, command, evidence: evidenceBinding,",async f=>{
    const other=f.api.createProposalWorkflow(canonical({...config(),workflowId:'another-workflow'}));const a=f.send(f.propose),b=other.dispatch(canonical(f.propose));
    assert.notEqual(a.forward.reviewDigest,b.forward.reviewDigest);
  }],
];

test('WP602 behavioral oracles kill all 26 actual implementation mutants without editing production source',async t=>{
  let killed=0;
  for(const [id,before,after,oracle] of mutations){
    await oracle(await fixture());
    assert.equal(source.split(before).length-1,1,`${id}: unique exact mutation anchor`);
    const changed=source.replace(before,after);assert.notEqual(changed,source);
    const executable=changed.replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${pathToFileURL(path.resolve(path.dirname(file),relative)).href}'`);
    const api=await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#${id}`);
    await assert.rejects(()=>fixture(api).then(oracle),{name:'AssertionError'},`${id}: must violate its executed behavioral oracle`);killed++;
  }
  assert.equal(killed,26);assert.equal(fs.readFileSync(file,'utf8'),source);
  t.diagnostic(JSON.stringify({implementationMutants:26,killed,survivors:0,productionSourceMutations:0,implementationDigest:digest(source)}));
});
