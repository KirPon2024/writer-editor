const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runStateJson(args = [], env = {}) {
  const result = spawnSync(process.execPath, ['scripts/ops/release-artifact-sources-state.mjs', '--json', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
  assert.equal(result.status, 0, `release-artifact-sources-state failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(String(result.stdout || '{}'));
}

function parseTokens(stdout) {
  const out = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const normalized = line.startsWith('DOCTOR_TOKEN ')
      ? line.slice('DOCTOR_TOKEN '.length).trim()
      : line;
    const idx = normalized.indexOf('=');
    if (idx <= 0) continue;
    out.set(normalized.slice(0, idx), normalized.slice(idx + 1));
  }
  return out;
}

function buildSpec(overrides = {}) {
  return {
    schemaVersion: 'release-artifact-sources.v1',
    status: 'PLACEHOLDER',
    artifacts: [],
    updatedAt: '2026-02-12T00:00:00.000Z',
    ...overrides,
  };
}

test('release artifact sources: PLACEHOLDER returns ok=false', () => {
  const payload = runStateJson();
  assert.equal(payload.ok, false);
  assert.equal(payload.status, 'PLACEHOLDER');
  assert.equal(payload.RELEASE_ARTIFACT_SOURCES_OK, 0);
});

test('release artifact sources: READY with invalid commit shape fails and reports sorted failures', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-invalid-'));
  const specPath = path.join(tmp, 'RELEASE_ARTIFACT_SOURCES.json');
  writeJson(specPath, buildSpec({
    status: 'READY',
    artifacts: [
      {
        artifactId: 'desktop-macos-arm64',
        sourceRepo: 'KirPon2024/writer-editor',
        sourceCommit: '1234',
      },
      {
        artifactId: 'desktop-macos-arm64',
        sourceRepo: '',
        sourceCommit: 'not-a-sha',
        sourceTag: 'v1.0.0',
      },
    ],
  }));

  const payload = runStateJson(['--spec-path', specPath, '--repo-root', tmp]);
  assert.equal(payload.ok, false);
  assert.equal(payload.sourceCommitShapeOk, false);
  assert.equal(payload.releaseTagShapeOk, false);
  assert.equal(payload.uniqueArtifactIdsOk, false);
  const sorted = [...payload.failures].sort();
  assert.deepEqual(payload.failures, sorted);
});

test('release artifact sources: valid READY returns ok=true', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-ready-'));
  const sourcePath = path.join(tmp, 'dist');
  fs.mkdirSync(sourcePath, { recursive: true });
  fs.writeFileSync(path.join(sourcePath, 'app.dmg.sha256'), 'abc\n', 'utf8');

  const specPath = path.join(tmp, 'RELEASE_ARTIFACT_SOURCES.json');
  writeJson(specPath, buildSpec({
    status: 'READY',
    artifacts: [
      {
        artifactId: 'desktop-macos-arm64',
        sourceRepo: 'KirPon2024/writer-editor',
        sourceCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        sourceTag: 'release/2026.02.12',
        sourcePath: 'dist/app.dmg.sha256',
        evidenceLinks: ['https://github.com/KirPon2024/writer-editor/releases/tag/release/2026.02.12'],
      },
    ],
  }));

  const payload = runStateJson(['--spec-path', specPath, '--repo-root', tmp]);
  assert.equal(payload.ok, true);
  assert.equal(payload.RELEASE_ARTIFACT_SOURCES_OK, 1);
  assert.equal(payload.artifactsCount, 1);
  assert.equal(payload.schemaOk, true);
  assert.equal(payload.sourceCommitShapeOk, true);
  assert.equal(payload.releaseTagShapeOk, true);
  assert.match(payload.fileSha256, /^[0-9a-f]{64}$/u);
});

test('release artifact sources: deterministic hash and deterministic output for same input', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-deterministic-'));
  const specPath = path.join(tmp, 'RELEASE_ARTIFACT_SOURCES.json');
  writeJson(specPath, buildSpec({
    status: 'READY',
    artifacts: [
      {
        artifactId: 'desktop-macos-arm64',
        sourceRepo: 'KirPon2024/writer-editor',
        sourceCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    ],
  }));

  const a = runStateJson(['--spec-path', specPath, '--repo-root', tmp]);
  const b = runStateJson(['--spec-path', specPath, '--repo-root', tmp]);
  assert.deepEqual(a, b);
});

test('release artifact sources: FREEZE_MODE=1 enforces HEAD_STRICT_OK binding', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-freeze-'));
  const specPath = path.join(tmp, 'RELEASE_ARTIFACT_SOURCES.json');
  writeJson(specPath, buildSpec({
    status: 'READY',
    artifacts: [
      {
        artifactId: 'desktop-macos-arm64',
        sourceRepo: 'KirPon2024/writer-editor',
        sourceCommit: 'cccccccccccccccccccccccccccccccccccccccc',
      },
    ],
  }));

  const payload = runStateJson(
    ['--spec-path', specPath, '--repo-root', tmp, '--head-strict-ok', '0'],
    { FREEZE_MODE: '1' },
  );
  assert.equal(payload.ok, false);
  assert.equal(payload.headBindingOk, false);
  assert.ok(payload.failures.includes('E_RELEASE_ARTIFACT_HEAD_STRICT_REQUIRED'));
});

test('release artifact sources token is emitted by truth-table, ops-summary, and doctor', () => {
  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthPayload = JSON.parse(String(truth.stdout || '{}'));
  assert.ok(typeof truthPayload.RELEASE_ARTIFACT_SOURCES_OK === 'number');

  const summary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.ok(summary.status === 0 || summary.status === 1, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryTokens = parseTokens(summary.stdout);
  assert.ok(summaryTokens.has('OPS_SUMMARY_RELEASE_ARTIFACT_SOURCES_OK'));

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
  assert.ok(doctorTokens.has('RELEASE_ARTIFACT_SOURCES_OK'));
});
