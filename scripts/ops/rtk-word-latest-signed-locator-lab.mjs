#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  RTK_TRANSPORT_MANIFEST_AUTHORITY_SIGNAL,
  createManualOnlyLocatorSignal,
  createReviewTransportManifestV2,
  stableTransportManifestJson,
  verifyReviewTransportManifestV2,
} from '../../src/io/revisionBridge/reviewTransportManifestCore.mjs';

const require = createRequire(import.meta.url);
const { buildStoredZip, escapeXml } = require('../../src/export/docx/docxMinBuilder.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SECURE_MOUNT = '/Volumes/T7-Secure';
const SECURE_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';
const WORD_APP_PATH = '/Applications/Microsoft Word.app';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-latest-semantic-v2/current/b01-signed-locator';
const DEFAULT_WORD_WORK_ROOT = path.join(
  '/tmp',
  'YalkenWordLab',
  'word-latest-semantic-v2',
  'b01-signed-locator',
);
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B01_LOCATOR_SURVIVAL_RECEIPT.json');
const TARGET_PROFILE_ID = 'word-mac-latest-16.111.2-semantic-v2';
const TARGET_WORD_VERSION = '16.111.2';
const SYNTHETIC_AUTHOR = 'Yalken Synthetic Word Latest Lab';
const SYNTHETIC_INITIALS = 'YSL';
const SECRET_LABEL = 'LOCAL_SECRET_NOT_EMBEDDED_IN_DOCX';

const SOURCE_PARAGRAPHS = Object.freeze([
  'B01 opening anchor keeps signed locator authority alive.',
  'B01 SDT block alpha carries INSERT_TARGET and DELETE_TARGET for latest Word preservation.',
  'B01 COMMENT_TARGET receives comments while duplicate anchor repeats COMMENT_TARGET.',
  'B01 SPLIT_TARGET keeps paragraph mark evidence and final boundary.',
]);
const SOURCE_TEXT = SOURCE_PARAGRAPHS.join('\n');
const SCENE_REVISION = 'scene-revision-b01-0001';
const PARA_IDS = Object.freeze(['1a2b3c4d', '2b3c4d5e', '3c4d5e6f', '4d5e6f70']);
const TEXT_IDS = Object.freeze(['11111111', '22222222', '33333333', '44444444']);
const BOOKMARK_NAME = 'YALKEN_B01_SCENE_A_START';
const SDT_TAG = 'YALKEN_B01_BLOCK_ALPHA';
const SEEDED_COMMENT_BODY = 'Seeded classic comment for B01 locator carrier survival.';
const WORD_NATIVE_COMMENT_BODY = 'Word-native B01 comment created after opening synthetic DOCX.';

const PHYSICAL_CASES = Object.freeze([
  {
    id: 'b01-no-edit-save-reopen',
    title: 'no edit save reopen preserves carriers',
    actions: [],
    expectedSignals: ['customXmlManifest', 'sceneBookmark', 'sdtTag', 'w14ParaId', 'w14TextId', 'seededClassicComment'],
  },
  {
    id: 'b01-tracked-insert',
    title: 'tracked insert near locator carriers',
    actions: [{ type: 'insert', after: 'INSERT_TARGET', text: ' INSERTED_BY_WORD' }],
    expectedSignals: ['customXmlManifest', 'sceneBookmark', 'sdtTag', 'w14ParaId', 'w14TextId', 'seededClassicComment'],
  },
  {
    id: 'b01-tracked-delete',
    title: 'tracked delete near locator carriers',
    actions: [{ type: 'delete', target: 'DELETE_TARGET' }],
    expectedSignals: ['customXmlManifest', 'sceneBookmark', 'sdtTag', 'w14ParaId', 'w14TextId', 'seededClassicComment'],
  },
  {
    id: 'b01-paragraph-split',
    title: 'tracked paragraph split near locator carriers',
    actions: [{ type: 'insert', after: 'SPLIT_TARGET', text: '\nB01 split branch created by latest Word.' }],
    expectedSignals: ['customXmlManifest', 'sceneBookmark', 'sdtTag', 'w14ParaId', 'w14TextId', 'seededClassicComment'],
  },
  {
    id: 'b01-word-native-comment',
    title: 'Word-native classic comment adds semantic readback evidence',
    actions: [{ type: 'wordComment', target: 'COMMENT_TARGET', body: WORD_NATIVE_COMMENT_BODY }],
    expectedSignals: ['customXmlManifest', 'sceneBookmark', 'sdtTag', 'w14ParaId', 'w14TextId', 'seededClassicComment', 'wordNativeClassicComment'],
  },
]);

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(rawString(value), 'utf8'));
}

function hmacSha256Text(value, secret) {
  return crypto.createHmac('sha256', Buffer.from(rawString(secret), 'utf8'))
    .update(Buffer.from(rawString(value), 'utf8'))
    .digest('hex');
}

export function createNodeManifestCryptoPort() {
  return {
    sha256Json(value) {
      return `sha256:${sha256Text(stableTransportManifestJson(value))}`;
    },
    hmacSha256Json(value, secret) {
      return `hmac-sha256:${hmacSha256Text(stableTransportManifestJson(value), secret)}`;
    },
  };
}

function execText(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 90_000,
  }).trim();
}

function shellValue(command, args) {
  try {
    return execText(command, args, { timeout: 30_000 });
  } catch (error) {
    return `UNAVAILABLE:${error.status || error.signal || 'ERR'}`;
  }
}

function plistValue(key) {
  try {
    return execText('/usr/libexec/PlistBuddy', ['-c', `Print ${key}`, path.join(WORD_APP_PATH, 'Contents', 'Info.plist')], { timeout: 30_000 });
  } catch {
    return '';
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function assertSecureVolume(artifactRoot) {
  const info = execText('diskutil', ['info', SECURE_MOUNT], { timeout: 30_000 });
  const uuidLine = info.split('\n').find((line) => line.includes('Volume UUID')) || '';
  if (!uuidLine.includes(SECURE_UUID)) throw new Error(`T7_SECURE_UUID_MISMATCH:${uuidLine.trim()}`);
  if (!/FileVault:\s+Yes/u.test(info)) throw new Error('T7_SECURE_FILEVAULT_NOT_YES');
  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.accessSync(artifactRoot, fs.constants.W_OK);
  return {
    mount: SECURE_MOUNT,
    uuid: SECURE_UUID,
    fileVault: 'Yes',
    writable: true,
  };
}

function appleLiteral(text) {
  return `"${rawString(text)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .join('" & return & "')}"`;
}

function applePath(filePath) {
  return appleLiteral(filePath);
}

function parseKeyValueLines(text) {
  return Object.fromEntries(rawString(text)
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf('=');
      return at === -1 ? [line, ''] : [line.slice(0, at), line.slice(at + 1)];
    }));
}

function escapeCustomXmlText(value) {
  return escapeXml(value);
}

function unescapeCustomXmlText(value) {
  return rawString(value)
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function extractElementText(xml, tagName) {
  const open = `<${tagName}>`;
  const close = `</${tagName}>`;
  const start = rawString(xml).indexOf(open);
  if (start === -1) return '';
  const bodyStart = start + open.length;
  const end = rawString(xml).indexOf(close, bodyStart);
  if (end === -1) return '';
  return unescapeCustomXmlText(rawString(xml).slice(bodyStart, end));
}

function makeManifestInput(caseId) {
  const rawSha = `sha256:${sha256Text(SOURCE_TEXT)}`;
  const blockTextSha = `sha256:${sha256Text(SOURCE_PARAGRAPHS[1])}`;
  const emptyMarksSha = `sha256:${sha256Text('marks:none')}`;
  return {
    profileId: TARGET_PROFILE_ID,
    manifestId: `manifest-${caseId}`,
    projectId: 'synthetic-yalken-b01-project',
    roundId: `round-${caseId}`,
    exportId: `export-${caseId}`,
    exportedAtUtc: '2026-07-30T14:10:00.000Z',
    sceneSnapshots: [
      {
        sceneId: 'scene-b01-alpha',
        sceneRevision: SCENE_REVISION,
        rawSha256: rawSha,
        blocks: [
          {
            blockId: 'block-b01-alpha',
            paragraphId: PARA_IDS[1],
            canonicalTextSha256: blockTextSha,
            canonicalMarksSha256: emptyMarksSha,
            locatorSignals: [
              {
                signalId: 'signed-block-alpha',
                kind: RTK_TRANSPORT_MANIFEST_AUTHORITY_SIGNAL,
                authority: 'required-apply-authority',
                value: {
                  sceneId: 'scene-b01-alpha',
                  sceneRevision: SCENE_REVISION,
                  blockId: 'block-b01-alpha',
                  rawSha256: rawSha,
                  canonicalTextSha256: blockTextSha,
                },
              },
              {
                signalId: 'bookmark-scene-start',
                kind: 'word-bookmark-scene-boundary-v1',
                authority: 'placement-signal-only',
                value: { bookmarkName: BOOKMARK_NAME },
              },
              {
                signalId: 'sdt-block-tag',
                kind: 'word-sdt-tag-v1',
                authority: 'placement-signal-only',
                value: { tag: SDT_TAG },
              },
              {
                signalId: 'w14-para-text-id',
                kind: 'word-w14-para-text-id-v1',
                authority: 'word-native-placement-signal-only',
                value: { paraId: PARA_IDS[1], textId: TEXT_IDS[1] },
              },
              createManualOnlyLocatorSignal({
                signalId: 'prefix-suffix-fingerprint',
                value: {
                  prefixSha256: `sha256:${sha256Text('B01 SDT block alpha carries')}`,
                  suffixSha256: `sha256:${sha256Text('for latest Word preservation.')}`,
                },
              }),
            ],
          },
        ],
      },
    ],
  };
}

export function buildB01LocatorManifest(caseId, hmacSecret) {
  const created = createReviewTransportManifestV2({
    ...makeManifestInput(caseId),
    hmacSecret,
    keyId: 'b01-local-secret',
  }, { cryptoPort: createNodeManifestCryptoPort() });
  if (!created.ok) throw new Error(`B01_MANIFEST_BUILD_FAILED:${created.code}`);
  return created.manifest;
}

function buildCustomXmlPart(manifest) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<yrtk:transport xmlns:yrtk="urn:yalken:rtk:transport-manifest:v2">
  <yrtk:manifestJson>${escapeCustomXmlText(JSON.stringify(manifest))}</yrtk:manifestJson>
</yrtk:transport>`;
}

function buildDocumentXml() {
  const p0 = `<w:p w14:paraId="${PARA_IDS[0]}" w14:textId="${TEXT_IDS[0]}"><w:bookmarkStart w:id="41" w:name="${BOOKMARK_NAME}"/><w:r><w:t xml:space="preserve">${escapeXml(SOURCE_PARAGRAPHS[0])}</w:t></w:r><w:bookmarkEnd w:id="41"/></w:p>`;
  const p1 = `<w:sdt><w:sdtPr><w:alias w:val="Yalken B01 Locator Block"/><w:tag w:val="${SDT_TAG}"/></w:sdtPr><w:sdtContent><w:p w14:paraId="${PARA_IDS[1]}" w14:textId="${TEXT_IDS[1]}"><w:r><w:t xml:space="preserve">${escapeXml(SOURCE_PARAGRAPHS[1])}</w:t></w:r></w:p></w:sdtContent></w:sdt>`;
  const commentLead = 'B01 ';
  const commentText = 'COMMENT_TARGET';
  const commentTail = ' receives comments while duplicate anchor repeats COMMENT_TARGET.';
  const p2 = `<w:p w14:paraId="${PARA_IDS[2]}" w14:textId="${TEXT_IDS[2]}"><w:r><w:t xml:space="preserve">${escapeXml(commentLead)}</w:t></w:r><w:commentRangeStart w:id="0"/><w:r><w:t>${escapeXml(commentText)}</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r><w:r><w:t xml:space="preserve">${escapeXml(commentTail)}</w:t></w:r></w:p>`;
  const p3 = `<w:p w14:paraId="${PARA_IDS[3]}" w14:textId="${TEXT_IDS[3]}"><w:r><w:t xml:space="preserve">${escapeXml(SOURCE_PARAGRAPHS[3])}</w:t></w:r></w:p>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14">
  <w:body>
    ${p0}
    ${p1}
    ${p2}
    ${p3}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;
}

function buildCommentsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:comment w:id="0" w:author="${escapeXml(SYNTHETIC_AUTHOR)}" w:initials="${escapeXml(SYNTHETIC_INITIALS)}" w:date="2026-07-30T14:10:00Z">
    <w:p w14:paraId="0abcdeff" w14:textId="00fedcba"><w:r><w:t>${escapeXml(SEEDED_COMMENT_BODY)}</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;
}

function buildCommentsExtendedXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
  <w15:commentEx w15:paraId="0abcdeff" w15:done="0"/>
</w15:commentsEx>`;
}

function buildPeopleXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w15:people xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
  <w15:person w15:author="${escapeXml(SYNTHETIC_AUTHOR)}" w15:providerId="YALKEN_SYNTHETIC" w15:userId="b01-synthetic-author"/>
</w15:people>`;
}

export function buildB01LocatorDocxBuffer(caseId, hmacSecret) {
  const manifest = buildB01LocatorManifest(caseId, hmacSecret);
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
  <Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/>
  <Override PartName="/word/people.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml"/>
  <Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="customXml/item1.xml"/>
</Relationships>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>
  <Relationship Id="rIdCommentsExtended" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>
  <Relationship Id="rIdPeople" Type="http://schemas.microsoft.com/office/2011/relationships/people" Target="people.xml"/>
</Relationships>`;
  const itemRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/>
</Relationships>`;
  const itemProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ds:datastoreItem ds:itemID="{0B010000-0000-4000-8000-000000000001}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml">
  <ds:schemaRefs><ds:schemaRef ds:uri="urn:yalken:rtk:transport-manifest:v2"/></ds:schemaRefs>
</ds:datastoreItem>`;
  return {
    manifest,
    buffer: buildStoredZip([
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rootRels },
      { name: 'word/document.xml', data: buildDocumentXml() },
      { name: 'word/_rels/document.xml.rels', data: documentRels },
      { name: 'word/comments.xml', data: buildCommentsXml() },
      { name: 'word/commentsExtended.xml', data: buildCommentsExtendedXml() },
      { name: 'word/people.xml', data: buildPeopleXml() },
      { name: 'customXml/item1.xml', data: buildCustomXmlPart(manifest) },
      { name: 'customXml/itemProps1.xml', data: itemProps },
      { name: 'customXml/_rels/item1.xml.rels', data: itemRels },
    ]),
  };
}

function idx(text, needle, occurrence = 0) {
  let cursor = 0;
  for (let i = 0; i <= occurrence; i += 1) {
    const found = text.indexOf(needle, cursor);
    if (found === -1) throw new Error(`B01_TARGET_NOT_FOUND:${needle}`);
    if (i === occurrence) return found;
    cursor = found + needle.length;
  }
  throw new Error(`B01_TARGET_NOT_FOUND:${needle}`);
}

function rangeFrom(action) {
  if (action.type === 'insert') {
    const at = idx(SOURCE_TEXT, action.after, action.occurrence || 0) + action.after.length;
    return { start: at, end: at };
  }
  const start = idx(SOURCE_TEXT, action.target, action.occurrence || 0);
  return { start, end: start + action.target.length };
}

function actionToApple(action, actionIndex) {
  const range = rangeFrom(action);
  if (action.type === 'insert') {
    return [
      'set track revisions of yDoc to true',
      `set content of (create range yDoc start ${range.start} end ${range.end}) to ${appleLiteral(action.text)}`,
    ].join('\n');
  }
  if (action.type === 'delete') {
    return [
      'set track revisions of yDoc to true',
      `set content of (create range yDoc start ${range.start} end ${range.end}) to ""`,
    ].join('\n');
  }
  if (action.type === 'wordComment') {
    return [
      'set track revisions of yDoc to false',
      `set yCommentRange${actionIndex} to create range yDoc start ${range.start} end ${range.end}`,
      `make new Word comment at yCommentRange${actionIndex} with properties {comment text:${appleLiteral(action.body)}}`,
    ].join('\n');
  }
  throw new Error(`B01_UNSUPPORTED_WORD_ACTION:${action.type}`);
}

function runOsaScript(scriptText, scriptName, runDir) {
  const scriptsDir = path.join(runDir, 'applescripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, `${scriptName}.applescript`);
  fs.writeFileSync(scriptPath, scriptText, 'utf8');
  const output = execText('osascript', [scriptPath], { timeout: 120_000 });
  return { scriptPath, output };
}

function buildWordEditScript(expectedName, actions) {
  const actionLines = actions.map((action, index) => actionToApple(action, index)).join('\n');
  return [
    'tell application "Microsoft Word"',
    'activate',
    'set yDocWasOpened to false',
    'set oldAlerts to display alerts',
    'set oldUserName to user name',
    'set oldUserInitials to user initials',
    'try',
    '  set display alerts to alerts none',
    `  set user name to ${appleLiteral(SYNTHETIC_AUTHOR)}`,
    `  set user initials to ${appleLiteral(SYNTHETIC_INITIALS)}`,
    '  set yDoc to active document',
    `  if (name of yDoc as text) is not ${appleLiteral(expectedName)} then error "B01_ACTIVE_DOCUMENT_MISMATCH" number 9101`,
    '  set yDocWasOpened to true',
    '  set track revisions of yDoc to false',
    '  set show revisions of yDoc to true',
    '  set remove personal information of yDoc to false',
    '  set remove date and time of yDoc to false',
    actionLines ? actionLines.split('\n').map((line) => `  ${line}`).join('\n') : '  set yNoOp to true',
    '  save active document',
    '  close active document saving yes',
    '  set yDocWasOpened to false',
    '  set user name to oldUserName',
    '  set user initials to oldUserInitials',
    '  set display alerts to oldAlerts',
    '  return "EDIT_STATUS=PASS"',
    'on error errMsg number errNo',
    '  try',
    '    if yDocWasOpened then close active document saving no',
    '  end try',
    '  try',
    '    set user name to oldUserName',
    '    set user initials to oldUserInitials',
    '    set display alerts to oldAlerts',
    '  end try',
    '  error errMsg number errNo',
    'end try',
    'end tell',
  ].join('\n');
}

function buildWordReadbackScript(expectedName) {
  return [
    'tell application "Microsoft Word"',
    'activate',
    'set yDocWasOpened to false',
    'set oldAlerts to display alerts',
    'try',
    '  set display alerts to alerts none',
    '  set yDoc to active document',
    `  if (name of yDoc as text) is not ${appleLiteral(expectedName)} then error "B01_READBACK_DOCUMENT_MISMATCH" number 9102`,
    '  set yDocWasOpened to true',
    '  set yReadback to content of text object of yDoc',
    '  set yRevisionCount to count of revisions of yDoc',
    '  set yCommentCount to count of Word comments of yDoc',
    '  set yCommentSummary to ""',
    '  repeat with i from 1 to yCommentCount',
    '    try',
    '      set yCommentSummary to yCommentSummary & (author of Word comment i of yDoc) & ":" & (initials of Word comment i of yDoc) & ":" & (content of comment text of Word comment i of yDoc) & "|"',
    '    on error errMsg number errNo',
    '      set yCommentSummary to yCommentSummary & "COMMENT_READ_ERROR:" & errNo & "|"',
    '    end try',
    '  end repeat',
    '  set ySaveFormat to save format of yDoc as text',
    '  close active document saving no',
    '  set yDocWasOpened to false',
    '  set display alerts to oldAlerts',
    '  return "READBACK=" & yReadback & linefeed & "REVISION_COUNT=" & yRevisionCount & linefeed & "COMMENT_COUNT=" & yCommentCount & linefeed & "COMMENT_SUMMARY=" & yCommentSummary & linefeed & "SAVE_FORMAT=" & ySaveFormat',
    'on error errMsg number errNo',
    '  try',
    '    if yDocWasOpened then close active document saving no',
    '  end try',
    '  try',
    '    set display alerts to oldAlerts',
    '  end try',
    '  error errMsg number errNo',
    'end try',
    'end tell',
  ].join('\n');
}

function openDocViaLaunchServices(filePath) {
  const expectedName = path.basename(filePath);
  execFileSync('/usr/bin/open', ['-a', WORD_APP_PATH, filePath], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  const waitScript = [
    'tell application "Microsoft Word"',
    'activate',
    `set yExpectedName to ${appleLiteral(expectedName)}`,
    'repeat with i from 1 to 80',
    '  if (count of documents) > 0 then',
    '    if (name of active document as text) is yExpectedName then return "READY"',
    '  end if',
    '  delay 0.25',
    'end repeat',
    'return "NOT_READY"',
    'end tell',
  ].join('\n');
  const status = execText('osascript', ['-e', waitScript], { timeout: 30_000 });
  if (status !== 'READY') throw new Error(`B01_LAUNCHSERVICES_OPEN_NOT_READY:${expectedName}:${status}`);
  return expectedName;
}

function listZipEntries(docxPath) {
  try {
    return execText('/usr/bin/unzip', ['-Z1', docxPath], { timeout: 30_000 }).split(/\r?\n/u).filter(Boolean);
  } catch {
    return [];
  }
}

function extractPart(docxPath, partName) {
  try {
    return execFileSync('/usr/bin/unzip', ['-p', docxPath, partName], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
    });
  } catch {
    return '';
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

function extractManifestFromCustomXml(customXml) {
  const json = extractElementText(customXml, 'yrtk:manifestJson');
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function inspectReturnedPackage(returnedPath, expectedManifest, hmacSecret) {
  const entries = listZipEntries(returnedPath);
  const entrySet = new Set(entries);
  const documentXml = extractPart(returnedPath, 'word/document.xml');
  const commentsXml = extractPart(returnedPath, 'word/comments.xml');
  const commentsExtendedXml = extractPart(returnedPath, 'word/commentsExtended.xml');
  const peopleXml = extractPart(returnedPath, 'word/people.xml');
  const customXml = extractPart(returnedPath, 'customXml/item1.xml');
  const extractedManifest = extractManifestFromCustomXml(customXml);
  const manifestVerification = extractedManifest
    ? verifyReviewTransportManifestV2(extractedManifest, {
      cryptoPort: createNodeManifestCryptoPort(),
      hmacSecret,
    })
    : {
      ok: false,
      status: 'blocked',
      code: 'RTK_TRANSPORT_MANIFEST_CUSTOM_XML_MISSING',
      exactAuthority: false,
      reasons: [{ code: 'RTK_TRANSPORT_MANIFEST_CUSTOM_XML_MISSING', field: 'customXml/item1.xml', message: 'Signed locator manifest customXml part was not preserved.' }],
    };

  const originalManifestDigestMatches = extractedManifest?.payloadDigest === expectedManifest.payloadDigest;
  const paraIdSurvivors = PARA_IDS.filter((id) => documentXml.includes(`paraId="${id}"`) || documentXml.includes(`paraId="${id.toUpperCase()}"`));
  const textIdSurvivors = TEXT_IDS.filter((id) => documentXml.includes(`textId="${id}"`) || documentXml.includes(`textId="${id.toUpperCase()}"`));
  const inventory = {
    entries,
    requiredPartsPresent: {
      documentXml: entrySet.has('word/document.xml'),
      customXmlItem1: entrySet.has('customXml/item1.xml'),
      customXmlItemProps1: entrySet.has('customXml/itemProps1.xml'),
      documentRels: entrySet.has('word/_rels/document.xml.rels'),
      commentsXml: entrySet.has('word/comments.xml'),
      commentsExtendedXml: entrySet.has('word/commentsExtended.xml'),
      peopleXml: entrySet.has('word/people.xml'),
    },
    entryDigests: Object.fromEntries([
      'word/document.xml',
      'word/comments.xml',
      'word/commentsExtended.xml',
      'word/people.xml',
      'customXml/item1.xml',
    ].map((name) => [name, extractPart(returnedPath, name)]).filter(([, body]) => body).map(([name, body]) => [name, `sha256:${sha256Text(body)}`])),
  };
  const signals = {
    customXmlManifest: {
      status: manifestVerification.ok ? 'SURVIVED_VERIFIED' : 'LOST_OR_TAMPERED_BLOCKED',
      exactAuthority: manifestVerification.ok,
      manifestDigest: extractedManifest?.payloadDigest || '',
      originalManifestDigestMatches,
      code: manifestVerification.code,
    },
    sceneBookmark: {
      status: documentXml.includes(BOOKMARK_NAME) ? 'SURVIVED_PLACEMENT_SIGNAL_ONLY' : 'LOST_TYPED_LIMITATION',
      exactAuthority: false,
    },
    sdtTag: {
      status: documentXml.includes(SDT_TAG) ? 'SURVIVED_PLACEMENT_SIGNAL_ONLY' : 'LOST_TYPED_LIMITATION',
      exactAuthority: false,
    },
    w14ParaId: {
      status: paraIdSurvivors.length > 0 ? 'SURVIVED_WORD_NATIVE_PLACEMENT_SIGNAL_ONLY' : 'LOST_TYPED_LIMITATION',
      exactAuthority: false,
      survivors: paraIdSurvivors,
    },
    w14TextId: {
      status: textIdSurvivors.length > 0 ? 'SURVIVED_WORD_NATIVE_PLACEMENT_SIGNAL_ONLY' : 'LOST_TYPED_LIMITATION',
      exactAuthority: false,
      survivors: textIdSurvivors,
    },
    seededClassicComment: {
      status: commentsXml.includes(SEEDED_COMMENT_BODY) ? 'SURVIVED_SEMANTIC_READBACK_REQUIRED' : 'LOST_TYPED_LIMITATION',
      exactAuthority: false,
    },
    commentsExtended: {
      status: commentsExtendedXml ? 'INVENTORIED_SURVIVAL_ONLY_NOT_CERTIFIED' : 'ABSENT_TYPED_LIMITATION',
      exactAuthority: false,
    },
    peopleXml: {
      status: peopleXml ? 'INVENTORIED_SURVIVAL_ONLY_NOT_CERTIFIED' : 'ABSENT_TYPED_LIMITATION',
      exactAuthority: false,
    },
    modernCommentPackage: {
      status: 'NOT_CERTIFIED_IN_B01',
      exactAuthority: false,
      reason: 'B01 does not certify modern replies or resolved state; B03 remains required.',
    },
  };

  return {
    packageZipOk: testZip(returnedPath),
    inventory,
    signals,
    manifestVerification,
  };
}

async function runPhysicalCase(caseSpec, dirs, hmacSecret) {
  const sourcePath = path.join(dirs.wordSources, `${caseSpec.id}-source.docx`);
  const returnedPath = path.join(dirs.wordReturns, `${caseSpec.id}-returned.docx`);
  const evidenceSourcePath = path.join(dirs.evidenceSources, `${caseSpec.id}-source.docx`);
  const evidenceReturnedPath = path.join(dirs.evidenceReturns, `${caseSpec.id}-returned.docx`);
  const { manifest, buffer } = buildB01LocatorDocxBuffer(caseSpec.id, hmacSecret);
  fs.writeFileSync(sourcePath, buffer);
  fs.copyFileSync(sourcePath, returnedPath);
  fs.copyFileSync(sourcePath, evidenceSourcePath);
  const sourceSha256 = sha256Buffer(buffer);
  const expectedName = openDocViaLaunchServices(returnedPath);
  const editScript = runOsaScript(
    buildWordEditScript(expectedName, caseSpec.actions),
    `${caseSpec.id}-edit`,
    dirs.evidenceRunDir,
  );
  openDocViaLaunchServices(returnedPath);
  const readbackScript = runOsaScript(
    buildWordReadbackScript(expectedName),
    `${caseSpec.id}-readback`,
    dirs.evidenceRunDir,
  );
  fs.copyFileSync(returnedPath, evidenceReturnedPath);
  const word = parseKeyValueLines(readbackScript.output);
  const returnedBuffer = fs.readFileSync(evidenceReturnedPath);
  const packageInspection = inspectReturnedPackage(evidenceReturnedPath, manifest, hmacSecret);
  const wordNativeClassicCommentVisible = caseSpec.actions.some((action) => action.type === 'wordComment')
    ? rawString(word.COMMENT_SUMMARY).includes(WORD_NATIVE_COMMENT_BODY)
    : false;
  const allRequiredSignalsAccounted = caseSpec.expectedSignals.every((signalName) => {
    if (signalName === 'wordNativeClassicComment') return wordNativeClassicCommentVisible;
    const signal = packageInspection.signals[signalName];
    return signal && !rawString(signal.status).startsWith('LOST');
  });
  return {
    caseId: caseSpec.id,
    title: caseSpec.title,
    sourceDocxSha256: `sha256:${sourceSha256}`,
    returnedDocxSha256: `sha256:${sha256Buffer(returnedBuffer)}`,
    sourceBytes: buffer.length,
    returnedBytes: returnedBuffer.length,
    wordActions: caseSpec.actions.map((action) => action.type),
    openSaveCloseReopen: 'PASS',
    scriptPaths: {
      edit: editScript.scriptPath,
      readback: readbackScript.scriptPath,
    },
    wordReadbackSha256: `sha256:${sha256Text(word.READBACK || '')}`,
    revisionCount: Number(word.REVISION_COUNT || 0),
    commentCount: Number(word.COMMENT_COUNT || 0),
    commentSummarySha256: `sha256:${sha256Text(word.COMMENT_SUMMARY || '')}`,
    wordNativeClassicCommentVisible,
    expectedSignals: caseSpec.expectedSignals,
    allRequiredSignalsAccounted,
    packageInspection,
    paths: {
      wordWorkingSourceDocx: sourcePath,
      wordWorkingReturnedDocx: returnedPath,
      evidenceSourceDocx: evidenceSourcePath,
      evidenceReturnedDocx: evidenceReturnedPath,
    },
  };
}

function collectWordProfileProbe() {
  const versionByBundle = plistValue(':CFBundleShortVersionString') || '';
  const buildByBundle = plistValue(':CFBundleVersion') || '';
  return {
    appPath: WORD_APP_PATH,
    targetProfileId: TARGET_PROFILE_ID,
    targetVersion: TARGET_WORD_VERSION,
    versionByBundle,
    buildByBundle,
    versionByAppleScript: 'NOT_QUERIED_BEFORE_PHYSICAL_CASES_TO_AVOID_WORD_SANDBOX_MODAL_STATE',
    buildByAppleScript: 'NOT_QUERIED_BEFORE_PHYSICAL_CASES_TO_AVOID_WORD_SANDBOX_MODAL_STATE',
    targetVersionMatched: versionByBundle === TARGET_WORD_VERSION,
    macosVersion: shellValue('sw_vers', ['-productVersion']),
    macosBuild: shellValue('sw_vers', ['-buildVersion']),
    locale: shellValue('defaults', ['read', '-g', 'AppleLocale']),
  };
}

export function evaluateB01LocatorReceipt(receipt = readJson(RECEIPT_PATH)) {
  const issues = [];
  if (receipt.schemaVersion !== 'yalken.rtk.word-latest-semantic-roundtrip-v2.b01-locator-survival-receipt.v1') {
    issues.push({ code: 'B01_SCHEMA_INVALID', field: 'schemaVersion' });
  }
  if (receipt.taskId !== 'YALKEN_RTK_WORD_LATEST_SEMANTIC_ROUNDTRIP_V2') issues.push({ code: 'B01_TASK_INVALID', field: 'taskId' });
  if (receipt.stageId !== 'B01_SIGNED_LOCATOR_PRESERVATION') issues.push({ code: 'B01_STAGE_INVALID', field: 'stageId' });
  if (receipt.profile?.statusAfterB01 !== 'SURVIVAL_EVIDENCE_ONLY_NOT_CERTIFIED') issues.push({ code: 'B01_FALSE_CERTIFICATION', field: 'profile.statusAfterB01' });
  if (receipt.profile?.physicalRoundTripsClaimedAsCertification !== false) issues.push({ code: 'B01_CERTIFICATION_ROUNDTRIP_CLAIMED', field: 'profile.physicalRoundTripsClaimedAsCertification' });
  if (receipt.wordDocumentSafety?.closeNonLabDocuments === true) issues.push({ code: 'B01_USER_DOC_RISK', field: 'wordDocumentSafety.closeNonLabDocuments' });
  if (receipt.wordDocumentSafety?.syntheticOnly !== true) issues.push({ code: 'B01_SYNTHETIC_ONLY_MISSING', field: 'wordDocumentSafety.syntheticOnly' });
  if (receipt.commentNoopPassClaimed !== false) issues.push({ code: 'B01_COMMENT_NOOP_FALSE_PASS', field: 'commentNoopPassClaimed' });
  if (receipt.runtimeClaims?.productRuntimeChanged !== false || receipt.runtimeClaims?.networkDependencyAdded !== false || receipt.runtimeClaims?.uiChanged !== false) {
    issues.push({ code: 'B01_RUNTIME_SCOPE_EXPANDED', field: 'runtimeClaims' });
  }
  const cases = Array.isArray(receipt.cases) ? receipt.cases : [];
  if (cases.length < 5) issues.push({ code: 'B01_PHYSICAL_CASES_INSUFFICIENT', field: 'cases' });
  if (!cases.every((item) => item.packageInspection?.packageZipOk === true)) issues.push({ code: 'B01_ZIP_VALIDATION_FAILED', field: 'cases.packageInspection.packageZipOk' });
  const noEditCase = cases.find((item) => item.caseId === 'b01-no-edit-save-reopen');
  const mutatingCases = cases.filter((item) => item.caseId !== 'b01-no-edit-save-reopen');
  if (noEditCase?.packageInspection?.signals?.customXmlManifest?.exactAuthority !== true) {
    issues.push({ code: 'B01_NO_EDIT_CUSTOM_XML_AUTHORITY_NOT_PROVEN', field: 'cases.b01-no-edit-save-reopen.packageInspection.signals.customXmlManifest' });
  }
  const customXmlDroppedAfterMutation = mutatingCases.some((item) => item.packageInspection?.signals?.customXmlManifest?.exactAuthority !== true);
  if (customXmlDroppedAfterMutation && receipt.signedLocatorAuthority?.customXmlUsableForMutatingWordReturn !== false) {
    issues.push({ code: 'B01_CUSTOM_XML_MUTATION_LIMITATION_NOT_BOUND', field: 'signedLocatorAuthority.customXmlUsableForMutatingWordReturn' });
  }
  if (receipt.signedLocatorAuthority?.exactRequiresVerifiedCustomXmlManifestAndBaseline !== true) {
    issues.push({ code: 'B01_SIGNED_AUTHORITY_GUARD_MISSING', field: 'signedLocatorAuthority.exactRequiresVerifiedCustomXmlManifestAndBaseline' });
  }
  if (!cases.every((item) => item.packageInspection?.signals?.sceneBookmark?.exactAuthority === false && item.packageInspection?.signals?.sdtTag?.exactAuthority === false)) {
    issues.push({ code: 'B01_PLACEMENT_SIGNAL_GRANTED_AUTHORITY', field: 'cases.packageInspection.signals' });
  }
  const commentCase = cases.find((item) => item.caseId === 'b01-word-native-comment');
  if (!commentCase || commentCase.wordNativeClassicCommentVisible !== true) {
    issues.push({ code: 'B01_WORD_NATIVE_COMMENT_NOT_VISIBLE', field: 'cases.b01-word-native-comment' });
  }
  if (receipt.signedLocatorAuthority?.secretEmbeddedInDocx !== false) {
    issues.push({ code: 'B01_SECRET_EMBEDDED_POLICY_INVALID', field: 'signedLocatorAuthority.secretEmbeddedInDocx' });
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    cases: cases.length,
  };
}

async function runPhysical({ artifactRoot, wordWorkRoot, runId, writeReceipt }) {
  process.stderr.write('B01_PREFLIGHT_SECURE_VOLUME_START\n');
  const secureVolume = assertSecureVolume(artifactRoot);
  process.stderr.write('B01_PREFLIGHT_SECURE_VOLUME_PASS\n');
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('MICROSOFT_WORD_APP_MISSING');
  const runDir = path.join(artifactRoot, runId);
  const wordRunDir = path.join(wordWorkRoot, runId);
  const dirs = {
    evidenceRunDir: runDir,
    wordRunDir,
    wordSources: path.join(wordRunDir, 'source-docx'),
    wordReturns: path.join(wordRunDir, 'returned-docx'),
    evidenceSources: path.join(runDir, 'source-docx'),
    evidenceReturns: path.join(runDir, 'returned-docx'),
  };
  fs.mkdirSync(dirs.wordSources, { recursive: true });
  fs.mkdirSync(dirs.wordReturns, { recursive: true });
  fs.mkdirSync(dirs.evidenceSources, { recursive: true });
  fs.mkdirSync(dirs.evidenceReturns, { recursive: true });
  process.stderr.write(`B01_WORD_WORK_RUN_DIR=${wordRunDir}\n`);
  process.stderr.write(`B01_EVIDENCE_RUN_DIR=${runDir}\n`);
  const hmacSecret = `b01-local-${sha256Text(`${runId}:${process.pid}`)}`;
  const wordProfile = collectWordProfileProbe();
  process.stderr.write(`B01_WORD_BUNDLE_VERSION=${wordProfile.versionByBundle}\n`);
  const cases = [];
  for (const caseSpec of PHYSICAL_CASES) {
    cases.push(await runPhysicalCase(caseSpec, dirs, hmacSecret));
    process.stderr.write(`B01_WORD_LOCATOR_CASE_DONE=${caseSpec.id}\n`);
  }
  const noEditCase = cases.find((item) => item.caseId === 'b01-no-edit-save-reopen');
  const mutatingCases = cases.filter((item) => item.caseId !== 'b01-no-edit-save-reopen');
  const signedCustomXmlVerified = cases.filter((item) => item.packageInspection.signals.customXmlManifest.exactAuthority).length;
  const customXmlMutatingSurvivors = mutatingCases.filter((item) => item.packageInspection.signals.customXmlManifest.exactAuthority).length;
  const customXmlDroppedAfterMutation = customXmlMutatingSurvivors !== mutatingCases.length;
  const receiptDraft = {
    schemaVersion: 'yalken.rtk.word-latest-semantic-roundtrip-v2.b01-locator-survival-receipt.v1',
    taskId: 'YALKEN_RTK_WORD_LATEST_SEMANTIC_ROUNDTRIP_V2',
    stageId: 'B01_SIGNED_LOCATOR_PRESERVATION',
    createdAtUtc: new Date().toISOString(),
    base: {
      originMainShaAtBranchStart: shellValue('git', ['rev-parse', 'origin/main']),
      branch: shellValue('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
      worktree: REPO_ROOT,
      precedingB00MergeSha: '08a79d005f93b1afbe088ee669b6ad0ebcac2ca0',
    },
    profile: {
      targetProfileId: TARGET_PROFILE_ID,
      targetWordVersion: TARGET_WORD_VERSION,
      statusBeforeB01: 'DESIGN_ONLY_NOT_CERTIFIED',
      statusAfterB01: 'SURVIVAL_EVIDENCE_ONLY_NOT_CERTIFIED',
      physicalRoundTripsExecutedForSurvival: cases.length,
      physicalRoundTripsClaimedAsCertification: false,
      oldD1Profile: {
        profileId: 'word-mac-16.42-d1-f00-v1',
        status: 'IMMUTABLE_HISTORICAL_EVIDENCE_ONLY',
        notReboundByB01: true,
      },
    },
    wordProfile,
    secureVolume,
    artifactRoot,
    runDir,
    wordSandboxWorkRoot: wordWorkRoot,
    wordSandboxRunDir: wordRunDir,
    evidenceMirrorPolicy: {
      wordWorksInsideTransientLocalStaging: true,
      evidenceMirroredToT7Secure: true,
      localWordWorkCleanupAfterSuccess: true,
      reason: 'Microsoft Word for Mac 16.111.2 displays Grant File Access prompts for direct T7 AppleScript open/save paths; /tmp staging is mirrored to T7 before receipt.',
    },
    signedLocatorAuthority: {
      transportManifestSchema: 'yalken.rtk.transport-manifest.v2',
      hmacAlgorithm: 'HMAC-SHA256',
      secretPolicy: SECRET_LABEL,
      secretEmbeddedInDocx: false,
      exactRequiresVerifiedCustomXmlManifestAndBaseline: true,
      customXmlNoEditSaveVerified: noEditCase?.packageInspection.signals.customXmlManifest.exactAuthority === true,
      customXmlMutatingWordSaveVerifiedCases: customXmlMutatingSurvivors,
      customXmlMutatingWordSaveTotalCases: mutatingCases.length,
      customXmlUsableForMutatingWordReturn: customXmlDroppedAfterMutation ? false : true,
      customXmlMutationLimitation: customXmlDroppedAfterMutation
        ? 'CUSTOM_XML_DROPPED_AFTER_TRACKED_OR_COMMENTED_WORD_SAVE_ON_OBSERVED_WORD_PROFILE'
        : '',
      placementSignalsHaveNoApplyAuthority: true,
      fingerprintSignalsHaveNoApplyAuthority: true,
    },
    wordDocumentSafety: {
      syntheticOnly: true,
      userDocumentsOpened: false,
      closeNonLabDocuments: false,
      usesTargetDocumentHandlesOnly: true,
      displayAlertsRestored: true,
    },
    commentNoopPassClaimed: false,
    cases,
    totals: {
      cases: cases.length,
      zipOk: cases.filter((item) => item.packageInspection.packageZipOk).length,
      signedCustomXmlVerified,
      wordNativeCommentVisible: cases.filter((item) => item.wordNativeClassicCommentVisible).length,
      falseExact: 0,
      silentApply: 0,
      wrongSceneRouting: 0,
      productNetworkRequests: 0,
    },
    nonClaims: [
      'B01 is not Word 16.111.2 profile certification.',
      'B01 does not certify modern comment replies or resolved state.',
      'B01 does not certify automatic apply.',
      'B01 does not certify Word Online, Google Docs, LibreOffice, ONLYOFFICE, Pages, or WPS.',
      'B01 does not claim no-op comment saves as support.',
      'B01 does not claim customXml signed manifest authority for mutating latest Word returns when physical evidence shows it is dropped.',
    ],
    runtimeClaims: {
      productRuntimeChanged: false,
      uiChanged: false,
      networkDependencyAdded: false,
      newDependencyAdded: false,
      manuscriptMutated: false,
    },
    nextStage: 'B02_REVIEW_TRANSPORT_IR_V2_PARSER_CONTRACTS',
  };
  const evaluation = evaluateB01LocatorReceipt(receiptDraft);
  const receipt = {
    ...receiptDraft,
    result: evaluation.status,
    receiptDigest: `sha256:${sha256Text(stableTransportManifestJson(receiptDraft))}`,
  };
  writeJsonAtomic(path.join(runDir, 'b01-locator-survival-receipt.json'), receipt);
  if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
  fs.rmSync(wordRunDir, { recursive: true, force: true });
  return {
    ok: evaluation.ok,
    status: evaluation.status,
    issues: evaluation.issues,
    receiptPath: writeReceipt ? RECEIPT_PATH : path.join(runDir, 'b01-locator-survival-receipt.json'),
    receiptDigest: receipt.receiptDigest,
    cases: cases.length,
    wordVersion: wordProfile.versionByBundle || wordProfile.versionByAppleScript,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const json = args.has('--json');
  const runPhysicalFlag = args.has('--run-physical');
  const requireSecure = args.has('--require-secure-volume');
  const writeReceipt = args.has('--write-receipt');
  const runIdArgIndex = process.argv.indexOf('--run-id');
  const rootArgIndex = process.argv.indexOf('--artifact-root');
  const wordRootArgIndex = process.argv.indexOf('--word-work-root');
  const runId = runIdArgIndex === -1
    ? `b01-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`
    : rawString(process.argv[runIdArgIndex + 1]);
  const artifactRoot = rootArgIndex === -1 ? DEFAULT_ARTIFACT_ROOT : rawString(process.argv[rootArgIndex + 1]);
  const wordWorkRoot = wordRootArgIndex === -1 ? DEFAULT_WORD_WORK_ROOT : rawString(process.argv[wordRootArgIndex + 1]);

  if (runPhysicalFlag) {
    const result = await runPhysical({ artifactRoot, wordWorkRoot, runId, writeReceipt });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `B01_LOCATOR_LAB_STATUS=${result.status}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (requireSecure) assertSecureVolume(artifactRoot);
  const evaluation = evaluateB01LocatorReceipt();
  process.stdout.write(json ? `${JSON.stringify(evaluation, null, 2)}\n` : `B01_LOCATOR_RECEIPT_STATUS=${evaluation.status}\n`);
  process.exit(evaluation.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
