#!/usr/bin/env node
// R2.4 V1 - Atlas profile claim compiler. This OPS-only projection reads
// exact-head A0 gate evidence and emits a bounded Atlas-profile verdict while
// refusing Writer promotion, optional physical/release evidence, or program PASS.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HEX40_RE, sha256hex } from './canonical-json.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');
const PROGRAM_DAG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const SCIENTIFIC_CONTRACTS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'SCIENTIFIC_CONTRACTS.json');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const RTK_REQUIRED_WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'rtk-required.yml');

export const V1_STAGE_ID = 'V1_ATLAS_CLAIM_COMPILER';
export const A0_STAGE_ID = 'A0_ATLAS_INCREMENTAL_EQUIVALENCE';
export const V0_STAGE_ID = 'V0_WRITER_CLAIM_COMPILER';
export const ATLAS_PROFILE_ID = 'ATLAS_MAPS_DERIVED';
export const ATLAS_CLAIM_ID = 'CLM_ATLAS_DERIVED_SAFETY';
export const REQUIRED_EVIDENCE_CLASS = 'E6_INDEPENDENT_EXACT_HEAD';
export const PROFILE_CLAIM_CEILING = 'PROFILE_VERDICT_ONLY';
export const ATLAS_PROFILE_VERDICT = 'ATLAS_MAPS_DERIVED_EVIDENCE_BOUND_BY_R24_EXACT_HEAD_A0_PREFIX';
export const PROGRAM_VERDICT = 'NEEDS_MORE_EVIDENCE';
export const SELECTED_PROFILES = Object.freeze(['SHARED_ASSURANCE', 'WRITER_CORE', ATLAS_PROFILE_ID]);
export const FORBIDDEN_PROMOTION_PROFILES = Object.freeze(['WRITER_CORE', 'WORD_ROUNDTRIP', 'PACKAGED_RELEASE_SECURITY']);
export const OPTIONAL_PROFILES_EXCLUDED = Object.freeze(['WORD_ROUNDTRIP', 'PACKAGED_RELEASE_SECURITY']);
export const CLAIM_CANNOT_PROMOTE_REQUIRED = Object.freeze(['WRITER_CORE', 'WORD_ROUNDTRIP', 'UNIVERSAL_SCALE']);
export const UNIVERSAL_NON_CLAIMS = Object.freeze(['UNIVERSAL_SCALE']);

export const STAGE_SCRIPT_BY_ID = Object.freeze({
  E0_RUNNER_SAFETY_QUARANTINE: 'test:r24-e0',
  Q0_TOOLCHAIN_HYGIENE: 'test:r24-q0',
  P0_AUTOSAVE_GENERATION: 'test:r24-p0',
  S0_IPC_CALLER_IDENTITY: 'test:r24-s0',
  P1_DIRTY_ADMISSION_ACK: 'test:r24-p1',
  S1_IPC_ENVELOPE_BUDGETS: 'test:r24-s1',
  K0_COMMAND_PROTOCOL: 'test:r24-k0',
  R0_REVISION_ALGEBRA: 'test:r24-r0',
  P2_DURABLE_SAVE_COORDINATOR: 'test:r24-p2',
  R1_SHADOW_PROJECT_AUTHORITY_CELL: 'test:r24-r1',
  P3_TRANSACTIONAL_PROJECT_COMMIT: 'test:r24-p3',
  T0_TEXT_COORDINATE_ALGEBRA: 'test:r24-t0',
  SEC0_PATH_CAPABILITY: 'test:r24-sec0',
  ENT0_ENTITLEMENT_CONFORMANCE: 'test:r24-ent0',
  K1_AUTHORITY_DECOMPOSITION: 'test:r24-k1',
  T1_ANCHOR_LINEAGE: 'test:r24-t1',
  R2_STORAGE_BAKEOFF: 'test:r24-r2',
  R3_DURABLE_RECOVERY_LEDGER: 'test:r24-r3',
  R4_TRANSACTIONAL_INBOX_OUTBOX: 'test:r24-r4',
  R5_LIFECYCLE_EXTERNAL_CONFLICT: 'test:r24-r5',
  R6_MIGRATION_HISTORY_BACKUP_GC: 'test:r24-r6',
  F0_WRITER_REFINEMENT_CONFORMANCE: 'test:r24-f0',
  WP100_GENERATION_ADMISSION: 'test:r24-wp100',
  WP101_IPC_ADMISSION: 'test:r24-wp101',
  WP102_OPERATION_PROTOCOL: 'test:r24-wp102',
  WP103_REVISION_PRODUCT_ORDER: 'test:r24-wp103',
  WP104_BOUNDARY_FALSIFICATION: 'test:r24-wp104',
  [V0_STAGE_ID]: 'test:r24-v0',
  [A0_STAGE_ID]: 'test:r24-a0',
  [V1_STAGE_ID]: 'test:r24-v1',
});

const ALLOWED_EVIDENCE_SOURCES = new Set([
  'RTK_REQUIRED_WORKFLOW_PREFIX',
  'V1_COMPILER_CONTRACT_FIXTURE',
]);

const NON_CLAIMS = Object.freeze([
  'NO_PROGRAM_DONE',
  'NO_GLOBAL_SCALAR_PASS',
  'NO_WRITER_CORE_PROMOTION',
  'NO_WRITER_PROFILE_VERDICT_RECOMPUTE',
  'NO_WORD_PROFILE_VERDICT',
  'NO_GOOGLE_DOCS_PROFILE_VERDICT',
  'NO_PACKAGED_RELEASE_PROFILE_VERDICT',
  'NO_RELEASE_READINESS',
  'NO_UNIVERSAL_ATLAS_SCALE',
  'NO_PRODUCT_RUNTIME_MUTATION',
  'NO_RUNTIME_DAEMON_OR_NETWORK',
]);

function fail(code, detail, context = {}) {
  return {
    ok: false,
    schemaVersion: 'yalken.r24.v1.atlas-claim-compiler.receipt.v1',
    verdict: 'FAIL',
    code,
    detail,
    context,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readTextBounded(filePath, maxBytes = 4 * 1024 * 1024) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`E_R24_V1_NOT_FILE:${filePath}`);
  if (stat.size > maxBytes) throw new Error(`E_R24_V1_FILE_TOO_LARGE:${filePath}:${stat.size}`);
  return fs.readFileSync(filePath, 'utf8');
}

function readJsonBounded(filePath) {
  return JSON.parse(readTextBounded(filePath));
}

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  });
  if (result.status !== 0) return null;
  return String(result.stdout || '').trim();
}

function normalizeProgram(program) {
  if (!program || !Array.isArray(program.stages)) return null;
  return program;
}

function stageMap(program) {
  return new Map(program.stages.map((stage) => [stage.stageId, stage]));
}

function sameSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const seen = new Set(left);
  return right.every((item) => seen.has(item));
}

function arrayHasEvidenceClass(value) {
  if (value === REQUIRED_EVIDENCE_CLASS) return true;
  return Array.isArray(value) && value.includes(REQUIRED_EVIDENCE_CLASS);
}

function atlasClaimStageIds(programInput) {
  const program = normalizeProgram(programInput);
  if (!program) return [];
  return program.stages
    .filter((stage) => stage.stageId === A0_STAGE_ID && stage.profile === ATLAS_PROFILE_ID)
    .map((stage) => stage.stageId);
}

export function extractR24WorkflowScripts(workflowText) {
  const scripts = [];
  const re = /^\s*run:\s+npm run -s (test:r24-[a-z0-9-]+)\s*$/gmu;
  for (const match of workflowText.matchAll(re)) scripts.push(match[1]);
  return scripts;
}

export function buildGateEvidenceFromWorkflowPrefix({ program, workflowText, repoState, expectedHeadSha }) {
  const requiredStageIds = atlasClaimStageIds(program);
  const scripts = extractR24WorkflowScripts(workflowText || '');
  const v1Script = STAGE_SCRIPT_BY_ID[V1_STAGE_ID];
  const v1Index = scripts.indexOf(v1Script);
  if (v1Index < 0) return [];
  const prefix = new Map(scripts.slice(0, v1Index).map((script, index) => [script, index]));
  return requiredStageIds
    .filter((stageId) => prefix.has(STAGE_SCRIPT_BY_ID[stageId]))
    .map((stageId) => ({
      stageId,
      status: 'SUCCESS',
      headSha: expectedHeadSha,
      evidenceClass: REQUIRED_EVIDENCE_CLASS,
      source: 'RTK_REQUIRED_WORKFLOW_PREFIX',
      workflowIndex: prefix.get(STAGE_SCRIPT_BY_ID[stageId]),
      script: STAGE_SCRIPT_BY_ID[stageId],
      treeSha: repoState?.treeSha || null,
    }));
}

function validateScientificContract(scientificContracts) {
  const claim = Array.isArray(scientificContracts?.claims)
    ? scientificContracts.claims.find((row) => row.claimId === ATLAS_CLAIM_ID)
    : null;
  if (!claim) return fail('E_R24_V1_ATLAS_CLAIM_CONTRACT_MISSING', ATLAS_CLAIM_ID);
  if (claim.profileId !== ATLAS_PROFILE_ID) return fail('E_R24_V1_ATLAS_CLAIM_PROFILE', String(claim.profileId || ''));
  if (claim.minimumEvidenceClass !== REQUIRED_EVIDENCE_CLASS) {
    return fail('E_R24_V1_ATLAS_CLAIM_E6_REQUIRED', String(claim.minimumEvidenceClass || ''));
  }
  if (claim.currentVerdict === 'PASS') return fail('E_R24_V1_ATLAS_CONTRACT_PREASSERTS_PASS', 'claim contract cannot pre-assert PASS');
  for (const promoted of CLAIM_CANNOT_PROMOTE_REQUIRED) {
    if (!Array.isArray(claim.cannotPromote) || !claim.cannotPromote.includes(promoted)) {
      return fail('E_R24_V1_CANNOT_PROMOTE_MISSING', promoted);
    }
  }
  const faultModel = Array.isArray(scientificContracts?.faultModels)
    ? scientificContracts.faultModels.find((row) => row.faultModelId === claim.faultModelId)
    : null;
  if (!faultModel || faultModel.profileId !== ATLAS_PROFILE_ID) {
    return fail('E_R24_V1_FAULT_MODEL_BINDING', JSON.stringify(faultModel || null));
  }
  for (const fault of ['STALE_SOURCE_REVISION', 'OUT_OF_ORDER_GENERATION', 'WORKER_CRASH', 'QUEUE_OVERFLOW', 'INCREMENTAL_FULL_DIVERGENCE']) {
    if (!Array.isArray(faultModel.includedFaults) || !faultModel.includedFaults.includes(fault)) {
      return fail('E_R24_V1_FAULT_MODEL_CASE_MISSING', fault);
    }
  }
  const consistencyModel = Array.isArray(scientificContracts?.consistencyModels)
    ? scientificContracts.consistencyModels.find((row) => row.consistencyModelId === claim.consistencyModelId)
    : null;
  if (!consistencyModel || consistencyModel.profileId !== ATLAS_PROFILE_ID) {
    return fail('E_R24_V1_CONSISTENCY_MODEL_BINDING', JSON.stringify(consistencyModel || null));
  }
  const resourceEnvelope = Array.isArray(scientificContracts?.resourceEnvelopes)
    ? scientificContracts.resourceEnvelopes.find((row) => row.resourceEnvelopeId === claim.resourceEnvelopeId)
    : null;
  if (!resourceEnvelope || resourceEnvelope.profileId !== ATLAS_PROFILE_ID || resourceEnvelope.exceedDisposition !== 'TYPED_DEGRADED_OR_ABSTAIN') {
    return fail('E_R24_V1_RESOURCE_ENVELOPE_BINDING', JSON.stringify(resourceEnvelope || null));
  }
  return { ok: true, claim, faultModel, consistencyModel, resourceEnvelope };
}

function validateProgramContract({ program, scientificContracts, selectedProfiles }) {
  const normalized = normalizeProgram(program);
  if (!normalized) return fail('E_R24_V1_PROGRAM_REQUIRED', 'PROGRAM_DAG must have stages[]');
  const stages = stageMap(normalized);
  const v1 = stages.get(V1_STAGE_ID);
  if (!v1) return fail('E_R24_V1_STAGE_MISSING', V1_STAGE_ID);
  if (v1.profile !== ATLAS_PROFILE_ID) return fail('E_R24_V1_STAGE_PROFILE', v1.profile);
  if (v1.mutationAuthority !== 'ATLAS_CLAIM_PROJECTION_ONLY') return fail('E_R24_V1_STAGE_AUTHORITY', v1.mutationAuthority);
  if (v1.claimCeiling !== PROFILE_CLAIM_CEILING) return fail('E_R24_V1_CLAIM_CEILING', v1.claimCeiling);
  if (!arrayHasEvidenceClass(v1.requiredEvidence)) return fail('E_R24_V1_E6_REQUIRED', JSON.stringify(v1.requiredEvidence || []));
  if (!Array.isArray(v1.dependsOn) || !v1.dependsOn.includes(A0_STAGE_ID)) {
    return fail('E_R24_V1_A0_DEPENDENCY_MISSING', JSON.stringify(v1.dependsOn || []));
  }
  const a0 = stages.get(A0_STAGE_ID);
  if (!a0 || a0.profile !== ATLAS_PROFILE_ID) return fail('E_R24_V1_A0_STAGE_BINDING', JSON.stringify(a0 || null));
  if (!sameSet(selectedProfiles, SELECTED_PROFILES)) {
    return fail('E_R24_V1_SELECTED_PROFILE_SET', JSON.stringify(selectedProfiles));
  }
  const atlasProfile = (normalized.profiles || []).find((profile) => profile.profileId === ATLAS_PROFILE_ID);
  if (!atlasProfile || !sameSet(atlasProfile.mayDependOn || [], SELECTED_PROFILES)) {
    return fail('E_R24_V1_ATLAS_PROFILE_DEPENDENCY_LAW', JSON.stringify(atlasProfile || null));
  }
  if (normalized.verdictAggregation?.kind !== 'PROFILE_VECTOR') {
    return fail('E_R24_V1_PROFILE_VECTOR_REQUIRED', JSON.stringify(normalized.verdictAggregation || null));
  }
  if (normalized.verdictAggregation?.globalScalarPassForbidden !== true) {
    return fail('E_R24_V1_GLOBAL_SCALAR_PASS_FORBIDDEN_MISSING', 'globalScalarPassForbidden must be true');
  }
  if (normalized.verdictAggregation?.profileEvidenceTransferRequiresExplicitBinding !== true) {
    return fail('E_R24_V1_PROFILE_TRANSFER_BINDING_MISSING', 'profile evidence transfer must require explicit binding');
  }
  if (normalized.programVerdict === 'PASS') return fail('E_R24_V1_PROGRAM_SCALAR_PASS_FORBIDDEN', 'PROGRAM_DAG programVerdict cannot be PASS');
  if (normalized.verdictAggregation?.currentVector?.[ATLAS_PROFILE_ID] === 'PASS') {
    return fail('E_R24_V1_ATLAS_PROFILE_PREASSERTS_PASS', 'PROGRAM_DAG Atlas vector cannot pre-assert PASS');
  }
  const scientificCheck = validateScientificContract(scientificContracts);
  if (!scientificCheck.ok) return scientificCheck;
  const requiredStageIds = atlasClaimStageIds(normalized);
  if (requiredStageIds.length !== 1 || requiredStageIds[0] !== A0_STAGE_ID) {
    return fail('E_R24_V1_REQUIRED_STAGE_SET', JSON.stringify(requiredStageIds));
  }
  return { ok: true, requiredStageIds, stages, scientific: scientificCheck };
}

function validateRepositoryIdentity({ repoState, expectedHeadSha, expectedOriginMainSha }) {
  if (!repoState || !HEX40_RE.test(String(repoState.headSha || ''))) {
    return fail('E_R24_V1_HEAD_REQUIRED', String(repoState?.headSha || ''));
  }
  if (!HEX40_RE.test(String(expectedHeadSha || ''))) {
    return fail('E_R24_V1_EXPECTED_HEAD_REQUIRED', String(expectedHeadSha || ''));
  }
  if (repoState.headSha !== expectedHeadSha) {
    return fail('E_R24_V1_EXACT_HEAD_MISMATCH', `${repoState.headSha} != ${expectedHeadSha}`, { headSha: repoState.headSha, expectedHeadSha });
  }
  if (expectedOriginMainSha !== null && expectedOriginMainSha !== undefined && repoState.originMainSha !== expectedOriginMainSha) {
    return fail('E_R24_V1_ORIGIN_MAIN_MISMATCH', `${repoState.originMainSha} != ${expectedOriginMainSha}`, {
      originMainSha: repoState.originMainSha,
      expectedOriginMainSha,
    });
  }
  if (repoState.dirty === true) return fail('E_R24_V1_WORKTREE_DIRTY', 'clean exact-head Atlas claim evidence required');
  return { ok: true };
}

function validateClaimRequest(claimRequest = {}) {
  if (claimRequest.programVerdict === 'PASS' || claimRequest.globalScalarPass === true) {
    return fail('E_R24_V1_PROGRAM_SCALAR_PASS_FORBIDDEN', 'V1 may not emit a global/program PASS');
  }
  if (claimRequest.claimCeiling && claimRequest.claimCeiling !== PROFILE_CLAIM_CEILING) {
    return fail('E_R24_V1_OVERCLAIM', claimRequest.claimCeiling);
  }
  if (claimRequest.profileId && claimRequest.profileId !== ATLAS_PROFILE_ID) {
    return fail('E_R24_V1_PROFILE_IMPORT_FORBIDDEN', claimRequest.profileId);
  }
  if (claimRequest.includeWriterCoreVerdict === true) {
    return fail('E_R24_V1_WRITER_PROMOTION_FORBIDDEN', 'Writer verdict recomputation is outside V1');
  }
  if (Array.isArray(claimRequest.profiles)) {
    const imported = claimRequest.profiles.filter((profile) => profile !== ATLAS_PROFILE_ID);
    if (imported.length > 0) return fail('E_R24_V1_PROFILE_IMPORT_FORBIDDEN', imported.join(','));
  }
  if (Array.isArray(claimRequest.promoteProfiles)) {
    const promoted = claimRequest.promoteProfiles.filter((profile) => (
      FORBIDDEN_PROMOTION_PROFILES.includes(profile) || UNIVERSAL_NON_CLAIMS.includes(profile)
    ));
    if (promoted.length > 0) return fail('E_R24_V1_WRITER_PROMOTION_FORBIDDEN', promoted.join(','));
  }
  return { ok: true };
}

function validateWorkflowBinding({ program, packageJson, workflowText, requiredStageIds }) {
  const packageScripts = isPlainObject(packageJson?.scripts) ? packageJson.scripts : {};
  const workflowScripts = extractR24WorkflowScripts(workflowText);
  if (workflowScripts.length === 0) return fail('E_R24_V1_WORKFLOW_NO_R24_STEPS', 'no test:r24-* steps found');
  const duplicate = workflowScripts.find((script, index) => workflowScripts.indexOf(script) !== index);
  if (duplicate) return fail('E_R24_V1_WORKFLOW_DUPLICATE_STEP', duplicate);

  for (const stageId of [V0_STAGE_ID, A0_STAGE_ID, V1_STAGE_ID]) {
    const script = STAGE_SCRIPT_BY_ID[stageId];
    if (!packageScripts[script]) return fail('E_R24_V1_PACKAGE_SCRIPT_MISSING', script);
  }

  const scriptIndex = new Map(workflowScripts.map((script, index) => [script, index]));
  const v0Index = scriptIndex.get(STAGE_SCRIPT_BY_ID[V0_STAGE_ID]);
  const a0Index = scriptIndex.get(STAGE_SCRIPT_BY_ID[A0_STAGE_ID]);
  const v1Index = scriptIndex.get(STAGE_SCRIPT_BY_ID[V1_STAGE_ID]);
  if (!Number.isInteger(v0Index)) return fail('E_R24_V1_WORKFLOW_STEP_MISSING', STAGE_SCRIPT_BY_ID[V0_STAGE_ID]);
  if (!Number.isInteger(a0Index)) return fail('E_R24_V1_WORKFLOW_STEP_MISSING', STAGE_SCRIPT_BY_ID[A0_STAGE_ID]);
  if (!Number.isInteger(v1Index)) return fail('E_R24_V1_WORKFLOW_STEP_MISSING', STAGE_SCRIPT_BY_ID[V1_STAGE_ID]);
  if (v0Index >= a0Index) return fail('E_R24_V1_WORKFLOW_V0_BEFORE_A0_REQUIRED', `${STAGE_SCRIPT_BY_ID[V0_STAGE_ID]} must run before ${STAGE_SCRIPT_BY_ID[A0_STAGE_ID]}`);
  if (a0Index >= v1Index) return fail('E_R24_V1_WORKFLOW_A0_BEFORE_V1_REQUIRED', `${STAGE_SCRIPT_BY_ID[A0_STAGE_ID]} must run before ${STAGE_SCRIPT_BY_ID[V1_STAGE_ID]}`);

  const stages = stageMap(program);
  for (const stageId of requiredStageIds) {
    const script = STAGE_SCRIPT_BY_ID[stageId];
    if (!script) return fail('E_R24_V1_STAGE_SCRIPT_UNBOUND', stageId);
    if (!packageScripts[script]) return fail('E_R24_V1_PACKAGE_SCRIPT_MISSING', script);
    if (!scriptIndex.has(script)) return fail('E_R24_V1_WORKFLOW_STEP_MISSING', script);
    if (scriptIndex.get(script) >= v1Index) return fail('E_R24_V1_WORKFLOW_PREFIX_INVALID', `${script} must run before ${STAGE_SCRIPT_BY_ID[V1_STAGE_ID]}`);
    const stage = stages.get(stageId);
    for (const dep of stage.dependsOn || []) {
      if (dep === 'G0_AUTHORITY_CLOSURE') continue;
      const depScript = STAGE_SCRIPT_BY_ID[dep];
      if (!depScript || !scriptIndex.has(depScript)) {
        return fail('E_R24_V1_WORKFLOW_DEPENDENCY_STEP_MISSING', `${dep}:${depScript || 'UNBOUND'}`);
      }
      if (!packageScripts[depScript]) return fail('E_R24_V1_PACKAGE_SCRIPT_MISSING', depScript);
      if (scriptIndex.get(depScript) >= scriptIndex.get(script)) {
        return fail('E_R24_V1_WORKFLOW_DEPENDENCY_ORDER', `${depScript} must run before ${script}`);
      }
    }
  }
  return {
    ok: true,
    workflowScripts,
    v0WorkflowIndex: v0Index,
    a0WorkflowIndex: a0Index,
    v1WorkflowIndex: v1Index,
    supportingScriptsBeforeV1: workflowScripts.slice(0, v1Index).filter((script) => script !== STAGE_SCRIPT_BY_ID[A0_STAGE_ID]),
  };
}

function validateGateEvidence({ gateEvidence, requiredStageIds, stages, expectedHeadSha }) {
  if (!Array.isArray(gateEvidence)) return fail('E_R24_V1_GATE_EVIDENCE_REQUIRED', 'gate evidence must be an array');
  const requiredSet = new Set(requiredStageIds);
  const evidenceByStage = new Map(gateEvidence.map((row) => [row.stageId, row]));
  for (const row of gateEvidence) {
    if (!stages.has(row.stageId)) return fail('E_R24_V1_GATE_EVIDENCE_UNKNOWN_STAGE', row.stageId);
    if (!ALLOWED_EVIDENCE_SOURCES.has(row.source)) return fail('E_R24_V1_GATE_EVIDENCE_SOURCE', `${row.stageId}:${row.source}`);
    if (!requiredSet.has(row.stageId)) {
      const profile = stages.get(row.stageId)?.profile;
      if (profile !== ATLAS_PROFILE_ID) return fail('E_R24_V1_PROFILE_IMPORT_FORBIDDEN', row.stageId);
      return fail('E_R24_V1_UNREQUIRED_ATLAS_STAGE_IMPORTED', row.stageId);
    }
  }
  for (const stageId of requiredStageIds) {
    if (!evidenceByStage.has(stageId)) return fail('E_R24_V1_GATE_EVIDENCE_MISSING', stageId);
    const row = evidenceByStage.get(stageId);
    if (row.status !== 'SUCCESS') return fail('E_R24_V1_GATE_NOT_SUCCESS', `${stageId}:${row.status}`);
    if (row.headSha !== expectedHeadSha) return fail('E_R24_V1_GATE_HEAD_MISMATCH', `${stageId}:${row.headSha} != ${expectedHeadSha}`);
    if (!arrayHasEvidenceClass(row.evidenceClass || row.evidenceClasses)) return fail('E_R24_V1_GATE_E6_MISSING', stageId);
  }
  if (requiredStageIds.length === 0 || gateEvidence.length === 0) {
    return fail('E_R24_V1_ZERO_DENOMINATOR', 'gate evidence denominator is zero');
  }
  return { ok: true };
}

export function compileAtlasVerdict(input = {}) {
  const program = input.program;
  const scientificContracts = input.scientificContracts;
  const selectedProfiles = input.selectedProfiles || [...SELECTED_PROFILES];
  const expectedHeadSha = input.expectedHeadSha || input.repoState?.headSha;
  const expectedOriginMainSha = input.expectedOriginMainSha ?? null;
  const now = input.now || new Date().toISOString();

  const identity = validateRepositoryIdentity({ repoState: input.repoState, expectedHeadSha, expectedOriginMainSha });
  if (!identity.ok) return identity;
  const programCheck = validateProgramContract({ program, scientificContracts, selectedProfiles });
  if (!programCheck.ok) return programCheck;
  const claimCheck = validateClaimRequest(input.claimRequest);
  if (!claimCheck.ok) return claimCheck;
  const workflowCheck = validateWorkflowBinding({
    program,
    packageJson: input.packageJson,
    workflowText: input.workflowText || '',
    requiredStageIds: programCheck.requiredStageIds,
  });
  if (!workflowCheck.ok) return workflowCheck;
  const gateEvidence = Array.isArray(input.gateEvidence)
    ? input.gateEvidence
    : buildGateEvidenceFromWorkflowPrefix({
      program,
      workflowText: input.workflowText,
      repoState: input.repoState,
      expectedHeadSha,
    });
  const evidenceCheck = validateGateEvidence({
    gateEvidence,
    requiredStageIds: programCheck.requiredStageIds,
    stages: programCheck.stages,
    expectedHeadSha,
  });
  if (!evidenceCheck.ok) return evidenceCheck;

  const gateEvidenceDigest = sha256hex(JSON.stringify(gateEvidence.map((row) => ({
    stageId: row.stageId,
    status: row.status,
    headSha: row.headSha,
    evidenceClass: row.evidenceClass || row.evidenceClasses,
    source: row.source,
    script: row.script || null,
    workflowIndex: Number.isInteger(row.workflowIndex) ? row.workflowIndex : null,
  }))));

  return {
    ok: true,
    schemaVersion: 'yalken.r24.v1.atlas-claim-compiler.receipt.v1',
    verdict: 'PASS',
    code: 'R24_V1_ATLAS_PROFILE_VERDICT_COMPILED',
    generatedAt: now,
    exactIdentity: {
      headSha: input.repoState.headSha,
      originMainSha: input.repoState.originMainSha || null,
      treeSha: input.repoState.treeSha || null,
      dirty: input.repoState.dirty === true,
    },
    selectedProfiles: [...SELECTED_PROFILES],
    profileVerdict: {
      profileId: ATLAS_PROFILE_ID,
      verdict: ATLAS_PROFILE_VERDICT,
      claimCeiling: PROFILE_CLAIM_CEILING,
      requiredEvidenceClass: REQUIRED_EVIDENCE_CLASS,
      requiredStageCount: programCheck.requiredStageIds.length,
      closedStageCount: gateEvidence.length,
      requiredStageIds: programCheck.requiredStageIds,
      gateEvidenceDigest,
    },
    sourceClaimContract: {
      claimId: programCheck.scientific.claim.claimId,
      faultModelId: programCheck.scientific.claim.faultModelId,
      consistencyModelId: programCheck.scientific.claim.consistencyModelId,
      resourceEnvelopeId: programCheck.scientific.claim.resourceEnvelopeId,
      cannotPromote: [...programCheck.scientific.claim.cannotPromote],
    },
    dependencyProfilesObserved: ['SHARED_ASSURANCE', 'WRITER_CORE'],
    nonClaimedProfiles: [...FORBIDDEN_PROMOTION_PROFILES],
    optionalProfilesExcluded: [...OPTIONAL_PROFILES_EXCLUDED],
    programVerdict: PROGRAM_VERDICT,
    globalScalarPassForbidden: true,
    nonClaims: [...NON_CLAIMS],
    workflow: {
      v0Script: STAGE_SCRIPT_BY_ID[V0_STAGE_ID],
      a0Script: STAGE_SCRIPT_BY_ID[A0_STAGE_ID],
      v1Script: STAGE_SCRIPT_BY_ID[V1_STAGE_ID],
      v0WorkflowIndex: workflowCheck.v0WorkflowIndex,
      a0WorkflowIndex: workflowCheck.a0WorkflowIndex,
      v1WorkflowIndex: workflowCheck.v1WorkflowIndex,
      supportingScriptsBeforeV1: workflowCheck.supportingScriptsBeforeV1,
    },
  };
}

export function readRepositoryState(repoRoot = REPO_ROOT) {
  const headSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const originMainSha = runGit(repoRoot, ['rev-parse', 'origin/main']);
  const treeSha = runGit(repoRoot, ['rev-parse', 'HEAD^{tree}']);
  const status = runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  return {
    headSha,
    originMainSha,
    treeSha,
    dirty: status !== '',
  };
}

export function compileCurrentRepositoryVerdict(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const repoState = readRepositoryState(repoRoot);
  const program = readJsonBounded(path.join(repoRoot, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json'));
  const scientificContracts = readJsonBounded(path.join(repoRoot, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'SCIENTIFIC_CONTRACTS.json'));
  const packageJson = readJsonBounded(path.join(repoRoot, 'package.json'));
  const workflowText = readTextBounded(path.join(repoRoot, '.github', 'workflows', 'rtk-required.yml'));
  return compileAtlasVerdict({
    program,
    scientificContracts,
    packageJson,
    workflowText,
    repoState,
    expectedHeadSha: options.expectedHeadSha || repoState.headSha,
    expectedOriginMainSha: options.expectedOriginMainSha ?? null,
    now: options.now,
  });
}

function parseCli(argv) {
  const out = { expectedHeadSha: '', expectedOriginMainSha: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--expected-head') out.expectedHeadSha = argv[i + 1] || '';
    if (argv[i] === '--expected-origin-main') out.expectedOriginMainSha = argv[i + 1] || '';
  }
  return out;
}

function main() {
  const args = parseCli(process.argv.slice(2));
  const receipt = compileCurrentRepositoryVerdict({
    expectedHeadSha: args.expectedHeadSha || undefined,
    expectedOriginMainSha: args.expectedOriginMainSha,
  });
  process.stdout.write(`R24_V1_ATLAS_CLAIM_RECEIPT=${JSON.stringify(receipt)}\n`);
  process.exitCode = receipt.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
