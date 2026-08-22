'use strict';

// R2.4 R2 candidate physics: crash and torn-write behavior per admitted
// candidate, proven on real filesystem sandboxes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CANDIDATE_REGISTRY,
  runCandidateBenchmark,
  StorageBakeoffError,
} = require(path.join(__dirname, '..', '..', 'src', 'core', 'storage-bakeoff-v1.cjs'));

const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r2p-')));

test('atomic-file: crash between temp write and publish leaves old truth intact, never torn', async () => {
  const dir = sandbox();
  const model = CANDIDATE_REGISTRY['atomic-file'].model(dir);
  await model.write(1, 'rev:1', {});
  await model.write(2, 'rev:2', {});
  await assert.rejects(model.write(3, 'rev:3', { crashBeforeCommit: true }), (e) => e.code === 'E_SIMULATED_CRASH');
  const recovery = await model.recover();
  assert.equal(recovery.tornStateDetected, false, 'rename physics: committed truth is never torn');
  assert.equal(recovery.recoveredRevision, 2, 'the last committed revision survives');
  assert.equal(recovery.residueFiles > 0, true, 'the crash residue is visible, not hidden');
  assert.equal(await model.readBack(), 'rev:2');
});

test('append-ledger: torn tail is detected and truncated; committed entries survive in order', async () => {
  const dir = sandbox();
  const model = CANDIDATE_REGISTRY['append-ledger'].model(dir);
  await model.write(1, 'rev:1', {});
  await model.write(2, 'rev:2', {});
  await assert.rejects(model.write(3, 'rev:3', { crashBeforeCommit: true }), (e) => e.code === 'E_SIMULATED_CRASH');
  const recovery = await model.recover();
  assert.equal(recovery.tornStateDetected, true, 'the torn tail is detected, not silently read');
  assert.equal(recovery.truncatedTail, true);
  assert.equal(recovery.recoveredRevision, 2, 'replay stops at the last valid entry');
  assert.equal(recovery.entries, 2);
});

test('append-ledger: fence regression is refused at write time', async () => {
  const dir = sandbox();
  const model = CANDIDATE_REGISTRY['append-ledger'].model(dir);
  await model.write(2, 'rev:2', {});
  await assert.rejects(model.write(2, 'rev:2', {}), (e) => e.code === 'E_LEDGER_FENCE_REGRESSION');
  await assert.rejects(model.write(1, 'rev:1', {}), (e) => e.code === 'E_LEDGER_FENCE_REGRESSION');
});

test('hybrid: journal ahead of the manifest is replayable intent, not torn truth', async () => {
  const dir = sandbox();
  const model = CANDIDATE_REGISTRY.hybrid.model(dir);
  await model.write(1, 'rev:1', {});
  await assert.rejects(model.write(2, 'rev:2', { crashBeforeCommit: true }), (e) => e.code === 'E_SIMULATED_CRASH');
  const recovery = await model.recover();
  assert.equal(recovery.tornStateDetected, false, 'the manifest is atomic; truth is never torn');
  assert.equal(recovery.recoveredRevision, 1);
  assert.equal(recovery.replayable, true, 'the journaled intent ahead of the manifest is visible for replay');
  assert.equal(await model.readBack(), 'rev:1');
});

test('benchmark physics: the crash is always injected and every admitted candidate recovers deterministically', async () => {
  for (const id of ['atomic-file', 'append-ledger', 'hybrid']) {
    const first = await runCandidateBenchmark(CANDIDATE_REGISTRY[id], sandbox());
    const second = await runCandidateBenchmark(CANDIDATE_REGISTRY[id], sandbox());
    assert.equal(first.crashInjected, true, id);
    assert.equal(first.recoveredRevision, second.recoveredRevision, `${id}: recovery is deterministic`);
    assert.equal(first.readBack, second.readBack, id);
    assert.equal(first.bytesWritten, second.bytesWritten, `${id}: write amplification is deterministic`);
  }
});

test('benchmark refuses a candidate whose crash injection did not happen', async () => {
  const noCrashModel = {
    id: 'never-crashes',
    requiresDependency: false,
    requiresNetwork: false,
    destructiveMigration: false,
    model: () => ({
      async write() {},
      async recover() { return { tornStateDetected: false, recoveredRevision: 8, readable: true }; },
      async readBack() { return 'rev:8'; },
      metrics: () => ({ bytesWritten: 0 }),
    }),
  };
  await assert.rejects(
    runCandidateBenchmark(noCrashModel, sandbox()),
    (e) => e instanceof StorageBakeoffError && e.code === 'E_BENCHMARK_CRASH_NOT_INJECTED',
  );
});
