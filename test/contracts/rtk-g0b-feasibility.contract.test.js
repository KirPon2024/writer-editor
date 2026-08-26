const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const CONTRACTS_PATH = 'src/io/revisionBridge/reviewTransportContracts.mjs';
const CORE_PATH = 'src/io/revisionBridge/reviewTransportCore.mjs';
const IR_PATH = 'src/io/revisionBridge/reviewTransportIr.mjs';
const ORACLE_PATH = 'src/io/revisionBridge/reviewTransportOracle.mjs';
const ROUND_STORE_PATH = 'src/io/revisionBridge/reviewTransportRoundStore.mjs';
const TEST_PATH = 'test/contracts/rtk-g0b-feasibility.contract.test.js';
const W1_TEST_PATH = 'test/contracts/rtk-w1-no-write-vertical-slice.contract.test.js';
const W2_TEST_PATH = 'test/contracts/rtk-w2-bounded-parser-review-ir.contract.test.js';
const W3_APPLY_CORE_PATH = 'src/io/revisionBridge/reviewTransportApplyCore.mjs';
const W3_APPLY_STORE_PATH = 'src/io/revisionBridge/reviewTransportApplyStore.mjs';
const W3_EXACT_APPLY_PATH = 'src/io/revisionBridge/reviewTransportExactApply.mjs';
const W3_TEST_PATH = 'test/contracts/rtk-w3-exact-apply-replay.contract.test.js';
const SCHEMA_PATH = 'docs/OPS/RTK/G0B_NORMATIVE_SCHEMA_V2.json';
const CORPUS_PATH = 'docs/OPS/RTK/G0B_SUPPORTED_CORPUS_V1.json';
const WORD_SETTINGS_PATH = 'docs/OPS/RTK/G0B_WORD_SETTINGS_CAPSULE_CONTRACT_V1.json';
const RECEIPT_PATH = 'docs/OPS/RTK/G0B_FEASIBILITY_RECEIPT.json';
const GOVERNANCE_APPROVALS_PATH = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const SCOPE_MAP_PATH = 'scripts/ops/sector-m-scope-map.json';
const C4_ALLOWLIST = [
  '.github/workflows/rtk-required.yml',
  'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json',
  'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json',
  'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json',
  'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_RECEIPT.json',
  'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_CHECKPOINT.json',
  'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_RECEIPT.json',
  'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json',
  'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json',
  'docs/OPS/RTK/YALKEN_RELEASE_APPLICABILITY_INVALIDATION_GRAPH_V1_RECEIPT.json',
  'docs/OPS/RTK/YALKEN_RELEASE_CLAIM_PUBLICATION_V1_RECEIPT.json',
  'docs/OPS/RTK/YALKEN_OFFLINE_RELEASE_CLAIM_COMPILER_V0_RECEIPT.json',
  'docs/OPS/RTK/YALKEN_RTK_STREAMING_ORCH_PROCESS_CAPABILITY_REPAIR_V1_RECEIPT.json',
  'docs/OPS/RTK/YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1.json',
  'docs/OPS/RTK/YALKEN_INTEROP_CHAIN_MATRIX_V1.json',
  'docs/OPS/RTK/YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json',
  'docs/OPS/RTK/YALKEN_INTEROP_MULTI_ROUND_LINEAGE_RECEIPT_V1.json',
  'docs/OPS/RTK/YALKEN_R24_W0_WORD_PHYSICAL_RECERTIFICATION_RECEIPT_V1.json',
  'docs/OPS/RTK/WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_RECEIPT.json',
  'docs/OPS/RTK/WORD_FOR_MAC_STAGE_FORMAL_CLOSURE_RECEIPT.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CANONICAL_BINDING_STATUS.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_RECEIPT.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json',
  'package.json',
  'scripts/ops/rtk-google-docs-g00-discovery-binding.mjs',
  'scripts/ops/google-docs-real-account-e2e-v1.mjs',
  'scripts/ops/google-docs-real-account-whole-book-e2e-v1.mjs',
  'scripts/ops/r24/word-physical-recertification-w0.mjs',
  'scripts/ops/rtk-interop-c1-word-fullbook-route-v1.mjs',
  'scripts/ops/rtk-interop-chain-matrix-v1.mjs',
  'scripts/ops/rtk-post-d1-editor-lab-harness.mjs',
  'scripts/ops/rtk-release-applicability-invalidation-graph-v1.mjs',
  'scripts/ops/rtk-release-claim-publication-v1.mjs',
  'scripts/ops/rtk-release-claim-compiler-v0.mjs',
  'scripts/ops/rtk-word-p0-modern-comment-replies-typed-limitation.mjs',
  'scripts/ops/rtk-word-p0-modern-comment-resolve-reopen-typed-limitation.mjs',
  'scripts/ops/rtk-word-p0-multi-round-ledger-reconciliation.mjs',
  'scripts/ops/rtk-word-normalized-capability-matrix.mjs',
  'scripts/ops/rtk-word-p0-scale-envelope-terminal-audit.mjs',
  'scripts/ops/rtk-word-p0-safe-formatting-lane-typed-limitation.mjs',
  'scripts/ops/rtk-word-p0-safe-structural-lane-typed-limitation.mjs',
  'scripts/ops/rtk-word-release-audit-p0-multiscene-atomic-comment-state-closure.mjs',
  'scripts/ops/rtk-word-v4-a03-c03-adjacent-range-negative-oracle.mjs',
  'scripts/ops/rtk-word-v4-a03-c04-modern-comment-state.mjs',
  'scripts/ops/rtk-word-v4-a03-c05-non-overlap-product-path.mjs',
  'scripts/ops/rtk-word-v4-a03-c01-comment-shadow-runtime.mjs',
  'scripts/ops/rtk-word-v4-e12-saturation-ledger.mjs',
  'scripts/ops/rtk-word-v4-e12-stability-limitation-audit.mjs',
  'scripts/run-rtk-tests.mjs',
  'test/contracts/rtk-g0b-feasibility.contract.test.js',
  'test/contracts/rtk-google-docs-g00-discovery-binding.contract.test.js',
  'test/contracts/rtk-google-docs-real-account-e2e.contract.test.js',
  'test/contracts/rtk-google-docs-real-account-whole-book-e2e.contract.test.js',
  'test/contracts/rtk-evidence-stale-green-guard.contract.test.js',
  'test/contracts/rtk-interop-c1-word-fullbook-route.contract.test.js',
  'test/contracts/rtk-interop-chain-matrix.contract.test.js',
  'test/contracts/rtk-post-d1-portability-program.contract.test.js',
  'test/contracts/rtk-release-applicability-invalidation-graph-v1.contract.test.js',
  'test/contracts/rtk-release-claim-publication-v1.contract.test.js',
  'test/contracts/rtk-release-claim-compiler-v0.contract.test.js',
  'test/contracts/rtk-test-graph-catalog.contract.test.js',
  'test/contracts/rtk-w1-no-write-vertical-slice.contract.test.js',
  'test/contracts/rtk-w2-bounded-parser-review-ir.contract.test.js',
  'test/contracts/rtk-zip01-budget-crc-evidence.contract.test.js',
  'test/contracts/rtk-word-c5v2-noop-baseline.contract.test.js',
  'test/contracts/rtk-word-normalized-capability-matrix.contract.test.js',
  'test/contracts/rtk-word-p0-multi-round-ledger-reconciliation.contract.test.js',
  'test/contracts/rtk-word-p0-scale-envelope-terminal-audit.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-500k-terminal-audit.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-controlled-grant-probe.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-format-unicode-structure-stress.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-large-manuscript-stress.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-postmerge-truth-rebind.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-repeat-high-density-stress.contract.test.js',
  'test/contracts/rtk-word-safety-c1-effect-reservation.contract.test.js',
  'test/contracts/rtk-word-v4-a03-c04-modern-comment-state.contract.test.js',
  'test/contracts/rtk-word-v4-canonical-integration.contract.test.js',
  'test/contracts/rtk-word-v4-e02-locator-stack-survival.contract.test.js',
  'test/contracts/rtk-word-v4-e06-physical-text-certification.contract.test.js',
  'test/contracts/rtk-word-v4-e07-comments-replies-states.contract.test.js',
  'test/contracts/rtk-word-v4-e08-effective-formatting.contract.test.js',
  'test/contracts/rtk-word-v4-e09-typed-structural-edits.contract.test.js',
  'test/contracts/rtk-word-v4-e10-multi-round-replay-conflicts.contract.test.js',
  'test/contracts/rtk-word-v4-e11-multi-scene-atomic-coordinator.contract.test.js',
  'test/contracts/rtk-word-v4-e12-customxml-authority-followup.contract.test.js',
  'test/contracts/rtk-word-v4-e12-modern-comment-followup.contract.test.js',
  'test/contracts/rtk-word-v4-e12-modern-comment-native-ui-followup.contract.test.js',
  'test/contracts/rtk-word-v4-e12-multi-scene-apply-followup.contract.test.js',
  'test/contracts/rtk-word-v4-e12-saturation-ledger.contract.test.js',
  'test/unit/r24-w0-word-physical-mutants.test.js',
  'test/unit/r24-w0-word-physical-recertification.test.js',
];
const N4_STRUCTURAL_RETURN_ALLOWLIST = [
  'scripts/ops/rtk-word-c5v2-physical-canary.mjs',
  'scripts/ops/rtk-word-c5v2-terminal-orchestrator.mjs',
  'src/command/commandSurfaceKernel.js',
  'src/io/revisionBridge/index.mjs',
  'src/io/revisionBridge/reviewTransportStructuralReturnRuntime.mjs',
  'src/main.js',
  'src/renderer/documentContentEnvelope.mjs',
  'src/shared/commandBridgeResponse.cjs',
  'test/contracts/rtk-word-c5v2-comment-lifecycle-return-runtime.contract.test.js',
  'test/contracts/rtk-word-c5v2-pr1414-audit-hold-repair.contract.test.js',
  'test/contracts/rtk-word-c5v2-round-checkpoint.contract.test.js',
  'test/contracts/rtk-word-c5v2-terminal-orchestrator.contract.test.js',
  'test/contracts/rtk-word-n3-formatting-return.contract.test.js',
  'test/contracts/rtk-word-n4-structural-return.contract.test.js',
];
const R24_A0_AUTHORITY_SOT_ALLOWLIST = [
  'docs/OPS/R24/A0_AUTHORITY_SOT_RECONCILIATION_RECEIPT_V1.json',
  'docs/OPS/R24/AUDIT_DISPOSITION_R2_4.json',
  'docs/OPS/R24/AUTHORITY_AND_SOURCE_BINDINGS_R2_4.json',
  'docs/OPS/R24/AUTHORITY_EPOCH_R2_4.json',
  'docs/OPS/R24/AUTONOMY_CONTROL_PLANE_R2_4.json',
  'docs/OPS/R24/AUTONOMY_RUNTIME_CONTRACT_R2_4.json',
  'docs/OPS/R24/CI_LIVE_BINDING_COMPILER_R2_4.json',
  'docs/OPS/R24/CLAIM_REGISTRY_R2_4.json',
  'docs/OPS/R24/CURRENT_CHECKPOINT_R2_4.json',
  'docs/OPS/R24/DOCUMENT_INVENTORY_R2_4.json',
  'docs/OPS/R24/EVIDENCE/',
  'docs/OPS/R24/EVIDENCE/ES-R24-A0-SOT-AUTHORITY-CLAIM-BINDINGS.json',
  'docs/OPS/R24/EVIDENCE_AND_RECEIPT_CONTRACT_R2_4.json',
  'docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json',
  'docs/OPS/R24/EXECUTION_ENVELOPES_R2_4.json',
  'docs/OPS/R24/MISSION_APPROVAL_RECEIPT_R2_4.json',
  'docs/OPS/R24/MISSION_CONTRACT_R2_4.json',
  'docs/OPS/R24/OWNER_GATE_AMENDMENTS_R2_4.json',
  'docs/OPS/R24/OWNER_GATE_DECISIONS/BRAND_LICENSE_OWNER_CHOICE_WP308_BRAND_BASELINE_V1.json',
  'docs/OPS/R24/OWNER_GATE_DECISIONS/WORD_PHYSICAL_SESSION_AUTHORITY_W0_WORD_PHYSICAL_RECERTIFICATION_V1.json',
  'docs/OPS/R24/OWNER_GATE_DECISIONS/ENTITLEMENT_SEMANTICS_ADR_OR_DENY_WP206_SAFE_ENTITLEMENT_BASELINE_V1.json',
  'docs/OPS/R24/OWNER_GATE_DECISIONS/LOCAL_RELEASE_PERMIT_WP307_WRITER_LOCAL_PROFILE_V1.json',
  'docs/OPS/R24/OWNER_GATE_DECISIONS/STORAGE_AUTHORITY_ADR_R2_STORAGE_BAKEOFF_V1.json',
  'docs/OPS/R24/OWNER_GATE_REGISTRY_R2_4.json',
  'docs/OPS/R24/PACKAGE_MANIFEST_R2_4.json',
  'docs/OPS/R24/PACKAGE_MUTATION_RECEIPT_R2_4.json',
  'docs/OPS/R24/PACKAGE_VERIFICATION_RECEIPT_R2_4.json',
  'docs/OPS/R24/PLAN_STATE_R24.json',
  'docs/OPS/R24/PLAN_STATE_SOURCE_RECEIPT_R24.json',
  'docs/OPS/R24/PRODUCT_PROFILE_CUTS_R2_4.json',
  'docs/OPS/R24/PROGRAM_SOT_BINDING_R2_4.json',
  'docs/OPS/R24/SELECTION_RECEIPT_R2_4.json',
  'docs/OPS/R24/TEST_ASSURANCE_MATRIX_R2_4.json',
  'scripts/ops/r24/docs-claim-lint.mjs',
  'scripts/ops/r24/executable-program.mjs',
  'scripts/ops/r24/owner-gate-decisions.mjs',
  'scripts/ops/r24/scheduler.mjs',
  'scripts/ops/r24/test-mutants.mjs',
  'scripts/ops/r24/tests/docs-claim-lint.test.mjs',
  'scripts/ops/r24/tests/executable-program.test.mjs',
  'scripts/ops/r24/tests/owner-gate-decisions.test.mjs',
  'scripts/ops/r24/tests/scheduler.test.mjs',
  'test/contracts/rtk-evidence-stale-green-guard.contract.test.js',
];
const ALLOWLIST = [
  CONTRACTS_PATH,
  CORE_PATH,
  IR_PATH,
  ORACLE_PATH,
  ROUND_STORE_PATH,
  'src/export/docx/fullManuscriptDocxReviewPacketSource.js',
  'src/io/revisionBridge/reviewTransportPackageParserV2.mjs',
  'src/product/projectLease.mjs',
  TEST_PATH,
  'test/contracts/rtk-word-c5v2-full-manuscript-product-export.contract.test.js',
  'test/contracts/rtk-word-saturation-c02-authority-carrier.contract.test.js',
  'test/contracts/yalken-atlas-v5-final-audit-p0-01-future-schema-loss.contract.test.js',
  'test/contracts/yalken-atlas-v6-a4-bounded-repair.contract.test.js',
  'test/contracts/revision-bridge-docx-review-preview-session-command-surface.contract.test.js',
  'test/contracts/revision-bridge-docx-review-preview-session.contract.test.js',
  W1_TEST_PATH,
  W2_TEST_PATH,
  W3_APPLY_CORE_PATH,
  W3_APPLY_STORE_PATH,
  W3_EXACT_APPLY_PATH,
  W3_TEST_PATH,
  SCHEMA_PATH,
  CORPUS_PATH,
  WORD_SETTINGS_PATH,
  RECEIPT_PATH,
  GOVERNANCE_APPROVALS_PATH,
  SCOPE_MAP_PATH,
  ...C4_ALLOWLIST,
  ...N4_STRUCTURAL_RETURN_ALLOWLIST,
  ...R24_A0_AUTHORITY_SOT_ALLOWLIST,
];

async function loadContracts() {
  return import(pathToFileURL(path.join(process.cwd(), CONTRACTS_PATH)).href);
}

async function loadOracle() {
  return import(pathToFileURL(path.join(process.cwd(), ORACLE_PATH)).href);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), filePath), 'utf8'));
}

function baseTransport(overrides = {}) {
  return {
    roundId: 'round-1',
    returnMode: 'TRACKED',
    secretKey: 'test-secret',
    blocks: [
      {
        blockId: 'block-1',
        text: 'Alpha beta gamma.',
      },
    ],
    changes: [],
    comments: [
      {
        commentId: 'comment-1',
        body: 'Conserve this comment.',
        replies: [{ body: 'Conserve this reply.' }],
      },
    ],
    ...overrides,
  };
}

function changedFilesFromGitStatus(statusText) {
  return statusText
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^"|"$/gu, ''));
}

function isR24TerminalEvidenceArtifact(filePath) {
  return /^docs\/OPS\/R24\/EVIDENCE\/ES-R24-[A-Z0-9][A-Z0-9_-]*\.json$/u.test(filePath)
    || /^docs\/OPS\/R24\/CTR-R24-[A-Z0-9][A-Z0-9_-]*\.json$/u.test(filePath);
}

test('G0B exports normative schema constants and reason catalog', async () => {
  const contracts = await loadContracts();
  const schema = readJson(SCHEMA_PATH);

  assert.equal(
    contracts.REVISION_BRIDGE_G0B_TRANSPORT_CONTRACT_SCHEMA,
    'revision-bridge.g0b-transport-contract.v1',
  );
  assert.deepEqual(contracts.REVISION_BRIDGE_G0B_RETURN_MODES, ['TRACKED', 'CLEAN', 'MIXED']);
  assert.equal(Object.isFrozen(contracts.REVISION_BRIDGE_G0B_REASON_CODES), true);
  for (const reasonCode of schema.reasonCodes) {
    assert.equal(contracts.REVISION_BRIDGE_G0B_REASON_CODES.includes(reasonCode), true, reasonCode);
  }
});

test('G0B no-edit and duplicate text evidence produce zero exact operations', async () => {
  const contracts = await loadContracts();
  const result = contracts.analyzeG0BTransportContract(baseTransport({
    changes: [
      {
        changeId: 'no-edit-1',
        blockId: 'block-1',
        kind: 'noEdit',
      },
      {
        changeId: 'duplicate-1',
        blockId: 'block-2',
        kind: 'textExact',
        oldText: 'aa',
        newText: 'bb',
      },
    ],
    blocks: [
      { blockId: 'block-1', text: 'No change here.' },
      { blockId: 'block-2', text: 'aa aa' },
    ],
  }));

  assert.equal(result.localContractStatus, 'PASS');
  assert.equal(result.externalWordStatus, 'DEFERRED_EXTERNAL_WORD_EVIDENCE');
  assert.deepEqual(result.exactOperations, []);
  assert.equal(result.reasons.some((reason) => reason.code === 'G0B_NO_TEXT_CANDIDATE'), true);
  assert.equal(result.reasons.some((reason) => reason.code === 'G0B_DUPLICATE_TEXT_CANDIDATE'), true);
});

test('G0B paragraph marks, split, merge and move revisions are structural blocked', async () => {
  const contracts = await loadContracts();
  const result = contracts.analyzeG0BTransportContract(baseTransport({
    changes: [
      { changeId: 'paragraph-1', blockId: 'block-1', kind: 'paragraphMark' },
      { changeId: 'move-1', blockId: 'block-1', kind: 'move' },
      { changeId: 'split-1', blockId: 'block-1', kind: 'split' },
      { changeId: 'merge-1', blockId: 'block-1', kind: 'merge' },
    ],
  }));
  const reasonCodes = result.reasons.map((reason) => reason.code);

  assert.deepEqual(result.exactOperations, []);
  assert.equal(reasonCodes.includes('G0B_STRUCTURAL_PARAGRAPH_MARK'), true);
  assert.equal(reasonCodes.includes('G0B_STRUCTURAL_MOVE_REVISION'), true);
  assert.equal(reasonCodes.filter((code) => code === 'G0B_STRUCTURAL_SPLIT_MERGE').length, 2);
});

test('G0B TRACKED CLEAN and MIXED conserve comments without manuscript authority', async () => {
  const contracts = await loadContracts();

  for (const returnMode of contracts.REVISION_BRIDGE_G0B_RETURN_MODES) {
    const result = contracts.analyzeG0BTransportContract(baseTransport({
      returnMode,
      changes: [
        {
          changeId: 'exact-1',
          blockId: 'block-1',
          kind: 'textExact',
          oldText: 'beta',
          newText: 'BETA',
        },
      ],
    }));

    assert.equal(result.returnMode, returnMode);
    assert.equal(result.exactOperations.length, 1);
    assert.equal(result.exactOperations[0].returnMode, returnMode);
    assert.equal(result.commentsLane[0].body, 'Conserve this comment.');
    assert.equal(result.commentsLane[0].replies[0].body, 'Conserve this reply.');
    assert.equal(result.reasons.some((reason) => reason.code === 'G0B_COMMENT_LANE_CONSERVED'), true);
  }
});

test('G0B cross-round locators never bind and HMAC anchors detect tamper', async () => {
  const contracts = await loadContracts();
  const input = baseTransport({
    changes: [
      {
        changeId: 'cross-round-1',
        blockId: 'block-1',
        kind: 'textExact',
        oldText: 'beta',
        newText: 'BETA',
        locator: { roundId: 'round-0' },
      },
    ],
  });
  const result = contracts.analyzeG0BTransportContract(input);
  const validAnchor = contracts.verifyG0BAnchor(result.anchors[0], input.blocks[0], input.secretKey);
  const tamperedAnchor = contracts.verifyG0BAnchor(
    { ...result.anchors[0], textDigest: 'sha256:tampered' },
    input.blocks[0],
    input.secretKey,
  );

  assert.deepEqual(result.exactOperations, []);
  assert.equal(result.reasons.some((reason) => reason.code === 'G0B_CROSS_ROUND_LOCATOR_BLOCKED'), true);
  assert.equal(validAnchor.ok, true);
  assert.equal(validAnchor.code, 'G0B_ANCHOR_HMAC_VALID');
  assert.equal(tamperedAnchor.ok, false);
  assert.equal(tamperedAnchor.code, 'G0B_ANCHOR_HMAC_TAMPERED');
});

test('G0B supported corpus digest is deterministic and mutation-sensitive', async () => {
  const contracts = await loadContracts();
  const corpus = readJson(CORPUS_PATH);
  const digest = contracts.createSupportedCorpusDigest(corpus);
  const repeatDigest = contracts.createSupportedCorpusDigest(readJson(CORPUS_PATH));
  const frozen = contracts.freezeSupportedCorpus(corpus, digest);
  const mutated = JSON.parse(JSON.stringify(corpus));
  mutated.fixtures[0].text = 'Mutated.';
  const rejected = contracts.freezeSupportedCorpus(mutated, digest);

  assert.equal(digest, repeatDigest);
  assert.equal(frozen.ok, true);
  assert.equal(frozen.code, 'G0B_CORPUS_DIGEST_FROZEN');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'G0B_CORPUS_DIGEST_MISMATCH');
});

test('G0B parser bake-off selects dependency-free tokenizer before new dependency', async () => {
  const contracts = await loadContracts();
  const accepted = contracts.compareParserCandidates([
    {
      id: 'bounded-scanner-no-regex-v2',
      correctness: 'pass',
      boundedAuditability: true,
      generalXmlPlatform: false,
      regexXmlParser: false,
      namespaceAware: true,
      chunkBoundaryInvariant: true,
      requiresDependency: false,
    },
    {
      id: 'maintained-sax',
      correctness: 'pass',
      boundedAuditability: true,
      requiresDependency: true,
    },
  ]);
  const blocked = contracts.compareParserCandidates([
    {
      id: 'bounded-scanner-no-regex-v2',
      correctness: 'fail',
      boundedAuditability: true,
      generalXmlPlatform: false,
      regexXmlParser: false,
      namespaceAware: true,
      chunkBoundaryInvariant: true,
      requiresDependency: false,
    },
    {
      id: 'maintained-sax',
      correctness: 'pass',
      boundedAuditability: true,
      requiresDependency: true,
    },
  ]);

  assert.equal(accepted.ok, true);
  assert.equal(accepted.selected, 'bounded-scanner-no-regex-v2');
  assert.equal(accepted.ownerDecisionRequired, false);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'G0B_PARSER_DEPENDENCY_OWNER_DECISION_REQUIRED');
  assert.equal(blocked.ownerDecisionRequired, true);
});

test('G0B oracle and receipt separate local PASS from deferred external Word evidence', async () => {
  const oracle = await loadOracle();
  const contracts = await loadContracts();
  const corpus = readJson(CORPUS_PATH);
  const digest = contracts.createSupportedCorpusDigest(corpus);
  const result = oracle.runG0BLocalOracle({
    transport: baseTransport(),
    supportedCorpus: corpus,
    expectedCorpusDigest: digest,
    parserCandidates: [
      {
        id: 'bounded-scanner-no-regex-v2',
        correctness: 'pass',
        boundedAuditability: true,
        generalXmlPlatform: false,
        regexXmlParser: false,
        namespaceAware: true,
        chunkBoundaryInvariant: true,
        requiresDependency: false,
      },
    ],
  });
  const receipt = readJson(RECEIPT_PATH);
  const wordSettings = readJson(WORD_SETTINGS_PATH);

  assert.equal(result.status, 'PASS');
  assert.equal(result.externalWordStatus, 'DEFERRED_EXTERNAL_WORD_EVIDENCE');
  assert.equal(receipt.local_contract_status, 'PASS');
  assert.equal(receipt.external_word_status, 'DEFERRED_EXTERNAL_WORD_EVIDENCE');
  assert.equal(wordSettings.externalWordEvidencePolicy.falsePassForbidden, true);
  assert.equal(wordSettings.externalWordEvidencePolicy.blocksFinalDone, true);
});

test('G0B stage keeps changes inside the frozen ActionEnvelope', () => {
  const status = execFileSync('git', ['status', '--short'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const changedFiles = changedFilesFromGitStatus(status);
  const outside = changedFiles.filter((filePath) => !ALLOWLIST.includes(filePath) && !isR24TerminalEvidenceArtifact(filePath));

  assert.deepEqual(outside, []);
  assert.equal(isR24TerminalEvidenceArtifact('docs/OPS/R24/EVIDENCE/not-a-stamp.json'), false);
  assert.equal(isR24TerminalEvidenceArtifact('docs/OPS/R24/CTR-R24-SEC0-PATH-CAPABILITY.txt'), false);
});
