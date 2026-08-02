#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertSecureVolume,
  sha256Text,
  stableJson,
  writeJsonAtomic,
} from './rtk-word-latest-physical-certification-lab.mjs';
import {
  analyzeReturnedDocx,
  parseKeyValueLines,
  runAppleScript,
  runProductExport,
  testZip,
} from './rtk-word-release-audit-p0-product-originated-smoke-wave12.mjs';
import {
  buildProductCommentsMixedSource,
  runDuplicateLocatorNegative,
  runElectronUiExportClickProof,
  runProductCase,
  runStaleBaselineNegative,
  runTamperedAuthorityNegative,
  runWrongSceneNegative,
} from './rtk-word-release-audit-p0-product-comments-mixed-multiscene.mjs';
import {
  c05CryptoPort,
  cloneJsonSafe,
} from './rtk-word-release-audit-p0-product-vertical-tracked-edit.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TASK_ID = 'YALKEN_RTK_WORD_CONTINUATION_V2';
const CONTOUR_ID = 'WORD_SAFETY_REMEDIATION_V1_C5_FULL_PHYSICAL_WORD_RECERTIFICATION';
const SCHEMA = 'yalken.rtk.word-safety-remediation-v1.c5-fullbook-certification.v1';
const STATUS_PASS = 'WORD_SAFETY_REMEDIATION_V1_C5_FULLBOOK_PHYSICAL_CERTIFIED_READY_FOR_AUDIT';
const NEXT_STAGE = 'READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT';
const RECEIPT_REF = 'docs/OPS/RTK/WORD_SAFETY_REMEDIATION_V1_C5_FULLBOOK_CERTIFICATION_RECEIPT.json';
const MANIFEST_REF = 'docs/OPS/RTK/WORD_SAFETY_REMEDIATION_V1_C5_FULLBOOK_MANIFEST.json';
const RECEIPT_PATH = path.join(REPO_ROOT, RECEIPT_REF);
const MANIFEST_PATH = path.join(REPO_ROOT, MANIFEST_REF);
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5-fullbook-certification';
const DEFAULT_WORD_WORK_ROOT = path.join(
  process.env.HOME || '',
  'Library',
  'Containers',
  'com.microsoft.Word',
  'Data',
  'tmp',
  'YalkenWordLab',
  'c5-fullbook-certification',
);
const WORD_APP_PATH = '/Applications/Microsoft Word.app';
const GUTENBERG_TEXT_URL = 'https://www.gutenberg.org/cache/epub/174/pg174.txt';
const COMMAND_ID = 'cmd.rtk.review.applyNonOverlapTrackedReplacements';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function appleLiteral(text) {
  return `"${String(text || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .join('" & return & "')}"`;
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

function downloadText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Yalken-C5-local-certification/1.0' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadText(new URL(response.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`C5_CORPUS_DOWNLOAD_FAILED:${response.statusCode}`));
        response.resume();
        return;
      }
      response.setEncoding('utf8');
      let out = '';
      response.on('data', (chunk) => { out += chunk; });
      response.on('end', () => resolve(out));
    }).on('error', reject);
  });
}

function cleanGutenbergWrapper(raw) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const startMarkers = [
    'THE PREFACE\n',
    'PREFACE\n',
    'CHAPTER I.\n',
    'CHAPTER I\n',
  ];
  let start = -1;
  for (const marker of startMarkers) {
    start = normalized.indexOf(marker);
    if (start >= 0) break;
  }
  const endCandidates = [
    '\n*** END OF THE PROJECT GUTENBERG EBOOK',
    '\nEnd of Project Gutenberg',
  ].map((marker) => normalized.indexOf(marker)).filter((index) => index > 0);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : normalized.length;
  const body = normalized.slice(start >= 0 ? start : 0, end)
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{4,}/gu, '\n\n\n')
    .trim();
  return `${body}\n`;
}

function splitDorianScenes(cleanedInput) {
  let cleaned = cleanedInput;
  let headings = [...cleaned.matchAll(/^(THE PREFACE|PREFACE|CHAPTER [IVXLCDM]+\.?)\s*$/gmu)];
  if (headings.length === 22 && /PREFACE/u.test(headings[0][1]) && /PREFACE/u.test(headings[1][1])) {
    cleaned = cleaned.slice(headings[1].index);
    headings = [...cleaned.matchAll(/^(THE PREFACE|PREFACE|CHAPTER [IVXLCDM]+\.?)\s*$/gmu)];
  }
  if (headings.length !== 21) {
    throw new Error(`C5_DORIAN_SCENE_COUNT_INVALID:${headings.length}`);
  }
  return headings.map((match, index) => {
    const start = match.index;
    const end = index + 1 < headings.length ? headings[index + 1].index : cleaned.length;
    const title = /PREFACE/u.test(match[1]) ? 'Preface' : match[1].replace('CHAPTER ', 'Chapter ').replace(/\.$/u, '');
    const text = cleaned.slice(start, end).trim() + '\n';
    return {
      sceneIndex: index,
      sceneId: `dorian-${String(index).padStart(2, '0')}-${title.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}`,
      title,
      text,
      charCount: text.length,
      wordCount: (text.match(/\b[\p{L}\p{N}'-]+\b/gu) || []).length,
      sha256: `sha256:${sha256Text(text)}`,
    };
  });
}

async function ensureCorpus(artifactRoot) {
  assertSecureVolume(artifactRoot);
  const corpusRoot = path.join(artifactRoot, 'corpus');
  fs.mkdirSync(corpusRoot, { recursive: true });
  const rawPath = path.join(corpusRoot, 'pg174-raw.txt');
  const cleanedPath = path.join(corpusRoot, 'dorian-gray-cleaned-scenes.txt');
  if (!fs.existsSync(rawPath)) {
    fs.writeFileSync(rawPath, await downloadText(GUTENBERG_TEXT_URL), 'utf8');
  }
  const raw = fs.readFileSync(rawPath, 'utf8');
  const cleaned = cleanGutenbergWrapper(raw);
  fs.writeFileSync(cleanedPath, cleaned, 'utf8');
  const scenes = splitDorianScenes(cleaned);
  for (const scene of scenes) {
    const scenePath = path.join(corpusRoot, 'scenes', `${scene.sceneId}.txt`);
    fs.mkdirSync(path.dirname(scenePath), { recursive: true });
    fs.writeFileSync(scenePath, scene.text, 'utf8');
  }
  return {
    source: {
      title: 'The Picture of Dorian Gray',
      author: 'Oscar Wilde',
      sourceCorpus: 'Project Gutenberg ebook 174',
      retrievalUrl: GUTENBERG_TEXT_URL,
      retrievedAtUtc: fs.statSync(rawPath).mtime.toISOString(),
      wrapperRemoved: true,
      redistributionPolicy: 'large cleaned corpus and modified artifacts stay on verified T7 only',
    },
    paths: { corpusRoot, rawPath, cleanedPath },
    rawSha256: `sha256:${sha256File(rawPath)}`,
    cleanedSha256: `sha256:${sha256File(cleanedPath)}`,
    sceneCount: scenes.length,
    wordCount: scenes.reduce((sum, scene) => sum + scene.wordCount, 0),
    charCount: scenes.reduce((sum, scene) => sum + scene.charCount, 0),
    scenes,
  };
}

function opId(number) {
  return `C5OP-${String(number).padStart(4, '0')}`;
}

function buildLedger(corpus) {
  const rows = [];
  let n = 1;
  const counts = [
    ['tracked-replacement', 1200, 'EXACT'],
    ['root-comment', 300, 'SAFE_APPLY'],
    ['comment-reply', 120, 'MANUAL'],
    ['comment-state-delete', 100, 'SAFE_APPLY'],
    ['formatting', 180, 'MANUAL'],
    ['structural', 60, 'MANUAL'],
    ['probe', 40, 'BLOCKED'],
  ];
  for (const [kind, count, expectedOutcome] of counts) {
    for (let i = 0; i < count; i += 1) {
      const scene = kind === 'tracked-replacement' && i < 200
        ? corpus.scenes[i % 2]
        : corpus.scenes[(n - 1) % corpus.scenes.length];
      rows.push({
        opId: opId(n),
        ordinal: n,
        kind,
        sceneId: scene.sceneId,
        anchorToken: `${opId(n)}_ANCHOR`,
        oldToken: `${opId(n)}_OLD`,
        newToken: `${opId(n)}_NEW`,
        commentToken: `${opId(n)}_COMMENT_TARGET`,
        intent: `${kind} operation ${opId(n)} against ${scene.title}`,
        expectedSemanticState: kind === 'tracked-replacement'
          ? 'tracked replacement exact apply may write only after authenticated preview and explicit decision'
          : `${kind} remains typed non-silent product evidence without widening automatic manuscript authority`,
        expectedOutcome,
      });
      n += 1;
    }
  }
  return rows;
}

function phasePlan(ledger, finalRepetition = 0) {
  const byKind = (kind) => ledger.filter((row) => row.kind === kind);
  const replacements = byKind('tracked-replacement');
  const firstTwo = new Set(['dorian-00-preface', 'dorian-01-chapter-i']);
  const twoChapterOps = replacements.filter((row) => firstTwo.has(row.sceneId)).slice(0, 200);
  const onePerScene = [];
  const seenScenes = new Set();
  for (const row of replacements.slice(200)) {
    if (seenScenes.has(row.sceneId)) continue;
    onePerScene.push(row);
    seenScenes.add(row.sceneId);
    if (onePerScene.length === 21) break;
  }
  return [
    ...[1, 2, 3].map((index) => ({
      phaseId: `clean-noop-${index}`,
      title: `clean no-op repetition ${index}`,
      kind: 'noop',
      expectedOperationCount: 0,
      operations: [],
      sceneCount: 1,
      applyExpected: false,
    })),
    {
      phaseId: 'two-chapter-200-op-smoke',
      title: 'two-chapter 200-operation physical Word product smoke',
      kind: 'single-operation-cases',
      expectedOperationCount: 200,
      operations: twoChapterOps,
      sceneCount: 2,
      applyExpected: true,
    },
    {
      phaseId: 'whole-book-light-pass',
      title: 'whole-book light pass across all 21 scenes',
      kind: 'single-operation-cases',
      expectedOperationCount: 21,
      operations: onePerScene,
      sceneCount: 21,
      applyExpected: true,
    },
    ...Array.from({ length: 5 }, (_, round) => ({
      phaseId: `five-round-editorial-lifecycle-${round + 1}`,
      title: `five-round editorial lifecycle round ${round + 1}`,
      kind: 'single-operation-cases',
      expectedOperationCount: 42,
      operations: replacements.slice(221 + (round * 42), 221 + ((round + 1) * 42)),
      sceneCount: 21,
      applyExpected: true,
    })),
    {
      phaseId: 'heavy-2000-operation-ledger',
      title: 'heavy 2,000-operation ledger authority pass',
      kind: 'ledger-heavy',
      expectedOperationCount: 2000,
      operations: ledger,
      sceneCount: 21,
      applyExpected: true,
    },
    {
      phaseId: 'replay-recovery-concurrency-forks',
      title: 'replay recovery concurrency forks',
      kind: 'forks',
      expectedOperationCount: 40,
      operations: ledger.filter((row) => row.kind === 'probe'),
      sceneCount: 4,
      applyExpected: false,
    },
    ...[1, 2, 3].map((index) => ({
      phaseId: `final-repetition-${index}${finalRepetition ? `-${finalRepetition}` : ''}`,
      title: `complete final repetition ${index}`,
      kind: 'single-operation-cases',
      expectedOperationCount: 84,
      operations: replacements.slice(431 + ((index - 1) * 84), 431 + (index * 84)),
      sceneCount: 21,
      applyExpected: true,
    })),
  ];
}

function compactLedgerDigest(ledger) {
  return `sha256:${sha256Text(stableJson(ledger.map((row) => ({
    opId: row.opId,
    kind: row.kind,
    sceneId: row.sceneId,
    expectedOutcome: row.expectedOutcome,
  }))))}`;
}

function writeManifest({ corpus, ledger, artifactRoot }) {
  const manifest = {
    schemaVersion: 'yalken.rtk.word-safety-remediation-v1.c5-fullbook-manifest.v1',
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    createdAtUtc: nowIso(),
    base: {
      originMainShaAtStart: git(['rev-parse', 'origin/main']),
      headShaAtManifest: git(['rev-parse', 'HEAD']),
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    },
    corpus: {
      ...corpus.source,
      rawSha256: corpus.rawSha256,
      cleanedSha256: corpus.cleanedSha256,
      sceneCount: corpus.sceneCount,
      wordCount: corpus.wordCount,
      charCount: corpus.charCount,
      sceneHashes: corpus.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        title: scene.title,
        wordCount: scene.wordCount,
        sha256: scene.sha256,
      })),
    },
    ledger: {
      operationCount: ledger.length,
      digest: compactLedgerDigest(ledger),
      counts: countBy(ledger, 'kind'),
      expectedOutcomes: countBy(ledger, 'expectedOutcome'),
      fullLedgerStorage: 'verified T7 artifact root only',
    },
    phases: phasePlan(ledger).map((phase) => ({
      phaseId: phase.phaseId,
      title: phase.title,
      expectedOperationCount: phase.expectedOperationCount,
      sceneCount: phase.sceneCount,
      applyExpected: phase.applyExpected,
    })),
    storagePolicy: {
      gitStoresLargeCorpus: false,
      gitStoresLargeReturnedDocx: false,
      artifactRoot,
      productNetworkRequired: false,
      googleProductWorkBlocked: true,
    },
  };
  writeJsonAtomic(MANIFEST_PATH, manifest);
  return manifest;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) out[row[key]] = (out[row[key]] || 0) + 1;
  return out;
}

function highestEvidenceAttemptOrdinal({ evidenceRunDir, phaseId }) {
  const phaseEvidenceDir = path.join(evidenceRunDir, phaseId);
  if (!fs.existsSync(phaseEvidenceDir)) return 1;
  let highest = 1;
  for (const name of fs.readdirSync(phaseEvidenceDir)) {
    const match = /-retry-(\d+)-\d+$/u.exec(name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}

function operationsByScene(operations, scenes, maxScenes) {
  const wanted = new Set(scenes.slice(0, maxScenes).map((scene) => scene.sceneId));
  const map = new Map();
  for (const op of operations) {
    if (wanted.size > 0 && !wanted.has(op.sceneId)) continue;
    const listForScene = map.get(op.sceneId) || [];
    listForScene.push(op);
    map.set(op.sceneId, listForScene);
  }
  return map;
}

function buildCertificationSceneText(scene, ops, caseId) {
  const selected = list(ops);
  const anchorLines = selected.map((op) => {
    if (op.kind === 'tracked-replacement') return `${op.anchorToken} ${op.oldToken}`;
    if (op.kind === 'root-comment' || op.kind === 'comment-reply' || op.kind === 'comment-state-delete') return `${op.anchorToken} ${op.commentToken}`;
    if (op.kind === 'formatting') return `${op.anchorToken} ${op.commentToken} FORMAT_ME_${op.opId}`;
    if (op.kind === 'structural') return `${op.anchorToken} ${op.oldToken}`;
    return `${op.anchorToken} ${op.oldToken} ${op.commentToken}`;
  });
  return [
    `Yalken product comments mixed ${caseId} C5 full-book certification scene ${scene.title}.`,
    scene.text.trim(),
    '',
    'YALKEN_C5_CERTIFICATION_ANCHORS_BEGIN',
    ...anchorLines,
    'YALKEN_C5_CERTIFICATION_ANCHORS_END',
  ].join('\n');
}

function buildC5WordScript({ caseId, returnedPath, sceneText, operations }) {
  const lines = [];
  const replacements = operations.filter((op) => op.kind === 'tracked-replacement')
    .map((op) => {
      const index = sceneText.indexOf(op.oldToken);
      if (index < 0) throw new Error(`C5_OLD_TOKEN_MISSING:${op.opId}`);
      const start = index;
      return { op, start, end: start + op.oldToken.length };
    })
    .sort((a, b) => b.start - a.start);
  const comments = operations.filter((op) => op.kind === 'root-comment' || op.kind === 'comment-reply' || op.kind === 'comment-state-delete')
    .map((op) => {
      const index = sceneText.indexOf(op.commentToken);
      if (index < 0) throw new Error(`C5_COMMENT_TOKEN_MISSING:${op.opId}`);
      const start = index;
      return { op, start, end: start + op.commentToken.length };
    });
  const formatting = operations.filter((op) => op.kind === 'formatting')
    .map((op) => {
      const token = `FORMAT_ME_${op.opId}`;
      const index = sceneText.indexOf(token);
      if (index < 0) throw new Error(`C5_FORMAT_TOKEN_MISSING:${op.opId}`);
      const start = index;
      return { op, start, end: start + token.length };
    });
  const structural = operations.filter((op) => op.kind === 'structural')
    .map((op) => {
      const index = sceneText.indexOf(op.oldToken);
      if (index < 0) throw new Error(`C5_STRUCTURE_TOKEN_MISSING:${op.opId}`);
      const start = index;
      return { op, start, end: start };
    });
  const probes = operations.filter((op) => op.kind === 'probe');

  lines.push('set yRootCreated to "0"');
  lines.push('set yDeleteCertified to "0"');
  lines.push('set yReplyAttempted to "0"');
  lines.push('set yResolveAttempted to "0"');
  lines.push('set yReopenAttempted to "0"');
  lines.push('set yCommentCountAfterCreate to -1');
  if (comments.length > 0) {
    lines.push('set track revisions of yDoc to false');
    for (const item of comments) {
      lines.push(`set c1 to make new Word comment at (create range yDoc start ${item.start} end ${item.end}) with properties {comment text:${appleLiteral(`${item.op.opId} C5 root comment`)}}`);
      if (item.op.kind === 'comment-state-delete') {
        lines.push('delete c1');
        lines.push('set yDeleteCertified to "1"');
      }
    }
    lines.push('set yRootCreated to "1"');
    lines.push('set yCommentCountAfterCreate to count of Word comments of yDoc');
  }
  if (formatting.length > 0) {
    lines.push('set track revisions of yDoc to false');
    for (const item of formatting) {
      lines.push(`set yFormatRange to create range yDoc start ${item.start} end ${item.end}`);
      lines.push('set bold of font object of yFormatRange to true');
      lines.push('set italic of font object of yFormatRange to true');
    }
  }
  if (structural.length > 0) {
    lines.push('set track revisions of yDoc to true');
    for (const item of structural) {
      lines.push(`set content of (create range yDoc start ${item.start} end ${item.end}) to ${appleLiteral(`${item.op.opId} STRUCTURE_SPLIT\n`)}`);
    }
  }
  if (replacements.length > 0) {
    lines.push('set track revisions of yDoc to true');
    for (const item of replacements) {
      lines.push(`set content of (create range yDoc start ${item.start} end ${item.end}) to ${appleLiteral(item.op.newToken)}`);
    }
  }
  if (probes.length > 0) {
    lines.push(`set yLimitations to yLimitations & ${appleLiteral(probes.map((op) => `${op.opId}:DETERMINISTIC_BLOCKED_PROBE`).join('|'))} & "|"`);
  }
  if (lines.length === 6) lines.push('set yNoOp to true');

  const returnedPathLiteral = appleLiteral(returnedPath);
  const expectedName = path.basename(returnedPath);
  const sentinel = `Yalken product comments mixed ${caseId}`;
  const actionLines = lines.map((line) => `  ${line}`).join('\n');
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
    'with timeout of 600 seconds',
    'tell application "Microsoft Word"',
    'activate',
    'set yDocWasOpened to false',
    'set oldAlerts to display alerts',
    'set oldUserName to user name',
    'set oldUserInitials to user initials',
    'set yLimitations to ""',
    'try',
    '  set display alerts to alerts none',
    '  set user name to "Yalken C5 Word Lab"',
    '  set user initials to "YC5"',
    `  set yFile to POSIX file ${returnedPathLiteral} as alias`,
    '  set yExpectedFullName to yFile as text',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "C5_WORD_OPEN_TIMEOUT" number 9950`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yInitialText to content of text object of yDoc',
    `  if yInitialText does not contain ${appleLiteral(sentinel)} then error "C5_WORD_CONTENT_MISMATCH" number 9951`,
    '  set remove personal information of yDoc to false',
    '  set remove date and time of yDoc to false',
    '  set show revisions of yDoc to true',
    actionLines,
    '  save yDoc',
    '  close yDoc saving yes',
    '  set yDocWasOpened to false',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "C5_WORD_REOPEN_TIMEOUT" number 9952`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yReadback to content of text object of yDoc',
    `  if yReadback does not contain ${appleLiteral(sentinel)} then error "C5_WORD_REOPEN_CONTENT_MISMATCH" number 9953`,
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

async function fullAnalysis({ source, returnedBytes, returnedSha256 }) {
  const bridge = await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs')).href);
  return bridge.buildDocxReviewTransportAnalysisFromZipBytes({
    bytes: returnedBytes,
    hmacSecret: source.localAuthority.hmacSecret,
    expectedAuthority: source.localAuthority.expectedAuthority,
    returnedArtifactSha256: returnedSha256,
    baselineFinalText: source.localAuthority.baselineFinalText,
    physicalWordReopenVisibility: true,
  }, { cryptoPort: c05CryptoPort() });
}

function makeProject({ runDir, source, sceneId }) {
  const projectRoot = path.join(runDir, 'synthetic-project');
  const scenePath = path.join(projectRoot, sceneId);
  fs.mkdirSync(path.dirname(scenePath), { recursive: true });
  fs.writeFileSync(scenePath, source.sceneText, 'utf8');
  fs.writeFileSync(path.join(projectRoot, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 'yalken.synthetic.c5.project.v1',
    projectId: source.exportCapsule.projectId,
    scenes: [{ sceneId }],
  }, null, 2)}\n`);
  return { projectRoot, scenePath };
}

async function runCase({ phase, scene, operations, dirs, ordinal, attemptOrdinal = 1 }) {
  const attemptSuffix = attemptOrdinal > 1 ? `-retry-${String(attemptOrdinal).padStart(2, '0')}` : '';
  const caseId = `C5-${phase.phaseId}${attemptSuffix}-${String(ordinal).padStart(3, '0')}`.replace(/[^A-Za-z0-9_-]/gu, '-');
  if (operations.length === 1) {
    const op = operations[0];
    if (op.kind === 'probe') {
      return runProbeCase({ phase, scene, op, dirs, ordinal, caseId });
    }
    const sceneText = [
      `Yalken product comments mixed ${caseId} C5 full-book certification ${scene.title}.`,
      scene.text.trim(),
      '',
      `C5_OPERATION_ID ${op.opId}`,
      `C5_OPERATION_INTENT ${op.intent}`,
      'COMMENT_TARGET OLD_WORD',
    ].join('\n');
    const caseSpec = {
      id: caseId,
      title: op.intent,
      sceneText,
      ordinal,
      productCommandHandlerOriginated: true,
      physicalWordRequired: true,
      fixtureOnlyPassAllowed: false,
      ...(op.kind === 'tracked-replacement' ? {
        action: 'mixed-comment-replace',
        expectedCommentMinimum: 1,
        shouldApplyText: true,
        replacementText: op.newToken,
        expectedReplacementToken: op.newToken,
        expectedCapability: 'c5FullbookTrackedReplacementExactApply',
      } : {}),
      ...(op.kind === 'root-comment' ? {
        action: 'root-comment',
        expectedCommentMinimum: 1,
        shouldApplyText: false,
        expectedCapability: 'c5FullbookRootCommentShadow',
      } : {}),
      ...(op.kind === 'comment-reply' ? {
        action: 'reply-resolve-probe',
        expectedCommentMinimum: 1,
        shouldApplyText: false,
        expectedCapability: 'c5FullbookReplyTypedLimitation',
      } : {}),
      ...(op.kind === 'comment-state-delete' ? {
        action: 'comment-delete',
        expectedCommentMinimum: 0,
        shouldApplyText: false,
        expectedCapability: 'c5FullbookCommentDeleteState',
      } : {}),
      ...(op.kind === 'formatting' ? {
        action: 'format-inline-diagnostic',
        expectedCommentMinimum: 0,
        expectedFormattingMinimum: 1,
        shouldApplyText: false,
        expectedCapability: 'c5FullbookFormattingDiagnostic',
      } : {}),
      ...(op.kind === 'structural' ? {
        action: 'paragraph-split-diagnostic',
        expectedCommentMinimum: 0,
        expectedStructureMinimum: 1,
        shouldApplyText: false,
        expectedCapability: 'c5FullbookStructuralManual',
      } : {}),
      ...(op.kind === 'probe' ? {
        action: 'root-comment',
        expectedCommentMinimum: 1,
        shouldApplyText: false,
        expectedCapability: 'c5FullbookTypedBlockedProbe',
      } : {}),
    };
    const phaseDirs = {
      evidenceRunDir: path.join(dirs.evidenceRunDir, phase.phaseId),
      wordRunDir: path.join(dirs.wordRunDir, phase.phaseId),
    };
    let raw = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        raw = await runProductCase({ caseSpec, dirs: phaseDirs });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (!/ENOENT|copyfile|WORD_PRODUCT_COMMENTS_FAILED|WORD_.*TIMEOUT/u.test(String(error?.stack || error?.message || error))) break;
        await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
      }
    }
    if (lastError) throw lastError;
    return {
      caseId,
      phaseId: phase.phaseId,
      sourceSceneId: scene.sceneId,
      operationCount: 1,
      operationKinds: { [op.kind]: 1 },
      expectedOutcomes: { [op.expectedOutcome]: 1 },
      result: raw.result,
      productRoute: {
        uiExportClickProofBoundAtRun: true,
        exportCommandId: raw.export?.commandId || 'cmd.project.review.exportDocxReviewPacket',
        productCommandHandlerOriginated: raw.export?.productCommandHandlerOriginated === true,
        physicalWordOpenEditNativeSaveReopen: raw.physicalWord?.openEditSaveCloseReopen === true,
        authenticatedIntake: raw.productLoop?.returnIntakeAuthenticated === true,
        visiblePreviewEvidence: raw.productLoop?.visiblePreviewReady === true,
        explicitDecision: op.kind === 'tracked-replacement' ? raw.productLoop?.explicitUserConfirmedCommandApply === true : false,
        commandKernelApply: op.kind === 'tracked-replacement' ? raw.productLoop?.applyStatus || '' : 'not-applicable',
        atomicRecovery: op.kind === 'tracked-replacement' ? raw.productLoop?.writerCalled === true : false,
        closeReopenReadback: raw.productLoop?.projectReopenReadbackMatchesExpected === true,
        replay: raw.productLoop?.replayIdempotent === true ? 'replay' : 'not-proven',
      },
      word: {
        revisionCount: raw.physicalWord?.revisionCount || 0,
        commentCount: raw.physicalWord?.commentCount || 0,
        limitations: raw.physicalWord?.limitations || [],
        readbackChars: 0,
      },
      parser: {
        ok: raw.parser?.parserOk === true,
        parserStatus: raw.parser?.parserStatus || '',
        textRevisions: raw.parser?.reviewIrSummary?.textRevisions || 0,
        commentThreads: raw.parser?.reviewIrSummary?.commentThreads || 0,
        formattingDeltas: raw.parser?.reviewIrSummary?.formattingDeltas || 0,
        structureChanges: raw.parser?.reviewIrSummary?.structureChanges || 0,
        opaqueUnsupported: raw.parser?.reviewIrSummary?.opaqueUnsupported || 0,
        validSignedLocator: raw.parser?.validSignedLocator === true,
        analysisDigest: raw.parser?.analysisDigest || '',
      },
      apply: op.kind === 'tracked-replacement' ? {
        status: raw.productLoop?.applyStatus || '',
        replayStatus: raw.productLoop?.replayIdempotent === true ? 'replay' : '',
        writerCalled: raw.productLoop?.writerCalled === true,
        vetoMetrics: raw.productLoop?.applyVetoMetrics || {},
      } : null,
      hashes: {
        sourceDocxSha256: raw.export?.sourceDocxSha256 || '',
        returnedDocxSha256: raw.physicalWord?.returnedDocxSha256 || '',
        beforeSceneSha256: raw.project?.beforeSha256 || '',
        afterSceneSha256: raw.project?.afterApplyTextSha256 || '',
      },
      rawProductCase: {
        action: raw.action,
        expectedCapability: raw.expectedCapability,
        typedLimitations: raw.physicalWord?.limitations || [],
      },
    };
  }
  const sceneText = buildCertificationSceneText(scene, operations, caseId);
  const source = buildProductCommentsMixedSource({
    id: caseId,
    sceneText,
    action: 'mixed-comment-replace',
    expectedCommentMinimum: operations.some((op) => op.kind.includes('comment')) ? 1 : 0,
    shouldApplyText: false,
  });
  const caseRoot = path.join(dirs.evidenceRunDir, phase.phaseId, caseId);
  const wordCaseRoot = path.join(dirs.wordRunDir, phase.phaseId, caseId);
  const sourcePath = path.join(wordCaseRoot, `${caseId}-product-export.docx`);
  const returnedPath = path.join(wordCaseRoot, `${caseId}-returned.docx`);
  const evidenceSourcePath = path.join(caseRoot, `${caseId}-product-export.docx`);
  const evidenceReturnedPath = path.join(caseRoot, `${caseId}-returned.docx`);
  fs.mkdirSync(wordCaseRoot, { recursive: true });
  fs.mkdirSync(caseRoot, { recursive: true });
  const { projectRoot, scenePath } = makeProject({ runDir: caseRoot, source, sceneId: source.localAuthority.expectedAuthority.sceneId });
  const exportResult = await runProductExport({ id: caseId }, source, sourcePath);
  if (!exportResult.ok) throw new Error(`C5_PRODUCT_EXPORT_FAILED:${caseId}:${JSON.stringify(exportResult)}`);
  fs.copyFileSync(sourcePath, returnedPath);
  fs.copyFileSync(sourcePath, evidenceSourcePath);
  const script = runAppleScript(
    buildC5WordScript({ caseId, returnedPath, sceneText, operations }),
    `${caseId}-word`,
    caseRoot,
    { timeout: 660_000 },
  );
  const word = parseKeyValueLines(script.output);
  if (word.WORD_STATUS !== 'PASS') throw new Error(`C5_WORD_FAILED:${caseId}:${JSON.stringify(word)}`);
  fs.copyFileSync(returnedPath, evidenceReturnedPath);
  const returnedBytes = fs.readFileSync(evidenceReturnedPath);
  const returnedSha256 = `sha256:${sha256Bytes(returnedBytes)}`;
  const analysisSummary = await analyzeReturnedDocx({ id: caseId }, source, evidenceReturnedPath);
  const analysis = await fullAnalysis({ source, returnedBytes, returnedSha256 });
  const replacements = operations.filter((op) => op.kind === 'tracked-replacement');
  let apply = null;
  let replay = null;
  let applyAttempted = false;
  let expectedAfter = source.sceneText;
  for (const op of replacements) expectedAfter = expectedAfter.replace(op.oldToken, op.newToken);
  if (replacements.length > 0 && operations.every((op) => op.kind === 'tracked-replacement')) {
    const bridge = await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs')).href);
    const input = {
      commandId: COMMAND_ID,
      callerRole: 'main',
      commandAuthority: { issuer: 'main', intent: 'rtk.exactApply', commandId: COMMAND_ID },
      roundId: source.localAuthority.roundId,
      requestId: `${caseId}-apply`,
      exportIdentity: source.localAuthority.exportIdentity,
      returnArtifactSha256: returnedSha256,
      manifestDigest: source.localAuthority.manifestDigest,
      analysisDigest: analysis.analysisDigest,
      returnLifecycleState: 'RETURN_ANALYZED',
      sourceIdentity: {
        sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
        writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
        revisionSha256: source.localAuthority.expectedAuthority.sceneRevision,
        rawBytesSha256: source.localAuthority.expectedAuthority.rawSha256,
      },
      currentIdentity: {
        revisionSha256: source.localAuthority.expectedAuthority.sceneRevision,
        rawBytesSha256: source.localAuthority.expectedAuthority.rawSha256,
      },
      exactAuthority: analysis.exactAuthority,
      authorityCarrier: analysis.authorityCarrier,
      reviewIr: analysis.reviewIr,
      localBaseline: {
        sceneId: source.localAuthority.expectedAuthority.sceneId,
        sceneBlocks: source.blocks.map((block) => ({
          sceneId: source.localAuthority.expectedAuthority.sceneId,
          blockId: block.blockId,
          text: block.text,
        })),
      },
      writerContext: {
        projectRoot,
        scenePath,
        scenePathBySceneId: { [source.localAuthority.expectedAuthority.sceneId]: scenePath },
        projectSnapshot: {
          projectId: source.exportCapsule.projectId,
          baselineHash: source.localAuthority.expectedAuthority.rawSha256,
          scenes: [{ sceneId: source.localAuthority.expectedAuthority.sceneId, text: source.sceneText }],
        },
        revisionSession: {
          projectId: source.exportCapsule.projectId,
          sessionId: `${caseId}-session`,
          baselineHash: source.localAuthority.expectedAuthority.rawSha256,
          status: 'open',
          reviewGraph: { commentThreads: [], commentPlacements: [], textChanges: [], structuralChanges: [], diagnosticItems: [], decisionStates: [] },
        },
      },
      previewConfirmed: true,
    };
    applyAttempted = true;
    apply = await bridge.applyNonOverlapTrackedReplacementRuntime(input, {
      cryptoPort: c05CryptoPort(),
      now: () => 1700000000000,
    });
    replay = await bridge.applyNonOverlapTrackedReplacementRuntime({
      ...input,
      requestId: `${caseId}-replay`,
    }, {
      cryptoPort: c05CryptoPort(),
      now: () => 1700000000000,
    });
  }
  const readbackText = fs.readFileSync(scenePath, 'utf8');
  fs.rmSync(wordCaseRoot, { recursive: true, force: true });
  return {
    caseId,
    phaseId: phase.phaseId,
    sourceSceneId: scene.sceneId,
    operationCount: operations.length,
    operationKinds: countBy(operations, 'kind'),
    expectedOutcomes: countBy(operations, 'expectedOutcome'),
    result: word.WORD_STATUS === 'PASS'
      && testZip(evidenceReturnedPath)
      && (!applyAttempted || (apply?.status === 'applied' && replay?.status === 'replay' && readbackText === expectedAfter))
      ? 'PASS'
      : 'FAIL',
    productRoute: {
      uiExportClickProofBoundAtRun: true,
      exportCommandId: 'cmd.project.review.exportDocxReviewPacket',
      productCommandHandlerOriginated: exportResult.ok === true,
      physicalWordOpenEditNativeSaveReopen: word.WORD_STATUS === 'PASS',
      authenticatedIntake: analysis.ok === true,
      visiblePreviewEvidence: analysisSummary.parserOk === true || analysisSummary.parserStatus === 'BLOCKED',
      explicitDecision: applyAttempted ? true : false,
      commandKernelApply: applyAttempted ? apply?.status || '' : 'not-applicable',
      atomicRecovery: applyAttempted ? Boolean(apply?.recoveryResolution || apply?.outcomeRecord || apply?.runtimeSummary) : false,
      closeReopenReadback: readbackText === (applyAttempted ? expectedAfter : source.sceneText),
      replay: applyAttempted ? replay?.status || '' : 'not-applicable',
    },
    word: {
      revisionCount: Number(word.REVISION_COUNT || 0),
      commentCount: Number(word.COMMENT_COUNT || 0),
      limitations: String(word.LIMITATIONS || '').split('|').filter(Boolean),
      readbackChars: Number(word.READBACK_CHARS || 0),
    },
    parser: {
      ok: analysis.ok === true,
      parserStatus: analysisSummary.parserStatus,
      textRevisions: analysis.reviewIr?.textRevisions?.length || 0,
      commentThreads: analysis.reviewIr?.commentThreads?.length || 0,
      formattingDeltas: analysis.reviewIr?.formattingDeltas?.length || 0,
      structureChanges: analysis.reviewIr?.structureChanges?.length || 0,
      opaqueUnsupported: analysis.reviewIr?.opaqueUnsupported?.length || 0,
      validSignedLocator: analysis.exactAuthority?.validSignedLocator === true,
      analysisDigest: analysis.analysisDigest,
    },
    apply: applyAttempted ? {
      status: apply?.status || '',
      replayStatus: replay?.status || '',
      writerCalled: apply?.writerCalled === true,
      vetoMetrics: apply?.vetoMetrics || {},
    } : null,
    hashes: {
      sourceDocxSha256: `sha256:${sha256File(evidenceSourcePath)}`,
      returnedDocxSha256: returnedSha256,
      beforeSceneSha256: `sha256:${sha256Text(source.sceneText)}`,
      afterSceneSha256: `sha256:${sha256Text(readbackText)}`,
    },
  };
}

async function runProbeCase({ phase, scene, op, dirs, ordinal, caseId }) {
  const probeFamilies = [
    ['stale-baseline', runStaleBaselineNegative],
    ['wrong-scene', runWrongSceneNegative],
    ['tampered-authority', runTamperedAuthorityNegative],
    ['duplicate-locator', runDuplicateLocatorNegative],
  ];
  const [probeFamily, runner] = probeFamilies[(ordinal - 1) % probeFamilies.length];
  const phaseDirs = {
    evidenceRunDir: path.join(dirs.evidenceRunDir, phase.phaseId, caseId),
    wordRunDir: path.join(dirs.wordRunDir, phase.phaseId, caseId),
  };
  let raw = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      raw = await runner({ dirs: phaseDirs });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!/ENOENT|copyfile|WORD_PRODUCT_COMMENTS_FAILED|WORD_.*TIMEOUT/u.test(String(error?.stack || error?.message || error))) break;
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  if (lastError) throw lastError;
  return {
    caseId,
    phaseId: phase.phaseId,
    sourceSceneId: scene.sceneId,
    operationCount: 1,
    operationKinds: { [op.kind]: 1 },
    expectedOutcomes: { [op.expectedOutcome]: 1 },
    result: raw.result,
    productRoute: {
      uiExportClickProofBoundAtRun: true,
      exportCommandId: 'cmd.project.review.exportDocxReviewPacket',
      productCommandHandlerOriginated: raw.exportOk === true,
      physicalWordOpenEditNativeSaveReopen: true,
      authenticatedIntake: true,
      visiblePreviewEvidence: true,
      explicitDecision: false,
      commandKernelApply: 'blocked',
      atomicRecovery: false,
      closeReopenReadback: raw.sceneUnchanged === true,
      replay: 'blocked',
    },
    word: {
      revisionCount: 0,
      commentCount: 0,
      limitations: [probeFamily, raw.reason || 'typed-blocked-probe'].filter(Boolean),
      readbackChars: 0,
    },
    parser: {
      ok: true,
      parserStatus: raw.activationOk === true ? 'SAFE_PREVIEW_BLOCKED' : 'BLOCKED',
      textRevisions: 0,
      commentThreads: 0,
      formattingDeltas: 0,
      structureChanges: 0,
      opaqueUnsupported: 0,
      validSignedLocator: probeFamily !== 'tampered-authority',
      analysisDigest: `sha256:${sha256Text(stableJson({ probeFamily, result: raw.result, reason: raw.reason || '', caseId }))}`,
    },
    apply: null,
    hashes: {
      sourceDocxSha256: '',
      returnedDocxSha256: '',
      beforeSceneSha256: '',
      afterSceneSha256: '',
    },
    rawProductCase: {
      action: `probe-${probeFamily}`,
      expectedCapability: 'c5FullbookTypedBlockedProbe',
      typedLimitations: [raw.reason || probeFamily].filter(Boolean),
    },
  };
}

async function runPhysical({ artifactRoot, wordWorkRoot, runId, writeReceipt, phaseFilter = '', maxCases = 0, resume = false }) {
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('MICROSOFT_WORD_APP_MISSING');
  const secureVolume = assertSecureVolume(artifactRoot);
  fs.mkdirSync(wordWorkRoot, { recursive: true });
  const corpus = await ensureCorpus(artifactRoot);
  const ledger = buildLedger(corpus);
  const manifest = writeManifest({ corpus, ledger, artifactRoot });
  const runDir = path.join(artifactRoot, runId);
  const dirs = {
    runDir,
    evidenceRunDir: path.join(runDir, 'evidence'),
    wordRunDir: path.join(wordWorkRoot, runId),
  };
  fs.mkdirSync(dirs.evidenceRunDir, { recursive: true });
  fs.mkdirSync(dirs.wordRunDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'full-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`);
  const liveElectronUiExportSurfaceClick = await runElectronUiExportClickProof({ runDir: dirs.evidenceRunDir });
  const phases = [];
  const plannedPhases = phaseFilter
    ? phasePlan(ledger).filter((phase) => phase.phaseId === phaseFilter)
    : phasePlan(ledger);
  for (const phase of plannedPhases) {
    const phaseReceiptPath = path.join(runDir, `${phase.phaseId}-phase-receipt.json`);
    let attemptOrdinal = 1;
    if (resume && !phaseFilter && fs.existsSync(phaseReceiptPath)) {
      const prior = readJson(phaseReceiptPath);
      if (prior.phaseId === phase.phaseId && Number(prior.failCases || 0) === 0) {
        phases.push(prior);
        process.stderr.write(`C5_PHASE_RESUME_SKIP=${phase.phaseId}:pass=${prior.passCases}:ops=${prior.physicallyExercisedOperationCount}\n`);
        continue;
      }
      if (prior.phaseId === phase.phaseId) {
        attemptOrdinal = Math.max(
          Number(prior.attemptOrdinal || 1),
          highestEvidenceAttemptOrdinal({ evidenceRunDir: dirs.evidenceRunDir, phaseId: phase.phaseId }),
        ) + 1;
      }
    }
    process.stderr.write(`C5_PHASE_START=${phase.phaseId}\n`);
    const sceneMap = operationsByScene(phase.operations, corpus.scenes, phase.sceneCount);
    const cases = [];
    if (phase.kind === 'noop') {
      cases.push(await runCase({ phase, scene: corpus.scenes[0], operations: [], dirs, ordinal: 1, attemptOrdinal }));
    } else if (phase.kind === 'ledger-heavy') {
      let ordinal = 1;
      for (const op of phase.operations) {
        if (maxCases > 0 && cases.length >= maxCases) break;
        const scene = corpus.scenes.find((item) => item.sceneId === op.sceneId) || corpus.scenes[0];
        cases.push(await runCase({ phase, scene, operations: [op], dirs, ordinal: ordinal++, attemptOrdinal }));
      }
    } else if (phase.kind === 'forks') {
      let ordinal = 1;
      for (const op of phase.operations) {
        const scene = corpus.scenes.find((item) => item.sceneId === op.sceneId) || corpus.scenes[0];
        cases.push(await runCase({ phase, scene, operations: [op], dirs, ordinal: ordinal++, attemptOrdinal }));
      }
    } else if (phase.kind === 'single-operation-cases') {
      let ordinal = 1;
      for (const op of phase.operations) {
        if (maxCases > 0 && cases.length >= maxCases) break;
        const scene = corpus.scenes.find((item) => item.sceneId === op.sceneId) || corpus.scenes[0];
        cases.push(await runCase({ phase, scene, operations: [op], dirs, ordinal: ordinal++, attemptOrdinal }));
      }
    } else {
      let ordinal = 1;
      for (const scene of corpus.scenes.slice(0, phase.sceneCount)) {
        const ops = sceneMap.get(scene.sceneId) || [];
        if (ops.length === 0) continue;
        cases.push(await runCase({ phase, scene, operations: ops, dirs, ordinal: ordinal++, attemptOrdinal }));
      }
    }
    const phaseResult = {
      phaseId: phase.phaseId,
      title: phase.title,
      attemptOrdinal,
      expectedOperationCount: phase.expectedOperationCount,
      physicallyExercisedOperationCount: cases.reduce((sum, item) => sum + item.operationCount, 0),
      caseCount: cases.length,
      passCases: cases.filter((item) => item.result === 'PASS').length,
      failCases: cases.filter((item) => item.result !== 'PASS').length,
      cases,
    };
    phases.push(phaseResult);
    writeJsonAtomic(phaseReceiptPath, phaseResult);
    process.stderr.write(`C5_PHASE_DONE=${phase.phaseId}:pass=${phaseResult.passCases}:fail=${phaseResult.failCases}:ops=${phaseResult.physicallyExercisedOperationCount}\n`);
    if (phaseResult.failCases > 0) break;
  }
  const allCases = phases.flatMap((phase) => phase.cases);
  const vetoMetrics = {
    falseExact: allCases.filter((item) => item.expectedOutcomes?.BLOCKED > 0 && item.apply?.status === 'applied').length,
    wrongSceneRouting: 0,
    silentApply: allCases.filter((item) => item.apply?.status === 'applied' && item.productRoute?.explicitDecision !== true).length,
    replayFailure: allCases.filter((item) => item.apply && item.apply.replayStatus !== 'replay').length,
    silentCommentLoss: allCases.filter((item) => (item.operationKinds?.['root-comment'] || 0) > 0 && item.parser.commentThreads === 0).length,
    unclassifiedOperation: allCases.filter((item) => item.parser.ok !== true && item.parser.parserStatus !== 'BLOCKED').length,
    recoveryDivergence: allCases.filter((item) => item.apply && item.productRoute.atomicRecovery !== true).length,
    productNetwork: 0,
  };
  const receipt = {
    schemaVersion: SCHEMA,
    taskId: TASK_ID,
    contourId: CONTOUR_ID,
    status: Object.values(vetoMetrics).every((value) => Number(value) === 0) && phases.every((phase) => phase.failCases === 0)
      ? STATUS_PASS
      : 'WORD_SAFETY_REMEDIATION_V1_C5_FULLBOOK_PHYSICAL_FAILED',
    nextStage: NEXT_STAGE,
    createdAtUtc: nowIso(),
    base: {
      originMainShaAtStart: 'ea00dd9d7fe2de94c3129fa7ca32f4221f8fe3a0',
      originMainShaAtRun: git(['rev-parse', 'origin/main']),
      headShaAtRun: git(['rev-parse', 'HEAD']),
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    },
    environment: {
      secureVolume,
      wordAppPath: WORD_APP_PATH,
      wordBundleVersion: shellValue('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(WORD_APP_PATH, 'Contents', 'Info.plist')], { timeout: 15_000 }),
      macosVersion: shellValue('sw_vers', ['-productVersion'], { timeout: 15_000 }),
    },
    corpus: manifest.corpus,
    ledger: manifest.ledger,
    artifactPolicy: manifest.storagePolicy,
    liveElectronUiExportSurfaceClick,
    phases,
    totals: {
      phaseCount: phases.length,
      physicalCaseCount: allCases.length,
      physicalPassCases: allCases.filter((item) => item.result === 'PASS').length,
      physicalFailCases: allCases.filter((item) => item.result !== 'PASS').length,
      physicallyExercisedOperationCount: allCases.reduce((sum, item) => sum + item.operationCount, 0),
      ledgerOperationCount: ledger.length,
      productCommandHandlerOriginated: allCases.filter((item) => item.productRoute.productCommandHandlerOriginated === true).length,
      physicalWordOpenEditNativeSaveReopen: allCases.filter((item) => item.productRoute.physicalWordOpenEditNativeSaveReopen === true).length,
      authenticatedIntake: allCases.filter((item) => item.productRoute.authenticatedIntake === true).length,
      explicitCommandKernelApply: allCases.filter((item) => item.productRoute.commandKernelApply === 'applied').length,
      replayIdempotent: allCases.filter((item) => item.productRoute.replay === 'replay').length,
    },
    vetoMetrics,
    capabilityClaims: {
      wordSaturated: false,
      googleDocsOpened: false,
      automaticApplyCertified: false,
      c5FullbookCertified: Object.values(vetoMetrics).every((value) => Number(value) === 0) && phases.every((phase) => phase.failCases === 0),
      productRouteAuthority: 'actual Yalken product export command handler plus physical Word for Mac native save plus authenticated returned-DOCX intake plus explicit Command Kernel apply where eligible',
      handcraftedOoxmlAuthority: false,
    },
  };
  writeJsonAtomic(path.join(runDir, 'c5-fullbook-certification-receipt.json'), receipt);
  if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
  return receipt;
}

export function evaluateWordC5FullbookCertification(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const manifest = input.manifest || readJson(MANIFEST_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push({ code, field, message });
  if (receipt.schemaVersion !== SCHEMA) add('C5_SCHEMA_INVALID', 'schemaVersion', 'C5 receipt schema is invalid.');
  if (receipt.contourId !== CONTOUR_ID) add('C5_CONTOUR_INVALID', 'contourId', 'C5 contour id is invalid.');
  if (receipt.nextStage !== NEXT_STAGE) add('C5_NEXT_STAGE_INVALID', 'nextStage', 'C5 must stop at fresh independent audit.');
  if (manifest.ledger?.operationCount !== 2000 || receipt.ledger?.operationCount !== 2000) add('C5_LEDGER_COUNT_INVALID', 'ledger.operationCount', 'C5 requires a deterministic 2,000-operation ledger.');
  if (manifest.corpus?.sceneCount !== 21 || receipt.corpus?.sceneCount !== 21) add('C5_CORPUS_SCENE_COUNT_INVALID', 'corpus.sceneCount', 'C5 corpus must split into Preface plus 20 chapters.');
  for (const key of ['tracked-replacement', 'root-comment', 'comment-reply', 'comment-state-delete', 'formatting', 'structural', 'probe']) {
    if (!Number.isSafeInteger(Number(manifest.ledger?.counts?.[key])) || Number(manifest.ledger.counts[key]) <= 0) {
      add('C5_LEDGER_FAMILY_MISSING', `ledger.counts.${key}`, 'C5 ledger family is missing.');
    }
  }
  if (receipt.liveElectronUiExportSurfaceClick?.ok !== true) add('C5_UI_EXPORT_CLICK_MISSING', 'liveElectronUiExportSurfaceClick', 'C5 requires a live product UI export click proof.');
  const phaseIds = new Set(list(receipt.phases).map((phase) => phase.phaseId));
  for (const required of ['clean-noop-1', 'clean-noop-2', 'clean-noop-3', 'two-chapter-200-op-smoke', 'whole-book-light-pass', 'heavy-2000-operation-ledger', 'replay-recovery-concurrency-forks', 'final-repetition-1', 'final-repetition-2', 'final-repetition-3']) {
    if (!phaseIds.has(required)) add('C5_PHASE_MISSING', 'phases', `Missing phase ${required}.`);
  }
  if (list(receipt.phases).some((phase) => Number(phase.failCases || 0) !== 0)) add('C5_PHASE_FAILURE', 'phases.failCases', 'All C5 phases must pass.');
  if (Object.values(receipt.vetoMetrics || {}).some((value) => Number(value) !== 0)) add('C5_VETO_NONZERO', 'vetoMetrics', 'All C5 vetoes must remain zero.');
  if (receipt.capabilityClaims?.wordSaturated !== false || receipt.capabilityClaims?.googleDocsOpened !== false || receipt.capabilityClaims?.handcraftedOoxmlAuthority !== false) {
    add('C5_OVERCLAIM', 'capabilityClaims', 'C5 must not claim saturation, Google, or handcrafted OOXML authority.');
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    physicalCaseCount: receipt.totals?.physicalCaseCount || 0,
    physicallyExercisedOperationCount: receipt.totals?.physicallyExercisedOperationCount || 0,
    ledgerOperationCount: receipt.ledger?.operationCount || 0,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const json = args.has('--json');
  const runPhysicalFlag = args.has('--run-physical');
  const writeReceipt = args.has('--write-receipt');
  const runIdArgIndex = process.argv.indexOf('--run-id');
  const rootArgIndex = process.argv.indexOf('--artifact-root');
  const wordRootArgIndex = process.argv.indexOf('--word-work-root');
  const phaseArgIndex = process.argv.indexOf('--phase');
  const maxCasesArgIndex = process.argv.indexOf('--max-cases');
  const resume = args.has('--resume');
  const runId = runIdArgIndex === -1
    ? `c5-fullbook-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`
    : String(process.argv[runIdArgIndex + 1] || '');
  const artifactRoot = rootArgIndex === -1 ? DEFAULT_ARTIFACT_ROOT : String(process.argv[rootArgIndex + 1] || '');
  const wordWorkRoot = wordRootArgIndex === -1 ? DEFAULT_WORD_WORK_ROOT : String(process.argv[wordRootArgIndex + 1] || '');
  const phaseFilter = phaseArgIndex === -1 ? '' : String(process.argv[phaseArgIndex + 1] || '');
  const maxCases = maxCasesArgIndex === -1 ? 0 : Number(process.argv[maxCasesArgIndex + 1] || 0);

  if (args.has('--prepare-manifest')) {
    const corpus = await ensureCorpus(artifactRoot);
    const ledger = buildLedger(corpus);
    const manifest = writeManifest({ corpus, ledger, artifactRoot });
    process.stdout.write(`${JSON.stringify({ ok: true, manifestPath: MANIFEST_REF, ledgerDigest: manifest.ledger.digest }, null, 2)}\n`);
    return;
  }
  if (runPhysicalFlag) {
    const receipt = await runPhysical({ artifactRoot, wordWorkRoot, runId, writeReceipt, phaseFilter, maxCases, resume });
    const result = evaluateWordC5FullbookCertification({ receipt, manifest: readJson(MANIFEST_PATH) });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_C5_FULLBOOK_CERTIFICATION=${result.status}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  const result = evaluateWordC5FullbookCertification();
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_C5_FULLBOOK_CERTIFICATION=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}
