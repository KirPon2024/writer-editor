'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ACK_OUTCOMES } = require('../../src/core/autosave-generation-v1.cjs');
const { SAVE_ACK_KINDS } = require('../../src/core/dirty-admission-v1.cjs');
const { commitProjectTextAndManifest } = require('../../src/core/project-commit-v1.cjs');
const { durableSaveTransaction } = require('../../src/core/save-coordinator-v1.cjs');
const {
  SaveReceiptAckError,
  bindSaveReceiptToAck,
  validateSaveReceipt,
} = require('../../src/core/save-receipt-ack-v1.cjs');

const sandbox = () => fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp200-'));
const sha256hex = (content) => crypto.createHash('sha256').update(content).digest('hex');

test('P2 receipt binds exact captured bytes and generation to a SAVED ack', async () => {
  const dir = sandbox();
  const content = 'Writer draft\nΣσς 👨‍👩‍👧‍👦';
  const receipt = await durableSaveTransaction({
    filePath: path.join(dir, 'scene.txt'),
    content,
    revision: 7,
  });

  const binding = bindSaveReceiptToAck({
    receipt,
    capturedContent: content,
    capturedGeneration: 7,
    latestEditGeneration: 7,
  });

  assert.equal(binding.receipt.receiptKind, 'DURABLE_SAVE_V1');
  assert.equal(binding.receipt.digest, sha256hex(content));
  assert.equal(binding.receipt.bytes, Buffer.byteLength(content, 'utf8'));
  assert.equal(binding.ack.kind, SAVE_ACK_KINDS.SAVED);
  assert.equal(binding.ack.savedGeneration, 7);
});

test('P3 project receipt is accepted only for its exact scene digest and revision', async () => {
  const dir = sandbox();
  const content = 'project scene';
  const receipt = await commitProjectTextAndManifest({
    scenePath: path.join(dir, 'scene.txt'),
    sceneContent: content,
    revision: 3,
    persistManifest: async () => ({ persisted: false }),
  });

  const binding = bindSaveReceiptToAck({
    receipt,
    capturedContent: content,
    capturedGeneration: 3,
    latestEditGeneration: 3,
  });
  assert.equal(binding.receipt.receiptKind, 'PROJECT_COMMIT_V1');
  assert.equal(binding.ack.kind, SAVE_ACK_KINDS.SAVED);
});

test('a valid durable receipt for a stale capture protects the newer generation', async () => {
  const content = 'captured generation';
  const receipt = await durableSaveTransaction({
    filePath: path.join(sandbox(), 'scene.txt'),
    content,
    revision: 4,
  });
  const binding = bindSaveReceiptToAck({
    receipt,
    capturedContent: content,
    capturedGeneration: 4,
    latestEditGeneration: 5,
  });
  assert.equal(binding.ack.kind, SAVE_ACK_KINDS.PROTECTED);
  assert.equal(binding.ack.reason, 'STALE_GENERATION');
  assert.notEqual(binding.ack.reason, ACK_OUTCOMES.CLEAR_DIRTY);
});

test('missing, failed, incomplete, stale, forged and byte-mismatched receipts fail closed', async (t) => {
  const content = 'exact bytes';
  const receipt = await durableSaveTransaction({
    filePath: path.join(sandbox(), 'scene.txt'),
    content,
    revision: 9,
  });
  const cases = [
    ['missing', null, 'E_SAVE_RECEIPT_REQUIRED'],
    ['failed', { ...receipt, success: false }, 'E_SAVE_RECEIPT_SUCCESS_REQUIRED'],
    ['incomplete phases', { ...receipt, phases: receipt.phases.slice(0, -1) }, 'E_SAVE_RECEIPT_PHASE_CHAIN_INVALID'],
    ['wrong revision', { ...receipt, revision: 8 }, 'E_SAVE_RECEIPT_REVISION_MISMATCH'],
    ['forged digest', { ...receipt, digest: '0'.repeat(64) }, 'E_SAVE_RECEIPT_DIGEST_MISMATCH'],
    ['wrong byte count', { ...receipt, bytes: receipt.bytes + 1 }, 'E_SAVE_RECEIPT_BYTES_MISMATCH'],
  ];

  for (const [name, candidate, code] of cases) {
    await t.test(name, () => {
      assert.throws(
        () => validateSaveReceipt({
          receipt: candidate,
          capturedContent: content,
          capturedGeneration: 9,
        }),
        (error) => error instanceof SaveReceiptAckError && error.code === code,
      );
    });
  }
});
