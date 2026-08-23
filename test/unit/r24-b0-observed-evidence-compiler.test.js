'use strict';

// R2.4 B0 observed-evidence oracle: workflow topology may bind order only.
// A compiler PASS must consume candidate-bound observed run/job/step evidence.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'observed-evidence-v2.mjs');
const HEAD = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const STAGE_ID = 'B0_OBSERVED_EVIDENCE_CLAIM_COMPILER_REPAIR';
const SCRIPT = 'test:r24-b0';
const DIGEST = 'f'.repeat(64);

async function validator() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function observedRow(overrides = {}) {
  return {
    stageId: STAGE_ID,
    status: 'SUCCESS',
    headSha: HEAD,
    treeSha: TREE,
    evidenceClass: 'INDEPENDENT_EXACT_HEAD',
    source: 'OBSERVED_EVIDENCE_STAMP_V2',
    candidate: { stageId: STAGE_ID, script: SCRIPT, profileId: 'SHARED_ASSURANCE' },
    run: { id: 'run-b0', attempt: 1, headSha: HEAD, conclusion: 'success' },
    job: { id: 'job-b0', name: SCRIPT, conclusion: 'success' },
    step: { name: SCRIPT, number: 1, conclusion: 'success' },
    counts: { denominator: 7, passed: 7, failed: 0, skipped: 0, exitCode: 0 },
    artifact: { name: 'b0.json', digest: DIGEST },
    tool: { name: 'observed-evidence-v2', digest: DIGEST },
    schema: { name: 'EvidenceStampV2', digest: DIGEST },
    fixture: { name: 'r24-b0-observed-evidence-compiler', digest: DIGEST },
    ...overrides,
  };
}

function validate(c, row, overrides = {}) {
  return c.validateObservedGateEvidenceRow({
    row,
    stageId: STAGE_ID,
    stage: { stageId: STAGE_ID, profile: 'SHARED_ASSURANCE' },
    expectedHeadSha: HEAD,
    expectedTreeSha: TREE,
    expectedScript: SCRIPT,
    requiredEvidenceClass: 'INDEPENDENT_EXACT_HEAD',
    ...overrides,
  });
}

test('B0 accepts complete candidate-bound observed EvidenceStampV2 gate evidence', async () => {
  const c = await validator();
  const result = validate(c, observedRow());
  assert.equal(result.ok, true);
});

test('B0 rejects topology-only and omitted observed evidence', async () => {
  const c = await validator();
  const topology = c.buildTopologyOnlyEvidenceFromWorkflowPrefix({
    requiredStageIds: [STAGE_ID],
    workflowScripts: ['test:r24-a0', SCRIPT, 'test:r24-v1'],
    compilerScript: 'test:r24-v1',
    stageScriptById: { [STAGE_ID]: SCRIPT },
  });
  assert.equal(topology.length, 1);
  assert.equal(topology[0].topologyOnly, true);

  const topologyResult = validate(c, topology[0]);
  assert.equal(topologyResult.ok, false);
  assert.equal(topologyResult.code, 'GATE_TOPOLOGY_ONLY_EVIDENCE');

  const omitted = validate(c, null);
  assert.equal(omitted.ok, false);
  assert.equal(omitted.code, 'GATE_OBSERVED_EVIDENCE_REQUIRED');
});

test('B0 rejects legacy aliases, stale SHA/tree, failed identities, truncation, counts, and digests', async () => {
  const c = await validator();
  const cases = [
    ['legacy-class', observedRow({ evidenceClass: 'E6_INDEPENDENT_EXACT_HEAD' }), 'GATE_LEGACY_EVIDENCE_CLASS_FORBIDDEN'],
    ['missing-active-class', observedRow({ evidenceClass: 'PHYSICAL_ONLY' }), 'GATE_EVIDENCE_CLASS_MISSING'],
    ['wrong-head', observedRow({ headSha: 'c'.repeat(40) }), 'GATE_HEAD_MISMATCH'],
    ['wrong-tree', observedRow({ treeSha: 'd'.repeat(40) }), 'GATE_TREE_MISMATCH'],
    ['failed-status', observedRow({ status: 'FAIL' }), 'GATE_NOT_SUCCESS'],
    ['cancelled-run', observedRow({ run: { id: 'run-b0', attempt: 1, headSha: HEAD, conclusion: 'cancelled' } }), 'GATE_NOT_SUCCESS'],
    ['failed-step', observedRow({ step: { name: SCRIPT, number: 1, conclusion: 'failure' } }), 'GATE_NOT_SUCCESS'],
    ['skipped-count', observedRow({ counts: { denominator: 7, passed: 6, failed: 0, skipped: 1, exitCode: 0 } }), 'GATE_NOT_SUCCESS'],
    ['nonzero-exit', observedRow({ counts: { denominator: 7, passed: 7, failed: 0, skipped: 0, exitCode: 1 } }), 'GATE_NOT_SUCCESS'],
    ['truncated', observedRow({ outputTruncated: true }), 'GATE_EVIDENCE_TRUNCATED'],
    ['digest-missing', observedRow({ artifact: {} }), 'GATE_DIGEST_BINDING_MISSING'],
    ['digest-mismatch', observedRow({ schema: { name: 'EvidenceStampV2', digest: DIGEST, expectedDigest: 'e'.repeat(64) } }), 'GATE_DIGEST_MISMATCH'],
  ];

  for (const [name, row, code] of cases) {
    const result = validate(c, row);
    assert.equal(result.ok, false, name);
    assert.equal(result.code, code, name);
  }
});
