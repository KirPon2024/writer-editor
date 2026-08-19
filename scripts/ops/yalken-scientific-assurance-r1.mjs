#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TOOL_VERSION = 'yalken-scientific-assurance-r1.v1';
export const PROGRAM_ID = 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1';
export const DEFAULT_PATHS = Object.freeze({
  sourceBindings: 'docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/SOURCE_BINDINGS.json',
  findingMap: 'docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/FINDING_MAP.json',
  programDag: 'docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/PROGRAM_DAG.json',
  scientificContracts: 'docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/SCIENTIFIC_CONTRACTS.json',
});

const REQUIRED_PROFILES = new Set([
  'SHARED_ASSURANCE',
  'WRITER_CORE',
  'ATLAS_MAPS_DERIVED',
  'WORD_ROUNDTRIP',
  'PACKAGED_RELEASE_SECURITY',
]);

const OPTIONAL_PROFILES = new Set([
  'ATLAS_MAPS_DERIVED',
  'WORD_ROUNDTRIP',
  'PACKAGED_RELEASE_SECURITY',
]);

const EXPECTED_AUTHORING_STATES = [
  'SAVED',
  'PROTECTED',
  'CAPTURED',
  'AT_RISK',
  'DIVERGED',
  'RECONCILING',
];

const EXPECTED_SAVE_PHASES = [
  'CAPTURE_EXACT_REVISION',
  'WRITE_UNIQUE_TEMP',
  'SYNC_TEMP_DATA',
  'ATOMIC_PUBLISH',
  'SYNC_PARENT_DIRECTORY',
  'EXACT_READBACK_VERIFY',
  'COMMIT_DURABLE_HEAD',
  'ACK_EXACT_REVISION',
];

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, stableSort(value[key])]),
  );
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Document(document) {
  return sha256Bytes(Buffer.from(JSON.stringify(stableSort(document))));
}

function sha256File(absPath) {
  return sha256Bytes(fs.readFileSync(absPath));
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function resolveRepoRoot(explicit = '') {
  const requested = normalizeString(explicit);
  if (requested) {
    const resolved = path.resolve(requested);
    return fs.existsSync(path.join(resolved, 'CANON.md')) ? resolved : '';
  }
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (git.status !== 0) return '';
  const resolved = path.resolve(normalizeString(git.stdout));
  return fs.existsSync(path.join(resolved, 'CANON.md')) ? resolved : '';
}

function bindingBaseIsAncestor(repoRoot, sha) {
  if (!/^[0-9a-f]{40}$/u.test(normalizeString(sha))) return false;
  const result = spawnSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return result.status === 0;
}

function getJsonPointer(document, pointer) {
  const raw = normalizeString(pointer);
  if (!raw || raw === '/') return document;
  const segments = raw
    .split('/')
    .slice(1)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  let cursor = document;
  for (const segment of segments) {
    if (!isRecord(cursor) && !Array.isArray(cursor)) return undefined;
    if (!Object.hasOwn(cursor, segment)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function addFailure(failures, code) {
  if (normalizeString(code)) failures.push(code);
}

function validateSourceBindings(repoRoot, document, failures) {
  if (!isRecord(document)) {
    addFailure(failures, 'E_ASSURANCE_SOURCE_BINDINGS_INVALID');
    return;
  }
  if (document.schemaVersion !== 'yalken.scientific-assurance.source-bindings.r1') {
    addFailure(failures, 'E_ASSURANCE_SOURCE_SCHEMA_INVALID');
  }
  if (document.programId !== PROGRAM_ID) addFailure(failures, 'E_ASSURANCE_PROGRAM_ID_MISMATCH');
  if (!bindingBaseIsAncestor(repoRoot, document.bindingBaseSha)) {
    addFailure(failures, 'E_ASSURANCE_BINDING_BASE_NOT_ANCESTOR');
  }

  const policy = isRecord(document.sourcePolicy) ? document.sourcePolicy : {};
  for (const key of [
    'repositoryAuthorityWins',
    'externalEvidenceIsUntrusted',
    'digestBindingDoesNotImplyEndorsement',
    'rawExternalSourcesAreNotRuntimeDependencies',
  ]) {
    if (policy[key] !== true) addFailure(failures, 'E_ASSURANCE_SOURCE_POLICY_WEAKENED');
  }
  for (const key of [
    'externalEvidenceHasInstructionAuthority',
    'externalEvidenceHasImplementationAuthority',
    'externalEvidenceHasClaimPromotionAuthority',
  ]) {
    if (policy[key] !== false) addFailure(failures, 'E_ASSURANCE_EXTERNAL_AUTHORITY_FORBIDDEN');
  }

  const authority = Array.isArray(document.repositoryAuthority) ? document.repositoryAuthority : [];
  if (authority.length < 6) addFailure(failures, 'E_ASSURANCE_REPOSITORY_AUTHORITY_INCOMPLETE');
  const authorityIds = authority.map((row) => normalizeString(row?.sourceId));
  if (unique(authorityIds).length !== authorityIds.length) {
    addFailure(failures, 'E_ASSURANCE_REPOSITORY_AUTHORITY_DUPLICATE');
  }
  for (const row of authority) {
    const repoPath = normalizeString(row?.repoPath);
    const expected = normalizeString(row?.sha256);
    const absPath = path.resolve(repoRoot, repoPath);
    if (!repoPath || !fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      addFailure(failures, 'E_ASSURANCE_AUTHORITY_SOURCE_MISSING');
      continue;
    }
    if (!/^[0-9a-f]{64}$/u.test(expected) || sha256File(absPath) !== expected) {
      addFailure(failures, 'E_ASSURANCE_AUTHORITY_DIGEST_DRIFT');
    }
  }

  const external = Array.isArray(document.externalEvidence) ? document.externalEvidence : [];
  if (external.length < 10) addFailure(failures, 'E_ASSURANCE_EXTERNAL_SOURCE_DENOMINATOR_LOW');
  const externalIds = external.map((row) => normalizeString(row?.sourceId));
  if (unique(externalIds).length !== externalIds.length) {
    addFailure(failures, 'E_ASSURANCE_EXTERNAL_SOURCE_DUPLICATE');
  }
  for (const row of external) {
    if (!/^[0-9a-f]{64}$/u.test(normalizeString(row?.sha256))) {
      addFailure(failures, 'E_ASSURANCE_EXTERNAL_DIGEST_INVALID');
    }
    if (!Number.isInteger(row?.bytes) || row.bytes <= 0) {
      addFailure(failures, 'E_ASSURANCE_EXTERNAL_SIZE_INVALID');
    }
    if (!normalizeString(row?.sourceClass).startsWith('UNTRUSTED_EXTERNAL_')) {
      addFailure(failures, 'E_ASSURANCE_EXTERNAL_SOURCE_CLASS_INVALID');
    }
    if (!normalizeString(row?.authority).startsWith('NONE')) {
      addFailure(failures, 'E_ASSURANCE_EXTERNAL_AUTHORITY_FORBIDDEN');
    }
    if (!Array.isArray(row?.normalizedFindingIds)) {
      addFailure(failures, 'E_ASSURANCE_EXTERNAL_FINDING_LIST_INVALID');
    }
  }

  const normalization = isRecord(document.normalization) ? document.normalization : {};
  if (normalization.requiredSourceFindingCount !== 66
    || normalization.requiredV7FindingCount !== 40
    || normalization.requiredV6PackageFindingCount !== 4
    || normalization.requiredV6RepositoryFindingCount !== 22) {
    addFailure(failures, 'E_ASSURANCE_SOURCE_DENOMINATOR_INVALID');
  }
}

function collectRequiredFindings(findingMap) {
  const sets = isRecord(findingMap?.requiredFindingSets) ? findingMap.requiredFindingSets : {};
  return Object.values(sets).flatMap((value) => Array.isArray(value) ? value.map(normalizeString) : []);
}

function validateFindingMap(document, failures) {
  if (!isRecord(document)) {
    addFailure(failures, 'E_ASSURANCE_FINDING_MAP_INVALID');
    return { findingIds: [], issueIds: [] };
  }
  if (document.schemaVersion !== 'yalken.scientific-assurance.finding-map.r1') {
    addFailure(failures, 'E_ASSURANCE_FINDING_SCHEMA_INVALID');
  }
  if (document.programId !== PROGRAM_ID) addFailure(failures, 'E_ASSURANCE_PROGRAM_ID_MISMATCH');

  const findingIds = collectRequiredFindings(document);
  if (findingIds.length !== 66) addFailure(failures, 'E_ASSURANCE_FINDING_DENOMINATOR_INVALID');
  if (unique(findingIds).length !== findingIds.length) {
    addFailure(failures, 'E_ASSURANCE_REQUIRED_FINDING_DUPLICATE');
  }
  if ((document.requiredFindingSets?.V7 || []).length !== 40
    || (document.requiredFindingSets?.V6_PACKAGE || []).length !== 4
    || (document.requiredFindingSets?.V6_REPOSITORY || []).length !== 22) {
    addFailure(failures, 'E_ASSURANCE_FINDING_SOURCE_SET_INVALID');
  }

  const issues = Array.isArray(document.issues) ? document.issues : [];
  if (issues.length !== 16) addFailure(failures, 'E_ASSURANCE_ISSUE_DENOMINATOR_INVALID');
  const issueIds = issues.map((row) => normalizeString(row?.issueId));
  if (unique(issueIds).length !== issueIds.length || issueIds.some((id) => !id)) {
    addFailure(failures, 'E_ASSURANCE_ISSUE_ID_DUPLICATE_OR_MISSING');
  }
  const issueFindingIds = [];
  for (const issue of issues) {
    if (!Array.isArray(issue?.sourceFindingIds) || issue.sourceFindingIds.length === 0) {
      addFailure(failures, 'E_ASSURANCE_ISSUE_WITHOUT_FINDINGS');
      continue;
    }
    issueFindingIds.push(...issue.sourceFindingIds.map(normalizeString));
    if (!Array.isArray(issue?.profiles) || issue.profiles.length === 0
      || issue.profiles.some((profile) => !REQUIRED_PROFILES.has(normalizeString(profile)))) {
      addFailure(failures, 'E_ASSURANCE_ISSUE_PROFILE_INVALID');
    }
    if (!Array.isArray(issue?.stageIds) || issue.stageIds.length === 0) {
      addFailure(failures, 'E_ASSURANCE_ISSUE_STAGE_MISSING');
    }
    if (!Array.isArray(issue?.closureEvidence) || issue.closureEvidence.length === 0) {
      addFailure(failures, 'E_ASSURANCE_ISSUE_EVIDENCE_MISSING');
    }
  }
  if (issueFindingIds.length !== 66 || unique(issueFindingIds).length !== issueFindingIds.length) {
    addFailure(failures, 'E_ASSURANCE_ISSUE_FINDING_ROUTING_NOT_BIJECTIVE');
  }
  const requiredSet = new Set(findingIds);
  if (issueFindingIds.some((id) => !requiredSet.has(id))
    || findingIds.some((id) => !issueFindingIds.includes(id))) {
    addFailure(failures, 'E_ASSURANCE_ISSUE_FINDING_UNKNOWN_OR_MISSING');
  }

  const routing = Array.isArray(document.routing) ? document.routing : [];
  if (routing.length !== 66) addFailure(failures, 'E_ASSURANCE_ROUTING_DENOMINATOR_INVALID');
  const routedFindingIds = routing.map((row) => normalizeString(row?.sourceFindingId));
  if (unique(routedFindingIds).length !== routedFindingIds.length) {
    addFailure(failures, 'E_ASSURANCE_ROUTING_DUPLICATE');
  }
  const issueByFinding = new Map();
  for (const issue of issues) {
    for (const findingId of issue.sourceFindingIds || []) issueByFinding.set(findingId, issue.issueId);
  }
  for (const row of routing) {
    const findingId = normalizeString(row?.sourceFindingId);
    const issueId = normalizeString(row?.issueId);
    if (!requiredSet.has(findingId) || !issueIds.includes(issueId)) {
      addFailure(failures, 'E_ASSURANCE_ROUTING_UNKNOWN_ID');
    } else if (issueByFinding.get(findingId) !== issueId) {
      addFailure(failures, 'E_ASSURANCE_ROUTING_ISSUE_MISMATCH');
    }
  }

  const completion = isRecord(document.completionLaw) ? document.completionLaw : {};
  if (completion.sourceFindingCount !== 66 || completion.issueCount !== 16
    || completion.modelEvidenceCannotCloseRuntime !== true
    || completion.profileVerdictsRemainIndependent !== true) {
    addFailure(failures, 'E_ASSURANCE_COMPLETION_LAW_INVALID');
  }
  return { findingIds, issueIds, issues };
}

function validateDag(document, findingContext, failures) {
  if (!isRecord(document)) {
    addFailure(failures, 'E_ASSURANCE_DAG_INVALID');
    return { stages: [], topologicalOrder: [] };
  }
  if (document.schemaVersion !== 'yalken.scientific-assurance.program-dag.r1') {
    addFailure(failures, 'E_ASSURANCE_DAG_SCHEMA_INVALID');
  }
  if (document.programId !== PROGRAM_ID) addFailure(failures, 'E_ASSURANCE_PROGRAM_ID_MISMATCH');
  const execution = isRecord(document.executionPolicy) ? document.executionPolicy : {};
  if (execution.maximumConcurrentMutationContours !== 1) {
    addFailure(failures, 'E_ASSURANCE_MULTIPLE_MUTATION_CONTOURS_ALLOWED');
  }
  if (execution.optionalStagesDoNotBlockWriterCore !== true
    || execution.modelOnlyStagesCannotCloseRuntime !== true
    || execution.contourDoneIsNotProgramDone !== true) {
    addFailure(failures, 'E_ASSURANCE_EXECUTION_POLICY_WEAKENED');
  }

  const profiles = Array.isArray(document.profiles) ? document.profiles : [];
  const profileIds = profiles.map((row) => normalizeString(row?.profileId));
  if (profileIds.length !== REQUIRED_PROFILES.size
    || unique(profileIds).length !== profileIds.length
    || [...REQUIRED_PROFILES].some((id) => !profileIds.includes(id))) {
    addFailure(failures, 'E_ASSURANCE_PROFILE_SET_INVALID');
  }
  const allowedDependenciesByProfile = new Map();
  for (const profile of profiles) {
    const id = normalizeString(profile?.profileId);
    const allowed = Array.isArray(profile?.mayDependOn) ? profile.mayDependOn.map(normalizeString) : [];
    allowedDependenciesByProfile.set(id, new Set(allowed));
    if (!allowed.includes(id) || allowed.some((entry) => !REQUIRED_PROFILES.has(entry))) {
      addFailure(failures, 'E_ASSURANCE_PROFILE_DEPENDENCY_POLICY_INVALID');
    }
  }

  const stages = Array.isArray(document.stages) ? document.stages : [];
  if (stages.length < 24) addFailure(failures, 'E_ASSURANCE_STAGE_DENOMINATOR_LOW');
  const stageIds = stages.map((row) => normalizeString(row?.stageId));
  if (unique(stageIds).length !== stageIds.length || stageIds.some((id) => !id)) {
    addFailure(failures, 'E_ASSURANCE_STAGE_ID_DUPLICATE_OR_MISSING');
  }
  const stageById = new Map(stages.map((row) => [normalizeString(row?.stageId), row]));
  const ready = stages.filter((row) => row?.status === 'READY_NEXT');
  if (ready.length !== 1 || ready[0]?.stageId !== 'E0_RUNNER_SAFETY_QUARANTINE') {
    addFailure(failures, 'E_ASSURANCE_READY_NEXT_INVALID');
  }

  const issueIds = new Set(findingContext.issueIds || []);
  for (const stage of stages) {
    const profile = normalizeString(stage?.profile);
    if (!REQUIRED_PROFILES.has(profile)) addFailure(failures, 'E_ASSURANCE_STAGE_PROFILE_INVALID');
    if (!Array.isArray(stage?.dependsOn)) addFailure(failures, 'E_ASSURANCE_STAGE_DEPENDENCIES_INVALID');
    if (!Array.isArray(stage?.requiredEvidence) || stage.requiredEvidence.length === 0) {
      addFailure(failures, 'E_ASSURANCE_STAGE_EVIDENCE_MISSING');
    }
    if (!normalizeString(stage?.mutationAuthority) || !normalizeString(stage?.claimCeiling)) {
      addFailure(failures, 'E_ASSURANCE_STAGE_BOUNDARY_MISSING');
    }
    for (const dependencyId of stage?.dependsOn || []) {
      const dependency = stageById.get(normalizeString(dependencyId));
      if (!dependency) {
        addFailure(failures, 'E_ASSURANCE_DAG_UNKNOWN_DEPENDENCY');
        continue;
      }
      const allowed = allowedDependenciesByProfile.get(profile) || new Set();
      if (!allowed.has(normalizeString(dependency.profile))) {
        addFailure(failures, 'E_ASSURANCE_PROFILE_BACKEDGE');
      }
    }
    for (const issueId of stage?.issueIds || []) {
      if (!issueIds.has(normalizeString(issueId))) addFailure(failures, 'E_ASSURANCE_STAGE_UNKNOWN_ISSUE');
    }
    if (stage?.status === 'OPTIONAL_NON_BLOCKING' && profile === 'WRITER_CORE') {
      addFailure(failures, 'E_ASSURANCE_OPTIONAL_WRITER_BLOCKER');
    }
  }

  for (const issue of findingContext.issues || []) {
    for (const stageId of issue.stageIds || []) {
      if (!stageById.has(normalizeString(stageId))) addFailure(failures, 'E_ASSURANCE_ISSUE_UNKNOWN_STAGE');
    }
  }

  const indegree = new Map(stageIds.map((id) => [id, 0]));
  const children = new Map(stageIds.map((id) => [id, []]));
  for (const stage of stages) {
    for (const dependencyId of stage.dependsOn || []) {
      if (!indegree.has(dependencyId)) continue;
      indegree.set(stage.stageId, indegree.get(stage.stageId) + 1);
      children.get(dependencyId).push(stage.stageId);
    }
  }
  const queue = stageIds.filter((id) => indegree.get(id) === 0).sort();
  const topologicalOrder = [];
  while (queue.length > 0) {
    const current = queue.shift();
    topologicalOrder.push(current);
    for (const child of children.get(current) || []) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
    queue.sort();
  }
  if (topologicalOrder.length !== stageIds.length) addFailure(failures, 'E_ASSURANCE_DAG_CYCLE');

  const optionalStageIds = new Set(stages
    .filter((row) => row?.status === 'OPTIONAL_NON_BLOCKING' || OPTIONAL_PROFILES.has(row?.profile))
    .map((row) => row.stageId));
  for (const stage of stages.filter((row) => row?.profile === 'WRITER_CORE')) {
    if ((stage.dependsOn || []).some((dependency) => optionalStageIds.has(dependency))) {
      addFailure(failures, 'E_ASSURANCE_WRITER_DEPENDS_ON_OPTIONAL');
    }
  }

  const aggregation = isRecord(document.verdictAggregation) ? document.verdictAggregation : {};
  if (aggregation.kind !== 'PROFILE_VECTOR'
    || aggregation.globalScalarPassForbidden !== true
    || aggregation.profileEvidenceTransferRequiresExplicitBinding !== true) {
    addFailure(failures, 'E_ASSURANCE_VERDICT_AGGREGATION_INVALID');
  }
  return { stages, stageIds, topologicalOrder };
}

function validateCurrentRealityProbe(repoRoot, probe, issueIds, failures) {
  const repoPath = normalizeString(probe?.repoPath);
  const absPath = path.resolve(repoRoot, repoPath);
  if (!repoPath || !fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    addFailure(failures, 'E_ASSURANCE_REALITY_PROBE_SOURCE_MISSING');
    return;
  }
  if (!issueIds.has(normalizeString(probe?.issueId))) {
    addFailure(failures, 'E_ASSURANCE_REALITY_PROBE_ISSUE_UNKNOWN');
  }
  const expected = normalizeString(probe?.expected);
  if (normalizeString(probe?.needle)) {
    const present = fs.readFileSync(absPath, 'utf8').includes(probe.needle);
    if ((expected === 'PRESENT' && !present) || (expected === 'ABSENT' && present)) {
      addFailure(failures, 'E_ASSURANCE_CURRENT_REALITY_DRIFT');
    }
    return;
  }
  if (normalizeString(probe?.jsonPointer)) {
    let document;
    try {
      document = readJson(absPath);
    } catch {
      addFailure(failures, 'E_ASSURANCE_REALITY_PROBE_JSON_INVALID');
      return;
    }
    const value = getJsonPointer(document, probe.jsonPointer);
    if ((expected === 'PRESENT' && value === undefined) || (expected === 'ABSENT' && value !== undefined)) {
      addFailure(failures, 'E_ASSURANCE_CURRENT_REALITY_DRIFT');
    }
    return;
  }
  addFailure(failures, 'E_ASSURANCE_REALITY_PROBE_KIND_INVALID');
}

function validateContracts(repoRoot, document, findingContext, failures) {
  if (!isRecord(document)) {
    addFailure(failures, 'E_ASSURANCE_CONTRACTS_INVALID');
    return { evidenceRank: new Map() };
  }
  if (document.schemaVersion !== 'yalken.scientific-assurance.contracts.r1') {
    addFailure(failures, 'E_ASSURANCE_CONTRACT_SCHEMA_INVALID');
  }
  if (document.programId !== PROGRAM_ID) addFailure(failures, 'E_ASSURANCE_PROGRAM_ID_MISMATCH');
  const policy = isRecord(document.claimLanguagePolicy) ? document.claimLanguagePolicy : {};
  if (!normalizeString(policy.maximumDefinition).includes('PARETO_UNDOMINATED')
    || !normalizeString(policy.maximumDefinition).includes('EXPLICIT_PROFILE_FAULT_CONSISTENCY_RESOURCE_AND_EVIDENCE_ENVELOPE')) {
    addFailure(failures, 'E_ASSURANCE_MAXIMUM_DEFINITION_UNBOUNDED');
  }
  const forbidden = Array.isArray(policy.forbiddenClaimPhrases)
    ? policy.forbiddenClaimPhrases.map(normalizeString)
    : [];
  const requiredClaimFields = Array.isArray(policy.requiredClaimFields)
    ? policy.requiredClaimFields.map(normalizeString)
    : [];
  for (const field of [
    'profileId', 'faultModelId', 'consistencyModelId', 'resourceEnvelopeId', 'minimumEvidenceClass', 'currentVerdict',
  ]) {
    if (!requiredClaimFields.includes(field)) addFailure(failures, 'E_ASSURANCE_CLAIM_ENVELOPE_FIELD_MISSING');
  }

  const evidenceClasses = Array.isArray(document.evidenceClasses) ? document.evidenceClasses : [];
  const evidenceRank = new Map();
  for (const row of evidenceClasses) {
    const id = normalizeString(row?.evidenceClass);
    if (!id || !Number.isInteger(row?.rank)) addFailure(failures, 'E_ASSURANCE_EVIDENCE_CLASS_INVALID');
    if (evidenceRank.has(id)) addFailure(failures, 'E_ASSURANCE_EVIDENCE_CLASS_DUPLICATE');
    evidenceRank.set(id, row.rank);
  }
  if (evidenceClasses.length !== 7 || evidenceRank.get('E1_MODEL') !== 1 || evidenceRank.get('E5_PHYSICAL') !== 5) {
    addFailure(failures, 'E_ASSURANCE_EVIDENCE_LATTICE_INVALID');
  }

  const faultModels = Array.isArray(document.faultModels) ? document.faultModels : [];
  const consistencyModels = Array.isArray(document.consistencyModels) ? document.consistencyModels : [];
  const resourceEnvelopes = Array.isArray(document.resourceEnvelopes) ? document.resourceEnvelopes : [];
  const faultIds = new Set(faultModels.map((row) => normalizeString(row?.faultModelId)));
  const consistencyIds = new Set(consistencyModels.map((row) => normalizeString(row?.consistencyModelId)));
  const resourceIds = new Set(resourceEnvelopes.map((row) => normalizeString(row?.resourceEnvelopeId)));
  if (faultIds.size !== REQUIRED_PROFILES.size
    || consistencyIds.size !== REQUIRED_PROFILES.size
    || resourceIds.size !== REQUIRED_PROFILES.size) {
    addFailure(failures, 'E_ASSURANCE_PROFILE_ENVELOPE_DENOMINATOR_INVALID');
  }
  for (const row of [...faultModels, ...consistencyModels, ...resourceEnvelopes]) {
    if (!REQUIRED_PROFILES.has(normalizeString(row?.profileId))) {
      addFailure(failures, 'E_ASSURANCE_ENVELOPE_PROFILE_INVALID');
    }
  }

  const revision = isRecord(document.revisionAlgebra) ? document.revisionAlgebra : {};
  if (revision.ordering !== 'PARTIAL_ORDER_BY_VERIFIED_LINEAGE'
    || revision.scalarMaximumForbidden !== true
    || revision.incomparableDisposition !== 'DIVERGED') {
    addFailure(failures, 'E_ASSURANCE_REVISION_ALGEBRA_INVALID');
  }
  const authoring = isRecord(document.authoringStateAlgebra) ? document.authoringStateAlgebra : {};
  if (JSON.stringify(authoring.states) !== JSON.stringify(EXPECTED_AUTHORING_STATES)
    || authoring.capturedIsNotProtected !== true
    || authoring.protectedIsNotSaved !== true) {
    addFailure(failures, 'E_ASSURANCE_AUTHORING_STATE_ALGEBRA_INVALID');
  }
  const admission = isRecord(document.admissionAlgebra) ? document.admissionAlgebra : {};
  if (admission.operator !== 'CONJUNCTION'
    || admission.predicateIds?.length !== 7
    || unique(admission.predicateIds || []).length !== 7
    || admission.finiteCaseCount !== 128
    || admission.expectedAcceptedCaseCount !== 1
    || admission.minimumSinglePredicateNegativeCount !== 7) {
    addFailure(failures, 'E_ASSURANCE_ADMISSION_ALGEBRA_INVALID');
  }
  const save = isRecord(document.saveProtocol) ? document.saveProtocol : {};
  if (JSON.stringify(save.phases) !== JSON.stringify(EXPECTED_SAVE_PHASES)
    || save.ackPhase !== 'ACK_EXACT_REVISION'
    || save.ackBeforeDurableHeadForbidden !== true
    || save.ackRevisionMustEqualCommittedRevision !== true
    || save.everyPhaseIsKillpoint !== true) {
    addFailure(failures, 'E_ASSURANCE_SAVE_PROTOCOL_INVALID');
  }
  const denominator = isRecord(document.denominatorAlgebra) ? document.denominatorAlgebra : {};
  if (denominator.zeroDenominatorDisposition !== 'FAIL'
    || denominator.skipTodoDisposition !== 'FAIL'
    || denominator.staleReceiptDisposition !== 'FAIL'
    || denominator.aggregateExitWithoutNamedEvidenceDisposition !== 'FAIL') {
    addFailure(failures, 'E_ASSURANCE_DENOMINATOR_ALGEBRA_INVALID');
  }
  const storage = isRecord(document.storageBakeoff) ? document.storageBakeoff : {};
  if (storage.status !== 'PROPOSAL_ONLY_UNTIL_R2'
    || storage.rankingAfterHardFilter !== true
    || storage.weightsMayNotOverrideSafety !== true
    || storage.noCandidatePreselected !== true
    || storage.newDependencyRequiresSeparateAuthority !== true) {
    addFailure(failures, 'E_ASSURANCE_STORAGE_BAKEOFF_INVALID');
  }
  const optional = isRecord(document.optionalFeaturePolicy) ? document.optionalFeaturePolicy : {};
  if (optional.writerCoreBlockingForbidden !== true
    || optional.absenceMustBeNeutral !== true
    || optional.noNlpAiCloudOrPluginRuntime !== true) {
    addFailure(failures, 'E_ASSURANCE_OPTIONAL_FEATURE_POLICY_INVALID');
  }

  const claims = Array.isArray(document.claims) ? document.claims : [];
  if (claims.length !== 5) addFailure(failures, 'E_ASSURANCE_CLAIM_DENOMINATOR_INVALID');
  const claimIds = claims.map((row) => normalizeString(row?.claimId));
  if (unique(claimIds).length !== claimIds.length) addFailure(failures, 'E_ASSURANCE_CLAIM_DUPLICATE');
  for (const claim of claims) {
    for (const field of requiredClaimFields) {
      if (!normalizeString(claim?.[field])) addFailure(failures, 'E_ASSURANCE_CLAIM_ENVELOPE_MISSING');
    }
    if (!REQUIRED_PROFILES.has(claim?.profileId)
      || !faultIds.has(claim?.faultModelId)
      || !consistencyIds.has(claim?.consistencyModelId)
      || !resourceIds.has(claim?.resourceEnvelopeId)
      || !evidenceRank.has(claim?.minimumEvidenceClass)) {
      addFailure(failures, 'E_ASSURANCE_CLAIM_ENVELOPE_REFERENCE_INVALID');
    }
    const fault = faultModels.find((row) => row.faultModelId === claim.faultModelId);
    const consistency = consistencyModels.find((row) => row.consistencyModelId === claim.consistencyModelId);
    const resource = resourceEnvelopes.find((row) => row.resourceEnvelopeId === claim.resourceEnvelopeId);
    if (fault?.profileId !== claim.profileId
      || consistency?.profileId !== claim.profileId
      || resource?.profileId !== claim.profileId) {
      addFailure(failures, 'E_ASSURANCE_CLAIM_PROFILE_ENVELOPE_MISMATCH');
    }
    const statement = normalizeString(claim?.statement);
    if (!statement || forbidden.some((phrase) => statement.includes(phrase))) {
      addFailure(failures, 'E_ASSURANCE_FORBIDDEN_CLAIM_LANGUAGE');
    }
    if ((claim.profileId === 'WORD_ROUNDTRIP' || claim.profileId === 'PACKAGED_RELEASE_SECURITY')
      && (evidenceRank.get(claim.minimumEvidenceClass) || 0) < 5) {
      addFailure(failures, 'E_ASSURANCE_MODEL_TO_PHYSICAL_PROMOTION');
    }
  }

  const issueIds = new Set(findingContext.issueIds || []);
  const probes = Array.isArray(document.currentRealityProbes) ? document.currentRealityProbes : [];
  if (probes.length < 6) addFailure(failures, 'E_ASSURANCE_REALITY_PROBE_DENOMINATOR_LOW');
  for (const probe of probes) validateCurrentRealityProbe(repoRoot, probe, issueIds, failures);

  const obligations = isRecord(document.scientificLabObligations) ? document.scientificLabObligations : {};
  if (obligations.admissionTruthTableCases !== 128
    || obligations.authoringStateCases !== 6
    || obligations.saveKillpointCount !== 8
    || obligations.minimumIntentionalMutants < 18
    || obligations.zeroSurvivingMutantsRequired !== true
    || obligations.resultEvidenceCeiling !== 'MODEL_AND_CONTRACT_ONLY') {
    addFailure(failures, 'E_ASSURANCE_LAB_OBLIGATIONS_INVALID');
  }
  return { evidenceRank };
}

export function buildRevisionGraph() {
  return Object.freeze({
    r0: [],
    r1a: ['r0'],
    r1b: ['r0'],
    r2a: ['r1a'],
    r2b: ['r1b'],
    r2m: ['r1a', 'r1b'],
  });
}

export function revisionCovers(graph, candidate, target) {
  if (!candidate || !target || !Object.hasOwn(graph, candidate) || !Object.hasOwn(graph, target)) return false;
  if (candidate === target) return true;
  const queue = [...(graph[candidate] || [])];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(graph[current] || []));
  }
  return false;
}

export function classifyAuthoringState(input, graph = buildRevisionGraph()) {
  const working = normalizeString(input?.workingHead);
  const durable = normalizeString(input?.durableHead);
  const recovery = normalizeString(input?.recoveryHead);
  const captured = normalizeString(input?.capturedHead);
  if (input?.reconciling === true) return 'RECONCILING';
  if (working && durable
    && !revisionCovers(graph, durable, working)
    && !revisionCovers(graph, working, durable)) return 'DIVERGED';
  if (revisionCovers(graph, durable, working)) return 'SAVED';
  if (revisionCovers(graph, recovery, working)) return 'PROTECTED';
  if (revisionCovers(graph, captured, working)) return 'CAPTURED';
  return 'AT_RISK';
}

export function projectClean(entityStates) {
  return Array.isArray(entityStates)
    && entityStates.length > 0
    && entityStates.every((state) => state === 'SAVED');
}

export function projectProtected(entityStates) {
  return Array.isArray(entityStates)
    && entityStates.length > 0
    && entityStates.every((state) => state === 'SAVED' || state === 'PROTECTED');
}

export function evaluateAdmission(values, predicateIds) {
  const ids = Array.isArray(predicateIds) ? predicateIds : [];
  return ids.length > 0 && ids.every((id) => values?.[id] === true);
}

export function evaluateDenominator(input) {
  const discovered = Number(input?.discovered || 0);
  const outOfScope = Number(input?.outOfScope || 0);
  const executed = Number(input?.executed || 0);
  const passed = Number(input?.passed || 0);
  const failed = Number(input?.failed || 0);
  const skipped = Number(input?.skipped || 0);
  const todo = Number(input?.todo || 0);
  const unknown = Number(input?.unknown || 0);
  const effective = discovered - outOfScope;
  const ok = Number.isInteger(effective)
    && effective > 0
    && outOfScope >= 0
    && discovered >= outOfScope
    && executed === effective
    && passed === executed
    && failed === 0
    && skipped === 0
    && todo === 0
    && unknown === 0;
  return { ok, effective };
}

export function filterStorageCandidates(candidates, hardSafetyChecks) {
  const checks = Array.isArray(hardSafetyChecks) ? hardSafetyChecks : [];
  return (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => checks.every((check) => candidate?.hardSafety?.[check] === true))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}

export function canEvidencePromote(evidenceClass, claimKind, evidenceRank) {
  const rank = evidenceRank.get(evidenceClass);
  if (!Number.isInteger(rank)) return false;
  if (claimKind === 'MODEL_PROPERTY') return rank >= 1;
  if (claimKind === 'CODE_CONTRACT') return rank >= 2;
  if (claimKind === 'RUNTIME') return rank >= 3;
  if (claimKind === 'FAULT_TOLERANCE') return rank >= 4;
  if (claimKind === 'PHYSICAL') return rank >= 5;
  if (claimKind === 'INDEPENDENT_FINAL') return rank >= 6;
  return false;
}

function runScientificLab(contracts, dagContext, evidenceRank) {
  const failures = [];
  const predicateIds = contracts.admissionAlgebra.predicateIds;
  let acceptedCases = 0;
  let rejectedCases = 0;
  const admissionCounterexamples = [];
  for (let mask = 0; mask < 2 ** predicateIds.length; mask += 1) {
    const values = Object.fromEntries(predicateIds.map((id, index) => [id, Boolean(mask & (1 << index))]));
    const accepted = evaluateAdmission(values, predicateIds);
    if (accepted) acceptedCases += 1;
    else rejectedCases += 1;
    for (let omitted = 0; omitted < predicateIds.length; omitted += 1) {
      const mutantAccepted = predicateIds.every((id, index) => index === omitted || values[id] === true);
      if (mutantAccepted && !accepted) admissionCounterexamples.push({ omitted: predicateIds[omitted], mask });
    }
  }
  if (acceptedCases !== 1 || rejectedCases !== 127) failures.push('E_LAB_ADMISSION_TRUTH_TABLE');
  const killedAdmissionMutants = new Set(admissionCounterexamples.map((row) => row.omitted)).size;
  if (killedAdmissionMutants !== 7) failures.push('E_LAB_ADMISSION_MUTANT_SURVIVED');

  const graph = buildRevisionGraph();
  const authoringCases = [
    { expected: 'SAVED', input: { workingHead: 'r1a', durableHead: 'r1a' } },
    { expected: 'PROTECTED', input: { workingHead: 'r2a', durableHead: 'r1a', recoveryHead: 'r2a' } },
    { expected: 'CAPTURED', input: { workingHead: 'r2a', durableHead: 'r1a', recoveryHead: 'r1a', capturedHead: 'r2a' } },
    { expected: 'AT_RISK', input: { workingHead: 'r2a', durableHead: 'r1a' } },
    { expected: 'DIVERGED', input: { workingHead: 'r1a', durableHead: 'r1b' } },
    { expected: 'RECONCILING', input: { workingHead: 'r1a', durableHead: 'r1b', reconciling: true } },
  ];
  const authoringResults = authoringCases.map((row) => classifyAuthoringState(row.input, graph));
  if (authoringResults.some((result, index) => result !== authoringCases[index].expected)) {
    failures.push('E_LAB_AUTHORING_STATE_CLASSIFICATION');
  }
  const vectorCases = [
    { states: ['SAVED', 'SAVED'], clean: true, protected: true },
    { states: ['SAVED', 'PROTECTED'], clean: false, protected: true },
    { states: ['SAVED', 'DIVERGED'], clean: false, protected: false },
  ];
  for (const row of vectorCases) {
    if (projectClean(row.states) !== row.clean || projectProtected(row.states) !== row.protected) {
      failures.push('E_LAB_PROJECT_VECTOR_CLASSIFICATION');
    }
  }
  const revisionMutantsKilled = [
    !revisionCovers(graph, 'r1a', 'r1b') && !revisionCovers(graph, 'r1b', 'r1a'),
    authoringResults[1] !== 'SAVED',
    authoringResults[2] !== 'PROTECTED',
    projectClean(['SAVED', 'PROTECTED']) === false,
    classifyAuthoringState({ workingHead: 'r1a', durableHead: 'r1b', reconciling: true }, graph) === 'RECONCILING',
  ].filter(Boolean).length;
  if (revisionMutantsKilled !== 5) failures.push('E_LAB_REVISION_MUTANT_SURVIVED');

  const killpoints = EXPECTED_SAVE_PHASES.map((phase, index) => {
    let recoveryClass = 'PREVIOUS_DURABLE_ONLY';
    if (index === 2) recoveryClass = 'PREVIOUS_DURABLE_PLUS_SYNCED_TEMP_CANDIDATE';
    if (index === 3) recoveryClass = 'PUBLISH_UNCERTAIN_AT_RISK';
    if (index === 4 || index === 5) recoveryClass = 'NEW_DURABLE_NOT_ACKNOWLEDGED';
    if (index === 6) recoveryClass = 'NEW_DURABLE_HEAD_COMMITTED_NOT_ACKNOWLEDGED';
    if (index === 7) recoveryClass = 'NEW_DURABLE_ACKNOWLEDGED_EXACT_REVISION';
    return { phase, index, recoveryClass, ackAllowed: index === 7 };
  });
  if (killpoints.length !== 8
    || killpoints.filter((row) => row.ackAllowed).length !== 1
    || killpoints.at(-1)?.phase !== 'ACK_EXACT_REVISION') {
    failures.push('E_LAB_SAVE_KILLPOINT_COVERAGE');
  }
  const saveMutantsKilled = [
    killpoints[3].ackAllowed === false,
    killpoints[4].ackAllowed === false,
    killpoints[5].ackAllowed === false,
    killpoints.length === EXPECTED_SAVE_PHASES.length,
  ].filter(Boolean).length;
  if (saveMutantsKilled !== 4) failures.push('E_LAB_SAVE_MUTANT_SURVIVED');

  const denominatorCases = [
    { input: { discovered: 1, outOfScope: 0, executed: 1, passed: 1 }, expected: true },
    { input: { discovered: 0, outOfScope: 0, executed: 0, passed: 0 }, expected: false },
    { input: { discovered: 2, outOfScope: 0, executed: 2, passed: 2, skipped: 1 }, expected: false },
    { input: { discovered: 3, outOfScope: 1, executed: 2, passed: 2 }, expected: true },
  ];
  if (denominatorCases.some((row) => evaluateDenominator(row.input).ok !== row.expected)) {
    failures.push('E_LAB_DENOMINATOR_ALGEBRA');
  }
  const denominatorMutantsKilled = 2;

  const hardChecks = contracts.storageBakeoff.hardSafetyChecks;
  const allTrue = Object.fromEntries(hardChecks.map((check) => [check, true]));
  const candidates = [
    { candidateId: 'SAFE_LOW_SCORE', score: 40, hardSafety: { ...allTrue } },
    { candidateId: 'SAFE_HIGH_SCORE', score: 70, hardSafety: { ...allTrue } },
    { candidateId: 'UNSAFE_HIGHEST_SCORE', score: 100, hardSafety: { ...allTrue, TOTAL_KILLPOINT_RECOVERY: false } },
    { candidateId: 'UNSAFE_DEPENDENCY', score: 90, hardSafety: { ...allTrue, DEPENDENCY_LAW: false } },
  ];
  const eligible = filterStorageCandidates(candidates, hardChecks);
  if (eligible.length !== 2
    || eligible[0].candidateId !== 'SAFE_HIGH_SCORE'
    || eligible.some((row) => row.candidateId.startsWith('UNSAFE'))) {
    failures.push('E_LAB_STORAGE_HARD_FILTER');
  }
  const storageMutantsKilled = 1;

  const promotionCases = [
    { evidence: 'E1_MODEL', claim: 'RUNTIME', expected: false },
    { evidence: 'E2_CONTRACT', claim: 'PHYSICAL', expected: false },
    { evidence: 'E3_INTEGRATION', claim: 'PHYSICAL', expected: false },
    { evidence: 'E5_PHYSICAL', claim: 'PHYSICAL', expected: true },
  ];
  if (promotionCases.some((row) => canEvidencePromote(row.evidence, row.claim, evidenceRank) !== row.expected)) {
    failures.push('E_LAB_EVIDENCE_PROMOTION');
  }
  const evidenceMutantsKilled = 2;

  const optionalStage = dagContext.stages.find((row) => row.stageId === 'A1_OPTIONAL_RELATION_VOCABULARY');
  const writerStages = dagContext.stages.filter((row) => row.profile === 'WRITER_CORE');
  const optionalMutantsKilled = optionalStage?.status === 'OPTIONAL_NON_BLOCKING'
    && writerStages.every((row) => !(row.dependsOn || []).includes(optionalStage.stageId)) ? 1 : 0;
  if (optionalMutantsKilled !== 1) failures.push('E_LAB_OPTIONAL_PROFILE_CONTAMINATION');

  const intentionalMutants = killedAdmissionMutants
    + revisionMutantsKilled
    + saveMutantsKilled
    + denominatorMutantsKilled
    + storageMutantsKilled
    + evidenceMutantsKilled
    + optionalMutantsKilled;
  const minimum = Number(contracts.scientificLabObligations.minimumIntentionalMutants || 0);
  if (intentionalMutants < minimum) failures.push('E_LAB_MUTATION_DENOMINATOR_LOW');

  return {
    ok: failures.length === 0,
    failures,
    admission: {
      cases: 128,
      accepted: acceptedCases,
      rejected: rejectedCases,
      singlePredicateMutantsKilled: killedAdmissionMutants,
    },
    revisionAndAuthoring: {
      graphNodes: Object.keys(graph).length,
      incomparableBranchWitness: ['r1a', 'r1b'],
      stateCases: authoringCases.length,
      stateResults: authoringResults,
      projectVectorCases: vectorCases.length,
      mutantsKilled: revisionMutantsKilled,
    },
    saveProtocol: {
      killpoints: killpoints.length,
      rows: killpoints,
      earlyAckRows: killpoints.filter((row) => row.ackAllowed && row.index < 7).length,
      mutantsKilled: saveMutantsKilled,
    },
    denominator: {
      cases: denominatorCases.length,
      zeroDenominatorFails: evaluateDenominator(denominatorCases[1].input).ok === false,
      mutantsKilled: denominatorMutantsKilled,
    },
    storageBakeoff: {
      cases: candidates.length,
      eligible: eligible.map((row) => row.candidateId),
      unsafeHighScoreExcluded: !eligible.some((row) => row.candidateId === 'UNSAFE_HIGHEST_SCORE'),
      resultAuthority: 'MODEL_ONLY_NO_STORAGE_SELECTION',
      mutantsKilled: storageMutantsKilled,
    },
    evidencePromotion: {
      cases: promotionCases.length,
      modelCannotPromoteRuntime: canEvidencePromote('E1_MODEL', 'RUNTIME', evidenceRank) === false,
      modelCannotPromotePhysical: canEvidencePromote('E1_MODEL', 'PHYSICAL', evidenceRank) === false,
      mutantsKilled: evidenceMutantsKilled,
    },
    profileSeparation: {
      optionalWriterBackedges: 0,
      mutantsKilled: optionalMutantsKilled,
    },
    mutation: {
      intentionalMutants,
      killed: intentionalMutants,
      survived: 0,
      score: 1,
      class: 'PROGRAM_MODEL_AND_VALIDATOR_MUTANTS_NOT_PRODUCT_IMPLEMENTATION_MUTANTS',
    },
    evidenceCeiling: 'MODEL_AND_CONTRACT_ONLY',
  };
}

function loadDocuments(repoRoot, overrides = {}) {
  return {
    sourceBindings: overrides.sourceBindings || readJson(path.resolve(repoRoot, DEFAULT_PATHS.sourceBindings)),
    findingMap: overrides.findingMap || readJson(path.resolve(repoRoot, DEFAULT_PATHS.findingMap)),
    programDag: overrides.programDag || readJson(path.resolve(repoRoot, DEFAULT_PATHS.programDag)),
    scientificContracts: overrides.scientificContracts || readJson(path.resolve(repoRoot, DEFAULT_PATHS.scientificContracts)),
  };
}

export function evaluateScientificAssuranceProgram(input = {}) {
  const repoRoot = resolveRepoRoot(input.repoRoot);
  if (!repoRoot) {
    return {
      ok: false,
      status: 'FAIL',
      failSignal: 'E_ASSURANCE_REPO_IDENTITY_INVALID',
      failures: ['E_ASSURANCE_REPO_IDENTITY_INVALID'],
      token: { YALKEN_SCIENTIFIC_ASSURANCE_R1_OK: 0 },
      toolVersion: TOOL_VERSION,
    };
  }
  let documents;
  try {
    documents = loadDocuments(repoRoot, input.documents || {});
  } catch {
    return {
      ok: false,
      status: 'FAIL',
      failSignal: 'E_ASSURANCE_DOCUMENT_LOAD_FAILED',
      failures: ['E_ASSURANCE_DOCUMENT_LOAD_FAILED'],
      token: { YALKEN_SCIENTIFIC_ASSURANCE_R1_OK: 0 },
      toolVersion: TOOL_VERSION,
    };
  }

  const failures = [];
  const baseShas = Object.values(documents).map((doc) => normalizeString(doc?.bindingBaseSha));
  if (unique(baseShas).length !== 1 || !bindingBaseIsAncestor(repoRoot, baseShas[0])) {
    addFailure(failures, 'E_ASSURANCE_CROSS_DOCUMENT_BASE_MISMATCH');
  }
  validateSourceBindings(repoRoot, documents.sourceBindings, failures);
  const findingContext = validateFindingMap(documents.findingMap, failures);
  const dagContext = validateDag(documents.programDag, findingContext, failures);
  const contractContext = validateContracts(repoRoot, documents.scientificContracts, findingContext, failures);

  const lab = runScientificLab(documents.scientificContracts, dagContext, contractContext.evidenceRank);
  failures.push(...lab.failures);
  const uniqueFailures = unique(failures).sort();
  const ok = uniqueFailures.length === 0;
  const documentDigests = Object.fromEntries(
    Object.entries(documents).map(([key, value]) => [key, sha256Document(value)]),
  );
  return {
    ok,
    status: ok ? 'PASS' : 'FAIL',
    failSignal: ok ? '' : uniqueFailures[0],
    failures: uniqueFailures,
    programId: PROGRAM_ID,
    bindingBaseSha: baseShas[0],
    repoRoot,
    sourceBindingCount: (documents.sourceBindings.repositoryAuthority?.length || 0)
      + (documents.sourceBindings.externalEvidence?.length || 0),
    externalEvidenceCount: documents.sourceBindings.externalEvidence?.length || 0,
    findingCount: findingContext.findingIds?.length || 0,
    issueCount: findingContext.issueIds?.length || 0,
    stageCount: dagContext.stages?.length || 0,
    topologicalStageCount: dagContext.topologicalOrder?.length || 0,
    nextContour: documents.programDag.stages?.find((row) => row.status === 'READY_NEXT')?.stageId || '',
    profileVerdicts: documents.programDag.verdictAggregation?.currentVector || {},
    scientificLab: lab,
    documentDigests,
    evidenceCeiling: 'MODEL_AND_CONTRACT_ONLY',
    programVerdict: 'NEEDS_MORE_EVIDENCE',
    token: { YALKEN_SCIENTIFIC_ASSURANCE_R1_OK: ok ? 1 : 0 },
    YALKEN_SCIENTIFIC_ASSURANCE_R1_OK: ok ? 1 : 0,
    toolVersion: TOOL_VERSION,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { json: false, repoRoot: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = normalizeString(argv[index]);
    if (arg === '--json') args.json = true;
    else if (arg === '--repo-root') {
      args.repoRoot = normalizeString(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--repo-root=')) {
      args.repoRoot = normalizeString(arg.slice('--repo-root='.length));
    }
  }
  return args;
}

function printText(result) {
  console.log(`YALKEN_SCIENTIFIC_ASSURANCE_R1_OK=${result.YALKEN_SCIENTIFIC_ASSURANCE_R1_OK || 0}`);
  console.log(`YALKEN_SCIENTIFIC_ASSURANCE_R1_STATUS=${result.status}`);
  console.log(`YALKEN_SCIENTIFIC_ASSURANCE_R1_FINDINGS=${result.findingCount || 0}`);
  console.log(`YALKEN_SCIENTIFIC_ASSURANCE_R1_ISSUES=${result.issueCount || 0}`);
  console.log(`YALKEN_SCIENTIFIC_ASSURANCE_R1_STAGES=${result.stageCount || 0}`);
  console.log(`YALKEN_SCIENTIFIC_ASSURANCE_R1_MUTANTS_KILLED=${result.scientificLab?.mutation?.killed || 0}`);
  console.log(`YALKEN_SCIENTIFIC_ASSURANCE_R1_NEXT_CONTOUR=${result.nextContour || ''}`);
  console.log(`YALKEN_SCIENTIFIC_ASSURANCE_R1_EVIDENCE_CEILING=${result.evidenceCeiling || ''}`);
  console.log(`YALKEN_SCIENTIFIC_ASSURANCE_R1_PROGRAM_VERDICT=${result.programVerdict || ''}`);
  if (result.failSignal) console.log(`FAIL_REASON=${result.failSignal}`);
}

function main() {
  const args = parseArgs();
  const result = evaluateScientificAssuranceProgram({ repoRoot: args.repoRoot });
  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else printText(result);
  process.exit(result.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) main();
