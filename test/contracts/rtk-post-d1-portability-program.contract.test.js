const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_A00_RECONCILIATION_RECEIPT.json');
const HARNESS_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-post-d1-editor-lab-harness.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadHarness() {
  return import(pathToFileURL(HARNESS_PATH).href);
}

test('post-D1 program binds A00/A01 without rewriting D1 or certifying latest Word', async () => {
  const { evaluatePostD1PortabilityProgram } = await loadHarness();
  const result = evaluatePostD1PortabilityProgram({ repoRoot: REPO_ROOT });
  const program = readJson(PROGRAM_PATH);
  const receipt = readJson(RECEIPT_PATH);

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.tokens.POST_D1_PROGRAM_BOUND, 1);
  assert.equal(result.tokens.POST_D1_D1_HISTORY_IMMUTABLE, 1);
  assert.equal(result.tokens.POST_D1_LATEST_WORD_UNCERTIFIED, 1);
  assert.equal(result.tokens.POST_D1_HARNESS_BOUND, 1);
  assert.equal(program.immutableD1Reference.status, 'HISTORICAL_CERTIFIED_D1_MACOS_WORD_16_42');
  assert.equal(program.immutableD1Reference.falseExact, 0);
  assert.equal(program.immutableD1Reference.silentApply, 0);
  assert.equal(program.latestWordCandidate.status, 'SUPPLEMENTAL_EVIDENCE_NOT_CERTIFIED');
  assert.equal(receipt.d1Truth.immutableHistoryChanged, false);
  assert.equal(receipt.postD1Truth.latestWordProfileCertified, false);
});

test('post-D1 external editor matrix declares all required profiles and forbids fixture-only PASS', () => {
  const program = readJson(PROGRAM_PATH);
  const profileIds = program.externalEditorProfiles.map((profile) => profile.profileId).sort();

  assert.deepEqual(profileIds, [
    'google-docs-native-conversion-post-d1-v1',
    'google-docs-office-mode-post-d1-v1',
    'libreoffice-post-d1-v1',
    'onlyoffice-post-d1-v1',
    'pages-post-d1-v1',
    'word-mac-latest-post-d1-v1',
    'word-online-docx-post-d1-v1',
    'wps-advisory-post-d1-v1',
  ]);
  for (const profile of program.externalEditorProfiles) {
    assert.equal(program.capabilityProfileVocabulary.includes(profile.currentCapability), true, profile.profileId);
    assert.equal(profile.physicalEvidenceRequired, true, profile.profileId);
    assert.equal(profile.fixtureOnlyPassAllowed, false, profile.profileId);
    assert.notEqual(profile.status, 'PASS', profile.profileId);
    assert.notEqual(profile.status, 'CERTIFIED', profile.profileId);
  }
});

test('post-D1 matrix covers writer formatting, scale, lane, and locator work without fuzzy apply', () => {
  const program = readJson(PROGRAM_PATH);

  for (const feature of [
    'paragraphs',
    'styles',
    'headings',
    'bold',
    'italic',
    'underline',
    'strike',
    'lists',
    'alignment',
    'indents',
    'tabs',
    'tables',
    'hyperlinks',
    'pageBreaks',
    'sectionBreaks',
    'headers',
    'footers',
    'pageNumbers',
    'footnotes',
    'endnotes',
    'bookmarks',
    'images',
    'captions',
    'altText',
    'fields',
    'languageTags',
    'typographyProperties',
    'comments',
    'trackedRevisions',
  ]) {
    assert.equal(program.writerFormattingMatrix.includes(feature), true, feature);
  }
  assert.equal(program.scaleMatrix.wordTargets.includes(200000), true);
  assert.equal(program.scaleMatrix.pageTargetsWhenPractical.includes(5000), true);
  assert.equal(program.lanes.includes('comments'), true);
  assert.equal(program.lanes.includes('formatting'), true);
  assert.equal(program.lanes.includes('locatorSurvival'), true);
  assert.ok(program.portabilityMechanismsToProve.some((item) => item.mechanismId === 'redundant-exact-locator-envelope-v1'));
  assert.match(JSON.stringify(program), /NO_FUZZY_APPLY/u);
});

test('post-D1 harness exposes bounded synthetic ledger and secure-run guard', async () => {
  const { createPostD1RunPlan } = await loadHarness();
  const runPlan = createPostD1RunPlan({
    runId: 'unit-post-d1',
    artifactRoot: '/Volumes/T7-Secure/storage/yalken/post-d1-editor-lab/unit',
    caseTimeoutMs: 1500,
  });

  assert.equal(runPlan.schemaVersion, 'yalken.rtk.post-d1.editor-lab-ledger.v1');
  assert.equal(runPlan.guards.syntheticDocumentsOnly, true);
  assert.equal(runPlan.guards.noUserDocuments, true);
  assert.equal(runPlan.guards.noBuildInstallDownload, true);
  assert.equal(runPlan.guards.secureT7RequiredBeforePhysicalRun, true);
  assert.equal(runPlan.guards.watchdogRequired, true);
  assert.equal(runPlan.guards.resumeLedgerRequired, true);
  assert.equal(runPlan.guards.neverKillEditorWithUserDocuments, true);
  assert.equal(runPlan.guards.perCaseTimeoutMs, 1500);
  assert.equal(runPlan.profiles.length, 8);
  assert.equal(runPlan.profiles.every((profile) => profile.fixtureOnlyPassAllowed === false), true);
});

test('post-D1 verifier rejects false certification and fixture-only profile pass', async () => {
  const { evaluatePostD1PortabilityProgram } = await loadHarness();
  const program = readJson(PROGRAM_PATH);
  const receipt = readJson(RECEIPT_PATH);

  const falseLatest = deepClone(program);
  falseLatest.latestWordCandidate.status = 'CERTIFIED';
  let result = evaluatePostD1PortabilityProgram({ repoRoot: REPO_ROOT, program: falseLatest, receipt });
  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.code === 'POST_D1_PROFILE_CERTIFICATION_WITHOUT_PHYSICAL_EVIDENCE'),
    true,
  );

  const fixtureOnly = deepClone(program);
  fixtureOnly.externalEditorProfiles[0].status = 'PASS';
  fixtureOnly.externalEditorProfiles[0].fixtureOnlyPassAllowed = true;
  result = evaluatePostD1PortabilityProgram({ repoRoot: REPO_ROOT, program: fixtureOnly, receipt });
  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.code === 'POST_D1_FIXTURE_ONLY_PASS_NOT_FORBIDDEN'),
    true,
  );
});

test('post-D1 harness command verifies status without requiring CI machines to mount T7', () => {
  const output = execFileSync(process.execPath, [HARNESS_PATH, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const result = JSON.parse(output);

  assert.equal(result.ok, true);
  assert.equal(result.result, 'PASS');
  assert.equal(result.secureVolume.checked, false);
  assert.equal(result.secureVolume.requiredForPhysicalRun, true);
  assert.match(result.runPlanDigest, /^sha256:[a-f0-9]{64}$/u);
});
