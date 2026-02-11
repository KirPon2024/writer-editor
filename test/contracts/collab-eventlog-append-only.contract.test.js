const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('collab event log remains append-only', async () => {
  const collab = await loadModule('src/collab/eventLog.mjs');

  const first = collab.appendEventLogEntry({
    eventLog: collab.createEmptyEventLog(),
    entry: {
      opId: 'evt-1',
      ts: '2026-02-13T10:00:00.000Z',
      actorId: 'writer-A',
      commandId: 'project.create',
      payloadHash: 'payload-hash-1',
      preStateHash: 'state-0',
      postStateHash: 'state-1',
    },
  });
  assert.equal(first.ok, true);
  assert.equal(first.eventLog.events.length, 1);

  const second = collab.appendEventLogEntry({
    eventLog: first.eventLog,
    entry: {
      opId: 'evt-2',
      ts: '2026-02-13T10:00:01.000Z',
      actorId: 'writer-A',
      commandId: 'project.applyTextEdit',
      payloadHash: 'payload-hash-2',
      preStateHash: 'state-1',
      postStateHash: 'state-2',
    },
  });
  assert.equal(second.ok, true);
  assert.equal(second.eventLog.events.length, 2);

  assert.deepEqual(first.eventLog.events, [first.entry]);
  assert.deepEqual(second.eventLog.events[0], first.entry);
  assert.deepEqual(second.eventLog.events[1], second.entry);
});
