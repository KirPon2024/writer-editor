const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = 'src/io/revisionBridge/index.mjs';
const TEST_PATH = 'test/contracts/revision-bridge-google-docs-evidence-check.contract.test.js';
const WORD_TEST_PATH = 'test/contracts/revision-bridge-word-evidence-check.contract.test.js';
const CLAIM_BINDING_TEST_PATH = 'test/contracts/review-bridge-google-docs-evidence-claim-binding.contract.test.js';
const CLAIM_BINDING_STATUS_PATH = 'docs/OPS/STATUS/REVIEW_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_BINDING_001_STATUS.json';
const FORMAT_MATRIX_TEST_PATH = 'test/contracts/revision-bridge-format-matrix-claim-gate.contract.test.js';
const FORMAT_MATRIX_CLAIM_BINDING_TEST_PATH = 'test/contracts/review-bridge-format-matrix-claim-binding.contract.test.js';
const FORMAT_MATRIX_CLAIM_BINDING_STATUS_PATH = 'docs/OPS/STATUS/REVIEW_BRIDGE_FORMAT_MATRIX_CLAIM_BINDING_001_STATUS.json';
const RELEASE_CLAIM_DOSSIER_BINDING_TEST_PATH = 'test/contracts/review-bridge-release-claim-dossier-binding.contract.test.js';
const RELEASE_CLAIM_DOSSIER_BINDING_STATUS_PATH = 'docs/OPS/STATUS/REVIEW_BRIDGE_RELEASE_CLAIM_DOSSIER_BINDING_001_STATUS.json';
const GOVERNANCE_APPROVALS_PATH = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const GOOGLE_G00_SCRIPT_PATH = 'scripts/ops/rtk-google-docs-g00-discovery-binding.mjs';
const GOOGLE_G00_MODEL_PATH = 'scripts/ops/rtk-google-docs-g00-rebind-model.mjs';
const GOOGLE_G00_CONTRACT_PATH = 'test/contracts/rtk-google-docs-g00-discovery-binding.contract.test.js';
const GOOGLE_G00_MATRIX_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json';
const GOOGLE_G00_RECEIPT_PATH = 'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json';
const GOOGLE_BUILD_PROFILE_REGISTRY_PATH = 'docs/OPS/RTK/GOOGLE_BUILD_PROFILE_REGISTRY_V1.json';
const WORD_STAGE_CLOSURE_RECEIPT_PATH = 'docs/OPS/RTK/WORD_FOR_MAC_STAGE_FORMAL_CLOSURE_RECEIPT.json';
const POST_D1_PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';
const WORD_CAPABILITY_PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const WORD_SATURATION_LEDGER_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const CONTEXT_PATH = 'docs/CONTEXT.md';
const HANDOFF_PATH = 'docs/HANDOFF.md';
const WORKLOG_PATH = 'docs/WORKLOG.md';
const ALLOWLIST = [
  MODULE_PATH,
  TEST_PATH,
  WORD_TEST_PATH,
  CLAIM_BINDING_TEST_PATH,
  CLAIM_BINDING_STATUS_PATH,
  FORMAT_MATRIX_TEST_PATH,
  FORMAT_MATRIX_CLAIM_BINDING_TEST_PATH,
  FORMAT_MATRIX_CLAIM_BINDING_STATUS_PATH,
  RELEASE_CLAIM_DOSSIER_BINDING_TEST_PATH,
  RELEASE_CLAIM_DOSSIER_BINDING_STATUS_PATH,
  GOVERNANCE_APPROVALS_PATH,
  GOOGLE_G00_SCRIPT_PATH,
  GOOGLE_G00_MODEL_PATH,
  GOOGLE_G00_CONTRACT_PATH,
  GOOGLE_G00_MATRIX_PATH,
  GOOGLE_G00_RECEIPT_PATH,
  GOOGLE_BUILD_PROFILE_REGISTRY_PATH,
  WORD_STAGE_CLOSURE_RECEIPT_PATH,
  POST_D1_PROGRAM_PATH,
  WORD_CAPABILITY_PROFILE_PATH,
  WORD_SATURATION_LEDGER_PATH,
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
    schemaVersion: 'revision-bridge.google-docs-evidence-packet.v1',
    packetId: 'google-packet-1',
    packetClass: 'docsSuggestions',
    coverage: ['docsSuggestions', 'driveComments'],
    evidence: [
      {
        evidenceId: 'google-evidence-1',
        supportClass: 'docsSuggestions',
        digest: 'sha256:docs-suggestions',
        locator: 'docs/suggestions',
      },
      {
        evidenceId: 'google-evidence-2',
        supportClass: 'driveComments',
        digest: 'sha256:drive-comments',
        locator: 'drive/comments',
      },
    ],
    ...overrides,
  };
}

function validClaim(bridge, evidencePacket, overrides = {}) {
  return {
    schemaVersion: 'revision-bridge.google-docs-support-claim.v1',
    claimId: 'google-claim-1',
    claimedCoverage: deepClone(evidencePacket.coverage),
    evidenceHash: bridge.createGoogleDocsEvidencePacketHash(evidencePacket),
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

test('Contour 11 exports Google Docs evidence gate contracts', async () => {
  const bridge = await loadBridge();

  assert.equal(
    bridge.REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_SCHEMA,
    'revision-bridge.google-docs-evidence-packet.v1',
  );
  assert.equal(
    bridge.REVISION_BRIDGE_GOOGLE_DOCS_SUPPORT_CLAIM_SCHEMA,
    'revision-bridge.google-docs-support-claim.v1',
  );
  assert.deepEqual(bridge.REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_CLASSES, [
    'docsSuggestions',
    'driveComments',
    'structuralManual',
  ]);
  assert.equal(typeof bridge.createGoogleDocsEvidencePacketHash, 'function');
  assert.equal(typeof bridge.evaluateGoogleDocsEvidenceClaimGate, 'function');
  assert.equal(
    bridge.REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_GATE_REASON_CODES.includes('REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_HASH_MISMATCH'),
    true,
  );
  assert.equal(
    bridge.REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_GATE_REASON_CODES.includes('REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_REQUIRED_CLASSES_MISSING'),
    true,
  );
});

test('Contour 11 accepts Google Docs claim when hash and required coverage align', async () => {
  const bridge = await loadBridge();
  const evidencePacket = validEvidencePacket();
  const claim = validClaim(bridge, evidencePacket, {
    claimedCoverage: ['docsSuggestions', 'driveComments'],
  });

  const result = bridge.evaluateGoogleDocsEvidenceClaimGate({ evidencePacket, claim });

  assert.equal(result.ok, true);
  assert.equal(result.type, 'revisionBridge.googleDocsEvidenceClaimGate');
  assert.equal(result.status, 'accepted');
  assert.equal(result.code, 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_ACCEPTED');
  assert.equal(result.reason, 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_ACCEPTED');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.binding.evidenceHash, claim.evidenceHash);
  assert.deepEqual(result.binding.claimedCoverage, ['docsSuggestions', 'driveComments']);
  assert.deepEqual(result.binding.coveredCoverage, ['docsSuggestions', 'driveComments']);
  assert.deepEqual(result.binding.requiredCoverage, ['docsSuggestions', 'driveComments']);
});

test('Contour 11 blocks when evidencePacket is missing required fields', async () => {
  const bridge = await loadBridge();
  const result = bridge.evaluateGoogleDocsEvidenceClaimGate({
    evidencePacket: {
      schemaVersion: 'revision-bridge.google-docs-evidence-packet.v1',
      packetId: 'missing-evidence',
      packetClass: 'docsSuggestions',
      coverage: ['docsSuggestions'],
    },
    claim: validClaim(bridge, validEvidencePacket()),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'E_REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_BLOCKED');
  assert.equal(result.reason, 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_REQUIRED');
  assert.equal(result.reasons.some((reason) => reason.field === 'evidencePacket.evidence'), true);
});

test('Contour 11 blocks when evidence locator is empty', async () => {
  const bridge = await loadBridge();
  const evidencePacket = validEvidencePacket({
    evidence: [
      {
        evidenceId: 'google-evidence-1',
        supportClass: 'docsSuggestions',
        digest: 'sha256:docs-suggestions',
        locator: '',
      },
      {
        evidenceId: 'google-evidence-2',
        supportClass: 'driveComments',
        digest: 'sha256:drive-comments',
        locator: '',
      },
    ],
  });
  const claim = validClaim(bridge, evidencePacket);

  const result = bridge.evaluateGoogleDocsEvidenceClaimGate({ evidencePacket, claim });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'E_REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_BLOCKED');
  assert.equal(result.reasons.some((reason) => (
    reason.code === 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID'
    && reason.field === 'evidencePacket.evidence.0.locator'
  )), true);
  assert.equal(result.reasons.some((reason) => (
    reason.code === 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_PACKET_INVALID'
    && reason.field === 'evidencePacket.evidence.1.locator'
  )), true);
});

test('Contour 11 blocks when claim is missing', async () => {
  const bridge = await loadBridge();
  const result = bridge.evaluateGoogleDocsEvidenceClaimGate({
    evidencePacket: validEvidencePacket(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'E_REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_BLOCKED');
  assert.equal(result.reason, 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_REQUIRED');
  assert.equal(result.reasons.some((reason) => reason.field === 'claim'), true);
});

test('Contour 11 blocks when evidence hash does not match packet hash', async () => {
  const bridge = await loadBridge();
  const input = validGateInput(bridge, {
    claim: validClaim(bridge, validEvidencePacket(), {
      evidenceHash: 'rbgde_wrong',
    }),
  });

  const result = bridge.evaluateGoogleDocsEvidenceClaimGate(input);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_HASH_MISMATCH');
  assert.equal(result.reasons.some((reason) => reason.code === 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_HASH_MISMATCH'), true);
  assert.equal(result.binding.evidenceHash, bridge.createGoogleDocsEvidencePacketHash(input.evidencePacket));
});

test('Contour 11 blocks claims that exceed Google Docs evidence coverage', async () => {
  const bridge = await loadBridge();
  const evidencePacket = validEvidencePacket({
    coverage: ['docsSuggestions', 'driveComments'],
    evidence: [
      {
        evidenceId: 'google-evidence-1',
        supportClass: 'docsSuggestions',
        digest: 'sha256:docs-suggestions',
        locator: 'docs/suggestions',
      },
      {
        evidenceId: 'google-evidence-2',
        supportClass: 'driveComments',
        digest: 'sha256:drive-comments',
        locator: 'drive/comments',
      },
    ],
  });
  const claim = validClaim(bridge, evidencePacket, {
    claimedCoverage: ['docsSuggestions', 'driveComments', 'structuralManual'],
  });

  const result = bridge.evaluateGoogleDocsEvidenceClaimGate({ evidencePacket, claim });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_COVERAGE_EXCEEDED');
  assert.deepEqual(result.reasons[0].unsupportedCoverage, ['structuralManual']);
});

test('Contour 11 requires docsSuggestions and driveComments classes for Google claim', async () => {
  const bridge = await loadBridge();
  const evidencePacket = validEvidencePacket({
    coverage: ['docsSuggestions'],
    evidence: [
      {
        evidenceId: 'google-evidence-1',
        supportClass: 'docsSuggestions',
        digest: 'sha256:docs-suggestions',
        locator: 'docs/suggestions',
      },
    ],
  });
  const claim = validClaim(bridge, evidencePacket, {
    claimedCoverage: ['docsSuggestions'],
  });

  const result = bridge.evaluateGoogleDocsEvidenceClaimGate({ evidencePacket, claim });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_REQUIRED_CLASSES_MISSING');
  assert.deepEqual(result.reasons[0].missingPacketCoverage, ['driveComments']);
  assert.deepEqual(result.reasons[0].missingClaimCoverage, ['driveComments']);
});

test('Contour 11 packet hash stays canonical when semantically identical coverage and evidence order changes', async () => {
  const bridge = await loadBridge();
  const packetA = validEvidencePacket({
    coverage: ['docsSuggestions', 'driveComments'],
    evidence: [
      {
        evidenceId: 'google-evidence-1',
        supportClass: 'docsSuggestions',
        digest: 'sha256:docs-suggestions',
        locator: 'docs/suggestions',
      },
      {
        evidenceId: 'google-evidence-2',
        supportClass: 'driveComments',
        digest: 'sha256:drive-comments',
        locator: 'drive/comments',
      },
    ],
  });
  const packetB = validEvidencePacket({
    coverage: ['driveComments', 'docsSuggestions'],
    evidence: [
      {
        evidenceId: 'google-evidence-2',
        supportClass: 'driveComments',
        digest: 'sha256:drive-comments',
        locator: 'drive/comments',
      },
      {
        evidenceId: 'google-evidence-1',
        supportClass: 'docsSuggestions',
        digest: 'sha256:docs-suggestions',
        locator: 'docs/suggestions',
      },
    ],
  });
  const hashA = bridge.createGoogleDocsEvidencePacketHash(packetA);
  const hashB = bridge.createGoogleDocsEvidencePacketHash(packetB);
  const claim = validClaim(bridge, packetA, {
    claimedCoverage: ['driveComments', 'docsSuggestions'],
    evidenceHash: hashA,
  });

  const result = bridge.evaluateGoogleDocsEvidenceClaimGate({
    evidencePacket: packetB,
    claim,
  });

  assert.equal(hashA, hashB);
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'REVISION_BRIDGE_GOOGLE_DOCS_EVIDENCE_CLAIM_ACCEPTED');
});

test('Contour 11 gate does not mutate Google claim or evidence inputs', async () => {
  const bridge = await loadBridge();
  const input = validGateInput(bridge);
  const before = deepClone(input);

  bridge.createGoogleDocsEvidencePacketHash(input.evidencePacket);
  bridge.evaluateGoogleDocsEvidenceClaimGate(input);

  assert.deepEqual(input, before);
});

test('Contour 11 gate module stays pure and free of runtime side-effect imports', () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, MODULE_PATH), 'utf8');
  const sectionMatch = text.match(
    /\/\/ CONTOUR_11_GOOGLE_DOCS_EVIDENCE_CHECK_START[\s\S]*?\/\/ CONTOUR_11_GOOGLE_DOCS_EVIDENCE_CHECK_END/u,
  );
  assert.ok(sectionMatch, 'Contour 11 Google Docs evidence section exists');
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

test('Contour 11 changed files stay inside the contour allowlist', () => {
  const status = execFileSync('git', ['status', '--porcelain', '-uall'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const changedFiles = changedFilesFromGitStatus(status);

  for (const filePath of changedFiles) {
    assert.equal(ALLOWLIST.includes(filePath), true, `changed file outside allowlist: ${filePath}`);
  }
});
