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
      ts: '2026-07-30T17:20:02.000Z',
      commandId: 'project.applyTextEdit',
      payloadHash: `sha256:${HEX_B}`,
      dependsOn: ['op-a-1'],
      payload: { text: 'must-not-copy-secret-text' },
    },
    {
      opId: 'op-a-1',
      actorId: 'writer-A',
      sessionId: 'session-A',
      seq: 1,
      ts: '2026-07-30T17:20:01.000Z',
      commandId: 'project.create',
      payloadHash: `sha256:${HEX_A}`,
    },
    {
      opId: 'op-b-1',
      actorId: 'writer-B',
      sessionId: 'session-B',
      seq: 1,
      ts: '2026-07-30T17:20:03.000Z',
      commandId: 'atlas.languageTag.set',
      payloadHash: `sha256:${HEX_C}`,
    },
  ];
}

test('E10 C04: local actor identity envelope is deterministic and excludes account or presence identity', async () => {
  const collab = await loadModule('src/collab/index.mjs');
  const first = collab.buildActorIdentityEnvelope({
    actorId: 'writer-A',
    sessionId: 'session-A',
    displayName: 'Author A',
  });
  const second = collab.buildActorIdentityEnvelope({
    actorId: 'writer-A',
    sessionId: 'session-A',
    displayName: 'Author A',
  });

  assert.equal(first.ok, true, JSON.stringify(first.error || {}));
  assert.deepEqual(first, second);
  assert.equal(first.envelope.schemaVersion, 'collab-actor-identity.v1');
  assert.match(first.envelope.actorHash, /^[a-f0-9]{64}$/u);
  assert.equal(first.envelope.identityKind, 'local');
  assert.equal(first.envelope.accountIdentity, false);
  assert.equal(first.envelope.remotePresence, false);
  assert.equal(first.envelope.networkIdentity, false);

  const invalid = collab.buildActorIdentityEnvelope({ actorId: 'writer-A' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'E_COLLAB_ACTOR_IDENTITY_INVALID');
  assert.equal(invalid.error.op, 'collab.actorIdentity');
});

test('E10 C04: causal ordering report preserves per-actor FIFO and buffers missing dependency or sequence gaps', async () => {
  const collab = await loadModule('src/collab/index.mjs');
  const report = collab.buildCausalOrderingReport({
    events: [
      ...buildEvents(),
      {
        opId: 'op-a-4',
        actorId: 'writer-A',
        sessionId: 'session-A',
        seq: 4,
        ts: '2026-07-30T17:20:04.000Z',
        commandId: 'project.applyTextEdit',
        payloadHash: `sha256:${HEX_A}`,
      },
      {
        opId: 'op-c-1',
        actorId: 'writer-C',
        sessionId: 'session-C',
        seq: 1,
        ts: '2026-07-30T17:20:05.000Z',
        commandId: 'project.applyTextEdit',
        payloadHash: `sha256:${HEX_B}`,
        dependsOn: ['op-not-arrived'],
      },
    ],
  });

  assert.equal(report.schemaVersion, 'collab-causal-ordering.report.v1');
  assert.equal(report.ok, true, JSON.stringify(report.rejected, null, 2));
  assert.equal(report.queueModel, 'PER_ACTOR_FIFO');
  assert.equal(report.orderingKey, '(actorId,seq)');
  assert.equal(report.conflictPolicy, 'BUFFER');
  assert.match(report.reportHash, /^[a-f0-9]{64}$/u);
  assert.deepEqual(report.ready.map((entry) => entry.opId), ['op-a-1', 'op-a-2', 'op-b-1']);
  assert.deepEqual(report.buffered.map((entry) => entry.reason), [
    'PER_ACTOR_FIFO_GAP',
    'DEPENDENCY_NOT_AVAILABLE',
  ]);
  assert.equal(report.authority.networkQueueTransport, false);
  assert.equal(report.authority.coreTransportDependency, false);
  assert.equal(report.authority.secondQueueTruth, false);

  const duplicate = collab.buildCausalOrderingReport({
    events: [buildEvents()[1], { ...buildEvents()[1] }],
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.rejected[0].code, 'E_COLLAB_CAUSAL_OP_DUPLICATE');
  assert.equal(duplicate.rejected[0].op, 'collab.causalOrdering');
});

test('E10 C04: offline queue packet is local-only and capability disabled stays nonblocking', async () => {
  const collab = await loadModule('src/collab/index.mjs');
  const actor = collab.buildActorIdentityEnvelope({
    actorId: 'writer-A',
    sessionId: 'session-A',
  });
  assert.equal(actor.ok, true);

  const packet = collab.buildOfflineQueuePacket({
    actorEnvelope: actor.envelope,
    capabilityEnabled: false,
    events: buildEvents(),
  });

  assert.equal(packet.schemaVersion, 'collab-offline-queue.packet.v1');
  assert.equal(packet.ok, true, JSON.stringify(packet.rejected, null, 2));
  assert.match(packet.queueHash, /^[a-f0-9]{64}$/u);
  assert.equal(packet.capability.collabEnabled, false);
  assert.equal(packet.capability.disabledNonBlocking, true);
  assert.equal(packet.capability.authoringBlocked, false);
  assert.equal(packet.summary.queuedCount, 3);
  assert.equal(packet.authority.localOnly, true);
  assert.equal(packet.authority.networkDispatch, false);
  assert.equal(packet.authority.networkQueueTransport, false);
  assert.equal(packet.authority.coreTransportDependency, false);
  assert.equal(packet.authority.secondQueueTruth, false);
  assert.equal(packet.authority.projectTruthMutation, false);
  assert.equal(packet.authority.manuscriptMutation, false);
  assert.deepEqual([...new Set(packet.entries.map((entry) => entry.queueState))], ['heldLocal']);
  assert.deepEqual([...new Set(packet.entries.map((entry) => entry.dispatchable))], [false]);

  const serialized = JSON.stringify(packet);
  assert.equal(serialized.includes('must-not-copy-secret-text'), false);
  assert.equal(serialized.includes('"payload"'), false);
});

test('E10 C04: collab source has no account identity, network transport queue, second queue truth, or UI/storage writer', () => {
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
    /accountIdentity:\s*true/u,
    /remotePresence:\s*true/u,
    /networkQueueTransport:\s*true/u,
    /coreTransportDependency:\s*true/u,
    /secondQueueTruth:\s*true/u,
  ]) {
    assert.equal(forbidden.test(joined), false, forbidden.source);
  }
  assert.equal(joined.includes('collab-actor-identity.v1'), true);
  assert.equal(joined.includes('collab-causal-ordering.report.v1'), true);
  assert.equal(joined.includes('collab-offline-queue.packet.v1'), true);
});
