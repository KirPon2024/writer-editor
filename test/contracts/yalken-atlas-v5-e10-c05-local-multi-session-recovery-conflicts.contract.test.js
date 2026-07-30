const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

const initialState = {
  version: 0,
  content: 'base local manuscript text',
  lastOpId: 'op-0',
};

const reopenedState = {
  version: 2,
  content: 'writer A second local revision',
  lastOpId: 'op-a-2',
};

function buildFixture() {
  return {
    projectId: 'project-local-collab',
    initialState,
    reopenedState,
    recoverySnapshots: [
      {
        snapshotId: 'snapshot-before-conflict',
        sessionId: 'session-A',
        stateHash: 'sha256:' + 'a'.repeat(64),
        eventLogHash: 'sha256:' + 'b'.repeat(64),
        createdAtUtc: '2026-07-30T17:45:00.000Z',
      },
    ],
    sessions: [
      {
        actorId: 'writer-A',
        sessionId: 'session-A',
        events: [
          {
            opId: 'op-a-1',
            authorId: 'writer-A',
            seq: 1,
            ts: '2026-07-30T17:45:01.000Z',
            commandId: 'project.applyTextEdit',
            baseVersion: 0,
            nextVersion: 1,
            content: 'writer A first local revision',
          },
          {
            opId: 'op-a-2',
            authorId: 'writer-A',
            seq: 2,
            ts: '2026-07-30T17:45:03.000Z',
            commandId: 'project.applyTextEdit',
            baseVersion: 1,
            nextVersion: 2,
            content: 'writer A second local revision',
          },
        ],
      },
      {
        actorId: 'writer-B',
        sessionId: 'session-B',
        events: [
          {
            opId: 'op-b-1',
            authorId: 'writer-B',
            seq: 1,
            ts: '2026-07-30T17:45:02.000Z',
            commandId: 'project.applyTextEdit',
            baseVersion: 0,
            nextVersion: 1,
            content: 'writer B conflicting remote revision',
          },
        ],
      },
    ],
  };
}

test('E10 C05: local multi-session replay is deterministic and surfaces conflicts without auto merge', async () => {
  const collab = await loadModule('src/collab/index.mjs');
  const first = collab.buildLocalMultiSessionRecoveryReport(buildFixture());
  const second = collab.buildLocalMultiSessionRecoveryReport(buildFixture());

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 'collab-local-multi-session-recovery.report.v1');
  assert.equal(first.ok, true, JSON.stringify(first.invalidEvents, null, 2));
  assert.match(first.recoveryHash, /^[a-f0-9]{64}$/u);
  assert.equal(first.summary.sessionCount, 2);
  assert.equal(first.summary.inputEventCount, 3);
  assert.equal(first.summary.appliedCount, 2);
  assert.equal(first.summary.conflictCount, 1);
  assert.equal(first.summary.manualDecisionRequiredCount, 1);
  assert.deepEqual(first.applied.map((entry) => entry.opId), ['op-a-1', 'op-a-2']);
  assert.equal(first.conflicts[0].schemaVersion, 'collab-local-conflict-envelope.v1');
  assert.equal(first.conflicts[0].envelope.code, 'E_COLLAB_BASE_VERSION_MISMATCH');
  assert.equal(first.conflicts[0].envelope.op, 'collab.merge');
  assert.equal(first.conflicts[0].automaticMerge, false);
  assert.equal(first.conflicts[0].silentProjectRewrite, false);
  assert.equal(first.conflicts[0].projectTruthMutation, false);
  assert.equal(first.conflicts[0].manuscriptMutation, false);
  assert.equal(first.authority.automaticMerge, false);
  assert.equal(first.authority.networkCollaboration, false);
  assert.equal(first.authority.secondOperationLogTruth, false);
});

test('E10 C05: rollback, reopen, offline recovery, and manual decision route stay local and non-destructive', async () => {
  const collab = await loadModule('src/collab/index.mjs');
  const report = collab.buildLocalMultiSessionRecoveryReport(buildFixture());
  const [conflict] = report.conflicts;

  assert.equal(report.rollbackReopenProof.rollbackAvailable, true);
  assert.equal(report.rollbackReopenProof.reopenProof.provided, true);
  assert.equal(report.rollbackReopenProof.reopenProof.matches, true);
  assert.equal(report.rollbackReopenProof.authorDataLoss, false);
  assert.equal(report.rollbackReopenProof.destructiveRecovery, false);
  assert.equal(report.rollbackReopenProof.silentProjectRewrite, false);
  assert.equal(conflict.rollbackProof.rollbackAction, 'ROLLBACK_TO_PRE_CONFLICT_STATE');
  assert.equal(conflict.rollbackProof.reopenRequired, true);
  assert.equal(conflict.rollbackProof.authorDataLoss, false);
  assert.equal(conflict.rollbackProof.destructiveRecovery, false);

  assert.equal(conflict.manualDecisionRoute.routeKind, 'MANUAL_PREVIEW_REQUIRED');
  assert.equal(conflict.manualDecisionRoute.previewRequired, true);
  assert.equal(conflict.manualDecisionRoute.commandKernelApplyRequired, true);
  assert.equal(conflict.manualDecisionRoute.capabilityRevalidationRequired, true);
  assert.equal(conflict.manualDecisionRoute.dispatchIntentOnly, true);
  assert.equal(conflict.manualDecisionRoute.automaticMerge, false);
  assert.equal(conflict.manualDecisionRoute.silentProjectRewrite, false);
  assert.equal(conflict.manualDecisionRoute.destructiveRecovery, false);

  assert.equal(report.offlineRecoveryProof.localOnly, true);
  assert.equal(report.offlineRecoveryProof.networkRequired, false);
  assert.equal(report.offlineRecoveryProof.networkDispatch, false);
  assert.equal(report.offlineRecoveryProof.authorDataLoss, false);
  assert.equal(report.offlineRecoveryProof.destructiveRecovery, false);
  assert.equal(report.offlineRecoveryProof.projectRewrite, false);
  assert.equal(report.offlineRecoveryProof.queuePackets.length, 2);
  assert.deepEqual([...new Set(report.offlineRecoveryProof.queuePackets.map((packet) => packet.disabledNonBlocking))], [true]);
  assert.deepEqual([...new Set(report.offlineRecoveryProof.queuePackets.map((packet) => packet.dispatchableCount))], [0]);
  assert.equal(report.offlineRecoveryProof.recoverySnapshotRefs[0].readableRecovery, true);
  assert.equal(report.offlineRecoveryProof.recoverySnapshotRefs[0].destructiveRewrite, false);
});

test('E10 C05: recovery report is hash-only and excludes manuscript text payloads', async () => {
  const collab = await loadModule('src/collab/index.mjs');
  const report = collab.buildLocalMultiSessionRecoveryReport(buildFixture());
  const serialized = JSON.stringify(report);

  assert.equal(serialized.includes('base local manuscript text'), false);
  assert.equal(serialized.includes('writer A first local revision'), false);
  assert.equal(serialized.includes('writer A second local revision'), false);
  assert.equal(serialized.includes('writer B conflicting remote revision'), false);
  assert.match(report.initialStateHash, /^[a-f0-9]{64}$/u);
  assert.match(report.finalStateHash, /^[a-f0-9]{64}$/u);
  assert.ok(report.applied.every((entry) => typeof entry.payloadHash === 'string' && entry.payloadHash.startsWith('sha256:')));
  assert.ok(report.conflicts.every((entry) => typeof entry.rejectedRemoteStateHash === 'string' && entry.rejectedRemoteStateHash.length === 64));
});

test('E10 C05: invalid local session events produce typed envelopes without mutation authority', async () => {
  const collab = await loadModule('src/collab/index.mjs');
  const report = collab.buildLocalMultiSessionRecoveryReport({
    projectId: 'project-local-collab',
    initialState,
    reopenedState: initialState,
    sessions: [
      {
        actorId: 'writer-A',
        sessionId: 'session-A',
        events: [
          {
            opId: 'op-invalid',
            authorId: 'writer-A',
            ts: '2026-07-30T17:45:04.000Z',
            commandId: 'project.applyTextEdit',
            content: 'not copied',
          },
        ],
      },
    ],
  });

  assert.equal(report.ok, false);
  assert.equal(report.invalidEvents.length, 1);
  assert.equal(report.invalidEvents[0].envelope.code, 'E_COLLAB_MULTI_SESSION_EVENT_INVALID');
  assert.equal(report.invalidEvents[0].envelope.op, 'collab.localMultiSessionRecovery');
  assert.deepEqual(report.invalidEvents[0].missingFields, ['baseVersion', 'nextVersion']);
  assert.equal(report.authority.projectTruthMutation, false);
  assert.equal(report.authority.manuscriptMutation, false);
  assert.equal(report.authority.storageMutation, false);
  assert.equal(report.authority.uiMutation, false);
});

test('E10 C05: collab source stays local-only with no new file, network, UI, storage writer, or silent merge path', () => {
  const collabDir = path.join(process.cwd(), 'src', 'collab');
  const files = fs.readdirSync(collabDir).filter((entry) => entry.endsWith('.mjs')).sort();
  assert.deepEqual(files, ['applyEventLog.mjs', 'conflictEnvelope.mjs', 'eventLog.mjs', 'index.mjs', 'mergePolicy.mjs', 'replayDeterminism.mjs']);
  const joined = files.map((file) => fs.readFileSync(path.join(collabDir, file), 'utf8')).join('\n');
  for (const forbidden of [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /\bWebSocket\b/u,
    /\bfetch\s*\(/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchCommand\s*\(/u,
    /automaticMerge:\s*true/u,
    /silentProjectRewrite:\s*true/u,
    /destructiveRecovery:\s*true/u,
    /networkCollaboration:\s*true/u,
    /secondOperationLogTruth:\s*true/u,
    /secondCommentTruth:\s*true/u,
  ]) {
    assert.equal(forbidden.test(joined), false, forbidden.source);
  }
  assert.equal(joined.includes('collab-local-multi-session-recovery.report.v1'), true);
  assert.equal(joined.includes('collab-local-conflict-envelope.v1'), true);
  assert.equal(joined.includes('collab-offline-recovery.proof.v1'), true);
});
