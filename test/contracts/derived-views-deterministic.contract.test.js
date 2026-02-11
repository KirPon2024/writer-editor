const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('derived views contract: deterministic output and stable invalidation key', async () => {
  const runtime = await loadModule('src/core/runtime.mjs');
  const derived = await loadModule('src/derived/referenceOutline.mjs');

  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId: 'project-derived-deterministic',
        title: 'Derived Deterministic',
        sceneId: 'scene-1',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId: 'project-derived-deterministic',
        sceneId: 'scene-1',
        text: '# Deterministic heading\nBody\n',
      },
    },
  ]);
  assert.equal(built.ok, true);

  const baseInput = {
    coreState: built.state,
    params: {
      projectId: 'project-derived-deterministic',
      mode: 'compact',
    },
    capabilitySnapshot: {
      platformId: 'node',
      capabilities: { outline: true },
    },
  };

  const first = derived.deriveReferenceOutline(baseInput);
  const second = derived.deriveReferenceOutline(baseInput);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.value, second.value);
  assert.equal(first.meta.outputHash, second.meta.outputHash);
  assert.equal(first.meta.invalidationKey, second.meta.invalidationKey);

  const changedParams = derived.deriveReferenceOutline({
    ...baseInput,
    params: {
      projectId: 'project-derived-deterministic',
      mode: 'expanded',
    },
  });
  assert.equal(changedParams.ok, true);
  assert.notEqual(first.meta.invalidationKey, changedParams.meta.invalidationKey);
});
