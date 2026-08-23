#!/usr/bin/env node
// R2.4 V0 — Writer profile claim compiler. This is an OPS-only projection:
// it reads exact-head gate evidence and emits a bounded Writer-profile
// verdict while refusing optional-profile evidence or global/program PASS.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HEX40_RE, sha256hex } from './canonical-json.mjs';
import {
  EVIDENCE_CLASS_INDEPENDENT_EXACT_HEAD,
  buildTopologyOnlyEvidenceFromWorkflowPrefix,
  validateObservedGateEvidenceRow,
} from './observed-evidence-v2.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');
const PROGRAM_DAG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const RTK_REQUIRED_WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'rtk-required.yml');

export const V0_STAGE_ID = 'V0_WRITER_CLAIM_COMPILER';
export const WRITER_PROFILE_ID = 'WRITER_CORE';
export const SELECTED_PROFILES = Object.freeze(['SHARED_ASSURANCE', WRITER_PROFILE_ID]);
export const OPTIONAL_PROFILES = Object.freeze(['ATLAS_MAPS_DERIVED', 'WORD_ROUNDTRIP', 'PACKAGED_RELEASE_SECURITY']);
export const REQUIRED_EVIDENCE_CLASS = EVIDENCE_CLASS_INDEPENDENT_EXACT_HEAD;
export const LEGACY_CONTRACT_EVIDENCE_CLASS = 'E6_INDEPENDENT_EXACT_HEAD';
export const PROFILE_CLAIM_CEILING = 'PROFILE_VERDICT_ONLY';
export const WRITER_PROFILE_VERDICT = 'WRITER_CORE_EVIDENCE_BOUND_BY_R24_EXACT_HEAD_PREFIX';
export const PROGRAM_VERDICT = 'NEEDS_MORE_EVIDENCE';

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
  [V0_STAGE_ID]: 'test:r24-v0',
});

const ALLOWED_EVIDENCE_SOURCES = new Set([
  'RTK_REQUIRED_WORKFLOW_PREFIX',
  'OBSERVED_EVIDENCE_STAMP_V2',
  'V0_COMPILER_CONTRACT_FIXTURE',
]);

const NON_CLAIMS = Object.freeze([
  'NO_PROGRAM_DONE',
  'NO_GLOBAL_SCALAR_PASS',
  'NO_RELEASE_READINESS',
  'NO_ATLAS_PROFILE_VERDICT',
  'NO_WORD_PROFILE_VERDICT',
  'NO_PACKAGED_RELEASE_PROFILE_VERDICT',
  'NO_PRODUCT_RUNTIME_MUTATION',
]);

function fail(code, detail, context = {}) {
  return {
    ok: false,
    schemaVersion: 'yalken.r24.v0.writer-claim-compiler.receipt.v1',
    verdict: 'FAIL',
    code,
    detail,
    context,
  };
}

function readTextBounded(filePath, maxBytes = 4 * 1024 * 1024) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`E_R24_V0_NOT_FILE:${filePath}`);
  if (stat.size > maxBytes) throw new Error(`E_R24_V0_FILE_TOO_LARGE:${filePath}:${stat.size}`);
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
  if (left.length !== right.length) return false;
  const seen = new Set(left);
  return right.every((item) => seen.has(item));
}

function arrayHasEvidenceClass(value) {
  if (value === REQUIRED_EVIDENCE_CLASS) return true;
  if (value === LEGACY_CONTRACT_EVIDENCE_CLASS) return true;
  return Array.isArray(value) && (value.includes(REQUIRED_EVIDENCE_CLASS) || value.includes(LEGACY_CONTRACT_EVIDENCE_CLASS));
}

export function expectedWriterStageIds(programInput) {
  const program = normalizeProgram(programInput);
  if (!program) return [];
  const selected = new Set(SELECTED_PROFILES);
  return program.stages
    .filter((stage) => {
      if (!selected.has(stage.profile)) return false;
      if (stage.stageId === 'G0_AUTHORITY_CLOSURE') return false;
      if (stage.stageId === V0_STAGE_ID) return false;
      if (String(stage.stageId || '').startsWith('V')) return false;
      return true;
    })
    .map((stage) => stage.stageId);
}

export function extractR24WorkflowScripts(workflowText) {
  const scripts = [];
  const re = /^\s*run:\s+npm run -s (test:r24-[a-z0-9-]+)\s*$/gmu;
  for (const match of workflowText.matchAll(re)) scripts.push(match[1]);
  return scripts;
}

export function buildGateEvidenceFromWorkflowPrefix({ program, workflowText, repoState, expectedHeadSha }) {
  const requiredStageIds = expectedWriterStageIds(program);
  const scripts = extractR24WorkflowScripts(workflowText);
  void repoState;
  void expectedHeadSha;
  return buildTopologyOnlyEvidenceFromWorkflowPrefix({
    requiredStageIds,
    workflowScripts: scripts,
    compilerScript: STAGE_SCRIPT_BY_ID[V0_STAGE_ID],
    stageScriptById: STAGE_SCRIPT_BY_ID,
  });
}

function validateProgramContract({ program, selectedProfiles }) {
  const normalized = normalizeProgram(program);
  if (!normalized) return fail('E_R24_V0_PROGRAM_REQUIRED', 'PROGRAM_DAG must have stages[]');
  const stages = stageMap(normalized);
  const v0 = stages.get(V0_STAGE_ID);
  if (!v0) return fail('E_R24_V0_STAGE_MISSING', V0_STAGE_ID);
  if (v0.profile !== WRITER_PROFILE_ID) return fail('E_R24_V0_STAGE_PROFILE', v0.profile);
  if (v0.mutationAuthority !== 'WRITER_CLAIM_PROJECTION_ONLY') return fail('E_R24_V0_STAGE_AUTHORITY', v0.mutationAuthority);
  if (v0.claimCeiling !== PROFILE_CLAIM_CEILING) return fail('E_R24_V0_CLAIM_CEILING', v0.claimCeiling);
  if (!arrayHasEvidenceClass(v0.requiredEvidence)) {
    return fail('E_R24_V0_REQUIRED_EVIDENCE_CLASS_MISSING', JSON.stringify(v0.requiredEvidence || []));
  }
  if (!Array.isArray(v0.dependsOn) || !v0.dependsOn.includes('F0_WRITER_REFINEMENT_CONFORMANCE')) {
    return fail('E_R24_V0_F0_DEPENDENCY_MISSING', JSON.stringify(v0.dependsOn || []));
  }
  if (!sameSet(selectedProfiles, SELECTED_PROFILES)) {
    return fail('E_R24_V0_SELECTED_PROFILE_SET', JSON.stringify(selectedProfiles));
  }
  const writerProfile = (normalized.profiles || []).find((profile) => profile.profileId === WRITER_PROFILE_ID);
  if (!writerProfile || !sameSet(writerProfile.mayDependOn || [], SELECTED_PROFILES)) {
    return fail('E_R24_V0_WRITER_PROFILE_DEPENDENCY_LAW', JSON.stringify(writerProfile || null));
  }
  if (normalized.verdictAggregation?.globalScalarPassForbidden !== true) {
    return fail('E_R24_V0_GLOBAL_SCALAR_PASS_FORBIDDEN_MISSING', 'globalScalarPassForbidden must be true');
  }
  if (normalized.programVerdict === 'PASS') return fail('E_R24_V0_PROGRAM_SCALAR_PASS_FORBIDDEN', 'PROGRAM_DAG programVerdict cannot be PASS');
  const requiredStageIds = expectedWriterStageIds(normalized);
  if (requiredStageIds.length === 0) return fail('E_R24_V0_ZERO_DENOMINATOR', 'no Writer stages selected');
  return { ok: true, requiredStageIds, stages };
}

function validateRepositoryIdentity({ repoState, expectedHeadSha, expectedOriginMainSha }) {
  if (!repoState || !HEX40_RE.test(String(repoState.headSha || ''))) {
    return fail('E_R24_V0_HEAD_REQUIRED', String(repoState?.headSha || ''));
  }
  if (!HEX40_RE.test(String(expectedHeadSha || ''))) {
    return fail('E_R24_V0_EXPECTED_HEAD_REQUIRED', String(expectedHeadSha || ''));
  }
  if (repoState.headSha !== expectedHeadSha) {
    return fail('E_R24_V0_EXACT_HEAD_MISMATCH', `${repoState.headSha} != ${expectedHeadSha}`, { headSha: repoState.headSha, expectedHeadSha });
  }
  if (expectedOriginMainSha !== null && expectedOriginMainSha !== undefined && repoState.originMainSha !== expectedOriginMainSha) {
    return fail('E_R24_V0_ORIGIN_MAIN_MISMATCH', `${repoState.originMainSha} != ${expectedOriginMainSha}`, {
      originMainSha: repoState.originMainSha,
      expectedOriginMainSha,
    });
  }
  if (repoState.dirty === true) return fail('E_R24_V0_WORKTREE_DIRTY', 'clean exact-head evidence required');
  return { ok: true };
}

function validateClaimRequest(claimRequest = {}) {
  if (claimRequest.programVerdict === 'PASS' || claimRequest.globalScalarPass === true) {
    return fail('E_R24_V0_PROGRAM_SCALAR_PASS_FORBIDDEN', 'V0 may not emit a global/program PASS');
  }
  if (claimRequest.claimCeiling && claimRequest.claimCeiling !== PROFILE_CLAIM_CEILING) {
    return fail('E_R24_V0_OVERCLAIM', claimRequest.claimCeiling);
  }
  if (Array.isArray(claimRequest.profiles)) {
    const optional = claimRequest.profiles.filter((profile) => OPTIONAL_PROFILES.includes(profile));
    if (optional.length > 0) return fail('E_R24_V0_OPTIONAL_PROFILE_IMPORTED', optional.join(','));
  }
  return { ok: true };
}

function validateWorkflowBinding({ program, packageJson, workflowText, requiredStageIds }) {
  const packageScripts = packageJson?.scripts || {};
  const workflowScripts = extractR24WorkflowScripts(workflowText);
  if (workflowScripts.length === 0) return fail('E_R24_V0_WORKFLOW_NO_R24_STEPS', 'no test:r24-* steps found');
  const duplicate = workflowScripts.find((script, index) => workflowScripts.indexOf(script) !== index);
  if (duplicate) return fail('E_R24_V0_WORKFLOW_DUPLICATE_STEP', duplicate);

  const v0Script = STAGE_SCRIPT_BY_ID[V0_STAGE_ID];
  if (!packageScripts[v0Script]) return fail('E_R24_V0_PACKAGE_SCRIPT_MISSING', v0Script);
  const v0Index = workflowScripts.indexOf(v0Script);
  if (v0Index < 0) return fail('E_R24_V0_WORKFLOW_STEP_MISSING', v0Script);

  const stages = stageMap(program);
  const scriptIndex = new Map(workflowScripts.map((script, index) => [script, index]));
  for (const stageId of requiredStageIds) {
    const script = STAGE_SCRIPT_BY_ID[stageId];
    if (!script) return fail('E_R24_V0_STAGE_SCRIPT_UNBOUND', stageId);
    if (!packageScripts[script]) return fail('E_R24_V0_PACKAGE_SCRIPT_MISSING', script);
    if (!scriptIndex.has(script)) return fail('E_R24_V0_WORKFLOW_STEP_MISSING', script);
    if (scriptIndex.get(script) >= v0Index) return fail('E_R24_V0_WORKFLOW_PREFIX_INVALID', `${script} must run before ${v0Script}`);
    const stage = stages.get(stageId);
    for (const dep of stage.dependsOn || []) {
      if (dep === 'G0_AUTHORITY_CLOSURE') continue;
      if (!requiredStageIds.includes(dep)) continue;
      const depScript = STAGE_SCRIPT_BY_ID[dep];
      if (scriptIndex.get(depScript) >= scriptIndex.get(script)) {
        return fail('E_R24_V0_WORKFLOW_DEPENDENCY_ORDER', `${depScript} must run before ${script}`);
      }
    }
  }
  if (scriptIndex.get(STAGE_SCRIPT_BY_ID.F0_WRITER_REFINEMENT_CONFORMANCE) >= v0Index) {
    return fail('E_R24_V0_WORKFLOW_F0_BEFORE_V0_REQUIRED', 'F0 must run before V0');
  }
  return {
    ok: true,
    workflowScripts,
    v0WorkflowIndex: v0Index,
    supportingScriptsBeforeV0: workflowScripts.slice(0, v0Index).filter((script) => !Object.values(STAGE_SCRIPT_BY_ID).includes(script)),
  };
}

function validateGateEvidence({ gateEvidence, requiredStageIds, stages, expectedHeadSha, expectedTreeSha }) {
  if (!Array.isArray(gateEvidence)) return fail('E_R24_V0_GATE_OBSERVED_EVIDENCE_REQUIRED', 'gateEvidence must be supplied by an observed EvidenceStampV2 source');
  const evidenceByStage = new Map(gateEvidence.map((row) => [row.stageId, row]));
  const optionalEvidence = gateEvidence.filter((row) => OPTIONAL_PROFILES.includes(stages.get(row.stageId)?.profile));
  if (optionalEvidence.length > 0) return fail('E_R24_V0_OPTIONAL_PROFILE_IMPORTED', optionalEvidence.map((row) => row.stageId).join(','));
  for (const row of gateEvidence) {
    if (!stages.has(row.stageId)) return fail('E_R24_V0_GATE_EVIDENCE_UNKNOWN_STAGE', row.stageId);
    if (!ALLOWED_EVIDENCE_SOURCES.has(row.source)) return fail('E_R24_V0_GATE_EVIDENCE_SOURCE', `${row.stageId}:${row.source}`);
  }
  for (const stageId of requiredStageIds) {
    if (!evidenceByStage.has(stageId)) return fail('E_R24_V0_GATE_EVIDENCE_MISSING', stageId);
    const row = evidenceByStage.get(stageId);
    const observed = validateObservedGateEvidenceRow({
      row,
      stageId,
      stage: stages.get(stageId),
      expectedHeadSha,
      expectedTreeSha,
      expectedScript: STAGE_SCRIPT_BY_ID[stageId],
      requiredEvidenceClass: REQUIRED_EVIDENCE_CLASS,
    });
    if (!observed.ok) return fail(`E_R24_V0_${observed.code}`, observed.detail, observed.context);
  }
  if (requiredStageIds.length === 0 || gateEvidence.length === 0) return fail('E_R24_V0_ZERO_DENOMINATOR', 'gate evidence denominator is zero');
  return { ok: true };
}

export function compileWriterVerdict(input = {}) {
  const program = input.program;
  const selectedProfiles = input.selectedProfiles || [...SELECTED_PROFILES];
  const expectedHeadSha = input.expectedHeadSha || input.repoState?.headSha;
  const expectedOriginMainSha = input.expectedOriginMainSha ?? null;
  const now = input.now || new Date().toISOString();

  const identity = validateRepositoryIdentity({ repoState: input.repoState, expectedHeadSha, expectedOriginMainSha });
  if (!identity.ok) return identity;
  const programCheck = validateProgramContract({ program, selectedProfiles });
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
  const gateEvidence = Array.isArray(input.gateEvidence) ? input.gateEvidence : null;
  const evidenceCheck = validateGateEvidence({
    gateEvidence,
    requiredStageIds: programCheck.requiredStageIds,
    stages: programCheck.stages,
    expectedHeadSha,
    expectedTreeSha: input.repoState.treeSha || null,
  });
  if (!evidenceCheck.ok) return evidenceCheck;

  const gateEvidenceDigest = sha256hex(JSON.stringify(gateEvidence.map((row) => ({
    stageId: row.stageId,
    status: row.status,
    headSha: row.headSha,
    evidenceClass: row.evidenceClass || row.evidenceClasses,
    source: row.source,
    script: row.script || null,
    treeSha: row.treeSha || null,
    runId: row.run?.id || null,
    jobId: row.job?.id || null,
    stepName: row.step?.name || null,
    artifactDigest: row.artifact?.digest || null,
    toolDigest: row.tool?.digest || null,
    schemaDigest: row.schema?.digest || null,
    fixtureDigest: row.fixture?.digest || null,
    denominator: row.counts?.denominator || null,
    passed: row.counts?.passed || null,
    failed: row.counts?.failed || null,
    skipped: row.counts?.skipped || null,
    exitCode: row.counts?.exitCode ?? null,
    workflowIndex: Number.isInteger(row.workflowIndex) ? row.workflowIndex : null,
  }))));

  return {
    ok: true,
    schemaVersion: 'yalken.r24.v0.writer-claim-compiler.receipt.v1',
    verdict: 'PASS',
    code: 'R24_V0_PROFILE_VERDICT_COMPILED',
    generatedAt: now,
    exactIdentity: {
      headSha: input.repoState.headSha,
      originMainSha: input.repoState.originMainSha || null,
      treeSha: input.repoState.treeSha || null,
      dirty: input.repoState.dirty === true,
    },
    selectedProfiles: [...SELECTED_PROFILES],
    profileVerdict: {
      profileId: WRITER_PROFILE_ID,
      verdict: WRITER_PROFILE_VERDICT,
      claimCeiling: PROFILE_CLAIM_CEILING,
      requiredEvidenceClass: REQUIRED_EVIDENCE_CLASS,
      requiredStageCount: programCheck.requiredStageIds.length,
      closedStageCount: gateEvidence.length,
      requiredStageIds: programCheck.requiredStageIds,
      gateEvidenceDigest,
    },
    programVerdict: PROGRAM_VERDICT,
    globalScalarPassForbidden: true,
    optionalProfilesExcluded: [...OPTIONAL_PROFILES],
    nonClaims: [...NON_CLAIMS],
    workflow: {
      v0Script: STAGE_SCRIPT_BY_ID[V0_STAGE_ID],
      v0WorkflowIndex: workflowCheck.v0WorkflowIndex,
      supportingScriptsBeforeV0: workflowCheck.supportingScriptsBeforeV0,
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
  const packageJson = readJsonBounded(path.join(repoRoot, 'package.json'));
  const workflowText = readTextBounded(path.join(repoRoot, '.github', 'workflows', 'rtk-required.yml'));
  const gateEvidence = options.gateEvidencePath ? readJsonBounded(path.resolve(repoRoot, options.gateEvidencePath)) : undefined;
  return compileWriterVerdict({
    program,
    packageJson,
    workflowText,
    repoState,
    gateEvidence,
    expectedHeadSha: options.expectedHeadSha || repoState.headSha,
    expectedOriginMainSha: options.expectedOriginMainSha ?? null,
    now: options.now,
  });
}

function parseCli(argv) {
  const out = { expectedHeadSha: '', expectedOriginMainSha: null, gateEvidencePath: '' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--expected-head') out.expectedHeadSha = argv[i + 1] || '';
    if (argv[i] === '--expected-origin-main') out.expectedOriginMainSha = argv[i + 1] || '';
    if (argv[i] === '--gate-evidence') out.gateEvidencePath = argv[i + 1] || '';
  }
  return out;
}

function main() {
  const args = parseCli(process.argv.slice(2));
  const receipt = compileCurrentRepositoryVerdict({
    expectedHeadSha: args.expectedHeadSha || undefined,
    expectedOriginMainSha: args.expectedOriginMainSha,
    gateEvidencePath: args.gateEvidencePath || undefined,
  });
  process.stdout.write(`R24_V0_WRITER_CLAIM_RECEIPT=${JSON.stringify(receipt)}\n`);
  process.exitCode = receipt.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
