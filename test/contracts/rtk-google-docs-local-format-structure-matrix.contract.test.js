const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();
const MODULE_PATH = 'scripts/ops/rtk-google-docs-local-format-structure-matrix-v1.mjs';
const MODEL_PATH = 'scripts/ops/rtk-google-docs-local-format-structure-matrix-model.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1_RECEIPT.json';
const REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
const G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
const G00_DISCOVERY_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
const RTK_CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
const STATUS = 'GOOGLE_DOCS_LOCAL_FORMAT_STRUCTURE_MATRIX_V1_LOCAL_VERIFIED';
const RESULT = 'FORMAT_STRUCTURE_MATRIX_ABSTAIN_NEEDS_REAL_GOOGLE_E2E';

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

function buildCase({ caseId, lane, kind, anchor, expectedText }) {
  const payloadText = [
    `case:${caseId}`,
    `lane:${lane}`,
    `kind:${kind}`,
    `anchor:${anchor}`,
    `expected:${expectedText}`,
    'disposable synthetic local packet only',
  ].join('\n');
  return {
    caseId,
    lane,
    kind,
    anchor,
    payloadText,
    payloadSha256: `sha256:${sha256Text(payloadText)}`,
    sizeBytes: Buffer.byteLength(payloadText, 'utf8'),
    expectedText,
    expectedSha256: `sha256:${sha256Text(expectedText)}`,
    localDisposition: 'LOCAL_OBSERVED_UNTRUSTED',
  };
}

function matrixPacket(overrides = {}) {
  const cases = [
    buildCase({ caseId: 'fmt-bold-001', lane: 'formatting', kind: 'bold', anchor: 'paragraph-1/run-1', expectedText: 'bold marker retained in local synthetic OOXML label' }),
    buildCase({ caseId: 'fmt-italic-001', lane: 'formatting', kind: 'italic', anchor: 'paragraph-1/run-2', expectedText: 'italic marker retained in local synthetic OOXML label' }),
    buildCase({ caseId: 'fmt-underline-001', lane: 'formatting', kind: 'underline', anchor: 'paragraph-2/run-1', expectedText: 'underline marker retained in local synthetic OOXML label' }),
    buildCase({ caseId: 'fmt-heading-001', lane: 'formatting', kind: 'heading', anchor: 'heading-1', expectedText: 'heading style label retained locally' }),
    buildCase({ caseId: 'fmt-list-001', lane: 'formatting', kind: 'list', anchor: 'list-1/item-1', expectedText: 'list style label retained locally' }),
    buildCase({ caseId: 'fmt-link-001', lane: 'formatting', kind: 'link', anchor: 'paragraph-3/link-1', expectedText: 'link relationship label retained locally' }),
    buildCase({ caseId: 'struct-footnote-001', lane: 'structure', kind: 'footnote', anchor: 'paragraph-2/footnote-1', expectedText: 'footnote reference label observed locally' }),
    buildCase({ caseId: 'struct-table-001', lane: 'structure', kind: 'table', anchor: 'table-1/cell-1-1', expectedText: 'table cell label observed locally' }),
    buildCase({ caseId: 'struct-media-001', lane: 'structure', kind: 'media', anchor: 'media-1', expectedText: 'media placeholder label observed locally' }),
    buildCase({ caseId: 'struct-id-001', lane: 'structure', kind: 'stableId', anchor: 'synthetic-node-id-1', expectedText: 'synthetic id label observed locally' }),
  ];
  const fixturePayload = cases.map((row) => row.payloadText).join('\n---\n');
  const base = {
    schemaVersion: 'yalken.googleDocs.localFormatStructureMatrix.v1',
    packetId: 'synthetic-google-docs-format-structure-matrix-v1',
    sourceKind: 'DISPOSABLE_SYNTHETIC_GOOGLE_FORMAT_STRUCTURE_FIXTURE',
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
      payloadText: fixturePayload,
      payloadSha256: `sha256:${sha256Text(fixturePayload)}`,
      sizeBytes: Buffer.byteLength(fixturePayload, 'utf8'),
    },
    advertisedFormatCaseCount: 6,
    advertisedStructureCaseCount: 4,
    cases,
    claims: {
      supportProven: false,
      importProven: false,
      roundtripProven: false,
      formattingParsed: false,
      formattingTrusted: false,
      structureParsed: false,
      structureTrusted: false,
      applyAuthority: false,
      productMutationAuthority: false,
    },
    limitations: [
      'NO_REAL_GOOGLE_ACCOUNT_E2E',
      'NO_TRUSTED_GOOGLE_FORMATTING_IR',
      'NO_TRUSTED_GOOGLE_STRUCTURE_IR',
      'NO_FORMAT_OR_STRUCTURE_APPLY_AUTHORITY',
      'FORMAT_STRUCTURE_TYPED_ABSTAIN_LOCAL_ONLY',
    ],
  };
  return { ...base, ...overrides };
}

test('Google Docs local format/structure matrix admits only digest-bound synthetic typed limitation evidence', async () => {
  const mod = await loadModule();
  assert.equal(mod.SCHEMA_VERSION, 'yalken.googleDocs.localFormatStructureMatrix.v1');
  assert.equal(mod.RECEIPT_SCHEMA_VERSION, 'yalken.googleDocs.localFormatStructureMatrix.receipt.v1');

  const result = mod.evaluateGoogleDocsLocalFormatStructureMatrix(matrixPacket());
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
  assert.equal(result.formattingTrusted, false);
  assert.equal(result.structureTrusted, false);
  assert.equal(result.applyAuthority, 'DENY');
  assert.equal(result.counts.formatCasesAdvertised, 6);
  assert.equal(result.counts.formatCasesObserved, 6);
  assert.equal(result.counts.structureCasesAdvertised, 4);
  assert.equal(result.counts.structureCasesObserved, 4);
  assert.equal(result.counts.trustedCases, 0);
  assert.equal(result.counts.applyAdmitted, 0);
  assert.equal(result.counts.productMutations, 0);
  assert.equal(result.packetDigest.startsWith('sha256:'), true);
  assert.equal(result.matrixDigest.startsWith('sha256:'), true);
});

test('Google Docs local format/structure matrix rejects support, inheritance, stale bytes, replay, phantom diversity and UNKNOWN/ABSTAIN as PASS', async () => {
  const mod = await loadModule();
  const baseline = matrixPacket();
  const duplicateDigestCase = { ...baseline.cases[1], caseId: 'fmt-duplicate-digest-001', payloadSha256: baseline.cases[0].payloadSha256 };
  const cases = [
    ['missing schema', { ...baseline, schemaVersion: '' }, 'GOOGLE_FORMAT_STRUCTURE_SCHEMA_INVALID'],
    ['unknown profile', { ...baseline, profileId: 'word-mac-16.112-26081010' }, 'GOOGLE_FORMAT_STRUCTURE_PROFILE_NOT_DECLARED'],
    ['word inheritance', { ...baseline, provider: 'word', inheritedEvidenceProfileId: 'word-mac-16.112-26081010' }, 'GOOGLE_FORMAT_STRUCTURE_WORD_EVIDENCE_INHERITANCE'],
    ['support overclaim', { ...baseline, claims: { ...baseline.claims, supportProven: true } }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['import overclaim', { ...baseline, claims: { ...baseline.claims, importProven: true } }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['roundtrip overclaim', { ...baseline, claims: { ...baseline.claims, roundtripProven: true } }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['formatting parsed overclaim', { ...baseline, claims: { ...baseline.claims, formattingParsed: true } }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['formatting trusted overclaim', { ...baseline, claims: { ...baseline.claims, formattingTrusted: true } }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['structure parsed overclaim', { ...baseline, claims: { ...baseline.claims, structureParsed: true } }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['structure trusted overclaim', { ...baseline, claims: { ...baseline.claims, structureTrusted: true } }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['apply overclaim', { ...baseline, claims: { ...baseline.claims, applyAuthority: true } }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['runtime overclaim', { ...baseline, productRuntimeWired: true }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['network overclaim', { ...baseline, networkRuntimeUsed: true }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['user document overclaim', { ...baseline, userDocument: true }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['physical provider overclaim', { ...baseline, physicalGoogleEvidence: true }, 'GOOGLE_FORMAT_STRUCTURE_OVERCLAIM'],
    ['source transplant', { ...baseline, sourceBinding: { ...baseline.sourceBinding, documentId: 'foreign-doc' } }, 'GOOGLE_FORMAT_STRUCTURE_SOURCE_TRANSPLANT'],
    ['stale generation', { ...baseline, sourceBinding: { ...baseline.sourceBinding, generation: 2 } }, 'GOOGLE_FORMAT_STRUCTURE_SOURCE_TRANSPLANT'],
    ['stale fixture digest', { ...baseline, fixture: { ...baseline.fixture, payloadSha256: `sha256:${sha256Text('stale')}` } }, 'GOOGLE_FORMAT_STRUCTURE_FIXTURE_DIGEST_MISMATCH'],
    ['format count mismatch', { ...baseline, advertisedFormatCaseCount: 5 }, 'GOOGLE_FORMAT_STRUCTURE_COUNT_MISMATCH'],
    ['structure count mismatch', { ...baseline, advertisedStructureCaseCount: 3 }, 'GOOGLE_FORMAT_STRUCTURE_COUNT_MISMATCH'],
    ['duplicate case id', { ...baseline, cases: [baseline.cases[0], { ...baseline.cases[1], caseId: baseline.cases[0].caseId }, ...baseline.cases.slice(2)] }, 'GOOGLE_FORMAT_STRUCTURE_COUNT_MISMATCH'],
    ['unsupported kind', { ...baseline, cases: [{ ...baseline.cases[0], kind: 'floatingCanvas' }, ...baseline.cases.slice(1)] }, 'GOOGLE_FORMAT_STRUCTURE_UNSUPPORTED_KIND_ABSTAIN'],
    ['case digest reuse', { ...baseline, cases: [baseline.cases[0], duplicateDigestCase, ...baseline.cases.slice(2)] }, 'GOOGLE_FORMAT_STRUCTURE_PHANTOM_DIVERSITY_REJECTED'],
    ['case payload digest mismatch', { ...baseline, cases: [{ ...baseline.cases[0], payloadSha256: `sha256:${sha256Text('stale')}` }, ...baseline.cases.slice(1)] }, 'GOOGLE_FORMAT_STRUCTURE_CASE_DIGEST_MISMATCH'],
    ['case expected digest mismatch', { ...baseline, cases: [{ ...baseline.cases[0], expectedSha256: `sha256:${sha256Text('stale')}` }, ...baseline.cases.slice(1)] }, 'GOOGLE_FORMAT_STRUCTURE_CASE_DIGEST_MISMATCH'],
    ['unknown limitation cannot pass', { ...baseline, limitations: ['UNKNOWN'] }, 'GOOGLE_FORMAT_STRUCTURE_UNKNOWN_ABSTAIN_NOT_PASS'],
  ];

  for (const [name, packet, code] of cases) {
    const result = mod.evaluateGoogleDocsLocalFormatStructureMatrix(packet);
    assert.equal(result.ok, false, name);
    assert.equal(result.result, 'FAIL_CLOSED', name);
    assert.equal(result.code, code, name);
    assert.equal(result.counts.applyAdmitted, 0, name);
    assert.equal(result.counts.productMutations, 0, name);
  }
});

test('Google Docs local format/structure matrix writes exact receipts and keeps matrix honest', async (t) => {
  const mod = await loadModule();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-google-format-structure-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  for (const relativePath of [REGISTRY_PATH, G00_MATRIX_PATH, G00_DISCOVERY_RECEIPT_PATH, RTK_CATALOG_PATH]) {
    copyFixtureFile(tempRoot, relativePath);
  }

  const json = mod.writeGoogleDocsLocalFormatStructureMatrixArtifacts({ repoRoot: tempRoot });
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
  assert.equal(matrix.localFormatStructureMatrix.status, STATUS);
  assert.equal(matrix.localFormatStructureMatrix.receiptPath, RECEIPT_PATH);
  assert.equal(matrix.localFormatStructureMatrix.formattingTrusted, false);
  assert.equal(matrix.localFormatStructureMatrix.structureTrusted, false);
  assert.equal(matrix.localFormatStructureMatrix.applyAuthority, false);
  assert.equal(discovery.localFormatStructureMatrix.status, STATUS);
  assert.equal(discovery.localFormatStructureMatrix.receiptPath, RECEIPT_PATH);
  assert.equal(catalog.contractBasenames.includes('rtk-google-docs-local-format-structure-matrix.contract.test.js'), true);

  const formattingRow = matrix.rows.find((row) => row.cellId === 'google.formattingLane');
  assert.equal(formattingRow.currentTerminalClass, 'TYPED_ABSTAIN_LOCAL_ONLY');
  assert.equal(formattingRow.userFacingAuthority, 'NO_FORMATTING_TRANSFER_OR_APPLY_AUTHORITY');
  assert.equal(formattingRow.reasonCode, 'GOOGLE_FORMATTING_ABSTAIN_NO_REAL_GOOGLE_E2E');
  assert.equal(formattingRow.requiredNextContour, 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY');
  assert.equal(formattingRow.blocksGoogleStage, true);

  const structureRow = matrix.rows.find((row) => row.cellId === 'google.structureLane');
  assert.equal(structureRow.currentTerminalClass, 'TYPED_ABSTAIN_LOCAL_ONLY');
  assert.equal(structureRow.userFacingAuthority, 'NO_STRUCTURE_TRANSFER_OR_APPLY_AUTHORITY');
  assert.equal(structureRow.reasonCode, 'GOOGLE_STRUCTURE_ABSTAIN_NO_REAL_GOOGLE_E2E');
  assert.equal(structureRow.requiredNextContour, 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY');
  assert.equal(structureRow.blocksGoogleStage, true);

  assert.equal(matrix.currentRealityAudit.roundtripLossMatrix.formatting, 'ABSTAIN_TYPED_LOCAL_NO_GOOGLE_FORMATTING_E2E');
  assert.equal(matrix.currentRealityAudit.roundtripLossMatrix.footnotes, 'ABSTAIN_TYPED_LOCAL_NO_GOOGLE_STRUCTURE_E2E');
  assert.equal(matrix.currentRealityAudit.roundtripLossMatrix.tables, 'ABSTAIN_TYPED_LOCAL_NO_GOOGLE_STRUCTURE_E2E');
  assert.equal(matrix.currentRealityAudit.roundtripLossMatrix.media, 'ABSTAIN_TYPED_LOCAL_NO_GOOGLE_STRUCTURE_E2E');
  assert.equal(matrix.currentRealityAudit.roundtripLossMatrix.ids, 'ABSTAIN_TYPED_LOCAL_NO_GOOGLE_IDENTITY_E2E');
  assert.equal(matrix.googleCurrentState.nextLocalContour, 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1');
  assert.equal(discovery.nextLocalContour, 'GOOGLE_DOCS_LOCAL_RETURN_INTAKE_QUARANTINE_V1');

  const sourceText = [
    fs.readFileSync(path.join(tempRoot, RECEIPT_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, REGISTRY_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, G00_MATRIX_PATH), 'utf8'),
    fs.readFileSync(path.join(tempRoot, G00_DISCOVERY_RECEIPT_PATH), 'utf8'),
    fs.readFileSync(path.join(REPO_ROOT, MODULE_PATH), 'utf8'),
  ].join('\n');
  assert.equal(/\bGoogle Docs support is (ready|complete|proven|available|supported)\b/iu.test(sourceText), false);
  assert.equal(/\bformat(?:ting)? (?:IR |transfer )?(?:is |are )?(ready|complete|proven|supported|trusted)\b/iu.test(sourceText), false);
  assert.equal(/\bstructure (?:IR |transfer )?(?:is |are )?(ready|complete|proven|supported|trusted)\b/iu.test(sourceText), false);
  assert.equal(/\bapply authority (is )?(ready|granted|proven)\b/iu.test(sourceText), false);

  const evaluated = mod.evaluateGoogleDocsLocalFormatStructureMatrix(receipt.samplePacket.packet);
  assert.deepEqual(evaluated, receipt.samplePacket.result);
});

test('Google Docs local format/structure matrix model and mutation oracle have zero survivors', () => {
  const result = JSON.parse(execFileSync(process.execPath, [MODEL_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }));
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.finiteCases, 1);
  assert.equal(result.hostileCases, 26);
  assert.equal(result.semanticMutants, 17);
  assert.equal(result.survivors, 0);
  assert.equal(result.mismatches, 0);
});
