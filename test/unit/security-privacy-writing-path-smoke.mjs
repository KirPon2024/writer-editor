import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const TIMEOUT_MS = 20000;
const RESULT_PREFIX = 'SECURITY_PRIVACY_WRITING_PATH_SMOKE_RESULT:';
const rootDir = path.resolve(new URL('../..', import.meta.url).pathname);
const requireFromHere = createRequire(import.meta.url);
const electronBinary = requireFromHere('electron');

function isExpectedProjectLeaseLocalIpcTarget(value) {
  return typeof value === 'string' && /^\/tmp\/ypl-[0-9a-f]{32}\.sock$/u.test(value);
}

assert.equal(isExpectedProjectLeaseLocalIpcTarget(`/tmp/ypl-${'a'.repeat(32)}.sock`), true);
for (const externalOrMalformedTarget of [
  '127.0.0.1',
  'localhost',
  'https://example.invalid',
  '/tmp/ypl-too-short.sock',
  `/tmp/ypl-${'a'.repeat(32)}.sock/escape`,
  { host: '127.0.0.1', port: 443 },
]) {
  assert.equal(isExpectedProjectLeaseLocalIpcTarget(externalOrMalformedTarget), false);
}

function parseResult(stdout) {
  const line = String(stdout || '')
    .split(/\r?\n/u)
    .find((item) => item.startsWith(RESULT_PREFIX));
  if (!line) return null;
  return JSON.parse(line.slice(RESULT_PREFIX.length));
}

function createChildSource({ tempRoot, savePath, exportPath }) {
  return `\
const Module = require('module');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const electron = require('electron');

const rootDir = ${JSON.stringify(rootDir)};
const tempRoot = ${JSON.stringify(tempRoot)};
const savePath = ${JSON.stringify(savePath)};
const exportPath = ${JSON.stringify(exportPath)};
const RESULT_PREFIX = ${JSON.stringify(RESULT_PREFIX)};
const networkEvents = [];
const localIpcEvents = [];
const dialogCalls = [];

${isExpectedProjectLeaseLocalIpcTarget.toString()}

function emit(payload) {
  process.stdout.write(RESULT_PREFIX + JSON.stringify(payload) + '\\n');
}

function record(route, details = {}) {
  networkEvents.push({
    route,
    details: {
      url: typeof details.url === 'string' ? details.url : '',
      argsLength: Number.isInteger(details.argsLength) ? details.argsLength : 0,
    },
  });
}

function blocked(route) {
  return function blockedNetworkCall(...args) {
    const first = args[0];
    record(route, {
      url: typeof first === 'string' ? first : first && typeof first.href === 'string' ? first.href : '',
      argsLength: args.length,
    });
    throw new Error('SECURITY_PRIVACY_NETWORK_ATTEMPT:' + route);
  };
}

function localIpcAware(route, original) {
  return function guardedNetworkCall(...args) {
    if (isExpectedProjectLeaseLocalIpcTarget(args[0])) {
      localIpcEvents.push({ route, target: args[0] });
      return Reflect.apply(original, this, args);
    }
    return blocked(route).apply(this, args);
  };
}

http.request = blocked('main.http.request');
http.get = blocked('main.http.get');
https.request = blocked('main.https.request');
https.get = blocked('main.https.get');
net.connect = localIpcAware('main.net.connect', net.connect);
net.createConnection = localIpcAware('main.net.createConnection', net.createConnection);
tls.connect = blocked('main.tls.connect');

if (electron.net && typeof electron.net.request === 'function') {
  electron.net.request = blocked('electron.net.request');
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  const loaded = originalLoad.apply(this, arguments);
  if (request === 'electron' && loaded && loaded.net && typeof loaded.net.request === 'function') {
    loaded.net.request = electron.net.request;
  }
  return loaded;
};

const { app, BrowserWindow, dialog, session } = electron;

for (const dirName of ['appData', 'userData', 'documents']) {
  fs.mkdirSync(path.join(tempRoot, dirName), { recursive: true });
}
fs.mkdirSync(path.dirname(savePath), { recursive: true });
fs.mkdirSync(path.dirname(exportPath), { recursive: true });

dialog.showSaveDialog = async (_window, options = {}) => {
  const title = typeof options.title === 'string' ? options.title : '';
  const defaultPath = typeof options.defaultPath === 'string' ? options.defaultPath : '';
  const isDocx = /docx/i.test(title) || /\\.docx$/i.test(defaultPath);
  dialogCalls.push({ method: 'showSaveDialog', title, isDocx });
  return { canceled: false, filePath: isDocx ? exportPath : savePath };
};
dialog.showOpenDialog = async () => {
  dialogCalls.push({ method: 'showOpenDialog' });
  return { canceled: false, filePaths: [savePath] };
};
dialog.showMessageBox = async (_window, options = {}) => {
  const message = typeof options.message === 'string' ? options.message : '';
  const detail = typeof options.detail === 'string' ? options.detail : '';
  dialogCalls.push({ method: 'showMessageBox', message, detail });
  return { response: 0 };
};

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
    if (shouldBlock) {
      record('electron.session.webRequest', { url });
    }
    callback({ cancel: shouldBlock });
  });
});

process.chdir(rootDir);
if (!process.argv.includes('--dev')) process.argv.push('--dev');
require(path.join(rootDir, 'src', 'main.js'));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWindow() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) return win;
    await sleep(50);
  }
  throw new Error('WINDOW_NOT_CREATED');
}

async function waitForLoad(win) {
  if (!win.webContents.isLoadingMainFrame()) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LOAD_TIMEOUT')), 5000);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolve();
    });
    win.webContents.once('did-fail-load', (_event, _code, description) => {
      clearTimeout(timer);
      reject(new Error('DID_FAIL_LOAD:' + description));
    });
  });
}

async function runRendererWritingPath(win) {
  return win.webContents.executeJavaScript(\`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const initialText = [
      'SECURITY_PRIVACY_START_MARKER',
      'Offline editor sheet detector text.',
      'SECURITY_PRIVACY_END_MARKER',
    ].join('\\\\n\\\\n');
    const rendererEvents = [];
    const supported = {};
    const row = (id, status, data = {}) => ({ id, status, ...data });
    const record = (route, details = {}) => {
      rendererEvents.push({
        route,
        details: {
          url: typeof details.url === 'string' ? details.url : '',
          argsLength: Number.isInteger(details.argsLength) ? details.argsLength : 0,
        },
      });
    };
    const makeBlocked = (route) => function blockedRendererNetwork(...args) {
      const first = args[0];
      record(route, {
        url: typeof first === 'string' ? first : first && typeof first.href === 'string' ? first.href : '',
        argsLength: args.length,
      });
      throw new Error('SECURITY_PRIVACY_NETWORK_ATTEMPT:' + route);
    };

    supported.fetch = typeof window.fetch === 'function';
    supported.XMLHttpRequest = typeof window.XMLHttpRequest === 'function';
    supported.WebSocket = typeof window.WebSocket === 'function';

    if (supported.fetch) {
      window.fetch = makeBlocked('renderer.fetch');
    }
    if (supported.XMLHttpRequest) {
      window.XMLHttpRequest = makeBlocked('renderer.XMLHttpRequest');
    }
    if (supported.WebSocket) {
      window.WebSocket = makeBlocked('renderer.WebSocket');
    }

    const prose = document.querySelector('.ProseMirror');
    const api = window.electronAPI || null;
    const bodyText = (document.body && document.body.innerText ? document.body.innerText : '').toLowerCase();
    const surfaceNeedles = {
      account: ['account', 'аккаунт'],
      auth: ['login', 'sign in', 'sign-in', 'auth', 'авторизац', 'войти'],
      cloudSync: ['cloud sync', 'cloud', 'sync', 'облако', 'синхронизац'],
      remoteAI: ['remote ai', 'openai', 'chatgpt', 'llm', 'assistant ai', 'удаленный ии'],
    };
    const visibleSurface = Object.fromEntries(Object.entries(surfaceNeedles).map(([key, needles]) => [
      key,
      needles.filter((needle) => bodyText.includes(needle)),
    ]));

    if (!prose) {
      return { ok: 0, stage: 'editor', reason: 'PROSEMIRROR_MISSING', rendererEvents, supported, visibleSurface };
    }
    if (!api) {
      return { ok: 0, stage: 'api', reason: 'ELECTRON_API_MISSING', rendererEvents, supported, visibleSurface };
    }

    prose.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, initialText + ' SECURITY_PRIVACY_EDIT_MARKER ');
    await sleep(100);
    const editText = prose.textContent || '';
    const editResult = {
      hasStart: editText.includes('SECURITY_PRIVACY_START_MARKER'),
      hasEdit: editText.includes('SECURITY_PRIVACY_EDIT_MARKER'),
      hasEnd: editText.includes('SECURITY_PRIVACY_END_MARKER'),
      textLength: editText.length,
    };

    const routeCount = (route) => rendererEvents.filter((event) => event.route === route).length;
    const rows = [
      row('renderer_fetch', supported.fetch ? 'PASS' : 'UNSUPPORTED', { count: routeCount('renderer.fetch') }),
      row('renderer_XMLHttpRequest', supported.XMLHttpRequest ? 'PASS' : 'UNSUPPORTED', { count: routeCount('renderer.XMLHttpRequest') }),
      row('renderer_WebSocket', supported.WebSocket ? 'PASS' : 'UNSUPPORTED', { count: routeCount('renderer.WebSocket') }),
      row('visible_account_surface', visibleSurface.account.length === 0 ? 'PASS' : 'FAIL', { matches: visibleSurface.account }),
      row('visible_auth_surface', visibleSurface.auth.length === 0 ? 'PASS' : 'FAIL', { matches: visibleSurface.auth }),
      row('visible_cloud_sync_surface', visibleSurface.cloudSync.length === 0 ? 'PASS' : 'FAIL', { matches: visibleSurface.cloudSync }),
      row('visible_remote_AI_surface', visibleSurface.remoteAI.length === 0 ? 'PASS' : 'FAIL', { matches: visibleSurface.remoteAI }),
      row('edit_action_trigger', editResult.hasStart && editResult.hasEdit && editResult.hasEnd ? 'PASS' : 'FAIL', { result: editResult }),
    ];

    return {
      ok: 1,
      editResult,
      rows,
      rendererEvents,
      supported,
      visibleSurface,
    };
  })().catch((error) => ({
    ok: 0,
    stage: 'exception',
    message: error && error.message ? error.message : String(error)
  }))\`, true);
}

function countRoute(route) {
  return networkEvents.filter((event) => event.route === route).length;
}

app.whenReady().then(async () => {
  try {
    const win = await waitForWindow();
    await waitForLoad(win);
    const rendererProbe = await runRendererWritingPath(win);
    const mainRows = [
      { id: 'main_http', status: 'PASS', count: countRoute('main.http.request') + countRoute('main.http.get') },
      { id: 'main_https', status: 'PASS', count: countRoute('main.https.request') + countRoute('main.https.get') },
      { id: 'main_net', status: 'PASS', count: countRoute('main.net.connect') + countRoute('main.net.createConnection') },
      {
        id: 'main_local_ipc_project_lease_guard',
        status: localIpcEvents.length > 0 && localIpcEvents.every((event) => isExpectedProjectLeaseLocalIpcTarget(event.target)) ? 'PASS' : 'FAIL',
        allowedCount: localIpcEvents.length,
      },
      { id: 'main_tls', status: 'PASS', count: countRoute('main.tls.connect') },
      { id: 'electron_net_request', status: electron.net && typeof electron.net.request === 'function' ? 'PASS' : 'UNSUPPORTED', count: countRoute('electron.net.request') },
      { id: 'electron_webRequest_http_https_wss', status: 'PASS', count: countRoute('electron.session.webRequest') },
    ];
    const rows = [
      ...mainRows,
      ...(rendererProbe && Array.isArray(rendererProbe.rows) ? rendererProbe.rows : []),
    ];
    const accountAuthCloudDialogMatches = dialogCalls.filter((entry) => {
      const text = [entry.title, entry.message, entry.detail].filter(Boolean).join(' ').toLowerCase();
      return /account|login|sign in|sign-in|auth|cloud|sync|openai|chatgpt|llm|аккаунт|авторизац|облако|синхронизац/u.test(text);
    });
    const failedRows = rows.filter((item) => item.status === 'FAIL' || (Number.isInteger(item.count) && item.count > 0));
    const payload = {
      ok: rendererProbe && rendererProbe.ok === 1 && failedRows.length === 0 && accountAuthCloudDialogMatches.length === 0 ? 1 : 0,
      appReady: app.isReady(),
      windowCount: BrowserWindow.getAllWindows().length,
      loadComplete: true,
      rendererProbe,
      rows,
      failedRows,
      networkEvents,
      localIpcEvents,
      dialogCalls,
      accountAuthCloudDialogMatches,
    };
    emit(payload);
    app.exit(payload.ok === 1 ? 0 : 1);
  } catch (error) {
    emit({
      ok: 0,
      message: error && error.message ? error.message : String(error),
      networkEvents,
      localIpcEvents,
      dialogCalls,
      windowCount: BrowserWindow.getAllWindows().length,
    });
    app.exit(1);
  }
});
`;
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'security-privacy-writing-path-'));
let child = null;
let timedOut = false;

try {
  const savePath = path.join(tempRoot, 'documents', 'craftsman', 'security-privacy-writing-path.txt');
  const exportPath = path.join(tempRoot, 'documents', 'craftsman', 'security-privacy-writing-path.docx');
  const childPath = path.join(tempRoot, 'security-privacy-writing-path-child.cjs');
  await fs.writeFile(childPath, createChildSource({ tempRoot, savePath, exportPath }), 'utf8');

  const stdoutChunks = [];
  const stderrChunks = [];
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
  const result = parseResult(stdout);

  assert.equal(timedOut, false, stderr || stdout);
  assert.equal(exitState.code, 0, [stderr, stdout].filter(Boolean).join('\n'));
  assert.ok(result, stdout);
  assert.equal(result.ok, 1, JSON.stringify(result, null, 2));
  assert.equal(result.appReady, true);
  assert.equal(result.windowCount, 1);
  assert.equal(result.loadComplete, true);
  assert.deepEqual(result.failedRows, []);
  assert.equal(result.accountAuthCloudDialogMatches.length, 0);
  assert.ok(Array.isArray(result.localIpcEvents));
  assert.ok(result.localIpcEvents.length > 0, JSON.stringify(result.localIpcEvents));
  assert.equal(result.localIpcEvents.every((event) => isExpectedProjectLeaseLocalIpcTarget(event.target)), true);

  const rowsById = new Map(result.rows.map((row) => [row.id, row]));
  for (const id of [
    'renderer_fetch',
    'renderer_XMLHttpRequest',
    'renderer_WebSocket',
    'main_http',
    'main_https',
    'main_net',
    'main_local_ipc_project_lease_guard',
    'main_tls',
    'electron_webRequest_http_https_wss',
    'visible_account_surface',
    'visible_auth_surface',
    'visible_cloud_sync_surface',
    'visible_remote_AI_surface',
    'edit_action_trigger',
  ]) {
    assert.ok(rowsById.has(id), id);
  }

  assert.equal(rowsById.get('edit_action_trigger').status, 'PASS', JSON.stringify(rowsById.get('edit_action_trigger'), null, 2));

  for (const row of result.rows) {
    if (Number.isInteger(row.count)) {
      assert.equal(row.count, 0, JSON.stringify(row, null, 2));
    }
  }

  process.stdout.write(`SECURITY_PRIVACY_WRITING_PATH_SMOKE_SUMMARY:${JSON.stringify({
    ok: true,
    rowCount: result.rows.length,
    dialogCallCount: result.dialogCalls.length,
  })}\n`);
} finally {
  if (child && !child.killed) {
    child.kill('SIGKILL');
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
}
