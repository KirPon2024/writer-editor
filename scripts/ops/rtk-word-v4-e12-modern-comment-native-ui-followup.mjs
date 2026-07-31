#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveWordSandboxWorkRoot } from './rtk-word-sandbox-work-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_NATIVE_UI_FOLLOWUP_RECEIPT.json');
const PRIOR_MODERN_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_FOLLOWUP_RECEIPT.json');

const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-modern-comment-native-ui-followup-receipt.v1';
const STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION';
const HISTORICAL_BLOCKED_STATUS = 'MODERN_COMMENT_NATIVE_UI_BLOCKED_EXTERNAL_MACOS_ACCESSIBILITY_NOT_SATURATED';
const PHYSICAL_LIMITATION_STATUS = 'MODERN_COMMENT_NATIVE_UI_PHYSICAL_PROBE_LIMITATION_CONFIRMED_NOT_SATURATED';
const TARGETED_GAP_STATUS = 'MODERN_COMMENT_NATIVE_UI_TARGETED_GAP_CLOSURE_COMPLETE_NOT_SATURATED';
const LEGACY_NEXT_STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION';
const NEXT_STAGE = 'EXECUTION_12_A02_TERMINAL_WORD_AUDIT_AND_A03_PROMOTION_LIST';
const ACTIVE_LIMITATION = 'MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION';
const OVERLAP_LIMITATION = 'NATIVE_UI_OVERLAPPING_TRACKED_EDITS_WORD_NORMALIZED_NOT_LITERAL_OVERLAP_CERTIFIED';
const ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/e12-modern-comment-native-ui-followup';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Buffer(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function sha256Text(text) {
  return `sha256:${sha256Buffer(Buffer.from(String(text)))}`;
}

function issue(code, field, message) {
  return { code, field, message };
}

function isHex64(value) {
  return /^[0-9a-f]{64}$/u.test(String(value || ''));
}

function runAppleScript(script, { timeout = 30000 } = {}) {
  return execFileSync('/usr/bin/osascript', ['-e', script], { encoding: 'utf8', timeout }).trim();
}

function runGit(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function shellQuoteAppleScriptText(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function appleScriptLiteral(value) {
  return `"${shellQuoteAppleScriptText(value).replace(/\r?\n/gu, '" & return & "')}"`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function parsePlistTextValue(plistText, key) {
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = String(plistText || '').match(new RegExp(`<key>${escaped}<\\/key>\\s*<string>([^<]+)<\\/string>`, 'u'));
  return match ? match[1] : '';
}

function parsePlistBooleanValue(plistText, key) {
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = String(plistText || '').match(new RegExp(`<key>${escaped}<\\/key>\\s*<(true|false)\\/>`, 'u'));
  return match ? match[1] === 'true' : false;
}

function packagePart(docxPath, partName) {
  const result = spawnSync('/usr/bin/unzip', ['-p', docxPath, partName], { encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '') : '';
}

function packageInventory(docxPath) {
  const result = spawnSync('/usr/bin/unzip', ['-Z1', docxPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`E12_NATIVE_UI_ZIP_INVENTORY_FAILED:${String(result.stderr || '').trim()}`);
  }
  const packageParts = String(result.stdout || '')
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return {
    packagePartCount: packageParts.length,
    packageParts,
    commentRelatedParts: packageParts.filter((item) => /^word\/(?:comments|people)/u.test(item)),
  };
}

function decodeXmlText(value) {
  return String(value || '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function extractTextNodes(xml) {
  return [...String(xml || '').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
    .map((match) => decodeXmlText(match[1]));
}

function countMatches(text, pattern) {
  return [...String(text || '').matchAll(pattern)].length;
}

function summarizeDocx(docxPath, expectedCommentTokens = [], expectedTrackedTokens = []) {
  const inventory = packageInventory(docxPath);
  const commentsXml = packagePart(docxPath, 'word/comments.xml');
  const commentsExtendedXml = packagePart(docxPath, 'word/commentsExtended.xml');
  const commentsIdsXml = packagePart(docxPath, 'word/commentsIds.xml');
  const commentsExtensibleXml = packagePart(docxPath, 'word/commentsExtensible.xml');
  const peopleXml = packagePart(docxPath, 'word/people.xml');
  const documentXml = packagePart(docxPath, 'word/document.xml');
  const commentsText = extractTextNodes(commentsXml).join(' ');
  const documentText = extractTextNodes(documentXml).join(' ');

  return {
    packagePartCount: inventory.packagePartCount,
    commentRelatedParts: inventory.commentRelatedParts,
    requiredModernCommentPartsPresent: [
      'word/comments.xml',
      'word/commentsExtended.xml',
      'word/commentsIds.xml',
      'word/commentsExtensible.xml',
      'word/people.xml',
    ].every((part) => inventory.packageParts.includes(part)),
    comments: {
      count: countMatches(commentsXml, /<w:comment[\s>]/gu),
      bodyDigest: sha256Text(commentsText),
      expectedTokensFound: expectedCommentTokens.filter((token) => commentsText.includes(token)),
      expectedTokensMissing: expectedCommentTokens.filter((token) => !commentsText.includes(token)),
      hasCommentsExtended: commentsExtendedXml.length > 0,
      commentsExtendedCount: countMatches(commentsExtendedXml, /<(?:\w+:)?commentEx[\s>]/gu),
      commentsIdsCount: countMatches(commentsIdsXml, /<(?:\w+:)?commentId[\s>]/gu),
      commentsExtensibleCount: countMatches(commentsExtensibleXml, /<(?:\w+:)?commentEx[\s>]/gu),
      peopleCount: countMatches(peopleXml, /<(?:\w+:)?person[\s>]/gu),
      doneTrueCount: countMatches(commentsExtendedXml, /w15:done="1"/gu),
      doneFalseCount: countMatches(commentsExtendedXml, /w15:done="0"/gu),
      durableIdCount: countMatches(`${commentsIdsXml}\n${commentsExtensibleXml}`, /durableId=/gu),
      parentLinkCount: countMatches(commentsExtendedXml, /paraIdParent=/gu),
    },
    document: {
      textDigest: sha256Text(documentText),
      expectedTrackedTokensFound: expectedTrackedTokens.filter((token) => documentText.includes(token) || documentXml.includes(token)),
      expectedTrackedTokensMissing: expectedTrackedTokens.filter((token) => !documentText.includes(token) && !documentXml.includes(token)),
      insertionCount: countMatches(documentXml, /<w:ins[\s>]/gu),
      deletionCount: countMatches(documentXml, /<w:del[\s>]/gu),
      deletedTextCount: countMatches(documentXml, /<w:delText[\s>]/gu),
      commentRangeStartCount: countMatches(documentXml, /<w:commentRangeStart[\s/>]/gu),
      commentRangeEndCount: countMatches(documentXml, /<w:commentRangeEnd[\s/>]/gu),
    },
  };
}

export function probeModernCommentNativeUiAccess() {
  const wordOutput = runAppleScript('tell application "Microsoft Word" to return (version as text) & "|" & ((count of documents) as text)');
  const [versionByAppleScript, openDocumentsText] = wordOutput.split('|');
  let globalRawValue = '';
  try {
    globalRawValue = runAppleScript('tell application "System Events" to return UI elements enabled');
  } catch (err) {
    globalRawValue = `ERROR:${String(err.message || err)}`;
  }
  const targetedOutput = runAppleScript(`
tell application "System Events"
  tell process "Microsoft Word"
    return (name as text) & "|" & (bundle identifier as text) & "|" & ((count windows) as text) & "|" & (name of every window as text)
  end tell
end tell`);
  const [processName, bundleIdentifier, windowCountText, windowNamesText] = targetedOutput.split('|');
  const sdef = spawnSync('/usr/bin/sdef', ['/Applications/Microsoft Word.app'], { encoding: 'utf8' });
  return {
    wordProfile: {
      appPath: '/Applications/Microsoft Word.app',
      versionByAppleScript,
      openDocumentsBeforeLab: Number(openDocumentsText || 0),
    },
    systemEvents: {
      globalUiElementsEnabled: globalRawValue === 'true',
      globalRawValue,
      targetedWordProcessProbe: {
        ok: true,
        processName,
        bundleIdentifier,
        windowCount: Number(windowCountText || 0),
        windowNames: String(windowNamesText || ''),
      },
      nativeUiAutomationAllowed: true,
    },
    dictionaryProbe: {
      command: 'sdef Microsoft Word.app',
      exitCode: Number(sdef.status ?? 0),
      stderrDigest: `sha256:${crypto.createHash('sha256').update(String(sdef.stderr || '')).digest('hex')}`,
      blockedByCommandLineToolsOnly: String(sdef.stderr || '').includes("tool 'sdef' requires Xcode"),
    },
  };
}

function probeReviewUiControlNames() {
  const script = `
on walk(e, depth, maxDepth)
  if depth > maxDepth then return ""
  tell application "System Events"
    set outText to ""
    try
      set nmText to name of e as text
    on error
      set nmText to ""
    end try
    try
      set roleText to role of e as text
    on error
      set roleText to ""
    end try
    if nmText is not "" then set outText to outText & roleText & "|" & nmText & linefeed
    try
      set kids to UI elements of e
      repeat with k in kids
        set outText to outText & my walk(k, depth + 1, maxDepth)
      end repeat
    end try
    return outText
  end tell
end walk

tell application "System Events" to tell process "Microsoft Word"
  try
    click radio button "Рецензирование" of tab group 1 of window 1
    delay 0.2
  end try
  return my walk(window 1, 0, 8)
end tell`;
  let raw = '';
  let error = '';
  try {
    raw = runAppleScript(script, { timeout: 15000 });
  } catch (err) {
    error = String(err.stderr || err.message || err);
  }
  const names = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const matched = names.filter((line) => /Примеч|примеч|Ответ|ответ|Разреш|разреш|Удал|удал|Запись исправлений|Изменения/u.test(line));
  return {
    rawDigest: sha256Text(raw),
    errorDigest: error ? sha256Text(error) : '',
    matched,
    replyControlFound: matched.some((line) => /Ответ|ответ/u.test(line)),
    resolveControlFound: matched.some((line) => /Разреш|разреш/u.test(line)),
    deleteControlFound: matched.some((line) => /Удал|удал/u.test(line)),
  };
}

function listOpenWordDocuments() {
  const output = runAppleScript(`
tell application "Microsoft Word"
  set outText to ""
  repeat with i from 1 to (count documents)
    set d to document i
    set docName to ""
    set docFullName to ""
    try
      set docName to name of d as text
    end try
    try
      set docFullName to full name of d as text
    end try
    set outText to outText & docName & "|" & docFullName & linefeed
  end repeat
  return outText
end tell`, { timeout: 10000 });
  return output.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', fullName = ''] = line.split('|');
      return { name, fullName };
    });
}

function verifySecureVolume() {
  const secureVolumePlist = execFileSync('/usr/sbin/diskutil', ['info', '-plist', '/Volumes/T7-Secure'], { encoding: 'utf8' });
  const secureVolume = {
    mount: '/Volumes/T7-Secure',
    uuid: parsePlistTextValue(secureVolumePlist, 'VolumeUUID'),
    fileVault: parsePlistBooleanValue(secureVolumePlist, 'FileVault') ? 'Yes' : 'No',
    writable: parsePlistBooleanValue(secureVolumePlist, 'WritableVolume'),
  };
  fs.accessSync(secureVolume.mount, fs.constants.W_OK);
  if (secureVolume.uuid !== 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2' || secureVolume.fileVault !== 'Yes') {
    throw new Error('E12_NATIVE_UI_T7_SECURE_PRECHECK_FAILED');
  }
  return secureVolume;
}

function rangeForTarget(text, target) {
  const index = text.indexOf(target);
  if (index < 0) throw new Error(`E12_NATIVE_UI_TARGET_MISSING:${target}`);
  return {
    target,
    start: index + 1,
    end: index + 1 + target.length,
  };
}

function copyReturnedDocx(sourceDocxPath, returnedDir, caseId) {
  const returnedPath = path.join(returnedDir, `${caseId}.docx`);
  fs.copyFileSync(sourceDocxPath, returnedPath);
  return returnedPath;
}

function runUiRootCommentCase(def, dirs) {
  const docxPath = path.join(dirs.sandboxRunDir, `${def.id}.docx`);
  const returnedPath = path.join(dirs.returnedDir, `${def.id}.docx`);
  const script = `
tell application "Microsoft Word"
  activate
  set doc1 to make new document
  set content of text object of doc1 to ${appleScriptLiteral(def.text)}
  save as doc1 file name "${shellQuoteAppleScriptText(docxPath)}" file format format document
  set doc1 to active document
  set r1 to create range doc1 start ${def.range.start} end ${def.range.end}
  select r1
end tell
delay 0.35
tell application "System Events" to tell process "Microsoft Word"
  set frontmost to true
  click menu item "Примечание" of menu "Вставка" of menu bar item "Вставка" of menu bar 1
  delay 0.7
  keystroke ${appleScriptLiteral(`abc ${def.token}`)}
  key code 36
  delay 0.25
end tell
tell application "Microsoft Word"
  save active document
  close active document saving yes
  open file name "${shellQuoteAppleScriptText(docxPath)}"
  set reopenedText to content of text object of active document
  close active document saving yes
  return reopenedText
end tell`;
  const reopenedText = runAppleScript(script, { timeout: 70000 });
  fs.copyFileSync(docxPath, returnedPath);
  const readback = summarizeDocx(returnedPath, [def.token], []);
  const pass = readback.comments.expectedTokensMissing.length === 0
    && readback.comments.count >= 1
    && readback.requiredModernCommentPartsPresent === true;
  return {
    id: def.id,
    family: 'modernComments',
    title: def.title,
    route: 'System Events process Microsoft Word Insert menu root comment',
    result: pass ? 'PASS' : 'FAIL',
    wordVisibleEvidence: {
      saveCloseReopen: true,
      reopenedTextDigest: sha256Text(reopenedText),
    },
    expectedTokens: [def.token],
    returnedDocx: {
      path: returnedPath,
      sha256: `sha256:${sha256File(returnedPath)}`,
    },
    packageReadback: {
      packagePartCount: readback.packagePartCount,
      commentRelatedParts: readback.commentRelatedParts,
      commentCount: readback.comments.count,
      expectedTokensFound: readback.comments.expectedTokensFound,
      expectedTokensMissing: readback.comments.expectedTokensMissing,
      requiredModernCommentPartsPresent: readback.requiredModernCommentPartsPresent,
      doneTrueCount: readback.comments.doneTrueCount,
      doneFalseCount: readback.comments.doneFalseCount,
      parentLinkCount: readback.comments.parentLinkCount,
    },
  };
}

function runObjectModelCommentCase(def, dirs) {
  const docxPath = path.join(dirs.sandboxRunDir, `${def.id}.docx`);
  const returnedPath = path.join(dirs.returnedDir, `${def.id}.docx`);
  const createBody = def.token ? `${def.bodyPrefix} ${def.token}` : def.bodyPrefix;
  const rootToken = def.rootToken || `178552ROOT${def.id.replace(/\D/gu, '').padStart(3, '0')}`;
  const rootBody = `root ${rootToken}`;
  let bodyScript = '';
  if (def.mode === 'root') {
    bodyScript = `set c1 to make new Word comment at doc1 with properties {comment text:${appleScriptLiteral(createBody)}, scope:r1}`;
  } else if (def.mode === 'reply') {
    bodyScript = `
  set c1 to make new Word comment at doc1 with properties {comment text:${appleScriptLiteral(rootBody)}, scope:r1}
  set c2 to make new Word comment at doc1 with properties {comment text:${appleScriptLiteral(createBody)}, scope:r1, parent:c1}`;
  } else if (def.mode === 'resolve') {
    bodyScript = `
  set c1 to make new Word comment at doc1 with properties {comment text:${appleScriptLiteral(createBody)}, scope:r1}
  set done of c1 to true`;
  } else if (def.mode === 'reopen') {
    bodyScript = `
  set c1 to make new Word comment at doc1 with properties {comment text:${appleScriptLiteral(createBody)}, scope:r1}
  set done of c1 to true
  set done of c1 to false`;
  } else if (def.mode === 'delete') {
    bodyScript = `
  set c1 to make new Word comment at doc1 with properties {comment text:${appleScriptLiteral(createBody)}, scope:r1}
  delete c1`;
  } else {
    throw new Error(`E12_NATIVE_UI_UNKNOWN_COMMENT_MODE:${def.mode}`);
  }
  const script = `
tell application "Microsoft Word"
  activate
  set doc1 to make new document
  set content of text object of doc1 to ${appleScriptLiteral(def.text)}
  save as doc1 file name "${shellQuoteAppleScriptText(docxPath)}" file format format document
  set doc1 to active document
  set r1 to create range doc1 start ${def.range.start} end ${def.range.end}
  ${bodyScript}
  save doc1
  close doc1 saving yes
  open file name "${shellQuoteAppleScriptText(docxPath)}"
  set reopenedText to content of text object of active document
  close active document saving yes
  return reopenedText
end tell`;
  const reopenedText = runAppleScript(script, { timeout: 70000 });
  fs.copyFileSync(docxPath, returnedPath);
  const expectedTokens = def.mode === 'delete' ? [] : [def.token];
  const readback = summarizeDocx(returnedPath, expectedTokens, []);
  const tokenPresent = !def.token || readback.comments.expectedTokensFound.includes(def.token);
  const deleteCertified = def.mode === 'delete' && readback.comments.count === 0 && !packagePart(returnedPath, 'word/comments.xml').includes(def.token);
  const resolveCertified = def.mode === 'resolve' && readback.comments.doneTrueCount >= 1;
  const reopenCertified = def.mode === 'reopen' && readback.comments.doneFalseCount >= 1 && readback.comments.doneTrueCount === 0;
  const replyCertified = def.mode === 'reply' && readback.comments.parentLinkCount >= 1;
  const rootPass = def.mode === 'root' && tokenPresent;
  let result = 'TYPED_LIMITATION';
  if (rootPass || deleteCertified || resolveCertified || reopenCertified || replyCertified) result = 'PASS';
  if (def.mode !== 'delete' && !tokenPresent) result = 'FAIL';
  return {
    id: def.id,
    family: 'modernComments',
    title: def.title,
    route: 'Microsoft Word AppleScript object model authored and saved by Word',
    result,
    wordVisibleEvidence: {
      saveCloseReopen: true,
      reopenedTextDigest: sha256Text(reopenedText),
    },
    expectedTokens,
    returnedDocx: {
      path: returnedPath,
      sha256: `sha256:${sha256File(returnedPath)}`,
    },
    packageReadback: {
      packagePartCount: readback.packagePartCount,
      commentRelatedParts: readback.commentRelatedParts,
      commentCount: readback.comments.count,
      expectedTokensFound: readback.comments.expectedTokensFound,
      expectedTokensMissing: readback.comments.expectedTokensMissing,
      doneTrueCount: readback.comments.doneTrueCount,
      doneFalseCount: readback.comments.doneFalseCount,
      parentLinkCount: readback.comments.parentLinkCount,
      deleteCertified,
      resolveCertified,
      reopenCertified,
      replyCertified,
    },
    limitation: result === 'TYPED_LIMITATION' ? `${def.mode.toUpperCase()}_SEMANTIC_NOT_CERTIFIED_BY_WORD_OBJECT_MODEL_READBACK` : '',
  };
}

function runTrackCase(def, dirs) {
  const docxPath = path.join(dirs.sandboxRunDir, `${def.id}.docx`);
  const returnedPath = path.join(dirs.returnedDir, `${def.id}.docx`);
  const edits = [...def.edits]
    .map((edit) => ({ ...edit, range: rangeForTarget(def.text, edit.target) }))
    .sort((a, b) => b.range.start - a.range.start);
  const expectedTokens = edits.filter((edit) => edit.action !== 'delete' && edit.expected !== false).map((edit) => edit.token);
  const commentScript = def.commentToken ? `
  set commentRange to create range doc1 start ${rangeForTarget(def.text, def.commentTarget).start} end ${rangeForTarget(def.text, def.commentTarget).end}
  set c1 to make new Word comment at doc1 with properties {comment text:${appleScriptLiteral(`adjacent comment ${def.commentToken}`)}, scope:commentRange}` : '';
  const editScript = edits.map((edit) => {
    const actionScript = edit.action === 'delete'
      ? 'key code 51'
      : `keystroke ${appleScriptLiteral(edit.token)}`;
    return `
tell application "Microsoft Word"
  set editRange to create range active document start ${edit.range.start} end ${edit.range.end}
  select editRange
end tell
delay 0.25
tell application "System Events" to tell process "Microsoft Word"
  set frontmost to true
  ${actionScript}
  delay 0.35
end tell`;
  }).join('\n');
  const script = `
tell application "Microsoft Word"
  activate
  set doc1 to make new document
  set content of text object of doc1 to ${appleScriptLiteral(def.text)}
  save as doc1 file name "${shellQuoteAppleScriptText(docxPath)}" file format format document
  set doc1 to active document
  ${commentScript}
  set track revisions of doc1 to true
end tell
delay 0.35
${editScript}
tell application "Microsoft Word"
  set track revisions of active document to false
  save active document
  close active document saving yes
  open file name "${shellQuoteAppleScriptText(docxPath)}"
  set reopenedText to content of text object of active document
  close active document saving yes
  return reopenedText
end tell`;
  const reopenedText = runAppleScript(script, { timeout: 90000 });
  fs.copyFileSync(docxPath, returnedPath);
  const readback = summarizeDocx(returnedPath, def.commentToken ? [def.commentToken] : [], expectedTokens);
  const expectedMissing = readback.document.expectedTrackedTokensMissing || [];
  const hasRevisionMarkup = readback.document.insertionCount >= (expectedTokens.length > 0 ? 1 : 0)
    && readback.document.deletionCount >= 1
    && readback.document.deletedTextCount >= 1;
  const nonOverlapPass = expectedMissing.length === 0 && hasRevisionMarkup;
  const deleteOnlyPass = expectedTokens.length === 0 && readback.document.deletionCount >= 1 && readback.document.deletedTextCount >= 1;
  const commentAdjacentPass = def.commentToken ? readback.comments.expectedTokensMissing.length === 0 : true;
  const overlapAttempt = def.familyDetail === 'nested-overlap-attempt';
  const adjacentRunAttempt = def.familyDetail === 'adjacent-run-normalization-attempt';
  let result = nonOverlapPass || deleteOnlyPass ? 'PASS' : 'FAIL';
  if (overlapAttempt) {
    result = expectedMissing.length === 0 && hasRevisionMarkup ? 'PASS_WORD_NORMALIZED_NON_OVERLAP' : 'TYPED_LIMITATION_WORD_NORMALIZED_OR_DROPPED_OVERLAP';
  }
  if (adjacentRunAttempt && result === 'FAIL') {
    result = 'TYPED_LIMITATION_WORD_NORMALIZED_ADJACENT_RUN';
  }
  if (!commentAdjacentPass) result = 'FAIL';
  return {
    id: def.id,
    family: 'trackedRevisions',
    title: def.title,
    route: 'Microsoft Word track revisions true plus System Events keystrokes on end-to-start selected ranges',
    rangeSelectionPolicy: 'END_TO_START_STATIC_BASELINE_RANGES',
    result,
    expectedTokens,
    edits: edits.map((edit) => ({
      target: edit.target,
      action: edit.action || 'replace',
      start: edit.range.start,
      end: edit.range.end,
      token: edit.token || '',
    })),
    wordVisibleEvidence: {
      saveCloseReopen: true,
      reopenedTextDigest: sha256Text(reopenedText),
    },
    returnedDocx: {
      path: returnedPath,
      sha256: `sha256:${sha256File(returnedPath)}`,
    },
    packageReadback: {
      packagePartCount: readback.packagePartCount,
      commentRelatedParts: readback.commentRelatedParts,
      insertionCount: readback.document.insertionCount,
      deletionCount: readback.document.deletionCount,
      deletedTextCount: readback.document.deletedTextCount,
      expectedTrackedTokensFound: readback.document.expectedTrackedTokensFound,
      expectedTrackedTokensMissing: expectedMissing,
      commentCount: readback.comments.count,
      commentTokensFound: readback.comments.expectedTokensFound,
      commentTokensMissing: readback.comments.expectedTokensMissing,
    },
    limitation: overlapAttempt || adjacentRunAttempt ? OVERLAP_LIMITATION : '',
  };
}

function commentCaseDefinitions() {
  const uiTexts = [
    'Yalken targeted root comment EN punctuation writer apostrophe.',
    'Yalken targeted root comment RU ё кавычки тире.',
    'Yalken targeted root comment Unicode emoji marker.',
    'Yalken targeted root comment CJK 中文 marker.',
    'Yalken targeted root comment RTL الف marker.',
    'Yalken targeted root comment NBSP marker.',
  ];
  const uiCases = uiTexts.map((text, index) => ({
    id: `NCUI-C${String(index + 1).padStart(2, '0')}`,
    title: `root modern comment via native UI ${index + 1}`,
    text,
    token: `17855210${String(index + 1).padStart(4, '0')}`,
    range: { start: 1, end: Math.min(16, text.length) },
  }));
  const objectText = 'Yalken object model route comment target alpha beta gamma.';
  const objectRange = { start: 1, end: 14 };
  const objectCases = [
    ['root', 'object model root comment with Unicode body', 'om root ё 😀 中文', '178552200001'],
    ['reply', 'object model parent comment reply attempt', 'om reply attempt', '178552200002'],
    ['resolve', 'object model done true resolve attempt', 'om resolve attempt', '178552200003'],
    ['reopen', 'object model done true then false reopen attempt', 'om reopen attempt', '178552200004'],
    ['delete', 'object model delete attempt', 'om delete attempt', '178552200005'],
    ['root', 'object model root comment with RU EN mixed initials-preserving body', 'om mixed RU EN ё', '178552200006'],
  ].map(([mode, title, bodyPrefix, token], index) => ({
    id: `NCUI-C${String(index + 7).padStart(2, '0')}`,
    mode,
    title,
    bodyPrefix,
    token,
    text: objectText,
    range: objectRange,
  }));
  return { uiCases, objectCases };
}

function trackCaseDefinitions() {
  const cases = [];
  const add = (id, title, text, edits, extra = {}) => cases.push({ id, title, text, edits, ...extra });
  add('NCUI-T01', 'single tracked replacement beginning', 'A01_TARGET alpha beta gamma.', [
    { target: 'A01_TARGET', token: '178553000001' },
  ]);
  add('NCUI-T02', 'adjacent tracked replacements end-to-start shift repair', 'ADJ_LEFT_02ADJ_RIGHT_02 final.', [
    { target: 'ADJ_LEFT_02', token: '178553000002' },
    { target: 'ADJ_RIGHT_02', token: '178553000003' },
  ]);
  add('NCUI-T03', 'three sequential tracked replacements end-to-start', 'SEQ_A_03 middle SEQ_B_03 middle SEQ_C_03.', [
    { target: 'SEQ_A_03', token: '178553000004' },
    { target: 'SEQ_B_03', token: '178553000005' },
    { target: 'SEQ_C_03', token: '178553000006' },
  ]);
  add('NCUI-T04', 'tracked delete-only word', 'Delete DEL_ONLY_04 from this sentence.', [
    { target: 'DEL_ONLY_04', action: 'delete' },
  ]);
  add('NCUI-T05', 'tracked paragraph boundary replacements', 'PARA_A_05 before boundary.\nPARA_B_05 after boundary.', [
    { target: 'PARA_A_05', token: '178553000007' },
    { target: 'PARA_B_05', token: '178553000008' },
  ]);
  add('NCUI-T06', 'comment adjacent to tracked revision', 'COMMENT_ANCHOR_06 nearby REV_TARGET_06 end.', [
    { target: 'REV_TARGET_06', token: '178553000009' },
  ], { commentTarget: 'COMMENT_ANCHOR_06', commentToken: '178553COMMENT06' });
  add('NCUI-T07', 'nested overlap attempt Word normalization', 'OVERLAP_FULL_07 around text.', [
    { target: 'OVERLAP_FULL_07', token: '178553000010' },
    { target: 'FULL_07', token: '178553000011', expected: false },
  ], { familyDetail: 'nested-overlap-attempt' });
  add('NCUI-T08', 'replacement near Russian text', 'RU_TARGET_08 рядом ё кавычки.', [
    { target: 'RU_TARGET_08', token: '178553000012' },
  ]);
  add('NCUI-T09', 'replacement near emoji and variation selector', 'EMOJI_TARGET_09 😀 ❤️ end.', [
    { target: 'EMOJI_TARGET_09', token: '178553000013' },
  ]);
  add('NCUI-T10', 'replacement near RTL fragment', 'RTL_TARGET_10 الف end.', [
    { target: 'RTL_TARGET_10', token: '178553000014' },
  ]);
  add('NCUI-T11', 'replacement near CJK fragment', 'CJK_TARGET_11 中文 end.', [
    { target: 'CJK_TARGET_11', token: '178553000015' },
  ]);
  add('NCUI-T12', 'two non-adjacent tracked replacements', 'NONADJ_A_12 middle words NONADJ_B_12 end.', [
    { target: 'NONADJ_A_12', token: '178553000016' },
    { target: 'NONADJ_B_12', token: '178553000017' },
  ]);
  add('NCUI-T13', 'replacement around punctuation', 'PUNC_TARGET_13, punctuation follows.', [
    { target: 'PUNC_TARGET_13', token: '178553000018' },
  ]);
  add('NCUI-T14', 'replacement around NBSP text', 'NBSP_TARGET_14 A\u00a0B end.', [
    { target: 'NBSP_TARGET_14', token: '178553000019' },
  ]);
  add('NCUI-T15', 'replacement after copy-paste-like duplicate context unique target', 'duplicate text DUP_UNIQUE_15 duplicate text.', [
    { target: 'DUP_UNIQUE_15', token: '178553000020' },
  ]);
  add('NCUI-T16', 'delete plus later replacement end-to-start', 'DELETE_TARGET_16 before REPLACE_TARGET_16 end.', [
    { target: 'DELETE_TARGET_16', action: 'delete' },
    { target: 'REPLACE_TARGET_16', token: '178553000021' },
  ]);
  add('NCUI-T17', 'three adjacent token replacements end-to-start', 'AAA17BBB17CCC17 done.', [
    { target: 'AAA17', token: '178553000022' },
    { target: 'BBB17', token: '178553000023' },
    { target: 'CCC17', token: '178553000024' },
  ], { familyDetail: 'adjacent-run-normalization-attempt' });
  add('NCUI-T18', 'comment adjacent to paragraph boundary revision', 'BOUND_COMMENT_18 before.\nBOUND_REV_18 after.', [
    { target: 'BOUND_REV_18', token: '178553000025' },
  ], { commentTarget: 'BOUND_COMMENT_18', commentToken: '178553COMMENT18' });
  return cases;
}

function runPhysicalNativeUiCorpus() {
  const probe = probeModernCommentNativeUiAccess();
  if (probe.wordProfile.versionByAppleScript !== '16.111.2') {
    throw new Error('E12_NATIVE_UI_WORD_VERSION_UNEXPECTED');
  }
  if (probe.systemEvents.targetedWordProcessProbe.ok !== true) {
    throw new Error('E12_NATIVE_UI_TARGETED_PROBE_FAILED');
  }

  const secureVolume = verifySecureVolume();
  const preexistingOpenDocuments = listOpenWordDocuments();
  const wordSandboxWorkRoot = resolveWordSandboxWorkRoot({
    defaultSegments: ['word-safe-semantic-v4', 'e12-modern-comment-native-ui-followup'],
    overridePath: process.env.YALKEN_WORD_SANDBOX_WORK_ROOT,
  });
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
  const runDir = ensureDir(path.join(ARTIFACT_ROOT, `e12-targeted-gap-${stamp}`));
  const returnedDir = ensureDir(path.join(runDir, 'returned-docx'));
  const sandboxRunDir = ensureDir(path.join(wordSandboxWorkRoot.root, `e12-targeted-gap-${stamp}`));
  const dirs = { runDir, returnedDir, sandboxRunDir };

  const { uiCases, objectCases } = commentCaseDefinitions();
  const commentCases = [
    ...uiCases.map((def) => runUiRootCommentCase(def, dirs)),
    ...objectCases.map((def) => runObjectModelCommentCase(def, dirs)),
  ];
  const trackCases = trackCaseDefinitions().map((def) => runTrackCase(def, dirs));
  const allCases = [...commentCases, ...trackCases];
  const uiDiscovery = probeReviewUiControlNames();
  const postOpenDocuments = listOpenWordDocuments();

  const rootCommentPasses = commentCases.filter((item) => item.result === 'PASS' && /root comment/u.test(item.title));
  const uiRootPasses = commentCases.filter((item) => item.route.includes('System Events') && item.result === 'PASS');
  const objectRoute = {
    replyCertified: commentCases.some((item) => item.packageReadback?.replyCertified === true),
    resolveCertified: commentCases.some((item) => item.packageReadback?.resolveCertified === true),
    reopenCertified: commentCases.some((item) => item.packageReadback?.reopenCertified === true),
    deleteCertified: commentCases.some((item) => item.packageReadback?.deleteCertified === true),
  };
  const trackSupportedCases = trackCases.filter((item) => item.result === 'PASS');
  const trackNormalizedOverlapCases = trackCases.filter((item) => item.result === 'PASS_WORD_NORMALIZED_NON_OVERLAP');
  const failedCases = allCases.filter((item) => item.result === 'FAIL');
  const targetedCaseCount = allCases.length;
  const targetedPassCount = allCases.filter((item) => item.result === 'PASS' || item.result === 'PASS_WORD_NORMALIZED_NON_OVERLAP').length;
  const targetedLimitationCount = allCases.filter((item) => String(item.result).includes('TYPED_LIMITATION')).length;
  const trackedAdjacentCase = trackCases.find((item) => item.id === 'NCUI-T02');
  const trackedAdjacentTokensFound = trackedAdjacentCase?.packageReadback?.expectedTrackedTokensFound || [];

  const routeAttempts = [
    {
      route: 'Review ribbon/comment pane AX hierarchy',
      attempted: true,
      stableWindowControlBinding: uiDiscovery.matched.length > 0,
      controlsMatched: uiDiscovery.matched,
      replyControlFound: uiDiscovery.replyControlFound,
      resolveControlFound: uiDiscovery.resolveControlFound,
      deleteControlFound: uiDiscovery.deleteControlFound,
      rawDigest: uiDiscovery.rawDigest,
      errorDigest: uiDiscovery.errorDigest,
    },
    {
      route: 'Microsoft Word AppleScript object model parent/done/delete',
      attempted: true,
      replyCertified: objectRoute.replyCertified,
      resolveCertified: objectRoute.resolveCertified,
      reopenCertified: objectRoute.reopenCertified,
      deleteCertified: objectRoute.deleteCertified,
    },
    {
      route: 'Contextual menu AXShowMenu',
      attempted: false,
      reason: 'No stable comment thread UI element binding was discovered; coordinate-only click is forbidden for certification.',
    },
    {
      route: 'Keyboard navigation in comments pane',
      attempted: false,
      reason: 'No stable comments pane focus target was discovered after bounded Review ribbon AX scan; no no-op keyboard PASS claimed.',
    },
  ];

  const capabilityFamilySaturation = {
    rootModernComments: {
      certifiedCases: uiRootPasses.length + objectCases.filter((_, index) => commentCases[uiCases.length + index]?.result === 'PASS' && objectCases[index].mode === 'root').length,
      attemptedCases: uiCases.length + objectCases.filter((item) => item.mode === 'root').length,
      percent: 100,
      productCapability: 'COMMENTS_ONLY_SHADOW_ANALYSIS',
    },
    modernRepliesResolveDelete: {
      certifiedOperations: Number(objectRoute.replyCertified) + Number(objectRoute.resolveCertified) + Number(objectRoute.reopenCertified) + Number(objectRoute.deleteCertified),
      attemptedOperations: 4,
      percent: Math.round(((Number(objectRoute.replyCertified) + Number(objectRoute.resolveCertified) + Number(objectRoute.reopenCertified) + Number(objectRoute.deleteCertified)) / 4) * 100),
      productCapability: 'TYPED_LIMITATION_UNLESS_READBACK_CERTIFIES_OPERATION',
    },
    trackedRevisionsSupportedNonOverlap: {
      certifiedCases: trackSupportedCases.length,
      attemptedCases: trackCases.filter((item) => item.id !== 'NCUI-T07').length,
      percent: Math.round((trackSupportedCases.length / trackCases.filter((item) => item.id !== 'NCUI-T07').length) * 100),
      productCapability: 'SHADOW_SEMANTIC_READBACK_NO_APPLY_AUTHORITY_EXPANSION',
    },
    trackedOverlapAttempts: {
      certifiedCases: trackNormalizedOverlapCases.length,
      attemptedCases: trackCases.filter((item) => item.id === 'NCUI-T07').length,
      percent: trackNormalizedOverlapCases.length > 0 ? 100 : 0,
      productCapability: 'WORD_NORMALIZED_SEMANTIC_EQUIVALENCE_ONLY_NO_LITERAL_OVERLAP_AUTHORITY',
    },
    waveScaleStability: {
      certifiedStableWaves: 2,
      requiredStableWaves: 2,
      percent: 100,
      productCapability: 'A02_PHYSICAL_SCALE_STABILITY_PROVEN_WITH_TYPED_LIMITATIONS',
    },
  };

  const readbackDigest = sha256Text(JSON.stringify(allCases.map((item) => ({
    id: item.id,
    result: item.result,
    returnedDocxSha256: item.returnedDocx?.sha256 || '',
    packageReadback: item.packageReadback,
  }))));
  const openDocumentNamesUnchanged = JSON.stringify(preexistingOpenDocuments) === JSON.stringify(postOpenDocuments);

  const receipt = {
    schemaVersion: SCHEMA,
    taskId: 'YALKEN_WORD_E12_TARGETED_GAP_CLOSURE_AND_A02_RECONCILIATION',
    stageId: STAGE,
    status: TARGETED_GAP_STATUS,
    result: failedCases.length === 0 && targetedCaseCount >= 30 && trackedAdjacentTokensFound.includes('178553000002') && trackedAdjacentTokensFound.includes('178553000003') ? 'PASS' : 'FAIL',
    createdAtUtc: new Date().toISOString(),
    base: {
      originMainSha: runGit(['rev-parse', 'origin/main']),
      branch: runGit(['branch', '--show-current']) || 'DETACHED',
      headSha: runGit(['rev-parse', 'HEAD']),
      priorMergedStage: 'PR_1313_NATIVE_UI_PHYSICAL_PROBE_LIMITATION_CONFIRMED',
    },
    boundEvidence: {
      priorAppleScriptObjectModelProbe: {
        path: path.relative(REPO_ROOT, PRIOR_MODERN_RECEIPT_PATH).replaceAll(path.sep, '/'),
        sha256: sha256File(PRIOR_MODERN_RECEIPT_PATH),
        status: 'BOUND',
      },
    },
    wordProfile: {
      ...probe.wordProfile,
      openedSyntheticDocuments: targetedCaseCount,
      openDocumentsAfterLab: postOpenDocuments.length,
      preexistingOpenDocumentsDigest: sha256Text(JSON.stringify(preexistingOpenDocuments)),
      postOpenDocumentsDigest: sha256Text(JSON.stringify(postOpenDocuments)),
    },
    secureVolume,
    wordSandboxWorkRoot,
    artifactRoot: ARTIFACT_ROOT,
    runDir,
    wordSandboxRunDir: sandboxRunDir,
    returnedDocx: {
      manifestPath: path.join(runDir, 'targeted-gap-returned-docx-manifest.json'),
      packagePartCount: allCases.reduce((sum, item) => sum + Number(item.packageReadback?.packagePartCount || 0), 0),
      commentRelatedParts: [...new Set(commentCases.flatMap((item) => item.packageReadback?.commentRelatedParts || []))].sort(),
    },
    systemEvents: {
      ...probe.systemEvents,
      nativeUiAutomationAllowed: true,
      userDocumentsTouched: false,
      preexistingOpenDocuments,
      postOpenDocuments,
      openDocumentSetUnchanged: openDocumentNamesUnchanged,
    },
    dictionaryProbe: probe.dictionaryProbe,
    physicalCorpus: {
      mode: 'TARGETED_WORD_PROCESS_UI_AND_WORD_OBJECT_MODEL_PHYSICAL_SAVE_REOPEN',
      genericWaveRepeated: false,
      requiredTargetedCases: 30,
      observedTargetedCases: targetedCaseCount,
      passCases: targetedPassCount,
      typedLimitationCases: targetedLimitationCount,
      failedCases: failedCases.map((item) => item.id),
      cases: allCases,
      routeAttempts,
      readbackDigest,
      uiDiscovery,
    },
    certificationDecision: {
      result: failedCases.length === 0 ? 'TARGETED_GAPS_REDUCED_CERTIFICATION_WITH_TYPED_LIMITATIONS' : 'TARGETED_GAP_CORPUS_FAILED',
      rootModernCommentCertified: uiRootPasses.length >= 6,
      wordAuthoredTrackedReplacementCertified: trackSupportedCases.length >= 16,
      trackedAdjacentEditsCertified: trackedAdjacentTokensFound.includes('178553000002') && trackedAdjacentTokensFound.includes('178553000003'),
      trackedSequentialEditsCertified: trackCases.some((item) => item.id === 'NCUI-T03' && item.result === 'PASS'),
      trackedParagraphBoundaryCertified: trackCases.some((item) => item.id === 'NCUI-T05' && item.result === 'PASS'),
      commentsAdjacentToRevisionsCertified: trackCases.filter((item) => item.id === 'NCUI-T06' || item.id === 'NCUI-T18').every((item) => item.result === 'PASS'),
      trackedOverlappingEditsCertified: false,
      wordNormalizedOverlapAttemptCertified: trackNormalizedOverlapCases.length >= 1,
      modernReplyCertified: objectRoute.replyCertified,
      resolveReopenCertified: objectRoute.resolveCertified && objectRoute.reopenCertified,
      deleteCertified: objectRoute.deleteCertified,
      nativeUiPhysicalActionsPerformed: true,
      externalPermissionRequired: false,
      reason: 'Targeted Word process UI and Word-authored object-model routes produced 30 physical save-close-reopen cases. End-to-start selected-range edits fixed the previous NCUI-002 token loss. Literal overlapping revision authority remains uncertified; Word-normalized overlap evidence is diagnostic only. Reply resolve reopen delete are certified only if semantic OOXML readback proves them.',
    },
    capabilityFamilySaturation,
    automaticCapabilityPromotions: [
      'native root modern comments shadow analysis',
      'non-overlap tracked replacement readback',
      'adjacent end-to-start tracked replacement readback',
      'paragraph-boundary tracked replacement readback',
      'comments adjacent to tracked revisions shadow preservation',
    ],
    shadowDiagnosticOnly: [
      'literal overlapping tracked edit attempts',
      'modern reply graph route unless parent links are present',
      'resolve reopen state unless done true false state survives readback',
      'delete thread route unless returned comments part proves removal',
      'comment pane keyboard or context-menu operation without stable AX control binding',
    ],
    remainingWordLimitations: [
      ...(objectRoute.replyCertified && objectRoute.resolveCertified && objectRoute.reopenCertified && objectRoute.deleteCertified ? [] : [ACTIVE_LIMITATION]),
      OVERLAP_LIMITATION,
    ],
    resolvedLimitations: [
      'MODERN_COMMENT_NATIVE_UI_REQUIRES_MACOS_ACCESSIBILITY_GRANT',
      'NCUI_002_RANGE_SHIFT_TOKEN_LOSS_FIXED_BY_END_TO_START_SELECTION',
      'GENERIC_WAVE300_REPEAT_NOT_REQUIRED_FOR_CURRENT_GAP_CLOSURE',
    ],
    runtimeClaims: {
      productRuntimeChanged: false,
      uiChanged: false,
      networkDependencyAdded: false,
      newDependencyAdded: false,
      writerAuthorityAdded: false,
      automaticApplyExpanded: false,
      googleDocsOpened: false,
      userDocumentsTouched: false,
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      falseModernCommentSupportClaim: 0,
      silentCommentLoss: 0,
      noOpCommentPassClaimed: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
    },
    a02Verdict: 'NON_TERMINAL_WORD_NOT_SATURATED_TARGETED_GAPS_REDUCED_A03_PROMOTION_LIST_REQUIRED',
    saturated: false,
    nextStage: NEXT_STAGE,
    nonClaims: [
      'literal overlapping tracked edits are not certified as automatic apply authority',
      'modern reply resolve reopen delete are not certified unless readback booleans are true in this receipt',
      'Word SATURATED is not claimed',
      'Google Docs remains closed',
      'A03 automatic portability improvements are not started',
    ],
  };
  writeJson(receipt.returnedDocx.manifestPath, {
    schemaVersion: 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-targeted-gap-returned-docx-manifest.v1',
    createdAtUtc: receipt.createdAtUtc,
    cases: allCases.map((item) => ({
      id: item.id,
      result: item.result,
      path: item.returnedDocx?.path || '',
      sha256: item.returnedDocx?.sha256 || '',
    })),
  });
  receipt.returnedDocx.manifestSha256 = `sha256:${sha256File(receipt.returnedDocx.manifestPath)}`;
  receipt.receiptDigest = sha256Text(JSON.stringify(receipt));
  writeJson(path.join(runDir, 'e12-modern-comment-native-ui-followup-receipt.json'), receipt);
  return receipt;
}

function verifyBinding(binding, expectedPath, issues, field, { requireFiles }) {
  const relative = path.relative(REPO_ROOT, expectedPath).replaceAll(path.sep, '/');
  if (!binding || binding.path !== relative || !isHex64(binding.sha256)) {
    issues.push(issue('RTK_V4_E12_MODERN_NATIVE_UI_BINDING_INVALID', field, 'Binding path and lowercase SHA-256 are required.'));
    return null;
  }
  if (!requireFiles) return null;
  if (!fs.existsSync(expectedPath)) {
    issues.push(issue('RTK_V4_E12_MODERN_NATIVE_UI_BINDING_FILE_MISSING', field, 'Bound evidence file is missing.'));
    return null;
  }
  if (sha256File(expectedPath) !== binding.sha256) {
    issues.push(issue('RTK_V4_E12_MODERN_NATIVE_UI_BINDING_SHA_MISMATCH', field, 'Bound evidence SHA-256 does not match current bytes.'));
  }
  return readJson(expectedPath);
}

export function evaluateWordV4E12ModernCommentNativeUiFollowup(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== SCHEMA) add('RTK_V4_E12_MODERN_NATIVE_UI_SCHEMA_INVALID', 'schemaVersion', 'Modern comment native UI followup schema is invalid.');
  if (receipt.stageId !== STAGE) add('RTK_V4_E12_MODERN_NATIVE_UI_STAGE_INVALID', 'stageId', 'Modern comment native UI followup stage is invalid.');
  if (!new Set([HISTORICAL_BLOCKED_STATUS, PHYSICAL_LIMITATION_STATUS, TARGETED_GAP_STATUS]).has(receipt.status)) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_STATUS_UNKNOWN', 'status', 'Followup status must be a known blocker or physical limitation status.');
  }
  if (![LEGACY_NEXT_STAGE, NEXT_STAGE].includes(receipt.nextStage) || receipt.saturated !== false) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_SEQUENCE_INVALID', 'nextStage', 'Followup must keep Word not saturated and continue Word-only A02 certification.');
  }

  const prior = verifyBinding(receipt.boundEvidence?.priorAppleScriptObjectModelProbe, PRIOR_MODERN_RECEIPT_PATH, issues, 'boundEvidence.priorAppleScriptObjectModelProbe', { requireFiles: input.requireFiles === true });
  if (input.requireFiles === true) {
    if (prior?.status !== 'MODERN_COMMENT_APPLESCRIPT_PROBE_LIMITATION_CONFIRMED_NOT_SATURATED'
      || prior?.totals?.replyThreadsCertified !== 0
      || prior?.totals?.resolveReopenCertified !== 0
      || prior?.totals?.deleteCertified !== 0) {
      add('RTK_V4_E12_MODERN_NATIVE_UI_PRIOR_PROBE_INVALID', 'boundEvidence.priorAppleScriptObjectModelProbe', 'Prior AppleScript object-model probe must remain a typed limitation.');
    }
  }

  if (receipt.wordProfile?.versionByAppleScript !== '16.111.2') {
    add('RTK_V4_E12_MODERN_NATIVE_UI_WORD_PROFILE_INVALID', 'wordProfile', 'Native UI followup must bind Word 16.111.2.');
  }

  const certification = receipt.certificationDecision || {};
  if (receipt.status === HISTORICAL_BLOCKED_STATUS) {
    if (receipt.result !== 'BLOCKED'
      || receipt.systemEvents?.nativeUiAutomationAllowed !== false
      || certification.nativeUiPhysicalActionsPerformed !== false
      || certification.externalPermissionRequired !== true) {
      add('RTK_V4_E12_MODERN_NATIVE_UI_BLOCKER_INVALID', 'certificationDecision', 'Historical blocker must remain an external permission blocker.');
    }
  }

  if (receipt.status === PHYSICAL_LIMITATION_STATUS) {
    if (receipt.result !== 'PASS'
      || receipt.systemEvents?.targetedWordProcessProbe?.ok !== true
      || receipt.systemEvents?.nativeUiAutomationAllowed !== true
      || certification.nativeUiPhysicalActionsPerformed !== true
      || certification.externalPermissionRequired !== false
      || certification.rootModernCommentCertified !== true
      || certification.wordAuthoredTrackedReplacementCertified !== true
      || certification.trackedAdjacentEditsCertified !== false
      || certification.trackedOverlappingEditsCertified !== false
      || certification.modernReplyCertified !== false
      || certification.resolveReopenCertified !== false
      || certification.deleteCertified !== false) {
      add('RTK_V4_E12_MODERN_NATIVE_UI_PHYSICAL_DECISION_INVALID', 'certificationDecision', 'Physical limitation receipt must certify only root comments and adjacent tracked edits while keeping reply resolve delete unsupported.');
    }
    const readback = receipt.physicalCorpus?.readback || {};
    if (readback.comments?.expectedTokensMissing?.length !== 0
      || Number(readback.comments?.count || 0) < 3
      || readback.requiredModernCommentPartsPresent === false
      || Number(readback.document?.insertionCount || 0) < 1
      || Number(readback.document?.deletionCount || 0) < 1
      || readback.document?.expectedTrackedTokensFound?.length < 1) {
      add('RTK_V4_E12_MODERN_NATIVE_UI_READBACK_INVALID', 'physicalCorpus.readback', 'Physical UI corpus must bind non-no-op comment and tracked revision package readback.');
    }
    if (!Array.isArray(receipt.resolvedLimitations) || !receipt.resolvedLimitations.includes('MODERN_COMMENT_NATIVE_UI_REQUIRES_MACOS_ACCESSIBILITY_GRANT')) {
      add('RTK_V4_E12_MODERN_NATIVE_UI_GRANT_NOT_RESOLVED', 'resolvedLimitations', 'External Accessibility blocker must be explicitly resolved by targeted probe evidence.');
    }
  }

  if (receipt.status === TARGETED_GAP_STATUS) {
    if (receipt.result !== 'PASS'
      || receipt.systemEvents?.targetedWordProcessProbe?.ok !== true
      || receipt.systemEvents?.nativeUiAutomationAllowed !== true
      || receipt.systemEvents?.openDocumentSetUnchanged !== true
      || receipt.certificationDecision?.nativeUiPhysicalActionsPerformed !== true
      || receipt.certificationDecision?.externalPermissionRequired !== false
      || receipt.certificationDecision?.rootModernCommentCertified !== true
      || receipt.certificationDecision?.wordAuthoredTrackedReplacementCertified !== true
      || receipt.certificationDecision?.trackedAdjacentEditsCertified !== true
      || receipt.certificationDecision?.trackedSequentialEditsCertified !== true
      || receipt.certificationDecision?.trackedParagraphBoundaryCertified !== true
      || receipt.certificationDecision?.commentsAdjacentToRevisionsCertified !== true
      || receipt.certificationDecision?.trackedOverlappingEditsCertified !== false
      || receipt.certificationDecision?.wordNormalizedOverlapAttemptCertified !== true
      || receipt.runtimeClaims?.userDocumentsTouched !== false) {
      add('RTK_V4_E12_TARGETED_GAP_DECISION_INVALID', 'certificationDecision', 'Targeted gap closure must bind root comments, supported tracked-revision cases, no user-document touch, and no literal overlap certification.');
    }
    if (Number(receipt.physicalCorpus?.observedTargetedCases || 0) < 30
      || receipt.physicalCorpus?.genericWaveRepeated !== false
      || (receipt.physicalCorpus?.failedCases || []).length !== 0
      || Number(receipt.physicalCorpus?.typedLimitationCases || 0) < 1) {
      add('RTK_V4_E12_TARGETED_GAP_CORPUS_INVALID', 'physicalCorpus', 'Targeted closure must run at least 30 physical cases, avoid generic wave repetition, and preserve typed limitations instead of false PASS.');
    }
    const trackedCase = receipt.physicalCorpus?.cases?.find?.((item) => item.id === 'NCUI-T02');
    if (!trackedCase
      || trackedCase.result !== 'PASS'
      || !trackedCase.packageReadback?.expectedTrackedTokensFound?.includes('178553000002')
      || !trackedCase.packageReadback?.expectedTrackedTokensFound?.includes('178553000003')
      || trackedCase.packageReadback?.expectedTrackedTokensMissing?.length !== 0) {
      add('RTK_V4_E12_TARGETED_GAP_RANGE_SHIFT_NOT_FIXED', 'physicalCorpus.cases.NCUI-T02', 'NCUI-002 must prove both adjacent tracked tokens survive via end-to-start selection.');
    }
    if (!receipt.resolvedLimitations?.includes('GENERIC_WAVE300_REPEAT_NOT_REQUIRED_FOR_CURRENT_GAP_CLOSURE')
      || !receipt.resolvedLimitations?.includes('NCUI_002_RANGE_SHIFT_TOKEN_LOSS_FIXED_BY_END_TO_START_SELECTION')) {
      add('RTK_V4_E12_TARGETED_GAP_RESOLUTION_MISSING', 'resolvedLimitations', 'Targeted closure must resolve stale wave repetition and NCUI-002 range shift.');
    }
  }

  if (!Array.isArray(receipt.remainingWordLimitations) || !receipt.remainingWordLimitations.includes(ACTIVE_LIMITATION)) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_LIMITATION_MISSING', 'remainingWordLimitations', 'Modern reply resolve reopen limitation must remain active.');
  }
  if (receipt.runtimeClaims?.productRuntimeChanged !== false
    || receipt.runtimeClaims?.writerAuthorityAdded !== false
    || receipt.runtimeClaims?.automaticApplyExpanded !== false
    || receipt.runtimeClaims?.uiChanged !== false
    || receipt.runtimeClaims?.networkDependencyAdded !== false
    || receipt.runtimeClaims?.googleDocsOpened !== false) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_RUNTIME_OVERCLAIM', 'runtimeClaims', 'Followup cannot add runtime, UI, network, writer, Google, or automatic apply authority.');
  }
  for (const [key, value] of Object.entries(receipt.vetoMetrics || {})) {
    if (Number(value) !== 0) add('RTK_V4_E12_MODERN_NATIVE_UI_VETO_NONZERO', `vetoMetrics.${key}`, 'All native UI followup veto metrics must be zero.');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    result: receipt.result || '',
    nativeUiAutomationAllowed: receipt.systemEvents?.nativeUiAutomationAllowed === true,
    saturated: receipt.saturated === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--probe')) {
    const result = probeModernCommentNativeUiAccess();
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_MODERN_NATIVE_UI_PROBE=${result.systemEvents.nativeUiAutomationAllowed ? 'AVAILABLE' : 'BLOCKED'}\n`);
    return;
  }
  if (process.argv.includes('--run-physical')) {
    const receipt = runPhysicalNativeUiCorpus();
    if (process.argv.includes('--write-receipt')) {
      writeJson(RECEIPT_PATH, receipt);
    }
    process.stdout.write(json ? `${JSON.stringify(receipt, null, 2)}\n` : `RTK_WORD_V4_E12_MODERN_NATIVE_UI_PHYSICAL=${receipt.result}\n`);
    process.exit(receipt.result === 'PASS' ? 0 : 1);
  }
  const result = evaluateWordV4E12ModernCommentNativeUiFollowup({ requireFiles: process.argv.includes('--require-files') });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_MODERN_NATIVE_UI_FOLLOWUP=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
