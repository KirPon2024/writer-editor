const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

async function loadVerifier() {
  return import('../../scripts/ops/final-lab-to-product-traceability-v2-verify.mjs');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function validLedgerFixture() {
  const { readLedger, verifyFinalLabTraceabilityLedger } = await loadVerifier();
  const report = verifyFinalLabTraceabilityLedger();
  assert.equal(report.ok, true, report.errors.join('\n'));
  return readLedger();
}

test('FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2 ledger is valid on exact head and blocks final integrated claim', async () => {
  const { FINAL_PROGRAM_VERDICT, LEDGER_EXACT_HEAD_SHA, LEDGER_STATUS, verifyFinalLabTraceabilityLedger, readLedger } = await loadVerifier();
  const report = verifyFinalLabTraceabilityLedger();
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.exactHead, LEDGER_EXACT_HEAD_SHA);
  execFileSync('git', ['merge-base', '--is-ancestor', LEDGER_EXACT_HEAD_SHA, 'HEAD'], { stdio: 'ignore' });
  const ledger = readLedger();
  assert.equal(ledger.status, LEDGER_STATUS);
  assert.equal(ledger.claimControls.finalProgramVerdict, FINAL_PROGRAM_VERDICT);
  assert.equal(ledger.claimControls.allLabWorkIntegratedClaimAllowed, false);
});

test('FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2 ledger maps every required external receipt pin and material finding', async () => {
  const {
    PROGRAM_PHASE_SEQUENCE,
    REQUIRED_EXTERNAL_PINS,
    REQUIRED_MATERIAL_IDS,
    readLedger,
  } = await loadVerifier();
  const ledger = readLedger();

  assert.deepEqual(ledger.programPhaseSequence, PROGRAM_PHASE_SEQUENCE);
  const pinIds = new Set(ledger.externalReceiptPins.map((pin) => pin.id));
  for (const [id, digest] of Object.entries(REQUIRED_EXTERNAL_PINS)) {
    assert.equal(pinIds.has(id), true, `missing ${id}`);
    assert.equal(ledger.externalReceiptPins.find((pin) => pin.id === id).digest, digest);
  }
  const materialIds = new Set(ledger.materialDispositions.map((entry) => entry.materialId));
  for (const materialId of REQUIRED_MATERIAL_IDS) {
    assert.equal(materialIds.has(materialId), true, `missing ${materialId}`);
  }
});

test('FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2 maps Google Docs local compatibility separately from real-account E2E', async () => {
  const { readLedger } = await loadVerifier();
  const ledger = readLedger();
  const localRow = ledger.materialDispositions.find((row) => row.materialId === 'F2_GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1');
  const realRow = ledger.materialDispositions.find((row) => row.materialId === 'F2_GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY');

  assert.equal(localRow?.programPhase, 'F2');
  assert.equal(localRow?.disposition, 'ENFORCED_TEST_GATE');
  assert.equal(localRow?.localCompatibilityVerdict, 'LOCAL_COMPATIBILITY_NEEDS_REAL_GOOGLE_E2E');
  assert.equal(localRow?.realGoogleE2E, 'WAIT_AUTHORITY_REQUIRED_FOR_REAL_PROVIDER_EVIDENCE');
  assert.equal(localRow?.productSupportClaim, 'DENY');
  assert.equal(localRow?.productMutationAuthority, 'DENY');
  assert.equal(localRow?.productBindings?.[0]?.prNumber, 1561);
  assert.equal(
    localRow?.productBindings?.[0]?.receipt?.path,
    'docs/OPS/RTK/GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1_RECEIPT.json',
  );

  assert.equal(realRow?.programPhase, 'F2');
  assert.equal(realRow?.disposition, 'DEFERRED_WITH_BLOCKER');
  assert.equal(realRow?.deferred?.owner, 'MASTER_PROGRAM_OWNER_GOOGLE_ACCOUNT_NETWORK_AUTHORITY');
  assert.equal(Array.isArray(realRow?.productBindings), false);
  assert.match(realRow?.deferred?.acceptanceGate || '', /signed-in Google Docs provider E2E/i);
});

test('FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2 hostile mutations are rejected fail-closed', async () => {
  const { validateFinalLabTraceabilityLedger } = await loadVerifier();
  const base = await validLedgerFixture();

  const cases = [
    {
      name: 'unmapped-disposition',
      mutate(ledger) {
        ledger.materialDispositions[0].disposition = 'UNMAPPED';
      },
      error: 'UNSUPPORTED_DISPOSITION',
    },
    {
      name: 'missing-required-pin',
      mutate(ledger) {
        ledger.externalReceiptPins = ledger.externalReceiptPins.filter((pin) => pin.id !== 'BLACK_BOX_FINAL_LAB_EXTERNAL_RECEIPT');
      },
      error: 'MISSING_REQUIRED:BLACK_BOX_FINAL_LAB_EXTERNAL_RECEIPT',
    },
    {
      name: 'receipt-hash-mismatch',
      mutate(ledger) {
        const entry = ledger.materialDispositions.find((row) => row.productBindings?.length);
        entry.productBindings[0].receipt.sha256 = '0'.repeat(64);
      },
      error: 'RECEIPT_SHA256_MISMATCH',
    },
    {
      name: 'lab-evidence-promoted-to-product',
      mutate(ledger) {
        const entry = ledger.materialDispositions.find((row) => row.disposition === 'LAB_EVIDENCE_ONLY');
        entry.productBindings = [clone(ledger.materialDispositions.find((row) => row.productBindings?.length).productBindings[0])];
      },
      error: 'LAB_EVIDENCE_HAS_PRODUCT_BINDING',
    },
    {
      name: 'phase-order-drift',
      mutate(ledger) {
        ledger.materialDispositions.unshift(ledger.materialDispositions.pop());
      },
      error: 'SEQUENCE_DRIFT',
    },
    {
      name: 'adopted-without-product-binding',
      mutate(ledger) {
        const entry = ledger.materialDispositions.find((row) => row.disposition === 'ENFORCED_TEST_GATE');
        entry.productBindings = [];
      },
      error: 'productBindings',
    },
    {
      name: 'duplicate-material-id',
      mutate(ledger) {
        ledger.materialDispositions.push(clone(ledger.materialDispositions[0]));
      },
      error: 'DUPLICATE_MATERIAL_ID',
    },
    {
      name: 'final-claim-with-deferred-work',
      mutate(ledger) {
        ledger.claimControls.allLabWorkIntegratedClaimAllowed = true;
      },
      error: 'ALL_LAB_WORK_INTEGRATED_MUST_BE_FALSE',
    },
    {
      name: 'final-ready-with-deferred-work',
      mutate(ledger) {
        ledger.claimControls.finalProgramVerdict = 'READY';
      },
      error: 'FINAL_READY_CLAIM_WITH_DEFERRED_OR_LAB_ONLY',
    },
    {
      name: 'stale-f3-ui-local-candidate-blocker',
      mutate(ledger) {
        const entry = ledger.materialDispositions.find((row) => row.materialId === 'F3_BLACK_BOX_PRODUCT_V1');
        entry.summary += ' Product UI/default feature flag path is local-candidate only until commit/PR/CI/merge/postmerge verification.';
      },
      error: 'STALE_UI_DEFAULT_PATH_BLOCKER',
    },
    {
      name: 'stale-f3-architecture-manifest-pr-candidate-state',
      mutate(ledger) {
        ledger.claimControls.reason += ' F3 has an in-flight architecture manifest hardening candidate.';
        const entry = ledger.materialDispositions.find((row) => row.materialId === 'F3_BLACK_BOX_ARCHITECTURE_MANIFEST_HARDENING_V1');
        entry.summary += ' PR candidate remains PENDING_CI.';
      },
      error: 'STALE_POSTMERGE_DELIVERY_STATE',
    },
    {
      name: 'stale-runtime-source-revision-local-candidate-pr-status',
      mutate(ledger) {
        const entry = ledger.materialDispositions.find((row) => row.materialId === 'F3_BLACK_BOX_RUNTIME_SOURCE_REVISION_BINDING_V1');
        entry.localCandidateVerification.prStatus = 'OPEN_PENDING_REQUIRED_CI_MERGE_POSTMERGE';
      },
      error: 'STALE_LOCAL_CANDIDATE_DELIVERY_STATE',
    },
    {
      name: 'stale-bound-receipt-local-candidate-status',
      mutate(ledger) {
        const entry = ledger.materialDispositions.find((row) => row.materialId === 'F3_BLACK_BOX_ARCHITECTURE_MANIFEST_HARDENING_V1');
        entry.productBindings[0].deliveryStatus = 'PENDING_CI';
      },
      error: 'STALE_LOCAL_CANDIDATE_DELIVERY_STATE',
    },
    {
      name: 'historical-word-evidence-transfer',
      mutate(ledger) {
        ledger.nonTransferableHistoricalProfiles = [];
      },
      error: 'WORD_16_111_3_DENY_MISSING',
    },
    {
      name: 'missing-google-local-final-row',
      mutate(ledger) {
        ledger.materialDispositions = ledger.materialDispositions.filter((row) => row.materialId !== 'F2_GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1');
      },
      error: 'MISSING_REQUIRED:F2_GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1',
    },
    {
      name: 'google-local-overclaimed-as-ready',
      mutate(ledger) {
        const entry = ledger.materialDispositions.find((row) => row.materialId === 'F2_GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1');
        entry.localCompatibilityVerdict = 'READY';
      },
      error: 'GOOGLE_LOCAL_COMPATIBILITY_VERDICT_ESCALATION',
    },
    {
      name: 'google-real-e2e-promoted-without-authority',
      mutate(ledger) {
        const entry = ledger.materialDispositions.find((row) => row.materialId === 'F2_GOOGLE_DOCS_REAL_ACCOUNT_E2E_AUTHORITY_BOUNDARY');
        entry.disposition = 'ENFORCED_TEST_GATE';
        entry.productBindings = [clone(ledger.materialDispositions.find((row) => row.productBindings?.length).productBindings[0])];
      },
      error: 'GOOGLE_REAL_E2E_MUST_REMAIN_DEFERRED',
    },
    {
      name: 'final-release-ready-over-google-and-f3-blockers',
      mutate(ledger) {
        ledger.status = 'READY';
      },
      error: 'status:INVALID',
    },
  ];

  for (const item of cases) {
    const ledger = clone(base);
    item.mutate(ledger);
    const report = validateFinalLabTraceabilityLedger(ledger);
    assert.equal(report.ok, false, item.name);
    assert.equal(report.errors.some((error) => error.includes(item.error)), true, `${item.name}: ${report.errors.join('\n')}`);
  }
});
