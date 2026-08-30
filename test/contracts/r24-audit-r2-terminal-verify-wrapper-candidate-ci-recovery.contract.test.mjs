import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateGovernanceApprovalState } from '../../scripts/ops/governance-approval-state.mjs';
import { lintDocsClaims } from '../../scripts/ops/r24/docs-claim-lint.mjs';

const ROOT = 'docs/OPS/R24/CORRECTIVE';
const APPROVALS = `${ROOT}/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json`;
const DIAGNOSTIC = `${ROOT}/AUDIT_R2_TERMINAL_VERIFY_WRAPPER_CANDIDATE_CI_RECOVERY_DIAGNOSTIC_EVIDENCE_V1.json`;
const STAMP = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const load = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('candidate CI failure evidence binds the exact immutable jobs and admitted recovery', () => {
  const evidence = load(DIAGNOSTIC);
  assert.equal(evidence.candidateFailure.runId, '33287204359');
  assert.equal(evidence.candidateFailure.candidateSha, '08ea7059a453e5e7959a71f95fb072ddcaeacab4');
  assert.equal(evidence.candidateFailure.jobs.length, 3);
  assert.deepEqual(evidence.classification.maintainedRtkGraph, { cancelled:0, fail:0, pass:1067, skipped:0, tests:1067, todo:0 });
  assert.equal(evidence.effectiveAdmission.stageInstanceDigest, 'd281079c0d2a72608fb1d5be2cd105edee2049bfebd8358986780c56b1f2e20a');
  assert.deepEqual(evidence.evidenceStampIds, [STAMP]);
  assert.equal(evidence.programDoneClaimed, false);
  assert.equal(evidence.wp400MutationStarted, false);
});

test('stage-local governance approvals are unique and bind the current exact bytes', () => {
  const state = evaluateGovernanceApprovalState({ repoRoot: process.cwd(), approvalsPath: APPROVALS });
  assert.equal(state.ok, true, state.failDetail);
  const approvals = load(APPROVALS).approvals;
  assert.equal(new Set(approvals.map((entry) => entry.filePath)).size, approvals.length);
  for (const entry of approvals) assert.equal(entry.sha256, sha256(fs.readFileSync(entry.filePath)), entry.filePath);
});

test('stale approval bytes reproduce a typed file-hash mismatch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-r2-ci-approval-'));
  try {
    const target = 'docs/OPS/R24/CORRECTIVE/sample.json';
    const approvalsPath = 'docs/OPS/R24/CORRECTIVE/approvals.json';
    fs.mkdirSync(path.join(root, path.dirname(target)), { recursive: true });
    fs.writeFileSync(path.join(root, target), '{}\n');
    fs.writeFileSync(path.join(root, approvalsPath), JSON.stringify({ version:'v1.0', approvals:[{ filePath:target, sha256:'0'.repeat(64), approvedBy:'owner', approvedAtUtc:'2026-08-30T00:00:00Z', rationale:'negative stale-byte probe' }] }));
    const state = evaluateGovernanceApprovalState({ repoRoot: root, approvalsPath });
    assert.equal(state.ok, false);
    assert.equal(state.failDetail, 'APPROVAL_FILE_HASH_MISMATCH_0');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('both claim-bearing diagnostic carriers resolve the existing evidence stamp and the full docs lint is green', () => {
  for (const file of ["docs/OPS/R24/CORRECTIVE/AUDIT_R2_TERMINAL_VERIFY_WRAPPER_RECOVERY_DIAGNOSTIC_EVIDENCE_V1.json","docs/OPS/R24/CORRECTIVE/AUDIT_R2_TERMINAL_VERIFY_WRAPPER_RECOVERY_READMISSION_DIAGNOSTIC_EVIDENCE_V1.json"]) assert.deepEqual(load(file).evidenceStampIds, [STAMP]);
  const result = lintDocsClaims(process.cwd());
  assert.equal(result.ok, true, result.failures.join('\n'));
});

