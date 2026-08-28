#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes } from './canonical-json.mjs';

export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const SOURCE_HEAD_SHA = 'b6dd75f6ba3d649b3f7775ca410f5735ed488215';
export const SOURCE_TREE_SHA = '4b8a370ae0d5ddc50204d6c87eefe968bf212f33';
export const STAGE_INSTANCE_DIGEST = 'd0f950796e053ad973cdadcbdb7d238d79a324253f31c681f05bfa9bbdefe4c4';
export const STAGE_ADMISSION_DIGEST = 'eec2903a1d12296a40c8d4c64fe86b38a0de26d4af086b568924799f6f539127';
export const ACCEPTANCE_SIGNALS_DIGEST = 'c08d7642f8e7fd9570617bdca85bb91c588cf52614d104758a2f38e6a8478bb9';
export const WRITE_SET_DIGEST = 'd1f3ffbc52701254883d72029876bb4c7f2e4e86384f978455d21b2e2d7d122e';
export const PREDECESSOR_TERMINAL_DIGEST = '3bfd1aba55678263abc501331878edeb10ae6c2fab3587256be45d6995e9223a';
export const PREDECESSOR_RELEASE_DIGEST = '02a26d2ef5bc0bae43d423aad90fef79228c513d9da62b3bbc3be1ee4afd2603';
export const PREDECESSOR_FENCE_DIGEST = '557fbee3475d870cd028eb94e876eb8c8b96b72d23052b5a24cc80c501471a2e';
export const LEASE_DIGEST = 'b94f95af778ef30c6a6bcb5db4bd73cc4c83010b11d3e787370bd34e0c228582';
export const FENCE_DIGEST = '967ed0b5465ad5e1446bc18b0f35de0aa249f6fae42c95dfb89626f2afe2061b';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const OBSERVED_AT_UTC = '2026-08-28T09:47:31Z';

export const ACCEPTANCE_SIGNALS = Object.freeze([
  'PREFIX_OFFSET_ON',
  'UTF16_SEMANTICS',
  'HOSTILE_UNICODE_CASES_PASS',
  'EIGHT_K_AND_SIXTEEN_K_STABLE_LANE',
  'EXTERNAL_TERMINAL_ATTESTATION_VERIFIED',
]);

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C6A_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C6A_TEXT_FOLD_PREFIX_OFFSET_CONTRACT_V1.json',
  foldRoundtripTest: 'test/unit/r24-t0-fold-roundtrip.test.js',
  foldTapeTest: 'test/unit/r24-t0-text-fold-tape.test.js',
  implementation: 'src/core/text-fold-tape-v1.mjs',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  matrix: 'docs/OPS/R24/CORRECTIVE/C6A_TEXT_FOLD_PREFIX_OFFSET_MATRIX_V1.json',
  mutantTest: 'test/unit/r24-t0-fold-mutants.test.js',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c6a-text-fold-prefix-offset.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C6A_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C6A_STAGE_INSTANCE_V1.json',
  test: 'test/contracts/r24-c6a-text-fold-prefix-offset.contract.test.mjs',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.approvals,
  PATHS.stageAdmission,
  PATHS.stageInstance,
  PATHS.contract,
  PATHS.matrix,
  PATHS.script,
  PATHS.implementation,
  PATHS.test,
  PATHS.mutantTest,
].sort());

export class C6ATextFoldPrefixOffsetContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C6ATextFoldPrefixOffsetContractError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
const lexical = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, value, digest: sha256(bytes) };
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_GIT', args.join(' '));
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
  assert(git(repoRoot, ['rev-parse', 'origin/main']) === SOURCE_HEAD_SHA, 'E_ORIGIN_MAIN', 'source');
  const allowed = new Set(WRITE_SET);
  for (const relativePath of statusPaths(repoRoot)) assert(allowed.has(relativePath), 'E_WRITE_SET_EXPANSION', relativePath);
  return {
    headSha: git(repoRoot, ['rev-parse', 'HEAD']),
    sourceHeadSha: SOURCE_HEAD_SHA,
    sourceTreeSha: SOURCE_TREE_SHA,
  };
}

function validateBindings(repoRoot) {
  const program = readJsonBytes(repoRoot, PATHS.program, true);
  const registry = readJsonBytes(repoRoot, PATHS.registry, true);
  const stageInstance = readJsonBytes(repoRoot, PATHS.stageInstance, true);
  const stageAdmission = readJsonBytes(repoRoot, PATHS.stageAdmission, true);
  assert(program.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', 'program');
  assert(registry.digest === STAGE_REGISTRY_DIGEST, 'E_REGISTRY_DIGEST', 'registry');
  assert(stageInstance.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', 'instance');
  assert(stageAdmission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', 'admission');
  assert(stageInstance.value.stageId === 'C6A', 'E_STAGE_BINDING', 'instance-stage');
  assert(stageInstance.value.baseSha === SOURCE_HEAD_SHA, 'E_STAGE_BINDING', 'base');
  assert(stageInstance.value.headSha === SOURCE_HEAD_SHA, 'E_STAGE_BINDING', 'head');
  assert(stageInstance.value.treeSha === SOURCE_TREE_SHA, 'E_STAGE_BINDING', 'tree');
  assert(stageInstance.value.predecessorLeaseReleaseDigest === PREDECESSOR_RELEASE_DIGEST, 'E_STAGE_BINDING', 'predecessor-release');
  assert(stageInstance.value.predecessorFenceDigest === PREDECESSOR_FENCE_DIGEST, 'E_STAGE_BINDING', 'predecessor-fence');
  assert(stageInstance.value.dependencies?.length === 1, 'E_STAGE_BINDING', 'dependency-count');
  assert(stageInstance.value.dependencies[0]?.attestationDigest === PREDECESSOR_TERMINAL_DIGEST, 'E_STAGE_BINDING', 'predecessor-terminal');
  assert(stageInstance.value.dependencies[0]?.status === 'CERTIFIED_DONE', 'E_STAGE_BINDING', 'predecessor-status');
  assert(JSON.stringify(stageInstance.value.acceptanceSignals) === JSON.stringify(ACCEPTANCE_SIGNALS), 'E_STAGE_BINDING', 'signals');
  assert(JSON.stringify([...stageInstance.value.writeSet.paths].sort(lexical)) === JSON.stringify(WRITE_SET), 'E_STAGE_BINDING', 'write-set');
  assert(stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C6A');
  assert(stageAdmission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_ADMISSION_BINDING', 'instance');
  assert(stageAdmission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ADMISSION_BINDING', 'signals');
  assert(stageAdmission.value.writeSetDigest === WRITE_SET_DIGEST, 'E_ADMISSION_BINDING', 'write-set-digest');
  assert(stageAdmission.value.writeSetDigest === sha256(canonicalBytes(stageInstance.value.writeSet)), 'E_ADMISSION_BINDING', 'write-set');
  return { program, registry, stageInstance, stageAdmission };
}

function fileBinding(repoRoot, relativePath, capabilityId) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { capabilityId, sha256: sha256(bytes), sizeBytes: bytes.length };
}

function assertStructuralRepair(repoRoot) {
  const source = fs.readFileSync(path.join(repoRoot, PATHS.implementation), 'utf8');
  const anchors = [
    'const utf16PrefixOffsets = new Uint32Array(codePoints.length + 1);',
    'utf16PrefixOffsets[index + 1] = utf16PrefixOffsets[index] + codePoints[index].length;',
    'const utf16OffsetOf = (codePointIndex) => utf16PrefixOffsets[codePointIndex];',
  ];
  for (const anchor of anchors) assert(source.split(anchor).length - 1 === 1, 'E_PREFIX_TABLE_STRUCTURE', anchor);
  assert(!source.includes("codePoints.slice(0, codePointIndex).join('').length"), 'E_OLD_PREFIX_SLICE_PRESENT', PATHS.implementation);
}

function assertPathlessCapabilities(capabilityIds) {
  for (const capabilityId of Object.values(capabilityIds)) {
    assert(/^CAP_R24_[A-Z0-9_]+$/u.test(capabilityId), 'E_CAPABILITY_ID', capabilityId);
    assert(!/[\\/]/u.test(capabilityId), 'E_CAPABILITY_PATH_LEAK', capabilityId);
  }
}

function buildContract(repoRoot) {
  const capabilityIds = {
    hostileUnicodeRoundtrip: 'CAP_R24_TEXT_FOLD_HOSTILE_UNICODE_ROUNDTRIP',
    stablePerformanceLane: 'CAP_R24_TEXT_FOLD_8K_16K_STABLE_LANE',
    utf16PrefixOffsetTable: 'CAP_R24_TEXT_FOLD_UTF16_PREFIX_OFFSET_TABLE',
  };
  assertPathlessCapabilities(capabilityIds);
  const contract = {
    schemaVersion: 'YALKEN_R24_C6A_TEXT_FOLD_PREFIX_OFFSET_CONTRACT_V1',
    stageId: 'C6A',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    capabilityIds,
    signals: {
      PREFIX_OFFSET_ON: true,
      UTF16_SEMANTICS: true,
      HOSTILE_UNICODE_CASES_PASS: true,
      EIGHT_K_AND_SIXTEEN_K_STABLE_LANE: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C6A_ATTESTATION',
    },
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
      writeSetDigest: WRITE_SET_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      predecessorLeaseReleaseDigest: PREDECESSOR_RELEASE_DIGEST,
      predecessorFenceDigest: PREDECESSOR_FENCE_DIGEST,
      leaseDigest: LEASE_DIGEST,
      fenceDigest: FENCE_DIGEST,
      implementation: fileBinding(repoRoot, PATHS.implementation, 'CAP_R24_C6A_IMPLEMENTATION_BYTES'),
      contractTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C6A_CONTRACT_TEST_BYTES'),
      mutantTest: fileBinding(repoRoot, PATHS.mutantTest, 'CAP_R24_C6A_MUTANT_TEST_BYTES'),
      foldTapeRegressionTest: fileBinding(repoRoot, PATHS.foldTapeTest, 'CAP_R24_C6A_FOLD_TAPE_REGRESSION_BYTES'),
      foldRoundtripRegressionTest: fileBinding(repoRoot, PATHS.foldRoundtripTest, 'CAP_R24_C6A_FOLD_ROUNDTRIP_REGRESSION_BYTES'),
    },
    invariants: {
      prefixOffsetTableBuiltInOneForwardPass: true,
      prefixOffsetTableUsesUtf16CodeUnitLengths: true,
      oldQuadraticPrefixSliceStructurallyAbsent: true,
      disjointOutputSpanSlicesRemainAllowed: true,
      astralCombiningZwjDottedISigmaBidiAndCrlfCovered: true,
      hostileCoordinatesRoundtripOrRefuseTyped: true,
      eightKAndSixteenKUseWarmupAndMedian: true,
      oldSixteenKBehaviorRejectedByAbsoluteBudget: true,
      stableScalingRequired: true,
      sixNamedMutantsKilled: true,
      c6bNotAutoAdmitted: true,
      noUiSurfaceChange: true,
      noDependencyOrNetworkChange: true,
    },
    performanceBudget: {
      corpus: 'ALTERNATING_ASTRAL_AND_UPPERCASE_CODE_POINTS',
      warmupsPerLane: 2,
      samplesPerLane: 5,
      lanes: [
        { codePoints: 8192, absoluteThresholdMs: 600 },
        { codePoints: 16384, absoluteThresholdMs: 1000 },
      ],
      maxMedianScalingRatio: 2.75,
    },
    mutationEvidence: { total: 6, killed: 6, survived: [] },
    hostileUnicodeCases: ['ASTRAL', 'COMBINING', 'ZWJ', 'DOTTED_I', 'GREEK_SIGMA', 'BIDI', 'CRLF'],
    nextCutoverScope: 'C6B_NOT_AUTO_ADMITTED',
    terminalState: 'PENDING_POST_MERGE_EXTERNAL_C6A_ATTESTATION',
  };
  assertPathlessCapabilities(Object.fromEntries(Object.entries(contract.sourceBindings)
    .filter(([, binding]) => binding && typeof binding === 'object' && typeof binding.capabilityId === 'string')
    .map(([key, binding]) => [key, binding.capabilityId])));
  return contract;
}

function buildMatrix() {
  return {
    schemaVersion: 'YALKEN_R24_C6A_TEXT_FOLD_PREFIX_OFFSET_MATRIX_V1',
    stageId: 'C6A',
    vectors: [
      { vectorId: 'C6A-V01', mutation: 'ONE_PASS_UTF16_PREFIX_TABLE', expectedPrefixTable: true, expectedForwardPasses: 1 },
      { vectorId: 'C6A-V02', mutation: 'OLD_PREFIX_SLICE_EXPRESSION', expectedPresent: false },
      { vectorId: 'C6A-V03', mutation: 'UTF16_ASTRAL_COORDINATE_CASES', expectedCoordinateUnit: 'UTF16_CODE_UNITS', expectedRoundtrip: true },
      { vectorId: 'C6A-V04', mutation: 'HOSTILE_UNICODE_CORPUS', cases: ['ASTRAL', 'COMBINING', 'ZWJ', 'DOTTED_I', 'GREEK_SIGMA', 'BIDI', 'CRLF'], expectedPass: true },
      { vectorId: 'C6A-V05', mutation: 'HOSTILE_8192_CODE_POINT_LANE', warmups: 2, samples: 5, medianThresholdMs: 600 },
      { vectorId: 'C6A-V06', mutation: 'HOSTILE_16384_CODE_POINT_LANE', warmups: 2, samples: 5, medianThresholdMs: 1000 },
      { vectorId: 'C6A-V07', mutation: 'STABLE_MEDIAN_SCALING', maxMedianRatio: 2.75 },
      { vectorId: 'C6A-V08', mutation: 'SIX_NAMED_IMPLEMENTATION_MUTANTS', killed: 6, survived: 0 },
      { vectorId: 'C6A-V09', mutation: 'C6B_SCOPE_EXCLUSION', autoAdmittedNextStage: false },
    ],
    verdict: 'TEXT_FOLD_PREFIX_OFFSETS_USE_ONE_PASS_UTF16_TABLE_WITH_HOSTILE_UNICODE_AND_STABLE_8K_16K_EVIDENCE',
  };
}

export function buildArtifacts(repoRoot = process.cwd()) {
  validateBindings(repoRoot);
  assertStructuralRepair(repoRoot);
  return { contract: buildContract(repoRoot), matrix: buildMatrix() };
}

function parsePerformanceReceipt(output) {
  const match = output.match(/R24_C6A_PERFORMANCE_RECEIPT=(\{[^\n]+\})/u);
  assert(match, 'E_PERFORMANCE_RECEIPT', 'missing');
  const receipt = JSON.parse(match[1]);
  assert(receipt.schemaVersion === 'R24_C6A_PERFORMANCE_RECEIPT_V1', 'E_PERFORMANCE_RECEIPT', 'schema');
  assert(receipt.corpus === 'ALTERNATING_ASTRAL_AND_UPPERCASE_CODE_POINTS', 'E_PERFORMANCE_RECEIPT', 'corpus');
  assert(receipt.warmupsPerLane === 2 && receipt.samplesPerLane === 5, 'E_PERFORMANCE_RECEIPT', 'sampling');
  assert(JSON.stringify(receipt.lanes.map((lane) => lane.codePoints)) === JSON.stringify([8192, 16384]), 'E_PERFORMANCE_RECEIPT', 'lanes');
  assert(receipt.lanes.every((lane) => lane.withinThreshold === true), 'E_PERFORMANCE_RECEIPT', 'threshold');
  assert(receipt.stableScaling === true && receipt.scalingRatio <= receipt.maxScalingRatio, 'E_PERFORMANCE_RECEIPT', 'scaling');
  return receipt;
}

function runFocusedOracle(repoRoot) {
  const result = spawnSync(process.execPath, [
    '--test',
    '--test-concurrency=1',
    PATHS.test,
    PATHS.foldTapeTest,
    PATHS.foldRoundtripTest,
    PATHS.mutantTest,
  ], { cwd: repoRoot, encoding: 'utf8' });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  assert(result.status === 0, 'E_FOCUSED_ORACLE', output);
  const mutationMarker = 'R24_T0_MUTATION_RECEIPT={"total":6,"killed":6,"survived":[],"score":1}';
  assert(output.includes(mutationMarker), 'E_MUTATION_RECEIPT', 'expected 6/6');
  assert(/\bfail 0\b/u.test(output), 'E_FOCUSED_ORACLE', 'fail-count');
  assert(/\bskipped 0\b/u.test(output), 'E_FOCUSED_ORACLE', 'skip-count');
  assert(/\btodo 0\b/u.test(output), 'E_FOCUSED_ORACLE', 'todo-count');
  return {
    mutationReceipt: { total: 6, killed: 6, survived: [], score: 1 },
    performanceReceipt: parsePerformanceReceipt(output),
  };
}

function writeCanonical(repoRoot, relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value));
}

function approvedPaths() {
  return [
    PATHS.contract,
    PATHS.implementation,
    PATHS.inventory,
    PATHS.matrix,
    PATHS.mutantTest,
    PATHS.script,
    PATHS.stageAdmission,
    PATHS.stageInstance,
    PATHS.test,
  ].sort(lexical);
}

function approvalForPath(repoRoot, filePath, rationale) {
  return {
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath,
    rationale,
    sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))),
  };
}

function buildStageApprovals(repoRoot) {
  const rationale = `C6A one-pass UTF-16 text fold prefix offset repair under StageInstance ${STAGE_INSTANCE_DIGEST}; hostile Unicode coordinate semantics, deterministic six-mutant survivor proof, and stable 8K/16K median budgets remain fail-closed.`;
  return {
    approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: 'v1.0',
  };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry.rationale === 'string'
    && entry.rationale.startsWith('C6A one-pass UTF-16 text fold prefix offset repair under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(lexical);
  const superseded = new Set(paths);
  const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C6A one-pass UTF-16 text fold prefix offset repair under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, cumulative code-unit table, hostile Unicode correctness, performance receipt, and six-of-six mutant kill remain fail-closed.`;
  return {
    approvals: [...base, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))],
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: current.version,
  };
}

function assertExpectedFile(repoRoot, relativePath, value) {
  assert(fs.readFileSync(path.join(repoRoot, relativePath)).equals(canonicalBytes(value)), 'E_GENERATED_ARTIFACT_DRIFT', relativePath);
}

function compileResult(artifacts, oracle = null) {
  const result = {
    schemaVersion: 'YALKEN_R24_C6A_TEXT_FOLD_PREFIX_OFFSET_RESULT_V1',
    stageId: 'C6A',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
    leaseDigest: LEASE_DIGEST,
    fenceDigest: FENCE_DIGEST,
    contractDigest: sha256(canonicalBytes(artifacts.contract)),
    matrixDigest: sha256(canonicalBytes(artifacts.matrix)),
    signals: artifacts.contract.signals,
  };
  if (oracle) result.observedOracle = oracle;
  return result;
}

export function writeArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(repoRoot);
  writeCanonical(repoRoot, PATHS.contract, artifacts.contract);
  writeCanonical(repoRoot, PATHS.matrix, artifacts.matrix);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

export function checkArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(repoRoot);
  assertExpectedFile(repoRoot, PATHS.contract, artifacts.contract);
  assertExpectedFile(repoRoot, PATHS.matrix, artifacts.matrix);
  assertExpectedFile(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  assertExpectedFile(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts, runFocusedOracle(repoRoot));
}

function main() {
  try {
    const repoRoot = process.cwd();
    const mode = process.argv[2];
    assert(mode === '--write' || mode === '--check', 'E_USAGE', '--write or --check');
    const result = mode === '--write' ? writeArtifacts(repoRoot) : checkArtifacts(repoRoot);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ code: error.code || 'E_C6A_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
