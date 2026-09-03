'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const productRegistry = require('../../src/shared/productCommandRegistry.cjs');
const { ROOT, importRepo, fixture, canonical, canonicalDigest, clone, digest, decide, handoff,
  observe, runForward, runRollback } = require('../fixtures/r24-wp602-proposal-workflow-fixtures.js');

function applyDisplayedDiff(before, preview) {
  const result=clone(before);
  assert.equal(preview.changeDenominator,preview.changes.length);
  assert.equal(preview.diffDigest,canonicalDigest(preview.changes));
  const paths=new Set();
  for(const row of preview.changes){
    assert(Array.isArray(row.path)&&row.path.length>0);
    const key=canonical(row.path);assert(!paths.has(key));paths.add(key);
    let target=result;
    for(const segment of row.path.slice(0,-1)){assert(Object.hasOwn(target,segment));target=target[segment];}
    const field=row.path.at(-1);
    assert.equal(Object.hasOwn(target,field),row.before.present);
    if(row.before.present)assert.deepEqual(target[field],row.before.value);
    if(row.after.present)target[field]=clone(row.after.value);else delete target[field];
  }
  assert.equal(canonicalDigest(result),preview.afterStateDigest);return result;
}
function referenceMerge(before,payload) {
  const after=clone(before),atlas=after.data.projects[payload.projectId].atlas,seq=before.data.lastCommandId+1;
  const source=atlas.entities[payload.sourceEntityId],target=atlas.entities[payload.targetEntityId];
  const beforeSourceEntity=clone(source),beforeTargetEntity=clone(target);
  Object.assign(source,{mergeState:'MERGED',mergedIntoEntityId:payload.targetEntityId,mergeOperationId:payload.operationId,mergedByCommandSeq:seq,updatedByCommandSeq:seq});
  target.mergedSourceEntityIds=[...new Set([...(target.mergedSourceEntityIds||[]),payload.sourceEntityId])];target.updatedByCommandSeq=seq;
  atlas.entityOperations[payload.operationId]={id:payload.operationId,operationKind:'entity.merge',projectId:payload.projectId,
    sourceEntityId:payload.sourceEntityId,targetEntityId:payload.targetEntityId,reason:payload.reason,
    beforeSourceEntity,beforeTargetEntity,afterSourceEntity:clone(source),afterTargetEntity:clone(target),
    createdByCommandSeq:seq,restoredByCommandSeq:0,restoreOperationId:''};
  after.data.lastCommandId=seq;return after;
}
function referenceRestore(merged,payload) {
  const after=clone(merged),atlas=after.data.projects[payload.projectId].atlas,operation=atlas.entityOperations[payload.operationId];
  atlas.entities[operation.sourceEntityId]=clone(operation.beforeSourceEntity);atlas.entities[operation.targetEntityId]=clone(operation.beforeTargetEntity);
  operation.restoredByCommandSeq=merged.data.lastCommandId+1;operation.restoreOperationId=payload.restoreOperationId;
  after.data.lastCommandId++;return after;
}
function expectedChangedPaths(payload, rollback = false) {
  const atlas=['data','projects',payload.projectId,'atlas'];
  return [
    ['data','lastCommandId'],
    ...['mergeState','mergedIntoEntityId','mergeOperationId','mergedByCommandSeq','updatedByCommandSeq'].map(key=>[...atlas,'entities',payload.sourceEntityId,key]),
    ...['mergedSourceEntityIds','updatedByCommandSeq'].map(key=>[...atlas,'entities',payload.targetEntityId,key]),
    ...(rollback ? ['restoredByCommandSeq','restoreOperationId'].map(key=>[...atlas,'entityOperations',payload.operationId,key])
      : [[...atlas,'entityOperations',payload.operationId]]),
  ].map(canonical).sort();
}

test('WP602 existing Command Kernel blocks disabled capability in both directions and delegates admitted commands to Core',async()=>{
  const f=await fixture(),before=canonical(f.state);
  const [{createCommandRegistry},{createCommandRunner}]=await Promise.all([importRepo('src/renderer/commands/registry.mjs'),importRepo('src/renderer/commands/runCommand.mjs')]);
  const registry=createCommandRegistry();let handlerCalls=0;
  for(const id of ['atlas.entity.merge','atlas.entity.splitRestore']){
    const record=productRegistry.getProductCommandRecord(id);assert.equal(record.commandAuthority,'CommandKernel');assert.equal(record.capabilityId,'cap.'+id);
    registry.registerCommand(id,input=>{handlerCalls++;return f.runtime.reduceCoreState(input.state,{type:id,payload:input.payload});});
  }
  const blocked=createCommandRunner(registry,{capability:{defaultPlatformId:'web'}});
  const allowed=createCommandRunner(registry,{capability:{defaultPlatformId:'node',entitlementTier:'free'}});
  f.send(f.propose);decide(f);handoff(f);assert.equal(handlerCalls,0,'workflow never invokes command handlers');
  const forward=f.session.read().handoff;
  const denied=await blocked(forward.command.type,{state:f.state,payload:forward.command.payload});
  assert.equal(denied.ok,false);assert.equal(denied.error.code,'E_CAPABILITY_DISABLED_FOR_COMMAND');assert.equal(handlerCalls,0);assert.equal(canonical(f.state),before);
  const merged=await allowed(forward.command.type,{state:f.state,payload:forward.command.payload});
  assert.equal(merged.ok,true);assert.equal(handlerCalls,1);assert.deepEqual(merged.state,referenceMerge(f.state,forward.command.payload));
  assert.deepEqual(applyDisplayedDiff(f.state,f.session.read().forward.preview),merged.state);
  assert(merged.events.some(event=>event.type==='EntityMerged'));observe(f,merged.state);
  f.send({type:'PREVIEW_ROLLBACK',current:f.session.read().observation.current,coreState:merged.state});decide(f,true);handoff(f,true,merged.state);
  assert.equal(handlerCalls,1);const rollback=f.session.read().rollbackHandoff;
  const rollbackDenied=await blocked(rollback.command.type,{state:merged.state,payload:rollback.command.payload});
  assert.equal(rollbackDenied.ok,false);assert.equal(rollbackDenied.error.code,'E_CAPABILITY_DISABLED_FOR_COMMAND');assert.equal(handlerCalls,1);
  const restored=await allowed(rollback.command.type,{state:merged.state,payload:rollback.command.payload});
  assert.equal(restored.ok,true);assert.equal(handlerCalls,2);assert.deepEqual(restored.state,referenceRestore(merged.state,rollback.command.payload));
  assert.deepEqual(applyDisplayedDiff(merged.state,f.session.read().rollback.preview),restored.state);
  assert(restored.events.some(event=>event.type==='EntitySplit'));observe(f,restored.state,true);
  assert.equal(canonical(f.state),before);
  assert.deepEqual(registry.listCommands(),['atlas.entity.merge','atlas.entity.splitRestore']);
});

test('WP602 current Core rejects a stale emitted merge and a stale rollback without mutating synthetic state',async()=>{
  const f=await fixture();f.send(f.propose);decide(f);handoff(f);
  const edited=f.runtime.reduceCoreState(f.state,{type:f.runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD,
    payload:{projectId:f.projectId,entityId:f.sourceEntityId,aliasId:'post-review-alias',value:'Changed since review'}});
  assert.equal(edited.ok,true);const before=canonical(edited.state);
  const mergeDenied=f.runtime.reduceCoreState(edited.state,f.session.read().handoff.command);
  assert.equal(mergeDenied.ok,false);assert.equal(mergeDenied.error.code,'E_ATLAS_ENTITY_STALE');assert.equal(canonical(mergeDenied.state),before);
  const g=await fixture(),merged=runForward(g);
  g.send({type:'PREVIEW_ROLLBACK',current:g.session.read().observation.current,coreState:merged.state});decide(g,true);handoff(g,true,merged.state);
  const later=g.runtime.reduceCoreState(merged.state,{type:g.runtime.CORE_COMMAND_IDS.ATLAS_ALIAS_ADD,
    payload:{projectId:g.projectId,entityId:g.targetEntityId,aliasId:'post-merge-alias',value:'Later author change'}});
  const rollbackDenied=g.runtime.reduceCoreState(later.state,g.session.read().rollbackHandoff.command);
  assert.equal(rollbackDenied.ok,false);assert.equal(rollbackDenied.error.code,'E_ATLAS_OPERATION_STALE');
  assert.deepEqual(rollbackDenied.state,later.state);assert.equal(later.state.data.projects[g.projectId].atlas.entities[g.sourceEntityId].mergeState,'MERGED');
});

test('WP602 deterministic independent reference corpus covers 128 complete workflows and 1024 replayed events',async t=>{
  const names=['Анна','Μίρα','李华','ليلى','Éva','नदी','Mira','עדי'];
  let workflows=0,eventDenominator=0,fieldChanges=0,roundTrips=0;
  const corpus=[];
  for(let i=0;i<128;i++){
    const f=await fixture(undefined,{projectId:'wp602-corpus-'+i,sourceName:names[i%names.length],targetName:names[(i+1)%names.length]});
    if(i%2){[f.propose.intent.sourceEntityId,f.propose.intent.targetEntityId]=[f.propose.intent.targetEntityId,f.propose.intent.sourceEntityId];}
    const merged=runForward(f),forward=f.session.read().forward;
    assert.deepEqual(forward.preview.changes.map(row=>canonical(row.path)).sort(),expectedChangedPaths(forward.command.payload));
    assert.deepEqual(merged.state,referenceMerge(f.state,forward.command.payload));assert.deepEqual(applyDisplayedDiff(f.state,forward.preview),merged.state);
    const restored=runRollback(f,merged),rollback=f.session.read().rollback;
    assert.deepEqual(rollback.preview.changes.map(row=>canonical(row.path)).sort(),expectedChangedPaths(forward.command.payload,true));
    assert.deepEqual(restored.state,referenceRestore(merged.state,rollback.command.payload));assert.deepEqual(applyDisplayedDiff(merged.state,rollback.preview),restored.state);
    assert.deepEqual(restored.state.data.projects[f.projectId].atlas.entities,f.state.data.projects[f.projectId].atlas.entities);
    assert.deepEqual(restored.state.data.projects[f.projectId].scenes,f.state.data.projects[f.projectId].scenes);
    const replay=f.session.exportReplay(),verified=f.api.verifyProposalWorkflowReplay(canonical(replay),replay.transcriptDigest,8);
    assert.equal(verified.eventDenominator,8);eventDenominator+=verified.eventDenominator;workflows++;roundTrips++;
    fieldChanges+=forward.preview.changeDenominator+rollback.preview.changeDenominator;
    corpus.push({projectId:f.projectId,forward:forward.preview.afterStateDigest,restored:rollback.preview.afterStateDigest,transcriptDigest:replay.transcriptDigest});
  }
  assert.equal(workflows,128);assert.equal(eventDenominator,1024);assert.equal(roundTrips,128);assert.equal(fieldChanges,128*(9+10));
  t.diagnostic(JSON.stringify({workflows,eventDenominator,fieldChanges,roundTrips,locales:names.length,corpusDigest:canonicalDigest(corpus),userDocumentMutations:0}));
});

test('WP602 160000-word synthetic manuscript remains byte-identical through preview handoff and rollback',async t=>{
  const text=Array.from({length:160000},(_,i)=>i%2?'Anna':'Mira').join(' '),f=await fixture(undefined,{text});
  assert.equal(text.split(' ').length,160000);const original=digest(text);
  const merged=runForward(f),restored=runRollback(f,merged);
  for(const state of [f.state,merged.state,restored.state])assert.equal(digest(state.data.projects[f.projectId].scenes[f.sceneId].text),original);
  const replay=f.session.exportReplay();assert.equal(f.api.verifyProposalWorkflowReplay(canonical(replay),replay.transcriptDigest,8).status,'VERIFIED_EXACT_REPLAY');
  t.diagnostic(JSON.stringify({syntheticWords:160000,manuscriptBytes:Buffer.byteLength(text),manuscriptDigest:original,eventDenominator:8,unchanged:true}));
});

test('WP602 pure module has exactly the existing dependencies and no host dispatcher provider or storage effect seam',()=>{
  const source=fs.readFileSync(path.join(ROOT,'src/core/proposal-workflow-v1.mjs'),'utf8');
  assert.deepEqual([...source.matchAll(/from '([^']+)'/g)].map(match=>match[1]),['./browser-safe-hash.mjs','./local-automation-v1.mjs','./runtime.mjs']);
  for(const forbidden of [/\bfetch\s*\(/,/\bsetInterval\s*\(/,/\bsetTimeout\s*\(/,/\beval\s*\(/,/new\s+Function\s*\(/,/\bwriteFile\w*\s*\(/,/\bdispatchCanonicalProjectCommand\s*\(/,/\bcreateCommandRegistry\s*\(/,/\bipcRenderer\b/,/\bwindow\./,/\bdocument\./]){
    assert.doesNotMatch(source,forbidden);
  }
});
