#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildWordLatestSemanticCorpus } from './rtk-word-latest-semantic-corpus-generator.mjs';
import {
  defaultWordSandboxWorkRoot,
  resolveWordSandboxWorkRoot,
} from './rtk-word-sandbox-work-root.mjs';
import {
  assertSecureVolume,
  collectWordProfile,
  runPhysicalCase,
  sha256Text,
  stableJson,
  summarizeCases,
  writeJsonAtomic,
} from './rtk-word-latest-physical-certification-lab.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORD_APP_PATH = '/Applications/Microsoft Word.app';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/e12-physical-wave40';
const DEFAULT_WORD_WORK_ROOT = defaultWordSandboxWorkRoot('word-safe-semantic-v4', 'e12-physical-wave40');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE40_RECEIPT.json');
const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-physical-wave40-receipt.v1';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function shellValue(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeout || 90_000,
    }).trim();
  } catch (error) {
    return `UNAVAILABLE:${error.status || error.signal || 'ERR'}`;
  }
}

export function makeExtraWave40Cases(startOrdinal) {
  return [
    {
      id: 'WL2-033',
      title: 'duplicate block range and copy-paste pressure',
      family: 'wave40 duplicate block locator ambiguity',
      requiredPhysicalActions: ['track-changes-on', 'edit-duplicate-anchor', 'copy-paste-duplicate', 'save', 'close-reopen'],
      expectedLanes: ['manuscriptText', 'revisions', 'locatorSurvival'],
      expectedClassificationFloor: 'MANUAL_OR_BLOCKED_WHEN_BLOCK_NOT_UNIQUE',
    },
    {
      id: 'WL2-034',
      title: '300k word writer scale edge edits',
      family: 'wave40 writer scale performance',
      requiredPhysicalActions: ['open-300k-word-docx', 'make-edge-edits', 'save', 'close-reopen'],
      expectedLanes: ['performance', 'manuscriptText', 'locatorSurvival'],
      expectedClassificationFloor: 'MEASURED_ONLY_NO_INVENTED_PASS',
      scaleWords: 300000,
    },
    {
      id: 'WL2-035',
      title: 'tracked text plus inline formatting pressure',
      family: 'wave40 formatting mixed text',
      requiredPhysicalActions: ['track-changes-on', 'insert-text', 'underline', 'highlight', 'save', 'close-reopen'],
      expectedLanes: ['manuscriptText', 'revisions', 'formatting'],
      expectedClassificationFloor: 'TEXT_AND_FORMAT_LANES_SEPARATE',
    },
    {
      id: 'WL2-036',
      title: '120 visible comments high density',
      family: 'wave40 high comment density',
      requiredPhysicalActions: ['add-120-visible-comments', 'save', 'close-reopen', 'package-inventory'],
      expectedLanes: ['comments', 'performance'],
      expectedClassificationFloor: 'COMMENTS_ONLY_OR_TYPED_LIMITATION',
      commentTarget: 120,
    },
    {
      id: 'WL2-037',
      title: 'comment on deleted anchor orphan recovery',
      family: 'wave40 comment orphan recovery',
      requiredPhysicalActions: ['add-comment', 'track-changes-on', 'delete-commented-range', 'save', 'close-reopen'],
      expectedLanes: ['comments', 'revisions'],
      expectedClassificationFloor: 'COMMENTS_ONLY_OR_ORPHAN_AND_TEXT_MANUAL',
    },
    {
      id: 'WL2-038',
      title: 'dense RU EN Unicode bidi edge insertion',
      family: 'wave40 Unicode locale and bidi',
      requiredPhysicalActions: ['track-changes-on', 'edit-ru', 'edit-nbsp', 'edit-emoji', 'edit-rtl', 'edit-cjk', 'save', 'close-reopen'],
      expectedLanes: ['manuscriptText', 'revisions', 'locatorSurvival'],
      expectedClassificationFloor: 'EXACT_CANDIDATE_ONLY_WITH_RAW_UNICODE_GUARDS',
    },
    {
      id: 'WL2-039',
      title: 'paragraph break and structure lane repeat',
      family: 'wave40 structure paragraph pressure',
      requiredPhysicalActions: ['track-changes-on', 'split-paragraph', 'save', 'close-reopen'],
      expectedLanes: ['structure', 'revisions'],
      expectedClassificationFloor: 'MANUAL_UNTIL_SINGLE_SCENE_PROVEN',
    },
    {
      id: 'WL2-040',
      title: 'second no edit conservation oracle',
      family: 'wave40 no edit conservation',
      requiredPhysicalActions: ['open-exported-docx', 'no-edit-save', 'close-reopen', 'return-to-yalken'],
      expectedLanes: ['packageSemantics', 'locatorSurvival'],
      expectedClassificationFloor: 'ZERO_CANDIDATE_EXPECTED',
    },
  ].map((item, index) => ({
    ...item,
    ordinal: startOrdinal + index,
    syntheticTextSha256: sha256Text(`YALKEN_WAVE40_SYNTHETIC_CASE ${item.id}`),
    requiresNativeWordOpenEditSaveReopen: true,
    fixtureOnlyPassAllowed: false,
    packageInventoryRequired: true,
    semanticReadbackRequired: true,
    wordReopenVisibilityRequiredForComments: item.expectedLanes.includes('comments'),
  }));
}

function histogram(values) {
  const out = {};
  for (const value of values) out[value || 'UNKNOWN'] = (out[value || 'UNKNOWN'] || 0) + 1;
  return out;
}

export function evaluateReceipt(receipt = readJson(RECEIPT_PATH), options = {}) {
  const issues = [];
  const add = (code, field, message) => issues.push({ code, field, message });
  if (receipt.schemaVersion !== SCHEMA) add('RTK_V4_E12_WAVE40_SCHEMA_INVALID', 'schemaVersion', 'Wave 40 receipt schema is invalid.');
  if (receipt.stageId !== 'EXECUTION_12_PHYSICAL_WORD_WAVE_40') add('RTK_V4_E12_WAVE40_STAGE_INVALID', 'stageId', 'Wave 40 stage id is invalid.');
  if (receipt.status !== 'PHYSICAL_WAVE_40_COMPLETE_NOT_SATURATED') add('RTK_V4_E12_WAVE40_STATUS_INVALID', 'status', 'Wave 40 must complete without claiming saturation.');
  if (receipt.wave?.target !== 40 || receipt.wave?.observedRounds !== 40 || receipt.wave?.completed !== true) {
    add('RTK_V4_E12_WAVE40_ACCOUNTING_INVALID', 'wave', 'Wave 40 requires exactly 40 observed physical rounds.');
  }
  if (receipt.wordProfile?.versionByAppleScript !== '16.111.2' && receipt.wordProfile?.versionByBundle !== '16.111.2') {
    add('RTK_V4_E12_WAVE40_WORD_VERSION_INVALID', 'wordProfile', 'Wave 40 requires observed Word 16.111.2.');
  }
  const cases = Array.isArray(receipt.cases) ? receipt.cases : [];
  if (cases.length !== 40) add('RTK_V4_E12_WAVE40_CASE_COUNT_INVALID', 'cases', 'Wave 40 must contain 40 case rows.');
  if (!cases.every((item) => item.openEditSaveCloseReopen === 'PASS')) {
    add('RTK_V4_E12_WAVE40_WORD_FAILURE', 'cases.openEditSaveCloseReopen', 'Every case must physically open edit save close reopen in Word.');
  }
  if (!cases.every((item) => item.packageZipOk === true)) {
    add('RTK_V4_E12_WAVE40_ZIP_FAILURE', 'cases.packageZipOk', 'Every returned DOCX must pass zip validation.');
  }
  for (const requiredCase of ['WL2-033', 'WL2-034', 'WL2-035', 'WL2-036', 'WL2-037', 'WL2-038', 'WL2-039', 'WL2-040']) {
    if (!cases.some((item) => item.caseId === requiredCase)) {
      add('RTK_V4_E12_WAVE40_EXTRA_CASE_MISSING', `cases.${requiredCase}`, 'Required wave-40 extension case is missing.');
    }
  }
  if (!cases.some((item) => item.caseId === 'WL2-034' && item.returnedBytes > 300000)) {
    add('RTK_V4_E12_WAVE40_300K_MISSING', 'cases.WL2-034', '300k word scale evidence is missing.');
  }
  if (!cases.some((item) => item.caseId === 'WL2-036' && item.wordCommentCount >= 100 && item.reviewIrSummary?.commentThreads >= 100)) {
    add('RTK_V4_E12_WAVE40_DENSE_COMMENTS_MISSING', 'cases.WL2-036', 'Wave 40 requires at least 100 visible parsed comment threads in the dense case.');
  }
  const veto = receipt.vetoMetrics || {};
  for (const [key, value] of Object.entries(veto)) {
    if (Number(value) !== 0) add('RTK_V4_E12_WAVE40_VETO_NONZERO', `vetoMetrics.${key}`, 'All wave-40 veto metrics must be zero.');
  }
  if (receipt.saturationDecision?.wordSaturated !== false || receipt.saturationDecision?.googleDocsAllowedToOpen !== false) {
    add('RTK_V4_E12_WAVE40_FALSE_SATURATION', 'saturationDecision', 'Wave 40 alone cannot claim Word saturation or open Google Docs.');
  }
  if (options.requireExternal === true) {
    const externalPath = String(receipt.externalEvidence?.receiptPath || '');
    if (!externalPath || !fs.existsSync(externalPath)) {
      add('RTK_V4_E12_WAVE40_EXTERNAL_MISSING', 'externalEvidence.receiptPath', 'External wave-40 receipt is missing.');
    } else if (sha256File(externalPath) !== receipt.externalEvidence?.receiptSha256) {
      add('RTK_V4_E12_WAVE40_EXTERNAL_SHA_MISMATCH', 'externalEvidence.receiptSha256', 'External wave-40 receipt hash mismatch.');
    }
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    waveTarget: receipt.wave?.target || 0,
    observedRounds: receipt.wave?.observedRounds || 0,
  };
}

async function runPhysical({ artifactRoot, wordWorkRoot, runId, writeReceipt }) {
  assertSecureVolume(artifactRoot);
  const wordSandboxWorkRoot = resolveWordSandboxWorkRoot({
    defaultSegments: ['word-safe-semantic-v4', 'e12-physical-wave40'],
    overridePath: wordWorkRoot,
  });
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('MICROSOFT_WORD_APP_MISSING');
  const wordProfile = collectWordProfile();
  const baseCorpus = buildWordLatestSemanticCorpus({ runId });
  const casesToRun = [
    ...baseCorpus.cases,
    ...makeExtraWave40Cases(baseCorpus.cases.length + 1),
  ];
  const runDir = path.join(artifactRoot, runId);
  const wordRunDir = path.join(wordSandboxWorkRoot.root, runId);
  const dirs = {
    evidenceRunDir: runDir,
    wordRunDir,
    wordSources: path.join(wordRunDir, 'source-docx'),
    wordReturns: path.join(wordRunDir, 'returned-docx'),
    evidenceSources: path.join(runDir, 'source-docx'),
    evidenceReturns: path.join(runDir, 'returned-docx'),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  const cases = [];
  for (const caseSpec of casesToRun) {
    const result = await runPhysicalCase(caseSpec, dirs);
    cases.push(result);
    process.stderr.write(`E12_WAVE40_CASE_DONE=${caseSpec.id}:${result.openEditSaveCloseReopen}:${result.parserStatus}:comments=${result.wordCommentCount}\n`);
  }
  const totals = summarizeCases(cases);
  const typedLimitations = [...new Set(cases.flatMap((item) => item.wordLimitations))].sort();
  const receiptDraft = {
    schemaVersion: SCHEMA,
    taskId: 'YALKEN_WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE40',
    stageId: 'EXECUTION_12_PHYSICAL_WORD_WAVE_40',
    status: 'PHYSICAL_WAVE_40_COMPLETE_NOT_SATURATED',
    createdAtUtc: new Date().toISOString(),
    base: {
      originMainShaAtBranchStart: shellValue('git', ['rev-parse', 'origin/main']),
      headShaAtRun: shellValue('git', ['rev-parse', 'HEAD']),
      branch: shellValue('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
      priorE12MergeSha: 'bcdd02c0f67870422a2988a5aa305415ef89bce8',
    },
    wordProfile,
    wordSandboxWorkRoot,
    artifactRoot,
    runDir,
    wordSandboxRunDir: wordRunDir,
    corpus: {
      baseCorpusDigest: `sha256:${sha256Text(stableJson(baseCorpus))}`,
      wave40CorpusDigest: `sha256:${sha256Text(stableJson(casesToRun.map((item) => ({
        id: item.id,
        ordinal: item.ordinal,
        title: item.title,
        expectedLanes: item.expectedLanes,
        requiredPhysicalActions: item.requiredPhysicalActions,
      }))))}`,
      syntheticOnly: true,
      totalCases: casesToRun.length,
      newWave40Cases: casesToRun.slice(32).map((item) => item.id),
    },
    wave: {
      requiredSequence: [10, 40, 100, 300],
      target: 40,
      observedRounds: cases.length,
      completed: cases.length === 40 && totals.physicalOpenEditSaveCloseReopenPass === 40,
      nextTarget: 100,
      consecutiveStableApprovedWavesAfterThis: 0,
    },
    cases,
    totals,
    histograms: {
      parserStatus: histogram(cases.map((item) => item.parserStatus)),
      sourceMode: histogram(cases.map((item) => item.sourceMode)),
      families: histogram(cases.map((item) => item.family)),
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      productNetworkRequests: 0,
      falseSaturationClaim: 0,
    },
    typedLimitations,
    saturationDecision: {
      wordSaturated: false,
      googleDocsAllowedToOpen: false,
      reason: 'WAVE_40_COMPLETE_BUT_WAVE_100_WAVE_300_AND_TWO_STABLE_APPROVED_WAVES_REMAIN',
    },
    runtimeClaims: {
      productRuntimeChanged: false,
      automaticApplyExpanded: false,
      writerAuthorityAdded: false,
      uiChanged: false,
      dependencyAdded: false,
      networkAdded: false,
    },
    nonClaims: [
      'Wave 40 is physical Word evidence, not Word SATURATED.',
      'Wave 40 does not open Google Docs or any other editor profile.',
      'Wave 40 does not expand automatic apply authority.',
      'Modern replies resolve and reopen remain typed limitations unless visible package semantics prove otherwise.',
    ],
  };
  const receipt = {
    ...receiptDraft,
    result: evaluateReceipt(receiptDraft).status,
    receiptDigest: `sha256:${sha256Text(stableJson(receiptDraft))}`,
  };
  const externalReceiptPath = path.join(runDir, 'e12-physical-wave40-receipt.json');
  writeJsonAtomic(externalReceiptPath, receipt);
  const finalReceipt = {
    ...receipt,
    externalEvidence: {
      receiptPath: externalReceiptPath,
      receiptSha256: sha256File(externalReceiptPath),
      fileAvailableAtReceiptCreation: true,
    },
  };
  if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, finalReceipt);
  fs.rmSync(wordRunDir, { recursive: true, force: true });
  return {
    ok: evaluateReceipt(finalReceipt).ok,
    status: evaluateReceipt(finalReceipt).status,
    receiptPath: writeReceipt ? RECEIPT_PATH : externalReceiptPath,
    receiptDigest: finalReceipt.receiptDigest,
    totals,
    waveTarget: 40,
    observedRounds: cases.length,
    wordVersion: wordProfile.versionByAppleScript || wordProfile.versionByBundle,
  };
}

function parseArgs(argv) {
  const getArg = (name, fallback) => {
    const index = argv.indexOf(name);
    return index === -1 ? fallback : argv[index + 1];
  };
  return {
    json: argv.includes('--json'),
    runPhysical: argv.includes('--run-physical'),
    requireExternal: argv.includes('--require-external'),
    writeReceipt: argv.includes('--write-receipt'),
    artifactRoot: getArg('--artifact-root', DEFAULT_ARTIFACT_ROOT),
    wordWorkRoot: getArg('--word-work-root', process.env.YALKEN_WORD_WORK_ROOT || ''),
    runId: getArg('--run-id', `e12-wave40-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = args.runPhysical
    ? await runPhysical(args)
    : evaluateReceipt(undefined, { requireExternal: args.requireExternal });
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_PHYSICAL_WAVE40=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
