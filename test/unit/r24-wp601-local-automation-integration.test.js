'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, config, canonical, canonicalDigest, enqueue, digest, queryInput, ROOT } = require('../fixtures/r24-wp601-local-automation-fixtures.js');

test('WP601 independent queue oracle checks 384 jobs across 96 deterministic adverse schedules', async (t) => {
  let observations = 0, published = 0, rejectedOutput = 0;
  for (let seed = 0; seed < 96; seed++) {
    const f = await fixture(), cost = Buffer.byteLength(canonical(f.input)), records = [];
    let work = 0, events = 1, tick = 0;
    const check = () => {
      const state = f.session.read(); observations++;
      assert.equal(state.eventDenominator, events); assert.equal(state.tick, tick);
      assert.equal(state.workUnitsConsumed, work); assert.equal(state.jobDenominator, records.length);
      assert.equal(state.queueDenominator, records.filter(r => r.phase === 'QUEUED').length);
      for (const record of records) {
        const actual = state.jobs.find(j => j.jobId === record.id);
        assert.equal(actual.phase, record.phase); assert.equal(actual.reason, record.reason);
        assert.equal(actual.workUnits, cost);
        if (record.phase === 'PUBLISHED') { assert.deepEqual(actual.output.rows.map(r => r.associationId), ['book-1','fragment-1','scene-1']); published++; }
        else { assert.equal(actual.output, null); rejectedOutput++; }
      }
    };
    for (let index = 0; index < 4; index++) {
      const job = { ...f.job, jobKey: `seed-${seed}-job-${index}`, priority: (seed + index * 3) % 4,
        deadline: 3 + (seed + index) % 5, workBudget: cost + ((seed + index) % 3 === 0 ? -1 : 0) };
      const id = enqueue(f, job); events++; tick = 1;
      assert.equal(id, canonicalDigest(job)); records.push({ id, ...job, phase: 'QUEUED', reason: null }); check();
    }
    const cancelled = records[seed % 4]; f.send({ type: 'CANCEL', at: 1, jobId: cancelled.id });
    cancelled.phase = 'CANCELLED'; cancelled.reason = 'EXPLICIT_CANCELLATION'; events++; check();
    for (let step = 0; step < 4; step++) {
      tick = 2 + step;
      const next = records.filter(r => r.phase === 'QUEUED').sort((a,b) => {
        if (a.priority !== b.priority) return a.priority > b.priority ? -1 : 1;
        if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
        return a.id.localeCompare(b.id, 'en');
      })[0];
      const result = f.send({ type: 'RUN_NEXT', at: tick }); events++;
      assert.equal(result.jobId, next?.id ?? null);
      if (next) {
        if (tick >= next.deadline) { next.phase = 'EXPIRED'; next.reason = 'DEADLINE_REACHED'; }
        else if (next.workBudget < cost) { next.phase = 'ABSTAIN'; next.reason = 'WORK_BUDGET'; }
        else { next.phase = 'READY'; work += cost; }
      }
      check();
      if (next?.phase === 'READY') {
        if ((seed + step) % 2 === 0) {
          f.send({ type: 'CANCEL', at: tick, jobId: next.id }); next.phase = 'CANCELLED'; next.reason = 'EXPLICIT_CANCELLATION';
        } else { f.send({ type: 'PUBLISH', at: tick, jobId: next.id }); next.phase = 'PUBLISHED'; }
        events++; check();
      }
    }
    const replay = f.session.exportReplay();
    assert.equal(f.api.verifyLocalAutomationReplay(canonical(replay), replay.transcriptDigest, events).stateDigest, f.session.read().stateDigest);
  }
  assert.equal(observations, 1017); assert(published > 0 && rejectedOutput > 0);
  t.diagnostic(JSON.stringify({ schedules: 96, jobDenominator: 384, observations, publishedObservations: published, hiddenOutputObservations: rejectedOutput, oracle: 'INDEPENDENT_EXPLICIT_STATE_MACHINE' }));
});

test('WP601 160000-word revision bridge and 768 declared associations execute as one bounded derived job', async (t) => {
  const f = await fixture(), text = 'synthetic '.repeat(80_000).trim();
  const bridge = { schemaVersion: 'yalken.atlas.productRevisionBridge.v1', revisionScope: 'WHOLE_PROJECT', projectId: 'wp601-large',
    projectRevisionId: digest('large-project'), manifestRevision: digest('large-manifest'), sceneOrder: ['a','b'],
    scenesById: Object.fromEntries(['a','b'].map(sceneId => [sceneId, { sceneId, sceneRevision: digest(sceneId), title: sceneId, text }])) };
  assert.equal(Object.values(bridge.scenesById).reduce((n,s) => n + s.text.split(' ').length, 0), 160_000);
  const snapshot = f.snapshots.createAtlasBookSnapshotFromRevisionBridge(bridge, { a: [], b: [] });
  const currentSnapshotIdentity = Object.fromEntries(['projectId','projectRevisionId','manifestRevision','orderDigest','dependencyDigest'].map(k => [k,snapshot[k]]));
  const focusScope = { kind: 'BOOK', projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const associations = Array.from({ length: 768 }, (_, i) => ({ associationId: `association-${String(i).padStart(4,'0')}`, associationKind: 'foreshadows', direction: 'DIRECTED', sourceEntityId: `source-${i}`, targetEntityId: `target-${i}`, evidenceAnchorIds: [`anchor-${i}`], scope: focusScope }));
  const projection = f.associations.compileAtlasAssociations({ snapshot, currentSnapshotIdentity, associations });
  const query = f.queryApi.compileTypedQueryIr(f.input.spec, { ...queryInput(), relationTypes: ['foreshadows'], entityIds: Array.from({ length: 128 }, (_, i) => `source-${i}`) });
  const input = { ...f.input, snapshot, currentSnapshotIdentity, projection, focusScope, query };
  const sourceDigest = canonicalDigest(input);
  f.send({ type: 'CONTEXT', at: 0, context: { ...f.context, snapshot, projectionDigest: projection.projectionDigest } });
  const job = { ...f.job, queryInput: input }, cost = Buffer.byteLength(canonical(input)); assert(cost < 1048576);
  const id = enqueue(f, job); assert.equal(f.send({ type: 'RUN_NEXT', at: 2 }).phase, 'READY');
  const output = f.send({ type: 'PUBLISH', at: 3, jobId: id }).state.jobs[0].output;
  assert.equal(output.denominator.totalAssociations, 768); assert.equal(output.rows.length, 128);
  assert.deepEqual(output.rows.map(r => r.associationId), associations.slice(0,128).map(r => r.associationId));
  const replay = f.session.exportReplay(); assert.equal(f.api.verifyLocalAutomationReplay(canonical(replay), replay.transcriptDigest, 5).status, 'VERIFIED_EXACT_REPLAY');
  assert.equal(canonicalDigest(input), sourceDigest); assert.equal(f.session.read().workUnitsConsumed, cost);
  // Fill the transcript with large, individually valid inputs. The complete
  // accepted prefix must still be replayable after the next input is refused.
  const session = f.api.createLocalAutomationSession(canonical(config()));
  const send = action => session.dispatch(canonical(action));
  send({ type: 'CONTEXT', at: 0, context: { ...f.context, snapshot, projectionDigest: projection.projectionDigest } });
  let accepted = 0;
  for (let i = 0; i < 32; i++) {
    const previous = session.read();
    try { send({ type: 'ENQUEUE', at: 1, job: { ...job, jobKey: `large-${i}` } }); accepted++; }
    catch (error) { assert.equal(error.code, 'E_AUTOMATION_TRANSCRIPT_BOUND'); assert.deepEqual(session.read(), previous); break; }
  }
  assert.equal(accepted, 10);
  const full = session.exportReplay();
  assert.equal(f.api.verifyLocalAutomationReplay(canonical(full), full.transcriptDigest, 11).stateDigest, session.read().stateDigest);
  t.diagnostic(JSON.stringify({ sourceWords: 160000, associationDenominator: 768, outputDenominator: 128, exactWorkUnits: cost, inputTextRetained: false, wallClockSlaClaim: false }));
});

test('WP601 bounded session transcript and fixed adapter expose no host or dynamic execution seam', async () => {
  const f = await fixture(), cfg = config();
  const s = f.api.createLocalAutomationSession(canonical(cfg)), send = a => s.dispatch(canonical(a));
  send({ type: 'CONTEXT', at: 0, context: f.context });
  for (let i = 1; i < cfg.limits.maxEvents; i++) send({ type: 'RUN_NEXT', at: i });
  const before = s.read(); assert.throws(() => send({ type: 'RUN_NEXT', at: 256 }), /E_AUTOMATION_EVENT_BOUND/); assert.deepEqual(s.read(), before);
  const replay = s.exportReplay(); assert.equal(f.api.verifyLocalAutomationReplay(canonical(replay), replay.transcriptDigest, 256).eventDenominator, 256);
  const source = fs.readFileSync(path.join(ROOT,'src/core/local-automation-v1.mjs'),'utf8');
  assert(!/from ['"]node:|\b(?:fetch|eval|setTimeout|setInterval|Worker|Function)\s*\(|\bimport\s*\(/u.test(source));
  const manifest = f.api.LOCAL_AUTOMATION_FEATURE_INTEGRATION_MANIFEST_V1;
  assert.equal(manifest.currentReality, 'BOUNDED_IN_MEMORY_MODULE_NO_DAEMON_OR_HOST_UI_WIRING');
  assert.equal(manifest.workUnitContract, 'CANONICAL_QUERY_INPUT_UTF8_BYTES_PER_EXECUTED_QUERY_NOT_CPU_TIME');
  assert.deepEqual(Object.keys(s).sort(), ['dispatch','exportReplay','read']);
});
