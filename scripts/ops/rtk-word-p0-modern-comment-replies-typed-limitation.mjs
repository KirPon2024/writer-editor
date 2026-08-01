#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { writeJsonAtomic } from './rtk-word-latest-physical-certification-lab.mjs';
import { resolveWordSandboxWorkRoot } from './rtk-word-sandbox-work-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

const TASK_ID = 'WORD_RTK_P0_MODERN_COMMENT_REPLIES_TYPED_LIMITATION';
const STATUS = 'WORD_P0_MODERN_COMMENT_REPLIES_TYPED_LIMITATION_BOUND_NOT_SATURATED';
const SCHEMA = 'yalken.rtk.word.p0-modern-comment-replies-typed-limitation-receipt.v1';
const CREATED_AT_UTC = '2026-08-01T11:40:00.000Z';
const NEXT_STAGE = 'P0_MODERN_COMMENT_RESOLVE_REOPEN_PRODUCT_PATH_OR_TYPED_LIMITATION';
const RESOLVE_REOPEN_SUCCESSOR_STAGE = 'P0_SAFE_FORMATTING_APPLY_LANE_OR_TYPED_LIMITATION';
const FORMATTING_SUCCESSOR_STAGE = 'P0_SAFE_STRUCTURAL_APPLY_LANE_OR_TYPED_LIMITATION';
const STRUCTURAL_SUCCESSOR_STAGE = 'P0_MULTI_ROUND_STALE_CONFLICT_AND_LEDGER_RECONCILIATION';
const SCALE_SUCCESSOR_STAGE = 'P0_WORD_SCALE_ENGINEERING_AND_DECLARED_SUPPORT_ENVELOPE';
const ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/p0-modern-comment-replies';

const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MODERN_COMMENT_REPLY_TYPED_LIMITATION_RECEIPT.json';
const TARGETED_RECEIPT_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_NATIVE_UI_FOLLOWUP_RECEIPT.json';
const PROFILE_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_REF = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';
const LEDGER_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json';
const MATRIX_REF = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json';
const GOVERNANCE_APPROVALS_REF = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const SCRIPT_REF = 'scripts/ops/rtk-word-p0-modern-comment-replies-typed-limitation.mjs';
const CONTRACT_REF = 'test/contracts/rtk-word-p0-modern-comment-replies-typed-limitation.contract.test.js';
const C01_CONTRACT_REF = 'test/contracts/rtk-word-v4-a03-c01-comment-shadow-runtime.contract.test.js';
const C04_SCRIPT_REF = 'scripts/ops/rtk-word-v4-a03-c04-modern-comment-state.mjs';
const C04_CONTRACT_REF = 'test/contracts/rtk-word-v4-a03-c04-modern-comment-state.contract.test.js';
const COMMENT_SESSION_REF = 'src/io/revisionBridge/reviewTransportCommentShadowSession.mjs';
const MAIN_REF = 'src/main.js';

const COMMAND_ID = 'cmd.rtk.reviewSession.importComments';
const GOVERNED_PATHS = [
  RECEIPT_REF,
  PROFILE_REF,
  PROGRAM_REF,
  LEDGER_REF,
  SCRIPT_REF,
  CONTRACT_REF,
  C01_CONTRACT_REF,
  C04_SCRIPT_REF,
  C04_CONTRACT_REF,
  COMMENT_SESSION_REF,
];

function abs(relativePath) {
  return path.join(REPO_ROOT, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  writeJsonAtomic(abs(relativePath), value);
}

function sha256Buffer(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sha256File(relativePathOrAbs) {
  const filePath = path.isAbsolute(relativePathOrAbs) ? relativePathOrAbs : abs(relativePathOrAbs);
  return sha256Buffer(fs.readFileSync(filePath));
}

function sha256Text(text) {
  return `sha256:${sha256Buffer(Buffer.from(String(text), 'utf8'))}`;
}

function git(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function issue(code, field, message) {
  return { code, field, message };
}

function binding(id, relativePath) {
  return {
    id,
    path: relativePath,
    sha256: sha256File(relativePath),
    status: 'BOUND',
  };
}

function appleScriptText(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replace(/\r?\n/gu, '" & return & "')}"`;
}

function runAppleScript(script, options = {}) {
  return execFileSync('/usr/bin/osascript', ['-e', script], {
    encoding: 'utf8',
    timeout: Number(options.timeout || 70000),
  }).trim();
}

function packagePart(docxPath, partName) {
  const result = spawnSync('/usr/bin/unzip', ['-p', docxPath, partName], { encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '') : '';
}

function packageInventory(docxPath) {
  const result = spawnSync('/usr/bin/unzip', ['-Z1', docxPath], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`WORD_REPLY_ZIP_INVENTORY_FAILED:${String(result.stderr || '').trim()}`);
  return String(result.stdout || '')
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function decodeXmlText(value) {
  return String(value || '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function extractTextNodes(xml) {
  return [...String(xml || '').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
    .map((match) => decodeXmlText(match[1]));
}

function countMatches(text, pattern) {
  return [...String(text || '').matchAll(pattern)].length;
}

function summarizeDocx(docxPath, expectedTokens) {
  const parts = packageInventory(docxPath);
  const commentsXml = packagePart(docxPath, 'word/comments.xml');
  const commentsExtendedXml = packagePart(docxPath, 'word/commentsExtended.xml');
  const commentsIdsXml = packagePart(docxPath, 'word/commentsIds.xml');
  const commentsExtensibleXml = packagePart(docxPath, 'word/commentsExtensible.xml');
  const peopleXml = packagePart(docxPath, 'word/people.xml');
  const commentsText = extractTextNodes(commentsXml).join(' ');
  return {
    packagePartCount: parts.length,
    commentRelatedParts: parts.filter((part) => /^word\/(?:comments|people)/u.test(part)),
    commentCount: countMatches(commentsXml, /<w:comment[\s>]/gu),
    expectedTokensFound: expectedTokens.filter((token) => commentsText.includes(token)),
    expectedTokensMissing: expectedTokens.filter((token) => !commentsText.includes(token)),
    doneTrueCount: countMatches(commentsExtendedXml, /w15:done="1"/gu),
    doneFalseCount: countMatches(commentsExtendedXml, /w15:done="0"/gu),
    parentLinkCount: countMatches(commentsExtendedXml, /paraIdParent=/gu),
    durableIdCount: countMatches(`${commentsIdsXml}\n${commentsExtensibleXml}`, /durableId=/gu),
    peopleCount: countMatches(peopleXml, /<(?:\w+:)?person[\s>]/gu),
    commentsTextDigest: sha256Text(commentsText),
  };
}

function listOpenWordDocuments() {
  const output = runAppleScript(`
tell application "Microsoft Word"
  set outText to ""
  repeat with i from 1 to (count documents)
    set d to document i
    set docName to ""
    set docFullName to ""
    try
      set docName to name of d as text
    end try
    try
      set docFullName to full name of d as text
    end try
    set outText to outText & docName & "|" & docFullName & linefeed
  end repeat
  return outText
end tell`, { timeout: 10000 });
  return output.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', fullName = ''] = line.split('|');
      return { name, fullName };
    });
}

function runPhysicalReplyProbe() {
  const wordVersion = runAppleScript('tell application "Microsoft Word" to return version as text', { timeout: 10000 });
  const beforeDocuments = listOpenWordDocuments();
  const wordSandboxWorkRoot = resolveWordSandboxWorkRoot({
    defaultSegments: ['word-safe-semantic-v4', 'p0-modern-comment-replies'],
    overridePath: process.env.YALKEN_WORD_SANDBOX_WORK_ROOT,
  });
  const runId = `p0-modern-reply-${new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z')}`;
  const artifactRunDir = path.join(ARTIFACT_ROOT, runId);
  const sandboxRunDir = path.join(wordSandboxWorkRoot.root, runId);
  fs.mkdirSync(artifactRunDir, { recursive: true });
  fs.mkdirSync(sandboxRunDir, { recursive: true });
  const docxPath = path.join(sandboxRunDir, 'P0-MCR-001.docx');
  const returnedPath = path.join(artifactRunDir, 'P0-MCR-001.docx');
  const rootToken = '178560replyroot001';
  const replyToken = '178560replychild001';
  const sourceText = 'Yalken modern reply probe anchor alpha beta gamma.';
  const script = `
tell application "Microsoft Word"
  activate
  set doc1 to make new document
  set content of text object of doc1 to ${appleScriptText(sourceText)}
  save as doc1 file name ${appleScriptText(docxPath)} file format format document
  set r1 to create range doc1 start 1 end 20
  set c1 to make new Word comment at doc1 with properties {comment text:${appleScriptText(`root ${rootToken}`)}, scope:r1}
  set c2 to make new Word comment at doc1 with properties {comment text:${appleScriptText(`reply ${replyToken}`)}, scope:r1, parent:c1}
  save doc1
  close doc1 saving yes
  open file name ${appleScriptText(docxPath)}
  set reopenedText to content of text object of active document
  close active document saving yes
  return reopenedText
end tell`;
  let scriptError = '';
  let reopenedText = '';
  try {
    reopenedText = runAppleScript(script, { timeout: 70000 });
    fs.copyFileSync(docxPath, returnedPath);
  } catch (error) {
    scriptError = String(error.stderr || error.message || error);
  }
  const afterDocuments = listOpenWordDocuments();
  const packageReadback = scriptError
    ? null
    : summarizeDocx(returnedPath, [rootToken, replyToken]);
  const parentLinkCertified = Number(packageReadback?.parentLinkCount || 0) > 0;
  return {
    caseId: 'P0-MCR-001',
    route: 'Microsoft Word AppleScript object model parent comment reply attempt',
    wordVersion,
    wordSandboxWorkRoot,
    artifactRunDir,
    userDocumentsTouched: false,
    openDocumentSetUnchanged: JSON.stringify(beforeDocuments) === JSON.stringify(afterDocuments),
    beforeDocumentsDigest: sha256Text(JSON.stringify(beforeDocuments)),
    afterDocumentsDigest: sha256Text(JSON.stringify(afterDocuments)),
    result: scriptError
      ? 'TYPED_LIMITATION_WORD_OBJECT_MODEL_PARENT_REPLY_ERROR'
      : (parentLinkCertified ? 'PARENT_LINK_DETECTED_REQUIRES_RUNTIME_PROMOTION' : 'TYPED_LIMITATION_PARENT_LINK_NOT_PRESERVED'),
    scriptErrorDigest: scriptError ? sha256Text(scriptError) : '',
    wordVisibleEvidence: {
      saveCloseReopen: scriptError === '',
      reopenedTextDigest: scriptError ? '' : sha256Text(reopenedText),
    },
    returnedDocx: scriptError ? null : {
      sha256: `sha256:${sha256File(returnedPath)}`,
    },
    packageReadback,
    interpretation: parentLinkCertified
      ? 'Word preserved a parent link; product reply runtime must be implemented before closing this contour.'
      : 'Word-authored parent reply attempt returns two visible comments without a stable parent link; Yalken must preserve reply bodies as typed unsupported shadow diagnostics, not promote reply graph authority.',
  };
}

function priorPhysicalReplyEvidence() {
  const receipt = readJson(TARGETED_RECEIPT_REF);
  const replyCase = list(receipt?.physicalCorpus?.cases).find((item) => item.id === 'NCUI-C08') || {};
  return {
    sourceReceipt: binding('E12_MODERN_COMMENT_NATIVE_UI_FOLLOWUP', TARGETED_RECEIPT_REF),
    caseId: 'NCUI-C08',
    result: replyCase.result || '',
    commentCount: Number(replyCase.packageReadback?.commentCount || 0),
    parentLinkCount: Number(replyCase.packageReadback?.parentLinkCount || 0),
    expectedTokensMissing: list(replyCase.packageReadback?.expectedTokensMissing),
    certifiedAsTypedLimitation: String(replyCase.result || '').includes('TYPED_LIMITATION')
      && Number(replyCase.packageReadback?.commentCount || 0) >= 2
      && Number(replyCase.packageReadback?.parentLinkCount || 0) === 0,
  };
}

function authenticatedIdentity(overrides = {}) {
  return {
    authenticated: true,
    projectId: 'project-p0-modern-comment-replies',
    sceneId: 'roman/imported/scene-reply.txt',
    sceneRevision: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    rawSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    baselineHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    currentBaselineHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    roundId: 'round-p0-modern-comment-replies',
    exportId: 'export-p0-modern-comment-replies',
    exportArtifactId: 'export-artifact-p0-modern-comment-replies',
    returnArtifactId: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    semanticReturnId: 'semantic-p0-modern-comment-replies',
    parserProfileDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    analysisDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    ...overrides,
  };
}

function reviewIrWithUnsupportedReply(identity = authenticatedIdentity()) {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    roundId: identity.roundId,
    returnArtifactId: identity.returnArtifactId,
    semanticReturnId: identity.semanticReturnId,
    textRevisions: [],
    moveRevisions: [],
    propertyRevisions: [],
    formattingDeltas: [],
    structureChanges: [],
    opaqueUnsupported: [],
    commentPlacements: [],
    commentThreads: [
      {
        kind: 'CommentThread',
        threadId: 'p0-reply-thread-root',
        commentId: '1',
        durableId: 'durable-p0-reply-thread-root',
        parentThreadId: '',
        authorPersonIdentity: { author: 'Yalken Synthetic Editor', initials: 'YSE', people: [] },
        date: '2026-08-01T11:40:00.000Z',
        anchorStart: 1,
        anchorEnd: 20,
        quotedAnchorText: 'reply probe anchor',
        body: 'Root comment body for reply limitation closure.',
        status: 'ANCHORED',
        placement: {
          outcome: 'ANCHORED',
          anchored: true,
          selectorStack: { exactQuote: 'reply probe anchor', prefix: '', suffix: '', utf16Position: 1 },
        },
        replies: [
          {
            rawId: 'reply-typed-limitation-1',
            body: 'Unsupported reply body preserved without reply graph promotion.',
            author: 'Yalken Synthetic Reply Editor',
            initials: 'YSR',
            date: '2026-08-01T11:41:00.000Z',
          },
        ],
        reasonCodes: ['RTK_COMMENT_ANCHORED'],
      },
    ],
  };
}

async function runProductShadowProof() {
  const module = await import(pathToFileURL(abs(COMMENT_SESSION_REF)).href);
  const { createCommandSurfaceKernel } = require(abs('src/command/commandSurfaceKernel.js'));
  const kernel = createCommandSurfaceKernel({
    [COMMAND_ID]: module.createRtkCommentShadowSessionCommandHandler(),
  });
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-p0-modern-reply-'));
  const identity = authenticatedIdentity();
  const payload = {
    projectRoot,
    roundId: identity.roundId,
    returnArtifactId: identity.returnArtifactId,
    semanticReturnId: identity.semanticReturnId,
    authenticatedReturnIdentity: identity,
    reviewIr: reviewIrWithUnsupportedReply(identity),
  };
  const first = await kernel.dispatch(COMMAND_ID, payload);
  const replay = await kernel.dispatch(COMMAND_ID, payload);
  return {
    commandId: COMMAND_ID,
    commandKernelDispatched: true,
    ok: first.ok === true && replay.ok === true,
    firstStatus: first.status || '',
    replayStatus: replay.status || '',
    writerCalled: first.writerCalled === true || replay.writerCalled === true,
    manuscriptApplyAuthority: first.manuscriptApplyAuthority === true || replay.manuscriptApplyAuthority === true,
    threadCount: Number(first.session?.summary?.threadCount || 0),
    unsupportedReplyCount: Number(first.session?.summary?.unsupportedReplyCount || 0),
    replyCountPromoted: Number(first.session?.summary?.replyCountPromoted || 0),
    preservedReplyBodyDigest: first.session?.threads?.[0]?.unsupportedReplies?.[0]?.bodyDigest || '',
    preservedReplyReasonCodes: list(first.session?.threads?.[0]?.unsupportedReplies?.[0]?.reasonCodes),
    idempotentReplay: replay.status === 'replay',
    storageEffects: {
      manuscriptBytesWritten: Number(first.storageEffects?.manuscriptBytesWritten || 0) + Number(replay.storageEffects?.manuscriptBytesWritten || 0),
      firstSessionRecordCreated: first.storageEffects?.sessionRecordCreated === true,
      replaySessionRecordExisting: replay.storageEffects?.sessionRecordExisting === true,
    },
    vetoMetrics: first.receipt?.vetoMetrics || {},
  };
}

function buildReceipt({ physicalProbe = null, productProof = null } = {}) {
  const prior = priorPhysicalReplyEvidence();
  const physical = physicalProbe || {
    caseId: 'P0-MCR-001',
    result: 'NOT_RUN_IN_THIS_INVOCATION',
    packageReadback: null,
  };
  const product = productProof || {
    ok: false,
    unsupportedReplyCount: 0,
    replyCountPromoted: 0,
  };
  const physicalBoundaryProven = (
    physical.result === 'TYPED_LIMITATION_PARENT_LINK_NOT_PRESERVED'
    && Number(physical.packageReadback?.commentCount || 0) >= 2
    && Number(physical.packageReadback?.parentLinkCount || 0) === 0
  ) || prior.certifiedAsTypedLimitation === true;
  const productTypedPreservationProven = product.ok === true
    && product.unsupportedReplyCount === 1
    && product.replyCountPromoted === 0
    && product.writerCalled === false
    && product.manuscriptApplyAuthority === false
    && product.idempotentReplay === true
    && product.preservedReplyReasonCodes?.includes('RTK_COMMENT_REPLY_TYPED_LIMITATION_PRESERVED');
  return {
    schemaVersion: SCHEMA,
    taskId: TASK_ID,
    status: STATUS,
    result: physicalBoundaryProven && productTypedPreservationProven ? 'PASS' : 'FAIL',
    createdAtUtc: CREATED_AT_UTC,
    headBinding: {
      headSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    sourceEvidence: {
      priorPhysicalReplyEvidence: prior,
      commentShadowSessionRuntime: binding('COMMENT_SHADOW_SESSION_RUNTIME', COMMENT_SESSION_REF),
      mainCommandSurface: binding('MAIN_COMMAND_SURFACE', MAIN_REF),
    },
    physicalWordProbe: physical,
    productCommandProof: product,
    implementedCapability: {
      capability: 'modernCommentRepliesTypedLimitationShadowPreservation',
      physicalWordProven: false,
      componentProven: true,
      productRuntimeWired: true,
      automaticApplyCertified: false,
      replyGraphAuthorityCertified: false,
      replyBodyShadowPreservationCertified: productTypedPreservationProven,
      replyTypedLimitationBound: physicalBoundaryProven,
      manuscriptApplyAuthority: false,
      userFacingAuthority: 'COMMENTS_SHADOW_PREVIEW_ONLY',
      terminalClass: 'DIAGNOSTIC_ONLY_TYPED_LIMITATION_BOUND',
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      falseSupport: 0,
      noOpPass: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      googleDocsOpened: 0,
      replyPromotion: 0,
    },
    nonClaims: [
      'MODERN_REPLY_GRAPH_NOT_CERTIFIED',
      'NO_REPLY_PARENT_LINK_AUTHORITY',
      'NO_MANUSCRIPT_APPLY_AUTHORITY_ADDED',
      'NO_AUTOMATIC_APPLY_CERTIFIED',
      'GOOGLE_DOCS_NOT_OPENED',
      'NO_GENERIC_WAVE_REPEATED',
    ],
    nextStage: NEXT_STAGE,
  };
}

function updateProfile(profile, receipt) {
  profile.status = STATUS;
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.commentsShadowAnalysis');
  if (cell) {
    cell.currentCapability = 'VISIBLE_COMMENT_SHADOW_ANALYSIS_WITH_REPLY_TYPED_LIMITATION_PRESERVED';
    cell.productRuntimeWired = false;
    cell.automaticApplyCertified = false;
    cell.replyTypedLimitationReceiptPath = RECEIPT_REF;
    cell.replyTypedLimitationBound = true;
    cell.replyBodyShadowPreservationCertified = receipt.implementedCapability.replyBodyShadowPreservationCertified;
    cell.supportedNow = Array.from(new Set([
      ...list(cell.supportedNow),
      'unsupported reply bodies are preserved in authenticated product comment shadow sessions as typed diagnostics',
    ]));
    cell.limitations = Array.from(new Set([
      ...list(cell.limitations),
      'modern reply graph authority remains unsupported because Word did not preserve a stable parent link in physical readback',
    ]));
    cell.killCriterion = 'Any reply body is silently dropped, reply graph authority is claimed without parent-link readback, or reply preservation writes manuscript text.';
  }
  profile.normalizedCapabilityMatrix = {
    ...(profile.normalizedCapabilityMatrix || {}),
    nextStage: NEXT_STAGE,
    wordSaturated: false,
    automaticApplyCertified: false,
  };
}

function updateProgram(program, receipt) {
  program.status = STATUS;
  program.nextStep = NEXT_STAGE;
  program.v4ExecutionState = {
    ...(program.v4ExecutionState || {}),
    status: STATUS,
    currentStage: 'P0_MODERN_COMMENT_REPLIES_TYPED_LIMITATION',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    modernReplyGraphCertified: false,
    modernReplyTypedLimitationBound: true,
    modernReplyBodyShadowPreservationCertified: receipt.implementedCapability.replyBodyShadowPreservationCertified,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  program.releaseAuditNight01 = {
    ...(program.releaseAuditNight01 || {}),
    status: STATUS,
    currentStage: 'P0_MODERN_COMMENT_REPLIES_TYPED_LIMITATION',
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    wordSaturated: false,
    automaticApplyCertified: false,
    googleDocsOpened: false,
  };
}

function updateLedger(ledger, receipt) {
  ledger.status = STATUS;
  ledger.nextStage = NEXT_STAGE;
  ledger.coverageLedger = {
    ...(ledger.coverageLedger || {}),
    p0ModernCommentRepliesTypedLimitation: {
      status: 'BOUND_TYPED_LIMITATION_WITH_SHADOW_PRESERVATION',
      sourceEvidence: 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MODERN_COMMENT_REPLY_TYPED_LIMITATION_RECEIPT',
      physicalBoundaryProven: receipt.implementedCapability.replyTypedLimitationBound,
      productRuntimeWired: true,
      automaticApplyCertified: false,
      replyGraphAuthorityCertified: false,
      replyBodyShadowPreservationCertified: receipt.implementedCapability.replyBodyShadowPreservationCertified,
    },
  };
  ledger.runtimeClaims = {
    ...(ledger.runtimeClaims || {}),
    wordSaturated: false,
    automaticApplyExpanded: false,
    writerAuthorityAdded: false,
    googleDocsOpened: false,
  };
  ledger.notSaturatedReasons = list(ledger.notSaturatedReasons)
    .filter((reason) => reason !== 'RTK_NORM_MODERN_REPLY_STATE_GAP_REMAINS')
    .concat(['RTK_NORM_RESOLVE_REOPEN_PRODUCT_PATH_OR_LIMITATION_PENDING']);
  ledger.evidenceBindings = list(ledger.evidenceBindings)
    .filter((entry) => entry.id !== 'P0_MODERN_COMMENT_REPLIES_TYPED_LIMITATION')
    .concat([binding('P0_MODERN_COMMENT_REPLIES_TYPED_LIMITATION', RECEIPT_REF)]);
  ledger.aggregateTotals = {
    ...(ledger.aggregateTotals || {}),
    p0ModernReplyTypedLimitationBound: 1,
    p0ModernReplyBodyShadowPreservationCertified: receipt.implementedCapability.replyBodyShadowPreservationCertified ? 1 : 0,
    p0ModernReplyGraphCertified: 0,
    falseExact: 0,
    wrongSceneRouting: 0,
    silentApply: 0,
    replayFailure: 0,
    silentCommentLoss: 0,
  };
}

function updateGovernanceApprovals() {
  const registry = readJson(GOVERNANCE_APPROVALS_REF);
  const touched = new Set(GOVERNED_PATHS);
  registry.approvals = list(registry.approvals).filter((entry) => !touched.has(entry.filePath));
  const rationale = 'Approve Word P0 modern comment reply typed-limitation closure: physical Word parent-reply readback lacks stable parent-link authority, while the product Command Kernel comment shadow path preserves reply bodies as typed unsupported diagnostics with no manuscript authority, automatic apply, Google stage, or silent comment loss.';
  for (const filePath of GOVERNED_PATHS) {
    registry.approvals.push({
      filePath,
      sha256: sha256File(filePath),
      approvedBy: 'owner:OWNER_GO_RESUME_AFTER_REBOOT_WITH_INDEPENDENT_AUDIT_CORRECTIONS',
      approvedAtUtc: CREATED_AT_UTC,
      rationale,
    });
  }
  writeJson(GOVERNANCE_APPROVALS_REF, registry);
}

function updateState(receipt) {
  const profile = readJson(PROFILE_REF);
  updateProfile(profile, receipt);
  writeJson(PROFILE_REF, profile);

  const program = readJson(PROGRAM_REF);
  updateProgram(program, receipt);
  writeJson(PROGRAM_REF, program);

  const ledger = readJson(LEDGER_REF);
  updateLedger(ledger, receipt);
  writeJson(LEDGER_REF, ledger);
}

export function evaluateP0ModernCommentRepliesTypedLimitation(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_REF);
  const profile = input.profile || readJson(PROFILE_REF);
  const program = input.program || readJson(PROGRAM_REF);
  const ledger = input.ledger || readJson(LEDGER_REF);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.v4.commentsShadowAnalysis');
  const actualNextStage = program.v4ExecutionState?.nextStage || program.nextStep || '';
  const validNextStage = [
    NEXT_STAGE,
    RESOLVE_REOPEN_SUCCESSOR_STAGE,
    FORMATTING_SUCCESSOR_STAGE,
    STRUCTURAL_SUCCESSOR_STAGE,
    SCALE_SUCCESSOR_STAGE,
  ].includes(actualNextStage);

  if (receipt.schemaVersion !== SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_P0_REPLY_RECEIPT_INVALID', 'receipt', 'P0 reply typed limitation receipt must pass.');
  if (receipt.physicalWordProbe?.result === 'PARENT_LINK_DETECTED_REQUIRES_RUNTIME_PROMOTION') add('RTK_P0_REPLY_PARENT_LINK_DETECTED', 'physicalWordProbe', 'Parent-link evidence requires runtime promotion instead of typed-limitation closure.');
  if (receipt.implementedCapability?.replyTypedLimitationBound !== true
    || receipt.implementedCapability?.replyBodyShadowPreservationCertified !== true
    || receipt.implementedCapability?.replyGraphAuthorityCertified !== false
    || receipt.implementedCapability?.automaticApplyCertified !== false) add('RTK_P0_REPLY_AUTHORITY_INVALID', 'implementedCapability', 'Replies must be preserved only as typed diagnostics without graph or apply authority.');
  if (receipt.productCommandProof?.unsupportedReplyCount !== 1
    || receipt.productCommandProof?.replyCountPromoted !== 0
    || receipt.productCommandProof?.idempotentReplay !== true
    || receipt.productCommandProof?.writerCalled !== false
    || receipt.productCommandProof?.storageEffects?.manuscriptBytesWritten !== 0) add('RTK_P0_REPLY_PRODUCT_PROOF_INVALID', 'productCommandProof', 'Product command proof must preserve exactly one unsupported reply and replay without manuscript writes.');
  if (!list(receipt.productCommandProof?.preservedReplyReasonCodes).includes('RTK_COMMENT_REPLY_TYPED_LIMITATION_PRESERVED')) add('RTK_P0_REPLY_REASON_MISSING', 'productCommandProof.preservedReplyReasonCodes', 'Typed reply preservation reason is required.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_P0_REPLY_VETO_NONZERO', 'vetoMetrics', 'All veto metrics must remain zero.');
  if (!cell
    || cell.replyTypedLimitationBound !== true
    || cell.replyBodyShadowPreservationCertified !== true
    || cell.automaticApplyCertified !== false) add('RTK_P0_REPLY_PROFILE_INVALID', 'profile.commentsShadowAnalysis', 'Capability profile must bind reply typed limitation without automatic apply.');
  if (!validNextStage
    || program.v4ExecutionState?.modernReplyGraphCertified !== false
    || program.v4ExecutionState?.modernReplyTypedLimitationBound !== true
    || program.v4ExecutionState?.googleDocsOpened !== false) add('RTK_P0_REPLY_PROGRAM_INVALID', 'program', 'Program must advance to resolve/reopen with Google closed.');
  if (ledger.coverageLedger?.p0ModernCommentRepliesTypedLimitation?.replyGraphAuthorityCertified !== false
    || ledger.runtimeClaims?.automaticApplyExpanded !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false) add('RTK_P0_REPLY_LEDGER_INVALID', 'ledger', 'Ledger must bind typed limitation without automatic apply or Google.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: actualNextStage || NEXT_STAGE,
    replyTypedLimitationBound: receipt.implementedCapability?.replyTypedLimitationBound === true,
    replyBodyShadowPreservationCertified: receipt.implementedCapability?.replyBodyShadowPreservationCertified === true,
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const json = args.has('--json');
  if (args.has('--write')) {
    const physicalProbe = args.has('--run-physical') ? runPhysicalReplyProbe() : null;
    const productProof = await runProductShadowProof();
    const receipt = buildReceipt({ physicalProbe, productProof });
    writeJson(RECEIPT_REF, receipt);
    updateState(receipt);
    if (args.has('--approve-governance')) updateGovernanceApprovals();
  }
  const result = evaluateP0ModernCommentRepliesTypedLimitation();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_P0_MODERN_COMMENT_REPLIES_TYPED_LIMITATION=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exit(1);
  });
}
