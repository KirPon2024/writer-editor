'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, config, canonical, clone, digest, canonicalDigest, enqueue, rehashReplay, queryInput } = require('../fixtures/r24-wp601-local-automation-fixtures.js');

test('WP601 fixed query job has hidden READY output and exact immutable publication', async () => {
  const f = await fixture(), id = enqueue(f);
  const ready = f.send({ type: 'RUN_NEXT', at: 2 });
  assert.equal(ready.phase, 'READY'); assert.equal(ready.jobId, id);
  assert.equal(ready.state.jobs[0].output, null);
  const published = f.send({ type: 'PUBLISH', at: 3, jobId: id });
  assert.equal(published.phase, 'PUBLISHED');
  assert.deepEqual(published.state.jobs[0].output, f.queryApi.queryFeatureAtlasAssociations(f.input));
  assert.equal(published.state.workUnitsConsumed, Buffer.byteLength(canonical(f.input)));
  assert.equal(Object.isFrozen(published.state.jobs[0].output.rows), true);
  assert.equal(published.state.authority.productMutation, false);
  const { stateDigest, ...stateBody } = published.state;
  assert.equal(stateDigest, canonicalDigest(stateBody));
  const replay = f.session.exportReplay();
  assert.equal(f.api.verifyLocalAutomationReplay(canonical(replay), replay.transcriptDigest, 4).status, 'VERIFIED_EXACT_REPLAY');
  assert.throws(() => f.send({ type: 'PUBLISH', at: 4, jobId: id }), /E_AUTOMATION_PUBLISH_PHASE/);
});

test('WP601 priority, earliest deadline and stable digest form a total queue order', async () => {
  const f = await fixture();
  const jobs = [{ ...f.job, jobKey: 'low', priority: 0 }, { ...f.job, jobKey: 'late', priority: 3, deadline: 80 },
    { ...f.job, jobKey: 'early-a', priority: 3, deadline: 60 }, { ...f.job, jobKey: 'early-b', priority: 3, deadline: 60 }];
  const ids = jobs.map(job => enqueue(f, job));
  const expected = jobs.map((job, i) => ({ ...job, id: ids[i] })).sort((a,b) => b.priority-a.priority || a.deadline-b.deadline || (a.id < b.id ? -1 : 1));
  assert.deepEqual(expected.map(() => f.send({ type: 'RUN_NEXT', at: 2 }).jobId), expected.map(job => job.id));
  assert.equal(f.send({ type: 'RUN_NEXT', at: 3 }).jobId, null);
});

test('WP601 canonical wire order preserves every association denominator and index check', async () => {
  const f = await fixture();
  const wireJob = JSON.parse(canonical(f.job));
  assert.deepEqual(Object.keys(wireJob.queryInput.projection.scopeDenominator), ['book', 'fragment', 'scene', 'total']);
  assert.equal(enqueue(f, wireJob), canonicalDigest(wireJob));
  assert.equal(f.send({ type: 'RUN_NEXT', at: 2 }).phase, 'READY');
  for (const mutate of [
    p => { p.scopeDenominator.extra = 0; },
    p => { p.scopeDenominator.book++; p.scopeDenominator.scene--; },
    p => { p.bookAssociationIds.push('nonexistent-association'); },
    p => { p.authority.productMutation = true; },
  ]) {
    const fresh = await fixture(), job = clone(fresh.job);
    const originalProjection = canonical(job.queryInput.projection);
    mutate(job.queryInput.projection);
    assert.notEqual(canonical(job.queryInput.projection), originalProjection, 'hostile mutation must change bytes');
    const { projectionDigest, ...body } = job.queryInput.projection;
    job.queryInput.projection.projectionDigest = canonicalDigest(body);
    fresh.send({ type: 'CONTEXT', at: 0, context: { ...fresh.context, projectionDigest: job.queryInput.projection.projectionDigest } });
    const before = fresh.session.read();
    assert.throws(() => enqueue(fresh, job));
    assert.deepEqual(fresh.session.read(), before);
  }
});

test('WP601 cancellation before run and after run prevents any publication', async () => {
  for (const runFirst of [false, true]) {
    const f = await fixture(), id = enqueue(f);
    if (runFirst) f.send({ type: 'RUN_NEXT', at: 2 });
    const cancelled = f.send({ type: 'CANCEL', at: 3, jobId: id });
    assert.equal(cancelled.phase, 'CANCELLED'); assert.equal(cancelled.state.jobs[0].output, null);
    assert.equal(f.send({ type: 'RUN_NEXT', at: 4 }).jobId, null);
    assert.throws(() => f.send({ type: 'PUBLISH', at: 5, jobId: id }), /E_AUTOMATION_PUBLISH_PHASE/);
    assert.equal(f.send({ type: 'CANCEL', at: 6, jobId: id }).phase, 'CANCELLED');
    assert.equal(f.session.read().workUnitsConsumed, runFirst ? Buffer.byteLength(canonical(f.input)) : 0);
  }
});

test('WP601 deadline equality expires queued and ready jobs; clocks never rewind', async () => {
  for (const ready of [false, true]) {
    const f = await fixture(), id = enqueue(f, { ...f.job, deadline: 3 });
    if (ready) f.send({ type: 'RUN_NEXT', at: 2 });
    const result = ready ? f.send({ type: 'PUBLISH', at: 3, jobId: id }) : f.send({ type: 'RUN_NEXT', at: 3 });
    assert.equal(result.phase, 'EXPIRED'); assert.equal(result.state.jobs[0].output, null);
    const before = f.session.read(); assert.throws(() => f.send({ type: 'RUN_NEXT', at: 2 }), /E_AUTOMATION_CLOCK_REWIND/); assert.deepEqual(f.session.read(), before);
  }
  const f = await fixture(); assert.throws(() => enqueue(f, { ...f.job, deadline: 1 }), /E_AUTOMATION_EXPIRED_ENQUEUE/);
});

test('WP601 job and aggregate work budgets bind exact input-byte costs without partial results', async () => {
  const original = await fixture(); const cost = Buffer.byteLength(canonical(original.input));
  for (const delta of [-1, 0]) {
    const f = await fixture(), id = enqueue(f, { ...f.job, workBudget: cost + delta });
    const result = f.send({ type: 'RUN_NEXT', at: 2 });
    assert.equal(result.phase, delta < 0 ? 'ABSTAIN' : 'READY');
    assert.equal(result.state.workUnitsConsumed, delta < 0 ? 0 : cost);
    assert.equal(result.state.jobs[0].output, null);
    if (delta === 0) assert.equal(f.send({ type: 'PUBLISH', at: 3, jobId: id }).phase, 'PUBLISHED');
  }
  const f = await fixture(); const cfg = config(); cfg.limits.maxTotalWorkUnits = cost;
  const session = f.api.createLocalAutomationSession(canonical(cfg));
  const send = action => session.dispatch(canonical(action)); send({ type: 'CONTEXT', at: 0, context: f.context });
  for (const jobKey of ['a','b']) send({ type: 'ENQUEUE', at: 1, job: { ...f.job, jobKey } });
  assert.equal(send({ type: 'RUN_NEXT', at: 2 }).phase, 'READY');
  assert.equal(send({ type: 'RUN_NEXT', at: 2 }).phase, 'ABSTAIN');
  assert.equal(session.read().workUnitsConsumed, cost);
});

test('WP601 current project lifecycle snapshot projection generation and enabled state fence results', async () => {
  for (const mutate of [
    c => { c.lifecycleId = 'new-session'; }, c => { c.generation += 1; }, c => { c.enabled = false; },
    c => { c.projectionDigest = digest('new-projection'); },
    (c,f) => { c.snapshot = f.snapshots.createAtlasBookSnapshot({ projectId: 'other-project', projectRevisionId: digest('other-revision'), manifestRevision: digest('other-manifest'), sceneOrder: [], sceneRevisionsById: {}, dependenciesBySceneId: {} }); },
  ]) for (const ready of [false,true]) {
    const f = await fixture(), id = enqueue(f); if (ready) f.send({ type: 'RUN_NEXT', at: 2 });
    const ctx = clone(f.context); mutate(ctx,f); f.send({ type: 'CONTEXT', at: 3, context: ctx });
    if (!ready) assert.equal(f.send({ type: 'RUN_NEXT', at: 4 }).phase, 'STALE');
    assert.equal(f.session.read().jobs[0].phase, 'STALE'); assert.equal(f.session.read().jobs[0].output, null);
    assert.throws(() => f.send({ type: 'PUBLISH', at: 5, jobId: id }), /E_AUTOMATION_PUBLISH_PHASE/);
  }
});

test('WP601 newer generation coalesces queued work, retains history and rejects identity collisions', async () => {
  const f = await fixture(), old = enqueue(f);
  assert.throws(() => enqueue(f), /E_AUTOMATION_DUPLICATE_JOB/);
  assert.throws(() => enqueue(f, { ...f.job, priority: 3 }), /E_AUTOMATION_GENERATION_COLLISION/);
  f.send({ type: 'CONTEXT', at: 2, context: { ...f.context, generation: 8 } });
  const newer = { ...f.job, queryInput: { ...f.input, generation: 8, currentGeneration: 8 } };
  const id = enqueue(f, newer, 2);
  const state = f.session.read(); assert.equal(state.jobDenominator, 2); assert.equal(state.queueDenominator, 1);
  assert.equal(state.jobs.find(job => job.jobId === old).phase, 'SUPERSEDED');
  assert.equal(f.send({ type: 'RUN_NEXT', at: 3 }).jobId, id);
  assert.throws(() => enqueue(f, f.job, 3), /E_AUTOMATION_CONTEXT_REQUIRED/);
});

test('WP601 UNKNOWN and feature-budget ABSTAIN remain typed after fixed adapter execution', async () => {
  for (const limit of [128, 1]) {
    const f = await fixture(); const query = f.queryApi.compileTypedQueryIr(f.input.spec, { ...queryInput(), limit, entityIds: limit === 128 ? ['no-match'] : [] });
    const id = enqueue(f, { ...f.job, queryInput: { ...f.input, query } });
    f.send({ type: 'RUN_NEXT', at: 2 });
    const output = f.send({ type: 'PUBLISH', at: 3, jobId: id }).state.jobs[0].output;
    assert.equal(output.status, limit === 128 ? 'UNKNOWN' : 'ABSTAIN'); assert.deepEqual(output.rows, []);
  }
  const f = await fixture(); enqueue(f, { ...f.job, queryInput: { ...f.input, focusScope: { kind: 'UNSUPPORTED' } } });
  const failed = f.send({ type: 'RUN_NEXT', at: 2 }); assert.equal(failed.phase, 'FAILED'); assert.equal(failed.state.jobs[0].output, null);
  assert.equal(typeof failed.state.jobs[0].reason, 'string');
});

test('WP601 canonical JSON boundary, finite counters and closed controls fail atomically', async () => {
  const f = await fixture(); let invoked = 0;
  const executable = { get type() { invoked++; return 'RUN_NEXT'; } };
  const hostile = [executable, new Proxy({}, { get(){ invoked++; throw Error('trap'); } }), null,
    'null', '[]', '{"type":"RUN_NEXT","at":1}', '{"at":1,"at":2,"type":"RUN_NEXT"}',
    '{"at":-0,"type":"RUN_NEXT"}', '{"at":1e400,"type":"RUN_NEXT"}',
    canonical({ at: 1, type: 'APPLY', path: '/user' }), canonical({ at: 1, type: 'RUN_NEXT', extra: true }),
    canonical({ at: -1, type: 'RUN_NEXT' }), canonical({ at: 1.5, type: 'RUN_NEXT' }),
    canonical({ at: 1, type: 'CANCEL', jobId: digest('missing') }), 'x'.repeat(1048577)];
  for (const raw of hostile) { const before = f.session.read(); assert.throws(() => f.session.dispatch(raw)); assert.deepEqual(f.session.read(), before); }
  assert.equal(invoked, 0);
  for (const key of Object.keys(config().limits)) { const c = config(); c.limits[key] = 0; assert.throws(() => f.api.createLocalAutomationSession(canonical(c))); }
  const c = config(); c.sessionId = 'Cafe\u0301'; assert.throws(() => f.api.createLocalAutomationSession(canonical(c)));
  for (const jobKey of ['Café', 'сцена-α', 'مرحلة-🖊️']) {
    const id = enqueue(f, { ...f.job, jobKey });
    assert.equal(f.send({ type: 'RUN_NEXT', at: 1 }).jobId, id);
    assert.equal(f.send({ type: 'PUBLISH', at: 1, jobId: id }).phase, 'PUBLISHED');
  }
});

test('WP601 queue job and event denominator bounds reject before any state change', async () => {
  for (const key of ['maxQueueSize','maxJobs','maxEvents']) {
    const f = await fixture(), cfg = config(); cfg.limits[key] = key === 'maxEvents' ? 2 : 1;
    if (key === 'maxJobs') cfg.limits.maxQueueSize = 1;
    const s = f.api.createLocalAutomationSession(canonical(cfg)), send = action => s.dispatch(canonical(action));
    send({ type: 'CONTEXT', at: 0, context: f.context }); send({ type: 'ENQUEUE', at: 1, job: f.job });
    if (key === 'maxJobs') send({ type: 'RUN_NEXT', at: 2 });
    const before = s.read(); assert.throws(() => send({ type: 'ENQUEUE', at: 2, job: { ...f.job, jobKey: 'second' } }), /E_AUTOMATION_(QUEUE|JOB|EVENT)_BOUND/); assert.deepEqual(s.read(), before);
  }
});

test('WP601 exact replay rejects missing reordered rehashed stale and widened authority evidence', async () => {
  const f = await fixture(), id = enqueue(f); f.send({ type: 'RUN_NEXT', at: 2 }); f.send({ type: 'PUBLISH', at: 3, jobId: id });
  const good = f.session.exportReplay();
  for (const mutate of [
    r => { r.events.pop(); }, r => { r.eventDenominator--; }, r => { r.events.reverse(); },
    r => { r.finalState.jobs[0].output.rows.pop(); }, r => { r.finalState.workUnitsConsumed = 0; },
    r => { r.authority.productMutation = true; }, r => { r.featureManifestDigest = digest('wrong'); },
    r => { r.events[2].at = 100; }, r => { r.finalState.jobs[0].identity.lifecycleId = 'other'; },
  ]) {
    const bad = clone(good); mutate(bad); rehashReplay(bad);
    assert.throws(() => f.api.verifyLocalAutomationReplay(canonical(bad), good.transcriptDigest, 4));
    assert.throws(() => f.api.verifyLocalAutomationReplay(canonical(bad), bad.transcriptDigest, 4));
  }
  assert.throws(() => f.api.verifyLocalAutomationReplay(canonical(good), good.transcriptDigest, 0));
});
