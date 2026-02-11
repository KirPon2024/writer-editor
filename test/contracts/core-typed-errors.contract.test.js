const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadRuntime() {
  const fileUrl = pathToFileURL(path.join(process.cwd(), 'src', 'core', 'runtime.mjs')).href;
  return import(fileUrl);
}

test('invalid core transition returns deterministic typed error envelope', async () => {
  const runtime = await loadRuntime();
  const initial = runtime.createInitialCoreState();
  const result = runtime.reduceCoreState(initial, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId: 'missing-project', sceneId: 'scene-1', text: 'x' },
  });

  assert.equal(result.ok, false);
  assert.ok(result.error && typeof result.error === 'object');
  assert.equal(result.error.code, 'E_CORE_PROJECT_NOT_FOUND');
  assert.equal(result.error.op, runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT);
  assert.equal(result.error.reason, 'PROJECT_NOT_FOUND');
  assert.deepEqual(result.error.details, { projectId: 'missing-project' });
  assert.equal(typeof result.stateHash, 'string');
  assert.equal(result.stateHash.length, 64);
});
