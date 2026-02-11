const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('collab event log replay is deterministic and matches command application hash', async () => {
  const collab = await loadModule('src/collab/eventLog.mjs');
  const core = await loadModule('src/core/runtime.mjs');

  const initialState = core.createInitialCoreState();
  const initialStateHash = core.hashCoreState(initialState);
  let currentState = initialState;
  let currentStateHash = initialStateHash;
  let eventLog = collab.createEmptyEventLog();

  const sequence = [
    {
      opId: 'evt-1',
      ts: '2026-02-13T10:10:00.000Z',
      actorId: 'writer-A',
      commandId: core.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: {
        projectId: 'project-collab-eventlog-test',
        title: 'EventLog',
        sceneId: 'scene-1',
      },
    },
    {
      opId: 'evt-2',
      ts: '2026-02-13T10:10:01.000Z',
      actorId: 'writer-A',
      commandId: core.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId: 'project-collab-eventlog-test',
        sceneId: 'scene-1',
        text: '# Hello\n',
      },
    },
  ];

  for (const step of sequence) {
    const applied = collab.applyCommandWithEventLog({
      eventLog,
      currentState,
      currentStateHash,
      opId: step.opId,
      ts: step.ts,
      actorId: step.actorId,
      commandId: step.commandId,
      payload: step.payload,
      applyCommand: (state, command) => core.reduceCoreState(state, command),
    });

    assert.equal(applied.ok, true, JSON.stringify(applied.error || {}));
    currentState = applied.state;
    currentStateHash = applied.stateHash;
    eventLog = applied.eventLog;
  }

  const replayA = collab.replayEventLog({ eventLog, initialStateHash });
  const replayB = collab.replayEventLog({ eventLog, initialStateHash });

  assert.equal(replayA.ok, true, JSON.stringify(replayA.error || {}));
  assert.equal(replayB.ok, true, JSON.stringify(replayB.error || {}));
  assert.equal(replayA.finalStateHash, replayB.finalStateHash);
  assert.equal(replayA.finalStateHash, currentStateHash);
  assert.equal(replayA.eventLogHash, replayB.eventLogHash);
});
