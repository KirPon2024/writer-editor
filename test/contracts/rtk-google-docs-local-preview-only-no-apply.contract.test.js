const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'scripts/ops/rtk-google-docs-local-preview-only-no-apply-v1.mjs');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts/ops/rtk-google-docs-local-preview-only-no-apply-model.mjs');

const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1_RECEIPT.json';
const CONTRACT_BASENAME = 'rtk-google-docs-local-preview-only-no-apply.contract.test.js';

const SCHEMA_VERSION = 'yalken.googleDocs.localPreviewDecision.v1';
const RECEIPT_SCHEMA_VERSION = 'yalken.googleDocs.localPreviewOnlyNoApply.receipt.v1';
const STATUS = 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1_LOCAL_VERIFIED';
const RESULT = 'PREVIEW_ONLY_NO_APPLY_NEEDS_REAL_GOOGLE_E2E';

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sourceBinding(overrides = {}) {
  return {
    projectId: 'synthetic-google-docs-project',
    rootId: 'synthetic-google-docs-root',
    documentId: 'synthetic-google-docs-document',
    canonicalRevision: `sha256:${sha256Text('canonical-google-docs-revision-v1')}`,
    workingRevision: `sha256:${sha256Text('working-google-docs-revision-v1')}`,
    generation: 1,
    sourceFence: `sha256:${sha256Text('google-docs-local-preview-source-fence-v1')}`,
    ...overrides,
  };
}

function returnedArtifact(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local preview synthetic returned artifact.',
    'Disposable only. No user document. No Google account.',
    'This payload can be previewed locally but cannot be imported or applied.',
  ].join('\n');
  return {
    artifactId: 'google-docs-preview-returned-office-mode-docx',
    fileName: 'synthetic-google-docs-preview-returned-office-mode.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    payloadText,
    payloadSha256: `sha256:${sha256Text(payloadText)}`,
    sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    contentClasses: ['plainText', 'paragraphBreaks'],
    ...overrides,
  };
}

function manifest(returnedArtifacts, binding, overrides = {}) {
  const body = {
    manifestId: 'synthetic-google-docs-preview-manifest-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(binding))}`,
    artifactBindings: returnedArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      mediaType: artifact.mediaType,
      payloadSha256: artifact.payloadSha256,
      sizeBytes: artifact.sizeBytes,
    })),
    aggregatePayloadSha256: `sha256:${sha256Text(returnedArtifacts.map((artifact) => artifact.payloadSha256).join('\n'))}`,
    previewClass: 'LOCAL_PREVIEW_ONLY_NO_APPLY',
    ...overrides,
  };
  return {
    ...body,
    manifestSha256: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function previewCandidate(artifact, source, overrides = {}) {
  const textPreview = artifact.payloadText.split('\n').slice(0, 3).join('\n');
  const body = {
    candidateId: 'google-docs-preview-candidate-1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(source))}`,
    artifactId: artifact.artifactId,
    artifactSha256: artifact.payloadSha256,
    previewText: textPreview,
    previewTextSha256: `sha256:${sha256Text(textPreview)}`,
    decision: 'PREVIEW_ONLY',
    applyAuthority: 'DENY',
    ...overrides,
  };
  return {
    ...body,
    candidateSha256: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function oracle(returnedArtifacts, previewManifest, previewCandidates, overrides = {}) {
  const body = {
    oracleId: 'synthetic-google-docs-preview-only-oracle-v1',
    expectedAction: 'PREVIEW_ONLY',
    expectedPreviewCandidates: previewCandidates.length,
    expectedApplyAdmitted: 0,
    expectedProductMutations: 0,
    manifestSha256: previewManifest.manifestSha256,
    candidateSha256s: previewCandidates.map((candidate) => candidate.candidateSha256),
    artifactSha256s: returnedArtifacts.map((artifact) => artifact.payloadSha256),
    ...overrides,
  };
  return {
    ...body,
    oracleSha256: `sha256:${sha256Text(stableJson(body))}`,
  };
}

function previewPacket(overrides = {}) {
  const binding = sourceBinding();
  const artifacts = [returnedArtifact()];
  const previewManifest = manifest(artifacts, binding);
  const previewCandidates = [previewCandidate(artifacts[0], binding)];
  const previewOracle = oracle(artifacts, previewManifest, previewCandidates);
  const base = {
    schemaVersion: SCHEMA_VERSION,
    provider: 'google-docs',
    profileId: 'google-docs-office-mode-post-d1-v1',
    localOnly: true,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    productRuntimeWired: false,
    physicalGoogleEvidence: false,
    userDocument: false,
    inheritedEvidenceProfileId: null,
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      returnIntakeTrusted: false,
      previewDecisionTrusted: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    sourceBinding: binding,
    returnedArtifacts: artifacts,
    previewManifest,
    previewCandidates,
    previewOracle,
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'LOCAL_PREVIEW_ONLY',
      'NO_GOOGLE_RETURN_IMPORT_AUTHORITY',
      'NO_GOOGLE_RETURN_APPLY_AUTHORITY',
      'NO_PRODUCT_MUTATION_AUTHORITY',
    ],
    upstreamLocalReturnIntake: {
      status: 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1_LOCAL_VERIFIED',
      result: 'RETURN_INTAKE_QUARANTINE_ONLY_NEEDS_REAL_GOOGLE_E2E',
      action: 'QUARANTINE_ONLY',
      applyAuthority: 'DENY',
    },
  };
  return { ...base, ...overrides };
}

function copyFixtureFile(tempRoot, relativePath) {
  const sourcePath = path.join(REPO_ROOT, relativePath);
  const targetPath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

test('Google Docs local preview decision admits only local preview without apply authority', async () => {
  const mod = await loadModule();
  assert.equal(mod.SCHEMA_VERSION, SCHEMA_VERSION);
  assert.equal(mod.RECEIPT_SCHEMA_VERSION, RECEIPT_SCHEMA_VERSION);

  const result = mod.evaluateGoogleDocsLocalPreviewOnlyNoApply(previewPacket());
  assert.equal(result.ok, true);
  assert.equal(result.status, STATUS);
  assert.equal(result.result, RESULT);
  assert.equal(result.action, 'PREVIEW_ONLY');
  assert.equal(result.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(result.provider, 'google-docs');
  assert.equal(result.profileId, 'google-docs-office-mode-post-d1-v1');
  assert.equal(result.localPreviewOnly, true);
  assert.equal(result.supportClaimed, false);
  assert.equal(result.importClaimed, false);
  assert.equal(result.roundtripClaimed, false);
  assert.equal(result.returnIntakeTrusted, false);
  assert.equal(result.previewDecisionTrusted, false);
  assert.equal(result.applyAuthority, 'DENY');
  assert.equal(result.counts.returnedArtifacts, 1);
  assert.equal(result.counts.previewCandidates, 1);
  assert.equal(result.counts.applyAdmitted, 0);
  assert.equal(result.counts.productMutations, 0);
  assert.equal(result.packetDigest.startsWith('sha256:'), true);
  assert.equal(result.manifestDigest.startsWith('sha256:'), true);
  assert.equal(result.oracleDigest.startsWith('sha256:'), true);
});

test('Google Docs local preview decision rejects support, stale source, replay, malformed previews, apply, and UNKNOWN/ABSTAIN as PASS', async () => {
  const mod = await loadModule();
  const baseline = previewPacket();
  const duplicateArtifact = returnedArtifact({
    artifactId: 'google-docs-preview-returned-office-mode-docx-duplicate',
    payloadSha256: baseline.returnedArtifacts[0].payloadSha256,
  });
  const cases = [
    ['missing schema', { ...baseline, schemaVersion: '' }, 'GOOGLE_PREVIEW_ONLY_SCHEMA_INVALID'],
    ['unknown profile', { ...baseline, profileId: 'word-mac-16.112-26081010' }, 'GOOGLE_PREVIEW_ONLY_PROFILE_NOT_DECLARED'],
    ['word inheritance', { ...baseline, provider: 'word', inheritedEvidenceProfileId: 'word-mac-16.112-26081010' }, 'GOOGLE_PREVIEW_ONLY_WORD_EVIDENCE_INHERITANCE'],
    ['support overclaim', { ...baseline, claims: { ...baseline.claims, supportProven: true } }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['import overclaim', { ...baseline, claims: { ...baseline.claims, importProven: true } }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['roundtrip overclaim', { ...baseline, claims: { ...baseline.claims, roundtripProven: true } }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['return intake trust overclaim', { ...baseline, claims: { ...baseline.claims, returnIntakeTrusted: true } }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['preview trust overclaim', { ...baseline, claims: { ...baseline.claims, previewDecisionTrusted: true } }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['apply overclaim', { ...baseline, claims: { ...baseline.claims, applyAuthority: true } }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['product mutation overclaim', { ...baseline, claims: { ...baseline.claims, productMutationAuthority: true } }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['runtime overclaim', { ...baseline, productRuntimeWired: true }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['network overclaim', { ...baseline, networkRuntimeUsed: true }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['account overclaim', { ...baseline, googleAccountUsed: true }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['user document overclaim', { ...baseline, userDocument: true }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['physical provider overclaim', { ...baseline, physicalGoogleEvidence: true }, 'GOOGLE_PREVIEW_ONLY_OVERCLAIM'],
    ['missing upstream quarantine', { ...baseline, upstreamLocalReturnIntake: { ...baseline.upstreamLocalReturnIntake, status: 'UNKNOWN' } }, 'GOOGLE_PREVIEW_ONLY_UPSTREAM_NOT_QUARANTINED'],
    ['source transplant', { ...baseline, sourceBinding: sourceBinding({ documentId: 'foreign-doc' }) }, 'GOOGLE_PREVIEW_ONLY_SOURCE_TRANSPLANT'],
    ['stale canonical revision', { ...baseline, sourceBinding: sourceBinding({ canonicalRevision: `sha256:${sha256Text('stale')}` }) }, 'GOOGLE_PREVIEW_ONLY_SOURCE_TRANSPLANT'],
    ['stale working revision', { ...baseline, sourceBinding: sourceBinding({ workingRevision: `sha256:${sha256Text('stale')}` }) }, 'GOOGLE_PREVIEW_ONLY_SOURCE_TRANSPLANT'],
    ['stale generation', { ...baseline, sourceBinding: sourceBinding({ generation: 2 }) }, 'GOOGLE_PREVIEW_ONLY_SOURCE_TRANSPLANT'],
    ['source fence replay', { ...baseline, sourceBinding: sourceBinding({ sourceFence: `sha256:${sha256Text('replayed-fence')}` }) }, 'GOOGLE_PREVIEW_ONLY_SOURCE_TRANSPLANT'],
    ['artifact digest mismatch', { ...baseline, returnedArtifacts: [{ ...baseline.returnedArtifacts[0], payloadSha256: `sha256:${sha256Text('stale')}` }] }, 'GOOGLE_PREVIEW_ONLY_ARTIFACT_DIGEST_MISMATCH'],
    ['unsupported media type', { ...baseline, returnedArtifacts: [{ ...baseline.returnedArtifacts[0], mediaType: 'text/html' }] }, 'GOOGLE_PREVIEW_ONLY_UNSUPPORTED_FORMAT_ABSTAIN'],
    ['duplicate returned bytes', { ...baseline, returnedArtifacts: [baseline.returnedArtifacts[0], duplicateArtifact] }, 'GOOGLE_PREVIEW_ONLY_REPLAY_REJECTED'],
    ['manifest digest mismatch', { ...baseline, previewManifest: { ...baseline.previewManifest, manifestSha256: `sha256:${sha256Text('stale')}` } }, 'GOOGLE_PREVIEW_ONLY_MANIFEST_DIGEST_MISMATCH'],
    ['candidate digest mismatch', { ...baseline, previewCandidates: [{ ...baseline.previewCandidates[0], candidateSha256: `sha256:${sha256Text('stale')}` }] }, 'GOOGLE_PREVIEW_ONLY_CANDIDATE_DIGEST_MISMATCH'],
    ['candidate apply overclaim', { ...baseline, previewCandidates: [{ ...baseline.previewCandidates[0], applyAuthority: 'ALLOW' }] }, 'GOOGLE_PREVIEW_ONLY_CANDIDATE_APPLY_OVERCLAIM'],
    ['oracle digest mismatch', { ...baseline, previewOracle: { ...baseline.previewOracle, oracleSha256: `sha256:${sha256Text('stale')}` } }, 'GOOGLE_PREVIEW_ONLY_ORACLE_DIGEST_MISMATCH'],
    ['oracle apply overclaim', { ...baseline, previewOracle: oracle(baseline.returnedArtifacts, baseline.previewManifest, baseline.previewCandidates, { expectedApplyAdmitted: 1 }) }, 'GOOGLE_PREVIEW_ONLY_ORACLE_OVERCLAIM'],
    ['unknown limitation cannot pass', { ...baseline, limitations: ['UNKNOWN'] }, 'GOOGLE_PREVIEW_ONLY_UNKNOWN_ABSTAIN_NOT_PASS'],
  ];

  for (const [name, packet, code] of cases) {
    const result = mod.evaluateGoogleDocsLocalPreviewOnlyNoApply(packet);
    assert.equal(result.ok, false, name);
    assert.equal(result.result, 'FAIL_CLOSED', name);
    assert.equal(result.code, code, name);
    assert.equal(result.counts.applyAdmitted, 0, name);
    assert.equal(result.counts.productMutations, 0, name);
  }
});

test('Google Docs local preview decision writes exact receipts and keeps preview/apply row honest', async (t) => {
  const mod = await loadModule();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-google-preview-only-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  for (const relativePath of [REGISTRY_PATH, G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH, RTK_CATALOG_PATH]) {
    copyFixtureFile(tempRoot, relativePath);
  }

  const json = mod.writeGoogleDocsLocalPreviewOnlyNoApplyArtifacts({ repoRoot: tempRoot });
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
  assert.equal(receipt.localPreviewOnly, true);
  assert.equal(receipt.noProductMutation, true);
  assert.equal(receipt.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(receipt.samplePacket.result.ok, true);
  assert.equal(receipt.samplePacket.result.action, 'PREVIEW_ONLY');
  assert.equal(receipt.samplePacket.result.applyAuthority, 'DENY');
  assert.equal(registry.discoveryHeads.some((row) => row.path === RECEIPT_PATH), true);
  assert.equal(matrix.localPreviewOnlyNoApply.status, STATUS);
  assert.equal(matrix.localPreviewOnlyNoApply.applyAuthority, false);
  assert.equal(matrix.googleCurrentState.automaticApplyCertified, 0);
  assert.equal(matrix.googleCurrentState.googleStageDone, false);
  assert.equal(matrix.googleCurrentState.nextLocalContour, 'GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1');
  const previewRow = matrix.rows.find((row) => row.cellId === 'google.previewDecisionCommandApply');
  assert.equal(previewRow.currentTerminalClass, 'TYPED_PREVIEW_ONLY_LOCAL_NO_APPLY');
  assert.equal(previewRow.userFacingAuthority, 'LOCAL_PREVIEW_ONLY_NO_APPLY_AUTHORITY');
  assert.equal(previewRow.reasonCode, 'GOOGLE_PREVIEW_ONLY_NO_APPLY_LOCAL_ONLY_NO_REAL_GOOGLE_E2E');
  assert.equal(previewRow.requiredNextContour, 'GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1');
  assert.equal(previewRow.blocksGoogleStage, true);
  assert.equal(discovery.localPreviewOnlyNoApply.status, STATUS);
  assert.equal(discovery.localPreviewOnlyNoApply.applyAuthority, false);
  assert.equal(discovery.nextLocalContour, 'GOOGLE_DOCS_LOCAL_RECOVERY_REPLAY_CONTRACT_V1');
  assert.equal(catalog.contractBasenames.includes(CONTRACT_BASENAME), true);
});

test('Google Docs local preview decision model and mutation oracle have zero survivors', async () => {
  const stdout = execFileSync(process.execPath, [MODEL_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const report = JSON.parse(stdout);
  assert.equal(report.ok, true);
  assert.equal(report.finiteCases, 1);
  assert.equal(report.hostileCases, 30);
  assert.equal(report.semanticMutants, 22);
  assert.equal(report.survivors, 0);
  assert.equal(report.mismatches, 0);
});
