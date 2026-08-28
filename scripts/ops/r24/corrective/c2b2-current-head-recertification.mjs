#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes, canonicalize, sha256 } from './canonical-json.mjs';

export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const C2B1_TERMINAL_ATTESTATION_DIGEST = 'f286d216dec199d7756583b5df0bf9d05559360ec5fa37d9af2ebf815ef29fa2';
export const SOURCE_HEAD_SHA = 'e73f8f2cf52f970734593cf1f95cd7cc08103f79';
export const SOURCE_TREE_SHA = 'a6f9aa7119eabf2c74f11fbdd876ca6e40eb8046';
export const STAGE_INSTANCE_DIGEST = 'dcce8351b08478988e156092fcb3c40ad0e82f2eb6ce0e3897f4bf3be4209b46';
export const STAGE_ADMISSION_DIGEST = 'dae5579997cf1d9808800cf9ab48794b395548449b4a8306545a3939b10b346d';
export const OBSERVED_AT_UTC = '2026-08-27T23:55:43.000Z';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C2B2_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  c2aHistorical: 'docs/OPS/R24/CORRECTIVE/C2A_HISTORICAL_RECEIPT_MANIFEST_V1.json',
  c2b1Ledger: 'docs/OPS/R24/CORRECTIVE/C2B1_INVALIDATION_LEDGER_V1.json',
  c2b1Map: 'docs/OPS/R24/CORRECTIVE/C2B1_AFFECTED_CLAIM_MAP_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C2B2_CURRENT_HEAD_RECERTIFICATION_CONTRACT_V1.json',
  evaluation: 'docs/OPS/R24/CORRECTIVE/C2B2_CURRENT_HEAD_EVALUATION_V1.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  ledger: 'docs/OPS/R24/CORRECTIVE/C2B2_RECERTIFICATION_LEDGER_V1.json',
  programTemplate: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  script: 'scripts/ops/r24/corrective/c2b2-current-head-recertification.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C2B2_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C2B2_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c2b2-current-head-recertification.contract.test.mjs'
});

export const CONTOURS = Object.freeze([
  Object.freeze({
    command: 'test:r24-wp104',
    contourId: 'WP-104_BOUNDARY_FALSIFICATION',
    expectedMutationReceipt: Object.freeze({ allScoreOne: true, mutantTotal: 116, suites: 22 }),
    expectedTests: 13,
    receiptId: 'CTR-R24-WP-104-BOUNDARY-FALSIFICATION',
    receiptPath: 'docs/OPS/R24/CTR-R24-WP-104-BOUNDARY-FALSIFICATION.json',
    receiptPrefix: 'R24_WP104_META_RECEIPT',
    testFiles: Object.freeze([
      'test/unit/r24-wp104-boundary-falsification.test.js',
      'test/unit/r24-wp104-evidence-integrity.test.js'
    ])
  }),
  Object.freeze({
    command: 'test:r24-r2',
    contourId: 'R2_STORAGE_BAKEOFF',
    expectedMutationReceipt: Object.freeze({ killed: 6, score: 1, survived: Object.freeze([]), total: 6 }),
    expectedTests: 13,
    receiptId: 'CTR-R24-R2-STORAGE-BAKEOFF',
    receiptPath: 'docs/OPS/R24/CTR-R24-R2-STORAGE-BAKEOFF.json',
    receiptPrefix: 'R24_R2_MUTATION_RECEIPT',
    testFiles: Object.freeze([
      'test/unit/r24-r2-bakeoff-mutants.test.js',
      'test/unit/r24-r2-candidate-physics.test.js',
      'test/unit/r24-r2-storage-bakeoff.test.js'
    ])
  }),
  Object.freeze({
    command: 'test:r24-r3',
    contourId: 'R3_DURABLE_RECOVERY_LEDGER',
    expectedMutationReceipt: Object.freeze({ killed: 5, score: 1, survived: Object.freeze([]), total: 5 }),
    expectedTests: 12,
    receiptId: 'CTR-R24-R3-DURABLE-RECOVERY-LEDGER',
    receiptPath: 'docs/OPS/R24/CTR-R24-R3-DURABLE-RECOVERY-LEDGER.json',
    receiptPrefix: 'R24_R3_MUTATION_RECEIPT',
    testFiles: Object.freeze([
      'test/unit/r24-r3-ledger-mutants.test.js',
      'test/unit/r24-r3-ledger-physics.test.js',
      'test/unit/r24-r3-recovery-ledger.test.js'
    ])
  }),
  Object.freeze({
    command: 'test:r24-r4',
    contourId: 'R4_TRANSACTIONAL_INBOX_OUTBOX',
    expectedMutationReceipt: Object.freeze({ killed: 12, score: 1, survived: Object.freeze([]), total: 12 }),
    expectedTests: 19,
    receiptId: 'CTR-R24-R4-TRANSACTIONAL-INBOX-OUTBOX',
    receiptPath: 'docs/OPS/R24/CTR-R24-R4-TRANSACTIONAL-INBOX-OUTBOX.json',
    receiptPrefix: 'R24_R4_MUTATION_RECEIPT',
    testFiles: Object.freeze([
      'test/unit/r24-r4-inbox-mutants.test.js',
      'test/unit/r24-r4-inbox-outbox.test.js',
      'test/unit/r24-r4-inbox-physics.test.js'
    ])
  })
]);

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.evaluation,
  PATHS.contract,
  PATHS.approvals,
  PATHS.ledger,
  PATHS.stageAdmission,
  PATHS.stageInstance,
  PATHS.script,
  PATHS.test
].sort());

export class RecertificationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) {
  throw new RecertificationError(code, detail);
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, digest: rawSha256(bytes), value };
}

function run(repoRoot, command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 480000
  });
  if (result.error) fail('E_COMMAND_EXECUTION', `${command}:${result.error.message}`);
  return result;
}

function git(repoRoot, args) {
  const result = run(repoRoot, 'git', args);
  assert(result.status === 0, 'E_GIT', `${args.join(' ')}:${String(result.stderr).trim()}`);
  return String(result.stdout).trim();
}

function statusPaths(repoRoot) {
  const result = run(repoRoot, 'git', ['status', '--porcelain=v1', '--untracked-files=all']);
  assert(result.status === 0, 'E_GIT', `status:${String(result.stderr).trim()}`);
  const output = String(result.stdout).trimEnd();
  if (!output) return [];
  return output.split('\n').map((line) => line.slice(3)).map((value) => value.includes(' -> ') ? value.split(' -> ').at(-1) : value).sort(lexical);
}

export function assertSourceIdentity(repoRoot = process.cwd()) {
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', SOURCE_HEAD_SHA);
  const ancestry = run(repoRoot, 'git', ['merge-base', '--is-ancestor', SOURCE_HEAD_SHA, 'HEAD']);
  assert(ancestry.status === 0, 'E_SOURCE_ANCESTRY', git(repoRoot, ['rev-parse', 'HEAD']));
  const changed = statusPaths(repoRoot);
  const writeSet = new Set(WRITE_SET);
  for (const relativePath of changed) assert(writeSet.has(relativePath), 'E_WRITE_SET_EXPANSION', relativePath);
  return {
    currentHeadSha: git(repoRoot, ['rev-parse', 'HEAD']),
    currentTreeSha: git(repoRoot, ['rev-parse', 'HEAD^{tree}']),
    sourceHeadSha: SOURCE_HEAD_SHA,
    sourceTreeSha: SOURCE_TREE_SHA,
    worktreeChangedPaths: changed
  };
}

function parseCount(stdout, field) {
  const matches = [...stdout.matchAll(new RegExp(`^# ${field} ([0-9]+)$`, 'gmu'))];
  assert(matches.length > 0, 'E_TAP_SUMMARY_MISSING', field);
  return Number(matches.at(-1)[1]);
}

function parseReceipt(stdout, prefix) {
  const marker = `# ${prefix}=`;
  const line = stdout.split('\n').find((entry) => entry.startsWith(marker));
  assert(line, 'E_MUTATION_RECEIPT_MISSING', prefix);
  try {
    return JSON.parse(line.slice(marker.length));
  } catch (error) {
    fail('E_MUTATION_RECEIPT_INVALID', `${prefix}:${error.message}`);
  }
}

export function expectedPassResults() {
  return CONTOURS.map((contour) => ({
    cancelled: 0,
    command: `npm run -s ${contour.command}`,
    exitCode: 0,
    fail: 0,
    mutationReceipt: clone(contour.expectedMutationReceipt),
    pass: contour.expectedTests,
    skipped: 0,
    tests: contour.expectedTests,
    todo: 0
  }));
}

export function executeAcceptance(repoRoot = process.cwd()) {
  return CONTOURS.map((contour) => {
    const result = run(repoRoot, 'npm', ['run', '-s', contour.command]);
    const stdout = String(result.stdout || '');
    const stderr = String(result.stderr || '');
    assert(result.status === 0, 'E_ACCEPTANCE_COMMAND_FAILED', `${contour.contourId}:${result.status}:${stderr.slice(-1000)}`);
    const parsed = {
      cancelled: parseCount(stdout, 'cancelled'),
      command: `npm run -s ${contour.command}`,
      exitCode: result.status,
      fail: parseCount(stdout, 'fail'),
      mutationReceipt: parseReceipt(stdout, contour.receiptPrefix),
      pass: parseCount(stdout, 'pass'),
      skipped: parseCount(stdout, 'skipped'),
      tests: parseCount(stdout, 'tests'),
      todo: parseCount(stdout, 'todo')
    };
    assert(canonicalBytes(parsed.mutationReceipt).equals(canonicalBytes(contour.expectedMutationReceipt)), 'E_MUTATION_RECEIPT_MISMATCH', contour.contourId);
    assert(parsed.tests === contour.expectedTests && parsed.pass === contour.expectedTests, 'E_TEST_DENOMINATOR', contour.contourId);
    assert(parsed.fail === 0 && parsed.cancelled === 0 && parsed.skipped === 0 && parsed.todo === 0, 'E_TEST_NOT_CLEAN', contour.contourId);
    return parsed;
  });
}

export function loadInputs(repoRoot = process.cwd()) {
  const historical = readJsonBytes(repoRoot, PATHS.c2aHistorical, true);
  const receiptById = new Map(historical.value.receipts.map((entry) => [entry.receiptId, entry]));
  const receipts = CONTOURS.map((contour) => {
    const manifestEntry = receiptById.get(contour.receiptId);
    assert(manifestEntry?.repoRelativePath === contour.receiptPath, 'E_RECEIPT_MANIFEST', contour.receiptId);
    const receipt = readJsonBytes(repoRoot, contour.receiptPath);
    assert(receipt.digest === manifestEntry.sourceSha256 && receipt.bytes.length === manifestEntry.sourceByteLength, 'E_RAW_RECEIPT_MUTATED', contour.receiptId);
    return { contour, manifestEntry, receipt };
  });
  return {
    c2b1Ledger: readJsonBytes(repoRoot, PATHS.c2b1Ledger, true),
    c2b1Map: readJsonBytes(repoRoot, PATHS.c2b1Map, true),
    historical,
    programTemplate: readJsonBytes(repoRoot, PATHS.programTemplate, true),
    receipts,
    repoRoot,
    stageAdmission: readJsonBytes(repoRoot, PATHS.stageAdmission, true),
    stageInstance: readJsonBytes(repoRoot, PATHS.stageInstance, true)
  };
}

function validateInputs(inputs) {
  assert(inputs.programTemplate.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', inputs.programTemplate.digest);
  assert(inputs.stageInstance.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', inputs.stageInstance.digest);
  assert(inputs.stageAdmission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', inputs.stageAdmission.digest);
  assert(inputs.stageAdmission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST && inputs.stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C2B2');
  const claimById = new Map(inputs.c2b1Map.value.claims.map((entry) => [entry.claimId, entry]));
  assert(claimById.size === 37, 'E_C2B1_CLAIM_COUNT', claimById.size);
  for (const { contour, manifestEntry, receipt } of inputs.receipts) {
    const claim = claimById.get(contour.receiptId);
    assert(claim, 'E_C2B1_CLAIM_MISSING', contour.receiptId);
    assert(claim.contourId === contour.contourId, 'E_CONTOUR_IDENTITY', contour.receiptId);
    assert(claim.rawState === 'PENDING' && claim.effectiveState === 'PENDING', 'E_RAW_EFFECTIVE_STATE', contour.receiptId);
    assert(claim.certifiedStateAfter === 'PENDING_UNCERTIFIED', 'E_PRIOR_CERTIFICATION_STATE', contour.receiptId);
    assert(claim.rawStateMutated === false && claim.effectiveStateMutated === false, 'E_PRIOR_RAW_MUTATION', contour.receiptId);
    assert(manifestEntry.rawStates.mergeState === 'WAITING' && manifestEntry.rawStates.postmergeState === 'PENDING' && manifestEntry.rawStates.survivorState === 'PENDING', 'E_RAW_RECEIPT_STATE', contour.receiptId);
    assert(receipt.value.receiptId === contour.receiptId && receipt.value.contourId === contour.contourId, 'E_RAW_RECEIPT_IDENTITY', contour.receiptId);
    assert(Array.isArray(receipt.value.evidenceStampIds) && receipt.value.evidenceStampIds.length === 8, 'E_EVIDENCE_STAMP_DENOMINATOR', contour.receiptId);
  }
  return claimById;
}

function fileEvidence(repoRoot, relativePath) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { byteLength: bytes.length, repoRelativePath: relativePath, sha256: rawSha256(bytes) };
}

function buildContract(inputs) {
  return {
    c2b1TerminalDependency: {
      evaluationSha: SOURCE_HEAD_SHA,
      evaluationTreeSha: SOURCE_TREE_SHA,
      externalArtifactDigest: 'sha256:04a2fe1eb3100f3184399faa9fbcb794056d928244ab90ebdb6a6e25cacff795',
      externalArtifactId: 9669083287,
      externalRunId: 33127876395,
      status: 'VERIFIED',
      terminalAttestationBytesDigest: C2B1_TERMINAL_ATTESTATION_DIGEST,
      trustModelDigest: TRUST_MODEL_DIGEST
    },
    canonicalSerialization: {
      digest: 'SHA-256_EXACT_BYTES',
      encoding: 'UTF-8',
      lineEnding: 'LF',
      objectKeys: 'LEXICOGRAPHIC_ASCENDING_RECURSIVE',
      trailingNewline: true
    },
    compilerId: 'YALKEN_R24_C2B2_CURRENT_HEAD_RECERTIFICATION_COMPILER_V1',
    compilerPath: PATHS.script,
    contourContracts: CONTOURS.map((contour) => ({
      command: `npm run -s ${contour.command}`,
      contourId: contour.contourId,
      expectedMutationReceipt: clone(contour.expectedMutationReceipt),
      expectedTests: contour.expectedTests,
      receiptId: contour.receiptId,
      receiptPath: contour.receiptPath,
      testFiles: [...contour.testFiles]
    })),
    externalTerminalRule: {
      localOrSelfAuthoredPassIsTerminal: false,
      requiredStageId: 'C2B2',
      stateBeforeExternalAttestation: 'CURRENT_HEAD_PASS_AWAITING_EXTERNAL_TERMINAL_ATTESTATION',
      stateWhenVerified: 'CERTIFIED_CURRENT'
    },
    outputPaths: {
      currentHeadEvaluation: PATHS.evaluation,
      recertificationLedger: PATHS.ledger
    },
    ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    privacy: {
      localRecoveryPathsPublished: false,
      publicEvidenceFields: ['PATHLESS_CAPABILITY_IDS', 'ROLES', 'DIGESTS']
    },
    productionSnapshot: { headSha: SOURCE_HEAD_SHA, treeSha: SOURCE_TREE_SHA },
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    rawAndEffectiveState: {
      effectiveLifecycleMutationForbidden: true,
      historicalReceiptMutationForbidden: true,
      rawLifecycleMutationForbidden: true
    },
    schemaVersion: 'YALKEN_R24_C2B2_CURRENT_HEAD_RECERTIFICATION_CONTRACT_V1',
    sourceBindings: {
      c2aHistoricalReceiptManifestDigest: inputs.historical.digest,
      c2b1AffectedClaimMapDigest: inputs.c2b1Map.digest,
      c2b1InvalidationLedgerDigest: inputs.c2b1Ledger.digest,
      stageAdmissionAttestationDigest: inputs.stageAdmission.digest,
      stageInstanceDigest: inputs.stageInstance.digest
    },
    stageId: 'C2B2',
    unprovenClaimPolicy: {
      falseDoneForbidden: true,
      rawOrEffectiveDone: 'DONE_UNCERTIFIED',
      rawOrEffectivePending: 'PENDING_UNCERTIFIED'
    }
  };
}

function buildEvaluation(inputs, results, claimById, contract) {
  assert(Array.isArray(results) && results.length === CONTOURS.length, 'E_RESULT_COUNT', results?.length);
  const contours = CONTOURS.map((contour, index) => {
    const result = results[index];
    assert(result.command === `npm run -s ${contour.command}`, 'E_RESULT_COMMAND', contour.contourId);
    assert(result.exitCode === 0 && result.tests === contour.expectedTests && result.pass === contour.expectedTests, 'E_RESULT_NOT_PASS', contour.contourId);
    assert(result.fail === 0 && result.cancelled === 0 && result.skipped === 0 && result.todo === 0, 'E_RESULT_NOT_CLEAN', contour.contourId);
    assert(canonicalBytes(result.mutationReceipt).equals(canonicalBytes(contour.expectedMutationReceipt)), 'E_RESULT_MUTATION_RECEIPT', contour.contourId);
    const source = inputs.receipts[index];
    const claim = claimById.get(contour.receiptId);
    return {
      commandResult: clone(result),
      contourId: contour.contourId,
      currentHeadEvaluation: 'PASS',
      effectiveState: claim.effectiveState,
      effectiveStateMutated: false,
      evidenceStampIds: [...source.receipt.value.evidenceStampIds],
      postTerminalStateIfExternalAttestationVerified: 'CERTIFIED_CURRENT',
      priorCertifiedState: claim.certifiedStateAfter,
      rawReceiptDigest: source.receipt.digest,
      rawState: claim.rawState,
      rawStateMutated: false,
      receiptId: contour.receiptId,
      stateAtArtifactTime: 'CURRENT_HEAD_PASS_AWAITING_EXTERNAL_TERMINAL_ATTESTATION',
      testFileEvidence: contour.testFiles.map((relativePath) => fileEvidence(inputs.repoRoot, relativePath))
    };
  });
  return {
    counts: {
      currentHeadPass: contours.filter((entry) => entry.currentHeadEvaluation === 'PASS').length,
      disputedContours: contours.length,
      falseDoneClaims: contours.filter((entry) => entry.rawState !== 'DONE' && entry.stateAtArtifactTime === 'DONE').length,
      rawOrEffectiveMutations: contours.filter((entry) => entry.rawStateMutated || entry.effectiveStateMutated).length,
      terminalCertifiedBeforeExternalAttestation: contours.filter((entry) => entry.stateAtArtifactTime === 'CERTIFIED_CURRENT').length
    },
    contours,
    externalTerminalAttestation: {
      required: true,
      status: 'AWAITING_POST_MERGE_EXTERNAL_C2B2_ATTESTATION'
    },
    productionSnapshot: clone(contract.productionSnapshot),
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    schemaVersion: 'YALKEN_R24_C2B2_CURRENT_HEAD_EVALUATION_V1',
    sourceBindings: clone(contract.sourceBindings),
    stageId: 'C2B2',
    unprovenClaimPolicy: clone(contract.unprovenClaimPolicy)
  };
}

function entryWithDigest(entry) {
  return { ...entry, entryDigest: sha256(canonicalBytes(entry)) };
}

function buildLedger(inputs, evaluation) {
  const prior = inputs.c2b1Ledger.value.entries.at(-1);
  assert(prior?.entryDigest && Number.isInteger(prior.sequence), 'E_C2B1_LEDGER_TAIL', 'missing');
  let predecessorEntryDigest = prior.entryDigest;
  const entries = evaluation.contours.map((contour, index) => {
    const entry = entryWithDigest({
      contourId: contour.contourId,
      correctionId: `C2B2-RECERTIFICATION-${String(index + 1).padStart(4, '0')}`,
      currentHeadEvaluation: contour.currentHeadEvaluation,
      effect: 'CURRENT_HEAD_PROOF_CANDIDATE_RECORDED_WITHOUT_RAW_OR_EFFECTIVE_LIFECYCLE_MUTATION',
      externalTerminalAttestationRequired: true,
      operation: 'PROPOSE_CURRENT_RECERTIFICATION_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
      predecessorEntryDigest,
      rawAndEffectiveMutationForbidden: true,
      receiptId: contour.receiptId,
      sequence: prior.sequence + index + 1,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA
    });
    predecessorEntryDigest = entry.entryDigest;
    return entry;
  });
  return {
    c2b1Predecessor: {
      finalEntryDigest: inputs.c2b1Ledger.value.finalEntryDigest,
      invalidationLedgerDigest: inputs.c2b1Ledger.digest,
      tailEntryDigest: prior.entryDigest,
      tailSequence: prior.sequence
    },
    entries,
    finalEntryDigest: entries.at(-1).entryDigest,
    ledgerId: 'YALKEN_R24_C2B2_CURRENT_HEAD_RECERTIFICATION_LEDGER_V1',
    ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    rawAndEffectiveMutationForbidden: true,
    schemaVersion: 'YALKEN_R24_C2B2_RECERTIFICATION_LEDGER_V1',
    sourceEvidenceStampIds: [...new Set(evaluation.contours.flatMap((contour) => contour.evidenceStampIds))].sort(lexical)
  };
}

export function buildArtifacts(inputs = loadInputs(), results = expectedPassResults()) {
  const claimById = validateInputs(inputs);
  const contract = buildContract(inputs);
  const evaluation = buildEvaluation(inputs, results, claimById, contract);
  const ledger = buildLedger(inputs, evaluation);
  assert(evaluation.counts.disputedContours === 4 && evaluation.counts.currentHeadPass === 4, 'E_FOUR_CONTOURS_NOT_PASS', canonicalize(evaluation.counts));
  assert(evaluation.counts.falseDoneClaims === 0 && evaluation.counts.rawOrEffectiveMutations === 0, 'E_FALSE_DONE_OR_MUTATION', canonicalize(evaluation.counts));
  assert(evaluation.counts.terminalCertifiedBeforeExternalAttestation === 0, 'E_SELF_CERTIFICATION', evaluation.counts.terminalCertifiedBeforeExternalAttestation);
  return { contract, evaluation, ledger };
}

function assertExpected(actual, expected, field) {
  assert(canonicalBytes(actual).equals(canonicalBytes(expected)), 'E_ARTIFACT_SEMANTIC_DRIFT', field);
}

export function validateArtifacts(artifacts, inputs = loadInputs(), results = expectedPassResults()) {
  const expected = buildArtifacts(inputs, results);
  assertExpected(artifacts.contract, expected.contract, 'contract');
  assertExpected(artifacts.evaluation, expected.evaluation, 'evaluation');
  assertExpected(artifacts.ledger, expected.ledger, 'ledger');
  return compileResult(expected);
}

function compileResult(artifacts) {
  return {
    counts: clone(artifacts.evaluation.counts),
    decision: 'C2B2_FOUR_DISPUTED_CTRS_CURRENT_HEAD_EVALUATED',
    schemaVersion: 'YALKEN_R24_C2B2_CURRENT_HEAD_RECERTIFICATION_RESULT_V1',
    signals: {
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'REQUIRES_POST_MERGE_EXTERNAL_C2B2_ATTESTATION',
      FOUR_DISPUTED_CTRS_CURRENT_HEAD_EVALUATED: true,
      UNPROVEN_CTRS_DONE_UNCERTIFIED: true
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
    PATHS.evaluation,
    PATHS.inventory,
    PATHS.ledger,
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
  const rationale = 'C2B2 exact admitted current-head evaluation of four disputed CTR claim sets, fail-closed unproven policy, append-only recertification ledger, and semantic falsification tests; no product truth or raw lifecycle mutation.';
  return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), version: 'v1.0' };
}

function isOwnActiveApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry?.rationale === 'string'
    && entry.rationale.startsWith('C2B2 exact admitted current-head recertification under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', PATHS.activeApprovals);
  const paths = [...approvedPaths(), PATHS.approvals].sort(lexical);
  const supersededPaths = new Set(paths);
  const baseApprovals = current.approvals.filter((entry) => !isOwnActiveApproval(entry) && !supersededPaths.has(entry.filePath));
  const rationale = `C2B2 exact admitted current-head recertification under StageInstance ${STAGE_INSTANCE_DIGEST}; raw and effective lifecycle state remain immutable, unproven claims fail closed, and no product truth expands.`;
  return { approvals: [...baseApprovals, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))], version: current.version };
}

function loadGenerated(repoRoot) {
  return {
    contract: readJsonBytes(repoRoot, PATHS.contract, true).value,
    evaluation: readJsonBytes(repoRoot, PATHS.evaluation, true).value,
    ledger: readJsonBytes(repoRoot, PATHS.ledger, true).value
  };
}

function assertExpectedBytes(repoRoot, relativePath, expected) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  assert(bytes.equals(canonicalBytes(expected)), 'E_GENERATED_ARTIFACT_DRIFT', relativePath);
}

export function writeArtifacts(repoRoot = process.cwd(), options = {}) {
  assertSourceIdentity(repoRoot);
  const results = options.results ?? executeAcceptance(repoRoot);
  const inputs = loadInputs(repoRoot);
  const artifacts = buildArtifacts(inputs, results);
  writeCanonical(repoRoot, PATHS.contract, artifacts.contract);
  writeCanonical(repoRoot, PATHS.evaluation, artifacts.evaluation);
  writeCanonical(repoRoot, PATHS.ledger, artifacts.ledger);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return validateArtifacts(artifacts, inputs, results);
}

export function checkArtifacts(repoRoot = process.cwd(), options = {}) {
  assertSourceIdentity(repoRoot);
  const results = options.results ?? executeAcceptance(repoRoot);
  const inputs = loadInputs(repoRoot);
  const expected = buildArtifacts(inputs, results);
  const actual = loadGenerated(repoRoot);
  validateArtifacts(actual, inputs, results);
  assertExpectedBytes(repoRoot, PATHS.contract, expected.contract);
  assertExpectedBytes(repoRoot, PATHS.evaluation, expected.evaluation);
  assertExpectedBytes(repoRoot, PATHS.ledger, expected.ledger);
  assertExpectedBytes(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  assertExpectedBytes(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(expected);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (process.argv.includes('--write')) process.stdout.write(canonicalBytes(writeArtifacts(process.cwd())));
    else if (process.argv.includes('--check')) process.stdout.write(canonicalBytes(checkArtifacts(process.cwd())));
    else fail('E_USAGE', '--write or --check');
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
