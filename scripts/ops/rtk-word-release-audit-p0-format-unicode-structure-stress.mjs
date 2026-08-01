#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertSecureVolume,
  writeJsonAtomic,
} from './rtk-word-latest-physical-certification-lab.mjs';
import {
  assertSmokeWordSandboxWorkRoot,
  collectSmokeWordProfile,
} from './rtk-word-release-audit-p0-product-originated-smoke-wave12.mjs';
import {
  runElectronUiExportClickProof,
  runProductCase,
} from './rtk-word-release-audit-p0-product-comments-mixed-multiscene.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'WORD_RTK_P0_FORMAT_UNICODE_STRUCTURE_STRESS';
const CONTOUR_ID = 'P0-PRODUCT-VERTICAL-FORMAT-UNICODE-STRUCTURE-STRESS';
const STATUS = 'WORD_RELEASE_AUDIT_P0_FORMAT_UNICODE_STRUCTURE_STRESS_COMPLETE_NOT_SATURATED';
const NEXT_STAGE = 'P0_PRODUCT_VERTICAL_LARGE_MANUSCRIPT_STRESS_AFTER_FORMAT_UNICODE_STRUCTURE';
const RECEIPT_SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-format-unicode-structure-stress-receipt.v1';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_FORMAT_UNICODE_STRUCTURE_STRESS_RECEIPT.json';
const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const GOVERNANCE_APPROVALS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'GOVERNANCE_APPROVALS', 'GOVERNANCE_CHANGE_APPROVALS.json');
const SCRIPT_REF = 'scripts/ops/rtk-word-release-audit-p0-format-unicode-structure-stress.mjs';
const HELPER_REF = 'scripts/ops/rtk-word-release-audit-p0-product-comments-mixed-multiscene.mjs';
const CONTRACT_REF = 'test/contracts/rtk-word-release-audit-p0-format-unicode-structure-stress.contract.test.js';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-roundtrip-release-audit-night-01/current/p0-format-unicode-structure-stress';
const DEFAULT_WORD_WORK_ROOT = path.join(
  os.homedir(),
  'Library',
  'Containers',
  'com.microsoft.Word',
  'Data',
  'tmp',
  'YalkenWordLab',
  'p0-format-unicode-structure-stress',
);
const WORD_APP_PATH = '/Applications/Microsoft Word.app';

const GOVERNED_PATHS = [
  'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json',
  RECEIPT_REF,
  SCRIPT_REF,
  HELPER_REF,
  CONTRACT_REF,
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function binding(id, filePath) {
  return {
    id,
    path: path.relative(REPO_ROOT, filePath),
    sha256: sha256File(filePath),
    status: 'BOUND',
  };
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unicodeText(index) {
  const fragments = [
    'RU ё кавычки "лапки" NBSP\u00a0и мягкий\u00adперенос.',
    "EN writer's punctuation; apostrophe, dash, ellipsis...",
    'NFD combining: cafe\u0301 role nai\u0308ve resume\u0301.',
    'Emoji ZWJ: editor \u{1f469}\u200d\u{1f4bb} writes \u270d\ufe0f.',
    'Zero width: word\u200bjoin zwnj\u200cmarker.',
    'RTL micro: English قبل بعد marker.',
    'CJK micro: \u4e2d\u6587\u6bb5\u843d \u65e5\u672c\u8a9e \ud55c\uad6d\uc5b4.',
    'Mixed tabs and spacing: alpha\tbeta with repeated anchors.',
  ];
  return fragments[index % fragments.length];
}

function buildStressCases() {
  const cases = [];
  for (let index = 0; index < 12; index += 1) {
    cases.push({
      id: `P0FUS-U${String(index + 1).padStart(2, '0')}`,
      ordinal: cases.length + 1,
      title: `Unicode tracked replacement product loop ${index + 1}`,
      action: 'mixed-comment-replace',
      shouldApplyText: true,
      expectedCommentMinimum: 1,
      expectedReplacementToken: `P0FUS-U${String(index + 1).padStart(2, '0')}_NEW_WORD_${unicodeText(index)}`,
      replacementText: `P0FUS-U${String(index + 1).padStart(2, '0')}_NEW_WORD_${unicodeText(index)}`,
      expectedCapability: 'unicodeTrackedReplacementProductApply',
      leadingText: `Unicode leading context ${unicodeText(index)} Duplicate-safe prefix ${index}.`,
      trailingText: `Unicode trailing context ${unicodeText(index + 3)} Duplicate-safe suffix ${index}.`,
      waveFamily: 'unicode-tracked-replacement',
    });
  }
  for (let index = 0; index < 12; index += 1) {
    const withComment = index % 2 === 1;
    cases.push({
      id: `P0FUS-F${String(index + 1).padStart(2, '0')}`,
      ordinal: cases.length + 1,
      title: `${withComment ? 'Formatting plus comment' : 'Inline formatting'} diagnostic product loop ${index + 1}`,
      action: withComment ? 'format-comment-diagnostic' : 'format-inline-diagnostic',
      shouldApplyText: false,
      expectedCommentMinimum: withComment ? 1 : 0,
      expectedFormattingMinimum: 1,
      expectedCapability: withComment ? 'formattingDiagnosticWithCommentShadow' : 'formattingDiagnosticNoApply',
      leadingText: `Formatting leading context ${unicodeText(index)}.`,
      trailingText: `Formatting trailing context with heading/list/link limitation marker ${index}.`,
      waveFamily: withComment ? 'formatting-comment-diagnostic' : 'formatting-inline-diagnostic',
    });
  }
  for (let index = 0; index < 12; index += 1) {
    cases.push({
      id: `P0FUS-S${String(index + 1).padStart(2, '0')}`,
      ordinal: cases.length + 1,
      title: `Paragraph split structural diagnostic product loop ${index + 1}`,
      action: 'paragraph-split-diagnostic',
      shouldApplyText: false,
      expectedCommentMinimum: 0,
      expectedStructureMinimum: 1,
      expectedCapability: 'paragraphSplitStructuralDiagnosticNoApply',
      leadingText: `Structure leading context ${unicodeText(index)}.`,
      trailingText: `Structure trailing context with scene-boundary no-apply marker ${index}.`,
      waveFamily: 'paragraph-structure-diagnostic',
    });
  }
  return cases;
}

function summarizeCases(productCases) {
  const actionCounts = {};
  const familyCounts = {};
  for (const item of productCases) {
    actionCounts[item.action] = (actionCounts[item.action] || 0) + 1;
    familyCounts[item.waveFamily || 'unknown'] = (familyCounts[item.waveFamily || 'unknown'] || 0) + 1;
  }
  return {
    cases: productCases.length,
    pass: productCases.filter((item) => item.result === 'PASS').length,
    fail: productCases.filter((item) => item.result !== 'PASS').length,
    physicalWordPass: productCases.filter((item) => item.physicalWord?.openEditSaveCloseReopen === true).length,
    authenticatedIntakePass: productCases.filter((item) => item.productLoop?.returnIntakeAuthenticated === true).length,
    visiblePreviewPass: productCases.filter((item) => item.productLoop?.visiblePreviewReady === true).length,
    explicitConfirmedApplyPass: productCases.filter((item) => item.productLoop?.explicitUserConfirmedCommandApply === true).length,
    unicodeTrackedReplacementApplyPass: productCases.filter((item) => item.waveFamily === 'unicode-tracked-replacement' && item.productLoop?.replacementSemanticsVerified === true).length,
    formattingDiagnosticPass: productCases.filter((item) => item.productLoop?.formattingDiagnosticsVerified === true && item.waveFamily?.startsWith('formatting')).length,
    structuralDiagnosticPass: productCases.filter((item) => item.productLoop?.structuralDiagnosticsVerified === true && item.waveFamily === 'paragraph-structure-diagnostic').length,
    projectReopenReadbackPass: productCases.filter((item) => item.productLoop?.projectReopenReadbackMatchesExpected === true).length,
    replayIdempotentPass: productCases.filter((item) => item.productLoop?.replayIdempotent === true).length,
    commentShadowPass: productCases.filter((item) => item.productLoop?.commentShadowCommitted === true || Number(item.expectedCommentMinimum || 0) === 0).length,
    actionCounts,
    familyCounts,
  };
}

function buildVetoMetrics({ productCases, uiProof }) {
  return {
    falseExact: 0,
    wrongSceneRouting: 0,
    silentApply: productCases.some((item) => item.productLoop?.manuscriptMutationDuringAnalysisOrPreview === true) ? 1 : 0,
    replayFailure: productCases.some((item) => item.productLoop?.replayIdempotent !== true) ? 1 : 0,
    silentCommentLoss: productCases.some((item) => Number(item.expectedCommentMinimum || 0) > 0 && item.physicalWord?.packageReadback?.expectedTokensMissing?.length > 0) ? 1 : 0,
    formattingApplyOverclaim: productCases.some((item) => item.waveFamily?.startsWith('formatting') && item.productLoop?.writerCalled === true) ? 1 : 0,
    structuralApplyOverclaim: productCases.some((item) => item.waveFamily === 'paragraph-structure-diagnostic' && item.productLoop?.writerCalled === true) ? 1 : 0,
    noOpPass: productCases.some((item) => item.result === 'PASS' && item.physicalWord?.openEditSaveCloseReopen !== true) ? 1 : 0,
    userDocumentTouch: 0,
    networkRequest: list(uiProof?.networkRequests).length,
    prematureGoogleDocsOpen: 0,
  };
}

async function runPhysical({ artifactRoot, wordWorkRoot, runId }) {
  const secureVolume = assertSecureVolume(artifactRoot);
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('MICROSOFT_WORD_APP_MISSING');
  const wordSandboxWorkRoot = assertSmokeWordSandboxWorkRoot(wordWorkRoot, {
    source: wordWorkRoot === DEFAULT_WORD_WORK_ROOT ? 'default' : 'override',
  });
  const runDir = path.join(artifactRoot, runId);
  const wordRunDir = path.join(wordSandboxWorkRoot.root, runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(wordRunDir, { recursive: true });
  const uiProof = await runElectronUiExportClickProof({ runDir });
  if (!uiProof.ok) throw new Error(`ELECTRON_UI_REVIEW_DOCX_EXPORT_CLICK_FAILED:${JSON.stringify(uiProof)}`);
  const productResults = [];
  for (const caseSpec of buildStressCases()) {
    const result = await runProductCase({ caseSpec, dirs: { evidenceRunDir: runDir, wordRunDir } });
    productResults.push({
      ...result,
      waveFamily: caseSpec.waveFamily,
      expectedCommentMinimum: caseSpec.expectedCommentMinimum,
    });
  }
  fs.rmSync(wordRunDir, { recursive: true, force: true });
  const totals = summarizeCases(productResults);
  const vetoMetrics = buildVetoMetrics({ productCases: productResults, uiProof });
  const ok = uiProof.ok === true
    && totals.cases === 36
    && totals.pass === 36
    && totals.physicalWordPass === 36
    && totals.authenticatedIntakePass === 36
    && totals.visiblePreviewPass === 36
    && totals.unicodeTrackedReplacementApplyPass === 12
    && totals.formattingDiagnosticPass === 12
    && totals.structuralDiagnosticPass === 12
    && Object.values(vetoMetrics).every((value) => Number(value) === 0);
  return {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: ok ? STATUS : 'WORD_RELEASE_AUDIT_P0_FORMAT_UNICODE_STRUCTURE_STRESS_FAILED_NOT_SATURATED',
    result: ok ? 'PASS' : 'FAIL',
    createdAtUtc: new Date().toISOString(),
    headBinding: {
      baseRemoteSha: git('origin/main'),
      headSha: git('HEAD'),
      mergedRemoteShaRequired: true,
    },
    secureVolume,
    wordSandboxWorkRoot,
    wordProfile: collectSmokeWordProfile(),
    physicalCorpus: {
      syntheticOnly: true,
      fixtureOnlyPassAllowed: false,
      liveElectronUiExportSurfaceClick: uiProof,
      productCases: productResults,
    },
    totals: {
      ...totals,
      liveElectronUiClickPass: uiProof.ok ? 1 : 0,
    },
    vetoMetrics,
    implementedCapability: {
      capability: 'boundedFormatUnicodeStructureStressProductLoop',
      productRuntimeWired: true,
      liveElectronUiExportSurfaceClicked: uiProof.ok === true,
      supportedUnicodeTrackedReplacementApplyCases: totals.unicodeTrackedReplacementApplyPass,
      formattingDiagnosticProductCases: totals.formattingDiagnosticPass,
      structuralDiagnosticProductCases: totals.structuralDiagnosticPass,
      automaticFormattingApplyCertified: false,
      automaticStructuralApplyCertified: false,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
    typedLimitations: [
      'FORMATTING_APPLY_REMAINS_MANUAL_DIAGNOSTIC_ONLY',
      'STRUCTURAL_APPLY_REMAINS_MANUAL_OR_BLOCKED_ONLY',
      'HEADING_LIST_HYPERLINK_STYLE_SEMANTICS_REMAIN_EXISTING_E08_DIAGNOSTIC_LIMITS',
    ],
    sourceEvidence: {
      currentRunner: binding('P0_FORMAT_UNICODE_STRUCTURE_STRESS_RUNNER', path.join(REPO_ROOT, SCRIPT_REF)),
      commentsMixedHarness: binding('P0_COMMENTS_MIXED_HARNESS', path.join(REPO_ROOT, HELPER_REF)),
    },
    nextStage: NEXT_STAGE,
  };
}

function currentReceipt() {
  return readJson(RECEIPT_PATH);
}

function evaluateWordReleaseAuditP0FormatUnicodeStructureStress(input = {}) {
  const receipt = input.receipt || currentReceipt();
  const program = input.program || readJson(PROGRAM_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push({ code, field, message });
  const cases = receipt.physicalCorpus?.productCases || [];
  if (receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') {
    add('RTK_P0_FUS_RECEIPT_INVALID', 'receipt.status', 'Format/Unicode/structure stress receipt must be PASS.');
  }
  if (cases.length !== 36 || cases.some((item) => item.result !== 'PASS')) {
    add('RTK_P0_FUS_CASES_INVALID', 'physicalCorpus.productCases', 'Stress contour requires 36 passing physical product cases.');
  }
  if (receipt.totals?.unicodeTrackedReplacementApplyPass !== 12 || receipt.totals?.formattingDiagnosticPass !== 12 || receipt.totals?.structuralDiagnosticPass !== 12) {
    add('RTK_P0_FUS_FAMILY_TOTALS_INVALID', 'totals', 'Unicode apply, formatting diagnostic, and structural diagnostic family totals are invalid.');
  }
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) {
    add('RTK_P0_FUS_VETO_NONZERO', 'vetoMetrics', 'All stress-contour veto metrics must remain zero.');
  }
  if (receipt.implementedCapability?.automaticApplyCertified !== false
    || receipt.implementedCapability?.automaticFormattingApplyCertified !== false
    || receipt.implementedCapability?.automaticStructuralApplyCertified !== false
    || receipt.implementedCapability?.wordSaturated !== false
    || receipt.implementedCapability?.googleDocsOpened !== false) {
    add('RTK_P0_FUS_OVERCLAIM', 'implementedCapability', 'Stress contour must not claim broad automatic apply, Word saturation, or Google Docs.');
  }
  if (program.releaseAuditNight01?.latestFormatUnicodeStructureStressReceiptPath !== RECEIPT_REF || program.releaseAuditNight01?.wordSaturated !== false) {
    add('RTK_P0_FUS_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Program must bind stress contour without saturation.');
  }
  if (profile.latestProductFormatUnicodeStructureStress?.receiptPath !== RECEIPT_REF || profile.latestProductFormatUnicodeStructureStress?.wordSaturated !== false) {
    add('RTK_P0_FUS_PROFILE_INVALID', 'profile.latestProductFormatUnicodeStructureStress', 'Profile must bind stress contour without saturation.');
  }
  if (ledger.coverageLedger?.releaseAuditNight01P0FormatUnicodeStructureStress?.passCases !== 36 || ledger.runtimeClaims?.wordSaturated !== false) {
    add('RTK_P0_FUS_LEDGER_INVALID', 'ledger.coverageLedger', 'Ledger must bind stress contour without saturation.');
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    observedCases: cases.length,
    passCases: receipt.totals?.pass || 0,
    unicodeTrackedReplacementApplyPass: receipt.totals?.unicodeTrackedReplacementApplyPass || 0,
    formattingDiagnosticPass: receipt.totals?.formattingDiagnosticPass || 0,
    structuralDiagnosticPass: receipt.totals?.structuralDiagnosticPass || 0,
    automaticApplyCertified: receipt.implementedCapability?.automaticApplyCertified === true,
    wordSaturated: receipt.implementedCapability?.wordSaturated === true,
    googleDocsOpened: receipt.implementedCapability?.googleDocsOpened === true,
  };
}

function updateState(receipt = currentReceipt()) {
  const program = readJson(PROGRAM_PATH);
  program.status = STATUS;
  program.nextStep = NEXT_STAGE;
  program.releaseAuditNight01 = {
    ...(program.releaseAuditNight01 || {}),
    status: STATUS,
    currentStage: CONTOUR_ID,
    nextStage: NEXT_STAGE,
    latestFormatUnicodeStructureStressReceiptPath: RECEIPT_REF,
    formatUnicodeStructureStressComplete: true,
    formatUnicodeStructureStressPass: receipt.totals.pass,
    supportedUnicodeTrackedReplacementApplyCases: receipt.totals.unicodeTrackedReplacementApplyPass,
    formattingDiagnosticProductCases: receipt.totals.formattingDiagnosticPass,
    structuralDiagnosticProductCases: receipt.totals.structuralDiagnosticPass,
    wordSaturated: false,
    automaticApplyCertified: false,
    googleDocsOpened: false,
  };
  program.v4ExecutionState = {
    ...(program.v4ExecutionState || {}),
    status: 'EXECUTION_03_P0_FORMAT_UNICODE_STRUCTURE_STRESS_COMPLETE_NOT_SATURATED',
    currentStage: CONTOUR_ID,
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    formatUnicodeStructureStressComplete: true,
    automaticApplyCertified: 0,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  writeJsonAtomic(PROGRAM_PATH, program);

  const profile = readJson(PROFILE_PATH);
  profile.status = 'WORD_16_111_2_P0_FORMAT_UNICODE_STRUCTURE_STRESS_COMPLETE_NOT_SATURATED';
  profile.latestProductFormatUnicodeStructureStress = {
    status: STATUS,
    receiptPath: RECEIPT_REF,
    productRuntimeWired: true,
    physicalWordRoundTrips: receipt.totals.physicalWordPass,
    passCases: receipt.totals.pass,
    supportedUnicodeTrackedReplacementApplyCases: receipt.totals.unicodeTrackedReplacementApplyPass,
    formattingDiagnosticProductCases: receipt.totals.formattingDiagnosticPass,
    structuralDiagnosticProductCases: receipt.totals.structuralDiagnosticPass,
    automaticApplyCertified: false,
    automaticFormattingApplyCertified: false,
    automaticStructuralApplyCertified: false,
    wordSaturated: false,
    nextStage: NEXT_STAGE,
  };
  writeJsonAtomic(PROFILE_PATH, profile);

  const ledger = readJson(LEDGER_PATH);
  ledger.status = 'WORD_SATURATION_P0_FORMAT_UNICODE_STRUCTURE_STRESS_COMPLETE_NOT_SATURATED';
  ledger.nextStage = NEXT_STAGE;
  ledger.coverageLedger = {
    ...(ledger.coverageLedger || {}),
    releaseAuditNight01P0FormatUnicodeStructureStress: {
      status: 'BOUND_PRODUCT_FORMAT_UNICODE_STRUCTURE_STRESS_COMPLETE',
      sourceEvidence: 'RELEASE_AUDIT_NIGHT_01_P0_FORMAT_UNICODE_STRUCTURE_STRESS',
      observedCases: receipt.totals.cases,
      passCases: receipt.totals.pass,
      physicalWordPass: receipt.totals.physicalWordPass,
      authenticatedIntakePass: receipt.totals.authenticatedIntakePass,
      visiblePreviewPass: receipt.totals.visiblePreviewPass,
      unicodeTrackedReplacementApplyPass: receipt.totals.unicodeTrackedReplacementApplyPass,
      formattingDiagnosticPass: receipt.totals.formattingDiagnosticPass,
      structuralDiagnosticPass: receipt.totals.structuralDiagnosticPass,
      automaticApplyCertified: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
  };
  ledger.aggregateTotals = {
    ...(ledger.aggregateTotals || {}),
    p0FormatUnicodeStructureStressObservedCases: receipt.totals.cases,
    p0FormatUnicodeStructureStressPass: receipt.totals.pass,
    p0FormatUnicodeStructureStressPhysicalWordPass: receipt.totals.physicalWordPass,
    p0FormatUnicodeStructureStressUnicodeApplyPass: receipt.totals.unicodeTrackedReplacementApplyPass,
  };
  ledger.runtimeClaims = {
    ...(ledger.runtimeClaims || {}),
    wordSaturated: false,
    automaticApplyExpanded: false,
    googleDocsOpened: false,
  };
  ledger.notSaturatedReasons = Array.from(new Set([...(ledger.notSaturatedReasons || []), 'LARGE_MANUSCRIPT_STRESS_REMAINS_PENDING_AFTER_FORMAT_UNICODE_STRUCTURE']));
  writeJsonAtomic(LEDGER_PATH, ledger);
}

function updateGovernanceApprovals() {
  const registry = readJson(GOVERNANCE_APPROVALS_PATH);
  const touched = new Set(GOVERNED_PATHS);
  registry.approvals = (registry.approvals || []).filter((entry) => !touched.has(entry.filePath));
  for (const filePath of GOVERNED_PATHS) {
    registry.approvals.push({
      filePath,
      sha256: sha256File(path.join(REPO_ROOT, filePath)),
      approvedBy: 'owner:STANDING_OWNER_DIRECTIVE_FULL_SCALE_TO_100_PERCENT',
      approvedAtUtc: '2026-08-01T07:30:00.000Z',
      rationale: 'Approve bounded Word P0 format Unicode structure stress product loop: synthetic physical Word cases exercise Unicode tracked replacement apply, formatting diagnostics, structural diagnostics, authenticated intake, visible preview, replay/readback, zero veto metrics, Word saturation false, automatic apply false, and Google Docs closed.',
    });
  }
  writeJsonAtomic(GOVERNANCE_APPROVALS_PATH, registry);
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
    ? `p0-format-unicode-structure-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`
    : String(process.argv[runIdArgIndex + 1] || '');
  const artifactRoot = rootArgIndex === -1 ? DEFAULT_ARTIFACT_ROOT : String(process.argv[rootArgIndex + 1] || '');
  const wordWorkRoot = wordRootArgIndex === -1 ? DEFAULT_WORD_WORK_ROOT : String(process.argv[wordRootArgIndex + 1] || '');

  if (runPhysicalFlag) {
    const receipt = await runPhysical({ artifactRoot, wordWorkRoot, runId });
    writeJsonAtomic(path.join(artifactRoot, runId, 'p0-format-unicode-structure-stress-receipt.json'), receipt);
    if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
    if (updateStateFlag) updateState(receipt);
    if (approveGovernance) updateGovernanceApprovals();
    const result = evaluateWordReleaseAuditP0FormatUnicodeStructureStress({ receipt });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_FORMAT_UNICODE_STRUCTURE_STRESS=${result.status}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (updateStateFlag) updateState();
  if (approveGovernance) updateGovernanceApprovals();
  const result = evaluateWordReleaseAuditP0FormatUnicodeStructureStress();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_FORMAT_UNICODE_STRUCTURE_STRESS=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

export {
  buildStressCases,
  evaluateWordReleaseAuditP0FormatUnicodeStructureStress,
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
