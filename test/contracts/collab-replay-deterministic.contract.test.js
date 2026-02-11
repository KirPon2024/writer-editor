const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('collab replay harness is deterministic for fixed fixture', async () => {
  const collab = await loadModule('src/collab/replayDeterminism.mjs');
  const fixture = {
    initialState: {
      version: 1,
      content: 'Initial',
      lastOpId: 'op-0',
    },
    events: [
      {
        opId: 'op-1',
        authorId: 'writer-a',
        ts: '2026-02-11T12:10:00.000Z',
        commandId: 'project.applyTextEdit',
        baseVersion: 1,
        nextVersion: 2,
        content: 'Draft-1',
      },
      {
        opId: 'op-2',
        authorId: 'writer-b',
        ts: '2026-02-11T12:10:01.000Z',
        commandId: 'project.applyTextEdit',
        baseVersion: 2,
        nextVersion: 3,
        content: 'Draft-2',
      },
      {
        opId: 'op-3',
        authorId: 'writer-c',
        ts: '2026-02-11T12:10:02.000Z',
        commandId: 'project.applyTextEdit',
        baseVersion: 99,
        nextVersion: 100,
        content: 'Conflict',
      },
    ],
  };

  const first = collab.runCollabReplay(fixture);
  const second = collab.runCollabReplay(fixture);
  assert.deepEqual(first, second);
  assert.equal(first.finalState.version, 3);
  assert.equal(typeof first.stateHash, 'string');
  assert.ok(first.stateHash.length > 0);
  assert.equal(Array.isArray(first.envelopes), true);
});
