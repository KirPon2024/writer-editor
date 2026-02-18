const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const FAILSIGNAL_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'FAILSIGNALS', 'FAILSIGNAL_REGISTRY.json');
const LAW_PATH_CANON_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'LAW_PATH_CANON.json');
const CANON_STATUS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'STATUS', 'CANON_STATUS.json');

function runNode(args) {
  return spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function runNpm(args) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npmCmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('transition-exit active canon: machine-bound closure checks are green', () => {
  const stageAxis = runNode(['--test', 'test/contracts/stage-axis-lock.contract.test.js']);
  assert.equal(stageAxis.status, 0, `${stageAxis.stdout}\n${stageAxis.stderr}`);

  const promptSingleSource = runNode(['--test', 'test/contracts/prompt-layer-single-source.contract.test.js']);
  assert.equal(promptSingleSource.status, 0, `${promptSingleSource.stdout}\n${promptSingleSource.stderr}`);

  const lawPathExists = runNode(['--test', 'test/contracts/law-path-canon-exists.contract.test.js']);
  assert.equal(lawPathExists.status, 0, `${lawPathExists.stdout}\n${lawPathExists.stderr}`);

  const laneSeparation = runNode(['--test', 'test/contracts/lane-separation.contract.test.js']);
  assert.equal(laneSeparation.status, 0, `${laneSeparation.stdout}\n${laneSeparation.stderr}`);
});

test('transition-exit active canon: failsignals are registered and canon path is active', () => {
  const failSignals = readJson(FAILSIGNAL_REGISTRY_PATH).failSignals || [];
  const byCode = new Map(failSignals.map((entry) => [String(entry?.code || ''), entry]));

  assert.ok(byCode.has('E_STAGE_AXIS_DRIFT'), 'E_STAGE_AXIS_DRIFT must be registered');
  assert.ok(byCode.has('E_PROMPT_LAYER_POLICY_INVALID'), 'E_PROMPT_LAYER_POLICY_INVALID must be registered');

  const lawCanon = readJson(LAW_PATH_CANON_PATH);
  const canonStatus = readJson(CANON_STATUS_PATH);
  assert.equal(lawCanon.status, 'ACTIVE_CANON');
  assert.equal(canonStatus.status, 'ACTIVE_CANON');
  assert.equal(canonStatus.canonVersion, 'v3.13a-final');
  assert.equal(canonStatus.canonicalDocPath, lawCanon.lawDocPath);
});

test('transition-exit active canon: governance approvals and promotion check pass', () => {
  const governance = runNode(['scripts/ops/governance-change-detection.mjs', '--json']);
  assert.equal(governance.status, 0, `${governance.stdout}\n${governance.stderr}`);
  const governancePayload = JSON.parse(String(governance.stdout || '{}'));
  assert.equal(governancePayload.ok, true, JSON.stringify(governancePayload, null, 2));
  assert.deepEqual(governancePayload.missing_approvals || [], []);

  const promotion = runNpm(['run', '-s', 'promotion:check']);
  assert.equal(promotion.status, 0, `${promotion.stdout}\n${promotion.stderr}`);
});
