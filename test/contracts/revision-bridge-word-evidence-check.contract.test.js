const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = 'src/io/revisionBridge/index.mjs';
const TEST_PATH = 'test/contracts/revision-bridge-word-evidence-check.contract.test.js';
const P0_TEST_PATH = 'test/contracts/revision-bridge-p0-safety-kernel.contract.test.js';
const GOOGLE_TEST_PATH = 'test/contracts/revision-bridge-google-docs-evidence-check.contract.test.js';
const CLAIM_BINDING_TEST_PATH = 'test/contracts/review-bridge-word-evidence-claim-binding.contract.test.js';
const CLAIM_BINDING_STATUS_PATH = 'docs/OPS/STATUS/REVIEW_BRIDGE_WORD_EVIDENCE_CLAIM_BINDING_001_STATUS.json';
const GOOGLE_CLAIM_BINDING_TEST_PATH = 'test/contracts/review-bridge-google-docs-evidence-claim-binding.contract.test.js';
const GOOGLE_CLAIM_BINDING_STATUS_PATH = 'docs/OPS/STATUS/REVIEW_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_BINDING_001_STATUS.json';
const FORMAT_MATRIX_TEST_PATH = 'test/contracts/revision-bridge-format-matrix-claim-gate.contract.test.js';
const FORMAT_MATRIX_CLAIM_BINDING_TEST_PATH = 'test/contracts/review-bridge-format-matrix-claim-binding.contract.test.js';
const FORMAT_MATRIX_CLAIM_BINDING_STATUS_PATH = 'docs/OPS/STATUS/REVIEW_BRIDGE_FORMAT_MATRIX_CLAIM_BINDING_001_STATUS.json';
const RELEASE_CLAIM_DOSSIER_BINDING_TEST_PATH = 'test/contracts/review-bridge-release-claim-dossier-binding.contract.test.js';
const RELEASE_CLAIM_DOSSIER_BINDING_STATUS_PATH = 'docs/OPS/STATUS/REVIEW_BRIDGE_RELEASE_CLAIM_DOSSIER_BINDING_001_STATUS.json';
const GOVERNANCE_APPROVALS_PATH = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const RELEASE_CANDIDATE_LOCK_PATH = 'docs/OPS/STATUS/RELEASE_CANDIDATE_LOCK.json';
const SECTOR_M_SCOPE_MAP_PATH = 'scripts/ops/sector-m-scope-map.json';
const W5_STATUS_PATH = 'docs/OPS/RTK/W5_RELEASE_HARDENING_CERTIFICATION_STATUS.json';
const W5_VERIFIER_PATH = 'scripts/ops/rtk-w5-release-hardening-certification.mjs';
const W5_TEST_PATH = 'test/contracts/rtk-w5-release-hardening-certification.contract.test.js';
const POST_D1_PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';
const POST_D1_A00_RECEIPT_PATH = 'docs/OPS/RTK/POST_D1_A00_RECONCILIATION_RECEIPT.json';
const POST_D1_HARNESS_PATH = 'scripts/ops/rtk-post-d1-editor-lab-harness.mjs';
const POST_D1_TEST_PATH = 'test/contracts/rtk-post-d1-portability-program.contract.test.js';
const WORD_LATEST_B00_MATRIX_PATH = 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B00_MATRIX.json';
const WORD_LATEST_B00_RECEIPT_PATH = 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B00_DESIGN_RECEIPT.json';
const WORD_LATEST_B00_GENERATOR_PATH = 'scripts/ops/rtk-word-latest-semantic-corpus-generator.mjs';
const WORD_LATEST_B00_TEST_PATH = 'test/contracts/rtk-word-latest-semantic-b00.contract.test.js';
const WORD_LATEST_B01_RECEIPT_PATH = 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B01_LOCATOR_SURVIVAL_RECEIPT.json';
const WORD_LATEST_B01_LAB_PATH = 'scripts/ops/rtk-word-latest-signed-locator-lab.mjs';
const WORD_LATEST_B01_MANIFEST_CORE_PATH = 'src/io/revisionBridge/reviewTransportManifestCore.mjs';
const WORD_LATEST_B01_TEST_PATH = 'test/contracts/rtk-word-latest-semantic-b01-signed-locator.contract.test.js';
const WORD_LATEST_B02_RECEIPT_PATH = 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B02_PACKAGE_PARSER_RECEIPT.json';
const WORD_LATEST_B02_PARSER_CORE_PATH = 'src/io/revisionBridge/reviewTransportPackageParserV2.mjs';
const WORD_LATEST_B02_TEST_PATH = 'test/contracts/rtk-word-latest-semantic-b02-package-parser.contract.test.js';
const WORD_LATEST_B03_RECEIPT_PATH = 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B03_MODERN_COMMENTS_RECEIPT.json';
const WORD_LATEST_B03_TEST_PATH = 'test/contracts/rtk-word-latest-semantic-b03-modern-comments.contract.test.js';
const DOCX_PACKAGE_BOUNDARY_TEST_PATH = 'test/contracts/revision-bridge-docx-package-boundary.contract.test.js';
const CONTEXT_PATH = 'docs/CONTEXT.md';
const HANDOFF_PATH = 'docs/HANDOFF.md';
const WORKLOG_PATH = 'docs/WORKLOG.md';
const ALLOWLIST = [
  MODULE_PATH,
  TEST_PATH,
  P0_TEST_PATH,
  GOOGLE_TEST_PATH,
  CLAIM_BINDING_TEST_PATH,
  CLAIM_BINDING_STATUS_PATH,
  GOOGLE_CLAIM_BINDING_TEST_PATH,
  GOOGLE_CLAIM_BINDING_STATUS_PATH,
  FORMAT_MATRIX_TEST_PATH,
  FORMAT_MATRIX_CLAIM_BINDING_TEST_PATH,
  FORMAT_MATRIX_CLAIM_BINDING_STATUS_PATH,
  RELEASE_CLAIM_DOSSIER_BINDING_TEST_PATH,
  RELEASE_CLAIM_DOSSIER_BINDING_STATUS_PATH,
  GOVERNANCE_APPROVALS_PATH,
  RELEASE_CANDIDATE_LOCK_PATH,
  SECTOR_M_SCOPE_MAP_PATH,
  W5_STATUS_PATH,
  W5_VERIFIER_PATH,
  W5_TEST_PATH,
  POST_D1_PROGRAM_PATH,
  POST_D1_A00_RECEIPT_PATH,
  POST_D1_HARNESS_PATH,
  POST_D1_TEST_PATH,
  WORD_LATEST_B00_MATRIX_PATH,
  WORD_LATEST_B00_RECEIPT_PATH,
  WORD_LATEST_B00_GENERATOR_PATH,
  WORD_LATEST_B00_TEST_PATH,
  WORD_LATEST_B01_RECEIPT_PATH,
  WORD_LATEST_B01_LAB_PATH,
  WORD_LATEST_B01_MANIFEST_CORE_PATH,
  WORD_LATEST_B01_TEST_PATH,
  WORD_LATEST_B02_RECEIPT_PATH,
  WORD_LATEST_B02_PARSER_CORE_PATH,
  WORD_LATEST_B02_TEST_PATH,
  WORD_LATEST_B03_RECEIPT_PATH,
  WORD_LATEST_B03_TEST_PATH,
  DOCX_PACKAGE_BOUNDARY_TEST_PATH,
  CONTEXT_PATH,
  HANDOFF_PATH,
  WORKLOG_PATH,
];

async function loadBridge() {
  return import(pathToFileURL(path.join(REPO_ROOT, MODULE_PATH)).href);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validEvidencePacket(overrides = {}) {
  return {
    schemaVersion: 'revision-bridge.word-evidence-packet.v1',
    packetId: 'packet-1',
    packetClass: 'textExact',
    coverage: ['textExact'],
    evidence: [
      {
        evidenceId: 'evidence-1',
        supportClass: 'textExact',
        digest: 'sha256:document-main',
        locator: 'word/document.xml',
      },
    ],
    ...overrides,
  };
}

function validClaim(bridge, evidencePacket, overrides = {}) {
  return {
    schemaVersion: 'revision-bridge.word-support-claim.v1',
    claimId: 'claim-1',
    claimedCoverage: deepClone(evidencePacket.coverage),
    evidenceHash: bridge.createWordEvidencePacketHash(evidencePacket),
    ...overrides,
  };
}

function validGateInput(bridge, overrides = {}) {
  const evidencePacket = overrides.evidencePacket || validEvidencePacket();
  const claim = overrides.claim || validClaim(bridge, evidencePacket);
  return {
    evidencePacket,
    claim,
  };
}

function changedFilesFromGitStatus(statusText) {
  return statusText
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^"|"$/gu, ''));
}

test('Contour 10 exports Word evidence gate contracts', async () => {
  const bridge = await loadBridge();

  assert.equal(
    bridge.REVISION_BRIDGE_WORD_EVIDENCE_PACKET_SCHEMA,
    'revision-bridge.word-evidence-packet.v1',
  );
  assert.equal(
    bridge.REVISION_BRIDGE_WORD_SUPPORT_CLAIM_SCHEMA,
    'revision-bridge.word-support-claim.v1',
  );
  assert.deepEqual(bridge.REVISION_BRIDGE_WORD_EVIDENCE_PACKET_CLASSES, [
    'textExact',
    'commentAnchor',
    'structuralManual',
  ]);
  assert.equal(typeof bridge.createWordEvidencePacketHash, 'function');
  assert.equal(typeof bridge.evaluateWordEvidenceClaimGate, 'function');
  assert.equal(
    bridge.REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_GATE_REASON_CODES.includes('REVISION_BRIDGE_WORD_EVIDENCE_HASH_MISMATCH'),
    true,
  );
});

test('Contour 10 accepts every supported Word evidence packet class when hash and coverage align', async () => {
  const bridge = await loadBridge();

  for (const packetClass of bridge.REVISION_BRIDGE_WORD_EVIDENCE_PACKET_CLASSES) {
    const evidencePacket = validEvidencePacket({
      packetId: `packet-${packetClass}`,
      packetClass,
      coverage: [packetClass],
      evidence: [
        {
          evidenceId: `evidence-${packetClass}`,
          supportClass: packetClass,
          digest: `sha256:${packetClass}`,
          locator: `word/${packetClass}.xml`,
        },
      ],
    });
    const claim = validClaim(bridge, evidencePacket, {
      claimId: `claim-${packetClass}`,
      claimedCoverage: [packetClass],
    });

    const result = bridge.evaluateWordEvidenceClaimGate({ evidencePacket, claim });

    assert.equal(result.ok, true, packetClass);
    assert.equal(result.type, 'revisionBridge.wordEvidenceClaimGate');
    assert.equal(result.status, 'accepted');
    assert.equal(result.code, 'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_ACCEPTED');
    assert.equal(result.reason, 'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_ACCEPTED');
    assert.deepEqual(result.reasons, []);
    assert.equal(result.binding.evidenceHash, claim.evidenceHash);
    assert.deepEqual(result.binding.claimedCoverage, [packetClass]);
    assert.deepEqual(result.binding.coveredCoverage, [packetClass]);
  }
});

test('Contour 10 blocks claims when evidence is missing or invalid', async () => {
  const bridge = await loadBridge();
  const missingEvidence = bridge.evaluateWordEvidenceClaimGate({
    evidencePacket: {
      schemaVersion: 'revision-bridge.word-evidence-packet.v1',
      packetId: 'packet-missing',
      packetClass: 'textExact',
      coverage: ['textExact'],
    },
    claim: validClaim(bridge, validEvidencePacket()),
  });
  const invalidEvidence = bridge.evaluateWordEvidenceClaimGate({
    evidencePacket: validEvidencePacket({
      evidence: [
        {
          evidenceId: 'evidence-invalid',
          supportClass: 'unknown-class',
          digest: '',
        },
      ],
    }),
    claim: validClaim(bridge, validEvidencePacket()),
  });

  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.status, 'blocked');
  assert.equal(missingEvidence.code, 'E_REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_BLOCKED');
  assert.equal(missingEvidence.reason, 'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_REQUIRED');
  assert.equal(missingEvidence.reasons.some((reason) => reason.field === 'evidencePacket.evidence'), true);

  assert.equal(invalidEvidence.ok, false);
  assert.equal(invalidEvidence.status, 'blocked');
  assert.equal(invalidEvidence.code, 'E_REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_BLOCKED');
  assert.equal(invalidEvidence.reasons.some((reason) => (
    reason.code === 'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID'
    && reason.field === 'evidencePacket.evidence.0.supportClass'
  )), true);
  assert.equal(invalidEvidence.reasons.some((reason) => (
    reason.code === 'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID'
    && reason.field === 'evidencePacket.evidence.0.digest'
  )), true);
});

test('Contour 10 blocks claims when evidence locator is empty', async () => {
  const bridge = await loadBridge();
  const evidencePacket = validEvidencePacket({
    evidence: [
      {
        evidenceId: 'evidence-1',
        supportClass: 'textExact',
        digest: 'sha256:document-main',
        locator: '',
      },
    ],
  });
  const claim = validClaim(bridge, evidencePacket);

  const result = bridge.evaluateWordEvidenceClaimGate({ evidencePacket, claim });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'E_REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_BLOCKED');
  assert.equal(result.reasons.some((reason) => (
    reason.code === 'REVISION_BRIDGE_WORD_EVIDENCE_PACKET_INVALID'
    && reason.field === 'evidencePacket.evidence.0.locator'
  )), true);
});

test('Contour 10 blocks claims when evidence hash does not match the supplied packet', async () => {
  const bridge = await loadBridge();
  const input = validGateInput(bridge, {
    claim: validClaim(bridge, validEvidencePacket(), {
      evidenceHash: 'rbwe_wrong',
    }),
  });

  const result = bridge.evaluateWordEvidenceClaimGate(input);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'REVISION_BRIDGE_WORD_EVIDENCE_HASH_MISMATCH');
  assert.equal(result.reasons.some((reason) => reason.code === 'REVISION_BRIDGE_WORD_EVIDENCE_HASH_MISMATCH'), true);
  assert.equal(result.binding.evidenceHash, bridge.createWordEvidencePacketHash(input.evidencePacket));
});

test('Contour 10 blocks claims that exceed evidence packet coverage', async () => {
  const bridge = await loadBridge();
  const evidencePacket = validEvidencePacket({
    coverage: ['textExact'],
  });
  const claim = validClaim(bridge, evidencePacket, {
    claimedCoverage: ['textExact', 'commentAnchor'],
  });

  const result = bridge.evaluateWordEvidenceClaimGate({ evidencePacket, claim });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'REVISION_BRIDGE_WORD_EVIDENCE_COVERAGE_EXCEEDED');
  assert.deepEqual(result.reasons[0].unsupportedCoverage, ['commentAnchor']);
});

test('Contour 10 packet hash stays canonical when semantically identical coverage and evidence order changes', async () => {
  const bridge = await loadBridge();
  const packetA = validEvidencePacket({
    coverage: ['textExact', 'commentAnchor'],
    evidence: [
      {
        evidenceId: 'evidence-1',
        supportClass: 'textExact',
        digest: 'sha256:text',
        locator: 'word/document.xml',
      },
      {
        evidenceId: 'evidence-2',
        supportClass: 'commentAnchor',
        digest: 'sha256:comments',
        locator: 'word/comments.xml',
      },
    ],
  });
  const packetB = validEvidencePacket({
    coverage: ['commentAnchor', 'textExact'],
    evidence: [
      {
        evidenceId: 'evidence-2',
        supportClass: 'commentAnchor',
        digest: 'sha256:comments',
        locator: 'word/comments.xml',
      },
      {
        evidenceId: 'evidence-1',
        supportClass: 'textExact',
        digest: 'sha256:text',
        locator: 'word/document.xml',
      },
    ],
  });
  const hashA = bridge.createWordEvidencePacketHash(packetA);
  const hashB = bridge.createWordEvidencePacketHash(packetB);
  const claim = validClaim(bridge, packetA, {
    claimedCoverage: ['commentAnchor', 'textExact'],
    evidenceHash: hashA,
  });

  const result = bridge.evaluateWordEvidenceClaimGate({
    evidencePacket: packetB,
    claim,
  });

  assert.equal(hashA, hashB);
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'REVISION_BRIDGE_WORD_EVIDENCE_CLAIM_ACCEPTED');
});

test('Contour 10 gate does not mutate claim or evidence inputs', async () => {
  const bridge = await loadBridge();
  const input = validGateInput(bridge, {
    evidencePacket: validEvidencePacket({
      coverage: ['textExact', 'commentAnchor'],
      evidence: [
        {
          evidenceId: 'evidence-1',
          supportClass: 'textExact',
          digest: 'sha256:text',
          locator: 'word/document.xml',
        },
        {
          evidenceId: 'evidence-2',
          supportClass: 'commentAnchor',
          digest: 'sha256:comments',
          locator: 'word/comments.xml',
        },
      ],
    }),
  });
  input.claim = validClaim(bridge, input.evidencePacket, {
    claimedCoverage: ['textExact', 'commentAnchor'],
  });
  const before = deepClone(input);

  bridge.createWordEvidencePacketHash(input.evidencePacket);
  bridge.evaluateWordEvidenceClaimGate(input);

  assert.deepEqual(input, before);
});

test('Contour 10 gate module stays pure and free of runtime side-effect imports', () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, MODULE_PATH), 'utf8');
  const sectionMatch = text.match(
    /\/\/ CONTOUR_10_WORD_EVIDENCE_CHECK_R2_START[\s\S]*?\/\/ CONTOUR_10_WORD_EVIDENCE_CHECK_R2_END/u,
  );
  assert.ok(sectionMatch, 'Contour 10 Word evidence section exists');
  const sectionText = sectionMatch[0];
  const forbiddenPatterns = [
    /\bimport\b/u,
    /\brequire\s*\(/u,
    /\bfs\b/u,
    /\bchild_process\b/u,
    /\bfetch\s*\(/u,
    /\bXMLHttpRequest\b/u,
    /\bWebSocket\b/u,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(sectionText), false, `forbidden bridge pattern: ${pattern.source}`);
  }
});

test('Contour 10 changed files stay inside the contour allowlist', () => {
  const status = execFileSync('git', ['status', '--porcelain', '-uall'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const changedFiles = changedFilesFromGitStatus(status);

  for (const filePath of changedFiles) {
    assert.equal(ALLOWLIST.includes(filePath), true, `changed file outside allowlist: ${filePath}`);
  }
});
