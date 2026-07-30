const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);
const HEX_C = 'c'.repeat(64);

function buildEvents() {
  return [
    {
      opId: 'op-a-2',
      actorId: 'writer-A',
      sessionId: 'session-A',
      seq: 2,
      ts: '2026-07-30T18:10:02.000Z',
      commandId: 'project.applyTextEdit',
      payloadHash: `sha256:${HEX_B}`,
      dependsOn: ['op-a-1'],
      payload: { text: 'must-not-copy-local-manuscript-text' },
    },
    {
      opId: 'op-b-1',
      actorId: 'writer-B',
      sessionId: 'session-B',
      seq: 1,
      ts: '2026-07-30T18:10:03.000Z',
      commandId: 'atlas.entity.confirm',
      payloadHash: `sha256:${HEX_C}`,
    },
    {
      opId: 'op-a-1',
      actorId: 'writer-A',
      sessionId: 'session-A',
      seq: 1,
      ts: '2026-07-30T18:10:01.000Z',
      commandId: 'project.create',
      payloadHash: `sha256:${HEX_A}`,
    },
  ];
}

test('E10 C06: transport-neutral exchange packet is deterministic, versioned, and offline by default', async () => {
  const collab = await loadModule('src/collab/index.mjs');
  const first = collab.buildTransportNeutralExchangePacket({
    projectId: 'project-transport-neutral',
    events: buildEvents(),
  });
  const second = collab.buildTransportNeutralExchangePacket({
    projectId: 'project-transport-neutral',
    events: buildEvents(),
  });

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 'collab-transport-neutral-operation-exchange.packet.v1');
  assert.equal(first.ok, true, JSON.stringify(first.rejected, null, 2));
  assert.match(first.exchangeHash, /^[a-f0-9]{64}$/u);
  assert.deepEqual(first.entries.map((entry) => entry.opId), ['op-a-1', 'op-a-2', 'op-b-1']);
  assert.equal(first.packetKind, 'operationExchange');
  assert.equal(first.transport.transportNeutral, true);
  assert.equal(first.transport.localFixtureAdapter, true);
  assert.equal(first.transport.freeReversibleAdapter, true);
  assert.equal(first.transport.liveNetwork, false);
  assert.equal(first.transport.networkAdapterEnabled, false);
  assert.equal(first.transport.accountSync, false);
  assert.equal(first.transport.cloudSync, false);
  assert.equal(first.transport.transportSourceOfTruth, false);
  assert.equal(first.transport.crdtCoreAdopted, false);
  assert.equal(first.transport.yjsRuntimeDependency, false);
  assert.equal(first.capability.transportEnabled, false);
  assert.equal(first.capability.disabledNonBlocking, true);
  assert.equal(first.capability.authoringBlocked, false);
  assert.equal(first.summary.heldLocalCount, 3);
  assert.equal(first.summary.exchangeableCount, 0);
  assert.deepEqual([...new Set(first.entries.map((entry) => entry.exchangeState))], ['heldLocalFixture']);
  assert.deepEqual([...new Set(first.entries.map((entry) => entry.networkDispatchable))], [false]);
  assert.equal(first.authority.transportSourceOfTruth, false);
  assert.equal(first.authority.networkAdapter, false);
  assert.equal(first.authority.networkDispatch, false);
  assert.equal(first.authority.coreTransportDependency, false);
  assert.equal(first.authority.projectTruthMutation, false);
  assert.equal(first.authority.manuscriptMutation, false);
  assert.equal(first.authority.secondOperationLogTruth, false);
  assert.equal(first.authority.secondCommentTruth, false);

  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes('must-not-copy-local-manuscript-text'), false);
  assert.equal(serialized.includes('"payload":'), false);
});

test('E10 C06: local fixture adapter previews packet without transport apply authority', async () => {
  const collab = await loadModule('src/collab/index.mjs');
  const packet = collab.buildTransportNeutralExchangePacket({
    projectId: 'project-transport-neutral',
    transportCapabilityEnabled: true,
    events: buildEvents(),
  });
  const report = collab.buildLocalFixtureExchangeAdapterReport({
    packet,
    expectedExchangeHash: packet.exchangeHash,
  });

  assert.equal(packet.ok, true, JSON.stringify(packet.rejected, null, 2));
  assert.deepEqual([...new Set(packet.entries.map((entry) => entry.exchangeState))], ['readyLocalFixture']);
  assert.deepEqual([...new Set(packet.entries.map((entry) => entry.localFixtureExchangeable))], [true]);
  assert.deepEqual([...new Set(packet.entries.map((entry) => entry.networkDispatchable))], [false]);

  assert.equal(report.schemaVersion, 'collab-local-fixture-exchange-adapter.report.v1');
  assert.equal(report.ok, true, JSON.stringify(report.rejected, null, 2));
  assert.match(report.adapterReportHash, /^[a-f0-9]{64}$/u);
  assert.equal(report.adapter.adapterKind, 'localFixture');
  assert.equal(report.adapter.localOnly, true);
  assert.equal(report.adapter.free, true);
  assert.equal(report.adapter.reversible, true);
  assert.equal(report.adapter.writesRuntime, false);
  assert.equal(report.adapter.liveNetwork, false);
  assert.equal(report.packetRef.packetHashMatches, true);
  assert.equal(report.packetRef.exchangeHash, packet.exchangeHash);
  assert.equal(report.previewRows.length, 3);
  assert.deepEqual([...new Set(report.previewRows.map((row) => row.previewOnly))], [true]);
  assert.deepEqual([...new Set(report.previewRows.map((row) => row.payloadCopied))], [false]);
  assert.equal(report.applyRoute.previewRequired, true);
  assert.equal(report.applyRoute.commandKernelApplyRequired, true);
  assert.equal(report.applyRoute.capabilityRevalidationRequired, true);
  assert.equal(report.applyRoute.dispatchIntentOnly, true);
  assert.equal(report.applyRoute.automaticApply, false);
  assert.equal(report.applyRoute.transportApplyAuthority, false);
  assert.equal(report.summary.appliedCount, 0);
  assert.equal(report.authority.transportSourceOfTruth, false);
  assert.equal(report.authority.networkAdapter, false);
  assert.equal(report.authority.networkDispatch, false);
  assert.equal(report.authority.projectTruthMutation, false);
  assert.equal(report.authority.manuscriptMutation, false);
});

test('E10 C06: network adapter attempts, invalid events, and tampered packets fail closed', async () => {
  const collab = await loadModule('src/collab/index.mjs');
  const networkAttempt = collab.buildTransportNeutralExchangePacket({
    projectId: 'project-transport-neutral',
    adapterKind: 'network',
    networkAdapterEnabled: true,
    events: buildEvents(),
  });

  assert.equal(networkAttempt.ok, false);
  assert.equal(networkAttempt.rejected[0].code, 'E_COLLAB_TRANSPORT_NETWORK_ADAPTER_DISABLED');
  assert.equal(networkAttempt.rejected[0].op, 'collab.transportNeutralExchange');
  assert.equal(networkAttempt.transport.networkAdapterEnabled, false);
  assert.equal(networkAttempt.authority.networkAdapter, false);
  assert.equal(networkAttempt.authority.networkDispatch, false);

  const invalid = collab.buildTransportNeutralExchangePacket({
    projectId: 'project-transport-neutral',
    events: [{ ...buildEvents()[0], payloadHash: '' }],
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.rejected[0].code, 'E_COLLAB_TRANSPORT_EXCHANGE_EVENT_INVALID');
  assert.equal(invalid.entries.length, 0);

  const packet = collab.buildTransportNeutralExchangePacket({
    projectId: 'project-transport-neutral',
    transportCapabilityEnabled: true,
    events: buildEvents(),
  });
  const tampered = {
    ...packet,
    entries: packet.entries.map((entry, index) => (
      index === 0 ? { ...entry, commandId: 'project.tampered' } : entry
    )),
  };
  const tamperedReport = collab.buildLocalFixtureExchangeAdapterReport({
    packet: tampered,
    expectedExchangeHash: packet.exchangeHash,
  });
  assert.equal(tamperedReport.ok, false);
  assert.equal(tamperedReport.rejected.some((entry) => entry.code === 'E_COLLAB_LOCAL_FIXTURE_PACKET_HASH_MISMATCH'), true);
  assert.equal(tamperedReport.summary.appliedCount, 0);
  assert.equal(tamperedReport.authority.projectTruthMutation, false);
  assert.equal(tamperedReport.authority.manuscriptMutation, false);
});

test('E10 C06: collab source stays local-only with no new file, network, CRDT Core, UI, storage, or second truth', () => {
  const collabDir = path.join(process.cwd(), 'src', 'collab');
  const files = fs.readdirSync(collabDir).filter((entry) => entry.endsWith('.mjs')).sort();
  assert.deepEqual(files, ['applyEventLog.mjs', 'conflictEnvelope.mjs', 'eventLog.mjs', 'index.mjs', 'mergePolicy.mjs', 'replayDeterminism.mjs']);
  const joined = files.map((file) => fs.readFileSync(path.join(collabDir, file), 'utf8')).join('\n');
  for (const forbidden of [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]yjs['"]/u,
    /\bY\.Doc\b/u,
    /\bWebSocket\b/u,
    /\bfetch\s*\(/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchCommand\s*\(/u,
    /transportSourceOfTruth:\s*true/u,
    /networkAdapter:\s*true/u,
    /networkDispatch:\s*true/u,
    /crdtCoreAdopted:\s*true/u,
    /yjsRuntimeDependency:\s*true/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /uiMutation:\s*true/u,
    /secondOperationLogTruth:\s*true/u,
    /secondCommentTruth:\s*true/u,
  ]) {
    assert.equal(forbidden.test(joined), false, forbidden.source);
  }
  assert.equal(joined.includes('collab-transport-neutral-operation-exchange.packet.v1'), true);
  assert.equal(joined.includes('collab-local-fixture-exchange-adapter.report.v1'), true);
});
