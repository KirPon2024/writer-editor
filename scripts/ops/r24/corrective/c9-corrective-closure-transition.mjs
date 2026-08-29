#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalDigest } from '../canonical-json.mjs';
import { selectNext } from '../scheduler.mjs';
import { buildInventory } from '../test-inventory.mjs';
import { canonicalBytes } from './canonical-json.mjs';
import { verifyStageAdmission } from './stage-admission-verifier.mjs';

export const STAGE_ID = 'C9';
export const OBSERVED_AT_UTC = '2026-08-29T06:35:30Z';
export const SOURCE_HEAD_SHA = '5b62f3add89d4330db1940ab720952ac7f5b82a5';
export const SOURCE_TREE_SHA = 'd8575f3003b2a7d8a9a3783dae45746a3dc50237';
export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const VERIFIER_CODE_DIGEST = '82e49d577b79b41b26b67e25b7ce0fd81f26fb973232194fef8d96d6c563c6f9';
export const VERIFIER_CONTRACT_DIGEST = '925b4c23f1cad674720ee6a22fcd74cc2169b16bbc161be5d43535f20dd2ee31';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const STAGE_INSTANCE_DIGEST = '130d1080f9b5ebc9537af5e9b2290b37629f8cf2371c52b7b2f99ce4f212fcc1';
export const STAGE_ADMISSION_DIGEST = '3b3b53380c6572491e7184710d926377b44b72190e3a89ae14be575689a6ace8';
export const LEASE_DIGEST = 'ef5b38b90e0ae79a733ec49ed936b48c7350c55652fdc4d8e3552f7038d43a36';
export const FENCE_DIGEST = '53ddbe6043b4a8539c2e8af4bdcd7a6a4bb51d34bac2ff015bd89e022aa9f43f';
export const FENCE_COUNTER = 51;
export const C8Z_TERMINAL_DIGEST = '08810419ecb7ec3a983750347f189af0f539811968e5786a3e18843f47bf8d48';
export const C8Z_CERTIFIED_DONE_RECEIPT_DIGEST = '92ae468cd34d8ee5e15a976f5789b3e9d8f261565c975460a39614ac574602db';
export const C8Z_RELEASE_DIGEST = '5e8d7e57ea76a845ad133842612d52f1c8e0fb2417c9fa2f9895bbe9a3f38c2e';
export const EXECUTABLE_PROGRAM_BYTES_DIGEST = '7185d649974289e8b3a0b310203b32dbd0bac96a613adf3cf26b308ff0067df5';
export const PLAN_STATE_BYTES_DIGEST = 'f037355e4f1d87107f1593927463d94fa3f7128038790616c4d5611cf42f12f9';
export const RAW_STATES_DIGEST = '76a2d0f113a6151875bbf4cbbcd5325cba7e73e6f99224771d9d4c6b79b12041';
export const EFFECTIVE_STATES_DIGEST = 'd364bf424fa000ee59a2bf55f317e258edeb0de6eae332528172506d050b63ec';
export const EFFECTIVE_SCHEDULER_GRAPH_DIGEST = '6d68ccb113349bb31af10636f088534ed973445301552a708dfe9dac6a037fae';
export const EXPECTED_READY_SET = Object.freeze(['WP-400_ANCHOR_LINEAGE', 'WP-700_INTERCHANGE_IR']);
export const C4_AMENDMENT_DIGEST = 'b6a965295e8de7c6f456173d8c256434d55cb306d7992288e2858831a95f6f07';
export const C8B_CONTRACT_DIGEST = 'c027961bd3c7faa781962e86b325b844053268b8ea4d1b3a958d1861c627304a';
export const C8B_EVIDENCE_DIGEST = '90d52e4fc6d9521e051a3c3d76a5061e0f75c8384c83df67c04de98d093ee1b8';
export const C8B_TERMINAL_DIGEST = 'd83dcb271ae1067e41bdaf82e1dc787905721edb4880350646a7e3b18ec6d7b8';
export const C8Z_LEDGER_DIGEST = '1c3473824b556e811cc3506b53b7ce00f0f731771898186ed5050bf27e53fece';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';

const LOCAL_LEASE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/lease-c9-closure-main-product-transition-v1.json';
const LOCAL_FENCE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/fence-c9-closure-main-product-transition-v1.json';
const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C9_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  c4Amendment: 'docs/OPS/R24/CORRECTIVE/C4_OPTIONAL_NEUTRAL_AMENDMENT_V1.json',
  c8bContract: 'docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_CONTRACT_V1.json',
  c8bEvidence: 'docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_EVIDENCE_V1.json',
  c8zLedger: 'docs/OPS/R24/CORRECTIVE/C8Z_RECERTIFICATION_LEDGER_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C9_CORRECTIVE_CLOSURE_CONTRACT_V1.json',
  effectiveState: 'docs/OPS/R24/CORRECTIVE/C9_EFFECTIVE_STATE_V1.json',
  evaluation: 'docs/OPS/R24/CORRECTIVE/C9_CURRENT_HEAD_EVALUATION_V1.json',
  executableProgram: 'docs/OPS/R24/EXECUTABLE_PROGRAM_R2_4.json',
  freshG0: 'docs/OPS/R24/CORRECTIVE/C9_FRESH_G0_RECEIPT_V1.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  mainBinding: 'docs/OPS/R24/CORRECTIVE/C9_MAIN_PRODUCT_AUTHORITY_BINDING_V1.json',
  mainRegistry: 'docs/OPS/R24/CORRECTIVE/C9_MAIN_PRODUCT_STAGE_REGISTRY_V1.json',
  mainTemplate: 'docs/OPS/R24/CORRECTIVE/C9_MAIN_PRODUCT_AUTHORITY_TEMPLATE_V1.json',
  newEpoch: 'docs/OPS/R24/CORRECTIVE/C9_NEW_AUTHORITY_POLICY_EPOCH_V1.json',
  planState: 'docs/OPS/R24/PLAN_STATE_R24.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  programVerdict: 'docs/OPS/R24/CORRECTIVE/C9_PROGRAM_VERDICT_V1.json',
  readySet: 'docs/OPS/R24/CORRECTIVE/C9_READY_SET_SELECTION_V1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c9-corrective-closure-transition.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C9_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C9_STAGE_INSTANCE_V1.json',
  standing: 'docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json',
  test: 'test/contracts/r24-c9-corrective-closure-transition.contract.test.mjs',
  trust: 'docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json',
  verifier: 'scripts/ops/r24/corrective/stage-admission-verifier.mjs',
  wp400Admission: 'docs/OPS/R24/CORRECTIVE/C9_WP400_STAGE_ADMISSION_ATTESTATION_V1.json',
  wp400Instance: 'docs/OPS/R24/CORRECTIVE/C9_WP400_STAGE_INSTANCE_V1.json',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory, PATHS.activeApprovals, PATHS.contract, PATHS.evaluation,
  PATHS.effectiveState, PATHS.freshG0, PATHS.approvals, PATHS.mainBinding,
  PATHS.mainTemplate, PATHS.mainRegistry, PATHS.newEpoch, PATHS.programVerdict,
  PATHS.readySet, PATHS.stageAdmission, PATHS.stageInstance, PATHS.wp400Admission,
  PATHS.wp400Instance, PATHS.script, PATHS.test,
].sort(LEXICAL));

export const WP400_WRITE_SET = Object.freeze([
  'src/core/atlas-anchor-lineage-v1.mjs',
  'src/core/runtime.mjs',
  'test/unit/r24-wp400-anchor-lineage-mutants.test.js',
  'test/unit/r24-wp400-anchor-lineage.test.js',
].sort(LEXICAL));

export class C9TransitionError extends Error {
  constructor(code, detail = '') { super(detail ? `${code}: ${detail}` : code); this.code = code; }
}
function fail(code, detail) { throw new C9TransitionError(code, detail); }
function assert(condition, code, detail = '') { if (!condition) fail(code, detail); }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function isHex40(value) { return typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value); }
function isHex64(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, digest: sha256(bytes), value };
}
function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000 });
  assert(result.status === 0, 'E_GIT', `${args.join(' ')}:${String(result.stderr || '').trim()}`);
  return String(result.stdout || '').trim();
}
function statusPaths(repoRoot) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8', timeout: 30000 });
  assert(result.status === 0, 'E_GIT', 'status');
  const output = String(result.stdout || '').trimEnd();
  return output ? output.split('\n').map((line) => line.slice(3)).sort(LEXICAL) : [];
}

export function assertPathlessPublicEvidence(value) {
  const visit = (candidate) => {
    if (typeof candidate === 'string') {
      assert(!candidate.includes('/Users/') && !candidate.includes('/Volumes/') && !candidate.includes('/private/') && !candidate.includes('\\'), 'E_PUBLIC_PATH_LEAK', candidate);
    } else if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (candidate && typeof candidate === 'object') Object.values(candidate).forEach(visit);
  };
  visit(value);
  return true;
}

function assertHeadContour(repoRoot) {
  assert(git(repoRoot, ['rev-parse', 'HEAD']) === SOURCE_HEAD_SHA, 'E_HEAD_DRIFT', SOURCE_HEAD_SHA);
  assert(git(repoRoot, ['rev-parse', 'HEAD^{tree}']) === SOURCE_TREE_SHA, 'E_TREE_DRIFT', SOURCE_TREE_SHA);
  assert(git(repoRoot, ['rev-parse', 'origin/main']) === SOURCE_HEAD_SHA, 'E_ORIGIN_MAIN_DRIFT', SOURCE_HEAD_SHA);
  for (const relativePath of statusPaths(repoRoot)) assert(WRITE_SET.includes(relativePath), 'E_DIRTY_PATH_OUTSIDE_WRITE_SET', relativePath);
  return true;
}

function fixedDigest(repoRoot, relativePath, expected, canonical = true) {
  const input = readJsonBytes(repoRoot, relativePath, canonical);
  assert(input.digest === expected, 'E_FIXED_BINDING', relativePath);
  return input;
}

function validateFixedInputs(repoRoot) {
  const program = fixedDigest(repoRoot, PATHS.program, PROGRAM_TEMPLATE_DIGEST);
  const registry = fixedDigest(repoRoot, PATHS.registry, STAGE_REGISTRY_DIGEST);
  fixedDigest(repoRoot, PATHS.trust, TRUST_MODEL_DIGEST);
  fixedDigest(repoRoot, PATHS.standing, OWNER_BINDING_DIGEST);
  const stageInstance = fixedDigest(repoRoot, PATHS.stageInstance, STAGE_INSTANCE_DIGEST);
  const stageAdmission = fixedDigest(repoRoot, PATHS.stageAdmission, STAGE_ADMISSION_DIGEST);
  const verifierBytes = fs.readFileSync(path.join(repoRoot, PATHS.verifier));
  assert(sha256(verifierBytes) === VERIFIER_CODE_DIGEST, 'E_FIXED_BINDING', PATHS.verifier);
  const replay = verifyStageAdmission({
    instanceBytes: stageInstance.bytes,
    instance: stageInstance.value,
    registryBytes: registry.bytes,
    registry: registry.value,
    programBytes: program.bytes,
    program: program.value,
  });
  assert(canonicalBytes(replay).equals(stageAdmission.bytes), 'E_STAGE_ADMISSION_REPLAY', STAGE_ID);
  assert(same(stageInstance.value.writeSet.paths, WRITE_SET), 'E_WRITE_SET', STAGE_ID);
  const leaseBytes = fs.readFileSync(LOCAL_LEASE);
  const fenceBytes = fs.readFileSync(LOCAL_FENCE);
  const lease = JSON.parse(leaseBytes);
  const fence = JSON.parse(fenceBytes);
  assert(sha256(leaseBytes) === LEASE_DIGEST && sha256(fenceBytes) === FENCE_DIGEST, 'E_LEASE_FENCE_DIGEST', STAGE_ID);
  assert(lease.status === 'ACTIVE' && fence.status === 'ACTIVE' && lease.oneWriter === true && fence.oneWriter === true
    && lease.wip === 1 && fence.wip === 1 && lease.fencingCounter === FENCE_COUNTER && fence.fencingCounter === FENCE_COUNTER
    && lease.stageAdmissionDigest === STAGE_ADMISSION_DIGEST && fence.stageAdmissionDigest === STAGE_ADMISSION_DIGEST, 'E_LEASE_FENCE_STATE', STAGE_ID);
  return { program, registry, stageAdmission, stageInstance };
}

function readStateInputs(repoRoot) {
  const executableProgram = fixedDigest(repoRoot, PATHS.executableProgram, EXECUTABLE_PROGRAM_BYTES_DIGEST, false);
  const planState = fixedDigest(repoRoot, PATHS.planState, PLAN_STATE_BYTES_DIGEST, false);
  const c4 = fixedDigest(repoRoot, PATHS.c4Amendment, C4_AMENDMENT_DIGEST);
  const c8bContract = fixedDigest(repoRoot, PATHS.c8bContract, C8B_CONTRACT_DIGEST);
  const c8bEvidence = fixedDigest(repoRoot, PATHS.c8bEvidence, C8B_EVIDENCE_DIGEST);
  const c8zLedger = fixedDigest(repoRoot, PATHS.c8zLedger, C8Z_LEDGER_DIGEST);
  assert(executableProgram.value.nodes?.length === 109 && planState.value.revision === 283 && planState.value.fencingCounter === 47, 'E_RAW_PROGRAM_IDENTITY', STAGE_ID);
  assert(c4.value.status === 'OPTIONAL_NEUTRAL_EFFECTIVE'
    && c4.value.payload?.effectiveDependency?.fromNodeId === 'A1_OPTIONAL_RELATION_VOCABULARY'
    && c4.value.payload?.effectiveDependency?.toNodeId === 'WP-400_ANCHOR_LINEAGE'
    && c4.value.payload?.effectiveDependency?.relation === 'OPTIONAL_NEUTRAL'
    && c4.value.payload?.rawStatePreserved?.planStateMutation === false, 'E_C4_OPTIONAL_NEUTRAL', STAGE_ID);
  assert(c8bContract.value.acceptanceSignals?.WORD_PHYSICAL_PASS === true
    && c8bEvidence.value.acceptanceSignals?.WORD_PHYSICAL_PASS === 'PASS', 'E_C8B_CERTIFICATION_INPUT', STAGE_ID);
  const c8bCurrent = c8zLedger.value.currentCertificationSet?.find((entry) => entry.stageId === 'C8B');
  assert(c8bCurrent?.status === 'CURRENT_HEAD_RECERTIFIED' && c8bCurrent.terminalAttestationBytesDigest === C8B_TERMINAL_DIGEST, 'E_C8B_TERMINAL_BINDING', STAGE_ID);
  return { c4, c8bContract, c8bEvidence, c8zLedger, executableProgram, planState };
}

function counts(states) {
  return Object.values(states).reduce((result, state) => {
    result[state] = (result[state] || 0) + 1;
    return result;
  }, {});
}

export function compileEffectiveState(inputs) {
  const rawStates = Object.fromEntries(Object.entries(inputs.planState.value.contours).map(([id, entry]) => [id, entry.state]));
  assert(canonicalDigest(rawStates) === RAW_STATES_DIGEST, 'E_RAW_STATE_DIGEST', STAGE_ID);
  const effectiveStates = { ...rawStates, W0_WORD_PHYSICAL_RECERTIFICATION: 'DONE' };
  assert(canonicalDigest(effectiveStates) === EFFECTIVE_STATES_DIGEST, 'E_EFFECTIVE_STATE_DIGEST', STAGE_ID);
  assert(rawStates.A1_OPTIONAL_RELATION_VOCABULARY === 'INELIGIBLE_OPTIONAL'
    && effectiveStates.A1_OPTIONAL_RELATION_VOCABULARY === 'INELIGIBLE_OPTIONAL'
    && rawStates['WP-400_ANCHOR_LINEAGE'] === 'PENDING' && effectiveStates['WP-400_ANCHOR_LINEAGE'] === 'PENDING', 'E_FALSE_DONE', STAGE_ID);
  const effectiveProgram = structuredClone(inputs.executableProgram.value);
  const wp400 = effectiveProgram.nodes.find((node) => node.id === 'WP-400_ANCHOR_LINEAGE');
  assert(wp400?.dependsOn?.includes('A1_OPTIONAL_RELATION_VOCABULARY'), 'E_WP400_RAW_OPTIONAL_EDGE', STAGE_ID);
  wp400.dependsOn = wp400.dependsOn.filter((id) => id !== 'A1_OPTIONAL_RELATION_VOCABULARY');
  effectiveProgram.guards = effectiveProgram.guards.map((guard) => guard.id === 'G0_AUTHORITY_CLOSURE'
    ? { ...guard, authorityEpoch: 'YALKEN_R24_MAIN_PRODUCT_AUTHORITY_EPOCH_C9_V1', state: 'CURRENT' }
    : guard);
  assert(canonicalDigest(effectiveProgram.nodes) === EFFECTIVE_SCHEDULER_GRAPH_DIGEST, 'E_EFFECTIVE_GRAPH_DIGEST', STAGE_ID);
  const artifact = {
    appendOnlyCorrections: [
      {
        correctionId: 'C8B_W0_CERTIFIED_CORRECTION',
        evidence: {
          contractDigest: C8B_CONTRACT_DIGEST,
          evidenceDigest: C8B_EVIDENCE_DIGEST,
          externalTerminalAttestationDigest: C8B_TERMINAL_DIGEST,
        },
        from: 'BLOCKED_TYPED',
        nodeId: 'W0_WORD_PHYSICAL_RECERTIFICATION',
        to: 'DONE',
      },
      {
        correctionId: 'C4_A1_OPTIONAL_NEUTRAL_DEPENDENCY',
        edge: {
          fromNodeId: 'A1_OPTIONAL_RELATION_VOCABULARY',
          relation: 'OPTIONAL_NEUTRAL',
          toNodeId: 'WP-400_ANCHOR_LINEAGE',
        },
        stateMutation: false,
      },
    ],
    effectiveGraph: {
      nodeCount: effectiveProgram.nodes.length,
      schedulerGraphDigest: EFFECTIVE_SCHEDULER_GRAPH_DIGEST,
      wp400EffectiveDependencies: [...wp400.dependsOn],
    },
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    effectiveState: {
      counts: counts(effectiveStates),
      digest: EFFECTIVE_STATES_DIGEST,
      states: effectiveStates,
    },
    observedAtUtc: OBSERVED_AT_UTC,
    rawState: {
      counts: counts(rawStates),
      digest: RAW_STATES_DIGEST,
      immutable: true,
      planStateBytesDigest: PLAN_STATE_BYTES_DIGEST,
      states: rawStates,
    },
    schemaVersion: 'YALKEN_R24_C9_EFFECTIVE_STATE_V1',
    stageId: STAGE_ID,
  };
  validateEffectiveState(artifact);
  return { artifact, effectiveProgram, effectiveStates };
}

export function validateEffectiveState(artifact) {
  assert(artifact.rawState?.immutable === true && artifact.rawState?.digest === RAW_STATES_DIGEST, 'E_RAW_STATE_IMMUTABILITY', STAGE_ID);
  assert(artifact.effectiveState?.digest === EFFECTIVE_STATES_DIGEST, 'E_EFFECTIVE_STATE', STAGE_ID);
  assert(artifact.rawState.states.A1_OPTIONAL_RELATION_VOCABULARY === 'INELIGIBLE_OPTIONAL'
    && artifact.effectiveState.states.A1_OPTIONAL_RELATION_VOCABULARY === 'INELIGIBLE_OPTIONAL'
    && artifact.effectiveState.states['WP-400_ANCHOR_LINEAGE'] === 'PENDING', 'E_FALSE_DONE', STAGE_ID);
  assert(artifact.appendOnlyCorrections?.length === 2 && artifact.appendOnlyCorrections[1].stateMutation === false, 'E_CORRECTION_SET', STAGE_ID);
  assert(artifact.effectiveGraph?.schedulerGraphDigest === EFFECTIVE_SCHEDULER_GRAPH_DIGEST
    && !artifact.effectiveGraph.wp400EffectiveDependencies.includes('A1_OPTIONAL_RELATION_VOCABULARY'), 'E_EFFECTIVE_GRAPH', STAGE_ID);
  return true;
}

function ownerGateApprovals() {
  return {
    BRAND_LICENSE_OWNER_CHOICE: 'APPROVED',
    ENTITLEMENT_SEMANTICS_ADR_OR_DENY: 'DENIED',
    LOCAL_RELEASE_PERMIT: 'APPROVED',
    STORAGE_AUTHORITY_ADR: 'APPROVED',
    WORD_PHYSICAL_SESSION_AUTHORITY: 'APPROVED',
  };
}

function buildFreshG0(effectiveStateBytes) {
  const receipt = {
    authority: {
      authorityEpoch: 'YALKEN_R24_MAIN_PRODUCT_AUTHORITY_EPOCH_C9_V1',
      fixedStandingAuthorityBindingDigest: OWNER_BINDING_DIGEST,
      noSelfAuthorization: true,
      scopeExpansion: false,
    },
    exactIdentity: {
      baseSha: SOURCE_HEAD_SHA,
      headSha: SOURCE_HEAD_SHA,
      originMainSha: SOURCE_HEAD_SHA,
      treeSha: SOURCE_TREE_SHA,
    },
    fencing: {
      counter: FENCE_COUNTER,
      fenceDigest: FENCE_DIGEST,
      leaseDigest: LEASE_DIGEST,
      oneWriter: true,
      wip: 1,
    },
    generatedAtUtc: OBSERVED_AT_UTC,
    guardId: 'G0_AUTHORITY_CLOSURE',
    inputs: {
      c8zCertifiedDoneReceiptDigest: C8Z_CERTIFIED_DONE_RECEIPT_DIGEST,
      c8zExternalTerminalAttestationDigest: C8Z_TERMINAL_DIGEST,
      c8zLeaseReleaseDigest: C8Z_RELEASE_DIGEST,
      effectiveStateDigest: sha256(effectiveStateBytes),
      executableProgramBytesDigest: EXECUTABLE_PROGRAM_BYTES_DIGEST,
      planStateBytesDigest: PLAN_STATE_BYTES_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    },
    schemaVersion: 'YALKEN_R24_C9_FRESH_G0_RECEIPT_V1',
    status: 'CURRENT',
  };
  validateFreshG0(receipt);
  return receipt;
}

export function validateFreshG0(receipt) {
  assert(receipt.schemaVersion === 'YALKEN_R24_C9_FRESH_G0_RECEIPT_V1' && receipt.status === 'CURRENT', 'E_G0_STATUS', STAGE_ID);
  assert(receipt.authority?.noSelfAuthorization === true && receipt.authority?.scopeExpansion === false, 'E_G0_AUTHORITY', STAGE_ID);
  assert(receipt.exactIdentity?.headSha === SOURCE_HEAD_SHA && receipt.exactIdentity?.treeSha === SOURCE_TREE_SHA
    && receipt.exactIdentity?.originMainSha === SOURCE_HEAD_SHA, 'E_G0_IDENTITY', STAGE_ID);
  assert(receipt.fencing?.counter === FENCE_COUNTER && receipt.fencing?.oneWriter === true && receipt.fencing?.wip === 1, 'E_G0_FENCE', STAGE_ID);
  assert(receipt.inputs?.c8zExternalTerminalAttestationDigest === C8Z_TERMINAL_DIGEST, 'E_G0_PREDECESSOR', STAGE_ID);
  assertPathlessPublicEvidence(receipt);
  return true;
}

function buildNewEpoch(effectiveStateBytes, freshG0Bytes, profiles) {
  const epoch = {
    authorityEpoch: {
      id: 'YALKEN_R24_MAIN_PRODUCT_AUTHORITY_EPOCH_C9_V1',
      predecessorFixedStandingAuthorityBindingDigest: OWNER_BINDING_DIGEST,
      sourceOwnerStatement: 'сразу даю все права на всё; не спрашивать по рутине',
      standingScope: 'EXACT_RATIFIED_V1_1_PROGRAM_AND_FRESH_GRAPH_SELECTED_NODE_ONLY',
    },
    correctionPolicy: {
      optionalNeutralDoesNotCreateDone: true,
      rawStateImmutable: true,
      stateCorrectionsAppendOnly: true,
      wp400NeverAutoResumes: true,
    },
    exactIdentity: { headSha: SOURCE_HEAD_SHA, treeSha: SOURCE_TREE_SHA },
    generatedAtUtc: OBSERVED_AT_UTC,
    ownerGateApprovals: ownerGateApprovals(),
    policyEpoch: 'YALKEN_R24_MAIN_PRODUCT_POLICY_EPOCH_C9_V1',
    scheduler: {
      autonomyEnabled: true,
      deterministicOrder: [
        'MANDATORY_SAFETY_CORRECTNESS', 'CUT_SET_UNBLOCK', 'EVIDENCE_DEFICIT_REDUCTION',
        'DEPENDENCY_CRITICALITY', 'BOUNDED_COST', 'STABLE_TOPOLOGICAL_RANK', 'STABLE_NODE_ID',
      ],
      selectedProfiles: profiles,
      wip: 1,
      writerCount: 1,
    },
    schemaVersion: 'YALKEN_R24_C9_NEW_AUTHORITY_POLICY_EPOCH_V1',
    sourceBindings: {
      effectiveStateArtifactDigest: sha256(effectiveStateBytes),
      fixedProgramTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      fixedStageRegistryDigest: STAGE_REGISTRY_DIGEST,
      fixedTrustModelDigest: TRUST_MODEL_DIGEST,
      fixedVerifierCodeDigest: VERIFIER_CODE_DIGEST,
      fixedVerifierContractDigest: VERIFIER_CONTRACT_DIGEST,
      freshG0Digest: sha256(freshG0Bytes),
    },
  };
  validateNewEpoch(epoch);
  return epoch;
}

export function validateNewEpoch(epoch) {
  assert(epoch.schemaVersion === 'YALKEN_R24_C9_NEW_AUTHORITY_POLICY_EPOCH_V1', 'E_EPOCH_SCHEMA', STAGE_ID);
  assert(epoch.authorityEpoch?.predecessorFixedStandingAuthorityBindingDigest === OWNER_BINDING_DIGEST
    && epoch.authorityEpoch?.standingScope === 'EXACT_RATIFIED_V1_1_PROGRAM_AND_FRESH_GRAPH_SELECTED_NODE_ONLY', 'E_EPOCH_AUTHORITY', STAGE_ID);
  assert(epoch.correctionPolicy?.rawStateImmutable === true && epoch.correctionPolicy?.optionalNeutralDoesNotCreateDone === true
    && epoch.correctionPolicy?.wp400NeverAutoResumes === true, 'E_EPOCH_POLICY', STAGE_ID);
  assert(epoch.scheduler?.autonomyEnabled === true && epoch.scheduler?.writerCount === 1 && epoch.scheduler?.wip === 1, 'E_EPOCH_CONCURRENCY', STAGE_ID);
  assertPathlessPublicEvidence(epoch);
  return true;
}

function buildSchedulerMission(effectiveProgram, effectiveStates, epoch, epochBytes, freshG0Bytes) {
  const basis = {
    authorityEpoch: epoch.authorityEpoch.id,
    effectiveStatesDigest: canonicalDigest(effectiveStates),
    freshG0Digest: sha256(freshG0Bytes),
    policyDigest: sha256(epochBytes),
    policyEpoch: epoch.policyEpoch,
    sourceHeadSha: SOURCE_HEAD_SHA,
    sourceTreeSha: SOURCE_TREE_SHA,
  };
  return {
    approved: true,
    autonomyEnabled: true,
    contourStatesDigest: canonicalDigest(effectiveStates),
    fencingCounter: FENCE_COUNTER,
    graphDigest: canonicalDigest(effectiveProgram),
    graphNodeCount: effectiveProgram.nodes.length,
    identityRoles: {
      evaluationHeadSha: SOURCE_HEAD_SHA,
      evaluationTreeSha: SOURCE_TREE_SHA,
      implementationSourceSha: SOURCE_HEAD_SHA,
      mergeSha: null,
      postmergeSha: null,
      prHeadSha: null,
    },
    missionDigest: canonicalDigest(basis),
    missionId: 'YALKEN-R2.4-C9-FRESH-GRAPH-SELECTION-2026-08-29',
    ownerGateApprovals: epoch.ownerGateApprovals,
    policyDigest: sha256(epochBytes),
    policyEpoch: FENCE_COUNTER,
    schedulerGraphDigest: canonicalDigest(effectiveProgram.nodes),
    selectedProfiles: epoch.scheduler.selectedProfiles,
    sourceOfTruthPath: PATHS.executableProgram,
    stateDigest: canonicalDigest({ effectiveStates, fencingCounter: FENCE_COUNTER, revision: 284 }),
    stateRevision: 284,
  };
}

export function buildReadySet(effectiveProgram, effectiveStates, epoch, epochBytes, freshG0Bytes) {
  const mission = buildSchedulerMission(effectiveProgram, effectiveStates, epoch, epochBytes, freshG0Bytes);
  const receipt = selectNext({ program: effectiveProgram, contourStates: effectiveStates, mission, now: OBSERVED_AT_UTC });
  assert(receipt.mode === 'AUTONOMOUS' && receipt.verdict === 'SELECTED' && receipt.selectedKind === 'NODE'
    && receipt.selectedId === 'WP-400_ANCHOR_LINEAGE' && same(receipt.readySet, EXPECTED_READY_SET), 'E_READY_SET_SELECTION', JSON.stringify(receipt));
  return receipt;
}

export function validateReadySet(receipt) {
  assert(receipt.schemaVersion === 'SelectionReceiptR2_4' && receipt.mode === 'AUTONOMOUS' && receipt.verdict === 'SELECTED', 'E_READY_SET_SCHEMA', STAGE_ID);
  assert(receipt.selectedId === 'WP-400_ANCHOR_LINEAGE' && same(receipt.readySet, EXPECTED_READY_SET), 'E_READY_SET_OR_SELECTION_DRIFT', STAGE_ID);
  assert(receipt.schedulerGraphDigest === EFFECTIVE_SCHEDULER_GRAPH_DIGEST && receipt.fencingCounter === FENCE_COUNTER, 'E_READY_SET_BINDING', STAGE_ID);
  return true;
}

function mainProductRegistry() {
  return {
    authorityTemplateId: 'OWNER_APPROVED_YALKEN_R24_MAIN_PRODUCT_READY_SET_C9_V1',
    globalRequiredStopConditions: [
      'AUTHORITY_UNAVAILABLE_OR_COMPROMISED',
      'BASE_HEAD_TREE_OR_DELTA_AMBIGUOUS',
      'CREDENTIAL_IDENTITY_OR_SECRET_REQUIRED',
      'DESTRUCTIVE_IRREVERSIBLE_OR_FORCE_ACTION_REQUIRED',
      'DIRTY_OR_PRESERVED_WIP_WOULD_BE_LOST',
      'EXACT_WRITE_SET_OR_COMMAND_SCOPE_WOULD_EXPAND',
      'EXTERNAL_EFFECT_OUTSIDE_ADMITTED_STAGE',
      'LEASE_FENCE_OR_ONE_WRITER_VIOLATION',
      'MATERIAL_SEMANTIC_DEVIATION_WITHOUT_OWNER_AMENDMENT',
      'MODEL_OR_REASONING_RUNTIME_MISMATCH',
      'REQUIRED_EVIDENCE_MISSING_STALE_SKIPPED_OR_SELF_AUTHORED',
    ],
    schemaVersion: 'YALKEN_R24_C9_MAIN_PRODUCT_STAGE_REGISTRY_V1',
    stages: [
      {
        allowDeletes: false,
        allowRenames: false,
        allowedCommandPrefixes: [
          'git add ', 'git commit ', 'git diff', 'git fetch origin', 'git push origin ', 'git rev-parse', 'git status',
          'gh pr checks', 'gh pr create', 'gh pr merge', 'gh pr view', 'node --test ', 'npm run agent:bootstrap',
          'npm run agent:guardrails', 'npm run agent:preflight', 'npm test',
        ],
        allowedCommands: [],
        allowedWritePaths: [...WP400_WRITE_SET],
        allowedWritePrefixes: [],
        authorityCeiling: [
          'BOUNDED_REPOSITORY_WRITE', 'BRANCH_WORKTREE', 'COMMIT', 'PUSH', 'PR_CREATE_OR_UPDATE',
          'PROTECTED_NORMAL_MERGE', 'READ_ONLY_GITHUB_API', 'BOUNDED_CI_OPERATION',
          'LOCAL_TEST_BUILD_EVIDENCE', 'NON_DESTRUCTIVE_LOCAL_TOOLCHAIN',
        ],
        dependencies: [],
        externalEffects: ['GIT_PUSH', 'GITHUB_PR', 'GITHUB_PROTECTED_MERGE', 'GITHUB_CI'],
        prBaseBranch: 'main',
        requiredAcceptanceSignals: [
          'STABLE_DURABLE_ANCHOR_IDENTITY', 'FALLIBLE_WITNESS_VALIDATION', 'RELOCATION_EXACT_OR_TYPED_LOST',
          'AMBIGUITY_REQUIRES_EXPLICIT_SELECTION', 'APPEND_ONLY_LINEAGE', 'NO_AUTO_REATTACH',
          'MODEL', 'CONTRACT', 'INTEGRATION', 'IMPLEMENTATION_MUTANTS', 'INDEPENDENT_EXACT_HEAD',
          'EXTERNAL_TERMINAL_ATTESTATION_VERIFIED', 'PROGRAM_VERDICT',
        ],
        requiredStopConditions: ['C9_CERTIFIED_MERGE_AND_FRESH_EXACT_BASE_AMENDMENT_REQUIRED'],
        stageId: 'WP-400_ANCHOR_LINEAGE',
        summary: 'Stable durable anchor identity with fallible relocation witnesses and explicit ambiguity selection.',
        targetRemote: 'origin',
      },
    ],
  };
}

function mainProductTemplate(registryDigest, readySetDigest) {
  return {
    authorityScope: {
      graphSelectedNode: 'WP-400_ANCHOR_LINEAGE',
      materialSemanticDeviationRequiresAppendOnlyOwnerAmendment: true,
      scopeExpansionForbidden: true,
      selfAuthorizationForbidden: true,
      wp400NeverAutoResumes: true,
    },
    fixedRuntime: { downgradeForbidden: true, model: 'gpt-5.6-sol', reasoningEffort: 'xhigh' },
    predecessor: {
      correctiveProgramTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      fixedStandingAuthorityBindingDigest: OWNER_BINDING_DIGEST,
      readySetSelectionDigest: readySetDigest,
    },
    programId: 'YALKEN_R24_MAIN_PRODUCT_READY_SET_C9_V1',
    schemaVersion: 'YALKEN_R24_C9_MAIN_PRODUCT_AUTHORITY_TEMPLATE_V1',
    stageAdmissionVerifier: { codeDigest: VERIFIER_CODE_DIGEST, contractDigest: VERIFIER_CONTRACT_DIGEST },
    stageRegistryDigest: registryDigest,
    trustModelDigest: TRUST_MODEL_DIGEST,
  };
}

function mainProductBinding(programDigest, registryDigest, readySetDigest) {
  return {
    authorityTemplateId: 'OWNER_APPROVED_YALKEN_R24_MAIN_PRODUCT_READY_SET_C9_V1',
    bindingRule: 'OWNER_STANDING_AUTHORITY_APPLIES_ONLY_TO_EXACT_GRAPH_SELECTED_TEMPLATE_REGISTRY_TRUST_AND_VERIFIER_DIGESTS',
    fixedDigests: {
      mainProductProgramTemplateDigest: programDigest,
      mainProductStageRegistryDigest: registryDigest,
      trustModelDigest: TRUST_MODEL_DIGEST,
      verifierCodeDigest: VERIFIER_CODE_DIGEST,
      verifierContractDigest: VERIFIER_CONTRACT_DIGEST,
    },
    noSelfAuthorization: true,
    predecessorFixedStandingAuthorityBindingDigest: OWNER_BINDING_DIGEST,
    readySetSelectionDigest: readySetDigest,
    schemaVersion: 'YALKEN_R24_C9_MAIN_PRODUCT_AUTHORITY_BINDING_V1',
    sourceOwnerStatement: 'сразу даю все права на всё; не спрашивать по рутине',
    standingAuthorityScope: 'ROUTINE_REVERSIBLE_EXACT_WRITE_SET_ACTIONS_FOR_THE_FIXED_V1_1_PROGRAM_AND_FRESH_GRAPH_SELECTED_NODE',
  };
}

function wp400StageInstance(programDigest, registryDigest, bindingDigest, readySetDigest) {
  return {
    acceptanceSignals: [
      'STABLE_DURABLE_ANCHOR_IDENTITY', 'FALLIBLE_WITNESS_VALIDATION', 'RELOCATION_EXACT_OR_TYPED_LOST',
      'AMBIGUITY_REQUIRES_EXPLICIT_SELECTION', 'APPEND_ONLY_LINEAGE', 'NO_AUTO_REATTACH',
      'MODEL', 'CONTRACT', 'INTEGRATION', 'IMPLEMENTATION_MUTANTS', 'INDEPENDENT_EXACT_HEAD',
      'EXTERNAL_TERMINAL_ATTESTATION_VERIFIED', 'PROGRAM_VERDICT',
    ],
    admissionContext: {
      authorityEpoch: 'YALKEN_R24_MAIN_PRODUCT_AUTHORITY_EPOCH_C9_V1',
      observedAtUtc: OBSERVED_AT_UTC,
      policyEpoch: 'YALKEN_R24_MAIN_PRODUCT_POLICY_EPOCH_C9_V1',
    },
    authorityCeiling: [
      'BOUNDED_REPOSITORY_WRITE', 'BRANCH_WORKTREE', 'COMMIT', 'PUSH', 'PR_CREATE_OR_UPDATE',
      'PROTECTED_NORMAL_MERGE', 'READ_ONLY_GITHUB_API', 'BOUNDED_CI_OPERATION',
      'LOCAL_TEST_BUILD_EVIDENCE', 'NON_DESTRUCTIVE_LOCAL_TOOLCHAIN',
    ],
    authorityTemplateId: 'OWNER_APPROVED_YALKEN_R24_MAIN_PRODUCT_READY_SET_C9_V1',
    baseSha: SOURCE_HEAD_SHA,
    branch: 'codex/r24-wp400-anchor-lineage-v2-20260829',
    commands: [
      'npm run agent:bootstrap -- --objective WP-400 stable anchor lineage and fallible relocation witnesses',
      'npm run agent:preflight -- --declaration WP400_TASK_ARCHITECTURE_DECLARATION_V1.json',
      'node --test test/unit/r24-wp400-anchor-lineage.test.js test/unit/r24-wp400-anchor-lineage-mutants.test.js',
      'npm test',
      'npm run agent:guardrails',
      'git diff --check',
      'git status --short --branch',
      'git add src/core/atlas-anchor-lineage-v1.mjs src/core/runtime.mjs test/unit/r24-wp400-anchor-lineage.test.js test/unit/r24-wp400-anchor-lineage-mutants.test.js',
      'git commit -m Implement WP-400 stable anchor lineage',
      'git push origin codex/r24-wp400-anchor-lineage-v2-20260829',
      'gh pr create --base main --head codex/r24-wp400-anchor-lineage-v2-20260829',
      'gh pr checks --watch',
      'gh pr merge --merge',
      'git fetch origin main',
    ],
    contractSha: SOURCE_HEAD_SHA,
    dependencies: [],
    executionState: 'ADMITTED_AWAITING_C9_CERTIFIED_MERGE_AND_FRESH_EXACT_BASE_AMENDMENT',
    externalEffects: ['GIT_PUSH', 'GITHUB_PR', 'GITHUB_PROTECTED_MERGE', 'GITHUB_CI'],
    headSha: SOURCE_HEAD_SHA,
    model: 'gpt-5.6-sol',
    ownerAuthorityBindingDigest: bindingDigest,
    planDigest: programDigest,
    prTarget: { baseBranch: 'main', headBranch: 'codex/r24-wp400-anchor-lineage-v2-20260829' },
    programTemplateDigest: programDigest,
    reasoningEffort: 'xhigh',
    schemaVersion: 'STAGE_INSTANCE_V1',
    selectionContext: {
      readySetSelectionDigest: readySetDigest,
      readySetContainsSelectedNode: true,
      readySetSize: EXPECTED_READY_SET.length,
      selectedNode: 'WP-400_ANCHOR_LINEAGE',
    },
    stageId: 'WP-400_ANCHOR_LINEAGE',
    stageRegistryDigest: registryDigest,
    stopConditions: [
      'AUTHORITY_UNAVAILABLE_OR_COMPROMISED',
      'BASE_HEAD_TREE_OR_DELTA_AMBIGUOUS',
      'CREDENTIAL_IDENTITY_OR_SECRET_REQUIRED',
      'DESTRUCTIVE_IRREVERSIBLE_OR_FORCE_ACTION_REQUIRED',
      'DIRTY_OR_PRESERVED_WIP_WOULD_BE_LOST',
      'EXACT_WRITE_SET_OR_COMMAND_SCOPE_WOULD_EXPAND',
      'EXTERNAL_EFFECT_OUTSIDE_ADMITTED_STAGE',
      'LEASE_FENCE_OR_ONE_WRITER_VIOLATION',
      'MATERIAL_SEMANTIC_DEVIATION_WITHOUT_OWNER_AMENDMENT',
      'MODEL_OR_REASONING_RUNTIME_MISMATCH',
      'REQUIRED_EVIDENCE_MISSING_STALE_SKIPPED_OR_SELF_AUTHORED',
      'C9_CERTIFIED_MERGE_AND_FRESH_EXACT_BASE_AMENDMENT_REQUIRED',
    ],
    targetRemote: 'origin',
    treeSha: SOURCE_TREE_SHA,
    verifierCodeDigest: VERIFIER_CODE_DIGEST,
    verifierContractDigest: VERIFIER_CONTRACT_DIGEST,
    writeSet: { deletePaths: [], paths: [...WP400_WRITE_SET], renamePaths: [] },
  };
}

function buildMainProductAuthority(readySetBytes) {
  const readySetDigest = sha256(readySetBytes);
  const registry = mainProductRegistry();
  const registryBytes = canonicalBytes(registry);
  const registryDigest = sha256(registryBytes);
  const template = mainProductTemplate(registryDigest, readySetDigest);
  const templateBytes = canonicalBytes(template);
  const templateDigest = sha256(templateBytes);
  const binding = mainProductBinding(templateDigest, registryDigest, readySetDigest);
  const bindingBytes = canonicalBytes(binding);
  const bindingDigest = sha256(bindingBytes);
  const instance = wp400StageInstance(templateDigest, registryDigest, bindingDigest, readySetDigest);
  const instanceBytes = canonicalBytes(instance);
  const admission = verifyStageAdmission({ instanceBytes, instance, registryBytes, registry, programBytes: templateBytes, program: template });
  const admissionBytes = canonicalBytes(admission);
  const output = {
    admission, admissionBytes, binding, bindingBytes, instance, instanceBytes,
    registry, registryBytes, template, templateBytes,
  };
  validateMainProductAuthority(output, readySetDigest);
  return output;
}

export function validateMainProductAuthority(output, readySetDigest) {
  assert(output.binding.noSelfAuthorization === true && output.binding.readySetSelectionDigest === readySetDigest, 'E_MAIN_BINDING', STAGE_ID);
  assert(output.template.authorityScope?.graphSelectedNode === 'WP-400_ANCHOR_LINEAGE'
    && output.template.authorityScope?.wp400NeverAutoResumes === true, 'E_MAIN_TEMPLATE_SCOPE', STAGE_ID);
  assert(output.registry.stages?.length === 1 && output.registry.stages[0].stageId === 'WP-400_ANCHOR_LINEAGE'
    && same(output.registry.stages[0].allowedWritePaths, WP400_WRITE_SET), 'E_MAIN_REGISTRY_SCOPE', STAGE_ID);
  assert(output.instance.executionState === 'ADMITTED_AWAITING_C9_CERTIFIED_MERGE_AND_FRESH_EXACT_BASE_AMENDMENT'
    && same(output.instance.writeSet.paths, WP400_WRITE_SET), 'E_WP400_EXECUTION_FENCE', STAGE_ID);
  assert(output.admission.status === 'ADMITTED' && output.admission.stageId === 'WP-400_ANCHOR_LINEAGE'
    && output.admission.stageInstanceDigest === sha256(output.instanceBytes), 'E_WP400_ADMISSION', STAGE_ID);
  return true;
}

function buildProgramVerdict(readySetBytes, mainAuthority) {
  const verdict = {
    correctiveProgram: {
      programId: 'YALKEN_R24_CORRECTIVE_RECOVERY_AND_RESUME_V1_1',
      status: 'PASS_PENDING_C9_PROTECTED_DELIVERY_AND_EXTERNAL_TERMINAL_ATTESTATION',
    },
    generatedAtUtc: OBSERVED_AT_UTC,
    mainProductProgram: {
      programDone: false,
      selectedNode: 'WP-400_ANCHOR_LINEAGE',
      selectedNodeAdmitted: true,
      selectedNodeMutationStarted: false,
      status: 'NEEDS_MORE_EVIDENCE',
    },
    nonClaims: ['PROGRAM_DONE', 'WP400_DONE', 'WP400_AUTO_RESUMED', 'PRODUCT_RELEASE_READY'],
    schemaVersion: 'YALKEN_R24_C9_PROGRAM_VERDICT_V1',
    sourceBindings: {
      c8zExternalTerminalAttestationDigest: C8Z_TERMINAL_DIGEST,
      mainProductAuthorityBindingDigest: sha256(mainAuthority.bindingBytes),
      readySetSelectionDigest: sha256(readySetBytes),
      wp400StageAdmissionDigest: sha256(mainAuthority.admissionBytes),
    },
    stageId: STAGE_ID,
  };
  validateProgramVerdict(verdict);
  return verdict;
}

export function validateProgramVerdict(verdict) {
  assert(verdict.correctiveProgram?.status === 'PASS_PENDING_C9_PROTECTED_DELIVERY_AND_EXTERNAL_TERMINAL_ATTESTATION', 'E_CORRECTIVE_VERDICT', STAGE_ID);
  assert(verdict.mainProductProgram?.status === 'NEEDS_MORE_EVIDENCE' && verdict.mainProductProgram?.programDone === false
    && verdict.mainProductProgram?.selectedNodeAdmitted === true && verdict.mainProductProgram?.selectedNodeMutationStarted === false, 'E_FALSE_PROGRAM_DONE', STAGE_ID);
  assert(verdict.nonClaims?.includes('WP400_AUTO_RESUMED') && verdict.nonClaims?.includes('PROGRAM_DONE'), 'E_NON_CLAIMS', STAGE_ID);
  assertPathlessPublicEvidence(verdict);
  return true;
}

function buildContract(effectiveStateBytes, freshG0Bytes, epochBytes, readySetBytes, mainAuthority, verdictBytes) {
  const contract = {
    acceptanceContract: {
      C4_OPTIONAL_NEUTRAL_BOUND_WITHOUT_FALSE_DONE: true,
      C8B_W0_CERTIFIED_CORRECTION_BOUND: true,
      CORRECTIVE_PROGRAM_PASS: true,
      EFFECTIVE_STATE_COMPILED: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: true,
      FIXED_AUTHORITY_BINDING: true,
      GRAPH_SELECTED_NODE: true,
      NEW_AUTHORITY_AND_POLICY_EPOCH: true,
      NEW_READY_SET: true,
      NEW_STAGE_INSTANCE_ADMITTED: true,
      ONE_FRESH_G0: true,
      PROGRAM_VERDICT: true,
      RAW_STATE_IMMUTABLE: true,
      WP400_ONLY_IF_SCHEDULER_SELECTS: true,
    },
    externalTerminalAttestation: { required: true, status: 'AWAITING_POST_MERGE_EXTERNAL_C9_ATTESTATION' },
    generatedAtUtc: OBSERVED_AT_UTC,
    nonClaims: {
      programDone: false,
      publicRelease: false,
      signingNotarizationDistribution: false,
      wp400AutoResume: false,
      wp400MutationInC9: false,
    },
    schemaVersion: 'YALKEN_R24_C9_CORRECTIVE_CLOSURE_CONTRACT_V1',
    sourceBindings: {
      c8zCertifiedDoneReceiptDigest: C8Z_CERTIFIED_DONE_RECEIPT_DIGEST,
      c8zExternalTerminalAttestationDigest: C8Z_TERMINAL_DIGEST,
      effectiveStateDigest: sha256(effectiveStateBytes),
      fixedOwnerBindingDigest: OWNER_BINDING_DIGEST,
      fixedProgramTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      fixedStageRegistryDigest: STAGE_REGISTRY_DIGEST,
      fixedTrustModelDigest: TRUST_MODEL_DIGEST,
      freshG0Digest: sha256(freshG0Bytes),
      mainProductAuthorityBindingDigest: sha256(mainAuthority.bindingBytes),
      mainProductProgramTemplateDigest: sha256(mainAuthority.templateBytes),
      mainProductStageRegistryDigest: sha256(mainAuthority.registryBytes),
      newAuthorityPolicyEpochDigest: sha256(epochBytes),
      programVerdictDigest: sha256(verdictBytes),
      readySetSelectionDigest: sha256(readySetBytes),
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      wp400StageAdmissionDigest: sha256(mainAuthority.admissionBytes),
      wp400StageInstanceDigest: sha256(mainAuthority.instanceBytes),
    },
    stageId: STAGE_ID,
    status: 'C9_CANDIDATE_CLOSED_AWAITING_PROTECTED_DELIVERY_AND_EXTERNAL_TERMINAL_ATTESTATION',
  };
  validateContract(contract);
  return contract;
}

export function validateContract(contract) {
  assert(contract.schemaVersion === 'YALKEN_R24_C9_CORRECTIVE_CLOSURE_CONTRACT_V1' && contract.stageId === STAGE_ID, 'E_CONTRACT_SCHEMA', STAGE_ID);
  assert(Object.values(contract.acceptanceContract || {}).every((value) => value === true), 'E_ACCEPTANCE_CONTRACT', STAGE_ID);
  assert(contract.nonClaims?.programDone === false && contract.nonClaims?.wp400AutoResume === false
    && contract.nonClaims?.wp400MutationInC9 === false && contract.nonClaims?.signingNotarizationDistribution === false, 'E_CONTRACT_FALSE_DONE', STAGE_ID);
  assert(contract.externalTerminalAttestation?.status === 'AWAITING_POST_MERGE_EXTERNAL_C9_ATTESTATION', 'E_CONTRACT_TERMINAL_STATE', STAGE_ID);
  assert(Object.values(contract.sourceBindings || {}).every(isHex64), 'E_CONTRACT_BINDING_SHAPE', STAGE_ID);
  assertPathlessPublicEvidence(contract);
  return true;
}

function inventorySummary(repoRoot) {
  const inventory = buildInventory(repoRoot);
  assert(inventory.totals.requiredSkips === 0 && inventory.totals.unexplainedSkips === 0, 'E_TEST_INVENTORY_SKIPS', JSON.stringify(inventory.totals));
  return { inventory, summary: { all: inventory.totals.all, requiredSkips: 0, unexplainedSkips: 0 } };
}

function buildEvaluation(contractBytes, effectiveStateBytes, freshG0Bytes, epochBytes, readySetBytes, mainAuthority, verdictBytes, inventory) {
  const evaluation = {
    acceptanceSignals: {
      C4_OPTIONAL_NEUTRAL_BOUND_WITHOUT_FALSE_DONE: 'PASS',
      C8B_W0_CERTIFIED_CORRECTION_BOUND: 'PASS',
      CORRECTIVE_PROGRAM_PASS: 'PASS',
      CURRENT_TEST_INVENTORY_ZERO_REQUIRED_OR_UNEXPLAINED_SKIPS: 'PASS',
      EFFECTIVE_STATE_COMPILED: 'PASS',
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PASS_C8Z_PREDECESSOR',
      FIXED_AUTHORITY_BINDING: 'PASS',
      GRAPH_SELECTED_NODE: 'PASS',
      NEW_AUTHORITY_AND_POLICY_EPOCH: 'PASS',
      NEW_READY_SET: 'PASS',
      NEW_STAGE_INSTANCE_ADMITTED: 'PASS',
      ONE_FRESH_G0: 'PASS',
      PROGRAM_VERDICT: 'PASS_CORRECTIVE_NEEDS_MORE_EVIDENCE_PRODUCT',
      RAW_STATE_IMMUTABLE: 'PASS',
      WP400_ONLY_IF_SCHEDULER_SELECTS: 'PASS',
    },
    artifactDigests: {
      contractDigest: sha256(contractBytes),
      effectiveStateDigest: sha256(effectiveStateBytes),
      freshG0Digest: sha256(freshG0Bytes),
      mainProductAuthorityBindingDigest: sha256(mainAuthority.bindingBytes),
      mainProductProgramTemplateDigest: sha256(mainAuthority.templateBytes),
      mainProductStageRegistryDigest: sha256(mainAuthority.registryBytes),
      newAuthorityPolicyEpochDigest: sha256(epochBytes),
      programVerdictDigest: sha256(verdictBytes),
      readySetSelectionDigest: sha256(readySetBytes),
      wp400StageAdmissionDigest: sha256(mainAuthority.admissionBytes),
      wp400StageInstanceDigest: sha256(mainAuthority.instanceBytes),
    },
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    exactIdentity: { headSha: SOURCE_HEAD_SHA, originMainSha: SOURCE_HEAD_SHA, treeSha: SOURCE_TREE_SHA },
    generatedAtUtc: OBSERVED_AT_UTC,
    mainProduct: {
      programDone: false,
      selectedNode: 'WP-400_ANCHOR_LINEAGE',
      selectedNodeAdmitted: true,
      selectedNodeExecutableBeforeC9Closure: false,
      status: 'NEEDS_MORE_EVIDENCE',
    },
    schemaVersion: 'YALKEN_R24_C9_CURRENT_HEAD_EVALUATION_V1',
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    testInventory: inventory.summary,
  };
  validateEvaluation(evaluation);
  return evaluation;
}

export function validateEvaluation(evaluation) {
  assert(evaluation.schemaVersion === 'YALKEN_R24_C9_CURRENT_HEAD_EVALUATION_V1' && evaluation.stageId === STAGE_ID, 'E_EVALUATION_SCHEMA', STAGE_ID);
  assert(Object.values(evaluation.acceptanceSignals || {}).every((value) => String(value).startsWith('PASS')), 'E_EVALUATION_SIGNAL', STAGE_ID);
  assert(evaluation.testInventory?.requiredSkips === 0 && evaluation.testInventory?.unexplainedSkips === 0, 'E_EVALUATION_SKIPS', STAGE_ID);
  assert(evaluation.mainProduct?.status === 'NEEDS_MORE_EVIDENCE' && evaluation.mainProduct?.programDone === false
    && evaluation.mainProduct?.selectedNodeExecutableBeforeC9Closure === false, 'E_EVALUATION_FALSE_DONE', STAGE_ID);
  assert(Object.values(evaluation.artifactDigests || {}).every(isHex64), 'E_EVALUATION_BINDINGS', STAGE_ID);
  assertPathlessPublicEvidence(evaluation);
  return true;
}

function approvalEntry(filePath, bytes) {
  return {
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath,
    rationale: `C9 fixed-binding corrective closure and fresh graph-selected main-product transition under StageInstance ${STAGE_INSTANCE_DIGEST}; raw state remains immutable, A1 remains OPTIONAL_NEUTRAL without false DONE, WP-400 is admitted but fenced from mutation until C9 protected merge and fresh exact-base amendment, and Program DONE remains false.`,
    sha256: sha256(bytes),
  };
}

function buildApprovals(repoRoot, artifacts) {
  const entries = Object.entries(artifacts.repoBytes)
    .filter(([relativePath]) => relativePath !== PATHS.activeApprovals && relativePath !== PATHS.approvals)
    .map(([filePath, bytes]) => approvalEntry(filePath, bytes))
    .sort((left, right) => LEXICAL(left.filePath, right.filePath));
  return { approvals: entries, evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: 'v1.0' };
}

function buildActiveApprovals(repoRoot, artifacts, approvalsBytes) {
  const active = readJsonBytes(repoRoot, PATHS.activeApprovals, true).value;
  const currentPaths = new Set(WRITE_SET);
  const retained = (active.approvals || []).filter((entry) => !currentPaths.has(entry.filePath));
  const additions = [
    ...Object.entries(artifacts.repoBytes).filter(([relativePath]) => relativePath !== PATHS.activeApprovals && relativePath !== PATHS.approvals),
    [PATHS.approvals, approvalsBytes],
  ].map(([filePath, bytes]) => approvalEntry(filePath, bytes));
  return { ...active, approvals: [...retained, ...additions] };
}

function buildArtifacts(repoRoot) {
  validateFixedInputs(repoRoot);
  assertHeadContour(repoRoot);
  const inputs = readStateInputs(repoRoot);
  const effective = compileEffectiveState(inputs);
  const effectiveStateBytes = canonicalBytes(effective.artifact);
  const freshG0 = buildFreshG0(effectiveStateBytes);
  const freshG0Bytes = canonicalBytes(freshG0);
  const profiles = [...new Set(effective.effectiveProgram.nodes.map((node) => node.profile))].sort(LEXICAL);
  const epoch = buildNewEpoch(effectiveStateBytes, freshG0Bytes, profiles);
  const epochBytes = canonicalBytes(epoch);
  const readySet = buildReadySet(effective.effectiveProgram, effective.effectiveStates, epoch, epochBytes, freshG0Bytes);
  validateReadySet(readySet);
  const readySetBytes = canonicalBytes(readySet);
  const mainAuthority = buildMainProductAuthority(readySetBytes);
  const programVerdict = buildProgramVerdict(readySetBytes, mainAuthority);
  const programVerdictBytes = canonicalBytes(programVerdict);
  const contract = buildContract(effectiveStateBytes, freshG0Bytes, epochBytes, readySetBytes, mainAuthority, programVerdictBytes);
  const contractBytes = canonicalBytes(contract);
  const inventory = inventorySummary(repoRoot);
  const evaluation = buildEvaluation(contractBytes, effectiveStateBytes, freshG0Bytes, epochBytes, readySetBytes, mainAuthority, programVerdictBytes, inventory);
  const evaluationBytes = canonicalBytes(evaluation);
  const repoBytes = {
    [PATHS.contract]: contractBytes,
    [PATHS.effectiveState]: effectiveStateBytes,
    [PATHS.evaluation]: evaluationBytes,
    [PATHS.freshG0]: freshG0Bytes,
    [PATHS.inventory]: canonicalBytes(inventory.inventory),
    [PATHS.mainBinding]: mainAuthority.bindingBytes,
    [PATHS.mainRegistry]: mainAuthority.registryBytes,
    [PATHS.mainTemplate]: mainAuthority.templateBytes,
    [PATHS.newEpoch]: epochBytes,
    [PATHS.programVerdict]: programVerdictBytes,
    [PATHS.readySet]: readySetBytes,
    [PATHS.stageAdmission]: fs.readFileSync(path.join(repoRoot, PATHS.stageAdmission)),
    [PATHS.stageInstance]: fs.readFileSync(path.join(repoRoot, PATHS.stageInstance)),
    [PATHS.wp400Admission]: mainAuthority.admissionBytes,
    [PATHS.wp400Instance]: mainAuthority.instanceBytes,
    [PATHS.script]: fs.readFileSync(path.join(repoRoot, PATHS.script)),
    [PATHS.test]: fs.readFileSync(path.join(repoRoot, PATHS.test)),
  };
  const provisional = { repoBytes };
  const approvals = buildApprovals(repoRoot, provisional);
  const approvalsBytes = canonicalBytes(approvals);
  const activeApprovalsBytes = canonicalBytes(buildActiveApprovals(repoRoot, provisional, approvalsBytes));
  return { activeApprovalsBytes, approvalsBytes, repoBytes };
}

function writeArtifacts(repoRoot, artifacts) {
  for (const [relativePath, bytes] of Object.entries({
    ...artifacts.repoBytes,
    [PATHS.approvals]: artifacts.approvalsBytes,
    [PATHS.activeApprovals]: artifacts.activeApprovalsBytes,
  })) fs.writeFileSync(path.join(repoRoot, relativePath), bytes);
}

function checkArtifacts(repoRoot, artifacts) {
  for (const [relativePath, bytes] of Object.entries({
    ...artifacts.repoBytes,
    [PATHS.approvals]: artifacts.approvalsBytes,
    [PATHS.activeApprovals]: artifacts.activeApprovalsBytes,
  })) assert(fs.readFileSync(path.join(repoRoot, relativePath)).equals(bytes), 'E_GENERATED_DRIFT', relativePath);
  return true;
}

export function runProbe(repoRoot = process.cwd()) {
  const inputs = readStateInputs(repoRoot);
  const effective = compileEffectiveState(inputs);
  const effectiveStateBytes = canonicalBytes(effective.artifact);
  const freshG0 = buildFreshG0(effectiveStateBytes);
  const freshG0Bytes = canonicalBytes(freshG0);
  const profiles = [...new Set(effective.effectiveProgram.nodes.map((node) => node.profile))].sort(LEXICAL);
  const epoch = buildNewEpoch(effectiveStateBytes, freshG0Bytes, profiles);
  const epochBytes = canonicalBytes(epoch);
  const readySet = buildReadySet(effective.effectiveProgram, effective.effectiveStates, epoch, epochBytes, freshG0Bytes);
  const readySetBytes = canonicalBytes(readySet);
  const mainAuthority = buildMainProductAuthority(readySetBytes);
  const verdict = buildProgramVerdict(readySetBytes, mainAuthority);
  const mutants = [
    ['RAW_STATE_MUTATED', effective.artifact, (x) => { x.rawState.immutable = false; }, validateEffectiveState],
    ['A1_FALSE_DONE', effective.artifact, (x) => { x.effectiveState.states.A1_OPTIONAL_RELATION_VOCABULARY = 'DONE'; }, validateEffectiveState],
    ['WP400_FALSE_DONE', effective.artifact, (x) => { x.effectiveState.states['WP-400_ANCHOR_LINEAGE'] = 'DONE'; }, validateEffectiveState],
    ['G0_SELF_AUTH', freshG0, (x) => { x.authority.noSelfAuthorization = false; }, validateFreshG0],
    ['G0_SECOND_WRITER', freshG0, (x) => { x.fencing.oneWriter = false; }, validateFreshG0],
    ['EPOCH_AUTO_RESUME', epoch, (x) => { x.correctionPolicy.wp400NeverAutoResumes = false; }, validateNewEpoch],
    ['READY_SET_EXTRA_NODE', readySet, (x) => { x.readySet.push('WP-401_FAKE'); }, validateReadySet],
    ['VERDICT_PROGRAM_DONE', verdict, (x) => { x.mainProductProgram.programDone = true; }, validateProgramVerdict],
    ['VERDICT_MUTATION_STARTED', verdict, (x) => { x.mainProductProgram.selectedNodeMutationStarted = true; }, validateProgramVerdict],
  ];
  const probeResults = mutants.map(([id, original, mutate, validate]) => {
    const candidate = structuredClone(original);
    mutate(candidate);
    try { validate(candidate); return { id, killed: false }; }
    catch { return { id, killed: true }; }
  });
  assert(probeResults.every((entry) => entry.killed), 'E_MUTANT_SURVIVED', JSON.stringify(probeResults));
  return { mutantsKilled: probeResults.length, mutantsTotal: probeResults.length, probeResults };
}

function main() {
  const repoRoot = process.cwd();
  const mode = process.argv[2] || '--check';
  if (mode === '--probe') {
    process.stdout.write(`${JSON.stringify({ decision: 'C9_MUTATION_PROBE_PASS', ...runProbe(repoRoot) })}\n`);
    return;
  }
  const artifacts = buildArtifacts(repoRoot);
  if (mode === '--write') writeArtifacts(repoRoot, artifacts);
  else if (mode !== '--check') fail('E_MODE', mode);
  checkArtifacts(repoRoot, mode === '--write' ? buildArtifacts(repoRoot) : artifacts);
  const evaluationBytes = artifacts.repoBytes[PATHS.evaluation];
  const readySetBytes = artifacts.repoBytes[PATHS.readySet];
  process.stdout.write(`${JSON.stringify({
    decision: mode === '--write' ? 'C9_ARTIFACTS_WRITTEN' : 'C9_ARTIFACTS_CURRENT',
    evaluationDigest: sha256(evaluationBytes),
    readySetDigest: sha256(readySetBytes),
    selectedNode: JSON.parse(readySetBytes).selectedId,
    stageId: STAGE_ID,
    wp400AdmissionDigest: sha256(artifacts.repoBytes[PATHS.wp400Admission]),
  })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
