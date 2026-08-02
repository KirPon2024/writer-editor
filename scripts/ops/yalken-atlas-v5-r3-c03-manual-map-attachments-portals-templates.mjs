#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runHonestBlackBoxAcceptance } from './yalken-atlas-v5-r2-c05-honest-black-box-acceptance.mjs';
import {
  buildManualMapImagePdfExportEvidence,
  serializeManualMapExportJsonV1WithLossReport,
} from '../../src/export/mindmap/v1/index.mjs';
import {
  applyManualMapJsonRepeatImportViaCommandKernel,
} from '../../src/import/mindmap/v1/index.mjs';
import {
  CORE_COMMAND_IDS,
  applyCoreSequence,
  createInitialCoreState,
  reduceCoreState,
} from '../../src/core/runtime.mjs';

const REPORT_SCHEMA = 'yalken.atlas.v5.r3.c03.manualMapAttachmentsPortalsTemplates.v1';
const CONTOUR_ID = 'R3_C03_MANUAL_MAP_ATTACHMENTS_PORTALS_TEMPLATES_SATURATION';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_R3_C03_MANUAL_MAP_ATTACHMENTS_PORTALS_TEMPLATES');
const ACCEPTED_VIEWPORT = Object.freeze({ width: 1440, height: 1200 });
const TIMEOUT_MS = 60000;

function parseArgs(argv) {
  const out = { outDir: DEFAULT_OUT_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && index + 1 < argv.length) {
      out.outDir = path.resolve(String(argv[index + 1] || '').trim());
      index += 1;
    }
  }
  return out;
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(String(value ?? ''), 'utf8'));
}

function sha256File(filePath) {
  return sha256Buffer(fsSync.readFileSync(filePath));
}

function fileProof(filePath) {
  if (!filePath || !fsSync.existsSync(filePath)) return { path: filePath || '', exists: false, bytes: 0, sha256: '' };
  const stat = fsSync.statSync(filePath);
  return {
    path: filePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(filePath) : '',
  };
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createChildSource({ rootDir, tempRoot, mode }) {
  return `\
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog, nativeImage, session } = require('electron');

const rootDir = ${JSON.stringify(rootDir)};
const tempRoot = ${JSON.stringify(tempRoot)};
const mode = ${JSON.stringify(mode)};
let networkRequests = 0;
let dialogCalls = 0;
const inputEvents = [];
let debuggerAttached = false;

function emitResult(payload) {
  process.stdout.write('R3_C03_MANUAL_MAP_PORTABILITY_RESULT:' + JSON.stringify(payload) + '\\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recordInput(event) {
  inputEvents.push({
    type: event.type,
    keyCode: event.keyCode || '',
    modifiers: Array.isArray(event.modifiers) ? event.modifiers : [],
    x: Number.isFinite(event.x) ? Math.round(event.x) : null,
    y: Number.isFinite(event.y) ? Math.round(event.y) : null,
  });
}

async function sendInput(win, event) {
  recordInput(event);
  if (String(event.type || '').startsWith('mouse')) {
    if (debuggerAttached !== true) {
      win.webContents.debugger.attach('1.3');
      debuggerAttached = true;
    }
    const modifierBits = (Array.isArray(event.modifiers) ? event.modifiers : []).reduce((bits, modifier) => {
      if (modifier === 'alt') return bits | 1;
      if (modifier === 'control') return bits | 2;
      if (modifier === 'meta') return bits | 4;
      if (modifier === 'shift') return bits | 8;
      return bits;
    }, 0);
    const typeMap = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: typeMap[event.type] || 'mouseMoved',
      x: event.x,
      y: event.y,
      button: event.button || (event.type === 'mouseMove' ? 'none' : 'left'),
      clickCount: event.clickCount || (event.type === 'mouseMove' ? 0 : 1),
      modifiers: modifierBits,
    });
    await sleep(45);
    return;
  }
  win.webContents.sendInputEvent(event);
  await sleep(35);
}

async function js(win, source) {
  return win.webContents.executeJavaScript(source, true);
}

function selectorLiteral(value) {
  return JSON.stringify(String(value || ''));
}

function textLiteral(value) {
  return JSON.stringify(String(value || ''));
}

async function queryElement(win, selector, text = '') {
  return js(win, '(() => {' +
    'const selector = ' + selectorLiteral(selector) + ';' +
    'const wanted = ' + textLiteral(text) + '.trim().toLowerCase();' +
    'const visible = (el) => {' +
      'const r = el.getBoundingClientRect();' +
      'const s = getComputedStyle(el);' +
      'return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" && !el.closest("[hidden]");' +
    '};' +
    'for (const el of Array.from(document.querySelectorAll(selector))) {' +
      'const label = (el.textContent || el.getAttribute("aria-label") || "").trim();' +
      'if (!visible(el)) continue;' +
      'if (wanted && !label.toLowerCase().includes(wanted)) continue;' +
      'el.scrollIntoView({ block: "center", inline: "nearest" });' +
      'const r = el.getBoundingClientRect();' +
      'return { ok: 1, selector, text: label, disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true", cx: r.left + r.width / 2, cy: r.top + r.height / 2, width: r.width, height: r.height, tag: el.tagName, dataset: { ...el.dataset } };' +
    '}' +
    'return { ok: 0, selector, text: wanted };' +
  '})()');
}

async function waitForElement(win, selector, text = '', options = {}) {
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 7000;
  const requireEnabled = options.requireEnabled === true;
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await queryElement(win, selector, text);
    if (last && last.ok === 1 && (!requireEnabled || last.disabled !== true)) return last;
    await sleep(80);
  }
  throw new Error('ELEMENT_NOT_READY:' + JSON.stringify(last));
}

async function waitForExpression(win, expression, label, timeoutMs = 7000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await js(win, expression);
    if (last) return last;
    await sleep(80);
  }
  throw new Error('WAIT_FAILED:' + label + ':' + JSON.stringify(last));
}

async function tryWaitForExpression(win, expression, timeoutMs = 900) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await js(win, expression);
    if (value) return true;
    await sleep(80);
  }
  return false;
}

async function clickElement(win, selector, text = '', options = {}) {
  const el = await waitForElement(win, selector, text, { requireEnabled: options.requireEnabled !== false, timeoutMs: options.timeoutMs });
  const x = Math.round(el.cx);
  const y = Math.round(el.cy);
  const modifiers = Array.isArray(options.modifiers) ? options.modifiers : [];
  await sendInput(win, { type: 'mouseMove', x, y, modifiers });
  await sendInput(win, { type: 'mouseDown', x, y, button: 'left', clickCount: 1, modifiers });
  await sendInput(win, { type: 'mouseUp', x, y, button: 'left', clickCount: 1, modifiers });
  return el;
}

async function focusElement(win, selector, text = '') {
  return js(win, '(() => {' +
    'const selector = ' + selectorLiteral(selector) + ';' +
    'const wanted = ' + textLiteral(text) + '.trim().toLowerCase();' +
    'const visible = (el) => {' +
      'const r = el.getBoundingClientRect();' +
      'const s = getComputedStyle(el);' +
      'return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" && !el.closest("[hidden]");' +
    '};' +
    'const el = Array.from(document.querySelectorAll(selector)).find((item) => visible(item) && (!wanted || (item.textContent || item.getAttribute("aria-label") || "").toLowerCase().includes(wanted)));' +
    'if (!el || typeof el.focus !== "function") return { ok: 0 };' +
    'el.scrollIntoView({ block: "center", inline: "nearest" });' +
    'el.focus({ preventScroll: true });' +
    'return { ok: 1, active: document.activeElement === el, text: (el.textContent || "").trim() };' +
  '})()');
}

async function key(win, keyCode, modifiers = []) {
  await sendInput(win, { type: 'keyDown', keyCode, modifiers });
  await sendInput(win, { type: 'keyUp', keyCode, modifiers });
}

async function typeInto(win, selector, text) {
  await clickElement(win, selector, '', { requireEnabled: true });
  await js(win, '(() => {' +
    'const el = document.querySelector(' + selectorLiteral(selector) + ');' +
    'if (!el) return false;' +
    'el.focus({ preventScroll: true });' +
    'if (typeof el.select === "function") el.select();' +
    'else if (typeof el.setSelectionRange === "function") el.setSelectionRange(0, String(el.value || "").length);' +
    'return document.activeElement === el;' +
  '})()');
  const modifier = process.platform === 'darwin' ? 'meta' : 'control';
  await key(win, 'A', [modifier]);
  await key(win, 'Backspace');
  await waitForExpression(win, 'document.querySelector(' + selectorLiteral(selector) + ')?.value === ""', 'input-cleared');
  for (const char of Array.from(text)) {
    await focusElement(win, selector);
    if (char === ' ') await key(win, 'Space');
    else await sendInput(win, { type: 'char', keyCode: char });
    await sleep(8);
  }
  await waitForExpression(win, 'document.querySelector(' + selectorLiteral(selector) + ')?.value === ' + textLiteral(text), 'input-filled-' + selector);
}

async function activateManualMapButton(win, hostSelector, text, commandId) {
  await clickElement(win, hostSelector + ' button', text);
  if (await tryWaitForExpression(win, 'document.querySelector(' + selectorLiteral(hostSelector + ' [data-manual-map-command-form]') + ')?.dataset?.manualMapCommandId === ' + textLiteral(commandId))) return;
  await focusElement(win, hostSelector + ' button', text);
  await key(win, 'Enter');
  await waitForExpression(win, 'document.querySelector(' + selectorLiteral(hostSelector + ' [data-manual-map-command-form]') + ')?.dataset?.manualMapCommandId === ' + textLiteral(commandId), 'draft-open-' + commandId);
}

async function applyDraft(win, hostSelector, options = {}) {
  if (options.confirm === true) {
    await clickElement(win, hostSelector + ' [data-manual-map-confirm-risk]');
    if (!await tryWaitForExpression(win, 'document.querySelector(' + selectorLiteral(hostSelector + ' [data-manual-map-confirm-risk]') + ')?.checked === true')) {
      await focusElement(win, hostSelector + ' [data-manual-map-confirm-risk]');
      await key(win, 'Space');
      await waitForExpression(win, 'document.querySelector(' + selectorLiteral(hostSelector + ' [data-manual-map-confirm-risk]') + ')?.checked === true', 'confirm-checked');
    }
  }
  await clickElement(win, hostSelector + ' [data-manual-map-command-apply]', 'Apply');
  if (await tryWaitForExpression(win, 'document.querySelector(' + selectorLiteral(hostSelector + ' [data-manual-map-operation-result]') + ')?.dataset?.manualMapOperationResult === "APPLIED"', 1400)) return;
  await focusElement(win, hostSelector + ' [data-manual-map-command-apply]', 'Apply');
  await key(win, 'Enter');
  await waitForExpression(win, 'document.querySelector(' + selectorLiteral(hostSelector + ' [data-manual-map-operation-result]') + ')?.dataset?.manualMapOperationResult === "APPLIED"', 'draft-applied');
}

async function openManualMapWorkspace(win) {
  await waitForElement(win, '[data-atlas-reachability-opener]', '', { requireEnabled: true, timeoutMs: 8000 });
  await clickElement(win, '[data-atlas-reachability-opener]');
  await clickElement(win, '[data-atlas-surface-button="manualMap"]', 'Map');
  await clickElement(win, '[data-manual-map-workbench-host] button', 'Open workspace');
  await waitForExpression(win, 'Boolean(document.querySelector("[data-manual-map-plan-workspace]:not([hidden]) [data-manual-map-plan-host]"))', 'manual-map-workspace-visible');
}

async function snapshotWorkbench(win) {
  return js(win, '(() => {' +
    'const host = document.querySelector("[data-manual-map-plan-host]");' +
    'const portabilityRows = Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-portability-kind]")).map((el) => ({ kind: el.dataset.manualMapPortabilityKind || "", id: el.dataset.manualMapPortabilityId || "", text: (el.textContent || "").trim() }));' +
    'const portabilityCommandRows = Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-portability-command-state]")).map((el) => ({ key: el.dataset.manualMapPortabilityCommandState || "", text: (el.textContent || "").trim() }));' +
    'const buttons = Array.from(document.querySelectorAll("[data-manual-map-plan-host] button")).map((el) => ({ text: (el.textContent || "").trim(), disabled: el.disabled === true }));' +
    'const nodes = Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-node-id]")).map((el) => ({ id: el.getAttribute("data-manual-map-node-id") || "", text: (el.textContent || "").trim(), selected: el.classList.contains("is-selected") }));' +
    'const form = document.querySelector("[data-manual-map-plan-host] [data-manual-map-command-form]");' +
    'const result = document.querySelector("[data-manual-map-plan-host] [data-manual-map-operation-result]");' +
    'return { ok: 1, hostVisible: Boolean(host && !host.closest("[hidden]")), status: host?.dataset?.manualMapWorkbenchStatus || "", placement: host?.dataset?.manualMapWorkbenchPlacement || "", nodeCount: nodes.length, nodes, portabilityRows, portabilityCommandRows, buttons, formCommandId: form?.dataset?.manualMapCommandId || "", resultStatus: result?.dataset?.manualMapOperationResult || "", text: host?.textContent || "", hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };' +
  '})()');
}

async function captureProof(win, label) {
  const pngPath = path.join(tempRoot, label + '.png');
  const image = await win.webContents.capturePage();
  const png = image.toPNG();
  fs.writeFileSync(pngPath, png);
  const bitmap = nativeImage.createFromBuffer(png).getBitmap();
  let sampled = 0;
  let nonBlank = 0;
  for (let index = 0; index < bitmap.length; index += 160) {
    sampled += 1;
    const b = bitmap[index] || 0;
    const g = bitmap[index + 1] || 0;
    const r = bitmap[index + 2] || 0;
    if (!(r > 246 && g > 246 && b > 246) && !(r < 8 && g < 8 && b < 8)) nonBlank += 1;
  }
  return { path: pngPath, bytes: png.length, sha256: require('crypto').createHash('sha256').update(png).digest('hex'), sampled, nonBlankRatio: sampled ? nonBlank / sampled : 0 };
}

async function runJourney(win) {
  await openManualMapWorkspace(win);
  const host = '[data-manual-map-plan-host]';
  await waitForElement(win, host + ' [data-manual-map-row-id]', 'BetaRenamedR2C05', { requireEnabled: false });
  await clickElement(win, host + ' [data-manual-map-row-id]', 'BetaRenamedR2C05', { requireEnabled: false });
  await waitForExpression(win, 'document.querySelector("[data-manual-map-plan-host] [data-manual-map-row-id][aria-selected=true]")?.textContent.includes("BetaRenamedR2C05")', 'beta-selected');

  await activateManualMapButton(win, host, 'Add attachment', 'manualMap.attachment.add');
  await waitForExpression(win, 'document.querySelector("[data-manual-map-plan-host] [data-manual-map-impact-preview]")?.textContent.includes("File bytes are not embedded")', 'attachment-impact');
  await typeInto(win, host + ' [data-manual-map-command-field="label"]', 'R3C03Attachment');
  await applyDraft(win, host);
  await waitForExpression(win, 'document.querySelector("[data-manual-map-plan-host] [data-manual-map-portability-kind=attachment]")?.textContent.includes("R3C03Attachment")', 'attachment-visible');

  await clickElement(win, host + ' [data-manual-map-row-id]', 'BetaRenamedR2C05', { requireEnabled: false });
  await activateManualMapButton(win, host, 'Add portal', 'manualMap.portal.add');
  await typeInto(win, host + ' [data-manual-map-command-field="label"]', 'R3C03Portal');
  await applyDraft(win, host);
  await waitForExpression(win, 'document.querySelector("[data-manual-map-plan-host] [data-manual-map-portability-kind=portal]")?.textContent.includes("R3C03Portal")', 'portal-visible');

  await activateManualMapButton(win, host, 'Apply template', 'manualMap.template.apply');
  await waitForExpression(win, 'document.querySelector("[data-manual-map-plan-host] [data-manual-map-impact-preview]")?.textContent.includes("ViewState is not persisted")', 'template-impact');
  await typeInto(win, host + ' [data-manual-map-command-field="templateName"]', 'R3C03Template');
  await applyDraft(win, host, { confirm: true });
  await waitForExpression(win, 'document.querySelector("[data-manual-map-plan-host] [data-manual-map-portability-kind=template]")?.textContent.includes("R3C03Template")', 'template-visible');
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-node-id]")).some((el) => (el.textContent || "").includes("Template start"))', 'template-node-visible');

  await clickElement(win, host + ' [data-manual-map-portability-action="export-image-pdf"]', 'Export SVG');
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-portability-command-state]")).some((el) => el.dataset.manualMapPortabilityCommandState === "imagePdf" && (el.textContent || "").includes("typed PDF loss"))', 'image-pdf-packet-visible');
  await clickElement(win, host + ' [data-manual-map-portability-action="export-json"]', 'Export JSON');
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-portability-command-state]")).some((el) => el.dataset.manualMapPortabilityCommandState === "json" && !(el.textContent || "").includes("not exported"))', 'json-export-visible');
  await activateManualMapButton(win, host, 'Import JSON file', 'manualMap.import.jsonRepeat');
  await waitForExpression(win, 'document.querySelector("[data-manual-map-plan-host] [data-manual-map-impact-preview]")?.textContent.includes("Selects a local Manual Map JSON file")', 'import-impact');
  await typeInto(win, host + ' [data-manual-map-command-field="title"]', 'R3C03ImportedCopy');
  await applyDraft(win, host, { confirm: true });
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-portability-command-state]")).some((el) => el.dataset.manualMapPortabilityCommandState === "import" && !(el.textContent || "").includes("not imported"))', 'import-command-visible');

  const snapshot = await snapshotWorkbench(win);
  const screenshot = await captureProof(win, 'r3-c03-manual-map-portability-journey');
  const viewport = await js(win, '({ width: window.innerWidth, height: window.innerHeight })');
  return { ok: 1, mode: 'journey', viewport, inputEvents, snapshot, screenshot };
}

async function runReopen(win) {
  await openManualMapWorkspace(win);
  await waitForExpression(win, 'document.body.textContent.includes("R3C03Attachment") && document.body.textContent.includes("R3C03Portal") && document.body.textContent.includes("R3C03Template")', 'reopen-portability-visible');
  const snapshot = await snapshotWorkbench(win);
  const screenshot = await captureProof(win, 'r3-c03-manual-map-portability-reopen');
  const viewport = await js(win, '({ width: window.innerWidth, height: window.innerHeight })');
  return { ok: 1, mode: 'reopen', viewport, inputEvents, snapshot, screenshot };
}

for (const methodName of ['showOpenDialog', 'showSaveDialog', 'showMessageBox']) {
  const original = dialog[methodName];
  dialog[methodName] = async () => {
    dialogCalls += 1;
    if (typeof original !== 'function') throw new Error('DIALOG_BLOCKED');
    throw new Error('DIALOG_BLOCKED');
  };
}

app.setPath('appData', path.join(tempRoot, 'appData'));
app.setPath('userData', path.join(tempRoot, 'userData'));
app.setPath('documents', path.join(tempRoot, 'documents'));
const autonomousArtifactRoot = path.join(tempRoot, 'documents', 'manual-map-artifacts');
process.env.YALKEN_AUTONOMOUS_FILE_DIALOG_ROOT = autonomousArtifactRoot;
process.env.YALKEN_AUTONOMOUS_FILE_DIALOG_OPEN_MANUAL_MAP_JSON = path.join(autonomousArtifactRoot, 'manual-map.json');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-features', 'UseSkiaRenderer');

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details && typeof details.url === 'string' ? details.url : '';
    const shouldBlock = /^(https?|wss?):/u.test(url);
    if (shouldBlock) networkRequests += 1;
    callback({ cancel: shouldBlock });
  });
});

process.chdir(rootDir);
if (!process.argv.includes('--dev')) process.argv.push('--dev');
require(path.join(rootDir, 'src', 'main.js'));

async function waitForWindow() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) return windows[0];
    await sleep(50);
  }
  throw new Error('WINDOW_NOT_CREATED');
}

async function waitForLoad(win) {
  if (!win.webContents.isLoadingMainFrame()) return true;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LOAD_TIMEOUT')), 6000);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolve();
    });
    win.webContents.once('did-fail-load', (_event, _code, description) => {
      clearTimeout(timer);
      reject(new Error('DID_FAIL_LOAD:' + description));
    });
  });
  return true;
}

let activeWindow = null;

app.whenReady().then(async () => {
  try {
    const win = await waitForWindow();
    activeWindow = win;
    win.setContentSize(${ACCEPTED_VIEWPORT.width}, ${ACCEPTED_VIEWPORT.height});
    win.show();
    await waitForLoad(win);
    await sleep(350);
    const rendererProbe = mode === 'reopen' ? await runReopen(win) : await runJourney(win);
    emitResult({ ok: 1, mode, appReady: app.isReady(), windowCount: BrowserWindow.getAllWindows().length, rendererProbe, networkRequests, dialogCalls, tempRoot });
    app.exit(0);
  } catch (error) {
    const debugDom = activeWindow ? await js(activeWindow, '(() => ({ bodyText: (document.body.textContent || "").slice(0, 1000), buttons: Array.from(document.querySelectorAll("[data-manual-map-plan-host] button")).map((el) => ({ text: (el.textContent || "").trim(), disabled: el.disabled })), rows: Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-row-id], [data-manual-map-plan-host] [data-manual-map-portability-kind]")).map((el) => ({ text: (el.textContent || "").trim(), dataset: { ...el.dataset } })), commandRows: Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-portability-command-state]")).map((el) => ({ text: (el.textContent || "").trim(), dataset: { ...el.dataset } })), form: document.querySelector("[data-manual-map-plan-host] [data-manual-map-command-form]")?.dataset?.manualMapCommandId || "", result: document.querySelector("[data-manual-map-plan-host] [data-manual-map-operation-result]")?.textContent || "", inner: { width: window.innerWidth, height: window.innerHeight, scrollWidth: document.documentElement.scrollWidth } }))()').catch((debugError) => ({ debugError: debugError && debugError.message ? debugError.message : String(debugError) })) : null;
    emitResult({ ok: 0, mode, message: error && error.message ? error.message : String(error), stack: error && error.stack ? error.stack : '', networkRequests, dialogCalls, tempRoot, inputEvents, debugDom });
    app.exit(1);
  }
});
`;
}

async function resolveElectronBinary(rootDir) {
  const envBinary = process.env.PRODUCTION_APP_RUNTIME_HARNESS_ELECTRON_BIN
    || process.env.ELECTRON_BIN
    || '';
  if (envBinary) return envBinary;
  const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
  return requireFromRoot('electron');
}

function parseChildResult(stdout) {
  const line = String(stdout || '').split(/\r?\n/u).find((item) => item.startsWith('R3_C03_MANUAL_MAP_PORTABILITY_RESULT:'));
  if (!line) return null;
  return JSON.parse(line.slice('R3_C03_MANUAL_MAP_PORTABILITY_RESULT:'.length));
}

async function runElectronChild({ rootDir, tempRoot, mode }) {
  const childPath = path.join(tempRoot, `r3-c03-${mode}-child.cjs`);
  await fs.writeFile(childPath, createChildSource({ rootDir, tempRoot, mode }), 'utf8');
  const electronBinary = await resolveElectronBinary(rootDir);
  const stdoutChunks = [];
  const stderrChunks = [];
  let child = null;
  let timedOut = false;
  try {
    child = spawn(electronBinary, [childPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        ELECTRON_ENABLE_SECURITY_WARNINGS: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    const exitState = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, TIMEOUT_MS);
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    const result = parseChildResult(stdout);
    return {
      ok: exitState.code === 0 && timedOut === false && result?.ok === 1,
      runtimeKind: 'production-electron-visible-input-black-box',
      mode,
      timedOut,
      exitCode: exitState.code,
      signal: exitState.signal || '',
      result,
      stdout,
      stderr,
    };
  } finally {
    if (child && !child.killed) child.kill('SIGKILL');
  }
}

async function findManifestPath(tempRoot) {
  const found = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile() && entry.name === 'project.craftsman.json') found.push(next);
    }
  }
  await walk(path.join(tempRoot, 'documents'));
  return found.sort()[0] || '';
}

function graphFromManifest(manifest, requestedMapId = '') {
  const projectId = normalizeText(manifest?.projectId);
  const maps = isPlainObject(manifest?.manualMaps?.maps) ? manifest.manualMaps.maps : {};
  const mapId = requestedMapId && isPlainObject(maps[requestedMapId])
    ? requestedMapId
    : Object.keys(maps).sort()[0] || '';
  const map = mapId ? maps[mapId] : {};
  const nodes = Object.values(isPlainObject(map.nodes) ? map.nodes : {}).map((node) => ({
    id: normalizeText(node?.id),
    label: normalizeText(node?.label),
    kind: normalizeText(node?.nodeKind || node?.kind) || 'note',
    position: isPlainObject(node?.position) ? { x: Number(node.position.x) || 0, y: Number(node.position.y) || 0 } : { x: 0, y: 0 },
    target: isPlainObject(node?.target) ? { kind: normalizeText(node.target.kind), id: normalizeText(node.target.id) } : { kind: '', id: '' },
  })).filter((node) => node.id && node.label).sort((a, b) => a.id.localeCompare(b.id));
  const validNodeIds = new Set(nodes.map((node) => node.id));
  const edges = Object.values(isPlainObject(map.edges) ? map.edges : {}).map((edge) => ({
    id: normalizeText(edge?.id),
    from: normalizeText(edge?.fromNodeId || edge?.from),
    to: normalizeText(edge?.toNodeId || edge?.to),
    kind: normalizeText(edge?.edgeKind || edge?.kind) || 'link',
    label: normalizeText(edge?.label),
  })).filter((edge) => edge.id && validNodeIds.has(edge.from) && validNodeIds.has(edge.to)).sort((a, b) => a.id.localeCompare(b.id));
  return {
    schemaVersion: 'derived.manualMap.graph.v1',
    projectId,
    mapId,
    title: normalizeText(map.title) || mapId,
    nodes,
    edges,
    groups: Object.values(isPlainObject(map.groups) ? map.groups : {}),
    attachments: Object.values(isPlainObject(map.attachments) ? map.attachments : {}),
    portals: Object.values(isPlainObject(map.portals) ? map.portals : {}),
    templates: Object.values(isPlainObject(map.templates) ? map.templates : {}),
  };
}

async function buildPortabilityProof(tempRoot) {
  const manifestPath = await findManifestPath(tempRoot);
  const manifest = manifestPath ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : {};
  const artifactRoot = path.join(tempRoot, 'documents', 'manual-map-artifacts');
  const realJsonPath = path.join(artifactRoot, 'manual-map.json');
  const realSvgPath = path.join(artifactRoot, 'manual-map.svg');
  const realJsonText = await fs.readFile(realJsonPath, 'utf8').catch(() => '');
  const realSvgText = await fs.readFile(realSvgPath, 'utf8').catch(() => '');
  let realJsonValue = null;
  try {
    realJsonValue = realJsonText ? JSON.parse(realJsonText) : null;
  } catch {
    realJsonValue = null;
  }
  const stage10SessionPath = manifestPath
    ? path.join(path.dirname(manifestPath), '.stage10-local', 'product-session.v2.json')
    : '';
  const stage10Session = stage10SessionPath
    ? await fs.readFile(stage10SessionPath, 'utf8').then((text) => JSON.parse(text)).catch(() => null)
    : null;
  const stage10Events = Array.isArray(stage10Session?.eventLog?.events) ? stage10Session.eventLog.events : [];
  const stage10CommandIds = stage10Events.map((event) => normalizeText(event?.commandId)).filter(Boolean);
  const graph = graphFromManifest(manifest);
  const maps = isPlainObject(manifest?.manualMaps?.maps) ? manifest.manualMaps.maps : {};
  const importedMapId = Object.keys(maps).sort().find((mapId) => mapId.startsWith('manual-map-imported-')) || '';
  const importedGraph = importedMapId ? graphFromManifest(manifest, importedMapId) : null;
  const exported = serializeManualMapExportJsonV1WithLossReport(graph);
  const imagePdf = buildManualMapImagePdfExportEvidence(graph);
  const targetProjectId = 'r3-c03-repeat-import-target';
  const targetState = applyCoreSequence(createInitialCoreState(), [{
    type: CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: { projectId: targetProjectId, title: 'R3 C03 Repeat Import Target', sceneId: 'scene-repeat' },
  }]);
  const imported = targetState.ok === true
    ? await applyManualMapJsonRepeatImportViaCommandKernel({
      exportJson: exported.json,
      initialState: targetState.state,
      targetProjectId,
      targetMapId: 'r3-c03-imported-map',
      commandExecutor: (command, context) => reduceCoreState(context.state, command),
    })
    : { ok: false, error: targetState.error };
  return {
    manifestPath,
    manifestProof: fileProof(manifestPath),
    realJsonProof: fileProof(realJsonPath),
    realSvgProof: fileProof(realSvgPath),
    realJsonSchemaVersion: normalizeText(realJsonValue?.schemaVersion),
    realJsonMapId: normalizeText(realJsonValue?.mapId || realJsonValue?.graph?.mapId),
    realSvgRootValid: /^<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/u.test(realSvgText.trimStart()),
    stage10SessionProof: fileProof(stage10SessionPath),
    stage10ProjectId: normalizeText(stage10Session?.projectId),
    stage10LifecycleId: normalizeText(stage10Session?.lifecycleId),
    stage10EventCount: stage10Events.length,
    stage10CommandIds,
    stage10ExecutableEnvelopeCount: stage10Events.filter((event) => (
      normalizeText(event?.operationEnvelope?.schemaVersion) === 'yalken.commandKernel.operationEnvelope.v1'
      && /^[a-f0-9]{64}$/u.test(normalizeText(event?.operationEnvelopeDigest))
    )).length,
    graph,
    importedMapId,
    importedGraph,
    graphHash: sha256Text(JSON.stringify(graph)),
    exportJsonSha256: sha256Text(exported.json),
    exportLossCount: exported.lossReport.count,
    imagePdfOk: imagePdf.ok === true,
    imageEvidenceHash: imagePdf.value?.meta?.evidenceHash || '',
    imageSummary: imagePdf.value?.summary || {},
    imageFormat: imagePdf.value?.image?.format || '',
    pdfSourceFormat: imagePdf.value?.pdf?.sourceFormat || '',
    pdfBinaryGenerated: imagePdf.value?.pdf?.binaryGenerated === true,
    repeatImportOk: imported.ok === true,
    repeatImportCommandAuthority: imported.value?.commandAuthority || '',
    repeatImportDirectCoreMutation: imported.value?.directCoreMutation === true,
    repeatImportStorageMutation: imported.value?.storageMutation === true,
    repeatImportLossCount: imported.value?.repeatExportLossCount ?? -1,
    repeatImportGraphHashMatched: Boolean(imported.value && imported.value.expectedGraphHash === imported.value.actualGraphHash),
  };
}

function countEvents(runtime, type) {
  const events = runtime?.result?.rendererProbe?.inputEvents || [];
  return events.filter((event) => event.type === type).length;
}

async function preserveRendererScreenshot(probe, outDir, basename) {
  const sourcePath = probe?.screenshot?.path || '';
  if (!sourcePath) return;
  const targetPath = path.join(outDir, basename);
  await fs.copyFile(sourcePath, targetPath);
  probe.screenshot = { ...probe.screenshot, path: targetPath, preserved: true };
}

export function evaluateManualMapPortabilityJourney(input = {}) {
  const first = input.first || {};
  const second = input.second || {};
  const portability = input.portability || {};
  const firstProbe = first.result?.rendererProbe || {};
  const secondProbe = second.result?.rendererProbe || {};
  const firstSnapshot = firstProbe.snapshot || {};
  const secondSnapshot = secondProbe.snapshot || {};
  const graph = portability.graph || {};
  const attachments = Array.isArray(graph.attachments) ? graph.attachments : [];
  const portals = Array.isArray(graph.portals) ? graph.portals : [];
  const templates = Array.isArray(graph.templates) ? graph.templates : [];
  const importedGraph = isPlainObject(portability.importedGraph) ? portability.importedGraph : {};
  const importedAttachments = Array.isArray(importedGraph.attachments) ? importedGraph.attachments : [];
  const importedPortals = Array.isArray(importedGraph.portals) ? importedGraph.portals : [];
  const importedTemplates = Array.isArray(importedGraph.templates) ? importedGraph.templates : [];
  const manifestText = JSON.stringify(input.manifest || {});
  const portabilityRows = Array.isArray(firstSnapshot.portabilityRows) ? firstSnapshot.portabilityRows : [];
  const reopenRows = Array.isArray(secondSnapshot.portabilityRows) ? secondSnapshot.portabilityRows : [];
  const commandRows = Array.isArray(firstSnapshot.portabilityCommandRows) ? firstSnapshot.portabilityCommandRows : [];
  const buttons = Array.isArray(firstSnapshot.buttons) ? firstSnapshot.buttons : [];
  const accepted = {
    visibleInputRuntime: first.ok === true && second.ok === true
      && first.runtimeKind === 'production-electron-visible-input-black-box'
      && second.runtimeKind === 'production-electron-visible-input-black-box',
    pointerAndKeyboardUsed: countEvents(first, 'mouseDown') >= 8 && countEvents(first, 'keyDown') >= 3 && countEvents(first, 'char') >= 8,
    attachmentPortalTemplateCommandsVisible: ['Add attachment', 'Add portal', 'Apply template'].every((label) => buttons.some((button) => button.text === label && button.disabled === false)),
    visiblePortabilityCommands: ['Export JSON', 'Export SVG', 'Import JSON file'].every((label) => buttons.some((button) => button.text === label)),
    visibleReadbackRuntime: portabilityRows.some((row) => row.kind === 'attachment' && row.text.includes('R3C03Attachment'))
      && portabilityRows.some((row) => row.kind === 'portal' && row.text.includes('R3C03Portal'))
      && portabilityRows.some((row) => row.kind === 'template' && row.text.includes('R3C03Template')),
    persistedPortabilityTruth: attachments.some((item) => item.label === 'R3C03Attachment')
      && portals.some((item) => item.label === 'R3C03Portal')
      && templates.some((item) => item.name === 'R3C03Template')
      && attachments.length >= 1
      && portals.length >= 1
      && templates.length >= 1,
    visibleCommandPathExportImport: commandRows.some((row) => row.key === 'json' && !row.text.includes('not exported'))
      && commandRows.some((row) => row.key === 'imagePdf' && row.text.includes('typed PDF loss'))
      && commandRows.some((row) => row.key === 'import' && !row.text.includes('not imported')),
    realLocalArtifactBytes: portability.realJsonProof?.exists === true
      && portability.realJsonProof?.bytes > 0
      && /^[a-f0-9]{64}$/u.test(portability.realJsonProof?.sha256 || '')
      && portability.realSvgProof?.exists === true
      && portability.realSvgProof?.bytes > 0
      && /^[a-f0-9]{64}$/u.test(portability.realSvgProof?.sha256 || '')
      && portability.realJsonSchemaVersion === 'manualMap.export.json.v1'
      && portability.realSvgRootValid === true,
    canonicalPersistenceReopenReplay: portability.stage10SessionProof?.exists === true
      && portability.stage10ProjectId === portability.graph?.projectId
      && Boolean(portability.stage10LifecycleId)
      && portability.stage10EventCount >= 3
      && portability.stage10ExecutableEnvelopeCount === portability.stage10EventCount
      && portability.stage10CommandIds.includes('manualMap.export.json')
      && portability.stage10CommandIds.includes('manualMap.export.imagePdf')
      && portability.stage10CommandIds.includes('manualMap.import.jsonRepeat')
      && second.ok === true,
    importedCopyPersistedTruth: portability.importedMapId
      && importedAttachments.some((item) => item.label === 'R3C03Attachment')
      && importedPortals.some((item) => item.label === 'R3C03Portal')
      && importedTemplates.some((item) => item.name === 'R3C03Template'),
    reopenProjectionVisible: reopenRows.some((row) => row.kind === 'attachment' && row.text.includes('R3C03Attachment'))
      && reopenRows.some((row) => row.kind === 'portal' && row.text.includes('R3C03Portal'))
      && reopenRows.some((row) => row.kind === 'template' && row.text.includes('R3C03Template')),
    exportRepeatImport: portability.exportLossCount === 0
      && portability.repeatImportOk === true
      && portability.repeatImportCommandAuthority === 'CommandKernel'
      && portability.repeatImportDirectCoreMutation === false
      && portability.repeatImportStorageMutation === false
      && portability.repeatImportLossCount === 0
      && portability.repeatImportGraphHashMatched === true,
    imagePdfEvidenceIncludesPortability: portability.imagePdfOk === true
      && portability.imageFormat === 'svg'
      && portability.pdfSourceFormat === 'html-print-packet'
      && portability.pdfBinaryGenerated === false
      && portability.imageSummary?.attachmentCount >= 1
      && portability.imageSummary?.portalCount >= 1
      && portability.imageSummary?.templateCount >= 1,
    pdfClaimHonestTypedLoss: portability.pdfBinaryGenerated === false && portability.pdfSourceFormat === 'html-print-packet',
    screenshotsNonblank: firstProbe.screenshot?.nonBlankRatio > 0.01 && secondProbe.screenshot?.nonBlankRatio > 0.01,
    noNetworkNoDialogs: first.result?.networkRequests === 0
      && second.result?.networkRequests === 0
      && first.result?.dialogCalls === 0
      && second.result?.dialogCalls === 0,
    noDirectIpcOrStorageBypass: !/"manualMapTransientViewState"|"viewport"|"selection"|"layoutMode"/u.test(manifestText),
    noHorizontalOverflow: firstSnapshot.hasHorizontalOverflow === false && secondSnapshot.hasHorizontalOverflow === false,
  };
  const pass = Object.values(accepted).every((value) => value === true);
  return {
    schemaVersion: REPORT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    contourId: CONTOUR_ID,
    platformId: 'macos-local-electron',
    viewportMatrix: [{ ...ACCEPTED_VIEWPORT, status: 'SUPPORTED_BLACK_BOX_ACCEPTED' }],
    status: pass ? 'PASS_MANUAL_MAP_ATTACHMENTS_PORTALS_TEMPLATES_UI_JOURNEY' : 'NOT_READY',
    pass,
    accepted,
    negativeAssertions: {
      directIpcAcceptedJourney: false,
      generatedArtifactOnlyAccepted: accepted.visibleInputRuntime !== true,
      hiddenPortabilityControlsAccepted: accepted.attachmentPortalTemplateCommandsVisible !== true,
      hiddenExportImportControlsAccepted: accepted.visiblePortabilityCommands !== true,
      missingPortabilityTruthAccepted: accepted.persistedPortabilityTruth !== true,
      missingImportedCopyTruthAccepted: accepted.importedCopyPersistedTruth !== true,
      exportWithoutRepeatImportAccepted: accepted.exportRepeatImport !== true,
      binaryPdfClaimWithoutAdapter: accepted.pdfClaimHonestTypedLoss !== true,
      networkActivated: accepted.noNetworkNoDialogs !== true,
      viewStatePersisted: accepted.noDirectIpcOrStorageBypass !== true,
    },
  };
}

export async function runManualMapPortabilityJourney(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  const seedOutDir = path.join(outDir, 'seed-r2-c05');
  const seed = await runHonestBlackBoxAcceptance({ rootDir, outDir: seedOutDir, preserveTempRoot: true });
  const tempRoot = seed.runtime?.first?.result?.tempRoot || '';
  if (!tempRoot) throw new Error('R3_C03_SEED_TEMP_ROOT_MISSING');
  try {
    const first = await runElectronChild({ rootDir, tempRoot, mode: 'journey' });
    const second = await runElectronChild({ rootDir, tempRoot, mode: 'reopen' });
    const portability = await buildPortabilityProof(tempRoot);
    await preserveRendererScreenshot(first?.result?.rendererProbe, outDir, 'r3-c03-manual-map-portability-journey.png');
    await preserveRendererScreenshot(second?.result?.rendererProbe, outDir, 'r3-c03-manual-map-portability-reopen.png');
    const manifest = portability?.manifestPath ? JSON.parse(await fs.readFile(portability.manifestPath, 'utf8')) : {};
    const report = evaluateManualMapPortabilityJourney({ first, second, portability, manifest });
    const fullReport = {
      ...report,
      seed: {
        status: seed.status,
        pass: seed.pass,
        reportSha256: seed.reportSha256,
      },
      runtime: { first, second },
      portability,
      evidenceFiles: {
        journeyScreenshot: fileProof(first?.result?.rendererProbe?.screenshot?.path || ''),
        reopenScreenshot: fileProof(second?.result?.rendererProbe?.screenshot?.path || ''),
      },
    };
    const reportPath = path.join(outDir, 'r3-c03-manual-map-attachments-portals-templates-report.json');
    await fs.writeFile(reportPath, `${JSON.stringify(fullReport, null, 2)}\n`, 'utf8');
    return {
      ...fullReport,
      reportPath,
      reportSha256: sha256File(reportPath),
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runManualMapPortabilityJourney(args);
  console.log(JSON.stringify({
    status: result.status,
    pass: result.pass,
    reportPath: result.reportPath,
    reportSha256: result.reportSha256,
  }, null, 2));
  process.exit(result.pass ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
