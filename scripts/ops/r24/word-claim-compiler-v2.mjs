#!/usr/bin/env node
// R2.4 V2 — Word profile claim compiler. This OPS-only projection binds the
// certified C8B/C9 W0 physical record to independently observed exact-head
// evidence. It intentionally keeps WORD_ROUNDTRIP BLOCKED and cannot grant
// route, apply, Safe Apply, user-document, Google, release, or Program PASS.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HEX40_RE, sha256hex } from './canonical-json.mjs';
import {
  EVIDENCE_CLASS_INDEPENDENT_EXACT_HEAD,
  validateObservedGateEvidenceRow,
} from './observed-evidence-v2.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');

export const V2_STAGE_ID = 'V2_WORD_CLAIM_COMPILER';
export const W0_STAGE_ID = 'W0_WORD_PHYSICAL_RECERTIFICATION';
export const V0_STAGE_ID = 'V0_WRITER_CLAIM_COMPILER';
export const P2_STAGE_ID = 'P2_DURABLE_SAVE_COORDINATOR';
export const T1_STAGE_ID = 'T1_ANCHOR_LINEAGE';
export const WORD_PROFILE_ID = 'WORD_ROUNDTRIP';
export const WORD_CLAIM_ID = 'CLM_WORD_ROUNDTRIP';
export const REQUIRED_EVIDENCE_CLASS = EVIDENCE_CLASS_INDEPENDENT_EXACT_HEAD;
export const LEGACY_CONTRACT_EVIDENCE_CLASS = 'E6_INDEPENDENT_EXACT_HEAD';
export const PROFILE_CLAIM_CEILING = 'PROFILE_VERDICT_ONLY';
export const WORD_PROFILE_VERDICT = 'WORD_ROUNDTRIP_BLOCKED_EVIDENCE_BOUND_BY_R24_EXACT_HEAD_W0_PREFIX';
export const PROGRAM_VERDICT = 'NEEDS_MORE_EVIDENCE';
export const V2_WORKFLOW_COMMAND = 'node --test test/unit/r24-v2-word-claim-compiler.test.js test/unit/r24-v2-word-claim-mutants.test.js';
export const SELECTED_PROFILES = Object.freeze(['SHARED_ASSURANCE', 'WRITER_CORE', WORD_PROFILE_ID]);
export const FORBIDDEN_PROMOTION_PROFILES = Object.freeze(['WRITER_CORE', 'ATLAS_MAPS_DERIVED', 'PACKAGED_RELEASE_SECURITY']);
export const CLAIM_CANNOT_PROMOTE_REQUIRED = Object.freeze(['SAFE_APPLY_WIDENING', 'USER_DOCUMENT_ACCESS', 'GOOGLE_EVIDENCE_TRANSFER']);
export const C8B_CONTRACT_DIGEST = 'c027961bd3c7faa781962e86b325b844053268b8ea4d1b3a958d1861c627304a';
export const C8B_EVIDENCE_DIGEST = '90d52e4fc6d9521e051a3c3d76a5061e0f75c8384c83df67c04de98d093ee1b8';
export const C8B_EXTERNAL_TERMINAL_DIGEST = 'd83dcb271ae1067e41bdaf82e1dc787905721edb4880350646a7e3b18ec6d7b8';

export const STAGE_SCRIPT_BY_ID = Object.freeze({
  [V0_STAGE_ID]: 'test:r24-v0',
  [P2_STAGE_ID]: 'test:r24-p2',
  [T1_STAGE_ID]: 'test:r24-t1',
  [W0_STAGE_ID]: 'test:r24-w0',
  [V2_STAGE_ID]: 'test:r24-v2',
});

const ALLOWED_EVIDENCE_SOURCES = new Set(['OBSERVED_EVIDENCE_STAMP_V2', 'V2_COMPILER_CONTRACT_FIXTURE']);
const FORBIDDEN_TRUE_FIELDS = Object.freeze([
  'routePassClaim', 'productApplyAuthority', 'safeApplyExpansion', 'wordTerminalPass',
  'programPass', 'userDocumentsTouched', 'userDocumentsAllowed', 'googleDocsTransfer',
  'releaseReady', 'productionReleaseReady', 'runtimeNetworkActivated',
]);
const NON_CLAIMS = Object.freeze([
  'NO_PROGRAM_DONE', 'NO_GLOBAL_SCALAR_PASS', 'NO_WRITER_CORE_PROMOTION',
  'NO_ATLAS_PROFILE_PROMOTION', 'NO_PACKAGED_RELEASE_PROFILE_PROMOTION',
  'NO_WORD_TERMINAL_PASS', 'NO_PRODUCT_APPLY_AUTHORITY', 'NO_SAFE_APPLY_EXPANSION',
  'NO_USER_WORD_DOCUMENT_ACCESS', 'NO_GOOGLE_DOCS_EVIDENCE_TRANSFER',
  'NO_RELEASE_READINESS', 'NO_PRODUCT_RUNTIME_MUTATION', 'NO_RUNTIME_DAEMON_OR_NETWORK',
]);

function fail(code, detail, context = {}) {
  return { ok: false, schemaVersion: 'yalken.r24.v2.word-claim-compiler.receipt.v1', verdict: 'FAIL', code, detail, context };
}
function readBytesBounded(filePath, maxBytes = 4 * 1024 * 1024) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`E_R24_V2_NOT_FILE:${filePath}`);
  if (stat.size > maxBytes) throw new Error(`E_R24_V2_FILE_TOO_LARGE:${filePath}:${stat.size}`);
  return fs.readFileSync(filePath);
}
function readJsonBounded(filePath) { return JSON.parse(readBytesBounded(filePath).toString('utf8')); }
function runGit(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
  return result.status === 0 ? String(result.stdout || '').trim() : null;
}
function sameSet(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && right.every((item) => new Set(left).has(item));
}
function stageMap(program) { return new Map((program?.stages || []).map((stage) => [stage.stageId, stage])); }
function arrayHasEvidenceClass(value) {
  return value === REQUIRED_EVIDENCE_CLASS || value === LEGACY_CONTRACT_EVIDENCE_CLASS
    || (Array.isArray(value) && (value.includes(REQUIRED_EVIDENCE_CLASS) || value.includes(LEGACY_CONTRACT_EVIDENCE_CLASS)));
}
export function extractR24WorkflowScripts(workflowText) {
  const actions = [];
  for (const line of String(workflowText || '').split(/\r?\n/u)) {
    const script = /^\s*run:\s+npm run -s (test:r24-[a-z0-9-]+)\s*$/u.exec(line)?.[1];
    if (script) actions.push(script);
    else if (line.trim() === `run: ${V2_WORKFLOW_COMMAND}`) actions.push(STAGE_SCRIPT_BY_ID[V2_STAGE_ID]);
  }
  return actions;
}

function validateScientificContract(scientificContracts) {
  const claim = scientificContracts?.claims?.find((row) => row.claimId === WORD_CLAIM_ID);
  if (!claim) return fail('E_R24_V2_WORD_CLAIM_CONTRACT_MISSING', WORD_CLAIM_ID);
  if (claim.profileId !== WORD_PROFILE_ID) return fail('E_R24_V2_WORD_CLAIM_PROFILE', String(claim.profileId || ''));
  if (![REQUIRED_EVIDENCE_CLASS, LEGACY_CONTRACT_EVIDENCE_CLASS].includes(claim.minimumEvidenceClass)) return fail('E_R24_V2_WORD_CLAIM_EVIDENCE_CLASS', String(claim.minimumEvidenceClass || ''));
  if (claim.currentVerdict !== 'BLOCKED') return fail('E_R24_V2_WORD_CONTRACT_BLOCKED_REQUIRED', String(claim.currentVerdict || ''));
  for (const item of CLAIM_CANNOT_PROMOTE_REQUIRED) if (!claim.cannotPromote?.includes(item)) return fail('E_R24_V2_CANNOT_PROMOTE_MISSING', item);
  const faultModel = scientificContracts?.faultModels?.find((row) => row.faultModelId === claim.faultModelId);
  const requiredFaults = ['ACCESSIBILITY_DENIED', 'ACCESSIBILITY_AMBIGUOUS', 'WORD_NOT_FRONTMOST', 'ZERO_WORD_WINDOWS', 'WORD_PROCESS_RESTART', 'COMMENT_LIFECYCLE_LIMITATION', 'MULTISCENE_AMBIGUITY', 'APPLY_REUSE_MISMATCH', 'HOSTILE_DOCX', 'AUTOMATION_TIMEOUT'];
  if (!faultModel || faultModel.profileId !== WORD_PROFILE_ID) return fail('E_R24_V2_FAULT_MODEL_BINDING', JSON.stringify(faultModel || null));
  for (const item of requiredFaults) if (!faultModel.includedFaults?.includes(item)) return fail('E_R24_V2_FAULT_MODEL_CASE_MISSING', item);
  for (const item of ['EXISTING_USER_DOCUMENT_MUTATION', 'GOOGLE_DOCS_EVIDENCE_TRANSFER']) if (!faultModel.excludedFaults?.includes(item)) return fail('E_R24_V2_FAULT_MODEL_EXCLUSION_MISSING', item);
  const consistencyModel = scientificContracts?.consistencyModels?.find((row) => row.consistencyModelId === claim.consistencyModelId);
  if (!consistencyModel || consistencyModel.profileId !== WORD_PROFILE_ID || !String(consistencyModel.law || '').includes('exact round, source, operation and physical-session lineage')) return fail('E_R24_V2_CONSISTENCY_MODEL_BINDING', JSON.stringify(consistencyModel || null));
  const resourceEnvelope = scientificContracts?.resourceEnvelopes?.find((row) => row.resourceEnvelopeId === claim.resourceEnvelopeId);
  if (!resourceEnvelope || resourceEnvelope.profileId !== WORD_PROFILE_ID || resourceEnvelope.limits?.existingUserDocuments !== 0 || resourceEnvelope.limits?.wordInstanceCount !== 1 || resourceEnvelope.limits?.physicalRows !== 'EXPLICIT_DENOMINATOR_REQUIRED' || resourceEnvelope.exceedDisposition !== 'BLOCKED') return fail('E_R24_V2_RESOURCE_ENVELOPE_BINDING', JSON.stringify(resourceEnvelope || null));
  return { ok: true, claim, faultModel, consistencyModel, resourceEnvelope };
}

function validateProgramContract(program, scientificContracts, selectedProfiles) {
  if (!Array.isArray(program?.stages)) return fail('E_R24_V2_PROGRAM_REQUIRED', 'PROGRAM_DAG must have stages[]');
  const stages = stageMap(program), v2 = stages.get(V2_STAGE_ID), w0 = stages.get(W0_STAGE_ID);
  if (!v2) return fail('E_R24_V2_STAGE_MISSING', V2_STAGE_ID);
  if (v2.profile !== WORD_PROFILE_ID || v2.mutationAuthority !== 'WORD_CLAIM_PROJECTION_ONLY' || v2.claimCeiling !== PROFILE_CLAIM_CEILING || !arrayHasEvidenceClass(v2.requiredEvidence) || !v2.dependsOn?.includes(W0_STAGE_ID)) return fail('E_R24_V2_STAGE_CONTRACT', JSON.stringify(v2));
  if (!w0 || w0.profile !== WORD_PROFILE_ID || w0.mutationAuthority !== 'WORD_SANDBOX_AND_PHYSICAL_EVIDENCE_ONLY' || w0.claimCeiling !== 'WORD_TESTED_DENOMINATOR_ONLY' || !w0.dependsOn?.includes(P2_STAGE_ID) || !w0.dependsOn?.includes(T1_STAGE_ID) || !w0.requiredEvidence?.includes('E5_PHYSICAL') || !arrayHasEvidenceClass(w0.requiredEvidence)) return fail('E_R24_V2_W0_STAGE_CONTRACT', JSON.stringify(w0));
  const profile = program.profiles?.find((row) => row.profileId === WORD_PROFILE_ID);
  if (!profile || !sameSet(profile.mayDependOn, SELECTED_PROFILES) || !sameSet(selectedProfiles, SELECTED_PROFILES)) return fail('E_R24_V2_PROFILE_DEPENDENCY_LAW', JSON.stringify(profile || null));
  if (program.verdictAggregation?.kind !== 'PROFILE_VECTOR' || program.verdictAggregation?.globalScalarPassForbidden !== true || program.verdictAggregation?.profileEvidenceTransferRequiresExplicitBinding !== true || program.verdictAggregation?.currentVector?.[WORD_PROFILE_ID] !== 'BLOCKED' || program.programVerdict === 'PASS') return fail('E_R24_V2_VERDICT_AGGREGATION', JSON.stringify(program.verdictAggregation || null));
  const scientific = validateScientificContract(scientificContracts);
  return scientific.ok ? { ok: true, stages, scientific } : scientific;
}

function validateRepositoryIdentity(repoState, expectedHeadSha, expectedOriginMainSha) {
  if (!HEX40_RE.test(String(repoState?.headSha || '')) || !HEX40_RE.test(String(expectedHeadSha || ''))) return fail('E_R24_V2_HEAD_REQUIRED', String(repoState?.headSha || ''));
  if (repoState.headSha !== expectedHeadSha) return fail('E_R24_V2_EXACT_HEAD_MISMATCH', `${repoState.headSha} != ${expectedHeadSha}`);
  if (expectedOriginMainSha != null && repoState.originMainSha !== expectedOriginMainSha) return fail('E_R24_V2_ORIGIN_MAIN_MISMATCH', `${repoState.originMainSha} != ${expectedOriginMainSha}`);
  if (repoState.dirty === true) return fail('E_R24_V2_WORKTREE_DIRTY', 'clean exact-head Word claim evidence required');
  return { ok: true };
}

function validateClaimRequest(request = {}) {
  if (request.programVerdict === 'PASS' || request.globalScalarPass === true) return fail('E_R24_V2_PROGRAM_SCALAR_PASS_FORBIDDEN', 'V2 cannot emit Program PASS');
  if (request.claimCeiling && request.claimCeiling !== PROFILE_CLAIM_CEILING) return fail('E_R24_V2_OVERCLAIM', request.claimCeiling);
  if (request.profileId && request.profileId !== WORD_PROFILE_ID) return fail('E_R24_V2_PROFILE_IMPORT_FORBIDDEN', request.profileId);
  if (request.profiles?.some((profile) => profile !== WORD_PROFILE_ID) || request.promoteProfiles?.length > 0) return fail('E_R24_V2_PROFILE_IMPORT_FORBIDDEN', JSON.stringify(request.profiles || request.promoteProfiles));
  const forbidden = FORBIDDEN_TRUE_FIELDS.find((field) => request[field] === true);
  if (forbidden) return fail('E_R24_V2_AUTHORITY_PROMOTION_FORBIDDEN', forbidden);
  return { ok: true };
}

function validateWorkflowBinding(packageJson, workflowText) {
  const scripts = packageJson?.scripts || {}, workflowScripts = extractR24WorkflowScripts(workflowText);
  for (const stageId of [V0_STAGE_ID, W0_STAGE_ID]) if (!scripts[STAGE_SCRIPT_BY_ID[stageId]]) return fail('E_R24_V2_PACKAGE_SCRIPT_MISSING', STAGE_SCRIPT_BY_ID[stageId]);
  const v0Index = workflowScripts.indexOf(STAGE_SCRIPT_BY_ID[V0_STAGE_ID]);
  const w0Index = workflowScripts.indexOf(STAGE_SCRIPT_BY_ID[W0_STAGE_ID]);
  const v2Index = workflowScripts.indexOf(STAGE_SCRIPT_BY_ID[V2_STAGE_ID]);
  if (v0Index < 0 || w0Index < 0 || v2Index < 0) return fail('E_R24_V2_WORKFLOW_STEP_MISSING', JSON.stringify({ v0Index, w0Index, v2Index }));
  if (v0Index >= v2Index || w0Index >= v2Index) return fail('E_R24_V2_WORKFLOW_ORDER', JSON.stringify({ v0Index, w0Index, v2Index }));
  return { ok: true, v0Index, w0Index, v2Index };
}

function validatePhysicalEvidence({ c8bContract, c8bEvidence, c9EffectiveState, sourceDigests }) {
  if (sourceDigests?.c8bContract !== C8B_CONTRACT_DIGEST || sourceDigests?.c8bEvidence !== C8B_EVIDENCE_DIGEST) return fail('E_R24_V2_C8B_SOURCE_DIGEST', JSON.stringify(sourceDigests || null));
  const correction = c9EffectiveState?.appendOnlyCorrections?.find((row) => row.nodeId === W0_STAGE_ID && row.correctionId === 'C8B_W0_CERTIFIED_CORRECTION');
  if (!correction || correction.from !== 'BLOCKED_TYPED' || correction.to !== 'DONE' || correction.evidence?.contractDigest !== C8B_CONTRACT_DIGEST || correction.evidence?.evidenceDigest !== C8B_EVIDENCE_DIGEST || correction.evidence?.externalTerminalAttestationDigest !== C8B_EXTERNAL_TERMINAL_DIGEST) return fail('E_R24_V2_C9_W0_CORRECTION_BINDING', JSON.stringify(correction || null));
  if (c8bContract?.acceptanceSignals?.WORD_PHYSICAL_PASS !== true || c8bContract?.claimCeiling !== 'C8B_SYNTHETIC_WORD_PHYSICAL_ENVELOPE_ONLY' || c8bContract?.boundedLedger?.operationCount !== 4 || c8bContract?.boundedLedger?.familyCounts?.root_comment !== 4 || !c8bContract?.nonClaims?.includes('NO_WORD_PRODUCT_TERMINAL_PASS') || !c8bContract?.nonClaims?.includes('NO_SAFE_APPLY_EXPANSION')) return fail('E_R24_V2_C8B_CONTRACT_BOUNDARY', 'contract');
  const observations = c8bEvidence?.observations;
  if (c8bEvidence?.acceptanceSignals?.WORD_PHYSICAL_PASS !== 'PASS' || observations?.operations?.attempted !== 4 || observations?.operations?.reported !== 4 || observations?.operations?.familyCounts?.root_comment !== 4 || observations?.roundTrip?.routeGapCount !== 0 || observations?.roundTrip?.wordStatus !== 'PASS' || observations?.safety?.syntheticCorpusOnly !== true || observations?.safety?.userDocumentsRead !== 0 || observations?.safety?.userDocumentsWritten !== 0 || observations?.safety?.userDocumentsTouched !== false) return fail('E_R24_V2_C8B_EVIDENCE_BOUNDARY', 'evidence');
  return { ok: true, correction };
}

function validateGateEvidence(gateEvidence, stages, expectedHeadSha, expectedTreeSha) {
  if (!Array.isArray(gateEvidence) || gateEvidence.length !== 1) return fail('E_R24_V2_GATE_EVIDENCE_DENOMINATOR', String(gateEvidence?.length ?? 'missing'));
  const row = gateEvidence[0];
  if (row.stageId !== W0_STAGE_ID || !ALLOWED_EVIDENCE_SOURCES.has(row.source)) return fail('E_R24_V2_GATE_EVIDENCE_SOURCE', `${row.stageId}:${row.source}`);
  const observed = validateObservedGateEvidenceRow({ row, stageId: W0_STAGE_ID, stage: stages.get(W0_STAGE_ID), expectedHeadSha, expectedTreeSha, expectedScript: STAGE_SCRIPT_BY_ID[W0_STAGE_ID], requiredEvidenceClass: REQUIRED_EVIDENCE_CLASS });
  if (!observed.ok) return fail(`E_R24_V2_${observed.code}`, observed.detail, observed.context);
  if (row.profileVerdictCandidate !== 'BLOCKED' || row.stageClosureKind !== 'TYPED_WORD_PROFILE_BLOCKED_CLASSIFICATION') return fail('E_R24_V2_W0_BLOCKED_CLASSIFICATION_REQUIRED', String(row.profileVerdictCandidate || ''));
  if (row.c8bContractDigest !== C8B_CONTRACT_DIGEST || row.c8bEvidenceDigest !== C8B_EVIDENCE_DIGEST || row.c8bExternalTerminalDigest !== C8B_EXTERNAL_TERMINAL_DIGEST) return fail('E_R24_V2_GATE_PHYSICAL_BINDING', W0_STAGE_ID);
  const forbidden = FORBIDDEN_TRUE_FIELDS.find((field) => row[field] === true);
  if (forbidden) return fail('E_R24_V2_GATE_AUTHORITY_PROMOTION_FORBIDDEN', forbidden);
  return { ok: true };
}

export function compileWordVerdict(input = {}) {
  const expectedHeadSha = input.expectedHeadSha || input.repoState?.headSha;
  const selectedProfiles = input.selectedProfiles || [...SELECTED_PROFILES];
  for (const check of [
    validateRepositoryIdentity(input.repoState, expectedHeadSha, input.expectedOriginMainSha ?? null),
    validateProgramContract(input.program, input.scientificContracts, selectedProfiles),
    validateClaimRequest(input.claimRequest),
    validateWorkflowBinding(input.packageJson, input.workflowText),
    validatePhysicalEvidence(input),
  ]) if (!check.ok) return check;
  const programCheck = validateProgramContract(input.program, input.scientificContracts, selectedProfiles);
  const workflow = validateWorkflowBinding(input.packageJson, input.workflowText);
  const evidenceCheck = validateGateEvidence(input.gateEvidence, programCheck.stages, expectedHeadSha, input.repoState?.treeSha || null);
  if (!evidenceCheck.ok) return evidenceCheck;
  const gateEvidenceDigest = sha256hex(JSON.stringify(input.gateEvidence));
  return {
    ok: true,
    schemaVersion: 'yalken.r24.v2.word-claim-compiler.receipt.v1',
    verdict: 'PASS',
    code: 'R24_V2_WORD_PROFILE_VERDICT_COMPILED',
    generatedAt: input.now || new Date().toISOString(),
    exactIdentity: { headSha: input.repoState.headSha, originMainSha: input.repoState.originMainSha || null, treeSha: input.repoState.treeSha || null, dirty: false },
    selectedProfiles: [...SELECTED_PROFILES],
    profileVerdict: { profileId: WORD_PROFILE_ID, verdict: WORD_PROFILE_VERDICT, currentVerdict: 'BLOCKED', sourceContractVerdict: 'BLOCKED', claimCeiling: PROFILE_CLAIM_CEILING, requiredEvidenceClass: REQUIRED_EVIDENCE_CLASS, requiredStageIds: [W0_STAGE_ID], requiredStageCount: 1, closedStageCount: 1, gateEvidenceDigest },
    physicalEvidence: { w0CertifiedDone: true, boundedRootCommentOperations: 4, physicalWordPass: true, wordProductTerminalPass: false, c8bContractDigest: C8B_CONTRACT_DIGEST, c8bEvidenceDigest: C8B_EVIDENCE_DIGEST, c8bExternalTerminalDigest: C8B_EXTERNAL_TERMINAL_DIGEST },
    sourceClaimContract: { claimId: programCheck.scientific.claim.claimId, faultModelId: programCheck.scientific.claim.faultModelId, consistencyModelId: programCheck.scientific.claim.consistencyModelId, resourceEnvelopeId: programCheck.scientific.claim.resourceEnvelopeId, cannotPromote: [...programCheck.scientific.claim.cannotPromote] },
    wordRoundtripProfile: { currentVerdict: 'BLOCKED', routePassClaim: false, productApplyAuthority: false, safeApplyExpansion: false, userDocumentsTouched: false, googleDocsTransfer: false, releaseReady: false },
    dependencyProfilesObserved: ['SHARED_ASSURANCE', 'WRITER_CORE'],
    nonClaimedProfiles: [...FORBIDDEN_PROMOTION_PROFILES],
    programVerdict: PROGRAM_VERDICT,
    globalScalarPassForbidden: true,
    programDone: false,
    nonClaims: [...NON_CLAIMS],
    workflow: { v0Script: STAGE_SCRIPT_BY_ID[V0_STAGE_ID], w0Script: STAGE_SCRIPT_BY_ID[W0_STAGE_ID], v2Script: V2_WORKFLOW_COMMAND, v0WorkflowIndex: workflow.v0Index, w0WorkflowIndex: workflow.w0Index, v2WorkflowIndex: workflow.v2Index },
  };
}

export function readRepositoryState(repoRoot = REPO_ROOT) {
  const headSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const originMainSha = runGit(repoRoot, ['rev-parse', 'origin/main']);
  const treeSha = runGit(repoRoot, ['rev-parse', 'HEAD^{tree}']);
  return { headSha, originMainSha, treeSha, dirty: runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']) !== '' };
}
export function compileCurrentRepositoryVerdict(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const files = {
    program: 'docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/PROGRAM_DAG.json',
    scientificContracts: 'docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/SCIENTIFIC_CONTRACTS.json',
    c8bContract: 'docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_CONTRACT_V1.json',
    c8bEvidence: 'docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_EVIDENCE_V1.json',
    c9EffectiveState: 'docs/OPS/R24/CORRECTIVE/C9_EFFECTIVE_STATE_V1.json',
  };
  const input = Object.fromEntries(Object.entries(files).map(([key, relative]) => [key, readJsonBounded(path.join(repoRoot, relative))]));
  input.sourceDigests = { c8bContract: sha256hex(readBytesBounded(path.join(repoRoot, files.c8bContract))), c8bEvidence: sha256hex(readBytesBounded(path.join(repoRoot, files.c8bEvidence))) };
  input.packageJson = readJsonBounded(path.join(repoRoot, 'package.json'));
  input.workflowText = readBytesBounded(path.join(repoRoot, '.github/workflows/rtk-required.yml')).toString('utf8');
  input.repoState = readRepositoryState(repoRoot);
  input.gateEvidence = options.gateEvidencePath ? readJsonBounded(path.resolve(repoRoot, options.gateEvidencePath)) : undefined;
  input.expectedHeadSha = options.expectedHeadSha || input.repoState.headSha;
  input.expectedOriginMainSha = options.expectedOriginMainSha ?? null;
  input.now = options.now;
  return compileWordVerdict(input);
}

function parseCli(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--expected-head') out.expectedHeadSha = argv[index + 1];
    if (argv[index] === '--expected-origin-main') out.expectedOriginMainSha = argv[index + 1];
    if (argv[index] === '--gate-evidence') out.gateEvidencePath = argv[index + 1];
  }
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const receipt = compileCurrentRepositoryVerdict(parseCli(process.argv.slice(2)));
  process.stdout.write(`R24_V2_WORD_CLAIM_RECEIPT=${JSON.stringify(receipt)}\n`);
  process.exitCode = receipt.ok ? 0 : 1;
}
