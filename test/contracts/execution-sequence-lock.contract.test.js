const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const CANON_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'EXECUTION_SEQUENCE_CANON_v1.json');
const LAW_PATH_CANON_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'LAW_PATH_CANON.json');
const CHECK_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'check-execution-sequence.mjs');
const FAILSIGNAL_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json');
const TOKEN_CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'TOKENS', 'TOKEN_CATALOG.json');
const REQUIRED_SET_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EXECUTION', 'REQUIRED_TOKEN_SET.json');
const RUN_TESTS_PATH = path.join(REPO_ROOT, 'scripts', 'run-tests.js');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function parseJsonOutput(result) {
  let payload = null;
  assert.doesNotThrow(() => {
    payload = JSON.parse(String(result.stdout || '{}'));
  }, `invalid JSON output:\n${result.stdout}\n${result.stderr}`);
  return payload;
}

function runCheck(args = [], cwd = REPO_ROOT) {
  return spawnSync(process.execPath, [CHECK_SCRIPT_PATH, '--json', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function makeFixtureLaw(sequence) {
  const lines = sequence.map((token, index) => {
    if (index === 0) return `\`${token}\``;
    return `→ \`${token}\``;
  });
  return [
    '# LAW',
    '',
    '### A1) EXECUTION SEQUENCE (BINDING)',
    ...lines,
    '',
    'Fail candidate: `E_SEQUENCE_ORDER_DRIFT`',
    '',
    '#### A1.1) OPS_INTEGRITY_P0 (DEFINITION, BINDING)',
    '`OPS_INTEGRITY_P0`',
  ].join('\n');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeFixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'execution-sequence-lock-'));
  const canonRelPath = path.join('docs', 'OPS', 'STATUS', 'EXECUTION_SEQUENCE_CANON_v1.json');
  const lawPathCanonRelPath = path.join('docs', 'OPS', 'STATUS', 'LAW_PATH_CANON.json');
  const lawRelPath = path.join('docs', 'OPS', 'STATUS', 'XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v3.12.md');
  const canonAbsPath = path.join(root, canonRelPath);
  const lawPathCanonAbsPath = path.join(root, lawPathCanonRelPath);
  const lawAbsPath = path.join(root, lawRelPath);

  const canonSequence = [
    'CORE_SOT_EXECUTABLE',
    'CAPABILITY_ENFORCEMENT',
    'OPS_INTEGRITY_P0',
    'XPLAT_ARCHITECTURE_CONTRACT',
  ];

  writeJson(canonAbsPath, {
    version: 1,
    sequence: canonSequence,
  });
  writeJson(lawPathCanonAbsPath, {
    version: 1,
    lawDocPath: lawRelPath.replaceAll(path.sep, '/'),
    lawDocId: 'XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT',
    status: 'ACTIVE_CANON',
    notes: 'fixture',
  });
  fs.mkdirSync(path.dirname(lawAbsPath), { recursive: true });
  fs.writeFileSync(lawAbsPath, `${makeFixtureLaw(canonSequence)}\n`, 'utf8');

  return {
    root,
    canonSequence,
    lawAbsPath,
  };
}

test('anchor-and-static-check-exist', () => {
  assert.equal(fs.existsSync(CANON_PATH), true, 'missing EXECUTION_SEQUENCE_CANON_v1.json');
  assert.equal(fs.existsSync(LAW_PATH_CANON_PATH), true, 'missing LAW_PATH_CANON.json');
  assert.equal(fs.existsSync(CHECK_SCRIPT_PATH), true, 'missing scripts/ops/check-execution-sequence.mjs');

  const canon = readJson(CANON_PATH);
  assert.equal(canon.version, 1);
  assert.ok(Array.isArray(canon.sequence));
  assert.ok(canon.sequence.length >= 3);

  const release = runCheck(['--mode=release']);
  assert.equal(release.status, 0, `${release.stdout}\n${release.stderr}`);
  const payload = parseJsonOutput(release);
  assert.equal(payload.mode, 'release');
  assert.ok(['PASS', 'WARN'].includes(payload.result));
  assert.equal(typeof payload.lawDocPath, 'string');
  assert.equal(typeof payload.lawDocFound, 'boolean');
  assert.ok(Array.isArray(payload.expected));
  assert.ok(Array.isArray(payload.actual));
});

test('failsignal-and-token-are-registered-without-required-set-expansion', () => {
  const failRegistry = readJson(FAILSIGNAL_REGISTRY_PATH);
  const failSignal = (failRegistry.failSignals || []).find((row) => row && row.code === 'E_SEQUENCE_ORDER_DRIFT');
  assert.ok(failSignal, 'E_SEQUENCE_ORDER_DRIFT must exist in failSignal registry');
  assert.ok(failSignal.modeMatrix && typeof failSignal.modeMatrix === 'object');
  assert.equal(failSignal.modeMatrix.prCore, 'advisory');
  assert.equal(failSignal.modeMatrix.release, 'blocking');
  assert.equal(failSignal.modeMatrix.promotion, 'blocking');

  const tokenCatalog = readJson(TOKEN_CATALOG_PATH);
  const token = (tokenCatalog.tokens || []).find((row) => row && row.tokenId === 'SEQUENCE_ORDER_LOCK_OK');
  assert.ok(token, 'SEQUENCE_ORDER_LOCK_OK must exist in token catalog');
  assert.equal(token.failSignalCode, 'E_SEQUENCE_ORDER_DRIFT');

  const requiredSet = readJson(REQUIRED_SET_PATH);
  const flattened = flattenStrings(requiredSet).map((value) => String(value || '').trim());
  assert.equal(flattened.includes('SEQUENCE_ORDER_LOCK_OK'), false);
});

test('promotion-mode-drift-fails-while-release-mode-warns', () => {
  const fixture = makeFixtureRepo();
  try {
    const baseline = runCheck(['--repo-root', fixture.root, '--mode=release']);
    assert.equal(baseline.status, 0, `${baseline.stdout}\n${baseline.stderr}`);
    const baselinePayload = parseJsonOutput(baseline);
    assert.equal(baselinePayload.result, 'PASS');

    const driftedLaw = makeFixtureLaw([
      fixture.canonSequence[1],
      fixture.canonSequence[0],
      fixture.canonSequence[2],
      fixture.canonSequence[3],
    ]);
    fs.writeFileSync(fixture.lawAbsPath, `${driftedLaw}\n`, 'utf8');

    const release = runCheck(['--repo-root', fixture.root, '--mode=release']);
    assert.equal(release.status, 0, `${release.stdout}\n${release.stderr}`);
    const releasePayload = parseJsonOutput(release);
    assert.equal(releasePayload.result, 'WARN');
    assert.equal(releasePayload.failSignalCode, 'E_SEQUENCE_ORDER_DRIFT');

    const promotion = runCheck(['--repo-root', fixture.root, '--mode=promotion']);
    assert.notEqual(promotion.status, 0, 'promotion mode must fail on sequence order drift');
    const promotionPayload = parseJsonOutput(promotion);
    assert.equal(promotionPayload.result, 'FAIL');
    assert.equal(promotionPayload.failSignalCode, 'E_SEQUENCE_ORDER_DRIFT');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('heavy-lane-wiring-includes-sequence-order-check', () => {
  const runTestsText = fs.readFileSync(RUN_TESTS_PATH, 'utf8');
  assert.ok(runTestsText.includes('runExecutionSequenceGuard'), 'run-tests must include runExecutionSequenceGuard');
  assert.ok(runTestsText.includes('scripts/ops/check-execution-sequence.mjs'), 'heavy lane must invoke check-execution-sequence.mjs');
  assert.ok(runTestsText.includes('--mode=${checkMode}'), 'check must be mode-aware in heavy lane');
});
