const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadCoreRuntime() {
  const root = process.cwd();
  return import(pathToFileURL(path.join(root, 'src', 'core', 'runtime.mjs')).href);
}

test('perf fixture contract: schema and expectedStateHash are deterministic', async () => {
  const fixturePath = path.join(process.cwd(), 'scripts', 'perf', 'fixtures', 'mvp-hotpath.fixture.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  assert.equal(fixture.schemaVersion, 'perf-fixture.v1');
  assert.equal(typeof fixture.fixtureId, 'string');
  assert.ok(fixture.fixtureId.length > 0);
  assert.equal(typeof fixture.seed, 'string');
  assert.ok(fixture.seed.length > 0);
  assert.ok(Number.isInteger(fixture.runs) && fixture.runs >= 3);
  assert.ok(Array.isArray(fixture.coreCommands) && fixture.coreCommands.length > 0);
  assert.match(fixture.expectedStateHash, /^[a-f0-9]{64}$/u);

  const core = await loadCoreRuntime();
  let state = core.createInitialCoreState();
  for (const command of fixture.coreCommands) {
    const result = core.reduceCoreState(state, command);
    assert.equal(result.ok, true, `core command failed: ${JSON.stringify(result.error || null)}`);
    state = result.state;
  }
  const actualHash = core.hashCoreState(state);
  assert.equal(actualHash, fixture.expectedStateHash);
});
