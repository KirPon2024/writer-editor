const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('collab event log rejects duplicate opId with typed error', async () => {
  const collab = await loadModule('src/collab/eventLog.mjs');

  const first = collab.appendEventLogEntry({
    eventLog: collab.createEmptyEventLog(),
    entry: {
      opId: 'evt-dup',
      ts: '2026-02-13T10:20:00.000Z',
      actorId: 'writer-A',
      commandId: 'project.create',
      payloadHash: 'payload-hash-1',
      preStateHash: 'state-0',
      postStateHash: 'state-1',
    },
  });
  assert.equal(first.ok, true);

  const duplicate = collab.appendEventLogEntry({
    eventLog: first.eventLog,
    entry: {
      opId: 'evt-dup',
      ts: '2026-02-13T10:20:01.000Z',
      actorId: 'writer-B',
      commandId: 'project.applyTextEdit',
      payloadHash: 'payload-hash-2',
      preStateHash: 'state-1',
      postStateHash: 'state-2',
    },
  });

  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'E_COLLAB_EVENTLOG_OPID_DUPLICATE');
  assert.equal(duplicate.error.op, 'collab.eventlog.append');
  assert.equal(duplicate.error.reason, 'OP_ID_ALREADY_EXISTS');
  assert.equal(duplicate.error.details.opId, 'evt-dup');
});
