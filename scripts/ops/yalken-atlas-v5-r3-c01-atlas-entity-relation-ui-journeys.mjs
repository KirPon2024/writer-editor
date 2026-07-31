#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const REPORT_SCHEMA = 'yalken.atlas.v5.r3.c01.atlasEntityRelationUiJourneys.v1';
const CONTOUR_ID = 'R3_C01_ATLAS_ENTITY_RELATION_UI_JOURNEYS';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_R3_C01_ATLAS_ENTITY_RELATION_UI_JOURNEYS');
const DEFAULT_TIMEOUT_MS = 70000;
const VIEWPORT = Object.freeze({ width: 1440, height: 1200 });
const ENTITY_ALPHA = 'AlphaR3C01';
const ENTITY_BETA = 'BetaR3C01';
const ALIAS_ALPHA = 'AlphaAliasR3C01';
const SCENE_TEXT = `${ENTITY_ALPHA} met ${ENTITY_BETA}. ${ENTITY_ALPHA} trusted ${ENTITY_BETA}.`;

function parseArgs(argv) {
  const out = { outDir: DEFAULT_OUT_DIR, skipRuntime: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && index + 1 < argv.length) {
      out.outDir = path.resolve(String(argv[index + 1] || '').trim());
      index += 1;
    } else if (arg === '--skip-runtime') {
      out.skipRuntime = true;
    } else if (arg === '--preserve-temp-root') {
      out.preserveTempRoot = true;
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
  if (!filePath || !fsSync.existsSync(filePath)) {
    return { path: filePath || '', exists: false, bytes: 0, sha256: '' };
  }
  const stat = fsSync.statSync(filePath);
  return {
    path: filePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(filePath) : '',
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function createChildSource({ rootDir, tempRoot, mode }) {
  return `\
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog, nativeImage, session } = require('electron');

const rootDir = ${JSON.stringify(rootDir)};
const tempRoot = ${JSON.stringify(tempRoot)};
const mode = ${JSON.stringify(mode)};
const sceneText = ${JSON.stringify(SCENE_TEXT)};
const entityAlpha = ${JSON.stringify(ENTITY_ALPHA)};
const entityBeta = ${JSON.stringify(ENTITY_BETA)};
const aliasAlpha = ${JSON.stringify(ALIAS_ALPHA)};
let networkRequests = 0;
let dialogCalls = 0;
const inputEvents = [];
let debuggerAttached = false;

function emitResult(payload) {
  process.stdout.write('R3_C01_ATLAS_UI_RESULT:' + JSON.stringify(payload) + '\\n');
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
      'const label = (el.textContent || el.getAttribute("aria-label") || el.value || "").trim();' +
      'if (!visible(el)) continue;' +
      'if (wanted && !label.toLowerCase().includes(wanted)) continue;' +
      'el.scrollIntoView({ block: "center", inline: "nearest" });' +
      'const r = el.getBoundingClientRect();' +
      'const points = [' +
        '[r.left + r.width / 2, r.top + r.height / 2],' +
        '[r.left + Math.min(12, Math.max(3, r.width / 4)), r.top + r.height / 2],' +
        '[r.right - Math.min(12, Math.max(3, r.width / 4)), r.top + r.height / 2],' +
        '[r.left + r.width / 2, r.top + Math.min(12, Math.max(3, r.height / 4))],' +
        '[r.left + r.width / 2, r.bottom - Math.min(12, Math.max(3, r.height / 4))]' +
      '];' +
      'let hit = { x: r.left + r.width / 2, y: r.top + r.height / 2, obscured: true };' +
      'for (const point of points) {' +
        'const x = Math.max(1, Math.min(window.innerWidth - 2, point[0]));' +
        'const y = Math.max(1, Math.min(window.innerHeight - 2, point[1]));' +
        'const top = document.elementFromPoint(x, y);' +
        'if (top === el || (top && el.contains(top))) { hit = { x, y, obscured: false }; break; }' +
      '}' +
      'return { ok: 1, selector, text: label, disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true", x: r.left, y: r.top, width: r.width, height: r.height, cx: hit.x, cy: hit.y, obscured: hit.obscured, tag: el.tagName, dataset: { ...el.dataset } };' +
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
    'const el = Array.from(document.querySelectorAll(selector)).find((item) => visible(item) && (!wanted || (item.textContent || item.getAttribute("aria-label") || item.value || "").toLowerCase().includes(wanted)));' +
    'if (!el || typeof el.focus !== "function") return { ok: 0 };' +
    'el.scrollIntoView({ block: "center", inline: "nearest" });' +
    'el.focus({ preventScroll: true });' +
    'const r = el.getBoundingClientRect();' +
    'return { ok: 1, text: (el.textContent || el.value || "").trim(), x: r.left, y: r.top, width: r.width, height: r.height, active: document.activeElement === el };' +
  '})()');
}

async function readInputValue(win, selector) {
  return js(win, '(() => {' +
    'const el = document.querySelector(' + selectorLiteral(selector) + ');' +
    'if (!el) return null;' +
    'return typeof el.value === "string" ? el.value : null;' +
  '})()');
}

async function selectInputContents(win, selector) {
  return js(win, '(() => {' +
    'const el = document.querySelector(' + selectorLiteral(selector) + ');' +
    'if (!el || typeof el.focus !== "function") return { ok: 0, reason: "INPUT_NOT_FOUND" };' +
    'el.focus({ preventScroll: true });' +
    'if (typeof el.select === "function") el.select();' +
    'else if (typeof el.setSelectionRange === "function") el.setSelectionRange(0, String(el.value || "").length);' +
    'return { ok: 1, active: document.activeElement === el, value: typeof el.value === "string" ? el.value : "" };' +
  '})()');
}

async function focusInputEnd(win, selector) {
  return js(win, '(() => {' +
    'const el = document.querySelector(' + selectorLiteral(selector) + ');' +
    'if (!el || typeof el.focus !== "function") return { ok: 0, reason: "INPUT_NOT_FOUND" };' +
    'el.focus({ preventScroll: true });' +
    'const value = typeof el.value === "string" ? el.value : "";' +
    'if (typeof el.setSelectionRange === "function") el.setSelectionRange(value.length, value.length);' +
    'return { ok: 1, active: document.activeElement === el, value };' +
  '})()');
}

async function typeInto(win, selector, text) {
  await clickElement(win, selector, '', { requireEnabled: true });
  const focused = await focusElement(win, selector);
  if (!focused || focused.ok !== 1 || focused.active !== true) throw new Error('INPUT_NOT_FOCUSED:' + selector);
  const selected = await selectInputContents(win, selector);
  if (!selected || selected.ok !== 1 || selected.active !== true) throw new Error('INPUT_NOT_SELECTABLE:' + selector);
  const modifier = process.platform === 'darwin' ? 'meta' : 'control';
  await sendInput(win, { type: 'keyDown', keyCode: 'A', modifiers: [modifier] });
  await sendInput(win, { type: 'keyUp', keyCode: 'A', modifiers: [modifier] });
  await sendInput(win, { type: 'keyDown', keyCode: 'Backspace' });
  await sendInput(win, { type: 'keyUp', keyCode: 'Backspace' });
  await waitForExpression(win, 'document.querySelector(' + JSON.stringify(selector) + ')?.value === ""', 'input-cleared-' + selector);
  let expectedPrefix = '';
  for (const char of Array.from(text)) {
    const ready = await focusInputEnd(win, selector);
    if (!ready || ready.ok !== 1 || ready.active !== true) throw new Error('INPUT_CHAR_FOCUS_LOST:' + selector);
    if (char === ' ') {
      await sendInput(win, { type: 'keyDown', keyCode: 'Space' });
      await sendInput(win, { type: 'keyUp', keyCode: 'Space' });
    } else {
      await sendInput(win, { type: 'char', keyCode: char });
    }
    expectedPrefix += char;
    await waitForExpression(win, 'document.querySelector(' + JSON.stringify(selector) + ')?.value === ' + JSON.stringify(expectedPrefix), 'input-prefix');
    await sleep(8);
  }
  const value = await readInputValue(win, selector);
  if (value !== text) throw new Error('INPUT_VALUE_MISMATCH:' + JSON.stringify({ selector, expected: text, actual: value }));
}

async function key(win, keyCode, modifiers = []) {
  await sendInput(win, { type: 'keyDown', keyCode, modifiers });
  await sendInput(win, { type: 'keyUp', keyCode, modifiers });
}

async function typeEditorText(win, text) {
  await clickElement(win, '#editor', '', { requireEnabled: false });
  await focusElement(win, '#editor');
  const modifier = process.platform === 'darwin' ? 'meta' : 'control';
  await key(win, 'A', [modifier]);
  await key(win, 'Backspace');
  for (const char of Array.from(text)) {
    await sendInput(win, { type: 'char', keyCode: char });
    await sleep(8);
  }
  await waitForExpression(win, 'String(document.querySelector("#editor")?.textContent || "").includes(' + JSON.stringify(text) + ')', 'editor-text-entered', 9000);
}

async function clickJourneyAction(win, action, label = '') {
  const selector = '[data-atlas-journey-action="' + action + '"]';
  await clickElement(win, selector, label, { requireEnabled: true, timeoutMs: 9000 });
  await waitForExpression(win, 'document.querySelector("[data-atlas-journey-host]")?.dataset?.atlasJourneyStatus === "applied"', 'journey-applied-' + action, 9000);
  await sleep(350);
}

async function openFirstScene(win) {
  await waitForElement(win, '.tree__row[data-navigator-selectable="true"], .tree__row[data-navigator-row-id]', '', { requireEnabled: true, timeoutMs: 9000 });
  await clickElement(win, '.tree__row[data-navigator-selectable="true"]', '', { requireEnabled: true });
  await waitForExpression(win, 'document.querySelector(".tree__row[data-active-document=true]") && document.querySelector("#editor")', 'scene-opened');
}

async function openAtlasJourney(win) {
  await waitForElement(win, '[data-atlas-reachability-opener]', '', { requireEnabled: true, timeoutMs: 9000 });
  await clickElement(win, '[data-atlas-reachability-opener]');
  await clickElement(win, '[data-atlas-surface-button="journey"]', 'Flow');
  await waitForElement(win, '[data-atlas-journey-host] [data-atlas-journey-field="entityName"]', '', { requireEnabled: true, timeoutMs: 9000 });
}

async function saveCurrentScene(win) {
  const modifier = process.platform === 'darwin' ? 'meta' : 'control';
  await key(win, 'S', [modifier]);
  await waitForExpression(win, 'document.body.textContent.includes("Сохранено") || document.body.textContent.includes("Автосохранено") || document.querySelector("[data-save-state]")?.textContent.includes("saved")', 'scene-saved', 9000);
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

async function snapshotAtlas(win) {
  return js(win, '(() => {' +
    'const host = document.querySelector("[data-atlas-journey-host]");' +
    'const current = document.querySelector("[data-atlas-current-scene-host]");' +
    'return {' +
      'hostVisible: Boolean(host && !host.closest("[hidden]")),' +
      'journeyStatus: host?.dataset?.atlasJourneyStatus || "",' +
      'sourceEntityId: host?.dataset?.atlasJourneySourceEntityId || "",' +
      'targetEntityId: host?.dataset?.atlasJourneyTargetEntityId || "",' +
      'mentionId: host?.dataset?.atlasJourneyMentionId || "",' +
      'fields: Array.from(document.querySelectorAll("[data-atlas-journey-field]")).map((el) => ({ tag: el.tagName, field: el.dataset.atlasJourneyField || "", value: el.value || "", options: el.options ? Array.from(el.options).map((option) => option.textContent || "") : [] })),' +
      'buttons: Array.from(document.querySelectorAll("[data-atlas-journey-action]")).map((button) => ({ action: button.dataset.atlasJourneyAction || "", commandId: button.dataset.productCommandId || "", text: (button.textContent || "").trim(), disabled: button.disabled === true, title: button.title || "" })),' +
      'currentSceneStatus: current?.dataset?.atlasCurrentSceneStatus || "",' +
      'currentSceneText: current?.textContent || "",' +
      'bodyText: document.body.textContent || "",' +
      'hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,' +
    '};' +
  '})()');
}

async function runJourney(win) {
  await openFirstScene(win);
  await typeEditorText(win, sceneText);
  await saveCurrentScene(win);
  await openAtlasJourney(win);
  await typeInto(win, '[data-atlas-journey-field="entityName"]', entityAlpha);
  await clickJourneyAction(win, 'create-entity', 'Create entity');
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-atlas-journey-field=sourceEntityId] option")).some((option) => (option.textContent || "").includes(' + JSON.stringify(entityAlpha) + '))', 'alpha-option-visible');
  await typeInto(win, '[data-atlas-journey-field="entityName"]', entityBeta);
  await clickJourneyAction(win, 'create-entity', 'Create entity');
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-atlas-journey-field=targetEntityId] option, [data-atlas-journey-field=sourceEntityId] option")).some((option) => (option.textContent || "").includes(' + JSON.stringify(entityBeta) + '))', 'beta-option-visible');
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-atlas-journey-field=mentionId] option")).some((option) => (option.textContent || "").includes(' + JSON.stringify(entityAlpha) + '))', 'alpha-mention-visible');
  await typeInto(win, '[data-atlas-journey-field="aliasValue"]', aliasAlpha);
  await clickJourneyAction(win, 'add-alias', 'Add alias');
  await clickJourneyAction(win, 'confirm-mention', 'Confirm mention');
  await waitForExpression(win, 'document.querySelector("[data-atlas-journey-action=reattach-evidence]")?.disabled === false', 'reattach-enabled');
  await clickJourneyAction(win, 'suppress-observation', 'Suppress');
  await clickJourneyAction(win, 'reassign-observation', 'Reassign');
  await clickJourneyAction(win, 'merge-entities', 'Merge');
  await waitForExpression(win, 'document.querySelector("[data-atlas-journey-action=split-restore]")?.disabled === false', 'split-enabled');
  await clickJourneyAction(win, 'split-restore', 'Split restore');
  await clickJourneyAction(win, 'reattach-evidence', 'Reattach evidence');
  await saveCurrentScene(win);
  const snapshot = await snapshotAtlas(win);
  const screenshot = await captureProof(win, 'r3-c01-atlas-entity-relation-journey');
  const viewport = await js(win, '({ width: window.innerWidth, height: window.innerHeight })');
  return { ok: 1, mode: 'journey', viewport, inputEvents, snapshot, screenshot };
}

async function runReopen(win) {
  await openFirstScene(win);
  await openAtlasJourney(win);
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-atlas-journey-field=sourceEntityId] option")).some((option) => (option.textContent || "").includes(' + JSON.stringify(entityAlpha) + ')) && Array.from(document.querySelectorAll("[data-atlas-journey-field=sourceEntityId] option")).some((option) => (option.textContent || "").includes(' + JSON.stringify(entityBeta) + '))', 'reopen-entities-visible', 9000);
  const snapshot = await snapshotAtlas(win);
  const screenshot = await captureProof(win, 'r3-c01-atlas-entity-relation-reopen');
  const viewport = await js(win, '({ width: window.innerWidth, height: window.innerHeight })');
  return { ok: 1, mode: 'reopen', viewport, inputEvents, snapshot, screenshot };
}

for (const dirName of ['appData', 'userData', 'documents']) {
  fs.mkdirSync(path.join(tempRoot, dirName), { recursive: true });
}

for (const methodName of ['showOpenDialog', 'showSaveDialog', 'showMessageBox']) {
  dialog[methodName] = async () => {
    dialogCalls += 1;
    throw new Error('DIALOG_BLOCKED');
  };
}

app.setPath('appData', path.join(tempRoot, 'appData'));
app.setPath('userData', path.join(tempRoot, 'userData'));
app.setPath('documents', path.join(tempRoot, 'documents'));
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

let activeWindow = null;

app.whenReady().then(async () => {
  try {
    const win = await waitForWindow();
    activeWindow = win;
    win.setContentSize(${VIEWPORT.width}, ${VIEWPORT.height});
    win.show();
    await sleep(700);
    const rendererProbe = mode === 'reopen' ? await runReopen(win) : await runJourney(win);
    emitResult({ ok: 1, mode, appReady: app.isReady(), windowCount: BrowserWindow.getAllWindows().length, rendererProbe, networkRequests, dialogCalls, tempRoot });
    app.exit(0);
  } catch (error) {
    const debugDom = activeWindow ? await js(activeWindow, '(() => ({ bodyText: (document.body.textContent || "").slice(0, 900), activeElement: document.activeElement ? { tag: document.activeElement.tagName, text: (document.activeElement.textContent || document.activeElement.value || "").slice(0, 160), dataset: { ...(document.activeElement.dataset || {}) } } : null, journey: document.querySelector("[data-atlas-journey-host]")?.textContent || "", journeyDataset: { ...(document.querySelector("[data-atlas-journey-host]")?.dataset || {}) }, currentScene: document.querySelector("[data-atlas-current-scene-host]")?.textContent || "", currentSceneDataset: { ...(document.querySelector("[data-atlas-current-scene-host]")?.dataset || {}) }, buttons: Array.from(document.querySelectorAll("[data-atlas-journey-action]")).map((button) => ({ text: (button.textContent || "").trim(), action: button.dataset.atlasJourneyAction || "", disabled: button.disabled === true, title: button.title || "" })), fields: Array.from(document.querySelectorAll("[data-atlas-journey-field]")).map((el) => ({ tag: el.tagName, field: el.dataset.atlasJourneyField || "", value: el.value || "", options: el.options ? Array.from(el.options).map((option) => option.textContent || "") : [] })) }))()').catch((debugError) => ({ debugError: debugError && debugError.message ? debugError.message : String(debugError) })) : null;
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
  const line = String(stdout || '')
    .split(/\r?\n/u)
    .find((item) => item.startsWith('R3_C01_ATLAS_UI_RESULT:'));
  if (!line) return null;
  return JSON.parse(line.slice('R3_C01_ATLAS_UI_RESULT:'.length));
}

async function runElectronChild({ rootDir, tempRoot, mode, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  await fs.mkdir(tempRoot, { recursive: true });
  const childPath = path.join(tempRoot, `r3-c01-${mode}-child.cjs`);
  await fs.writeFile(childPath, createChildSource({ rootDir, tempRoot, mode }), 'utf8');
  const electronBinary = await resolveElectronBinary(rootDir);
  const stdoutChunks = [];
  const stderrChunks = [];
  let child = null;
  let timedOut = false;

  try {
    child = spawn(electronBinary, [childPath], {
      cwd: rootDir,
      env: { ...process.env, ELECTRON_ENABLE_SECURITY_WARNINGS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    const exitState = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
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

async function findProjectManifest(tempRoot) {
  const found = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(next);
      } else if (entry.isFile() && entry.name === 'project.craftsman.json') {
        found.push(next);
      }
    }
  }
  await walk(path.join(tempRoot, 'documents'));
  return found.sort()[0] || '';
}

async function readAllSceneText(tempRoot) {
  const texts = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(next);
      } else if (entry.isFile() && entry.name.endsWith('.txt')) {
        texts.push({ path: next, text: await fs.readFile(next, 'utf8') });
      }
    }
  }
  await walk(path.join(tempRoot, 'documents'));
  return texts.sort((a, b) => a.path.localeCompare(b.path));
}

function atlasSummaryFromManifest(manifest) {
  const atlas = isPlainObject(manifest?.atlas) ? manifest.atlas : {};
  const entities = isPlainObject(atlas.entities) ? atlas.entities : {};
  const entityList = Object.values(entities).filter(isPlainObject);
  const decisions = isPlainObject(atlas.decisions) ? atlas.decisions : {};
  const suppressions = isPlainObject(atlas.suppressions) ? atlas.suppressions : {};
  const reassignments = isPlainObject(atlas.reassignments) ? atlas.reassignments : {};
  const operations = isPlainObject(atlas.entityOperations) ? atlas.entityOperations : {};
  const reattachments = isPlainObject(atlas.evidenceReattachments) ? atlas.evidenceReattachments : {};
  return {
    entityNames: entityList.map((entity) => normalizeText(entity.name)).filter(Boolean).sort(),
    aliasValues: entityList.flatMap((entity) => Object.values(isPlainObject(entity.aliases) ? entity.aliases : {})
      .filter(isPlainObject)
      .map((alias) => normalizeText(alias.value)))
      .filter(Boolean)
      .sort(),
    decisionCount: Object.keys(decisions).length,
    suppressionCount: Object.keys(suppressions).length,
    reassignmentCount: Object.keys(reassignments).length,
    mergeOperationCount: Object.keys(operations).length,
    restoredMergeOperationCount: Object.values(operations).filter((operation) => Number(operation?.restoredByCommandSeq) > 0).length,
    reattachmentCount: Object.keys(reattachments).length,
    commandSeqs: {
      entities: entityList.map((entity) => Number(entity.updatedByCommandSeq) || 0),
      decisions: Object.values(decisions).map((item) => Number(item?.createdByCommandSeq) || 0),
      suppressions: Object.values(suppressions).map((item) => Number(item?.createdByCommandSeq) || 0),
      reassignments: Object.values(reassignments).map((item) => Number(item?.createdByCommandSeq) || 0),
      operations: Object.values(operations).map((item) => Number(item?.createdByCommandSeq) || 0),
      reattachments: Object.values(reattachments).map((item) => Number(item?.createdByCommandSeq) || 0),
    },
  };
}

async function buildPersistenceProof(tempRoot) {
  const manifestPath = await findProjectManifest(tempRoot);
  const manifest = manifestPath ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : {};
  const sceneTexts = await readAllSceneText(tempRoot);
  return {
    manifestPath,
    manifestProof: fileProof(manifestPath),
    manifestHash: manifestPath ? sha256File(manifestPath) : '',
    sceneTextProofs: sceneTexts.map((item) => ({
      path: item.path,
      sha256: sha256Text(item.text),
      containsSceneText: item.text.includes(SCENE_TEXT),
    })),
    atlas: atlasSummaryFromManifest(manifest),
  };
}

function countEvents(runtime, type) {
  const events = runtime?.result?.rendererProbe?.inputEvents || [];
  return events.filter((event) => event.type === type).length;
}

async function preserveRendererScreenshot(probe, outDir, basename) {
  const sourcePath = probe?.screenshot?.path || '';
  if (!sourcePath) return;
  try {
    const targetPath = path.join(outDir, basename);
    await fs.copyFile(sourcePath, targetPath);
    probe.screenshot = { ...probe.screenshot, path: targetPath, preserved: true };
  } catch {
    probe.screenshot = { ...probe.screenshot, preserved: false };
  }
}

export function evaluateAtlasEntityRelationUiJourneys(input = {}) {
  const first = input.first || {};
  const second = input.second || {};
  const persistence = input.persistence || {};
  const firstSnapshot = first.result?.rendererProbe?.snapshot || {};
  const secondSnapshot = second.result?.rendererProbe?.snapshot || {};
  const atlas = persistence.atlas || {};
  const accepted = {
    visibleInputRuntime: first.ok === true && second.ok === true
      && first.runtimeKind === 'production-electron-visible-input-black-box'
      && second.runtimeKind === 'production-electron-visible-input-black-box',
    pointerAndKeyboardUsed: countEvents(first, 'mouseDown') >= 10
      && countEvents(first, 'char') >= SCENE_TEXT.length + ENTITY_ALPHA.length + ENTITY_BETA.length + ALIAS_ALPHA.length,
    explicitJourneyFields: Array.isArray(firstSnapshot.fields)
      && ['entityName', 'aliasValue', 'sourceEntityId', 'targetEntityId', 'mentionId'].every((field) => firstSnapshot.fields.some((item) => item.field === field)),
    commandKernelButtonsOnly: Array.isArray(firstSnapshot.buttons)
      && ['atlas.entity.create', 'atlas.alias.add', 'atlas.mention.confirm', 'atlas.observation.suppress', 'atlas.observation.reassign', 'atlas.entity.merge', 'atlas.entity.splitRestore', 'atlas.evidence.reattach']
        .every((commandId) => firstSnapshot.buttons.some((button) => button.commandId === commandId)),
    noFirstTargetFallbackSurface: input.rendererSourceHasFirstFallback === false,
    sceneTextSaved: Array.isArray(persistence.sceneTextProofs)
      && persistence.sceneTextProofs.some((proof) => proof.containsSceneText === true),
    persistedEntityAliasMentionEvidence: Array.isArray(atlas.entityNames)
      && atlas.entityNames.includes(ENTITY_ALPHA)
      && atlas.entityNames.includes(ENTITY_BETA)
      && Array.isArray(atlas.aliasValues)
      && atlas.aliasValues.includes(ALIAS_ALPHA)
      && atlas.decisionCount >= 1
      && atlas.suppressionCount >= 1,
    persistedRelationOperations: atlas.reassignmentCount >= 1
      && atlas.mergeOperationCount >= 1
      && atlas.restoredMergeOperationCount >= 1
      && atlas.reattachmentCount >= 1,
    reopenProjectionVisible: secondSnapshot.bodyText?.includes(ENTITY_ALPHA) === true
      && secondSnapshot.bodyText?.includes(ENTITY_BETA) === true
      && secondSnapshot.hostVisible === true,
    screenshotsNonblank: first.result?.rendererProbe?.screenshot?.nonBlankRatio > 0.01
      && second.result?.rendererProbe?.screenshot?.nonBlankRatio > 0.01,
    noNetworkNoDialogs: first.result?.networkRequests === 0
      && second.result?.networkRequests === 0
      && first.result?.dialogCalls === 0
      && second.result?.dialogCalls === 0,
    noHorizontalOverflow: firstSnapshot.hasHorizontalOverflow === false
      && secondSnapshot.hasHorizontalOverflow === false,
  };
  const pass = Object.values(accepted).every((value) => value === true);
  return {
    schemaVersion: REPORT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    contourId: CONTOUR_ID,
    platformId: 'macos-local-electron',
    viewportMatrix: [{ ...VIEWPORT, status: 'SUPPORTED_BLACK_BOX_ACCEPTED' }],
    status: pass ? 'PASS_ATLAS_ENTITY_RELATION_UI_JOURNEY' : 'NOT_READY',
    pass,
    accepted,
    negativeAssertions: {
      directIpcAcceptedJourney: false,
      hiddenFirstEntityFallbackAccepted: accepted.noFirstTargetFallbackSurface !== true,
      generatedArtifactOnlyAccepted: false,
      networkActivated: accepted.noNetworkNoDialogs !== true,
      overflowAccepted: accepted.noHorizontalOverflow !== true,
    },
  };
}

export async function runAtlasEntityRelationUiJourneys(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-r3-c01-atlas-ui-'));
  try {
    const first = options.skipRuntime ? null : await runElectronChild({ rootDir, tempRoot, mode: 'journey' });
    const second = options.skipRuntime ? null : await runElectronChild({ rootDir, tempRoot, mode: 'reopen' });
    const persistence = options.skipRuntime ? null : await buildPersistenceProof(tempRoot);
    await preserveRendererScreenshot(first?.result?.rendererProbe, outDir, 'r3-c01-atlas-entity-relation-journey.png');
    await preserveRendererScreenshot(second?.result?.rendererProbe, outDir, 'r3-c01-atlas-entity-relation-reopen.png');
    const rendererSource = await fs.readFile(path.join(rootDir, 'src', 'renderer', 'editor.js'), 'utf8');
    const report = evaluateAtlasEntityRelationUiJourneys({
      first,
      second,
      persistence,
      rendererSourceHasFirstFallback: /firstAtlasEntity|firstAtlasMention/u.test(rendererSource),
    });
    const fullReport = {
      ...report,
      runtime: { first, second },
      persistence,
      evidenceFiles: {
        journeyScreenshot: fileProof(first?.result?.rendererProbe?.screenshot?.path || ''),
        reopenScreenshot: fileProof(second?.result?.rendererProbe?.screenshot?.path || ''),
      },
    };
    const reportPath = path.join(outDir, 'r3-c01-atlas-entity-relation-ui-journeys-report.json');
    await fs.writeFile(reportPath, `${JSON.stringify(fullReport, null, 2)}\n`, 'utf8');
    return { ...fullReport, reportPath, reportSha256: sha256File(reportPath) };
  } finally {
    if (options.preserveTempRoot !== true) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runAtlasEntityRelationUiJourneys(args);
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    pass: result.pass,
    reportPath: result.reportPath,
    reportSha256: result.reportSha256,
  }, null, 2)}\n`);
  if (result.pass !== true) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
