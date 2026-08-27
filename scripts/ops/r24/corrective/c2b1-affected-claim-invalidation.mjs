#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes, canonicalize, sha256 } from './canonical-json.mjs';

export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const C2A_TERMINAL_ATTESTATION_DIGEST = '33519cc33e49719dc0fd8ce4e9f20880dbcefc9436824a96a787308c4563fce6';
export const C2A_EVALUATION_SHA = '5cee58a493d227dfa8b50a68903784f9cefee59b';
export const C2A_EVALUATION_TREE_SHA = '250b20fa540a672fe9b20f9d7c687d6b2c100d4e';
export const OBSERVED_AT_UTC = '2026-08-27T23:16:54.000Z';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C2B1_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  c2aBindings: 'docs/OPS/R24/CORRECTIVE/C2A_EFFECTIVE_CERTIFICATION_CLAIM_BINDINGS_V1.json',
  c2aCurrent: 'docs/OPS/R24/CORRECTIVE/C2A_CURRENT_CERTIFICATION_SET_V1.json',
  c2aHistorical: 'docs/OPS/R24/CORRECTIVE/C2A_HISTORICAL_RECEIPT_MANIFEST_V1.json',
  c2aLedger: 'docs/OPS/R24/CORRECTIVE/C2A_CORRECTION_LEDGER_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C2B1_AFFECTED_CLAIM_INVALIDATION_CONTRACT_V1.json',
  executableProgram: 'docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  ledger: 'docs/OPS/R24/CORRECTIVE/C2B1_INVALIDATION_LEDGER_V1.json',
  map: 'docs/OPS/R24/CORRECTIVE/C2B1_AFFECTED_CLAIM_MAP_V1.json',
  programTemplate: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  script: 'scripts/ops/r24/corrective/c2b1-affected-claim-invalidation.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C2B1_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C2B1_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c2b1-affected-claim-invalidation.contract.test.mjs'
});

const DEFECT_DEFINITIONS = Object.freeze([
  Object.freeze({
    defectClass: 'WP-201',
    dependencyRule: 'TRANSITIVE_DESCENDANTS_INCLUDING_ROOTS',
    pathlessCapabilityIds: Object.freeze(['CAP_R24_REPRO_WP201_BROKEN_COMMIT_METADATA']),
    rootNodeIds: Object.freeze(['WP-201_PROJECT_TRANSACTION'])
  }),
  Object.freeze({
    defectClass: 'MIGRATION',
    dependencyRule: 'TRANSITIVE_DESCENDANTS_INCLUDING_ROOTS',
    pathlessCapabilityIds: Object.freeze(['CAP_R24_REPRO_MIGRATION_STALE_TARGET']),
    rootNodeIds: Object.freeze(['R6_MIGRATION_HISTORY_BACKUP_GC'])
  }),
  Object.freeze({
    defectClass: 'TEXT_FOLD',
    dependencyRule: 'TRANSITIVE_DESCENDANTS_INCLUDING_ROOTS',
    pathlessCapabilityIds: Object.freeze(['CAP_R24_REPRO_TEXT_FOLD_PREFIX_OFFSET']),
    rootNodeIds: Object.freeze(['T0_TEXT_COORDINATE_ALGEBRA', 'WP-205_PATH_AND_TEXT'])
  }),
  Object.freeze({
    defectClass: 'WRITER_HOME',
    dependencyRule: 'TRANSITIVE_DESCENDANTS_INCLUDING_ROOTS',
    pathlessCapabilityIds: Object.freeze(['CAP_R24_REPRO_WRITER_HOME_COMPUTED_STYLE']),
    rootNodeIds: Object.freeze(['WP-300_WRITER_HOME'])
  }),
  Object.freeze({
    defectClass: 'IPC',
    dependencyRule: 'TRANSITIVE_DESCENDANTS_INCLUDING_ROOTS',
    pathlessCapabilityIds: Object.freeze(['CAP_R24_REPRO_IPC_STRUCTURED_URL_FRESHNESS']),
    rootNodeIds: Object.freeze(['S0_IPC_CALLER_IDENTITY', 'WP-101_IPC_ADMISSION'])
  }),
  Object.freeze({
    defectClass: 'STALE_OR_MUTABLE_EVIDENCE',
    dependencyRule: 'ALL_HISTORICAL_CLAIMS',
    pathlessCapabilityIds: Object.freeze(['CAP_R24_REPRO_STALE_MUTABLE_EVIDENCE']),
    rootNodeIds: Object.freeze([])
  }),
  Object.freeze({
    defectClass: 'CI_OMISSION',
    dependencyRule: 'ALL_HISTORICAL_CLAIMS',
    pathlessCapabilityIds: Object.freeze(['CAP_R24_REPRO_CI_OMITTED_REQUIRED_LANES']),
    rootNodeIds: Object.freeze([])
  }),
  Object.freeze({
    defectClass: 'NON_HERMETIC_BUILD',
    dependencyRule: 'ALL_HISTORICAL_CLAIMS',
    pathlessCapabilityIds: Object.freeze(['CAP_R24_REPRO_NON_HERMETIC_TOOLCHAIN']),
    rootNodeIds: Object.freeze([])
  })
]);

const EXPECTED_AFFECTED_COUNTS = Object.freeze({
  'CI_OMISSION': 37,
  'IPC': 36,
  'MIGRATION': 21,
  'NON_HERMETIC_BUILD': 37,
  'STALE_OR_MUTABLE_EVIDENCE': 37,
  'TEXT_FOLD': 22,
  'WP-201': 16,
  'WRITER_HOME': 9
});

export class InvalidationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) {
  throw new InvalidationError(code, detail);
}

function assert(condition, code, detail) {
  if (!condition) fail(code, detail);
}

function lexical(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rawSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, digest: rawSha256(bytes), value };
}

function sortedUnique(values, field) {
  assert(Array.isArray(values), 'E_SCHEMA', field);
  const sorted = [...values].sort(lexical);
  assert(JSON.stringify(values) === JSON.stringify(sorted), 'E_ORDER', field);
  assert(new Set(values).size === values.length, 'E_DUPLICATE', field);
}

function sourceEvidenceStampId(contourId) {
  if (contourId === 'B0_OBSERVED_EVIDENCE_CLAIM_COMPILER_REPAIR_V1') {
    return 'ES-R24-B0-OBSERVED-EVIDENCE-CLAIM-COMPILER';
  }
  return `ES-R24-${contourId.replaceAll('_', '-')}-CLAIM-BINDINGS`;
}

function graphIndex(program) {
  assert(Array.isArray(program.nodes), 'E_PROGRAM_GRAPH', 'nodes');
  const nodesById = new Map();
  const children = new Map();
  for (const node of program.nodes) {
    assert(typeof node.id === 'string' && node.id.length > 0, 'E_PROGRAM_NODE', 'id');
    assert(!nodesById.has(node.id), 'E_PROGRAM_NODE_DUPLICATE', node.id);
    nodesById.set(node.id, node);
    children.set(node.id, []);
  }
  for (const node of program.nodes) {
    assert(Array.isArray(node.dependsOn), 'E_PROGRAM_DEPENDENCIES', node.id);
    for (const dependency of node.dependsOn) {
      assert(nodesById.has(dependency), 'E_PROGRAM_DEPENDENCY_MISSING', `${node.id}:${dependency}`);
      children.get(dependency).push(node.id);
    }
  }
  for (const values of children.values()) values.sort(lexical);
  return { children, nodesById };
}

function transitiveClosure(index, roots) {
  const seen = new Set();
  const queue = [];
  for (const root of roots) {
    assert(index.nodesById.has(root), 'E_DEFECT_ROOT_MISSING', root);
    if (!seen.has(root)) {
      seen.add(root);
      queue.push(root);
    }
  }
  while (queue.length > 0) {
    const current = queue.shift();
    for (const child of index.children.get(current) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return [...seen].sort(lexical);
}

function validateRawInputs(inputs) {
  assert(inputs.programTemplate.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', inputs.programTemplate.digest);
  const mandatory = inputs.programTemplate.value.contracts?.affectedClaimInvalidation?.mandatoryDefects;
  assert(Array.isArray(mandatory), 'E_MANDATORY_DEFECTS', 'missing');
  assert(JSON.stringify(mandatory) === JSON.stringify(DEFECT_DEFINITIONS.map((entry) => entry.defectClass)), 'E_MANDATORY_DEFECTS', JSON.stringify(mandatory));
  assert(inputs.programTemplate.value.contracts.affectedClaimInvalidation.rawDoneMutationForbidden === true, 'E_RAW_MUTATION_POLICY', 'program template');
  assert(inputs.programTemplate.value.contracts.affectedClaimInvalidation.rule === 'EVERY_REPRODUCED_DEFECT_INVALIDATES_ALL_DEPENDENT_CLAIMS_UNLESS_INDEPENDENT_CURRENT_PROOF_EXISTS', 'E_INVALIDATION_RULE', 'program template');
  assert(inputs.c2aHistorical.value.sourceCount === 37 && inputs.c2aHistorical.value.receipts.length === 37, 'E_HISTORICAL_COUNT', inputs.c2aHistorical.value.sourceCount);
  sortedUnique(inputs.c2aHistorical.value.sourceEvidenceStampIds, 'sourceEvidenceStampIds');
  const bindingByReceipt = new Map(inputs.c2aBindings.value.historicalBindings.map((entry) => [entry.receiptId, entry]));
  assert(bindingByReceipt.size === 37, 'E_BINDING_COUNT', bindingByReceipt.size);
  for (const receipt of inputs.c2aHistorical.value.receipts) {
    const source = readJsonBytes(inputs.repoRoot, receipt.repoRelativePath);
    assert(source.digest === receipt.sourceSha256 && source.bytes.length === receipt.sourceByteLength, 'E_RAW_RECEIPT_MUTATED', receipt.receiptId);
    const binding = bindingByReceipt.get(receipt.receiptId);
    assert(binding, 'E_BINDING_MISSING', receipt.receiptId);
    assert(binding.rawReceiptDigest === receipt.sourceSha256, 'E_RAW_BINDING_DIGEST', receipt.receiptId);
    const expectedRaw = receipt.rawStates.mergeState === 'MERGED' && receipt.rawStates.postmergeState === 'PASS' && receipt.rawStates.survivorState === 'PASS'
      ? 'DONE'
      : receipt.rawStates.mergeState === 'WAITING' && receipt.rawStates.postmergeState === 'PENDING' && receipt.rawStates.survivorState === 'PENDING'
        ? 'PENDING'
        : null;
    assert(expectedRaw !== null, 'E_RAW_STATE_UNCLASSIFIED', receipt.receiptId);
    assert(binding.rawState === expectedRaw && binding.effectiveState === expectedRaw, 'E_RAW_EFFECTIVE_DRIFT', receipt.receiptId);
    assert(binding.certifiedState === (expectedRaw === 'DONE' ? 'DONE_UNCERTIFIED' : 'PENDING_UNCERTIFIED'), 'E_CERTIFIED_STATE_DRIFT', receipt.receiptId);
    const stampId = sourceEvidenceStampId(receipt.contourId);
    assert(inputs.c2aHistorical.value.sourceEvidenceStampIds.includes(stampId), 'E_SOURCE_EVIDENCE_STAMP_MISSING', stampId);
  }
  assert(inputs.c2aCurrent.value.certifications.every((entry) => entry.status === 'VERIFIED'), 'E_CURRENT_PROOF_INVALID', 'control certification');
  assert(inputs.c2aCurrent.value.certifications.every((entry) => !bindingByReceipt.has(entry.stageId)), 'E_HISTORY_CURRENT_CONFLATION', 'stageId');
  assert(inputs.c2aLedger.value.corrections.length > 0, 'E_C2A_LEDGER_EMPTY', PATHS.c2aLedger);
  return bindingByReceipt;
}

export function loadInputs(repoRoot = process.cwd()) {
  return {
    c2aBindings: readJsonBytes(repoRoot, PATHS.c2aBindings, true),
    c2aCurrent: readJsonBytes(repoRoot, PATHS.c2aCurrent, true),
    c2aHistorical: readJsonBytes(repoRoot, PATHS.c2aHistorical, true),
    c2aLedger: readJsonBytes(repoRoot, PATHS.c2aLedger, true),
    executableProgram: readJsonBytes(repoRoot, PATHS.executableProgram),
    programTemplate: readJsonBytes(repoRoot, PATHS.programTemplate, true),
    repoRoot
  };
}

function buildDefectRows(inputs, bindingByReceipt) {
  const index = graphIndex(inputs.executableProgram.value);
  const allClaimIds = inputs.c2aHistorical.value.receipts.map((entry) => entry.receiptId).sort(lexical);
  const receiptById = new Map(inputs.c2aHistorical.value.receipts.map((entry) => [entry.receiptId, entry]));
  return DEFECT_DEFINITIONS.map((definition) => {
    const reachableNodeIds = definition.dependencyRule === 'ALL_HISTORICAL_CLAIMS'
      ? inputs.executableProgram.value.nodes.map((entry) => entry.id).sort(lexical)
      : transitiveClosure(index, definition.rootNodeIds);
    const reachable = new Set(reachableNodeIds);
    const affectedClaimIds = definition.dependencyRule === 'ALL_HISTORICAL_CLAIMS'
      ? [...allClaimIds]
      : allClaimIds.filter((claimId) => reachable.has(receiptById.get(claimId).contourId));
    const invalidatedDoneClaimIds = affectedClaimIds.filter((claimId) => bindingByReceipt.get(claimId).effectiveState === 'DONE');
    const pendingNoDoneClaimIds = affectedClaimIds.filter((claimId) => bindingByReceipt.get(claimId).effectiveState === 'PENDING');
    assert(affectedClaimIds.length === EXPECTED_AFFECTED_COUNTS[definition.defectClass], 'E_AFFECTED_COUNT', `${definition.defectClass}:${affectedClaimIds.length}`);
    return {
      affectedClaimCount: affectedClaimIds.length,
      affectedClaimIds,
      affectedClaimSetDigest: sha256(canonicalBytes(affectedClaimIds)),
      defectClass: definition.defectClass,
      dependencyRule: definition.dependencyRule,
      independentProofExceptions: [],
      invalidatedDoneClaimCount: invalidatedDoneClaimIds.length,
      invalidatedDoneClaimIds,
      pathlessCapabilityIds: [...definition.pathlessCapabilityIds],
      pendingNoDoneClaimCount: pendingNoDoneClaimIds.length,
      pendingNoDoneClaimIds,
      reachableNodeCount: reachableNodeIds.length,
      reachableNodeSetDigest: sha256(canonicalBytes(reachableNodeIds)),
      reproductionAuthority: {
        classification: 'OWNER_RATIFIED_REPRODUCED_DEFECT_CLASS',
        programTemplateDigest: PROGRAM_TEMPLATE_DIGEST
      },
      rootNodeIds: [...definition.rootNodeIds]
    };
  });
}

function buildClaimRows(inputs, bindingByReceipt, defects) {
  const defectsByClaim = new Map();
  for (const defect of defects) {
    for (const claimId of defect.affectedClaimIds) {
      const values = defectsByClaim.get(claimId) ?? [];
      values.push(defect.defectClass);
      defectsByClaim.set(claimId, values);
    }
  }
  return inputs.c2aHistorical.value.receipts
    .map((receipt) => {
      const binding = bindingByReceipt.get(receipt.receiptId);
      const invalidatedByDefectClasses = [...(defectsByClaim.get(receipt.receiptId) ?? [])].sort(lexical);
      assert(invalidatedByDefectClasses.length > 0, 'E_CLAIM_NOT_CLASSIFIED', receipt.receiptId);
      const isDone = binding.effectiveState === 'DONE';
      return {
        certifiedStateAfter: isDone ? 'DONE_UNCERTIFIED_INVALIDATED' : 'PENDING_UNCERTIFIED',
        certifiedStateBefore: binding.certifiedState,
        claimId: receipt.receiptId,
        contourId: receipt.contourId,
        effectiveState: binding.effectiveState,
        effectiveStateMutated: false,
        independentProofException: null,
        invalidatedByDefectClasses,
        invalidationDisposition: isDone ? 'CERTIFICATION_AUTHORITY_INVALIDATED' : 'NO_DONE_CLAIM_TO_INVALIDATE',
        rawReceiptDigest: receipt.sourceSha256,
        rawState: binding.rawState,
        rawStateMutated: false,
        sourceEvidenceStampId: sourceEvidenceStampId(receipt.contourId)
      };
    })
    .sort((left, right) => lexical(left.claimId, right.claimId));
}

function buildContract(inputs) {
  return {
    canonicalSerialization: {
      digest: 'SHA-256_EXACT_BYTES',
      encoding: 'UTF-8',
      lineEnding: 'LF',
      objectKeys: 'LEXICOGRAPHIC_ASCENDING_RECURSIVE',
      trailingNewline: true
    },
    c2aTerminalDependency: {
      evaluationSha: C2A_EVALUATION_SHA,
      evaluationTreeSha: C2A_EVALUATION_TREE_SHA,
      externalArtifactDigest: 'sha256:faa1328028588a04b6674db31784fad4e95952b6dc70018ed5a07edadb6ed07a',
      externalArtifactId: 9668171862,
      externalRunId: 33125503079,
      status: 'VERIFIED',
      terminalAttestationBytesDigest: C2A_TERMINAL_ATTESTATION_DIGEST,
      trustModelDigest: TRUST_MODEL_DIGEST
    },
    compilerId: 'YALKEN_R24_C2B1_AFFECTED_CLAIM_INVALIDATION_COMPILER_V1',
    compilerPath: PATHS.script,
    defectDefinitions: DEFECT_DEFINITIONS.map((entry) => deepClone(entry)),
    independentProofRule: {
      exactCurrentExternalTerminalAttestationRequired: true,
      missingOrInvalidProof: 'NO_EXCEPTION',
      selfIssuedOrHistoricalReceiptAccepted: false
    },
    invalidationRule: 'EVERY_REPRODUCED_DEFECT_INVALIDATES_ALL_DEPENDENT_CLAIMS_UNLESS_INDEPENDENT_CURRENT_PROOF_EXISTS',
    outputPaths: {
      affectedClaimMap: PATHS.map,
      invalidationLedger: PATHS.ledger
    },
    ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    privacy: {
      localRecoveryPathsPublished: false,
      publicEvidenceFields: ['PATHLESS_CAPABILITY_IDS', 'ROLES', 'DIGESTS']
    },
    productionSnapshot: {
      headSha: C2A_EVALUATION_SHA,
      treeSha: C2A_EVALUATION_TREE_SHA
    },
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    rawAndEffectiveState: {
      effectiveLifecycleMutationForbidden: true,
      rawDoneMutationForbidden: true,
      sourceHistoricalManifestDigest: inputs.c2aHistorical.digest
    },
    schemaVersion: 'YALKEN_R24_C2B1_AFFECTED_CLAIM_INVALIDATION_CONTRACT_V1',
    sourceBindings: {
      c2aClaimBindingsDigest: inputs.c2aBindings.digest,
      c2aCorrectionLedgerDigest: inputs.c2aLedger.digest,
      c2aCurrentCertificationSetDigest: inputs.c2aCurrent.digest,
      executableProgramDigest: inputs.executableProgram.digest
    },
    sourceEvidenceStampIds: [...inputs.c2aHistorical.value.sourceEvidenceStampIds],
    stageId: 'C2B1'
  };
}

function entryWithDigest(entry) {
  return { ...entry, entryDigest: sha256(canonicalBytes(entry)) };
}

function buildLedger(inputs, defects) {
  const c2aTail = inputs.c2aLedger.value.corrections.at(-1);
  assert(c2aTail && typeof c2aTail.entryDigest === 'string', 'E_C2A_LEDGER_TAIL', 'missing');
  let predecessorEntryDigest = c2aTail.entryDigest;
  const entries = defects.map((defect, index) => {
    const entry = entryWithDigest({
      affectedClaimCount: defect.affectedClaimCount,
      affectedClaimSetDigest: defect.affectedClaimSetDigest,
      correctionId: `C2B1-INVALIDATION-${String(index + 1).padStart(4, '0')}`,
      defectClass: defect.defectClass,
      effect: 'RAW_AND_EFFECTIVE_LIFECYCLE_UNCHANGED_CERTIFICATION_AUTHORITY_INVALIDATED_FOR_DEPENDENT_DONE_CLAIMS',
      independentProofExceptionCount: defect.independentProofExceptions.length,
      operation: 'INVALIDATE_CERTIFICATION_AUTHORITY_FOR_AFFECTED_DEPENDENT_CLAIMS',
      predecessorEntryDigest,
      rawMutationForbidden: true,
      sequence: c2aTail.sequence + index + 1
    });
    predecessorEntryDigest = entry.entryDigest;
    return entry;
  });
  return {
    c2aPredecessor: {
      correctionLedgerDigest: inputs.c2aLedger.digest,
      tailEntryDigest: c2aTail.entryDigest,
      tailSequence: c2aTail.sequence
    },
    entries,
    finalEntryDigest: entries.at(-1).entryDigest,
    ledgerId: 'YALKEN_R24_C2B1_AFFECTED_CLAIM_INVALIDATION_LEDGER_V1',
    ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    rawMutationForbidden: true,
    schemaVersion: 'YALKEN_R24_C2B1_INVALIDATION_LEDGER_V1'
  };
}

export function buildArtifacts(inputs = loadInputs()) {
  const bindingByReceipt = validateRawInputs(inputs);
  const defects = buildDefectRows(inputs, bindingByReceipt);
  const claims = buildClaimRows(inputs, bindingByReceipt, defects);
  const contract = buildContract(inputs);
  const ledger = buildLedger(inputs, defects);
  const rawDone = claims.filter((entry) => entry.rawState === 'DONE').length;
  const rawPending = claims.filter((entry) => entry.rawState === 'PENDING').length;
  const map = {
    claims,
    counts: {
      affectedByAtLeastOneDefect: claims.filter((entry) => entry.invalidatedByDefectClasses.length > 0).length,
      historicalClaims: claims.length,
      independentProofExceptions: 0,
      invalidatedDoneClaims: claims.filter((entry) => entry.certifiedStateAfter === 'DONE_UNCERTIFIED_INVALIDATED').length,
      rawDoneClaims: rawDone,
      rawPendingClaims: rawPending
    },
    defects,
    independentProofExceptions: [],
    productionSnapshot: deepClone(contract.productionSnapshot),
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    schemaVersion: 'YALKEN_R24_C2B1_AFFECTED_CLAIM_MAP_V1',
    sourceBindings: {
      c2aClaimBindingsDigest: inputs.c2aBindings.digest,
      c2aCurrentCertificationSetDigest: inputs.c2aCurrent.digest,
      c2aHistoricalReceiptManifestDigest: inputs.c2aHistorical.digest,
      contractDigest: sha256(canonicalBytes(contract)),
      executableProgramDigest: inputs.executableProgram.digest
    },
    sourceEvidenceStampIds: [...inputs.c2aHistorical.value.sourceEvidenceStampIds],
    stageId: 'C2B1'
  };
  assert(rawDone === 33 && rawPending === 4, 'E_RAW_COUNTS', `${rawDone}/${rawPending}`);
  assert(map.counts.invalidatedDoneClaims === 33, 'E_INVALIDATED_DONE_COUNT', map.counts.invalidatedDoneClaims);
  assert(map.counts.affectedByAtLeastOneDefect === 37, 'E_AFFECTED_CLAIM_MAP_INCOMPLETE', map.counts.affectedByAtLeastOneDefect);
  return { contract, ledger, map };
}

function assertExpected(actual, expected, field) {
  assert(canonicalBytes(actual).equals(canonicalBytes(expected)), 'E_ARTIFACT_SEMANTIC_DRIFT', field);
}

export function validateArtifacts(artifacts, inputs = loadInputs()) {
  const expected = buildArtifacts(inputs);
  assertExpected(artifacts.contract, expected.contract, 'contract');
  assertExpected(artifacts.map, expected.map, 'map');
  assertExpected(artifacts.ledger, expected.ledger, 'ledger');
  return compileResult(expected);
}

function compileResult(artifacts) {
  return {
    counts: deepClone(artifacts.map.counts),
    decision: 'C2B1_AFFECTED_CLAIM_INVALIDATION_VALID',
    defectAffectedCounts: Object.fromEntries(artifacts.map.defects.map((entry) => [entry.defectClass, entry.affectedClaimCount]).sort(([left], [right]) => lexical(left, right))),
    schemaVersion: 'YALKEN_R24_C2B1_AFFECTED_CLAIM_INVALIDATION_RESULT_V1',
    signals: {
      AFFECTED_CLAIM_MAP_COMPLETE: true,
      CI_AND_HERMETIC_DEFECTS_INVALIDATE_DEPENDENTS: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'REQUIRES_POST_MERGE_EXTERNAL_C2B1_ATTESTATION',
      INDEPENDENT_PROOF_EXCEPTION_EXPLICIT: true,
      RAW_DONE_UNCHANGED: true,
      WP201_MIGRATION_TEXT_FOLD_WRITER_HOME_IPC_DEFECTS_INVALIDATE_DEPENDENTS: true
    },
    status: 'PASS'
  };
}

function writeCanonical(repoRoot, relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value));
}

function approvedPaths() {
  return [
    PATHS.contract,
    PATHS.inventory,
    PATHS.ledger,
    PATHS.map,
    PATHS.script,
    PATHS.stageAdmission,
    PATHS.stageInstance,
    PATHS.test
  ].sort(lexical);
}

function approvalForPath(repoRoot, filePath, rationale) {
  return {
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath,
    rationale,
    sha256: rawSha256(fs.readFileSync(path.join(repoRoot, filePath)))
  };
}

function buildStageApprovals(repoRoot) {
  const rationale = 'C2B1 exact admitted defect-driven affected-claim invalidation map, append-only invalidation ledger, immutable raw lifecycle preservation, explicit independent-proof exception rule, and semantic falsification tests; no product truth mutation or semantic scope expansion.';
  return {
    approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)),
    version: 'v1.0'
  };
}

function isOwnActiveApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry?.rationale === 'string'
    && entry.rationale.startsWith('C2B1 exact admitted affected-claim invalidation under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', PATHS.activeApprovals);
  const paths = [...approvedPaths(), PATHS.approvals].sort(lexical);
  const supersededPaths = new Set(paths);
  const baseApprovals = current.approvals.filter((entry) => !isOwnActiveApproval(entry) && !supersededPaths.has(entry.filePath));
  const stageInstanceDigest = rawSha256(fs.readFileSync(path.join(repoRoot, PATHS.stageInstance)));
  const rationale = `C2B1 exact admitted affected-claim invalidation under StageInstance ${stageInstanceDigest}; raw and effective lifecycle state remain immutable and no product truth or semantic scope expands.`;
  return {
    approvals: [...baseApprovals, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))],
    version: current.version
  };
}

function loadGenerated(repoRoot) {
  return {
    contract: readJsonBytes(repoRoot, PATHS.contract, true).value,
    ledger: readJsonBytes(repoRoot, PATHS.ledger, true).value,
    map: readJsonBytes(repoRoot, PATHS.map, true).value
  };
}

function assertExpectedBytes(repoRoot, relativePath, expected) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  assert(bytes.equals(canonicalBytes(expected)), 'E_GENERATED_ARTIFACT_DRIFT', relativePath);
}

export function writeArtifacts(repoRoot = process.cwd()) {
  const inputs = loadInputs(repoRoot);
  const artifacts = buildArtifacts(inputs);
  writeCanonical(repoRoot, PATHS.contract, artifacts.contract);
  writeCanonical(repoRoot, PATHS.map, artifacts.map);
  writeCanonical(repoRoot, PATHS.ledger, artifacts.ledger);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return validateArtifacts(artifacts, inputs);
}

export function checkArtifacts(repoRoot = process.cwd()) {
  const inputs = loadInputs(repoRoot);
  const expected = buildArtifacts(inputs);
  const actual = loadGenerated(repoRoot);
  validateArtifacts(actual, inputs);
  assertExpectedBytes(repoRoot, PATHS.contract, expected.contract);
  assertExpectedBytes(repoRoot, PATHS.map, expected.map);
  assertExpectedBytes(repoRoot, PATHS.ledger, expected.ledger);
  assertExpectedBytes(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  assertExpectedBytes(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(expected);
}

function printResult(result) {
  process.stdout.write(canonicalBytes(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (process.argv.includes('--write')) printResult(writeArtifacts(process.cwd()));
    else if (process.argv.includes('--check')) printResult(checkArtifacts(process.cwd()));
    else fail('E_USAGE', '--write or --check');
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
