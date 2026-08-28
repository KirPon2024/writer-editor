'use strict';

// R2.4 WP-104 boundary falsification: spoof and stale evidence across every
// foundation boundary, driven against the real law modules.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const CORE = (name) => path.join(ROOT, 'src', 'core', name);

const { evaluateIpcCallerIdentity } = require(CORE('ipc-caller-identity-v1.cjs'));
const { createEnvelope, validateIpcEnvelope, withTimeoutBudget, IpcEnvelopeError } = require(CORE('ipc-envelope-v1.cjs'));
const { applySaveAck, SAVE_ACK_KINDS } = require(CORE('dirty-admission-v1.cjs'));
const { decideAutosaveAck, classifySaveAck } = require(CORE('dirty-admission-v1.cjs'));
const { decideAutosaveAck: decideAck, mergeSignaledGeneration } = require(CORE('autosave-generation-v1.cjs'));
const { parseRevisionCoordinate, joinRevisionCoordinates, RevisionAlgebraError } = require(CORE('revision-algebra-v1.cjs'));
const { decideCommandEntitlement } = require(CORE('entitlement-law-v1.cjs'));
const { isAllowedFilePathByLaw, computeFilePathAllowlistRoots } = require(CORE('io/file-path-allowlist-v1.cjs'));
const anchorLaw = require(CORE('anchor-lineage-v1.cjs'));

test('SPOOF: forged caller identities are refused with typed codes', () => {
  const shellUrl = 'file:///app/index.html?USE_TIPTAP=1&PRODUCT_PROFILE=WRITER_LOCAL_V1&BRAND_IDENTITY=YALKEN_ORIGINAL_V1';
  const channel = 'ui:command-bridge';
  const policy = {
    expectedFrameUrl: () => shellUrl,
    resolveLiveCaller: () => ({ senderId: 7, session: 'session-a', currentUrl: shellUrl, allowedChannels: [channel] }),
  };
  const foreignSender = evaluateIpcCallerIdentity({
    sender: { id: 31337, isDestroyed: () => false, session: 'session-a' },
    senderFrame: { url: shellUrl },
  }, policy, { channel });
  assert.equal(foreignSender.code, 'E_IPC_SENDER_MISMATCH');

  const foreignFrame = evaluateIpcCallerIdentity({
    sender: { id: 7, isDestroyed: () => false, session: 'session-a' },
    senderFrame: { url: 'https://evil.example/' },
  }, policy, { channel });
  assert.equal(foreignFrame.code, 'E_IPC_FRAME_PROTOCOL_DENIED');

  const foreignSession = evaluateIpcCallerIdentity({
    sender: { id: 7, isDestroyed: () => false, session: 'session-b' },
    senderFrame: { url: shellUrl },
  }, policy, { channel });
  assert.equal(foreignSession.code, 'E_IPC_SESSION_MISMATCH');
});

test('SPOOF: a tampered envelope never validates', () => {
  const genuine = createEnvelope('ui:command-bridge', 'cmd.project.save', {});
  assert.equal(validateIpcEnvelope(genuine, 'ui:command-bridge').ok, true);
  const tamperedVersion = { ...genuine, protocolVersion: 999 };
  assert.equal(validateIpcEnvelope(tamperedVersion, 'ui:command-bridge').ok, false);
  const tamperedChannel = { ...genuine, channel: 'ui:workspace-query-bridge' };
  assert.equal(validateIpcEnvelope(tamperedChannel, 'ui:command-bridge').ok, false);
  const extraKey = { ...genuine, isAdmin: true };
  assert.equal(validateIpcEnvelope(extraKey, 'ui:command-bridge').ok, false, 'closed key set refuses injected authority fields');
});

test('SPOOF: forged generations and revision spellings are refused', () => {
  assert.throws(
    () => applySaveAck({ latestEditGeneration: 2, ackedGeneration: 2 }, { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: 99 }),
    (e) => e.code === 'E_SAVE_ACK_STALE_AS_SAVED',
  );
  assert.throws(() => parseRevisionCoordinate('rv9:proj/scene/1/1/1/1/1'), (e) => e instanceof RevisionAlgebraError);
  assert.throws(() => parseRevisionCoordinate('rv1:proj/scene/1/1/1/1/1; DROP TABLE'), (e) => e instanceof RevisionAlgebraError);
});

test('SPOOF: forged entitlement tier never unlocks the pro surface', () => {
  // The law's WP206 safe-deny semantics: pro spellings remain recognizable,
  // but no supplied value becomes an effective entitlement tier until a
  // separate owner-approved product decision changes the capability table.
  for (const acceptedButDisabled of ['pro', 'PRO', ' Pro ']) {
    assert.equal(decideCommandEntitlement('cmd.project.review.switchMode', acceptedButDisabled).available, false, acceptedButDisabled);
  }
  for (const forged of ['pro-plus', 'enterprise', 'licensed', 'pro pro']) {
    assert.equal(decideCommandEntitlement('cmd.project.review.switchMode', forged).available, false, forged);
  }
  const injected = decideCommandEntitlement('cmd.project.review.switchMode', { toString: () => 'pro' });
  assert.equal(injected.available, false, 'an object posing as a tier is not a string and degrades to free');
});

test('SPOOF: a symlink alias never widens the file boundary', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp104-root-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp104-out-')));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'classified');
  fs.symlinkSync(outside, path.join(root, 'alias'), 'dir');
  const roots = computeFilePathAllowlistRoots([root]);
  assert.equal(isAllowedFilePathByLaw(path.join(root, 'alias', 'secret.txt'), roots), false);
});

test('STALE: a superseded autosave ack is PROTECTED and the frontier does not move', () => {
  const latest = mergeSignaledGeneration(0, 3);
  const decision = decideAck({ capturedGeneration: 1, latestEditGeneration: latest });
  const ack = classifySaveAck({ writeSucceeded: true, ackOutcome: decision.outcome, savedGeneration: 1, latestEditGeneration: latest });
  assert.equal(ack.kind, SAVE_ACK_KINDS.PROTECTED);
  assert.throws(
    () => applySaveAck({ latestEditGeneration: 3, ackedGeneration: 3 }, { kind: SAVE_ACK_KINDS.SAVED, savedGeneration: 1 }),
    (e) => e.code === 'E_SAVE_ACK_STALE_AS_SAVED',
  );
});

test('STALE: a late bridge result is discarded after the timeout budget', async () => {
  const late = new Promise((resolve) => setTimeout(() => resolve({ ok: true, value: 'late' }), 60));
  await assert.rejects(
    withTimeoutBudget(() => late, { timeoutMs: 10, correlationId: 'wp104-late' }),
    (e) => e instanceof IpcEnvelopeError && e.code === 'E_BRIDGE_TIMEOUT',
  );
  const settled = await late;
  assert.equal(settled.ok, true, 'the late value exists but was already refused to the caller');
});

test('STALE: concurrent revisions never join into a silent winner', () => {
  const base = { domain: { projectId: 'p', entityId: 's' }, projectRevision: 0, entityRevision: 2, sourceRevision: 1, generation: 0, writerEpoch: 0 };
  const left = { ...base, entityRevision: 3, sourceRevision: 1 };
  const right = { ...base, entityRevision: 2, sourceRevision: 2 };
  assert.throws(() => joinRevisionCoordinates(left, right), (e) => e.code === 'E_REVISION_CONCURRENT_CONFLICT');
});

test('STALE: an anchor carried to a concurrent revision is a typed refusal', () => {
  const identity = anchorLaw.createAnchorIdentity({
    anchorId: 'a1',
    projectId: 'p',
    sceneId: 's',
    birthRevision: { domain: { projectId: 'p', entityId: 's' }, projectRevision: 0, entityRevision: 2, sourceRevision: 1, generation: 0, writerEpoch: 0 },
  });
  assert.throws(
    () => anchorLaw.assertAnchorLineageRelated(identity, { domain: { projectId: 'p', entityId: 's' }, projectRevision: 0, entityRevision: 3, sourceRevision: 0, generation: 0, writerEpoch: 0 }),
    (e) => e.code === 'E_ANCHOR_LINEAGE_UNRELATED',
  );
});

test('STALE: a replayed commit fence revision is a regression refusal', async () => {
  const { commitProjectTextAndManifest } = require(CORE('project-commit-v1.cjs'));
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp104-commit-')));
  const scenePath = path.join(dir, 'scene.txt');
  const commit = (revision) => commitProjectTextAndManifest({
    scenePath,
    sceneContent: `payload-${revision}`,
    revision,
    persistManifest: async () => ({ persisted: true, manifest: { v: revision } }),
  });
  const first = await commit(4);
  assert.equal(first.ok !== false, true);
  await assert.rejects(commit(4), (e) => e.code === 'E_COMMIT_FENCE_REGRESSION');
  await assert.rejects(commit(2), (e) => e.code === 'E_COMMIT_FENCE_REGRESSION');
});
