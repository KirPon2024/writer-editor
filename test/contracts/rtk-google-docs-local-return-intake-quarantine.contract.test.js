const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const MODULE_PATH = 'scripts/ops/rtk-google-docs-local-return-intake-quarantine-v1.mjs';
const MODEL_PATH = 'scripts/ops/rtk-google-docs-local-return-intake-quarantine-model.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1_RECEIPT.json';
const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
const STATUS = 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1_LOCAL_VERIFIED';
const RESULT = 'RETURN_INTAKE_QUARANTINE_ONLY_NEEDS_REAL_GOOGLE_E2E';

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
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

function returnedArtifact(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local returned-artifact synthetic fixture.',
    'Disposable only. No user document. No Google account.',
    'This payload is quarantined and never imported or applied.',
  ].join('\n');
  return {
    artifactId: 'google-docs-returned-office-mode-docx',
    fileName: 'synthetic-google-docs-returned-office-mode.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    payloadText,
    payloadSha256: `sha256:${sha256Text(payloadText)}`,
    sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    returnedContentClasses: ['plainText', 'paragraphBreaks'],
    ...overrides,
  };
}

function sourceBinding(overrides = {}) {
  return {
    projectId: 'synthetic-google-docs-project',
    rootId: 'synthetic-google-docs-root',
    documentId: 'synthetic-google-docs-document',
    canonicalRevision: `sha256:${sha256Text('canonical-google-docs-revision-v1')}`,
    workingRevision: `sha256:${sha256Text('working-google-docs-revision-v1')}`,
    generation: 1,
    sourceFence: `sha256:${sha256Text('google-docs-local-return-intake-source-fence-v1')}`,
    ...overrides,
  };
}

function quarantineManifest(artifacts, binding, overrides = {}) {
  const manifestBody = {
    manifestId: 'synthetic-google-docs-return-intake-manifest-v1',
    sourceBindingSha256: `sha256:${sha256Text(stableJson(binding))}`,
    artifactBindings: artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      mediaType: artifact.mediaType,
      payloadSha256: artifact.payloadSha256,
      sizeBytes: artifact.sizeBytes,
    })),
    aggregatePayloadSha256: `sha256:${sha256Text(artifacts.map((artifact) => artifact.payloadSha256).join('\n'))}`,
    quarantineClass: 'LOCAL_RETURN_INTAKE_QUARANTINE_ONLY',
    ...overrides,
  };
  return {
    ...manifestBody,
    manifestSha256: `sha256:${sha256Text(stableJson(manifestBody))}`,
  };
}

function quarantineOracle(artifacts, manifest, overrides = {}) {
  const oracleBody = {
    oracleId: 'synthetic-google-docs-return-intake-oracle-v1',
    expectedAction: 'QUARANTINE_ONLY',
    expectedTrustedProviderCases: 0,
    expectedApplyAdmitted: 0,
    expectedProductMutations: 0,
    expectedArtifactCount: artifacts.length,
    manifestSha256: manifest.manifestSha256,
    ...overrides,
  };
  return {
    ...oracleBody,
    oracleSha256: `sha256:${sha256Text(stableJson(oracleBody))}`,
  };
}

function returnIntakePacket(overrides = {}) {
  const artifacts = overrides.returnedArtifacts || [returnedArtifact()];
  const binding = overrides.sourceBinding || sourceBinding();
  const manifest = overrides.quarantineManifest || quarantineManifest(artifacts, binding);
  const oracle = overrides.quarantineOracle || quarantineOracle(artifacts, manifest);
  const base = {
    schemaVersion: 'yalken.googleDocs.localReturnIntake.v1',
    packetId: 'synthetic-google-docs-return-intake-office-mode-docx-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_RETURN_FIXTURE',
    provider: 'google-docs',
    profileId: 'google-docs-office-mode-post-d1-v1',
    returnMode: 'LOCAL_SYNTHETIC_RETURNED_DOCX',
    localOnly: true,
    userDocument: false,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    productRuntimeWired: false,
    physicalGoogleEvidence: false,
    inheritedEvidenceProfileId: '',
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      returnIntakeTrusted: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    sourceBinding: binding,
    returnedArtifacts: artifacts,
    quarantineManifest: manifest,
    quarantineOracle: oracle,
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'RETURN_INTAKE_LOCAL_QUARANTINE_ONLY',
      'NO_GOOGLE_RETURN_IMPORT_AUTHORITY',
      'NO_GOOGLE_RETURN_APPLY_AUTHORITY',
      'NO_ROUNDTRIP_SUPPORT_CLAIM',
    ],
  };
  return { ...base, ...overrides };
}

test('Google Docs local return intake quarantine admits only digest-bound synthetic quarantine evidence', async () => {
  const mod = await loadModule();
  assert.equal(mod.SCHEMA_VERSION, 'yalken.googleDocs.localReturnIntake.v1');
  assert.equal(mod.RECEIPT_SCHEMA_VERSION, 'yalken.googleDocs.localReturnIntakeQuarantine.receipt.v1');

  const result = mod.evaluateGoogleDocsLocalReturnIntakeQuarantine(returnIntakePacket());
  assert.equal(result.ok, true);
  assert.equal(result.status, STATUS);
  assert.equal(result.result, RESULT);
  assert.equal(result.action, 'QUARANTINE_ONLY');
  assert.equal(result.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(result.provider, 'google-docs');
  assert.equal(result.profileId, 'google-docs-office-mode-post-d1-v1');
  assert.equal(result.localQuarantineOnly, true);
  assert.equal(result.supportClaimed, false);
  assert.equal(result.importClaimed, false);
  assert.equal(result.roundtripClaimed, false);
  assert.equal(result.returnIntakeTrusted, false);
  assert.equal(result.applyAuthority, 'DENY');
  assert.equal(result.counts.returnedArtifacts, 1);
  assert.equal(result.counts.quarantinedArtifacts, 1);
  assert.equal(result.counts.trustedProviderCases, 0);
  assert.equal(result.counts.applyAdmitted, 0);
  assert.equal(result.counts.productMutations, 0);
  assert.equal(result.packetDigest.startsWith('sha256:'), true);
  assert.equal(result.manifestDigest.startsWith('sha256:'), true);
  assert.equal(result.oracleDigest.startsWith('sha256:'), true);
});

test('Google Docs local return intake quarantine rejects support, inheritance, stale source, replay, malformed return bytes and UNKNOWN/ABSTAIN as PASS', async () => {
  const mod = await loadModule();
  const baseline = returnIntakePacket();
  const duplicateArtifact = returnedArtifact({
    artifactId: 'google-docs-returned-office-mode-docx-duplicate',
    payloadSha256: baseline.returnedArtifacts[0].payloadSha256,
  });

  const cases = [
    ['missing schema', { ...baseline, schemaVersion: '' }, 'GOOGLE_RETURN_INTAKE_SCHEMA_INVALID'],
    ['unknown profile', { ...baseline, profileId: 'word-mac-16.112-26081010' }, 'GOOGLE_RETURN_INTAKE_PROFILE_NOT_DECLARED'],
    ['word inheritance', { ...baseline, provider: 'word', inheritedEvidenceProfileId: 'word-mac-16.112-26081010' }, 'GOOGLE_RETURN_INTAKE_WORD_EVIDENCE_INHERITANCE'],
    ['support overclaim', { ...baseline, claims: { ...baseline.claims, supportProven: true } }, 'GOOGLE_RETURN_INTAKE_OVERCLAIM'],
    ['import overclaim', { ...baseline, claims: { ...baseline.claims, importProven: true } }, 'GOOGLE_RETURN_INTAKE_OVERCLAIM'],
    ['roundtrip overclaim', { ...baseline, claims: { ...baseline.claims, roundtripProven: true } }, 'GOOGLE_RETURN_INTAKE_OVERCLAIM'],
    ['trusted intake overclaim', { ...baseline, claims: { ...baseline.claims, returnIntakeTrusted: true } }, 'GOOGLE_RETURN_INTAKE_OVERCLAIM'],
    ['apply overclaim', { ...baseline, claims: { ...baseline.claims, applyAuthority: true } }, 'GOOGLE_RETURN_INTAKE_OVERCLAIM'],
    ['runtime overclaim', { ...baseline, productRuntimeWired: true }, 'GOOGLE_RETURN_INTAKE_OVERCLAIM'],
    ['network overclaim', { ...baseline, networkRuntimeUsed: true }, 'GOOGLE_RETURN_INTAKE_OVERCLAIM'],
    ['account overclaim', { ...baseline, googleAccountUsed: true }, 'GOOGLE_RETURN_INTAKE_OVERCLAIM'],
    ['user document overclaim', { ...baseline, userDocument: true }, 'GOOGLE_RETURN_INTAKE_OVERCLAIM'],
    ['physical provider overclaim', { ...baseline, physicalGoogleEvidence: true }, 'GOOGLE_RETURN_INTAKE_OVERCLAIM'],
    ['source transplant', { ...baseline, sourceBinding: sourceBinding({ documentId: 'foreign-doc' }) }, 'GOOGLE_RETURN_INTAKE_SOURCE_TRANSPLANT'],
    ['stale canonical revision', { ...baseline, sourceBinding: sourceBinding({ canonicalRevision: `sha256:${sha256Text('stale')}` }) }, 'GOOGLE_RETURN_INTAKE_SOURCE_TRANSPLANT'],
    ['stale working revision', { ...baseline, sourceBinding: sourceBinding({ workingRevision: `sha256:${sha256Text('stale')}` }) }, 'GOOGLE_RETURN_INTAKE_SOURCE_TRANSPLANT'],
    ['stale generation', { ...baseline, sourceBinding: sourceBinding({ generation: 2 }) }, 'GOOGLE_RETURN_INTAKE_SOURCE_TRANSPLANT'],
    ['source fence replay', { ...baseline, sourceBinding: sourceBinding({ sourceFence: `sha256:${sha256Text('replayed-fence')}` }) }, 'GOOGLE_RETURN_INTAKE_SOURCE_TRANSPLANT'],
    ['artifact digest mismatch', { ...baseline, returnedArtifacts: [{ ...baseline.returnedArtifacts[0], payloadSha256: `sha256:${sha256Text('stale')}` }] }, 'GOOGLE_RETURN_INTAKE_ARTIFACT_DIGEST_MISMATCH'],
    ['artifact size mismatch', { ...baseline, returnedArtifacts: [{ ...baseline.returnedArtifacts[0], sizeBytes: baseline.returnedArtifacts[0].sizeBytes + 1 }] }, 'GOOGLE_RETURN_INTAKE_ARTIFACT_DIGEST_MISMATCH'],
    ['unsupported media type', { ...baseline, returnedArtifacts: [{ ...baseline.returnedArtifacts[0], mediaType: 'text/html' }] }, 'GOOGLE_RETURN_INTAKE_UNSUPPORTED_FORMAT_ABSTAIN'],
    ['duplicate returned bytes', { ...baseline, returnedArtifacts: [baseline.returnedArtifacts[0], duplicateArtifact] }, 'GOOGLE_RETURN_INTAKE_REPLAY_REJECTED'],
    ['manifest artifact mismatch', { ...baseline, quarantineManifest: { ...baseline.quarantineManifest, artifactBindings: [{ ...baseline.quarantineManifest.artifactBindings[0], payloadSha256: `sha256:${sha256Text('stale')}` }] } }, 'GOOGLE_RETURN_INTAKE_MANIFEST_DIGEST_MISMATCH'],
    ['manifest digest mismatch', { ...baseline, quarantineManifest: { ...baseline.quarantineManifest, manifestSha256: `sha256:${sha256Text('stale')}` } }, 'GOOGLE_RETURN_INTAKE_MANIFEST_DIGEST_MISMATCH'],
    ['oracle digest mismatch', { ...baseline, quarantineOracle: { ...baseline.quarantineOracle, oracleSha256: `sha256:${sha256Text('stale')}` } }, 'GOOGLE_RETURN_INTAKE_ORACLE_DIGEST_MISMATCH'],
    ['oracle trusted provider overclaim', { ...baseline, quarantineOracle: quarantineOracle(baseline.returnedArtifacts, baseline.quarantineManifest, { expectedTrustedProviderCases: 1 }) }, 'GOOGLE_RETURN_INTAKE_ORACLE_OVERCLAIM'],
    ['oracle apply overclaim', { ...baseline, quarantineOracle: quarantineOracle(baseline.returnedArtifacts, baseline.quarantineManifest, { expectedApplyAdmitted: 1 }) }, 'GOOGLE_RETURN_INTAKE_ORACLE_OVERCLAIM'],
    ['unknown limitation cannot pass', { ...baseline, limitations: ['UNKNOWN'] }, 'GOOGLE_RETURN_INTAKE_UNKNOWN_ABSTAIN_NOT_PASS'],
  ];

  for (const [name, packet, code] of cases) {
    const result = mod.evaluateGoogleDocsLocalReturnIntakeQuarantine(packet);
    assert.equal(result.ok, false, name);
    assert.equal(result.result, 'FAIL_CLOSED', name);
    assert.equal(result.code, code, name);
    assert.equal(result.counts.applyAdmitted, 0, name);
    assert.equal(result.counts.productMutations, 0, name);
  }
});

test('Google Docs local return intake quarantine writes exact receipts and keeps intake row honest', async (t) => {
  const mod = await loadModule();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-google-return-intake-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  for (const relativePath of [REGISTRY_PATH, G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH, RTK_CATALOG_PATH]) {
    copyFixtureFile(tempRoot, relativePath);
  }

  const json = mod.writeGoogleDocsLocalReturnIntakeQuarantineArtifacts({ repoRoot: tempRoot });
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
  assert.equal(receipt.localQuarantineOnly, true);
  assert.equal(receipt.noProductMutation, true);
  assert.equal(receipt.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(receipt.samplePacket.result.ok, true);
  assert.equal(receipt.samplePacket.result.action, 'QUARANTINE_ONLY');
  assert.equal(registry.discoveryHeads.some((row) => row.path === RECEIPT_PATH), true);
  assert.equal(matrix.localReturnIntakeQuarantine.status, STATUS);
  assert.equal(matrix.localReturnIntakeQuarantine.receiptPath, RECEIPT_PATH);
  assert.equal(matrix.localReturnIntakeQuarantine.returnIntakeTrusted, false);
  assert.equal(matrix.localReturnIntakeQuarantine.applyAuthority, false);
  assert.equal(discovery.localReturnIntakeQuarantine.status, STATUS);
  assert.equal(discovery.localReturnIntakeQuarantine.receiptPath, RECEIPT_PATH);
  assert.equal(catalog.contractBasenames.includes('rtk-google-docs-local-return-intake-quarantine.contract.test.js'), true);

  const intakeRow = matrix.rows.find((row) => row.cellId === 'google.authenticatedReturnIntakeQuarantine');
  assert.equal(intakeRow.currentTerminalClass, 'TYPED_QUARANTINE_LOCAL_ONLY');
  assert.equal(intakeRow.userFacingAuthority, 'NO_RETURN_IMPORT_OR_APPLY_AUTHORITY');
  assert.equal(intakeRow.reasonCode, 'GOOGLE_RETURN_INTAKE_QUARANTINE_LOCAL_ONLY_NO_REAL_GOOGLE_E2E');
  assert.equal(intakeRow.requiredNextContour, 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1');
  assert.equal(intakeRow.blocksGoogleStage, true);

  assert.equal(matrix.currentRealityAudit.quarantine, 'NOT_WIRED');
  assert.equal(matrix.googleCurrentState.nextLocalContour, 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1');
  assert.equal(discovery.nextLocalContour, 'GOOGLE_DOCS_LOCAL_PREVIEW_ONLY_NO_APPLY_V1');

  const sourceText = [
    fs.readFileSync(path.join(tempRoot, RECEIPT_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, REGISTRY_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, G00_MATRIX_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, G00_DISCOVERY_RECEIPT_PATH), 'utf8'),
    fs.readFileSync(path.join(REPO_ROOT, MODULE_PATH), 'utf8'),
  ].join('\n');
  assert.equal(/\bGoogle Docs support is (ready|complete|proven|available|supported)\b/iu.test(sourceText), false);
  assert.equal(/\breturn intake (is )?(trusted|proven|supported|ready)\b/iu.test(sourceText), false);
  assert.equal(/\bapply authority (is )?(ready|granted|proven)\b/iu.test(sourceText), false);

  const evaluated = mod.evaluateGoogleDocsLocalReturnIntakeQuarantine(receipt.samplePacket.packet);
  assert.deepEqual(evaluated, receipt.samplePacket.result);
});

test('Google Docs local return intake quarantine model and mutation oracle have zero survivors', () => {
  const raw = execFileSync(process.execPath, [MODEL_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const json = JSON.parse(raw);
  assert.equal(json.ok, true);
  assert.equal(json.finiteCases, 1);
  assert.equal(json.hostileCases, 28);
  assert.equal(json.semanticMutants, 20);
  assert.equal(json.survivors, 0);
  assert.equal(json.mismatches, 0);
});
