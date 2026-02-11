const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('mindmap derived invalidation key reacts to params/capability/core changes', async () => {
  const runtime = await loadModule('src/core/runtime.mjs');
  const mindmap = await loadModule('src/derived/mindmap/deriveMindMapGraph.mjs');

  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId: 'project-mindmap-invalidation',
        title: 'MindMap Invalidation',
        sceneId: 'scene-1',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId: 'project-mindmap-invalidation',
        sceneId: 'scene-1',
        text: '# Node 1\n',
      },
    },
  ]);
  assert.equal(built.ok, true);

  const base = {
    coreState: built.state,
    params: { projectId: 'project-mindmap-invalidation', layout: 'tree' },
    capabilitySnapshot: { platformId: 'node', capabilities: { mindmapView: true } },
  };

  const a = mindmap.deriveMindMapGraph(base);
  const b = mindmap.deriveMindMapGraph({
    ...base,
    params: { projectId: 'project-mindmap-invalidation', layout: 'radial' },
  });
  const c = mindmap.deriveMindMapGraph({
    ...base,
    capabilitySnapshot: { platformId: 'node', capabilities: { mindmapView: true, flavor: 'dense' } },
  });
  const changedCore = runtime.applyCoreSequence(built.state, [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId: 'project-mindmap-invalidation',
        sceneId: 'scene-1',
        text: '# Node 2\n',
      },
    },
  ]);
  assert.equal(changedCore.ok, true);
  const d = mindmap.deriveMindMapGraph({
    ...base,
    coreState: changedCore.state,
  });

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(c.ok, true);
  assert.equal(d.ok, true);
  assert.notEqual(a.meta.invalidationKey, b.meta.invalidationKey);
  assert.notEqual(a.meta.invalidationKey, c.meta.invalidationKey);
  assert.notEqual(a.meta.invalidationKey, d.meta.invalidationKey);
});
