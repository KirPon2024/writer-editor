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

test('RTK W5 status binds accepted active macOS Word evidence and requires F00 before DONE', () => {
  const status = readJson(STATUS_PATH);

  assert.equal(status.schemaVersion, 'yalken.rtk.w5.release-hardening-certification.v1');
  assert.equal(status.stageId, 'W5_RELEASE_HARDENING_AND_CERTIFICATION');
  assert.equal(status.overallStatus, 'ACTIVE_PLATFORM_WORD_MAC_CERTIFIED_F00_READY');
  assert.equal(status.externalWordCertification.status, 'WORD_MAC_CERTIFICATION_PASS');
  assert.equal(status.externalWordCertification.activePlatform, 'macos');
  assert.equal(status.externalWordCertification.acceptedWordEvidence, true);
  assert.equal(status.externalWordCertification.falsePassForbidden, true);
  assert.equal(status.externalWordCertification.blocksDone, false);
  assert.equal(status.doneGate.doneAllowed, false);
  assert.equal(status.doneGate.f00Allowed, true);
  assert.equal(status.doneGate.blockers.includes('WORD_PROFILE_EVIDENCE_REQUIRED'), false);
  assert.equal(status.doneGate.remainingBeforeDone.includes('F00_FINAL_AUDIT_REQUIRED'), true);
  assert.equal(status.doneGate.resumableAfterExternalEvidence, false);
  assert.equal(status.activePlatformRebind.immutableContractChanged, false);
});

test('RTK W5 verifier passes the canonical active-platform status and exposes machine tokens', () => {
  const output = execFileSync(process.execPath, [SCRIPT_PATH, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const result = JSON.parse(output);

  assert.equal(result.ok, true);
  assert.equal(result.result, 'PASS');
  assert.equal(result.tokens.W5_LOCAL_HARDENING_STATUS_OK, 1);
  assert.equal(result.tokens.W5_EXTERNAL_WORD_CERTIFICATION_RESUMABLE, 0);
  assert.equal(result.tokens.W5_DONE_BLOCKED_BY_EXTERNAL_WORD_EVIDENCE, 1);
  assert.equal(result.tokens.W5_ACTIVE_PLATFORM_WORD_MAC_CERTIFIED, 1);
  assert.equal(result.tokens.W5_F00_READY, 1);
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

test('RTK W5 verifier rejects false Word PASS false DONE and immutable-contract mutation', async () => {
  const { evaluateW5ReleaseHardeningStatus } = await loadVerifier();
  const status = readJson(STATUS_PATH);

  const falseWordPass = clone(status);
  falseWordPass.externalWordCertification.status = 'WORD_PROFILE_EVIDENCE_PASS';
  falseWordPass.externalWordCertification.acceptedWordEvidence = false;
  const wordResult = evaluateW5ReleaseHardeningStatus({ repoRoot: REPO_ROOT, status: falseWordPass });
  assert.equal(wordResult.ok, false);
  assert.equal(
    wordResult.issues.some((issue) => issue.code === 'WORD_MAC_STATUS_INVALID'),
    true,
  );
  assert.equal(
    wordResult.issues.some((issue) => issue.code === 'WORD_MAC_GATES_INVALID'),
    true,
  );

  const falseDone = clone(status);
  falseDone.doneGate.doneAllowed = true;
  delete falseDone.doneGate.f00Allowed;
  const doneResult = evaluateW5ReleaseHardeningStatus({ repoRoot: REPO_ROOT, status: falseDone });
  assert.equal(doneResult.ok, false);
  assert.equal(
    doneResult.issues.some((issue) => issue.code === 'WORD_MAC_DONE_GATE_INVALID'),
    true,
  );

  const immutableMutation = clone(status);
  immutableMutation.activePlatformRebind.immutableContractChanged = true;
  const rebindResult = evaluateW5ReleaseHardeningStatus({ repoRoot: REPO_ROOT, status: immutableMutation });
  assert.equal(rebindResult.ok, false);
  assert.equal(
    rebindResult.issues.some((issue) => issue.code === 'WORD_MAC_REBIND_MUTATES_IMMUTABLE_CONTRACT'),
    true,
  );
});

test('RTK W5 committed Mac Word evidence covers 40 rounds comments and writer-scale text', () => {
  const status = readJson(STATUS_PATH);
  const wordStatus = readJson(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_MAC_CERTIFICATION_STATUS.json'));
  const evidence = readJson(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_MAC_ROUNDTRIP_EVIDENCE_MANIFEST.json'));

  assert.equal(wordStatus.result, 'PASS');
  assert.equal(wordStatus.totals.rounds, 40);
  assert.equal(wordStatus.totals.falseExact, 0);
  assert.equal(wordStatus.totals.silentApply, 0);
  assert.equal(wordStatus.totals.replayFailures, 0);
  assert.equal(wordStatus.totals.commentCases, 5);
  assert.equal(evidence.matrixCoverage.requiredCovered, true);
  assert.equal(evidence.rounds.filter((round) => round.matrixTags.includes('large-text')).length, 5);
  assert.ok(evidence.rounds.some((round) => round.matrixTags.includes('comment-large-document') && round.commentCount === 3));
  assert.ok(evidence.rounds.some((round) => round.matrixTags.includes('large-text') && round.sourceWordsApprox > 3000));
  assert.equal(evidence.rounds.filter((round) => round.classification === 'EXACT').every((round) => round.applyResult.status === 'applied'), true);
  assert.equal(status.externalWordCertification.wordProfileDigest, wordStatus.wordProfileDigest);
  assert.equal(status.externalWordCertification.corpusDigest, wordStatus.corpusDigest);
  assert.equal(status.externalWordCertification.evidenceManifestDigest, wordStatus.evidenceManifestDigest);
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
