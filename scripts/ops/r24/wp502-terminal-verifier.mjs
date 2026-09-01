#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';

const ROOT = 'docs/OPS/R24';
const C = `${ROOT}/CORRECTIVE`;
const E = `${ROOT}/EVIDENCE`;
const PATHS = Object.freeze({
  authority: `${C}/WP502_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V2.json`,
  selection: `${C}/WP502_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json`,
  instance: `${C}/WP502_MAIN_PRODUCT_STAGE_INSTANCE_V2.json`,
  admission: `${C}/WP502_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V2.json`,
  failure: `${C}/WP502_CANDIDATE_CI_FAILURE_V1.json`,
  before: `${C}/WP502_PROTECTED_WIP_BEFORE_V1.json`,
  after: `${C}/WP502_PROTECTED_WIP_AFTER_V1.json`,
  matrix: `${C}/WP502_ACCEPTANCE_MATRIX_V1.json`,
  effective: `${C}/WP502_TERMINAL_EFFECTIVE_STATE_V1.json`,
  registry: `${C}/WP502_TERMINAL_STAGE_REGISTRY_V1.json`,
  release: `${C}/WP502_LEASE_RELEASE_V1.json`,
  receipt: `${C}/WP502_TERMINAL_RECEIPT_V1.json`,
  ctr: `${ROOT}/CTR-R24-WP-502-THREADS-CAUSALITY.json`,
  claims: `${E}/ES-R24-WP-502-THREADS-CAUSALITY-CLAIM-BINDINGS.json`,
});
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const digestCanonical = (value) => sha256(Buffer.from(canonical(value)));
const fail = (code, detail = '') => { const error = new Error(detail ? `${code}:${detail}` : code); error.code = code; throw error; };
const assert = (condition, code, detail = '') => { if (!condition) fail(code, detail); };
const read = (file) => {
  const bytes = fs.readFileSync(file);
  assert(bytes.length > 0 && bytes.at(-1) === 0x0a, 'E_WP502_CANONICAL_LF', file);
  return { value: JSON.parse(bytes.toString('utf8')), digest: sha256(bytes), sizeBytes: bytes.length };
};
const sourceRolesExact = (value, label) => {
  assert(value?.externalSourcePlanDigest === '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a', 'E_WP502_EXTERNAL_SOURCE_PLAN', label);
  assert(value?.compiledProgramFileDigest === 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a', 'E_WP502_COMPILED_PROGRAM', label);
  assert(value.externalSourcePlanDigest !== value.compiledProgramFileDigest && value.rolesDistinct !== false, 'E_WP502_SOURCE_ROLES_CONFLATED', label);
};

export function verifyWp502TerminalCarriers() {
  const authority = read(PATHS.authority), selection = read(PATHS.selection), instance = read(PATHS.instance), admission = read(PATHS.admission), failure = read(PATHS.failure);
  const before = read(PATHS.before), after = read(PATHS.after), matrix = read(PATHS.matrix), effective = read(PATHS.effective);
  const registry = read(PATHS.registry), release = read(PATHS.release), receipt = read(PATHS.receipt), ctr = read(PATHS.ctr), claims = read(PATHS.claims);
  assert(authority.digest === admission.value.authorityDigest, 'E_WP502_AUTHORITY_DIGEST');
  assert(instance.digest === admission.value.stageInstanceDigest, 'E_WP502_INSTANCE_DIGEST');
  assert(selection.value.admissionBindings.authorityDigest === '799e9b0076ec86115bbe425624eb11d065b945c47f0c7193c0184f8052991d00' && selection.value.admissionBindings.stageInstanceDigest === '9d4b205fbd2d45b66c576fd217e221eeabb8f4dc23f91d8a7831bca139a13873' && selection.value.admissionBindings.stageAdmissionDigest === '67e2d651e11365dca6e506252fea3165ead351389c81a6aef85bd7b0bf6da5c2', 'E_WP502_V1_SELECTION_BINDING');
  assert(authority.value.stageId === 'WP-502_THREADS_CAUSALITY' && instance.value.stageId === authority.value.stageId && admission.value.stageId === authority.value.stageId, 'E_WP502_STAGE_ID');
  assert(instance.value.model === 'gpt-5.6-sol' && instance.value.reasoningEffort === 'xhigh', 'E_WP502_RUNTIME');
  assert(instance.value.baseSha === 'd76a3e4da899775ae94b9a1ee5ba8aa766e2fb2b' && instance.value.treeSha === '522a3a18d8d467f1427e928febc7a402fcd2f689', 'E_WP502_BASE_IDENTITY');
  assert(instance.value.lease.fencingCounter === 65 && instance.value.lease.status === 'ACTIVE' && instance.value.lease.wip === 1, 'E_WP502_ACTIVE_LEASE');
  for (const value of [authority.value, instance.value, admission.value, failure.value.sourcePlanRoles, selection.value.sourcePlanRoles, matrix.value.sourcePlanRoles, effective.value.sourcePlanRoles, registry.value.sourcePlanRoles, release.value.sourcePlanRoles, receipt.value.sourcePlanRoles, ctr.value.sourcePlanRoles]) sourceRolesExact(value, value.schemaVersion);
  const predecessorById = new Map(instance.value.predecessors.map((entry) => [entry.id, entry]));
  assert(predecessorById.get('WP502_V1_AUTHORITY')?.digest === '799e9b0076ec86115bbe425624eb11d065b945c47f0c7193c0184f8052991d00', 'E_WP502_V1_AUTHORITY_PREDECESSOR');
  assert(predecessorById.get('WP502_V1_STAGE_INSTANCE')?.digest === '9d4b205fbd2d45b66c576fd217e221eeabb8f4dc23f91d8a7831bca139a13873', 'E_WP502_V1_INSTANCE_PREDECESSOR');
  assert(predecessorById.get('WP502_V1_STAGE_ADMISSION')?.digest === '67e2d651e11365dca6e506252fea3165ead351389c81a6aef85bd7b0bf6da5c2', 'E_WP502_V1_ADMISSION_PREDECESSOR');
  assert(predecessorById.get('CANDIDATE_CI_RUN_33506532912')?.digest === failure.digest, 'E_WP502_FAILED_CI_PREDECESSOR');
  assert(failure.value.status === 'BOUND_FAILED_CANDIDATE' && failure.value.runId === 33506532912 && failure.value.headSha === '7f74a14f1f8c388fbd11147358fb3fcd18e98bcd' && failure.value.rootFailure.code === 'E_WP501_TERMINAL_EXCEPTION_UNADMITTED_PATH' && failure.value.rootFailure.path === '.github/workflows/oss-policy.yml', 'E_WP502_FAILED_CI_BINDING');

  assert(before.value.schemaVersion === 'YALKEN_PROTECTED_WIP_SNAPSHOT_V2' && after.value.schemaVersion === before.value.schemaVersion, 'E_WP502_WIP_SCHEMA');
  assert(before.value.completeDenominator === after.value.completeDenominator && before.value.presentDenominator === after.value.presentDenominator && before.value.prunableDenominator === after.value.prunableDenominator, 'E_WP502_WIP_DENOMINATOR');
  assert(canonical(before.value.entries) === canonical(after.value.entries), 'E_WP502_WIP_ENTRIES_CHANGED');
  assert(canonical(before.value.protectedDirtySet) === canonical(after.value.protectedDirtySet) && before.value.dirtyDenominator === 7 && after.value.dirtyDenominator === 7, 'E_WP502_PROTECTED_DIRTY_SET_CHANGED');

  const evidenceFiles = receipt.value.evidenceStampPaths.map((path) => read(path));
  assert(evidenceFiles.length === 7 && new Set(receipt.value.evidenceStampPaths).size === 7, 'E_WP502_EVIDENCE_DENOMINATOR');
  for (let index = 0; index < evidenceFiles.length; index += 1) {
    assert(evidenceFiles[index].digest === receipt.value.evidenceStampDigests[index].sha256, 'E_WP502_EVIDENCE_DIGEST', receipt.value.evidenceStampPaths[index]);
    assert(receipt.value.evidenceStampDigests[index].path === receipt.value.evidenceStampPaths[index], 'E_WP502_EVIDENCE_ORDER');
  }
  assert(claims.value.verdict === 'PASS' && claims.value.claimBindings.length === 7, 'E_WP502_CLAIM_BINDING_DENOMINATOR');
  for (const artifact of claims.value.implementationArtifactDigests) assert(sha256(fs.readFileSync(artifact.path)) === artifact.sha256, 'E_WP502_IMPLEMENTATION_DIGEST', artifact.path);
  const compiledProgramBinding = claims.value.implementationArtifactDigests.find((artifact) => artifact.path === `${C}/R24_CORRECTIVE_PROGRAM_V1_1.json`);
  assert(compiledProgramBinding?.sha256 === 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a', 'E_WP502_COMPILED_PROGRAM_CLAIM_BINDING');
  assert(compiledProgramBinding.terms.some((term) => term.includes('1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a')), 'E_WP502_EXTERNAL_SOURCE_PLAN_CLAIM_BINDING');

  assert(matrix.value.status === 'CONDITIONAL_PASS_PENDING_EXTERNAL_DELIVERY' && matrix.value.localPassedRowCount === 18 && matrix.value.externalPredicateRowCount === 4 && matrix.value.failedRowCount === 0 && matrix.value.pendingRowCount === 0, 'E_WP502_MATRIX_STATE');
  assert(matrix.value.rows.length === 22 && matrix.value.rows.filter((row) => row.status === 'PASS').length === 18 && matrix.value.rows.filter((row) => row.status === 'REQUIRED_EXTERNAL_PREDICATE').length === 4, 'E_WP502_MATRIX_DENOMINATOR');
  assert(matrix.value.bindings.claimBindingDigest === claims.digest && matrix.value.bindings.protectedWipAfterDigest === after.digest, 'E_WP502_MATRIX_BINDING');
  assert(effective.value.status === 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_PREDICATES' && effective.value.bindings.acceptanceMatrixDigest === matrix.digest, 'E_WP502_EFFECTIVE_STATE');
  assert(effective.value.currentCounts.DONE === 57 && effective.value.currentCounts.PENDING === 39 && effective.value.targetCounts.DONE === 58 && effective.value.targetCounts.PENDING === 38, 'E_WP502_GRAPH_COUNTS');
  assert(registry.value.status === 'CONDITIONAL_CERTIFIED_DONE' && registry.value.bindings.acceptanceMatrixDigest === matrix.digest && registry.value.bindings.effectiveStateDigest === effective.digest, 'E_WP502_REGISTRY');
  assert(release.value.status === 'ADMITTED_CONDITIONAL_RELEASE' && release.value.currentLease.status === 'ACTIVE' && release.value.currentLease.wip === 1 && release.value.targetLease.status === 'RELEASED' && release.value.targetLease.wip === 0, 'E_WP502_RELEASE_STATE');
  assert(release.value.bindings.acceptanceMatrixDigest === matrix.digest && release.value.bindings.effectiveStateDigest === effective.digest && release.value.bindings.stageRegistryDigest === registry.digest && release.value.bindings.protectedWipBeforeDigest === before.digest && release.value.bindings.protectedWipAfterDigest === after.digest, 'E_WP502_RELEASE_BINDING');
  assert(receipt.value.status === 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY' && receipt.value.bindings.acceptanceMatrixDigest === matrix.digest && receipt.value.bindings.effectiveStateDigest === effective.digest && receipt.value.bindings.stageRegistryDigest === registry.digest && receipt.value.bindings.leaseReleaseDigest === release.digest && receipt.value.bindings.failedCandidateCiDigest === failure.digest, 'E_WP502_RECEIPT_BINDING');
  assert(receipt.value.externalDeliveryPredicates.length === 4 && receipt.value.externalDeliveryPredicates.every((predicate) => predicate.status === 'REQUIRED_NOT_PRECLAIMED' && predicate.providerIdentity === null), 'E_WP502_EXTERNAL_PRECLAIM');
  assert(ctr.value.conditionalTerminalRule.ruleId === 'SINGLE_TERMINAL_PR_RULE_V1' && ctr.value.graphAdvance === false, 'E_WP502_CTR_RULE');
  for (const value of [matrix.value, effective.value, registry.value, release.value, receipt.value, ctr.value]) assert(value.programDone === false, 'E_WP502_PROGRAM_DONE');
  assert(receipt.value.nextGraphNodeStarted === false && receipt.value.nonClaims.includes('NO_MAIN_PRODUCT_GRAPH_NODE_AFTER_WP502_STARTED'), 'E_WP502_NEXT_NODE_OVERCLAIM');
  assert(digestCanonical(instance.value.operations.createPaths) !== digestCanonical([]), 'E_WP502_EMPTY_WRITE_SET');
  return {
    schemaVersion: 'YALKEN_R24_WP502_TERMINAL_CARRIERS_VERIFICATION_V1', status: 'PASS',
    authorityDigest: authority.digest, stageInstanceDigest: instance.digest, stageAdmissionDigest: admission.digest,
    selectionDigest: selection.digest, protectedWipBeforeDigest: before.digest, protectedWipAfterDigest: after.digest,
    claimBindingDigest: claims.digest, acceptanceMatrixDigest: matrix.digest, effectiveStateDigest: effective.digest,
    stageRegistryDigest: registry.digest, leaseReleaseDigest: release.digest, terminalReceiptDigest: receipt.digest,
    evidenceStampDenominator: evidenceFiles.length, localPassedRows: 18, externalPredicateRows: 4,
    currentLease: release.value.currentLease, targetLease: release.value.targetLease, programDone: false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (process.argv[2] !== '--check') fail('E_WP502_USAGE', '--check');
    process.stdout.write(`${JSON.stringify(verifyWp502TerminalCarriers())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ code: error.code ?? 'E_WP502_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
