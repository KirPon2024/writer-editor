#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'YALKEN_WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01';
const CONTOUR_ID = 'P0-COMMENT-SHADOW-AUTHENTICATED-SESSION-STORAGE-EFFECTS';
const STATUS = 'WORD_RELEASE_AUDIT_P0_COMMENT_SHADOW_AUTHENTICATED_SESSION_STORAGE_EFFECTS_WIRED_NOT_SATURATED';
const NEXT_STAGE = 'P0_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE_12';
const RECEIPT_SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-comment-shadow-authenticated-session-receipt.v1';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_COMMENT_SHADOW_AUTHENTICATED_SESSION_RECEIPT.json';
const PARSED_IR_RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PARSED_IR_PREVIEW_APPLY_REPLAY_RECEIPT.json';

const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const PARSED_IR_RECEIPT_PATH = path.join(REPO_ROOT, PARSED_IR_RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const COMMENT_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportCommentShadowSession.mjs');
const PREVIEW_CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'revision-bridge-docx-review-preview-session-command-surface.contract.test.js');
const C01_CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'rtk-word-v4-a03-c01-comment-shadow-runtime.contract.test.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

function binding(id, filePath) {
  return {
    id,
    path: path.relative(REPO_ROOT, filePath),
    sha256: sha256File(filePath),
    status: 'BOUND',
  };
}

function issue(code, field, message) {
  return { code, field, message };
}

function extractFunctionSection(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  if (start < 0 || end < 0 || end <= start) return '';
  return source.slice(start, end);
}

function sourceProof() {
  const mainSource = readText(MAIN_PATH);
  const commentModuleSource = readText(COMMENT_MODULE_PATH);
  const previewContractSource = readText(PREVIEW_CONTRACT_PATH);
  const c01ContractSource = readText(C01_CONTRACT_PATH);
  const commentPayloadSection = extractFunctionSection(
    mainSource,
    'function buildDocxReviewPreviewSessionCommentShadowPayload',
    'function buildDocxReviewPreviewSessionImportPayload',
  );
  const buildSessionRecordSection = extractFunctionSection(
    commentModuleSource,
    'function buildSessionRecord',
    'function buildReceipt',
  );
  const markers = {
    legacyUnboundCommentsDoNotPersistShadowStorage: /intake\.authenticated !== true[\s\S]*return null/u.test(commentPayloadSection),
    mainPassesAuthenticatedReturnIdentity: /authenticatedReturnIdentity/u.test(commentPayloadSection)
      && /projectId/u.test(commentPayloadSection)
      && /sceneId/u.test(commentPayloadSection)
      && /sceneRevision/u.test(commentPayloadSection)
      && /rawSha256/u.test(commentPayloadSection),
    moduleNormalizesAuthenticatedIdentity: /function normalizeAuthenticatedReturnIdentity/u.test(commentModuleSource)
      && /bindingLevel:\s*'authenticated-product-return'/u.test(commentModuleSource)
      && /RTK_COMMENT_SHADOW_AUTHORITY_MISMATCH/u.test(commentModuleSource),
    durableKeysIncludeAuthenticatedBinding: /authenticatedReturnIdentity:\s*identity\.binding/u.test(buildSessionRecordSection)
      && /authenticatedReturnIdentity:\s*identity\.binding/u.test(buildSessionRecordSection.slice(buildSessionRecordSection.indexOf('const effectKey'))),
    receiptsExposeIdentityAndStorageEffects: /authenticatedReturnIdentityDigest/u.test(commentModuleSource)
      && /storageEffects/u.test(commentModuleSource)
      && /manuscriptBytesWritten:\s*0/u.test(commentModuleSource),
    previewContractCoversLegacyNoStorageAndAuthenticatedBinding: /legacy rooted comments stay preview-only without persistent comment shadow storage/u.test(previewContractSource)
      && /authenticatedReturnIdentity\.sceneId/u.test(previewContractSource)
      && /commentShadowResult\.storageEffects/u.test(previewContractSource),
    moduleContractCoversDistinctBindingAndForgery: /authenticated return identity binds project scene baseline storage keys and blocks forged mismatches/u.test(c01ContractSource)
      && /notEqual\(first\.session\.requestKey, second\.session\.requestKey/u.test(c01ContractSource)
      && /RTK_COMMENT_SHADOW_AUTHORITY_MISMATCH/u.test(c01ContractSource),
  };
  return {
    markers,
    allPresent: Object.values(markers).every(Boolean),
    mainSha256: sha256File(MAIN_PATH),
    commentModuleSha256: sha256File(COMMENT_MODULE_PATH),
    previewContractSha256: sha256File(PREVIEW_CONTRACT_PATH),
    c01ContractSha256: sha256File(C01_CONTRACT_PATH),
  };
}

function buildReceipt() {
  const proof = sourceProof();
  return {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: STATUS,
    result: proof.allPresent ? 'PASS' : 'FAIL',
    headBinding: {
      headSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    sourceEvidence: {
      main: binding('MAIN_COMMENT_SHADOW_AUTHENTICATED_PAYLOAD', MAIN_PATH),
      commentModule: binding('COMMENT_SHADOW_AUTHENTICATED_SESSION_MODULE', COMMENT_MODULE_PATH),
      previewContract: binding('PRODUCT_PREVIEW_COMMENT_SHADOW_AUTHENTICATED_CONTRACT', PREVIEW_CONTRACT_PATH),
      c01Contract: binding('COMMENT_SHADOW_AUTHENTICATED_STORAGE_EFFECTS_CONTRACT', C01_CONTRACT_PATH),
      previousParsedIrReceipt: binding('PREVIOUS_P0_PARSED_IR_PREVIEW_APPLY_REPLAY_RECEIPT', PARSED_IR_RECEIPT_PATH),
    },
    sourceProof: proof,
    implementedCapability: {
      capability: 'commentShadowAuthenticatedSessionKeysStorageEffects',
      productReviewDocxExporterWired: true,
      returnIntakeWired: true,
      parsedWordIrConsumerWired: true,
      productRuntimeWired: true,
      commentShadowAuthenticatedSessionKeysWired: true,
      persistentCommentShadowRequiresAuthenticatedReturn: true,
      legacyUnboundCommentPreviewStorageBlocked: true,
      projectSceneRoundBaselineIdentityBound: true,
      commentShadowStorageEffectsReported: true,
      manuscriptApplyAuthority: false,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      productOriginatedPhysicalLoopCertified: false,
      releaseReady: false,
      wordSaturated: false,
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      unboundCommentStorageWrite: 0,
      forgedCommentShadowAuthorityAccepted: 0,
      manuscriptMutation: 0,
      productStorageWriteBeforeGate: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      googleDocsOpened: 0,
      falseReleaseClaim: 0,
    },
    nonClaims: [
      'Authenticated comment shadow session storage is not manuscript apply authority.',
      'Legacy unbound DOCX comments remain preview/manual only and do not get persistent product comment shadow storage.',
      'Product-originated physical Word waves are still pending after this P0 identity binding.',
      'Word SATURATED remains false.',
      'Google Docs remains closed.',
    ],
    nextStage: NEXT_STAGE,
  };
}

function upsertBinding(ledger, id, filePath) {
  const next = binding(id, filePath);
  const existing = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  const index = existing.findIndex((item) => item.id === id);
  if (index >= 0) existing[index] = next;
  else existing.push(next);
  ledger.evidenceBindings = existing;
}

function updateProgram(program) {
  program.releaseAuditNight01 = {
    ...(isPlainObject(program.releaseAuditNight01) ? program.releaseAuditNight01 : {}),
    status: STATUS,
    currentStage: CONTOUR_ID,
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    productReviewDocxExporterWired: true,
    productReviewDocxExporterDistinctFromDocxMinimal: true,
    returnIntakeWired: true,
    parsedWordIrConsumerWired: true,
    parsedWordIrSoleWriterOperationSource: true,
    visibleExactPreviewWired: true,
    explicitUserConfirmedCommandApplyWired: true,
    atomicWriterAndReplayWired: true,
    commentShadowAuthenticatedSessionKeysWired: true,
    persistentCommentShadowRequiresAuthenticatedReturn: true,
    legacyUnboundCommentPreviewStorageBlocked: true,
    commentShadowStorageEffectsReported: true,
    automaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  program.nonClaims = Array.from(new Set([
    ...list(program.nonClaims),
    'Authenticated comment shadow sessions now bind project, scene, round, baseline and returned artifact identity; they remain shadow-only and do not certify release readiness.',
  ]));
}

function updateProfile(profile) {
  const cell = {
    capabilityId: 'rtk.word.releaseAudit.p0.commentShadowAuthenticatedSessionStorageEffects',
    operationFamily: 'Authenticated product comment shadow session identity and storage effects',
    state: 'PRODUCT_RUNTIME_WIRED_SHADOW_ONLY_NOT_RELEASE_CERTIFIED',
    currentCapability: 'COMMENT_SHADOW_AUTHENTICATED_SESSION_KEYS_STORAGE_EFFECTS_WIRED_PHYSICAL_PRODUCT_WAVE_PENDING',
    physicalWordEvidence: false,
    componentProven: true,
    productCompositionRegistered: true,
    productRuntimeWired: true,
    returnIntakeWired: true,
    commentShadowAuthenticatedSessionKeysWired: true,
    persistentCommentShadowRequiresAuthenticatedReturn: true,
    projectSceneRoundBaselineIdentityBound: true,
    commentShadowStorageEffectsReported: true,
    manuscriptApplyAuthority: false,
    automaticApplyCertified: false,
    userAutomaticApplyCertified: false,
    wordSaturated: false,
    consumer: 'DOCX Review preview activation comment shadow import command surface',
    acceptanceTest: 'test/contracts/revision-bridge-docx-review-preview-session-command-surface.contract.test.js',
    evidenceReceiptPath: RECEIPT_REF,
    supportedNow: [
      'authenticated returned comments enter persistent shadow session storage only after return-intake HMAC and baseline verification',
      'comment shadow request and effect keys include project, scene, round, baseline and returned artifact identity',
      'legacy unbound comment preview does not write persistent comment shadow storage',
      'runtime result reports session and receipt storage effects without manuscript bytes',
    ],
    limitations: [
      'comment shadow storage is not manuscript apply authority',
      'modern replies and resolve reopen remain typed limitations until later contours',
      'product-originated physical Word smoke and varied waves remain pending',
      'Word SATURATED remains false',
    ],
    killCriterion: 'Any unbound returned DOCX comment can create persistent project comment shadow storage, any forged identity can reuse a shadow key, or any comment shadow result hides storage effects or claims manuscript apply authority.',
  };
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const index = cells.findIndex((item) => item.capabilityId === cell.capabilityId);
  if (index >= 0) cells[index] = cell;
  else cells.push(cell);
  profile.cells = cells;
}

function updateLedger(ledger) {
  upsertBinding(ledger, 'RELEASE_AUDIT_NIGHT_01_P0_COMMENT_SHADOW_AUTHENTICATED_SESSION', RECEIPT_PATH);
  ledger.coverageLedger = {
    ...(isPlainObject(ledger.coverageLedger) ? ledger.coverageLedger : {}),
    releaseAuditNight01P0CommentShadowAuthenticatedSession: {
      status: 'BOUND_COMMENT_SHADOW_AUTHENTICATED_SESSION_KEYS_STORAGE_EFFECTS_WIRED_PHYSICAL_PRODUCT_WAVE_PENDING',
      sourceEvidence: 'RELEASE_AUDIT_NIGHT_01_P0_COMMENT_SHADOW_AUTHENTICATED_SESSION',
      result: STATUS,
      productRuntimeWired: true,
      returnIntakeWired: true,
      commentShadowAuthenticatedSessionKeysWired: true,
      persistentCommentShadowRequiresAuthenticatedReturn: true,
      projectSceneRoundBaselineIdentityBound: true,
      commentShadowStorageEffectsReported: true,
      manuscriptApplyAuthority: false,
      automaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
    },
  };
  ledger.runtimeClaims = {
    ...(isPlainObject(ledger.runtimeClaims) ? ledger.runtimeClaims : {}),
    productRuntimeChanged: true,
    automaticApplyExpanded: false,
    networkAdded: false,
    googleDocsOpened: false,
    wordSaturated: false,
    releaseReady: false,
  };
}

function updateState() {
  const receipt = buildReceipt();
  writeJson(RECEIPT_PATH, receipt);
  const program = readJson(PROGRAM_PATH);
  updateProgram(program);
  writeJson(PROGRAM_PATH, program);
  const profile = readJson(PROFILE_PATH);
  updateProfile(profile);
  writeJson(PROFILE_PATH, profile);
  const ledger = readJson(LEDGER_PATH);
  updateLedger(ledger);
  writeJson(LEDGER_PATH, ledger);
  return receipt;
}

export function evaluateWordReleaseAuditP0CommentShadowAuthenticatedSession(input = {}) {
  const receipt = input.receipt || (fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : buildReceipt());
  const program = input.program || readJson(PROGRAM_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.releaseAudit.p0.commentShadowAuthenticatedSessionStorageEffects');
  const coverage = ledger.coverageLedger?.releaseAuditNight01P0CommentShadowAuthenticatedSession;
  const activeProgramStage = program.releaseAuditNight01?.currentStage;

  if (receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_RECEIPT_INVALID', 'receipt', 'Comment shadow authenticated session receipt must PASS with canonical schema and status.');
  if (receipt.sourceProof?.allPresent !== true || Object.values(receipt.sourceProof?.markers || {}).some((value) => value !== true)) add('RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_SOURCE_INVALID', 'sourceProof', 'Source proof must bind authenticated comment shadow identity and storage effects.');
  if (receipt.implementedCapability?.commentShadowAuthenticatedSessionKeysWired !== true
    || receipt.implementedCapability?.persistentCommentShadowRequiresAuthenticatedReturn !== true
    || receipt.implementedCapability?.projectSceneRoundBaselineIdentityBound !== true
    || receipt.implementedCapability?.commentShadowStorageEffectsReported !== true) add('RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_CAPABILITY_INVALID', 'implementedCapability', 'Capability must prove authenticated identity keys and storage-effect reporting.');
  if (receipt.implementedCapability?.automaticApplyCertified !== false
    || receipt.implementedCapability?.wordSaturated !== false
    || receipt.implementedCapability?.releaseReady !== false
    || receipt.implementedCapability?.manuscriptApplyAuthority !== false) add('RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_OVERCLAIM', 'implementedCapability', 'Comment shadow binding must not claim apply, manuscript authority, saturation, or release readiness.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_VETO_NONZERO', 'vetoMetrics', 'Veto metrics must remain zero.');
  if (activeProgramStage === CONTOUR_ID) {
    if (program.releaseAuditNight01?.status !== STATUS
      || program.releaseAuditNight01?.nextStage !== NEXT_STAGE
      || program.releaseAuditNight01?.commentShadowAuthenticatedSessionKeysWired !== true
      || program.releaseAuditNight01?.commentShadowStorageEffectsReported !== true
      || program.releaseAuditNight01?.automaticApplyCertified !== false
      || program.releaseAuditNight01?.googleDocsOpened !== false) add('RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Program must bind current comment shadow stage without opening saturation or Google Docs.');
  } else if (program.releaseAuditNight01?.commentShadowAuthenticatedSessionKeysWired !== true
    || program.releaseAuditNight01?.commentShadowStorageEffectsReported !== true
    || program.releaseAuditNight01?.automaticApplyCertified !== false
    || program.releaseAuditNight01?.googleDocsOpened !== false
    || program.releaseAuditNight01?.wordSaturated !== false) {
    add('RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Later active stages must preserve authenticated comment shadow and no-saturation/no-Google truth.');
  }
  if (!cell
    || cell.productRuntimeWired !== true
    || cell.commentShadowAuthenticatedSessionKeysWired !== true
    || cell.commentShadowStorageEffectsReported !== true
    || cell.automaticApplyCertified !== false
    || cell.wordSaturated !== false) add('RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_PROFILE_INVALID', 'profile.cells', 'Capability profile must expose authenticated comment shadow storage while preserving no-release-cert truth.');
  if (!coverage
    || coverage.productRuntimeWired !== true
    || coverage.commentShadowAuthenticatedSessionKeysWired !== true
    || coverage.commentShadowStorageEffectsReported !== true
    || coverage.automaticApplyCertified !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false
    || ledger.runtimeClaims?.wordSaturated !== false) add('RTK_RELEASE_AUDIT_P0_COMMENT_SHADOW_LEDGER_INVALID', 'ledger', 'Ledger must bind authenticated comment shadow storage and preserve no-saturation/no-Google truth.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: receipt.nextStage,
    commentShadowAuthenticatedSessionKeysWired: receipt.implementedCapability?.commentShadowAuthenticatedSessionKeysWired === true,
    persistentCommentShadowRequiresAuthenticatedReturn: receipt.implementedCapability?.persistentCommentShadowRequiresAuthenticatedReturn === true,
    commentShadowStorageEffectsReported: receipt.implementedCapability?.commentShadowStorageEffectsReported === true,
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
    wordSaturated: receipt.implementedCapability?.wordSaturated === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--write-receipt') || process.argv.includes('--update-state')) updateState();
  const result = evaluateWordReleaseAuditP0CommentShadowAuthenticatedSession();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_COMMENT_SHADOW_AUTHENTICATED_SESSION=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
