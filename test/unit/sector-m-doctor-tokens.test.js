const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function parseTokens(stdout) {
  const tokens = new Map();
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    tokens.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return tokens;
}

test('doctor emits sector-m tokens with valid domains', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_U_FAST_DURATION_MS: '10',
    },
  });

  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);

  assert.equal(tokens.get('SECTOR_M_STATUS_OK'), '1');
  assert.ok(
    ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'DONE'].includes(tokens.get('SECTOR_M_PHASE')),
    'SECTOR_M_PHASE domain mismatch',
  );
  assert.ok(
    [
      '',
      'GO:SECTOR_M_M0_DONE',
      'GO:SECTOR_M_M1_DONE',
      'GO:SECTOR_M_M2_DONE',
      'GO:SECTOR_M_M3_DONE',
      'GO:SECTOR_M_M4_DONE',
      'GO:SECTOR_M_M5_DONE',
      'GO:SECTOR_M_M6_DONE',
      'GO:SECTOR_M_M7_DONE',
      'GO:SECTOR_M_M7_NEXT_DONE',
      'GO:SECTOR_M_M8_KICKOFF_DONE',
      'GO:SECTOR_M_M8_DONE',
      'GO:SECTOR_M_M8_NEXT_DONE',
      'GO:SECTOR_M_DONE',
    ].includes(tokens.get('SECTOR_M_GO_TAG')),
    'SECTOR_M_GO_TAG domain mismatch',
  );
  assert.equal(tokens.get('M0_RUNNER_EXISTS'), '1');
  assert.equal(tokens.get('M0_TESTS_OK'), '1');
  assert.equal(tokens.get('M0_PROOF_OK'), '1');
});
