const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadIoModule() {
  const root = process.cwd();
  return import(pathToFileURL(path.join(root, 'src', 'io', 'markdown', 'index.mjs')).href);
}

test('M6 reliability log record matches deterministic fixture schema', async () => {
  const io = await loadIoModule();
  const expected = JSON.parse(fs.readFileSync(
    path.join(process.cwd(), 'test', 'fixtures', 'sector-m', 'm6', 'expected-log-record.json'),
    'utf8',
  ));

  const actual = io.buildReliabilityLogRecord({
    op: 'm:cmd:project:export:markdownV1:v1',
    code: 'E_IO_ATOMIC_WRITE_FAIL',
    reason: 'atomic_write_failed',
    safetyMode: 'compat',
    recoveryActions: ['retry', 'save_as'],
  });

  assert.deepEqual(actual, expected);
});

test('M6 reliability log appends JSONL without random fields', async () => {
  const io = await loadIoModule();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-m-m6-log-'));
  const logPath = path.join(dir, 'markdown-io.log');
  const record = io.buildReliabilityLogRecord({
    op: 'm:cmd:project:import:markdownV1:v1',
    code: 'E_IO_CORRUPT_INPUT',
    reason: 'corrupt_input_null_byte',
    safetyMode: 'strict',
    recoveryActions: ['OPEN_SNAPSHOT', 'RETRY'],
  });

  await io.appendReliabilityLog(record, { logPath });
  const lines = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);

  assert.equal(parsed.schemaVersion, 'sector-m-reliability-log.v1');
  assert.equal(parsed.op, 'm:cmd:project:import:markdownV1:v1');
  assert.equal(parsed.code, 'E_IO_CORRUPT_INPUT');
  assert.equal(parsed.reason, 'corrupt_input_null_byte');
  assert.equal(parsed.safetyMode, 'strict');
  assert.deepEqual(parsed.recoveryActions, ['OPEN_SNAPSHOT', 'RETRY']);
});
