const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('collab apply pipeline is deterministic for identical inputs', async () => {
  const collab = await loadModule('src/collab/applyEventLog.mjs');
  const core = await loadModule('src/core/runtime.mjs');

  const initialState = core.createInitialCoreState();
  const initialStateHash = core.hashCoreState(initialState);
  const step1 = core.reduceCoreState(initialState, {
    type: core.CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: {
      projectId: 'collab-apply-deterministic',
      title: 'Deterministic',
      sceneId: 'scene-1',
    },
  });

  const events = [
    {
      eventId: 'ev-1',
      actorId: 'writer-A',
      ts: '2026-02-13T12:00:00.000Z',
      opId: 'op-1',
      commandId: core.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId: 'collab-apply-deterministic',
        title: 'Deterministic',
        sceneId: 'scene-1',
      },
      prevHash: initialStateHash,
    },
    {
      eventId: 'ev-2',
      actorId: 'writer-A',
      ts: '2026-02-13T12:00:01.000Z',
      opId: 'op-2',
      commandId: core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId: 'collab-apply-deterministic',
        sceneId: 'scene-1',
        text: '# Deterministic\n',
      },
      prevHash: step1.stateHash,
    },
  ];

  const run = () => collab.applyEventLog({
    coreState: initialState,
    events,
    initialStateHash,
    applyCommand: (state, command) => core.reduceCoreState(state, command),
    hashState: (value) => core.hashCoreState(value),
  });

  const first = run();
  const second = run();

  assert.equal(first.appliedCount, 2);
  assert.equal(second.appliedCount, 2);
  assert.equal(first.rejected.length, 0);
  assert.equal(second.rejected.length, 0);
  assert.equal(first.stateHash, second.stateHash);
  assert.deepEqual(first.nextState, second.nextState);
});
