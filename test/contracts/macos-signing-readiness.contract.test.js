const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CONFIG_POLICY_VERSION = 'macos-signing-readiness-config.v1';

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
  const requirements = doc && typeof doc.requirements === 'object' && !Array.isArray(doc.requirements)
    ? doc.requirements
    : {};
  const notarization = requirements && requirements.notarization && typeof requirements.notarization === 'object' && !Array.isArray(requirements.notarization)
    ? requirements.notarization
    : {};

  const normalized = {
    policyVersion: CONFIG_POLICY_VERSION,
    requirements: {
      bundleId: typeof requirements.bundleId === 'string' ? requirements.bundleId.trim() : '',
      codesignIdentity: typeof requirements.codesignIdentity === 'string' ? requirements.codesignIdentity.trim() : '',
      entitlementsPath: typeof requirements.entitlementsPath === 'string' ? requirements.entitlementsPath.trim() : '',
      notarization: {
        profileName: typeof notarization.profileName === 'string' ? notarization.profileName.trim() : '',
        provider: typeof notarization.provider === 'string' ? notarization.provider.trim() : '',
      },
      teamId: typeof requirements.teamId === 'string' ? requirements.teamId.trim() : '',
    },
  };
  return sha256Hex(stableStringify(normalized));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

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

function buildDoc(overrides = {}) {
  const base = {
    schemaVersion: 'macos-signing-readiness.v1',
    status: 'READY',
    baselineSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    requirements: {
      codesignIdentity: 'Developer ID Application profile alias',
      teamId: 'TEAMID_CONFIGURED',
      bundleId: 'com.kirpon.writereditor',
      entitlementsPath: 'docs/OPS/STATUS/MACOS_SIGNING_ENTITLEMENTS.plist',
      notarization: {
        provider: 'apple_notarytool',
        profileName: 'notarytool-profile-alias',
      },
    },
    proof: {
      proofType: 'static_policy_check',
      notes: 'Readiness baseline only.',
    },
  };

  const merged = {
    ...base,
    ...overrides,
    requirements: {
      ...base.requirements,
      ...(overrides.requirements || {}),
      notarization: {
        ...base.requirements.notarization,
        ...((overrides.requirements && overrides.requirements.notarization) || {}),
      },
    },
    proof: {
      ...base.proof,
      ...(overrides.proof || {}),
    },
  };
  merged.configHash = computeConfigHash(merged);
  return merged;
}

test('macos signing readiness: PLACEHOLDER status returns token=0', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-signing-placeholder-'));
  const readinessPath = path.join(tmp, 'MACOS_SIGNING_READINESS.json');
  writeJson(readinessPath, buildDoc({ status: 'PLACEHOLDER' }));

  const payload = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp]);
  assert.equal(payload.status, 'PLACEHOLDER');
  assert.equal(payload.ok, false);
  assert.equal(payload.token.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK, 0);
  assert.equal(payload.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK, 0);
});

test('macos signing readiness: valid READY returns token=1 with deterministic configHash', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-signing-ready-'));
  const readinessPath = path.join(tmp, 'MACOS_SIGNING_READINESS.json');
  writeJson(readinessPath, buildDoc({ baselineSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }));

  const payload = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp, '--head-strict-ok', '1']);
  assert.equal(payload.ok, true);
  assert.equal(payload.status, 'READY');
  assert.equal(payload.token.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK, 1);
  assert.equal(payload.configHash, computeConfigHash(buildDoc({ baselineSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })));
  assert.equal(payload.configHashOk, true);
});

test('macos signing readiness: invalid/missing fields return token=0 and stable sorted failures/missingFields', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-signing-invalid-'));
  const readinessPath = path.join(tmp, 'MACOS_SIGNING_READINESS.json');
  const invalid = buildDoc({
    baselineSha: 'not-a-sha',
    requirements: {
      teamId: '',
      notarization: {
        provider: 'other-provider',
        profileName: '',
      },
    },
    proof: {
      proofType: 'wrong',
      notes: '',
    },
  });
  invalid.configHash = 'f'.repeat(64);
  writeJson(readinessPath, invalid);

  const payload = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp, '--head-strict-ok', '1']);
  assert.equal(payload.ok, false);
  assert.equal(payload.token.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK, 0);
  assert.deepEqual(payload.failures, [...payload.failures].sort());
  assert.deepEqual(payload.missingFields, [...payload.missingFields].sort());
  assert.ok(payload.failures.includes('E_MACOS_SIGNING_BASELINE_SHA_INVALID'));
  assert.ok(payload.failures.includes('E_MACOS_SIGNING_PROVIDER_INVALID'));
  assert.ok(payload.failures.includes('E_MACOS_SIGNING_CONFIG_HASH_MISMATCH'));
});

test('macos signing readiness: configHash determinism for identical input', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-signing-determinism-'));
  const readinessPath = path.join(tmp, 'MACOS_SIGNING_READINESS.json');
  const doc = buildDoc({ baselineSha: 'cccccccccccccccccccccccccccccccccccccccc' });
  writeJson(readinessPath, doc);

  const a = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp, '--head-strict-ok', '1']);
  const b = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp, '--head-strict-ok', '1']);
  assert.equal(a.configHash, b.configHash);
  assert.deepEqual(a, b);
});

test('macos signing readiness: head-binding semantics enforced', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-signing-head-binding-'));
  const readinessPath = path.join(tmp, 'MACOS_SIGNING_READINESS.json');
  writeJson(readinessPath, buildDoc({ baselineSha: 'dddddddddddddddddddddddddddddddddddddddd' }));

  const payload = runStateJson(['--readiness-path', readinessPath, '--repo-root', tmp, '--head-strict-ok', '0']);
  assert.equal(payload.ok, false);
  assert.equal(payload.token.XPLAT_CONTRACT_MACOS_SIGNING_READY_OK, 0);
  assert.ok(payload.failures.includes('E_MACOS_SIGNING_HEAD_STRICT_REQUIRED'));
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
