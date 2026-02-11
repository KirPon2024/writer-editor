const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModules() {
  const root = process.cwd();
  const canon = await import(pathToFileURL(path.join(root, 'src', 'shared', 'recoveryActionCanon.mjs')).href);
  const registry = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'registry.mjs')).href);
  const runner = await import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'runCommand.mjs')).href);
  const log = await import(pathToFileURL(path.join(root, 'src', 'io', 'markdown', 'reliabilityLog.mjs')).href);
  return { ...canon, ...registry, ...runner, ...log };
}

test('recovery action canon contract: canonical list and normalization are deterministic', async () => {
  const { RECOVERY_ACTION_CANON, normalizeRecoveryActions } = await loadModules();
  assert.deepEqual(RECOVERY_ACTION_CANON, ['RETRY', 'SAVE_AS', 'OPEN_SNAPSHOT', 'ABORT']);
  assert.deepEqual(
    normalizeRecoveryActions(['retry', 'DROP_TABLE', 'save_as', 'ABORT', 'RETRY']),
    ['RETRY', 'SAVE_AS', 'ABORT'],
  );
});

test('recovery action canon contract: command runner drops non-canonical recovery actions', async () => {
  const { createCommandRegistry, createCommandRunner } = await loadModules();
  const registry = createCommandRegistry();
  registry.registerCommand('cmd.recovery.contract', async () => ({
    ok: false,
    error: {
      code: 'E_IO_ATOMIC_WRITE_FAIL',
      op: 'cmd.recovery.contract',
      reason: 'atomic_write_failed',
      details: {
        recoveryActions: ['retry', 'save_as', 'OPEN_SNAPSHOT', 'DROP_TABLE', 'ABORT'],
      },
    },
  }));

  const runCommand = createCommandRunner(registry);
  const result = await runCommand('cmd.recovery.contract');

  assert.equal(result.ok, false);
  assert.deepEqual(result.error.details.recoveryActions, ['RETRY', 'SAVE_AS', 'OPEN_SNAPSHOT', 'ABORT']);
});

test('recovery action canon contract: reliability log normalizes recovery actions', async () => {
  const { buildReliabilityLogRecord } = await loadModules();
  const record = buildReliabilityLogRecord({
    op: 'm:cmd:project:export:markdownV1:v1',
    code: 'E_IO_ATOMIC_WRITE_FAIL',
    reason: 'atomic_write_failed',
    recoveryActions: ['retry', 'DROP_TABLE', 'save_as', 'ABORT'],
  });

  assert.deepEqual(record.recoveryActions, ['RETRY', 'SAVE_AS', 'ABORT']);
});
