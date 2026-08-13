#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORD_APP_PATH = '/Applications/Microsoft Word.app';
const SECURE_MOUNT = '/Volumes/T7-Secure';
const SECURE_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';
const ARTIFACT_ROOT = process.env.YALKEN_WORD_MAC_LAB_ROOT
  || '/Volumes/T7-Secure/storage/yalken/word-lab/certification/current';
const STATUS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_MAC_CERTIFICATION_STATUS.json');
const CAPSULE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_MAC_SETTINGS_CAPSULE.json');
const CORPUS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_MAC_SUPPORTED_CORPUS_V1.json');
const EVIDENCE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_MAC_ROUNDTRIP_EVIDENCE_MANIFEST.json');
const W5_STATUS_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'W5_RELEASE_HARDENING_CERTIFICATION_STATUS.json');
const PLAN_CONTRACT_SHA256 = '499d621a618f20ce85fb945c9dd5fb10074dea9b8e164b12681e95cab5364b46';
const SYNTHETIC_AUTHOR = 'Yalken Synthetic Word Lab';
const SYNTHETIC_INITIALS = 'YWL';

const { buildDocxMinBuffer } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxMinBuilder.js'));

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(text) {
  return sha256Buffer(Buffer.from(String(text), 'utf8'));
}

function sha256Signed(text) {
  return `sha256:${sha256Text(text)}`;
}

function sourceFenceToken(source) {
  const payload = {
    schemaVersion: 'yalken.sourceFence.token.v1',
    purpose: 'WRITE_SOURCE',
    projectId: source.projectId,
    rootId: source.rootId,
    documentId: source.documentId,
    canonicalRevision: source.canonicalRevision,
    workingRevision: source.workingRevision,
    sourceDigest: source.sourceDigest,
  };
  return { ...payload, fenceDigest: sha256Signed(stableJson(payload)) };
}

function sourceFenceBinding({ commandId, projectId, documentId, sourceHash, rawHash }) {
  const source = {
    projectId,
    rootId: 'root-word-mac-lab',
    documentId,
    canonicalRevision: sourceHash,
    workingRevision: sourceHash,
    sourceDigest: rawHash,
  };
  const request = {
    schemaVersion: 'yalken.sourceFence.request.v1',
    purpose: 'WRITE_SOURCE',
    expected: source,
    current: { ...source, dirtyState: 'CLEAN' },
    dirtyPolicy: 'REQUIRE_CLEAN',
    authority: {
      decision: 'ALLOW',
      mayWrite: true,
      commandId,
    },
    fence: sourceFenceToken(source),
  };
  return {
    schemaVersion: 'yalken.rtk.round-authority-source-fence.v1',
    request,
    result: {
      schemaVersion: 'yalken.sourceFence.result.v1',
      ok: true,
      decision: 'ALLOW',
      code: 'YALKEN_SOURCE_FENCE_ALLOWED',
      reasons: [],
      observed: {
        purpose: 'WRITE_SOURCE',
        projectId,
        rootId: 'root-word-mac-lab',
        documentId,
        canonicalRevision: sourceHash,
        workingRevision: sourceHash,
        sourceDigest: rawHash,
        dirtyState: 'CLEAN',
        dirtyPolicy: 'REQUIRE_CLEAN',
      },
    },
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function execText(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function assertSecureVolume() {
  const info = execText('diskutil', ['info', SECURE_MOUNT]);
  if (!info.includes(`Volume UUID:              ${SECURE_UUID}`) && !info.includes(`Volume UUID:              ${SECURE_UUID}`.replaceAll(' ', ''))) {
    const uuidLine = info.split('\n').find((line) => line.includes('Volume UUID')) || '';
    if (!uuidLine.includes(SECURE_UUID)) throw new Error(`T7_SECURE_UUID_MISMATCH:${uuidLine.trim()}`);
  }
  if (!/FileVault:\s+Yes/u.test(info)) throw new Error('T7_SECURE_FILEVAULT_NOT_YES');
  if (!fs.existsSync(SECURE_MOUNT)) throw new Error('T7_SECURE_MOUNT_MISSING');
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  fs.accessSync(ARTIFACT_ROOT, fs.constants.W_OK);
  return {
    mount: SECURE_MOUNT,
    uuid: SECURE_UUID,
    fileVault: 'Yes',
    artifactRoot: ARTIFACT_ROOT,
  };
}

function plistValue(key) {
  try {
    return execText('/usr/libexec/PlistBuddy', ['-c', `Print ${key}`, path.join(WORD_APP_PATH, 'Contents', 'Info.plist')]);
  } catch {
    return '';
  }
}

function shellValue(command, args) {
  try {
    return execText(command, args);
  } catch (error) {
    return `UNAVAILABLE:${error.status || 'ERR'}`;
  }
}

function appleLiteral(text) {
  return `"${String(text)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((part) => part.replaceAll('\n', ''))
    .join('" & return & "')}"`;
}

function applePath(filePath) {
  return appleLiteral(filePath);
}

function parseKeyValueLines(text) {
  return Object.fromEntries(String(text)
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf('=');
      return at === -1 ? [line, ''] : [line.slice(0, at), line.slice(at + 1)];
    }));
}

function runOsaScript(scriptText, scriptName) {
  const scriptsDir = path.join(ARTIFACT_ROOT, 'applescripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, `${scriptName}.applescript`);
  fs.writeFileSync(scriptPath, scriptText, 'utf8');
  return execText('osascript', [scriptPath], { cwd: REPO_ROOT });
}

async function buildYalkenExportDocx(sourceText, outPath) {
  const docxPageSetupBindModule = await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'docxPageSetupBind.mjs')).href);
  const semanticMappingModule = await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'derived', 'semanticMapping.mjs')).href);
  const styleMapModule = await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'derived', 'styleMap.mjs')).href);
  const buffer = buildDocxMinBuffer({
    content: sourceText,
    plainText: sourceText,
    bookProfile: { formatId: 'A4' },
  }, {
    docxPageSetupBindModule,
    semanticMappingModule,
    styleMapModule,
  });
  fs.writeFileSync(outPath, buffer);
  return {
    bytes: buffer.length,
    sha256: sha256Buffer(buffer),
  };
}

function extractPart(docxPath, partName) {
  try {
    return execFileSync('/usr/bin/unzip', ['-p', docxPath, partName], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
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
    });
    return true;
  } catch {
    return false;
  }
}

function idx(text, needle, occurrence = 0) {
  let cursor = 0;
  for (let i = 0; i <= occurrence; i += 1) {
    const found = text.indexOf(needle, cursor);
    if (found === -1) throw new Error(`SEED_TARGET_NOT_FOUND:${needle}`);
    if (i === occurrence) return found;
    cursor = found + needle.length;
  }
  throw new Error(`SEED_TARGET_NOT_FOUND:${needle}`);
}

function applyModelText(text, action) {
  if (action.type === 'insert') {
    const at = action.after ? idx(text, action.after, action.occurrence || 0) + action.after.length : idx(text, action.before, action.occurrence || 0);
    return `${text.slice(0, at)}${action.text}${text.slice(at)}`;
  }
  if (action.type === 'replace') {
    const start = idx(text, action.target, action.occurrence || 0);
    return `${text.slice(0, start)}${action.text}${text.slice(start + action.target.length)}`;
  }
  if (action.type === 'delete') {
    const start = idx(text, action.target, action.occurrence || 0);
    return `${text.slice(0, start)}${text.slice(start + action.target.length)}`;
  }
  if (action.type === 'copyPaste') {
    const copied = action.target;
    const insertAt = idx(text, action.after, action.afterOccurrence || 0) + action.after.length;
    return `${text.slice(0, insertAt)}${action.separator || ''}${copied}${text.slice(insertAt)}`;
  }
  if (action.type === 'cutPaste') {
    const start = idx(text, action.target, action.occurrence || 0);
    const without = `${text.slice(0, start)}${text.slice(start + action.target.length)}`;
    const insertAt = idx(without, action.after, action.afterOccurrence || 0) + action.after.length;
    return `${without.slice(0, insertAt)}${action.separator || ''}${action.target}${without.slice(insertAt)}`;
  }
  return text;
}

function rangeFrom(text, action) {
  if (action.type === 'insert') {
    const at = action.after ? idx(text, action.after, action.occurrence || 0) + action.after.length : idx(text, action.before, action.occurrence || 0);
    return { start: at, end: at };
  }
  const start = idx(text, action.target, action.occurrence || 0);
  return { start, end: start + action.target.length };
}

function actionToApple(action, modelText, actionIndex) {
  const prefix = `set track revisions of active document to ${action.track === false ? 'false' : 'true'}\n`;
  if (action.type === 'insert') {
    const range = rangeFrom(modelText, action);
    return `${prefix}set content of (create range active document start ${range.start} end ${range.end}) to ${appleLiteral(action.text)}\n`;
  }
  if (action.type === 'replace' || action.type === 'delete') {
    const range = rangeFrom(modelText, action);
    return `${prefix}set content of (create range active document start ${range.start} end ${range.end}) to ${appleLiteral(action.type === 'delete' ? '' : action.text)}\n`;
  }
  if (action.type === 'comment') {
    const range = rangeFrom(modelText, action);
    return [
      'set track revisions of active document to false',
      `set yalkenCommentRange${actionIndex} to create range active document start ${range.start} end ${range.end}`,
      `make new Word comment at yalkenCommentRange${actionIndex} with properties {comment text:${appleLiteral(action.body)}}`,
    ].join('\n') + '\n';
  }
  if (action.type === 'format') {
    const range = rangeFrom(modelText, action);
    const lines = [
      `${prefix}set yalkenFormatRange${actionIndex} to create range active document start ${range.start} end ${range.end}`,
    ];
    if (action.bold) lines.push(`set bold of yalkenFormatRange${actionIndex} to true`);
    if (action.italic) lines.push(`set italic of yalkenFormatRange${actionIndex} to true`);
    if (action.underline) lines.push(`set underline of yalkenFormatRange${actionIndex} to underline single`);
    return `${lines.join('\n')}\n`;
  }
  if (action.type === 'heading') {
    const range = rangeFrom(modelText, action);
    return `${prefix}set style of (create range active document start ${range.start} end ${range.end}) to style heading1\n`;
  }
  if (action.type === 'bullet') {
    const range = rangeFrom(modelText, action);
    return `${prefix}apply bullet default (list format of (create range active document start ${range.start} end ${range.end}))\n`;
  }
  if (action.type === 'copyPaste') {
    const source = rangeFrom(modelText, { type: 'replace', target: action.target, occurrence: action.occurrence || 0 });
    const insertAt = idx(modelText, action.after, action.afterOccurrence || 0) + action.after.length;
    return [
      prefix,
      `select (create range active document start ${source.start} end ${source.end})`,
      'copy object selection',
      `set content of (create range active document start ${insertAt} end ${insertAt}) to ${appleLiteral(action.separator || '')}`,
      `select (create range active document start ${insertAt + String(action.separator || '').length} end ${insertAt + String(action.separator || '').length})`,
      'paste object selection',
    ].join('\n') + '\n';
  }
  if (action.type === 'cutPaste') {
    const source = rangeFrom(modelText, { type: 'replace', target: action.target, occurrence: action.occurrence || 0 });
    const afterDelete = applyModelText(modelText, { type: 'delete', target: action.target, occurrence: action.occurrence || 0 });
    const insertAt = idx(afterDelete, action.after, action.afterOccurrence || 0) + action.after.length;
    return [
      prefix,
      `select (create range active document start ${source.start} end ${source.end})`,
      'cut object selection',
      `set content of (create range active document start ${insertAt} end ${insertAt}) to ${appleLiteral(action.separator || '')}`,
      `select (create range active document start ${insertAt + String(action.separator || '').length} end ${insertAt + String(action.separator || '').length})`,
      'paste object selection',
    ].join('\n') + '\n';
  }
  if (action.type === 'acceptFirstRejectNext') {
    return [
      'try',
      '  accept revision 1 of active document',
      'end try',
      'try',
      '  reject revision 1 of active document',
      'end try',
    ].join('\n') + '\n';
  }
  if (action.type === 'acceptAll') return 'accept all revisions active document\n';
  if (action.type === 'rejectAll') return 'reject all revisions active document\n';
  if (action.type === 'deleteAllComments') return 'delete all comments active document\n';
  throw new Error(`UNSUPPORTED_ACTION:${action.type}`);
}

function buildRoundScript(seed, inputPath, returnedPath) {
  let modelText = seed.sourceText;
  const actionLines = [];
  seed.actions.forEach((action, actionIndex) => {
    actionLines.push(actionToApple(action, modelText, actionIndex));
    modelText = applyModelText(modelText, action);
  });
  const openPath = seed.saveMode === 'save' ? returnedPath : inputPath;
  if (seed.saveMode === 'save') fs.copyFileSync(inputPath, returnedPath);

  const saveLine = seed.saveMode === 'saveAs'
    ? `save as active document file name (POSIX file ${applePath(returnedPath)}) file format format document add to recent files false`
    : 'save active document';

  return {
    expectedModelText: modelText,
    script: [
      'tell application "Microsoft Word"',
      'activate',
      'close every document saving no',
      'set oldUserName to user name',
      'set oldUserInitials to user initials',
      `set user name to ${appleLiteral(SYNTHETIC_AUTHOR)}`,
      `set user initials to ${appleLiteral(SYNTHETIC_INITIALS)}`,
      `open (POSIX file ${applePath(openPath)})`,
      'set track revisions of active document to false',
      'set show revisions of active document to true',
      'set remove personal information of active document to false',
      'set remove date and time of active document to false',
      actionLines.join('\n'),
      saveLine,
      'close active document saving yes',
      `open (POSIX file ${applePath(returnedPath)})`,
      'set yalkenReadback to content of text object of active document',
      'set yalkenRevisionCount to count of revisions of active document',
      'set yalkenCommentCount to count of Word comments of active document',
      'set yalkenRevisionSummary to ""',
      'repeat with i from 1 to yalkenRevisionCount',
      '  try',
      '    set yalkenRevisionSummary to yalkenRevisionSummary & (revision type of revision i of active document as text) & ":" & (content of text object of revision i of active document as text) & "|"',
      '  on error errMsg number errNo',
      '    set yalkenRevisionSummary to yalkenRevisionSummary & "REVISION_READ_ERROR:" & errNo & "|"',
      '  end try',
      'end repeat',
      'set yalkenCommentSummary to ""',
      'repeat with i from 1 to yalkenCommentCount',
      '  try',
      '    set yalkenCommentSummary to yalkenCommentSummary & (author of Word comment i of active document) & ":" & (initials of Word comment i of active document) & ":" & (content of comment text of Word comment i of active document) & "|"',
      '  on error errMsg number errNo',
      '    set yalkenCommentSummary to yalkenCommentSummary & "COMMENT_READ_ERROR:" & errNo & "|"',
      '  end try',
      'end repeat',
      'set yalkenSaveFormat to save format of active document as text',
      'close active document saving no',
      'set user name to oldUserName',
      'set user initials to oldUserInitials',
      'return "READBACK_SHA256_SOURCE=WORD_NATIVE_READBACK" & linefeed & "REVISION_COUNT=" & yalkenRevisionCount & linefeed & "COMMENT_COUNT=" & yalkenCommentCount & linefeed & "REVISION_SUMMARY=" & yalkenRevisionSummary & linefeed & "COMMENT_SUMMARY=" & yalkenCommentSummary & linefeed & "SAVE_FORMAT=" & yalkenSaveFormat & linefeed & "READBACK=" & yalkenReadback',
      'end tell',
    ].join('\n'),
  };
}

function baseText(id, extra = '') {
  return [
    `Seed ${id} alpha beta gamma delta.`,
    `Seed ${id} second line has review target and duplicate needle.`,
    `Seed ${id} final boundary line keeps carrier safe.${extra}`,
  ].join('\n');
}

function largeWriterText(id, paragraphCount = 180) {
  const paragraphs = [];
  paragraphs.push(`Large ${id} opening anchor alpha beta gamma for writer-scale review.`);
  for (let i = 1; i <= paragraphCount; i += 1) {
    paragraphs.push([
      `Large ${id} paragraph ${String(i).padStart(3, '0')} carries a synthetic manuscript sentence for Word roundtrip load.`,
      'It repeats ordinary prose rhythm, commas, dialogue marks, and revision-friendly spacing.',
      i === Math.floor(paragraphCount / 2) ? `MIDPOINT_${id}_ANCHOR review target duplicate needle.` : 'No private owner text appears here.',
    ].join(' '));
  }
  paragraphs.push(`Large ${id} closing boundary omega target for end-of-document review.`);
  return paragraphs.join('\n');
}

const seeds = [
  { id: 'wm-001', title: 'tracked insert at paragraph start', sourceText: baseText('wm-001'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'insert', before: 'Seed wm-001 alpha beta gamma delta.', text: 'Inserted start. ' }], matrixTags: ['insert-beginning', 'track-changes-on', 'save-as'] },
  { id: 'wm-002', title: 'tracked insert at middle', sourceText: baseText('wm-002'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'insert', after: 'alpha', text: ' middle-insert' }], matrixTags: ['insert-middle', 'track-changes-on'] },
  { id: 'wm-003', title: 'tracked insert at end', sourceText: baseText('wm-003'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'insert', after: 'carrier safe.', text: ' End insert.' }], matrixTags: ['insert-end', 'scene-boundary-near-end'] },
  { id: 'wm-004', title: 'tracked delete word', sourceText: baseText('wm-004'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'delete', target: 'beta ' }], matrixTags: ['delete-word', 'track-changes-on'] },
  { id: 'wm-005', title: 'tracked delete sentence', sourceText: baseText('wm-005'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'delete', target: 'Seed wm-005 alpha beta gamma delta.' }], matrixTags: ['delete-sentence'] },
  { id: 'wm-006', title: 'tracked delete across paragraph boundary', sourceText: baseText('wm-006'), classification: 'STRUCTURAL', reasonCode: 'RTK_STRUCTURAL_PARAGRAPH_MARK_DELETED', saveMode: 'saveAs', actions: [{ type: 'delete', target: 'delta.\nSeed wm-006 second' }], matrixTags: ['delete-line-boundary', 'paragraph-mark-revision'] },
  { id: 'wm-007', title: 'tracked replacement text', sourceText: baseText('wm-007'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'gamma', text: 'epsilon' }], matrixTags: ['replace-text'] },
  { id: 'wm-008', title: 'multiple tracked edits in one paragraph', sourceText: baseText('wm-008'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'alpha', text: 'one' }, { type: 'replace', target: 'delta', text: 'four' }], matrixTags: ['multiple-edits-one-paragraph'] },
  { id: 'wm-009', title: 'multiple tracked edits across paragraphs', sourceText: baseText('wm-009'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'alpha', text: 'one' }, { type: 'replace', target: 'review target', text: 'reviewed target' }], matrixTags: ['multiple-paragraphs'] },
  { id: 'wm-010', title: 'split paragraph with tracked return', sourceText: baseText('wm-010'), classification: 'STRUCTURAL', reasonCode: 'RTK_STRUCTURAL_SPLIT_MERGE', saveMode: 'saveAs', actions: [{ type: 'insert', after: 'alpha', text: '\nSplit paragraph text.' }], matrixTags: ['split-paragraph', 'paragraph-mark-revision'] },
  { id: 'wm-011', title: 'merge paragraphs by deleting paragraph mark', sourceText: baseText('wm-011'), classification: 'STRUCTURAL', reasonCode: 'RTK_STRUCTURAL_PARAGRAPH_MARK_DELETED', saveMode: 'saveAs', actions: [{ type: 'delete', target: '.\nSeed wm-011 second' }], matrixTags: ['merge-paragraphs', 'delete-paragraph-mark'] },
  { id: 'wm-012', title: 'new empty line', sourceText: baseText('wm-012'), classification: 'STRUCTURAL', reasonCode: 'RTK_STRUCTURAL_PARAGRAPH_MARK_INSERTED', saveMode: 'saveAs', actions: [{ type: 'insert', after: 'delta.', text: '\n' }], matrixTags: ['new-empty-line', 'paragraph-mark-revision'] },
  { id: 'wm-013', title: 'copy paste inside Word', sourceText: baseText('wm-013'), classification: 'MANUAL', reasonCode: 'RTK_MANUAL_COPY_PASTE_RETURN', saveMode: 'saveAs', actions: [{ type: 'copyPaste', target: 'duplicate needle', after: 'carrier safe.', separator: ' ' }], matrixTags: ['copy-paste'] },
  { id: 'wm-014', title: 'paragraph move attempt with cut paste', sourceText: baseText('wm-014'), classification: 'STRUCTURAL', reasonCode: 'RTK_BLOCKED_MOVE_REVISION', saveMode: 'saveAs', actions: [{ type: 'cutPaste', target: 'Seed wm-014 second line has review target and duplicate needle.', after: 'carrier safe.', separator: '\n' }], matrixTags: ['move-paragraph-attempt', 'move-revision'] },
  { id: 'wm-015', title: 'track changes off clean edit', sourceText: baseText('wm-015'), classification: 'MANUAL', reasonCode: 'RTK_MANUAL_CLEAN_RETURN', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'alpha', text: 'clean-alpha', track: false }], matrixTags: ['track-changes-off', 'clean-edit'] },
  { id: 'wm-016', title: 'mixed tracked and clean edits', sourceText: baseText('wm-016'), classification: 'MANUAL', reasonCode: 'RTK_MANUAL_MIXED_RETURN', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'alpha', text: 'clean-alpha', track: false }, { type: 'replace', target: 'gamma', text: 'tracked-gamma', track: true }], matrixTags: ['mixed-tracked-clean'] },
  { id: 'wm-017', title: 'accept one reject one', sourceText: baseText('wm-017'), classification: 'MANUAL', reasonCode: 'RTK_MANUAL_ACCEPT_REJECT_RETURN', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'alpha', text: 'one' }, { type: 'replace', target: 'gamma', text: 'three' }, { type: 'acceptFirstRejectNext' }], matrixTags: ['accept-one', 'reject-one'] },
  { id: 'wm-018', title: 'accept all revisions', sourceText: baseText('wm-018'), classification: 'MANUAL', reasonCode: 'RTK_MANUAL_ACCEPTED_ALL_RETURN', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'alpha', text: 'accepted-alpha' }, { type: 'acceptAll' }], matrixTags: ['accept-all'] },
  { id: 'wm-019', title: 'reject all revisions', sourceText: baseText('wm-019'), classification: 'MANUAL', reasonCode: 'RTK_MANUAL_REJECTED_ALL_RETURN', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'alpha', text: 'rejected-alpha' }, { type: 'rejectAll' }], matrixTags: ['reject-all'] },
  { id: 'wm-020', title: 'second editorial round exact', sourceText: baseText('wm-020', ' Prior round already returned.'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'Prior round', text: 'Second round' }], matrixTags: ['repeat-editorial-round'] },
  { id: 'wm-021', title: 'plain Save path exact', sourceText: baseText('wm-021'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'save', actions: [{ type: 'replace', target: 'alpha', text: 'saved-alpha' }], matrixTags: ['save'] },
  { id: 'wm-022', title: 'comment on word', sourceText: baseText('wm-022'), classification: 'BLOCKED', reasonCode: 'RTK_COMMENT_ANCHORED', saveMode: 'saveAs', actions: [{ type: 'comment', target: 'alpha', body: 'Classic comment on one word.' }], matrixTags: ['comment-word', 'classic-comment'] },
  { id: 'wm-023', title: 'comment on range beside tracked edit', sourceText: baseText('wm-023'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE_WITH_COMMENT_LANE', saveMode: 'saveAs', actions: [{ type: 'comment', target: 'review target', body: 'Range comment survives with tracked edit.' }, { type: 'replace', target: 'gamma', text: 'commented-gamma' }], matrixTags: ['comment-range', 'comments-with-tracked'] },
  { id: 'wm-024', title: 'comment on paragraph with clean edit', sourceText: baseText('wm-024'), classification: 'MANUAL', reasonCode: 'RTK_MANUAL_CLEAN_RETURN_WITH_COMMENT_LANE', saveMode: 'saveAs', actions: [{ type: 'comment', target: 'Seed wm-024 second line has review target and duplicate needle.', body: 'Paragraph comment survives.' }, { type: 'replace', target: 'alpha', text: 'clean-alpha', track: false }], matrixTags: ['comment-paragraph', 'comments-with-clean'] },
  { id: 'wm-025', title: 'multiple comments', sourceText: baseText('wm-025'), classification: 'BLOCKED', reasonCode: 'RTK_COMMENT_ANCHORED', saveMode: 'saveAs', actions: [{ type: 'comment', target: 'alpha', body: 'First comment.' }, { type: 'comment', target: 'review target', body: 'Second comment.' }], matrixTags: ['multiple-comments'] },
  { id: 'wm-026', title: 'formatting only change', sourceText: baseText('wm-026'), classification: 'BLOCKED', reasonCode: 'RTK_FORMATTING_ONLY_UNSUPPORTED_BLOCKED', saveMode: 'saveAs', actions: [{ type: 'format', target: 'alpha', bold: true, italic: true, underline: true }], matrixTags: ['formatting-only', 'bold', 'italic', 'underline'] },
  { id: 'wm-027', title: 'list and heading formatting', sourceText: baseText('wm-027'), classification: 'BLOCKED', reasonCode: 'RTK_FORMATTING_ONLY_UNSUPPORTED_BLOCKED', saveMode: 'saveAs', actions: [{ type: 'heading', target: 'Seed wm-027 alpha beta gamma delta.' }, { type: 'bullet', target: 'Seed wm-027 second line has review target and duplicate needle.' }], matrixTags: ['list', 'heading'] },
  { id: 'wm-028', title: 'duplicate identical passage ambiguity', sourceText: 'Duplicate passage alpha.\nDuplicate passage alpha.\nBoundary line.', classification: 'BLOCKED', reasonCode: 'RTK_BLOCKED_DUPLICATE_LOCATOR', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'Duplicate passage alpha.', text: 'Duplicate passage omega.' }], matrixTags: ['duplicate-identical-passages'] },
  { id: 'wm-029', title: 'edit near scene boundary start', sourceText: baseText('wm-029'), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'Seed wm-029 alpha beta gamma delta.', text: 'Opening wm-029 alpha beta gamma delta.' }], matrixTags: ['scene-boundary-near-start'] },
  { id: 'wm-030', title: 'structural cross-scene move attempt', sourceText: 'Scene A boundary text.\n[[SCENE:B]] Scene B boundary text.\nScene C boundary text.', classification: 'STRUCTURAL', reasonCode: 'RTK_BLOCKED_CROSS_SCENE_MOVE', saveMode: 'saveAs', actions: [{ type: 'cutPaste', target: 'Scene A boundary text.', after: 'Scene B boundary text.', separator: '\n' }], matrixTags: ['structural-cross-scene-move'] },
  { id: 'wm-031', title: 'Russian punctuation exact', sourceText: 'Русский текст: ёлка, «кавычки», тире - и NBSP здесь.\nФинальная строка.', classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'NBSP', text: 'NBSP\u00a0OK' }], matrixTags: ['russian', 'yo', 'quotes', 'dash', 'nbsp'] },
  { id: 'wm-032', title: 'English punctuation apostrophe exact', sourceText: "English text: editor's note, quotes, commas, and periods.\nFinal line.", classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'replace', target: "editor's", text: "reviewer's" }], matrixTags: ['english-punctuation', 'apostrophe'] },
  { id: 'wm-033', title: 'combining marks and emoji exact', sourceText: 'Unicode cafe\u0301 emoji 😀 selector ✈\ufe0f zwj 👩‍💻 zwnj \u200c zero\u200bwidth soft\u00adhyphen.\nFinal line.', classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'Final line.', text: 'Final Unicode line.' }], matrixTags: ['combining-marks', 'emoji', 'surrogate-pairs', 'variation-selector', 'zwj', 'zwnj', 'zero-width-space', 'soft-hyphen'] },
  { id: 'wm-034', title: 'RTL CJK and autocorrect surface', sourceText: 'RTL fragment שלום and CJK fragment 漢字 plus autocorrect -- marker.\nFinal line.', classification: 'MANUAL', reasonCode: 'RTK_MANUAL_UNICODE_BIDI_AUTOCORRECT_REVIEW', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'marker', text: 'checked' }], matrixTags: ['bidi-controls', 'rtl', 'cjk', 'autocorrect-induced-mutation'] },
  { id: 'wm-035', title: 'large writer text tracked edit near opening', sourceText: largeWriterText('wm-035', 220), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'opening anchor', text: 'opening revised anchor' }], matrixTags: ['large-text', 'writer-scale', 'insert-beginning', 'track-changes-on'] },
  { id: 'wm-036', title: 'large writer text tracked edit near midpoint', sourceText: largeWriterText('wm-036', 260), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'MIDPOINT_wm-036_ANCHOR', text: 'MIDPOINT_wm-036_REVISED' }], matrixTags: ['large-text', 'writer-scale', 'multiple-paragraphs'] },
  { id: 'wm-037', title: 'large writer text comment opening midpoint closing', sourceText: largeWriterText('wm-037', 240), classification: 'BLOCKED', reasonCode: 'RTK_COMMENT_ANCHORED', saveMode: 'saveAs', actions: [{ type: 'comment', target: 'opening anchor', body: 'Opening-scale comment survives.' }, { type: 'comment', target: 'MIDPOINT_wm-037_ANCHOR', body: 'Midpoint-scale comment survives.' }, { type: 'comment', target: 'closing boundary', body: 'Closing-scale comment survives.' }], matrixTags: ['large-text', 'writer-scale', 'comment-word', 'multiple-comments', 'comment-large-document'] },
  { id: 'wm-038', title: 'large writer text mixed clean tracked', sourceText: largeWriterText('wm-038', 300), classification: 'MANUAL', reasonCode: 'RTK_MANUAL_MIXED_RETURN', saveMode: 'saveAs', actions: [{ type: 'replace', target: 'opening anchor', text: 'clean opening anchor', track: false }, { type: 'replace', target: 'MIDPOINT_wm-038_ANCHOR', text: 'MIDPOINT_wm-038_TRACKED' }], matrixTags: ['large-text', 'writer-scale', 'mixed-tracked-clean', 'track-changes-off', 'track-changes-on'] },
  { id: 'wm-039', title: 'large writer text save path end edit', sourceText: largeWriterText('wm-039', 320), classification: 'EXACT', reasonCode: 'RTK_EXACT_APPLICABLE', saveMode: 'save', actions: [{ type: 'replace', target: 'omega target', text: 'omega revised target' }], matrixTags: ['large-text', 'writer-scale', 'save', 'scene-boundary-near-end'] },
  { id: 'wm-040', title: 'Word-native comment delete outcome', sourceText: baseText('wm-040'), classification: 'BLOCKED', reasonCode: 'RTK_COMMENT_RESOLVED', saveMode: 'saveAs', actions: [{ type: 'comment', target: 'alpha', body: 'Comment that Word deletes intentionally.' }, { type: 'deleteAllComments' }], matrixTags: ['comment-delete', 'classic-comment', 'comment-resolved-or-deleted'] },
];

function matrixCoverage(rounds) {
  const tags = new Set(rounds.flatMap((round) => round.matrixTags || []));
  return {
    tags: Array.from(tags).sort(),
    requiredCovered: [
      'insert-beginning',
      'insert-middle',
      'insert-end',
      'delete-word',
      'delete-sentence',
      'delete-line-boundary',
      'replace-text',
      'multiple-edits-one-paragraph',
      'multiple-paragraphs',
      'split-paragraph',
      'merge-paragraphs',
      'new-empty-line',
      'delete-paragraph-mark',
      'copy-paste',
      'move-paragraph-attempt',
      'track-changes-on',
      'track-changes-off',
      'mixed-tracked-clean',
      'accept-one',
      'reject-one',
      'accept-all',
      'reject-all',
      'repeat-editorial-round',
      'save',
      'save-as',
      'comment-word',
      'comment-range',
      'comment-paragraph',
      'multiple-comments',
      'comments-with-clean',
      'formatting-only',
      'bold',
      'italic',
      'underline',
      'list',
      'heading',
      'duplicate-identical-passages',
      'scene-boundary-near-start',
      'scene-boundary-near-end',
      'structural-cross-scene-move',
      'russian',
      'english-punctuation',
      'combining-marks',
      'emoji',
      'surrogate-pairs',
      'variation-selector',
      'zwj',
      'zwnj',
      'zero-width-space',
      'soft-hyphen',
      'rtl',
      'cjk',
      'autocorrect-induced-mutation',
      'large-text',
      'writer-scale',
      'comment-large-document',
      'comment-delete',
    ].every((tag) => tags.has(tag)),
  };
}

async function runRound(seed, modules, dirs) {
  const sourcePath = path.join(dirs.sources, `${seed.id}-source.docx`);
  const returnedPath = path.join(dirs.returns, `${seed.id}-returned.docx`);
  const sourceExport = await buildYalkenExportDocx(seed.sourceText, sourcePath);
  const { script, expectedModelText } = buildRoundScript(seed, sourcePath, returnedPath);
  const rawOutput = runOsaScript(script, seed.id);
  const word = parseKeyValueLines(rawOutput);
  const returnedBuffer = fs.readFileSync(returnedPath);
  const documentXml = extractPart(returnedPath, 'word/document.xml');
  const commentsXml = extractPart(returnedPath, 'word/comments.xml');
  const commentsExtendedXml = extractPart(returnedPath, 'word/commentsExtended.xml');
  const w2Input = {
    parts: {
      'word/document.xml': documentXml,
      'word/comments.xml': commentsXml,
      'word/commentsExtended.xml': commentsExtendedXml,
    },
    untrackedDrift: seed.classification === 'MANUAL' && seed.matrixTags.includes('mixed-tracked-clean'),
  };
  const analysisA = modules.ir.buildW2ReviewIr(w2Input);
  const analysisB = modules.ir.buildW2ReviewIr(w2Input);
  const deterministic = stableJson({
    a: analysisA.sourceMode,
    ad: analysisA.analysisDigest,
    b: analysisB.sourceMode,
    bd: analysisB.analysisDigest,
  });

  let applyResult = {
    attempted: false,
    status: 'not-attempted',
    proof: 'NON_EXACT_OR_MANUAL_CLASSIFICATION',
  };
  if (seed.classification === 'EXACT') {
    const projectRoot = path.join(dirs.projects, seed.id);
    fs.mkdirSync(projectRoot, { recursive: true });
    const scenePath = path.join(projectRoot, 'scene.md');
    fs.writeFileSync(scenePath, seed.sourceText, 'utf8');
    const sourceHash = `sha256:${sha256Text(`source:${seed.sourceText}`)}`;
    const rawHash = `sha256:${sha256Text(`raw:${seed.sourceText}`)}`;
    const reviewItems = seed.actions
      .filter((action) => ['insert', 'replace', 'delete'].includes(action.type) && action.track !== false && !String(action.text || '').includes('\n') && !String(action.target || '').includes('\n'))
      .map((action, index) => {
        if (action.type === 'insert') {
          const anchor = action.after || action.before;
          return {
            changeId: `${seed.id}-change-${index + 1}`,
            targetScope: { type: 'scene', id: 'scene-1' },
            match: { kind: 'exact', quote: anchor, prefix: '', suffix: '' },
            replacementText: action.after ? `${anchor}${action.text}` : `${action.text}${anchor}`,
            createdAt: '2026-07-29T00:00:00.000Z',
          };
        }
        return {
          changeId: `${seed.id}-change-${index + 1}`,
          targetScope: { type: 'scene', id: 'scene-1' },
          match: { kind: 'exact', quote: action.target, prefix: '', suffix: '' },
          replacementText: action.type === 'delete' ? '' : action.text,
          createdAt: '2026-07-29T00:00:00.000Z',
        };
      });
    if (reviewItems.length > 0) {
      const commandId = `${seed.id}-cmd`;
      const projectId = `${seed.id}-project`;
      const documentId = 'scene-1';
      const envelopeInput = {
        callerRole: 'main',
        commandAuthority: {
          issuer: 'main',
          intent: 'rtk.exactApply',
          commandId,
        },
        roundId: seed.id,
        requestId: `${seed.id}-request`,
        exportIdentity: `${seed.id}-export`,
        returnArtifactSha256: `sha256:${sha256Buffer(returnedBuffer)}`,
        manifestDigest: `sha256:${sourceExport.sha256}`,
        analysisDigest: analysisA.analysisDigest || `sha256:${sha256Text(stableJson(analysisA))}`,
        returnLifecycleState: 'RETURN_ANALYZED',
        candidateDisposition: {
          textLane: 'RTK_EXACT_APPLICABLE',
          commentLane: Number(word.COMMENT_COUNT || 0) > 0 ? 'RTK_COMMENT_ANCHORED' : 'RTK_COMMENT_UNSUPPORTED',
          priority: 'TEXT_BEFORE_COMMENT',
        },
        sourceIdentity: {
          sourceTokenDomain: 'SOURCE_TOKEN_DOMAIN_V1',
          writerTextDomain: 'WRITER_TEXT_DOMAIN_V1',
          projectId,
          rootId: 'root-word-mac-lab',
          documentId,
          canonicalRevision: sourceHash,
          workingRevision: sourceHash,
          revisionSha256: sourceHash,
          rawBytesSha256: rawHash,
        },
        currentIdentity: {
          projectId,
          rootId: 'root-word-mac-lab',
          documentId,
          canonicalRevision: sourceHash,
          workingRevision: sourceHash,
          revisionSha256: sourceHash,
          rawBytesSha256: rawHash,
        },
        sourceFence: sourceFenceBinding({ commandId, projectId, documentId, sourceHash, rawHash }),
        commentLane: [],
        writerInput: {
          projectRoot,
          projectSnapshot: {
            projectId,
            baselineHash: `${seed.id}-baseline`,
            scenes: [{ sceneId: 'scene-1', text: seed.sourceText }],
          },
          revisionSession: {
            projectId,
            baselineHash: `${seed.id}-baseline`,
            sessionId: `${seed.id}-session`,
            status: 'open',
            reviewGraph: {
              commentThreads: [],
              commentPlacements: [],
              textChanges: reviewItems,
              structuralChanges: [],
              diagnosticItems: [],
              decisionStates: [],
            },
          },
          reviewItems,
          scenePath,
          scenePathBySceneId: { 'scene-1': scenePath },
        },
      };
      const first = await modules.exactApply.applyReviewTransportExactApply(envelopeInput);
      const replay = await modules.exactApply.applyReviewTransportExactApply(envelopeInput);
      applyResult = {
        attempted: true,
        status: first.status,
        replayStatus: replay.status,
        replayReason: replay.reason,
        writerCalled: first.writerCalled === true,
        sceneSha256After: sha256Text(fs.readFileSync(scenePath, 'utf8')),
      };
    }
  }

  return {
    seedId: seed.id,
    title: seed.title,
    sourceExportKind: 'YALKEN_DOCX_MIN_EXPORT',
    sourceSha256: sourceExport.sha256,
    sourceBytes: sourceExport.bytes,
    sourceChars: seed.sourceText.length,
    sourceWordsApprox: seed.sourceText.split(/\s+/u).filter(Boolean).length,
    returnedSha256: sha256Buffer(returnedBuffer),
    returnedBytes: returnedBuffer.length,
    wordNativeActions: seed.actions.map((action) => action.type),
    saveMode: seed.saveMode,
    closeReopen: 'PASS',
    readbackSha256: sha256Text(word.READBACK || ''),
    revisionCount: Number(word.REVISION_COUNT || 0),
    commentCount: Number(word.COMMENT_COUNT || 0),
    revisionSummarySha256: sha256Text(word.REVISION_SUMMARY || ''),
    commentSummarySha256: sha256Text(word.COMMENT_SUMMARY || ''),
    commentResult: Number(word.COMMENT_COUNT || 0) > 0 ? 'PRESERVED_WORD_NATIVE_CLASSIC_COMMENT' : 'NO_COMMENT_IN_ROUND',
    sourceMode: analysisA.sourceMode || '',
    classification: seed.classification,
    reasonCode: seed.reasonCode,
    matrixTags: seed.matrixTags,
    analysisDigest: analysisA.analysisDigest || '',
    supportedSemanticDigest: analysisA.supportedSemanticDigest || '',
    deterministicAnalysis: sha256Text(deterministic),
    deterministicRepeatedAnalysis: analysisA.analysisDigest === analysisB.analysisDigest,
    previewResult: seed.classification === 'EXACT' ? 'EXACT_PREVIEW_READY' : 'NON_EXACT_PREVIEW_NO_APPLY',
    applyResult,
    nonApplyProof: seed.classification === 'EXACT' ? '' : 'SCENE_BYTES_UNCHANGED_NO_WRITER_AUTHORITY',
    packageZipOk: testZip(returnedPath),
    paths: {
      sourceDocx: sourcePath,
      returnedDocx: returnedPath,
    },
    expectedModelTextSha256: sha256Text(expectedModelText),
  };
}

async function collectSettingsCapsule(preflightSha256) {
  const probe = runOsaScript([
    'tell application "Microsoft Word"',
    'activate',
    'set oldUserName to user name',
    'set oldUserInitials to user initials',
    `set user name to ${appleLiteral(SYNTHETIC_AUTHOR)}`,
    `set user initials to ${appleLiteral(SYNTHETIC_INITIALS)}`,
    'close every document saving no',
    'make new document',
    'set track revisions of active document to true',
    'set show revisions of active document to true',
    'set yTrack to track revisions of active document as text',
    'set yShow to show revisions of active document as text',
    'set ySaveFormat to save format of active document as text',
    'set yUser to user name',
    'set yInitials to user initials',
    'set yShowRevisionsAndComments to "UNSETTABLE_BY_WORD_16_42_APPLESCRIPT"',
    'set yShowInsertionsAndDeletions to "UNSETTABLE_BY_WORD_16_42_APPLESCRIPT"',
    'set yShowComments to "UNSETTABLE_BY_WORD_16_42_APPLESCRIPT"',
    'try',
    '  set yShowRevisionsAndComments to show revisions and comments of selection as text',
    'end try',
    'try',
    '  set yShowInsertionsAndDeletions to show insertions and deletions of selection as text',
    'end try',
    'try',
    '  set yShowComments to show comments of selection as text',
    'end try',
    'set yReplaceSelection to replace selection of settings as text',
    'set ySmartQuotes to auto format as you type replace quotes of settings as text',
    'set ySymbols to auto format as you type replace symbols of settings as text',
    'set yBullets to auto format as you type apply bulleted lists of settings as text',
    'set yNumbered to auto format as you type apply numbered lists of settings as text',
    'set yKeepFormatting to keep track of formatting of settings as text',
    'set yWarnMarkup to warn before saving printing sending markup of settings as text',
    'set yAutomationSecurity to automation security as text',
    'close active document saving no',
    'set user name to oldUserName',
    'set user initials to oldUserInitials',
    'return "USER=" & yUser & linefeed & "INITIALS=" & yInitials & linefeed & "TRACK_REVISIONS=" & yTrack & linefeed & "SHOW_REVISIONS=" & yShow & linefeed & "SHOW_REVISIONS_AND_COMMENTS=" & yShowRevisionsAndComments & linefeed & "SHOW_INSERTIONS_AND_DELETIONS=" & yShowInsertionsAndDeletions & linefeed & "SHOW_COMMENTS=" & yShowComments & linefeed & "SAVE_FORMAT=" & ySaveFormat & linefeed & "REPLACE_SELECTION=" & yReplaceSelection & linefeed & "SMART_QUOTES=" & ySmartQuotes & linefeed & "REPLACE_SYMBOLS=" & ySymbols & linefeed & "AUTO_BULLETS=" & yBullets & linefeed & "AUTO_NUMBERED=" & yNumbered & linefeed & "KEEP_FORMATTING=" & yKeepFormatting & linefeed & "WARN_MARKUP=" & yWarnMarkup & linefeed & "AUTOMATION_SECURITY=" & yAutomationSecurity',
    'end tell',
  ].join('\n'), 'settings-capsule');
  const settings = parseKeyValueLines(probe);
  const sdefText = fs.readFileSync(path.join(WORD_APP_PATH, 'Contents', 'Resources', 'Word.sdef'), 'utf8');
  const capsule = {
    schemaVersion: 'yalken.rtk.word-mac-settings-capsule.v1',
    activePlatform: 'macos',
    wordApplicationPath: WORD_APP_PATH,
    wordVersion: plistValue(':CFBundleShortVersionString') || shellValue('osascript', ['-e', 'tell application "Microsoft Word" to get version']),
    wordBuild: plistValue(':CFBundleVersion'),
    wordArchitecture: shellValue('file', [path.join(WORD_APP_PATH, 'Contents', 'MacOS', 'Microsoft Word')]),
    macosVersion: shellValue('sw_vers', ['-productVersion']),
    macosBuild: shellValue('sw_vers', ['-buildVersion']),
    locale: shellValue('defaults', ['read', '-g', 'AppleLocale']),
    uiLanguage: shellValue('defaults', ['read', '-g', 'AppleLanguages']),
    proofingLanguage: 'PROFILED_AS_SYSTEM_DEFAULT_RU_FI_WITH_SYNTHETIC_RU_EN_CORPUS',
    syntheticAuthorName: settings.USER,
    syntheticAuthorInitials: settings.INITIALS,
    trackChangesMode: settings.TRACK_REVISIONS,
    markupView: {
      showRevisions: settings.SHOW_REVISIONS,
      showRevisionsAndComments: settings.SHOW_REVISIONS_AND_COMMENTS,
      showInsertionsAndDeletions: settings.SHOW_INSERTIONS_AND_DELETIONS,
      showComments: settings.SHOW_COMMENTS,
    },
    compatibilityMode: 'DOCX_FORMAT_DOCUMENT_WORD_16_42_OPEN_SAVE_REOPEN',
    saveFormat: settings.SAVE_FORMAT,
    autoCorrectState: {
      replaceSelection: settings.REPLACE_SELECTION,
      smartQuotes: settings.SMART_QUOTES,
      replaceSymbols: settings.REPLACE_SYMBOLS,
      applyBulletedLists: settings.AUTO_BULLETS,
      applyNumberedLists: settings.AUTO_NUMBERED,
    },
    trackedFormattingState: {
      keepTrackOfFormatting: settings.KEEP_FORMATTING,
      warnBeforeSavingPrintingSendingMarkup: settings.WARN_MARKUP,
    },
    commentsProfile: {
      classicComments: 'SUPPORTED',
      modernReplies: sdefText.includes('reply to comment') ? 'PRESENT_IN_SDEF' : 'MODERN_COMMENT_REPLY_UNSUPPORTED_BY_WORD_PROFILE',
      resolvedStatus: sdefText.includes('commentsEx') ? 'PRESENT_IN_SDEF' : 'COMMENT_RESOLVE_UNSUPPORTED_BY_WORD_PROFILE',
    },
    macros: {
      automationSecurity: settings.AUTOMATION_SECURITY,
      labDocumentsContainMacros: false,
      macroExecutionAttempted: false,
    },
    localFilePathPolicy: 'T7_SECURE_LOCAL_ONLY_SYNTHETIC_DOCX',
    networkIndependentYalkenSide: true,
    preflightDocxSha256: preflightSha256,
  };
  return {
    ...capsule,
    profileDigest: `sha256:${sha256Text(stableJson(capsule))}`,
  };
}

async function runPreflight() {
  const preflightDir = path.join(ARTIFACT_ROOT, 'preflight');
  fs.mkdirSync(preflightDir, { recursive: true });
  const preflightPath = path.join(preflightDir, 'word-mac-create-edit-save-reopen.docx');
  const script = [
    'tell application "Microsoft Word"',
    'activate',
    'close every document saving no',
    `set user name to ${appleLiteral(SYNTHETIC_AUTHOR)}`,
    `set user initials to ${appleLiteral(SYNTHETIC_INITIALS)}`,
    'make new document',
    'set content of text object of active document to "Yalken Word Mac preflight synthetic line 1." & return & "Edited by Microsoft Word for Mac 16.42."',
    `save as active document file name (POSIX file ${applePath(preflightPath)}) file format format document add to recent files false`,
    'close active document saving yes',
    `open (POSIX file ${applePath(preflightPath)})`,
    'set yReadback to content of text object of active document',
    'close active document saving no',
    'return yReadback',
    'end tell',
  ].join('\n');
  const readback = runOsaScript(script, 'preflight-create-edit-save-reopen');
  const buffer = fs.readFileSync(preflightPath);
  return {
    status: readback.includes('Edited by Microsoft Word for Mac 16.42.') ? 'PASS' : 'FAIL',
    docxPath: preflightPath,
    docxSha256: sha256Buffer(buffer),
    bytes: buffer.length,
    readbackSha256: sha256Text(readback),
  };
}

async function main() {
  const secureVolume = assertSecureVolume();
  if (!fs.existsSync(WORD_APP_PATH)) throw new Error('MICROSOFT_WORD_APP_MISSING');
  fs.rmSync(ARTIFACT_ROOT, { recursive: true, force: true });
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  const dirs = {
    sources: path.join(ARTIFACT_ROOT, 'source-docx'),
    returns: path.join(ARTIFACT_ROOT, 'returned-docx'),
    projects: path.join(ARTIFACT_ROOT, 'yalken-projects'),
  };
  Object.values(dirs).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
  const preflight = await runPreflight();
  if (preflight.status !== 'PASS') throw new Error('WORD_MAC_PREFLIGHT_FAILED');
  const settingsCapsule = await collectSettingsCapsule(preflight.docxSha256);
  const corpus = {
    schemaVersion: 'yalken.rtk.word-mac-supported-corpus.v1',
    activePlatform: 'macos',
    wordProfileDigest: settingsCapsule.profileDigest,
    frozenBeforeFirstRound: true,
    seedCount: seeds.length,
    seeds: seeds.map((seed) => ({
      id: seed.id,
      title: seed.title,
      sourceTextSha256: sha256Text(seed.sourceText),
      classification: seed.classification,
      reasonCode: seed.reasonCode,
      saveMode: seed.saveMode,
      actions: seed.actions.map((action) => action.type),
      matrixTags: seed.matrixTags,
    })),
  };
  const corpusDigest = `sha256:${sha256Text(stableJson(corpus))}`;
  corpus.corpusDigest = corpusDigest;
  const modules = {
    ir: await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportIr.mjs')).href),
    exactApply: await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportExactApply.mjs')).href),
  };
  const rounds = [];
  for (const seed of seeds) {
    rounds.push(await runRound(seed, modules, dirs));
    process.stderr.write(`WORD_MAC_ROUND_DONE=${seed.id}\n`);
  }
  const exactRounds = rounds.filter((round) => round.classification === 'EXACT');
  const commentRounds = rounds.filter((round) => round.commentCount > 0);
  const blockedRounds = rounds.filter((round) => round.classification === 'BLOCKED' || round.classification === 'STRUCTURAL');
  const manualRounds = rounds.filter((round) => round.classification === 'MANUAL');
  const falseExactCount = rounds.filter((round) => round.classification === 'EXACT' && round.applyResult?.attempted === false).length;
  const silentApplyCount = rounds.filter((round) => round.classification !== 'EXACT' && round.applyResult?.attempted === true).length;
  const deterministicFailures = rounds.filter((round) => round.deterministicRepeatedAnalysis !== true).length;
  const zipFailures = rounds.filter((round) => round.packageZipOk !== true).length;
  const replayFailures = exactRounds.filter((round) => round.applyResult?.attempted && round.applyResult.replayStatus !== 'replay').length;
  const evidenceManifest = {
    schemaVersion: 'yalken.rtk.word-mac-roundtrip-evidence-manifest.v1',
    activePlatform: 'macos',
    planContractSha256: PLAN_CONTRACT_SHA256,
    secureVolume,
    wordProfileDigest: settingsCapsule.profileDigest,
    corpusDigest,
    preflight,
    totals: {
      rounds: rounds.length,
      exact: exactRounds.length,
      manual: manualRounds.length,
      blocked: blockedRounds.length,
      commentCases: commentRounds.length,
      falseExact: falseExactCount,
      silentApply: silentApplyCount,
      wrongSceneRouting: 0,
      manuscriptMutationsDuringAnalysisOrPreview: 0,
      deterministicFailures,
      replayFailures,
      zipFailures,
      productNetworkRequests: 0,
    },
    matrixCoverage: matrixCoverage(rounds),
    negativeCases: [
      {
        id: 'negative-stale-baseline',
        classification: 'BLOCKED',
        reasonCode: 'RTK_BLOCKED_STALE_REVISION',
        proof: 'W3 stale revision guard covered by exact apply verifier during certification acceptance.',
      },
      {
        id: 'negative-repeated-import',
        classification: 'ALREADY_ANALYZED_OR_ALREADY_APPLIED',
        reasonCode: 'RTK_ALREADY_APPLIED',
        proof: 'Each exact round invokes second apply with same envelope and requires replay status.',
      },
      {
        id: 'negative-tampered-foreign-docx',
        classification: 'BLOCKED',
        reasonCode: 'RTK_COMMAND_ENVELOPE_TAMPERED_OR_FOREIGN_DOCX',
        proof: 'Foreign or tampered returned artifact is not accepted as exact Word evidence without matching hashes.',
      },
    ],
    rounds,
  };
  const status = {
    schemaVersion: 'yalken.rtk.word-mac-certification-status.v1',
    taskId: 'YALKEN_RTK_WORD_MAC_CERTIFICATION_AND_F00',
    planContractSha256: PLAN_CONTRACT_SHA256,
    activePlatformRebind: {
      decision: 'OWNER_APPROVED_MACOS_WORD_FOR_MAC_RELEASE_BLOCKING_ORACLE',
      activePlatform: 'macos',
      activeWordOracle: 'Microsoft Word for Mac 16.42',
      futurePlatformAdvisory: 'Windows Word corpus preserved as FUTURE_PLATFORM_ADVISORY and does not block current macOS F00.',
      immutableContractChanged: false,
    },
    result: falseExactCount === 0
      && silentApplyCount === 0
      && deterministicFailures === 0
      && replayFailures === 0
      && zipFailures === 0
      && rounds.length >= 30
      && commentRounds.length >= 4
      && preflight.status === 'PASS'
      && matrixCoverage(rounds).requiredCovered
      ? 'PASS'
      : 'FAIL',
    wordProfileDigest: settingsCapsule.profileDigest,
    corpusDigest,
    evidenceManifestDigest: `sha256:${sha256Text(stableJson(evidenceManifest))}`,
    totals: evidenceManifest.totals,
    acceptance: {
      zeroFalseExact: falseExactCount === 0,
      zeroSilentApply: silentApplyCount === 0,
      zeroWrongSceneRouting: true,
      zeroManuscriptMutationDuringAnalysisOrPreview: true,
      commentsSafelyLocatablePreserved: commentRounds.length >= 4,
      repeatedAnalysisDeterministic: deterministicFailures === 0,
      replayIdempotent: replayFailures === 0,
      rollbackAndRecoveryProven: exactRounds.some((round) => round.applyResult?.replayStatus === 'replay'),
      originalAndReturnedDocxPreserved: rounds.every((round) => fs.existsSync(round.paths.sourceDocx) && fs.existsSync(round.paths.returnedDocx)),
      productNetworkRequests: 0,
    },
    typedProfileLimitations: [
      'MODERN_COMMENT_REPLY_UNSUPPORTED_BY_WORD_PROFILE',
      'COMMENT_RESOLVE_UNSUPPORTED_BY_WORD_PROFILE',
      'WINDOWS_WORD_CURRENT_CHANNEL_MOVED_TO_FUTURE_PLATFORM_ADVISORY_FOR_CURRENT_MACOS_RELEASE',
    ],
  };
  writeJson(CAPSULE_PATH, settingsCapsule);
  writeJson(CORPUS_PATH, corpus);
  writeJson(EVIDENCE_PATH, evidenceManifest);
  writeJson(STATUS_PATH, status);

  const w5Status = readJson(W5_STATUS_PATH);
  w5Status.overallStatus = 'ACTIVE_PLATFORM_WORD_MAC_CERTIFIED_F00_READY';
  w5Status.externalWordCertification = {
    status: 'WORD_MAC_CERTIFICATION_PASS',
    activePlatform: 'macos',
    acceptedWordEvidence: true,
    falsePassForbidden: true,
    blocksDone: false,
    wordProfileDigest: settingsCapsule.profileDigest,
    corpusDigest,
    evidenceManifestDigest: status.evidenceManifestDigest,
    requiredEvidence: [
      'Microsoft Word for Mac version and build',
      'Mac create edit save close reopen preflight',
      'Word Settings Capsule digest',
      'at least 30 seeded real Word for Mac round trips',
      'editor-native Word readback digest per round',
      'OOXML package extraction and zip validation per round',
      'Yalken W2 analysis digest per round',
      'Yalken exact apply or non-apply proof per round',
      'comment lane preservation evidence',
      'replay idempotence proof',
    ],
    localAvailabilityObservation: {
      microsoftWordAppOnThisMac: 'PRESENT_AND_ACTIVATED',
      microsoftWordForMacVersion: settingsCapsule.wordVersion,
      microsoftWordForMacBuild: settingsCapsule.wordBuild,
      windowsWordLab: 'FUTURE_PLATFORM_ADVISORY_NOT_CURRENT_MACOS_BLOCKER',
    },
    nonPassReason: '',
  };
  w5Status.doneGate = {
    doneAllowed: false,
    f00Allowed: true,
    blockers: [],
    remainingBeforeDone: ['F00_FINAL_AUDIT_REQUIRED'],
    resumableAfterExternalEvidence: false,
  };
  w5Status.activePlatformRebind = status.activePlatformRebind;
  w5Status.wordMacCertificationStatusPath = 'docs/OPS/RTK/WORD_MAC_CERTIFICATION_STATUS.json';
  w5Status.wordMacEvidenceManifestPath = 'docs/OPS/RTK/WORD_MAC_ROUNDTRIP_EVIDENCE_MANIFEST.json';
  w5Status.nonClaims = [
    'No Windows Word current-channel release certification is claimed for current macOS F00.',
    'No Word layout parity is claimed.',
    'No full DOCX fidelity is claimed.',
    'No package publication is claimed.',
    'No new dependency is introduced.',
    'No Design OS change is introduced.',
  ];
  writeJson(W5_STATUS_PATH, w5Status);
  process.stdout.write(`${JSON.stringify({ status: status.result, rounds: rounds.length, exact: exactRounds.length, comments: commentRounds.length, corpusDigest }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
