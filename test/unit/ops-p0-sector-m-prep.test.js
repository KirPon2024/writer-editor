const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function parseTokens(stdout) {
  const tokens = new Map();
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    tokens.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return tokens;
}

function runDoctor(extraEnv = {}) {
  return spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_U_FAST_DURATION_MS: '10',
      ...extraEnv,
    },
  });
}

test('doctor emits OPS P0 sector-m prep tokens as PASS on repo baseline', () => {
  const result = runDoctor();
  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);

  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('CANON_ENTRYPOINT_POLICY_OK'), '1');
  assert.equal(tokens.get('U_DETECT_ONLY_CARVEOUT_OK'), '1');
  assert.equal(tokens.get('FULL_POLICY_NO_DUPLICATION_OK'), '1');
  assert.equal(tokens.get('CANON_ENTRYPOINT_SPLIT_BRAIN_DETECTED'), '0');
});

test('doctor detects split-brain when secondary entrypoint is marked MUST', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-p0-sector-m-'));

  const policyPath = path.join(tmpRoot, 'CANON_ENTRYPOINT_POLICY.md');
  fs.writeFileSync(policyPath, [
    'ENTRYPOINT_POLICY_SCHEMA=entrypoint-policy.v1',
    'ENTRYPOINT_MUST=CANON.md',
    'ENTRYPOINT_SECOND_MUST_ALLOWED=0',
  ].join('\n'));

  const carveoutPath = path.join(tmpRoot, 'U_DETECT_ONLY_CARVEOUT.md');
  fs.writeFileSync(carveoutPath, [
    'CARVEOUT_SCHEMA=u-detect-only-carveout.v1',
    'WHAT=x',
    'WHY=y',
    'UNTIL=z',
    'NON_BLOCKING_FOR_SECTOR_M=1',
    'FAIL_REASON=E_U_DETECT_ONLY_CARVEOUT_MISSING',
  ].join('\n'));

  const fullPolicyPath = path.join(tmpRoot, 'FULL_POLICY_NO_DUPLICATION.md');
  fs.writeFileSync(fullPolicyPath, [
    'FULL_POLICY_SCHEMA=full-policy.v1',
    'FULL_ONLY=1',
    'NO_DUPLICATION=1',
    'ENFORCE_TOKEN=FULL_POLICY_NO_DUPLICATION_OK',
    'FAIL_REASON=E_FULL_POLICY_NO_DUPLICATION_MISSING',
  ].join('\n'));

  const secondEntrypointPath = path.join(tmpRoot, 'CRAFTSMAN.md');
  fs.writeFileSync(secondEntrypointPath, 'ENTRYPOINT_MUST=1\n', 'utf8');

  const result = runDoctor({
    CANON_ENTRYPOINT_POLICY_PATH: policyPath,
    U_DETECT_ONLY_CARVEOUT_PATH: carveoutPath,
    FULL_POLICY_NO_DUPLICATION_PATH: fullPolicyPath,
    SECOND_ENTRYPOINT_PATH: secondEntrypointPath,
  });

  assert.equal(result.status, 0, `doctor failed:\n${result.stdout}\n${result.stderr}`);

  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('CANON_ENTRYPOINT_POLICY_OK'), '0');
  assert.equal(tokens.get('CANON_ENTRYPOINT_SPLIT_BRAIN_DETECTED'), '1');
  assert.equal(tokens.get('U_DETECT_ONLY_CARVEOUT_OK'), '1');
  assert.equal(tokens.get('FULL_POLICY_NO_DUPLICATION_OK'), '1');
});
