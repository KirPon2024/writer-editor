const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CONFIG_POLICY_VERSION = 'collab-causal-queue-readiness-config.v1';

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

function computeConfigHash(doc) {
  const normalized = {
    policyVersion: CONFIG_POLICY_VERSION,
    schemaVersion: String(doc?.schemaVersion || '').trim(),
    status: String(doc?.status || '').trim().toUpperCase(),
    design: {
      queueModel: String(doc?.design?.queueModel || '').trim().toUpperCase(),
      orderingKey: String(doc?.design?.orderingKey || '').trim(),
      conflictPolicy: String(doc?.design?.conflictPolicy || '').trim().toUpperCase(),
      noNetwork: doc?.design?.noNetwork === true,
    },
    proofRequirements: {
      deterministicReplayRequired: doc?.proofRequirements?.deterministicReplayRequired === true,
      typedRejectionEnvelopeRequired: doc?.proofRequirements?.typedRejectionEnvelopeRequired === true,
      noSecondSotRequired: doc?.proofRequirements?.noSecondSotRequired === true,
    },
  };
  const baselineSha = String(doc?.baselineSha || '').trim().toLowerCase();
  return sha256Hex(`${stableStringify(normalized)}|${baselineSha}`);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

function runStateJson(args = []) {
  const result = spawnSync(process.execPath, ['scripts/ops/collab-causal-queue-readiness-state.mjs', '--json', ...args], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `collab-causal-queue-readiness-state failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(String(result.stdout || '{}'));
}

function buildDoc(overrides = {}) {
  const base = {
    schemaVersion: 'collab-causal-queue-readiness.v1',
    status: 'READY',
    baselineSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    design: {
      queueModel: 'PER_ACTOR_FIFO',
      orderingKey: '(actorId,seq)',
      conflictPolicy: 'BUFFER',
      noNetwork: true,
    },
    proofRequirements: {
      deterministicReplayRequired: true,
      typedRejectionEnvelopeRequired: true,
      noSecondSotRequired: true,
    },
  };
  const merged = {
    ...base,
    ...overrides,
    design: {
      ...base.design,
      ...(overrides.design || {}),
    },
    proofRequirements: {
      ...base.proofRequirements,
      ...(overrides.proofRequirements || {}),
    },
  };
  merged.configHash = computeConfigHash(merged);
  return merged;
}

test('collab causal queue readiness: PLACEHOLDER returns token=0', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-causal-queue-placeholder-'));
  const readinessPath = path.join(tmp, 'COLLAB_CAUSAL_QUEUE_READINESS.json');
  writeJson(readinessPath, buildDoc({ status: 'PLACEHOLDER' }));

  const payload = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp]);
  assert.equal(payload.ok, false);
  assert.equal(payload.status, 'PLACEHOLDER');
  assert.equal(payload.token.COLLAB_CAUSAL_QUEUE_READINESS_OK, 0);
  assert.ok(payload.failures.includes('E_COLLAB_CAUSAL_QUEUE_READINESS_STATUS_NOT_READY'));
});

test('collab causal queue readiness: valid READY returns token=1', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-causal-queue-ready-'));
  const readinessPath = path.join(tmp, 'COLLAB_CAUSAL_QUEUE_READINESS.json');
  const doc = buildDoc({ baselineSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
  writeJson(readinessPath, doc);

  const payload = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp]);
  assert.equal(payload.ok, true);
  assert.equal(payload.status, 'READY');
  assert.equal(payload.token.COLLAB_CAUSAL_QUEUE_READINESS_OK, 1);
  assert.equal(payload.configHashOk, true);
  assert.equal(payload.evidence.configHash, computeConfigHash(doc));
});

test('collab causal queue readiness: invalid schema/missing fields produce deterministic failures', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-causal-queue-invalid-'));
  const readinessPath = path.join(tmp, 'COLLAB_CAUSAL_QUEUE_READINESS.json');
  const invalid = {
    schemaVersion: 'wrong-schema',
    status: 'READY',
    baselineSha: 'not-a-sha',
    design: {
      queueModel: 'UNKNOWN',
      orderingKey: 'UNKNOWN',
      conflictPolicy: 'NOPE',
      noNetwork: false,
    },
    proofRequirements: {
      deterministicReplayRequired: false,
    },
    configHash: 'f'.repeat(64),
  };
  writeJson(readinessPath, invalid);

  const payload = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp]);
  assert.equal(payload.ok, false);
  assert.equal(payload.token.COLLAB_CAUSAL_QUEUE_READINESS_OK, 0);
  assert.deepEqual(payload.failures, [...payload.failures].sort());
  assert.deepEqual(payload.missingFields, [...payload.missingFields].sort());
  assert.ok(payload.failures.includes('E_COLLAB_CAUSAL_QUEUE_READINESS_SCHEMA_INVALID'));
  assert.ok(payload.failures.includes('E_COLLAB_CAUSAL_QUEUE_READINESS_BASELINE_SHA_INVALID'));
  assert.ok(payload.failures.includes('E_COLLAB_CAUSAL_QUEUE_READINESS_CONFLICT_POLICY_INVALID'));
  assert.ok(payload.failures.includes('E_COLLAB_CAUSAL_QUEUE_READINESS_READY_NO_NETWORK_REQUIRED'));
  assert.ok(payload.failures.includes('E_COLLAB_CAUSAL_QUEUE_READINESS_READY_ORDERING_KEY_UNKNOWN'));
});

test('collab causal queue readiness: output and configHash are deterministic', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-causal-queue-deterministic-'));
  const readinessPath = path.join(tmp, 'COLLAB_CAUSAL_QUEUE_READINESS.json');
  const doc = buildDoc({ baselineSha: 'cccccccccccccccccccccccccccccccccccccccc' });
  writeJson(readinessPath, doc);

  const first = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp]);
  const second = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp]);
  assert.equal(first.evidence.configHash, computeConfigHash(doc));
  assert.deepEqual(first, second);
});

test('collab causal queue readiness token is emitted by truth-table, ops-summary and doctor', () => {
  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthPayload = JSON.parse(String(truth.stdout || '{}'));
  assert.ok(typeof truthPayload.COLLAB_CAUSAL_QUEUE_READINESS_OK === 'number');

  const summary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.ok(summary.status === 0 || summary.status === 1, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryTokens = parseTokens(summary.stdout);
  assert.ok(summaryTokens.has('OPS_SUMMARY_COLLAB_CAUSAL_QUEUE_READINESS_OK'));

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
  assert.ok(doctorTokens.has('COLLAB_CAUSAL_QUEUE_READINESS_OK'));
});
