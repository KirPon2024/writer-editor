'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, fixture, canonical, config, enqueue, digest, clone, rehashReplay } = require('../fixtures/r24-wp601-local-automation-fixtures.js');
const file = path.join(ROOT,'src/core/local-automation-v1.mjs'), source = fs.readFileSync(file,'utf8');
const stale = mutate => async f => {
  enqueue(f); const context = clone(f.context); mutate(context,f);
  f.send({ type: 'CONTEXT', at: 2, context }); assert.equal(f.send({ type: 'RUN_NEXT', at: 3 }).phase, 'STALE');
};
const otherSnapshot = (c,f,revisionOnly) => { c.snapshot = f.snapshots.createAtlasBookSnapshot({ projectId: revisionOnly ? c.snapshot.projectId : 'other-project', projectRevisionId: digest('other-revision'), manifestRevision: digest('other-manifest'), sceneOrder: [], sceneRevisionsById: {}, dependenciesBySceneId: {} }); };
const ordered = kind => async f => {
  const jobs = kind === 'priority' ? [{...f.job,jobKey:'a',priority:0},{...f.job,jobKey:'b',priority:3}]
    : kind === 'deadline' ? [{...f.job,jobKey:'a',deadline:50},{...f.job,jobKey:'b',deadline:30}]
      : [{...f.job,jobKey:'a'},{...f.job,jobKey:'b'}];
  const ids = jobs.map(job => enqueue(f,job));
  assert.equal(f.send({type:'RUN_NEXT',at:2}).jobId, kind === 'tie' ? [...ids].sort()[0] : ids[1]);
};
const mutations = [
  ['lifecycle', '&& id.lifecycleId === currentContext.lifecycleId', '', stale(c => { c.lifecycleId = 'other'; })],
  ['generation', '&& id.generation === currentContext.generation', '', stale(c => { c.generation++; })],
  ['projection', '&& id.projectionDigest === currentContext.projectionDigest', '', stale(c => { c.projectionDigest = digest('other'); })],
  ['enabled', 'currentContext !== null && currentContext.enabled', 'currentContext !== null', stale(c => { c.enabled = false; })],
  ['snapshot', '&& id.snapshotId === currentContext.snapshot.snapshotId', '', stale((c,f) => {
    c.snapshot = f.snapshots.createAtlasBookSnapshot({ projectId:c.snapshot.projectId,projectRevisionId:c.snapshot.projectRevisionId,manifestRevision:digest('other'),sceneOrder:[],sceneRevisionsById:{},dependenciesBySceneId:{} });
  })],
  ['identity-triple', '&& id.projectId === currentContext.snapshot.projectId\n    && id.projectRevisionId === currentContext.snapshot.projectRevisionId\n    && id.snapshotId === currentContext.snapshot.snapshotId', '', stale((c,f) => otherSnapshot(c,f,false))],
  ['revision-snapshot', '&& id.projectRevisionId === currentContext.snapshot.projectRevisionId\n    && id.snapshotId === currentContext.snapshot.snapshotId', '', stale((c,f) => otherSnapshot(c,f,true))],
  ['priority', 'b.input.priority - a.input.priority', 'a.input.priority - b.input.priority', ordered('priority')],
  ['deadline-order', 'a.input.deadline - b.input.deadline', 'b.input.deadline - a.input.deadline', ordered('deadline')],
  ['tie-order', '(a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0)', '(a.jobId < b.jobId ? 1 : a.jobId > b.jobId ? -1 : 0)', ordered('tie')],
  ['run-deadline', "else if (action.at >= changedJob.input.deadline) halt(changedJob, 'EXPIRED', 'DEADLINE_REACHED');\n        else if", "else if (action.at > changedJob.input.deadline) halt(changedJob, 'EXPIRED', 'DEADLINE_REACHED');\n        else if", async f => { enqueue(f,{...f.job,deadline:2}); assert.equal(f.send({type:'RUN_NEXT',at:2}).phase,'EXPIRED'); }],
  ['publish-deadline', "else if (action.at >= changedJob.input.deadline) halt(changedJob, 'EXPIRED', 'DEADLINE_REACHED');\n      else", "else if (action.at > changedJob.input.deadline) halt(changedJob, 'EXPIRED', 'DEADLINE_REACHED');\n      else", async f => { const id=enqueue(f,{...f.job,deadline:3});f.send({type:'RUN_NEXT',at:2});assert.equal(f.send({type:'PUBLISH',at:3,jobId:id}).phase,'EXPIRED'); }],
  ['job-budget', 'changedJob.workUnits > changedJob.input.workBudget', 'false', async f => { enqueue(f,{...f.job,workBudget:1});assert.equal(f.send({type:'RUN_NEXT',at:2}).phase,'ABSTAIN'); }],
  ['session-budget', 'next.workUsed + changedJob.workUnits > config.limits.maxTotalWorkUnits', 'false', async f => {
    const cfg=config();cfg.limits.maxTotalWorkUnits=1;const s=f.api.createLocalAutomationSession(canonical(cfg)),send=a=>s.dispatch(canonical(a));
    send({type:'CONTEXT',at:0,context:f.context});send({type:'ENQUEUE',at:1,job:f.job});assert.equal(send({type:'RUN_NEXT',at:2}).phase,'ABSTAIN');
  }],
  ['hidden-output', "job.phase === 'PUBLISHED' ? job.result.output : null", "['READY','PUBLISHED'].includes(job.phase) ? job.result.output : null", async f => {enqueue(f);assert.equal(f.send({type:'RUN_NEXT',at:2}).state.jobs[0].output,null);} ],
  ['cancel-disposition', "halt(changedJob, 'CANCELLED', 'EXPLICIT_CANCELLATION');", "halt(changedJob, 'FAILED', 'EXPLICIT_CANCELLATION');", async f => {const id=enqueue(f);f.send({type:'RUN_NEXT',at:2});assert.equal(f.send({type:'CANCEL',at:3,jobId:id}).phase,'CANCELLED');}],
  ['work-accounting', 'next.workUsed += changedJob.workUnits;', 'next.workUsed += 0;', async f => {enqueue(f);assert.equal(f.send({type:'RUN_NEXT',at:2}).state.workUnitsConsumed,Buffer.byteLength(canonical(f.input)));}],
  ['replay-output', "if (canonical(session.exportReplay()) !== canonical(replay)) fail('E_AUTOMATION_REPLAY_MISMATCH');", '', async f => {const id=enqueue(f);f.send({type:'RUN_NEXT',at:2});f.send({type:'PUBLISH',at:3,jobId:id});const r=clone(f.session.exportReplay());r.finalState.jobs[0].output.rows=[];rehashReplay(r);assert.throws(()=>f.api.verifyLocalAutomationReplay(canonical(r),r.transcriptDigest,4));}],
  ['clock', "integer(action.at, state.tick, Number.MAX_SAFE_INTEGER, 'E_AUTOMATION_CLOCK_REWIND');", "integer(action.at, 0, Number.MAX_SAFE_INTEGER, 'E_AUTOMATION_CLOCK_REWIND');", async f => {f.send({type:'RUN_NEXT',at:2});assert.throws(()=>f.send({type:'RUN_NEXT',at:1}));}],
  ['coalescing', "for (const previous of sameKey) if (['QUEUED', 'READY', 'PUBLISHED'].includes(previous.phase)) halt(previous, 'SUPERSEDED', 'NEWER_GENERATION');", '', async f => {enqueue(f);f.send({type:'CONTEXT',at:2,context:{...f.context,generation:8}});enqueue(f,{...f.job,queryInput:{...f.input,generation:8,currentGeneration:8}},2);assert.equal(f.session.read().queueDenominator,1);}],
];

test('WP601 actual implementation replay kills all 20 guard scheduling and publication mutants', async t => {
  let killed=0;
  for(const [id,before,after,oracle] of mutations){
    await oracle(await fixture());
    assert.equal(source.split(before).length-1,1,`${id}: unique exact mutation anchor`);
    const changed=source.replace(before,after);assert.notEqual(changed,source);
    const executable=changed.replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${pathToFileURL(path.resolve(path.dirname(file),relative)).href}'`);
    const api=await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#${id}`);
    await assert.rejects(()=>fixture(api).then(oracle),{name:'AssertionError'},`${id}: behavioral oracle must kill mutant`);killed++;
  }
  assert.equal(killed,20);assert.equal(fs.readFileSync(file,'utf8'),source);
  t.diagnostic(JSON.stringify({implementationMutants:20,killed,survivors:0,productionSourceMutations:0}));
});
