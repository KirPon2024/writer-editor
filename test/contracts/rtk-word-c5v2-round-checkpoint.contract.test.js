'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

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

function sha256Bytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

test('C5V2 resume checkpoints reject wrong head, round, digest, forged operations, request keys and artifact hashes', async () => {
  const {
    buildC5V2ChunkCheckpoint,
    buildC5V2RoundPlan,
    readC5V2ResumeState,
  } = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-round-checkpoint.mjs'));
  const ledger = makeLedger();
  const plan = buildC5V2RoundPlan(ledger, { chunkSize: 3 });
  const chunk = plan.rounds[0].chunks[0];
  const exactHead = 'ea00dd9d7fe2de94c3129fa7ca32f4221f8fe3a0';
  const runId = 'run-c5v2-strict';

  function build(input = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-c5v2-strict-checkpoint-'));
    const sourcePath = path.join(dir, 'source.docx');
    const returnedPath = path.join(dir, 'returned.docx');
    fs.writeFileSync(sourcePath, Buffer.from('source-bytes'));
    fs.writeFileSync(returnedPath, Buffer.from('returned-bytes'));
    const checkpoint = buildC5V2ChunkCheckpoint({
      runId,
      attemptId: `${chunk.chunkId}-attempt-01`,
      exactHead,
      ledgerDigest: ledger.ledgerDigest,
      roundId: 'round-01',
      chunkId: chunk.chunkId,
      completedOperationIds: chunk.operationIds,
      requestKeys: chunk.requestKeys,
      effectKeys: chunk.effectKeys,
      sourceDocxPath: sourcePath,
      sourceDocxSha256: sha256Bytes(fs.readFileSync(sourcePath)),
      returnedDocxPath: returnedPath,
      returnedDocxSha256: sha256Bytes(fs.readFileSync(returnedPath)),
      oracleDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      ...input,
    });
    writeJson(path.join(dir, `${chunk.chunkId}.json`), checkpoint);
    return dir;
  }

  const accepted = readC5V2ResumeState(build(), {
    ledgerDigest: ledger.ledgerDigest,
    roundPlan: plan,
    exactHead,
    runId,
    requireArtifactPaths: true,
  });
  assert.equal(accepted.completedChunks.length, 1);
  assert.deepEqual(accepted.completedOperationIds, chunk.operationIds);

  assert.throws(() => readC5V2ResumeState(build({ exactHead: 'bb00dd9d7fe2de94c3129fa7ca32f4221f8fe3a0' }), {
    ledgerDigest: ledger.ledgerDigest,
    roundPlan: plan,
    exactHead,
    runId,
    requireArtifactPaths: true,
  }), /C5V2_CHECKPOINT_HEAD_MISMATCH/u);

  assert.throws(() => readC5V2ResumeState(build({ roundId: 'round-02' }), {
    ledgerDigest: ledger.ledgerDigest,
    roundPlan: plan,
    exactHead,
    runId,
    requireArtifactPaths: true,
  }), /C5V2_CHECKPOINT_ROUND_MISMATCH/u);

  assert.throws(() => readC5V2ResumeState(build({ ledgerDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }), {
    ledgerDigest: ledger.ledgerDigest,
    roundPlan: plan,
    exactHead,
    runId,
    requireArtifactPaths: true,
  }), /C5V2_CHECKPOINT_LEDGER_DIGEST_MISMATCH/u);

  assert.throws(() => readC5V2ResumeState(build({ completedOperationIds: ['forged-op-a', ...chunk.operationIds.slice(1)] }), {
    ledgerDigest: ledger.ledgerDigest,
    roundPlan: plan,
    exactHead,
    runId,
    requireArtifactPaths: true,
  }), /C5V2_CHECKPOINT_OPERATION_IDS_MISMATCH/u);

  assert.throws(() => readC5V2ResumeState(build({ requestKeys: ['request:forged', ...chunk.requestKeys.slice(1)] }), {
    ledgerDigest: ledger.ledgerDigest,
    roundPlan: plan,
    exactHead,
    runId,
    requireArtifactPaths: true,
  }), /C5V2_CHECKPOINT_REQUEST_KEYS_MISMATCH/u);

  assert.throws(() => readC5V2ResumeState(build({ sourceDocxSha256: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' }), {
    ledgerDigest: ledger.ledgerDigest,
    roundPlan: plan,
    exactHead,
    runId,
    requireArtifactPaths: true,
  }), /C5V2_CHECKPOINT_SOURCEDOCXSHA256_MISMATCH/u);

  const malformedDigestDir = build();
  const malformedDigestPath = path.join(malformedDigestDir, `${chunk.chunkId}.json`);
  const malformedDigest = JSON.parse(fs.readFileSync(malformedDigestPath, 'utf8'));
  malformedDigest.checkpointDigest = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  writeJson(malformedDigestPath, malformedDigest);
  assert.throws(() => readC5V2ResumeState(malformedDigestDir, {
    ledgerDigest: ledger.ledgerDigest,
    roundPlan: plan,
    exactHead,
    runId,
    requireArtifactPaths: true,
  }), /C5V2_CHECKPOINT_DIGEST_MISMATCH/u);
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
    minimumNativeRevisionCount: plan[1].minimumNativeRevisionCount,
    expectedRootMarkers: plan[1].expectedRootMarkers,
    chunkId: plan[1].chunkId,
  });
  assert.doesNotMatch(continuation, /my yShell\("\/bin\/cp " & quoted form of "\/generated-evidence\/source\.docx"/u);
  assert.doesNotMatch(continuation, /my yResetCheckpoint\(yCheckpointPath\)/u);
  assert.match(continuation, /CHUNK_START:word-chunk-002/u);
  assert.match(continuation, /set my yOverallDeadline to \(current date\) \+ 420/u);
  assert.match(continuation, /REVISION_COUNT_COALESCING_DIAGNOSTIC/u);
  assert.match(continuation, /FINAL_NATIVE_REVISION_COUNT_BELOW_COALESCING_FLOOR:" & yRevisionCount & ":3:5/u);
  assert.doesNotMatch(continuation, /then error "FINAL_NATIVE_REVISION_COUNT_BELOW_COALESCING_FLOOR/u);
  const semanticReadbackIndex = continuation.indexOf('my yCheckpoint(yCheckpointPath, "FINAL_SEMANTIC_READBACK"');
  const mirrorSaveIndex = continuation.indexOf('my yCheckpoint(yCheckpointPath, "EVIDENCE_MIRROR_SAVE_BEFORE"');
  const mirrorVerifiedIndex = continuation.indexOf('my yCheckpoint(yCheckpointPath, "EVIDENCE_MIRROR_VERIFIED"');
  const finalReopenCloseIndex = continuation.indexOf('my yCheckpoint(yCheckpointPath, "FINAL_REOPEN_CLOSE_AFTER"');
  assert.ok(semanticReadbackIndex > -1, 'semantic readback checkpoint must be generated');
  assert.ok(mirrorSaveIndex > semanticReadbackIndex, 'evidence mirror save must follow semantic readback');
  assert.ok(mirrorVerifiedIndex > mirrorSaveIndex, 'evidence mirror verification must follow live save');
  assert.ok(finalReopenCloseIndex > mirrorVerifiedIndex, 'final close must happen after durable evidence mirror');
  assert.match(continuation, /set yFind to find object of selection/u);
  assert.match(continuation, /execute find yFind find text yQuote[\s\S]*wrap find find stop/u);
  assert.match(continuation, /on yFindRangeWithin\(yDoc, yLocator, yQuote\)/u);
  assert.match(continuation, /if yLocator is yQuote then return yLocatorRange/u);
  assert.match(continuation, /set yRange to my yFindRangeWithin\(yDoc, "ee", "ee"\)/u);
  assert.match(continuation, /set yRange to my yFindRangeWithin\(yDoc, "aa", "aa"\)/u);
  assert.doesNotMatch(continuation, /on yRecordedOperationStatus\(yOpsDone, yOperationId\)/u);
  assert.match(continuation, /NATIVE_READBACK_REPORTED_STATUS_MISMATCH:insert-mid:/u);
  assert.match(continuation, /if yOpsDone does not contain \("OP\|insert-mid\|EXACT" & linefeed\) then error/u);
  assert.doesNotMatch(continuation, /offset of yQuote/u);
});

test('C5V2 cumulative controller blocks the next export until the complete round oracle gate is green', async () => {
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  assert.equal(canary.hasC5V2CompletedRoundEvidence({ oracleCapture: { ok: false } }), true);
  assert.equal(canary.hasC5V2CompletedRoundEvidence(null), false);
  assert.equal(canary.hasC5V2CompletedRoundEvidence([]), false);
  const policy = canary.getC5V2OperationStatusPolicyBinding();
  const returnApplyCandidateAuthority = canary.buildC5V2ReturnApplyCandidateAuthority({
    roundId: 'round-01',
    returnApply: { activation: { textChangeScopeDiagnostics: [] } },
  });
  const candidateAuthorityRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c5v2-anchor-root-'));
  const candidateAuthorityPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'c5v2-anchor-artifact-')), 'return-apply-candidate-authority.json');
  fs.writeFileSync(candidateAuthorityPath, `${JSON.stringify(returnApplyCandidateAuthority, null, 2)}\n`, 'utf8');
  canary.initializeC5V2CandidateAuthorityRoot({
    authorityRoot: candidateAuthorityRoot,
    createIfMissing: true,
  });
  const ledger = { operations: [] };
  const returnApplyCandidateAuthorityAnchorValidation = canary.writeC5V2ReturnApplyCandidateAuthorityAnchor({
    authorityRoot: candidateAuthorityRoot,
    campaignId: 'campaign-current',
    roundId: 'round-01',
    exactHead: 'head-current',
    corpusDigest: 'sha256:corpus-current',
    ledger,
    candidateAuthority: returnApplyCandidateAuthority,
    candidateAuthorityPath,
  });
  assert.equal(returnApplyCandidateAuthorityAnchorValidation.ok, true);
  const completedRoundReuseBinding = canary.buildC5V2CompletedRoundReuseBinding({
    roundId: 'round-01',
    exactHead: 'head-current',
    canaryScriptSha256: 'sha256:script-current',
    operationStatusPolicyVersion: policy.version,
    operationStatusPolicyDigest: policy.digest,
    corpusDigest: 'sha256:corpus-current',
    ledger,
    ledgerContentDigest: canary.resolveC5V2LedgerReuseDigest(ledger),
    wordOutputSha256: 'sha256:word-output-current',
    completeRoundOracleSha256: 'sha256:oracle-current',
    returnedReadySha256: 'sha256:ready-current',
    sourceDocxSha256: 'sha256:source-current',
    returnedDocxSha256: 'sha256:return-current',
    yalkenTruthSha256: 'sha256:truth-current',
    returnApplyCandidateAuthority,
    returnApplyCandidateAuthoritySha256: 'sha256:return-apply-candidate-authority-current',
    returnApplyCandidateAuthorityAnchor: returnApplyCandidateAuthorityAnchorValidation.anchor,
    returnApplyCandidateAuthorityAnchorArtifact: returnApplyCandidateAuthorityAnchorValidation.anchorArtifact,
    returnApplyCandidateAuthorityAnchorValidation,
    exactLedgerBinding: {
      ok: true,
      expectedOperationCount: 0,
      matchedOperationCount: 0,
      matchedChangeCount: 0,
      excludedCandidateCount: 0,
      exactApplyTextChangeIdsByScene: {},
      exactOperationBindings: [],
      unmatchedExpectedOperationIds: [],
      duplicateExpectedSignatureOperationIds: [],
      duplicateCandidateBindingIds: [],
      missingDiagnosticCandidateIds: [],
    },
  });
  const green = canary.buildC5V2CompleteRoundOracleGate({
    roundId: 'round-01',
    wordParsed: { scalars: { WORD_STATUS: 'PASS' } },
    nativeLifecycleVerification: { ok: true },
    oracleProbe: { ok: true, oracleDigest: 'sha256:oracle' },
    returnApply: { ok: true },
    completedRoundReuseBinding,
  });
  assert.equal(green.ok, true);
  assert.deepEqual(green.failures, []);

  const blocked = canary.buildC5V2CompleteRoundOracleGate({
    roundId: 'round-01',
    wordParsed: { scalars: { WORD_STATUS: 'PASS' } },
    nativeLifecycleVerification: { ok: true },
    oracleProbe: { ok: false },
    returnApply: { ok: true },
    completedRoundReuseBinding,
  });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.failures, ['COMPLETE_ROUND_ORACLE_NOT_GREEN']);

  const captureFailure = canary.captureC5V2CompleteRoundOracle({}, {
    buildOracleProbe() {
      const error = new Error('C5V2_PRODUCT_SCENE_OBSERVABLE_PAYLOAD_INVALID:DOC_BLOCK_TRUNCATED');
      error.code = 'DOC_BLOCK_TRUNCATED';
      throw error;
    },
  });
  assert.equal(captureFailure.ok, false);
  assert.equal(captureFailure.oracleProbe.ok, false);
  assert.equal(captureFailure.oracleProbe.error.code, 'DOC_BLOCK_TRUNCATED');
  assert.match(captureFailure.oracleProbe.oracleDigest, /^sha256:[a-f0-9]{64}$/u);
  const failedCaptureGate = canary.buildC5V2CompleteRoundOracleGate({
    roundId: 'round-02',
    wordParsed: { scalars: { WORD_STATUS: 'PASS' } },
    nativeLifecycleVerification: { ok: true },
    oracleProbe: captureFailure.oracleProbe,
    oracleCapture: captureFailure,
    returnApply: { ok: true },
    completedRoundReuseBinding,
  });
  assert.equal(failedCaptureGate.ok, false);
  assert.deepEqual(failedCaptureGate.failures, [
    'ROUND_ORACLE_VALIDATION_ERROR:DOC_BLOCK_TRUNCATED',
    'COMPLETE_ROUND_ORACLE_NOT_GREEN',
  ]);

  const source = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'),
    'utf8',
  );
  assert.match(source, /COMPLETE_ROUND_ORACLE_GATE_NOT_DURABLY_VISIBLE/u);
  assert.match(source, /phase: 'round-oracle-gate'/u);
  assert.match(source, /await validateRound\(roundIndex, round/u);
  assert.match(source, /writeJsonAtomicDurable\(round\.oracleGatePath, roundOracleGate\)/u);
  assert.match(source, /C5V2_CUMULATIVE_COMPLETE_ROUND_ORACLE_FAILED/u);
  assert.match(source, /captureC5V2CompleteRoundOracle/u);
  assert.match(source, /hasCompletedRoundEvidence/u);
  assert.match(source, /deriveC5V2LedgerBoundExactSummary\(returnApply/u);
  assert.doesNotMatch(source, /returnApply\?\.activation\?\.exactApplyTextChangeIdsByScene/u);
  assert.match(source, /return-apply-candidate-authority\.json/u);
  assert.match(source, /writeJsonAtomicDurable\([\s\S]*returnApplyCandidateAuthorityPath/u);
  assert.match(source, /C5V2_RETURN_APPLY_CANDIDATE_AUTHORITY_CURRENT_RETURN_MISMATCH/u);
  assert.match(source, /restoreC5V2ProductTruthFromReopenedArtifact/u);
  assert.match(source, /C5V2_RESUME_REHYDRATE_TRUTH_ARTIFACT_MISSING/u);
  assert.match(source, /writeChildFileAtomicDurable\(context\.nodePath, Buffer\.from\(scene\.rawContent, 'utf8'\)\)/u);
  assert.match(source, /writeChildFileAtomicDurable\(statePath, Buffer\.from\(stateRecord\.rawContent, 'utf8'\)\)/u);
  assert.match(source, /phase: 'resume-rehydrate'/u);
  const authorityPersistIndex = source.indexOf('returnApplyCandidateAuthorityArtifact = writeJsonAtomicDurable');
  const authorityAnchorIndex = source.indexOf('writeC5V2ReturnApplyCandidateAuthorityAnchor', authorityPersistIndex);
  const completedBindingIndex = source.indexOf('const completedRoundReuseBinding = buildC5V2CompletedRoundReuseBinding', authorityAnchorIndex);
  const durableCompletedReplayIndex = source.indexOf("exportTrigger: 'durable-completed-round-replay'");
  const resumedReturnApplyIndex = source.indexOf("phase: 'return-apply'", durableCompletedReplayIndex);
  const resumeRehydrateIndex = source.indexOf("phase: 'resume-rehydrate'", resumedReturnApplyIndex);
  const resumedOracleGateIndex = source.indexOf("phase: 'round-oracle-gate'", resumeRehydrateIndex);
  assert.ok(authorityPersistIndex > -1, 'raw returnApply candidate authority must be persisted durably');
  assert.ok(authorityAnchorIndex > authorityPersistIndex, 'main-owned keyed anchor must follow raw candidate persistence');
  assert.ok(completedBindingIndex > authorityAnchorIndex, 'keyed anchor persistence must precede completed gate binding');
  assert.ok(durableCompletedReplayIndex > -1, 'resume branch must identify durable completed-round replay');
  assert.ok(resumedReturnApplyIndex > durableCompletedReplayIndex, 'completed replay must rebuild return-apply evidence first');
  assert.ok(resumeRehydrateIndex > resumedReturnApplyIndex, 'completed replay must restore reopened product truth before round gate reuse');
  assert.ok(resumedOracleGateIndex > resumeRehydrateIndex, 'round gate reuse must happen only after rehydration');
});
