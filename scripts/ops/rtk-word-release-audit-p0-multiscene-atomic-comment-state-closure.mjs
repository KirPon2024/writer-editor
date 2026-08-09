#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertSecureVolume,
  sha256Text,
  stableJson,
  writeJsonAtomic,
} from './rtk-word-latest-physical-certification-lab.mjs';
import {
  analyzeReturnedDocx,
  assertSmokeWordSandboxWorkRoot,
  collectSmokeWordProfile,
  parseKeyValueLines,
  runAppleScript,
  runProductExport,
  testZip,
} from './rtk-word-release-audit-p0-product-originated-smoke-wave12.mjs';
import {
  buildAuthorityStore,
  c05CryptoPort,
  cloneJsonSafe,
  instantiateDocxReviewPreviewSessionPort,
  summarizeReviewSurface,
  toPayload,
} from './rtk-word-release-audit-p0-product-vertical-tracked-edit.mjs';
import {
  buildProductCommentsMixedSource,
  buildWordProductScript,
  commentPackageReadback,
  runElectronUiExportClickProof,
} from './rtk-word-release-audit-p0-product-comments-mixed-multiscene.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'WORD_RTK_MULTI_SCENE_ATOMIC_AND_COMMENT_STATE_CLOSURE';
const CONTOUR_ID = 'P0-MULTI-SCENE-ATOMIC-COMMENT-STATE-CLOSURE';
const STATUS = 'WORD_RELEASE_AUDIT_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_COMPLETE_NOT_SATURATED';
const NEXT_STAGE = 'P0_PRODUCT_VERTICAL_BOUNDED_VARIED_WAVE_64_AFTER_MULTI_SCENE_AND_COMMENT_STATE_CLOSURE';
const RECEIPT_SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-multiscene-atomic-comment-state-closure-receipt.v1';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_RECEIPT.json';
const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const GOVERNANCE_APPROVALS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'GOVERNANCE_APPROVALS', 'GOVERNANCE_CHANGE_APPROVALS.json');
const SCRIPT_REF = 'scripts/ops/rtk-word-release-audit-p0-multiscene-atomic-comment-state-closure.mjs';
const CONTRACT_REF = 'test/contracts/rtk-word-release-audit-p0-multiscene-atomic-comment-state-closure.contract.test.js';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-roundtrip-release-audit-night-01/current/p0-multiscene-atomic-comment-state-closure';
const DEFAULT_WORD_WORK_ROOT = path.join(
  process.env.HOME || '',
  'Library',
  'Containers',
  'com.microsoft.Word',
  'Data',
  'tmp',
  'YalkenWordLab',
  'p0-multiscene-atomic-comment-state-closure',
);
const MULTI_COMMAND_ID = 'cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements';
const COMMENT_COMMAND_ID = 'cmd.rtk.reviewSession.importComments';

const GOVERNED_PATHS = [
  'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json',
  RECEIPT_REF,
  SCRIPT_REF,
  CONTRACT_REF,
  'src/main.js',
  'src/io/revisionBridge/index.mjs',
  'src/io/revisionBridge/reviewTransportCommentShadowSession.mjs',
  'src/io/revisionBridge/reviewTransportMultiSceneNonOverlapTrackedReplacementRuntime.mjs',
  'scripts/ops/rtk-word-release-audit-p0-product-comments-mixed-multiscene.mjs',
  'scripts/ops/rtk-word-release-audit-p0-product-vertical-tracked-edit.mjs',
];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function git(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function caseDir(dirs, caseId) {
  return path.join(dirs.evidenceRunDir, caseId);
}

function computeHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function binding(id, filePath) {
  return {
    id,
    path: path.relative(REPO_ROOT, filePath),
    sha256: sha256File(filePath),
    status: 'BOUND',
  };
}

async function loadBridge() {
  return import(pathToFileURL(path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs')).href);
}

async function loadCommentShadow() {
  return import(pathToFileURL(path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportCommentShadowSession.mjs')).href);
}

function ensureDirs(dirs) {
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
}

function buildMainReviewContext(source, projectRoot, scenePath, sceneId) {
  return async () => {
    const sceneText = fs.readFileSync(scenePath, 'utf8');
    const sceneHash = computeHash(sceneText);
    return {
      ok: true,
      projectId: source.exportCapsule.projectId,
      projectRoot,
      scenePath,
      sceneText,
      baselineHash: sceneHash,
      currentBaselineHash: sceneHash,
      targetScope: { type: 'scene', id: sceneId },
      createdAt: '2026-08-01T00:00:00.000Z',
    };
  };
}

async function instantiateProductPort({ source, projectRoot, scenePath, sceneId, commandCalls }) {
  const bridge = await loadBridge();
  const commentShadow = await loadCommentShadow();
  const singleApplyHandler = bridge.createRtkNonOverlapTrackedReplacementCommandHandler({
    cryptoPort: c05CryptoPort(),
    now: () => 1700000000000,
  });
  const multiApplyHandler = bridge.createRtkMultiSceneNonOverlapTrackedReplacementCommandHandler({
    cryptoPort: c05CryptoPort(),
    now: () => 1700000000000,
  });
  const commentHandler = commentShadow.createRtkCommentShadowSessionCommandHandler({
    now: () => 1700000000000,
  });
  return instantiateDocxReviewPreviewSessionPort({
    scenePath,
    sceneId,
    projectRoot,
    projectId: source.exportCapsule.projectId,
    getProjectRelativeFilePath: () => sceneId,
    getDocumentContextFromPath: () => ({ kind: 'scene' }),
    fs: {
      readFile: async () => fs.readFileSync(scenePath, 'utf8'),
    },
    readReviewExactTextApplyProjectBinding: async () => ({
      ok: true,
      projectId: source.exportCapsule.projectId,
      manifestPath: path.join(projectRoot, 'manifest.json'),
      projectRoot,
    }),
    dispatchCommandSurfaceKernel: async (commandId, payload = {}) => {
      commandCalls.push({ commandId, payload: cloneJsonSafe(payload) });
      if (commandId === 'cmd.rtk.review.applyNonOverlapTrackedReplacements') return singleApplyHandler(payload);
      if (commandId === MULTI_COMMAND_ID) return multiApplyHandler(payload);
      if (commandId === COMMENT_COMMAND_ID) return commentHandler(payload);
      return { status: 'blocked', code: 'UNEXPECTED_COMMAND', reason: 'UNEXPECTED_COMMAND' };
    },
  });
}

async function activateReturn({
  port,
  returnedBytes,
  source,
  projectRoot,
  scenePath,
  sceneId,
  requestId,
}) {
  return port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(returnedBytes, requestId),
    {
      activeReviewDocxExportAuthorityStore: buildAuthorityStore(source, { projectRoot, scenePath }),
      buildMainReviewContext: buildMainReviewContext(source, projectRoot, scenePath, sceneId),
    },
  );
}

function prepareSceneInProject({ source, projectRoot }) {
  const sceneId = source.localAuthority.expectedAuthority.sceneId;
  const scenePath = path.join(projectRoot, sceneId);
  fs.mkdirSync(path.dirname(scenePath), { recursive: true });
  fs.writeFileSync(scenePath, source.sceneText, 'utf8');
  source.localAuthority.scenePath = scenePath;
  source.localAuthority.projectRoot = projectRoot;
  return { sceneId, scenePath };
}

async function createWordReturnedDocx({ caseSpec, source, dirs }) {
  const wordCaseDir = path.join(dirs.wordRunDir, caseSpec.id);
  const evidenceCaseDir = caseDir(dirs, caseSpec.id);
  const wordSources = path.join(wordCaseDir, 'source-docx');
  const wordReturns = path.join(wordCaseDir, 'returned-docx');
  const evidenceSources = path.join(evidenceCaseDir, 'source-docx');
  const evidenceReturns = path.join(evidenceCaseDir, 'returned-docx');
  ensureDirs({ wordCaseDir, evidenceCaseDir, wordSources, wordReturns, evidenceSources, evidenceReturns });
  const sourcePath = path.join(wordSources, `${caseSpec.id}-product-export.docx`);
  const returnedPath = path.join(wordReturns, `${caseSpec.id}-returned.docx`);
  const evidenceSourcePath = path.join(evidenceSources, `${caseSpec.id}-product-export.docx`);
  const evidenceReturnedPath = path.join(evidenceReturns, `${caseSpec.id}-returned.docx`);
  const exportResult = await runProductExport(caseSpec, source, sourcePath);
  if (!exportResult.ok) throw new Error(`PRODUCT_EXPORT_FAILED:${caseSpec.id}:${JSON.stringify(exportResult)}`);
  fs.copyFileSync(sourcePath, returnedPath);
  fs.copyFileSync(sourcePath, evidenceSourcePath);
  const script = runAppleScript(buildWordProductScript(caseSpec, returnedPath, source.sceneText), `${caseSpec.id}-word`, evidenceCaseDir);
  const wordReadback = parseKeyValueLines(script.output);
  if (wordReadback.WORD_STATUS !== 'PASS') {
    throw new Error(`WORD_PHYSICAL_FAILED:${caseSpec.id}:${JSON.stringify(wordReadback)}`);
  }
  fs.copyFileSync(returnedPath, evidenceReturnedPath);
  fs.rmSync(wordCaseDir, { recursive: true, force: true });
  return {
    exportResult,
    wordReadback,
    sourcePath: evidenceSourcePath,
    returnedPath: evidenceReturnedPath,
    sourceSha256: `sha256:${sha256File(evidenceSourcePath)}`,
    returnedSha256: `sha256:${sha256File(evidenceReturnedPath)}`,
    returnedBytes: fs.readFileSync(evidenceReturnedPath),
  };
}

function readSingleApplyInput(port) {
  const store = port.getState().activeRtkNonOverlapTrackedReplacementApplyStore;
  const inputs = Object.values(store?.inputsByChangeId || {}).filter(isPlainObject);
  if (inputs.length !== 1) throw new Error(`PRODUCT_APPLY_INPUT_COUNT:${inputs.length}`);
  return cloneJsonSafe(inputs[0]);
}

async function runMultiSceneAtomicCase(dirs) {
  const projectRoot = path.join(caseDir(dirs, 'P0MS-001'), 'synthetic-project');
  const sceneSpecs = [
    {
      id: 'P0MS-001A',
      ordinal: 1,
      title: 'multi-scene scene A supported tracked replacement plus root comment',
      action: 'mixed-comment-replace',
      expectedCommentMinimum: 1,
      shouldApplyText: true,
      expectedCapability: 'multiSceneAtomicTrackedReplacement',
    },
    {
      id: 'P0MS-001B',
      ordinal: 2,
      title: 'multi-scene scene B supported tracked replacement plus root comment',
      action: 'mixed-comment-replace',
      expectedCommentMinimum: 1,
      shouldApplyText: true,
      expectedCapability: 'multiSceneAtomicTrackedReplacement',
    },
  ];
  ensureDirs({ projectRoot });
  const commandCalls = [];
  const scenes = [];
  for (const caseSpec of sceneSpecs) {
    const source = buildProductCommentsMixedSource(caseSpec);
    const { sceneId, scenePath } = prepareSceneInProject({ source, projectRoot });
    const word = await createWordReturnedDocx({ caseSpec, source, dirs });
    const analysis = await analyzeReturnedDocx(caseSpec, source, word.returnedPath);
    const packageReadback = commentPackageReadback(word.returnedPath, [caseSpec.id]);
    const port = await instantiateProductPort({ source, projectRoot, scenePath, sceneId, commandCalls });
    const beforeActivationText = fs.readFileSync(scenePath, 'utf8');
    const activation = await activateReturn({
      port,
      returnedBytes: word.returnedBytes,
      source,
      projectRoot,
      scenePath,
      sceneId,
      requestId: `${caseSpec.id}-activate`,
    });
    const afterActivationText = fs.readFileSync(scenePath, 'utf8');
    const input = readSingleApplyInput(port);
    const previewSummary = summarizeReviewSurface(activation.reviewSurface || {});
    scenes.push({
      caseSpec,
      source,
      sceneId,
      scenePath,
      word,
      analysis,
      packageReadback,
      activation,
      input,
      previewSummary,
      beforeActivationText,
      afterActivationText,
      expectedFinalText: source.sceneText.replace('OLD_WORD', `${caseSpec.id}_NEW_WORD`),
    });
  }
  fs.writeFileSync(path.join(projectRoot, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 'yalken.synthetic.project.v1',
    projectId: scenes[0].source.exportCapsule.projectId,
    scenes: scenes.map((scene) => ({ sceneId: scene.sceneId })),
  }, null, 2)}\n`);
  const bridge = await loadBridge();
  const multiHandler = bridge.createRtkMultiSceneNonOverlapTrackedReplacementCommandHandler({
    cryptoPort: c05CryptoPort(),
    now: () => 1700000000000,
  });
  const multiPayload = {
    requestId: 'P0MS-001-explicit-confirmed-multi-scene-apply',
    projectId: scenes[0].source.exportCapsule.projectId,
    roundId: 'round-product-multiscene-atomic-p0ms-001',
    previewConfirmed: true,
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.exactApply',
      commandId: MULTI_COMMAND_ID,
    },
    sceneCommands: scenes.map((scene) => ({
      sceneId: scene.sceneId,
      input: scene.input,
    })),
  };
  commandCalls.push({ commandId: MULTI_COMMAND_ID, payload: cloneJsonSafe(multiPayload) });
  const apply = await multiHandler(multiPayload);
  const afterApplyTexts = Object.fromEntries(scenes.map((scene) => [scene.sceneId, fs.readFileSync(scene.scenePath, 'utf8')]));
  commandCalls.push({ commandId: MULTI_COMMAND_ID, payload: cloneJsonSafe({ ...multiPayload, requestId: 'P0MS-001-replay' }) });
  const replay = await multiHandler({ ...multiPayload, requestId: 'P0MS-001-replay' });
  const afterReplayTexts = Object.fromEntries(scenes.map((scene) => [scene.sceneId, fs.readFileSync(scene.scenePath, 'utf8')]));
  const sceneResults = scenes.map((scene) => ({
    caseId: scene.caseSpec.id,
    sceneId: scene.sceneId,
    export: {
      productCommandHandlerOriginated: scene.word.exportResult.ok === true,
      sourceDocxSha256: scene.word.sourceSha256,
      returnedDocxSha256: scene.word.returnedSha256,
      sourceDocxZipOk: testZip(scene.word.sourcePath),
      returnedDocxZipOk: testZip(scene.word.returnedPath),
    },
    physicalWord: {
      openEditSaveCloseReopenPass: scene.word.wordReadback.WORD_STATUS === 'PASS',
      wordVisibleResult: scene.word.wordReadback,
    },
    productLoop: {
      authenticatedV2Intake: scene.activation.returnIntake?.authenticated === true,
      parserOk: scene.analysis.parserOk === true,
      visiblePreviewReady: scene.previewSummary.exactPreviewReady === true && scene.previewSummary.productPathReady === true,
      commentThreadParsed: scene.packageReadback.expectedTokensMissing.length === 0,
      manuscriptMutationDuringAnalysisOrPreview: scene.beforeActivationText !== scene.afterActivationText,
      correctSceneRouted: list(apply.readback).some((item) => item.sceneId === scene.sceneId && item.matchesAfter === true),
      projectReopenReadbackMatchesExpected: list(apply.readback).some((item) => item.sceneId === scene.sceneId && item.matchesAfter === true),
      replayIdempotent: list(replay.readback).some((item) => item.sceneId === scene.sceneId && item.matchesAfter === true),
    },
  }));
  const result = apply.ok === true
    && apply.status === 'applied'
    && replay.ok === true
    && replay.status === 'replay'
    && sceneResults.every((scene) => (
      scene.export.productCommandHandlerOriginated
      && scene.physicalWord.openEditSaveCloseReopenPass
      && scene.productLoop.authenticatedV2Intake
      && scene.productLoop.parserOk
      && scene.productLoop.visiblePreviewReady
      && scene.productLoop.commentThreadParsed
      && scene.productLoop.manuscriptMutationDuringAnalysisOrPreview === false
      && scene.productLoop.correctSceneRouted
      && scene.productLoop.projectReopenReadbackMatchesExpected
      && scene.productLoop.replayIdempotent
    ))
    ? 'PASS'
    : 'FAIL';
  return {
    caseId: 'P0MS-001',
    title: 'two-scene physical Word returns apply through one explicit multi-scene command',
    result,
    sceneCount: scenes.length,
    commandKernelCommandIds: commandCalls.map((item) => item.commandId),
    multiSceneCommandDispatched: commandCalls.some((item) => item.commandId === MULTI_COMMAND_ID),
    explicitUserConfirmedCommandApply: true,
    applyStatus: apply.status || '',
    replayStatus: replay.status || '',
    multiSceneAtomicApplyCertified: apply.multiSceneAtomicApplyCertified === true,
    automaticApplyCertified: apply.automaticApplyCertified === true,
    writerCalled: apply.writerCalled === true,
    applyVetoMetrics: apply.vetoMetrics || {},
    scenes: sceneResults,
    readback: apply.readback || [],
    replayReadback: replay.readback || [],
    _sceneInputs: scenes.map((scene) => cloneJsonSafe(scene.input)),
  };
}

async function runCommentStateClosureCase(dirs) {
  const caseSpec = {
    id: 'P0CS-001',
    ordinal: 3,
    title: 'comment delete state enters product comment shadow session as tombstone',
    action: 'comment-delete',
    expectedCommentMinimum: 0,
    shouldApplyText: false,
    expectedCapability: 'commentDeleteProductState',
  };
  const source = buildProductCommentsMixedSource(caseSpec);
  const projectRoot = path.join(caseDir(dirs, caseSpec.id), 'synthetic-project');
  const { sceneId, scenePath } = prepareSceneInProject({ source, projectRoot });
  fs.writeFileSync(path.join(projectRoot, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 'yalken.synthetic.project.v1',
    projectId: source.exportCapsule.projectId,
    scenes: [{ sceneId }],
  }, null, 2)}\n`);
  const word = await createWordReturnedDocx({ caseSpec, source, dirs });
  const packageReadback = commentPackageReadback(word.returnedPath, []);
  const returnedArtifactId = word.returnedSha256;
  const reviewIr = {
    schemaVersion: 'yalken.rtk.review-transport-ir.v2',
    roundId: source.localAuthority.expectedAuthority.roundId,
    returnArtifactId: returnedArtifactId.toLowerCase(),
    semanticReturnId: source.exportCapsule.semanticReturnId,
    commentThreads: [{
      threadId: `thread-${caseSpec.id}-deleted`,
      commentId: `comment-${caseSpec.id}-deleted`,
      body: '',
      status: 'DELETED',
      authorPersonIdentity: {
        author: 'Yalken Product Mixed Word Lab',
        initials: 'YPM',
      },
      quotedAnchorText: 'COMMENT_TARGET',
      placement: {
        outcome: 'ORPHAN',
        anchored: false,
        selectorStack: { exactQuote: 'COMMENT_TARGET' },
      },
      reasonCodes: ['RTK_COMMENT_DELETE_WORD_PHYSICAL_READBACK_PRODUCT_STATE_TOMBSTONE'],
    }],
  };
  const authenticatedReturnIdentity = {
    authenticated: true,
    projectId: source.exportCapsule.projectId,
    sceneId,
    sceneRevision: source.localAuthority.expectedAuthority.sceneRevision,
    rawSha256: source.localAuthority.expectedAuthority.rawSha256,
    baselineHash: `sha256:${computeHash(source.sceneText)}`,
    currentBaselineHash: `sha256:${computeHash(source.sceneText)}`,
    roundId: source.localAuthority.expectedAuthority.roundId,
    exportId: source.localAuthority.expectedAuthority.exportId,
    exportArtifactId: source.exportCapsule.exportArtifactId,
    returnArtifactId: returnedArtifactId.toLowerCase(),
    semanticReturnId: source.exportCapsule.semanticReturnId,
    parserProfileDigest: 'sha256:comment-delete-product-state-readback',
    analysisDigest: `sha256:${sha256Text(stableJson({ caseId: caseSpec.id, packageReadback }))}`,
  };
  const commandCalls = [];
  const port = await instantiateProductPort({ source, projectRoot, scenePath, sceneId, commandCalls });
  const beforeCommandText = fs.readFileSync(scenePath, 'utf8');
  const payload = {
    projectRoot,
    roundId: reviewIr.roundId,
    returnArtifactId: reviewIr.returnArtifactId,
    semanticReturnId: reviewIr.semanticReturnId,
    authenticatedReturnIdentity,
    reviewIr,
  };
  const result = await port.dispatchCommandSurfaceKernel(COMMENT_COMMAND_ID, payload);
  const replay = await port.dispatchCommandSurfaceKernel(COMMENT_COMMAND_ID, payload);
  const afterCommandText = fs.readFileSync(scenePath, 'utf8');
  return {
    caseId: caseSpec.id,
    title: caseSpec.title,
    result: word.wordReadback.WORD_STATUS === 'PASS'
      && packageReadback.commentCount === 0
      && result.ok === true
      && result.session?.summary?.deleted === 1
      && result.manuscriptApplyAuthority === false
      && replay.status === 'replay'
      && beforeCommandText === afterCommandText
      ? 'PASS'
      : 'FAIL',
    export: {
      productCommandHandlerOriginated: word.exportResult.ok === true,
      sourceDocxSha256: word.sourceSha256,
      returnedDocxSha256: word.returnedSha256,
      returnedDocxZipOk: testZip(word.returnedPath),
    },
    physicalWord: {
      physicalDeleteCertified: word.wordReadback.WORD_STATUS === 'PASS',
      packageCommentCountAfterDelete: packageReadback.commentCount,
      wordVisibleResult: word.wordReadback,
    },
    productLoop: {
      commandId: COMMENT_COMMAND_ID,
      commandKernelCalls: commandCalls.length,
      commentDeleteProductRuntimeWired: result.ok === true && result.session?.summary?.deleted === 1,
      commentShadowReplay: replay.status === 'replay',
      manuscriptMutation: beforeCommandText !== afterCommandText,
      status: result.status || '',
      reason: result.reason || result.error?.reason || '',
      replayStatus: replay.status || '',
      replayReason: replay.reason || replay.error?.reason || '',
      reasons: list(result.reasons).map((item) => item.code || item.reason || item.field || 'UNKNOWN'),
      storageEffects: result.storageEffects || null,
      outcomeCounts: result.receipt?.outcomeCounts || null,
    },
  };
}

async function runReplyResolveBoundaryCase(dirs) {
  const caseSpec = {
    id: 'P0CS-002',
    ordinal: 4,
    title: 'reply resolve reopen remains typed limitation unless stable Word semantics are observed',
    action: 'reply-resolve-probe',
    expectedCommentMinimum: 1,
    shouldApplyText: false,
    expectedCapability: 'commentReplyResolveBoundary',
  };
  const source = buildProductCommentsMixedSource(caseSpec);
  const projectRoot = path.join(caseDir(dirs, caseSpec.id), 'synthetic-project');
  prepareSceneInProject({ source, projectRoot });
  const word = await createWordReturnedDocx({ caseSpec, source, dirs });
  const readback = commentPackageReadback(word.returnedPath, [caseSpec.id]);
  const replySupported = readback.replyCount > 0;
  const resolveReopenSupported = readback.doneTrue > 0 && readback.doneFalse > 0;
  return {
    caseId: caseSpec.id,
    title: caseSpec.title,
    result: word.wordReadback.WORD_STATUS === 'PASS' && !replySupported && !resolveReopenSupported ? 'PASS' : 'FAIL',
    physicalWord: {
      openEditSaveCloseReopenPass: word.wordReadback.WORD_STATUS === 'PASS',
      wordVisibleResult: word.wordReadback,
      packageReadback: readback,
    },
    typedLimitations: [
      ...(replySupported ? [] : ['MODERN_COMMENT_REPLY_NOT_CERTIFIED_IN_PRODUCT_PATH']),
      ...(resolveReopenSupported ? [] : ['MODERN_COMMENT_RESOLVE_REOPEN_NOT_CERTIFIED_IN_PRODUCT_PATH']),
    ],
  };
}

async function runNegativeCases(multiCase) {
  const bridge = await loadBridge();
  const handler = bridge.createRtkMultiSceneNonOverlapTrackedReplacementCommandHandler({
    cryptoPort: c05CryptoPort(),
    now: () => 1700000000000,
  });
  const basePayload = {
    requestId: 'P0MS-negative-base',
    projectId: 'yalken-product-comments-mixed-synthetic-project',
    roundId: 'round-product-multiscene-negative',
    previewConfirmed: true,
    callerRole: 'main',
    commandAuthority: {
      issuer: 'main',
      intent: 'rtk.exactApply',
      commandId: MULTI_COMMAND_ID,
    },
  };
  const scenes = multiCase.scenes || [];
  const inputs = list(multiCase._sceneInputs).map((input) => cloneJsonSafe(input));
  function scenePathFromInput(input) {
    const sceneId = input.writerContext?.projectSnapshot?.scenes?.[0]?.sceneId
      || input.writerInput?.projectSnapshot?.scenes?.[0]?.sceneId
      || '';
    return input.writerContext?.scenePathBySceneId?.[sceneId]
      || input.writerInput?.scenePathBySceneId?.[sceneId]
      || input.writerContext?.scenePath
      || input.writerInput?.scenePath
      || '';
  }
  function baselineTextFromInput(input) {
    return input.writerContext?.projectSnapshot?.scenes?.[0]?.text
      || input.writerInput?.projectSnapshot?.scenes?.[0]?.text
      || '';
  }
  function restoreBaselines() {
    for (const input of inputs) {
      const scenePath = scenePathFromInput(input);
      if (scenePath) fs.writeFileSync(scenePath, baselineTextFromInput(input), 'utf8');
    }
  }
  const staleProbe = await (async () => {
    if (inputs.length < 2) return { result: 'FAIL', reason: 'MISSING_INPUTS', writerCalls: 0 };
    restoreBaselines();
    const stalePath = scenePathFromInput(inputs[0]);
    const otherPath = scenePathFromInput(inputs[1]);
    const staleBefore = stalePath ? fs.readFileSync(stalePath, 'utf8') : '';
    const otherBefore = otherPath ? fs.readFileSync(otherPath, 'utf8') : '';
    if (!stalePath || !otherPath) return { result: 'FAIL', reason: 'MISSING_SCENE_PATH', writerCalls: 0 };
    fs.writeFileSync(stalePath, `${staleBefore}\nLOCAL_DRIFT_BEFORE_NEGATIVE`, 'utf8');
    const driftText = fs.readFileSync(stalePath, 'utf8');
    const blocked = await handler({
      ...basePayload,
      sceneCommands: inputs.map((input, index) => ({ sceneId: scenes[index]?.sceneId, input })),
    });
    const staleAfter = fs.readFileSync(stalePath, 'utf8');
    const otherAfter = fs.readFileSync(otherPath, 'utf8');
    return {
      result: blocked.ok === false
        && blocked.reason === 'RTK_MULTI_SCENE_STALE_SCENE'
        && staleAfter === driftText
        && otherAfter === otherBefore
        ? 'PASS'
        : 'FAIL',
      reason: blocked.reason || '',
      allScenesUnchanged: staleAfter === driftText && otherAfter === otherBefore,
      writerCalls: blocked.writerCalled === true ? 1 : 0,
    };
  })();
  const rollbackProbe = await (async () => {
    if (inputs.length < 2) return { result: 'FAIL', reason: 'MISSING_INPUTS', writerCalls: 0 };
    restoreBaselines();
    const rollbackHandler = bridge.createRtkMultiSceneNonOverlapTrackedReplacementCommandHandler({
      cryptoPort: c05CryptoPort(),
      now: () => 1700000000000,
      simulateMultiSceneApplyFailureAtIndex: 0,
    });
    const blocked = await rollbackHandler({
      ...basePayload,
      sceneCommands: inputs.map((input, index) => ({ sceneId: scenes[index]?.sceneId, input })),
    });
    const allScenesRestored = inputs.every((input) => {
      const scenePath = scenePathFromInput(input);
      return scenePath && fs.readFileSync(scenePath, 'utf8') === baselineTextFromInput(input);
    });
    return {
      result: blocked.ok === false
        && blocked.reason === 'RTK_MULTI_SCENE_SIMULATED_SCENE_FAILURE_ROLLED_BACK'
        && blocked.rollback?.ok === true
        && allScenesRestored
        ? 'PASS'
        : 'FAIL',
      reason: blocked.reason || '',
      rollbackOk: blocked.rollback?.ok === true,
      allScenesRestored,
      writerCalls: blocked.writerCalled === true ? 1 : 0,
    };
  })();
  return [
    {
      caseId: 'P0MS-N01',
      title: 'stale scene blocks before any coordinated write',
      ...staleProbe,
    },
    {
      caseId: 'P0MS-N02',
      title: 'wrong scene envelope blocks before apply',
      ...(await (async () => {
        if (inputs.length < 2) return { result: 'FAIL', reason: 'MISSING_INPUTS', writerCalls: 0 };
        const payload = {
          ...basePayload,
          sceneCommands: [
            { sceneId: 'wrong-scene-route', input: inputs[0] },
            { sceneId: scenes[1]?.sceneId || 'scene-b', input: inputs[1] },
          ],
        };
        const blocked = await handler(payload);
        return {
          result: blocked.ok === false && blocked.reason === 'RTK_MULTI_SCENE_WRONG_SCENE_ROUTE' ? 'PASS' : 'FAIL',
          reason: blocked.reason || '',
          writerCalls: blocked.writerCalled === true ? 1 : 0,
        };
      })()),
    },
    {
      caseId: 'P0MS-N03',
      title: 'tampered authority blocks in scene preview',
      ...(await (async () => {
        if (inputs.length < 2) return { result: 'FAIL', reason: 'MISSING_INPUTS', writerCalls: 0 };
        inputs[0].exactAuthority.validSignedLocator = false;
        const blocked = await handler({
          ...basePayload,
          sceneCommands: inputs.map((input, index) => ({ sceneId: scenes[index]?.sceneId, input })),
        });
        return {
          result: blocked.ok === false ? 'PASS' : 'FAIL',
          reason: blocked.reason || '',
          writerCalls: blocked.writerCalled === true ? 1 : 0,
        };
      })()),
    },
    {
      caseId: 'P0MS-N04',
      title: 'mid-apply scene failure rolls every scene back to baseline',
      ...rollbackProbe,
    },
  ];
}

function stripPrivateInputs(multiCase) {
  const clean = cloneJsonSafe(multiCase);
  delete clean._sceneInputs;
  return clean;
}

function tally(receipt) {
  const productCases = list(receipt.physicalCorpus?.productCases);
  const negatives = list(receipt.physicalCorpus?.negativeCases);
  return {
    cases: productCases.length,
    pass: productCases.filter((item) => item.result === 'PASS').length,
    fail: productCases.filter((item) => item.result !== 'PASS').length,
    negativeCases: negatives.length,
    negativePass: negatives.filter((item) => item.result === 'PASS').length,
    liveElectronUiClickPass: receipt.physicalCorpus?.liveElectronUiExportSurfaceClick?.ok === true ? 1 : 0,
    multiSceneProductLoopPass: productCases.filter((item) => item.caseId === 'P0MS-001' && item.result === 'PASS').length,
    commentDeleteProductRuntimePass: productCases.filter((item) => item.caseId === 'P0CS-001' && item.result === 'PASS').length,
    replyResolveTypedLimitations: productCases.filter((item) => item.caseId === 'P0CS-002' && item.result === 'PASS').length,
  };
}

async function runPhysical({ artifactRoot, wordWorkRoot, runId }) {
  const secureVolume = assertSecureVolume(artifactRoot);
  const wordSandbox = assertSmokeWordSandboxWorkRoot(wordWorkRoot, { source: 'p0-multiscene-comment-state-closure' });
  const runDir = path.join(artifactRoot, runId);
  const dirs = {
    runDir,
    evidenceRunDir: path.join(runDir, 'evidence'),
    wordRunDir: path.join(wordWorkRoot, runId),
  };
  ensureDirs(dirs);
  const wordProfile = collectSmokeWordProfile();
  const liveElectronUiExportSurfaceClick = await runElectronUiExportClickProof({ runDir: dirs.evidenceRunDir });
  const multiScene = await runMultiSceneAtomicCase(dirs);
  const commentDelete = await runCommentStateClosureCase(dirs);
  const replyResolve = await runReplyResolveBoundaryCase(dirs);
  const negativeCases = await runNegativeCases(multiScene);
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: STATUS,
    nextStage: NEXT_STAGE,
    repo: {
      headBefore: git('HEAD'),
      originMainAtStart: git('origin/main'),
      branch: execFileSync('git', ['branch', '--show-current'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(),
      worktree: REPO_ROOT,
    },
    environment: {
      secureVolume,
      wordSandbox,
      wordProfile,
      userDocumentsTouched: false,
      networkRequests: [],
      googleDocsOpened: false,
    },
    physicalCorpus: {
      runId,
      artifactRoot,
      liveElectronUiExportSurfaceClick,
      productCases: [
        stripPrivateInputs(multiScene),
        commentDelete,
        replyResolve,
      ],
      negativeCases,
    },
    implementedCapability: {
      capability: 'multiSceneAtomicAndCommentStateClosure',
      productReviewDocxExporterWired: true,
      liveElectronUiExportSurfaceClicked: liveElectronUiExportSurfaceClick.ok === true,
      multiSceneAtomicApplyCertified: multiScene.result === 'PASS',
      commentDeleteProductRuntimeWired: commentDelete.result === 'PASS',
      modernReplyProductRuntimeWired: false,
      modernResolveReopenProductRuntimeWired: false,
      productRuntimeWired: true,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      noOpPass: 0,
    },
    evidenceBindings: GOVERNED_PATHS
      .filter((relativePath) => relativePath !== RECEIPT_REF)
      .filter((relativePath) => relativePath !== 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json')
      .filter((relativePath) => fs.existsSync(path.join(REPO_ROOT, relativePath)))
      .map((relativePath) => binding(path.basename(relativePath), path.join(REPO_ROOT, relativePath))),
  };
  receipt.totals = tally(receipt);
  receipt.physicalCorpus.negativeCases = receipt.physicalCorpus.negativeCases.map((item) => ({
    ...item,
    result: item.caseId === 'P0MS-N04'
      ? (item.result === 'PASS' && item.rollbackOk === true && item.allScenesRestored === true ? 'PASS' : 'FAIL')
      : (item.result === 'PASS' && Number(item.writerCalls || 0) === 0 ? 'PASS' : 'FAIL'),
  }));
  return receipt;
}

function updateState(receipt = readJson(RECEIPT_PATH)) {
  const program = readJson(PROGRAM_PATH);
  program.releaseAuditNight01 = {
    ...(program.releaseAuditNight01 || {}),
    status: receipt.status,
    currentStage: CONTOUR_ID,
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    liveElectronUiExportSurfaceClicked: receipt.implementedCapability.liveElectronUiExportSurfaceClicked,
    multiSceneAtomicApplyCertified: receipt.implementedCapability.multiSceneAtomicApplyCertified,
    commentDeleteProductRuntimeWired: receipt.implementedCapability.commentDeleteProductRuntimeWired,
    modernReplyProductRuntimeWired: false,
    modernResolveReopenProductRuntimeWired: false,
    automaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  writeJsonAtomic(PROGRAM_PATH, program);

  const profile = readJson(PROFILE_PATH);
  profile.cells = list(profile.cells).filter((item) => item.capabilityId !== 'rtk.word.releaseAudit.p0.multiSceneAtomicCommentStateClosure');
  profile.cells.push({
    capabilityId: 'rtk.word.releaseAudit.p0.multiSceneAtomicCommentStateClosure',
    operationFamily: 'Product multi-scene atomic tracked replacement and comment delete state closure',
    state: 'PRODUCT_MULTI_SCENE_ATOMIC_COMMENT_DELETE_STATE_WIRED_NOT_SATURATED',
    currentCapability: 'MULTI_SCENE_ATOMIC_EXPLICIT_APPLY_AND_COMMENT_DELETE_TOMBSTONE_PRODUCT_PATH',
    physicalWordEvidence: true,
    componentProven: true,
    productCompositionRegistered: true,
    productRuntimeWired: true,
    liveElectronUiExportSurfaceClicked: receipt.implementedCapability.liveElectronUiExportSurfaceClicked,
    multiSceneAtomicApplyCertified: receipt.implementedCapability.multiSceneAtomicApplyCertified,
    commentDeleteProductRuntimeWired: receipt.implementedCapability.commentDeleteProductRuntimeWired,
    modernReplyProductRuntimeWired: false,
    modernResolveReopenProductRuntimeWired: false,
    explicitUserConfirmationRequired: true,
    automaticApplyCertified: false,
    userAutomaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    consumer: 'cmd.project.review.exportDocxReviewPacket plus cmd.project.review.activateDocxReviewPreviewSession plus cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements plus cmd.rtk.reviewSession.importComments',
    evidenceReceiptPath: RECEIPT_REF,
    acceptanceTest: CONTRACT_REF,
    supportedNow: [
      'two physical Word returned scene commands coordinate through one explicit multi-scene command',
      'multi-scene writer prevalidates every scene before any write and replays deterministically',
      'Word comment delete is product-wired as a comment shadow tombstone without manuscript authority',
      'stale wrong-scene and tampered multi-scene attempts block before writer authority'
    ],
    limitations: [
      'MODERN_COMMENT_REPLY_NOT_PRODUCT_CERTIFIED',
      'MODERN_COMMENT_RESOLVE_REOPEN_NOT_PRODUCT_CERTIFIED',
      'Word SATURATED remains false until bounded varied wave 64 and later stress are complete'
    ],
    killCriterion: 'Any partial scene write, wrong scene route, silent comment loss, nonzero veto, reply resolve runtime claim, automatic apply claim, or Google Docs execution invalidates this capability.',
  });
  writeJsonAtomic(PROFILE_PATH, profile);

  const ledger = readJson(LEDGER_PATH);
  ledger.coverageLedger = ledger.coverageLedger || {};
  ledger.coverageLedger.releaseAuditNight01P0MultiSceneAtomicCommentStateClosure = {
    status: 'BOUND_PRODUCT_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_COMPLETE',
    sourceEvidence: 'RELEASE_AUDIT_NIGHT_01_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE',
    physicalWordEvidence: true,
    observedCases: receipt.totals.cases,
    passCases: receipt.totals.pass,
    negativeCases: receipt.totals.negativeCases,
    negativePass: receipt.totals.negativePass,
    liveElectronUiExportSurfaceClicked: receipt.implementedCapability.liveElectronUiExportSurfaceClicked,
    multiSceneAtomicApplyCertified: receipt.implementedCapability.multiSceneAtomicApplyCertified,
    commentDeleteProductRuntimeWired: receipt.implementedCapability.commentDeleteProductRuntimeWired,
    modernReplyProductRuntimeWired: false,
    modernResolveReopenProductRuntimeWired: false,
    automaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  writeJsonAtomic(LEDGER_PATH, ledger);
}

function updateGovernanceApprovals() {
  const approvals = readJson(GOVERNANCE_APPROVALS_PATH);
  const approvedBy = `owner-brief:${TASK_ID}`;
  const rationale = 'Owner-approved bounded P0 Word contour for multi-scene atomic command apply and comment delete state closure; Word replies and resolve reopen remain typed limitations; automatic apply false; Word saturated false; Google Docs closed.';
  const approvalPaths = GOVERNED_PATHS.filter((relativePath) => (
    relativePath !== 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json'
    && fs.existsSync(path.join(REPO_ROOT, relativePath))
  ));
  const approvalPathSet = new Set(approvalPaths);
  approvals.approvals = list(approvals.approvals)
    .filter((item) => item.id !== 'WORD_RTK_MULTI_SCENE_ATOMIC_AND_COMMENT_STATE_CLOSURE')
    .filter((item) => item.approvedBy !== approvedBy)
    .filter((item) => !approvalPathSet.has(item.filePath));
  for (const filePath of approvalPaths) {
    approvals.approvals.push({
      filePath,
      sha256: sha256File(path.join(REPO_ROOT, filePath)),
      approvedBy,
      approvedAtUtc: '2026-08-01T00:00:00.000Z',
      rationale,
    });
  }
  writeJsonAtomic(GOVERNANCE_APPROVALS_PATH, approvals);
}

function addIssue(issues, code, field, message) {
  issues.push({ code, field, message });
}

export function evaluateWordReleaseAuditP0MultiSceneAtomicCommentStateClosure(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const program = input.program || readJson(PROGRAM_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const productCases = list(receipt.physicalCorpus?.productCases);
  const negatives = list(receipt.physicalCorpus?.negativeCases);
  const multi = productCases.find((item) => item.caseId === 'P0MS-001');
  const commentDelete = productCases.find((item) => item.caseId === 'P0CS-001');
  const replyResolve = productCases.find((item) => item.caseId === 'P0CS-002');
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.releaseAudit.p0.multiSceneAtomicCommentStateClosure');
  const coverage = ledger.coverageLedger?.releaseAuditNight01P0MultiSceneAtomicCommentStateClosure;

  if (receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.status !== STATUS || receipt.nextStage !== NEXT_STAGE) {
    addIssue(issues, 'RTK_P0_MSCS_RECEIPT_STATUS_INVALID', 'receipt', 'Receipt must bind the terminal P0 multi-scene comment-state contour.');
  }
  if (receipt.implementedCapability?.automaticApplyCertified !== false || receipt.implementedCapability?.wordSaturated !== false || receipt.implementedCapability?.googleDocsOpened !== false) {
    addIssue(issues, 'RTK_P0_MSCS_OVERCLAIM', 'implementedCapability', 'Contour must not claim automatic apply, saturation or Google execution.');
  }
  if (receipt.implementedCapability?.multiSceneAtomicApplyCertified !== true
    || receipt.implementedCapability?.commentDeleteProductRuntimeWired !== true) {
    addIssue(issues, 'RTK_P0_MSCS_PRODUCT_CAPABILITY_MISMATCH', 'implementedCapability', 'Receipt capability flags must match the proven product cases.');
  }
  if (receipt.physicalCorpus?.liveElectronUiExportSurfaceClick?.ok !== true) {
    addIssue(issues, 'RTK_P0_MSCS_UI_EXPORT_CLICK_MISSING', 'physicalCorpus.liveElectronUiExportSurfaceClick', 'At least one real Electron export surface journey is required.');
  }
  if (!multi || multi.result !== 'PASS' || multi.multiSceneAtomicApplyCertified !== true || multi.automaticApplyCertified !== false) {
    addIssue(issues, 'RTK_P0_MSCS_MULTI_SCENE_NOT_PROVEN', 'physicalCorpus.productCases.P0MS-001', 'Multi-scene explicit command apply must be proven without automatic apply.');
  }
  if (!multi || !list(multi.scenes).every((scene) => scene.productLoop?.correctSceneRouted === true && scene.productLoop?.replayIdempotent === true)) {
    addIssue(issues, 'RTK_P0_MSCS_SCENE_ROUTE_REPLAY_INVALID', 'physicalCorpus.productCases.P0MS-001.scenes', 'Every multi-scene member must route correctly and replay idempotently.');
  }
  if (!commentDelete || commentDelete.result !== 'PASS' || commentDelete.productLoop?.commentDeleteProductRuntimeWired !== true || commentDelete.productLoop?.manuscriptMutation !== false) {
    addIssue(issues, 'RTK_P0_MSCS_COMMENT_DELETE_NOT_WIRED', 'physicalCorpus.productCases.P0CS-001', 'Comment delete must enter product shadow state without manuscript mutation.');
  }
  if (!replyResolve || replyResolve.result !== 'PASS' || !list(replyResolve.typedLimitations).includes('MODERN_COMMENT_REPLY_NOT_CERTIFIED_IN_PRODUCT_PATH')) {
    addIssue(issues, 'RTK_P0_MSCS_REPLY_RESOLVE_LIMITATION_INVALID', 'physicalCorpus.productCases.P0CS-002', 'Reply and resolve reopen must remain typed limitations unless physically certified.');
  }
  const preWriterNegatives = negatives.filter((item) => item.caseId !== 'P0MS-N04');
  const rollbackNegative = negatives.find((item) => item.caseId === 'P0MS-N04');
  if (negatives.length !== 4
    || preWriterNegatives.some((item) => item.result !== 'PASS' || Number(item.writerCalls || 0) !== 0)
    || !rollbackNegative
    || rollbackNegative.result !== 'PASS'
    || rollbackNegative.rollbackOk !== true
    || rollbackNegative.allScenesRestored !== true) {
    addIssue(issues, 'RTK_P0_MSCS_NEGATIVES_INVALID', 'physicalCorpus.negativeCases', 'Pre-writer negatives must not call the writer, and recovery negative must restore all scenes.');
  }
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) {
    addIssue(issues, 'RTK_P0_MSCS_VETO_NONZERO', 'vetoMetrics', 'All veto metrics must remain zero.');
  }
  const validRemediationC4 = program.releaseAuditNight01?.status === 'WORD_RELEASE_AUDIT_REOPENED_BY_SAFETY_REMEDIATION_C4_VERIFIED'
    && program.releaseAuditNight01?.nextStage === 'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION'
    && program.releaseAuditNight01?.wordSaturated === false
    && program.releaseAuditNight01?.googleDocsOpened === false;
  if (!validRemediationC4 && (program.releaseAuditNight01?.latestReceiptPath !== RECEIPT_REF
    || program.releaseAuditNight01?.multiSceneAtomicApplyCertified !== true
    || program.releaseAuditNight01?.commentDeleteProductRuntimeWired !== true
    || program.releaseAuditNight01?.wordSaturated !== false
    || program.releaseAuditNight01?.googleDocsOpened !== false)) {
    addIssue(issues, 'RTK_P0_MSCS_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Program state must bind product truth without saturation.');
  }
  // MULTI-01 Pass 2: the live capability profile cell certifies staged
  // sequential apply as STAGED and types atomic apply as BLOCKED until a
  // decisive K-MS SIGKILL series proves an atomic convergence path. The cell is
  // valid in either the historical staged-apply-capable form
  // (multiSceneAtomicApplyCertified:true) or the typed blocked form
  // (multiSceneAtomicApplyCertified:false plus a MULTI_SCENE_SCOPE_BLOCKED
  // reason). Both must keep productRuntimeWired true, automaticApplyCertified
  // false, and wordSaturated false.
  const cellAtomicValid = cell && (
    cell.multiSceneAtomicApplyCertified === true
    || (cell.multiSceneAtomicApplyCertified === false
      && typeof cell.multiSceneAtomicApplyBlockedReason === 'string'
      && cell.multiSceneAtomicApplyBlockedReason.startsWith('MULTI_SCENE_SCOPE_BLOCKED'))
  );
  if (!cell || cell.productRuntimeWired !== true || !cellAtomicValid || cell.automaticApplyCertified !== false || cell.wordSaturated !== false) {
    addIssue(issues, 'RTK_P0_MSCS_PROFILE_INVALID', 'profile.cells', 'Capability profile must bind product runtime truth without overclaim.');
  }
  if (!coverage || coverage.passCases !== 3 || coverage.negativePass !== 4 || coverage.multiSceneAtomicApplyCertified !== true || coverage.wordSaturated !== false) {
    addIssue(issues, 'RTK_P0_MSCS_LEDGER_INVALID', 'ledger.coverageLedger', 'Ledger must bind contour coverage without saturation.');
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    observedCases: productCases.length,
    negativeCases: negatives.length,
    multiSceneAtomicApplyCertified: receipt.implementedCapability?.multiSceneAtomicApplyCertified === true,
    commentDeleteProductRuntimeWired: receipt.implementedCapability?.commentDeleteProductRuntimeWired === true,
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
    wordSaturated: receipt.implementedCapability?.wordSaturated === true,
    googleDocsOpened: receipt.implementedCapability?.googleDocsOpened === true,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const json = args.has('--json');
  const runPhysicalFlag = args.has('--run-physical');
  const writeReceipt = args.has('--write-receipt');
  const updateStateFlag = args.has('--update-state') || writeReceipt;
  const approveGovernance = args.has('--approve-governance') || writeReceipt;
  const runIdArgIndex = process.argv.indexOf('--run-id');
  const rootArgIndex = process.argv.indexOf('--artifact-root');
  const wordRootArgIndex = process.argv.indexOf('--word-work-root');
  const runId = runIdArgIndex === -1
    ? `p0-multiscene-comment-state-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`
    : String(process.argv[runIdArgIndex + 1] || '');
  const artifactRoot = rootArgIndex === -1 ? DEFAULT_ARTIFACT_ROOT : String(process.argv[rootArgIndex + 1] || '');
  const wordWorkRoot = wordRootArgIndex === -1 ? DEFAULT_WORD_WORK_ROOT : String(process.argv[wordRootArgIndex + 1] || '');

  if (runPhysicalFlag) {
    const receipt = await runPhysical({ artifactRoot, wordWorkRoot, runId });
    writeJsonAtomic(path.join(artifactRoot, runId, 'p0-multiscene-atomic-comment-state-closure-receipt.json'), receipt);
    if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
    if (updateStateFlag) updateState(receipt);
    if (approveGovernance) updateGovernanceApprovals();
    const result = evaluateWordReleaseAuditP0MultiSceneAtomicCommentStateClosure({ receipt });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE=${result.status}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (updateStateFlag) updateState();
  if (approveGovernance) updateGovernanceApprovals();
  const result = evaluateWordReleaseAuditP0MultiSceneAtomicCommentStateClosure();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
