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
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    tokens.set(key, value);
  }
  return tokens;
}

function runDoctorWithEnv(extraEnv) {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_U_FAST_DURATION_MS: '10',
      ...extraEnv,
    },
  });
  return result;
}

function parseJsonToken(tokens, key) {
  const raw = tokens.get(key);
  assert.notEqual(raw, undefined, `missing token: ${key}`);
  return JSON.parse(raw);
}

test('doctor emits sector-u tokens and honest next-sector readiness when prereq sources are missing', () => {
  const fixtureRoot = path.join(process.cwd(), 'test', 'fixtures', 'sector-next');
  const expectedUnmet = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, 'prereqs-missing-all.json'), 'utf8'),
  );

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-next-missing-'));
  const result = runDoctorWithEnv({
    NEXT_SECTOR_STATUS_PATH: path.join(fixtureRoot, 'next-sector-valid.json'),
    SECTOR_P_STATUS_PATH: path.join(tmpRoot, 'sector-p.json'),
    SECTOR_W_STATUS_PATH: path.join(tmpRoot, 'sector-w.json'),
    CONTOUR_C_STATUS_PATH: path.join(tmpRoot, 'contour-c.json'),
  });

  assert.equal(result.status, 0, `Unexpected fail: ${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);

  for (const key of [
    'SECTOR_U_STATUS_OK',
    'SECTOR_U_PHASE',
    'SECTOR_U_BASELINE_SHA',
    'SECTOR_U_GO_TAG',
    'SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK',
    'SECTOR_U_FAST_DURATION_MS',
    'SECTOR_U_FAST_DURATION_OK',
    'NEXT_SECTOR_ID',
    'NEXT_SECTOR_GO_TAG',
    'NEXT_SECTOR_STATUS_OK',
    'NEXT_SECTOR_READY',
    'NEXT_SECTOR_UNMET_PREREQS',
  ]) {
    assert.equal(tokens.has(key), true, `missing token: ${key}`);
  }

  assert.equal(tokens.get('NEXT_SECTOR_ID'), 'SECTOR U');
  assert.equal(tokens.get('NEXT_SECTOR_GO_TAG'), 'GO:NEXT_SECTOR_START');
  assert.equal(tokens.get('NEXT_SECTOR_STATUS_OK'), '1');
  assert.equal(tokens.get('NEXT_SECTOR_READY'), '0');
  assert.equal(tokens.get('SECTOR_U_STATUS_OK'), '1');
  assert.equal(tokens.get('SECTOR_U_PHASE'), 'U0');
  assert.equal(tokens.get('SECTOR_U_NO_RUNTIME_PRODUCT_WAIVERS_OK'), '1');
  assert.equal(tokens.get('SECTOR_U_FAST_DURATION_OK'), '1');

  const unmet = parseJsonToken(tokens, 'NEXT_SECTOR_UNMET_PREREQS');
  assert.ok(Array.isArray(unmet));
  assert.ok(unmet.length > 0);
  assert.deepEqual(unmet, [...unmet].sort());
  for (const expression of expectedUnmet) {
    assert.ok(unmet.includes(expression), `missing unmet prereq: ${expression}`);
  }
});

test('doctor rejects invalid prereq expression syntax for next-sector status shape', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sector-next-invalid-'));
  const invalidNextSectorPath = path.join(tmpRoot, 'next-sector-invalid.json');
  const invalidDoc = {
    schemaVersion: 'next-sector.v1',
    id: 'SECTOR U',
    goTag: 'GO:NEXT_SECTOR_START',
    prereqs: [
      'SECTOR_P_CLOSE_OK ==1',
      'SECTOR_P_CLOSED_MUTATION==0',
      'SECTOR_W_CLOSE_OK==1',
      'SECTOR_W_CLOSED_MUTATION==0',
      'CONTOUR_C_STATUS==CLOSED',
      'STRICT_LIE_CLASSES_OK==1',
    ],
  };
  fs.writeFileSync(invalidNextSectorPath, `${JSON.stringify(invalidDoc, null, 2)}\n`, 'utf8');

  const result = runDoctorWithEnv({
    NEXT_SECTOR_STATUS_PATH: invalidNextSectorPath,
    SECTOR_P_STATUS_PATH: path.join(tmpRoot, 'sector-p.json'),
    SECTOR_W_STATUS_PATH: path.join(tmpRoot, 'sector-w.json'),
    CONTOUR_C_STATUS_PATH: path.join(tmpRoot, 'contour-c.json'),
  });

  assert.equal(result.status, 0, `Unexpected fail: ${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('NEXT_SECTOR_STATUS_OK'), '0');
  assert.equal(tokens.get('NEXT_SECTOR_READY'), '0');
  const unmet = parseJsonToken(tokens, 'NEXT_SECTOR_UNMET_PREREQS');
  assert.ok(unmet.includes('SECTOR_P_CLOSE_OK ==1'));
});

test('doctor marks next-sector ready when canonical prereq sources are present', () => {
  const fixtureRoot = path.join(process.cwd(), 'test', 'fixtures', 'sector-next');
  const expectedUnmet = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, 'prereqs-all-met.json'), 'utf8'),
  );

  const result = runDoctorWithEnv({
    NEXT_SECTOR_STATUS_PATH: path.join(fixtureRoot, 'next-sector-valid.json'),
    SECTOR_P_STATUS_PATH: path.join(fixtureRoot, 'sector-p-status-done.json'),
    SECTOR_W_STATUS_PATH: path.join(fixtureRoot, 'sector-w-status-done.json'),
    CONTOUR_C_STATUS_PATH: path.join(fixtureRoot, 'contour-c-status-closed.json'),
  });

  assert.equal(result.status, 0, `Unexpected fail: ${result.stdout}\n${result.stderr}`);
  const tokens = parseTokens(result.stdout);
  assert.equal(tokens.get('NEXT_SECTOR_STATUS_OK'), '1');
  assert.equal(tokens.get('NEXT_SECTOR_READY'), '1');
  const unmet = parseJsonToken(tokens, 'NEXT_SECTOR_UNMET_PREREQS');
  assert.deepEqual(unmet, expectedUnmet);
});
