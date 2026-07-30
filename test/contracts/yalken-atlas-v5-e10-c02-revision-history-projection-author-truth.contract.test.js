const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

const PROJECT_ID = 'project-e10-c02-history';
const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);
const HEX_C = 'c'.repeat(64);
const HEX_D = 'd'.repeat(64);

async function buildEventLog() {
  const collab = await loadModule('src/collab/eventLog.mjs');
  const first = collab.appendEventLogEntry({
    eventLog: collab.createEmptyEventLog(),
    entry: {
      opId: 'evt-project-create',
      ts: '2026-07-30T16:20:00.000Z',
      actorId: 'writer-A',
      commandId: 'project.create',
      payloadHash: `sha256:${HEX_A}`,
      preStateHash: `sha256:${HEX_B}`,
      postStateHash: `sha256:${HEX_C}`,
    },
  });
  assert.equal(first.ok, true);
  const second = collab.appendEventLogEntry({
    eventLog: first.eventLog,
    entry: {
      opId: 'evt-language-tag',
      ts: '2026-07-30T16:20:01.000Z',
      actorId: 'writer-A',
      commandId: 'atlas.languageTag.set',
      payloadHash: `sha256:${HEX_B}`,
      preStateHash: `sha256:${HEX_C}`,
      postStateHash: `sha256:${HEX_D}`,
    },
  });
  assert.equal(second.ok, true);
  const third = collab.appendEventLogEntry({
    eventLog: second.eventLog,
    entry: {
      opId: 'evt-text-edit',
      ts: '2026-07-30T16:20:02.000Z',
      actorId: 'writer-A',
      commandId: 'project.applyTextEdit',
      payloadHash: `sha256:${HEX_C}`,
      preStateHash: `sha256:${HEX_D}`,
      postStateHash: `sha256:${HEX_A}`,
    },
  });
  assert.equal(third.ok, true);
  return third.eventLog;
}

function buildReviewOutcome() {
  return {
    schemaVersion: 'yalken.rtk.exact-apply-outcome.v2',
    roundId: 'round-1',
    requestKey: `sha256:${HEX_A}`,
    effectKey: `sha256:${HEX_B}`,
    envelopeDigest: `sha256:${HEX_C}`,
    lifecycleState: 'TERMINAL',
    status: 'APPLIED_ONCE',
    reason: 'RTK_EXACT_APPLICABLE',
    writerReason: 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_APPLIED',
    writerReceipt: {
      schemaVersion: 'revision-bridge.exact-text-min-safe-write.receipt.v1',
      operationId: 'op-review-apply-1',
      projectId: PROJECT_ID,
      sessionId: 'session-1',
      sceneId: 'scene-1',
      changeId: 'change-1',
      baselineHashBefore: 'baseline-1',
      operationKind: 'replaceExactText',
      writeStatus: 'applied',
      backupId: 'backup-1',
      writtenAt: '2026-07-30T16:20:03.000Z',
      inputHash: HEX_A,
      outputHash: HEX_B,
      recovery: {
        snapshotPath: '/absolute/path/must/not/leak',
        snapshotHashMatchesInput: true,
      },
      reason: 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_APPLIED',
    },
    outcomeDigest: `sha256:${HEX_D}`,
  };
}

test('E10 C02: revision history packet projects event log command receipts and review apply receipts without author truth leakage', async () => {
  const history = await loadModule('src/derived/commentsHistory/deriveHistory.mjs');
  const eventLog = await buildEventLog();
  const packet = history.buildRevisionHistoryProjectionPacket({
    projectId: PROJECT_ID,
    eventLog,
    commandReceipts: [{
      receiptId: 'kernel-receipt-1',
      operationId: 'cmd-op-1',
      commandId: 'atlas.languageTag.set',
      status: 'applied',
      appliedAt: '2026-07-30T16:20:04.000Z',
      preStateHash: `sha256:${HEX_C}`,
      postStateHash: `sha256:${HEX_D}`,
      authorTruthValue: 'must-not-copy',
    }],
    reviewApplyReceipts: [buildReviewOutcome()],
    authorTruthSnapshot: {
      languageTags: { secretRange: 'must-not-copy-author-truth-value' },
    },
  });

  assert.equal(packet.schemaVersion, history.HISTORY_PROJECTION_PACKET_SCHEMA);
  assert.match(packet.historyProjectionHash, /^[a-f0-9]{64}$/u);
  assert.equal(packet.summary.projectedEntryCount, 5);
  assert.equal(packet.summary.eventLogEntryCount, 3);
  assert.equal(packet.summary.commandReceiptRefCount, 1);
  assert.equal(packet.summary.reviewApplyReceiptRefCount, 1);
  assert.equal(packet.summary.authorTruthValueIncluded, false);
  assert.equal(packet.authority.projectionOnly, true);
  assert.equal(packet.authority.projectTruthMutation, false);

  const languageEvent = packet.entries.find((entry) => entry.opId === 'evt-language-tag');
  assert.equal(languageEvent.truthDomain, 'productCore.authorTruth');
  assert.equal(languageEvent.authorTruthValueIncluded, false);
  assert.equal(languageEvent.canWriteProject, false);

  const textEvent = packet.entries.find((entry) => entry.opId === 'evt-text-edit');
  assert.equal(textEvent.truthDomain, 'productCore.manuscriptAuthorTruth');
  assert.equal(textEvent.canWriteManuscript, false);

  const reviewEntry = packet.entries.find((entry) => entry.entryType === 'reviewApplyReceiptRef');
  assert.equal(reviewEntry.truthDomain, 'reviewEvidence');
  assert.equal(reviewEntry.writerReceiptRef.operationId, 'op-review-apply-1');
  assert.match(reviewEntry.writerReceiptRef.snapshotEvidenceHash, /^[a-f0-9]{64}$/u);

  const serialized = JSON.stringify(packet);
  assert.equal(serialized.includes('/absolute/path/must/not/leak'), false);
  assert.equal(serialized.includes('must-not-copy'), false);
  assert.equal(serialized.includes('must-not-copy-author-truth-value'), false);
});

test('E10 C02: deriveHistory consumes projection packet deterministically and binds invalidation to author truth refs', async () => {
  const runtime = await loadModule('src/core/runtime.mjs');
  const history = await loadModule('src/derived/commentsHistory/deriveHistory.mjs');
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [{
    type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: {
      projectId: PROJECT_ID,
      title: 'History Projection',
      sceneId: 'scene-1',
    },
  }]);
  assert.equal(built.ok, true);
  const eventLog = await buildEventLog();
  const packetA = history.buildRevisionHistoryProjectionPacket({
    projectId: PROJECT_ID,
    eventLog,
    reviewApplyReceipts: [buildReviewOutcome()],
    authorTruthSnapshot: { tags: ['ru'] },
  });
  const packetB = history.buildRevisionHistoryProjectionPacket({
    projectId: PROJECT_ID,
    eventLog,
    reviewApplyReceipts: [buildReviewOutcome()],
    authorTruthSnapshot: { tags: ['ru', 'en'] },
  });
  assert.notEqual(packetA.historyProjectionHash, packetB.historyProjectionHash);

  const input = {
    coreState: built.state,
    params: {
      projectId: PROJECT_ID,
      filter: 'all',
      historyProjectionPacket: packetA,
    },
    capabilitySnapshot: { platformId: 'node', capabilities: { historyView: true } },
  };
  const first = history.deriveHistory(input);
  const second = history.deriveHistory(input);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.value, second.value);
  assert.equal(first.meta.outputHash, second.meta.outputHash);
  assert.equal(first.meta.invalidationKey, second.meta.invalidationKey);
  assert.equal(first.value.entries.length, 4);
  assert.equal(first.value.meta.historyProjectionHash, packetA.historyProjectionHash);
  assert.equal(first.value.summary.storedHistoryTruth, false);
  assert.equal(first.value.authorTruthRefs[0].valueIncluded, false);

  const changed = history.deriveHistory({
    ...input,
    params: {
      ...input.params,
      historyProjectionPacket: packetB,
    },
  });
  assert.equal(changed.ok, true);
  assert.notEqual(changed.meta.invalidationKey, first.meta.invalidationKey);
});

test('E10 C02: commentsHistory source remains a read-only derived layer without a second history store', () => {
  const dir = path.join(process.cwd(), 'src', 'derived', 'commentsHistory');
  const files = fs.readdirSync(dir).filter((entry) => entry.endsWith('.mjs')).sort();
  assert.deepEqual(files, ['deriveComments.mjs', 'deriveHistory.mjs', 'index.mjs']);
  const joined = files.map((file) => fs.readFileSync(path.join(dir, file), 'utf8')).join('\n');
  for (const forbidden of [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchCommand\s*\(/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
  ]) {
    assert.equal(forbidden.test(joined), false, forbidden.source);
  }
  assert.equal(joined.includes('HISTORY_PROJECTION_PACKET_SCHEMA'), true);
  assert.equal(joined.includes('authorTruthValueIncluded: false'), true);
});
