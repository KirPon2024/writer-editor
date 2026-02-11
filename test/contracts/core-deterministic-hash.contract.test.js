const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadRuntime() {
  const fileUrl = pathToFileURL(path.join(process.cwd(), 'src', 'core', 'runtime.mjs')).href;
  return import(fileUrl);
}

test('core state hash is deterministic for identical command sequence', async () => {
  const runtime = await loadRuntime();
  const initial = runtime.createInitialCoreState();
  const commands = [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId: 'p-1', title: 'Project One', sceneId: 's-1' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId: 'p-1', sceneId: 's-1', text: 'Hello deterministic core' },
    },
  ];

  const a = runtime.applyCoreSequence(initial, commands);
  const b = runtime.applyCoreSequence(initial, commands);

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.stateHash, b.stateHash);
  assert.deepEqual(a.state, b.state);
  assert.equal(a.stateHash, runtime.hashCoreState(a.state));
});
