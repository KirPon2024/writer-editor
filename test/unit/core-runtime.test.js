const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadRuntime() {
  const fileUrl = pathToFileURL(path.join(process.cwd(), 'src', 'core', 'runtime.mjs')).href;
  return import(fileUrl);
}

test('core runtime executes create + text edit mutations through canonical commands', async () => {
  const runtime = await loadRuntime();
  const initial = runtime.createInitialCoreState();

  const createResult = runtime.reduceCoreState(initial, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: { projectId: 'project-1', title: 'Draft', sceneId: 'scene-a' },
  });
  assert.equal(createResult.ok, true);

  const editResult = runtime.reduceCoreState(createResult.state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId: 'project-1', sceneId: 'scene-a', text: 'Core SoT executable' },
  });

  assert.equal(editResult.ok, true);
  assert.equal(
    editResult.state.data.projects['project-1'].scenes['scene-a'].text,
    'Core SoT executable',
  );
  assert.ok(editResult.state.data.lastCommandId >= 2);
});
