const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const RUN_TESTS_PATH = path.join(REPO_ROOT, 'scripts', 'run-tests.js');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runFastDryRun() {
  return spawnSync(process.execPath, ['scripts/run-tests.js', 'fast', '--dry-run'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DEV_FAST_LANE: '1',
    },
  });
}

test('lane separation: dev fast lane is isolated and executes one doctor only', () => {
  const pkg = readJson(PACKAGE_JSON_PATH);
  const fastScript = String(pkg?.scripts?.['dev:fast'] || '');
  assert.ok(fastScript.length > 0, 'dev:fast script must exist');
  assert.ok(fastScript.includes("scripts/run-tests.js', 'fast"), 'dev:fast must target fast branch only');
  assert.equal(fastScript.includes('test:ops'), false, 'dev:fast must not execute wave/freshness gate');
  assert.equal(fastScript.includes('--mode=promotion'), false, 'dev:fast must not upgrade itself to promotion mode');

  const dryRun = runFastDryRun();
  assert.equal(dryRun.status, 0, `${dryRun.stdout}\n${dryRun.stderr}`);
  const plan = JSON.parse(String(dryRun.stdout || '{}'));
  assert.equal(plan.mode, 'fast');
  assert.equal(plan.doctorRunCount, 1, 'dev:fast must run exactly one doctor');
  assert.equal(Array.isArray(plan.forbiddenHits), true);
  assert.equal(plan.forbiddenHits.length, 0, 'fast lane must remain free from heavy segments');
});

test('lane separation: release and promotion heavy entrypoints include wave/freshness and heavy checks', () => {
  const pkg = readJson(PACKAGE_JSON_PATH);
  const releaseScript = String(pkg?.scripts?.test || '');
  const promotionScript = String(pkg?.scripts?.['promotion:check'] || '');

  assert.ok(releaseScript.includes('test:ops'), 'release heavy lane must include wave/freshness gate via test:ops');
  assert.ok(promotionScript.includes('test:ops'), 'promotion heavy lane must include wave/freshness gate via test:ops');
  assert.ok(promotionScript.includes('scripts/run-tests.js --mode=promotion'), 'promotion heavy lane must run mode=promotion');
  assert.equal(/\bfast\b/u.test(promotionScript), false, 'promotion heavy lane must not route to fast mode');

  const runTestsText = fs.readFileSync(RUN_TESTS_PATH, 'utf8');
  assert.ok(runTestsText.includes('runOpsSynthNegativeTests(rootDir)'), 'heavy lane must run synth-negative checks');
  assert.ok(runTestsText.includes('runReleaseCandidateGuard(rootDir, isPromotionMode)'), 'heavy lane must verify release candidate lock');
  assert.ok(runTestsText.includes('scripts/ops/release-candidate.mjs'), 'heavy lane must wire RC/evidence verification step');
});
