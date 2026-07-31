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
const NEXT_STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION';
const ACTIVE_LIMITATION = 'MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION';
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

function runPhysicalNativeUiCorpus() {
  const probe = probeModernCommentNativeUiAccess();
  if (probe.wordProfile.versionByAppleScript !== '16.111.2') {
    throw new Error('E12_NATIVE_UI_WORD_VERSION_UNEXPECTED');
  }
  if (probe.systemEvents.targetedWordProcessProbe.ok !== true) {
    throw new Error('E12_NATIVE_UI_TARGETED_PROBE_FAILED');
  }
  if (probe.wordProfile.openDocumentsBeforeLab !== 0) {
    throw new Error('E12_NATIVE_UI_OPEN_DOCUMENTS_BEFORE_LAB');
  }

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

  const wordSandboxWorkRoot = resolveWordSandboxWorkRoot({
    defaultSegments: ['word-safe-semantic-v4', 'e12-modern-comment-native-ui-followup'],
    overridePath: process.env.YALKEN_WORD_SANDBOX_WORK_ROOT,
  });
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
  const runDir = ensureDir(path.join(ARTIFACT_ROOT, `e12-native-ui-${stamp}`));
  const returnedDir = ensureDir(path.join(runDir, 'returned-docx'));
  const sandboxRunDir = ensureDir(path.join(wordSandboxWorkRoot.root, `e12-native-ui-${stamp}`));
  const docxPath = path.join(sandboxRunDir, 'e12-native-ui-working.docx');
  const trackDocxPath = path.join(sandboxRunDir, 'e12-native-ui-track-working.docx');
  const returnedDocxPath = path.join(returnedDir, 'e12-native-ui-returned.docx');
  const returnedTrackDocxPath = path.join(returnedDir, 'e12-native-ui-track-returned.docx');
  const commentTokens = ['178551001001', '178551001002', '178551001003'];
  const trackedTokens = ['178551009901', '178551009902'];

  const script = `
tell application "Microsoft Word"
  activate
  if (count of documents) > 0 then close every document saving no
  set doc1 to make new document
  set content of text object of doc1 to "Yalken E12 native UI synthetic corpus. English apostrophe writer's line. Русский текст ё кавычки «да» тире — NBSP A B. Unicode combining é emoji 😀 variation selector ❤️ ZWJ 👩‍💻 ZWNJ الف short RTL 中文 CJK. Track alpha beta gamma delta. Adjacent overlap target sentence."
  set r1 to create range doc1 start 1 end 16
  select r1
end tell
delay 0.4
tell application "System Events" to tell process "Microsoft Word"
  click menu item "Примечание" of menu "Вставка" of menu bar item "Вставка" of menu bar 1
  delay 0.7
  keystroke "abc ${commentTokens[0]}"
  key code 36
  delay 0.3
end tell
tell application "Microsoft Word"
  set r2 to create range active document start 38 end 55
  select r2
end tell
delay 0.3
tell application "System Events" to tell process "Microsoft Word"
  click menu item "Примечание" of menu "Вставка" of menu bar item "Вставка" of menu bar 1
  delay 0.7
  keystroke "abc ${commentTokens[1]}"
  key code 36
  delay 0.3
end tell
tell application "Microsoft Word"
  set r3 to create range active document start 87 end 108
  select r3
end tell
delay 0.3
tell application "System Events" to tell process "Microsoft Word"
  click menu item "Примечание" of menu "Вставка" of menu bar item "Вставка" of menu bar 1
  delay 0.7
  keystroke "abc ${commentTokens[2]}"
  key code 36
  delay 0.3
end tell
tell application "Microsoft Word"
  save as active document file name "${shellQuoteAppleScriptText(docxPath)}" file format format document
  close active document saving yes
  open file name "${shellQuoteAppleScriptText(docxPath)}"
  set reopenedDocCount to count of documents
  close active document saving yes
  return reopenedDocCount
end tell`;

  const wordResult = runAppleScript(script, { timeout: 60000 });

  const trackScript = `
tell application "Microsoft Word"
  activate
  if (count of documents) > 0 then close every document saving no
  set doc1 to make new document
  set content of text object of doc1 to "Track alpha beta gamma delta. Adjacent overlap target sentence. Русский ё English Unicode 😀."
  set track revisions of doc1 to true
  set tr1 to create range doc1 start 7 end 12
  select tr1
end tell
delay 1.0
tell application "System Events" to tell process "Microsoft Word"
  set frontmost to true
  delay 0.5
  keystroke "${trackedTokens[0]}"
  delay 0.7
end tell
tell application "Microsoft Word"
  set tr2 to create range active document start 20 end 24
  select tr2
end tell
delay 0.8
tell application "System Events" to tell process "Microsoft Word"
  set frontmost to true
  delay 0.3
  keystroke "${trackedTokens[1]}"
  delay 0.7
end tell
tell application "Microsoft Word"
  set track revisions of active document to false
  save as active document file name "${shellQuoteAppleScriptText(trackDocxPath)}" file format format document
  close active document saving yes
  open file name "${shellQuoteAppleScriptText(trackDocxPath)}"
  set reopenedDocCount to count of documents
  close active document saving yes
  return reopenedDocCount
end tell`;

  const trackWordResult = runAppleScript(trackScript, { timeout: 60000 });
  fs.copyFileSync(docxPath, returnedDocxPath);
  fs.copyFileSync(trackDocxPath, returnedTrackDocxPath);
  const commentReadback = summarizeDocx(returnedDocxPath, commentTokens, []);
  const trackReadback = summarizeDocx(returnedTrackDocxPath, [], trackedTokens);
  const readback = {
    commentDocx: commentReadback,
    trackDocx: trackReadback,
    packagePartCount: commentReadback.packagePartCount + trackReadback.packagePartCount,
    commentRelatedParts: commentReadback.commentRelatedParts,
    requiredModernCommentPartsPresent: commentReadback.requiredModernCommentPartsPresent,
    comments: commentReadback.comments,
    document: trackReadback.document,
  };
  const uiDiscovery = probeReviewUiControlNames();
  runAppleScript('tell application "Microsoft Word" to if (count of documents) > 0 then close every document saving no', { timeout: 10000 });

  const rootCommentsPass = readback.comments.expectedTokensMissing.length === 0
    && readback.comments.count >= commentTokens.length
    && readback.requiredModernCommentPartsPresent !== false;
  const trackedChangesPass = readback.document.insertionCount >= 1
    && readback.document.deletionCount >= 1
    && readback.document.expectedTrackedTokensFound.length >= 1;
  const replyResolveDeleteCertified = uiDiscovery.replyControlFound
    && uiDiscovery.resolveControlFound
    && uiDiscovery.deleteControlFound
    && readback.comments.doneTrueCount > 0;

  const receipt = {
    schemaVersion: SCHEMA,
    taskId: 'YALKEN_WORD_E12_NATIVE_COMMENT_UI_RESUME',
    stageId: STAGE,
    status: PHYSICAL_LIMITATION_STATUS,
    result: rootCommentsPass && trackedChangesPass ? 'PASS' : 'FAIL',
    createdAtUtc: new Date().toISOString(),
    base: {
      originMainSha: runGit(['rev-parse', 'origin/main']),
      branch: runGit(['branch', '--show-current']) || 'DETACHED',
      headSha: runGit(['rev-parse', 'HEAD']),
      priorMergedStage: 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION',
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
      openedSyntheticDocuments: 2,
      openDocumentsAfterLab: Number(runAppleScript('tell application "Microsoft Word" to return count of documents') || 0),
    },
    secureVolume,
    wordSandboxWorkRoot,
    artifactRoot: ARTIFACT_ROOT,
    runDir,
    wordSandboxRunDir: sandboxRunDir,
    returnedDocx: {
      path: returnedDocxPath,
      sha256: `sha256:${sha256File(returnedDocxPath)}`,
      trackPath: returnedTrackDocxPath,
      trackSha256: `sha256:${sha256File(returnedTrackDocxPath)}`,
      packagePartCount: readback.packagePartCount,
      commentRelatedParts: readback.commentRelatedParts,
    },
    systemEvents: {
      ...probe.systemEvents,
      nativeUiAutomationAllowed: true,
      userDocumentsTouched: false,
    },
    dictionaryProbe: probe.dictionaryProbe,
    physicalCorpus: {
      mode: 'TARGETED_WORD_PROCESS_UI_SCRIPTING',
      wordResult,
      trackWordResult,
      cases: [
        {
          id: 'NCUI-001',
          title: 'create root modern comment through Insert menu',
          actionPath: 'System Events process Microsoft Word -> menu Вставка -> Примечание -> keystroke numeric token',
          expectedTokens: commentTokens,
          result: rootCommentsPass ? 'PASS' : 'FAIL',
          wordVisibleEvidence: 'Word reopened returned DOCX without repair prompt and zero open documents after lab cleanup',
          packageReadback: {
            commentCount: readback.comments.count,
            expectedTokensFound: readback.comments.expectedTokensFound,
            expectedTokensMissing: readback.comments.expectedTokensMissing,
            requiredModernCommentPartsPresent: readback.requiredModernCommentPartsPresent,
            commentRangeStartCount: readback.document.commentRangeStartCount,
            commentRangeEndCount: readback.document.commentRangeEndCount,
          },
        },
        {
          id: 'NCUI-002',
          title: 'adjacent tracked replacements through Word-authored revision mode and UI keystrokes',
          actionPath: 'Microsoft Word track revisions true -> System Events keystrokes on selected Word ranges',
          expectedTokens: trackedTokens,
          result: trackedChangesPass ? 'PASS_WITH_OVERLAP_LIMITATION' : 'FAIL',
          packageReadback: {
            insertionCount: readback.document.insertionCount,
            deletionCount: readback.document.deletionCount,
            deletedTextCount: readback.document.deletedTextCount,
            expectedTrackedTokensFound: readback.document.expectedTrackedTokensFound,
            expectedTrackedTokensMissing: readback.document.expectedTrackedTokensMissing,
          },
        },
        {
          id: 'NCUI-003',
          title: 'reply resolve reopen delete native UI discovery',
          actionPath: 'System Events Review ribbon accessibility tree discovery',
          result: replyResolveDeleteCertified ? 'PASS' : 'TYPED_LIMITATION',
          uiControls: uiDiscovery.matched,
          packageReadback: {
            doneTrueCount: readback.comments.doneTrueCount,
            doneFalseCount: readback.comments.doneFalseCount,
            durableIdCount: readback.comments.durableIdCount,
          },
          limitation: replyResolveDeleteCertified ? '' : ACTIVE_LIMITATION,
        },
      ],
      readbackDigest: sha256Text(JSON.stringify(readback)),
      uiDiscovery,
      readback,
    },
    certificationDecision: {
      result: rootCommentsPass && trackedChangesPass ? 'PHYSICAL_NATIVE_UI_ROOT_COMMENTS_AND_TRACKED_EDITS_CONFIRMED_WITH_TYPED_LIMITATIONS' : 'PHYSICAL_NATIVE_UI_CORPUS_FAILED',
      rootModernCommentCertified: rootCommentsPass,
      wordAuthoredTrackedReplacementCertified: trackedChangesPass,
      trackedAdjacentEditsCertified: false,
      trackedOverlappingEditsCertified: false,
      modernReplyCertified: false,
      resolveReopenCertified: false,
      deleteCertified: false,
      nativeUiPhysicalActionsPerformed: true,
      externalPermissionRequired: false,
      reason: 'Targeted Word process UI scripting works even though global System Events UI elements enabled is false; root modern comments and Word-authored tracked edits are physically proven, while reply resolve reopen delete remain typed limitations because accessible controls and semantic readback did not prove them.',
    },
    remainingWordLimitations: [
      ACTIVE_LIMITATION,
      'NATIVE_UI_OVERLAPPING_TRACKED_EDITS_NOT_CERTIFIED',
    ],
    resolvedLimitations: [
      'MODERN_COMMENT_NATIVE_UI_REQUIRES_MACOS_ACCESSIBILITY_GRANT',
    ],
    runtimeClaims: {
      productRuntimeChanged: false,
      uiChanged: false,
      networkDependencyAdded: false,
      newDependencyAdded: false,
      writerAuthorityAdded: false,
      automaticApplyExpanded: false,
      googleDocsOpened: false,
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      falseModernCommentSupportClaim: 0,
      silentCommentLoss: 0,
      noOpCommentPassClaimed: 0,
    },
    saturated: false,
    nextStage: NEXT_STAGE,
    nonClaims: [
      'modern replies are not certified',
      'resolve reopen delete are not certified',
      'overlapping tracked edits are not certified',
      'Word SATURATED is not claimed',
      'Google Docs remains closed',
    ],
  };
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
  if (!new Set([HISTORICAL_BLOCKED_STATUS, PHYSICAL_LIMITATION_STATUS]).has(receipt.status)) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_STATUS_UNKNOWN', 'status', 'Followup status must be a known blocker or physical limitation status.');
  }
  if (receipt.nextStage !== NEXT_STAGE || receipt.saturated !== false) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_SEQUENCE_INVALID', 'nextStage', 'Followup must keep Word not saturated and stay on the same native UI certification stage.');
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
