const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('collab merge policy is deterministic and returns canonical verdict', async () => {
  const collab = await loadModule('src/collab/mergePolicy.mjs');
  const fixture = {
    localState: {
      version: 4,
      content: 'Draft',
      lastOpId: 'op-3',
    },
    remoteEvent: {
      opId: 'op-4',
      authorId: 'writer-a',
      ts: '2026-02-11T12:00:00.000Z',
      commandId: 'project.applyTextEdit',
      baseVersion: 4,
      nextVersion: 5,
      content: 'Draft + remote',
    },
  };

  const first = collab.mergeRemoteEvent(fixture);
  const second = collab.mergeRemoteEvent(fixture);
  assert.deepEqual(first, second);
  assert.equal(first.verdict, 'applied');
  assert.deepEqual(first.state, {
    version: 5,
    content: 'Draft + remote',
    lastOpId: 'op-4',
  });
  assert.equal(first.envelope, null);
});
