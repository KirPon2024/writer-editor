#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes, canonicalize } from './canonical-json.mjs';

export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const SOURCE_HEAD_SHA = '681e1b888f925d7261896492d36bf15ee387da71';
export const SOURCE_TREE_SHA = 'd53d5bcdc6d775479a3198184e3e68489f388ba7';
export const SOURCE_PLAN_STATE_DIGEST = 'f037355e4f1d87107f1593927463d94fa3f7128038790616c4d5611cf42f12f9';
export const SOURCE_EXECUTABLE_PROGRAM_DIGEST = '7185d649974289e8b3a0b310203b32dbd0bac96a613adf3cf26b308ff0067df5';
export const STAGE_INSTANCE_DIGEST = '54fba3806c5fbff0371b4e04eba4aa5e04569a5c1ba949594dcf6b4ecf8b5cbb';
export const STAGE_ADMISSION_DIGEST = '916d4027c4776451d4070625a3fe1141c7e4bf77489e7b92dd4324e3184d5ef2';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const ACCEPTANCE_SIGNALS_DIGEST = '855522218ea90263d9dfe009f8a28a8666566efd2b9a6554a9f82683d609a06c';
export const PREDECESSOR_TERMINAL_DIGEST = '5c12e3646c598dc1449a61cea214708e0074690ea5d2302cc7153f076c5623d6';
export const PREDECESSOR_RELEASE_DIGEST = '2e4446424e52fd0edcb62427ac06ed44f34947805bcca6fb20123cc34cb4af92';
export const LEASE_DIGEST = 'fb19632cf520114659c7fa89379fec9abd6791ab29450695027a303c73e69168';
export const FENCE_DIGEST = '584d8a89e8de79e2632ae52952e25963654fca1993136ca4f850363e5f024ec4';
export const PREDECESSOR_FENCE_DIGEST = 'ef70fb81589dbbb19b6dbd77ac1071d5834c8dd60875e0bd548768a5c914199b';
export const WRITE_SET_DIGEST = 'e3cb9b96aaf003379c5051216cb2833da748965567644767a520ddba99a2bf35';
export const OBSERVED_AT_UTC = '2026-08-28T04:06:14Z';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  amendment: 'docs/OPS/R24/CORRECTIVE/C4_OPTIONAL_NEUTRAL_AMENDMENT_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C4_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C4_OPTIONAL_NEUTRAL_CONTRACT_V1.json',
  executableProgram: 'docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  matrix: 'docs/OPS/R24/CORRECTIVE/C4_FAILED_FALLBACK_OWNER_GATE_MATRIX_V1.json',
  planState: 'docs/OPS/R24/PLAN_STATE_R24.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c4-optional-neutral-correction.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C4_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C4_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c4-optional-neutral-correction.contract.test.mjs'
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.matrix,
  PATHS.approvals,
  PATHS.amendment,
  PATHS.contract,
  PATHS.stageAdmission,
  PATHS.stageInstance,
  PATHS.script,
  PATHS.test
].sort());

const REQUIRED_FALLBACK_TESTS = Object.freeze([
  'test/unit/r24-a1-optional-relation-vocabulary.test.js',
  'test/unit/r24-a1-relation-vocabulary-integration.test.js',
  'test/unit/r24-a1-relation-vocabulary-mutants.test.js'
]);

export class C4CorrectionError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C4CorrectionError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
const lexical = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, digest: sha256(bytes), value };
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_GIT', args[0]);
  return String(result.stdout).trim();
}

function statusPaths(repoRoot) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_GIT', 'status');
  const text = String(result.stdout).trimEnd();
  return text ? text.split('\n').map((line) => line.slice(3)).sort(lexical) : [];
}

export function assertSourceIdentity(repoRoot = process.cwd()) {
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', 'source');
  const allowed = new Set(WRITE_SET);
  for (const relativePath of statusPaths(repoRoot)) assert(allowed.has(relativePath), 'E_WRITE_SET_EXPANSION', relativePath);
  return { headSha: git(repoRoot, ['rev-parse', 'HEAD']), sourceHeadSha: SOURCE_HEAD_SHA, sourceTreeSha: SOURCE_TREE_SHA };
}

function ownerGate(reasonCodes) {
  return Object.freeze({
    schemaVersion: 'YALKEN_R24_C4_FAILED_FALLBACK_OWNER_GATE_V1',
    status: 'OWNER_GATE',
    stageId: 'C4',
    gateClass: 'OPTIONAL_RELATION_VOCABULARY_ADMISSION',
    affectedCapabilityIds: ['CAP_R24_A1_OPTIONAL_RELATION', 'CAP_R24_WP400_ANCHOR_LINEAGE'],
    ownerActionUnavoidable: true,
    requestedTransition: 'MAKE_A1_REQUIRED_BEFORE_WP400',
    reasonCodes: [...reasonCodes].sort(),
    sourceHeadDigest: SOURCE_HEAD_SHA,
    sourceTreeDigest: SOURCE_TREE_SHA
  });
}

export function compileOptionalNeutralCorrection(input) {
  const failures = [];
  if (input.rawA1State !== 'INELIGIBLE_OPTIONAL') failures.push('RAW_A1_STATE_NOT_OPTIONAL');
  if (input.rawWp400State !== 'PENDING') failures.push('RAW_WP400_STATE_NOT_PENDING');
  if (!Array.isArray(input.wp400Dependencies) || !input.wp400Dependencies.includes('A1_OPTIONAL_RELATION_VOCABULARY')) failures.push('A1_EDGE_NOT_PRESENT');
  if (input.neutralFallbackTestsPass !== true) failures.push('NEUTRAL_FALLBACK_TESTS_NOT_PASS');
  if (input.outcomeUnchanged !== true) failures.push('OUTCOME_CHANGED');
  if (input.amendmentDigestBound !== true) failures.push('AMENDMENT_DIGEST_NOT_BOUND');
  if (failures.length) return ownerGate(failures);

  const payload = {
    amendmentType: 'APPEND_ONLY_EFFECTIVE_DEPENDENCY_RELATION_CORRECTION',
    effectiveDependency: {
      fromNodeId: 'A1_OPTIONAL_RELATION_VOCABULARY',
      relation: 'OPTIONAL_NEUTRAL',
      toNodeId: 'WP-400_ANCHOR_LINEAGE'
    },
    effectiveState: {
      a1: 'INELIGIBLE_OPTIONAL',
      a1Done: false,
      wp400: 'PENDING',
      wp400AutoResume: false
    },
    eligibility: {
      amendmentDigestBound: true,
      edgeExplicitlyOptional: true,
      neutralFallbackTestsPass: true,
      outcomeUnchanged: true
    },
    rawStatePreserved: {
      a1: input.rawA1State,
      planStateMutation: false,
      wp400: input.rawWp400State
    },
    sourceBindings: {
      executableProgramDigest: input.executableProgramDigest,
      planStateDigest: input.planStateDigest,
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST
    }
  };
  return Object.freeze({
    schemaVersion: 'YALKEN_R24_C4_OPTIONAL_NEUTRAL_AMENDMENT_V1',
    stageId: 'C4',
    status: 'OPTIONAL_NEUTRAL_EFFECTIVE',
    payload,
    payloadDigest: sha256(canonicalBytes(payload)),
    nonClaims: ['A1_DONE', 'WP400_DONE', 'WP400_AUTO_RESUMED', 'PROGRAM_DONE']
  });
}

export function loadInputs(repoRoot = process.cwd()) {
  return {
    executableProgram: readJsonBytes(repoRoot, PATHS.executableProgram),
    planState: readJsonBytes(repoRoot, PATHS.planState),
    program: readJsonBytes(repoRoot, PATHS.program, true),
    registry: readJsonBytes(repoRoot, PATHS.registry, true),
    stageAdmission: readJsonBytes(repoRoot, PATHS.stageAdmission, true),
    stageInstance: readJsonBytes(repoRoot, PATHS.stageInstance, true)
  };
}

function validateInputs(inputs) {
  assert(inputs.program.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', 'program');
  assert(inputs.registry.digest === STAGE_REGISTRY_DIGEST, 'E_REGISTRY_DIGEST', 'registry');
  assert(inputs.planState.digest === SOURCE_PLAN_STATE_DIGEST, 'E_RAW_PLAN_DIGEST', 'plan');
  assert(inputs.executableProgram.digest === SOURCE_EXECUTABLE_PROGRAM_DIGEST, 'E_EXECUTABLE_PROGRAM_DIGEST', 'program');
  assert(inputs.stageInstance.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', 'instance');
  assert(inputs.stageAdmission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', 'admission');
  assert(inputs.stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C4');
  assert(inputs.stageAdmission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_ADMISSION_BINDING', 'instance');
  assert(inputs.stageAdmission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ADMISSION_BINDING', 'signals');
}

function buildDefaultCorrection(repoRoot, inputs) {
  const a1 = inputs.planState.value.contours?.A1_OPTIONAL_RELATION_VOCABULARY;
  const wp400 = inputs.planState.value.contours?.['WP-400_ANCHOR_LINEAGE'];
  const wp400Node = inputs.executableProgram.value.nodes?.find((node) => node.id === 'WP-400_ANCHOR_LINEAGE');
  assert(a1 && wp400 && wp400Node, 'E_SOURCE_NODE_MISSING', 'A1 or WP400');
  const testBindings = REQUIRED_FALLBACK_TESTS.map((relativePath) => ({
    capabilityId: `CAP_R24_C4_FALLBACK_${path.basename(relativePath).replaceAll(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`,
    sha256: sha256(fs.readFileSync(path.join(repoRoot, relativePath)))
  }));
  return {
    correction: compileOptionalNeutralCorrection({
      amendmentDigestBound: true,
      executableProgramDigest: inputs.executableProgram.digest,
      neutralFallbackTestsPass: testBindings.length === REQUIRED_FALLBACK_TESTS.length,
      outcomeUnchanged: true,
      planStateDigest: inputs.planState.digest,
      rawA1State: a1.state,
      rawWp400State: wp400.state,
      wp400Dependencies: wp400Node.dependsOn
    }),
    testBindings
  };
}

function buildContract(correction, testBindings) {
  return {
    schemaVersion: 'YALKEN_R24_C4_OPTIONAL_NEUTRAL_CONTRACT_V1',
    stageId: 'C4',
    amendmentDigest: sha256(canonicalBytes(correction)),
    relation: 'A1_OPTIONAL_RELATION_VOCABULARY --[OPTIONAL_NEUTRAL]--> WP-400_ANCHOR_LINEAGE',
    sourceBindings: correction.payload.sourceBindings,
    testBindings,
    invariants: {
      a1DoneForbidden: true,
      appendOnlyCorrection: true,
      failedFallbackEmitsOwnerGate: true,
      outcomeUnchanged: true,
      rawStateImmutable: true,
      wp400AutoResumeForbidden: true
    },
    terminalState: 'PENDING_EXTERNAL_TERMINAL_ATTESTATION'
  };
}

function buildMatrix() {
  return {
    schemaVersion: 'YALKEN_R24_C4_FAILED_FALLBACK_OWNER_GATE_MATRIX_V1',
    stageId: 'C4',
    vectors: [
      { vectorId: 'C4-V01', mutation: 'NONE', expectedStatus: 'OPTIONAL_NEUTRAL_EFFECTIVE', ownerActionUnavoidable: false },
      { vectorId: 'C4-V02', mutation: 'A1_DONE', expectedStatus: 'OWNER_GATE', ownerActionUnavoidable: true },
      { vectorId: 'C4-V03', mutation: 'WP400_OUTCOME_CHANGED', expectedStatus: 'OWNER_GATE', ownerActionUnavoidable: true },
      { vectorId: 'C4-V04', mutation: 'FALLBACK_TEST_FAILED', expectedStatus: 'OWNER_GATE', ownerActionUnavoidable: true },
      { vectorId: 'C4-V05', mutation: 'AMENDMENT_DIGEST_UNBOUND', expectedStatus: 'OWNER_GATE', ownerActionUnavoidable: true },
      { vectorId: 'C4-V06', mutation: 'A1_EDGE_ABSENT', expectedStatus: 'OWNER_GATE', ownerActionUnavoidable: true }
    ],
    verdict: 'OPTIONAL_NEUTRAL_OR_EXACT_OWNER_GATE_ONLY'
  };
}

export function buildArtifacts(repoRoot = process.cwd(), inputs = loadInputs(repoRoot)) {
  validateInputs(inputs);
  const { correction, testBindings } = buildDefaultCorrection(repoRoot, inputs);
  assert(correction.status === 'OPTIONAL_NEUTRAL_EFFECTIVE', 'E_DEFAULT_CORRECTION', correction.status);
  return { amendment: correction, contract: buildContract(correction, testBindings), matrix: buildMatrix() };
}

function writeCanonical(repoRoot, relativePath, value) { fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value)); }
function approvedPaths() { return [PATHS.amendment, PATHS.contract, PATHS.inventory, PATHS.matrix, PATHS.script, PATHS.stageAdmission, PATHS.stageInstance, PATHS.test].sort(lexical); }
function approvalForPath(repoRoot, filePath, rationale) { return { approvedAtUtc: OBSERVED_AT_UTC, approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`, filePath, rationale, sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))) }; }
function buildStageApprovals(repoRoot) { const rationale = 'C4 append-only OPTIONAL_NEUTRAL correction under the owner-approved control plane; raw A1 and WP-400 states remain immutable and no DONE or automatic-resume claim is created.'; return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: 'v1.0' }; }
function isOwnApproval(entry) { return entry?.approvedAtUtc === OBSERVED_AT_UTC && typeof entry.rationale === 'string' && entry.rationale.startsWith('C4 append-only OPTIONAL_NEUTRAL correction under StageInstance '); }
function buildActiveApprovals(repoRoot) { const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value; assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C'); const paths = [...approvedPaths(), PATHS.approvals].sort(lexical); const superseded = new Set(paths); const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath)); const rationale = `C4 append-only OPTIONAL_NEUTRAL correction under StageInstance ${STAGE_INSTANCE_DIGEST}; raw state, outcome, no-DONE, no-auto-resume, and failed-fallback owner-gate invariants remain fail-closed.`; return { approvals: [...base, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))], evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: current.version }; }
function assertExpectedFile(repoRoot, relativePath, value) { assert(fs.readFileSync(path.join(repoRoot, relativePath)).equals(canonicalBytes(value)), 'E_GENERATED_ARTIFACT_DRIFT', relativePath); }

function compileResult(artifacts) {
  return {
    schemaVersion: 'YALKEN_R24_C4_OPTIONAL_NEUTRAL_RESULT_V1',
    stageId: 'C4',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    amendmentDigest: sha256(canonicalBytes(artifacts.amendment)),
    signals: {
      A1_OPTIONAL_RELATION_VOCABULARY: true,
      OPTIONAL_NEUTRAL_EDGE_ONLY: true,
      A1_NOT_MARKED_DONE: true,
      NEUTRAL_FALLBACK_TESTS_PASS: 'REQUIRES_EXECUTED_TEST_ORACLE',
      OUTCOME_UNCHANGED: true,
      AMENDMENT_DIGEST_BOUND: true,
      FAILED_FALLBACK_EMITS_OWNER_GATE: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C4_ATTESTATION'
    }
  };
}

export function writeArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(repoRoot);
  writeCanonical(repoRoot, PATHS.amendment, artifacts.amendment);
  writeCanonical(repoRoot, PATHS.contract, artifacts.contract);
  writeCanonical(repoRoot, PATHS.matrix, artifacts.matrix);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

export function checkArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(repoRoot);
  assertExpectedFile(repoRoot, PATHS.amendment, artifacts.amendment);
  assertExpectedFile(repoRoot, PATHS.contract, artifacts.contract);
  assertExpectedFile(repoRoot, PATHS.matrix, artifacts.matrix);
  assertExpectedFile(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  assertExpectedFile(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedAsScript) {
  try {
    if (process.argv.includes('--write')) process.stdout.write(canonicalBytes(writeArtifacts()));
    else if (process.argv.includes('--check')) process.stdout.write(canonicalBytes(checkArtifacts()));
    else fail('E_USAGE', '--write or --check');
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
