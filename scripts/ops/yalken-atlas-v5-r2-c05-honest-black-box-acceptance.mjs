#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

const REPORT_SCHEMA = 'yalken.atlas.v5.r2.c05.honestBlackBoxAcceptance.v1';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_R2_C05_HONEST_BLACK_BOX_ACCEPTANCE');
const DEFAULT_TIMEOUT_MS = 60000;
const ACCEPTED_VIEWPORT = Object.freeze({ width: 1440, height: 1200 });

function parseArgs(argv) {
  const out = { outDir: DEFAULT_OUT_DIR, skipRuntime: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && index + 1 < argv.length) {
      out.outDir = path.resolve(String(argv[index + 1] || '').trim());
      index += 1;
    } else if (arg === '--skip-runtime') {
      out.skipRuntime = true;
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
  process.stdout.write('R2_C05_BLACK_BOX_RESULT:' + JSON.stringify(payload) + '\\n');
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
    const typeMap = {
      mouseMove: 'mouseMoved',
      mouseDown: 'mousePressed',
      mouseUp: 'mouseReleased',
    };
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
      'const points = [' +
        '[r.left + r.width / 2, r.top + r.height / 2],' +
        '[r.left + Math.min(10, Math.max(2, r.width / 4)), r.top + r.height / 2],' +
        '[r.right - Math.min(10, Math.max(2, r.width / 4)), r.top + r.height / 2],' +
        '[r.left + r.width / 2, r.top + Math.min(10, Math.max(2, r.height / 4))],' +
        '[r.left + r.width / 2, r.bottom - Math.min(10, Math.max(2, r.height / 4))]' +
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
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 6000;
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

async function waitForExpression(win, expression, label, timeoutMs = 6000) {
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
    'const r = el.getBoundingClientRect();' +
    'return { ok: 1, text: (el.textContent || "").trim(), x: r.left, y: r.top, width: r.width, height: r.height, active: document.activeElement === el };' +
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

async function activateManualMapButton(win, hostSelector, text, readyExpression, label) {
  await clickElement(win, hostSelector + ' button', text);
  if (await tryWaitForExpression(win, readyExpression)) return true;
  await focusElement(win, hostSelector + ' button', text);
  await key(win, 'Enter');
  await waitForExpression(win, readyExpression, label || ('activate-' + text));
  return true;
}

async function typeInto(win, selector, text) {
  await clickElement(win, selector, '', { requireEnabled: true });
  const focused = await focusElement(win, selector);
  if (!focused || focused.ok !== 1 || focused.active !== true) {
    throw new Error('INPUT_NOT_FOCUSED:' + selector);
  }
  const selected = await selectInputContents(win, selector);
  if (!selected || selected.ok !== 1 || selected.active !== true) {
    throw new Error('INPUT_NOT_SELECTABLE:' + selector);
  }
  const modifier = process.platform === 'darwin' ? 'meta' : 'control';
  await sendInput(win, { type: 'keyDown', keyCode: 'A', modifiers: [modifier] });
  await sendInput(win, { type: 'keyUp', keyCode: 'A', modifiers: [modifier] });
  await sendInput(win, { type: 'keyDown', keyCode: 'Backspace' });
  await sendInput(win, { type: 'keyUp', keyCode: 'Backspace' });
  await waitForExpression(win, 'document.querySelector(' + JSON.stringify(selector) + ')?.value === ""', 'input-cleared');
  const refocused = await focusElement(win, selector);
  if (!refocused || refocused.ok !== 1 || refocused.active !== true) {
    throw new Error('INPUT_NOT_REFOCUSED:' + selector);
  }
  let expectedPrefix = '';
  for (const char of Array.from(text)) {
    const ready = await focusInputEnd(win, selector);
    if (!ready || ready.ok !== 1 || ready.active !== true) {
      throw new Error('INPUT_CHAR_FOCUS_LOST:' + selector);
    }
    if (char === ' ') {
      await sendInput(win, { type: 'keyDown', keyCode: 'Space' });
      await sendInput(win, { type: 'keyUp', keyCode: 'Space' });
    } else {
      await sendInput(win, { type: 'char', keyCode: char });
    }
    expectedPrefix += char;
    await waitForExpression(
      win,
      'document.querySelector(' + JSON.stringify(selector) + ')?.value === ' + JSON.stringify(expectedPrefix),
      'input-prefix-' + expectedPrefix,
    );
    await sleep(8);
  }
  await sleep(90);
  const value = await readInputValue(win, selector);
  if (value !== text) {
    throw new Error('INPUT_VALUE_MISMATCH:' + JSON.stringify({ selector, expected: text, actual: value }));
  }
}

async function key(win, keyCode, modifiers = []) {
  await sendInput(win, { type: 'keyDown', keyCode, modifiers });
  await sendInput(win, { type: 'keyUp', keyCode, modifiers });
}

async function dragElement(win, selector, text, dx, dy) {
  const el = await waitForElement(win, selector, text, { requireEnabled: false });
  const x = Math.round(el.cx);
  const y = Math.round(el.cy);
  await sendInput(win, { type: 'mouseMove', x, y });
  await sendInput(win, { type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  await sendInput(win, { type: 'mouseMove', x: x + Math.round(dx / 2), y: y + Math.round(dy / 2), button: 'left' });
  await sendInput(win, { type: 'mouseMove', x: x + dx, y: y + dy, button: 'left' });
  await sendInput(win, { type: 'mouseUp', x: x + dx, y: y + dy, button: 'left', clickCount: 1 });
  return { from: { x, y }, to: { x: x + dx, y: y + dy } };
}

async function snapshotWorkbench(win) {
  return js(win, '(() => {' +
    'const host = document.querySelector("[data-manual-map-plan-host]");' +
    'const nodeHit = (el) => {' +
      'const r = el.getBoundingClientRect();' +
      'const points = [' +
        '[r.left + r.width / 2, r.top + r.height / 2],' +
        '[r.left + Math.min(12, Math.max(3, r.width / 4)), r.top + r.height / 2],' +
        '[r.right - Math.min(12, Math.max(3, r.width / 4)), r.top + r.height / 2],' +
        '[r.left + r.width / 2, r.top + Math.min(12, Math.max(3, r.height / 4))],' +
        '[r.left + r.width / 2, r.bottom - Math.min(12, Math.max(3, r.height / 4))]' +
      '];' +
      'return points.some((point) => {' +
        'const x = Math.max(1, Math.min(window.innerWidth - 2, point[0]));' +
        'const y = Math.max(1, Math.min(window.innerHeight - 2, point[1]));' +
        'const target = document.elementFromPoint(x, y);' +
        'return Boolean(target && target.closest("[data-manual-map-node-id]") === el);' +
      '});' +
    '};' +
    'const labels = Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-node-id]")).map((el) => ({ id: el.getAttribute("data-manual-map-node-id"), text: (el.textContent || "").trim(), selected: el.classList.contains("is-selected"), hit: nodeHit(el) }));' +
    'const edges = Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-edge-id]")).map((el) => ({ id: el.getAttribute("data-manual-map-edge-id"), selected: el.classList.contains("is-selected") }));' +
    'const rows = Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-row-id]")).map((el) => ({ rowId: el.getAttribute("data-manual-map-row-id"), text: (el.textContent || "").trim(), selected: el.getAttribute("aria-selected") === "true" }));' +
    'const form = document.querySelector("[data-manual-map-plan-host] [data-manual-map-command-form]");' +
    'const result = document.querySelector("[data-manual-map-plan-host] [data-manual-map-operation-result]");' +
    'return { ok: 1, hostVisible: Boolean(host && !host.closest("[hidden]")), status: host?.dataset?.manualMapWorkbenchStatus || "", placement: host?.dataset?.manualMapWorkbenchPlacement || "", nodeCount: labels.length, edgeCount: edges.length, rowCount: rows.length, nodes: labels, edges, rows, formCommandId: form?.dataset?.manualMapCommandId || "", formRisk: form?.dataset?.manualMapCommandRisk || "", resultStatus: result?.dataset?.manualMapOperationResult || "", text: host?.textContent || "", hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };' +
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

async function openManualMapWorkspace(win) {
  await waitForElement(win, '[data-atlas-reachability-opener]', '', { requireEnabled: true, timeoutMs: 8000 });
  await clickElement(win, '[data-atlas-reachability-opener]');
  await clickElement(win, '[data-atlas-surface-button="manualMap"]', 'Map');
  await clickElement(win, '[data-manual-map-workbench-host] button', 'Open workspace');
  await waitForExpression(win, 'Boolean(document.querySelector("[data-manual-map-plan-workspace]:not([hidden]) [data-manual-map-plan-host]"))', 'manual-map-workspace-visible');
  await waitForElement(win, '[data-manual-map-plan-host] button', 'Create map', { requireEnabled: true });
}

async function applyDraft(win, hostSelector, options = {}) {
  if (options.confirm === true) {
    await clickElement(win, hostSelector + ' [data-manual-map-confirm-risk]');
    if (!await tryWaitForExpression(win, 'document.querySelector(' + JSON.stringify(hostSelector + ' [data-manual-map-confirm-risk]') + ')?.checked === true')) {
      await focusElement(win, hostSelector + ' [data-manual-map-confirm-risk]');
      await key(win, 'Space');
      await waitForExpression(win, 'document.querySelector(' + JSON.stringify(hostSelector + ' [data-manual-map-confirm-risk]') + ')?.checked === true', 'draft-confirm-checked');
    }
  }
  await clickElement(win, hostSelector + ' [data-manual-map-command-apply]', 'Apply');
  if (await tryWaitForExpression(win, 'document.querySelector(' + JSON.stringify(hostSelector + ' [data-manual-map-operation-result]') + ')?.dataset?.manualMapOperationResult === "APPLIED"', 1200)) return;
  await focusElement(win, hostSelector + ' [data-manual-map-command-apply]', 'Apply');
  await key(win, 'Enter');
  await waitForExpression(win, 'document.querySelector(' + JSON.stringify(hostSelector + ' [data-manual-map-operation-result]') + ')?.dataset?.manualMapOperationResult === "APPLIED"', 'draft-applied');
}

async function createNode(win, hostSelector, label) {
  await activateManualMapButton(
    win,
    hostSelector,
    'Add node',
    'document.querySelector(' + JSON.stringify(hostSelector + ' [data-manual-map-command-form]') + ')?.dataset?.manualMapCommandId === "manualMap.node.add"',
    'add-node-draft-open',
  );
  await typeInto(win, hostSelector + ' [data-manual-map-command-field="label"]', label);
  await applyDraft(win, hostSelector);
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-node-id]")).some((el) => (el.textContent || "").includes(' + JSON.stringify(label) + '))', 'node-visible-' + label);
}

async function runJourney(win) {
  await waitForElement(win, '[data-atlas-reachability-opener]', '', { requireEnabled: true, timeoutMs: 8000 });
  await clickElement(win, '[data-atlas-reachability-opener]');
  await clickElement(win, '[data-atlas-surface-button="manualMap"]', 'Map');
  await waitForElement(win, '[data-manual-map-workbench-host] button', 'Create map', { requireEnabled: true });
  const compactHost = '[data-manual-map-workbench-host]';
  await activateManualMapButton(
    win,
    compactHost,
    'Create map',
    'document.querySelector("[data-manual-map-workbench-host] [data-manual-map-command-form]")?.dataset?.manualMapCommandId === "manualMap.create"',
    'create-map-draft-open',
  );
  await typeInto(win, '[data-manual-map-workbench-host] [data-manual-map-command-field="title"]', 'R2C05BlackBoxMap');
  await waitForExpression(win, 'document.querySelector("[data-manual-map-workbench-host] [data-manual-map-impact-preview]")?.textContent.includes("No scene text is changed")', 'create-impact-preview');
  await applyDraft(win, compactHost, { confirm: true });
  await clickElement(win, '[data-manual-map-workbench-host] button', 'Open workspace');
  await waitForExpression(win, 'Boolean(document.querySelector("[data-manual-map-plan-workspace]:not([hidden]) [data-manual-map-plan-host]"))', 'manual-map-workspace-visible');
  const commandHost = '[data-manual-map-plan-host]';
  await createNode(win, commandHost, 'AlphaNodeR2C05');
  await createNode(win, commandHost, 'BetaNodeR2C05');

  await clickElement(win, '[data-manual-map-plan-host] [data-manual-map-row-id]', 'AlphaNodeR2C05');
  await clickElement(win, '[data-manual-map-plan-host] [data-manual-map-row-id]', 'BetaNodeR2C05', { modifiers: ['shift'] });
  await waitForExpression(win, 'document.querySelectorAll("[data-manual-map-plan-host] .manual-map-workspace__node.is-selected").length >= 2', 'two-node-selection');
  await activateManualMapButton(
    win,
    commandHost,
    'Add edge',
    'document.querySelector("[data-manual-map-plan-host] [data-manual-map-command-form]")?.dataset?.manualMapCommandId === "manualMap.edge.add"',
    'add-edge-draft-open',
  );
  await typeInto(win, '[data-manual-map-plan-host] [data-manual-map-command-field="label"]', 'AlphaToBetaR2C05');
  await applyDraft(win, commandHost);
  await waitForExpression(win, 'document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-edge-id]").length >= 1', 'edge-visible');

  await clickElement(win, '[data-manual-map-plan-host] [data-manual-map-row-id]', 'BetaNodeR2C05');
  await activateManualMapButton(
    win,
    commandHost,
    'Edit node',
    'document.querySelector("[data-manual-map-plan-host] [data-manual-map-command-form]")?.dataset?.manualMapCommandId === "manualMap.node.update"',
    'edit-node-draft-open',
  );
  await typeInto(win, '[data-manual-map-plan-host] [data-manual-map-command-field="label"]', 'BetaRenamedR2C05');
  await applyDraft(win, commandHost);
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-node-id]")).some((el) => (el.textContent || "").includes("BetaRenamedR2C05"))', 'rename-visible');

  const drag = await dragElement(win, '[data-manual-map-plan-host] [data-manual-map-node-id]', 'BetaRenamedR2C05', 72, 38);
  await waitForExpression(win, 'document.querySelector("[data-manual-map-plan-host] [data-manual-map-command-form]")?.dataset?.manualMapCommandId === "manualMap.node.update"', 'move-draft-open');
  await applyDraft(win, '[data-manual-map-plan-host]');

  await typeInto(win, '[data-manual-map-plan-host] .manual-map-workspace__search', 'BetaRenamed');
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-row-id]")).some((el) => (el.textContent || "").includes("BetaRenamedR2C05"))', 'search-filter-visible');
  await clickElement(win, '[data-manual-map-plan-host] .manual-map-workspace__chip', '+');
  await clickElement(win, '[data-manual-map-plan-host] .manual-map-workspace__chip', '-');
  await clickElement(win, '[data-manual-map-plan-host] .manual-map-workspace__chip', 'Fit');
  await clickElement(win, '[data-manual-map-plan-host] [role="listbox"]');
  await key(win, 'ArrowDown');
  await typeInto(win, '[data-manual-map-plan-host] .manual-map-workspace__search', '');
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-row-id]")).some((el) => (el.textContent || "").includes("AlphaNodeR2C05"))', 'search-cleared-alpha-visible');

  const beforeCancel = await snapshotWorkbench(win);
  await clickElement(win, '[data-manual-map-plan-host] [data-manual-map-row-id]', 'AlphaNodeR2C05');
  await activateManualMapButton(
    win,
    commandHost,
    'Delete node',
    'document.querySelector("[data-manual-map-plan-host] [data-manual-map-command-form]")?.dataset?.manualMapCommandId === "manualMap.node.delete"',
    'delete-node-draft-open',
  );
  await waitForExpression(win, 'document.querySelector("[data-manual-map-plan-host] [data-manual-map-impact-preview]")?.textContent.includes("Deletes selected node")', 'delete-impact-preview');
  await clickElement(win, '[data-manual-map-plan-host] [data-manual-map-command-cancel]', 'Cancel');
  await waitForExpression(win, 'document.querySelector("[data-manual-map-plan-host] [data-manual-map-operation-result]")?.dataset?.manualMapOperationResult === "CANCELLED_NOOP"', 'cancel-noop-result');
  const afterCancel = await snapshotWorkbench(win);
  await activateManualMapButton(
    win,
    commandHost,
    'Delete node',
    'document.querySelector("[data-manual-map-plan-host] [data-manual-map-command-form]")?.dataset?.manualMapCommandId === "manualMap.node.delete"',
    'delete-node-confirm-draft-open',
  );
  await applyDraft(win, commandHost, { confirm: true });
  await waitForExpression(win, 'Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-node-id]")).length === 1 && !document.body.textContent.includes("AlphaNodeR2C05")', 'confirmed-delete-visible');

  const finalSnapshot = await snapshotWorkbench(win);
  const screenshot = await captureProof(win, 'r2-c05-black-box-journey');
  const viewport = await js(win, '({ width: window.innerWidth, height: window.innerHeight })');
  return {
    ok: 1,
    mode: 'journey',
    viewport,
    inputEvents,
    drag,
    beforeCancel,
    afterCancel,
    finalSnapshot,
    screenshot,
  };
}

async function runReopen(win) {
  await openManualMapWorkspace(win);
  await waitForExpression(win, 'document.body.textContent.includes("BetaRenamedR2C05") && !document.body.textContent.includes("AlphaNodeR2C05")', 'reopen-graph-visible');
  const snapshot = await snapshotWorkbench(win);
  const screenshot = await captureProof(win, 'r2-c05-black-box-reopen');
  const viewport = await js(win, '({ width: window.innerWidth, height: window.innerHeight })');
  return {
    ok: 1,
    mode: 'reopen',
    viewport,
    inputEvents,
    snapshot,
    screenshot,
  };
}

for (const dirName of ['appData', 'userData', 'documents']) {
  fs.mkdirSync(path.join(tempRoot, dirName), { recursive: true });
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
    emitResult({
      ok: 1,
      mode,
      appReady: app.isReady(),
      windowCount: BrowserWindow.getAllWindows().length,
      rendererProbe,
      networkRequests,
      dialogCalls,
      tempRoot,
    });
    app.exit(0);
  } catch (error) {
    const lastMouseEvent = [...inputEvents].reverse().find((event) => event.x !== null && event.y !== null) || null;
    const debugDom = activeWindow ? await js(activeWindow, '(() => {' +
      'const describe = (el) => {' +
        'if (!el) return null;' +
        'const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };' +
        'return { tag: el.tagName || "", text: (el.textContent || el.getAttribute?.("aria-label") || "").trim().slice(0, 120), dataset: { ...(el.dataset || {}) }, className: String(el.className || ""), x: r.left, y: r.top, width: r.width, height: r.height, hidden: Boolean(el.closest?.("[hidden]")) };' +
      '};' +
      'const lastMouse = ' + JSON.stringify(lastMouseEvent) + ';' +
      'return {' +
        'activeElement: describe(document.activeElement),' +
        'lastMouse,' +
        'elementFromLastMouse: lastMouse ? describe(document.elementFromPoint(lastMouse.x, lastMouse.y)) : null,' +
        'planVisible: Boolean(document.querySelector("[data-manual-map-plan-workspace]:not([hidden])")),' +
        'planButtons: Array.from(document.querySelectorAll("[data-manual-map-plan-host] button")).map(describe),' +
        'planForms: Array.from(document.querySelectorAll("[data-manual-map-plan-host] [data-manual-map-command-form]")).map(describe),' +
        'compactButtons: Array.from(document.querySelectorAll("[data-manual-map-workbench-host] button")).map(describe),' +
        'compactForms: Array.from(document.querySelectorAll("[data-manual-map-workbench-host] [data-manual-map-command-form]")).map((el) => ({ ...describe(el), commandId: el.dataset.manualMapCommandId || "", risk: el.dataset.manualMapCommandRisk || "", result: document.querySelector("[data-manual-map-workbench-host] [data-manual-map-operation-result]")?.dataset?.manualMapOperationResult || "", resultText: document.querySelector("[data-manual-map-workbench-host] [data-manual-map-operation-result]")?.textContent || "", checked: document.querySelector("[data-manual-map-workbench-host] [data-manual-map-confirm-risk]")?.checked === true, fieldValues: Array.from(document.querySelectorAll("[data-manual-map-workbench-host] [data-manual-map-command-field]")).map((input) => ({ name: input.dataset.manualMapCommandField || "", value: input.value || "" })) })),' +
        'inner: { width: window.innerWidth, height: window.innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },' +
        'bodyText: (document.body.textContent || "").slice(0, 500),' +
      '};' +
    '})()').catch((debugError) => ({ debugError: debugError && debugError.message ? debugError.message : String(debugError) })) : null;
    emitResult({
      ok: 0,
      mode,
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : '',
      networkRequests,
      dialogCalls,
      tempRoot,
      inputEvents,
      debugDom,
    });
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
    .find((item) => item.startsWith('R2_C05_BLACK_BOX_RESULT:'));
  if (!line) return null;
  return JSON.parse(line.slice('R2_C05_BLACK_BOX_RESULT:'.length));
}

async function runElectronBlackBoxChild({ rootDir, tempRoot, mode, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  await fs.mkdir(tempRoot, { recursive: true });
  const childPath = path.join(tempRoot, `r2-c05-${mode}-child.cjs`);
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

async function findManifestPath(rootDir) {
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
  await walk(path.join(rootDir, 'documents'));
  return found.sort()[0] || '';
}

function graphFromManifest(manifest) {
  const projectId = normalizeText(manifest?.projectId);
  const maps = isPlainObject(manifest?.manualMaps?.maps) ? manifest.manualMaps.maps : {};
  const mapId = Object.keys(maps).sort()[0] || '';
  const map = mapId ? maps[mapId] : {};
  const nodes = Object.values(isPlainObject(map.nodes) ? map.nodes : {}).map((node) => ({
    id: normalizeText(node?.id),
    label: normalizeText(node?.label),
    kind: normalizeText(node?.nodeKind || node?.kind) || 'note',
    position: isPlainObject(node?.position) ? {
      x: Number(node.position.x) || 0,
      y: Number(node.position.y) || 0,
    } : { x: 0, y: 0 },
    target: isPlainObject(node?.target) ? {
      kind: normalizeText(node.target.kind),
      id: normalizeText(node.target.id),
    } : { kind: '', id: '' },
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
  const graph = graphFromManifest(manifest);
  const exported = serializeManualMapExportJsonV1WithLossReport(graph);
  const imagePdf = buildManualMapImagePdfExportEvidence(graph);
  const targetProjectId = 'r2-c05-repeat-import-target';
  const targetState = applyCoreSequence(createInitialCoreState(), [{
    type: CORE_COMMAND_IDS.PROJECT_CREATE,
    payload: { projectId: targetProjectId, title: 'R2 C05 Repeat Import Target', sceneId: 'scene-repeat' },
  }]);
  const imported = targetState.ok === true
    ? await applyManualMapJsonRepeatImportViaCommandKernel({
      exportJson: exported.json,
      initialState: targetState.state,
      targetProjectId,
      targetMapId: 'r2-c05-imported-map',
      commandExecutor: (command, context) => reduceCoreState(context.state, command),
    })
    : { ok: false, error: targetState.error };
  return {
    manifestPath,
    manifestProof: fileProof(manifestPath),
    graph,
    graphHash: sha256Text(JSON.stringify(graph)),
    exportJsonSha256: sha256Text(exported.json),
    exportLossCount: exported.lossReport.count,
    imagePdfOk: imagePdf.ok === true,
    imageEvidenceHash: imagePdf.value?.meta?.evidenceHash || '',
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
  try {
    const targetPath = path.join(outDir, basename);
    await fs.copyFile(sourcePath, targetPath);
    probe.screenshot = {
      ...probe.screenshot,
      path: targetPath,
      preserved: true,
    };
  } catch {
    probe.screenshot = {
      ...probe.screenshot,
      preserved: false,
    };
  }
}

export function evaluateHonestBlackBoxAcceptance(input = {}) {
  const first = input.first || {};
  const second = input.second || {};
  const portability = input.portability || {};
  const firstProbe = first.result?.rendererProbe || {};
  const secondProbe = second.result?.rendererProbe || {};
  const finalSnapshot = firstProbe.finalSnapshot || {};
  const reopenSnapshot = secondProbe.snapshot || {};
  const afterCancel = firstProbe.afterCancel || {};
  const beforeCancel = firstProbe.beforeCancel || {};
  const manifestNodes = Array.isArray(portability.graph?.nodes) ? portability.graph.nodes : [];
  const manifestEdges = Array.isArray(portability.graph?.edges) ? portability.graph.edges : [];
  const manifestText = JSON.stringify(input.manifest || {});
  const accepted = {
    visibleInputRuntime: first.ok === true && second.ok === true
      && first.runtimeKind === 'production-electron-visible-input-black-box'
      && second.runtimeKind === 'production-electron-visible-input-black-box',
    pointerAndKeyboardUsed: countEvents(first, 'mouseDown') >= 12 && countEvents(first, 'keyDown') >= 4 && countEvents(first, 'char') >= 5,
    createRenameConnectMoveSearchDelete: finalSnapshot.nodeCount === 1
      && finalSnapshot.edgeCount === 0
      && finalSnapshot.text.includes('BetaRenamedR2C05')
      && !finalSnapshot.text.includes('AlphaNodeR2C05'),
    cancelNoop: beforeCancel.nodeCount === afterCancel.nodeCount
      && beforeCancel.edgeCount === afterCancel.edgeCount
      && afterCancel.resultStatus === 'CANCELLED_NOOP',
    hitTestableNonblankGraph: finalSnapshot.nodes?.every((node) => node.hit === true) === true
      && firstProbe.screenshot?.nonBlankRatio > 0.01
      && secondProbe.screenshot?.nonBlankRatio > 0.01,
    listKeyboardParity: finalSnapshot.rowCount >= finalSnapshot.nodeCount + finalSnapshot.edgeCount,
    saveQuitReopenRecovery: reopenSnapshot.nodeCount === 1
      && reopenSnapshot.text.includes('BetaRenamedR2C05')
      && portability.manifestProof?.exists === true
      && portability.manifestProof?.bytes > 0,
    exportRepeatImport: portability.exportLossCount === 0
      && portability.imagePdfOk === true
      && portability.imageFormat === 'svg'
      && portability.pdfSourceFormat === 'html-print-packet'
      && portability.pdfBinaryGenerated === false
      && portability.repeatImportOk === true
      && portability.repeatImportCommandAuthority === 'CommandKernel'
      && portability.repeatImportDirectCoreMutation === false
      && portability.repeatImportStorageMutation === false
      && portability.repeatImportLossCount === 0
      && portability.repeatImportGraphHashMatched === true,
    noNetworkNoDialogs: first.result?.networkRequests === 0
      && second.result?.networkRequests === 0
      && first.result?.dialogCalls === 0
      && second.result?.dialogCalls === 0,
    noWrongTargetOrViewStatePersistence: manifestNodes.length === 1
      && manifestNodes[0]?.label === 'BetaRenamedR2C05'
      && manifestEdges.length === 0
      && !/"viewport"|"selection"|"layoutMode"|"manualMapTransientViewState"/u.test(manifestText),
    noOverflow: finalSnapshot.hasHorizontalOverflow === false && reopenSnapshot.hasHorizontalOverflow === false,
  };
  const pass = Object.values(accepted).every((value) => value === true);
  return {
    schemaVersion: REPORT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    contourId: 'R2_C05_HONEST_BLACK_BOX_ACCEPTANCE',
    platformId: 'macos-local-electron',
    viewportMatrix: [{ ...ACCEPTED_VIEWPORT, status: 'SUPPORTED_BLACK_BOX_ACCEPTED' }],
    status: pass ? 'PASS_VISIBLE_UI_BLACK_BOX_ACCEPTANCE' : 'NOT_READY',
    pass,
    accepted,
    negativeAssertions: {
      directIpcAcceptedJourney: false,
      proofByScreenshotByteSizeOnly: false,
      hiddenOpenerAccepted: false,
      canceledDestructiveActionMutated: accepted.cancelNoop !== true,
      staleViewStatePersisted: accepted.noWrongTargetOrViewStatePersistence !== true,
      wrongTargetSilentMutation: accepted.noWrongTargetOrViewStatePersistence !== true,
      networkActivated: accepted.noNetworkNoDialogs !== true,
    },
  };
}

export async function runHonestBlackBoxAcceptance(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-r2-c05-black-box-'));
  try {
    const first = options.skipRuntime
      ? null
      : await runElectronBlackBoxChild({ rootDir, tempRoot, mode: 'journey' });
    const second = options.skipRuntime
      ? null
      : await runElectronBlackBoxChild({ rootDir, tempRoot, mode: 'reopen' });
    const portability = options.skipRuntime ? null : await buildPortabilityProof(tempRoot);
    await preserveRendererScreenshot(first?.result?.rendererProbe, outDir, 'r2-c05-black-box-journey.png');
    await preserveRendererScreenshot(second?.result?.rendererProbe, outDir, 'r2-c05-black-box-reopen.png');
    const manifest = portability?.manifestPath ? JSON.parse(await fs.readFile(portability.manifestPath, 'utf8')) : {};
    const report = evaluateHonestBlackBoxAcceptance({ first, second, portability, manifest });
    const fullReport = {
      ...report,
      runtime: { first, second },
      portability,
      evidenceFiles: {
        journeyScreenshot: fileProof(first?.result?.rendererProbe?.screenshot?.path || ''),
        reopenScreenshot: fileProof(second?.result?.rendererProbe?.screenshot?.path || ''),
      },
    };
    const reportPath = path.join(outDir, 'r2-c05-honest-black-box-acceptance-report.json');
    await fs.writeFile(reportPath, `${JSON.stringify(fullReport, null, 2)}\n`, 'utf8');
    return {
      ...fullReport,
      reportPath,
      reportSha256: sha256File(reportPath),
    };
  } finally {
    if (options.preserveTempRoot !== true) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runHonestBlackBoxAcceptance(args);
  console.log(`YALKEN_ATLAS_R2_C05_HONEST_BLACK_BOX_ACCEPTANCE_RESULT:${JSON.stringify({
    status: result.status,
    pass: result.pass,
    reportPath: result.reportPath,
    reportSha256: result.reportSha256,
    accepted: result.accepted,
  })}`);
  process.exit(result.pass ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
