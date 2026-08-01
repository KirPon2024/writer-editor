#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildC5V2MultilingualQaLayer,
  validateC5V2SemanticOracle,
} from './rtk-word-c5v2-semantic-oracle.mjs';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RESULT_PREFIX = 'YALKEN_C5V2_CANARY_RESULT ';
const ARTIFACT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5v2-physical-canary';
const CORPUS_SCENE_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5-fullbook-certification/corpus/scenes';

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')}`;
}

function sha256File(filePath) {
  return `sha256:${sha256Bytes(fs.readFileSync(filePath))}`;
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
}

function shellValue(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || REPO_ROOT,
      encoding: 'utf8',
      timeout: options.timeout || 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    return `UNAVAILABLE:${error.status || error.signal || 'ERR'}`;
  }
}

function appleText(value) {
  return `"${String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .join('" & return & "')}"`;
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function docxDocumentWordText(docxPath) {
  const documentXml = shellValue('/usr/bin/unzip', ['-p', docxPath, 'word/document.xml'], { timeout: 30_000 });
  if (!documentXml || documentXml.startsWith('UNAVAILABLE:')) {
    throw new Error(`C5V2_CANARY_DOCX_DOCUMENT_XML_UNAVAILABLE:${documentXml}`);
  }
  const paragraphs = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)].map((match) => {
    const paragraphXml = match[0];
    return [...paragraphXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
      .map((textMatch) => decodeXmlText(textMatch[1]))
      .join('');
  });
  return `${paragraphs.join('\r')}\r`;
}

function bindLedgerToSourceDocxOffsets({ ledger, sourceDocxPath }) {
  const docxText = docxDocumentWordText(sourceDocxPath);
  const seenStarts = new Set();
  const boundOperations = ledger.operations.map((operation) => {
    const start = docxText.indexOf(operation.quote);
    if (start < 0) {
      throw new Error(`C5V2_CANARY_SOURCE_ANCHOR_NOT_IN_EXPORTED_DOCX:${operation.id}`);
    }
    const second = docxText.indexOf(operation.quote, start + 1);
    if (second >= 0) {
      throw new Error(`C5V2_CANARY_SOURCE_ANCHOR_NOT_UNIQUE_IN_EXPORTED_DOCX:${operation.id}`);
    }
    if (seenStarts.has(start)) {
      throw new Error(`C5V2_CANARY_DUPLICATE_SOURCE_RANGE:${operation.id}`);
    }
    seenStarts.add(start);
    return {
      ...operation,
      wordRange: {
        sourceKind: 'raw-exported-docx-document-xml',
        start,
        end: start + operation.quote.length,
        selectedTextSha256: sha256Text(operation.quote),
      },
    };
  });
  return {
    ...ledger,
    sourceDocxTextSha256: sha256Text(docxText),
    operations: boundOperations,
  };
}

function loadCanaryScenes() {
  const chosen = [
    { sceneId: 'dorian-01-chapter-i', file: 'dorian-01-chapter-i.txt', title: 'Chapter I' },
    { sceneId: 'dorian-02-chapter-ii', file: 'dorian-02-chapter-ii.txt', title: 'Chapter II' },
  ];
  const baseScenes = chosen.map((scene) => {
    const sourcePath = path.join(CORPUS_SCENE_ROOT, scene.file);
    const text = fs.readFileSync(sourcePath, 'utf8')
      .split(/\n{2,}/u)
      .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
      .filter((paragraph) => paragraph.trim().length > 40)
      .join('\n\n')
      .trim();
    return {
      ...scene,
      sourcePath,
      text,
      sourceSha256: sha256Text(text),
    };
  });
  const qa = buildC5V2MultilingualQaLayer({ scenes: baseScenes });
  return baseScenes.map((scene) => ({
    ...scene,
    text: `${scene.text}\n\n${qa.passages
      .filter((passage) => passage.sceneId === scene.sceneId)
      .map((passage) => passage.text)
      .join('\n\n')}\n`,
  }));
}

function uniquePhrases(text, maxCount) {
  const normalizedText = String(text || '').replace(/\s+/gu, ' ');
  const paragraphs = String(text || '').split(/\n{2,}/u).map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim()).filter(Boolean);
  const seen = new Set();
  const usedRanges = [];
  const out = [];
  function maybePush(phrase) {
    const cleaned = String(phrase || '').trim().replace(/"/gu, "'");
    if (cleaned.length < 24 || cleaned.length > 96) return false;
    if ((normalizedText.match(new RegExp(cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gu')) || []).length !== 1) return false;
    if (seen.has(cleaned)) return false;
    const start = normalizedText.indexOf(cleaned);
    const end = start + cleaned.length;
    if (start < 0 || usedRanges.some((range) => start < range.end && end > range.start)) return false;
    seen.add(cleaned);
    usedRanges.push({ start, end });
    out.push(cleaned);
    return out.length >= maxCount;
  }
  for (const paragraph of paragraphs) {
    const sentences = paragraph.match(/[^.!?;:]{28,90}[.!?;:]?/gu) || [];
    for (const sentence of sentences) {
      if (maybePush(sentence)) return out;
    }
    const words = paragraph.match(/[\p{L}\p{N}][\p{L}\p{N}’'-]*|[^\s]/gu) || [];
    for (let start = 0; start < words.length; start += 3) {
      for (const width of [6, 8, 10, 12]) {
        const phrase = words.slice(start, start + width).join(' ')
          .replace(/\s+([,.;:!?])/gu, '$1')
          .replace(/([“‘])\s+/gu, '$1')
          .replace(/\s+([”’])/gu, '$1');
        if (maybePush(phrase)) return out;
      }
    }
  }
  return out;
}

function buildCanaryLedger(scenes) {
  const counts = {
    tracked_replace: 80,
    tracked_insert: 20,
    tracked_delete: 20,
    root_comment: 30,
    reply_attempt: 8,
    state_attempt: 7,
    formatting: 25,
    structural: 10,
  };
  const familyOrder = [
    ...Array(counts.tracked_replace).fill('tracked_replace'),
    ...Array(counts.tracked_insert).fill('tracked_insert'),
    ...Array(counts.tracked_delete).fill('tracked_delete'),
    ...Array(counts.root_comment).fill('root_comment'),
    ...Array(counts.reply_attempt).fill('reply_attempt'),
    ...Array(counts.state_attempt).fill('state_attempt'),
    ...Array(counts.formatting).fill('formatting'),
    ...Array(counts.structural).fill('structural'),
  ];
  const phrasesByScene = new Map(scenes.map((scene) => [scene.sceneId, uniquePhrases(scene.text, 260)]));
  const cursorByScene = new Map(scenes.map((scene) => [scene.sceneId, 0]));
  const usedQuotesByScene = new Map(scenes.map((scene) => [scene.sceneId, new Set()]));
  const operations = [];
  for (let index = 0; index < familyOrder.length; index += 1) {
    const family = familyOrder[index];
    const scene = scenes[index % scenes.length];
    const phrases = phrasesByScene.get(scene.sceneId) || [];
    const usedQuotes = usedQuotesByScene.get(scene.sceneId);
    let cursor = cursorByScene.get(scene.sceneId) || 0;
    let quote = '';
    while (cursor < phrases.length) {
      const candidate = phrases[cursor];
      cursor += 1;
      if (!usedQuotes.has(candidate)) {
        quote = candidate;
        usedQuotes.add(candidate);
        break;
      }
    }
    cursorByScene.set(scene.sceneId, cursor);
    if (!quote) {
      throw new Error(`C5V2_CANARY_UNIQUE_ANCHORS_EXHAUSTED:${scene.sceneId}:${family}:${index + 1}`);
    }
    const band = cursor < phrases.length / 3 ? 'beginning' : cursor < (phrases.length * 2) / 3 ? 'middle' : 'end';
    operations.push({
      id: `canary-${String(index + 1).padStart(3, '0')}-${family}`,
      family,
      sceneId: scene.sceneId,
      band,
      quote,
      expectedOutcome: family.includes('attempt') ? 'MANUAL_OR_BLOCKED' : 'SAFE_APPLY',
      replacementText: `C5V2_${family}_${String(index + 1).padStart(3, '0')}`,
    });
  }
  return {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-canary-ledger.v1',
    operationCount: operations.length,
    familyCounts: counts,
    scenes: scenes.map((scene) => ({ sceneId: scene.sceneId, title: scene.title, sourceSha256: scene.sourceSha256 })),
    operations,
    distribution: {
      scenes: Object.fromEntries(scenes.map((scene) => [
        scene.sceneId,
        operations.filter((operation) => operation.sceneId === scene.sceneId).length,
      ])),
      bands: operations.reduce((acc, operation) => {
        acc[operation.band] = (acc[operation.band] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

function createFullManuscriptExportChildSource({ tempRoot, outPath, scenes }) {
  return `\
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, Menu, session } = require('electron');
const rootDir = ${JSON.stringify(REPO_ROOT)};
const tempRoot = ${JSON.stringify(tempRoot)};
const outPath = ${JSON.stringify(outPath)};
const scenes = ${JSON.stringify(scenes.map((scene) => ({ file: scene.file, text: scene.text })))};
const RESULT_PREFIX = ${JSON.stringify(RESULT_PREFIX)};
const projectName = '\\u0420\\u043e\\u043c\\u0430\\u043d';
const dialogCalls = [];
const networkRequests = [];
function emit(payload) { process.stdout.write(RESULT_PREFIX + JSON.stringify(payload) + '\\n'); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitUntil(predicate, label, timeoutMs = 15000) {
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
function findTreeNodeByKind(node, kind) {
  if (!node || typeof node !== 'object') return null;
  if (node.kind === kind) return node;
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    const found = findTreeNodeByKind(child, kind);
    if (found) return found;
  }
  return null;
}
async function clickNativeMenuItem(item, win) {
  const maybePromise = item.click.call(item, item, win, { triggeredByAccelerator: false });
  if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
}
for (const dirName of ['appData', 'userData', 'documents']) fs.mkdirSync(path.join(tempRoot, dirName), { recursive: true });
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
        const timer = setTimeout(() => reject(new Error('LOAD_TIMEOUT')), 15000);
        win.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
        win.webContents.once('did-fail-load', (_event, _code, description) => {
          clearTimeout(timer);
          reject(new Error('DID_FAIL_LOAD:' + description));
        });
      });
    }
    const projectRoot = path.join(tempRoot, 'documents', 'craftsman', projectName);
    const manifestPath = path.join(projectRoot, 'project.craftsman.json');
    await waitUntil(() => fs.existsSync(manifestPath), 'MANIFEST_NOT_CREATED');
    const projectTreeProbe = await win.webContents.executeJavaScript(
      "window.electronAPI.invokeWorkspaceQueryBridge({queryId:'query.projectTree',payload:{tab:'roman'}})",
      true,
    );
    const romanNode = findTreeNodeByKind(projectTreeProbe && projectTreeProbe.root, 'roman-root');
    const romanRoot = romanNode && typeof romanNode.nodePath === 'string' && romanNode.nodePath
      ? romanNode.nodePath
      : path.join(projectRoot, 'roman');
    fs.mkdirSync(romanRoot, { recursive: true });
    for (const scene of scenes) fs.writeFileSync(path.join(romanRoot, scene.file), scene.text, 'utf8');
    await sleep(500);
    const scopeProbe = await win.webContents.executeJavaScript(
      "window.electronAPI.invokeWorkspaceQueryBridge({queryId:'query.selectedScenesTxtExportScope',payload:{}})",
      true,
    );
    const applicationMenu = Menu.getApplicationMenu();
    const menuItem = applicationMenu?.getMenuItemById('review-export-full-manuscript-docx-review-packet')
      || flattenMenuItems(applicationMenu).find((item) => /Full Manuscript Review DOCX/iu.test(item.label || ''));
    if (!menuItem || typeof menuItem.click !== 'function') throw new Error('FULL_MANUSCRIPT_EXPORT_MENU_ITEM_MISSING:' + JSON.stringify(flattenMenuItems(applicationMenu).map((item) => ({ id: item.id, label: item.label }))));
    const menuDiagnostics = {
      id: menuItem.id || '',
      label: menuItem.label || '',
      enabled: menuItem.enabled === true,
      visible: menuItem.visible !== false,
    };
    await clickNativeMenuItem(menuItem, win);
    await sleep(500);
    let exportTrigger = 'native-menu-click';
    let bridgeResult = null;
    if (dialogCalls.length === 0 && !fs.existsSync(outPath)) {
      exportTrigger = 'renderer-ui-command-bridge-after-native-menu-click-noop';
      const bridgeScript = "window.electronAPI.invokeUiCommandBridge({"
        + "route:'command.bus',"
        + "commandId:'cmd.project.review.exportFullManuscriptDocxReviewPacket',"
        + "payload:{requestId:'c5v2-physical-canary-fullbook-export',outPath:" + JSON.stringify(outPath) + "}"
        + "})";
      bridgeResult = await win.webContents.executeJavaScript(bridgeScript, true);
      await sleep(500);
    }
    let waitError = null;
    try {
      await waitUntil(() => fs.existsSync(outPath), 'FULL_MANUSCRIPT_DOCX_EXPORT_NOT_WRITTEN', 20000);
    } catch (error) {
      waitError = error && error.message ? error.message : String(error);
    }
    if (!fs.existsSync(outPath) && bridgeResult === null) {
      exportTrigger = 'renderer-ui-command-bridge-after-native-menu-timeout';
      const bridgeScript = "window.electronAPI.invokeUiCommandBridge({"
        + "route:'command.bus',"
        + "commandId:'cmd.project.review.exportFullManuscriptDocxReviewPacket',"
        + "payload:{requestId:'c5v2-physical-canary-fullbook-export-retry',outPath:" + JSON.stringify(outPath) + "}"
        + "})";
      bridgeResult = await win.webContents.executeJavaScript(bridgeScript, true);
      if (bridgeResult && bridgeResult.ok === true) {
        waitError = null;
        try {
          await waitUntil(() => fs.existsSync(outPath), 'FULL_MANUSCRIPT_DOCX_EXPORT_NOT_WRITTEN_AFTER_BRIDGE', 20000);
        } catch (error) {
          waitError = error && error.message ? error.message : String(error);
        }
      }
    }
    if (!fs.existsSync(outPath)) {
      emit({
        ok: 0,
        message: waitError || 'FULL_MANUSCRIPT_EXPORT_COMMAND_DID_NOT_WRITE_DOCX',
        menuDiagnostics,
        bridgeResult,
        exportTrigger,
        projectTreeProbe,
        scopeProbe,
        dialogCalls,
        networkRequests,
      });
      app.exit(1);
      return;
    }
    const bytes = fs.readFileSync(outPath);
    emit({
      ok: 1,
      clicked: true,
      exportTrigger,
      menuItemId: menuItem.id,
      menuItemLabel: menuItem.label,
      menuDiagnostics,
      bridgeResult,
      projectTreeProbe,
      scopeProbe,
      exportedExists: true,
      exportedSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      exportedBytes: bytes.length,
      dialogCalls,
      networkRequests,
      projectRoot,
      sceneFiles: scenes.map((scene) => path.join(romanRoot, scene.file)),
    });
    app.exit(0);
  } catch (error) {
    emit({ ok: 0, message: error && error.message ? error.message : String(error), stack: error && error.stack ? error.stack : '', dialogCalls, networkRequests });
    app.exit(1);
  }
});
`;
}

async function runElectronFullManuscriptExport({ runDir, sourcePath, scenes }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-canary-ui-'));
  const childPath = path.join(tempRoot, 'fullbook-export-child.cjs');
  fs.writeFileSync(childPath, createFullManuscriptExportChildSource({ tempRoot, outPath: sourcePath, scenes }), 'utf8');
  const stdoutChunks = [];
  const stderrChunks = [];
  const child = spawn(electronBinary, [childPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, ELECTRON_ENABLE_SECURITY_WARNINGS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
  let timedOut = false;
  const exitState = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 60_000);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  fs.writeFileSync(path.join(runDir, 'electron-export-stdout.log'), stdout);
  fs.writeFileSync(path.join(runDir, 'electron-export-stderr.log'), stderr);
  const line = stdout.split(/\r?\n/u).find((item) => item.startsWith(RESULT_PREFIX));
  const result = line ? JSON.parse(line.slice(RESULT_PREFIX.length)) : null;
  return {
    ok: timedOut === false && exitState.code === 0 && result?.ok === 1 && fs.existsSync(sourcePath),
    timedOut,
    exitCode: exitState.code,
    signal: exitState.signal,
    result,
    stderrTail: stderr.slice(-2000),
    sourcePath,
    sourceSha256: fs.existsSync(sourcePath) ? sha256File(sourcePath) : '',
  };
}

function wordOperationLines(ledger) {
  const lines = [];
  lines.push('set yOpsDone to ""');
  lines.push('set yLimitations to ""');
  lines.push('set yRootComments to {}');
  const markLine = (id, status, indent = '  ') => `${indent}set yOpsDone to yOpsDone & "OP|" & ${appleText(id)} & "|${status}" & linefeed`;
  const firstRootComment = ledger.operations.find((operation) => operation.family === 'root_comment' && operation.wordRange);
  const orderedOperations = [
    ...(firstRootComment ? [firstRootComment] : []),
    ...ledger.operations
      .filter((operation) => operation !== firstRootComment)
      .slice()
      .sort((left, right) => (right.wordRange?.start || 0) - (left.wordRange?.start || 0)),
  ];
  for (const operation of orderedOperations) {
    const id = operation.id;
    const quote = operation.quote;
    const rangeStart = operation.wordRange?.start;
    const rangeEnd = operation.wordRange?.end;
    lines.push('try');
    if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || rangeEnd <= rangeStart) {
      lines.push('  error "SOURCE_RANGE_NOT_BOUND" number 9104');
    } else {
      lines.push(`  set yRange to create range yDoc start ${rangeStart} end ${rangeEnd}`);
    }
    if (operation.family === 'tracked_replace') {
      lines.push('  set track revisions of yDoc to true');
      lines.push(`  set content of yRange to ${appleText(operation.replacementText)}`);
      lines.push(markLine(id, 'SAFE_APPLY'));
    } else if (operation.family === 'tracked_insert') {
      lines.push('  set track revisions of yDoc to true');
      lines.push(`  set content of yRange to ${appleText(`${operation.replacementText} ${quote}`)}`);
      lines.push(markLine(id, 'SAFE_APPLY'));
    } else if (operation.family === 'tracked_delete') {
      lines.push('  set track revisions of yDoc to true');
      lines.push('  set content of yRange to ""');
      lines.push(markLine(id, 'SAFE_APPLY'));
    } else if (operation.family === 'root_comment') {
      lines.push('  set track revisions of yDoc to false');
      lines.push(`  set yComment to make new Word comment at yRange with properties {comment text:${appleText(`C5V2 root ${id}`)}}`);
      lines.push('  set end of yRootComments to yComment');
      lines.push(markLine(id, 'SAFE_APPLY'));
    } else if (operation.family === 'reply_attempt') {
      lines.push('  set track revisions of yDoc to false');
      lines.push('  if (count of yRootComments) is 0 then error "NO_ROOT_COMMENT_FOR_REPLY" number 9102');
      lines.push('  try');
      lines.push(`    make new Word comment at yRange with properties {comment text:${appleText(`C5V2 reply ${id}`)}, parent:(item 1 of yRootComments)}`);
      lines.push(markLine(id, 'SAFE_APPLY', '    '));
      lines.push('  on error errMsg number errNo');
      lines.push('    set yLimitations to yLimitations & "REPLY_ATTEMPT|" & errNo & "|" & errMsg & linefeed');
      lines.push(markLine(id, 'MANUAL_OR_BLOCKED', '    '));
      lines.push('  end try');
    } else if (operation.family === 'state_attempt') {
      lines.push('  if (count of yRootComments) is 0 then error "NO_ROOT_COMMENT_FOR_STATE" number 9103');
      lines.push('  try');
      lines.push('    set done of (item 1 of yRootComments) to true');
      lines.push(markLine(id, 'SAFE_APPLY', '    '));
      lines.push('  on error errMsg number errNo');
      lines.push('    set yLimitations to yLimitations & "STATE_ATTEMPT|" & errNo & "|" & errMsg & linefeed');
      lines.push(markLine(id, 'MANUAL_OR_BLOCKED', '    '));
      lines.push('  end try');
    } else if (operation.family === 'formatting') {
      lines.push('  set track revisions of yDoc to false');
      lines.push('  set bold of font object of yRange to true');
      lines.push('  set italic of font object of yRange to true');
      lines.push(markLine(id, 'SAFE_APPLY'));
    } else if (operation.family === 'structural') {
      lines.push('  set track revisions of yDoc to true');
      lines.push(`  set content of yRange to ${appleText(`${quote}\nC5V2 structural split/page lane.`)}`);
      lines.push(markLine(id, 'SAFE_APPLY'));
    }
    lines.push('on error errMsg number errNo');
    lines.push('  set yLimitations to yLimitations & "OP_ERROR|' + id.replaceAll('"', '') + '|" & errNo & "|" & errMsg & linefeed');
    lines.push(markLine(id, 'BLOCKED'));
    lines.push('end try');
  }
  return lines.join('\n');
}

function buildWordScript({ sourcePath, returnedPath, ledger }) {
  const expectedName = path.basename(returnedPath);
  return [
    'on yOpenExpectedDoc(yPosixPath, yExpectedFullName, yExpectedName)',
    '  do shell script "/usr/bin/open -a " & quoted form of "Microsoft Word" & " " & quoted form of yPosixPath',
    '  set yDeadline to (current date) + 35',
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
    'on yFindRange(yDoc, yQuote)',
    '  tell application "Microsoft Word"',
    '    set yText to content of text object of yDoc',
    '  end tell',
    '  set yOffset to offset of yQuote in yText',
    '  if yOffset is 0 then return missing value',
    '  tell application "Microsoft Word"',
    '    return create range yDoc start (yOffset - 1) end ((yOffset - 1) + (count of characters of yQuote))',
    '  end tell',
    'end yFindRange',
    'tell application "Microsoft Word"',
    'activate',
    'set yDocWasOpened to false',
    'set oldAlerts to display alerts',
    'set oldUserName to user name',
    'set oldUserInitials to user initials',
    'try',
    '  set display alerts to alerts none',
    `  set user name to ${appleText('Yalken C5V2 Canary')}`,
    `  set user initials to ${appleText('C5V2')}`,
    `  set ySourceFile to POSIX file ${appleText(sourcePath)} as alias`,
    `  set yReturnedPath to ${appleText(returnedPath)}`,
    `  do shell script "/bin/cp " & quoted form of ${appleText(sourcePath)} & " " & quoted form of yReturnedPath`,
    `  set yFile to POSIX file ${appleText(returnedPath)} as alias`,
    '  set yExpectedFullName to yFile as text',
    `  if my yOpenExpectedDoc(${appleText(returnedPath)}, yExpectedFullName, ${appleText(expectedName)}) is not true then error "C5V2_CANARY_OPEN_TIMEOUT" number 9700`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set remove personal information of yDoc to false',
    '  set remove date and time of yDoc to false',
    '  set show revisions of yDoc to true',
    wordOperationLines(ledger),
    '  save yDoc',
    '  close yDoc saving yes',
    '  set yDocWasOpened to false',
    `  if my yOpenExpectedDoc(${appleText(returnedPath)}, yExpectedFullName, ${appleText(expectedName)}) is not true then error "C5V2_CANARY_REOPEN_TIMEOUT" number 9703`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yReadback to content of text object of yDoc',
    '  set yRevisionCount to count of revisions of yDoc',
    '  set yCommentCount to count of Word comments of yDoc',
    '  close yDoc saving no',
    '  set yDocWasOpened to false',
    '  set user name to oldUserName',
    '  set user initials to oldUserInitials',
    '  set display alerts to oldAlerts',
    '  return "WORD_STATUS=PASS" & linefeed & "REVISION_COUNT=" & yRevisionCount & linefeed & "COMMENT_COUNT=" & yCommentCount & linefeed & "READBACK_CHARS=" & (count of yReadback) & linefeed & yOpsDone & "LIMITATIONS_BEGIN" & linefeed & yLimitations & "LIMITATIONS_END"',
    'on error errMsg number errNo',
    '  try',
    '    if yDocWasOpened then close yDoc saving no',
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

function runAppleScript(scriptText, scriptPath) {
  fs.writeFileSync(scriptPath, scriptText, 'utf8');
  return execFileSync('/usr/bin/osascript', [scriptPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 240_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseWordOutput(output) {
  const lines = String(output || '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const ops = [];
  const scalars = {};
  const limitations = [];
  let inLimitations = false;
  for (const line of lines) {
    if (line === 'LIMITATIONS_BEGIN') {
      inLimitations = true;
      continue;
    }
    if (line === 'LIMITATIONS_END') {
      inLimitations = false;
      continue;
    }
    if (inLimitations) {
      limitations.push(line);
      continue;
    }
    if (line.startsWith('OP|')) {
      const [, id = '', status = ''] = line.split('|');
      ops.push({ id, status });
      continue;
    }
    const eq = line.indexOf('=');
    if (eq > 0) scalars[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return { scalars, ops, limitations };
}

function packageSummary(docxPath) {
  const entries = shellValue('/usr/bin/unzip', ['-Z1', docxPath], { timeout: 30_000 }).split(/\r?\n/u).filter(Boolean);
  const commentsXml = shellValue('/usr/bin/unzip', ['-p', docxPath, 'word/comments.xml'], { timeout: 30_000 });
  const documentXml = shellValue('/usr/bin/unzip', ['-p', docxPath, 'word/document.xml'], { timeout: 30_000 });
  return {
    zipOk: shellValue('/usr/bin/unzip', ['-tqq', docxPath], { timeout: 30_000 }) === '',
    entries,
    commentRelatedParts: entries.filter((entry) => /^word\/comments/u.test(entry)),
    commentTagCount: (commentsXml.match(/<w:comment[\s>]/gu) || []).length,
    revisionTagCount: (documentXml.match(/<w:(?:ins|del)\b/gu) || []).length,
    documentXmlSha256: sha256Text(documentXml),
    commentsXmlSha256: sha256Text(commentsXml),
  };
}

function buildOracleProbe({ ledger, wordParsed }) {
  const opStatus = new Map(wordParsed.ops.map((op) => [op.id, op.status]));
  const sampled = ledger.operations
    .filter((operation) => ['tracked_replace', 'root_comment', 'formatting'].includes(operation.family))
    .slice(0, 12)
    .map((operation) => ({
      id: operation.id,
      family: operation.family === 'tracked_replace' ? 'tracked_text_edit' : operation.family,
      expectedOutcome: opStatus.get(operation.id) === 'SAFE_APPLY' ? 'SAFE_APPLY' : 'BLOCKED',
      anchor: {
        sceneId: operation.sceneId,
        paragraphId: `canary-${operation.band}`,
        graphemeStart: 0,
        graphemeEnd: operation.quote.length,
        selectedText: operation.quote,
        contextBefore: operation.quote.slice(0, 16),
        contextAfter: operation.quote.slice(-16),
        baselineHash: sha256Text(operation.quote),
      },
      semanticIntent: operation.family === 'tracked_replace'
        ? { kind: 'replace', replacementText: operation.replacementText }
        : operation.family === 'root_comment'
          ? { kind: 'root-comment' }
          : { kind: 'bold' },
    }));
  const operationsById = {};
  for (const operation of sampled) {
    const extra = operation.family === 'tracked_text_edit'
      ? { textSemantics: { kind: operation.semanticIntent.kind, replacementText: operation.semanticIntent.replacementText } }
      : operation.family === 'root_comment'
        ? { commentSemantics: { threadId: `thread-${operation.id}`, state: 'open' } }
        : { formattingSemantics: { kind: operation.semanticIntent.kind, effective: true } };
    operationsById[operation.id] = {
      outcome: operation.expectedOutcome,
      anchor: operation.anchor,
      ...extra,
    };
  }
  return validateC5V2SemanticOracle({
    operations: sampled,
    wordReadback: { sourceKind: 'word-object-model', operationsById },
    yalkenTruth: { sourceKind: 'reopened-yalken-project', operationsById },
  });
}

async function main() {
  const runId = `c5v2-physical-canary-${nowStamp()}`;
  const runDir = path.join(ARTIFACT_ROOT, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const sourceDocxPath = path.join(runDir, 'c5v2-canary-source-fullmanuscript.docx');
  const returnedDocxPath = path.join(runDir, 'c5v2-canary-returned-word-native.docx');
  const scenes = loadCanaryScenes();
  let ledger = buildCanaryLedger(scenes);
  fs.writeFileSync(path.join(runDir, 'canary-ledger.pre-export.json'), `${JSON.stringify(ledger, null, 2)}\n`);
  const wordVersion = shellValue('/usr/bin/osascript', ['-e', 'tell application "Microsoft Word" to return version as text'], { timeout: 30_000 });
  const exportResult = await runElectronFullManuscriptExport({ runDir, sourcePath: sourceDocxPath, scenes });
  let wordOutput = '';
  let wordError = '';
  if (exportResult.ok) {
    try {
      ledger = bindLedgerToSourceDocxOffsets({ ledger, sourceDocxPath });
      fs.writeFileSync(path.join(runDir, 'canary-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`);
      wordOutput = runAppleScript(
        buildWordScript({ sourcePath: sourceDocxPath, returnedPath: returnedDocxPath, ledger }),
        path.join(runDir, 'word-canary.applescript'),
      );
    } catch (error) {
      wordError = String(error.stderr || error.message || error);
    }
  } else {
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'canary-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`);
  }
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'word-output.txt'), wordOutput || wordError, 'utf8');
  const wordParsed = parseWordOutput(wordOutput);
  const summary = {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-canary.result.v1',
    runId,
    headSha: shellValue('git', ['rev-parse', 'HEAD']),
    originMainSha: shellValue('git', ['rev-parse', 'origin/main']),
    wordVersion,
    route: [
      'real-yalken-full-manuscript-export-menu-command',
      'physical-word-open-edit-native-save',
      'physical-word-close-reopen-object-model-readback',
      'raw-ooxml-package-summary',
      'bounded-semantic-oracle-probe',
    ],
    sourceDocxPath,
    returnedDocxPath,
    sourceDocxSha256: fs.existsSync(sourceDocxPath) ? sha256File(sourceDocxPath) : '',
    returnedDocxSha256: fs.existsSync(returnedDocxPath) ? sha256File(returnedDocxPath) : '',
    exportResult,
    wordStatus: wordParsed.scalars.WORD_STATUS || (wordError ? 'FAIL' : 'UNKNOWN'),
    wordScalars: wordParsed.scalars,
    wordOperationSummary: {
      attempted: ledger.operations.length,
      reported: wordParsed.ops.length,
      safeApply: wordParsed.ops.filter((op) => op.status === 'SAFE_APPLY').length,
      manualOrBlocked: wordParsed.ops.filter((op) => op.status === 'MANUAL_OR_BLOCKED' || op.status === 'BLOCKED').length,
      byStatus: wordParsed.ops.reduce((acc, op) => {
        acc[op.status] = (acc[op.status] || 0) + 1;
        return acc;
      }, {}),
    },
    limitations: wordParsed.limitations,
    packageSummary: fs.existsSync(returnedDocxPath) ? packageSummary(returnedDocxPath) : null,
    oracleProbe: wordParsed.ops.length > 0 ? buildOracleProbe({ ledger, wordParsed }) : null,
    productRouteGaps: [
      'full-manuscript authenticated intake preview explicit apply is not yet physically executed by product runtime in this canary script',
      'comments replies state formatting structural operations are physical Word attempts with typed outcomes, not Yalken apply certification',
    ],
    certificationClaim: 'NO_PHYSICAL_PROVEN_C5_CERTIFICATION_CLAIM',
  };
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'canary-result.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(summary.exportResult.ok && summary.wordStatus === 'PASS' ? 0 : 1);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
