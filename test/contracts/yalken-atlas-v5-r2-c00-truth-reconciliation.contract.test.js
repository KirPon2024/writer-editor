const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadR2C00() {
  const modulePath = path.join(process.cwd(), 'scripts', 'ops', 'yalken-atlas-v5-r2-c00-truth-reconciliation.mjs');
  return import(pathToFileURL(modulePath).href);
}

test('R2 C00 reproduces all six post-final false-green findings before repair delivery', async () => {
  const { evaluateR2C00TruthReconciliation } = await loadR2C00();
  const result = evaluateR2C00TruthReconciliation();
  assert.equal(result.pass, true);
  assert.equal(result.verdict, 'REPRODUCED_FALSE_GREEN_PROGRAM_DOD_REJECTED');
  assert.equal(result.programDodVerdict, 'NOT_READY');
  assert.deepEqual(result.findings.map((finding) => finding.id), [
    'F01_NO_REAL_MANUAL_MAP_GRAPH_WORKBENCH',
    'F02_UNSAFE_FIRST_OBJECT_SEMANTIC_ACTIONS',
    'F03_ACCEPTANCE_CHAIN_FALSE_GREEN',
    'F04_NARROW_DESKTOP_ATLAS_UNREACHABLE',
    'F05_AUTHORITY_SIDE_CAPABILITY_REVALIDATION_MISSING',
    'F06_DESIGN_RESEARCH_METADATA_IN_RUNTIME_PAYLOADS',
  ]);
  assert.equal(result.findings.every((finding) => finding.reproduced === true), true);
});

test('R2 C00 invalidates only overclaimed outcomes and defines visible black-box acceptance', async () => {
  const { evaluateR2C00TruthReconciliation } = await loadR2C00();
  const result = evaluateR2C00TruthReconciliation();
  assert.deepEqual(result.invalidatedContours, [
    'ER_C04_PRODUCT_VERTICAL_JOURNEYS_AND_GRAPH_WORKBENCH',
    'ER_C06_ATLAS_RAIL_RESPONSIVE_ACCESSIBILITY',
    'ER_C07_STAGE_REVALIDATION_AND_HANDOFF',
    'E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION',
    'EFINAL_FINAL_AUDIT_AND_PROGRAM_DOD',
  ]);
  assert.equal(result.retainedEvidence.some((entry) => entry.includes('Product Core reducers')), true);
  assert.equal(result.blackBoxAcceptanceRequired.forbiddenAsReadinessProof.includes('direct IPC command calls'), true);
  assert.equal(result.blackBoxAcceptanceRequired.requiredJourney.includes('verify persisted model and rendered hit-testable graph outcome'), true);
  assert.equal(result.supportedViewportMatrix.filter((row) => row.classification === 'SUPPORTED_DESKTOP').length, 4);
  assert.equal(result.supportedViewportMatrix.some((row) => row.width === 390 && row.classification === 'ADVISORY_MOBILE_FALLBACK_ONLY'), true);
});

test('R2 C00 append-only receipt records NOT_READY and does not certify Program DoD', () => {
  const receiptPath = path.join(process.cwd(), 'docs', 'OPS', 'STATUS', 'YALKEN_ATLAS_V5_R2_C00_TRUTH_RECONCILIATION_RECEIPT.json');
  assert.equal(fs.existsSync(receiptPath), true);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.schemaVersion, 'YALKEN_ATLAS_V5_R2_C00_TRUTH_RECONCILIATION_RECEIPT_V1');
  assert.equal(receipt.status, 'NOT_READY_FALSE_GREEN_REPRODUCED');
  assert.equal(receipt.programDodVerdict, 'REJECTED_UNTIL_R2_REVALIDATION');
  assert.equal(receipt.certifiedStageOutcomes.length, 0);
  assert.equal(receipt.unsatisfiedStageOutcomes.includes('E02_STAGE_02_MANUAL_MAP_GRAPH_WORKBENCH_USER_OUTCOME'), true);
  assert.equal(receipt.validation.find((row) => row.id === 'full-runner')?.result, 'PASS');
  assert.match(receipt.validation.find((row) => row.id === 'full-runner')?.summary || '', /does not certify Program DoD/u);
});
