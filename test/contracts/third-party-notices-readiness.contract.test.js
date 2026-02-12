const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CONFIG_POLICY_VERSION = 'third-party-notices-readiness-config.v1';

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

function normalizeKnownLicenseFiles(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function computeConfigHash(doc) {
  const normalized = {
    policyVersion: CONFIG_POLICY_VERSION,
    baselineSha: String(doc?.baselineSha || '').trim().toLowerCase(),
    policy: {
      licenseHygieneNotePresent: doc?.policy?.licenseHygieneNotePresent === true,
      sourceOfferPolicyPresent: doc?.policy?.sourceOfferPolicyPresent === true,
    },
    inputs: {
      packageLockDetected: String(doc?.inputs?.packageLockDetected || '').trim().toLowerCase(),
      packageJsonPresent: doc?.inputs?.packageJsonPresent === true,
      knownLicenseFiles: normalizeKnownLicenseFiles(doc?.inputs?.knownLicenseFiles),
    },
  };
  return sha256Hex(stableStringify(normalized));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeFile(filePath, text = 'x') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function runStateJson(args = []) {
  const result = spawnSync(process.execPath, ['scripts/ops/third-party-notices-readiness-state.mjs', '--json', ...args], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `third-party-notices-readiness-state failed:\n${result.stdout}\n${result.stderr}`);
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

function createReadyRepoFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'third-party-notices-ready-'));
  writeFile(path.join(repoRoot, 'package.json'), '{"name":"fixture"}\n');
  writeFile(path.join(repoRoot, 'package-lock.json'), '{"name":"fixture"}\n');
  writeFile(path.join(repoRoot, 'LICENSE'), 'license\n');
  writeFile(path.join(repoRoot, 'NOTICE'), 'notice\n');
  writeFile(path.join(repoRoot, 'docs/OPERATIONS/AGPL_SOURCE_OFFER.md'), '# source offer\n');
  writeFile(path.join(repoRoot, 'docs/OPERATIONS/THIRD_PARTY_LICENSES_NOTE.md'), '# third party\n');
  return repoRoot;
}

function buildSpec(overrides = {}) {
  const base = {
    schemaVersion: 'third-party-notices-readiness.v1',
    status: 'READY',
    baselineSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    policy: {
      licenseHygieneNotePresent: true,
      sourceOfferPolicyPresent: true,
    },
    inputs: {
      packageLockDetected: 'npm',
      packageJsonPresent: true,
      knownLicenseFiles: ['LICENSE', 'NOTICE'],
    },
  };
  const merged = {
    ...base,
    ...overrides,
    policy: {
      ...base.policy,
      ...(overrides.policy || {}),
    },
    inputs: {
      ...base.inputs,
      ...(overrides.inputs || {}),
    },
  };
  merged.configHash = computeConfigHash(merged);
  return merged;
}

test('third-party notices readiness: PLACEHOLDER returns token=0', () => {
  const repoRoot = createReadyRepoFixture();
  const specPath = path.join(repoRoot, 'THIRD_PARTY_NOTICES_READINESS.json');
  writeJson(specPath, buildSpec({ status: 'PLACEHOLDER' }));

  const payload = runStateJson(['--spec-path', specPath, '--repo-root', repoRoot, '--head-strict-ok', '1']);
  assert.equal(payload.ok, false);
  assert.equal(payload.status, 'PLACEHOLDER');
  assert.equal(payload.token.THIRD_PARTY_NOTICES_READINESS_OK, 0);
  assert.ok(payload.failures.includes('E_THIRD_PARTY_NOTICES_STATUS_NOT_READY'));
});

test('third-party notices readiness: READY valid data returns token=1', () => {
  const repoRoot = createReadyRepoFixture();
  const specPath = path.join(repoRoot, 'THIRD_PARTY_NOTICES_READINESS.json');
  writeJson(specPath, buildSpec({
    baselineSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  }));

  const payload = runStateJson(['--spec-path', specPath, '--repo-root', repoRoot, '--head-strict-ok', '1']);
  assert.equal(payload.ok, true);
  assert.equal(payload.status, 'READY');
  assert.equal(payload.token.THIRD_PARTY_NOTICES_READINESS_OK, 1);
});

test('third-party notices readiness: invalid fields produce deterministic sorted failures', () => {
  const repoRoot = createReadyRepoFixture();
  const specPath = path.join(repoRoot, 'THIRD_PARTY_NOTICES_READINESS.json');
  const invalid = buildSpec({
    baselineSha: 'not-a-sha',
    inputs: {
      packageLockDetected: 'none',
      knownLicenseFiles: ['NOTICE', 'LICENSE'],
    },
    policy: {
      sourceOfferPolicyPresent: false,
    },
  });
  invalid.configHash = 'f'.repeat(64);
  writeJson(specPath, invalid);

  const payload = runStateJson(['--spec-path', specPath, '--repo-root', repoRoot, '--head-strict-ok', '1']);
  assert.equal(payload.ok, false);
  assert.equal(payload.token.THIRD_PARTY_NOTICES_READINESS_OK, 0);
  assert.ok(payload.failures.includes('E_THIRD_PARTY_NOTICES_BASELINE_SHA_INVALID'));
  assert.ok(payload.failures.includes('E_THIRD_PARTY_NOTICES_INPUT_PACKAGE_LOCK_MISMATCH'));
  assert.ok(payload.failures.includes('E_THIRD_PARTY_NOTICES_INPUT_KNOWN_LICENSE_FILES_NOT_SORTED'));
  assert.ok(payload.failures.includes('E_THIRD_PARTY_NOTICES_CONFIG_HASH_MISMATCH'));
  assert.deepEqual(payload.failures, [...payload.failures].sort());
  assert.deepEqual(payload.missingFields, [...payload.missingFields].sort());
});

test('third-party notices readiness: configHash and output are deterministic', () => {
  const repoRoot = createReadyRepoFixture();
  const specPath = path.join(repoRoot, 'THIRD_PARTY_NOTICES_READINESS.json');
  const spec = buildSpec({
    baselineSha: 'cccccccccccccccccccccccccccccccccccccccc',
    inputs: {
      knownLicenseFiles: ['LICENSE', 'NOTICE'],
    },
  });
  writeJson(specPath, spec);

  const first = runStateJson(['--spec-path', specPath, '--repo-root', repoRoot, '--head-strict-ok', '1']);
  const second = runStateJson(['--spec-path', specPath, '--repo-root', repoRoot, '--head-strict-ok', '1']);
  assert.equal(first.configHash, computeConfigHash(spec));
  assert.deepEqual(first, second);
});

test('third-party notices readiness: head strict semantics are enforced', () => {
  const repoRoot = createReadyRepoFixture();
  const specPath = path.join(repoRoot, 'THIRD_PARTY_NOTICES_READINESS.json');
  writeJson(specPath, buildSpec());

  const payload = runStateJson(['--spec-path', specPath, '--repo-root', repoRoot, '--head-strict-ok', '0']);
  assert.equal(payload.ok, false);
  assert.equal(payload.token.THIRD_PARTY_NOTICES_READINESS_OK, 0);
  assert.ok(payload.failures.includes('E_THIRD_PARTY_NOTICES_HEAD_STRICT_REQUIRED'));
});

test('third-party notices token is emitted by truth-table, ops-summary, and doctor', () => {
  const truth = spawnSync(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.equal(truth.status, 0, `truth-table failed:\n${truth.stdout}\n${truth.stderr}`);
  const truthPayload = JSON.parse(String(truth.stdout || '{}'));
  assert.ok(typeof truthPayload.THIRD_PARTY_NOTICES_READINESS_OK === 'number');

  const summary = spawnSync(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TOKEN_DECLARATION_SKIP_EMISSION_CHECK: '1',
    },
  });
  assert.ok(summary.status === 0 || summary.status === 1, `ops-summary failed:\n${summary.stdout}\n${summary.stderr}`);
  const summaryTokens = parseTokens(summary.stdout);
  assert.ok(summaryTokens.has('OPS_SUMMARY_THIRD_PARTY_NOTICES_READINESS_OK'));

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
  assert.ok(doctorTokens.has('THIRD_PARTY_NOTICES_READINESS_OK'));
});
