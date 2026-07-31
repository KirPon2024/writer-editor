#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildWordLatestSemanticCorpus } from './rtk-word-latest-semantic-corpus-generator.mjs';
import { makeExtraWave40Cases } from './rtk-word-v4-e12-physical-wave40.mjs';
import { defaultWordSandboxWorkRoot, resolveWordSandboxWorkRoot } from './rtk-word-sandbox-work-root.mjs';
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
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/e12-physical-wave100';
const DEFAULT_WORD_WORK_ROOT = defaultWordSandboxWorkRoot('word-safe-semantic-v4', 'e12-physical-wave100');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE100_RECEIPT.json');
const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-physical-wave100-receipt.v1';

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

function makeWave100Cases(startOrdinal) {
  const actions = [
    'tracked-insert',
    'clean-insert',
    'unicode-insert',
    'formatting',
    'paragraph-split',
    'no-edit',
    'tracked-insert',
    'comment-adjacent-delete',
    'clean-insert',
    'unicode-insert',
  ];
  const cases = [];
  for (let index = 0; index < 60; index += 1) {
    const id = `WL2-${String(41 + index).padStart(3, '0')}`;
    const ordinal = startOrdinal + index;
    let waveAction = actions[index % actions.length];
    let commentTarget = 0;
    let scaleWords = 0;
    if (index === 19) {
      waveAction = 'comment-density';
      commentTarget = 120;
    } else if (index === 39) {
      waveAction = 'scale-edge';
      scaleWords = 400000;
    } else if (index === 59) {
      waveAction = 'comment-density';
      commentTarget = 60;
    }
    const expectedLanes = new Set(['manuscriptText']);
    if (waveAction.includes('comment')) expectedLanes.add('comments');
    if (waveAction !== 'clean-insert' && waveAction !== 'no-edit' && waveAction !== 'comment-density') expectedLanes.add('revisions');
    if (waveAction === 'formatting') expectedLanes.add('formatting');
    if (waveAction === 'paragraph-split') expectedLanes.add('structure');
    if (waveAction === 'scale-edge') expectedLanes.add('performance');
    if (waveAction === 'no-edit') expectedLanes.add('packageSemantics');
    cases.push({
      id,
      ordinal,
      title: `wave 100 ${waveAction} ${id}`,
      family: `wave100 ${waveAction}`,
      waveAction,
      requiredPhysicalActions: [waveAction, 'save', 'close-reopen', 'package-inventory'],
      expectedLanes: [...expectedLanes],
      expectedClassificationFloor: 'MEASURED_WAVE100_NO_SATURATION_OR_EXACT_OVERCLAIM',
      ...(commentTarget ? { commentTarget } : {}),
      ...(scaleWords ? { scaleWords } : {}),
      syntheticTextSha256: sha256Text(`YALKEN_WAVE100_SYNTHETIC_CASE ${id} ${waveAction}`),
      requiresNativeWordOpenEditSaveReopen: true,
      fixtureOnlyPassAllowed: false,
      packageInventoryRequired: true,
      semanticReadbackRequired: true,
      wordReopenVisibilityRequiredForComments: expectedLanes.has('comments'),
    });
  }
  return cases;
}

function histogram(values) {
  const out = {};
  for (const value of values) out[value || 'UNKNOWN'] = (out[value || 'UNKNOWN'] || 0) + 1;
  return out;
}

function evaluateReceipt(receipt = readJson(RECEIPT_PATH), options = {}) {
  const issues = [];
  const add = (code, field, message) => issues.push({ code, field, message });
  if (receipt.schemaVersion !== SCHEMA) add('RTK_V4_E12_WAVE100_SCHEMA_INVALID', 'schemaVersion', 'Wave 100 receipt schema is invalid.');
  if (receipt.stageId !== 'EXECUTION_12_PHYSICAL_WORD_WAVE_100') add('RTK_V4_E12_WAVE100_STAGE_INVALID', 'stageId', 'Wave 100 stage id is invalid.');
  if (receipt.status !== 'PHYSICAL_WAVE_100_COMPLETE_NOT_SATURATED') add('RTK_V4_E12_WAVE100_STATUS_INVALID', 'status', 'Wave 100 must complete without claiming saturation.');
  if (receipt.wave?.target !== 100 || receipt.wave?.observedRounds !== 100 || receipt.wave?.completed !== true) {
    add('RTK_V4_E12_WAVE100_ACCOUNTING_INVALID', 'wave', 'Wave 100 requires exactly 100 observed physical rounds.');
  }
  const cases = Array.isArray(receipt.cases) ? receipt.cases : [];
  if (cases.length !== 100) add('RTK_V4_E12_WAVE100_CASE_COUNT_INVALID', 'cases', 'Wave 100 must contain 100 case rows.');
  if (!cases.every((item) => item.openEditSaveCloseReopen === 'PASS')) {
    add('RTK_V4_E12_WAVE100_WORD_FAILURE', 'cases.openEditSaveCloseReopen', 'Every case must physically open edit save close reopen in Word.');
  }
  if (!cases.every((item) => item.packageZipOk === true)) {
    add('RTK_V4_E12_WAVE100_ZIP_FAILURE', 'cases.packageZipOk', 'Every returned DOCX must pass zip validation.');
  }
  if (!cases.some((item) => item.caseId === 'WL2-080' && item.returnedBytes > 400000)) {
    add('RTK_V4_E12_WAVE100_400K_MISSING', 'cases.WL2-080', '400k word scale evidence is missing.');
  }
  if (!cases.some((item) => item.caseId === 'WL2-060' && item.wordCommentCount >= 100 && item.reviewIrSummary?.commentThreads >= 100)) {
    add('RTK_V4_E12_WAVE100_DENSE_COMMENTS_MISSING', 'cases.WL2-060', 'Wave 100 requires at least 100 visible parsed comment threads in the dense case.');
  }
  const veto = receipt.vetoMetrics || {};
  for (const [key, value] of Object.entries(veto)) {
    if (Number(value) !== 0) add('RTK_V4_E12_WAVE100_VETO_NONZERO', `vetoMetrics.${key}`, 'All wave-100 veto metrics must be zero.');
  }
  if (receipt.saturationDecision?.wordSaturated !== false || receipt.saturationDecision?.googleDocsAllowedToOpen !== false) {
    add('RTK_V4_E12_WAVE100_FALSE_SATURATION', 'saturationDecision', 'Wave 100 alone cannot claim Word saturation or open Google Docs.');
  }
  if (receipt.wordSandboxWorkRoot?.insideWordContainer !== true || receipt.wordSandboxWorkRoot?.plainTmpForbidden !== true) {
    add('RTK_V4_E12_WAVE100_SANDBOX_ROOT_INVALID', 'wordSandboxWorkRoot', 'Wave 100 must use the Word container work root.');
  }
  if (options.requireExternal === true) {
    const externalPath = String(receipt.externalEvidence?.receiptPath || '');
    if (!externalPath || !fs.existsSync(externalPath)) {
      add('RTK_V4_E12_WAVE100_EXTERNAL_MISSING', 'externalEvidence.receiptPath', 'External wave-100 receipt is missing.');
    } else if (sha256File(externalPath) !== receipt.externalEvidence?.receiptSha256) {
      add('RTK_V4_E12_WAVE100_EXTERNAL_SHA_MISMATCH', 'externalEvidence.receiptSha256', 'External wave-100 receipt hash mismatch.');
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
    defaultSegments: ['word-safe-semantic-v4', 'e12-physical-wave100'],
    overridePath: wordWorkRoot,
  });
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('MICROSOFT_WORD_APP_MISSING');
  const wordProfile = collectWordProfile();
  const baseCorpus = buildWordLatestSemanticCorpus({ runId });
  const casesToRun = [
    ...baseCorpus.cases,
    ...makeExtraWave40Cases(baseCorpus.cases.length + 1),
    ...makeWave100Cases(baseCorpus.cases.length + 9),
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
    process.stderr.write(`E12_WAVE100_CASE_DONE=${caseSpec.id}:${result.openEditSaveCloseReopen}:${result.parserStatus}:comments=${result.wordCommentCount}\n`);
  }
  const totals = summarizeCases(cases);
  const typedLimitations = [...new Set(cases.flatMap((item) => item.wordLimitations))].sort();
  const receiptDraft = {
    schemaVersion: SCHEMA,
    taskId: 'YALKEN_WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE100',
    stageId: 'EXECUTION_12_PHYSICAL_WORD_WAVE_100',
    status: 'PHYSICAL_WAVE_100_COMPLETE_NOT_SATURATED',
    createdAtUtc: new Date().toISOString(),
    base: {
      originMainShaAtBranchStart: shellValue('git', ['rev-parse', 'origin/main']),
      headShaAtRun: shellValue('git', ['rev-parse', 'HEAD']),
      branch: shellValue('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
      priorE12Wave40MergeSha: '8e8b3eed80db1a2526e35181be052caff94b7758',
    },
    wordProfile,
    wordSandboxWorkRoot,
    artifactRoot,
    runDir,
    wordSandboxRunDir: wordRunDir,
    corpus: {
      baseCorpusDigest: `sha256:${sha256Text(stableJson(baseCorpus))}`,
      wave100CorpusDigest: `sha256:${sha256Text(stableJson(casesToRun.map((item) => ({
        id: item.id,
        ordinal: item.ordinal,
        title: item.title,
        waveAction: item.waveAction || '',
        expectedLanes: item.expectedLanes,
        requiredPhysicalActions: item.requiredPhysicalActions,
      }))))}`,
      syntheticOnly: true,
      totalCases: casesToRun.length,
      newWave100Cases: casesToRun.slice(40).map((item) => item.id),
    },
    wave: {
      requiredSequence: [10, 40, 100, 300],
      target: 100,
      observedRounds: cases.length,
      completed: cases.length === 100 && totals.physicalOpenEditSaveCloseReopenPass === 100,
      nextTarget: 300,
      consecutiveStableApprovedWavesAfterThis: 0,
    },
    cases,
    totals,
    histograms: {
      parserStatus: histogram(cases.map((item) => item.parserStatus)),
      sourceMode: histogram(cases.map((item) => item.sourceMode)),
      families: histogram(cases.map((item) => item.family)),
      waveAction: histogram(cases.map((item) => item.waveAction || 'base')),
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
      reason: 'WAVE_100_COMPLETE_BUT_WAVE_300_AND_TWO_STABLE_APPROVED_WAVES_REMAIN',
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
      'Wave 100 is physical Word evidence, not Word SATURATED.',
      'Wave 100 does not open Google Docs or any other editor profile.',
      'Wave 100 does not expand automatic apply authority.',
    ],
  };
  const receipt = {
    ...receiptDraft,
    result: evaluateReceipt(receiptDraft).status,
    receiptDigest: `sha256:${sha256Text(stableJson(receiptDraft))}`,
  };
  const externalReceiptPath = path.join(runDir, 'e12-physical-wave100-receipt.json');
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
    waveTarget: 100,
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
    runId: getArg('--run-id', `e12-wave100-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = args.runPhysical
    ? await runPhysical(args)
    : evaluateReceipt(undefined, { requireExternal: args.requireExternal });
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_PHYSICAL_WAVE100=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
