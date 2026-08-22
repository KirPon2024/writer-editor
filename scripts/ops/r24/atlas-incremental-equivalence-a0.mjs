#!/usr/bin/env node
// R2.4 A0 - Atlas incremental/full equivalence proof harness.
// This is an OPS proof over the existing derived Atlas scheduler. It creates
// synthetic in-memory Core states and never writes product or user data.
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CORE_COMMAND_IDS,
  applyCoreSequence,
  createInitialCoreState,
  hashCoreState,
  reduceCoreState,
} from '../../../src/core/runtime.mjs';
import {
  ATLAS_GLOBAL_COMPOSITE_GRAPH_RESULT_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER,
  ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION,
  ATLAS_GLOBAL_COMPOSITE_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION,
  acceptAtlasGlobalCompositeGraphResult,
  buildAtlasGlobalCompositeGraphLodPlan,
  coalesceAtlasGlobalCompositeGraphJobs,
  createAtlasGlobalCompositeGraphJob,
  deriveAtlasGlobalCompositeGraph,
  hashCanonicalValue,
  runAtlasGlobalCompositeGraphJob,
} from '../../../src/derived/index.mjs';
import { HEX40_RE, canonicalDigest, sha256hex } from './canonical-json.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');
const PROGRAM_DAG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'PROGRAM_DAG.json');
const SCIENTIFIC_CONTRACTS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'EVIDENCE', 'YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1', 'SCIENTIFIC_CONTRACTS.json');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const RTK_REQUIRED_WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'rtk-required.yml');

export const A0_STAGE_ID = 'A0_ATLAS_INCREMENTAL_EQUIVALENCE';
export const A0_PROFILE_ID = 'ATLAS_MAPS_DERIVED';
export const A0_SCHEMA_VERSION = 'yalken.r24.a0.atlas-incremental-equivalence.receipt.v1';
export const A0_PROOF_SCHEMA_VERSION = 'yalken.r24.a0.atlas-incremental-equivalence.proof.v1';
export const A0_PROOF_VERDICT = 'ATLAS_A0_INCREMENTAL_FULL_EQUIVALENCE_BOUND_TO_EXACT_HEAD';
export const A0_CLAIM_CEILING = 'ATLAS_SUPPORTED_SCALE_PROFILE_ONLY';
export const PROGRAM_VERDICT = 'NEEDS_MORE_EVIDENCE';
export const REQUIRED_EVIDENCE = Object.freeze(['E1_MODEL', 'E2_CONTRACT', 'E3_INTEGRATION', 'E4_FAULT_INJECTION', 'E5_PHYSICAL']);
export const A0_TEST_SCRIPT = 'test:r24-a0';
export const V0_TEST_SCRIPT = 'test:r24-v0';
export const A0_DERIVE_LIMITS = Object.freeze({ maxNodes: 50000, maxEdges: 100000 });

const NON_CLAIMS = Object.freeze([
  'NO_PROGRAM_DONE',
  'NO_GLOBAL_SCALAR_PASS',
  'NO_WRITER_CORE_PROMOTION',
  'NO_WORD_PROFILE_VERDICT',
  'NO_GOOGLE_DOCS_PROFILE_VERDICT',
  'NO_PACKAGED_RELEASE_PROFILE_VERDICT',
  'NO_UNIVERSAL_ATLAS_SCALE',
  'NO_PRODUCT_RUNTIME_MUTATION',
  'NO_RUNTIME_DAEMON_OR_NETWORK',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInteger(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return number;
}

function fail(code, detail, context = {}) {
  return {
    ok: false,
    schemaVersion: A0_SCHEMA_VERSION,
    verdict: 'FAIL',
    code,
    detail,
    context,
  };
}

function readTextBounded(filePath, maxBytes = 4 * 1024 * 1024) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`E_R24_A0_NOT_FILE:${filePath}`);
  if (stat.size > maxBytes) throw new Error(`E_R24_A0_FILE_TOO_LARGE:${filePath}:${stat.size}`);
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

function repoStateFromGit(repoRoot = REPO_ROOT) {
  const headSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const originMainSha = runGit(repoRoot, ['rev-parse', 'origin/main']);
  const treeSha = runGit(repoRoot, ['rev-parse', 'HEAD^{tree}']);
  const dirtyText = runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  return {
    headSha,
    originMainSha,
    treeSha,
    dirty: dirtyText !== '',
  };
}

function extractR24WorkflowScripts(workflowText) {
  const scripts = [];
  const re = /^\s*run:\s+npm run -s (test:r24-[a-z0-9-]+)\s*$/gmu;
  for (const match of workflowText.matchAll(re)) scripts.push(match[1]);
  return scripts;
}

function validateRepositoryIdentity({ repoState, expectedHeadSha, expectedOriginMainSha }) {
  if (!repoState || !HEX40_RE.test(String(repoState.headSha || ''))) {
    return fail('E_R24_A0_HEAD_REQUIRED', String(repoState?.headSha || ''));
  }
  if (!HEX40_RE.test(String(expectedHeadSha || ''))) {
    return fail('E_R24_A0_EXPECTED_HEAD_REQUIRED', String(expectedHeadSha || ''));
  }
  if (repoState.headSha !== expectedHeadSha) {
    return fail('E_R24_A0_EXACT_HEAD_MISMATCH', `${repoState.headSha} != ${expectedHeadSha}`, {
      headSha: repoState.headSha,
      expectedHeadSha,
    });
  }
  if (expectedOriginMainSha !== null && expectedOriginMainSha !== undefined && repoState.originMainSha !== expectedOriginMainSha) {
    return fail('E_R24_A0_ORIGIN_MAIN_MISMATCH', `${repoState.originMainSha} != ${expectedOriginMainSha}`, {
      originMainSha: repoState.originMainSha,
      expectedOriginMainSha,
    });
  }
  if (repoState.dirty === true) return fail('E_R24_A0_WORKTREE_DIRTY', 'clean exact-head A0 evidence required');
  return { ok: true };
}

function validateProgramContract({ program, scientificContracts }) {
  if (!isPlainObject(program) || !Array.isArray(program.stages)) {
    return fail('E_R24_A0_PROGRAM_REQUIRED', 'PROGRAM_DAG must have stages[]');
  }
  const stage = program.stages.find((row) => row.stageId === A0_STAGE_ID);
  if (!stage) return fail('E_R24_A0_STAGE_MISSING', A0_STAGE_ID);
  if (stage.profile !== A0_PROFILE_ID) return fail('E_R24_A0_STAGE_PROFILE', stage.profile);
  if (stage.mutationAuthority !== 'ATLAS_DERIVED_COMPUTE_AND_SCHEDULER') {
    return fail('E_R24_A0_STAGE_AUTHORITY', stage.mutationAuthority);
  }
  if (stage.claimCeiling !== A0_CLAIM_CEILING) return fail('E_R24_A0_CLAIM_CEILING', stage.claimCeiling);
  for (const evidence of REQUIRED_EVIDENCE) {
    if (!Array.isArray(stage.requiredEvidence) || !stage.requiredEvidence.includes(evidence)) {
      return fail('E_R24_A0_REQUIRED_EVIDENCE_MISSING', evidence);
    }
  }
  for (const dependency of ['T1_ANCHOR_LINEAGE', 'R1_SHADOW_PROJECT_AUTHORITY_CELL']) {
    if (!Array.isArray(stage.dependsOn) || !stage.dependsOn.includes(dependency)) {
      return fail('E_R24_A0_DEPENDENCY_MISSING', dependency);
    }
  }
  const claim = Array.isArray(scientificContracts?.claims)
    ? scientificContracts.claims.find((row) => row.claimId === 'CLM_ATLAS_DERIVED_SAFETY')
    : null;
  if (!claim || claim.profileId !== A0_PROFILE_ID || claim.consistencyModelId !== 'CM_ATLAS_MONOTONIC_PUBLICATION_R1') {
    return fail('E_R24_A0_ATLAS_CLAIM_CONTRACT_MISSING', JSON.stringify(claim || null));
  }
  return { ok: true, stage, claim };
}

function validateWorkflowBinding({ packageJson, workflowText }) {
  const scripts = isPlainObject(packageJson?.scripts) ? packageJson.scripts : {};
  if (!scripts[A0_TEST_SCRIPT]) return fail('E_R24_A0_PACKAGE_SCRIPT_MISSING', A0_TEST_SCRIPT);
  const workflowScripts = extractR24WorkflowScripts(workflowText);
  const a0Index = workflowScripts.indexOf(A0_TEST_SCRIPT);
  if (a0Index < 0) return fail('E_R24_A0_WORKFLOW_STEP_MISSING', A0_TEST_SCRIPT);
  const v0Index = workflowScripts.indexOf(V0_TEST_SCRIPT);
  if (v0Index < 0) return fail('E_R24_A0_WORKFLOW_STEP_MISSING', V0_TEST_SCRIPT);
  if (v0Index >= a0Index) return fail('E_R24_A0_WORKFLOW_ORDER', `${V0_TEST_SCRIPT} must run before ${A0_TEST_SCRIPT}`);
  const atlasTailIndex = workflowScripts.findIndex((script, index) => index > a0Index && script.startsWith('test:atlas'));
  if (atlasTailIndex >= 0) return fail('E_R24_A0_WORKFLOW_R24_EXTRACTION_BROKEN', 'atlas scripts must not match R2.4 extraction');
  return {
    ok: true,
    workflowScripts,
    a0Index,
    v0Index,
  };
}

function validateClaimRequest(claimRequest = {}) {
  if (claimRequest.programVerdict === 'PASS' || claimRequest.globalScalarPass === true) {
    return fail('E_R24_A0_PROGRAM_SCALAR_PASS_FORBIDDEN', 'A0 may not emit global/program PASS');
  }
  if (claimRequest.claimCeiling && claimRequest.claimCeiling !== A0_CLAIM_CEILING) {
    return fail('E_R24_A0_OVERCLAIM', claimRequest.claimCeiling);
  }
  if (Array.isArray(claimRequest.profiles)) {
    const imported = claimRequest.profiles.filter((profile) => profile !== A0_PROFILE_ID);
    if (imported.length > 0) return fail('E_R24_A0_PROFILE_IMPORT_FORBIDDEN', imported.join(','));
  }
  return { ok: true };
}

function capabilitySnapshot(overrides = {}) {
  return {
    platformId: 'node',
    capabilities: {
      atlasGlobalCompositeGraph: true,
      atlasMentionIndex: true,
      atlasLocalGraph: true,
      plotProjection: true,
      ideaProjection: true,
      meaningProjection: true,
      crossProjectionImpactPreview: true,
      manualMapView: true,
      ...overrides,
    },
  };
}

export function buildAtlasA0Fixture() {
  const projectId = 'r24-a0-atlas-equivalence-project';
  const sceneA = 'scene-a';
  const sceneB = 'scene-b';
  const textA = 'Mira meets Sol. Соломина река glows. 王 guards the map. سلام echoes.';
  const textB = 'Sol returns with Mira. Duty bends around the crown.';
  const created = applyCoreSequence(createInitialCoreState(), [
    {
      type: CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'A0 Atlas Equivalence', sceneId: sceneA },
    },
    {
      type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: sceneA, text: textA },
    },
    {
      type: CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-mira', name: 'Mira', entityKind: 'character' },
    },
    {
      type: CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-sol', name: 'Sol', entityKind: 'character' },
    },
    {
      type: CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-duty', name: 'Duty', entityKind: 'theme' },
    },
    {
      type: CORE_COMMAND_IDS.IDEA_CREATE,
      payload: { projectId, ideaId: 'idea-duty-crown', title: 'Duty around the crown' },
    },
    {
      type: CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'map-a0', title: 'A0 Author Map' },
    },
    {
      type: CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-a0',
        nodeId: 'node-scene-a',
        label: 'Unicode scene',
        nodeKind: 'sceneRef',
        targetKind: 'scene',
        targetId: sceneA,
      },
    },
    {
      type: CORE_COMMAND_IDS.MANUAL_MAP_NODE_ADD,
      payload: {
        projectId,
        mapId: 'map-a0',
        nodeId: 'node-duty',
        label: 'Duty pressure',
      },
    },
    {
      type: CORE_COMMAND_IDS.MANUAL_MAP_EDGE_ADD,
      payload: {
        projectId,
        mapId: 'map-a0',
        edgeId: 'edge-duty',
        fromNodeId: 'node-scene-a',
        toNodeId: 'node-duty',
        edgeKind: 'annotates',
      },
    },
  ]);
  if (!created.ok) throw new Error(`E_R24_A0_FIXTURE_CREATE_FAILED:${created.error?.code || 'UNKNOWN'}`);
  const state = cloneJson(created.state);
  state.data.projects[projectId].scenes[sceneB] = {
    id: sceneB,
    title: 'Return',
    text: textB,
  };
  return { projectId, sceneA, sceneB, state };
}

function directFullObservation({ coreState, projectId, capabilities = capabilitySnapshot() }) {
  const result = deriveAtlasGlobalCompositeGraph({
    coreState: cloneJson(coreState),
    params: { projectId, limits: A0_DERIVE_LIMITS },
    capabilitySnapshot: capabilities,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    value: {
      schemaVersion: result.value.schemaVersion,
      projectId: result.value.projectId,
      compositeHash: result.value.meta?.compositeHash || result.value.summary?.compositeHash,
      nodeCount: result.value.summary?.nodeCount || 0,
      edgeCount: result.value.summary?.edgeCount || 0,
      sourceProjectionCount: result.value.summary?.sourceProjectionCount || 0,
      sourceProjectionHashes: result.value.summary?.sourceProjectionHashes || {},
      authority: result.value.authority,
      graph: result.value,
      meta: result.meta,
    },
  };
}

function runIncrementalObservation({ coreState, projectId, sequence = 1, triggerMode = ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.EXPLICIT_OPEN }) {
  const sourceRevision = hashCoreState(coreState);
  const job = createAtlasGlobalCompositeGraphJob({
    coreState,
    projectId,
    params: { projectId, limits: A0_DERIVE_LIMITS },
    sourceRevision,
    sequence,
    triggerMode,
    idleBudgetMs: triggerMode === ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.IDLE_BUDGET ? 25 : undefined,
    capabilitySnapshot: capabilitySnapshot(),
  });
  if (!job.ok) return { ok: false, error: job.error };
  const result = runAtlasGlobalCompositeGraphJob(job.value);
  if (!result.ok) return { ok: false, error: result.error };
  const accepted = acceptAtlasGlobalCompositeGraphResult({
    activeJob: job.value,
    result: result.value,
    currentCoreState: coreState,
  });
  return {
    ok: true,
    value: {
      sourceRevision,
      job: job.value,
      result: result.value,
      accepted,
    },
  };
}

function compareObservation(full, incremental) {
  if (!full.ok || !incremental.ok || incremental.value.accepted.ok !== true) return false;
  const published = incremental.value.accepted.value.published;
  return full.value.compositeHash === published.compositeHash
    && full.value.nodeCount === published.nodeCount
    && full.value.edgeCount === published.edgeCount
    && full.value.sourceProjectionCount === published.sourceProjectionCount
    && incremental.value.result.compositeHash === full.value.compositeHash;
}

function makeLargeSyntheticGraph(count = 4096) {
  const nodes = [];
  const edges = [];
  for (let index = 0; index < count; index += 1) {
    const id = `global:a0-synthetic:${String(index).padStart(5, '0')}`;
    nodes.push({
      schemaVersion: 'derived.atlas.globalCompositeNode.v1',
      nodeId: id,
      nodeKind: index % 7 === 0 ? 'originRef' : 'atlasEntity',
      sourceProjection: 'r24.a0.synthetic',
      sourceId: id,
      label: `A0 Node ${index}`,
      sourceRefIds: [`global-source:a0:${index % 17}`],
    });
    if (index > 0) {
      edges.push({
        schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
        edgeId: `global:a0-synthetic-edge:${String(index).padStart(5, '0')}`,
        edgeKind: index % 5 === 0 ? 'crossProjectionLink' : 'atlasCooccurrence',
        fromNodeId: `global:a0-synthetic:${String(index - 1).padStart(5, '0')}`,
        toNodeId: id,
        sourceProjection: 'r24.a0.synthetic',
        sourceId: `edge-${index}`,
        sourceRefIds: [`global-source:a0:${index % 17}`],
      });
    }
  }
  const compositeHash = hashCanonicalValue({ nodes, edges });
  return {
    schemaVersion: ATLAS_GLOBAL_COMPOSITE_GRAPH_SCHEMA_VERSION,
    state: 'ready',
    projectId: 'r24-a0-large-synthetic',
    sourceRefs: [],
    nodes,
    edges,
    summary: {
      sourceProjectionCount: 1,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sourceProjectionHashes: { synthetic: 'a'.repeat(64) },
      compositeHash,
    },
    meta: { compositeHash },
  };
}

function runFaultObservations({ fixture, incremental }) {
  const edited = reduceCoreState(fixture.state, {
    type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: {
      projectId: fixture.projectId,
      sceneId: fixture.sceneA,
      text: 'Mira changed before the old Atlas result could publish.',
    },
  });
  if (!edited.ok) throw new Error(`E_R24_A0_FIXTURE_EDIT_FAILED:${edited.error?.code || 'UNKNOWN'}`);
  const staleSource = acceptAtlasGlobalCompositeGraphResult({
    activeJob: incremental.value.job,
    result: incremental.value.result,
    currentCoreState: edited.state,
  });
  const nextJob = createAtlasGlobalCompositeGraphJob({
    coreState: fixture.state,
    projectId: fixture.projectId,
    sequence: incremental.value.job.generation + 1,
    triggerMode: ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.EXPLICIT_OPEN,
    capabilitySnapshot: capabilitySnapshot(),
  }).value;
  const staleGeneration = acceptAtlasGlobalCompositeGraphResult({
    activeJob: nextJob,
    result: incremental.value.result,
    currentCoreState: fixture.state,
  });
  const failedWorker = acceptAtlasGlobalCompositeGraphResult({
    activeJob: incremental.value.job,
    result: {
      schemaVersion: ATLAS_GLOBAL_COMPOSITE_GRAPH_RESULT_SCHEMA_VERSION,
      requestId: incremental.value.job.requestId,
      projectId: incremental.value.job.projectId,
      sourceRevision: incremental.value.job.sourceRevision,
      generation: incremental.value.job.generation,
      ok: false,
      error: { code: 'E_R24_A0_SYNTHETIC_WORKER_CRASH', reason: 'SYNTHETIC_CRASH' },
    },
    currentCoreState: fixture.state,
  });
  const hashMismatch = acceptAtlasGlobalCompositeGraphResult({
    activeJob: incremental.value.job,
    result: {
      ...cloneJson(incremental.value.result),
      compositeHash: 'f'.repeat(64),
    },
    currentCoreState: fixture.state,
  });
  const disabledCapability = deriveAtlasGlobalCompositeGraph({
    coreState: fixture.state,
    params: { projectId: fixture.projectId },
    capabilitySnapshot: capabilitySnapshot({ atlasGlobalCompositeGraph: false }),
  });

  return {
    staleSource: {
      accepted: staleSource.ok === true,
      code: staleSource.error?.code || null,
      reason: staleSource.error?.reason || null,
    },
    staleGeneration: {
      accepted: staleGeneration.ok === true,
      code: staleGeneration.error?.code || null,
      reason: staleGeneration.error?.reason || null,
      mismatches: staleGeneration.error?.details?.mismatches || [],
    },
    failedWorker: {
      accepted: failedWorker.ok === true,
      code: failedWorker.error?.code || null,
      reason: failedWorker.error?.reason || null,
    },
    hashMismatch: {
      accepted: hashMismatch.ok === true,
      code: hashMismatch.error?.code || null,
      reason: hashMismatch.error?.reason || null,
    },
    disabledCapability: {
      accepted: disabledCapability.ok === true,
      code: disabledCapability.error?.code || null,
      reason: disabledCapability.error?.reason || null,
    },
  };
}

function runSchedulerQueueObservation({ fixture }) {
  const jobs = [
    ['project-a', 1],
    ['project-b', 1],
    ['project-c', 1],
    ['project-a', 4],
    ['project-b', 3],
  ].map(([projectId, sequence]) => createAtlasGlobalCompositeGraphJob({
    coreState: fixture.state,
    projectId,
    sequence,
    triggerMode: ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.EXPLICIT_OPEN,
    capabilitySnapshot: capabilitySnapshot(),
  }).value);
  const queue = coalesceAtlasGlobalCompositeGraphJobs(jobs, { maxQueueSize: 2 });
  const retainedProjectIds = queue.value.queue.map((job) => job.projectId);
  const latestGenerationByProject = new Map();
  for (const job of jobs) {
    latestGenerationByProject.set(job.projectId, Math.max(
      latestGenerationByProject.get(job.projectId) || 0,
      job.generation,
    ));
  }
  const latestPerRetainedProject = queue.value.queue.every((job) => job.generation === latestGenerationByProject.get(job.projectId));
  return {
    ok: queue.ok === true,
    maxQueueSize: queue.value.maxQueueSize,
    queueLength: queue.value.queue.length,
    discardedCount: queue.value.discardedCount,
    retainedProjectIds,
    retainedGenerations: queue.value.queue.map((job) => job.generation),
    oneJobPerProject: retainedProjectIds.length === new Set(retainedProjectIds).size,
    latestPerRetainedProject,
    bounded: queue.value.queue.length <= queue.value.maxQueueSize && queue.value.discardedCount > 0,
  };
}

function runResourceObservation() {
  const graph = makeLargeSyntheticGraph();
  const limits = { maxNodes: 192, maxEdges: 128, labelNodeBudget: 48 };
  const lodPlan = buildAtlasGlobalCompositeGraphLodPlan({ graph, limits });
  return {
    schemaVersion: lodPlan.schemaVersion,
    proofSchemaVersion: lodPlan.resourceBudgetProof.schemaVersion,
    sourceNodeCount: lodPlan.summary.sourceNodeCount,
    sourceEdgeCount: lodPlan.summary.sourceEdgeCount,
    plannedNodeCount: lodPlan.summary.plannedNodeCount,
    plannedEdgeCount: lodPlan.summary.plannedEdgeCount,
    omittedNodeCount: lodPlan.summary.omittedNodeCount,
    omittedEdgeCount: lodPlan.summary.omittedEdgeCount,
    renderAllNodes: lodPlan.summary.renderAllNodes,
    renderAllEdges: lodPlan.summary.renderAllEdges,
    withinBudget: lodPlan.resourceBudgetProof.withinBudget.nodes === true
      && lodPlan.resourceBudgetProof.withinBudget.edges === true,
    resourceBudgetProofHash: lodPlan.resourceBudgetProof.meta.resourceBudgetProofHash,
    lodPlanHash: lodPlan.meta.lodPlanHash,
    limits,
  };
}

export function runAtlasA0Proof(options = {}) {
  const fixture = options.fixture || buildAtlasA0Fixture();
  const sourceRevision = hashCoreState(fixture.state);
  const beforeStateHash = sha256hex(JSON.stringify(fixture.state));
  const startedAt = performance.now();
  const full = directFullObservation({ coreState: fixture.state, projectId: fixture.projectId });
  const incremental = runIncrementalObservation({
    coreState: fixture.state,
    projectId: fixture.projectId,
    sequence: 1,
  });
  const replay = runIncrementalObservation({
    coreState: cloneJson(fixture.state),
    projectId: fixture.projectId,
    sequence: 1,
  });
  const idle = runIncrementalObservation({
    coreState: fixture.state,
    projectId: fixture.projectId,
    sequence: 2,
    triggerMode: ATLAS_GLOBAL_COMPOSITE_GRAPH_TRIGGER.IDLE_BUDGET,
  });
  const faults = incremental.ok ? runFaultObservations({ fixture, incremental }) : {};
  const queue = runSchedulerQueueObservation({ fixture });
  const resource = runResourceObservation();
  const wallTimeMs = Math.max(0, performance.now() - startedAt);
  const afterStateHash = sha256hex(JSON.stringify(fixture.state));
  const normalEquivalent = compareObservation(full, incremental);
  const replayEquivalent = compareObservation(full, replay);
  const idleEquivalent = compareObservation(full, idle);
  const proofBase = {
    schemaVersion: A0_PROOF_SCHEMA_VERSION,
    stageId: A0_STAGE_ID,
    profileId: A0_PROFILE_ID,
    sourceRevision,
    evidenceClasses: [...REQUIRED_EVIDENCE],
    model: {
      modelId: 'A0_INCREMENTAL_FULL_EQUIVALENCE_FINITE_MODEL',
      finiteCaseCount: 10,
      acceptedCases: ['explicitOpen', 'idleBudget', 'sameRevisionReplay'],
      rejectedCases: ['staleSourceRevision', 'staleGeneration', 'workerCrash', 'hashMismatch', 'disabledCapability'],
      zeroDenominator: false,
    },
    observations: {
      normal: {
        equivalent: normalEquivalent,
        fullCompositeHash: full.value?.compositeHash || null,
        incrementalCompositeHash: incremental.value?.result?.compositeHash || null,
        acceptedCompositeHash: incremental.value?.accepted?.value?.published?.compositeHash || null,
        nodeCount: full.value?.nodeCount || 0,
        edgeCount: full.value?.edgeCount || 0,
        sourceProjectionCount: full.value?.sourceProjectionCount || 0,
      },
      replay: {
        equivalent: replayEquivalent,
        replayCompositeHash: replay.value?.result?.compositeHash || null,
      },
      idleBudget: {
        equivalent: idleEquivalent,
        triggerMode: idle.value?.job?.trigger?.mode || null,
        idleBudgetMs: idle.value?.job?.trigger?.idleBudgetMs || 0,
      },
    },
    faults,
    scheduler: {
      queue,
      monotonicPublicationLaw: 'publish only exact requestId/projectId/sourceRevision/generation and current sourceRevision',
    },
    resource,
    physical: {
      runtime: 'node',
      platform: process.platform,
      arch: process.arch,
      wallTimeMs: Number(wallTimeMs.toFixed(3)),
      deadlineMs: normalizePositiveInteger(options.deadlineMs, 1500),
      deadlineWithinBudget: wallTimeMs <= normalizePositiveInteger(options.deadlineMs, 1500),
      beforeStateHash,
      afterStateHash,
      sourceStateUnchanged: beforeStateHash === afterStateHash,
      productMutation: false,
      storageMutation: false,
      networkMutation: false,
    },
    nonClaims: [...NON_CLAIMS],
  };
  return {
    ...proofBase,
    proofHash: canonicalDigest(proofBase),
  };
}

function validateProof(proof) {
  if (!isPlainObject(proof)) return fail('E_R24_A0_PROOF_REQUIRED', 'proof object required');
  if (proof.schemaVersion !== A0_PROOF_SCHEMA_VERSION) return fail('E_R24_A0_PROOF_SCHEMA', String(proof.schemaVersion || ''));
  if (proof.stageId !== A0_STAGE_ID || proof.profileId !== A0_PROFILE_ID) {
    return fail('E_R24_A0_PROOF_IDENTITY', `${proof.stageId || ''}:${proof.profileId || ''}`);
  }
  for (const evidence of REQUIRED_EVIDENCE) {
    if (!Array.isArray(proof.evidenceClasses) || !proof.evidenceClasses.includes(evidence)) {
      return fail('E_R24_A0_PROOF_EVIDENCE_MISSING', evidence);
    }
  }
  if (proof.model?.zeroDenominator !== false || normalizePositiveInteger(proof.model?.finiteCaseCount, 0) < 8) {
    return fail('E_R24_A0_MODEL_DENOMINATOR', JSON.stringify(proof.model || null));
  }
  if (proof.observations?.normal?.equivalent !== true) {
    return fail('E_R24_A0_INCREMENTAL_FULL_DIVERGENCE', JSON.stringify(proof.observations?.normal || null));
  }
  if (proof.observations?.replay?.equivalent !== true) {
    return fail('E_R24_A0_REPLAY_DIVERGENCE', JSON.stringify(proof.observations?.replay || null));
  }
  if (proof.observations?.idleBudget?.equivalent !== true || proof.observations?.idleBudget?.triggerMode !== 'idleBudget') {
    return fail('E_R24_A0_IDLE_BUDGET_EQUIVALENCE', JSON.stringify(proof.observations?.idleBudget || null));
  }
  if (proof.faults?.staleSource?.accepted !== false || proof.faults?.staleSource?.code !== 'E_ATLAS_GLOBAL_COMPOSITE_STALE_RESULT') {
    return fail('E_R24_A0_STALE_SOURCE_ADMITTED', JSON.stringify(proof.faults?.staleSource || null));
  }
  if (proof.faults?.staleGeneration?.accepted !== false || proof.faults?.staleGeneration?.reason !== 'STALE_RESULT_IDENTITY_MISMATCH') {
    return fail('E_R24_A0_STALE_GENERATION_ADMITTED', JSON.stringify(proof.faults?.staleGeneration || null));
  }
  if (proof.faults?.failedWorker?.accepted !== false || proof.faults?.failedWorker?.code !== 'E_ATLAS_GLOBAL_COMPOSITE_RESULT_FAILED') {
    return fail('E_R24_A0_WORKER_CRASH_ADMITTED', JSON.stringify(proof.faults?.failedWorker || null));
  }
  if (proof.faults?.hashMismatch?.accepted !== false || proof.faults?.hashMismatch?.code !== 'E_ATLAS_GLOBAL_COMPOSITE_HASH_MISMATCH') {
    return fail('E_R24_A0_HASH_MISMATCH_ADMITTED', JSON.stringify(proof.faults?.hashMismatch || null));
  }
  if (proof.faults?.disabledCapability?.accepted !== false || proof.faults?.disabledCapability?.code !== 'E_CAPABILITY_DISABLED_FOR_COMMAND') {
    return fail('E_R24_A0_CAPABILITY_DISABLED_ADMITTED', JSON.stringify(proof.faults?.disabledCapability || null));
  }
  if (proof.scheduler?.queue?.bounded !== true || proof.scheduler?.queue?.oneJobPerProject !== true || proof.scheduler?.queue?.latestPerRetainedProject !== true) {
    return fail('E_R24_A0_QUEUE_BOUNDARY_UNPROVEN', JSON.stringify(proof.scheduler?.queue || null));
  }
  if (proof.resource?.schemaVersion !== ATLAS_GLOBAL_COMPOSITE_LOD_PLAN_SCHEMA_VERSION) {
    return fail('E_R24_A0_RESOURCE_SCHEMA', String(proof.resource?.schemaVersion || ''));
  }
  if (proof.resource?.proofSchemaVersion !== ATLAS_GLOBAL_COMPOSITE_RESOURCE_BUDGET_PROOF_SCHEMA_VERSION) {
    return fail('E_R24_A0_RESOURCE_PROOF_SCHEMA', String(proof.resource?.proofSchemaVersion || ''));
  }
  if (proof.resource?.withinBudget !== true || proof.resource?.renderAllNodes !== false || proof.resource?.renderAllEdges !== false) {
    return fail('E_R24_A0_RESOURCE_BUDGET_UNPROVEN', JSON.stringify(proof.resource || null));
  }
  if (proof.physical?.deadlineWithinBudget !== true || proof.physical?.sourceStateUnchanged !== true) {
    return fail('E_R24_A0_PHYSICAL_BOUNDARY_UNPROVEN', JSON.stringify(proof.physical || null));
  }
  if (proof.physical?.productMutation !== false || proof.physical?.storageMutation !== false || proof.physical?.networkMutation !== false) {
    return fail('E_R24_A0_AUTHORITY_BOUNDARY_UNPROVEN', JSON.stringify(proof.physical || null));
  }
  return { ok: true };
}

export function compileAtlasA0Evidence(input = {}) {
  const program = input.program || readJsonBounded(PROGRAM_DAG_PATH);
  const scientificContracts = input.scientificContracts || readJsonBounded(SCIENTIFIC_CONTRACTS_PATH);
  const repoState = input.repoState || repoStateFromGit(REPO_ROOT);
  const packageJson = input.packageJson || readJsonBounded(PACKAGE_JSON_PATH);
  const workflowText = input.workflowText || readTextBounded(RTK_REQUIRED_WORKFLOW_PATH);
  const expectedHeadSha = input.expectedHeadSha || repoState.headSha;
  const expectedOriginMainSha = input.expectedOriginMainSha === undefined ? null : input.expectedOriginMainSha;

  for (const check of [
    validateProgramContract({ program, scientificContracts }),
    validateRepositoryIdentity({ repoState, expectedHeadSha, expectedOriginMainSha }),
    validateWorkflowBinding({ packageJson, workflowText }),
    validateClaimRequest(input.claimRequest || {}),
  ]) {
    if (!check.ok) return check;
  }

  const proof = input.proof || runAtlasA0Proof(input.proofOptions || {});
  const proofCheck = validateProof(proof);
  if (!proofCheck.ok) return proofCheck;

  const receiptBase = {
    ok: true,
    schemaVersion: A0_SCHEMA_VERSION,
    code: 'R24_A0_ATLAS_INCREMENTAL_EQUIVALENCE_COMPILED',
    verdict: A0_PROOF_VERDICT,
    stageId: A0_STAGE_ID,
    profileId: A0_PROFILE_ID,
    claimCeiling: A0_CLAIM_CEILING,
    programVerdict: PROGRAM_VERDICT,
    exactIdentity: {
      headSha: repoState.headSha,
      originMainSha: repoState.originMainSha,
      treeSha: repoState.treeSha,
      dirty: repoState.dirty,
    },
    evidence: {
      classes: [...REQUIRED_EVIDENCE],
      proofHash: proof.proofHash,
      sourceRevision: proof.sourceRevision,
      normalCompositeHash: proof.observations.normal.fullCompositeHash,
      deadlineMs: proof.physical.deadlineMs,
      wallTimeMs: proof.physical.wallTimeMs,
      largeGraph: {
        sourceNodeCount: proof.resource.sourceNodeCount,
        plannedNodeCount: proof.resource.plannedNodeCount,
        sourceEdgeCount: proof.resource.sourceEdgeCount,
        plannedEdgeCount: proof.resource.plannedEdgeCount,
      },
    },
    schedulerLaw: {
      exactTuple: ['projectId', 'requestId', 'sourceRevision', 'generation'],
      queue: proof.scheduler.queue,
    },
    nonClaims: [...NON_CLAIMS],
    generatedAt: input.now || new Date().toISOString(),
  };
  return {
    ...receiptBase,
    receiptHash: canonicalDigest(receiptBase),
  };
}

function parseArgs(argv = []) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const receipt = compileAtlasA0Evidence({
    expectedHeadSha: args['expected-head'],
    expectedOriginMainSha: args['expected-origin-main'],
  });
  console.log(`R24_A0_ATLAS_RECEIPT=${JSON.stringify({
    ok: receipt.ok,
    code: receipt.code,
    stageId: receipt.stageId || A0_STAGE_ID,
    verdict: receipt.verdict,
    proofHash: receipt.evidence?.proofHash || null,
    receiptHash: receipt.receiptHash || null,
  })}`);
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
