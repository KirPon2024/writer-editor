'use strict';

// R2.4 R4 physics: the P3 commit bound to the inbox — replay refusal before
// work, admitted-payload conflict before write authority, crash recovery of
// pending effects and visible post-ACK inbox failure.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openTransactionalInboxOutbox } = require(path.join(__dirname, '..', '..', 'src', 'core', 'transactional-inbox-outbox-v1.cjs'));
const { commitProjectTextAndManifest } = require(path.join(__dirname, '..', '..', 'src', 'core', 'project-commit-v1.cjs'));

const sandbox = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r4p-')));
const persistManifest = async () => ({ persisted: true, manifest: { v: 1 } });
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

test('a committed intent marks executed; a replayed intent is refused before any work', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  const box = await openTransactionalInboxOutbox(dir);
  const first = await commitProjectTextAndManifest({
    scenePath,
    sceneContent: 'payload-v1',
    revision: 1,
    persistManifest,
    intentInbox: box,
    intentId: 'commit-scene-1',
  });
  assert.equal(first.success, true);
  assert.equal(first.intentExecuted, true);
  assert.equal(first.intentError, null);
  assert.deepEqual(first.intentAdmitted, { intentId: 'commit-scene-1', status: 'ADMITTED' });
  assert.equal(box.isExecuted('commit-scene-1'), true);

  const diskBefore = fs.readFileSync(`${scenePath}.commit.json`, 'utf8');
  await assert.rejects(
    commitProjectTextAndManifest({
      scenePath,
      sceneContent: 'payload-v1',
      revision: 1,
      persistManifest,
      intentInbox: box,
      intentId: 'commit-scene-1',
    }),
    (e) => e.code === 'E_COMMIT_INTENT_DUPLICATE',
  );
  assert.equal(fs.readFileSync(`${scenePath}.commit.json`, 'utf8'), diskBefore, 'the replay wrote nothing');
});

test('an attached inbox without an intent id is a typed refusal at ADMIT', async () => {
  const dir = sandbox();
  const box = await openTransactionalInboxOutbox(dir);
  await assert.rejects(
    commitProjectTextAndManifest({
      scenePath: path.join(dir, 'scene.txt'),
      sceneContent: 'x',
      revision: 1,
      persistManifest,
      intentInbox: box,
    }),
    (e) => e.code === 'E_COMMIT_INTENT_ID_REQUIRED',
  );
});

test('an attached inbox must expose the transactional interface', async () => {
  const dir = sandbox();
  await assert.rejects(
    commitProjectTextAndManifest({
      scenePath: path.join(dir, 'scene.txt'),
      sceneContent: 'x',
      revision: 1,
      persistManifest,
      intentInbox: { isExecuted: () => false, markExecuted: async () => {} },
      intentId: 'commit-scene-1',
    }),
    (e) => e.code === 'E_COMMIT_INTENT_BOX_INVALID',
  );
});

test('a conflicting admitted intent is refused before project files are written', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  const box = await openTransactionalInboxOutbox(dir);
  await box.admitIntent({
    intentId: 'commit-scene-1',
    kind: 'project.commit',
    payload: { scenePath, revision: 1, sceneDigest: sha256hex('different-payload') },
  });
  await assert.rejects(
    commitProjectTextAndManifest({
      scenePath,
      sceneContent: 'payload-v1',
      revision: 1,
      persistManifest,
      intentInbox: box,
      intentId: 'commit-scene-1',
    }),
    (e) => e.code === 'E_COMMIT_INTENT_CONFLICT',
  );
  assert.equal(fs.existsSync(scenePath), false);
  assert.equal(fs.existsSync(`${scenePath}.commit.json`), false);
});

test('crash between commit and effect publication leaves a recoverable pending effect', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  const box = await openTransactionalInboxOutbox(dir);
  const committed = await commitProjectTextAndManifest({
    scenePath,
    sceneContent: 'payload-v1',
    revision: 1,
    persistManifest,
    intentInbox: box,
    intentId: 'commit-scene-1',
  });
  assert.equal(committed.success, true);
  await box.stageEffect({ intentId: 'commit-scene-1', effectId: 'effect-manifest-sync', kind: 'fs.write' });

  const recovered = await openTransactionalInboxOutbox(dir);
  const pending = recovered.pendingEffects();
  assert.deepEqual(pending.map((e) => e.effectId), ['effect-manifest-sync'], 'recovery finds exactly the unpublished effect');
  assert.equal(recovered.isExecuted('commit-scene-1'), true, 'the landed commit is not re-executed during recovery');
  await assert.rejects(
    commitProjectTextAndManifest({
      scenePath,
      sceneContent: 'payload-v1',
      revision: 1,
      persistManifest,
      intentInbox: recovered,
      intentId: 'commit-scene-1',
    }),
    (e) => e.code === 'E_COMMIT_INTENT_DUPLICATE',
  );
  await recovered.markEffectPublished('effect-manifest-sync');
  assert.deepEqual(recovered.pendingEffects(), [], 'after replay-publication nothing remains pending');
});

test('a markExecuted failure after ACK is typed and visible, never a hidden commit failure', async () => {
  const dir = sandbox();
  const scenePath = path.join(dir, 'scene.txt');
  const brokenBox = {
    isExecuted: () => false,
    ensureIntentAdmitted: async ({ intentId }) => ({ intentId, status: 'ADMITTED' }),
    markExecuted: async () => { throw new Error('inbox write failure'); },
  };
  const result = await commitProjectTextAndManifest({
    scenePath,
    sceneContent: 'payload-v1',
    revision: 1,
    persistManifest,
    intentInbox: brokenBox,
    intentId: 'commit-scene-1',
  });
  assert.equal(result.success, true, 'the commit landed');
  assert.equal(result.intentExecuted, false);
  assert.ok(result.intentError, 'the execution-mark failure is typed and visible');
  assert.equal(result.intentError.code, 'E_INTENT_EXECUTION_MARK_FAILED');
  assert.equal(JSON.parse(fs.readFileSync(`${scenePath}.commit.json`, 'utf8')).revision, 1);
});
