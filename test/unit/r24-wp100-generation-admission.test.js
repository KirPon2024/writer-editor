'use strict';

// R2.4 WP-100 generation admission: the seven foundations composed.
// Exact edit/durable generation across the full renderer-to-durable chain
// and non-authoritative renderer state, proven over the real foundation
// modules wired in one flow.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CORE = (name) => path.join(__dirname, '..', '..', 'src', 'core', name);

const { createEnvelope, validateIpcEnvelope } = require(CORE('ipc-envelope-v1.cjs'));
const { createGuardedIpcRegistration, IpcCallerIdentityError } = require(CORE('ipc-caller-identity-v1.cjs'));
const { createEditGenerationTracker, decideAutosaveAck, mergeSignaledGeneration } = require(CORE('autosave-generation-v1.cjs'));
const { SAVE_ACK_KINDS, applySaveAck, classifySaveAck, deriveDirty } = require(CORE('dirty-admission-v1.cjs'));
const {
  advanceRevisionCoordinate,
  compareRevisionCoordinates,
  isLineageDescendant,
  normalizeRevisionCoordinate,
} = require(CORE('revision-algebra-v1.cjs'));

const SHELL_PREFIX = 'yalken-shell://';
const POLICY = {
  expectedSenderIds: () => [7],
  allowedFrameUrlPrefixes: () => [SHELL_PREFIX],
};
const genuineEvent = () => ({
  sender: { id: 7, isDestroyed: () => false },
  senderFrame: { url: `${SHELL_PREFIX}index.html` },
});
const forgedEvent = () => ({
  sender: { id: 31337, isDestroyed: () => false },
  senderFrame: { url: 'https://evil.example/payload' },
});

const BASE_REVISION = {
  domain: { projectId: 'wp100-project', entityId: 'scene-a' },
  projectRevision: 0,
  entityRevision: 0,
  sourceRevision: 0,
  generation: 0,
  writerEpoch: 0,
};

// One composed chain: renderer intent arrives as an S1 envelope through an
// S0-guarded registration and drives the P0/P1 generation machinery with
// R0 revision ordering on durable commit.
function makeChain() {
  const mutations = [];
  const tracker = createEditGenerationTracker(0);
  const state = {
    admission: { latestEditGeneration: 0, ackedGeneration: 0 },
    latestSignaled: 0,
    revision: normalizeRevisionCoordinate(BASE_REVISION),
    disk: '',
    draft: '',
  };
  const registrations = new Map();
  const fakeIpc = {
    handle(channel, handler) { registrations.set(channel, handler); },
    on(channel, handler) { registrations.set(channel, handler); },
  };
  const guarded = createGuardedIpcRegistration(fakeIpc, POLICY);

  guarded.handle('ui:save-lifecycle-signal-bridge', async (event, request) => {
    const verdict = validateIpcEnvelope(request, 'ui:save-lifecycle-signal-bridge');
    if (!verdict.ok) {
      return { ok: false, error: { code: verdict.code, reason: verdict.code } };
    }
    if (request.signalId === 'signal.localDirty.set') {
      tracker.bump();
      state.admission = { latestEditGeneration: tracker.current(), ackedGeneration: state.admission.ackedGeneration };
      state.latestSignaled = mergeSignaledGeneration(state.latestSignaled, tracker.current());
      state.draft = String(request.payload && request.payload.text ? request.payload.text : state.draft);
      mutations.push({ generation: tracker.current(), text: state.draft });
      return { ok: true, value: { admitted: true } };
    }
    if (request.signalId === 'signal.autoSave.request') {
      const captured = tracker.current();
      const capturedContent = state.draft;
      state.disk = capturedContent;
      const decision = decideAutosaveAck({ capturedGeneration: captured, latestEditGeneration: state.latestSignaled });
      const ack = classifySaveAck({
        writeSucceeded: true,
        ackOutcome: decision.outcome,
        savedGeneration: captured,
        latestEditGeneration: state.latestSignaled,
      });
      if (ack.kind === SAVE_ACK_KINDS.SAVED) {
        state.admission = applySaveAck(state.admission, ack);
        state.revision = advanceRevisionCoordinate(advanceRevisionCoordinate(state.revision, 'entityRevision'), 'sourceRevision');
      }
      return { ok: true, value: { ack } };
    }
    return { ok: false, error: { code: 'SIGNAL_UNKNOWN', reason: 'SIGNAL_UNKNOWN' } };
  });

  const invoke = (event, request) => registrations.get('ui:save-lifecycle-signal-bridge')(event, request);
  return { state, tracker, mutations, invoke };
}

test('composed chain: edit generations advance exactly and durable ack reaches the live frontier', async () => {
  const chain = makeChain();
  await chain.invoke(genuineEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.localDirty.set', { text: 'v1' }));
  assert.equal(chain.state.admission.latestEditGeneration, 1);
  assert.equal(deriveDirty(chain.state.admission), true);

  const saved = await chain.invoke(genuineEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.autoSave.request', {}));
  assert.equal(saved.ok, true);
  assert.equal(saved.value.ack.kind, SAVE_ACK_KINDS.SAVED);
  assert.equal(chain.state.admission.ackedGeneration, 1);
  assert.equal(deriveDirty(chain.state.admission), false);
  assert.equal(chain.state.disk, 'v1');
  assert.equal(isLineageDescendant(chain.state.revision, BASE_REVISION), true, 'the durable revision descends from the admission base');
  assert.equal(compareRevisionCoordinates(chain.state.revision, BASE_REVISION), 'GREATER');
});

test('composed chain: a mid-flight edit protects the newer generation through the whole stack', async () => {
  const chain = makeChain();
  await chain.invoke(genuineEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.localDirty.set', { text: 'v1' }));
  await chain.invoke(genuineEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.localDirty.set', { text: 'v2' }));

  // The autosave captures generation 2 exactly and the ack reaches the live frontier.
  const first = await chain.invoke(genuineEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.autoSave.request', {}));
  assert.equal(first.value.ack.kind, SAVE_ACK_KINDS.SAVED);
  assert.equal(chain.state.disk, 'v2');
  assert.equal(deriveDirty(chain.state.admission), false);

  // A stale ack from a superseded capture cannot clear the newer frontier.
  const staleCapture = 1;
  const staleDecision = decideAutosaveAck({ capturedGeneration: staleCapture, latestEditGeneration: chain.state.latestSignaled });
  const staleAck = classifySaveAck({
    writeSucceeded: true,
    ackOutcome: staleDecision.outcome,
    savedGeneration: staleCapture,
    latestEditGeneration: chain.state.latestSignaled,
  });
  assert.equal(staleAck.kind, SAVE_ACK_KINDS.PROTECTED);
  assert.throws(
    () => applySaveAck(chain.state.admission, { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: staleCapture }),
    (e) => e.code === 'E_SAVE_ACK_STALE_AS_SAVED',
  );
  assert.equal(deriveDirty(chain.state.admission), false, 'the saved frontier is unchanged by the stale ack');
});

test('non-authoritative renderer: a renderer-claimed future generation cannot clear dirty state', async () => {
  const chain = makeChain();
  await chain.invoke(genuineEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.localDirty.set', { text: 'draft' }));
  assert.throws(
    () => applySaveAck(chain.state.admission, { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: 99 }),
    (e) => e.code === 'E_SAVE_ACK_STALE_AS_SAVED',
  );
  assert.equal(deriveDirty(chain.state.admission), true, 'the forged ack leaves the true frontier dirty');
});

test('non-authoritative renderer: forged caller, unframed payload and unknown signal never reach mutation', async () => {
  const chain = makeChain();
  assert.throws(
    () => chain.invoke(forgedEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.localDirty.set', { text: 'hostile' })),
    (e) => e instanceof IpcCallerIdentityError,
  );
  assert.equal(chain.mutations.length, 0, 'forged caller never mutates');

  const unframed = await chain.invoke(genuineEvent(), { signalId: 'signal.localDirty.set', payload: { text: 'raw' } });
  assert.equal(unframed.ok, false);
  assert.equal(chain.mutations.length, 0, 'unframed payload never mutates');

  const unknown = await chain.invoke(genuineEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.does.not.exist', {}));
  assert.equal(unknown.ok, false);
  assert.equal(chain.mutations.length, 0, 'unknown signal never mutates');
});

test('exact ordering: revision coordinates stay comparable across repeated durable commits', async () => {
  const chain = makeChain();
  await chain.invoke(genuineEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.localDirty.set', { text: 'v1' }));
  await chain.invoke(genuineEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.autoSave.request', {}));
  const afterFirst = chain.state.revision;
  await chain.invoke(genuineEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.localDirty.set', { text: 'v2' }));
  await chain.invoke(genuineEvent(), createEnvelope('ui:save-lifecycle-signal-bridge', 'signal.autoSave.request', {}));
  assert.equal(chain.state.admission.ackedGeneration, 2);
  assert.equal(chain.state.disk, 'v2');
  assert.equal(compareRevisionCoordinates(chain.state.revision, afterFirst), 'GREATER', 'each durable commit advances the coordinate exactly');
});
