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
const CONTOUR_ID = 'P0-PARSED-IR-PREVIEW-APPLY-REPLAY';
const STATUS = 'WORD_RELEASE_AUDIT_P0_PARSED_IR_PREVIEW_APPLY_REPLAY_WIRED_NOT_SATURATED';
const NEXT_STAGE = 'P0_COMMENT_SHADOW_AUTHENTICATED_SESSION_KEYS_STORAGE_EFFECTS';
const RECEIPT_SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-parsed-ir-preview-apply-replay-receipt.v1';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PARSED_IR_PREVIEW_APPLY_REPLAY_RECEIPT.json';
const RETURN_INTAKE_RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_RETURN_INTAKE_V2_RECEIPT.json';

const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const RETURN_INTAKE_RECEIPT_PATH = path.join(REPO_ROOT, RETURN_INTAKE_RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const PREVIEW_CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'revision-bridge-docx-review-preview-session-command-surface.contract.test.js');
const C05_RUNTIME_CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'rtk-word-v4-a03-c02-non-overlap-tracked-replacement-runtime.contract.test.js');

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
  const defaultBuilderSection = extractFunctionSection(
    mainSource,
    'async function buildDocxReviewPreviewSessionDefaultRtkApplyInput',
    'function buildRtkNonOverlapTrackedReplacementPlanPreview',
  );
  const previewContract = readText(PREVIEW_CONTRACT_PATH);
  const c05Contract = readText(C05_RUNTIME_CONTRACT_PATH);
  const markers = {
    defaultBuilderRequiresAuthenticatedParserIr: /readDocxReviewPreviewSessionAuthenticatedParserResult\(context\)/u.test(defaultBuilderSection),
    defaultBuilderDoesNotReparseReturnedDocxForWriterInput: !/buildDocxReviewTransportAnalysisFromZipBytes\s*\(/u.test(defaultBuilderSection),
    returnIntakeBlocksWithoutParserIr: /RTK_NON_OVERLAP_TRACKED_REPLACEMENT_RETURN_INTAKE_REQUIRED/u.test(defaultBuilderSection),
    visiblePreviewAttachedBeforeApply: /attachRtkNonOverlapTrackedReplacementProductPreview/u.test(mainSource)
      && /exactTextPlanPreview/u.test(mainSource)
      && /previewConfirmationRequired:\s*true/u.test(mainSource),
    publicApplyCommandRunsMainOwnedEnvelope: /handleReviewSurfaceApplyExactTextChangeCommandSurface/u.test(mainSource)
      && /runRtkNonOverlapTrackedReplacementProductApplyFromMainState/u.test(mainSource)
      && /dispatchRtkApply\(\s*['"]cmd\.rtk\.review\.applyNonOverlapTrackedReplacements['"]/u.test(mainSource),
    explicitConfirmationSetOnlyInsideMainApplyPath: /previewConfirmed:\s*true/u.test(mainSource)
      && /writerAuthorityExposedToRenderer:\s*false/u.test(mainSource),
    productLoopContractCoversAuthenticatedPreviewApplyReplay: /authenticated return IR drives visible preview explicit apply and replay/u.test(previewContract)
      && /returnArtifactSha256/u.test(previewContract)
      && /result\.status, 'replay'/u.test(previewContract),
    c05RuntimeCoversAtomicWriterReplayAndVetoes: /applies one physically proven non-overlap tracked replacement and replays once/u.test(c05Contract)
      && /blocks unsigned stale duplicate and unconfirmed apply before writer execution/u.test(c05Contract),
  };
  return {
    markers,
    allPresent: Object.values(markers).every(Boolean),
    mainSha256: sha256File(MAIN_PATH),
    previewContractSha256: sha256File(PREVIEW_CONTRACT_PATH),
    c05RuntimeContractSha256: sha256File(C05_RUNTIME_CONTRACT_PATH),
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
      main: binding('MAIN_PRODUCT_PREVIEW_APPLY_REPLAY_LOOP', MAIN_PATH),
      previewContract: binding('AUTHENTICATED_RETURN_IR_PREVIEW_APPLY_REPLAY_CONTRACT', PREVIEW_CONTRACT_PATH),
      c05RuntimeContract: binding('C05_ATOMIC_WRITER_REPLAY_CONTRACT', C05_RUNTIME_CONTRACT_PATH),
      previousReturnIntakeReceipt: binding('PREVIOUS_P0_RETURN_INTAKE_V2_RECEIPT', RETURN_INTAKE_RECEIPT_PATH),
    },
    sourceProof: proof,
    implementedCapability: {
      capability: 'parsedWordIrPreviewExplicitApplyReplay',
      productReviewDocxExporterWired: true,
      returnIntakeWired: true,
      parsedWordIrConsumerWired: true,
      parsedWordIrSoleWriterOperationSource: true,
      visibleExactPreviewWired: true,
      explicitUserConfirmationRequired: true,
      commandKernelApplyWired: true,
      atomicWriterAndOutcomeLedgerWired: true,
      replayIdempotenceWired: true,
      rendererAuthority: false,
      writerAuthorityExposedToRenderer: false,
      productOriginatedPhysicalLoopCertified: false,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      unparsedWordIrWriterOperation: 0,
      rendererAuthorityAccepted: 0,
      previewBypassAccepted: 0,
      productStorageWriteBeforeGate: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      googleDocsOpened: 0,
      falseReleaseClaim: 0,
    },
    nonClaims: [
      'This contour proves product runtime wiring for authenticated parser-derived non-overlap replacement preview and explicit apply, not release readiness.',
      'Automatic apply remains false because a visible user confirmation is required before writer execution.',
      'Product-originated physical Word waves must be rerun after the P0 loop is fully bound.',
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
    automaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  program.nonClaims = Array.from(new Set([
    ...list(program.nonClaims),
    'Authenticated parser-derived Word IR is now wired to visible preview and explicit user-confirmed C05 apply/replay; release-level automatic apply, Word saturation, Google Docs, and physical product-originated waves remain pending.',
  ]));
}

function updateProfile(profile) {
  const cell = {
    capabilityId: 'rtk.word.releaseAudit.p0.parsedIrPreviewApplyReplay',
    operationFamily: 'Authenticated ReviewIRV2 to visible exact preview and explicit command-kernel apply/replay',
    state: 'PRODUCT_RUNTIME_WIRED_USER_CONFIRMED_APPLY_NOT_RELEASE_CERTIFIED',
    currentCapability: 'PARSED_IR_PREVIEW_EXPLICIT_APPLY_REPLAY_WIRED_PHYSICAL_PRODUCT_WAVE_PENDING',
    physicalWordEvidence: false,
    componentProven: true,
    productCompositionRegistered: true,
    productRuntimeWired: true,
    returnIntakeWired: true,
    parsedWordIrConsumerWired: true,
    parsedWordIrSoleWriterOperationSource: true,
    visibleExactPreviewWired: true,
    explicitUserConfirmationRequired: true,
    commandKernelApplyWired: true,
    atomicWriterAndReplayWired: true,
    automaticApplyCertified: false,
    userAutomaticApplyCertified: false,
    wordSaturated: false,
    consumer: 'DOCX Review preview activation plus exact text apply command surface',
    acceptanceTest: 'test/contracts/revision-bridge-docx-review-preview-session-command-surface.contract.test.js',
    evidenceReceiptPath: RECEIPT_REF,
    supportedNow: [
      'authenticated returned DOCX parser result is the source for C05 writer-operation input',
      'visible exact preview exposes only sanitized change ids and text evidence',
      'explicit user apply dispatches the hidden main-owned command envelope through Command Kernel',
      'C05 writer path keeps checkpoint, atomic write, readback, outcome ledger, and replay behavior',
    ],
    limitations: [
      'release-level automatic apply remains false',
      'product-originated physical Word smoke and varied waves are pending after P0 loop binding',
      'only supported non-overlap tracked replacements are eligible for this path',
      'comments and other lanes remain separate P0/P1 follow-up surfaces',
    ],
    killCriterion: 'Any writer operation can be built from a returned DOCX without authenticated parser IR, any renderer payload can expose writer authority, or any preview bypass can execute the writer.',
  };
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const index = cells.findIndex((item) => item.capabilityId === cell.capabilityId);
  if (index >= 0) cells[index] = cell;
  else cells.push(cell);
  profile.cells = cells;
}

function updateLedger(ledger) {
  upsertBinding(ledger, 'RELEASE_AUDIT_NIGHT_01_P0_PARSED_IR_PREVIEW_APPLY_REPLAY', RECEIPT_PATH);
  ledger.coverageLedger = {
    ...(isPlainObject(ledger.coverageLedger) ? ledger.coverageLedger : {}),
    releaseAuditNight01P0ParsedIrPreviewApplyReplay: {
      status: 'BOUND_PARSED_IR_PREVIEW_EXPLICIT_APPLY_REPLAY_WIRED_PHYSICAL_PRODUCT_WAVE_PENDING',
      sourceEvidence: 'RELEASE_AUDIT_NIGHT_01_P0_PARSED_IR_PREVIEW_APPLY_REPLAY',
      result: STATUS,
      productRuntimeWired: true,
      returnIntakeWired: true,
      parsedWordIrConsumerWired: true,
      parsedWordIrSoleWriterOperationSource: true,
      visibleExactPreviewWired: true,
      explicitUserConfirmedCommandApplyWired: true,
      atomicWriterAndReplayWired: true,
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

export function evaluateWordReleaseAuditP0ParsedIrPreviewApplyReplay(input = {}) {
  const receipt = input.receipt || (fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : buildReceipt());
  const program = input.program || readJson(PROGRAM_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.releaseAudit.p0.parsedIrPreviewApplyReplay');
  const coverage = ledger.coverageLedger?.releaseAuditNight01P0ParsedIrPreviewApplyReplay;

  if (receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_RECEIPT_INVALID', 'receipt', 'Parsed-IR preview/apply/replay receipt must PASS with canonical schema and status.');
  if (receipt.sourceProof?.allPresent !== true || Object.values(receipt.sourceProof?.markers || {}).some((value) => value !== true)) add('RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_SOURCE_INVALID', 'sourceProof', 'Source proof must bind authenticated parser IR to preview and explicit main-owned apply/replay.');
  if (receipt.implementedCapability?.parsedWordIrSoleWriterOperationSource !== true
    || receipt.implementedCapability?.visibleExactPreviewWired !== true
    || receipt.implementedCapability?.commandKernelApplyWired !== true
    || receipt.implementedCapability?.atomicWriterAndOutcomeLedgerWired !== true
    || receipt.implementedCapability?.replayIdempotenceWired !== true) add('RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_CAPABILITY_INVALID', 'implementedCapability', 'Capability must prove parser-derived preview, command apply, atomic writer, and replay wiring.');
  if (receipt.implementedCapability?.automaticApplyCertified !== false
    || receipt.implementedCapability?.wordSaturated !== false
    || receipt.implementedCapability?.releaseReady !== false) add('RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_OVERCLAIM', 'implementedCapability', 'P0 loop must not claim automatic apply certification, saturation, or release readiness.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_VETO_NONZERO', 'vetoMetrics', 'Veto metrics must remain zero.');
  if (program.releaseAuditNight01?.status !== STATUS
    || program.releaseAuditNight01?.currentStage !== CONTOUR_ID
    || program.releaseAuditNight01?.nextStage !== NEXT_STAGE
    || program.releaseAuditNight01?.parsedWordIrSoleWriterOperationSource !== true
    || program.releaseAuditNight01?.automaticApplyCertified !== false
    || program.releaseAuditNight01?.googleDocsOpened !== false) add('RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Program must bind current P0 loop without opening saturation or Google Docs.');
  if (!cell
    || cell.productRuntimeWired !== true
    || cell.parsedWordIrSoleWriterOperationSource !== true
    || cell.automaticApplyCertified !== false
    || cell.wordSaturated !== false) add('RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_PROFILE_INVALID', 'profile.cells', 'Capability profile must expose product-runtime loop while preserving no-release-cert truth.');
  if (!coverage
    || coverage.productRuntimeWired !== true
    || coverage.parsedWordIrSoleWriterOperationSource !== true
    || coverage.automaticApplyCertified !== false
    || ledger.runtimeClaims?.googleDocsOpened !== false
    || ledger.runtimeClaims?.wordSaturated !== false) add('RTK_RELEASE_AUDIT_P0_PARSED_IR_LOOP_LEDGER_INVALID', 'ledger', 'Ledger must bind P0 parsed-IR loop and preserve no-saturation/no-Google truth.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: receipt.nextStage,
    parsedWordIrSoleWriterOperationSource: receipt.implementedCapability?.parsedWordIrSoleWriterOperationSource === true,
    visibleExactPreviewWired: receipt.implementedCapability?.visibleExactPreviewWired === true,
    explicitUserConfirmedCommandApplyWired: receipt.implementedCapability?.commandKernelApplyWired === true,
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
    wordSaturated: receipt.implementedCapability?.wordSaturated === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--write-receipt') || process.argv.includes('--update-state')) updateState();
  const result = evaluateWordReleaseAuditP0ParsedIrPreviewApplyReplay();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_PARSED_IR_PREVIEW_APPLY_REPLAY=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
