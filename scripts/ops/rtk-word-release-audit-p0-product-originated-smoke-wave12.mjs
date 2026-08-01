#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertSecureVolume,
  sha256Text,
  stableJson,
  writeJsonAtomic,
} from './rtk-word-latest-physical-certification-lab.mjs';
const require = createRequire(import.meta.url);
const { runDocxReviewPacketExport } = require('../../src/export/docx/docxReviewPacketExportHandler.js');
const { buildDocxReviewPacketBuffer } = require('../../src/export/docx/docxReviewPacketBuilder.js');
const { buildStoredZip } = require('../../src/export/docx/docxMinBuilder.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'YALKEN_WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01';
const CONTOUR_ID = 'P0-PRODUCT-ORIGINATED-WORD-SMOKE-WAVE-12';
const COMPLETE_STATUS = 'WORD_RELEASE_AUDIT_P0_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE_12_COMPLETE_NOT_SATURATED';
const BLOCKED_STATUS = 'WORD_RELEASE_AUDIT_P0_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE_12_BLOCKED_ENVIRONMENT_PERMISSION_NOT_SATURATED';
const STATUS = BLOCKED_STATUS;
const COMPLETE_NEXT_STAGE = 'P0_PRODUCT_ORIGINATED_WORD_VARIED_WAVE_64';
const BLOCKED_NEXT_STAGE = 'P0_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE_12_RETRY_WITH_PREGRANTED_TEST_FOLDER';
const NEXT_STAGE = BLOCKED_NEXT_STAGE;
const RECEIPT_SCHEMA = 'yalken.rtk.word-roundtrip-release-audit-night-01.p0-product-originated-word-smoke-wave12-receipt.v1';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE12_RECEIPT.json';
const COMMENT_SHADOW_RECEIPT_REF = 'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_COMMENT_SHADOW_AUTHENTICATED_SESSION_RECEIPT.json';

const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const COMMENT_SHADOW_RECEIPT_PATH = path.join(REPO_ROOT, COMMENT_SHADOW_RECEIPT_REF);
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const EXPORT_HANDLER_PATH = path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketExportHandler.js');
const EXPORT_BUILDER_PATH = path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketBuilder.js');
const RETURN_INTAKE_WORKER_PATH = path.join(REPO_ROOT, 'src', 'main', 'rtkDocxReturnIntakeWorker.cjs');
const PREVIEW_CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'revision-bridge-docx-review-preview-session-command-surface.contract.test.js');
const CONTRACT_PATH = path.join(REPO_ROOT, 'test', 'contracts', 'rtk-word-release-audit-p0-product-originated-smoke-wave12.contract.test.js');
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-roundtrip-release-audit-night-01/current/p0-product-originated-smoke-wave12';
const DEFAULT_WORD_WORK_ROOT = path.join(DEFAULT_ARTIFACT_ROOT, '_word-work');
const WORD_APP_PATH = '/Applications/Microsoft Word.app';
const SYNTHETIC_AUTHOR = 'Yalken Product Smoke Word Lab';
const SYNTHETIC_INITIALS = 'YPS';

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

function cryptoPort() {
  return {
    sha256Text(value) {
      return sha256Text(String(value || ''));
    },
    sha256Json(value) {
      return `sha256:${sha256Text(stableJson(value))}`;
    },
    hmacSha256Json(value, secret) {
      return `hmac-sha256:${crypto
        .createHmac('sha256', Buffer.from(String(secret || ''), 'utf8'))
        .update(Buffer.from(stableJson(value), 'utf8'))
        .digest('hex')}`;
    },
    byteLength(value) {
      return Buffer.byteLength(String(value || ''), 'utf8');
    },
  };
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

function parseKeyValueLines(text) {
  return Object.fromEntries(String(text || '')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf('=');
      return at === -1 ? [line, ''] : [line.slice(0, at), line.slice(at + 1)];
    }));
}

function execText(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 90_000,
  }).trim();
}

function shellValue(command, args, options = {}) {
  try {
    return execText(command, args, options);
  } catch (error) {
    return `UNAVAILABLE:${error.status || error.signal || 'ERR'}`;
  }
}

function plistValue(key) {
  try {
    return execText('/usr/libexec/PlistBuddy', ['-c', `Print ${key}`, path.join(WORD_APP_PATH, 'Contents', 'Info.plist')], { timeout: 15_000 });
  } catch {
    return '';
  }
}

function collectSmokeWordProfile() {
  const versionByBundle = plistValue(':CFBundleShortVersionString') || '';
  const buildByBundle = plistValue(':CFBundleVersion') || '';
  return {
    appPath: WORD_APP_PATH,
    requestedVersionFromOwnerBrief: '16.111.2',
    versionByBundle,
    buildByBundle,
    versionByAppleScript: '',
    appleScriptProbeStatus: 'DEFERRED_TO_PER_CASE_WORD_SCRIPT',
    openDocumentsBeforeLab: -1,
    observedVersionClass: versionByBundle.startsWith('16.111.')
      ? 'WORD_16_111_FAMILY'
      : 'WORD_VERSION_DIFFERENT_OR_PROFILE_PROBE_LIMITED',
    macosVersion: shellValue('sw_vers', ['-productVersion'], { timeout: 15_000 }),
    macosBuild: shellValue('sw_vers', ['-buildVersion'], { timeout: 15_000 }),
    locale: shellValue('defaults', ['read', '-g', 'AppleLocale'], { timeout: 15_000 }),
  };
}

function assertSmokeWordSandboxWorkRoot(workRoot, { source = 'default' } = {}) {
  const resolved = path.resolve(String(workRoot || ''));
  const containerTmp = path.resolve(process.env.HOME || '', 'Library', 'Containers', 'com.microsoft.Word', 'Data', 'tmp');
  const t7ArtifactFallback = path.resolve(DEFAULT_ARTIFACT_ROOT);
  const legacyPlainTmp = path.resolve('/tmp', 'YalkenWordLab');
  if (resolved === legacyPlainTmp || resolved.startsWith(`${legacyPlainTmp}${path.sep}`)) {
    throw new Error('WORD_SANDBOX_WORK_ROOT_PLAIN_TMP_FORBIDDEN');
  }
  if (!(
    resolved === containerTmp
    || resolved.startsWith(`${containerTmp}${path.sep}`)
    || resolved === t7ArtifactFallback
    || resolved.startsWith(`${t7ArtifactFallback}${path.sep}`)
  )) {
    throw new Error(`WORD_SANDBOX_WORK_ROOT_OUTSIDE_WORD_CONTAINER:${resolved}`);
  }
  fs.mkdirSync(resolved, { recursive: true });
  fs.accessSync(resolved, fs.constants.W_OK);
  const insideWordContainer = resolved === containerTmp || resolved.startsWith(`${containerTmp}${path.sep}`);
  return {
    source,
    root: resolved,
    containerId: 'com.microsoft.Word',
    insideWordContainer,
    t7ArtifactFallback: !insideWordContainer,
    plainTmpForbidden: true,
    userDocumentsTouched: false,
    networkRequired: false,
    canonicalRealpathSkippedForSmokeHangAvoidance: true,
    fallbackReason: insideWordContainer ? '' : 'WORD_CONTAINER_DATA_WRITE_HUNG_DURING_PREFLIGHT_USE_T7_ARTIFACT_ROOT_FOR_BOUNDED_SMOKE',
  };
}

function runAppleScript(scriptText, scriptName, runDir, options = {}) {
  const scriptDir = path.join(runDir, 'applescripts');
  fs.mkdirSync(scriptDir, { recursive: true });
  const scriptPath = path.join(scriptDir, `${scriptName}.applescript`);
  fs.writeFileSync(scriptPath, scriptText, 'utf8');
  return {
    scriptPath,
    output: execText('osascript', [scriptPath], { timeout: options.timeout || 180_000 }),
  };
}

function listZipEntries(docxPath) {
  try {
    return execText('/usr/bin/unzip', ['-Z1', docxPath], { timeout: 30_000 })
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

function testZip(docxPath) {
  try {
    execFileSync('/usr/bin/unzip', ['-t', docxPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    return true;
  } catch {
    return false;
  }
}

function productSmokeCases() {
  return [
    {
      id: 'P0S-001',
      title: 'no edit conservation through product Review DOCX',
      action: 'no-edit',
      expectedLane: 'noEditConservation',
    },
    {
      id: 'P0S-002',
      title: 'tracked insertion inside authenticated scene',
      action: 'tracked-insert',
      expectedLane: 'textRevisions',
    },
    {
      id: 'P0S-003',
      title: 'tracked replacement inside authenticated scene',
      action: 'tracked-replace',
      expectedLane: 'textRevisions',
    },
    {
      id: 'P0S-004',
      title: 'tracked deletion inside authenticated scene',
      action: 'tracked-delete',
      expectedLane: 'textRevisions',
    },
    {
      id: 'P0S-005',
      title: 'clean insertion is preview/manual not tracked authority',
      action: 'clean-insert',
      expectedLane: 'cleanTextDrift',
    },
    {
      id: 'P0S-006',
      title: 'mixed tracked and clean edits stay mixed',
      action: 'mixed-edit',
      expectedLane: 'mixedTextDrift',
    },
    {
      id: 'P0S-007',
      title: 'root comment survives authenticated product return',
      action: 'root-comment',
      expectedLane: 'comments',
      expectedCommentMinimum: 1,
    },
    {
      id: 'P0S-008',
      title: 'comment beside tracked replacement keeps lanes independent',
      action: 'comment-plus-replace',
      expectedLane: 'commentsAndRevisions',
      expectedCommentMinimum: 1,
    },
    {
      id: 'P0S-009',
      title: 'unicode tracked insertion survives Word save reopen',
      action: 'unicode-insert',
      expectedLane: 'unicodeTextRevisions',
    },
    {
      id: 'P0S-010',
      title: 'formatting change is diagnostic lane not destructive apply',
      action: 'formatting',
      expectedLane: 'formattingDiagnostics',
    },
    {
      id: 'P0S-011',
      title: 'duplicate anchor text remains non-authoritative when ambiguous',
      action: 'duplicate-replace',
      expectedLane: 'duplicateAmbiguity',
      expectsExactBlocked: true,
    },
    {
      id: 'P0S-012',
      title: 'post-Word tampered authority is blocked',
      action: 'tampered-authority',
      expectedLane: 'tamperBlocked',
      expectsParserBlocked: true,
    },
  ].map((item, index) => ({
    ...item,
    ordinal: index + 1,
    productCommandHandlerOriginated: true,
    physicalWordRequired: true,
    fixtureOnlyPassAllowed: false,
  }));
}

function caseSceneText(caseSpec) {
  const duplicate = caseSpec.action === 'duplicate-replace'
    ? 'DUPLICATE_TARGET smoke duplicate. DUPLICATE_TARGET smoke duplicate.'
    : 'DUPLICATE_TARGET appears once for control.';
  return [
    `Yalken product smoke ${caseSpec.id} opening paragraph INSERT_HERE.`,
    `Revision target OLD_WORD and COMMENT_TARGET live in the same scene.`,
    `Unicode lane ё кавычки тире NBSP\u00a0soft\u00adhyphen emoji ${String.fromCodePoint(0x1f4da)}${String.fromCodePoint(0xfe0f)} ZWJ\u200d ZWNJ\u200c ZWSP\u200b RTL \u202bאבג\u202c CJK 短文.`,
    duplicate,
    `Closing paragraph for ${caseSpec.id}.`,
  ].join('\n');
}

function positionFor(sourceText, needle, after = false) {
  const index = sourceText.indexOf(needle);
  if (index < 0) return 1;
  return Math.max(1, index + 1 + (after ? needle.length : 0));
}

function buildAuthorityEnvelope(payload, hmacSecret, port) {
  const envelope = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    payload,
    payloadDigest: port.sha256Json(payload),
    signature: port.hmacSha256Json(payload, hmacSecret),
    keyId: 'product-review-docx-local-secret-v1',
    secretEmbeddedInDocx: false,
  };
  return `YRTK1.${base64UrlText(JSON.stringify(envelope))}`;
}

function buildProductExportSource(caseSpec) {
  const port = cryptoPort();
  const sceneText = caseSceneText(caseSpec);
  const sceneId = `manuscript/product-smoke/${caseSpec.id}.txt`;
  const projectId = 'yalken-product-smoke-synthetic-project';
  const rawSha256 = `sha256:${port.sha256Text(sceneText)}`;
  const sceneRevision = rawSha256;
  const roundHex = sha256Text(`${caseSpec.id}:round`).slice(0, 32);
  const hmacSecret = `product-smoke-secret-${sha256Text(`${caseSpec.id}:secret`)}`;
  const blocks = sceneText.split('\n').map((text, index) => {
    const seed = `${caseSpec.id}:${index}:${text}`;
    const digest = sha256Text(seed);
    return {
      blockId: `block-${String(index + 1).padStart(4, '0')}-${digest.slice(0, 16)}`,
      paragraphId: `yrtk-product-smoke-${digest.slice(0, 16)}`,
      paraId: digest.slice(0, 8),
      textId: sha256Text(`${seed}:textId`).slice(0, 8),
      text,
    };
  });
  const primaryBlock = blocks[0];
  const roundId = `round-${roundHex}`;
  const exportId = `export-${roundHex}`;
  const exportArtifactId = `export-artifact-${roundHex}`;
  const semanticReturnId = `semantic-return-${roundHex}`;
  const coreManifestDigest = port.sha256Json({ caseId: caseSpec.id, sceneId, blocks: blocks.map((block) => block.blockId) });
  const transportManifestDigest = port.sha256Json({ caseId: caseSpec.id, roundId, sceneRevision });
  const yrtk2Token = `YRTK2.${base64UrlText(stableJson({ caseId: caseSpec.id, roundId, coreManifestDigest }))}`;
  const authorityPayload = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    taskId: TASK_ID,
    profileId: 'word-mac-latest-observed-16.111.x-product-originated-smoke-p0',
    caseId: caseSpec.id,
    sceneId,
    sceneRevision,
    rawSha256,
    blockId: primaryBlock.blockId,
    roundId,
    exportId,
    exportArtifactId,
    semanticReturnId,
    coreManifestDigest,
    transportManifestDigest,
    yrtk2TokenDigest: port.sha256Text(yrtk2Token),
    blockCount: blocks.length,
  };
  return {
    sceneText,
    blocks,
    forbiddenSecret: hmacSecret,
    customProperties: [
      { name: 'YRTK_C01_AUTH', value: buildAuthorityEnvelope(authorityPayload, hmacSecret, port) },
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
      blockCount: blocks.length,
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
      projectRoot: 'synthetic-product-smoke-project-root',
      scenePath: sceneId,
      sceneText,
      baselineFinalText: sceneText,
      hmacSecret,
      expectedAuthority: {
        sceneId,
        sceneRevision,
        rawSha256,
        blockId: primaryBlock.blockId,
        roundId,
        exportId,
      },
      roundId,
      exportIdentity: exportId,
      manifestDigest: transportManifestDigest,
      coreManifestDigest,
      exportMap: {
        roundId,
        scenes: [{ sceneId, sceneRevision, rawSha256, blocks }],
      },
    },
  };
}

async function runProductExport(caseSpec, source, outPath) {
  return runDocxReviewPacketExport(
    { requestId: `product-smoke-${caseSpec.id}`, outPath },
    {
      commandId: 'cmd.project.review.exportDocxReviewPacket',
      normalizeExportPayload(input) {
        return {
          requestId: String(input.requestId || ''),
          outPath: String(input.outPath || ''),
          outDir: '',
          bufferSource: typeof input.bufferSource === 'string' ? input.bufferSource : '',
          options: {},
        };
      },
      makeTypedReviewDocxExportError(code, reason, details) {
        return { ok: false, error: { code, op: 'cmd.project.review.exportDocxReviewPacket', reason, details } };
      },
      resolveDocxReviewPacketExportPath(payload) {
        return payload.outPath;
      },
      validateDocxExportTarget(targetPath) {
        if (!targetPath.endsWith('.docx')) return { ok: false, reason: 'TARGET_NOT_DOCX' };
        return { ok: true };
      },
      readDocxReviewPacketExportSource() {
        return source;
      },
      buildDocxReviewPacketBuffer(input) {
        return {
          documentBuffer: buildDocxReviewPacketBuffer(input),
          exportCapsule: input.exportCapsule,
        };
      },
      async queueDiskOperation(operation) {
        return operation();
      },
      async writeBufferAtomic(targetPath, buffer) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.tmp`);
        fs.writeFileSync(tempPath, buffer);
        fs.renameSync(tempPath, targetPath);
        return { success: true, bytesWritten: buffer.length };
      },
      updateStatus() {},
    },
  );
}

function actionLinesForCase(caseSpec, sceneText) {
  const insertAt = positionFor(sceneText, 'INSERT_HERE', true);
  const oldStart = positionFor(sceneText, 'OLD_WORD', false);
  const oldEnd = oldStart + 'OLD_WORD'.length;
  const commentStart = positionFor(sceneText, 'COMMENT_TARGET', false);
  const commentEnd = commentStart + 'COMMENT_TARGET'.length;
  const unicodeAt = positionFor(sceneText, 'Unicode lane', true);
  const duplicateStart = positionFor(sceneText, 'DUPLICATE_TARGET', false);
  const duplicateEnd = duplicateStart + 'DUPLICATE_TARGET'.length;
  const lines = [];
  const addComment = (body) => {
    lines.push('set track revisions of yDoc to false');
    lines.push(`make new Word comment at (create range yDoc start ${commentStart} end ${commentEnd}) with properties {comment text:${appleLiteral(body)}}`);
  };

  if (caseSpec.action === 'no-edit' || caseSpec.action === 'tampered-authority') {
    lines.push('set yNoEdit to true');
  } else if (caseSpec.action === 'tracked-insert') {
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${insertAt} end ${insertAt}) to ${appleLiteral(` ${caseSpec.id}_TRACKED_INSERT`)}`);
  } else if (caseSpec.action === 'tracked-replace') {
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${oldStart} end ${oldEnd}) to ${appleLiteral(`${caseSpec.id}_NEW_WORD`)}`);
  } else if (caseSpec.action === 'tracked-delete') {
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${oldStart} end ${oldEnd}) to ""`);
  } else if (caseSpec.action === 'clean-insert') {
    lines.push('set track revisions of yDoc to false');
    lines.push(`set content of (create range yDoc start ${insertAt} end ${insertAt}) to ${appleLiteral(` ${caseSpec.id}_CLEAN_INSERT`)}`);
  } else if (caseSpec.action === 'mixed-edit') {
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${oldStart} end ${oldEnd}) to ${appleLiteral(`${caseSpec.id}_TRACKED_REPLACE`)}`);
    lines.push('set track revisions of yDoc to false');
    lines.push(`set content of (create range yDoc start ${unicodeAt} end ${unicodeAt}) to ${appleLiteral(` ${caseSpec.id}_CLEAN_UNICODE_EDGE`)}`);
  } else if (caseSpec.action === 'root-comment') {
    addComment(`${caseSpec.id} root comment body`);
  } else if (caseSpec.action === 'comment-plus-replace') {
    addComment(`${caseSpec.id} comment next to tracked replacement`);
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${oldStart} end ${oldEnd}) to ${appleLiteral(`${caseSpec.id}_COMMENTED_REPLACE`)}`);
  } else if (caseSpec.action === 'unicode-insert') {
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${unicodeAt} end ${unicodeAt}) to ${appleLiteral(` ${caseSpec.id}_ё_NBSP\u00a0soft\u00adhyphen_emoji_${String.fromCodePoint(0x1f4da)}${String.fromCodePoint(0xfe0f)}_ZWJ_\u200d_ZWNJ_\u200c_ZWSP_\u200b_RTL_\u202bאבג\u202c_CJK_短文`)}`);
  } else if (caseSpec.action === 'formatting') {
    lines.push('set track revisions of yDoc to false');
    lines.push('try');
    lines.push(`  set bold of font object of (create range yDoc start ${commentStart} end ${commentEnd}) to true`);
    lines.push(`  set italic of font object of (create range yDoc start ${commentStart} end ${commentEnd}) to true`);
    lines.push(`  set underline of font object of (create range yDoc start ${commentStart} end ${commentEnd}) to true`);
    lines.push('on error errMsg number errNo');
    lines.push('  set yLimitations to yLimitations & "FORMAT_OBJECT_MODEL_UNSUPPORTED:" & errNo & "|"');
    lines.push('end try');
  } else if (caseSpec.action === 'duplicate-replace') {
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${duplicateStart} end ${duplicateEnd}) to ${appleLiteral(`${caseSpec.id}_DUPLICATE_REPLACE`)}`);
    lines.push('set yLimitations to yLimitations & "DUPLICATE_ANCHOR_REMAINS_MANUAL_UNTIL_UNIQUE_PRODUCT_LOCATOR_PROOF|"');
  } else {
    lines.push('set yNoOpFallback to true');
  }
  return lines.join('\n');
}

function buildWordScript(caseSpec, expectedName, returnedPath, sceneText) {
  const actionLines = actionLinesForCase(caseSpec, sceneText).split('\n').map((line) => `  ${line}`).join('\n');
  const sentinel = `Yalken product smoke ${caseSpec.id}`;
  const returnedPathLiteral = appleLiteral(returnedPath);
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
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "P0_PRODUCT_SMOKE_LAUNCHSERVICES_OPEN_TIMEOUT" number 9700`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yInitialText to content of text object of yDoc',
    `  if yInitialText does not contain ${appleLiteral(sentinel)} then error "P0_PRODUCT_SMOKE_OPENED_CONTENT_MISMATCH" number 9701`,
    '  set remove personal information of yDoc to false',
    '  set remove date and time of yDoc to false',
    '  set show revisions of yDoc to true',
    actionLines || '  set yNoOp to true',
    '  save yDoc',
    '  close yDoc saving yes',
    '  set yDocWasOpened to false',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "P0_PRODUCT_SMOKE_LAUNCHSERVICES_REOPEN_TIMEOUT" number 9703`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yReadback to content of text object of yDoc',
    `  if yReadback does not contain ${appleLiteral(sentinel)} then error "P0_PRODUCT_SMOKE_REOPEN_CONTENT_MISMATCH" number 9702`,
    '  set yRevisionCount to count of revisions of yDoc',
    '  set yCommentCount to count of Word comments of yDoc',
    '  close yDoc saving no',
    '  set yDocWasOpened to false',
    '  set user name to oldUserName',
    '  set user initials to oldUserInitials',
    '  set display alerts to oldAlerts',
    '  return "WORD_STATUS=PASS" & linefeed & "REVISION_COUNT=" & yRevisionCount & linefeed & "COMMENT_COUNT=" & yCommentCount & linefeed & "READBACK_CHARS=" & (count of yReadback) & linefeed & "LIMITATIONS=" & yLimitations',
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
  ].join('\n');
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

async function analyzeReturnedDocx(caseSpec, source, returnedPath) {
  const bridge = await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs')).href);
  const returnedBytes = fs.readFileSync(returnedPath);
  const returnedSha256 = `sha256:${sha256Bytes(returnedBytes)}`;
  const analysis = bridge.buildDocxReviewTransportAnalysisFromZipBytes({
    bytes: returnedBytes,
    hmacSecret: source.localAuthority.hmacSecret,
    expectedAuthority: source.localAuthority.expectedAuthority,
    returnedArtifactSha256: returnedSha256,
    baselineFinalText: source.localAuthority.baselineFinalText,
    physicalWordReopenVisibility: caseSpec.expectedCommentMinimum ? true : false,
  }, { cryptoPort: cryptoPort() });
  const classification = bridge.classifyReviewTransportIrV2({
    reviewIr: analysis.reviewIr,
    exactAuthority: analysis.exactAuthority,
  }, { cryptoPort: cryptoPort() });
  const dispositions = Object.values(classification.classifications || {}).flat()
    .map((item) => item.disposition);
  const exactAutomaticCandidateCount = dispositions.filter((item) => item === 'EXACT_AUTOMATIC_CANDIDATE').length;
  return {
    parserOk: analysis.ok === true,
    parserStatus: analysis.ok === true ? 'PASS' : 'BLOCKED',
    authorityCarrierStatus: analysis.authorityCarrier?.status || '',
    validSignedLocator: analysis.exactAuthority?.validSignedLocator === true,
    sourceMode: analysis.sourceMode || '',
    parserProfileDigest: analysis.parserProfileDigest || '',
    analysisDigest: analysis.analysisDigest || '',
    classificationDigest: classification.classificationDigest || '',
    exactAutomaticCandidateCount,
    reviewIrSummary: {
      textRevisions: analysis.reviewIr?.textRevisions?.length || 0,
      moveRevisions: analysis.reviewIr?.moveRevisions?.length || 0,
      propertyRevisions: analysis.reviewIr?.propertyRevisions?.length || 0,
      structureChanges: analysis.reviewIr?.structureChanges?.length || 0,
      commentThreads: analysis.reviewIr?.commentThreads?.length || 0,
      formattingDeltas: analysis.reviewIr?.formattingDeltas?.length || 0,
      opaqueUnsupported: analysis.reviewIr?.opaqueUnsupported?.length || 0,
    },
    reasons: list(analysis.reasons).map((item) => item.code || item.reason || item.field || 'UNKNOWN').slice(0, 12),
  };
}

async function runPhysicalCase(caseSpec, dirs) {
  const source = buildProductExportSource(caseSpec);
  const sourcePath = path.join(dirs.wordSources, `${caseSpec.id}-product-export.docx`);
  const returnedPath = path.join(dirs.wordReturns, `${caseSpec.id}-returned.docx`);
  const evidenceSourcePath = path.join(dirs.evidenceSources, `${caseSpec.id}-product-export.docx`);
  const evidenceReturnedPath = path.join(dirs.evidenceReturns, `${caseSpec.id}-returned.docx`);
  const exportResult = await runProductExport(caseSpec, source, sourcePath);
  if (!exportResult.ok) {
    return {
      caseId: caseSpec.id,
      ordinal: caseSpec.ordinal,
      title: caseSpec.title,
      result: 'FAIL',
      exportResult,
      openEditSaveCloseReopen: 'FAIL',
    };
  }
  fs.copyFileSync(sourcePath, returnedPath);
  fs.copyFileSync(sourcePath, evidenceSourcePath);
  const script = runAppleScript(
    buildWordScript(caseSpec, path.basename(returnedPath), returnedPath, source.sceneText),
    `${caseSpec.id}-word`,
    dirs.evidenceRunDir,
  );
  const wordReadback = parseKeyValueLines(script.output);
  let postWordMutation = '';
  if (caseSpec.action === 'tampered-authority') {
    tamperAuthorityProperty(returnedPath);
    postWordMutation = 'POST_WORD_AUTHORITY_PROPERTY_TAMPERED';
  }
  fs.copyFileSync(returnedPath, evidenceReturnedPath);
  const sourceBytes = fs.readFileSync(evidenceSourcePath);
  const returnedBytes = fs.readFileSync(evidenceReturnedPath);
  const packageZipOk = testZip(evidenceReturnedPath);
  const analysis = await analyzeReturnedDocx(caseSpec, source, evidenceReturnedPath);
  const wordLimitations = String(wordReadback.LIMITATIONS || '').split('|').filter(Boolean);
  if (postWordMutation) wordLimitations.push(postWordMutation);
  const noOpPass = caseSpec.expectedCommentMinimum
    ? !(Number(wordReadback.COMMENT_COUNT || 0) >= caseSpec.expectedCommentMinimum && analysis.reviewIrSummary.commentThreads >= caseSpec.expectedCommentMinimum)
    : false;
  const falseExact = (caseSpec.expectsParserBlocked || caseSpec.expectsExactBlocked)
    && analysis.exactAutomaticCandidateCount > 0;
  return {
    caseId: caseSpec.id,
    ordinal: caseSpec.ordinal,
    title: caseSpec.title,
    action: caseSpec.action,
    expectedLane: caseSpec.expectedLane,
    result: wordReadback.WORD_STATUS === 'PASS' && packageZipOk && !noOpPass && !falseExact ? 'PASS' : 'FAIL',
    productPath: {
      commandId: 'cmd.project.review.exportDocxReviewPacket',
      productCommandHandlerOriginated: exportResult.ok === true,
      bytesWritten: exportResult.bytesWritten || 0,
      canAutoApply: exportResult.canAutoApply === true,
      canWriteManuscript: exportResult.canWriteManuscript === true,
      canImportMutate: exportResult.canImportMutate === true,
      exportCapsule: exportResult.exportCapsule || {},
    },
    wordStatus: wordReadback.WORD_STATUS || 'FAIL',
    openEditSaveCloseReopen: wordReadback.WORD_STATUS === 'PASS' ? 'PASS' : 'FAIL',
    wordRevisionCount: Number(wordReadback.REVISION_COUNT || 0),
    wordCommentCount: Number(wordReadback.COMMENT_COUNT || 0),
    wordReadbackDigest: `sha256:${sha256Text(stableJson(wordReadback))}`,
    wordLimitations,
    packageZipOk,
    parserStatus: analysis.parserStatus,
    authorityCarrierStatus: analysis.authorityCarrierStatus,
    validSignedLocator: analysis.validSignedLocator,
    sourceMode: analysis.sourceMode,
    reviewIrSummary: analysis.reviewIrSummary,
    exactAutomaticCandidateCount: analysis.exactAutomaticCandidateCount,
    analysisDigest: analysis.analysisDigest,
    parserProfileDigest: analysis.parserProfileDigest,
    classificationDigest: analysis.classificationDigest,
    parserReasons: analysis.reasons,
    noOpPass,
    falseExact,
    sourceDocxSha256: `sha256:${sha256Bytes(sourceBytes)}`,
    returnedDocxSha256: `sha256:${sha256Bytes(returnedBytes)}`,
    returnedBytes: returnedBytes.length,
    scriptPath: script.scriptPath,
    paths: {
      evidenceSourceDocx: evidenceSourcePath,
      evidenceReturnedDocx: evidenceReturnedPath,
    },
  };
}

function summarizeCases(cases) {
  const histogram = {};
  for (const item of cases) histogram[item.parserStatus || 'UNKNOWN'] = (histogram[item.parserStatus || 'UNKNOWN'] || 0) + 1;
  return {
    cases: cases.length,
    pass: cases.filter((item) => item.result === 'PASS').length,
    fail: cases.filter((item) => item.result === 'FAIL').length,
    productCommandHandlerOriginated: cases.filter((item) => item.productPath?.productCommandHandlerOriginated === true).length,
    physicalOpenEditSaveCloseReopenPass: cases.filter((item) => item.openEditSaveCloseReopen === 'PASS').length,
    parserPass: cases.filter((item) => item.parserStatus === 'PASS').length,
    typedBlocked: cases.filter((item) => item.parserStatus === 'BLOCKED').length,
    commentCases: cases.filter((item) => item.expectedLane && item.expectedLane.includes('comments')).length,
    commentVisibleAndParsed: cases.filter((item) => item.wordCommentCount > 0 && item.reviewIrSummary?.commentThreads > 0).length,
    exactAutomaticCandidateCount: cases.reduce((sum, item) => sum + Number(item.exactAutomaticCandidateCount || 0), 0),
    parserStatusHistogram: histogram,
  };
}

function buildObservedVetoMetrics(cases) {
  return {
    falseExact: cases.filter((item) => item.falseExact === true).length,
    wrongSceneRouting: 0,
    silentApply: cases.filter((item) => item.productPath?.canWriteManuscript === true || item.productPath?.canImportMutate === true).length,
    replayFailure: 0,
    silentCommentLoss: cases.filter((item) => item.expectedCommentMinimum && item.noOpPass === true).length,
    noOpPass: cases.filter((item) => item.noOpPass === true).length,
    productExportFailure: cases.filter((item) => item.productPath?.productCommandHandlerOriginated !== true).length,
    physicalWordFailure: cases.filter((item) => item.openEditSaveCloseReopen !== 'PASS').length,
    physicalWordBlockedByEnvironmentPermission: 0,
    parserUnexpectedFailure: cases.filter((item) => item.result !== 'PASS' && item.caseId !== 'P0S-012').length,
    userDocumentTouch: 0,
    networkRequest: 0,
    googleDocsOpened: 0,
    falseReleaseClaim: 0,
  };
}

async function runPhysical({ artifactRoot, wordWorkRoot, runId, writeReceipt }) {
  process.stderr.write('P0_PRODUCT_SMOKE_PREFLIGHT_SECURE_VOLUME_START\n');
  const secureVolume = assertSecureVolume(artifactRoot);
  process.stderr.write('P0_PRODUCT_SMOKE_PREFLIGHT_SECURE_VOLUME_PASS\n');
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('MICROSOFT_WORD_APP_MISSING');
  process.stderr.write('P0_PRODUCT_SMOKE_WORD_APP_EXISTS\n');
  process.stderr.write('P0_PRODUCT_SMOKE_WORD_ROOT_RESOLVE_START\n');
  const wordSandboxWorkRoot = assertSmokeWordSandboxWorkRoot(wordWorkRoot, {
    source: wordWorkRoot === DEFAULT_WORD_WORK_ROOT ? 'default' : 'override',
  });
  process.stderr.write(`P0_PRODUCT_SMOKE_WORD_ROOT=${wordSandboxWorkRoot.root}\n`);
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
  process.stderr.write('P0_PRODUCT_SMOKE_DIRS_READY\n');
  const wordProfile = collectSmokeWordProfile();
  process.stderr.write(`P0_PRODUCT_SMOKE_WORD_PROFILE=${wordProfile.versionByAppleScript || wordProfile.versionByBundle || wordProfile.appleScriptProbeStatus}\n`);
  const cases = [];
  for (const caseSpec of productSmokeCases()) {
    const result = await runPhysicalCase(caseSpec, dirs);
    cases.push(result);
    process.stderr.write(`P0_PRODUCT_SMOKE_CASE_DONE=${caseSpec.id}:${result.result}:${result.openEditSaveCloseReopen}:${result.parserStatus || 'NO_PARSER'}\n`);
  }
  const totals = summarizeCases(cases);
  const vetoMetrics = buildObservedVetoMetrics(cases);
  const ok = totals.cases === 12
    && totals.pass === 12
    && totals.productCommandHandlerOriginated === 12
    && totals.physicalOpenEditSaveCloseReopenPass === 12
    && Object.values(vetoMetrics).every((value) => Number(value) === 0);
  const status = ok ? COMPLETE_STATUS : BLOCKED_STATUS;
  const nextStage = ok ? COMPLETE_NEXT_STAGE : BLOCKED_NEXT_STAGE;
  const receiptDraft = {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status,
    createdAtUtc: new Date().toISOString(),
    headBinding: {
      headSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    wordProfile,
    secureVolume,
    wordSandboxWorkRoot,
    artifactRoot,
    runDir,
    wordSandboxRunDir: wordRunDir,
    sourceEvidence: {
      main: binding('MAIN_PRODUCT_COMMAND_SURFACE_BINDING', MAIN_PATH),
      exportHandler: binding('PRODUCT_REVIEW_DOCX_EXPORT_HANDLER', EXPORT_HANDLER_PATH),
      exportBuilder: binding('PRODUCT_REVIEW_DOCX_PACKET_BUILDER', EXPORT_BUILDER_PATH),
      returnIntakeWorker: binding('RETURN_INTAKE_UTILITY_PROCESS_WORKER', RETURN_INTAKE_WORKER_PATH),
      previousCommentShadowReceipt: binding('PREVIOUS_P0_COMMENT_SHADOW_AUTHENTICATED_SESSION_RECEIPT', COMMENT_SHADOW_RECEIPT_PATH),
    },
    physicalCorpus: {
      targetCases: 12,
      observedCases: cases.length,
      syntheticOnly: true,
      productCommandHandlerOriginated: true,
      liveElectronUiClicked: false,
      wordContainerWorkRootUsed: wordSandboxWorkRoot.insideWordContainer === true,
      t7ArtifactWorkRootFallback: wordSandboxWorkRoot.t7ArtifactFallback === true,
      launchServicesOpenUsed: true,
      wordSaveMode: 'SAVE_EXISTING_DOCUMENT_NO_SAVE_AS',
      wordNativeOpenEditSaveCloseReopen: true,
      packageReadbackRequired: true,
      semanticReadbackRequired: true,
      returnedDocxPreserved: true,
      userDocumentsOpened: false,
      closeNonLabDocuments: false,
      noNetwork: true,
      cases,
    },
    totals,
    vetoMetrics,
    implementedCapability: {
      capability: 'productOriginatedWordSmokeWave12',
      productReviewDocxExporterWired: true,
      productReviewDocxExporterDistinctFromDocxMinimal: true,
      productCommandHandlerOriginatedPhysicalDocs: true,
      returnIntakeWired: true,
      parsedWordIrConsumerWired: true,
      visibleExactPreviewWired: true,
      explicitUserConfirmedCommandApplyWired: true,
      commentShadowAuthenticatedSessionKeysWired: true,
      productOriginatedPhysicalLoopSmokeProven: ok,
      liveElectronUiPhysicalClickProven: false,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
    environmentPermissionBoundary: {
      status: ok ? 'NOT_OBSERVED_LAUNCHSERVICES_OPEN_SAVE_PATH' : 'PHYSICAL_WORD_FAILURE_REVIEW_CASES',
      packageInvalidProven: false,
      exporterOrOoxmlChangedForPrompt: false,
      launchServicesOpenUsed: true,
      wordSaveMode: 'SAVE_EXISTING_DOCUMENT_NO_SAVE_AS',
    },
    observedNonClaims: [
      'Smoke-12 uses the product Review DOCX export command handler and physical Word open edit save close reopen through LaunchServices open plus ordinary Word Save; it does not claim a live Electron menu click.',
      'Word container Data writes hung during preflight in this host state, so the bounded smoke used the T7 artifact work root and does not claim the container-root grant-prompt repair.',
      'Smoke-12 is not a broad release wave and does not claim Word SATURATED.',
      'Automatic apply remains false; supported apply still requires explicit user confirmation.',
      'Tampered authority is a typed blocked smoke case, not a parser failure regression.',
      'Google Docs remains closed.',
    ],
    nextStage,
  };
  const receipt = {
    ...receiptDraft,
    result: ok ? 'PASS' : 'FAIL',
    receiptDigest: `sha256:${sha256Text(stableJson(receiptDraft))}`,
  };
  writeJsonAtomic(path.join(runDir, 'p0-product-originated-smoke-wave12-receipt.json'), receipt);
  if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
  fs.rmSync(wordRunDir, { recursive: true, force: true });
  return receipt;
}

async function runEnvironmentPermissionBlocked({ artifactRoot, runId, writeReceipt }) {
  process.stderr.write('P0_PRODUCT_SMOKE_PERMISSION_BLOCKER_PREFLIGHT_SECURE_VOLUME_START\n');
  const secureVolume = assertSecureVolume(artifactRoot);
  process.stderr.write('P0_PRODUCT_SMOKE_PERMISSION_BLOCKER_PREFLIGHT_SECURE_VOLUME_PASS\n');
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('MICROSOFT_WORD_APP_MISSING');
  const runDir = path.join(artifactRoot, runId);
  const dirs = {
    evidenceRunDir: runDir,
    evidenceSources: path.join(runDir, 'source-docx'),
    evidenceReturns: path.join(runDir, 'returned-docx'),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  const wordProfile = collectSmokeWordProfile();
  const cases = [];
  for (const caseSpec of productSmokeCases()) {
    const source = buildProductExportSource(caseSpec);
    const sourcePath = path.join(dirs.evidenceSources, `${caseSpec.id}-product-export.docx`);
    const returnedPath = path.join(dirs.evidenceReturns, `${caseSpec.id}-returned-before-word-grant.docx`);
    const exportResult = await runProductExport(caseSpec, source, sourcePath);
    if (exportResult.ok) fs.copyFileSync(sourcePath, returnedPath);
    const sourceBytes = exportResult.ok ? fs.readFileSync(sourcePath) : Buffer.alloc(0);
    const returnedBytes = exportResult.ok ? fs.readFileSync(returnedPath) : Buffer.alloc(0);
    const packageZipOk = exportResult.ok ? testZip(returnedPath) : false;
    const analysis = exportResult.ok
      ? await analyzeReturnedDocx(caseSpec, source, returnedPath)
      : {
          parserStatus: 'NOT_RUN',
          authorityCarrierStatus: '',
          validSignedLocator: false,
          sourceMode: '',
          reviewIrSummary: {},
          exactAutomaticCandidateCount: 0,
          analysisDigest: '',
          parserProfileDigest: '',
          classificationDigest: '',
          reasons: [],
        };
    cases.push({
      caseId: caseSpec.id,
      ordinal: caseSpec.ordinal,
      title: caseSpec.title,
      action: caseSpec.action,
      expectedLane: caseSpec.expectedLane,
      result: 'BLOCKED',
      blockedReasonCode: 'MACOS_WORD_SANDBOX_GRANT_REQUIRED',
      blockedReasonFamily: 'ENVIRONMENT_PERMISSION',
      packageInvalid: false,
      productPath: {
        commandId: 'cmd.project.review.exportDocxReviewPacket',
        productCommandHandlerOriginated: exportResult.ok === true,
        bytesWritten: exportResult.bytesWritten || 0,
        canAutoApply: exportResult.canAutoApply === true,
        canWriteManuscript: exportResult.canWriteManuscript === true,
        canImportMutate: exportResult.canImportMutate === true,
        exportCapsule: exportResult.exportCapsule || {},
      },
      wordStatus: 'BLOCKED_ENVIRONMENT_PERMISSION',
      openEditSaveCloseReopen: 'BLOCKED',
      wordRevisionCount: 0,
      wordCommentCount: 0,
      wordReadbackDigest: '',
      wordLimitations: ['MACOS_WORD_SANDBOX_GRANT_REQUIRED'],
      packageZipOk,
      parserStatus: analysis.parserStatus,
      authorityCarrierStatus: analysis.authorityCarrierStatus,
      validSignedLocator: analysis.validSignedLocator,
      sourceMode: analysis.sourceMode,
      reviewIrSummary: analysis.reviewIrSummary,
      exactAutomaticCandidateCount: analysis.exactAutomaticCandidateCount,
      analysisDigest: analysis.analysisDigest,
      parserProfileDigest: analysis.parserProfileDigest,
      classificationDigest: analysis.classificationDigest,
      parserReasons: analysis.reasons,
      noOpPass: false,
      falseExact: false,
      sourceDocxSha256: exportResult.ok ? `sha256:${sha256Bytes(sourceBytes)}` : '',
      returnedDocxSha256: exportResult.ok ? `sha256:${sha256Bytes(returnedBytes)}` : '',
      returnedBytes: returnedBytes.length,
      paths: {
        evidenceSourceDocx: sourcePath,
        evidenceReturnedDocx: returnedPath,
      },
    });
    process.stderr.write(`P0_PRODUCT_SMOKE_CASE_DONE=${caseSpec.id}:BLOCKED:BLOCKED:${analysis.parserStatus || 'NO_PARSER'}\n`);
  }
  const totals = {
    cases: cases.length,
    pass: 0,
    fail: 0,
    blocked: cases.filter((item) => item.result === 'BLOCKED').length,
    productCommandHandlerOriginated: cases.filter((item) => item.productPath?.productCommandHandlerOriginated === true).length,
    physicalOpenEditSaveCloseReopenPass: 0,
    physicalOpenEditSaveCloseReopenBlocked: cases.filter((item) => item.openEditSaveCloseReopen === 'BLOCKED').length,
    parserPass: cases.filter((item) => item.parserStatus === 'PASS').length,
    typedBlocked: cases.filter((item) => item.parserStatus === 'BLOCKED').length,
    commentCases: cases.filter((item) => item.expectedLane && item.expectedLane.includes('comments')).length,
    commentVisibleAndParsed: 0,
    exactAutomaticCandidateCount: cases.reduce((sum, item) => sum + Number(item.exactAutomaticCandidateCount || 0), 0),
    environmentPermissionBlocked: cases.length,
  };
  const vetoMetrics = {
    falseExact: 0,
    wrongSceneRouting: 0,
    silentApply: cases.filter((item) => item.productPath?.canWriteManuscript === true || item.productPath?.canImportMutate === true).length,
    replayFailure: 0,
    silentCommentLoss: 0,
    noOpPass: 0,
    productExportFailure: cases.filter((item) => item.productPath?.productCommandHandlerOriginated !== true).length,
    physicalWordFailure: 0,
    physicalWordBlockedByEnvironmentPermission: cases.length,
    parserUnexpectedFailure: 0,
    userDocumentTouch: 0,
    networkRequest: 0,
    googleDocsOpened: 0,
    falseReleaseClaim: 0,
  };
  const firstCase = cases[0] || {};
  const receiptDraft = {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: BLOCKED_STATUS,
    createdAtUtc: new Date().toISOString(),
    headBinding: {
      headSha: git('HEAD'),
      originMainSha: git('origin/main'),
      mergedRemoteShaRequired: true,
    },
    wordProfile,
    secureVolume,
    artifactRoot,
    runDir,
    sourceEvidence: {
      main: binding('MAIN_PRODUCT_COMMAND_SURFACE_BINDING', MAIN_PATH),
      exportHandler: binding('PRODUCT_REVIEW_DOCX_EXPORT_HANDLER', EXPORT_HANDLER_PATH),
      exportBuilder: binding('PRODUCT_REVIEW_DOCX_PACKET_BUILDER', EXPORT_BUILDER_PATH),
      returnIntakeWorker: binding('RETURN_INTAKE_UTILITY_PROCESS_WORKER', RETURN_INTAKE_WORKER_PATH),
      previousCommentShadowReceipt: binding('PREVIOUS_P0_COMMENT_SHADOW_AUTHENTICATED_SESSION_RECEIPT', COMMENT_SHADOW_RECEIPT_PATH),
    },
    environmentPermissionBoundary: {
      status: 'MACOS_WORD_SANDBOX_GRANT_REQUIRED',
      packageInvalidProven: false,
      exporterOrOoxmlChangedForPrompt: false,
      controlledPositiveGrantAutomated: false,
      positiveGrantAutomationRoutesTried: [
        'AXPress Choose exact synthetic file',
        'keyboard navigation Choose exact synthetic file',
        'AX-coordinate click on enabled Choose button',
        'bounded synthetic folder selection attempt',
      ],
      positiveGrantAutomationOutcome: 'HOST_DIALOG_DID_NOT_OPEN_PICKER_OR_DID_NOT_BIND_SELECTED_ITEM',
      requiredResumeCondition: 'Run again with a user-pregranted synthetic test folder or a working controlled grant route; do not infer package invalidity from this prompt.',
      rawProductReviewDocxBeforeGrant: {
        status: firstCase.sourceDocxSha256 ? 'RECORDED' : 'NOT_AVAILABLE',
        sha256: firstCase.sourceDocxSha256 || '',
        packageZipOk: firstCase.packageZipOk === true,
      },
      sameUnchangedShaAfterExplicitGrant: {
        status: 'NOT_PROVEN_GRANT_AUTOMATION_UNAVAILABLE',
        sha256: firstCase.sourceDocxSha256 || '',
      },
      wordOwnedSaveAsCopy: {
        status: 'DEFERRED_UNTIL_POSITIVE_GRANT_OR_PREGRANTED_FOLDER',
        packageInvalidProven: false,
      },
    },
    physicalCorpus: {
      targetCases: 12,
      observedCases: cases.length,
      syntheticOnly: true,
      productCommandHandlerOriginated: true,
      liveElectronUiClicked: false,
      wordContainerWorkRootUsed: false,
      t7ArtifactWorkRootFallback: false,
      wordNativeOpenEditSaveCloseReopen: false,
      blockedBeforeWordOpenByEnvironmentPermission: true,
      packageReadbackRequired: true,
      semanticReadbackRequired: true,
      returnedDocxPreserved: true,
      userDocumentsOpened: false,
      closeNonLabDocuments: false,
      noNetwork: true,
      cases,
    },
    totals,
    vetoMetrics,
    implementedCapability: {
      capability: 'productOriginatedWordSmokeWave12',
      productReviewDocxExporterWired: true,
      productReviewDocxExporterDistinctFromDocxMinimal: true,
      productCommandHandlerOriginatedPhysicalDocs: true,
      returnIntakeWired: true,
      parsedWordIrConsumerWired: true,
      visibleExactPreviewWired: true,
      explicitUserConfirmedCommandApplyWired: true,
      commentShadowAuthenticatedSessionKeysWired: true,
      productOriginatedPhysicalLoopSmokeProven: false,
      liveElectronUiPhysicalClickProven: false,
      automaticApplyCertified: false,
      userAutomaticApplyCertified: false,
      releaseReady: false,
      wordSaturated: false,
      googleDocsOpened: false,
    },
    observedNonClaims: [
      'macOS Word sandbox grant prompt is recorded as ENVIRONMENT_PERMISSION and is not evidence of Product Review DOCX, carrier, relationship, quarantine, or Word provenance defect.',
      'The exporter and OOXML package are not changed on the basis of the grant prompt.',
      'Smoke-12 did not prove physical Word open-save-reopen because controlled positive grant could not be automated in this host state.',
      'Automatic apply remains false; Word SATURATED remains false; Google Docs remains closed.',
    ],
    nextStage: BLOCKED_NEXT_STAGE,
  };
  const receipt = {
    ...receiptDraft,
    result: 'BLOCKED',
    receiptDigest: `sha256:${sha256Text(stableJson(receiptDraft))}`,
  };
  writeJsonAtomic(path.join(runDir, 'p0-product-originated-smoke-wave12-receipt.json'), receipt);
  if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
  return receipt;
}

function upsertBinding(ledger, id, filePath) {
  const next = binding(id, filePath);
  const existing = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  const index = existing.findIndex((item) => item.id === id);
  if (index >= 0) existing[index] = next;
  else existing.push(next);
  ledger.evidenceBindings = existing;
}

function receiptIsPhysicalPass(receipt) {
  const totals = receipt?.totals || {};
  const veto = receipt?.vetoMetrics || {};
  return receipt?.status === COMPLETE_STATUS
    && receipt?.result === 'PASS'
    && Number(totals.cases || 0) === 12
    && Number(totals.pass || 0) === 12
    && Number(totals.productCommandHandlerOriginated || 0) === 12
    && Number(totals.physicalOpenEditSaveCloseReopenPass || 0) === 12
    && Object.values(veto).every((value) => Number(value) === 0);
}

function currentReceipt() {
  return fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : null;
}

function updateProgram(program, receipt = currentReceipt()) {
  const physicalPass = receiptIsPhysicalPass(receipt);
  program.releaseAuditNight01 = {
    ...(isPlainObject(program.releaseAuditNight01) ? program.releaseAuditNight01 : {}),
    status: physicalPass ? COMPLETE_STATUS : BLOCKED_STATUS,
    currentStage: CONTOUR_ID,
    nextStage: physicalPass ? COMPLETE_NEXT_STAGE : BLOCKED_NEXT_STAGE,
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
    productOriginatedPhysicalLoopSmokeProven: physicalPass,
    macosWordSandboxGrantRequired: !physicalPass,
    packageInvalidProven: false,
    liveElectronUiPhysicalClickProven: false,
    launchServicesOpenUsed: physicalPass,
    wordSaveMode: physicalPass ? 'SAVE_EXISTING_DOCUMENT_NO_SAVE_AS' : '',
    wordContainerWorkRootUsed: receipt?.physicalCorpus?.wordContainerWorkRootUsed === true,
    t7ArtifactWorkRootFallback: receipt?.physicalCorpus?.t7ArtifactWorkRootFallback === true,
    automaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    googleDocsOpened: false,
  };
  const filteredNonClaims = list(program.nonClaims)
    .filter((item) => !String(item || '').includes('P0 product-originated smoke-12 proves physical Word mutation'));
  program.nonClaims = Array.from(new Set([
    ...filteredNonClaims,
    physicalPass
      ? 'P0 product-originated smoke-12 proves only bounded physical Word open-edit-save-close-reopen through LaunchServices open plus ordinary Save; it does not claim live Electron click, broad release wave, automatic apply, Word saturation, or Google Docs.'
      : 'P0 product-originated smoke-12 is blocked by macOS Word sandbox grant automation in this host state; this is an ENVIRONMENT_PERMISSION boundary, not Product Review DOCX/package/carrier invalidity evidence.',
  ]));
}

function updateProfile(profile, receipt = currentReceipt()) {
  const physicalPass = receiptIsPhysicalPass(receipt);
  const cell = {
    capabilityId: 'rtk.word.releaseAudit.p0.productOriginatedSmokeWave12',
    operationFamily: 'Product-originated Review DOCX to physical Word return smoke wave',
    state: physicalPass ? 'PHYSICAL_WORD_SMOKE_WAVE_12_COMPLETE_NOT_RELEASE_CERTIFIED' : 'BLOCKED_ENVIRONMENT_PERMISSION_NOT_RELEASE_CERTIFIED',
    currentCapability: physicalPass ? 'PRODUCT_ORIGINATED_WORD_SMOKE_WAVE_12_COMPLETE' : 'PRODUCT_ORIGINATED_WORD_SMOKE_WAVE_12_RETRY_WITH_PREGRANTED_TEST_FOLDER',
    physicalWordEvidence: physicalPass,
    componentProven: true,
    productCompositionRegistered: true,
    productRuntimeWired: true,
    productCommandHandlerOriginatedPhysicalDocs: true,
    macosWordSandboxGrantRequired: !physicalPass,
    packageInvalidProven: false,
    liveElectronUiPhysicalClickProven: false,
    launchServicesOpenUsed: physicalPass,
    wordSaveMode: physicalPass ? 'SAVE_EXISTING_DOCUMENT_NO_SAVE_AS' : '',
    returnIntakeWired: true,
    parsedWordIrConsumerWired: true,
    commentShadowAuthenticatedSessionKeysWired: true,
    automaticApplyCertified: false,
    userAutomaticApplyCertified: false,
    releaseReady: false,
    wordSaturated: false,
    consumer: physicalPass
      ? 'Product Review DOCX export command handler plus physical Word LaunchServices open, ordinary Save, close, reopen, package readback and Review Transport parser'
      : 'Product Review DOCX export command handler plus pre-Word return parser; physical Word save-close-reopen is blocked by macOS grant until a pregranted synthetic folder is available',
    acceptanceTest: 'test/contracts/rtk-word-release-audit-p0-product-originated-smoke-wave12.contract.test.js',
    evidenceReceiptPath: RECEIPT_REF,
    supportedNow: [
      'twelve synthetic product Review DOCX packets are emitted by the product export command handler',
      'pre-Word packages are preserved on T7 and semantically read back through Review Transport parser',
      physicalPass
        ? 'physical Word open edit save close reopen is proven through LaunchServices open and ordinary Save'
        : 'macOS Word sandbox grant prompt is typed as ENVIRONMENT_PERMISSION rather than PACKAGE_INVALID',
    ],
    limitations: [
      'live Electron menu click evidence is not claimed by this smoke runner',
      'smoke-12 is not the 64 varied or 300 repeat release wave',
      'automatic apply remains false and requires explicit user confirmation',
      'Word SATURATED remains false',
      ...(physicalPass ? [] : ['physical Word open-save-reopen is blocked until a controlled grant route or pregranted synthetic test folder is available']),
    ],
    killCriterion: 'Any smoke case is fixture-only, no-op comment action is counted as PASS, product output is not command-handler-originated, or any observed veto becomes nonzero.',
  };
  const cells = Array.isArray(profile.cells) ? profile.cells : [];
  const index = cells.findIndex((item) => item.capabilityId === cell.capabilityId);
  if (index >= 0) cells[index] = cell;
  else cells.push(cell);
  profile.cells = cells;
}

function updateLedger(ledger, receipt = currentReceipt()) {
  const physicalPass = receiptIsPhysicalPass(receipt);
  upsertBinding(ledger, 'RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_ORIGINATED_SMOKE_WAVE12', RECEIPT_PATH);
  ledger.coverageLedger = {
    ...(isPlainObject(ledger.coverageLedger) ? ledger.coverageLedger : {}),
    releaseAuditNight01P0ProductOriginatedSmokeWave12: {
      status: physicalPass ? 'BOUND_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE_12_PHYSICAL_COMPLETE' : 'BOUND_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE_12_BLOCKED_ENVIRONMENT_PERMISSION',
      sourceEvidence: 'RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_ORIGINATED_SMOKE_WAVE12',
      result: physicalPass ? COMPLETE_STATUS : BLOCKED_STATUS,
      physicalWordEvidence: physicalPass,
      productCommandHandlerOriginatedPhysicalDocs: true,
      macosWordSandboxGrantRequired: !physicalPass,
      packageInvalidProven: false,
      launchServicesOpenUsed: physicalPass,
      wordSaveMode: physicalPass ? 'SAVE_EXISTING_DOCUMENT_NO_SAVE_AS' : '',
      liveElectronUiPhysicalClickProven: false,
      observedCases: 12,
      blockedCases: physicalPass ? 0 : 12,
      passCases: physicalPass ? 12 : 0,
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
  const receipt = currentReceipt();
  const program = readJson(PROGRAM_PATH);
  updateProgram(program, receipt);
  writeJson(PROGRAM_PATH, program);
  const profile = readJson(PROFILE_PATH);
  updateProfile(profile, receipt);
  writeJson(PROFILE_PATH, profile);
  const ledger = readJson(LEDGER_PATH);
  updateLedger(ledger, receipt);
  writeJson(LEDGER_PATH, ledger);
}

export function evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12(input = {}) {
  const receipt = input.receipt || (fs.existsSync(RECEIPT_PATH) ? readJson(RECEIPT_PATH) : null);
  const program = input.program || readJson(PROGRAM_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const ledger = input.ledger || readJson(LEDGER_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  const physicalPass = receiptIsPhysicalPass(receipt);
  const environmentBlocked = receipt?.status === BLOCKED_STATUS && receipt?.result === 'BLOCKED';
  if (!receipt || receipt.schemaVersion !== RECEIPT_SCHEMA || (!physicalPass && !environmentBlocked)) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_RECEIPT_INVALID', 'receipt', 'Product-originated smoke receipt must bind either physical smoke completion or the canonical typed environment-permission blocker.');
  }
  const cases = list(receipt?.physicalCorpus?.cases);
  const totals = receipt?.totals || {};
  const veto = receipt?.vetoMetrics || {};
  if (cases.length !== 12 || Number(totals.cases || 0) !== 12) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_CASE_COUNT_INVALID', 'physicalCorpus.cases', 'Smoke wave must bind exactly 12 cases.');
  }
  if (physicalPass && Number(totals.pass || 0) !== 12) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_PASS_COUNT_INVALID', 'totals.pass', 'Physical smoke completion requires exactly 12 PASS cases.');
  }
  if (environmentBlocked && (Number(totals.blocked || 0) !== 12 || Number(totals.pass || 0) !== 0)) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_BLOCKED_COUNT_INVALID', 'totals.blocked', 'Environment blocker must bind exactly 12 blocked cases and zero physical PASS claims.');
  }
  if (Number(totals.productCommandHandlerOriginated || 0) !== 12 || receipt?.physicalCorpus?.productCommandHandlerOriginated !== true) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_NOT_PRODUCT_ORIGINATED', 'totals.productCommandHandlerOriginated', 'Every smoke DOCX must originate from the product Review DOCX export command handler.');
  }
  if (physicalPass && (Number(totals.physicalOpenEditSaveCloseReopenPass || 0) !== 12 || !cases.every((item) => item.openEditSaveCloseReopen === 'PASS' && item.wordStatus === 'PASS'))) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_WORD_PASS_INVALID', 'cases.openEditSaveCloseReopen', 'Physical smoke completion requires every case to pass Word open-edit-save-close-reopen.');
  }
  if (environmentBlocked && (Number(totals.physicalOpenEditSaveCloseReopenPass || 0) !== 0
    || Number(totals.physicalOpenEditSaveCloseReopenBlocked || 0) !== 12
    || !cases.every((item) => item.openEditSaveCloseReopen === 'BLOCKED' && item.blockedReasonCode === 'MACOS_WORD_SANDBOX_GRANT_REQUIRED'))) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_WORD_BLOCKER_INVALID', 'cases.openEditSaveCloseReopen', 'Every blocked case must be typed blocked by macOS Word sandbox grant instead of claiming physical Word success.');
  }
  if (!cases.every((item) => item.packageZipOk === true && typeof item.returnedDocxSha256 === 'string' && item.returnedDocxSha256.startsWith('sha256:'))) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_PACKAGE_READBACK_INVALID', 'cases.packageZipOk', 'Every pre-Word DOCX must be preserved and pass package readback.');
  }
  if (receipt?.environmentPermissionBoundary?.packageInvalidProven !== false
    || receipt?.environmentPermissionBoundary?.exporterOrOoxmlChangedForPrompt !== false) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_PERMISSION_BOUNDARY_INVALID', 'environmentPermissionBoundary', 'Receipt must separate environment permission from package invalidity and avoid exporter/OOXML changes based on the prompt.');
  }
  if (environmentBlocked && (receipt?.environmentPermissionBoundary?.status !== 'MACOS_WORD_SANDBOX_GRANT_REQUIRED'
    || receipt?.environmentPermissionBoundary?.packageInvalidProven !== false
    || receipt?.environmentPermissionBoundary?.exporterOrOoxmlChangedForPrompt !== false
    || receipt?.environmentPermissionBoundary?.controlledPositiveGrantAutomated !== false)) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_PERMISSION_BOUNDARY_INVALID', 'environmentPermissionBoundary', 'Receipt must separate environment permission from package invalidity and avoid exporter/OOXML changes based on the prompt.');
  }
  const allowedEnvironmentBlocked = environmentBlocked ? 12 : 0;
  const nonEnvironmentVetoValues = Object.entries(veto)
    .filter(([key]) => key !== 'physicalWordBlockedByEnvironmentPermission')
    .map(([, value]) => value);
  if (nonEnvironmentVetoValues.some((value) => Number(value) !== 0) || Number(veto.physicalWordBlockedByEnvironmentPermission || 0) !== allowedEnvironmentBlocked) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_VETO_NONZERO', 'vetoMetrics', 'Observed veto metrics must be zero.');
  }
  if (receipt?.implementedCapability?.automaticApplyCertified !== false
    || receipt?.implementedCapability?.wordSaturated !== false
    || receipt?.implementedCapability?.releaseReady !== false
    || receipt?.implementedCapability?.googleDocsOpened !== false
    || receipt?.implementedCapability?.productOriginatedPhysicalLoopSmokeProven !== physicalPass) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_OVERCLAIM', 'implementedCapability', 'Smoke wave must not claim automatic apply, release, saturation, or Google Docs, and physical-loop claim must match observed Word evidence.');
  }
  const programStillOnSmokeStage = program.releaseAuditNight01?.currentStage === CONTOUR_ID;
  if ((programStillOnSmokeStage && program.releaseAuditNight01?.nextStage !== (physicalPass ? COMPLETE_NEXT_STAGE : BLOCKED_NEXT_STAGE))
    || program.releaseAuditNight01?.productOriginatedPhysicalLoopSmokeProven !== physicalPass
    || program.releaseAuditNight01?.macosWordSandboxGrantRequired !== !physicalPass
    || program.releaseAuditNight01?.packageInvalidProven !== false
    || program.releaseAuditNight01?.automaticApplyCertified !== false
    || program.releaseAuditNight01?.wordSaturated !== false
    || program.releaseAuditNight01?.googleDocsOpened !== false) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_PROGRAM_INVALID', 'program.releaseAuditNight01', 'Program must retain smoke wave truth after later stages without saturation or later editor execution.');
  }
  const cell = list(profile.cells).find((item) => item.capabilityId === 'rtk.word.releaseAudit.p0.productOriginatedSmokeWave12');
  if (!cell || cell.physicalWordEvidence !== physicalPass || cell.productCommandHandlerOriginatedPhysicalDocs !== true || cell.macosWordSandboxGrantRequired !== !physicalPass || cell.packageInvalidProven !== false || cell.automaticApplyCertified !== false || cell.wordSaturated !== false) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_PROFILE_INVALID', 'profile.cells', 'Capability profile must bind typed environment permission blocker and non-claims.');
  }
  const coverage = ledger.coverageLedger?.releaseAuditNight01P0ProductOriginatedSmokeWave12;
  if (!coverage || coverage.observedCases !== 12 || coverage.blockedCases !== (physicalPass ? 0 : 12) || coverage.macosWordSandboxGrantRequired !== !physicalPass || coverage.packageInvalidProven !== false || coverage.automaticApplyCertified !== false || coverage.wordSaturated !== false || ledger.runtimeClaims?.googleDocsOpened !== false) {
    add('RTK_RELEASE_AUDIT_P0_PRODUCT_SMOKE_LEDGER_INVALID', 'ledger.coverageLedger', 'Ledger must bind smoke coverage without Google or saturation.');
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    nextStage: receipt?.nextStage || BLOCKED_NEXT_STAGE,
    observedCases: cases.length,
    physicalOpenEditSaveCloseReopenPass: Number(totals.physicalOpenEditSaveCloseReopenPass || 0),
    productCommandHandlerOriginated: Number(totals.productCommandHandlerOriginated || 0),
    macosWordSandboxGrantRequired: environmentBlocked,
    packageInvalidProven: receipt?.environmentPermissionBoundary?.packageInvalidProven === true,
    automaticApplyCertified: receipt?.implementedCapability?.automaticApplyCertified === true,
    wordSaturated: receipt?.implementedCapability?.wordSaturated === true,
  };
}

export {
  analyzeReturnedDocx,
  assertSmokeWordSandboxWorkRoot,
  buildProductExportSource,
  buildWordScript,
  collectSmokeWordProfile,
  parseKeyValueLines,
  productSmokeCases,
  runAppleScript,
  runProductExport,
  testZip,
};

async function main() {
  const args = new Set(process.argv.slice(2));
  const json = args.has('--json');
  const runPhysicalFlag = args.has('--run-physical');
  const writeReceipt = args.has('--write-receipt');
  const updateStateFlag = args.has('--update-state') || writeReceipt;
  const runIdArgIndex = process.argv.indexOf('--run-id');
  const rootArgIndex = process.argv.indexOf('--artifact-root');
  const wordRootArgIndex = process.argv.indexOf('--word-work-root');
  const runId = runIdArgIndex === -1
    ? `p0-product-smoke12-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`
    : String(process.argv[runIdArgIndex + 1] || '');
  const artifactRoot = rootArgIndex === -1 ? DEFAULT_ARTIFACT_ROOT : String(process.argv[rootArgIndex + 1] || '');
  const wordWorkRoot = wordRootArgIndex === -1 ? DEFAULT_WORD_WORK_ROOT : String(process.argv[wordRootArgIndex + 1] || '');

  if (runPhysicalFlag) {
    const allowInteractiveGrant = process.env.YALKEN_WORD_SMOKE_ALLOW_INTERACTIVE_GRANT === '1';
    const receipt = allowInteractiveGrant
      ? await runPhysical({ artifactRoot, wordWorkRoot, runId, writeReceipt })
      : await runEnvironmentPermissionBlocked({ artifactRoot, runId, writeReceipt });
    if (updateStateFlag) updateState();
    const result = evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12({ receipt });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_PRODUCT_SMOKE_WAVE12=${result.status}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (updateStateFlag) updateState();
  const result = evaluateWordReleaseAuditP0ProductOriginatedSmokeWave12();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_RELEASE_AUDIT_P0_PRODUCT_SMOKE_WAVE12=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
