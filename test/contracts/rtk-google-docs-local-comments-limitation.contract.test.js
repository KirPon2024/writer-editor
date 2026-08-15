const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const MODULE_PATH = 'scripts/ops/rtk-google-docs-local-comments-limitation-v1.mjs';
const MODEL_PATH = 'scripts/ops/rtk-google-docs-local-comments-limitation-model.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_COMMENTS_LIMITATION_V1_RECEIPT.json';
const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
const STATUS = 'GOOGLE_DOCS_LOCAL_COMMENTS_LIMITATION_V1_LOCAL_VERIFIED';
const RESULT = 'COMMENTS_LANE_ABSTAIN_NEEDS_REAL_GOOGLE_E2E';

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

function commentsPacket(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local comments synthetic fixture.',
    'Disposable only. No Google account, no network, no user document.',
    'Contains comment-like labels, but no trusted Drive comments import or apply authority.',
  ].join('\n');
  const payloadSha256 = sha256Text(payloadText);
  const base = {
    schemaVersion: 'yalken.googleDocs.localCommentsLimitation.v1',
    packetId: 'synthetic-google-docs-comments-limitation-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_COMMENTS_FIXTURE',
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
    advertisedCommentCount: 3,
    comments: [
      { commentId: 'com-root-001', kind: 'driveCommentRoot', anchor: 'paragraph-1', body: 'Root comment label.' },
      { commentId: 'com-reply-001', kind: 'driveCommentReply', anchor: 'paragraph-1', parentCommentId: 'com-root-001', body: 'Reply label.' },
      { commentId: 'com-resolved-001', kind: 'driveCommentResolved', anchor: 'paragraph-2', body: 'Resolved label.' },
    ],
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      commentsParsed: false,
      commentsIrTrusted: false,
      commentsApplyAuthority: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'NO_DRIVE_COMMENTS_IMPORT',
      'NO_TRUSTED_GOOGLE_COMMENTS_IR',
      'NO_COMMENT_APPLY_AUTHORITY',
      'COMMENTS_TYPED_ABSTAIN_LOCAL_ONLY',
    ],
  };
  return { ...base, ...overrides };
}

test('Google Docs local comments limitation admits only synthetic typed limitation evidence', async () => {
  const mod = await loadModule();
  assert.equal(mod.SCHEMA_VERSION, 'yalken.googleDocs.localCommentsLimitation.v1');
  assert.equal(mod.RECEIPT_SCHEMA_VERSION, 'yalken.googleDocs.localCommentsLimitation.receipt.v1');

  const result = mod.evaluateGoogleDocsLocalCommentsLimitation(commentsPacket());
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
  assert.equal(result.commentsIrTrusted, false);
  assert.equal(result.applyAuthority, 'DENY');
  assert.equal(result.counts.commentsAdvertised, 3);
  assert.equal(result.counts.commentsObserved, 3);
  assert.equal(result.counts.commentsTrusted, 0);
  assert.equal(result.counts.applyAdmitted, 0);
  assert.equal(result.counts.productMutations, 0);
  assert.equal(result.packetDigest.startsWith('sha256:'), true);
});

test('Google Docs local comments limitation rejects support, inheritance, stale bytes, replay and UNKNOWN/ABSTAIN as PASS', async () => {
  const mod = await loadModule();
  const baseline = commentsPacket();
  const cases = [
    ['missing schema', { ...baseline, schemaVersion: '' }, 'GOOGLE_COMMENTS_SCHEMA_INVALID'],
    ['unknown profile', { ...baseline, profileId: 'word-mac-16.112-26081010' }, 'GOOGLE_COMMENTS_PROFILE_NOT_DECLARED'],
    ['word inheritance', { ...baseline, provider: 'word', inheritedEvidenceProfileId: 'word-mac-16.112-26081010' }, 'GOOGLE_COMMENTS_WORD_EVIDENCE_INHERITANCE'],
    ['support overclaim', { ...baseline, claims: { ...baseline.claims, supportProven: true } }, 'GOOGLE_COMMENTS_OVERCLAIM'],
    ['import overclaim', { ...baseline, claims: { ...baseline.claims, importProven: true } }, 'GOOGLE_COMMENTS_OVERCLAIM'],
    ['roundtrip overclaim', { ...baseline, claims: { ...baseline.claims, roundtripProven: true } }, 'GOOGLE_COMMENTS_OVERCLAIM'],
    ['comments parsed overclaim', { ...baseline, claims: { ...baseline.claims, commentsParsed: true } }, 'GOOGLE_COMMENTS_OVERCLAIM'],
    ['comments trusted overclaim', { ...baseline, claims: { ...baseline.claims, commentsIrTrusted: true } }, 'GOOGLE_COMMENTS_OVERCLAIM'],
    ['apply overclaim', { ...baseline, claims: { ...baseline.claims, commentsApplyAuthority: true } }, 'GOOGLE_COMMENTS_OVERCLAIM'],
    ['runtime overclaim', { ...baseline, productRuntimeWired: true }, 'GOOGLE_COMMENTS_OVERCLAIM'],
    ['network overclaim', { ...baseline, networkRuntimeUsed: true }, 'GOOGLE_COMMENTS_OVERCLAIM'],
    ['user document overclaim', { ...baseline, userDocument: true }, 'GOOGLE_COMMENTS_OVERCLAIM'],
    ['source transplant', { ...baseline, sourceBinding: { ...baseline.sourceBinding, documentId: 'foreign-doc' } }, 'GOOGLE_COMMENTS_SOURCE_TRANSPLANT'],
    ['stale fixture digest', { ...baseline, fixture: { ...baseline.fixture, payloadSha256: `sha256:${sha256Text('stale')}` } }, 'GOOGLE_COMMENTS_FIXTURE_DIGEST_MISMATCH'],
    ['silent comment count mismatch', { ...baseline, advertisedCommentCount: 2 }, 'GOOGLE_COMMENTS_COUNT_MISMATCH'],
    ['duplicate comment id', { ...baseline, comments: [baseline.comments[0], { ...baseline.comments[1], commentId: baseline.comments[0].commentId }, baseline.comments[2]] }, 'GOOGLE_COMMENTS_COUNT_MISMATCH'],
    ['unknown limitation cannot pass', { ...baseline, limitations: ['UNKNOWN'] }, 'GOOGLE_COMMENTS_UNKNOWN_ABSTAIN_NOT_PASS'],
  ];

  for (const [name, packet, code] of cases) {
    const result = mod.evaluateGoogleDocsLocalCommentsLimitation(packet);
    assert.equal(result.ok, false, name);
    assert.equal(result.result, 'FAIL_CLOSED', name);
    assert.equal(result.code, code, name);
    assert.equal(result.counts.applyAdmitted, 0, name);
    assert.equal(result.counts.productMutations, 0, name);
  }
});

test('Google Docs local comments limitation writes exact receipts and keeps matrix honest', async (t) => {
  const mod = await loadModule();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-google-comments-limitation-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  for (const relativePath of [REGISTRY_PATH, G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH, RTK_CATALOG_PATH]) {
    copyFixtureFile(tempRoot, relativePath);
  }

  const json = mod.writeGoogleDocsLocalCommentsLimitationArtifacts({ repoRoot: tempRoot });
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
  assert.equal(matrix.localCommentsLimitation.status, STATUS);
  assert.equal(matrix.localCommentsLimitation.receiptPath, RECEIPT_PATH);
  assert.equal(matrix.localCommentsLimitation.commentsIrTrusted, false);
  assert.equal(matrix.localCommentsLimitation.applyAuthority, false);
  assert.equal(discovery.localCommentsLimitation.status, STATUS);
  assert.equal(discovery.localCommentsLimitation.receiptPath, RECEIPT_PATH);
  assert.equal(catalog.contractBasenames.includes('rtk-google-docs-local-comments-limitation.contract.test.js'), true);

  const commentsRow = matrix.rows.find((row) => row.cellId === 'google.commentsLane');
  assert.equal(commentsRow.currentTerminalClass, 'TYPED_ABSTAIN_LOCAL_ONLY');
  assert.equal(commentsRow.userFacingAuthority, 'NO_DRIVE_COMMENTS_IMPORT_OR_APPLY_AUTHORITY');
  assert.equal(commentsRow.reasonCode, 'GOOGLE_COMMENTS_ABSTAIN_NO_DRIVE_COMMENTS_IMPORT_OR_E2E');
  assert.equal(commentsRow.requiredNextContour, 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY');
  assert.equal(commentsRow.blocksGoogleStage, true);
  assert.equal(matrix.currentRealityAudit.roundtripLossMatrix.comments, 'ABSTAIN_TYPED_LOCAL_NO_DRIVE_COMMENTS_IMPORT');
  assert.equal(matrix.googleCurrentState.nextLocalContour, 'GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1');
  assert.equal(discovery.nextLocalContour, 'GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1');

  const sourceText = [
    fs.readFileSync(path.join(tempRoot, RECEIPT_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, REGISTRY_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, G00_MATRIX_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, G00_DISCOVERY_RECEIPT_PATH), 'utf8'),
    fs.readFileSync(path.join(REPO_ROOT, MODULE_PATH), 'utf8'),
  ].join('\n');
  assert.equal(/\bGoogle Docs support is (ready|complete|proven|available|supported)\b/iu.test(sourceText), false);
  assert.equal(/\bDrive comments? (?:import |IR )?(?:is |are )?(ready|complete|proven|supported|trusted)\b/iu.test(sourceText), false);
  assert.equal(/\bcomment apply authority (is )?(ready|granted|proven)\b/iu.test(sourceText), false);

  const evaluated = mod.evaluateGoogleDocsLocalCommentsLimitation(receipt.samplePacket.packet);
  assert.deepEqual(evaluated, receipt.samplePacket.result);
});

test('Google Docs local comments limitation model and mutation oracle have zero survivors', () => {
  const result = JSON.parse(execFileSync(process.execPath, [MODEL_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }));
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.finiteCases, 1);
  assert.equal(result.hostileCases, 17);
  assert.equal(result.semanticMutants, 12);
  assert.equal(result.survivors, 0);
  assert.equal(result.mismatches, 0);
});
