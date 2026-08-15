const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const MODULE_PATH = 'scripts/ops/rtk-google-docs-local-suggestions-ir-abstain-v1.mjs';
const MODEL_PATH = 'scripts/ops/rtk-google-docs-local-suggestions-ir-abstain-model.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_SUGGESTIONS_IR_ABSTAIN_V1_RECEIPT.json';
const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
const STATUS = 'GOOGLE_DOCS_LOCAL_SUGGESTIONS_IR_ABSTAIN_V1_LOCAL_VERIFIED';
const RESULT = 'SUGGESTIONS_IR_ABSTAIN_NEEDS_REAL_GOOGLE_E2E';

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
}

async function loadModule() {
  return import(pathToFileURL(path.join(REPO_ROOT, MODULE_PATH)).href);
}

function copyFixtureFile(tempRoot, relativePath) {
  const src = path.join(REPO_ROOT, relativePath);
  const dst = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function suggestionPacket(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local suggestions synthetic fixture.',
    'Disposable only. No Google account, no network, no user document.',
    'Contains labels that resemble insertion/deletion/replacement suggestions but are not trusted Google provider evidence.',
  ].join('\n');
  const payloadSha256 = sha256Text(payloadText);
  const base = {
    schemaVersion: 'yalken.googleDocs.localSuggestionsIrAbstain.v1',
    packetId: 'synthetic-google-docs-suggestions-ir-abstain-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_SUGGESTIONS_FIXTURE',
    provider: 'google-docs',
    profileId: 'google-docs-office-mode-post-d1-v1',
    editorMode: 'OFFICE_MODE',
    localOnly: true,
    userDocument: false,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    productRuntimeWired: false,
    physicalGoogleEvidence: false,
    inheritedEvidenceProfileId: '',
    sourceBinding: {
      projectId: 'synthetic-google-docs-project',
      rootId: 'synthetic-google-docs-root',
      documentId: 'synthetic-google-docs-document',
      canonicalRevision: `sha256:${sha256Text('canonical-google-docs-revision-v1')}`,
      workingRevision: `sha256:${sha256Text('working-google-docs-revision-v1')}`,
      generation: 1,
    },
    fixture: {
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      payloadText,
      payloadSha256: `sha256:${payloadSha256}`,
      sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    },
    advertisedSuggestionCount: 4,
    suggestions: [
      { suggestionId: 'sug-insert-001', kind: 'suggestedInsertion', anchor: 'paragraph-1', payloadText: 'inserted text' },
      { suggestionId: 'sug-delete-001', kind: 'suggestedDeletion', anchor: 'paragraph-1', payloadText: 'deleted text' },
      { suggestionId: 'sug-replace-001', kind: 'suggestedReplacement', anchor: 'paragraph-2', payloadText: 'old → new' },
      { suggestionId: 'sug-comment-001', kind: 'suggestionCommentAssociation', anchor: 'paragraph-2', payloadText: 'comment on suggestion' },
    ],
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      suggestionsParsed: false,
      suggestionsIrTrusted: false,
      suggestionsApplyAuthority: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'NO_TRUSTED_GOOGLE_SUGGESTIONS_IR',
      'NO_SUGGESTION_APPLY_AUTHORITY',
      'SUGGESTIONS_TYPED_ABSTAIN_LOCAL_ONLY',
    ],
  };
  return { ...base, ...overrides };
}

test('Google Docs local suggestions IR abstain admits only synthetic typed limitation evidence', async () => {
  const mod = await loadModule();
  assert.equal(mod.SCHEMA_VERSION, 'yalken.googleDocs.localSuggestionsIrAbstain.v1');
  assert.equal(mod.RECEIPT_SCHEMA_VERSION, 'yalken.googleDocs.localSuggestionsIrAbstain.receipt.v1');

  const result = mod.evaluateGoogleDocsLocalSuggestionsIrAbstain(suggestionPacket());
  assert.equal(result.ok, true);
  assert.equal(result.status, STATUS);
  assert.equal(result.result, RESULT);
  assert.equal(result.action, 'ABSTAIN_ONLY');
  assert.equal(result.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(result.provider, 'google-docs');
  assert.equal(result.profileId, 'google-docs-office-mode-post-d1-v1');
  assert.equal(result.supportClaimed, false);
  assert.equal(result.importClaimed, false);
  assert.equal(result.roundtripClaimed, false);
  assert.equal(result.suggestionsIrTrusted, false);
  assert.equal(result.applyAuthority, 'DENY');
  assert.equal(result.counts.suggestionsAdvertised, 4);
  assert.equal(result.counts.suggestionsTrusted, 0);
  assert.equal(result.counts.applyAdmitted, 0);
  assert.equal(result.counts.productMutations, 0);
  assert.equal(result.packetDigest.startsWith('sha256:'), true);
});

test('Google Docs local suggestions IR abstain rejects support, inheritance, stale bytes, replay and UNKNOWN/ABSTAIN as PASS', async () => {
  const mod = await loadModule();
  const baseline = suggestionPacket();
  const cases = [
    ['missing schema', { ...baseline, schemaVersion: '' }, 'GOOGLE_SUGGESTIONS_SCHEMA_INVALID'],
    ['unknown profile', { ...baseline, profileId: 'word-mac-16.112-26081010' }, 'GOOGLE_SUGGESTIONS_PROFILE_NOT_DECLARED'],
    ['word inheritance', { ...baseline, provider: 'word', inheritedEvidenceProfileId: 'word-mac-16.112-26081010' }, 'GOOGLE_SUGGESTIONS_WORD_EVIDENCE_INHERITANCE'],
    ['support overclaim', { ...baseline, claims: { ...baseline.claims, supportProven: true } }, 'GOOGLE_SUGGESTIONS_OVERCLAIM'],
    ['suggestions parsed overclaim', { ...baseline, claims: { ...baseline.claims, suggestionsParsed: true } }, 'GOOGLE_SUGGESTIONS_OVERCLAIM'],
    ['apply overclaim', { ...baseline, claims: { ...baseline.claims, suggestionsApplyAuthority: true } }, 'GOOGLE_SUGGESTIONS_OVERCLAIM'],
    ['runtime overclaim', { ...baseline, productRuntimeWired: true }, 'GOOGLE_SUGGESTIONS_OVERCLAIM'],
    ['network overclaim', { ...baseline, networkRuntimeUsed: true }, 'GOOGLE_SUGGESTIONS_OVERCLAIM'],
    ['user document overclaim', { ...baseline, userDocument: true }, 'GOOGLE_SUGGESTIONS_OVERCLAIM'],
    ['source transplant', { ...baseline, sourceBinding: { ...baseline.sourceBinding, documentId: 'foreign-doc' } }, 'GOOGLE_SUGGESTIONS_SOURCE_TRANSPLANT'],
    ['stale fixture digest', { ...baseline, fixture: { ...baseline.fixture, payloadSha256: `sha256:${sha256Text('stale')}` } }, 'GOOGLE_SUGGESTIONS_FIXTURE_DIGEST_MISMATCH'],
    ['silent suggestion count mismatch', { ...baseline, advertisedSuggestionCount: 3 }, 'GOOGLE_SUGGESTIONS_COUNT_MISMATCH'],
    ['unknown limitation cannot pass', { ...baseline, limitations: ['UNKNOWN'] }, 'GOOGLE_SUGGESTIONS_UNKNOWN_ABSTAIN_NOT_PASS'],
  ];

  for (const [name, packet, code] of cases) {
    const result = mod.evaluateGoogleDocsLocalSuggestionsIrAbstain(packet);
    assert.equal(result.ok, false, name);
    assert.equal(result.result, 'FAIL_CLOSED', name);
    assert.equal(result.code, code, name);
    assert.equal(result.counts.applyAdmitted, 0, name);
    assert.equal(result.counts.productMutations, 0, name);
  }
});

test('Google Docs local suggestions IR abstain writes exact receipts and keeps matrix honest', async (t) => {
  const mod = await loadModule();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-google-suggestions-abstain-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  for (const relativePath of [REGISTRY_PATH, G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH, RTK_CATALOG_PATH]) {
    copyFixtureFile(tempRoot, relativePath);
  }

  const json = mod.writeGoogleDocsLocalSuggestionsIrAbstainArtifacts({ repoRoot: tempRoot });
  assert.equal(json.ok, true);
  assert.equal(json.status, STATUS);
  assert.equal(json.result, RESULT);
  assert.equal(json.physicalGoogleEvidence, 0);
  assert.equal(json.productRuntimeWired, 0);

  const receipt = JSON.parse(fs.readFileSync(path.join(tempRoot, RECEIPT_PATH), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(tempRoot, REGISTRY_PATH), 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(tempRoot, G00_MATRIX_PATH), 'utf8'));
  const discovery = JSON.parse(fs.readFileSync(path.join(tempRoot, G00_DISCOVERY_RECEIPT_PATH), 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(path.join(tempRoot, RTK_CATALOG_PATH), 'utf8'));

  assert.equal(receipt.status, STATUS);
  assert.equal(receipt.result, RESULT);
  assert.equal(receipt.localAbstainOnly, true);
  assert.equal(receipt.noProductMutation, true);
  assert.equal(receipt.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(receipt.samplePacket.result.ok, true);
  assert.equal(receipt.samplePacket.result.action, 'ABSTAIN_ONLY');
  assert.equal(registry.discoveryHeads.some((row) => row.path === RECEIPT_PATH), true);
  assert.equal(matrix.localSuggestionsIrAbstain.status, STATUS);
  assert.equal(matrix.localSuggestionsIrAbstain.receiptPath, RECEIPT_PATH);
  assert.equal(matrix.localSuggestionsIrAbstain.suggestionsIrTrusted, false);
  assert.equal(matrix.localSuggestionsIrAbstain.applyAuthority, false);
  assert.equal(discovery.localSuggestionsIrAbstain.status, STATUS);
  assert.equal(discovery.localSuggestionsIrAbstain.receiptPath, RECEIPT_PATH);
  assert.equal(catalog.contractBasenames.includes('rtk-google-docs-local-suggestions-ir-abstain.contract.test.js'), true);

  const suggestionsRow = matrix.rows.find((row) => row.cellId === 'google.suggestionsLane');
  assert.equal(suggestionsRow.currentTerminalClass, 'TYPED_ABSTAIN_LOCAL_ONLY');
  assert.equal(suggestionsRow.userFacingAuthority, 'NO_SUGGESTION_APPLY_AUTHORITY');
  assert.equal(suggestionsRow.blocksGoogleStage, true);

  const sourceText = [
    fs.readFileSync(path.join(tempRoot, RECEIPT_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, REGISTRY_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, G00_MATRIX_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, G00_DISCOVERY_RECEIPT_PATH), 'utf8'),
    fs.readFileSync(path.join(REPO_ROOT, MODULE_PATH), 'utf8'),
  ].join('\n');
  assert.equal(/\bGoogle Docs support is (ready|complete|proven|available|supported)\b/iu.test(sourceText), false);
  assert.equal(/\bsuggestions? (?:IR )?(?:is |are )?(ready|complete|proven|supported|trusted)\b/iu.test(sourceText), false);
  assert.equal(/\bapply authority (is )?(ready|granted|proven)\b/iu.test(sourceText), false);

  const evaluated = mod.evaluateGoogleDocsLocalSuggestionsIrAbstain(receipt.samplePacket.packet);
  assert.deepEqual(evaluated, receipt.samplePacket.result);
});

test('Google Docs local suggestions IR abstain model and mutation oracle have zero survivors', () => {
  const result = JSON.parse(execFileSync(process.execPath, [MODEL_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }));
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.finiteCases, 1);
  assert.equal(result.hostileCases, 16);
  assert.equal(result.semanticMutants, 11);
  assert.equal(result.survivors, 0);
  assert.equal(result.mismatches, 0);
});
