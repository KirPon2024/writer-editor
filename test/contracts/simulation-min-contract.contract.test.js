const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

function parseTokens(stdout) {
  const map = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const normalized = line.startsWith('DOCTOR_TOKEN ')
      ? line.slice('DOCTOR_TOKEN '.length).trim()
      : line;
    const idx = normalized.indexOf('=');
    if (idx <= 0) continue;
    map.set(normalized.slice(0, idx), normalized.slice(idx + 1));
  }
  return map;
}

test('simulation min contract schema and proof hooks are auto-runnable', () => {
  const contract = JSON.parse(fs.readFileSync('docs/OPS/STATUS/SIMULATION_MIN_CONTRACT.json', 'utf8'));
  assert.equal(contract.schemaVersion, 'simulation-min-contract.v1');
  assert.ok(Array.isArray(contract.scenarios));
  assert.ok(contract.scenarios.length >= 4);

  for (const scenario of contract.scenarios) {
    assert.equal(typeof scenario.scenarioId, 'string');
    assert.equal(typeof scenario.inputsRef, 'string');
    assert.equal(typeof scenario.proofHook, 'string');
    assert.equal(scenario.deterministic, true);
    assert.ok(Array.isArray(scenario.expectedTokens));
    assert.ok(scenario.expectedTokens.length > 0);

    const proofArgs = scenario.proofHook.trim().split(/\s+/u);
    assert.equal(proofArgs[0], 'node');

    const run = spawnSync(process.execPath, proofArgs.slice(1), {
      encoding: 'utf8',
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
    });
    assert.equal(run.status, 0, `${scenario.scenarioId} proofHook failed:\n${run.stdout}\n${run.stderr}`);
  }
});

test('simulation min contract state emits deterministic authoritative token', () => {
  const runA = spawnSync(process.execPath, ['scripts/ops/simulation-min-contract-state.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  assert.equal(runA.status, 0, `simulation state failed:\n${runA.stdout}\n${runA.stderr}`);
  const payloadA = JSON.parse(String(runA.stdout || '{}'));
  assert.equal(payloadA.toolVersion, 'simulation-min-contract-state.v1');
  assert.equal(payloadA.SIMULATION_MIN_CONTRACT_OK, 1);
  assert.ok(payloadA.SIMULATION_SCENARIOS_TOTAL >= 4);
  assert.equal(payloadA.SIMULATION_SCENARIOS_TOTAL, payloadA.SIMULATION_SCENARIOS_PASS);

  const runB = spawnSync(process.execPath, ['scripts/ops/simulation-min-contract-state.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  assert.equal(runB.status, 0, `second simulation state run failed:\n${runB.stdout}\n${runB.stderr}`);
  const payloadB = JSON.parse(String(runB.stdout || '{}'));

  assert.deepEqual(payloadA.failReasons, payloadB.failReasons);
  assert.deepEqual(payloadA.scenarioResults, payloadB.scenarioResults);
  assert.equal(payloadA.SIMULATION_MIN_CONTRACT_OK, payloadB.SIMULATION_MIN_CONTRACT_OK);
});

test('simulation min contract token is emitted in truth-table and ops-summary', () => {
  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const table = JSON.parse(String(truth.stdout || '{}'));
  assert.equal(table.SIMULATION_MIN_CONTRACT_OK, 1);

  const summary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });
  assert.ok(summary.status === 0 || summary.status === 1, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryTokens = parseTokens(summary.stdout);
  assert.equal(summaryTokens.get('OPS_SUMMARY_SIMULATION_MIN_CONTRACT_OK'), '1');
});
