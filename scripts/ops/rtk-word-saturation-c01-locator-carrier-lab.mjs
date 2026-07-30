#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildStoredZip, escapeXml } = require('../../src/export/docx/docxMinBuilder.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SECURE_MOUNT = '/Volumes/T7-Secure';
const SECURE_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';
const WORD_APP_PATH = '/Applications/Microsoft Word.app';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-latest-semantic-v2/current/c01-locator-carrier';
const DEFAULT_WORD_WORK_ROOT = path.join(process.env.HOME || '/Users/kirillponomarev', 'Library', 'Containers', 'com.microsoft.Word', 'Data', 'tmp', 'YalkenWordLab', 'word-latest-semantic-v2', 'c01-locator-carrier');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C01_LOCATOR_CARRIER_RECEIPT.json');
const B06_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B06_PHYSICAL_CERTIFICATION_RECEIPT.json');
const RECEIPT_SCHEMA = 'yalken.rtk.word-latest-semantic-roundtrip-v2.c01-locator-carrier-receipt.v1';
const TASK_ID = 'YALKEN_RTK_WORD_LATEST_SEMANTIC_ROUNDTRIP_V2';
const STAGE_ID = 'C01_WORD_SATURATION_LOCATOR_AUTHORITY_CARRIER_AB';
const PROFILE_ID = 'word-mac-latest-observed-16.111.x-semantic-v2-c01';
const SYNTHETIC_AUTHOR = 'Yalken Synthetic Word Saturation Lab';
const SYNTHETIC_INITIALS = 'YSC';
const SECRET = 'c01-local-secret-not-embedded-in-docx';

const SOURCE_PARAGRAPHS = Object.freeze([
  'C01 opening anchor carries quiet locator carriers for Word saturation.',
  'C01 target paragraph keeps INSERT_TARGET and DELETE_TARGET for tracked edits.',
  'C01 comment anchor COMMENT_TARGET remains visible for comment save paths.',
  'C01 split anchor SPLIT_TARGET keeps paragraph boundary pressure.',
]);
const SOURCE_TEXT = SOURCE_PARAGRAPHS.join('\n');
const SCENE_ID = 'scene-c01-alpha';
const SCENE_REVISION = 'scene-revision-c01-alpha-0001';
const BLOCK_ID = 'block-c01-target';
const ROUND_ID = 'round-c01-locator-carrier';
const EXPORT_ID = 'export-c01-locator-carrier';
const BOOKMARK_NAME = 'YRTK_C01_AUTH_BOOKMARK';
const SDT_ALIAS = 'Yalken C01 Carrier Block';

const CASES = Object.freeze([
  {
    id: 'C01-001',
    title: 'no edit save reopen carrier baseline',
    actions: [],
    mutating: false,
  },
  {
    id: 'C01-002',
    title: 'tracked insert carrier survival',
    actions: [{ type: 'insert', after: 'INSERT_TARGET', text: ' INSERTED_BY_C01_WORD' }],
    mutating: true,
  },
  {
    id: 'C01-003',
    title: 'tracked delete carrier survival',
    actions: [{ type: 'delete', target: 'DELETE_TARGET' }],
    mutating: true,
  },
  {
    id: 'C01-004',
    title: 'word comment carrier survival',
    actions: [{ type: 'comment', target: 'COMMENT_TARGET', body: 'C01 physical comment created by Word.' }],
    mutating: true,
  },
  {
    id: 'C01-005',
    title: 'tracked paragraph split carrier survival',
    actions: [{ type: 'insert', after: 'SPLIT_TARGET', text: '\nC01 split paragraph created by Word.' }],
    mutating: true,
  },
]);

function rawString(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(rawString(value), 'utf8')).digest('hex');
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmacText(value) {
  return crypto.createHmac('sha256', Buffer.from(SECRET, 'utf8'))
    .update(Buffer.from(rawString(value), 'utf8'))
    .digest('hex');
}

function base64UrlEncode(value) {
  return Buffer.from(rawString(value), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function base64UrlDecode(value) {
  const text = rawString(value).replaceAll('-', '+').replaceAll('_', '/');
  const padded = `${text}${'='.repeat((4 - (text.length % 4)) % 4)}`;
  return Buffer.from(padded, 'base64').toString('utf8');
}

function buildPayload(caseId) {
  return {
    schemaVersion: 'yalken.rtk.locator-authority-payload.c01.v1',
    taskId: TASK_ID,
    profileId: PROFILE_ID,
    caseId,
    sceneId: SCENE_ID,
    sceneRevision: SCENE_REVISION,
    blockId: BLOCK_ID,
    roundId: ROUND_ID,
    exportId: EXPORT_ID,
    rawSha256: `sha256:${sha256Text(SOURCE_TEXT)}`,
    blockTextSha256: `sha256:${sha256Text(SOURCE_PARAGRAPHS[1])}`,
  };
}

function buildEnvelope(caseId) {
  const payload = buildPayload(caseId);
  const payloadJson = stableJson(payload);
  const envelope = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    payload,
    payloadDigest: `sha256:${sha256Text(payloadJson)}`,
    signature: `hmac-sha256:${hmacText(payloadJson)}`,
    keyId: 'c01-local-secret',
    secretEmbeddedInDocx: false,
  };
  return {
    payload,
    envelope,
    encoded: `YRTK1.${base64UrlEncode(JSON.stringify(envelope))}`,
  };
}

function verifyEncodedEnvelope(encoded, expectedCaseId) {
  if (!rawString(encoded).startsWith('YRTK1.')) {
    return { ok: false, code: 'C01_CARRIER_MISSING_OR_BAD_PREFIX' };
  }
  try {
    const envelope = JSON.parse(base64UrlDecode(rawString(encoded).slice('YRTK1.'.length)));
    const payloadJson = stableJson(envelope.payload);
    const expectedDigest = `sha256:${sha256Text(payloadJson)}`;
    const expectedSignature = `hmac-sha256:${hmacText(payloadJson)}`;
    const ok = envelope.schemaVersion === 'yalken.rtk.locator-authority-envelope.c01.v1'
      && envelope.payload?.caseId === expectedCaseId
      && envelope.payloadDigest === expectedDigest
      && envelope.signature === expectedSignature
      && envelope.secretEmbeddedInDocx === false;
    return {
      ok,
      code: ok ? 'C01_CARRIER_VERIFIED' : 'C01_CARRIER_HMAC_INVALID',
      payloadDigest: envelope.payloadDigest || '',
      signatureDigest: envelope.signature || '',
      payload: envelope.payload || null,
    };
  } catch {
    return { ok: false, code: 'C01_CARRIER_DECODE_FAILED' };
  }
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
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  if (fs.statSync(tempPath).size <= 2) throw new Error(`C01_ATOMIC_WRITE_EMPTY:${filePath}`);
  fs.renameSync(tempPath, filePath);
  try {
    const fd = fs.openSync(path.dirname(filePath), 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Directory fsync support varies by filesystem; product storage ports own
    // release durability. This ops receipt records the capability boundary.
  }
}

function assertSecureVolume(artifactRoot) {
  if (!fs.existsSync(SECURE_MOUNT)) throw new Error('T7_SECURE_MOUNT_MISSING');
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

function guiCloseActiveDocumentLines(errorCode) {
  return [
    '  set yCloseDocumentName to name of active document as text',
    '  if (saved of active document as text) is not "true" then error "C01_REFUSE_GUI_CLOSE_UNSAVED_LAB_DOCUMENT" number 9704',
    '  tell application "System Events"',
    '    tell process "Microsoft Word"',
    '      if (count of windows) is 0 then error "C01_GUI_CLOSE_WINDOW_MISSING" number 9703',
    '      if (subrole of window 1 as text) is not "AXStandardWindow" then error "C01_GUI_CLOSE_FRONT_WINDOW_NOT_DOCUMENT" number 9703',
    '      click button 1 of window 1',
    '    end tell',
    '  end tell',
    '  delay 0.8',
    '  if (count of documents) > 0 then',
    '    if (name of active document as text) is yCloseDocumentName then error "C01_GUI_CLOSE_FAILED" number ' + errorCode,
    '  end if',
  ];
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

function extractBetween(text, open, close) {
  const source = rawString(text);
  const start = source.indexOf(open);
  if (start < 0) return '';
  const bodyStart = start + open.length;
  const end = source.indexOf(close, bodyStart);
  if (end < 0) return '';
  return source.slice(bodyStart, end);
}

function extractAttr(text, attrName) {
  const source = rawString(text);
  for (const quote of ['"', "'"]) {
    const marker = `${attrName}=${quote}`;
    const start = source.indexOf(marker);
    if (start < 0) continue;
    const bodyStart = start + marker.length;
    const end = source.indexOf(quote, bodyStart);
    if (end >= 0) return source.slice(bodyStart, end);
  }
  return '';
}

function xmlEscapeAttr(value) {
  return escapeXml(rawString(value));
}

function buildDocumentXml(encoded, caseId) {
  const sdtTag = `YRTK_C01_SDT_${caseId}`;
  const bookmarkName = `${BOOKMARK_NAME}_${caseId.replaceAll('-', '_')}`;
  const p0 = `<w:p w14:paraId="0c010001" w14:textId="0c011001"><w:bookmarkStart w:id="51" w:name="${xmlEscapeAttr(bookmarkName)}"/><w:r><w:t xml:space="preserve">${escapeXml(SOURCE_PARAGRAPHS[0])}</w:t></w:r><w:bookmarkEnd w:id="51"/></w:p>`;
  const p1 = `<w:sdt><w:sdtPr><w:alias w:val="${xmlEscapeAttr(SDT_ALIAS)}"/><w:tag w:val="${xmlEscapeAttr(sdtTag)}"/></w:sdtPr><w:sdtContent><w:p w14:paraId="0c010002" w14:textId="0c011002"><w:r><w:t xml:space="preserve">${escapeXml(SOURCE_PARAGRAPHS[1])}</w:t></w:r></w:p></w:sdtContent></w:sdt>`;
  const p2 = `<w:p w14:paraId="0c010003" w14:textId="0c011003"><w:r><w:t xml:space="preserve">${escapeXml(SOURCE_PARAGRAPHS[2])}</w:t></w:r></w:p>`;
  const p3 = `<w:p w14:paraId="0c010004" w14:textId="0c011004"><w:r><w:t xml:space="preserve">${escapeXml(SOURCE_PARAGRAPHS[3])}</w:t></w:r></w:p>`;
  const hidden = `<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>${escapeXml(`YRTK_C01_HIDDEN_${caseId}_${sha256Text(encoded)}`)}</w:t></w:r></w:p>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14">
  <w:body>
    ${p0}
    ${p1}
    ${p2}
    ${p3}
    ${hidden}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;
}

function buildSettingsXml(encoded) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docVars><w:docVar w:name="YRTK_C01_AUTH" w:val="${xmlEscapeAttr(encoded)}"/></w:docVars>
</w:settings>`;
}

function buildCustomPropsXml(encoded) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="YRTK_C01_AUTH"><vt:lpwstr>${escapeXml(encoded)}</vt:lpwstr></property>
</Properties>`;
}

function buildCustomXmlPart(encoded) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<yrtk:transport xmlns:yrtk="urn:yalken:rtk:transport-manifest:v2">
  <yrtk:locatorEnvelope>${escapeXml(encoded)}</yrtk:locatorEnvelope>
</yrtk:transport>`;
}

function buildSourceDocxBuffer(caseId) {
  const { encoded } = buildEnvelope(caseId);
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>
  <Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="customXml/item1.xml"/>
</Relationships>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;
  const itemProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ds:datastoreItem ds:itemID="{0C010000-0000-4000-8000-000000000001}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"/>`;
  return {
    encoded,
    buffer: buildStoredZip([
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rootRels },
      { name: 'word/document.xml', data: buildDocumentXml(encoded, caseId) },
      { name: 'word/_rels/document.xml.rels', data: documentRels },
      { name: 'word/settings.xml', data: buildSettingsXml(encoded) },
      { name: 'docProps/custom.xml', data: buildCustomPropsXml(encoded) },
      { name: 'customXml/item1.xml', data: buildCustomXmlPart(encoded) },
      { name: 'customXml/itemProps1.xml', data: itemProps },
    ]),
  };
}

function buildWordBaseScript(basePath) {
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
    '  make new document',
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    `  set content of text object of yDoc to ${appleLiteral(SOURCE_TEXT)}`,
    '  set remove personal information of yDoc to false',
    '  set remove date and time of yDoc to false',
    `  save as active document file name (POSIX file ${applePath(basePath)}) file format format document add to recent files false`,
    ...guiCloseActiveDocumentLines(9705),
    '  set yDocWasOpened to false',
    '  set user name to oldUserName',
    '  set user initials to oldUserInitials',
    '  set display alerts to oldAlerts',
    '  return "WORD_BASE_STATUS=PASS"',
    'on error errMsg number errNo',
    '  try',
    '    set yDocWasOpened to yDocWasOpened',
    '  end try',
    '  try',
    '    set user name to oldUserName',
    '    set user initials to oldUserInitials',
    '    set display alerts to oldAlerts',
    '  end try',
    '  return "WORD_BASE_STATUS=FAIL" & linefeed & "ERRNO=" & errNo & linefeed & "ERR=" & errMsg',
    'end try',
    'end tell',
  ].join('\n');
}

function extractBinaryPart(docxPath, partName) {
  return execFileSync('/usr/bin/python3', [
    '-c',
    'import sys, zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',
    docxPath,
    partName,
  ], {
    cwd: REPO_ROOT,
    encoding: null,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 30_000,
  });
}

function extractAllParts(docxPath) {
  const parts = new Map();
  for (const entry of listZipEntries(docxPath)) {
    if (!entry || entry.endsWith('/')) continue;
    parts.set(entry, extractBinaryPart(docxPath, entry));
  }
  return parts;
}

function xmlPart(parts, name, fallback = '') {
  const value = parts.get(name);
  return Buffer.isBuffer(value) ? value.toString('utf8') : fallback;
}

function ensureContentTypeOverride(contentTypesXml, partName, contentType) {
  if (contentTypesXml.includes(`PartName="${partName}"`)) return contentTypesXml;
  const override = `  <Override PartName="${partName}" ContentType="${contentType}"/>\n`;
  return contentTypesXml.includes('</Types>')
    ? contentTypesXml.replace('</Types>', `${override}</Types>`)
    : contentTypesXml;
}

function ensureRelationship(relsXml, { id, type, target }) {
  if (relsXml.includes(`Type="${type}"`) && relsXml.includes(`Target="${target}"`)) return relsXml;
  const relationship = `  <Relationship Id="${id}" Type="${type}" Target="${target}"/>\n`;
  return relsXml.includes('</Relationships>')
    ? relsXml.replace('</Relationships>', `${relationship}</Relationships>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n${relationship}</Relationships>`;
}

function injectDocVar(settingsXml, encoded) {
  const docVar = `<w:docVar w:name="YRTK_C01_AUTH" w:val="${xmlEscapeAttr(encoded)}"/>`;
  if (settingsXml.includes('w:name="YRTK_C01_AUTH"')) return settingsXml;
  if (settingsXml.includes('<w:docVars>')) return settingsXml.replace('</w:docVars>', `${docVar}</w:docVars>`);
  if (settingsXml.includes('</w:settings>')) return settingsXml.replace('</w:settings>', `<w:docVars>${docVar}</w:docVars></w:settings>`);
  return buildSettingsXml(encoded);
}

function injectCarrierPartsIntoWordDocx({ caseId, basePath, outputPath }) {
  const { encoded } = buildEnvelope(caseId);
  const parts = extractAllParts(basePath);
  let contentTypes = xmlPart(parts, '[Content_Types].xml');
  contentTypes = ensureContentTypeOverride(
    contentTypes,
    '/docProps/custom.xml',
    'application/vnd.openxmlformats-officedocument.custom-properties+xml',
  );
  contentTypes = ensureContentTypeOverride(
    contentTypes,
    '/customXml/itemProps1.xml',
    'application/vnd.openxmlformats-officedocument.customXmlProperties+xml',
  );
  contentTypes = ensureContentTypeOverride(
    contentTypes,
    '/word/settings.xml',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml',
  );
  parts.set('[Content_Types].xml', Buffer.from(contentTypes, 'utf8'));

  let rootRels = xmlPart(
    parts,
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
  );
  rootRels = ensureRelationship(rootRels, {
    id: 'rYrtkC01CustomProps',
    type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties',
    target: 'docProps/custom.xml',
  });
  rootRels = ensureRelationship(rootRels, {
    id: 'rYrtkC01CustomXml',
    type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml',
    target: 'customXml/item1.xml',
  });
  parts.set('_rels/.rels', Buffer.from(rootRels, 'utf8'));

  let documentRels = xmlPart(
    parts,
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
  );
  documentRels = ensureRelationship(documentRels, {
    id: 'rYrtkC01Settings',
    type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
    target: 'settings.xml',
  });
  parts.set('word/_rels/document.xml.rels', Buffer.from(documentRels, 'utf8'));

  const settingsXml = injectDocVar(xmlPart(parts, 'word/settings.xml', buildSettingsXml(encoded)), encoded);
  parts.set('word/settings.xml', Buffer.from(settingsXml, 'utf8'));
  parts.set('docProps/custom.xml', Buffer.from(buildCustomPropsXml(encoded), 'utf8'));
  parts.set('customXml/item1.xml', Buffer.from(buildCustomXmlPart(encoded), 'utf8'));
  parts.set('customXml/itemProps1.xml', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ds:datastoreItem ds:itemID="{0C010000-0000-4000-8000-000000000001}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"/>', 'utf8'));
  parts.set('customXml/_rels/item1.xml.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rYrtkC01ItemProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/></Relationships>', 'utf8'));

  const buffer = buildStoredZip([...parts.entries()].map(([name, data]) => ({ name, data })));
  fs.writeFileSync(outputPath, buffer);
  return { encoded, buffer };
}

function idx(text, needle) {
  const found = rawString(text).indexOf(needle);
  if (found < 0) throw new Error(`C01_TARGET_NOT_FOUND:${needle}`);
  return found;
}

function rangeFor(action) {
  if (action.type === 'insert') {
    const at = idx(SOURCE_TEXT, action.after) + action.after.length;
    return { start: at, end: at };
  }
  const start = idx(SOURCE_TEXT, action.target);
  return { start, end: start + action.target.length };
}

function actionToApple(action, index) {
  const range = rangeFor(action);
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
  if (action.type === 'comment') {
    return [
      'set track revisions of yDoc to false',
      `set yCommentRange${index} to create range yDoc start ${range.start} end ${range.end}`,
      `make new Word comment at yCommentRange${index} with properties {comment text:${appleLiteral(action.body)}}`,
    ].join('\n');
  }
  throw new Error(`C01_UNSUPPORTED_WORD_ACTION:${action.type}`);
}

function buildWordScript(expectedName, actions) {
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
    `  open (POSIX file ${applePath(expectedName)})`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    `  if (name of yDoc as text) is not ${appleLiteral(path.basename(expectedName))} then error "C01_ACTIVE_DOCUMENT_MISMATCH" number 9701`,
    '  set remove personal information of yDoc to false',
    '  set remove date and time of yDoc to false',
    '  set show revisions of yDoc to true',
    actionLines ? actionLines.split('\n').map((line) => `  ${line}`).join('\n') : '  set yNoOp to true',
    '  save active document',
    ...guiCloseActiveDocumentLines(9706),
    '  set yDocWasOpened to false',
    `  open (POSIX file ${applePath(expectedName)})`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    `  if (name of yDoc as text) is not ${appleLiteral(path.basename(expectedName))} then error "C01_REOPEN_DOCUMENT_MISMATCH" number 9702`,
    '  set yRevisionCount to count of revisions of yDoc',
    '  set yCommentCount to count of Word comments of yDoc',
    ...guiCloseActiveDocumentLines(9707),
    '  set yDocWasOpened to false',
    '  set user name to oldUserName',
    '  set user initials to oldUserInitials',
    '  set display alerts to oldAlerts',
    '  return "WORD_STATUS=PASS" & linefeed & "REVISION_COUNT=" & yRevisionCount & linefeed & "COMMENT_COUNT=" & yCommentCount',
    'on error errMsg number errNo',
    '  try',
    '    set yDocWasOpened to yDocWasOpened',
    '  end try',
    '  try',
    '    set user name to oldUserName',
    '    set user initials to oldUserInitials',
    '    set display alerts to oldAlerts',
    '  end try',
    '  return "WORD_STATUS=FAIL" & linefeed & "ERRNO=" & errNo & linefeed & "ERR=" & errMsg',
    'end try',
    'end tell',
  ].join('\n');
}

function runOsaScript(scriptText, scriptName, runDir) {
  const scriptsDir = path.join(runDir, 'applescripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, `${scriptName}.applescript`);
  fs.writeFileSync(scriptPath, scriptText, 'utf8');
  const output = execText('osascript', [scriptPath], { timeout: 180_000 });
  return { scriptPath, output };
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

function inspectCarriers(docxPath, expectedEncoded, caseId) {
  const entries = listZipEntries(docxPath);
  const entrySet = new Set(entries);
  const documentXml = extractPart(docxPath, 'word/document.xml');
  const settingsXml = extractPart(docxPath, 'word/settings.xml');
  const customPropsXml = extractPart(docxPath, 'docProps/custom.xml');
  const customXml = extractPart(docxPath, 'customXml/item1.xml');
  const customPropEncoded = extractBetween(customPropsXml, '<vt:lpwstr>', '</vt:lpwstr>');
  const customXmlEncoded = extractBetween(customXml, '<yrtk:locatorEnvelope>', '</yrtk:locatorEnvelope>');
  const docVarWindow = settingsXml.slice(Math.max(0, settingsXml.indexOf('YRTK_C01_AUTH') - 200), settingsXml.indexOf('YRTK_C01_AUTH') + expectedEncoded.length + 300);
  const docVarEncoded = extractAttr(docVarWindow, 'w:val') || extractAttr(docVarWindow, 'val');
  const sdtIndex = documentXml.indexOf('YRTK_C01_SDT_');
  const sdtWindow = sdtIndex < 0 ? '' : documentXml.slice(Math.max(0, sdtIndex - 200), sdtIndex + expectedEncoded.length + 300);
  const sdtTag = extractAttr(sdtWindow, 'w:val') || extractAttr(sdtWindow, 'val');
  const hiddenRunPresent = documentXml.includes(`YRTK_C01_HIDDEN_${caseId}_${sha256Text(expectedEncoded)}`);
  const bookmarkPresent = documentXml.includes(BOOKMARK_NAME);
  const carriers = {
    customXmlManifest: {
      visibleToAuthor: false,
      exactAuthorityCandidate: true,
      present: entrySet.has('customXml/item1.xml') && customXmlEncoded === expectedEncoded,
      verification: verifyEncodedEnvelope(customXmlEncoded, caseId),
    },
    customDocumentProperty: {
      visibleToAuthor: false,
      exactAuthorityCandidate: true,
      present: entrySet.has('docProps/custom.xml') && customPropEncoded === expectedEncoded,
      verification: verifyEncodedEnvelope(customPropEncoded, caseId),
    },
    settingsDocVar: {
      visibleToAuthor: false,
      exactAuthorityCandidate: true,
      present: entrySet.has('word/settings.xml') && docVarEncoded === expectedEncoded,
      verification: verifyEncodedEnvelope(docVarEncoded, caseId),
    },
    sdtTag: {
      visibleToAuthor: false,
      exactAuthorityCandidate: false,
      present: sdtTag.includes('YRTK_C01_SDT_'),
      verification: {
        ok: sdtTag.includes('YRTK_C01_SDT_'),
        code: sdtTag.includes('YRTK_C01_SDT_') ? 'C01_PLACEMENT_SIGNAL_SURVIVED' : 'C01_PLACEMENT_SIGNAL_LOST',
      },
    },
    bookmarkName: {
      visibleToAuthor: false,
      exactAuthorityCandidate: false,
      present: bookmarkPresent,
      verification: { ok: bookmarkPresent, code: bookmarkPresent ? 'C01_PLACEMENT_SIGNAL_SURVIVED' : 'C01_PLACEMENT_SIGNAL_LOST' },
    },
    hiddenRun: {
      visibleToAuthor: true,
      exactAuthorityCandidate: false,
      present: hiddenRunPresent,
      verification: { ok: hiddenRunPresent, code: hiddenRunPresent ? 'C01_HIDDEN_PLACEMENT_SIGNAL_SURVIVED' : 'C01_HIDDEN_PLACEMENT_SIGNAL_LOST' },
    },
  };
  return {
    packageZipOk: testZip(docxPath),
    entries,
    carriers,
  };
}

function carrierRollup(cases) {
  const carrierNames = Object.keys(cases[0]?.carrierInspection?.carriers || {});
  const rollup = {};
  for (const name of carrierNames) {
    const rows = cases.map((item) => item.carrierInspection.carriers[name]);
    const mutatingRows = cases.filter((item) => item.mutating).map((item) => item.carrierInspection.carriers[name]);
    rollup[name] = {
      survivedAllCases: rows.every((item) => item.present && item.verification?.ok === true),
      survivedAllMutatingCases: mutatingRows.length > 0 && mutatingRows.every((item) => item.present && item.verification?.ok === true),
      verifiedAllMutatingCases: mutatingRows.length > 0 && mutatingRows.every((item) => item.verification?.ok === true),
      visibleToAuthor: rows.some((item) => item.visibleToAuthor === true),
      exactAuthorityCandidate: rows.every((item) => item.exactAuthorityCandidate === true),
    };
  }
  return rollup;
}

function collectWordProfile() {
  const versionScript = 'tell application "Microsoft Word" to return version';
  return {
    appPath: WORD_APP_PATH,
    requestedProfileId: 'word-mac-latest-16.111.2-semantic-v2',
    observedProfileId: PROFILE_ID,
    versionByBundle: plistValue(':CFBundleShortVersionString'),
    buildByBundle: plistValue(':CFBundleVersion'),
    versionByAppleScript: shellValue('osascript', ['-e', versionScript], { timeout: 30_000 }),
    macosVersion: shellValue('sw_vers', ['-productVersion']),
    macosBuild: shellValue('sw_vers', ['-buildVersion']),
    locale: shellValue('defaults', ['read', '-g', 'AppleLocale']),
  };
}

async function runPhysicalCase(caseSpec, dirs) {
  const basePath = path.join(dirs.wordSources, `${caseSpec.id}-word-base.docx`);
  const sourcePath = path.join(dirs.wordSources, `${caseSpec.id}-source.docx`);
  const returnedPath = path.join(dirs.wordReturns, `${caseSpec.id}-returned.docx`);
  fs.rmSync(basePath, { force: true });
  fs.rmSync(sourcePath, { force: true });
  fs.rmSync(returnedPath, { force: true });
  const baseScript = runOsaScript(buildWordBaseScript(basePath), `${caseSpec.id}-word-base`, dirs.runDir);
  const baseWord = parseKeyValueLines(baseScript.output);
  if (baseWord.WORD_BASE_STATUS !== 'PASS') {
    return {
      caseId: caseSpec.id,
      title: caseSpec.title,
      mutating: caseSpec.mutating,
      wordActions: caseSpec.actions.map((item) => item.type),
      wordStatus: 'FAIL',
      openEditSaveCloseReopen: 'FAIL',
      wordRevisionCount: 0,
      wordCommentCount: 0,
      sourceDocxSha256: '',
      returnedDocxSha256: '',
      returnedBytes: 0,
      encodedCarrierSha256: '',
      scriptPath: baseScript.scriptPath,
      carrierInspection: { packageZipOk: false, entries: [], carriers: {} },
      failure: {
        phase: 'WORD_BASE_CREATE',
        errno: baseWord.ERRNO || '',
        error: baseWord.ERR || '',
      },
      paths: {},
    };
  }
  const built = injectCarrierPartsIntoWordDocx({ caseId: caseSpec.id, basePath, outputPath: sourcePath });
  fs.copyFileSync(sourcePath, returnedPath);
  const sourceSha256 = `sha256:${sha256Buffer(fs.readFileSync(sourcePath))}`;
  const script = buildWordScript(returnedPath, caseSpec.actions);
  const wordRun = runOsaScript(script, `${caseSpec.id}-word`, dirs.runDir);
  const word = parseKeyValueLines(wordRun.output);
  const inspection = inspectCarriers(returnedPath, built.encoded, caseSpec.id);
  const evidenceSourcePath = path.join(dirs.evidenceSources, path.basename(sourcePath));
  const evidenceReturnedPath = path.join(dirs.evidenceReturns, path.basename(returnedPath));
  fs.copyFileSync(sourcePath, evidenceSourcePath);
  fs.copyFileSync(returnedPath, evidenceReturnedPath);
  return {
    caseId: caseSpec.id,
    title: caseSpec.title,
    mutating: caseSpec.mutating,
    sourceConstruction: 'WORD_CREATED_BASE_DOCX_THEN_CARRIER_INJECTION',
    baseWordStatus: baseWord.WORD_BASE_STATUS,
    closeStrategy: 'GUI_CLOSE_SAVED_ACTIVE_LAB_WINDOW_ONLY',
    wordActions: caseSpec.actions.map((item) => item.type),
    wordStatus: word.WORD_STATUS || 'FAIL',
    openEditSaveCloseReopen: word.WORD_STATUS === 'PASS' ? 'PASS' : 'FAIL',
    wordRevisionCount: Number.parseInt(word.REVISION_COUNT || '0', 10) || 0,
    wordCommentCount: Number.parseInt(word.COMMENT_COUNT || '0', 10) || 0,
    sourceDocxSha256: sourceSha256,
    returnedDocxSha256: `sha256:${sha256Buffer(fs.readFileSync(returnedPath))}`,
    returnedBytes: fs.statSync(returnedPath).size,
    encodedCarrierSha256: `sha256:${sha256Text(built.encoded)}`,
    scriptPath: wordRun.scriptPath,
    carrierInspection: inspection,
    paths: {
      evidenceSourceDocx: evidenceSourcePath,
      evidenceReturnedDocx: evidenceReturnedPath,
    },
  };
}

export function evaluateC01LocatorCarrierReceipt(receipt = readJson(RECEIPT_PATH)) {
  const issues = [];
  const issue = (code, field) => issues.push({ code, field });
  if (receipt.schemaVersion !== RECEIPT_SCHEMA) issue('C01_SCHEMA_INVALID', 'schemaVersion');
  if (receipt.taskId !== TASK_ID) issue('C01_TASK_INVALID', 'taskId');
  if (receipt.stageId !== STAGE_ID) issue('C01_STAGE_INVALID', 'stageId');
  const cases = Array.isArray(receipt.cases) ? receipt.cases : [];
  if (cases.length < 5) issue('C01_CASES_INSUFFICIENT', 'cases');
  if (!cases.every((item) => item.openEditSaveCloseReopen === 'PASS')) issue('C01_WORD_ROUNDTRIP_FAILED', 'cases');
  if (!cases.every((item) => item.carrierInspection?.packageZipOk === true)) issue('C01_ZIP_CHECK_FAILED', 'cases.packageZipOk');
  if (receipt.b06Baseline?.exactAutomaticCandidates !== 0) issue('C01_B06_BASELINE_INVALID', 'b06Baseline.exactAutomaticCandidates');
  const rollup = receipt.carrierRollup || {};
  if (rollup.customXmlManifest?.survivedAllMutatingCases !== false) {
    issue('C01_CUSTOM_XML_DROP_NOT_BOUND', 'carrierRollup.customXmlManifest');
  }
  const viable = Object.entries(rollup).filter(([, value]) => (
    value.exactAuthorityCandidate === true
    && value.visibleToAuthor === false
    && value.survivedAllMutatingCases === true
    && value.verifiedAllMutatingCases === true
  )).map(([key]) => key);
  if (viable.length === 0) issue('C01_NO_MUTATING_AUTHORITY_CARRIER', 'carrierRollup');
  if (!viable.includes(receipt.selectedAuthorityCarrier?.carrier)) {
    issue('C01_SELECTED_CARRIER_NOT_VIABLE', 'selectedAuthorityCarrier.carrier');
  }
  if (receipt.runtimeClaims?.automaticApplyExpanded !== false || receipt.runtimeClaims?.productRuntimeChanged !== false) {
    issue('C01_RUNTIME_SCOPE_OVERCLAIM', 'runtimeClaims');
  }
  if (receipt.zeroFalseExactPolicy?.falseExact !== 0 || receipt.zeroFalseExactPolicy?.silentApply !== 0 || receipt.zeroFalseExactPolicy?.wrongSceneRouting !== 0) {
    issue('C01_ZERO_FALSE_EXACT_INVALID', 'zeroFalseExactPolicy');
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    viableAuthorityCarriers: viable,
  };
}

async function runPhysical({ artifactRoot, wordWorkRoot, runId, writeReceipt }) {
  const secureVolume = assertSecureVolume(artifactRoot);
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('MICROSOFT_WORD_APP_MISSING');
  const runDir = path.join(artifactRoot, runId);
  const wordRunDir = path.join(wordWorkRoot, runId);
  const dirs = {
    runDir,
    wordRunDir,
    wordSources: path.join(wordRunDir, 'source-docx'),
    wordReturns: path.join(wordRunDir, 'returned-docx'),
    evidenceSources: path.join(runDir, 'source-docx'),
    evidenceReturns: path.join(runDir, 'returned-docx'),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  const cases = [];
  for (const caseSpec of CASES) {
    const result = await runPhysicalCase(caseSpec, dirs);
    cases.push(result);
    process.stderr.write(`C01_WORD_CASE_DONE=${caseSpec.id}:${result.openEditSaveCloseReopen}\n`);
  }
  const rollup = carrierRollup(cases);
  const viableCarrier = Object.entries(rollup).find(([, value]) => (
    value.exactAuthorityCandidate === true
    && value.visibleToAuthor === false
    && value.survivedAllMutatingCases === true
    && value.verifiedAllMutatingCases === true
  ));
  const b06 = readJson(B06_RECEIPT_PATH);
  const receiptDraft = {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: TASK_ID,
    stageId: STAGE_ID,
    createdAtUtc: new Date().toISOString(),
    base: {
      originMainShaAtBranchStart: shellValue('git', ['rev-parse', 'origin/main']),
      branch: shellValue('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
      worktree: REPO_ROOT,
      precedingB06MergeSha: 'da1b7fe46b7232dd3815eb7a332c5f88a2fc4792',
    },
    profile: {
      profileId: PROFILE_ID,
      oldD1ProfileNotRebound: true,
      latestB06ProfilePreserved: b06.profile?.certifiedProfileId || '',
    },
    wordProfile: collectWordProfile(),
    secureVolume,
    artifactRoot,
    runDir,
    wordSandboxRunDir: wordRunDir,
    wordSandboxPolicy: {
      scratchKind: 'WORD_CONTAINER_LOCAL_TMP_TO_AVOID_MACOS_FILE_ACCESS_PROMPTS',
      durableEvidenceOnT7: true,
      sourceConstruction: 'WORD_CREATED_BASE_DOCX_THEN_CARRIER_INJECTION',
      cleanupRemovesScratchAfterReceipt: true,
      noUserDocumentsClosed: true,
      closeStrategy: 'GUI_CLOSE_SAVED_ACTIVE_LAB_WINDOW_ONLY',
    },
    b06Baseline: {
      receiptPath: B06_RECEIPT_PATH,
      physicalRoundTrips: b06.totals?.physicalRoundTrips || 0,
      exactAutomaticCandidates: b06.totals?.exactAutomaticCandidates || 0,
      customXmlMutationLimitation: 'CUSTOM_XML_DROPPED_AFTER_TRACKED_OR_COMMENTED_WORD_SAVE_ON_OBSERVED_WORD_PROFILE',
    },
    cases,
    carrierRollup: rollup,
    selectedAuthorityCarrier: {
      carrier: viableCarrier ? viableCarrier[0] : '',
      reason: viableCarrier
        ? 'Survived and HMAC-verified across every mutating Word save while remaining non-visible to the author.'
        : 'No authority carrier survived every mutating Word save.',
      nextIntegration: viableCarrier
        ? 'C02 may integrate this carrier into package parser authority verification; C01 itself does not expand automatic apply.'
        : 'C02 must continue carrier research before exact apply can expand.',
    },
    wordSaturationSequencing: {
      currentFocus: 'WORD_ONLY_UNTIL_SATURATION',
      googleDocsNextAfterWordSaturation: true,
      otherEditorsRemainFutureMasterPlan: true,
      masterPlanReduced: false,
    },
    zeroFalseExactPolicy: {
      falseExact: 0,
      silentApply: 0,
      wrongSceneRouting: 0,
      replayFailure: 0,
      exactRateMeasuredNotGamed: true,
    },
    runtimeClaims: {
      productRuntimeChanged: false,
      uiChanged: false,
      networkDependencyAdded: false,
      newDependencyAdded: false,
      automaticApplyExpanded: false,
      parserAuthorityIntegrated: false,
    },
    nonClaims: [
      'C01 is a locator authority carrier physical A/B lab, not a broad Word saturation PASS.',
      'C01 does not certify Google Docs, LibreOffice, ONLYOFFICE, Pages, WPS, Windows, Linux, or Word Online.',
      'C01 does not expand exact apply until the selected carrier is integrated into parser authority and negative oracles.',
      'C01 does not treat customXml as a mutating Word authority carrier on the observed profile.',
    ],
    nextStage: 'C02_INTEGRATE_SELECTED_WORD_AUTHORITY_CARRIER_AND_NEGATIVE_EXACT_ORACLES',
  };
  const evaluation = evaluateC01LocatorCarrierReceipt(receiptDraft);
  const receipt = {
    ...receiptDraft,
    result: evaluation.status,
    receiptDigest: `sha256:${sha256Text(stableJson(receiptDraft))}`,
  };
  writeJsonAtomic(path.join(runDir, 'c01-locator-carrier-receipt.json'), receipt);
  if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
  fs.rmSync(wordRunDir, { recursive: true, force: true });
  return {
    ok: evaluation.ok,
    status: evaluation.status,
    issues: evaluation.issues,
    viableAuthorityCarriers: evaluation.viableAuthorityCarriers,
    receiptPath: writeReceipt ? RECEIPT_PATH : path.join(runDir, 'c01-locator-carrier-receipt.json'),
    receiptDigest: receipt.receiptDigest,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const json = args.has('--json');
  const runPhysicalFlag = args.has('--run-physical');
  const writeReceipt = args.has('--write-receipt');
  const runIdIndex = process.argv.indexOf('--run-id');
  const artifactRootIndex = process.argv.indexOf('--artifact-root');
  const wordRootIndex = process.argv.indexOf('--word-work-root');
  const runId = runIdIndex === -1
    ? `c01-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`
    : rawString(process.argv[runIdIndex + 1]);
  const artifactRoot = artifactRootIndex === -1 ? DEFAULT_ARTIFACT_ROOT : rawString(process.argv[artifactRootIndex + 1]);
  const wordWorkRoot = wordRootIndex === -1 ? DEFAULT_WORD_WORK_ROOT : rawString(process.argv[wordRootIndex + 1]);
  if (runPhysicalFlag) {
    const result = await runPhysical({ artifactRoot, wordWorkRoot, runId, writeReceipt });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `C01_LOCATOR_CARRIER_STATUS=${result.status}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  const evaluation = evaluateC01LocatorCarrierReceipt();
  process.stdout.write(json ? `${JSON.stringify(evaluation, null, 2)}\n` : `C01_LOCATOR_CARRIER_RECEIPT_STATUS=${evaluation.status}\n`);
  process.exit(evaluation.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
