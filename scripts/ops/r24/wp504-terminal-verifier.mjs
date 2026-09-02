#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const C = 'docs/OPS/R24/CORRECTIVE';
const P = Object.freeze({
  authority: `${C}/WP504_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V5.json`,
  instance: `${C}/WP504_MAIN_PRODUCT_STAGE_INSTANCE_V5.json`,
  admission: `${C}/WP504_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V5.json`,
  selection: `${C}/WP504_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json`,
  predecessor: `${C}/WP503_EXTERNAL_TERMINAL_CLOSURE_V1.json`,
  before: `${C}/WP504_PROTECTED_WIP_BEFORE_V1.json`,
  historicalFailure: `${C}/WP504_WP503_HISTORICAL_EVALUATION_FAILURE_V1.json`,
  historicalSuccessor: `${C}/WP504_WP503_HISTORICAL_EVALUATION_SUCCESSOR_V1.json`,
  matrix: `${C}/WP504_ACCEPTANCE_MATRIX_V1.json`,
  effective: `${C}/WP504_EFFECTIVE_STATE_V1.json`,
  registry: `${C}/WP504_STAGE_REGISTRY_V1.json`,
  release: `${C}/WP504_LEASE_RELEASE_V1.json`,
  receipt: `${C}/WP504_TERMINAL_RECEIPT_V1.json`,
  supplement: `${C}/WP504_TERMINAL_SUPPLEMENT_V1.json`,
  evidence: 'docs/OPS/R24/EVIDENCE/ES-R24-WP-504-DOSSIER-LAYOUT-LINKS-CLAIM-BINDINGS.json',
});
const P3 = Object.freeze({
  authority: `${C}/WP504_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V13.json`,
  instance: `${C}/WP504_MAIN_PRODUCT_STAGE_INSTANCE_V13.json`,
  admission: `${C}/WP504_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V13.json`,
  predecessor: `${C}/WP503_EXTERNAL_TERMINAL_CLOSURE_V2.json`,
  failure: `${C}/WP504_POST_AUDIT_CLEAN_TREE_FAILURE_V1.json`,
  successor: `${C}/WP504_POST_AUDIT_CANDIDATE_BOUND_SUCCESSOR_V1.json`,
  wordingSuccessor: `${C}/WP504_RELEASE01_WORDING_SURFACE_SUCCESSOR_V1.json`,
  carrierRegistry: `${C}/AUDIT_R2_CARRIER_REGISTRY_V22.json`,
  matrix: `${C}/WP504_ACCEPTANCE_MATRIX_V3.json`,
  effective: `${C}/WP504_EFFECTIVE_STATE_V3.json`,
  registry: `${C}/WP504_STAGE_REGISTRY_V3.json`,
  release: `${C}/WP504_LEASE_RELEASE_V3.json`,
  receipt: `${C}/WP504_TERMINAL_RECEIPT_V3.json`,
  supplement: `${C}/WP504_TERMINAL_SUPPLEMENT_V3.json`,
  evidence: 'docs/OPS/R24/EVIDENCE/ES-R24-WP-504-CANDIDATE-BOUND-CLAIM-BINDINGS.json',
});
const EXTERNAL_SOURCE = '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a';
const COMPILED_PROGRAM = 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = (code, detail = '') => { const error = new Error(detail ? `${code}:${detail}` : code); error.code = code; throw error; };
const assert = (condition, code, detail = '') => { if (!condition) fail(code, detail); };
const read = (file) => {
  const bytes = fs.readFileSync(file);
  assert(bytes.length > 0 && bytes.at(-1) === 0x0a, 'E_WP504_CANONICAL_LF', file);
  return { value: JSON.parse(bytes.toString('utf8')), digest: sha256(bytes), sizeBytes: bytes.length };
};
const sourceRolesExact = (value, label) => {
  assert(value?.externalSourcePlanDigest === EXTERNAL_SOURCE, 'E_WP504_EXTERNAL_SOURCE_PLAN', label);
  assert(value?.compiledProgramFileDigest === COMPILED_PROGRAM, 'E_WP504_COMPILED_PROGRAM', label);
  assert(value.externalSourcePlanDigest !== value.compiledProgramFileDigest && value.rolesDistinct !== false, 'E_WP504_SOURCE_ROLES_CONFLATED', label);
};
const gitObjectDigest = (commit, file) => {
  const result = spawnSync('git', ['show', `${commit}:${file}`], { encoding: null, maxBuffer: 64 * 1024 * 1024 });
  assert(result.status === 0, 'E_WP504_GIT_OBJECT', `${commit}:${file}`);
  return sha256(result.stdout);
};
const artifactPresentNowOrInHistory = (artifact) => {
  if (fs.existsSync(artifact.path) && sha256(fs.readFileSync(artifact.path)) === artifact.sha256) return true;
  const revisions = spawnSync('git', ['rev-list', '--all', '--', artifact.path], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (revisions.status !== 0) return false;
  return revisions.stdout.trim().split('\n').filter(Boolean).some((revision) => {
    const object = spawnSync('git', ['show', `${revision}:${artifact.path}`], { encoding: null, maxBuffer: 64 * 1024 * 1024 });
    return object.status === 0 && sha256(object.stdout) === artifact.sha256;
  });
};

export function verifyWp504TerminalRecord(subject) {
  sourceRolesExact(subject.sourcePlanRoles, 'record');
  assert(subject.stageId === 'WP-504_DOSSIER_LAYOUT_LINKS', 'E_WP504_RECORD_STAGE');
  assert(subject.rows.length === subject.rowCount, 'E_WP504_RECORD_DENOMINATOR');
  assert(subject.rows.filter((row) => row.status === 'PASS').length === subject.localPassedRowCount, 'E_WP504_RECORD_LOCAL_PASS');
  assert(subject.rows.filter((row) => row.status === 'REQUIRED_EXTERNAL_PREDICATE').length === subject.externalPredicateRowCount, 'E_WP504_RECORD_EXTERNAL');
  assert(subject.rows.every((row) => row.status === 'PASS' || row.status === 'REQUIRED_EXTERNAL_PREDICATE'), 'E_WP504_RECORD_PENDING_OR_FAIL');
  assert(subject.failedRowCount === 0 && subject.pendingRowCount === 0 && subject.programDone === false, 'E_WP504_RECORD_STATE');
  return { status: 'PASS', rowCount: subject.rowCount };
}

export function verifyWp504TerminalCarriers() {
  const authority = read(P.authority), instance = read(P.instance), admission = read(P.admission), selection = read(P.selection), predecessor = read(P.predecessor), before = read(P.before), historicalFailure = read(P.historicalFailure), historicalSuccessor = read(P.historicalSuccessor), matrix = read(P.matrix), effective = read(P.effective), registry = read(P.registry), release = read(P.release), receipt = read(P.receipt), supplement = read(P.supplement), evidence = read(P.evidence);
  assert(authority.digest === admission.value.authorityDigest && instance.digest === admission.value.stageInstanceDigest, 'E_WP504_ADMISSION_CHAIN');
  assert(authority.value.authorityId === instance.value.authorityId && admission.value.authorityId === authority.value.authorityId, 'E_WP504_AUTHORITY_ID');
  assert(instance.value.model === 'gpt-5.6-sol' && instance.value.reasoningEffort === 'xhigh', 'E_WP504_RUNTIME');
  assert(instance.value.baseSha === '38a495f5beca286f134e20a991cb69dc19e6379f' && instance.value.treeSha === 'ed61f208dda5a9340b4697cdaf3487d6e66f7b90', 'E_WP504_BASE');
  assert(instance.value.lease.fencingCounter === 68 && instance.value.lease.status === 'ACTIVE' && instance.value.lease.wip === 1, 'E_WP504_ACTIVE_LEASE');
  for (const value of [authority.value, instance.value, admission.value, selection.value.sourcePlanRoles, matrix.value.sourcePlanRoles, effective.value.sourcePlanRoles, registry.value.sourcePlanRoles, release.value.sourcePlanRoles, receipt.value.sourcePlanRoles, supplement.value.sourcePlanRoles, historicalSuccessor.value.sourcePlanRoles]) sourceRolesExact(value, value.schemaVersion);
  assert(selection.digest === receipt.value.bindings.selectionDigest && selection.value.stageId === 'WP-504_DOSSIER_LAYOUT_LINKS', 'E_WP504_SELECTION');
  assert(predecessor.digest === receipt.value.bindings.wp503ExternalClosureDigest && predecessor.value.externalTerminal.receiptSha256 === 'c1a3868eb2b69bedef549e6dd05fbc4c35686f140b65267e29b008be7bc9d357', 'E_WP504_PREDECESSOR');
  assert(before.digest === release.value.bindings.protectedWipBeforeDigest || before.digest === '35451ad46635f23d9bc78cdeecf0ee9fc053e7e4ea5d480d4817bfacf6a04d59', 'E_WP504_WIP_BEFORE');
  assert(before.value.denominators.complete === 254 && before.value.denominators.present === 251 && before.value.denominators.prunable === 3 && before.value.denominators.dirty === 7, 'E_WP504_WIP_DENOMINATOR');
  assert(historicalFailure.digest === historicalSuccessor.value.bindings.failureDigest && historicalSuccessor.value.evaluationPolicy.mutableWorkingTreeUsedForHistoricalClaim === false && historicalSuccessor.value.historicalBytesRewritten === false, 'E_WP504_HISTORICAL_SUCCESSOR');
  assert(gitObjectDigest(historicalSuccessor.value.bindings.wp503ImplementationEvaluationSha, 'src/renderer/editor.js') === 'e3b76b9c23a7dbf318382bed0626090d6be8ae8de478afcffecbf0f13ded374b', 'E_WP504_WP503_GIT_OBJECT');
  verifyWp504TerminalRecord(matrix.value);
  assert(matrix.digest === effective.value.bindings.acceptanceMatrixDigest && matrix.digest === registry.value.bindings.acceptanceMatrixDigest && matrix.digest === release.value.bindings.acceptanceMatrixDigest && matrix.digest === receipt.value.bindings.acceptanceMatrixDigest, 'E_WP504_MATRIX_CHAIN');
  assert(effective.digest === registry.value.bindings.effectiveStateDigest && effective.digest === release.value.bindings.effectiveStateDigest && effective.digest === receipt.value.bindings.effectiveStateDigest, 'E_WP504_EFFECTIVE_CHAIN');
  assert(registry.digest === release.value.bindings.stageRegistryDigest && registry.digest === receipt.value.bindings.stageRegistryDigest, 'E_WP504_REGISTRY_CHAIN');
  assert(release.digest === receipt.value.bindings.leaseReleaseDigest, 'E_WP504_RELEASE_CHAIN');
  assert(receipt.digest === supplement.value.bindings.terminalReceiptDigest, 'E_WP504_SUPPLEMENT_CHAIN');
  assert(receipt.value.repositoryEvidenceStampId === evidence.value.stampId && supplement.value.repositoryEvidenceStampId === evidence.value.stampId && evidence.value.schemaVersion === 'ClaimBindingV1' && evidence.value.verdict === 'PASS', 'E_WP504_EVIDENCE_STAMP');
  for (const binding of evidence.value.claimBindings) assert(sha256(fs.readFileSync(binding.filePath)) === binding.sha256, 'E_WP504_EVIDENCE_BINDING', binding.filePath);
  assert(effective.value.currentCounts.DONE === 59 && effective.value.currentCounts.PENDING === 37 && effective.value.targetCounts.DONE === 60 && effective.value.targetCounts.PENDING === 36, 'E_WP504_GRAPH_COUNTS');
  assert(effective.value.currentNodeState === 'ADMITTED_ACTIVE' && effective.value.targetNodeState === 'DONE', 'E_WP504_NODE_STATE');
  assert(release.value.currentLease.fencingCounter === 68 && release.value.currentLease.status === 'ACTIVE' && release.value.currentLease.wip === 1 && release.value.targetLease.status === 'RELEASED' && release.value.targetLease.wip === 0, 'E_WP504_RELEASE_STATE');
  assert(release.value.protectedWipProof.entriesExact === true && release.value.protectedWipProof.protectedDirtySetExact === true && release.value.protectedWipProof.dirtyDenominator === 7, 'E_WP504_WIP_AFTER');
  assert(receipt.value.implementationArtifacts.length === 12 && receipt.value.implementationArtifacts.every(artifactPresentNowOrInHistory), 'E_WP504_IMPLEMENTATION_ARTIFACT');
  assert(receipt.value.localEvidence.focusedTests.passed === 15 && receipt.value.localEvidence.mutants.killed === 9 && receipt.value.localEvidence.visualAudit.passed === 4, 'E_WP504_LOCAL_EVIDENCE');
  assert(receipt.value.externalDeliveryPredicates.length === 4 && receipt.value.externalDeliveryPredicates.every((row) => row.status === 'REQUIRED_NOT_PRECLAIMED' && row.providerIdentity === null), 'E_WP504_EXTERNAL_PRECLAIM');
  assert(supplement.value.designReview.audit.status === 'PASS_AFTER_ONE_IN_SCOPE_FIX' && supplement.value.designReview.heuristic.usabilityScore === 94 && supplement.value.designReview.finalize.status === 'BLOCKED_NO_BRIEF' && supplement.value.designReview.finalize.blockingForWp504Terminal === false, 'E_WP504_DESIGN_REVIEW');
  for (const value of [matrix.value, effective.value, registry.value, release.value, receipt.value, supplement.value]) assert(value.programDone === false, 'E_WP504_PROGRAM_DONE');
  assert(receipt.value.nextGraphNodeStarted === false && supplement.value.nextGraphNodeStarted === false, 'E_WP504_NEXT_NODE');
  return { schemaVersion: 'YALKEN_R24_WP504_TERMINAL_CARRIERS_VERIFICATION_V1', status: 'PASS', authorityDigest: authority.digest, stageInstanceDigest: instance.digest, stageAdmissionDigest: admission.digest, acceptanceMatrixDigest: matrix.digest, effectiveStateDigest: effective.digest, stageRegistryDigest: registry.digest, leaseReleaseDigest: release.digest, terminalReceiptDigest: receipt.digest, terminalSupplementDigest: supplement.digest, evidenceStampDigest: evidence.digest, localPassedRows: 26, externalPredicateRows: 4, currentLease: release.value.currentLease, targetLease: release.value.targetLease, programDone: false };
}

export function verifyWp504CandidateBoundSuccessor() {
  const authority = read(P3.authority), instance = read(P3.instance), admission = read(P3.admission), predecessor = read(P3.predecessor), failure = read(P3.failure), successor = read(P3.successor), wordingSuccessor = read(P3.wordingSuccessor), carrierRegistry = read(P3.carrierRegistry), matrix = read(P3.matrix), effective = read(P3.effective), registry = read(P3.registry), release = read(P3.release), receipt = read(P3.receipt), supplement = read(P3.supplement), evidence = read(P3.evidence);
  assert(authority.digest === admission.value.authorityDigest && instance.digest === admission.value.stageInstanceDigest && admission.digest === successor.value.bindings.stageAdmissionDigest, 'E_WP504_V3_ADMISSION_CHAIN');
  assert(admission.value.writeSetDigest === successor.value.bindings.writeSetDigest && admission.value.commandScopeDigest === successor.value.bindings.commandScopeDigest && admission.value.acceptanceSignalsDigest === successor.value.bindings.acceptanceSignalsDigest, 'E_WP504_V3_SCOPE_CHAIN');
  assert(instance.value.baseSha === '781cb4c960f3433b820804fab6b21a389fc7f0bc' && instance.value.treeSha === 'cc48d1658913bd230d2742b8d38f6a473edd7aab' && instance.value.model === 'gpt-5.6-sol' && instance.value.reasoningEffort === 'xhigh', 'E_WP504_V3_IDENTITY');
  for (const value of [authority.value, instance.value, admission.value, predecessor.value.sourcePlanRoles, failure.value.sourcePlanRoles, successor.value.sourcePlanRoles, wordingSuccessor.value.sourcePlanRoles, matrix.value.sourcePlanRoles, effective.value.sourcePlanRoles, registry.value.sourcePlanRoles, release.value.sourcePlanRoles, receipt.value.sourcePlanRoles, supplement.value.sourcePlanRoles]) sourceRolesExact(value, value.schemaVersion);
  assert(predecessor.value.delivery.candidateSha === 'b95b9b66ebf3b9602a8b9f2f9265ca3df2bf6719' && predecessor.value.externalTerminal.verificationSha256 === '2c8c30f4598c16e272e1e77b947513c9d47751165b4b886e236a82c7c963b8e6', 'E_WP504_V3_PREDECESSOR_IDENTITY');
  assert(predecessor.value.supersedes.sha256 === sha256(fs.readFileSync(`${C}/WP503_EXTERNAL_TERMINAL_CLOSURE_V1.json`)) && predecessor.value.correction.historicalBytesRewritten === false, 'E_WP504_V3_PREDECESSOR_SUCCESSOR');
  assert(failure.digest === successor.value.bindings.failureDigest && predecessor.digest === successor.value.bindings.wp503ExternalClosureV2Digest && successor.value.evaluationPolicy.completeWp504AdmissionDenominator === 9 && successor.value.evaluationPolicy.arbitraryDescendantDeltaAccepted === false, 'E_WP504_V3_SUCCESSOR');
  assert(wordingSuccessor.digest === successor.value.bindings.release01WordingSurfaceSuccessorDigest && wordingSuccessor.value.predecessorSuccessor.sha256 === sha256(fs.readFileSync(`${C}/WP503_RELEASE01_WORDING_SURFACE_SUCCESSOR_V1.json`)) && wordingSuccessor.value.surfaceOverrides.every((surface) => surface.sha256 === `sha256:${sha256(fs.readFileSync(surface.path))}`), 'E_WP504_V3_WORDING_SUCCESSOR');
  assert(carrierRegistry.value.carriers.length === carrierRegistry.value.carrierDenominator && carrierRegistry.value.carriers.every((binding) => sha256(fs.readFileSync(binding.path)) === binding.sha256), 'E_WP504_V3_CARRIER_REGISTRY');
  verifyWp504TerminalRecord(matrix.value);
  assert(matrix.digest === effective.value.bindings.acceptanceMatrixDigest && matrix.digest === registry.value.bindings.acceptanceMatrixDigest && matrix.digest === release.value.bindings.acceptanceMatrixDigest && matrix.digest === receipt.value.bindings.acceptanceMatrixDigest, 'E_WP504_V3_MATRIX_CHAIN');
  assert(effective.digest === registry.value.bindings.effectiveStateDigest && effective.digest === release.value.bindings.effectiveStateDigest && effective.digest === receipt.value.bindings.effectiveStateDigest, 'E_WP504_V3_EFFECTIVE_CHAIN');
  assert(registry.digest === release.value.bindings.stageRegistryDigest && registry.digest === receipt.value.bindings.stageRegistryDigest, 'E_WP504_V3_REGISTRY_CHAIN');
  assert(release.digest === receipt.value.bindings.leaseReleaseDigest && receipt.digest === supplement.value.bindings.terminalReceiptDigest, 'E_WP504_V3_RELEASE_CHAIN');
  assert(successor.digest === matrix.value.bindings.candidateBoundSuccessorDigest && carrierRegistry.digest === matrix.value.bindings.carrierRegistryDigest, 'E_WP504_V3_CORRECTION_BINDING');
  assert(receipt.value.repositoryEvidenceStampId === evidence.value.stampId && supplement.value.repositoryEvidenceStampId === evidence.value.stampId && evidence.value.verdict === 'PASS', 'E_WP504_V3_EVIDENCE_STAMP');
  for (const binding of evidence.value.claimBindings) assert(sha256(fs.readFileSync(binding.filePath)) === binding.sha256, 'E_WP504_V3_EVIDENCE_BINDING', binding.filePath);
  assert(matrix.value.rowCount === 35 && matrix.value.localPassedRowCount === 31 && matrix.value.externalPredicateRowCount === 4, 'E_WP504_V3_DENOMINATOR');
  assert(release.value.currentLease.fencingCounter === 69 && release.value.currentLease.status === 'ACTIVE' && release.value.currentLease.wip === 1 && release.value.targetLease.status === 'RELEASED' && release.value.targetLease.wip === 0, 'E_WP504_V3_LEASE');
  for (const value of [predecessor.value, failure.value, successor.value, wordingSuccessor.value, carrierRegistry.value, matrix.value, effective.value, registry.value, release.value, receipt.value, supplement.value]) assert(value.programDone === false || value.programDoneClaimed === false, 'E_WP504_V3_PROGRAM_DONE');
  assert(!Object.hasOwn(evidence.value, 'programDone') && evidence.value.nonClaims?.includes('PROGRAM_DONE_FALSE'), 'E_WP504_V3_EVIDENCE_PROGRAM_DONE');
  return { schemaVersion: 'YALKEN_R24_WP504_CANDIDATE_BOUND_TERMINAL_VERIFICATION_V1', status: 'PASS', authorityDigest: authority.digest, stageInstanceDigest: instance.digest, stageAdmissionDigest: admission.digest, predecessorClosureDigest: predecessor.digest, failureDigest: failure.digest, successorDigest: successor.digest, carrierRegistryDigest: carrierRegistry.digest, acceptanceMatrixDigest: matrix.digest, effectiveStateDigest: effective.digest, stageRegistryDigest: registry.digest, leaseReleaseDigest: release.digest, terminalReceiptDigest: receipt.digest, terminalSupplementDigest: supplement.digest, evidenceStampDigest: evidence.digest, localPassedRows: 31, externalPredicateRows: 4, currentLease: release.value.currentLease, targetLease: release.value.targetLease, programDone: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (process.argv[2] !== '--check') fail('E_WP504_USAGE', '--check');
    process.stdout.write(`${JSON.stringify(verifyWp504TerminalCarriers())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ code: error.code ?? 'E_WP504_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
