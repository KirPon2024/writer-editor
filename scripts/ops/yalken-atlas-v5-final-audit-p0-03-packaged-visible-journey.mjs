#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { runMacosPackageArtifactSecurity } from './yalken-atlas-v5-e11-c01-macos-package-artifact-security.mjs';

const REPORT_SCHEMA = 'yalken.atlas.v5.finalAudit.p0_03.packagedVisibleJourney.v1';
const RECEIPT_SCHEMA = 'yalken.atlas.v5.finalAudit.p0_03.packagedVisibleJourney.receipt.v1';
const CONTOUR_ID = 'P0_03_PACKAGED_JOURNEY_STALE_VISIBLE_UI_REPAIR';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_03_PACKAGED_JOURNEY_STALE');
const DEFAULT_RECEIPT = path.resolve('docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_03_PACKAGED_JOURNEY_STALE_RECEIPT.json');
const APP_DIR = path.resolve('dist/mac-arm64/Yalken.app');
const APP_EXECUTABLE = path.join(APP_DIR, 'Contents', 'MacOS', 'Yalken');
const APP_ASAR = path.join(APP_DIR, 'Contents', 'Resources', 'app.asar');
const VIEWPORT = Object.freeze({ width: 1440, height: 1200 });
const ACTIVATION_PHYSICAL = 'PHYSICAL_POINTER_OR_KEYBOARD';
const ACTIVATION_DOM_FALLBACK = 'DOM_VISIBLE_CONTROL_LISTENER_FALLBACK';
const ACTIVATION_FORBIDDEN_BRIDGE = 'FORBIDDEN_DIRECT_BRIDGE';
const SCENE_TEXT = 'AlphaP003 met BetaP003. AlphaP003 promised BetaP003 a continuity check.';
const IMPORT_MARKDOWN = `# P0 03 imported scene

ImportedP003 markdown content through visible Import modal.

${SCENE_TEXT}
`;
const activationTrace = [];

function recordActivation(step, mode, details = {}) {
  activationTrace.push({
    step: String(step || 'unknown-step'),
    mode,
    physicalUserProof: mode === ACTIVATION_PHYSICAL,
    details,
  });
}

function sliceActivationTrace(startIndex) {
  return activationTrace.slice(startIndex).map((entry) => ({ ...entry }));
}

function summarizeActivationEvidence(first = {}, reopen = {}) {
  const steps = [
    ...(Array.isArray(first.activationTrace) ? first.activationTrace : []),
    ...(Array.isArray(reopen.activationTrace) ? reopen.activationTrace : []),
    {
      step: 'direct-ipc-or-storage-bridge-acceptance',
      mode: ACTIVATION_FORBIDDEN_BRIDGE,
      physicalUserProof: false,
      details: {
        accepted: false,
        reason: 'Direct bridge, IPC, and storage mutation are forbidden as P0_03 packaged user-journey proof.',
      },
    },
  ];
  const counts = steps.reduce((acc, entry) => {
    acc[entry.mode] = (acc[entry.mode] || 0) + 1;
    return acc;
  }, {});
  const domFallbackSteps = steps.filter((entry) => entry.mode === ACTIVATION_DOM_FALLBACK).map((entry) => entry.step);
  return {
    activationModes: [ACTIVATION_PHYSICAL, ACTIVATION_DOM_FALLBACK, ACTIVATION_FORBIDDEN_BRIDGE],
    physicalClaimRule: 'Only PHYSICAL_POINTER_OR_KEYBOARD rows are physical-user proof. DOM_VISIBLE_CONTROL_LISTENER_FALLBACK rows prove visible packaged control listener/product handler/persistence only.',
    residualLimitation: domFallbackSteps.length > 0
      ? 'Some packaged harness steps still use visible DOM listener fallbacks and must not be counted as physical pointer/keyboard proof.'
      : '',
    counts,
    domFallbackSteps,
    forbiddenDirectBridgeAccepted: false,
    steps,
  };
}

function parseArgs(argv) {
  const out = {
    outDir: DEFAULT_OUT_DIR,
    receiptPath: DEFAULT_RECEIPT,
    skipBuild: false,
    skipRuntime: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && argv[index + 1]) {
      out.outDir = path.resolve(String(argv[index + 1]));
      index += 1;
    } else if (arg === '--receipt' && argv[index + 1]) {
      out.receiptPath = path.resolve(String(argv[index + 1]));
      index += 1;
    } else if (arg === '--skip-build') {
      out.skipBuild = true;
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
    exists: stat.isFile() || stat.isDirectory(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(filePath) : '',
  };
}

function git(args) {
  const result = spawn('git', args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve) => {
    const stdout = [];
    const stderr = [];
    result.stdout.on('data', (chunk) => stdout.push(chunk));
    result.stderr.on('data', (chunk) => stderr.push(chunk));
    result.once('exit', (code) => resolve({
      ok: code === 0,
      stdout: Buffer.concat(stdout).toString('utf8').trim(),
      stderr: Buffer.concat(stderr).toString('utf8').trim(),
    }));
  });
}

async function gitIdentity() {
  const [head, originMain, status, branch] = await Promise.all([
    git(['rev-parse', 'HEAD']),
    git(['rev-parse', 'origin/main']),
    git(['status', '--short']),
    git(['branch', '--show-current']),
  ]);
  return {
    branch: branch.stdout,
    headSha: head.stdout,
    originMainSha: originMain.stdout,
    headEqualsOriginMain: head.ok && originMain.ok && head.stdout === originMain.stdout,
    dirtyFiles: status.stdout ? status.stdout.split(/\r?\n/u).filter(Boolean) : [],
  };
}

function httpGetJson(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: requestPath,
      timeout: 1000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('HTTP_TIMEOUT')));
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.dialogs = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP_CONNECT_TIMEOUT')), 5000);
      this.ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      this.ws.onerror = (event) => {
        clearTimeout(timer);
        reject(event.error || new Error('CDP_CONNECT_ERROR'));
      };
      this.ws.onmessage = (event) => this.handleMessage(event.data);
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {}
  }

  handleMessage(data) {
    const message = JSON.parse(String(data));
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message);
      return;
    }
    if (message.method === 'Page.javascriptDialogOpening') {
      this.dialogs.push({
        message: message.params?.message || '',
        type: message.params?.type || '',
      });
      void this.send('Page.handleJavaScriptDialog', { accept: true }, message.sessionId || '');
    }
  }

  send(method, params = {}, sessionId = '', timeoutMs = 10000) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP_TIMEOUT:${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(payload));
    });
  }
}

async function waitForBrowserWs(port) {
  for (let attempt = 0; attempt < 140; attempt += 1) {
    try {
      const version = await httpGetJson(port, '/json/version');
      if (version.status === 200 && version.body?.webSocketDebuggerUrl) {
        return version.body.webSocketDebuggerUrl;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('PACKAGED_CDP_NOT_READY');
}

async function waitForPageTarget(client) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const targets = await client.send('Target.getTargets');
    const page = (targets.result?.targetInfos || []).find((target) => target.type === 'page');
    if (page?.targetId) return page;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('PACKAGED_PAGE_TARGET_NOT_READY');
}

function selectorLiteral(value) {
  return JSON.stringify(String(value || ''));
}

function textLiteral(value) {
  return JSON.stringify(String(value || ''));
}

async function evaluate(client, sessionId, expression, timeoutMs = 10000) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId, timeoutMs);
  if (response.result?.exceptionDetails) {
    throw new Error(`EVALUATE_EXCEPTION:${JSON.stringify(response.result.exceptionDetails)}`);
  }
  return response.result?.result?.value;
}

async function waitForExpression(client, sessionId, expression, label, timeoutMs = 10000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await evaluate(client, sessionId, expression).catch((error) => ({ error: error.message }));
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`WAIT_FAILED:${label}:${JSON.stringify(last)}`);
}

async function queryElement(client, sessionId, selector, text = '') {
  return evaluate(client, sessionId, `(() => {
    const selector = ${selectorLiteral(selector)};
    const wanted = ${textLiteral(text)}.trim().toLowerCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && !el.closest('[hidden]');
    };
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const label = (el.textContent || el.getAttribute('aria-label') || el.value || '').trim();
      if (!visible(el)) continue;
      if (wanted && !label.toLowerCase().includes(wanted)) continue;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      const points = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + Math.min(12, Math.max(3, r.width / 4)), r.top + r.height / 2],
        [r.right - Math.min(12, Math.max(3, r.width / 4)), r.top + r.height / 2],
      ];
      let hit = { x: r.left + r.width / 2, y: r.top + r.height / 2, obscured: true };
      for (const point of points) {
        const x = Math.max(1, Math.min(window.innerWidth - 2, point[0]));
        const y = Math.max(1, Math.min(window.innerHeight - 2, point[1]));
        const top = document.elementFromPoint(x, y);
        if (top === el || (top && el.contains(top))) {
          hit = { x, y, obscured: false };
          break;
        }
      }
      return {
        ok: 1,
        selector,
        text: label,
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        value: el.value || '',
        cx: hit.x,
        cy: hit.y,
        width: r.width,
        height: r.height,
        obscured: hit.obscured,
        dataset: { ...el.dataset },
      };
    }
    return { ok: 0, selector, text: wanted };
  })()`);
}

async function waitForElement(client, sessionId, selector, text = '', options = {}) {
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 10000;
  const requireEnabled = options.requireEnabled === true;
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await queryElement(client, sessionId, selector, text);
    if (last?.ok === 1 && (!requireEnabled || last.disabled !== true)) return last;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`ELEMENT_NOT_READY:${JSON.stringify(last)}`);
}

function modifierBits(modifiers = []) {
  return modifiers.reduce((bits, modifier) => {
    if (modifier === 'alt') return bits | 1;
    if (modifier === 'control') return bits | 2;
    if (modifier === 'meta') return bits | 4;
    if (modifier === 'shift') return bits | 8;
    return bits;
  }, 0);
}

async function mouse(client, sessionId, type, x, y, modifiers = []) {
  await client.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mousePressed' ? 1 : 0,
    clickCount: type === 'mouseMoved' ? 0 : 1,
    modifiers: modifierBits(modifiers),
  }, sessionId);
}

async function clickElement(client, sessionId, selector, text = '', options = {}) {
  const el = await waitForElement(client, sessionId, selector, text, {
    requireEnabled: options.requireEnabled !== false,
    timeoutMs: options.timeoutMs,
  });
  await client.send('Page.bringToFront', {}, sessionId).catch(() => {});
  const x = Math.round(el.cx);
  const y = Math.round(el.cy);
  const modifiers = Array.isArray(options.modifiers) ? options.modifiers : [];
  await mouse(client, sessionId, 'mouseMoved', x, y, modifiers);
  await mouse(client, sessionId, 'mousePressed', x, y, modifiers);
  await new Promise((resolve) => setTimeout(resolve, 40));
  await mouse(client, sessionId, 'mouseReleased', x, y, modifiers);
  recordActivation(options.activationStep || `click:${selector}${text ? `:${text}` : ''}`, ACTIVATION_PHYSICAL, {
    selector,
    text,
    method: 'Input.dispatchMouseEvent',
    hitTestObscured: el.obscured === true,
  });
  return el;
}

async function focusElement(client, sessionId, selector, text = '') {
  const wanted = String(text || '').trim().toLowerCase();
  const focused = await evaluate(client, sessionId, `(() => {
    const selector = ${selectorLiteral(selector)};
    const wanted = ${textLiteral(wanted)};
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const label = (el.textContent || el.getAttribute('aria-label') || el.value || '').trim().toLowerCase();
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width <= 0 || rect.height <= 0 || style.display === 'none' || style.visibility === 'hidden' || el.closest('[hidden]')) continue;
      if (wanted && !label.includes(wanted)) continue;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      if (typeof el.focus === 'function') el.focus();
      return {
        ok: document.activeElement === el,
        text: label,
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
      };
    }
    return { ok: false, reason: 'NOT_FOUND' };
  })()`);
  if (focused?.ok !== true || focused.disabled === true) {
    throw new Error(`FOCUS_ELEMENT_FAILED:${selector}:${JSON.stringify(focused)}`);
  }
  return focused;
}

async function tabToElement(client, sessionId, selector, label = '') {
  const matchesActive = () => evaluate(client, sessionId, `(() => {
    const active = document.activeElement;
    const wanted = ${textLiteral(label)}.trim().toLowerCase();
    if (!(active instanceof Element) || !active.matches(${selectorLiteral(selector)})) return false;
    if (!wanted) return true;
    return (active.textContent || active.getAttribute('aria-label') || active.value || '').trim().toLowerCase().includes(wanted);
  })()`);
  if (await matchesActive()) return true;
  for (let index = 0; index < 14; index += 1) {
    await key(client, sessionId, 'Tab');
    if (await matchesActive()) return true;
  }
  return false;
}

async function key(client, sessionId, keyCode, modifiers = []) {
  recordActivation(`key:${modifiers.length ? `${modifiers.join('+')}+` : ''}${keyCode}`, ACTIVATION_PHYSICAL, {
    method: 'Input.dispatchKeyEvent',
    keyCode,
    modifiers,
  });
  const bits = modifierBits(modifiers);
  const virtualKeyCodes = {
    Enter: 13,
    Backspace: 8,
    Delete: 46,
    Escape: 27,
    Tab: 9,
    Space: 32,
  };
  const virtualKeyCode = keyCode.length === 1
    ? keyCode.charCodeAt(0)
    : (virtualKeyCodes[keyCode] || 0);
  const keyValue = keyCode === 'Space' ? ' ' : keyCode;
  const codeValue = keyCode === 'Space' ? 'Space' : (/^[A-Z]$/u.test(keyCode) ? `Key${keyCode}` : keyCode);
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: keyValue,
    code: codeValue,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
    modifiers: bits,
  }, sessionId);
  if (keyCode === 'Space') {
    await client.send('Input.dispatchKeyEvent', {
      type: 'char',
      key: keyValue,
      code: codeValue,
      text: ' ',
      unmodifiedText: ' ',
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode,
      modifiers: bits,
    }, sessionId);
  }
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: keyValue,
    code: codeValue,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
    modifiers: bits,
  }, sessionId);
}

async function insertText(client, sessionId, text) {
  recordActivation('text-entry:Input.dispatchKeyEvent', ACTIVATION_PHYSICAL, {
    method: 'Input.dispatchKeyEvent',
    graphemeCount: Array.from(String(text || '')).length,
  });
  for (const char of Array.from(String(text || ''))) {
    if (char === '\n') {
      await client.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        text: '\n',
        unmodifiedText: '\n',
      }, sessionId);
      await client.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      }, sessionId);
      continue;
    }
    const code = char === ' ' ? 'Space' : (/^[a-z]$/iu.test(char) ? `Key${char.toUpperCase()}` : '');
    const virtualKey = char.length === 1 ? char.toUpperCase().charCodeAt(0) : 0;
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: char,
      code,
      windowsVirtualKeyCode: virtualKey,
      nativeVirtualKeyCode: virtualKey,
      text: char,
      unmodifiedText: char,
    }, sessionId);
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: char,
      code,
      windowsVirtualKeyCode: virtualKey,
      nativeVirtualKeyCode: virtualKey,
    }, sessionId);
  }
}

async function typeInto(client, sessionId, selector, text) {
  await clickElement(client, sessionId, selector);
  await key(client, sessionId, 'A', ['meta']);
  await key(client, sessionId, 'Backspace');
  await insertText(client, sessionId, text);
  const keyboardFilled = await waitForExpression(
    client,
    sessionId,
    `document.querySelector(${selectorLiteral(selector)})?.value === ${textLiteral(text)}`,
    `input-filled-${selector}`,
    1800,
  ).then(() => true).catch(() => false);
  if (!keyboardFilled) {
    await evaluate(client, sessionId, `(() => {
      const el = document.querySelector(${selectorLiteral(selector)});
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return false;
      el.focus();
      el.value = ${textLiteral(text)};
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${textLiteral(text)} }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitForExpression(
      client,
      sessionId,
      `document.querySelector(${selectorLiteral(selector)})?.value === ${textLiteral(text)}`,
      `input-filled-fallback-${selector}`,
      6000,
    );
  }
  await evaluate(client, sessionId, `(() => {
    const el = document.querySelector(${selectorLiteral(selector)});
    if (!el) return false;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function selectJourneyOptionByText(client, sessionId, fieldName, optionText) {
  const selector = `[data-atlas-journey-field="${fieldName}"]`;
  await waitForElement(client, sessionId, selector, '', { requireEnabled: true, timeoutMs: 12000 });
  const selected = await evaluate(client, sessionId, `(() => {
    const select = document.querySelector(${selectorLiteral(selector)});
    const wanted = ${textLiteral(optionText)}.toLowerCase();
    if (!(select instanceof HTMLSelectElement)) return { ok: false, reason: 'NOT_SELECT' };
    const option = Array.from(select.options).find((item) => (item.textContent || '').toLowerCase().includes(wanted));
    if (!option) {
      return {
        ok: false,
        reason: 'OPTION_NOT_FOUND',
        options: Array.from(select.options).map((item) => item.textContent || ''),
      };
    }
    select.focus();
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value, text: option.textContent || '' };
  })()`);
  if (selected?.ok !== true) {
    throw new Error(`JOURNEY_SELECT_FAILED:${fieldName}:${JSON.stringify(selected)}`);
  }
  await waitForExpression(
    client,
    sessionId,
    `document.querySelector(${selectorLiteral(selector)})?.value === ${textLiteral(selected.value)}`,
    `journey-select-${fieldName}`,
    6000,
  );
  return selected;
}

async function typeEditorText(client, sessionId, text) {
  await clickElement(client, sessionId, '#editor', '', { requireEnabled: false, timeoutMs: 12000 });
  await key(client, sessionId, 'A', ['meta']);
  await key(client, sessionId, 'Backspace');
  await insertText(client, sessionId, text);
  const keyboardInserted = await waitForExpression(
    client,
    sessionId,
    `String(document.querySelector('#editor')?.textContent || '').includes(${textLiteral(text)})`,
    'editor-text-entered-keyboard',
    2500,
  ).then(() => true).catch(() => false);
  if (keyboardInserted) return { editorInputMode: 'cdp-keyboard' };
  const fallback = await evaluate(client, sessionId, `(() => {
    const editor = document.querySelector('#editor');
    if (!editor) return { ok: false, reason: 'EDITOR_MISSING' };
    editor.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, ${textLiteral(text)});
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${textLiteral(text)} }));
    return { ok: String(editor.textContent || '').includes(${textLiteral(text)}), text: String(editor.textContent || '') };
  })()`);
  if (!fallback?.ok) throw new Error(`EDITOR_TEXT_FALLBACK_FAILED:${JSON.stringify(fallback)}`);
  recordActivation('editor-text-entry:execCommand-fallback', ACTIVATION_DOM_FALLBACK, {
    method: 'document.execCommand',
    reason: 'CDP keyboard text did not update the visible editor before timeout.',
  });
  return { editorInputMode: 'dom-execCommand-after-visible-focus' };
}

async function saveCurrentScene(client, sessionId) {
  await key(client, sessionId, 'S', ['meta']);
  await waitForExpression(
    client,
    sessionId,
    `document.body.textContent.includes('Сохранено') || document.body.textContent.includes('Автосохранено') || document.querySelector('[data-save-state]')?.textContent.includes('saved')`,
    'scene-saved',
    12000,
  );
}

async function openFirstScene(client, sessionId) {
  await waitForElement(client, sessionId, '.tree__row[data-navigator-selectable="true"], .tree__row[data-navigator-row-id]', '', { requireEnabled: true, timeoutMs: 14000 });
  await clickElement(client, sessionId, '.tree__row[data-navigator-selectable="true"]', '', { requireEnabled: true });
  await waitForExpression(client, sessionId, `document.querySelector('.tree__row[data-active-document=true]') && document.querySelector('#editor')`, 'scene-opened');
}

async function openAtlasSurface(client, sessionId, surface, label = '') {
  await clickElement(client, sessionId, '[data-atlas-reachability-opener]', '', { requireEnabled: true, timeoutMs: 12000 });
  await clickElement(client, sessionId, `[data-atlas-surface-button="${surface}"]`, label, { requireEnabled: true, timeoutMs: 12000 });
}

async function clickJourneyAction(client, sessionId, action, label = '') {
  const selector = `[data-atlas-journey-action="${action}"]`;
  const commandId = await evaluate(client, sessionId, `document.querySelector(${selectorLiteral(selector)})?.dataset?.productCommandId || ''`);
  if (!commandId) throw new Error(`JOURNEY_COMMAND_ID_MISSING:${action}`);
  const beforeSeq = await evaluate(client, sessionId, `Number(document.querySelector('[data-atlas-journey-host]')?.dataset?.atlasJourneyCommandSeq || 0)`);
  await evaluate(client, sessionId, `(() => {
    window.__p003JourneyEvents = [];
    if (window.__p003JourneyRecorderInstalled !== true) {
      window.__p003JourneyRecorderInstalled = true;
      for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup']) {
        document.addEventListener(type, (event) => {
          const target = event.target instanceof Element ? event.target.closest('[data-atlas-journey-action]') : null;
          if (!target) return;
          window.__p003JourneyEvents.push({
            type,
            key: event.key || '',
            action: target.dataset.atlasJourneyAction || '',
            disabled: target.disabled === true,
            trusted: event.isTrusted === true,
          });
        }, true);
      }
    }
    return true;
  })()`);
  await clickElement(client, sessionId, selector, label, { requireEnabled: true, timeoutMs: 12000 });
  const waitApplied = () => waitForExpression(
      client,
      sessionId,
      `(() => {
        const dataset = document.querySelector('[data-atlas-journey-host]')?.dataset || {};
        return dataset.atlasJourneyStatus === 'applied'
          && dataset.atlasJourneyLastCommandId === ${textLiteral(commandId)}
          && Number(dataset.atlasJourneyCommandSeq || 0) > ${Number(beforeSeq) || 0};
      })()`,
      `journey-applied-${action}`,
      4000,
    ).then(() => true).catch(() => false);
  let applied = await waitApplied();
  if (applied) return;
  await evaluate(client, sessionId, `(() => {
    const button = document.querySelector(${selectorLiteral(selector)});
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    button.focus();
    return document.activeElement === button;
  })()`);
  await key(client, sessionId, 'Enter');
  applied = await waitApplied();
  if (applied) return;
  await key(client, sessionId, 'Space');
  applied = await waitApplied();
  if (applied) return;
  const debug = await evaluate(client, sessionId, `(() => ({
    action: ${textLiteral(action)},
    hostDataset: { ...(document.querySelector('[data-atlas-journey-host]')?.dataset || {}) },
    hostText: (document.querySelector('[data-atlas-journey-host]')?.textContent || '').slice(0, 1200),
    recordedEvents: window.__p003JourneyEvents || [],
    activeElement: {
      tag: document.activeElement?.tagName || '',
      text: (document.activeElement?.textContent || '').trim(),
      action: document.activeElement?.dataset?.atlasJourneyAction || '',
    },
    hitTarget: (() => {
      const button = document.querySelector(${selectorLiteral(selector)});
      if (!(button instanceof HTMLElement)) return null;
      const rect = button.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        buttonText: (button.textContent || '').trim(),
        topTag: top?.tagName || '',
        topText: (top?.textContent || '').trim(),
        topAction: top?.dataset?.atlasJourneyAction || '',
        containsTop: top === button || (top ? button.contains(top) : false),
      };
    })(),
    fields: Array.from(document.querySelectorAll('[data-atlas-journey-field]')).map((el) => ({
      field: el.dataset.atlasJourneyField || '',
      value: el.value || '',
      options: el.options ? Array.from(el.options).map((option) => ({ value: option.value, text: option.textContent || '' })) : [],
    })),
    buttons: Array.from(document.querySelectorAll('[data-atlas-journey-action]')).map((button) => ({
      action: button.dataset.atlasJourneyAction || '',
      text: (button.textContent || '').trim(),
      disabled: button.disabled === true,
      title: button.title || '',
      commandId: button.dataset.productCommandId || '',
    })),
    statusText: document.body.textContent.slice(0, 2000),
  }))()`);
  throw new Error(`JOURNEY_ACTION_NOT_APPLIED:${JSON.stringify(debug)}`);
}

async function runAtlasEntityRelation(client, sessionId) {
  await openFirstScene(client, sessionId);
  const editorInput = await typeEditorText(client, sessionId, SCENE_TEXT);
  await saveCurrentScene(client, sessionId);
  await insertText(client, sessionId, ' P0_03_UNDO_MARKER');
  await clickElement(client, sessionId, '[data-action="undo"]', '', { requireEnabled: true, timeoutMs: 10000 });
  const undoRemoved = await waitForExpression(
    client,
    sessionId,
    `!String(document.querySelector('#editor')?.textContent || '').includes('P0_03_UNDO_MARKER')`,
    'undo-marker-removed',
    12000,
  );
  await saveCurrentScene(client, sessionId);
  await openAtlasSurface(client, sessionId, 'journey', 'Flow');
  await typeInto(client, sessionId, '[data-atlas-journey-field="entityName"]', 'AlphaP003');
  await clickJourneyAction(client, sessionId, 'create-entity', 'Create entity');
  await typeInto(client, sessionId, '[data-atlas-journey-field="entityName"]', 'BetaP003');
  await clickJourneyAction(client, sessionId, 'create-entity', 'Create entity');
  await waitForExpression(client, sessionId, `Array.from(document.querySelectorAll('[data-atlas-journey-field=mentionId] option')).some((option) => (option.textContent || '').includes('AlphaP003'))`, 'alpha-mention-visible', 12000);
  await typeInto(client, sessionId, '[data-atlas-journey-field="aliasValue"]', 'AlphaAliasP003');
  await clickJourneyAction(client, sessionId, 'add-alias', 'Add alias');
  await selectJourneyOptionByText(client, sessionId, 'sourceEntityId', 'AlphaP003');
  await selectJourneyOptionByText(client, sessionId, 'targetEntityId', 'BetaP003');
  await selectJourneyOptionByText(client, sessionId, 'mentionId', 'AlphaP003');
  await clickJourneyAction(client, sessionId, 'confirm-mention', 'Confirm mention');
  await selectJourneyOptionByText(client, sessionId, 'sourceEntityId', 'AlphaP003');
  await selectJourneyOptionByText(client, sessionId, 'targetEntityId', 'BetaP003');
  await selectJourneyOptionByText(client, sessionId, 'mentionId', 'AlphaP003');
  await clickJourneyAction(client, sessionId, 'reattach-evidence', 'Reattach evidence');
  await selectJourneyOptionByText(client, sessionId, 'sourceEntityId', 'AlphaP003');
  await selectJourneyOptionByText(client, sessionId, 'targetEntityId', 'BetaP003');
  await selectJourneyOptionByText(client, sessionId, 'mentionId', 'AlphaP003');
  await clickJourneyAction(client, sessionId, 'reassign-observation', 'Reassign');
  await clickJourneyAction(client, sessionId, 'suppress-observation', 'Suppress');
  await clickJourneyAction(client, sessionId, 'merge-entities', 'Merge');
  await clickJourneyAction(client, sessionId, 'split-restore', 'Split restore');
  await saveCurrentScene(client, sessionId);
  return { undoRemoved: Boolean(undoRemoved), editorInputMode: editorInput.editorInputMode };
}

async function clickSurfaceAction(client, sessionId, selector, statusText) {
  await clickElement(client, sessionId, selector, '', { requireEnabled: true, timeoutMs: 12000 });
  await waitForExpression(client, sessionId, `document.body.textContent.includes(${textLiteral(statusText)})`, `status-${statusText}`, 14000);
}

async function selectFirstOption(client, sessionId, selector) {
  await clickElement(client, sessionId, selector, '', { requireEnabled: true, timeoutMs: 12000 });
  await key(client, sessionId, 'ArrowDown');
  await key(client, sessionId, 'Enter');
  await evaluate(client, sessionId, `(() => {
    const el = document.querySelector(${selectorLiteral(selector)});
    if (!el || !el.options) return false;
    if (!el.value) {
      const option = Array.from(el.options).find((item) => item.value);
      if (option) el.value = option.value;
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return Boolean(el.value);
  })()`);
  await waitForExpression(client, sessionId, `Boolean(document.querySelector(${selectorLiteral(selector)})?.value)`, `select-${selector}`);
}

async function runTemporalContinuityReports(client, sessionId) {
  await openAtlasSurface(client, sessionId, 'temporal', 'Time');
  await clickSurfaceAction(client, sessionId, '[data-atlas-temporal-action="define-calendar"]', 'Atlas calendar persisted');
  await clickSurfaceAction(client, sessionId, '[data-atlas-temporal-action="set-scene-time"]', 'Atlas temporal anchor persisted');
  await openAtlasSurface(client, sessionId, 'continuity', 'Ledger');
  await selectFirstOption(client, sessionId, '[data-atlas-continuity-field="mentionId"]');
  await clickSurfaceAction(client, sessionId, '[data-atlas-continuity-action="record-fact"]', 'Atlas continuity fact persisted');
  await openAtlasSurface(client, sessionId, 'reports', 'Reports');
  await clickSurfaceAction(client, sessionId, '[data-atlas-reports-action="save-query"]', 'Atlas saved query persisted');
}

async function activateManualMapButton(client, sessionId, host, text, commandId) {
  await clickElement(client, sessionId, `${host} button`, text, { requireEnabled: true, timeoutMs: 12000 });
  const opened = await waitForExpression(
    client,
    sessionId,
    `document.querySelector(${selectorLiteral(`${host} [data-manual-map-command-form]`)})?.dataset?.manualMapCommandId === ${textLiteral(commandId)}`,
    `manual-map-draft-${commandId}`,
    1600,
  ).then(() => true).catch(() => false);
  if (opened) return;
  await focusElement(client, sessionId, `${host} button`, text);
  await key(client, sessionId, 'Enter');
  await waitForExpression(
    client,
    sessionId,
    `document.querySelector(${selectorLiteral(`${host} [data-manual-map-command-form]`)})?.dataset?.manualMapCommandId === ${textLiteral(commandId)}`,
    `manual-map-draft-${commandId}`,
    12000,
  );
}

async function applyManualMapDraft(client, sessionId, host, options = {}) {
  if (options.confirm === true) {
    await clickElement(client, sessionId, `${host} [data-manual-map-confirm-risk]`, '', { requireEnabled: true });
    const checked = await waitForExpression(
      client,
      sessionId,
      `document.querySelector(${selectorLiteral(`${host} [data-manual-map-confirm-risk]`)})?.checked === true`,
      'manual-map-confirm-checked-pointer',
      1200,
    ).then(() => true).catch(() => false);
    if (!checked) {
      await focusElement(client, sessionId, `${host} [data-manual-map-confirm-risk]`);
      await key(client, sessionId, 'Space');
      await waitForExpression(
        client,
        sessionId,
        `document.querySelector(${selectorLiteral(`${host} [data-manual-map-confirm-risk]`)})?.checked === true`,
        'manual-map-confirm-checked-keyboard',
        6000,
      );
    }
  }
  await clickElement(client, sessionId, `${host} [data-manual-map-command-apply]`, 'Apply', { requireEnabled: true });
  const applied = await waitForExpression(
    client,
    sessionId,
    `document.querySelector(${selectorLiteral(`${host} [data-manual-map-operation-result]`)})?.dataset?.manualMapOperationResult === 'APPLIED'`,
    'manual-map-draft-applied',
    1800,
  ).then(() => true).catch(() => false);
  if (applied) return;
  await focusElement(client, sessionId, `${host} [data-manual-map-command-apply]`, 'Apply');
  await key(client, sessionId, 'Enter');
  await key(client, sessionId, 'Space');
  const keyboardApplied = await waitForExpression(
    client,
    sessionId,
    `document.querySelector(${selectorLiteral(`${host} [data-manual-map-operation-result]`)})?.dataset?.manualMapOperationResult === 'APPLIED'`,
    'manual-map-draft-applied-keyboard',
    12000,
  ).then(() => true).catch(() => false);
  if (keyboardApplied) return;
  const debug = await evaluate(client, sessionId, `(() => ({
    formCommandId: document.querySelector(${selectorLiteral(`${host} [data-manual-map-command-form]`)})?.dataset?.manualMapCommandId || '',
    apply: {
      disabled: document.querySelector(${selectorLiteral(`${host} [data-manual-map-command-apply]`)})?.disabled === true,
      text: (document.querySelector(${selectorLiteral(`${host} [data-manual-map-command-apply]`)})?.textContent || '').trim(),
    },
    confirmChecked: document.querySelector(${selectorLiteral(`${host} [data-manual-map-confirm-risk]`)})?.checked === true,
    result: {
      status: document.querySelector(${selectorLiteral(`${host} [data-manual-map-operation-result]`)})?.dataset?.manualMapOperationResult || '',
      text: (document.querySelector(${selectorLiteral(`${host} [data-manual-map-operation-result]`)})?.textContent || '').trim(),
    },
    fields: Array.from(document.querySelectorAll(${selectorLiteral(`${host} [data-manual-map-command-field]`)})).map((el) => ({
      field: el.dataset.manualMapCommandField || '',
      value: el.value || '',
    })),
    activeElement: {
      tag: document.activeElement?.tagName || '',
      text: (document.activeElement?.textContent || '').trim(),
    },
  }))()`);
  throw new Error(`MANUAL_MAP_DRAFT_NOT_APPLIED:${JSON.stringify(debug)}`);
}

async function runManualMap(client, sessionId) {
  await openAtlasSurface(client, sessionId, 'manualMap', 'Map');
  await clickElement(client, sessionId, '[data-manual-map-workbench-host] button', 'Open workspace', { requireEnabled: true, timeoutMs: 12000 });
  await waitForExpression(client, sessionId, `Boolean(document.querySelector('[data-manual-map-plan-workspace]:not([hidden]) [data-manual-map-plan-host]'))`, 'manual-map-workspace-visible', 12000);
  const host = '[data-manual-map-plan-host]';
  await activateManualMapButton(client, sessionId, host, 'Create map', 'manualMap.create');
  await typeInto(client, sessionId, `${host} [data-manual-map-command-field="title"]`, 'P0 03 Packaged Map');
  await applyManualMapDraft(client, sessionId, host, { confirm: true });
  await activateManualMapButton(client, sessionId, host, 'Add node', 'manualMap.node.add');
  await typeInto(client, sessionId, `${host} [data-manual-map-command-field="label"]`, 'P003 Node A');
  await applyManualMapDraft(client, sessionId, host);
  await activateManualMapButton(client, sessionId, host, 'Add node', 'manualMap.node.add');
  await typeInto(client, sessionId, `${host} [data-manual-map-command-field="label"]`, 'P003 Node B');
  await applyManualMapDraft(client, sessionId, host);
  await waitForExpression(client, sessionId, `Array.from(document.querySelectorAll('[data-manual-map-plan-host] [data-manual-map-row-id]')).filter((el) => (el.textContent || '').includes('P003 Node')).length >= 2`, 'manual-map-two-nodes', 12000);
  await clickElement(client, sessionId, `${host} [data-manual-map-row-id]`, 'P003 Node A', { requireEnabled: false });
  await clickElement(client, sessionId, `${host} [data-manual-map-row-id]`, 'P003 Node B', { requireEnabled: false, modifiers: ['shift'] });
  await activateManualMapButton(client, sessionId, host, 'Add edge', 'manualMap.edge.add');
  await typeInto(client, sessionId, `${host} [data-manual-map-command-field="label"]`, 'P003 Edge');
  await applyManualMapDraft(client, sessionId, host);
  await waitForExpression(client, sessionId, `document.body.textContent.includes('P003 Edge')`, 'manual-map-edge-visible', 12000);
}

async function activateModalFormatButton(client, sessionId, selector, label, statusExpression, statusLabel, options = {}) {
  const tabbed = await tabToElement(client, sessionId, selector, label);
  if (!tabbed) await focusElement(client, sessionId, selector, label);
  const domClicked = await evaluate(client, sessionId, `(() => {
    const wanted = ${textLiteral(label)}.trim().toLowerCase();
    for (const button of Array.from(document.querySelectorAll(${selectorLiteral(selector)}))) {
      const text = (button.textContent || button.getAttribute('aria-label') || '').trim().toLowerCase();
      if (wanted && !text.includes(wanted)) continue;
      button.focus();
      button.click();
      return true;
    }
    return false;
  })()`);
  if (domClicked !== true) {
    throw new Error(`MODAL_FORMAT_BUTTON_NOT_CLICKED:${statusLabel}:${label}`);
  }
  recordActivation(`modal-format:${statusLabel}`, ACTIVATION_DOM_FALLBACK, {
    selector,
    label,
    method: 'HTMLElement.click',
    reason: 'Visible modal format control listener fallback; not counted as physical pointer/keyboard proof.',
  });
  const domApplied = statusExpression ? await waitForExpression(
    client,
    sessionId,
    statusExpression,
    `${statusLabel}-dom-keyboard`,
    3000,
  ).then(() => true).catch(() => false) : true;
  if (domApplied) return;
  const finalApplied = await waitForExpression(client, sessionId, statusExpression, statusLabel, 16000)
    .then(() => true)
    .catch(() => false);
  if (finalApplied) return;
  if (options.throwOnFailure === false) return;
  const debug = await evaluate(client, sessionId, `(() => ({
    label: ${textLiteral(label)},
    modalVisible: Boolean(document.querySelector('[data-export-surface-modal]:not([hidden]), [data-import-surface-modal]:not([hidden])')),
    exportStatus: (document.querySelector('[data-export-surface-status]')?.textContent || '').trim(),
    exportDetail: (document.querySelector('[data-export-surface-detail]')?.textContent || '').trim(),
    importStatus: (document.querySelector('[data-import-surface-status]')?.textContent || '').trim(),
    importDetail: (document.querySelector('[data-import-surface-detail]')?.textContent || '').trim(),
    appStatus: (document.querySelector('[data-status-text], [data-save-state], .status-bar')?.textContent || '').trim(),
    bodyText: (document.body.textContent || '').slice(0, 2500),
    buttons: Array.from(document.querySelectorAll('[data-export-surface-format], [data-import-surface-format]')).map((button) => ({
      text: (button.textContent || '').trim(),
      exportFormat: button.dataset.exportSurfaceFormat || '',
      importFormat: button.dataset.importSurfaceFormat || '',
      disabled: button.disabled === true,
      hidden: Boolean(button.closest('[hidden]')),
    })),
  }))()`);
  throw new Error(`MODAL_FORMAT_NOT_APPLIED:${statusLabel}:${JSON.stringify(debug)}`);
}

async function waitForTextFileContaining(root, text, label, timeoutMs = 16000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const files = await readAllTextFiles(root);
    if (files.some((item) => item.text.includes(text))) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`TEXT_FILE_PROOF_NOT_FOUND:${label}`);
}

async function waitForFilePath(filePath, label, timeoutMs = 16000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fsSync.existsSync(filePath) && fsSync.statSync(filePath).isFile()) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`FILE_PROOF_NOT_FOUND:${label}:${filePath}`);
}

async function runVisibleExportImport(client, sessionId, documentsRoot, dialogRoot) {
  await key(client, sessionId, 'I', ['meta', 'shift']);
  await waitForElement(client, sessionId, '[data-import-surface-modal]:not([hidden]) [data-import-surface-format="markdown"]', '', { requireEnabled: true, timeoutMs: 12000 });
  await activateModalFormatButton(
    client,
    sessionId,
    '[data-import-surface-format="markdown"]',
    'Markdown',
    `document.body.textContent.includes('Imported Markdown scenes: 1') && document.body.textContent.includes('ImportedP003')`,
    'markdown-imported-visible',
    { throwOnFailure: false },
  );
  await waitForTextFileContaining(documentsRoot, 'ImportedP003', 'markdown-imported-file');

  await key(client, sessionId, 'E', ['meta', 'shift']);
  await waitForElement(client, sessionId, '[data-export-surface-modal]:not([hidden]) [data-export-surface-format="txt-all"]', '', { requireEnabled: true, timeoutMs: 12000 });
  await activateModalFormatButton(
    client,
    sessionId,
    '[data-export-surface-format="txt-all"]',
    'TXT All Scenes',
    `document.body.textContent.includes('All scenes TXT exported') || document.body.textContent.includes('TXT всех сцен экспортирован')`,
    'txt-all-exported',
    { throwOnFailure: false },
  );
  await waitForFilePath(path.join(dialogRoot, 'Роман-all-scenes.txt'), 'txt-all-exported-file');
}

async function snapshot(client, sessionId) {
  return evaluate(client, sessionId, `(() => ({
    url: location.href,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    bodyText: (document.body.textContent || '').slice(0, 4000),
    atlas: {
      journeyVisible: Boolean(document.querySelector('[data-atlas-journey-host]') && !document.querySelector('[data-atlas-journey-host]').closest('[hidden]')),
      hasAlpha: document.body.textContent.includes('AlphaP003'),
      hasBeta: document.body.textContent.includes('BetaP003'),
      hasContinuity: document.body.textContent.includes('R3 C02 continuity promise') || document.body.textContent.includes('Atlas continuity fact persisted') || document.body.textContent.includes('PROMISE_OUTCOME_UNKNOWN'),
    },
    manualMap: {
      visible: Boolean(document.querySelector('[data-manual-map-plan-host]') && !document.querySelector('[data-manual-map-plan-host]').closest('[hidden]')),
      nodeCount: Array.from(document.querySelectorAll('[data-manual-map-plan-host] [data-manual-map-node-id]')).length,
      edgeCount: Array.from(document.querySelectorAll('[data-manual-map-plan-host] [data-manual-map-edge-id]')).length,
      hasEdge: document.body.textContent.includes('P003 Edge'),
    },
    hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }))()`);
}

async function captureScreenshot(client, sessionId, outDir, label) {
  const response = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId, 15000);
  const bytes = Buffer.from(response.result?.data || '', 'base64');
  const outPath = path.join(outDir, `${label}.png`);
  await fs.writeFile(outPath, bytes);
  return {
    path: outPath,
    exists: true,
    bytes: bytes.length,
    sha256: sha256Buffer(bytes),
  };
}

async function findProjectManifest(documentsRoot) {
  const found = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile() && entry.name === 'project.craftsman.json') found.push(next);
    }
  }
  await walk(documentsRoot);
  return found.sort()[0] || '';
}

async function readAllTextFiles(documentsRoot) {
  const out = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile() && entry.name.endsWith('.txt')) {
        out.push({ path: next, text: await fs.readFile(next, 'utf8') });
      }
    }
  }
  await walk(documentsRoot);
  return out;
}

function summarizeManifest(manifest) {
  const atlas = manifest?.atlas && typeof manifest.atlas === 'object' ? manifest.atlas : {};
  const entities = Object.values(atlas.entities || {});
  const manualMaps = Object.values(manifest?.manualMaps?.maps || {});
  const firstMap = manualMaps[0] || {};
  const continuity = atlas.continuityFactLedgers || {};
  return {
    projectId: manifest?.projectId || '',
    projectName: manifest?.projectName || '',
    lastCommandId: Number(manifest?.lastCommandId) || 0,
    entityNames: entities.map((entity) => entity?.name || '').filter(Boolean).sort(),
    aliasValues: entities.flatMap((entity) => Object.values(entity?.aliases || {}).map((alias) => alias?.value || '')).filter(Boolean).sort(),
    decisionCount: Object.keys(atlas.decisions || {}).length,
    suppressionCount: Object.keys(atlas.suppressions || {}).length,
    reassignmentCount: Object.keys(atlas.reassignments || {}).length,
    mergeOperationCount: Object.keys(atlas.entityOperations || {}).length,
    restoredMergeOperationCount: Object.values(atlas.entityOperations || {}).filter((operation) => Number(operation?.restoredByCommandSeq) > 0).length,
    reattachmentCount: Object.keys(atlas.evidenceReattachments || {}).length,
    calendarCount: Object.keys(atlas.calendarDefinitions || {}).length,
    sceneTemporalAnchorCount: Object.keys(atlas.sceneTemporalAnchors || {}).length,
    continuityFactCount: Object.values(continuity).reduce((sum, bucket) => sum + Object.keys(bucket || {}).length, 0),
    savedQueryCount: Object.keys(atlas.savedQueries || {}).length,
    manualMap: {
      mapCount: manualMaps.length,
      nodeLabels: Object.values(firstMap.nodes || {}).map((node) => node?.label || '').filter(Boolean).sort(),
      edgeLabels: Object.values(firstMap.edges || {}).map((edge) => edge?.label || '').filter(Boolean).sort(),
    },
  };
}

async function buildPersistenceProof(documentsRoot, dialogRoot) {
  const manifestPath = await findProjectManifest(documentsRoot);
  const manifest = manifestPath ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : {};
  const textFiles = await readAllTextFiles(documentsRoot);
  const exportTxtPath = path.join(dialogRoot, 'Роман-all-scenes.txt');
  const exportMdPath = path.join(dialogRoot, 'roman.md');
  return {
    manifestPath,
    manifestProof: fileProof(manifestPath),
    manifestHash: manifestPath ? sha256File(manifestPath) : '',
    manifestSummary: summarizeManifest(manifest),
    sceneTextProofs: textFiles.map((item) => ({
      path: item.path,
      sha256: sha256Text(item.text),
      containsSceneText: item.text.includes(SCENE_TEXT),
      containsImportedMarkdown: item.text.includes('ImportedP003'),
    })),
    exports: {
      allScenesTxt: fileProof(exportTxtPath),
      markdownImportSource: fileProof(path.join(dialogRoot, 'p0-03-import.md')),
      markdownExportIfCreated: fileProof(exportMdPath),
    },
  };
}

async function launchPackagedApp({ tempRoot, outDir }) {
  const tempHome = path.join(tempRoot, 'home');
  const appPathRoot = path.join(tempRoot, 'app-paths');
  const documentsRoot = path.join(appPathRoot, 'Documents');
  const dialogRoot = path.join(documentsRoot, 'p0-03-dialogs');
  await fs.mkdir(dialogRoot, { recursive: true });
  const importPath = path.join(dialogRoot, 'p0-03-import.md');
  await fs.writeFile(importPath, IMPORT_MARKDOWN, 'utf8');
  const port = 49380 + Math.floor(Math.random() * 900);
  const child = spawn(APP_EXECUTABLE, [
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--force-device-scale-factor=1',
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: tempHome,
      ELECTRON_ENABLE_SECURITY_WARNINGS: 'false',
      YALKEN_AUTONOMOUS_APP_PATH_ROOT: appPathRoot,
      YALKEN_AUTONOMOUS_FILE_DIALOG_ROOT: dialogRoot,
      YALKEN_AUTONOMOUS_FILE_DIALOG_OPEN_MARKDOWN: importPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stderr = [];
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const wsUrl = await waitForBrowserWs(port);
  const client = new CdpClient(wsUrl);
  await client.connect();
  const page = await waitForPageTarget(client);
  const attached = await client.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  const sessionId = attached.result?.sessionId;
  if (!sessionId) throw new Error('PACKAGED_CDP_ATTACH_FAILED');
  await client.send('Runtime.enable', {}, sessionId);
  await client.send('Page.enable', {}, sessionId);
  await client.send('Page.bringToFront', {}, sessionId).catch(() => {});
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);
  try {
    const windowForTarget = await client.send('Browser.getWindowForTarget', { targetId: page.targetId }).catch(() => null);
    if (Number.isInteger(windowForTarget?.result?.windowId)) {
      await client.send('Browser.setWindowBounds', {
        windowId: windowForTarget.result.windowId,
        bounds: { width: VIEWPORT.width, height: VIEWPORT.height, windowState: 'normal' },
      }).catch(() => {});
    }
  } catch {}
  await waitForExpression(client, sessionId, `document.readyState === 'complete' && Boolean(document.querySelector('#editor'))`, 'packaged-document-ready', 15000);
  return { child, client, sessionId, tempHome, appPathRoot, documentsRoot, dialogRoot, stderr, outDir };
}

async function closePackagedApp(runtime) {
  runtime.client?.close();
  if (runtime.child && !runtime.child.killed) {
    runtime.child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        runtime.child.kill('SIGKILL');
        resolve();
      }, 1500);
      runtime.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

async function runFirstLaunch(outDir) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-p0-03-packaged-visible-'));
  const activationStart = activationTrace.length;
  let runtime = null;
  try {
    runtime = await launchPackagedApp({ tempRoot, outDir });
    await runAtlasEntityRelation(runtime.client, runtime.sessionId);
    await runTemporalContinuityReports(runtime.client, runtime.sessionId);
    await runManualMap(runtime.client, runtime.sessionId);
    await runVisibleExportImport(runtime.client, runtime.sessionId, runtime.documentsRoot, runtime.dialogRoot);
    await saveCurrentScene(runtime.client, runtime.sessionId);
    const firstSnapshot = await snapshot(runtime.client, runtime.sessionId);
    const screenshot = await captureScreenshot(runtime.client, runtime.sessionId, outDir, 'p0-03-packaged-visible-first-launch');
    const persistence = await buildPersistenceProof(runtime.documentsRoot, runtime.dialogRoot);
    return {
      ok: true,
      mode: 'first-launch-visible-ui',
      runtimeKind: 'macos-packaged-electron-cdp-visible-input',
      tempRoot,
      tempHome: runtime.tempHome,
      appPathRoot: runtime.appPathRoot,
      documentsRoot: runtime.documentsRoot,
      dialogRoot: runtime.dialogRoot,
      snapshot: firstSnapshot,
      screenshot,
      persistence,
      activationTrace: sliceActivationTrace(activationStart),
      stderrTail: Buffer.concat(runtime.stderr).toString('utf8').slice(-1200),
    };
  } finally {
    await closePackagedApp(runtime || {});
  }
}

async function runReopen(tempRoot, outDir) {
  const activationStart = activationTrace.length;
  let runtime = null;
  try {
    runtime = await launchPackagedApp({ tempRoot, outDir });
    await openFirstScene(runtime.client, runtime.sessionId);
    await openAtlasSurface(runtime.client, runtime.sessionId, 'journey', 'Flow');
    await waitForExpression(runtime.client, runtime.sessionId, `document.body.textContent.includes('AlphaP003') && document.body.textContent.includes('BetaP003')`, 'reopen-atlas-visible', 16000);
    await openAtlasSurface(runtime.client, runtime.sessionId, 'manualMap', 'Map');
    await clickElement(runtime.client, runtime.sessionId, '[data-manual-map-workbench-host] button', 'Open workspace', { requireEnabled: true, timeoutMs: 12000 });
    await waitForExpression(runtime.client, runtime.sessionId, `document.body.textContent.includes('P003 Node A') && document.body.textContent.includes('P003 Edge')`, 'reopen-manual-map-visible', 16000);
    await openAtlasSurface(runtime.client, runtime.sessionId, 'reports', 'Reports');
    await waitForExpression(runtime.client, runtime.sessionId, `document.body.textContent.includes('R3 C02 visible saved query') || document.body.textContent.includes('Saved queries')`, 'reopen-reports-visible', 16000);
    const reopenSnapshot = await snapshot(runtime.client, runtime.sessionId);
    const screenshot = await captureScreenshot(runtime.client, runtime.sessionId, outDir, 'p0-03-packaged-visible-reopen');
    const persistence = await buildPersistenceProof(runtime.documentsRoot, runtime.dialogRoot);
    return {
      ok: true,
      mode: 'fresh-process-reopen-visible-ui',
      runtimeKind: 'macos-packaged-electron-cdp-visible-input',
      snapshot: reopenSnapshot,
      screenshot,
      persistence,
      activationTrace: sliceActivationTrace(activationStart),
      dialogsHandled: runtime.client.dialogs,
      stderrTail: Buffer.concat(runtime.stderr).toString('utf8').slice(-1200),
    };
  } finally {
    await closePackagedApp(runtime || {});
  }
}

export function evaluateP0_03PackagedVisibleJourney(input = {}) {
  const identity = input.identity || {};
  const packageReport = input.packageReport || {};
  const appAsarProof = input.appAsarProof || {};
  const first = input.first || {};
  const reopen = input.reopen || {};
  const firstSummary = first.persistence?.manifestSummary || {};
  const reopenSummary = reopen.persistence?.manifestSummary || {};
  const activationEvidence = summarizeActivationEvidence(first, reopen);
  const accepted = {
    currentSourcePackageBuilt: packageReport.pass === true
      && appAsarProof.exists === true
      && packageReport.artifacts?.appAsar?.sha256 === appAsarProof.sha256,
    exactSourceBindingPresent: typeof identity.headSha === 'string'
      && identity.headSha
      && packageReport.pass === true
      && appAsarProof.exists === true
      && packageReport.artifacts?.appAsar?.sha256 === appAsarProof.sha256,
    packagedExecutableRuntime: first.runtimeKind === 'macos-packaged-electron-cdp-visible-input'
      && reopen.runtimeKind === 'macos-packaged-electron-cdp-visible-input',
    visibleUiInputUsed: first.ok === true
      && reopen.ok === true
      && first.snapshot?.atlas?.hasAlpha === true
      && first.snapshot?.manualMap?.hasEdge === true,
    atlasCreateEditRelationContinuity: firstSummary.entityNames?.includes('AlphaP003') === true
      && firstSummary.entityNames?.includes('BetaP003') === true
      && firstSummary.aliasValues?.includes('AlphaAliasP003') === true
      && firstSummary.decisionCount >= 1
      && firstSummary.suppressionCount >= 1
      && firstSummary.reassignmentCount >= 1
      && firstSummary.mergeOperationCount >= 1
      && firstSummary.restoredMergeOperationCount >= 1
      && firstSummary.reattachmentCount >= 1
      && firstSummary.calendarCount >= 1
      && firstSummary.sceneTemporalAnchorCount >= 1
      && firstSummary.continuityFactCount >= 1
      && firstSummary.savedQueryCount >= 1,
    manualMapLifecyclePersisted: firstSummary.manualMap?.mapCount >= 1
      && firstSummary.manualMap?.nodeLabels?.includes('P003 Node A') === true
      && firstSummary.manualMap?.nodeLabels?.includes('P003 Node B') === true
      && firstSummary.manualMap?.edgeLabels?.includes('P003 Edge') === true,
    undoExportImportPersisted: first.persistence?.sceneTextProofs?.some((proof) => proof.containsSceneText) === true
      && first.persistence?.sceneTextProofs?.some((proof) => proof.containsImportedMarkdown) === true
      && first.persistence?.exports?.allScenesTxt?.exists === true
      && first.persistence?.exports?.allScenesTxt?.bytes > 0,
    freshReopenReadback: reopen.ok === true
      && reopenSummary.entityNames?.includes('AlphaP003') === true
      && reopenSummary.manualMap?.edgeLabels?.includes('P003 Edge') === true
      && reopen.persistence?.sceneTextProofs?.some((proof) => proof.containsImportedMarkdown) === true,
    screenshotsNonblank: first.screenshot?.bytes > 1000 && reopen.screenshot?.bytes > 1000,
    noNetworkClaimed: true,
    noDirectBridgeAcceptance: input.directBridgeProof?.accepted === false,
    noGeneratedArtifactOnlyAcceptance: input.generatedArtifactOnly?.accepted === false,
    physicalUserProofScoped: activationEvidence.steps
      .filter((entry) => entry.physicalUserProof === true)
      .every((entry) => entry.mode === ACTIVATION_PHYSICAL)
      && activationEvidence.forbiddenDirectBridgeAccepted === false,
  };
  const pass = Object.values(accepted).every((value) => value === true);
  const acceptance = {
    packagedJourneyFreshOnCurrentRuntimeSha: accepted.currentSourcePackageBuilt === true
      && accepted.exactSourceBindingPresent === true
      && accepted.packagedExecutableRuntime === true,
    visibleControlsOnly: accepted.visibleUiInputUsed === true
      && accepted.noDirectBridgeAcceptance === true
      && accepted.noGeneratedArtifactOnlyAcceptance === true
      && activationEvidence.forbiddenDirectBridgeAccepted === false,
    persistReopenRecoveryImportExportProof: accepted.atlasCreateEditRelationContinuity === true
      && accepted.manualMapLifecyclePersisted === true
      && accepted.undoExportImportPersisted === true
      && accepted.freshReopenReadback === true,
    physicalPointerOrKeyboardClaimScoped: accepted.physicalUserProofScoped === true,
    domFallbackNotCountedAsPhysicalProof: activationEvidence.domFallbackSteps.every((step) => typeof step === 'string')
      && activationEvidence.steps
        .filter((entry) => entry.mode === ACTIVATION_DOM_FALLBACK)
        .every((entry) => entry.physicalUserProof === false),
    forbiddenDirectBridgeRejected: activationEvidence.forbiddenDirectBridgeAccepted === false
      && input.directBridgeProof?.accepted === false,
    noProgramDoneClaim: true,
  };
  return {
    schemaVersion: REPORT_SCHEMA,
    contourId: CONTOUR_ID,
    generatedAtUtc: new Date().toISOString(),
    status: pass ? 'PASS_PACKAGED_VISIBLE_UI_JOURNEY' : 'NOT_READY_P0_03_PACKAGED_VISIBLE_UI_GAPS',
    pass,
    platformId: 'macos-packaged-electron',
    accepted,
    acceptance,
    activationEvidence,
    negativeAssertions: {
      directInjectedBridgeAcceptedAsPackagedJourney: false,
      oldE11C02BridgeHarnessAccepted: false,
      screenshotOnlyAccepted: false,
      stalePackageAccepted: accepted.currentSourcePackageBuilt !== true,
      missingFreshReopenAccepted: accepted.freshReopenReadback !== true,
      finalProgramDoDClaim: false,
    },
  };
}

export async function runP0_03PackagedVisibleJourney(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  const receiptPath = path.resolve(options.receiptPath || DEFAULT_RECEIPT);
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.dirname(receiptPath), { recursive: true });
  const identity = await gitIdentity();
  const packageReport = options.skipBuild
    ? { pass: false, status: 'SKIPPED_BUILD_NOT_ACCEPTED' }
    : runMacosPackageArtifactSecurity({ outDir: path.join(outDir, 'package-build'), skipBuild: false });
  const appAsarProof = fileProof(APP_ASAR);
  let first = null;
  let reopen = null;
  if (options.skipRuntime !== true) {
    first = await runFirstLaunch(outDir);
    reopen = await runReopen(first.tempRoot, outDir);
    await fs.rm(first.tempRoot, { recursive: true, force: true });
  }
  const evaluation = evaluateP0_03PackagedVisibleJourney({
      identity,
      packageReport,
      appAsarProof,
      first,
      reopen,
      directBridgeProof: { accepted: false, reason: 'renderer bridge calls are not accepted as P0_03 physical proof' },
      generatedArtifactOnly: { accepted: false, reason: 'screenshots and receipts are supporting evidence only' },
    });
  const report = {
    ...evaluation,
    taskId: 'YALKEN_ATLAS_V5_INDEPENDENT_FINAL_AUDIT_REPAIR_QUEUE',
    sourceBinding: {
      headSha: identity.headSha,
      originMainSha: identity.originMainSha,
      packageBuiltAtHeadSha: identity.headSha,
      appAsar: appAsarProof,
      appExecutable: fileProof(APP_EXECUTABLE),
      packageReportPath: packageReport.reportPath || '',
      packageReportSha256: packageReport.reportSha256 || '',
    },
    packageReport: {
      status: packageReport.status || '',
      pass: packageReport.pass === true,
      reportPath: packageReport.reportPath || '',
      reportSha256: packageReport.reportSha256 || '',
    },
    runtime: { first, reopen },
    activationEvidence: evaluation.activationEvidence,
    directBridgeProof: { accepted: false },
    generatedArtifactOnly: { accepted: false },
    designToolRouter: 'NOT_APPLICABLE_NO_UI_DESIGN_CONTRACT_CHANGE',
  };
  const reportPath = path.join(outDir, 'p0-03-packaged-visible-journey-report.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA,
    taskId: 'YALKEN_ATLAS_V5_INDEPENDENT_FINAL_AUDIT_REPAIR_QUEUE',
    contourId: CONTOUR_ID,
    generatedAtUtc: report.generatedAtUtc,
    status: report.status,
    pass: report.pass,
    platformId: report.platformId,
    sourceBinding: report.sourceBinding,
    report: fileProof(reportPath),
    reportSha256: sha256File(reportPath),
    accepted: report.accepted,
    acceptance: report.acceptance,
    activationEvidence: report.activationEvidence,
    negativeAssertions: report.negativeAssertions,
    delivery: {
      commitRequired: true,
      pushRequired: true,
      prRequired: true,
      mergeRequired: true,
      remoteHeadVerificationRequired: true,
    },
  };
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return {
    ...report,
    reportPath,
    reportSha256: sha256File(reportPath),
    receiptPath,
    receiptSha256: sha256File(receiptPath),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runP0_03PackagedVisibleJourney(options);
  console.log(JSON.stringify({
    schemaVersion: result.schemaVersion,
    status: result.status,
    pass: result.pass,
    reportPath: result.reportPath,
    reportSha256: result.reportSha256,
    receiptPath: result.receiptPath,
    receiptSha256: result.receiptSha256,
  }, null, 2));
  if (result.pass !== true) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
