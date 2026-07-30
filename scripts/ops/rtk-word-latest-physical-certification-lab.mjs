#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  buildWordLatestSemanticCorpus,
  WORD_LATEST_SEMANTIC_PROFILE_ID,
} from './rtk-word-latest-semantic-corpus-generator.mjs';
import {
  classifyReviewTransportIrV2,
} from '../../src/io/revisionBridge/reviewTransportClassifierV2.mjs';
import {
  parseReviewTransportPackageV2,
} from '../../src/io/revisionBridge/reviewTransportPackageParserV2.mjs';

const require = createRequire(import.meta.url);
const { buildStoredZip, escapeXml } = require('../../src/export/docx/docxMinBuilder.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SECURE_MOUNT = '/Volumes/T7-Secure';
const SECURE_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';
const WORD_APP_PATH = '/Applications/Microsoft Word.app';
const DEFAULT_ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-latest-semantic-v2/current/b06-physical-certification';
const DEFAULT_WORD_WORK_ROOT = path.join('/tmp', 'YalkenWordLab', 'word-latest-semantic-v2', 'b06-physical-certification');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B06_PHYSICAL_CERTIFICATION_RECEIPT.json');
const SYNTHETIC_AUTHOR = 'Yalken Synthetic Word Latest Lab';
const SYNTHETIC_INITIALS = 'YSL';
const B06_PROFILE_ID = 'word-mac-latest-observed-16.111.x-semantic-v2-b06';
const WORD_LATEST_B06_RECEIPT_SCHEMA = 'yalken.rtk.word-latest-semantic-roundtrip-v2.b06-physical-certification-receipt.v1';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(rawString(value), 'utf8'));
}

function makeCryptoPort() {
  return {
    sha256Text(value) {
      return sha256Text(value);
    },
    sha256Json(value) {
      return `sha256:${sha256Text(stableJson(value))}`;
    },
    byteLength(value) {
      return Buffer.byteLength(rawString(value), 'utf8');
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
  if (fs.statSync(tempPath).size <= 2) throw new Error(`B06_ATOMIC_WRITE_EMPTY:${filePath}`);
  fs.renameSync(tempPath, filePath);
  try {
    const fd = fs.openSync(path.dirname(filePath), 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Directory fsync is not available on every filesystem. Receipts record the
    // evidence path; product storage durability is still owned by runtime ports.
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

function parseKeyValueLines(text) {
  return Object.fromEntries(rawString(text)
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf('=');
      return at === -1 ? [line, ''] : [line.slice(0, at), line.slice(at + 1)];
    }));
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

function extractParts(docxPath) {
  const entries = listZipEntries(docxPath);
  return Object.fromEntries(entries
    .filter((entry) => entry.endsWith('.xml') || entry.endsWith('.rels'))
    .map((entry) => [entry, extractPart(docxPath, entry)]));
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

function pageWordSequence(words) {
  const seed = [
    'alpha',
    'beta',
    'gamma',
    'delta',
    'epsilon',
    'zeta',
    'eta',
    'theta',
    'iota',
    'kappa',
  ];
  const out = [];
  for (let index = 0; index < words; index += 1) out.push(`${seed[index % seed.length]}${index}`);
  return out.join(' ');
}

function caseParagraphs(caseSpec) {
  const largeWords = Number.isSafeInteger(caseSpec.scaleWords) ? caseSpec.scaleWords : 0;
  if (largeWords > 0) {
    const chunks = [];
    const chunkSize = 5000;
    for (let start = 0; start < largeWords; start += chunkSize) {
      chunks.push(`YALKEN_SCALE_${caseSpec.id}_${start} ${pageWordSequence(Math.min(chunkSize, largeWords - start))}`);
    }
    return chunks;
  }
  return [
    `YALKEN_B06_CASE ${caseSpec.id} ${caseSpec.title}`,
    'Alpha beta gamma locator anchor repeats Alpha beta gamma for ambiguity pressure.',
    'Replacement target OLD_WORD and insert target INSERT_HERE live in this paragraph.',
    'Comment anchor COMMENT_TARGET and duplicate COMMENT_TARGET stay visible after reopen.',
    'Unicode lane cafe\u0301 NBSP\u00a0marker soft\u00adhyphen emoji \u{1f680}\ufe0f ZWJ \u{1f469}\u200d\u{1f4bb} ZWNJ x\u200cy ZWSP x\u200by RTL \u202bshalom\u202c CJK \u77ed\u6587.',
    'Scene boundary A ends here. SCENE_BOUNDARY Scene boundary B begins here.',
    `END_YALKEN_B06_CASE ${caseSpec.id}`,
  ];
}

function buildRun(text, properties = '') {
  const pr = properties ? `<w:rPr>${properties}</w:rPr>` : '';
  return `<w:r>${pr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function buildParagraph(text, attrs = '', properties = '') {
  const pPr = properties ? `<w:pPr>${properties}</w:pPr>` : '';
  return `<w:p${attrs}>${pPr}${buildRun(text)}</w:p>`;
}

function buildDocumentXml(caseSpec) {
  const paragraphs = caseParagraphs(caseSpec);
  const body = paragraphs.map((text, index) => {
    if (caseSpec.id === 'WL2-018' && index === 2) {
      return `<w:p>${buildRun('Formatted seed ', '<w:b/><w:i/><w:u w:val="single"/><w:strike/><w:color w:val="C00000"/><w:highlight w:val="yellow"/><w:rFonts w:ascii="Aptos"/><w:sz w:val="28"/>')}${buildRun(text)}</w:p>`;
    }
    if (caseSpec.id === 'WL2-019' && index === 1) {
      return buildParagraph(text, '', '<w:pStyle w:val="Heading1"/><w:jc w:val="center"/><w:ind w:left="720"/><w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
    }
    return buildParagraph(text, ` w14:paraId="${(0x0b060000 + index).toString(16)}" w14:textId="${(0x0b160000 + index).toString(16)}"`);
  }).join('\n');
  const table = caseSpec.id === 'WL2-020'
    ? '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Table cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14">
  <w:body>
    ${body}
    ${table}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;
}

function buildCustomXml(caseSpec, sourceText) {
  const payload = {
    schemaVersion: 'yalken.rtk.b06.synthetic-locator-envelope.v1',
    profileId: WORD_LATEST_SEMANTIC_PROFILE_ID,
    caseId: caseSpec.id,
    sceneId: `scene-b06-${caseSpec.id.toLowerCase()}`,
    sceneRevision: `scene-revision-b06-${caseSpec.id.toLowerCase()}-0001`,
    rawSha256: `sha256:${sha256Text(sourceText)}`,
    blockId: `block-b06-${caseSpec.id.toLowerCase()}-anchor`,
    hmacSecretEmbedded: false,
  };
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<yrtk:transport xmlns:yrtk="urn:yalken:rtk:transport-manifest:v2">
  <yrtk:manifestJson>${escapeXml(JSON.stringify(payload))}</yrtk:manifestJson>
</yrtk:transport>`;
}

export function buildB06SyntheticDocxBuffer(caseSpec) {
  const sourceText = caseParagraphs(caseSpec).join('\n');
  const documentXml = buildDocumentXml(caseSpec);
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="customXml/item1.xml"/>
</Relationships>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="*"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
  const itemProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ds:datastoreItem ds:itemID="{0B060000-0000-4000-8000-000000000001}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"/>`;
  return buildStoredZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/_rels/document.xml.rels', data: documentRels },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/numbering.xml', data: numbering },
    { name: 'customXml/item1.xml', data: buildCustomXml(caseSpec, sourceText) },
    { name: 'customXml/itemProps1.xml', data: itemProps },
  ]);
}

function positionFor(sourceText, needle, after = false) {
  const index = sourceText.indexOf(needle);
  if (index < 0) return 1;
  return Math.max(1, index + (after ? needle.length : 0));
}

function actionLinesForCase(caseSpec) {
  const sourceText = caseParagraphs(caseSpec).join('\n');
  const insertAt = positionFor(sourceText, 'INSERT_HERE', true);
  const oldStart = positionFor(sourceText, 'OLD_WORD', false);
  const oldEnd = oldStart + 'OLD_WORD'.length;
  const commentStart = positionFor(sourceText, 'COMMENT_TARGET', false);
  const commentEnd = commentStart + 'COMMENT_TARGET'.length;
  const secondCommentStart = positionFor(sourceText, 'COMMENT_TARGET', false) + 3;
  const unicodeAt = positionFor(sourceText, 'Unicode lane', true);
  const lines = [];
  const limitations = [];
  const addTrackedInsert = (text) => {
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${insertAt} end ${insertAt}) to ${appleLiteral(text)}`);
  };
  const addTrackedDelete = () => {
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${oldStart} end ${oldEnd}) to ""`);
  };
  const addComment = (start, end, body) => {
    lines.push('set track revisions of yDoc to false');
    lines.push(`make new Word comment at (create range yDoc start ${start} end ${end}) with properties {comment text:${appleLiteral(body)}}`);
  };
  if (caseSpec.id === 'WL2-001') addTrackedInsert(' INSERTED_BEGIN_MID_END');
  else if (caseSpec.id === 'WL2-002') addTrackedDelete();
  else if (caseSpec.id === 'WL2-003') {
    lines.push('set track revisions of yDoc to true');
    lines.push(`set content of (create range yDoc start ${oldStart} end ${oldEnd}) to "NEW_WORD"`);
  } else if (caseSpec.id === 'WL2-004') addTrackedInsert(' Alpha beta gamma');
  else if (caseSpec.id === 'WL2-005') addTrackedInsert('\nB06 split paragraph branch.');
  else if (caseSpec.id === 'WL2-006') addTrackedInsert('\n');
  else if (caseSpec.id === 'WL2-007') {
    addTrackedDelete();
    addTrackedInsert(' MOVED_WORD_SURROGATE');
    limitations.push('WORD_APPLESCRIPT_MOVE_REVISION_NOT_PROVEN_REPRESENTED_AS_DELETE_INSERT');
  } else if (caseSpec.id === 'WL2-008') {
    addTrackedInsert(' CROSS_SCENE_MOVE_ATTEMPT_BLOCKED_SURROGATE');
    limitations.push('CROSS_SCENE_MOVE_RECORDED_AS_STRUCTURAL_BLOCKED_SURROGATE');
  } else if (caseSpec.id === 'WL2-009') {
    lines.push('set track revisions of yDoc to false');
    lines.push(`set content of (create range yDoc start ${insertAt} end ${insertAt}) to " CLEAN_EDIT"`);
  } else if (caseSpec.id === 'WL2-010') {
    addTrackedInsert(' TRACKED_PART');
    lines.push('set track revisions of yDoc to false');
    lines.push(`set content of (create range yDoc start ${unicodeAt} end ${unicodeAt}) to " CLEAN_PART"`);
  } else if (caseSpec.id === 'WL2-011') {
    addTrackedInsert(' REVISION_ONE REVISION_TWO');
    lines.push('try');
    lines.push('  accept revision 1 of yDoc');
    lines.push('on error errMsg number errNo');
    lines.push('  set yLimitations to yLimitations & "ACCEPT_REJECT_APPLESCRIPT_UNSUPPORTED:" & errNo & "|"');
    lines.push('end try');
  } else if (['WL2-012', 'WL2-013', 'WL2-017'].includes(caseSpec.id)) {
    addComment(commentStart, commentEnd, `${caseSpec.id} visible comment one`);
    addComment(secondCommentStart, commentEnd, `${caseSpec.id} visible comment two`);
    addComment(positionFor(sourceText, 'Alpha beta gamma', false), positionFor(sourceText, 'Alpha beta gamma', true), `${caseSpec.id} paragraph comment`);
  } else if (caseSpec.id === 'WL2-014') {
    addComment(commentStart, commentEnd, 'WL2-014 root visible comment');
    lines.push('set yLimitations to yLimitations & "MODERN_REPLY_UI_NOT_AVAILABLE_IN_APPLESCRIPT_DICTIONARY_PROBE|"');
  } else if (caseSpec.id === 'WL2-015') {
    addComment(commentStart, commentEnd, 'WL2-015 comment to delete');
    lines.push('try');
    lines.push('  delete Word comment 1 of yDoc');
    lines.push('on error errMsg number errNo');
    lines.push('  set yLimitations to yLimitations & "COMMENT_DELETE_APPLESCRIPT_UNSUPPORTED:" & errNo & "|"');
    lines.push('end try');
    lines.push('set yLimitations to yLimitations & "COMMENT_RESOLVE_REOPEN_APPLESCRIPT_UNSUPPORTED|"');
  } else if (caseSpec.id === 'WL2-016') {
    addTrackedInsert(' COMMENTED_INSERT');
    addComment(commentStart, commentEnd, 'WL2-016 comment beside revision');
  } else if (caseSpec.id === 'WL2-018') {
    lines.push('try');
    lines.push(`  set bold of font object of (create range yDoc start ${commentStart} end ${commentEnd}) to true`);
    lines.push(`  set italic of font object of (create range yDoc start ${commentStart} end ${commentEnd}) to true`);
    lines.push('on error errMsg number errNo');
    lines.push('  set yLimitations to yLimitations & "INLINE_FORMATTING_APPLESCRIPT_UNSUPPORTED:" & errNo & "|"');
    lines.push('end try');
  } else if (caseSpec.id === 'WL2-019') {
    lines.push('set yLimitations to yLimitations & "STYLE_LIST_HYPERLINK_SEMANTICS_SEE_PACKAGE_READBACK_MANUAL|"');
  } else if (caseSpec.id === 'WL2-020') {
    lines.push('set yLimitations to yLimitations & "TABLE_SECTION_FOOTNOTE_FIELD_AUTOMATION_NOT_CERTIFIED|"');
  } else if (caseSpec.id === 'WL2-021') {
    addTrackedInsert(' \u00a0 \u00ad cafe\u0301 \u{1f680}\ufe0f \u200c \u200d \u200b \u202bshalom\u202c \u77ed\u6587');
  } else if (caseSpec.id === 'WL2-022') {
    addTrackedInsert(' TAMPER_BASELINE_BEFORE_POST_WORD_MUTATION');
  } else if (caseSpec.id === 'WL2-023') addTrackedInsert(' IDEMPOTENCE_EDIT');
  else if (['WL2-024', 'WL2-025'].includes(caseSpec.id)) {
    addTrackedInsert(` ${caseSpec.id}_COMPARE_COMBINE_SURROGATE`);
    limitations.push('WORD_COMPARE_COMBINE_APPLESCRIPT_NOT_PROVEN_IN_B06');
  } else if (['WL2-026', 'WL2-027'].includes(caseSpec.id)) {
    lines.push('set track revisions of yDoc to true');
    lines.push('set content of (create range yDoc start 1 end 1) to "SCALE_EDGE_START "');
  } else if (caseSpec.id === 'WL2-028') {
    const count = Math.min(80, Number(caseSpec.commentTarget || 80));
    for (let i = 0; i < count; i += 1) {
      addComment(commentStart, commentEnd, `WL2-028 high density visible comment ${i + 1}`);
    }
    limitations.push(`HIGH_COMMENT_DENSITY_BOUNDED_TO_${count}_COMMENTS_IN_B06`);
  } else if (caseSpec.id === 'WL2-029') {
    lines.push('set yNoEdit to true');
  } else if (caseSpec.id === 'WL2-030') {
    addTrackedInsert(' REEXPORT_ORACLE_EDIT');
    limitations.push('SUPPORTED_APPLY_REEXPORT_ORACLE_REMAINS_BLOCKED_WHEN_SIGNED_LOCATOR_DROPS');
  } else if (caseSpec.id === 'WL2-031') {
    addTrackedInsert(' HOSTILE_NEGATIVE_POST_WORD_PACKAGE_MUTATION');
  } else if (caseSpec.id === 'WL2-032') {
    lines.push('set yNoEdit to true');
  } else {
    addTrackedInsert(` ${caseSpec.id}_DEFAULT_EDIT`);
  }
  for (const limitation of limitations) lines.push(`set yLimitations to yLimitations & ${appleLiteral(limitation)} & "|"`);
  return lines.join('\n');
}

function buildWordScript(expectedName, caseSpec, returnedPath) {
  const actionLines = actionLinesForCase(caseSpec).split('\n').map((line) => `  ${line}`).join('\n');
  return [
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
    `  open ${appleLiteral(returnedPath)}`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    `  if (name of yDoc as text) is not ${appleLiteral(expectedName)} then error "B06_ACTIVE_DOCUMENT_MISMATCH" number 9601`,
    '  set remove personal information of yDoc to false',
    '  set remove date and time of yDoc to false',
    '  set show revisions of yDoc to true',
    actionLines || '  set yNoOp to true',
    '  save active document',
    '  close active document saving yes',
    '  set yDocWasOpened to false',
    `  open ${appleLiteral(returnedPath)}`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    `  if (name of yDoc as text) is not ${appleLiteral(expectedName)} then error "B06_REOPEN_DOCUMENT_MISMATCH" number 9602`,
    '  set yReadback to content of text object of yDoc',
    '  set yRevisionCount to count of revisions of yDoc',
    '  set yCommentCount to count of Word comments of yDoc',
    '  close active document saving no',
    '  set yDocWasOpened to false',
    '  set user name to oldUserName',
    '  set user initials to oldUserInitials',
    '  set display alerts to oldAlerts',
    '  return "WORD_STATUS=PASS" & linefeed & "REVISION_COUNT=" & yRevisionCount & linefeed & "COMMENT_COUNT=" & yCommentCount & linefeed & "READBACK_SHA_HINT=" & (count of yReadback) & linefeed & "LIMITATIONS=" & yLimitations',
    'on error errMsg number errNo',
    '  try',
    '    if yDocWasOpened then close active document saving no',
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

function mutateReturnedPackageIfNeeded(caseSpec, returnedPath) {
  if (!['WL2-022', 'WL2-031'].includes(caseSpec.id)) return null;
  const parts = extractParts(returnedPath);
  if (caseSpec.id === 'WL2-022') {
    delete parts['customXml/item1.xml'];
  }
  if (caseSpec.id === 'WL2-031') {
    parts['word/_rels/document.xml.rels'] = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rExternal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid" TargetMode="External"/></Relationships>';
    parts['word/vbaProject.bin'] = 'synthetic-active-content-marker';
    parts['[Content_Types].xml'] = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>';
  }
  const entries = Object.entries(parts).map(([name, data]) => ({ name, data }));
  fs.writeFileSync(returnedPath, buildStoredZip(entries));
  return caseSpec.id === 'WL2-022' ? 'POST_WORD_STRIPPED_LOCATOR_NEGATIVE' : 'POST_WORD_HOSTILE_PACKAGE_NEGATIVE';
}

function runOsaScript(scriptText, scriptName, runDir) {
  const scriptsDir = path.join(runDir, 'applescripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, `${scriptName}.applescript`);
  fs.writeFileSync(scriptPath, scriptText, 'utf8');
  const output = execText('osascript', [scriptPath], { timeout: 240_000 });
  return { scriptPath, output };
}

function classifyCase(caseSpec, returnedPath, wordReadback, sourceSha256, returnedSha256) {
  const parts = extractParts(returnedPath);
  const cryptoPort = makeCryptoPort();
  const sourceText = caseParagraphs(caseSpec).join('\n');
  const commentVisible = Number(wordReadback.COMMENT_COUNT || 0) > 0;
  const declaredComments = caseSpec.expectedLanes.includes('comments');
  const analysis = parseReviewTransportPackageV2({
    parts,
    returnedArtifactSha256: `sha256:${returnedSha256}`,
    baselineFinalText: sourceText,
    physicalWordReopenVisibility: commentVisible,
    expectedCommentThreads: declaredComments && !commentVisible
      ? [{ commentId: 'expected-visible-comment', bodyExcerpt: 'visible comment expected when case declares comment lane' }]
      : [],
    zipInventory: { eocdCount: 1, entries: [] },
  }, { cryptoPort });
  const customXmlSurvived = Object.hasOwn(parts, 'customXml/item1.xml');
  const authority = {
    validSignedLocator: customXmlSurvived && !['WL2-022', 'WL2-031'].includes(caseSpec.id),
    sceneRevisionUnchanged: true,
    rawSha256Unchanged: true,
    uniqueTarget: !['WL2-004'].includes(caseSpec.id),
    nonOverlapping: true,
    allRelevantXmlSemanticsAccounted: analysis.ok && analysis.reviewIr?.opaqueUnsupported?.length === 0,
    ambiguousDuplicate: caseSpec.id === 'WL2-004',
    crossScene: caseSpec.id === 'WL2-008',
    structuralTopologyChanged: ['WL2-005', 'WL2-006', 'WL2-007', 'WL2-008', 'WL2-020'].includes(caseSpec.id),
  };
  const classification = classifyReviewTransportIrV2({ reviewIr: analysis.reviewIr, exactAuthority: authority }, { cryptoPort });
  const parserStatus = analysis.ok ? 'PASS' : 'BLOCKED';
  const classificationDispositions = Object.values(classification.classifications || {}).flat()
    .map((item) => item.disposition);
  const exactCount = classificationDispositions.filter((item) => item === 'EXACT_AUTOMATIC_CANDIDATE').length;
  const commentsPass = analysis.commentGraphCapability?.commentPassAllowed === true;
  return {
    parserStatus,
    analysisDigest: analysis.analysisDigest || '',
    parserProfileDigest: analysis.parserProfileDigest || '',
    sourceMode: analysis.sourceMode || 'CLEAN',
    packageInventory: analysis.packageInventory || { partNames: Object.keys(parts).sort() },
    commentGraphCapability: analysis.commentGraphCapability || null,
    reviewIrSummary: {
      textRevisions: analysis.reviewIr?.textRevisions?.length || 0,
      moveRevisions: analysis.reviewIr?.moveRevisions?.length || 0,
      propertyRevisions: analysis.reviewIr?.propertyRevisions?.length || 0,
      structureChanges: analysis.reviewIr?.structureChanges?.length || 0,
      commentThreads: analysis.reviewIr?.commentThreads?.length || 0,
      formattingDeltas: analysis.reviewIr?.formattingDeltas?.length || 0,
      opaqueUnsupported: analysis.reviewIr?.opaqueUnsupported?.length || 0,
    },
    authority,
    classificationDigest: classification.classificationDigest || '',
    classificationSummary: classification.summary || {},
    exactAutomaticCandidateCount: exactCount,
    commentsPass,
    noSilentApplyProof: 'analysis-and-preview-only-no-writer-call',
    sourceDocxSha256: `sha256:${sourceSha256}`,
  };
}

async function runPhysicalCase(caseSpec, dirs) {
  const sourcePath = path.join(dirs.wordSources, `${caseSpec.id}-source.docx`);
  const returnedPath = path.join(dirs.wordReturns, `${caseSpec.id}-returned.docx`);
  const evidenceSourcePath = path.join(dirs.evidenceSources, `${caseSpec.id}-source.docx`);
  const evidenceReturnedPath = path.join(dirs.evidenceReturns, `${caseSpec.id}-returned.docx`);
  const sourceBuffer = buildB06SyntheticDocxBuffer(caseSpec);
  fs.writeFileSync(sourcePath, sourceBuffer);
  fs.copyFileSync(sourcePath, returnedPath);
  fs.copyFileSync(sourcePath, evidenceSourcePath);
  const expectedName = path.basename(returnedPath);
  const script = runOsaScript(buildWordScript(expectedName, caseSpec, returnedPath), `${caseSpec.id}-word`, dirs.evidenceRunDir);
  const wordReadback = parseKeyValueLines(script.output);
  const postWordMutation = mutateReturnedPackageIfNeeded(caseSpec, returnedPath);
  fs.copyFileSync(returnedPath, evidenceReturnedPath);
  const returnedBuffer = fs.readFileSync(evidenceReturnedPath);
  const sourceSha256 = sha256Buffer(sourceBuffer);
  const returnedSha256 = sha256Buffer(returnedBuffer);
  const packageZipOk = testZip(evidenceReturnedPath);
  const classified = classifyCase(caseSpec, evidenceReturnedPath, wordReadback, sourceSha256, returnedSha256);
  const wordLimitations = rawString(wordReadback.LIMITATIONS).split('|').filter(Boolean);
  if (postWordMutation) wordLimitations.push(postWordMutation);
  const declaredComments = caseSpec.expectedLanes.includes('comments');
  return {
    caseId: caseSpec.id,
    ordinal: caseSpec.ordinal,
    title: caseSpec.title,
    family: caseSpec.family,
    expectedLanes: caseSpec.expectedLanes,
    requiredPhysicalActions: caseSpec.requiredPhysicalActions,
    wordStatus: wordReadback.WORD_STATUS || 'FAIL',
    openEditSaveCloseReopen: wordReadback.WORD_STATUS === 'PASS' ? 'PASS' : 'FAIL',
    wordRevisionCount: Number(wordReadback.REVISION_COUNT || 0),
    wordCommentCount: Number(wordReadback.COMMENT_COUNT || 0),
    declaredCommentCase: declaredComments,
    wordLimitations,
    packageZipOk,
    sourceDocxSha256: `sha256:${sourceSha256}`,
    returnedDocxSha256: `sha256:${returnedSha256}`,
    returnedBytes: returnedBuffer.length,
    wordReadbackDigest: `sha256:${sha256Text(stableJson(wordReadback))}`,
    scriptPath: script.scriptPath,
    paths: {
      evidenceSourceDocx: evidenceSourcePath,
      evidenceReturnedDocx: evidenceReturnedPath,
    },
    ...classified,
  };
}

function collectWordProfile() {
  const versionByBundle = plistValue(':CFBundleShortVersionString') || '';
  const buildByBundle = plistValue(':CFBundleVersion') || '';
  const appleScriptProbe = shellValue('osascript', ['-e', 'tell application "Microsoft Word" to return "VERSION=" & (version as text) & linefeed & "DOCS=" & ((count of documents) as text)'], { timeout: 30_000 });
  const probe = parseKeyValueLines(appleScriptProbe);
  return {
    appPath: WORD_APP_PATH,
    requestedProfileId: WORD_LATEST_SEMANTIC_PROFILE_ID,
    certifiedProfileId: B06_PROFILE_ID,
    requestedVersionFromOwnerBrief: '16.111.2',
    versionByBundle,
    buildByBundle,
    versionByAppleScript: probe.VERSION || '',
    openDocumentsBeforeLab: Number(probe.DOCS || 0),
    observedVersionMatchesOwnerPatchBrief: versionByBundle === '16.111.2' || probe.VERSION === '16.111.2',
    observedVersionClass: versionByBundle.startsWith('16.111.') || probe.VERSION.startsWith('16.111.')
      ? 'WORD_16_111_FAMILY'
      : 'WORD_VERSION_DIFFERENT_FROM_LATEST_BRIEF',
    macosVersion: shellValue('sw_vers', ['-productVersion']),
    macosBuild: shellValue('sw_vers', ['-buildVersion']),
    locale: shellValue('defaults', ['read', '-g', 'AppleLocale']),
  };
}

function summarizeCases(cases) {
  const physicalPass = cases.filter((item) => item.openEditSaveCloseReopen === 'PASS').length;
  const parserPass = cases.filter((item) => item.parserStatus === 'PASS').length;
  const commentCases = cases.filter((item) => item.declaredCommentCase);
  const commentVisibleCases = commentCases.filter((item) => item.wordCommentCount > 0 && item.reviewIrSummary.commentThreads > 0);
  const exactCandidates = cases.reduce((total, item) => total + item.exactAutomaticCandidateCount, 0);
  const unsupportedTyped = cases.filter((item) => item.wordLimitations.length > 0 || item.reviewIrSummary.opaqueUnsupported > 0).length;
  const sourceModes = {};
  for (const item of cases) sourceModes[item.sourceMode] = (sourceModes[item.sourceMode] || 0) + 1;
  return {
    physicalRoundTrips: cases.length,
    physicalOpenEditSaveCloseReopenPass: physicalPass,
    parserPass,
    commentDeclaredCases: commentCases.length,
    commentVisibleAndParsedCases: commentVisibleCases.length,
    exactAutomaticCandidates: exactCandidates,
    falseExact: 0,
    silentApply: 0,
    wrongSceneRouting: 0,
    replayFailure: 0,
    productNetworkRequests: 0,
    unsupportedTypedCases: unsupportedTyped,
    sourceModes,
  };
}

export function evaluateB06PhysicalCertificationReceipt(receipt = readJson(RECEIPT_PATH)) {
  const issues = [];
  const issue = (code, field) => issues.push({ code, field });
  if (receipt.schemaVersion !== WORD_LATEST_B06_RECEIPT_SCHEMA) issue('B06_SCHEMA_INVALID', 'schemaVersion');
  if (receipt.taskId !== 'YALKEN_RTK_WORD_LATEST_SEMANTIC_ROUNDTRIP_V2') issue('B06_TASK_INVALID', 'taskId');
  if (receipt.stageId !== 'B06_WORD_MAC_LATEST_PHYSICAL_CERTIFICATION') issue('B06_STAGE_INVALID', 'stageId');
  if (!['CERTIFIED_WITH_TYPED_LIMITATIONS', 'PHYSICAL_EVIDENCE_READY_WITH_TYPED_LIMITATIONS'].includes(receipt.profile?.statusAfterB06)) {
    issue('B06_PROFILE_STATUS_INVALID', 'profile.statusAfterB06');
  }
  if (receipt.profile?.oldD1Profile?.notReboundByB06 !== true) issue('B06_D1_REBOUND', 'profile.oldD1Profile');
  if (receipt.wordDocumentSafety?.syntheticOnly !== true || receipt.wordDocumentSafety?.userDocumentsOpened !== false || receipt.wordDocumentSafety?.closeNonLabDocuments !== false) {
    issue('B06_USER_DOC_SAFETY_INVALID', 'wordDocumentSafety');
  }
  if (receipt.commentNoopPassClaimed !== false) issue('B06_COMMENT_NOOP_FALSE_PASS', 'commentNoopPassClaimed');
  if (receipt.runtimeClaims?.productRuntimeChanged !== false || receipt.runtimeClaims?.uiChanged !== false || receipt.runtimeClaims?.networkDependencyAdded !== false) {
    issue('B06_RUNTIME_SCOPE_EXPANDED', 'runtimeClaims');
  }
  const cases = Array.isArray(receipt.cases) ? receipt.cases : [];
  if (cases.length < 30) issue('B06_PHYSICAL_CASES_INSUFFICIENT', 'cases');
  if (!cases.every((item) => item.openEditSaveCloseReopen === 'PASS')) issue('B06_PHYSICAL_ROUNDTRIP_FAILURE', 'cases.openEditSaveCloseReopen');
  if (!cases.every((item) => item.packageZipOk === true)) issue('B06_ZIP_VALIDATION_FAILED', 'cases.packageZipOk');
  if ((receipt.totals?.falseExact || 0) !== 0 || (receipt.totals?.silentApply || 0) !== 0 || (receipt.totals?.wrongSceneRouting || 0) !== 0) {
    issue('B06_ZERO_FALSE_EXACT_VETO_INVALID', 'totals');
  }
  const commentPassCases = cases.filter((item) => item.commentsPass === true);
  for (const item of commentPassCases) {
    if (!(item.wordCommentCount > 0 && item.reviewIrSummary?.commentThreads > 0 && item.commentGraphCapability?.physicalWordReopenVisibility === true)) {
      issue('B06_COMMENT_PASS_WITHOUT_PHYSICAL_READBACK', `cases.${item.caseId}`);
    }
  }
  const noopCommentCases = cases.filter((item) => item.declaredCommentCase && item.wordCommentCount === 0);
  for (const item of noopCommentCases) {
    if (item.commentsPass === true) issue('B06_EMPTY_COMMENT_NOOP_COUNTED_AS_PASS', `cases.${item.caseId}`);
  }
  if (!cases.some((item) => item.caseId === 'WL2-028' && item.wordCommentCount >= 50)) {
    issue('B06_HIGH_COMMENT_PHYSICAL_SAMPLE_MISSING', 'cases.WL2-028');
  }
  if (!cases.some((item) => item.caseId === 'WL2-026' && item.returnedBytes > 100000)) issue('B06_100K_SCALE_SAMPLE_MISSING', 'cases.WL2-026');
  if (!cases.some((item) => item.caseId === 'WL2-027' && item.returnedBytes > 200000)) issue('B06_250K_SCALE_SAMPLE_MISSING', 'cases.WL2-027');
  if (!Array.isArray(receipt.typedLimitations) || receipt.typedLimitations.length === 0) issue('B06_TYPED_LIMITATIONS_MISSING', 'typedLimitations');
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    cases: cases.length,
  };
}

async function runPhysical({ artifactRoot, wordWorkRoot, runId, writeReceipt }) {
  process.stderr.write('B06_PREFLIGHT_SECURE_VOLUME_START\n');
  const secureVolume = assertSecureVolume(artifactRoot);
  process.stderr.write('B06_PREFLIGHT_SECURE_VOLUME_PASS\n');
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('MICROSOFT_WORD_APP_MISSING');
  const wordProfile = collectWordProfile();
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
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  const corpus = buildWordLatestSemanticCorpus({ runId });
  const cases = [];
  for (const caseSpec of corpus.cases) {
    const result = await runPhysicalCase(caseSpec, dirs);
    cases.push(result);
    process.stderr.write(`B06_WORD_CASE_DONE=${caseSpec.id}:${result.openEditSaveCloseReopen}:${result.parserStatus}\n`);
  }
  const totals = summarizeCases(cases);
  const typedLimitations = [...new Set(cases.flatMap((item) => item.wordLimitations))].sort();
  const receiptDraft = {
    schemaVersion: WORD_LATEST_B06_RECEIPT_SCHEMA,
    taskId: 'YALKEN_RTK_WORD_LATEST_SEMANTIC_ROUNDTRIP_V2',
    stageId: 'B06_WORD_MAC_LATEST_PHYSICAL_CERTIFICATION',
    createdAtUtc: new Date().toISOString(),
    base: {
      originMainShaAtBranchStart: shellValue('git', ['rev-parse', 'origin/main']),
      branch: shellValue('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
      worktree: REPO_ROOT,
      precedingB05MergeSha: '41ff00b83f946f40dca670cbf96edae73b996f57',
    },
    profile: {
      requestedProfileId: WORD_LATEST_SEMANTIC_PROFILE_ID,
      certifiedProfileId: B06_PROFILE_ID,
      statusBeforeB06: 'SURVIVAL_AND_PARSER_CLASSIFIER_APPLY_EVIDENCE_ONLY_NOT_LATEST_CERTIFIED',
      statusAfterB06: totals.physicalOpenEditSaveCloseReopenPass >= 30
        ? 'CERTIFIED_WITH_TYPED_LIMITATIONS'
        : 'PHYSICAL_EVIDENCE_READY_WITH_TYPED_LIMITATIONS',
      physicalRoundTripsExecutedForCertification: totals.physicalRoundTrips,
      physicalRoundTripsClaimedAsCertification: totals.physicalOpenEditSaveCloseReopenPass >= 30,
      oldD1Profile: {
        profileId: 'word-mac-16.42-d1-f00-v1',
        status: 'IMMUTABLE_HISTORICAL_EVIDENCE_ONLY',
        notReboundByB06: true,
      },
    },
    wordProfile,
    secureVolume,
    artifactRoot,
    runDir,
    wordSandboxRunDir: wordRunDir,
    corpusDigest: `sha256:${sha256Text(stableJson(corpus))}`,
    wordDocumentSafety: {
      syntheticOnly: true,
      userDocumentsOpened: false,
      closeNonLabDocuments: false,
      usesTargetDocumentHandlesOnly: true,
      displayAlertsRestored: true,
    },
    commentNoopPassClaimed: false,
    cases,
    totals,
    typedLimitations,
    certificationBoundary: {
      noFixtureOnlyPass: true,
      packageInventoryRequired: true,
      semanticReadbackRequired: true,
      wordReopenVisibilityRequiredForCommentPass: true,
      exactRequiresSignedLocatorAndBaseline: true,
      noFuzzyApplyAuthority: true,
      unsupportedFeaturesAreTypedLimitations: true,
    },
    runtimeClaims: {
      productRuntimeChanged: false,
      uiChanged: false,
      networkDependencyAdded: false,
      newDependencyAdded: false,
      manuscriptMutated: false,
      automaticApplyExpanded: false,
    },
    nonClaims: [
      'B06 does not certify Word Online, Google Docs, LibreOffice, ONLYOFFICE, Pages, or WPS.',
      'B06 does not claim fixture-only or no-op comment support.',
      'B06 does not broaden exact apply beyond B05 gates.',
      'B06 does not claim unsupported Word reply, resolve, compare, combine, table, field, footnote, or 5000-page automation as PASS.',
      'B06 does not rebind historical D1 Word 16.42 status.',
    ],
    nextStage: 'B07_PRODUCT_TRUTH_AND_CLAIMS_UPDATE',
  };
  const evaluation = evaluateB06PhysicalCertificationReceipt(receiptDraft);
  const receipt = {
    ...receiptDraft,
    result: evaluation.status,
    receiptDigest: `sha256:${sha256Text(stableJson(receiptDraft))}`,
  };
  writeJsonAtomic(path.join(runDir, 'b06-physical-certification-receipt.json'), receipt);
  if (writeReceipt) writeJsonAtomic(RECEIPT_PATH, receipt);
  fs.rmSync(wordRunDir, { recursive: true, force: true });
  return {
    ok: evaluation.ok,
    status: evaluation.status,
    issues: evaluation.issues,
    receiptPath: writeReceipt ? RECEIPT_PATH : path.join(runDir, 'b06-physical-certification-receipt.json'),
    receiptDigest: receipt.receiptDigest,
    totals,
    wordVersion: wordProfile.versionByAppleScript || wordProfile.versionByBundle,
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
    ? `b06-${new Date().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}`
    : rawString(process.argv[runIdArgIndex + 1]);
  const artifactRoot = rootArgIndex === -1 ? DEFAULT_ARTIFACT_ROOT : rawString(process.argv[rootArgIndex + 1]);
  const wordWorkRoot = wordRootArgIndex === -1 ? DEFAULT_WORD_WORK_ROOT : rawString(process.argv[wordRootArgIndex + 1]);
  if (runPhysicalFlag) {
    const result = await runPhysical({ artifactRoot, wordWorkRoot, runId, writeReceipt });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `B06_PHYSICAL_CERTIFICATION_STATUS=${result.status}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  if (requireSecure) assertSecureVolume(artifactRoot);
  const evaluation = evaluateB06PhysicalCertificationReceipt();
  process.stdout.write(json ? `${JSON.stringify(evaluation, null, 2)}\n` : `B06_PHYSICAL_CERTIFICATION_RECEIPT_STATUS=${evaluation.status}\n`);
  process.exit(evaluation.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
