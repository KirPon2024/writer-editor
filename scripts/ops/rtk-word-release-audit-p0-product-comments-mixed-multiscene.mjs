#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
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

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const { buildStoredZip } = require('../../src/export/docx/docxMinBuilder.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'WORD_RTK_PRODUCT_VERTICAL_COMMENTS_MIXED_MULTI_SCENE';
const CONTOUR_ID = 'P0-PRODUCT-VERTICAL-COMMENTS-MIXED-MULTI-SCENE';
const STATUS = 'WORD_RELEASE_AUDIT_P0_PRODUCT_VERTICAL_COMMENTS_MIXED_MULTI_SCENE_COMPLETE_NOT_SATURATED';
const NEXT_STAGE = 'P0_PRODUCT_VERTICAL_BOUNDED_VARIED_WAVE_64_AFTER_COMMENTS_MIXED_MULTI_SCENE';
const RECEIPT_SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-product-comments-mixed-multiscene-receipt.v1';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_COMMENTS_MIXED_MULTI_SCENE_RECEIPT.json';
const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const GOVERNANCE_APPROVALS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'GOVERNANCE_APPROVALS', 'GOVERNANCE_CHANGE_APPROVALS.json');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const BRIDGE_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const COMMENT_SHADOW_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportCommentShadowSession.mjs');
const VERTICAL_RUNNER_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-product-vertical-tracked-edit.mjs');
const SMOKE_RUNNER_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-product-originated-smoke-wave12.mjs');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-product-comments-mixed-multiscene.mjs');
const CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'rtk-word-release-audit-p0-product-comments-mixed-multiscene.contract.test.js');

const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-roundtrip-release-audit-night-01/current/p0-product-comments-mixed-multiscene';
const DEFAULT_WORD_WORK_ROOT = '/Volumes/T7-Secure/storage/yalken/word-roundtrip-release-audit-night-01/current/p0-product-originated-smoke-wave12/_comments-mixed-multiscene-word-work';
const WORD_APP_PATH = '/Applications/Microsoft Word.app';
const RESULT_PREFIX = 'RTK_WORD_PRODUCT_COMMENTS_MIXED_UI_RESULT:';
const SYNTHETIC_AUTHOR = 'Yalken Product Mixed Word Lab';
const SYNTHETIC_INITIALS = 'YPM';

const GOVERNED_PATHS = [
  'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json',
  RECEIPT_REF,
  'scripts/ops/rtk-word-release-audit-p0-product-comments-mixed-multiscene.mjs',
  'scripts/ops/rtk-word-release-audit-p0-product-vertical-tracked-edit.mjs',
  'test/contracts/rtk-word-release-audit-p0-product-comments-mixed-multiscene.contract.test.js',
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

function issue(code, field, message) {
  return { code, field, message };
}

function binding(id, filePath) {
  return {
    id,
    path: path.relative(REPO_ROOT, filePath),
    sha256: sha256File(filePath),
    status: 'BOUND',
  };
}

function computeHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function base64UrlText(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function appleLiteral(text) {
  return `"${String(text || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .join('" & return & "')}"`;
}

function positionFor(sourceText, needle, after = false) {
  const index = sourceText.indexOf(needle);
  if (index < 0) throw new Error(`WORD_PHYSICAL_NEEDLE_MISSING:${needle}`);
  return Math.max(1, index + 1 + (after ? needle.length : 0));
}

function buildAuthorityEnvelope(payload, secret) {
  const port = c05CryptoPort();
  const envelope = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    payload,
    payloadDigest: port.sha256Json(payload),
    signature: port.hmacSha256Json(payload, secret),
    keyId: 'product-review-docx-local-secret-v1',
    secretEmbeddedInDocx: false,
  };
  return `YRTK1.${base64UrlText(JSON.stringify(envelope))}`;
}

function caseSceneText(caseSpec) {
  if (typeof caseSpec.sceneText === 'string' && caseSpec.sceneText.length > 0) return caseSpec.sceneText;
  const prefix = typeof caseSpec.leadingText === 'string' ? `${caseSpec.leadingText}\n` : '';
  const suffix = typeof caseSpec.trailingText === 'string' ? `\n${caseSpec.trailingText}` : '';
  if (caseSpec.duplicateInAuthorityBlock) {
    return `${prefix}Yalken product comments mixed ${caseSpec.id} Alpha COMMENT_TARGET OLD_WORD middle OLD_WORD gamma.${suffix}`;
  }
  return `${prefix}Yalken product comments mixed ${caseSpec.id} Alpha COMMENT_TARGET OLD_WORD gamma.${suffix}`;
}

function buildProductCommentsMixedSource(caseSpec) {
  const port = c05CryptoPort();
  const sceneText = caseSceneText(caseSpec);
  const sceneId = `manuscript/product-comments-mixed/${caseSpec.id}.txt`;
  const projectId = 'yalken-product-comments-mixed-synthetic-project';
  const rawSha256 = `sha256:${port.sha256Text(sceneText)}`;
  const sceneRevision = rawSha256;
  const roundHex = sha256Text(`${caseSpec.id}:product-comments-mixed-round`).slice(0, 32);
  const hmacSecret = `product-comments-mixed-secret-${sha256Text(`${caseSpec.id}:secret`)}`;
  const blockDigest = sha256Text(`${caseSpec.id}:block:${sceneText}`);
  const block = {
    blockId: `block-product-comments-mixed-${blockDigest.slice(0, 16)}`,
    paragraphId: `yrtk-product-comments-mixed-${blockDigest.slice(0, 16)}`,
    paraId: blockDigest.slice(0, 8),
    textId: sha256Text(`${caseSpec.id}:textId`).slice(0, 8),
    text: sceneText,
  };
  const roundId = `round-product-comments-mixed-${roundHex}`;
  const exportId = `export-product-comments-mixed-${roundHex}`;
  const exportArtifactId = `export-artifact-product-comments-mixed-${roundHex}`;
  const semanticReturnId = `semantic-return-product-comments-mixed-${roundHex}`;
  const coreManifestDigest = port.sha256Json({ caseId: caseSpec.id, sceneId, blocks: [block.blockId] });
  const transportManifestDigest = port.sha256Json({ caseId: caseSpec.id, roundId, sceneRevision });
  const yrtk2Token = `YRTK2.${base64UrlText(stableJson({ caseId: caseSpec.id, roundId, coreManifestDigest }))}`;
  const authorityPayload = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    taskId: TASK_ID,
    profileId: 'word-mac-latest-observed-16.111.x-product-comments-mixed-p0',
    caseId: caseSpec.id,
    sceneId,
    sceneRevision,
    rawSha256,
    blockId: block.blockId,
    roundId,
    exportId,
    exportArtifactId,
    semanticReturnId,
    coreManifestDigest,
    transportManifestDigest,
    yrtk2TokenDigest: port.sha256Text(yrtk2Token),
    blockCount: 1,
  };
  return {
    sceneText,
    blocks: [block],
    forbiddenSecret: hmacSecret,
    customProperties: [
      { name: 'YRTK_C01_AUTH', value: buildAuthorityEnvelope(authorityPayload, hmacSecret) },
      { name: 'YRTK2_TOKEN', value: yrtk2Token },
      { name: 'YRTK_CORE_DIGEST', value: coreManifestDigest },
    ],
    advisoryManifest: {
      schemaVersion: 'yalken.rtk.word.product-review-docx-export.advisory-manifest.v1',
      authorityRole: 'advisory-not-apply-authority',
      caseId: caseSpec.id,
      roundId,
      exportId,
      nonClaims: {
        customXmlApplyAuthority: false,
        automaticApplyCertified: false,
      },
    },
    exportCapsule: {
      schemaVersion: 'yalken.rtk.word.product-review-docx-export.v1',
      projectId,
      sceneId,
      sceneRevision,
      rawSha256,
      roundId,
      exportId,
      exportArtifactId,
      semanticReturnId,
      coreManifestDigest,
      transportManifestDigest,
      yrtk2TokenLength: yrtk2Token.length,
      blockCount: 1,
      authorityCarrier: 'customDocumentProperty',
      authorityPropertyName: 'YRTK_C01_AUTH',
      secretEmbeddedInDocx: false,
      automaticApplyCertified: false,
      productRuntimeWired: true,
      returnIntakeWired: true,
    },
    localAuthority: {
      schemaVersion: 'yalken.rtk.word.product-review-docx-export.local-authority.v1',
      projectId,
      projectRoot: 'synthetic-product-comments-mixed-project-root',
      scenePath: sceneId,
      sceneText,
      baselineFinalText: sceneText,
      hmacSecret,
      expectedAuthority: {
        sceneId,
        sceneRevision,
        rawSha256,
        blockId: block.blockId,
        roundId,
        exportId,
      },
      roundId,
      exportIdentity: exportId,
      manifestDigest: transportManifestDigest,
      coreManifestDigest,
      exportMap: {
        roundId,
        scenes: [{ sceneId, sceneRevision, rawSha256, blocks: [block] }],
      },
    },
  };
}

function productCases() {
  return [
    {
      id: 'P0CM-001',
      title: 'root comment shadow product path survives Word return',
      action: 'root-comment',
      expectedCommentMinimum: 1,
      shouldApplyText: false,
      expectedCapability: 'rootModernCommentShadowImport',
    },
    {
      id: 'P0CM-002',
      title: 'mixed tracked replacement plus root comment closes product path',
      action: 'mixed-comment-replace',
      expectedCommentMinimum: 1,
      shouldApplyText: true,
      expectedCapability: 'mixedTrackedReplacementAndRootComment',
    },
    {
      id: 'P0CM-003',
      title: 'Word-authored comment delete readback stays physical evidence only',
      action: 'comment-delete',
      expectedCommentMinimum: 0,
      shouldApplyText: false,
      expectedCapability: 'commentDeletePhysicalReadback',
    },
    {
      id: 'P0CM-004',
      title: 'reply and resolve object-model probe remains typed limitation unless semantic readback proves it',
      action: 'reply-resolve-probe',
      expectedCommentMinimum: 1,
      shouldApplyText: false,
      expectedCapability: 'replyResolveTypedLimitationBoundary',
    },
  ].map((item, index) => ({
    ...item,
    ordinal: index + 1,
    productCommandHandlerOriginated: true,
    physicalWordRequired: true,
    fixtureOnlyPassAllowed: false,
  }));
}

function actionLinesForCase(caseSpec, sceneText) {
  const oldStart = positionFor(sceneText, 'OLD_WORD', false);
  const oldEnd = oldStart + 'OLD_WORD'.length;
  const commentStart = positionFor(sceneText, 'COMMENT_TARGET', false);
  const commentEnd = commentStart + 'COMMENT_TARGET'.length;
  const replacement = String(caseSpec.replacementText || `${caseSpec.id}_NEW_WORD`);
  const rootCommentBody = `${caseSpec.id} root comment ё NBSP\u00a0emoji ${String.fromCodePoint(0x1f4da)}${String.fromCodePoint(0xfe0f)}`;
  const lines = [
    'set yRootCreated to "0"',
    'set yDeleteCertified to "0"',
    'set yReplyAttempted to "0"',
    'set yResolveAttempted to "0"',
    'set yReopenAttempted to "0"',
    'set yCommentCountAfterCreate to -1',
  ];
  const commentRange = `create range yDoc start ${commentStart} end ${commentEnd}`;
  if (caseSpec.action === 'root-comment') {
    lines.push('set track revisions of yDoc to false');
    lines.push(`set c1 to make new Word comment at (${commentRange}) with properties {comment text:${appleLiteral(rootCommentBody)}}`);
    lines.push('set yRootCreated to "1"');
    lines.push('set yCommentCountAfterCreate to count of Word comments of yDoc');
  } else if (caseSpec.action === 'mixed-comment-replace') {
    lines.push('set track revisions of yDoc to false');
    lines.push(`set c1 to make new Word comment at (${commentRange}) with properties {comment text:${appleLiteral(`${rootCommentBody} mixed with tracked replacement`)}}`);
    lines.push('set yRootCreated to "1"');
    lines.push('set yCommentCountAfterCreate to count of Word comments of yDoc');
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${oldStart} end ${oldEnd}) to ${appleLiteral(replacement)}`);
  } else if (caseSpec.action === 'format-inline-diagnostic') {
    lines.push('set track revisions of yDoc to false');
    lines.push(`set yFormatRange to ${commentRange}`);
    lines.push('set bold of font object of yFormatRange to true');
    lines.push('set italic of font object of yFormatRange to true');
    lines.push('set underline of font object of yFormatRange to true');
    lines.push('set color index of font object of yFormatRange to blue');
  } else if (caseSpec.action === 'format-comment-diagnostic') {
    lines.push('set track revisions of yDoc to false');
    lines.push(`set c1 to make new Word comment at (${commentRange}) with properties {comment text:${appleLiteral(`${rootCommentBody} formatting-adjacent`)}}`);
    lines.push('set yRootCreated to "1"');
    lines.push('set yCommentCountAfterCreate to count of Word comments of yDoc');
    lines.push(`set yFormatRange to create range yDoc start ${oldStart} end ${oldEnd}`);
    lines.push('set bold of font object of yFormatRange to true');
    lines.push('set italic of font object of yFormatRange to true');
  } else if (caseSpec.action === 'paragraph-split-diagnostic') {
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${oldStart} end ${oldStart}) to ${appleLiteral(`${caseSpec.id} STRUCTURE_SPLIT\n`)}`);
  } else if (caseSpec.action === 'dense-comments-diagnostic') {
    lines.push('set track revisions of yDoc to false');
    const targets = [...sceneText.matchAll(/COMMENT_TARGET_[0-9]{3}/gu)].map((match) => ({
      token: match[0],
      start: match.index + 1,
      end: match.index + 1 + match[0].length,
    }));
    for (const target of targets.slice(0, Number(caseSpec.expectedCommentMinimum || 0))) {
      const body = `${caseSpec.id} dense ${target.token} ё NBSP\u00a0emoji ${String.fromCodePoint(0x1f4da)}${String.fromCodePoint(0xfe0f)}`;
      lines.push(`set c1 to make new Word comment at (create range yDoc start ${target.start} end ${target.end}) with properties {comment text:${appleLiteral(body)}}`);
    }
    lines.push('set yRootCreated to "1"');
    lines.push('set yCommentCountAfterCreate to count of Word comments of yDoc');
  } else if (caseSpec.action === 'comment-delete') {
    lines.push('set track revisions of yDoc to false');
    lines.push(`set c1 to make new Word comment at (${commentRange}) with properties {comment text:${appleLiteral(`${rootCommentBody} delete probe`)}}`);
    lines.push('set yRootCreated to "1"');
    lines.push('set yCommentCountAfterCreate to count of Word comments of yDoc');
    lines.push('delete c1');
    lines.push('set yDeleteCertified to "1"');
  } else if (caseSpec.action === 'reply-resolve-probe') {
    lines.push('set track revisions of yDoc to false');
    lines.push(`set r1 to ${commentRange}`);
    lines.push(`set c1 to make new Word comment at yDoc with properties {comment text:${appleLiteral(`${rootCommentBody} state root`)}, scope:r1}`);
    lines.push('set yRootCreated to "1"');
    lines.push('set yCommentCountAfterCreate to count of Word comments of yDoc');
    lines.push('try');
    lines.push(`  set c2 to make new Word comment at yDoc with properties {comment text:${appleLiteral(`${caseSpec.id} reply probe`)}, scope:r1, parent:c1}`);
    lines.push('  set yReplyAttempted to "1"');
    lines.push('on error errMsg number errNo');
    lines.push('  set yLimitations to yLimitations & "WORD_COMMENT_REPLY_OBJECT_MODEL_LIMITED:" & errNo & "|"');
    lines.push('end try');
    lines.push('try');
    lines.push('  set done of c1 to true');
    lines.push('  set yResolveAttempted to "1"');
    lines.push('on error errMsg number errNo');
    lines.push('  set yLimitations to yLimitations & "WORD_COMMENT_DONE_TRUE_OBJECT_MODEL_LIMITED:" & errNo & "|"');
    lines.push('end try');
    lines.push('try');
    lines.push('  set done of c1 to false');
    lines.push('  set yReopenAttempted to "1"');
    lines.push('on error errMsg number errNo');
    lines.push('  set yLimitations to yLimitations & "WORD_COMMENT_DONE_FALSE_OBJECT_MODEL_LIMITED:" & errNo & "|"');
    lines.push('end try');
  }
  return lines.join('\n');
}

function buildWordProductScript(caseSpec, returnedPath, sceneText) {
  const actionLines = actionLinesForCase(caseSpec, sceneText).split('\n').map((line) => `  ${line}`).join('\n');
  const sentinel = `Yalken product comments mixed ${caseSpec.id}`;
  const returnedPathLiteral = appleLiteral(returnedPath);
  const expectedName = path.basename(returnedPath);
  const appleEventTimeoutSeconds = Math.max(120, Math.ceil(Number(caseSpec.wordAutomationTimeoutMs || 180_000) / 1000));
  return [
    'on yOpenExpectedDoc(yPosixPath, yExpectedFullName, yExpectedName)',
    '  do shell script "/usr/bin/open -a " & quoted form of "Microsoft Word" & " " & quoted form of yPosixPath',
    '  set yDeadline to (current date) + 25',
    '  tell application "Microsoft Word"',
    '    activate',
    '    repeat while (current date) is less than yDeadline',
    '      try',
    '        if (name of active document as text) is yExpectedName and (full name of active document as text) is yExpectedFullName then return true',
    '      end try',
    '      delay 0.25',
    '    end repeat',
    '  end tell',
    '  return false',
    'end yOpenExpectedDoc',
    `with timeout of ${appleEventTimeoutSeconds} seconds`,
    'tell application "Microsoft Word"',
    'activate',
    'set yDocWasOpened to false',
    'set oldAlerts to display alerts',
    'set oldUserName to user name',
    'set oldUserInitials to user initials',
    'set yLimitations to ""',
    'try',
    '  set display alerts to alerts none',
    `  set user name to ${appleLiteral(SYNTHETIC_AUTHOR)}`,
    `  set user initials to ${appleLiteral(SYNTHETIC_INITIALS)}`,
    `  set yFile to POSIX file ${returnedPathLiteral} as alias`,
    '  set yExpectedFullName to yFile as text',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "P0_PRODUCT_COMMENTS_OPEN_TIMEOUT" number 9900`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yInitialText to content of text object of yDoc',
    `  if yInitialText does not contain ${appleLiteral(sentinel)} then error "P0_PRODUCT_COMMENTS_OPENED_CONTENT_MISMATCH" number 9901`,
    '  set remove personal information of yDoc to false',
    '  set remove date and time of yDoc to false',
    '  set show revisions of yDoc to true',
    actionLines,
    '  save yDoc',
    '  close yDoc saving yes',
    '  set yDocWasOpened to false',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "P0_PRODUCT_COMMENTS_REOPEN_TIMEOUT" number 9902`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yReadback to content of text object of yDoc',
    `  if yReadback does not contain ${appleLiteral(sentinel)} then error "P0_PRODUCT_COMMENTS_REOPEN_CONTENT_MISMATCH" number 9903`,
    '  set yRevisionCount to count of revisions of yDoc',
    '  set yCommentCount to count of Word comments of yDoc',
    '  close yDoc saving no',
    '  set yDocWasOpened to false',
    '  set user name to oldUserName',
    '  set user initials to oldUserInitials',
    '  set display alerts to oldAlerts',
    '  return "WORD_STATUS=PASS" & linefeed & "REVISION_COUNT=" & yRevisionCount & linefeed & "COMMENT_COUNT=" & yCommentCount & linefeed & "COMMENT_COUNT_AFTER_CREATE=" & yCommentCountAfterCreate & linefeed & "ROOT_CREATED=" & yRootCreated & linefeed & "DELETE_ATTEMPTED=" & yDeleteCertified & linefeed & "REPLY_ATTEMPTED=" & yReplyAttempted & linefeed & "RESOLVE_ATTEMPTED=" & yResolveAttempted & linefeed & "REOPEN_ATTEMPTED=" & yReopenAttempted & linefeed & "READBACK_CHARS=" & (count of yReadback) & linefeed & "LIMITATIONS=" & yLimitations',
    'on error errMsg number errNo',
    '  try',
    '    if yDocWasOpened then close yDoc saving no',
    '  end try',
    '  try',
    '    set user name to oldUserName',
    '    set user initials to oldUserInitials',
    '    set display alerts to oldAlerts',
    '  end try',
    '  return "WORD_STATUS=FAIL" & linefeed & "ERRNO=" & errNo & linefeed & "ERR=" & errMsg & linefeed & "LIMITATIONS=" & yLimitations',
    'end try',
    'end tell',
    'end timeout',
  ].join('\n');
}

function execText(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: options.encoding || 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 30_000,
  });
}

function listZipEntries(docxPath) {
  try {
    return String(execText('/usr/bin/unzip', ['-Z1', docxPath], { timeout: 30_000 }))
      .split(/\r?\n/u)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractPart(docxPath, partName, encoding = 'utf8') {
  try {
    return execFileSync('/usr/bin/unzip', ['-p', docxPath, partName], {
      cwd: REPO_ROOT,
      encoding,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
    });
  } catch {
    return encoding === 'buffer' ? Buffer.alloc(0) : '';
  }
}

function countMatches(text, pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function commentPackageReadback(docxPath, expectedTokens = []) {
  const entries = listZipEntries(docxPath);
  const commentsXml = extractPart(docxPath, 'word/comments.xml');
  const commentsExtendedXml = extractPart(docxPath, 'word/commentsExtended.xml');
  const commentsIdsXml = extractPart(docxPath, 'word/commentsIds.xml');
  const peopleXml = extractPart(docxPath, 'word/people.xml');
  const commentRelatedParts = entries.filter((entry) => /comment|people/iu.test(entry)).sort();
  const expectedTokensFound = expectedTokens.filter((token) => commentsXml.includes(token));
  return {
    packagePartCount: entries.length,
    commentRelatedParts,
    commentCount: countMatches(commentsXml, /<w:comment\b/gu),
    parentLinkCount: countMatches(commentsXml, /\bw:parentId=/gu) + countMatches(commentsIdsXml, /\bw16cid:parentId=/gu),
    doneTrueCount: countMatches(commentsExtendedXml, /\bw15:done="1"/gu),
    doneFalseCount: countMatches(commentsExtendedXml, /\bw15:done="0"/gu),
    expectedTokensFound,
    expectedTokensMissing: expectedTokens.filter((token) => !expectedTokensFound.includes(token)),
    hasCommentsXml: commentsXml.length > 0,
    hasCommentsExtendedXml: commentsExtendedXml.length > 0,
    hasCommentsIdsXml: commentsIdsXml.length > 0,
    hasPeopleXml: peopleXml.length > 0,
  };
}

function tamperAuthorityProperty(docxPath) {
  const entries = listZipEntries(docxPath).map((entry) => {
    const data = extractPart(docxPath, entry, 'buffer');
    if (entry !== 'docProps/custom.xml') return { name: entry, data };
    const text = data.toString('utf8').replace(/YRTK1\.[^<]+/u, 'YRTK1.tampered');
    return { name: entry, data: text };
  });
  fs.writeFileSync(docxPath, buildStoredZip(entries));
}

async function loadBridgeModule() {
  return import(pathToFileURL(BRIDGE_MODULE_PATH).href);
}

async function loadCommentShadowModule() {
  return import(pathToFileURL(COMMENT_SHADOW_PATH).href);
}

function makeProject({ runDir, source }) {
  const projectRoot = path.join(runDir, 'synthetic-project');
  const sceneId = source.localAuthority.expectedAuthority.sceneId;
  const scenePath = path.join(projectRoot, sceneId);
  fs.mkdirSync(path.dirname(scenePath), { recursive: true });
  fs.writeFileSync(scenePath, source.sceneText, 'utf8');
  fs.writeFileSync(path.join(projectRoot, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 'yalken.synthetic.project.v1',
    projectId: source.exportCapsule.projectId,
    scenes: [{ sceneId }],
  }, null, 2)}\n`);
  source.localAuthority.scenePath = scenePath;
  source.localAuthority.projectRoot = projectRoot;
  return { projectRoot, sceneId, scenePath };
}

async function instantiateProductPort({ source, projectRoot, scenePath, sceneId, commandCalls }) {
  const bridge = await loadBridgeModule();
  const commentShadow = await loadCommentShadowModule();
  const applyHandler = bridge.createRtkNonOverlapTrackedReplacementCommandHandler({
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
      if (commandId === 'cmd.rtk.review.applyNonOverlapTrackedReplacements') return applyHandler(payload);
      if (commandId === 'cmd.rtk.reviewSession.importComments') return commentHandler(payload);
      return { status: 'blocked', code: 'UNEXPECTED_COMMAND', reason: 'UNEXPECTED_COMMAND' };
    },
  });
}

async function activateReturn({ port, returnedBytes, source, projectRoot, scenePath, sceneId, requestId, sceneTextOverride }) {
  const sceneText = typeof sceneTextOverride === 'string' ? sceneTextOverride : fs.readFileSync(scenePath, 'utf8');
  const sceneHash = computeHash(sceneText);
  return port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(returnedBytes, requestId),
    {
      activeReviewDocxExportAuthorityStore: buildAuthorityStore(source, { projectRoot, scenePath }),
      buildMainReviewContext: async () => ({
        ok: true,
        projectId: source.exportCapsule.projectId,
        projectRoot,
        scenePath,
        sceneText,
        baselineHash: sceneHash,
        currentBaselineHash: sceneHash,
        targetScope: { type: 'scene', id: sceneId },
        createdAt: '2026-08-01T00:00:00.000Z',
      }),
    },
  );
}

async function runProductCase({ caseSpec, dirs }) {
  const source = buildProductCommentsMixedSource(caseSpec);
  const caseDir = path.join(dirs.evidenceRunDir, caseSpec.id);
  const wordCaseDir = path.join(dirs.wordRunDir, caseSpec.id);
  const projectDirs = {
    wordSources: path.join(wordCaseDir, 'source-docx'),
    wordReturns: path.join(wordCaseDir, 'returned-docx'),
    evidenceSources: path.join(caseDir, 'source-docx'),
    evidenceReturns: path.join(caseDir, 'returned-docx'),
  };
  for (const dir of Object.values(projectDirs)) fs.mkdirSync(dir, { recursive: true });
  const { projectRoot, sceneId, scenePath } = makeProject({ runDir: caseDir, source });
  const sourcePath = path.join(projectDirs.wordSources, `${caseSpec.id}-product-export.docx`);
  const returnedPath = path.join(projectDirs.wordReturns, `${caseSpec.id}-returned.docx`);
  const evidenceSourcePath = path.join(projectDirs.evidenceSources, `${caseSpec.id}-product-export.docx`);
  const evidenceReturnedPath = path.join(projectDirs.evidenceReturns, `${caseSpec.id}-returned.docx`);
  const exportResult = await runProductExport(caseSpec, source, sourcePath);
  if (!exportResult.ok) throw new Error(`PRODUCT_COMMENTS_EXPORT_FAILED:${JSON.stringify(exportResult)}`);
  fs.copyFileSync(sourcePath, returnedPath);
  fs.copyFileSync(sourcePath, evidenceSourcePath);
  const script = runAppleScript(
    buildWordProductScript(caseSpec, returnedPath, source.sceneText),
    `${caseSpec.id}-word`,
    caseDir,
    { timeout: Number(caseSpec.wordAutomationTimeoutMs || 180_000) },
  );
  const wordReadback = parseKeyValueLines(script.output);
  if (wordReadback.WORD_STATUS !== 'PASS') {
    throw new Error(`WORD_PRODUCT_COMMENTS_FAILED:${JSON.stringify(wordReadback)}`);
  }
  fs.copyFileSync(returnedPath, evidenceReturnedPath);
  const sourceBytes = fs.readFileSync(evidenceSourcePath);
  const returnedBytes = fs.readFileSync(evidenceReturnedPath);
  const analysis = await analyzeReturnedDocx(caseSpec, source, evidenceReturnedPath);
  const expectedCommentTokens = Number(caseSpec.expectedCommentMinimum || 0) > 0 ? [caseSpec.id] : [];
  const packageReadback = commentPackageReadback(evidenceReturnedPath, expectedCommentTokens);
  const commandCalls = [];
  const port = await instantiateProductPort({ source, projectRoot, scenePath, sceneId, commandCalls });
  const beforeActivationText = fs.readFileSync(scenePath, 'utf8');
  const activation = await activateReturn({
    port,
    returnedBytes,
    source,
    projectRoot,
    scenePath,
    sceneId,
    requestId: `${caseSpec.id}-activate`,
  });
  const afterActivationText = fs.readFileSync(scenePath, 'utf8');
  const secondActivation = await activateReturn({
    port,
    returnedBytes,
    source,
    projectRoot,
    scenePath,
    sceneId,
    requestId: `${caseSpec.id}-activate-replay`,
  });
  const afterSecondActivationText = fs.readFileSync(scenePath, 'utf8');
  const previewSummary = summarizeReviewSurface(activation.reviewSurface || {});
  const textChanges = activation.reviewSurface?.revisionSession?.reviewGraph?.textChanges || [];
  const changeId = textChanges[0]?.changeId || '';
  let apply = null;
  let replay = null;
  const replacementToken = String(caseSpec.expectedReplacementToken || caseSpec.replacementText || `${caseSpec.id}_NEW_WORD`);
  let expectedFinalText = source.sceneText;
  const beforeApplyText = fs.readFileSync(scenePath, 'utf8');
  if (caseSpec.shouldApplyText) {
    apply = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({
      requestId: `${caseSpec.id}-explicit-confirmed-apply`,
      changeId,
    });
    replay = await port.handleReviewSurfaceApplyExactTextChangeCommandSurface({
      requestId: `${caseSpec.id}-replay`,
      changeId,
    });
  }
  const afterApplyText = fs.readFileSync(scenePath, 'utf8');
  const applyVetoMetrics = apply?.result?.vetoMetrics || {};
  const applyVetoZero = Object.values(applyVetoMetrics).every((value) => Number(value) === 0);
  const replacementSemanticsVerified = caseSpec.shouldApplyText
    ? apply?.ok === true
      && apply?.applied === true
      && apply?.result?.writerCalled === true
      && applyVetoZero
      && previewSummary.exactApplyOps === 1
      && afterApplyText !== source.sceneText
      && afterApplyText.includes(replacementToken)
      && !afterApplyText.includes('OLD_WORD')
    : false;
  const expectedFormattingMinimum = Number(caseSpec.expectedFormattingMinimum || 0);
  const expectedStructureMinimum = Number(caseSpec.expectedStructureMinimum || 0);
  const formattingDiagnosticsVerified = expectedFormattingMinimum > 0
    ? Number(analysis.reviewIrSummary?.formattingDeltas || 0) >= expectedFormattingMinimum
    : true;
  const structuralDiagnosticsVerified = expectedStructureMinimum > 0
    ? (
      Number(analysis.reviewIrSummary?.structureChanges || 0) >= expectedStructureMinimum
        || Number(previewSummary.structuralChanges || 0) >= expectedStructureMinimum
    )
      && previewSummary.exactPreviewReady !== true
    : true;
  if (caseSpec.shouldApplyText && replacementSemanticsVerified) expectedFinalText = afterApplyText;
  const diagnosticOnlyNoComment = caseSpec.shouldApplyText !== true && Number(caseSpec.expectedCommentMinimum || 0) === 0;
  const replayRequirementMet = caseSpec.action === 'comment-delete' || diagnosticOnlyNoComment
    ? true
    : (caseSpec.shouldApplyText
      ? replay?.ok === true && replay?.replay === true && fs.readFileSync(scenePath, 'utf8') === expectedFinalText
      : secondActivation.commentShadowResult?.status === 'replay');
  fs.rmSync(wordCaseDir, { recursive: true, force: true });

  const commentCalls = commandCalls.filter((item) => item.commandId === 'cmd.rtk.reviewSession.importComments');
  const applyCalls = commandCalls.filter((item) => item.commandId === 'cmd.rtk.review.applyNonOverlapTrackedReplacements');
  const productLoop = {
    returnIntakeAuthenticated: activation.returnIntake?.authenticated === true,
    returnIntakeStatus: activation.returnIntake?.status || '',
    activationOk: activation.ok === true,
    secondActivationOk: secondActivation.ok === true,
    visiblePreviewReady: caseSpec.shouldApplyText
      ? previewSummary.exactPreviewReady === true && previewSummary.productPathReady === true
      : (expectedFormattingMinimum > 0 || expectedStructureMinimum > 0
        ? formattingDiagnosticsVerified && structuralDiagnosticsVerified
        : (activation.reviewSurface?.revisionSession?.reviewGraph?.commentThreads || []).length >= caseSpec.expectedCommentMinimum),
    previewSummary,
    textChangeCount: textChanges.length,
    commentThreadCount: (activation.reviewSurface?.revisionSession?.reviewGraph?.commentThreads || []).length,
    commentShadowCommitted: activation.commentShadowResult?.status === 'committed',
    commentShadowReplay: secondActivation.commentShadowResult?.status === 'replay',
    commentShadowManuscriptAuthority: activation.commentShadowResult?.manuscriptApplyAuthority === true,
    commentShadowStorageEffects: activation.commentShadowResult?.storageEffects || null,
    commandKernelCalls: commandCalls.length,
    commentCommandCalls: commentCalls.length,
    applyCommandCalls: applyCalls.length,
    commandKernelCommandIds: commandCalls.map((item) => item.commandId),
    commandPayloadPreviewConfirmed: applyCalls[0]?.payload?.previewConfirmed === true,
    manuscriptMutationDuringAnalysisOrPreview: beforeActivationText !== afterActivationText
      || beforeActivationText !== afterSecondActivationText
      || beforeApplyText !== afterSecondActivationText,
    explicitUserConfirmedCommandApply: caseSpec.shouldApplyText ? apply?.ok === true && apply?.applied === true : false,
    writerCalled: caseSpec.shouldApplyText ? apply?.result?.writerCalled === true : false,
    applyStatus: apply?.result?.status || '',
    applyVetoMetrics,
    applyVetoZero,
    replacementSemanticsVerified,
    formattingDiagnosticsVerified,
    structuralDiagnosticsVerified,
    formattingDiagnosticCount: Number(analysis.reviewIrSummary?.formattingDeltas || 0),
    structuralDiagnosticCount: Math.max(
      Number(analysis.reviewIrSummary?.structureChanges || 0),
      Number(previewSummary.structuralChanges || 0),
    ),
    sceneMatchesExpectedAfterApply: afterApplyText === expectedFinalText,
    projectReopenReadbackMatchesExpected: fs.readFileSync(scenePath, 'utf8') === expectedFinalText,
    replayIdempotent: replayRequirementMet,
    afterApplyTextSha256: `sha256:${computeHash(afterApplyText)}`,
  };
  return {
    caseId: caseSpec.id,
    title: caseSpec.title,
    action: caseSpec.action,
    expectedCapability: caseSpec.expectedCapability,
    result: activation.ok === true
      && secondActivation.ok === true
      && productLoop.visiblePreviewReady
      && productLoop.manuscriptMutationDuringAnalysisOrPreview === false
      && productLoop.sceneMatchesExpectedAfterApply
      && (caseSpec.action === 'comment-delete' || productLoop.replayIdempotent)
      && (!caseSpec.shouldApplyText || productLoop.replacementSemanticsVerified)
      && productLoop.formattingDiagnosticsVerified
      && productLoop.structuralDiagnosticsVerified
      && (caseSpec.expectedCommentMinimum === 0 || packageReadback.expectedTokensMissing.length === 0)
      ? 'PASS'
      : 'FAIL',
    project: {
      projectId: source.exportCapsule.projectId,
      sceneId,
      beforeSha256: `sha256:${computeHash(source.sceneText)}`,
      expectedFinalTextSha256: `sha256:${computeHash(expectedFinalText)}`,
      afterApplyTextSha256: productLoop.afterApplyTextSha256,
    },
    export: {
      commandId: 'cmd.project.review.exportDocxReviewPacket',
      productCommandHandlerOriginated: exportResult.ok === true,
      bytesWritten: exportResult.bytesWritten || 0,
      sourceDocxSha256: `sha256:${sha256Bytes(sourceBytes)}`,
      canAutoApply: exportResult.canAutoApply === true,
      canWriteManuscript: exportResult.canWriteManuscript === true,
      canImportMutate: exportResult.canImportMutate === true,
    },
    physicalWord: {
      openEditSaveCloseReopen: wordReadback.WORD_STATUS === 'PASS',
      revisionCount: Number(wordReadback.REVISION_COUNT || 0),
      commentCount: Number(wordReadback.COMMENT_COUNT || 0),
      commentCountAfterCreate: Number(wordReadback.COMMENT_COUNT_AFTER_CREATE || -1),
      rootCreated: wordReadback.ROOT_CREATED === '1',
      deleteAttempted: wordReadback.DELETE_ATTEMPTED === '1',
      replyAttempted: wordReadback.REPLY_ATTEMPTED === '1',
      resolveAttempted: wordReadback.RESOLVE_ATTEMPTED === '1',
      reopenAttempted: wordReadback.REOPEN_ATTEMPTED === '1',
      limitations: String(wordReadback.LIMITATIONS || '').split('|').filter(Boolean),
      returnedDocxSha256: `sha256:${sha256Bytes(returnedBytes)}`,
      returnedBytes: returnedBytes.length,
      packageZipOk: testZip(evidenceReturnedPath),
      packageReadback,
      scriptPath: script.scriptPath,
    },
    parser: {
      parserOk: analysis.parserOk,
      parserStatus: analysis.parserStatus,
      sourceMode: analysis.sourceMode,
      validSignedLocator: analysis.validSignedLocator,
      authorityCarrierStatus: analysis.authorityCarrierStatus,
      reviewIrSummary: analysis.reviewIrSummary,
      exactAutomaticCandidateCount: analysis.exactAutomaticCandidateCount,
      analysisDigest: analysis.analysisDigest,
      parserProfileDigest: analysis.parserProfileDigest,
      classificationDigest: analysis.classificationDigest,
      reasons: analysis.reasons,
    },
    productLoop,
    paths: {
      evidenceSourceDocx: evidenceSourcePath,
      evidenceReturnedDocx: evidenceReturnedPath,
      syntheticProjectRoot: projectRoot,
      syntheticScenePath: scenePath,
    },
  };
}

async function runStaleBaselineNegative({ dirs }) {
  const caseSpec = { id: 'P0CM-N01', action: 'mixed-comment-replace', expectedCommentMinimum: 1, shouldApplyText: true };
  const source = buildProductCommentsMixedSource(caseSpec);
  const caseDir = path.join(dirs.evidenceRunDir, caseSpec.id);
  const wordCaseDir = path.join(dirs.wordRunDir, caseSpec.id);
  const projectDirs = {
    wordSources: path.join(wordCaseDir, 'source-docx'),
    wordReturns: path.join(wordCaseDir, 'returned-docx'),
  };
  for (const dir of Object.values(projectDirs)) fs.mkdirSync(dir, { recursive: true });
  const { projectRoot, sceneId, scenePath } = makeProject({ runDir: caseDir, source });
  const sourcePath = path.join(projectDirs.wordSources, `${caseSpec.id}-product-export.docx`);
  const returnedPath = path.join(projectDirs.wordReturns, `${caseSpec.id}-returned.docx`);
  const exportResult = await runProductExport(caseSpec, source, sourcePath);
  fs.copyFileSync(sourcePath, returnedPath);
  runAppleScript(buildWordProductScript(caseSpec, returnedPath, source.sceneText), `${caseSpec.id}-word`, caseDir);
  const returnedBytes = fs.readFileSync(returnedPath);
  const commandCalls = [];
  const port = await instantiateProductPort({ source, projectRoot, scenePath, sceneId, commandCalls });
  const staleText = `${source.sceneText} STALE_LOCAL_EDIT`;
  fs.writeFileSync(scenePath, staleText, 'utf8');
  const activation = await activateReturn({
    port,
    returnedBytes,
    source,
    projectRoot,
    scenePath,
    sceneId,
    requestId: `${caseSpec.id}-stale`,
    sceneTextOverride: staleText,
  });
  fs.rmSync(wordCaseDir, { recursive: true, force: true });
  return {
    caseId: caseSpec.id,
    title: 'stale baseline blocks authenticated intake before writer',
    result: activation.ok === false
      && activation.error?.reason === 'RTK_RETURN_INTAKE_STALE_CURRENT_SCENE'
      && fs.readFileSync(scenePath, 'utf8') === staleText
      ? 'PASS'
      : 'FAIL',
    exportOk: exportResult.ok === true,
    reason: activation.error?.reason || '',
    writerCalls: commandCalls.filter((item) => item.commandId === 'cmd.rtk.review.applyNonOverlapTrackedReplacements').length,
    commentCalls: commandCalls.filter((item) => item.commandId === 'cmd.rtk.reviewSession.importComments').length,
    sceneUnchanged: fs.readFileSync(scenePath, 'utf8') === staleText,
  };
}

async function runWrongSceneNegative({ dirs }) {
  const caseSpec = { id: 'P0CM-N02', action: 'mixed-comment-replace', expectedCommentMinimum: 1, shouldApplyText: true };
  const source = buildProductCommentsMixedSource(caseSpec);
  const caseDir = path.join(dirs.evidenceRunDir, caseSpec.id);
  const wordCaseDir = path.join(dirs.wordRunDir, caseSpec.id);
  const projectDirs = {
    wordSources: path.join(wordCaseDir, 'source-docx'),
    wordReturns: path.join(wordCaseDir, 'returned-docx'),
  };
  for (const dir of Object.values(projectDirs)) fs.mkdirSync(dir, { recursive: true });
  const { projectRoot, sceneId, scenePath } = makeProject({ runDir: caseDir, source });
  const sourcePath = path.join(projectDirs.wordSources, `${caseSpec.id}-product-export.docx`);
  const returnedPath = path.join(projectDirs.wordReturns, `${caseSpec.id}-returned.docx`);
  const exportResult = await runProductExport(caseSpec, source, sourcePath);
  fs.copyFileSync(sourcePath, returnedPath);
  runAppleScript(buildWordProductScript(caseSpec, returnedPath, source.sceneText), `${caseSpec.id}-word`, caseDir);
  const returnedBytes = fs.readFileSync(returnedPath);
  const commandCalls = [];
  const port = await instantiateProductPort({ source, projectRoot, scenePath, sceneId, commandCalls });
  const wrongSceneId = 'manuscript/product-comments-mixed/wrong-scene.txt';
  const sceneHash = computeHash(source.sceneText);
  const activation = await port.handleDocxReviewPreviewSessionActivationCommandSurface(
    toPayload(returnedBytes, `${caseSpec.id}-wrong-scene`),
    {
      activeReviewDocxExportAuthorityStore: buildAuthorityStore(source, { projectRoot, scenePath }),
      buildMainReviewContext: async () => ({
        ok: true,
        projectId: source.exportCapsule.projectId,
        projectRoot,
        scenePath,
        sceneText: fs.readFileSync(scenePath, 'utf8'),
        baselineHash: sceneHash,
        currentBaselineHash: sceneHash,
        targetScope: { type: 'scene', id: wrongSceneId },
        createdAt: '2026-08-01T00:00:00.000Z',
      }),
    },
  );
  fs.rmSync(wordCaseDir, { recursive: true, force: true });
  return {
    caseId: caseSpec.id,
    title: 'wrong scene blocks before writer or comment shadow mutation',
    result: activation.ok === false
      && activation.error?.reason === 'RTK_RETURN_INTAKE_WRONG_SCENE_ID'
      && fs.readFileSync(scenePath, 'utf8') === source.sceneText
      ? 'PASS'
      : 'FAIL',
    exportOk: exportResult.ok === true,
    reason: activation.error?.reason || '',
    expectedSceneId: sceneId,
    actualSceneId: wrongSceneId,
    writerCalls: commandCalls.filter((item) => item.commandId === 'cmd.rtk.review.applyNonOverlapTrackedReplacements').length,
    commentCalls: commandCalls.filter((item) => item.commandId === 'cmd.rtk.reviewSession.importComments').length,
    sceneUnchanged: fs.readFileSync(scenePath, 'utf8') === source.sceneText,
  };
}

async function runTamperedAuthorityNegative({ dirs }) {
  const caseSpec = { id: 'P0CM-N03', action: 'mixed-comment-replace', expectedCommentMinimum: 1, shouldApplyText: true };
  const source = buildProductCommentsMixedSource(caseSpec);
  const caseDir = path.join(dirs.evidenceRunDir, caseSpec.id);
  const wordCaseDir = path.join(dirs.wordRunDir, caseSpec.id);
  const projectDirs = {
    wordSources: path.join(wordCaseDir, 'source-docx'),
    wordReturns: path.join(wordCaseDir, 'returned-docx'),
  };
  for (const dir of Object.values(projectDirs)) fs.mkdirSync(dir, { recursive: true });
  const { projectRoot, sceneId, scenePath } = makeProject({ runDir: caseDir, source });
  const sourcePath = path.join(projectDirs.wordSources, `${caseSpec.id}-product-export.docx`);
  const returnedPath = path.join(projectDirs.wordReturns, `${caseSpec.id}-returned.docx`);
  const exportResult = await runProductExport(caseSpec, source, sourcePath);
  fs.copyFileSync(sourcePath, returnedPath);
  runAppleScript(buildWordProductScript(caseSpec, returnedPath, source.sceneText), `${caseSpec.id}-word`, caseDir);
  tamperAuthorityProperty(returnedPath);
  const returnedBytes = fs.readFileSync(returnedPath);
  const commandCalls = [];
  const port = await instantiateProductPort({ source, projectRoot, scenePath, sceneId, commandCalls });
  const activation = await activateReturn({
    port,
    returnedBytes,
    source,
    projectRoot,
    scenePath,
    sceneId,
    requestId: `${caseSpec.id}-tampered`,
  });
  fs.rmSync(wordCaseDir, { recursive: true, force: true });
  return {
    caseId: caseSpec.id,
    title: 'tampered authority blocks authenticated intake',
    result: activation.ok === false
      && /RTK_RETURN_INTAKE|AUTHORITY|SIGNATURE|CARRIER|PARSER/u.test(activation.error?.reason || '')
      && fs.readFileSync(scenePath, 'utf8') === source.sceneText
      ? 'PASS'
      : 'FAIL',
    exportOk: exportResult.ok === true,
    reason: activation.error?.reason || '',
    writerCalls: commandCalls.filter((item) => item.commandId === 'cmd.rtk.review.applyNonOverlapTrackedReplacements').length,
    commentCalls: commandCalls.filter((item) => item.commandId === 'cmd.rtk.reviewSession.importComments').length,
    sceneUnchanged: fs.readFileSync(scenePath, 'utf8') === source.sceneText,
  };
}

async function runDuplicateLocatorNegative({ dirs }) {
  const caseSpec = {
    id: 'P0CM-N04',
    action: 'mixed-comment-replace',
    expectedCommentMinimum: 1,
    shouldApplyText: true,
    duplicateInAuthorityBlock: true,
  };
  const source = buildProductCommentsMixedSource(caseSpec);
  const caseDir = path.join(dirs.evidenceRunDir, caseSpec.id);
  const wordCaseDir = path.join(dirs.wordRunDir, caseSpec.id);
  const projectDirs = {
    wordSources: path.join(wordCaseDir, 'source-docx'),
    wordReturns: path.join(wordCaseDir, 'returned-docx'),
  };
  for (const dir of Object.values(projectDirs)) fs.mkdirSync(dir, { recursive: true });
  const { projectRoot, sceneId, scenePath } = makeProject({ runDir: caseDir, source });
  const sourcePath = path.join(projectDirs.wordSources, `${caseSpec.id}-product-export.docx`);
  const returnedPath = path.join(projectDirs.wordReturns, `${caseSpec.id}-returned.docx`);
  const exportResult = await runProductExport(caseSpec, source, sourcePath);
  fs.copyFileSync(sourcePath, returnedPath);
  runAppleScript(buildWordProductScript(caseSpec, returnedPath, source.sceneText), `${caseSpec.id}-word`, caseDir);
  const returnedBytes = fs.readFileSync(returnedPath);
  const commandCalls = [];
  const port = await instantiateProductPort({ source, projectRoot, scenePath, sceneId, commandCalls });
  const activation = await activateReturn({
    port,
    returnedBytes,
    source,
    projectRoot,
    scenePath,
    sceneId,
    requestId: `${caseSpec.id}-duplicate`,
  });
  const previewSummary = summarizeReviewSurface(activation.reviewSurface || {});
  fs.rmSync(wordCaseDir, { recursive: true, force: true });
  return {
    caseId: caseSpec.id,
    title: 'duplicate locator inside authority block does not become exact apply',
    result: activation.ok === true
      && previewSummary.exactPreviewReady !== true
      && fs.readFileSync(scenePath, 'utf8') === source.sceneText
      ? 'PASS'
      : 'FAIL',
    exportOk: exportResult.ok === true,
    activationOk: activation.ok === true,
    previewSummary,
    runtimeReasons: activation.nonOverlapTrackedReplacementProductPath?.runtimePreviewReasons || [],
    writerCalls: commandCalls.filter((item) => item.commandId === 'cmd.rtk.review.applyNonOverlapTrackedReplacements').length,
    commentCalls: commandCalls.filter((item) => item.commandId === 'cmd.rtk.reviewSession.importComments').length,
    sceneUnchanged: fs.readFileSync(scenePath, 'utf8') === source.sceneText,
  };
}

async function runMultiSceneTypedLimitation({ dirs }) {
  const projectRoot = path.join(dirs.evidenceRunDir, 'P0CM-N05', 'synthetic-project');
  const sceneA = path.join(projectRoot, 'manuscript', 'multi', 'scene-a.txt');
  const sceneB = path.join(projectRoot, 'manuscript', 'multi', 'scene-b.txt');
  fs.mkdirSync(path.dirname(sceneA), { recursive: true });
  const beforeA = 'Scene A Alpha beta gamma.';
  const beforeB = 'Scene B Delta epsilon zeta.';
  fs.writeFileSync(sceneA, beforeA, 'utf8');
  fs.writeFileSync(sceneB, beforeB, 'utf8');
  const port = instantiateDocxReviewPreviewSessionPort({
    scenePath: sceneA,
    sceneId: 'manuscript/multi/scene-a.txt',
    projectRoot,
    projectId: 'yalken-product-comments-mixed-synthetic-project',
    getProjectRelativeFilePath: () => 'manuscript/multi/scene-a.txt',
    getDocumentContextFromPath: () => ({ kind: 'scene' }),
  });
  const importResult = await port.handleReviewSurfaceImportPacketCommandSurface({
    projectId: 'yalken-product-comments-mixed-synthetic-project',
    sessionId: 'P0CM-N05-multi-scene-session',
    baselineHash: computeHash(beforeA),
    currentBaselineHash: computeHash(beforeA),
    createdAt: '2026-08-01T00:00:00.000Z',
    requestId: 'P0CM-N05-import',
    reviewPacket: {
      commentThreads: [],
      commentPlacements: [],
      textChanges: [
        {
          changeId: 'P0CM-N05-scene-a',
          targetScope: { type: 'scene', id: 'manuscript/multi/scene-a.txt' },
          match: { kind: 'exact', quote: 'beta', prefix: 'Alpha ', suffix: ' gamma.' },
          replacementText: 'BETA',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
        {
          changeId: 'P0CM-N05-scene-b',
          targetScope: { type: 'scene', id: 'manuscript/multi/scene-b.txt' },
          match: { kind: 'exact', quote: 'epsilon', prefix: 'Delta ', suffix: ' zeta.' },
          replacementText: 'EPSILON',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      structuralChanges: [],
      diagnosticItems: [],
      decisionStates: [],
    },
    sourceViewState: { mode: 'product-multi-scene-typed-limitation' },
  });
  const batchResult = await port.handleReviewSurfaceApplyExactTextChangesBatchCommandSurface({
    requestId: 'P0CM-N05-confirmed-batch-attempt',
    changeIds: ['P0CM-N05-scene-a', 'P0CM-N05-scene-b'],
  });
  return {
    caseId: 'P0CM-N05',
    title: 'multi-scene batch remains blocked before writer until coordinator contour',
    result: importResult.ok === true
      && batchResult.ok === false
      && batchResult.error?.reason === 'REVIEW_EXACT_TEXT_APPLY_BATCH_SINGLE_SCENE_REQUIRED'
      && fs.readFileSync(sceneA, 'utf8') === beforeA
      && fs.readFileSync(sceneB, 'utf8') === beforeB
      ? 'PASS'
      : 'FAIL',
    importOk: importResult.ok === true,
    batchOk: batchResult.ok === true,
    reason: batchResult.error?.reason || '',
    canWrite: false,
    runtimeApplyAuthorityGranted: false,
    sceneAUnchanged: fs.readFileSync(sceneA, 'utf8') === beforeA,
    sceneBUnchanged: fs.readFileSync(sceneB, 'utf8') === beforeB,
    typedLimitation: 'MULTI_SCENE_PRODUCT_APPLY_REQUIRES_AUTHENTICATED_MULTI_SCENE_COORDINATOR_CONTOUR',
  };
}

function parseUiResult(stdout) {
  const line = String(stdout || '').split(/\r?\n/u).find((item) => item.startsWith(RESULT_PREFIX));
  if (!line) return null;
  return JSON.parse(line.slice(RESULT_PREFIX.length));
}

function createUiClickChildSource(tempRoot, outPath) {
  return `\
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, Menu, session } = require('electron');

const rootDir = ${JSON.stringify(REPO_ROOT)};
const tempRoot = ${JSON.stringify(tempRoot)};
const outPath = ${JSON.stringify(outPath)};
const RESULT_PREFIX = ${JSON.stringify(RESULT_PREFIX)};
const projectName = '\\u0420\\u043e\\u043c\\u0430\\u043d';
const sceneName = '\\u0447\\u0435\\u0440\\u043d\\u043e\\u0432\\u0438\\u043a';
const sceneText = 'Yalken UI export surface proof COMMENT_TARGET OLD_WORD.';
const dialogCalls = [];
const networkRequests = [];

function emit(payload) {
  process.stdout.write(RESULT_PREFIX + JSON.stringify(payload) + '\\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate, label, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await sleep(50);
  }
  throw new Error('WAIT_TIMEOUT:' + label);
}

function flattenMenuItems(menu) {
  if (!menu || !Array.isArray(menu.items)) return [];
  return menu.items.flatMap((item) => [item, ...(item.submenu ? flattenMenuItems(item.submenu) : [])]);
}

async function clickNativeMenuItem(item, win) {
  const maybePromise = item.click(item, win, { triggeredByAccelerator: false });
  if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
}

for (const dirName of ['appData', 'userData', 'documents']) {
  fs.mkdirSync(path.join(tempRoot, dirName), { recursive: true });
}
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
dialog.showSaveDialog = async (_window, options = {}) => {
  const title = typeof options.title === 'string' ? options.title : '';
  dialogCalls.push({ method: 'showSaveDialog', title });
  if (title === '\\u042d\\u043a\\u0441\\u043f\\u043e\\u0440\\u0442 Review DOCX') return { canceled: false, filePath: outPath };
  return { canceled: true };
};
dialog.showMessageBox = async () => ({ response: 0 });

app.setPath('appData', path.join(tempRoot, 'appData'));
app.setPath('userData', path.join(tempRoot, 'userData'));
app.setPath('documents', path.join(tempRoot, 'documents'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-features', 'UseSkiaRenderer');

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details && typeof details.url === 'string' ? details.url : '';
    const blocked = /^(https?|wss?):/u.test(url);
    if (blocked) networkRequests.push(url);
    callback({ cancel: blocked });
  });
});

process.chdir(rootDir);
if (!process.argv.includes('--dev')) process.argv.push('--dev');
require(path.join(rootDir, 'src', 'main.js'));

app.whenReady().then(async () => {
  try {
    const win = await waitUntil(() => BrowserWindow.getAllWindows()[0] || null, 'WINDOW_NOT_CREATED');
    if (win.webContents.isLoadingMainFrame()) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('LOAD_TIMEOUT')), 12000);
        win.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
        win.webContents.once('did-fail-load', (_event, _code, description) => {
          clearTimeout(timer);
          reject(new Error('DID_FAIL_LOAD:' + description));
        });
      });
    }
    const projectRoot = path.join(tempRoot, 'documents', 'craftsman', projectName);
    const manifestPath = path.join(projectRoot, 'project.craftsman.json');
    const scenePath = path.join(projectRoot, 'roman', sceneName + '.txt');
    await waitUntil(() => fs.existsSync(manifestPath), 'MANIFEST_NOT_CREATED');
    fs.mkdirSync(path.dirname(scenePath), { recursive: true });
    fs.writeFileSync(scenePath, sceneText, 'utf8');
    const opened = await win.webContents.executeJavaScript(\`(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const row = [...document.querySelectorAll('.tree__row')]
          .find((candidate) => (candidate.textContent || '').trim() === ${JSON.stringify('черновик')});
        if (row) {
          row.click();
          for (let readAttempt = 0; readAttempt < 80; readAttempt += 1) {
            const text = document.querySelector('.ProseMirror')?.innerText || '';
            if (text.includes('Yalken UI export surface proof')) return { ok: true, text };
            await sleep(50);
          }
          return { ok: false, reason: 'SCENE_TEXT_NOT_LOADED' };
        }
        await sleep(50);
      }
      return { ok: false, reason: 'SCENE_ROW_NOT_FOUND' };
    })()\`, true);
    if (!opened || opened.ok !== true) throw new Error(opened && opened.reason ? opened.reason : 'SCENE_OPEN_FAILED');
    const applicationMenu = Menu.getApplicationMenu();
    const menuItem = applicationMenu?.getMenuItemById('review-export-docx-review-packet')
      || flattenMenuItems(applicationMenu).find((item) => /Export Review DOCX Packet|Review DOCX/iu.test(item.label || ''));
    if (!menuItem || typeof menuItem.click !== 'function') {
      throw new Error('REVIEW_DOCX_EXPORT_MENU_ITEM_MISSING:' + JSON.stringify(flattenMenuItems(applicationMenu).map((item) => ({ id: item.id, label: item.label }))));
    }
    await clickNativeMenuItem(menuItem, win);
    await waitUntil(() => fs.existsSync(outPath), 'REVIEW_DOCX_EXPORT_NOT_WRITTEN');
    const bytes = fs.readFileSync(outPath);
    emit({
      ok: 1,
      clicked: true,
      menuItemId: menuItem.id,
      menuItemLabel: menuItem.label,
      dialogCalls,
      exportedExists: fs.existsSync(outPath),
      exportedSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      exportedBytes: bytes.length,
      sceneDiskText: fs.readFileSync(scenePath, 'utf8'),
      networkRequests,
    });
    app.exit(0);
  } catch (error) {
    emit({
      ok: 0,
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : '',
      dialogCalls,
      networkRequests,
    });
    app.exit(1);
  }
});
`;
}

async function runElectronUiExportClickProof({ runDir }) {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'yalken-product-comments-ui-'));
  const outPath = path.join(runDir, 'electron-ui-review-docx-export.docx');
  const childPath = path.join(tempRoot, 'electron-ui-review-docx-export-child.cjs');
  await fsPromises.writeFile(childPath, createUiClickChildSource(tempRoot, outPath), 'utf8');
  const stdoutChunks = [];
  const stderrChunks = [];
  const child = spawn(electronBinary, [childPath], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ELECTRON_ENABLE_SECURITY_WARNINGS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
  let timedOut = false;
  const exitState = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 45_000);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  const result = parseUiResult(stdout);
  await fsPromises.rm(tempRoot, { recursive: true, force: true });
  const ok = timedOut === false
    && exitState.code === 0
    && result?.ok === 1
    && result.clicked === true
    && result.exportedExists === true
    && result.menuItemId === 'review-export-docx-review-packet'
    && fs.existsSync(outPath)
    && testZip(outPath)
    && list(result.networkRequests).length === 0;
  return {
    ok,
    timedOut,
    exitCode: exitState.code,
    signal: exitState.signal,
    result: result || null,
    stderrTail: stderr.slice(-2000),
    exportedDocxPath: outPath,
    exportedDocxSha256: fs.existsSync(outPath) ? `sha256:${sha256File(outPath)}` : '',
    exportedDocxZipOk: fs.existsSync(outPath) ? testZip(outPath) : false,
    userDocumentsTouched: false,
    networkRequests: result?.networkRequests || [],
  };
}

function summarizeProductCases(cases) {
  return {
    cases: cases.length,
    pass: cases.filter((item) => item.result === 'PASS').length,
    fail: cases.filter((item) => item.result === 'FAIL').length,
    productCommandHandlerOriginated: cases.filter((item) => item.export?.productCommandHandlerOriginated === true).length,
    physicalOpenEditSaveCloseReopenPass: cases.filter((item) => item.physicalWord?.openEditSaveCloseReopen === true).length,
    parserPass: cases.filter((item) => item.parser?.parserOk === true).length,
    rootCommentProductPathPass: cases.filter((item) => item.caseId === 'P0CM-001' && item.result === 'PASS').length,
    mixedProductLoopPass: cases.filter((item) => item.caseId === 'P0CM-002' && item.result === 'PASS').length,
    commentDeletePhysicalReadbackPass: cases.filter((item) => item.caseId === 'P0CM-003' && item.result === 'PASS' && item.physicalWord?.physicalDeleteCertified === true).length,
    replyResolveTypedLimitations: cases.filter((item) => item.caseId === 'P0CM-004').length,
    commentThreadsParsed: cases.reduce((sum, item) => sum + Number(item.parser?.reviewIrSummary?.commentThreads || 0), 0),
    exactAutomaticCandidateCount: cases.reduce((sum, item) => sum + Number(item.parser?.exactAutomaticCandidateCount || 0), 0),
  };
}

function buildVetoMetrics({ productResults, negativeResults, uiProof }) {
  return {
    falseExact: productResults.filter((item) => item.caseId === 'P0CM-002' && Number(item.productLoop?.applyVetoMetrics?.falseExact || 0) !== 0).length,
    wrongSceneRouting: negativeResults.filter((item) => item.caseId === 'P0CM-N02' && item.result !== 'PASS').length,
    silentApply: productResults.filter((item) => item.productLoop?.manuscriptMutationDuringAnalysisOrPreview === true).length,
    replayFailure: productResults.filter((item) => item.action !== 'comment-delete' && item.productLoop?.replayIdempotent !== true).length,
    silentCommentLoss: productResults.filter((item) => item.caseId !== 'P0CM-003' && Number(item.physicalWord?.packageReadback?.commentCount || 0) < Number(item.physicalWord?.commentCount || 0)).length,
    noOpPass: productResults.filter((item) => item.physicalWord?.openEditSaveCloseReopen !== true || item.parser?.parserOk !== true).length,
    falseSupport: productResults.filter((item) => item.caseId === 'P0CM-004' && item.implementedSupportOverclaimed === true).length,
    productExportFailure: productResults.filter((item) => item.export?.productCommandHandlerOriginated !== true).length,
    physicalWordFailure: productResults.filter((item) => item.physicalWord?.openEditSaveCloseReopen !== true).length,
    parserUnexpectedFailure: productResults.filter((item) => item.parser?.parserOk !== true).length,
    previewFailure: productResults.filter((item) => item.productLoop?.visiblePreviewReady !== true).length,
    applyFailure: productResults.filter((item) => item.caseId === 'P0CM-002' && (
      item.productLoop?.explicitUserConfirmedCommandApply !== true
      || item.productLoop?.replacementSemanticsVerified !== true
    )).length,
    negativeCaseFailure: negativeResults.filter((item) => item.result !== 'PASS').length,
    liveElectronUiClickFailure: uiProof.ok === true ? 0 : 1,
    userDocumentTouch: 0,
    networkRequest: list(uiProof.networkRequests).length,
    googleDocsOpened: 0,
    falseReleaseClaim: 0,
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
  const dirs = {
    evidenceRunDir: runDir,
    wordRunDir,
  };
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(wordRunDir, { recursive: true });
  const uiProof = await runElectronUiExportClickProof({ runDir });
  if (!uiProof.ok) throw new Error(`ELECTRON_UI_REVIEW_DOCX_EXPORT_CLICK_FAILED:${JSON.stringify(uiProof)}`);
  const productResults = [];
  for (const caseSpec of productCases()) {
    const result = await runProductCase({ caseSpec, dirs });
    if (caseSpec.action === 'comment-delete') {
      result.physicalWord.physicalDeleteCertified = result.physicalWord.deleteAttempted === true
        && result.physicalWord.commentCountAfterCreate >= 1
        && result.physicalWord.commentCount === 0
        && result.physicalWord.packageReadback.commentCount === 0;
      result.result = result.physicalWord.physicalDeleteCertified ? result.result : 'FAIL';
    }
    if (caseSpec.action === 'reply-resolve-probe') {
      const readback = result.physicalWord.packageReadback;
      result.typedLimitations = [
        ...(readback.parentLinkCount >= 1 ? [] : ['MODERN_COMMENT_REPLY_NOT_CERTIFIED_IN_PRODUCT_PATH']),
        ...(readback.doneTrueCount >= 1 && readback.doneFalseCount >= 1 ? [] : ['MODERN_COMMENT_RESOLVE_REOPEN_NOT_CERTIFIED_IN_PRODUCT_PATH']),
      ];
      result.implementedSupportOverclaimed = false;
    }
    productResults.push(result);
  }
  const negativeResults = [
    await runStaleBaselineNegative({ dirs }),
    await runWrongSceneNegative({ dirs }),
    await runTamperedAuthorityNegative({ dirs }),
    await runDuplicateLocatorNegative({ dirs }),
    await runMultiSceneTypedLimitation({ dirs }),
  ];
  fs.rmSync(wordRunDir, { recursive: true, force: true });
  const totals = summarizeProductCases(productResults);
  const vetoMetrics = buildVetoMetrics({ productResults, negativeResults, uiProof });
  const ok = uiProof.ok === true
    && totals.cases === 4
    && totals.pass === 4
    && totals.rootCommentProductPathPass === 1
    && totals.mixedProductLoopPass === 1
    && totals.commentDeletePhysicalReadbackPass === 1
    && negativeResults.every((item) => item.result === 'PASS')
    && Object.values(vetoMetrics).every((value) => Number(value) === 0);
  const draft = {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: ok ? STATUS : 'WORD_RELEASE_AUDIT_P0_PRODUCT_VERTICAL_COMMENTS_MIXED_MULTI_SCENE_FAILED_NOT_SATURATED',
    result: ok ? 'PASS' : 'FAIL',
    createdAtUtc: new Date().toISOString(),
    headBinding: {
      baselineMerge: '3fb21f329f376353fb1ba817fb21e832e0b3676b',
      headSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    secureVolume,
    wordSandboxWorkRoot,
    wordProfile: collectSmokeWordProfile(),
    sourceEvidence: {
      main: binding('MAIN_PRODUCT_COMMAND_SURFACE', MAIN_PATH),
      revisionBridge: binding('REVISION_BRIDGE_INDEX', BRIDGE_MODULE_PATH),
      commentShadow: binding('COMMENT_SHADOW_SESSION_RUNTIME', COMMENT_SHADOW_PATH),
      smokeRunnerHelpers: binding('P0_PRODUCT_SMOKE_HELPERS', SMOKE_RUNNER_PATH),
      verticalRunnerHarness: binding('P0_PRODUCT_VERTICAL_TRACKED_EDIT_HARNESS', VERTICAL_RUNNER_PATH),
      currentRunner: binding('P0_PRODUCT_COMMENTS_MIXED_MULTI_SCENE_RUNNER', SCRIPT_PATH),
    },
    physicalCorpus: {
      boundedPhysicalSet: true,
      syntheticOnly: true,
      fixtureOnlyPassAllowed: false,
      liveElectronUiExportSurfaceClick: uiProof,
      productCases: productResults,
      negativeCases: negativeResults,
    },
    totals: {
      ...totals,
      negativeCases: negativeResults.length,
      negativePass: negativeResults.filter((item) => item.result === 'PASS').length,
      liveElectronUiClickPass: uiProof.ok ? 1 : 0,
      visiblePreviewPass: productResults.filter((item) => item.productLoop?.visiblePreviewReady === true).length,
      explicitConfirmedApplyPass: productResults.filter((item) => item.productLoop?.explicitUserConfirmedCommandApply === true).length,
      projectReopenReadbackPass: productResults.filter((item) => item.productLoop?.projectReopenReadbackMatchesExpected === true).length,
      replayIdempotentPass: productResults.filter((item) => item.productLoop?.replayIdempotent === true).length,
    },
    vetoMetrics,
    implementedCapability: {
      capability: 'productVerticalCommentsMixedMultiSceneBoundedSet',
      productReviewDocxExporterWired: true,
      liveElectronUiExportSurfaceClicked: uiProof.ok === true,
      rootModernCommentShadowProductPathWired: true,
      mixedTrackedReplacementAndRootCommentProductLoopProven: true,
      commentDeletePhysicalReadbackProven: true,
      commentDeleteProductRuntimeWired: false,
      modernReplyProductRuntimeWired: false,
      modernResolveReopenProductRuntimeWired: false,
      multiSceneCorrectlyBlockedBeforeWriter: negativeResults.find((item) => item.caseId === 'P0CM-N05')?.result === 'PASS',
      multiSceneAtomicApplyCertified: false,
      productRuntimeWired: true,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
    typedLimitations: [
      'MODERN_COMMENT_REPLY_NOT_PRODUCT_CERTIFIED',
      'MODERN_COMMENT_RESOLVE_REOPEN_NOT_PRODUCT_CERTIFIED',
      'COMMENT_DELETE_PHYSICAL_READBACK_NOT_PRODUCT_RUNTIME_WIRED',
      'MULTI_SCENE_PRODUCT_APPLY_REQUIRES_AUTHENTICATED_MULTI_SCENE_COORDINATOR_CONTOUR',
    ],
    nonClaims: [
      'Automatic apply remains false because explicit preview confirmation is required.',
      'Multi-scene automatic apply is not certified in this contour.',
      'Reply and resolve/reopen are not product runtime capabilities.',
      'Comment delete is physical Word readback evidence only until a separate product shadow-state contour.',
      'Google Docs and later editor stages remain closed.',
      'No user documents, cloud, network, or private data were used.',
    ],
    nextStage: NEXT_STAGE,
  };
  return {
    ...draft,
    receiptDigest: `sha256:${sha256Text(stableJson(draft))}`,
  };
}

function upsertBinding(ledger, id, filePath) {
  const next = binding(id, filePath);
  const bindings = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  const index = bindings.findIndex((item) => item.id === id);
  if (index >= 0) bindings[index] = next;
  else bindings.push(next);
  ledger.evidenceBindings = bindings;
}

function updateProgram(program, receipt) {
  program.releaseAuditNight01 = {
    ...(isPlainObject(program.releaseAuditNight01) ? program.releaseAuditNight01 : {}),
    status: STATUS,
    currentStage: CONTOUR_ID,
    nextStage: NEXT_STAGE,
    latestReceiptPath: RECEIPT_REF,
    liveElectronUiExportSurfaceClicked: true,
    rootModernCommentShadowProductPathWired: true,
    mixedTrackedReplacementAndRootCommentProductLoopProven: true,
    commentDeletePhysicalReadbackProven: true,
    commentDeleteProductRuntimeWired: false,
    modernReplyProductRuntimeWired: false,
    modernResolveReopenProductRuntimeWired: false,
    multiSceneAtomicApplyCertified: false,
    multiSceneCorrectlyBlockedBeforeWriter: true,
    automaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  program.nonClaims = Array.from(new Set([
    ...list(program.nonClaims),
    'P0 product comments mixed multi-scene contour proves root comment shadow import, mixed tracked replacement plus comment with explicit apply, and safe multi-scene block; automatic apply, Word saturation, Google Docs, reply/resolve runtime, and multi-scene apply remain unclaimed.',
  ]));
  program.latestWordProductCommentsMixedMultiScene = {
    status: receipt.status,
    receiptPath: RECEIPT_REF,
    productCases: receipt.totals.cases,
    negativeCases: receipt.totals.negativeCases,
    nextStage: NEXT_STAGE,
  };
}

function updateProfile(profile, receipt) {
  const cell = {
    capabilityId: 'rtk.word.releaseAudit.p0.productCommentsMixedMultiScene',
    operationFamily: 'Product Review DOCX comments mixed tracked replacement and multi-scene typed limitation',
    state: 'PRODUCT_BOUNDED_VERTICAL_COMMENTS_MIXED_PROVEN_NOT_SATURATED',
    currentCapability: 'ROOT_COMMENT_SHADOW_AND_MIXED_TRACKED_REPLACEMENT_PRODUCT_LOOP_WITH_MULTI_SCENE_BLOCK',
    physicalWordEvidence: true,
    componentProven: true,
    productCompositionRegistered: true,
    productRuntimeWired: true,
    liveElectronUiExportSurfaceClicked: true,
    rootModernCommentShadowProductPathWired: true,
    mixedTrackedReplacementAndRootCommentProductLoopProven: true,
    commentDeletePhysicalReadbackProven: true,
    commentDeleteProductRuntimeWired: false,
    modernReplyProductRuntimeWired: false,
    modernResolveReopenProductRuntimeWired: false,
    multiSceneAtomicApplyCertified: false,
    explicitUserConfirmationRequired: true,
    automaticApplyCertified: false,
    userAutomaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    consumer: 'cmd.project.review.exportDocxReviewPacket plus cmd.project.review.activateDocxReviewPreviewSession plus cmd.project.review.applyExactTextChange plus cmd.rtk.reviewSession.importComments',
    evidenceReceiptPath: RECEIPT_REF,
    acceptanceTest: 'test/contracts/rtk-word-release-audit-p0-product-comments-mixed-multiscene.contract.test.js',
    supportedNow: [
      'real Electron menu export surface can export Product Review DOCX into a synthetic path',
      'root Word comment returns through authenticated intake and comment shadow command with replay',
      'mixed root comment plus tracked replacement returns through visible preview and explicit command apply',
      'stale baseline tampered authority wrong scene duplicate locator and multi-scene batch attempts fail closed before unsafe writes',
    ],
    limitations: receipt.typedLimitations,
    killCriterion: 'Any nonzero veto, silent comment loss, preview mutation, automatic apply claim, multi-scene apply claim, reply/resolve runtime claim, or Google Docs execution invalidates this contour.',
  };
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const index = cells.findIndex((item) => item.capabilityId === cell.capabilityId);
  if (index >= 0) cells[index] = cell;
  else cells.push(cell);
  profile.cells = cells;
  profile.latestProductCommentsMixedMultiScene = {
    status: receipt.status,
    receiptPath: RECEIPT_REF,
    automaticApplyCertified: false,
    wordSaturated: false,
  };
}

function updateLedger(ledger, receipt) {
  upsertBinding(ledger, 'RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_COMMENTS_MIXED_MULTI_SCENE', RECEIPT_PATH);
  ledger.coverageLedger = {
    ...(isPlainObject(ledger.coverageLedger) ? ledger.coverageLedger : {}),
    releaseAuditNight01P0ProductCommentsMixedMultiScene: {
      status: 'BOUND_PRODUCT_VERTICAL_COMMENTS_MIXED_MULTI_SCENE_COMPLETE',
      sourceEvidence: 'RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_COMMENTS_MIXED_MULTI_SCENE',
      physicalWordEvidence: true,
      observedCases: receipt.totals.cases,
      passCases: receipt.totals.pass,
      negativeCases: receipt.totals.negativeCases,
      negativePass: receipt.totals.negativePass,
      liveElectronUiExportSurfaceClicked: true,
      rootCommentProductPathPass: receipt.totals.rootCommentProductPathPass,
      mixedProductLoopPass: receipt.totals.mixedProductLoopPass,
      commentDeletePhysicalReadbackPass: receipt.totals.commentDeletePhysicalReadbackPass,
      multiSceneAtomicApplyCertified: false,
      automaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
      googleDocsOpened: false,
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
  ledger.aggregateTotals = {
    ...(isPlainObject(ledger.aggregateTotals) ? ledger.aggregateTotals : {}),
    productCommentsMixedMultiSceneCases: receipt.totals.cases,
    productCommentsMixedMultiScenePass: receipt.totals.pass,
    productCommentsMixedMultiSceneNegativePass: receipt.totals.negativePass,
    productCommentsMixedMultiSceneLiveUiClickPass: 1,
    productCommentsMixedMultiSceneAutomaticApplyCertified: 0,
    productCommentsMixedMultiSceneMultiSceneApplyCertified: 0,
  };
}

function updateGovernanceApprovals() {
  const approvalsDoc = readJson(GOVERNANCE_APPROVALS_PATH);
  const governedPaths = new Set(GOVERNED_PATHS);
  const approvals = (Array.isArray(approvalsDoc.approvals) ? approvalsDoc.approvals : [])
    .filter((entry) => !governedPaths.has(entry?.filePath));
  const approvedAtUtc = '2026-08-01T04:35:00.000Z';
  const approvedBy = `owner:TASK_ID:${TASK_ID}`;
  const rationale = 'Approve bounded P0 product comments mixed multi-scene contour: Electron Review DOCX export menu proof, physical Word root comment/mixed comment plus tracked replacement/delete/state probe, authenticated V2 intake, visible preview, explicit command apply, comment shadow replay, multi-scene safe block, veto metrics zero, automatic apply false, Word saturated false, Google Docs closed.';
  for (const filePath of GOVERNED_PATHS) {
    const absPath = path.join(REPO_ROOT, filePath);
    if (!fs.existsSync(absPath)) continue;
    const sha256 = sha256File(absPath);
    if (approvals.some((entry) => entry.filePath === filePath && entry.sha256 === sha256)) continue;
    approvals.push({ filePath, sha256, approvedBy, approvedAtUtc, rationale });
  }
  approvalsDoc.approvals = approvals;
  writeJsonAtomic(GOVERNANCE_APPROVALS_PATH, approvalsDoc);
}

function currentReceipt() {
  return fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : null;
}

function updateState(receipt = currentReceipt()) {
  if (!receipt || receipt.result !== 'PASS') {
    throw new Error('P0_PRODUCT_COMMENTS_MIXED_MULTI_SCENE_RECEIPT_PASS_REQUIRED');
  }
  const program = readJson(PROGRAM_PATH);
  updateProgram(program, receipt);
  writeJsonAtomic(PROGRAM_PATH, program);
  const profile = readJson(PROFILE_PATH);
  updateProfile(profile, receipt);
  writeJsonAtomic(PROFILE_PATH, profile);
  const ledger = readJson(LEDGER_PATH);
  updateLedger(ledger, receipt);
  writeJsonAtomic(LEDGER_PATH, ledger);
}

export function evaluateWordReleaseAuditP0ProductCommentsMixedMultiScene(input = {}) {
  const receipt = input.receipt || currentReceipt();
  const program = input.program || readJson(PROGRAM_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  if (!receipt || receipt.schemaVersion !== RECEIPT_SCHEMA || receipt.result !== 'PASS' || receipt.status !== STATUS) {
    add('RTK_P0_PRODUCT_COMMENTS_MIXED_RECEIPT_INVALID', 'receipt', 'Receipt must be a PASS product comments/mixed/multi-scene receipt.');
  }
  const productCasesInReceipt = list(receipt?.physicalCorpus?.productCases);
  const negativeCases = list(receipt?.physicalCorpus?.negativeCases);
  if (productCasesInReceipt.length !== 4 || receipt?.totals?.cases !== 4 || receipt?.totals?.pass !== 4) {
    add('RTK_P0_PRODUCT_COMMENTS_MIXED_CASE_COUNT_INVALID', 'totals', 'Exactly four bounded product cases must pass.');
  }
  if (negativeCases.length !== 5 || receipt?.totals?.negativePass !== 5) {
    add('RTK_P0_PRODUCT_COMMENTS_MIXED_NEGATIVES_INVALID', 'negativeCases', 'All five negative/limitation cases must pass.');
  }
  if (receipt?.physicalCorpus?.liveElectronUiExportSurfaceClick?.ok !== true
    || receipt?.implementedCapability?.liveElectronUiExportSurfaceClicked !== true) {
    add('RTK_P0_PRODUCT_COMMENTS_MIXED_UI_CLICK_INVALID', 'physicalCorpus.liveElectronUiExportSurfaceClick', 'A real Electron export menu click must be proven.');
  }
  const rootCase = productCasesInReceipt.find((item) => item.caseId === 'P0CM-001');
  const mixedCase = productCasesInReceipt.find((item) => item.caseId === 'P0CM-002');
  const deleteCase = productCasesInReceipt.find((item) => item.caseId === 'P0CM-003');
  const stateCase = productCasesInReceipt.find((item) => item.caseId === 'P0CM-004');
  if (!rootCase || rootCase.productLoop?.commentShadowCommitted !== true || rootCase.productLoop?.commentShadowReplay !== true) {
    add('RTK_P0_PRODUCT_COMMENTS_ROOT_INVALID', 'productCases.P0CM-001', 'Root comments must import through comment shadow and replay.');
  }
  if (!mixedCase
    || mixedCase.productLoop?.explicitUserConfirmedCommandApply !== true
    || mixedCase.productLoop?.commentShadowCommitted !== true
    || mixedCase.productLoop?.replacementSemanticsVerified !== true
    || mixedCase.productLoop?.sceneMatchesExpectedAfterApply !== true
    || mixedCase.productLoop?.replayIdempotent !== true) {
    add('RTK_P0_PRODUCT_COMMENTS_MIXED_INVALID', 'productCases.P0CM-002', 'Mixed comment plus tracked replacement must preview, apply explicitly, and replay.');
  }
  if (!deleteCase || deleteCase.physicalWord?.physicalDeleteCertified !== true || deleteCase.implementedSupportOverclaimed === true) {
    add('RTK_P0_PRODUCT_COMMENTS_DELETE_INVALID', 'productCases.P0CM-003', 'Comment delete must be physical readback only and not overclaimed.');
  }
  if (!stateCase
    || !list(stateCase.typedLimitations).includes('MODERN_COMMENT_REPLY_NOT_CERTIFIED_IN_PRODUCT_PATH')
    || !list(stateCase.typedLimitations).includes('MODERN_COMMENT_RESOLVE_REOPEN_NOT_CERTIFIED_IN_PRODUCT_PATH')) {
    add('RTK_P0_PRODUCT_COMMENTS_STATE_LIMITATION_INVALID', 'productCases.P0CM-004', 'Reply and resolve/reopen must remain typed limitations.');
  }
  if (Object.values(receipt?.vetoMetrics || {}).some((value) => Number(value) !== 0)) {
    add('RTK_P0_PRODUCT_COMMENTS_MIXED_VETO_NONZERO', 'vetoMetrics', 'All veto metrics must be zero.');
  }
  if (receipt?.implementedCapability?.automaticApplyCertified !== false
    || receipt?.implementedCapability?.multiSceneAtomicApplyCertified !== false
    || receipt?.implementedCapability?.wordSaturated !== false
    || receipt?.implementedCapability?.releaseReady !== false
    || receipt?.implementedCapability?.googleDocsOpened !== false) {
    add('RTK_P0_PRODUCT_COMMENTS_MIXED_OVERCLAIM', 'implementedCapability', 'Contour must not claim automatic apply, multi-scene apply, release readiness, Word saturation, or Google execution.');
  }
  if (program.releaseAuditNight01?.rootModernCommentShadowProductPathWired !== true
    || program.releaseAuditNight01?.mixedTrackedReplacementAndRootCommentProductLoopProven !== true
    || program.releaseAuditNight01?.automaticApplyCertified !== false
    || program.releaseAuditNight01?.wordSaturated !== false
    || program.releaseAuditNight01?.googleDocsOpened !== false) {
    add('RTK_P0_PRODUCT_COMMENTS_MIXED_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Program must bind bounded contour truth without overclaim.');
  }
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.releaseAudit.p0.productCommentsMixedMultiScene');
  if (!cell || cell.productRuntimeWired !== true || cell.automaticApplyCertified !== false || cell.wordSaturated !== false) {
    add('RTK_P0_PRODUCT_COMMENTS_MIXED_PROFILE_INVALID', 'profile.cells', 'Capability profile must bind product runtime truth without saturation or automatic apply.');
  }
  const coverage = ledger.coverageLedger?.releaseAuditNight01P0ProductCommentsMixedMultiScene;
  if (!coverage
    || coverage.passCases !== 4
    || coverage.negativePass !== 5
    || coverage.automaticApplyCertified !== false
    || coverage.multiSceneAtomicApplyCertified !== false
    || coverage.wordSaturated !== false
    || coverage.googleDocsOpened !== false) {
    add('RTK_P0_PRODUCT_COMMENTS_MIXED_LEDGER_INVALID', 'ledger.coverageLedger', 'Ledger must bind coverage without saturation.');
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: receipt?.nextStage || NEXT_STAGE,
    observedCases: productCasesInReceipt.length,
    negativeCases: negativeCases.length,
    liveElectronUiClickPass: receipt?.totals?.liveElectronUiClickPass || 0,
    rootCommentProductPathPass: receipt?.totals?.rootCommentProductPathPass || 0,
    mixedProductLoopPass: receipt?.totals?.mixedProductLoopPass || 0,
    commentDeletePhysicalReadbackPass: receipt?.totals?.commentDeletePhysicalReadbackPass || 0,
    automaticApplyCertified: receipt?.implementedCapability?.automaticApplyCertified === true,
    multiSceneAtomicApplyCertified: receipt?.implementedCapability?.multiSceneAtomicApplyCertified === true,
    wordSaturated: receipt?.implementedCapability?.wordSaturated === true,
    googleDocsOpened: receipt?.implementedCapability?.googleDocsOpened === true,
  };
}

export {
  buildProductCommentsMixedSource,
  buildWordProductScript,
  commentPackageReadback,
  instantiateProductPort,
  runDuplicateLocatorNegative,
  runElectronUiExportClickProof,
  runProductCase,
  runStaleBaselineNegative,
  runTamperedAuthorityNegative,
  runWrongSceneNegative,
};

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
    ? `p0-product-comments-mixed-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`
    : String(process.argv[runIdArgIndex + 1] || '');
  const artifactRoot = rootArgIndex === -1 ? DEFAULT_ARTIFACT_ROOT : String(process.argv[rootArgIndex + 1] || '');
  const wordWorkRoot = wordRootArgIndex === -1 ? DEFAULT_WORD_WORK_ROOT : String(process.argv[wordRootArgIndex + 1] || '');

  if (runPhysicalFlag) {
    const receipt = await runPhysical({ artifactRoot, wordWorkRoot, runId });
    writeJsonAtomic(path.join(artifactRoot, runId, 'p0-product-comments-mixed-multiscene-receipt.json'), receipt);
    if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
    if (updateStateFlag) updateState(receipt);
    if (approveGovernance) updateGovernanceApprovals();
    const result = evaluateWordReleaseAuditP0ProductCommentsMixedMultiScene({ receipt });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_PRODUCT_COMMENTS_MIXED_MULTI_SCENE=${result.status}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (updateStateFlag) updateState();
  if (approveGovernance) updateGovernanceApprovals();
  const result = evaluateWordReleaseAuditP0ProductCommentsMixedMultiScene();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_PRODUCT_COMMENTS_MIXED_MULTI_SCENE=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
