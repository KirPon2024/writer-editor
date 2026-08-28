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
export const C2B3A_TERMINAL_ATTESTATION_DIGEST = 'c63d1c74384f55977416059df4afe5665965d8378ab2685e98be5dd221d23cca';
export const SOURCE_HEAD_SHA = '770d656f959e803f86c79b62c2d86ffcbcf1e83c';
export const SOURCE_TREE_SHA = '520e721baf804045e80b2f58464dbdd1024401ea';
export const STAGE_INSTANCE_DIGEST = 'f5fd944b17aaba940d535940d7b8bd6e6c8a2eb8742d74e67cbfbfa0788287a3';
export const STAGE_ADMISSION_DIGEST = '8fa0fc9c990dbc1531cc218b520151ee452501ca06a509a3a77cdd2dd66c40d5';
export const OBSERVED_AT_UTC = '2026-08-28T01:44:04.000Z';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C2B3B_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  c2b3aEvaluation: 'docs/OPS/R24/CORRECTIVE/C2B3A_CURRENT_HEAD_EVALUATION_V1.json',
  c2b3aLedger: 'docs/OPS/R24/CORRECTIVE/C2B3A_RECERTIFICATION_LEDGER_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C2B3B_P_S_K_RECERTIFICATION_CONTRACT_V1.json',
  evaluation: 'docs/OPS/R24/CORRECTIVE/C2B3B_CURRENT_HEAD_EVALUATION_V1.json',
  executionEnvelopes: 'docs/OPS/R24/EXECUTION_ENVELOPES_R2_4.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  ledger: 'docs/OPS/R24/CORRECTIVE/C2B3B_RECERTIFICATION_LEDGER_V1.json',
  packageJson: 'package.json',
  planState: 'docs/OPS/R24/PLAN_STATE_R24.json',
  programTemplate: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  script: 'scripts/ops/r24/corrective/c2b3b-p-s-k-recertification.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C2B3B_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C2B3B_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c2b3b-p-s-k-recertification.contract.test.mjs'
});

export const SOURCE_EVIDENCE_STAMP_IDS = Object.freeze([
  'ES-R24-WP-100-GENERATION-ADMISSION-INTEGRATION',
  'ES-R24-WP-101-IPC-ADMISSION-INTEGRATION',
  'ES-R24-WP-102-OPERATION-PROTOCOL-INTEGRATION',
  'ES-R24-WP-103-REVISION-PRODUCT-ORDER-INTEGRATION'
]);

export const LANES = Object.freeze([
  Object.freeze({ command: 'test:r24-p0', contourId: 'P0_AUTOSAVE_GENERATION', expectedHeadSha: '28f6858b3d945a6f8065cda2117de4a70a91c215', expectedTests: 15, sourceEvidenceStampId: SOURCE_EVIDENCE_STAMP_IDS[0], testFiles: ['test/unit/r24-p0-autosave-generation.test.js', 'test/unit/r24-p0-autosave-integration.test.js', 'test/unit/r24-p0-autosave-mutants.test.js'] }),
  Object.freeze({ command: 'test:r24-p1', contourId: 'P1_DIRTY_ADMISSION_ACK', expectedHeadSha: '2676af38b943739488e1252350b0f168881cba60', expectedTests: 17, sourceEvidenceStampId: SOURCE_EVIDENCE_STAMP_IDS[0], testFiles: ['test/unit/r24-p1-dirty-admission.test.js', 'test/unit/r24-p1-lifecycle-integration.test.js', 'test/unit/r24-p1-ack-mutants.test.js'] }),
  Object.freeze({ command: 'test:r24-p2', contourId: 'P2_DURABLE_SAVE_COORDINATOR', expectedHeadSha: 'f0eaa5ff0c4ba687c7232560c6a8f76f64190110', expectedTests: 12, sourceEvidenceStampId: SOURCE_EVIDENCE_STAMP_IDS[3], testFiles: ['test/unit/r24-p2-save-coordinator.test.js', 'test/unit/r24-p2-save-crash.test.js', 'test/unit/r24-p2-save-mutants.test.js'] }),
  Object.freeze({ command: 'test:r24-p3', contourId: 'P3_TRANSACTIONAL_PROJECT_COMMIT', expectedHeadSha: '14af53dddf10db14859e9e9ae417fd4374fc9a54', expectedTests: 12, sourceEvidenceStampId: SOURCE_EVIDENCE_STAMP_IDS[3], testFiles: ['test/unit/r24-p3-project-commit.test.js', 'test/unit/r24-p3-commit-crash.test.js', 'test/unit/r24-p3-commit-mutants.test.js'] }),
  Object.freeze({ command: 'test:r24-s0', contourId: 'S0_IPC_CALLER_IDENTITY', expectedHeadSha: '33b924d6a62b9ce5c35de3eebff789941524b55e', expectedTests: 15, sourceEvidenceStampId: SOURCE_EVIDENCE_STAMP_IDS[1], testFiles: ['test/unit/r24-s0-ipc-caller-identity.test.js', 'test/unit/r24-s0-ipc-integration.test.js', 'test/unit/r24-s0-ipc-mutants.test.js'] }),
  Object.freeze({ command: 'test:r24-s1', contourId: 'S1_IPC_ENVELOPE_BUDGETS', expectedHeadSha: 'd8e3ec32bd50dd6f85032fcae258837d9f18afb3', expectedTests: 14, sourceEvidenceStampId: SOURCE_EVIDENCE_STAMP_IDS[1], testFiles: ['test/unit/r24-s1-ipc-envelope.test.js', 'test/unit/r24-s1-envelope-integration.test.js', 'test/unit/r24-s1-envelope-mutants.test.js'] }),
  Object.freeze({ command: 'test:r24-k0', contourId: 'K0_COMMAND_PROTOCOL', expectedHeadSha: '273e127a20c9f913d84db275a4137e31ddf2bf65', expectedTests: 11, sourceEvidenceStampId: SOURCE_EVIDENCE_STAMP_IDS[2], testFiles: ['test/unit/r24-k0-command-protocol.test.js', 'test/unit/r24-k0-protocol-integration.test.js', 'test/unit/r24-k0-protocol-mutants.test.js'] })
]);

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.evaluation,
  PATHS.approvals,
  PATHS.contract,
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

function tapNumber(stdout, key) {
  const matches = [...stdout.matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gmu'))];
  assert(matches.length > 0, 'E_TAP_MARKER_MISSING', key);
  return Number(matches.at(-1)[1]);
}

function parseTap(stdout, lane) {
  const tap = {
    cancelled: tapNumber(stdout, 'cancelled'),
    fail: tapNumber(stdout, 'fail'),
    pass: tapNumber(stdout, 'pass'),
    skipped: tapNumber(stdout, 'skipped'),
    tests: tapNumber(stdout, 'tests'),
    todo: tapNumber(stdout, 'todo')
  };
  assert(tap.tests === lane.expectedTests && tap.pass === lane.expectedTests, 'E_TEST_DENOMINATOR', lane.contourId);
  assert(tap.fail === 0 && tap.cancelled === 0 && tap.skipped === 0 && tap.todo === 0, 'E_TEST_NOT_CLEAN', lane.contourId);
  return tap;
}

export function expectedPassResults() {
  return LANES.map((lane) => ({
    command: `npm run -s ${lane.command}`,
    exitCode: 0,
    suiteTap: { cancelled: 0, fail: 0, pass: lane.expectedTests, skipped: 0, tests: lane.expectedTests, todo: 0 }
  }));
}

export function executeAcceptance(repoRoot = process.cwd()) {
  return LANES.map((lane) => {
    const result = run(repoRoot, 'npm', ['run', '-s', lane.command]);
    const stdout = String(result.stdout || '');
    const stderr = String(result.stderr || '');
    assert(result.status === 0, 'E_ACCEPTANCE_COMMAND_FAILED', `${lane.contourId}:${result.status}:${stderr.slice(-1000)}`);
    return { command: `npm run -s ${lane.command}`, exitCode: result.status, suiteTap: parseTap(stdout, lane) };
  });
}

function fileEvidence(repoRoot, relativePath) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { byteLength: bytes.length, repoRelativePath: relativePath, sha256: rawSha256(bytes) };
}

export function loadInputs(repoRoot = process.cwd()) {
  return {
    c2b3aEvaluation: readJsonBytes(repoRoot, PATHS.c2b3aEvaluation, true),
    c2b3aLedger: readJsonBytes(repoRoot, PATHS.c2b3aLedger, true),
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
  assert(inputs.stageAdmission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST && inputs.stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C2B3B');
  assert(inputs.c2b3aEvaluation.value.stageId === 'C2B3A' && inputs.c2b3aEvaluation.value.counts?.currentHeadPass === 2, 'E_C2B3A_DEPENDENCY', PATHS.c2b3aEvaluation);
  assert(inputs.c2b3aEvaluation.value.counts?.falseDoneClaims === 0 && inputs.c2b3aEvaluation.value.counts?.rawOrEffectiveMutations === 0, 'E_C2B3A_TRUTH', PATHS.c2b3aEvaluation);
  const envelopeById = new Map(inputs.executionEnvelopes.value.nodeEnvelopes.map((entry) => [entry.nodeId, entry]));
  for (const lane of LANES) {
    const raw = inputs.planState.value.contours?.[lane.contourId];
    assert(raw?.state === 'DONE' && raw?.headSha === lane.expectedHeadSha && raw?.source === 'EXTERNAL_R24_MISSION_PLAN_STATE', 'E_RAW_PLAN_STATE', lane.contourId);
    const envelope = envelopeById.get(lane.contourId);
    assert(envelope?.state === 'PENDING' && envelope?.terminalReceiptSchema === 'ContourTerminalReceiptV2', 'E_EXECUTION_ENVELOPE', lane.contourId);
    assert(fs.existsSync(path.join(inputs.repoRoot, `docs/OPS/R24/EVIDENCE/${lane.sourceEvidenceStampId}.json`)), 'E_SOURCE_EVIDENCE_STAMP', lane.sourceEvidenceStampId);
  }
  return envelopeById;
}

function buildContract(inputs) {
  return {
    c2b3aTerminalDependency: {
      evaluationSha: SOURCE_HEAD_SHA,
      evaluationTreeSha: SOURCE_TREE_SHA,
      externalArtifactDigest: 'sha256:6ae05773efef3ca02bf42a99f56e6a7c03d2b4426e972b4d9465cf8b2103719a',
      externalArtifactId: 9671203642,
      externalRunId: 33133684517,
      status: 'VERIFIED',
      terminalAttestationBytesDigest: C2B3A_TERMINAL_ATTESTATION_DIGEST,
      trustModelDigest: TRUST_MODEL_DIGEST
    },
    canonicalSerialization: {
      digest: 'SHA-256_EXACT_BYTES',
      encoding: 'UTF-8',
      lineEnding: 'LF',
      objectKeys: 'LEXICOGRAPHIC_ASCENDING_RECURSIVE',
      trailingNewline: true
    },
    compilerId: 'YALKEN_R24_C2B3B_P_S_K_CURRENT_HEAD_RECERTIFICATION_COMPILER_V1',
    compilerPath: PATHS.script,
    externalTerminalRule: {
      localOrSelfAuthoredResultIsTerminal: false,
      requiredStageId: 'C2B3B',
      stateBeforeExternalAttestation: 'CURRENT_HEAD_PASS_AWAITING_EXTERNAL_TERMINAL_ATTESTATION',
      stateWhenVerified: 'CERTIFIED_CURRENT'
    },
    laneContracts: LANES.map((lane) => ({
      command: `npm run -s ${lane.command}`,
      contourId: lane.contourId,
      expectedHistoricalHeadSha: lane.expectedHeadSha,
      expectedTests: lane.expectedTests,
      sourceEvidenceStampId: lane.sourceEvidenceStampId,
      testFiles: [...lane.testFiles]
    })),
    outputPaths: { currentHeadEvaluation: PATHS.evaluation, recertificationLedger: PATHS.ledger },
    ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    productionSnapshot: { headSha: SOURCE_HEAD_SHA, treeSha: SOURCE_TREE_SHA },
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    rawAndEffectiveState: {
      effectiveLifecycleMutationForbidden: true,
      historicalPlanStateMutationForbidden: true,
      rawLifecycleMutationForbidden: true
    },
    schemaVersion: 'YALKEN_R24_C2B3B_P_S_K_RECERTIFICATION_CONTRACT_V1',
    sourceBindings: {
      c2b3aCurrentHeadEvaluationDigest: inputs.c2b3aEvaluation.digest,
      c2b3aRecertificationLedgerDigest: inputs.c2b3aLedger.digest,
      executionEnvelopesDigest: inputs.executionEnvelopes.digest,
      planStateDigest: inputs.planState.digest,
      stageAdmissionAttestationDigest: inputs.stageAdmission.digest,
      stageInstanceDigest: inputs.stageInstance.digest
    },
    sourceEvidenceStampIds: [...SOURCE_EVIDENCE_STAMP_IDS],
    stageId: 'C2B3B',
    unprovenClaimPolicy: { falseDoneForbidden: true, rawOrEffectiveDone: 'DONE_UNCERTIFIED' }
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
      testFileEvidence: [PATHS.packageJson, ...lane.testFiles].map((relativePath) => fileEvidence(inputs.repoRoot, relativePath))
    };
  });
  return {
    counts: {
      currentHeadPass: lanes.filter((entry) => entry.currentHeadEvaluation === 'PASS').length,
      falseDoneClaims: lanes.filter((entry) => entry.rawState !== 'DONE' && entry.effectiveState === 'DONE').length,
      lanes: lanes.length,
      rawOrEffectiveMutations: lanes.filter((entry) => entry.rawStateMutated || entry.effectiveStateMutated).length,
      terminalCertifiedBeforeExternalAttestation: lanes.filter((entry) => entry.stateAtArtifactTime === 'CERTIFIED_CURRENT').length,
      tests: lanes.reduce((sum, entry) => sum + entry.commandResult.suiteTap.tests, 0)
    },
    externalTerminalAttestation: { required: true, status: 'AWAITING_POST_MERGE_EXTERNAL_C2B3B_ATTESTATION' },
    lanes,
    productionSnapshot: clone(contract.productionSnapshot),
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    schemaVersion: 'YALKEN_R24_C2B3B_CURRENT_HEAD_EVALUATION_V1',
    sourceBindings: clone(contract.sourceBindings),
    sourceEvidenceStampIds: [...SOURCE_EVIDENCE_STAMP_IDS],
    stageId: 'C2B3B',
    unprovenClaimPolicy: clone(contract.unprovenClaimPolicy)
  };
}

function entryWithDigest(entry) {
  return { ...entry, entryDigest: sha256(canonicalBytes(entry)) };
}

function buildLedger(inputs, evaluation) {
  const prior = inputs.c2b3aLedger.value.entries.at(-1);
  assert(prior?.entryDigest && Number.isInteger(prior.sequence), 'E_C2B3A_LEDGER_TAIL', 'missing');
  let predecessorEntryDigest = prior.entryDigest;
  const entries = evaluation.lanes.map((lane, index) => {
    const entry = entryWithDigest({
      contourId: lane.contourId,
      correctionId: `C2B3B-RECERTIFICATION-${String(index + 1).padStart(4, '0')}`,
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
    c2b3aPredecessor: {
      finalEntryDigest: inputs.c2b3aLedger.value.finalEntryDigest,
      recertificationLedgerDigest: inputs.c2b3aLedger.digest,
      tailEntryDigest: prior.entryDigest,
      tailSequence: prior.sequence
    },
    entries,
    finalEntryDigest: entries.at(-1).entryDigest,
    ledgerId: 'YALKEN_R24_C2B3B_P_S_K_RECERTIFICATION_LEDGER_V1',
    ownerAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
    rawAndEffectiveMutationForbidden: true,
    schemaVersion: 'YALKEN_R24_C2B3B_RECERTIFICATION_LEDGER_V1',
    sourceEvidenceStampIds: [...SOURCE_EVIDENCE_STAMP_IDS]
  };
}

export function buildArtifacts(inputs = loadInputs(), results = expectedPassResults()) {
  const envelopeById = validateInputs(inputs);
  const contract = buildContract(inputs);
  const evaluation = buildEvaluation(inputs, results, contract, envelopeById);
  const ledger = buildLedger(inputs, evaluation);
  assert(evaluation.counts.lanes === 7 && evaluation.counts.currentHeadPass === 7 && evaluation.counts.tests === 96, 'E_P_S_K_NOT_CURRENT', canonicalize(evaluation.counts));
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
    decision: 'C2B3B_P_S_K_BATCH_CURRENT_HEAD_RECERTIFIED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    schemaVersion: 'YALKEN_R24_C2B3B_CURRENT_HEAD_RECERTIFICATION_RESULT_V1',
    signals: {
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'REQUIRES_POST_MERGE_EXTERNAL_C2B3B_ATTESTATION',
      P_S_K_BATCH_CURRENT_HEAD_RECERTIFIED: true
    },
    status: 'CURRENT_HEAD_EVALUATED'
  };
}

function writeCanonical(repoRoot, relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value));
}

function approvedPaths() {
  return [PATHS.contract, PATHS.evaluation, PATHS.inventory, PATHS.ledger, PATHS.script, PATHS.stageAdmission, PATHS.stageInstance, PATHS.test].sort(lexical);
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
  const rationale = 'C2B3B exact admitted P0 P1 P2 P3 S0 S1 K0 current-head evaluation, immutable historical plan truth, append-only recertification ledger, and semantic falsification tests; no product truth or lifecycle mutation.';
  return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), version: 'v1.0' };
}

function isOwnActiveApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry?.rationale === 'string'
    && entry.rationale.startsWith('C2B3B exact admitted current-head recertification under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', PATHS.activeApprovals);
  const paths = [...approvedPaths(), PATHS.approvals].sort(lexical);
  const supersededPaths = new Set(paths);
  const baseApprovals = current.approvals.filter((entry) => !isOwnActiveApproval(entry) && !supersededPaths.has(entry.filePath));
  const rationale = `C2B3B exact admitted current-head recertification under StageInstance ${STAGE_INSTANCE_DIGEST}; raw and effective lifecycle state remain immutable and no product truth expands.`;
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
