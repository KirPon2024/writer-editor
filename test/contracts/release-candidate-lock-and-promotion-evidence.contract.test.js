const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const RC_LOCK_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'RELEASE_CANDIDATE_LOCK.json');
const RC_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'release-candidate.mjs');
const FAILSIGNAL_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json');
const TOKEN_CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'TOKENS', 'TOKEN_CATALOG.json');
const REQUIRED_SET_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function flattenStrings(input, out = []) {
  if (Array.isArray(input)) {
    input.forEach((value) => flattenStrings(value, out));
    return out;
  }
  if (!input || typeof input !== 'object') {
    if (typeof input === 'string') out.push(input);
    return out;
  }
  Object.values(input).forEach((value) => flattenStrings(value, out));
  return out;
}

function runReleaseCandidate(args, cwd = REPO_ROOT) {
  return spawnSync(process.execPath, [RC_SCRIPT_PATH, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function parseJsonOutput(result) {
  let payload = null;
  assert.doesNotThrow(() => {
    payload = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON output:\n${result.stdout}\n${result.stderr}`);
  return payload;
}

function makeFixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-candidate-contract-'));
  writeJson(path.join(root, 'docs', 'OPS', 'ARTIFACTS', 'menu', 'menu.normalized.json'), {
    schemaVersion: 1,
    snapshotId: 'menu-default-desktop-minimal',
  });
  writeJson(path.join(root, 'docs', 'OPS', 'STATUS', 'MENU_SNAPSHOT_REGISTRY.json'), {
    schemaVersion: 1,
    snapshots: [
      {
        id: 'menu-default-desktop-minimal',
        normalizedHashSha256: 'a'.repeat(64),
      },
    ],
  });
  writeJson(path.join(root, 'docs', 'OPS', 'PERF', 'PERF_LITE_BASELINE.json'), {
    fixture: 'test/fixtures/perf/long-scene.txt',
    metrics: {},
    tolerances: {},
  });
  writeJson(path.join(root, 'docs', 'OPS', 'TOKENS', 'TOKEN_CATALOG.json'), {
    schemaVersion: 1,
    tokens: [],
  });
  writeJson(path.join(root, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json'), {
    schemaVersion: 1,
    failSignals: [],
  });
  writeJson(path.join(root, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json'), {
    schemaVersion: 1,
    requiredSets: {
      release: [],
    },
  });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'doctor.mjs'), "console.log('DOCTOR_STRICT_FIXTURE_OK=1');\n", 'utf8');
  return root;
}

test('release candidate lock and cli exist', () => {
  assert.equal(fs.existsSync(RC_LOCK_PATH), true, 'missing RELEASE_CANDIDATE_LOCK.json');
  assert.equal(fs.existsSync(RC_SCRIPT_PATH), true, 'missing scripts/ops/release-candidate.mjs');

  const lock = readJson(RC_LOCK_PATH);
  assert.ok(typeof lock.rcId === 'string' && lock.rcId.length > 0);
  assert.ok(typeof lock.baseCommitSha === 'string' && lock.baseCommitSha.length > 0);
  assert.match(String(lock.menuArtifactHash || ''), /^[0-9a-f]{64}$/u);
  assert.match(String(lock.menuSnapshotHash || ''), /^[0-9a-f]{64}$/u);
  assert.match(String(lock.perfBaselineHash || ''), /^[0-9a-f]{64}$/u);
  assert.match(String(lock.tokenCatalogHash || ''), /^[0-9a-f]{64}$/u);
  assert.match(String(lock.failsignalRegistryHash || ''), /^[0-9a-f]{64}$/u);
  assert.match(String(lock.requiredTokenSetHash || ''), /^[0-9a-f]{64}$/u);
  assert.ok(Number.isFinite(Date.parse(String(lock.createdAt || ''))));
  assert.ok(['release', 'promotion'].includes(String(lock.createdByMode || '')));
});

test('release candidate failSignal and token are registered while required-set stays unchanged', () => {
  const failRegistry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const failSignal = (failRegistry.failSignals || []).find((row) => row && row.code === 'E_RELEASE_CANDIDATE_DRIFT');
  assert.ok(failSignal, 'E_RELEASE_CANDIDATE_DRIFT must exist in failSignal registry');
  assert.ok(failSignal.modeMatrix && typeof failSignal.modeMatrix === 'object');
  assert.equal(failSignal.modeMatrix.prCore, 'advisory');
  assert.equal(failSignal.modeMatrix.release, 'advisory');
  assert.equal(failSignal.modeMatrix.promotion, 'blocking');

  const tokenCatalog = readJson(TOKEN_CATALOG_PATH);
  const token = (tokenCatalog.tokens || []).find((row) => row && row.tokenId === 'RELEASE_CANDIDATE_LOCK_MATCH_OK');
  assert.ok(token, 'RELEASE_CANDIDATE_LOCK_MATCH_OK must exist in token catalog');
  assert.equal(token.failSignalCode, 'E_RELEASE_CANDIDATE_DRIFT');

  const requiredSet = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(requiredSet).map((value) => String(value || '').trim());
  assert.equal(flattened.includes('RELEASE_CANDIDATE_LOCK_MATCH_OK'), false);
});

test('promotion mode mismatch fails while release mode mismatch warns', () => {
  const fixtureRoot = makeFixtureRepo();
  try {
    const create = runReleaseCandidate(['--create', '--repo-root', fixtureRoot, '--mode=release', '--json']);
    assert.equal(create.status, 0, `${create.stdout}\n${create.stderr}`);
    const createPayload = parseJsonOutput(create);
    assert.equal(createPayload.result, 'PASS');

    fs.appendFileSync(
      path.join(fixtureRoot, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json'),
      '\n',
      'utf8',
    );

    const releaseVerify = runReleaseCandidate(['--verify', '--repo-root', fixtureRoot, '--mode=release', '--json']);
    assert.equal(releaseVerify.status, 0, `${releaseVerify.stdout}\n${releaseVerify.stderr}`);
    const releasePayload = parseJsonOutput(releaseVerify);
    assert.equal(releasePayload.result, 'WARN');
    assert.equal(releasePayload.failSignalCode, 'E_RELEASE_CANDIDATE_DRIFT');

    const promotionVerify = runReleaseCandidate(['--verify', '--repo-root', fixtureRoot, '--mode=promotion', '--json']);
    assert.notEqual(promotionVerify.status, 0, 'promotion mode must fail on RC mismatch');
    const promotionPayload = parseJsonOutput(promotionVerify);
    assert.equal(promotionPayload.result, 'FAIL');
    assert.equal(promotionPayload.failSignalCode, 'E_RELEASE_CANDIDATE_DRIFT');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('promotion verify generates evidence pack and keeps deterministic files stable', () => {
  const fixtureRoot = makeFixtureRepo();
  try {
    const create = runReleaseCandidate(['--create', '--repo-root', fixtureRoot, '--mode=release', '--json']);
    assert.equal(create.status, 0, `${create.stdout}\n${create.stderr}`);

    const verifyFirst = runReleaseCandidate(['--verify', '--repo-root', fixtureRoot, '--mode=promotion', '--json']);
    assert.equal(verifyFirst.status, 0, `${verifyFirst.stdout}\n${verifyFirst.stderr}`);
    const firstPayload = parseJsonOutput(verifyFirst);
    assert.equal(firstPayload.result, 'PASS');
    assert.ok(typeof firstPayload.evidencePackPath === 'string' && firstPayload.evidencePackPath.length > 0);

    const evidenceDir = path.join(fixtureRoot, firstPayload.evidencePackPath);
    const expectedFiles = [
      'promotion-summary.json',
      'menuArtifactHash.txt',
      'perfBaseline.json',
      'doctor-strict.log',
      'heavy-lane-summary.json',
      'token-required-set.json',
      'failsignal-registry-snapshot.json',
    ];
    const before = new Map();
    for (const fileName of expectedFiles) {
      const absPath = path.join(evidenceDir, fileName);
      assert.equal(fs.existsSync(absPath), true, `missing evidence file: ${fileName}`);
      before.set(fileName, fs.readFileSync(absPath, 'utf8'));
    }

    const verifySecond = runReleaseCandidate(['--verify', '--repo-root', fixtureRoot, '--mode=promotion', '--json']);
    assert.equal(verifySecond.status, 0, `${verifySecond.stdout}\n${verifySecond.stderr}`);
    const secondPayload = parseJsonOutput(verifySecond);
    assert.equal(secondPayload.result, 'PASS');
    assert.equal(secondPayload.evidencePackPath, firstPayload.evidencePackPath);

    for (const fileName of expectedFiles) {
      const absPath = path.join(evidenceDir, fileName);
      const after = fs.readFileSync(absPath, 'utf8');
      assert.equal(after, before.get(fileName), `evidence file drifted: ${fileName}`);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
