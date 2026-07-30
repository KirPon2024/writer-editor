const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B00_MATRIX.json');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B00_DESIGN_RECEIPT.json');
const GENERATOR_PATH = path.join(REPO_ROOT, 'scripts/ops/rtk-word-latest-semantic-corpus-generator.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadGenerator() {
  return import(pathToFileURL(GENERATOR_PATH).href);
}

test('B00 binds latest Word semantic profile without certifying it or rebinding D1', async () => {
  const matrix = readJson(MATRIX_PATH);
  const receipt = readJson(RECEIPT_PATH);
  const generator = await loadGenerator();
  const state = generator.evaluateWordLatestSemanticB00();

  assert.equal(state.ok, true);
  assert.equal(matrix.taskId, 'YALKEN_RTK_WORD_LATEST_SEMANTIC_ROUNDTRIP_V2');
  assert.equal(matrix.status, 'B00_DESIGNED_NOT_CERTIFIED');
  assert.equal(matrix.profile.profileId, generator.WORD_LATEST_SEMANTIC_PROFILE_ID);
  assert.equal(matrix.profile.status, 'DESIGN_ONLY_NOT_CERTIFIED');
  assert.equal(matrix.profile.oldD1Profile.notReboundByB00, true);
  assert.equal(receipt.profileBoundary.physicalRoundTripsExecutedInB00, 0);
  assert.equal(receipt.profileBoundary.targetProfileStatusAfterB00, 'DESIGN_ONLY_NOT_CERTIFIED');
  assert.equal(receipt.corpusManifest.cases, 32);
  assert.equal(receipt.corpusManifest.physicalEvidenceClaimed, false);
  assert.match(receipt.corpusManifest.digest, /^sha256:[a-f0-9]{64}$/u);
});

test('B00 pain matrix covers all owner pain points and preserves zero false exact rules', () => {
  const matrix = readJson(MATRIX_PATH);
  const painIds = new Set(matrix.painMatrix.map((item) => item.id));
  const required = [
    'P0-01', 'P0-02', 'P0-03', 'P0-04', 'P0-05', 'P0-06', 'P0-07', 'P0-08', 'P0-09',
    'P0-10', 'P0-11', 'P0-12', 'P0-13', 'P0-14', 'P0-15', 'P0-16', 'P0-17', 'P0-18',
    'P1-19', 'P1-20',
  ];

  for (const id of required) assert.equal(painIds.has(id), true, `missing pain ${id}`);
  assert.equal(matrix.classificationContract.absoluteVeto, 'zero false EXACT');
  assert.equal(matrix.classificationContract.exactRequiresAll.includes('valid signed locator'), true);
  assert.equal(matrix.classificationContract.blockedWhen.includes('tampered manifest or HMAC'), true);
});

test('B00 locator model gives authority only to signed baseline-bound locators', () => {
  const matrix = readJson(MATRIX_PATH);
  const signals = matrix.dualSnapshotAndSignedLocatorModel.locatorSignals;
  const signed = signals.find((signal) => signal.authority === 'required_apply_authority');
  const fingerprint = signals.find((signal) => signal.signal.includes('prefix suffix'));

  assert.equal(signed.exactEligible, true);
  assert.match(signed.signal, /signed scene and block locator/u);
  assert.equal(fingerprint.authority, 'recovery_manual_signal_only');
  assert.equal(fingerprint.exactEligible, false);
  assert.equal(matrix.dualSnapshotAndSignedLocatorModel.transportManifest.localSecretPolicy.includes('never embedded'), true);
});

test('B00 Review Transport IR v2 includes text comments revisions formatting structure and opaque unsupported lanes', () => {
  const matrix = readJson(MATRIX_PATH);
  const kinds = new Set(matrix.reviewTransportIRV2.requiredRecords.map((item) => item.kind));
  for (const kind of [
    'TextRevision',
    'MoveRevision',
    'PropertyRevision',
    'StructureChange',
    'CommentThread',
    'FormattingDelta',
    'OpaqueUnsupported',
  ]) {
    assert.equal(kinds.has(kind), true, `missing ${kind}`);
  }
  assert.equal(matrix.reviewTransportIRV2.derivedImmutableAnalysisOnly, true);
  assert.equal(matrix.reviewTransportIRV2.requiredRecords.find((item) => item.kind === 'OpaqueUnsupported').silentDropAllowed, false);
});

test('B00 modern comments require package inventory semantic readback and Word reopen visibility', () => {
  const matrix = readJson(MATRIX_PATH);
  const inventory = new Set(matrix.modernCommentPackageSemantics.requiredInventory);

  for (const part of [
    'word/comments.xml',
    'word/commentsExtended.xml',
    'word/commentsExtensible.xml',
    'word/commentsIds.xml',
    'word/people.xml',
  ]) {
    assert.equal(inventory.has(part), true, `missing ${part}`);
  }
  assert.equal(matrix.profile.emptyNoOpCommentSaveCountsAsPass, false);
  assert.equal(matrix.modernCommentPackageSemantics.commentPassRequires.includes('package inventory'), true);
  assert.equal(matrix.modernCommentPackageSemantics.commentPassRequires.includes('semantic readback of body and anchor'), true);
  assert.equal(matrix.modernCommentPackageSemantics.commentPassRequires.includes('Word reopen visibility'), true);
});

test('B00 corpus generator covers required physical families scale comments negatives and no-op guards', async () => {
  const matrix = readJson(MATRIX_PATH);
  const generator = await loadGenerator();
  const corpus = generator.buildWordLatestSemanticCorpus({ runId: 'contract' });
  const families = new Set(corpus.cases.map((item) => item.family));

  assert.equal(corpus.status, 'GENERATED_PLAN_NO_PHYSICAL_EVIDENCE');
  assert.ok(corpus.totalCases >= 30);
  assert.ok(corpus.minimumPhysicalRoundTrips >= 30);
  for (const family of matrix.physicalCorpusContract.requiredCaseFamilies) {
    assert.equal(families.has(family), true, `missing family ${family}`);
  }
  assert.equal(corpus.scaleTargets.words.includes(100000), true);
  assert.equal(corpus.scaleTargets.words.includes(250000), true);
  assert.equal(corpus.cases.some((item) => item.commentTarget >= 500), true);
  assert.equal(corpus.cases.every((item) => item.fixtureOnlyPassAllowed === false), true);
  assert.equal(corpus.noClaims.some((claim) => claim.includes('no-op save without comments parts')), true);
});

test('B00 verifier rejects false certification and fixture-only comment pass mutations', async () => {
  const matrix = readJson(MATRIX_PATH);
  const receipt = readJson(RECEIPT_PATH);
  const generator = await loadGenerator();
  const certified = JSON.parse(JSON.stringify(matrix));
  certified.status = 'CERTIFIED';
  certified.profile.status = 'CERTIFIED';
  const certifiedState = generator.evaluateWordLatestSemanticB00({ matrix: certified, receipt });

  assert.equal(certifiedState.ok, false);
  assert.equal(certifiedState.issues.some((issue) => issue.code === 'B00_FALSE_CERTIFICATION'), true);

  const commentNoop = JSON.parse(JSON.stringify(matrix));
  commentNoop.profile.emptyNoOpCommentSaveCountsAsPass = true;
  const commentState = generator.evaluateWordLatestSemanticB00({ matrix: commentNoop, receipt });
  assert.equal(commentState.ok, false);
  assert.equal(commentState.issues.some((issue) => issue.code === 'B00_EMPTY_COMMENT_PROBE_POLICY_MISSING'), true);
});

test('B00 generator CLI verifies without mounted-T7 requirement and stays non-runtime', () => {
  const output = execFileSync(process.execPath, [GENERATOR_PATH, '--json', '--run-id', 'contract-cli'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.secureVolume.checked, false);
  assert.match(parsed.corpusDigest, /^sha256:[a-f0-9]{64}$/u);

  const source = fs.readFileSync(GENERATOR_PATH, 'utf8');
  assert.equal(/\bosascript\b/u.test(source), false);
  assert.equal(/\bMicrosoft Word\b/u.test(source), false);
  assert.equal(/\bfetch\s*\(/u.test(source), false);
  assert.equal(/\bXMLHttpRequest\b/u.test(source), false);
});
