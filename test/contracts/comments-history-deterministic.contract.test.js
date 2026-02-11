const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('comments/history derived views are deterministic for identical inputs', async () => {
  const runtime = await loadModule('src/core/runtime.mjs');
  const comments = await loadModule('src/derived/commentsHistory/deriveComments.mjs');
  const history = await loadModule('src/derived/commentsHistory/deriveHistory.mjs');

  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId: 'project-comments-history-deterministic',
        title: 'Comments History Deterministic',
        sceneId: 'scene-1',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId: 'project-comments-history-deterministic',
        sceneId: 'scene-1',
        text: '# Heading A\nLine\n',
      },
    },
  ]);
  assert.equal(built.ok, true);

  const input = {
    coreState: built.state,
    params: { projectId: 'project-comments-history-deterministic', filter: 'all' },
    capabilitySnapshot: { platformId: 'node', capabilities: { commentsView: true, historyView: true } },
  };

  const commentsA = comments.deriveComments(input);
  const commentsB = comments.deriveComments(input);
  assert.equal(commentsA.ok, true);
  assert.equal(commentsB.ok, true);
  assert.deepEqual(commentsA.value, commentsB.value);
  assert.equal(commentsA.meta.outputHash, commentsB.meta.outputHash);
  assert.equal(commentsA.meta.invalidationKey, commentsB.meta.invalidationKey);

  const historyA = history.deriveHistory(input);
  const historyB = history.deriveHistory(input);
  assert.equal(historyA.ok, true);
  assert.equal(historyB.ok, true);
  assert.deepEqual(historyA.value, historyB.value);
  assert.equal(historyA.meta.outputHash, historyB.meta.outputHash);
  assert.equal(historyA.meta.invalidationKey, historyB.meta.invalidationKey);
});
