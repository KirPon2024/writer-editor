#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';

const ROOT = 'docs/OPS/R24';
const C = `${ROOT}/CORRECTIVE`;
const E = `${ROOT}/EVIDENCE`;
const PATHS = Object.freeze({
  authority: `${C}/WP503_MAIN_PRODUCT_OWNER_AUTHORITY_AMENDMENT_V4.json`,
  selection: `${C}/WP503_MAIN_PRODUCT_SELECTION_RECEIPT_V1.json`,
  instance: `${C}/WP503_MAIN_PRODUCT_STAGE_INSTANCE_V4.json`,
  admission: `${C}/WP503_MAIN_PRODUCT_STAGE_ADMISSION_ATTESTATION_V4.json`,
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
  wordingSuccessor: `${C}/WP307_EDITOR_WORDING_SUCCESSOR_V1.json`,
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

export function verifyWp503TerminalCarriers() {
  const authority = read(PATHS.authority), selection = read(PATHS.selection), instance = read(PATHS.instance), admission = read(PATHS.admission);
  const before = read(PATHS.before), after = read(PATHS.after), matrix = read(PATHS.matrix), effective = read(PATHS.effective);
  const registry = read(PATHS.registry), release = read(PATHS.release), receipt = read(PATHS.receipt), ctr = read(PATHS.ctr), claims = read(PATHS.claims), toolchainSuccessor = read(PATHS.toolchainSuccessor), wordingSuccessor = read(PATHS.wordingSuccessor);

  assert(authority.digest === admission.value.authorityDigest, 'E_WP503_AUTHORITY_DIGEST');
  assert(instance.digest === admission.value.stageInstanceDigest, 'E_WP503_INSTANCE_DIGEST');
  assert(authority.value.stageId === 'WP-503_ATLAS_SURFACE' && instance.value.stageId === authority.value.stageId && admission.value.stageId === authority.value.stageId, 'E_WP503_STAGE_ID');
  assert(instance.value.model === 'gpt-5.6-sol' && instance.value.reasoningEffort === 'xhigh', 'E_WP503_RUNTIME');
  assert(instance.value.baseSha === '3157d84126a76734af50d012b359f7a58b2035fb' && instance.value.treeSha === '7f38243ced17ee249f0c541004171235a1e14788', 'E_WP503_BASE_IDENTITY');
  assert(instance.value.lease.fencingCounter === 66 && instance.value.lease.status === 'ACTIVE' && instance.value.lease.wip === 1, 'E_WP503_ACTIVE_LEASE');
  for (const value of [authority.value, instance.value, admission.value, selection.value.sourcePlanRoles, matrix.value.sourcePlanRoles, effective.value.sourcePlanRoles, registry.value.sourcePlanRoles, release.value.sourcePlanRoles, receipt.value.sourcePlanRoles, ctr.value.sourcePlanRoles]) sourceRolesExact(value, value.schemaVersion);

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
  assert(selection.value.stageId === 'WP-503_ATLAS_SURFACE' && selection.value.exactBase.sha === instance.value.baseSha && selection.value.exactBase.tree === instance.value.treeSha, 'E_WP503_SELECTION_BINDING');
  assert(selection.value.predecessor.externalTerminalReceiptDigest === WP502_EXTERNAL_RECEIPT && selection.value.predecessor.externalVerificationDigest === WP502_EXTERNAL_VERIFICATION, 'E_WP503_SELECTION_PREDECESSOR');
  assert(predecessorById.get('WP502_EXTERNAL_TERMINAL_RECEIPT')?.digest === WP502_EXTERNAL_RECEIPT, 'E_WP503_WP502_EXTERNAL_RECEIPT');
  assert(predecessorById.get('WP502_EXTERNAL_VERIFICATION')?.digest === WP502_EXTERNAL_VERIFICATION, 'E_WP503_WP502_EXTERNAL_VERIFICATION');

  assert(instance.value.operations.modifyPaths.includes('src/renderer/editor.bundle.js'), 'E_WP503_TRACKED_BUNDLE_UNADMITTED');
  assert(instance.value.acceptanceSignals.includes('TRACKED_RENDERER_BUNDLE_EXACT_BUILD'), 'E_WP503_TRACKED_BUNDLE_SIGNAL');
  assert(instance.value.operations.modifyPaths.includes('scripts/ops/r24/corrective/post-audit-toolchain.mjs') && instance.value.operations.createPaths.includes(PATHS.toolchainSuccessor), 'E_WP503_TOOLCHAIN_SUCCESSOR_UNADMITTED');
  assert(instance.value.acceptanceSignals.includes('POST_AUDIT_TOOLCHAIN_TRACKED_BUNDLE_SUCCESSOR'), 'E_WP503_TOOLCHAIN_SUCCESSOR_SIGNAL');
  assert(toolchainSuccessor.value.historicalContract.sha256 === '90197c119af8bb9923437217a89514524769824d19306cd1fa801e6ca68e2fbe' && toolchainSuccessor.value.successor.editorBundleSha256 === sha256(fs.readFileSync('src/renderer/editor.bundle.js')), 'E_WP503_TOOLCHAIN_SUCCESSOR_BINDING');
  assert(instance.value.operations.modifyPaths.includes('test/unit/r24-wp307-writer-local-profile-integration.test.js') && instance.value.operations.createPaths.includes(PATHS.wordingSuccessor), 'E_WP503_WORDING_SUCCESSOR_UNADMITTED');
  assert(instance.value.acceptanceSignals.includes('WP307_EDITOR_WORDING_HASH_SUCCESSOR'), 'E_WP503_WORDING_SUCCESSOR_SIGNAL');
  assert(wordingSuccessor.value.historicalRegistry.sha256 === '9064441a85e1ce2758ef018cdb82c76229e921cb1adeea844792e102ee96cba2' && wordingSuccessor.value.successor.editorSourceSha256 === `sha256:${sha256(fs.readFileSync('src/renderer/editor.js'))}`, 'E_WP503_WORDING_SUCCESSOR_BINDING');
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
  for (const artifact of claims.value.implementationArtifactDigests) assert(sha256(fs.readFileSync(artifact.path)) === artifact.sha256, 'E_WP503_IMPLEMENTATION_DIGEST', artifact.path);
  const compiledProgramBinding = claims.value.implementationArtifactDigests.find((artifact) => artifact.path === `${C}/R24_CORRECTIVE_PROGRAM_V1_1.json`);
  assert(compiledProgramBinding?.sha256 === COMPILED_PROGRAM && compiledProgramBinding.terms.some((term) => term.includes(EXTERNAL_SOURCE)), 'E_WP503_SOURCE_ROLE_CLAIM_BINDING');

  assert(matrix.value.status === 'CONDITIONAL_PASS_PENDING_EXTERNAL_DELIVERY' && matrix.value.localPassedRowCount === 21 && matrix.value.externalPredicateRowCount === 4 && matrix.value.failedRowCount === 0 && matrix.value.pendingRowCount === 0, 'E_WP503_MATRIX_STATE');
  assert(matrix.value.rows.length === 25 && matrix.value.rows.filter((row) => row.status === 'PASS').length === 21 && matrix.value.rows.filter((row) => row.status === 'REQUIRED_EXTERNAL_PREDICATE').length === 4, 'E_WP503_MATRIX_DENOMINATOR');
  assert(matrix.value.bindings.claimBindingDigest === claims.digest && matrix.value.bindings.protectedWipAfterDigest === after.digest, 'E_WP503_MATRIX_BINDING');
  assert(effective.value.status === 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_PREDICATES' && effective.value.bindings.acceptanceMatrixDigest === matrix.digest, 'E_WP503_EFFECTIVE_STATE');
  assert(effective.value.currentCounts.DONE === 58 && effective.value.currentCounts.PENDING === 38 && effective.value.targetCounts.DONE === 59 && effective.value.targetCounts.PENDING === 37, 'E_WP503_GRAPH_COUNTS');
  assert(registry.value.status === 'CONDITIONAL_CERTIFIED_DONE' && registry.value.bindings.acceptanceMatrixDigest === matrix.digest && registry.value.bindings.effectiveStateDigest === effective.digest, 'E_WP503_REGISTRY');
  assert(release.value.status === 'ADMITTED_CONDITIONAL_RELEASE' && release.value.currentLease.status === 'ACTIVE' && release.value.currentLease.wip === 1 && release.value.targetLease.status === 'RELEASED' && release.value.targetLease.wip === 0, 'E_WP503_RELEASE_STATE');
  assert(release.value.bindings.authorityDigest === authority.digest && release.value.bindings.stageInstanceDigest === instance.digest && release.value.bindings.stageAdmissionDigest === admission.digest, 'E_WP503_RELEASE_ADMISSION_BINDING');
  assert(release.value.bindings.acceptanceMatrixDigest === matrix.digest && release.value.bindings.effectiveStateDigest === effective.digest && release.value.bindings.stageRegistryDigest === registry.digest && release.value.bindings.protectedWipBeforeDigest === before.digest && release.value.bindings.protectedWipAfterDigest === after.digest, 'E_WP503_RELEASE_BINDING');
  assert(receipt.value.status === 'CONDITIONAL_CERTIFIED_DONE_PENDING_EXTERNAL_DELIVERY' && receipt.value.bindings.acceptanceMatrixDigest === matrix.digest && receipt.value.bindings.effectiveStateDigest === effective.digest && receipt.value.bindings.stageRegistryDigest === registry.digest && receipt.value.bindings.leaseReleaseDigest === release.digest, 'E_WP503_RECEIPT_BINDING');
  assert(receipt.value.externalDeliveryPredicates.length === 4 && receipt.value.externalDeliveryPredicates.every((predicate) => predicate.status === 'REQUIRED_NOT_PRECLAIMED' && predicate.providerIdentity === null), 'E_WP503_EXTERNAL_PRECLAIM');
  assert(receipt.value.predecessors.wp502ExternalTerminalReceiptDigest === WP502_EXTERNAL_RECEIPT && receipt.value.predecessors.wp502ExternalVerificationDigest === WP502_EXTERNAL_VERIFICATION, 'E_WP503_RECEIPT_PREDECESSOR');
  assert(receipt.value.predecessorCorrections.pr1776.candidateSha === '77354cfe994588dc1771f3eded29d1e7e68d703f' && receipt.value.predecessorCorrections.pr1777.candidateSha === 'bf3d21072879d276ca3489b0bbead780fb39f596', 'E_WP503_PREDECESSOR_LABELS');
  assert(ctr.value.conditionalTerminalRule.ruleId === 'SINGLE_TERMINAL_PR_RULE_V1' && ctr.value.graphAdvance === false, 'E_WP503_CTR_RULE');
  for (const value of [matrix.value, effective.value, registry.value, release.value, receipt.value, ctr.value]) assert(value.programDone === false, 'E_WP503_PROGRAM_DONE');
  assert(receipt.value.nextGraphNodeStarted === false && receipt.value.nonClaims.includes('NO_MAIN_PRODUCT_GRAPH_NODE_AFTER_WP503_STARTED'), 'E_WP503_NEXT_NODE_OVERCLAIM');
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
    evidenceStampDenominator: evidenceFiles.length,
    localPassedRows: 21,
    externalPredicateRows: 4,
    currentLease: release.value.currentLease,
    targetLease: release.value.targetLease,
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
