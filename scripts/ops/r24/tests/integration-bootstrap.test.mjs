import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadMissionContract, verifyApprovalReceipt, computeMissionDigest, APPROVAL_RECEIPT_SCHEMA_VERSION } from '../mission-contract.mjs';
import { initPlanState, readPlanState, transitionContour, classifyPlanStateAfterCrash } from '../plan-state.mjs';
import { acquireLease, assertLeaseCurrent, releaseLease } from '../lease.mjs';
import { selectNext } from '../scheduler.mjs';
import { buildEvidenceStamp, buildTerminalReceipt } from '../terminal-receipt.mjs';
import { runTruthful } from '../runner-truth.mjs';
import { sha256hex } from '../canonical-json.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'r24-integ-'));
const NOW = '2026-08-20T00:00:00Z';
const HEAD = '7b4c89de155567371e1f0a0003b74e3be3abc223';
const TREE = '715f2660a59b543dc85cc50c9d2137c294517ee0';

function missionFixture(dir) {
  const contract = {
    schemaVersion: 'yalken.program-mission.r2.4',
    missionId: 'YALKEN-R2.4-GUIDED-BOOTSTRAP-2026-08-19',
    revision: 1,
    ownerIntent: 'integration fixture',
    programId: 'YALKEN-FINAL-EVOLUTIONARY-PROGRAM-R2.4',
    allowedProfilesBeforeRuntimeApproval: ['SHARED_ASSURANCE_BOOTSTRAP'],
    proposedProfilesAfterApproval: ['WRITER_TRUTH_FOUNDATION'],
    currentMutationScope: ['READ_ONLY_G0', 'E0_PROPOSAL_ONLY'],
    forbiddenScope: ['USER_DOCUMENTS', 'EXISTING_USER_DRIVE_FILES', 'SECRETS', 'PRODUCT_AI', 'CLOUD_TRUTH', 'EXECUTABLE_PLUGINS', 'SAFE_APPLY_WIDENING', 'SECOND_ACTIVE_CONTOUR'],
    deliveryIntent: { commit: true, push: true, pullRequest: true, merge: 'CONDITIONAL' },
    terminalDefinition: 'evidence-bound verdict',
    approvalInvalidatesOnAnyChange: true,
    missionDigest: '0'.repeat(64),
    ownerIntentRecord: { source: 'TEST', captured: true, runtimeAuthority: false },
    ownerApproval: { status: 'REQUIRED_AT_FRESH_G0', approvedDigest: null, approvalArtifactRequired: true, noSelfApproval: true },
    controlPlaneAuthority: {
      status: 'PACKAGE_LEVEL_CONTROL_PLANE_CLOSED_RUNTIME_UNPROVEN',
      runtimeImplemented: false,
      ownerApprovalRequiredAfterAnyChange: true,
      closureDigest: 'a'.repeat(64),
      closureFiles: [
        { path: 'machine/AUTONOMY_CONTROL_PLANE_R2_4.json', sha256: 'b'.repeat(64) },
        { path: 'machine/OWNER_GATE_REGISTRY_R2_4.json', sha256: 'c'.repeat(64) },
        { path: 'machine/EXECUTION_ENVELOPES_R2_4.json', sha256: 'd'.repeat(64) },
        { path: 'schemas/autonomy-control-plane-r2_4.schema.json', sha256: 'e'.repeat(64) },
        { path: 'schemas/owner-gate-registry-r2_4.schema.json', sha256: 'f'.repeat(64) },
        { path: 'schemas/execution-envelopes-r2_4.schema.json', sha256: '0'.repeat(64) },
        { path: 'schemas/selection-receipt-r2_4.schema.json', sha256: '1'.repeat(64) },
        { path: 'schemas/mission-contract-r2_4.schema.json', sha256: '2'.repeat(64) },
      ],
    },
  };
  contract.missionDigest = computeMissionDigest(contract);
  const file = path.join(dir, 'mission.json');
  fs.writeFileSync(file, JSON.stringify(contract));
  const receipt = {
    schemaVersion: APPROVAL_RECEIPT_SCHEMA_VERSION,
    missionDigest: contract.missionDigest,
    approvedDigest: contract.missionDigest,
    status: 'APPROVED',
    approvedBy: 'OWNER',
    approvedAtUtc: NOW,
    noSelfApproval: true,
  };
  return { contract, receipt, file };
}

function programFixture() {
  return {
    guards: [{ id: 'G0_AUTHORITY_CLOSURE', state: 'CURRENT' }],
    nodes: [
      { id: 'R24C0_SEMANTIC_PACKAGE_CLOSURE', kind: 'FOUNDATION', profile: 'SHARED_ASSURANCE_BOOTSTRAP', dependsOn: [], state: 'DONE', ownerGate: null, evidenceContract: { requiredClasses: ['CONTRACT'] } },
      { id: 'E0_RUNNER_SAFETY_QUARANTINE', kind: 'FOUNDATION', profile: 'SHARED_ASSURANCE_BOOTSTRAP', dependsOn: ['R24C0_SEMANTIC_PACKAGE_CLOSURE'], state: 'PENDING', ownerGate: null, evidenceContract: { requiredClasses: ['CONTRACT', 'INTEGRATION', 'INDEPENDENT_EXACT_HEAD'] } },
      { id: 'Q0_TOOLCHAIN_HYGIENE', kind: 'FOUNDATION', profile: 'SHARED_ASSURANCE_BOOTSTRAP', dependsOn: ['E0_RUNNER_SAFETY_QUARANTINE'], state: 'PENDING', ownerGate: null, evidenceContract: { requiredClasses: ['CONTRACT'] } },
    ],
  };
}

test('full supervised E0 chain: approval, lease, schedule, transitions, receipts, crash resume', () => {
  const dir = tmp();
  const { contract, receipt: approval, file } = missionFixture(dir);
  const loaded = loadMissionContract(file);
  const approved = verifyApprovalReceipt(loaded.contract, approval, { expectedDigest: contract.missionDigest });
  assert.equal(approved.approved, true);

  const planFile = path.join(dir, 'plan-state.json');
  initPlanState(planFile);
  const lease = acquireLease(planFile, {
    contourId: 'E0_RUNNER_SAFETY_QUARANTINE', writerId: 'KIMI-K3-MAX', missionId: contract.missionId,
    ttlMs: 3600000, now: NOW, expectedRevision: 0, idempotencyKey: 'e0-lease-1',
  });
  assert.equal(lease.result.lease.fencingToken, 1);

  const program = programFixture();
  const selection = selectNext({
    program,
    contourStates: {},
    mission: {
      missionId: contract.missionId,
      missionDigest: contract.missionDigest,
      selectedProfiles: ['SHARED_ASSURANCE_BOOTSTRAP'],
      approved: true,
      autonomyEnabled: false,
    },
    now: NOW,
  });
  assert.equal(selection.selectedId, 'E0_RUNNER_SAFETY_QUARANTINE');
  assert.equal(selection.verdict, 'SELECTED');

  let revision = lease.revision;
  const transitions = ['ELIGIBLE', 'RUNNING', 'DELIVERED', 'POSTMERGE_VERIFIED', 'DONE'];
  for (const to of transitions) {
    const state = readPlanState(planFile);
    assertLeaseCurrent(state, { contourId: 'E0_RUNNER_SAFETY_QUARANTINE', writerId: 'KIMI-K3-MAX', fencingToken: 1, now: NOW });
    const result = transitionContour(planFile, {
      contourId: 'E0_RUNNER_SAFETY_QUARANTINE',
      to,
      expectedRevision: revision,
      attemptId: 'ATTEMPT-1',
      now: NOW,
      idempotencyKey: `e0-transition-${to}`,
    });
    revision = result.revision;
  }
  assert.equal(readPlanState(planFile).contours.E0_RUNNER_SAFETY_QUARANTINE.state, 'DONE');

  const tapScript = path.join(dir, 'tap.cjs');
  fs.writeFileSync(tapScript, 'console.log("TAP version 13\\n# tests 4\\n# pass 4\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0\\n");');
  const { receipt: runnerReceipt } = runTruthful({ runId: 'E0-INTEGRATION-RUN', cmd: process.execPath, args: [tapScript], cwd: dir });
  assert.equal(runnerReceipt.verdict, 'PASS');

  const stamp = buildEvidenceStamp({
    stampId: 'ES-E0-INTEGRATION-1',
    missionId: contract.missionId,
    contourId: 'E0_RUNNER_SAFETY_QUARANTINE',
    attemptId: 'ATTEMPT-1',
    authorityEpoch: 'e'.repeat(64),
    profileId: 'SHARED_ASSURANCE_BOOTSTRAP',
    repo: { canonicalPath: '/repo', originUrl: 'https://github.com/KirPonomarev/writer-editor.git', headSha: HEAD, treeSha: TREE },
    claim: { type: 'E0_INTEGRATION', ceiling: 'NODE_AND_SELECTED_PROFILE_ONLY', verdict: 'PASS' },
    test: { oracleId: 'R24-E0-INTEGRATION', evidenceClass: 'INTEGRATION', denominator: runnerReceipt.executedDenominator, passed: runnerReceipt.executedDenominator, failed: 0, skipped: 0, exitCode: runnerReceipt.exitCode },
    causal: { parentStampIds: [], predecessorReceiptDigest: null },
    createdAt: NOW,
  });
  assert.equal(stamp.test.denominator > 0, true);

  const terminal = buildTerminalReceipt({
    receiptId: 'CTR-E0-INTEGRATION-1',
    missionId: contract.missionId,
    contourId: 'E0_RUNNER_SAFETY_QUARANTINE',
    attemptId: 'ATTEMPT-1',
    authorityEpoch: 'e'.repeat(64),
    exactHeadSha: HEAD,
    mergeState: 'MERGED',
    postmergeState: 'PASS',
    survivorState: 'PASS',
    evidenceStampIds: [stamp.stampId],
    nextContourId: 'Q0_TOOLCHAIN_HYGIENE',
  });
  assert.equal(terminal.nextContourId, 'Q0_TOOLCHAIN_HYGIENE');

  // Duplicate dispatch suppression across the whole chain.
  const dupPlan = path.join(dir, 'dup-plan.json');
  initPlanState(dupPlan);
  const first = transitionContour(dupPlan, {
    contourId: 'C', to: 'ELIGIBLE', expectedRevision: 0, attemptId: 'A1', now: NOW, idempotencyKey: 'k1',
  });
  const replay = transitionContour(dupPlan, {
    contourId: 'C', to: 'ELIGIBLE', expectedRevision: 1, attemptId: 'A1', now: NOW, idempotencyKey: 'k1',
  });
  assert.equal(first.applied, true);
  assert.equal(replay.duplicate, true);
  assert.equal(readPlanState(dupPlan).revision, 1);

  // Crash between intent and commit classifies and recovers read-only.
  const crashFile = path.join(dir, 'crash-plan.json');
  initPlanState(crashFile);
  const intentPath = path.join(dir, '.crash-plan.json.r24-intent');
  const pendingDigest = sha256hex('{"crash":true}\n');
  fs.writeFileSync(intentPath, `${JSON.stringify({ target: 'crash-plan.json', sha256: pendingDigest })}\n`);
  const cls = classifyPlanStateAfterCrash(crashFile);
  assert.equal(cls.classification, 'ROLLBACK_REQUIRED');
  fs.unlinkSync(intentPath);
  const recovered = classifyPlanStateAfterCrash(crashFile);
  assert.equal(recovered.classification, 'OLD_OR_NEW_COMMITTED');
  const state = readPlanState(crashFile);
  assert.equal(state.revision, 0);
});
