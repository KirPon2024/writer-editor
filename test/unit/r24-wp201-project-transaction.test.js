'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { bindSaveReceiptToAck } = require('../../src/core/save-receipt-ack-v1.cjs');
const { durableSaveTransaction } = require('../../src/core/save-coordinator-v1.cjs');
const {
  ProjectTransactionError,
  TRANSACTION_PHASE_CHAIN,
  classifyProjectTransactionState,
  commitPathFor,
  commitProjectTransaction,
  journalPathFor,
  readPendingProjectTransactionBinding,
  recoverProjectTransaction,
} = require('../../src/core/project-transaction-v1.cjs');

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp201-'));
  const scenePath = path.join(root, 'scenes', 'scene.txt');
  const manifestPath = path.join(root, 'project.json');
  fs.mkdirSync(path.dirname(scenePath), { recursive: true });
  fs.writeFileSync(scenePath, 'old scene');
  fs.writeFileSync(manifestPath, '{"revision":1}');
  return { root, scenePath, manifestPath };
}

function manifestPublisher() {
  return async ({ manifestPath, expectedText, nextText, revision }) => {
    const current = fs.readFileSync(manifestPath, 'utf8');
    if (current !== expectedText) {
      const error = new Error('manifest CAS');
      error.code = 'E_TEST_MANIFEST_CAS';
      throw error;
    }
    await durableSaveTransaction({ filePath: manifestPath, content: nextText, revision });
  };
}

test('WP201 commits scene and manifest under one durable commit point and ACK', async () => {
  const { scenePath, manifestPath } = sandbox();
  const receipt = await commitProjectTransaction({
    scenePath,
    sceneContent: 'new scene',
    expectedSceneContent: 'old scene',
    manifestPath,
    manifestContent: '{"revision":2}',
    expectedManifestContent: '{"revision":1}',
    revision: 2,
    publishManifest: manifestPublisher(),
  });

  assert.equal(receipt.success, true);
  assert.deepEqual([...receipt.phases], [...TRANSACTION_PHASE_CHAIN]);
  assert.equal(fs.readFileSync(scenePath, 'utf8'), 'new scene');
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), '{"revision":2}');
  assert.equal(fs.existsSync(journalPathFor(manifestPath)), false);
  assert.equal(fs.existsSync(commitPathFor(scenePath)), true);
  assert.equal(classifyProjectTransactionState({ scenePath, manifestPath }).classification, 'NEW_COMMITTED');

  const ack = bindSaveReceiptToAck({
    receipt,
    capturedContent: 'new scene',
    capturedGeneration: 2,
    latestEditGeneration: 2,
  });
  assert.equal(ack.receipt.receiptKind, 'PROJECT_TRANSACTION_V1');
  assert.equal(ack.ack.kind, 'SAVED');
});

test('WP201 refuses scene or manifest CAS drift before an acknowledged publication', async (t) => {
  const base = {
    sceneContent: 'new scene',
    manifestContent: '{"revision":2}',
    revision: 2,
    publishManifest: manifestPublisher(),
  };
  await t.test('scene drift', async () => {
    const { scenePath, manifestPath } = sandbox();
    await assert.rejects(
      commitProjectTransaction({
        ...base,
        scenePath,
        expectedSceneContent: 'different scene',
        manifestPath,
        expectedManifestContent: '{"revision":1}',
      }),
      (error) => error instanceof ProjectTransactionError && error.code === 'E_PROJECT_TRANSACTION_SCENE_CAS',
    );
    assert.equal(fs.existsSync(journalPathFor(manifestPath)), false);
  });
  await t.test('manifest drift', async () => {
    const { scenePath, manifestPath } = sandbox();
    await assert.rejects(
      commitProjectTransaction({
        ...base,
        scenePath,
        expectedSceneContent: 'old scene',
        manifestPath,
        expectedManifestContent: '{"revision":0}',
      }),
      (error) => error instanceof ProjectTransactionError && error.code === 'E_PROJECT_TRANSACTION_MANIFEST_CAS',
    );
    assert.equal(fs.existsSync(journalPathFor(manifestPath)), false);
  });
});

test('WP201 leaves a recoverable journal when manifest authority fails', async () => {
  const { scenePath, manifestPath } = sandbox();
  await assert.rejects(
    commitProjectTransaction({
      scenePath,
      sceneContent: 'new scene',
      expectedSceneContent: 'old scene',
      manifestPath,
      manifestContent: '{"revision":2}',
      expectedManifestContent: '{"revision":1}',
      revision: 2,
      publishManifest: async () => { throw new Error('denied'); },
    }),
    (error) => error.code === 'E_PROJECT_TRANSACTION_MANIFEST_PUBLISH',
  );
  assert.equal(fs.existsSync(journalPathFor(manifestPath)), true);
  const recovery = await recoverProjectTransaction({ scenePath, manifestPath, publishManifest: manifestPublisher() });
  assert.equal(recovery.outcome, 'UNCOMMITTED_ROLLED_BACK');
  assert.equal(fs.readFileSync(scenePath, 'utf8'), 'old scene');
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), '{"revision":1}');
  assert.equal(fs.existsSync(journalPathFor(manifestPath)), false);
});

test('WP201 rejects a journal rebound to another artifact path', async () => {
  const { scenePath, manifestPath } = sandbox();
  const forged = {
    schemaVersion: 'yalken.project-transaction.journal.v1',
    transactionId: '0'.repeat(64),
    revision: 2,
    scenePath: path.join(path.dirname(scenePath), 'other.txt'),
    manifestPath,
    before: { sceneBase64: null, manifestBase64: Buffer.from('{}').toString('base64') },
    after: { sceneBase64: Buffer.from('x').toString('base64'), manifestBase64: Buffer.from('{}').toString('base64') },
  };
  fs.writeFileSync(journalPathFor(manifestPath), JSON.stringify(forged));
  await assert.rejects(
    recoverProjectTransaction({ scenePath, manifestPath, publishManifest: manifestPublisher() }),
    (error) => error.code === 'E_PROJECT_TRANSACTION_JOURNAL_PATH_MISMATCH',
  );
  assert.equal(fs.readFileSync(scenePath, 'utf8'), 'old scene');
});

test('WP201 discovers only a digest-valid pending scene binding inside the manifest boundary', async () => {
  const { scenePath, manifestPath } = sandbox();
  await assert.rejects(
    commitProjectTransaction({
      scenePath,
      sceneContent: 'new scene',
      expectedSceneContent: 'old scene',
      manifestPath,
      manifestContent: '{"revision":2}',
      expectedManifestContent: '{"revision":1}',
      revision: 2,
      publishManifest: async () => { throw new Error('denied'); },
    }),
  );
  const binding = await readPendingProjectTransactionBinding({ manifestPath });
  assert.deepEqual(binding, {
    pending: true,
    scenePath,
    manifestPath,
    transactionId: binding.transactionId,
  });
  assert.match(binding.transactionId, /^[a-f0-9]{64}$/u);

  const forged = JSON.parse(fs.readFileSync(journalPathFor(manifestPath), 'utf8'));
  forged.scenePath = path.join(path.dirname(manifestPath), '..', 'outside.txt');
  fs.writeFileSync(journalPathFor(manifestPath), JSON.stringify(forged));
  await assert.rejects(
    readPendingProjectTransactionBinding({ manifestPath }),
    (error) => error.code === 'E_PROJECT_TRANSACTION_PATH_BOUNDARY',
  );
});

test('WP201 same-revision exact retry is idempotent without blocking a later session save', async () => {
  const { scenePath, manifestPath } = sandbox();
  const input = {
    scenePath,
    sceneContent: 'new scene',
    expectedSceneContent: 'old scene',
    manifestPath,
    manifestContent: '{"revision":2}',
    expectedManifestContent: '{"revision":1}',
    revision: 2,
    publishManifest: manifestPublisher(),
  };
  await commitProjectTransaction(input);
  const retry = await commitProjectTransaction({
    ...input,
    expectedSceneContent: 'new scene',
    expectedManifestContent: '{"revision":2}',
  });
  assert.equal(retry.idempotent, true);
  const laterSession = await commitProjectTransaction({
    ...input,
    sceneContent: 'later session scene',
    expectedSceneContent: 'new scene',
    expectedManifestContent: '{"revision":2}',
  });
  assert.equal(laterSession.idempotent, false);
  assert.equal(fs.readFileSync(scenePath, 'utf8'), 'later session scene');
});

test('live Writer save routes use WP201 while non-project fallback remains WP200', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  assert.match(source, /commitWriterProjectSnapshot\(/u);
  assert.match(source, /save existing project transaction/u);
  assert.match(source, /save new project transaction/u);
  assert.match(source, /save as project transaction/u);
  assert.match(source, /autosave project transaction/u);
  assert.match(source, /return await durableSaveTransaction\(\{ filePath, content, revision \}\);/u);
  assert.ok((source.match(/recoverWriterProjectTransactionForFile\(/gu) || []).length >= 5);
  assert.ok(
    source.indexOf('await recoverPendingWriterProjectTransaction()')
      < source.indexOf('const flowIdentity = await buildFlowStableNodeIdMap()'),
  );
  assert.match(source, /sanitizePayloadWithinProjectRoot\(\{ path: binding\.scenePath \}, \['path'\]\)/u);
  assert.ok(
    source.indexOf('await recoverWriterProjectTransactionForFile(lastFilePath)')
      < source.indexOf('fileManager.readFile(lastFilePath)'),
  );
  assert.doesNotMatch(source, /commitProjectTextAndManifest\(/u);
});
