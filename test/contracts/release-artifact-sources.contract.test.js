const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CONFIG_POLICY_VERSION = 'release-artifact-sources-config.v1';

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableSortValue(item));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableSortValue(value[key]);
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortValue(value));
}

function normalizeArtifactsForConfigHash(artifacts) {
  return (Array.isArray(artifacts) ? artifacts : [])
    .map((item) => ({
      artifactId: typeof item?.artifactId === 'string' ? item.artifactId.trim() : '',
      sourceType: typeof item?.sourceType === 'string' ? item.sourceType.trim() : '',
      sourceRef: typeof item?.sourceRef === 'string' ? item.sourceRef.trim() : '',
      proofType: typeof item?.proof?.proofType === 'string' ? item.proof.proofType.trim() : '',
    }))
    .sort((a, b) => {
      const ak = `${a.artifactId}\u0000${a.sourceType}\u0000${a.sourceRef}`;
      const bk = `${b.artifactId}\u0000${b.sourceType}\u0000${b.sourceRef}`;
      if (ak < bk) return -1;
      if (ak > bk) return 1;
      return 0;
    });
}

function computeConfigHash(doc) {
  const normalized = {
    policyVersion: CONFIG_POLICY_VERSION,
    baselineSha: String(doc?.baselineSha || '').trim().toLowerCase(),
    artifacts: normalizeArtifactsForConfigHash(doc?.artifacts),
  };
  return sha256Hex(stableStringify(normalized));
}

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
  const base = {
    schemaVersion: 'release-artifact-sources.v1',
    status: 'READY',
    baselineSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    artifacts: [
      {
        artifactId: 'desktop-macos-main-baseline',
        sourceType: 'commit',
        sourceRef: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        proof: {
          proofType: 'static_policy_check',
          notes: 'Readiness mapping baseline',
        },
      },
    ],
  };
  const merged = {
    ...base,
    ...overrides,
    artifacts: Array.isArray(overrides.artifacts) ? overrides.artifacts : base.artifacts,
  };
  merged.configHash = computeConfigHash(merged);
  return merged;
}

test('release artifact sources: PLACEHOLDER returns token=0', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-placeholder-'));
  const specPath = path.join(tmp, 'RELEASE_ARTIFACT_SOURCES.json');
  writeJson(specPath, buildSpec({
    status: 'PLACEHOLDER',
    artifacts: [],
  }));

  const payload = runStateJson(['--spec-path', specPath, '--repo-root', tmp, '--head-strict-ok', '1']);
  assert.equal(payload.ok, false);
  assert.equal(payload.status, 'PLACEHOLDER');
  assert.equal(payload.RELEASE_ARTIFACT_SOURCES_OK, 0);
});

test('release artifact sources: READY valid data returns token=1', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-ready-'));
  const specPath = path.join(tmp, 'RELEASE_ARTIFACT_SOURCES.json');
  writeJson(specPath, buildSpec({
    baselineSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    artifacts: [
      {
        artifactId: 'desktop-macos-main-baseline',
        sourceType: 'tag',
        sourceRef: 'release/2026.02.12',
        proof: {
          proofType: 'deterministic_hash_check',
          notes: 'Tag anchored mapping',
        },
      },
    ],
  }));

  const payload = runStateJson(['--spec-path', specPath, '--repo-root', tmp, '--head-strict-ok', '1']);
  assert.equal(payload.ok, true);
  assert.equal(payload.RELEASE_ARTIFACT_SOURCES_OK, 1);
  assert.equal(payload.status, 'READY');
  assert.equal(payload.evidence.artifactsCount, 1);
});

test('release artifact sources: broken fields fail with deterministic sorted fail codes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-invalid-'));
  const specPath = path.join(tmp, 'RELEASE_ARTIFACT_SOURCES.json');
  const invalid = buildSpec({
    baselineSha: 'not-a-sha',
    artifacts: [
      {
        artifactId: 'duplicate-id',
        sourceType: 'bad_type',
        sourceRef: '',
        proof: {
          proofType: 'unknown',
          notes: '',
        },
      },
      {
        artifactId: 'duplicate-id',
        sourceType: 'source_link',
        sourceRef: 'https://example.com/*',
        proof: {
          proofType: 'static_policy_check',
          notes: 'ok',
        },
      },
    ],
  });
  invalid.configHash = 'f'.repeat(64);
  writeJson(specPath, invalid);

  const payload = runStateJson(['--spec-path', specPath, '--repo-root', tmp, '--head-strict-ok', '1']);
  assert.equal(payload.ok, false);
  assert.equal(payload.RELEASE_ARTIFACT_SOURCES_OK, 0);
  assert.ok(payload.failures.includes('E_RELEASE_ARTIFACT_BASELINE_SHA_INVALID'));
  assert.ok(payload.failures.includes('E_RELEASE_ARTIFACT_SOURCE_TYPE_INVALID'));
  assert.ok(payload.failures.includes('E_RELEASE_ARTIFACT_CONFIG_HASH_MISMATCH'));
  assert.deepEqual(payload.failures, [...payload.failures].sort());
  assert.deepEqual(payload.missingFields, [...payload.missingFields].sort());
});

test('release artifact sources: configHash determinism and stable output', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-deterministic-'));
  const specPath = path.join(tmp, 'RELEASE_ARTIFACT_SOURCES.json');
  const spec = buildSpec({
    baselineSha: 'cccccccccccccccccccccccccccccccccccccccc',
    artifacts: [
      {
        artifactId: 'artifact-b',
        sourceType: 'commit',
        sourceRef: 'cccccccccccccccccccccccccccccccccccccccc',
        proof: {
          proofType: 'static_policy_check',
          notes: 'B',
        },
      },
      {
        artifactId: 'artifact-a',
        sourceType: 'source_link',
        sourceRef: 'https://example.com/source/a',
        proof: {
          proofType: 'static_policy_check',
          notes: 'A',
        },
      },
    ],
  });
  writeJson(specPath, spec);

  const a = runStateJson(['--spec-path', specPath, '--repo-root', tmp, '--head-strict-ok', '1']);
  const b = runStateJson(['--spec-path', specPath, '--repo-root', tmp, '--head-strict-ok', '1']);
  assert.equal(a.configHash, computeConfigHash(spec));
  assert.equal(a.configHash, b.configHash);
  assert.deepEqual(a, b);
});

test('release artifact sources: head-binding semantics enforced', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-head-'));
  const specPath = path.join(tmp, 'RELEASE_ARTIFACT_SOURCES.json');
  writeJson(specPath, buildSpec());

  const payload = runStateJson(['--spec-path', specPath, '--repo-root', tmp, '--head-strict-ok', '0']);
  assert.equal(payload.ok, false);
  assert.equal(payload.RELEASE_ARTIFACT_SOURCES_OK, 0);
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
