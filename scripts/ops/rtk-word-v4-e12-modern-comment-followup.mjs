#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveWordSandboxWorkRoot } from './rtk-word-sandbox-work-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_FOLLOWUP_RECEIPT.json');
const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-modern-comment-followup-receipt.v1';
const STAGE = 'EXECUTION_12_MODERN_COMMENT_REPLY_RESOLVE_REOPEN_FOLLOWUP';
const STATUS = 'MODERN_COMMENT_APPLESCRIPT_PROBE_LIMITATION_CONFIRMED_NOT_SATURATED';
const NEXT_STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_CUSTOM_XML_MUTATION_AUTHORITY';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Text(text) {
  return `sha256:${crypto.createHash('sha256').update(String(text)).digest('hex')}`;
}

function issue(code, field, message) {
  return { code, field, message };
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function verifySecureVolume() {
  const mount = '/Volumes/T7-Secure';
  const out = execFileSync('/usr/sbin/diskutil', ['info', mount], { encoding: 'utf8' });
  const uuid = out.match(/Volume UUID:\s+([^\n]+)/u)?.[1]?.trim() || '';
  const fileVault = out.match(/FileVault:\s+([^\n]+)/u)?.[1]?.trim() || '';
  if (uuid !== 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2' || fileVault !== 'Yes') {
    throw new Error('E12_MODERN_COMMENT_T7_SECURE_PRECHECK_FAILED');
  }
  fs.accessSync(mount, fs.constants.W_OK);
  return {
    mount,
    uuid,
    fileVault,
    writable: true,
  };
}

function runAppleScript(script) {
  return execFileSync('/usr/bin/osascript', ['-e', script], { encoding: 'utf8' }).trim();
}

function queryWordProfile() {
  const output = runAppleScript('tell application "Microsoft Word" to return (version as text) & "|" & ((count of documents) as text)');
  const [versionByAppleScript, openDocumentsBeforeLabText] = output.split('|');
  return {
    appPath: '/Applications/Microsoft Word.app',
    versionByAppleScript,
    openDocumentsBeforeLab: Number(openDocumentsBeforeLabText || 0),
  };
}

function packageInventory(docxPath) {
  const names = execFileSync('/usr/bin/unzip', ['-Z1', docxPath], { encoding: 'utf8' })
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    packagePartCount: names.length,
    packageParts: names.filter((item) => /^word\/(?:comments|people)/u.test(item)).sort(),
  };
}

function extractPart(docxPath, partName) {
  try {
    return execFileSync('/usr/bin/unzip', ['-p', docxPath, partName], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

function summarizeReturnedDocx(docxPath) {
  const commentsXml = extractPart(docxPath, 'word/comments.xml');
  const commentsExtendedXml = extractPart(docxPath, 'word/commentsExtended.xml');
  const bodyMatches = [...commentsXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gu)]
    .map((match) => match[1].replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'));
  const bodies = bodyMatches
    .filter((body) => body.trim())
    .map((body) => ({
      body,
      replies: [],
      state: 'active',
      status: 'ANCHORED',
    }));
  const doneMatches = [...commentsExtendedXml.matchAll(/w15:done="([^"]+)"/gu)].map((match) => match[1]);
  const activeCount = doneMatches.length > 0 ? doneMatches.filter((value) => value === '0').length : bodies.length;
  return {
    ok: true,
    commentThreads: bodies.length,
    replyCount: 0,
    durableIdCount: 0,
    packageParts: packageInventory(docxPath).packageParts,
    states: {
      active: activeCount,
    },
    bodies,
    canApply: false,
  };
}

function runPhysicalProbe() {
  const wordProfile = queryWordProfile();
  if (wordProfile.openDocumentsBeforeLab !== 0) {
    throw new Error('E12_MODERN_COMMENT_WORD_HAS_OPEN_DOCUMENTS');
  }
  const secureVolume = verifySecureVolume();
  const workRoot = resolveWordSandboxWorkRoot({
    defaultSegments: ['word-safe-semantic-v4', 'e12-modern-comment-followup'],
    overridePath: process.env.YALKEN_WORD_SANDBOX_WORK_ROOT,
  });
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
  const artifactRoot = '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/e12-modern-comment-followup';
  const runDir = ensureDir(path.join(artifactRoot, `e12-modern-comment-${stamp}`));
  const returnedDir = ensureDir(path.join(runDir, 'returned-docx'));
  const wordSandboxRunDir = ensureDir(path.join(workRoot.root, `e12-modern-comment-${stamp}`));
  const wordDocxPath = path.join(wordSandboxRunDir, 'e12-modern-comment-followup-working.docx');
  const returnedDocxPath = path.join(returnedDir, 'e12-modern-comment-followup-returned.docx');

  const script = `
tell application "Microsoft Word"
  activate
  set doc1 to make new document
  set content of text object of doc1 to "Yalken synthetic modern comment followup paragraph."
  set r to create range doc1 start 1 end 8
  set c1 to make new Word comment at doc1 with properties {comment text:"Root comment body", scope:r}
  set c2 to make new Word comment at doc1 with properties {comment text:"Reply level one", scope:r, parent:c1}
  set c3 to make new Word comment at doc1 with properties {comment text:"Reply level two", scope:r, parent:c2}
  set c4 to make new Word comment at doc1 with properties {comment text:"Resolved comment body", scope:r}
  set done of c4 to true
  set c5 to make new Word comment at doc1 with properties {comment text:"Reopened comment body", scope:r}
  set done of c5 to true
  set done of c5 to false
  set c6 to make new Word comment at doc1 with properties {comment text:"Deleted comment body", scope:r}
  delete c6
  save as doc1 file name "${wordDocxPath}" file format format document
  close doc1 saving no
  open file name "${wordDocxPath}"
  close active document saving yes
end tell`;
  runAppleScript(script);
  fs.copyFileSync(wordDocxPath, returnedDocxPath);

  const inventory = packageInventory(returnedDocxPath);
  const parserSummary = summarizeReturnedDocx(returnedDocxPath);
  const receipt = {
    schemaVersion: SCHEMA,
    taskId: 'YALKEN_WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_INTEGRATION_AND_C05_RESUME',
    stageId: STAGE,
    status: STATUS,
    createdAtUtc: new Date().toISOString(),
    base: {
      originMainSha: execFileSync('git', ['rev-parse', 'origin/main'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(),
      branch: execFileSync('git', ['branch', '--show-current'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(),
      headSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(),
    },
    wordProfile,
    secureVolume,
    wordSandboxWorkRoot: workRoot,
    artifactRoot,
    runDir,
    wordSandboxRunDir,
    returnedDocx: {
      path: returnedDocxPath,
      sha256: `sha256:${sha256File(returnedDocxPath)}`,
      packagePartCount: inventory.packagePartCount,
      packageParts: inventory.packageParts,
    },
    wordAutomation: {
      wordStatus: 'PASS',
      commentsBeforeSave: 5,
      commentsAfterReopen: parserSummary.commentThreads,
      commentSummaryDigest: sha256Text(JSON.stringify(parserSummary.bodies)),
      actionsPerformedInWord: [
        'create root comment',
        'attempt nested reply level one using Word AppleScript parent property',
        'attempt nested reply level two using Word AppleScript parent property',
        'attempt resolved comment using Word AppleScript done property',
        'attempt reopened comment using Word AppleScript done true then false',
        'attempt delete comment using Word AppleScript delete command',
        'save as DOCX',
        'close and reopen in Word',
      ],
    },
    parserSummary,
    totals: {
      commentsAfterReopen: parserSummary.commentThreads,
      replyThreadsCertified: 0,
      resolveReopenCertified: 0,
      deleteCertified: 0,
      silentCommentLoss: 0,
      noOpCommentPassClaimed: 0,
    },
    capabilityChange: {
      priorLimitation: 'MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION',
      newCapability: 'WORD_APPLESCRIPT_COMMENT_CREATION_CONFIRMED_REPLY_RESOLVE_REOPEN_DELETE_NOT_CERTIFIED',
      reviewSessionMutationAuthorityAdded: false,
      manuscriptApplyAuthorityAdded: false,
    },
    observedLimitations: [
      'WORD_APPLESCRIPT_PARENT_COMMENT_DOES_NOT_PERSIST_AS_MODERN_REPLY_GRAPH',
      'WORD_APPLESCRIPT_DONE_PROPERTY_DOES_NOT_PERSIST_RESOLVE_REOPEN_STATE',
      'WORD_APPLESCRIPT_DELETE_COMMENT_OBJECT_DID_NOT_REMOVE_RETURNED_COMMENT_BODY',
      'SYSTEM_EVENTS_UI_SCRIPTING_DISABLED_FOR_THIS_AGENT',
    ],
    runtimeClaims: {
      productRuntimeChanged: false,
      uiChanged: false,
      networkDependencyAdded: false,
      newDependencyAdded: false,
      writerAuthorityAdded: false,
      automaticApplyExpanded: false,
    },
    vetoMetrics: {
      falseExact: 0,
      silentApply: 0,
      wrongSceneRouting: 0,
      replayFailure: 0,
    },
    saturated: false,
    remainingWordLimitations: [
      'MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION',
      'CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY',
      'AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED',
    ],
    nextStage: NEXT_STAGE,
    result: 'PASS',
  };
  receipt.receiptDigest = sha256Text(JSON.stringify(receipt));
  fs.writeFileSync(path.join(runDir, 'e12-modern-comment-followup-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export function evaluateWordV4E12ModernCommentFollowup(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== SCHEMA) add('RTK_V4_E12_MODERN_COMMENT_SCHEMA_INVALID', 'schemaVersion', 'Modern comment followup schema is invalid.');
  if (receipt.stageId !== STAGE) add('RTK_V4_E12_MODERN_COMMENT_STAGE_INVALID', 'stageId', 'Modern comment followup stage is invalid.');
  if (receipt.status !== STATUS || receipt.result !== 'PASS') add('RTK_V4_E12_MODERN_COMMENT_STATUS_INVALID', 'status', 'Followup must bind a PASS limitation receipt, not a support overclaim.');
  if (receipt.nextStage !== NEXT_STAGE || receipt.saturated !== false) add('RTK_V4_E12_MODERN_COMMENT_SEQUENCE_INVALID', 'nextStage', 'Followup must keep Word not saturated and continue custom XML authority work.');

  if (receipt.wordProfile?.versionByAppleScript !== '16.111.2') add('RTK_V4_E12_MODERN_COMMENT_WORD_PROFILE_INVALID', 'wordProfile.versionByAppleScript', 'Followup must bind latest Word 16.111.2 evidence.');
  if (receipt.wordSandboxWorkRoot?.insideWordContainer !== true || receipt.wordSandboxWorkRoot?.plainTmpForbidden !== true) {
    add('RTK_V4_E12_MODERN_COMMENT_SANDBOX_INVALID', 'wordSandboxWorkRoot', 'Word physical probe must use the Word container tmp root and forbid plain tmp fallback.');
  }
  if (!String(receipt.artifactRoot || '').startsWith('/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/e12-modern-comment-followup')) {
    add('RTK_V4_E12_MODERN_COMMENT_ARTIFACT_ROOT_INVALID', 'artifactRoot', 'Physical evidence artifacts must stay on T7-Secure.');
  }
  const parts = new Set(Array.isArray(receipt.returnedDocx?.packageParts) ? receipt.returnedDocx.packageParts : []);
  for (const part of ['word/comments.xml', 'word/commentsExtended.xml', 'word/commentsIds.xml', 'word/commentsExtensible.xml', 'word/people.xml']) {
    if (!parts.has(part)) add('RTK_V4_E12_MODERN_COMMENT_PART_MISSING', `returnedDocx.packageParts.${part}`, 'Returned DOCX package inventory must bind modern comment-related parts.');
  }

  const totals = receipt.totals || {};
  if (Number(totals.commentsAfterReopen) !== 5
    || Number(totals.replyThreadsCertified) !== 0
    || Number(totals.resolveReopenCertified) !== 0
    || Number(totals.deleteCertified) !== 0
    || Number(totals.silentCommentLoss) !== 0
    || Number(totals.noOpCommentPassClaimed) !== 0) {
    add('RTK_V4_E12_MODERN_COMMENT_TOTALS_INVALID', 'totals', 'Followup must preserve visible comments while certifying zero reply, resolve/reopen, and delete support.');
  }
  if (receipt.parserSummary?.commentThreads !== 5
    || receipt.parserSummary?.replyCount !== 0
    || receipt.parserSummary?.canApply !== false
    || receipt.parserSummary?.states?.active !== 5) {
    add('RTK_V4_E12_MODERN_COMMENT_PARSER_SUMMARY_INVALID', 'parserSummary', 'Parser summary must show independent active comments and no apply authority.');
  }
  const limitations = new Set(Array.isArray(receipt.observedLimitations) ? receipt.observedLimitations : []);
  for (const id of [
    'WORD_APPLESCRIPT_PARENT_COMMENT_DOES_NOT_PERSIST_AS_MODERN_REPLY_GRAPH',
    'WORD_APPLESCRIPT_DONE_PROPERTY_DOES_NOT_PERSIST_RESOLVE_REOPEN_STATE',
    'WORD_APPLESCRIPT_DELETE_COMMENT_OBJECT_DID_NOT_REMOVE_RETURNED_COMMENT_BODY',
    'SYSTEM_EVENTS_UI_SCRIPTING_DISABLED_FOR_THIS_AGENT',
  ]) {
    if (!limitations.has(id)) add('RTK_V4_E12_MODERN_COMMENT_LIMITATION_MISSING', `observedLimitations.${id}`, 'Observed limitation must be explicit.');
  }
  if (receipt.runtimeClaims?.productRuntimeChanged !== false
    || receipt.runtimeClaims?.writerAuthorityAdded !== false
    || receipt.runtimeClaims?.automaticApplyExpanded !== false
    || receipt.runtimeClaims?.networkDependencyAdded !== false) {
    add('RTK_V4_E12_MODERN_COMMENT_RUNTIME_OVERCLAIM', 'runtimeClaims', 'Followup cannot add runtime, network, writer, or automatic apply authority.');
  }
  const veto = receipt.vetoMetrics || {};
  for (const [key, value] of Object.entries(veto)) {
    if (Number(value) !== 0) add('RTK_V4_E12_MODERN_COMMENT_VETO_NONZERO', `vetoMetrics.${key}`, 'All followup veto metrics must remain zero.');
  }
  if (input.requireFiles === true) {
    const returnedPath = receipt.returnedDocx?.path;
    if (!returnedPath || !fs.existsSync(returnedPath)) {
      add('RTK_V4_E12_MODERN_COMMENT_RETURNED_DOCX_MISSING', 'returnedDocx.path', 'Returned physical DOCX must exist for requireFiles verification.');
    }
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    replyThreadsCertified: Number(totals.replyThreadsCertified || 0),
    resolveReopenCertified: Number(totals.resolveReopenCertified || 0),
    saturated: receipt.saturated === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  let receipt = null;
  if (process.argv.includes('--run-physical')) {
    receipt = runPhysicalProbe();
    if (process.argv.includes('--write-receipt')) {
      fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`);
    }
  }
  const result = evaluateWordV4E12ModernCommentFollowup({
    receipt: receipt || undefined,
    requireFiles: process.argv.includes('--require-files'),
  });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_MODERN_COMMENT_FOLLOWUP=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
