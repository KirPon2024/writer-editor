const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const LAW_PATH_CANON_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'LAW_PATH_CANON.json');
const CHECK_LAW_PATH_SCRIPT = path.join(REPO_ROOT, 'scripts', 'ops', 'check-law-path-canon.mjs');
const CHECK_SEQUENCE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'ops', 'check-execution-sequence.mjs');
const RUN_TESTS_PATH = path.join(REPO_ROOT, 'scripts', 'run-tests.js');
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

function parseJsonOutput(result) {
  let payload = null;
  assert.doesNotThrow(() => {
    payload = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON output:\n${result.stdout}\n${result.stderr}`);
  return payload;
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

function runLawPathCheck(args = [], cwd = REPO_ROOT) {
  return spawnSync(process.execPath, [CHECK_LAW_PATH_SCRIPT, '--json', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function runExecutionSequenceCheck(args = [], cwd = REPO_ROOT) {
  return spawnSync(process.execPath, [CHECK_SEQUENCE_SCRIPT, '--json', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function makeFixtureRepoWithBrokenLawPath() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'law-path-canon-'));
  const lawPathCanonRelPath = path.join('docs', 'OPS', 'STATUS', 'LAW_PATH_CANON.json');
  const sequenceCanonRelPath = path.join('docs', 'OPS', 'STATUS', 'EXECUTION_SEQUENCE_CANON_v1.json');
  const lawPathCanonAbsPath = path.join(root, lawPathCanonRelPath);
  const sequenceCanonAbsPath = path.join(root, sequenceCanonRelPath);

  writeJson(lawPathCanonAbsPath, {
    version: 1,
    lawDocPath: 'docs/OPS/STATUS/XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_missing.md',
    lawDocId: 'XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT',
    status: 'ACTIVE_CANON',
    notes: 'fixture broken law path',
  });

  writeJson(sequenceCanonAbsPath, {
    version: 1,
    sequence: ['CORE_SOT_EXECUTABLE', 'CAPABILITY_ENFORCEMENT'],
  });

  return root;
}

test('law-path-canon-file-and-target-exist', () => {
  assert.equal(fs.existsSync(LAW_PATH_CANON_PATH), true, 'missing LAW_PATH_CANON.json');
  assert.equal(fs.existsSync(CHECK_LAW_PATH_SCRIPT), true, 'missing check-law-path-canon.mjs');
  assert.equal(fs.existsSync(CHECK_SEQUENCE_SCRIPT), true, 'missing check-execution-sequence.mjs');

  const canon = readJson(LAW_PATH_CANON_PATH);
  assert.equal(canon.version, 1);
  assert.equal(canon.lawDocId, 'XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT');
  assert.equal(canon.status, 'ACTIVE_CANON');
  assert.equal(typeof canon.lawDocPath, 'string');
  assert.ok(canon.lawDocPath.length > 0);
  const lawAbsPath = path.join(REPO_ROOT, canon.lawDocPath);
  assert.equal(fs.existsSync(lawAbsPath), true, 'LAW document from LAW_PATH_CANON must exist');
});

test('execution-sequence-check-has-no-fallback-literals', () => {
  const source = fs.readFileSync(CHECK_SEQUENCE_SCRIPT, 'utf8');
  assert.equal(source.includes('FALLBACK'), false, 'fallback literal must be removed from check-execution-sequence');
  assert.equal(source.includes('_FALLBACK_'), false, 'fallback env-like literal must be removed');
  assert.equal(source.includes('EXECUTION_SEQUENCE_FALLBACK_LAW_USED'), false, 'legacy fallback token must be removed');
});

test('promotion-mode-broken-law-path-fails-while-release-warns', () => {
  const fixtureRoot = makeFixtureRepoWithBrokenLawPath();
  try {
    const releaseLawPath = runLawPathCheck(['--repo-root', fixtureRoot, '--mode=release']);
    assert.equal(releaseLawPath.status, 0, `${releaseLawPath.stdout}\n${releaseLawPath.stderr}`);
    const releaseLawPathPayload = parseJsonOutput(releaseLawPath);
    assert.equal(releaseLawPathPayload.result, 'WARN');
    assert.equal(releaseLawPathPayload.failSignalCode, 'E_LAW_PATH_DRIFT');
    assert.equal(releaseLawPathPayload.failReason, 'LAW_PATH_CANON_INVALID');

    const promotionLawPath = runLawPathCheck(['--repo-root', fixtureRoot, '--mode=promotion']);
    assert.notEqual(promotionLawPath.status, 0, 'promotion mode must fail when LAW path is broken');
    const promotionLawPathPayload = parseJsonOutput(promotionLawPath);
    assert.equal(promotionLawPathPayload.result, 'FAIL');
    assert.equal(promotionLawPathPayload.failSignalCode, 'E_LAW_PATH_DRIFT');
    assert.equal(promotionLawPathPayload.failReason, 'LAW_PATH_CANON_INVALID');

    const releaseSequence = runExecutionSequenceCheck(['--repo-root', fixtureRoot, '--mode=release']);
    assert.equal(releaseSequence.status, 0, `${releaseSequence.stdout}\n${releaseSequence.stderr}`);
    const releaseSequencePayload = parseJsonOutput(releaseSequence);
    assert.equal(releaseSequencePayload.result, 'WARN');
    assert.equal(releaseSequencePayload.failSignalCode, 'E_LAW_PATH_DRIFT');
    assert.equal(releaseSequencePayload.failReason, 'LAW_PATH_CANON_INVALID');

    const promotionSequence = runExecutionSequenceCheck(['--repo-root', fixtureRoot, '--mode=promotion']);
    assert.notEqual(promotionSequence.status, 0, 'promotion mode must fail in execution-sequence check when LAW path is broken');
    const promotionSequencePayload = parseJsonOutput(promotionSequence);
    assert.equal(promotionSequencePayload.result, 'FAIL');
    assert.equal(promotionSequencePayload.failSignalCode, 'E_LAW_PATH_DRIFT');
    assert.equal(promotionSequencePayload.failReason, 'LAW_PATH_CANON_INVALID');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('failsignal-and-token-are-registered-without-required-set-expansion', () => {
  const failRegistry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const failSignal = (failRegistry.failSignals || []).find((row) => row && row.code === 'E_LAW_PATH_DRIFT');
  assert.ok(failSignal, 'E_LAW_PATH_DRIFT must exist in failSignal registry');
  assert.ok(failSignal.modeMatrix && typeof failSignal.modeMatrix === 'object');
  assert.equal(failSignal.modeMatrix.prCore, 'advisory');
  assert.equal(failSignal.modeMatrix.release, 'advisory');
  assert.equal(failSignal.modeMatrix.promotion, 'blocking');

  const tokenCatalog = readJson(TOKEN_CATALOG_PATH);
  const token = (tokenCatalog.tokens || []).find((row) => row && row.tokenId === 'LAW_PATH_CANON_OK');
  assert.ok(token, 'LAW_PATH_CANON_OK must exist in token catalog');
  assert.equal(token.failSignalCode, 'E_LAW_PATH_DRIFT');

  const requiredSet = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(requiredSet).map((value) => String(value || '').trim());
  assert.equal(flattened.includes('LAW_PATH_CANON_OK'), false);
});

test('heavy-lane-wiring-includes-law-path-canon-check', () => {
  const runTestsText = fs.readFileSync(RUN_TESTS_PATH, 'utf8');
  assert.ok(runTestsText.includes('runLawPathCanonGuard'), 'heavy lane must include runLawPathCanonGuard');
  assert.ok(runTestsText.includes('scripts/ops/check-law-path-canon.mjs'), 'heavy lane must execute check-law-path-canon.mjs');
  assert.ok(runTestsText.includes('--mode=${checkMode}'), 'law path check must be mode-aware');
});
