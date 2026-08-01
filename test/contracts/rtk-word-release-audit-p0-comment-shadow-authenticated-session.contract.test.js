const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VERIFIER_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'ops',
  'rtk-word-release-audit-p0-comment-shadow-authenticated-session.mjs',
);

async function loadVerifier() {
  return import(pathToFileURL(VERIFIER_PATH).href);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('release audit P0 comment shadow verifier binds authenticated session identity and storage effects', async () => {
  const mod = await loadVerifier();
  const result = mod.evaluateWordReleaseAuditP0CommentShadowAuthenticatedSession();

  assert.equal(result.status, 'PASS', JSON.stringify(result, null, 2));
  assert.equal(result.commentShadowAuthenticatedSessionKeysWired, true);
  assert.equal(result.persistentCommentShadowRequiresAuthenticatedReturn, true);
  assert.equal(result.commentShadowStorageEffectsReported, true);
  assert.equal(result.automaticApplyCertified, false);
  assert.equal(result.wordSaturated, false);
});

test('release audit P0 comment shadow verifier fails on unbound storage or authority overclaim drift', async () => {
  const mod = await loadVerifier();
  const baseline = mod.evaluateWordReleaseAuditP0CommentShadowAuthenticatedSession();
  assert.equal(baseline.status, 'PASS', JSON.stringify(baseline, null, 2));

  const receipt = cloneJson(require(path.join(
    REPO_ROOT,
    'docs',
    'OPS',
    'RTK',
    'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_COMMENT_SHADOW_AUTHENTICATED_SESSION_RECEIPT.json',
  )));
  const program = cloneJson(require(path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json')));
  const profile = cloneJson(require(path.join(
    REPO_ROOT,
    'docs',
    'OPS',
    'RTK',
    'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  )));
  const ledger = cloneJson(require(path.join(
    REPO_ROOT,
    'docs',
    'OPS',
    'RTK',
    'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json',
  )));

  receipt.implementedCapability.persistentCommentShadowRequiresAuthenticatedReturn = false;
  receipt.implementedCapability.automaticApplyCertified = true;
  program.releaseAuditNight01.googleDocsOpened = true;
  const cell = profile.cells.find((item) => item.capabilityId === 'rtk.word.releaseAudit.p0.commentShadowAuthenticatedSessionStorageEffects');
  cell.commentShadowStorageEffectsReported = false;
  ledger.runtimeClaims.wordSaturated = true;

  const result = mod.evaluateWordReleaseAuditP0CommentShadowAuthenticatedSession({
    receipt,
    program,
    profile,
    ledger,
  });
  assert.equal(result.status, 'FAIL');
  assert.ok(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_CAPABILITY_INVALID'));
  assert.ok(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_OVERCLAIM'));
  assert.ok(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_PROGRAM_INVALID'));
  assert.ok(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_PROFILE_INVALID'));
  assert.ok(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_LEDGER_INVALID'));
});
