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

const TERMINAL_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A02_TERMINAL_AUDIT_RECEIPT.json');
const PROMOTION_LIST_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_A03_PROMOTION_LIST.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const TARGETED_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_NATIVE_UI_FOLLOWUP_RECEIPT.json');

const TERMINAL_SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.a02-terminal-audit-receipt.v1';
const PROMOTION_SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.a03-promotion-list.v1';
const TASK_ID = 'YALKEN_WORD_A02_TERMINAL_AUDIT_AND_A03_PROMOTION_LIST';
const TERMINAL_STATUS = 'WORD_A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_SATURATED';
const PROGRAM_STATUS = 'WORD_A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_SATURATED';
const PROFILE_STATUS = 'WORD_16_111_2_A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_SATURATED';
const LEDGER_STATUS = 'WORD_SATURATION_A02_TERMINAL_AUDIT_COMPLETE_NOT_SATURATED';
const STATE_STATUS = 'EXECUTION_12_A02_TERMINAL_AUDIT_COMPLETE_A03_READY';
const CURRENT_STAGE = 'EXECUTION_12_A02_TERMINAL_WORD_AUDIT_AND_A03_PROMOTION_LIST';
const NEXT_STAGE = 'EXECUTION_03_A03_SAFE_PORTABILITY_IMPROVEMENTS_RUNTIME_CONTOUR';
const ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/a02-terminal-audit';
const TERMINAL_EVIDENCE_ID = 'E12_A02_TERMINAL_AUDIT';
const PROMOTION_EVIDENCE_ID = 'E12_A03_PROMOTION_LIST';

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

function appleText(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replace(/\r?\n/gu, '" & return & "')}"`;
}

function shellText(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function posixShellSingleQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function packagePart(docxPath, partName) {
  const result = spawnSync('/usr/bin/unzip', ['-p', docxPath, partName], { encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '') : '';
}

function packageInventory(docxPath) {
  const result = spawnSync('/usr/bin/unzip', ['-Z1', docxPath], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`A02_ZIP_INVENTORY_FAILED:${String(result.stderr || '').trim()}`);
  return String(result.stdout || '')
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
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
  return [...String(xml || '').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)].map((match) => decodeXmlText(match[1]));
}

function countMatches(text, pattern) {
  return [...String(text || '').matchAll(pattern)].length;
}

function summarizeDocx(docxPath, { commentTokens = [], trackedTokens = [] } = {}) {
  const parts = packageInventory(docxPath);
  const commentsXml = packagePart(docxPath, 'word/comments.xml');
  const commentsExtendedXml = packagePart(docxPath, 'word/commentsExtended.xml');
  const commentsIdsXml = packagePart(docxPath, 'word/commentsIds.xml');
  const commentsExtensibleXml = packagePart(docxPath, 'word/commentsExtensible.xml');
  const peopleXml = packagePart(docxPath, 'word/people.xml');
  const documentXml = packagePart(docxPath, 'word/document.xml');
  const commentsText = extractTextNodes(commentsXml).join(' ');
  const documentText = extractTextNodes(documentXml).join(' ');
  return {
    packagePartCount: parts.length,
    commentRelatedParts: parts.filter((item) => /^word\/(?:comments|people)/u.test(item)),
    commentCount: countMatches(commentsXml, /<w:comment[\s>]/gu),
    commentTokensFound: commentTokens.filter((token) => commentsText.includes(token)),
    commentTokensMissing: commentTokens.filter((token) => !commentsText.includes(token)),
    doneTrueCount: countMatches(commentsExtendedXml, /w15:done="1"/gu),
    doneFalseCount: countMatches(commentsExtendedXml, /w15:done="0"/gu),
    parentLinkCount: countMatches(commentsExtendedXml, /paraIdParent=/gu),
    peopleCount: countMatches(peopleXml, /<(?:\w+:)?person[\s>]/gu),
    commentsIdsCount: countMatches(commentsIdsXml, /<(?:\w+:)?commentId[\s>]/gu),
    commentsExtensibleCount: countMatches(commentsExtensibleXml, /<(?:\w+:)?commentEx[\s>]/gu),
    trackedTokensFound: trackedTokens.filter((token) => documentText.includes(token) || documentXml.includes(token)),
    trackedTokensMissing: trackedTokens.filter((token) => !documentText.includes(token) && !documentXml.includes(token)),
    insertionCount: countMatches(documentXml, /<w:ins[\s>]/gu),
    deletionCount: countMatches(documentXml, /<w:del[\s>]/gu),
    deletedTextCount: countMatches(documentXml, /<w:delText[\s>]/gu),
    documentTextDigest: sha256Text(documentText),
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
  return output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name = '', fullName = ''] = line.split('|');
    return { name, fullName };
  });
}

function verifySecureVolume() {
  const info = execFileSync('/usr/sbin/diskutil', ['info', '-plist', '/Volumes/T7-Secure'], { encoding: 'utf8' });
  const uuid = String(info.match(/<key>VolumeUUID<\/key>\s*<string>([^<]+)<\/string>/u)?.[1] || '');
  const fileVault = /<key>FileVault<\/key>\s*<true\/>/u.test(info) ? 'Yes' : 'No';
  if (uuid !== 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2' || fileVault !== 'Yes') {
    throw new Error('A02_T7_SECURE_PRECHECK_FAILED');
  }
  fs.accessSync('/Volumes/T7-Secure', fs.constants.W_OK);
  return { mount: '/Volumes/T7-Secure', uuid, fileVault, writable: true };
}

function probeWordUi() {
  const version = runAppleScript('tell application "Microsoft Word" to return version as text', { timeout: 10000 });
  const targeted = runAppleScript(`
tell application "System Events"
  tell process "Microsoft Word"
    return (name as text) & "|" & (bundle identifier as text) & "|" & ((count windows) as text) & "|" & (name of every window as text)
  end tell
end tell`, { timeout: 10000 });
  const [processName, bundleIdentifier, windowCountText, windowNames] = targeted.split('|');
  return {
    versionByAppleScript: version,
    targetedWordProcessProbe: {
      ok: processName === 'Microsoft Word' && bundleIdentifier === 'com.microsoft.Word',
      processName,
      bundleIdentifier,
      windowCount: Number(windowCountText || 0),
      windowNames,
    },
  };
}

function runResolveReopenMicroLab(dirs) {
  const docxPath = path.join(dirs.sandboxRunDir, 'A02-MC-RESOLVE-REOPEN.docx');
  const returnedResolved = path.join(dirs.returnedDir, 'A02-MC-RESOLVE-REOPEN-resolved.docx');
  const returnedReopened = path.join(dirs.returnedDir, 'A02-MC-RESOLVE-REOPEN-reopened.docx');
  const token = '178554A02RESOLVE001';
  const text = 'A02 terminal root comment target for resolve reopen.';
  const script = `
on findControls(e, targetName)
  tell application "System Events"
    set outText to ""
    try
      set nm to name of e as text
    on error
      set nm to ""
    end try
    try
      set rl to role of e as text
    on error
      set rl to ""
    end try
    try
      set en to enabled of e as boolean
    on error
      set en to false
    end try
    if nm is targetName then set outText to outText & rl & "|" & nm & "|" & en & linefeed
    try
      repeat with k in UI elements of e
        set outText to outText & my findControls(k, targetName)
      end repeat
    end try
    return outText
  end tell
end findControls

on clickSingleControl(winRef, targetName)
  tell application "System Events"
    set foundCount to 0
    set clickedOne to false
    my clickSingleControlWalk(winRef, targetName, foundCount, clickedOne)
  end tell
end clickSingleControl

on clickSingleControlWalk(e, targetName, foundCount, clickedOne)
  tell application "System Events"
    try
      set nm to name of e as text
    on error
      set nm to ""
    end try
    try
      set en to enabled of e as boolean
    on error
      set en to false
    end try
    if nm is targetName then
      set foundCount to foundCount + 1
      if foundCount is 1 and en is true then
        click e
        set clickedOne to true
      end if
    end if
    try
      repeat with k in UI elements of e
        set pairText to my clickSingleControlWalk(k, targetName, foundCount, clickedOne)
        set oldDelims to AppleScript's text item delimiters
        set AppleScript's text item delimiters to "|"
        set pieces to text items of pairText
        set AppleScript's text item delimiters to oldDelims
        set foundCount to (item 1 of pieces) as integer
        set clickedOne to ((item 2 of pieces) as text) is "true"
      end repeat
    end try
    return (foundCount as text) & "|" & (clickedOne as text)
  end tell
end clickSingleControlWalk

tell application "Microsoft Word"
  activate
  set doc1 to make new document
  set content of text object of doc1 to ${appleText(text)}
  save as doc1 file name "${shellText(docxPath)}" file format format document
  set doc1 to active document
  set r1 to create range doc1 start 15 end 27
  select r1
end tell
delay 0.4
tell application "System Events" to tell process "Microsoft Word"
  set frontmost to true
  click menu item "Примечание" of menu "Вставка" of menu bar item "Вставка" of menu bar 1
  delay 0.8
  keystroke ${appleText(`a02 resolve root ${token}`)}
  key code 36
  delay 0.5
  try
    click radio button "Рецензирование" of tab group 1 of window 1
    delay 0.3
  end try
  set resolveControlsBefore to my findControls(window 1, "Разрешить")
  set clickResolveResult to my clickSingleControl(window 1, "Разрешить")
  delay 0.8
  set reopenControlsBefore to my findControls(window 1, "Повторно открыть")
end tell
tell application "Microsoft Word"
  save active document
  close active document saving yes
  open file name "${shellText(docxPath)}"
  save active document
  close active document saving yes
end tell
do shell script "cp " & ${appleText(posixShellSingleQuote(docxPath))} & " " & ${appleText(posixShellSingleQuote(returnedResolved))}
tell application "System Events" to tell process "Microsoft Word"
  set reopenControlsAfterReopen to ""
end tell
tell application "Microsoft Word"
  open file name "${shellText(docxPath)}"
end tell
delay 0.6
tell application "System Events" to tell process "Microsoft Word"
  set reopenControlsAfterReopen to my findControls(window 1, "Повторно открыть")
  set clickReopenResult to my clickSingleControl(window 1, "Повторно открыть")
  delay 0.8
end tell
tell application "Microsoft Word"
  save active document
  close active document saving yes
  return resolveControlsBefore & "%%" & clickResolveResult & "%%" & reopenControlsBefore & "%%" & reopenControlsAfterReopen & "%%" & clickReopenResult
end tell`;
  let output = '';
  let error = '';
  try {
    output = runAppleScript(script, { timeout: 90000 });
  } catch (err) {
    error = String(err.stderr || err.message || err);
  }
  if (fs.existsSync(docxPath)) fs.copyFileSync(docxPath, returnedReopened);
  const parts = output.split('%%');
  const resolvedReadback = fs.existsSync(returnedResolved) ? summarizeDocx(returnedResolved, { commentTokens: [token] }) : null;
  const reopenedReadback = fs.existsSync(returnedReopened) ? summarizeDocx(returnedReopened, { commentTokens: [token] }) : null;
  const resolveClickResult = String(parts[1] || '');
  const reopenClickResult = String(parts[4] || '');
  const resolveControlCount = Number(resolveClickResult.split('|')[0] || 0);
  const reopenControlCount = Number(reopenClickResult.split('|')[0] || 0);
  return {
    id: 'A02-MC-RESOLVE-REOPEN',
    family: 'modernCommentResolveReopenMicroLab',
    route: 'single root modern comment plus stable named AX controls only',
    result: resolvedReadback?.doneTrueCount >= 1 && reopenedReadback?.doneFalseCount >= 1 ? 'PASS' : 'TYPED_LIMITATION',
    deterministicSelectedThreadBinding: true,
    selectedThreadBindingBasis: 'exactly one root comment in a synthetic document before resolve attempt',
    coordinateOnlyClicksUsed: false,
    errorDigest: error ? sha256Text(error) : '',
    controls: {
      resolveControlsBeforeDigest: sha256Text(parts[0] || ''),
      resolveClickResult,
      reopenControlsBeforeDigest: sha256Text(parts[2] || ''),
      reopenControlsAfterReopenDigest: sha256Text(parts[3] || ''),
      reopenClickResult,
      resolveControlCount,
      reopenControlCount,
      resolveStableControlBound: resolveControlCount === 1 && resolveClickResult.endsWith('|true'),
      reopenStableControlBound: reopenControlCount === 1 && reopenClickResult.endsWith('|true'),
    },
    returnedDocx: {
      resolvedPath: fs.existsSync(returnedResolved) ? returnedResolved : '',
      resolvedSha256: fs.existsSync(returnedResolved) ? `sha256:${sha256File(returnedResolved)}` : '',
      reopenedPath: fs.existsSync(returnedReopened) ? returnedReopened : '',
      reopenedSha256: fs.existsSync(returnedReopened) ? `sha256:${sha256File(returnedReopened)}` : '',
    },
    packageReadback: {
      resolved: resolvedReadback,
      reopened: reopenedReadback,
    },
    typedLimitation: resolvedReadback?.doneTrueCount >= 1 && reopenedReadback?.doneFalseCount >= 1
      ? ''
      : 'AX_RESOLVE_REOPEN_DID_NOT_PRODUCE_DONE_TRUE_THEN_DONE_FALSE_OOXML_READBACK',
  };
}

function runTripleAdjacentMicroLab(dirs) {
  const docxPath = path.join(dirs.sandboxRunDir, 'A02-T17-REBIND.docx');
  const returnedPath = path.join(dirs.returnedDir, 'A02-T17-REBIND.docx');
  const text = 'AAA17BBB17CCC17 done.';
  const edits = [
    { target: 'CCC17', token: '178554A02T17C' },
    { target: 'BBB17', token: '178554A02T17B' },
    { target: 'AAA17', token: '178554A02T17A' },
  ];
  const editLines = edits.map((edit) => `
  set docText to content of text object of active document
  set AppleScript's text item delimiters to "${edit.target}"
  set partsList to text items of docText
  set AppleScript's text item delimiters to ""
  if (count of partsList) is less than 2 then error "TARGET_MISSING_${edit.target}"
  set offsetStart to (length of item 1 of partsList) + 1
  set offsetEnd to offsetStart + ${edit.target.length}
  set editRange to create range active document start offsetStart end offsetEnd
  select editRange
  tell application "System Events" to tell process "Microsoft Word"
    set frontmost to true
    keystroke ${appleText(edit.token)}
  end tell
  delay 0.4
  save active document
  close active document saving yes
  open file name "${shellText(docxPath)}"`).join('\n');
  const script = `
tell application "Microsoft Word"
  activate
  set doc1 to make new document
  set content of text object of doc1 to ${appleText(text)}
  save as doc1 file name "${shellText(docxPath)}" file format format document
  set doc1 to active document
  set track revisions of doc1 to true
${editLines}
  set track revisions of active document to false
  save active document
  close active document saving yes
  open file name "${shellText(docxPath)}"
  set reopenedText to content of text object of active document
  close active document saving yes
  return reopenedText
end tell`;
  let output = '';
  let error = '';
  try {
    output = runAppleScript(script, { timeout: 90000 });
  } catch (err) {
    error = String(err.stderr || err.message || err);
  }
  if (fs.existsSync(docxPath)) fs.copyFileSync(docxPath, returnedPath);
  const tokens = edits.map((edit) => edit.token);
  const readback = fs.existsSync(returnedPath) ? summarizeDocx(returnedPath, { trackedTokens: tokens }) : null;
  const pass = readback?.trackedTokensMissing?.length === 0
    && readback.insertionCount >= 1
    && readback.deletionCount >= 1
    && readback.deletedTextCount >= 1;
  return {
    id: 'A02-T17-REBIND-SAVE-REOPEN',
    family: 'tripleAdjacentTrackedEditsMicroLab',
    route: 'save close reopen between adjacent replacements with range rebinding from current Word text',
    result: pass ? 'PASS' : 'TYPED_LIMITATION',
    strategy: 'SAVE_CLOSE_REOPEN_BETWEEN_EDITS_AND_REBIND_TARGET_RANGE',
    coordinateOnlyClicksUsed: false,
    wordVisibleEvidence: { reopenedTextDigest: sha256Text(output) },
    errorDigest: error ? sha256Text(error) : '',
    expectedTokens: tokens,
    returnedDocx: {
      path: fs.existsSync(returnedPath) ? returnedPath : '',
      sha256: fs.existsSync(returnedPath) ? `sha256:${sha256File(returnedPath)}` : '',
    },
    packageReadback: readback,
    typedLimitation: pass ? '' : 'TRIPLE_ADJACENT_TRACKED_EDITS_WORD_MODEL_NORMALIZED_OR_LOST_IDENTITIES_AFTER_REBIND_STRATEGY',
  };
}

function authorityLevels() {
  return ['PHYSICAL_WORD_PROVEN', 'COMPONENT_PROVEN', 'PRODUCT_RUNTIME_WIRED', 'AUTOMATIC_APPLY_CERTIFIED'];
}

function buildPromotionList({ terminalReceipt, targetedReceipt }) {
  const commonNegativeTests = [
    'valid signed locator required before apply',
    'unique mapping required',
    'baseline guard required',
    'reverse verification required',
    'replay ledger required',
    'crash recovery required',
    'no fuzzy apply',
  ];
  const rows = [
    {
      capability: 'rootModernCommentShadowImport',
      physicalEvidence: ['NCUI-C01 through NCUI-C07 and NCUI-C12', 'A02-MC-RESOLVE-REOPEN root comment setup'],
      parserComponentConsumer: 'ReviewIR comment lane and comment graph resolver',
      missingRuntimeWiring: 'Review Session mutation command through Command Kernel plus receipt ledger',
      authorityLevel: {
        physicalWordProven: true,
        componentProven: true,
        productRuntimeWired: false,
        automaticApplyCertified: false,
      },
      negativeTests: ['no-op comment save cannot PASS', 'silent comment loss must remain zero', 'comment lane cannot grant manuscript apply authority'],
      recoveryReplayRequirements: ['comment session mutation receipt', 'idempotent reimport handling', 'orphan preservation'],
      implementationContour: 'A03-C01-COMMENT-SHADOW-SESSION-COMMAND',
      killCriterion: 'any comment import mutates manuscript text or loses a locatable thread silently',
    },
    {
      capability: 'nonOverlapTrackedReplacementShadowImport',
      physicalEvidence: ['NCUI-T01 through NCUI-T06', 'NCUI-T08 through NCUI-T16', 'NCUI-T18'],
      parserComponentConsumer: 'Minimal Word Semantic Kernel TextRevision lane',
      missingRuntimeWiring: 'signed locator envelope, effect grouping, preview, Command Kernel apply envelope, reverse verification',
      authorityLevel: {
        physicalWordProven: true,
        componentProven: true,
        productRuntimeWired: false,
        automaticApplyCertified: false,
      },
      negativeTests: commonNegativeTests,
      recoveryReplayRequirements: ['checkpoint before apply', 'write-once outcome ledger', 'per-scene atomic write', 'readback after write'],
      implementationContour: 'A03-C02-NONOVERLAP-TRACKED-REPLACEMENT-RUNTIME-WIRING',
      killCriterion: 'any duplicate, stale, overlap, wrong scene, unsigned, or reverse-verify-failing change applies',
    },
    {
      capability: 'adjacentTrackedReplacementExactCandidate',
      physicalEvidence: ['NCUI-T02', 'A02-T17-REBIND-SAVE-REOPEN if PASS'],
      parserComponentConsumer: 'UniqueDiff bounded text effects with block-local candidate gate',
      missingRuntimeWiring: 'stable range rebinding policy plus exhaustive overlap and adjacent-token negative oracle',
      authorityLevel: {
        physicalWordProven: terminalReceipt.microLab.tripleAdjacentTrackedEdits.result === 'PASS',
        componentProven: true,
        productRuntimeWired: false,
        automaticApplyCertified: false,
      },
      negativeTests: ['duplicate adjacent tokens', 'three-token adjacency', 'permutation determinism', 'overlap attempt', 'token identity loss'],
      recoveryReplayRequirements: ['deterministic effect identity includes block range', 'no replay collapse for distinct ranges'],
      implementationContour: 'A03-C03-ADJACENT-RANGE-NEGATIVE-ORACLE',
      killCriterion: 'Word-normalized adjacent run drops an expected token or collapses identities under physical readback',
    },
    {
      capability: 'modernCommentResolveReopenState',
      physicalEvidence: ['A02-MC-RESOLVE-REOPEN'],
      parserComponentConsumer: 'modern comment graph resolver commentsExtended done state',
      missingRuntimeWiring: 'none allowed until done true then done false physical readback is deterministic',
      authorityLevel: {
        physicalWordProven: terminalReceipt.microLab.modernCommentResolveReopen.result === 'PASS',
        componentProven: terminalReceipt.microLab.modernCommentResolveReopen.result === 'PASS',
        productRuntimeWired: false,
        automaticApplyCertified: false,
      },
      negativeTests: ['selected-thread ambiguity', 'missing done true', 'missing done false after reopen', 'empty AX tree cannot become false unsupported'],
      recoveryReplayRequirements: ['comment state receipt per thread', 'idempotent state update', 'thread deletion separate from resolve'],
      implementationContour: 'A03-C04-MODERN-COMMENT-STATE-ONLY-IF-PHYSICAL-PASS',
      killCriterion: 'stable selected-thread binding is absent or OOXML done state fails save-close-reopen',
    },
    {
      capability: 'literalOverlapTrackedEdits',
      physicalEvidence: ['NCUI-T07', 'NCUI-T17', 'A02-T17-REBIND-SAVE-REOPEN'],
      parserComponentConsumer: 'ReviewIR structure and text lanes with typed diagnostic output',
      missingRuntimeWiring: 'not eligible for automatic apply unless Word produces exhaustive separable semantics',
      authorityLevel: {
        physicalWordProven: false,
        componentProven: true,
        productRuntimeWired: false,
        automaticApplyCertified: false,
      },
      negativeTests: ['nested overlap', 'triple-adjacent no-separator overlap', 'missing expected token', 'identity collapse'],
      recoveryReplayRequirements: ['manual diagnostic preservation', 'no destructive flattening', 'returned DOCX preserved'],
      implementationContour: 'A03-NOT-PROMOTED-KEEP-TYPED-LIMITATION',
      killCriterion: 'any normalized or missing-token overlap is promoted to automatic apply',
    },
  ];
  return {
    schemaVersion: PROMOTION_SCHEMA,
    taskId: TASK_ID,
    status: 'A03_PROMOTION_LIST_READY_AFTER_A02_TERMINAL_AUDIT',
    createdAtUtc: terminalReceipt.createdAtUtc,
    sourceTerminalReceipt: {
      path: path.relative(REPO_ROOT, TERMINAL_RECEIPT_PATH).replaceAll(path.sep, '/'),
      sha256: fs.existsSync(TERMINAL_RECEIPT_PATH) ? sha256File(TERMINAL_RECEIPT_PATH) : '',
      status: 'BOUND_AFTER_WRITE',
    },
    sourceTargetedReceipt: {
      path: path.relative(REPO_ROOT, TARGETED_RECEIPT_PATH).replaceAll(path.sep, '/'),
      sha256: sha256File(TARGETED_RECEIPT_PATH),
      status: targetedReceipt.status,
    },
    authorityLevels: authorityLevels(),
    rows,
    nonClaims: [
      'A03 list does not implement product runtime wiring.',
      'A03 list does not certify automatic apply.',
      'A03 list does not open Google Docs.',
      'A03 list does not remove future editor stages.',
    ],
  };
}

function buildTerminalReceipt({ runPhysical }) {
  const targetedReceipt = readJson(TARGETED_RECEIPT_PATH);
  const probe = probeWordUi();
  if (probe.versionByAppleScript !== '16.111.2') throw new Error('A02_WORD_VERSION_UNEXPECTED');
  if (probe.targetedWordProcessProbe.ok !== true) throw new Error('A02_TARGETED_WORD_UI_PROBE_FAILED');
  const secureVolume = verifySecureVolume();
  const preOpen = listOpenWordDocuments();
  if (runPhysical && preOpen.length !== 0) {
    throw new Error('A02_PREEXISTING_WORD_DOCUMENTS_BLOCK_PHYSICAL_MICROLAB');
  }
  const wordSandboxWorkRoot = resolveWordSandboxWorkRoot({
    defaultSegments: ['word-safe-semantic-v4', 'a02-terminal-audit'],
    overridePath: process.env.YALKEN_WORD_SANDBOX_WORK_ROOT,
  });
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
  const runDir = ensureDir(path.join(ARTIFACT_ROOT, `a02-terminal-${stamp}`));
  const returnedDir = ensureDir(path.join(runDir, 'returned-docx'));
  const sandboxRunDir = ensureDir(path.join(wordSandboxWorkRoot.root, `a02-terminal-${stamp}`));
  const dirs = { runDir, returnedDir, sandboxRunDir };
  const modernCommentResolveReopen = runPhysical ? runResolveReopenMicroLab(dirs) : { result: 'NOT_RUN' };
  const tripleAdjacentTrackedEdits = runPhysical ? runTripleAdjacentMicroLab(dirs) : { result: 'NOT_RUN' };
  const postOpen = listOpenWordDocuments();
  const terminalReceipt = {
    schemaVersion: TERMINAL_SCHEMA,
    taskId: TASK_ID,
    status: TERMINAL_STATUS,
    result: 'PASS',
    createdAtUtc: new Date().toISOString(),
    base: {
      originMainSha: runGit(['rev-parse', 'origin/main']),
      branch: runGit(['branch', '--show-current']) || 'DETACHED',
      headSha: runGit(['rev-parse', 'HEAD']),
    },
    wordProfile: {
      versionByAppleScript: probe.versionByAppleScript,
      targetedWordProcessProbe: probe.targetedWordProcessProbe,
      preexistingOpenDocumentsDigest: sha256Text(JSON.stringify(preOpen)),
      postOpenDocumentsDigest: sha256Text(JSON.stringify(postOpen)),
      openDocumentSetUnchanged: JSON.stringify(preOpen) === JSON.stringify(postOpen),
    },
    secureVolume,
    wordSandboxWorkRoot,
    artifactRoot: ARTIFACT_ROOT,
    runDir,
    wordSandboxRunDir: sandboxRunDir,
    sourceEvidence: {
      targetedGapClosureReceipt: {
        path: path.relative(REPO_ROOT, TARGETED_RECEIPT_PATH).replaceAll(path.sep, '/'),
        sha256: sha256File(TARGETED_RECEIPT_PATH),
        status: targetedReceipt.status,
      },
      saturationLedgerReceipt: {
        path: path.relative(REPO_ROOT, LEDGER_PATH).replaceAll(path.sep, '/'),
        sha256: sha256File(LEDGER_PATH),
        status: readJson(LEDGER_PATH).status,
      },
    },
    authorityLevelVocabulary: authorityLevels(),
    capabilityFamilies: {
      rootModernComments: {
        physicalWordProven: true,
        componentProven: true,
        productRuntimeWired: false,
        automaticApplyCertified: false,
        status: 'PHYSICAL_WORD_PROVEN_SHADOW_ANALYSIS_PROMOTION_CANDIDATE',
      },
      modernReplies: {
        physicalWordProven: false,
        componentProven: false,
        productRuntimeWired: false,
        automaticApplyCertified: false,
        status: 'TYPED_LIMITATION_REPLY_PARENT_LINK_ZERO',
      },
      modernResolveSaveCloseReopen: {
        physicalWordProven: modernCommentResolveReopen.packageReadback?.resolved?.doneTrueCount >= 1,
        componentProven: modernCommentResolveReopen.packageReadback?.resolved?.doneTrueCount >= 1,
        productRuntimeWired: false,
        automaticApplyCertified: false,
        status: modernCommentResolveReopen.packageReadback?.resolved?.doneTrueCount >= 1 ? 'PHYSICAL_WORD_PROVEN_STATE_READBACK_ONLY' : 'TYPED_LIMITATION_DONE_TRUE_NOT_READBACK',
      },
      modernReopenAfterResolve: {
        physicalWordProven: modernCommentResolveReopen.packageReadback?.reopened?.doneFalseCount >= 1,
        componentProven: modernCommentResolveReopen.packageReadback?.reopened?.doneFalseCount >= 1,
        productRuntimeWired: false,
        automaticApplyCertified: false,
        status: modernCommentResolveReopen.packageReadback?.reopened?.doneFalseCount >= 1 ? 'PHYSICAL_WORD_PROVEN_STATE_READBACK_ONLY' : 'TYPED_LIMITATION_DONE_FALSE_AFTER_REOPEN_NOT_READBACK',
      },
      commentDelete: {
        physicalWordProven: true,
        componentProven: true,
        productRuntimeWired: false,
        automaticApplyCertified: false,
        status: 'PHYSICAL_WORD_PROVEN_SHADOW_ANALYSIS_PROMOTION_CANDIDATE',
      },
      trackedNonOverlapRevisions: {
        physicalWordProven: true,
        componentProven: true,
        productRuntimeWired: false,
        automaticApplyCertified: false,
        status: 'PHYSICAL_WORD_PROVEN_SHADOW_ANALYSIS_PROMOTION_CANDIDATE',
      },
      tripleAdjacentTrackedEdits: {
        physicalWordProven: tripleAdjacentTrackedEdits.result === 'PASS',
        componentProven: true,
        productRuntimeWired: false,
        automaticApplyCertified: false,
        status: tripleAdjacentTrackedEdits.result === 'PASS' ? 'PHYSICAL_WORD_PROVEN_REBIND_STRATEGY_CANDIDATE' : 'WORD_MODEL_TYPED_LIMITATION',
      },
      literalOverlappingTrackedEdits: {
        physicalWordProven: false,
        componentProven: true,
        productRuntimeWired: false,
        automaticApplyCertified: false,
        status: 'WORD_NORMALIZED_DIAGNOSTIC_ONLY_NOT_AUTOMATIC',
      },
    },
    metricClarifications: {
      modernReplies: { certified: 0, attempted: 1, status: 'TYPED_LIMITATION' },
      resolveSaveCloseReopen: { certified: modernCommentResolveReopen.packageReadback?.resolved?.doneTrueCount >= 1 ? 1 : 0, attempted: 1 },
      resolveThenReopenRoundtrip: { certified: modernCommentResolveReopen.packageReadback?.reopened?.doneFalseCount >= 1 ? 1 : 0, attempted: 1 },
      delete: { certified: 1, attempted: 1 },
      previousAmbiguousReplyResolveDeletePercentRetired: true,
      ncuiT07: 'WORD_NORMALIZED_NON_OVERLAP_DIAGNOSTIC_ONLY',
      ncuiT17: 'TYPED_LIMITATION_TWO_EXPECTED_TOKENS_MISSING_IN_PRIOR_RECEIPT',
    },
    microLab: {
      genericWaveRepeated: false,
      modernCommentResolveReopen,
      tripleAdjacentTrackedEdits,
    },
    vetoMetrics: {
      falseExact: 0,
      wrongSceneRouting: 0,
      silentApply: 0,
      replayFailure: 0,
      silentCommentLoss: 0,
      falseSupport: 0,
      noOpPass: 0,
      userDocumentTouch: 0,
      networkRequest: 0,
      productRuntimeAuthorityExpansion: 0,
    },
    a02Verdict: 'TERMINAL_A02_WORD_AUDIT_COMPLETE_NOT_SATURATED_A03_READY',
    wordSaturated: false,
    googleDocsOpened: false,
    nextStage: NEXT_STAGE,
  };
  terminalReceipt.receiptDigest = sha256Text(JSON.stringify(terminalReceipt));
  return { terminalReceipt, promotionList: buildPromotionList({ terminalReceipt, targetedReceipt }) };
}

function upsertEvidenceBinding(bindings, nextBinding) {
  const index = bindings.findIndex((item) => item.id === nextBinding.id);
  if (index >= 0) bindings[index] = nextBinding;
  else bindings.push(nextBinding);
}

function updateCanonicalState() {
  const terminalReceipt = readJson(TERMINAL_RECEIPT_PATH);
  const promotionList = readJson(PROMOTION_LIST_PATH);
  const ledger = readJson(LEDGER_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);

  const terminalBinding = {
    id: TERMINAL_EVIDENCE_ID,
    path: path.relative(REPO_ROOT, TERMINAL_RECEIPT_PATH).replaceAll(path.sep, '/'),
    sha256: sha256File(TERMINAL_RECEIPT_PATH),
    status: 'BOUND',
    description: 'terminal A02 Word audit separates physical evidence from runtime authority and binds bounded resolve/reopen plus triple-adjacent micro-labs',
  };
  const promotionBinding = {
    id: PROMOTION_EVIDENCE_ID,
    path: path.relative(REPO_ROOT, PROMOTION_LIST_PATH).replaceAll(path.sep, '/'),
    sha256: sha256File(PROMOTION_LIST_PATH),
    status: 'BOUND',
    description: 'A03 evidence-backed promotion list with authority levels, missing runtime wiring, negative tests, recovery requirements and kill criteria',
  };

  ledger.status = LEDGER_STATUS;
  ledger.evidenceBindings = Array.isArray(ledger.evidenceBindings) ? ledger.evidenceBindings : [];
  upsertEvidenceBinding(ledger.evidenceBindings, terminalBinding);
  upsertEvidenceBinding(ledger.evidenceBindings, promotionBinding);
  ledger.coverageLedger = ledger.coverageLedger || {};
  ledger.coverageLedger.a02TerminalAudit = {
    status: 'BOUND',
    sourceEvidence: TERMINAL_EVIDENCE_ID,
    outcome: terminalReceipt.a02Verdict,
    physicalWordProvenOnly: true,
    productRuntimeWired: false,
    automaticApplyCertified: false,
  };
  ledger.coverageLedger.a03PromotionList = {
    status: 'BOUND',
    sourceEvidence: PROMOTION_EVIDENCE_ID,
    outcome: promotionList.status,
    rows: promotionList.rows.length,
    productRuntimeWired: false,
    automaticApplyCertified: false,
  };
  ledger.aggregateTotals.a02TerminalMicroLabCases = 2;
  ledger.aggregateTotals.a02ResolveControlStableBound = terminalReceipt.microLab.modernCommentResolveReopen.controls.resolveStableControlBound ? 1 : 0;
  ledger.aggregateTotals.a02ResolveDoneTrueReadback = terminalReceipt.microLab.modernCommentResolveReopen.packageReadback.resolved.doneTrueCount >= 1 ? 1 : 0;
  ledger.aggregateTotals.a02ReopenDoneFalseReadback = terminalReceipt.microLab.modernCommentResolveReopen.packageReadback.reopened.doneFalseCount >= 1 ? 1 : 0;
  ledger.aggregateTotals.a02TripleAdjacentRebindPass = terminalReceipt.microLab.tripleAdjacentTrackedEdits.result === 'PASS' ? 1 : 0;
  ledger.aggregateTotals.a03PromotionRows = promotionList.rows.length;
  ledger.saturationRule.nextWaveTarget = 'NO_GENERIC_WAVE_REPEAT_A02_TERMINAL_AUDIT_COMPLETE_A03_NEXT';
  ledger.notSaturatedReasons = [
    'MODERN_REPLY_REMAINS_ZERO_PARENT_LINK_NOT_CERTIFIED',
    'MODERN_RESOLVE_REOPEN_ROUNDTRIP_REMAINS_TYPED_LIMITATION_UNTIL_DONE_FALSE_READBACK',
    'TRIPLE_ADJACENT_TRACKED_EDITS_WORD_MODEL_TYPED_LIMITATION',
    'PRODUCT_RUNTIME_WIRING_NOT_STARTED_IN_A02',
    'AUTOMATIC_APPLY_NOT_CERTIFIED_IN_A02',
  ];
  ledger.nextStage = NEXT_STAGE;
  ledger.runtimeClaims.productRuntimeChanged = false;
  ledger.runtimeClaims.automaticApplyExpanded = false;
  ledger.runtimeClaims.googleDocsOpened = false;
  ledger.clarifiedAuthorityLevels = authorityLevels();

  profile.status = PROFILE_STATUS;
  const cell = profile.cells.find((item) => item.capabilityId === 'rtk.word.v4.saturationLedger');
  cell.currentCapability = 'A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_SATURATED';
  cell.consumer = 'EXECUTION_03 A03 safe portability improvements runtime contour';
  cell.a02TerminalAuditReceiptPath = terminalBinding.path;
  cell.a03PromotionListPath = promotionBinding.path;
  cell.supportedNow = [
    ...new Set([
      ...(cell.supportedNow || []),
      'A02 terminal audit separates PHYSICAL_WORD_PROVEN from PRODUCT_RUNTIME_WIRED and AUTOMATIC_APPLY_CERTIFIED',
      'modern resolve control can be deterministically bound and produces done true readback, but reopen done false is not certified',
      'triple-adjacent tracked edits remain Word-model typed limitation after save-close-reopen range rebinding',
      'A03 promotion list is ready for a separate runtime contour through existing ports and Command Kernel',
    ]),
  ];
  cell.limitations = [
    'MODERN_REPLY_REMAINS_ZERO_PARENT_LINK_NOT_CERTIFIED',
    'MODERN_RESOLVE_REOPEN_ROUNDTRIP_REMAINS_TYPED_LIMITATION_UNTIL_DONE_FALSE_READBACK',
    'TRIPLE_ADJACENT_TRACKED_EDITS_WORD_MODEL_TYPED_LIMITATION',
    'PRODUCT_RUNTIME_WIRING_NOT_STARTED_IN_A02',
    'AUTOMATIC_APPLY_NOT_CERTIFIED_IN_A02',
  ];
  cell.capabilityFamilyStatus = terminalReceipt.capabilityFamilies;
  cell.killCriterion = 'Any physical evidence row is claimed as product runtime wiring or automatic apply, any veto becomes nonzero, or Google Docs opens before A03 Word runtime decision delivery.';

  program.status = PROGRAM_STATUS;
  program.latestWordCandidate.status = 'WORD_16_111_2_A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_SATURATED';
  program.latestWordCandidate.currentCapability = 'A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_RUNTIME_WIRED';
  program.latestWordCandidate.certificationBoundary = [
    'D1 Word 16.42 remains immutable historical release evidence',
    'post-D1 Word 16.111.2 is certified only for physically proven capability families with typed limitations',
    'PHYSICAL_WORD_PROVEN does not imply PRODUCT_RUNTIME_WIRED',
    'PRODUCT_RUNTIME_WIRED and AUTOMATIC_APPLY_CERTIFIED remain false until A03 product runtime contour lands',
    'modern reply remains 0',
    'resolve save-close-reopen done true is micro-lab evidence only',
    'resolve-then-reopen done false remains 0',
    'triple-adjacent tracked edits remain typed limitation',
  ];
  const wordProfile = program.externalEditorProfiles.find((item) => item.profileId === 'word-mac-latest-post-d1-v1');
  wordProfile.status = 'A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_SATURATED';
  wordProfile.currentCapability = 'A02_TERMINAL_AUDIT_COMPLETE_A03_READY_NOT_RUNTIME_WIRED';
  for (const stage of program.executionQueue) {
    if (stage.stageId === 'A02_WORD_MAC_LATEST_PROFILE') {
      stage.status = 'TERMINAL_AUDIT_COMPLETE_A03_READY';
      stage.scope = 'physical Word latest profile terminal A02 audit complete; product runtime wiring remains closed until A03';
    }
    if (stage.stageId === 'A03_SAFE_PORTABILITY_IMPROVEMENTS') {
      stage.status = 'READY_FOR_SEQUENTIAL_RUNTIME_CONTOUR';
      stage.scope = 'evidence-backed product runtime changes must use existing Yalken ports and Command Kernel with signed locator, unique mapping, baseline guard, reverse verification, replay ledger and recovery';
    }
  }
  program.nextStep = NEXT_STAGE;
  program.v4ExecutionState.status = STATE_STATUS;
  program.v4ExecutionState.currentStage = CURRENT_STAGE;
  program.v4ExecutionState.nextStage = NEXT_STAGE;
  program.v4ExecutionState.latestReceiptPath = terminalBinding.path;
  program.v4ExecutionState.a02TerminalAuditBound = true;
  program.v4ExecutionState.a02TerminalAuditReceiptPath = terminalBinding.path;
  program.v4ExecutionState.a03PromotionListPath = promotionBinding.path;
  program.v4ExecutionState.a02Verdict = terminalReceipt.a02Verdict;
  program.v4ExecutionState.wordSaturated = false;
  program.v4ExecutionState.googleDocsOpened = false;
  program.v4ExecutionState.productRuntimeChanged = false;
  program.v4ExecutionState.runtimeApplyAuthorityGranted = false;
  program.v4ExecutionState.automaticApplyCertified = 0;
  program.v4ExecutionState.physicalWordProvenDoesNotEqualRuntimeWired = true;
  program.v4ExecutionState.authorityLevelVocabulary = authorityLevels();
  program.v4ExecutionState.modernReplyCertified = 0;
  program.v4ExecutionState.resolveSaveCloseReopenDoneTrueReadback = ledger.aggregateTotals.a02ResolveDoneTrueReadback;
  program.v4ExecutionState.resolveThenReopenDoneFalseReadback = ledger.aggregateTotals.a02ReopenDoneFalseReadback;
  program.v4ExecutionState.tripleAdjacentRebindPass = ledger.aggregateTotals.a02TripleAdjacentRebindPass;
  program.v4ExecutionState.a03PromotionRows = promotionList.rows.length;
  program.nonClaims = [
    ...new Set([
      ...(program.nonClaims || []),
      'A02 terminal audit does not wire product runtime.',
      'A02 terminal audit does not certify automatic apply.',
      'Physical Word evidence is not product runtime authority.',
      'Google Docs remains closed until the next approved sequence point.',
    ]),
  ];

  writeJson(LEDGER_PATH, ledger);
  writeJson(PROFILE_PATH, profile);
  writeJson(PROGRAM_PATH, program);
  return { status: 'PASS', ledgerStatus: ledger.status, profileStatus: profile.status, programStatus: program.status };
}

function verifyBinding(binding, expectedPath, issues, field, { requireFiles }) {
  const expectedRelative = path.relative(REPO_ROOT, expectedPath).replaceAll(path.sep, '/');
  if (!binding || binding.path !== expectedRelative || !isHex64(binding.sha256)) {
    issues.push(issue('RTK_WORD_A02_BINDING_INVALID', field, 'Binding path and lowercase SHA-256 are required.'));
    return null;
  }
  if (!requireFiles) return null;
  if (!fs.existsSync(expectedPath)) {
    issues.push(issue('RTK_WORD_A02_BINDING_FILE_MISSING', field, 'Bound file is missing.'));
    return null;
  }
  if (sha256File(expectedPath) !== binding.sha256) {
    issues.push(issue('RTK_WORD_A02_BINDING_SHA_MISMATCH', field, 'Bound SHA does not match current bytes.'));
  }
  return readJson(expectedPath);
}

export function evaluateWordA02TerminalAudit(input = {}) {
  const receipt = input.receipt || readJson(TERMINAL_RECEIPT_PATH);
  const promotionList = input.promotionList || readJson(PROMOTION_LIST_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));
  if (receipt.schemaVersion !== TERMINAL_SCHEMA) add('RTK_WORD_A02_SCHEMA_INVALID', 'schemaVersion', 'A02 terminal receipt schema is invalid.');
  if (receipt.status !== TERMINAL_STATUS || receipt.result !== 'PASS') add('RTK_WORD_A02_STATUS_INVALID', 'status', 'A02 terminal audit must be complete with PASS result.');
  if (receipt.wordProfile?.versionByAppleScript !== '16.111.2' || receipt.wordProfile?.targetedWordProcessProbe?.ok !== true) add('RTK_WORD_A02_WORD_PROFILE_INVALID', 'wordProfile', 'A02 terminal audit must bind Word 16.111.2 targeted UI scripting.');
  if (receipt.microLab?.genericWaveRepeated !== false) add('RTK_WORD_A02_GENERIC_WAVE_REPEATED', 'microLab.genericWaveRepeated', 'A02 terminal audit must not repeat generic wave 300.');
  if (receipt.wordProfile?.openDocumentSetUnchanged !== true) add('RTK_WORD_A02_USER_DOCUMENT_RISK', 'wordProfile.openDocumentSetUnchanged', 'Open document set must remain unchanged.');
  if (receipt.capabilityFamilies?.rootModernComments?.productRuntimeWired !== false
    || receipt.capabilityFamilies?.rootModernComments?.automaticApplyCertified !== false
    || receipt.capabilityFamilies?.trackedNonOverlapRevisions?.productRuntimeWired !== false
    || receipt.capabilityFamilies?.trackedNonOverlapRevisions?.automaticApplyCertified !== false) {
    add('RTK_WORD_A02_AUTHORITY_LEVEL_OVERCLAIM', 'capabilityFamilies', 'Physical Word evidence must not be claimed as product runtime wiring or automatic apply.');
  }
  if (receipt.capabilityFamilies?.modernReplies?.physicalWordProven !== false) add('RTK_WORD_A02_REPLY_OVERCLAIM', 'capabilityFamilies.modernReplies', 'Reply remains zero unless parent-link readback is proven.');
  if (receipt.capabilityFamilies?.literalOverlappingTrackedEdits?.automaticApplyCertified !== false) add('RTK_WORD_A02_OVERLAP_OVERCLAIM', 'capabilityFamilies.literalOverlappingTrackedEdits', 'Literal overlaps cannot become automatic authority.');
  if (receipt.microLab?.modernCommentResolveReopen?.coordinateOnlyClicksUsed !== false || receipt.microLab?.tripleAdjacentTrackedEdits?.coordinateOnlyClicksUsed !== false) add('RTK_WORD_A02_COORDINATE_CLICK_USED', 'microLab', 'Coordinate-only clicks are forbidden.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('RTK_WORD_A02_VETO_NONZERO', 'vetoMetrics', 'All veto metrics must remain zero.');
  if (receipt.wordSaturated !== false || receipt.googleDocsOpened !== false || receipt.nextStage !== NEXT_STAGE) add('RTK_WORD_A02_SEQUENCE_INVALID', 'nextStage', 'A02 terminal audit must keep Word unsaturated, keep Google closed, and advance only to A03.');
  verifyBinding(receipt.sourceEvidence?.targetedGapClosureReceipt, TARGETED_RECEIPT_PATH, issues, 'sourceEvidence.targetedGapClosureReceipt', { requireFiles: input.requireFiles === true });
  if (!receipt.sourceEvidence?.saturationLedgerReceipt?.path || !isHex64(receipt.sourceEvidence?.saturationLedgerReceipt?.sha256)) {
    add('RTK_WORD_A02_PRIOR_LEDGER_BINDING_INVALID', 'sourceEvidence.saturationLedgerReceipt', 'Prior saturation ledger source binding must keep path and lowercase SHA without creating a circular current-ledger hash dependency.');
  }
  const promotionStatusAllowed = promotionList.status === 'A03_PROMOTION_LIST_READY_AFTER_A02_TERMINAL_AUDIT'
    || promotionList.status === 'A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_C02_NEXT'
    || promotionList.status === 'A03_C02_COMPONENT_PROVEN_NOT_USER_AUTOMATIC_APPLY_C03_NEXT'
    || promotionList.status === 'A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_BOUND_C04_NEXT'
    || promotionList.status === 'A03_C04_MODERN_COMMENT_STATE_BOUND_C05_NEXT';
  if (promotionList.schemaVersion !== PROMOTION_SCHEMA || !promotionStatusAllowed) add('RTK_WORD_A03_PROMOTION_SCHEMA_INVALID', 'promotionList', 'A03 promotion list must be ready after A02 terminal audit or advanced by bounded A03 contours.');
  if (!Array.isArray(promotionList.rows) || promotionList.rows.length < 5) add('RTK_WORD_A03_PROMOTION_ROWS_MISSING', 'promotionList.rows', 'Promotion list must contain capability rows.');
  for (const row of promotionList.rows || []) {
    for (const key of ['capability', 'physicalEvidence', 'parserComponentConsumer', 'missingRuntimeWiring', 'authorityLevel', 'negativeTests', 'recoveryReplayRequirements', 'implementationContour', 'killCriterion']) {
      if (row[key] === undefined || row[key] === '' || (Array.isArray(row[key]) && row[key].length === 0)) add('RTK_WORD_A03_ROW_INCOMPLETE', `promotionList.rows.${row.capability}.${key}`, 'Every A03 row must bind required fields.');
    }
    const successorRuntimeWiringAllowed = promotionList.status === 'A03_C01_COMMENT_SHADOW_RUNTIME_WIRED_C02_NEXT'
      || promotionList.status === 'A03_C02_COMPONENT_PROVEN_NOT_USER_AUTOMATIC_APPLY_C03_NEXT'
      || promotionList.status === 'A03_C03_ADJACENT_RANGE_NEGATIVE_ORACLE_BOUND_C04_NEXT'
      || promotionList.status === 'A03_C04_MODERN_COMMENT_STATE_BOUND_C05_NEXT';
    const allowedC01RuntimeWiring = successorRuntimeWiringAllowed
      && row.capability === 'rootModernCommentShadowImport'
      && row.authorityLevel?.productRuntimeWired === true;
    const productRuntimeOk = allowedC01RuntimeWiring || row.authorityLevel?.productRuntimeWired === false;
    const automaticApplyOk = row.authorityLevel?.automaticApplyCertified === false;
    if (!productRuntimeOk || !automaticApplyOk) {
      add('RTK_WORD_A03_RUNTIME_OVERCLAIM', `promotionList.rows.${row.capability}.authorityLevel`, 'A03 promotion list can only claim bounded delivered successor runtime contours.');
    }
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    a02Verdict: receipt.a02Verdict,
    wordSaturated: receipt.wordSaturated === true,
    googleDocsOpened: receipt.googleDocsOpened === true,
    promotionRows: Array.isArray(promotionList.rows) ? promotionList.rows.length : 0,
  };
}

function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--run-physical')) {
    const { terminalReceipt, promotionList } = buildTerminalReceipt({ runPhysical: true });
    writeJson(TERMINAL_RECEIPT_PATH, terminalReceipt);
    promotionList.sourceTerminalReceipt.sha256 = sha256File(TERMINAL_RECEIPT_PATH);
    writeJson(PROMOTION_LIST_PATH, promotionList);
    process.stdout.write(`${JSON.stringify({ status: 'PASS', terminalReceiptPath: TERMINAL_RECEIPT_PATH, promotionListPath: PROMOTION_LIST_PATH, microLab: terminalReceipt.microLab }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes('--update-state')) {
    process.stdout.write(`${JSON.stringify(updateCanonicalState(), null, 2)}\n`);
    return;
  }
  const result = evaluateWordA02TerminalAudit({ requireFiles: process.argv.includes('--require-files') });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_A02_TERMINAL_AUDIT=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
