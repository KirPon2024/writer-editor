const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('mindmap derived graph is deterministic for identical inputs', async () => {
  const runtime = await loadModule('src/core/runtime.mjs');
  const mindmap = await loadModule('src/derived/mindmap/deriveMindMapGraph.mjs');

  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId: 'project-mindmap-deterministic',
        title: 'MindMap Deterministic',
        sceneId: 'scene-1',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId: 'project-mindmap-deterministic',
        sceneId: 'scene-1',
        text: '# Heading A\n## Heading B\n',
      },
    },
  ]);
  assert.equal(built.ok, true);

  const input = {
    coreState: built.state,
    params: { projectId: 'project-mindmap-deterministic', layout: 'tree' },
    capabilitySnapshot: { platformId: 'node', capabilities: { mindmapView: true } },
  };

  const first = mindmap.deriveMindMapGraph(input);
  const second = mindmap.deriveMindMapGraph(input);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.value.nodes, second.value.nodes);
  assert.deepEqual(first.value.edges, second.value.edges);
  assert.equal(first.value.meta.graphHash, second.value.meta.graphHash);
  assert.equal(first.meta.invalidationKey, second.meta.invalidationKey);
});
