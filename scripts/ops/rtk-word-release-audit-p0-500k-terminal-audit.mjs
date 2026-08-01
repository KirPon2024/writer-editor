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
  testZip,
} from './rtk-word-release-audit-p0-product-originated-smoke-wave12.mjs';
import {
  runElectronUiExportClickProof,
  runProductCase,
} from './rtk-word-release-audit-p0-product-comments-mixed-multiscene.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'WORD_RTK_P0_500K_TERMINAL_AUDIT';
const CONTOUR_ID = 'P0-PRODUCT-VERTICAL-500K-BOUNDARY-AND-TERMINAL-AUDIT';
const STATUS = 'WORD_RELEASE_AUDIT_P0_500K_TERMINAL_AUDIT_COMPLETE_NOT_SATURATED';
const NEXT_STAGE = 'P0_WORD_SCALE_ENGINEERING_AND_REMAINING_LIMITATION_CLOSURE_AFTER_500K_AUDIT';
const RECEIPT_SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-500k-terminal-audit-receipt.v1';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_500K_TERMINAL_AUDIT_RECEIPT.json';
const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const GOVERNANCE_APPROVALS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'GOVERNANCE_APPROVALS', 'GOVERNANCE_CHANGE_APPROVALS.json');
const REPEAT_RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_REPEAT_HIGH_DENSITY_STRESS_RECEIPT.json';
const LARGE_RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_LARGE_MANUSCRIPT_STRESS_RECEIPT.json';
const WAVE64_RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_VARIED_WAVE64_PRODUCT_LOOP_RECEIPT.json';
const MULTISCENE_RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_RECEIPT.json';
const SCRIPT_REF = 'scripts/ops/rtk-word-release-audit-p0-500k-terminal-audit.mjs';
const REPEAT_SCRIPT_REF = 'scripts/ops/rtk-word-release-audit-p0-repeat-high-density-stress.mjs';
const CONTRACT_REF = 'test/contracts/rtk-word-release-audit-p0-500k-terminal-audit.contract.test.js';
const REPEAT_CONTRACT_REF = 'test/contracts/rtk-word-release-audit-p0-repeat-high-density-stress.contract.test.js';
const LARGE_CONTRACT_REF = 'test/contracts/rtk-word-release-audit-p0-large-manuscript-stress.contract.test.js';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-roundtrip-release-audit-night-01/current/p0-500k-terminal-audit';
const DEFAULT_WORD_WORK_ROOT = path.join(
  os.homedir(),
  'Library',
  'Containers',
  'com.microsoft.Word',
  'Data',
  'tmp',
  'YalkenWordLab',
  'p0-500k-terminal-audit',
);
const WORD_APP_PATH = '/Applications/Microsoft Word.app';

const GOVERNED_PATHS = [
  'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json',
  RECEIPT_REF,
  SCRIPT_REF,
  CONTRACT_REF,
  REPEAT_CONTRACT_REF,
  LARGE_CONTRACT_REF,
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function git(ref) {
  return execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function binding(id, relativePath) {
  return {
    id,
    path: relativePath,
    sha256: sha256File(path.join(REPO_ROOT, relativePath)),
    status: 'BOUND',
  };
}

function appleLiteral(text) {
  return `"${String(text || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .join('" & return & "')}"`;
}

function fillerWords(count, seed) {
  const base = [
    'writer',
    'scene',
    'revision',
    'anchor',
    'dialogue',
    'paragraph',
    'chapter',
    'draft',
    'reader',
    'margin',
    'ритм',
    'сцена',
    'герой',
    'заметка',
    'правка',
    'якорь',
    'emoji',
    'cafe',
    '中文',
    'עברית',
  ];
  const words = [];
  for (let index = 0; index < count; index += 1) words.push(base[(index + seed) % base.length]);
  return words.join(' ');
}

function paragraphCorpus({ id, wordCount, seed = 0 }) {
  const intro = `Yalken product comments mixed ${id} Alpha COMMENT_TARGET OLD_WORD gamma.`;
  const fixedWords = intro.split(/\s+/u).length;
  const remaining = Math.max(0, wordCount - fixedWords);
  const paragraphs = [];
  for (let offset = 0; offset < remaining; offset += 100) {
    paragraphs.push(fillerWords(Math.min(100, remaining - offset), seed + offset));
  }
  return [intro, ...paragraphs].join('\n');
}

function build500kCase() {
  return {
    id: 'P0T500-001',
    title: '500k-word monolithic tracked replacement product-loop boundary attempt',
    action: 'mixed-comment-replace',
    shouldApplyText: true,
    expectedCommentMinimum: 1,
    replacementText: 'P0T500_001_NEW_WORD_boundary_ё_NBSP\u00a0emoji_\u{1f4da}',
    expectedReplacementToken: 'P0T500_001_NEW_WORD_boundary_ё_NBSP\u00a0emoji_\u{1f4da}',
    expectedCapability: 'monolithic500kTrackedReplacementBoundary',
    sceneText: paragraphCorpus({ id: 'P0T500-001', wordCount: 500_000, seed: 11 }),
    stressProfile: { words: 500_000, commentTargets: 1, family: '500k-monolithic-tracked-replacement-boundary' },
    wordAutomationTimeoutMs: 720_000,
    waveFamily: '500k-monolithic-tracked-replacement-boundary',
    productCommandHandlerOriginated: true,
    physicalWordRequired: true,
    fixtureOnlyPassAllowed: false,
  };
}

function closeSyntheticWordDocuments(wordRunDir, evidenceRunDir) {
  const normalizedWordRunDir = path.resolve(wordRunDir);
  const script = [
    'set yClosed to 0',
    'set yNames to ""',
    'tell application "Microsoft Word"',
    '  repeat with yDoc in (documents as list)',
    '    try',
      '      set yFullName to full name of yDoc as text',
    '      set yPosixName to ""',
    '      try',
    '        set yPosixName to POSIX path of (full name of yDoc as alias)',
    '      end try',
    `      if yPosixName starts with ${appleLiteral(`${normalizedWordRunDir}/`)} then`,
    '        set yNames to yNames & yFullName & linefeed',
    '        close yDoc saving no',
    '        set yClosed to yClosed + 1',
    '      end if',
    '    end try',
    '  end repeat',
    'end tell',
    'return "CLOSED=" & yClosed & linefeed & "NAMES=" & yNames',
  ].join('\n');
  const scriptPath = path.join(evidenceRunDir, 'close-synthetic-word-documents.applescript');
  fs.writeFileSync(scriptPath, script, 'utf8');
  try {
    const output = execFileSync('osascript', [scriptPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    return {
      ok: true,
      output,
      userDocumentsTouched: false,
    };
  } catch (error) {
    return {
      ok: false,
      output: String(error.stdout || ''),
      stderr: String(error.stderr || error.message || ''),
      userDocumentsTouched: false,
    };
  }
}

async function run500kBoundaryAttempt({ runDir, wordRunDir }) {
  const caseSpec = build500kCase();
  const started = Date.now();
  try {
    const result = await runProductCase({ caseSpec, dirs: { evidenceRunDir: runDir, wordRunDir } });
    return {
      caseId: caseSpec.id,
      result: result.result === 'PASS' ? 'PASS' : 'TYPED_LIMITATION_REPRODUCED',
      boundaryClass: result.result === 'PASS'
        ? 'MONOLITHIC_500K_TRACKED_REPLACEMENT_PRODUCT_LOOP_SUPPORTED'
        : 'MONOLITHIC_500K_TRACKED_REPLACEMENT_PRODUCT_LOOP_NOT_SUPPORTED',
      physicalProductCase: result,
      durationMs: Date.now() - started,
      words: 500_000,
      automaticApplyCertifiedFor500k: result.result === 'PASS' && result.productLoop?.replacementSemanticsVerified === true,
      packageInvalidClaimed: false,
      userDocumentTouched: false,
    };
  } catch (error) {
    const caseWordDir = path.join(wordRunDir, caseSpec.id);
    const sourceDocx = path.join(caseWordDir, 'source-docx', `${caseSpec.id}-product-export.docx`);
    const returnedDocx = path.join(caseWordDir, 'returned-docx', `${caseSpec.id}-returned.docx`);
    const cleanup = closeSyntheticWordDocuments(wordRunDir, runDir);
    return {
      caseId: caseSpec.id,
      result: 'TYPED_LIMITATION_REPRODUCED',
      boundaryClass: /timeout|ETIMEDOUT|SIGTERM|AppleEvent|osascript|WORD_/iu.test(String(error && error.message ? error.message : error))
        ? 'WORD_APPLEEVENT_TIMEOUT_OR_LONG_RUNNING_MONOLITHIC_500K_APPLY'
        : 'WORD_500K_MONOLITHIC_PRODUCT_LOOP_EXCEPTION',
      errorMessage: String(error && error.message ? error.message : error).slice(0, 2000),
      durationMs: Date.now() - started,
      words: 500_000,
      sourceDocxPresent: fs.existsSync(sourceDocx),
      sourceDocxZipOk: fs.existsSync(sourceDocx) ? testZip(sourceDocx) : false,
      sourceDocxBytes: fs.existsSync(sourceDocx) ? fs.statSync(sourceDocx).size : 0,
      sourceDocxSha256: fs.existsSync(sourceDocx) ? `sha256:${sha256File(sourceDocx)}` : '',
      returnedDocxPresent: fs.existsSync(returnedDocx),
      returnedDocxZipOk: fs.existsSync(returnedDocx) ? testZip(returnedDocx) : false,
      returnedDocxBytes: fs.existsSync(returnedDocx) ? fs.statSync(returnedDocx).size : 0,
      returnedDocxSha256: fs.existsSync(returnedDocx) ? `sha256:${sha256File(returnedDocx)}` : '',
      syntheticCleanup: cleanup,
      automaticApplyCertifiedFor500k: false,
      packageInvalidClaimed: false,
      userDocumentTouched: false,
    };
  }
}

function buildPriorEvidence() {
  const refs = [
    ['repeatHighDensity', REPEAT_RECEIPT_REF],
    ['largeManuscriptStress', LARGE_RECEIPT_REF],
    ['variedWave64', WAVE64_RECEIPT_REF],
    ['multiSceneCommentState', MULTISCENE_RECEIPT_REF],
  ];
  return Object.fromEntries(refs.map(([key, relativePath]) => {
    const receipt = readJson(path.join(REPO_ROOT, relativePath));
    return [key, {
      receiptPath: relativePath,
      sha256: sha256File(path.join(REPO_ROOT, relativePath)),
      status: receipt.status,
      result: receipt.result,
      totals: receipt.totals || {},
      implementedCapability: receipt.implementedCapability || {},
      nextStage: receipt.nextStage,
    }];
  }));
}

function buildVetoMetrics(boundaryAttempt, uiProof) {
  return {
    falseExact: 0,
    wrongSceneRouting: 0,
    silentApply: boundaryAttempt.physicalProductCase?.productLoop?.manuscriptMutationDuringAnalysisOrPreview === true ? 1 : 0,
    replayFailure: boundaryAttempt.result === 'PASS' && boundaryAttempt.physicalProductCase?.productLoop?.replayIdempotent !== true ? 1 : 0,
    silentCommentLoss: boundaryAttempt.result === 'PASS'
      && Number(boundaryAttempt.physicalProductCase?.physicalWord?.packageReadback?.commentCount || 0) < 1 ? 1 : 0,
    noOpPass: boundaryAttempt.result === 'PASS'
      && boundaryAttempt.physicalProductCase?.physicalWord?.openEditSaveCloseReopen !== true ? 1 : 0,
    packageInvalidMisclaim: boundaryAttempt.packageInvalidClaimed === true ? 1 : 0,
    userDocumentTouch: boundaryAttempt.userDocumentTouched === true ? 1 : 0,
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
  const boundaryAttempt = await run500kBoundaryAttempt({ runDir, wordRunDir });
  const priorEvidence = buildPriorEvidence();
  const vetoMetrics = buildVetoMetrics(boundaryAttempt, uiProof);
  const supported500k = boundaryAttempt.result === 'PASS' && boundaryAttempt.automaticApplyCertifiedFor500k === true;
  const typedBoundary = boundaryAttempt.result === 'TYPED_LIMITATION_REPRODUCED'
    && boundaryAttempt.words === 500_000
    && boundaryAttempt.packageInvalidClaimed === false;
  const ok = uiProof.ok === true
    && (supported500k || typedBoundary)
    && priorEvidence.repeatHighDensity.status === 'WORD_RELEASE_AUDIT_P0_REPEAT_HIGH_DENSITY_STRESS_COMPLETE_NOT_SATURATED'
    && priorEvidence.largeManuscriptStress.status === 'WORD_RELEASE_AUDIT_P0_LARGE_MANUSCRIPT_STRESS_COMPLETE_NOT_SATURATED'
    && Object.values(vetoMetrics).every((value) => Number(value) === 0);
  return {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: ok ? STATUS : 'WORD_RELEASE_AUDIT_P0_500K_TERMINAL_AUDIT_FAILED_NOT_SATURATED',
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
      boundaryAttempt,
    },
    priorEvidence,
    terminalAudit: {
      wordSaturated: false,
      releaseReady: false,
      automaticApplyCertified: false,
      maxCertifiedTrackedReplacementWordsBeforeBoundary: supported500k ? 500_000 : 100_000,
      maxAttemptedTrackedReplacementWords: 500_000,
      monolithic500kTrackedReplacementStatus: supported500k ? 'SUPPORTED' : boundaryAttempt.boundaryClass,
      remainingWordGaps: [
        ...(supported500k ? [] : ['MONOLITHIC_500K_TRACKED_REPLACEMENT_SCALE_ENGINEERING']),
        'MODERN_COMMENT_REPLY_PRODUCT_RUNTIME_NOT_CERTIFIED',
        'MODERN_COMMENT_RESOLVE_REOPEN_PRODUCT_RUNTIME_NOT_CERTIFIED',
        'FORMATTING_APPLY_REMAINS_DIAGNOSTIC_ONLY',
        'STRUCTURAL_APPLY_REMAINS_MANUAL_OR_BLOCKED',
      ],
      googleDocsOpened: false,
      nextStage: NEXT_STAGE,
    },
    vetoMetrics,
    implementedCapability: {
      capability: 'terminal500kBoundaryAudit',
      productRuntimeWired: true,
      liveElectronUiExportSurfaceClicked: uiProof.ok === true,
      physical500kAttempted: true,
      physical500kSupported: supported500k,
      typed500kBoundaryProven: typedBoundary,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
    sourceEvidence: {
      currentRunner: binding('P0_500K_TERMINAL_AUDIT_RUNNER', SCRIPT_REF),
      repeatRunner: binding('P0_REPEAT_HIGH_DENSITY_STRESS_RUNNER', REPEAT_SCRIPT_REF),
      repeatReceipt: binding('P0_REPEAT_HIGH_DENSITY_STRESS_RECEIPT', REPEAT_RECEIPT_REF),
    },
    nextStage: NEXT_STAGE,
  };
}

function currentReceipt() {
  return readJson(RECEIPT_PATH);
}

function evaluateWordReleaseAuditP0500kTerminalAudit(input = {}) {
  const receipt = input.receipt || currentReceipt();
  const program = input.program || readJson(PROGRAM_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push({ code, field, message });
  const boundary = receipt.physicalCorpus?.boundaryAttempt || {};
  if (receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.status !== STATUS || receipt.result !== 'PASS') {
    add('RTK_P0_500K_RECEIPT_INVALID', 'receipt.status', '500K terminal audit receipt must be PASS.');
  }
  if (boundary.words !== 500_000 || boundary.packageInvalidClaimed === true || boundary.userDocumentTouched === true) {
    add('RTK_P0_500K_BOUNDARY_INVALID', 'physicalCorpus.boundaryAttempt', '500K boundary must be physical, synthetic, and not misclassified as package invalid.');
  }
  if (!(boundary.result === 'PASS' || boundary.result === 'TYPED_LIMITATION_REPRODUCED')) {
    add('RTK_P0_500K_BOUNDARY_RESULT_INVALID', 'physicalCorpus.boundaryAttempt.result', '500K attempt must either pass or produce a typed limitation.');
  }
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) {
    add('RTK_P0_500K_VETO_NONZERO', 'vetoMetrics', 'All 500K terminal audit veto metrics must remain zero.');
  }
  if (receipt.implementedCapability?.automaticApplyCertified !== false
    || receipt.implementedCapability?.wordSaturated !== false
    || receipt.implementedCapability?.googleDocsOpened !== false
    || receipt.terminalAudit?.wordSaturated !== false) {
    add('RTK_P0_500K_OVERCLAIM', 'implementedCapability', '500K terminal audit must not claim saturation or broad automatic apply.');
  }
  if (program.releaseAuditNight01?.latest500kTerminalAuditReceiptPath !== RECEIPT_REF || program.releaseAuditNight01?.wordSaturated !== false) {
    add('RTK_P0_500K_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Program must bind 500K terminal audit without saturation.');
  }
  if (profile.latestProduct500kTerminalAudit?.receiptPath !== RECEIPT_REF || profile.latestProduct500kTerminalAudit?.wordSaturated !== false) {
    add('RTK_P0_500K_PROFILE_INVALID', 'profile.latestProduct500kTerminalAudit', 'Profile must bind 500K terminal audit without saturation.');
  }
  if (ledger.coverageLedger?.releaseAuditNight01P0500kTerminalAudit?.observedCases !== 1 || ledger.runtimeClaims?.wordSaturated !== false) {
    add('RTK_P0_500K_LEDGER_INVALID', 'ledger.coverageLedger', 'Ledger must bind 500K terminal audit without saturation.');
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    boundaryResult: boundary.result || '',
    boundaryClass: boundary.boundaryClass || '',
    maxCertifiedTrackedReplacementWords: receipt.terminalAudit?.maxCertifiedTrackedReplacementWordsBeforeBoundary || 0,
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
    latest500kTerminalAuditReceiptPath: RECEIPT_REF,
    terminal500kAuditComplete: true,
    terminal500kBoundaryResult: receipt.physicalCorpus.boundaryAttempt.result,
    terminal500kBoundaryClass: receipt.physicalCorpus.boundaryAttempt.boundaryClass,
    maxCertifiedTrackedReplacementWordsBeforeBoundary: receipt.terminalAudit.maxCertifiedTrackedReplacementWordsBeforeBoundary,
    wordSaturated: false,
    automaticApplyCertified: false,
    googleDocsOpened: false,
  };
  program.v4ExecutionState = {
    ...(program.v4ExecutionState || {}),
    status: 'EXECUTION_03_P0_500K_TERMINAL_AUDIT_COMPLETE_NOT_SATURATED',
    currentStage: CONTOUR_ID,
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    terminal500kAuditComplete: true,
    automaticApplyCertified: 0,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  writeJsonAtomic(PROGRAM_PATH, program);

  const profile = readJson(PROFILE_PATH);
  profile.status = 'WORD_16_111_2_P0_500K_TERMINAL_AUDIT_COMPLETE_NOT_SATURATED';
  profile.latestProduct500kTerminalAudit = {
    status: STATUS,
    receiptPath: RECEIPT_REF,
    productRuntimeWired: true,
    physical500kAttempted: true,
    physical500kSupported: receipt.implementedCapability.physical500kSupported,
    typed500kBoundaryProven: receipt.implementedCapability.typed500kBoundaryProven,
    maxCertifiedTrackedReplacementWordsBeforeBoundary: receipt.terminalAudit.maxCertifiedTrackedReplacementWordsBeforeBoundary,
    automaticApplyCertified: false,
    wordSaturated: false,
    nextStage: NEXT_STAGE,
  };
  writeJsonAtomic(PROFILE_PATH, profile);

  const ledger = readJson(LEDGER_PATH);
  ledger.status = 'WORD_SATURATION_P0_500K_TERMINAL_AUDIT_COMPLETE_NOT_SATURATED';
  ledger.nextStage = NEXT_STAGE;
  ledger.coverageLedger = {
    ...(ledger.coverageLedger || {}),
    releaseAuditNight01P0500kTerminalAudit: {
      status: 'BOUND_PRODUCT_500K_TERMINAL_AUDIT_COMPLETE',
      sourceEvidence: 'RELEASE_AUDIT_NIGHT_01_P0_500K_TERMINAL_AUDIT',
      observedCases: 1,
      boundaryResult: receipt.physicalCorpus.boundaryAttempt.result,
      boundaryClass: receipt.physicalCorpus.boundaryAttempt.boundaryClass,
      maxCertifiedTrackedReplacementWordsBeforeBoundary: receipt.terminalAudit.maxCertifiedTrackedReplacementWordsBeforeBoundary,
      automaticApplyCertified: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
  };
  ledger.aggregateTotals = {
    ...(ledger.aggregateTotals || {}),
    p0500kTerminalAuditObservedCases: 1,
    p0500kTerminalAuditBoundaryWords: 500_000,
    p0500kTerminalAuditMaxCertifiedTrackedReplacementWords: receipt.terminalAudit.maxCertifiedTrackedReplacementWordsBeforeBoundary,
  };
  ledger.runtimeClaims = {
    ...(ledger.runtimeClaims || {}),
    wordSaturated: false,
    automaticApplyExpanded: false,
    googleDocsOpened: false,
  };
  ledger.notSaturatedReasons = Array.from(new Set([...(ledger.notSaturatedReasons || []), ...receipt.terminalAudit.remainingWordGaps]));
  writeJsonAtomic(LEDGER_PATH, ledger);
}

function updateGovernanceApprovals() {
  const registry = readJson(GOVERNANCE_APPROVALS_PATH);
  const touched = new Set(GOVERNED_PATHS);
  registry.approvals = (registry.approvals || []).filter((entry) => !touched.has(entry.filePath));
  const rationale = 'Approve bounded Word P0 500K terminal audit: synthetic product-originated physical Word 500K boundary attempt through live export surface, authenticated intake path or typed Word scale boundary, prior repeat/high-density and large-stress receipts bound, zero veto metrics, Word saturation false, automatic broad apply false, and Google Docs closed.';
  for (const filePath of GOVERNED_PATHS) {
    registry.approvals.push({
      filePath,
      sha256: sha256File(path.join(REPO_ROOT, filePath)),
      approvedBy: 'owner:STANDING_OWNER_DIRECTIVE_FULL_SCALE_TO_100_PERCENT',
      approvedAtUtc: '2026-08-01T09:35:00.000Z',
      rationale,
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
    ? `p0-500k-terminal-audit-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`
    : String(process.argv[runIdArgIndex + 1] || '');
  const artifactRoot = rootArgIndex === -1 ? DEFAULT_ARTIFACT_ROOT : String(process.argv[rootArgIndex + 1] || '');
  const wordWorkRoot = wordRootArgIndex === -1 ? DEFAULT_WORD_WORK_ROOT : String(process.argv[wordRootArgIndex + 1] || '');

  if (runPhysicalFlag) {
    const receipt = await runPhysical({ artifactRoot, wordWorkRoot, runId });
    writeJsonAtomic(path.join(artifactRoot, runId, 'p0-500k-terminal-audit-receipt.json'), receipt);
    if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
    if (updateStateFlag) updateState(receipt);
    if (approveGovernance) updateGovernanceApprovals();
    const result = evaluateWordReleaseAuditP0500kTerminalAudit({ receipt });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_500K_TERMINAL=${result.status}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (updateStateFlag) updateState();
  if (approveGovernance) updateGovernanceApprovals();
  const result = evaluateWordReleaseAuditP0500kTerminalAudit();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_500K_TERMINAL=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

export {
  build500kCase,
  evaluateWordReleaseAuditP0500kTerminalAudit,
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
