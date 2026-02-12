const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runStateJson(args = [], env = {}) {
  const result = spawnSync(process.execPath, ['scripts/ops/macos-signing-readiness-state.mjs', '--json', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
  assert.equal(result.status, 0, `macos-signing-readiness-state failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(String(result.stdout || '{}'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

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

function makeReadyDoc(overrides = {}) {
  return {
    schemaVersion: 'macos-signing-readiness.v1',
    status: 'READY',
    requiredArtifacts: ['artifacts/notarization.json', 'artifacts/signing.json'],
    forbiddenPlaceholders: ['PLACEHOLDER_IDENTITY', 'TODO_NOTARIZATION'],
    notes: 'Machine-check ready profile',
    ...overrides,
  };
}

test('macos signing readiness: PLACEHOLDER status returns ok=false', () => {
  const payload = runStateJson();
  assert.equal(payload.status, 'PLACEHOLDER');
  assert.equal(payload.ok, false);
  assert.equal(payload.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK, 0);
});

test('macos signing readiness: READY with missing artifacts returns deterministic sorted missingArtifacts', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-signing-missing-'));
  const readinessPath = path.join(tmp, 'MACOS_SIGNING_READINESS.json');
  writeJson(readinessPath, makeReadyDoc({
    requiredArtifacts: ['b/missing-two.json', 'a/missing-one.json'],
  }));

  const payload = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp]);
  assert.equal(payload.status, 'READY');
  assert.equal(payload.ok, false);
  assert.deepEqual(payload.missingArtifacts, ['a/missing-one.json', 'b/missing-two.json']);
  assert.equal(payload.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK, 0);
});

test('macos signing readiness: READY with forbidden placeholder marker returns deterministic sorted findings', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-signing-placeholder-'));
  const artifactsDir = path.join(tmp, 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, 'notarization.json'), '{"team":"ok"}\n', 'utf8');
  fs.writeFileSync(path.join(artifactsDir, 'signing.json'), 'identity=PLACEHOLDER_IDENTITY\n', 'utf8');
  const readinessPath = path.join(tmp, 'MACOS_SIGNING_READINESS.json');
  writeJson(readinessPath, makeReadyDoc());

  const payload = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp]);
  assert.equal(payload.status, 'READY');
  assert.equal(payload.ok, false);
  assert.deepEqual(payload.placeholderFindings, ['artifacts/signing.json:PLACEHOLDER_IDENTITY']);
  assert.equal(payload.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK, 0);
});

test('macos signing readiness: valid READY configuration returns ok=true', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-signing-ready-'));
  const artifactsDir = path.join(tmp, 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, 'notarization.json'), '{"team":"TEAMID","bundle":"com.example.app"}\n', 'utf8');
  fs.writeFileSync(path.join(artifactsDir, 'signing.json'), '{"identity":"Developer ID Application: Example"}\n', 'utf8');
  const readinessPath = path.join(tmp, 'MACOS_SIGNING_READINESS.json');
  writeJson(readinessPath, makeReadyDoc());

  const payload = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp]);
  assert.equal(payload.status, 'READY');
  assert.equal(payload.missingArtifacts.length, 0);
  assert.equal(payload.placeholderFindings.length, 0);
  assert.equal(payload.ok, true);
  assert.equal(payload.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK, 1);
});

test('macos signing readiness: configSha256 is deterministic for identical config', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-signing-sha-'));
  const readinessPath = path.join(tmp, 'MACOS_SIGNING_READINESS.json');
  writeJson(readinessPath, makeReadyDoc({ status: 'PLACEHOLDER' }));

  const runA = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp]);
  const runB = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp]);
  assert.equal(runA.configSha256, runB.configSha256);
});

test('macos signing readiness token is emitted by truth-table, ops-summary and doctor', () => {
  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthPayload = JSON.parse(String(truth.stdout || '{}'));
  assert.ok(typeof truthPayload.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK === 'number');

  const summary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.ok(summary.status === 0 || summary.status === 1, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryTokens = parseTokens(summary.stdout);
  assert.ok(summaryTokens.has('OPS_SUMMARY_XPLAT_CONTRACT_MACOS_SIGNING_READY_OK'));

  const doctor = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCTOR_MODE: 'delivery',
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.ok(doctor.status === 0 || doctor.status === 1, `doctor failed:\n${doctor.stdout}\n${doctor.stderr}`);
  const doctorTokens = parseTokens(doctor.stdout);
  assert.ok(doctorTokens.has('XPLAT_CONTRACT_MACOS_SIGNING_READY_OK'));
});
