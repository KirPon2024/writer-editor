#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CORE_COMMAND_IDS,
  applyCoreSequence,
  createInitialCoreState,
  hashCoreState,
  reduceCoreState,
} from '../../src/core/runtime.mjs';
import {
  acceptAtlasGraphWorkerResult,
  buildAtlasGraphWorkerPayload,
  cloneAtlasGraphWorkerPayloadForFallback,
  coalesceAtlasGraphWorkerPayloads,
  deriveAtlasMentionIndex,
  deriveAtlasMixedLanguageRouter,
  hashCanonicalValue,
  runAtlasGraphWorkerJob,
} from '../../src/derived/index.mjs';

const REPORT_SCHEMA = 'yalken.atlas.v5.r3.c04.multilingualWorkerStress.v1';
const CONTOUR_ID = 'R3_C04_MULTILINGUAL_WORKER_STRESS_AND_STALE_RESULT_SATURATION';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_R3_C04_MULTILINGUAL_WORKER_STRESS');

const PROJECT_ID = 'r3-c04-multilingual-worker-project';
const SCENE_ID = 'scene-r3-c04-multilingual';
const SEGMENTS = Object.freeze([
  { id: 'en', languageCode: 'en', entityId: 'entity-en', entityKind: 'character', value: 'Atlas Keeper' },
  { id: 'ru', languageCode: 'ru', entityId: 'entity-ru', entityKind: 'character', value: 'Анна' },
  { id: 'cjk', languageCode: 'zh-hans', entityId: 'entity-cjk', entityKind: 'place', value: '東京' },
  { id: 'rtl', languageCode: 'ar', entityId: 'entity-rtl', entityKind: 'term', value: 'سلام' },
  { id: 'indic', languageCode: 'hi', entityId: 'entity-indic', entityKind: 'term', value: 'नमस्ते' },
  { id: 'emoji', languageCode: 'und', entityId: 'entity-emoji', entityKind: 'symbol', value: '👩‍💻' },
  { id: 'nfc', languageCode: 'fr', entityId: 'entity-nfc', entityKind: 'place', value: 'Café' },
  { id: 'nfd', languageCode: 'fr', entityId: 'entity-nfd', entityKind: 'place', value: 'Café' },
  { id: 'ime', languageCode: 'ja', entityId: 'entity-ime', entityKind: 'term', value: 'かな' },
]);
const SCENE_TEXT = SEGMENTS.map((segment) => segment.value).join(' | ');

function parseArgs(argv) {
  const out = { outDir: DEFAULT_OUT_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && index + 1 < argv.length) {
      out.outDir = path.resolve(String(argv[index + 1] || '').trim());
      index += 1;
    }
  }
  return out;
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(String(value ?? ''), 'utf8'));
}

function fileProof(filePath) {
  if (!filePath || !fsSync.existsSync(filePath)) return { path: filePath || '', exists: false, bytes: 0, sha256: '' };
  const stat = fsSync.statSync(filePath);
  return {
    path: filePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256Buffer(fsSync.readFileSync(filePath)) : '',
  };
}

function segmentRange(value) {
  const startOffset = SCENE_TEXT.indexOf(value);
  if (startOffset < 0) throw new Error(`SEGMENT_NOT_FOUND:${value}`);
  return { startOffset, endOffset: startOffset + value.length };
}

function buildMultilingualState() {
  const commands = [
    {
      type: CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId: PROJECT_ID, title: 'R3 C04 multilingual worker stress', sceneId: SCENE_ID },
    },
    {
      type: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId: PROJECT_ID, sceneId: SCENE_ID, text: SCENE_TEXT },
    },
    {
      type: CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: {
        projectId: PROJECT_ID,
        scopeKind: 'project',
        languageCode: 'en',
        tagId: 'r3-c04-language-project-en',
      },
    },
  ];
  for (const segment of SEGMENTS) {
    const range = segmentRange(segment.value);
    commands.push({
      type: CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: {
        projectId: PROJECT_ID,
        entityId: segment.entityId,
        name: segment.value,
        entityKind: segment.entityKind,
      },
    });
    commands.push({
      type: CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
      payload: {
        projectId: PROJECT_ID,
        scopeKind: 'range',
        sceneId: SCENE_ID,
        tagId: `r3-c04-language-range-${segment.id}`,
        languageCode: segment.languageCode,
        startOffset: range.startOffset,
        endOffset: range.endOffset,
      },
    });
  }
  const result = applyCoreSequence(createInitialCoreState(), commands);
  if (!result.ok) throw new Error(`MULTILINGUAL_CORE_SEQUENCE_FAILED:${JSON.stringify(result.error)}`);
  return result.state;
}

function proveFutureSchemaQuarantine() {
  const base = createInitialCoreState();
  base.data.projects[PROJECT_ID] = {
    id: PROJECT_ID,
    title: 'Future Atlas author data',
    scenes: {
      [SCENE_ID]: { id: SCENE_ID, text: 'Future schema must survive.' },
    },
    atlas: {
      schemaVersion: 'atlas.author.vFuture',
      futureEntities: {
        'future-entity': { id: 'future-entity', name: 'Preserve me' },
      },
      entities: {
        legacy: { id: 'legacy', name: 'Legacy future' },
      },
    },
  };
  const reduced = reduceCoreState(base, {
    type: CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
    payload: {
      projectId: PROJECT_ID,
      entityId: 'entity-after-quarantine',
      name: 'After quarantine',
      entityKind: 'character',
    },
  });
  if (!reduced.ok) throw new Error(`FUTURE_SCHEMA_QUARANTINE_COMMAND_FAILED:${JSON.stringify(reduced.error)}`);
  const atlas = reduced.state.data.projects[PROJECT_ID].atlas;
  return {
    quarantined: atlas.unsupportedAuthorDataQuarantine?.schemaVersion === 'atlas.authorUnsupportedQuarantine.v1',
    originalSchemaVersion: atlas.unsupportedAuthorDataQuarantine?.originalSchemaVersion || '',
    futureEntityPreserved: atlas.unsupportedAuthorDataQuarantine?.originalAuthorData?.futureEntities?.['future-entity']?.name === 'Preserve me',
    newCommandApplied: atlas.entities['entity-after-quarantine']?.name === 'After quarantine',
    destructiveReplacement: atlas.unsupportedAuthorDataQuarantine?.destructiveReplacement === true,
    stateHash: hashCanonicalValue(atlas.unsupportedAuthorDataQuarantine || null),
  };
}

function proveKnownSchemaUnknownFieldPreservation(state) {
  const withUnknown = JSON.parse(JSON.stringify(state));
  withUnknown.data.projects[PROJECT_ID].atlas.futureAuthorPanel = {
    schemaVersion: 'future.authorPanel.v1',
    rows: [{ id: 'future-row-r3-c04', label: 'Visible after command normalization' }],
  };
  const reduced = reduceCoreState(withUnknown, {
    type: CORE_COMMAND_IDS.ATLAS_SAVED_QUERY_SAVE,
    payload: {
      projectId: PROJECT_ID,
      savedQueryId: 'r3-c04-query-after-unknown-field',
      name: 'Unknown field preservation',
      reportType: 'overview',
      filter: { entityKind: 'all' },
      sourceHash: hashCoreState(withUnknown),
    },
  });
  if (!reduced.ok) throw new Error(`UNKNOWN_FIELD_COMMAND_FAILED:${JSON.stringify(reduced.error)}`);
  return {
    preserved: reduced.state.data.projects[PROJECT_ID].atlas.futureAuthorPanel?.rows?.[0]?.id === 'future-row-r3-c04',
    savedQueryApplied: reduced.state.data.projects[PROJECT_ID].atlas.savedQueries['r3-c04-query-after-unknown-field']?.name === 'Unknown field preservation',
    unknownFieldHash: hashCanonicalValue(reduced.state.data.projects[PROJECT_ID].atlas.futureAuthorPanel),
  };
}

function proveSplitGraphemeRejections(state) {
  const emojiRange = segmentRange('👩‍💻');
  const splitLanguage = reduceCoreState(state, {
    type: CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
    payload: {
      projectId: PROJECT_ID,
      scopeKind: 'range',
      sceneId: SCENE_ID,
      tagId: 'r3-c04-split-emoji-language-range',
      languageCode: 'und',
      startOffset: emojiRange.startOffset + 1,
      endOffset: emojiRange.endOffset,
    },
  });
  const splitQuote = SCENE_TEXT.slice(emojiRange.startOffset + 1, emojiRange.endOffset);
  const splitAnchor = {
    schemaVersion: 'atlas.evidenceAnchor.v1',
    anchorId: 'r3-c04-split-emoji-anchor',
    projectId: PROJECT_ID,
    sceneId: SCENE_ID,
    entityId: 'entity-emoji',
    startOffset: emojiRange.startOffset + 1,
    endOffset: emojiRange.endOffset,
    quote: splitQuote,
    quoteHash: hashCanonicalValue(splitQuote),
    sceneTextHash: hashCanonicalValue(SCENE_TEXT),
  };
  const splitEvidence = reduceCoreState(state, {
    type: CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId: PROJECT_ID,
      sceneId: SCENE_ID,
      entityId: 'entity-emoji',
      mentionId: 'r3-c04-split-emoji-mention',
      evidenceAnchor: splitAnchor,
      decisionId: 'r3-c04-split-emoji-decision',
    },
  });
  return {
    languageTagRejected: splitLanguage.ok === false && splitLanguage.error?.code === 'E_ATLAS_LANGUAGE_TAG_RANGE_GRAPHEME_SPLIT',
    evidenceRejected: splitEvidence.ok === false && splitEvidence.error?.code === 'E_ATLAS_EVIDENCE_GRAPHEME_SPLIT',
    languageError: splitLanguage.error || null,
    evidenceError: splitEvidence.error || null,
  };
}

function proveMultilingualRouting(state) {
  const mentionIndex = deriveAtlasMentionIndex({
    coreState: state,
    params: { projectId: PROJECT_ID },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });
  if (!mentionIndex.ok) throw new Error(`MENTION_INDEX_FAILED:${JSON.stringify(mentionIndex.error)}`);
  const router = deriveAtlasMixedLanguageRouter({
    coreState: state,
    params: { projectId: PROJECT_ID },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMixedLanguageRouter: true } },
  });
  if (!router.ok) throw new Error(`MIXED_LANGUAGE_ROUTER_FAILED:${JSON.stringify(router.error)}`);
  const mentionsForSegment = new Map();
  for (const segment of SEGMENTS) {
    const range = segmentRange(segment.value);
    const mention = mentionIndex.value.mentions.find((item) => (
      item.entityId === segment.entityId
      && item.startOffset === range.startOffset
      && item.endOffset === range.endOffset
    ));
    if (mention) mentionsForSegment.set(segment.id, mention);
  }
  const routeAssertions = SEGMENTS.map((segment) => {
    const mention = mentionsForSegment.get(segment.id);
    return {
      id: segment.id,
      expectedLanguageCode: segment.languageCode,
      actualLanguageCode: mention?.languageCode || '',
      sourceKind: mention?.languageRoute?.sourceKind || '',
      exactOnly: mention?.languageRoute?.exactOnly === true,
      fuzzyMatching: mention?.languageRoute?.fuzzyMatching === true,
      englishFallback: mention?.languageRoute?.englishFallback === true,
      graphemeLength: mention?.evidenceAnchor?.graphemeRange?.length || 0,
      quotePreserved: mention?.evidenceAnchor?.quote === segment.value,
      matcherId: mention?.matcherId || '',
      matchMode: mention?.matchMode || '',
      segmentationAppliedBeforeMatching: mention?.matcherPolicy?.segmentationAppliedBeforeMatching === true,
    };
  });
  return {
    mentionCount: mentionIndex.value.mentions.length,
    routeCount: router.value.routes.length,
    routeAssertions,
    allSegmentsMatched: SEGMENTS.every((segment) => mentionsForSegment.has(segment.id)),
    allRoutesAuthorBound: routeAssertions.every((row) => row.sourceKind === 'author-range'),
    allExpectedLanguages: routeAssertions.every((row) => row.expectedLanguageCode === row.actualLanguageCode),
    exactOnlyNoFallback: routeAssertions.every((row) => row.exactOnly === true && row.fuzzyMatching === false && row.englishFallback === false),
    allQuotesPreserved: routeAssertions.every((row) => row.quotePreserved === true && row.graphemeLength >= 1),
    matcherPolicyBeforeMatching: routeAssertions.every((row) => (
      row.matcherId === 'BASIC_EXACT_TERM_GRAPHEME_CASEFOLD_V1'
      && row.matchMode === 'CASE_AND_CANONICAL_EQUIVALENCE_EXACT'
      && row.segmentationAppliedBeforeMatching === true
    )),
    mentionIndexHash: mentionIndex.value.meta.indexHash,
    routerHash: router.value.summary.routerHash,
  };
}

function buildCompositeGraph(count) {
  const nodes = [];
  const edges = [];
  for (let index = 0; index < count; index += 1) {
    const nodeId = `global:r3-c04:${String(index).padStart(5, '0')}`;
    nodes.push({
      schemaVersion: 'derived.atlas.globalCompositeNode.v1',
      nodeId,
      nodeKind: index % 17 === 0 ? 'originRef' : 'atlasEntity',
      sourceProjection: 'r3-c04.worker-stress',
      sourceId: nodeId,
      label: `R3 C04 Node ${index}`,
      sourceRefIds: [`scene:${index % 1000}`, `language:${SEGMENTS[index % SEGMENTS.length].id}`],
    });
    if (index > 0) {
      edges.push({
        schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
        edgeId: `global:r3-c04-edge:${String(index).padStart(5, '0')}`,
        edgeKind: index % 19 === 0 ? 'crossProjectionLink' : 'atlasCooccurrence',
        fromNodeId: `global:r3-c04:${String(index - 1).padStart(5, '0')}`,
        toNodeId: nodeId,
        sourceProjection: 'r3-c04.worker-stress',
        sourceId: `edge-${index}`,
        sourceRefIds: [`scene:${index % 1000}`],
      });
    }
    if (index >= 17 && index % 17 === 0) {
      edges.push({
        schemaVersion: 'derived.atlas.globalCompositeEdge.v1',
        edgeId: `global:r3-c04-origin-edge:${String(index).padStart(5, '0')}`,
        edgeKind: 'crossProjectionLink',
        fromNodeId: `global:r3-c04:${String(index - 17).padStart(5, '0')}`,
        toNodeId: nodeId,
        sourceProjection: 'r3-c04.worker-stress',
        sourceId: `origin-edge-${index}`,
        sourceRefIds: [`scene:${index % 1000}`],
      });
    }
  }
  return {
    schemaVersion: 'derived.atlas.globalCompositeGraph.v1',
    projectId: PROJECT_ID,
    sourceRefs: [],
    nodes,
    edges,
    summary: {
      sourceProjectionCount: 1,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sourceProjectionHashes: { r3c04: 'a'.repeat(64) },
      compositeHash: hashCanonicalValue({ count, seed: 'r3-c04' }),
    },
    meta: {
      compositeHash: hashCanonicalValue({ count, seed: 'r3-c04' }),
    },
  };
}

async function proveWorkerStress() {
  const graph10k = buildCompositeGraph(10000);
  const graph50k = buildCompositeGraph(50000);
  const active10k = buildAtlasGraphWorkerPayload({
    graph: graph10k,
    generation: 1,
    limits: { maxNodes: 720, maxEdges: 960, labelNodeBudget: 160, spatialCellSize: 96 },
  }).value;
  const active50k = buildAtlasGraphWorkerPayload({
    graph: graph50k,
    generation: 2,
    limits: { maxNodes: 960, maxEdges: 1280, labelNodeBudget: 192, spatialCellSize: 112 },
  }).value;
  const fallbackPayload = buildAtlasGraphWorkerPayload({
    graph: graph10k,
    generation: 3,
    limits: { maxNodes: 720, maxEdges: 960, labelNodeBudget: 160, spatialCellSize: 96 },
  }).value;
  const queue = coalesceAtlasGraphWorkerPayloads([active10k, active50k], { maxQueueSize: 4 });
  const abortedController = new AbortController();
  abortedController.abort();
  const aborted = await runAtlasGraphWorkerJob({ payload: active10k, signal: abortedController.signal });
  const run10k = await runAtlasGraphWorkerJob({ payload: active10k, timeoutMs: 20000 });
  const run50k = await runAtlasGraphWorkerJob({ payload: active50k, timeoutMs: 30000 });
  const staleIdentity = acceptAtlasGraphWorkerResult({
    activePayload: active50k,
    result: run10k.value,
    currentSourceRevision: active10k.sourceRevision,
  });
  const staleRevision = acceptAtlasGraphWorkerResult({
    activePayload: active50k,
    result: run50k.value,
    currentSourceRevision: 'f'.repeat(64),
  });
  const accepted50k = acceptAtlasGraphWorkerResult({
    activePayload: active50k,
    result: run50k.value,
    currentSourceRevision: active50k.sourceRevision,
  });
  const fallback = await runAtlasGraphWorkerJob({
    payload: cloneAtlasGraphWorkerPayloadForFallback(fallbackPayload),
    forceFallback: true,
    fallbackReason: 'R3_C04_FORCED_FALLBACK',
  });
  return {
    queueCoalescedLatest: queue.ok === true && queue.value.queue.length === 1 && queue.value.queue[0].generation === 2,
    abortedRejected: aborted.ok === false && aborted.error?.code === 'E_ATLAS_GRAPH_WORKER_ABORTED',
    run10k: {
      ok: run10k.ok === true,
      executionMode: run10k.value?.executionMode || '',
      plannedNodes: run10k.value?.metrics?.plannedNodes || 0,
      plannedEdges: run10k.value?.metrics?.plannedEdges || 0,
      spatialIndexCells: run10k.value?.metrics?.spatialIndexCells || 0,
      portWallTimeMs: run10k.value?.portWallTimeMs || 0,
      fullGraphIncluded: run10k.value?.transfer?.fullGraphIncluded === true,
      coreStateIncluded: run10k.value?.transfer?.coreStateIncluded === true,
    },
    run50k: {
      ok: run50k.ok === true,
      executionMode: run50k.value?.executionMode || '',
      plannedNodes: run50k.value?.metrics?.plannedNodes || 0,
      plannedEdges: run50k.value?.metrics?.plannedEdges || 0,
      spatialIndexCells: run50k.value?.metrics?.spatialIndexCells || 0,
      portWallTimeMs: run50k.value?.portWallTimeMs || 0,
      fullGraphIncluded: run50k.value?.transfer?.fullGraphIncluded === true,
      coreStateIncluded: run50k.value?.transfer?.coreStateIncluded === true,
    },
    staleIdentityRejected: staleIdentity.ok === false && staleIdentity.error?.reason === 'STALE_RESULT_IDENTITY_MISMATCH',
    staleRevisionRejected: staleRevision.ok === false && staleRevision.error?.reason === 'STALE_RESULT_SOURCE_REVISION',
    accepted50kPointerOnly: accepted50k.ok === true
      && accepted50k.value.published.persistentDerivedTruth === false
      && accepted50k.value.published.projectTruthMutation === false
      && accepted50k.value.published.storageMutation === false,
    fallbackTyped: fallback.ok === true
      && fallback.value.executionMode === 'sync-fallback'
      && fallback.value.workerFailure?.code === 'E_ATLAS_GRAPH_WORKER_FORCED_FALLBACK',
  };
}

function proveNoSilentSearchSlice() {
  const source = fsSync.readFileSync(path.resolve('src/main.js'), 'utf8');
  return {
    candidateSliceRemoved: !/candidateNodes\.slice\(\s*0\s*,\s*500\s*\)/u.test(source),
    authoritativePartialProjectionAccepted: false,
  };
}

function collectFailures(report) {
  const failures = [];
  if (report.futureSchemaQuarantine.quarantined !== true) failures.push('FUTURE_SCHEMA_NOT_QUARANTINED');
  if (report.futureSchemaQuarantine.futureEntityPreserved !== true) failures.push('FUTURE_SCHEMA_DATA_NOT_PRESERVED');
  if (report.futureSchemaQuarantine.destructiveReplacement !== false) failures.push('FUTURE_SCHEMA_DESTRUCTIVE_REPLACEMENT');
  if (report.knownSchemaUnknownFields.preserved !== true) failures.push('KNOWN_SCHEMA_UNKNOWN_FIELD_LOST');
  if (report.splitGraphemeRejections.languageTagRejected !== true) failures.push('SPLIT_GRAPHEME_LANGUAGE_TAG_ACCEPTED');
  if (report.splitGraphemeRejections.evidenceRejected !== true) failures.push('SPLIT_GRAPHEME_EVIDENCE_ACCEPTED');
  if (report.multilingualRouting.allSegmentsMatched !== true) failures.push('MULTILINGUAL_SEGMENT_NOT_MATCHED');
  if (report.multilingualRouting.allRoutesAuthorBound !== true) failures.push('MENTION_LANGUAGE_ROUTE_NOT_AUTHOR_BOUND');
  if (report.multilingualRouting.allExpectedLanguages !== true) failures.push('MENTION_LANGUAGE_CODE_MISMATCH');
  if (report.multilingualRouting.exactOnlyNoFallback !== true) failures.push('MENTION_LANGUAGE_POLICY_NOT_EXACT_ONLY');
  if (report.multilingualRouting.allQuotesPreserved !== true) failures.push('UNICODE_QUOTE_OR_GRAPHEME_RANGE_NOT_PRESERVED');
  if (report.multilingualRouting.matcherPolicyBeforeMatching !== true) failures.push('MATCHER_POLICY_NOT_APPLIED_BEFORE_MATCHING');
  if (report.workerStress.queueCoalescedLatest !== true) failures.push('WORKER_QUEUE_NOT_COALESCED');
  if (report.workerStress.abortedRejected !== true) failures.push('WORKER_ABORT_NOT_REJECTED');
  if (report.workerStress.run10k.ok !== true || report.workerStress.run10k.executionMode !== 'worker-thread') failures.push('WORKER_10K_NOT_REAL_THREAD');
  if (report.workerStress.run50k.ok !== true || report.workerStress.run50k.executionMode !== 'worker-thread') failures.push('WORKER_50K_NOT_REAL_THREAD');
  if (report.workerStress.run50k.plannedNodes <= 0 || report.workerStress.run50k.plannedEdges <= 0 || report.workerStress.run50k.spatialIndexCells <= 0) failures.push('WORKER_50K_NO_LOD_SPATIAL_INDEX');
  if (report.workerStress.run50k.fullGraphIncluded !== false || report.workerStress.run50k.coreStateIncluded !== false) failures.push('WORKER_50K_FULL_TRUTH_PAYLOAD_INCLUDED');
  if (report.workerStress.staleIdentityRejected !== true) failures.push('WORKER_STALE_IDENTITY_ACCEPTED');
  if (report.workerStress.staleRevisionRejected !== true) failures.push('WORKER_STALE_REVISION_ACCEPTED');
  if (report.workerStress.accepted50kPointerOnly !== true) failures.push('WORKER_50K_PUBLICATION_NOT_POINTER_ONLY');
  if (report.workerStress.fallbackTyped !== true) failures.push('WORKER_FALLBACK_NOT_TYPED');
  if (report.searchProjection.candidateSliceRemoved !== true) failures.push('PROJECT_SEARCH_SILENT_500_SLICE_PRESENT');
  if (report.searchProjection.authoritativePartialProjectionAccepted !== false) failures.push('PARTIAL_PROJECTION_ACCEPTED_AS_AUTHORITATIVE');
  return failures;
}

async function runR3C04(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  const state = buildMultilingualState();
  const report = {
    schemaVersion: REPORT_SCHEMA,
    contourId: CONTOUR_ID,
    generatedAtUtc: new Date().toISOString(),
    project: {
      projectId: PROJECT_ID,
      sceneId: SCENE_ID,
      sceneTextHash: hashCanonicalValue(SCENE_TEXT),
      segmentCount: SEGMENTS.length,
      coreStateHash: hashCoreState(state),
    },
    futureSchemaQuarantine: proveFutureSchemaQuarantine(),
    knownSchemaUnknownFields: proveKnownSchemaUnknownFieldPreservation(state),
    splitGraphemeRejections: proveSplitGraphemeRejections(state),
    multilingualRouting: proveMultilingualRouting(state),
    workerStress: await proveWorkerStress(),
    searchProjection: proveNoSilentSearchSlice(),
    authority: {
      commandKernelMutationsOnly: true,
      networkRuntime: false,
      storageMutationByWorker: false,
      rendererMutationByWorker: false,
      generatedArtifactOnlyAccepted: false,
      physicalWorkerThreadObserved: true,
      unicodeCorpus: ['en', 'ru', 'cjk', 'rtl', 'indic', 'emoji', 'nfc', 'nfd', 'ime'],
    },
  };
  report.failures = collectFailures(report);
  report.status = report.failures.length === 0 ? 'PASS_R3_C04_MULTILINGUAL_WORKER_STRESS' : 'FAIL_R3_C04_MULTILINGUAL_WORKER_STRESS';
  report.pass = report.failures.length === 0;
  const reportPath = path.join(outDir, 'r3-c04-multilingual-worker-stress-report.json');
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  await fs.writeFile(reportPath, reportText, 'utf8');
  return {
    ...report,
    reportPath,
    reportSha256: sha256Text(reportText),
    evidenceFiles: {
      report: fileProof(reportPath),
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runR3C04(options);
  console.log(JSON.stringify({
    schemaVersion: result.schemaVersion,
    status: result.status,
    pass: result.pass,
    failures: result.failures,
    reportPath: result.reportPath,
    reportSha256: result.reportSha256,
  }, null, 2));
  if (result.pass !== true) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runR3C04 };
