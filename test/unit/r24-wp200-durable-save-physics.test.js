'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { SAVE_ACK_KINDS } = require('../../src/core/dirty-admission-v1.cjs');
const { classifySaveArtifacts, durableSaveTransaction } = require('../../src/core/save-coordinator-v1.cjs');
const { bindSaveReceiptToAck } = require('../../src/core/save-receipt-ack-v1.cjs');

const sandbox = () => fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp200-physics-'));

test('main save paths consume durable receipts and never use generic atomic success for dirty clear', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /function acknowledgeMainOwnedSave\(saveReceipt, capturedContent, capturedGeneration\)/);
  assert.match(main, /bindSaveReceiptToAck\(\{/);
  assert.equal((main.match(/acknowledgeMainOwnedSave\(/g) || []).length, 7);
  assert.match(main, /commitWriterProjectSnapshot\(/);
  assert.match(main, /return await durableSaveTransaction\(\{ filePath, content, revision \}\);/);
  assert.doesNotMatch(main, /fileManager\.writeFileAtomic\(saveTargetPath, content\)/);
  assert.doesNotMatch(main, /acknowledgeMainOwnedSave\(snapshot\.generation\)/);
});

test('unicode save/readback/ack remains byte exact across repeated bounded writes', async () => {
  const dir = sandbox();
  const started = performance.now();
  for (let generation = 1; generation <= 24; generation += 1) {
    const content = `g${generation}: İ Σσς 👨‍👩‍👧‍👦\nline`;
    const filePath = path.join(dir, `scene-${generation}.txt`);
    const receipt = await durableSaveTransaction({ filePath, content, revision: generation });
    const binding = bindSaveReceiptToAck({
      receipt,
      capturedContent: content,
      capturedGeneration: generation,
      latestEditGeneration: generation,
    });
    assert.equal(binding.ack.kind, SAVE_ACK_KINDS.SAVED);
    assert.equal(fs.readFileSync(filePath, 'utf8'), content);
  }
  assert.ok(performance.now() - started < 5000, 'bounded save receipt validation stays within the local gate budget');
});

test('crash residue remains typed and can never manufacture an acknowledgement receipt', () => {
  const dir = sandbox();
  const filePath = path.join(dir, 'scene.txt');
  fs.writeFileSync(path.join(dir, 'scene.txt.p2-1-abcdef.tmp'), 'prepared');
  assert.equal(classifySaveArtifacts(filePath).classification, 'RESUMABLE_PREPARED');
  assert.throws(
    () => bindSaveReceiptToAck({
      receipt: { success: true, revision: 1, phases: ['ADMIT'] },
      capturedContent: 'prepared',
      capturedGeneration: 1,
      latestEditGeneration: 1,
    }),
    (error) => error.code === 'E_SAVE_RECEIPT_PHASE_CHAIN_INVALID',
  );
});
