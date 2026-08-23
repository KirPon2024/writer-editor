#!/usr/bin/env node
// R2.4 A0 corrective repair: committed executable-program source of truth.
// The legacy 32-stage DAG remains historical evidence only; the 109-node
// R2.4 executable graph below is the only machine-readable master program.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readJsonBounded, sha256hex, canonicalDigest, R24Error, HEX40_RE, HEX64_RE } from './canonical-json.mjs';
import { verifyApprovalReceipt } from './mission-contract.mjs';
import { selectNext } from './scheduler.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');
export const R24_DIR = path.join(REPO_ROOT, 'docs', 'OPS', 'R24');
export const LEGACY_PROGRAM_DAG_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'EVIDENCE',
  'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1',
  'PROGRAM_DAG.json',
);

export const EXPECTED_PROGRAM_ID = 'YALKEN-FINAL-EVOLUTIONARY-PROGRAM-R2.4';
export const EXPECTED_PROGRAM_DIGEST = '7185d649974289e8b3a0b310203b32dbd0bac96a613adf3cf26b308ff0067df5';
export const EXPECTED_MISSION_DIGEST = '2d188140211c4e2a65f0f1bf1bef5bac53e396e3c3887cb3563fa253a10b0c80';
export const EXPECTED_NODE_COUNT = 109;
export const EXPECTED_FOUNDATION_COUNT = 32;
export const EXPECTED_WORK_PACKAGE_COUNT = 77;

export const EXPECTED_R24_FILE_DIGESTS = Object.freeze({
  'AUDIT_DISPOSITION_R2_4.json': '0214a60d9614b0c7986fdbf77595fc344ae01eaafee06bb83f8b01037e9c23b6',
  'AUTHORITY_AND_SOURCE_BINDINGS_R2_4.json': 'a4f946314de3d5ba558f4c3ec97123d464f2a425c7c6b39bab149d32deb67160',
  'AUTONOMY_CONTROL_PLANE_R2_4.json': '2f189a055e2c465b2725fea2b0b4980c22737bfd4f691816fd70e138bec633d2',
  'AUTONOMY_RUNTIME_CONTRACT_R2_4.json': '74eab847a9f4eea03aaf2f63c4038e5f9c321e8fb0b1e536e0a58106f9b55b65',
  'CI_LIVE_BINDING_COMPILER_R2_4.json': 'be0a8a79044e3d8a6be95ff023888b3b7f84a81f6f293a1978c3f5df15043476',
  'CLAIM_REGISTRY_R2_4.json': '051e42a39e241d34c7161e3b4823c156ce6357af1d141dd2b88a11c084a897b6',
  'CURRENT_CHECKPOINT_R2_4.json': '83255bd441b5946cfac9c05a37aa3bec919b991005fd6e5c1c05f49c278e686f',
  'DOCUMENT_INVENTORY_R2_4.json': '9311f871517faa161adb614f8dde225a755a44626510d07486df2c37f823023f',
  'EVIDENCE_AND_RECEIPT_CONTRACT_R2_4.json': 'fb6ab27e2c5a55a192aac8a224f63b4c4bf32c769e32fc6268a5f80d87cbcd3d',
  'EXECUTABLE_PROGRAM_R2_4.json': EXPECTED_PROGRAM_DIGEST,
  'EXECUTION_ENVELOPES_R2_4.json': '0b2154eb93769ecb6a3b3164159cfe2c87d73c5345fdcb008af5576c630ae9d3',
  'MISSION_CONTRACT_R2_4.json': '981dd5c2f9e8d5071e79083c17daed1474d753d34610e1c456d3d07d0969a1ce',
  'OWNER_GATE_REGISTRY_R2_4.json': '4d8e3e0f7fcafb84f6e4b625af930b7a5fb06d64bbb5e59af6fe2940284315c8',
  'PACKAGE_MANIFEST_R2_4.json': 'a437bb4de86b12dd6027218f55ef55216e5b18c40b48fb33725ccc752c60e7ff',
  'PACKAGE_MUTATION_RECEIPT_R2_4.json': 'b2f37f8e9288fb6790b44df26cab59c5de5a3ca9e3e8229a5c6dc1ec62d7b95c',
  'PACKAGE_VERIFICATION_RECEIPT_R2_4.json': 'e78402f9f71b88a4b4ce1a8cfaa2eff56b5d90343c83bbbc4c530fb62ecd01bc',
  'PRODUCT_PROFILE_CUTS_R2_4.json': '612156616179239922406b1eb58afcd87e042e5f9d8073026f9d2dba452d2170',
  'TEST_ASSURANCE_MATRIX_R2_4.json': '29133d0b3f6c96891695e81a1191565843143826770ba6cb90cd286bcab80ca8',
});

export const ALLOWED_EVIDENCE_CLASSES = Object.freeze([
  'MODEL',
  'CONTRACT',
  'UNIT',
  'INTEGRATION',
  'FAULT_INJECTION',
  'PHYSICAL',
  'IMPLEMENTATION_MUTANTS',
  'INDEPENDENT_EXACT_HEAD',
  'POSTMERGE',
  'SURVIVOR_AUDIT',
  'PACKAGE_INTEGRITY',
]);

export const EXPECTED_DEPENDENCIES = Object.freeze({
  E0_RUNNER_SAFETY_QUARANTINE: ['R24C0_SEMANTIC_PACKAGE_CLOSURE'],
  V1_ATLAS_CLAIM_COMPILER: ['V0_WRITER_CLAIM_COMPILER', 'T1_ANCHOR_LINEAGE', 'A0_ATLAS_INCREMENTAL_EQUIVALENCE'],
  W0_WORD_PHYSICAL_RECERTIFICATION: ['V0_WRITER_CLAIM_COMPILER', 'P2_DURABLE_SAVE_COORDINATOR', 'T1_ANCHOR_LINEAGE'],
  V2_WORD_CLAIM_COMPILER: ['V0_WRITER_CLAIM_COMPILER', 'W0_WORD_PHYSICAL_RECERTIFICATION'],
  PK1_RELEASE_SECURITY_PHYSICAL: ['V0_WRITER_CLAIM_COMPILER', 'PK0_PACKAGE_CONTENT_TRUST', 'R6_MIGRATION_HISTORY_BACKUP_GC'],
  V3_PACKAGE_CLAIM_COMPILER: ['V0_WRITER_CLAIM_COMPILER', 'PK1_RELEASE_SECURITY_PHYSICAL'],
});

const repoRelative = (filePath) => path.relative(REPO_ROOT, filePath).split(path.sep).join('/');

export function sha256File(filePath) {
  return sha256hex(fs.readFileSync(filePath));
}

export function readR24Json(basename) {
  return readJsonBounded(path.join(R24_DIR, basename));
}

export function assertR24FileDigests({ expected = EXPECTED_R24_FILE_DIGESTS } = {}) {
  const actual = {};
  for (const [basename, sha256] of Object.entries(expected)) {
    const filePath = path.join(R24_DIR, basename);
    if (!fs.existsSync(filePath)) throw new R24Error('E_R24_SOT_FILE_MISSING', basename);
    const digest = sha256File(filePath);
    actual[basename] = digest;
    if (digest !== sha256) throw new R24Error('E_R24_SOT_DIGEST_MISMATCH', `${basename}:${digest} != ${sha256}`);
  }
  return actual;
}

function assertArray(value, code, detail) {
  if (!Array.isArray(value)) throw new R24Error(code, detail);
  return value;
}

function assertSameSet(actual, expected, code, detail) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (a.length !== e.length || a.some((item, index) => item !== e[index])) {
    throw new R24Error(code, `${detail}:${JSON.stringify(a)} != ${JSON.stringify(e)}`);
  }
}

function assertAcyclic(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new R24Error('E_R24_PROGRAM_GRAPH_CYCLE', id);
    const node = byId.get(id);
    if (!node) throw new R24Error('E_R24_PROGRAM_DEPENDENCY_MISSING', id);
    visiting.add(id);
    for (const dep of node.dependsOn) visit(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of nodes) visit(node.id);
}

export function assertExecutableProgramShape(program) {
  if (!program || typeof program !== 'object' || Array.isArray(program)) {
    throw new R24Error('E_R24_PROGRAM_SHAPE');
  }
  if (program.schemaVersion !== 'yalken.executable-program.r2.4') {
    throw new R24Error('E_R24_PROGRAM_SCHEMA', String(program.schemaVersion || ''));
  }
  if (program.programId !== EXPECTED_PROGRAM_ID) {
    throw new R24Error('E_R24_PROGRAM_ID', String(program.programId || ''));
  }
  if (program.missionDigest !== EXPECTED_MISSION_DIGEST || !HEX64_RE.test(program.missionDigest)) {
    throw new R24Error('E_R24_PROGRAM_MISSION_DIGEST', String(program.missionDigest || ''));
  }
  if (program.graphPolicy?.singleSourceOfTruth !== true || program.graphPolicy?.graphDerivedNextContourOnly !== true) {
    throw new R24Error('E_R24_GRAPH_POLICY');
  }
  const nodes = assertArray(program.nodes, 'E_R24_PROGRAM_NODES_REQUIRED', 'nodes');
  if (nodes.length !== EXPECTED_NODE_COUNT) throw new R24Error('E_R24_PROGRAM_NODE_COUNT', String(nodes.length));
  const sourceCoverage = program.sourceCoverage || {};
  if (sourceCoverage.executableNodeCount !== EXPECTED_NODE_COUNT
    || sourceCoverage.sourceWorkPackageBindings !== 81
    || sourceCoverage.sourceWorkPackageCount !== 81
    || sourceCoverage.aliases !== 4) {
    throw new R24Error('E_R24_SOURCE_COVERAGE_MISMATCH', JSON.stringify(sourceCoverage));
  }
  const ids = new Set();
  let foundation = 0;
  let workPackage = 0;
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw new R24Error('E_R24_PROGRAM_NODE_SHAPE');
    if (typeof node.id !== 'string' || node.id.length === 0) throw new R24Error('E_R24_PROGRAM_NODE_ID');
    if (ids.has(node.id)) throw new R24Error('E_R24_PROGRAM_DUPLICATE_NODE', node.id);
    ids.add(node.id);
    if (node.id === 'G0_AUTHORITY_CLOSURE') throw new R24Error('E_R24_G0_MUST_BE_GUARD_NOT_NODE');
    if (node.kind === 'FOUNDATION') foundation += 1;
    if (node.kind === 'WORK_PACKAGE') workPackage += 1;
    assertArray(node.dependsOn, 'E_R24_PROGRAM_DEPENDS_ON_SHAPE', node.id);
    for (const dep of node.dependsOn) {
      if (!nodes.some((candidate) => candidate.id === dep)) {
        throw new R24Error('E_R24_PROGRAM_DEPENDENCY_MISSING', `${node.id}->${dep}`);
      }
    }
    const classes = assertArray(
      node.evidenceContract?.requiredClasses,
      'E_R24_EVIDENCE_CLASSES_REQUIRED',
      node.id,
    );
    for (const evidenceClass of classes) {
      if (/^E[0-9]_/.test(String(evidenceClass))) throw new R24Error('E_R24_FORBIDDEN_LEGACY_EVIDENCE_ALIAS', `${node.id}:${evidenceClass}`);
      if (!ALLOWED_EVIDENCE_CLASSES.includes(evidenceClass)) throw new R24Error('E_R24_UNKNOWN_EVIDENCE_CLASS', `${node.id}:${evidenceClass}`);
    }
  }
  if (foundation !== EXPECTED_FOUNDATION_COUNT) throw new R24Error('E_R24_FOUNDATION_COUNT', String(foundation));
  if (workPackage !== EXPECTED_WORK_PACKAGE_COUNT) throw new R24Error('E_R24_WORK_PACKAGE_COUNT', String(workPackage));
  const root = nodes[0];
  if (root.id !== 'R24C0_SEMANTIC_PACKAGE_CLOSURE' || root.state !== 'DONE' || root.dependsOn.length !== 0) {
    throw new R24Error('E_R24_ROOT_NODE_MISMATCH', JSON.stringify(root));
  }
  for (const [nodeId, expectedDeps] of Object.entries(EXPECTED_DEPENDENCIES)) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new R24Error('E_R24_EXPECTED_NODE_MISSING', nodeId);
    assertSameSet(node.dependsOn, expectedDeps, 'E_R24_DEPENDENCY_RECONCILIATION_MISMATCH', nodeId);
  }
  assertAcyclic(nodes);
  const g0Guards = assertArray(program.guards, 'E_R24_GUARDS_REQUIRED', 'guards')
    .filter((guard) => guard?.id === 'G0_AUTHORITY_CLOSURE');
  if (g0Guards.length !== 1) throw new R24Error('E_R24_G0_GUARD_COUNT', String(g0Guards.length));
  const g0 = g0Guards[0];
  if (g0.kind !== 'RECURRING_ADMISSION_GUARD' || g0.requiredBeforeEveryMutationAttempt !== true) {
    throw new R24Error('E_R24_G0_GUARD_SEMANTICS', JSON.stringify(g0));
  }
  return {
    nodeCount: nodes.length,
    foundationCount: foundation,
    workPackageCount: workPackage,
    guardCount: g0Guards.length,
  };
}

export function loadExecutableProgram() {
  assertR24FileDigests();
  const programPath = path.join(R24_DIR, 'EXECUTABLE_PROGRAM_R2_4.json');
  const digest = sha256File(programPath);
  if (digest !== EXPECTED_PROGRAM_DIGEST) throw new R24Error('E_R24_PROGRAM_DIGEST', digest);
  const program = readJsonBounded(programPath);
  const summary = assertExecutableProgramShape(program);
  return { program, digest, summary, path: repoRelative(programPath) };
}

export function assertMissionApproval() {
  const contract = readR24Json('MISSION_CONTRACT_R2_4.json');
  const receipt = readR24Json('MISSION_APPROVAL_RECEIPT_R2_4.json');
  return verifyApprovalReceipt(contract, receipt, { expectedDigest: EXPECTED_MISSION_DIGEST });
}

export function summarizeLegacyGraphDivergence({
  legacyPath = LEGACY_PROGRAM_DAG_PATH,
  program = null,
} = {}) {
  const legacy = readJsonBounded(legacyPath);
  const executable = program || loadExecutableProgram().program;
  const legacyStages = Array.isArray(legacy.stages) ? legacy.stages : [];
  const legacyStageId = (stage) => stage?.id || stage?.stageId || null;
  const executableIds = new Set(executable.nodes.map((node) => node.id));
  const legacyIds = new Set(legacyStages.map(legacyStageId).filter(Boolean));
  const mismatches = [];
  for (const [nodeId, expectedDeps] of Object.entries(EXPECTED_DEPENDENCIES)) {
    const legacyStage = legacyStages.find((stage) => legacyStageId(stage) === nodeId);
    const executableNode = executable.nodes.find((node) => node.id === nodeId);
    if (!legacyStage || !executableNode) continue;
    const legacyDeps = legacyStage.dependsOn || [];
    const same = legacyDeps.length === expectedDeps.length && legacyDeps.every((dep) => expectedDeps.includes(dep));
    if (!same) {
      mismatches.push({ id: nodeId, legacyDependsOn: legacyDeps, executableDependsOn: executableNode.dependsOn });
    }
  }
  return {
    legacySchemaVersion: legacy.schemaVersion || null,
    legacyProgramId: legacy.programId || null,
    legacyStageCount: legacyStages.length,
    executableNodeCount: executable.nodes.length,
    legacyHasG0Stage: legacyIds.has('G0_AUTHORITY_CLOSURE'),
    executableHasG0Node: executableIds.has('G0_AUTHORITY_CLOSURE'),
    missingInLegacy: executable.nodes.map((node) => node.id).filter((id) => !legacyIds.has(id)),
    legacyNotExecutable: legacyStages.map(legacyStageId).filter((id) => id && !executableIds.has(id)),
    namedDependencyMismatches: mismatches,
  };
}

export function buildFullGraphContourStates({ program, planState }) {
  const externalContours = planState?.contours || {};
  const states = {};
  for (const node of program.nodes) {
    states[node.id] = externalContours[node.id]?.state || node.state;
  }
  return states;
}

export function buildCurrentG0Program(program) {
  const clone = structuredClone(program);
  clone.guards = clone.guards.map((guard) => (
    guard.id === 'G0_AUTHORITY_CLOSURE'
      ? { ...guard, state: 'CURRENT', authorityEpoch: 'REPO_COMMITTED_A0_FULL_GRAPH_VALIDATION' }
      : guard
  ));
  return clone;
}

export function buildSchedulerMission({
  missionContract,
  missionApproval,
  planState,
  contourStates,
  policyEpoch,
  policyDigest,
  graphDigest,
  schedulerGraphDigest,
  identityRoles,
  selectedProfiles = null,
}) {
  const profiles = selectedProfiles || [
    ...new Set([
      ...(missionContract.allowedProfilesBeforeRuntimeApproval || []),
      ...(missionContract.proposedProfilesAfterApproval || []),
      'ATLAS_FOUNDATION',
      'WORD_INTERCHANGE',
      'PACKAGED_RELEASE_SECURITY',
      'DORMANT_EXPANSION',
    ]),
  ];
  return {
    missionId: missionContract.missionId,
    missionDigest: missionContract.missionDigest,
    selectedProfiles: profiles,
    ownerGateApprovals: {},
    approved: missionApproval.approved === true,
    autonomyEnabled: false,
    stateRevision: planState.revision,
    fencingCounter: planState.fencingCounter,
    stateDigest: canonicalDigest(planState),
    contourStatesDigest: canonicalDigest(contourStates),
    policyEpoch,
    policyDigest,
    graphNodeCount: Object.keys(contourStates).length,
    graphDigest,
    schedulerGraphDigest,
    sourceOfTruthPath: 'docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json',
    identityRoles,
  };
}

export function buildSelectionReceiptOnFullGraph({ now, planState, implementationSourceSha = null }) {
  const { program, digest } = loadExecutableProgram();
  const missionContract = readR24Json('MISSION_CONTRACT_R2_4.json');
  const missionApproval = assertMissionApproval();
  const policy = readR24Json('AUTONOMY_CONTROL_PLANE_R2_4.json');
  const policyEpoch = policy?.policyEpoch?.epoch;
  if (!Number.isInteger(policyEpoch) || policyEpoch < 0) throw new R24Error('E_R24_POLICY_EPOCH_SHAPE');
  const evaluationHeadSha = git(['rev-parse', 'HEAD']);
  const evaluationTreeSha = git(['rev-parse', 'HEAD^{tree}']);
  if (!HEX40_RE.test(evaluationHeadSha) || !HEX40_RE.test(evaluationTreeSha)) throw new R24Error('E_R24_EVALUATION_IDENTITY_SHAPE');
  const sourceSha = implementationSourceSha || evaluationHeadSha;
  if (!HEX40_RE.test(sourceSha)) throw new R24Error('E_R24_IMPLEMENTATION_SOURCE_SHAPE');
  const committedPlanState = JSON.parse(git(['show', evaluationHeadSha + ':docs/OPS/R24/PLAN_STATE_R24.json']));
  if (canonicalDigest(committedPlanState) !== canonicalDigest(planState)) throw new R24Error('E_R24_SELECTION_STATE_NOT_AT_EVALUATION_HEAD');
  const contourStates = buildFullGraphContourStates({ program, planState });
  const identityRoles = {
    implementationSourceSha: sourceSha,
    evaluationHeadSha,
    evaluationTreeSha,
    prHeadSha: null,
    mergeSha: null,
    postmergeSha: null,
  };
  const receipt = selectNext({
    program: buildCurrentG0Program(program),
    contourStates,
    mission: buildSchedulerMission({
      missionContract,
      missionApproval,
      planState,
      contourStates,
      policyEpoch,
      policyDigest: sha256File(path.join(R24_DIR, 'AUTONOMY_CONTROL_PLANE_R2_4.json')),
      graphDigest: digest,
      schedulerGraphDigest: canonicalDigest(program.nodes),
      identityRoles,
    }),
    now,
  });
  if (receipt.selectedId !== null && !program.nodes.some((node) => node.id === receipt.selectedId)) {
    throw new R24Error('E_R24_SELECTION_NOT_IN_FULL_GRAPH', String(receipt.selectedId));
  }
  return receipt;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new R24Error('E_GIT', `${args.join(' ')}:${String(result.stderr || '').trim()}`);
  return String(result.stdout || '').trim();
}

export function validateCommittedR24Sot({ now = new Date().toISOString() } = {}) {
  const { program, digest, summary } = loadExecutableProgram();
  const approval = assertMissionApproval();
  const divergence = summarizeLegacyGraphDivergence({ program });
  if (divergence.legacyStageCount === EXPECTED_NODE_COUNT) throw new R24Error('E_R24_LEGACY_GRAPH_NOT_DISTINCT');
  if (divergence.executableHasG0Node) throw new R24Error('E_R24_G0_NODE_FORBIDDEN');
  const planStatePath = path.join(R24_DIR, 'PLAN_STATE_R24.json');
  const planState = readJsonBounded(planStatePath);
  const selectionReceipt = buildSelectionReceiptOnFullGraph({ now, planState });
  const headSha = git(['rev-parse', 'HEAD']);
  const originMainSha = git(['rev-parse', 'origin/main']);
  if (!HEX40_RE.test(headSha) || !HEX40_RE.test(originMainSha)) throw new R24Error('E_R24_HEAD_SHAPE');
  return {
    schemaVersion: 'yalken.r24.executable-program-sot.validation.v1',
    verdict: 'PASS',
    programDigest: digest,
    missionDigest: approval.digest,
    committedSotPath: 'docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json',
    nodeCount: summary.nodeCount,
    foundationCount: summary.foundationCount,
    workPackageCount: summary.workPackageCount,
    legacyStageCount: divergence.legacyStageCount,
    missingInLegacyCount: divergence.missingInLegacy.length,
    legacyNotExecutable: divergence.legacyNotExecutable,
    namedDependencyMismatchCount: divergence.namedDependencyMismatches.length,
    selectionVerdict: selectionReceipt.verdict,
    selectionKind: selectionReceipt.selectedKind,
    selectionId: selectionReceipt.selectedId,
    selectionReadySetCount: selectionReceipt.readySet.length,
    selectionStateRevision: selectionReceipt.stateRevision,
    selectionFencingCounter: selectionReceipt.fencingCounter,
    selectionPolicyEpoch: selectionReceipt.policyEpoch,
    selectionStateDigest: selectionReceipt.stateDigest,
    selectionGraphDigest: selectionReceipt.graphDigest,
    selectionEvaluationHeadSha: selectionReceipt.identityRoles.evaluationHeadSha,
    selectionEvaluationTreeSha: selectionReceipt.identityRoles.evaluationTreeSha,
    headSha,
    originMainSha,
    generatedAt: now,
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(token, next);
      index += 1;
    } else {
      args.set(token, 'true');
    }
  }
  const now = args.get('--now') || new Date().toISOString();
  const receipt = validateCommittedR24Sot({ now });
  process.stdout.write(`R24_A0_EXECUTABLE_PROGRAM_SOT_RECEIPT=${JSON.stringify(receipt)}\n`);
  return receipt;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    const code = error instanceof R24Error ? error.code : 'E_UNKNOWN';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exit(1);
  }
}
