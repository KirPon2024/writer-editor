const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('collab event log schema is canonical and serialization is deterministic', async () => {
  const collab = await loadModule('src/collab/eventLog.mjs');

  const empty = collab.createEmptyEventLog();
  assert.equal(empty.schemaVersion, 'collab-eventlog.v1');
  assert.deepEqual(empty.events, []);

  const appended = collab.appendEventLogEntry({
    eventLog: empty,
    entry: {
      opId: 'evt-1',
      ts: '2026-02-13T10:00:00.000Z',
      actorId: 'writer-A',
      commandId: 'project.create',
      payloadHash: 'payload-hash',
      preStateHash: 'state-0',
      postStateHash: 'state-1',
    },
  });
  assert.equal(appended.ok, true);

  const serializedA = collab.serializeEventLog(appended.eventLog);
  const serializedB = collab.serializeEventLog(appended.eventLog);
  assert.equal(serializedA, serializedB);
  assert.equal(serializedA.includes('"schemaVersion":"collab-eventlog.v1"'), true);
  assert.equal(serializedA.includes('"events"'), true);

  const hashA = collab.hashEventLog(appended.eventLog);
  const hashB = collab.hashEventLog(appended.eventLog);
  assert.equal(hashA, hashB);
  assert.equal(typeof hashA, 'string');
  assert.equal(hashA.length, 64);
});
