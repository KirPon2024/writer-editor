'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function makeLedger() {
  const operations = [];
  for (let index = 0; index < 25; index += 1) {
    operations.push({
      id: `op-${String(index + 1).padStart(3, '0')}`,
      family: index % 5 === 0 ? 'root_comment' : 'tracked_text_edit',
      round: (index % 5) + 1,
      sceneId: `scene-${String(index % 21).padStart(2, '0')}`,
      expectedOutcome: 'SAFE_APPLY',
    });
  }
  for (let index = 0; index < 4; index += 1) {
    operations.push({
      id: `neg-${String(index + 1).padStart(3, '0')}`,
      family: 'negative_probe',
      round: 0,
      sceneId: `scene-${String(index).padStart(2, '0')}`,
      expectedOutcome: 'REJECT',
    });
  }
  return {
    schemaVersion: 'yalken.rtk.word.c5v2.fullbook-ledger.v1',
    topology: 'one-full-manuscript-project-cumulative-rounds',
    roundCount: 5,
    gates: { ok: true, failures: [] },
    ledgerDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    operations,
  };
}

test('C5V2 round plan requires one full-manuscript product export route per cumulative editorial round', async () => {
  const {
    buildC5V2RoundPlan,
  } = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-round-checkpoint.mjs'));
  const plan = buildC5V2RoundPlan(makeLedger(), { chunkSize: 3 });

  assert.equal(plan.schemaVersion, 'yalken.rtk.word.c5v2.fullbook-round-runner.v1');
  assert.equal(plan.topology, 'single-21-scene-project-one-full-book-docx-per-editorial-round');
  assert.equal(plan.productExportCommandId, 'cmd.project.review.exportFullManuscriptDocxReviewPacket');
  assert.equal(plan.rounds.length, 5);
  assert.equal(plan.negativeForks.length, 4);
  assert.equal(plan.cumulativePositiveOperationCount, 25);
  for (const round of plan.rounds) {
    assert.equal(round.sourceProductCommandId, 'cmd.project.review.exportFullManuscriptDocxReviewPacket');
    assert.deepEqual(round.route, [
      'product-ui-command-export',
      'physical-word-open-edit-native-save',
      'authenticated-intake-quarantine-preview',
      'explicit-decision',
      'command-kernel-apply',
      'atomic-recovery',
      'close-reopen',
      'canonical-readback',
      'replay',
    ]);
    assert.equal(round.operationCount, 5);
    assert.equal(round.chunks.length, 2);
    assert.equal(round.chunks.every((chunk) => chunk.attemptPolicy === 'partial-chunk-reruns-with-new-attempt-id'), true);
  }
  assert.deepEqual(plan.rounds.map((round) => round.cumulativeOperationCount), [5, 10, 15, 20, 25]);
});

test('C5V2 chunk checkpoints are fsynced immutable digest records and resume after killpoint without losing completed chunks', async () => {
  const {
    buildC5V2RoundPlan,
    readC5V2ResumeState,
    writeC5V2ChunkCheckpoint,
  } = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-round-checkpoint.mjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-c5v2-checkpoints-'));
  const ledger = makeLedger();
  const plan = buildC5V2RoundPlan(ledger, { chunkSize: 3 });
  const first = plan.rounds[0].chunks[0];
  const second = plan.rounds[0].chunks[1];

  const firstWrite = writeC5V2ChunkCheckpoint(path.join(dir, `${first.chunkId}.json`), {
    runId: 'run-c5v2',
    attemptId: `${first.chunkId}-attempt-01`,
    exactHead: 'ea00dd9d7fe2de94c3129fa7ca32f4221f8fe3a0',
    ledgerDigest: ledger.ledgerDigest,
    roundId: 'round-01',
    chunkId: first.chunkId,
    completedOperationIds: first.operationIds,
    requestKeys: first.requestKeys,
    effectKeys: first.effectKeys,
    sourceDocxSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    returnedDocxSha256: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    oracleDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  });
  assert.equal(firstWrite.checkpoint.schemaVersion, 'yalken.rtk.word.c5v2.fullbook-chunk-checkpoint.v1');
  assert.equal(firstWrite.checkpoint.immutableLedgerDigest, ledger.ledgerDigest);
  assert.equal(firstWrite.checkpoint.productExportCommandId, 'cmd.project.review.exportFullManuscriptDocxReviewPacket');
  assert.equal(firstWrite.checkpoint.checkpointDigest.startsWith('sha256:'), true);
  assert.equal(fs.existsSync(firstWrite.write.path), true);

  const resumeAfterKillpoint = readC5V2ResumeState(dir, { ledgerDigest: ledger.ledgerDigest, roundPlan: plan });
  assert.deepEqual(resumeAfterKillpoint.completedOperationIds, first.operationIds);
  assert.equal(resumeAfterKillpoint.nextChunk.chunkId, second.chunkId);
  assert.equal(resumeAfterKillpoint.nextChunk.nextAttemptId, `${second.chunkId}-attempt-01`);

  writeC5V2ChunkCheckpoint(path.join(dir, `${second.chunkId}.json`), {
    runId: 'run-c5v2',
    attemptId: `${second.chunkId}-attempt-02`,
    exactHead: 'ea00dd9d7fe2de94c3129fa7ca32f4221f8fe3a0',
    ledgerDigest: ledger.ledgerDigest,
    roundId: 'round-01',
    chunkId: second.chunkId,
    completedOperationIds: second.operationIds,
    requestKeys: second.requestKeys,
    effectKeys: second.effectKeys,
    sourceDocxSha256: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    returnedDocxSha256: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    oracleDigest: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  });
  const resumeAfterSecond = readC5V2ResumeState(dir, { ledgerDigest: ledger.ledgerDigest, roundPlan: plan });
  assert.equal(resumeAfterSecond.completedChunks.length, 2);
  assert.deepEqual(resumeAfterSecond.completedOperationIds, [...first.operationIds, ...second.operationIds].sort());
  assert.equal(resumeAfterSecond.nextChunk.chunkId, plan.rounds[1].chunks[0].chunkId);
});

test('C5V2 physical Word chunks preserve root-first and descending-range authority with cumulative readback counts', async () => {
  const {
    buildWordLedgerChunkPlan,
    buildWordScript,
  } = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  const ledger = {
    masterLedgerDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    operations: [
      { id: 'replace-low', family: 'tracked_replace', quote: 'aa', replacementText: 'bb', wordRange: { start: 10, end: 12 } },
      { id: 'root-high', family: 'root_comment', quote: 'cc', wordRange: { start: 90, end: 92 } },
      { id: 'delete-high', family: 'tracked_delete', quote: 'dd', wordRange: { start: 70, end: 72 } },
      { id: 'insert-mid', family: 'tracked_insert', quote: 'ee', replacementText: 'ff', wordRange: { start: 40, end: 42 } },
      { id: 'reply-typed', family: 'reply_attempt', expectedOutcome: 'MANUAL', physicalAction: 'typed-limit' },
    ],
  };
  const plan = buildWordLedgerChunkPlan(ledger, 2);
  assert.deepEqual(plan.flatMap((chunk) => chunk.operations.map((operation) => operation.id)), [
    'root-high',
    'delete-high',
    'insert-mid',
    'replace-low',
    'reply-typed',
  ]);
  assert.deepEqual(plan.map((chunk) => chunk.expectedNativeRevisionCount), [1, 5, 5]);
  assert.deepEqual(plan.map((chunk) => chunk.minimumNativeRevisionCount), [1, 3, 3]);
  assert.deepEqual(plan.map((chunk) => chunk.expectedRootMarkers.length), [1, 1, 1]);
  const continuation = buildWordScript({
    sourcePath: '/generated-evidence/source.docx',
    returnedPath: '/generated-word-work/returned.docx',
    artifactReturnedPath: '/generated-evidence/returned.docx',
    ledger: { ...ledger, operations: plan[1].operations },
    initializeFromSource: false,
    resetCheckpoint: false,
    expectedNativeRevisionCount: plan[1].expectedNativeRevisionCount,
    expectedRootMarkers: plan[1].expectedRootMarkers,
    chunkId: plan[1].chunkId,
  });
  assert.doesNotMatch(continuation, /do shell script "\/bin\/cp " & quoted form of "\/generated-evidence\/source\.docx"/u);
  assert.doesNotMatch(continuation, /my yResetCheckpoint\(yCheckpointPath\)/u);
  assert.match(continuation, /CHUNK_START:word-chunk-002/u);
  assert.match(continuation, /FINAL_NATIVE_REVISION_COUNT_MISMATCH:" & yRevisionCount & ":5/u);
});
