const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

async function buildReplayFixture() {
  const collab = await loadModule('src/collab/eventLog.mjs');
  const core = await loadModule('src/core/runtime.mjs');
  const productDomainEvents = await loadModule('src/product/domainEventPort.mjs');
  const domainEventPort = productDomainEvents.createCoreDomainEventProductPort();
  const initialState = core.createInitialCoreState();
  const initialStateHash = core.hashCoreState(initialState);
  let currentState = initialState;
  let currentStateHash = initialStateHash;
  let eventLog = collab.createEmptyEventLog();
  const receipts = [];

  const sequence = [
    {
      opId: 'op-project-create',
      ts: '2026-07-30T16:50:00.000Z',
      actorId: 'writer-A',
      commandId: core.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId: 'project-e10-c03-replay',
        title: 'Replay',
        sceneId: 'scene-1',
      },
    },
    {
      opId: 'op-text-edit',
      ts: '2026-07-30T16:50:01.000Z',
      actorId: 'writer-A',
      commandId: core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId: 'project-e10-c03-replay',
        sceneId: 'scene-1',
        text: '# Replay secret text must not be copied\n',
      },
    },
    {
      opId: 'op-language-tag',
      ts: '2026-07-30T16:50:02.000Z',
      actorId: 'writer-A',
      commandId: core.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: {
        projectId: 'project-e10-c03-replay',
        scopeKind: 'project',
        languageCode: 'ru',
        note: 'author-set replay language',
      },
    },
  ];

  for (const step of sequence) {
    const applied = collab.applyCommandWithEventLog({
      eventLog,
      currentState,
      currentStateHash,
      domainEventPort,
      opId: step.opId,
      ts: step.ts,
      actorId: step.actorId,
      commandId: step.commandId,
      payload: step.payload,
      applyCommand: (state, command) => core.reduceCoreState(state, command),
    });
    assert.equal(applied.ok, true, JSON.stringify(applied.error || {}));
    receipts.push({
      schemaVersion: collab.COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION,
      receiptId: `kernel-receipt-${step.opId}`,
      operationId: step.opId,
      commandId: step.commandId,
      status: 'applied',
      appliedAt: step.ts,
      preStateHash: currentStateHash,
      postStateHash: applied.stateHash,
      capabilityRevalidated: true,
      domainEventDigest: applied.domainEventDigest,
      domainEventCount: applied.domainEvents.length,
    });
    eventLog = applied.eventLog;
    currentState = applied.state;
    currentStateHash = applied.stateHash;
  }

  return {
    collab,
    eventLog,
    commandReceipts: receipts,
    domainEventPort,
    initialStateHash,
    finalStateHash: currentStateHash,
  };
}

function receiptAuthorityPort(collab, receipts) {
  return {
    authorityKind: collab.COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
    getCommandKernelReceipt({ operationId }) {
      return receipts.find((receipt) => receipt.operationId === operationId) || null;
    },
  };
}

test('E10 C03: operation replay report is deterministic over existing event log and Command Kernel receipt refs', async () => {
  const {
    collab,
    eventLog,
    commandReceipts,
    domainEventPort,
    initialStateHash,
    finalStateHash,
  } = await buildReplayFixture();

  const buildReport = () => collab.buildOperationReplayReport({
    eventLog,
    domainEventPort,
    commandReceiptAuthorityPort: receiptAuthorityPort(collab, commandReceipts),
    initialStateHash,
    expectedFinalStateHash: finalStateHash,
    requireCommandKernelReceipt: true,
  });

  const first = buildReport();
  const second = buildReport();

  assert.equal(first.schemaVersion, 'collab-operation-replay.report.v1');
  assert.equal(first.ok, true, JSON.stringify(first.rejected, null, 2));
  assert.equal(second.ok, true, JSON.stringify(second.rejected, null, 2));
  assert.equal(first.replayHash, second.replayHash);
  assert.equal(first.eventLogHash, second.eventLogHash);
  assert.equal(first.finalStateHash, finalStateHash);
  assert.equal(first.expectedFinalStateHashMatches, true);
  assert.equal(first.appliedCount, 3);
  assert.equal(first.rejectedCount, 0);
  assert.equal(first.authority.usesExistingEventLog, true);
  assert.equal(first.authority.commandKernelReceiptBinding, true);
  assert.equal(first.authority.secondOperationLogTruth, false);
  assert.equal(first.authority.privateCommandBus, false);
  assert.equal(first.authority.directManuscriptMutation, false);
  assert.equal(first.authority.transportExchange, false);

  for (const step of first.steps) {
    assert.match(step.commandReceiptRef.receiptRefHash, /^[a-f0-9]{64}$/u);
    assert.equal(step.commandReceiptRef.capabilityRevalidated, true);
    assert.equal(step.stateHashProof.preStateHashMatches, true);
    assert.equal(step.stateHashProof.nextStateHash, step.postStateHash);
  }

  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes('# Replay secret text must not be copied'), false);
  assert.equal(serialized.includes('"payload"'), false);
});

test('E10 C03: duplicate operation id and hash drift produce typed replay envelopes without advancing state truth', async () => {
  const {
    collab,
    eventLog,
    commandReceipts,
    domainEventPort,
    initialStateHash,
  } = await buildReplayFixture();
  const duplicateEntry = {
    ...eventLog.events[1],
    preStateHash: eventLog.events[1].postStateHash,
    postStateHash: 'sha256:duplicate-should-not-advance',
  };
  const duplicateReport = collab.buildOperationReplayReport({
    eventLog: {
      schemaVersion: eventLog.schemaVersion,
      events: [...eventLog.events.slice(0, 2), duplicateEntry],
    },
    domainEventPort,
    commandReceiptAuthorityPort: receiptAuthorityPort(collab, commandReceipts),
    initialStateHash,
    requireCommandKernelReceipt: true,
  });

  assert.equal(duplicateReport.ok, false);
  assert.equal(duplicateReport.rejected[0].code, 'E_COLLAB_OPERATION_REPLAY_DUPLICATE_OP_ID');
  assert.equal(duplicateReport.rejected[0].op, 'collab.operationReplay.buildReport');
  assert.equal(duplicateReport.appliedCount, 2);
  assert.equal(duplicateReport.finalStateHash, eventLog.events[1].postStateHash);

  const driftEntry = {
    ...eventLog.events[0],
    preStateHash: 'sha256:not-the-initial-state',
  };
  const driftEnvelope = collab.createCommandKernelOperationEnvelope({
    commandId: driftEntry.commandId,
    payload: driftEntry.operationEnvelope.payload,
    opId: driftEntry.opId,
    eventId: driftEntry.eventId,
    preStateHash: driftEntry.preStateHash,
  });
  driftEntry.operationEnvelope = driftEnvelope.envelope;
  driftEntry.operationEnvelopeDigest = driftEnvelope.envelopeDigest;
  const driftReport = collab.buildOperationReplayReport({
    eventLog: {
      schemaVersion: eventLog.schemaVersion,
      events: [driftEntry],
    },
    domainEventPort,
    commandReceiptAuthorityPort: receiptAuthorityPort(collab, commandReceipts),
    initialStateHash,
    requireCommandKernelReceipt: true,
  });

  assert.equal(driftReport.ok, false);
  assert.equal(driftReport.rejected[0].code, 'E_COLLAB_OPERATION_REPLAY_PRE_STATE_HASH_MISMATCH');
  assert.equal(driftReport.rejected[0].reason, 'PRE_STATE_HASH_MISMATCH');
  assert.equal(driftReport.appliedCount, 0);
  assert.equal(driftReport.finalStateHash, initialStateHash);
});

test('E10 C03: Command Kernel replay binding requires receipt and capability revalidation when requested', async () => {
  const {
    collab,
    eventLog,
    commandReceipts,
    domainEventPort,
    initialStateHash,
  } = await buildReplayFixture();

  const missingReceipt = collab.buildOperationReplayReport({
    eventLog,
    domainEventPort,
    commandReceiptAuthorityPort: receiptAuthorityPort(collab, commandReceipts.slice(0, 2)),
    initialStateHash,
    requireCommandKernelReceipt: true,
  });
  assert.equal(missingReceipt.ok, false);
  assert.equal(
    missingReceipt.rejected.at(-1).code,
    'E_COLLAB_OPERATION_REPLAY_COMMAND_RECEIPT_MISSING',
  );

  const staleCapability = collab.buildOperationReplayReport({
    eventLog,
    domainEventPort,
    commandReceiptAuthorityPort: receiptAuthorityPort(collab, commandReceipts.map((receipt, index) => ({
      ...receipt,
      capabilityRevalidated: index === 1 ? false : receipt.capabilityRevalidated,
    }))),
    initialStateHash,
    requireCommandKernelReceipt: true,
  });
  assert.equal(staleCapability.ok, false);
  assert.equal(
    staleCapability.rejected[0].code,
    'E_COLLAB_OPERATION_REPLAY_CAPABILITY_NOT_REVALIDATED',
  );

  const forgedRawReceiptArray = collab.buildOperationReplayReport({
    eventLog,
    domainEventPort,
    commandReceipts,
    initialStateHash,
    requireCommandKernelReceipt: true,
  });
  assert.equal(forgedRawReceiptArray.ok, false);
  assert.equal(
    forgedRawReceiptArray.rejected[0].code,
    'E_COLLAB_OPERATION_REPLAY_RECEIPT_AUTHORITY_REQUIRED',
  );

  const missingVersion = collab.buildOperationReplayReport({
    eventLog,
    domainEventPort,
    commandReceiptAuthorityPort: receiptAuthorityPort(collab, commandReceipts.map((receipt, index) => {
      if (index !== 0) return receipt;
      const next = { ...receipt };
      delete next.schemaVersion;
      return next;
    })),
    initialStateHash,
    requireCommandKernelReceipt: true,
  });
  assert.equal(missingVersion.ok, false);
  assert.equal(
    missingVersion.rejected[0].code,
    'E_COLLAB_OPERATION_REPLAY_RECEIPT_SCHEMA_INVALID',
  );
});

test('E10 C03: collab source still has no second operation log truth, storage writer, private bus, or transport wiring', () => {
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
    /secondOperationLogTruth:\s*true/u,
    /privateCommandBus:\s*true/u,
    /directManuscriptMutation:\s*true/u,
    /transportExchange:\s*true/u,
  ]) {
    assert.equal(forbidden.test(joined), false, forbidden.source);
  }
  assert.equal(joined.includes('collab-operation-replay.report.v1'), true);
  assert.equal(joined.includes('buildOperationReplayReport'), true);
});
