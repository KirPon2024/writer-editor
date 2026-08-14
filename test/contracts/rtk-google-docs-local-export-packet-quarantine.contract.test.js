const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const MODULE_PATH = 'scripts/ops/rtk-google-docs-local-export-packet-quarantine-v1.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_EXPORT_PACKET_QUARANTINE_V1_RECEIPT.json';
const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
const STATUS = 'GOOGLE_DOCS_LOCAL_EXPORT_PACKET_QUARANTINE_V1_LOCAL_VERIFIED';
const RESULT = 'QUARANTINE_ONLY_NEEDS_REAL_GOOGLE_E2E';

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

function syntheticPacket(overrides = {}) {
  const payloadText = overrides.payloadText ?? [
    'Yalken Google Docs local export synthetic fixture.',
    'Disposable only. No user document. No Google account.',
  ].join('\n');
  const payloadSha256 = sha256Text(payloadText);
  const packet = {
    schemaVersion: 'yalken.googleDocs.localExportPacket.v1',
    packetId: 'synthetic-google-docs-office-mode-docx-basic-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_EXPORT_FIXTURE',
    provider: 'google-docs',
    profileId: 'google-docs-office-mode-post-d1-v1',
    exportMode: 'OFFICE_MODE_DOCX_EXPORT',
    localOnly: true,
    userDocument: false,
    googleAccountUsed: false,
    networkRuntimeUsed: false,
    productRuntimeWired: false,
    physicalGoogleEvidence: false,
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    sourceBinding: {
      projectId: 'synthetic-google-docs-project',
      rootId: 'synthetic-google-docs-root',
      documentId: 'synthetic-google-docs-document',
      canonicalRevision: `sha256:${sha256Text('canonical-google-docs-revision-v1')}`,
      workingRevision: `sha256:${sha256Text('working-google-docs-revision-v1')}`,
      generation: 1,
    },
    artifacts: [
      {
        artifactId: 'google-docs-office-mode-export-docx',
        fileName: 'synthetic-google-docs-office-mode.docx',
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        payloadText,
        payloadSha256: `sha256:${payloadSha256}`,
        sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
        contentClasses: ['plainText', 'paragraphBreaks'],
      },
    ],
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'NO_GOOGLE_PROVIDER_BUILD_PIN',
      'NO_IMPORT_APPLY_AUTHORITY',
      'NO_ROUNDTRIP_SUPPORT_CLAIM',
    ],
  };
  return { ...packet, ...overrides };
}

test('Google Docs local export packet quarantine admits only declared synthetic quarantine evidence', async () => {
  const mod = await loadModule();
  assert.equal(mod.SCHEMA_VERSION, 'yalken.googleDocs.localExportPacket.v1');
  assert.equal(mod.RECEIPT_SCHEMA_VERSION, 'yalken.googleDocs.localExportPacketQuarantine.receipt.v1');

  const result = mod.evaluateGoogleDocsLocalExportPacketQuarantine(syntheticPacket());
  assert.equal(result.ok, true);
  assert.equal(result.status, STATUS);
  assert.equal(result.result, RESULT);
  assert.equal(result.action, 'QUARANTINE_ONLY');
  assert.equal(result.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(result.profileId, 'google-docs-office-mode-post-d1-v1');
  assert.equal(result.provider, 'google-docs');
  assert.equal(result.counts.totalArtifacts, 1);
  assert.equal(result.counts.quarantinedArtifacts, 1);
  assert.equal(result.counts.applyAdmitted, 0);
  assert.equal(result.counts.productMutations, 0);
  assert.equal(result.packetDigest.startsWith('sha256:'), true);
});

test('Google Docs local export packet quarantine rejects overclaims, Word inheritance, stale digest and profile transplant', async () => {
  const mod = await loadModule();

  const cases = [
    {
      name: 'missing schema',
      packet: { ...syntheticPacket(), schemaVersion: '' },
      code: 'GOOGLE_EXPORT_PACKET_SCHEMA_INVALID',
    },
    {
      name: 'unknown profile',
      packet: { ...syntheticPacket(), profileId: 'word-mac-16.112-26081010' },
      code: 'GOOGLE_EXPORT_PACKET_PROFILE_NOT_DECLARED',
    },
    {
      name: 'support overclaim',
      packet: { ...syntheticPacket(), claims: { ...syntheticPacket().claims, supportProven: true } },
      code: 'GOOGLE_EXPORT_PACKET_OVERCLAIM',
    },
    {
      name: 'apply authority overclaim',
      packet: { ...syntheticPacket(), claims: { ...syntheticPacket().claims, applyAuthority: true } },
      code: 'GOOGLE_EXPORT_PACKET_OVERCLAIM',
    },
    {
      name: 'runtime wiring overclaim',
      packet: { ...syntheticPacket(), productRuntimeWired: true },
      code: 'GOOGLE_EXPORT_PACKET_OVERCLAIM',
    },
    {
      name: 'physical Google evidence overclaim',
      packet: { ...syntheticPacket(), physicalGoogleEvidence: true },
      code: 'GOOGLE_EXPORT_PACKET_OVERCLAIM',
    },
    {
      name: 'Word evidence inheritance',
      packet: { ...syntheticPacket(), provider: 'word', inheritedEvidenceProfileId: 'word-mac-16.112-26081010' },
      code: 'GOOGLE_EXPORT_PACKET_WORD_EVIDENCE_INHERITANCE',
    },
    {
      name: 'stale artifact digest',
      packet: {
        ...syntheticPacket(),
        artifacts: [{ ...syntheticPacket().artifacts[0], payloadSha256: `sha256:${sha256Text('stale')}` }],
      },
      code: 'GOOGLE_EXPORT_PACKET_ARTIFACT_DIGEST_MISMATCH',
    },
    {
      name: 'transplanted source binding',
      packet: {
        ...syntheticPacket(),
        sourceBinding: { ...syntheticPacket().sourceBinding, projectId: 'foreign-project' },
      },
      code: 'GOOGLE_EXPORT_PACKET_SOURCE_TRANSPLANT',
    },
    {
      name: 'unknown cannot pass',
      packet: { ...syntheticPacket(), limitations: ['UNKNOWN'] },
      code: 'GOOGLE_EXPORT_PACKET_UNKNOWN_ABSTAIN_NOT_PASS',
    },
  ];

  for (const item of cases) {
    const result = mod.evaluateGoogleDocsLocalExportPacketQuarantine(item.packet);
    assert.equal(result.ok, false, item.name);
    assert.equal(result.code, item.code, item.name);
    assert.equal(result.result, 'FAIL_CLOSED', item.name);
    assert.equal(result.counts.applyAdmitted, 0, item.name);
    assert.equal(result.counts.productMutations, 0, item.name);
  }
});

test('Google Docs local export packet quarantine writes a receipt without support wording or profile promotion', async (t) => {
  const mod = await loadModule();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-google-docs-quarantine-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  for (const relativePath of [REGISTRY_PATH, G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH]) {
    copyFixtureFile(tempRoot, relativePath);
  }

  const json = mod.writeGoogleDocsLocalExportPacketQuarantineArtifacts({ repoRoot: tempRoot });
  assert.equal(json.ok, true);
  assert.equal(json.status, STATUS);
  assert.equal(json.result, RESULT);
  assert.equal(json.physicalGoogleEvidence, 0);
  assert.equal(json.productRuntimeWired, 0);

  const receipt = JSON.parse(fs.readFileSync(path.join(tempRoot, RECEIPT_PATH), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(tempRoot, REGISTRY_PATH), 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(path.join(tempRoot, G00_MATRIX_PATH), 'utf8'));
  const discovery = JSON.parse(fs.readFileSync(path.join(tempRoot, G00_DISCOVERY_RECEIPT_PATH), 'utf8'));
  assert.equal(receipt.status, STATUS);
  assert.equal(receipt.result, RESULT);
  assert.equal(receipt.localQuarantineOnly, true);
  assert.equal(receipt.noProductMutation, true);
  assert.equal(receipt.realAccountE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(receipt.samplePacket.result.ok, true);
  assert.equal(registry.discoveryHeads.some((row) => row.path === RECEIPT_PATH), true);
  assert.equal(matrix.localExportPacketQuarantine.status, STATUS);
  assert.equal(matrix.localExportPacketQuarantine.receiptPath, RECEIPT_PATH);
  assert.equal(matrix.localExportPacketQuarantine.supportClaimed, false);
  assert.equal(matrix.localExportPacketQuarantine.applyAuthority, false);
  assert.equal(discovery.localExportPacketQuarantine.status, STATUS);
  assert.equal(discovery.localExportPacketQuarantine.receiptPath, RECEIPT_PATH);

  const sourceText = [
    fs.readFileSync(path.join(tempRoot, RECEIPT_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, REGISTRY_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, G00_MATRIX_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, G00_DISCOVERY_RECEIPT_PATH), 'utf8'),
    fs.readFileSync(path.join(REPO_ROOT, MODULE_PATH), 'utf8'),
  ].join('\n');
  assert.equal(/\bGoogle Docs support is (ready|complete|proven|available|supported)\b/iu.test(sourceText), false);
  assert.equal(/\broundtrip (is )?(ready|complete|proven|supported)\b/iu.test(sourceText), false);
  assert.equal(/\bapply authority (is )?(ready|granted|proven)\b/iu.test(sourceText), false);

  const evaluated = mod.evaluateGoogleDocsLocalExportPacketQuarantine(receipt.samplePacket.packet);
  assert.deepEqual(evaluated, receipt.samplePacket.result);
});
