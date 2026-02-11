const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(filePath) {
  return import(pathToFileURL(path.join(process.cwd(), filePath)).href);
}

test('collab apply pipeline returns typed rejection envelopes for invalid events and command failures', async () => {
  const collab = await loadModule('src/collab/applyEventLog.mjs');
  const core = await loadModule('src/core/runtime.mjs');

  const initialState = core.createInitialCoreState();
  const initialStateHash = core.hashCoreState(initialState);

  const result = collab.applyEventLog({
    coreState: initialState,
    initialStateHash,
    events: [
      {
        eventId: '',
        actorId: 'writer-A',
        ts: '2026-02-13T12:10:00.000Z',
        opId: 'op-invalid',
        commandId: core.CORE_COMMAND_IDS.PROJECT_CREATE,
        payload: {},
      },
      {
        eventId: 'ev-prev',
        actorId: 'writer-A',
        ts: '2026-02-13T12:10:01.000Z',
        opId: 'op-prev',
        commandId: core.CORE_COMMAND_IDS.PROJECT_CREATE,
        payload: {},
        prevHash: 'wrong-hash',
      },
      {
        eventId: 'ev-command',
        actorId: 'writer-A',
        ts: '2026-02-13T12:10:02.000Z',
        opId: 'op-command',
        commandId: 'project.unknown',
        payload: {},
      },
    ],
    applyCommand: (state, command) => core.reduceCoreState(state, command),
    hashState: (value) => core.hashCoreState(value),
  });

  assert.equal(result.appliedCount, 0);
  assert.equal(result.rejected.length, 3);

  for (const rejection of result.rejected) {
    assert.equal(typeof rejection.code, 'string');
    assert.equal(typeof rejection.opId, 'string');
    assert.equal(typeof rejection.eventId, 'string');
    assert.equal(typeof rejection.commandId, 'string');
    assert.equal(typeof rejection.reason, 'string');
    assert.equal(typeof rejection.details, 'object');
    assert.equal(Array.isArray(rejection.details), false);
  }

  assert.equal(result.rejected[0].code, 'E_COLLAB_APPLY_EVENT_INVALID');
  assert.equal(result.rejected[1].code, 'E_COLLAB_APPLY_PREV_HASH_MISMATCH');
  assert.equal(result.rejected[2].code, 'E_COLLAB_APPLY_COMMAND_REJECTED');
});
