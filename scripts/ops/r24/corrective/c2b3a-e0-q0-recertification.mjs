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
export const C2B2_TERMINAL_ATTESTATION_DIGEST = 'ba4429f021067b2618353df098940d3e7858acdd162770f7faeaf527c1fff5cc';
export const SOURCE_HEAD_SHA = '70485b9bd8ec1d3a9855573929159020511b47d8';
export const SOURCE_TREE_SHA = '7a191826c0d115c928894d5f3f454c76e8897561';
export const STAGE_INSTANCE_DIGEST = 'a2f2e3760f2049022d612c1e2549796478e81435a68fbf6fb0ce87661e6e857f';
export const STAGE_ADMISSION_DIGEST = '7f2dd3034e200bb0df9b6dfffe66ea2a271cc385f6c77381bdf0f7dcf3f3e730';
export const OBSERVED_AT_UTC = '2026-08-28T01:02:30.000Z';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C2B3A_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  c2b2Evaluation: 'docs/OPS/R24/CORRECTIVE/C2B2_CURRENT_HEAD_EVALUATION_V1.json',
  c2b2Ledger: 'docs/OPS/R24/CORRECTIVE/C2B2_RECERTIFICATION_LEDGER_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C2B3A_E0_Q0_RECERTIFICATION_CONTRACT_V1.json',
  evaluation: 'docs/OPS/R24/CORRECTIVE/C2B3A_CURRENT_HEAD_EVALUATION_V1.json',
  executionEnvelopes: 'docs/OPS/R24/EXECUTION_ENVELOPES_R2_4.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  ledger: 'docs/OPS/R24/CORRECTIVE/C2B3A_RECERTIFICATION_LEDGER_V1.json',
  planState: 'docs/OPS/R24/PLAN_STATE_R24.json',
  programTemplate: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  script: 'scripts/ops/r24/corrective/c2b3a-e0-q0-recertification.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C2B3A_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C2B3A_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c2b3a-e0-q0-recertification.contract.test.mjs'
});

export const SOURCE_EVIDENCE_STAMP_IDS = Object.freeze([
  'ES-R24-WP-100-GENERATION-ADMISSION-MODEL',
  'ES-R24-WP-104-BOUNDARY-FALSIFICATION-INTEGRATION'
]);

export const LANES = Object.freeze([
  Object.freeze({
    command: 'test:r24-e0',
    contourId: 'E0_RUNNER_SAFETY_QUARANTINE',
    expectedHeadSha: '2f0571682d01b4f6e8cf2dc1ee3886fb4cbeb943',
    expectedTests: 106,
    runnerPath: 'scripts/ops/r24/run-e0-tests.mjs',
    sourceEvidenceStampId: SOURCE_EVIDENCE_STAMP_IDS[1],
    testDirectory: 'scripts/ops/r24/tests'
  }),
  Object.freeze({
    command: 'test:r24-q0',
    contourId: 'Q0_TOOLCHAIN_HYGIENE',
    expectedHeadSha: '65b879a57ebdace67528a819bc3f12c208f1553c',
    expectedTests: 20,
    runnerPath: 'scripts/ops/r24/run-q0-tests.mjs',
    sourceEvidenceStampId: SOURCE_EVIDENCE_STAMP_IDS[0],
    testDirectory: 'scripts/ops/r24/tests/q0'
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

function parseMarker(stdout, marker) {
  const prefix = `${marker}=`;
  const line = stdout.split('\n').find((entry) => entry.startsWith(prefix));
  assert(line, 'E_LANE_MARKER_MISSING', marker);
  try {
    return JSON.parse(line.slice(prefix.length));
  } catch (error) {
    fail('E_LANE_MARKER_INVALID', `${marker}:${error.message}`);
  }
}

function normalizeMutation(receipt, contourId) {
  assert(receipt?.schemaVersion === 'yalken.r24-mutation-receipt.v1', 'E_MUTATION_SCHEMA', contourId);
  assert(receipt.total === 31 && receipt.killed === 31 && receipt.score === 1, 'E_MUTATION_DENOMINATOR', contourId);
  assert(receipt.baseline === 'PASS' && Array.isArray(receipt.survived) && receipt.survived.length === 0, 'E_MUTATION_SURVIVOR', contourId);
  return {
    baseline: receipt.baseline,
    killed: receipt.killed,
    schemaVersion: receipt.schemaVersion,
    score: receipt.score,
    survived: [],
    total: receipt.total
  };
}

function validateTap(tap, lane) {
  assert(tap?.tests === lane.expectedTests && tap?.pass === lane.expectedTests, 'E_TEST_DENOMINATOR', lane.contourId);
  assert(tap.fail === 0 && tap.cancelled === 0 && tap.skipped === 0 && tap.todo === 0, 'E_TEST_NOT_CLEAN', lane.contourId);
  return clone(tap);
}

export function expectedPassResults() {
  return [
    {
      command: 'npm run -s test:r24-e0',
      docsClaimLint: { ok: true },
      environmentRegistry: { foundCount: 199, ok: true, registeredCount: 46 },
      exitCode: 0,
      laneReceipt: { docsClaimLint: 'PASS', envRegistry: 'PASS', failures: [], mutants: 'PASS', schemaVersion: 'yalken.r24-e0-lane-receipt.v1', suite: 'PASS', verdict: 'PASS' },
      mutationReceipt: { baseline: 'PASS', killed: 31, schemaVersion: 'yalken.r24-mutation-receipt.v1', score: 1, survived: [], total: 31 },
      suiteTap: { cancelled: 0, fail: 0, pass: 106, skipped: 0, tests: 106, todo: 0 }
    },
    {
      command: 'npm run -s test:r24-q0',
      docsClaimLint: { ok: true },
      environmentRegistry: { foundCount: 199, ok: true, registeredCount: 46 },
      exitCode: 0,
      laneReceipt: { docsClaimLint: 'PASS', envRegistry: 'PASS', failures: [], mutants: 'PASS', readonlyProof: 'PASS', schemaVersion: 'yalken.r24-q0-lane-receipt.v1', suite: 'PASS', tempPaths: 'PASS', toolchain: 'PASS', verdict: 'PASS' },
      mutationReceipt: { baseline: 'PASS', killed: 31, schemaVersion: 'yalken.r24-mutation-receipt.v1', score: 1, survived: [], total: 31 },
      readonlyProof: { treeChanged: false, verdict: 'PASS' },
      suiteTap: { cancelled: 0, fail: 0, pass: 20, skipped: 0, tests: 20, todo: 0 },
      tempPaths: { foundCount: 5, ok: true, registeredCount: 5 },
      toolchain: { ok: true, workflowCount: 7 }
    }
  ];
}

export function executeAcceptance(repoRoot = process.cwd()) {
  return LANES.map((lane) => {
    const result = run(repoRoot, 'npm', ['run', '-s', lane.command]);
    const stdout = String(result.stdout || '');
    const stderr = String(result.stderr || '');
    assert(result.status === 0, 'E_ACCEPTANCE_COMMAND_FAILED', `${lane.contourId}:${result.status}:${stderr.slice(-1000)}`);
    const common = {
      command: `npm run -s ${lane.command}`,
      docsClaimLint: { ok: parseMarker(stdout, 'R24_DOCS_CLAIM_LINT').ok === true },
      environmentRegistry: parseMarker(stdout, 'R24_ENV_FLAG_REGISTRY'),
      exitCode: result.status,
      mutationReceipt: normalizeMutation(parseMarker(stdout, 'R24_MUTATION_RECEIPT'), lane.contourId)
    };
    assert(common.docsClaimLint.ok, 'E_DOCS_CLAIM_LINT', lane.contourId);
    assert(common.environmentRegistry.ok === true && common.environmentRegistry.foundCount === 199 && common.environmentRegistry.registeredCount === 46, 'E_ENV_REGISTRY', lane.contourId);
    if (lane.command === 'test:r24-e0') {
      const laneReceipt = parseMarker(stdout, 'R24_E0_LANE_RECEIPT');
      assert(laneReceipt.verdict === 'PASS' && laneReceipt.suite === 'PASS' && laneReceipt.mutants === 'PASS' && laneReceipt.failures.length === 0, 'E_LANE_RECEIPT', lane.contourId);
      return { ...common, laneReceipt, suiteTap: validateTap(parseMarker(stdout, 'R24_E0_SUITE_TAP'), lane) };
    }
    const laneReceipt = parseMarker(stdout, 'R24_Q0_LANE_RECEIPT');
    const readonlyProof = parseMarker(stdout, 'R24_READONLY_PROOF');
    const tempPaths = parseMarker(stdout, 'R24_TEMP_PATHS');
    const toolchain = parseMarker(stdout, 'R24_TOOLCHAIN');
    assert(laneReceipt.verdict === 'PASS' && laneReceipt.suite === 'PASS' && laneReceipt.mutants === 'PASS' && laneReceipt.readonlyProof === 'PASS' && laneReceipt.failures.length === 0, 'E_LANE_RECEIPT', lane.contourId);
    assert(readonlyProof.verdict === 'PASS' && readonlyProof.treeChanged === false, 'E_READONLY_PROOF', lane.contourId);
    assert(tempPaths.ok === true && tempPaths.foundCount === 5 && tempPaths.registeredCount === 5, 'E_TEMP_PATH_REGISTRY', lane.contourId);
    assert(toolchain.ok === true && toolchain.workflowCount === 7, 'E_TOOLCHAIN', lane.contourId);
    return { ...common, laneReceipt, readonlyProof, suiteTap: validateTap(parseMarker(stdout, 'R24_Q0_SUITE_TAP'), lane), tempPaths, toolchain };
  });
}

function fileEvidence(repoRoot, relativePath) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { byteLength: bytes.length, repoRelativePath: relativePath, sha256: rawSha256(bytes) };
}

function laneTestFiles(repoRoot, lane) {
  const directory = path.join(repoRoot, lane.testDirectory);
  const paths = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map((entry) => path.posix.join(lane.testDirectory, entry.name))
    .sort(lexical);
  assert(paths.length > 0, 'E_ZERO_TEST_FILES', lane.contourId);
  return paths;
}

export function loadInputs(repoRoot = process.cwd()) {
  return {
    c2b2Evaluation: readJsonBytes(repoRoot, PATHS.c2b2Evaluation, true),
    c2b2Ledger: readJsonBytes(repoRoot, PATHS.c2b2Ledger, true),
    executionEnvelopes: readJsonBytes(repoRoot, PATHS.executionEnvelopes),
    planState: readJsonBytes(repoRoot, PATHS.planState),
    programTemplate: readJsonBytes(repoRoot, PATHS.programTemplate, true),
    repoRoot,
    stageAdmission: readJsonBytes(repoRoot, PATHS.stageAdmission, true),
    stageInstance: readJsonBytes(repoRoot, PATHS.stageInstance, true)
  };
}

function validateInputs(inputs) {
  assert(inputs.programTemplate.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', inputs.programTemplate.digest);
  assert(inputs.stageInstance.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', inputs.stageInstance.digest);
  assert(inputs.stageAdmission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', inputs.stageAdmission.digest);
  assert(inputs.stageAdmission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST && inputs.stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C2B3A');
  assert(inputs.c2b2Evaluation.value.stageId === 'C2B2' && inputs.c2b2Evaluation.value.counts?.currentHeadPass === 4, 'E_C2B2_DEPENDENCY', PATHS.c2b2Evaluation);
  assert(inputs.c2b2Evaluation.value.counts?.falseDoneClaims === 0 && inputs.c2b2Evaluation.value.counts?.rawOrEffectiveMutations === 0, 'E_C2B2_TRUTH', PATHS.c2b2Evaluation);
  const envelopeById = new Map(inputs.executionEnvelopes.value.nodeEnvelopes.map((entry) => [entry.nodeId, entry]));
  for (const lane of LANES) {
    const raw = inputs.planState.value.contours?.[lane.contourId];
    assert(raw?.state === 'DONE' && raw?.headSha === lane.expectedHeadSha && raw?.source === 'EXTERNAL_R24_MISSION_PLAN_STATE', 'E_RAW_PLAN_STATE', lane.contourId);
    const envelope = envelopeById.get(lane.contourId);
    assert(envelope?.state === 'PENDING' && envelope?.terminalReceiptSchema === 'ContourTerminalReceiptV2', 'E_EXECUTION_ENVELOPE', lane.contourId);
  }
  return envelopeById;
}

function buildContract(inputs) {
  return {
    c2b2TerminalDependency: {
      evaluationSha: SOURCE_HEAD_SHA,
      evaluationTreeSha: SOURCE_TREE_SHA,
      externalArtifactDigest: 'sha256:f6f652e109edc663cff50b7335fb879e3d92b11c2d437fe8ddc20f2e4199c653',
      externalArtifactId: 9670433902,
      externalRunId: 33131539241,
      status: 'VERIFIED',
      terminalAttestationBytesDigest: C2B2_TERMINAL_ATTESTATION_DIGEST,
      trustModelDigest: TRUST_MODEL_DIGEST
    },
    canonicalSerialization: {
      digest: 'SHA-256_EXACT_BYTES',
      encoding: 'UTF-8',
      lineEnding: 'LF',
      objectKeys: 'LEXICOGRAPHIC_ASCENDING_RECURSIVE',
      trailingNewline: true
    },
    compilerId: 'YALKEN_R24_C2B3A_E0_Q0_CURRENT_HEAD_RECERTIFICATION_COMPILER_V1',
    compilerPath: PATHS.script,
    externalTerminalRule: {
      localOrSelfAuthoredResultIsTerminal: false,
      requiredStageId: 'C2B3A',
      stateBeforeExternalAttestation: 'CURRENT_HEAD_PASS_AWAITING_EXTERNAL_TERMINAL_ATTESTATION',
      stateWhenVerified: 'CERTIFIED_CURRENT'
    },
    laneContracts: LANES.map((lane) => ({
      command: `npm run -s ${lane.command}`,
      contourId: lane.contourId,
      expectedHistoricalHeadSha: lane.expectedHeadSha,
      expectedTests: lane.expectedTests,
      runnerPath: lane.runnerPath,
      sourceEvidenceStampId: lane.sourceEvidenceStampId,
      testDirectory: lane.testDirectory
    })),
    outputPaths: {
      currentHeadEvaluation: PATHS.evaluation,
      recertificationLedger: PATHS.ledger
    },
    ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    productionSnapshot: { headSha: SOURCE_HEAD_SHA, treeSha: SOURCE_TREE_SHA },
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    rawAndEffectiveState: {
      effectiveLifecycleMutationForbidden: true,
      historicalPlanStateMutationForbidden: true,
      rawLifecycleMutationForbidden: true
    },
    schemaVersion: 'YALKEN_R24_C2B3A_E0_Q0_RECERTIFICATION_CONTRACT_V1',
    sourceBindings: {
      c2b2CurrentHeadEvaluationDigest: inputs.c2b2Evaluation.digest,
      c2b2RecertificationLedgerDigest: inputs.c2b2Ledger.digest,
      executionEnvelopesDigest: inputs.executionEnvelopes.digest,
      planStateDigest: inputs.planState.digest,
      stageAdmissionAttestationDigest: inputs.stageAdmission.digest,
      stageInstanceDigest: inputs.stageInstance.digest
    },
    sourceEvidenceStampIds: [...SOURCE_EVIDENCE_STAMP_IDS],
    stageId: 'C2B3A',
    unprovenClaimPolicy: {
      falseDoneForbidden: true,
      rawOrEffectiveDone: 'DONE_UNCERTIFIED'
    }
  };
}

function assertExpectedResult(result, expected, contourId) {
  assert(canonicalBytes(result).equals(canonicalBytes(expected)), 'E_LANE_RESULT_DRIFT', contourId);
}

function buildEvaluation(inputs, results, contract, envelopeById) {
  assert(Array.isArray(results) && results.length === LANES.length, 'E_RESULT_COUNT', results?.length);
  const lanes = LANES.map((lane, index) => {
    assertExpectedResult(results[index], expectedPassResults()[index], lane.contourId);
    const raw = inputs.planState.value.contours[lane.contourId];
    const envelope = envelopeById.get(lane.contourId);
    const testFiles = laneTestFiles(inputs.repoRoot, lane);
    return {
      commandResult: clone(results[index]),
      contourId: lane.contourId,
      currentHeadEvaluation: 'PASS',
      effectiveState: 'DONE',
      effectiveStateMutated: false,
      executionEnvelopeState: envelope.state,
      historicalHeadSha: raw.headSha,
      postTerminalStateIfExternalAttestationVerified: 'CERTIFIED_CURRENT',
      priorCertifiedState: 'DONE_UNCERTIFIED',
      rawState: raw.state,
      rawStateMutated: false,
      sourceEvidenceStampIds: [lane.sourceEvidenceStampId],
      stateAtArtifactTime: 'CURRENT_HEAD_PASS_AWAITING_EXTERNAL_TERMINAL_ATTESTATION',
      testFileEvidence: [lane.runnerPath, ...testFiles].map((relativePath) => fileEvidence(inputs.repoRoot, relativePath))
    };
  });
  return {
    counts: {
      currentHeadPass: lanes.filter((entry) => entry.currentHeadEvaluation === 'PASS').length,
      falseDoneClaims: lanes.filter((entry) => entry.rawState !== 'DONE' && entry.effectiveState === 'DONE').length,
      lanes: lanes.length,
      rawOrEffectiveMutations: lanes.filter((entry) => entry.rawStateMutated || entry.effectiveStateMutated).length,
      terminalCertifiedBeforeExternalAttestation: lanes.filter((entry) => entry.stateAtArtifactTime === 'CERTIFIED_CURRENT').length
    },
    externalTerminalAttestation: {
      required: true,
      status: 'AWAITING_POST_MERGE_EXTERNAL_C2B3A_ATTESTATION'
    },
    lanes,
    productionSnapshot: clone(contract.productionSnapshot),
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    schemaVersion: 'YALKEN_R24_C2B3A_CURRENT_HEAD_EVALUATION_V1',
    sourceBindings: clone(contract.sourceBindings),
    sourceEvidenceStampIds: [...SOURCE_EVIDENCE_STAMP_IDS],
    stageId: 'C2B3A',
    unprovenClaimPolicy: clone(contract.unprovenClaimPolicy)
  };
}

function entryWithDigest(entry) {
  return { ...entry, entryDigest: sha256(canonicalBytes(entry)) };
}

function buildLedger(inputs, evaluation) {
  const prior = inputs.c2b2Ledger.value.entries.at(-1);
  assert(prior?.entryDigest && Number.isInteger(prior.sequence), 'E_C2B2_LEDGER_TAIL', 'missing');
  let predecessorEntryDigest = prior.entryDigest;
  const entries = evaluation.lanes.map((lane, index) => {
    const entry = entryWithDigest({
      contourId: lane.contourId,
      correctionId: `C2B3A-RECERTIFICATION-${String(index + 1).padStart(4, '0')}`,
      currentHeadEvaluation: lane.currentHeadEvaluation,
      effect: 'CURRENT_HEAD_PROOF_CANDIDATE_RECORDED_WITHOUT_RAW_OR_EFFECTIVE_LIFECYCLE_MUTATION',
      externalTerminalAttestationRequired: true,
      operation: 'PROPOSE_CURRENT_RECERTIFICATION_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
      predecessorEntryDigest,
      rawAndEffectiveMutationForbidden: true,
      sequence: prior.sequence + index + 1,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA
    });
    predecessorEntryDigest = entry.entryDigest;
    return entry;
  });
  return {
    c2b2Predecessor: {
      finalEntryDigest: inputs.c2b2Ledger.value.finalEntryDigest,
      recertificationLedgerDigest: inputs.c2b2Ledger.digest,
      tailEntryDigest: prior.entryDigest,
      tailSequence: prior.sequence
    },
    entries,
    finalEntryDigest: entries.at(-1).entryDigest,
    ledgerId: 'YALKEN_R24_C2B3A_E0_Q0_RECERTIFICATION_LEDGER_V1',
    ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    rawAndEffectiveMutationForbidden: true,
    schemaVersion: 'YALKEN_R24_C2B3A_RECERTIFICATION_LEDGER_V1',
    sourceEvidenceStampIds: [...SOURCE_EVIDENCE_STAMP_IDS]
  };
}

export function buildArtifacts(inputs = loadInputs(), results = expectedPassResults()) {
  const envelopeById = validateInputs(inputs);
  const contract = buildContract(inputs);
  const evaluation = buildEvaluation(inputs, results, contract, envelopeById);
  const ledger = buildLedger(inputs, evaluation);
  assert(evaluation.counts.lanes === 2 && evaluation.counts.currentHeadPass === 2, 'E_E0_Q0_NOT_CURRENT', canonicalize(evaluation.counts));
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
    decision: 'C2B3A_E0_Q0_CURRENT_HEAD_RECERTIFIED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    schemaVersion: 'YALKEN_R24_C2B3A_CURRENT_HEAD_RECERTIFICATION_RESULT_V1',
    signals: {
      E0_Q0_CURRENT_HEAD_RECERTIFIED: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'REQUIRES_POST_MERGE_EXTERNAL_C2B3A_ATTESTATION'
    },
    status: 'CURRENT_HEAD_EVALUATED'
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
  const rationale = 'C2B3A exact admitted E0 and Q0 current-head evaluation, immutable historical plan truth, append-only recertification ledger, and semantic falsification tests; no product truth or lifecycle mutation.';
  return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), version: 'v1.0' };
}

function isOwnActiveApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry?.rationale === 'string'
    && entry.rationale.startsWith('C2B3A exact admitted current-head recertification under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', PATHS.activeApprovals);
  const paths = [...approvedPaths(), PATHS.approvals].sort(lexical);
  const supersededPaths = new Set(paths);
  const baseApprovals = current.approvals.filter((entry) => !isOwnActiveApproval(entry) && !supersededPaths.has(entry.filePath));
  const rationale = `C2B3A exact admitted current-head recertification under StageInstance ${STAGE_INSTANCE_DIGEST}; raw and effective lifecycle state remain immutable and no product truth expands.`;
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
