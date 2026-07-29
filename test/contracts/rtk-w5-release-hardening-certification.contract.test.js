const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STATUS_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'RTK',
  'W5_RELEASE_HARDENING_CERTIFICATION_STATUS.json',
);
const SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'ops',
  'rtk-w5-release-hardening-certification.mjs',
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadVerifier() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('RTK W5 status keeps external Word certification resumable and blocks DONE', () => {
  const status = readJson(STATUS_PATH);

  assert.equal(status.schemaVersion, 'yalken.rtk.w5.release-hardening-certification.v1');
  assert.equal(status.stageId, 'W5_RELEASE_HARDENING_AND_CERTIFICATION');
  assert.equal(status.overallStatus, 'LOCAL_HARDENING_READY_EXTERNAL_WORD_RESUMABLE');
  assert.equal(status.externalWordCertification.status, 'RESUMABLE_EXTERNAL_WORD_CERTIFICATION');
  assert.equal(status.externalWordCertification.acceptedWordEvidence, false);
  assert.equal(status.externalWordCertification.falsePassForbidden, true);
  assert.equal(status.externalWordCertification.blocksDone, true);
  assert.equal(status.doneGate.doneAllowed, false);
  assert.equal(status.doneGate.blockers.includes('WORD_PROFILE_EVIDENCE_REQUIRED'), true);
  assert.equal(status.doneGate.resumableAfterExternalEvidence, true);
});

test('RTK W5 verifier passes the canonical local status and exposes machine tokens', () => {
  const output = execFileSync(process.execPath, [SCRIPT_PATH, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const result = JSON.parse(output);

  assert.equal(result.ok, true);
  assert.equal(result.result, 'PASS');
  assert.equal(result.tokens.W5_LOCAL_HARDENING_STATUS_OK, 1);
  assert.equal(result.tokens.W5_EXTERNAL_WORD_CERTIFICATION_RESUMABLE, 1);
  assert.equal(result.tokens.W5_DONE_BLOCKED_BY_EXTERNAL_WORD_EVIDENCE, 1);
  assert.deepEqual(result.issues, []);
});

test('RTK W5 local proof hooks bind release hardening without adding Word PASS', () => {
  const status = readJson(STATUS_PATH);
  const hooks = status.localReleaseHardening.proofHooks;
  const hookIds = hooks.map((hook) => hook.id).sort();

  assert.deepEqual(hookIds, [
    'archive-export',
    'migration-hardening',
    'ops-current-wave',
    'oss-policy',
    'package-boundary',
    'performance-profile',
    'release-candidate-lock',
    'word-evidence-claim-gate',
  ]);

  for (const hook of hooks) {
    assert.equal(path.isAbsolute(hook.path), false, hook.id);
    assert.equal(hook.path.includes('..'), false, hook.id);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, hook.path)), true, hook.id);
    assert.match(hook.command, /^(npm|node)\b/u, hook.id);
    assert.ok(hook.purpose.length > 10, hook.id);
  }
});

test('RTK W5 verifier rejects false Word PASS and false DONE mutations', async () => {
  const { evaluateW5ReleaseHardeningStatus } = await loadVerifier();
  const status = readJson(STATUS_PATH);

  const falseWordPass = clone(status);
  falseWordPass.externalWordCertification.status = 'WORD_PROFILE_EVIDENCE_PASS';
  falseWordPass.externalWordCertification.acceptedWordEvidence = false;
  const wordResult = evaluateW5ReleaseHardeningStatus({ repoRoot: REPO_ROOT, status: falseWordPass });
  assert.equal(wordResult.ok, false);
  assert.equal(
    wordResult.issues.some((issue) => issue.code === 'EXTERNAL_WORD_FALSE_PASS_FORBIDDEN'),
    true,
  );

  const falseDone = clone(status);
  falseDone.doneGate.doneAllowed = true;
  const doneResult = evaluateW5ReleaseHardeningStatus({ repoRoot: REPO_ROOT, status: falseDone });
  assert.equal(doneResult.ok, false);
  assert.equal(
    doneResult.issues.some((issue) => issue.code === 'DONE_FALSE_PASS_FORBIDDEN'),
    true,
  );
});

test('RTK W5 status does not make broad Word or release claims', () => {
  const text = fs.readFileSync(STATUS_PATH, 'utf8');
  const forbidden = [
    /\bWord support is (?:available|supported|ready|complete|proven)\b/iu,
    /\bWord import is (?:available|supported|ready|complete|proven)\b/iu,
    /\bWord roundtrip is (?:available|supported|ready|complete|proven)\b/iu,
    /\bWord layout parity is (?:available|supported|ready|complete|proven)\b/iu,
    /\bfull DOCX fidelity is (?:available|supported|ready|complete|proven)\b/iu,
    /\bDONE is (?:available|supported|ready|complete|proven)\b/iu,
  ];

  for (const pattern of forbidden) {
    assert.equal(pattern.test(text), false, pattern.source);
  }
});
