const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('collab conflict envelope has canonical typed shape and deterministic output', async () => {
  const collab = await loadModule('src/collab/conflictEnvelope.mjs');
  const input = {
    code: 'E_COLLAB_BASE_VERSION_MISMATCH',
    op: 'collab.merge',
    reason: 'BASE_VERSION_CONFLICT',
    details: {
      opId: 'op-42',
      authorId: 'writer-42',
      ts: '2026-02-11T11:11:11.000Z',
      commandId: 'project.applyTextEdit',
    },
  };

  const first = collab.createConflictEnvelope(input);
  const second = collab.createConflictEnvelope(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    code: 'E_COLLAB_BASE_VERSION_MISMATCH',
    op: 'collab.merge',
    reason: 'BASE_VERSION_CONFLICT',
    details: {
      opId: 'op-42',
      authorId: 'writer-42',
      ts: '2026-02-11T11:11:11.000Z',
      commandId: 'project.applyTextEdit',
    },
  });
});
