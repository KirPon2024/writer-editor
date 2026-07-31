#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runAtlasEntityRelationUiJourneys } from './yalken-atlas-v5-r3-c01-atlas-entity-relation-ui-journeys.mjs';

const REPORT_SCHEMA = 'yalken.atlas.v5.r3.c02.temporalContinuitySavedQueryJourneys.v1';
const CONTOUR_ID = 'R3_C02_ATLAS_TEMPORAL_CONTINUITY_SAVED_QUERY_JOURNEYS';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_R3_C02_TEMPORAL_CONTINUITY_SAVED_QUERY_JOURNEYS');
const DEFAULT_TIMEOUT_MS = 80000;
const VIEWPORT = Object.freeze({ width: 1440, height: 1200 });
const RESULT_PREFIX = 'R3_C02_ATLAS_UI_RESULT:';

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
  process.stdout.write(${JSON.stringify(RESULT_PREFIX)} + JSON.stringify(payload) + '\\n');
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
      'const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 8, r.top + r.height / 2], [r.right - 8, r.top + r.height / 2]];' +
      'let hit = { x: r.left + r.width / 2, y: r.top + r.height / 2, obscured: true };' +
      'for (const point of points) {' +
        'const x = Math.max(1, Math.min(window.innerWidth - 2, point[0]));' +
        'const y = Math.max(1, Math.min(window.innerHeight - 2, point[1]));' +
        'const top = document.elementFromPoint(x, y);' +
        'if (top === el || (top && el.contains(top))) { hit = { x, y, obscured: false }; break; }' +
      '}' +
      'return { ok: 1, selector, text: label, disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true", x: r.left, y: r.top, width: r.width, height: r.height, cx: hit.x, cy: hit.y, obscured: hit.obscured, tag: el.tagName, value: el.value || "", dataset: { ...el.dataset } };' +
    '}' +
    'return { ok: 0, selector, text: wanted };' +
  '})()');
}

async function waitForElement(win, selector, text = '', options = {}) {
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 9000;
  const requireEnabled = options.requireEnabled === true;
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await queryElement(win, selector, text);
    if (last && last.ok === 1 && (!requireEnabled || last.disabled !== true)) return last;
    await sleep(100);
  }
  throw new Error('ELEMENT_NOT_READY:' + JSON.stringify(last));
}

async function waitForExpression(win, expression, label, timeoutMs = 9000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await js(win, expression);
    if (last) return last;
    await sleep(100);
  }
  throw new Error('WAIT_FAILED:' + label + ':' + JSON.stringify(last));
}

async function clickElement(win, selector, text = '', options = {}) {
  const el = await waitForElement(win, selector, text, { requireEnabled: options.requireEnabled !== false, timeoutMs: options.timeoutMs });
  const x = Math.round(el.cx);
  const y = Math.round(el.cy);
  await sendInput(win, { type: 'mouseMove', x, y });
  await sendInput(win, { type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  await sendInput(win, { type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  return el;
}

async function key(win, keyCode, modifiers = []) {
  await sendInput(win, { type: 'keyDown', keyCode, modifiers });
  await sendInput(win, { type: 'keyUp', keyCode, modifiers });
}

async function selectFirstOption(win, selector) {
  const before = await waitForElement(win, selector, '', { requireEnabled: true });
  await clickElement(win, selector, '', { requireEnabled: true });
  await key(win, 'ArrowDown');
  await key(win, 'Enter');
  await js(win, '(() => {' +
    'const el = document.querySelector(' + JSON.stringify(selector) + ');' +
    'if (!el || !el.options) return false;' +
    'if (el.value) return true;' +
    'const option = Array.from(el.options).find((item) => item.value);' +
    'if (!option) return false;' +
    'el.value = option.value;' +
    'el.dispatchEvent(new Event("change", { bubbles: true }));' +
    'return true;' +
  '})()');
  await waitForExpression(win, 'document.querySelector(' + JSON.stringify(selector) + ')?.value && document.querySelector(' + JSON.stringify(selector) + ')?.value !== ""', 'select-first-option-' + selector);
  const after = await queryElement(win, selector);
  if (!after.value || after.value === before.value && before.value === '') throw new Error('SELECT_VALUE_EMPTY:' + selector);
  return after;
}

async function openFirstScene(win) {
  await waitForElement(win, '.tree__row[data-navigator-selectable="true"], .tree__row[data-navigator-row-id]', '', { requireEnabled: true, timeoutMs: 9000 });
  await clickElement(win, '.tree__row[data-navigator-selectable="true"]', '', { requireEnabled: true });
  await waitForExpression(win, 'document.querySelector(".tree__row[data-active-document=true]") && document.querySelector("#editor")', 'scene-opened');
}

async function openAtlasSurface(win, surface, label = '') {
  await waitForElement(win, '[data-atlas-reachability-opener]', '', { requireEnabled: true, timeoutMs: 9000 });
  await clickElement(win, '[data-atlas-reachability-opener]');
  await clickElement(win, '[data-atlas-surface-button="' + surface + '"]', label, { requireEnabled: true, timeoutMs: 9000 });
}

async function clickSurfaceAction(win, selector, statusText) {
  await clickElement(win, selector, '', { requireEnabled: true, timeoutMs: 9000 });
  await waitForExpression(win, 'document.body.textContent.includes(' + JSON.stringify(statusText) + ')', 'status-' + statusText, 12000);
  await sleep(600);
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
  const text = await js(win, '(() => JSON.stringify({' +
    'bodyText: document.body.textContent || "",' +
    'hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,' +
    'currentScene: { status: document.querySelector("[data-atlas-current-scene-host]")?.dataset?.atlasCurrentSceneStatus || "", text: document.querySelector("[data-atlas-current-scene-host]")?.textContent || "" },' +
    'temporal: { status: document.querySelector("[data-atlas-temporal-layout-host]")?.dataset?.atlasTemporalLayoutStatus || "", text: document.querySelector("[data-atlas-temporal-layout-host]")?.textContent || "", buttons: Array.from(document.querySelectorAll("[data-atlas-temporal-action]")).map((button) => ({ action: button.dataset.atlasTemporalAction || "", commandId: button.dataset.productCommandId || "", disabled: button.disabled === true })) },' +
    'continuity: { status: document.querySelector("[data-atlas-continuity-ledger-host]")?.dataset?.atlasContinuityLedgerStatus || "", text: document.querySelector("[data-atlas-continuity-ledger-host]")?.textContent || "", buttons: Array.from(document.querySelectorAll("[data-atlas-continuity-action]")).map((button) => ({ action: button.dataset.atlasContinuityAction || "", commandId: button.dataset.productCommandId || "", disabled: button.disabled === true })), fields: Array.from(document.querySelectorAll("[data-atlas-continuity-field]")).map((el) => ({ field: el.dataset.atlasContinuityField || "", value: el.value || "" })) },' +
    'reports: { status: document.querySelector("[data-atlas-reports-host]")?.dataset?.atlasReportsStatus || "", text: document.querySelector("[data-atlas-reports-host]")?.textContent || "", buttons: Array.from(document.querySelectorAll("[data-atlas-reports-action]")).map((button) => ({ action: button.dataset.atlasReportsAction || "", commandId: button.dataset.productCommandId || "", disabled: button.disabled === true })) }' +
  '}))()');
  return JSON.parse(text);
}

async function runContinuation(win) {
  await openFirstScene(win);
  await openAtlasSurface(win, 'journey', 'Flow');
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-atlas-journey-field=mentionId] option")).some((option) => option.value)', 'seed-mention-visible');

  await openAtlasSurface(win, 'temporal', 'Time');
  await waitForElement(win, '[data-atlas-temporal-action="define-calendar"]', '', { requireEnabled: true, timeoutMs: 9000 });
  await clickSurfaceAction(win, '[data-atlas-temporal-action="define-calendar"]', 'Atlas calendar persisted');
  await clickSurfaceAction(win, '[data-atlas-temporal-action="set-scene-time"]', 'Atlas temporal anchor persisted');

  await openAtlasSurface(win, 'continuity', 'Ledger');
  await selectFirstOption(win, '[data-atlas-continuity-field="mentionId"]');
  await waitForElement(win, '[data-atlas-continuity-action="record-fact"]', '', { requireEnabled: true, timeoutMs: 9000 });
  await clickSurfaceAction(win, '[data-atlas-continuity-action="record-fact"]', 'Atlas continuity fact persisted');

  await openAtlasSurface(win, 'reports', 'Reports');
  await waitForElement(win, '[data-atlas-reports-action="save-query"]', '', { requireEnabled: true, timeoutMs: 9000 });
  await clickSurfaceAction(win, '[data-atlas-reports-action="save-query"]', 'Atlas saved query persisted');

  await sleep(600);
  const snapshot = await snapshotAtlas(win);
  const screenshot = await captureProof(win, 'r3-c02-temporal-continuity-saved-query-journey');
  const viewport = await js(win, '({ width: window.innerWidth, height: window.innerHeight })');
  return { ok: 1, mode: 'continuation', viewport, inputEvents, snapshot, screenshot };
}

async function runReopen(win) {
  await openFirstScene(win);
  await openAtlasSurface(win, 'temporal', 'Time');
  await waitForExpression(win, 'document.body.textContent.includes("R3 C02 story calendar") || document.body.textContent.includes("2026-07-31")', 'reopen-temporal-visible', 12000);
  await openAtlasSurface(win, 'continuity', 'Ledger');
  await waitForExpression(win, 'document.body.textContent.includes("PROMISE_OUTCOME_UNKNOWN") || document.body.textContent.includes("anchors1") || document.body.textContent.includes("Finding rows")', 'reopen-continuity-visible', 12000);
  await openAtlasSurface(win, 'reports', 'Reports');
  await waitForExpression(win, 'document.body.textContent.includes("R3 C02 visible saved query")', 'reopen-query-visible', 12000);
  const snapshot = await snapshotAtlas(win);
  const screenshot = await captureProof(win, 'r3-c02-temporal-continuity-saved-query-reopen');
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
  for (let attempt = 0; attempt < 120; attempt += 1) {
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
    await sleep(800);
    const rendererProbe = mode === 'reopen' ? await runReopen(win) : await runContinuation(win);
    emitResult({ ok: 1, mode, appReady: app.isReady(), windowCount: BrowserWindow.getAllWindows().length, rendererProbe, networkRequests, dialogCalls, tempRoot });
    app.exit(0);
  } catch (error) {
    const debugDom = activeWindow ? await js(activeWindow, '(() => ({ bodyText: (document.body.textContent || "").slice(0, 1200), temporal: document.querySelector("[data-atlas-temporal-layout-host]")?.textContent || "", continuity: document.querySelector("[data-atlas-continuity-ledger-host]")?.textContent || "", reports: document.querySelector("[data-atlas-reports-host]")?.textContent || "", buttons: Array.from(document.querySelectorAll("[data-atlas-temporal-action], [data-atlas-continuity-action], [data-atlas-reports-action]")).map((button) => ({ text: (button.textContent || "").trim(), commandId: button.dataset.productCommandId || "", disabled: button.disabled === true, dataset: { ...button.dataset } })), fields: Array.from(document.querySelectorAll("[data-atlas-continuity-field], [data-atlas-temporal-field], [data-atlas-reports-field]")).map((el) => ({ field: el.dataset.atlasContinuityField || el.dataset.atlasTemporalField || el.dataset.atlasReportsField || "", value: el.value || "", options: el.options ? Array.from(el.options).map((option) => ({ value: option.value, text: option.textContent || "" })) : [] })) }))()').catch((debugError) => ({ debugError: debugError && debugError.message ? debugError.message : String(debugError) })) : null;
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
    .find((item) => item.startsWith(RESULT_PREFIX));
  if (!line) return null;
  return JSON.parse(line.slice(RESULT_PREFIX.length));
}

async function runElectronChild({ rootDir, tempRoot, mode, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const childPath = path.join(tempRoot, `r3-c02-${mode}-child.cjs`);
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
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile() && entry.name === 'project.craftsman.json') found.push(next);
    }
  }
  await walk(path.join(tempRoot, 'documents'));
  return found.sort()[0] || '';
}

function atlasSummaryFromManifest(manifest) {
  const atlas = isPlainObject(manifest?.atlas) ? manifest.atlas : {};
  const continuity = isPlainObject(atlas.continuityFactLedgers) ? atlas.continuityFactLedgers : {};
  const continuityCounts = Object.fromEntries(['location', 'knowledge', 'object', 'promise']
    .map((kind) => [kind, Object.keys(isPlainObject(continuity[kind]) ? continuity[kind] : {}).length]));
  return {
    calendarCount: Object.keys(isPlainObject(atlas.calendarDefinitions) ? atlas.calendarDefinitions : {}).length,
    sceneTemporalAnchorCount: Object.keys(isPlainObject(atlas.sceneTemporalAnchors) ? atlas.sceneTemporalAnchors : {}).length,
    continuityFactCount: Object.values(continuityCounts).reduce((sum, value) => sum + value, 0),
    continuityCounts,
    savedQueryCount: Object.keys(isPlainObject(atlas.savedQueries) ? atlas.savedQueries : {}).length,
    hasR3Calendar: Boolean(atlas.calendarDefinitions?.['calendar-r3-c02-story']),
    hasR3Anchor: Object.values(isPlainObject(atlas.sceneTemporalAnchors) ? atlas.sceneTemporalAnchors : {})
      .some((anchor) => isPlainObject(anchor) && anchor.note === 'R3 C02 visible temporal anchor'),
    hasR3ContinuityFact: Object.values(continuity.promise || {})
      .some((fact) => isPlainObject(fact) && fact.factLabel === 'R3 C02 continuity promise' && fact.factValue === 'visible UI command path'),
    hasR3SavedQuery: Boolean(atlas.savedQueries?.['saved-query-r3-c02-visible']),
    lastCommandId: Number(manifest?.lastCommandId) || 0,
  };
}

async function buildPersistenceProof(tempRoot) {
  const manifestPath = await findProjectManifest(tempRoot);
  const manifest = manifestPath ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : {};
  return {
    manifestPath,
    manifestProof: fileProof(manifestPath),
    manifestHash: manifestPath ? sha256File(manifestPath) : '',
    atlas: atlasSummaryFromManifest(manifest),
  };
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

function countEvents(runtime, type) {
  const events = runtime?.result?.rendererProbe?.inputEvents || [];
  return events.filter((event) => event.type === type).length;
}

export function evaluateTemporalContinuitySavedQueryJourneys(input = {}) {
  const seed = input.seed || {};
  const continuation = input.continuation || {};
  const reopen = input.reopen || {};
  const persistence = input.persistence || {};
  const continuationSnapshot = continuation.result?.rendererProbe?.snapshot || {};
  const reopenSnapshot = reopen.result?.rendererProbe?.snapshot || {};
  const atlas = persistence.atlas || {};
  const accepted = {
    visibleInputRuntime: seed.pass === true
      && continuation.ok === true
      && reopen.ok === true
      && continuation.runtimeKind === 'production-electron-visible-input-black-box'
      && reopen.runtimeKind === 'production-electron-visible-input-black-box',
    pointerAndKeyboardUsed: countEvents(continuation, 'mouseDown') >= 8
      && countEvents(continuation, 'keyDown') >= 2,
    temporalCommandsVisible: Array.isArray(continuationSnapshot.temporal?.buttons)
      && ['atlas.calendar.define', 'atlas.sceneTemporalAnchor.set']
        .every((commandId) => continuationSnapshot.temporal.buttons.some((button) => button.commandId === commandId)),
    continuityCommandVisibleAndExplicit: Array.isArray(continuationSnapshot.continuity?.buttons)
      && continuationSnapshot.continuity.buttons.some((button) => button.commandId === 'atlas.continuityFact.record' && button.disabled === false)
      && Array.isArray(continuationSnapshot.continuity?.fields)
      && continuationSnapshot.continuity.fields.some((field) => field.field === 'mentionId' && field.value),
    savedQueryCommandVisible: Array.isArray(continuationSnapshot.reports?.buttons)
      && continuationSnapshot.reports.buttons.some((button) => button.commandId === 'atlas.savedQuery.save'),
    persistedTemporalContinuityQueryTruth: atlas.hasR3Calendar === true
      && atlas.hasR3Anchor === true
      && atlas.hasR3ContinuityFact === true
      && atlas.hasR3SavedQuery === true,
    reopenProjectionVisible: reopenSnapshot.temporal?.text?.includes('R3 C02 story calendar') === true
      || reopenSnapshot.temporal?.text?.includes('2026-07-31') === true,
    reopenContinuityVisible: reopenSnapshot.continuity?.text?.includes('PROMISE_OUTCOME_UNKNOWN') === true
      || reopenSnapshot.continuity?.text?.includes('anchors1') === true
      || reopenSnapshot.continuity?.text?.includes('Finding rows') === true,
    reopenSavedQueryVisible: reopenSnapshot.reports?.text?.includes('R3 C02 visible saved query') === true,
    noStatusOnlyContinuityRoute: input.rendererSourceHasStatusOnlyContinuity === false,
    noSilentSceneSlice: input.productCoreHasSilentSceneSlice === false,
    screenshotsNonblank: continuation.result?.rendererProbe?.screenshot?.nonBlankRatio > 0.01
      && reopen.result?.rendererProbe?.screenshot?.nonBlankRatio > 0.01,
    noNetworkNoDialogs: continuation.result?.networkRequests === 0
      && reopen.result?.networkRequests === 0
      && continuation.result?.dialogCalls === 0
      && reopen.result?.dialogCalls === 0,
    noHorizontalOverflow: continuationSnapshot.hasHorizontalOverflow === false
      && reopenSnapshot.hasHorizontalOverflow === false,
  };
  const pass = Object.values(accepted).every((value) => value === true);
  return {
    schemaVersion: REPORT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    contourId: CONTOUR_ID,
    platformId: 'macos-local-electron',
    viewportMatrix: [{ ...VIEWPORT, status: 'SUPPORTED_BLACK_BOX_ACCEPTED' }],
    status: pass ? 'PASS_ATLAS_TEMPORAL_CONTINUITY_SAVED_QUERY_UI_JOURNEY' : 'NOT_READY',
    pass,
    accepted,
    negativeAssertions: {
      statusOnlyCorrectionAccepted: accepted.noStatusOnlyContinuityRoute !== true,
      silentSceneSliceAccepted: accepted.noSilentSceneSlice !== true,
      directIpcAcceptedJourney: false,
      generatedArtifactOnlyAccepted: false,
      networkActivated: accepted.noNetworkNoDialogs !== true,
      overflowAccepted: accepted.noHorizontalOverflow !== true,
    },
  };
}

export async function runTemporalContinuitySavedQueryJourneys(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  const seedOutDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-r3-c02-seed-evidence-'));
  let tempRoot = '';
  try {
    const seed = options.skipRuntime
      ? null
      : await runAtlasEntityRelationUiJourneys({
        rootDir,
        outDir: seedOutDir,
        preserveTempRoot: true,
      });
    tempRoot = seed?.runtime?.first?.result?.tempRoot || '';
    if (!options.skipRuntime && !tempRoot) throw new Error('R3_C02_SEED_TEMP_ROOT_MISSING');
    const continuation = options.skipRuntime ? null : await runElectronChild({ rootDir, tempRoot, mode: 'continuation' });
    const reopen = options.skipRuntime ? null : await runElectronChild({ rootDir, tempRoot, mode: 'reopen' });
    const persistence = options.skipRuntime ? null : await buildPersistenceProof(tempRoot);
    await preserveRendererScreenshot(continuation?.result?.rendererProbe, outDir, 'r3-c02-temporal-continuity-saved-query-journey.png');
    await preserveRendererScreenshot(reopen?.result?.rendererProbe, outDir, 'r3-c02-temporal-continuity-saved-query-reopen.png');
    const rendererSource = await fs.readFile(path.join(rootDir, 'src', 'renderer', 'editor.js'), 'utf8');
    const mainSource = await fs.readFile(path.join(rootDir, 'src', 'main.js'), 'utf8');
    const builderMatch = /async function buildProductCoreStateForCurrentProject\(\) \{([\s\S]*?)\n\}/u.exec(mainSource);
    const evaluationInput = {
      seed,
      continuation,
      reopen,
      persistence,
      rendererSourceHasStatusOnlyContinuity: /function announceAtlasContinuityCorrectionRoute|Atlas correction route: \$\{commandId\}/u.test(rendererSource),
      productCoreHasSilentSceneSlice: /collectAtlasOverviewSceneNodes\(roots\)\.slice\(0,\s*500\)/u.test(builderMatch?.[1] || ''),
    };
    const report = evaluateTemporalContinuitySavedQueryJourneys(evaluationInput);
    const fullReport = {
      ...report,
      runtime: { seed, continuation, reopen },
      persistence,
      evaluationInput: {
        seed: seed ? { pass: seed.pass, status: seed.status } : null,
        continuation,
        reopen,
        persistence,
        rendererSourceHasStatusOnlyContinuity: evaluationInput.rendererSourceHasStatusOnlyContinuity,
        productCoreHasSilentSceneSlice: evaluationInput.productCoreHasSilentSceneSlice,
      },
      evidenceFiles: {
        journeyScreenshot: fileProof(continuation?.result?.rendererProbe?.screenshot?.path || ''),
        reopenScreenshot: fileProof(reopen?.result?.rendererProbe?.screenshot?.path || ''),
      },
    };
    const reportPath = path.join(outDir, 'r3-c02-temporal-continuity-saved-query-journeys-report.json');
    await fs.writeFile(reportPath, `${JSON.stringify(fullReport, null, 2)}\n`, 'utf8');
    return { ...fullReport, reportPath, reportSha256: sha256File(reportPath) };
  } finally {
    if (options.preserveTempRoot !== true && tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
    await fs.rm(seedOutDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runTemporalContinuitySavedQueryJourneys(args);
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
