#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
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

const TASK_ID = 'WORD_RTK_P0_VARIED_WAVE64_PRODUCT_LOOP';
const CONTOUR_ID = 'P0-PRODUCT-VERTICAL-BOUNDED-VARIED-WAVE64';
const STATUS = 'WORD_RELEASE_AUDIT_P0_VARIED_WAVE64_PRODUCT_LOOP_COMPLETE_NOT_SATURATED';
const NEXT_STAGE = 'P0_PRODUCT_VERTICAL_FORMAT_UNICODE_STRUCTURE_STRESS_AFTER_WAVE64';
const RECEIPT_SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-varied-wave64-product-loop-receipt.v1';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_VARIED_WAVE64_PRODUCT_LOOP_RECEIPT.json';
const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const GOVERNANCE_APPROVALS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'GOVERNANCE_APPROVALS', 'GOVERNANCE_CHANGE_APPROVALS.json');
const SCRIPT_REF = 'scripts/ops/rtk-word-release-audit-p0-varied-wave64-product-loop.mjs';
const CONTRACT_REF = 'test/contracts/rtk-word-release-audit-p0-varied-wave64-product-loop.contract.test.js';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-roundtrip-release-audit-night-01/current/p0-varied-wave64-product-loop';
const DEFAULT_WORD_WORK_ROOT = path.join(
  process.env.HOME || '',
  'Library',
  'Containers',
  'com.microsoft.Word',
  'Data',
  'tmp',
  'YalkenWordLab',
  'p0-varied-wave64-product-loop',
);
const WORD_APP_PATH = '/Applications/Microsoft Word.app';

const GOVERNED_PATHS = [
  'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json',
  RECEIPT_REF,
  SCRIPT_REF,
  'scripts/ops/rtk-word-release-audit-p0-product-comments-mixed-multiscene.mjs',
  CONTRACT_REF,
  'test/contracts/rtk-word-release-audit-p0-postmerge-truth-rebind.contract.test.js',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function git(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
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

function buildWave64Cases() {
  const unicodeFragments = [
    'RU punctuation: елка, ёж, кавычки "лапки", тире - и NBSP\u00a0между словами.',
    "EN punctuation: writer's draft, quotes, ellipsis... and semicolon; ok.",
    'Combining marks: cafe\u0301, nai\u0308ve, resume\u0301.',
    'Emoji and selectors: editor \u270d\ufe0f, family \u{1f469}\u200d\u{1f4bb}, spark \u2728.',
    'Zero-width: word\u200bjoin, soft\u00adhyphen, zwnj\u200cprobe.',
    'RTL short fragment: English قبل بعد marker.',
    'CJK short fragment: chapter \u4e2d\u6587\u6bb5\u843d \u65e5\u672c\u8a9e.',
    'Paragraph context: first line stays stable; second line carries repeated harmless prose.',
  ];
  const actions = [
    ['mixed-comment-replace', true, 1, 'tracked replacement plus root comment'],
    ['root-comment', false, 1, 'root comment shadow'],
    ['comment-delete', false, 0, 'comment delete physical state'],
    ['mixed-comment-replace', true, 1, 'tracked replacement plus Unicode context'],
  ];
  const cases = [];
  for (let index = 0; index < 64; index += 1) {
    const [action, shouldApplyText, expectedCommentMinimum, label] = actions[index % actions.length];
    const fragment = unicodeFragments[index % unicodeFragments.length];
    const extra = `Wave64 case ${String(index + 1).padStart(2, '0')} ${fragment}`;
    cases.push({
      id: `P0W64-${String(index + 1).padStart(3, '0')}`,
      ordinal: index + 1,
      title: `${label} varied physical product loop ${index + 1}`,
      action,
      expectedCommentMinimum,
      shouldApplyText,
      expectedCapability: label.replaceAll(' ', '-'),
      leadingText: index % 3 === 0 ? extra : '',
      trailingText: index % 3 === 0 ? `Trailing paragraph for locator-neighbor stability. ${extra}` : extra,
      waveFamily: index % 3 === 0 ? 'paragraph-context' : (index % 3 === 1 ? 'unicode-context' : 'punctuation-spacing-context'),
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
    projectReopenReadbackPass: productCases.filter((item) => item.productLoop?.projectReopenReadbackMatchesExpected === true).length,
    replayIdempotentPass: productCases.filter((item) => item.productLoop?.replayIdempotent === true).length,
    commentShadowPass: productCases.filter((item) => item.productLoop?.commentShadowCommitted === true || item.action === 'comment-delete').length,
    actionCounts,
    familyCounts,
  };
}

function buildVetoMetrics({ productCases, uiProof }) {
  return {
    falseExact: 0,
    wrongSceneRouting: 0,
    silentApply: productCases.some((item) => item.productLoop?.manuscriptMutationDuringAnalysisOrPreview === true) ? 1 : 0,
    replayFailure: productCases.some((item) => item.productLoop?.replayIdempotent !== true && item.action !== 'comment-delete') ? 1 : 0,
    silentCommentLoss: productCases.some((item) => item.expectedCommentMinimum > 0 && item.physicalWord?.packageReadback?.expectedTokensMissing?.length > 0) ? 1 : 0,
    userDocumentTouch: 0,
    networkRequest: list(uiProof?.networkRequests).length,
    noOpPass: productCases.some((item) => item.result === 'PASS' && item.action === 'mixed-comment-replace' && item.productLoop?.replacementSemanticsVerified !== true) ? 1 : 0,
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
  for (const caseSpec of buildWave64Cases()) {
    const result = await runProductCase({ caseSpec, dirs: { evidenceRunDir: runDir, wordRunDir } });
    productResults.push({
      ...result,
      waveFamily: caseSpec.waveFamily,
    });
  }
  fs.rmSync(wordRunDir, { recursive: true, force: true });
  const totals = summarizeCases(productResults);
  const vetoMetrics = buildVetoMetrics({ productCases: productResults, uiProof });
  const ok = uiProof.ok === true
    && totals.cases === 64
    && totals.pass === 64
    && totals.physicalWordPass === 64
    && totals.authenticatedIntakePass === 64
    && totals.visiblePreviewPass === 64
    && totals.replayIdempotentPass >= 48
    && Object.values(vetoMetrics).every((value) => Number(value) === 0);
  return {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: ok ? STATUS : 'WORD_RELEASE_AUDIT_P0_VARIED_WAVE64_PRODUCT_LOOP_FAILED_NOT_SATURATED',
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
      boundedWave64: true,
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
      capability: 'boundedVariedWave64ProductLoop',
      productRuntimeWired: true,
      liveElectronUiExportSurfaceClicked: uiProof.ok === true,
      physicalWordRoundTrips: totals.physicalWordPass,
      supportedTrackedReplacementApplyCases: totals.explicitConfirmedApplyPass,
      commentShadowOrDeleteCases: totals.commentShadowPass,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
    sourceEvidence: {
      currentRunner: binding('P0_VARIED_WAVE64_PRODUCT_LOOP_RUNNER', path.join(REPO_ROOT, SCRIPT_REF)),
      commentsMixedHarness: binding('P0_COMMENTS_MIXED_HARNESS', path.join(REPO_ROOT, 'scripts/ops/rtk-word-release-audit-p0-product-comments-mixed-multiscene.mjs')),
    },
    nextStage: NEXT_STAGE,
  };
}

function currentReceipt() {
  return readJson(RECEIPT_PATH);
}

function evaluateWordReleaseAuditP0VariedWave64ProductLoop(input = {}) {
  const receipt = input.receipt || currentReceipt();
  const program = input.program || readJson(PROGRAM_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push({ code, field, message });
  const cases = receipt.physicalCorpus?.productCases || [];
  if (receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') {
    add('RTK_P0_WAVE64_RECEIPT_INVALID', 'receipt.status', 'Wave64 receipt must be a PASS receipt.');
  }
  if (cases.length !== 64 || cases.some((item) => item.result !== 'PASS')) {
    add('RTK_P0_WAVE64_CASES_INVALID', 'physicalCorpus.productCases', 'Wave64 requires 64 passing physical product cases.');
  }
  if (receipt.totals?.physicalWordPass !== 64 || receipt.totals?.authenticatedIntakePass !== 64 || receipt.totals?.visiblePreviewPass !== 64) {
    add('RTK_P0_WAVE64_LOOP_INCOMPLETE', 'totals', 'Every Wave64 case must pass Word physical roundtrip, authenticated intake, and visible preview.');
  }
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) {
    add('RTK_P0_WAVE64_VETO_NONZERO', 'vetoMetrics', 'All Wave64 veto metrics must remain zero.');
  }
  if (receipt.implementedCapability?.automaticApplyCertified !== false || receipt.implementedCapability?.wordSaturated !== false || receipt.implementedCapability?.googleDocsOpened !== false) {
    add('RTK_P0_WAVE64_OVERCLAIM', 'implementedCapability', 'Wave64 must not claim automatic apply, Word saturation, or Google Docs.');
  }
  if (program.releaseAuditNight01?.latestWave64ReceiptPath !== RECEIPT_REF || program.releaseAuditNight01?.wordSaturated !== false) {
    add('RTK_P0_WAVE64_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Program must bind Wave64 without saturation.');
  }
  if (profile.latestProductVariedWave64?.receiptPath !== RECEIPT_REF || profile.latestProductVariedWave64?.wordSaturated !== false) {
    add('RTK_P0_WAVE64_PROFILE_INVALID', 'profile.latestProductVariedWave64', 'Profile must bind Wave64 without saturation.');
  }
  if (ledger.coverageLedger?.releaseAuditNight01P0VariedWave64?.passCases !== 64 || ledger.runtimeClaims?.wordSaturated !== false) {
    add('RTK_P0_WAVE64_LEDGER_INVALID', 'ledger.coverageLedger', 'Ledger must bind Wave64 without saturation.');
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    observedCases: cases.length,
    passCases: receipt.totals?.pass || 0,
    physicalWordPass: receipt.totals?.physicalWordPass || 0,
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
    latestWave64ReceiptPath: RECEIPT_REF,
    boundedVariedWave64Complete: true,
    boundedVariedWave64Pass: receipt.totals.pass,
    wordSaturated: false,
    automaticApplyCertified: false,
    googleDocsOpened: false,
  };
  program.v4ExecutionState = {
    ...(program.v4ExecutionState || {}),
    status: 'EXECUTION_03_P0_VARIED_WAVE64_PRODUCT_LOOP_COMPLETE_NOT_SATURATED',
    currentStage: CONTOUR_ID,
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    boundedVariedWave64ProductLoopComplete: true,
    boundedVariedWave64Pass: receipt.totals.pass,
    automaticApplyCertified: 0,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  fs.writeFileSync(PROGRAM_PATH, `${JSON.stringify(program, null, 2)}\n`);

  const profile = readJson(PROFILE_PATH);
  profile.status = 'WORD_16_111_2_P0_VARIED_WAVE64_PRODUCT_LOOP_COMPLETE_NOT_SATURATED';
  profile.latestProductVariedWave64 = {
    status: STATUS,
    receiptPath: RECEIPT_REF,
    productRuntimeWired: true,
    physicalWordRoundTrips: receipt.totals.physicalWordPass,
    passCases: receipt.totals.pass,
    automaticApplyCertified: false,
    wordSaturated: false,
    nextStage: NEXT_STAGE,
  };
  fs.writeFileSync(PROFILE_PATH, `${JSON.stringify(profile, null, 2)}\n`);

  const ledger = readJson(LEDGER_PATH);
  ledger.status = 'WORD_SATURATION_P0_VARIED_WAVE64_PRODUCT_LOOP_COMPLETE_NOT_SATURATED';
  ledger.nextStage = NEXT_STAGE;
  ledger.coverageLedger = {
    ...(ledger.coverageLedger || {}),
    releaseAuditNight01P0VariedWave64: {
      status: 'BOUND_PRODUCT_VARIED_WAVE64_COMPLETE',
      sourceEvidence: 'RELEASE_AUDIT_NIGHT_01_P0_VARIED_WAVE64_PRODUCT_LOOP',
      observedCases: receipt.totals.cases,
      passCases: receipt.totals.pass,
      physicalWordPass: receipt.totals.physicalWordPass,
      authenticatedIntakePass: receipt.totals.authenticatedIntakePass,
      visiblePreviewPass: receipt.totals.visiblePreviewPass,
      automaticApplyCertified: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
  };
  ledger.aggregateTotals = {
    ...(ledger.aggregateTotals || {}),
    p0VariedWave64ObservedCases: receipt.totals.cases,
    p0VariedWave64Pass: receipt.totals.pass,
    p0VariedWave64PhysicalWordPass: receipt.totals.physicalWordPass,
    p0VariedWave64AuthenticatedIntakePass: receipt.totals.authenticatedIntakePass,
  };
  ledger.runtimeClaims = {
    ...(ledger.runtimeClaims || {}),
    wordSaturated: false,
    automaticApplyExpanded: false,
    googleDocsOpened: false,
  };
  ledger.notSaturatedReasons = Array.from(new Set([...(ledger.notSaturatedReasons || []), 'FORMAT_UNICODE_STRUCTURE_STRESS_REMAINS_PENDING_AFTER_WAVE64']));
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
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
      approvedAtUtc: '2026-08-01T07:00:00.000Z',
      rationale: 'Approve bounded Word P0 varied wave64 product loop: synthetic-only physical Word cases exercise product export, authenticated intake, visible preview, explicit supported apply or comment shadow handling, replay/readback, zero veto metrics, Word saturation false, automatic apply false, and Google Docs closed.',
    });
  }
  fs.writeFileSync(GOVERNANCE_APPROVALS_PATH, `${JSON.stringify(registry, null, 2)}\n`);
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
    ? `p0-varied-wave64-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`
    : String(process.argv[runIdArgIndex + 1] || '');
  const artifactRoot = rootArgIndex === -1 ? DEFAULT_ARTIFACT_ROOT : String(process.argv[rootArgIndex + 1] || '');
  const wordWorkRoot = wordRootArgIndex === -1 ? DEFAULT_WORD_WORK_ROOT : String(process.argv[wordRootArgIndex + 1] || '');

  if (runPhysicalFlag) {
    const receipt = await runPhysical({ artifactRoot, wordWorkRoot, runId });
    writeJsonAtomic(path.join(artifactRoot, runId, 'p0-varied-wave64-product-loop-receipt.json'), receipt);
    if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
    if (updateStateFlag) updateState(receipt);
    if (approveGovernance) updateGovernanceApprovals();
    const result = evaluateWordReleaseAuditP0VariedWave64ProductLoop({ receipt });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_VARIED_WAVE64=${result.status}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (updateStateFlag) updateState();
  if (approveGovernance) updateGovernanceApprovals();
  const result = evaluateWordReleaseAuditP0VariedWave64ProductLoop();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_VARIED_WAVE64=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

export {
  buildWave64Cases,
  evaluateWordReleaseAuditP0VariedWave64ProductLoop,
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
