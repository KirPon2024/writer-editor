#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = 'docs/OPS/R24';
const C = `${ROOT}/CORRECTIVE`;
const E = `${ROOT}/EVIDENCE`;
const PATHS = Object.freeze({
  authority: `${C}/WP503_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V6.json`,
  selection: `${C}/WP503_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json`,
  instance: `${C}/WP503_MAIN_PRODUCT_STAGE_INSTANCE_V6.json`,
  admission: `${C}/WP503_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V6.json`,
  before: `${C}/WP503_PROTECTED_WIP_BEFORE_V1.json`,
  after: `${C}/WP503_PROTECTED_WIP_AFTER_V1.json`,
  matrix: `${C}/WP503_ACCEPTANCE_MATRIX_V1.json`,
  effective: `${C}/WP503_TERMINAL_EFFECTIVE_STATE_V1.json`,
  registry: `${C}/WP503_TERMINAL_STAGE_REGISTRY_V1.json`,
  release: `${C}/WP503_LEASE_RELEASE_V1.json`,
  receipt: `${C}/WP503_TERMINAL_RECEIPT_V1.json`,
  ctr: `${ROOT}/CTR-R24-WP-503-ATLAS-SURFACE.json`,
  claims: `${E}/ES-R24-WP-503-ATLAS-SURFACE-CLAIM-BINDINGS.json`,
  toolchainSuccessor: `${C}/POST_AUDIT_TOOLCHAIN_BUNDLE_SUCCESSOR_V1.json`,
  wordingSuccessor: `${C}/WP503_RELEASE01_WORDING_SURFACE_SUCCESSOR_V1.json`,
  terminalSupplement: `${C}/WP503_TERMINAL_SUPPLEMENT_V2.json`,
  predecessorTerminalSupplement: `${C}/WP503_TERMINAL_SUPPLEMENT_V1.json`,
  rtkFailure: `${C}/WP503_LOCAL_RTK_FAILURE_V1.json`,
  postAuditFailure: `${C}/WP503_LOCAL_POST_AUDIT_FAILURE_V1.json`,
  postAuditSuccessor: `${C}/WP503_POST_AUDIT_CERTIFICATION_SUCCESSOR_V1.json`,
});
const TEMPORAL_PATHS = Object.freeze({
  authority: `${C}/WP503_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V7.json`,
  instance: `${C}/WP503_MAIN_PRODUCT_STAGE_INSTANCE_V7.json`,
  admission: `${C}/WP503_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V7.json`,
  failure: `${C}/WP503_TEMPORAL_EVIDENCE_FAILURE_V1.json`,
  successor: `${C}/WP503_TEMPORAL_EVIDENCE_SUCCESSOR_V1.json`,
  approvals: `${C}/WP503_GOVERNANCE_CHANGE_APPROVALS_V4.json`,
  supplement: `${C}/WP503_TERMINAL_SUPPLEMENT_V3.json`,
});
const REGISTRY_PATHS = Object.freeze({
  authority: `${C}/WP503_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V8.json`,
  instance: `${C}/WP503_MAIN_PRODUCT_STAGE_INSTANCE_V8.json`,
  admission: `${C}/WP503_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V8.json`,
  failure: `${C}/WP503_CANDIDATE_CI_AUDIT_R2_FAILURE_V1.json`,
  successor: `${C}/WP503_AUDIT_R2_REGISTRY_SUCCESSOR_V1.json`,
  approvals: `${C}/WP503_GOVERNANCE_CHANGE_APPROVALS_V5.json`,
  supplement: `${C}/WP503_TERMINAL_SUPPLEMENT_V4.json`,
  auditR2Registry: `${C}/AUDIT_R2_CARRIER_REGISTRY_V17.json`,
});
const INVENTORY_PATHS = Object.freeze({
  authority: `${C}/WP503_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V9.json`,
  instance: `${C}/WP503_MAIN_PRODUCT_STAGE_INSTANCE_V9.json`,
  admission: `${C}/WP503_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V9.json`,
  failure: `${C}/WP503_LOCAL_TEST_INVENTORY_FAILURE_V1.json`,
  successor: `${C}/WP503_TEST_INVENTORY_SUCCESSOR_V1.json`,
  approvals: `${C}/WP503_GOVERNANCE_CHANGE_APPROVALS_V6.json`,
  supplement: `${C}/WP503_TERMINAL_SUPPLEMENT_V5.json`,
  auditR2Registry: `${C}/AUDIT_R2_CARRIER_REGISTRY_V18.json`,
  testInventory: `${C}/C1B_TEST_INVENTORY_V1.json`,
});
const EXTERNAL_SOURCE = '1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a';
const COMPILED_PROGRAM = 'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a';
const V1_AUTHORITY = '7155c4221be54e631a640767989b478310cf4943e7b42560beda5a2835f02ba2';
const V1_INSTANCE = '85ae16689ecf3cc4783eb6cb57815f9d8dbb459080b4607cce46f60a025ae749';
const V1_ADMISSION = '5ffb7fbfa69061ec2de6cd9d8bb79cf6a4b4b2132d5b92350756569b86adca90';
const V2_AUTHORITY = '7ba0df466478c45cac70525d5fc5d661a37ba5fe8cb001955430842d37158e44';
const V2_INSTANCE = 'c33047dc38e6bbd07f698f4b0818261a85e48a22f2b1b7df2bde0bea48055ecd';
const V2_ADMISSION = '004d5e479ef2cb35332d4cb89c41824ad5586b38461d60d9cc4a4a3ba3428c59';
const V3_AUTHORITY = 'fd542b02ccb232cf91ad924bcb7f74ed5cde953cbd1911c305162d50dc2762be';
const V3_INSTANCE = '3e99a19fa0874c1aab12af1b2f988d3def3434d27d9baa3c04a36e0a028e8125';
const V3_ADMISSION = '1de86e8b59ef0ec0a421e853e2b447f5112bebce8c7db26f909425734278c12f';
const V4_AUTHORITY = '4c159e905b4a769f01d387d7e879ff88477038cb5e8c74ba96ddb7fd82fd766c';
const V4_INSTANCE = '3dd4894bb6121b8dd188412df19ebdb42e6f2f511efc2ff1e2ea75b2f3615cc4';
const V4_ADMISSION = 'b37ffe11651cfd5639daeb71ccc81ef2e7c6f4cb4fa54decd80f5eb66d3ce04b';
const V5_AUTHORITY = '0265d35e41a130a63ac03b431f50c02b06bd37d3799f5dcd63d5f5e8791f2ce9';
const V5_INSTANCE = '28e89223241512edfb2df2d3436f6a74d24fa80bea572ec051da06c7b46bef21';
const V5_ADMISSION = '5e56705c54871f229791f70ac3831d10dfe75ac3207669ec08e19a8805c35598';
const WP502_EXTERNAL_RECEIPT = '9a5b58d2b29336508090d8a5f9e02ee61e4b6e22d7ba5ea137f6b45a7901a687';
const WP502_EXTERNAL_VERIFICATION = '26105a4c0b8aba232eb538fcb21e96eb5b6247b3cd7f26ad481d9b02b4dcea72';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const fail = (code, detail = '') => { const error = new Error(detail ? `${code}:${detail}` : code); error.code = code; throw error; };
const assert = (condition, code, detail = '') => { if (!condition) fail(code, detail); };
const read = (file) => {
  const bytes = fs.readFileSync(file);
  assert(bytes.length > 0 && bytes.at(-1) === 0x0a, 'E_WP503_CANONICAL_LF', file);
  return { value: JSON.parse(bytes.toString('utf8')), digest: sha256(bytes), sizeBytes: bytes.length };
};
const sourceRolesExact = (value, label) => {
  assert(value?.externalSourcePlanDigest === EXTERNAL_SOURCE, 'E_WP503_EXTERNAL_SOURCE_PLAN', label);
  assert(value?.compiledProgramFileDigest === COMPILED_PROGRAM, 'E_WP503_COMPILED_PROGRAM', label);
  assert(value.externalSourcePlanDigest !== value.compiledProgramFileDigest && value.rolesDistinct !== false, 'E_WP503_SOURCE_ROLES_CONFLATED', label);
};
const gitObjectDigest = (revision, file) => {
  const result = spawnSync('git', ['show', `${revision}:${file}`], { encoding: null, maxBuffer: 16 * 1024 * 1024 });
  assert(result.status === 0 && Buffer.isBuffer(result.stdout), 'E_WP503_HISTORICAL_GIT_OBJECT', file);
  return sha256(result.stdout);
};

export function verifyWp503V6TerminalCarriers() {
  const authority = read(PATHS.authority), selection = read(PATHS.selection), instance = read(PATHS.instance), admission = read(PATHS.admission);
  const before = read(PATHS.before), after = read(PATHS.after), matrix = read(PATHS.matrix), effective = read(PATHS.effective);
  const registry = read(PATHS.registry), release = read(PATHS.release), receipt = read(PATHS.receipt), ctr = read(PATHS.ctr), claims = read(PATHS.claims), toolchainSuccessor = read(PATHS.toolchainSuccessor), wordingSuccessor = read(PATHS.wordingSuccessor), terminalSupplement = read(PATHS.terminalSupplement), predecessorTerminalSupplement = read(PATHS.predecessorTerminalSupplement), rtkFailure = read(PATHS.rtkFailure), postAuditFailure = read(PATHS.postAuditFailure), postAuditSuccessor = read(PATHS.postAuditSuccessor);

  assert(authority.digest === admission.value.authorityDigest, 'E_WP503_AUTHORITY_DIGEST');
  assert(instance.digest === admission.value.stageInstanceDigest, 'E_WP503_INSTANCE_DIGEST');
  assert(authority.value.stageId === 'WP-503_ATLAS_SURFACE' && instance.value.stageId === authority.value.stageId && admission.value.stageId === authority.value.stageId, 'E_WP503_STAGE_ID');
  assert(instance.value.model === 'gpt-5.6-sol' && instance.value.reasoningEffort === 'xhigh', 'E_WP503_RUNTIME');
  assert(instance.value.baseSha === '3157d84126a76734af50d012b359f7a58b2035fb' && instance.value.treeSha === '7f38243ced17ee249f0c541004171235a1e14788', 'E_WP503_BASE_IDENTITY');
  assert(instance.value.lease.fencingCounter === 66 && instance.value.lease.status === 'ACTIVE' && instance.value.lease.wip === 1, 'E_WP503_ACTIVE_LEASE');
  for (const value of [authority.value, instance.value, admission.value, selection.value.sourcePlanRoles, matrix.value.sourcePlanRoles, effective.value.sourcePlanRoles, registry.value.sourcePlanRoles, release.value.sourcePlanRoles, receipt.value.sourcePlanRoles, ctr.value.sourcePlanRoles, wordingSuccessor.value.sourcePlanRoles, terminalSupplement.value.sourcePlanRoles, predecessorTerminalSupplement.value.sourcePlanRoles, postAuditFailure.value.sourcePlanRoles, postAuditSuccessor.value.sourcePlanRoles]) sourceRolesExact(value, value.schemaVersion);

  const predecessorById = new Map(instance.value.predecessors.map((entry) => [entry.id, entry]));
  assert(predecessorById.get('WP503_V1_AUTHORITY')?.digest === V1_AUTHORITY, 'E_WP503_V1_AUTHORITY_PREDECESSOR');
  assert(predecessorById.get('WP503_V1_STAGE_INSTANCE')?.digest === V1_INSTANCE, 'E_WP503_V1_INSTANCE_PREDECESSOR');
  assert(predecessorById.get('WP503_V1_STAGE_ADMISSION')?.digest === V1_ADMISSION, 'E_WP503_V1_ADMISSION_PREDECESSOR');
  assert(predecessorById.get('WP503_V2_AUTHORITY')?.digest === V2_AUTHORITY, 'E_WP503_V2_AUTHORITY_PREDECESSOR');
  assert(predecessorById.get('WP503_V2_STAGE_INSTANCE')?.digest === V2_INSTANCE, 'E_WP503_V2_INSTANCE_PREDECESSOR');
  assert(predecessorById.get('WP503_V2_STAGE_ADMISSION')?.digest === V2_ADMISSION, 'E_WP503_V2_ADMISSION_PREDECESSOR');
  assert(predecessorById.get('WP503_V3_AUTHORITY')?.digest === V3_AUTHORITY, 'E_WP503_V3_AUTHORITY_PREDECESSOR');
  assert(predecessorById.get('WP503_V3_STAGE_INSTANCE')?.digest === V3_INSTANCE, 'E_WP503_V3_INSTANCE_PREDECESSOR');
  assert(predecessorById.get('WP503_V3_STAGE_ADMISSION')?.digest === V3_ADMISSION, 'E_WP503_V3_ADMISSION_PREDECESSOR');
  assert(predecessorById.get('WP503_V4_AUTHORITY')?.digest === V4_AUTHORITY, 'E_WP503_V4_AUTHORITY_PREDECESSOR');
  assert(predecessorById.get('WP503_V4_STAGE_INSTANCE')?.digest === V4_INSTANCE, 'E_WP503_V4_INSTANCE_PREDECESSOR');
  assert(predecessorById.get('WP503_V4_STAGE_ADMISSION')?.digest === V4_ADMISSION, 'E_WP503_V4_ADMISSION_PREDECESSOR');
  assert(predecessorById.get('WP503_V5_AUTHORITY')?.digest === V5_AUTHORITY, 'E_WP503_V5_AUTHORITY_PREDECESSOR');
  assert(predecessorById.get('WP503_V5_STAGE_INSTANCE')?.digest === V5_INSTANCE, 'E_WP503_V5_INSTANCE_PREDECESSOR');
  assert(predecessorById.get('WP503_V5_STAGE_ADMISSION')?.digest === V5_ADMISSION, 'E_WP503_V5_ADMISSION_PREDECESSOR');
  assert(selection.value.stageId === 'WP-503_ATLAS_SURFACE' && selection.value.exactBase.sha === instance.value.baseSha && selection.value.exactBase.tree === instance.value.treeSha, 'E_WP503_SELECTION_BINDING');
  assert(selection.value.predecessor.externalTerminalReceiptDigest === WP502_EXTERNAL_RECEIPT && selection.value.predecessor.externalVerificationDigest === WP502_EXTERNAL_VERIFICATION, 'E_WP503_SELECTION_PREDECESSOR');
  assert(predecessorById.get('WP502_EXTERNAL_TERMINAL_RECEIPT')?.digest === WP502_EXTERNAL_RECEIPT, 'E_WP503_WP502_EXTERNAL_RECEIPT');
  assert(predecessorById.get('WP502_EXTERNAL_VERIFICATION')?.digest === WP502_EXTERNAL_VERIFICATION, 'E_WP503_WP502_EXTERNAL_VERIFICATION');

  assert(instance.value.operations.modifyPaths.includes('src/renderer/editor.bundle.js'), 'E_WP503_TRACKED_BUNDLE_UNADMITTED');
  assert(instance.value.acceptanceSignals.includes('TRACKED_RENDERER_BUNDLE_EXACT_BUILD'), 'E_WP503_TRACKED_BUNDLE_SIGNAL');
  assert(instance.value.operations.modifyPaths.includes('scripts/ops/r24/corrective/post-audit-toolchain.mjs') && instance.value.operations.createPaths.includes(PATHS.toolchainSuccessor), 'E_WP503_TOOLCHAIN_SUCCESSOR_UNADMITTED');
  assert(instance.value.acceptanceSignals.includes('POST_AUDIT_TOOLCHAIN_TRACKED_BUNDLE_SUCCESSOR'), 'E_WP503_TOOLCHAIN_SUCCESSOR_SIGNAL');
  assert(toolchainSuccessor.value.historicalContract.sha256 === '90197c119af8bb9923437217a89514524769824d19306cd1fa801e6ca68e2fbe' && toolchainSuccessor.value.successor.editorBundleSha256 === sha256(fs.readFileSync('src/renderer/editor.bundle.js')), 'E_WP503_TOOLCHAIN_SUCCESSOR_BINDING');
  assert(instance.value.operations.modifyPaths.includes('test/contracts/rtk-release01-terminal-claims.contract.test.js') && instance.value.operations.createPaths.includes(PATHS.wordingSuccessor), 'E_WP503_WORDING_SUCCESSOR_UNADMITTED');
  assert(instance.value.acceptanceSignals.includes('WP307_EDITOR_WORDING_HASH_SUCCESSOR') && instance.value.acceptanceSignals.includes('RTK_RELEASE01_WORDING_SURFACE_SUCCESSOR'), 'E_WP503_WORDING_SUCCESSOR_SIGNAL');
  assert(wordingSuccessor.value.historicalRegistry.sha256 === '9064441a85e1ce2758ef018cdb82c76229e921cb1adeea844792e102ee96cba2', 'E_WP503_WORDING_HISTORICAL_BINDING');
  const wordingOverrides = new Map(wordingSuccessor.value.surfaceOverrides.map((surface) => [surface.path, surface.sha256]));
  assert(wordingOverrides.size === 2 && wordingOverrides.get('package.json') === `sha256:${sha256(fs.readFileSync('package.json'))}` && wordingOverrides.get('src/renderer/editor.js') === `sha256:${sha256(fs.readFileSync('src/renderer/editor.js'))}`, 'E_WP503_WORDING_SUCCESSOR_BINDING');
  assert(instance.value.acceptanceSignals.includes('POST_AUDIT_CERTIFICATION_CHAIN_SUCCESSOR') && instance.value.operations.modifyPaths.includes('scripts/ops/r24/corrective/post-audit-certification-set.mjs') && instance.value.operations.modifyPaths.includes('test/contracts/r24-post-audit-certification-set.contract.test.mjs') && instance.value.operations.createPaths.includes(PATHS.postAuditSuccessor), 'E_WP503_POST_AUDIT_SUCCESSOR_UNADMITTED');
  assert(postAuditFailure.value.candidateSha === '25910cd47369495d9bdafb2a78db20ac75b78abc' && postAuditFailure.value.rootFailure.code === 'E_WP502_EXCEPTION_UNADMITTED_PATH', 'E_WP503_POST_AUDIT_FAILURE_BINDING');
  assert(postAuditSuccessor.value.bindings.authorityDigest === authority.digest && postAuditSuccessor.value.bindings.stageInstanceDigest === instance.digest && postAuditSuccessor.value.bindings.stageAdmissionDigest === admission.digest && postAuditSuccessor.value.bindings.failureDigest === postAuditFailure.digest, 'E_WP503_POST_AUDIT_SUCCESSOR_BINDING');
  assert(before.value.schemaVersion === 'YALKEN_PROTECTED_WIP_SNAPSHOT_V2' && after.value.schemaVersion === before.value.schemaVersion, 'E_WP503_WIP_SCHEMA');
  assert(before.value.snapshotSha256 === after.value.snapshotSha256 && before.value.snapshotSha256 === '19dfb5e14c4340fb9cfa918ea18a1e4b7ff66a0062fcf2a0bb10cdc2f7be5b79', 'E_WP503_WIP_SNAPSHOT_DIGEST');
  assert(before.value.completeDenominator === 252 && after.value.completeDenominator === 252 && before.value.presentDenominator === after.value.presentDenominator && before.value.prunableDenominator === after.value.prunableDenominator, 'E_WP503_WIP_DENOMINATOR');
  assert(canonical(before.value.entries) === canonical(after.value.entries), 'E_WP503_WIP_ENTRIES_CHANGED');
  assert(canonical(before.value.protectedDirtySet) === canonical(after.value.protectedDirtySet) && before.value.dirtyDenominator === 7 && after.value.dirtyDenominator === 7, 'E_WP503_PROTECTED_DIRTY_SET_CHANGED');

  const evidenceFiles = receipt.value.evidenceStampPaths.map((path) => read(path));
  assert(evidenceFiles.length === 7 && new Set(receipt.value.evidenceStampPaths).size === 7, 'E_WP503_EVIDENCE_DENOMINATOR');
  for (let index = 0; index < evidenceFiles.length; index += 1) {
    assert(evidenceFiles[index].digest === receipt.value.evidenceStampDigests[index].sha256, 'E_WP503_EVIDENCE_DIGEST', receipt.value.evidenceStampPaths[index]);
    assert(receipt.value.evidenceStampDigests[index].path === receipt.value.evidenceStampPaths[index], 'E_WP503_EVIDENCE_ORDER');
  }
  assert(claims.value.verdict === 'PASS' && claims.value.claimBindings.length === 14, 'E_WP503_CLAIM_BINDING_DENOMINATOR');
  const supersededImplementationPaths = new Set([
    'scripts/ops/r24/wp503-terminal-verifier.mjs',
    'test/contracts/r24-wp503-terminal-carriers.contract.test.mjs',
  ]);
  for (const artifact of claims.value.implementationArtifactDigests) {
    const observedDigest = supersededImplementationPaths.has(artifact.path)
      ? gitObjectDigest('e17b93766c0abd9d7102881b22b54038efd8fc48', artifact.path)
      : sha256(fs.readFileSync(artifact.path));
    assert(observedDigest === artifact.sha256, 'E_WP503_IMPLEMENTATION_DIGEST', artifact.path);
  }
  const compiledProgramBinding = claims.value.implementationArtifactDigests.find((artifact) => artifact.path === `${C}/R24_CORRECTIVE_PROGRAM_V1_1.json`);
  assert(compiledProgramBinding?.sha256 === COMPILED_PROGRAM && compiledProgramBinding.terms.some((term) => term.includes(EXTERNAL_SOURCE)), 'E_WP503_SOURCE_ROLE_CLAIM_BINDING');

  assert(matrix.value.status === 'CONDITIONAL_PASS_PENDING_EXTERNAL_DELIVERY' && matrix.value.localPassedRowCount === 21 && matrix.value.externalPredicateRowCount === 4 && matrix.value.failedRowCount === 0 && matrix.value.pendingRowCount === 0, 'E_WP503_MATRIX_STATE');
  assert(matrix.value.rows.length === 25 && matrix.value.rows.filter((row) => row.status === 'PASS').length === 21 && matrix.value.rows.filter((row) => row.status === 'REQUIRED_EXTERNAL_PREDICATE').length === 4, 'E_WP503_MATRIX_DENOMINATOR');
  assert(matrix.value.bindings.claimBindingDigest === claims.digest && matrix.value.bindings.protectedWipAfterDigest === after.digest, 'E_WP503_MATRIX_BINDING');
  assert(effective.value.status === 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_PREDICATES' && effective.value.bindings.acceptanceMatrixDigest === matrix.digest, 'E_WP503_EFFECTIVE_STATE');
  assert(effective.value.currentCounts.DONE === 58 && effective.value.currentCounts.PENDING === 38 && effective.value.targetCounts.DONE === 59 && effective.value.targetCounts.PENDING === 37, 'E_WP503_GRAPH_COUNTS');
  assert(registry.value.status === 'CONDITIONAL_CERTIFIED_DONE' && registry.value.bindings.acceptanceMatrixDigest === matrix.digest && registry.value.bindings.effectiveStateDigest === effective.digest, 'E_WP503_REGISTRY');
  assert(release.value.status === 'ADMITTED_CONDITIONAL_RELEASE' && release.value.currentLease.status === 'ACTIVE' && release.value.currentLease.wip === 1 && release.value.targetLease.status === 'RELEASED' && release.value.targetLease.wip === 0, 'E_WP503_RELEASE_STATE');
  assert(release.value.bindings.authorityDigest === V4_AUTHORITY && release.value.bindings.stageInstanceDigest === V4_INSTANCE && release.value.bindings.stageAdmissionDigest === V4_ADMISSION, 'E_WP503_RELEASE_ADMISSION_PREDECESSOR_BINDING');
  assert(release.value.bindings.acceptanceMatrixDigest === matrix.digest && release.value.bindings.effectiveStateDigest === effective.digest && release.value.bindings.stageRegistryDigest === registry.digest && release.value.bindings.protectedWipBeforeDigest === before.digest && release.value.bindings.protectedWipAfterDigest === after.digest, 'E_WP503_RELEASE_BINDING');
  assert(receipt.value.status === 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY' && receipt.value.bindings.acceptanceMatrixDigest === matrix.digest && receipt.value.bindings.effectiveStateDigest === effective.digest && receipt.value.bindings.stageRegistryDigest === registry.digest && receipt.value.bindings.leaseReleaseDigest === release.digest, 'E_WP503_RECEIPT_BINDING');
  assert(receipt.value.externalDeliveryPredicates.length === 4 && receipt.value.externalDeliveryPredicates.every((predicate) => predicate.status === 'REQUIRED_NOT_PRECLAIMED' && predicate.providerIdentity === null), 'E_WP503_EXTERNAL_PRECLAIM');
  assert(receipt.value.predecessors.wp502ExternalTerminalReceiptDigest === WP502_EXTERNAL_RECEIPT && receipt.value.predecessors.wp502ExternalVerificationDigest === WP502_EXTERNAL_VERIFICATION, 'E_WP503_RECEIPT_PREDECESSOR');
  assert(receipt.value.predecessorCorrections.pr1776.candidateSha === '77354cfe994588dc1771f3eded29d1e7e68d703f' && receipt.value.predecessorCorrections.pr1777.candidateSha === 'bf3d21072879d276ca3489b0bbead780fb39f596', 'E_WP503_PREDECESSOR_LABELS');
  assert(ctr.value.conditionalTerminalRule.ruleId === 'SINGLE_TERMINAL_PR_RULE_V1' && ctr.value.graphAdvance === false, 'E_WP503_CTR_RULE');
  for (const value of [matrix.value, effective.value, registry.value, release.value, receipt.value, ctr.value]) assert(value.programDone === false, 'E_WP503_PROGRAM_DONE');
  assert(receipt.value.nextGraphNodeStarted === false && receipt.value.nonClaims.includes('NO_MAIN_PRODUCT_GRAPH_NODE_AFTER_WP503_STARTED'), 'E_WP503_NEXT_NODE_OVERCLAIM');
  assert(rtkFailure.value.candidateSha === 'e17b93766c0abd9d7102881b22b54038efd8fc48' && rtkFailure.value.summary.tests === 1067 && rtkFailure.value.summary.fail === 1 && rtkFailure.value.summary.skipped === 0, 'E_WP503_RTK_FAILURE_BINDING');
  assert(terminalSupplement.value.bindings.authorityDigest === authority.digest && terminalSupplement.value.bindings.stageInstanceDigest === instance.digest && terminalSupplement.value.bindings.stageAdmissionDigest === admission.digest, 'E_WP503_SUPPLEMENT_ADMISSION_BINDING');
  assert(terminalSupplement.value.bindings.predecessorTerminalReceiptDigest === receipt.digest && terminalSupplement.value.bindings.predecessorTerminalSupplementDigest === predecessorTerminalSupplement.digest && terminalSupplement.value.bindings.wordingSuccessorDigest === wordingSuccessor.digest && terminalSupplement.value.bindings.rtkFailureDigest === rtkFailure.digest && terminalSupplement.value.bindings.postAuditFailureDigest === postAuditFailure.digest && terminalSupplement.value.bindings.postAuditSuccessorDigest === postAuditSuccessor.digest, 'E_WP503_SUPPLEMENT_CHAIN');
  assert(terminalSupplement.value.bindings.terminalVerifierDigest === gitObjectDigest('fdd6a88834e090f2830ba23ca8a9489f1a95964a', 'scripts/ops/r24/wp503-terminal-verifier.mjs'), 'E_WP503_SUPPLEMENT_VERIFIER_BINDING');
  assert(terminalSupplement.value.bindings.terminalCarrierTestDigest === gitObjectDigest('fdd6a88834e090f2830ba23ca8a9489f1a95964a', 'test/contracts/r24-wp503-terminal-carriers.contract.test.mjs'), 'E_WP503_SUPPLEMENT_TEST_BINDING');
  assert(terminalSupplement.value.status === 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY' && terminalSupplement.value.programDone === false && terminalSupplement.value.nextGraphNodeStarted === false, 'E_WP503_SUPPLEMENT_STATE');
  return {
    schemaVersion: 'YALKEN_R24_WP503_TERMINAL_CARRIERS_VERIFICATION_V1',
    status: 'PASS',
    authorityDigest: authority.digest,
    stageInstanceDigest: instance.digest,
    stageAdmissionDigest: admission.digest,
    selectionDigest: selection.digest,
    protectedWipBeforeDigest: before.digest,
    protectedWipAfterDigest: after.digest,
    claimBindingDigest: claims.digest,
    acceptanceMatrixDigest: matrix.digest,
    effectiveStateDigest: effective.digest,
    stageRegistryDigest: registry.digest,
    leaseReleaseDigest: release.digest,
    terminalReceiptDigest: receipt.digest,
    terminalSupplementDigest: terminalSupplement.digest,
    evidenceStampDenominator: evidenceFiles.length,
    localPassedRows: 21,
    externalPredicateRows: 4,
    currentLease: release.value.currentLease,
    targetLease: release.value.targetLease,
    programDone: false,
  };
}

export function verifyWp503V7TerminalCarriers() {
  const predecessor = verifyWp503V6TerminalCarriers();
  const authority = read(TEMPORAL_PATHS.authority);
  const instance = read(TEMPORAL_PATHS.instance);
  const admission = read(TEMPORAL_PATHS.admission);
  const failure = read(TEMPORAL_PATHS.failure);
  const successor = read(TEMPORAL_PATHS.successor);
  const approvals = read(TEMPORAL_PATHS.approvals);
  const supplement = read(TEMPORAL_PATHS.supplement);
  const now = Date.now();

  assert(authority.digest === '31340f9c67867eb2b11cd940cdbc3bfb564fd62f738df0b3c1ebcf70c4e9dca1', 'E_WP503_TEMPORAL_AUTHORITY_DIGEST');
  assert(instance.digest === '6ebc284bed89df7b4c6f86fd9849e57dfcc58cd227ee898e786a69633028212f', 'E_WP503_TEMPORAL_INSTANCE_DIGEST');
  assert(admission.digest === 'bb0b13c4727f4bac954f9b6bf7d0c150401f9894b76fe5e2429ee6b8c27a8666', 'E_WP503_TEMPORAL_ADMISSION_DIGEST');
  assert(failure.digest === 'eb9a45ba28d3cf8dff91f21c57ece84244ce423ead86a6a6b4786f6f9de333fe', 'E_WP503_TEMPORAL_FAILURE_DIGEST');
  assert(admission.value.authorityDigest === authority.digest && admission.value.stageInstanceDigest === instance.digest, 'E_WP503_TEMPORAL_ADMISSION_CHAIN');
  assert(instance.value.baseSha === 'fdd6a88834e090f2830ba23ca8a9489f1a95964a' && instance.value.treeSha === 'c8af93e64befe8b62ca47f810be780d0855bb560', 'E_WP503_TEMPORAL_EXACT_BASE');
  assert(instance.value.model === 'gpt-5.6-sol' && instance.value.reasoningEffort === 'xhigh', 'E_WP503_TEMPORAL_RUNTIME');
  assert(instance.value.lease.fencingCounter === 67 && instance.value.lease.status === 'ACTIVE' && instance.value.lease.wip === 1, 'E_WP503_TEMPORAL_ACTIVE_LEASE');
  for (const value of [authority.value, instance.value, admission.value, failure.value.sourcePlanRoles, successor.value.sourcePlanRoles, approvals.value.sourcePlanRoles, supplement.value.sourcePlanRoles]) sourceRolesExact(value, value.schemaVersion);

  assert(failure.value.status === 'FAIL_CLOSED_SUPERSEDED_BY_APPEND_ONLY_TEMPORAL_EVIDENCE_SUCCESSOR' && failure.value.rootFailure.code === 'E_GOVERNANCE_APPROVAL_APPROVED_AT_FUTURE', 'E_WP503_TEMPORAL_FAILURE_STATE');
  const failureClock = Date.parse(failure.value.rootFailure.providerClockUtc);
  assert(Number.isFinite(failureClock) && failure.value.rootFailure.futureCarriers.length === 3, 'E_WP503_TEMPORAL_FAILURE_DENOMINATOR');
  for (const carrier of failure.value.rootFailure.futureCarriers) {
    const carrierTime = Date.parse(carrier.approvedAtUtc ?? carrier.observedAtUtc);
    assert(Number.isFinite(carrierTime) && carrierTime > failureClock, 'E_WP503_TEMPORAL_FAILURE_CHRONOLOGY', carrier.path);
    assert(sha256(fs.readFileSync(carrier.path)) === carrier.sha256, 'E_WP503_TEMPORAL_HISTORICAL_BYTES', carrier.path);
  }

  assert(successor.value.status === 'CURRENT_APPEND_ONLY_SUCCESSOR' && successor.value.bindings.authorityDigest === authority.digest && successor.value.bindings.stageInstanceDigest === instance.digest && successor.value.bindings.stageAdmissionDigest === admission.digest && successor.value.bindings.failureDigest === failure.digest, 'E_WP503_TEMPORAL_SUCCESSOR_CHAIN');
  assert(successor.value.bindings.verifierDigest === gitObjectDigest('acc19208d94c6be40e0f627cec218191171ae583', 'scripts/ops/r24/corrective/post-audit-certification-set.mjs') && successor.value.bindings.contractTestDigest === gitObjectDigest('acc19208d94c6be40e0f627cec218191171ae583', 'test/contracts/r24-post-audit-certification-set.contract.test.mjs') && successor.value.bindings.testInventoryDigest === gitObjectDigest('acc19208d94c6be40e0f627cec218191171ae583', `${C}/C1B_TEST_INVENTORY_V1.json`), 'E_WP503_TEMPORAL_SUCCESSOR_BYTES');
  assert(successor.value.correctedOracle.futureApprovalUtcRejected === true && successor.value.historicalEvidenceRewritten === false && successor.value.programDone === false, 'E_WP503_TEMPORAL_SUCCESSOR_STATE');

  assert(approvals.value.version === 'v1.0' && Array.isArray(approvals.value.approvals) && approvals.value.approvals.length > 0, 'E_WP503_TEMPORAL_APPROVALS_SCHEMA');
  for (const [index, approval] of approvals.value.approvals.entries()) {
    const approvedAt = Date.parse(approval.approvedAtUtc);
    assert(Number.isFinite(approvedAt) && approvedAt <= now, 'E_WP503_TEMPORAL_APPROVAL_FUTURE', String(index));
    assert(gitObjectDigest('acc19208d94c6be40e0f627cec218191171ae583', approval.filePath) === approval.sha256, 'E_WP503_TEMPORAL_APPROVAL_BYTES', approval.filePath);
  }

  assert(supplement.value.status === 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY' && supplement.value.bindings.authorityDigest === authority.digest && supplement.value.bindings.stageInstanceDigest === instance.digest && supplement.value.bindings.stageAdmissionDigest === admission.digest && supplement.value.bindings.temporalFailureDigest === failure.digest && supplement.value.bindings.temporalSuccessorDigest === successor.digest, 'E_WP503_TEMPORAL_SUPPLEMENT_CHAIN');
  assert(supplement.value.bindings.predecessorTerminalSupplementDigest === '0eae9267c9db7c8837999de0f6c8b598e0568fb96bcc1050274ab481cc59d001', 'E_WP503_TEMPORAL_SUPPLEMENT_PREDECESSOR');
  assert(supplement.value.bindings.terminalVerifierDigest === gitObjectDigest('acc19208d94c6be40e0f627cec218191171ae583', 'scripts/ops/r24/wp503-terminal-verifier.mjs') && supplement.value.bindings.terminalCarrierTestDigest === gitObjectDigest('acc19208d94c6be40e0f627cec218191171ae583', 'test/contracts/r24-wp503-terminal-carriers.contract.test.mjs'), 'E_WP503_TEMPORAL_SUPPLEMENT_BYTES');
  assert(supplement.value.currentLease.fencingCounter === 67 && supplement.value.currentLease.status === 'ACTIVE' && supplement.value.currentLease.wip === 1 && supplement.value.targetLease.status === 'RELEASED' && supplement.value.targetLease.wip === 0, 'E_WP503_TEMPORAL_SUPPLEMENT_LEASE');
  assert(supplement.value.programDone === false && supplement.value.nextGraphNodeStarted === false, 'E_WP503_TEMPORAL_SUPPLEMENT_PROGRAM_STATE');

  return {
    ...predecessor,
    schemaVersion: 'YALKEN_R24_WP503_TERMINAL_CARRIERS_VERIFICATION_V2',
    authorityDigest: authority.digest,
    stageInstanceDigest: instance.digest,
    stageAdmissionDigest: admission.digest,
    temporalFailureDigest: failure.digest,
    temporalSuccessorDigest: successor.digest,
    terminalSupplementDigest: supplement.digest,
    currentLease: supplement.value.currentLease,
    targetLease: supplement.value.targetLease,
    futureUtcOracle: 'PASS',
    programDone: false,
  };
}

export function verifyWp503V8TerminalCarriers() {
  const predecessor = verifyWp503V7TerminalCarriers();
  const authority = read(REGISTRY_PATHS.authority);
  const instance = read(REGISTRY_PATHS.instance);
  const admission = read(REGISTRY_PATHS.admission);
  const failure = read(REGISTRY_PATHS.failure);
  const successor = read(REGISTRY_PATHS.successor);
  const approvals = read(REGISTRY_PATHS.approvals);
  const supplement = read(REGISTRY_PATHS.supplement);
  const auditR2Registry = read(REGISTRY_PATHS.auditR2Registry);
  const now = Date.now();

  assert(authority.digest === 'cf801d05286366aeae012188cf98a5aaf3c01e0a49cd47864e0490a4269ebd58', 'E_WP503_REGISTRY_AUTHORITY_DIGEST');
  assert(instance.digest === 'd6539526c8948c6a0e0445b56c9606548b19702473a5c4f8b89f57bca56fa6b8', 'E_WP503_REGISTRY_INSTANCE_DIGEST');
  assert(admission.digest === '32640b6152d3aa2c69eea0b4383e416f50acf081c1ddeba45a3f3db558574e7a', 'E_WP503_REGISTRY_ADMISSION_DIGEST');
  assert(failure.digest === '0cccf8595bb84dad5ceb07ac9ab560d9bd4e93a03440241429e1d078464de071', 'E_WP503_REGISTRY_FAILURE_DIGEST');
  assert(admission.value.authorityDigest === authority.digest && admission.value.stageInstanceDigest === instance.digest, 'E_WP503_REGISTRY_ADMISSION_CHAIN');
  assert(instance.value.baseSha === 'acc19208d94c6be40e0f627cec218191171ae583' && instance.value.treeSha === '32480ed79d2ac73ed3589de99f685bd9758f53ca', 'E_WP503_REGISTRY_EXACT_BASE');
  assert(instance.value.model === 'gpt-5.6-sol' && instance.value.reasoningEffort === 'xhigh', 'E_WP503_REGISTRY_RUNTIME');
  assert(instance.value.lease.fencingCounter === 67 && instance.value.lease.status === 'ACTIVE' && instance.value.lease.wip === 1, 'E_WP503_REGISTRY_ACTIVE_LEASE');
  for (const value of [authority.value, instance.value, admission.value, failure.value.sourcePlanRoles, successor.value.sourcePlanRoles, approvals.value.sourcePlanRoles, supplement.value.sourcePlanRoles]) sourceRolesExact(value, value.schemaVersion);

  assert(failure.value.status === 'FAIL_CLOSED_SUPERSEDED_BY_APPEND_ONLY_AUDIT_R2_REGISTRY_SUCCESSOR' && failure.value.candidateCi.runId === 33536582620 && failure.value.candidateCi.failedJob.jobId === 99952261969 && failure.value.candidateCi.failedJob.code === 'E_CARRIER_REGISTRY_DIGEST', 'E_WP503_REGISTRY_FAILURE_STATE');
  assert(failure.value.rootCause.predecessorRegistryDigest === '9da3395a8d3d0e1403bb234f09a318b3e198e0fba7e8a88f64e60cafdcf4b243' && failure.value.rootCause.staleCarrierPath === `${C}/C1B_TEST_INVENTORY_V1.json`, 'E_WP503_REGISTRY_FAILURE_ROOT');
  assert(successor.value.status === 'CURRENT_APPEND_ONLY_SUCCESSOR' && successor.value.bindings.authorityDigest === authority.digest && successor.value.bindings.stageInstanceDigest === instance.digest && successor.value.bindings.stageAdmissionDigest === admission.digest && successor.value.bindings.failureDigest === failure.digest, 'E_WP503_REGISTRY_SUCCESSOR_CHAIN');
  assert(successor.value.bindings.auditR2RegistryDigest === auditR2Registry.digest && successor.value.bindings.auditR2VerifierDigest === gitObjectDigest('96cded02b57cf0147ae2d4a063891dd63f0ac212', 'scripts/ops/r24/corrective/audit-r2-corrections.mjs') && successor.value.bindings.auditR2ContractTestDigest === gitObjectDigest('96cded02b57cf0147ae2d4a063891dd63f0ac212', 'test/contracts/r24-audit-r2-corrections.contract.test.mjs') && successor.value.bindings.postAuditVerifierDigest === gitObjectDigest('96cded02b57cf0147ae2d4a063891dd63f0ac212', 'scripts/ops/r24/corrective/post-audit-certification-set.mjs') && successor.value.bindings.postAuditContractTestDigest === gitObjectDigest('96cded02b57cf0147ae2d4a063891dd63f0ac212', 'test/contracts/r24-post-audit-certification-set.contract.test.mjs'), 'E_WP503_REGISTRY_SUCCESSOR_BYTES');
  assert(auditR2Registry.value.schemaVersion === 'AUDIT_R2_CARRIER_REGISTRY_V17' && auditR2Registry.value.carriers.length === 32 && auditR2Registry.value.predecessor.sha256 === '9da3395a8d3d0e1403bb234f09a318b3e198e0fba7e8a88f64e60cafdcf4b243', 'E_WP503_REGISTRY_DENOMINATOR');

  assert(approvals.value.version === 'v1.0' && Array.isArray(approvals.value.approvals) && approvals.value.approvals.length > 0, 'E_WP503_REGISTRY_APPROVALS_SCHEMA');
  for (const [index, approval] of approvals.value.approvals.entries()) {
    const approvedAt = Date.parse(approval.approvedAtUtc);
    assert(Number.isFinite(approvedAt) && approvedAt <= now, 'E_WP503_REGISTRY_APPROVAL_FUTURE', String(index));
    assert(gitObjectDigest('96cded02b57cf0147ae2d4a063891dd63f0ac212', approval.filePath) === approval.sha256, 'E_WP503_REGISTRY_APPROVAL_BYTES', approval.filePath);
  }

  assert(supplement.value.status === 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY' && supplement.value.bindings.authorityDigest === authority.digest && supplement.value.bindings.stageInstanceDigest === instance.digest && supplement.value.bindings.stageAdmissionDigest === admission.digest && supplement.value.bindings.candidateCiFailureDigest === failure.digest && supplement.value.bindings.auditR2RegistrySuccessorDigest === successor.digest && supplement.value.bindings.auditR2RegistryDigest === auditR2Registry.digest, 'E_WP503_REGISTRY_SUPPLEMENT_CHAIN');
  assert(supplement.value.bindings.predecessorTerminalSupplementDigest === '3bbe6afc149fa625a43ccbc6775ce219199e146b06984453281cac834a0e6bc9', 'E_WP503_REGISTRY_SUPPLEMENT_PREDECESSOR');
  assert(supplement.value.bindings.terminalVerifierDigest === gitObjectDigest('96cded02b57cf0147ae2d4a063891dd63f0ac212', 'scripts/ops/r24/wp503-terminal-verifier.mjs') && supplement.value.bindings.terminalCarrierTestDigest === gitObjectDigest('96cded02b57cf0147ae2d4a063891dd63f0ac212', 'test/contracts/r24-wp503-terminal-carriers.contract.test.mjs'), 'E_WP503_REGISTRY_SUPPLEMENT_BYTES');
  assert(supplement.value.currentLease.fencingCounter === 67 && supplement.value.currentLease.status === 'ACTIVE' && supplement.value.currentLease.wip === 1 && supplement.value.targetLease.status === 'RELEASED' && supplement.value.targetLease.wip === 0, 'E_WP503_REGISTRY_SUPPLEMENT_LEASE');
  assert(supplement.value.programDone === false && supplement.value.nextGraphNodeStarted === false, 'E_WP503_REGISTRY_SUPPLEMENT_PROGRAM_STATE');

  return {
    ...predecessor,
    schemaVersion: 'YALKEN_R24_WP503_TERMINAL_CARRIERS_VERIFICATION_V3',
    authorityDigest: authority.digest,
    stageInstanceDigest: instance.digest,
    stageAdmissionDigest: admission.digest,
    candidateCiFailureDigest: failure.digest,
    auditR2RegistrySuccessorDigest: successor.digest,
    auditR2RegistryDigest: auditR2Registry.digest,
    terminalSupplementDigest: supplement.digest,
    currentLease: supplement.value.currentLease,
    targetLease: supplement.value.targetLease,
    futureUtcOracle: 'PASS',
    auditR2RegistryOracle: 'PASS',
    programDone: false,
  };
}

export function verifyWp503TerminalCarriers() {
  const predecessor = verifyWp503V8TerminalCarriers();
  const authority = read(INVENTORY_PATHS.authority);
  const instance = read(INVENTORY_PATHS.instance);
  const admission = read(INVENTORY_PATHS.admission);
  const failure = read(INVENTORY_PATHS.failure);
  const successor = read(INVENTORY_PATHS.successor);
  const approvals = read(INVENTORY_PATHS.approvals);
  const supplement = read(INVENTORY_PATHS.supplement);
  const auditR2Registry = read(INVENTORY_PATHS.auditR2Registry);
  const testInventory = read(INVENTORY_PATHS.testInventory);
  const now = Date.now();

  assert(authority.digest === 'bd12fbab73fde7c73d4ec1116eaea0154bf77612fb02b1ec158dd6528bad8d60', 'E_WP503_INVENTORY_AUTHORITY_DIGEST');
  assert(instance.digest === '9480cbcb3878c30f1dbf20d680e9368479ff3f06179067bd9800607cd516d88b', 'E_WP503_INVENTORY_INSTANCE_DIGEST');
  assert(admission.digest === '9dd48faa1949c810ba87186fbf654502c900e50e718839d8a4b93d3c506d8027', 'E_WP503_INVENTORY_ADMISSION_DIGEST');
  assert(failure.digest === '9463ff4630877875689853e9999a146d881b437ee3dd4aa97e043cf959b8fd01', 'E_WP503_INVENTORY_FAILURE_DIGEST');
  assert(admission.value.authorityDigest === authority.digest && admission.value.stageInstanceDigest === instance.digest, 'E_WP503_INVENTORY_ADMISSION_CHAIN');
  assert(instance.value.baseSha === '96cded02b57cf0147ae2d4a063891dd63f0ac212' && instance.value.treeSha === '3488fd8b7640be57c7c48ee7ba952d75f345f3f3', 'E_WP503_INVENTORY_EXACT_BASE');
  assert(instance.value.model === 'gpt-5.6-sol' && instance.value.reasoningEffort === 'xhigh', 'E_WP503_INVENTORY_RUNTIME');
  assert(instance.value.lease.fencingCounter === 67 && instance.value.lease.status === 'ACTIVE' && instance.value.lease.wip === 1, 'E_WP503_INVENTORY_ACTIVE_LEASE');
  for (const value of [authority.value, instance.value, admission.value, failure.value.sourcePlanRoles, successor.value.sourcePlanRoles, approvals.value.sourcePlanRoles, supplement.value.sourcePlanRoles]) sourceRolesExact(value, value.schemaVersion);

  assert(failure.value.status === 'FAIL_CLOSED_SUPERSEDED_BY_APPEND_ONLY_TEST_INVENTORY_SUCCESSOR' && failure.value.result.code === 'E_INVENTORY_DIGEST_MISMATCH' && failure.value.result.mismatchedPaths.length === 3 && failure.value.result.requiredSkips === 0 && failure.value.result.unexplainedSkips === 0, 'E_WP503_INVENTORY_FAILURE_STATE');
  assert(successor.value.status === 'CURRENT_APPEND_ONLY_SUCCESSOR' && successor.value.bindings.authorityDigest === authority.digest && successor.value.bindings.stageInstanceDigest === instance.digest && successor.value.bindings.stageAdmissionDigest === admission.digest && successor.value.bindings.failureDigest === failure.digest, 'E_WP503_INVENTORY_SUCCESSOR_CHAIN');
  assert(successor.value.bindings.auditR2RegistryDigest === auditR2Registry.digest && successor.value.bindings.testInventoryDigest === testInventory.digest && successor.value.bindings.auditR2VerifierDigest === sha256(fs.readFileSync('scripts/ops/r24/corrective/audit-r2-corrections.mjs')) && successor.value.bindings.auditR2ContractTestDigest === sha256(fs.readFileSync('test/contracts/r24-audit-r2-corrections.contract.test.mjs')) && successor.value.bindings.postAuditVerifierDigest === sha256(fs.readFileSync('scripts/ops/r24/corrective/post-audit-certification-set.mjs')) && successor.value.bindings.postAuditContractTestDigest === sha256(fs.readFileSync('test/contracts/r24-post-audit-certification-set.contract.test.mjs')), 'E_WP503_INVENTORY_SUCCESSOR_BYTES');
  assert(auditR2Registry.value.schemaVersion === 'AUDIT_R2_CARRIER_REGISTRY_V18' && auditR2Registry.value.carriers.length === 32 && auditR2Registry.value.predecessor.sha256 === 'b7a504de9f0061f1cabf98cdca47452d0881bf4eadf427b0d33ebf198760cc1f', 'E_WP503_INVENTORY_REGISTRY_DENOMINATOR');
  assert(testInventory.value.totals?.requiredSkips === 0 && testInventory.value.totals.unexplainedSkips === 0 && testInventory.value.totals.all === 1293, 'E_WP503_INVENTORY_SKIP_DENOMINATOR');

  assert(approvals.value.version === 'v1.0' && Array.isArray(approvals.value.approvals) && approvals.value.approvals.length > 0, 'E_WP503_INVENTORY_APPROVALS_SCHEMA');
  for (const [index, approval] of approvals.value.approvals.entries()) {
    const approvedAt = Date.parse(approval.approvedAtUtc);
    assert(Number.isFinite(approvedAt) && approvedAt <= now, 'E_WP503_INVENTORY_APPROVAL_FUTURE', String(index));
    assert(sha256(fs.readFileSync(approval.filePath)) === approval.sha256, 'E_WP503_INVENTORY_APPROVAL_BYTES', approval.filePath);
  }

  assert(supplement.value.status === 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY' && supplement.value.bindings.authorityDigest === authority.digest && supplement.value.bindings.stageInstanceDigest === instance.digest && supplement.value.bindings.stageAdmissionDigest === admission.digest && supplement.value.bindings.localInventoryFailureDigest === failure.digest && supplement.value.bindings.testInventorySuccessorDigest === successor.digest && supplement.value.bindings.auditR2RegistryDigest === auditR2Registry.digest && supplement.value.bindings.testInventoryDigest === testInventory.digest, 'E_WP503_INVENTORY_SUPPLEMENT_CHAIN');
  assert(supplement.value.bindings.predecessorTerminalSupplementDigest === '33f3221c78dad919948b7c4fbdd856c0872496d8e4650b393fdd5ac5d0314389', 'E_WP503_INVENTORY_SUPPLEMENT_PREDECESSOR');
  assert(supplement.value.bindings.terminalVerifierDigest === sha256(fs.readFileSync('scripts/ops/r24/wp503-terminal-verifier.mjs')) && supplement.value.bindings.terminalCarrierTestDigest === sha256(fs.readFileSync('test/contracts/r24-wp503-terminal-carriers.contract.test.mjs')), 'E_WP503_INVENTORY_SUPPLEMENT_BYTES');
  assert(supplement.value.currentLease.fencingCounter === 67 && supplement.value.currentLease.status === 'ACTIVE' && supplement.value.currentLease.wip === 1 && supplement.value.targetLease.status === 'RELEASED' && supplement.value.targetLease.wip === 0, 'E_WP503_INVENTORY_SUPPLEMENT_LEASE');
  assert(supplement.value.programDone === false && supplement.value.nextGraphNodeStarted === false, 'E_WP503_INVENTORY_SUPPLEMENT_PROGRAM_STATE');

  return {
    ...predecessor,
    schemaVersion: 'YALKEN_R24_WP503_TERMINAL_CARRIERS_VERIFICATION_V4',
    authorityDigest: authority.digest,
    stageInstanceDigest: instance.digest,
    stageAdmissionDigest: admission.digest,
    localInventoryFailureDigest: failure.digest,
    testInventorySuccessorDigest: successor.digest,
    auditR2RegistryDigest: auditR2Registry.digest,
    testInventoryDigest: testInventory.digest,
    terminalSupplementDigest: supplement.digest,
    currentLease: supplement.value.currentLease,
    targetLease: supplement.value.targetLease,
    futureUtcOracle: 'PASS',
    auditR2RegistryOracle: 'PASS',
    testInventoryOracle: 'PASS',
    programDone: false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (process.argv[2] !== '--check') fail('E_WP503_USAGE', '--check');
    process.stdout.write(`${JSON.stringify(verifyWp503TerminalCarriers())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ code: error.code ?? 'E_WP503_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
