import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalBytes } from '../../scripts/ops/r24/corrective/canonical-json.mjs';
import {
  ACCEPTANCE_SIGNALS_DIGEST,
  B0_STAGE_ADMISSION_DIGEST,
  B0_STAGE_INSTANCE_DIGEST,
  B0_WRITE_SET,
  B0_WRITE_SET_DIGEST,
  BLOCKED_C7A_RECEIPT_DIGEST,
  CONTROL_PLANE_EVIDENCE_STAMP_DIGEST,
  FENCE_DIGEST,
  LEASE_DIGEST,
  OWNER_BINDING_DIGEST,
  PROGRAM_TEMPLATE_DIGEST,
  REVOCATION_DIGEST,
  SOURCE_HEAD_SHA,
  SOURCE_TREE_SHA,
  STAGE_ADMISSION_DIGEST,
  STAGE_INSTANCE_DIGEST,
  STAGE_REGISTRY_DIGEST,
  TRUST_MODEL_DIGEST,
  VERIFIER_CODE_DIGEST,
  VERIFIER_CONTRACT_DIGEST,
  WRITE_SET,
  WRITE_SET_DIGEST,
} from '../../scripts/ops/r24/corrective/c6d-dependency-audit.mjs';
import { C6D_DEPENDENCY_MUTATION_ADMISSION } from '../../scripts/ops/r24/package-content-trust-pk0.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORRECTIVE = 'docs/OPS/R24/CORRECTIVE';
const readBytes = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath));
const readJson = (relativePath) => JSON.parse(readBytes(relativePath).toString('utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const CONTROL_BINDINGS = Object.freeze([
  ['docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json', PROGRAM_TEMPLATE_DIGEST],
  ['docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json', STAGE_REGISTRY_DIGEST],
  ['docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json', TRUST_MODEL_DIGEST],
  ['docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json', OWNER_BINDING_DIGEST],
  ['docs/OPS/R24/EVIDENCE/ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS.json', CONTROL_PLANE_EVIDENCE_STAMP_DIGEST],
]);

const B0_STAGE = `${CORRECTIVE}/B0_STAGE_INSTANCE_AMENDMENT_V2.json`;
const B0_ADMISSION = `${CORRECTIVE}/B0_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V2.json`;
const C6D_STAGE = `${CORRECTIVE}/C6D_STAGE_INSTANCE_AMENDMENT_V6.json`;
const C6D_ADMISSION = `${CORRECTIVE}/C6D_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V6.json`;
const LEDGER = `${CORRECTIVE}/C6D_CONTROL_PLANE_RECOVERY_LEDGER_V1.json`;

test('C6D forward recovery restores the exact fixed owner authority bytes', () => {
  for (const [relativePath, expectedDigest] of CONTROL_BINDINGS) {
    const bytes = readBytes(relativePath);
    assert.equal(sha256(bytes), expectedDigest, relativePath);
    assert.equal(bytes.equals(canonicalBytes(JSON.parse(bytes.toString('utf8')))), true, relativePath);
  }

  const standing = readJson(CONTROL_BINDINGS[3][0]);
  assert.equal(standing.programTemplateDigest, PROGRAM_TEMPLATE_DIGEST);
  assert.equal(standing.stageRegistryDigest, STAGE_REGISTRY_DIGEST);
  assert.equal(standing.trustModelDigest, TRUST_MODEL_DIGEST);
  assert.equal(standing.verifierCodeDigest, VERIFIER_CODE_DIGEST);
  assert.equal(standing.verifierContractDigest, VERIFIER_CONTRACT_DIGEST);
  assert.equal(standing.scopeExpansionForbidden, true);
});

test('fixed verifier reproduces both recovery admissions byte for byte', () => {
  const cases = [
    [B0_STAGE, B0_ADMISSION, B0_STAGE_INSTANCE_DIGEST, B0_STAGE_ADMISSION_DIGEST, B0_WRITE_SET_DIGEST],
    [C6D_STAGE, C6D_ADMISSION, STAGE_INSTANCE_DIGEST, STAGE_ADMISSION_DIGEST, WRITE_SET_DIGEST],
  ];

  assert.equal(sha256(readBytes('scripts/ops/r24/corrective/stage-admission-verifier.mjs')), VERIFIER_CODE_DIGEST);
  assert.equal(readJson(`${CORRECTIVE}/STANDING_AUTHORITY_BINDING_V1.json`).verifierContractDigest, VERIFIER_CONTRACT_DIGEST);

  for (const [stagePath, admissionPath, stageDigest, admissionDigest, writeSetDigest] of cases) {
    assert.equal(sha256(readBytes(stagePath)), stageDigest);
    assert.equal(sha256(readBytes(admissionPath)), admissionDigest);
    const result = spawnSync(process.execPath, [
      path.join(REPO_ROOT, 'scripts/ops/r24/corrective/stage-admission-verifier.mjs'),
      path.join(REPO_ROOT, stagePath),
      path.join(REPO_ROOT, `${CORRECTIVE}/STAGE_REGISTRY_V1.json`),
      path.join(REPO_ROOT, `${CORRECTIVE}/PROGRAM_TEMPLATE_V1_1.json`),
    ], { encoding: null });
    assert.equal(result.status, 0, Buffer.from(result.stderr ?? '').toString('utf8'));
    assert.equal(Buffer.from(result.stdout).equals(readBytes(admissionPath)), true, admissionPath);
    const admission = readJson(admissionPath);
    assert.equal(admission.status, 'ADMITTED');
    assert.equal(admission.stageInstanceDigest, stageDigest);
    assert.equal(admission.writeSetDigest, writeSetDigest);
  }

  const b0Stage = readJson(B0_STAGE);
  const c6dStage = readJson(C6D_STAGE);
  assert.deepEqual([...b0Stage.writeSet.paths].sort(), [...B0_WRITE_SET]);
  assert.deepEqual([...c6dStage.writeSet.paths].sort(), [...WRITE_SET]);
  assert.equal(B0_WRITE_SET.some((filePath) => WRITE_SET.includes(filePath)), false);
  assert.equal(c6dStage.recoveryAuthorityPartition.rule, 'EACH_RECOVERY_PATH_BELONGS_TO_EXACTLY_ONE_FIXED_REGISTRY_ADMISSION');
});

test('recovery ledger excludes the revoked evaluation and remains pending external attestation', () => {
  const ledgerBytes = readBytes(LEDGER);
  const ledger = JSON.parse(ledgerBytes.toString('utf8'));
  assert.equal(ledgerBytes.equals(canonicalBytes(ledger)), true);
  assert.equal(ledger.exactSourceIdentity.headSha, SOURCE_HEAD_SHA);
  assert.equal(ledger.exactSourceIdentity.treeSha, SOURCE_TREE_SHA);
  assert.equal(ledger.fixedAuthority.programTemplateDigest, PROGRAM_TEMPLATE_DIGEST);
  assert.equal(ledger.fixedAuthority.stageRegistryDigest, STAGE_REGISTRY_DIGEST);
  assert.equal(ledger.fixedAuthority.trustModelDigest, TRUST_MODEL_DIGEST);
  assert.equal(ledger.fixedAuthority.standingAuthorityBindingDigest, OWNER_BINDING_DIGEST);
  assert.equal(ledger.recoveryFence.leaseDigest, LEASE_DIGEST);
  assert.equal(ledger.recoveryFence.fenceDigest, FENCE_DIGEST);
  assert.equal(ledger.recoveryFence.fencingCounter, 33);
  assert.equal(ledger.recoveryFence.predecessorBlockedNodeReceiptDigest, BLOCKED_C7A_RECEIPT_DIGEST);
  assert.equal(ledger.revokedEvaluation.revocationDigest, REVOCATION_DIGEST);
  assert.equal(ledger.revokedEvaluation.status, 'REVOKED_FROM_CURRENT_CERTIFICATION_SET_HISTORICAL_RECEIPT_PRESERVED');
  assert.equal(ledger.terminalState.currentCertificationSetMember, false);
  assert.equal(ledger.terminalState.invalidRunExcluded, true);
  assert.equal(ledger.terminalState.recursiveClosurePrForbidden, true);
  assert.equal(ledger.preservation.dependencyBytesChangedByRecovery, false);
  assert.equal(ledger.preservation.c7aWipLoss, false);

  const contract = readJson(`${CORRECTIVE}/C6D_DEPENDENCY_AUDIT_CONTRACT_V1.json`);
  const disposition = readJson(`${CORRECTIVE}/C6D_AUDIT_DISPOSITION_V1.json`);
  const c1a = readJson(`${CORRECTIVE}/C1A_TOOLCHAIN_CONTRACT_V1.json`);
  assert.equal(contract.sourceBindings.acceptanceSignalsDigest, ACCEPTANCE_SIGNALS_DIGEST);
  assert.equal(contract.sourceBindings.revocationDigest, REVOCATION_DIGEST);
  assert.equal(contract.signals.EXTERNAL_TERMINAL_ATTESTATION_VERIFIED, 'PENDING_POST_MERGE_EXTERNAL_C6D_ATTESTATION');
  assert.equal(contract.nonClaims.includes('NO_PROGRAM_DONE'), true);
  assert.equal(disposition.terminalState, 'PENDING_POST_MERGE_EXTERNAL_C6D_ATTESTATION');
  assert.equal(c1a.auditPolicy.c6dClosure.certificationStatus, 'PENDING_POST_MERGE_EXTERNAL_C6D_ATTESTATION');
  assert.equal(c1a.sourceBinding.c6dCurrentCertification.status, 'PENDING_POST_MERGE_EXTERNAL_C6D_ATTESTATION');
});

test('dependent governance approvals bind every recovery path to the fixed standing authority', () => {
  const stageApprovals = readJson(`${CORRECTIVE}/C6D_GOVERNANCE_CHANGE_APPROVALS_V1.json`);
  const activeApprovals = readJson(`${CORRECTIVE}/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json`);
  const allPaths = [...new Set([...B0_WRITE_SET, ...WRITE_SET])].sort();
  const stagePaths = allPaths.filter((filePath) => ![
    `${CORRECTIVE}/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json`,
    `${CORRECTIVE}/C6D_GOVERNANCE_CHANGE_APPROVALS_V1.json`,
  ].includes(filePath));
  const activePaths = allPaths.filter((filePath) => filePath !== `${CORRECTIVE}/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json`);
  for (const [approvals, expectedPaths] of [[stageApprovals.approvals, stagePaths], [activeApprovals.approvals, activePaths]]) {
    for (const filePath of expectedPaths) {
      const entry = approvals.find((candidate) => candidate.filePath === filePath);
      assert.ok(entry, filePath);
      assert.equal(entry.approvedBy, `owner-standing-authority:${OWNER_BINDING_DIGEST}`);
      assert.equal(entry.sha256, sha256(readBytes(filePath)));
    }
  }
  assert.equal(activeApprovals.approvals.some((entry) => entry.approvedBy?.includes('644f726a64b7b837')), false);
});

test('recovery changes no dependency byte and rebinds the PK0 exception fail closed', () => {
  assert.equal(sha256(readBytes('package.json')), '4fbc7196f596c36a5741411fd9c622ab2227749648f619deba3eb81027b5a39e');
  assert.equal(sha256(readBytes('package-lock.json')), '54dc46b025c7f77d522bb861724dc7d8bdd752a29e3e6a55eb72f30b50047a6f');
  assert.equal(B0_WRITE_SET.includes('package.json'), false);
  assert.equal(WRITE_SET.includes('package.json'), false);
  assert.equal(B0_WRITE_SET.includes('package-lock.json'), false);
  assert.equal(WRITE_SET.includes('package-lock.json'), false);
  assert.equal(C6D_DEPENDENCY_MUTATION_ADMISSION.ownerAuthorityBindingDigest, OWNER_BINDING_DIGEST);
  assert.equal(C6D_DEPENDENCY_MUTATION_ADMISSION.stageInstanceDigest, STAGE_INSTANCE_DIGEST);
  assert.equal(C6D_DEPENDENCY_MUTATION_ADMISSION.stageAdmissionDigest, STAGE_ADMISSION_DIGEST);
  assert.deepEqual(C6D_DEPENDENCY_MUTATION_ADMISSION.allowedChangedFiles, ['package-lock.json', 'package.json']);
});
