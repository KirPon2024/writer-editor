const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const CONTRACTS_PATH = 'src/io/revisionBridge/reviewTransportContracts.mjs';
const CORE_PATH = 'src/io/revisionBridge/reviewTransportCore.mjs';
const IR_PATH = 'src/io/revisionBridge/reviewTransportIr.mjs';
const ORACLE_PATH = 'src/io/revisionBridge/reviewTransportOracle.mjs';
const ROUND_STORE_PATH = 'src/io/revisionBridge/reviewTransportRoundStore.mjs';
const TEST_PATH = 'test/contracts/rtk-w1-no-write-vertical-slice.contract.test.js';
const G0B_TEST_PATH = 'test/contracts/rtk-g0b-feasibility.contract.test.js';
const W2_TEST_PATH = 'test/contracts/rtk-w2-bounded-parser-review-ir.contract.test.js';
const W3_APPLY_CORE_PATH = 'src/io/revisionBridge/reviewTransportApplyCore.mjs';
const W3_APPLY_STORE_PATH = 'src/io/revisionBridge/reviewTransportApplyStore.mjs';
const W3_EXACT_APPLY_PATH = 'src/io/revisionBridge/reviewTransportExactApply.mjs';
const W3_TEST_PATH = 'test/contracts/rtk-w3-exact-apply-replay.contract.test.js';
const DOCX_PREFLIGHT_RUNTIME_REPAIR_PATH = 'src/io/revisionBridge/index.mjs';
const C4_ALLOWLIST = [
  '.github/workflows/rtk-required.yml',
  'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_RECEIPT.json',
  'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_CHECKPOINT.json',
  'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_RECEIPT.json',
  'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json',
  'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json',
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
  'scripts/ops/r24/test-mutants.mjs',
  'scripts/ops/r24/tests/docs-claim-lint.test.mjs',
  'scripts/ops/r24/tests/executable-program.test.mjs',
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
  G0B_TEST_PATH,
  'test/contracts/revision-bridge-docx-review-preview-session-command-surface.contract.test.js',
  'test/contracts/revision-bridge-docx-review-preview-session.contract.test.js',
  TEST_PATH,
  'test/contracts/rtk-word-c5v2-full-manuscript-product-export.contract.test.js',
  'test/contracts/rtk-word-saturation-c02-authority-carrier.contract.test.js',
  'test/contracts/yalken-atlas-v5-final-audit-p0-01-future-schema-loss.contract.test.js',
  'test/contracts/yalken-atlas-v6-a4-bounded-repair.contract.test.js',
  W2_TEST_PATH,
  W3_APPLY_CORE_PATH,
  W3_APPLY_STORE_PATH,
  W3_EXACT_APPLY_PATH,
  W3_TEST_PATH,
  DOCX_PREFLIGHT_RUNTIME_REPAIR_PATH,
  'scripts/ops/sector-m-scope-map.json',
  'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json',
  ...C4_ALLOWLIST,
  ...N4_STRUCTURAL_RETURN_ALLOWLIST,
  ...R24_A0_AUTHORITY_SOT_ALLOWLIST,
];

function isR24TerminalEvidenceArtifact(filePath) {
  return /^docs\/OPS\/R24\/EVIDENCE\/ES-R24-[A-Z0-9][A-Z0-9_-]*\.json$/u.test(filePath)
    || /^docs\/OPS\/R24\/CTR-R24-[A-Z0-9][A-Z0-9_-]*\.json$/u.test(filePath);
}

async function loadContracts() {
  return import(pathToFileURL(path.join(process.cwd(), CONTRACTS_PATH)).href);
}

async function loadOracle() {
  return import(pathToFileURL(path.join(process.cwd(), ORACLE_PATH)).href);
}

async function loadRoundStore() {
  return import(pathToFileURL(path.join(process.cwd(), ROUND_STORE_PATH)).href);
}

function baseTransport(overrides = {}) {
  return {
    roundId: 'round-w1',
    returnMode: 'TRACKED',
    secretKey: 'private-secret',
    blocks: [{ blockId: 'block-1', text: 'Alpha beta gamma.' }],
    changes: [],
    comments: [{ commentId: 'comment-1', body: 'Comment survives.' }],
    ...overrides,
  };
}

function makeTempStore() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-w1-round-store-'));
}

test('W1 exports versioned no-write contracts and a read-only feature flag', async () => {
  const contracts = await loadContracts();
  const disabled = contracts.resolveW1NoWriteFeatureFlag({});
  const enabled = contracts.resolveW1NoWriteFeatureFlag({
    [contracts.REVISION_BRIDGE_W1_FEATURE_FLAG]: true,
  });

  assert.equal(contracts.REVISION_BRIDGE_W1_NO_WRITE_ANALYSIS_SCHEMA, 'yalken.rtk.returned-review-analysis.v2');
  assert.equal(contracts.REVISION_BRIDGE_W1_TERMINAL_LIFECYCLE_STATES.includes('CLOSED'), false);
  assert.equal(disabled.enabled, false);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.mutationSurfaceEnabled, false);
  assert.equal(enabled.canWriteManuscript, false);
  assert.equal(enabled.canApply, false);
});

test('W1 export intent requires main authority but never carries writer authority', async () => {
  const contracts = await loadContracts();
  const blocked = contracts.buildW1ExportIntent({ roundId: 'round-w1' });
  const ready = contracts.buildW1ExportIntent({
    roundId: 'round-w1',
    title: 'Chapter One',
    authorityToken: {
      kind: 'main-process-export-authority',
      requestId: 'request-1',
      canWriteManuscript: false,
    },
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'RTK_BLOCKED_RECONCILING');
  assert.equal(ready.ok, true);
  assert.equal(ready.lifecycleState, 'OPEN_FOR_RETURN');
  assert.equal(ready.canWriteManuscript, false);
  assert.equal(ready.canApply, false);
  assert.equal(ready.filenameHint.participatesInAuthority, false);
});

test('W1 external transport artifact excludes private manifest material', async () => {
  const contracts = await loadContracts();
  const bundle = contracts.buildW1NeutralTransportArtifact({
    roundId: 'round-w1',
    lifecycleState: 'OPEN_FOR_RETURN',
    title: 'Review',
    privateKeyRef: 'local-private-key-ref',
    sourceProjectDigest: 'sha256:project',
    transport: baseTransport({ privateKey: 'must-not-leak', hmacKey: 'must-not-leak' }),
  });
  const publicText = JSON.stringify(bundle.publicManifest);

  assert.equal(bundle.ok, true);
  assert.equal(bundle.code, 'RTK_PRIVATE_MANIFEST_BOUNDARY_OK');
  assert.equal(publicText.includes('must-not-leak'), false);
  assert.equal(publicText.includes('local-private-key-ref'), false);
  assert.equal(bundle.privateManifest.privateKeyRef, 'local-private-key-ref');
  assert.equal(bundle.publicManifest.canWriteManuscript, false);
  assert.equal(bundle.publicManifest.canApply, false);
});

test('W1 returned artifact no-edit analysis produces zero changes and no write authority', async () => {
  const contracts = await loadContracts();
  const result = contracts.analyzeW1ReturnedArtifact({
    roundId: 'round-w1',
    lifecycleState: 'OPEN_FOR_RETURN',
    transport: baseTransport({
      changes: [{ changeId: 'no-edit-1', blockId: 'block-1', kind: 'noEdit' }],
    }),
  });
  const closed = contracts.analyzeW1ReturnedArtifact({
    lifecycleState: 'TERMINAL',
    transport: baseTransport(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'analyzed-no-write');
  assert.equal(result.canWriteManuscript, false);
  assert.equal(result.canApply, false);
  assert.deepEqual(result.exactOperations, []);
  assert.equal(result.reasons.some((reason) => reason.code === 'G0B_NO_TEXT_CANDIDATE'), true);
  assert.equal(closed.ok, false);
  assert.equal(closed.code, 'RTK_ROUND_NOT_OPEN_FOR_RETURN');
});

test('W1 round store commits old-or-complete-new and blocks overwrite', async () => {
  const store = await loadRoundStore();
  const storeRoot = makeTempStore();
  const first = await store.commitW1RoundManifest(storeRoot, {
    roundId: 'round-w1',
    lifecycleState: 'OPEN_FOR_RETURN',
    sourceProjectDigest: 'sha256:source',
    publicArtifactDigest: 'sha256:artifact',
  });
  const second = await store.commitW1RoundManifest(storeRoot, {
    roundId: 'round-w1',
    lifecycleState: 'OPEN_FOR_RETURN',
  });
  const read = await store.readW1RoundManifest(storeRoot, 'round-w1');

  assert.equal(first.ok, true);
  assert.equal(fs.existsSync(first.manifestPath), true);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'RTK_ALREADY_IMPORTED');
  assert.equal(read.manifest.lifecycleState, 'OPEN_FOR_RETURN');
  assert.equal(read.manifest.canWriteManuscript, false);
  assert.equal(read.manifest.canApply, false);
});

test('W1 external copy failure preserves round and recovery index is rebuildable', async () => {
  const store = await loadRoundStore();
  const contracts = await loadContracts();
  const storeRoot = makeTempStore();
  const committed = await store.commitW1RoundManifest(storeRoot, {
    roundId: 'round-w1-copy',
    lifecycleState: 'RETURN_ANALYZED',
  });
  const failure = store.recordW1ExternalCopyFailure(committed.manifest, { code: 'E_COPY_FAILED' });
  const index = store.buildW1ReconciliationIndex([committed.manifest]);

  assert.equal(failure.code, 'RTK_WRITE_PRECONDITION_FAILED');
  assert.equal(failure.preservedManifestDigest, committed.manifest.manifestDigest);
  assert.equal(index.rebuildable, true);
  assert.equal(index.rounds[0].archiveEligible, true);
  assert.equal(contracts.evaluateW1ColdArchiveEligibility({ lifecycleState: 'OPEN_FOR_RETURN' }).ok, false);
  assert.equal(contracts.evaluateW1ColdArchiveEligibility({ lifecycleState: 'RECOVERY_REQUIRED' }).ok, false);
  assert.equal(contracts.evaluateW1ColdArchiveEligibility({ lifecycleState: 'TERMINAL' }).ok, true);
});

test('W1 oracle separates local PASS from unsupported durability claims', async () => {
  const oracle = await loadOracle();
  const contracts = await loadContracts();
  const result = oracle.runW1NoWriteOracle({
    flags: { [contracts.REVISION_BRIDGE_W1_FEATURE_FLAG]: true },
    exportIntent: {
      roundId: 'round-w1',
      authorityToken: {
        kind: 'main-process-export-authority',
        requestId: 'request-1',
        canWriteManuscript: false,
      },
    },
    artifact: {
      roundId: 'round-w1',
      lifecycleState: 'OPEN_FOR_RETURN',
      transport: baseTransport(),
    },
    directorySyncCapabilities: { directoryFsync: false },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.canWriteManuscript, false);
  assert.equal(result.canApply, false);
  assert.equal(result.directorySync.supported, false);
  assert.equal(result.directorySync.durabilityClaim, 'DIAGNOSTIC_ONLY_UNSUPPORTED');
});

test('W1 stage scope stays inside the frozen allowlist', () => {
  const status = require('node:child_process').execFileSync('git', ['status', '--short'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const changed = status.split('\n').filter(Boolean).map((line) => line.slice(3));
  for (const file of changed) {
    assert.equal(ALLOWLIST.includes(file) || isR24TerminalEvidenceArtifact(file), true, file);
  }
  assert.equal(isR24TerminalEvidenceArtifact('docs/OPS/R24/EVIDENCE/not-a-stamp.json'), false);
  assert.equal(isR24TerminalEvidenceArtifact('docs/OPS/R24/CTR-R24-SEC0-PATH-CAPABILITY.txt'), false);
});
